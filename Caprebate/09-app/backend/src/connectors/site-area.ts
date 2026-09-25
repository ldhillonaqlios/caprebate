/**
 * A PROPERTY'S SITE AREA FROM HM LAND REGISTRY'S LAND BOUNDARY — WIRED, AND SWITCHED OFF. Phase 151a, 24 Sep 2026.
 *
 * THE ONE BACK-END FUNCTION, `siteAreaFromLandBoundary`, that joins what Phase 150 built to a stored fact:
 *
 *   1. the switch. While BOUNDARY_FETCHING_SWITCHED_ON (04-phase-work/phase9/caprebate-boundary-import.ts) is false it
 *      returns SWITCHED_OFF before anything else — nothing read, nothing sent, nothing stored;
 *   2. the use. `checkBoundaryUse('INTERNAL_CALCULATION')` must say yes. The boundary is for our own checks only
 *      (CURRENT_LICENCE_PERMISSION, Lakhbir, 15 September 2026);
 *   3. the point. A British National Grid easting and northing — one a person enters, or one a supplier gives in that
 *      grid — or an ETRS89 latitude and longitude, converted by Ordnance Survey's exact method (src/connectors/
 *      ostn15.ts) and refused rather than approximated. NO POINT, NO LOOKUP (N4): the site area stays asked;
 *   4. the council's file. Each council code (the postcode's council from the ONS table, then any a person adds) is
 *      turned into HM Land Registry's file name by src/connectors/inspire-councils.ts; a code with no entry is refused.
 *      A property on a council boundary can sit in two files, so every council given is read, and the answer says
 *      which were;
 *   5. the boundary. `inspireBoundaryFetcher` — one per council, with the month's kept file where there is one
 *      (src/connectors/inspire-store.ts) — is injected into `fetchAndImportBoundary`, and the module works out the
 *      area of the one polygon that holds the point;
 *   6. the fact. site_area_m2 is stored through the one door, `ingestRegisterRecord`, under source HMLR_INSPIRE, at
 *      grade B at best (the source register's max_grade for HMLR_INSPIRE), with the polygon's INSPIRE ID. A record
 *      already held for the property is kept as it was, as research does (Phase 139).
 *
 * WHAT NEVER LEAVES THIS FUNCTION: the polygon, a map of it, and its coordinates. The outcome carries a number, a
 * grade, the councils read and the reason — nothing else — and the stored record carries the area, its grade and the
 * polygon's identifier. The boundary module's CURRENT_LICENCE_PERMISSION keeps a boundary out of every client report
 * and this function gives no way round it.
 *
 * ITS ONE CALLER IS THE RESEARCH RUN AFTER SIGNING (Phase 151c, src/web/site-area-run.ts): "Run the research" works
 * out each property's site area on the same click, passing the postcode's council, any neighbouring council a person
 * added, and the point a person entered or Homedata's own easting and northing. NOTHING CAN FIRE IT TODAY: the switch
 * is false. Turning it on is the one word in the boundary module, once the data protection officer answers "Can we
 * make a few small, logged test lookups to check a data connector works?".
 */
import type { Db } from '../db.ts';
import {
  BOUNDARY_FETCHING_SWITCHED_ON,
  BoundaryImportError,
  checkBoundaryUse,
  computeSiteArea,
  fetchAndImportBoundary,
  type BoundaryFetcher,
  type BoundaryFetchPlanItem,
  type CartographicArtefact,
  type RawBoundaryPayload,
} from '../../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import { SOURCES as REGISTER_SOURCES, worstGrade, type Grade } from '../../../../04-phase-work/phase3/caprebate-source-register.ts';
import { ingestRegisterRecord } from '../stubs/registers.ts';
import type { CallDeps, GateSnapshot } from './http.ts';
import { inspireBoundaryFetcher } from './inspire.ts';
import { inspireFileForLad } from './inspire-councils.ts';
import type { InspireFileStore } from './inspire-store.ts';
import { etrs89ToBritishNationalGrid, type Ostn15Grid } from './ostn15.ts';
import { resolveProperty } from '../web/postcode.ts';
import type { PostcodeStore } from '../web/postcode-port.ts';

export const SITE_AREA_SOURCE_ID = 'HMLR_INSPIRE';

/** The best grade a land boundary's area can carry: the source register's ceiling for HMLR_INSPIRE (B). */
export const SITE_AREA_GRADE_CEILING: Grade = (() => {
  const g = REGISTER_SOURCES.find((s) => s.source_id === SITE_AREA_SOURCE_ID)?.max_grade;
  if (g === undefined) throw new Error('HMLR_INSPIRE is not in the source register.');
  return g;
})();

/**
 * WHICH DATUM HOMEDATA'S LATITUDE AND LONGITUDE ARE IN. Homedata's own schema (https://api.homedata.co.uk/schema/yaml/,
 * read 24 September 2026) labels them "WGS84" — not ETRS89, which is what Ordnance Survey's exact conversion takes, and
 * the two differ by about a metre today. So a Homedata latitude and longitude is refused (DATUM_NOT_ETRS89). The same
 * schema publishes `easting` and `northing`, and the connector now keeps them: those are used instead, unconverted. Set
 * this to 'ETRS89' only on the supplier's written word that its figures are ETRS89.
 */
export const HOMEDATA_COORDINATE_DATUM: 'ETRS89' | null = null;

export type SiteAreaState =
  | 'SWITCHED_OFF'
  | 'NOT_PERMITTED'
  | 'NO_POINT'
  | 'NO_COUNCIL'
  | 'NOT_FOUND'
  | 'ALREADY_HELD'
  | 'STORED';

/** What a caller is told. A number, a grade, the councils read and the reason — never a polygon or a coordinate. */
export type SiteAreaOutcome = {
  readonly state: SiteAreaState;
  readonly why: string;
  readonly site_area_m2: number | null;
  readonly grade: Grade | null;
  /** The councils whose files were read (or would have been), by ONS name. */
  readonly councils_read: readonly string[];
  readonly record_id: string | null;
};

export type SiteAreaDeps = {
  readonly db: Db;
  readonly newId: () => string;
  readonly now: () => string;
  /** How a download would reach HM Land Registry: src/connectors/http.ts's deps. */
  readonly call: CallDeps;
  /** Ordnance Survey's OSTN15 grid (src/connectors/ostn15.ts), or null — then a latitude and longitude is refused. */
  readonly grid: Ostn15Grid | null;
  /** Where a council's file is kept for the month, or null — then every lookup downloads. */
  readonly file_store: InspireFileStore | null;
};

export type SiteAreaInput = {
  readonly business_id: string;
  readonly property_id: string;
  /** Council codes (ONS), the postcode's council first, then any a person adds for a site on a council boundary. */
  readonly lad_codes: readonly unknown[];
  /** { easting, northing } in British National Grid, or { latitude, longitude, datum: 'ETRS89' }. */
  readonly point: unknown;
  readonly actor_id: string | null;
  readonly actor_role?: string | null;
  readonly claim_id: string | null;
  readonly gate: Omit<GateSnapshot, 'switched_on'>;
  /** TESTS ONLY, passed on to the fetcher. Absent, BOUNDARY_FETCHING_SWITCHED_ON is read, and it is false. */
  readonly switched_on?: boolean;
};

const outcome = (state: SiteAreaState, why: string, over: Partial<SiteAreaOutcome> = {}): SiteAreaOutcome =>
  ({ state, why, site_area_m2: null, grade: null, councils_read: [], record_id: null, ...over });

/** British National Grid's extent, in metres: a point outside it cannot be a property in Great Britain. */
const BNG_MAX_EASTING = 700_000;
const BNG_MAX_NORTHING = 1_300_000;

/** The property's point in British National Grid, or why there is none. Never a default and never 0 (N4). */
export function pointInBritishNationalGrid(point: unknown, grid: Ostn15Grid | null):
  { readonly ok: true; readonly easting: number; readonly northing: number } | { readonly ok: false; readonly why: string } {
  if (point === null || point === undefined || typeof point !== 'object') {
    return { ok: false, why: 'We have no point for the property, so there is nothing to look for. The site area stays asked.' };
  }
  const p = point as Record<string, unknown>;
  const hasGrid = 'easting' in p || 'northing' in p;
  const hasDegrees = 'latitude' in p || 'longitude' in p;
  if (hasGrid && hasDegrees) return { ok: false, why: 'The point is given two ways at once, so we do not know which to use.' };
  if (hasGrid) {
    const e = p['easting']; const n = p['northing'];
    if (typeof e !== 'number' || typeof n !== 'number' || !Number.isFinite(e) || !Number.isFinite(n)) {
      return { ok: false, why: 'The easting and northing are missing or are not numbers. The site area stays asked.' };
    }
    if (e < 0 || n < 0 || e > BNG_MAX_EASTING || n > BNG_MAX_NORTHING) {
      return { ok: false, why: 'The easting and northing are outside Great Britain\'s national grid.' };
    }
    return { ok: true, easting: e, northing: n };
  }
  if (hasDegrees) {
    const c = etrs89ToBritishNationalGrid(p, grid);
    return c.ok ? { ok: true, easting: c.easting, northing: c.northing } : { ok: false, why: `${c.why} The site area stays asked.` };
  }
  return { ok: false, why: 'We have no point for the property, so there is nothing to look for. The site area stays asked.' };
}

/**
 * Reads every council's file and keeps the one polygon that holds the point. The same INSPIRE ID in two files is the
 * same polygon (HM Land Registry puts a boundary polygon in both) and must be identical in both; two different
 * polygons are a refusal. A failure in any file other than "no polygon here" is a refusal of the whole: a file we
 * could not read might hold the answer.
 */
function acrossFiles(fetchers: readonly { readonly council: string; readonly fetch: BoundaryFetcher }[], found: { id: string | null }): BoundaryFetcher {
  return async (item: BoundaryFetchPlanItem): Promise<RawBoundaryPayload> => {
    const hits: { council: string; id: string; payload: RawBoundaryPayload }[] = [];
    for (const f of fetchers) {
      try {
        const payload = await f.fetch(item);
        hits.push({ council: f.council, id: payload.meta.artefact_id.replace(/^inspire:/, ''), payload });
      } catch (e) {
        if (e instanceof BoundaryImportError && e.code === 'E_NO_FREEHOLD_POLYGON') continue;
        throw e;
      }
    }
    if (hits.length === 0) {
      throw new BoundaryImportError('E_NO_FREEHOLD_POLYGON',
        `No freehold polygon holds the point in ${fetchers.map((f) => f.council).join(' or ')}'s land boundary file. ` +
        'The site may be leasehold only, unregistered or in another council, or the point may be wrong.');
    }
    const ids = [...new Set(hits.map((h) => h.id))];
    const first = hits[0] as (typeof hits)[number];
    if (ids.length > 1 || hits.some((h) => JSON.stringify(h.payload.geometry) !== JSON.stringify(first.payload.geometry))) {
      throw new BoundaryImportError('E_AMBIGUOUS_POLYGON',
        'The councils\' files disagree about which polygon holds the point, so none is picked. A person must decide.',
        { candidates: ids.sort() });
    }
    found.id = first.id;
    return first.payload;
  };
}

/** Everything checked, and nothing yet read or sent: what the download needs. */
export type SiteAreaReady = {
  readonly point: { readonly easting: number; readonly northing: number };
  readonly councils: readonly { readonly lad_code: string; readonly council: string; readonly file: string }[];
  readonly names: readonly string[];
  /** The sentence that says which councils' files are (or would be) read. */
  readonly which: string;
  readonly entity_id: string;
};

/**
 * EVERY CHECK BEFORE THE DOWNLOAD, AND NOTHING ELSE. Phase 151c split this out of `siteAreaFromLandBoundary`, unchanged
 * and in the same order, so the research panel can say what the next click would do without sending anything: the
 * switch, the use, the property, the point, the councils, and a site area already held. It reads the database and
 * nothing outside it. An outcome is a reason to stop; `ready` is everything the download needs.
 */
export function planSiteArea(d: Pick<SiteAreaDeps, 'db' | 'grid'>, input: SiteAreaInput):
  { readonly ready: false; readonly outcome: SiteAreaOutcome } | ({ readonly ready: true } & SiteAreaReady) {
  const stop = (o: SiteAreaOutcome) => ({ ready: false as const, outcome: o });
  const on = input.switched_on ?? BOUNDARY_FETCHING_SWITCHED_ON;
  if (on !== true) {
    return stop(outcome('SWITCHED_OFF',
      'Working out the site area from HM Land Registry\'s land boundaries is switched off. It waits on one answer from ' +
      'the data protection officer, about small test lookups. Nothing was read or sent, and the site area stays asked.'));
  }
  const use = checkBoundaryUse('INTERNAL_CALCULATION');
  if (!use.permitted) return stop(outcome('NOT_PERMITTED', use.reason));

  const property = d.db.get<{ id: string }>('SELECT id FROM properties WHERE id = ? AND business_id = ?', [input.property_id, input.business_id]);
  if (property === undefined) return stop(outcome('NOT_PERMITTED', 'That property is not one of this company\'s, so nothing was looked up.'));

  const point = pointInBritishNationalGrid(input.point, d.grid);
  if (!point.ok) return stop(outcome('NO_POINT', point.why));

  const councils: { lad_code: string; council: string; file: string }[] = [];
  for (const code of input.lad_codes) {
    const c = inspireFileForLad(code);
    if (!c.ok) return stop(outcome('NO_COUNCIL', `${c.why} Nothing was sent, and the site area stays asked.`));
    if (!councils.some((x) => x.file === c.file)) councils.push(c);
  }
  if (councils.length === 0) {
    return stop(outcome('NO_COUNCIL', 'We do not know which council the property is in, so we cannot tell which land boundary file to read. The site area stays asked.'));
  }
  const names = councils.map((c) => c.council);
  const which = councils.length === 1
    ? ` We read ${names[0]}'s file only. A site on the edge of a council area can also be in the next council's file; a person can add that council and both are read.`
    : ` We read the files of ${names.join(' and ')}.`;

  const entity_id = `property:${input.property_id}`;
  const held = d.db.get<{ id: string; fields_json: string }>(
    'SELECT id, fields_json FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?',
    [input.business_id, SITE_AREA_SOURCE_ID, entity_id],
  );
  if (held !== undefined) {
    return stop(outcome('ALREADY_HELD', 'We already hold a site area from the land boundary for this property, so it was kept as it was and nothing was read.', { record_id: held.id }));
  }
  return { ready: true, point: { easting: point.easting, northing: point.northing }, councils, names, which, entity_id };
}

/**
 * THE FUNCTION. Works out a property's site area from HM Land Registry's land boundary and stores it through the one
 * door. Never throws for a lookup that could not be made or did not find one: every such case is a state with a
 * plain reason, and the site area stays asked.
 */
export async function siteAreaFromLandBoundary(d: SiteAreaDeps, input: SiteAreaInput): Promise<SiteAreaOutcome> {
  const plan = planSiteArea(d, input);
  if (!plan.ready) return plan.outcome;
  const { point, councils, names, which, entity_id } = plan;

  const found = { id: null as string | null };
  const fetchers = councils.map((c) => ({
    council: c.council,
    fetch: inspireBoundaryFetcher({
      local_authority_file: c.file,
      point: { easting: point.easting, northing: point.northing },
      deps: d.call, actor_id: input.actor_id, actor_role: input.actor_role ?? null, claim_id: input.claim_id, gate: input.gate,
      file_store: d.file_store,
      ...(input.switched_on === undefined ? {} : { switched_on: input.switched_on }),
    }),
  }));

  let parcel: CartographicArtefact;
  try {
    const out = await fetchAndImportBoundary(
      { property_ref: input.property_id, wants: ['PARCEL_BOUNDARY'] },
      { fetcher: acrossFiles(fetchers, found) },
    );
    parcel = out['PARCEL_BOUNDARY'] as CartographicArtefact;
  } catch (e) {
    const why = e instanceof BoundaryImportError ? e.message.replace(/^\[[A-Z_]+\]\s*/, '') : 'The land boundary could not be read.';
    return outcome('NOT_FOUND', `${why}${which} The site area stays asked.`, { councils_read: names });
  }

  const area = computeSiteArea(parcel);
  const grade = worstGrade([area.grade, SITE_AREA_GRADE_CEILING]);
  if (!(area.value > 0) || found.id === null) {
    return outcome('NOT_FOUND', `The land boundary gave no usable area.${which} The site area stays asked.`, { councils_read: names });
  }
  const record_id = ingestRegisterRecord(d.db, d.newId, d.now, input.business_id, {
    sourceId: SITE_AREA_SOURCE_ID,
    entityId: entity_id,
    fields: { site_area_m2: area.value, site_area_m2_grade: grade, inspire_id: found.id },
  }, { property_id: input.property_id });
  return outcome('STORED',
    `Site area ${area.value} square metres, from HM Land Registry's land boundary, marked confidence ${grade}. For our own checks only: ` +
    `the boundary itself is not kept and never goes in a report.${which}`,
    { site_area_m2: area.value, grade, councils_read: names, record_id });
}

/* ------------------------------------------------------------------ the two inputs a caller has */

/** The property's council code from its postcode, through the ONS table on this server, or why there is none. */
export function councilOfPostcode(postcode: string | null, store: PostcodeStore | null):
  { readonly ok: true; readonly lad_code: string } | { readonly ok: false; readonly why: string } {
  const r = resolveProperty(postcode, { store });
  return r.authority === null ? { ok: false, why: r.why } : { ok: true, lad_code: r.authority.lad_code };
}

/**
 * The property's point as Homedata gave it after signing (register_records, HOMEDATA_ADDRESS): its easting and northing
 * where it gave them, which need no conversion; otherwise its latitude and longitude, stated in the datum
 * HOMEDATA_COORDINATE_DATUM says — null today, so the conversion refuses them. Null when there is no such record.
 */
export function homedataPointOf(db: Db, business_id: string, property_id: string):
  { easting: unknown; northing: unknown } | { latitude: unknown; longitude: unknown; datum: 'ETRS89' | null } | null {
  const r = db.get<{ fields_json: string }>(
    "SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HOMEDATA_ADDRESS' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1",
    [business_id, property_id],
  );
  if (r === undefined) return null;
  try {
    const f = JSON.parse(r.fields_json) as Record<string, unknown>;
    // Homedata's own British National Grid point first: it needs no conversion.
    if (f['easting'] !== undefined && f['northing'] !== undefined) return { easting: f['easting'], northing: f['northing'] };
    if (f['latitude'] === undefined || f['longitude'] === undefined) return null;
    return { latitude: f['latitude'], longitude: f['longitude'], datum: HOMEDATA_COORDINATE_DATUM };
  } catch { return null; }
}
