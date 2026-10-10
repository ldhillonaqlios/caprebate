/**
 * PHASE 159k (item 2), 10 October 2026 — TWO STATUTORY FIGURES THE ENGINE DOES NOT HOLD.
 *
 * src/web/allowances.ts states no rate: every rate and date comes from the engine (Rulebook I rule 7.1). These two are
 * not in the engine (CB_RATES has neither), so they are kept here, each with its section, read by allowances.ts alone,
 * and put to the tax adviser with the readings that use them (money-readings.ts; Word questions under Phase 159k).
 *
 *   LONG_LIFE_DE_MINIMIS_PENCE   CAA 2001 s.99: expenditure is not long-life asset expenditure where a chargeable
 *                                period's long-life spend is not more than £100,000, reduced in proportion for a period
 *                                shorter than a year. OUR READING applies it to every claimant; the tax adviser is asked
 *                                whether a person's business (not a company) may use it.
 *   LONG_LIFE_YEARS              s.91: an expected useful economic life of 25 years or more, new.
 *   LRR_ADDITIONAL               CTA 2009 s.1149: land remediation relief is the expenditure deducted in full, and an
 *                                additional deduction of 50% of it — 150% in all. Companies only.
 */
export const LONG_LIFE_DE_MINIMIS_PENCE = 100_000_00;
export const LONG_LIFE_YEARS = 25;
export const LRR_ADDITIONAL = 0.5;

/** s.99(2): the de minimis limit for a period, in proportion to its length (a year is 365 days, or 366 with 29 Feb). */
export function longLifeLimitFor(p: { start: string; end: string } | null): number | null {
  if (p === null) return null;
  const ms = Date.parse(`${p.end}T00:00:00Z`) - Date.parse(`${p.start}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const days = Math.round(ms / 86_400_000) + 1;
  const y = Number(p.start.slice(0, 4));
  const yearDays = ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) && p.start.slice(5) <= '02-29' ? 366 : 365;
  return days >= yearDays ? LONG_LIFE_DE_MINIMIS_PENCE : Math.round(LONG_LIFE_DE_MINIMIS_PENCE * days / yearDays);
}
