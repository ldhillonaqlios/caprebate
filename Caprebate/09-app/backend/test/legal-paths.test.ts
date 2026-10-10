/**
 * PHASE 159h (item 6), 10 October 2026 — THE LEGAL CHECK'S EVERY ROUTE-DECIDING PATH, CHECKED AGAINST ITS RECORDED
 * OUTCOME. The walk is test/legal-paths-walk.ts; the expected outcomes are test/fixtures/phase159h/legal-paths-gp-company.txt,
 * written by `node tools/legal-paths-record.ts`. A path whose level, cap or deadline moves fails here, with its answers,
 * so a change to the law is never silent. To move outcomes on purpose: re-record, and read the diff.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leafLines, walkLegalPaths } from './legal-paths-walk.ts';

const FIXTURE = new URL('./fixtures/phase159h/legal-paths-gp-company.txt', import.meta.url);

describe('the legal check, every route-deciding path (GP, a company)', () => {
  test('every path’s level, cap and deadline is the one recorded, and no path is added or lost', () => {
    const want = readFileSync(FIXTURE, 'utf8').trim().split('\n');
    const leaves = walkLegalPaths('gp', 'company');
    const got = leafLines(leaves);
    assert.ok(want.length > 10_000, `the recorded walk holds ${want.length} paths`);
    const wantSet = new Set(want), gotSet = new Set(got);
    const moved = got.filter((l) => !wantSet.has(l));
    const lost = want.filter((l) => !gotSet.has(l));
    const byKey = new Map(leaves.map((l) => [l.key, l]));
    const show = moved.slice(0, 5).map((l) => { const k = l.split(' ')[0] ?? ''; return `${l} (was ${want.find((w) => w.startsWith(k + ' ')) ?? 'not recorded'}) :: ${JSON.stringify(byKey.get(k)?.answers)}`; });
    assert.equal(moved.length + lost.length, 0, `${String(moved.length)} paths read differently and ${String(lost.length)} recorded paths were not reached:\n${show.join('\n')}`);
  });
});
