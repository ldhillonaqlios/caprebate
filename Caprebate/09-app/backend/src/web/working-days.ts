/**
 * WORKING DAYS, WITH ENGLAND AND WALES BANK HOLIDAYS — PHASE 137, 21 September 2026.
 *
 * ONE RULE FOR "HOW LONG HAS THIS NEW LEAD WAITED". Home's New leads row and the Leads page's New section both read
 * `workingDaysSince` from here, so the two can never disagree about which lead is red.
 *
 * THE LIST IS COPIED FROM GOV.UK (https://www.gov.uk/bank-holidays.json, "england-and-wales"), read on 21 September 2026.
 * gov.uk publishes about two years ahead. `BANK_HOLIDAYS_KNOWN_TO` is the last day the list speaks for; after it, every
 * Monday to Friday counts as a working day again — so a lead turns red a day early after a holiday, never a day late.
 * test/phase137.test.ts fails 90 days before the list runs out, so somebody copies the next year in before it matters.
 */

import { localDate } from './localtime.ts';

/** England and Wales bank holidays, from gov.uk. Substitute days are listed as the day off, as gov.uk lists them. */
export const BANK_HOLIDAYS_EW: ReadonlySet<string> = new Set([
  // 2025
  '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
  // 2026
  '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
  // 2028
  '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26',
]);

/** The first and last days the list above speaks for. Outside them, a weekday is a working day. */
export const BANK_HOLIDAYS_KNOWN_FROM = '2025-01-01';
export const BANK_HOLIDAYS_KNOWN_TO = '2028-12-31';

/** A UK calendar date (YYYY-MM-DD) that is Monday to Friday and not a bank holiday. */
export function isWorkingDay(day: string): boolean {
  const w = new Date(`${day}T12:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6 && !BANK_HOLIDAYS_EW.has(day);
}

/**
 * WHOLE WORKING DAYS FROM THE UK DATE A LEAD ARRIVED TO TODAY: every working day after the day it came in, up to and
 * including today. A lead in on Friday has waited one working day on Monday, and two — so red — on Tuesday. A bank
 * holiday Monday is not counted, so the same lead is red on Wednesday instead.
 */
export function workingDaysSince(fromIso: string, nowIso: string): number {
  const from = localDate(fromIso);
  const to = localDate(nowIso);
  if (from >= to) return 0;
  let n = 0;
  const d = new Date(`${from}T12:00:00Z`);
  for (let i = 0; i < 4000; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.toISOString().slice(0, 10);
    if (day > to) break;
    if (isWorkingDay(day)) n++;
  }
  return n;
}

/** A new lead is red once it has waited more than one working day. The one threshold, for Home and for Leads. */
export const LATE_AFTER_WORKING_DAYS = 1;

export function isLateNewLead(fromIso: string, nowIso: string): boolean {
  return workingDaysSince(fromIso, nowIso) > LATE_AFTER_WORKING_DAYS;
}

export function waitedWords(days: number): string {
  return days === 0 ? 'Came in today' : `Waiting ${days} working ${days === 1 ? 'day' : 'days'}`;
}
