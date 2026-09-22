/**
 * THE INVITATION FOR ONE BOOKING — Phase 146f, 22 September 2026.
 *
 * One place builds the .ics for a call, for all three routes that change one: the funnel's close (a time chosen), the
 * staff calendar (a time given or moved) and the client's portal (moved, given back or cancelled). It reads the
 * booking's own change count for the SEQUENCE and the one sender setting for the organiser, and returns null when
 * there is no address to invite — the email is still saved, it just carries no invitation.
 */

import type { Db } from '../db.ts';
import { currentSender, type InlineFile } from '../stubs/email.ts';
import { inviteFile, type InviteMethod } from '../stubs/calendar.ts';

export const CALL_SUMMARY = 'Your call with Cap Rebate';

/** How many times this booking has changed. The first invitation is 0; every change after it counts one more. */
export function inviteSequence(db: Db, booking_id: string): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM booking_changes WHERE booking_id = ?', [booking_id])?.n ?? 0;
}

export function bookingInviteFile(
  db: Db, now: () => string,
  a: { booking_id: string; method: InviteMethod; starts_at: string; ends_at: string; to: string | null | undefined },
): InlineFile | null {
  const to = (a.to ?? '').trim();
  if (!/^[^@\s;:,<>"]+@[^@\s;:,<>"]+\.[^@\s;:,<>"]+$/.test(to) || to.endsWith('.invalid')) return null;
  const from = currentSender(db);
  return inviteFile({
    method: a.method,
    booking_id: a.booking_id,
    sequence: inviteSequence(db, a.booking_id),
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    stamp: now(),
    summary: CALL_SUMMARY,
    description: a.method === 'CANCEL'
      ? 'This call is cancelled. Your enquiry is still open. Reply to this email if you would like another time.'
      : 'We will ring you at this time. Reply to this email if you need to change it.',
    location: 'By telephone. We will ring you.',
    organizer: { name: from.display_name, address: from.address },
    attendee: to,
  });
}
