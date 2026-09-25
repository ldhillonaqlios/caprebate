/**
 * LATITUDE AND LONGITUDE TO BRITISH NATIONAL GRID, EXACTLY — OR NOT AT ALL. Phase 151a, 24 September 2026.
 *
 * The land boundary files are in British National Grid (EPSG:27700), metres. A point given as latitude and longitude
 * must be converted before it can be looked for, and HM Land Registry warns that a rough conversion can move features
 * by up to 15 metres (04-phase-work/phase133/inspire-format-findings.md) — enough to put a property in the wrong
 * parcel. Ordnance Survey's own guide says a Helmert-type conversion is good to "only about 3 metres". So this file
 * does ONE conversion, the one Ordnance Survey defines as exact for this purpose, OSTN15, and refuses otherwise.
 *
 * OSTN15, AS ORDNANCE SURVEY PUBLISHES IT ("A guide to coordinate systems in Great Britain", docs.os.uk, read
 * 24 September 2026, and the OSTN15 developer pack):
 *   1. the ETRS89 latitude and longitude are projected with the National Grid's Transverse Mercator projection on
 *      the GRS80 ellipsoid (true origin 49°N 2°W, scale 0.9996012717, false origin 400 km west and 100 km north);
 *   2. "the grids of northing and easting shifts between ETRS89 and OSGB36 cover Britain at a resolution of one
 *      kilometre": the four grid points around the projected point give its shift "by a bilinear interpolation";
 *   3. the shift is added. The result is the OSGB36 National Grid easting and northing — EPSG:27700.
 *
 * WHAT IS REFUSED, AND WHY EACH IS A REFUSAL RATHER THAN A ROUGHER ANSWER:
 *   · no grid file on this server — the shifts ARE the conversion; without them there is only an approximation;
 *   · a datum that is not stated as ETRS89. OSTN15 converts ETRS89. WGS84 drifts away from ETRS89 by about 2.5 cm a
 *     year (around a metre by 2026), and a supplier that does not say which it gives is not assumed to give either;
 *   · a point outside the grid, or where any of the four surrounding grid points is missing or marked outside the
 *     transformation's area (datum flag 0) — the interpolation would then be from shifts OSTN15 does not vouch for.
 *
 * THE GRID FILE is Ordnance Survey's OSTN15_OSGM15_DataFile.txt from the free developer pack (BSD licence), kept on
 * this server OUTSIDE the repository and named by CAPREBATE_OSTN15_FILE — like the ONS postcode table, a deployment
 * artefact, absent by default. ABSENT, every latitude and longitude is refused and nothing else changes. The first
 * copy put on a server must be checked against the pack's own test points (tools/ostn15-verify.ts) before it is
 * trusted. No file was downloaded by the phase that built this. Phase 151a's addendum (24 September 2026) put OS's full
 * developer pack on the Mac, in ~/caprebate-data/ostn15/, outside the repository, and the check passed on all forty
 * test points. Phase 151c: the demo launcher names that file when it is there (tools/demo-server.cjs).
 */
import { readFileSync } from 'node:fs';

/* ------------------------------------------------------------------ the projection */

export type Ellipsoid = { readonly a: number; readonly b: number };
export const GRS80: Ellipsoid = { a: 6_378_137.0, b: 6_356_752.3141 };
export const AIRY_1830: Ellipsoid = { a: 6_377_563.396, b: 6_356_256.909 };

const F0 = 0.9996012717;
const PHI0 = (49 * Math.PI) / 180;
const LAMBDA0 = (-2 * Math.PI) / 180;
const E0 = 400_000;
const N0 = -100_000;

/**
 * The National Grid's Transverse Mercator projection, in Ordnance Survey's published series (the guide's annex on
 * converting latitude and longitude to eastings and northings). Degrees in, metres out. On GRS80 it gives OSTN15's
 * ETRS89 grid coordinates; on Airy 1830 it reproduces the guide's own worked example.
 */
export function projectNationalGrid(latitude: number, longitude: number, ell: Ellipsoid): { easting: number; northing: number } {
  const { a, b } = ell;
  const phi = (latitude * Math.PI) / 180;
  const lambda = (longitude * Math.PI) / 180;
  const n = (a - b) / (a + b);
  const e2 = (a * a - b * b) / (a * a);
  const sin = Math.sin(phi); const cos = Math.cos(phi); const tan = Math.tan(phi);
  const nu = a * F0 / Math.sqrt(1 - e2 * sin * sin);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sin * sin, 1.5);
  const eta2 = nu / rho - 1;
  const dp = phi - PHI0; const sp = phi + PHI0;
  const M = b * F0 * (
    (1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * dp
    - (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(dp) * Math.cos(sp)
    + ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * dp) * Math.cos(2 * sp)
    - (35 / 24) * n ** 3 * Math.sin(3 * dp) * Math.cos(3 * sp)
  );
  const I = M + N0;
  const II = (nu / 2) * sin * cos;
  const III = (nu / 24) * sin * cos ** 3 * (5 - tan ** 2 + 9 * eta2);
  const IIIA = (nu / 720) * sin * cos ** 5 * (61 - 58 * tan ** 2 + tan ** 4);
  const IV = nu * cos;
  const V = (nu / 6) * cos ** 3 * (nu / rho - tan ** 2);
  const VI = (nu / 120) * cos ** 5 * (5 - 18 * tan ** 2 + tan ** 4 + 14 * eta2 - 58 * tan ** 2 * eta2);
  const dl = lambda - LAMBDA0;
  return {
    northing: I + II * dl ** 2 + III * dl ** 4 + IIIA * dl ** 6,
    easting: E0 + IV * dl + V * dl ** 3 + VI * dl ** 5,
  };
}

/* ------------------------------------------------------------------ the grid */

/** OSTN15's grid: 701 points east (0 to 700 km) by 1,251 north (0 to 1,250 km), one kilometre apart. */
export const OSTN15_COLUMNS = 701;
export const OSTN15_ROWS = 1251;
export const OSTN15_POINTS = OSTN15_COLUMNS * OSTN15_ROWS;

export type Ostn15Row = {
  readonly easting: number; readonly northing: number;
  readonly e_shift: number; readonly n_shift: number;
  /** Ordnance Survey's datum flag. 0 means the point is outside the transformation's area. */
  readonly flag: number;
};

export type Ostn15Grid = {
  /** Where the grid came from, for the record. */
  readonly source: string;
  /** Whether every one of the 876,951 points is present. A test's invented grid is not. */
  readonly complete: boolean;
  readonly se: Float64Array;
  readonly sn: Float64Array;
  readonly flag: Uint8Array;
};

export class Ostn15Error extends Error {
  constructor(message: string) { super(message); this.name = 'Ostn15Error'; }
}

/** Builds a grid from rows, each on the kilometre lattice. A row off the lattice, or given twice, is refused. */
export function ostn15GridFromRows(rows: Iterable<Ostn15Row>, source: string): Ostn15Grid {
  const se = new Float64Array(OSTN15_POINTS).fill(Number.NaN);
  const sn = new Float64Array(OSTN15_POINTS).fill(Number.NaN);
  const flag = new Uint8Array(OSTN15_POINTS);
  let count = 0;
  for (const r of rows) {
    const i = r.easting / 1000; const j = r.northing / 1000;
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= OSTN15_COLUMNS || j >= OSTN15_ROWS) {
      throw new Ostn15Error(`A grid point (${r.easting}, ${r.northing}) is not on OSTN15's kilometre grid.`);
    }
    if (![r.e_shift, r.n_shift, r.flag].every(Number.isFinite)) throw new Ostn15Error(`A grid point (${r.easting}, ${r.northing}) has a shift that is not a number.`);
    const k = i + j * OSTN15_COLUMNS;
    if (!Number.isNaN(se[k] as number)) throw new Ostn15Error(`The grid point (${r.easting}, ${r.northing}) is given twice.`);
    se[k] = r.e_shift; sn[k] = r.n_shift; flag[k] = r.flag; count++;
  }
  return { source, complete: count === OSTN15_POINTS, se, sn, flag };
}

/**
 * Reads Ordnance Survey's data file. Its columns are found by their headings, not by position; a file without the
 * five, or with fewer or more than 876,951 points, is refused whole. Nothing here downloads it.
 */
export function loadOstn15File(path: string): Ostn15Grid {
  const text = readFileSync(path, 'latin1');
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const head = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase());
  const col = (re: RegExp): number => head.findIndex((h) => re.test(h));
  const ce = col(/^etrs89_easting$/); const cn = col(/^etrs89_northing$/);
  const cse = col(/eshift$/); const csn = col(/nshift$/); const cf = col(/datum_flag$/);
  if ([ce, cn, cse, csn, cf].some((c) => c < 0)) {
    throw new Ostn15Error('The OSTN15 file does not have the columns we expect (ETRS89_Easting, ETRS89_Northing, the two shifts and the datum flag). It was not used.');
  }
  const rows = function* (): Generator<Ostn15Row> {
    for (let n = 1; n < lines.length; n++) {
      const v = (lines[n] as string).split(',');
      yield { easting: Number(v[ce]), northing: Number(v[cn]), e_shift: Number(v[cse]), n_shift: Number(v[csn]), flag: Number(v[cf]) };
    }
  };
  const grid = ostn15GridFromRows(rows(), path);
  if (!grid.complete) throw new Ostn15Error(`The OSTN15 file does not hold all ${OSTN15_POINTS} grid points. It was not used.`);
  return grid;
}

let loaded: { path: string; grid: Ostn15Grid } | null = null;

/** The grid named by CAPREBATE_OSTN15_FILE, read once. Null when none is named — the shipped state. */
export function ostn15Grid(env: Record<string, string | undefined> = process.env): Ostn15Grid | null {
  const path = env['CAPREBATE_OSTN15_FILE'];
  if (path === undefined || path.trim() === '') return null;
  if (loaded === null || loaded.path !== path) loaded = { path, grid: loadOstn15File(path) };
  return loaded.grid;
}

/* ------------------------------------------------------------------ the conversion */

export type BngConversion =
  | { readonly ok: true; readonly easting: number; readonly northing: number }
  | { readonly ok: false; readonly code: 'NO_GRID' | 'DATUM_NOT_ETRS89' | 'INVALID_POINT' | 'OUTSIDE_GRID'; readonly why: string };

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/**
 * ETRS89 latitude and longitude to British National Grid, by OSTN15. Every doubt is a refusal with a plain reason;
 * nothing is ever defaulted, and a missing coordinate is never 0 (N4).
 */
export function etrs89ToBritishNationalGrid(
  point: { readonly latitude?: unknown; readonly longitude?: unknown; readonly datum?: unknown },
  grid: Ostn15Grid | null,
): BngConversion {
  const lat = point.latitude; const lon = point.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, code: 'INVALID_POINT', why: 'The latitude and longitude are missing or are not numbers.' };
  }
  if (point.datum !== 'ETRS89') {
    return {
      ok: false, code: 'DATUM_NOT_ETRS89',
      why: 'We are not told the latitude and longitude are ETRS89, and the exact conversion is only for ETRS89. ' +
        'We do not assume it, because the difference can be about a metre.',
    };
  }
  if (grid === null) {
    return {
      ok: false, code: 'NO_GRID',
      why: 'Ordnance Survey\'s exact conversion (OSTN15) is not set up on this server, and we do not use a rougher one.',
    };
  }
  const p = projectNationalGrid(lat, lon, GRS80);
  const i = Math.floor(p.easting / 1000); const j = Math.floor(p.northing / 1000);
  if (i < 0 || j < 0 || i + 1 >= OSTN15_COLUMNS || j + 1 >= OSTN15_ROWS) {
    return { ok: false, code: 'OUTSIDE_GRID', why: 'The point is outside Ordnance Survey\'s conversion grid for Great Britain.' };
  }
  const k = [i + j * OSTN15_COLUMNS, i + 1 + j * OSTN15_COLUMNS, i + 1 + (j + 1) * OSTN15_COLUMNS, i + (j + 1) * OSTN15_COLUMNS];
  if (k.some((x) => Number.isNaN(grid.se[x] as number) || (grid.flag[x] as number) === 0)) {
    return { ok: false, code: 'OUTSIDE_GRID', why: 'Ordnance Survey\'s exact conversion does not cover this point.' };
  }
  const t = (p.easting - i * 1000) / 1000; const u = (p.northing - j * 1000) / 1000;
  const w = [(1 - t) * (1 - u), t * (1 - u), t * u, (1 - t) * u];
  let se = 0; let sn = 0;
  k.forEach((x, n) => { se += (w[n] as number) * (grid.se[x] as number); sn += (w[n] as number) * (grid.sn[x] as number); });
  return { ok: true, easting: round3(p.easting + se), northing: round3(p.northing + sn) };
}
