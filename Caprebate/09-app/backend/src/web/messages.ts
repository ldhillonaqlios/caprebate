/**
 * CHAT ON EVERY CLIENT — THE STORE. Phase 142, 22 September 2026. "Back office and portal clean-up, 9 of 11."
 *
 * Lakhbir, 18 September 2026: "There needs to be a chat feature internally and externally for all clients. Clients
 * should not see internal chats, however they should be able to send and receive communication, also with the ability to
 * upload documentation which automatically saves within their client portfolio."
 *
 * TWO THREADS PER COMPANY, AND THEY LIVE IN TWO TABLES (migration 037):
 *
 *   "Team only"        the company's internal notes — `internal_notes`, asked of `internal_note.read` / `.write`, which
 *                      name Admin and Sales and nobody else. Every note ever written is already a message on it, with its
 *                      date and its author. `teamThread` below reads it; `addNote` (src/web/engaged.ts) still writes it.
 *   "With the client"  `client_messages`, asked of `client_message.read` / `.write`: Admin, Sales, and the client on its
 *                      own company. It is the portal's "Messages".
 *
 * THE PORTAL CANNOT REACH THE TEAM THREAD BY CONSTRUCTION. Nothing the portal calls reads `internal_notes`: `clientThread`
 * and `clientMessage` below select from `client_messages` alone, a client asking for any other id is answered exactly as
 * for an id that does not exist (404), and the rule table refuses a client `internal_note.read` whatever the route.
 * test/phase142.test.ts proves it on the wire: every portal response body is searched for a team message's words.
 *
 * THE SURVEYOR SEES NEITHER THREAD. Lakhbir decides otherwise or not — the question is in CAPREBATE QUESTIONS.
 *
 * A FILE SENT WITH A MESSAGE is received through exactly the path every file takes (`receiveFile`, then the upload
 * handler's receipt contract), so it lands in the company's Files under "From the client" with a link back to its message.
 * This file only records which message brought it.
 *
 * Every message written is audited: the line names the message, the company, the claim and a count of files — never the
 * words. A message is never edited and never deleted (triggers in migration 037).
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { NotFoundAsRefusal } from './backoffice.ts';
import { localStamp } from './localtime.ts';
import { propertyIn } from './components.ts';
import { workingDaysSince, LATE_AFTER_WORKING_DAYS } from './working-days.ts';
import { documentObj } from './documents.ts';

export type MessageDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export type Thread = 'TEAM' | 'CLIENT';

/** The longest message kept. The same limit as a note. */
export const MAX_MESSAGE = 8000;

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

const clientObj = (business_id: string) => ({ type: 'client_message' as const, id: business_id, business_id });
const noteObj = (business_id: string) => ({ type: 'internal_note' as const, id: business_id, business_id });

function company(db: Db, business_id: string): { id: string; name: string; dnc: boolean } {
  const b = db.get<{ id: string; name: string; client_status: string | null }>(
    'SELECT id, name, client_status FROM businesses WHERE id = ?', [business_id]);
  if (b === undefined) throw new NotFoundAsRefusal();
  return { id: b.id, name: b.name, dnc: b.client_status === 'DO_NOT_CONTACT' };
}

function claimsOf(db: Db, business_id: string, name: string): ClaimChoice[] {
  return db.all<{ id: string; claim_ref: string; label: string | null }>(
    'SELECT c.id, c.claim_ref, p.label FROM claims c LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ' +
      'ORDER BY p.label IS NULL, p.label ASC, c.claim_ref ASC', [business_id])
    .map((c) => ({ id: c.id, name: propertyIn(name, c.label) ?? c.label ?? 'A claim', ref: c.claim_ref }));
}

/* ================================================================== *
 * READS — WHEN A PERSON LAST READ A THREAD
 * ================================================================== */

function lastRead(db: Db, user_id: string, business_id: string, thread: Thread): string {
  return db.get<{ at: string | null }>(
    'SELECT MAX(read_at) AS at FROM thread_reads WHERE user_id = ? AND business_id = ? AND thread = ?', [user_id, business_id, thread])?.at ?? '';
}

/**
 * HOW MANY MESSAGES THIS PERSON HAS NOT READ. On the thread with the client: for staff, what the client sent since they
 * last read it; for the client, what we sent. On the team thread: what colleagues wrote. A login that may not read a
 * thread gets 0, never a number about a thread it cannot open.
 */
export function unreadCount(db: Db, actor: Actor, business_id: string, thread: Thread): number {
  if (thread === 'CLIENT') {
    if (!can(actor, 'client_message.read', clientObj(business_id))) return 0;
    const since = lastRead(db, actor.id, business_id, 'CLIENT');
    const direction = actor.role === 'CLIENT' ? 'TO_CLIENT' : 'FROM_CLIENT';
    return db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM client_messages WHERE business_id = ? AND direction = ? AND created_at > ?', [business_id, direction, since])?.n ?? 0;
  }
  if (!can(actor, 'internal_note.read', noteObj(business_id))) return 0;
  const since = lastRead(db, actor.id, business_id, 'TEAM');
  return db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM internal_notes WHERE business_id = ? AND author_id <> ? AND created_at > ?', [business_id, actor.id, since])?.n ?? 0;
}

/** Record that this person has read the thread now — only when there was something unread, so a view is not a row. */
export function markRead(d: MessageDeps, actor: Actor, business_id: string, thread: Thread): void {
  if (unreadCount(d.db, actor, business_id, thread) === 0) return;
  d.db.run('INSERT INTO thread_reads (id, user_id, business_id, thread, read_at) VALUES (?, ?, ?, ?, ?)',
    [d.newId(), actor.id, business_id, thread, d.now()]);
}

/* ================================================================== *
 * THE THREAD WITH THE CLIENT
 * ================================================================== */

type MessageRow = {
  id: string; business_id: string; claim_id: string | null; direction: string; source: string; author_id: string | null;
  created_at: string; body: string; author: string | null; author_role: string | null; contact: string | null;
  claim_ref: string | null; claim_property: string | null;
};

const MESSAGE_SELECT =
  'SELECT m.id, m.business_id, m.claim_id, m.direction, m.source, m.author_id, m.created_at, m.body, ' +
  'u.display_name AS author, u.role AS author_role, ct.full_name AS contact, c.claim_ref, p.label AS claim_property ' +
  'FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id ' +
  'LEFT JOIN claims c ON c.id = m.claim_id LEFT JOIN properties p ON p.id = c.property_id ';

/** A message's files, each asked of `document.read` for this reader: a file the reader may not open is not listed. */
function filesOf(db: Db, actor: Actor, message_id: string): MessageFile[] {
  const out: MessageFile[] = [];
  for (const l of db.all<{ id: string; business_id: string; readers: string; carries_value: number; label: string; seq: number; version: string | null }>(
    'SELECT l.id, l.business_id, t.readers, t.carries_value, t.label, l.seq, ' +
      '(SELECT d.id FROM documents d WHERE d.logical_document_id = l.id ORDER BY d.version_no DESC LIMIT 1) AS version ' +
      'FROM client_message_files f JOIN logical_documents l ON l.id = f.logical_document_id ' +
      'JOIN document_types t ON t.code = l.type_code WHERE f.message_id = ? ORDER BY f.linked_at', [message_id])) {
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
  authorise(actor, 'client_message.read', clientObj(b.id));
  const rows = db.all<MessageRow>(`${MESSAGE_SELECT}WHERE m.business_id = ? ORDER BY m.created_at ASC, m.rowid ASC`, [b.id]);
  return {
    business_id: b.id, company: b.name,
    messages: rows.map((r) => toMessage(db, actor, b.name, r)),
    unread: unreadCount(db, actor, b.id, 'CLIENT'),
    may_write: can(actor, 'client_message.write', clientObj(b.id)),
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
  authorise(actor, 'client_message.read', clientObj(b.id));
  const r = db.get<MessageRow>(`${MESSAGE_SELECT}WHERE m.id = ? AND m.business_id = ?`, [message_id, b.id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return toMessage(db, actor, b.name, r);
}

export type WriteResult = { ok: true; id: string } | { ok: false; why: string };

const DNC_WHY = 'This company asked us not to contact them. Nothing was sent.';

/** Why a message cannot be sent, or null. Asked before any file is received, so a refusal leaves nothing behind. */
export function messageRefusal(db: Db, actor: Actor, business_id: string, input: { body: string; claim_id: string | null }): string | null {
  const b = company(db, business_id);
  authorise(actor, 'client_message.write', clientObj(b.id));
  const text = input.body.trim();
  if (text.length === 0) return 'Write a message first.';
  if (text.length > MAX_MESSAGE) return `That message is too long. The most is ${MAX_MESSAGE.toLocaleString('en-GB')} characters.`;
  if (input.claim_id !== null && input.claim_id !== ''
    && db.get('SELECT id FROM claims WHERE id = ? AND business_id = ?', [input.claim_id, b.id]) === undefined) {
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
    d.db.run(
      'INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
      [id, business_id, claim_id, fromClient ? 'FROM_CLIENT' : 'TO_CLIENT', fromClient ? 'PORTAL' : 'STAFF', actor.id, input.body.trim(), at]);
    for (const f of files) {
      d.db.run('INSERT INTO client_message_files (id, message_id, logical_document_id, linked_at) VALUES (?, ?, ?, ?)', [d.newId(), id, f, at]);
    }
    // Writing is reading: the person's own thread is read up to their own message.
    d.db.run('INSERT INTO thread_reads (id, user_id, business_id, thread, read_at) VALUES (?, ?, ?, ?, ?)', [d.newId(), actor.id, business_id, 'CLIENT', at]);
  });
  d.audit.append({
    at, kind: 'CLIENT_MESSAGE_WRITTEN', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'client_message', object_id: id,
    detail: { business: business_id, claim: claim_id, direction: fromClient ? 'FROM_CLIENT' : 'TO_CLIENT', files: files.length },
  });
  return { ok: true, id };
}

/* ================================================================== *
 * THE TEAM THREAD — the company's internal notes, as a conversation
 * ================================================================== */

/** THE TEAM THREAD, OLDEST FIRST. Asked of `internal_note.read`: Admin and Sales. Never called by anything in the portal. */
export function teamThread(db: Db, actor: Actor, business_id: string): TeamThreadView {
  const b = company(db, business_id);
  authorise(actor, 'internal_note.read', noteObj(b.id));
  const rows = db.all<{ id: string; author_id: string; created_at: string; body: string; who: string | null; claim_ref: string | null; claim_property: string | null; property_label: string | null }>(
    'SELECT n.id, n.author_id, n.created_at, n.body, u.display_name AS who, c.claim_ref, cp.label AS claim_property, p.label AS property_label ' +
      'FROM internal_notes n LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id ' +
      'LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id ' +
      'WHERE n.business_id = ? ORDER BY n.created_at ASC, n.rowid ASC', [b.id]);
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
 * as a new lead (src/web/working-days.ts). Asked of `client_message.read` per company: a login that cannot read a thread
 * is not told it has a message waiting.
 */
export function clientMessagesWaiting(db: Db, actor: Actor, nowIso: string): WaitingMessage[] {
  const rows = db.all<{ business_id: string; name: string; since: string; n: number }>(
    'SELECT m.business_id, b.name, MIN(m.created_at) AS since, COUNT(*) AS n FROM client_messages m JOIN businesses b ON b.id = m.business_id ' +
      "WHERE m.direction = 'FROM_CLIENT' AND m.created_at > COALESCE((SELECT MAX(r.created_at) FROM client_messages r " +
      "WHERE r.business_id = m.business_id AND r.direction = 'TO_CLIENT'), '') GROUP BY m.business_id, b.name ORDER BY since ASC");
  return rows
    .filter((r) => can(actor, 'client_message.read', clientObj(r.business_id)))
    .map((r) => {
      const days = workingDaysSince(r.since, nowIso);
      return { business_id: r.business_id, company: r.name, since: r.since, working_days: days, late: days > LATE_AFTER_WORKING_DAYS, count: r.n };
    });
}

/** WHICH MESSAGE BROUGHT A FILE, where one did — for the file's card in Files. Null for a file sent any other way. */
export function messageOfFile(db: Db, logical_document_id: string): { id: string; business_id: string; from_client: boolean } | null {
  const r = db.get<{ id: string; business_id: string; direction: string }>(
    'SELECT m.id, m.business_id, m.direction FROM client_message_files f JOIN client_messages m ON m.id = f.message_id WHERE f.logical_document_id = ?',
    [logical_document_id]);
  return r === undefined ? null : { id: r.id, business_id: r.business_id, from_client: r.direction === 'FROM_CLIENT' };
}
