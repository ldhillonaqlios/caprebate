/**
 * BUILD THE REFERENCE DATABASE — the quarterly refresh of the ONS postcode table and the OSTN15 grid. Phase 161h,
 * 7 November 2026 (src/integrations/postcodes/reference-db.ts says why it is a database of its own).
 *
 * RUN ON A COMPUTER, NEVER BY THE WEBSITE, in three steps (09-app/docs/LIVE-RUNBOOK.md, "Refresh the postcode table"):
 *
 *   1. The postcode table, with the ingest the postcode module already has (it reads the CSV you downloaded; it makes no
 *      network call):
 *        node 04-phase-work/phase9/caprebate-postcode-authority-ingest.ts --csv NSPL_<month>_<year>_UK.csv \
 *             --names LAD_names_and_codes.csv --release <MONTH_YEAR> --sqlite postcodes.sqlite
 *   2. This command adds Ordnance Survey's OSTN15 grid to a copy of that file and checks both:
 *        node tools/build-reference-db.ts --postcodes postcodes.sqlite --ostn15 OSTN15_OSGM15_DataFile.txt \
 *             --out caprebate-reference-<year>q<n>.db
 *   3. Upload it as a NEW database beside the old one, make a read-only token, change the two settings, redeploy:
 *        turso db create caprebate-reference-<year>q<n> --from-file caprebate-reference-<year>q<n>.db --group <group>
 *        turso db tokens create caprebate-reference-<year>q<n> --read-only
 *      Then delete the old one once the website answers from the new one.
 *
 * NEITHER FILE GOES IN THE REPOSITORY: about 2.7 million rows of licensed third-party data and a 50 MB grid. Write the
 * output outside the working copy; this command refuses a path inside it, as the key file is refused.
 */
import { copyFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadOstn15File, OSTN15_POINTS } from '../src/integrations/connectors/ostn15.ts';
import { OSTN15_SCHEMA } from '../src/integrations/postcodes/reference-db.ts';
import { isInside, repositoryRoot } from '../src/core/secrets.ts';

export type BuildResult = { readonly postcodes: number; readonly grid_points: number; readonly why: string };

/** Adds the grid to `out`, a copy of the ingest's file. Checks the copy has the postcode tables and a row in them. */
export function buildReferenceDb(o: { postcodes: string; ostn15: string; out: string; repoRoot?: string }): BuildResult {
  const root = o.repoRoot ?? repositoryRoot();
  const outAbs = resolve(o.out);
  const outDir = existsSync(dirname(outAbs)) ? realpathSync(dirname(outAbs)) : dirname(outAbs);
  if (isInside(outDir, root)) throw new Error('The reference database must be written outside the code folder: it holds licensed data and is far too large to commit.');
  if (existsSync(outAbs)) throw new Error('The output file is already there. Give a new name for each quarter, so the one in use is never overwritten.');
  const grid = loadOstn15File(o.ostn15);
  copyFileSync(o.postcodes, outAbs);
  const db = new DatabaseSync(outAbs);
  try {
    const has = (t: string): boolean => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(t) !== undefined;
    for (const t of ['postcode_authority', 'authority_name', 'table_meta']) {
      if (!has(t)) throw new Error(`The postcode file has no ${t} table: build it with the ingest's --sqlite first.`);
    }
    const postcodes = Number((db.prepare('SELECT COUNT(*) AS n FROM postcode_authority').get() as { n: number }).n);
    if (postcodes === 0) throw new Error('The postcode file has no postcodes in it.');
    if (has('ostn15_grid')) throw new Error('The postcode file already has a grid table: start from the ingest\'s own file.');
    db.exec(OSTN15_SCHEMA);
    const ins = db.prepare('INSERT INTO ostn15_grid (k, e_shift, n_shift, flag) VALUES (?, ?, ?, ?)');
    let points = 0;
    db.exec('BEGIN');
    for (let k = 0; k < OSTN15_POINTS; k++) {
      const e = grid.se[k] as number;
      if (Number.isNaN(e)) continue;
      ins.run(k, e, grid.sn[k] as number, grid.flag[k] as number);
      points++;
    }
    db.exec('COMMIT');
    db.exec('VACUUM');
    return { postcodes, grid_points: points, why: `${postcodes} postcodes and ${points} grid points, checked` };
  } finally {
    db.close();
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

if (import.meta.filename === process.argv[1]) {
  const postcodes = arg('postcodes'); const ostn15 = arg('ostn15'); const out = arg('out');
  if (postcodes === undefined || ostn15 === undefined || out === undefined) {
    console.error('usage: node tools/build-reference-db.ts --postcodes <the ingest\'s .sqlite> --ostn15 <OSTN15_OSGM15_DataFile.txt> --out <new file, outside the code folder>');
    process.exitCode = 2;
  } else {
    try {
      const r = buildReferenceDb({ postcodes, ostn15, out });
      console.log(`Built ${out}: ${r.why}.`);
      console.log('Next: turso db create <a new name> --from-file <that file> --group <the live group>; turso db tokens create <that name> --read-only;');
      console.log('then set CAPREBATE_REFERENCE_DB_URL and CAPREBATE_REFERENCE_DB_TOKEN in the live project and redeploy (LIVE-RUNBOOK.md).');
    } catch (e) {
      console.error(`Not built: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    }
  }
}
