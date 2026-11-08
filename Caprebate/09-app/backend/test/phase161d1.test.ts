/**
 * Phase 161d1, 5 November 2026 — the public site file, notices page, fixture list and engagement letters are read
 * from inside the app.
 *
 * The ITRoadway technical audit (2 November 2026, section 5): live code must not depend on files outside the app.
 * Phase 161d moved the modules and left five file reads, each with a home people edit (the site file, the notices
 * page, the fixture list, the engagement letter and its test copy). The originals stay there; the app reads its own
 * copy in Caprebate/09-app/backend/copies/, and tools/app-copies.cjs (npm run lint:copies, part of npm run check)
 * fails when a copy is missing or differs from its original by one byte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { SITE_PATH } from '../src/modules/public-site/public-site.ts';
import { NOTICES_PATH } from '../src/modules/public-site/notices-site.ts';
import { TAXONOMY_FILE } from '../src/web/pack-lines.ts';
import { LETTER_PATH, TEST_LETTER_PATH } from '../src/modules/claims/letter.ts';
/* PHASE 161h: vercel.json became vercel.ts (both projects build from it); vercelConfig({}) is the old file, exactly. */
const VERCEL_CONFIG: unknown = ((await import(new URL('../../../../vercel.ts', import.meta.url).href)) as { vercelConfig: (e: Record<string, string>) => unknown }).vercelConfig({});

const BACKEND = join(import.meta.dirname, '..');
const REPO = join(BACKEND, '..', '..', '..');
const APP = join(REPO, 'Caprebate', '09-app');
const req = createRequire(import.meta.url);
const copies = req('../tools/app-copies.cjs') as {
  check: (o: { repo: string }) => { problems: string[] };
  COPIES: { original: string; why: string }[];
  copyOf: (original: string) => string;
};
const lint = req('../tools/lint-paths.cjs') as { KNOWN: { file: string; target: string; carried?: boolean }[] };

const LIVE: [string, string, string][] = [
  ['public-site.ts SITE_PATH', SITE_PATH, 'Caprebate site.html'],
  ['notices-site.ts NOTICES_PATH', NOTICES_PATH, 'Caprebate/03-app/caprebate-notices-page.html'],
  ['pack-lines.ts TAXONOMY_FILE', TAXONOMY_FILE, 'Caprebate/02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv'],
  ['letter.ts LETTER_PATH', LETTER_PATH, 'Caprebate/06-commercial-and-governance/Caprebate Engagement Letter.docx'],
  ['letter.ts TEST_LETTER_PATH', TEST_LETTER_PATH,
    'Caprebate/06-commercial-and-governance/Caprebate Engagement Letter - TEST DEFAULTS, not agreed.docx'],
];
const inside = (p: string, dir: string) => { const r = relative(dir, p); return r !== '' && !r.startsWith('..'); };

test('each of the five files live code reads is its own copy inside Caprebate/09-app', () => {
  for (const [name, path, original] of LIVE) {
    assert.ok(inside(path, APP), `${name} reads ${relative(REPO, path)}, outside Caprebate/09-app`);
    assert.equal(relative(REPO, path).split(sep).join('/'), copies.copyOf(original), name);
    assert.ok(existsSync(path), `${name}: ${path} is missing`);
  }
});

test('each copy is the same as its original, byte for byte, and the check knows all five', () => {
  assert.deepEqual(copies.check({ repo: REPO }).problems, []);
  assert.deepEqual(copies.COPIES.map((c) => c.original).sort(), LIVE.map(([, , o]) => o).sort());
  for (const [, path, original] of LIVE) assert.ok(readFileSync(path).equals(readFileSync(join(REPO, original))), original);
});

test('the check fails on a changed, missing or extra copy and on a lost original (its self-test)', () => {
  const r = spawnSync(process.execPath, [join(BACKEND, 'tools', 'app-copies.cjs'), '--self-test'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /✔ a copy edited by hand fails/);
  assert.match(r.stdout, /✔ an original changed by one byte, with the copy not refreshed, fails/);
});

test('npm run check runs it, and npm run copies refreshes the copies', () => {
  const pkg = JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['lint:copies'], 'node tools/app-copies.cjs');
  assert.equal(pkg.scripts['copies'], 'node tools/app-copies.cjs --write');
  assert.match(pkg.scripts['check'] ?? '', /npm run lint:copies/);
});

test('KNOWN in tools/lint-paths.cjs has no row carried to a later phase, and names none of the five', () => {
  assert.deepEqual(lint.KNOWN.filter((k) => k.carried), []);
  for (const [, , original] of LIVE) assert.equal(lint.KNOWN.some((k) => k.target === original), false, original);
});

test("the test website's bundle takes the copies (vercel.json includeFiles)", () => {
  const v = VERCEL_CONFIG as { functions: Record<string, { includeFiles: string }> };
  const inc = v.functions['api/index.mjs']?.includeFiles ?? '';
  assert.match(inc, /(^|[{,])Caprebate\/\*\*([,}]|$)/, `includeFiles is ${inc}`);
  const ignore = existsSync(join(REPO, '.vercelignore')) ? readFileSync(join(REPO, '.vercelignore'), 'utf8') : '';
  assert.equal(/09-app|copies/.test(ignore.replace(/^#.*$/gm, '')), false, '.vercelignore leaves the copies out');
});
