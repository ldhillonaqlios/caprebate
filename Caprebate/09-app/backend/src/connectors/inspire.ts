/**
 * THE LAND BOUNDARY FETCHER — HM LAND REGISTRY'S INSPIRE INDEX POLYGONS. Phase 150, 24 September 2026.
 * BUILT FOR REAL AND SWITCHED OFF.
 *
 * WHAT IT IS. The real `BoundaryFetcher` that 04-phase-work/phase9/caprebate-boundary-import.ts has waited for since
 * Phase 78. That module's DEFAULT_FETCHER always throws, and it still does: this fetcher is used only when a caller
 * injects it into `fetchAndImportBoundary`, and nothing under src/ does yet. Given a council's file and a British
 * National Grid point for the property, it:
 *
 *   1. refuses at once while BOUNDARY_FETCHING_SWITCHED_ON is false — before any call, any audit row, anything;
 *   2. refuses a building footprint (that is Ordnance Survey's, not HM Land Registry's), a council that is not in the
 *      published list (src/connectors/inspire-authorities.ts), and a point with no usable easting and northing;
 *   3. downloads that ONE council's .zip through src/connectors/http.ts, the only way out — so the rate limit, the
 *      size cap, the time limit and the audit row are the same as every other connector's;
 *   4. opens the zip on this server (one .gml inside, checked against its own CRC), reads each polygon, keeps only
 *      those whose box could hold the point, and hands them to the module's own spatial join,
 *      `findInspirePolygonForPoint`, which refuses rather than guesses;
 *   5. returns the one polygon that contains the point, as the module's `RawBoundaryPayload`, graded no better than B.
 *
 * WHY A WHOLE FILE. HM Land Registry publishes INSPIRE as one file per local authority and offers no lookup by point
 * or by title (its dataset and download pages, read 24 September 2026; SUPPLIER_DOCS in the source register). So the
 * only thing that leaves this server is the council's NAME. No address, no postcode, no client and no point is ever
 * sent. The polygons carry no title number and no name.
 *
 * WHAT IS NOT PUBLISHED, AND SO IS READ TOLERANTLY. HM Land Registry does not publish the element names inside its
 * GML. The reader therefore accepts a feature wrapped in <…:featureMember> or <…:member>, an identifier in any
 * element whose name is INSPIREID, and one gml:Polygon with posList rings. It is STRICT about everything else: a
 * feature it cannot read makes the whole file unreadable, because a polygon we skipped could be the one that holds
 * the point, and "exactly one polygon contains it" would then be a guess. THE FIRST ALLOWED DOWNLOAD MUST CONFIRM
 * THE SHAPE. Until the data protection officer answers "Can we make a few small, logged test lookups to check a data connector works?",
 * no file has been downloaded, and every test here runs on an invented fixture with no network.
 *
 * NOTHING HERE DECIDES WHAT THE AREA MAY BE USED FOR. The module's CURRENT_LICENCE_PERMISSION does: our own checks
 * only, and no boundary, map or coordinate in a client report (Lakhbir, 15 September 2026).
 */

import { crc32, inflateRawSync } from 'node:zlib';
import {
  BOUNDARY_FETCHING_SWITCHED_ON,
  BoundaryImportError,
  findInspirePolygonForPoint,
  inspirePolygonsToRawBoundaryGeometry,
  type BoundaryFetcher,
  type BoundaryFetchPlanItem,
  type InspireIndexPolygonRecord,
  type RawBoundaryPayload,
} from '../../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import { callOutside, type CallDeps, type GateSnapshot } from './http.ts';
import { INSPIRE_AUTHORITY_FILES } from './inspire-authorities.ts';

export const INSPIRE_SERVICE_ID = 'HMLR_INSPIRE';
/** The published link, as a template. The audit row records this, never the council's name. */
export const INSPIRE_ENDPOINT = '/datasets/inspire/download/{file}.zip';

/** The largest .gml we will unpack. A city council's is large; the zip's own figure is checked against it first. */
const MAX_GML_BYTES = 1_500 * 1024 * 1024;
/** How much of the file is decoded at once. A single polygon larger than this is refused, not read in part. */
const WINDOW_BYTES = 8 * 1024 * 1024;

export type InspireFetchInput = {
  /** The council's file name, exactly as HM Land Registry publishes it, without ".zip" ("Adur_District_Council"). */
  readonly local_authority_file: string;
  /** The property's point in British National Grid (EPSG:27700), metres: { easting, northing }. */
  readonly point: unknown;
  readonly deps: CallDeps;
  readonly actor_id: string | null;
  readonly actor_role?: string | null;
  readonly claim_id: string | null;
  /** The gates as they stood, for the audit row. `switched_on` is filled in here, from the switch. */
  readonly gate: Omit<GateSnapshot, 'switched_on'>;
  /**
   * TESTS ONLY. Absent, the fetcher reads BOUNDARY_FETCHING_SWITCHED_ON, which is false. A test in
   * test/phase150.test.ts fails if any file under src/ other than this one names the fetcher, so no caller can pass it.
   */
  readonly switched_on?: boolean;
};

const refuse = (code: 'E_FETCHING_SWITCHED_OFF' | 'E_FETCH_REFUSED' | 'E_FETCH_FAILED' | 'E_FILE_UNREADABLE' | 'E_INVALID_POINT', why: string, detail: Record<string, unknown> = {}): never => {
  throw new BoundaryImportError(code, why, detail);
};

function usablePoint(p: unknown): { easting: number; northing: number } | null {
  const o = p as { easting?: unknown; northing?: unknown } | null | undefined;
  if (o === null || typeof o !== 'object') return null;
  const { easting, northing } = o;
  if (typeof easting !== 'number' || typeof northing !== 'number' || !Number.isFinite(easting) || !Number.isFinite(northing)) return null;
  return { easting, northing };
}

/**
 * THE FETCHER. Returns a function of the module's own `BoundaryFetcher` shape, for `fetchAndImportBoundary`'s
 * `fetcher` option. It throws `BoundaryImportError` on every failure, as the module's contract asks, so a failed
 * fetch leaves the site area asked (N4) — never a 0 and never a guess.
 */
export function inspireBoundaryFetcher(input: InspireFetchInput): BoundaryFetcher {
  return async (item: BoundaryFetchPlanItem): Promise<RawBoundaryPayload> => {
    const on = input.switched_on ?? BOUNDARY_FETCHING_SWITCHED_ON;
    if (on !== true) {
      refuse('E_FETCHING_SWITCHED_OFF',
        'Fetching land boundaries is switched off. It waits on one answer from the data protection officer, about ' +
        'small test lookups. Nothing was sent.');
    }
    if (item.kind !== 'PARCEL_BOUNDARY' || item.dataset !== 'HMLR_INSPIRE_INDEX_POLYGON') {
      refuse('E_FETCH_REFUSED', `This fetcher reads HM Land Registry's land boundaries only, not ${item.dataset}. Nothing was sent.`, { item });
    }
    const file = input.local_authority_file;
    if (typeof file !== 'string' || !INSPIRE_AUTHORITY_FILES.includes(file)) {
      refuse('E_FETCH_REFUSED', 'That council is not in HM Land Registry\'s published list of files. Nothing was sent.');
    }
    const point = usablePoint(input.point);
    if (point === null) {
      refuse('E_INVALID_POINT', 'The property has no usable easting and northing, so there is nothing to look for. Nothing was sent.');
    }

    const result = await callOutside(input.deps, {
      service_id: INSPIRE_SERVICE_ID, endpoint: INSPIRE_ENDPOINT, params: { file },
      headers: { accept: 'application/zip, application/octet-stream' }, as_bytes: true,
      actor_id: input.actor_id, actor_role: input.actor_role ?? null, claim_id: input.claim_id,
      gate: { ...input.gate, switched_on: true },
    });
    if (result.outcome !== 'OK' || result.bytes === undefined) {
      refuse('E_FETCH_FAILED', `The land boundary file was not downloaded: ${result.why}.`, { outcome: result.outcome, status: result.status });
    }

    const gml = unzipOneGml(result.bytes as Buffer);
    const read = readInspireGml(gml, point as { easting: number; northing: number });
    if (read.features === 0) refuse('E_FILE_UNREADABLE', 'The land boundary file holds no polygon we could find.');
    if (read.unreadable > 0) {
      refuse('E_FILE_UNREADABLE',
        `${read.unreadable} of ${read.features} polygons in the file could not be read, so we cannot be sure which one ` +
        'holds the property. None is picked.', { first_reason: read.first_reason });
    }
    if (read.candidates.length === 0) {
      throw new BoundaryImportError('E_NO_FREEHOLD_POLYGON',
        'No freehold polygon in this council\'s file holds the point. The site may be leasehold only, unregistered, ' +
        'in the neighbouring council, or the point may be wrong.');
    }
    const near = inspirePolygonsToRawBoundaryGeometry(read.candidates);
    const match = findInspirePolygonForPoint(point, near);
    if (!match.matched) throw new BoundaryImportError(match.code, match.reason, { candidates: match.candidates });
    const one = inspirePolygonsToRawBoundaryGeometry(read.candidates.filter((r) => r.inspire_id.trim() === match.inspire_id));
    return {
      geometry: one.geometry,
      meta: {
        artefact_id: `inspire:${match.inspire_id}`,
        source_kind: 'HMLR_INSPIRE_INDEX_POLYGON',
        retrieved_at: input.deps.now(),
        locator: `https://use-land-property-data.service.gov.uk/datasets/inspire/download/${file}.zip#inspire-id=${match.inspire_id}`,
      },
    };
  };
}

/* ------------------------------------------------------------------ the zip */

/**
 * The one .gml inside HM Land Registry's .zip. A small reader of the zip format's central directory, written here
 * because the back end has no zip library and this is the only zip it opens. Stored and deflated entries only; an
 * encrypted entry, a zip64 archive, a second .gml, a size over the cap, or a CRC that does not match is refused.
 */
export function unzipOneGml(zip: Buffer): Buffer {
  const bad = (why: string): never => refuse('E_FILE_UNREADABLE', `The land boundary file could not be opened: ${why}.`);
  if (zip.length < 22) bad('it is too short to be a zip');
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) bad('it is not a zip');
  const count = zip.readUInt16LE(eocd + 10);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) bad('it is a zip64 archive, which this reader does not open');
  const gmls: { name: string; method: number; crc: number; csize: number; usize: number; local: number; flags: number }[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) bad('its directory is damaged');
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const csize = zip.readUInt32LE(p + 20);
    const usize = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (name.toLowerCase().endsWith('.gml')) gmls.push({ name, method, crc, csize, usize, local, flags });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (gmls.length !== 1) bad(gmls.length === 0 ? 'there is no .gml inside it' : `there are ${gmls.length} .gml files inside it, not one`);
  const e = gmls[0] as (typeof gmls)[number];
  if ((e.flags & 1) === 1) bad('it is encrypted');
  if (e.csize === 0xffffffff || e.usize === 0xffffffff) bad('it is a zip64 archive, which this reader does not open');
  if (e.usize > MAX_GML_BYTES) bad(`the file inside is ${e.usize} bytes, more than the ${MAX_GML_BYTES} we unpack`);
  if (e.local + 30 > zip.length || zip.readUInt32LE(e.local) !== 0x04034b50) bad('its entry is damaged');
  const start = e.local + 30 + zip.readUInt16LE(e.local + 26) + zip.readUInt16LE(e.local + 28);
  if (start + e.csize > zip.length) bad('it is cut short');
  const data = zip.subarray(start, start + e.csize);
  let out: Buffer = Buffer.alloc(0);
  if (e.method === 0) out = Buffer.from(data);
  else if (e.method === 8) {
    try { out = inflateRawSync(data, { maxOutputLength: MAX_GML_BYTES }); } catch { bad('its contents would not unpack'); }
  } else bad(`it uses a packing method (${e.method}) this reader does not open`);
  if (out.length !== e.usize) bad('the unpacked size does not match the zip\'s own figure');
  if ((crc32(out) >>> 0) !== (e.crc >>> 0)) bad('its contents do not match their own check value');
  return out;
}

/* ------------------------------------------------------------------ the GML */

export type InspireRead = {
  /** Polygons found in the file. */
  readonly features: number;
  /** Polygons that could not be read. Any at all makes the file unreadable to the fetcher. */
  readonly unreadable: number;
  readonly first_reason: string | null;
  /** Readable polygons whose outer ring's box holds the point, edges included. */
  readonly candidates: readonly InspireIndexPolygonRecord[];
};

const MEMBER_RE = /<([\w.-]+:)?(featureMember|member)\b[^>]*>([\s\S]*?)<\/\1?\2\s*>/g;
const ID_RE = /<(?:[\w.-]+:)?INSPIREID\b[^>]*>\s*([^<\s]+)\s*<\//gi;
const POLYGON_RE = /<(?:[\w.-]+:)?Polygon\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?Polygon\s*>/g;
const MULTI_RE = /<(?:[\w.-]+:)?(MultiSurface|MultiPolygon|Surface)\b/;
const EXTERIOR_RE = /<(?:[\w.-]+:)?exterior\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?exterior\s*>/g;
const INTERIOR_RE = /<(?:[\w.-]+:)?interior\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?interior\s*>/g;
const POSLIST_RE = /^\s*<(?:[\w.-]+:)?LinearRing\b[^>]*>\s*<(?:[\w.-]+:)?posList\b([^>]*)>([^<]*)<\/(?:[\w.-]+:)?posList\s*>\s*<\/(?:[\w.-]+:)?LinearRing\s*>\s*$/;
const SRS_RE = /\bsrsName\s*=\s*"([^"]+)"/;
const DIM_RE = /\bsrsDimension\s*=\s*"(\d+)"/;

/** Where the last complete </…featureMember> or </…member> ends at or before `to`, or -1. */
function lastMemberEnd(buf: Buffer, from: number, to: number): number {
  const needle = Buffer.from('ember');
  let i = to;
  while (i > from) {
    const at = buf.lastIndexOf(needle, i - 1);
    if (at < from) return -1;
    let q = at + needle.length;
    while (q < to && (buf[q] === 0x20 || buf[q] === 0x09 || buf[q] === 0x0a || buf[q] === 0x0d)) q++;
    const lt = buf.lastIndexOf(0x3c, at);
    // Only a real closing tag of a feature wrapper counts ("</gml:featureMember>", "</wfs:member>"): a cut anywhere
    // else could split a feature between two windows, and a split feature would be lost without being counted.
    if (q < to && buf[q] === 0x3e && lt >= from && buf[lt + 1] === 0x2f
      && /^([\w.-]+:)?(featureMember|member)$/.test(buf.toString('latin1', lt + 2, at + needle.length))) return q + 1;
    i = at;
  }
  return -1;
}

function ringBox(posList: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const v = posList.trim().split(/\s+/).map(Number);
  if (v.length < 8 || v.length % 2 !== 0 || v.some((n) => !Number.isFinite(n))) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (let k = 0; k < v.length; k += 2) {
    const x = v[k] as number; const y = v[k + 1] as number;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** One feature's text, as a record, or the reason it cannot be read. */
function readFeature(text: string, fileSrs: string | null): InspireIndexPolygonRecord | string {
  const ids = [...text.matchAll(ID_RE)].map((m) => m[1] as string);
  if (ids.length !== 1) return ids.length === 0 ? 'a polygon has no INSPIRE ID' : 'a polygon has more than one INSPIRE ID';
  if (MULTI_RE.test(text)) return 'a polygon is written as a multi-part surface';
  const polys = [...text.matchAll(POLYGON_RE)];
  if (polys.length !== 1) return polys.length === 0 ? 'a feature has no polygon' : 'a feature has more than one polygon';
  const [, attrs, body] = polys[0] as RegExpMatchArray;
  const srs = SRS_RE.exec(attrs as string)?.[1] ?? SRS_RE.exec(text)?.[1] ?? fileSrs;
  const ring = (m: string): { pos: string } | string => {
    const r = POSLIST_RE.exec(m);
    if (r === null) return 'a ring is not written as a single posList';
    const dim = DIM_RE.exec(r[1] as string)?.[1];
    if (dim !== undefined && dim !== '2') return `a ring has ${dim} numbers to a point, not 2`;
    return { pos: r[2] as string };
  };
  const ext = [...(body as string).matchAll(EXTERIOR_RE)];
  if (ext.length !== 1) return 'a polygon does not have exactly one outer ring';
  const outer = ring((ext[0] as RegExpMatchArray)[1] as string);
  if (typeof outer === 'string') return outer;
  const holes: string[] = [];
  for (const m of (body as string).matchAll(INTERIOR_RE)) {
    const h = ring(m[1] as string);
    if (typeof h === 'string') return h;
    holes.push(h.pos);
  }
  return {
    inspire_id: ids[0] as string,
    srs_name: srs ?? '',
    exterior_pos_list: outer.pos,
    ...(holes.length > 0 ? { interior_pos_lists: holes } : {}),
  };
}

/**
 * Reads the polygons of one council's GML and keeps those that could hold the point. Works through the file a window
 * at a time, cut only at the end of a feature, so a large council's file is never held as one string.
 */
export function readInspireGml(gml: Buffer, point: { easting: number; northing: number }): InspireRead {
  const head = gml.toString('utf8', 0, Math.min(gml.length, 65_536));
  const fileSrs = SRS_RE.exec(head)?.[1] ?? null;
  let features = 0; let unreadable = 0; let first: string | null = null;
  const candidates: InspireIndexPolygonRecord[] = [];
  let pos = 0;
  let window = WINDOW_BYTES;
  while (pos < gml.length) {
    const to = Math.min(gml.length, pos + window);
    const cut = to === gml.length ? to : lastMemberEnd(gml, pos, to);
    if (cut < 0) {
      if (window >= 8 * WINDOW_BYTES) refuse('E_FILE_UNREADABLE', 'A single polygon in the file is larger than we read at once.');
      window *= 2;
      continue;
    }
    const text = gml.toString('utf8', pos, cut);
    for (const m of text.matchAll(MEMBER_RE)) {
      features++;
      const rec = readFeature(m[3] as string, fileSrs);
      if (typeof rec === 'string') { unreadable++; first ??= rec; continue; }
      const box = ringBox(rec.exterior_pos_list);
      if (box === null) { unreadable++; first ??= 'a ring\'s numbers could not be read'; continue; }
      if (point.easting >= box.minX && point.easting <= box.maxX && point.northing >= box.minY && point.northing <= box.maxY) {
        candidates.push(rec);
      }
    }
    pos = cut;
    window = WINDOW_BYTES;
  }
  return { features, unreadable, first_reason: first, candidates };
}
