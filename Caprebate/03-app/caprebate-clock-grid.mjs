// caprebate-clock-grid.mjs — run a suite under many process clocks and name
// every test whose result depends on when it runs. Added by Phase 132,
// 14 September 2026, after the Phase 130 sweep found "a taken slot is not
// offered twice" red on a Sunday afternoon only, fixed that one test, and could
// not say whether it was the only one.
//
//   node 03-app/caprebate-clock-grid.mjs --suite backend [--jobs 4]
//   node 03-app/caprebate-clock-grid.mjs --suite phase3 --suite phase9
//   node 03-app/caprebate-clock-grid.mjs --suite backend --at 2026-09-13T15:45:00Z
//   node 03-app/caprebate-clock-grid.mjs --suite backend --file test/x.test.ts --at ...
//   node 03-app/caprebate-clock-grid.mjs --self-test
//
// THE GRID, BY DEFAULT: every 30 minutes over one Monday-to-Sunday week (UTC,
// which covers every local half-hour of the same week), both 2026 UK clock
// changes at 00:30-02:30 UTC in 30-minute steps, 31 December 23:59:50, and
// 29 February 2028 at 00:00, 12:00 and 23:59:50. Each instant runs the suite
// once under 03-app/caprebate-clock-shift.mjs.
//
// A RED INSTANT IS RUN A SECOND TIME before it is reported. Red twice is
// CLOCK-BOUND; red then green is a FLAKE, reported separately, because the back
// end has had a flake that failed about one run in eighty-five (a seeded 0.3
// matched inside a timestamp's milliseconds, CRM 9 of 10) and 350 runs would
// otherwise report it as a clock dependency several times over.
//
// WHAT THIS CANNOT SEE. The shift moves Date and nothing else: performance.now,
// timers and anything reading the OS clock outside JavaScript are untouched.
// None of the suites' SQL reads the clock (no CURRENT_TIMESTAMP or 'now' in
// 09-app/backend, checked 14 Sep 2026), so for these suites that gap is empty.
// The process time zone is the machine's own; run with TZ=... to vary it.
//
// Exit 0 when every instant is green or a flake, 1 when any test is clock-bound,
// 2 when it could not run. It writes nothing on disk except --out.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHIFT = path.join(HERE, 'caprebate-clock-shift.mjs');

const SUITES = {
  backend: { cwd: path.join(ROOT, '09-app', 'backend'), files: dir =>
    fs.readdirSync(path.join(dir, 'test')).filter(f => /\.test\.ts$/.test(f)).sort().map(f => path.join('test', f)) },
  phase3: { cwd: path.join(ROOT, '04-phase-work', 'phase3'), files: () => [] },
  phase9: { cwd: path.join(ROOT, '04-phase-work', 'phase9'), files: () => [] },
};

export function defaultGrid() {
  const at = [];
  const monday = Date.parse('2026-09-14T00:00:00Z');
  for (let i = 0; i < 7 * 48; i++) at.push(new Date(monday + i * 1_800_000).toISOString());
  for (const day of ['2026-03-29', '2026-10-25']) {
    for (const t of ['00:30', '01:00', '01:30', '02:00', '02:30']) at.push(`${day}T${t}:00.000Z`);
  }
  at.push('2026-12-31T23:59:50.000Z');
  for (const t of ['00:00:00', '12:00:00', '23:59:50']) at.push(`2028-02-29T${t}.000Z`);
  return at;
}

// node --test's TAP: every failing test or suite is a "not ok N - name" line,
// indented by nesting. Keep the innermost ones: a failing suite is only red
// because something inside it is.
export function failingNames(tap) {
  const rows = [];
  for (const line of String(tap).split(/\r?\n/)) {
    const m = /^(\s*)not ok \d+ - (.+?)\s*(#.*)?$/.exec(line);
    if (m) rows.push({ depth: m[1].length, name: m[2] });
  }
  // TAP prints children before their parent, and a red child always makes its
  // parent red, so a row is a parent exactly when the red row before it is deeper.
  const out = [];
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (!(prev && prev.depth > r.depth) && !out.includes(r.name)) out.push(r.name);
  });
  return out;
}

function totals(tap) {
  const n = k => { const m = new RegExp(`^# ${k} (\\d+)`, 'm').exec(tap); return m ? +m[1] : null; };
  return { tests: n('tests'), pass: n('pass'), fail: n('fail'), cancelled: n('cancelled') };
}

function runOnce(suite, at, files, testConcurrency) {
  const s = SUITES[suite];
  const list = files && files.length ? files : s.files(s.cwd);
  const args = ['--import', SHIFT, '--test', '--test-reporter=tap', `--test-concurrency=${testConcurrency}`, ...list];
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { cwd: s.cwd, env: { ...process.env, CB_FAKE_NOW: at } });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => {
      const t = totals(out);
      resolve({ at, code, ...t, failed: failingNames(out), ran: t.tests !== null, tail: t.tests === null ? out.slice(-2000) : undefined });
    });
  });
}

async function pool(items, jobs, fn, onDone) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
      onDone(++done, items.length, results[i]);
    }
  }));
  return results;
}

function selfTest() {
  const cases = [];
  const tap = [
    'TAP version 13',
    '# Subtest: portal',
    '    # Subtest: a taken slot is not offered twice',
    '    not ok 1 - a taken slot is not offered twice',
    '    ok 2 - fine',
    'not ok 1 - portal',
    'ok 2 - other',
    'not ok 3 - top-level leaf',
    '# tests 4', '# pass 2', '# fail 2',
  ].join('\n');
  const names = failingNames(tap);
  cases.push(['keeps the inner failing test', names.includes('a taken slot is not offered twice')]);
  cases.push(['drops the suite that failed only because of it', !names.includes('portal')]);
  cases.push(['keeps a failing top-level test', names.includes('top-level leaf')]);
  cases.push(['reads the totals', totals(tap).fail === 2 && totals(tap).pass === 2]);
  const g = defaultGrid();
  cases.push(['grid has 336 week instants plus 14 edges', g.length === 350]);
  cases.push(['grid carries both clock changes', g.includes('2026-03-29T01:00:00.000Z') && g.includes('2026-10-25T01:00:00.000Z')]);
  cases.push(['grid carries the leap day and year end', g.includes('2028-02-29T23:59:50.000Z') && g.includes('2026-12-31T23:59:50.000Z')]);
  let bad = 0;
  for (const [name, ok] of cases) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) bad++; }
  process.exit(bad ? 1 : 0);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) return selfTest();
  const get = k => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
  const suites = get('--suite');
  if (!suites.length || suites.some(s => !SUITES[s])) {
    console.error('caprebate-clock-grid: give --suite backend|phase3|phase9 (repeatable)');
    process.exit(2);
  }
  const at = get('--at').length ? get('--at').map(a => new Date(a).toISOString()) : defaultGrid();
  const files = get('--file');
  const jobs = +(get('--jobs')[0] || Math.max(1, Math.floor(os.availableParallelism() / 3)));
  const testConcurrency = +(get('--test-concurrency')[0] || 3);
  const outFile = get('--out')[0];
  const report = { started: new Date().toISOString(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, suites: {} };
  let clockBound = 0, couldNotRun = 0;
  for (const suite of suites) {
    const t0 = Date.now();
    const first = await pool(at, jobs, a => runOnce(suite, a, files, testConcurrency), (d, n, r) => {
      if (!r.ran || r.fail) process.stderr.write(`\n[${suite}] ${r.at} ${r.ran ? `fail ${r.fail}: ${r.failed.join(' | ')}` : 'DID NOT RUN'}\n`);
      if (d % 10 === 0 || d === n) process.stderr.write(`[${suite}] ${d}/${n}\n`);
    });
    const red = first.filter(r => r.ran && r.fail);
    const again = await pool(red.map(r => r.at), jobs, a => runOnce(suite, a, files, testConcurrency), () => {});
    const byTest = {};
    const flakes = {};
    red.forEach((r, i) => {
      const second = new Set(again[i].failed);
      for (const name of r.failed) {
        const bucket = second.has(name) ? byTest : flakes;
        (bucket[name] ||= []).push(r.at);
      }
    });
    const notRun = first.filter(r => !r.ran);
    const passCounts = [...new Set(first.filter(r => r.ran).map(r => r.pass + r.fail))];
    report.suites[suite] = {
      instants: at.length, seconds: Math.round((Date.now() - t0) / 1000), testsPerRun: passCounts,
      green: first.filter(r => r.ran && !r.fail).length, clockBound: byTest, flakes,
      didNotRun: notRun.map(r => ({ at: r.at, tail: r.tail })),
    };
    clockBound += Object.keys(byTest).length;
    couldNotRun += notRun.length;
    console.log(`\n${suite}: ${at.length} instants, ${report.suites[suite].green} green, tests per run ${passCounts.join('/')}`);
    for (const [name, list] of Object.entries(byTest)) console.log(`  CLOCK-BOUND  ${name}\n               ${list.length} instant(s): ${list.slice(0, 6).join(', ')}${list.length > 6 ? ', ...' : ''}`);
    for (const [name, list] of Object.entries(flakes)) console.log(`  FLAKE        ${name}  (red once, green on re-run: ${list.join(', ')})`);
    for (const r of notRun) console.log(`  DID NOT RUN  ${r.at}`);
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  process.exit(couldNotRun ? 2 : clockBound ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
