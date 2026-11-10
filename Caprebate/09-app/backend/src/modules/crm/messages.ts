/**
 * CHAT ON EVERY CLIENT — THE STORE. "Back office and portal clean-up, 9 of 11."
 *
 * The owner: "There needs to be a chat feature internally and externally for all clients. Clients
 * should not see internal chats, however they should be able to send and receive communication, also with the ability to
 * upload documentation which automatically saves within their client portfolio."
 *
 * TWO THREADS PER COMPANY, AND THEY LIVE IN TWO TABLES (migration 037):
 *
 *   "Team only"        the company's internal notes — `internal_notes`, asked of `internal_note.read` / `.write`, which
 *                      name Admin and Sales and nobody else. Every note ever written is already a message on it, with its
 *                      date and its author. `teamThread` below reads it; `addNote` (src/modules/claims/engaged.ts) still writes it.
 *   "With the client"  `client_messages`, asked of `client_message.read` / `.write`: Admin, Sales, and the client on its
 *                      own company. It is the portal's "Messages".
 *
 * THE PORTAL CANNOT REACH THE TEAM THREAD BY CONSTRUCTION. Nothing the portal calls reads `internal_notes`: `clientThread`
 * and `clientMessage` below select from `client_messages` alone, a client asking for any other id is answered exactly as
 * for an id that does not exist (404), and the rule table refuses a client `internal_note.read` whatever the route.
 * test/crm/client-chat.test.ts proves it on the wire: every portal response body is searched for a team message's words.
 *
 * THE SURVEYOR SEES NEITHER THREAD. the owner decides otherwise or not — the question is in CAPREBATE QUESTIONS.
 *
 * A FILE SENT WITH A MESSAGE is received through exactly the path every file takes (`receiveFile`, then the upload
 * handler's receipt contract), so it lands in the company's Files under "From the client" with a link back to its message.
 * This file only records which message brought it.
 *
 * Every message written is audited: the line names the message, the company, the claim and a count of files — never the
 * words. A message is never edited and never deleted (triggers in migration 037).
 */

import type { Db } from '../../core/index.ts';
import { authorise, can, type Actor } from '../../core/index.ts';
import { NotFoundAsRefusal } from '../../core/index.ts';
import { localStamp } from '../../shared/index.ts';
import { propertyIn } from '../../shared/index.ts';
import { workingDaysSince, LATE_AFTER_WORKING_DAYS } from '../../shared/index.ts';
import { documentObj } from '../claims/index.ts';
import { getWhatsappMessagesCountByBusinessIdDirection } from '../../integrations/index.ts';
import { getClientMessageFilesIdBusinessIdByLogicalDocumentId, getClientMessagesCountByBusinessIdDirection2, insertChannelReads, insertThreadReads, listClientMessagesBusinessIdNameByDirectionCreatedAt } from '../clients/index.ts';
import { listInternalNotesIdAuthorIdByBusinessId } from './split-reads.ts';
import { listClaimsIdClaimRefByBusinessIdLabel } from '../claims/index.ts';
import { getClientMessagesIdBusinessIdByIdBusinessId, listClientMessagesIdBusinessIdByBusinessId } from './split-reads.ts';
import type { Param, Row } from '../../core/index.ts';
import { listDocumentTypesCodeReadersLabelByCodes } from '../admin/index.ts';
import { listLogicalDocumentsIdTypeCodeVersionByIds } from '../claims/index.ts';
import { byId, idsOf, listClientMessageFilesLogicalDocumentIdByMessageId, lookUp } from '../clients/index.ts';

// Writing on the thread with the client, its alert, and what is unread: the client record's
// (src/modules/clients/messages.ts), as the modules below write on it too.
import { MAX_MESSAGE, alertNewMessage, alertWords, clientThreadObj as clientObj, lastChannelRead, lastThreadRead as lastRead, laterOf as later, messageRefusal, postClientMessage, teamThreadObj as noteObj, threadCompany as company, unreadCount, type AlertResult, type Channel, type MessageDeps, type Thread, type WriteResult } from '../clients/index.ts';
export { MAX_MESSAGE, alertNewMessage, alertWords, lastChannelRead, messageRefusal, postClientMessage, unreadCount };
export type { AlertResult, Channel, MessageDeps, Thread, WriteResult };

export type MessageFile = { readonly name: string; readonly href: string };

export type ThreadMessage = {
  readonly id: string;
  readonly at: string;
  readonly when: string;
  /** Who wrote it, in words a person reads: "You", a colleague's name, "Cap Rebate", the client's contact. */
  readonly who: string;
  /** Drawn on the right: written by the person reading, or by their side. */
  readonly mine: boolean;
  readonly from_client: boolean;
  readonly by_email: boolean;
  readonly body: string;
  /** The claim it is about, in words, or null for the company in general. */
  readonly about: string | null;
  readonly files: readonly MessageFile[];
};

export type ClaimChoice = { readonly id: string; readonly name: string; readonly ref: string };

export type ClientThreadView = {
  readonly business_id: string;
  readonly company: string;
  readonly messages: readonly ThreadMessage[];
  readonly unread: number;
  readonly may_write: boolean;
  readonly do_not_contact: boolean;
  readonly claims: readonly ClaimChoice[];
};

export type TeamThreadView = {
  readonly business_id: string;
  readonly messages: readonly ThreadMessage[];
  readonly unread: number;
  readonly may_write: boolean;
};

function claimsOf(db: Db, business_id: string, name: string): ClaimChoice[] {
  return listClaimsIdClaimRefByBusinessIdLabel<{ id: string; claim_ref: string; label: string | null }>(db, [business_id])
    .map((c) => ({ id: c.id, name: propertyIn(name, c.label) ?? c.label ?? 'A claim', ref: c.claim_ref }));
}

/* ================================================================== *
 * READS — WHEN A PERSON LAST READ A THREAD
 * ================================================================== */

/** 1 Oct 2026: when this person last read each way the company writes — for "New since you last looked". */
export function readMarks(db: Db, user_id: string, business_id: string): { portal: string; email: string; whatsapp: string; team: string } {
  return {
    portal: lastRead(db, user_id, business_id, 'CLIENT'),
    email: emailsReadUntil(db, user_id, business_id),
    whatsapp: lastChannelRead(db, user_id, business_id, 'WHATSAPP'),
    team: lastRead(db, user_id, business_id, 'TEAM'),
  };
}

/** When this person last read the company's emailed replies: on the portal thread, or on the email page. */
export function emailsReadUntil(db: Db, user_id: string, business_id: string): string {
  return later(lastRead(db, user_id, business_id, 'CLIENT'), lastChannelRead(db, user_id, business_id, 'EMAIL'));
}

/** Emailed replies this person has not read. Staff only: the client wrote them. */
export function unreadEmails(db: Db, actor: Actor, business_id: string): number {
  if (actor.role === 'CLIENT' || !can(actor, 'client_message.read', clientObj(db, business_id))) return 0;
  return getClientMessagesCountByBusinessIdDirection2<{ n: number }>(db, [business_id, emailsReadUntil(db, actor.id, business_id)])?.n ?? 0;
}

/** WhatsApp messages from the company this person has not read. */
export function unreadWhatsApp(db: Db, actor: Actor, business_id: string): number {
  if (actor.role === 'CLIENT' || !can(actor, 'client_message.read', clientObj(db, business_id))) return 0;
  return getWhatsappMessagesCountByBusinessIdDirection<{ n: number }>(db, [business_id, lastChannelRead(db, actor.id, business_id, 'WHATSAPP')])?.n ?? 0;
}

/** Record that this person has read the company's emails, or its WhatsApp, now — only when something was unread. */
export function markChannelRead(d: MessageDeps, actor: Actor, business_id: string, channel: Channel): void {
  if ((channel === 'EMAIL' ? unreadEmails(d.db, actor, business_id) : unreadWhatsApp(d.db, actor, business_id)) === 0) return;
  insertChannelReads(d.db, [d.newId(), actor.id, business_id, channel, d.now()]);
}

/**
 * THE RED DOT ON CHAT: how many messages from the client — in the portal, by email or on WhatsApp — this person has not
 * read. 0 for a login that may not read them.
 */
export function newFromClient(db: Db, actor: Actor, business_id: string): number {
  return unreadCount(db, actor, business_id, 'CLIENT') + unreadWhatsApp(db, actor, business_id);
}

/** Record that this person has read the thread now — only when there was something unread, so a view is not a row. */
export function markRead(d: MessageDeps, actor: Actor, business_id: string, thread: Thread): void {
  if (unreadCount(d.db, actor, business_id, thread) === 0) return;
  insertThreadReads(d.db, [d.newId(), actor.id, business_id, thread, d.now()]);
}

/* ================================================================== *
 * THE THREAD WITH THE CLIENT
 * ================================================================== */

type MessageRow = {
  id: string; business_id: string; claim_id: string | null; direction: string; source: string; author_id: string | null;
  created_at: string; body: string; author: string | null; author_role: string | null; contact: string | null;
  claim_ref: string | null; claim_property: string | null;
};

/** A message's files, each asked of `document.read` for this reader: a file the reader may not open is not listed. */
function filesOf(db: Db, actor: Actor, message_id: string): MessageFile[] {
  const out: MessageFile[] = [];
  for (const l of listDocumentsIdBusinessIdByLogicalDocumentIdJO<{ id: string; business_id: string; readers: string; carries_value: number; label: string; seq: number; version: string | null }>(db, [message_id])) {
    if (!can(actor, 'document.read', documentObj(db, l))) continue;
    const name = `${l.label} ${l.seq}`;
    if (actor.role === 'CLIENT') {
      if (l.version !== null) out.push({ name, href: `/portal/documents/${l.version}` });
    } else {
      out.push({ name, href: `/staff/documents/${l.id}` });
    }
  }
  return out;
}

function toMessage(db: Db, actor: Actor, company: string, r: MessageRow): ThreadMessage {
  const fromClient = r.direction === 'FROM_CLIENT';
  const byEmail = r.source === 'EMAIL';
  const mine = actor.role === 'CLIENT' ? fromClient : !fromClient;
  const who = r.author_id === actor.id ? 'You'
    : fromClient
      ? (byEmail ? `${r.contact ?? 'The client'}, by email` : actor.role === 'CLIENT' ? (r.author ?? 'Your colleague') : (r.author ?? company))
      // The client reads "Cap Rebate" and the first name of whoever wrote; staff read the colleague's name.
      : actor.role === 'CLIENT' ? `${(r.author ?? '').split(' ')[0] || 'Someone'} at Cap Rebate` : (r.author ?? 'A colleague');
  return {
    id: r.id, at: r.created_at, when: localStamp(r.created_at), who, mine, from_client: fromClient, by_email: byEmail, body: r.body,
    about: r.claim_ref === null ? null : actor.role === 'CLIENT'
      ? (propertyIn(company, r.claim_property) ?? r.claim_property ?? 'One of your claims')
      : `${propertyIn(company, r.claim_property) ?? r.claim_property ?? 'A claim'} (${r.claim_ref})`,
    files: filesOf(db, actor, r.id),
  };
}

/**
 * THE THREAD WITH THE CLIENT, OLDEST FIRST, FOR THIS READER. Asked of `client_message.read` on the company; a client is
 * only ever given its own company, and the portal passes the company from the session, never from the address.
 */
export function clientThread(db: Db, actor: Actor, business_id: string): ClientThreadView {
  const b = company(db, business_id);
  authorise(actor, 'client_message.read', clientObj(db, b.id));
  const rows = listClientMessagesIdBusinessIdByBusinessId<MessageRow>(db, [b.id]);
  return {
    business_id: b.id, company: b.name,
    messages: rows.map((r) => toMessage(db, actor, b.name, r)),
    unread: unreadCount(db, actor, b.id, 'CLIENT'),
    may_write: can(actor, 'client_message.write', clientObj(db, b.id)),
    do_not_contact: b.dnc,
    claims: claimsOf(db, b.id, b.name),
  };
}

/**
 * ONE MESSAGE ON THE THREAD WITH THE CLIENT, OR A REFUSAL. It is looked for ONLY in `client_messages`, and only on this
 * company's thread: a team message's id, another company's message and an id that does not exist all come back the same
 * — not found — so the answer never says which ids exist.
 */
export function clientMessage(db: Db, actor: Actor, business_id: string, message_id: string): ThreadMessage {
  const b = company(db, business_id);
  authorise(actor, 'client_message.read', clientObj(db, b.id));
  const r = getClientMessagesIdBusinessIdByIdBusinessId<MessageRow>(db, [message_id, b.id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return toMessage(db, actor, b.name, r);
}

/* ================================================================== *
 * A NEW-MESSAGE ALERT. BUILT BEHIND EMAIL_SENDING, WHICH IS OFF.
 * ================================================================== */

/* ================================================================== *
 * THE TEAM THREAD — the company's internal notes, as a conversation
 * ================================================================== */

/** THE TEAM THREAD, OLDEST FIRST. Asked of `internal_note.read`: Admin and Sales. Never called by anything in the portal. */
export function teamThread(db: Db, actor: Actor, business_id: string): TeamThreadView {
  const b = company(db, business_id);
  authorise(actor, 'internal_note.read', noteObj(b.id));
  const rows = listInternalNotesIdAuthorIdByBusinessId<{ id: string; author_id: string; created_at: string; body: string; who: string | null; claim_ref: string | null; claim_property: string | null; property_label: string | null }>(db, [b.id]);
  return {
    business_id: b.id,
    messages: rows.map((n) => ({
      id: n.id, at: n.created_at, when: localStamp(n.created_at),
      who: n.author_id === actor.id ? 'You' : (n.who ?? 'A deleted account'),
      mine: n.author_id === actor.id, from_client: false, by_email: false, body: n.body,
      about: n.claim_ref !== null ? `${propertyIn(b.name, n.claim_property) ?? n.claim_property ?? 'A claim'} (${n.claim_ref})` : n.property_label,
      files: [],
    })),
    unread: unreadCount(db, actor, b.id, 'TEAM'),
    may_write: can(actor, 'internal_note.write', noteObj(b.id)),
  };
}

/* ================================================================== *
 * WAITING FOR A REPLY — for Home's Today and overdue row
 * ================================================================== */

export type WaitingMessage = {
  readonly business_id: string;
  readonly company: string;
  /** When the oldest message we have not answered arrived. */
  readonly since: string;
  readonly working_days: number;
  readonly late: boolean;
  readonly count: number;
};

/**
 * EVERY COMPANY WHOSE CLIENT HAS WRITTEN AND WE HAVE NOT ANSWERED, oldest first. "Answered" is a message from us after
 * theirs, on the thread. Late once it has waited more than one working day — the same rule, and the same bank holidays,
 * as a new lead (src/shared/working-days.ts). Asked of `client_message.read` per company: a login that cannot read a thread
 * is not told it has a message waiting.
 */
export function clientMessagesWaiting(db: Db, actor: Actor, nowIso: string): WaitingMessage[] {
  const rows = listClientMessagesBusinessIdNameByDirectionCreatedAt<{ business_id: string; name: string; since: string; n: number }>(db);
  return rows
    // A surveyor reads the thread but never answers it, so nothing on it waits for them.
    .filter((r) => actor.role !== 'SURVEYING' && can(actor, 'client_message.read', clientObj(db, r.business_id)))
    .map((r) => {
      const days = workingDaysSince(r.since, nowIso);
      return { business_id: r.business_id, company: r.name, since: r.since, working_days: days, late: days > LATE_AFTER_WORKING_DAYS, count: r.n };
    });
}

/** WHICH MESSAGE BROUGHT A FILE, where one did — for the file's card in Files. Null for a file sent any other way. */
export function messageOfFile(db: Db, logical_document_id: string): { id: string; business_id: string; from_client: boolean } | null {
  const r = getClientMessageFilesIdBusinessIdByLogicalDocumentId<{ id: string; business_id: string; direction: string }>(db, [logical_document_id]);
  return r === undefined ? null : { id: r.id, business_id: r.business_id, from_client: r.direction === 'FROM_CLIENT' };
}

// THE CRM'S READS THAT JOINED OTHER AREAS' TABLES, SPLIT (Phase 161l1): its own rows and the other area's, read
// through that area's front door and put together here as the old join did (test/crm/borrowed-split.test.ts).
export function listDocumentsIdBusinessIdByLogicalDocumentIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  // The message's files in the order they were added, each the logical document (JOIN) of a known type (JOIN), with its latest version.
  const files = listClientMessageFilesLogicalDocumentIdByMessageId<{ logical_document_id: unknown }>(db, params);
  const logical = byId(listLogicalDocumentsIdTypeCodeVersionByIds<{ id: string; business_id: unknown; type_code: unknown; seq: unknown; version: unknown }>(db, [idsOf(files.map((f) => f.logical_document_id))]));
  const types = new Map(listDocumentTypesCodeReadersLabelByCodes<{ code: string; readers: unknown; carries_value: unknown; label: unknown }>(db, [idsOf([...logical.values()].map((l) => l.type_code))]).map((d) => [d.code, d]));
  const rows: Row[] = [];
  for (const f of files) {
    const l = lookUp(logical, f.logical_document_id), t = l === undefined ? undefined : lookUp(types, l.type_code);
    if (l === undefined || t === undefined) continue;
    rows.push({ id: l.id, business_id: l.business_id, readers: t.readers, carries_value: t.carries_value, label: t.label, seq: l.seq, version: l.version });
  }
  return rows as unknown as T[];
}
