/**
 * 2 OCTOBER 2026 — THE SURVEY PACK, STAGE 6: THE FREE LOOKUPS SWITCHED ON FOR THE TEST WEBSITE, AND THE REPORT'S SITE PLAN
 * FROM ORDNANCE SURVEY'S FREE BUILDING OUTLINES (src/connectors/registers.ts TEST_WEBSITE_LOOKUPS, src/web/research.ts,
 * src/connectors/os-buildings.ts, src/web/site-plan.ts, migration 078).
 *
 * Lakhbir, asked which lookups to switch on for the test website: "All the free ones"; asked how the client's building is
 * chosen on the site plan: "Automatic".
 *
 * Proven here:
 *   · the waiver holds on the test website (or a copy started with CAPREBATE_LOOKUPS_HERE=1) and nowhere else, for EPC,
 *     price paid, planning and CQC only; every other switch is as it was, and the shipped switches are unchanged;
 *   · "Run the research" on the test website reaches EPC, planning and the care regulator (its council area from
 *     postcodes.io), and nothing else; anywhere else it sends nothing;
 *   · the client's building: the one the point falls in, else the nearest; a hole is not inside;
 *   · fetching a site plan: only the pack's editors, only on the test website, only with the key; what each call sends
 *     (the postcode; a square of map, the key in a header, never in the address); words when Ordnance Survey refuses;
 *   · an approved version keeps the plan as it stood, and its report — page and PDF — draws it with the credit line and
 *     never the site boundary; a version approved without one has none; a later fetch changes no approved report;
 *   · the pack's chapter 9 offers the button, and the route fetches it; none of the new rows is edited or deleted.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import * as C from '../src/connectors/registers.ts';
import * as R from '../src/web/research.ts';
import * as OS from '../src/connectors/os-buildings.ts';
import * as SP from '../src/web/site-plan.ts';
import { secretsFromValues, emptySecrets } from '../src/secrets.ts';
import { seed } from '../src/seed.ts';
import { newId } from '../src/users.ts';
import { testApp, actor } from './helpers.ts';
import { createApp } from '../src/server.ts';
import { reportHtml, reportModel, reportPdf } from '../src/web/survey-report.ts';
import { packView, savePackValue, saveLine, setLineRemoved } from '../src/web/survey-pack.ts';
import { answerLegal, legalView } from '../src/web/pack-legal.ts';
import { approvePack, approvedVersion, saveDetails } from '../src/web/pack-approve.ts';
import { chaptersToRead } from '../src/web/pack-chapters.ts';
import { setBasis } from '../src/web/survey-evidence.ts';
import * as CRM from '../src/web/crm.ts';
import * as PL from '../src/web/pipeline.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const fx = (name: string): Fixture => ({ status: 200, body: readFileSync(join(HERE, 'fixtures', 'phase146c', name), 'utf8') });
const TEST_SITE = Object.freeze({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'caprebate-test.vercel.app' });
const PREVIEW = Object.freeze({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'caprebate-git-x.vercel.app' });
const LAPTOP = Object.freeze({});
const FOUR = ['CQC', 'EPC', 'HMLR_PPD', 'PLANNING'];

/** Every piece of text the PDF draws, decoded from its hexadecimal strings. */
function pdfText(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  return [...s.matchAll(/<([0-9a-f]+)> Tj/g)].map((m) => Buffer.from(m[1] ?? '', 'hex').toString('latin1')).join('\n').replace(/\xa9/g, '©');
}

/* ================================================================== *
 * 1 · THE FREE LOOKUPS, ON THE TEST WEBSITE ONLY
 * ================================================================== */

describe('the free lookups, switched on for the test website only', () => {
  test('the waiver holds on the test website and a copy that asks for it, for EPC, price paid, planning and CQC only', () => {
    assert.deepEqual([...C.TEST_WEBSITE_LOOKUPS.sources].sort(), FOUR);
    assert.match(C.TEST_WEBSITE_LOOKUPS.waiver_record, /Lakhbir Dhillon, 2 October 2026.*"All the free ones"/);
    for (const env of [TEST_SITE, PREVIEW, { CAPREBATE_LOOKUPS_HERE: '1' }]) {
      assert.equal(C.lookupsWaivedHere(env), true, JSON.stringify(env));
      const sw = C.switchesHere(env);
      for (const id of Object.keys(C.REGISTER_SWITCHES)) assert.equal(sw[id], FOUR.includes(id) ? true : C.REGISTER_SWITCHES[id], id);
      for (const id of FOUR) assert.equal(C.freeGateWaived(id, env), true, id);
      for (const id of ['CH_COMPANY', 'CH_PSC', 'HOMEDATA_ADDRESS', 'HMLR_INSPIRE', 'ONS_POSTCODE', 'POSTCODES_IO']) assert.equal(C.freeGateWaived(id, env), false, id);
    }
    for (const env of [LAPTOP, { VERCEL: '1', VERCEL_ENV: 'development', VERCEL_URL: 'x' }, { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: '' }, { CAPREBATE_LOOKUPS_HERE: 'yes' }]) {
      assert.equal(C.lookupsWaivedHere(env), false, JSON.stringify(env));
      assert.equal(C.switchesHere(env), C.REGISTER_SWITCHES);
      for (const id of FOUR) assert.equal(C.freeGateWaived(id, env), false, id);
    }
    // The shipped switches themselves are unchanged: every one is still off.
    for (const [id, on] of Object.entries(C.REGISTER_SWITCHES)) assert.equal(on, false, id);
    const shut = { open: false, requires: 'a published privacy notice' };
    assert.deepEqual(R.freeGateFor(shut, 'EPC', TEST_SITE), { open: true, requires: 'a published privacy notice' });
    assert.equal(R.freeGateFor(shut, 'CH_COMPANY', TEST_SITE), shut);
    assert.equal(R.freeGateFor(shut, 'EPC', LAPTOP), shut);
  });

  const KEYS = secretsFromValues({ CQC_SUBSCRIPTION_KEY: 'cqc-fixture-key', EPC_API_TOKEN: 'epc-fixture-token', COMPANIES_HOUSE_API_KEY: 'ch-fixture-key' });
  const ANSWERS = {
    'GET /postcodes/ZZ11ZZ': { status: 200, body: JSON.stringify({ status: 200, result: { postcode: 'ZZ1 1ZZ', admin_district: 'Nowhere', region: 'North West', country: 'England' } }) },
    'GET /public/v1/locations': fx('cqc-locations.json'), 'GET /public/v1/locations/1-INVENTED01': fx('cqc-location-01.json'),
    'GET /public/v1/locations/1-INVENTED02': fx('cqc-location-02.json'), 'GET /public/v1/providers/1-INVPROV01': fx('cqc-provider.json'),
    'GET /api/non-domestic/search': fx('epc-nondomestic-search.json'), 'GET /api/display/search': { status: 404, body: '{}' },
    'GET /api/certificate': fx('epc-certificate-nondomestic.json'),
    'GET /entity.json': fx('planning-data-empty.json'), 'GET /api/applics/json': fx('planit-applics.json'),
    'GET /search/companies': fx('ch-search.json'),
  };
  async function client(app: Awaited<ReturnType<typeof testApp>>): Promise<{ id: string; admin: string }> {
    const r = await seed(app.db, app.hasher, app.now);
    const id = r.businesses[0]!.id;
    app.db.run("UPDATE businesses SET name = 'Zedford Care Homes', legal_name = NULL, company_number = NULL, sector = 'care_homes' WHERE id = ?", [id]);
    app.db.run("UPDATE properties SET address_line_1 = '12 Invented Road', address_line_2 = NULL, town = 'Nowhere', postcode = 'ZZ1 1ZZ', jurisdiction = 'england' WHERE business_id = ?", [id]);
    return { id, admin: app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id };
  }
  const hosts = (t: ReturnType<typeof fixtureTransport>) => [...new Set(t.seen.map((s) => new URL(s.url).host))].sort();

  test('"Run the research" on the test website reaches EPC, planning and the care regulator (its council area from postcodes.io), and nothing else', async () => {
    const app = await testApp();
    const { id, admin } = await client(app);
    const t = fixtureTransport(ANSWERS);
    const out = await R.runResearch({ db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS, env: TEST_SITE } }, actor('ADMIN', admin), id);
    assert.equal(out.ok, true);
    assert.deepEqual(hosts(t), [ 'api.get-energy-performance-data.communities.gov.uk', 'api.postcodes.io', 'api.service.cqc.org.uk', 'www.planit.org.uk', 'www.planning.data.gov.uk']);
    const cqcAsk = t.seen.find((s) => new URL(s.url).pathname === '/public/v1/locations')!;
    assert.equal(new URL(cqcAsk.url).searchParams.get('localAuthority'), 'Nowhere', 'the council area is not postcodes.io’s');
    const pcAsk = t.seen.find((s) => new URL(s.url).host === 'api.postcodes.io')!;
    assert.equal(new URL(pcAsk.url).search, '', 'postcodes.io was sent more than the postcode');
    const panel = new Map(R.sourcesFor(app.db, actor('ADMIN', admin), id, { env: TEST_SITE }).sources.map((s) => [s.source_id, s] as const));
    for (const s of ['EPC', 'PLANNING', 'CQC']) assert.equal(panel.get(s)!.state, 'FIRED', s);
    // Price paid is homes only: a care home is not asked about, and says so.
    assert.equal(panel.get('HMLR_PPD')!.switched_on, true);
    assert.notEqual(panel.get('HMLR_PPD')!.state, 'FIRED');
    for (const s of ['CH_COMPANY', 'CH_PSC', 'HOMEDATA_ADDRESS', 'HMLR_INSPIRE']) {
      assert.equal(panel.get(s)!.state, 'NOT_PERMITTED_YET', s);
      assert.equal(panel.get(s)!.switched_on, false, s);
    }
    assert.ok(app.db.get<{ n: number }>("SELECT count(*) AS n FROM register_records WHERE business_id = ? AND source_id = 'EPC'", [id])!.n >= 1);
    // Each call's audit row says the free gate was open for it, as the waiver made it; never a closed gate called through.
    const epcCalls = app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CONNECTOR_CALLED' AND detail LIKE '%EPC%'");
    assert.ok(epcCalls.length > 0);
    for (const c of epcCalls) assert.equal((JSON.parse(c.detail) as { free_gate_open: boolean }).free_gate_open, true);
    app.close();
  });

  test('anywhere else — a copy on a computer, or a test that does not say — the same click sends nothing', async () => {
    const app = await testApp();
    const { id, admin } = await client(app);
    for (const env of [LAPTOP, undefined]) {
      const t = fixtureTransport(ANSWERS);
      const out = await R.runResearch({ db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS, ...(env === undefined ? {} : { env }) } }, actor('ADMIN', admin), id);
      assert.deepEqual([out.fired, t.seen.length], [0, 0], JSON.stringify(env));
    }
    for (const s of R.sourcesFor(app.db, actor('ADMIN', admin), id, { env: LAPTOP }).sources.filter((x) => FOUR.includes(x.source_id))) {
      assert.equal(s.state, 'NOT_PERMITTED_YET', s.source_id);
      assert.equal(s.switched_on, false, s.source_id);
    }
    app.close();
  });
});

/* ================================================================== *
 * 2 · WHICH BUILDING IS THE CLIENT'S
 * ================================================================== */

const square = (e: number, n: number, half: number): OS.Outline => [[[e - half, n - half], [e + half, n - half], [e + half, n + half], [e - half, n + half], [e - half, n - half]]];

describe('the client’s building, picked automatically', () => {
  test('the one the point falls in; else the nearest, with how far; a hole is not inside; none when there is none', () => {
    const at = { easting: 530000, northing: 180000 };
    const near = square(530030, 180000, 10);       // 20 m east of the point, its west wall
    const far = square(529900, 180000, 10);
    const round = square(530000, 180000, 8);
    assert.equal(OS.contains(round, at), true);
    assert.equal(OS.contains(near, at), false);
    assert.deepEqual(OS.pickBuilding([far, near, round], at), { index: 2, how: 'INSIDE', metres: 0 });
    assert.deepEqual(OS.pickBuilding([far, near], at), { index: 1, how: 'NEAREST', metres: 20 });
    const ring: OS.Outline = [square(530000, 180000, 20)[0]!, square(530000, 180000, 5)[0]!];
    assert.equal(OS.contains(ring, at), false, 'a point in a courtyard is not in the building');
    assert.equal(OS.distanceTo(ring, at), 5);
    assert.equal(OS.pickBuilding([], at), null);
  });
});

/* ================================================================== *
 * 3 · THE SITE PLAN — fetched, kept, and on the report
 * ================================================================== */

const T0 = '2026-10-02T09:00:00.000Z';
let clock = T0;
const PASSWORD = 'a-very-long-development-password';
const JOB = 'job-s6-1';
const SAM = actor('SURVEYING', 'u-s6-sam');
const OLA = actor('SURVEYING', 'u-s6-ola');
const SALES = actor('SALES', 'u-s6-sales');
const ADMIN = actor('ADMIN', 'u-s6-admin');
const OS_KEY = 'os-fixture-key-0123456789';
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let n = 0;

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-s6-')), now: () => clock, publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-s6', 'Plan Practice Limited', 'gp', 'SURVEY', T0, 'COMPANY']);
  for (const [id, role, name] of [['u-s6-sam', 'SURVEYING', 'Sam Surveyor'], ['u-s6-ola', 'SURVEYING', 'Ola Other'], ['u-s6-admin', 'ADMIN', 'Ada Admin'], ['u-s6-sales', 'SALES', 'Sid Sales']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T0, T0, null]);
  }
  db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', ['p-s6', 'b-s6', 'Plan Practice', 'ZZ9 9ZZ', T0]);
  db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-s6', 'b-s6', 'gp', T0, 100, 200, T0]);
  db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ['e-s6', 'as-s6', 'b-s6', 5_000_000, 0.05, 3_000_000, 2_000_000, 15_000_000, 1, 1_000_000, T0, 'test-not-a-real-hash']);
  const claim = CRM.insertClaim(db, made.app.now, randomUUID, { business_id: 'b-s6', property_id: 'p-s6', assessment_id: 'as-s6', workstream: 'PLANT_AND_MACHINERY', stage: 'TAX_ADVISER_SIGNOFF', owner_id: null, surveyor_id: null }).id;
  PL.recordOpened({ db, now: made.app.now, newId: randomUUID }, null, claim, 'TAX_ADVISER_SIGNOFF', 'a test fixture');
  db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [JOB, 'b-s6', 'as-s6', 'u-s6-sam', 'SEALED', null, T0, claim]);
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-epc-s6', 'b-s6', 'EPC', 'INVENTED-RRN-S6', JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T0, 'p-s6']);
  db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    ['rr-title-s6', 'b-s6', 'HMLR_TITLE', 'ZZ66666', JSON.stringify({ title_number: 'ZZ66666', price_paid: 1050000 }), T0, 'p-s6']);
  for (const w of ['u-s6-sam', 'u-s6-sales']) {
    await req(w, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${w}@example.invalid`, password: PASSWORD }).toString() });
  }
  approveOnce('2000');
});
after(() => made.close());

const jars = new Map<string, string>();
async function req(who: string, path: string, init: RequestInit = {}) {
  let cookie = jars.get(who) ?? '';
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  jars.set(who, cookie);
  return { status: r.status, body: await r.text(), location: r.headers.get('location'), csp: r.headers.get('content-security-policy') ?? '' };
}
const post = (who: string, path: string, form: Record<string, string>) => req(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const deps = () => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `s6-${(++n).toString().padStart(6, '0')}` });
const view = () => packView(deps(), ADMIN, JOB);

function approveOnce(rate: string): number {
  const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
  if (view().lines.filter((l) => !l.removed).length > 2) {
    const keep = view().lines.slice(0, 2).map((l) => l.id);
    for (const l of view().lines) if (!keep.includes(l.id) && !l.removed) ok(setLineRemoved(deps(), SAM, JOB, { line: l.id, reason: 'Not in this building', seq: String(view().seq) }, true));
    ok(saveLine(deps(), SAM, JOB, { line: keep[1]!, qty: '100', rate: '300', qpct: '50', pool: 'MP', reason: 'Counted on the walkthrough', seq: String(view().seq) }));
    ok(savePackValue(deps(), SAM, JOB, { field: 'land', value: '150000', reason: 'Local land sales', seq: String(view().seq) }));
    ok(savePackValue(deps(), SAM, JOB, { field: 'building_rate', value: '1500', reason: 'BCIS, GP surgeries', seq: String(view().seq) }));
    for (const [q, v] of [['G8', ['new_build']], ['G9d', ['2023-05-01']]] as const) {
      ok(answerLegal(deps(), SAM, JOB, { question: q, values: v, source: 'The building contract', seq: String(legalView(deps(), SAM, JOB).seq) }));
    }
    ok(saveDetails(deps(), SAM, JOB, { rics_number: '1234567', firm: 'Sam Surveyors LLP' }));
    ok(setBasis(deps(), SAM, JOB, { basis: 'DESKTOP_EVIDENCE', note: '' }));
  }
  ok(saveLine(deps(), SAM, JOB, { line: view().lines[0]!.id, qty: '10', rate, qpct: '100', pool: 'SR', reason: 'Counted on the walkthrough', seq: String(view().seq) }));
  for (const c of chaptersToRead()) made.app.db.run('INSERT OR IGNORE INTO survey_pack_reads (id, job_id, user_id, chapter, legal_seq, at) VALUES (?, ?, ?, ?, ?, ?)',
    [`rd-${(++n).toString()}`, JOB, 'u-s6-sam', c, legalView(deps(), SAM, JOB).seq, clock]);
  const r = approvePack(deps(), SAM, JOB, { seq: String(view().seq), legal_seq: String(legalView(deps(), SAM, JOB).seq) });
  ok(r);
  return r.ok ? r.version ?? 0 : 0;
}

/** Ordnance Survey's answer: the client's building round the point, a neighbour with a courtyard, and a pair as one feature. */
const E0 = 530123;
const N0 = 180456;
const feature = (geometry: unknown) => ({ type: 'Feature', properties: { UUID: 'x' }, geometry });
const OS_BODY = JSON.stringify({ type: 'FeatureCollection', features: [
  feature({ type: 'Polygon', coordinates: [[[E0 + 30, N0 - 10], [E0 + 60, N0 - 10], [E0 + 60, N0 + 20], [E0 + 30, N0 + 20], [E0 + 30, N0 - 10]],
    [[E0 + 40, N0], [E0 + 50, N0], [E0 + 50, N0 + 10], [E0 + 40, N0 + 10], [E0 + 40, N0]]] }),
  feature({ type: 'Polygon', coordinates: [[[E0 - 12, N0 - 8], [E0 + 12, N0 - 8], [E0 + 12, N0 + 8], [E0 - 12, N0 + 8], [E0 - 12, N0 - 8]]] }),
  feature({ type: 'MultiPolygon', coordinates: [[[[E0 - 70, N0 + 40], [E0 - 50, N0 + 40], [E0 - 50, N0 + 60], [E0 - 70, N0 + 40]]], [[[E0 - 70, N0 - 60], [E0 - 50, N0 - 60], [E0 - 60, N0 - 40], [E0 - 70, N0 - 60]]]] }),
  feature({ type: 'Point', coordinates: [E0, N0] }),
] });
const POINT = { status: 200, body: JSON.stringify({ status: 200, result: { postcode: 'ZZ9 9ZZ', eastings: E0, northings: N0, admin_district: 'Nowhere' } }) };
const planDeps = (t: ReturnType<typeof fixtureTransport>, env: Record<string, string> = TEST_SITE, key: string | null = OS_KEY) => ({
  ...deps(), transport: t, env, secrets: key === null ? emptySecrets() : secretsFromValues({ OS_DATA_HUB_API_KEY: key }),
});

describe('the site plan', () => {
  test('only the pack’s editors fetch it, only on the test website, only with the key, only with a postcode; nothing is sent until then', async () => {
    const t = fixtureTransport({ 'GET /postcodes/ZZ99ZZ': POINT, 'GET /features/v1/wfs': { status: 200, body: OS_BODY } });
    for (const who of [OLA, SALES, actor('CLIENT', 'u-x', 'b-s6')]) await assert.rejects(SP.fetchSitePlan(planDeps(t), who, JOB), /not authorised|NotAuthorised|refus/i, who.role);
    assert.deepEqual(await SP.fetchSitePlan(planDeps(t, LAPTOP), SAM, JOB), { ok: false, why: 'Site plans are fetched on the test website only, for now.' });
    assert.deepEqual(await SP.fetchSitePlan(planDeps(t, TEST_SITE, null), SAM, JOB), { ok: false, why: 'Add the Ordnance Survey key first: OS_DATA_HUB_API_KEY.' });
    made.app.db.run("UPDATE properties SET postcode = NULL WHERE id = 'p-s6'");
    try {
      assert.deepEqual(await SP.fetchSitePlan(planDeps(t), SAM, JOB), { ok: false, why: 'The property has no postcode, so we cannot place it on the map.' });
    } finally { made.app.db.run("UPDATE properties SET postcode = 'ZZ9 9ZZ' WHERE id = 'p-s6'"); }
    assert.equal(t.seen.length, 0);
    assert.equal(SP.sitePlanOf(made.app.db, JOB), null);
  });

  test('Ordnance Survey refusing the key, or not answering, keeps nothing and says why', async () => {
    const no = fixtureTransport({ 'GET /postcodes/ZZ99ZZ': POINT, 'GET /features/v1/wfs': { status: 401, body: '{"error":"bad key"}' } });
    assert.deepEqual(await SP.fetchSitePlan(planDeps(no), SAM, JOB), { ok: false, why: 'Ordnance Survey did not accept our key. Check OS_DATA_HUB_API_KEY, and that the OS Features API is added to its project.' });
    const odd = fixtureTransport({ 'GET /postcodes/ZZ99ZZ': POINT, 'GET /features/v1/wfs': { status: 200, body: '{"nothing":1}' } });
    assert.equal((await SP.fetchSitePlan(planDeps(odd), SAM, JOB)).ok, false);
    const lost = fixtureTransport({ 'GET /postcodes/ZZ99ZZ': { status: 404, body: '{"status":404}' } });
    assert.deepEqual(await SP.fetchSitePlan(planDeps(lost), SAM, JOB), { ok: false, why: 'Postcodes.io does not know the postcode ZZ9 9ZZ.' });
    assert.equal(SP.sitePlanOf(made.app.db, JOB), null);
  });

  test('fetched: the postcode alone to postcodes.io; a 160 m square to Ordnance Survey, the key in a header; the client’s building picked and kept from the point', async () => {
    const t = fixtureTransport({ 'GET /postcodes/ZZ99ZZ': POINT, 'GET /features/v1/wfs': { status: 200, body: OS_BODY } });
    clock = '2026-10-02T10:00:00.000Z';
    assert.deepEqual(await SP.fetchSitePlan(planDeps(t), SAM, JOB), { ok: true, buildings: 4 });
    const [pc, os] = t.seen;
    assert.equal(new URL(pc!.url).toString(), 'https://api.postcodes.io/postcodes/ZZ99ZZ');
    const u = new URL(os!.url);
    assert.equal(`${u.origin}${u.pathname}`, 'https://api.os.uk/features/v1/wfs');
    assert.deepEqual(Object.fromEntries(u.searchParams), {
      service: 'wfs', version: '2.0.0', request: 'GetFeature', typeNames: 'Zoomstack_LocalBuildings', outputFormat: 'GEOJSON',
      srsName: 'EPSG:27700', bbox: `${String(E0 - 80)},${String(N0 - 80)},${String(E0 + 80)},${String(N0 + 80)},EPSG:27700`, count: '100',
    });
    assert.equal(os!.headers['key'], OS_KEY);
    assert.ok(!t.seen.some((s) => s.url.includes(OS_KEY)), 'the key is in an address');
    const plan = SP.sitePlanOf(made.app.db, JOB)!;
    assert.deepEqual([plan.postcode, plan.half_m, plan.chosen, plan.how, plan.metres, plan.buildings.length], ['ZZ9 9ZZ', 80, 1, 'INSIDE', 0, 4]);
    assert.deepEqual(plan.buildings[1], [[[-120, -80], [120, -80], [120, 80], [-120, 80], [-120, -80]]], 'kept in decimetres from the point');
    assert.equal(plan.buildings[0]!.length, 2, 'the courtyard is kept');
    assert.equal(plan.attribution, 'Contains OS data © Crown copyright and database right 2026');
    const row = made.app.db.get<{ easting: number; northing: number; fetched_by: string }>('SELECT easting, northing, fetched_by FROM site_plans WHERE job_id = ?', [JOB])!;
    assert.deepEqual({ ...row }, { easting: E0, northing: N0, fetched_by: 'u-s6-sam' });
    const audit = made.app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'SITE_PLAN_FETCHED'");
    assert.equal(audit.length, 1);
    assert.ok(!audit[0]!.detail.includes('ZZ9') && !audit[0]!.detail.includes(String(E0)), 'the audit row holds the postcode or a coordinate');
    assert.equal(SP.pickWords(plan), 'The dark building is the one the postcode’s map point falls in.');
  });

  test('the report: a version approved without a plan has none; one approved after has it, drawn on the page and in the PDF, never the boundary; a later fetch changes neither', async () => {
    const v1 = approvedVersion(deps(), SAM, JOB, 1)!;
    assert.equal('site_plan' in v1.snapshot, false, 'a version approved before any plan carries one');
    const m1 = reportModel(v1.snapshot, v1.row.fingerprint);
    assert.equal(m1.site_plan, null);
    assert.ok(!String(reportHtml(m1, { pdf: null })).includes('rp-plan'));

    clock = '2026-10-02T11:00:00.000Z';
    const v = approveOnce('2100');
    const kept = approvedVersion(deps(), SAM, JOB, v)!;
    const m = reportModel(kept.snapshot, kept.row.fingerprint);
    assert.deepEqual(m.site_plan, SP.sitePlanOf(made.app.db, JOB));
    const page = String(reportHtml(m, { pdf: null }));
    assert.match(page, /<div class="rp-plan"><svg class="rp-plan-map" viewBox="-80 -80 160 160" role="img" aria-label="Site plan: the building at /);
    assert.equal((page.match(/fill="#14261d" stroke="#14261d"/g) ?? []).length, 1, 'one building is the client’s');
    assert.equal((page.match(/fill="#d5dbd7"/g) ?? []).length, 3);
    assert.match(page, /<path d="M-12 8L12 8L12 -8L-12 -8L-12 8Z" fill="#14261d"/, 'north is up: the plan is not upside down');
    assert.match(page, /The plan shows buildings only, not the legal boundary of the site\. Contains OS data © Crown copyright and database right 2026\./);
    assert.ok(!/style=/.test(page.slice(page.indexOf('rp-plan'), page.indexOf('</svg>'))), 'an inline style the page’s policy refuses');
    const pdf = reportPdf(m);
    const words = pdfText(pdf.bytes).replace(/\n/g, ' ');
    assert.match(words, /Site plan/);
    assert.match(words, /Contains OS data © Crown copyright and database right 2026\./);
    assert.match(words, /not the legal boundary of the site/);
    const raw = Buffer.from(pdf.bytes).toString('latin1');
    assert.equal((raw.match(/ B\* Q/g) ?? []).length, 4, 'four buildings drawn as shapes (the pair is two)');
    assert.equal((raw.match(/0\.08 0\.15 0\.11 rg 0\.08 0\.15 0\.11 RG [^\n]* B\* Q/g) ?? []).length, 1, 'one is dark');

    // A later fetch, of a different square: the approved report is the same, word for word and byte for byte.
    const again = fixtureTransport({ 'GET /postcodes/ZZ99ZZ': POINT, 'GET /features/v1/wfs': { status: 200, body: JSON.stringify({ type: 'FeatureCollection', features: [] }) } });
    clock = '2026-10-02T12:00:00.000Z';
    assert.deepEqual(await SP.fetchSitePlan(planDeps(again), SAM, JOB), { ok: true, buildings: 0 });
    assert.equal(SP.sitePlanOf(made.app.db, JOB)!.chosen, null);
    assert.equal(SP.pickWords(SP.sitePlanOf(made.app.db, JOB)!), 'Ordnance Survey shows no building near the postcode.');
    const later = approvedVersion(deps(), SAM, JOB, v)!;
    assert.equal(String(reportHtml(reportModel(later.snapshot, later.row.fingerprint), { pdf: null })), page);
    assert.deepEqual(reportPdf(reportModel(later.snapshot, later.row.fingerprint)).bytes, pdf.bytes);
  });

  test('the nearest building, when the point falls in none, is said with how far', async () => {
    const t = fixtureTransport({ 'GET /postcodes/ZZ99ZZ': POINT, 'GET /features/v1/wfs': { status: 200, body: JSON.stringify({ type: 'FeatureCollection', features: [
      feature({ type: 'Polygon', coordinates: [[[E0 + 15, N0 - 5], [E0 + 25, N0 - 5], [E0 + 25, N0 + 5], [E0 + 15, N0 + 5], [E0 + 15, N0 - 5]]] })] }) } });
    clock = '2026-10-02T13:00:00.000Z';
    assert.equal((await SP.fetchSitePlan(planDeps(t), SAM, JOB)).ok, true);
    const plan = SP.sitePlanOf(made.app.db, JOB)!;
    assert.deepEqual([plan.chosen, plan.how, plan.metres], [0, 'NEAREST', 15]);
    assert.equal(SP.pickWords(plan), 'The dark building is the nearest to the postcode’s map point, 15 m away.');
  });

  test('chapter 9 shows the plan and the button to the pack’s editors; the button fetches it on the test website', async () => {
    const page = await req('u-s6-sam', `/staff/survey/${JOB}/pack?ch=9`);
    assert.equal(page.status, 200);
    assert.match(page.body, /<section class="pk-card" id="site-plan"><h2>Site plan for the report<\/h2>/);
    assert.match(page.body, /<form method="post" action="\/staff\/survey\/job-s6-1\/pack\/site-plan">.*<button class="btn-quiet" type="submit">Get it again<\/button>/s);
    assert.match(page.body, /The dark building is the nearest to the postcode’s map point, 15 m away\./);
    const sales = await req('u-s6-sales', `/staff/survey/${JOB}/pack?ch=9`);
    assert.ok(sales.body.includes('Site plan for the report') && !sales.body.includes('/pack/site-plan"'), 'Sales is offered the button');
    // Off the test website, the button says so and fetches nothing.
    const off = await post('u-s6-sam', `/staff/survey/${JOB}/pack/site-plan`, { ch: '9', seq: String(view().seq) });
    assert.match(off.body, /Site plans are fetched on the test website only, for now\./);
    // On it (as this copy is told it is), with the key: fetched, and back to chapter 9.
    const was = { outside: made.app.outside, secrets: made.app.secrets, env: process.env['CAPREBATE_LOOKUPS_HERE'] };
    made.app.outside = fixtureTransport({ 'GET /postcodes/ZZ99ZZ': POINT, 'GET /features/v1/wfs': { status: 200, body: OS_BODY } });
    made.app.secrets = secretsFromValues({ OS_DATA_HUB_API_KEY: OS_KEY });
    process.env['CAPREBATE_LOOKUPS_HERE'] = '1';
    try {
      clock = '2026-10-02T14:00:00.000Z';
      const r = await post('u-s6-sam', `/staff/survey/${JOB}/pack/site-plan`, { ch: '9', seq: String(view().seq) });
      assert.deepEqual([r.status, r.location], [303, `/staff/survey/${JOB}/pack?ch=9&done=plan#site-plan`]);
      assert.equal(SP.sitePlanOf(made.app.db, JOB)!.how, 'INSIDE');
      assert.match((await req('u-s6-sam', `/staff/survey/${JOB}/pack?ch=9&done=plan`)).body, /Site plan fetched\. It goes on the report’s cover when you approve\./);
    } finally {
      made.app.outside = was.outside;
      made.app.secrets = was.secrets;
      if (was.env === undefined) delete process.env['CAPREBATE_LOOKUPS_HERE']; else process.env['CAPREBATE_LOOKUPS_HERE'] = was.env;
    }
  });

  test('a site plan is never edited or deleted', () => {
    assert.throws(() => made.app.db.run('UPDATE site_plans SET chosen = 0'), /never edited/);
    assert.throws(() => made.app.db.run('DELETE FROM site_plans'), /never deleted/);
  });
});
