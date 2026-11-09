#!/usr/bin/env node
/**
 * THE APP'S OWN COPIES OF FIVE FILES PEOPLE EDIT ELSEWHERE — checked, never edited. Phase 161d1, 5 November 2026.
 *
 * The ITRoadway technical audit (2 November 2026, section 5) found live code reading files outside the app. Phase 161d
 * moved the modules; five files it read were left, because each has a home that people use and other readers there:
 *
 *   Caprebate site.html                    the public website (the harness, the brand and plain-words checks read it
 *                                          there). Its calculator is BUILT from 09-app/engine/src/calculator/ since
 *                                          Phase 161f: `npm run page` in 09-app/engine writes it, then runs --write
 *   03-app/caprebate-notices-page.html     the privacy and cookie notices (four 03-app checks read it there)
 *   02-modules-and-build-prep/
 *     Caprebate-Fixture-Taxonomy-v1.csv    the fixture list (a module file: the drift checker's stray-copy guard keeps
 *                                          the one edited copy in 02-modules-and-build-prep)
 *   06-commercial-and-governance/
 *     Caprebate Engagement Letter.docx     the director's and the solicitor's letter, and the test website's copy of it
 *     ... - TEST DEFAULTS, not agreed.docx
 *
 * So the original stays where people edit it, and the app reads ITS OWN COPY in Caprebate/09-app/backend/copies/.
 * This check fails when a copy is missing or differs from its original by a single byte, so the app can never serve
 * an out-of-date page or letter without the build saying so. The engine's tools/verify-page.cjs does the same for
 * the calculator inside the page (Phase 161f).
 *
 *   node tools/app-copies.cjs               the check (npm run lint:copies, part of npm run check)
 *   node tools/app-copies.cjs --write       bring every copy up to date from its original (npm run copies).
 *                                           Run it after editing any of the five originals.
 *   node tools/app-copies.cjs --self-test   proves a changed, missing or extra copy, and a lost original, each fail
 *
 * THE COPY IS WRITTEN AS BYTES (readFileSync, then writeFileSync), never with fs.copyFileSync or cp -p: on the Mac those
 * copy a file's extended attributes too, OneDrive's identity among them, and OneDrive then takes the copy for the
 * original (the trap COORDINATES records for the Word questions document, Phase 159e).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Each original (from the repository root, Development/) and the app's copy (in backend/copies/, the same name). */
const COPIES = [
  { original: 'Caprebate site.html',
    why: 'the public website (src/modules/public-site/public-site.ts); its calculator is built from 09-app/engine/src/calculator (npm run page)' },
  { original: 'Caprebate/03-app/caprebate-notices-page.html',
    why: 'the privacy and cookie notices (src/modules/public-site/notices-site.ts); four 03-app checks read the original' },
  { original: 'Caprebate/02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv',
    why: "the fixture list a claim's survey pack is drafted from (src/modules/survey/pack-lines.ts)" },
  { original: 'Caprebate/06-commercial-and-governance/Caprebate Engagement Letter.docx',
    why: "the engagement letter (src/modules/claims/letter.ts); the director's and the solicitor's document" },
  { original: 'Caprebate/06-commercial-and-governance/Caprebate Engagement Letter - TEST DEFAULTS, not agreed.docx',
    why: "the test website's copy of the letter (src/modules/claims/letter.ts, TEST_LETTER_PATH)" },
];

const COPY_DIR = 'Caprebate/09-app/backend/copies';
/** The folder's own note, which is not a copy. */
const NOT_COPIES = new Set(['README.md']);

const copyOf = (original) => path.posix.join(COPY_DIR, path.posix.basename(original));

/** Compare every copy with its original. repo = the repository root. Returns { problems: [text] }. */
function check({ repo, copies = COPIES }) {
  const problems = [];
  const fix = 'run `npm run copies` in Caprebate/09-app/backend';
  for (const c of copies) {
    const orig = path.join(repo, c.original);
    const copy = path.join(repo, copyOf(c.original));
    if (!fs.existsSync(orig)) { problems.push(`${c.original} is missing, so its copy cannot be checked: put it back.`); continue; }
    if (!fs.existsSync(copy)) { problems.push(`${copyOf(c.original)} is missing: ${fix}.`); continue; }
    if (!fs.readFileSync(orig).equals(fs.readFileSync(copy))) {
      problems.push(`${copyOf(c.original)} is not the same as ${c.original}: ${fix} (edit the original, never the copy).`);
    }
  }
  const dir = path.join(repo, COPY_DIR);
  const named = new Set(copies.map((c) => path.posix.basename(c.original)));
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.') || NOT_COPIES.has(name) || named.has(name)) continue;
      problems.push(`${COPY_DIR}/${name} is not a copy this check knows: delete it, or add its original to COPIES in tools/app-copies.cjs.`);
    }
  }
  return { problems };
}

/** Bring every copy up to date. Returns the copies it changed. */
function write({ repo, copies = COPIES }) {
  const changed = [];
  fs.mkdirSync(path.join(repo, COPY_DIR), { recursive: true });
  for (const c of copies) {
    const bytes = fs.readFileSync(path.join(repo, c.original));
    const copy = path.join(repo, copyOf(c.original));
    if (fs.existsSync(copy) && fs.readFileSync(copy).equals(bytes)) continue;
    fs.writeFileSync(copy, bytes);
    changed.push(copyOf(c.original));
  }
  return changed;
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-app-copies-'));
  const copies = [{ original: 'a site.html', why: 'test' }, { original: 'Caprebate/06/x.docx', why: 'test' }];
  fs.mkdirSync(path.join(tmp, 'Caprebate', '06'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'a site.html'), '<p>one</p>\n');
  fs.writeFileSync(path.join(tmp, 'Caprebate', '06', 'x.docx'), Buffer.from([0x50, 0x4b, 3, 4, 0, 255]));
  const cases = [];
  const expect = (name, wantProblems, match) => {
    const r = check({ repo: tmp, copies });
    const good = wantProblems ? r.problems.length > 0 && (!match || r.problems.some((p) => match.test(p))) : r.problems.length === 0;
    cases.push([name, good, r.problems]);
  };
  expect('before any copy is made, the check fails', true, /is missing: run `npm run copies`/);
  const first = write({ repo: tmp, copies });
  cases.push(['--write makes both copies', first.length === 2, first]);
  expect('a clean tree passes', false);
  cases.push(['--write again changes nothing', write({ repo: tmp, copies }).length === 0, []]);
  const copy = path.join(tmp, COPY_DIR, 'a site.html');
  fs.writeFileSync(copy, '<p>two</p>\n');
  expect('a copy edited by hand fails', true, /is not the same as a site\.html/);
  write({ repo: tmp, copies });
  fs.writeFileSync(path.join(tmp, 'a site.html'), '<p>one</p>\r\n');
  expect('an original changed by one byte, with the copy not refreshed, fails', true, /is not the same/);
  write({ repo: tmp, copies });
  expect('--write brings it back in step', false);
  fs.rmSync(path.join(tmp, COPY_DIR, 'x.docx'));
  expect('a missing copy fails', true, /x\.docx is missing/);
  write({ repo: tmp, copies });
  fs.writeFileSync(path.join(tmp, COPY_DIR, 'stray.csv'), 'x\n');
  expect('a file in copies/ that is no known copy fails', true, /stray\.csv is not a copy this check knows/);
  fs.rmSync(path.join(tmp, COPY_DIR, 'stray.csv'));
  fs.writeFileSync(path.join(tmp, COPY_DIR, 'README.md'), 'note\n');
  expect("the folder's README is not a copy and passes", false);
  fs.rmSync(path.join(tmp, 'Caprebate', '06', 'x.docx'));
  expect('a lost original fails', true, /x\.docx is missing, so its copy cannot be checked/);
  fs.rmSync(tmp, { recursive: true, force: true });

  let ok = 0;
  for (const [name, good, problems] of cases) {
    console.log((good ? '  ✔ ' : '  ✘ ') + name);
    if (!good) for (const p of problems) console.log('      ' + p);
    if (good) ok++;
  }
  console.log(`\napp-copies self-test: ${ok} of ${cases.length} held`);
  return ok === cases.length;
}

module.exports = { check, write, COPIES, COPY_DIR, copyOf };

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  const repo = path.join(__dirname, '..', '..', '..', '..');
  if (process.argv.includes('--write')) {
    const changed = write({ repo });
    console.log(changed.length ? `app-copies — brought up to date:\n${changed.map((c) => '  ' + c).join('\n')}`
      : 'app-copies — every copy was already the same as its original.');
    process.exit(0);
  }
  const r = check({ repo });
  if (r.problems.length) {
    console.error(`app-copies FAILED — the app's copies are not the same as their originals (${r.problems.length}):\n`);
    for (const p of r.problems) console.error('  ' + p);
    process.exit(1);
  }
  console.log(`app-copies — the app's ${COPIES.length} copies in ${COPY_DIR} are the same as their originals, byte for byte.`);
}
