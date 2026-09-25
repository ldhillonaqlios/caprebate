/**
 * COMPANIES HOUSE — THE COMPANY, ITS FILINGS, AND (ONLY AFTER SIGNATURE) ITS PEOPLE WITH SIGNIFICANT CONTROL.
 * Phase 146c, 23 September 2026. Switched off: REGISTER_SWITCHES.CH_COMPANY and .CH_PSC are false.
 *
 * Built against the Companies House Public Data API's published documentation (the address and the date read are in
 * the source register's SUPPLIER_DOCS). The key is the user name of HTTP Basic authentication with an empty password,
 * read only through the key file's COMPANIES_HOUSE_API_KEY. Our own limit is the published 600 requests in 5 minutes.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE COMPANY (CH_COMPANY) — up to four calls, in this order
 *
 *   1. /search/companies on the business's name — skipped when the client gave us a company number, which is an
 *      exact key. The results are scored (src/connectors/matching.ts); only one clear ACCEPT is taken.
 *      NO MATCH ROUTES TO ASK, NEVER TO "SOLE TRADER". A name that does not match is far more often a trading name, a
 *      misspelling or a group company's than an unincorporated business (CB_REGISTRY says so in the same words).
 *   2. /company/{company_number} — the profile. Kept: only the fields the source register permits AND the name
 *      exclusion register keeps — company number, status, SIC codes, accounting year end, incorporation date.
 *   3. /company/{company_number}/filing-history, accounts only — what the latest accounts are.
 *   4. The Document API's metadata for that filing (document-api.company-information.service.gov.uk/document/{id},
 *      the address the filing's own `links.document_metadata` gives): an `application/xhtml+xml` resource means an
 *      iXBRL copy exists, which a machine can read; a PDF alone means a picture.
 *   FILLETED ACCOUNTS (no profit and loss account on the public record) AND ACCOUNTS FILED ONLY AS A PICTURE (not
 *   iXBRL) ARE ORDINARY OUTCOMES, NOT ERRORS: the lookup is still READ, and the panel says in words what the accounts
 *   can and cannot tell us. The published documentation has NO filleted flag, so "filleted" is never asserted: a small
 *   company's accounts type is read as "may leave out the profit and loss account" (null, not known). A failed
 *   filing-history or document call does not undo the profile: the company facts are kept, and the panel says the
 *   filings could not be read.
 *
 * No director or secretary field is read from any of the four answers above, and none is ever kept (the name
 * exclusion register, CH_COMPANY's excluded fields `officer_*`, `director_*`, `secretary_*`).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE OFFICERS LIST — READ IN MEMORY, NEVER KEPT. Phase 151b, 25 September 2026.
 *
 * Word question 156, for the data protection officer: "May we briefly check two public register names without saving
 * them?" Answer, closed 24 September 2026: "Yes – best to check who signs and if they have authority". So
 * `companiesHouseOfficers` below reads /company/{company_number}/officers (the published officers list, its address
 * in the source register's SUPPLIER_DOCS) for ONE purpose: does the person who signed our engagement letter appear on
 * it as a current director, or an LLP's designated member? It is handed a test (`isSigner`, from
 * src/connectors/signatory-check.ts) and asks it of each officer's name; it keeps only the answer, YES or NO and a
 * reason code. NO NAME LEAVES THIS LOOKUP: its bundle has no records (so nothing can reach the one door) and its facts
 * are two codes. The officers endpoint's address is recorded on the audit row as a template, as every call's is.
 * It is CH_COMPANY's switch that turns it on — no switch of its own — so it is off with the lookups.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PEOPLE WITH SIGNIFICANT CONTROL (CH_PSC) — name exception 1, condition CA2
 *
 * /company/{company_number}/persons-with-significant-control. The name is kept (exception 1: the common-control test
 * for the Annual Investment Allowance), with the kind, the natures of control and the date ceased — never a date of
 * birth or an address. THIS LOOKUP IS NEVER HANDED A CLIENT BEFORE A SIGNED ENGAGEMENT: CB_REGISTRY lists `psc_name` as
 * post-signature, and `stateUnderGates` keeps it NOT_PERMITTED_YET until the signature record says signed. The
 * connector does not re-decide that; it is simply never reached.
 */

import type { OwnerSecrets } from '../secrets.ts';
import type { CallResult } from './http.ts';
import { defineSteppedConnector, type Bundle, type LookupResult, type StepRequest } from './registers.ts';
import { matchCompanyName, applyPick, pickedNote, PICK_GONE_WHY, MATCH_THRESHOLDS, type PickQuery } from './matching.ts';
import type { SignerTest } from './signatory-check.ts';

export type CompanyQuery = { readonly name: string; readonly company_number: string | null } & PickQuery;
export type PscQuery = { readonly company_number: string | null };

/** A company number as Companies House writes it: eight characters, digits or a two-letter prefix and six digits. */
export function companyNumberOf(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d{1,8}$/.test(t)) return t.padStart(8, '0');
  if (/^[A-Z]{2}\d{6}$/.test(t)) return t;
  return null;
}

function basic(secrets: OwnerSecrets | null): Record<string, string> {
  return { authorization: 'Basic ' + Buffer.from(`${secrets?.get('COMPANIES_HOUSE_API_KEY') ?? ''}:`).toString('base64') };
}

function json(body: string | null): Record<string, unknown> | null {
  if (body === null) return null;
  try {
    const v = JSON.parse(body) as unknown;
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch { return null; }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/* ------------------------------------------------------------------ the latest accounts, in words */

/**
 * WHAT THE LATEST ACCOUNTS CAN TELL US. Companies House's accounts types, read against what a small company may leave
 * off the public record. `profit_and_loss_on_record` is TRUE only for the types that must file one (full, medium,
 * group); FALSE for dormant and micro-entity accounts, which carry none; and NULL — not known — for every small-company
 * type, because those may be filleted (the profit and loss account left off) and the type alone does not say (N4:
 * unknown is not a yes and not a no).
 */
export type AccountsReading = {
  readonly made_up_to: string | null;
  readonly accounts_type: string | null;
  readonly profit_and_loss_on_record: boolean | null;
  /** True where the filing has an iXBRL (machine-readable) document; false where it is a picture only; null when we could not tell. */
  readonly machine_readable: boolean | null;
};

/* The filing-history keys add `full-group` and `medium-group` to the profile's `full`, `medium` and `group`. */
const PL_FILED = new Set(['full', 'medium', 'group', 'full-group', 'medium-group']);
const PL_NOT_FILED = new Set(['dormant', 'micro-entity']);

export function accountsTypeOf(description: string | null): string | null {
  if (description === null) return null;
  const m = /^accounts-with-accounts-type-(.+)$/.exec(description);
  return m ? (m[1] ?? null) : null;
}

/** The latest accounts filing in a filing-history answer, or null. */
export function latestAccountsFiling(history: Record<string, unknown> | null): Record<string, unknown> | null {
  const items = Array.isArray(history?.['items']) ? history['items'] as unknown[] : [];
  return items.map(obj).find((i) => i !== null && i['category'] === 'accounts') ?? null;
}

/**
 * The Document API's id for a filing, from its `links.document_metadata` — only when that link is on Companies House's
 * own Document API host, so a link elsewhere is never followed.
 */
export function documentIdOf(filing: Record<string, unknown> | null): string | null {
  const link = str(obj(filing?.['links'])?.['document_metadata']);
  if (link === null) return null;
  try {
    const u = new URL(link, 'https://document-api.company-information.service.gov.uk');
    if (u.hostname !== 'document-api.company-information.service.gov.uk') return null;
    const m = /^\/document\/([A-Za-z0-9_-]+)$/.exec(u.pathname);
    return m ? (m[1] ?? null) : null;
  } catch { return null; }
}

/** From the Document API's metadata: true if an iXBRL (application/xhtml+xml) copy exists, false if not, null if unreadable. */
export function ixbrlIn(metadata: Record<string, unknown> | null): boolean | null {
  const resources = obj(metadata?.['resources']);
  if (resources === null) return null;
  return Object.prototype.hasOwnProperty.call(resources, 'application/xhtml+xml');
}

export function readAccounts(
  history: Record<string, unknown> | null, profile: Record<string, unknown> | null, ixbrl: boolean | null = null,
): AccountsReading | null {
  const latest = latestAccountsFiling(history);
  const last = obj(obj(profile?.['accounts'])?.['last_accounts']);
  const type = accountsTypeOf(str(latest?.['description'])) ?? str(last?.['type']);
  // `made_up_to` is deprecated in the profile in favour of `period_end_on` (the published documentation says so).
  const made = str(obj(latest?.['description_values'])?.['made_up_date']) ?? str(last?.['period_end_on']) ?? str(last?.['made_up_to']);
  if (latest === null && type === null && made === null) return null;
  const paper = latest !== null && latest['paper_filed'] === true;
  return {
    made_up_to: made,
    accounts_type: type,
    profit_and_loss_on_record: type === null ? null : PL_FILED.has(type) ? true : PL_NOT_FILED.has(type) ? false : null,
    // A paper filing is scanned: a picture, never iXBRL. For an electronic one the Document API says; if it could not
    // be asked or read, it is not known.
    machine_readable: latest === null ? null : paper ? false : ixbrl,
  };
}

function accountsWords(a: AccountsReading | null): string {
  if (a === null) return 'Companies House holds no accounts for this company yet.';
  const when = a.made_up_to === null ? '' : ` made up to ${a.made_up_to}`;
  const kind = a.accounts_type === null ? 'accounts' : `${a.accounts_type.replace(/-/g, ' ')} accounts`;
  const pl = a.profit_and_loss_on_record === true ? 'They include a profit and loss account.'
    : a.profit_and_loss_on_record === false ? 'They carry no profit and loss account, so they show no profit figure.'
      : 'They may leave out the profit and loss account (small companies often do), so we do not rely on them for profit.';
  const pic = a.machine_readable === false ? ' They were filed as a picture, so no figure can be read from them by machine.' : '';
  return `The latest accounts are ${kind}${when}. ${pl}${pic}`;
}

/* ------------------------------------------------------------------ the company */

/** The profile fields the source register permits and the name exclusion register keeps. Nothing else is kept. */
export function companyFields(p: Record<string, unknown>): Record<string, unknown> | null {
  const number = companyNumberOf(str(p['company_number']));
  if (number === null) return null;
  const f: Record<string, unknown> = { company_number: number };
  const status = str(p['company_status']);
  if (status !== null) f.company_status = status;
  if (Array.isArray(p['sic_codes']) && p['sic_codes'].every((x) => typeof x === 'string')) f.sic_codes = (p['sic_codes'] as string[]).join(', ');
  // The published schema gives day and month as integers; a string of digits is read the same way.
  const ard = obj(obj(p['accounts'])?.['accounting_reference_date']);
  const part = (v: unknown): string | null => (typeof v === 'number' && Number.isInteger(v) ? String(v) : str(v));
  const day = part(ard?.['day']); const month = part(ard?.['month']);
  if (day !== null && month !== null && /^\d{1,2}$/.test(day) && /^\d{1,2}$/.test(month)) f.accounts_year_end = `${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const created = str(p['date_of_creation']);
  if (created !== null && /^\d{4}-\d{2}-\d{2}$/.test(created)) f.incorporation_date = created;
  return f;
}

const fail = (call: CallResult, calls: CallResult[]): LookupResult => ({ kind: 'CALL_FAILED', call, calls });

export const companiesHouse = defineSteppedConnector<CompanyQuery>({
  source_id: 'CH_COMPANY', service_id: 'COMPANIES_HOUSE', owner: 'COMPANIES_HOUSE', needs: ['COMPANIES_HOUSE_API_KEY'],
  also: ['COMPANIES_HOUSE_DOCUMENTS'],
  first: (q, s) => ({ endpoint: '/search/companies', query: { q: q.name, items_per_page: '20' }, headers: basic(s) }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    const calls: CallResult[] = [];
    const call = async (r: StepRequest): Promise<CallResult> => { const c = await step({ ...r, headers: basic(secrets) }); calls.push(c); return c; };

    let number = companyNumberOf(q.company_number);
    let how = 'by the company number on the client’s record';
    if (number === null) {
      const search = await call({ endpoint: '/search/companies', query: { q: q.name, items_per_page: '20' } });
      if (search.outcome !== 'OK' || search.body === null) return fail(search, calls);
      const body = json(search.body);
      if (body === null || !Array.isArray(body['items'])) return { kind: 'UNREADABLE', call: search, calls };
      const candidates = (body['items'] as unknown[]).map(obj).flatMap((i) => {
        const n = companyNumberOf(str(i?.['company_number']));
        const t = str(i?.['title']);
        return n !== null && t !== null ? [{ name: t, payload: n }] : [];
      });
      const m = matchCompanyName(q.name, candidates, MATCH_THRESHOLDS.CH_COMPANY);
      /* PHASE 146h: the REVIEW band's list to the back office, or a person's choice back, keyed on the COMPANY
         NUMBER — which is what this lookup reads a profile by, so a choice names a company and not a row. */
      const pick = applyPick(m, q, { profile: 'CH_COMPANY', register: 'Companies House', keyOf: (n) => n });
      if (pick.kind === 'GONE') {
        return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: PICK_GONE_WHY, calls };
      }
      if (pick.kind === 'CHOSEN') {
        number = pick.best.candidate.payload;
        how = pickedNote(pick.best.score, 'Companies House');
      } else if (m.status !== 'ACCEPT' || m.best === null) {
        return {
          kind: 'NOT_MATCHED',
          code: m.status === 'REVIEW' ? 'MATCH_REVIEW' : m.status === 'INSUFFICIENT_INPUT' ? 'INSUFFICIENT_INPUT' : 'NO_MATCH',
          why: `${m.why} — which is not evidence of a sole trader, only that no company matched the name`, calls,
        };
      } else {
        number = m.best.candidate.payload;
        how = `by name, scoring ${(m.top_score ?? 0).toFixed(2)}`;
      }
    }

    const profileCall = await call({ endpoint: '/company/{company_number}', params: { company_number: number } });
    if (profileCall.outcome !== 'OK' || profileCall.body === null) {
      if (profileCall.status === 404) {
        return { kind: 'NOT_MATCHED', code: 'NO_MATCH', why: 'Companies House holds no company with that number — which is not evidence of a sole trader', calls };
      }
      return fail(profileCall, calls);
    }
    const profile = json(profileCall.body);
    const fields = profile === null ? null : companyFields(profile);
    if (fields === null) return { kind: 'UNREADABLE', call: profileCall, calls };

    const history = await call({
      endpoint: '/company/{company_number}/filing-history', params: { company_number: number },
      query: { category: 'accounts', items_per_page: '5' },
    });
    const historyBody = history.outcome === 'OK' ? json(history.body) : null;
    const filing = latestAccountsFiling(historyBody);
    const docId = filing !== null && filing['paper_filed'] !== true ? documentIdOf(filing) : null;
    let ixbrl: boolean | null = null;
    if (docId !== null) {
      const meta = await call({ service_id: 'COMPANIES_HOUSE_DOCUMENTS', endpoint: '/document/{document_id}', params: { document_id: docId } });
      ixbrl = meta.outcome === 'OK' ? ixbrlIn(json(meta.body)) : null;
    }
    const accounts = history.outcome === 'OK' && historyBody !== null ? readAccounts(historyBody, profile, ixbrl) : null;
    const filings = history.outcome !== 'OK' ? ' Its filings could not be read this time.'
      : historyBody === null ? ' Its filings came back in a form we could not read.' : ` ${accountsWords(accounts)}`;

    const bundle: Bundle = {
      records: [{ sourceId: 'CH_COMPANY', entityId: number, fields }],
      facts: { ...fields, ...(accounts === null ? {} : { accounts_filed: accounts }) },
    };
    return { kind: 'READ', bundle, calls, note: `looked up — found ${how}, and we keep the company’s facts and where they came from.${filings}` };
  },
});

/* ------------------------------------------------------------------ people with significant control */

/** One PSC, reduced to the fields the source register permits: the name (exception 1), kind, natures of control, date ceased. */
export function pscFields(item: Record<string, unknown>, company_number: string): Record<string, unknown> | null {
  const name = str(item['name']);
  const kind = str(item['kind']);
  if (name === null || kind === null) return null;
  const f: Record<string, unknown> = { psc_name: name, psc_kind: kind, company_number };
  if (Array.isArray(item['natures_of_control']) && item['natures_of_control'].every((x) => typeof x === 'string')) {
    f.psc_natures_of_control = (item['natures_of_control'] as string[]).join(', ');
  }
  const ceased = str(item['ceased_on']);
  if (ceased !== null) f.psc_ceased_on = ceased;
  return f;
}

export const companiesHousePsc = defineSteppedConnector<PscQuery>({
  source_id: 'CH_PSC', service_id: 'COMPANIES_HOUSE', owner: 'COMPANIES_HOUSE', needs: ['COMPANIES_HOUSE_API_KEY'],
  first: (q, s) => ({ endpoint: '/company/{company_number}/persons-with-significant-control', params: { company_number: q.company_number ?? '' }, headers: basic(s) }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    const number = companyNumberOf(q.company_number);
    if (number === null) {
      return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'we hold no company number for this client, so there is nothing to look up', calls: [] };
    }
    const c = await step({
      endpoint: '/company/{company_number}/persons-with-significant-control', params: { company_number: number },
      query: { items_per_page: '100', start_index: '0', register_view: 'false' }, headers: basic(secrets),
    });
    if (c.outcome !== 'OK' || c.body === null) return fail(c, [c]);
    const body = json(c.body);
    if (body === null || !Array.isArray(body['items'])) return { kind: 'UNREADABLE', call: c, calls: [c] };
    const records = (body['items'] as unknown[]).map(obj).flatMap((i, n) => {
      const f = i === null ? null : pscFields(i, number);
      // The entity id names the company and the position in the list — never the person.
      return f === null ? [] : [{ sourceId: 'CH_PSC', entityId: `${number}/psc/${n + 1}`, fields: f }];
    });
    const listed = (body['items'] as unknown[]).length;
    const unnamed = listed - records.length;
    return {
      kind: 'READ', bundle: { records, facts: { company_number: number, psc_listed: listed } }, calls: [c],
      note: listed === 0
        ? 'looked up — Companies House lists no person with significant control for this company'
        : `looked up — we keep ${records.length} ${records.length === 1 ? 'entry' : 'entries'} for the common-control test, and where they came from` +
          (unnamed > 0 ? `. ${unnamed} more ${unnamed === 1 ? 'is' : 'are'} listed with no name we can keep, so a person must check the common-control test` : ''),
    };
  },
});

/* ------------------------------------------------------------------ the officers, read in memory only (Phase 151b) */

export type OfficersQuery = {
  readonly company_number: string | null;
  /** Word answer 156: the one question asked of each officer's name. The name goes no further than this call. */
  readonly isSigner: SignerTest;
};

/** The roles that can sign for the business: a company's director, an LLP's designated member. Nothing else. */
export const CH_ROLES_THAT_CAN_SIGN: Readonly<Record<string, 'CURRENT_DIRECTOR' | 'DESIGNATED_MEMBER'>> = Object.freeze({
  director: 'CURRENT_DIRECTOR',
  'llp-designated-member': 'DESIGNATED_MEMBER',
});
export const CH_OFFICERS_PAGE_SIZE = 100;
/** Five pages of a hundred. A company with more officers than that is a person's to check. */
export const CH_OFFICERS_MAX_PAGES = 5;

export const companiesHouseOfficers = defineSteppedConnector<OfficersQuery>({
  source_id: 'CH_COMPANY', service_id: 'COMPANIES_HOUSE', owner: 'COMPANIES_HOUSE', needs: ['COMPANIES_HOUSE_API_KEY'],
  first: (q, s) => ({
    endpoint: '/company/{company_number}/officers', params: { company_number: companyNumberOf(q.company_number) ?? '' },
    query: { items_per_page: String(CH_OFFICERS_PAGE_SIZE), start_index: '0' }, headers: basic(s),
  }),
  async lookup(step, q, secrets): Promise<LookupResult> {
    const number = companyNumberOf(q.company_number);
    if (number === null) {
      return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', why: 'we hold no company number for this client, so there is nothing to look up', calls: [] };
    }
    const calls: CallResult[] = [];
    let can: 'CURRENT_DIRECTOR' | 'DESIGNATED_MEMBER' | null = null;
    let left = false;
    let otherRole = false;
    for (let page = 0; page < CH_OFFICERS_MAX_PAGES && can === null; page++) {
      const c = await step({
        endpoint: '/company/{company_number}/officers', params: { company_number: number },
        query: { items_per_page: String(CH_OFFICERS_PAGE_SIZE), start_index: String(page * CH_OFFICERS_PAGE_SIZE) }, headers: basic(secrets),
      });
      calls.push(c);
      if (c.outcome !== 'OK' || c.body === null) {
        if (c.status === 404) return { kind: 'NOT_MATCHED', code: 'NO_MATCH', why: 'Companies House holds no company with that number', calls };
        return fail(c, calls);
      }
      const body = json(c.body);
      if (body === null || !Array.isArray(body['items'])) return { kind: 'UNREADABLE', call: c, calls };
      const items = (body['items'] as unknown[]).map(obj);
      for (const i of items) {
        if (i === null) continue;
        const el = obj(i['name_elements']);
        // Asked, never kept: the test answers true or false, and the name is dropped with the answer.
        const same = q.isSigner({ whole: str(i['name']), surname: str(el?.['surname']), forenames: [str(el?.['forename']), str(el?.['other_forenames'])].filter((x): x is string => x !== null).join(' ') || null });
        if (!same) continue;
        // A date the officer left, where there is one, means they have left. An unknown role is not a role that signs (N4).
        if (str(i['resigned_on']) !== null) { left = true; continue; }
        const role = CH_ROLES_THAT_CAN_SIGN[str(i['officer_role']) ?? ''];
        if (role === undefined) { otherRole = true; continue; }
        can = role;
        break;
      }
      if (can !== null) break;
      const total = typeof body['total_results'] === 'number' ? body['total_results'] : null;
      const seen = page * CH_OFFICERS_PAGE_SIZE + items.length;
      if (items.length < CH_OFFICERS_PAGE_SIZE || (total !== null && seen >= total)) break;
      if (page === CH_OFFICERS_MAX_PAGES - 1) {
        return { kind: 'NOT_MATCHED', code: 'MATCH_REVIEW', why: 'Companies House lists more officers than we read in one go', calls };
      }
    }
    const reason = can ?? (otherRole ? 'ROLE_CANNOT_SIGN' : left ? 'RESIGNED' : 'NOT_LISTED');
    return {
      kind: 'READ', calls,
      bundle: { records: [], facts: { signatory_result: can === null ? 'NO' : 'YES', signatory_reason: reason } },
      note: 'looked up — we kept only yes or no, and no name',
    };
  },
});
