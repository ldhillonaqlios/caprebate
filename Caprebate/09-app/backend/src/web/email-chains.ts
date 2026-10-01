/**
 * EMAIL CHAINS WITH A CLIENT. 1 October 2026.
 *
 * Lakhbir: "the right hand side should show the chain of emails allowing a user to click on reply making them apart of
 * the chain so essentially the left becomes a send message, if no current email chain (on the right) is selected then it
 * fires as a new email."
 *
 * A CHAIN is the emails we sent the company and the emails they sent back, joined the way mail programs join them:
 *   · an email of ours begins a chain (its own id is the chain's key), or joins the one it replied to (`thread_key`,
 *     migration 065);
 *   · their reply joins the chain of the email of ours it answers — the one the mailbox reader matched by Message-ID
 *     (src/web/inbound-email.ts, `matched_outbox_id`); one that answered nothing of ours, filed under the company by a
 *     person, begins its own chain (its id is the key).
 * Which emails: every email to the company except a sign-in code or a one-use link; those to an address that is not the
 * company's or one of its contacts' only where staff typed it themselves (an alert to a colleague is not the client's).
 * Their replies are shown only to a login that may read the client's messages.
 *
 * A REPLY (`replyTo`) goes to whoever wrote last in the chain (else to whom we last wrote), "Re: " the chain's subject,
 * and names the Message-IDs it answers, so their mail program keeps it in the same conversation and their answer comes
 * back matched to it.
 */

import type { Db } from '../db.ts';
import { can, type Actor } from '../authz.ts';
import { SENT_SECRET_KINDS } from '../stubs/email-provider.ts';
import { localStamp } from './localtime.ts';
import { emailsReadUntil } from './messages.ts';

export type ChainEmail = {
  readonly id: string; readonly at: string; readonly when: string; readonly ours: boolean;
  readonly who: string; readonly subject: string; readonly body: string;
  /** Ours only: sent, saved, waiting, or why not. */
  readonly state: string | null;
  readonly unread: boolean;
};

export type EmailChain = {
  readonly key: string;
  readonly subject: string;
  readonly emails: readonly ChainEmail[];
  readonly last_at: string;
  readonly unread: number;
  /** Where a reply goes: who wrote last, else whom we last wrote to. */
  readonly reply_to: string;
  /** The Message-IDs a reply names: the latest, and all of them in order. */
  readonly in_reply_to: string | null;
  readonly references: readonly string[];
  readonly claim_id: string | null;
};

export const STATE_WORDS = (sent_at: string | null, requested: number, last_error: string | null, nowIso?: string): string =>
  sent_at !== null ? `Sent ${localStamp(sent_at, nowIso)}`
    : requested === 1 ? (last_error === null ? 'Waiting to be sent' : `Not sent: ${last_error}`)
      : 'Saved — not sent';

/** "Re: " once, however many times the chain has gone back and forth. */
export function reSubject(subject: string): string {
  const s = subject.trim();
  return (/^re:\s/i.test(s) ? s : `Re: ${s}`).slice(0, 300);
}

type Out = {
  id: string; created_at: string; to_email: string; subject: string; body: string; sent_at: string | null; send_requested: number;
  last_error: string | null; kind: string; provider_ref: string | null; thread_key: string | null; claim_id: string | null; writer: string | null;
};
type In = {
  id: string; received_at: string; from_address: string; subject: string; text_body: string; message_id: string | null;
  matched_outbox_id: string | null; claim_id: string | null; contact: string | null; read_at: string | null;
};

/** The company's chains (or a lead's, where it has no company yet), the one with the newest email first. */
export function emailChains(db: Db, actor: Actor, who: { business_id: string | null; lead_id: string | null }, nowIso: string): EmailChain[] {
  const outs = who.business_id !== null
    ? db.all<Out>('SELECT o.id, o.created_at, o.to_email, o.subject, o.body, o.sent_at, o.send_requested, o.last_error, o.kind, o.provider_ref, o.thread_key, o.claim_id, ' +
      'u.display_name AS writer FROM outbox o LEFT JOIN users u ON u.id = o.written_by WHERE o.business_id = ? ORDER BY o.created_at, o.id', [who.business_id])
    : db.all<Out>('SELECT o.id, o.created_at, o.to_email, o.subject, o.body, o.sent_at, o.send_requested, o.last_error, o.kind, o.provider_ref, o.thread_key, o.claim_id, ' +
      'u.display_name AS writer FROM outbox o LEFT JOIN users u ON u.id = o.written_by WHERE o.lead_id = ? AND o.business_id IS NULL ORDER BY o.created_at, o.id', [who.lead_id ?? '']);
  // The company's own addresses: an email to anyone else is the client's only where staff typed it.
  const theirs = new Set(who.business_id === null ? [] : db.all<{ e: string }>(
    'SELECT lower(email) AS e FROM contacts WHERE business_id = ? AND email IS NOT NULL UNION SELECT lower(contact_email) FROM businesses WHERE id = ? AND contact_email IS NOT NULL',
    [who.business_id, who.business_id]).map((r) => r.e));
  const keyOf = new Map<string, string>(); // outbox id -> chain key
  type Item = ChainEmail & { key: string; address: string; message_id: string | null; claim_id: string | null };
  const items: Item[] = [];
  for (const o of outs) {
    if (SENT_SECRET_KINDS.includes(o.kind)) continue;
    const key = o.thread_key ?? o.id;
    keyOf.set(o.id, key);
    if (who.business_id !== null && !['FREE_TYPED', 'TEMPLATE'].includes(o.kind) && !theirs.has(o.to_email.toLowerCase())) continue;
    items.push({
      id: o.id, key, at: o.created_at, when: localStamp(o.created_at, nowIso), ours: true,
      who: `${o.writer ?? 'Cap Rebate'}, to ${o.to_email}`, subject: o.subject, body: o.body,
      state: STATE_WORDS(o.sent_at, o.send_requested, o.last_error, nowIso), unread: false,
      address: o.to_email, message_id: o.sent_at === null ? null : o.provider_ref, claim_id: o.claim_id,
    });
  }
  const mayRead = who.business_id !== null && can(actor, 'client_message.read', { type: 'client_message', id: who.business_id, business_id: who.business_id });
  if (mayRead) {
    const readUntil = emailsReadUntil(db, actor.id, who.business_id ?? '');
    for (const e of db.all<In>(
      'SELECT e.id, e.received_at, e.from_address, e.subject, e.text_body, e.message_id, e.matched_outbox_id, e.claim_id, c.full_name AS contact, m.created_at AS read_at ' +
      'FROM inbound_email e LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id LEFT JOIN contacts c ON c.id = e.contact_id ' +
      'LEFT JOIN client_messages m ON m.id = COALESCE(e.client_message_id, g.client_message_id) ' +
      'WHERE COALESCE(e.business_id, g.business_id) = ? ORDER BY e.received_at, e.id', [who.business_id])) {
      let key = e.id;
      if (e.matched_outbox_id !== null) {
        key = keyOf.get(e.matched_outbox_id)
          ?? db.get<{ k: string }>('SELECT COALESCE(thread_key, id) AS k FROM outbox WHERE id = ?', [e.matched_outbox_id])?.k ?? e.id;
      }
      items.push({
        id: e.id, key, at: e.received_at, when: localStamp(e.received_at, nowIso), ours: false,
        who: e.contact === null ? e.from_address : `${e.contact} (${e.from_address})`, subject: e.subject === '' ? '(no subject)' : e.subject,
        body: e.text_body, state: null, unread: (e.read_at ?? e.received_at) > readUntil,
        address: e.from_address, message_id: e.message_id, claim_id: e.claim_id,
      });
    }
  }
  const byKey = new Map<string, Item[]>();
  for (const i of items) byKey.set(i.key, [...(byKey.get(i.key) ?? []), i]);
  const chains: EmailChain[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    const last = sorted[sorted.length - 1]!;
    const lastTheirs = [...sorted].reverse().find((x) => !x.ours);
    const ids = sorted.map((x) => x.message_id).filter((x): x is string => x !== null);
    chains.push({
      key, subject: (sorted[0]?.subject ?? '').replace(/^(re:\s*)+/i, '') || '(no subject)',
      emails: sorted.map(({ key: _k, address: _a, message_id: _m, claim_id: _c, ...e }) => e),
      last_at: last.at, unread: sorted.filter((x) => x.unread).length,
      reply_to: (lastTheirs ?? last).address,
      in_reply_to: ids[ids.length - 1] ?? null, references: ids,
      claim_id: [...sorted].reverse().find((x) => x.claim_id !== null)?.claim_id ?? null,
    });
  }
  return chains.sort((a, b) => (a.last_at > b.last_at ? -1 : a.last_at < b.last_at ? 1 : 0));
}
