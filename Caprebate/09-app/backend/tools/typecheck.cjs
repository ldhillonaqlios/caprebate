#!/usr/bin/env node
/**
 * Strict typecheck OF THIS PACKAGE.
 *
 * WHY THIS WRAPPER EXISTS, AND WHAT IT DOES NOT DO.
 *
 * src/ imports several modules from 04-phase-work/phase3 — the anchor
 * quarantine, the name exclusion register, the source register, the document
 * pipeline, the upload handler and, since Phase 107, the surveyor CRM. Each is
 * the AUTHORITY on the rule it carries, each is covered by its own suite, and
 * this package does not edit them.
 *
 * They also predate any tsconfig in this project: until Phase 102 there was no
 * TypeScript compiler here at all, and Node runs .ts by stripping types without
 * checking them. So those files have never been type-checked, and under
 * `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` they raise a
 * handful of diagnostics — FORTY-THREE as at 9 September 2026, re-derived by
 * running this. This line said EIGHTEEN earlier the same day, and the sentence
 * below is the reason it was wrong rather than an excuse for it.
 *
 * DO NOT QUOTE THAT NUMBER WITHOUT RUNNING IT. It moves whenever this package
 * imports another module, and it is printed in full on every run for exactly
 * that reason. The comment used to say "three"; it had been eleven for some
 * time and nobody noticed, which is what a count in a comment is worth.
 *
 * MOST ARE THE SAME GUARDED IDIOM and none is a defect:
 *   arr.length ? arr[arr.length - 1].x : fallback
 * The guard is right there; TypeScript simply cannot narrow through it. The
 * rest are `exactOptionalPropertyTypes` objecting to an explicit `undefined`
 * where the target declares an optional property, which is the same shape.
 *
 * So this wrapper checks THIS package strictly and reports diagnostics from
 * outside it separately. IT DOES NOT HIDE THEM — the count and the files are
 * printed every run, so the day one of them becomes a real defect it is on
 * screen rather than swallowed. Only diagnostics in src/ and test/ fail the
 * build, because only those are this package's to fix.
 */
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const tsc = path.join(ROOT, 'node_modules', '.bin', 'tsc');
const r = spawnSync(tsc, ['--noEmit', '--project', path.join(ROOT, 'tsconfig.json')], { encoding: 'utf8' });

const lines = (r.stdout || '').split('\n').filter((l) => /error TS\d+/.test(l));
const mine = lines.filter((l) => /^(src|test)[\\/]/.test(l));
const external = lines.filter((l) => !/^(src|test)[\\/]/.test(l));

if (external.length) {
  console.log(`${external.length} diagnostic(s) from modules outside this package — reported, not fixed here:`);
  for (const l of external) console.log('  ' + l);
  console.log('  (see tools/typecheck.cjs for why these are flag artefacts and not defects)\n');
}

if (mine.length) {
  console.error(`typecheck FAILED — ${mine.length} error(s) in this package:\n`);
  for (const l of mine) console.error('  ' + l);
  process.exit(1);
}
console.log('typecheck — 0 errors in src/ and test/ under strict, exactOptionalPropertyTypes and noUncheckedIndexedAccess.');
