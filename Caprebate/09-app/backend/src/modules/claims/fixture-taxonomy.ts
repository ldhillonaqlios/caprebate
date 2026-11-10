/**
 * THE FIXTURE LIST: the 103 rows of `02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv`, read from the app's own
 * copy, and the engine's sector ids to the list's. Moved here from src/modules/survey/pack-lines.ts by Phase 161l2
 * (10 November 2026), unchanged: the claim's facts read the list (src/modules/claims/claim-facts.ts) and sit below the
 * survey, and the survey's pack lines read it from here through the claims' front door. It reads only the file.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** the app's own copy: edit the original, 02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv, then run `npm run copies`; npm run check fails while they differ (tools/app-copies.cjs). */
export const TAXONOMY_FILE = join(import.meta.dirname, '..', '..', '..', 'copies', 'Caprebate-Fixture-Taxonomy-v1.csv');

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
