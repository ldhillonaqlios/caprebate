/**
 * Caprebate — Surveyor CRM tests. Board item 12818968809.
 * Run:  node --test caprebate-surveyor-crm.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OverrideStore, RateLibrary, CrmError,
  adoption, selfConsistency, divergences, calibrationFeed, propose, classifyOutcome, fieldSpec,
  RATE_FIELDS, CALIBRATION_ORIGIN, MIN_N_FOR_RATE, ADOPTION_GOOD, BIAS_THRESHOLD,
  // Phase 52 — the calibration instrument (item 12830166861)
  drift, DRIFT_COHORT_SIZE, DRIFT_THRESHOLD,
  isBlankControl, ControlStore, blankControlComparison, BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2,
  calibrationInstrument, CALIBRATION_MODE,
  type Context, type RecordInput, type PlatformDefaults,
} from './caprebate-surveyor-crm.ts';

const CTX: Context = { sector: 'CARE_HOMES', region: 'Wales' };
const AT = (d: number) => `2026-0${Math.min(9, Math.floor(d / 28) + 1)}-${String((d % 28) + 1).padStart(2, '0')}T09:00:00Z`;
const F = 'qualifying_pct_sanitary';

const ev = (over: Partial<RecordInput> = {}): RecordInput => ({
  job_id: 'J1', surveyor_id: 'sv-1', field_id: F, context: CTX,
  prefilled_value: 65, prefill_origin: 'PLATFORM_DEFAULT', final_value: 65,
  at: AT(1), anchor_verdict: 'CLEAN', ...over,
});

/** n untouched platform-default acceptances. */
function fill(store: OverrideStore, n: number, over: Partial<RecordInput> = {}) {
  for (let i = 0; i < n; i++) store.record(ev({ job_id: `J${i}`, at: AT(i), ...over }));
}

/* ------------------------------------------------------------------ */

test('C1 outcome classification splits on the field materiality threshold', () => {
  const spec = fieldSpec(F);
  assert.equal(spec.materiality, 0.10);
  assert.equal(classifyOutcome(spec, 65, 65).outcome, 'UNTOUCHED');
  assert.equal(classifyOutcome(spec, 65, 68).outcome, 'ADJUSTED');   // +4.6%
  assert.equal(classifyOutcome(spec, 65, 55).outcome, 'REPLACED');   // -15.4%
  assert.ok(Math.abs(classifyOutcome(spec, 65, 55).relative_delta + 0.1538) < 0.001);
});

test('C2 a material override must say why; a small adjustment need not', () => {
  const s = new OverrideStore();
  assert.throws(
    () => s.record(ev({ final_value: 50 })),
    (e: CrmError) => e.code === 'E_REASON_REQUIRED',
  );
  // A 4.6% nudge does not demand a note — mandatory notes on every nudge
  // produce "n/a" and destroy the data.
  assert.equal(s.record(ev({ final_value: 68 })).reason, null);
  assert.equal(
    s.record(ev({ final_value: 50, reason: 'Ward wing has no en-suites; sanitary content well below the default.' })).outcome,
    'REPLACED',
  );
});

test('C3 an override becomes a library entry', () => {
  const s = new OverrideStore();
  const lib = new RateLibrary();
  const e = s.record(ev({ final_value: 52, reason: 'no en-suites' }));
  const entry = lib.learn(e);
  assert.equal(entry.value, 52);
  assert.equal(entry.observations, 1);
  assert.deepEqual(entry.source_jobs, ['J1']);
  assert.equal(lib.get('sv-1', F, CTX)!.value, 52);
});

test('C4 repeating the same figure strengthens the entry rather than duplicating it', () => {
  const s = new OverrideStore();
  const lib = new RateLibrary();
  lib.learn(s.record(ev({ job_id: 'J1', final_value: 52, reason: 'r', at: AT(1) })));
  lib.learn(s.record(ev({ job_id: 'J2', final_value: 52, reason: 'r', at: AT(20) })));
  const entry = lib.get('sv-1', F, CTX)!;
  assert.equal(entry.observations, 2);
  assert.equal(entry.first_set_at, AT(1));
  assert.equal(entry.last_confirmed_at, AT(20));
  assert.deepEqual(entry.source_jobs, ['J1', 'J2']);
});

test('C5 accepting OUR default does not become the surveyor\'s own figure', () => {
  const s = new OverrideStore();
  const lib = new RateLibrary();
  const untouched = s.record(ev());
  assert.equal(untouched.outcome, 'UNTOUCHED');
  assert.throws(() => lib.learn(untouched), (e: CrmError) => e.code === 'E_NOT_AN_OVERRIDE');
  assert.equal(lib.get('sv-1', F, CTX), null, 'nothing was laundered into the library');
});

test('C6 the library is per surveyor and per context', () => {
  const s = new OverrideStore();
  const lib = new RateLibrary();
  lib.learn(s.record(ev({ final_value: 52, reason: 'r' })));
  lib.learn(s.record(ev({ surveyor_id: 'sv-2', final_value: 71, reason: 'r' })));
  lib.learn(s.record(ev({ context: { sector: 'DENTAL', region: 'Wales' }, final_value: 80, reason: 'r' })));
  assert.equal(lib.get('sv-1', F, CTX)!.value, 52);
  assert.equal(lib.get('sv-2', F, CTX)!.value, 71);
  assert.equal(lib.get('sv-1', F, { sector: 'DENTAL', region: 'Wales' })!.value, 80);
  assert.equal(lib.forSurveyor('sv-1').length, 2);
});

test('C7 the library figure is proposed back on the next job, labelled as THEIRS', () => {
  const s = new OverrideStore();
  const lib = new RateLibrary();
  lib.learn(s.record(ev({ job_id: 'J7', final_value: 52, reason: 'no en-suites', at: AT(1) })));
  const defaults: PlatformDefaults = () => 65;
  const p = propose(lib, defaults, 'sv-1', F, CTX, AT(15))!;
  assert.equal(p.value, 52);
  assert.equal(p.origin, 'SURVEYOR_LIBRARY');
  assert.equal(p.observations, 1);
  assert.match(p.label, /Your figure/);
  assert.match(p.label, /1 observation/);
  assert.match(p.label, /job J7/);
  assert.ok(p.age_days! > 0, 'the age is shown, not hidden');
});

test('C8 with no library entry the platform default is proposed, and says so', () => {
  const lib = new RateLibrary();
  const p = propose(lib, () => 65, 'sv-9', F, CTX, AT(1))!;
  assert.equal(p.origin, 'PLATFORM_DEFAULT');
  assert.equal(p.value, 65);
  assert.match(p.label, /Caprebate default/);
  assert.match(p.label, /Not your figure/);
  assert.equal(propose(lib, () => null, 'sv-9', F, CTX, AT(1)), null);
});

/* --- the adoption metric ------------------------------------------- */

test('C9 a rate below the minimum n is not reported at all', () => {
  const s = new OverrideStore();
  fill(s, 4);
  const a = adoption(s, F);
  assert.equal(a.n, 4);
  assert.equal(a.adoption_rate, null, 'four observations is an anecdote, not a rate');
  assert.equal(a.median_signed_delta, null);
  assert.equal(a.verdict, 'INSUFFICIENT_DATA');
  assert.equal(MIN_N_FOR_RATE, 7);
});

test('C10 a clean high-adoption field reads GOOD', () => {
  const s = new OverrideStore();
  fill(s, 8);
  s.record(ev({ job_id: 'J8', final_value: 67 }));
  s.record(ev({ job_id: 'J9', final_value: 63 }));
  const a = adoption(s, F);
  assert.equal(a.n, 10);
  assert.equal(a.untouched, 8);
  assert.equal(a.adjusted, 2);
  assert.equal(a.adoption_rate, 0.8);
  assert.equal(a.verdict, 'GOOD');
});

test('C11 THE HONESTY RULE: accepting the surveyor\'s OWN figure does not count as adoption', () => {
  const s = new OverrideStore();
  fill(s, 6, { prefill_origin: 'SURVEYOR_LIBRARY' });
  const a = adoption(s, F);
  assert.equal(a.n, 0, 'none of it is evidence about our estimate');
  assert.equal(a.excluded_not_platform_default, 6);
  assert.equal(a.verdict, 'INSUFFICIENT_DATA');
  assert.equal(CALIBRATION_ORIGIN, 'PLATFORM_DEFAULT');
});

test('C12 self-consistency is reported separately, and says nothing about our estimates', () => {
  const s = new OverrideStore();
  fill(s, 7, { prefill_origin: 'SURVEYOR_LIBRARY' });
  const sc = selfConsistency(s, 'sv-1');
  assert.equal(sc.n, 7);
  assert.equal(sc.untouched, 7);
  assert.equal(sc.rate, 1);
  assert.equal(adoption(s, F).adoption_rate, null, 'and it did not leak into adoption');
});

test('C13 an anchor-EXPOSED job is excluded — the surveyor had already seen our estimate', () => {
  const s = new OverrideStore();
  fill(s, 6);
  fill(s, 4, { anchor_verdict: 'EXPOSED', job_id: 'X' });
  const a = adoption(s, F);
  assert.equal(a.n, 6, 'only the CLEAN jobs count');
  assert.equal(a.excluded_anchor_exposed, 4);
});

test('C14 DIRECTION is the signal: consistent downward revision reads BIASED_HIGH', () => {
  const s = new OverrideStore();
  // Every surveyor revises our 65 down to about 58 — we are over-estimating.
  for (let i = 0; i < 7; i++) {
    s.record(ev({ job_id: `J${i}`, final_value: 58, reason: 'sanitary content lower than the default assumes' }));
  }
  const a = adoption(s, F);
  assert.equal(a.adoption_rate, 0);
  assert.ok(a.median_signed_delta! < -0.1);
  assert.equal(a.verdict, 'BIASED_HIGH');
});

test('C15 consistent upward revision reads BIASED_LOW', () => {
  const s = new OverrideStore();
  for (let i = 0; i < 7; i++) {
    s.record(ev({ job_id: `J${i}`, final_value: 76, reason: 'more en-suite provision than the default assumes' }));
  }
  assert.equal(adoption(s, F).verdict, 'BIASED_LOW');
});

test('C16 symmetric overrides read UNBIASED_IMPRECISE, not BIASED — a different problem', () => {
  const s = new OverrideStore();
  // Scattered both ways, centre right, spread wide. Adoption is poor but the
  // central estimate is not wrong.
  const finals = [59, 71, 60, 70, 61, 69, 65];
  finals.forEach((v, i) => s.record(ev({ job_id: `J${i}`, final_value: v, reason: 'r' })));
  const a = adoption(s, F);
  assert.ok(a.adoption_rate! < ADOPTION_GOOD);
  assert.ok(Math.abs(a.median_signed_delta!) <= BIAS_THRESHOLD);
  assert.equal(a.verdict, 'UNBIASED_IMPRECISE');
});

test('C17 adoption can be scoped to one surveyor', () => {
  const s = new OverrideStore();
  fill(s, 7, { surveyor_id: 'sv-1' });
  for (let i = 0; i < 7; i++) s.record(ev({ job_id: `K${i}`, surveyor_id: 'sv-2', final_value: 50, reason: 'r' }));
  assert.equal(adoption(s, F, { surveyor_id: 'sv-1' }).adoption_rate, 1);
  assert.equal(adoption(s, F, { surveyor_id: 'sv-2' }).adoption_rate, 0);
  assert.equal(adoption(s, F).scope, 'ALL_SURVEYORS');
  assert.equal(adoption(s, F).n, 14);
});

/* --- divergence ----------------------------------------------------- */

test('C18 a surveyor who disagrees with the cohort is surfaced, without a verdict on them', () => {
  const s = new OverrideStore();
  // Cohort leaves it alone; sv-9 always cuts it hard.
  for (let i = 0; i < 8; i++) s.record(ev({ job_id: `J${i}`, surveyor_id: `sv-${i}` }));
  for (let i = 0; i < 3; i++) s.record(ev({ job_id: `D${i}`, surveyor_id: 'sv-9', final_value: 50, reason: 'r' }));
  const d = divergences(s, F);
  assert.equal(d.length, 1);
  assert.equal(d[0].surveyor_id, 'sv-9');
  assert.equal(d[0].cohort_median_delta, 0);
  assert.ok(d[0].surveyor_median_delta < -0.2);
  assert.match(d[0].note, /they may be right/);
});

test('C19 a surveyor with fewer than three observations is not called divergent', () => {
  const s = new OverrideStore();
  for (let i = 0; i < 8; i++) s.record(ev({ job_id: `J${i}`, surveyor_id: `sv-${i}` }));
  s.record(ev({ job_id: 'D1', surveyor_id: 'sv-9', final_value: 20, reason: 'r' }));
  assert.equal(divergences(s, F).length, 0);
});

/* --- the calibration feed -------------------------------------------- */

test('C20 the feed separates what can be said from what is still waiting for data', () => {
  const s = new OverrideStore();
  fill(s, 8);
  const feed = calibrationFeed(s, AT(20));
  assert.equal(feed.min_n, 7);
  assert.equal(feed.fields.length, RATE_FIELDS.length);
  assert.equal(feed.actionable.length, 1);
  assert.equal(feed.actionable[0].field_id, F);
  assert.equal(feed.awaiting_data.length, RATE_FIELDS.length - 1);
  assert.ok(feed.awaiting_data.includes('prelims_pct'));
});

test('C21 the feed states its own method, including both exclusions', () => {
  const feed = calibrationFeed(new OverrideStore(), AT(1));
  assert.match(feed.method_note, /PLATFORM_DEFAULT/);
  assert.match(feed.method_note, /12830183464/);
  assert.match(feed.method_note, /self-consistency/);
  assert.match(feed.method_note, /Direction/);
});

test('C22 every tracked field has a materiality threshold and a consequence', () => {
  assert.ok(RATE_FIELDS.length >= 8);
  for (const f of RATE_FIELDS) {
    assert.ok(f.materiality > 0 && f.materiality < 1, `${f.field_id} materiality`);
    assert.ok(['APPORTIONMENT', 'TAXONOMY'].includes(f.consequence));
    assert.ok(f.unit.length > 0);
  }
  assert.throws(() => fieldSpec('not_a_field'), (e: CrmError) => e.code === 'E_UNKNOWN_FIELD');
});

test('C23 a non-finite value is refused', () => {
  const s = new OverrideStore();
  assert.throws(() => s.record(ev({ final_value: NaN })), (e: CrmError) => e.code === 'E_BAD_VALUE');
});

test('C24 a change from a zero pre-fill is refused rather than expressed as an infinite delta', () => {
  const s = new OverrideStore();
  assert.throws(
    () => s.record(ev({ prefilled_value: 0, final_value: 10, reason: 'r' })),
    (e: CrmError) => e.code === 'E_ZERO_PREFILL',
  );
});

test('C25 end to end: override, learn, propose back, and the adoption metric stays honest', () => {
  const s = new OverrideStore();
  const lib = new RateLibrary();
  const defaults: PlatformDefaults = () => 65;

  // Job 1: sv-1 sees our default and cuts it.
  const p1 = propose(lib, defaults, 'sv-1', F, CTX, AT(1))!;
  assert.equal(p1.origin, 'PLATFORM_DEFAULT');
  lib.learn(s.record(ev({ job_id: 'J1', prefilled_value: p1.value, final_value: 52, reason: 'no en-suites', at: AT(1) })));

  // Job 2: they now see their own figure, and keep it.
  const p2 = propose(lib, defaults, 'sv-1', F, CTX, AT(30))!;
  assert.equal(p2.origin, 'SURVEYOR_LIBRARY');
  assert.equal(p2.value, 52);
  s.record(ev({ job_id: 'J2', prefill_origin: 'SURVEYOR_LIBRARY', prefilled_value: 52, final_value: 52, at: AT(30) }));

  // The acceptance on job 2 is NOT adoption of our estimate.
  const a = adoption(s, F);
  assert.equal(a.n, 1, 'only job 1 was a platform-default pre-fill');
  assert.equal(a.untouched, 0);
  assert.equal(a.excluded_not_platform_default, 1);
  assert.equal(a.verdict, 'INSUFFICIENT_DATA');

  // Meanwhile the library did its job.
  assert.equal(lib.get('sv-1', F, CTX)!.value, 52);
  assert.equal(selfConsistency(s, 'sv-1').untouched, 1);
});

/* ==================================================================== *
 * D. THE CALIBRATION INSTRUMENT (Phase 52, item 12830166861)
 *
 * The instrument is built empty on purpose. These tests prove the
 * MECHANISM works against synthetic events; no real calibration data
 * exists and none is invented here.
 * ==================================================================== */

const RATE_FIELD_GBP = 'bcis_rate_services';

/* ---- D1-D5: acceptance is not the same as never having looked ------- */

test('D1 a pre-fill the surveyor never opened is recorded as NOT_REVIEWED, not UNTOUCHED', () => {
  const s = new OverrideStore();
  const e = s.record(ev({ reviewed: false }));
  assert.equal(e.outcome, 'NOT_REVIEWED');
  assert.equal(e.relative_delta, 0);
});

test('D2 reviewed defaults to true, so every existing call site is unchanged', () => {
  const s = new OverrideStore();
  assert.equal(s.record(ev()).outcome, 'UNTOUCHED');
  assert.equal(s.record(ev({ job_id: 'J2', reviewed: true })).outcome, 'UNTOUCHED');
});

test('D3 "not reviewed" plus a changed value is a contradiction and is refused', () => {
  const s = new OverrideStore();
  assert.throws(
    () => s.record(ev({ reviewed: false, final_value: 50, reason: 'x' })),
    (err: unknown) => err instanceof CrmError && err.code === 'E_UNREVIEWED_BUT_CHANGED',
  );
});

test('D4 unreviewed pre-fills are counted but kept out of n, so they cannot inflate adoption', () => {
  const s = new OverrideStore();
  fill(s, 7);
  for (let i = 0; i < 3; i++) s.record(ev({ job_id: `U${i}`, at: AT(20 + i), reviewed: false }));
  const a = adoption(s, F);
  assert.equal(a.n, 7);
  assert.equal(a.untouched, 7);
  assert.equal(a.not_reviewed, 3);
  assert.equal(a.adoption_rate, 1);          // 7/7, NOT 10/10
  assert.equal(a.unreviewed_rate, 0.3);
});

test('D5 a field nobody ever opened reports no rate at all rather than a perfect one', () => {
  const s = new OverrideStore();
  for (let i = 0; i < 10; i++) s.record(ev({ job_id: `U${i}`, at: AT(i), reviewed: false }));
  const a = adoption(s, F);
  assert.equal(a.n, 0);
  assert.equal(a.adoption_rate, null);
  assert.equal(a.not_reviewed, 10);
  assert.equal(a.unreviewed_rate, 1);
  assert.equal(a.verdict, 'INSUFFICIENT_DATA');
});

/* ---- D6-D10: drift ------------------------------------------------- */

/** n events on field F whose final value is `pct` — a fixed signed delta from 65. */
function cohortOf(s: OverrideStore, n: number, pct: number, startDay: number) {
  for (let i = 0; i < n; i++) {
    s.record(ev({
      job_id: `D${startDay}-${i}`, at: AT(startDay + i),
      final_value: pct, reason: 'synthetic drift fixture',
    }));
  }
}

test('D6 drift below three complete cohorts says so rather than reporting stability', () => {
  const s = new OverrideStore();
  fill(s, DRIFT_COHORT_SIZE * 2);
  const d = drift(s, F);
  assert.equal(d.cohorts.length, 2);
  assert.equal(d.verdict, 'INSUFFICIENT_DATA');
  assert.equal(d.delta_shift, null);
  assert.match(d.note, /not yet measurable/);
});

test('D7 a stable field reports STABLE', () => {
  const s = new OverrideStore();
  fill(s, DRIFT_COHORT_SIZE * 3);
  const d = drift(s, F);
  assert.equal(d.cohorts.length, 3);
  assert.equal(d.verdict, 'STABLE');
  assert.equal(d.delta_shift, 0);
});

test('D8 a crossover that a pooled median hides is caught by the cohort series', () => {
  const s = new OverrideStore();
  cohortOf(s, DRIFT_COHORT_SIZE, 55, 1);    // early: revised well DOWN from 65
  cohortOf(s, DRIFT_COHORT_SIZE, 65, 10);   // middle: accepted
  cohortOf(s, DRIFT_COHORT_SIZE, 75, 19);   // late:  revised well UP

  // The pooled snapshot looks perfectly calibrated.
  const a = adoption(s, F);
  assert.equal(a.median_signed_delta, 0, 'the pooled median hides the crossover');

  // The cohort series does not.
  const d = drift(s, F);
  assert.equal(d.verdict, 'DRIFTING_LOW', 'surveyors revise our figure upward more than they used to');
  assert.ok(d.delta_shift !== null && d.delta_shift > DRIFT_THRESHOLD);
  assert.match(d.note, /pooled adoption figure will understate/);
});

test('D9 drift ignores unreviewed events and orders by the event date, not insertion order', () => {
  const s = new OverrideStore();
  // Recorded late-first, so insertion order and date order disagree.
  cohortOf(s, DRIFT_COHORT_SIZE, 75, 19);
  cohortOf(s, DRIFT_COHORT_SIZE, 65, 10);
  cohortOf(s, DRIFT_COHORT_SIZE, 55, 1);
  s.record(ev({ job_id: 'NR', at: AT(2), reviewed: false }));

  const d = drift(s, F);
  assert.equal(d.cohorts.length, 3, 'the unreviewed event is excluded, so 12 usable remain');
  assert.equal(d.discarded_tail, 0);
  assert.ok(d.cohorts[0].median_signed_delta < d.cohorts[2].median_signed_delta,
    'cohorts are in date order despite reverse insertion');
  assert.equal(d.verdict, 'DRIFTING_LOW');
});

test('D10 an incomplete trailing cohort is dropped and the drop is counted', () => {
  const s = new OverrideStore();
  fill(s, DRIFT_COHORT_SIZE * 3 + 2);
  const d = drift(s, F);
  assert.equal(d.cohorts.length, 3);
  assert.equal(d.discarded_tail, 2);
});

/* ---- D11-D19: the blank-field control ------------------------------ */

test('D11 control assignment is deterministic and reconstructable from the job id', () => {
  const a = isBlankControl('JOB-123', F);
  assert.equal(isBlankControl('JOB-123', F), a);
  assert.equal(isBlankControl('JOB-123', F), a);
});

test('D12 a job can be a control for one field and not another', () => {
  const jobs = Array.from({ length: 300 }, (_, i) => `JOB-${i}`);
  const differs = jobs.some((j) => isBlankControl(j, F) !== isBlankControl(j, RATE_FIELD_GBP));
  assert.equal(differs, true);
});

test('D13 the control arm is roughly one in ten, not one in two and not never', () => {
  const n = 5000;
  let hits = 0;
  for (let i = 0; i < n; i++) if (isBlankControl(`JOB-${i}`, F)) hits++;
  const rate = hits / n;
  // Wide band on purpose: this asserts the mechanism is a ~1-in-10 sampler,
  // not that a hash achieves an exact rate.
  assert.ok(rate > 0.05 && rate < 0.16, `control rate was ${rate}`);
});

test('D14 a nonsensical control rate is refused rather than silently accepted', () => {
  assert.throws(
    () => isBlankControl('J', F, 1),
    (err: unknown) => err instanceof CrmError && err.code === 'E_BAD_CONTROL_RATE',
  );
  assert.throws(() => isBlankControl('J', F, 2.5), (e: unknown) => e instanceof CrmError);
});

test('D15 a control observation from an anchored job is refused — it is not a control', () => {
  const c = new ControlStore();
  assert.throws(
    () => c.record({ job_id: 'J1', surveyor_id: 'sv-9', field_id: F, context: CTX, value: 60, at: AT(1), anchor_verdict: 'EXPOSED' }),
    (err: unknown) => err instanceof CrmError && err.code === 'E_CONTROL_NOT_CLEAN',
  );
});

test('D16 an unanchored population landing far from the pre-filled one retires the pre-fill', () => {
  const s = new OverrideStore();
  const c = new ControlStore();
  fill(s, 7);                                   // anchored arm sits at 65
  for (let i = 0; i < 4; i++) {
    c.record({ job_id: `C${i}`, surveyor_id: `sv-${i}`, field_id: F, context: CTX, value: 50, at: AT(i), anchor_verdict: 'CLEAN' });
  }
  const r = blankControlComparison(s, c, F);
  assert.equal(r.prefilled_median, 65);
  assert.equal(r.control_median, 50);
  assert.equal(r.gap, -15);
  assert.equal(r.verdict, 'RETIRE_PREFILL');
  assert.match(r.note, /measuring the anchor/);
});

test('D17 an unanchored population landing close to the pre-filled one supports it', () => {
  const s = new OverrideStore();
  const c = new ControlStore();
  fill(s, 7);
  for (let i = 0; i < 4; i++) {
    c.record({ job_id: `C${i}`, surveyor_id: `sv-${i}`, field_id: F, context: CTX, value: 66, at: AT(i), anchor_verdict: 'CLEAN' });
  }
  const r = blankControlComparison(s, c, F);
  assert.equal(r.gap, 1);
  assert.equal(r.verdict, 'PREFILL_SUPPORTED');
});

test('D18 a thin arm reports INSUFFICIENT_DATA rather than a verdict on two observations', () => {
  const s = new OverrideStore();
  const c = new ControlStore();
  fill(s, 7);
  c.record({ job_id: 'C0', surveyor_id: 'sv-0', field_id: F, context: CTX, value: 50, at: AT(1), anchor_verdict: 'CLEAN' });
  const r = blankControlComparison(s, c, F);
  assert.equal(r.verdict, 'INSUFFICIENT_DATA');
  assert.equal(r.control_n, 1);
});

test('D19 a GBP/m2 field more than the 10% test limit apart is FLAGGED FOR REVIEW, never retired (Phase 153e, Word question 149)', () => {
  const s = new OverrideStore();
  const c = new ControlStore();
  for (let i = 0; i < 7; i++) {
    s.record(ev({ job_id: `G${i}`, at: AT(i), field_id: RATE_FIELD_GBP, prefilled_value: 400, final_value: 400 }));
  }
  for (let i = 0; i < 4; i++) {
    c.record({ job_id: `CG${i}`, surveyor_id: `sv-${i}`, field_id: RATE_FIELD_GBP, context: CTX, value: 450, at: AT(i), anchor_verdict: 'CLEAN' });
  }
  const r = blankControlComparison(s, c, RATE_FIELD_GBP);
  assert.equal(r.unit, 'GBP/m2');
  assert.equal(r.gap, 50);
  assert.equal(r.verdict, 'FLAG_FOR_REVIEW', '£450 against £400 is 12.5% apart');
  assert.match(r.note, /flagged for review, not a fail/);
  assert.equal(BLANK_CONTROL_RELATIVE_LIMIT_GBP_M2, 0.10);
});

test('D19b a GBP/m2 field within 10% is within the test limit (Phase 153e)', () => {
  const s = new OverrideStore();
  const c = new ControlStore();
  for (let i = 0; i < 7; i++) {
    s.record(ev({ job_id: `H${i}`, at: AT(i), field_id: RATE_FIELD_GBP, prefilled_value: 400, final_value: 400 }));
  }
  for (let i = 0; i < 4; i++) {
    c.record({ job_id: `CH${i}`, surveyor_id: `sv-${i}`, field_id: RATE_FIELD_GBP, context: CTX, value: 430, at: AT(i), anchor_verdict: 'CLEAN' });
  }
  const r = blankControlComparison(s, c, RATE_FIELD_GBP);
  assert.equal(r.verdict, 'WITHIN_TEST_LIMIT', '£430 against £400 is 7.5% apart');
});

/* ---- D20-D24: the assembled instrument ----------------------------- */

test('D20 the instrument built over nothing reports empty, not healthy', () => {
  const i = calibrationInstrument(new OverrideStore(), new ControlStore(), AT(1));
  assert.equal(i.empty, true);
  assert.equal(i.feed.actionable.length, 0);
  assert.equal(i.feed.awaiting_data.length, RATE_FIELDS.length);
  assert.ok(i.drift.every((d) => d.verdict === 'INSUFFICIENT_DATA'));
  assert.ok(i.controls.every((c) => c.verdict === 'INSUFFICIENT_DATA'));
});

test('D21 the instrument stamps which of the two adoption meanings is being measured', () => {
  const i = calibrationInstrument(new OverrideStore(), new ControlStore(), AT(1));
  assert.equal(i.mode, 'CROSS_SURVEYOR');
  assert.equal(CALIBRATION_MODE, 'CROSS_SURVEYOR');
  assert.match(i.method_note, /cannot be told apart afterwards/);
});

test('D22 the instrument covers every tracked rate field, not a sample', () => {
  const i = calibrationInstrument(new OverrideStore(), new ControlStore(), AT(1));
  assert.equal(i.drift.length, RATE_FIELDS.length);
  assert.equal(i.controls.length, RATE_FIELDS.length);
  assert.equal(i.feed.fields.length, RATE_FIELDS.length);
});

test('D23 one usable observation is enough to stop the instrument reading empty', () => {
  const s = new OverrideStore();
  s.record(ev());
  assert.equal(calibrationInstrument(s, new ControlStore(), AT(1)).empty, false);
});

test('D24 an unreviewed-only store still reads empty — silence is not data', () => {
  const s = new OverrideStore();
  s.record(ev({ reviewed: false }));
  assert.equal(calibrationInstrument(s, new ControlStore(), AT(1)).empty, true);
});

/* ================================================================== *
 * PHASE 107a — NOTHING_PROPOSED: the origin for an empty box
 *
 * Found by building the surveyor workspace. Caprebate holds no platform
 * default rates, so a surveyor's first figure for a field is always typed
 * into a blank — and until this origin existed the only thing that could be
 * recorded was PLATFORM_DEFAULT + UNTOUCHED, which is false, and which
 * `learn` correctly refuses. The library could never acquire a first entry.
 *
 * THE TESTS BELOW ARE IN TWO HALVES and both halves matter. The first proves
 * the new value does what it is for. The second proves it did NOT weaken the
 * guard it sits beside — an origin that let a platform default into a
 * surveyor's library would be far worse than the bug it fixes.
 * ================================================================== */

test('C30 a figure typed into an empty box IS learned — the library can now start', () => {
  const lib = new RateLibrary();
  const s = new OverrideStore();
  const e = s.record(ev({
    prefill_origin: 'NOTHING_PROPOSED', prefilled_value: 42, final_value: 42,
  }));
  assert.equal(e.outcome, 'UNTOUCHED', 'nothing was touched because nothing was there');
  const entry = lib.learn(e);
  assert.equal(entry.value, 42);
  assert.equal(entry.observations, 1);
});

test('C31 and it comes back on the next job, labelled as THEIRS rather than ours', () => {
  const lib = new RateLibrary();
  const s = new OverrideStore();
  lib.learn(s.record(ev({ prefill_origin: 'NOTHING_PROPOSED', prefilled_value: 42, final_value: 42 })));

  // No platform defaults exist in this build; the proposal must come from the library.
  const none: PlatformDefaults = () => null;
  const p = propose(lib, none, 'sv-1', F, CTX, AT(2));
  assert.notEqual(p, null, 'the surveyor was offered nothing on their second job');
  assert.equal(p!.value, 42);
  assert.equal(p!.origin, 'SURVEYOR_LIBRARY', 'their own figure is labelled as theirs');
  assert.match(p!.label, /Your figure/);
});

test('C32 THE GUARD STILL HOLDS — an untouched platform default is still refused', () => {
  const lib = new RateLibrary();
  const s = new OverrideStore();
  const ourDefault = s.record(ev({ prefill_origin: 'PLATFORM_DEFAULT', prefilled_value: 65, final_value: 65 }));
  assert.throws(() => lib.learn(ourDefault), (err: unknown) => {
    assert.ok(err instanceof CrmError);
    assert.equal(err.code, 'E_NOT_AN_OVERRIDE');
    return true;
  }, 'accepting OUR default must never become THEIR library entry');

  // And the other two "ours" origins are refused on the same reasoning.
  for (const origin of ['SECTOR_BENCHMARK', 'PRIOR_JOB_SAME_PROPERTY'] as const) {
    const e = s.record(ev({ job_id: `J-${origin}`, prefill_origin: origin, prefilled_value: 65, final_value: 65 }));
    assert.throws(() => lib.learn(e), CrmError, `${origin} was laundered into the library`);
  }
});

test('C33 adoption EXCLUDES it and counts it on its own line, not merged with the others', () => {
  const s = new OverrideStore();
  fill(s, 5, { prefill_origin: 'NOTHING_PROPOSED', prefilled_value: 42, final_value: 42 });
  fill(s, 3, { job_id: 'L', prefill_origin: 'SURVEYOR_LIBRARY' });

  const a = adoption(s, F);
  assert.equal(a.n, 0, 'an empty box is evidence about our estimate in neither direction');
  assert.equal(a.excluded_nothing_proposed, 5);
  assert.equal(a.excluded_not_platform_default, 3, 'the two exclusions must not be merged');
  assert.equal(a.adoption_rate, null);
  assert.equal(a.verdict, 'INSUFFICIENT_DATA');
});

test('C34 self-consistency, drift and divergence all exclude it too', () => {
  const s = new OverrideStore();
  fill(s, 12, { prefill_origin: 'NOTHING_PROPOSED', prefilled_value: 42, final_value: 42 });

  assert.equal(selfConsistency(s, 'sv-1').n, 0, 'accepting nothing is not accepting your own figure');

  // Twelve events is three full cohorts at DRIFT_COHORT_SIZE 4 — enough for a
  // verdict if any of them counted. None does.
  const d = drift(s, F);
  assert.deepEqual(d.cohorts, [], 'drift is measured on OUR pre-fills only');
  assert.equal(d.delta_shift, null);
  assert.equal(d.verdict, 'INSUFFICIENT_DATA');

  assert.deepEqual(divergences(s, F), [], 'divergence compares surveyors against a cohort of our pre-fills');
});

test('C35 a NOTHING_PROPOSED figure that is later overridden behaves like any other override', () => {
  const lib = new RateLibrary();
  const s = new OverrideStore();
  lib.learn(s.record(ev({ prefill_origin: 'NOTHING_PROPOSED', prefilled_value: 42, final_value: 42 })));

  // Second job: they are shown their own 42 and move it materially. A reason is required.
  const moved = s.record(ev({
    job_id: 'J2', prefill_origin: 'SURVEYOR_LIBRARY', prefilled_value: 42, final_value: 55,
    reason: 'the first job was a refurbishment and this one is a new build', at: AT(2),
  }));
  assert.equal(moved.outcome, 'REPLACED');
  const entry = lib.learn(moved);
  assert.equal(entry.value, 55);
  assert.equal(entry.observations, 1, 'a different figure starts the count again');
});
