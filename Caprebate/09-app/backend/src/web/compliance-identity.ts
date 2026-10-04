/**
 * S2 THE IDENTITY STORE, ONE CONSENT HISTORY PER CONTACT, AND THE RETENTION LIST.
 * CRM 8 of 10, 12 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * S2 (Dashboard Data Specification 3.2, 4 and 7; Retention Procedure 2.3B)
 *
 * The people printed on a document a client uploaded, under an opaque person_ref:
 * the name and the contact route AS PRINTED, their role, the document, whether a
 * notice was sent or the exemption relied on. NOTHING LOOKED UP. NEVER EXPORTED —
 * there is no export of it, no list of it and no page that lists names. NEVER IN
 * SEARCH — the rights-request search and CRM 9 of 10's search do not reach it;
 * its own search is logged, term and all, in its own table. NEVER FOR MARKETING.
 * EVERY READ AUDITED. NOTHING CROSSES INTO THE CLAIM RECORD: nothing here writes
 * anywhere but S2.
 *
 * `compliance.identity_read` and `compliance.identity_write` are narrower than the
 * registers' own actions and inherited from nothing.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ONE CONSENT HISTORY PER CONTACT
 *
 * Being contacted and marketing: the capture flags, then every recorded change,
 * with the words asked, the time and the route. Sharing progress with a referring
 * firm is READ from introducer_share_consents, where CRM 5 of 10 keeps it — folded
 * in, never copied.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE RETENTION LIST — A LIST, NOT A DELETER
 *
 * A clock on every record kind the determinations cover and on every kind the
 * earlier CRM phases created, UNSET shown as unset. A date is computed only from
 * an APPROVED parameter, and none is approved: RET-5, RET-6, RET-7 and RET-8 are
 * derived, and RET-1 to RET-4 drafted (Retention Determinations section 12), and
 * every one waits on the data protection officer — RET-1 with the tax adviser.
 * So today every record is UNSCHEDULED — never due, and never kept for ever.
 * WHETHER A TABLE REFUSES A DELETE IS READ FROM THE DATABASE, not claimed: a kind
 * whose table carries a BEFORE DELETE trigger says so instead of offering one.
 * Deletion itself is not automated: whether client-document folders can be kept
 * out of the host's backup is still open, and a file alive in a backup has not
 * been deleted.
 *
 * PHASE 132, 14 SEPTEMBER 2026. THE DELETION LOG IS A KIND ON THIS LIST (migration
 * 022), under RET-3 — six years from the day a deletion is complete everywhere,
 * `verified_at` or the last backup copy's expiry, as Retention Determinations v1.2
 * section 12.4 drafts it. Drafted is not approved, and an entry with backups
 * pending has no date at all while the host's backup cycle is NOT SET. And
 * RET-7's two dates are no longer "not recorded": they are READ per document from
 * its claim and shown on the document versions' line, known or not known —
 * still with no date computed, because RET-7 is not approved.
 */

import type { Db } from '../db.ts';
import { authorise, type Actor } from '../authz.ts';
import { retentionReading, ret7Limbs } from './documents.ts';
import { BACKUP_CYCLE } from './upload-handler-port.ts';
import { MESSAGE_RETENTION_QUESTION } from './message-retention.ts';
import {
  assertComplianceRead, assertComplianceWrite, dateField, has, holdsFor, liveHeldIds, NotFoundAsRefusal, opaqueRef, record, requiredText,
  textField, ukDay, vocabField, words,
  type Check, type ComplianceDeps, type Fields, type HoldRow, type Vocab, type WriteResult,
} from './compliance.ts';

class Refusal extends Error {}

function check<T>(c: Check<T>): T {
  if (!c.ok) throw new Refusal(c.why);
  return c.value;
}

function guarded(fn: () => WriteResult): WriteResult {
  try { return fn(); } catch (e) {
    if (e instanceof Refusal) return { ok: false, why: e.message };
    if (e instanceof NotFoundAsRefusal) throw e;
    if (e instanceof Error && /constraint|RAISE|append-only|never|refus/i.test(e.message)) return { ok: false, why: `Not recorded: ${e.message}` };
    throw e;
  }
}

/* ================================================================== *
 * 1 · S2 — THE IDENTITY STORE
 * ================================================================== */

export const PERSON_ROLES: Vocab = Object.freeze({
  TRANSACTION_PARTY: 'A party to the transaction', ATTESTING_WITNESS: 'An attesting witness',
  INDIVIDUAL_SIGNATORY: 'An individual signatory', PROFESSIONAL_CERTIFIER: 'A professional certifier',
});
export const ROUTE_KINDS: Vocab = Object.freeze({ POSTAL: 'A postal address printed on the document', EMAIL: 'An email address printed on the document' });
export const NOTICE_ROUTES: Vocab = Object.freeze({ DIRECT_POST: 'By post, directly', DIRECT_EMAIL: 'By email, directly', CLIENT_ROUTE: 'Through the client' });
/**
 * PHASE 153c, 4 October 2026 (Word question 162, Sadique's: "May we ask our client to pass our privacy notice to a
 * stranger named in our records?"). Built on our recommendation for him to check: "Through the client" is never the
 * only route. It saves only when the notice is also published on our notices page and that is recorded for the same
 * person — and the record shows both. The database refuses it too (migration 080).
 */
export const PUBLISHED_NOTICE_WORDS = 'Also on our published notices page';

/** Section 4 of the Dashboard Data Specification — shown wherever S2 is. */
export const S2_REFUSALS: readonly string[] = Object.freeze([
  'No special category data, such as health. No setting, role or sign-off can allow it.',
  'No criminal offence data.',
  'No planning comments, replies from consultees or planning letters.',
  'No name in the claim record, the register, the report or the defence pack.',
  'No contact detail that is not printed on the document. We never look one up, add to one, buy one or guess one.',
  'Never used for marketing or to find new clients.',
  'No text we took out of a document.',
  'No name inside a field we copied word for word.',
  'No second copy anywhere. No export, spreadsheet, mail merge or attachment.',
  'No client personal data here. The client’s own people are kept as contacts.',
]);

function assertIdentityRead(actor: Actor, ref = '__identity_store__'): void {
  authorise(actor, 'compliance.identity_read', { type: 'identity_person', id: ref });
}

function assertIdentityWrite(actor: Actor, ref = '__identity_store__'): void {
  authorise(actor, 'compliance.identity_write', { type: 'identity_person', id: ref });
}

export function recordPerson(d: ComplianceDeps, actor: Actor, input: Fields): WriteResult {
  assertIdentityWrite(actor);
  return guarded(() => {
    const doc_id = (input['doc_id'] ?? '').trim();
    if (d.db.get<{ id: string }>('SELECT id FROM documents WHERE id = ?', [doc_id]) === undefined) return { ok: false, why: 'Name the document the person is printed on.' };
    const name = check(requiredText(input['name'], 200, 'The name, as it appears on the document'));
    const role = input['role'] ?? null;
    if (!has(PERSON_ROLES, role)) return { ok: false, why: 'Choose the person’s role on the document. Someone only mentioned in the text is not recorded here.' };
    const route = check(textField(input['contact_route'], 500, 'The contact route, as printed'));
    const kind = check(vocabField(input['contact_route_kind'], ROUTE_KINDS, 'What kind of route it is'));
    if ((route === null) !== (kind === null)) return { ok: false, why: 'A contact route is given with its kind, or neither is.' };
    if (input['route_printed_on_document'] !== 'YES' && route !== null) {
      return { ok: false, why: 'Confirm this contact detail is printed on the document. We never record one we looked up, added to or bought.' };
    }
    const person_ref = opaqueRef('PR');
    const at = d.now();
    d.db.run(
      'INSERT INTO identity_persons (person_ref, name, role, contact_route, contact_route_kind, doc_id, source_record_ref, recorded_by, recorded_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [person_ref, name, role, route, kind, doc_id, doc_id, actor.id, at, at]);
    record(d, actor, 'IDENTITY_RECORDED', 'ALLOWED', 'identity_person', person_ref, { person_ref, doc: doc_id, role });
    return { ok: true, id: person_ref };
  });
}

export function updatePerson(d: ComplianceDeps, actor: Actor, ref: string, input: Fields): WriteResult {
  assertIdentityWrite(actor, ref);
  return guarded(() => {
    const p = d.db.get<{ person_ref: string; notice_template: string | null; exemption_article: string | null }>(
      'SELECT person_ref, notice_template, exemption_article FROM identity_persons WHERE person_ref = ?', [ref]);
    if (p === undefined) throw new NotFoundAsRefusal();
    const what = input['what'] ?? null;
    const at = d.now();
    if (what === 'NOTICE') {
      const template = check(requiredText(input['notice_template'], 60, 'The notice template'));
      const route = input['notice_route'] ?? null;
      if (!has(NOTICE_ROUTES, route)) return { ok: false, why: 'Say how the notice went. “The client said they would forward it” is not a route.' };
      const on = check(dateField(input['notice_sent_on'], 'The date it was sent'));
      if (on === null) return { ok: false, why: 'Give the date it was sent.' };
      const published = input['notice_published_too'] === 'YES';
      if (route === 'CLIENT_ROUTE' && !published) {
        return { ok: false, why: '“Through the client” is never the only route. Record that the notice is also on our published notices page for this person, or send it directly.' };
      }
      d.db.run('UPDATE identity_persons SET notice_template = ?, notice_route = ?, notice_sent_on = ?, notice_published_too = ?, updated_at = ? WHERE person_ref = ?',
        [template, route, on, published ? 1 : 0, at, ref]);
    } else if (what === 'EXEMPTION') {
      const article = check(requiredText(input['exemption_article'], 60, 'The Article relied on'));
      const reason = check(requiredText(input['exemption_reason'], 4000, 'The reason, for this person and this document'));
      d.db.run('UPDATE identity_persons SET exemption_article = ?, exemption_reason = ?, exemption_recorded_by = ?, exemption_recorded_at = ?, updated_at = ? WHERE person_ref = ?',
        [article, reason, actor.id, at, at, ref]);
    } else {
      return { ok: false, why: 'Record a notice sent, or the exemption relied on.' };
    }
    record(d, actor, 'IDENTITY_UPDATED', 'ALLOWED', 'identity_person', ref, { person_ref: ref, what });
    return { ok: true, id: ref };
  });
}

export type PersonView = {
  readonly person_ref: string; readonly name: string; readonly role: string; readonly contact_route: string | null;
  readonly contact_route_kind: string | null; readonly route_group: 'R-A' | 'R-B'; readonly route_group_label: string;
  readonly doc_id: string; readonly doc_type: string | null; readonly received_on: string;
  readonly notice: string; readonly exemption: string; readonly retention: string; readonly holds: readonly HoldRow[];
  readonly rights_requests: readonly { id: string; ref: string }[]; readonly complaints: readonly { id: string; ref: string }[];
  readonly purpose: string; readonly refusals: readonly string[];
};

/** A READ OF ONE PERSON, BY person_ref — audited every time, whoever asks and whatever they then do. */
export function readPerson(d: ComplianceDeps, actor: Actor, ref: string): PersonView {
  assertIdentityRead(actor, ref);
  const p = d.db.get<{
    person_ref: string; name: string; role: string; contact_route: string | null; contact_route_kind: string | null; doc_id: string;
    notice_template: string | null; notice_route: string | null; notice_sent_on: string | null; notice_published_too: number | null; exemption_article: string | null;
    exemption_reason: string | null; doc_type: string | null; doc_created: string; retention_ref: string | null;
  }>(
    'SELECT p.person_ref, p.name, p.role, p.contact_route, p.contact_route_kind, p.doc_id, p.notice_template, p.notice_route, p.notice_sent_on, p.notice_published_too, ' +
      'p.exemption_article, p.exemption_reason, d.type_code AS doc_type, d.created_at AS doc_created, d.retention_ref ' +
      'FROM identity_persons p JOIN documents d ON d.id = p.source_record_ref WHERE p.person_ref = ?', [ref]);
  if (p === undefined) throw new NotFoundAsRefusal();
  record(d, actor, 'IDENTITY_READ', 'ALLOWED', 'identity_person', ref, { person_ref: ref });
  const ra = p.contact_route !== null;
  const clock = retentionReading(p.retention_ref);
  return {
    person_ref: p.person_ref, name: p.name, role: words(PERSON_ROLES, p.role, p.role), contact_route: p.contact_route,
    contact_route_kind: p.contact_route_kind, route_group: ra ? 'R-A' : 'R-B',
    route_group_label: ra ? 'A contact detail is printed, so the exemption does not apply. Send the notice within one month.' : 'No contact detail is printed',
    doc_id: p.doc_id, doc_type: p.doc_type, received_on: ukDay(p.doc_created),
    notice: p.notice_route === null ? 'No notice recorded'
      : `${p.notice_template ?? ''}, ${words(NOTICE_ROUTES, p.notice_route, p.notice_route)}${p.notice_published_too === 1 ? ` + ${PUBLISHED_NOTICE_WORDS.toLowerCase()}` : ''}, ${p.notice_sent_on ?? ''}`,
    exemption: p.exemption_article === null ? 'No exemption recorded' : `${p.exemption_article}: ${p.exemption_reason ?? ''}`,
    retention: `Kept as long as the claim record it points to, and never longer. That record’s deletion date: ${clock.label}`,
    holds: holdsFor(d.db, 'IDENTITY_PERSON', ref),
    rights_requests: d.db.all<{ id: string; ref: string }>('SELECT id, request_ref AS ref FROM rights_requests WHERE person_ref = ?', [ref]),
    complaints: d.db.all<{ id: string; ref: string }>('SELECT id, complaint_ref AS ref FROM complaints WHERE person_ref = ?', [ref]),
    purpose: 'Kept only to tell this person we hold their details (Article 14) and to answer their rights requests.',
    refusals: S2_REFUSALS,
  };
}

/**
 * A NAME SEARCH OF S2, LOGGED AS A SEARCH. The term goes into the search log — S2
 * data under S2's access — and the audit line names that row and the count. The
 * result is person_refs and roles, NEVER NAMES: a name is read by opening one
 * person_ref, which is itself audited.
 */
export function searchIdentity(d: ComplianceDeps, actor: Actor, term: string): { search_id: string; results: { person_ref: string; role: string; doc_id: string }[] } {
  assertIdentityRead(actor);
  const t = term.trim();
  if (t.length < 2 || t.length > 200) throw new Refusal('Search for at least two characters of a name.');
  const escaped = t.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`);
  const pattern = ['%', escaped, '%'].join('');
  const results = d.db.all<{ person_ref: string; role: string; doc_id: string }>(
    "SELECT person_ref, role, doc_id FROM identity_persons WHERE lower(name) LIKE ? ESCAPE '\\' ORDER BY recorded_at LIMIT 100", [pattern])
    .map((r) => ({ ...r, role: words(PERSON_ROLES, r.role, r.role) }));
  const search_id = d.newId();
  d.db.run('INSERT INTO identity_search_log (id, term, result_count, searched_by, searched_at) VALUES (?, ?, ?, ?, ?)', [search_id, t, results.length, actor.id, d.now()]);
  record(d, actor, 'IDENTITY_SEARCHED', 'ALLOWED', 'identity_search', search_id, { search: search_id, results: results.length });
  return { search_id, results };
}

export { Refusal as IdentityRefusal };

/** The store's shape, in counts. There is no list view of S2. */
export function identityCounts(db: Db, actor: Actor): { people: number; route_a: number; route_b: number; notices: number; exemptions: number; searches: number } {
  assertIdentityRead(actor);
  const n = (sql: string): number => db.get<{ n: number }>(sql)?.n ?? 0;
  return {
    people: n('SELECT COUNT(*) AS n FROM identity_persons'),
    route_a: n('SELECT COUNT(*) AS n FROM identity_persons WHERE contact_route IS NOT NULL'),
    route_b: n('SELECT COUNT(*) AS n FROM identity_persons WHERE contact_route IS NULL'),
    notices: n('SELECT COUNT(*) AS n FROM identity_persons WHERE notice_route IS NOT NULL'),
    exemptions: n('SELECT COUNT(*) AS n FROM identity_persons WHERE exemption_article IS NOT NULL'),
    searches: n('SELECT COUNT(*) AS n FROM identity_search_log'),
  };
}

/* ================================================================== *
 * 2 · ONE CONSENT HISTORY PER CONTACT
 * ================================================================== */

export const CONSENT_KINDS: Vocab = Object.freeze({ CONTACT: 'Being contacted', MARKETING: 'Marketing' });
export const CONSENT_DECISIONS: Vocab = Object.freeze({ GIVEN: 'Given', DECLINED: 'Declined', WITHDRAWN: 'Withdrawn' });

export type ConsentLine = { readonly at: string; readonly kind: string; readonly decision: string; readonly wording: string; readonly route: string; readonly source: string };
export type ConsentHistory = {
  readonly contact: { id: string; full_name: string; organisation: string | null };
  readonly current: readonly { kind: string; reading: string }[];
  readonly lines: readonly ConsentLine[];
};

export function consentHistory(db: Db, actor: Actor, contact_id: string): ConsentHistory {
  assertComplianceRead(actor);
  const c = db.get<{ id: string; full_name: string; business_id: string | null; lead_id: string | null; contact_consent: number; marketing_optin: number; created_at: string; org: string | null }>(
    'SELECT c.id, c.full_name, c.business_id, c.lead_id, c.contact_consent, c.marketing_optin, c.created_at, COALESCE(b.name, l.prospect_organisation, i.firm_name) AS org ' +
      'FROM contacts c LEFT JOIN businesses b ON b.id = c.business_id LEFT JOIN leads l ON l.id = c.lead_id LEFT JOIN introducers i ON i.id = c.introducer_id WHERE c.id = ?',
    [contact_id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  const capture = 'The words they were first asked were not recorded';
  const lines: ConsentLine[] = [
    { at: c.created_at, kind: 'CONTACT', decision: c.contact_consent === 1 ? 'GIVEN' : 'NOT GIVEN', wording: capture, route: 'CAPTURE', source: 'When the contact was added' },
    { at: c.created_at, kind: 'MARKETING', decision: c.marketing_optin === 1 ? 'GIVEN' : 'NOT GIVEN — the box is never ticked for anyone', wording: capture, route: 'CAPTURE', source: 'When the contact was added' },
  ];
  for (const e of db.all<{ recorded_at: string; kind: string; decision: string; wording_version: string; route: string }>(
    'SELECT recorded_at, kind, decision, wording_version, route FROM consent_answers WHERE contact_id = ? ORDER BY rowid', [contact_id])) {
    lines.push({ at: e.recorded_at, kind: e.kind, decision: e.decision, wording: e.wording_version, route: e.route, source: 'A recorded answer' });
  }
  const share = db.all<{ recorded_at: string; decision: string; wording_version: string; route: string; firm: string }>(
    'SELECT s.recorded_at, s.decision, s.wording_version, s.route, i.firm_name AS firm FROM introducer_share_consents s JOIN introducers i ON i.id = s.introducer_id ' +
      'WHERE (s.business_id IS NOT NULL AND s.business_id = ?) OR (s.lead_id IS NOT NULL AND s.lead_id = ?) ' +
      'OR (s.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id IS NOT NULL AND l.business_id = ?)) ORDER BY s.rowid',
    [c.business_id, c.lead_id, c.business_id]);
  for (const s of share) {
    lines.push({ at: s.recorded_at, kind: `SHARE_WITH ${s.firm}`, decision: s.decision, wording: s.wording_version, route: s.route, source: 'The referral’s share-progress answer' });
  }
  lines.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const latest = (kind: string): string => {
    const hit = [...lines].reverse().find((l) => l.kind === kind);
    return hit === undefined ? 'never asked' : `${hit.decision.toLowerCase()} (${ukDay(hit.at)}, ${hit.route.toLowerCase().replace(/_/g, ' ')})`;
  };
  const firms = [...new Set(share.map((s) => s.firm))];
  return {
    contact: { id: c.id, full_name: c.full_name, organisation: c.org },
    current: [
      { kind: 'Being contacted', reading: latest('CONTACT') },
      { kind: 'Marketing', reading: latest('MARKETING') },
      ...firms.map((f) => ({ kind: `Sharing progress with ${f}`, reading: latest(`SHARE_WITH ${f}`) })),
      ...(firms.length === 0 ? [{ kind: 'Sharing progress with a referring firm', reading: 'never asked — nothing is shared' }] : []),
    ],
    lines,
  };
}

export function recordConsent(d: ComplianceDeps, actor: Actor, contact_id: string, input: Fields): WriteResult {
  assertComplianceWrite(actor);
  return guarded(() => {
    if (d.db.get<{ id: string }>('SELECT id FROM contacts WHERE id = ?', [contact_id]) === undefined) throw new NotFoundAsRefusal();
    const kind = input['kind'] ?? null;
    if (!has(CONSENT_KINDS, kind)) return { ok: false, why: 'Choose which answer this is. Sharing progress with a firm is recorded on the lead, where it lives.' };
    const decision = input['decision'] ?? null;
    if (!has(CONSENT_DECISIONS, decision)) return { ok: false, why: 'Record what they said — nothing is assumed.' };
    const wording = check(requiredText(input['wording_version'], 60, 'The words they were asked — their version'));
    const id = d.newId();
    const at = d.now();
    d.db.tx(() => {
      d.db.run('INSERT INTO consent_answers (id, contact_id, kind, decision, wording_version, route, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, contact_id, kind, decision, wording, 'STAFF_RECORDED', actor.id, at]);
      const flag = decision === 'GIVEN' ? 1 : 0;
      if (kind === 'CONTACT') d.db.run('UPDATE contacts SET contact_consent = ?, updated_at = ? WHERE id = ?', [flag, at, contact_id]);
      else d.db.run('UPDATE contacts SET marketing_optin = ?, updated_at = ? WHERE id = ?', [flag, at, contact_id]);
    });
    record(d, actor, 'CONSENT_RECORDED', 'ALLOWED', 'contact', contact_id, { consent: id, kind, decision, wording_version: wording });
    return { ok: true, id };
  });
}

/* ================================================================== *
 * 3 · THE RETENTION LIST
 * ================================================================== */

export type ParameterState = 'UNSET' | 'DERIVED_NOT_APPROVED' | 'APPROVED';
export type Parameter = {
  readonly ref: string; readonly period_years: number | null; readonly trigger: string; readonly state: ParameterState; readonly owner: string;
  /** The same rule in plain words — what the retention screen shows. `trigger` stays the exact reference. */
  readonly says: string;
  /** A question the determinations leave to the officer that could change this row. Stated, never decided here. */
  readonly open?: string;
};

/** Retention Determinations 7.1, 8 (Q60), 12.2 and 12.3 — RET-1 and RET-2 are drafted on the recommended answer to this. */
const DISCOVERY_WINDOW_QUESTION =
  'Should tax records be kept for HMRC’s discovery windows? The other choice is the 12-month enquiry window plus a margin. The two tax rules assume yes. If no, the first uses the enquiry window alone, and the second must be worked out again.';

/** Retention Determinations 11.4 point 3 and 13.4 — the officer's decision, not a drafting choice. */
const WHICH_CLOCK_QUESTION =
  'Where two deletion dates apply to a client’s file, which one wins? Today the earlier one does. Section 13.4 of the retention rules suggests the later one. Three points in section 8 could also change it: legal hold, which event starts the count, and the discovery windows.';

/**
 * The determinations, as they stand. NOT ONE IS APPROVED; changing that is the data protection officer's signature, then one line here.
 * Phase 132: RET-1 to RET-4 as Retention Determinations section 12 drafts them (12.2–12.6, restated at 13.2) — drafted, so
 * DERIVED, NOT APPROVED. RET-5, RET-6 and RET-7 checked against sections 2.3, 3.3, 4.3, 11 and 13.2: period, trigger and state agree.
 */
export const RETENTION_PARAMETERS: Readonly<Record<string, Parameter>> = Object.freeze({
  'RET-1': { ref: 'RET-1', period_years: 6, trigger: 'the end of the accounting period or tax year — claim_period_end — or, where later, the close of the enquiry window for the return or amendment (return_filed_at) or of any enquiry opened into it (enquiry_closed_at)', says: 'Six years from the end of the accounting period or tax year. If later, six years from when HMRC’s time to open an enquiry ends, or from when an enquiry closes.', state: 'DERIVED_NOT_APPROVED', owner: 'the tax adviser; the data protection officer approves the shape', open: DISCOVERY_WINDOW_QUESTION },
  'RET-2': { ref: 'RET-2', period_years: 0, trigger: 'nil — no margin after the tax records’ period', says: 'No extra time after the tax records’ six years end.', state: 'DERIVED_NOT_APPROVED', owner: 'the data protection officer', open: DISCOVERY_WINDOW_QUESTION },
  'RET-3': { ref: 'RET-3', period_years: 6, trigger: 'verified_at, or the last backup copy’s expiry', says: 'Six years from the day a deletion is done everywhere: checked as done, or the last backup copy has run out.', state: 'DERIVED_NOT_APPROVED', owner: 'the data protection officer' },
  'RET-4': { ref: 'RET-4', period_years: 6, trigger: 'the final response to the request — responded_at, never received_at — or, where a complaint followed, the complaint’s RET-6 expiry if that is later', says: 'Six years from our final answer to the request, not from when it arrived. If a complaint followed and its date is later, that date.', state: 'DERIVED_NOT_APPROVED', owner: 'the data protection officer' },
  'RET-5': { ref: 'RET-5', period_years: 6, trigger: 'closed_at of the breach register entry', says: 'Six years from when the breach entry was closed.', state: 'DERIVED_NOT_APPROVED', owner: 'the data protection officer' },
  'RET-6': { ref: 'RET-6', period_years: 6, trigger: 'the final response to the complaint — outcome_notified_at', says: 'Six years from our final answer to the complaint.', state: 'DERIVED_NOT_APPROVED', owner: 'the data protection officer' },
  'RET-7': { ref: 'RET-7', period_years: 6, trigger: 'the later of claim_period_end and report_delivered_at', says: 'Six years from the claim period end or the day we sent the client report, whichever is later.', state: retentionReading('RET-7').state, owner: 'the data protection officer, with the tax adviser', open: WHICH_CLOCK_QUESTION },
  'RET-8': { ref: 'RET-8', period_years: null, trigger: 'the retention of the S1 record the person_ref points at', says: 'Kept as long as the claim record it points to.', state: 'DERIVED_NOT_APPROVED', owner: 'the data protection officer' },
});

/** How the host's backup cycle reads on screen. */
const BACKUP_CYCLE_WORDS: Readonly<Record<string, string>> = Object.freeze({ NOT_SET: 'not set yet', UNKNOWN: 'not known', SET: 'set' });

type Kind = {
  readonly kind: string; readonly label: string; readonly table: string; readonly ref: string | null; readonly count: string;
  /** Rows with the moment their clock starts, where the determination gives one this build records. */
  readonly clockRows: string | null; readonly why_unset: string;
};

const NOT_COVERED = 'No rule for this yet. Our retention rules do not cover it';

export const RECORD_KINDS: readonly Kind[] = Object.freeze([
  { kind: 'RIGHTS_REQUESTS', label: 'The rights-request register', table: 'rights_requests', ref: 'RET-4', count: 'SELECT COUNT(*) AS n FROM rights_requests', clockRows: null, why_unset: 'Drafted, not signed yet' },
  { kind: 'COMPLAINTS', label: 'The complaints log', table: 'complaints', ref: 'RET-6', count: 'SELECT COUNT(*) AS n FROM complaints', clockRows: 'SELECT id, outcome_notified_at AS starts FROM complaints', why_unset: 'Not signed yet' },
  { kind: 'BREACH_INCIDENTS', label: 'The breach register', table: 'breach_incidents', ref: 'RET-5', count: 'SELECT COUNT(*) AS n FROM breach_incidents', clockRows: 'SELECT id, closed_at AS starts FROM breach_incidents', why_unset: 'Not signed yet' },
  { kind: 'IDENTITY_PERSON', label: 'People named on documents', table: 'identity_persons', ref: 'RET-8', count: 'SELECT COUNT(*) AS n FROM identity_persons', clockRows: null, why_unset: 'It follows the claim record’s date, and that rule is not signed yet' },
  { kind: 'IDENTITY_SEARCH_LOG', label: 'The log of name searches', table: 'identity_search_log', ref: null, count: 'SELECT COUNT(*) AS n FROM identity_search_log', clockRows: null, why_unset: NOT_COVERED },
  { kind: 'DOCUMENT_VERSIONS', label: 'Client document versions — no date yet, so never due and never kept for ever', table: 'documents', ref: 'RET-7', count: 'SELECT COUNT(*) AS n FROM documents WHERE logical_document_id IS NOT NULL', clockRows: null, why_unset: 'Not signed yet, so no date is worked out. It needs two dates from each document’s claim. One is the accounting period end. The other is the day the client report was first sent. Each is shown as known or not known' },
  { kind: 'LOGICAL_DOCUMENTS', label: 'Documents, with all their versions', table: 'logical_documents', ref: 'RET-7', count: 'SELECT COUNT(*) AS n FROM logical_documents', clockRows: null, why_unset: 'It follows its versions' },
  { kind: 'DOCUMENT_LINKS', label: 'Document links', table: 'document_links', ref: 'RET-7', count: 'SELECT COUNT(*) AS n FROM document_links', clockRows: null, why_unset: 'It follows its versions' },
  // Phase 132 — migration 022. RET-3 needs `verified_at` and, where backups are pending, the last copy's expiry: no date is computed here.
  { kind: 'DELETION_LOG', label: 'The deletion log — one entry per deletion, never a name', table: 'deletion_log', ref: 'RET-3', count: 'SELECT COUNT(*) AS n FROM deletion_log', clockRows: null, why_unset: `Drafted, not signed yet, so no date is worked out. An entry still waiting on backups has no date while the host’s backup cycle is ${BACKUP_CYCLE_WORDS[BACKUP_CYCLE.state] ?? BACKUP_CYCLE.state}` },
  { kind: 'REGISTER_RECORDS', label: 'Register records — people who control a company, and owners who are people', table: 'register_records', ref: 'RET-1', count: 'SELECT COUNT(*) AS n FROM register_records', clockRows: null, why_unset: 'Drafted, not signed yet' },
  { kind: 'LEADS_NEVER_CONVERTED', label: 'Leads that never convert, with a referral’s property basics', table: 'leads', ref: null, count: "SELECT COUNT(*) AS n FROM leads WHERE status <> 'CONVERTED'", clockRows: null, why_unset: NOT_COVERED },
  { kind: 'LEAD_PEOPLE', label: 'A lead’s person with no organisation', table: 'contacts', ref: null, count: 'SELECT COUNT(*) AS n FROM contacts WHERE lead_id IS NOT NULL AND business_id IS NULL', clockRows: null, why_unset: NOT_COVERED },
  { kind: 'STAFF_TASKS', label: 'Staff tasks', table: 'staff_tasks', ref: null, count: 'SELECT COUNT(*) AS n FROM staff_tasks', clockRows: null, why_unset: NOT_COVERED },
  { kind: 'LEAD_FOLLOW_UP_TASKS', label: 'Follow-up tasks on a lead that never converts', table: 'staff_tasks', ref: null, count: "SELECT COUNT(*) AS n FROM staff_tasks t JOIN leads l ON l.id = t.lead_id WHERE l.status <> 'CONVERTED'", clockRows: null, why_unset: NOT_COVERED },
  { kind: 'AUTOMATION_RUNS', label: 'Automation runs', table: 'automation_runs', ref: null, count: 'SELECT COUNT(*) AS n FROM automation_runs', clockRows: null, why_unset: NOT_COVERED },
  { kind: 'OUTBOX_QUEUED', label: 'Emails we send from rules, templates, notices and registers', table: 'outbox', ref: null, count: "SELECT COUNT(*) AS n FROM outbox WHERE kind IN ('NOTIFICATION','TEMPLATE','COMPLIANCE_LETTER')", clockRows: null, why_unset: NOT_COVERED },
  { kind: 'INTRODUCERS', label: 'Introducing firms', table: 'introducers', ref: null, count: 'SELECT COUNT(*) AS n FROM introducers', clockRows: null, why_unset: NOT_COVERED },
  { kind: 'INTRODUCER_PEOPLE', label: 'The people at an introducing firm', table: 'contacts', ref: null, count: 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id IS NOT NULL', clockRows: null, why_unset: NOT_COVERED },
  { kind: 'SHARE_CONSENTS', label: 'The share-progress answers', table: 'introducer_share_consents', ref: null, count: 'SELECT COUNT(*) AS n FROM introducer_share_consents', clockRows: null, why_unset: NOT_COVERED },
  { kind: 'INTRODUCER_NOTICES', label: 'Stage notices to firms', table: 'introducer_notices', ref: null, count: 'SELECT COUNT(*) AS n FROM introducer_notices', clockRows: null, why_unset: NOT_COVERED },
  { kind: 'CONSENT_ANSWERS', label: 'The consent history', table: 'consent_answers', ref: null, count: 'SELECT COUNT(*) AS n FROM consent_answers', clockRows: null, why_unset: NOT_COVERED },
  // Phase 142a — the two chat threads. Their clean-up job is built and switched off (MESSAGE_RETENTION); the period is the officer's.
  { kind: 'CLIENT_MESSAGE', label: 'Messages with the client — the portal’s Messages', table: 'client_messages', ref: null, count: 'SELECT COUNT(*) AS n FROM client_messages', clockRows: null, why_unset: `${NOT_COVERED}. Lakhbir set seven years on 22 September 2026 (“${MESSAGE_RETENTION_QUESTION}”). The clean-up job is on and deletes them after that. The data protection officer has not approved it yet` },
  { kind: 'TEAM_MESSAGE', label: 'Team-only messages — the internal notes', table: 'internal_notes', ref: null, count: 'SELECT COUNT(*) AS n FROM internal_notes', clockRows: null, why_unset: `${NOT_COVERED}. Lakhbir set seven years on 22 September 2026 (“${MESSAGE_RETENTION_QUESTION}”). The clean-up job is on and deletes them after that. The data protection officer has not approved it yet` },
  { kind: 'CDD_RECORDS', label: 'Customer due diligence records', table: 'cdd_checks', ref: null, count: 'SELECT COUNT(*) AS n FROM cdd_checks', clockRows: null, why_unset: `${NOT_COVERED}. Our position paper says five years from the end of the client relationship. That comes from the Money Laundering Regulations, so it applies only if they apply to us` },
]);

export type RetentionLine = {
  readonly kind: string; readonly label: string; readonly ref: string | null; readonly state: ParameterState | 'NOT_COVERED';
  readonly clock: string; readonly records: number; readonly unscheduled: number; readonly held: number;
  readonly due: readonly { id: string; due_on: string }[]; readonly delete: string;
  /** DOCUMENT_VERSIONS only (Phase 132): RET-7's two dates for each document, read from its claim — known or not known. */
  readonly limbs?: readonly DocumentLimbs[];
};

export type DocumentLimbs = {
  readonly logical_document_id: string; readonly claim_period_end: string | null; readonly report_delivered_at: string | null;
  readonly reading: string; readonly why: string;
};

/** Every document's RET-7 dates, as `ret7Limbs` reads them. Shown, never used to compute a date: RET-7 is not approved. */
function documentLimbs(db: Db): DocumentLimbs[] {
  return db.all<{ id: string }>('SELECT id FROM logical_documents ORDER BY created_at ASC, id ASC').map((l) => {
    const r = ret7Limbs(db, l.id);
    return {
      logical_document_id: l.id, claim_period_end: r.claim_period_end, report_delivered_at: r.report_delivered_at, why: r.why,
      reading: `claim period end: ${r.claim_period_end?.slice(0, 10) ?? 'not known'} · report delivered: ${r.report_delivered_at?.slice(0, 10) ?? 'not known'}`,
    };
  });
}

function addYears(day: string, years: number): string {
  const y = Number(day.slice(0, 4)) + years;
  const md = day.slice(5);
  return md === '02-29' ? `${y}-02-28` : `${y}-${md}`;
}

function deleteRefusal(db: Db, table: string): string | null {
  const t = db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND upper(sql) LIKE '%BEFORE DELETE%'", [table]);
  return t === undefined ? null : t.name;
}

/**
 * THE LIST. A record is DUE only where its parameter is APPROVED, its clock has
 * started and the period has run, and no live legal hold is on it. Everything else
 * is UNSCHEDULED — counted, never deleted, never ignored. `parameters` is the
 * determinations as they stand; a test passes an approved one to prove the list
 * can find a record past its clock.
 */
export function retentionList(d: ComplianceDeps, actor: Actor, today: string, parameters: Readonly<Record<string, Parameter>> = RETENTION_PARAMETERS): RetentionLine[] {
  assertComplianceRead(actor);
  const day = ukDay(today);
  const lines = RECORD_KINDS.map((k): RetentionLine => {
    const records = d.db.get<{ n: number }>(k.count)?.n ?? 0;
    const p = k.ref === null ? null : (parameters[k.ref] ?? null);
    const refused = deleteRefusal(d.db, k.table);
    const del = refused === null
      ? 'Nothing is deleted from here. Deleting is not automatic yet. We do not know yet if client folders can be kept out of the host’s backups.'
      : k.table === 'client_messages' || k.table === 'internal_notes'
        ? 'The database blocks deleting these, except by the message clean-up job. That job is on and follows its own rule. Nothing is deleted from here.'
        : 'The database blocks deleting these, so nothing is deleted from here. Someone must first decide about that block.';
    const held = liveHeldIds(d.db, k.kind);
    const limbs = k.kind === 'DOCUMENT_VERSIONS' ? { limbs: documentLimbs(d.db) } : {};
    if (p === null || p.state !== 'APPROVED' || p.period_years === null || k.clockRows === null) {
      return {
        kind: k.kind, label: k.label, ref: k.ref, state: p === null ? 'NOT_COVERED' : p.state,
        clock: p === null ? `No deletion date set yet. ${k.why_unset}.` : `${p.says} ${p.state === 'APPROVED' ? 'Approved, but we do not record when this count starts.' : p.state === 'UNSET' ? 'No rule set yet.' : 'Worked out by us — not yet approved by the data protection officer.'} ${k.why_unset}. No deletion date set yet.${p.open === undefined ? '' : ` Still to be decided by the data protection officer: ${p.open}`}`,
        records, unscheduled: records, held: held.size, due: [], delete: del, ...limbs,
      };
    }
    const rows = d.db.all<{ id: string; starts: string | null }>(k.clockRows);
    const due: { id: string; due_on: string }[] = [];
    let unscheduled = 0;
    for (const r of rows) {
      if (r.starts === null) { unscheduled++; continue; }
      const on = addYears(ukDay(r.starts), p.period_years);
      if (on < day && !held.has(r.id)) due.push({ id: r.id, due_on: on });
    }
    return {
      kind: k.kind, label: k.label, ref: k.ref, state: 'APPROVED',
      clock: `${p.says} Approved.`, records, unscheduled, held: held.size, due, delete: del, ...limbs,
    };
  });
  record(d, actor, 'RETENTION_LIST_READ', 'ALLOWED', 'compliance', 'retention', { kinds: lines.length, due: lines.reduce((n, l) => n + l.due.length, 0) });
  return lines;
}
