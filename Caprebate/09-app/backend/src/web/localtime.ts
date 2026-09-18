/**
 * LOCAL TIME — THE ONLY PLACE IN THIS APPLICATION THAT KNOWS ABOUT A TIMEZONE.
 *
 * Phase 113a, 9 September 2026. Until this file existed every screen printed
 * UTC and said so, which was honest and wrong for eight months of the year:
 * a member of staff who set "09:00 to 17:00" in June was setting 10:00 to 18:00
 * as anybody in Britain would read it, and a client offered "Wednesday at
 * 09:00" would have arrived at ten.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE RULE, AND IT IS THE WHOLE DESIGN
 *
 * STORAGE AND COMPARISON STAY IN UTC. Every `starts_at`, `created_at`,
 * `submitted_at` and audit `at` is ISO-8601 UTC and stays that way — they sort,
 * they survive a Postgres port, and they cannot be confused about seconds and
 * milliseconds. Nothing in this file writes to the database and nothing that
 * compares two moments consults it.
 *
 * CONVERSION HAPPENS AT THE EDGES, AND THERE ARE EXACTLY TWO OF THEM:
 *
 *   THE DISPLAY EDGE — a stored instant becomes words a person reads.
 *   `localStamp`, `localWhen`, `localClock`, `localDate`. Everything a screen
 *   prints goes through one of these; nothing formats a time by hand.
 *
 *   THE INPUT EDGE — something a person typed or a day they named becomes an
 *   instant. `instantsForLocalMinute` and `startOfLocalDay` in schedule.ts.
 *   A date in a query string ("?date=2026-09-10") is a LOCAL day, because that
 *   is what the person clicking "next" meant.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHY Intl AND NOT AN OFFSET CONSTANT
 *
 * Node carries the full IANA timezone database. A hard-coded `+1` is wrong for
 * four months of the year, a hard-coded `0` is wrong for eight, and a constant
 * that somebody remembers to change twice a year is wrong on the two days it
 * matters most. NOTHING BELOW KNOWS THAT BRITAIN IS EVER ONE HOUR AHEAD — the
 * offset is asked of `Intl` at the instant in question, every time, and the
 * abbreviation printed on screen ("BST" or "GMT") is asked of it too rather
 * than chosen by an `if`.
 *
 * Two tests in test/staff.test.ts pick real dates either side of the 2026
 * transitions — 29 March and 25 October — and would fail on any fixed offset in
 * either direction. One of them asserts a difference of exactly one hour
 * between the same clock time in June and in January, which no constant can
 * satisfy.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ONE ZONE, NAMED ONCE
 *
 * The business is a UK one, its staff are in Britain and its clients own
 * British property, so there is one zone and it is a constant rather than a
 * per-user setting. If that ever stops being true, this constant is the thing
 * to replace with a lookup, and it is the ONLY thing: no other file names a
 * zone, and none of the functions below reads the host machine's own timezone
 * — a server in Frankfurt must render the same page as a server in Leeds.
 */

/** The one zone. See "ONE ZONE, NAMED ONCE" above before changing it. */
export const DISPLAY_ZONE = 'Europe/London';

/** Days of the week, indexed as `Date#getUTCDay` and as `working_times.weekday`. */
export const WEEKDAY_NAMES = Object.freeze([
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]);

const WEEKDAY_INDEX: Readonly<Record<string, number>> = Object.freeze({
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
});

/**
 * One formatter, built once. `Intl.DateTimeFormat` construction is the
 * expensive part and slot generation calls this thousands of times across a
 * fortnight's grid.
 */
const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_ZONE,
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  weekday: 'short', timeZoneName: 'short',
});

export type LocalParts = {
  /** Local calendar year, month (1-12) and day. */
  readonly year: number;
  readonly month: number;
  readonly day: number;
  /** 0 = Sunday, matching `working_times.weekday`. */
  readonly weekday: number;
  readonly hour: number;
  readonly minute: number;
  /** Minutes from LOCAL midnight. This is the unit `working_times` holds. */
  readonly minuteOfDay: number;
  /** What Intl calls the zone at this instant: "GMT" or "BST". Never guessed. */
  readonly abbrev: string;
};

/** Break an instant into its local calendar parts. The one primitive. */
export function localPartsOf(ms: number): LocalParts {
  const out: Record<string, string> = {};
  for (const p of PARTS.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  const hour = Number(out['hour'] ?? '0');
  const minute = Number(out['minute'] ?? '0');
  return {
    year: Number(out['year'] ?? '0'),
    month: Number(out['month'] ?? '1'),
    day: Number(out['day'] ?? '1'),
    // `hour12: false` renders midnight as 24 in some ICU versions. Normalise it
    // rather than trusting one build's behaviour.
    weekday: WEEKDAY_INDEX[out['weekday'] ?? ''] ?? 0,
    hour: hour === 24 ? 0 : hour,
    minute,
    minuteOfDay: (hour === 24 ? 0 : hour) * 60 + minute,
    abbrev: out['timeZoneName'] ?? '',
  };
}

/**
 * The zone's offset from UTC at that instant, in minutes east (Britain: 0 or
 * 60). ASKED, NEVER ASSUMED — this is the function every other one is built on
 * and it is the reason nothing here can be wrong twice a year.
 */
export function offsetMinutesAt(ms: number): number {
  const p = localPartsOf(ms);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
  // The instant, rounded to the minute, is what we compare against — seconds
  // and milliseconds are the same in every zone Britain has ever used.
  const rounded = Math.floor(ms / 60_000) * 60_000;
  return (asIfUtc - rounded) / 60_000;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * THE REVERSE MAPPING, AND IT IS THE HARD ONE: a local wall-clock time on a
 * local calendar day becomes the UTC instant or instants that ARE it.
 *
 * "OR INSTANTS" IS NOT PEDANTRY — IT IS THE WHOLE REASON THIS RETURNS AN ARRAY.
 * A local wall clock is not a function of time; twice a year it is not even
 * injective.
 *
 *   THE SPRING GAP. On 29 March 2026 the clocks go from 00:59 GMT to 02:00 BST.
 *   Local 01:30 DOES NOT EXIST that day. This returns an empty array, and the
 *   caller offers no slot — which is right: nobody can take a call at a time
 *   that does not happen. A naive `Date.UTC(...) - offset` would silently
 *   invent one, an hour away from where it was asked for.
 *
 *   THE AUTUMN OVERLAP. On 25 October 2026 local 01:30 happens TWICE, once at
 *   00:30Z in BST and again at 01:30Z in GMT. This returns both, earliest
 *   first. They are two genuinely different moments in a twenty-five-hour day
 *   and a booking system that collapsed them would lose one hour of real
 *   capacity every year.
 *
 * HOW IT WORKS, AND WHY THIS SHAPE RATHER THAN ARITHMETIC. Every candidate
 * offset in the region of the day is tried, and a candidate is KEPT ONLY IF IT
 * ROUND-TRIPS — that is, only if the instant it produces really does render as
 * the local time we were asked for. That test is what makes the gap return
 * nothing and the overlap return two, without this file containing the words
 * "British Summer Time", a rule about last Sundays, or the number 60.
 */
export function instantsForLocalMinute(
  year: number, month: number, day: number, minuteOfDay: number,
): number[] {
  const wall = Date.UTC(year, month - 1, day) + minuteOfDay * 60_000;
  // Probe a day either side: a transition anywhere near this wall time is then
  // certain to be among the offsets tried, whatever its size or direction.
  const candidates = new Set<number>([
    offsetMinutesAt(wall - DAY_MS),
    offsetMinutesAt(wall),
    offsetMinutesAt(wall + DAY_MS),
  ]);
  const found = new Set<number>();
  for (const off of candidates) {
    const t = wall - off * 60_000;
    if (offsetMinutesAt(t) === off) found.add(t);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * The instant at which the LOCAL day containing `ms` begins.
 *
 * Local midnight, not 00:00Z. On 10 September 2026 that is 2026-09-09T23:00:00Z
 * because Britain is an hour ahead, and a calendar drawn from UTC midnight puts
 * the first hour of every summer day in the wrong column.
 *
 * On the spring-forward day midnight exists as normal (the gap is at 01:00), so
 * the `[0]` below is safe; the `?? ms` is there because a zone that ever
 * abolished its own midnight would otherwise return `undefined` under
 * `noUncheckedIndexedAccess`, and falling back to the instant we were given is
 * the least wrong thing available.
 */
export function startOfLocalDayMs(ms: number): number {
  const p = localPartsOf(ms);
  return instantsForLocalMinute(p.year, p.month, p.day, 0)[0] ?? ms;
}

/**
 * `n` LOCAL days later — 23, 24 or 25 hours, whichever that day really is.
 *
 * Adding `n * 86_400_000` is the bug this replaces: it slides the calendar by
 * an hour across a transition, so a fortnight's horizon drawn that way changes
 * which day it starts on halfway through.
 */
export function addLocalDaysMs(ms: number, n: number): number {
  const p = localPartsOf(ms);
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  const mid = instantsForLocalMinute(
    target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), 0,
  )[0];
  // Keep the local time of day, not merely the date: callers pass local
  // midnight and expect local midnight back, but the day view also steps a
  // window forward and must not silently move to midnight if it did not start
  // there.
  if (mid === undefined) return ms + n * DAY_MS;
  const withinDay = ms - startOfLocalDayMs(ms);
  return mid + withinDay;
}

/* ------------------------------------------------------------------ *
 * THE DISPLAY EDGE. Four functions; every screen uses one of them.
 * ------------------------------------------------------------------ */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "2026-09-10" — the LOCAL calendar date, which is what a date input wants. */
export function localDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso.slice(0, 10);
  const p = localPartsOf(t);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** "10:30" — the LOCAL wall clock, with no date and no zone. */
export function localClock(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const p = localPartsOf(t);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/* ------------------------------------------------------------------ *
 * UK DATES FOR A PERSON — PHASE 133c, 17 September 2026.
 *
 * Every date a screen shows reads the same way: "24 Sep 2026"; a moment as
 * "24 Sep 2026, 12:32"; a recent moment as "Today, 12:32" or "Yesterday, 12:32";
 * a due date as "Due in 3 days" or "3 days overdue" with the date beside it.
 * STORED VALUES STAY ISO, and `localDate` above still returns ISO, because a
 * date input and every comparison want it. Only the words a person reads change.
 * ------------------------------------------------------------------ */

const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

/** A calendar day ("2026-09-24"), or the LOCAL day of an instant, as { year, month, day }. Undefined when it is not a date. */
function calendarOf(value: string): { year: number; month: number; day: number } | undefined {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain !== null) {
    const [year, month, day] = [Number(plain[1]), Number(plain[2]), Number(plain[3])];
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    return { year, month, day };
  }
  if (!/^\d{4}-\d\d-\d\d[T ]/.test(value)) return undefined;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return undefined;
  const p = localPartsOf(t);
  return { year: p.year, month: p.month, day: p.day };
}

/** "24 Sep 2026". A calendar day is shown as that day; an instant as the UK day it fell on. Anything else is returned as given. */
export function ukDate(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const c = calendarOf(value);
  return c === undefined ? value : `${c.day} ${MONTHS[c.month - 1] ?? ''} ${c.year}`;
}

/** Whole local days from `fromDay` to `toDay`, both "YYYY-MM-DD" — calendar arithmetic, never 24-hour division. */
function daysBetween(fromDay: string, toDay: string): number {
  const a = calendarOf(fromDay); const b = calendarOf(toDay);
  if (a === undefined || b === undefined) return NaN;
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS);
}

/**
 * "24 Sep 2026, 12:32" — a stored timestamp, for a person.
 *
 * WITH `nowIso`, a moment on today's UK date reads "Today, 12:32" and one on
 * yesterday's "Yesterday, 12:32". Without it the date is always written out —
 * which is what a message that will be read on another day must use.
 */
export function localStamp(iso: string, nowIso?: string): string {
  const t = Date.parse(iso);
  if (!/^\d{4}-\d\d-\d\d/.test(iso) || !Number.isFinite(t)) return iso;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ukDate(iso);
  const p = localPartsOf(t);
  const clock = `${pad2(p.hour)}:${pad2(p.minute)}`;
  if (nowIso !== undefined) {
    const gap = daysBetween(localDate(iso), localDate(nowIso));
    if (gap === 0) return `Today, ${clock}`;
    if (gap === 1) return `Yesterday, ${clock}`;
  }
  return `${p.day} ${MONTHS[p.month - 1] ?? ''} ${p.year}, ${clock}`;
}

/**
 * "Wednesday 24 Sep 2026 at 10:30 BST" — a moment somebody is going to keep.
 *
 * THE ABBREVIATION COMES FROM Intl, NOT FROM A CONDITION. It is "GMT" for four
 * months and "BST" for eight and this file contains neither string.
 */
export function localWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const p = localPartsOf(t);
  const day = WEEKDAY_NAMES[p.weekday] ?? '';
  return `${day} ${p.day} ${MONTHS[p.month - 1] ?? ''} ${p.year} at ${pad2(p.hour)}:${pad2(p.minute)} ${p.abbrev}`;
}

export type DueReading = {
  /** "Due today", "Due tomorrow", "Due in 3 days", "1 day overdue", "3 days overdue" — or "" when there is no date. */
  readonly words: string;
  /** "24 Sep 2026" */
  readonly date: string;
  readonly overdue: boolean;
};

/**
 * A DUE DATE IN WORDS, counted in UK calendar days from today's UK date. `due` is a calendar day or an instant; `nowIso`
 * is the clock's instant. No due date reads as no words at all — never as on time (the tasks rule).
 */
export function dueReading(due: string | null | undefined, nowIso: string): DueReading {
  if (due === null || due === undefined || due === '') return { words: '', date: '', overdue: false };
  const dueDay = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : localDate(due);
  const n = daysBetween(localDate(nowIso), dueDay);
  const date = ukDate(dueDay);
  if (!Number.isFinite(n)) return { words: '', date: due, overdue: false };
  if (n === 0) return { words: 'Due today', date, overdue: false };
  if (n === 1) return { words: 'Due tomorrow', date, overdue: false };
  if (n > 1) return { words: `Due in ${n} days`, date, overdue: false };
  return { words: `${-n} ${n === -1 ? 'day' : 'days'} overdue`, date, overdue: true };
}

/** "Due in 3 days (24 Sep 2026)" — the words and the date, for a place that has room for one string. */
export function dueWords(due: string | null | undefined, nowIso: string): string {
  const r = dueReading(due, nowIso);
  return r.words === '' ? r.date : `${r.words} (${r.date})`;
}

/**
 * A UK date inside a sentence a store wrote with an ISO date in it: "2026-09-24" becomes "24 Sep 2026", a local
 * "2026-09-24 12:32" becomes "24 Sep 2026, 12:32", and a UTC instant "2026-09-24T11:32:00.000Z" becomes its UK
 * wall clock. A date that is part of a longer token — an id such as "finance-setting-vat-position-2026-08-28" — is
 * left alone.
 */
export function ukDatesIn(text: string): string {
  return text.replace(/(?<![\w-])(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z)?)?(?![\w-])/g, (m, day: string, hh?: string, mm?: string, z?: string) => {
    if (hh === undefined) return ukDate(day);
    return z === 'Z' ? localStamp(m) : `${ukDate(day)}, ${hh}:${mm ?? '00'}`;
  });
}

/**
 * The words a screen uses to say which clock it is showing.
 *
 * ONE SENTENCE, IN ONE PLACE, so the day the zone changes no page is left
 * claiming the old one. It names the CURRENT abbreviation rather than listing
 * both, because "times are shown in UK time (BST at the moment)" is what a
 * person needs and "GMT/BST" is what a developer needs.
 */
export function zoneNotice(nowIso: string): string {
  const t = Date.parse(nowIso);
  const p = localPartsOf(Number.isFinite(t) ? t : Date.now());
  return `All times on this screen are UK time (${p.abbrev} at the moment). ` +
    'They are stored in UTC and converted for display, so they stay correct across the ' +
    'March and October changes without anybody adjusting anything.';
}

/**
 * THE DISPLAY EDGE FOR A WHOLE PAGE — PHASE 133c. Every date a person reads is in the UK form, on every screen, because
 * page() in src/web/html.ts passes the page body through this: the text BETWEEN tags goes through `ukDatesIn`. Nothing
 * inside a tag is touched — so an input's value, a link's query string and a date field's ISO value stay ISO — and
 * neither is the text of <code>, <pre>, <textarea>, <script> or <style>, which is typed, copied or read by a machine.
 */
export function ukDatesInMarkup(html: string): string {
  let skip = 0;
  return html.split(/(<[^>]*>)/).map((part) => {
    if (part.startsWith('<')) {
      if (/^<(code|pre|textarea|script|style)\b/i.test(part)) skip++;
      else if (/^<\/(code|pre|textarea|script|style)>/i.test(part)) skip = Math.max(0, skip - 1);
      return part;
    }
    return skip > 0 || !/\d{4}-\d{2}-\d{2}/.test(part) ? part : ukDatesIn(part);
  }).join('');
}
