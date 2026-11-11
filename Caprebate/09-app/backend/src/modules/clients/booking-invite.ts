/**
 * THE INVITATION FOR ONE BOOKING.
 *
 * One place builds the .ics for a call, for all three routes that change one: the funnel's close (a time chosen), the
 * staff calendar (a time given or moved) and the client's portal (moved, given back or cancelled). It reads the
 * booking's own change count for the SEQUENCE and the one sender setting for the organiser, and returns null when
 * there is no address to invite — the email is still saved, it just carries no invitation.
 */

import type { Db } from '../../core/index.ts';
import { brandedEmail, currentSender, type BrandedEmail, type EmailBlock, type EmailContent, type InlineFile } from '../../integrations/index.ts';
import type { App } from '../../core/app.ts';
import { localWhen } from '../../shared/index.ts';
import { SLOT_MINUTES } from './schedule.ts';
import { inviteFile, type InviteMethod } from '../../integrations/index.ts';
import { activeMeeting, clientJoinUrl } from './video-calls.ts';
import { FREE_PLAN_LINE, zoomPlanIsFree } from '../../integrations/index.ts';
import { getBookingChangesCountByBookingId, getBookingsBusinessIdLeadIdById, getBookingsChannelById, getBusinessesEById, getContactsEByLeadId } from './data.ts';

export const CALL_SUMMARY = 'Your call with Cap Rebate';

/* ------------------------------------------------------------------ the call emails (emails.py, Phase 161m2)
 * call-booked-phone, call-booked-video and call-changed, in the branded layout, for every route that books, moves or
 * cancels a call: the funnel's close, the staff calendar and the client's portal. Each speaks to the client.
 */

/** The sentence an invitation carried while sending is off. The outbox takes it out of an email that is going. */
export const INVITE_NOT_SENT = 'Not sent yet. Emails and calendar invites are not switched on yet. '
  + 'This message and its invite are saved with the emails waiting to send.';

/** "Wednesday 24 Sep 2026" and "10:30 BST", from one stored moment. */
export function callWhen(iso: string): { readonly date: string; readonly time: string } {
  const w = localWhen(iso);
  const at = w.lastIndexOf(' at ');
  return at < 0 ? { date: w, time: '' } : { date: w.slice(0, at), time: w.slice(at + 4) };
}
const whenRow = (iso: string): string => { const w = callWhen(iso); return w.time === '' ? w.date : `${w.date}, ${w.time}`; };

/** Where a client manages their calls: the portal's appointment section. */
export function callsLink(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/portal#appointment`;
}

/** call-booked-phone: we ring them. `invite`: whether a calendar file is attached. */
export function callBookedPhoneEmail(a: { starts_at: string; phone: string | null; invite: boolean; manageLink: string }): EmailContent {
  const w = callWhen(a.starts_at);
  const blocks: EmailBlock[] = [
    { kind: 'facts', rows: [['When', whenRow(a.starts_at)], ['How long', `${SLOT_MINUTES} minutes`], ['How', a.phone === null ? 'We will ring you' : `We will ring you on ${a.phone}`]] },
    ...(a.invite ? ['The calendar invite is attached, so you can add it to your diary.'] : []),
    'On the call we will go through your property, what you might claim and how we work. It helps to have the purchase date and price, or the build cost, to hand.',
    'Need a different time? You can move or cancel the call in your portal.',
    INVITE_NOT_SENT,
  ];
  return {
    subject: `Your call with Cap Rebate on ${w.date}`,
    preheader: `We will ring you on ${w.date} at ${w.time}.`,
    heading: 'Your call is booked',
    blocks,
    button: { label: 'Manage your call', href: a.manageLink },
    sign: 'The Cap Rebate team',
  };
}

/**
 * call-booked-video: the join page, the meeting ID and passcode. Without a meeting yet (Zoom not set up, or it failed),
 * the same email says the link will follow. `moved`: a call given a new time by our team.
 */
export function callBookedVideoEmail(a: {
  starts_at: string; moved: boolean; manageLink: string; freePlan: boolean;
  meeting: { readonly join: string; readonly meeting_id: string; readonly passcode: string | null } | null;
}): EmailContent {
  const w = callWhen(a.starts_at);
  const m = a.meeting;
  const rows: (readonly [string, string])[] = [['When', whenRow(a.starts_at)], ['How long', `${SLOT_MINUTES} minutes`]];
  if (m !== null) {
    rows.push(['Meeting ID', m.meeting_id.replace(/(\d{3})(\d{3,4})(\d{4})$/, '$1 $2 $3')]);
    if (m.passcode !== null) rows.push(['Passcode', m.passcode]);
  }
  return {
    subject: a.moved ? `Your video call with Cap Rebate has been moved to ${w.date}` : `Your video call with Cap Rebate on ${w.date}`,
    preheader: m === null ? 'We will email you the link for the video call before it starts.'
      : a.moved ? `Your call is now on ${w.date} at ${w.time}. The link is inside.` : `Join on Zoom at ${w.time}. The link is inside.`,
    heading: a.moved ? 'Your video call has been moved' : 'Your video call is booked',
    blocks: [
      { kind: 'facts', rows },
      m === null ? 'We will email you the link for the video call before it starts.'
        : 'Use the button below to join. You can join from a browser, or from the Zoom app if you have it.',
      ...(m !== null && a.freePlan ? [FREE_PLAN_LINE] : []),
      'Need a different time? You can move or cancel the call in your portal.',
      INVITE_NOT_SENT,
    ],
    button: m === null ? { label: 'Manage your call', href: a.manageLink } : { label: 'Join the call', href: m.join },
    sign: 'The Cap Rebate team',
  };
}

/**
 * call-changed: moved to a new time, cancelled, or the time given back (a new time is needed). It speaks to the client,
 * whoever made the change. `was_starts_at`: the time it had, if it had one.
 */
export function callChangedEmail(a: {
  what: 'moved' | 'cancelled' | 'released'; starts_at: string | null; was_starts_at: string | null; invite: boolean; portalLink: string;
}): EmailContent {
  const was = a.was_starts_at === null ? null : callWhen(a.was_starts_at);
  const button = { label: 'See your calls', href: a.portalLink };
  if (a.what === 'moved' && a.starts_at !== null) {
    const w = callWhen(a.starts_at);
    return {
      subject: `Your call with Cap Rebate has been moved to ${w.date}`,
      preheader: `Your call is now on ${w.date} at ${w.time}.`,
      heading: 'Your call has been moved',
      blocks: [
        { kind: 'facts', rows: [['New time', whenRow(a.starts_at)], ...(a.was_starts_at === null ? [] : [['Was', whenRow(a.was_starts_at)] as const])] },
        ...(a.invite ? ['A new calendar invite is attached. The old one is cancelled.'] : []),
        INVITE_NOT_SENT,
      ],
      button, sign: 'The Cap Rebate team',
    };
  }
  if (a.what === 'cancelled') {
    const line = was === null ? 'Your call is cancelled. You can book a new time in your portal whenever suits you.'
      : `Your call on ${was.date} is cancelled. You can book a new time in your portal whenever suits you.`;
    return {
      subject: 'Your call with Cap Rebate has been cancelled',
      preheader: was === null ? 'Your call is cancelled.' : `Your call on ${was.date} is cancelled.`,
      heading: 'Your call has been cancelled',
      blocks: [line, INVITE_NOT_SENT],
      button, sign: 'The Cap Rebate team',
    };
  }
  // The time given back: the call stands, and waits for a new time.
  return {
    subject: 'Your call with Cap Rebate: a new time is needed',
    preheader: 'We will be in touch to arrange a new time.',
    heading: 'Your call needs a new time',
    blocks: [
      was === null ? 'You gave back the time for your call.' : `You gave back the time for your call on ${was.date}.`,
      'We will be in touch to arrange a new one. You can also book a new time in your portal whenever suits you.',
      INVITE_NOT_SENT,
    ],
    button, sign: 'The Cap Rebate team',
  };
}

/** An email's content, drawn: the subject, the text and the HTML, for the outbox. */
export function drawCallEmail(c: EmailContent, origin: string | null): BrandedEmail {
  return brandedEmail(c, { publicOrigin: origin });
}

/** How many times this booking has changed. The first invitation is 0; every change after it counts one more. */
export function inviteSequence(db: Db, booking_id: string): number {
  return getBookingChangesCountByBookingId<{ n: number }>(db, [booking_id])?.n ?? 0;
}

export function bookingInviteFile(
  db: Db, now: () => string,
  a: { booking_id: string; method: InviteMethod; starts_at: string; ends_at: string; to: string | null | undefined;
    /** The site's address, for a video call's join page. Absent, the invitation carries Zoom's own link. */
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
 * WHERE THE CALL IS, AND WHAT TO DO. A telephone call: we ring. A video call with its Zoom meeting: our
 * join page (or, where the site's address is not to hand, Zoom's own link) and the passcode. A video call without one
 * yet: the link will follow.
 */
function placeAndWords(db: Db, booking_id: string, method: InviteMethod, origin: string | undefined): { description: string; location: string } {
  if (method === 'CANCEL') {
    return { description: 'This call is cancelled. Your enquiry is still open. Reply to this email if you would like another time.', location: 'Cancelled' };
  }
  const channel = getBookingsChannelById<{ channel: string }>(db, [booking_id])?.channel;
  if (channel !== 'video') {
    return { description: 'We will ring you at this time. Reply to this email if you need to change it.', location: 'By telephone. We will ring you.' };
  }
  const m = activeMeeting(db, booking_id);
  if (m === undefined) {
    return { description: 'A video call. We will email you the link before it starts. Reply to this email if you need to change it.', location: 'Video call. We will email you the link.' };
  }
  const link = origin === undefined ? m.join_url : clientJoinUrl(origin, m.client_token);
  return {
    description: `A video call. Join it in your web browser: ${link}` + (origin === undefined ? '' : `, or in the Zoom app: ${m.join_url}`) +
      (m.passcode === null ? '' : ` (passcode ${m.passcode})`) + '. Reply to this email if you need to change it.',
    location: link,
  };
}

/**
 * A VIDEO CALL'S INVITATION, SENT ONCE ITS MEETING IS MADE — the time, OUR join page, Zoom's link and
 * passcode, and the calendar file with our page as its place. Without a meeting (Zoom not set up, or it failed), the
 * same email says the link will follow. Saved to the outbox like every other; it leaves when email sending is on.
 * The funnel's close sends it after the meeting is made, and so does the staff calendar when it gives or moves a time.
 */
export function sendVideoInvite(app: App, origin: string, booking_id: string, what: 'arranged' | 'moved', toAddress?: string): void {
  const b = getBookingsBusinessIdLeadIdById<{ business_id: string | null; lead_id: string | null; starts_at: string | null; ends_at: string | null; channel: string }>(app.db, [booking_id]);
  if (b === undefined || b.channel !== 'video' || b.starts_at === null || b.ends_at === null) return;
  // The Communication tab names who the call is with; otherwise the company's own address, as before.
  const to = toAddress !== undefined && toAddress.trim() !== '' ? toAddress.trim() : b.business_id !== null
    ? getBusinessesEById<{ e: string | null }>(app.db, [b.business_id])?.e ?? null
    : getContactsEByLeadId<{ e: string | null }>(app.db, [b.lead_id])?.e ?? null;
  if (to === null) return;
  const invite = bookingInviteFile(app.db, app.now, { booking_id, method: 'REQUEST', starts_at: b.starts_at, ends_at: b.ends_at, to, origin });
  // call-booked-video (emails.py): our join page behind the button, the meeting ID and passcode beside it.
  const m = activeMeeting(app.db, booking_id);
  const e = drawCallEmail(callBookedVideoEmail({
    starts_at: b.starts_at, moved: what === 'moved', manageLink: callsLink(origin), freePlan: zoomPlanIsFree(app.secrets),
    meeting: m === undefined ? null : { join: clientJoinUrl(origin, m.client_token), meeting_id: m.meeting_id, passcode: m.passcode },
  }), origin);
  app.email.send({
    to_email: to, subject: e.subject, body: e.text, html: e.html,
    kind: 'CALENDAR_INVITE',
    business_id: b.business_id,
    ...(invite === null ? {} : { inline_files: [invite] }),
  });
}
