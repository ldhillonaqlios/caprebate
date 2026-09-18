/**
 * Caprebate — Anchor Quarantine tests. Board item 12830183464.
 * Run:  node --test caprebate-anchor-quarantine.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AnchorLog, AnchorQuarantine, QuarantineError, driftReport, assureProcess,
  hashFigures, verifyChain, QUARANTINED_ROLES, RELEASED_TO_SURVEYOR_ALWAYS,
  type EstimateOutputs, type SurveyorFigures, type Viewer,
} from './caprebate-anchor-quarantine.ts';

const P = (pounds: number) => pounds * 100;

/** A clock that advances one second per call, so ordering in the log is real. */
function tickingClock(startISO = '2026-08-26T09:00:00Z') {
  let t = Date.parse(startISO);
  return () => {
    const s = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
    t += 1000;
    return s;
  };
}

const ESTIMATE: EstimateOutputs = {
  qualifying_expenditure_pence: P(73_740),
  qualifying_pct: 22.2,
  pool_split_main_pence: P(34_075),
  pool_split_special_pence: P(39_665),
  bare_land_pence: P(104_229),
  multiplier: 1.64,
  indicative_lifetime_saving_pence: P(29_500),
};

const SURVEYOR: Viewer = { user_id: 'sv-1', role: 'SURVEYOR' };
const ANALYST: Viewer = { user_id: 'an-1', role: 'ANALYST' };
const CM: Viewer = { user_id: 'cm-1', role: 'CLIENT_MANAGER' };

const FIGURES: SurveyorFigures = {
  A_qualifying_plant_pence: P(68_000),
  B_building_pence: P(160_000),
  C_bare_land_pence: P(104_850),
  qualifying_pct: 20.4,
};

function setup(job = 'GC-03') {
  const log = new AnchorLog();
  const q = new AnchorQuarantine({ job_id: job, estimate: ESTIMATE, log, clock: tickingClock(), sealed_by: 'an-1' });
  q.assignSurveyor('sv-1', 'an-1');
  return { log, q };
}

/* ------------------------------------------------------------------ */

test('A1 only the surveyor is quarantined', () => {
  assert.deepEqual(QUARANTINED_ROLES, ['SURVEYOR']);
});

test('A2 the surveyor cannot read the estimate before committing', () => {
  const { q } = setup();
  assert.throws(() => q.openEstimate(SURVEYOR), (e: QuarantineError) => e.code === 'E_QUARANTINED');
});

test('A3 everyone else can read it at any time — the estimate is not a secret', () => {
  const { q } = setup();
  assert.equal(q.openEstimate(ANALYST).qualifying_pct, 22.2);
  assert.equal(q.openEstimate(CM).qualifying_expenditure_pence, P(73_740));
});

test('A4 there is no getter: the estimate is not reachable by any other route', () => {
  const { q } = setup();
  // No public field holds it; only the hash is exposed while sealed.
  assert.equal(Object.values(q).includes(ESTIMATE), false);
  assert.equal(typeof q.estimateHash(), 'string');
  assert.equal(q.estimateHash().length, 64);
  assert.throws(() => q.estimateForAnalysis(), (e: QuarantineError) => e.code === 'E_QUARANTINED');
});

test('A5 a denied attempt is logged — the attempt is evidence in its own right', () => {
  const { log, q } = setup();
  assert.throws(() => q.openEstimate(SURVEYOR));
  assert.throws(() => q.openEstimate(SURVEYOR));
  const denied = log.of('GC-03').filter((e) => e.kind === 'ACCESS_DENIED');
  assert.equal(denied.length, 2);
  assert.equal(denied[0].actor, 'sv-1');
  assert.equal(assureProcess(log, 'GC-03').denied_attempts, 2);
});

test('A6 the seal log records the estimate hash, never the figures — the log must not leak the anchor', () => {
  const { log } = setup();
  const sealed = log.of('GC-03').find((e) => e.kind === 'ESTIMATE_SEALED')!;
  assert.equal(typeof sealed.detail.estimate_hash, 'string');
  const asText = JSON.stringify(log.of('GC-03'));
  assert.equal(asText.includes('7374000'), false, 'the qualifying figure must not appear in the log');
  assert.equal(asText.includes('22.2'), false, 'nor the qualifying percentage');
});

test('A7 commitment releases automatically — there is no separate release action to lobby for', () => {
  const { q } = setup();
  const c = q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'BCIS elemental build-up, measured GIA 1,287.5 m2' });
  assert.equal(q.state, 'COMMITTED_AND_RELEASED');
  assert.ok(q.released_at);
  assert.equal(c.hash, hashFigures(FIGURES));
  assert.equal(q.openEstimate(SURVEYOR).qualifying_pct, 22.2);
});

test('A8 the release is logged with a timestamp and the estimate hash', () => {
  const { log, q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'build-up v1' });
  const rel = log.of('GC-03').find((e) => e.kind === 'RELEASED')!;
  assert.ok(rel.at.endsWith('Z'));
  assert.equal(rel.detail.trigger, 'commitment recorded');
  assert.equal(rel.detail.estimate_hash, q.estimateHash());
  assert.equal(rel.detail.surveyor_id, 'sv-1');
});

test('A9 release strictly follows commitment in the log', () => {
  const { log, q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'build-up v1' });
  const es = log.of('GC-03');
  const ci = es.findIndex((e) => e.kind === 'COMMITMENT_RECORDED');
  const ri = es.findIndex((e) => e.kind === 'RELEASED');
  assert.ok(ci >= 0 && ri > ci);
  assert.ok(es[ri].at >= es[ci].at);
});

test('A10 a commitment with no stated method is refused', () => {
  const { q } = setup();
  assert.throws(
    () => q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: '   ' }),
    (e: QuarantineError) => e.code === 'E_NO_METHOD',
  );
  assert.equal(q.state, 'SEALED', 'a failed commitment must not release');
});

test('A11 a surveyor cannot commit a job assigned to someone else', () => {
  const { q } = setup();
  assert.throws(
    () => q.commit({ surveyor_id: 'sv-2', figures: FIGURES, method_note: 'x' }),
    (e: QuarantineError) => e.code === 'E_WRONG_SURVEYOR',
  );
  assert.equal(q.state, 'SEALED');
});

test('A12 committing twice is refused', () => {
  const { q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  assert.throws(
    () => q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v2' }),
    (e: QuarantineError) => e.code === 'E_ALREADY_COMMITTED',
  );
});

test('A13 committed figures are hashed, so they cannot be quietly rewritten', () => {
  const { log, q } = setup();
  const c = q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  const entry = log.of('GC-03').find((e) => e.kind === 'COMMITMENT_RECORDED')!;
  assert.equal(entry.detail.figures_hash, c.hash);
  assert.notEqual(hashFigures({ ...FIGURES, qualifying_pct: 22.2 }), c.hash);
});

test('A14 the surveyor may amend after release, but must say why', () => {
  const { q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  assert.throws(
    () => q.amend({ surveyor_id: 'sv-1', to: { ...FIGURES, qualifying_pct: 22.0 }, reason: '' }),
    (e: QuarantineError) => e.code === 'E_NO_REASON',
  );
  const a = q.amend({
    surveyor_id: 'sv-1',
    to: { ...FIGURES, A_qualifying_plant_pence: P(71_000), qualifying_pct: 21.3 },
    reason: 'The estimate was built on an O&M manual I had not been given. Re-rated the ventilation element.',
  });
  assert.equal(a.from.A_qualifying_plant_pence, P(68_000));
  assert.equal(a.to.A_qualifying_plant_pence, P(71_000));
  assert.equal(q.finalFigures()!.A_qualifying_plant_pence, P(71_000));
});

test('A15 amending before commitment is refused', () => {
  const { q } = setup();
  assert.throws(
    () => q.amend({ surveyor_id: 'sv-1', to: FIGURES, reason: 'x' }),
    (e: QuarantineError) => e.code === 'E_NOT_COMMITTED',
  );
});

test('A16 the quarantine MEASURES anchoring: drift toward the estimate is visible', () => {
  const { q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  q.amend({
    surveyor_id: 'sv-1',
    to: { ...FIGURES, A_qualifying_plant_pence: P(71_000), qualifying_pct: 21.3 },
    reason: 'ventilation re-rated',
  });
  const d = driftReport(q);
  const a = d.fields.find((f) => f.field === 'A_qualifying_plant_pence')!;
  assert.equal(a.committed, P(68_000));
  assert.equal(a.final, P(71_000));
  assert.equal(a.estimate, P(73_740));
  assert.equal(a.movement, P(3_000));
  assert.equal(a.toward_estimate, true);
  assert.ok(a.gap_closed! > 0.5 && a.gap_closed! < 0.53); // 3,000 of a 5,740 gap
  assert.equal(d.moved_toward_estimate, 2, 'A and the percentage both moved toward it');
});

test('A17 a surveyor who does not move shows no drift', () => {
  const { q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  const d = driftReport(q);
  assert.equal(d.amendments, 0);
  assert.equal(d.moved_toward_estimate, 0);
  assert.ok(d.fields.every((f) => f.movement === 0 && f.toward_estimate === null));
});

test('A18 movement AWAY from the estimate is recorded as such, not as drift', () => {
  const { q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  q.amend({
    surveyor_id: 'sv-1',
    to: { ...FIGURES, A_qualifying_plant_pence: P(64_000) },
    reason: 'Removed the chattels wrongly included in the draft build-up.',
  });
  const a = driftReport(q).fields.find((f) => f.field === 'A_qualifying_plant_pence')!;
  assert.equal(a.toward_estimate, false);
  assert.ok(a.gap_closed! < 0);
});

test('A19 the log is hash-chained and verifies', () => {
  const { log, q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  q.openEstimate(SURVEYOR);
  const v = log.verify();
  assert.equal(v.intact, true);
  assert.equal(v.broken_at, null);
  const es = log.entries();
  assert.equal(es[0].prev_hash, '0'.repeat(64));
  for (let i = 1; i < es.length; i++) assert.equal(es[i].prev_hash, es[i - 1].hash);
});

test('A20 an edited entry is detected when the chain is read back', () => {
  const { log, q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  const stored = log.entries().map((e) => ({ ...e }));
  assert.equal(verifyChain(stored).intact, true, 'the untouched chain verifies');

  // Someone edits the surveyor-assignment entry in the database.
  stored[2] = { ...stored[2], detail: { ...stored[2].detail, surveyor_id: 'sv-9' } };
  const v = verifyChain(stored);
  assert.equal(v.intact, false);
  assert.equal(v.broken_at, 3);
});

test('A20b a removed entry is detected, and so is a reordering', () => {
  const { log, q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  const stored = log.entries().map((e) => ({ ...e }));

  const removed = stored.filter((e) => e.kind !== 'SURVEYOR_ASSIGNED');
  assert.equal(verifyChain(removed).intact, false, 'a deletion breaks the chain');

  const reordered = [...stored];
  [reordered[3], reordered[4]] = [reordered[4], reordered[3]];
  assert.equal(verifyChain(reordered).intact, false, 'a reordering breaks the chain');
});

test('A21 the assurance report answers "was the process followed" in one word', () => {
  const { log, q } = setup();
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  q.openEstimate(SURVEYOR);
  const a = assureProcess(log, 'GC-03');
  assert.equal(a.verdict, 'CLEAN');
  assert.equal(a.chain_intact, true);
  assert.ok(a.quarantine_created && a.surveyor_assigned && a.committed && a.released);
  assert.equal(a.viewed_before_release_by_surveyor, false);
  assert.equal(a.denied_attempts, 0);
});

test('A22 an incomplete job is INCOMPLETE, not CLEAN', () => {
  const { log } = setup();
  assert.equal(assureProcess(log, 'GC-03').verdict, 'INCOMPLETE');
});

test('A23 a client who tells the surveyor our figure is recorded, and marks the job EXPOSED', () => {
  const { log, q } = setup();
  q.reportClientDisclosure('sv-1', 'Client mentioned "about seventy grand of allowances" on the walkround.');
  q.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  const a = assureProcess(log, 'GC-03');
  assert.equal(a.client_disclosures, 1);
  assert.equal(a.verdict, 'EXPOSED');
  assert.equal(q.anchor_exposed, true);
});

test('A24 the inputs the surveyor needs are never quarantined', () => {
  assert.ok(RELEASED_TO_SURVEYOR_ALWAYS.length >= 7);
  assert.ok(RELEASED_TO_SURVEYOR_ALWAYS.some((s) => s.includes('client uploaded documents')));
  assert.ok(RELEASED_TO_SURVEYOR_ALWAYS.some((s) => s.includes('gross internal area')));
  assert.ok(RELEASED_TO_SURVEYOR_ALWAYS.some((s) => s.includes('capture list')));
  // Nothing on the input list is an estimate output.
  assert.equal(RELEASED_TO_SURVEYOR_ALWAYS.some((s) => s.toLowerCase().includes('estimate')), false);
});

test('A25 a non-finite committed figure is refused', () => {
  const { q } = setup();
  assert.throws(
    () => q.commit({ surveyor_id: 'sv-1', figures: { ...FIGURES, qualifying_pct: NaN }, method_note: 'v1' }),
    (e: QuarantineError) => e.code === 'E_BAD_FIGURE',
  );
});

test('A26 two jobs keep separate quarantines and separate log slices', () => {
  const log = new AnchorLog();
  const clock = tickingClock();
  const q1 = new AnchorQuarantine({ job_id: 'J1', estimate: ESTIMATE, log, clock, sealed_by: 'an-1' });
  const q2 = new AnchorQuarantine({ job_id: 'J2', estimate: ESTIMATE, log, clock, sealed_by: 'an-1' });
  q1.assignSurveyor('sv-1', 'an-1');
  q2.assignSurveyor('sv-2', 'an-1');
  q1.commit({ surveyor_id: 'sv-1', figures: FIGURES, method_note: 'v1' });
  assert.equal(assureProcess(log, 'J1').verdict, 'CLEAN');
  assert.equal(assureProcess(log, 'J2').verdict, 'INCOMPLETE');
  assert.throws(() => q2.openEstimate({ user_id: 'sv-2', role: 'SURVEYOR' }));
  assert.equal(log.verify().intact, true);
});
