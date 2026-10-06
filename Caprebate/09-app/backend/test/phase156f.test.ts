/**
 * PHASE 156f, 6 OCTOBER 2026 — HOMEDATA AS THE PROPERTY SOURCE. Lakhbir's decisions that day:
 *   B1 "one address box on Homedata, with GoAddress removed - yes"   (src/connectors/address-lookup.ts, the funnel)
 *   B2 the £1 a day cap: "yes please"                                (ADDRESS_SEARCH_CAP, searchesToday)
 *   B3 "planning history - use homedata"                             (research.ts: PLANNING answered by Homedata after signing)
 *   B4 "site boundary - use home data"                               (src/connectors/title-boundary.ts)
 *
 * Recorded answers only. The two real ones in test/fixtures/phase156f/ were captured by ONE logged test lookup on a public
 * address (10 Downing Street, SW1A 2AA, UPRN 100023336956), 6 Oct 2026, under Lakhbir's five conditions; Homedata's opaque
 * uprn_token was taken out. Everything else here is invented.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.ts';
import { RateLimiter, type CallDeps, type Transport } from '../src/connectors/http.ts';
import { secretsFromValues, SECRET_KEYS } from '../src/secrets.ts';
import {
  ADDRESS_SEARCH_CAP, CAPPED_WHY, NOT_A_BUILDING, findAddresses, notABuilding, readAddresses, searchesToday, ADDRESS_LOOKUP,
} from '../src/connectors/address-lookup.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import { homedataAddress, homedataSlugs, preCheckOf, uprnBelongs } from '../src/connectors/homedata.ts';
import { addressFromLines } from '../src/connectors/matching.ts';
import { homedataBoundary, titleBoundaryArea, TITLE_BOUNDARY_LABEL, TITLE_BOUNDARY_SOURCE_ID } from '../src/connectors/title-boundary.ts';
import { PAID_CONNECTORS, PAID_NOT_CHOSEN, totalBeforePence } from '../src/connectors/paid-registers.ts';
import { runOrder } from '../src/connectors/free-registers.ts';
import { preferHomedataPlanning, supersededPlanning, HOMEDATA_PLANNING_ENTITY } from '../src/connectors/homedata-planning.ts';
import * as C from '../src/connectors/registers.ts';
import * as R from '../src/web/research.ts';
import { CONNECTIONS } from '../src/web/connections.ts';
import { ADDRESS_LOOKUP_JS } from '../src/web/address-lookup-script.ts';
import { ADDRESS_PAGE_CSP } from '../src/web/router.ts';
import { ingestRegisterRecord } from '../src/stubs/registers.ts';
import { seed } from '../src/seed.ts';
import { newId } from '../src/users.ts';
import { testApp, actor } from './helpers.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIX = (n: string): string => readFileSync(join(HERE, 'fixtures', 'phase156f', n), 'utf8');
const POSTCODE_ANSWER = FIX('homedata-postcode-sw1a2aa.json');
const PROPERTY_ANSWER = FIX('homedata-property-10-downing-street.json');
const TEST_SITE = Object.freeze({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'caprebate-test.vercel.app' });
const KEYS = secretsFromValues({ HOMEDATA_API_KEY: 'invented-homedata-key' });

/** A transport answering by path pattern, recording every call. Anything not listed is a 404. */
function routes(map: readonly (readonly [RegExp, string | (() => string)])[]): Transport & { seen: { url: string; headers: Record<string, string> }[] } {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const t: Transport = async (url, init) => {
    seen.push({ url, headers: init.headers });
    const u = new URL(url);
    const hit = map.find(([re]) => re.test(`${u.host}${u.pathname}`));
    if (hit === undefined) return new Response('{"detail":"not recorded"}', { status: 404, headers: { 'content-type': 'application/json' } });
    return new Response(typeof hit[1] === 'string' ? hit[1] : hit[1](), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return Object.assign(t, { seen });
}

/* ================================================================== *
 * B1 · ONE ADDRESS BOX ON HOMEDATA; GOADDRESS REMOVED
 * ================================================================== */

describe('B1 — the address box reads Homedata’s real answer', () => {
  test('the public postcode’s answer: one address, its UPRN, the building and street, the town', () => {
    const r = readAddresses(POSTCODE_ANSWER, 'SW1A 2AA');
    assert.deepEqual(r.addresses.map((a) => [a.uprn, a.line1, a.town, a.postcode, a.label]),
      [['100023336956', '10 Downing Street', 'London', 'SW1A 2AA', '10 Downing Street, London']]);
    assert.equal(r.hidden, 0);
  });

  test('NOT A BUILDING: each rule hides what it names, and real buildings stay', () => {
    const hidden = [
      'ADSHEL ADVERTISING SITE, WESTMINSTER BRIDGE ROAD, LONDON, SE1 7EH', 'ADVERTISING RIGHT 1, WESTMINSTER BRIDGE ROAD',
      'MOTOR VESSEL OLD JOE, ALBERT EMBANKMENT', 'THE VESSEL ST THOMAS MOORINGS, ALBERT EMBANKMENT', 'BERTH 4, ALBERT EMBANKMENT',
      'HOSPITAL DEVELOPMENT SITE, LAMBETH PALACE ROAD', 'TELECOMMUNICATIONS MAST, LAMBETH PALACE ROAD', 'ELECTRICITY SUB STATION, X ROAD',
      'CAR PARKING SPACE 12, X ROAD', 'LAND AT REAR OF 4, X ROAD', 'STREET RECORD, X ROAD',
    ];
    const kept = [
      "ST THOMAS' HOSPITAL, WESTMINSTER BRIDGE ROAD, LONDON", '12 THE MOORINGS, LONDON', '1 BERTHA ROAD', 'SUBSTANTIAL HOUSE, 2 LANDS END ROAD',
      'THE ADVERTISING HOUSE, 3 X STREET', '4 VESSELS COURT',
    ];
    for (const l of hidden) assert.equal(notABuilding(l), true, l);
    for (const l of kept) assert.equal(notABuilding(l), false, l);
    assert.ok(NOT_A_BUILDING.length >= 5);
    // Through the reader: a postcode list in Homedata's shape keeps the hospital and drops the rest.
    const body = JSON.stringify({ postcode: 'SE1 7EH', count: 4, addresses: [
      { uprn: 1, address: "ST THOMAS' HOSPITAL, WESTMINSTER BRIDGE ROAD, LONDON, SE1 7EH", building_name: "St Thomas' Hospital", building_number: '', sub_building: '', street: 'Westminster Bridge Road', town: 'London' },
      { uprn: 2, address: 'ADSHEL, WESTMINSTER BRIDGE ROAD, LONDON, SE1 7EH', building_name: 'Adshel', building_number: '', sub_building: '', street: 'Westminster Bridge Road', town: 'London' },
      { uprn: 3, address: 'MOTOR VESSEL X, ALBERT EMBANKMENT, LONDON, SE1 7EH', building_name: 'Motor Vessel X', building_number: '', sub_building: '', street: 'Albert Embankment', town: 'London' },
      { uprn: 4, address: 'HOSPITAL DEVELOPMENT SITE, LAMBETH PALACE ROAD, LONDON, SE1 7EH', building_name: 'Hospital Development Site', building_number: '', sub_building: '', street: 'Lambeth Palace Road', town: 'London' },
    ] });
    const r = readAddresses(body, 'SE1 7EH');
    assert.deepEqual(r.addresses.map((a) => a.line1), ["St Thomas' Hospital, Westminster Bridge Road"]);
    assert.equal(r.hidden, 3);
  });

  test('GoAddress is gone: no outside-call row, no key, no Connections row, not on the test website', () => {
    assert.equal(CALL_POLICIES['GOADDRESS'], undefined);
    assert.equal(SECRET_KEYS.some((k) => k.name === 'GOADDRESS_API_KEY'), false);
    assert.equal(CONNECTIONS.some((c) => c.id === 'GOADDRESS'), false);
    const api = readFileSync(join(HERE, '..', '..', '..', '..', 'api', 'index.mjs'), 'utf8');
    assert.doesNotMatch(api, /GOADDRESS/);
    assert.doesNotMatch(readFileSync(join(HERE, '..', 'secrets.example.env'), 'utf8'), /GOADDRESS/);
    assert.equal(CALL_POLICIES['HOMEDATA_POSTCODE']?.region, 'UK');
    assert.equal(CALL_POLICIES['HOMEDATA_POSTCODE']?.cost_pence, 2);
    assert.match(ADDRESS_LOOKUP.waiver_record ?? '', /GoAddress removed/);
  });

  test('the page’s script asks this site only, through the browser’s own fetch, and writes no HTML from an answer', () => {
    assert.match(ADDRESS_LOOKUP_JS, /root\.fetch\('\/assessment\/details\/addresses'/);
    assert.doesNotMatch(ADDRESS_LOOKUP_JS, /innerHTML|https?:\/\//);
    assert.match(ADDRESS_LOOKUP_JS, /textContent/);
  });
});

describe('B1 and B2 — the box on the assessment, and the £1 a day cap', () => {
  let made: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  let t: ReturnType<typeof routes>;
  before(async () => {
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-156f-')), publicOrigin: 'https://caprebate.example.invalid' });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const a = made.server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
    t = routes([[/^api\.homedata\.co\.uk\/address\/postcode\/SW1A%202AA\/$/, POSTCODE_ANSWER]]);
    made.app.outside = t;
    made.app.secrets = KEYS;
  });
  after(() => made.close());

  function client() {
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
      for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
      return { status: r.status, body: await r.text(), location: r.headers.get('location'), csp: r.headers.get('content-security-policy'), type: r.headers.get('content-type') };
    };
    const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
    return { req, post };
  }
  async function toDetails(c: ReturnType<typeof client>): Promise<void> {
    await c.req('/assessment');
    assert.equal((await c.post('/assessment/buildings', { b0_sector: 'care_homes' })).location, '/assessment/spend-on');
    assert.equal((await c.post('/assessment/spend-on', { b0_trigger: 'purchase' })).location, '/assessment/amounts');
    assert.equal((await c.post('/assessment/amounts', { b0_spend: '1500000', b0_date: '06/2021' })).location, '/assessment/tax');
    assert.equal((await c.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' })).location, '/assessment/claims');
    assert.equal((await c.post('/assessment/claims', { b0_prior: 'no', b0_seller: 'dont_know' })).location, '/assessment/works');
    assert.equal((await c.post('/assessment/works', { b0_works: 'no' })).location, '/assessment/details');
  }

  test('the details page carries its one script, and a policy that adds only our own script and calls to this site', async () => {
    const c = client();
    await toDetails(c);
    const r = await c.req('/assessment/details');
    assert.equal(r.status, 200);
    assert.equal(r.csp, ADDRESS_PAGE_CSP);
    assert.match(r.csp ?? '', /script-src 'self'; connect-src 'self'/);
    assert.doesNotMatch(r.csp ?? '', /unsafe-inline|unsafe-eval|https:/);
    assert.match(r.body, /<script src="\/assets\/address-lookup\.js" defer><\/script><\/body>/);
    assert.equal([...r.body.matchAll(/<script\b/g)].length, 1);
    assert.match(r.body, /<div class="f4-addr" id="b0-address-list" data-building="0" data-searched="">/);
    const js = await c.req('/assets/address-lookup.js');
    assert.equal(js.status, 200);
    assert.match(js.type ?? '', /javascript/);
  });

  test('a complete postcode fills the list (one 2p search); the same postcode again costs nothing; the pick carries the UPRN onto the property', async () => {
    const before = t.seen.length;
    const c = client();
    await toDetails(c);
    const j1 = await c.post('/assessment/details/addresses', { building: '0', postcode: 'sw1a 2aa' });
    assert.equal(j1.status, 200);
    assert.match(j1.type ?? '', /application\/json/);
    assert.deepEqual(JSON.parse(j1.body), { addresses: [{ uprn: '100023336956', label: '10 Downing Street, London', line1: '10 Downing Street', town: 'London' }], why: null });
    assert.equal(t.seen.length, before + 1);
    assert.equal(t.seen.at(-1)!.headers['authorization'], 'Api-Key invented-homedata-key');
    await c.post('/assessment/details/addresses', { building: '0', postcode: 'SW1A2AA' });
    await c.post('/assessment/details', { b0_business: 'Invented Care Homes Limited', b0_entity: 'ltd', b0_postcode: 'SW1A 2AA', b0_line1: '', b0_town: '', find: 'address:0' });
    assert.equal(t.seen.length, before + 1, 'a postcode already searched was searched again');
    const done = await c.post('/assessment/details', { b0_business: 'Invented Care Homes Limited', b0_entity: 'ltd', b0_postcode: 'SW1A 2AA', b0_line1: '', b0_town: '', b0_address_pick: '100023336956' });
    assert.equal(done.location, '/assessment/figure', done.body.slice(0, 400));
    const close = await c.post('/assessment/close', { first_name: 'Invented', surname: 'Person', job_role: 'owner_director', channel: 'email', email: 'invented.156f@example.invalid', contact_consent: 'on' });
    assert.ok(close.status === 303 || close.status === 200, `${close.status} ${close.body.slice(0, 300)}`);
    const p = made.app.db.get<{ uprn: string | null; postcode: string | null; address_line_1: string | null; town: string | null }>(
      "SELECT uprn, postcode, address_line_1, town FROM properties WHERE uprn IS NOT NULL ORDER BY created_at DESC LIMIT 1");
    assert.deepEqual(p, { uprn: '100023336956', postcode: 'SW1A 2AA', address_line_1: '10 Downing Street', town: 'London' });
  });

  test('B2 — five searches for one visitor, then the box says to type the address and sends nothing', async () => {
    const c = client();
    await toDetails(c);
    const before = t.seen.length;
    for (const pc of ['LE1 1AA', 'LE1 1AB', 'LE1 1AD', 'LE1 1AE', 'LE1 1AF']) {
      const j = JSON.parse((await c.post('/assessment/details/addresses', { building: '0', postcode: pc })).body) as { why: string };
      assert.notEqual(j.why, CAPPED_WHY, pc);
    }
    assert.equal(t.seen.length, before + ADDRESS_SEARCH_CAP.per_visitor);
    const sixth = JSON.parse((await c.post('/assessment/details/addresses', { building: '0', postcode: 'LE1 1AG' })).body) as { addresses: unknown[]; why: string };
    assert.deepEqual(sixth, { addresses: [], why: CAPPED_WHY });
    assert.equal(t.seen.length, before + ADDRESS_SEARCH_CAP.per_visitor, 'a sixth search was sent');
  });

  test('B2 — fifty a day, UK time, counted from the audit log: the next visitor is told to type, and yesterday does not count', async () => {
    const today = searchesToday(made.app.db, made.app.now());
    const row = (at: string) => made.app.audit.append({ at, kind: 'CONNECTOR_CALLED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
      object_type: 'connector', object_id: 'HOMEDATA_POSTCODE', detail: { service: 'HOMEDATA_POSTCODE', endpoint: '/address/postcode/{postcode}/', result: 'OK', status: 200 } });
    row(new Date(Date.parse(made.app.now()) - 36 * 3600 * 1000).toISOString());
    assert.equal(searchesToday(made.app.db, made.app.now()), today, 'a search from yesterday was counted');
    for (let k = today; k < ADDRESS_SEARCH_CAP.per_day; k++) row(made.app.now());
    assert.equal(searchesToday(made.app.db, made.app.now()), 50);
    const c = client();
    await toDetails(c);
    const before = t.seen.length;
    const j = JSON.parse((await c.post('/assessment/details/addresses', { building: '0', postcode: 'SW1A 2AB' })).body) as { why: string };
    assert.equal(j.why, CAPPED_WHY);
    assert.equal(t.seen.length, before);
    // And the Connections page says so.
    assert.ok(ADDRESS_SEARCH_CAP.per_day * ADDRESS_SEARCH_CAP.pence_each === 100, 'the cap is not £1');
    const hd = CONNECTIONS.find((x) => x.id === 'HOMEDATA');
    assert.equal(hd?.today?.(made.app), 'Address box today: 50 of 50 searches (2p each).');
  });

  test('findAddresses itself: past either count, no call', async () => {
    const tt = routes([]);
    const deps: CallDeps = { audit: made.app.audit, now: made.app.now, transport: tt, limiter: new RateLimiter() };
    for (const used of [{ today: 50, visitor: 0 }, { today: 0, visitor: 5 }]) {
      const r = await findAddresses({ postcode: 'SW1A 2AA', deps, secrets: KEYS, used });
      assert.equal(r.state, 'CAPPED');
    }
    assert.equal(tt.seen.length, 0);
  });
});

/* ================================================================== *
 * B1 (research) · THE PICKED UPRN, CHECKED, THEN USED; AND THE TITLE PRE-CHECK READ RIGHT
 * ================================================================== */

describe('the paid address lookup starts from the client’s UPRN when it belongs to their address', () => {
  async function ctxOf(t: Transport) {
    const app = await testApp();
    const ctx: C.ConnectorContext = {
      deps: { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } },
      actor_id: 'u-ADMIN', actor_role: 'ADMIN', claim_id: null,
      gate: { free_gate_open: false, engagement_signed: true, switched_on: true }, secrets: KEYS.forOwner('HOMEDATA_ADDRESS'),
    };
    return { app, ctx };
  }
  const property = (over: Record<string, unknown> = {}) => ({
    id: 'p1', address_line_1: '10 Downing Street', address_line_2: null, town: 'London', postcode: 'SW1A 2AA', jurisdiction: 'england' as const,
    uprn: '100023336956', ...over,
  });

  test('it belongs: ONE call, the property, with the title outline asked for; the pre-check now reads title_no', async () => {
    const t = routes([[/\/property\/100023336956\/$/, PROPERTY_ANSWER]]);
    const { app, ctx } = await ctxOf(t);
    const r = await homedataAddress.lookup(ctx, { property: property(), boundary: true });
    assert.equal(r.kind, 'READ');
    assert.equal(t.seen.length, 1, 'the postcode search was made again');
    assert.equal(new URL(t.seen[0]!.url).searchParams.get('with'), 'address,lr_title,title_boundary');
    if (r.kind !== 'READ') return;
    assert.match(r.note, /the address the client picked at the assessment/);
    assert.deepEqual(r.bundle.facts['title_pre_check'], { has_title: true, title_number: 'NGL864428', tenure: 'freehold', restrictions: null });
    assert.deepEqual(r.bundle.facts['title_boundary_area'], { ok: true, site_area_m2: 9607.2, grade: 'B', rings: 1 });
    assert.deepEqual(Object.keys(r.bundle.records[0]!.fields).sort(), ['address_line', 'easting', 'latitude', 'longitude', 'northing', 'postcode', 'uprn']);
    app.close();
  });

  test('it does not belong: back to the postcode search, which finds the right one, and that is the one kept', async () => {
    const eleven = JSON.parse(PROPERTY_ANSWER) as Record<string, Record<string, unknown>>;
    eleven['address']!['address'] = '11 Downing Street';
    const list = JSON.stringify({ postcode: 'SW1A 2AA', count: 2, addresses: [
      { uprn: 100023336956, address: '10 DOWNING STREET, LONDON, SW1A 2AA', building_name: '', building_number: '10', sub_building: '', street: 'Downing Street', town: 'London' },
      { uprn: 100023336957, address: '11 DOWNING STREET, LONDON, SW1A 2AA', building_name: '', building_number: '11', sub_building: '', street: 'Downing Street', town: 'London' }] });
    const t = routes([[/\/property\/100023336956\/$/, PROPERTY_ANSWER], [/\/property\/100023336957\/$/, JSON.stringify(eleven)], [/\/address\/postcode\//, list]]);
    const { app, ctx } = await ctxOf(t);
    const r = await homedataAddress.lookup(ctx, { property: property({ address_line_1: '11 Downing Street' }) });
    assert.equal(r.kind, 'READ');
    assert.deepEqual(t.seen.map((s) => new URL(s.url).pathname), ['/property/100023336956/', '/address/postcode/SW1A%202AA/', '/property/100023336957/']);
    if (r.kind === 'READ') {
      assert.equal(r.bundle.records[0]!.entityId, '100023336957');
      assert.match(r.note, /did not match, so the postcode search was used/);
      assert.equal(r.bundle.facts['title_boundary_area'], undefined, 'the outline was read with its switch off');
    }
    assert.equal(new URL(t.seen[0]!.url).searchParams.get('with'), 'address,lr_title');
    app.close();
  });

  test('uprnBelongs: the postcode and the address, both', () => {
    const typed = addressFromLines(['10 Downing Street'], 'SW1A 2AA', 'London');
    assert.equal(uprnBelongs({ postcode: 'SW1A 2AA', address_line: '10 Downing Street' }, typed, 'SW1A 2AA'), true);
    assert.equal(uprnBelongs({ postcode: 'SW1A 2AB', address_line: '10 Downing Street' }, typed, 'SW1A 2AA'), false);
    assert.equal(uprnBelongs({ postcode: 'SW1A 2AA', address_line: '70 Whitehall' }, typed, 'SW1A 2AA'), false);
    assert.equal(uprnBelongs({ postcode: 'SW1A 2AA' }, typed, 'SW1A 2AA'), false);
  });

  test('the pre-check: title_no and title_class as the live answer gives them; the prose’s names still read', () => {
    assert.deepEqual(preCheckOf({ title_no: 'AB1', title_class: 'Good leasehold title' }), { has_title: true, title_number: 'AB1', tenure: 'leasehold', restrictions: null });
    assert.deepEqual(preCheckOf({ title_number: 'ZZ1', tenure: 'Freehold' }), { has_title: true, title_number: 'ZZ1', tenure: 'freehold', restrictions: null });
    assert.equal(preCheckOf(null).has_title, false);
  });
});

/* ================================================================== *
 * B4 · THE SITE BOUNDARY
 * ================================================================== */

describe('B4 — the site area from the title outline', () => {
  const outline = (JSON.parse(PROPERTY_ANSWER) as Record<string, unknown>)['title_boundary'];

  test('worked out by the boundary module, on the National Grid: 10 Downing Street’s title is about 9,607 square metres, grade B', () => {
    assert.deepEqual(titleBoundaryArea(outline, { uprn: '100023336956', retrieved_at: 'x' }), { ok: true, site_area_m2: 9607.2, grade: 'B', rings: 1 });
    // The same ring as a GeoJSON Feature, and in metres, gives the same answer within a square metre.
    const ring = ((outline as { geometry: { coordinates: number[][][] } }).geometry.coordinates[0]!);
    const feature = titleBoundaryArea({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } }, { uprn: '1', retrieved_at: 'x' });
    assert.equal(feature.ok && feature.site_area_m2, 9607.2);
  });

  test('refused, never guessed: no outline, a point outside Britain, a ring of two points', () => {
    for (const bad of [null, {}, { geometry: { type: 'Polygon', coordinates: [[[10, 10], [10.1, 10], [10, 10.1]]] } },
      { type: 'Polygon', coordinates: [[[-0.1, 51.5], [-0.1, 51.6]]] }, 'not json']) {
      const r = titleBoundaryArea(bad, { uprn: '1', retrieved_at: 'x' });
      assert.equal(r.ok, false, JSON.stringify(bad));
    }
  });

  test('its row makes no call, keeps the area, its grade and the UPRN only, and the one door accepts it', async () => {
    const app = await testApp();
    const ctx = { deps: { audit: app.audit, now: app.now, transport: routes([]) }, actor_id: null, claim_id: null,
      gate: { free_gate_open: false, engagement_signed: true, switched_on: true }, secrets: null } as C.ConnectorContext;
    const none = await homedataBoundary.lookup(ctx, { area: null, uprn: null });
    assert.equal(none.kind, 'NOT_MATCHED');
    const r = await homedataBoundary.lookup(ctx, { area: { ok: true, site_area_m2: 9607.2, grade: 'B', rings: 1 }, uprn: '100023336956' });
    assert.equal(r.kind, 'READ');
    if (r.kind !== 'READ') return;
    assert.deepEqual(r.calls, []);
    assert.deepEqual(r.bundle.records, [{ sourceId: TITLE_BOUNDARY_SOURCE_ID, entityId: 'uprn:100023336956', fields: { site_area_m2: 9607.2, site_area_m2_grade: 'B', uprn: '100023336956' } }]);
    assert.match(r.note, /from the Land Registry title outline, via Homedata/);
    app.db.run("INSERT INTO businesses (id, name, sector, stage, created_at) VALUES ('b-156f', 'Invented', 'care_homes', 'ASSESSMENT_SUBMITTED', '2026-10-06T00:00:00.000Z')");
    ingestRegisterRecord(app.db, newId, app.now, 'b-156f', r.bundle.records[0]!);
    assert.throws(() => ingestRegisterRecord(app.db, newId, app.now, 'b-156f', { sourceId: TITLE_BOUNDARY_SOURCE_ID, entityId: 'x', fields: { title_number: 'NGL864428' } }));
    app.close();
  });

  test('its switch, off here, on for the test website; the slug only with it; 5p counted before the click', () => {
    assert.equal(C.REGISTER_SWITCHES['HOMEDATA_BOUNDARY'], false);
    assert.equal(C.switchesHere(TEST_SITE)['HOMEDATA_BOUNDARY'], true);
    assert.deepEqual(homedataSlugs(undefined, false), ['address', 'lr_title']);
    assert.deepEqual(homedataSlugs(undefined, true), ['address', 'lr_title', 'title_boundary']);
    assert.equal(totalBeforePence(['HOMEDATA_ADDRESS', 'HOMEDATA_BOUNDARY', 'PLANNING'], () => true), 8 + 5 + 5);
    assert.equal(totalBeforePence(['HOMEDATA_ADDRESS', 'PLANNING'], (id) => id === 'HOMEDATA_ADDRESS'), 8);
    assert.match(TITLE_BOUNDARY_LABEL, /Land Registry title outline, via Homedata/);
  });
});

/* ================================================================== *
 * B3 · PLANNING FROM HOMEDATA AFTER SIGNING; THE FREE ROUTE BEFORE
 * ================================================================== */

describe('B3 — planning history: Homedata after signing, and its answer is the one used and shown', () => {
  test('the order: the postcode table, then the address lookup and the boundary, then the free lookups', () => {
    assert.deepEqual(runOrder(['PLANNING', 'EPC', 'HOMEDATA_BOUNDARY', 'HOMEDATA_ADDRESS', 'ONS_POSTCODE']),
      ['ONS_POSTCODE', 'HOMEDATA_ADDRESS', 'HOMEDATA_BOUNDARY', 'EPC', 'PLANNING']);
    assert.ok(PAID_CONNECTORS['HOMEDATA_PLANNING']);
    assert.deepEqual(Object.keys(PAID_NOT_CHOSEN), []);
    assert.equal(C.switchesHere(TEST_SITE)['HOMEDATA_PLANNING'], true);
    assert.equal(C.REGISTER_SWITCHES['HOMEDATA_PLANNING'], false);
  });

  test('a signed client on the test website: one click reads the address, the boundary and Homedata’s planning; PlanIt is not asked', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    const id = app.db.get<{ id: string }>("SELECT business_id AS id FROM engagements WHERE letter_state = 'SIGNED' ORDER BY business_id LIMIT 1")!.id;
    const admin = app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id;
    const prop = app.db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', [id])!.id;
    app.db.run("UPDATE properties SET address_line_1 = '10 Downing Street', town = 'London', postcode = 'SW1A 2AA', jurisdiction = 'england', uprn = '100023336956' WHERE id = ?", [prop]);
    // The free route answered before signing: its row and one of its records are held.
    app.db.run("DELETE FROM research_sources WHERE business_id = ? AND source_id = 'PLANNING'", [id]);
    app.db.run("INSERT INTO research_sources (id, business_id, source_id, tier, state, fired_at, detail, attempts) VALUES ('rs-156f', ?, 'PLANNING', 'FREE', 'FIRED', ?, 'free', 1)", [id, app.now()]);
    ingestRegisterRecord(app.db, newId, app.now, id, { sourceId: 'PLANNING', entityId: '19/00001/FUL', fields: { planning_reference: '19/00001/FUL', planning_description: 'Free route answer.' } }, { property_id: prop });
    const due = R.sourcesFor(app.db, actor('ADMIN', admin), id, { env: TEST_SITE }).sources.find((s) => s.source_id === 'PLANNING')!;
    assert.equal(due.state, 'NOT_RUN');
    assert.match(due.detail, /Homedata will read the planning history/);

    const planning = FIX('../phase146d/homedata-planning.json');
    const property = (() => { const j = JSON.parse(PROPERTY_ANSWER) as Record<string, unknown>; return JSON.stringify(j); })();
    const t = routes([
      [/^api\.homedata\.co\.uk\/property\/100023336956\/$/, () => property],
    ]);
    // Homedata's planning call is the same path with ?with=planning_history: answer by the query.
    const t2: Transport & { seen: { url: string; headers: Record<string, string> }[] } = Object.assign(async (url: string, init: Parameters<Transport>[1]) => {
      if (new URL(url).searchParams.get('with') === 'planning_history') { t.seen.push({ url, headers: init.headers }); return new Response(planning, { status: 200, headers: { 'content-type': 'application/json' } }); }
      return t(url, init);
    }, { seen: t.seen });
    const out = await R.runResearch({ db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t2, secrets: KEYS, env: TEST_SITE } }, actor('ADMIN', admin), id);
    assert.ok(out.ok);
    const hosts = t.seen.map((s) => new URL(s.url));
    assert.equal(hosts.filter((u) => u.host === 'www.planit.org.uk' || u.host === 'www.planning.data.gov.uk').length, 0, 'the free planning route was asked after signing');
    assert.deepEqual(hosts.filter((u) => u.host === 'api.homedata.co.uk').map((u) => `${u.pathname}?${u.searchParams.get('with')}`),
      ['/property/100023336956/?address,lr_title,title_boundary', '/property/100023336956/?planning_history']);
    const rows = new Map(app.db.all<{ source_id: string; state: string; route: string | null; detail: string }>(
      'SELECT source_id, state, route, detail FROM research_sources WHERE business_id = ?', [id]).map((r) => [r.source_id, r]));
    assert.equal(rows.get('HOMEDATA_ADDRESS')?.state, 'FIRED');
    assert.equal(rows.get('HOMEDATA_BOUNDARY')?.state, 'FIRED');
    assert.deepEqual([rows.get('PLANNING')?.state, rows.get('PLANNING')?.route], ['FIRED', 'HOMEDATA_PLANNING']);
    assert.match(rows.get('PLANNING')?.detail ?? '', /Homedata's answer is the one we use and show/);
    // Its records, beside the free route's, and only Homedata's shown.
    const plan = app.db.all<{ entity_id: string }>("SELECT entity_id FROM register_records WHERE business_id = ? AND source_id = 'PLANNING' ORDER BY entity_id", [id]);
    assert.deepEqual(plan.map((r) => r.entity_id), ['19/00001/FUL', `${HOMEDATA_PLANNING_ENTITY}ZZ/2019/0456`, `${HOMEDATA_PLANNING_ENTITY}ZZ/2021/0987`]);
    assert.equal(preferHomedataPlanning(app.db, id), true);
    assert.deepEqual(plan.filter((r) => !supersededPlanning({ source_id: 'PLANNING', entity_id: r.entity_id }, true)).length, 2);
    // The site area line on the panel.
    const line = R.sourcesFor(app.db, actor('ADMIN', admin), id, { env: TEST_SITE }).site_area.find((l) => l.property_id === prop)!;
    assert.equal(line.state, 'STORED');
    assert.equal(line.site_area_m2, 9607.2);
    assert.match(line.words, /from the Land Registry title outline, via Homedata, marked confidence B\. For our own checks only/);
    // The next click does not ask planning again.
    assert.equal(R.sourcesFor(app.db, actor('ADMIN', admin), id, { env: TEST_SITE }).sources.find((s) => s.source_id === 'PLANNING')!.state, 'FIRED');
    app.close();
  });

  test('without the property’s number, after signing, the free route still answers', async () => {
    assert.equal(R.homedataPlanningDue({ state: 'FIRED', route: 'HOMEDATA_PLANNING' }, true, TEST_SITE), false);
    assert.equal(R.homedataPlanningDue({ state: 'FIRED', route: null }, false, TEST_SITE), false, 'before signing');
    assert.equal(R.homedataPlanningDue({ state: 'FIRED', route: null }, true, {}), false, 'switched off here');
    assert.equal(R.homedataPlanningDue({ state: 'FIRED', route: null }, true, TEST_SITE), true);
  });
});
