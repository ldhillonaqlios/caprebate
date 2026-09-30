/**
 * CHOOSE A DATE, THEN A TIME — 30 September 2026.
 *
 * Lakhbir: "with the time and date selector - make it easier for the user 1) choose date this should pull from the back
 * end calendar for telephone calls and virtual 2) choose time (again pull form back end)". It was one long list of up
 * to 24 moments. Now the dates with a free call come first, as a row of day cards; choosing one shows that day's times.
 *
 * BOTH COME FROM THE DIARIES. The moments are `publicSlots` (src/web/schedule.ts): the working times staff set, less
 * every call already held, one entry per moment however many people are free at it. Nothing here invents a time.
 *
 * NO JAVASCRIPT. Public pages carry none (the security policy allows none inline). The date is a radio button; the
 * times for day N sit in `.f4-t<N>` and are shown by `:has(.f4-d<N> input:checked)` (src/web/assets.ts, one rule per
 * index up to MAX_DAYS). A browser without `:has` shows every day's times under its own heading, which still works.
 *
 * A HIDDEN TIME CAN STILL BE CHECKED: choose Thursday at 10:00, then Friday, and Thursday's 10:00 stays selected out of
 * sight. So the date is sent too, and `slotDayProblem` refuses a time that is not on the date showing.
 */

import { h, raw, type Safe } from './html.ts';
import { localClock, localDate, localPartsOf, zoneNotice } from './localtime.ts';
import { SLOT_MINUTES } from './schedule.ts';

/** A fortnight ahead plus today: the most distinct dates `publicSlots` can return. The CSS has a rule for each. */
export const MAX_DAYS = 16;

const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

export type Day = { readonly date: string; readonly short: string; readonly dm: string; readonly long: string; readonly times: readonly string[] };

/** "Thursday 1 October" for a local date "2026-10-01". */
export function longDay(date: string): string {
  const t = Date.parse(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(t)) return date;
  const p = localPartsOf(t);
  return `${WD_LONG[p.weekday] ?? ''} ${p.day} ${MON_LONG[p.month - 1] ?? ''}`;
}

/** The free moments grouped by their LOCAL date, in order, at most MAX_DAYS dates. */
export function daysOf(slots: readonly { starts_at: string }[]): Day[] {
  const by = new Map<string, string[]>();
  for (const s of slots) {
    const d = localDate(s.starts_at);
    if (!by.has(d)) { if (by.size >= MAX_DAYS) break; by.set(d, []); }
    by.get(d)!.push(s.starts_at);
  }
  return [...by.entries()].map(([date, times]) => {
    const p = localPartsOf(Date.parse(times[0]!));
    return { date, short: WD_SHORT[p.weekday] ?? '', dm: `${p.day} ${MON_SHORT[p.month - 1] ?? ''}`, long: longDay(date), times };
  });
}

/** "10:00 – 11:00" */
export function timeRange(iso: string): string {
  return `${localClock(iso)} – ${localClock(new Date(Date.parse(iso) + SLOT_MINUTES * 60_000).toISOString())}`;
}

/**
 * The picker. `chosenSlot` and `chosenDay` are what the person sent last time (so an error page keeps them); with
 * neither, the first date is chosen so its times show at once.
 */
export function slotPicker(
  slots: { available: true; slots: readonly { starts_at: string }[] } | { available: false; say: string },
  chosenSlot: string, chosenDay: string,
): Safe {
  if (!slots.available) return h`<div class="flag">${slots.say}</div>`;
  const days = daysOf(slots.slots);
  if (days.length === 0) return h`<div class="flag">We have no times to offer at the moment. Leave your details and we will come back to you with one.</div>`;
  const day = days.some((d) => d.date === chosenDay) ? chosenDay
    : chosenSlot !== '' && days.some((d) => d.date === localDate(chosenSlot)) ? localDate(chosenSlot) : days[0]!.date;
  const on = (b: boolean): Safe => raw(b ? ' checked' : '');
  return h`<div class="f4-picker">
      <p class="help">${zoneNotice(days[0]!.times[0]!)} Each call lasts an hour.</p>
      <fieldset class="f4-dates"><legend class="fl">1. Choose a date</legend>
        <div class="f4-date-row">${days.map((d, i) => h`<label class="f4-date f4-d${String(i)}"><input type="radio" name="day" value="${d.date}"${on(d.date === day)}><span class="f4-wd">${d.short}</span><span class="f4-dm">${d.dm}</span><span class="f4-n">${String(d.times.length)} ${d.times.length === 1 ? 'time' : 'times'}</span></label>`)}</div>
      </fieldset>
      <fieldset class="f4-timesets"><legend class="fl">2. Choose a time</legend>
        ${days.map((d, i) => h`<div class="f4-times f4-t${String(i)}"><p class="f4-times-h">${d.long}</p>
          <div class="f4-time-row">${d.times.map((t) => h`<label class="f4-time"><input type="radio" name="slot" value="${t}"${on(t === chosenSlot)}> ${timeRange(t)}</label>`)}</div></div>`)}
        <label class="ck f4-none"><input type="radio" name="slot" value=""${on(chosenSlot === '' && chosenDay !== '')}> None of these times suit me — please get in touch to arrange one</label>
      </fieldset>
    </div>`;
}

/**
 * Undefined when the time sent may be held; otherwise what to do, in words. A time must be chosen (or "none suit"),
 * and it must be on the date that is showing.
 */
export function slotDayProblem(day: string | null, slot: string | null): string | undefined {
  if (day === null) return undefined; // no dates were offered (no diary has a free time): nothing to choose
  if (slot === null) return `Choose a time on ${longDay(day)}, or tick that none of the times suit you.`;
  if (slot === '') return undefined;
  if (localDate(slot) !== day) return `Choose a time on ${longDay(day)} — the time you had chosen is on ${longDay(localDate(slot))}.`;
  return undefined;
}
