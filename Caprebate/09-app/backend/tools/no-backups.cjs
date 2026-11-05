#!/usr/bin/env node
/**
 * NO .bak COPIES UNDER 09-app. Phase 161e, 5 November 2026 (the ITRoadway audit, section 5).
 *
 * Until this phase every edit to the app left a dated copy beside the file (help-content.ts.bak-phase144a and so on):
 * 2,179 of them under 09-app, 1,869 in src/ and test/. Git never held them (.gitignore keeps *.bak* out), so they
 * cluttered the folder a developer reads and were backed up by nothing but OneDrive. Lakhbir, 5 Nov 2026: zip them
 * into Caprebate/_archive/ (OneDrive only), then delete them.
 *
 * THE RULE SINCE THEN: CODE IS BACKED UP BY COMMITS. Never make a .bak copy of anything under 09-app (code, tests,
 * the guide, the spec): commit instead, and read an older version with `git show <commit>:<path>`. A test that needs
 * a file as it was before a change keeps that copy as a fixture under test/fixtures/ (Phase 144a's are the example).
 * Documents outside 09-app keep the .bak-phaseNN habit and AMENDMENT 2's cp rule for the Word questions document.
 *
 *   node tools/no-backups.cjs              the check (npm run lint:backups, part of npm run check): exit 1 on any
 *                                          file under Caprebate/09-app whose name holds ".bak", outside node_modules
 *   node tools/no-backups.cjs --self-test  a planted .bak file, a .bak- copy and one in a nested folder must each
 *                                          fail; node_modules and a name like "backup.ts" must not
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP = path.join(__dirname, '..', '..'); // Caprebate/09-app
const BACKUP = /\.bak/i;

/** Every backup copy under root, as paths relative to root, sorted. */
function findBackups(root) {
  const found = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (BACKUP.test(e.name)) found.push(path.relative(root, p).split(path.sep).join('/'));
      else if (e.isDirectory()) walk(p);
    }
  };
  walk(root);
  return found.sort();
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-161e-backups-'));
  const cases = [];
  try {
    fs.mkdirSync(path.join(tmp, 'backend', 'src', 'web'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'backend', 'node_modules', 'x'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'backend', 'src', 'web', 'router.ts'), '');
    fs.writeFileSync(path.join(tmp, 'backend', 'src', 'backup.ts'), '');
    fs.writeFileSync(path.join(tmp, 'backend', 'node_modules', 'x', 'a.js.bak'), '');
    cases.push(['a clean tree passes (node_modules and "backup.ts" are not backups)', findBackups(tmp).length === 0]);
    fs.writeFileSync(path.join(tmp, 'backend', 'src', 'web', 'router.ts.bak-phase999'), '');
    cases.push(['a .bak-phaseNN copy in src/web fails', findBackups(tmp).includes('backend/src/web/router.ts.bak-phase999')]);
    fs.writeFileSync(path.join(tmp, 'README.md.bak'), '');
    cases.push(['a plain .bak at the top fails', findBackups(tmp).includes('README.md.bak')]);
    fs.mkdirSync(path.join(tmp, 'backend', 'test', 'old.bak'), { recursive: true });
    cases.push(['a folder named .bak fails', findBackups(tmp).includes('backend/test/old.bak')]);
    cases.push(['each is listed once', findBackups(tmp).length === 3]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  let bad = 0;
  for (const [name, ok] of cases) { console.log(`  ${ok ? 'held' : 'WRONG'}  ${name}`); if (!ok) bad++; }
  console.log(bad === 0 ? 'self-test: every case held' : `self-test: ${bad} case(s) wrong`);
  return bad === 0 ? 0 : 1;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const found = findBackups(APP);
  if (found.length === 0) {
    console.log('no-backups - no .bak copy under Caprebate/09-app. Code is backed up by commits.');
    return 0;
  }
  console.log(`no-backups - ${found.length} .bak cop${found.length === 1 ? 'y' : 'ies'} under Caprebate/09-app. Code is backed up by commits, `
    + 'so delete it (git history holds every committed version; git show <commit>:<path> reads one):');
  for (const f of found.slice(0, 50)) console.log(`  ${f}`);
  if (found.length > 50) console.log(`  ... and ${found.length - 50} more`);
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { findBackups, APP };
