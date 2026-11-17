/**
 * PHASE 163 (THE SWEEP), 17 NOVEMBER 2026 — THE PAYLOAD PROOF, RUN WITH EVERY CHECK.
 *
 * tools/payload-proof.ts proves what each staff role receives over HTTP: the surveyor no estimate, the view-only role
 * no estimate and no fee, Admin all seven, and every other role refused where it must be. It was run by hand at each
 * sweep only, so when Phase 161n1c (ITRoadway L-10) made the claims and leads export a POST with a single-use token,
 * the proof kept sending a GET, every role (Admin's too) got 405, and nobody saw it go blind until the next sweep.
 * Now it runs here, inside npm run check and GitHub's check, and must print PASS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

test('the payload proof runs and passes: each role receives exactly what it may, and the export check is not blind', () => {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '..', '..', 'tools', 'payload-proof.ts')], {
    encoding: 'utf8',
    env: { ...process.env, CAPREBATE_ALLOW_SEED: '1', NODE_TEST_CONTEXT: '' },
    timeout: 120_000,
  });
  const verdict = (r.stdout.match(/=== VERDICT: .*/) ?? ['(no verdict printed)'])[0];
  assert.equal(r.status, 0, `${verdict}\n${r.stderr.slice(-800)}`);
  assert.match(verdict, /^=== VERDICT: PASS/);
});
