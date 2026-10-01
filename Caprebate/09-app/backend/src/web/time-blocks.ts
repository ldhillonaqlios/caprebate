/**
 * BLOCKING OFF TIME IN YOUR OWN DIARY. 1 October 2026 (migration 066).
 *
 * Lakhbir: "a calendar allowing users to block off time look what what they have booked in the future".
 *
 * WHO: any member of staff who can work (not the view-only login, not a client) blocks and frees their OWN time; Admin
 * may free anyone's. A block holds its span exactly as a call does: `bookedSpans` and `isBookable` (src/web/schedule.ts)
 * read both, so no slot is offered and no call is booked into it — by the client's picker or by staff.
 * REFUSED: a span that is not a span (the end not after the start), longer than 31 days, wholly in the past, or that
 * overlaps a call already in that person's diary (move the call first — a block must never strand a client).
 * The reason is the person's own words, for staff only, and never in the audit line.
 */

import type { Db } from '../db.ts';
import type { AuditLog } from '../audit.ts';
import type { Actor } from '../authz.ts';
import { instantsForLocalMinute } from './localtime.ts';

export type BlockDeps = { db: Db; audit: AuditLog; now: () => string; newId: () => string };

export type TimeBlock = { readonly id: string; readonly user_id: string; readonly starts_at: string; readonly ends_at: string; readonly reason: string };

const MAX_DAYS = 31;

/** Who may keep a diary of their own here. */
export function mayBlockTime(actor: Actor): boolean {
  return actor.role === 'ADMIN' || actor.role === 'SALES' || actor.role === 'ACCOUNTING' || actor.role === 'SURVEYING';
}

/** A local date ("2026-10-05") and clock ("13:30") as an instant, or null when it is not one (or falls in the spring gap). */
export function localInstant(date: string, clock: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const c = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (d === null || c === null) return null;
  const [y, m, day, hh, mm] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(c[1]), Number(c[2])];
  if (m < 1 || m > 12 || day < 1 || day > 31 || hh > 23 || mm > 59) return null;
  const at = instantsForLocalMinute(y, m, day, hh * 60 + mm)[0];
  if (at === undefined) return null;
  const iso = new Date(at).toISOString();
  return iso;
}

/** One person's blocks that touch [from, to), oldest first. Taken-off blocks are not in it. */
export function blocksFor(db: Db, user_id: string, fromIso: string, toIso: string): TimeBlock[] {
  return db.all<TimeBlock>(
    'SELECT id, user_id, starts_at, ends_at, reason FROM time_blocks WHERE user_id = ? AND removed_at IS NULL AND starts_at < ? AND ends_at > ? ORDER BY starts_at, id',
    [user_id, toIso, fromIso]);
}

export type BlockResult = { ok: true; id: string } | { ok: false; why: string };

export function addBlock(d: BlockDeps, actor: Actor, input: { date: string; from: string; to: string; until_date?: string; reason: string }): BlockResult {
  if (!mayBlockTime(actor)) return { ok: false, why: 'Only staff who take calls or do the work keep a diary here.' };
  const start = localInstant(input.date, input.from);
  const end = localInstant(input.until_date !== undefined && input.until_date.trim() !== '' ? input.until_date : input.date, input.to);
  if (start === null || end === null) return { ok: false, why: 'Give a date, and a time to start and to finish.' };
  if (end <= start) return { ok: false, why: 'The finish must be after the start.' };
  if (Date.parse(end) - Date.parse(start) > MAX_DAYS * 86_400_000) return { ok: false, why: `Block at most ${MAX_DAYS} days at a time.` };
  if (end <= d.now()) return { ok: false, why: 'That time has already gone.' };
  const reason = input.reason.replace(/\s+/g, ' ').trim();
  if (reason.length > 120) return { ok: false, why: 'Keep the reason under 120 characters.' };
  // A call already in this diary at that time: move it first, so no client is left without the call they booked.
  const clash = d.db.get<{ id: string }>(
    'SELECT id FROM bookings WHERE assigned_to = ? AND cancelled_at IS NULL AND starts_at IS NOT NULL AND starts_at < ? AND ends_at > ? LIMIT 1',
    [actor.id, end, start]);
  if (clash !== undefined) return { ok: false, why: 'You have a call booked in that time. Move the call first, then block the time.' };
  const id = d.newId();
  d.db.run('INSERT INTO time_blocks (id, user_id, starts_at, ends_at, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, actor.id, start, end, reason, actor.id, d.now()]);
  d.audit.append({ at: d.now(), kind: 'TIME_BLOCKED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'time_block', object_id: id,
    detail: { hours: Math.round((Date.parse(end) - Date.parse(start)) / 3_600_000 * 10) / 10 } });
  return { ok: true, id };
}

export function removeBlock(d: BlockDeps, actor: Actor, id: string): { ok: true } | { ok: false; why: string } {
  const b = d.db.get<{ user_id: string; removed_at: string | null }>('SELECT user_id, removed_at FROM time_blocks WHERE id = ?', [id]);
  if (b === undefined || b.removed_at !== null) return { ok: false, why: 'That time is not blocked.' };
  if (b.user_id !== actor.id && actor.role !== 'ADMIN') return { ok: false, why: 'You can only free your own time.' };
  d.db.run('UPDATE time_blocks SET removed_at = ?, removed_by = ? WHERE id = ? AND removed_at IS NULL', [d.now(), actor.id, id]);
  d.audit.append({ at: d.now(), kind: 'TIME_FREED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'time_block', object_id: id, detail: {} });
  return { ok: true };
}
