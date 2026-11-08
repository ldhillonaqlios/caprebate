/**
 * PHASE 161h1, 7 November 2026 — THE MODULE MAP AND THE BOUNDARY CHECK (09-app/ARCHITECTURE.md, rules 1 to 4).
 *
 * No code moves and no behaviour changes in this phase: it adds the map of every file and table, the check, and the
 * ratchet. These tests hold the check to the real tree: it passes on today's code with today's baseline, its own
 * controls each fail as required, the map covers exactly the files git tracks and the tables a real database has, and
 * npm run check and GitHub's check both run it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Db, migrate } from '../src/core/db.ts';
import { MIGRATIONS_DIR } from '../src/core/app.ts';

const BACKEND = join(import.meta.dirname, '..');
const REPO = join(BACKEND, '..', '..', '..');
const B = createRequire(import.meta.url)('../tools/boundaries.cjs') as {
  AREAS: string[]; KINDS: string[]; tablesFromMigrations: (dir: string) => string[];
};
const read = (rel: string): { [k: string]: unknown } => JSON.parse(readFileSync(join(BACKEND, rel), 'utf8')) as { [k: string]: unknown };

test('161h1: the boundary check passes on today\'s code with today\'s baseline', () => {
  const r = spawnSync(process.execPath, [join(BACKEND, 'tools', 'boundaries.cjs')], { cwd: BACKEND, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no new break: \d+ breaks of rules 1 to 4 in the baseline/);
});

test('161h1: its own controls - a planted break of each rule, a file with no area and a table with no owner each fail; --lower never adds', () => {
  const r = spawnSync(process.execPath, [join(BACKEND, 'tools', 'boundaries.cjs'), '--self-test'], { cwd: BACKEND, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout);
  assert.doesNotMatch(r.stdout, /NOT AS REQUIRED/);
  for (const rule of ['rule 1:', 'rule 2:', 'rule 3:', 'rule 4: a page', 'rule 4: logic', 'a file with no area', 'a table with no owner', '--lower refuses']) assert.match(r.stdout, new RegExp(`AS REQUIRED +${rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('161h1: the map gives every file git tracks under src/ one area and one kind, and nothing else', () => {
  const tracked = execFileSync('git', ['ls-files', 'src'], { cwd: BACKEND, encoding: 'utf8' }).split('\n').filter((l) => /\.(ts|cts|mts|cjs|mjs|js)$/.test(l)).sort();
  const files = read('architecture/modules.json')['files'] as Record<string, { area: string; kind: string }>;
  assert.deepEqual(Object.keys(files).sort(), tracked);
  for (const [f, e] of Object.entries(files)) {
    assert.ok(B.AREAS.includes(e.area), `${f}: ${e.area}`);
    assert.ok(B.KINDS.includes(e.kind), `${f}: ${e.kind}`);
  }
  const doors = read('architecture/modules.json')['doors'] as Record<string, string>;
  assert.deepEqual(Object.keys(doors).sort(), [...B.AREAS].sort());
});

test('161h1: the table owners cover exactly the tables a database built from the migrations has (read the same way the check reads them)', () => {
  const db = new Db(':memory:');
  try {
    migrate(db, MIGRATIONS_DIR);
    const real = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((r) => r.name);
    assert.deepEqual(B.tablesFromMigrations(join(BACKEND, 'migrations')), real);
    const owners = read('architecture/tables.json')['tables'] as Record<string, string>;
    assert.deepEqual(Object.keys(owners).sort(), real);
    for (const [t, a] of Object.entries(owners)) assert.ok(B.AREAS.includes(a), `${t}: ${a}`);
  } finally { db.close(); }
});

test('161h1: the baseline holds only well-formed breaks of rules 1 to 4, by area', () => {
  const base = read('architecture/baseline.json')['breaks'] as Record<string, Record<string, string[]>>;
  assert.deepEqual(Object.keys(base).sort(), ['1', '2', '3', '4']);
  const shape: Record<string, RegExp> = { 1: /^src\/\S+ -> src\/\S+$/, 2: /^[a-z-]+ -> [a-z-]+$/, 3: /^src\/\S+ : [a-z_0-9]+$/, 4: /^src\/\S+ : (page|logic) /u };
  for (const [rule, byArea] of Object.entries(base)) {
    for (const [area, keys] of Object.entries(byArea)) {
      assert.ok(B.AREAS.includes(area), area);
      for (const k of keys) assert.match(k, shape[rule] as RegExp, k);
    }
  }
});

test('161h1: npm run check runs it after lint-paths, and GitHub\'s fresh-copy check runs its controls', () => {
  const pkg = JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['lint:boundaries'], 'node tools/boundaries.cjs');
  assert.match(pkg.scripts['check'] ?? '', /npm run lint:paths && npm run lint:boundaries &&/);
  assert.match(readFileSync(join(REPO, '.github', 'workflows', 'checks.yml'), 'utf8'), /node tools\/boundaries\.cjs --self-test/);
});
