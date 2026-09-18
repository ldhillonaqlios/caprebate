/**
 * Caprebate — Reconciliation Assertion tests. Board item 12830173668.
 * Run:  node --test caprebate-reconciliation-assertion.test.ts
 *
 * GC-03 from the Report Pack is the worked case: purchase £317,000,
 * apportioned base £332,850, qualifying ~£73,740 (22.2%), land ~£104,229.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceRegister, record, type Cell } from './caprebate-source-register.ts';
import {
  assertReconciliation, signCAVR, SignatureBlocked, explainFailure, presentRounded,
  componentFromCell, formatGBP, isBlockingAt, STAGE_POLICY,
  GATE_TOLERANCE_PENCE, PRESENTATION_MAX_RESIDUAL_PENCE, OVERRIDE_AVAILABLE, OVERRIDE_RATIONALE,
  AssertionInputError,
  type Apportionment, type Component, type Evidence, type Adjustment, type BlockEvent,
} from './caprebate-reconciliation-assertion.ts';

const NOW = '2026-08-26T12:00:00Z';
const P = (pounds: number, pence = 0) => pounds * 100 + pence;

const ev = (publisher: string, locator: string): Evidence => ({
  publisher, locator, retrieved_at: '2026-08-20T09:00:00Z', grade: 'D',
});

const comp = (label: string, amount: number, publisher = 'Caprebate (chartered surveyor)', locator = 'CAVR build-up v2'): Component => ({
  label, amount, evidence: ev(publisher, locator),
});

/** GC-03. Land 104,229 + qualifying 73,740 => building is the balance of the base. */
const GC03_BASE = P(332_850);
const GC03_A = P(73_740);
const GC03_C = P(104_229);
const GC03_B = GC03_BASE - GC03_A - GC03_C; // 154,881

const gc03 = (over: Partial<Apportionment> = {}): Apportionment => ({
  job_id: 'GC-03',
  consideration: comp('Consideration paid', P(317_000), 'HM Land Registry', 'PPD tx / SPA cl.3'),
  adjustments: [
    {
      kind: 'ACQUISITION_LEGAL_FEES', amount: P(9_510), narrative: 'Capitalised conveyancing on acquisition',
      evidence: ev('Client', 'completion statement p2'),
    },
    {
      kind: 'SDLT_CAPITALISED', amount: P(6_340), narrative: 'SDLT on the transfer',
      evidence: ev('Client', 'SDLT5 certificate'),
    },
  ],
  base: comp('Apportionment base', GC03_BASE),
  A_qualifying_plant: comp('A', GC03_A),
  B_building_non_qualifying: comp('B', GC03_B),
  C_bare_land: comp('C', GC03_C),
  s198: { validity: 'NONE', fixtures_amount: null, evidence: null },
  ...over,
});

/* ------------------------------------------------------------------ */

test('S1 the tolerance is zero', () => {
  assert.equal(GATE_TOLERANCE_PENCE, 0);
});

test('S2 a clean GC-03 apportionment passes all three assertions', () => {
  const r = assertReconciliation(gc03(), NOW);
  assert.equal(r.passed, true);
  assert.equal(r.failures.length, 0);
  // sanity: the adjustments really do bridge 317,000 to 332,850
  assert.equal(P(317_000) + P(9_510) + P(6_340), GC03_BASE);
});

test('S3 AS-1 — one penny out blocks. There is no rounding slack in the gate', () => {
  const a = gc03({ C_bare_land: comp('C', GC03_C + 1) });
  const r = assertReconciliation(a, NOW);
  assert.equal(r.passed, false);
  const f = r.failures.find((x) => x.id === 'AS-1')!;
  assert.equal(f.discrepancy, 1);
  assert.equal(f.direction, 'OVER_APPORTIONED');
  assert.match(f.statement, /over by £0\.01/);
});

test('S4 AS-1 — an under-apportionment is caught in the same way', () => {
  const a = gc03({ A_qualifying_plant: comp('A', GC03_A - P(2_500)) });
  const f = assertReconciliation(a, NOW).failures.find((x) => x.id === 'AS-1')!;
  assert.equal(f.discrepancy, -P(2_500));
  assert.equal(f.direction, 'UNDER_APPORTIONED');
});

test('S5 AS-1 names every component with its own source, not just the total', () => {
  const a = gc03({ B_building_non_qualifying: comp('B', GC03_B + P(1_000)) });
  const f = assertReconciliation(a, NOW).failures.find((x) => x.id === 'AS-1')!;
  assert.equal(f.lines.length, 4);
  assert.ok(f.lines.every((l) => l.source.includes('retrieved') && l.source.includes('grade')));
  assert.ok(f.likely_causes.length >= 4);
});

test('S6 AS-2 — an unexplained gap between price paid and base blocks', () => {
  // Base stated at 332,850 but only the legal fees itemised: 6,340 unexplained.
  const a = gc03({ adjustments: [gc03().adjustments[0]] });
  const r = assertReconciliation(a, NOW);
  assert.equal(r.passed, false);
  const f = r.failures.find((x) => x.id === 'AS-2')!;
  assert.equal(f.discrepancy, P(6_340));
  assert.match(f.statement, /must be a named, evidenced adjustment/);
});

test('S7 AS-2 — chattels inside the consideration must be deducted, not ignored', () => {
  const chattels: Adjustment = {
    kind: 'CHATTELS_EXCLUDED', amount: -P(12_000), narrative: 'Loose furniture and equipment per the inventory',
    evidence: ev('Client', 'SPA schedule 4'),
  };
  // Adding the deduction without moving the base makes the base wrong by 12,000.
  const a = gc03({ adjustments: [...gc03().adjustments, chattels] });
  const f = assertReconciliation(a, NOW).failures.find((x) => x.id === 'AS-2')!;
  assert.equal(f.discrepancy, P(12_000));
  // Correcting the base clears it.
  const fixed = gc03({ adjustments: [...gc03().adjustments, chattels], base: comp('Apportionment base', GC03_BASE - P(12_000)), B_building_non_qualifying: comp('B', GC03_B - P(12_000)) });
  assert.equal(assertReconciliation(fixed, NOW).passed, true);
});

test('S8 AS-3 — a valid s.198 election governs A (I-15)', () => {
  const a = gc03({
    s198: {
      validity: 'VALID_EVIDENCED', fixtures_amount: P(60_000),
      evidence: ev('Client', 's.198 election signed 12 Jun 2019, both parties'),
    },
  });
  const f = assertReconciliation(a, NOW).failures.find((x) => x.id === 'AS-3')!;
  assert.equal(f.discrepancy, GC03_A - P(60_000));
  assert.match(f.statement, /the pool split comes off the election/);
});

test('S9 AS-3 — an ASSERTED but unevidenced election does not engage the check (I-15)', () => {
  const a = gc03({
    s198: { validity: 'ASSERTED_UNEVIDENCED', fixtures_amount: P(60_000), evidence: null },
  });
  const r = assertReconciliation(a, NOW);
  assert.equal(r.failures.some((x) => x.id === 'AS-3'), false);
  assert.equal(r.passed, true);
});

test('S10 a VALID_EVIDENCED election with no figure is an input error, not a silent pass', () => {
  const a = gc03({ s198: { validity: 'VALID_EVIDENCED', fixtures_amount: null, evidence: ev('Client', 'election') } });
  assert.throws(() => assertReconciliation(a, NOW), (e: AssertionInputError) => e.code === 'E_ELECTION_NO_FIGURE');
});

test('S11 signature is BLOCKED, not warned — signCAVR throws', () => {
  const a = gc03({ C_bare_land: comp('C', GC03_C + P(500)) });
  assert.throws(
    () => signCAVR({ apportionment: a, signed_by: 'A Surveyor', rics_number: '1234567', now: NOW }),
    (e: SignatureBlocked) => e.code === 'E_SIGNATURE_BLOCKED' && e.result.failures[0].id === 'AS-1',
  );
});

test('S12 there is no code path from an apportionment to a signature that skips the check', () => {
  // signCAVR is the only producer of SignedCAVR, and it calls assertReconciliation first.
  const good = signCAVR({ apportionment: gc03(), signed_by: 'A Surveyor', rics_number: '1234567', now: NOW });
  assert.equal(good.assertion.passed, true);
  assert.equal(good.job_id, 'GC-03');
  assert.equal(good.signed_at, NOW);
  // The signature carries the assertion result, so the CAVR is self-evidencing.
  assert.equal(good.assertion.checked_at, NOW);
});

test('S13 every blocked attempt is recorded — the log is the evidence the gate held', () => {
  const events: BlockEvent[] = [];
  const a = gc03({ A_qualifying_plant: comp('A', GC03_A + P(9_000)) });
  assert.throws(() =>
    signCAVR({
      apportionment: a, signed_by: 'A Surveyor', rics_number: '1234567', now: NOW,
      onBlocked: (e) => events.push(e),
    }),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].job_id, 'GC-03');
  assert.equal(events[0].attempted_by, 'A Surveyor');
  assert.equal(events[0].blocked_at, NOW);
  assert.deepEqual(events[0].failures, [{ id: 'AS-1', discrepancy: P(9_000) }]);
});

test('S14 there is no override, and the constant carries the reason', () => {
  assert.equal(OVERRIDE_AVAILABLE, false);
  assert.match(OVERRIDE_RATIONALE, /arithmetic, not judgement/);
  assert.match(OVERRIDE_RATIONALE, /disclosable/);
});

test('S15 the surveyor sees a statement, sourced lines and ranked causes — not "validation error"', () => {
  const a = gc03({ C_bare_land: comp('C', GC03_C - P(1_750)) });
  const text = explainFailure(assertReconciliation(a, NOW));
  assert.match(text, /^SIGNATURE BLOCKED/);
  assert.match(text, /There is no override/);
  assert.match(text, /£1,750\.00/);
  assert.match(text, /HM Land Registry|Caprebate \(chartered surveyor\)/);
  assert.match(text, /Most likely causes, in the order worth checking/);
  assert.match(text, /change the figures — do not absorb the difference/);
  assert.ok(text.split('\n').length > 15);
});

test('S16 a passing assertion says so plainly', () => {
  assert.match(explainFailure(assertReconciliation(gc03(), NOW)), /Reconciliation passed/);
});

test('S17 presentation rounding is allocated to the largest component and stated', () => {
  // Exact pence that do not round cleanly: base 332,850.00; A/B/C carry odd pence.
  const a = gc03({
    base: comp('Apportionment base', P(332_850)),
    A_qualifying_plant: comp('A', P(73_740, 33)),
    C_bare_land: comp('C', P(104_229, 33)),
    B_building_non_qualifying: comp('B', P(332_850) - P(73_740, 33) - P(104_229, 33)),
  });
  assert.equal(assertReconciliation(a, NOW).passed, true, 'exact in pence');
  const p = presentRounded(a);
  assert.equal(p.A_pounds + p.B_pounds + p.C_pounds, p.base_pounds, 'the printed table must foot');
  assert.equal(p.residual_allocated_to, 'B', 'B is the largest of the three here');
  assert.match(p.footnote, /rounding difference|sum exactly/);
});

test('S18 a zero residual still gets a footnote saying the table foots exactly', () => {
  const p = presentRounded(gc03());
  assert.equal(p.residual_pence, 0);
  assert.equal(p.A_pounds + p.B_pounds + p.C_pounds, p.base_pounds);
  assert.match(p.footnote, /sum exactly to the apportionment base/);
});

test('S19 a residual too large to be rounding is refused, not allocated', () => {
  const a = gc03({ C_bare_land: comp('C', GC03_C + P(400)) });
  assert.throws(
    () => presentRounded(a),
    (e: AssertionInputError) => e.code === 'E_RESIDUAL_TOO_LARGE',
  );
  assert.equal(PRESENTATION_MAX_RESIDUAL_PENCE, 150);
});

test('S20 the check runs five times and blocks from PRE_SIGNATURE onwards', () => {
  assert.equal(STAGE_POLICY.length, 5);
  assert.equal(isBlockingAt('DRAFT_RECOMPUTE'), false);
  assert.equal(isBlockingAt('PRE_REVIEWER'), false);
  assert.equal(isBlockingAt('PRE_SIGNATURE'), true);
  assert.equal(isBlockingAt('REPORT_RENDER'), true);
  assert.equal(isBlockingAt('RELEASE_CHECK'), true);
});

test('S21 money is integer pence; a float is rejected at the door', () => {
  const a = gc03({ A_qualifying_plant: comp('A', 73_740.5) });
  assert.throws(() => assertReconciliation(a, NOW), (e: AssertionInputError) => e.code === 'E_NOT_PENCE');
});

test('S22 an UNKNOWN provenance cell cannot become an apportionment component', () => {
  const reg = new SourceRegister({ clock: () => NOW });
  const c = record<number>(reg, {
    entity_id: 'GC-03', field_id: 'bare_site_value', source_id: 'SURVEYOR',
    retrieval: { retrieved_at: '2026-08-20T09:00:00Z', method: 'SURVEY', locator: 'comparables schedule' },
    unknown: true,
  });
  assert.throws(
    () => componentFromCell('C', c as Cell<number>),
    (e: AssertionInputError) => e.code === 'E_UNKNOWN_COMPONENT',
  );
});

test('S23 a component built from a provenance cell carries its publisher and timestamp into the failure text', () => {
  const reg = new SourceRegister({ clock: () => NOW });
  const cell = record<number>(reg, {
    entity_id: 'GC-03', field_id: 'price_paid', source_id: 'HMLR_PPD',
    retrieval: { retrieved_at: '2026-08-20T09:00:00Z', method: 'API', locator: 'PPD tx 998877' },
    value: P(317_000),
  });
  const consideration = componentFromCell('Consideration paid', cell as Cell<number>);
  assert.equal(consideration.evidence.publisher, 'HM Land Registry');
  assert.equal(consideration.evidence.grade, 'A');

  const a = gc03({ consideration, adjustments: [gc03().adjustments[0]] });
  const text = explainFailure(assertReconciliation(a, NOW));
  assert.match(text, /HM Land Registry — PPD tx 998877 \(retrieved 2026-08-20T09:00:00Z, grade A\)/);
});

test('S24 all three assertions can fail at once and all three are reported', () => {
  const a = gc03({
    adjustments: [],                                        // AS-2: 15,850 unexplained
    C_bare_land: comp('C', GC03_C + P(3_000)),              // AS-1: 3,000 over
    s198: { validity: 'VALID_EVIDENCED', fixtures_amount: P(60_000), evidence: ev('Client', 'election') }, // AS-3
  });
  const r = assertReconciliation(a, NOW);
  assert.equal(r.passed, false);
  assert.deepEqual(r.failures.map((f) => f.id), ['AS-1', 'AS-2', 'AS-3']);
  const text = explainFailure(r);
  assert.match(text, /AS-1/);
  assert.match(text, /AS-2/);
  assert.match(text, /AS-3/);
});

test('S25 formatGBP renders pence honestly, including negatives', () => {
  assert.equal(formatGBP(P(332_850)), '£332,850.00');
  assert.equal(formatGBP(1), '£0.01');
  assert.equal(formatGBP(-P(1_750, 25)), '-£1,750.25');
});
