/**
 * WORKING TIMES AND BOOKABLE SLOTS — ONE SOURCE, NOT TWO.
 *
 * The phase brief is unusually blunt about this and it is the reason the phase
 * builds settings before the calendar: "Working times are not decoration — they
 * are the input to the booking system, so a slot outside a user's working hours
 * must not be offerable."
 *
 * SO THERE IS EXACTLY ONE FUNCTION THAT DECIDES WHETHER A MOMENT IS BOOKABLE,
 * AND EVERYTHING ASKS IT. The staff calendar asks it. The client's own
 * funnel-close picker asks it. A test asserts that a moment the staff calendar
 * will not accept is not one the public picker offers, by driving both — not by
 * reading two lists and comparing them, which is what a second source looks
 * like on the day it is written and for a fortnight afterwards.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FOUR DECISIONS, EACH OF WHICH COULD REASONABLY HAVE GONE THE OTHER WAY
 *
 * 1. THE PUBLIC PICKER SEES TIMES, NEVER PEOPLE. `publicSlots` returns moments
 *    and nothing else. A visitor who has given us no name learns that Tuesday
 *    at ten is free; they do not learn whose diary it is, how many staff there
 *    are, or who was away on Thursday. The staff view — `staffSlots` — carries
 *    the owner, because assigning is the whole job there.
 *
 * 2. NOBODY AVAILABLE IS AN ANSWER, NOT AN EMPTY LIST. Both functions return a
 *    REASON alongside the slots — see `Unavailable` for the four and for the
 *    one that was found by opening the screen rather than by reasoning about
 *    it. The brief: "If nobody is available, say so honestly rather than
 *    showing an empty grid." An empty array cannot tell those states apart, and
 *    a grid drawn from one reads as "we are closed" whichever it was.
 *
 * 3. WORKING TIMES ARE LOCAL HOURS. STORED TIMES ARE UTC INSTANTS. THE TWO ARE
 *    DIFFERENT KINDS OF THING AND THIS DECISION IS THE HEART OF THE FILE.
 *    (Phase 113a, 9 September 2026. Until then everything here was UTC and said
 *    so, which was honest and wrong for eight months of the year — see below.)
 *
 *    `bookings.starts_at` is an INSTANT: a specific moment that happened or
 *    will. It stays ISO-8601 UTC, it is compared as UTC, and nothing in this
 *    file converts it for any purpose other than deciding which local day and
 *    local minute it falls on.
 *
 *    `working_times` is NOT an instant and never was. It holds minutes from
 *    midnight against a weekday, with no date at all — and "09:00" has no
 *    single UTC answer across a year, because the same clock time is 09:00Z in
 *    January and 08:00Z in June. IT HAD TO MEAN ONE OR THE OTHER, AND IT MEANS
 *    LOCAL, for the plain reason that a person's hours are local hours: staff
 *    who say they work nine to five mean nine to five in March and in July, and
 *    a system storing UTC minutes would silently move everybody's day by an
 *    hour twice a year and make them re-enter it.
 *
 *    SO THE CONVERSION HAPPENS WHERE SLOTS ARE GENERATED, once per candidate
 *    day: `slotsBetween` walks LOCAL days, and for each local wall-clock minute
 *    a working period covers it asks `instantsForLocalMinute` which UTC instant
 *    or instants that is. `isBookable` is the mirror — it takes a UTC instant
 *    and asks which local weekday and local minute it lands on.
 *
 *    THAT IS NOT DISPLAY LEAKING INTO LOGIC, AND THE DIFFERENCE MATTERS. No
 *    comparison here is made in local time, nothing is stored in local time,
 *    and no local string reaches a caller: every value that goes in or comes
 *    out of this file is still a UTC instant. What is local is the MEANING OF
 *    THE RULE — a weekly pattern of human working hours — and a rule expressed
 *    in local hours can only be applied by converting it per day.
 *
 *    TWICE A YEAR THIS IS VISIBLE, AND BOTH CASES ARE HANDLED RATHER THAN
 *    ROUNDED AWAY. On the March morning the clocks go forward, local 01:00 to
 *    01:59 does not exist and no slot is offered in it. On the October morning
 *    they go back, local 01:00 to 01:59 happens twice and both are offerable,
 *    because they are two different real moments. `instantsForLocalMinute` in
 *    localtime.ts returns zero, one or two instants for exactly this reason.
 *
 *    NOTHING HERE KNOWS THAT BRITAIN IS EVER AN HOUR AHEAD. Every offset comes
 *    from `Intl` at the instant in question. A hard-coded `+1` is wrong for
 *    four months, a hard-coded `0` for eight, and both are wrong on the two
 *    days that matter most.
 *
 * 4. A SLOT IS TAKEN BY ANY BOOKING THAT OVERLAPS IT, not merely one that
 *    starts at the same minute. Two thirty-minute calls cannot share a
 *    quarter-hour, and a comparison on start times alone would let them.
 */

import type { Db } from '../db.ts';
import { can } from '../authz.ts';
import { isAppRole } from '../roles.ts';
import {
  addLocalDaysMs, instantsForLocalMinute, localPartsOf, startOfLocalDayMs,
} from './localtime.ts';

/**
 * ONE LIST OF WEEKDAY NAMES, RE-EXPORTED RATHER THAN COPIED.
 *
 * It lives in localtime.ts because that is where a local weekday is DERIVED;
 * it is re-exported here because this is the file that names the unit
 * `working_times.weekday` is in, and every caller already imports it from here.
 * A second copy would be one edit away from disagreeing with the first.
 */
export { WEEKDAY_NAMES } from './localtime.ts';
import { WEEKDAY_NAMES } from './localtime.ts';

/**
 * WHOSE DIARY CAN HOLD A CLIENT CALL — and it is asked of the rule table
 * rather than answered here.
 *
 * SETTING WORKING TIMES AND BEING BOOKABLE ARE NOT THE SAME PERMISSION.
 * `working_time.write` is offered to every staff role, because everybody has
 * hours; `booking.write` is ADMIN and SALES, because they are the two roles
 * that own a client call. Until this was separated, an unassigned booking was
 * auto-assigned to whoever's hours happened to cover the slot — and on the
 * seeded data that was the FINANCE user, which is visibly wrong and was visible
 * the first time the calendar was opened.
 *
 * It is `can()` and not a list of role names, so the day somebody joins or
 * leaves `booking.write` the diary follows without anybody remembering to
 * change a second place.
 */
function bookableUserIds(db: Db): Set<string> {
  const out = new Set<string>();
  for (const u of db.all<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE disabled_at IS NULL',
  )) {
    if (!isAppRole(u.role)) continue;
    const mayOwnACall = can(
      { id: u.id, role: u.role, business_id: null, disabled: false },
      'booking.write',
      { type: 'booking', id: 'diary', business_id: 'diary' },
    );
    if (mayOwnACall) out.add(u.id);
  }
  return out;
}

/** How long a booked call is. One number, quoted by every screen that shows one.
 * 30 September 2026, Lakhbir: "make the call times 1 hour for both virtual and telephone". It was 30. Calls start on the hour. */
export const SLOT_MINUTES = 60;

/** How far ahead the pickers look. A fortnight is long enough to find a time. */
export const HORIZON_DAYS = 14;

/**
 * HOW SOON A NEW TIME CHOSEN BY A CLIENT MAY BE — two hours. Phase 113a,
 * NARROWED BY PHASE 132e ON 16 SEPTEMBER 2026.
 *
 * WHAT CHANGED, AND WHY. Lakhbir, answering "How late may a client move their
 * own call, and may they cancel it outright?": "Give the client full control to
 * cancel at any time, and rebook at a time that suits them". So a call the
 * client ALREADY HOLDS may now be moved, released or cancelled at any time,
 * however close it is — the half of the rule below that refused "a call that is
 * inside the window" no longer applies. THE OTHER HALF STAYS: a NEW time the
 * client picks must be at least this far away, so whoever is calling knows about
 * it. The reasoning below was written for both halves and is kept as the record
 * of the decision it replaced.
 *
 * A DECISION, NOT A DEFAULT, and it is here rather than in the portal because
 * it is a fact about how this business books calls and the screen has to quote
 * it. The reasoning, so that changing it is a decision too:
 *
 *   A CALL IS AN APPOINTMENT WITH A PERSON, and that person's morning was
 *   arranged around it. Inside a couple of hours they may be travelling to a
 *   quiet room, have the file open, or already be dialling. A change that
 *   arrives at that point is not a rescheduling; it is one party turning up.
 *
 *   TWO HOURS IS SHORT ENOUGH TO BE FAIR. It is not a working day's notice —
 *   somebody who realises at nine that eleven o'clock will not work can still
 *   move it themselves, which is the case the portal exists for. What it
 *   refuses is the ten-minutes-before change, and it refuses it with a sentence
 *   naming the telephone rather than a silent absence of a button.
 *
 *   IT APPLIES TO BOTH ENDS. A client may not move a call that is inside the
 *   window, AND may not move one INTO the window — otherwise the rule buys
 *   nobody any notice at all, it just moves which call is imminent.
 *
 * THE STAFF PATH IS NOT SUBJECT TO IT. A member of staff moving a call to
 * twenty minutes' time is doing it while talking to the client, which is the
 * one circumstance in which it is the right thing to do.
 */
export const CLIENT_MOVE_NOTICE_MINUTES = 120;

export type WorkingTime = {
  readonly id: string;
  readonly user_id: string;
  /** 0 = Sunday. The LOCAL weekday — see decision 3 at the top of this file. */
  readonly weekday: number;
  /** Minutes from LOCAL midnight, not from 00:00Z. */
  readonly start_min: number;
  readonly end_min: number;
};

/**
 * Minutes from local midnight to "09:30", and back.
 *
 * PURE ARITHMETIC ON A NUMBER OF MINUTES, and it stays that way. It is not a
 * timezone conversion and must never become one: the value it is given is
 * already local (see decision 3), so converting it here would apply the offset
 * twice. Everything that formats an INSTANT goes through localtime.ts instead.
 */
export function minutesToClock(m: number): string {
  const h = Math.floor(m / 60), min = m % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "09:30" -> 570. Returns null for anything that is not a time, never 0. */
export function clockToMinutes(v: string): number | null {
  const m = /^([0-9]{1,2}):([0-9]{2})$/.exec(v.trim());
  if (m === null) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null;
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  const total = h * 60 + min;
  return total > 1440 ? null : total;
}

/* ------------------------------------------------------------------ *
 * READING AND WRITING WORKING TIMES
 *
 * No authorisation here. These are the store; `can()` is asked by the caller,
 * on the specific working_time object, before any of them is reached. Putting
 * a role check in a data function is how a second authorisation layer starts.
 * ------------------------------------------------------------------ */

export function workingTimesFor(db: Db, user_id: string): WorkingTime[] {
  return db.all<WorkingTime>(
    'SELECT id, user_id, weekday, start_min, end_min FROM working_times WHERE user_id = ? ' +
      'ORDER BY weekday ASC, start_min ASC',
    [user_id],
  );
}

export function allWorkingTimes(db: Db): WorkingTime[] {
  return db.all<WorkingTime>(
    'SELECT id, user_id, weekday, start_min, end_min FROM working_times ' +
      'ORDER BY user_id ASC, weekday ASC, start_min ASC',
  );
}

export type WorkingTimeInput = { weekday: number; start_min: number; end_min: number };

export class WorkingTimeError extends Error {
  readonly code = 'E_WORKING_TIME';
}

/**
 * Replace one user's whole week.
 *
 * WHOLE-WEEK REPLACEMENT RATHER THAN ROW EDITING, because the thing a person is
 * actually doing is "these are my hours" — and a partial write leaves a diary
 * that is neither the old one nor the new one if the second statement fails.
 * It runs in one transaction for the same reason.
 *
 * VALIDATED SERVER-SIDE, ALWAYS. The table's CHECK constraints catch the range
 * errors; this catches the ones a CHECK cannot see — a day whose periods
 * overlap each other, which would make one afternoon bookable twice.
 */
export function replaceWorkingTimes(
  db: Db, newId: () => string, user_id: string, rows: readonly WorkingTimeInput[],
): void {
  for (const r of rows) {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6) {
      throw new WorkingTimeError('that is not a day of the week');
    }
    if (!Number.isInteger(r.start_min) || !Number.isInteger(r.end_min)) {
      throw new WorkingTimeError('a working period needs a start and an end');
    }
    if (r.start_min < 0 || r.end_min > 1440 || r.end_min <= r.start_min) {
      throw new WorkingTimeError(
        `${WEEKDAY_NAMES[r.weekday] ?? 'that day'} finishes before it starts`,
      );
    }
  }
  const byDay = new Map<number, WorkingTimeInput[]>();
  for (const r of rows) {
    const list = byDay.get(r.weekday) ?? [];
    list.push(r);
    byDay.set(r.weekday, list);
  }
  for (const [day, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.start_min - b.start_min);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1], cur = sorted[i];
      if (prev !== undefined && cur !== undefined && cur.start_min < prev.end_min) {
        throw new WorkingTimeError(
          `two working periods overlap on ${WEEKDAY_NAMES[day] ?? 'that day'}`,
        );
      }
    }
  }

  db.tx(() => {
    db.run('DELETE FROM working_times WHERE user_id = ?', [user_id]);
    for (const r of rows) {
      db.run(
        'INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)',
        [newId(), user_id, r.weekday, r.start_min, r.end_min],
      );
    }
  });
}

/* ------------------------------------------------------------------ *
 * SLOTS
 * ------------------------------------------------------------------ */

export type Slot = {
  /** ISO-8601 UTC, the start of the slot. */
  readonly starts_at: string;
  readonly ends_at: string;
  /** Who is free at that moment. NEVER returned to the public picker. */
  readonly user_id: string;
};

/**
 * WHY there is nothing to offer.
 *
 * FOUR STATES, AND THE FOURTH WAS FOUND BY LOOKING AT THE SCREEN. There were
 * three until the calendar was opened on a real afternoon: it said "every slot
 * in this window is already taken" for a day whose working hours had simply
 * ENDED. Nothing was booked at all. That is not a wording problem — a member of
 * staff reading it would go looking for the bookings that filled their day and
 * find none, and the phase brief asks for honesty here in terms.
 *
 * WINDOW_PASSED is therefore distinguished from FULLY_BOOKED by asking the
 * question twice: once with the "not in the past" floor and once without. If
 * dropping the floor produces slots, the day is over. If it does not, they are
 * genuinely taken.
 */
export type Unavailable =
  'NO_WORKING_TIMES' | 'FULLY_BOOKED' | 'NO_STAFF' | 'WINDOW_PASSED';

export type Availability =
  | { readonly available: true; readonly slots: readonly Slot[] }
  | {
      readonly available: false;
      readonly reason: Unavailable;
      readonly say: string;
    };

/* ------------------------------------------------------------------ *
 * LOCAL DAYS.
 *
 * THE THREE FUNCTIONS BELOW WERE RENAMED IN PHASE 113a AND THE RENAME IS THE
 * POINT. They were `startOfDay`, `startOfWeek` and `addDays`, and they worked
 * in UTC midnights — which reads as harmless right up until you notice that in
 * June a "day" beginning at 00:00Z begins at one o'clock in the morning, so a
 * calendar drawn from one puts the first hour of every summer day in the
 * previous column and a fortnight's horizon starts on the wrong date.
 *
 * A DAY IS A LOCAL DAY. That is what a person means by Tuesday, what
 * `?date=2026-09-10` in a query string means, and what the working-times
 * weekday is counted in. Each returns an ISO-8601 UTC INSTANT as before —
 * the storage is unchanged, only the arithmetic is local.
 * ------------------------------------------------------------------ */

/** The instant at which the LOCAL day containing `iso` begins. */
export function startOfLocalDay(iso: string): string {
  return new Date(startOfLocalDayMs(Date.parse(iso))).toISOString();
}

/** Monday-first, because a working week is drawn Monday to Sunday. */
export function startOfLocalWeek(iso: string): string {
  const dayStart = startOfLocalDayMs(Date.parse(iso));
  const shift = (localPartsOf(dayStart).weekday + 6) % 7;
  return new Date(addLocalDaysMs(dayStart, -shift)).toISOString();
}

/** `n` LOCAL days later — 23, 24 or 25 hours, whichever that day really is. */
export function addLocalDays(iso: string, n: number): string {
  return new Date(addLocalDaysMs(Date.parse(iso), n)).toISOString();
}

type BookedSpan = { user_id: string | null; from: number; to: number };

function bookedSpans(db: Db, fromIso: string, toIso: string): BookedSpan[] {
  return db
    .all<{ assigned_to: string | null; starts_at: string; ends_at: string }>(
      // Phase 132e: A CANCELLED CALL HOLDS NO SLOT. Its row survives with its time, for the record.
      'SELECT assigned_to, starts_at, ends_at FROM bookings ' +
        'WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL AND cancelled_at IS NULL AND starts_at < ? AND ends_at > ?',
      [toIso, fromIso],
    )
    .map((r) => ({ user_id: r.assigned_to, from: Date.parse(r.starts_at), to: Date.parse(r.ends_at) }))
    // 1 Oct 2026: time a person blocked off holds their diary exactly as a call does (migration 066).
    .concat(db.all<{ user_id: string; starts_at: string; ends_at: string }>(
      'SELECT user_id, starts_at, ends_at FROM time_blocks WHERE removed_at IS NULL AND starts_at < ? AND ends_at > ?', [toIso, fromIso])
      .map((b) => ({ user_id: b.user_id, from: Date.parse(b.starts_at), to: Date.parse(b.ends_at) })));
}

/**
 * THE ONE FUNCTION. Everything that offers a time calls this.
 *
 * `from` is inclusive, `to` exclusive, both ISO-8601 UTC. `onlyUser` narrows it
 * to one diary, which is what the day view uses when a staff member is filtering
 * to their own. A slot is produced only where a working period covers the WHOLE
 * of it — a period ending at 17:00 does not offer a 16:45 slot, because half of
 * that call would be outside the hours somebody set.
 *
 * AN UNASSIGNED BOOKING BLOCKS EVERY DIARY. That is deliberate. A call that has
 * a time but no owner is a commitment somebody has to keep, and treating it as
 * blocking nobody is how it gets double-booked by the person who eventually
 * takes it.
 */
export function slotsBetween(
  db: Db, fromIso: string, toIso: string, opts: { onlyUser?: string; now?: string } = {},
): Availability {
  const times = opts.onlyUser === undefined
    ? allWorkingTimes(db)
    : workingTimesFor(db, opts.onlyUser);

  if (times.length === 0) {
    // "NOBODY SET ANY HOURS" and "THERE IS NOBODY TO SET THEM" are different
    // problems with different fixes, and the count that separates them is of
    // people who could own a call — not of staff in general.
    return bookableUserIds(db).size === 0
      ? {
          available: false, reason: 'NO_STAFF',
          say: 'There is nobody set up to take a call yet.',
        }
      : {
          available: false, reason: 'NO_WORKING_TIMES',
          say: 'Nobody has set their working times, so there are no times to offer. ' +
               'Working times are set in Settings, and the calendar has no other source for them.',
        };
  }

  /* A DISABLED USER'S DIARY IS NOT OFFERABLE — their sessions end at once and
     so should their slots; a booking made into the hours of somebody who has
     left is a call nobody is going to make. AND NEITHER IS THE DIARY OF
     SOMEBODY WHO CANNOT OWN A CALL: see `bookableUserIds`. */
  const active = bookableUserIds(db);

  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const floor = opts.now === undefined ? from : Math.max(from, Date.parse(opts.now));
  const spans = bookedSpans(db, fromIso, toIso);
  const slots: Slot[] = [];

  /* WALK LOCAL DAYS, NOT 86,400,000-MILLISECOND STEPS.
     The weekday a working period is set against is the LOCAL weekday, and the
     minutes are minutes from LOCAL midnight, so the only correct way to turn a
     week's pattern into moments is to take each local day in turn and ask what
     instant each of its wall-clock minutes actually is. Stepping by a fixed day
     length would drift by an hour across a transition and start asking about
     the wrong weekday.
     A stop guard is kept as well as the `< to` test: `addLocalDaysMs` always
     advances, but a loop that walks a fortnight of a foreign calendar should
     not be able to spin if that ever stops being true. */
  for (
    let day = startOfLocalDayMs(from), guard = 0;
    day < to && guard < 400;
    day = addLocalDaysMs(day, 1), guard++
  ) {
    const dayParts = localPartsOf(day);
    for (const w of times) {
      if (w.weekday !== dayParts.weekday) continue;
      if (!active.has(w.user_id)) continue;
      for (let m = w.start_min; m + SLOT_MINUTES <= w.end_min; m += SLOT_MINUTES) {
        // ZERO INSTANTS IN THE SPRING GAP, TWO IN THE AUTUMN OVERLAP, ONE THE
        // rest of the year. See instantsForLocalMinute.
        for (const s of instantsForLocalMinute(dayParts.year, dayParts.month, dayParts.day, m)) {
          const e = s + SLOT_MINUTES * 60_000;
          if (s < floor || s >= to || s < from) continue;
          const taken = spans.some(
            (b) => (b.user_id === null || b.user_id === w.user_id) && b.from < e && b.to > s,
          );
          if (taken) continue;
          slots.push({
            starts_at: new Date(s).toISOString(),
            ends_at: new Date(e).toISOString(),
            user_id: w.user_id,
          });
        }
      }
    }
  }

  if (slots.length === 0) {
    // ASK AGAIN WITHOUT THE "not in the past" FLOOR. If the hours existed and
    // have simply gone by, that is what to say — see `Unavailable`.
    if (opts.now !== undefined && floor > from) {
      const ignoringNow = slotsBetween(db, fromIso, toIso,
        opts.onlyUser === undefined ? {} : { onlyUser: opts.onlyUser });
      if (ignoringNow.available) {
        return {
          available: false, reason: 'WINDOW_PASSED',
          say: 'The working hours in this window have already passed. Nothing is booked in them — ' +
               'they are simply behind us. Look at a later day.',
        };
      }
    }
    return {
      available: false, reason: 'FULLY_BOOKED',
      say: 'There are working times set, but every slot in this window is already taken.',
    };
  }
  slots.sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0));
  return { available: true, slots };
}

/**
 * The staff view of availability: moments AND whose they are.
 */
export function staffSlots(
  db: Db, fromIso: string, toIso: string, opts: { onlyUser?: string; now?: string } = {},
): Availability {
  return slotsBetween(db, fromIso, toIso, opts);
}

/**
 * The public view: THE SAME SLOTS, WITH THE PEOPLE TAKEN OUT.
 *
 * One moment per start time — a visitor is choosing a time, not a colleague,
 * and offering the same eleven o'clock four times because four people are free
 * tells them something about our staffing they did not ask for.
 */
export function publicSlots(
  db: Db, nowIso: string, days = HORIZON_DAYS,
): { available: true; slots: readonly { starts_at: string; ends_at: string }[] }
  | { available: false; reason: Unavailable; say: string } {
  const from = nowIso;
  const to = addLocalDays(startOfLocalDay(nowIso), days);
  const r = slotsBetween(db, from, to, { now: nowIso });
  if (!r.available) {
    // The public message never explains our internal state. "Nobody has set
    // their working times" is a staff sentence; a visitor gets the same honest
    // outcome without the reason.
    return {
      available: false, reason: r.reason,
      say: 'We have no times to offer at the moment. Leave your details and we will ' +
           'come back to you with one.',
    };
  }
  const seen = new Set<string>();
  const slots: { starts_at: string; ends_at: string }[] = [];
  for (const s of r.slots) {
    if (seen.has(s.starts_at)) continue;
    seen.add(s.starts_at);
    slots.push({ starts_at: s.starts_at, ends_at: s.ends_at });
  }
  return { available: true, slots };
}

/**
 * ONE ENTRY PER MOMENT, however many diaries are free at it.
 *
 * `slotsBetween` returns a slot PER PERSON, which is what the assign control
 * needs. A picker does not: a screen offering "10:00" three times because three
 * people are free is a screen that looks broken, and it was — the staff booking
 * page showed 09:30 and 10:00 twice each the first time it was opened with two
 * diaries in the seed. `publicSlots` already collapsed them for the visitor's
 * picker; this is the same collapse, exported, so the staff picker cannot drift
 * from it. `how_many` is kept because "only one person is free then" is worth
 * knowing when you are about to move somebody's day around.
 */
export function distinctMoments(
  slots: readonly Slot[],
): readonly { starts_at: string; ends_at: string; how_many: number }[] {
  const by = new Map<string, { starts_at: string; ends_at: string; how_many: number }>();
  for (const s of slots) {
    const seen = by.get(s.starts_at);
    if (seen === undefined) by.set(s.starts_at, { starts_at: s.starts_at, ends_at: s.ends_at, how_many: 1 });
    else seen.how_many += 1;
  }
  return [...by.values()].sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
}

/**
 * IS THIS EXACT MOMENT BOOKABLE? Asked before any write, by both applications.
 *
 * THIS IS THE CONTROL, AND THE PICKERS ARE THE COURTESY. A list of slots on a
 * screen is a suggestion the client's browser was given a moment ago; by the
 * time the form comes back somebody else may have taken it, and a caller who
 * never loaded the page can post whatever they like. So the write path asks
 * again, here, against the same working times — which is what makes "a slot
 * outside a user's working hours must not be offerable" true of the STORE and
 * not only of the render.
 */
export function isBookable(
  db: Db, startsAt: string, opts: { forUser?: string; now?: string; ignoreBooking?: string } = {},
): { ok: true; user_id: string } | { ok: false; why: string } {
  const t = Date.parse(startsAt);
  if (!Number.isFinite(t)) return { ok: false, why: 'that is not a time' };
  /* THE MARK IS CHECKED IN UTC AND THAT IS SAFE HERE, but it is safe for a
     reason worth writing down rather than by luck: Britain's two offsets are
     whole hours, so a local half-hour mark is a UTC half-hour mark. In a zone
     whose offset is not a whole number of hours — parts of India, Nepal, South
     Australia — it would not be, and this test would have to be made against
     `localPartsOf(t).minuteOfDay` instead. That is the one line to change if
     DISPLAY_ZONE ever moves. */
  if (t % (SLOT_MINUTES * 60_000) !== 0) {
    return { ok: false, why: `calls start on the ${SLOT_MINUTES}-minute mark` };
  }
  if (opts.now !== undefined && t < Date.parse(opts.now)) {
    return { ok: false, why: 'that time is in the past' };
  }
  const end = new Date(t + SLOT_MINUTES * 60_000).toISOString();
  const start = new Date(t).toISOString();

  const times = opts.forUser === undefined ? allWorkingTimes(db) : workingTimesFor(db, opts.forUser);
  /* THE MIRROR OF THE SLOT LOOP. That walks local days and asks which instants
     they are; this takes an instant and asks which local day and local minute
     it lands on. Both consult the same working periods in the same units, so a
     moment the picker offered is a moment this accepts, and a moment it did not
     is refused — which is what makes the picker a courtesy and this the control.
     ON THE OCTOBER MORNING two different instants both land on local 01:30 and
     both are accepted if a period covers it. That is correct: they are two real
     moments in a twenty-five-hour day, and the overlap test below is what stops
     the same diary holding both. */
  const at = localPartsOf(t);
  const covering = times.filter(
    (w) => w.weekday === at.weekday
      && at.minuteOfDay >= w.start_min && at.minuteOfDay + SLOT_MINUTES <= w.end_min,
  );
  if (covering.length === 0) {
    return { ok: false, why: 'that time is outside the working hours anybody has set' };
  }
  const active = bookableUserIds(db);
  const spans = db
    .all<{ id: string; assigned_to: string | null; starts_at: string; ends_at: string }>(
      'SELECT id, assigned_to, starts_at, ends_at FROM bookings ' +
        'WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL AND cancelled_at IS NULL AND starts_at < ? AND ends_at > ?',
      [end, start],
    )
    .filter((b) => b.id !== opts.ignoreBooking)
    // 1 Oct 2026: a person's blocked-off time is taken, as a call is (migration 066).
    .concat(db.all<{ id: string; assigned_to: string; starts_at: string; ends_at: string }>(
      'SELECT id, user_id AS assigned_to, starts_at, ends_at FROM time_blocks WHERE removed_at IS NULL AND starts_at < ? AND ends_at > ?', [end, start]));

  for (const w of covering) {
    if (!active.has(w.user_id)) continue;
    const clash = spans.some((b) => b.assigned_to === null || b.assigned_to === w.user_id);
    if (!clash) return { ok: true, user_id: w.user_id };
  }
  return { ok: false, why: 'that time has been taken' };
}
