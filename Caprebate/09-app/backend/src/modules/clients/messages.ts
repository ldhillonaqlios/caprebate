/**
 * THE THREAD WITH THE CLIENT: WRITING ON IT, AND WHAT IS UNREAD (Phase 161l1, carved from src/modules/crm/messages.ts
 * unchanged). Who may write and why not, the message written, the alert that one is waiting, and how many a person has
 * not read. Written by the CRM's screens and by the modules below it (the report sign-off, the survey's booking).
 *
 * WHETHER A CLAIM IS THE COMPANY'S IS THE CLAIMS MODULE'S TO SAY: A PORT THIS FILE OWNS, handed in by
 * src/modules/claims/claim-of-business.ts as the claims' front door loads; the statement is the claims' own, unchanged.
 * Asked before it is handed in, it refuses rather than guess, so no message is written. Asked only while code runs.
 */
import type { Db } from '../../core/index.ts';
import type { AuditLog } from '../../core/audit.ts';
import { authorise, can, type Actor } from '../../core/index.ts';
import { NotFoundAsRefusal } from '../../core/index.ts';
import { surveyorsOnBusiness } from '../../core/index.ts';
import { EMAIL_SENDING, sendingOn, smtpLoginFromKeyFile, type EmailSending, type MailWhere, type SmtpLogin } from '../../integrations/index.ts';
import { outboxTransport } from '../../integrations/index.ts';
import { getUsersIdEmailByIdDisabledAt, listUsersIdEmailByRoleBusinessId, listUsersIdEmailByRoleDisabledAt } from '../../core/index.ts';
import { getBusinessesIdNameById2, getChannelReadsAtByUserIdBusinessId, getClientMessagesBusinessIdDirectionById, getClientMessagesCountByBusinessIdDirection, getInternalNotesCountByBusinessIdAuthorId, getThreadReadsAtByUserIdBusinessId, insertClientMessageFiles, insertClientMessages, insertThreadReads } from './data.ts';

var claimOfBusiness: ((db: Db, claim_id: string, business_id: string) => { readonly id: string } | undefined) | undefined;
export function setClaimOfBusinessReader(read: (db: Db, claim_id: string, business_id: string) => { readonly id: string } | undefined): void { claimOfBusiness = read; }
function claimOfBusinessFor(db: Db, claim_id: string, business_id: string): { readonly id: string } | undefined {
  if (claimOfBusiness === undefined) throw new Error('Whether a claim is the company\'s is not set up. The claims set it up when they load, so no message was written.');
  return claimOfBusiness(db, claim_id, business_id);
}

/**
 * A STAFF NOTICE'S SUBJECT, AND THE COMPANY'S NAME IN IT. BUILT AND SWITCHED OFF.
 *
 * The owner: every email subject leads with the company name. A notice to a member of staff was built
 * (CRM 3 of 10) to carry the claim's reference and never an organisation's name, so that a client's name does not travel
 * in an email subject through a mail provider nobody has chosen yet. Which of the two holds is the owner's to decide —
 * CAPREBATE QUESTIONS, "Should an email to our own staff name the client company in its subject line?". Until then:
 *   OFF  the subject says what happened and ends with the reference: "A claim is now at Survey (CR-2026-0004)".
 *   ON   the subject leads with the company: "Dunmarrow Medical Practice Limited — a claim is now at Survey (CR-2026-0004)".
 * Turning it on is this one line. test/crm/client-is-the-company.test.ts proves both readings.
 *
 * 24 September 2026: ANSWERED AND ON. the owner, Word answer 71 (closed that day): yes, staff emails name the
 * client company in the subject. Nothing is sent while EMAIL_SENDING is off, so today it changes the words of what is
 * saved to the outbox and nothing else. It applies to emails to OUR STAFF only: an alert to a client never carries it
 * (src/modules/crm/messages.ts).
 */
export const NOTICE_SUBJECT_LEADS_WITH_COMPANY = true;

/** The two readings of the switch, as one pure function: the company in front, or the words as they are. */
export function noticeSubject(what: string, company: string | null): string {
  return company === null ? what : `${company} — ${what.charAt(0).toLowerCase()}${what.slice(1)}`;
}

export type MessageDeps = {
  db: Db; audit: AuditLog; now: () => string; newId: () => string;
  /** The EMAIL_SENDING switch and the provider's login, for the new-message alert. Absent is the shipped switch, off. */
  sending?: EmailSending; login?: SmtpLogin | null;
  /** Where the app runs (src/integrations/connectors/place.ts). Absent with the key file's login: a real connection. */
  where?: MailWhere;
  /** Where the site is, for the link in an alert. Absent: CAPREBATE_PUBLIC_ORIGIN, and with neither the email carries no link. */
  origin?: string;
};

export type Thread = 'TEAM' | 'CLIENT';

/** The longest message kept. The same limit as a note. */
export const MAX_MESSAGE = 8000;

/** The thread's object, carrying the surveyors with an assigned survey job on the company — the only surveyors it admits. */
export const clientObj = (db: Db, business_id: string) => ({
  type: 'client_message' as const, id: business_id, business_id,
  assigned_surveyor_ids: surveyorsOnBusiness(db, business_id),
});

export const noteObj = (business_id: string) => ({ type: 'internal_note' as const, id: business_id, business_id });

export function company(db: Db, business_id: string): { id: string; name: string; dnc: boolean } {
  const b = getBusinessesIdNameById2<{ id: string; name: string; client_status: string | null }>(db, [business_id]);
  if (b === undefined) throw new NotFoundAsRefusal();
  return { id: b.id, name: b.name, dnc: b.client_status === 'DO_NOT_CONTACT' };
}

export function lastRead(db: Db, user_id: string, business_id: string, thread: Thread): string {
  return getThreadReadsAtByUserIdBusinessId<{ at: string | null }>(db, [user_id, business_id, thread])?.at ?? '';
}

/**
 * 1 OCT 2026 — WHEN A PERSON LAST READ A COMPANY'S EMAILS OR ITS WHATSAPP (migration 065, `channel_reads`), for the red
 * dot on Chat. An emailed reply is also on the portal thread, so reading either place reads it.
 */
export type Channel = 'EMAIL' | 'WHATSAPP';

export function lastChannelRead(db: Db, user_id: string, business_id: string, channel: Channel): string {
  return getChannelReadsAtByUserIdBusinessId<{ at: string | null }>(db, [user_id, business_id, channel])?.at ?? '';
}

/** The later of two times written the same way (ISO), '' being never. */
export function later(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * HOW MANY MESSAGES THIS PERSON HAS NOT READ. On the thread with the client: for staff, what the client sent since they
 * last read it; for the client, what we sent. On the team thread: what colleagues wrote. A login that may not read a
 * thread gets 0, never a number about a thread it cannot open.
 */
export function unreadCount(db: Db, actor: Actor, business_id: string, thread: Thread): number {
  if (thread === 'CLIENT') {
    if (!can(actor, 'client_message.read', clientObj(db, business_id))) return 0;
    const since = lastRead(db, actor.id, business_id, 'CLIENT');
    const direction = actor.role === 'CLIENT' ? 'TO_CLIENT' : 'FROM_CLIENT';
    // 1 Oct 2026: an emailed reply read on the email page is read here too.
    const emails = actor.role === 'CLIENT' ? since : later(since, lastChannelRead(db, actor.id, business_id, 'EMAIL'));
    return getClientMessagesCountByBusinessIdDirection<{ n: number }>(db, [business_id, direction, since, emails])?.n ?? 0;
  }
  if (!can(actor, 'internal_note.read', noteObj(business_id))) return 0;
  const since = lastRead(db, actor.id, business_id, 'TEAM');
  return getInternalNotesCountByBusinessIdAuthorId<{ n: number }>(db, [business_id, actor.id, since])?.n ?? 0;
}

export type WriteResult = { ok: true; id: string } | { ok: false; why: string };

const DNC_WHY = 'This company asked us not to contact them. Nothing was sent.';

/** Why a message cannot be sent, or null. Asked before any file is received, so a refusal leaves nothing behind. */
export function messageRefusal(db: Db, actor: Actor, business_id: string, input: { body: string; claim_id: string | null }): string | null {
  const b = company(db, business_id);
  authorise(actor, 'client_message.write', clientObj(db, b.id));
  const text = input.body.trim();
  if (text.length === 0) return 'Write a message first.';
  if (text.length > MAX_MESSAGE) return `That message is too long. The most is ${MAX_MESSAGE.toLocaleString('en-GB')} characters.`;
  if (input.claim_id !== null && input.claim_id !== ''
    && claimOfBusinessFor(db, input.claim_id, b.id) === undefined) {
    return 'Choose one of this company’s claims.';
  }
  // A client writing to us is always taken; we do not write to a company that asked us not to.
  if (actor.role !== 'CLIENT' && b.dnc) return DNC_WHY;
  return null;
}

/**
 * WRITE A MESSAGE ON THE THREAD WITH THE CLIENT. A client's goes FROM the client; staff's goes TO it. `files` are
 * documents already received through the upload path for this company; each is linked to the message in the same
 * transaction, and the database refuses a file of another company.
 */
export function postClientMessage(
  d: MessageDeps, actor: Actor, business_id: string,
  input: { body: string; claim_id: string | null }, files: readonly string[] = [],
): WriteResult {
  const why = messageRefusal(d.db, actor, business_id, input);
  if (why !== null) return { ok: false, why };
  const claim_id = input.claim_id === null || input.claim_id === '' ? null : input.claim_id;
  const fromClient = actor.role === 'CLIENT';
  const id = d.newId();
  const at = d.now();
  d.db.tx(() => {
    insertClientMessages(d.db, [id, business_id, claim_id, fromClient ? 'FROM_CLIENT' : 'TO_CLIENT', fromClient ? 'PORTAL' : 'STAFF', actor.id, input.body.trim(), at]);
    for (const f of files) {
      insertClientMessageFiles(d.db, [d.newId(), id, f, at]);
    }
    // Writing is reading: the person's own thread is read up to their own message.
    insertThreadReads(d.db, [d.newId(), actor.id, business_id, 'CLIENT', at]);
  });
  d.audit.append({
    at, kind: 'CLIENT_MESSAGE_WRITTEN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'client_message', object_id: id,
    detail: { business: business_id, claim: claim_id, direction: fromClient ? 'FROM_CLIENT' : 'TO_CLIENT', files: files.length },
  });
  alertNewMessage(d, id);
  return { ok: true, id };
}

export type AlertResult =
  | { readonly state: 'OFF' }
  | { readonly state: 'QUEUED'; readonly outbox: readonly string[] }
  | { readonly state: 'NOT_QUEUED'; readonly why: 'DO_NOT_CONTACT' | 'NOBODY_TO_TELL' };

/** The words of an alert. It says only that something is waiting — never the message, never who wrote it. */
export function alertWords(to: 'STAFF' | 'CLIENT', company: string | null, business_id: string, origin: string | null): { subject: string; body: string } {
  if (to === 'STAFF') {
    const subject = noticeSubject('A client has sent a new message', company);
    const link = `${origin ?? ''}/staff/clients/${business_id}?chat=client#chat`;
    return { subject, body: `${subject}.\n\nRead it and reply in the back office: ${link}\n\nThe message is not in this email.` };
  }
  const subject = noticeSubject('You have a new message from Cap Rebate', company);
  return {
    subject,
    body: 'There is a new message waiting for you in your Cap Rebate portal.\n\n' +
      (origin === null ? 'Sign in to your portal to read it.' : `Sign in to read it: ${origin}/portal/messages`) +
      '\n\nFor your privacy, we never put the message itself in an email.',
  };
}

/**
 * TELL THE OTHER SIDE THAT A MESSAGE IS WAITING. A client's message tells the company's owner — or, where it has none on
 * Admin or Sales, every Sales login; our message tells each of the company's portal logins. The email says only that a
 * message is waiting: never the words, and no name in the subject beyond what NOTICE_SUBJECT_LEADS_WITH_COMPANY allows.
 *
 * QUEUED ONLY WHILE SENDING IS ON, so every alert is saved with send_requested = 1 and nothing piles up "saved, not sent"
 * while it is off — off, this returns OFF and writes nothing at all. The outbox refuses a do-not-contact company, as
 * everywhere. Called after the message is written; an alert that cannot be queued never takes the message back.
 */
export function alertNewMessage(d: MessageDeps, message_id: string): AlertResult {
  const cfg = d.sending ?? EMAIL_SENDING;
  const login = d.login === undefined ? smtpLoginFromKeyFile() : d.login;
  if (!sendingOn(cfg, login, d.where ?? (d.login === undefined ? { live: true } : undefined))) return { state: 'OFF' };
  const m = getClientMessagesBusinessIdDirectionById<{ business_id: string; direction: string; name: string; owner_id: string | null }>(d.db, [message_id]);
  if (m === undefined) return { state: 'NOT_QUEUED', why: 'NOBODY_TO_TELL' };
  const to: 'STAFF' | 'CLIENT' = m.direction === 'FROM_CLIENT' ? 'STAFF' : 'CLIENT';
  type Person = { id: string; email: string };
  let people: Person[];
  if (to === 'STAFF') {
    const owner = m.owner_id === null ? undefined : getUsersIdEmailByIdDisabledAt<Person>(d.db, [m.owner_id]);
    people = owner !== undefined ? [owner]
      : listUsersIdEmailByRoleDisabledAt<Person>(d.db);
  } else {
    people = listUsersIdEmailByRoleBusinessId<Person>(d.db, [m.business_id]);
  }
  if (people.length === 0) return { state: 'NOT_QUEUED', why: 'NOBODY_TO_TELL' };
  const origin = d.origin ?? process.env.CAPREBATE_PUBLIC_ORIGIN ?? null;
  // The company leads the subject of an email to OUR STAFF only (Word answer 71), never one to a client.
  const w = alertWords(to, to === 'STAFF' && NOTICE_SUBJECT_LEADS_WITH_COMPANY ? m.name : null, m.business_id, origin);
  const transport = outboxTransport(d.db, d.newId, d.now, () => true);
  const queued: string[] = [];
  let refused = 0;
  d.db.tx(() => {
    for (const p of people) {
      const r = transport.send({ to_email: p.email, subject: w.subject, body: w.body, kind: 'NOTIFICATION', business_id: m.business_id });
      if (r.id === null) refused++; else queued.push(r.id);
    }
  });
  d.audit.append({
    at: d.now(), kind: 'CLIENT_MESSAGE_ALERT', outcome: queued.length > 0 ? 'ALLOWED' : 'REFUSED', actor_id: null, actor_role: null,
    object_type: 'client_message', object_id: message_id,
    detail: { business: m.business_id, to, users: people.map((p) => p.id), outbox: queued, refused },
  });
  return queued.length > 0 ? { state: 'QUEUED', outbox: queued } : { state: 'NOT_QUEUED', why: 'DO_NOT_CONTACT' };
}
