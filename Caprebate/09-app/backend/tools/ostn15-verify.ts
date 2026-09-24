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
 * NOT YET RUN: no grid file has been downloaded. Run it once, on the server, the first time CAPREBATE_OSTN15_FILE is set.
 */
import { readFileSync } from 'node:fs';
import { loadOstn15File, etrs89ToBritishNationalGrid } from '../src/connectors/ostn15.ts';

const [gridPath, inPath, outPath] = process.argv.slice(2);
if (gridPath === undefined || inPath === undefined || outPath === undefined) {
  console.error('usage: node tools/ostn15-verify.ts <grid file> <test input> <test output>');
  process.exit(2);
}

function table(path: string): { head: string[]; rows: string[][] } {
  const lines = readFileSync(path, 'latin1').split(/\r?\n/).filter((l) => l.trim() !== '');
  const split = (l: string) => l.split(/[,\t]/).map((c) => c.trim());
  return { head: split(lines[0] ?? '').map((h) => h.toLowerCase()), rows: lines.slice(1).map(split) };
}
const find = (head: string[], re: RegExp, what: string, path: string): number => {
  const i = head.findIndex((h) => re.test(h));
  if (i < 0) { console.error(`${path}: no ${what} column. Nothing was checked.`); process.exit(2); }
  return i;
};

const grid = loadOstn15File(gridPath);
const input = table(inPath);
const output = table(outPath);
const iId = find(input.head, /point|id/, 'point id', inPath);
const iLat = find(input.head, /lat/, 'latitude', inPath);
const iLon = find(input.head, /lon/, 'longitude', inPath);
const oId = find(output.head, /point|id/, 'point id', outPath);
const oE = find(output.head, /east/, 'easting', outPath);
const oN = find(output.head, /north/, 'northing', outPath);

const want = new Map(output.rows.map((r) => [r[oId] as string, { e: Number(r[oE]), n: Number(r[oN]) }]));
let agree = 0; let refusedAlike = 0; const bad: string[] = [];
for (const r of input.rows) {
  const id = r[iId] as string;
  const got = etrs89ToBritishNationalGrid({ latitude: Number(r[iLat]), longitude: Number(r[iLon]), datum: 'ETRS89' }, grid);
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
