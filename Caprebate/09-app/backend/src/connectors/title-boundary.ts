/**
 * PHASE 156f, 6 October 2026 — THE SITE AREA FROM HOMEDATA'S TITLE OUTLINE (B4). Lakhbir: "site boundary - use home data".
 *
 * Homedata sells the outline of the property's registered title as the `title_boundary` slug (5 tokens, 5p), on the same
 * /property/{uprn}/ call the paid address lookup already makes after signing (src/connectors/homedata.ts). This file
 * turns that outline into ONE number, `site_area_m2`, with the area code the land boundary already uses: the boundary
 * module's `parseBoundaryGeometry` and `computeSiteArea` (04-phase-work/phase9/caprebate-boundary-import.ts), the same
 * pair src/connectors/site-area.ts reaches through `fetchAndImportBoundary`. Nothing here measures an area itself.
 *
 * THE COORDINATES. The boundary module computes an area only in British National Grid (EPSG:27700) and refuses degrees.
 * A GeoJSON outline is normally longitude and latitude. So a ring in degrees is put onto the National Grid's own
 * projection (Transverse Mercator on GRS80, `projectNationalGrid` in src/connectors/ostn15.ts) WITHOUT Ordnance Survey's
 * OSTN15 shifts. Those shifts move a whole site by up to about 100 metres and barely bend it, so the AREA is the same to
 * well under one square metre in ten thousand; the POSITION would not be, which is why nothing here keeps a position.
 * A ring already in metres (an easting and northing) is used as it is. Anything else is refused, never guessed (N4).
 *
 * WHAT IS KEPT: the area, its grade and the UPRN it is for. NEVER the outline, a map of it, or any coordinate from it.
 * The boundary module's CURRENT_LICENCE_PERMISSION (internal calculation only) is checked by `parseBoundaryGeometry`
 * itself, and HOMEDATA_TERMS (the source register) keeps every report channel closed until Homedata's terms for title
 * outlines are confirmed. So the figure is for our own checks, as the INSPIRE one is.
 */
import {
  BoundaryImportError, computeSiteArea, parseBoundaryGeometry,
  type RawBoundaryGeometry, type RawRing,
} from '../../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import { GRS80, projectNationalGrid } from './ostn15.ts';
import { REGISTER_SWITCHES, switchedOn, type LookupResult, type RegisterConnector } from './registers.ts';

/** The source the area is stored under, through the one door. Its own, so nobody reads it as HM Land Registry's file. */
export const TITLE_BOUNDARY_SOURCE_ID = 'HOMEDATA_BOUNDARY';

/** The slug and its published weight, in tokens (= pence). */
export const TITLE_BOUNDARY_SLUG = 'title_boundary';
export const TITLE_BOUNDARY_TOKENS = 5;

/** How the area is labelled wherever a person reads it. */
export const TITLE_BOUNDARY_LABEL = 'from the Land Registry title outline, via Homedata';

export type TitleBoundaryArea =
  | { readonly ok: true; readonly site_area_m2: number; readonly grade: string; readonly rings: number }
  | { readonly ok: false; readonly why: string };

type Pair = readonly [number, number];
const isPair = (v: unknown): v is Pair =>
  Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number' && Number.isFinite(v[0]) && Number.isFinite(v[1]);
const isRing = (v: unknown): v is readonly Pair[] => Array.isArray(v) && v.length >= 3 && v.every(isPair);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);

/** Every polygon in a GeoJSON value, as rings (the first the outside, the rest holes). A Feature, a FeatureCollection,
 *  a geometry, or any of those under the keys Homedata's prose uses. Null when there is none. */
export function polygonsOf(v: unknown, depth = 0): (readonly Pair[])[][] | null {
  if (depth > 4) return null;
  if (typeof v === 'string') { try { return polygonsOf(JSON.parse(v) as unknown, depth + 1); } catch { return null; } }
  const o = obj(v);
  if (o === null) return null;
  const type = typeof o['type'] === 'string' ? (o['type'] as string) : '';
  const c = o['coordinates'];
  if (type === 'Polygon' && Array.isArray(c) && c.every(isRing)) return [c as (readonly Pair[])[]];
  if (type === 'MultiPolygon' && Array.isArray(c) && c.every((p) => Array.isArray(p) && p.every(isRing))) return c as (readonly Pair[])[][];
  if (type === 'Feature') return polygonsOf(o['geometry'], depth + 1);
  if (type === 'FeatureCollection' && Array.isArray(o['features'])) {
    const all = (o['features'] as unknown[]).flatMap((f) => polygonsOf(f, depth + 1) ?? []);
    return all.length > 0 ? all : null;
  }
  if (type === 'GeometryCollection' && Array.isArray(o['geometries'])) {
    const all = (o['geometries'] as unknown[]).flatMap((g) => polygonsOf(g, depth + 1) ?? []);
    return all.length > 0 ? all : null;
  }
  for (const k of ['geojson', 'geometry', 'boundary', 'polygon', 'title_boundary', 'features']) {
    if (o[k] === undefined) continue;
    const inner = k === 'features' && Array.isArray(o[k]) ? polygonsOf({ type: 'FeatureCollection', features: o[k] }, depth + 1) : polygonsOf(o[k], depth + 1);
    if (inner !== null) return inner;
  }
  return null;
}

/** Degrees (longitude, latitude inside the UK), metres (easting, northing inside the National Grid), or neither. */
export function unitsOf(polygons: readonly (readonly (readonly Pair[])[])[]): 'DEGREES' | 'METRES' | null {
  const pts = polygons.flat(2) as Pair[];
  if (pts.length === 0) return null;
  if (pts.every(([x, y]) => x >= -9 && x <= 3 && y >= 49 && y <= 61)) return 'DEGREES';
  if (pts.every(([x, y]) => x >= 0 && x <= 700_000 && y >= 0 && y <= 1_300_000)) return 'METRES';
  return null;
}

/**
 * THE AREA OF THE OUTLINE, by the boundary module, or why there is none. Never throws, never a zero (N4): an outline
 * that cannot be read leaves the site area asked.
 */
export function titleBoundaryArea(raw: unknown, meta: { readonly uprn: string; readonly retrieved_at: string }): TitleBoundaryArea {
  const polygons = polygonsOf(raw);
  if (polygons === null || polygons.length === 0) return { ok: false, why: 'Homedata sent no title outline we could read' };
  const units = unitsOf(polygons);
  if (units === null) return { ok: false, why: 'the title outline’s coordinates are neither degrees nor metres inside Great Britain, so no area was worked out' };
  const toGrid = (r: readonly Pair[]): RawRing => r.map(([x, y]) => {
    if (units === 'METRES') return [x, y] as const;
    const p = projectNationalGrid(y, x, GRS80);
    return [p.easting, p.northing] as const;
  });
  const geometry: RawBoundaryGeometry = {
    type: 'MultiPolygon', crs: 'EPSG:27700',
    polygons: polygons.map((rings) => ({ exterior: toGrid(rings[0] ?? []), holes: rings.slice(1).map(toGrid) })),
  };
  try {
    const parcel = parseBoundaryGeometry(geometry, {
      artefact_id: `homedata-title-boundary:${meta.uprn}`, kind: 'PARCEL_BOUNDARY', source_kind: 'HMLR_INSPIRE_INDEX_POLYGON',
      retrieved_at: meta.retrieved_at, locator: `homedata:/property/${meta.uprn}/?with=${TITLE_BOUNDARY_SLUG}`,
    });
    const area = computeSiteArea(parcel);
    if (!(area.value > 0)) return { ok: false, why: 'the title outline gave no usable area' };
    return { ok: true, site_area_m2: area.value, grade: area.grade, rings: polygons.length };
  } catch (e) {
    return { ok: false, why: e instanceof BoundaryImportError ? e.message.replace(/^\[[A-Z_]+\]\s*/, '') : 'the title outline could not be measured' };
  }
}

/* ------------------------------------------------------------------ the HOMEDATA_BOUNDARY lookup */

export type TitleBoundaryQuery = {
  /** What the paid address lookup worked out from the outline on this click, or null when it did not ask or did not run. */
  readonly area: TitleBoundaryArea | null;
  readonly uprn: string | null;
};

/**
 * THE SITE BOUNDARY'S ROW ON "RUN THE RESEARCH", AND IT MAKES NO CALL OF ITS OWN. The outline is bought on the paid
 * address lookup's property call (one call, 5p more), because Homedata sells it by the same UPRN on the same path; a
 * second call for it would cost the 1p property call again. So this lookup reads what that call worked out, in the
 * facts it handed on, and keeps the area under its own source. Its switch is HOMEDATA_BOUNDARY: off, the address lookup
 * does not ask for the outline and this row says it is switched off.
 */
export const homedataBoundary: RegisterConnector<TitleBoundaryQuery> = {
  source_id: TITLE_BOUNDARY_SOURCE_ID,
  service_id: 'HOMEDATA_ADDRESS',
  owner: null,
  configured(_secrets, switches = REGISTER_SWITCHES) {
    return switchedOn(TITLE_BOUNDARY_SOURCE_ID, switches)
      ? { state: 'READY', why: 'switched on; it reads the paid address lookup’s answer and makes no call of its own' }
      : { state: 'SWITCHED_OFF', why: 'not switched on yet' };
  },
  fetch() { return Promise.reject(new Error('the site boundary makes no call of its own: it reads the paid address lookup’s answer')); },
  toBundle() { return null; },
  async lookup(_ctx, q): Promise<LookupResult> {
    if (q.uprn === null || q.area === null) {
      return { kind: 'NOT_MATCHED', code: 'INSUFFICIENT_INPUT', calls: [],
        why: 'the paid address lookup found no property on this click, so there is no title outline' };
    }
    if (!q.area.ok) return { kind: 'NOT_MATCHED', code: 'NO_MATCH', calls: [], why: q.area.why };
    return {
      kind: 'READ', calls: [],
      bundle: {
        records: [{ sourceId: TITLE_BOUNDARY_SOURCE_ID, entityId: `uprn:${q.uprn}`,
          fields: { site_area_m2: q.area.site_area_m2, site_area_m2_grade: q.area.grade, uprn: q.uprn } }],
        facts: { site_area_m2: q.area.site_area_m2 },
      },
      note: `site area ${q.area.site_area_m2} square metres, ${TITLE_BOUNDARY_LABEL}, marked confidence ${q.area.grade}. ` +
        'For our own checks only: the outline itself is not kept and never goes in a report',
    };
  },
};
