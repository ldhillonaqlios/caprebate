/**
 * THE ONE SENDER SETTING, ON THE ADMIN SETTINGS SCREEN (Phase 161l1, moved from src/modules/crm/free-email.ts
 * unchanged): who every email comes from, read and changed. A change is a new row; the old one stays, as the record of
 * what earlier emails were sent under. The table and the actions are the admin's.
 */
import type { Db } from '../../core/index.ts';
import type { AuditLog } from '../../core/audit.ts';
import { authorise, can, type Actor } from '../../core/index.ts';
import { currentSender, type Sender } from '../../integrations/index.ts';
import { insertEmailSender } from './data.ts';

/** What changing the sender needs: the database, the audit log, the clock and new ids. */
export type SenderDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

const ADDRESS = /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/;

export function senderSetting(db: Db, actor: Actor): { sender: Sender; may_write: boolean } {
  authorise(actor, 'configuration.read', { type: 'configuration', id: 'settings' });
  return { sender: currentSender(db), may_write: can(actor, 'configuration.write', { type: 'configuration', id: 'settings' }) };
}

/** CHANGE WHO EMAILS COME FROM. A new row; the old one stays, as the record of what earlier emails were sent under. */
export function setSender(d: SenderDeps, actor: Actor, input: Readonly<Record<string, string | null>>): { ok: true } | { ok: false; why: string; field?: string } {
  authorise(actor, 'configuration.write', { type: 'configuration', id: 'settings' });
  const name = (input['display_name'] ?? '').replace(/[\r\n<>"]+/g, ' ').trim();
  const address = (input['address'] ?? '').trim().toLowerCase();
  const reply = ((input['reply_to'] ?? '').trim() || address).toLowerCase();
  if (name === '' || name.length > 80) return { ok: false, why: 'Give the name people see, up to 80 characters.', field: 'display_name' };
  if (!ADDRESS.test(address) || address.length > 254) return { ok: false, why: 'That is not an email address.', field: 'address' };
  if (!ADDRESS.test(reply) || reply.length > 254) return { ok: false, why: 'The reply address is not an email address.', field: 'reply_to' };
  const now = currentSender(d.db);
  if (now.display_name === name && now.address === address && now.reply_to === reply) return { ok: true };
  const id = d.newId();
  insertEmailSender(d.db, [id, name, address, reply, actor.id, d.now()]);
  d.audit.append({
    at: d.now(), kind: 'EMAIL_SENDER_SET', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'configuration', object_id: 'email_sender', detail: { row: id },
  });
  return { ok: true };
}
