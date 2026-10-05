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
import type { App } from '../app.ts';
import { localWhen } from './localtime.ts';
import { SLOT_MINUTES } from './schedule.ts';
import { inviteFile, type InviteMethod } from '../stubs/calendar.ts';
import { activeMeeting, clientJoinUrl, videoJoinWords } from './video-calls.ts';
import { zoomPlanIsFree } from '../connectors/zoom.ts';

export const CALL_SUMMARY = 'Your call with Cap Rebate';

/** How many times this booking has changed. The first invitation is 0; every change after it counts one more. */
export function inviteSequence(db: Db, booking_id: string): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM booking_changes WHERE booking_id = ?', [booking_id])?.n ?? 0;
}

export function bookingInviteFile(
  db: Db, now: () => string,
  a: { booking_id: string; method: InviteMethod; starts_at: string; ends_at: string; to: string | null | undefined;
    /** 30 Sep 2026: the site's address, for a video call's join page. Absent, the invitation carries Zoom's own link. */
    origin?: string },
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
    ...placeAndWords(db, a.booking_id, a.method, a.origin),
    organizer: { name: from.display_name, address: from.address },
    attendee: to,
  });
}

/**
 * 30 Sep 2026: WHERE THE CALL IS, AND WHAT TO DO. A telephone call: we ring. A video call with its Zoom meeting: our
 * join page (or, where the site's address is not to hand, Zoom's own link) and the passcode. A video call without one
 * yet: the link will follow.
 */
function placeAndWords(db: Db, booking_id: string, method: InviteMethod, origin: string | undefined): { description: string; location: string } {
  if (method === 'CANCEL') {
    return { description: 'This call is cancelled. Your enquiry is still open. Reply to this email if you would like another time.', location: 'Cancelled' };
  }
  const channel = db.get<{ channel: string }>('SELECT channel FROM bookings WHERE id = ?', [booking_id])?.channel;
  if (channel !== 'video') {
    return { description: 'We will ring you at this time. Reply to this email if you need to change it.', location: 'By telephone. We will ring you.' };
  }
  const m = activeMeeting(db, booking_id);
  if (m === undefined) {
    return { description: 'A video call. We will email you the link before it starts. Reply to this email if you need to change it.', location: 'Video call. We will email you the link.' };
  }
  const link = origin === undefined ? m.join_url : clientJoinUrl(origin, m.client_token);
  return {
    description: `A video call. Join it in your web browser: ${link}` + (origin === undefined ? '' : ` — or in the Zoom app: ${m.join_url}`) +
      (m.passcode === null ? '' : ` (passcode ${m.passcode})`) + '. Reply to this email if you need to change it.',
    location: link,
  };
}

/**
 * 30 SEP 2026: A VIDEO CALL'S INVITATION, SENT ONCE ITS MEETING IS MADE — the time, OUR join page, Zoom's link and
 * passcode, and the calendar file with our page as its place. Without a meeting (Zoom not set up, or it failed), the
 * same email says the link will follow. Saved to the outbox like every other; it leaves when email sending is on.
 * The funnel's close sends it after the meeting is made, and so does the staff calendar when it gives or moves a time.
 */
export function sendVideoInvite(app: App, origin: string, booking_id: string, what: 'arranged' | 'moved', toAddress?: string): void {
  const b = app.db.get<{ business_id: string | null; lead_id: string | null; starts_at: string | null; ends_at: string | null; channel: string }>(
    'SELECT business_id, lead_id, starts_at, ends_at, channel FROM bookings WHERE id = ?', [booking_id]);
  if (b === undefined || b.channel !== 'video' || b.starts_at === null || b.ends_at === null) return;
  // 1 Oct 2026: the Communication tab names who the call is with; otherwise the company's own address, as before.
  const to = toAddress !== undefined && toAddress.trim() !== '' ? toAddress.trim() : b.business_id !== null
    ? app.db.get<{ e: string | null }>('SELECT contact_email AS e FROM businesses WHERE id = ?', [b.business_id])?.e ?? null
    : app.db.get<{ e: string | null }>('SELECT email AS e FROM contacts WHERE lead_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', [b.lead_id])?.e ?? null;
  if (to === null) return;
  const words = videoJoinWords(app.db, booking_id, origin, zoomPlanIsFree(app.secrets));
  const invite = bookingInviteFile(app.db, app.now, { booking_id, method: 'REQUEST', starts_at: b.starts_at, ends_at: b.ends_at, to, origin });
  app.email.send({
    to_email: to,
    subject: `Your video call with Cap Rebate${what === 'moved' ? ' has been moved' : ''} — ${localWhen(b.starts_at)}`,
    body: `A video call has been ${what} for ${localWhen(b.starts_at)}, lasting ${SLOT_MINUTES} minutes.\n\n` +
      `${words?.lines ?? ''}\n\n` +
      'Not sent yet. Emails and calendar invites are not switched on yet. ' +
      'This message and its invite are saved with the emails waiting to send.',
    kind: 'CALENDAR_INVITE',
    business_id: b.business_id,
    ...(invite === null ? {} : { inline_files: [invite] }),
  });
}
