/**
 * Caprebate — NSPL ingest runner. Board item 12991298199.
 *
 * A COMMAND-LINE JOB, NOT PART OF THE ENGINE. It reads a CSV the operator has
 * already downloaded and writes a JSON table. It makes no network call — see
 * `onsFetchNotWired` in the module — so downloading the file is a deliberate
 * human step, and that is the design, not a gap in it.
 *
 * Run:
 *   node --experimental-strip-types caprebate-postcode-authority-ingest.ts \
 *        --csv NSPL_AUG_2026.csv --names LAD_names_and_codes.csv \
 *        --release AUG_2026 --sqlite cb-ons-postcode-authority.sqlite
 *
 * WRITE THE SQLITE FILE, NOT THE JSON — added by Phase 110, and it is the
 * recommended output. The JSON is 290 MB and costs about 630 MB of resident
 * memory to serve from; the SQLite file is 75 MB and about 11 MB. Both
 * measured, at the real shape and scale, by
 * `caprebate-postcode-store-costing.cjs`. `--out` still writes the JSON for
 * anyone who wants it, and `--sqlite` can be given instead of or as well as.
 *
 * DO NOT COMMIT EITHER OUTPUT INTO THIS REPOSITORY. It is roughly 2.7 million
 * rows of third-party licensed data. The repository holds the mechanism; the
 * deployment holds the table. Every other Phase 9 table follows the same rule
 * for licence reasons — this one follows it for size and hygiene reasons, and
 * the rule is the same either way.
 */

import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { createNsplIngest, NSPL_COLUMNS_VERIFIED, ONS_LICENCE, attributionFor } from './caprebate-postcode-authority.ts';
import { buildSqliteStore, type SqliteOpen } from './caprebate-postcode-store.ts';

const openSqlite: SqliteOpen = (path, opts) =>
  new DatabaseSync(path, { readOnly: opts.readOnly }) as never;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const csvPath = arg('csv');
  const namesPath = arg('names');
  const release = arg('release');
  const sqlitePath = arg('sqlite');
  /* `--out` no longer has a default. Before Phase 110 it defaulted to the
     JSON, so a run that wanted only the SQLite file wrote 290 MB nobody
     asked for. Give one, the other, or both — but not neither. */
  const out = arg('out');

  if (!csvPath || !release || (!out && !sqlitePath)) {
    console.error(
      'usage: --csv <NSPL csv> --release <e.g. AUG_2026> [--names <LAD names csv>]\n' +
      '       (--sqlite <file> and/or --out <json>; at least one is required)\n' +
      '\n' +
      'PREFER --sqlite. 75 MB on disk and about 11 MB resident, against 290 MB\n' +
      'and about 630 MB for the JSON. Both measured — see\n' +
      'caprebate-postcode-store-costing.cjs.\n' +
      '\n' +
      'The NSPL download is free and needs no key: ONS Open Geography Portal,\n' +
      'National Statistics Postcode Lookup, Open Government Licence v3.0.\n' +
      'READ THE REAL HEADER FIRST and check assumption A-1 — the module expects\n' +
      `columns ${JSON.stringify(NSPL_COLUMNS_VERIFIED)}.\n` +
      'Both the local-authority and the region column are VERSIONED BY RELEASE\n' +
      'YEAR and fall back to a pattern; the run prints which it used and the\n' +
      'refresh procedure says to read those two lines.',
    );
    process.exit(2);
  }

  const year = Number((release.match(/(\d{4})/) || [])[1]);
  if (!Number.isFinite(year)) {
    console.error(`--release '${release}' must contain a four-digit year; it sets the attribution year.`);
    process.exit(2);
  }

  /* Names are optional but strongly wanted: without them every lad_name is the
     GSS code, which is correct but unreadable in a surveyor's report. */
  const ladNames: Record<string, string> = {};
  if (namesPath) {
    const rows = readFileSync(namesPath, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '');
    const head = rows[0].split(',').map((h) => h.trim().toLowerCase());
    const codeAt = head.findIndex((h) => /cd$/.test(h) || h === 'code');
    const nameAt = head.findIndex((h) => /nm$/.test(h) || h === 'name');
    if (codeAt < 0 || nameAt < 0) {
      console.error(`could not find a code column and a name column in ${namesPath}. Header: ${head.join(',')}`);
      process.exit(2);
    }
    for (const r of rows.slice(1)) {
      const c = r.split(',');
      if (c[codeAt] && c[nameAt]) ladNames[c[codeAt].trim()] = c[nameAt].trim();
    }
  }

  /* STREAMED, LINE BY LINE, AND THAT IS NOT AN OPTIMISATION. The real UK
     extract is 964 MB of CSV and Node's maximum string length is about 512 MB,
     so readFileSync(path, 'utf8') throws ERR_STRING_TOO_LONG before parsing a
     single row. Every unit test passed on three-line fixtures. */
  const ing = createNsplIngest(
    ladNames,
    { release, release_year: year, verified_at: new Date().toISOString().slice(0, 10) },
  );

  let n = 0;
  const rl = createInterface({
    input: createReadStream(csvPath, 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    n++;
    if (line.trim() === '') continue;
    if (n === 1) { ing.header(line); continue; }
    ing.row(line, n);
    if (n % 500000 === 0) console.error(`  ...${n.toLocaleString()} lines`);
  }
  const { table, quarantined } = ing.finish();

  if (out) writeFileSync(out, JSON.stringify(table), 'utf8');
  let built: { rows: number; authorities: number } | null = null;
  if (sqlitePath) built = buildSqliteStore(openSqlite, sqlitePath, table);

  const byCode: Record<string, number> = {};
  for (const q of quarantined) byCode[q.code] = (byCode[q.code] || 0) + 1;

  if (out) console.log(`wrote ${out}`);
  if (sqlitePath) console.log(`wrote ${sqlitePath}  (${built!.rows} rows, ${built!.authorities} authorities)`);
  console.log(`  postcodes      ${table.record_count}`);
  console.log(`  authorities    ${new Set(Object.values(table.byPostcode).map((r) => r.lad_code)).size}`);
  console.log(`  release        ${table.release}`);
  /* READ THESE TWO LINES ON EVERY REFRESH. ONS renames both columns by
     release year, the ingest falls back to a pattern rather than failing, and
     these are the only place it says what it actually read. The refresh
     procedure requires them to be recorded. */
  console.log(`  lad column     ${table.lad_column_used}`);
  console.log(`  region column  ${table.region_column_used === null
    ? 'NONE FOUND — every region will be unknown and the surveyor rate library ' +
      'stays keyed on region-not-captured. Not fatal; the resolver still answers.'
    : table.region_column_used}`);
  console.log(`  lines read     ${n}`);
  console.log(`  quarantined    ${quarantined.length}`);
  for (const [code, n] of Object.entries(byCode)) console.log(`    ${code.padEnd(28)} ${n}`);
  if (!namesPath) console.log('  NOTE: no --names given, so every authority name is its GSS code.');
  console.log('\nAttribution that must travel with any output built on this table:');
  for (const line of attributionFor(table)) console.log(`  ${line}`);
  console.log(`\n${ONS_LICENCE.excluded_territory.territory} rows were dropped at ingest: ` +
    `${byCode.E_NORTHERN_IRELAND_ROW || 0}. That is the licence carve-out, not a defect.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
