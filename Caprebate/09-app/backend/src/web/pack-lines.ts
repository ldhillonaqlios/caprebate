/**
 * THE SURVEY PACK'S LINES — from the fixture list, never invented. 1 October 2026.
 *
 * Every line a pack starts with is a row of `02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv` (103 rows,
 * each with its statutory authority and its pool), for the building's sector and the rows every sector shares. This
 * file reads that list; it does not keep a second copy of it.
 *
 * WHICH ROWS: those that can go in a pool through a survey — main pool (MP), special rate (SR), and the two the list
 * leaves to the surveyor (APPORTION, and builder's work that FOLLOWS_PLANT, whose pool is the plant's). NOT: loose
 * equipment (MP_AIA — the accountant's claim from the fixed-asset register, not a fixture), anything excluded (NONE),
 * and the structures allowance (SBA — a different relief).
 *
 * WHAT IS DRAFTED, AND ONLY FROM EVIDENCE (src/web/rooms.ts: "a seeded count would be this system inventing a property
 * fact"):
 *   · the share that qualifies, where the list gives one (a number, with its authority): Cap Rebate's DRAFT;
 *   · the pool, where the list gives one: DRAFT;
 *   · how much, ONLY where the list measures the row against something we hold — the floor area (from the energy
 *     certificate) for a whole-building system, or a room count the surveyor has recorded, for a row counted per room.
 *     Everything else is left for the surveyor.
 *   · the rate: NEVER. It is BCIS's, and BCIS is not bought yet. Every rate is the surveyor's until it is.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from './pack-sums.ts';

export const TAXONOMY_FILE = join(import.meta.dirname, '..', '..', '..', '..', '02-modules-and-build-prep', 'Caprebate-Fixture-Taxonomy-v1.csv');

export type TaxonomyRow = Readonly<Record<string, string>>;

/** RFC 4180: commas and quotes inside quoted fields, "" for a quote. Refuses a row whose width differs from the header. */
export function parseCsv(text: string): TaxonomyRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (quoted) throw new Error('the fixture list has a quote that is never closed');
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  const [head, ...body] = rows;
  if (head === undefined) throw new Error('the fixture list is empty');
  return body.map((r, n) => {
    if (r.length !== head.length) throw new Error(`the fixture list's row ${n + 2} has ${r.length} fields, not ${head.length}`);
    return Object.freeze(Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
  });
}

let cached: readonly TaxonomyRow[] | null = null;
export function taxonomy(): readonly TaxonomyRow[] {
  if (cached === null) cached = Object.freeze(parseCsv(readFileSync(TAXONOMY_FILE, 'utf8')));
  return cached;
}

/** The engine's sector ids to the fixture list's. */
export const TAXONOMY_SECTOR: Readonly<Record<string, string>> = Object.freeze({
  care_homes: 'CH', dental: 'DEN', supported_living: 'SL', gp: 'GP', private_hospital: 'PH',
});

/** The list's pools that a survey puts in a pool; null: the surveyor decides. */
const POOL_OF: Readonly<Record<string, Pool | null>> = Object.freeze({ MP: 'MP', SR: 'SR', APPORTION: null, FOLLOWS_PLANT: null });

/** WHICH ROOM COUNTS A ROW IS COUNTED BY: the list's `quantity_basis`, to the room ids of src/web/rooms.ts. */
export const ROOM_BASIS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = Object.freeze({
  // The room schedule's GP-8 and GP-17: a treatment room and a phlebotomy room carry the consulting room's fittings.
  GP: Object.freeze({ 'consulting room count': Object.freeze(['GP-R1', 'GP-R2', 'GP-R7']) }),
  DEN: Object.freeze({ 'surgery (chair) count': Object.freeze(['DN-R1']), 'imaging room count': Object.freeze(['DN-R3']) }),
  PH: Object.freeze({ 'theatre count': Object.freeze(['PH-R2']), 'imaging room count': Object.freeze(['PH-R4', 'PH-R5']) }),
});

/** Units a count of rooms can stand for. A row measured in metres or points is not a room count, whatever drives it. */
const COUNT_UNITS = new Set(['no', 'room']);

const UNIT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  no: 'number', room: 'rooms', m: 'metres', m2: 'm²', point: 'points', item: 'items', installation: 'installations', sum: 'sum (£)',
});

export type LineTemplate = {
  readonly element_id: string;
  readonly label: string;
  readonly unit: string;
  /** How the quantity is drafted: from the floor area, from room counts, or not at all. */
  readonly qty_from: { readonly kind: 'GIA' } | { readonly kind: 'ROOMS'; readonly rooms: readonly string[] } | { readonly kind: 'NONE' };
  readonly pool: Pool | null;
  /** Hundredths of a per cent, or null where the list leaves it to the surveyor. */
  readonly qpct_bp: number | null;
  readonly authority: string;
  /** SETTLED, SETTLED_PRACTICE, JUDGEMENT, CONTESTED … — shown, so a contested row reads as contested. */
  readonly status: string;
  readonly basis: string;
};

function sentence(name: string): string {
  const s = name.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The lines a pack for this sector starts with, in the list's order. Empty for a sector the list does not know. */
export function linesForSector(sector: string): LineTemplate[] {
  const code = TAXONOMY_SECTOR[sector];
  if (code === undefined) return [];
  const rooms = ROOM_BASIS[code] ?? {};
  const out: LineTemplate[] = [];
  for (const r of taxonomy()) {
    if (r['sector'] !== 'ALL' && r['sector'] !== code) continue;
    const listPool = r['pool'] ?? '';
    if (!(listPool in POOL_OF)) continue;
    const basis = (r['quantity_basis'] ?? '').trim();
    const unitCode = (r['unit'] ?? '').trim();
    let qty_from: LineTemplate['qty_from'] = { kind: 'NONE' };
    let unit = UNIT_WORDS[unitCode] ?? unitCode;
    if (/^(communal )?GIA m2\b/i.test(basis)) { qty_from = { kind: 'GIA' }; unit = 'm² of floor'; }
    else if (rooms[basis] !== undefined && COUNT_UNITS.has(unitCode)) { qty_from = { kind: 'ROOMS', rooms: rooms[basis] as readonly string[] }; unit = 'rooms'; }
    // Communal floor area in supported living is not the whole floor area: never drafted from it.
    if (qty_from.kind === 'GIA' && /^communal/i.test(basis)) { qty_from = { kind: 'NONE' }; unit = 'm² of common parts'; }
    const pct = (r['qualifying_pct'] ?? '').trim();
    const qpct_bp = /^\d{1,3}$/.test(pct) && Number(pct) <= 100 ? Number(pct) * 100 : null;
    out.push(Object.freeze({
      element_id: r['element_id'] ?? '',
      label: sentence(r['element_name'] ?? ''),
      unit, qty_from,
      pool: POOL_OF[listPool] ?? null,
      qpct_bp,
      authority: (r['authority'] ?? '').trim(),
      status: (r['status'] ?? '').trim(),
      basis,
    }));
  }
  return out;
}
