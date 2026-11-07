/**
 * PHASE 161i, 7 November 2026 — REGROUP 1: core, shared and integrations as areas with front doors, and the CSS as real
 * files. Moves, not rewrites: what a person sees does not change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const BACKEND = join(import.meta.dirname, '..');
const R = createRequire(import.meta.url)('../tools/route-list.cjs') as { routeList: (b: string) => string };

test('161i: every route the code answers is the same list as before the first move (test/fixtures/route-list.txt)', () => {
  assert.equal(R.routeList(BACKEND), readFileSync(join(BACKEND, 'test', 'fixtures', 'route-list.txt'), 'utf8'));
});
