/**
 * THE RETURN ENTRIES, YEAR BY YEAR, AS A SPREADSHEET BESIDE THE REPORT. PHASE 153b, 4 October 2026.
 *
 * Word question 121, "In what format would you like us to send our results?", for the accountant. Lakhbir: "Any
 * format". Our recommendation, built for the accountant to check: the signed PDF report (built on 2 October,
 * src/web/survey-report.ts) and BESIDE IT a small spreadsheet of what goes on each year's tax return, so nobody
 * retypes figures. Change it if the accountant names a format their software imports.
 *
 * ONE ROW PER ENTRY. The first return adds the qualifying spend to each pool; then, for five returns, the writing-down
 * allowance on each pool and the balance carried forward. The figures come from the approved version alone (its two
 * pools, after grants), and the rates and the year-by-year arithmetic are the engine's (CB_BENEFIT.schedule over
 * CB_RATES) — nothing is restated here.
 *
 * WHAT IT DOES NOT KNOW IT LEAVES BLANK AND SAYS WHY (N4). The main-pool rate turns on the accounting period (18%, or
 * 14% for periods from April 2026, with the straddle rule) and on whether the client is a company. Where the claim's
 * accounting period is not recorded, or the claimant type is not known and the two readings differ, the main-pool
 * rows carry no figure and their "How it is worked out" cell says what is missing. The special-rate pool's 6% is the
 * same for everyone and always given. No first-year allowance or annual investment allowance is assumed: the
 * client's accountant chooses those, and the last row says so.
 *
 * MADE AGAIN EVERY TIME, LIKE THE PDF: nothing is stored. Every cell is quoted where it must be, and a cell that a
 * spreadsheet would read as a formula is made plain text.
 */
import type { Db } from '../db.ts';
import { BENEFIT } from './engine.ts';
import type { Snapshot } from './pack-approve.ts';
import { latestFacts } from './claim-facts.ts';
import { claimantTypeForGate } from './crm.ts';

export const RETURN_YEARS = 5;

export type ReturnContext = {
  /** The claim's accounting period the spend falls in, where recorded (claim facts ACCOUNTING_PERIOD_START / _END). */
  readonly period_start: string | null;
  /** True for a company, false for self assessment, null where the claimant type is not known. */
  readonly is_company: boolean | null;
};

export type ReturnEntry = {
  readonly return_no: number;
  readonly period: string;
  readonly pool: 'Main pool' | 'Special rate pool';
  readonly entry: string;
  /** In pence. Null where it cannot be worked out on what is known. */
  readonly amount_pence: number | null;
  readonly how: string;
};

type Row = { period_start: string | null; period_end: string | null; main_wda_rate: number; special_wda_rate: number;
  main_wda: number; special_wda: number; main_pool_cf: number; special_pool_cf: number };
type Schedule = (o: Record<string, unknown>) => { rows: Row[] };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pct = (r: number) => `${String(Math.round(r * 10000) / 100)}%`;
const pence = (pounds: number) => (Number.isFinite(pounds) ? Math.round(pounds * 100) : null);

function run(main: number, special: number, start: string | null, isCo: boolean): Row[] {
  const schedule = (BENEFIT as { schedule?: unknown }).schedule as Schedule | undefined;
  if (typeof schedule !== 'function') return [];
  return schedule({ main, special, tax_rate: 0, years: RETURN_YEARS, period_start: start, is_company: isCo, first_year: {} }).rows;
}

/** The entries for each return, from an approved version and what the claim records about its period and claimant. */
export function returnEntries(s: Snapshot, ctx: ReturnContext): ReturnEntry[] {
  const main = (s.sums.main_pool_pence ?? 0) / 100;
  const special = (s.sums.special_pool_pence ?? 0) / 100;
  const start = ctx.period_start !== null && ISO.test(ctx.period_start) ? ctx.period_start : null;
  // Run both claimant readings where the type is not known; a main-pool figure stands only where they agree.
  const readings = ctx.is_company === null ? [run(main, special, start, true), run(main, special, start, false)] : [run(main, special, start, ctx.is_company)];
  const first = readings[0] ?? [];
  const agreed = (pick: (r: Row) => number, i: number): number | null => {
    const vals = readings.map((rs) => rs[i] === undefined ? Number.NaN : pick(rs[i] as Row));
    const v = vals[0] ?? Number.NaN;
    return vals.every((x) => Number.isFinite(x) && Math.abs(x - v) < 0.005) ? v : null;
  };
  const periodOf = (i: number): string => {
    const r = first[i];
    return r !== undefined && r.period_start !== null && r.period_end !== null ? `${r.period_start} to ${r.period_end}`
      : i === 0 ? 'the accounting period the spend falls in (not recorded yet)' : `the accounting period ${String(i)} after that`;
  };
  const mainMissing = start === null ? 'The accounting period is not on the claim yet. The main pool rate depends on it.'
    : 'We do not know if the client is a company. A company and a person get a different rate here.';
  const out: ReturnEntry[] = [
    { return_no: 1, period: periodOf(0), pool: 'Main pool', entry: 'Spend that counts, added to the pool', amount_pence: s.sums.main_pool_pence ?? 0,
      how: 'From the approved survey report: the main pool, after any grant.' },
    { return_no: 1, period: periodOf(0), pool: 'Special rate pool', entry: 'Spend that counts, added to the pool', amount_pence: s.sums.special_pool_pence ?? 0,
      how: 'From the approved survey report: the special rate pool, after any grant.' },
  ];
  for (let i = 0; i < RETURN_YEARS; i++) {
    const mRate = agreed((r) => r.main_wda_rate, i);
    const mWda = agreed((r) => r.main_wda, i);
    const mCf = agreed((r) => r.main_pool_cf, i);
    const r0 = first[i];
    const sRate = r0?.special_wda_rate ?? Number.NaN;
    out.push(
      { return_no: i + 1, period: periodOf(i), pool: 'Main pool', entry: 'Writing-down allowance', amount_pence: mWda === null ? null : pence(mWda),
        how: mRate === null ? `Not worked out. ${mainMissing}` : `${pct(mRate)} of the balance on the pool.` },
      { return_no: i + 1, period: periodOf(i), pool: 'Special rate pool', entry: 'Writing-down allowance', amount_pence: r0 === undefined ? null : pence(r0.special_wda),
        how: Number.isFinite(sRate) ? `${pct(sRate)} of the balance on the pool.` : 'Not worked out.' },
      { return_no: i + 1, period: periodOf(i), pool: 'Main pool', entry: 'Balance carried forward', amount_pence: mCf === null ? null : pence(mCf),
        how: mCf === null ? `Not worked out. ${mainMissing}` : 'The balance less the writing-down allowance.' },
      { return_no: i + 1, period: periodOf(i), pool: 'Special rate pool', entry: 'Balance carried forward', amount_pence: r0 === undefined ? null : pence(r0.special_pool_cf),
        how: 'The balance less the writing-down allowance.' },
    );
  }
  return out;
}

/** One CSV cell: quoted where it must be, and never read by a spreadsheet as a formula. */
export function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The spreadsheet: a header, one row per entry, and two notes. Lines end CRLF, as RFC 4180 says. */
export function returnEntriesCsv(s: Snapshot, ctx: ReturnContext, fingerprint: string): string {
  const rows: string[][] = [['Return', 'Accounting period', 'Pool', 'Entry', 'Amount (£)', 'How it is worked out']];
  for (const e of returnEntries(s, ctx)) {
    rows.push([String(e.return_no), e.period, e.pool, e.entry,
      e.amount_pence === null ? '' : (e.amount_pence / 100).toFixed(2), e.how]);
  }
  rows.push(['', '', '', 'Note', '', 'Writing-down allowances only. The accountant may claim a bigger allowance in the first year instead, such as the annual investment allowance. Then these rows change.']);
  rows.push(['', '', '', 'Made from', '', `${s.business.name}, approved survey report version ${String(s.version)}, fingerprint ${fingerprint}`]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** What the claim records that the rows need: its accounting period's first day, and whether the claimant is a company. */
export function returnContext(db: Db, claim_id: string | null, business_id: string): ReturnContext {
  const f = claim_id === null ? undefined : latestFacts(db, claim_id).get('ACCOUNTING_PERIOD_START');
  const start = f !== undefined && f.answer === 'VALUE' ? (f.value_date ?? f.value_text ?? null) : null;
  const t = claimantTypeForGate(db, business_id).value;
  const is_company = t === 'COMPANY' ? true : t !== null && ['LLP', 'PARTNERSHIP', 'SOLE_TRADER', 'INDIVIDUAL'].includes(t) ? false : null;
  return { period_start: start, is_company };
}

export const csvName = (company: string, version: number) =>
  `${company.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'client'}-return-entries-v${String(version)}.csv`;
