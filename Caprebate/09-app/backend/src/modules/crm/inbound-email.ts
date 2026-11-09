/**
 * REPLIES TO contact@caprebate.co.uk, ONTO THE COMPANY'S CHAT AND TIMELINE. Carried from
 * Whose Developer Spec B48 set out where a reply would land. The mailbox reader is src/integrations/email/email-inbound.ts,
 * switched off (INBOUND_EMAIL) until the mailbox exists.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE FILING RULE, AND IT IS STRICT
 *
 *   MATCHED    the reply's In-Reply-To or References names the Message-ID of an email we sent (outbox.provider_ref), AND
 *              it comes from one of THAT email's company's contacts — or (1, now that staff may type any
 *              address in To) from THE VERY ADDRESS THAT EMAIL WENT TO: it answers our own random Message-ID, from the
 *              address we wrote to, which nobody else could know to fake. Then it is a message FROM the client on the company's
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

import type { App } from '../../core/app.ts';
import type { Db } from '../../core/index.ts';
import type { AuditLog } from '../../core/audit.ts';
import { authorise, can, type Actor } from '../../core/index.ts';
import { NotFoundAsRefusal } from '../../core/index.ts';
import { localPartsOf, localStamp } from '../../shared/index.ts';
import type { FsObjectStore } from '../../shared/objectstore.ts';
import { receiveFile } from '../portal/index.ts';
import { setShownToClient } from '../claims/index.ts';
import type { VouchAnswer } from '../claims/index.ts';
import { alertNewMessage } from './messages.ts';
import type { EmailSending, SmtpLogin } from '../../integrations/index.ts';
import { recordBounce } from '../../integrations/index.ts';
import {
  INBOUND_EMAIL, imapLoginFromKeyFile, imapMailbox, parseBounceReport, parseEmail, readingMissing, readingOn,
  type ImapLogin, type InboundEmail, type Mailbox, type ParsedEmail, type RawEmail,
} from '../../integrations/index.ts';
import { auditMailConnections } from '../../integrations/index.ts';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { SecretStore } from '../../core/index.ts';
import { redactSecrets } from '../../core/index.ts';
import { STATE_WORDS } from './email-chains.ts';
import { getInboundBounceNoticesIdByMailboxUid, getInboundEmailFileSavesIdByInboundEmailFileId, getInboundEmailFilesIdPartNoById, getInboundEmailIdByMailboxUid, getInboundEmailIdFromAddressByIdOutcome, getInboundEmailN, getInboundEmailXByMailboxUid, getMailboxReadsLastOkAtLastFailedById, getMailboxWatermarkUidById, getOutboxIdBusinessIdByProviderRefSentAt, getOutboxIdByProviderRefSentAt, insertInboundBounceNotices, insertInboundEmail, insertInboundEmailFileSaves, insertInboundEmailFiles, insertInboundEmailFilings, insertInboundEmailFilings2, insertMailboxReads, insertMailboxWatermark, insertMailboxWatermarkByUid, listInboundEmailFilesIdPartNoByClientMessageId, listInboundEmailFilesIdReceivedAtByInboundEmailIdOutcome, listInboundEmailIdFromAddressByOutcomeBusinessId } from '../../integrations/index.ts';
import { listInboundEmailUidAt, listOutboxAtToEmailByKind } from './data-borrowed.ts';
import { getEmailSenderA } from '../admin/index.ts';
import { getBusinessesIdById, getBusinessesSById, getContactsIdByBusinessId, insertClientMessageFiles, insertClientMessages2, insertClientMessages3 } from './data.ts';

export type InboundDeps = {
  db: Db; audit: AuditLog; now: () => string; newId: () => string;
  /** For the new-message alert a filed reply raises — off unless EMAIL_SENDING is on. */
  sending?: EmailSending; login?: SmtpLogin | null; origin?: string;
};

type Outcome = 'FILED' | 'QUEUED' | 'DO_NOT_CONTACT' | 'BOUNCE';

/** The Message-ID we stamped, as a reply names it: without the angle brackets. */
function ourEmail(db: Db, answers: readonly string[]): { id: string; business_id: string; claim_id: string | null; to_email: string } | null {
  for (const ref of answers) {
    const o = getOutboxIdBusinessIdByProviderRefSentAt<{ id: string; business_id: string | null; claim_id: string | null; to_email: string }>(db, [ref]);
    if (o !== undefined && o.business_id !== null) return { id: o.id, business_id: o.business_id, claim_id: o.claim_id, to_email: o.to_email };
  }
  return null;
}

/** The plain address inside "Name <address>", lower case. */
function plainAddress(a: string): string {
  return (/<([^<>\s]+@[^<>\s]+)>\s*$/.exec(a)?.[1] ?? a).trim().toLowerCase();
}

/** One of this company's contacts with this address, or null. Asked of the company, never across companies. */
function contactOf(db: Db, business_id: string, address: string): string | null {
  if (address === '') return null;
  return getContactsIdByBusinessId<{ id: string }>(db, [business_id, address])?.id ?? null;
}

/**
 * READ ONE EMAIL IN. Idempotent on the mailbox's own number: a message already read in is skipped. Returns the outcome,
 * or null when it was already there.
 */
export function ingest(d: InboundDeps, mail: RawEmail, parsed: ParsedEmail = parseEmail(mail.raw)): Outcome | null {
  const uid = String(mail.uid);
  if (getInboundEmailIdByMailboxUid(d.db, [uid]) !== undefined) return null;
  if (getInboundBounceNoticesIdByMailboxUid(d.db, [uid]) !== undefined) return null;
  /* A DELIVERY REPORT IS NOT A REPLY. It is matched to the email of ours it names, recorded as a bounce, and
     never filed on a chat or queued for staff. A HARD one stops further email to that address. */
  const report = parseBounceReport(mail.raw);
  if (report !== null) {
    const at = d.now();
    const ours = report.original_message_id === null ? undefined
      : getOutboxIdByProviderRefSentAt<{ id: string }>(d.db, [report.original_message_id]);
    const id = d.newId();
    let bounce: string | null = null;
    d.db.tx(() => {
      if (ours !== undefined) bounce = recordBounce(d.db, d.now, ours.id, { kind: report.kind, status: report.status, source: 'REPORT' });
      insertInboundBounceNotices(d.db, [id, uid, at, ours?.id ?? null, bounce]);
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
  // From the very address our email went to (typed in To, not a contact) — it answers our own Message-ID.
  const toWhomWeWrote = ours !== null && contact === null && parsed.from_address.trim() !== '' && plainAddress(ours.to_email) === plainAddress(parsed.from_address);
  const id = d.newId();
  const at = d.now();
  const text = parsed.text === '' ? '(The email had no words in it.)' : parsed.text;
  let outcome: Outcome;
  let message: string | null = null;
  d.db.tx(() => {
    if (ours !== null && (contact !== null || toWhomWeWrote)) {
      const dnc = getBusinessesSById<{ s: string | null }>(d.db, [ours.business_id])?.s === 'DO_NOT_CONTACT';
      outcome = dnc ? 'DO_NOT_CONTACT' : 'FILED';
      message = d.newId();
      insertClientMessages2(d.db, [message, ours.business_id, ours.claim_id, 'FROM_CLIENT', 'EMAIL', contact, text.slice(0, 8000), at]);
    } else {
      outcome = 'QUEUED';
    }
    insertInboundEmail(d.db, [id, at, uid, parsed.message_id, parsed.from_address, parsed.subject, text, ours?.id ?? null,
        outcome === 'QUEUED' ? null : ours?.business_id ?? null, outcome === 'QUEUED' ? null : ours?.claim_id ?? null, contact,
        outcome, outcome === 'QUEUED' ? (ours === null ? 'NO_MATCH' : 'NOT_A_CONTACT') : null, message]);
    parsed.files.forEach((f, i) => {
      insertInboundEmailFiles(d.db, [d.newId(), id, i + 1, f.content_type, f.bytes.length]);
    });
  });
  const o = outcome!;
  d.audit.append({
    at, kind: 'INBOUND_EMAIL_RECEIVED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
    object_type: 'inbound_email', object_id: id,
    detail: { outcome: o, business: o === 'QUEUED' ? null : ours?.business_id ?? null, message, files: parsed.files.length },
  });
  // A reply filed on a company's chat tells its owner, as a portal message does. Off unless sending is on.
  if (o === 'FILED' && message !== null) alertNewMessage(d, message);
  return o;
}

export type ReadResult =
  | { readonly state: 'OFF'; readonly missing: readonly string[] }
  | { readonly state: 'RAN'; readonly read: number; readonly filed: number; readonly queued: number; readonly do_not_contact: number; readonly bounces: number;
      /** 30 Sep 2026: true on the first read, which only noted where the inbox stood and read nothing (migration 064). */
      readonly started?: true };

/** READ EVERY NEW REPLY. OFF returns at once and opens no connection. */
export async function readMailbox(d: InboundDeps, cfg: InboundEmail, login: ImapLogin | null, mailbox: Mailbox | null): Promise<ReadResult> {
  if (!readingOn(cfg, login) || mailbox === null) return { state: 'OFF', missing: readingMissing(cfg, login) };
  const kept = getInboundEmailN<{ n: number | null }>(d.db)?.n ?? null;
  const mark = getMailboxWatermarkUidById<{ uid: number }>(d.db)?.uid ?? null;
  /* 30 Sep 2026: THE FIRST READ ONLY NOTES WHERE THE INBOX STANDS. Nothing read yet and nothing noted: note the highest
     message number and read nothing, so mail that was already there is never brought in (migration 064). */
  if (kept === null && mark === null && mailbox.highestUid !== undefined) {
    const top = await mailbox.highestUid();
    insertMailboxWatermark(d.db, [top, d.now()]);
    const r = await repliesToOurs(d, mailbox, top);
    return { state: 'RAN', read: r, filed: r, queued: 0, do_not_contact: 0, bounces: 0, started: true };
  }
  const last = Math.max(kept ?? 0, mark ?? 0);
  let read = 0, filed = 0, queued = 0, dnc = 0, bounced = 0, top = last;
  for (const m of await mailbox.since(last)) {
    top = Math.max(top, m.uid);
    const o = ingest(d, m);
    if (o === null) continue;
    read++;
    if (o === 'FILED') filed++; else if (o === 'QUEUED') queued++; else if (o === 'BOUNCE') bounced++; else dnc++;
  }
  // A reply to one of OUR emails is never "mail that was already there", whenever it arrived.
  const late = await repliesToOurs(d, mailbox, last);
  read += late; filed += late;
  // And one set aside before today's rule existed is filed by it now (migration 068).
  filed += fileByRule(d);
  // Move the mark past everything looked at, so a message this reader passes over is not fetched again next time.
  if (top > (mark ?? 0)) {
    insertMailboxWatermarkByUid(d.db, [top, d.now()]);
  }
  return { state: 'RAN', read, filed, queued, do_not_contact: dnc, bounces: bounced };
}

/**
 * 1 OCT 2026 — A REPLY TO ONE OF OUR EMAILS IS NEVER SKIPPED. The first read notes where the inbox stands and reads
 * nothing before it, so the mail that was there at switch-on never comes in. But on the test website the first read
 * happened only when somebody first looked — after the owner's replies to the site's own emails had arrived — so they
 * were passed over with the rest. Now every read also asks the inbox (read-only, one header) for messages answering a
 * Message-ID of our domain at or below the mark, and takes in each one not already read that answers an email this
 * site really sent — and only those: nothing else from before the mark comes in. Returns how many it filed.
 */
async function repliesToOurs(d: InboundDeps, mailbox: Mailbox, upTo: number): Promise<number> {
  if (mailbox.answering === undefined || upTo <= 0) return 0;
  const domain = (currentSenderDomain(d.db) ?? '').toLowerCase();
  if (domain === '') return 0;
  let filed = 0;
  let found: number[];
  // A server that cannot search one header must not stop the ordinary read: this pass is a second look, not the read.
  try { found = await mailbox.answering(domain); } catch { return 0; }
  const uids = found.filter((u) => u <= upTo).slice(-25);
  for (const uid of uids) {
    if (getInboundEmailXByMailboxUid(d.db, [String(uid)]) !== undefined) continue;
    const m = await mailbox.one(uid);
    if (m === null) continue;
    const parsed = parseEmail(m.raw);
    if (ourEmail(d.db, parsed.answers) === null) continue; // not one of ours: what was there before switch-on stays out
    if (ingest(d, m, parsed) === 'FILED') filed++;
  }
  return filed;
}

/**
 * A REPLY WAITING TO BE SORTED THAT THE RULES NOW FILE. A reply that answers one of our emails waits in
 * "Email replies to sort" when it came from an address that is not one of that company's contacts. Since today a reply
 * from the very address our email went to is filed (see `ingest`), and the company may since have added the sender as a
 * contact. Each such reply still waiting is filed on that company's conversation, tagged to our email's claim, with the
 * rule recorded in place of a person (migration 068). Nothing else in the queue moves. Returns how many it filed.
 */
export function fileByRule(d: InboundDeps): number {
  const waiting = listInboundEmailIdFromAddressByOutcomeBusinessId<{ id: string; from_address: string; text_body: string; outbox_id: string; business_id: string; claim_id: string | null; to_email: string; received_at: string }>(d.db);
  let filed = 0;
  for (const w of waiting) {
    const contact = contactOf(d.db, w.business_id, plainAddress(w.from_address));
    if (contact === null && plainAddress(w.to_email) !== plainAddress(w.from_address)) continue;
    if (getBusinessesSById<{ s: string | null }>(d.db, [w.business_id])?.s === 'DO_NOT_CONTACT') continue;
    const message = d.newId();
    const at = d.now();
    d.db.tx(() => {
      insertClientMessages2(d.db, [message, w.business_id, w.claim_id, 'FROM_CLIENT', 'EMAIL', contact, w.text_body.slice(0, 8000), at]);
      insertInboundEmailFilings2(d.db, [d.newId(), w.id, w.business_id, w.claim_id, message, 'ANSWERS_OUR_EMAIL', at]);
    });
    d.audit.append({ at, kind: 'INBOUND_EMAIL_FILED', outcome: 'ALLOWED', actor_id: null, actor_role: null, object_type: 'inbound_email', object_id: w.id,
      detail: { business: w.business_id, message, by_rule: 'ANSWERS_OUR_EMAIL', contact_known: contact !== null } });
    alertNewMessage(d, message);
    filed++;
  }
  return filed;
}

function currentSenderDomain(db: Db): string | null {
  return getEmailSenderA<{ a: string }>(db)?.a.split('@')[1] ?? null;
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
  return listInboundEmailFilesIdReceivedAtByInboundEmailIdOutcome<{ id: string; received_at: string; from_address: string; subject: string; text_body: string; queue_reason: string; files: number }>(db)
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
  const e = getInboundEmailIdFromAddressByIdOutcome<{ id: string; from_address: string; text_body: string }>(d.db, [inbound_id]);
  if (e === undefined) throw new NotFoundAsRefusal();
  if (getBusinessesIdById(d.db, [business_id]) === undefined) return { ok: false, why: 'Choose a company.' };
  authorise(actor, 'client_message.write', { type: 'client_message', id: business_id, business_id });
  const contact = contactOf(d.db, business_id, e.from_address);
  const message = d.newId();
  const at = d.now();
  d.db.tx(() => {
    insertClientMessages3(d.db, [message, business_id, 'FROM_CLIENT', 'EMAIL', contact, e.text_body.slice(0, 8000), at]);
    insertInboundEmailFilings(d.db, [d.newId(), e.id, business_id, message, actor.id, at]);
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
  return listInboundEmailFilesIdPartNoByClientMessageId<{ id: string; part_no: number; content_type: string; size_bytes: number }>(db, [message_id, message_id])
    .map((f) => ({ id: f.id, label: `File ${f.part_no} — a ${TYPE_WORDS[f.content_type] ?? 'file'}, ${sizeWords(f.size_bytes)}` }));
}

/**
 * SAVE ONE FILE OF AN EMAILED REPLY TO THE COMPANY'S FILES. The file is read from the mailbox again (read-only), then
 * received through `receiveFile` — the path every upload takes — as the member of staff who said what it is. It is linked
 * to its message, so it sits in "From the client", and the client may see it: they sent it.
 */
export async function saveEmailedFile(
  d: { app: App; store: FsObjectStore; newId: () => string }, actor: Actor, file_id: string, type_code: string, mailbox: Mailbox | null,
  /** The answer to the question about a name, given where staff say what the file is. */
  early_vouch: readonly { readonly field_id: string; readonly answer: VouchAnswer }[] = [],
): Promise<{ ok: true; business_id: string } | { ok: false; why: string }> {
  authorise(actor, 'inbound_email.file', { type: 'inbound_email', id: file_id });
  const db = d.app.db;
  const f = getInboundEmailFilesIdPartNoById<{ id: string; part_no: number; uid: string; message: string | null; business_id: string | null; claim_id: string | null }>(db, [file_id]);
  if (f === undefined || f.message === null || f.business_id === null) throw new NotFoundAsRefusal();
  if (getInboundEmailFileSavesIdByInboundEmailFileId(db, [f.id]) !== undefined) return { ok: false, why: 'That file is already saved.' };
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
    insertClientMessageFiles(db, [d.newId(), f.message, r.logical_document_id, at]);
    insertInboundEmailFileSaves(db, [d.newId(), f.id, r.logical_document_id, actor.id, at]);
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

/* ================================================================== *
 * 30 SEP 2026 — READ WHEN STAFF LOOK
 * The test website runs nothing on a timer, so replies are read when a person who may see them looks: opening a
 * client's "Everything" tab or "Email replies to sort" reads the inbox first — at most once every two minutes per copy
 * of the site — and "Check for new replies" reads it at once. A read that fails never stops the page: it is audited
 * as a mail connection, and the page draws with what is already filed.
 * ================================================================== */

const lastRead = new WeakMap<object, number>();
export const READ_EVERY_MS = 2 * 60_000;

/**
 * HOW EMAIL READING STANDS, for staff to see (and to send to whoever is looking into it). the owner's replies
 * reached the inbox but not the site, and the site's own records were the one thing that could not be seen from outside:
 * the mark, the emails received and what became of each, and the emails sent and whether each kept the Message-ID a
 * reply is matched on. Admin and Sales (`inbound_email.read`). Addresses and subjects, never an email's words.
 */
export type ReadingState = {
  readonly mark: number | null;
  readonly received: readonly { uid: string; when: string; from: string; subject: string; outcome: string; answers_ours: boolean; ours_company: string | null; filed_on: string | null; how: string | null }[];
  readonly sent: readonly { when: string; to: string; company: string | null; subject: string; state: string; id_kept: boolean }[];
};

export function readingState(db: Db, actor: Actor, nowIso: string): ReadingState {
  authorise(actor, 'inbound_email.read', queueObj);
  const mark = getMailboxWatermarkUidById<{ uid: number }>(db)?.uid ?? null;
  const received = listInboundEmailUidAt<{ uid: string; at: string; from_address: string; subject: string; outcome: string; queue_reason: string | null; matched: string | null; ours_company: string | null; filed_on: string | null; by: string | null; rule: string | null; direct: string | null }>(db).map((r) => ({
      uid: r.uid, when: localStamp(r.at, nowIso), from: r.from_address, subject: r.subject === '' ? '(no subject)' : r.subject,
      outcome: r.outcome === 'FILED' ? 'Filed' : r.outcome === 'DO_NOT_CONTACT' ? 'Filed (do not contact)' : r.filed_on !== null ? 'Filed later, from Email replies to sort' : `Waiting to sort: ${QUEUE_WORDS[r.queue_reason ?? ''] ?? r.queue_reason ?? ''}`,
      answers_ours: r.matched !== null, ours_company: r.ours_company, filed_on: r.filed_on,
      how: r.direct !== null ? 'when it came in' : r.rule !== null ? 'by the rule (it answers our email)' : r.by !== null ? `by ${r.by}` : null,
    }));
  const sent = listOutboxAtToEmailByKind<{ at: string; to_email: string; company: string | null; subject: string; sent_at: string | null; send_requested: number; last_error: string | null; provider_ref: string | null }>(db).map((r) => ({
      when: localStamp(r.at, nowIso), to: r.to_email, company: r.company, subject: r.subject,
      state: STATE_WORDS(r.sent_at, r.send_requested, r.last_error, nowIso), id_kept: r.provider_ref !== null,
    }));
  return { mark, received, sent };
}

/**
 * THE REPLY TIMER. the owner chose a free outside timer (cron-job.org) to wake the website every few
 * minutes, so replies come in with nobody on the site: POST (or GET) /hooks/read-replies with the header
 * "Authorization: Bearer <REPLY_TIMER_TOKEN>". Without that word, or with a short one set, it is refused and nothing is
 * read; compared in constant time. It reads at most once every two minutes however often it is called. Its answer is
 * counts only — never an address, a subject or a word of any email — so the timer service learns nothing.
 */
export const REPLY_TIMER_MIN_LENGTH = 32;

export function timerMayRead(store: SecretStore, authorization: string | undefined): boolean {
  return timerRefusal(store, authorization) === null;
}

/** Why the timer was refused, in words it can show (never the word itself), or null when it may read. 1 Oct 2026: the word
 *  is taken with or without "Bearer " in front, since timers' forms differ. */
export function timerRefusal(store: SecretStore, authorization: string | undefined): string | null {
  const want = (store.forOwner('REPLY_TIMER').get('REPLY_TIMER_TOKEN') ?? '').trim();
  if (want.length < REPLY_TIMER_MIN_LENGTH) return 'no word is set on the website (REPLY_TIMER_TOKEN, 32 characters or more)';
  const sent = (authorization ?? '').trim();
  if (sent === '') return 'no word was sent: add the header Authorization: Bearer <the word>';
  const got = /^Bearer\s+(\S+)$/i.exec(sent)?.[1] ?? sent;
  const a = Buffer.from(got, 'utf8'), b = Buffer.from(want, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b) ? null : 'the word sent does not match the one set on the website';
}

/** 1 Oct 2026: what the last read on this copy of the site found, in words — shown beside "Check for new email replies",
 *  so a read that fails is never silent. */
const lastOutcome = new WeakMap<object, { at: string; words: string; ok: boolean }>();
export function lastReadWords(app: App): { at: string; words: string; ok: boolean } | null {
  return lastOutcome.get(app) ?? null;
}

/**
 * — IF THE TIMER STOPS, ADMIN IS TOLD. The outside timer (cron-job.org, set up by hand:
 * A3; COORDINATES and the continuity plan say who owns it and where its history is) is the only thing that
 * reads replies while nobody is on the site. Each copy of the website kept its last read in memory, so a stopped timer
 * was silent. Every read now writes one shared row (migration 088, `mailbox_reads`: times only), and Admin's home page
 * warns when no read has worked for more than REPLY_WATCH.stale_minutes during REPLY_WATCH's hours.
 */
export const REPLY_WATCH = Object.freeze({
  /** Monday to Friday (getUTCDay numbering, as working_times), UK time. */
  days: Object.freeze([1, 2, 3, 4, 5]),
  from_minute: 9 * 60,
  to_minute: 17 * 60 + 30,
  stale_minutes: 60,
});

function noteRead(db: App['db'], at: string, ok: boolean): void {
  try {
    insertMailboxReads(db, [at, ok ? at : null, ok ? 0 : 1]);
  } catch { /* a database without migration 088 yet keeps reading; it just cannot warn */ }
}

/**
 * The warning for Admin's home page, or null. Only where reading replies is meant to be happening — the switch is on and
 * the mailbox's login is set — and only in working hours: a quiet weekend is not a fault. Never read at all counts as
 * not read. N4: a row we cannot read is not a read that worked.
 */
export function repliesStale(app: App, nowIso: string = app.now()): string | null {
  const cfg = app.inboundEmail ?? INBOUND_EMAIL;
  if (cfg.enabled !== true || imapLoginFromKeyFile(app.secrets) === null) return null;
  const p = localPartsOf(Date.parse(nowIso));
  if (!REPLY_WATCH.days.includes(p.weekday) || p.minuteOfDay < REPLY_WATCH.from_minute || p.minuteOfDay >= REPLY_WATCH.to_minute) return null;
  let row: { last_ok_at: string | null; last_failed: number } | undefined;
  try { row = getMailboxReadsLastOkAtLastFailedById<{ last_ok_at: string | null; last_failed: number }>(app.db); }
  catch { row = undefined; }
  const okAt = row?.last_ok_at ?? null;
  const ageMin = okAt === null ? null : (Date.parse(nowIso) - Date.parse(okAt)) / 60_000;
  if (ageMin !== null && Number.isFinite(ageMin) && ageMin <= REPLY_WATCH.stale_minutes) return null;
  const since = okAt === null ? 'Email replies have never been read in.' : `Email replies were last read in at ${localStamp(okAt, nowIso)}, over an hour ago.`;
  return `${since} The outside timer that reads them (cron-job.org) may have stopped${row?.last_failed === 1 ? ', or the inbox could not be read on the last try' : ''}. ` +
    'Open cron-job.org and look at its history, then press "Check for new email replies" on Email.';
}

export async function readRepliesIfDue(app: App, force = false): Promise<ReadResult | null> {
  const nowMs = Date.parse(app.now());
  const prev = lastRead.get(app) ?? 0;
  if (!force && nowMs - prev < READ_EVERY_MS) return null;
  lastRead.set(app, nowMs);
  const login = imapLoginFromKeyFile(app.secrets);
  const mailbox = app.mailbox !== undefined ? app.mailbox
    : login === null ? null : imapMailbox(login, undefined, 20_000, auditMailConnections(app.audit, app.now));
  try {
    const r = await readMailbox({ db: app.db, audit: app.audit, now: app.now, newId: () => randomUUID() }, app.inboundEmail ?? INBOUND_EMAIL, login, mailbox);
    noteRead(app.db, app.now(), r.state !== 'OFF');
    lastOutcome.set(app, r.state === 'OFF'
      ? { at: app.now(), ok: false, words: `Not reading replies: ${r.missing.join(' ')}` }
      : { at: app.now(), ok: true, words: r.started === true && r.read === 0 ? 'Started reading the inbox: from now on, new replies come in.'
        : r.read === 0 ? 'No new email.' : `${r.read === 1 ? 'One new email' : `${r.read} new emails`}: ${r.filed} filed on a client’s conversation, ${r.queued} to sort.` });
    return r;
  } catch (e) {
    // Never stops the page — but says why, with nothing of the login in it.
    noteRead(app.db, app.now(), false);
    lastOutcome.set(app, { at: app.now(), ok: false, words: `Could not read the inbox: ${redactSecrets(e instanceof Error ? e.message : String(e)).slice(0, 160)}` });
    return null;
  }
}
