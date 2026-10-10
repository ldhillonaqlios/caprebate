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
 *   · the rate: PHASE 159f (Lakhbir, 9 October 2026: "With BCIS data loaded, the pack could draft each rate from the
 *     right building type — this needs to happen"). The whole-building rate and every line measured by floor area are
 *     drafted from BCIS in src/web/bcis-data.ts (NRM_OF_LINE), at the purchase date; the surveyor accepts or overrides
 *     each, with a source. A line counted per room or per item is not drafted: BCIS prices elements per m² of floor.
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

/**
 * PHASE 153e, 4 October 2026 — TEST DEFAULTS FOR THE SURVEYOR TO CONFIRM, laid over the fixture list without changing it.
 *
 * SUITE_ROWS (Word question 148): a theatre row is counted from the suite's spaces that carry its equipment, each
 * counted, not from the theatres alone. Ultra-clean ventilation and the operating lights stay with the theatre.
 *
 * PLACEMENT (Word questions 134 and 135), from the answers typed under the questions:
 *   - ordinary powered ventilation, air cooling and air purification are integral features (special rate). Dental
 *     extract and ordinary GP treatment-room ventilation are NOT automatically medical equipment: special rate here.
 *   - theatre ultra-clean ventilation and isolation-room ventilation are FLAGGED: the pool is left to the surveyor on
 *     each job, by the system's function, specification and purpose.
 *   - emergency lighting is part of the electrical and lighting system (LS-SR-001); commercial kitchen extract is part
 *     of the ventilation system (LS-SR-004); clinical flooring and ordinary security glazing stay with the building
 *     (nothing qualifies unless a specific rule applies); drug storage and standby generators are their own plant.
 * Each default says so in its source text, so a surveyor reads it as a default, not a decision.
 */
export const SUITE_ROWS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'LS-PH-002': Object.freeze(['PH-R2']),
  'LS-PH-004': Object.freeze(['PH-R2', 'PH-R2A', 'PH-R2D']),
  'LS-PH-005': Object.freeze(['PH-R2', 'PH-R2A', 'PH-R2C', 'PH-R2D']),
  'LS-PH-006': Object.freeze(['PH-R2']),
});

export const TEST_DEFAULT_WORDS = 'Test default (Phase 153e), for the surveyor to confirm';

type Placement = { readonly pool?: Pool | null; readonly qpct_bp?: number; readonly status?: string; readonly note: string };
export const PLACEMENT: Readonly<Record<string, Placement>> = Object.freeze({
  'LS-DEN-015': { pool: 'SR', note: 'treated as normal air flow, not medical kit (question 134)' },
  'LS-GP-008': { pool: 'SR', note: 'treated as normal air flow in a treatment room (question 134)' },
  'LS-PH-002': { pool: null, status: 'CONTESTED', note: 'flagged: the surveyor decides on each job by function, specification and purpose (question 134)' },
  'LS-PH-003': { pool: null, status: 'CONTESTED', note: 'flagged: the surveyor decides on each job by function, specification and purpose (question 134)' },
  'LS-SR-001': { note: 'includes emergency lighting (question 135)' },
  'LS-SR-004': { note: 'includes commercial kitchen extract (question 135)' },
  'LS-MP-013': { qpct_bp: 0, note: 'floors stay with the building. None of it counts unless a rule says so (question 135)' },
});

/** Rows the fixture list does not have, added by sector as their own plant (question 135). */
const ADDED_ROWS: Readonly<Record<string, readonly { element_id: string; label: string; unit: string }[]>> = Object.freeze({
  CH: [{ element_id: 'TD-CH-DRUGS', label: 'Medication and controlled-drug storage', unit: 'items' }],
  PH: [{ element_id: 'TD-PH-DRUGS', label: 'Medication and controlled-drug storage on wards', unit: 'items' },
    { element_id: 'TD-PH-STANDBY', label: 'Standby generator and UPS', unit: 'items' }],
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
  readonly qty_from: { readonly kind: 'GIA' } | { readonly kind: 'ROOMS'; readonly rooms: readonly string[] } | { readonly kind: 'NONE' }
    /** PHASE 153e: supported living's common parts, from the shared areas on the floor plans (else the 25% fallback). */
    | { readonly kind: 'SHARED' };
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
    else if (code === 'PH' && SUITE_ROWS[r['element_id'] ?? ''] !== undefined && COUNT_UNITS.has(unitCode)) {
      qty_from = { kind: 'ROOMS', rooms: SUITE_ROWS[r['element_id'] ?? ''] as readonly string[] }; unit = 'rooms in the theatre suite';
    }
    else if (rooms[basis] !== undefined && COUNT_UNITS.has(unitCode)) { qty_from = { kind: 'ROOMS', rooms: rooms[basis] as readonly string[] }; unit = 'rooms'; }
    // Communal floor area in supported living is not the whole floor area: never drafted from it.
    // PHASE 153e (Word question 133): drafted from the shared areas the surveyor reads off the floor plans instead; with
    // none, a flat 25% of the floor area, labelled as the fallback it is (src/web/survey-pack.ts, sharedDraft).
    if (qty_from.kind === 'GIA' && /^communal/i.test(basis)) { qty_from = { kind: 'SHARED' }; unit = 'm² of common parts'; }
    const pct = (r['qualifying_pct'] ?? '').trim();
    const qpct_bp = /^\d{1,3}$/.test(pct) && Number(pct) <= 100 ? Number(pct) * 100 : null;
    const place = PLACEMENT[r['element_id'] ?? ''];
    const authority = (r['authority'] ?? '').trim();
    out.push(Object.freeze({
      element_id: r['element_id'] ?? '',
      label: sentence(r['element_name'] ?? ''),
      unit, qty_from,
      pool: place !== undefined && place.pool !== undefined ? place.pool : POOL_OF[listPool] ?? null,
      qpct_bp: place?.qpct_bp ?? qpct_bp,
      authority: place === undefined ? authority : `${authority === '' ? '' : `${authority} · `}${TEST_DEFAULT_WORDS}: ${place.note}`,
      status: place?.status ?? (r['status'] ?? '').trim(),
      basis,
    }));
  }
  for (const a of ADDED_ROWS[code] ?? []) {
    out.push(Object.freeze({
      element_id: a.element_id, label: a.label, unit: a.unit, qty_from: { kind: 'NONE' } as const, pool: 'MP' as Pool, qpct_bp: 10000,
      authority: `${TEST_DEFAULT_WORDS}: its own plant, not part of the building’s systems (question 135)`, status: 'JUDGEMENT', basis: 'room schedule',
    }));
  }
  return out;
}
