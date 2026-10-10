/**
 * BCIS RATES IN THE SURVEY PACK — PHASE 159f, 10 October 2026.
 *
 * Lakhbir, 9 October 2026: "With BCIS data loaded, the pack could draft each rate from the right building type — this
 * needs to happen." And: "we spoke to BCIS and they said its fine for us to do what we are doing" — relayed by Lakhbir,
 * recorded against Word question 218: storing BCIS rates, drafting from them and printing them in a client's report is
 * not a question any more. The Lockwood run (L12) printed every rate as "Surveyor", with no source.
 *
 * WHAT THIS FILE DOES:
 *   1. THE IMPORTER (`importBcisData`, `node src/cli.ts import-bcis-data`): BCIS's own CSV exports — the average prices
 *      by building function (£/m², rebased to a stated quarter at the UK mean location), the elemental analyses (£/m²
 *      of floor by NRM element), and the location factors. Columns are found by their header words, not their place,
 *      so an export with extra columns still reads; a file this cannot read is refused whole, never half-read. The data
 *      is kept OUTSIDE the repository (CAPREBATE_BCIS_DATA_FILE, or ~/.caprebate-bcis-data.json): it is BCIS's, for
 *      our named users, and is never committed or published. The index (the All-in Tender Price Index or the building
 *      price index) comes in by `import-bcis-index`, as before (src/web/bcis-index.ts).
 *   2. THE DRAFTS (`bcisDrafts`): the whole-building rate from the sector's BCIS building function, and the rate of every
 *      line measured by floor area from its NRM element — each × the location factor for the pack's area × the index
 *      from BCIS's base quarter to the PURCHASE date. A draft is a DRAFT: the surveyor accepts it by leaving it, or
 *      overrides it with a reason and a source of their own (src/web/survey-pack.ts).
 *   3. UNTIL BCIS'S DATA ARRIVES it is off and says so. On the test website (or a copy started with
 *      CAPREBATE_COST_MODEL_TEST=1) a PLACEHOLDER of invented figures drafts instead, labelled on every rate, every
 *      screen and the report as a test rate, not BCIS — so a reader of the PDF can always tell (L12).
 *
 * WHY A MISSING LOCATION OR INDEX DOES NOT STOP A DRAFT: section 562 shares the price by the qualifying parts' share of
 * the rebuild cost. The location factor and the index multiply the whole-building rate and every element alike, so they
 * cancel in that share; they move the rebuild cost shown, not the claim. A draft without them says so (at the UK mean,
 * or at BCIS's base quarter) and is never a guess that relieves the client (N4).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { isInside, repositoryRoot } from '../secrets.ts';
import { bcisIndexTable } from './bcis-index.ts';
import { onTestWebsite, type Env } from '../connectors/place.ts';

export type BcisType = { readonly name: string; readonly mean_pence: number; readonly median_pence: number | null; readonly sample: number | null };
export type BcisElement = { readonly type_name: string; readonly code: string; readonly name: string; readonly rate_pence: number };
export type BcisLocation = { readonly area: string; readonly factor: number };
export type BcisData = {
  readonly loaded: true;
  readonly kind: 'BCIS' | 'PLACEHOLDER';
  readonly source: string;
  /** The quarter BCIS rebased the prices to, as its first month: "2026-04". */
  readonly base: string;
  readonly types: readonly BcisType[];
  readonly elements: readonly BcisElement[];
  readonly locations: readonly BcisLocation[];
  readonly imported_at: string | null;
};

export const DEFAULT_BCIS_DATA_FILE = '~/.caprebate-bcis-data.json';
export const BCIS_LICENCE_WORDS = 'BCIS (RICS) subscription. BCIS confirmed our use: storing, drafting from and printing its rates (relayed by Lakhbir, 9 October 2026; Word question 218).';
export const PLACEHOLDER_WORDS = 'TEST RATE — invented figures, not BCIS. Test site only';

/* ------------------------------------------------------------------ which BCIS building function each sector is */

/**
 * THE SECTOR'S BCIS BUILDING FUNCTION. BCIS files average prices by building function (its own classification, after
 * CI/SfB). The names below are BCIS's function names as its online service lists them; the first that the loaded data
 * holds is used. SOURCE: BCIS's building function list, read 9 October 2026 for the brief; check the codes against the
 * first real export (the importer matches names, not codes). Dental practices have no function of their own: they are
 * priced as health centres and surgeries, the nearest, and the draft says so.
 */
export const BCIS_BUILDING_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  gp: Object.freeze(['Health centres, clinics, group practice surgeries', 'Health centres', 'Group practice surgeries']),
  dental: Object.freeze(['Dental surgeries', 'Health centres, clinics, group practice surgeries', 'Health centres']),
  care_homes: Object.freeze(['Nursing homes', 'Residential care homes', "Homes for the aged"]),
  supported_living: Object.freeze(['Sheltered housing', 'Supported housing', 'Housing, mixed developments']),
  private_hospital: Object.freeze(['Hospitals', 'General hospitals', 'Private hospitals']),
});

/**
 * THE FIXTURE LIST'S FLOOR-AREA ROWS, BY NRM ELEMENT (RICS New Rules of Measurement 1, group element 5, services). Only
 * the rows measured by floor area (GIA m², src/web/pack-lines.ts) are drafted from an elemental £/m²; a row counted per
 * room or per item is not, because BCIS's elemental analyses are per m² of floor. Several elements on one row add up.
 */
export const NRM_OF_LINE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'LS-SR-001': Object.freeze(['5.8']),            // electrical installations, including lighting
  'LS-SR-002': Object.freeze(['5.4']),            // water installations
  'LS-SR-003': Object.freeze(['5.6']),            // space heating and air conditioning
  'LS-SR-004': Object.freeze(['5.7']),            // ventilation
  'LS-SL-001': Object.freeze(['5.8', '5.4']),     // supported living common parts: electrical and water
});

/* ------------------------------------------------------------------ the placeholder, test system only */

const P = (pounds: number) => pounds * 100;
const placeholderTypes: readonly BcisType[] = Object.freeze([
  { name: 'Health centres, clinics, group practice surgeries', mean_pence: P(2650), median_pence: P(2580), sample: 41 },
  { name: 'Nursing homes', mean_pence: P(2310), median_pence: P(2240), sample: 63 },
  { name: 'Sheltered housing', mean_pence: P(2080), median_pence: P(2010), sample: 88 },
  { name: 'Hospitals', mean_pence: P(3420), median_pence: P(3300), sample: 27 },
]);
const ELEMENT_NAMES: Readonly<Record<string, string>> = Object.freeze({ '5.4': 'Water installations', '5.6': 'Space heating and air conditioning', '5.7': 'Ventilation', '5.8': 'Electrical installations' });
const placeholderElements: readonly BcisElement[] = Object.freeze(placeholderTypes.flatMap((t, i) => (
  [['5.4', 95 + i * 10], ['5.6', 210 + i * 15], ['5.7', 120 + i * 20], ['5.8', 280 + i * 25]] as const)
  .map(([code, pounds]) => ({ type_name: t.name, code, name: ELEMENT_NAMES[code] ?? code, rate_pence: P(pounds) }))));

/** INVENTED FIGURES. For the test website only, and labelled as such wherever a rate drafted from them is shown. */
export const BCIS_PLACEHOLDER: BcisData = Object.freeze({
  loaded: true, kind: 'PLACEHOLDER', source: 'PLACEHOLDER — invented figures, not BCIS data. For the test system only (Phase 159f).',
  base: '2026-01', types: placeholderTypes, elements: placeholderElements,
  locations: Object.freeze([
    { area: 'Kirklees', factor: 0.95 }, { area: 'Leeds', factor: 0.97 }, { area: 'Bradford', factor: 0.94 }, { area: 'Manchester', factor: 0.98 },
    { area: 'Westminster', factor: 1.21 }, { area: 'Birmingham', factor: 0.96 }, { area: 'Cardiff', factor: 0.93 }, { area: 'Glasgow City', factor: 0.96 },
  ]),
  imported_at: null,
});

/* ------------------------------------------------------------------ reading BCIS's exports */

/** RFC 4180 rows: commas and quotes inside quoted fields. */
function rowsOf(text: string): string[][] {
  const out: string[][] = [];
  let field = '', row: string[] = [], quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field.trim()); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some((x) => x !== '')) out.push(row);
      row = [];
    } else field += c;
  }
  row.push(field.trim());
  if (row.some((x) => x !== '')) out.push(row);
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[£²]/g, (m) => (m === '²' ? '2' : '')).replace(/[^a-z0-9.]+/g, ' ').trim();

/** The header row (the first holding every word asked for) and the column of each word, or a refusal. */
function header(rows: string[][], want: Readonly<Record<string, readonly string[]>>, file: string): { at: number; col: Record<string, number> } {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map(norm);
    const col: Record<string, number> = {};
    for (const [k, names] of Object.entries(want)) {
      const j = cells.findIndex((c) => names.some((n) => c === n || c.startsWith(`${n} `)));
      if (j >= 0) col[k] = j;
    }
    if (Object.keys(want).every((k) => k in col)) return { at: i, col };
  }
  throw new Error(`${file}: no header row with ${Object.values(want).map((n) => `“${n[0] ?? ''}”`).join(', ')} was found in its first 30 rows`);
}

/** "£2,650", "2650.00" or "2,650" in pence; null for a blank or a dash. Refuses anything else. */
function money(raw: string, where: string): number | null {
  const t = raw.replace(/[£,\s]/g, '');
  if (t === '' || t === '-' || t === '–') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) throw new Error(`${where}: “${raw}” is not an amount`);
  return Math.round(Number(t) * 100);
}

const QUARTER = /\b([1-4])\s*Q\s*((?:19|20)\d{2})\b|\bQ([1-4])\s*((?:19|20)\d{2})\b/i;
/** "Rebased to 2Q 2026 …" anywhere above the header, as the quarter's first month ("2026-04"). */
function baseOf(rows: string[][], upTo: number): string | null {
  for (let i = 0; i < upTo; i++) {
    const m = QUARTER.exec((rows[i] ?? []).join(' '));
    if (m !== null) {
      const q = Number(m[1] ?? m[3]), y = m[2] ?? m[4] ?? '';
      return `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}`;
    }
  }
  return null;
}

/** Average prices by building function: "Building function", "Mean", and if present "Median" and "Sample". */
export function parseBcisRates(text: string, file = 'the rates file'): { types: BcisType[]; base: string | null } {
  const rows = rowsOf(text);
  const h = header(rows, { name: ['building function', 'building type', 'function'], mean: ['mean'] }, file);
  const med = (rows[h.at] ?? []).map(norm).findIndex((c) => c === 'median');
  const smp = (rows[h.at] ?? []).map(norm).findIndex((c) => c === 'sample' || c === 'sample size' || c === 'no. of projects');
  const types: BcisType[] = [];
  for (let i = h.at + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = (r[h.col['name'] as number] ?? '').trim();
    if (name === '') continue;
    const mean = money(r[h.col['mean'] as number] ?? '', `${file}, row ${String(i + 1)}`);
    if (mean === null) continue;
    if (mean <= 0) throw new Error(`${file}, row ${String(i + 1)}: a mean of nothing`);
    const s = smp >= 0 ? Number((r[smp] ?? '').replace(/,/g, '')) : Number.NaN;
    types.push({ name, mean_pence: mean, median_pence: med >= 0 ? money(r[med] ?? '', `${file}, row ${String(i + 1)}`) : null, sample: Number.isFinite(s) ? s : null });
  }
  if (types.length === 0) throw new Error(`${file}: no building function with a mean was found`);
  return { types, base: baseOf(rows, h.at + 1) };
}

/** Elemental analyses: "Building function", "Element" ("5.8 Electrical installations") and "£/m2" (of floor). */
export function parseBcisElements(text: string, file = 'the elements file'): { elements: BcisElement[]; base: string | null } {
  const rows = rowsOf(text);
  const h = header(rows, { type: ['building function', 'building type', 'function'], element: ['element'], rate: ['2 m2', 'm2', 'per m2', 'cost per m2', 'cost m2', 'gifa'] }, file);
  const elements: BcisElement[] = [];
  for (let i = h.at + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const type_name = (r[h.col['type'] as number] ?? '').trim();
    const el = (r[h.col['element'] as number] ?? '').trim();
    const m = /^(\d+(?:\.\d+)?)\s*(.*)$/.exec(el);
    if (type_name === '' || m === null) continue;
    const rate = money(r[h.col['rate'] as number] ?? '', `${file}, row ${String(i + 1)}`);
    if (rate === null) continue;
    elements.push({ type_name, code: m[1] ?? '', name: (m[2] ?? '').trim() || (ELEMENT_NAMES[m[1] ?? ''] ?? ''), rate_pence: rate });
  }
  if (elements.length === 0) throw new Error(`${file}: no element with a rate was found`);
  return { elements, base: baseOf(rows, h.at + 1) };
}

/** Location factors: "Location" (or "Area") and "Factor" — 0.95, or 95 meaning 95% of the UK mean. */
export function parseBcisLocations(text: string, file = 'the locations file'): BcisLocation[] {
  const rows = rowsOf(text);
  const h = header(rows, { area: ['location', 'area', 'district'], factor: ['factor', 'location factor', 'index'] }, file);
  const out: BcisLocation[] = [];
  for (let i = h.at + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const area = (r[h.col['area'] as number] ?? '').trim();
    const raw = (r[h.col['factor'] as number] ?? '').trim();
    if (area === '' || raw === '') continue;
    if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`${file}, row ${String(i + 1)}: “${raw}” is not a factor`);
    const n = Number(raw);
    const factor = n > 5 ? n / 100 : n;
    if (!(factor >= 0.5 && factor <= 2)) throw new Error(`${file}, row ${String(i + 1)}: a factor of ${raw} is not believable`);
    out.push({ area, factor: Math.round(factor * 1000) / 1000 });
  }
  if (out.length === 0) throw new Error(`${file}: no location with a factor was found`);
  return out;
}

/* ------------------------------------------------------------------ where it is kept */

export function bcisDataPath(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.CAPREBATE_BCIS_DATA_FILE ?? '').trim() || DEFAULT_BCIS_DATA_FILE;
  const expanded = raw === '~' ? homedir() : raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export type BcisDataImport = { readonly ok: true; readonly path: string; readonly types: number; readonly elements: number; readonly locations: number; readonly base: string }
  | { readonly ok: false; readonly why: string };

/** Read BCIS's exports and keep them outside the repository. Any file this cannot read refuses the whole import. */
export function importBcisData(files: { rates: { text: string; name: string }; elements?: { text: string; name: string }; locations?: { text: string; name: string } },
  nowIso: string, opts: { base?: string } = {}, env: Record<string, string | undefined> = process.env, repoRoot: string = repositoryRoot()): BcisDataImport {
  const path = bcisDataPath(env);
  if (isInside(path, repoRoot)) return { ok: false, why: `BCIS's data may not be kept in the code folder (${repoRoot}). Keep it outside, or use the default: ${DEFAULT_BCIS_DATA_FILE}. The setting is CAPREBATE_BCIS_DATA_FILE` };
  try {
    const r = parseBcisRates(files.rates.text, basename(files.rates.name));
    const e = files.elements === undefined ? { elements: [], base: null } : parseBcisElements(files.elements.text, basename(files.elements.name));
    const l = files.locations === undefined ? [] : parseBcisLocations(files.locations.text, basename(files.locations.name));
    const base = opts.base ?? r.base ?? e.base;
    if (base === null || !/^\d{4}-(0[1-9]|1[0-2])$/.test(base)) {
      return { ok: false, why: 'the quarter the prices are rebased to was not found in the rates file. Give it: --base 2026-04 (the quarter’s first month)' };
    }
    if (r.base !== null && e.base !== null && r.base !== e.base && opts.base === undefined) {
      return { ok: false, why: `the rates are rebased to ${r.base} and the elements to ${e.base}. Export both at the same quarter, or give --base` };
    }
    const data: BcisData = { loaded: true, kind: 'BCIS', source: `BCIS, imported from ${[files.rates.name, files.elements?.name, files.locations?.name].filter((x) => x !== undefined).map((x) => basename(x)).join(', ')} on ${nowIso.slice(0, 10)}`,
      base, types: r.types, elements: e.elements, locations: l, imported_at: nowIso };
    writeFileSync(path, `${JSON.stringify(data, null, 1)}\n`, { mode: 0o600 });
    return { ok: true, path, types: r.types.length, elements: e.elements.length, locations: l.length, base };
  } catch (err) {
    return { ok: false, why: `nothing was imported: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** The imported data read back, or null and why. Never half a table. */
export function bcisDataFile(env: Record<string, string | undefined> = process.env, repoRoot: string = repositoryRoot()): { data: BcisData } | { data: null; why: string } {
  const path = bcisDataPath(env);
  if (isInside(path, repoRoot)) return { data: null, why: 'the BCIS data file is inside the repository, so it is not read' };
  if (!existsSync(path)) return { data: null, why: 'no BCIS data has been imported yet. Get the export from BCIS and import it' };
  try {
    const d = JSON.parse(readFileSync(path, 'utf8')) as Partial<BcisData>;
    const ok = d.loaded === true && d.kind === 'BCIS' && typeof d.base === 'string' && Array.isArray(d.types) && d.types.length > 0 && Array.isArray(d.elements) && Array.isArray(d.locations);
    return ok ? { data: d as BcisData } : { data: null, why: 'the BCIS data file is not one this reads; import it again' };
  } catch {
    return { data: null, why: 'the BCIS data file could not be read; import it again' };
  }
}

/** The data to draft from: BCIS's where imported; the placeholder on the test system only; else none, and why. */
export function bcisDataHere(env: Env = process.env): { data: BcisData } | { data: null; why: string } {
  const real = bcisDataFile(env as Record<string, string | undefined>);
  if (real.data !== null) return real;
  if (onTestWebsite(env) || (env['CAPREBATE_COST_MODEL_TEST'] ?? '').trim() === '1') return { data: BCIS_PLACEHOLDER };
  return real;
}

/* ------------------------------------------------------------------ the drafts */

type IndexTable = { loaded: boolean; source: string; points: readonly (readonly [string, number])[] };
const CM = createRequire(import.meta.url)('../../../../04-phase-work/phase9/caprebate-cost-model.cjs') as {
  CB_BCIS_INDEX_PLACEHOLDER: IndexTable;
  indexFactorFromTable: (t: IndexTable, purchase: string, valuation: string) => { factor: number; index_at_purchase: number; index_at_valuation: number };
};

/** A rate's structured source: what it is, its reference, the day it is priced at, and how a BCIS draft was made. */
export type RateBasis = {
  readonly kind: 'BCIS' | 'QS_SCHEDULE' | 'CONTRACTOR_INVOICE' | 'PRICE_BOOK' | 'TEST_PLACEHOLDER';
  readonly ref: string;
  readonly priced_at: string | null;
  readonly location?: { readonly area: string | null; readonly factor: number } | null;
  readonly index?: { readonly factor: number | null; readonly from: string; readonly to: string | null } | null;
};

export const BASIS_WORDS: Readonly<Record<RateBasis['kind'], string>> = Object.freeze({
  BCIS: 'BCIS', QS_SCHEDULE: 'Quantity surveyor’s priced schedule', CONTRACTOR_INVOICE: 'Contractor’s invoice or final account',
  PRICE_BOOK: 'Price book', TEST_PLACEHOLDER: 'TEST RATE — not BCIS',
});

export type BcisDraft = {
  readonly kind: 'BCIS' | 'PLACEHOLDER' | null;
  /** Why nothing was drafted, or what the drafts rest on. */
  readonly words: string;
  readonly type_name: string | null;
  readonly building_rate: { readonly value: number; readonly basis: RateBasis; readonly text: string } | null;
  readonly lines: ReadonlyMap<string, { readonly value: number; readonly basis: RateBasis; readonly text: string }>;
  readonly location: { readonly area: string | null; readonly factor: number; readonly words: string };
  readonly index: { readonly factor: number | null; readonly words: string };
  /** The day every draft is priced at: the purchase date where the index reaches it, else BCIS's base quarter. */
  readonly priced_at: string | null;
};

/** The index factor from one day to another, from the imported BCIS index (else the placeholder on the test system). */
export function indexBetween(from: string, to: string, env: Env = process.env): { factor: number; words: string } | { factor: null; words: string } {
  const real = bcisIndexTable(env as Record<string, string | undefined>);
  const test = onTestWebsite(env) || (env['CAPREBATE_COST_MODEL_TEST'] ?? '').trim() === '1';
  const table: IndexTable | null = real.table !== null ? real.table : test ? CM.CB_BCIS_INDEX_PLACEHOLDER : null;
  if (table === null) return { factor: null, words: `no index: ${real.table === null ? real.why : ''}` };
  try {
    const f = CM.indexFactorFromTable(table, to, from);
    return { factor: Math.round(f.factor * 10000) / 10000, words: `${real.table !== null ? 'the BCIS index' : 'a test index with made-up figures'}: ${String(f.index_at_valuation)} at ${from} to ${String(f.index_at_purchase)} at ${to}` };
  } catch (e) {
    return { factor: null, words: `the index could not be read across ${from} to ${to}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const pounds = (p: number) => `£${(p / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;

/** The pack's drafts: the whole-building rate and each floor-area line's rate, from BCIS, at the purchase date. */
export function bcisDrafts(o: { sector: string; area: string | null; purchase: string | null; lineIds: readonly string[] }, env: Env = process.env): BcisDraft {
  const here = bcisDataHere(env);
  const empty = new Map<string, never>();
  const noLoc = { area: null, factor: 1, words: 'the UK mean' };
  if (here.data === null) return { kind: null, words: `No rate is drafted: ${here.why}. Every rate is yours, with its source.`, type_name: null, building_rate: null, lines: empty, location: noLoc, index: { factor: null, words: 'not used' }, priced_at: null };
  const d = here.data;
  const names = BCIS_BUILDING_TYPE[o.sector] ?? [];
  const type = names.map((n) => d.types.find((t) => norm(t.name) === norm(n))).find((t) => t !== undefined) ?? null;
  const test = d.kind === 'PLACEHOLDER';
  // The location: the area the surveyor chose, if the table holds it; else the UK mean (it cancels in the share).
  const loc = o.area === null ? null : d.locations.find((l) => norm(l.area) === norm(o.area ?? '')) ?? null;
  const location = loc !== null ? { area: loc.area, factor: loc.factor, words: `${loc.area}, ${loc.factor.toFixed(2)}` }
    : { area: null, factor: 1, words: o.area === null ? 'the UK mean (choose the area in chapter 9)' : `the UK mean: “${o.area}” is not in the location table` };
  // The index: BCIS's base quarter to the purchase date.
  const ix = o.purchase === null ? { factor: null, words: 'the purchase date is not known, so the rates stay at BCIS’s base quarter' } : indexBetween(d.base, o.purchase.slice(0, 10), env);
  const priced_at = ix.factor !== null ? (o.purchase ?? '').slice(0, 10) : `${d.base}-01`;
  const k = location.factor * (ix.factor ?? 1);
  const basisOf = (ref: string): RateBasis => ({ kind: test ? 'TEST_PLACEHOLDER' : 'BCIS', ref, priced_at,
    location: { area: location.area, factor: location.factor }, index: { factor: ix.factor, from: `${d.base}-01`, to: ix.factor === null ? null : priced_at } });
  const tail = `× location ${location.factor.toFixed(2)} (${location.words}) × index ${ix.factor === null ? '1 (not indexed)' : ix.factor.toFixed(4)}, priced at ${priced_at}`;
  const lead = test ? `${PLACEHOLDER_WORDS}: ` : 'BCIS ';
  if (type === null) {
    return { kind: d.kind, words: `No rate is drafted: the loaded data has none of the building functions for this sector (${names.join('; ')}).`, type_name: null, building_rate: null, lines: empty, location, index: { factor: ix.factor, words: ix.words }, priced_at };
  }
  const nearest = o.sector === 'dental' && norm(type.name) !== norm('Dental surgeries') ? ' (the nearest: BCIS has no dental function of its own)' : '';
  const value = Math.round(type.mean_pence * k);
  const building_rate = { value, basis: basisOf(`${type.name}, mean ${pounds(type.mean_pence)}/m² at ${d.base}${nearest}`),
    text: `${lead}${type.name}${nearest}: mean ${pounds(type.mean_pence)} a m² at ${d.base} ${tail}` };
  const lines = new Map<string, { value: number; basis: RateBasis; text: string }>();
  for (const id of o.lineIds) {
    const codes = NRM_OF_LINE[id];
    if (codes === undefined) continue;
    const els = codes.map((c) => d.elements.find((e) => norm(e.type_name) === norm(type.name) && e.code === c));
    if (els.some((e) => e === undefined)) continue;
    const sum = els.reduce((a, e) => a + (e?.rate_pence ?? 0), 0);
    const names2 = els.map((e) => `${e?.code ?? ''} ${e?.name ?? ''}`.trim()).join(' + ');
    lines.set(id, { value: Math.round(sum * k), basis: basisOf(`${type.name}, element ${names2}, ${pounds(sum)}/m² at ${d.base}`),
      text: `${lead}${type.name}, element ${names2}: ${pounds(sum)} a m² of floor at ${d.base} ${tail}` });
  }
  return { kind: d.kind, words: `${test ? `${PLACEHOLDER_WORDS}. ` : ''}Rates drafted from ${type.name}${nearest}, ${d.source}, ${tail}.`, type_name: type.name, building_rate, lines, location, index: { factor: ix.factor, words: ix.words }, priced_at };
}
