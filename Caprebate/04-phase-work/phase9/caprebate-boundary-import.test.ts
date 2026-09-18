/**
 * Caprebate — Land Boundary Import Connector tests. Board item 12830205914.
 * Run:  node --test caprebate-boundary-import.test.ts
 *
 * Every fixture below is a small, hand-written literal polygon with
 * coordinates invented for this test file. NO live data pull of any kind is
 * performed anywhere in this file — there is no WebFetch, no HTTP client, no
 * network call. Where the pipeline needs "fetched" data (the
 * fetchAndImportBoundary tests), the injected fetcher is a plain in-memory
 * async function returning a literal object — never DEFAULT_FETCHER, which
 * is separately proven to always throw.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BoundaryImportError,
  worstGrade,
  parseBoundaryGeometry,
  computeSiteArea,
  computeFootprintAreaM2,
  computeBuildingCoverageRatio,
  releaseGeometryForReport,
  planBoundaryFetch,
  fetchAndImportBoundary,
  DEFAULT_FETCHER,
  CURRENT_LICENCE_PERMISSION,
  HMLR_INSPIRE_INDEX_POLYGON_TABLE,
  OS_MASTERMAP_BUILDING_FOOTPRINT_TABLE,
  checkBoundaryUse,
  BOUNDARY_FETCHING_SWITCHED_ON,
  INSPIRE_INDEX_POLYGON_SOURCES_NOTE,
  type CartographicArtefact,
  type RawBoundaryGeometry,
  type LicencePermission,
  type BoundarySourceKind,
  type BoundaryFetchPlanItem,
} from './caprebate-boundary-import.ts';

/* ------------------------------------------------------------------ *
 * Fixtures — hand-written literal geometry, invented for this file.
 * ------------------------------------------------------------------ */

/** 100m x 100m square, BNG, CCW winding. Area 10,000 m2. */
const SQUARE_100_CCW: RawBoundaryGeometry = {
  type: 'Polygon',
  crs: 'EPSG:27700',
  exterior: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
};

/** Same square, opposite (CW) winding. Must yield the same area. */
const SQUARE_100_CW: RawBoundaryGeometry = {
  type: 'Polygon',
  crs: 'EPSG:27700',
  exterior: [
    [0, 0],
    [0, 100],
    [100, 100],
    [100, 0],
  ],
};

/** 100x100 square (10,000 m2) with a 20x20 excluded inner courtyard (400 m2). Net 9,600 m2. */
const SQUARE_WITH_COURTYARD: RawBoundaryGeometry = {
  type: 'Polygon',
  crs: 'EPSG:27700',
  exterior: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
  holes: [
    [
      [40, 40],
      [60, 40],
      [60, 60],
      [40, 60],
    ],
  ],
};

/** 40m x 30m building footprint (1,200 m2), sited inside SQUARE_100_*. */
const FOOTPRINT_40X30: RawBoundaryGeometry = {
  type: 'Polygon',
  crs: 'EPSG:27700',
  exterior: [
    [10, 10],
    [50, 10],
    [50, 40],
    [10, 40],
  ],
};

/** Two disjoint 50x50 parcels (2,500 m2 each) making up one site, 5,000 m2 total. */
const TWO_PARCELS_MULTIPOLYGON: RawBoundaryGeometry = {
  type: 'MultiPolygon',
  crs: 'EPSG:27700',
  polygons: [
    { exterior: [[0, 0], [50, 0], [50, 50], [0, 50]] },
    { exterior: [[200, 0], [250, 0], [250, 50], [200, 50]] },
  ],
};

const meta = (over: Partial<{ artefact_id: string; kind: 'PARCEL_BOUNDARY' | 'BUILDING_FOOTPRINT'; source_kind: BoundarySourceKind; grade: any }> = {}) => ({
  artefact_id: 'T1:PARCEL_BOUNDARY',
  kind: 'PARCEL_BOUNDARY' as const,
  source_kind: 'HMLR_INSPIRE_INDEX_POLYGON' as const,
  retrieved_at: '2026-08-27T09:00:00Z',
  locator: 'hmlr-inspire-index-polygon://title/TEST123',
  ...over,
});

const throwsCode = (code: string) => (e: unknown) => e instanceof BoundaryImportError && e.code === code;

/* ------------------------------------------------------------------ *
 * Shoelace area, winding order, holes
 * ------------------------------------------------------------------ */

test('T1 site area of a plain 100x100 square is 10,000 m2', () => {
  const a = parseBoundaryGeometry(SQUARE_100_CCW, meta());
  const site = computeSiteArea(a);
  assert.equal(site.field_id, 'site_area_m2');
  assert.equal(site.value, 10000);
});

test('T2 winding order does not change the computed area', () => {
  const ccw = computeSiteArea(parseBoundaryGeometry(SQUARE_100_CCW, meta({ artefact_id: 'ccw' })));
  const cw = computeSiteArea(parseBoundaryGeometry(SQUARE_100_CW, meta({ artefact_id: 'cw' })));
  assert.equal(ccw.value, cw.value);
  assert.equal(cw.value, 10000);
});

test('T3 a hole (excluded inner courtyard) is subtracted from site area', () => {
  const a = parseBoundaryGeometry(SQUARE_WITH_COURTYARD, meta());
  const site = computeSiteArea(a);
  assert.equal(site.value, 9600); // 10,000 - 400
});

test('T4 a multipolygon site sums its disjoint parcels', () => {
  const a = parseBoundaryGeometry(TWO_PARCELS_MULTIPOLYGON, meta());
  const site = computeSiteArea(a);
  assert.equal(site.value, 5000); // 2,500 + 2,500
});

test('T5 a hole larger than its exterior ring is refused at parse time', () => {
  const badGeom: RawBoundaryGeometry = {
    type: 'Polygon',
    crs: 'EPSG:27700',
    exterior: [[0, 0], [10, 0], [10, 10], [0, 10]], // 100 m2
    holes: [[[-5, -5], [25, -5], [25, 25], [-5, 25]]], // 900 m2 > exterior
  };
  assert.throws(() => parseBoundaryGeometry(badGeom, meta()), throwsCode('E_HOLE_EXCEEDS_EXTERIOR'));
});

test('T6 a ring with fewer than 3 points is refused at parse time', () => {
  const badGeom: RawBoundaryGeometry = { type: 'Polygon', crs: 'EPSG:27700', exterior: [[0, 0], [10, 0]] };
  assert.throws(() => parseBoundaryGeometry(badGeom, meta()), throwsCode('E_DEGENERATE_RING'));
});

test('T7 a non-finite coordinate is refused at parse time', () => {
  const badGeom: RawBoundaryGeometry = {
    type: 'Polygon',
    crs: 'EPSG:27700',
    exterior: [[0, 0], [10, 0], [10, NaN], [0, 10]],
  };
  assert.throws(() => parseBoundaryGeometry(badGeom, meta()), throwsCode('E_INVALID_COORDINATE'));
});

test('T8 an empty multipolygon is refused at parse time', () => {
  const badGeom: RawBoundaryGeometry = { type: 'MultiPolygon', crs: 'EPSG:27700', polygons: [] };
  assert.throws(() => parseBoundaryGeometry(badGeom, meta()), throwsCode('E_EMPTY_GEOMETRY'));
});

/* ------------------------------------------------------------------ *
 * The CRS trap — the thing the task says must not be silently wrong
 * ------------------------------------------------------------------ */

test('T9 a lat/long (degree) CRS is refused when computing area, not silently miscomputed', () => {
  const geomInDegrees: RawBoundaryGeometry = { ...SQUARE_100_CCW, crs: 'EPSG:4326' };
  const a = parseBoundaryGeometry(geomInDegrees, meta()); // parsing itself does not require a computable CRS
  assert.throws(() => computeSiteArea(a), throwsCode('E_CRS_NOT_PROJECTED'));
});

test('T10 an unrecognised CRS code is refused outright, never assumed to be metres', () => {
  const geomUnknownCrs: RawBoundaryGeometry = { ...SQUARE_100_CCW, crs: 'EPSG:3395' };
  const a = parseBoundaryGeometry(geomUnknownCrs, meta());
  assert.throws(() => computeSiteArea(a), throwsCode('E_UNKNOWN_CRS'));
});

test('T11 British National Grid (EPSG:27700) computes cleanly', () => {
  const a = parseBoundaryGeometry(SQUARE_100_CCW, meta());
  assert.doesNotThrow(() => computeSiteArea(a));
});

/* ------------------------------------------------------------------ *
 * Building coverage ratio and its guards
 * ------------------------------------------------------------------ */

test('T12 building coverage ratio = footprint / site, worst-of grade', () => {
  const site = computeSiteArea(parseBoundaryGeometry(SQUARE_100_CCW, meta({ artefact_id: 'site' })));
  const footprint = computeFootprintAreaM2(
    parseBoundaryGeometry(FOOTPRINT_40X30, meta({ artefact_id: 'fp', kind: 'BUILDING_FOOTPRINT', source_kind: 'SURVEYOR_MEASURED' })),
  );
  assert.equal(footprint.value, 1200);
  const bcr = computeBuildingCoverageRatio(site, footprint);
  assert.equal(bcr.field_id, 'building_coverage_ratio');
  assert.equal(bcr.value, 0.12); // 1200 / 10000
  assert.equal(bcr.grade, worstGrade([site.grade, footprint.grade]));
  assert.equal(bcr.grade, 'D'); // SURVEYOR_MEASURED (D) is worse than HMLR_INSPIRE_INDEX_POLYGON (B)
});

test('T13 zero site area is a coded error, never a divide-by-zero or Infinity', () => {
  const collinear: RawBoundaryGeometry = { type: 'Polygon', crs: 'EPSG:27700', exterior: [[0, 0], [1, 0], [2, 0]] };
  const zeroSite = computeSiteArea(parseBoundaryGeometry(collinear, meta({ artefact_id: 'zero' })));
  assert.equal(zeroSite.value, 0);
  const footprint = computeFootprintAreaM2(
    parseBoundaryGeometry(FOOTPRINT_40X30, meta({ artefact_id: 'fp2', kind: 'BUILDING_FOOTPRINT', source_kind: 'SURVEYOR_MEASURED' })),
  );
  assert.throws(() => computeBuildingCoverageRatio(zeroSite, footprint), throwsCode('E_ZERO_SITE_AREA'));
});

test('T14 a footprint larger than the site is a coded error', () => {
  const smallSite = computeSiteArea(
    parseBoundaryGeometry(FOOTPRINT_40X30, meta({ artefact_id: 'smallsite', source_kind: 'HMLR_TITLE_PLAN_DIGITISED' })),
  ); // 1,200 m2 "site"
  const bigFootprint = computeFootprintAreaM2(
    parseBoundaryGeometry(SQUARE_100_CCW, meta({ artefact_id: 'bigfp', kind: 'BUILDING_FOOTPRINT', source_kind: 'SURVEYOR_MEASURED' })),
  ); // 10,000 m2 "footprint"
  assert.throws(() => computeBuildingCoverageRatio(smallSite, bigFootprint), throwsCode('E_FOOTPRINT_EXCEEDS_SITE'));
});

test('T15 passing the wrong scalar into the wrong slot is refused', () => {
  const footprint = computeFootprintAreaM2(
    parseBoundaryGeometry(FOOTPRINT_40X30, meta({ artefact_id: 'fp3', kind: 'BUILDING_FOOTPRINT', source_kind: 'SURVEYOR_MEASURED' })),
  );
  // footprint passed as the *site* argument
  assert.throws(() => computeBuildingCoverageRatio(footprint, footprint), throwsCode('E_WRONG_SCALAR_FIELD'));
});

/* ------------------------------------------------------------------ *
 * Confidence grade — ceiling per source kind, never A for a boundary
 * ------------------------------------------------------------------ */

test('T16 grade defaults to the source kind ceiling when not overridden', () => {
  const a = parseBoundaryGeometry(SQUARE_100_CCW, meta({ source_kind: 'HMLR_INSPIRE_INDEX_POLYGON' }));
  assert.equal(a.grade, 'B');
  assert.equal(a.prov.prov, 'API');
});

test('T17 a grade better than the source kind can produce is refused (never A for a boundary)', () => {
  assert.throws(
    () => parseBoundaryGeometry(SQUARE_100_CCW, meta({ source_kind: 'HMLR_INSPIRE_INDEX_POLYGON', grade: 'A' })),
    throwsCode('E_GRADE_EXCEEDS_SOURCE'),
  );
});

test('T18 a client-supplied sketch is capped at grade C', () => {
  const a = parseBoundaryGeometry(SQUARE_100_CCW, meta({ source_kind: 'CLIENT_SUPPLIED_SKETCH' }));
  assert.equal(a.grade, 'C');
  assert.throws(
    () => parseBoundaryGeometry(SQUARE_100_CCW, meta({ source_kind: 'CLIENT_SUPPLIED_SKETCH', grade: 'B' })),
    throwsCode('E_GRADE_EXCEEDS_SOURCE'),
  );
});

test('T19 an unregistered source kind is refused', () => {
  assert.throws(
    () => parseBoundaryGeometry(SQUARE_100_CCW, meta({ source_kind: 'MADE_UP' as unknown as BoundarySourceKind })),
    throwsCode('E_UNKNOWN_SOURCE_KIND'),
  );
});

test('T20 worstGrade needs at least one input', () => {
  assert.throws(() => worstGrade([]), throwsCode('E_NO_INPUTS'));
  assert.equal(worstGrade(['A', 'D', 'B']), 'D');
});

/* ------------------------------------------------------------------ *
 * Artefact kind and identity enforcement (the structural leak-proofing)
 * ------------------------------------------------------------------ */

test('T21 computing site area on a footprint-kind artefact is refused', () => {
  const fp = parseBoundaryGeometry(FOOTPRINT_40X30, meta({ kind: 'BUILDING_FOOTPRINT', source_kind: 'SURVEYOR_MEASURED' }));
  assert.throws(() => computeSiteArea(fp), throwsCode('E_WRONG_ARTEFACT_KIND'));
});

test('T22 computing footprint area on a parcel-kind artefact is refused', () => {
  const parcel = parseBoundaryGeometry(SQUARE_100_CCW, meta());
  assert.throws(() => computeFootprintAreaM2(parcel), throwsCode('E_WRONG_ARTEFACT_KIND'));
});

test('T23 an object that merely looks like an artefact (never parsed here) cannot yield geometry', () => {
  const fake = {
    artefact_id: 'forged',
    kind: 'PARCEL_BOUNDARY',
    crs: 'EPSG:27700',
    grade: 'A',
    prov: { prov: 'API', source_kind: 'HMLR_INSPIRE_INDEX_POLYGON', grade: 'A', retrieved_at: null, locator: null, derived_from: [] },
  } as unknown as CartographicArtefact;
  assert.throws(() => computeSiteArea(fake), throwsCode('E_NOT_AN_ARTEFACT'));
});

/* ------------------------------------------------------------------ *
 * The internal-use / report-reproduction split — the point of the task
 * ------------------------------------------------------------------ */

test('T24 current default permission is INTERNAL_CALCULATION_ONLY, not FULL_REPRODUCTION', () => {
  assert.equal(CURRENT_LICENCE_PERMISSION.outcome, 'INTERNAL_CALCULATION_ONLY');
  assert.equal(CURRENT_LICENCE_PERMISSION.allow_internal_calculation, true);
  assert.equal(CURRENT_LICENCE_PERMISSION.allow_report_reproduction, false);
});

test('T25 releaseGeometryForReport refuses under the current (default) permission', () => {
  const a = parseBoundaryGeometry(SQUARE_100_CCW, meta());
  assert.throws(() => releaseGeometryForReport(a), throwsCode('E_LICENCE_NOT_CLEARED_FOR_REPRODUCTION'));
});

test('T26 releaseGeometryForReport refuses under an explicit NOT_CLEARED permission too', () => {
  const a = parseBoundaryGeometry(SQUARE_100_CCW, meta());
  const notCleared: LicencePermission = {
    outcome: 'NOT_CLEARED',
    allow_internal_calculation: false,
    allow_report_reproduction: false,
    decided_by: null,
    decided_at: null,
    notes: 'test',
  };
  assert.throws(() => releaseGeometryForReport(a, notCleared), throwsCode('E_LICENCE_NOT_CLEARED_FOR_REPRODUCTION'));
});

test('T27 releaseGeometryForReport succeeds ONLY once permission explicitly says FULL_REPRODUCTION', () => {
  const a = parseBoundaryGeometry(SQUARE_100_CCW, meta());
  const fullyCleared: LicencePermission = {
    outcome: 'FULL_REPRODUCTION',
    allow_internal_calculation: true,
    allow_report_reproduction: true,
    decided_by: 'test-fixture',
    decided_at: '2026-08-27',
    notes: 'test',
  };
  const released = releaseGeometryForReport(a, fullyCleared);
  assert.equal(released.polygons.length, 1);
  assert.deepEqual(released.polygons[0].exterior, SQUARE_100_CCW.type === 'Polygon' ? SQUARE_100_CCW.exterior : []);
  // Deep copy, not a live view onto the internal store.
  const releasedAgain = releaseGeometryForReport(a, fullyCleared);
  assert.notEqual(released.polygons[0].exterior, releasedAgain.polygons[0].exterior);
});

test('T28 parseBoundaryGeometry itself refuses under NOT_CLEARED — geometry may not even be held', () => {
  const notCleared: LicencePermission = {
    outcome: 'NOT_CLEARED',
    allow_internal_calculation: false,
    allow_report_reproduction: false,
    decided_by: null,
    decided_at: null,
    notes: 'test',
  };
  assert.throws(() => parseBoundaryGeometry(SQUARE_100_CCW, meta(), notCleared), throwsCode('E_LICENCE_NOT_CLEARED'));
});

/* ------------------------------------------------------------------ *
 * The fetch surface — pure planning, never-fetching default
 * ------------------------------------------------------------------ */

test('T29 planBoundaryFetch is pure: same input, same output, synchronous (no I/O possible)', () => {
  const req = { property_ref: 'PROP-1', title_number: 'ABC123', wants: ['PARCEL_BOUNDARY', 'BUILDING_FOOTPRINT'] as const };
  const plan1 = planBoundaryFetch(req);
  const plan2 = planBoundaryFetch(req);
  assert.deepEqual(plan1, plan2);
  assert.equal(plan1 instanceof Promise, false);
  assert.equal(plan1.items.length, 2);
  assert.equal(plan1.items[0].dataset, 'HMLR_INSPIRE_INDEX_POLYGON');
  assert.equal(plan1.items[1].dataset, 'OS_MASTERMAP_BUILDING_FOOTPRINT');
});

test('T30 DEFAULT_FETCHER always throws E_LICENCE_NOT_CLEARED and performs no I/O', async () => {
  const item: BoundaryFetchPlanItem = { kind: 'PARCEL_BOUNDARY', dataset: 'HMLR_INSPIRE_INDEX_POLYGON', locator: 'x://y' };
  await assert.rejects(() => DEFAULT_FETCHER(item), throwsCode('E_LICENCE_NOT_CLEARED'));
});

test('T31 fetchAndImportBoundary with no injected fetcher rejects via DEFAULT_FETCHER', async () => {
  await assert.rejects(
    () => fetchAndImportBoundary({ property_ref: 'PROP-2', wants: ['PARCEL_BOUNDARY'] }),
    throwsCode('E_LICENCE_NOT_CLEARED'),
  );
});

test('T32 fetchAndImportBoundary under NOT_CLEARED never even calls the injected fetcher', async () => {
  let called = false;
  const spyFetcher = async (item: BoundaryFetchPlanItem) => {
    called = true;
    return { geometry: SQUARE_100_CCW, meta: { artefact_id: 'x', source_kind: item.dataset, retrieved_at: 'x', locator: item.locator } };
  };
  const notCleared: LicencePermission = {
    outcome: 'NOT_CLEARED',
    allow_internal_calculation: false,
    allow_report_reproduction: false,
    decided_by: null,
    decided_at: null,
    notes: 'test',
  };
  await assert.rejects(
    () => fetchAndImportBoundary({ property_ref: 'PROP-3', wants: ['PARCEL_BOUNDARY'] }, { fetcher: spyFetcher, permission: notCleared }),
    throwsCode('E_LICENCE_NOT_CLEARED'),
  );
  assert.equal(called, false);
});

test('T33 fetchAndImportBoundary end-to-end with a hand-written in-memory fetcher (no network)', async () => {
  const fakeFetcher = async (item: BoundaryFetchPlanItem) => {
    if (item.kind === 'PARCEL_BOUNDARY') {
      return {
        geometry: SQUARE_100_CCW,
        meta: { artefact_id: 'ignored', source_kind: 'HMLR_INSPIRE_INDEX_POLYGON' as const, retrieved_at: '2026-08-27T09:00:00Z', locator: item.locator },
      };
    }
    return {
      geometry: FOOTPRINT_40X30,
      meta: { artefact_id: 'ignored', source_kind: 'SURVEYOR_MEASURED' as const, retrieved_at: '2026-08-27T09:00:00Z', locator: item.locator },
    };
  };
  const artefacts = await fetchAndImportBoundary(
    { property_ref: 'PROP-4', title_number: 'XYZ999', wants: ['PARCEL_BOUNDARY', 'BUILDING_FOOTPRINT'] },
    { fetcher: fakeFetcher },
  );
  const site = computeSiteArea(artefacts.PARCEL_BOUNDARY);
  const footprint = computeFootprintAreaM2(artefacts.BUILDING_FOOTPRINT);
  const bcr = computeBuildingCoverageRatio(site, footprint);
  assert.equal(site.value, 10000);
  assert.equal(footprint.value, 1200);
  assert.equal(bcr.value, 0.12);
});

/* ------------------------------------------------------------------ *
 * Licensed reference tables — empty stubs, clearly labelled
 * ------------------------------------------------------------------ */

test('T34 the HMLR INSPIRE index polygon table stub is empty and clearly labelled', () => {
  assert.equal(HMLR_INSPIRE_INDEX_POLYGON_TABLE.loaded, false);
  assert.equal(HMLR_INSPIRE_INDEX_POLYGON_TABLE.rows.length, 0);
  assert.match(HMLR_INSPIRE_INDEX_POLYGON_TABLE.notes, /licence pending|Empty/i);
});

test('T35 the OS MasterMap building footprint table stub is empty and clearly labelled', () => {
  assert.equal(OS_MASTERMAP_BUILDING_FOOTPRINT_TABLE.loaded, false);
  assert.equal(OS_MASTERMAP_BUILDING_FOOTPRINT_TABLE.rows.length, 0);
});

/* ------------------------------------------------------------------ *
 * Phase 132e — the decided permission (internal calculation only),
 * fetching still off, and the sources note. Decided by Lakhbir Dhillon,
 * Head of Business Development, answer read 15 September 2026; built 16 September 2026.
 * ------------------------------------------------------------------ */

test('T36 the permission is a recorded decision: internal calculation only, who decided and when built', () => {
  assert.equal(CURRENT_LICENCE_PERMISSION.outcome, 'INTERNAL_CALCULATION_ONLY');
  assert.equal(CURRENT_LICENCE_PERMISSION.allow_internal_calculation, true);
  assert.equal(CURRENT_LICENCE_PERMISSION.allow_report_reproduction, false);
  assert.equal(CURRENT_LICENCE_PERMISSION.decided_by, 'Lakhbir Dhillon, Head of Business Development');
  assert.doesNotMatch(CURRENT_LICENCE_PERMISSION.decided_by, /director|controller|principal/i, 'Lakhbir is not a director of CAP REBATE LTD (18 Sep 2026)');
  assert.equal(CURRENT_LICENCE_PERMISSION.decided_at, '2026-09-15');
  assert.equal(CURRENT_LICENCE_PERMISSION.built_at, '2026-09-16');
  assert.match(String(CURRENT_LICENCE_PERMISSION.decision_record), /read 15 September 2026/);
});

test('T37 internal calculation use is permitted — and still works end to end', () => {
  const d = checkBoundaryUse('INTERNAL_CALCULATION');
  assert.equal(d.permitted, true);
  assert.equal(d.purpose, 'INTERNAL_CALCULATION');
  assert.equal(computeSiteArea(parseBoundaryGeometry(SQUARE_100_CCW, meta())).value, 10000);
});

test('T38 a client-report display request is refused, with a plain reason', () => {
  const d = checkBoundaryUse('CLIENT_REPORT_DISPLAY');
  assert.equal(d.permitted, false);
  assert.equal(d.purpose, 'CLIENT_REPORT_DISPLAY');
  assert.match(d.reason, /boundary maps stay out of client reports/i);
  // And the structural gate agrees: no coordinates leave the module.
  const a = parseBoundaryGeometry(SQUARE_100_CCW, meta());
  assert.throws(() => releaseGeometryForReport(a), throwsCode('E_LICENCE_NOT_CLEARED_FOR_REPRODUCTION'));
});

test('T39 fetching is still off: asking to fetch is refused and nothing is fetched', async () => {
  assert.equal(BOUNDARY_FETCHING_SWITCHED_ON, false);
  const d = checkBoundaryUse('FETCH');
  assert.equal(d.permitted, false);
  assert.match(d.reason, /switched off/);
  assert.match(d.reason, /data protection officer/);
  // Refused even under the most generous permission: a permission never switches fetching on.
  const fullyCleared: LicencePermission = { ...CURRENT_LICENCE_PERMISSION, outcome: 'FULL_REPRODUCTION', allow_report_reproduction: true };
  assert.equal(checkBoundaryUse('FETCH', fullyCleared).permitted, false);
  // And the real pipeline, with no fetcher injected, still refuses under the decided permission.
  await assert.rejects(
    () => fetchAndImportBoundary({ property_ref: 'PROP-132e', wants: ['PARCEL_BOUNDARY'] }),
    throwsCode('E_LICENCE_NOT_CLEARED'),
  );
});

test('T40 N4: a use of "not sure" and an absent (undefined) use are refused identically, never permitted', () => {
  const notSure = checkBoundaryUse('not sure');
  const absent = checkBoundaryUse(undefined);
  assert.equal(notSure.permitted, false);
  assert.equal(absent.permitted, false);
  assert.deepEqual(notSure, absent);
  // Same for the other ways of not saying: null, empty, wrong case, and the absent argument itself.
  for (const other of [null, '', 'NOT_SURE', 'internal_calculation', 42]) {
    assert.deepEqual(checkBoundaryUse(other), absent);
  }
  assert.deepEqual((checkBoundaryUse as (p?: unknown) => unknown)(), absent);
});

test('T41 N4 holds under a permission that allows everything: "not sure" and undefined still refused identically', () => {
  const fullyCleared: LicencePermission = { ...CURRENT_LICENCE_PERMISSION, outcome: 'FULL_REPRODUCTION', allow_report_reproduction: true };
  const notSure = checkBoundaryUse('not sure', fullyCleared);
  const absent = checkBoundaryUse(undefined, fullyCleared);
  assert.equal(notSure.permitted, false);
  assert.deepEqual(notSure, absent);
});

test('T42 the sources note carries both HM Land Registry attribution statements word for word', () => {
  assert.equal(
    INSPIRE_INDEX_POLYGON_SOURCES_NOTE.hmlr_attribution_statement,
    'This information is subject to Crown copyright and database rights [year of supply or date of publication] and is reproduced with the permission of HM Land Registry.',
  );
  assert.equal(
    INSPIRE_INDEX_POLYGON_SOURCES_NOTE.ordnance_survey_attribution_statement,
    'The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights [year of supply or date of publication] Ordnance Survey AC0000851063.',
  );
  assert.equal(INSPIRE_INDEX_POLYGON_SOURCES_NOTE.wording_read_on, '2026-09-16');
  assert.equal(INSPIRE_INDEX_POLYGON_SOURCES_NOTE.conditions_link, 'https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions');
  assert.equal(Object.isFrozen(INSPIRE_INDEX_POLYGON_SOURCES_NOTE), true);
});
