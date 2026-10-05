/**
 * THE BUILDING OUTLINES FOR THE REPORT'S SITE PLAN — Ordnance Survey's free maps. 2 October 2026, the survey pack, stage 6.
 *
 * Lakhbir, 1 Oct 2026: the report's cover shows the building from Ordnance Survey's free building outlines, and never the
 * site boundary (INSPIRE, src/connectors/inspire.ts, which stays on our own sums only). 2 Oct 2026, asked how the
 * client's building is chosen: "Automatic" — the building the postcode's point falls in, else the nearest one.
 *
 * TWO CALLS, AND WHAT EACH SENDS:
 *   1. postcodes.io (POSTCODES_IO, already used by the postcode check): the postcode, and nothing else. Back: the
 *      postcode's point on the British National Grid (easting and northing, in metres).
 *   2. Ordnance Survey's Features API (OS_FEATURES): a square of map around that point. Back: the outlines of the
 *      buildings in it, from OS Open Zoomstack (open data, Open Government Licence). Never a name or an address.
 *
 * Nothing here decides whether the calls may be made: the caller (src/web/site-plan.ts) asks that first. Every call is
 * one audit row (src/connectors/http.ts). A call that does not work comes back as words, never a guess.
 */
import { callOutside, type CallDeps, type GateSnapshot } from './http.ts';
import { normalisePostcode, POSTCODE_CHECK_ENDPOINT, POSTCODE_CHECK_SERVICE_ID } from './postcode-check.ts';

export const OS_SERVICE_ID = 'OS_FEATURES';
export const OS_ENDPOINT = '/features/v1/wfs';
/** OS Open Zoomstack's building outlines at street scale: free on the OS OpenData plan. */
export const OS_BUILDINGS_LAYER = 'Zoomstack_LocalBuildings';
/** Half the side of the square asked for, in metres: a 160 m square, enough to show the street round the building. */
export const PLAN_HALF_M = 80;
/** The most outlines one answer may hold (the API's own most is 100). */
export const PLAN_MAX_BUILDINGS = 100;
export const OS_ATTRIBUTION = 'Contains OS data © Crown copyright and database right 2026';

/** Who asks, and the gates as the caller found them: written into each call's audit row. */
export type Asker = { readonly id: string; readonly role: string; readonly gate: GateSnapshot };

export type GridPoint = { readonly easting: number; readonly northing: number };
/** One building's outline: rings of [easting, northing] in metres, the first the outside, any others holes. */
export type Outline = readonly (readonly (readonly [number, number])[])[];

export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly why: string };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The postcode's point on the British National Grid, from postcodes.io. */
export async function pointOfPostcode(deps: CallDeps, postcode: string, who: Asker): Promise<Answer<GridPoint>> {
  const pc = normalisePostcode(postcode);
  if (pc === null) return { ok: false, why: 'The property’s postcode does not look like a UK postcode.' };
  if (pc.startsWith('BT')) return { ok: false, why: 'We cannot place Northern Ireland postcodes on the map.' };
  const r = await callOutside(deps, {
    service_id: POSTCODE_CHECK_SERVICE_ID, endpoint: POSTCODE_CHECK_ENDPOINT, params: { postcode: pc.replace(' ', '') },
    actor_id: who.id, actor_role: who.role, claim_id: null,
    gate: who.gate,
  });
  if (r.status === 404) return { ok: false, why: `Postcodes.io does not know the postcode ${pc}.` };
  if (r.outcome !== 'OK' || r.body === null) return { ok: false, why: `We could not find where ${pc} is just now (${r.why}). Try again later.` };
  let body: unknown;
  try { body = JSON.parse(r.body); } catch { return { ok: false, why: 'Postcodes.io sent an answer we could not read.' }; }
  const res = (body as { result?: { eastings?: unknown; northings?: unknown } }).result;
  const e = num(res?.eastings);
  const n = num(res?.northings);
  if (e === null || n === null) return { ok: false, why: `Postcodes.io has no map point for ${pc}.` };
  return { ok: true, value: { easting: e, northing: n } };
}

/** The outlines of the buildings in a square round a point, from Ordnance Survey. */
export async function buildingsAround(deps: CallDeps, key: string, at: GridPoint, who: Asker): Promise<Answer<readonly Outline[]>> {
  const box = [at.easting - PLAN_HALF_M, at.northing - PLAN_HALF_M, at.easting + PLAN_HALF_M, at.northing + PLAN_HALF_M].map((v) => String(Math.round(v)));
  const r = await callOutside(deps, {
    service_id: OS_SERVICE_ID, endpoint: OS_ENDPOINT,
    query: {
      service: 'wfs', version: '2.0.0', request: 'GetFeature', typeNames: OS_BUILDINGS_LAYER,
      outputFormat: 'GEOJSON', srsName: 'EPSG:27700', bbox: `${box.join(',')},EPSG:27700`, count: String(PLAN_MAX_BUILDINGS),
    },
    // The key goes in a header, so it is never part of an address that could be logged.
    headers: { key },
    actor_id: who.id, actor_role: who.role, claim_id: null,
    gate: who.gate,
  });
  if (r.status === 401 || r.status === 403) return { ok: false, why: 'Ordnance Survey did not accept our key. Check OS_DATA_HUB_API_KEY, and that the OS Features API is added to its project.' };
  if (r.outcome !== 'OK' || r.body === null) return { ok: false, why: `Ordnance Survey did not answer just now (${r.why}). Try again later.` };
  let body: unknown;
  try { body = JSON.parse(r.body); } catch { return { ok: false, why: 'Ordnance Survey sent an answer we could not read.' }; }
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return { ok: false, why: 'Ordnance Survey sent an answer with no buildings list in it.' };
  const out: Outline[] = [];
  for (const f of features) {
    const g = (f as { geometry?: { type?: unknown; coordinates?: unknown } } | null)?.geometry;
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' && Array.isArray(g.coordinates) ? g.coordinates as unknown[] : [];
    for (const p of polys) {
      const rings = ringsOf(p);
      if (rings !== null) out.push(rings);
    }
  }
  return { ok: true, value: out };
}

/** A polygon's rings, each at least a triangle of finite numbers; null when it is not one. */
function ringsOf(p: unknown): Outline | null {
  if (!Array.isArray(p) || p.length === 0) return null;
  const rings: (readonly [number, number])[][] = [];
  for (const ring of p) {
    if (!Array.isArray(ring)) return null;
    const pts: (readonly [number, number])[] = [];
    for (const c of ring) {
      if (!Array.isArray(c)) return null;
      const x = num(c[0]);
      const y = num(c[1]);
      if (x === null || y === null) return null;
      pts.push([x, y]);
    }
    if (pts.length < 3) return null;
    rings.push(pts);
  }
  return rings;
}

/** True when the point is inside the outline's outside ring and in none of its holes. */
export function contains(o: Outline, p: GridPoint): boolean {
  const inRing = (ring: readonly (readonly [number, number])[]): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]!;
      const [xj, yj] = ring[j]!;
      if ((yi > p.northing) !== (yj > p.northing) && p.easting < ((xj - xi) * (p.northing - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return o.length > 0 && inRing(o[0]!) && !o.slice(1).some(inRing);
}

/** How far the point is from the building's nearest wall (outside, or a courtyard's), in metres; 0 inside it. */
export function distanceTo(o: Outline, p: GridPoint): number {
  if (contains(o, p)) return 0;
  let best = Infinity;
  for (const ring of o) for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.easting - ax) * dx + (p.northing - ay) * dy) / len));
    best = Math.min(best, Math.hypot(p.easting - (ax + t * dx), p.northing - (ay + t * dy)));
  }
  return best;
}

/** The client's building: the one the point falls in, else the nearest. Null when there is no building at all. */
export function pickBuilding(outlines: readonly Outline[], p: GridPoint): { readonly index: number; readonly how: 'INSIDE' | 'NEAREST'; readonly metres: number } | null {
  let best: { index: number; metres: number } | null = null;
  outlines.forEach((o, index) => {
    const metres = distanceTo(o, p);
    if (best === null || metres < best.metres) best = { index, metres };
  });
  if (best === null) return null;
  const b: { index: number; metres: number } = best;
  return { index: b.index, how: b.metres === 0 ? 'INSIDE' : 'NEAREST', metres: Math.round(b.metres) };
}
