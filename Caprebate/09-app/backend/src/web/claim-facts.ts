/**
 * THE CLAIM'S CAPITAL ALLOWANCES FACTS — CRM 6 of 10, 11 September 2026.
 *
 * The schema is migration 015; the scope is 09-app/CAPREBATE-CRM-DISPOSITION.md
 * Part B2; the figures, the sign-off, the deliverables and aftercare are
 * src/web/claim-record.ts. The routes and pages are src/web/claim-record-pages.ts,
 * which draws what these return and decides nothing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FOUR RULES, AND EVERY FUNCTION BELOW KEEPS ALL OF THEM
 *
 * 1 · DERIVED FIRST, CAPTURED ONLY WHERE NOTHING DERIVES IT. The claimant type is
 *     the organisation's; the jurisdiction is the property's postcode; the
 *     acquisition date is the property's; taxable profit is the client's own
 *     answer read through src/web/funnel-session.ts and its break-even switch;
 *     the amendment window is CB_CASH's; the election's notification clock is
 *     CB_ELECTION's. WHERE A FACT IS DERIVED, THE STORE REFUSES A RECORDED ONE.
 *
 * 2 · EVERY VALUE CARRIES ITS SOURCE, in the source register's pattern
 *     (04-phase-work/phase3/caprebate-source-register.ts): the register's own
 *     source id, its publisher and provenance code, whether it was derived, and
 *     exactly where it was read.
 *
 * 3 · N4. A fact recorded as not known and a fact nobody asked read the same —
 *     `known: false`, `value: null`, the same words — and neither opens a gate.
 *     Every gate reading below is asserted in test/claim-record.test.ts on the
 *     recorded UNKNOWN AND on the absent row.
 *
 * 4 · READERS. The panel is ADMIN's and SALES's (`claim_facts.read`). ACCOUNTING
 *     never reaches it. A SURVEYOR on an assigned job receives only the RELEASED
 *     inputs, assembled forwards by src/payload.ts from `releasedFactReader` —
 *     which can read nothing that is not on that list.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { SOURCES as REGISTER_SOURCES } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';
import { amendmentWindow, ctaSwitchReadings, electionNotifiedInTime, type EngineWindow, type SectorId } from './engine.ts';
import {
  CLAIMANT_TYPES, OWNER_ROLE_TOKENS, WORKSTREAMS, claimObjFor, claimantTypeForGate, isCompanyOrRoleToken, propertyJurisdiction,
} from './crm.ts';
import { FUNNEL_SWITCHES, funnelStateFor, sessionFromFunnel } from './funnel-session.ts';
import { localStamp } from './localtime.ts';
import { formatPence, toPence } from './shown-range.ts';
import type { PostcodeStore } from './postcode-port.ts';

export type FactDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
/** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. A refusal
 *  about the record's own state — a grant already withdrawn, a position already taken — carries none. */
export type FactResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };
export type Fields = Readonly<Record<string, string | null>>;
type Vocab = Readonly<Record<string, string>>;

function has(vocab: Vocab, v: string | null | undefined): v is string {
  return typeof v === 'string' && Object.hasOwn(vocab, v);
}

/** THE ONE WORDING FOR A FACT THAT IS NOT KNOWN — recorded as not known, or never asked. */
export const NOT_KNOWN = 'not known';

/* ================================================================== *
 * 1 · THE VOCABULARIES
 * ================================================================== */

/** The source register's ids a person can speak for when recording a fact. */
export const CAPTURE_SOURCES: Vocab = Object.freeze({
  CLIENT_ANSWER: 'The client told us',
  CLIENT_DOC: 'A document the client supplied',
  SURVEYOR: 'The surveyor',
  CTA: 'The chartered tax adviser',
});

export const YES_NO: Vocab = Object.freeze({ YES: 'Yes', NO: 'No' });

/** Rulebook F's payer classes, in its own words. A class, never a name. */
export const PAYER_CLASSES: Vocab = Object.freeze({
  nhs: 'The NHS', local_authority: 'A local authority', homes_england_gla: 'Homes England or the GLA',
  other_public: 'Another public body', landlord_unconnected: 'A landlord not connected to the client',
  landlord_connected: 'A landlord connected to the client', group_company: 'A company in the client’s group',
  charity: 'A charity', individual: 'An individual — not named here', insurer: 'An insurer', UNKNOWN: 'Not known',
});

export const AMOUNT_BASES: Vocab = Object.freeze({
  agreement: 'The funding agreement', client_estimate: 'The client’s estimate', inferred: 'Inferred', UNKNOWN: 'Not known',
});

export const TRACED: Vocab = Object.freeze({ YES: 'Traced to cost elements', NO: 'Not traced', UNKNOWN: 'Not known' });

type FactKind = 'date' | 'pence' | 'choice' | 'text';

type FactDef = { readonly label: string; readonly kind: FactKind; readonly choices?: Vocab };

/**
 * EVERY FACT THE CLAIM CAPTURES — the migration's trigger holds the same list.
 * A fact a better source derives is NOT here as a key at all (the claimant
 * type, the jurisdiction, the acquisition date, the window), except taxable
 * profit, which is captured only where the client's own answer did not settle it.
 */
export const FACTS: Readonly<Record<string, FactDef>> = Object.freeze({
  ACCOUNTING_PERIOD_START: { label: 'The accounting period the spend falls in — its first day', kind: 'date' },
  ACCOUNTING_PERIOD_END: { label: 'The accounting period the spend falls in — its last day', kind: 'date' },
  SUFFICIENT_PROFIT: {
    label: 'Enough taxable profit for the allowance to produce cash in that period', kind: 'choice',
    choices: Object.freeze({ YES: 'Yes — profitable enough', NO: 'No — around break-even, or a loss' }),
  },
  AIA_HEADROOM: {
    label: 'Annual Investment Allowance headroom left in that period', kind: 'choice',
    choices: Object.freeze({ AVAILABLE: 'Some is left', NONE: 'None is left — used elsewhere or across the group' }),
  },
  AIA_HEADROOM_AMOUNT: { label: 'How much Annual Investment Allowance headroom is left', kind: 'pence' },
  POOL_SPLIT_MAIN: { label: 'Main pool additions', kind: 'pence' },
  POOL_SPLIT_SPECIAL: { label: 'Special rate pool additions', kind: 'pence' },
  SBA_QUALIFYING_EXPENDITURE: { label: 'Structures and buildings allowance qualifying expenditure', kind: 'pence' },
  ELECTION_EXISTS: { label: 'A s.198 or s.199 election affects the property', kind: 'choice', choices: YES_NO },
  ELECTION_SECTION: {
    label: 'The section it was made under', kind: 'choice',
    choices: Object.freeze({ S198: 's.198 — a sale, or a lease premium with no s.183 election', S199: 's.199 — a lease premium with a joint s.183 election' }),
  },
  ELECTION_NOTIFIED_ON: { label: 'The date it was notified to HMRC', kind: 'date' },
  ELECTION_VALUE: { label: 'The value it fixes — a nominal figure is valid', kind: 'pence' },
  ELECTION_ELEMENTS: { label: 'The fixtures it covers, element by element', kind: 'text' },
  ELECTION_TRIBUNAL_APPLIED_ON: { label: 'The date a tribunal application under s.187A(7)(a) was lodged', kind: 'date' },
  ELECTION_TRIBUNAL_STATUS: {
    label: 'Where that tribunal application stands', kind: 'choice',
    choices: Object.freeze({ UNDETERMINED: 'Lodged and not yet determined', DETERMINED: 'Determined' }),
  },
  GRANTS_EXIST: { label: 'A grant or contribution met any of the spend', kind: 'choice', choices: YES_NO },
  ACQUISITION_COSTS: { label: 'Incidental acquisition costs — legal and other fees', kind: 'pence' },
  TRANSACTION_TAX: { label: 'Land transaction tax paid on the purchase', kind: 'pence' },
  BUYER_ALTERATIONS: { label: 'The buyer made their own alterations to install plant', kind: 'choice', choices: YES_NO },
  BUYER_ALTERATIONS_AMOUNT: { label: 'What the buyer’s own alterations cost', kind: 'pence' },
  SCOTTISH_TAXPAYER: { label: 'The claimant is a Scottish taxpayer — where they live, not where the property is', kind: 'choice', choices: YES_NO },
  /* Phase 132 — TMA 1970 s.12ABA(4)(b) and s.12AA(5B): a company partner puts the partnership return on the company
     filing date. Read by amendmentWindowReading for an LLP or a partnership only; migration 024 adds the key. */
  PARTNERSHIP_HAS_COMPANY_MEMBER: {
    label: 'A partner or LLP member is a company — which puts the partnership return on the company filing date', kind: 'choice', choices: YES_NO,
  },
});

/* ================================================================== *
 * 2 · THE SOURCE PATTERN
 * ================================================================== */

export type FactSource = {
  /** The source register's own id, where the source is one of its sources. */
  readonly source_id: string | null;
  readonly publisher: string;
  /** The register's provenance code — CA, CD, SV, CTA, API, DR — or null for a staff record on another page. */
  readonly prov: string | null;
  readonly derived: boolean;
  /** Exactly what was read: a table and row, a module and function, a page. */
  readonly locator: string;
  readonly recorded_at: string | null;
  readonly recorded_by: string | null;
};

export type FactReading = {
  readonly key: string;
  readonly label: string;
  /** True only on a value. A recorded UNKNOWN and silence are both false. */
  readonly known: boolean;
  readonly value: string | null;
  readonly display: string;
  /** Present where something was recorded or derived — a recorded UNKNOWN has one, silence has none. */
  readonly source: FactSource | null;
  /** False where a better source derives the fact, so the store refuses a recorded one. */
  readonly capturable: boolean;
};

function registerSource(id: string, derived: boolean, locator: string, at: string | null, by: string | null): FactSource {
  const s = REGISTER_SOURCES.find((x) => x.source_id === id);
  return {
    source_id: id, publisher: s?.publisher ?? id, prov: derived ? 'DR' : (s?.default_prov ?? null),
    derived, locator, recorded_at: at === null ? null : localStamp(at), recorded_by: by,
  };
}

function staffSource(locator: string): FactSource {
  return { source_id: null, publisher: 'Cap Rebate staff', prov: null, derived: false, locator, recorded_at: null, recorded_by: null };
}

function unknown(key: string, label: string, capturable: boolean, source: FactSource | null): FactReading {
  return { key, label, known: false, value: null, display: NOT_KNOWN, source, capturable };
}

/* ================================================================== *
 * 3 · THE CLAIM, AS THIS FILE READS IT
 * ================================================================== */

type ClaimRow = {
  id: string; business_id: string; property_id: string | null; assessment_id: string | null; workstream: string; stage: string | null;
};

export function loadFactClaim(db: Db, id: string): ClaimRow {
  const c = db.get<ClaimRow>('SELECT id, business_id, property_id, assessment_id, workstream, stage FROM claims WHERE id = ?', [id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  return c;
}

export function factsObj(db: Db, c: { id: string; business_id: string }): Extract<Obj, { type: 'claim_facts' }> {
  return { type: 'claim_facts', id: c.id, business_id: c.business_id, assigned_surveyor_ids: claimObjFor(db, c).assigned_surveyor_ids };
}

type FactRow = {
  id: string; fact_key: string; answer: string; value_text: string | null; value_pence: number | null; value_date: string | null;
  source_id: string; note: string | null; recorded_at: string; recorder: string | null;
};

/** The latest recorded answer per key — by time, then by insertion. */
export function latestFacts(db: Db, claim_id: string): Map<string, FactRow> {
  const rows = db.all<FactRow & { seq: number }>(
    'SELECT f.rowid AS seq, f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
      'u.display_name AS recorder FROM claim_facts f LEFT JOIN users u ON u.id = f.recorded_by WHERE f.claim_id = ? ' +
      'ORDER BY f.recorded_at ASC, f.rowid ASC',
    [claim_id]);
  const out = new Map<string, FactRow>();
  for (const r of rows) out.set(r.fact_key, r);
  return out;
}

function rowValue(r: FactRow): string | null {
  if (r.answer !== 'VALUE') return null;
  return r.value_date ?? r.value_text ?? (r.value_pence === null ? null : String(r.value_pence));
}

/** Phase 139: exported so the Approve box reads a recorded fact exactly as the facts panel does. */
export function captured(facts: Map<string, FactRow>, key: string): FactReading {
  const def = FACTS[key];
  const label = def?.label ?? key;
  const r = facts.get(key);
  if (r === undefined) return unknown(key, label, true, null);
  const src = registerSource(r.source_id, false, `claim_facts row ${r.id}`, r.recorded_at, r.recorder ?? 'a former user');
  const value = rowValue(r);
  if (value === null) return unknown(key, label, true, src);
  const display = def?.kind === 'pence' && r.value_pence !== null ? formatPence(r.value_pence)
    : def?.kind === 'choice' && def.choices !== undefined ? (def.choices[value] ?? value) : value;
  return { key, label, known: true, value, display, source: src, capturable: true };
}

/* ================================================================== *
 * 4 · THE DERIVED FACTS
 * ================================================================== */

/** The organisation's claimant type, derived or recorded there. Never captured on the claim. */
export function claimantTypeReading(db: Db, business_id: string): FactReading {
  const t = claimantTypeForGate(db, business_id);
  const label = 'The claimant, for tax';
  if (t.value === null) return unknown('CLAIMANT_TYPE', label, false, null);
  const derived = t.source === 'the client’s own answer in the assessment';
  return {
    key: 'CLAIMANT_TYPE', label, known: true, value: t.value, display: CLAIMANT_TYPES[t.value] ?? t.value, capturable: false,
    source: derived ? registerSource('CLIENT_ANSWER', false, 'the entity answer in the latest assessment', null, null)
      : staffSource('the organisation record'),
  };
}

export function jurisdictionReading(db: Db, property_id: string | null, store?: PostcodeStore | null): FactReading {
  const j = propertyJurisdiction(db, property_id, store);
  const label = 'Jurisdiction of the property';
  if (j.value === null) return unknown('JURISDICTION', label, false, null);
  return {
    key: 'JURISDICTION', label, known: true, value: j.value, display: j.label, capturable: false,
    source: j.derived ? registerSource('ONS_POSTCODE', true, 'the property’s postcode, through src/web/postcode.ts', null, null)
      : staffSource('the property record'),
  };
}

export function acquisitionDateReading(db: Db, property_id: string | null): FactReading {
  const label = 'The acquisition date';
  if (property_id === null) return unknown('ACQUISITION_DATE', label, false, null);
  const p = db.get<{ acquisition_date: string | null }>('SELECT acquisition_date FROM properties WHERE id = ?', [property_id]);
  if (p?.acquisition_date === null || p?.acquisition_date === undefined) return unknown('ACQUISITION_DATE', label, false, null);
  return { key: 'ACQUISITION_DATE', label, known: true, value: p.acquisition_date, display: p.acquisition_date, capturable: false, source: staffSource('the property record') };
}

/**
 * TAXABLE PROFIT — the client's own answer first, through the funnel mapping and
 * ITS break-even switch, which this reads and never re-implements. Derived only
 * where the mapping actually set `sufficient_profit`; otherwise captured.
 */
export function sufficientProfitReading(db: Db, c: ClaimRow, facts: Map<string, FactRow>): FactReading {
  const def = FACTS['SUFFICIENT_PROFIT'];
  if (c.assessment_id !== null) {
    const a = db.get<{ sector: string }>('SELECT sector FROM assessments WHERE id = ?', [c.assessment_id]);
    if (a !== undefined) {
      const mapped = sessionFromFunnel(a.sector as SectorId, funnelStateFor(db, c.assessment_id));
      const v = (mapped.session as Record<string, unknown>)['sufficient_profit'];
      if (v === 'yes' || v === 'no') {
        const key = v === 'yes' ? 'YES' : 'NO';
        return {
          key: 'SUFFICIENT_PROFIT', label: def?.label ?? 'Taxable profit', known: true, value: key,
          display: def?.choices?.[key] ?? key, capturable: false,
          source: registerSource('CLIENT_ANSWER', false, 'the profit follow-up in the assessment, mapped by src/web/funnel-session.ts', null, null),
        };
      }
    }
  }
  return captured(facts, 'SUFFICIENT_PROFIT');
}

/** The switch the profit reading runs through — read, and shown, never changed here. */
export function breakevenSwitch(): { readonly name: string; readonly on: boolean; readonly question: string } {
  return {
    name: 'breakeven_is_insufficient_profit', on: FUNNEL_SWITCHES.breakeven_is_insufficient_profit,
    question: 'Is "roughly break-even" enough profit for the relief to bite on?',
  };
}

/* ================================================================== *
 * 5 · THE GATE READINGS — asked by src/web/pipeline.ts on every move
 * ================================================================== */

export type WindowState = 'OPEN' | 'CLOSED' | 'UNKNOWN';

export type WindowReading = {
  readonly state: WindowState;
  readonly deadline: string | null;
  readonly why: string;
  readonly assumption: string | null;
};

const SELF_ASSESSMENT_CLAIMANTS: readonly string[] = ['LLP', 'PARTNERSHIP', 'SOLE_TRADER', 'INDIVIDUAL'];

/**
 * THE AMENDMENT WINDOW — DERIVED FROM THE ACQUISITION DATE AND THE ACCOUNTING
 * PERIOD, AND UNKNOWN WHENEVER EITHER IS.
 *
 * Also UNKNOWN where the claimant type is not known, or is a charity — the
 * engine's rule turns on a company against self assessment, and a charity could
 * be either — and where the acquisition date does not fall inside the recorded
 * period, because then the period recorded is not the period the spend is in.
 * The date itself is CB_CASH's. UNKNOWN OPENS NOTHING.
 */
export function amendmentWindowReading(db: Db, c: { business_id: string; property_id: string | null; id: string }, todayIso: string): WindowReading {
  const facts = latestFacts(db, c.id);
  const start = facts.get('ACCOUNTING_PERIOD_START');
  const end = facts.get('ACCOUNTING_PERIOD_END');
  const startV = start === undefined ? null : rowValue(start);
  const endV = end === undefined ? null : rowValue(end);
  const acq = acquisitionDateReading(db, c.property_id);
  const claimant = claimantTypeForGate(db, c.business_id).value;
  const missing: string[] = [];
  if (!acq.known) missing.push('the acquisition date');
  if (startV === null || endV === null) missing.push('the accounting period');
  if (claimant === null) missing.push('the claimant type');
  if (missing.length > 0) {
    return { state: 'UNKNOWN', deadline: null, assumption: null, why: `not known — ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not established, and a window that is not known does not pass` };
  }
  if (claimant !== 'COMPANY' && !SELF_ASSESSMENT_CLAIMANTS.includes(claimant ?? '')) {
    return { state: 'UNKNOWN', deadline: null, assumption: null, why: 'not known — a charity may file either way, so the engine’s rule cannot be chosen for it' };
  }
  if ((acq.value ?? '') < (startV ?? '') || (acq.value ?? '') > (endV ?? '')) {
    return { state: 'UNKNOWN', deadline: null, assumption: null, why: 'not known — the acquisition date is not inside the recorded accounting period, so that is not the period the spend falls in' };
  }
  // PHASE 132 — a partnership or LLP reads whether a partner or member is a company. A row recorded as NOT KNOWN
  // and no row read the same: null, which the engine receives as no answer (N4).
  const partnership = claimant === 'LLP' || claimant === 'PARTNERSHIP';
  const memberRow = partnership ? facts.get('PARTNERSHIP_HAS_COMPANY_MEMBER') : undefined;
  const memberValue = memberRow === undefined ? null : rowValue(memberRow);
  const member = memberValue === 'YES' ? true : memberValue === 'NO' ? false : null;
  const w = amendmentWindow(endV ?? '', claimant === 'COMPANY' ? 'company' : partnership ? 'partnership' : 'self_assessment', todayIso, member);
  if (!w.known && w.ambiguous === true && w.deadlines !== undefined) {
    return {
      state: 'UNKNOWN', deadline: null, assumption: null,
      why: `not known — whether any partner or member is a company is not established, and the window is open until ${w.deadlines.individual} if every partner is an individual but closed on ${w.deadlines.company} if one is a company (TMA 1970 s.12AA(5B) and s.12ABA(4)(b)); a window that is not known does not pass`,
    };
  }
  if (!w.known) return { state: 'UNKNOWN', deadline: null, assumption: null, why: 'not known — the engine could not read the period end as a date' };
  return {
    state: w.in_time ? 'OPEN' : 'CLOSED', deadline: w.deadline,
    why: w.in_time ? `open until ${w.deadline}` : `closed on ${w.deadline}`,
    assumption: windowAssumption(claimant, w),
  };
}

/** The sentence beside a known window: which rule gave the date, and what it rests on. Phase 132. */
function windowAssumption(claimant: string | null, w: Extract<EngineWindow, { known: true }>): string {
  if (claimant === 'COMPANY') return 'the ordinary company rule: twelve months after the filing date — confirm the actual filing date with the accountant';
  if (claimant !== 'LLP' && claimant !== 'PARTNERSHIP') {
    return 'the ordinary self assessment rule: twelve months after the 31 January filing date — confirm the actual filing date with the accountant';
  }
  if (w.member === 'company' && w.company_date_later_not_applied === true) {
    return 'a partner or member is a company, as recorded, and the company date (TMA 1970 s.12AA(5B)) would run later than the individual one for this year end; whether one company partner moves the whole partnership onto it is not yet settled, so the earlier, individual date is used — confirm with the accountant';
  }
  if (w.member === 'company') {
    return 'a partner or member is a company, as recorded, so the return is due on the first anniversary of the period end (TMA 1970 s.12AA(5B) and s.12ABA(4)(b)) and can be amended for twelve months after that; a later filing date under s.12AA(5C), where the notice to file came more than nine months after the period end, is not assumed — confirm with the accountant';
  }
  if (w.member === 'not_known') {
    return 'whether any partner or member is a company is not recorded; the window is the same on the individual date and on the company date (TMA 1970 s.12AA(5B)), so it does not turn on it — record the answer and confirm with the accountant';
  }
  return 'the ordinary self assessment rule for a partnership whose members are all individuals, as recorded — confirm the actual filing date with the accountant';
}

/**
 * THE ELECTION, RESOLVED. The gate out of DATA_GATHERING reads this.
 *
 * RESOLVED ON A RECORDED "NO", OR on a recorded "YES" with its section, its
 * notification date, its value and the fixtures it covers — and a notification
 * the engine's own s.201(1) clock says was IN TIME. Not known, never asked, a
 * missing part, a clock that cannot be read and a late notice all leave it
 * UNRESOLVED, which is the procedure's stop condition.
 */
export function electionResolved(db: Db, c: { id: string; property_id: string | null }): { readonly met: boolean; readonly why: string; readonly in_time: boolean | null } {
  const facts = latestFacts(db, c.id);
  const exists = facts.get('ELECTION_EXISTS');
  const answer = exists === undefined ? null : rowValue(exists);
  if (answer === null) return { met: false, in_time: null, why: 'whether an election affects the property is not known — and not known does not pass' };
  if (answer === 'NO') return { met: true, in_time: null, why: 'no election affects the property, as recorded' };
  // s.201(1A): a tribunal application lodged in time and still UNDETERMINED disapplies the limit — only where BOTH its date
  // and that status are recorded. A status not known is not a pending application, and relieves nothing.
  const tribunalRow = facts.get('ELECTION_TRIBUNAL_APPLIED_ON');
  const statusRow = facts.get('ELECTION_TRIBUNAL_STATUS');
  const tribunalOn = tribunalRow === undefined ? null : rowValue(tribunalRow);
  const pending = tribunalOn !== null && statusRow !== undefined && rowValue(statusRow) === 'UNDETERMINED';
  const need = ['ELECTION_SECTION', 'ELECTION_VALUE', 'ELECTION_ELEMENTS', ...(pending ? [] : ['ELECTION_NOTIFIED_ON'])]
    .filter((k) => { const r = facts.get(k); return r === undefined || rowValue(r) === null; })
    .map((k) => (FACTS[k]?.label ?? k).toLowerCase());
  if (need.length > 0) return { met: false, in_time: null, why: `an election affects the property and is unresolved: not known — ${need.join('; ')}` };
  const acq = acquisitionDateReading(db, c.property_id);
  const notifiedRow = facts.get('ELECTION_NOTIFIED_ON');
  const notified = notifiedRow === undefined ? null : rowValue(notifiedRow);
  const inTime = acq.known ? electionNotifiedInTime(acq.value ?? '', notified, pending ? { applied_on: tribunalOn ?? '' } : null) : null;
  if (inTime === null) return { met: false, in_time: null, why: 'the notice cannot be tested against the two-year limit of s.201(1): the acquisition date, or the date of the notice, is not known' };
  if (!inTime) return { met: false, in_time: false, why: 'the election was notified outside the two-year limit of s.201(1), so it has no effect — a stop condition, not a pass' };
  return {
    met: true, in_time: true,
    why: pending
      ? 'an election affects the property, its section, value and scope are recorded, and a tribunal application lodged in time is undetermined, which disapplies the two-year limit (s.201(1A))'
      : 'an election affects the property, and its section, notice, value and scope are recorded, notified in time',
  };
}

type GrantRow = {
  id: string; kind: string; payer_class: string; amount_pence: number | null; amount_basis: string; traced: string;
  traced_elements: string | null; source_id: string; note: string | null; recorded_at: string; recorder: string | null;
  withdrawn_at: string | null; withdraw_reason: string | null;
};

function grantRows(db: Db, claim_id: string, activeOnly: boolean): GrantRow[] {
  return db.all<GrantRow>(
    'SELECT g.id, g.kind, g.payer_class, g.amount_pence, g.amount_basis, g.traced, g.traced_elements, g.source_id, g.note, ' +
      'g.recorded_at, u.display_name AS recorder, g.withdrawn_at, g.withdraw_reason FROM claim_grants g ' +
      'LEFT JOIN users u ON u.id = g.recorded_by WHERE g.claim_id = ? ORDER BY g.recorded_at ASC, g.rowid ASC',
    [claim_id]).filter((g) => !activeOnly || g.withdrawn_at === null);
}

/**
 * EVERY GRANT TRACED. The gate out of VALUATION reads this.
 *
 * MET ON A RECORDED "NO GRANT", with no grant left recorded against it; or on a
 * recorded "YES" with at least one grant, every one traced to its cost elements.
 * Not known, never asked, a "yes" with nothing recorded, and any grant not
 * traced or not known to be all leave it shut.
 */
export function grantsTraced(db: Db, claim_id: string): { readonly met: boolean; readonly why: string } {
  const facts = latestFacts(db, claim_id);
  const r = facts.get('GRANTS_EXIST');
  const answer = r === undefined ? null : rowValue(r);
  const active = grantRows(db, claim_id, true);
  if (answer === null) return { met: false, why: 'whether a grant or contribution met any of the spend is not known — and not known does not pass' };
  if (answer === 'NO') {
    return active.length === 0
      ? { met: true, why: 'no grant or contribution met the spend, as recorded' }
      : { met: false, why: `the latest answer says no grant, and ${active.length} ${active.length === 1 ? 'is' : 'are'} still recorded — withdraw ${active.length === 1 ? 'it' : 'them'} or correct the answer` };
  }
  if (active.length === 0) return { met: false, why: 'a grant or contribution met some of the spend, and none is recorded yet' };
  const untraced = active.filter((g) => g.traced !== 'YES').length;
  return untraced === 0
    ? { met: true, why: `every grant or contribution — ${active.length} — is traced to its cost elements` }
    : { met: false, why: `${untraced} of ${active.length} grants or contributions ${untraced === 1 ? 'is' : 'are'} not traced to cost elements` };
}

/* ================================================================== *
 * 6 · THE PANEL
 * ================================================================== */

export type GrantLine = {
  readonly id: string; readonly kind: string; readonly payer: string; readonly amount: string; readonly amount_basis: string;
  readonly traced: string; readonly traced_elements: string | null; readonly source: FactSource; readonly withdrawn: string | null;
};

export type OwnerLine = {
  readonly id: string; readonly position: number; readonly owner: string; readonly acquired_on: string | null;
  readonly ceased_on: string | null; readonly claimed: string; readonly source: FactSource;
};

export type SwitchLine = { readonly name: string; readonly on: boolean; readonly says: string };

export type FactsPanel = {
  readonly claimant_type: FactReading;
  readonly scottish_taxpayer: FactReading;
  readonly jurisdiction: FactReading;
  readonly acquisition_date: FactReading;
  readonly accounting_period: { readonly start: FactReading; readonly end: FactReading };
  /** Phase 132, 15 September 2026 — recordable since 14 September and shown nowhere until now. */
  readonly partnership_company_member: FactReading;
  readonly amendment_window: WindowReading;
  readonly taxable_profit: {
    readonly sufficient_profit: FactReading;
    readonly breakeven_switch: { readonly name: string; readonly on: boolean; readonly question: string };
  };
  readonly allowance_headroom: { readonly position: FactReading; readonly amount: FactReading };
  readonly pool_split: { readonly main: FactReading; readonly special: FactReading };
  readonly structures_and_buildings: { readonly workstream: string; readonly qualifying_expenditure: FactReading };
  readonly election: {
    readonly exists: FactReading; readonly section: FactReading; readonly notified_on: FactReading;
    readonly value: FactReading; readonly elements: FactReading;
    readonly resolved: { readonly met: boolean; readonly why: string };
    readonly prior_owner_chain: readonly OwnerLine[];
  };
  readonly grants: { readonly exist: FactReading; readonly lines: readonly GrantLine[]; readonly traced: { readonly met: boolean; readonly why: string } };
  readonly acquisition_costs: { readonly costs: FactReading; readonly transaction_tax: FactReading; readonly switch: SwitchLine };
  readonly buyer_alterations: { readonly made: FactReading; readonly amount: FactReading; readonly switch: SwitchLine };
  readonly may_record: boolean;
};

function switchLine(name: string, says: string): SwitchLine {
  const s = ctaSwitchReadings().find((x) => x.switch === name);
  return { name, on: s?.on === true, says };
}

function ownerRows(db: Db, claim_id: string): OwnerLine[] {
  return db.all<{ id: string; position: number; owner: string; acquired_on: string | null; ceased_on: string | null; claimed: string; source_id: string; recorded_at: string; recorder: string | null }>(
    'SELECT o.id, o.position, o.owner, o.acquired_on, o.ceased_on, o.claimed, o.source_id, o.recorded_at, u.display_name AS recorder ' +
      'FROM claim_owner_chain o LEFT JOIN users u ON u.id = o.recorded_by WHERE o.claim_id = ? AND o.withdrawn_at IS NULL ORDER BY o.position ASC',
    [claim_id]).map((o) => ({
    id: o.id, position: o.position, owner: OWNER_ROLE_TOKENS[o.owner] ?? o.owner, acquired_on: o.acquired_on, ceased_on: o.ceased_on,
    claimed: o.claimed === 'YES' ? 'claimed allowances' : o.claimed === 'NO' ? 'did not claim' : 'whether they claimed is not known',
    source: registerSource(o.source_id, false, `claim_owner_chain row ${o.id}`, o.recorded_at, o.recorder ?? 'a former user'),
  }));
}

/**
 * THE FACTS PANEL, FOR `claim_facts.read` — ADMIN AND SALES. Asked of the claim's
 * facts object; nobody else reaches this function's output.
 */
export function factsPanel(db: Db, actor: Actor, claim_id: string, todayIso: string, opts: { store?: PostcodeStore | null } = {}): FactsPanel {
  const c = loadFactClaim(db, claim_id);
  const obj = factsObj(db, c);
  authorise(actor, 'claim_facts.read', obj);
  const f = latestFacts(db, c.id);
  const grants = grantRows(db, c.id, false);
  return {
    claimant_type: claimantTypeReading(db, c.business_id),
    scottish_taxpayer: captured(f, 'SCOTTISH_TAXPAYER'),
    jurisdiction: jurisdictionReading(db, c.property_id, opts.store),
    acquisition_date: acquisitionDateReading(db, c.property_id),
    accounting_period: { start: captured(f, 'ACCOUNTING_PERIOD_START'), end: captured(f, 'ACCOUNTING_PERIOD_END') },
    partnership_company_member: captured(f, 'PARTNERSHIP_HAS_COMPANY_MEMBER'),
    amendment_window: amendmentWindowReading(db, c, todayIso),
    taxable_profit: { sufficient_profit: sufficientProfitReading(db, c, f), breakeven_switch: breakevenSwitch() },
    allowance_headroom: { position: captured(f, 'AIA_HEADROOM'), amount: captured(f, 'AIA_HEADROOM_AMOUNT') },
    pool_split: { main: captured(f, 'POOL_SPLIT_MAIN'), special: captured(f, 'POOL_SPLIT_SPECIAL') },
    structures_and_buildings: {
      workstream: WORKSTREAMS[c.workstream] ?? c.workstream,
      qualifying_expenditure: captured(f, 'SBA_QUALIFYING_EXPENDITURE'),
    },
    election: {
      exists: captured(f, 'ELECTION_EXISTS'), section: captured(f, 'ELECTION_SECTION'), notified_on: captured(f, 'ELECTION_NOTIFIED_ON'),
      value: captured(f, 'ELECTION_VALUE'), elements: captured(f, 'ELECTION_ELEMENTS'),
      resolved: (({ met, why }) => ({ met, why }))(electionResolved(db, c)),
      prior_owner_chain: ownerRows(db, c.id),
    },
    grants: {
      exist: captured(f, 'GRANTS_EXIST'),
      lines: grants.map((g) => ({
        id: g.id, kind: g.kind === 'GRANT' ? 'Grant' : 'Contribution', payer: PAYER_CLASSES[g.payer_class] ?? g.payer_class,
        amount: g.amount_pence === null ? NOT_KNOWN : formatPence(g.amount_pence), amount_basis: AMOUNT_BASES[g.amount_basis] ?? g.amount_basis,
        traced: TRACED[g.traced] ?? g.traced, traced_elements: g.traced_elements,
        source: registerSource(g.source_id, false, `claim_grants row ${g.id}`, g.recorded_at, g.recorder ?? 'a former user'),
        withdrawn: g.withdrawn_at === null ? null : `withdrawn ${localStamp(g.withdrawn_at)} — ${g.withdraw_reason ?? ''}`,
      })),
      traced: grantsTraced(db, c.id),
    },
    acquisition_costs: {
      costs: captured(f, 'ACQUISITION_COSTS'), transaction_tax: captured(f, 'TRANSACTION_TAX'),
      switch: switchLine('transaction_tax_in_base',
        'OFF — a land transaction tax recorded here is shown and NOT added to the consideration apportioned, until the tax adviser answers "When a building is bought, is the stamp duty part of the price we apportion?"'),
    },
    buyer_alterations: {
      made: captured(f, 'BUYER_ALTERATIONS'), amount: captured(f, 'BUYER_ALTERATIONS_AMOUNT'),
      switch: switchLine('s185_plus_own_s25',
        'OFF — the buyer’s own alteration spend is shown and NOT added on top of an agreed figure, until the tax adviser answers "When someone buys a building, can they add their own alteration costs on top of an agreed figure?"'),
    },
    may_record: can(actor, 'claim_facts.record', obj),
  };
}

/* ================================================================== *
 * 7 · THE RELEASED INPUTS — what src/payload.ts may ask for, and nothing else
 * ================================================================== */

/**
 * A READER THAT CAN ANSWER ONLY FOR THE RELEASED KEYS. It is handed to
 * `assembleReleasedFacts` in src/payload.ts, which walks the released list
 * forwards and asks this for each. There is no case here for a figure, an
 * amount, a window, a profit position or a pool: the reader cannot return one
 * because it has nowhere to read one from.
 */
export function releasedFactReader(db: Db, claim_id: string, opts: { store?: PostcodeStore | null } = {}): (key: string) => unknown {
  const c = loadFactClaim(db, claim_id);
  const f = latestFacts(db, c.id);
  const plain = (r: FactReading): { known: boolean; display: string } => ({ known: r.known, display: r.display });
  return (key: string): unknown => {
    switch (key) {
      case 'claimant_type': return plain(claimantTypeReading(db, c.business_id));
      case 'jurisdiction': return plain(jurisdictionReading(db, c.property_id, opts.store));
      case 'acquisition_date': return plain(acquisitionDateReading(db, c.property_id));
      case 'election_exists': return plain(captured(f, 'ELECTION_EXISTS'));
      case 'election_section': return plain(captured(f, 'ELECTION_SECTION'));
      case 'election_notified_on': return plain(captured(f, 'ELECTION_NOTIFIED_ON'));
      case 'election_elements': return plain(captured(f, 'ELECTION_ELEMENTS'));
      case 'prior_owner_chain': return ownerRows(db, c.id).map((o) => ({ position: o.position, owner: o.owner, claimed: o.claimed }));
      case 'grants_exist': return plain(captured(f, 'GRANTS_EXIST'));
      case 'grants_traced': return grantRows(db, c.id, true).map((g) => ({
        kind: g.kind === 'GRANT' ? 'Grant' : 'Contribution', traced: TRACED[g.traced] ?? g.traced, traced_elements: g.traced_elements,
      }));
      case 'buyer_alterations': return plain(captured(f, 'BUYER_ALTERATIONS'));
      default: return undefined;
    }
  };
}

/* ================================================================== *
 * 8 · RECORDING
 * ================================================================== */

function text(v: string | null | undefined, max: number, what: string): { ok: true; value: string | null } | { ok: false; why: string } {
  if (v === null || v === undefined) return { ok: true, value: null };
  const t = v.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > max) return { ok: false, why: `${what} is longer than we store — ${max.toLocaleString('en-GB')} characters is the limit.` };
  return { ok: true, value: t };
}

export function dateValue(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && Number.isFinite(Date.parse(`${t}T12:00:00.000Z`)) ? t : null;
}

export function penceValue(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const cleaned = v.replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const p = toPence(Number(cleaned));
  return p === null || p <= 0 ? null : p;
}

function factClaimFor(d: FactDeps, actor: Actor, claim_id: string): ClaimRow {
  const c = loadFactClaim(d.db, claim_id);
  authorise(actor, 'claim_facts.record', factsObj(d.db, c));
  return c;
}

/**
 * RECORD ONE FACT — A VALUE, OR "NOT KNOWN".
 *
 * NOT KNOWN IS OFFERED, so nobody is forced to guess to get past the form (N4):
 * an answer is required, and not known is an answer. It passes nothing.
 * A FACT A BETTER SOURCE DERIVES IS REFUSED, with the source named.
 */
export function recordFact(d: FactDeps, actor: Actor, claim_id: string, input: Fields): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const key = input['fact_key'] ?? null;
  if (key === null || !Object.hasOwn(FACTS, key)) {
    return { ok: false, field: 'fact_key', why: 'That is not a fact this claim records here. The claimant type, the jurisdiction and the acquisition date are recorded on the organisation and the property.' };
  }
  const def = FACTS[key] as FactDef;
  if (key === 'SUFFICIENT_PROFIT') {
    const derived = sufficientProfitReading(d.db, c, new Map());
    if (!derived.capturable) {
      return { ok: false, why: `Taxable profit is already known from ${derived.source?.locator ?? 'a better source'}, so it is not asked again.` };
    }
  }
  const source = input['source_id'] ?? null;
  if (!has(CAPTURE_SOURCES, source)) return { ok: false, field: 'source_id', why: 'Say where this came from — the client, their document, the surveyor or the tax adviser.' };
  const answer = input['answer'] ?? null;
  if (answer !== 'VALUE' && answer !== 'UNKNOWN') return { ok: false, field: 'answer', why: 'Give the fact, or record it as not known — not known is an answer, and it passes nothing.' };
  const note = text(input['note'], 2000, 'The note');
  if (!note.ok) return note;
  let vText: string | null = null, vPence: number | null = null, vDate: string | null = null;
  if (answer === 'VALUE') {
    const raw = input['value'] ?? null;
    if (def.kind === 'date') {
      vDate = dateValue(raw);
      if (vDate === null) return { ok: false, field: 'value', why: `${def.label} is a date, as YYYY-MM-DD — or record it as not known.` };
    } else if (def.kind === 'pence') {
      vPence = penceValue(raw);
      if (vPence === null) return { ok: false, field: 'value', why: `${def.label} is an amount in pounds, more than nothing — or record it as not known. Nothing is ever written as zero.` };
    } else if (def.kind === 'choice') {
      if (def.choices === undefined || !has(def.choices, raw)) return { ok: false, field: 'value', why: `${def.label}: choose one of the answers offered, or record it as not known.` };
      vText = raw;
    } else {
      const t = text(raw, 4000, def.label);
      if (!t.ok) return t;
      if (t.value === null) return { ok: false, field: 'value', why: `${def.label}: write it, or record it as not known.` };
      vText = t.value;
    }
  }
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO claim_facts (id, claim_id, fact_key, answer, value_text, value_pence, value_date, source_id, note, recorded_by, recorded_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, c.id, key, answer, vText, vPence, vDate, source, note.value, actor.id, at],
  );
  d.audit.append({
    at, kind: 'CLAIM_FACT_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { fact: key, answer, source, business: c.business_id },
  });
  return { ok: true, id };
}

/** RECORD A GRANT OR CONTRIBUTION. A payer class, never a name; traced only with the elements written. */
export function recordGrant(d: FactDeps, actor: Actor, claim_id: string, input: Fields): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const kind = input['kind'] ?? null;
  if (kind !== 'GRANT' && kind !== 'CONTRIBUTION') return { ok: false, field: 'kind', why: 'Say whether it is a grant or a contribution.' };
  const payer = input['payer_class'] ?? null;
  if (!has(PAYER_CLASSES, payer)) return { ok: false, field: 'payer_class', why: 'Choose who paid it from the list — a class of payer, never a name. Not known is on the list.' };
  const basis = input['amount_basis'] ?? 'UNKNOWN';
  if (!has(AMOUNT_BASES, basis)) return { ok: false, field: 'amount_basis', why: 'Choose where the amount came from, or not known.' };
  const rawAmount = input['amount'] ?? null;
  const amount = rawAmount === null || rawAmount.trim() === '' ? null : penceValue(rawAmount);
  if (rawAmount !== null && rawAmount.trim() !== '' && amount === null) return { ok: false, field: 'amount', why: 'The amount is in pounds and more than nothing — leave it blank if it is not known.' };
  const traced = input['traced'] ?? null;
  if (!has(TRACED, traced)) return { ok: false, field: 'traced', why: 'Say whether it is traced to cost elements — yes, no or not known.' };
  const elements = text(input['traced_elements'], 4000, 'The cost elements');
  if (!elements.ok) return elements;
  if (traced === 'YES' && elements.value === null) return { ok: false, field: 'traced_elements', why: 'A grant is traced only with the cost elements it met written against it — do not pro-rate.' };
  const source = input['source_id'] ?? null;
  if (!has(CAPTURE_SOURCES, source)) return { ok: false, field: 'source_id', why: 'Say where this came from.' };
  const note = text(input['note'], 2000, 'The note');
  if (!note.ok) return note;
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO claim_grants (id, claim_id, kind, payer_class, amount_pence, amount_basis, traced, traced_elements, source_id, note, recorded_by, recorded_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, c.id, kind, payer, amount, basis, traced, elements.value, source, note.value, actor.id, at],
  );
  d.audit.append({
    at, kind: 'CLAIM_GRANT_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { grant: id, grant_kind: kind, traced, business: c.business_id },
  });
  return { ok: true, id };
}

export function withdrawGrant(d: FactDeps, actor: Actor, claim_id: string, grant_id: string, reasonIn: string | null): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const g = d.db.get<{ id: string; withdrawn_at: string | null }>('SELECT id, withdrawn_at FROM claim_grants WHERE id = ? AND claim_id = ?', [grant_id, c.id]);
  if (g === undefined) throw new NotFoundAsRefusal();
  if (g.withdrawn_at !== null) return { ok: false, why: 'That grant is already withdrawn, and keeps its record.' };
  const reason = text(reasonIn, 1000, 'The reason');
  if (!reason.ok) return reason;
  if (reason.value === null) return { ok: false, field: 'reason', why: 'Say why the grant is withdrawn — it keeps its record.' };
  const at = d.now();
  d.db.run('UPDATE claim_grants SET withdrawn_by = ?, withdrawn_at = ?, withdraw_reason = ? WHERE id = ?', [actor.id, at, reason.value, g.id]);
  d.audit.append({
    at, kind: 'CLAIM_GRANT_WITHDRAWN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { grant: g.id, business: c.business_id },
  });
  return { ok: true, id: g.id };
}

/** RECORD AN OWNER IN THE CHAIN — a company name or a role token, never a person (N2). */
export function recordOwner(d: FactDeps, actor: Actor, claim_id: string, input: Fields): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const position = Number(input['position'] ?? '');
  if (!Number.isInteger(position) || position < 1 || position > 20) return { ok: false, field: 'position', why: 'The position counts back from our client: 1 is the seller, 2 the owner before them.' };
  const owner = text(input['owner'], 300, 'The owner');
  if (!owner.ok) return owner;
  if (owner.value === null || !isCompanyOrRoleToken(owner.value)) {
    return {
      ok: false,
      why: 'An owner is recorded as a company name — ending Limited, Ltd, LLP, plc or CIC — or as a role such as INDIVIDUAL_NOT_RECORDED. ' +
        'It is never a person’s name: a person named here would be a third party in the claim record.',
    };
  }
  const rawAcq = input['acquired_on'] ?? null;
  const rawCeased = input['ceased_on'] ?? null;
  const acquired = rawAcq === null || rawAcq.trim() === '' ? null : dateValue(rawAcq);
  const ceased = rawCeased === null || rawCeased.trim() === '' ? null : dateValue(rawCeased);
  if ((rawAcq !== null && rawAcq.trim() !== '' && acquired === null) || (rawCeased !== null && rawCeased.trim() !== '' && ceased === null)) {
    return { ok: false, why: 'Dates are YYYY-MM-DD — leave one blank if it is not known.' };
  }
  const claimed = input['claimed'] ?? null;
  if (claimed !== 'YES' && claimed !== 'NO' && claimed !== 'UNKNOWN') return { ok: false, field: 'claimed', why: 'Say whether that owner claimed allowances — yes, no or not known.' };
  const source = input['source_id'] ?? null;
  if (!has(CAPTURE_SOURCES, source)) return { ok: false, field: 'source_id', why: 'Say where this came from.' };
  const taken = d.db.get<{ id: string }>('SELECT id FROM claim_owner_chain WHERE claim_id = ? AND position = ? AND withdrawn_at IS NULL', [c.id, position]);
  if (taken !== undefined) return { ok: false, why: 'An owner is already recorded at that position. Withdraw it first — it keeps its record.' };
  const id = d.newId();
  const at = d.now();
  d.db.run(
    'INSERT INTO claim_owner_chain (id, claim_id, position, owner, acquired_on, ceased_on, claimed, source_id, recorded_by, recorded_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, c.id, position, owner.value, acquired, ceased, claimed, source, actor.id, at],
  );
  d.audit.append({
    at, kind: 'CLAIM_OWNER_RECORDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { owner_row: id, position, claimed, business: c.business_id },
  });
  return { ok: true, id };
}

export function withdrawOwner(d: FactDeps, actor: Actor, claim_id: string, owner_id: string): FactResult {
  const c = factClaimFor(d, actor, claim_id);
  const o = d.db.get<{ id: string; withdrawn_at: string | null }>('SELECT id, withdrawn_at FROM claim_owner_chain WHERE id = ? AND claim_id = ?', [owner_id, c.id]);
  if (o === undefined) throw new NotFoundAsRefusal();
  if (o.withdrawn_at !== null) return { ok: false, why: 'That owner is already withdrawn, and keeps its record.' };
  const at = d.now();
  d.db.run('UPDATE claim_owner_chain SET withdrawn_by = ?, withdrawn_at = ? WHERE id = ?', [actor.id, at, o.id]);
  d.audit.append({
    at, kind: 'CLAIM_OWNER_WITHDRAWN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'claim', object_id: c.id, detail: { owner_row: o.id, business: c.business_id },
  });
  return { ok: true, id: o.id };
}
