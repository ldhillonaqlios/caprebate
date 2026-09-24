/**
 * CALENDAR INVITATIONS — a standard .ics file on every booked, moved or cancelled call. Phase 146f, 22 September 2026.
 *
 * Lakhbir decided email and calendar invitations go through IONOS. Booking already happens inside the application
 * (the staff calendar, the client's own portal, the funnel's close); what was missing was the invitation itself.
 * `src/stubs/email.ts` has said since Phase 105 that an invitation "is an email with an attachment, so it goes down
 * the same path": this builds the attachment, and it rides the same outbox and the same switch (EMAIL_SENDING, off).
 *
 * WHAT IS SENT. One iCalendar object (RFC 5545) with METHOD:REQUEST for a call booked or moved, and METHOD:CANCEL for
 * a call cancelled or a time given back (RFC 5546). Every calendar that reads email reads it — IONOS, Outlook, Apple,
 * Google — with no account of ours in any of them. There is NO TWO-WAY SYNC: nothing reads a calendar, and a reply
 * to the invitation lands in the contact@ mailbox like any other email.
 *
 * ONE UID PER BOOKING, AND A SEQUENCE THAT ONLY GOES UP. The UID is the booking's id; SEQUENCE is how many times the
 * booking has changed (booking_changes). So a moved call replaces the old one in the client's calendar rather than
 * adding a second, and a cancellation removes the right one.
 *
 * TIMES ARE UTC ("Z"). The stored value is UTC; the calendar shows it in the reader's own time. The words in the
 * email body stay UK time (localWhen), as Phase 113a requires.
 */

import type { InlineFile } from './email.ts';

export type InviteMethod = 'REQUEST' | 'CANCEL';

export type Invite = {
  readonly method: InviteMethod;
  readonly booking_id: string;
  readonly sequence: number;
  readonly starts_at: string;
  readonly ends_at: string;
  /** When the invitation was made. */
  readonly stamp: string;
  readonly summary: string;
  readonly description: string;
  readonly location: string;
  /** Who it is from: the sender setting's name and address (currentSender). */
  readonly organizer: { readonly name: string; readonly address: string };
  readonly attendee: string;
};

/** 20260610T090000Z from an ISO moment. */
export function icsTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) throw new Error(`not a moment: ${iso}`);
  return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** TEXT value escaping (RFC 5545 3.3.11): backslash, semicolon, comma and line breaks. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** A parameter value (CN=...): quoted, with no quote, line break or control character left in it. */
function paramValue(s: string): string {
  return `"${s.replace(/[\u0000-\u001f"\u007f]/g, ' ').trim()}"`;
}

/** A plain address for mailto:, or a refusal — an address is never allowed to carry a line or a parameter. */
function mailto(address: string): string {
  const a = address.trim();
  if (!/^[^@\s;:,<>"]+@[^@\s;:,<>"]+$/.test(a)) throw new Error('not a plain email address');
  return `mailto:${a}`;
}

/** Lines longer than 75 octets are folded with CRLF and one space (RFC 5545 3.1), never inside a UTF-8 character. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(i: Invite): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(i.booking_id)) throw new Error('a booking id is letters, digits and dashes');
  if (!Number.isInteger(i.sequence) || i.sequence < 0) throw new Error('the sequence is a whole number from 0');
  if (Date.parse(i.ends_at) <= Date.parse(i.starts_at)) throw new Error('a call ends after it starts');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CAP REBATE LTD//Caprebate back office//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${i.method}`,
    'BEGIN:VEVENT',
    `UID:booking-${i.booking_id}@caprebate.co.uk`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${icsTime(i.stamp)}`,
    `DTSTART:${icsTime(i.starts_at)}`,
    `DTEND:${icsTime(i.ends_at)}`,
    `SUMMARY:${icsText(i.summary)}`,
    `DESCRIPTION:${icsText(i.description)}`,
    `LOCATION:${icsText(i.location)}`,
    `ORGANIZER;CN=${paramValue(i.organizer.name)}:${mailto(i.organizer.address)}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:${mailto(i.attendee)}`,
    `STATUS:${i.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** The .ics as the file an email carries. */
export function inviteFile(i: Invite): InlineFile {
  return {
    filename: i.method === 'CANCEL' ? 'cancelled-call.ics' : 'call.ics',
    content_type: i.method === 'CANCEL' ? 'text/calendar; method=CANCEL; charset=utf-8' : 'text/calendar; method=REQUEST; charset=utf-8',
    bytes: new Uint8Array(Buffer.from(buildIcs(i), 'utf8')),
  };
}
