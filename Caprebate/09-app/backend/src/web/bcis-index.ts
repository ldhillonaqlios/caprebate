/**
 * THE BCIS INDEX TABLE, FROM A FILE LAKHBIR DOWNLOADS — KEPT OUTSIDE THE REPOSITORY. Phase 155 (line 4), 4 October 2026.
 *
 * BCIS is the chosen cost source (Word answers 6 and 8) but publishes no API licence, and the product is not bought
 * (Word question 218). So nothing here calls BCIS. Once it is bought, Lakhbir downloads the index series as a
 * spreadsheet saved as CSV and runs `node src/cli.ts import-bcis-index <file>`. The cost model's own reader
 * (04-phase-work/phase9/caprebate-cost-model.cjs, parseIndexTable) turns it into a table of exactly CB_BCIS_INDEX's
 * shape, and this file writes it to CAPREBATE_BCIS_INDEX_FILE, or ~/.caprebate-bcis-index.json — NEVER inside the
 * repository, which is refused: BCIS's licence lets named users use the rates and does not let the table be reproduced
 * (BCIS_COMMERCIAL in the source register), so it is never committed and never published on the test website.
 *
 * UNTIL THEN: the shipped CB_BCIS_INDEX stays an empty stub, and the cost model's test system uses its PLACEHOLDER table
 * of invented points, labelled as such. Using the real table in the survey pack waits on the pack being wired to the
 * cost model at all — Phase 157's loose end from Phase 153e, which also carries Phase 153e line 12's index factor.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { isInside, repositoryRoot } from '../secrets.ts';

type IndexTable = { loaded: true; source: string; licence: string; verified_at: string | null; points: readonly (readonly [string, number])[] };
const costModel = createRequire(import.meta.url)('../../../../04-phase-work/phase9/caprebate-cost-model.cjs') as {
  parseIndexTable: (text: string, meta: { source: string; verified_at: string }) => { table: IndexTable; passed_over: number };
};

export const DEFAULT_BCIS_INDEX_FILE = '~/.caprebate-bcis-index.json';

/** Where the table is kept: CAPREBATE_BCIS_INDEX_FILE, or the default, with `~` expanded. Not yet checked. */
export function bcisIndexPath(env: Record<string, string | undefined> = process.env): string {
  const raw = (env.CAPREBATE_BCIS_INDEX_FILE ?? '').trim() || DEFAULT_BCIS_INDEX_FILE;
  const expanded = raw === '~' ? homedir() : raw.startsWith('~/') ? join(homedir(), raw.slice(2)) : raw;
  return isAbsolute(expanded) ? expanded : resolve(expanded);
}

export type BcisImport =
  | { readonly ok: true; readonly path: string; readonly points: number; readonly from: string; readonly to: string; readonly passed_over: number }
  | { readonly ok: false; readonly why: string };

/** Read a downloaded index file and keep the table outside the repository. A file the cost model refuses is refused whole. */
export function importBcisIndex(csv: string, fileName: string, nowIso: string,
  env: Record<string, string | undefined> = process.env, repoRoot: string = repositoryRoot()): BcisImport {
  const path = bcisIndexPath(env);
  if (isInside(path, repoRoot)) {
    return { ok: false, why: `the BCIS index may not be kept inside the repository (${repoRoot}): BCIS's licence does not let the table be reproduced. Set CAPREBATE_BCIS_INDEX_FILE to a file outside it, or leave it unset for ${DEFAULT_BCIS_INDEX_FILE}` };
  }
  let parsed: { table: IndexTable; passed_over: number };
  try {
    parsed = costModel.parseIndexTable(csv, { source: `BCIS building price index, imported from ${basename(fileName)} on ${nowIso.slice(0, 10)}`, verified_at: nowIso });
  } catch (e) {
    return { ok: false, why: `the file was not imported: ${e instanceof Error ? e.message : String(e)}` };
  }
  const t = parsed.table;
  writeFileSync(path, `${JSON.stringify(t, null, 1)}\n`, { mode: 0o600 });
  const first = t.points[0]?.[0] ?? '';
  const last = t.points[t.points.length - 1]?.[0] ?? '';
  return { ok: true, path, points: t.points.length, from: first, to: last, passed_over: parsed.passed_over };
}

/**
 * The table, read back for the cost model (`{ tables: { CB_BCIS_INDEX: … } }`), or null with the reason. Null where no
 * file has been imported, where it sits inside the repository, or where it cannot be read as a table — never a guess.
 */
export function bcisIndexTable(env: Record<string, string | undefined> = process.env, repoRoot: string = repositoryRoot()):
  { readonly table: IndexTable } | { readonly table: null; readonly why: string } {
  const path = bcisIndexPath(env);
  if (isInside(path, repoRoot)) return { table: null, why: 'the BCIS index file is inside the repository, so it is not read' };
  if (!existsSync(path)) return { table: null, why: 'no BCIS index has been imported: BCIS is not bought yet (Word question 218)' };
  try {
    const t = JSON.parse(readFileSync(path, 'utf8')) as Partial<IndexTable>;
    const ok = t.loaded === true && typeof t.source === 'string' && Array.isArray(t.points) && t.points.length >= 2 &&
      t.points.every((p) => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'number' && p[1] > 0);
    return ok ? { table: t as IndexTable } : { table: null, why: 'the BCIS index file is not a table this reads; import it again' };
  } catch {
    return { table: null, why: 'the BCIS index file could not be read; import it again' };
  }
}
