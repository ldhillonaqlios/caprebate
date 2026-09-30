/**
 * WHATSAPP WITH EACH CLIENT, AND THE WHOLE CONVERSATION IN ONE PLACE. 30 September 2026.
 *
 * Lakhbir: "the ability to use whats app directly using our back end portal the idea is each client when we view back
 * end has full communication via email or whats app".
 *
 * ON THE CLIENT PAGE, under Chat, a third tab, "Everything": every message with the company in the order it happened —
 * portal messages both ways, the emails we sent them and their emailed replies, and WhatsApp both ways — each marked
 * with how it travelled. Under it, a box to write on WhatsApp to one of the company's contacts, and links to write an
 * email or a portal message. The same rules as the portal thread: `client_message.read` to see it (Admin, Sales),
 * `client_message.write` to write (Admin, Sales), and nothing to a company marked do not contact.
 *
 * SENDING (`sendWhatsApp`). To a contact of this company with a telephone number. Within 24 hours of their last WhatsApp
 * to us, the words typed; outside it, WhatsApp allows only our approved opening message (src/connectors/whatsapp.ts).
 * Every attempt is a row — SENT with Meta's id, or NOT_SENT with why — and an audit line with no number and no words.
 *
 * RECEIVING (`receiveWhatsApp`, POST /hooks/whatsapp). Believed only when Meta's signature over the exact bytes holds;
 * otherwise refused, audited, nothing written. A message is filed under the company only when exactly ONE company has a
 * contact with that number; anything else waits at /staff/whatsapp for Admin or Sales to file by hand. Never filed by
 * guesswork. The same message delivered twice is kept once (Meta's id is unique). A status (sent, delivered, read,
 * failed) moves our row forward only, never back.
 */

import { randomUUID } from 'node:crypto';
import type { App } from '../app.ts';
import type { Db } from '../db.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { isDoNotContact } from '../stubs/email.ts';
import { SENT_SECRET_KINDS } from '../stubs/email-provider.ts';
import { localStamp } from './localtime.ts';
import { clientThread } from './messages.ts';
import {
  MAX_WHATSAPP_TEXT, WINDOW_HOURS, readWebhook, sendWhatsAppOpening, sendWhatsAppText, signatureHolds, waNumber,
  type WhatsAppDeps,
} from '../connectors/whatsapp.ts';

export function whatsappDeps(app: App): WhatsAppDeps {
  return { audit: app.audit, now: app.now, transport: app.outside, secrets: app.secrets,
    ...(app.whatsappPolicy === undefined ? {} : { policy_override: app.whatsappPolicy }) };
}

const obj = (db: Db, business_id: string) => ({ type: 'client_message' as const, id: business_id, business_id });

export type PhoneContact = { readonly id: string; readonly name: string; readonly first: string; readonly number: string; readonly shown: string; readonly open_until: string | null };

/** When the 24-hour window with this number closes, or null when it is closed. */
export function windowOpenUntil(db: Db, number: string, nowIso: string): string | null {
  const last = db.get<{ at: string | null }>("SELECT max(created_at) AS at FROM whatsapp_messages WHERE phone = ? AND direction = 'IN'", [number])?.at ?? null;
  if (last === null) return null;
  const until = Date.parse(last) + WINDOW_HOURS * 3_600_000;
  return until > Date.parse(nowIso) ? new Date(until).toISOString() : null;
}

/** The company's contacts WhatsApp can reach: those with a telephone number we can read. */
export function phoneContacts(db: Db, business_id: string, nowIso: string): PhoneContact[] {
  const out: PhoneContact[] = [];
  for (const c of db.all<{ id: string; full_name: string; phone: string | null }>(
    "SELECT id, full_name, phone FROM contacts WHERE business_id = ? AND phone IS NOT NULL AND trim(phone) <> '' ORDER BY full_name", [business_id])) {
    const n = waNumber(c.phone);
    if (n === null) continue;
    out.push({ id: c.id, name: c.full_name, first: c.full_name.trim().split(/\s+/)[0] ?? '', number: n, shown: c.phone ?? '', open_until: windowOpenUntil(db, n, nowIso) });
  }
  return out;
}

export type SendResult = { ok: true; id: string } | { ok: false; why: string; id?: string };

/** Write to one contact of the company on WhatsApp: the words (inside the window) or our opening message. */
export async function sendWhatsApp(app: App, actor: Actor, business_id: string, input: { contact_id: string; body: string; opening: boolean }): Promise<SendResult> {
  authorise(actor, 'client_message.write', obj(app.db, business_id));
  if (isDoNotContact(app.db, '', business_id)) return { ok: false, why: 'This company asked us not to contact them.' };
  const now = app.now();
  const c = phoneContacts(app.db, business_id, now).find((x) => x.id === input.contact_id);
  if (c === undefined) return { ok: false, why: 'Choose one of this company’s contacts with a mobile number.' };
  const words = input.body.trim();
  if (!input.opening) {
    if (words === '') return { ok: false, why: 'Write the message first.' };
    if (words.length > MAX_WHATSAPP_TEXT) return { ok: false, why: `A WhatsApp message can be ${MAX_WHATSAPP_TEXT} characters at most.` };
    if (c.open_until === null) return { ok: false, why: `It is more than ${WINDOW_HOURS} hours since ${c.first} last wrote to us on WhatsApp, so WhatsApp only lets us send our opening message. Send that; when they reply, you can write freely.` };
  }
  const d = whatsappDeps(app);
  const r = input.opening ? await sendWhatsAppOpening(d, c.number, c.first) : await sendWhatsAppText(d, c.number, words);
  const id = randomUUID();
  const body = input.opening ? `Our opening message, asking ${c.first} to reply.` : words;
  app.db.run(
    'INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, error, written_by, created_at, status_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, business_id, c.id, 'OUT', c.number, input.opening ? 'opening' : 'text', body, r.state === 'SENT' ? r.wa_id : null,
      r.state === 'SENT' ? 'SENT' : 'NOT_SENT', r.state === 'SENT' ? null : r.why, actor.id, now, now]);
  app.audit.append({
    at: now, kind: r.state === 'SENT' ? 'WHATSAPP_SENT' : 'WHATSAPP_NOT_SENT', outcome: r.state === 'SENT' ? 'ALLOWED' : 'REFUSED',
    actor_id: actor.id, actor_role: actor.role, object_type: 'whatsapp_message', object_id: id,
    detail: { business: business_id, contact: c.id, opening: input.opening, ...(r.state === 'SENT' ? {} : { why: r.why }) },
  });
  return r.state === 'SENT' ? { ok: true, id } : { ok: false, why: r.why, id };
}

const RANK: Readonly<Record<string, number>> = { NOT_SENT: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

/** A signed webhook body from Meta: keep the messages, move the statuses. The HTTP status to answer. */
export function receiveWhatsApp(app: App, raw: string, signature: string | null): { status: 200 | 401; kept: number; unfiled: number } {
  const now = app.now();
  if (!signatureHolds(app.secrets, raw, signature)) {
    app.audit.append({ at: now, kind: 'WHATSAPP_REFUSED', outcome: 'REFUSED', actor_id: null, actor_role: null, object_type: 'whatsapp_message', object_id: 'unknown',
      detail: { why: signature === null ? 'no signature' : 'the signature did not hold' } });
    return { status: 401, kept: 0, unfiled: 0 };
  }
  const w = readWebhook(raw);
  let kept = 0, unfiled = 0;
  // Every contact's number, as WhatsApp writes it — read once per body.
  const byNumber = new Map<string, { contact: string; business: string }[]>();
  for (const c of app.db.all<{ id: string; business_id: string; phone: string }>("SELECT id, business_id, phone FROM contacts WHERE business_id IS NOT NULL AND phone IS NOT NULL AND trim(phone) <> ''")) {
    const n = waNumber(c.phone);
    if (n !== null) byNumber.set(n, [...(byNumber.get(n) ?? []), { contact: c.id, business: c.business_id }]);
  }
  for (const m of w.incoming) {
    const who = byNumber.get(m.from) ?? [];
    const businesses = [...new Set(who.map((x) => x.business))];
    const business = businesses.length === 1 ? businesses[0]! : null;
    const contacts = business === null ? [] : who.filter((x) => x.business === business);
    const id = randomUUID();
    const r = app.db.run(
      'INSERT OR IGNORE INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, created_at, status_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, business, contacts.length === 1 ? contacts[0]!.contact : null, 'IN', m.from, m.kind, m.body, m.wa_id, 'RECEIVED', m.at, now]);
    if (r.changes !== 1) continue; // the same message delivered again
    kept++;
    if (business === null) unfiled++;
    app.audit.append({ at: now, kind: 'WHATSAPP_RECEIVED', outcome: 'ALLOWED', actor_id: null, actor_role: null, object_type: 'whatsapp_message', object_id: id,
      detail: { filed: business !== null, ...(business === null ? { why: businesses.length === 0 ? 'no contact has that number' : 'more than one company has a contact with that number' } : { business }) } });
  }
  for (const s of w.statuses) {
    const row = app.db.get<{ id: string; status: string }>("SELECT id, status FROM whatsapp_messages WHERE wa_id = ? AND direction = 'OUT'", [s.wa_id]);
    if (row === undefined || (RANK[s.status] ?? 0) <= (RANK[row.status] ?? 0)) continue;
    app.db.run('UPDATE whatsapp_messages SET status = ?, status_at = ?, error = ? WHERE id = ?', [s.status, s.at, s.error, row.id]);
  }
  return { status: 200, kept, unfiled };
}

export type Unfiled = { readonly id: string; readonly shown: string; readonly when: string; readonly body: string };

/** WhatsApp messages from a number no single company has. Admin and Sales, who may write to clients. */
export function unfiledWhatsApp(db: Db, actor: Actor, nowIso: string): Unfiled[] {
  if (!can(actor, 'client_message.write', { type: 'client_message', id: 'queue', business_id: 'queue' })) return [];
  return db.all<{ id: string; phone: string; created_at: string; body: string }>(
    "SELECT id, phone, created_at, body FROM whatsapp_messages WHERE business_id IS NULL AND direction = 'IN' ORDER BY created_at DESC")
    .map((r) => ({ id: r.id, shown: `+${r.phone}`, when: localStamp(r.created_at, nowIso), body: r.body }));
}

/** File one such message under a company, by hand. */
export function fileWhatsApp(app: App, actor: Actor, id: string, business_id: string): { ok: true } | { ok: false; why: string } {
  authorise(actor, 'client_message.write', obj(app.db, business_id));
  if (app.db.get('SELECT 1 AS x FROM businesses WHERE id = ?', [business_id]) === undefined) return { ok: false, why: 'Choose a company.' };
  const r = app.db.run("UPDATE whatsapp_messages SET business_id = ?, filed_by = ? WHERE id = ? AND business_id IS NULL AND direction = 'IN'", [business_id, actor.id, id]);
  if (r.changes !== 1) return { ok: false, why: 'That message is already filed.' };
  app.audit.append({ at: app.now(), kind: 'WHATSAPP_FILED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'whatsapp_message', object_id: id, detail: { business: business_id } });
  return { ok: true };
}

/* ------------------------------------------------------------------ the whole conversation */

export type Channel = 'Portal' | 'Email' | 'WhatsApp';
export type ConversationItem = {
  readonly at: string; readonly when: string; readonly channel: Channel; readonly ours: boolean;
  readonly who: string; readonly subject: string | null; readonly body: string; readonly state: string | null;
};

const WA_STATE: Readonly<Record<string, string>> = { SENT: 'Sent', DELIVERED: 'Delivered', READ: 'Read', FAILED: 'Not delivered', NOT_SENT: 'Not sent' };

/** Everything with the company, oldest first: portal messages and emailed replies, the emails we sent, and WhatsApp. */
export function conversation(db: Db, actor: Actor, business_id: string, nowIso: string): ConversationItem[] {
  const t = clientThread(db, actor, business_id); // asks client_message.read
  const items: ConversationItem[] = t.messages.map((m) => ({
    at: m.at, when: m.when, channel: m.by_email ? 'Email' : 'Portal', ours: !m.from_client, who: m.who, subject: null, body: m.body, state: null,
  }));
  // The emails WE sent THE CLIENT: to the company's address or one of its contacts' — not an alert to a colleague.
  const theirs = new Set(db.all<{ e: string }>(
    "SELECT lower(email) AS e FROM contacts WHERE business_id = ? AND email IS NOT NULL UNION SELECT lower(contact_email) FROM businesses WHERE id = ? AND contact_email IS NOT NULL",
    [business_id, business_id]).map((r) => r.e));
  for (const e of db.all<{ created_at: string; to_email: string; subject: string; body: string; sent_at: string | null; kind: string }>(
    'SELECT created_at, to_email, subject, body, sent_at, kind FROM outbox WHERE business_id = ? ORDER BY created_at', [business_id])) {
    if (SENT_SECRET_KINDS.includes(e.kind)) continue; // a sign-in code or one-use link is never shown
    if (!theirs.has(e.to_email.toLowerCase())) continue;
    items.push({ at: e.created_at, when: localStamp(e.created_at, nowIso), channel: 'Email', ours: true, who: `Cap Rebate, to ${e.to_email}`,
      subject: e.subject, body: e.body, state: e.sent_at === null ? 'Not sent' : 'Sent' });
  }
  for (const w of db.all<{ created_at: string; direction: string; body: string; status: string; error: string | null; contact: string | null; writer: string | null; phone: string }>(
    'SELECT w.created_at, w.direction, w.body, w.status, w.error, c.full_name AS contact, u.display_name AS writer, w.phone FROM whatsapp_messages w ' +
    'LEFT JOIN contacts c ON c.id = w.contact_id LEFT JOIN users u ON u.id = w.written_by WHERE w.business_id = ? ORDER BY w.created_at', [business_id])) {
    const ours = w.direction === 'OUT';
    items.push({ at: w.created_at, when: localStamp(w.created_at, nowIso), channel: 'WhatsApp', ours,
      who: ours ? `${w.writer ?? 'Cap Rebate'}, to ${w.contact ?? `+${w.phone}`}` : (w.contact ?? `+${w.phone}`),
      subject: null, body: w.body, state: ours ? `${WA_STATE[w.status] ?? w.status}${w.error === null ? '' : ` — ${w.error}`}` : null });
  }
  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
