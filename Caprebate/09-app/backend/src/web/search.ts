/**
 * GLOBAL SEARCH — LIMITED BY can() INSIDE THE QUERY, NEVER FILTERED AFTERWARDS.
 * CRM 9 of 10, 12 September 2026.
 *
 * The scope is 09-app/CAPREBATE-CRM-DISPOSITION.md, row 16.1, and the decisions
 * this file takes are that table's Part E from E119. The page is
 * src/web/lists-pages.ts; the proof is test/search.test.ts and
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
 * `NEVER_SEARCHED` lists them, and test/search.test.ts reads this file's source
 * and fails if any of those tables is named in it, then plants a name in each and
 * searches for it.
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { claimObjFor } from './crm.ts';
import { claimName } from './components.ts';
import { anyStageLabel } from './stages.ts';

export type SearchKind = 'ORGANISATION' | 'PROSPECT' | 'CONTACT' | 'PROPERTY' | 'CLAIM' | 'INVOICE' | 'NOTE';

export type SearchHit = {
  readonly kind: SearchKind;
  readonly label: string;
  readonly detail: string;
  readonly href: string;
  /** Phase 134: the company the hit belongs to, where it has one — a hit whose company's name matches ranks first. */
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
  return db.all<{ surveyor_id: string }>(
    'SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', [business_id],
  ).map((r) => r.surveyor_id);
}

/* ------------------------------------------------ the fixed statements */

const ORGANISATIONS_ALL =
  'SELECT b.id, b.name, b.legal_name, b.sector FROM businesses b ' +
  "WHERE lower(b.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(b.legal_name, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(b.company_number, '')) LIKE ? ESCAPE '\\' ORDER BY b.name ASC, b.id ASC LIMIT 25";

const PROSPECTS_ALL =
  'SELECT l.id, l.prospect_organisation FROM leads l ' +
  "WHERE l.business_id IS NULL AND lower(COALESCE(l.prospect_organisation, '')) LIKE ? ESCAPE '\\' " +
  'ORDER BY l.lead_date DESC, l.id ASC LIMIT 25';

/** The client's own contacts, and a prospect's — never a person at an introducing firm. */
const CONTACTS_ALL =
  'SELECT c.id, c.full_name, c.business_id, c.lead_id, b.name AS business_name FROM contacts c ' +
  'LEFT JOIN businesses b ON b.id = c.business_id WHERE c.introducer_id IS NULL ' +
  "AND (lower(c.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.email, '')) LIKE ? ESCAPE '\\') " +
  'ORDER BY c.full_name ASC, c.id ASC LIMIT 25';

const PROPERTIES_ALL =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.town, b.name AS business_name FROM properties p ' +
  'JOIN businesses b ON b.id = p.business_id ' +
  "WHERE lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' " +
  "OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\' ORDER BY p.label ASC, p.id ASC LIMIT 25";

const PROPERTIES_ASSIGNED =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.town, b.name AS business_name FROM properties p ' +
  'JOIN businesses b ON b.id = p.business_id ' +
  'WHERE EXISTS (SELECT 1 FROM surveyor_jobs j WHERE j.business_id = p.business_id AND j.surveyor_id = ?) ' +
  "AND (lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' " +
  "OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\') ORDER BY p.label ASC, p.id ASC LIMIT 25";

// PHASE 134: a claim is found by its reference AND by its company's name, and is named by its company and property.
const CLAIMS_ALL =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, p.label AS property_label FROM claims c ' +
  'JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id ' +
  "WHERE lower(c.claim_ref) LIKE ? ESCAPE '\\' OR lower(b.name) LIKE ? ESCAPE '\\' ORDER BY b.name ASC, c.claim_ref DESC LIMIT 25";

const CLAIMS_ASSIGNED =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, p.label AS property_label FROM claims c ' +
  'JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id ' +
  'WHERE EXISTS (SELECT 1 FROM surveyor_jobs j WHERE j.claim_id = c.id AND j.surveyor_id = ?) ' +
  "AND (lower(c.claim_ref) LIKE ? ESCAPE '\\' OR lower(b.name) LIKE ? ESCAPE '\\') ORDER BY b.name ASC, c.claim_ref DESC LIMIT 25";

/**
 * An invoice by its number — CB-000123, 000123 or 123 — or by the start of it as it is printed: "CB-0", "CB-00012". Never
 * by an amount. The CRM follow-on added the prefix: a whole number was the only thing that found anything.
 */
const INVOICES_ALL =
  'SELECT n.seq, i.id, i.business_id, c.claim_ref, b.name AS business_name FROM invoice_numbers n ' +
  'JOIN invoices i ON i.id = n.invoice_id JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id ' +
  "WHERE n.kind = 'INVOICE' AND (n.seq = ? OR printf('%06d', n.seq) LIKE ?) ORDER BY n.seq ASC LIMIT 25";

const NOTES_ALL =
  'SELECT n.id, n.business_id, n.claim_id, n.property_id, substr(n.body, 1, 160) AS snippet, b.name AS business_name ' +
  'FROM internal_notes n JOIN businesses b ON b.id = n.business_id ' +
  "WHERE lower(n.body) LIKE ? ESCAPE '\\' ORDER BY n.created_at DESC, n.id ASC LIMIT 25";

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
    for (const r of db.all<{ id: string; name: string; legal_name: string | null; sector: string }>(ORGANISATIONS_ALL, [like, like, like])) {
      authorise(actor, 'organisation.read', { type: 'business', id: r.id });
      hits.push({ kind: 'ORGANISATION', label: r.name, detail: r.legal_name ?? r.sector.replace(/_/g, ' '), href: `/staff/clients/${r.id}`, company: r.name });
    }
  }

  if (add('PROSPECT', scopeOf(actor, 'lead.read', { type: 'lead', id: SENTINEL, business_id: null }, null)) === 'ALL') {
    for (const r of db.all<{ id: string; prospect_organisation: string | null }>(PROSPECTS_ALL, [like])) {
      authorise(actor, 'lead.read', { type: 'lead', id: r.id, business_id: null });
      hits.push({ kind: 'PROSPECT', label: r.prospect_organisation ?? 'no name given', detail: 'a new enquiry, with no organisation record yet', href: `/staff/leads/${r.id}` });
    }
  }

  if (add('CONTACT', scopeOf(actor, 'contact.read', { type: 'contact', id: SENTINEL, business_id: SENTINEL }, null)) === 'ALL') {
    for (const r of db.all<{ id: string; full_name: string; business_id: string | null; lead_id: string | null; business_name: string | null }>(CONTACTS_ALL, [like, like])) {
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
      ? db.all<{ id: string; business_id: string; label: string; postcode: string | null; town: string | null; business_name: string }>(PROPERTIES_ALL, [like, like, like, like, compact])
      : db.all<{ id: string; business_id: string; label: string; postcode: string | null; town: string | null; business_name: string }>(PROPERTIES_ASSIGNED, [actor.id, like, like, like, like, compact]);
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
      ? db.all<{ id: string; claim_ref: string; business_id: string; stage: string | null; business_name: string; property_label: string | null }>(CLAIMS_ALL, [like, like])
      : db.all<{ id: string; claim_ref: string; business_id: string; stage: string | null; business_name: string; property_label: string | null }>(CLAIMS_ASSIGNED, [actor.id, like, like]);
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
      for (const r of db.all<{ seq: number; id: string; business_id: string; claim_ref: string; business_name: string }>(
        INVOICES_ALL, [digits === '' ? -1 : Number(digits), `${digits}%`])) {
        authorise(actor, 'invoice.read', { type: 'invoice', id: r.id, business_id: r.business_id });
        hits.push({ kind: 'INVOICE', label: `${r.business_name} — invoice CB-${String(r.seq).padStart(6, '0')}`, detail: r.claim_ref, href: `/staff/finance/${r.id}`, company: r.business_name });
      }
    }
  }

  if (add('NOTE', scopeOf(actor, 'internal_note.read', { type: 'internal_note', id: SENTINEL, business_id: SENTINEL }, null)) === 'ALL') {
    for (const r of db.all<{ id: string; business_id: string; claim_id: string | null; property_id: string | null; snippet: string; business_name: string }>(NOTES_ALL, [like])) {
      authorise(actor, 'internal_note.read', { type: 'internal_note', id: r.id, business_id: r.business_id });
      hits.push({
        kind: 'NOTE', label: r.snippet, detail: `a note on ${r.business_name}`, company: r.business_name,
        href: r.claim_id !== null ? `/staff/claims/${r.claim_id}` : r.property_id !== null ? `/staff/properties/${r.property_id}` : `/staff/clients/${r.business_id}`,
      });
    }
  }

  // PHASE 134: A COMPANY-NAME MATCH RANKS FIRST — the company itself, then anything whose company's name matches, then the
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
 * EVERY STATEMENT SEARCH CAN RUN, exported so test/search.test.ts can assert that none of them names the identity
 * store, a compliance register, a document's content or the estimate. The prose at the top of this file names those
 * tables on purpose, so the test reads these and not the source text.
 */
export const STATEMENTS: readonly string[] = Object.freeze([
  ORGANISATIONS_ALL, PROSPECTS_ALL, CONTACTS_ALL, PROPERTIES_ALL, PROPERTIES_ASSIGNED, CLAIMS_ALL, CLAIMS_ASSIGNED, INVOICES_ALL, NOTES_ALL,
]);

/**
 * PHASE 133a — THE GATE OF THE SEARCH SECTION, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function searchGate(actor: Actor): void {
  authorise(actor, 'backoffice.enter', { type: 'business', id: SENTINEL });
}
