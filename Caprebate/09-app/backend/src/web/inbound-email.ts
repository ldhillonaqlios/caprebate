/**
 * REPLIES TO contact@caprebate.co.uk, ONTO THE COMPANY'S CHAT AND TIMELINE. Phase 142, 22 September 2026 — carried from
 * Phase 141, whose Developer Spec B48 set out where a reply would land. The mailbox reader is src/stubs/email-inbound.ts,
 * switched off (INBOUND_EMAIL) until the mailbox exists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE FILING RULE, AND IT IS STRICT
 *
 *   MATCHED    the reply's In-Reply-To or References names the Message-ID of an email we sent (outbox.provider_ref), AND
 *              it comes from one of THAT email's company's contacts. Then it is a message FROM the client on the company's
 *              "With the client" thread, tagged to the same claim as our email, and on the timeline as "A reply from
 *              <contact>".
 *   QUEUED     anything else: no Message-ID of ours (NO_MATCH), or one of ours from an address that is not one of that
 *              company's contacts (NOT_A_CONTACT). It waits for Admin or Sales at /staff/replies, who read it and file it
 *              under a company themselves — a person's decision, recorded with their name.
 *   NEVER      filed by the sender's address alone. Two companies can share a contact, and anyone can type any From.
 *   DO NOT CONTACT   a matched reply from a company marked do not contact is recorded all the same — it is the client
 *              writing to us — and flagged; NOTHING IS EVER SENT BACK by this code, to anybody.
 *
 * THE TEXT PART ONLY is kept. A file in the email is counted — its type and size, never its name — and stays in the
 * mailbox. On the chat, staff say what each file is; that one file is then read from the mailbox again and received
 * through the upload path every file takes (`receiveFile`), so it lands in Files under "From the client", linked to its
 * message, and the client can see it (they sent it).
 *
 * Every step is audited: ids, the outcome, counts — never an address, a subject or the words.
 * ───────────────────────────────────────────────────────────────────────────
 */

import type { App } from '../app.ts';
import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { localStamp } from './localtime.ts';
import type { FsObjectStore } from './objectstore.ts';
import { receiveFile } from './client-files-pages.ts';
import { setShownToClient } from './documents.ts';
import type { VouchAnswer } from './document-reading.ts';
import { alertNewMessage } from './messages.ts';
import type { EmailSending, SmtpLogin } from '../stubs/email-provider.ts';
import { recordBounce } from '../stubs/email-provider.ts';
import {
  INBOUND_EMAIL, parseBounceReport, parseEmail, readingMissing, readingOn,
  type ImapLogin, type InboundEmail, type Mailbox, type ParsedEmail, type RawEmail,
} from '../stubs/email-inbound.ts';

export type InboundDeps = {
  db: Db; audit: AuditLog; now: () => string; newId: () => string;
  /** PHASE 142a: for the new-message alert a filed reply raises — off unless EMAIL_SENDING is on. */
  sending?: EmailSending; login?: SmtpLogin | null; origin?: string;
};

type Outcome = 'FILED' | 'QUEUED' | 'DO_NOT_CONTACT' | 'BOUNCE';

/** The Message-ID we stamped, as a reply names it: without the angle brackets. */
function ourEmail(db: Db, answers: readonly string[]): { id: string; business_id: string; claim_id: string | null } | null {
  for (const ref of answers) {
    const o = db.get<{ id: string; business_id: string | null; claim_id: string | null }>(
      'SELECT id, business_id, claim_id FROM outbox WHERE provider_ref = ? AND sent_at IS NOT NULL', [ref]);
    if (o !== undefined && o.business_id !== null) return { id: o.id, business_id: o.business_id, claim_id: o.claim_id };
  }
  return null;
}

/** One of this company's contacts with this address, or null. Asked of the company, never across companies. */
function contactOf(db: Db, business_id: string, address: string): string | null {
  if (address === '') return null;
  return db.get<{ id: string }>(
    'SELECT id FROM contacts WHERE business_id = ? AND lower(trim(email)) = lower(?) ORDER BY created_at LIMIT 1', [business_id, address])?.id ?? null;
}

/**
 * READ ONE EMAIL IN. Idempotent on the mailbox's own number: a message already read in is skipped. Returns the outcome,
 * or null when it was already there.
 */
export function ingest(d: InboundDeps, mail: RawEmail, parsed: ParsedEmail = parseEmail(mail.raw)): Outcome | null {
  const uid = String(mail.uid);
  if (d.db.get('SELECT id FROM inbound_email WHERE mailbox_uid = ?', [uid]) !== undefined) return null;
  if (d.db.get('SELECT id FROM inbound_bounce_notices WHERE mailbox_uid = ?', [uid]) !== undefined) return null;
  /* PHASE 146f: A DELIVERY REPORT IS NOT A REPLY. It is matched to the email of ours it names, recorded as a bounce, and
     never filed on a chat or queued for staff. A HARD one stops further email to that address. */
  const report = parseBounceReport(mail.raw);
  if (report !== null) {
    const at = d.now();
    const ours = report.original_message_id === null ? undefined
      : d.db.get<{ id: string }>('SELECT id FROM outbox WHERE provider_ref = ? AND sent_at IS NOT NULL', [report.original_message_id]);
    const id = d.newId();
    let bounce: string | null = null;
    d.db.tx(() => {
      if (ours !== undefined) bounce = recordBounce(d.db, d.now, ours.id, { kind: report.kind, status: report.status, source: 'REPORT' });
      d.db.run('INSERT INTO inbound_bounce_notices (id, mailbox_uid, received_at, matched_outbox_id, bounce_id) VALUES (?, ?, ?, ?, ?)',
        [id, uid, at, ours?.id ?? null, bounce]);
    });
    d.audit.append({
      at, kind: 'EMAIL_BOUNCED', outcome: 'ALLOWED', actor_id: null, actor_role: 'SYSTEM',
      object_type: 'outbox', object_id: ours?.id ?? null,
      detail: { source: 'REPORT', bounce: report.kind, status: report.status, matched: ours !== undefined },
    });
    return 'BOUNCE';
  }
  const ours = ourEmail(d.db, parsed.answers);
  const contact = ours === null ? null : contactOf(d.db, ours.business_id, parsed.from_address);
  const id = d.newId();
  const at = d.now();
  const text = parsed.text === '' ? '(The email had no words in it.)' : parsed.text;
  let outcome: Outcome;
  let message: string | null = null;
  d.db.tx(() => {
    if (ours !== null && contact !== null) {
      const dnc = d.db.get<{ s: string | null }>('SELECT client_status AS s FROM businesses WHERE id = ?', [ours.business_id])?.s === 'DO_NOT_CONTACT';
      outcome = dnc ? 'DO_NOT_CONTACT' : 'FILED';
      message = d.newId();
      d.db.run(
        'INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)',
        [message, ours.business_id, ours.claim_id, 'FROM_CLIENT', 'EMAIL', contact, text.slice(0, 8000), at]);
    } else {
      outcome = 'QUEUED';
    }
    d.db.run(
      'INSERT INTO inbound_email (id, received_at, mailbox_uid, message_id, from_address, subject, text_body, matched_outbox_id, business_id, claim_id, ' +
        'contact_id, outcome, queue_reason, client_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, at, uid, parsed.message_id, parsed.from_address, parsed.subject, text, ours?.id ?? null,
        outcome === 'QUEUED' ? null : ours?.business_id ?? null, outcome === 'QUEUED' ? null : ours?.claim_id ?? null, contact,
        outcome, outcome === 'QUEUED' ? (ours === null ? 'NO_MATCH' : 'NOT_A_CONTACT') : null, message]);
    parsed.files.forEach((f, i) => {
      d.db.run('INSERT INTO inbound_email_files (id, inbound_email_id, part_no, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)',
        [d.newId(), id, i + 1, f.content_type, f.bytes.length]);
    });
  });
  const o = outcome!;
  d.audit.append({
    at, kind: 'INBOUND_EMAIL_RECEIVED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
    object_type: 'inbound_email', object_id: id,
    detail: { outcome: o, business: o === 'QUEUED' ? null : ours?.business_id ?? null, message, files: parsed.files.length },
  });
  // PHASE 142a: a reply filed on a company's chat tells its owner, as a portal message does. Off unless sending is on.
  if (o === 'FILED' && message !== null) alertNewMessage(d, message);
  return o;
}

export type ReadResult =
  | { readonly state: 'OFF'; readonly missing: readonly string[] }
  | { readonly state: 'RAN'; readonly read: number; readonly filed: number; readonly queued: number; readonly do_not_contact: number; readonly bounces: number };

/** READ EVERY NEW REPLY. OFF returns at once and opens no connection. */
export async function readMailbox(d: InboundDeps, cfg: InboundEmail, login: ImapLogin | null, mailbox: Mailbox | null): Promise<ReadResult> {
  if (!readingOn(cfg, login) || mailbox === null) return { state: 'OFF', missing: readingMissing(cfg, login) };
  const last = d.db.get<{ n: number | null }>(
    'SELECT MAX(n) AS n FROM (SELECT MAX(CAST(mailbox_uid AS INTEGER)) AS n FROM inbound_email ' +
      'UNION ALL SELECT MAX(CAST(mailbox_uid AS INTEGER)) FROM inbound_bounce_notices)')?.n ?? 0;
  let read = 0, filed = 0, queued = 0, dnc = 0, bounced = 0;
  for (const m of await mailbox.since(last)) {
    const o = ingest(d, m);
    if (o === null) continue;
    read++;
    if (o === 'FILED') filed++; else if (o === 'QUEUED') queued++; else if (o === 'BOUNCE') bounced++; else dnc++;
  }
  return { state: 'RAN', read, filed, queued, do_not_contact: dnc, bounces: bounced };
}

/* ================================================================== *
 * THE QUEUE — replies the reader could not file
 * ================================================================== */

export type QueuedReply = {
  readonly id: string;
  readonly when: string;
  readonly from_address: string;
  readonly subject: string;
  readonly text: string;
  readonly why: string;
  readonly files: number;
};

const QUEUE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  NO_MATCH: 'It is not a reply to an email we sent.',
  NOT_A_CONTACT: 'It answers one of our emails, but from an address that is not one of that company’s contacts.',
});

const queueObj = { type: 'inbound_email' as const, id: 'queue' };

export function mayReadQueue(actor: Actor): boolean {
  return can(actor, 'inbound_email.read', queueObj);
}

/** EVERY REPLY STILL WAITING TO BE FILED, oldest first. Admin and Sales. */
export function replyQueue(db: Db, actor: Actor): QueuedReply[] {
  authorise(actor, 'inbound_email.read', queueObj);
  return db.all<{ id: string; received_at: string; from_address: string; subject: string; text_body: string; queue_reason: string; files: number }>(
    'SELECT e.id, e.received_at, e.from_address, e.subject, e.text_body, e.queue_reason, ' +
      '(SELECT COUNT(*) FROM inbound_email_files f WHERE f.inbound_email_id = e.id) AS files FROM inbound_email e ' +
      "WHERE e.outcome = 'QUEUED' AND NOT EXISTS (SELECT 1 FROM inbound_email_filings g WHERE g.inbound_email_id = e.id) " +
      'ORDER BY e.received_at ASC')
    .map((r) => ({ id: r.id, when: localStamp(r.received_at), from_address: r.from_address, subject: r.subject, text: r.text_body,
      why: QUEUE_WORDS[r.queue_reason] ?? 'We could not tell which company it is from.', files: r.files }));
}

/**
 * FILE A QUEUED REPLY UNDER A COMPANY — a person's decision. It becomes a message from the client on that company's chat,
 * naming the contact where the address is one of theirs. The database refuses a reply that is not waiting in the queue,
 * and a second filing of the same reply.
 */
export function fileQueued(d: InboundDeps, actor: Actor, inbound_id: string, business_id: string): { ok: true; message_id: string } | { ok: false; why: string } {
  authorise(actor, 'inbound_email.file', { type: 'inbound_email', id: inbound_id });
  const e = d.db.get<{ id: string; from_address: string; text_body: string }>(
    "SELECT id, from_address, text_body FROM inbound_email WHERE id = ? AND outcome = 'QUEUED' " +
      'AND NOT EXISTS (SELECT 1 FROM inbound_email_filings g WHERE g.inbound_email_id = inbound_email.id)', [inbound_id]);
  if (e === undefined) throw new NotFoundAsRefusal();
  if (d.db.get('SELECT id FROM businesses WHERE id = ?', [business_id]) === undefined) return { ok: false, why: 'Choose a company.' };
  authorise(actor, 'client_message.write', { type: 'client_message', id: business_id, business_id });
  const contact = contactOf(d.db, business_id, e.from_address);
  const message = d.newId();
  const at = d.now();
  d.db.tx(() => {
    d.db.run(
      'INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?)',
      [message, business_id, 'FROM_CLIENT', 'EMAIL', contact, e.text_body.slice(0, 8000), at]);
    d.db.run('INSERT INTO inbound_email_filings (id, inbound_email_id, business_id, claim_id, client_message_id, filed_by, filed_at) VALUES (?, ?, ?, NULL, ?, ?, ?)',
      [d.newId(), e.id, business_id, message, actor.id, at]);
  });
  d.audit.append({
    at, kind: 'INBOUND_EMAIL_FILED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'inbound_email', object_id: e.id, detail: { business: business_id, message, contact_known: contact !== null },
  });
  return { ok: true, message_id: message };
}

/* ================================================================== *
 * A FILE IN AN EMAILED REPLY — saved to Files once staff say what it is
 * ================================================================== */

export type EmailedFile = { readonly id: string; readonly label: string };

function sizeWords(n: number): string {
  return n < 1024 ? `${n} bytes` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const TYPE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  'application/pdf': 'PDF', 'image/jpeg': 'photo', 'image/png': 'picture',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word file',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel file',
});

/** The files of an emailed message that nobody has saved yet — for staff who may file replies. Empty for anyone else. */
export function unsavedFiles(db: Db, actor: Actor, message_id: string): EmailedFile[] {
  if (!mayReadQueue(actor)) return [];
  return db.all<{ id: string; part_no: number; content_type: string; size_bytes: number }>(
    'SELECT f.id, f.part_no, f.content_type, f.size_bytes FROM inbound_email_files f JOIN inbound_email e ON e.id = f.inbound_email_id ' +
      'LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id ' +
      'WHERE (e.client_message_id = ? OR g.client_message_id = ?) AND NOT EXISTS (SELECT 1 FROM inbound_email_file_saves s WHERE s.inbound_email_file_id = f.id) ' +
      'ORDER BY f.part_no', [message_id, message_id])
    .map((f) => ({ id: f.id, label: `File ${f.part_no} — a ${TYPE_WORDS[f.content_type] ?? 'file'}, ${sizeWords(f.size_bytes)}` }));
}

/**
 * SAVE ONE FILE OF AN EMAILED REPLY TO THE COMPANY'S FILES. The file is read from the mailbox again (read-only), then
 * received through `receiveFile` — the path every upload takes — as the member of staff who said what it is. It is linked
 * to its message, so it sits in "From the client", and the client may see it: they sent it.
 */
export async function saveEmailedFile(
  d: { app: App; store: FsObjectStore; newId: () => string }, actor: Actor, file_id: string, type_code: string, mailbox: Mailbox | null,
  /** PHASE 146j: the answer to the question about a name, given where staff say what the file is. */
  early_vouch: readonly { readonly field_id: string; readonly answer: VouchAnswer }[] = [],
): Promise<{ ok: true; business_id: string } | { ok: false; why: string }> {
  authorise(actor, 'inbound_email.file', { type: 'inbound_email', id: file_id });
  const db = d.app.db;
  const f = db.get<{ id: string; part_no: number; uid: string; message: string | null; business_id: string | null; claim_id: string | null }>(
    'SELECT f.id, f.part_no, e.mailbox_uid AS uid, COALESCE(e.client_message_id, g.client_message_id) AS message, ' +
      'COALESCE(e.business_id, g.business_id) AS business_id, e.claim_id FROM inbound_email_files f ' +
      'JOIN inbound_email e ON e.id = f.inbound_email_id LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id WHERE f.id = ?', [file_id]);
  if (f === undefined || f.message === null || f.business_id === null) throw new NotFoundAsRefusal();
  if (db.get('SELECT id FROM inbound_email_file_saves WHERE inbound_email_file_id = ?', [f.id]) !== undefined) return { ok: false, why: 'That file is already saved.' };
  if (type_code.trim() === '') return { ok: false, why: 'Choose what the file is.' };
  if (mayReadQueue(actor) === false) throw new NotFoundAsRefusal();
  if (mailbox === null) return { ok: false, why: 'We cannot reach the mailbox right now, so the file cannot be fetched. Try again later.' };
  let got: RawEmail | null;
  try { got = await mailbox.one(Number(f.uid)); } catch { return { ok: false, why: 'We cannot reach the mailbox right now. Try again later.' }; }
  const part = got === null ? undefined : parseEmail(got.raw).files[f.part_no - 1];
  if (part === undefined) return { ok: false, why: 'That email is no longer in the mailbox, so the file cannot be fetched.' };
  const r = await receiveFile(d, actor, { business_id: f.business_id, type_code, logical_document_id: null, request_id: null, claim_id: f.claim_id, early_vouch }, part.bytes);
  if (!r.ok) return r;
  const at = d.app.now();
  db.tx(() => {
    db.run('INSERT INTO client_message_files (id, message_id, logical_document_id, linked_at) VALUES (?, ?, ?, ?)', [d.newId(), f.message, r.logical_document_id, at]);
    db.run('INSERT INTO inbound_email_file_saves (id, inbound_email_file_id, logical_document_id, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)',
      [d.newId(), f.id, r.logical_document_id, actor.id, at]);
  });
  // The client sent it, so the client may see it — said as a row, as every change of who may see a file is.
  setShownToClient({ db, audit: d.app.audit, now: d.app.now, newId: d.newId }, actor, r.logical_document_id, true);
  d.app.audit.append({
    at, kind: 'INBOUND_EMAIL_FILE_SAVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'document', object_id: r.logical_document_id, detail: { message: f.message, part: f.part_no },
  });
  return { ok: true, business_id: f.business_id };
}

export { INBOUND_EMAIL };
