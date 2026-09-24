/**
 * PHASE 151a, 24 September 2026 — THE LAND BOUNDARY FETCHER WIRED TO A SITE AREA, ALL OF IT SWITCHED OFF.
 *
 * With NO NETWORK and on INVENTED data only (HM Land Registry's files, Ordnance Survey's grid and the councils' points
 * below are all made up; nothing was downloaded), these tests prove:
 *
 *   1. THE COUNCIL'S FILE — src/connectors/inspire-councils.ts pairs all 318 ONS council codes with HM Land Registry's
 *      318 files, each row re-derived here from the rule and the eight named pairs, and a code with no row is refused;
 *   2. THE POINT — src/connectors/ostn15.ts reproduces Ordnance Survey's own worked example of the projection, adds
 *      the grid's shifts by bilinear interpolation, and refuses (no grid, a datum not stated as ETRS89, outside the
 *      grid) rather than approximating. No point, no lookup: absent and "not sure" behave the same (N4);
 *   3. THE SITE AREA — src/connectors/site-area.ts, switched off as shipped, does nothing at all; switched on for a
 *      test it reads the council's file (or both councils' files), stores site_area_m2 through the one door under
 *      HMLR_INSPIRE at grade B, and gives back no polygon and no coordinate;
 *   4. ONE FILE A COUNCIL A MONTH — src/connectors/inspire-store.ts keeps a council's file by council and release, for
 *      no more than the licence row's 35 days, refuses a folder inside the repository, and one download serves two
 *      properties in the same council.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtureTransport, RateLimiter, type CallDeps, type Fixture } from '../src/connectors/http.ts';
import { INSPIRE_AUTHORITY_FILES } from '../src/connectors/inspire-authorities.ts';
import { INSPIRE_COUNCILS, NAMED_PAIRS, fileForOnsName, inspireFileForLad } from '../src/connectors/inspire-councils.ts';
import {
  projectNationalGrid, etrs89ToBritishNationalGrid, ostn15GridFromRows, loadOstn15File, ostn15Grid, AIRY_1830, GRS80,
  type Ostn15Row, type Ostn15Grid,
} from '../src/connectors/ostn15.ts';
import { inspireFileStore, inspireReleaseOf, inspireStoreFromEnv, INSPIRE_KEEP_DAYS } from '../src/connectors/inspire-store.ts';
import {
  siteAreaFromLandBoundary, pointInBritishNationalGrid, homedataPointOf, HOMEDATA_COORDINATE_DATUM, SITE_AREA_GRADE_CEILING,
  type SiteAreaInput,
} from '../src/connectors/site-area.ts';
import { ingestRegisterRecord } from '../src/stubs/registers.ts';
import { addressFields } from '../src/connectors/homedata.ts';
import { assertNoUnauthorisedName } from '../../../04-phase-work/phase3/caprebate-name-exclusion.ts';
import { newId } from '../src/users.ts';
import * as B from '../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import { LICENCES } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import { zipOf } from './document-fixtures.ts';
import { testApp, scalars, keys } from './helpers.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/* ================================================================== the invented land boundary files */

const poly = (id: string, x0: number, y0: number, x1: number, y1: number): string =>
  `<wfs:member><LR:PREDEFINED><LR:GEOMETRY><gml:Polygon srsName="urn:ogc:def:crs:EPSG::27700"><gml:exterior><gml:LinearRing>` +
  `<gml:posList srsDimension="2">${x0} ${y0} ${x1} ${y0} ${x1} ${y1} ${x0} ${y1} ${x0} ${y0}</gml:posList></gml:LinearRing>` +
  `</gml:exterior></gml:Polygon></LR:GEOMETRY><LR:INSPIREID>${id}</LR:INSPIREID></LR:PREDEFINED></wfs:member>`;
const gmlZip = (...members: string[]): Buffer => zipOf([{
  name: 'Land_Registry_Cadastral_Parcels.gml',
  body: `<?xml version="1.0"?><!-- INVENTED for Caprebate's tests. --><wfs:FeatureCollection xmlns:wfs="w" xmlns:gml="g" xmlns:LR="l">${members.join('')}</wfs:FeatureCollection>`,
}]);

/** Adur holds a 100 m square (10,000 m²) around the first property and a second square for the second property. */
const ADUR = gmlZip(poly('99151001', 520000, 180000, 520100, 180100), poly('99151002', 521000, 181000, 521050, 181040));
const WORTHING_SAME = gmlZip(poly('99151001', 520000, 180000, 520100, 180100));
const WORTHING_NONE = gmlZip(poly('99151009', 600000, 300000, 600010, 300010));
const WORTHING_OTHER = gmlZip(poly('99151007', 519990, 179990, 520090, 180090));
const WORTHING_BAD = zipOf([{ name: 'x.gml', body: '<wfs:FeatureCollection><wfs:member><LR:PREDEFINED>no polygon</LR:PREDEFINED></wfs:member></wfs:FeatureCollection>' }]);

const ADUR_CODE = 'E07000223';
const WORTHING_CODE = 'E07000229';
const path = (file: string): string => `GET /datasets/inspire/download/${file}.zip`;
const zipOk = (bytes: Buffer): Fixture => ({ status: 200, body: '', bytes, headers: { 'content-type': 'application/zip' } });
const IN_A = { easting: 520050, northing: 180050 };
const IN_B = { easting: 521025, northing: 181020 };
const T0 = '2026-09-08T12:00:00.000Z';

async function rig(fixtures: Record<string, Fixture | readonly Fixture[]> = { [path('Adur_District_Council')]: zipOk(ADUR) },
  opts: { store?: ReturnType<typeof inspireFileStore> | null; grid?: Ostn15Grid | null } = {}) {
  const app = await testApp();
  const t = fixtureTransport(fixtures);
  const call: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } };
  const business = 'b-151a';
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, 'Invented Care Homes', 'care_homes', 'ENGAGED', T0]);
  for (const p of ['p-151a-1', 'p-151a-2']) {
    app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [p, business, `Site ${p}`, T0]);
  }
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-other', 'Another Invented Company', 'dental', 'ENGAGED', T0]);
  const d = { db: app.db, newId, now: app.now, call, grid: opts.grid ?? null, file_store: opts.store ?? null };
  const input = (over: Partial<SiteAreaInput> = {}): SiteAreaInput => ({
    business_id: business, property_id: 'p-151a-1', lad_codes: [ADUR_CODE], point: IN_A,
    actor_id: 'u-ADMIN', actor_role: 'ADMIN', claim_id: null, gate: { free_gate_open: true, engagement_signed: true }, ...over,
  });
  const records = () => app.db.all<{ source_id: string; entity_id: string; fields_json: string; property_id: string | null }>(
    "SELECT source_id, entity_id, fields_json, property_id FROM register_records WHERE source_id = 'HMLR_INSPIRE' ORDER BY obtained_at");
  const audits = () => app.db.all<{ kind: string }>("SELECT kind FROM audit_log WHERE kind = 'CONNECTOR_CALLED'");
  return { app, t, d, input, records, audits };
}

/* ================================================================== 1. the council's file */

describe('Phase 151a: from a council\'s ONS code to HM Land Registry\'s file, derived from the two lists', () => {
  test('318 councils, 318 files, each exactly once, and every code an England or Wales code', () => {
    assert.equal(INSPIRE_COUNCILS.length, 318);
    assert.equal(new Set(INSPIRE_COUNCILS.map((c) => c.lad_code)).size, 318);
    assert.ok(INSPIRE_COUNCILS.every((c) => /^[EW]\d{8}$/.test(c.lad_code)));
    assert.deepEqual([...INSPIRE_COUNCILS.map((c) => c.file)].sort(), [...INSPIRE_AUTHORITY_FILES].sort());
  });

  test('every row is what the rule or a named pair says — none is typed in', () => {
    const named = new Map(NAMED_PAIRS.map((p) => [p.lad_code, p]));
    assert.equal(named.size, 8);
    for (const c of INSPIRE_COUNCILS) {
      const pair = named.get(c.lad_code);
      if (pair === undefined) {
        assert.deepEqual(fileForOnsName(c.ons_name), [c.file], `${c.lad_code} ${c.ons_name}`);
      } else {
        assert.equal(c.file, pair.file);
        assert.deepEqual(fileForOnsName(c.ons_name), [], `${c.ons_name} is named by hand but the rule pairs it`);
        assert.ok(c.ons_name.includes(pair.word) && c.file.includes(pair.word), `${pair.word} is not in both names`);
      }
    }
  });

  test('a known council reads; a code with no row, a blank and "not sure" are refused alike', () => {
    assert.deepEqual(inspireFileForLad(ADUR_CODE), { ok: true, lad_code: ADUR_CODE, council: 'Adur', file: 'Adur_District_Council' });
    assert.equal((inspireFileForLad('w06000015') as { file: string }).file, 'Cardiff_Council');
    for (const bad of ['E07999999', 'S12000033', '', '   ', 'not sure', undefined, null, 7]) {
      assert.equal(inspireFileForLad(bad).ok, false, String(bad));
    }
  });
});

/* ================================================================== 2. the point */

/** An invented grid: the same shift at every point in a block around London, so the arithmetic is checkable by hand. */
function blockGrid(se: number, sn: number, opts: { hole?: [number, number]; flag0?: [number, number] } = {}): Ostn15Grid {
  const rows: Ostn15Row[] = [];
  for (let i = 500; i <= 540; i++) for (let j = 160; j <= 200; j++) {
    if (opts.hole && opts.hole[0] === i && opts.hole[1] === j) continue;
    rows.push({ easting: i * 1000, northing: j * 1000, e_shift: se, n_shift: sn, flag: opts.flag0 && opts.flag0[0] === i && opts.flag0[1] === j ? 0 : 1 });
  }
  return ostn15GridFromRows(rows, 'invented');
}

describe('Phase 151a: latitude and longitude to British National Grid, exactly or not at all', () => {
  test('the projection reproduces Ordnance Survey\'s worked example to the millimetre', () => {
    const p = projectNationalGrid(52 + 39 / 60 + 27.2531 / 3600, 1 + 43 / 60 + 4.5177 / 3600, AIRY_1830);
    assert.equal(p.easting.toFixed(3), '651409.903');
    assert.equal(p.northing.toFixed(3), '313177.270');
  });

  test('the shift is added, and between four different shifts it is interpolated bilinearly', () => {
    const at = { latitude: 51.5, longitude: -0.3, datum: 'ETRS89' };
    const p = projectNationalGrid(51.5, -0.3, GRS80);
    const r = etrs89ToBritishNationalGrid(at, blockGrid(96.5, -81.25));
    assert.ok(r.ok);
    assert.equal(r.easting, Math.round((p.easting + 96.5) * 1000) / 1000);
    assert.equal(r.northing, Math.round((p.northing - 81.25) * 1000) / 1000);
    // Four corners with four different shifts: the answer is the weighted average, by hand.
    const i = Math.floor(p.easting / 1000); const j = Math.floor(p.northing / 1000);
    const corner = new Map([[`${i},${j}`, 10], [`${i + 1},${j}`, 20], [`${i + 1},${j + 1}`, 40], [`${i},${j + 1}`, 30]]);
    const rows: Ostn15Row[] = [...corner].map(([k, v]) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return { easting: x * 1000, northing: y * 1000, e_shift: v, n_shift: 0, flag: 1 };
    });
    const t = (p.easting - i * 1000) / 1000; const u = (p.northing - j * 1000) / 1000;
    const want = (1 - t) * (1 - u) * 10 + t * (1 - u) * 20 + t * u * 40 + (1 - t) * u * 30;
    const q = etrs89ToBritishNationalGrid(at, ostn15GridFromRows(rows, 'corners'));
    assert.ok(q.ok);
    assert.equal(q.easting, Math.round((p.easting + want) * 1000) / 1000);
  });

  test('every doubt is a refusal: no grid, a datum not stated as ETRS89, a missing point, outside the grid', () => {
    const g = blockGrid(0, 0);
    const code = (r: ReturnType<typeof etrs89ToBritishNationalGrid>) => (r.ok ? 'OK' : r.code);
    assert.equal(code(etrs89ToBritishNationalGrid({ latitude: 51.5, longitude: -0.3, datum: 'ETRS89' }, null)), 'NO_GRID');
    for (const datum of [undefined, null, 'WGS84', 'not sure', 'etrs89']) {
      assert.equal(code(etrs89ToBritishNationalGrid({ latitude: 51.5, longitude: -0.3, datum }, g)), 'DATUM_NOT_ETRS89', String(datum));
    }
    for (const bad of [{}, { latitude: 51.5 }, { latitude: '51.5', longitude: -0.3 }, { latitude: Number.NaN, longitude: -0.3 }]) {
      assert.equal(code(etrs89ToBritishNationalGrid({ ...bad, datum: 'ETRS89' }, g)), 'INVALID_POINT');
    }
    assert.equal(code(etrs89ToBritishNationalGrid({ latitude: 57, longitude: -4, datum: 'ETRS89' }, g)), 'OUTSIDE_GRID', 'no grid points there');
    assert.equal(code(etrs89ToBritishNationalGrid({ latitude: 40, longitude: -3, datum: 'ETRS89' }, g)), 'OUTSIDE_GRID', 'south of the grid');
    const p = projectNationalGrid(51.5, -0.3, GRS80);
    const i = Math.floor(p.easting / 1000); const j = Math.floor(p.northing / 1000);
    assert.equal(code(etrs89ToBritishNationalGrid({ latitude: 51.5, longitude: -0.3, datum: 'ETRS89' }, blockGrid(0, 0, { hole: [i + 1, j + 1] }))), 'OUTSIDE_GRID');
    assert.equal(code(etrs89ToBritishNationalGrid({ latitude: 51.5, longitude: -0.3, datum: 'ETRS89' }, blockGrid(0, 0, { flag0: [i, j] }))), 'OUTSIDE_GRID');
  });

  test('a grid file is read by its headings and refused whole if it is short, off the grid or the wrong shape; none is set up as shipped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ostn15-'));
    const good = join(dir, 'short.txt');
    writeFileSync(good, 'Point_ID,ETRS89_Easting,ETRS89_Northing,ETRS89_OSGB36_EShift,ETRS89_OSGB36_NShift,ETRS89_ODN_HeightShift,Height_Datum_Flag\n1,0,0,91.0,-81.0,44.0,0\n');
    assert.throws(() => loadOstn15File(good), /does not hold all 876951/);
    const wrong = join(dir, 'wrong.txt');
    writeFileSync(wrong, 'a,b,c\n1,2,3\n');
    assert.throws(() => loadOstn15File(wrong), /columns we expect/);
    assert.throws(() => ostn15GridFromRows([{ easting: 500, northing: 0, e_shift: 1, n_shift: 1, flag: 1 }], 'x'), /not on OSTN15/);
    assert.throws(() => ostn15GridFromRows([{ easting: 0, northing: 0, e_shift: 1, n_shift: 1, flag: 1 }, { easting: 0, northing: 0, e_shift: 1, n_shift: 1, flag: 1 }], 'x'), /twice/);
    assert.equal(ostn15Grid({}), null);
    rmSync(dir, { recursive: true, force: true });
  });

  test('N4: absent, "not sure", text and half a point all leave no point, identically', () => {
    for (const p of [undefined, null, 'not sure', {}, { easting: 520050 }, { easting: '520050', northing: 180050 },
      { easting: -1, northing: 180050 }, { easting: 520050, northing: 180050, latitude: 51.5, longitude: -0.3 }]) {
      assert.equal(pointInBritishNationalGrid(p, null).ok, false, JSON.stringify(p));
    }
    assert.deepEqual(pointInBritishNationalGrid(IN_A, null), { ok: true, ...IN_A });
  });

  test('Homedata\'s latitude and longitude are refused until the supplier says in writing they are ETRS89', () => {
    assert.equal(HOMEDATA_COORDINATE_DATUM, null);
    assert.match((pointInBritishNationalGrid({ latitude: 51.5, longitude: -0.3, datum: HOMEDATA_COORDINATE_DATUM }, blockGrid(0, 0)) as { why: string }).why, /ETRS89/);
  });
});

/* ================================================================== 3. the site area */

describe('Phase 151a: the site area, switched off as shipped', () => {
  test('the switch is still false, and with everything else in place nothing is read, sent, logged or stored', async () => {
    assert.equal(B.BOUNDARY_FETCHING_SWITCHED_ON, false);
    const r = await rig();
    const out = await siteAreaFromLandBoundary(r.d, r.input());
    assert.equal(out.state, 'SWITCHED_OFF');
    assert.equal(out.site_area_m2, null);
    assert.equal(r.t.seen.length, 0);
    assert.equal(r.audits().length, 0);
    assert.equal(r.records().length, 0);
  });

  test('no store and no grid are set up as shipped', () => {
    assert.equal(inspireStoreFromEnv({}), null);
    assert.equal(ostn15Grid({}), null);
  });
});

describe('Phase 151a: switched on for a test, the site area is worked out and stored through the one door', () => {
  test('one GET of the council\'s file, 10,000 m² at grade B under HMLR_INSPIRE, and no polygon or coordinate anywhere', async () => {
    const r = await rig();
    const out = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true }));
    assert.equal(out.state, 'STORED', out.why);
    assert.equal(out.site_area_m2, 10_000);
    assert.equal(out.grade, 'B');
    assert.equal(SITE_AREA_GRADE_CEILING, 'B');
    assert.deepEqual(out.councils_read, ['Adur']);
    assert.match(out.why, /Adur's file only[\s\S]*next council/);
    assert.deepEqual(r.t.seen.map((s) => new URL(s.url).pathname), ['/datasets/inspire/download/Adur_District_Council.zip']);
    const rec = r.records();
    assert.equal(rec.length, 1);
    assert.equal(rec[0]!.entity_id, 'property:p-151a-1');
    assert.equal(rec[0]!.property_id, 'p-151a-1');
    assert.deepEqual(JSON.parse(rec[0]!.fields_json), { site_area_m2: 10_000, site_area_m2_grade: 'B', inspire_id: '99151001' });
    // No coordinate of the polygon, and no key that could carry one, in what the caller gets or what is kept.
    const seen = [...scalars(out), ...scalars(JSON.parse(rec[0]!.fields_json))].map(String);
    for (const c of ['520000', '520100', '180000', '180100', '520050', '180050']) assert.ok(!seen.includes(c), c);
    assert.ok(![...keys(out)].some((k) => /geometry|coordinates|polygon|ring|easting|northing|map/i.test(k)));
  });

  test('a latitude and longitude, converted by an (invented) OSTN15 grid, reaches the same polygon', async () => {
    const p = projectNationalGrid(51.5, -0.3, GRS80);
    const grid = blockGrid(IN_A.easting - p.easting, IN_A.northing - p.northing);
    const r = await rig(undefined, { grid });
    const out = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true, point: { latitude: 51.5, longitude: -0.3, datum: 'ETRS89' } }));
    assert.equal(out.state, 'STORED', out.why);
    assert.equal(out.site_area_m2, 10_000);
  });

  test('N4: no point, "not sure", or a latitude and longitude that cannot be converted exactly — nothing sent, nothing stored', async () => {
    for (const point of [undefined, null, 'not sure', {}, { easting: '520050', northing: '180050' },
      { latitude: 51.5, longitude: -0.3 }, { latitude: 51.5, longitude: -0.3, datum: 'ETRS89' }]) {
      const r = await rig();
      const out = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true, point }));
      assert.equal(out.state, 'NO_POINT', JSON.stringify(point));
      assert.match(out.why, /stays asked|nothing to look for/);
      assert.equal(r.t.seen.length, 0);
      assert.equal(r.records().length, 0);
    }
  });

  test('no council, or a council with no file, is refused before anything is sent', async () => {
    for (const lad_codes of [[], ['E07999999'], [ADUR_CODE, 'not sure'], [undefined]]) {
      const r = await rig();
      const out = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true, lad_codes }));
      assert.equal(out.state, 'NO_COUNCIL', JSON.stringify(lad_codes));
      assert.equal(r.t.seen.length, 0);
    }
  });

  test('a property that is not the company\'s is refused before anything is sent', async () => {
    const r = await rig();
    const out = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true, business_id: 'b-other' }));
    assert.equal(out.state, 'NOT_PERMITTED');
    assert.equal(r.t.seen.length, 0);
  });

  test('a site area already held is kept as it was, and nothing is read', async () => {
    const r = await rig();
    ingestRegisterRecord(r.app.db, newId, r.app.now, 'b-151a',
      { sourceId: 'HMLR_INSPIRE', entityId: 'property:p-151a-1', fields: { site_area_m2: 123, site_area_m2_grade: 'B', inspire_id: '1' } },
      { property_id: 'p-151a-1' });
    const out = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true }));
    assert.equal(out.state, 'ALREADY_HELD');
    assert.equal(r.t.seen.length, 0);
    assert.equal(JSON.parse(r.records()[0]!.fields_json).site_area_m2, 123);
  });

  test('the one door keeps no name and no title number from this source', async () => {
    const r = await rig();
    for (const fields of [{ site_area_m2: 1, proprietor_name: 'x' }, { site_area_m2: 1, title_number: 'AB123' }, { site_area_m2: 1, polygon: '1 2 3' }]) {
      assert.throws(() => ingestRegisterRecord(r.app.db, newId, r.app.now, 'b-151a', { sourceId: 'HMLR_INSPIRE', entityId: 'e', fields }));
    }
  });
});

describe('Phase 151a: a site on a council boundary — both files are read, and the answer says so', () => {
  const both = { lad_codes: [ADUR_CODE, WORTHING_CODE], switched_on: true };
  test('the same polygon in both files is one polygon', async () => {
    const r = await rig({ [path('Adur_District_Council')]: zipOk(ADUR), [path('Worthing_Borough_Council')]: zipOk(WORTHING_SAME) });
    const out = await siteAreaFromLandBoundary(r.d, r.input(both));
    assert.equal(out.state, 'STORED', out.why);
    assert.deepEqual(out.councils_read, ['Adur', 'Worthing']);
    assert.match(out.why, /files of Adur and Worthing/);
    assert.equal(r.t.seen.length, 2);
  });
  test('found in one file and not the other is found', async () => {
    const r = await rig({ [path('Adur_District_Council')]: zipOk(ADUR), [path('Worthing_Borough_Council')]: zipOk(WORTHING_NONE) });
    assert.equal((await siteAreaFromLandBoundary(r.d, r.input(both))).state, 'STORED');
  });
  test('two different polygons holding the point is refused, and nothing is stored', async () => {
    const r = await rig({ [path('Adur_District_Council')]: zipOk(ADUR), [path('Worthing_Borough_Council')]: zipOk(WORTHING_OTHER) });
    const out = await siteAreaFromLandBoundary(r.d, r.input(both));
    assert.equal(out.state, 'NOT_FOUND');
    assert.match(out.why, /disagree/);
    assert.equal(r.records().length, 0);
  });
  test('an unreadable second file refuses the whole, because it might hold the answer', async () => {
    const r = await rig({ [path('Adur_District_Council')]: zipOk(ADUR), [path('Worthing_Borough_Council')]: zipOk(WORTHING_BAD) });
    assert.equal((await siteAreaFromLandBoundary(r.d, r.input(both))).state, 'NOT_FOUND');
    assert.equal(r.records().length, 0);
  });
  test('the same council twice is read once', async () => {
    const r = await rig();
    await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true, lad_codes: [ADUR_CODE, ADUR_CODE.toLowerCase()] }));
    assert.equal(r.t.seen.length, 1);
  });
});

/* ================================================================== 4. one file a council a month */

describe('Phase 151a: one file a council a month, kept outside the repository for no more than 35 days', () => {
  const fresh = () => mkdtempSync(join(tmpdir(), 'inspire-store-'));

  test('the limit is the licence row\'s, and the release changes on the first Sunday of the month', () => {
    assert.equal(INSPIRE_KEEP_DAYS, LICENCES.find((l) => l.licence_id === 'HMLR_INSPIRE')?.cache_max_age_days);
    assert.equal(INSPIRE_KEEP_DAYS, 35);
    assert.equal(inspireReleaseOf('2026-09-06T00:00:00Z'), '2026-09'); // Sunday 6 September 2026
    assert.equal(inspireReleaseOf('2026-09-05T23:59:59Z'), '2026-08');
    assert.equal(inspireReleaseOf('2026-01-03T12:00:00Z'), '2025-12'); // the first Sunday of 2026 is 4 January
    assert.equal(inspireReleaseOf(T0), '2026-09');
  });

  test('a folder inside the repository is refused before anything is made there', () => {
    const inside = join(HERE, '.tmp-inspire-store-must-not-exist');
    assert.throws(() => inspireFileStore(inside), /inside the repository/);
    assert.equal(existsSync(inside), false);
    const parent = fresh();
    assert.throws(() => inspireFileStore(join(parent, 'store'), { repository: parent }), /inside the repository/);
    assert.throws(() => inspireFileStore('relative/store'), /full path/);
  });

  test('kept, read back, and gone after 35 days; damaged bytes are not trusted; a new release replaces the old', () => {
    const s = inspireFileStore(fresh());
    s.put('Adur_District_Council', '2026-09', ADUR, T0);
    assert.deepEqual(s.get('Adur_District_Council', '2026-09', '2026-10-13T12:00:00.000Z'), ADUR); // day 35
    assert.equal(s.get('Adur_District_Council', '2026-09', '2026-10-13T12:00:01.000Z'), null);  // past day 35
    assert.deepEqual(readdirSync(join(s.dir, 'Adur_District_Council')), [], 'the expired file was not deleted');
    s.put('Adur_District_Council', '2026-09', ADUR, T0);
    writeFileSync(join(s.dir, 'Adur_District_Council', '2026-09.zip'), Buffer.concat([ADUR, Buffer.from('x')]));
    assert.equal(s.get('Adur_District_Council', '2026-09', T0), null);
    s.put('Adur_District_Council', '2026-08', ADUR, T0);
    s.put('Adur_District_Council', '2026-09', ADUR, T0);
    assert.deepEqual(readdirSync(join(s.dir, 'Adur_District_Council')).sort(), ['2026-09.json', '2026-09.zip']);
    assert.throws(() => s.put('../Adur_District_Council', '2026-09', ADUR, T0));
    assert.throws(() => s.get('Adur_District_Council', '2026-13', T0));
  });

  test('the sweep deletes every file past its days and keeps the rest', () => {
    const s = inspireFileStore(fresh());
    s.put('Adur_District_Council', '2026-08', ADUR, '2026-08-02T12:00:00.000Z');
    s.put('Worthing_Borough_Council', '2026-09', WORTHING_SAME, T0);
    assert.equal(s.sweep('2026-09-10T12:00:00.000Z'), 1);
    assert.equal(existsSync(join(s.dir, 'Adur_District_Council', '2026-08.zip')), false);
    assert.equal(existsSync(join(s.dir, 'Worthing_Borough_Council', '2026-09.zip')), true);
  });

  test('the daily sweep is one command: none set up deletes nothing, and a file past its days is deleted', () => {
    const run = (env: Record<string, string>) => spawnSync(process.execPath, ['src/cli.ts', 'sweep-land-boundaries'],
      { cwd: join(HERE, '..'), env: { PATH: process.env['PATH'] ?? '', ...env }, encoding: 'utf8' });
    const none = run({});
    assert.equal(none.status, 0);
    assert.match(none.stdout, /No land boundary store is set up/);
    const dir = fresh();
    inspireFileStore(dir).put('Adur_District_Council', '2026-08', ADUR, '2026-01-01T00:00:00.000Z');
    const swept = run({ CAPREBATE_INSPIRE_STORE_DIR: dir });
    assert.equal(swept.status, 0, swept.stderr);
    assert.match(swept.stdout, /^1 land boundary file deleted/);
    assert.equal(existsSync(join(dir, 'Adur_District_Council', '2026-08.zip')), false);
  });

  test('two properties in one council, one download', async () => {
    const store = inspireFileStore(fresh());
    const r = await rig(undefined, { store });
    const a = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true }));
    const b = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true, property_id: 'p-151a-2', point: IN_B }));
    assert.equal(a.state, 'STORED', a.why);
    assert.equal(b.state, 'STORED', b.why);
    assert.equal(b.site_area_m2, 2_000);
    assert.equal(r.t.seen.length, 1, 'the second property downloaded the council\'s file again');
    assert.equal(r.audits().length, 1);
    assert.deepEqual(readdirSync(join(store.dir, 'Adur_District_Council')).sort(), ['2026-09.json', '2026-09.zip']);
  });

  test('switched off, a kept file is not even read', async () => {
    const store = inspireFileStore(fresh());
    store.put('Adur_District_Council', '2026-09', ADUR, T0);
    const r = await rig(undefined, { store });
    const out = await siteAreaFromLandBoundary(r.d, r.input());
    assert.equal(out.state, 'SWITCHED_OFF');
    assert.equal(r.records().length, 0);
  });
});

describe('Phase 151a: the two inputs a caller has', () => {
  test('Homedata\'s own easting and northing are kept as a pair, inside the national grid, and pass the one door', () => {
    const f = addressFields({ easting: 520050, northing: 180050, latitude: 51.5, longitude: -0.3 }, '1', 'ZZ1 1ZZ');
    assert.equal(f['easting'], 520050);
    assert.equal(f['northing'], 180050);
    assert.doesNotThrow(() => assertNoUnauthorisedName({ sourceId: 'HOMEDATA_ADDRESS', entityId: '1', fields: f }));
    for (const half of [{ easting: 520050 }, { northing: 180050 }, { easting: 'not sure', northing: 180050 }, { easting: 520050, northing: 1_400_000 }, { easting: -5, northing: 180050 }]) {
      const g = addressFields(half, '1', '');
      assert.equal('easting' in g || 'northing' in g, false, JSON.stringify(half));
    }
  });

  test('where Homedata gave an easting and northing, they are the point, unconverted, and the site area is stored', async () => {
    const r = await rig();
    ingestRegisterRecord(r.app.db, newId, r.app.now, 'b-151a',
      { sourceId: 'HOMEDATA_ADDRESS', entityId: 'uprn-2', fields: { uprn: '2', latitude: 51.5, longitude: -0.3, easting: 520050, northing: 180050 } },
      { property_id: 'p-151a-1' });
    const p = homedataPointOf(r.app.db, 'b-151a', 'p-151a-1');
    assert.deepEqual(p, { easting: 520050, northing: 180050 });
    const out = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true, point: p }));
    assert.equal(out.state, 'STORED', out.why);
  });

  test('Homedata\'s point, where it gave one, comes back with the datum we are sure of — none today', async () => {
    const r = await rig();
    assert.equal(homedataPointOf(r.app.db, 'b-151a', 'p-151a-1'), null);
    ingestRegisterRecord(r.app.db, newId, r.app.now, 'b-151a',
      { sourceId: 'HOMEDATA_ADDRESS', entityId: 'uprn-1', fields: { uprn: '1', latitude: 51.5, longitude: -0.3 } }, { property_id: 'p-151a-1' });
    const p = homedataPointOf(r.app.db, 'b-151a', 'p-151a-1');
    assert.deepEqual(p, { latitude: 51.5, longitude: -0.3, datum: null });
    const out = await siteAreaFromLandBoundary(r.d, r.input({ switched_on: true, point: p }));
    assert.equal(out.state, 'NO_POINT');
    assert.equal(r.t.seen.length, 0);
  });
});
