/**
 * PHASE 161e, 5 NOVEMBER 2026 — A FRESH COPY OF THE PROJECT PASSES EVERY CHECK, ON GITHUB AS WELL AS THE MAC.
 *
 * The ITRoadway technical audit (2 Nov 2026, section 5): "The project is not complete on its own. Some checks need files
 * that were left out, so a fresh copy cannot be fully tested." Now:
 *   1. Tests that read a document kept in OneDrive only name it (test/onedrive-only.ts, and the site harness's M4) and
 *      skip on a fresh copy saying why; in the OneDrive copy every one of those documents must be on disk, and none
 *      of them is in git (the repository is public while the developer reviews it).
 *   2. Phase 144a's "before" copies are test fixtures, so its red run no longer needs .bak files.
 *   3. No .bak copy under 09-app: npm run check fails on one (tools/no-backups.cjs). Code is backed up by commits.
 *   4. A GitHub workflow runs npm run check, the four suites and the root audit on every pull request.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ONEDRIVE_ONLY, PROJECT, inOneDriveCopy, oneDriveOnly, oneDrivePath, type OneDriveKey } from '../onedrive-only.ts';

const BACKEND = join(import.meta.dirname, '..', '..');
const REPO = join(PROJECT, '..'); // Development/, the repository root
const HARNESS = join(PROJECT, '03-app', 'caprebate-regression.cjs');
const WORKFLOW = join(REPO, '.github', 'workflows', 'checks.yml');
const req = createRequire(import.meta.url);

/** True when git can be asked about this tree (a copy with no .git skips the git half and says so). */
function gitTracked(paths: readonly string[]): string[] {
  const out = execFileSync('git', ['ls-files', '--', ...paths], { cwd: PROJECT, encoding: 'utf8' });
  return out.split('\n').filter((l) => l !== '');
}
const gitHere = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: PROJECT, encoding: 'utf8' }).stdout.trim() === 'true';

/** The OneDrive-only documents the site harness's M4 names, read from the harness itself. */
function harnessOneDriveDocs(): string[] {
  const src = readFileSync(HARNESS, 'utf8');
  const block = /const ONEDRIVE_ONLY_DOCS = \[([\s\S]*?)\];/.exec(src)?.[1] ?? '';
  return [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? '');
}

describe('1 · documents kept in OneDrive only', () => {
  const keys = Object.keys(ONEDRIVE_ONLY) as OneDriveKey[];

  test('the back end names five, and the site harness five, each with a path and a plain reason', () => {
    assert.deepEqual(keys.sort(), ['disposalNote', 'logo', 'privacyNotice', 'rulebooks', 'sop']);
    for (const k of keys) assert.ok(String(ONEDRIVE_ONLY[k].path).length > 0 && String(ONEDRIVE_ONLY[k].what).length > 0, k);
    assert.equal(harnessOneDriveDocs().length, 5, 'the harness no longer names its OneDrive-only documents');
  });

  test('in the OneDrive copy every one is on disk, so nothing skips on the Mac', { skip: inOneDriveCopy() ? false : 'this is a fresh copy, not the OneDrive copy: the documents are meant to be missing here' }, () => {
    for (const k of keys) assert.equal(oneDriveOnly(k), false, `${k}: ${ONEDRIVE_ONLY[k].path} is missing from the OneDrive copy`);
    for (const d of harnessOneDriveDocs()) assert.ok(existsSync(join(PROJECT, d)), `${d} is missing from the OneDrive copy`);
  });

  test('none of them is in git', { skip: gitHere ? false : 'git is not available here' }, () => {
    assert.deepEqual(gitTracked([...keys.map((k) => ONEDRIVE_ONLY[k].path), ...harnessOneDriveDocs()]), []);
  });

  test('a missing one gives a skip that names the file and says why; a present one runs', () => {
    const empty = mkdtempSync(join(tmpdir(), 'cb-161e-'));
    for (const k of keys) {
      const why = oneDriveOnly(k, empty);
      assert.equal(typeof why, 'string');
      assert.ok(String(why).includes(`Caprebate/${ONEDRIVE_ONLY[k].path}`), `${k}: the reason does not name the file`);
      assert.match(String(why), /kept in OneDrive only, not in git/);
    }
    assert.equal(oneDrivePath('sop', empty), join(empty, ONEDRIVE_ONLY.sop.path));
    assert.equal(inOneDriveCopy(empty), false);
  });

  test('the site harness skips them by name on a fresh copy, and fails a missing one in the OneDrive copy', () => {
    const src = readFileSync(HARNESS, 'utf8');
    assert.match(src, /const ONEDRIVE_COPY = fs\.existsSync\(path\.join\(DIR, "\.\.", "_archive"\)\);/);
    assert.match(src, /const keptElsewhere = ONEDRIVE_COPY \? \[\] : absent\.filter/, 'in the OneDrive copy a missing document must still fail');
    assert.match(src, /kept in OneDrive only, not in git/);
    assert.match(src, /if \(skipped\.length\) console\.log\("  skipped "/, 'the skips are not printed under the summary');
  });
});

describe('2 · Phase 144a\'s red run reads fixtures, not .bak files', () => {
  test('the two pre-change copies are fixtures, equal to git at the commit before Phase 144a', { skip: gitHere ? false : 'git is not available here' }, () => {
    const dir = join(BACKEND, 'test', 'fixtures', 'phase144a-before');
    const pairs = [
      ['CAPREBATE-ADMIN-AND-USER-GUIDE.md.before-phase144a', 'Caprebate/09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md'],
      ['help-content.ts.before-phase144a', 'Caprebate/09-app/backend/src/web/help-content.ts'],
    ] as const;
    const shallow = spawnSync('git', ['cat-file', '-e', '8f682e2^'], { cwd: PROJECT }).status !== 0;
    for (const [fixture, path] of pairs) {
      const ours = readFileSync(join(dir, fixture), 'utf8');
      assert.ok(ours.length > 10000, `${fixture} is not the whole file`);
      if (shallow) continue; // a shallow clone (GitHub's checkout) has no history to compare with
      assert.equal(ours, execFileSync('git', ['show', `8f682e2^:${path}`], { cwd: PROJECT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }), fixture);
    }
    assert.match(readFileSync(join(BACKEND, 'test', 'core/plain-words-guide-and-assessment.test.ts'), 'utf8'), /'--suffix', '\.before-phase144a', '--suffix-dir', before/);
  });
});

describe('3 · no .bak copy under 09-app', () => {
  const nb = req('../../tools/no-backups.cjs') as { findBackups: (root: string) => string[]; APP: string };

  test('there is none, and npm run check fails on one (lint:backups)', () => {
    assert.deepEqual(nb.findBackups(nb.APP), []);
    const pkg = JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    assert.equal(pkg.scripts['lint:backups'], 'node tools/no-backups.cjs');
    assert.match(pkg.scripts['check'] ?? '', /npm run lint:copies && npm run lint:backups && npm run typecheck/);
  });

  test('its self-test holds: a planted .bak file fails, node_modules and "backup.ts" do not', () => {
    const r = spawnSync(process.execPath, [join(BACKEND, 'tools', 'no-backups.cjs'), '--self-test'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /every case held/);
  });

  test('the drift checker runs the same seven steps', () => {
    const drift = readFileSync(join(PROJECT, '03-app', 'caprebate-figure-drift.cjs'), 'utf8');
    assert.match(drift, /npm run lint:copies && npm run lint:backups && npm run typecheck && npm run test";/);
    assert.match(drift, /step\("lint:backups", \[path\.join\(dir, "tools", "no-backups\.cjs"\)\]\);/);
  });
});

describe('4 · the GitHub workflow', () => {
  test('on every pull request, a fresh checkout on Node 24 runs npm ci, npm run check, the four suites and the root audit', () => {
    assert.ok(existsSync(WORKFLOW), '.github/workflows/checks.yml is missing');
    const w = readFileSync(WORKFLOW, 'utf8');
    assert.match(w, /^on:\n {2}pull_request:/m);
    assert.match(w, /uses: actions\/checkout@v4/);
    assert.match(w, /node-version: '24'/);
    const runs = [...w.matchAll(/^ {8}(?:working-directory: (.+)\n {8})?run: (.+)$/gm)].map((m) => `${m[1] ?? '.'} :: ${m[2]}`);
    for (const want of [
      'Caprebate/09-app/backend :: npm ci --no-fund',
      'Caprebate/09-app/backend :: npm run check',
      'Caprebate :: node 03-app/caprebate-regression.cjs',
      'Caprebate :: node 03-app/caprebate-regression.cjs --package',
      'Caprebate/04-phase-work/phase3 :: node --test',
      'Caprebate/04-phase-work/phase9 :: node --test',
    ]) assert.ok(runs.includes(want), `the workflow does not run: ${want}\n${runs.join('\n')}`);
    assert.match(w, /cp package\.json "\$scratch\/"[\s\S]*npm install --package-lock-only[\s\S]*npm audit --audit-level=high/);
    assert.match(w, /permissions:\n {2}contents: read/);
  });

  test('git holds the workflow: the allow-list lets .github in', () => {
    const ignore = readFileSync(join(REPO, '.gitignore'), 'utf8');
    assert.match(ignore, /^!\/\.github\/$/m);
  });
});
