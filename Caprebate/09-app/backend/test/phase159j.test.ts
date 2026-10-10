/**
 * PHASE 159j, 10 October 2026 — THE STRESS SUITE IN THE BUILD.
 *
 * The stress test of 9 October 2026 (04-phase-work/stress-2026-10-09/, OneDrive) was a set of harnesses run by hand.
 * Item 1 of this phase keeps them in the suite, seeded so every run makes the same cases:
 *   engine     test/stress-engine-walk.ts — the funnel and the engine over fixed grids and 3,000 seeded multi-building
 *              funnels (engine/harness.ts). Every broken property is a class; only the readings kept on purpose pass.
 *   pack sums  test/stress-pack-walk.ts — 20,000 seeded packs against s.562 worked again in BigInt (claim/h1).
 *   grants     the same file — 10,000 seeded grant runs: pools add up and each grant's row adds to the total (h1, C23).
 *   returns    the same file — 3,000 seeded pools: every row's brought forward less allowance is carried forward (h4, C16).
 *   window     test/stress-window-walk.ts — six claimant types x four year ends x every purchase year, against the table
 *              recorded in test/fixtures/phase159j/window-table.csv (h3), and its named cases.
 * Already in the suite before this phase, so not repeated here: the version scenarios (claim/h5) are Phase 159a's C3,
 * C4 and C5 tests (test/phase159a.test.ts), and the legal-path walk (claim/h6) is test/legal-paths.test.ts (Phase 159h).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runEngineStress } from './stress-engine-walk.ts';
import { runGrantStress, runPackStress, runReturnStress } from './stress-pack-walk.ts';
import { WINDOW_HEADER, WINDOW_NOW, periodContaining, windowRig, windowTable } from './stress-window-walk.ts';
import * as CF from './claim-fixtures.ts';
import { amendmentWindowReading } from '../src/web/claim-facts.ts';
import { claimRoutes } from '../src/web/claim-route.ts';
import { reportsWindowNeed } from '../src/web/claim-record.ts';

/** The engine harness's findings that are kept ON PURPOSE, each with the Word question that asks the tax adviser. A
 *  class not listed here fails the test; a listed class that no longer appears fails it too, so this list is never stale. */
const KEPT_ON_PURPOSE: Readonly<Record<string, string>> = {
  'engine: seller pooled, no election, window closed (2015 purchase) - QE not nil':
    'Word question 250 — a closed window after a seller pooled and made no election is a referral, not nil',
  'seller claimed (pooled) and no s.198 election/date captured: ceiling unchanged':
    'Word questions 247 and 250 — with the two-year window open, a ceiling can stand until the election is seen',
};

describe('item 1 — the estimate engine, every grid', () => {
  const r = runEngineStress();
  test('the grids are the size the stress test ran', () => {
    assert.deepEqual(r.runs, { gridA1: 9660, gridA2: 16200, gridA3_multi: 3000, gridB_engine: 19500 });
    assert.ok(r.checks > 350_000, `${String(r.checks)} checks`);
  });
  test('no property breaks, apart from the readings kept on purpose', () => {
    const found = r.violations.map((v) => v.cls);
    const unexpected = r.violations.filter((v) => !(v.cls in KEPT_ON_PURPOSE));
    assert.equal(unexpected.length, 0, unexpected.map((v) => `[${v.prop}] x${String(v.count)} ${v.cls}\n  in: ${JSON.stringify(v.input).slice(0, 300)}\n  got: ${JSON.stringify(v.actual).slice(0, 300)}\n  expected: ${v.expected}`).join('\n'));
    assert.deepEqual(found.sort(), Object.keys(KEPT_ON_PURPOSE).sort(), 'a reading kept on purpose no longer shows: take it off the list, and close its question');
  });
  test('Lockwood at the assessment: the purchase and the 2025 refit each add their own band, "up to" one figure everywhere', () => {
    const l = r.lockwood;
    assert.deepEqual(l['errors'], []);
    assert.equal(l['same_without_works'], 195_000, '£650,000 x 30%, the top of the GP purchase band');
    assert.equal(l['client_high'], 258_000, 'the £90,000 refit adds £63,000 at the top of the GP refurbishment band');
    assert.equal(l['stored_high_pence'], 25_800_000);
    assert.equal(l['staff_sees'], 'up to £258,000');
  });
});

describe('item 1 — the pack’s sums, its grants and the return entries, seeded', () => {
  test('20,000 packs: the pools add up, nothing above the building’s price, the share in 0-100%, s.562 to the penny', () => {
    const p = runPackStress();
    assert.equal(p.failures.length, 0, p.failures.slice(0, 10).join('\n'));
    assert.ok(p.complete > 3_000 && p.refused > 10_000, `${String(p.complete)} complete, ${String(p.refused)} refused: the seed reaches both`);
  });
  test('10,000 grant runs: the pools still add up and stay within [0, Q]; each grant’s row adds up to the total (C23)', () => {
    const g = runGrantStress();
    assert.equal(g.failures.length, 0, g.failures.slice(0, 10).join('\n'));
    assert.ok(g.runs > 9_000, `${String(g.runs)} runs`);
  });
  test('3,000 pairs of pools: every return’s brought forward less its allowance is carried forward, to the penny (C16)', () => {
    const x = runReturnStress();
    assert.equal(x.failures.length, 0, x.failures.slice(0, 10).join('\n'));
    assert.equal(x.worst_pence, 0);
    assert.ok(x.rows > 20_000, `${String(x.rows)} rows`);
  });
});

describe('item 1 — the amendment window, every claimant type, year end and purchase year', () => {
  test('every row is the one recorded, and no row is added or lost', async () => {
    const want = readFileSync(new URL('./fixtures/phase159j/window-table.csv', import.meta.url), 'utf8').trim().split('\n');
    assert.equal(want[0], WINDOW_HEADER);
    const got = await windowTable();
    const wantRows = want.slice(1), wantSet = new Set(wantRows), gotSet = new Set(got);
    const moved = got.filter((l) => !wantSet.has(l)), lost = wantRows.filter((l) => !gotSet.has(l));
    assert.ok(wantRows.length > 400, `${String(wantRows.length)} rows recorded`);
    assert.equal(moved.length + lost.length, 0, `${String(moved.length)} rows read differently and ${String(lost.length)} recorded rows were not made:\n${moved.slice(0, 5).join('\n')}`);
  });
  test('the named cases: the last day is open all day; a still-owned 2019 purchase goes into the first open pool; the period must hold the purchase', async () => {
    const { app, claimFor } = await windowRig();
    const last = claimFor('COMPANY', '2024-06-15', '2023-10-01', '2024-09-30');
    for (const t of ['2026-09-30T00:00:00.000Z', '2026-09-30T09:00:00.000Z', '2026-09-30T22:59:59.000Z']) {
      assert.equal(amendmentWindowReading(app.db, last, t).state, 'OPEN', t);
      assert.equal(reportsWindowNeed(app.db, last, t).met, true, t);
    }
    assert.equal(amendmentWindowReading(app.db, last, '2026-10-01T00:00:00.000Z').state, 'CLOSED');
    for (const acq of ['2019-06-15', '2020-06-15']) {
      const per = periodContaining(acq, [12, 31]);
      const c = claimFor('COMPANY', acq, per.start, per.end);
      assert.equal(amendmentWindowReading(app.db, c, WINDOW_NOW).state, 'CLOSED', acq);
      CF.fact(app, c.id, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
      const route = claimRoutes(app.db, c, WINDOW_NOW)[0];
      assert.equal(route?.route, 'W2', acq);
      assert.deepEqual([route?.first_open?.start, route?.first_open?.end], ['2024-01-01', '2024-12-31'], acq);
      assert.equal(reportsWindowNeed(app.db, c, WINDOW_NOW).met, true, acq);
    }
    for (const acq of ['2023-12-31', '2025-01-01']) assert.equal(amendmentWindowReading(app.db, claimFor('COMPANY', acq, '2024-01-01', '2024-12-31'), WINDOW_NOW).state, 'UNKNOWN', acq);
    assert.equal(amendmentWindowReading(app.db, claimFor('COMPANY', '2019-06-15', '2025-01-01', '2025-12-31'), WINDOW_NOW).state, 'UNKNOWN', 'the current period is not the period of a 2019 purchase');
  });
});
