/**
 * Caprebate — Land Boundary Import Connector, Phase 133 (17 September 2026).
 * Tests for the translation from HM Land Registry's PUBLISHED INSPIRE Index
 * Polygon shape into RawBoundaryGeometry (module §13). Findings behind it:
 * 04-phase-work/phase133/inspire-format-findings.md.
 * Run:  node --test caprebate-boundary-import-inspire.test.ts
 *
 * EVERY fixture here is invented: made-up coordinates (small squares near the
 * grid origin) and made-up INSPIRE IDs (99000001...). Nothing is copied from a
 * real dataset. No network, no file read, no fetch.
 *
 * The module is imported as a namespace (not named imports) so that, run
 * against the pre-change copy, each test fails on its own rather than the
 * whole file failing to link.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as mod from './caprebate-boundary-import.ts';

const I = mod as unknown as Record<string, any>;
const throwsCode = (code: string) => (e: unknown) => e instanceof mod.BoundaryImportError && e.code === code;

// HM Land Registry's published metadata spells the CRS this way.
const BNG_URI = 'http://www.opengis.net/def/crs/EPSG/0/27700';

// Invented 100 x 100 square, as GML posList text (closed ring). 10,000 m2.
const SQ100 = '0 0 100 0 100 100 0 100 0 0';
// Invented 50 x 50 square away from it. 2,500 m2.
const SQ50_FAR = '300 300 350 300 350 350 300 350 300 300';
// Invented 20 x 20 hole inside SQ100. 400 m2.
const HOLE20 = '40 40 60 40 60 60 40 60 40 40';

const meta = {
  artefact_id: 'P133:PARCEL_BOUNDARY',
  kind: 'PARCEL_BOUNDARY' as const,
  source_kind: 'HMLR_INSPIRE_INDEX_POLYGON' as const,
  retrieved_at: '2026-09-17T00:00:00Z',
  locator: 'invented',
};

test('I1 CRS spelled as published (OGC URI for EPSG 27700) is normalised to EPSG:27700 and area computes', () => {
  assert.equal(I.normaliseEpsgCrs(BNG_URI), 'EPSG:27700');
  assert.equal(I.normaliseEpsgCrs('urn:ogc:def:crs:EPSG::27700'), 'EPSG:27700');
  assert.equal(I.normaliseEpsgCrs('EPSG:27700'), 'EPSG:27700');
  const t = I.inspirePolygonsToRawBoundaryGeometry([{ inspire_id: '99000001', srs_name: BNG_URI, exterior_pos_list: SQ100 }]);
  assert.equal(t.geometry.type, 'Polygon');
  assert.equal(t.geometry.crs, 'EPSG:27700');
  assert.equal(mod.computeSiteArea(mod.parseBoundaryGeometry(t.geometry, meta)).value, 10000);
});

test('I2 normalising never makes a degree CRS computable, and an unrecognised spelling is refused', () => {
  const t = I.inspirePolygonsToRawBoundaryGeometry([
    { inspire_id: '99000002', srs_name: 'http://www.opengis.net/def/crs/EPSG/0/4326', exterior_pos_list: SQ100 },
  ]);
  assert.equal(t.geometry.crs, 'EPSG:4326');
  assert.throws(() => mod.computeSiteArea(mod.parseBoundaryGeometry(t.geometry, meta)), throwsCode('E_CRS_NOT_PROJECTED'));
  assert.throws(() => I.normaliseEpsgCrs('British National Grid'), throwsCode('E_UNKNOWN_CRS'));
  assert.throws(() => I.normaliseEpsgCrs(''), throwsCode('E_UNKNOWN_CRS'));
});

test('I3 posList text becomes x,y pairs; interior rings become holes', () => {
  const t = I.inspirePolygonsToRawBoundaryGeometry([
    { inspire_id: '99000003', srs_name: BNG_URI, exterior_pos_list: SQ100, interior_pos_lists: [HOLE20] },
  ]);
  assert.deepEqual(t.geometry.exterior[1], [100, 0]);
  assert.equal(t.geometry.holes.length, 1);
  assert.equal(mod.computeSiteArea(mod.parseBoundaryGeometry(t.geometry, meta)).value, 9600);
});

test('I4 several polygons (each its own INSPIRE ID) become one MultiPolygon, summed; IDs kept, sorted', () => {
  const t = I.inspirePolygonsToRawBoundaryGeometry([
    { inspire_id: '99000005', srs_name: BNG_URI, exterior_pos_list: SQ50_FAR },
    { inspire_id: '99000004', srs_name: BNG_URI, exterior_pos_list: SQ100 },
  ]);
  assert.equal(t.geometry.type, 'MultiPolygon');
  assert.deepEqual(t.inspire_ids, ['99000004', '99000005']);
  assert.equal(t.locator, 'hmlr-inspire-index-polygon://inspire-id/99000004,99000005');
  assert.equal(mod.computeSiteArea(mod.parseBoundaryGeometry(t.geometry, meta)).value, 12500);
});

test('I5 the same polygon from two councils\' files is counted once; same ID with different rings is refused', () => {
  const rec = { inspire_id: '99000006', srs_name: BNG_URI, exterior_pos_list: SQ100 };
  const t = I.inspirePolygonsToRawBoundaryGeometry([rec, { ...rec }]);
  assert.equal(t.duplicates_dropped, 1);
  assert.equal(t.geometry.type, 'Polygon');
  assert.equal(mod.computeSiteArea(mod.parseBoundaryGeometry(t.geometry, meta)).value, 10000);
  assert.throws(
    () => I.inspirePolygonsToRawBoundaryGeometry([rec, { ...rec, exterior_pos_list: SQ50_FAR }]),
    throwsCode('E_CONFLICTING_DUPLICATE_POLYGON'),
  );
});

test('I6 a record with no INSPIRE ID is refused, even if it carries a title number', () => {
  const noId = { title_number: 'ZZ000001', srs_name: BNG_URI, exterior_pos_list: SQ100 };
  assert.throws(() => I.inspirePolygonsToRawBoundaryGeometry([noId]), throwsCode('E_MISSING_INSPIRE_ID'));
  assert.throws(() => I.inspirePolygonsToRawBoundaryGeometry([{ ...noId, inspire_id: '  ' }]), throwsCode('E_MISSING_INSPIRE_ID'));
});

test('I7 malformed input is refused: empty list, mixed CRS, odd posList, non-number, too few points', () => {
  assert.throws(() => I.inspirePolygonsToRawBoundaryGeometry([]), throwsCode('E_EMPTY_GEOMETRY'));
  assert.throws(
    () =>
      I.inspirePolygonsToRawBoundaryGeometry([
        { inspire_id: '99000007', srs_name: BNG_URI, exterior_pos_list: SQ100 },
        { inspire_id: '99000008', srs_name: 'EPSG:4326', exterior_pos_list: SQ50_FAR },
      ]),
    throwsCode('E_MIXED_CRS'),
  );
  const one = (pl: string) => () => I.inspirePolygonsToRawBoundaryGeometry([{ inspire_id: '99000009', srs_name: BNG_URI, exterior_pos_list: pl }]);
  assert.throws(one('0 0 100 0 100'), throwsCode('E_INVALID_COORDINATE'));
  assert.throws(one('0 0 100 0 100 x 0 100'), throwsCode('E_INVALID_COORDINATE'));
  assert.throws(one('0 0 100 0'), throwsCode('E_DEGENERATE_RING'));
});

test('I8 guard kept: fetching is still off — DEFAULT_FETCHER throws and BOUNDARY_FETCHING_SWITCHED_ON is false', async () => {
  assert.equal(mod.BOUNDARY_FETCHING_SWITCHED_ON, false);
  await assert.rejects(
    () => mod.DEFAULT_FETCHER({ kind: 'PARCEL_BOUNDARY', dataset: 'HMLR_INSPIRE_INDEX_POLYGON', locator: 'x://y' }),
    throwsCode('E_LICENCE_NOT_CLEARED'),
  );
});

/* ------------------------------------------------------------------ *
 * I9 onward — spatial join, point -> INSPIRE polygon (module §14).
 * Phase 133, 17 September 2026. Invented polygons and points only.
 * ------------------------------------------------------------------ */

// Invented: two 100 x 100 squares sharing the edge x = 100.
const WEST = { inspire_id: '99100001', srs_name: BNG_URI, exterior_pos_list: '0 0 100 0 100 100 0 100 0 0' };
const EAST = { inspire_id: '99100002', srs_name: BNG_URI, exterior_pos_list: '100 0 200 0 200 100 100 100 100 0' };
// Invented: a square overlapping WEST (50..150 x 50..150).
const OVERLAP = { inspire_id: '99100003', srs_name: BNG_URI, exterior_pos_list: '50 50 150 50 150 150 50 150 50 50' };
// Invented: WEST with a 20 x 20 hole at 40..60.
const WEST_HOLED = { ...WEST, inspire_id: '99100004', interior_pos_lists: ['40 40 60 40 60 60 40 60 40 40'] };

const tr = (...recs: any[]) => I.inspirePolygonsToRawBoundaryGeometry(recs);
const find = (pt: unknown, polys: any) => I.findInspirePolygonForPoint(pt, polys);

test('I9 a point inside exactly one polygon returns that INSPIRE ID', () => {
  const polys = tr(WEST, EAST);
  assert.deepEqual(find({ easting: 25, northing: 75 }, polys), { matched: true, inspire_id: '99100001' });
  assert.deepEqual(find({ easting: 150.5, northing: 10 }, polys), { matched: true, inspire_id: '99100002' });
});

test('I10 a point inside no polygon is refused as E_NO_FREEHOLD_POLYGON (leasehold-only, unregistered or wrong point)', () => {
  const r = find({ easting: 500, northing: 500 }, tr(WEST, EAST));
  assert.equal(r.matched, false);
  assert.equal(r.code, 'E_NO_FREEHOLD_POLYGON');
  assert.deepEqual(r.candidates, []);
  assert.match(r.reason, /leasehold/);
});

test('I11 a point inside two overlapping polygons is refused as ambiguous; neither is picked', () => {
  const r = find({ easting: 75, northing: 75 }, tr(WEST, OVERLAP));
  assert.equal(r.matched, false);
  assert.equal(r.code, 'E_AMBIGUOUS_POLYGON');
  assert.deepEqual(r.candidates, ['99100001', '99100003']);
  assert.equal('inspire_id' in r, false);
});

test('I12 a point exactly on an edge never silently chooses: shared edge, shared vertex and outer edge are all ambiguous', () => {
  const polys = tr(WEST, EAST);
  const shared = find({ easting: 100, northing: 50 }, polys);
  assert.equal(shared.code, 'E_AMBIGUOUS_POLYGON');
  assert.deepEqual(shared.candidates, ['99100001', '99100002']);
  const vertex = find({ easting: 100, northing: 0 }, polys);
  assert.equal(vertex.code, 'E_AMBIGUOUS_POLYGON');
  assert.deepEqual(vertex.candidates, ['99100001', '99100002']);
  const outer = find({ easting: 0, northing: 50 }, polys);
  assert.equal(outer.matched, false);
  assert.equal(outer.code, 'E_AMBIGUOUS_POLYGON');
});

test('I13 a hole excludes the point; a point on the hole edge is ambiguous; outside the hole still matches', () => {
  const polys = tr(WEST_HOLED);
  assert.equal(find({ easting: 50, northing: 50 }, polys).code, 'E_NO_FREEHOLD_POLYGON');
  assert.equal(find({ easting: 40, northing: 50 }, polys).code, 'E_AMBIGUOUS_POLYGON');
  assert.deepEqual(find({ easting: 10, northing: 10 }, polys), { matched: true, inspire_id: '99100004' });
});

test('I14 N4: absent or not-a-number coordinates are refused identically and never read as 0', () => {
  // Invented square around the grid origin, so a coordinate wrongly defaulted to 0 WOULD match.
  const polys = tr({ inspire_id: '99100005', srs_name: BNG_URI, exterior_pos_list: '-10 -10 10 -10 10 10 -10 10 -10 -10' });
  assert.deepEqual(find({ easting: 0, northing: 0 }, polys), { matched: true, inspire_id: '99100005' });
  const undef = find({ easting: undefined, northing: 0 }, polys);
  const nan = find({ easting: 0, northing: NaN }, polys);
  assert.equal(undef.matched, false);
  assert.equal(undef.code, 'E_INVALID_POINT');
  assert.equal(nan.code, 'E_INVALID_POINT');
  assert.deepEqual(undef, nan);
  for (const other of [undefined, null, {}, { easting: '0', northing: '0' }, { easting: 0 }, { easting: Infinity, northing: 0 }]) {
    assert.deepEqual(find(other, polys), undef);
  }
});

test('I15 polygons not in British National Grid are refused, since the point is in EPSG:27700', () => {
  const degrees = tr({ ...WEST, srs_name: 'http://www.opengis.net/def/crs/EPSG/0/4326' });
  assert.throws(() => find({ easting: 25, northing: 75 }, degrees), throwsCode('E_CRS_NOT_PROJECTED'));
});
