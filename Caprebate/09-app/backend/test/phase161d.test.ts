/**
 * Phase 161d, 4 November 2026 — live code no longer loads anything from the draft folders.
 *
 * The ITRoadway technical audit (2 November 2026, section 5): "Live code depends on draft folders." src/ imported
 * fourteen modules from Caprebate/04-phase-work/phase3 and phase9. They moved into src/registers, src/documents,
 * src/survey, src/costing and src/postcodes, with their tests, and tools/lint-paths.cjs (npm run lint:paths, part of
 * npm run check) fails on any module or file outside Caprebate/09-app that live code loads or reads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const BACKEND = join(import.meta.dirname, '..');
const REPO = join(BACKEND, '..', '..', '..');
const PHASE_WORK = join(REPO, 'Caprebate', '04-phase-work');
const lint = createRequire(import.meta.url)('../tools/lint-paths.cjs') as {
  check: (o: { repo: string }) => { problems: string[]; scanned: number; outside: { file: string; target: string }[] };
  KNOWN: { file: string; target: string; why: string; carried?: boolean }[];
};

const MOVED: [string, string][] = [
  ['phase3/caprebate-anchor-quarantine.ts', 'survey'],
  ['phase3/caprebate-surveyor-crm.ts', 'survey'],
  ['phase3/caprebate-source-register.ts', 'registers'],
  ['phase3/caprebate-name-exclusion.ts', 'registers'],
  ['phase9/caprebate-boundary-import.ts', 'registers'],
  ['phase3/caprebate-document-pipeline.ts', 'documents'],
  ['phase3/caprebate-client-doc-ingestion.ts', 'documents'],
  ['phase3/caprebate-upload-handler.ts', 'documents'],
  ['phase9/caprebate-cost-model.cjs', 'costing'],
  ['phase9/caprebate-job-economics.cjs', 'costing'],
  ['phase9/caprebate-postcode-authority.ts', 'postcodes'],
  ['phase9/caprebate-postcode-store.ts', 'postcodes'],
  ['phase9/caprebate-location-key.ts', 'postcodes'],
  ['phase9/caprebate-region.ts', 'postcodes'],
];

test('no file under backend/src or api/ loads or reads anything outside Caprebate/09-app, beyond the listed few', () => {
  const r = lint.check({ repo: REPO });
  assert.deepEqual(r.problems, []);
  assert.ok(r.scanned > 100, `only ${r.scanned} files were looked at`);
  assert.equal(r.outside.some((f) => f.target.includes('04-phase-work')), false);
});

test('the listed few are named with a reason, and none of them is in 04-phase-work', () => {
  for (const k of lint.KNOWN) {
    assert.ok(k.why.length > 20, `${k.file} has no reason`);
    assert.equal(k.target.includes('04-phase-work'), false, `${k.file} -> ${k.target}`);
    if (k.carried) assert.match(k.why, /Phase 161d1/);
  }
});

test('the check fails on a planted import from 04-phase-work (its self-test)', () => {
  const r = spawnSync(process.execPath, [join(BACKEND, 'tools', 'lint-paths.cjs'), '--self-test'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✔ an import from 04-phase-work fails/);
});

test('npm run check runs it', () => {
  const pkg = JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['lint:paths'], 'node tools/lint-paths.cjs');
  assert.match(pkg.scripts['check'] ?? '', /npm run lint:paths/);
});

test('each moved module is in src/, its old place keeps a one-line note that loads it, and nothing was deleted', async () => {
  for (const [old, folder] of MOVED) {
    const name = old.split('/')[1]!;
    const now = join(BACKEND, 'src', folder, name);
    assert.ok(existsSync(now), `${now} is missing`);
    const note = readFileSync(join(PHASE_WORK, old), 'utf8');
    assert.match(note, /^\/\/ Moved by Phase 161d \(4 Nov 2026\) to 09-app\/backend\/src\//);
    const spec = /(?:from|require\()\s*'([^']+)'/.exec(note)?.[1];
    assert.ok(spec, `${old} does not load its new place`);
    assert.equal(resolve(dirname(join(PHASE_WORK, old)), spec), now);
  }
  // The note loads the same module: one export through the old path is the same object as through the new one.
  const viaOld = await import(join(PHASE_WORK, 'phase3', 'caprebate-source-register.ts')) as { SOURCES: unknown };
  const viaNew = await import(join(BACKEND, 'src', 'registers', 'caprebate-source-register.ts')) as { SOURCES: unknown };
  assert.equal(viaOld.SOURCES, viaNew.SOURCES);
  const req = createRequire(import.meta.url);
  assert.equal(req(join(PHASE_WORK, 'phase9', 'caprebate-cost-model.cjs')), req(join(BACKEND, 'src', 'costing', 'caprebate-cost-model.cjs')));
});
