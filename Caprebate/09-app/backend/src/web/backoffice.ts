/**
 * THE BACK OFFICE'S FIRST TWO SECTIONS — filled assessments, and the calendar.
 *
 * VIEW MODELS. The renderer in src/web/staff.ts draws what these return and
 * decides nothing; every authorisation is here, on the specific object, exactly
 * as src/web/portal.ts does it for the client half.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * N1 REACHES THIS FILE, AND IT IS THE REASON `range` IS OPTIONAL
 *
 * `estimate.read` lists ADMIN, SALES and a CLIENT on their own record. SURVEYING
 * IS DELIBERATELY ABSENT from it — the anchor quarantine, and the one rule this
 * project treats as load-bearing. A surveyor may read the assessment: the
 * client's answers are the INPUTS and withholding them would degrade the work
 * without protecting anything. Our NUMBER is what anchors.
 *
 * SO THE RANGE IS NOT READ WHEN IT MAY NOT BE SHOWN, rather than read and then
 * hidden. `assessmentRow` builds the object forwards from what the actor is
 * entitled to and adds `range` only where `can()` says yes, which is the same
 * discipline src/payload.ts applies to the surveyor payload and for the same
 * reason: build-then-strip is one forgotten key away from leaking, and a new
 * field must be absent by default. A test looks for the figure three ways — by
 * field, by value at any depth, and in the serialised text.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * "I DON'T KNOW" AND "SKIPPED" ARE ANSWERS
 *
 * Both are rows in `assessment_answers` with a STATE, and both are rendered as
 * what they are. The brief: "a skipped question is a fact about the claim, not
 * a blank" and "'I don't know' is a first-class answer throughout this system
 * and must display as one, never as an empty cell". So `answerLabel` returns a
 * sentence for all three states and there is no code path that produces ''.
 */

import type { Db } from '../db.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { formatShownRange, type ShownRange } from './shown-range.ts';
import { BOOKING } from './engine.ts';
import {
  SLOT_MINUTES, addLocalDays, isBookable, startOfLocalDay, startOfLocalWeek, staffSlots,
  type Availability,
} from './schedule.ts';
import { localWhen } from './localtime.ts';
import type { AuditLog } from '../audit.ts';
import type { EmailTransport } from '../stubs/email.ts';

export class BackOfficeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackOfficeError';
    this.code = code;
  }
}

/** A missing row and a forbidden row look the same from outside. */
export class NotFoundAsRefusal extends Error {
  readonly code = 'E_NOT_AUTHORISED';
  constructor() { super('not authorised'); this.name = 'NotFoundAsRefusal'; }
}

/**
 * THE COLLECTION GATE — "may you use this section at all", asked as an object
 * question rather than a role question.
 *
 * A per-object rule answers "may you read THIS assessment". It does not answer
 * "may you open the back office's list of every assessment", and those are
 * genuinely different: a CLIENT passes the first on their own record and must
 * fail the second. The lazy way to express that is `if (actor.role === 'CLIENT')`
 * at the top of a handler, which is the role check this application does not
 * have anywhere and is not about to acquire here.
 *
 * So the section is a SENTINEL OBJECT belonging to no business. Every rule that
 * lets a CLIENT through is `ownBusiness`, and no client's business is this, so
 * they are refused by the same table that lets ADMIN and SALES through
 * unconditionally — no new concept, no second mechanism, nothing to keep in
 * step. ACCOUNTING is refused from both sections for the same reason it is
 * refused everywhere else: it is not on those rows.
 */
const STAFF_SECTION = '__staff_section__';

export function assertSection(actor: Actor, action: 'assessment.read' | 'booking.read' | 'booking.write'): void {
  authorise(actor, action, action === 'assessment.read'
    ? { type: 'assessment', id: STAFF_SECTION, business_id: STAFF_SECTION }
    : { type: 'booking', id: STAFF_SECTION, business_id: STAFF_SECTION });
}

/** The back office's front door. See `backoffice.enter` in the rule table. */
export function mayEnterBackOffice(actor: Actor): boolean {
  return can(actor, 'backoffice.enter', { type: 'business', id: STAFF_SECTION });
}

export function assertBackOffice(actor: Actor): void {
  authorise(actor, 'backoffice.enter', { type: 'business', id: STAFF_SECTION });
}

/* ================================================================== *
 * SECTION 1 — FILLED ASSESSMENTS
 * ================================================================== */

export type PropertyView = { readonly label: string; readonly postcode: string | null };

export type ContactView = {
  /** A CB_BOOKING channel id, or null where nobody recorded one. */
  readonly channel: string | null;
  readonly variant: string | null;
  /** The words a person reads. Always a sentence, never an empty cell. */
  readonly label: string;
  /** Where in the journey they asked. CB_BOOKING.ENTRY_POINTS. */
  readonly entry_point: string | null;
  /** Whether this channel books a moment. CB_BOOKING decides; we ask. */
  readonly books_a_slot: boolean;
};

export type AssessmentRow = {
  readonly id: string;
  readonly business_id: string;
  readonly business_name: string;
  readonly sector: string;
  readonly submitted_at: string;
  readonly properties: readonly PropertyView[];
  readonly contact: ContactView;
  /**
   * PRESENT ONLY WHERE `estimate.read` PASSES. Absent — not null, not blank —
   * for SURVEYING. See the header.
   */
  readonly range?: string;
};

const CHANNEL_LABEL: Readonly<Record<string, string>> = Object.freeze({
  phone: 'Telephone — they asked for a call',
  sms_whatsapp: 'Text message or WhatsApp',
  email: 'Email',
});

/**
 * How they asked to be reached.
 *
 * THE BOOKING IS THE AUTHORITY, AND SINCE PHASE 113a IT IS THE ONLY SOURCE.
 * It is the record CB_BOOKING produces at the funnel close and it carries the
 * entry point and the variant as well as the channel.
 *
 * THERE USED TO BE A FALLBACK HERE, reading `businesses.preferred_contact` when
 * no booking existed. That column was ended by migration 004 — every value set
 * to NULL and two triggers refusing any new one — and REMOVED by migration 007,
 * so the fallback had been reading a guaranteed NULL for four days and reading
 * a column that no longer exists after that. It is gone with the column.
 *
 * WHAT REPLACES IT IS THE SENTENCE THAT WAS ALREADY THERE. "Nobody asked, or
 * they did not say" was the answer whenever the copy was NULL, which was always;
 * it is now simply the answer whenever there is no booking. NOTHING IS LOST —
 * N4 in miniature: an absent fact stays absent and does not acquire a default.
 */
export function contactFor(db: Db, business_id: string): ContactView {
  return contactOf(db.get<BookingChannelRow>(
    'SELECT channel, sms_variant, entry_point FROM bookings WHERE business_id = ? ' +
      'ORDER BY created_at ASC LIMIT 1',
    [business_id],
  ));
}

/**
 * THE SAME READING, FOR A LEAD WITH NO ORGANISATION YET — a call asked for at the
 * reasoned negative, whose booking belongs to the lead until the lead is linked
 * to an organisation (migration 011, disposition row E22). Same row, same words.
 */
export function contactForLead(db: Db, lead_id: string): ContactView {
  return contactOf(db.get<BookingChannelRow>(
    'SELECT channel, sms_variant, entry_point FROM bookings WHERE lead_id = ? ' +
      'ORDER BY created_at ASC LIMIT 1',
    [lead_id],
  ));
}

type BookingChannelRow = { channel: string; sms_variant: string | null; entry_point: string };

function contactOf(b: BookingChannelRow | undefined): ContactView {
  if (b === undefined) {
    return {
      channel: null, variant: null, entry_point: null, books_a_slot: false,
      label: 'Not recorded — nobody asked, or they did not say',
    };
  }
  return {
    channel: b.channel, variant: b.sms_variant,
    label: CHANNEL_LABEL[b.channel] ?? b.channel,
    entry_point: b.entry_point,
    books_a_slot: BOOKING.booksASlot(b.channel),
  };
}

type AssessmentRowSource = {
  id: string; business_id: string; business_name: string; sector: string;
  submitted_at: string; shown_low_pence: number | null; shown_high_pence: number | null;
};

function buildRow(db: Db, actor: Actor, a: AssessmentRowSource): AssessmentRow {
  const properties = db.all<PropertyView>(
    'SELECT label, postcode FROM properties WHERE business_id = ? ORDER BY created_at ASC, label ASC',
    [a.business_id],
  );
  // BUILT FORWARDS. `range` is added, never removed.
  const base = {
    id: a.id, business_id: a.business_id, business_name: a.business_name,
    sector: a.sector, submitted_at: a.submitted_at,
    properties, contact: contactFor(db, a.business_id),
  };
  const maySeeFigure = can(actor, 'estimate.read', {
    type: 'estimate', id: a.id, business_id: a.business_id,
  });
  if (!maySeeFigure) return base;
  const range: ShownRange = { low_pence: a.shown_low_pence, high_pence: a.shown_high_pence };
  return { ...base, range: formatShownRange(range) };
}

/**
 * Every assessment a prospective client has submitted, NEWEST FIRST.
 *
 * Authorised one row at a time. A list that authorised the ACTION and then
 * returned every row would be a role check, and this application does not have
 * one of those.
 */
export function filedAssessments(db: Db, actor: Actor, limit = 200): AssessmentRow[] {
  assertSection(actor, 'assessment.read');
  const rows = db.all<AssessmentRowSource>(
    'SELECT a.id, a.business_id, b.name AS business_name, a.sector, a.submitted_at, ' +
      'a.shown_low_pence, a.shown_high_pence ' +
      'FROM assessments a JOIN businesses b ON b.id = a.business_id ' +
      'ORDER BY a.submitted_at DESC, a.id DESC LIMIT ?',
    [limit],
  );
  const out: AssessmentRow[] = [];
  for (const a of rows) {
    if (!can(actor, 'assessment.read', { type: 'assessment', id: a.id, business_id: a.business_id })) {
      continue;
    }
    out.push(buildRow(db, actor, a));
  }
  return out;
}

export type AnswerView = {
  readonly ord: number;
  readonly question_id: string;
  readonly question_text: string;
  readonly state: 'ANSWERED' | 'DONT_KNOW' | 'SKIPPED';
  readonly value: string | null;
  /** What a person reads. NEVER an empty string, for any of the three states. */
  readonly label: string;
};

/**
 * The three states in words.
 *
 * The wording is chosen to be readable ALOUD, because the next thing a staff
 * member does with this screen is telephone the client — and "they were not
 * asked this" and "they told us they do not know" lead to two completely
 * different conversations, which a blank cell would collapse into one.
 */
export function answerLabel(state: string, value: string | null): string {
  if (state === 'DONT_KNOW') return 'I don’t know — the client said so';
  if (state === 'SKIPPED') return 'Not answered — this question was skipped';
  return value ?? 'Answered, but no value was recorded';
}

export type AssessmentDetail = AssessmentRow & {
  readonly answers: readonly AnswerView[];
  readonly answered: number;
  readonly dont_know: number;
  readonly skipped: number;
};

export function assessmentDetail(db: Db, actor: Actor, assessment_id: string): AssessmentDetail {
  const a = db.get<AssessmentRowSource>(
    'SELECT a.id, a.business_id, b.name AS business_name, a.sector, a.submitted_at, ' +
      'a.shown_low_pence, a.shown_high_pence ' +
      'FROM assessments a JOIN businesses b ON b.id = a.business_id WHERE a.id = ?',
    [assessment_id],
  );
  assertSection(actor, 'assessment.read');
  if (a === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'assessment.read', { type: 'assessment', id: a.id, business_id: a.business_id });

  const rows = db.all<{
    ord: number; question_id: string; question_text: string; state: string; value: string | null;
  }>(
    'SELECT ord, question_id, question_text, state, value FROM assessment_answers ' +
      'WHERE assessment_id = ? ORDER BY ord ASC',
    [a.id],
  );
  for (const r of rows) {
    authorise(actor, 'answer.read', { type: 'answer', id: `${a.id}:${r.ord}`, business_id: a.business_id });
  }
  const answers: AnswerView[] = rows.map((r) => ({
    ord: r.ord, question_id: r.question_id, question_text: r.question_text,
    state: r.state as AnswerView['state'], value: r.value,
    label: answerLabel(r.state, r.value),
  }));
  return {
    ...buildRow(db, actor, a),
    answers,
    answered: answers.filter((x) => x.state === 'ANSWERED').length,
    dont_know: answers.filter((x) => x.state === 'DONT_KNOW').length,
    skipped: answers.filter((x) => x.state === 'SKIPPED').length,
  };
}

/* ================================================================== *
 * SECTION 2 — THE CALENDAR
 * ================================================================== */

export type BookingRow = {
  readonly id: string;
  /** null only while the booking belongs to a lead with no organisation yet (migration 011). */
  readonly business_id: string | null;
  /** The lead a booking belongs to where there is no organisation; null for every other booking. */
  readonly lead_id: string | null;
  /** The organisation's name — or, for a lead's booking, the name the prospect gave, marked as such. */
  readonly business_name: string;
  readonly channel: string;
  readonly channel_label: string;
  readonly sms_variant: string | null;
  readonly entry_point: string;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly assigned_to: string | null;
  readonly assigned_name: string | null;
  readonly created_at: string;
  /** Phase 132e: when the call was cancelled, and by whom. Both null on a call still held. */
  readonly cancelled_at: string | null;
  readonly cancelled_by_name: string | null;
  /** The role of whoever cancelled — CLIENT for a portal cancellation. */
  readonly cancelled_by_role: string | null;
};

/*
 * LEFT JOINS, AND THAT IS PART OF THE GATED-EXIT REPAIR. This was an inner join
 * onto `businesses`, so a booking with no organisation — a call asked for at the
 * reasoned negative (migration 011) — would have been recorded and then vanished
 * from the calendar's queue, invisible to the people who have to make the call.
 */
const BOOKING_SELECT =
  'SELECT k.id, k.business_id, k.lead_id, COALESCE(b.name, l.prospect_organisation) AS business_name, k.channel, ' +
  'k.sms_variant, k.entry_point, k.starts_at, k.ends_at, k.assigned_to, u.display_name AS assigned_name, ' +
  'k.created_at, k.cancelled_at, cu.display_name AS cancelled_by_name, cu.role AS cancelled_by_role ' +
  'FROM bookings k LEFT JOIN businesses b ON b.id = k.business_id ' +
  'LEFT JOIN leads l ON l.id = k.lead_id LEFT JOIN users u ON u.id = k.assigned_to ' +
  'LEFT JOIN users cu ON cu.id = k.cancelled_by ';

type BookingSource = Omit<BookingRow, 'channel_label' | 'business_name'> & { readonly business_name: string | null };

function decorate(r: BookingSource): BookingRow {
  return {
    ...r,
    business_name: r.business_id !== null
      ? (r.business_name ?? 'no organisation recorded')
      : `${r.business_name ?? 'Unnamed business'} — a lead, no organisation yet`,
    channel_label: CHANNEL_LABEL[r.channel] ?? r.channel,
  };
}

export type CalendarView = {
  readonly view: 'day' | 'week';
  readonly from: string;
  readonly to: string;
  readonly days: readonly { readonly date: string; readonly bookings: readonly BookingRow[] }[];
  /** Calls that hold a moment inside the window. */
  readonly scheduled: readonly BookingRow[];
  /**
   * SOMEBODY ASKED FOR A CALL AND HAS NO TIME YET. This is the work queue and
   * it is not filtered by the window — a request from last week that nobody
   * scheduled does not stop being outstanding because the calendar has moved on.
   */
  readonly awaiting: readonly BookingRow[];
  /**
   * Requests through a channel that does not book a moment — email, text
   * message. CB_BOOKING: "captures and finishes". They are on this page because
   * they are the same queue of people waiting to hear from us, and they are
   * kept apart because a screen that mixed them would invite somebody to look
   * for a slot that was never asked for.
   */
  readonly capture_only: readonly BookingRow[];
  /**
   * Phase 132e. CALLS THAT WERE CANCELLED — by the client in the portal — newest
   * first, with who and when. Not filtered by the window, like the queue above:
   * a cancellation is something the person who owned the call needs to see. The
   * enquiry behind each one is still open; nothing here closes it.
   */
  readonly cancelled: readonly BookingRow[];
  /** From working times. THE ONE SOURCE. */
  readonly availability: Availability;
};

export function calendar(
  db: Db, actor: Actor,
  opts: { view: 'day' | 'week'; date: string; now: string; onlyUser?: string },
): CalendarView {
  assertSection(actor, 'booking.read');

  const from = opts.view === 'week' ? startOfLocalWeek(opts.date) : startOfLocalDay(opts.date);
  const to = addLocalDays(from, opts.view === 'week' ? 7 : 1);

  const scheduled = db
    .all<BookingSource>(
      BOOKING_SELECT + 'WHERE k.starts_at IS NOT NULL AND k.starts_at >= ? AND k.starts_at < ? ' +
        'ORDER BY k.starts_at ASC',
      [from, to],
    )
    .filter((r) => can(actor, 'booking.read', { type: 'booking', id: r.id, business_id: r.business_id }))
    .map(decorate);

  const noTime = db
    .all<BookingSource>(BOOKING_SELECT + 'WHERE k.starts_at IS NULL AND k.cancelled_at IS NULL ORDER BY k.created_at ASC')
    .filter((r) => can(actor, 'booking.read', { type: 'booking', id: r.id, business_id: r.business_id }))
    .map(decorate);

  const cancelled = db
    .all<BookingSource>(BOOKING_SELECT + 'WHERE k.cancelled_at IS NOT NULL ORDER BY k.cancelled_at DESC LIMIT 100')
    .filter((r) => can(actor, 'booking.read', { type: 'booking', id: r.id, business_id: r.business_id }))
    .map(decorate);

  const days: { date: string; bookings: BookingRow[] }[] = [];
  for (let i = 0; i < (opts.view === 'week' ? 7 : 1); i++) {
    const date = addLocalDays(from, i);
    const next = addLocalDays(from, i + 1);
    days.push({ date, bookings: scheduled.filter((b) => b.starts_at !== null && b.starts_at >= date && b.starts_at < next) });
  }

  return {
    view: opts.view, from, to, days, scheduled,
    awaiting: noTime.filter((b) => BOOKING.booksASlot(b.channel)),
    capture_only: noTime.filter((b) => !BOOKING.booksASlot(b.channel)),
    cancelled,
    availability: staffSlots(db, from, to, {
      now: opts.now,
      ...(opts.onlyUser === undefined ? {} : { onlyUser: opts.onlyUser }),
    }),
  };
}

export function bookingById(db: Db, actor: Actor, id: string): BookingRow {
  assertSection(actor, 'booking.read');
  const r = db.get<BookingSource>(BOOKING_SELECT + 'WHERE k.id = ?', [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  authorise(actor, 'booking.read', { type: 'booking', id: r.id, business_id: r.business_id });
  return decorate(r);
}

/**
 * Give a call a time, or move the one it has.
 *
 * THIS IS THE FUNCTION THE PHASE BRIEF ASKS TO BE PROVED: "A booking made in
 * the client's journey appears here without anybody re-entering it, and the
 * appointment the client sees in their own portal is this same record. Prove
 * it: move one, and show both views change."
 *
 * There is nothing here that creates a second record. The row was written by
 * the funnel close in src/web/router.ts; this UPDATEs it, `P.bookings` in
 * portal.ts SELECTs it, and there is no copy anywhere between them.
 *
 * THE SLOT IS RE-CHECKED HERE, NOT TRUSTED FROM THE FORM. `isBookable` asks the
 * working times again at the moment of writing. A picker is a courtesy; the
 * refusal is the control.
 */
export function scheduleBooking(
  d: { db: Db; audit: AuditLog; email: EmailTransport; now: () => string; newId: () => string },
  actor: Actor,
  args: { booking_id: string; starts_at: string; assigned_to?: string | null },
): { ok: true; booking: BookingRow } | { ok: false; why: string } {
  const before = bookingById(d.db, actor, args.booking_id);
  authorise(actor, 'booking.write', {
    type: 'booking', id: before.id, business_id: before.business_id,
  });

  // Phase 132e: a cancelled call is final on its row (migration 025) — say so rather than let the trigger throw.
  if (before.cancelled_at !== null) {
    return { ok: false, why: 'This call was cancelled, so it cannot be given a time. The enquiry is still open; arrange a new call with the client.' };
  }
  if (!BOOKING.booksASlot(before.channel)) {
    return {
      ok: false,
      why: `${before.channel_label} does not book a moment — CB_BOOKING says only the telephone does, ` +
           'and the database refuses a time on any other channel.',
    };
  }

  const check = isBookable(d.db, args.starts_at, {
    now: d.now(), ignoreBooking: before.id,
    ...(args.assigned_to === undefined || args.assigned_to === null || args.assigned_to === ''
      ? {} : { forUser: args.assigned_to }),
  });
  if (!check.ok) return { ok: false, why: check.why };

  // Unassigned means "whoever is free then", and the slot check has just told
  // us who that is. Recording it beats leaving a call nobody owns.
  const owner = args.assigned_to === undefined || args.assigned_to === null || args.assigned_to === ''
    ? check.user_id : args.assigned_to;
  const ends = new Date(Date.parse(args.starts_at) + SLOT_MINUTES * 60_000).toISOString();

  d.db.tx(() => {
    d.db.run('UPDATE bookings SET starts_at = ?, ends_at = ?, assigned_to = ? WHERE id = ?',
      [args.starts_at, ends, owner, before.id]);
    d.db.run(
      'INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, ' +
        'from_assigned, to_assigned, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [d.newId(), before.id, actor.id, before.starts_at, args.starts_at,
       before.assigned_to, owner, d.now()],
    );
  });

  // STUBBED, AND THE ROW SAYS SO. `sent_at` stays NULL and the screen labels it.
  // A lead's booking has no organisation to address: the address is the one the
  // prospect gave, on their own contact (migration 011).
  const business = before.business_id !== null
    ? d.db.get<{ contact_email: string | null; name: string }>(
      'SELECT contact_email, name FROM businesses WHERE id = ?', [before.business_id])
    : before.lead_id === null
      ? undefined
      : d.db.get<{ contact_email: string | null; name: string }>(
        'SELECT email AS contact_email, full_name AS name FROM contacts WHERE lead_id = ? ORDER BY created_at ASC, id ASC LIMIT 1',
        [before.lead_id]);
  // A SUBJECT LINE IS READ BY A PERSON. The stored value stays ISO-8601 UTC,
  // as everything in this schema does; this is a rendering of it, and printing
  // the raw stamp in something addressed to a client would be a small rudeness
  // with no reason behind it.
  // AND SINCE PHASE 113a IT IS UK TIME, NOT UTC. This message is addressed to
  // the client: an invitation reading "09:00 UTC" for a call at ten in the
  // morning is the exact defect that phase went looking for, and slicing the
  // ISO string was how it survived here after the screens were fixed.
  const readable = localWhen(args.starts_at);
  d.email.send({
    to_email: business?.contact_email ?? 'no-address-recorded@example.invalid',
    subject: `Your call with Cap Rebate — ${readable}`,
    body:
      `A telephone call has been ${before.starts_at === null ? 'arranged' : 'moved'} for ` +
      `${readable}, lasting ${SLOT_MINUTES} minutes.\n\n` +
      'NOT SENT. Outbound email and calendar invitations are stubbed in this build: this message ' +
      'and its invitation were written to the outbox table and nothing left the building.',
    kind: 'CALENDAR_INVITE',
    // CRM 1 of 10: named, so a DO_NOT_CONTACT organisation is refused by id
    // and not only by whichever address happened to be on the row.
    business_id: before.business_id,
  });

  d.audit.append({
    at: d.now(), kind: 'BOOKING_MOVED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'booking', object_id: before.id,
    detail: { field: 'starts_at', moved: before.starts_at !== null, by: 'STAFF' },
  });

  return { ok: true, booking: bookingById(d.db, actor, before.id) };
}

/** The change history for one booking — who moved it, when, and from what. */
export function bookingHistory(db: Db, actor: Actor, booking_id: string): readonly {
  from_starts_at: string | null; to_starts_at: string | null;
  changed_by_name: string | null; at: string; cancelled: number;
}[] {
  bookingById(db, actor, booking_id);
  return db.all<{
    from_starts_at: string | null; to_starts_at: string | null;
    changed_by_name: string | null; at: string; cancelled: number;
  }>(
    'SELECT c.from_starts_at, c.to_starts_at, u.display_name AS changed_by_name, c.at, c.cancelled ' +
      'FROM booking_changes c LEFT JOIN users u ON u.id = c.changed_by ' +
      'WHERE c.booking_id = ? ORDER BY c.at ASC',
    [booking_id],
  );
}

/**
 * Phase 132e: the assign control's list for a reader who may arrange calls, and an empty list for one who may only
 * read the calendar — the view-only login opens the calendar and is never shown the control, instead of being refused
 * the whole page because the control's list asks `booking.write`.
 */
export function assignableStaffIfPermitted(db: Db, actor: Actor): readonly { id: string; display_name: string }[] {
  return mayArrangeCalls(actor) ? assignableStaff(db, actor) : [];
}

/** Whether this reader may give a call a time or move it — asked of the table, so the screen draws the control only then. */
export function mayArrangeCalls(actor: Actor): boolean {
  return can(actor, 'booking.write', { type: 'booking', id: STAFF_SECTION, business_id: STAFF_SECTION });
}

/** Staff who could take a call, for the assign control. */
export function assignableStaff(db: Db, actor: Actor): readonly { id: string; display_name: string }[] {
  assertSection(actor, 'booking.write');
  return db.all<{ id: string; display_name: string }>(
    'SELECT DISTINCT u.id, u.display_name FROM users u JOIN working_times w ON w.user_id = u.id ' +
      'WHERE u.disabled_at IS NULL ORDER BY u.display_name ASC',
  );
}
