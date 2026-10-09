/**
 * THE COST MODEL IN THE SURVEY PACK — PHASE 157a, 6 October 2026 (from Phase 153e, with 153g's and 155's additions).
 *
 * 04-phase-work/phase9/caprebate-cost-model.cjs has had four of the surveyor's questions built in its own test system
 * since 4 October (Phase 153e): preliminaries by job size (Word question 136), the insurance cross-check (137), the
 * past-claim limits (139) and the index factor (147). The pack did not call it at all. This file reads it for one pack,
 * and the chapters show what it says (src/web/pack-sheets.ts):
 *
 *   chapter 11  THE INDEX DATES. The purchase date (the property record) and the valuation date (the surveyor's, chapter
 *               11), the index at each and the factor between them: index(purchase) / index(valuation), which turns a
 *               cost priced at the valuation date back to the purchase date. The table is the real BCIS index where one
 *               has been imported (src/web/bcis-index.ts, `node src/cli.ts import-bcis-index`); the cost model's
 *               PLACEHOLDER table of invented points ONLY in the test system; otherwise nothing — never a guess.
 *   chapter 14  THE CHECKS. Preliminaries: the model as shipped uses a flat 18% with its switch off; the placeholder bands
 *               by job size are shown, in the test system only, against this pack's rebuild cost. The insurance figure:
 *               SUPPORTS, DOES NOT SUPPORT or NOT COMPARABLE, after the like-for-like adjustment, against a 10% test
 *               limit for the surveyor to confirm. The past-claim limits are for checking the model against past claims,
 *               not for one pack, and the chapter says so.
 *   chapter 22  THE £/m² REVIEW FLAG (Word question 149, the phase3 CRM's BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2): this
 *               pack's whole-building rate against the middle rate of the sector's approved packs, once five exist.
 *               More than 10% apart is FLAGGED FOR REVIEW — never a fail.
 *
 * NOTHING HERE CHANGES A FIGURE. Every cost-model gate stays off in the shipped model; these are readings shown to the
 * surveyor, kept out of the approved version and the client's report (SheetRow.internal), because each rests on a
 * placeholder or a test limit. "Not known" is never a pass (N4): a missing date, figure or answer says so.
 *
 * THE TEST SYSTEM is the deployed test website (src/connectors/place.ts), or a copy started with
 * CAPREBATE_COST_MODEL_TEST=1.
 */
import { createRequire } from 'node:module';
import type { Db } from '../db.ts';
import type { PackView } from './survey-pack.ts';
import { INCLUDES_BITS, packDateIso } from './survey-pack.ts';
import { bcisIndexTable } from './bcis-index.ts';
import { acquisitionDateReading } from './claim-facts.ts';
import { onTestWebsite, type Env } from '../connectors/place.ts';
import { MIN_CLAIMS } from './sector-ranges.ts';
import { BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2 } from '../../../../04-phase-work/phase3/caprebate-surveyor-crm.ts';

type IndexTable = { loaded: boolean; source: string; points: readonly (readonly [string, number])[] };
type Includes = { demolition?: boolean; fees?: boolean; prelims?: boolean };
type Insurance = { verdict: 'SUPPORTS' | 'DOES_NOT_SUPPORT' | 'NOT_COMPARABLE'; gap: number | null; limit: number; steps: string[]; why: string };

const CM = createRequire(import.meta.url)('../../../../04-phase-work/phase9/caprebate-cost-model.cjs') as {
  CB_BCIS_INDEX_PLACEHOLDER: IndexTable;
  TEST_SYSTEM_GATES: Readonly<Record<string, boolean>>;
  SPEC_PRELIMS_DEFAULT: number;
  SPEC_FEES_DEFAULT: number;
  INSURANCE_SUPPORT_LIMIT_TEST: number;
  PRELIMS_BANDS_PLACEHOLDER: { status: string };
  defaultPrelimsRate: (input: { job_size_pounds: number }, opts: { gates: Readonly<Record<string, boolean>> }) => number;
  indexFactorFromTable: (t: IndexTable, purchase: string, valuation: string) => { factor: number; index_at_purchase: number; index_at_valuation: number; source: string };
  insuranceCrossCheck: (input: {
    ours: { amount: number; date: string | null; includes: Includes };
    insurance: { amount: number; date: string | null; includes: Includes };
    adjustments: { fees_rate: number; prelims_rate: number };
  }, opts: { tables?: Record<string, IndexTable> }) => Insurance;
};

export const COST_MODEL_TEST_OPT_IN = 'CAPREBATE_COST_MODEL_TEST';

/** True where the cost model's placeholders may be shown: the test website, or a copy started with the opt-in. */
export function costModelTestSystem(env: Env = process.env): boolean {
  return onTestWebsite(env) || (env[COST_MODEL_TEST_OPT_IN] ?? '').trim() === '1';
}

/** The index table to use: the imported BCIS table, else the placeholder in the test system only, else none and why. */
export function indexTableHere(env: Env = process.env):
  { readonly table: IndexTable; readonly kind: 'BCIS' | 'PLACEHOLDER' } | { readonly table: null; readonly why: string } {
  const real = bcisIndexTable(env as Record<string, string | undefined>);
  if (real.table !== null) return { table: real.table, kind: 'BCIS' };
  if (costModelTestSystem(env)) return { table: CM.CB_BCIS_INDEX_PLACEHOLDER, kind: 'PLACEHOLDER' };
  return { table: null, why: real.why };
}

export const PLACEHOLDER_INDEX_WORDS = 'a test index with made-up figures, not BCIS, used on the test site only';

const pct = (x: number) => `${String(Math.round(x * 1000) / 10)}%`;
const pounds = (p: number) => `£${Math.round(p / 100).toLocaleString('en-GB')}`;

export type IndexReading = {
  readonly purchase: string | null;
  /** PHASE 159a (L7): where the purchase date came from, in words — the property record, the legal check, the client. */
  readonly purchase_from: 'the property record' | 'the surveyor' | 'the client';
  readonly valuation: string | null;
  readonly kind: 'BCIS' | 'PLACEHOLDER' | null;
  readonly factor: number | null;
  readonly at_purchase: number | null;
  readonly at_valuation: number | null;
  /** One sentence: the factor and its table, or why there is none. */
  readonly words: string;
};

/**
 * PHASE 159a (the Lockwood run, L7): THE ONE PURCHASE DATE, as the amendment window reads it (src/web/claim-facts.ts
 * acquisitionDateReading, Phase 158d): the property record, else the surveyor's legal check, else the client's checked
 * answer. Chapter 11 read the property record alone, so it said "not on file" while the legal check held the date.
 */
function purchaseDateOf(db: Db, v: PackView): { date: string | null; from: IndexReading['purchase_from'] } {
  if (v.property === null) return { date: null, from: 'the property record' };
  const r = acquisitionDateReading(db, v.property.id);
  const d = r.known && typeof r.value === 'string' ? r.value : null;
  const pub = r.source?.publisher;
  const from = pub === 'The surveyor' ? 'the surveyor' : pub === 'The client' ? 'the client' : 'the property record';
  return { date: d !== null && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null, from };
}

/** Chapter 11: the purchase and valuation dates, and the index factor between them. */
export function indexReading(db: Db, v: PackView, env: Env = process.env): IndexReading {
  const { date: purchase, from: purchase_from } = purchaseDateOf(db, v);
  const valuation = packDateIso(v.cost.valuation_date.value);
  const t = indexTableHere(env);
  const base = { purchase, purchase_from, valuation, kind: t.table === null ? null : t.kind, factor: null, at_purchase: null, at_valuation: null };
  if (t.table === null) return { ...base, words: `Not worked out: ${t.why}.` };
  if (purchase === null) return { ...base, words: 'Not worked out: the purchase date is not on the property record, the legal check or the client’s checked answer.' };
  if (valuation === null) return { ...base, words: 'Not worked out: give the valuation date below.' };
  try {
    const f = CM.indexFactorFromTable(t.table, purchase, valuation);
    const from = t.kind === 'BCIS' ? `the BCIS index (${t.table.source})` : PLACEHOLDER_INDEX_WORDS;
    return { ...base, factor: Math.round(f.factor * 10000) / 10000, at_purchase: f.index_at_purchase, at_valuation: f.index_at_valuation,
      words: `${String(f.index_at_purchase)} at the purchase date over ${String(f.index_at_valuation)} at the valuation date: a factor of ${(Math.round(f.factor * 10000) / 10000).toFixed(4)}, from ${from}.` };
  } catch (e) {
    return { ...base, words: `Not worked out: ${e instanceof Error ? e.message : String(e)}.` };
  }
}

export type PrelimsReading = {
  readonly shipped_rate: number;
  readonly job_size_pence: number | null;
  /** The placeholder band's rate for this job, in the test system only. */
  readonly band_rate: number | null;
  readonly words: string;
};

/** Chapter 14: preliminaries by job size (Word question 136). */
export function prelimsReading(v: PackView, env: Env = process.env): PrelimsReading {
  const shipped = CM.SPEC_PRELIMS_DEFAULT;
  const size = v.sums.rebuild_pence;
  const lead = `As shipped the cost model uses a flat ${pct(shipped)}, and its switch for job-size bands is off.`;
  if (!costModelTestSystem(env)) return { shipped_rate: shipped, job_size_pence: size, band_rate: null, words: `${lead} The bands by job size are placeholders, shown in the test system only.` };
  if (size === null) return { shipped_rate: shipped, job_size_pence: null, band_rate: null, words: `${lead} The band for this job is not worked out: the rebuild cost is not known yet (chapter 10).` };
  const rate = CM.defaultPrelimsRate({ job_size_pounds: size / 100 }, { gates: CM.TEST_SYSTEM_GATES });
  return { shipped_rate: shipped, job_size_pence: size, band_rate: rate,
    words: `${lead} On the placeholder bands, a job of ${pounds(size)} would use ${pct(rate)}. The bands are not calibrated: the surveyor sets them (Word question 136).` };
}

const includesOf = (bits: number | null): Includes => bits === null ? {}
  : { demolition: (bits & INCLUDES_BITS.demolition) !== 0, fees: (bits & INCLUDES_BITS.fees) !== 0, prelims: (bits & INCLUDES_BITS.prelims) !== 0 };

export const INCLUDES_WORDS: readonly string[] = Object.freeze([
  'None of them', 'Demolition only', 'Professional fees only', 'Demolition and professional fees',
  'Preliminaries only', 'Demolition and preliminaries', 'Professional fees and preliminaries', 'All three',
]);

export type InsuranceReading = {
  readonly verdict: 'SUPPORTS' | 'DOES_NOT_SUPPORT' | 'NOT_COMPARABLE' | null;
  readonly words: string;
};

const INSURANCE_VERDICT_WORDS = Object.freeze({
  SUPPORTS: 'Supports our figure', DOES_NOT_SUPPORT: 'Does not support our figure', NOT_COMPARABLE: 'Not comparable',
});

/** Chapter 14: the insurance cross-check (Word question 137). Never "corroborates" (the model's own rule). */
export function insuranceReading(v: PackView, env: Env = process.env): InsuranceReading {
  const ours = v.sums.rebuild_pence, ins = v.cost.insurance.value;
  if (ins === null) return { verdict: null, words: 'No insurance figure is recorded. Record it below to check our rebuild cost against it.' };
  if (ours === null || ours <= 0) return { verdict: null, words: 'Not worked out: our rebuild cost is not known yet (chapter 10).' };
  // N4: a date not given is never taken as the other figure's date, so two unknown dates are not "the same date".
  if (v.cost.valuation_date.value === null) return { verdict: 'NOT_COMPARABLE', words: `${INSURANCE_VERDICT_WORDS.NOT_COMPARABLE}: the valuation date is not given (chapter 11), so the two figures cannot be brought to the same date.` };
  if (v.cost.insurance_date.value === null) return { verdict: 'NOT_COMPARABLE', words: `${INSURANCE_VERDICT_WORDS.NOT_COMPARABLE}: the date of the insurance figure is not given, so the two figures cannot be brought to the same date.` };
  const t = indexTableHere(env);
  const band = prelimsReading(v, env).band_rate;
  let r: Insurance;
  try {
    r = CM.insuranceCrossCheck({
      ours: { amount: ours / 100, date: packDateIso(v.cost.valuation_date.value), includes: includesOf(v.cost.rebuild_includes.value) },
      insurance: { amount: ins / 100, date: packDateIso(v.cost.insurance_date.value), includes: includesOf(v.cost.insurance_includes.value) },
      adjustments: { fees_rate: CM.SPEC_FEES_DEFAULT, prelims_rate: band ?? CM.SPEC_PRELIMS_DEFAULT },
    }, t.table === null ? {} : { tables: { CB_BCIS_INDEX: t.table } });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return { verdict: 'NOT_COMPARABLE', words: `${INSURANCE_VERDICT_WORDS.NOT_COMPARABLE}: the two dates differ and they could not be brought together (${t.table === null ? t.why : why}).` };
  }
  const steps = r.steps.length === 0 ? '' : ` Steps: ${r.steps.join('; ')}.`;
  return { verdict: r.verdict, words: `${INSURANCE_VERDICT_WORDS[r.verdict]}: ${r.why}.${r.gap === null ? '' : ` ${pct(r.gap)} apart.`}${steps}` };
}

export type RateFlagReading = {
  readonly packs: number;
  readonly median_pence: number | null;
  readonly verdict: 'WITHIN_TEST_LIMIT' | 'FLAG_FOR_REVIEW' | null;
  readonly words: string;
};

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] as number : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/**
 * Chapter 22: the whole-building rate (£/m²) against the middle rate of this sector's approved packs (each pack's newest
 * version, this one left out), once MIN_CLAIMS exist. More than the phase3 module's 10% test limit apart: flagged for
 * review, never a fail.
 */
export function rateFlagReading(db: Db, v: PackView, min = MIN_CLAIMS): RateFlagReading {
  const rows = db.all<{ snapshot_json: string; job_id: string }>(
    'SELECT a.snapshot_json, p.job_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
      'WHERE a.version = (SELECT MAX(x.version) FROM survey_pack_approvals x WHERE x.pack_id = a.pack_id)');
  const rates: number[] = [];
  for (const r of rows) {
    if (r.job_id === v.job.id) continue;
    let s: { job?: { sector?: unknown }; inputs?: { building_rate_pence?: { value?: unknown } } };
    try { s = JSON.parse(r.snapshot_json) as typeof s; } catch { continue; }
    const rate = s.inputs?.building_rate_pence?.value;
    if (s.job?.sector === v.job.sector && typeof rate === 'number' && Number.isFinite(rate) && rate > 0) rates.push(rate);
  }
  const mine = v.inputs.building_rate_pence.value;
  const limit = `${pct(BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2)} (a test limit, for the surveyor to confirm: Word question 149)`;
  if (rates.length < min) return { packs: rates.length, median_pence: null, verdict: null,
    words: `${String(rates.length)} approved pack${rates.length === 1 ? '' : 's'} in this sector give a rate; ${String(min)} are needed before this pack’s rate is compared.` };
  const mid = median(rates);
  if (mine === null) return { packs: rates.length, median_pence: mid, verdict: null, words: `The middle rate of ${String(rates.length)} approved packs is ${pounds(mid)} a square metre. This pack has no whole-building rate yet (chapter 9).` };
  const rel = Math.abs(mine - mid) / mid;
  const flagged = rel > BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2;
  return { packs: rates.length, median_pence: mid, verdict: flagged ? 'FLAG_FOR_REVIEW' : 'WITHIN_TEST_LIMIT',
    words: `${pounds(mine)} a square metre against a middle rate of ${pounds(mid)} from ${String(rates.length)} approved packs: ${pct(rel)} apart. ` +
      (flagged ? `More than ${limit}, so it is flagged for your review. It is not a fail.` : `Within ${limit}.`) };
}
