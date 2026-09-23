/**
 * DOCUMENTS ON THE CLAIM — TYPES, VERSIONS, LINKS, REQUESTS, AND WHO MAY READ
 * WHICH. CRM 4 of 10, 11 September 2026.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THERE IS STILL ONE UPLOAD HANDLER
 *
 * Nothing in this file receives a byte, classifies a file, strips it or deletes
 * it. `startDocumentUpload` decides what an upload WILL BE — which document it is
 * a version of, of which type, against which request — and then calls
 * `beginUpload` in src/web/uploads.ts, which calls the handler. The receipt strip
 * runs on every upload of every type exactly as it did, because there is no other
 * way in. `receiveByUpload` runs only after the handler has recorded the strip
 * and the quarantine's discharge, and reads both off the row.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A TYPE WITH NO RECEIPT POLICY CANNOT BE RECEIVED, AND SAYS SO
 *
 * The CRM specification's list — engagement letter, accounts, invoices and the
 * rest — has no receipt policy in the ingestion module, whose own rule is that
 * "a new document type must earn a policy entry before an upload of it can be
 * stored". So those types exist, are configurable, and carry who may read them
 * and their clock; an upload of one is refused BEFORE a link is issued, and a
 * request for one is refused, because nothing could ever receive it. Writing a
 * policy is the data protection officer's decision and the question is in
 * CAPREBATE QUESTIONS. This is build it and switch it off: the day a policy
 * exists, one migration binds the type and nothing here changes.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * NO NAME IS WRITTEN INTO THE CLAIM RECORD (N2)
 *
 * A logical document has no title — it is "Lease 2", its type and its number.
 * A new version's file name is DERIVED, never the client's, because the
 * Dashboard Data Specification's S3 row says filenames are opaque:
 * "smith-lease-2019.pdf is a name in the filesystem". A person named inside a
 * document is the ingestion module's `person_ref` and nothing in this file
 * touches one.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A REQUEST IS A CLIENT QUESTION OF KIND DOCUMENT, AND RECEIVED IS NOT A CLICK
 *
 * REQUESTED, RECEIVED and WITHDRAWN are READ off `client_tasks.state` — OPEN,
 * ANSWERED, WITHDRAWN — never stored beside it. A request reaches ANSWERED only
 * in `receiveByUpload`, naming the version that received it, and migration 013's
 * trigger refuses any other way: the portal's answer button and the business
 * page's "answer here" both refuse a document request before the database does.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor, type Obj } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { localDate, localStamp, ukDate } from './localtime.ts';
import { READ_AND_DELETED } from './originals.ts';
import { RET7, type DocType, type UploadJob } from './upload-handler-port.ts';
import { dueReading, type DueReading } from './tasks.ts';
import { fireAutomation, type RunOutcome } from './automation.ts';
import { beginUpload } from './uploads.ts';
import {
  isVouchAnswer, readingsFor, vouchedFieldFor, vouchesFor, vouchView, writeVouch,
  type ReadingView, type VouchView,
} from './document-reading.ts';
import type { FsObjectStore } from './objectstore.ts';

export type DocDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };
export type Fields = Readonly<Record<string, string | null>>;
/** PHASE 133e (D4, continued): `field` is the posted name a refusal is about, where it is about one. */
export type DocResult = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly why: string; readonly field?: string };
type Vocab = Readonly<Record<string, string>>;
type DocObj = Extract<Obj, { type: 'document' }>;

function has(v: Vocab, k: string | null | undefined): k is string {
  return k !== null && k !== undefined && Object.hasOwn(v, k);
}
function words(v: Vocab, k: string | null | undefined, none: string): string {
  return has(v, k) ? (v[k] ?? none) : none;
}

/* ================================================================== *
 * 1 · THE VOCABULARIES
 * ================================================================== */

export const READERS: Vocab = Object.freeze({
  CLAIM_EVIDENCE: 'Claim evidence — Admin, Sales, a surveyor on an assigned job, and the client',
  CLAIM_TEAM: 'The claim team — Admin and Sales, and the client whose document it is',
  FINANCE: 'Finance — Admin, Accounting, and the client',
  ENGAGEMENT_LETTER: 'The engagement letter — Admin, Sales and the client; Accounting once it is signed; never a surveyor',
});

export const SOURCES: Vocab = Object.freeze({
  CRM_SPECIFICATION: 'our first list of document types',
  STAGE_2_UPLOAD_LIST: 'the Stage 2 upload list',
  EXTRACTION_SPECS: 'our list of documents we read facts from',
  ADMIN: 'added by an administrator',
});

/** THE ONE READING for a type — or a version — with no deletion clock. Never a default, never "kept" (N4). */
export const RETENTION_UNSET =
  'No deletion date set yet. Nothing is deleted on a date, and nothing is promised kept. ' +
  'We list it as not scheduled.';

/** The clocks a type may carry. RET-7 is the only one the Retention Procedure gives a client document. */
export const RETENTION_REFS: Vocab = Object.freeze({ 'RET-7': `The ${RET7.period_years}-year rule for files a client sends` });

export type RetentionReading = {
  readonly ref: string | null;
  readonly state: 'UNSET' | 'DERIVED_NOT_APPROVED' | 'APPROVED';
  /** Whether this clock can produce a date at all. An unapproved one cannot, and says so. */
  readonly computes_a_date: boolean;
  readonly label: string;
};

/**
 * A CLOCK, IN WORDS — AND A REF NOBODY SET READS EXACTLY AS A REF NOT ON THE
 * LIST. The period, the trigger and whether it is approved are the ingestion
 * module's own `RET7`, read through the port, never written here.
 */
export function retentionReading(ref: string | null | undefined): RetentionReading {
  if (ref === null || ref === undefined || !has(RETENTION_REFS, ref)) {
    return { ref: null, state: 'UNSET', computes_a_date: false, label: RETENTION_UNSET };
  }
  // RET7.trigger names the two dates in code words; the same two dates, said plainly.
  const rule = `Deleted ${RET7.period_years} years after the later of two dates: the claim’s period end, or when we sent the report`;
  const approved: boolean = RET7.approved;
  return approved
    ? { ref, state: 'APPROVED', computes_a_date: true, label: `${rule}. Approved. We set the date once both dates are known, and not before.` }
    : {
        ref, state: 'DERIVED_NOT_APPROVED', computes_a_date: false,
        label: `${rule}. Worked out by us — not yet approved by the data protection officer, so no deletion date is set.`,
      };
}

export type Ret7Limbs = {
  /** RET-7 limb (a), as the ingestion module's RawFileRecord takes it — `YYYY-MM-DDT00:00:00.000Z` — or null where not known. */
  readonly claim_period_end: string | null;
  /** RET-7 limb (b), in the same shape, or null where not known. */
  readonly report_delivered_at: string | null;
  readonly why: string;
};

const PERIOD_END_NOT_KNOWN =
  'the claim’s period end is not known yet (not known and never given count the same)';
const REPORT_NOT_DELIVERED =
  'we have not sent the client report yet, so that date is not known — a draft does not count';

/**
 * RET-7'S TWO DATES, READ FROM THE CLAIM — DERIVED, NOT STORED. Phase 132, 14 September 2026.
 *
 * The ingestion module's RawFileRecord declares `claim_period_end` and `report_delivered_at` and nothing ever filled
 * them. Both are already on record, so neither gets a column (the house rule READ, NOT STORED — migration 017 and
 * src/web/claim-record.ts): a document is followed through its LIVE claim link to ONE claim, and
 *
 *   claim_period_end     that claim's ACCOUNTING_PERIOD_END fact — the LATEST row being the answer, as every claim fact
 *                        is read (src/web/claim-facts.ts). A VALUE gives the date; UNKNOWN reads null, exactly as no row
 *                        does (N4).
 *   report_delivered_at  the EARLIEST issue date of the claim's CLIENT_REPORT, issued or since superseded. AN ASSUMPTION,
 *                        NAMED: RET-7 runs from "the later of" the two dates, so the earliest delivery is the reading that
 *                        can only bring a deletion date forward — the fail-closed one for a retention rule. Which delivery
 *                        the Retention Determinations mean is theirs to say. A draft is not a delivery, and a reasoned
 *                        negative is not read as the report.
 *
 * NULL, WITH ITS REASON, where the document is linked to no claim (a property link names no claim), to more than one
 * (which claim's dates govern is not decided here), or where a date is not known. NOTHING HERE COMPUTES A DELETION DATE:
 * RET-7 is not approved, and `deletionDueAt` in the ingestion module — and its rule that the EARLIER of two clocks
 * governs — is where a date would come from, and is unchanged.
 */
/**
 * PHASE 142a — ONE CLAIM'S TWO FILE DATES, as `ret7Limbs` reads them for a document and as the message clean-up job
 * (src/web/message-retention.ts) reads them for a company's messages: the accounting period end (the latest
 * ACCOUNTING_PERIOD_END fact, a VALUE only — UNKNOWN reads null, as no row does, N4) and the EARLIEST issue of the client
 * report. Each YYYY-MM-DD, or null where not known. One reader, so the two can never disagree about a claim.
 */
export function claimFileDays(db: Db, claim_id: string): { period_end: string | null; report_first: string | null } {
  const end = db.get<{ answer: string; value_date: string | null }>(
    "SELECT answer, value_date FROM claim_facts WHERE claim_id = ? AND fact_key = 'ACCOUNTING_PERIOD_END' ORDER BY recorded_at DESC, rowid DESC LIMIT 1",
    [claim_id]);
  const report = db.get<{ first: string | null }>(
    "SELECT MIN(issued_on) AS first FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' AND state IN ('ISSUED','SUPERSEDED')",
    [claim_id]);
  return { period_end: end !== undefined && end.answer === 'VALUE' ? end.value_date : null, report_first: report?.first ?? null };
}

export function ret7Limbs(db: Db, logical_document_id: string): Ret7Limbs {
  const claims = db.all<{ claim_id: string }>(
    'SELECT DISTINCT claim_id FROM document_links WHERE logical_document_id = ? AND unlinked_at IS NULL AND claim_id IS NOT NULL ORDER BY claim_id',
    [logical_document_id]);
  if (claims.length === 0) {
    return { claim_period_end: null, report_delivered_at: null, why: 'the document is linked to no claim, so neither date is known' };
  }
  if (claims.length > 1) {
    return {
      claim_period_end: null, report_delivered_at: null,
      why: `the document is linked to ${claims.length} claims, and we have not decided whose dates count — both are not known`,
    };
  }
  const claim_id = claims[0]?.claim_id ?? '';
  const { period_end: periodDay, report_first: reportDay } = claimFileDays(db, claim_id);
  const negativeOnly = reportDay === null && db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM claim_deliverables WHERE claim_id = ? AND kind = 'REASONED_NEGATIVE' AND state IN ('ISSUED','SUPERSEDED')",
    [claim_id])?.n !== 0;
  return {
    claim_period_end: periodDay === null ? null : `${periodDay}T00:00:00.000Z`,
    report_delivered_at: reportDay === null ? null : `${reportDay}T00:00:00.000Z`,
    why: [
      periodDay === null ? PERIOD_END_NOT_KNOWN : `the claim’s period ends on ${periodDay}`,
      reportDay !== null ? `the client report was first issued on ${reportDay}`
        : negativeOnly ? 'we only sent a letter saying there is no claim. That does not count as the report, so the date is not known'
          : REPORT_NOT_DELIVERED,
    ].join('; '),
  };
}

export type StripReading = {
  /** Whether an upload of this type can be received at all. */
  readonly receivable: boolean;
  /** The upload handler's own document type whose receipt policy strips it. */
  readonly policy: string | null;
  readonly label: string;
};

export const NO_RECEIPT_POLICY =
  'We have no rule yet for reading this kind of file, so we cannot accept one. You cannot send an upload link for it or ask for it. ' +
  'The data protection officer sets that rule. Until then, this type is listed but switched off.';

export function stripReading(handler_type: string | null): StripReading {
  if (handler_type === null) return { receivable: false, policy: null, label: NO_RECEIPT_POLICY };
  return {
    receivable: true, policy: handler_type,
    label: `We read every file of this type using our “${handler_type.replace(/_/g, ' ').toLowerCase()}” rules. ` +
      'We take out what we must not keep before we save anything. Then we delete the file, and record that we did.',
  };
}

/* ================================================================== *
 * 2 · TYPES — configurable by ADMIN
 * ================================================================== */

const TYPE_SELECT =
  'SELECT code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at FROM document_types ';

type TypeRow = {
  code: string; label: string; source: string; handler_type: string | null; readers: string; carries_value: number;
  retention_ref: string | null; active: number; ord: number; note: string; created_at: string; updated_at: string;
};

export type TypeView = {
  readonly code: string;
  readonly label: string;
  readonly source: string;
  readonly readers: { readonly value: string; readonly label: string };
  readonly carries_value: boolean;
  readonly retention: RetentionReading;
  readonly strip: StripReading;
  readonly active: boolean;
  readonly note: string;
};

const TYPES_OBJ: Obj = { type: 'document_type', id: '__document_types__' };

function typeView(t: TypeRow): TypeView {
  return {
    code: t.code, label: t.label, source: words(SOURCES, t.source, t.source),
    readers: { value: t.readers, label: words(READERS, t.readers, t.readers) },
    carries_value: t.carries_value === 1, retention: retentionReading(t.retention_ref), strip: stripReading(t.handler_type),
    active: t.active === 1, note: t.note,
  };
}

export function typeList(db: Db, actor: Actor): TypeView[] {
  authorise(actor, 'document_type.read', TYPES_OBJ);
  return db.all<TypeRow>(`${TYPE_SELECT}ORDER BY ord ASC, code ASC`).map(typeView);
}

export function mayWriteTypes(actor: Actor): boolean {
  return can(actor, 'document_type.write', TYPES_OBJ);
}

/** What an upload may be, and what may be asked for: active, with a receipt policy. A vocabulary, not a record. */
export function receivableTypes(db: Db): { code: string; label: string }[] {
  return db.all<{ code: string; label: string }>(
    'SELECT code, label FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord ASC, code ASC');
}

function readTypeFields(input: Fields, current: TypeRow | null):
  { ok: true; label: string; readers: string; carries: number; retention: string | null; active: number } | { ok: false; why: string; field?: string } {
  const label = has(input as Vocab, 'label') ? (input['label'] ?? '').trim() : (current?.label ?? '');
  if (label.length === 0 || label.length > 120) return { ok: false, why: 'a document type needs a label of up to 120 characters.', field: 'label' };
  const readers = has(input as Vocab, 'readers') ? (input['readers'] ?? '') : (current?.readers ?? '');
  if (!has(READERS, readers)) return { ok: false, why: 'choose who may read documents of this type from the list.', field: 'readers' };
  // FAIL CLOSED: a new type carries a value unless somebody says in terms that it cannot.
  const carriesIn = has(input as Vocab, 'carries_value') ? input['carries_value'] : null;
  const carries = carriesIn === '0' ? 0 : carriesIn === '1' ? 1 : (current === null ? 1 : current.carries_value);
  if (current !== null && current.carries_value === 1 && carries === 0) {
    return { ok: false, why: 'a type that can carry a claim value, a tax benefit or a fee is never marked as not carrying one.', field: 'carries_value' };
  }
  if (carries === 1 && readers === 'CLAIM_EVIDENCE') {
    return { ok: false, why: 'a type that can carry a claim value, a tax benefit or a fee cannot be claim evidence. A surveyor would read it.', field: 'readers' };
  }
  const retIn = has(input as Vocab, 'retention_ref') ? (input['retention_ref'] ?? '') : (current?.retention_ref ?? '');
  const retention = retIn === '' || retIn === 'UNSET' ? null : retIn;
  if (retention !== null && !has(RETENTION_REFS, retention)) {
    return { ok: false, why: 'choose a deletion rule from the list, or choose “No deletion date set yet”.', field: 'retention_ref' };
  }
  const activeIn = has(input as Vocab, 'active') ? input['active'] : null;
  const active = activeIn === '0' ? 0 : activeIn === '1' ? 1 : (current?.active ?? 1);
  return { ok: true, label, readers, carries, retention, active };
}

/**
 * ADMIN ADDS A TYPE. It has NO receipt policy — the table refuses one from here —
 * so it can be recorded, read and requested of nobody until a migration binds it.
 */
export function createType(d: DocDeps, actor: Actor, input: Fields): DocResult {
  authorise(actor, 'document_type.write', TYPES_OBJ);
  const code = (input['code'] ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,59}$/.test(code)) return { ok: false, why: 'a type’s code is capital letters, digits and underscores, starting with a letter.', field: 'code' };
  if (d.db.get<{ code: string }>('SELECT code FROM document_types WHERE code = ?', [code]) !== undefined) {
    return { ok: false, why: 'there is already a document type with that code.', field: 'code' };
  }
  const f = readTypeFields(input, null);
  if (!f.ok) return f;
  const at = d.now();
  const ord = (d.db.get<{ m: number | null }>('SELECT MAX(ord) AS m FROM document_types')?.m ?? 0) + 10;
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO document_types (code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at) ' +
        'VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)',
      [code, f.label, 'ADMIN', f.readers, f.carries, f.retention, f.active, ord, 'Added by an administrator.', at, at]);
    d.audit.append({
      at, kind: 'DOCUMENT_TYPE_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'document_type', object_id: code,
      detail: { code, readers: f.readers, carries_value: f.carries, retention: f.retention ?? 'UNSET', receivable: false },
    });
  });
  return { ok: true, id: code };
}

/** ADMIN CHANGES A TYPE — its label, who may read it, its clock, whether it is active; never its code or its policy. */
export function updateType(d: DocDeps, actor: Actor, code: string, input: Fields): DocResult {
  authorise(actor, 'document_type.write', TYPES_OBJ);
  const t = d.db.get<TypeRow>(`${TYPE_SELECT}WHERE code = ?`, [code]);
  if (t === undefined) throw new NotFoundAsRefusal();
  const f = readTypeFields(input, t);
  if (!f.ok) return f;
  const fields = [
    f.label !== t.label ? 'label' : null, f.readers !== t.readers ? 'readers' : null,
    f.carries !== t.carries_value ? 'carries_value' : null, f.retention !== t.retention_ref ? 'retention' : null,
    f.active !== t.active ? 'active' : null,
  ].filter((x): x is string => x !== null);
  if (fields.length === 0) return { ok: true, id: code };
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      'UPDATE document_types SET label = ?, readers = ?, carries_value = ?, retention_ref = ?, active = ?, updated_at = ? WHERE code = ?',
      [f.label, f.readers, f.carries, f.retention, f.active, at, code]);
    d.audit.append({
      at, kind: 'DOCUMENT_TYPE_UPDATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'document_type', object_id: code, detail: { code, fields },
    });
  });
  return { ok: true, id: code };
}

/* ================================================================== *
 * 3 · THE DOCUMENT AS AN OBJECT can() IS ASKED ABOUT
 * ================================================================== */

const LOGICAL_SELECT =
  'SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, ' +
  't.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code ';

type LogicalRow = {
  id: string; business_id: string; type_code: string; seq: number; created_at: string; label: string; readers: string;
  carries_value: number; handler_type: string | null; type_retention: string | null;
};

/** "Lease 2". A document is named by its type and its number within its organisation, never by what it is about. */
export function documentLabel(typeLabel: string, seq: number): string {
  return `${typeLabel} ${seq}`;
}

function loadLogical(db: Db, id: string): LogicalRow {
  const l = db.get<LogicalRow>(`${LOGICAL_SELECT}WHERE l.id = ?`, [id]);
  if (l === undefined) throw new NotFoundAsRefusal();
  return l;
}

function letterSigned(db: Db, business_id: string): boolean {
  return db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM engagements WHERE business_id = ? AND signed_at IS NOT NULL', [business_id])?.n !== 0;
}

/**
 * THE SURVEYORS A DOCUMENT REACHES. Linked to claims or properties: the surveyors
 * holding a job on those claims, or on a claim of those properties. Linked to
 * nothing: the surveyors holding a job on its organisation — which is exactly
 * what a surveyor's evidence panel always listed. Unassigned jobs reach nobody.
 */
function documentSurveyors(db: Db, logical_id: string, business_id: string): string[] {
  const linked = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM document_links WHERE logical_document_id = ? AND unlinked_at IS NULL', [logical_id])?.n ?? 0;
  const rows = linked === 0
    ? db.all<{ surveyor_id: string }>(
      'SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', [business_id])
    : db.all<{ surveyor_id: string }>(
      'SELECT DISTINCT j.surveyor_id FROM surveyor_jobs j WHERE j.surveyor_id IS NOT NULL AND j.claim_id IN (' +
        'SELECT k.claim_id FROM document_links k WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.claim_id IS NOT NULL ' +
        'UNION SELECT c.id FROM document_links k JOIN claims c ON c.property_id = k.property_id ' +
        'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.property_id IS NOT NULL)',
      [logical_id, logical_id]);
  return rows.map((r) => r.surveyor_id);
}

export function documentObj(db: Db, l: { id: string; business_id: string; readers: string; carries_value: number }): DocObj {
  return {
    type: 'document', id: l.id, business_id: l.business_id, readers: l.readers, carries_value: l.carries_value === 1,
    letter_signed: letterSigned(db, l.business_id), assigned_surveyor_ids: documentSurveyors(db, l.id, l.business_id),
    released_to_client: releasedToClient(db, l.id), shown_to_client: shownToClient(db, l.id),
  };
}

/**
 * PHASE 140 — CAN THE CLIENT SEE THIS FILE AT ALL? The latest row of `document_visibility` (migration 035) says, where
 * there is one. Where there is none, a file the client sent is theirs to see, and a file staff sent is not — Lakhbir's
 * default, "no". `clientDocument` in src/authz.ts reads this, and still applies every other rule on top of it.
 */
export function shownToClient(db: Db, logical_id: string): boolean {
  const v = db.get<{ shown_to_client: number }>(
    'SELECT shown_to_client FROM document_visibility WHERE logical_document_id = ? ORDER BY set_at DESC, rowid DESC LIMIT 1', [logical_id]);
  if (v !== undefined) return v.shown_to_client === 1;
  const by = db.get<{ role: string }>('SELECT u.role FROM logical_documents l JOIN users u ON u.id = l.created_by WHERE l.id = ?', [logical_id]);
  return by?.role === 'CLIENT';
}

/**
 * PHASE 140 — SHOW A FILE TO THE CLIENT, OR STOP SHOWING IT. Admin and Sales (`document.show_to_client`), on a document
 * they may read. A new row each time, audited; nothing about the document itself changes.
 */
export function setShownToClient(d: DocDeps, actor: Actor, logical_id: string, shown: boolean): DocResult & { business_id?: string } {
  const l = loadLogical(d.db, logical_id);
  const obj = documentObj(d.db, l);
  authorise(actor, 'document.read', obj);
  authorise(actor, 'document.show_to_client', obj);
  if (obj.shown_to_client === shown) return { ok: true, id: l.id, business_id: l.business_id };
  const at = d.now();
  d.db.run('INSERT INTO document_visibility (id, logical_document_id, shown_to_client, set_by, set_at) VALUES (?, ?, ?, ?, ?)',
    [d.newId(), l.id, shown ? 1 : 0, actor.id, at]);
  d.audit.append({
    at, kind: shown ? 'DOCUMENT_SHOWN_TO_CLIENT' : 'DOCUMENT_HIDDEN_FROM_CLIENT', outcome: 'ALLOWED', actor_id: actor.id,
    actor_role: actor.role, object_type: 'document', object_id: l.id, detail: { business: l.business_id },
  });
  return { ok: true, id: l.id, business_id: l.business_id };
}

/**
 * CRM 6 of 10 — IS THIS AN ISSUED CLIENT REPORT WHOSE FIGURE IS RELEASED?
 *
 * True only where the document is a capital allowances report that the
 * deliverables register records as an ISSUED client report, on a claim with a
 * tax adviser's sign-off record made since the claim last entered that stage.
 * `clientDocument` in src/authz.ts reads it; nothing else does. Today no CA_REPORT
 * can be uploaded — its type has no receipt policy — so this is false on every
 * real document, and test/claim-record.test.ts proves it both ways.
 */
function releasedToClient(db: Db, logical_id: string): boolean {
  const r = db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM claim_deliverables cd JOIN logical_documents l ON l.id = cd.logical_document_id ' +
      "JOIN claims c ON c.id = cd.claim_id WHERE cd.logical_document_id = ? AND l.type_code = 'CA_REPORT' AND cd.kind = 'CLIENT_REPORT' " +
      "AND cd.state = 'ISSUED' AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = c.id AND s.recorded_at >= " +
      "COALESCE((SELECT MAX(m.at) FROM claim_stage_moves m WHERE m.claim_id = c.id AND m.to_stage = 'TAX_ADVISER_SIGNOFF' " +
      "AND m.kind IN ('FORWARD','REOPEN','OPENED','CONVERTED')), c.created_at))",
    [logical_id]);
  return (r?.n ?? 0) > 0;
}

/**
 * THE OBJECT FOR ONE UPLOADED ROW. A version asks its document. A row from before
 * versions existed that no receipt policy matched — refused at classification, or
 * never declared — is nobody's evidence: the claim team and the client who sent it.
 */
export function versionObj(db: Db, doc_id: string): DocObj | undefined {
  const r = db.get<{ id: string; business_id: string; logical_document_id: string | null }>(
    'SELECT id, business_id, logical_document_id FROM documents WHERE id = ?', [doc_id]);
  if (r === undefined) return undefined;
  if (r.logical_document_id !== null) return documentObj(db, loadLogical(db, r.logical_document_id));
  const by = db.get<{ role: string }>('SELECT u.role FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.id = ?', [r.id]);
  return {
    type: 'document', id: r.id, business_id: r.business_id, readers: 'CLAIM_TEAM', carries_value: false,
    letter_signed: letterSigned(db, r.business_id), assigned_surveyor_ids: [], shown_to_client: by?.role === 'CLIENT',
  };
}

/* ================================================================== *
 * 4 · VERSIONS
 * ================================================================== */

const VERSION_SELECT =
  'SELECT d.id, d.logical_document_id, d.version_no, d.type_code, d.retention_ref, d.request_id, d.state, d.doc_type, ' +
  'd.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, u.role AS uploader_role, ' +
  'd.original_kept_at, d.original_delete_after, d.original_deleted_at FROM documents d ' +
  'LEFT JOIN users u ON u.id = d.uploaded_by ';

type VersionRow = {
  id: string; logical_document_id: string | null; version_no: number | null; type_code: string | null; retention_ref: string | null;
  request_id: string | null; state: string; doc_type: string | null; strip_recorded_at: string | null;
  quarantine_discharged_at: string | null; failure_code: string | null; created_at: string; uploader_role: string | null;
  original_kept_at: string | null; original_delete_after: string | null; original_deleted_at: string | null;
};

export type VersionView = {
  readonly id: string;
  readonly version_no: number | null;
  readonly uploaded: string;
  readonly by: string;
  /** Received: the strip recorded, the original deleted from quarantine, and no refusal. */
  readonly received: boolean;
  readonly state: string;
  readonly strip: string;
  readonly original: string;
  /** THIS VERSION'S OWN CLOCK — the type's at the moment of upload, kept when the type's changes. */
  readonly clock: RetentionReading;
  readonly against_request: boolean;
};

function versionView(r: VersionRow): VersionView {
  const received = r.strip_recorded_at !== null && r.quarantine_discharged_at !== null && r.failure_code === null;
  return {
    id: r.id, version_no: r.version_no, uploaded: localStamp(r.created_at),
    by: r.uploader_role === 'CLIENT' ? 'the client' : r.uploader_role === null ? 'nobody recorded' : `staff (${r.uploader_role.toLowerCase()})`,
    received,
    // PHASE 140: in words a person reads. The codes are still on the row and in the handler's own record.
    state: r.failure_code !== null ? (FAILURE_WORDS[r.failure_code] ?? 'We could not use it.')
      : received ? 'Read — we kept what we need'
        : 'Not read yet',
    strip: r.strip_recorded_at === null ? 'not read yet' : `read ${localStamp(r.strip_recorded_at)}`,
    original: r.original_kept_at !== null
      ? (r.original_deleted_at !== null ? `Kept, then deleted ${localStamp(r.original_deleted_at)}`
        : `Kept safely until ${localStamp(r.original_delete_after ?? r.original_kept_at)}`)
      : r.quarantine_discharged_at === null ? 'Not deleted yet' : `Deleted ${localStamp(r.quarantine_discharged_at)}, once we had read it`,
    clock: retentionReading(r.retention_ref),
    against_request: r.request_id !== null,
  };
}

/** A version's file name, derived — never the client's. "lease-2-version-3". */
export function derivedFilename(type_code: string, seq: number, version_no: number): string {
  return `${type_code.toLowerCase().replace(/_/g, '-')}-${seq}-version-${version_no}`;
}

export type StartArgs = {
  readonly business_id: string;
  readonly type_code: string | null;
  /** A new version of this document. Absent: a new document. */
  readonly logical_document_id: string | null;
  /** The request this upload answers. Absent: the earliest open request of its type is received, if any. */
  readonly request_id: string | null;
  /** Staff only: link a new document to this claim. */
  readonly claim_id: string | null;
  /**
   * PHASE 140, staff only: whether the client can see a NEW document. Absent is no — Lakhbir's default. A client's own
   * upload is theirs to see by rule, and a new version keeps its document's answer.
   */
  readonly shown_to_client?: boolean;
};

export type Started =
  | {
      readonly ok: true; readonly doc_id: string; readonly logical_document_id: string; readonly version_no: number;
      readonly url: string; readonly expires_at: string; readonly job: UploadJob;
    }
  | { readonly ok: false; readonly why: string };

/**
 * AN UPLOAD STARTS AS A VERSION OF A DOCUMENT. Everything is decided and checked
 * here; the handler issues the link and writes the row, and the version's number,
 * its document, its type, its clock and its derived name are written in the same
 * transaction as the row, so no two uploads can take one number.
 */
export async function startDocumentUpload(d: DocDeps & { store: FsObjectStore }, actor: Actor, a: StartArgs): Promise<Started> {
  authorise(actor, 'document.upload', { type: 'business', id: a.business_id });
  const biz = d.db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [a.business_id]);
  if (biz === undefined) throw new NotFoundAsRefusal();

  let request: { id: string; requested_type: string; claim_id: string | null } | null = null;
  if (a.request_id !== null && a.request_id !== '') {
    const r = d.db.get<{ id: string; business_id: string; kind: string; state: string; requested_type: string | null; claim_id: string | null }>(
      'SELECT id, business_id, kind, state, requested_type, claim_id FROM client_tasks WHERE id = ?', [a.request_id]);
    if (r === undefined || r.business_id !== biz.id || r.kind !== 'DOCUMENT' || r.requested_type === null) return { ok: false, why: 'not found' };
    authorise(actor, 'document_request.read', { type: 'document_request', id: r.id, business_id: r.business_id });
    if (r.state !== 'OPEN') return { ok: false, why: 'that request is no longer open — it has been received or withdrawn.' };
    request = { id: r.id, requested_type: r.requested_type, claim_id: r.claim_id };
  }

  let logical: LogicalRow | null = null;
  if (a.logical_document_id !== null && a.logical_document_id !== '') {
    const l = d.db.get<LogicalRow>(`${LOGICAL_SELECT}WHERE l.id = ?`, [a.logical_document_id]);
    if (l === undefined || l.business_id !== biz.id) return { ok: false, why: 'not found' };
    authorise(actor, 'document.read', documentObj(d.db, l));
    logical = l;
  }

  const code = (a.type_code ?? '').trim() !== '' ? (a.type_code ?? '').trim() : (logical?.type_code ?? request?.requested_type ?? '');
  const t = d.db.get<TypeRow>(`${TYPE_SELECT}WHERE code = ?`, [code]);
  if (t === undefined) return { ok: false, why: 'say what kind of document it is.' };
  if (logical !== null && logical.type_code !== t.code) return { ok: false, why: `a new version of ${documentLabel(logical.label, logical.seq)} must be of the same type.` };
  if (request !== null && request.requested_type !== t.code) return { ok: false, why: 'that request asks for a different kind of document; upload one of those against it.' };
  if (t.active !== 1) return { ok: false, why: 'that document type has been retired.' };
  if (t.handler_type === null) return { ok: false, why: NO_RECEIPT_POLICY };

  let claimToLink: string | null = null;
  let linkVia: 'STAFF' | 'REQUEST' | null = null;
  if (a.claim_id !== null && a.claim_id !== '') {
    const probe: DocObj = {
      type: 'document', id: '__new__', business_id: biz.id, readers: t.readers, carries_value: t.carries_value === 1,
      letter_signed: false, assigned_surveyor_ids: [],
    };
    authorise(actor, 'document.link', probe);
    const c = d.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM claims WHERE id = ?', [a.claim_id]);
    if (c === undefined || c.business_id !== biz.id) return { ok: false, why: 'not found' };
    claimToLink = logical === null ? c.id : null;
    linkVia = 'STAFF';
  } else if (logical === null && request !== null && request.claim_id !== null) {
    // A request raised on a claim puts what answers it on that claim. The link is
    // the request's — staff chose the claim when they asked — not the uploader's.
    claimToLink = request.claim_id;
    linkVia = 'REQUEST';
  }

  const handlerType = t.handler_type;
  let made: { lid: string; seq: number; version_no: number; newDocument: boolean; linkId: string | null } | null = null;
  const b = await beginUpload(
    { db: d.db, store: d.store, now: d.now, actor: actor.id, newId: d.newId },
    {
      business_id: biz.id, uploaded_by: actor.id, filename: 'derived', declared_type: handlerType as DocType,
      version: () => {
        const at = d.now();
        let lid: string; let seq: number; let linkId: string | null = null;
        if (logical !== null) {
          lid = logical.id; seq = logical.seq;
        } else {
          lid = d.newId();
          seq = (d.db.get<{ m: number | null }>(
            'SELECT MAX(seq) AS m FROM logical_documents WHERE business_id = ? AND type_code = ?', [biz.id, t.code])?.m ?? 0) + 1;
          d.db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [lid, biz.id, t.code, seq, actor.id, at]);
          // PHASE 140: staff say, on every new document, whether the client can see it. The default is no.
          if (actor.role !== 'CLIENT') {
            d.db.run('INSERT INTO document_visibility (id, logical_document_id, shown_to_client, set_by, set_at) VALUES (?, ?, ?, ?, ?)',
              [d.newId(), lid, a.shown_to_client === true ? 1 : 0, actor.id, at]);
          }
          if (claimToLink !== null) {
            linkId = d.newId();
            d.db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, NULL, ?, ?)',
              [linkId, lid, claimToLink, actor.id, at]);
          }
        }
        const version_no = (d.db.get<{ m: number | null }>(
          'SELECT MAX(version_no) AS m FROM documents WHERE logical_document_id = ?', [lid])?.m ?? 0) + 1;
        made = { lid, seq, version_no, newDocument: logical === null, linkId };
        return {
          logical_document_id: lid, version_no, type_code: t.code, retention_ref: t.retention_ref,
          request_id: request?.id ?? null, filename: derivedFilename(t.code, seq, version_no),
        };
      },
    },
  );
  const m = made as { lid: string; seq: number; version_no: number; newDocument: boolean; linkId: string | null } | null;
  if (m === null) throw new Error('the upload row was written without its version');

  const at = d.now();
  d.audit.append({
    at, kind: 'DOCUMENT_VERSION_STARTED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'document', object_id: m.lid,
    detail: {
      upload: b.doc_id, version: m.version_no, type: t.code, new_document: m.newDocument, request: request?.id ?? '(none)', business: biz.id,
      ...(m.newDocument && actor.role !== 'CLIENT' ? { shown_to_client: a.shown_to_client === true } : {}),
    },
  });
  if (m.linkId !== null && claimToLink !== null) {
    d.audit.append({
      at, kind: 'DOCUMENT_LINKED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'document', object_id: m.lid, detail: { link: m.linkId, claim: claimToLink, via: linkVia ?? 'STAFF', business: biz.id },
    });
  }
  return { ok: true, doc_id: b.doc_id, logical_document_id: m.lid, version_no: m.version_no, url: b.url, expires_at: b.expires_at, job: b.job };
}

/* ================================================================== *
 * 5 · RECEIVED — BY AN UPLOAD, AND ONLY BY AN UPLOAD
 * ================================================================== */

/** What a received request's answer says. The document is the answer; this sentence only says so. */
export const RECEIVED_BY_UPLOAD = 'Received — the file they sent is the answer.';

/** The one sentence a click on a document request gets, in the portal and on the business page alike. */
export const RECEIVED_ONLY_BY_UPLOAD =
  'you answer a document request by sending the document it asks for. Use the upload beside it.';

/**
 * AFTER THE HANDLER HAS FINISHED, RECEIVE THE REQUEST THIS UPLOAD ANSWERS.
 *
 * Called by `finishUpload` and nothing else. It reads the row the handler wrote:
 * no strip recorded, no discharge recorded, or a refusal, and nothing is received.
 * The request is the one the upload was made against; failing that, the earliest
 * open request of the same type on the organisation — earliest due first, and a
 * request with no due date after those that have one. Returns the request's id,
 * or null.
 */
export function receiveByUpload(d: { db: Db; audit: AuditLog; now: () => string }, doc_id: string): string | null {
  const v = d.db.get<{
    id: string; business_id: string; type_code: string | null; request_id: string | null; logical_document_id: string | null;
    version_no: number | null; strip_recorded_at: string | null; quarantine_discharged_at: string | null; failure_code: string | null;
    uploaded_by: string; role: string | null;
  }>(
    'SELECT d.id, d.business_id, d.type_code, d.request_id, d.logical_document_id, d.version_no, d.strip_recorded_at, ' +
      'd.quarantine_discharged_at, d.failure_code, d.uploaded_by, u.role FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.id = ?',
    [doc_id]);
  if (v === undefined || v.type_code === null || v.strip_recorded_at === null || v.quarantine_discharged_at === null || v.failure_code !== null) {
    return null;
  }
  const req = v.request_id !== null
    ? d.db.get<{ id: string; claim_id: string | null }>(
      "SELECT id, claim_id FROM client_tasks WHERE id = ? AND kind = 'DOCUMENT' AND state = 'OPEN'", [v.request_id])
    : d.db.get<{ id: string; claim_id: string | null }>(
      "SELECT id, claim_id FROM client_tasks WHERE business_id = ? AND kind = 'DOCUMENT' AND requested_type = ? AND state = 'OPEN' " +
        'ORDER BY due_on IS NULL, due_on ASC, created_at ASC, id ASC LIMIT 1',
      [v.business_id, v.type_code]);
  if (req === undefined) return null;
  const at = d.now();
  const changed = d.db.tx(() => {
    const n = d.db.run(
      "UPDATE client_tasks SET state = 'ANSWERED', answer_state = 'ANSWERED', answer = ?, answered_at = ?, answered_by = ?, " +
        "answered_by_role = ?, received_document_id = ? WHERE id = ? AND state = 'OPEN'",
      [RECEIVED_BY_UPLOAD, at, v.uploaded_by, v.role === 'CLIENT' ? 'CLIENT' : 'STAFF', v.id, req.id]).changes;
    if (n === 1) {
      d.audit.append({
        at, kind: 'DOCUMENT_REQUEST_RECEIVED', outcome: 'ALLOWED', actor_id: v.uploaded_by, actor_role: v.role,
        object_type: 'client_task', object_id: req.id,
        detail: { upload: v.id, document: v.logical_document_id ?? '(none)', version: v.version_no ?? 0, type: v.type_code, business: v.business_id, claim: req.claim_id ?? '(none)' },
      });
    }
    return n;
  });
  return changed === 1 ? req.id : null;
}

/* ================================================================== *
 * 6 · REQUESTS — a client question of kind DOCUMENT
 * ================================================================== */

export type RequestState = 'REQUESTED' | 'RECEIVED' | 'WITHDRAWN';

/** READ OFF THE QUESTION'S OWN STATE. There is no second column that could say otherwise. */
export function requestState(state: string): RequestState {
  return state === 'ANSWERED' ? 'RECEIVED' : state === 'WITHDRAWN' ? 'WITHDRAWN' : 'REQUESTED';
}

export const REQUEST_WORDS: Readonly<Record<RequestState, string>> = Object.freeze({
  REQUESTED: 'requested — waiting on the client',
  RECEIVED: 'received — they sent it',
  WITHDRAWN: 'withdrawn — asked in error',
});

export type RequestInput = {
  readonly business_id: string;
  readonly claim_id: string | null;
  readonly type_code: string | null;
  readonly why: string | null;
  readonly holds_up: string | null;
  readonly due_on: string | null;
};

/**
 * RAISE A REQUEST. It goes straight to the client's portal, as a question does,
 * saying why and what it holds up — and it may be due, read through `dueReading`
 * so it is overdue by the UK date and never the UTC one. No due date is not
 * overdue and not on time either (N4). Once it has committed, the automation is
 * told: DOCUMENT_REQUESTED, which migration 012 has waited for.
 */
export function createDocumentRequest(
  d: DocDeps, actor: Actor, i: RequestInput,
): { readonly ok: true; readonly id: string; readonly runs: readonly RunOutcome[] } | { readonly ok: false; readonly why: string; readonly field?: string } {
  authorise(actor, 'document_request.create', { type: 'document_request', id: i.business_id, business_id: i.business_id });
  const biz = d.db.get<{ id: string }>('SELECT id FROM businesses WHERE id = ?', [i.business_id]);
  if (biz === undefined) throw new NotFoundAsRefusal();
  let claim: string | null = null;
  if (i.claim_id !== null && i.claim_id !== '') {
    const c = d.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM claims WHERE id = ?', [i.claim_id]);
    if (c === undefined || c.business_id !== biz.id) return { ok: false, why: 'not found' };
    claim = c.id;
  }
  const t = d.db.get<TypeRow>(`${TYPE_SELECT}WHERE code = ?`, [(i.type_code ?? '').trim()]);
  // PHASE 133d (D4): each refusal about one field names it, so the form draws it beside that field.
  if (t === undefined) return { ok: false, why: 'choose the kind of document you are asking for.', field: 'type_code' };
  if (t.active !== 1) return { ok: false, why: 'that document type has been retired.', field: 'type_code' };
  if (t.handler_type === null) return { ok: false, why: `nothing could ever receive it. ${NO_RECEIPT_POLICY}`, field: 'type_code' };
  const why = (i.why ?? '').trim();
  const holds = (i.holds_up ?? '').trim();
  if (why.length === 0 || holds.length === 0) {
    return { ok: false, why: 'say why we need the document and what it holds up.', field: why.length === 0 ? 'why' : 'holds_up' };
  }
  const due = (i.due_on ?? '').trim();
  if (due !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(`${due}T12:00:00.000Z`)))) {
    return { ok: false, why: 'the due date is not a real date. Pick one from the calendar.', field: 'due_on' };
  }
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, fact_id, sent_to_portal_at, due_on, ' +
        'kind, requested_type, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)',
      [id, biz.id, actor.id, `Please upload: ${t.label}`, why, holds, 'OPEN', at, at, due === '' ? null : due, 'DOCUMENT', t.code, claim]);
    d.audit.append({
      at, kind: 'DOCUMENT_REQUESTED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'client_task', object_id: id,
      detail: { business: biz.id, claim: claim ?? '(none)', type: t.code, due: due === '' ? '(none)' : due },
    });
  });
  const runs = fireAutomation({ db: d.db, audit: d.audit, now: d.now, newId: d.newId }, actor, {
    trigger: 'DOCUMENT_REQUESTED', business_id: biz.id, claim_id: claim,
  });
  return { ok: true, id, runs };
}

/** WITHDRAW AN OPEN REQUEST. A received one is not withdrawn: the version that answered it stays on the record. */
export function withdrawDocumentRequest(d: DocDeps, actor: Actor, id: string): DocResult & { business_id?: string; claim_id?: string | null } {
  const r = d.db.get<{ id: string; business_id: string; kind: string; state: string; claim_id: string | null }>(
    'SELECT id, business_id, kind, state, claim_id FROM client_tasks WHERE id = ?', [id]);
  if (r === undefined || r.kind !== 'DOCUMENT') throw new NotFoundAsRefusal();
  authorise(actor, 'document_request.withdraw', { type: 'document_request', id: r.id, business_id: r.business_id });
  if (r.state === 'WITHDRAWN') return { ok: false, why: 'that request has already been withdrawn.' };
  if (r.state !== 'OPEN') return { ok: false, why: 'that request has been received by an upload. The version that answered it stays on the record.' };
  const at = d.now();
  const n = d.db.tx(() => {
    const c = d.db.run("UPDATE client_tasks SET state = 'WITHDRAWN', withdrawn_at = ?, withdrawn_by = ? WHERE id = ? AND state = 'OPEN'",
      [at, actor.id, r.id]).changes;
    if (c === 1) {
      d.audit.append({
        at, kind: 'DOCUMENT_REQUEST_WITHDRAWN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'client_task', object_id: r.id, detail: { business: r.business_id, claim: r.claim_id ?? '(none)' },
      });
    }
    return c;
  });
  if (n !== 1) return { ok: false, why: 'that request changed while you were looking at it.' };
  return { ok: true, id: r.id, business_id: r.business_id, claim_id: r.claim_id };
}

const REQUEST_SELECT =
  'SELECT ct.id, ct.business_id, ct.claim_id, c.claim_ref, ct.requested_type, t.label AS type_label, ct.state, ct.why, ct.holds_up, ' +
  'ct.due_on, ct.created_at, ct.withdrawn_at, ct.answered_at, ab.display_name AS asked_by, d.logical_document_id AS received_document, ' +
  'd.version_no AS received_version FROM client_tasks ct JOIN document_types t ON t.code = ct.requested_type ' +
  'LEFT JOIN claims c ON c.id = ct.claim_id LEFT JOIN users ab ON ab.id = ct.asked_by LEFT JOIN documents d ON d.id = ct.received_document_id ';

type RequestRow = {
  id: string; business_id: string; claim_id: string | null; claim_ref: string | null; requested_type: string; type_label: string;
  state: string; why: string; holds_up: string; due_on: string | null; created_at: string; withdrawn_at: string | null;
  answered_at: string | null; asked_by: string | null; received_document: string | null; received_version: number | null;
};

export type RequestView = {
  readonly id: string;
  readonly type: { readonly code: string; readonly label: string };
  readonly claim: { readonly id: string; readonly claim_ref: string } | null;
  readonly state: RequestState;
  readonly state_words: string;
  readonly why: string;
  readonly holds_up: string;
  readonly due: DueReading;
  readonly asked: string;
  readonly asked_by: string | null;
  readonly received: { readonly document_id: string; readonly version_no: number | null; readonly at: string } | null;
};

function requestView(r: RequestRow, nowIso: string): RequestView {
  const state = requestState(r.state);
  return {
    id: r.id, type: { code: r.requested_type, label: r.type_label },
    claim: r.claim_id === null || r.claim_ref === null ? null : { id: r.claim_id, claim_ref: r.claim_ref },
    state, state_words: REQUEST_WORDS[state], why: r.why, holds_up: r.holds_up,
    due: dueReading(r.due_on, nowIso, state !== 'REQUESTED'),
    asked: localStamp(r.created_at), asked_by: r.asked_by,
    received: state === 'RECEIVED' && r.received_document !== null
      ? { document_id: r.received_document, version_no: r.received_version, at: r.answered_at === null ? '' : localStamp(r.answered_at) }
      : null,
  };
}

/** An organisation's requests, or one claim's — outstanding first, earliest due first. */
export function requestsFor(db: Db, actor: Actor, scope: { business_id: string; claim_id?: string }, nowIso: string): RequestView[] {
  authorise(actor, 'document_request.read', { type: 'document_request', id: scope.business_id, business_id: scope.business_id });
  const order = "ORDER BY CASE WHEN ct.state = 'OPEN' THEN 0 ELSE 1 END, ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC";
  const rows = scope.claim_id === undefined
    ? db.all<RequestRow>(`${REQUEST_SELECT}WHERE ct.kind = 'DOCUMENT' AND ct.business_id = ? ${order}`, [scope.business_id])
    : db.all<RequestRow>(`${REQUEST_SELECT}WHERE ct.kind = 'DOCUMENT' AND ct.business_id = ? AND ct.claim_id = ? ${order}`, [scope.business_id, scope.claim_id]);
  return rows.map((r) => requestView(r, nowIso));
}

/* ================================================================== *
 * 7 · LINKS
 * ================================================================== */

/** LINK A DOCUMENT TO A CLAIM OR A PROPERTY OF ITS OWN ORGANISATION. One lease, two claims: two links. */
export function linkDocument(d: DocDeps, actor: Actor, logical_id: string, to: { claim_id: string | null; property_id: string | null }): DocResult {
  const l = loadLogical(d.db, logical_id);
  const obj = documentObj(d.db, l);
  authorise(actor, 'document.link', obj);
  authorise(actor, 'document.read', obj);
  const claim = (to.claim_id ?? '').trim();
  const property = (to.property_id ?? '').trim();
  if ((claim === '') === (property === '')) return { ok: false, why: 'link the document to one claim or one property.' };
  if (claim !== '') {
    const c = d.db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [claim]);
    if (c === undefined || c.business_id !== l.business_id) return { ok: false, why: 'a document links only to a claim of its own organisation.' };
  } else {
    const p = d.db.get<{ business_id: string }>('SELECT business_id FROM properties WHERE id = ?', [property]);
    if (p === undefined || p.business_id !== l.business_id) return { ok: false, why: 'a document links only to a property of its own organisation.' };
  }
  const already = claim !== ''
    ? d.db.get<{ id: string }>('SELECT id FROM document_links WHERE logical_document_id = ? AND claim_id = ? AND unlinked_at IS NULL', [l.id, claim])
    : d.db.get<{ id: string }>('SELECT id FROM document_links WHERE logical_document_id = ? AND property_id = ? AND unlinked_at IS NULL', [l.id, property]);
  if (already !== undefined) return { ok: false, why: 'the document is already linked there.' };
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, l.id, claim === '' ? null : claim, property === '' ? null : property, actor.id, at]);
    d.audit.append({
      at, kind: 'DOCUMENT_LINKED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'document', object_id: l.id,
      detail: { link: id, business: l.business_id, ...(claim === '' ? { property: property } : { claim }), via: 'STAFF' },
    });
  });
  return { ok: true, id };
}

/** END A LINK, WITH WHO AND WHEN. It is not deleted: that it was linked is part of the record. */
export function unlinkDocument(d: DocDeps, actor: Actor, link_id: string): DocResult & { document_id?: string } {
  const k = d.db.get<{ id: string; logical_document_id: string; unlinked_at: string | null; claim_id: string | null }>(
    'SELECT id, logical_document_id, unlinked_at, claim_id FROM document_links WHERE id = ?', [link_id]);
  if (k === undefined) throw new NotFoundAsRefusal();
  const l = loadLogical(d.db, k.logical_document_id);
  authorise(actor, 'document.link', documentObj(d.db, l));
  if (k.unlinked_at !== null) return { ok: false, why: 'that link has already been ended.' };
  const at = d.now();
  d.db.tx(() => {
    d.db.run('UPDATE document_links SET unlinked_at = ?, unlinked_by = ? WHERE id = ? AND unlinked_at IS NULL', [at, actor.id, k.id]);
    d.audit.append({
      at, kind: 'DOCUMENT_UNLINKED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'document', object_id: l.id,
      detail: { link: k.id, business: l.business_id, claim: k.claim_id ?? '(none)' },
    });
  });
  return { ok: true, id: k.id, document_id: l.id };
}

/* ================================================================== *
 * 8 · WHAT A PAGE SHOWS
 * ================================================================== */

export type DocumentSummary = {
  readonly id: string;
  readonly label: string;
  readonly type: { readonly code: string; readonly label: string };
  readonly readers: string;
  readonly versions: number;
  /** The latest received version, or the latest of all where none is received. */
  readonly current: VersionView | null;
  readonly href: string;
};

function summaryOf(db: Db, l: LogicalRow): DocumentSummary {
  const versions = db.all<VersionRow>(`${VERSION_SELECT}WHERE d.logical_document_id = ? ORDER BY d.version_no DESC`, [l.id]).map(versionView);
  return {
    id: l.id, label: documentLabel(l.label, l.seq), type: { code: l.type_code, label: l.label },
    readers: words(READERS, l.readers, l.readers), versions: versions.length,
    current: versions.find((v) => v.received) ?? versions[0] ?? null,
    href: `/staff/documents/${l.id}`,
  };
}

export type ClaimDocumentsPanel = {
  readonly documents: readonly DocumentSummary[];
  readonly requests?: readonly RequestView[];
  readonly outstanding?: number;
  readonly overdue?: number;
  readonly may_request: boolean;
  readonly may_link: boolean;
  readonly may_upload: boolean;
  readonly request_types?: readonly { readonly code: string; readonly label: string }[];
  readonly linkable?: readonly { readonly id: string; readonly label: string }[];
};

/**
 * THE CLAIM PAGE'S DOCUMENTS PANEL, BUILT FORWARDS FOR THE READER. Every document
 * is asked of `document.read` on its own; requests appear only for
 * `document_request.read`; nothing here names a person or computes a figure.
 */
export function claimDocumentsPanel(db: Db, actor: Actor, claim: { id: string; business_id: string }, nowIso: string): ClaimDocumentsPanel {
  const docs = db.all<LogicalRow>(
    `${LOGICAL_SELECT}WHERE l.id IN (SELECT k.logical_document_id FROM document_links k LEFT JOIN claims c ON c.property_id = k.property_id ` +
      'WHERE k.unlinked_at IS NULL AND (k.claim_id = ? OR c.id = ?)) ORDER BY t.ord ASC, l.seq ASC',
    [claim.id, claim.id],
  ).filter((l) => can(actor, 'document.read', documentObj(db, l))).map((l) => summaryOf(db, l));
  const reqObj = { type: 'document_request' as const, id: claim.business_id, business_id: claim.business_id };
  const requests = can(actor, 'document_request.read', reqObj) ? requestsFor(db, actor, { business_id: claim.business_id, claim_id: claim.id }, nowIso) : null;
  const mayRequest = can(actor, 'document_request.create', reqObj);
  const mayLink = can(actor, 'document.link', {
    type: 'document', id: claim.id, business_id: claim.business_id, readers: 'CLAIM_TEAM', carries_value: false, letter_signed: false, assigned_surveyor_ids: [],
  });
  const mayUpload = actor.role !== 'CLIENT' && can(actor, 'document.upload', { type: 'business', id: claim.business_id });
  const linkedIds = new Set(docs.map((x) => x.id));
  const linkable = mayLink
    ? db.all<LogicalRow>(`${LOGICAL_SELECT}WHERE l.business_id = ? ORDER BY t.ord ASC, l.seq ASC`, [claim.business_id])
      .filter((l) => !linkedIds.has(l.id) && can(actor, 'document.read', documentObj(db, l)))
      .map((l) => ({ id: l.id, label: documentLabel(l.label, l.seq) }))
    : null;
  return {
    documents: docs,
    ...(requests === null ? {} : {
      requests,
      outstanding: requests.filter((r) => r.state === 'REQUESTED').length,
      overdue: requests.filter((r) => r.due.overdue).length,
    }),
    may_request: mayRequest, may_link: mayLink, may_upload: mayUpload,
    ...(mayRequest || mayUpload ? { request_types: receivableTypes(db) } : {}),
    ...(linkable === null ? {} : { linkable }),
  };
}

export type LinkView = {
  readonly id: string;
  readonly to: 'claim' | 'property';
  readonly label: string;
  /** Phase 134: a claim's reference, drawn as a small grey label beside its name. */
  readonly ref?: string;
  readonly href: string | null;
  readonly linked: string;
  readonly ended: string | null;
};

export type DocumentPage = {
  readonly id: string;
  readonly label: string;
  readonly business_id: string;
  readonly type: {
    readonly code: string; readonly label: string; readers: string; readonly strip: StripReading; readonly clock_now: RetentionReading;
  };
  readonly links: readonly LinkView[];
  /** Newest first. EVERY version, received or refused — nothing overwrites, so nothing is left out. */
  readonly versions: readonly VersionView[];
  readonly history: string;
  readonly original: string;
  readonly may_link: boolean;
  readonly may_upload_version: boolean;
  /** PHASE 140: the newest kept original, where one is kept and this reader may open it. */
  readonly original_href?: string;
  /** PHASE 140: whether the client can see this file, and whether this reader may change that. */
  readonly shown_to_client: boolean;
  readonly may_show: boolean;
  readonly from_client: boolean;
  readonly linkable_claims?: readonly { readonly id: string; readonly claim_ref: string; readonly property: string | null }[];
  /**
   * PHASE 146i. The question a person must answer before one of the two conditional fields can be kept, where this
   * kind of document has one. Null on every other type, and null for the client, who never sees this page.
   */
  readonly vouch: VouchView | null;
  /** PHASE 146i. What happened each time we read a version of this document, newest first. Staff only, and empty
   *  until reading documents is switched on — which is a reading that never started, and not a reading. */
  readonly readings: readonly ReadingView[];
};

export const HISTORY_NOTE =
  'Nothing is overwritten. Each upload is its own version. Each keeps the deletion rule its type had when it arrived. ' +
  'Uploads we could not use are listed too.';

/** PHASE 140: in words a person reads. `READ_AND_DELETED` (src/web/originals.ts) is the short form a folder shows. */
export const ORIGINALS_NOTE =
  'We read each file and then delete it. We keep what we took from it, not the file. That is on purpose, to keep as little as we can.';

/**
 * ONE DOCUMENT AND ITS HISTORY — AND THE READ IS AUDITED, ALLOWED OR REFUSED, as
 * the download always was (DB-W1-T6). A document that does not exist is refused in
 * the same words as one the reader may not see.
 */
export function documentPage(d: { db: Db; audit: AuditLog; now: () => string }, actor: Actor, id: string, route: string, nowIso: string): DocumentPage {
  let l: LogicalRow;
  let obj: DocObj;
  try {
    l = loadLogical(d.db, id);
    obj = documentObj(d.db, l);
    authorise(actor, 'document.read', obj);
  } catch (e) {
    d.audit.append({
      at: d.now(), kind: 'DOCUMENT_ACCESSED', outcome: 'REFUSED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'document', object_id: id, detail: { route },
    });
    throw e;
  }
  d.audit.append({
    at: d.now(), kind: 'DOCUMENT_ACCESSED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'document', object_id: l.id, detail: { route },
  });
  const links = d.db.all<{ id: string; claim_id: string | null; claim_ref: string | null; claim_business: string | null; claim_property: string | null; property_id: string | null; property_label: string | null; linked_at: string; unlinked_at: string | null }>(
    'SELECT k.id, k.claim_id, c.claim_ref, c.business_id AS claim_business, cp.label AS claim_property, k.property_id, p.label AS property_label, k.linked_at, k.unlinked_at ' +
      'FROM document_links k LEFT JOIN claims c ON c.id = k.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = k.property_id ' +
      'WHERE k.logical_document_id = ? ORDER BY k.linked_at ASC', [l.id],
  ).map((k): LinkView => k.claim_id !== null
    ? { id: k.id, to: 'claim', label: k.claim_property ?? 'a claim with no property', ...(k.claim_ref === null ? {} : { ref: k.claim_ref }), href: `/staff/claims/${k.claim_id}`, linked: localStamp(k.linked_at), ended: k.unlinked_at === null ? null : localStamp(k.unlinked_at) }
    : { id: k.id, to: 'property', label: k.property_label ?? 'a property', href: `/staff/properties/${k.property_id ?? ''}`, linked: localStamp(k.linked_at), ended: k.unlinked_at === null ? null : localStamp(k.unlinked_at) });
  const mayLink = can(actor, 'document.link', obj);
  const mayUpload = actor.role !== 'CLIENT' && can(actor, 'document.upload', { type: 'business', id: l.business_id }) && l.handler_type !== null;
  /* PHASE 146i. Both are staff's. The client's own page says what we did with their file in the words it already
     used; the question about a name, and why our reader could not read something, are ours. */
  const staff = actor.role !== 'CLIENT';
  const linkedClaims = new Set(links.filter((k) => k.to === 'claim' && k.ended === null).map((k) => k.href));
  return {
    id: l.id, label: documentLabel(l.label, l.seq), business_id: l.business_id,
    type: { code: l.type_code, label: l.label, readers: words(READERS, l.readers, l.readers), strip: stripReading(l.handler_type), clock_now: retentionReading(l.type_retention) },
    // A link's target is drawn as a link only where the reader may open it; its reference is shown either way.
    links: links.map((k) => ({ ...k, href: k.href !== null && staffMayOpen(d.db, actor, k) ? k.href : null })),
    versions: d.db.all<VersionRow>(`${VERSION_SELECT}WHERE d.logical_document_id = ? ORDER BY d.version_no DESC`, [l.id]).map(versionView),
    history: HISTORY_NOTE, original: ORIGINALS_NOTE,
    may_link: mayLink, may_upload_version: mayUpload,
    ...(keptVersionOf(d.db, l.id, d.now()) !== null && can(actor, 'document.read_original', obj) ? { original_href: `/staff/documents/${l.id}/download` } : {}),
    shown_to_client: obj.shown_to_client === true,
    may_show: actor.role !== 'CLIENT' && can(actor, 'document.show_to_client', obj),
    from_client: d.db.get<{ role: string }>('SELECT u.role FROM users u WHERE u.id = (SELECT created_by FROM logical_documents WHERE id = ?)', [l.id])?.role === 'CLIENT',
    ...(mayLink ? {
      linkable_claims: d.db.all<{ id: string; claim_ref: string; property: string | null }>('SELECT c.id, c.claim_ref, p.label AS property FROM claims c LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY c.claim_ref ASC', [l.business_id])
        .filter((c) => !linkedClaims.has(`/staff/claims/${c.id}`)),
    } : {}),
    vouch: staff
      ? vouchView(d.db, l.id, l.handler_type, can(actor, 'document.vouch', obj), localStamp, (u) => personWords(d.db, u))
      : null,
    readings: staff ? readingsFor(d.db, l.id, localStamp) : [],
    ...(nowIso === '' ? {} : {}),
  };
}

/**
 * PHASE 146i — WHO ANSWERED, IN THE SAME WORDS A VERSION'S ROW USES. A role, never a name: the back office does not
 * show one person's name to another in a record like this, and the audit log already carries who it was.
 */
function personWords(db: Db, user_id: string): string {
  const role = db.get<{ role: string }>('SELECT role FROM users WHERE id = ?', [user_id])?.role;
  return role === undefined ? 'nobody recorded' : role === 'CLIENT' ? 'the client' : `staff (${role.toLowerCase()})`;
}

/**
 * PHASE 146i — A PERSON SAYS WHETHER A NAME BELONGS TO AN ORGANISATION.
 *
 * Two CLIENT_DOC fields are kept on that footing alone, and `assertClaimsWritable` refuses both unless a caller
 * asserts it. It cannot be read off the document — that is what the control is for — so it is asked here, of the
 * two roles that work the client, and never of the client, who would be vouching for their own document.
 *
 * A LATER ANSWER REPLACES AN EARLIER ONE, and the audit log keeps every one of them with what it replaced. Only
 * `yes` keeps the field; `no`, `not sure` and an unanswered question are the same decision and none of them
 * becomes a blank, a guess or a pass (N4).
 *
 * IT CHANGES NOTHING ALREADY READ. The file has been read and deleted by the time anybody is looking at this page,
 * so an answer governs the NEXT reading of this document and never the last one.
 */
export function vouchDocumentField(
  d: DocDeps, actor: Actor, id: string, field_id: string, answer: string | null,
): { readonly ok: true } | { readonly ok: false; readonly why: string } {
  const l = loadLogical(d.db, id);
  authorise(actor, 'document.vouch', documentObj(d.db, l));
  const f = vouchedFieldFor(l.handler_type);
  if (f === null || f.field_id !== field_id) {
    return { ok: false, why: 'There is nothing to answer on this kind of file.' };
  }
  if (!isVouchAnswer(answer)) return { ok: false, why: 'Choose yes, no, or not sure.' };
  const was = vouchesFor(d.db, l.id).find((v) => v.field_id === field_id)?.answer ?? null;
  writeVouch(d.db, d.newId, d.now(), l.id, field_id, answer, actor.id);
  d.audit.append({
    at: d.now(), kind: 'DOCUMENT_FIELD_VOUCHED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role, object_type: 'document', object_id: l.id,
    // The field and the answer. NEVER THE VALUE: the name this answer is about is one the register refuses to hold.
    detail: { field_id, answer, was, kept: answer === 'yes' },
  });
  return { ok: true };
}

function staffMayOpen(db: Db, actor: Actor, k: LinkView): boolean {
  if (actor.role === 'CLIENT') return false;
  const id = (k.href ?? '').split('/').pop() ?? '';
  if (k.to === 'claim') {
    const c = db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [id]);
    if (c === undefined) return false;
    const surveyors = db.all<{ surveyor_id: string }>(
      'SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE claim_id = ? AND surveyor_id IS NOT NULL', [id]).map((r) => r.surveyor_id);
    return can(actor, 'claim.read', { type: 'claim', id, business_id: c.business_id, assigned_surveyor_ids: surveyors });
  }
  const p = db.get<{ business_id: string }>('SELECT business_id FROM properties WHERE id = ?', [id]);
  if (p === undefined) return false;
  const surveyors = db.all<{ surveyor_id: string }>(
    'SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', [p.business_id]).map((r) => r.surveyor_id);
  return can(actor, 'property.read', { type: 'property', id, business_id: p.business_id, assigned_surveyor_ids: surveyors });
}

/** The organisation a claim belongs to, for a route that is about to authorise on it. Asks nothing itself. */
export function businessOfClaim(db: Db, claim_id: string): string {
  const c = db.get<{ business_id: string }>('SELECT business_id FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) throw new NotFoundAsRefusal();
  return c.business_id;
}

/** The organisation a document belongs to, for a route that is about to authorise on it. Asks nothing itself. */
export function businessOfDocument(db: Db, logical_id: string): string {
  return loadLogical(db, logical_id).business_id;
}

/**
 * THE ORIGINAL FILE — `document.read_original`, audited allowed or refused. Under
 * the fail-closed settings there is none to serve, and the route says so; the
 * question is still asked, so a refusal is a refusal and not a 410 to everyone.
 */
export function requestOriginal(d: { db: Db; audit: AuditLog; now: () => string }, actor: Actor, id: string): { label: string } {
  let l: LogicalRow;
  try {
    l = loadLogical(d.db, id);
    authorise(actor, 'document.read_original', documentObj(d.db, l));
  } catch (e) {
    d.audit.append({
      at: d.now(), kind: 'DOCUMENT_ACCESSED', outcome: 'REFUSED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'document', object_id: id, detail: { route: 'download' },
    });
    throw e;
  }
  d.audit.append({
    at: d.now(), kind: 'DOCUMENT_ACCESSED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'document', object_id: l.id, detail: { route: 'download' },
  });
  return { label: documentLabel(l.label, l.seq) };
}

/**
 * CRM 9 of 10. THE DOCUMENTS PANEL OF AN ORGANISATION OR A PROPERTY, BUILT FORWARDS FOR THE READER, in the claim
 * panel's shape. Every document is asked of `document.read` on its own — so a surveyor on a property page is drawn
 * only what that rule admits — and the link form is offered only to `document.link`, with the organisation's other
 * documents the reader may read.
 */
export type PlaceDocumentsPanel = {
  readonly documents: readonly DocumentSummary[];
  readonly may_link: boolean;
  readonly linkable?: readonly { readonly id: string; readonly label: string }[];
};

export function organisationDocumentsPanel(db: Db, actor: Actor, business_id: string): PlaceDocumentsPanel {
  return { documents: documentsOf(db, actor, business_id), may_link: false };
}

export function propertyDocumentsPanel(db: Db, actor: Actor, property: { id: string; business_id: string }): PlaceDocumentsPanel {
  const docs = db.all<LogicalRow>(
    `${LOGICAL_SELECT}WHERE l.id IN (SELECT k.logical_document_id FROM document_links k WHERE k.unlinked_at IS NULL AND k.property_id = ?) ` +
      'ORDER BY t.ord ASC, l.seq ASC',
    [property.id],
  ).filter((l) => can(actor, 'document.read', documentObj(db, l))).map((l) => summaryOf(db, l));
  const mayLink = can(actor, 'document.link', {
    type: 'document', id: property.id, business_id: property.business_id, readers: 'CLAIM_TEAM', carries_value: false, letter_signed: false,
    assigned_surveyor_ids: [],
  });
  if (!mayLink) return { documents: docs, may_link: false };
  const linked = new Set(docs.map((x) => x.id));
  return {
    documents: docs, may_link: true,
    linkable: documentsOf(db, actor, property.business_id).filter((x) => !linked.has(x.id)).map((x) => ({ id: x.id, label: x.label })),
  };
}

/** An organisation's documents the reader may read — the portal's list, and a surveyor's evidence. */
export function documentsOf(db: Db, actor: Actor, business_id: string): DocumentSummary[] {
  return db.all<LogicalRow>(`${LOGICAL_SELECT}WHERE l.business_id = ? ORDER BY t.ord ASC, l.seq ASC`, [business_id])
    .filter((l) => can(actor, 'document.read', documentObj(db, l)))
    .map((l) => summaryOf(db, l));
}

/* ================================================================== *
 * 9 · THE DOCUMENT CENTRE — the CRM follow-on, row 22.13
 *
 * ONE LIST OVER EVERY DOCUMENT, AND EVERY ROW ON IT ASKED OF `document.read` ON THE DOCUMENT ITSELF, exactly as each claim,
 * organisation and property panel asks. So ADMIN reads every document, SALES the claim's evidence, the team's papers and
 * the letter, ACCOUNTING the fee invoice and the signed letter, and a surveyor the claim evidence of its own jobs — and
 * nobody reads a row here they could not open. `document_centre.enter` opens the list and nothing inside it.
 *
 * FILTERS AND SORTS ARE KEYS IN FIXED TABLES, AS THE CLAIMS LIST'S ARE: an unknown key is dropped and said, and no ORDER BY
 * is built from a request. IT NEVER SEARCHES WHAT A DOCUMENT SAYS — there is no text in the store to search, and no route
 * here reads one — AND IT OFFERS NO EXPORT OF DOCUMENTS.
 * ================================================================== */

export const CENTRE_STATES: Vocab = Object.freeze({
  RECEIVED: 'Received — we have read at least one version',
  NOT_RECEIVED: 'Not received yet — we have not read any version',
  REFUSED: 'Refused — we could not use its newest version, and none is received',
});

export const CENTRE_SORTS: Vocab = Object.freeze({
  newest: 'Newest version first',
  type: 'Type, then number',
  organisation: 'Organisation, then type',
});

export const CENTRE_FILTERS: readonly { readonly key: 'type' | 'organisation' | 'claim' | 'state'; readonly label: string }[] = Object.freeze([
  { key: 'type', label: 'Type' }, { key: 'organisation', label: 'Organisation' }, { key: 'claim', label: 'Claim' }, { key: 'state', label: 'State' },
]);

export const CENTRE_NEVER: readonly string[] = Object.freeze([
  'what a document says — this list never searches inside files',
  'a download of all the documents — nobody can do this',
]);

export type CentreChoice = { readonly value: string; readonly label: string };

export type CentreRow = {
  readonly id: string;
  readonly label: string;
  readonly type: { readonly code: string; readonly label: string };
  readonly organisation: { readonly id: string; readonly name: string; readonly href: string | null };
  readonly claims: readonly { readonly id: string; readonly claim_ref: string; readonly property: string | null; readonly href: string | null }[];
  readonly state: { readonly key: string; readonly label: string };
  /** The newest version of all — received or not — with when it arrived and who sent it. */
  readonly newest: { readonly version_no: number | null; readonly uploaded: string; readonly by: string } | null;
  readonly versions: number;
  readonly href: string;
};

export type DocumentCentre = {
  readonly rows: readonly CentreRow[];
  readonly read: number;
  readonly applied: readonly { readonly key: string; readonly label: string; readonly value: string }[];
  readonly said: readonly string[];
  readonly sort: { readonly key: string; readonly label: string };
  readonly filters: typeof CENTRE_FILTERS;
  readonly choices: Readonly<Record<string, readonly CentreChoice[]>>;
  readonly sorts: readonly CentreChoice[];
  readonly never: readonly string[];
};

const CENTRE_OBJ: DocObj = {
  type: 'document', id: '__document_centre__', business_id: '__document_centre__', readers: 'CLAIM_TEAM', carries_value: true,
  letter_signed: false, assigned_surveyor_ids: [],
};

function distinctChoices(pairs: readonly (readonly [string, string])[]): CentreChoice[] {
  const seen = new Map<string, string>();
  for (const [v, l] of pairs) if (!seen.has(v)) seen.set(v, l);
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
}

export function documentCentre(db: Db, actor: Actor, q: URLSearchParams): DocumentCentre {
  authorise(actor, 'document_centre.enter', CENTRE_OBJ);
  const said: string[] = [];
  const businesses = new Map(db.all<{ id: string; name: string }>('SELECT id, name FROM businesses').map((b) => [b.id, b.name]));
  const readable = db.all<LogicalRow & { created_at: string }>(`${LOGICAL_SELECT}ORDER BY l.created_at DESC, l.id ASC LIMIT 2000`)
    .filter((l) => can(actor, 'document.read', documentObj(db, l)))
    .map((l): CentreRow & { newest_at: string; ord: number } => {
      const versions = db.all<VersionRow>(`${VERSION_SELECT}WHERE d.logical_document_id = ? ORDER BY d.version_no DESC`, [l.id]);
      const newest = versions[0];
      const newestView = newest === undefined ? null : versionView(newest);
      const anyReceived = versions.some((v) => v.strip_recorded_at !== null && v.quarantine_discharged_at !== null && v.failure_code === null);
      const stateKey = anyReceived ? 'RECEIVED' : newest !== undefined && newest.failure_code !== null ? 'REFUSED' : 'NOT_RECEIVED';
      const claims = db.all<{ id: string; claim_ref: string; business_id: string; property: string | null }>(
        'SELECT c.id, c.claim_ref, c.business_id, p.label AS property FROM document_links k JOIN claims c ON c.id = k.claim_id LEFT JOIN properties p ON p.id = c.property_id ' +
          'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL ORDER BY c.claim_ref ASC',
        [l.id],
      ).map((c) => {
        const surveyors = db.all<{ surveyor_id: string }>(
          'SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE claim_id = ? AND surveyor_id IS NOT NULL', [c.id]).map((r) => r.surveyor_id);
        const open = can(actor, 'claim.read', { type: 'claim', id: c.id, business_id: c.business_id, assigned_surveyor_ids: surveyors });
        return { id: c.id, claim_ref: c.claim_ref, property: c.property, href: open ? `/staff/claims/${c.id}` : null };
      });
      return {
        id: l.id, label: documentLabel(l.label, l.seq), type: { code: l.type_code, label: l.label },
        organisation: {
          id: l.business_id, name: businesses.get(l.business_id) ?? 'an organisation',
          href: can(actor, 'organisation.read', { type: 'business', id: l.business_id }) ? `/staff/clients/${l.business_id}` : null,
        },
        claims, state: { key: stateKey, label: CENTRE_STATES[stateKey] ?? stateKey },
        newest: newest === undefined || newestView === null ? null
          : { version_no: newest.version_no, uploaded: newestView.uploaded, by: newestView.by },
        versions: versions.length, href: `/staff/documents/${l.id}`,
        newest_at: newest?.created_at ?? l.created_at,
        ord: db.get<{ ord: number }>('SELECT ord FROM document_types WHERE code = ?', [l.type_code])?.ord ?? 0,
      };
    });

  const choices: Record<string, readonly CentreChoice[]> = {
    type: distinctChoices(readable.map((r) => [r.type.code, r.type.label] as const)),
    organisation: distinctChoices(readable.map((r) => [r.organisation.id, r.organisation.name] as const)),
    claim: distinctChoices(readable.flatMap((r) => r.claims.map((c) => [c.id, `${r.organisation.name} — ${c.property ?? 'claim'} (${c.claim_ref})`] as const))),
    state: Object.entries(CENTRE_STATES).map(([value, label]) => ({ value, label })),
  };

  let rows = readable;
  const applied: { key: string; label: string; value: string }[] = [];
  for (const f of CENTRE_FILTERS) {
    const v = (q.get(f.key) ?? '').trim();
    if (v === '') continue;
    const choice = (choices[f.key] ?? []).find((c) => c.value === v);
    if (choice === undefined) { said.push(`${f.label}: not one of the choices this list offers you, so it was not applied`); continue; }
    rows = rows.filter((r) => f.key === 'type' ? r.type.code === v
      : f.key === 'organisation' ? r.organisation.id === v
        : f.key === 'claim' ? r.claims.some((c) => c.id === v)
          : r.state.key === v);
    applied.push({ key: f.key, label: f.label, value: choice.label });
  }
  const known = new Set([...CENTRE_FILTERS.map((f) => f.key as string), 'sort']);
  for (const k of new Set(q.keys())) if (!known.has(k)) said.push(`${k.slice(0, 40)}: not a filter this list offers, so it was not applied`);
  const askedSort = (q.get('sort') ?? '').trim();
  const sort = askedSort !== '' && Object.hasOwn(CENTRE_SORTS, askedSort) ? askedSort : 'newest';
  if (askedSort !== '' && sort !== askedSort) said.push('Order: not one of the orders offered, so the list is newest first');
  const sorted = [...rows].sort((a, b) => {
    const newestFirst = a.newest_at < b.newest_at ? 1 : a.newest_at > b.newest_at ? -1 : a.id.localeCompare(b.id);
    if (sort === 'type') return a.ord - b.ord || a.label.localeCompare(b.label) || newestFirst;
    if (sort === 'organisation') return a.organisation.name.localeCompare(b.organisation.name) || a.ord - b.ord || newestFirst;
    return newestFirst;
  });

  return {
    rows: sorted.map(({ newest_at: _n, ord: _o, ...r }) => r),
    read: readable.length, applied, said,
    sort: { key: sort, label: CENTRE_SORTS[sort] ?? sort },
    filters: CENTRE_FILTERS, choices,
    sorts: Object.entries(CENTRE_SORTS).map(([value, label]) => ({ value, label })),
    never: CENTRE_NEVER,
  };
}

/**
 * PHASE 133a — THE GATE OF THE DOCUMENT CENTRE, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function documentCentreGate(actor: Actor): void {
  authorise(actor, 'document_centre.enter', CENTRE_OBJ);
}

/**
 * PHASE 133a — THE GATE OF THE DOCUMENT TYPES, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function documentTypesGate(actor: Actor): void {
  authorise(actor, 'document_type.read', TYPES_OBJ);
}

/* ================================================================== *
 * 10 · THE CLIENT'S FILES — PHASE 140, 21 September 2026
 *
 * Lakhbir: "There is no folder icon which allows the user to see what the customer has uploaded, but also the ability to
 * upload and save documents ourselves within the portal."
 *
 * ONE PLACE FOR A COMPANY'S FILES, IN FOLDERS: From the client, From Cap Rebate, Asked for (still waiting), and one folder
 * per claim. A folder is a way of looking, not a place a file is put — a lease the client sent for one claim is in "From
 * the client" and in that claim's folder. EVERY FILE IS STILL ASKED OF `document.read` ON ITS OWN, exactly as the claim
 * panel asks, so a login sees in a folder only what it could open; the requests are shown only to
 * `document_request.read`.
 *
 * WHAT WE READ FROM A FILE IS SAID IN COUNTS, NEVER IN ITS WORDS: the pages read, the parts kept, the parts taken out —
 * from the upload handler's own record of each step (`document_events`). No route here reads what a file says.
 * ================================================================== */

export type FolderKey = 'client' | 'ours' | 'asked' | `claim-${string}`;

export type FolderFile = {
  readonly id: string;
  /** "Lease 2" — a document is named by its type and number, never by the client's file name (N2). */
  readonly name: string;
  readonly type: string;
  readonly href: string;
  readonly from: 'CLIENT' | 'US';
  /** "The client", or "Cap Rebate — <the person who sent it>". */
  readonly sender: string;
  /** The day the newest version arrived. */
  readonly sent: string;
  readonly versions: number;
  /** What we read from it, in short lines a person can read. */
  readonly read: readonly string[];
  readonly state: 'READ' | 'WAITING' | 'REFUSED';
  readonly shown_to_client: boolean;
  /** A kept original this reader may open, or the words that say there is none. Never a broken link. */
  readonly original: { readonly kept: true; readonly href: string | null } | { readonly kept: false; readonly words: string };
  readonly claim_ids: readonly string[];
  /** PHASE 142: the message this file came with, on the thread with the client — a link back to it. Absent otherwise. */
  readonly message_href?: string;
};

export type Folder = { readonly key: FolderKey; readonly name: string; readonly count: number; readonly ref?: string };

export type ClientFolder = {
  readonly business_id: string;
  readonly company: string;
  readonly folders: readonly Folder[];
  readonly files: readonly FolderFile[];
  /** Still waiting — the open requests, where this reader may read requests. */
  readonly asked: readonly RequestView[] | null;
  readonly claims: readonly { readonly id: string; readonly name: string; readonly ref: string }[];
  readonly may_upload: boolean;
  readonly may_show: boolean;
  readonly upload_types: readonly { readonly code: string; readonly label: string }[];
};

type FolderVersionRow = {
  id: string; version_no: number | null; created_at: string; state: string; strip_recorded_at: string | null;
  quarantine_discharged_at: string | null; failure_code: string | null; original_kept_at: string | null;
  original_delete_after: string | null; original_deleted_at: string | null;
};

const FAILURE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  E_UPLOAD_REJECTED: 'We could not use it: it is not a kind of file we accept, or it is too big.',
  E_UNRECOGNISED_DOC_TYPE: 'We could not use it: we could not tell what kind of document it is.',
});

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * What the handler recorded reading, in counts. Steps 4 and 5 of the receipt contract, as the handler wrote them.
 * PHASE 144: exported so the portal's own document page says the same counts as the staff Files folder. It reads only
 * the version's failure code, its two receipt times and the handler's page and part COUNTS — no words from the file, no
 * note, no figure — so it is safe for the client who sent the file.
 */
export function readLines(
  db: Db, v: Pick<FolderVersionRow, 'id' | 'failure_code' | 'strip_recorded_at' | 'quarantine_discharged_at'>,
): { state: FolderFile['state']; lines: string[] } {
  if (v.failure_code !== null) {
    return { state: 'REFUSED', lines: [FAILURE_WORDS[v.failure_code] ?? 'We could not use it. Ask for it again.'] };
  }
  if (v.strip_recorded_at === null || v.quarantine_discharged_at === null) return { state: 'WAITING', lines: ['Not read yet.'] };
  const ev = new Map(db.all<{ contract_step: number; detail_json: string }>(
    'SELECT contract_step, detail_json FROM document_events WHERE doc_id = ? AND contract_step IN (4, 5) AND outcome = ? ORDER BY at ASC',
    [v.id, 'ok']).map((e) => [e.contract_step, JSON.parse(e.detail_json) as Record<string, unknown>] as const));
  const pages = Number(ev.get(4)?.pages ?? NaN);
  const kept = Number(ev.get(5)?.retained ?? NaN);
  const removed = Array.isArray(ev.get(5)?.removed) ? (ev.get(5)?.removed as unknown[]).length : NaN;
  const lines: string[] = [];
  if (Number.isFinite(pages)) lines.push(`We read ${plural(pages, 'page', 'pages')}.`);
  if (Number.isFinite(kept)) lines.push(kept === 0 ? 'We did not need to keep any of its text.' : `We kept ${plural(kept, 'part', 'parts')} of its text.`);
  if (Number.isFinite(removed) && removed > 0) lines.push(`We took out ${plural(removed, 'part', 'parts')} we must not keep.`);
  if (lines.length === 0) lines.push('We read it.');
  return { state: 'READ', lines };
}

/**
 * A COMPANY'S FILES, IN FOLDERS, FOR THIS READER. The caller has already read the company through the organisation's own
 * rule and passes its claims as that read returned them, so a claim this reader may not see gets no folder.
 */
export function clientFolder(
  d: { db: Db; now: () => string }, actor: Actor,
  org: { id: string; trading_name: string; claims: readonly { id: string; property: string | null; claim_ref: string }[] },
): ClientFolder {
  const db = d.db;
  const nowIso = d.now();
  const logical = db.all<LogicalRow & { created_role: string | null; created_name: string | null }>(
    'SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, ' +
      't.retention_ref AS type_retention, u.role AS created_role, u.display_name AS created_name FROM logical_documents l ' +
      'JOIN document_types t ON t.code = l.type_code LEFT JOIN users u ON u.id = l.created_by WHERE l.business_id = ? ' +
      'ORDER BY l.created_at DESC, l.seq DESC', [org.id]);
  const claimIds = new Set(org.claims.map((c) => c.id));
  const files: FolderFile[] = [];
  for (const l of logical) {
    const obj = documentObj(db, l);
    if (!can(actor, 'document.read', obj)) continue;
    const versions = db.all<FolderVersionRow>(
      'SELECT id, version_no, created_at, state, strip_recorded_at, quarantine_discharged_at, failure_code, original_kept_at, ' +
        'original_delete_after, original_deleted_at FROM documents WHERE logical_document_id = ? ORDER BY version_no DESC', [l.id]);
    const newest = versions[0];
    const shown = versions.find((v) => v.failure_code === null && v.strip_recorded_at !== null && v.quarantine_discharged_at !== null) ?? newest;
    const read = shown === undefined ? { state: 'WAITING' as const, lines: ['Nothing has arrived yet.'] } : readLines(db, shown);
    const kept = shown !== undefined && shown.original_kept_at !== null && shown.original_deleted_at === null
      && shown.original_delete_after !== null && shown.original_delete_after > nowIso;
    const linked = db.all<{ claim_id: string }>(
      'SELECT k.claim_id FROM document_links k WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.claim_id IS NOT NULL ' +
        'UNION SELECT c.id FROM document_links k JOIN claims c ON c.property_id = k.property_id ' +
        'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.property_id IS NOT NULL', [l.id, l.id])
      .map((r) => r.claim_id).filter((id) => claimIds.has(id));
    // PHASE 142: a file that came with a message from the client is the client's, whoever pressed the button that saved it
    // (a reply by email is saved by a member of staff, once they have said what the file is).
    const msg = db.get<{ id: string; direction: string }>(
      'SELECT m.id, m.direction FROM client_message_files f JOIN client_messages m ON m.id = f.message_id WHERE f.logical_document_id = ?', [l.id]);
    const fromClient = l.created_role === 'CLIENT' || msg?.direction === 'FROM_CLIENT';
    files.push({
      id: l.id, name: documentLabel(l.label, l.seq), type: l.label, href: `/staff/documents/${l.id}`,
      from: fromClient ? 'CLIENT' : 'US',
      sender: fromClient ? 'The client' : `Cap Rebate${l.created_name === null ? '' : ` — ${l.created_name}`}`,
      sent: ukDate(localDate(newest?.created_at ?? l.created_at)), versions: versions.length,
      read: read.lines, state: read.state, shown_to_client: obj.shown_to_client === true,
      original: kept
        ? { kept: true, href: can(actor, 'document.read_original', obj) ? `/staff/documents/${l.id}/download` : null }
        : { kept: false, words: READ_AND_DELETED },
      claim_ids: linked,
      ...(msg === undefined ? {} : { message_href: `/staff/clients/${org.id}?chat=client#msg-${msg.id}` }),
    });
  }
  const reqObj = { type: 'document_request' as const, id: org.id, business_id: org.id };
  const asked = can(actor, 'document_request.read', reqObj)
    ? requestsFor(db, actor, { business_id: org.id }, nowIso).filter((r) => r.state === 'REQUESTED')
    : null;
  const claims = org.claims.map((c) => ({ id: c.id, name: c.property ?? 'Claim', ref: c.claim_ref }));
  const folders: Folder[] = [
    { key: 'client', name: 'From the client', count: files.filter((f) => f.from === 'CLIENT').length },
    { key: 'ours', name: 'From Cap Rebate', count: files.filter((f) => f.from === 'US').length },
    ...(asked === null ? [] : [{ key: 'asked' as const, name: 'Asked for — still waiting', count: asked.length }]),
    ...claims.map((c) => ({ key: `claim-${c.id}` as const, name: c.name, ref: c.ref, count: files.filter((f) => f.claim_ids.includes(c.id)).length })),
  ];
  const mayUpload = actor.role !== 'CLIENT' && can(actor, 'document.upload', { type: 'business', id: org.id });
  const mayShow = actor.role !== 'CLIENT' && can(actor, 'document.show_to_client', {
    type: 'document', id: org.id, business_id: org.id, readers: 'CLAIM_TEAM', carries_value: false, letter_signed: false, assigned_surveyor_ids: [],
  });
  return {
    business_id: org.id, company: org.trading_name, folders, files, asked, claims,
    may_upload: mayUpload, may_show: mayShow, upload_types: mayUpload ? receivableTypes(db) : [],
  };
}

/** How many files a reader may open on a company — the number beside the folder icon. The same rule as the folder. */
export function clientFileCount(db: Db, actor: Actor, business_id: string): number {
  return db.all<LogicalRow>(`${LOGICAL_SELECT}WHERE l.business_id = ?`, [business_id])
    .filter((l) => can(actor, 'document.read', documentObj(db, l))).length;
}

/** The newest kept version of a document, for the route that opens an original. Null where none is kept. */
export function keptVersionOf(db: Db, logical_id: string, nowIso: string): string | null {
  return db.get<{ id: string }>(
    'SELECT id FROM documents WHERE logical_document_id = ? AND original_kept_at IS NOT NULL AND original_deleted_at IS NULL ' +
      'AND original_delete_after > ? ORDER BY version_no DESC LIMIT 1', [logical_id, nowIso])?.id ?? null;
}
