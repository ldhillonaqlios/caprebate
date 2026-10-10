/**
 * PHASE 159f, 10 October 2026 — BCIS: THE PACK DRAFTS EVERY RATE, AND EVERY RATE NAMES ITS SOURCE (the back end's half).
 *
 * From the Lockwood run (L12) and the stress test of 9 October 2026 (C19, C20, C21). Lakhbir, 9 October 2026: "With
 * BCIS data loaded, the pack could draft each rate from the right building type — this needs to happen." Each test fails
 * on the code before this phase (src/web/bcis-data.ts did not exist, so this file does not load on it at all):
 *   1  item 1: the importer reads BCIS's exports (an invented fixture in BCIS's format), keeps them outside the
 *      repository, refuses a file it cannot read whole, and refuses a quarter it cannot find
 *   2  item 2: with the data loaded, the pack drafts the whole-building rate and the floor-area lines from the
 *      sector's building function × the location factor × the index to the purchase date; the surveyor overrides with
 *      a source; with no data it is off and says so; on the test system the placeholder drafts, labelled a test rate
 *   3  item 3: a typed rate's source is all three parts or none; approval needs a source on every counted rate; the
 *      Valuation gate "every rate sourced" reads the approved version
 *   4  item 4 and L12: the report names each rate's source, lists them in full, and prints a test rate as one
 *   5  item 5 and C19: a rate priced at another day is brought to the purchase date; rates that cannot be are listed and
 *      stop approval; the report says "priced at" the purchase date. C20 the £/m² flag at one day; C21 the share flag
 *   6  item 6: section 562 the residual way beside the proportional one
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp, actor } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import * as C from '../src/web/crm.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as L from '../src/web/pack-legal.ts';
import * as A from '../src/web/pack-approve.ts';
import * as EV from '../src/web/survey-evidence.ts';
import * as CH from '../src/web/pack-chapters.ts';
import * as REP from '../src/web/survey-report.ts';
import * as PL from '../src/web/pipeline.ts';
import * as B from '../src/web/bcis-data.ts';
import { importBcisIndex } from '../src/web/bcis-index.ts';
import { rateFlagReading, shareFlagReading } from '../src/web/pack-cost-model.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T = '2026-09-08T00:00:00.000Z';
const SAM = actor('SURVEYING', 'u-sam');
const ADMIN = actor('ADMIN');
const dir = mkdtempSync(join(tmpdir(), 'cb-159f-'));
const DATA = join(dir, 'bcis-data.json');
const INDEX = join(dir, 'bcis-index.json');

/* BCIS's export format, with invented figures: a heading line naming the quarter, then the table. */
const RATES = 'BCIS Average prices,,,,\nRebased to 2Q 2026 (420; forecast) and UK mean location,,,,\n' +
  'Building function,Mean,Lowest,Median,Highest,Sample\n' +
  '"Health centres, clinics, group practice surgeries","2,500",1500,"2,450",4100,38\nNursing homes,2300,1400,2250,3800,61\n';
const ELEMENTS = 'Elemental analyses - rebased to 2Q2026,,\nBuilding function,Element,£/m2\n' +
  '"Health centres, clinics, group practice surgeries",5.4 Water installations,100\n"Health centres, clinics, group practice surgeries",5.6 Space heating and air conditioning,200\n' +
  '"Health centres, clinics, group practice surgeries",5.7 Ventilation,120\n"Health centres, clinics, group practice surgeries",5.8 Electrical installations,300\n';
const LOCATIONS = 'Location,Factor\nKirklees,95\nWestminster,121\n';
const TPI = 'Period,All-in TPI\n2Q2024,390\n2Q2025,400\n2Q2026,420\n';

async function world(): Promise<App> {
  const app = await testApp();
  for (const [id, role] of [['u-sam', 'SURVEYING'], ['u-ADMIN', 'ADMIN'], ['u-SALES', 'SALES'], ['u-SURVEYING', 'SURVEYING']] as const) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@x.invalid`, `${id}@x.invalid`, `${id} name`, role, 'x', T, T]);
  }
  return app;
}
const deps = (app: App) => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });
const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
const view = (app: App, job: string) => SP.packView(deps(app), SAM, job);
const lview = (app: App, job: string) => L.legalView(deps(app), SAM, job);
const seq = (app: App, job: string) => String(view(app, job).seq);

/** Run `fn` with BCIS's data and index loaded from the fixture (or not), and the test system on or off. */
function withEnv<T>(o: { data?: boolean; index?: boolean; test?: boolean }, fn: () => T): T {
  const keep = { d: process.env.CAPREBATE_BCIS_DATA_FILE, i: process.env.CAPREBATE_BCIS_INDEX_FILE, t: process.env.CAPREBATE_COST_MODEL_TEST };
  process.env.CAPREBATE_BCIS_DATA_FILE = o.data === true ? DATA : join(dir, 'none.json');
  process.env.CAPREBATE_BCIS_INDEX_FILE = o.index === true ? INDEX : join(dir, 'none-index.json');
  if (o.test === true) process.env.CAPREBATE_COST_MODEL_TEST = '1'; else delete process.env.CAPREBATE_COST_MODEL_TEST;
  try { return fn(); } finally {
    for (const [k, v] of [['CAPREBATE_BCIS_DATA_FILE', keep.d], ['CAPREBATE_BCIS_INDEX_FILE', keep.i], ['CAPREBATE_COST_MODEL_TEST', keep.t]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

/** A GP surgery bought on 1 June 2025, 640.5 m², with only the electrical line left in (measured by floor area). */
function pack(app: App, tag: string) {
  const b = `b-${tag}`, p = `p-${tag}`, as = `as-${tag}`, job = `job-${tag}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, `Rates ${tag} Limited`, 'gp', 'SURVEY', T, 'COMPANY']);
  app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at,acquisition_date) VALUES (?,?,?,?,?,?)', [p, b, 'Rates Surgery', 'ZZ9 9ZZ', T, '2025-06-01']);
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [as, b, 'gp', T, null, 19_500_000, T]);
  app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [`e-${tag}`, as, b, 19_500_000, 0.3, 0, 0, 0, 1, 0, T, 'not-a-real-hash']);
  const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: as, workstream: 'PLANT_AND_MACHINERY', stage: 'VALUATION', owner_id: null, surveyor_id: null }).id;
  CF.fact(app, claim, 'ACCOUNTING_PERIOD_START', '2025-01-01');
  CF.fact(app, claim, 'ACCOUNTING_PERIOD_END', '2025-12-31');
  app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [job, b, as, 'u-sam', 'SEALED', null, T, claim]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-epc-${tag}`, b, 'EPC', `RRN-${tag}`, JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T, p]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-title-${tag}`, b, 'HMLR_TITLE', `ZZ${tag}`, JSON.stringify({ title_number: `ZZ${tag}`, price_paid: 1_050_000 }), T, p]);
  for (const l of view(app, job).lines) {
    if (l.element_id === 'LS-SR-001' || l.removed) continue;
    ok(SP.setLineRemoved(deps(app), SAM, job, { line: l.id, reason: 'Not here', seq: seq(app, job) }, true));
  }
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'land', value: '150000', reason: 'Land registry', seq: seq(app, job) }));
  ok(EV.setBasis(deps(app), SAM, job, { basis: 'DESKTOP_EVIDENCE', note: '' }));
  A.saveDetails(deps(app), SAM, job, { rics_number: '1234567', firm: 'Survey Firm' });
  for (const [q, v] of [['G8', ['new_build']], ['G9d', ['2025-06-01']]] as const) {
    if (lview(app, job).asked.some((x) => x.id === q)) ok(L.answerLegal(deps(app), SAM, job, { question: q, values: [...v], source: 'The contract', seq: String(lview(app, job).seq) }));
  }
  return { b, p, claim, job };
}
function approve(app: App, job: string) {
  for (const c of CH.chaptersToRead()) A.recordRead(deps(app), SAM, job, c, lview(app, job).seq);
  return A.approvePack(deps(app), SAM, job, { seq: seq(app, job), legal_seq: String(lview(app, job).seq) });
}
const electrical = (app: App, job: string) => view(app, job).lines.find((l) => l.element_id === 'LS-SR-001')!;

before(() => {
  const r = B.importBcisData({ rates: { text: RATES, name: 'rates.csv' }, elements: { text: ELEMENTS, name: 'elements.csv' }, locations: { text: LOCATIONS, name: 'locations.csv' } },
    T, {}, { CAPREBATE_BCIS_DATA_FILE: DATA });
  assert.equal(r.ok, true, JSON.stringify(r));
  const i = importBcisIndex(TPI, 'tpi.csv', T, { CAPREBATE_BCIS_INDEX_FILE: INDEX }, undefined, 'TPI');
  assert.equal(i.ok, true, JSON.stringify(i));
});
after(() => undefined);

describe('1 · item 1 — the importer', () => {
  test('BCIS’s exports, read by their headers: the quarter, the mean, the elements, the factors (95 read as 0.95); kept outside the repository', () => {
    const d = JSON.parse(readFileSync(DATA, 'utf8')) as B.BcisData;
    assert.equal(d.base, '2026-04');
    assert.deepEqual(d.types.map((t) => [t.name, t.mean_pence, t.median_pence, t.sample]), [
      ['Health centres, clinics, group practice surgeries', 250_000, 245_000, 38], ['Nursing homes', 230_000, 225_000, 61]]);
    assert.deepEqual(d.elements.map((e) => [e.code, e.rate_pence]), [['5.4', 10_000], ['5.6', 20_000], ['5.7', 12_000], ['5.8', 30_000]]);
    assert.deepEqual(d.locations, [{ area: 'Kirklees', factor: 0.95 }, { area: 'Westminster', factor: 1.21 }]);
    assert.match(JSON.parse(readFileSync(INDEX, 'utf8')).source, /All-in Tender Price Index/);
    const inside = B.importBcisData({ rates: { text: RATES, name: 'r.csv' } }, T, {}, { CAPREBATE_BCIS_DATA_FILE: join(process.cwd(), 'bcis.json') });
    assert.equal(inside.ok, false);
    assert.match((inside as { why: string }).why, /may not be kept in the code folder/);
  });
  test('a file it cannot read is refused whole; a quarter it cannot find is asked for', () => {
    const env = { CAPREBATE_BCIS_DATA_FILE: join(dir, 'other.json') };
    const bad = B.importBcisData({ rates: { text: RATES, name: 'r.csv' }, locations: { text: 'Location,Factor\nKirklees,ninety\n', name: 'l.csv' } }, T, {}, env);
    assert.match((bad as { why: string }).why, /nothing was imported: l\.csv, row 2: “ninety” is not a factor/);
    const noQuarter = B.importBcisData({ rates: { text: 'Building function,Mean\nHospitals,3400\n', name: 'r.csv' } }, T, {}, env);
    assert.match((noQuarter as { why: string }).why, /--base 2026-04/);
    assert.equal(B.importBcisData({ rates: { text: 'Building function,Mean\nHospitals,3400\n', name: 'r.csv' } }, T, { base: '2026-04' }, env).ok, true);
  });
});

describe('2 · item 2 — the pack drafts from BCIS', () => {
  test('the whole-building rate and the floor-area line: mean × location × index to the purchase date; the surveyor overrides with a source', async () => {
    const app = await world();
    const a = pack(app, 'A');
    withEnv({ data: true, index: true }, () => {
      // The index: 400 at the purchase (2Q2025) over 420 at BCIS's quarter (2Q2026) = 0.9524. No location yet: the UK mean.
      let v = view(app, a.job);
      assert.equal(v.inputs.building_rate_pence.value, Math.round(250_000 * 0.9524));
      assert.equal(v.inputs.building_rate_pence.source?.kind, 'DRAFT');
      assert.deepEqual(v.inputs.building_rate_pence.source?.basis?.priced_at, '2025-06-01');
      assert.equal(electrical(app, a.job).rate_pence.value, Math.round(30_000 * 0.9524), 'element 5.8, £300 a m²');
      assert.match(v.pricing.bcis.words, /Health centres, clinics, group practice surgeries/);
      // Kirklees: × 0.95.
      ok(SP.savePackLocation(deps(app), SAM, a.job, { area: 'kirklees', reason: 'Huddersfield', seq: seq(app, a.job) }));
      v = view(app, a.job);
      assert.equal(v.inputs.building_rate_pence.value, Math.round(250_000 * 0.95 * 0.9524));
      assert.equal(v.pricing.bcis.location.area, 'Kirklees');
      assert.equal(SP.savePackLocation(deps(app), SAM, a.job, { area: 'Atlantis', reason: 'x', seq: seq(app, a.job) }).ok, false);
      // The surveyor's own rate, with its source.
      ok(SP.saveLine(deps(app), SAM, a.job, { line: electrical(app, a.job).id, qty: '', rate: '310', qpct: '', pool: '', reason: 'The QS priced it',
        rate_basis: 'QS_SCHEDULE', rate_ref: 'Smith QS, item 5.8', rate_priced_at: '2025-06-01', seq: seq(app, a.job) }));
      const e = electrical(app, a.job);
      assert.deepEqual([e.rate_pence.value, e.rate_pence.source?.kind, e.rate_pence.source?.basis?.ref], [31_000, 'SURVEYOR', 'Smith QS, item 5.8']);
    });
    app.close();
  });
  test('with no data it is off and says so; on the test system the placeholder drafts, labelled a test rate', async () => {
    const app = await world();
    const a = pack(app, 'B');
    withEnv({}, () => {
      const v = view(app, a.job);
      assert.equal(v.inputs.building_rate_pence.value, null);
      assert.match(v.pricing.bcis.words, /No rate is drafted: no BCIS data has been imported yet/);
    });
    withEnv({ test: true }, () => {
      const v = view(app, a.job);
      assert.equal(v.inputs.building_rate_pence.source?.basis?.kind, 'TEST_PLACEHOLDER');
      assert.match(v.inputs.building_rate_pence.source?.text ?? '', /^TEST RATE — invented figures, not BCIS/);
    });
    app.close();
  });
});

describe('3 · item 3 — every rate sourced', () => {
  test('a source is all three parts or none; approval needs one on every counted rate; the Valuation gate reads the version', async () => {
    const app = await world();
    const a = pack(app, 'C');
    withEnv({}, () => {
      const line = electrical(app, a.job).id;
      const half = SP.saveLine(deps(app), SAM, a.job, { line, qty: '', rate: '300', qpct: '', pool: '', reason: 'x', rate_basis: 'PRICE_BOOK', rate_ref: '', rate_priced_at: '', seq: seq(app, a.job) });
      assert.deepEqual([half.ok, (half as { field?: string }).field], [false, 'rate_ref']);
      ok(SP.saveLine(deps(app), SAM, a.job, { line, qty: '', rate: '300', qpct: '', pool: '', reason: 'Priced', seq: seq(app, a.job) }));
      ok(SP.savePackValue(deps(app), SAM, a.job, { field: 'building_rate', value: '2400', reason: 'BCIS', seq: seq(app, a.job) }));
      const refused = approve(app, a.job);
      assert.match((refused as { why: string }).why, /Give these 2 rates a source: The whole-building rate; General electrical system including lighting\./);
      assert.throws(() => app.db.run("INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, by_user, reason, at, rate_basis, rate_ref, rate_priced_at) " +
        "SELECT 'x', id, 999, NULL, 'land', 1, 'u-sam', 'r', ?, 'BCIS', 'ref', '2025-06-01' FROM survey_packs LIMIT 1", [T]), /CHECK constraint/, 'a source only on a rate');
      ok(SP.saveLine(deps(app), SAM, a.job, { line, qty: '', rate: '300', qpct: '', pool: '', reason: 'Priced', rate_basis: 'PRICE_BOOK', rate_ref: 'Spon’s 2025, p. 412', rate_priced_at: '2025-06-01', seq: seq(app, a.job) }));
      ok(SP.savePackValue(deps(app), SAM, a.job, { field: 'building_rate', value: '2400', reason: 'BCIS', rate_basis: 'BCIS', rate_ref: 'Health centres, mean, 2Q2025', rate_priced_at: '2025-06-01', seq: seq(app, a.job) }));
      ok(approve(app, a.job));
      assert.equal(PL.ratesSourcedNeed(app.db, { id: a.claim }).met, true);
    });
    app.close();
  });
  test('a version approved without sources does not meet "every rate sourced"', async () => {
    const app = await world();
    const a = pack(app, 'D');
    const pk = app.db.get<{ id: string }>('SELECT id FROM survey_packs WHERE job_id = ?', [a.job])!.id;
    const snap = JSON.stringify({ inputs: { building_rate_pence: { value: 240_000, source: { kind: 'SURVEYOR', text: 'Sam' } } }, lines: [{ label: 'Lighting', removed: false, qty_milli: { value: 1000 }, rate_pence: { value: 100, source: { kind: 'SURVEYOR' } } }] });
    app.db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?,?,?,?,?,?,?,?,?)',
      ['ap-old', pk, 1, 1, 0, snap, 'f'.repeat(64), 'u-sam', T]);
    const n = PL.ratesSourcedNeed(app.db, { id: a.claim });
    assert.equal(n.met, false);
    assert.match(n.why, /the whole-building rate; Lighting/);
    app.close();
  });
});

describe('4 · item 4, L12 — the report names every rate’s source', () => {
  test('BCIS on each drafted line, the sources in full, "priced at" the purchase date, the method named; a test rate is printed as one', async () => {
    const app = await world();
    const a = pack(app, 'E');
    withEnv({ data: true, index: true }, () => {
      ok(approve(app, a.job));
      const kept = A.approvedVersion(deps(app), ADMIN, a.job, 1)!;
      const m = REP.reportModel(kept.snapshot, kept.row.fingerprint);
      assert.equal(m.groups[0]!.rows[0]!.rate_chip.words, 'BCIS');
      assert.match(m.rate_sources[0]!.words, /^BCIS: Health centres, clinics, group practice surgeries, mean £2,500\/m² at April 2026, location factor 1\.00 \(the UK mean\), indexed ×0\.9524, priced at 1 June 2025\.$/);
      assert.match(m.method_lede, /proportional way\..*priced at 1 June 2025, the purchase date\./);
      assert.doesNotMatch(m.method_lede, /build again today/);
      assert.equal(m.test_rates, false);
      assert.match(String(REP.reportHtml(m, { pdf: null })), /Where each rate comes from/);
    });
    const b = pack(app, 'F');
    withEnv({ test: true }, () => {
      ok(approve(app, b.job));
      const kept = A.approvedVersion(deps(app), ADMIN, b.job, 1)!;
      const m = REP.reportModel(kept.snapshot, kept.row.fingerprint);
      assert.equal(m.test_rates, true);
      assert.equal(m.groups[0]!.rows[0]!.rate_chip.words, 'TEST RATE');
      assert.match(String(REP.reportHtml(m, { pdf: null })), /Test rates\./);
    });
    app.close();
  });
});

describe('5 · item 5 — one day for every rate (C19), the £/m² flag at one day (C20), the share flag (C21)', () => {
  test('a rate priced at another day is brought to the purchase date; one that cannot be is listed and stops approval', async () => {
    const app = await world();
    const a = pack(app, 'G');
    const line = () => electrical(app, a.job).id;
    withEnv({ data: true, index: true }, () => {
      ok(SP.saveLine(deps(app), SAM, a.job, { line: line(), qty: '', rate: '420', qpct: '', pool: '', reason: 'QS', rate_basis: 'QS_SCHEDULE', rate_ref: 'Item 5.8', rate_priced_at: '2026-05-01', seq: seq(app, a.job) }));
      const e = electrical(app, a.job);
      assert.equal(e.rate_pence.value, Math.round(42_000 * 0.9524), '£420 at 2Q2026 brought back to June 2025');
      assert.match(e.rate_pence.source?.text ?? '', /brought to the purchase date 2025-06-01 by the index \(×0\.9524\)/);
      assert.equal(view(app, a.job).pricing.priced_at, '2025-06-01');
    });
    withEnv({ data: true }, () => {
      // No index: the line stays at its own day, BCIS's draft at its quarter: two days, listed, and not approved.
      const v = view(app, a.job);
      assert.deepEqual(v.pricing.mixed, ['The whole-building rate: 2026-04-01', 'General electrical system including lighting: 2026-05-01']);
      assert.match((approve(app, a.job) as { why: string }).why, /priced at different days/);
    });
    app.close();
  });
  test('C20: the other packs’ rates are brought to this pack’s day before they are compared; C21: a share above the sector’s ceiling is flagged, never refused', async () => {
    const app = await world();
    const a = pack(app, 'H');
    withEnv({ data: true, index: true }, () => {
      for (const [i, day] of [[1, '2026-05-01'], [2, '2026-05-01'], [3, '2025-06-01'], [4, '2025-06-01'], [5, '2026-05-01']] as const) {
        app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [`j-o${String(i)}`, a.b, 'as-H', 'u-sam', 'SEALED', null, T, null]);
        app.db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?,?,?,?,?)', [`pk-o${String(i)}`, `j-o${String(i)}`, null, T, 'u-sam']);
        app.db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?,?,?,?,?,?,?,?,?)',
          [`ap-o${String(i)}`, `pk-o${String(i)}`, 1, 1, 0, JSON.stringify({ job: { sector: 'gp' }, inputs: { building_rate_pence: { value: 252_000 } }, pricing: { priced_at: day } }), 'a'.repeat(64), 'u-sam', T]);
      }
      const r = rateFlagReading(app.db, view(app, a.job));
      assert.equal(r.median_pence, Math.round(252_000 * 0.9524), 'three at 2Q2026 brought back; two already at June 2025');
      assert.match(r.words, /all priced at 2025-06-01/);
      const s = shareFlagReading(view(app, a.job));
      assert.equal(s.verdict, view(app, a.job).purchase_sums.share_bp! / 10000 > 0.30 ? 'FLAG_FOR_REVIEW' : 'WITHIN');
      const high = shareFlagReading({ ...view(app, a.job), purchase_sums: { ...view(app, a.job).purchase_sums, share_bp: 4500 } });
      assert.equal(high.verdict, 'FLAG_FOR_REVIEW');
      assert.match(high.words, /45% of the building qualifies, above this sector's ceiling of 30%\. It is flagged for your review\. It is not a fail\./);
    });
    app.close();
  });
});

describe('6 · item 6 — section 562 the residual way, beside the proportional one', () => {
  test('the building less its own rebuild cost; never more than the fixtures’ own cost or the price', async () => {
    const app = await world();
    const a = pack(app, 'J');
    withEnv({ data: true, index: true }, () => {
      const v = view(app, a.job);
      const s = v.purchase_sums;
      const shell = (s.rebuild_pence ?? 0) - (s.elements_qualifying_pence ?? 0);
      const want = Math.max(0, Math.min(s.building_price_pence ?? 0, s.elements_qualifying_pence ?? 0, (s.building_price_pence ?? 0) - shell));
      assert.equal(v.pricing.residual.qualifying_pence, want);
      assert.match(v.pricing.residual.words, /The proportional way, which the report uses, gives/);
      ok(approve(app, a.job));
      const kept = A.approvedVersion(deps(app), ADMIN, a.job, 1)!;
      assert.equal((kept.snapshot as { pricing?: { residual_pence: number | null } }).pricing?.residual_pence, want);
    });
    writeFileSync(join(dir, 'done'), '1');
    app.close();
  });
});
