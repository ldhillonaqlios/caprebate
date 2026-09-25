/**
 * CHECKS AN OSTN15 GRID FILE AGAINST ORDNANCE SURVEY'S OWN TEST POINTS, BEFORE IT IS TRUSTED. Phase 151a.
 *
 *   node tools/ostn15-verify.ts <OSTN15_OSGM15_DataFile.txt> <test input> <test output>
 *
 * The OSTN15 developer pack carries test files: ETRS89 latitudes and longitudes in, and the National Grid eastings
 * and northings Ordnance Survey's own software gives for them. This reads both, converts every input point with
 * src/connectors/ostn15.ts and the grid file, and exits 1 unless every point Ordnance Survey converted agrees to
 * the millimetre, and every point it did not convert is refused here too. Columns are found by their headings
 * (a point id, a latitude and a longitude; a point id, an easting and a northing); a file it cannot read that way is
 * refused (exit 2) rather than guessed at. All three files stay OUTSIDE the repository. No network.
 *
 * RUN ON THE MAC, 24 September 2026 (Phase 151a's addendum): Ordnance Survey's full developer pack is in
 * ~/caprebate-data/ostn15/, and all forty of its ETRS89-to-OSGB36 test points agree to the millimetre. Run it again on
 * the server the first time CAPREBATE_OSTN15_FILE is set there.
 *
 * THE EXIT CODES, and test/phase151c.test.ts proves each on a generated, INVENTED full grid in a temporary folder:
 *   0  every point Ordnance Survey converted agrees to the millimetre, every point it did not is refused here too,
 *      and at least one point was compared;
 *   1  a point disagrees, is refused where Ordnance Survey gives an answer, or is converted where it gives none
 *      (a blank cell in OS's output is no answer, never 0);
 *   2  NOTHING WAS CHECKED: a file is missing, unreadable, short of the grid's points or of a column we look for.
 *      Phase 151c: a grid file that could not be read used to end in a stack trace and exit 1, which reads as "a
 *      point was wrong" when no point was ever compared. It is now a plain sentence and exit 2.
 */
import { readFileSync } from 'node:fs';
import { loadOstn15File, etrs89ToBritishNationalGrid, Ostn15Error, type Ostn15Grid } from '../src/connectors/ostn15.ts';

const [gridPath, inPath, outPath] = process.argv.slice(2);
if (gridPath === undefined || inPath === undefined || outPath === undefined) {
  console.error('usage: node tools/ostn15-verify.ts <grid file> <test input> <test output>');
  process.exit(2);
}

/** Nothing was checked: say why in one sentence and exit 2 — never a stack trace, never exit 1. */
function couldNotRun(why: string): never {
  console.error(`${why} Nothing was checked.`);
  process.exit(2);
}

function table(path: string): { head: string[]; rows: string[][] } {
  let text: string;
  try { text = readFileSync(path, 'latin1'); } catch { return couldNotRun(`${path} could not be read.`); }
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const split = (l: string) => l.split(/[,\t]/).map((c) => c.trim());
  return { head: split(lines[0] ?? '').map((h) => h.toLowerCase()), rows: lines.slice(1).map(split) };
}
const find = (head: string[], re: RegExp, what: string, path: string): number => {
  const i = head.findIndex((h) => re.test(h));
  if (i < 0) couldNotRun(`${path}: no ${what} column.`);
  return i;
};

let grid: Ostn15Grid;
try { grid = loadOstn15File(gridPath); } catch (e) {
  couldNotRun(e instanceof Ostn15Error ? e.message : `${gridPath} could not be read as an OSTN15 grid file.`);
}
const input = table(inPath);
const output = table(outPath);
const iId = find(input.head, /point|id/, 'point id', inPath);
const iLat = find(input.head, /lat/, 'latitude', inPath);
const iLon = find(input.head, /lon/, 'longitude', inPath);
const oId = find(output.head, /point|id/, 'point id', outPath);
const oE = find(output.head, /east/, 'easting', outPath);
const oN = find(output.head, /north/, 'northing', outPath);

/* A BLANK CELL IS NO ANSWER, NOT ZERO. Number('') is 0, and 0, 0 is a finite point, so a blank used to read as Ordnance
   Survey converting the point to the grid's origin — and a point OS left unconverted was reported WRONG when we rightly
   refused it (Phase 151c's test found it). */
const cell = (v: string | undefined): number => (v === undefined || v.trim() === '' ? Number.NaN : Number(v));
const want = new Map(output.rows.map((r) => [r[oId] as string, { e: cell(r[oE]), n: cell(r[oN]) }]));
let agree = 0; let refusedAlike = 0; const bad: string[] = [];
for (const r of input.rows) {
  const id = r[iId] as string;
  const got = etrs89ToBritishNationalGrid({ latitude: cell(r[iLat]), longitude: cell(r[iLon]), datum: 'ETRS89' }, grid);
  const w = want.get(id);
  const osConverted = w !== undefined && Number.isFinite(w.e) && Number.isFinite(w.n);
  if (!osConverted) {
    if (got.ok) bad.push(`${id}: Ordnance Survey gives no answer, but we converted it to ${got.easting}, ${got.northing}`);
    else refusedAlike++;
    continue;
  }
  if (!got.ok) { bad.push(`${id}: refused (${got.code}) but Ordnance Survey gives ${w.e}, ${w.n}`); continue; }
  if (Math.abs(got.easting - w.e) > 0.001 || Math.abs(got.northing - w.n) > 0.001) {
    bad.push(`${id}: ${got.easting}, ${got.northing} against Ordnance Survey's ${w.e}, ${w.n}`);
    continue;
  }
  agree++;
}
console.log(`${input.rows.length} test points: ${agree} agree to the millimetre, ${refusedAlike} refused where Ordnance Survey gives none, ${bad.length} wrong.`);
for (const b of bad) console.log(`  WRONG ${b}`);
process.exit(bad.length === 0 && agree > 0 ? 0 : 1);
