/**
 * THE LAND BOUNDARY'S TEST LOOKUP — ONE COUNCIL'S FILE, UNDER LAKHBIR'S FIVE CONDITIONS. Phase 151l, 28 September 2026.
 *
 * WHY IT EXISTS. The land boundary fetcher (src/connectors/inspire.ts, Phase 150) is built and switched off, and HM Land
 * Registry does not publish the element names inside its GML, so its reader was written tolerantly and the one page
 * says "the first allowed download must confirm the shape". Word question 170 was answered on 25 September 2026 (yes,
 * on five conditions), and Phase 151g built the conditions into the smoke command, which did not cover a download. This
 * file is the download, as a test lookup: `smoke HMLR_INSPIRE`.
 *
 * WHY THE SMOKE COMMAND AND NOT A COMMAND OF ITS OWN. So the five conditions are the SAME CODE, not a copy: the notice,
 * CAPREBATE_LIVE_SMOKE=1, --who and --why, the log outside the repository, the count of three from a
 * `smoke-switched-on HMLR_INSPIRE` line, the never-a-client check against CAPREBATE_DB or --not-a-client, and the one
 * line written PASS or NO whatever happens — all of it is runSmokeCommand's (src/connectors/test-lookups.ts), and only
 * the values asked about and the call itself are this file's.
 *
 * PUBLIC VALUES ONLY. The default point is the Treasury Buildings, whose Whitehall address is 70 Whitehall — the
 * Cabinet Office, the same building as SMOKE_DEFAULTS. Its British National Grid reference, TQ 30120 79956, is published
 * by Historic England in the National Heritage List for England, list entry 1267063 ("Treasury Buildings (Cabinet Office
 * and Privy Council Office)", Grade I, district City of Westminster), read 28 September 2026: easting 530120, northing
 * 179956 in metres (the TQ square begins at 500000 east, 100000 north). ONLY THE COUNCIL'S NAME LEAVES THIS SERVER, as
 * the file name in the download's address; the point stays here, and the polygon is found on this server.
 *
 * WHAT A PASS MEANS, AND NOTHING MORE. The council's file downloaded; every polygon in it read by the existing reader,
 * which refuses the whole file on one it cannot read — the shape check the one page asks for; and the one polygon
 * holding the point found. A NO says how far it got. THE FILE AND THE POLYGON ARE THROWN AWAY: no file store is given
 * (so nothing is kept in CAPREBATE_INSPIRE_STORE_DIR), nothing is stored through the one door, and the answer carries a
 * stage and a sentence, never the polygon, its identifier or a coordinate.
 *
 * THE SWITCH STAYS FALSE. BOUNDARY_FETCHING_SWITCHED_ON is read nowhere here and changed nowhere: this turns the fetcher
 * on for ONE call, in a command a person typed, the way smokeOne turns one register on in a map of its own. Both gates
 * are reported shut on the audit row, because a test lookup opens neither. test/phase151l.test.ts proves the shipped
 * constant is untouched, and test/phase150.test.ts allows this file, and only this file besides the site area function,
 * to name the fetcher.
 */
import type { Db } from '../db.ts';
import { BoundaryImportError, type BoundaryFetchPlanItem } from '../../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import { RateLimiter, type CallDeps } from './http.ts';
import { inspireBoundaryFetcher } from './inspire.ts';
import { INSPIRE_COUNCILS, inspireFileForLad } from './inspire-councils.ts';
import { pointInBritishNationalGrid } from './site-area.ts';

/** The connector's name in the test lookup log and on the command line: the source register's own. */
export const BOUNDARY_TEST_SOURCE = 'HMLR_INSPIRE';

/** Historic England, list entry 1267063: TQ 30120 79956, City of Westminster. See the head of this file. */
export const BOUNDARY_TEST_DEFAULTS = Object.freeze({
  easting: 530120,
  northing: 179956,
  lad_code: 'E09000033',
  council: 'Westminster',
  file: 'City_of_Westminster',
  source: 'Historic England, National Heritage List for England, list entry 1267063 (Treasury Buildings, 70 Whitehall): NGR TQ 30120 79956, read 28 September 2026',
});

/**
 * A POINT HELD FOR A CLIENT'S PROPERTY, AND ONE TYPED NEAR IT, ARE THE SAME THING. The lookup finds the polygon that
 * holds the point, so a point anywhere on a client's land would find the client's land. A site's size is not known
 * before its boundary is, so this is a cautious distance, not a measured one: a typed point within it of any point held
 * for a property in CAPREBATE_DB is refused.
 */
export const CLIENT_POINT_RADIUS_M = 250;

export type BoundaryTestValues = {
  readonly easting: number;
  readonly northing: number;
  readonly lad_code: string;
  readonly council: string;
  readonly file: string;
};

/** `--name value`, as test-lookups.ts reads it. */
function flag(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return null;
  const v = argv[i + 1];
  return typeof v === 'string' && !v.startsWith('--') ? v : null;
}

/**
 * The values from the command line, or the sentence that says why they cannot be used. --easting and --northing come
 * together or not at all; --council is an ONS council code ("E09000033") or HM Land Registry's file name
 * ("City_of_Westminster"), and one in neither published list is refused, never matched to the nearest.
 */
export function boundaryValuesFrom(argv: readonly string[]): BoundaryTestValues | string {
  const e = flag(argv, 'easting');
  const n = flag(argv, 'northing');
  if ((e === null) !== (n === null)) return '--easting and --northing go together: give both, or neither for the public default';
  const point = pointInBritishNationalGrid(
    e === null ? { easting: BOUNDARY_TEST_DEFAULTS.easting, northing: BOUNDARY_TEST_DEFAULTS.northing } : { easting: Number(e), northing: Number(n) },
    null,
  );
  if (!point.ok) return point.why;
  const c = (flag(argv, 'council') ?? BOUNDARY_TEST_DEFAULTS.lad_code).trim();
  const byFile = INSPIRE_COUNCILS.find((r) => r.file === c);
  const council = inspireFileForLad(byFile === undefined ? c : byFile.lad_code);
  if (!council.ok) return council.why;
  return { easting: point.easting, northing: point.northing, lad_code: council.lad_code, council: council.council, file: council.file };
}

/** The fields whose value is not the public default, by name — what --not-a-client must cover with no database. */
export function notTheBoundaryDefaults(v: BoundaryTestValues): string[] {
  const out: string[] = [];
  if (v.easting !== BOUNDARY_TEST_DEFAULTS.easting || v.northing !== BOUNDARY_TEST_DEFAULTS.northing) out.push('point');
  if (v.lad_code !== BOUNDARY_TEST_DEFAULTS.lad_code) out.push('council');
  return out;
}

/**
 * CONDITION 2 AGAINST THE DATABASE, FOR A POINT AND A COUNCIL. Every point a person entered for a property and every
 * easting and northing the paid address lookup gave, within CLIENT_POINT_RADIUS_M; every council a person added for a
 * property. A match refuses and names the FIELD, never the value. A database that cannot be read refuses.
 */
export function boundaryClientMatchIn(db: Db, v: BoundaryTestValues): { readonly ok: true } | { readonly ok: false; readonly why: string } {
  let entered: { easting: number | null; northing: number | null }[];
  let councils: { lad_code: string | null }[];
  let supplier: { fields_json: string }[];
  try {
    entered = db.all("SELECT easting, northing FROM site_area_inputs WHERE kind = 'POINT'");
    councils = db.all("SELECT lad_code FROM site_area_inputs WHERE kind = 'NEIGHBOUR_COUNCIL'");
    supplier = db.all("SELECT fields_json FROM register_records WHERE source_id = 'HOMEDATA_ADDRESS'");
  } catch (e: unknown) {
    return { ok: false, why: `the clients in CAPREBATE_DB could not be read (${e instanceof Error ? e.message : String(e)}), so it is not known that these values are nobody's` };
  }
  const points = entered.map((p) => ({ e: p.easting, n: p.northing }));
  for (const r of supplier) {
    try {
      const f = JSON.parse(r.fields_json) as Record<string, unknown>;
      if (typeof f['easting'] === 'number' && typeof f['northing'] === 'number') points.push({ e: f['easting'], n: f['northing'] });
    } catch { /* a record that is not JSON holds no point */ }
  }
  const near = points.some((p) => typeof p.e === 'number' && typeof p.n === 'number'
    && Math.hypot(p.e - v.easting, p.n - v.northing) <= CLIENT_POINT_RADIUS_M);
  if (near) return { ok: false, why: `the point is within ${CLIENT_POINT_RADIUS_M} metres of a point held in the database for a client's property` };
  if (councils.some((c) => (c.lad_code ?? '').trim().toUpperCase() === v.lad_code)) {
    return { ok: false, why: 'the council is held in the database against a client\'s property' };
  }
  return { ok: true };
}

export type BoundaryTestStage =
  /** Nothing was downloaded: refused before it left, or the service did not give us the file. */
  | 'NOT_DOWNLOADED'
  /** The file came, and the reader refused it: the shape is not what it reads. */
  | 'SHAPE_REFUSED'
  /** Every polygon read, and not exactly one holds the point. */
  | 'NOT_FOUND'
  /** Every polygon read, and the one holding the point found. The only PASS. */
  | 'FOUND';

export type BoundaryTestResult = {
  readonly accepted: boolean;
  readonly stage: BoundaryTestStage;
  /** In plain words. Never the polygon, its identifier or a coordinate. */
  readonly why: string;
};

export type BoundaryTestDeps = {
  readonly audit: CallDeps['audit'];
  readonly now: () => string;
  readonly transport: CallDeps['transport'];
  readonly sleep?: (ms: number) => Promise<void>;
};

const ITEM: BoundaryFetchPlanItem = { kind: 'PARCEL_BOUNDARY', dataset: 'HMLR_INSPIRE_INDEX_POLYGON', locator: 'hmlr-inspire-index-polygon://test-lookup' };

/**
 * ONE DOWNLOAD, LIVE, AND THE ANSWER THROWN AWAY. The fetcher is switched on for this one call and handed no file store;
 * what it returns is looked at for one thing — that it came back — and dropped.
 */
export async function boundaryTestOne(v: BoundaryTestValues, d: BoundaryTestDeps): Promise<BoundaryTestResult> {
  const download = inspireBoundaryFetcher({
    local_authority_file: v.file,
    point: { easting: v.easting, northing: v.northing },
    deps: { audit: d.audit, now: d.now, transport: d.transport, limiter: new RateLimiter(), ...(d.sleep === undefined ? {} : { sleep: d.sleep }) },
    actor_id: null, actor_role: null, claim_id: null,
    // Neither gate is open, and a test lookup does not open one. The row says exactly that.
    gate: { free_gate_open: false, engagement_signed: false },
    file_store: null,
    switched_on: true,
  });
  try {
    await download(ITEM);
    return { accepted: true, stage: 'FOUND', why: `${v.council}'s file downloaded, every polygon in it was read, and the one polygon holding the point was found` };
  } catch (e: unknown) {
    const code = e instanceof BoundaryImportError ? e.code : null;
    const said = e instanceof Error ? e.message.replace(/^\[[A-Z_]+\]\s*/, '') : String(e);
    if (code === 'E_FILE_UNREADABLE') return { accepted: false, stage: 'SHAPE_REFUSED', why: `the file came, and the reader refused it: ${said}` };
    if (code === 'E_NO_FREEHOLD_POLYGON' || code === 'E_AMBIGUOUS_POLYGON') {
      return { accepted: false, stage: 'NOT_FOUND', why: `the file downloaded and every polygon in it was read, so its shape is one the reader reads; but ${said.charAt(0).toLowerCase()}${said.slice(1)}` };
    }
    return { accepted: false, stage: 'NOT_DOWNLOADED', why: said };
  }
}
