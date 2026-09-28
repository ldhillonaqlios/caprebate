/**
 * PHASE 150, 24 September 2026 — THE LAND BOUNDARY FETCHER, BUILT FOR REAL AND SWITCHED OFF.
 *
 * src/connectors/inspire.ts downloads one council's INSPIRE Index Polygons file from HM Land Registry, through
 * src/connectors/http.ts, and finds the polygon holding a property's point with the boundary module's own spatial join.
 * These tests prove, with NO NETWORK (every answer is a recorded fixture in test/fixtures/phase150, INVENTED, because
 * no real file may be downloaded until the data protection officer allows a test lookup):
 *
 *   · while BOUNDARY_FETCHING_SWITCHED_ON is false it cannot fire — nothing sent, no audit row — whether it is called
 *     directly or injected into fetchAndImportBoundary, and the module's DEFAULT_FETCHER still always throws;
 *   · no file under src/ other than the fetcher's own names it, so nothing can hand it the tests-only switch;
 *   · switched on for a test, it reads a zip, finds the right polygon, and the module works out its area;
 *   · every doubt is a refusal: a point on a shared edge, a point in a hole, no polygon, an unreadable polygon, a
 *     damaged zip, two .gml files, a council not in the published list, a footprint, a missing point, a 404;
 *   · a file larger than one reading window loses no polygon at a cut.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fixtureTransport, RateLimiter, type CallDeps, type Fixture } from '../src/connectors/http.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import { inspireBoundaryFetcher, unzipOneGml, readInspireGml, INSPIRE_ENDPOINT, type InspireFetchInput } from '../src/connectors/inspire.ts';
import { INSPIRE_AUTHORITY_FILES } from '../src/connectors/inspire-authorities.ts';
import * as B from '../../../04-phase-work/phase9/caprebate-boundary-import.ts';
import { SOURCES as REGISTER_SOURCES, LICENCES, SUPPLIER_DOCS } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import { testApp } from './helpers.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');
const zip = (name: string): Buffer => readFileSync(join(HERE, 'fixtures', 'phase150', name));
const PATH = '/datasets/inspire/download/Adur_District_Council.zip';
const OK = (name: string): Fixture => ({ status: 200, body: '', bytes: zip(name), headers: { 'content-type': 'application/zip' } });
const ITEM: B.BoundaryFetchPlanItem = { kind: 'PARCEL_BOUNDARY', dataset: 'HMLR_INSPIRE_INDEX_POLYGON', locator: 'hmlr-inspire-index-polygon://title/P150' };
const IN_A = { easting: 520050, northing: 180050 };

async function rig(fixtures: Record<string, Fixture | readonly Fixture[]> = { [`GET ${PATH}`]: OK('inspire-invented.zip') }) {
  const app = await testApp();
  const t = fixtureTransport(fixtures);
  const deps: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } };
  const rows = () => app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CONNECTOR_CALLED' ORDER BY seq");
  const input = (over: Partial<InspireFetchInput> = {}): InspireFetchInput => ({
    local_authority_file: 'Adur_District_Council', point: IN_A, deps, actor_id: 'u-ADMIN', actor_role: 'ADMIN', claim_id: null,
    gate: { free_gate_open: true, engagement_signed: true }, ...over,
  });
  return { t, rows, input };
}

const code = (c: string) => (e: unknown) => e instanceof B.BoundaryImportError && e.code === c;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('Phase 150: the land boundary fetcher cannot fire while the switch is off', () => {
  test('the switch is false and the module\'s default fetcher still always throws', async () => {
    assert.equal(B.BOUNDARY_FETCHING_SWITCHED_ON, false);
    await assert.rejects(B.DEFAULT_FETCHER(ITEM), code('E_LICENCE_NOT_CLEARED'));
    await assert.rejects(B.fetchAndImportBoundary({ property_ref: 'P150', wants: ['PARCEL_BOUNDARY'] }), code('E_LICENCE_NOT_CLEARED'));
  });

  test('called with the switch as it stands, it refuses before anything is sent and writes no audit row', async () => {
    const r = await rig();
    await assert.rejects(inspireBoundaryFetcher(r.input())(ITEM), code('E_FETCHING_SWITCHED_OFF'));
    assert.equal(r.t.seen.length, 0, 'a request was made while the switch was off');
    assert.equal(r.rows().length, 0, 'an audit row was written while the switch was off');
  });

  test('injected into fetchAndImportBoundary with the switch off, it still refuses and nothing is sent', async () => {
    const r = await rig();
    await assert.rejects(
      B.fetchAndImportBoundary({ property_ref: 'P150', wants: ['PARCEL_BOUNDARY'] }, { fetcher: inspireBoundaryFetcher(r.input()) }),
      code('E_FETCHING_SWITCHED_OFF'),
    );
    assert.equal(r.t.seen.length, 0);
  });

  test('no file under src/ except the fetcher\'s own names it, so nothing can pass the tests-only switch', () => {
    /* PHASE 151a: ONE CALLER, BY NAME. src/connectors/site-area.ts injects the fetcher into fetchAndImportBoundary —
       that is its job — and it may pass the switch on only as its own tests-only input, never as a literal true. */
    const naming = walk(SRC).filter((p) => p.endsWith('.ts') && !p.endsWith('/connectors/inspire.ts'))
      .filter((p) => /inspireBoundaryFetcher|switched_on\s*:\s*true[\s\S]{0,200}local_authority_file/.test(readFileSync(p, 'utf8')));
    /* PHASE 151l: AND ONE MORE, BY NAME. src/connectors/boundary-test-lookup.ts is the land boundary's test lookup, and it
       switches the fetcher on for ONE call in a command a person typed (`smoke HMLR_INSPIRE`), the way smokeOne turns one
       register on. It may do that in exactly one place, and only the smoke command may reach it. */
    assert.deepEqual(naming.map((p) => p.slice(SRC.length + 1)).sort(), ['connectors/boundary-test-lookup.ts', 'connectors/site-area.ts']);
    const caller = readFileSync(join(SRC, 'connectors', 'site-area.ts'), 'utf8');
    assert.doesNotMatch(caller, /switched_on\s*:\s*true/, 'the site area function switches the fetcher on itself');
    assert.match(caller, /input\.switched_on \?\? BOUNDARY_FETCHING_SWITCHED_ON/, 'the site area function does not read the switch');
    const test = readFileSync(join(SRC, 'connectors', 'boundary-test-lookup.ts'), 'utf8');
    assert.equal(test.match(/switched_on\s*:\s*true/g)?.length, 1, 'the test lookup switches the fetcher on in more than one place');
    const one = test.slice(test.indexOf('export async function boundaryTestOne'));
    assert.match(one, /switched_on\s*:\s*true/, 'the test lookup switches the fetcher on outside boundaryTestOne');
    assert.doesNotMatch(test, /import\s*\{[^}]*BOUNDARY_FETCHING_SWITCHED_ON/, 'the test lookup imports the shipped switch');
    const reaching = walk(SRC).filter((p) => p.endsWith('.ts') && !p.endsWith('/connectors/boundary-test-lookup.ts'))
      .filter((p) => /from\s*['"][^'"]*boundary-test-lookup(?:\.ts)?['"]|import\(\s*['"][^'"]*boundary-test-lookup/.test(readFileSync(p, 'utf8')));
    assert.deepEqual(reaching.map((p) => p.slice(SRC.length + 1)), ['connectors/test-lookups.ts'], 'something other than the smoke command reaches the test lookup');
  });
});

describe('Phase 150: switched on for a test, it reads the file and finds the polygon', () => {
  test('one GET of the council\'s file, the right polygon, and the module works out its area', async () => {
    const r = await rig();
    const out = await B.fetchAndImportBoundary(
      { property_ref: 'P150', wants: ['PARCEL_BOUNDARY'] },
      { fetcher: inspireBoundaryFetcher(r.input({ switched_on: true })) },
    );
    const parcel = out['PARCEL_BOUNDARY'] as B.CartographicArtefact;
    assert.equal(B.computeSiteArea(parcel).value, 10_000);
    assert.equal(parcel.grade, 'B', 'an INSPIRE polygon is never better than B');
    assert.match(parcel.prov.locator ?? '', /Adur_District_Council\.zip#inspire-id=99150001$/);
    assert.deepEqual(r.t.seen.map((s) => [s.method, new URL(s.url).host, new URL(s.url).pathname]),
      [['GET', 'use-land-property-data.service.gov.uk', PATH]]);
    const rows = r.rows().map((x) => JSON.parse(x.detail) as Record<string, unknown>);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!['endpoint'], INSPIRE_ENDPOINT, 'the audit row keeps the template, not the council');
    assert.equal(rows[0]!['switched_on'], true);
    assert.ok(!JSON.stringify(rows).includes('Adur'), 'the council\'s name reached the audit row');
  });

  test('the other wrapper (gml:featureMember) and a CRS given once for the file both read', async () => {
    const r = await rig({ [`GET ${PATH}`]: OK('inspire-featuremember.zip') });
    const p = await inspireBoundaryFetcher(r.input({ switched_on: true }))(ITEM);
    assert.equal(p.geometry.crs, 'EPSG:27700');
  });

  test('a zip that stores its file unpacked reads the same', async () => {
    const r = await rig({ [`GET ${PATH}`]: OK('inspire-stored.zip') });
    const p = await inspireBoundaryFetcher(r.input({ switched_on: true }))(ITEM);
    assert.equal(p.meta.source_kind, 'HMLR_INSPIRE_INDEX_POLYGON');
  });
});

describe('Phase 150: every doubt is a refusal, never a guess', () => {
  const run = async (over: Partial<InspireFetchInput>, fixtures?: Record<string, Fixture>, item: B.BoundaryFetchPlanItem = ITEM) => {
    const r = await rig(fixtures);
    return { r, p: inspireBoundaryFetcher(r.input({ switched_on: true, ...over }))(item) };
  };

  test('a point on the edge two polygons share is ambiguous', async () => {
    const { p } = await run({ point: { easting: 520100, northing: 180050 } });
    await assert.rejects(p, code('E_AMBIGUOUS_POLYGON'));
  });
  test('a point inside a hole is in no polygon', async () => {
    const { p } = await run({ point: { easting: 520350, northing: 180050 } });
    await assert.rejects(p, code('E_NO_FREEHOLD_POLYGON'));
  });
  test('a point no polygon is near is in no polygon', async () => {
    const { p } = await run({ point: { easting: 600000, northing: 300000 } });
    await assert.rejects(p, code('E_NO_FREEHOLD_POLYGON'));
  });
  test('one unreadable polygon makes the file unreadable, even when the point is in another', async () => {
    const { p } = await run({}, { [`GET ${PATH}`]: OK('inspire-unreadable.zip') });
    await assert.rejects(p, code('E_FILE_UNREADABLE'));
  });
  test('two .gml files in one zip are refused', async () => {
    const { p } = await run({}, { [`GET ${PATH}`]: OK('inspire-two-gml.zip') });
    await assert.rejects(p, code('E_FILE_UNREADABLE'));
  });
  test('a damaged zip is refused on its own check value', () => {
    const z = Buffer.from(zip('inspire-stored.zip'));
    z[z.indexOf('99150001') + 2] = 0x37;
    assert.throws(() => unzipOneGml(z), code('E_FILE_UNREADABLE'));
    assert.throws(() => unzipOneGml(Buffer.from('not a zip at all, just words')), code('E_FILE_UNREADABLE'));
  });
  test('a 404 is a failed download, in plain words', async () => {
    const { p } = await run({}, { [`GET ${PATH}`]: { status: 404, body: 'Not Found' } });
    await assert.rejects(p, (e: unknown) => code('E_FETCH_FAILED')(e) && /answered 404/.test((e as Error).message));
  });
  for (const [what, over, item] of [
    ['a council not in the published list', { local_authority_file: 'Nowhere_Borough_Council' }, ITEM],
    ['a council name with a path in it', { local_authority_file: '../Adur_District_Council' }, ITEM],
    ['a missing point', { point: undefined }, ITEM],
    ['a point of 0 given as text', { point: { easting: '0', northing: 180050 } }, ITEM],
    ['a building footprint', {}, { kind: 'BUILDING_FOOTPRINT', dataset: 'OS_MASTERMAP_BUILDING_FOOTPRINT', locator: 'x' }],
  ] as const) {
    test(`${what} is refused and nothing is sent`, async () => {
      const { r, p } = await run(over as Partial<InspireFetchInput>, undefined, item as B.BoundaryFetchPlanItem);
      await assert.rejects(p, (e: unknown) => e instanceof B.BoundaryImportError);
      assert.equal(r.t.seen.length, 0);
    });
  }
});

describe('Phase 150: a large file loses no polygon where it is cut', () => {
  test('60,000 polygons over several reading windows are all counted and the right one found', () => {
    const parts: string[] = ['<wfs:FeatureCollection xmlns:wfs="w" xmlns:gml="g" xmlns:LR="l">'];
    for (let i = 0; i < 60_000; i++) {
      const x = 400000 + (i % 300) * 10; const y = 100000 + Math.floor(i / 300) * 10;
      parts.push(`<wfs:member><LR:PREDEFINED><LR:GEOMETRY><gml:Polygon srsName="urn:ogc:def:crs:EPSG::27700"><gml:exterior><gml:LinearRing><gml:posList>${x + 1} ${y + 1} ${x + 9} ${y + 1} ${x + 9} ${y + 9} ${x + 1} ${y + 9} ${x + 1} ${y + 1}</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></LR:GEOMETRY><LR:INSPIREID>${90000000 + i}</LR:INSPIREID><LR:NOTE>padding padding padding padding padding padding</LR:NOTE></LR:PREDEFINED></wfs:member>`);
    }
    parts.push('</wfs:FeatureCollection>');
    const gml = Buffer.from(parts.join('\n'));
    assert.ok(gml.length > 2 * 8 * 1024 * 1024, 'the fixture must span more than two reading windows');
    const i = 45_123;
    const read = readInspireGml(gml, { easting: 400000 + (i % 300) * 10 + 5, northing: 100000 + Math.floor(i / 300) * 10 + 5 });
    assert.equal(read.features, 60_000);
    assert.equal(read.unreadable, 0);
    assert.deepEqual(read.candidates.map((c) => c.inspire_id), [String(90000000 + i)]);
  });
});

describe('Phase 150: the source is registered, and its pages are named with the date read', () => {
  test('a register row, a licence, a service row and SUPPLIER_DOCS agree', () => {
    const src = REGISTER_SOURCES.find((s) => s.source_id === 'HMLR_INSPIRE');
    assert.ok(src);
    assert.equal(src.max_grade, 'B');
    assert.equal(LICENCES.find((l) => l.licence_id === src.licence_id)?.redistribution.client_report, false,
      'boundary maps stay out of client reports (Lakhbir, 15 September 2026)');
    const row = CALL_POLICIES['HMLR_INSPIRE'];
    assert.equal(row?.base_url, src.endpoint);
    assert.equal(row?.cost_pence, undefined, 'the files are free');
    const docs = SUPPLIER_DOCS.find((d) => d.source_id === 'HMLR_INSPIRE');
    assert.equal(docs?.read_on, '2026-09-24');
    assert.ok(docs?.api_base.includes(row!.base_url!));
    assert.ok(docs?.docs.includes('https://use-land-property-data.service.gov.uk/datasets/inspire/download'));
  });
  test('the published list has 318 councils, each safe to put in a path', () => {
    assert.equal(INSPIRE_AUTHORITY_FILES.length, 318);
    assert.ok(INSPIRE_AUTHORITY_FILES.every((n) => /^[A-Za-z0-9_-]+$/.test(n)));
    assert.equal(new Set(INSPIRE_AUTHORITY_FILES).size, 318);
  });
});
