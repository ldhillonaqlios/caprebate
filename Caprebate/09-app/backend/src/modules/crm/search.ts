/**
 * GLOBAL SEARCH — LIMITED BY can INSIDE THE QUERY, NEVER FILTERED AFTERWARDS.
 * CRM 9 of 10.
 *
 * The scope is 09-app/docs/CAPREBATE-CRM-DISPOSITION.md, row 16.1, and the decisions
 * this file takes are that table's Part E from E119. The page is
 * src/shared/lists-pages.ts; the proof is test/core/global-search.test.ts and
 * tools/payload-proof.ts.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT "INSIDE THE QUERY" MEANS HERE, EXACTLY
 *
 * For every kind of record, `can()` is asked FIRST, on an object that stands for
 * the whole kind, twice: once as a record no survey job reaches, and once as one
 * the reader's own job reaches. The answer picks one of a small number of FIXED
 * SQL statements — every row, only the rows a job of the reader's reaches, or no
 * statement at all. A role that may not read a kind is never searched against it,
 * so a row it may not read is never fetched to be thrown away. Every row that
 * comes back is then AUTHORISED — `authorise`, which throws — so a statement that
 * ever returned a row its reader may not read fails loudly instead of being
 * quietly filtered, and a test holds that equivalence.
 *
 * NO ROLE NAME IS READ. The scope comes from the rule table itself.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NEVER SEARCHED, FOR ANY ROLE
 *
 *   the identity store      identity_persons and identity_search_log (migration 017)
 *   the compliance registers rights_requests, complaints, breach_incidents, cdd_checks,
 *                           consent_answers — they keep their own search, searchPerson,
 *                           under compliance.read
 *   document text           no statement here reads a document's content
 *   the estimate            no statement here reads `estimates`
 *   note bodies             for a role without internal_note.read — the kind is not searched
 *
 * `NEVER_SEARCHED` lists them, and test/core/global-search.test.ts reads this file's source
 * and fails if any of those tables is named in it, then plants a name in each and
 * searches for it.
 */

import type { Db } from '../../core/index.ts';
import { authorise, can, type Actor, type Obj } from '../../core/index.ts';
import { claimObjFor } from './crm.ts';
import { claimName } from '../../shared/index.ts';
import { anyStageLabel } from '../../shared/index.ts';
import { listSurveyorJobsSurveyorIdByBusinessIdSurveyorId } from '../survey/index.ts';
import { SEARCH_STATEMENTS, searchClaims, searchClaimsOfIds, searchContacts, searchNotes, searchOrganisations, searchProperties, searchPropertiesOfBusinesses, searchProspects } from '../clients/index.ts';
import type { Param, Row } from '../../core/index.ts';
import { listSurveyorJobsBusinessIdClaimIdBySurveyorId } from '../survey/index.ts';
import { INVOICE_NUMBER_SEARCH, listInvoiceNumbersSeqInvoiceIdBySeqLike } from '../finance/index.ts';
import { listClaimsIdClaimRefStageByIds } from '../claims/index.ts';
import { byId, idsOf, listBusinessesIdNameByIds, lookUp } from '../clients/index.ts';

export type SearchKind = 'ORGANISATION' | 'PROSPECT' | 'CONTACT' | 'PROPERTY' | 'CLAIM' | 'INVOICE' | 'NOTE';

export type SearchHit = {
  readonly kind: SearchKind;
  readonly label: string;
  readonly detail: string;
  readonly href: string;
  /** The company the hit belongs to, where it has one — a hit whose company's name matches ranks first. */
  readonly company?: string;
};

export type SearchScope = { readonly kind: SearchKind; readonly label: string; readonly searched: 'ALL' | 'ASSIGNED' | 'NOT_SEARCHED' };

export type SearchResult = {
  readonly term: string;
  readonly hits: readonly SearchHit[];
  readonly scope: readonly SearchScope[];
  readonly never: readonly string[];
  readonly note: string | null;
};

export const KIND_LABELS: Readonly<Record<SearchKind, string>> = Object.freeze({
  ORGANISATION: 'Organisations — trading name, legal name, company number',
  PROSPECT: 'New enquiries, by the name given',
  CONTACT: 'The client’s own contacts — name and email address',
  PROPERTY: 'Properties — name, address and postcode',
  CLAIM: 'Claims — reference',
  INVOICE: 'Invoices — number',
  NOTE: 'Internal notes — the words',
});

export const NEVER_SEARCHED: readonly string[] = Object.freeze([
  'the identity store — identity_persons and identity_search_log — for anyone',
  'the compliance registers — rights_requests, complaints, breach_incidents, cdd_checks and consent_answers — which keep their own search under compliance.read',
  'the text of any document',
  'the estimate',
  'an internal note, for a role that may not read notes',
]);

export const MIN_TERM = 2;
const LIMIT = 25;

/** A LIKE pattern with the wildcards in the term escaped, so "50%" searches for "50%". */
function pattern(term: string): string {
  return `%${term.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The kind's scope, read from the rule table: every row, only a job's rows, or none. */
function scopeOf(actor: Actor, action: string, whole: Obj, reachedByOwnJob: Obj | null): SearchScope['searched'] {
  if (can(actor, action, whole)) return 'ALL';
  if (reachedByOwnJob !== null && can(actor, action, reachedByOwnJob)) return 'ASSIGNED';
  return 'NOT_SEARCHED';
}

function surveyorsOfBusiness(db: Db, business_id: string): string[] {
  return listSurveyorJobsSurveyorIdByBusinessIdSurveyorId<{ surveyor_id: string }>(db, [business_id]).map((r) => r.surveyor_id);
}

const SENTINEL = '__search__';

/**
 * SEARCH. A term under two characters searches nothing and says so. Every kind the reader may not read is
 * reported as not searched, so a result with nothing in it can be told apart from a search that was never run.
 */
export function search(db: Db, actor: Actor, raw: string): SearchResult {
  authorise(actor, 'backoffice.enter', { type: 'business', id: SENTINEL });
  const term = raw.trim().slice(0, 100);
  const scopes: SearchScope[] = [];
  const hits: SearchHit[] = [];
  const add = (kind: SearchKind, searched: SearchScope['searched']): SearchScope['searched'] => {
    scopes.push({ kind, label: KIND_LABELS[kind], searched });
    return searched;
  };
  if (term.length < MIN_TERM) {
    return { term, hits: [], scope: [], never: NEVER_SEARCHED, note: `Type at least ${MIN_TERM} characters to search.` };
  }
  const like = pattern(term);
  const compact = pattern(term.replace(/\s+/g, ''));

  if (add('ORGANISATION', scopeOf(actor, 'organisation.read', { type: 'business', id: SENTINEL }, null)) === 'ALL') {
    for (const r of searchOrganisations<{ id: string; name: string; legal_name: string | null; sector: string }>(db, [like, like, like])) {
      authorise(actor, 'organisation.read', { type: 'business', id: r.id });
      hits.push({ kind: 'ORGANISATION', label: r.name, detail: r.legal_name ?? r.sector.replace(/_/g, ' '), href: `/staff/clients/${r.id}`, company: r.name });
    }
  }

  if (add('PROSPECT', scopeOf(actor, 'lead.read', { type: 'lead', id: SENTINEL, business_id: null }, null)) === 'ALL') {
    for (const r of searchProspects<{ id: string; prospect_organisation: string | null }>(db, [like])) {
      authorise(actor, 'lead.read', { type: 'lead', id: r.id, business_id: null });
      hits.push({ kind: 'PROSPECT', label: r.prospect_organisation ?? 'no name given', detail: 'a new enquiry, with no organisation record yet', href: `/staff/leads/${r.id}` });
    }
  }

  if (add('CONTACT', scopeOf(actor, 'contact.read', { type: 'contact', id: SENTINEL, business_id: SENTINEL }, null)) === 'ALL') {
    for (const r of searchContacts<{ id: string; full_name: string; business_id: string | null; lead_id: string | null; business_name: string | null }>(db, [like, like])) {
      authorise(actor, 'contact.read', { type: 'contact', id: r.id, business_id: r.business_id });
      hits.push({
        kind: 'CONTACT', label: r.full_name,
        detail: r.business_name === null ? 'a contact on a lead' : `a contact at ${r.business_name}`,
        href: r.business_id !== null ? `/staff/clients/${r.business_id}` : `/staff/leads/${r.lead_id ?? ''}`,
        ...(r.business_name === null ? {} : { company: r.business_name }),
      });
    }
  }

  const properties = add('PROPERTY', scopeOf(actor, 'property.read',
    { type: 'property', id: SENTINEL, business_id: SENTINEL, assigned_surveyor_ids: [] },
    { type: 'property', id: SENTINEL, business_id: SENTINEL, assigned_surveyor_ids: [actor.id] }));
  if (properties !== 'NOT_SEARCHED') {
    const rows = properties === 'ALL'
      ? searchProperties<{ id: string; business_id: string; label: string; postcode: string | null; town: string | null; business_name: string }>(db, [like, like, like, like, compact])
      : searchPropertiesAssigned<{ id: string; business_id: string; label: string; postcode: string | null; town: string | null; business_name: string }>(db, [actor.id, like, like, like, like, compact]);
    for (const r of rows) {
      authorise(actor, 'property.read', { type: 'property', id: r.id, business_id: r.business_id, assigned_surveyor_ids: surveyorsOfBusiness(db, r.business_id) });
      hits.push({
        kind: 'PROPERTY', label: r.label, detail: [r.town, r.postcode, r.business_name].filter((x) => x !== null && x !== '').join(' · '),
        href: `/staff/properties/${r.id}`, company: r.business_name,
      });
    }
  }

  const claims = add('CLAIM', scopeOf(actor, 'claim.read',
    { type: 'claim', id: SENTINEL, business_id: SENTINEL, assigned_surveyor_ids: [] },
    { type: 'claim', id: SENTINEL, business_id: SENTINEL, assigned_surveyor_ids: [actor.id] }));
  if (claims !== 'NOT_SEARCHED') {
    const rows = claims === 'ALL'
      ? searchClaims<{ id: string; claim_ref: string; business_id: string; stage: string | null; business_name: string; property_label: string | null }>(db, [like, like])
      : searchClaimsAssigned<{ id: string; claim_ref: string; business_id: string; stage: string | null; business_name: string; property_label: string | null }>(db, [actor.id, like, like]);
    for (const r of rows) {
      authorise(actor, 'claim.read', claimObjFor(db, r));
      hits.push({
        kind: 'CLAIM', label: claimName(r.business_name, r.property_label), detail: `${anyStageLabel(r.stage)} · ${r.claim_ref}`,
        href: `/staff/claims/${r.id}`, company: r.business_name,
      });
    }
  }

  if (add('INVOICE', scopeOf(actor, 'invoice.read', { type: 'invoice', id: SENTINEL, business_id: SENTINEL }, null)) === 'ALL') {
    // THE WHOLE NUMBER, OR THE START OF THE PRINTED ONE. Digits only reach the pattern, so no wildcard can be typed in.
    const n = /^(cb-?)?(\d{0,9})$/i.exec(term.replace(/\s+/g, ''));
    if (n !== null && ((n[1] ?? '') !== '' || (n[2] ?? '') !== '')) {
      const digits = n[2] ?? '';
      for (const r of searchInvoices<{ seq: number; id: string; business_id: string; claim_ref: string; business_name: string }>(db, [digits === '' ? -1 : Number(digits), `${digits}%`])) {
        authorise(actor, 'invoice.read', { type: 'invoice', id: r.id, business_id: r.business_id });
        hits.push({ kind: 'INVOICE', label: `${r.business_name} — invoice CB-${String(r.seq).padStart(6, '0')}`, detail: r.claim_ref, href: `/staff/finance/${r.id}`, company: r.business_name });
      }
    }
  }

  if (add('NOTE', scopeOf(actor, 'internal_note.read', { type: 'internal_note', id: SENTINEL, business_id: SENTINEL }, null)) === 'ALL') {
    for (const r of searchNotes<{ id: string; business_id: string; claim_id: string | null; property_id: string | null; snippet: string; business_name: string }>(db, [like])) {
      authorise(actor, 'internal_note.read', { type: 'internal_note', id: r.id, business_id: r.business_id });
      hits.push({
        kind: 'NOTE', label: r.snippet, detail: `a note on ${r.business_name}`, company: r.business_name,
        href: r.claim_id !== null ? `/staff/claims/${r.claim_id}` : r.property_id !== null ? `/staff/properties/${r.property_id}` : `/staff/clients/${r.business_id}`,
      });
    }
  }

  // A COMPANY-NAME MATCH RANKS FIRST — the company itself, then anything whose company's name matches, then the
  // rest, each group in the order it was found. The order only; nothing is added or dropped.
  const t = term.toLowerCase();
  const rank = (x: SearchHit): number =>
    x.company !== undefined && x.company.toLowerCase().includes(t) ? (x.kind === 'ORGANISATION' ? 0 : 1) : 2;
  const ranked = hits.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i).map((y) => y.x);
  return { term, hits: ranked, scope: scopes, never: NEVER_SEARCHED, note: ranked.length === 0 ? 'Nothing you may read matches.' : null };
}

/** Exported for the test that proves each statement's row cap is the one this file promises. */
export const RESULT_LIMIT = LIMIT;

/**
 * EVERY STATEMENT SEARCH CAN RUN, for test/core/global-search.test.ts (see SEARCH_STATEMENTS in src/core/data-borrowed.ts, where the
 * statements now live). Phase 161l1: the invoice search is finance's statement (INVOICE_NUMBER_SEARCH); the claim's
 * reference and the company's name it shows are lookups by ids of claims and businesses, and a surveyor's companies
 * and claims are the survey's jobs. Asked for, not read while the files load: finance's statement is not there yet while a
 * loop through the front doors loads.
 */
export function statements(): readonly string[] {
  return [...SEARCH_STATEMENTS, INVOICE_NUMBER_SEARCH];
}

/**
 * THE GATE OF THE SEARCH SECTION, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/core/navigation.ts asks it to decide whether the section is in a login's menu, and test/core/header-and-navigation.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function searchGate(actor: Actor): void {
  authorise(actor, 'backoffice.enter', { type: 'business', id: SENTINEL });
}

// THE SEARCH'S READS THAT JOINED OTHER AREAS' TABLES, SPLIT (Phase 161l1; test/crm/borrowed-split.test.ts). A surveyor's
// properties and claims are those of the companies and claims of their jobs (the survey's), in place of EXISTS on
// surveyor_jobs; an invoice is found by its number in finance, then named by its claim and company.
/** The surveyor's jobs' companies and claims, as lists of ids. */
function jobsOf(db: Db, surveyor: Param): { companies: string; claims: string } {
  const jobs = listSurveyorJobsBusinessIdClaimIdBySurveyorId<{ business_id: unknown; claim_id: unknown }>(db, [surveyor]);
  return { companies: idsOf(jobs.map((j) => j.business_id)), claims: idsOf(jobs.map((j) => j.claim_id)) };
}
export function searchPropertiesAssigned<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const [surveyor = null, ...words] = params;
  return searchPropertiesOfBusinesses<T>(db, [jobsOf(db, surveyor).companies, ...words]);
}
export function searchClaimsAssigned<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const [surveyor = null, ...words] = params;
  return searchClaimsOfIds<T>(db, [jobsOf(db, surveyor).claims, ...words]);
}
export function searchInvoices<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const found = listInvoiceNumbersSeqInvoiceIdBySeqLike<{ seq: unknown; id: unknown; business_id: unknown; claim_id: unknown }>(db, params);
  const claims = byId(listClaimsIdClaimRefStageByIds<{ id: string; claim_ref: unknown }>(db, [idsOf(found.map((n) => n.claim_id))]));
  const companies = byId(listBusinessesIdNameByIds<{ id: string; name: unknown }>(db, [idsOf(found.map((n) => n.business_id))]));
  const rows: Row[] = [];
  for (const n of found) {
    const c = lookUp(claims, n.claim_id), b = lookUp(companies, n.business_id);
    if (c === undefined || b === undefined) continue; // JOIN claims, JOIN businesses
    rows.push({ seq: n.seq, id: n.id, business_id: n.business_id, claim_ref: c.claim_ref, business_name: b.name });
    if (rows.length === LIMIT) break; // ORDER BY n.seq ASC LIMIT 25
  }
  return rows as unknown as T[];
}
