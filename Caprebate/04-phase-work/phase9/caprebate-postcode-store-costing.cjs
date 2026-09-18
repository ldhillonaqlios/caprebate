/**
 * Caprebate — WHAT EACH POSTCODE-STORE OPTION ACTUALLY COSTS.
 *
 * Phase 110, 9 September 2026. Board item 12993800139.
 *
 * WHY THIS FILE EXISTS AND NOT A PARAGRAPH OF PROSE. Phase 110's first job was
 * to choose where a 292 MB postcode table lives at runtime, and its own prompt
 * costed option (a) as "~292 MB resident per process". THAT FIGURE IS THE FILE
 * SIZE, NOT THE RESIDENT SIZE, and the two are not close: 2.66 million string
 * keys and 2.66 million small objects cost several times their serialised
 * form in a JavaScript heap. Choosing between three options on a number that
 * is wrong by a factor is how a deployment decision goes wrong quietly, so
 * the numbers are MEASURED here rather than asserted anywhere.
 *
 * THE DATA IS SYNTHETIC AND SAYING SO IS THE POINT. The real ONS download is
 * not on this machine and MUST NOT enter this repository (292 MB of JSON, and
 * the rule is in caprebate-postcode-authority.md §9). What is reproduced here
 * is the SHAPE AND SCALE of the real table, taken from the real ingest run of
 * 8 September 2026: 2,657,599 postcodes, 352 billing authorities, the same
 * four fields per row, the same GSS code widths, the same proportion
 * terminated. Memory and disk cost follow shape and scale, not content, so
 * the figures transfer. Lookup CORRECTNESS does not, and is not claimed here —
 * that is what caprebate-postcode-authority.test.ts is for.
 *
 * EACH MEASUREMENT RUNS IN ITS OWN PROCESS. A resident-set figure taken after
 * another option has already run measures the high-water mark of the run, not
 * the option. --mode is how a child says which one it is.
 *
 * Run:  cd phase9 && node caprebate-postcode-store-costing.cjs
 *       (about two minutes and ~4 GB of peak heap in the JSON child)
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/* ------------------------------------------------------------------ *
 * The real shape, from the real run of 8 September 2026
 * ------------------------------------------------------------------ */

const REAL = {
  /* Both of these are FACTS from the real ingest run of 8 September 2026,
     recorded in caprebate-postcode-authority.md §5.4. */
  postcodes: 2657599,
  authorities: 352,

  /* The three below are ASSUMPTIONS, and they are labelled because the file
     they would have come from is not on this machine and must never be in
     this repository. Each is stated so a later reader can correct it. */

  /* Roughly a third of the postcodes NSPL carries are terminated. Only the
     terminated_on column's null/non-null ratio depends on this, and that
     column is one pointer either way, so the memory figures barely move. */
  terminated_share: 0.33,

  /* THE COUNTRY SPLIT OF THE 352 AUTHORITIES. England had 296 local authority
     districts, Wales 22 and Scotland 32 in the 2025/26 vintages, which is 350
     against the 352 the real run counted — near enough that the split is a
     fair basis and far enough that it is an assumption and not a fact.
     Northern Ireland's 11 are absent because NI rows are dropped at ingest. */
  lads: { E: 296, W: 22, S: 32 },

  /* POSTCODES PER AUTHORITY IS NOT UNIFORM, and Scotland's share is the only
     number option (c) turns on. Taken as about 8% of GB postcodes.
     THE CONCLUSION IS INSENSITIVE TO THIS. At 5% or at 12% the saving is a
     small fraction of a heap that is an order of magnitude too large either
     way, which is exactly why the measurement below reports the saving in
     megabytes rather than leaving it as a percentage. */
  scotland_share: 0.08,
};

const MB = (bytes) => (bytes / 1048576).toFixed(1) + ' MB';

/* ------------------------------------------------------------------ *
 * The generator — same shape, same widths, no real data
 * ------------------------------------------------------------------ */

/** Deterministic, so two runs are comparable and nobody has to re-measure. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * 352 authorities: 9-character GSS codes and names of realistic length, split
 * across the three countries in the proportions REAL.lads records.
 *
 * THE FIRST LETTER OF A GSS CODE IS THE COUNTRY, and that is not decoration
 * here — it is the only thing option (c) can trim on, and it is the same
 * letter the resolver stores as country_code when NSPL gives no country
 * column of its own.
 */
function authorities() {
  const out = [];
  const push = (letter, prefix, count) => {
    for (let i = 0; i < count; i++) {
      out.push({
        code: prefix + String(100000 + out.length).slice(0, 6),
        name: 'Authority District ' + String(out.length).padStart(3, '0'),
        country: letter,
      });
    }
  };
  /* E06 unitary, E07 non-metropolitan district, E08 metropolitan borough,
     E09 London borough; W06 and S12 are the Welsh and Scottish equivalents. */
  push('E', 'E06', REAL.lads.E);
  push('W', 'W06', REAL.lads.W);
  push('S', 'S12', REAL.lads.S);
  /* Top up to the 352 the real run actually counted. */
  while (out.length < REAL.authorities) push('E', 'E07', 1);
  return out;
}

/**
 * Feeds rows one at a time so the generator itself never holds the table.
 * Each row is exactly PostcodeAuthorityRow plus the postcode key.
 */
function eachRow(fn, limit) {
  const rnd = mulberry32(20260909);
  const all = authorities();
  const scots = all.filter((x) => x.country === 'S');
  const rest = all.filter((x) => x.country !== 'S');
  const n = limit === undefined ? REAL.postcodes : limit;
  let made = 0;
  /* Canonical form, as normalisePostcode returns it: 'CF10 3NB'. */
  for (let a = 0; a < 26 && made < n; a++) {
    for (let b = 0; b < 26 && made < n; b++) {
      for (let d = 0; d < 100 && made < n; d++) {
        for (let e = 0; e < 10 && made < n; e++) {
          for (let f = 0; f < 26 && made < n; f++) {
            for (let g = 0; g < 26 && made < n; g++) {
              const pc = A[a] + A[b] + d + ' ' + e + A[f] + A[g];
              /* Deterministic, and Scottish in about REAL.scotland_share of
                 rows — a modulus rather than the random source so the split
                 is exact and reproducible. */
              const isScots = made % 100 < Math.round(REAL.scotland_share * 100);
              const lad = isScots
                ? scots[made % scots.length]
                : rest[made % rest.length];
              fn(pc, {
                lad_code: lad.code,
                lad_name: lad.name,
                country_code: lad.code[0],
                terminated_on: rnd() < REAL.terminated_share ? '2019-11-01' : null,
              });
              made++;
            }
          }
        }
      }
    }
  }
  return made;
}

/* ------------------------------------------------------------------ *
 * (a) the whole table as a JavaScript object
 * ------------------------------------------------------------------ */

function modeJson(outDir) {
  const before = process.memoryUsage();
  const byPostcode = Object.create(null);
  const n = eachRow((pc, row) => { byPostcode[pc] = row; });
  const after = process.memoryUsage();

  /* Serialise through a stream: JSON.stringify of the whole object produces a
     string, and a ~292 MB string is well inside Node's ~512 MB limit but the
     ingest that BUILT it needed --max-old-space-size=10240, which is itself
     the clearest evidence about (a). */
  const file = path.join(outDir, 'cb-ons-postcode-authority.json');
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, '{"table_id":"CB_ONS_POSTCODE_AUTHORITY","loaded":true,' +
    '"record_count":' + n + ',"byPostcode":{');
  let first = true;
  let buf = '';
  for (const pc in byPostcode) {
    buf += (first ? '' : ',') + JSON.stringify(pc) + ':' + JSON.stringify(byPostcode[pc]);
    first = false;
    if (buf.length > 4194304) { fs.writeSync(fd, buf); buf = ''; }
  }
  fs.writeSync(fd, buf + '}}');
  fs.closeSync(fd);

  const bytes = fs.statSync(file).size;

  /* A lookup, so the object cannot be optimised away and the cost is real. */
  const t0 = process.hrtime.bigint();
  let hits = 0;
  eachRow((pc) => { if (byPostcode[pc] !== undefined) hits++; }, 10000);
  const t1 = process.hrtime.bigint();

  report({
    mode: 'json',
    rows: n,
    file_bytes: bytes,
    heap_used_delta: after.heapUsed - before.heapUsed,
    rss: process.memoryUsage().rss,
    lookups: 10000,
    lookup_hits: hits,
    lookup_ns_total: Number(t1 - t0),
  });
}

/* ------------------------------------------------------------------ *
 * (b) a keyed store — SQLite, built once, opened read-only
 * ------------------------------------------------------------------ */

function modeSqliteBuild(outDir) {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(outDir, 'cb-ons-postcode-authority.sqlite');
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
  db.exec(`CREATE TABLE postcode_authority (
             postcode      TEXT PRIMARY KEY,
             lad_code      TEXT NOT NULL,
             country_code  TEXT NOT NULL,
             terminated_on TEXT
           ) WITHOUT ROWID;
           CREATE TABLE authority_name (
             lad_code TEXT PRIMARY KEY,
             lad_name TEXT NOT NULL
           ) WITHOUT ROWID;`);

  /* THE NAME IS NORMALISED OUT AND THAT IS MOST OF THE SAVING. 2.66 million
     copies of 352 distinct authority names is the single largest redundancy
     in the JSON shape. The resolver's row type is unchanged — the adapter
     joins on the way out. */
  const ins = db.prepare('INSERT INTO postcode_authority VALUES (?,?,?,?)');
  const insName = db.prepare('INSERT OR IGNORE INTO authority_name VALUES (?,?)');
  db.exec('BEGIN');
  let n = 0;
  eachRow((pc, row) => {
    ins.run(pc, row.lad_code, row.country_code, row.terminated_on);
    insName.run(row.lad_code, row.lad_name);
    if (++n % 250000 === 0) { db.exec('COMMIT'); db.exec('BEGIN'); }
  });
  db.exec('COMMIT');
  db.exec('VACUUM');
  db.close();

  report({ mode: 'sqlite-build', rows: n, file_bytes: fs.statSync(file).size,
           rss: process.memoryUsage().rss });
}

function modeSqliteRead(outDir) {
  const { DatabaseSync } = require('node:sqlite');
  const file = path.join(outDir, 'cb-ons-postcode-authority.sqlite');
  const baseline = process.memoryUsage().rss;
  const db = new DatabaseSync(file, { readOnly: true });
  const q = db.prepare(
    `SELECT p.lad_code, a.lad_name, p.country_code, p.terminated_on
       FROM postcode_authority p JOIN authority_name a USING (lad_code)
      WHERE p.postcode = ?`);

  const keys = [];
  eachRow((pc) => { keys.push(pc); }, 10000);

  const t0 = process.hrtime.bigint();
  let hits = 0;
  for (const k of keys) if (q.get(k) !== undefined) hits++;
  const t1 = process.hrtime.bigint();

  report({ mode: 'sqlite-read', file_bytes: fs.statSync(file).size,
           rss_baseline: baseline, rss: process.memoryUsage().rss,
           lookups: keys.length, lookup_hits: hits,
           lookup_ns_total: Number(t1 - t0) });
}

/* ------------------------------------------------------------------ *
 * (c) trimmed to what we serve
 * ------------------------------------------------------------------ */

function modeTrimmed(outDir) {
  const before = process.memoryUsage();
  const byPostcode = Object.create(null);
  let seen = 0, kept = 0;
  eachRow((pc, row) => {
    seen++;
    /* England and Wales only — the served set today. A GSS code's first
       letter is the country, which is why the resolver keeps country_code. */
    if (row.country_code === 'E' || row.country_code === 'W') {
      byPostcode[pc] = row; kept++;
    }
  });
  const after = process.memoryUsage();

  const file = path.join(outDir, 'cb-ons-postcode-authority-ew.json');
  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, '{"byPostcode":{');
  let first = true, buf = '';
  for (const pc in byPostcode) {
    buf += (first ? '' : ',') + JSON.stringify(pc) + ':' + JSON.stringify(byPostcode[pc]);
    first = false;
    if (buf.length > 4194304) { fs.writeSync(fd, buf); buf = ''; }
  }
  fs.writeSync(fd, buf + '}}');
  fs.closeSync(fd);

  report({ mode: 'trimmed', rows_seen: seen, rows_kept: kept,
           file_bytes: fs.statSync(file).size,
           heap_used_delta: after.heapUsed - before.heapUsed,
           rss: process.memoryUsage().rss });
}

/* ------------------------------------------------------------------ */

function report(o) {
  process.stdout.write('__RESULT__' + JSON.stringify(o) + '\n');
}

const MODES = {
  json: modeJson,
  'sqlite-build': modeSqliteBuild,
  'sqlite-read': modeSqliteRead,
  trimmed: modeTrimmed,
};

function child() {
  const i = process.argv.indexOf('--mode');
  if (i < 0) return false;
  const mode = process.argv[i + 1];
  const outDir = process.argv[process.argv.indexOf('--out') + 1];
  MODES[mode](outDir);
  return true;
}

function parent() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-postcode-costing-'));
  const results = {};
  const order = ['json', 'trimmed', 'sqlite-build', 'sqlite-read'];
  for (const mode of order) {
    process.stderr.write('  measuring ' + mode + ' ...\n');
    const out = execFileSync(process.execPath, [
      /* The JSON child genuinely needs the headroom; the ingest that built
         the real 292 MB file was run with --max-old-space-size=10240 for
         exactly this reason, and that is a cost of option (a), not a detail. */
      '--max-old-space-size=8192', __filename, '--mode', mode, '--out', outDir,
    ], { encoding: 'utf8', maxBuffer: 1 << 24 });
    const line = out.split('\n').find((l) => l.startsWith('__RESULT__'));
    results[mode] = JSON.parse(line.slice('__RESULT__'.length));
  }

  const j = results.json, t = results.trimmed;
  const sb = results['sqlite-build'], sr = results['sqlite-read'];

  console.log('');
  console.log('CAPREBATE — postcode store, measured cost of each option');
  console.log('Synthetic data at the real shape and scale: ' + j.rows.toLocaleString() +
              ' postcodes, ' + REAL.authorities + ' authorities.');
  console.log('Machine: ' + os.platform() + ' ' + os.arch() + ', node ' + process.version);
  console.log('');
  console.log('(a) JSON IN MEMORY');
  console.log('    serialised file        ' + MB(j.file_bytes));
  console.log('    heap held by the table ' + MB(j.heap_used_delta));
  console.log('    process resident set   ' + MB(j.rss));
  console.log('    ' + j.lookups.toLocaleString() + ' lookups            ' +
              (j.lookup_ns_total / j.lookups / 1000).toFixed(2) + ' us each (' +
              j.lookup_hits + ' hits)');
  console.log('');
  console.log('(b) KEYED STORE — SQLite, built once, opened read-only');
  console.log('    database file          ' + MB(sb.file_bytes));
  console.log('    resident set, reading  ' + MB(sr.rss) +
              '  (baseline before open ' + MB(sr.rss_baseline) + ')');
  console.log('    ' + sr.lookups.toLocaleString() + ' lookups            ' +
              (sr.lookup_ns_total / sr.lookups / 1000).toFixed(2) + ' us each (' +
              sr.lookup_hits + ' hits)');
  console.log('');
  console.log('(c) TRIMMED TO ENGLAND AND WALES');
  console.log('    kept                   ' + t.rows_kept.toLocaleString() + ' of ' +
              t.rows_seen.toLocaleString() + '  (' +
              (100 * t.rows_kept / t.rows_seen).toFixed(1) + '%)');
  console.log('    serialised file        ' + MB(t.file_bytes) + '  (saves ' +
              MB(j.file_bytes - t.file_bytes) + ')');
  console.log('    heap held by the table ' + MB(t.heap_used_delta) + '  (saves ' +
              MB(j.heap_used_delta - t.heap_used_delta) + ')');
  console.log('');
  console.log('Scratch directory (delete when done): ' + outDir);
  console.log('__MACHINE__' + JSON.stringify(results));
}

if (!child()) parent();
