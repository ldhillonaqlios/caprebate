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
 * MADE AGAIN EVERY TIME, LIKE THE PDF — from the same facts once it has been sent. PHASE 159a (C29): the first time a
 * version's spreadsheet leaves us (emailed for sign-off, or its sign-off recorded) the claim's accounting period and
 * claimant type are kept with the version (`freezeReturnContext`, table return_entry_contexts), and every later copy of
 * that version is made from them (`returnContextFor`). Before then it reads the claim as it stands. Every cell is quoted
 * where it must be, and a cell that a spreadsheet would read as a formula is made plain text.
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

function run(main: number, special: number, start: string | null, isCo: boolean): Row[] {
  const schedule = (BENEFIT as { schedule?: unknown }).schedule as Schedule | undefined;
  if (typeof schedule !== 'function') return [];
  return schedule({ main, special, tax_rate: 0, years: RETURN_YEARS, period_start: start, is_company: isCo, first_year: {} }).rows;
}

/** A pool worked in whole pence from the engine's rate for each year: the allowance is rounded once, and the balance
 * carried forward is the balance less it, so every row adds up to the penny (PHASE 159a, C16). */
function inPence(start: number, rates: readonly number[]): { wda: number; cf: number }[] {
  let bal = start;
  return rates.map((r) => {
    const wda = Number.isFinite(r) ? Math.round(bal * r) : Number.NaN;
    const cf = bal - wda;
    bal = cf;
    return { wda, cf };
  });
}

/** Two readings of one rate are the same rate (a rate is a fraction; the readings differ by far more than this when they differ). */
const sameRate = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;

/** The entries for each return, from an approved version and what the claim records about its period and claimant. */
export function returnEntries(s: Snapshot, ctx: ReturnContext): ReturnEntry[] {
  const mainP = s.sums.main_pool_pence ?? 0;
  const specialP = s.sums.special_pool_pence ?? 0;
  const main = mainP / 100;
  const special = specialP / 100;
  const start = ctx.period_start !== null && ISO.test(ctx.period_start) ? ctx.period_start : null;
  // Run both claimant readings where the type is not known; a main-pool figure stands only where they agree.
  const readings = ctx.is_company === null ? [run(main, special, start, true), run(main, special, start, false)] : [run(main, special, start, ctx.is_company)];
  const first = readings[0] ?? [];
  /* PHASE 159a (C14): THE RATE AND THE AMOUNT STAND OR FALL TOGETHER. The two readings' main-pool rates were compared
     within 0.005 — so 17.01% and 17.06% "agreed", and the rate was shown beside a blank amount. Now a year's main-pool
     rate stands only where every reading gives the same rate, and then its amounts are worked from it. */
  const mainRates = Array.from({ length: RETURN_YEARS }, (_x, i) => {
    const rs = readings.map((rows) => rows[i]?.main_wda_rate ?? Number.NaN);
    const r0 = rs[0] ?? Number.NaN;
    return rs.every((r) => sameRate(r, r0)) ? r0 : Number.NaN;
  });
  // A year whose rate is not agreed leaves every later year's balance unknown too.
  const firstUnknown = mainRates.findIndex((r) => !Number.isFinite(r));
  const mainRows = inPence(mainP, mainRates.map((r, i) => (firstUnknown >= 0 && i >= firstUnknown ? Number.NaN : r)));
  const specialRates = Array.from({ length: RETURN_YEARS }, (_x, i) => first[i]?.special_wda_rate ?? Number.NaN);
  const specialRows = inPence(specialP, specialRates);
  const periodOf = (i: number): string => {
    const r = first[i];
    return r !== undefined && r.period_start !== null && r.period_end !== null ? `${r.period_start} to ${r.period_end}`
      : i === 0 ? 'the accounting period the spend falls in (not recorded yet)' : `the accounting period ${String(i)} after that`;
  };
  const mainMissing = start === null ? 'The accounting period is not on the claim yet. The main pool rate depends on it.'
    : 'We do not know if the client is a company. A company and a person get a different rate here.';
  const known = (n: number | undefined): number | null => (n !== undefined && Number.isFinite(n) ? n : null);
  /* PHASE 159c: A BUILDING WITH WORK SINCE ADDS EACH SPEND ON ITS OWN ROW — the purchase, then each piece of work — so
     the return shows where every pound came from. They add up to the pool; the allowances below run on the pool. Which
     period each spend belongs to, and its own first-year allowance, are Phase 159e's: here they all fall in one. */
  const ev = (s as { events?: { purchase_applies: boolean; purchase: { main_pool_pence: number | null; special_pool_pence: number | null } | null;
    works: { label: string; main_pool_pence: number | null; special_pool_pence: number | null }[] } }).events;
  const parts = ev === undefined ? null : [
    ...(ev.purchase_applies && ev.purchase !== null ? [{ what: 'the purchase', main: ev.purchase.main_pool_pence, special: ev.purchase.special_pool_pence }] : []),
    ...ev.works.map((w) => ({ what: w.label, main: w.main_pool_pence, special: w.special_pool_pence })),
  ];
  const out: ReturnEntry[] = parts === null ? [
    { return_no: 1, period: periodOf(0), pool: 'Main pool', entry: 'Spend that counts, added to the pool', amount_pence: mainP,
      how: 'From the approved survey report: the main pool, after any grant.' },
    { return_no: 1, period: periodOf(0), pool: 'Special rate pool', entry: 'Spend that counts, added to the pool', amount_pence: specialP,
      how: 'From the approved survey report: the special rate pool, after any grant.' },
  ] : (['Main pool', 'Special rate pool'] as const).flatMap((pool) => parts.map((x) => ({
    return_no: 1, period: periodOf(0), pool, entry: `Spend that counts, added to the pool: ${x.what}`,
    amount_pence: pool === 'Main pool' ? x.main : x.special,
    how: `From the approved survey report: the ${pool === 'Main pool' ? 'main pool' : 'special rate pool'} of ${x.what}${x.what === 'the purchase' ? ', after any grant' : ', on its own cost'}.` })));
  for (let i = 0; i < RETURN_YEARS; i++) {
    const mWda = known(mainRows[i]?.wda);
    const mCf = known(mainRows[i]?.cf);
    const mRate = mWda === null ? null : (mainRates[i] ?? null);
    const sWda = known(specialRows[i]?.wda);
    const sRate = specialRates[i] ?? Number.NaN;
    out.push(
      { return_no: i + 1, period: periodOf(i), pool: 'Main pool', entry: 'Writing-down allowance', amount_pence: mWda,
        how: mRate === null ? `Not worked out. ${mainMissing}` : `${pct(mRate)} of the balance on the pool.` },
      { return_no: i + 1, period: periodOf(i), pool: 'Special rate pool', entry: 'Writing-down allowance', amount_pence: sWda,
        how: sWda !== null ? `${pct(sRate)} of the balance on the pool.` : 'Not worked out.' },
      { return_no: i + 1, period: periodOf(i), pool: 'Main pool', entry: 'Balance carried forward', amount_pence: mCf,
        how: mCf === null ? `Not worked out. ${mainMissing}` : 'The balance less the writing-down allowance.' },
      { return_no: i + 1, period: periodOf(i), pool: 'Special rate pool', entry: 'Balance carried forward', amount_pence: known(specialRows[i]?.cf),
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

/** PHASE 159a (C29): the facts a version's spreadsheet was first sent on, or null if it has not been sent. */
export function frozenReturnContext(db: Db, approval_id: string): ReturnContext | null {
  const r = db.get<{ period_start: string | null; is_company: number | null }>(
    'SELECT period_start, is_company FROM return_entry_contexts WHERE approval_id = ?', [approval_id]);
  return r === undefined ? null : { period_start: r.period_start, is_company: r.is_company === null ? null : r.is_company === 1 };
}

/** Keep the facts a version's spreadsheet is sent on — once. A later call for the same version changes nothing. */
export function freezeReturnContext(db: Db, approval_id: string, ctx: ReturnContext, by: 'SENT_FOR_SIGNOFF' | 'SIGNOFF_RECORDED', at: string): ReturnContext {
  const start = ctx.period_start !== null && ISO.test(ctx.period_start) ? ctx.period_start : null;
  db.run('INSERT OR IGNORE INTO return_entry_contexts (approval_id, period_start, is_company, frozen_by, frozen_at) VALUES (?, ?, ?, ?, ?)',
    [approval_id, start, ctx.is_company === null ? null : ctx.is_company ? 1 : 0, by, at]);
  return frozenReturnContext(db, approval_id) ?? ctx;
}

/** The facts a version's spreadsheet is made from: as first sent, or, before it has been sent, the claim as it stands. */
export function returnContextFor(db: Db, approval_id: string, claim_id: string | null, business_id: string): ReturnContext {
  return frozenReturnContext(db, approval_id) ?? returnContext(db, claim_id, business_id);
}
