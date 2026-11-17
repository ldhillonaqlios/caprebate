/**
 * PHASE 163 (THE SWEEP), 17 NOVEMBER 2026 — ITRoadway's second review, H-03 (a must-fix), and their answer to E1.
 *
 * The runbook connected the live Blob store to the live project's Production AND Preview, so code on a branch nobody
 * had reviewed could run with the token for every client document. ITRoadway: previews off on the live project, the
 * store and every key on Production only. No phase had taken it; the sweep did. This holds the two documents to it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DOCS = join(import.meta.dirname, '..', '..', '..', 'docs');

test('H-03: the live project connects the store and every key to Production only, and builds no previews', () => {
  const runbook = readFileSync(join(DOCS, 'LIVE-RUNBOOK.md'), 'utf8');
  const section2 = runbook.slice(runbook.indexOf('## 2.'), runbook.indexOf('## 3.'));
  assert.doesNotMatch(section2, /Production and Preview/);
  assert.match(section2, /connect it to this project's Production only/);
  assert.match(section2, /tick \*\*Production only\*\* for every one/);
  assert.match(section2, /Ignored Build Step:\*\* `if \[ "\$VERCEL_ENV" = "production" \]; then exit 1; else exit 0; fi`/);
  const checklist = readFileSync(join(DOCS, 'GO-LIVE-CHECKLIST.md'), 'utf8');
  assert.match(checklist, /8\. \[[ x]\] The \*\*London Blob store\*\*[^\n]*\*\*Production only\*\*[^\n]*Ignored Build Step/);
});
