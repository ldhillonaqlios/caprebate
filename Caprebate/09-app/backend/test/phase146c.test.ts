/**
 * PHASE 146c, 23 September 2026 — THE FREE REGISTERS, BUILT FOR REAL AND SWITCHED OFF.
 *
 * Companies House, the Care Quality Commission, energy certificates, HM Land Registry sale prices, planning and the ONS
 * postcode table: each connector run on recorded answers (test/fixtures/phase146c/, shaped from the suppliers' published
 * documentation, invented values), with no key and no network. And the wiring: "Run the research" hands a connector a
 * lookup only when the gates allow it, which today is never.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { fixtureTransport, RateLimiter, callOutside, type CallDeps, type GateSnapshot, type Fixture } from '../src/connectors/http.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';
import * as C from '../src/connectors/registers.ts';
import * as M from '../src/connectors/matching.ts';
import { companiesHouse, companiesHousePsc, readAccounts, companyNumberOf } from '../src/connectors/companies-house.ts';
import { cqc, locationFields } from '../src/connectors/cqc.ts';
import { epc, registersFor } from '../src/connectors/epc.ts';
import { pricePaid, PRICE_PAID_ATTRIBUTION, isoDate } from '../src/connectors/price-paid.ts';
import { planning, PLANIT_USER_AGENT } from '../src/connectors/planning.ts';
import { onsPostcode } from '../src/connectors/postcode.ts';
import { FREE_CONNECTORS, NOT_BUILT, DERIVE_FIELD_OF, runOrder, researchSubject, type TypedProperty } from '../src/connectors/free-registers.ts';
import { secretsFromValues, emptySecrets, SECRET_KEYS } from '../src/secrets.ts';
import { SOURCES as REGISTER_SOURCES, LICENCES, SUPPLIER_DOCS } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import { NAME_EXCLUSION_POLICY, classifyField } from '../../../04-phase-work/phase3/caprebate-name-exclusion.ts';
import { inMemoryPostcodeStore, type PostcodeAuthorityTable } from '../src/web/postcode-port.ts';
import * as R from '../src/web/research.ts';
import * as E from '../src/web/engaged.ts';
import { REGISTRY, registryGate } from '../src/web/engine.ts';
import { connectorSwitchReadings } from '../src/web/case-stamp.ts';
import { PICK_SWITCHES } from '../src/web/match-review.ts';
import { CLAUDE_SWITCHES } from '../src/connectors/claude.ts';
import { buildApp, STUBS } from '../src/app.ts';
import { seed } from '../src/seed.ts';
import { newId } from '../src/users.ts';
import { testApp, actor, fakeHasher, fixedClock } from './helpers.ts';
import * as S from '../src/web/surveyor.ts';
import { ingestRegisterRecord } from '../src/stubs/registers.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');
const fx = (name: string): string => readFileSync(join(HERE, 'fixtures', 'phase146c', name), 'utf8');
const ok = (name: string): Fixture => ({ status: 200, body: fx(name) });

const KEYS = secretsFromValues({
  COMPANIES_HOUSE_API_KEY: 'ch-fixture-key-146c', CQC_SUBSCRIPTION_KEY: 'cqc-fixture-key-146c', EPC_API_TOKEN: 'epc-fixture-token-146c',
});
const ALL_ON: Readonly<Record<string, boolean>> = Object.freeze(Object.fromEntries(Object.keys(C.REGISTER_SWITCHES).map((k) => [k, true])));
const ALLOWED = { state: 'NOT_RUN' as const, detail: 'allowed' };
const GATE: GateSnapshot = { free_gate_open: true, engagement_signed: true, switched_on: true };

const PROPERTY: TypedProperty = { id: 'p-1', address_line_1: '12 Invented Road', address_line_2: null, town: 'Nowhere', postcode: 'zz1 1zz', jurisdiction: 'england' };
const HOME: TypedProperty = { id: 'p-2', address_line_1: '5 Invented Close', address_line_2: null, town: 'Nowhere', postcode: 'ZZ3 3ZZ', jurisdiction: 'england' };

const TABLE: PostcodeAuthorityTable = {
  table_id: 'CB_ONS_POSTCODE_AUTHORITY', source: 'HAND-TYPED TEST FIXTURE - not an ONS file', licence: 'n/a - fixture',
  loaded: true, verified_at: '2026-08-15T00:00:00.000Z', release: 'AUG_2026', release_year: 2026, record_count: 3,
  byPostcode: {
    'ZZ1 1ZZ': { lad_code: 'E06000999', lad_name: 'Nowhere', country_code: 'E92000001', region_code: 'E12000009', terminated_on: null },
    'ZZ3 3ZZ': { lad_code: 'E06000999', lad_name: 'Nowhere', country_code: 'E92000001', region_code: 'E12000009', terminated_on: null },
    'BT1 1AA': { lad_code: 'N09000003', lad_name: 'Belfast', country_code: 'N92000002', region_code: null, terminated_on: null },
  },
};
const STORE = inMemoryPostcodeStore(TABLE);

async function rig(fixtures: Record<string, Fixture | readonly Fixture[]>) {
  const app = await testApp();
  const t = fixtureTransport(fixtures);
  const d: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(), sleep: async () => { /* no wait */ } };
  const ctx: C.ConnectorContext = { deps: d, actor_id: 'u-ADMIN', actor_role: 'ADMIN', claim_id: null, gate: GATE, secrets: null };
  const rows = () => app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CONNECTOR_CALLED' ORDER BY seq");
  return { app, t, d, ctx, rows };
}

/* ================================================================== *
 * 1 · MATCHING — the S10 spec, and one named threshold
 * ================================================================== */

describe('matching a typed address or name — the S10 spec’s own cases, and the thresholds left provisional', () => {
  const T = M.MATCH_THRESHOLDS.CQC;
  const c = (a: M.RawAddress, p: string) => ({ address: a, payload: p });

  test('A.7: known-good accepts at 0.95 or more; a deliberate miss rejects under 0.5; a wrong sub-unit is REVIEW at 0.80', () => {
    const good = M.matchAddress({ paon: '14', street: 'Church Road', town: 'Leeds', postcode: 'LS6 2AB' }, [c({ paon: '14', street: 'Church Rd', postcode: 'LS6 2AB' }, 'A')], T, 'x');
    assert.equal(good.status, 'ACCEPT');
    assert.ok((good.top_score ?? 0) >= 0.95);
    const miss = M.matchAddress({ paon: '14', street: 'Church Road', postcode: 'LS6 2AB' }, [c({ paon: '2', street: 'Chapel Road', postcode: 'LS6 2AB' }, 'A')], T, 'x');
    assert.equal(miss.status, 'REJECT');
    assert.ok((miss.top_score ?? 1) < 0.5);
    const review = M.matchAddress({ paon: 'Riverside Business Park', street: 'Kelso Place', saon: 'Unit 3', postcode: 'BA1 3EX' },
      [c({ paon: 'Riverside Business Park', street: 'Kelso Place', saon: 'Unit 5', postcode: 'BA1 3EX' }, 'A')], T, 'x');
    assert.deepEqual([review.status, review.top_score, review.best], ['REVIEW', 0.8, null]);
  });

  test('A.7: another postcode is never scored; no postcode is INSUFFICIENT_INPUT; a tie at the top is REVIEW, never ACCEPT', () => {
    const other = M.matchAddress({ paon: '14', street: 'Church Road', postcode: 'LS6 2AB' }, [c({ paon: '14', street: 'Church Road', postcode: 'LS6 3AB' }, 'X')], T, 'x');
    assert.deepEqual([other.status, other.scored], ['REJECT', 0]);
    assert.equal(M.matchAddress({ paon: '14', street: 'Church Road' }, [], T, 'x').status, 'INSUFFICIENT_INPUT');
    const tie = M.matchAddress({ paon: '14', street: 'Church Road', postcode: 'LS6 2AB' },
      [c({ paon: '14', street: 'Church Road', saon: 'A', postcode: 'LS6 2AB' }, 'A'), c({ paon: '14', street: 'Church Road', saon: 'B', postcode: 'LS6 2AB' }, 'B')], T, 'x');
    assert.equal(tie.status, 'REVIEW');
  });

  test('THE THRESHOLD IS ONE NAMED CONSTANT, THE SPEC’S PROVISIONAL 0.90 / 0.70 FOR EVERY REGISTER, AND IT SAYS IT IS UNMEASURED', () => {
    for (const [k, t] of Object.entries(M.MATCH_THRESHOLDS)) assert.deepEqual(t, { accept: 0.90, review: 0.70 }, k);
    assert.equal(M.THRESHOLDS_MEASURED, false);
    assert.equal(M.UNMEASURED_MATCH_GRADE_CAP, 'B');
    assert.ok(Object.isFrozen(M.MATCH_THRESHOLDS));
    // No connector carries a number of its own: every one reads the constant.
    for (const f of ['companies-house.ts', 'cqc.ts', 'epc.ts', 'price-paid.ts', 'planning.ts']) {
      const text = readFileSync(join(SRC, 'connectors', f), 'utf8');
      assert.equal(/0\.[79]0?\b/.test(text), false, `${f} carries a threshold of its own`);
      assert.match(text, /MATCH_THRESHOLDS\./, `${f} does not read MATCH_THRESHOLDS`);
    }
  });

  test('the mapper splits a typed address and a register’s lines by one rule (A.8 point 4)', () => {
    const typed = M.normalizeAddress(M.addressFromLines(['12 Invented Road'], 'ZZ1 1ZZ', 'Nowhere'));
    for (const lines of [['12, Invented Rd'], ['12 Invented Road Nowhere ZZ1 1ZZ'], ['12 Invented Road', 'Nowhere']]) {
      const n = M.normalizeAddress(M.addressFromLines(lines, 'ZZ1 1ZZ', null));
      assert.deepEqual([n.paon, n.street], [typed.paon, typed.street], lines.join(' | '));
    }
    const unit = M.addressFromLines(['Unit 3, Riverside Business Park', 'Kelso Place'], 'BA1 3EX', 'Bath');
    assert.deepEqual([unit.saon, unit.paon, unit.street], ['UNIT 3', 'RIVERSIDE BUSINESS PARK', 'KELSO PLACE']);
    const flat = M.addressFromLines(['FLAT 16', 'ORCHARD BUILDING, 25', 'PEAR TREE STREET'], 'EC1V 3AP', 'LONDON');
    assert.deepEqual([flat.saon, flat.paon, flat.street], ['FLAT 16', '25', 'PEAR TREE STREET']);
    assert.equal(M.normalizeAddress({ street: 'St Marys Lane' }).street, 'ST MARYS LANE', 'a saint’s ST became STREET');
    assert.equal(M.normalizeAddress({ street: 'High St' }).street, 'HIGH STREET');
  });

  test('company names: a suffix or THE does not stop a match; a different company does not match', () => {
    assert.ok(M.scoreCompanyName('The Zedford Care Homes', 'ZEDFORD CARE HOMES LIMITED') >= 0.9);
    assert.ok(M.scoreCompanyName('Zedford Care Homes', 'ZEDFORD HOLDINGS LIMITED') < 0.7);
    assert.equal(M.matchCompanyName('', [{ name: 'X LTD', payload: 1 }], M.MATCH_THRESHOLDS.CH_COMPANY).status, 'INSUFFICIENT_INPUT');
    assert.equal(companyNumberOf('9999991'), '09999991');
    assert.equal(companyNumberOf('sc123456'), 'SC123456');
    assert.equal(companyNumberOf('not a number'), null);
  });
});

/* ================================================================== *
 * 2 · COMPANIES HOUSE
 * ================================================================== */

describe('Companies House: search, profile, filing history — PSC only after signature; no match is never a sole trader', () => {
  const chFixtures = (history = 'ch-filing-accounts.json', doc = 'ch-document-pdf.json') => ({
    'GET /search/companies': ok('ch-search.json'),
    'GET /company/09999991': ok('ch-profile.json'),
    'GET /company/09999991/filing-history': ok(history),
    'GET /document/INVENTED-DOC-1': ok(doc),
  });

  test('a name search that matches: four calls with its own key, only the permitted fields kept, and the one door accepts them', async () => {
    const { app, t, ctx, rows } = await rig(chFixtures());
    const run = await C.runConnector(companiesHouse, ctx, { name: 'Zedford Care Homes', company_number: null }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED');
    assert.deepEqual(t.seen.map((s) => new URL(s.url).host + new URL(s.url).pathname), [
      'api.company-information.service.gov.uk/search/companies', 'api.company-information.service.gov.uk/company/09999991',
      'api.company-information.service.gov.uk/company/09999991/filing-history', 'document-api.company-information.service.gov.uk/document/INVENTED-DOC-1',
    ]);
    for (const s of t.seen) assert.equal(s.headers.authorization, 'Basic ' + Buffer.from('ch-fixture-key-146c:').toString('base64'));
    const rec = run.bundle?.records[0];
    assert.deepEqual(rec?.fields, {
      company_number: '09999991', company_status: 'active', sic_codes: '87100, 87300', accounts_year_end: '03-31', incorporation_date: '2011-05-03',
      // PHASE 159g (L2): the latest accounts' type and date, from the filing history.
      accounts_type: 'total-exemption-full', accounts_made_up_to: '2025-03-31',
    });
    assert.ok(run.retrieved_at, 'FIRED with no time read');
    // The typed name went in the query, and no audit row carries it.
    assert.equal(rows().length, 4);
    for (const r of rows()) assert.equal(/zedford/i.test(r.detail), false, 'an audit row carries the name searched for');
    const r = await seed(app.db, app.hasher, app.now);
    assert.ok(rec);
    assert.doesNotThrow(() => R.storeResearchOutcomes({ db: app.db, audit: app.audit, now: app.now, newId }, r.businesses[0]!.id,
      [{ entry: R.catalogue().find((e) => e.source_id === 'CH_COMPANY')!, state: 'FIRED', detail: run.detail, retrieved_at: run.retrieved_at ?? null, failure_code: null, bundle: run.bundle, cost_pence: run.cost_pence }], app.now()));
    app.close();
  });

  test('NO MATCH ROUTES TO ASK, NEVER TO "SOLE TRADER": FAILED, nothing kept, and the words say so', async () => {
    const { app, t, ctx } = await rig({ 'GET /search/companies': ok('ch-search-none.json') });
    const run = await C.runConnector(companiesHouse, ctx, { name: 'Zedford Care Homes', company_number: null }, ALLOWED, KEYS, ALL_ON);
    assert.deepEqual([run.state, run.failure_code, run.bundle], ['FAILED', 'NO_MATCH', null]);
    assert.match(run.detail, /not evidence of a sole trader/);
    assert.match(run.detail, /the question stays asked/);
    assert.equal(run.detail.replace('not evidence of a sole trader', '').includes('sole trader'), false, 'it called them a sole trader');
    assert.equal(t.seen.length, 1, 'it went on after no match');
    app.close();
  });

  test('a company number on the record is an exact key: no search is made', async () => {
    const { app, t, ctx } = await rig(chFixtures());
    const run = await C.runConnector(companiesHouse, ctx, { name: 'anything at all', company_number: '9999991' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED');
    assert.equal(t.seen.some((s) => s.url.includes('/search/')), false);
    app.close();
  });

  test('FILLETED AND PICTURE-ONLY ACCOUNTS ARE ORDINARY OUTCOMES: READ, not an error, and the panel says what they can tell us', async () => {
    const pdf = await rig(chFixtures());
    const a = await C.runConnector(companiesHouse, pdf.ctx, { name: 'x', company_number: '09999991' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(a.state, 'FIRED');
    assert.deepEqual(a.bundle?.facts['accounts_filed'], { made_up_to: '2025-03-31', accounts_type: 'total-exemption-full', profit_and_loss_on_record: null, machine_readable: false });
    assert.match(a.detail, /may leave out the profit and loss account/);
    assert.match(a.detail, /filed as a picture/);
    pdf.app.close();

    const ix = await rig(chFixtures('ch-filing-accounts.json', 'ch-document-ixbrl.json'));
    const b = await C.runConnector(companiesHouse, ix.ctx, { name: 'x', company_number: '09999991' }, ALLOWED, KEYS, ALL_ON);
    assert.equal((b.bundle?.facts['accounts_filed'] as { machine_readable: boolean }).machine_readable, true);
    ix.app.close();

    const paper = await rig(chFixtures('ch-filing-micro-paper.json'));
    const c = await C.runConnector(companiesHouse, paper.ctx, { name: 'x', company_number: '09999991' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(c.state, 'FIRED');
    assert.deepEqual(c.bundle?.facts['accounts_filed'], { made_up_to: '2025-03-31', accounts_type: 'micro-entity', profit_and_loss_on_record: false, machine_readable: false });
    assert.equal(paper.t.seen.some((s) => s.url.includes('/document/')), false, 'a paper filing sent us to the Document API');
    paper.app.close();

    // No filleted flag is published, so none is asserted: a small company's type reads "not known", never "filed".
    assert.equal(readAccounts({ items: [{ category: 'accounts', description: 'accounts-with-accounts-type-small' }] }, null)?.profit_and_loss_on_record, null);
  });

  test('a filing history that fails does not undo the company: READ, the facts kept, and it says the filings could not be read', async () => {
    const { app, ctx } = await rig({ 'GET /company/09999991': ok('ch-profile.json'), 'GET /company/09999991/filing-history': { status: 503, body: '{}' } });
    const run = await C.runConnector(companiesHouse, ctx, { name: 'x', company_number: '09999991' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED');
    assert.match(run.detail, /filings could not be read/);
    assert.equal(run.bundle?.facts['accounts_filed'], undefined);
    app.close();
  });

  test('PSC: the name kept under exception 1 with kind, control and date ceased — never a birth date or an address; the one door accepts it', async () => {
    const { app, ctx } = await rig({ 'GET /company/09999991/persons-with-significant-control': ok('ch-psc.json') });
    const run = await C.runConnector(companiesHousePsc, ctx, { company_number: '09999991' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED');
    assert.equal(run.bundle?.records.length, 1);
    const f = run.bundle?.records[0]?.fields ?? {};
    assert.deepEqual(Object.keys(f).sort(), ['company_number', 'psc_kind', 'psc_name', 'psc_natures_of_control']);
    assert.equal(JSON.stringify(run.bundle).includes('1970'), false, 'a birth year was kept');
    assert.equal(JSON.stringify(run.bundle).includes('Invented Lane'), false, 'an address was kept');
    assert.equal(run.bundle?.records[0]?.entityId, '09999991/psc/1', 'the entity id names the person');
    assert.match(run.detail, /1 more is listed with no name/);
    app.close();
  });

  test('PSC IS NEVER ASKED BEFORE A SIGNED ENGAGEMENT: the gate keeps it NOT_PERMITTED_YET, so no connector is handed it', async () => {
    const app = await testApp();
    const r = await seed(app.db, app.hasher, app.now);
    const t = fixtureTransport({ 'GET /company/09999991/persons-with-significant-control': ok('ch-psc.json') });
    const entry = R.catalogue().find((e) => e.source_id === 'CH_PSC')!;
    const decided = R.stateUnderGates(entry, 'NOT_RUN', { open: true, requires: 'x' }, { signed: false, letter_state: 'SENT', signed_at: null, why: 'not signed' });
    assert.equal(decided.state, 'NOT_PERMITTED_YET');
    const out = await R.consultAllowed({ db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS, switches: ALL_ON } },
      actor('ADMIN'), r.businesses[0]!.id, [{ entry, ...decided }], { free_gate_open: true, engagement_signed: false });
    assert.equal(out[0]?.state, 'NOT_PERMITTED_YET');
    assert.equal(t.seen.length, 0);
    app.close();
  });
});

/* ================================================================== *
 * 3 · CQC
 * ================================================================== */

describe('CQC: the key in its header; searched by council area because the API has no postcode filter; England only', () => {
  const cqcFixtures = {
    'GET /public/v1/locations': ok('cqc-locations.json'),
    'GET /public/v1/locations/1-INVENTED01': ok('cqc-location-01.json'),
    'GET /public/v1/locations/1-INVENTED02': ok('cqc-location-02.json'),
    'GET /public/v1/providers/1-INVPROV01': ok('cqc-provider.json'),
  };
  const q = (over: Partial<Parameters<typeof cqc.lookup>[1]> = {}) => ({ property: PROPERTY, nation: 'england' as const, sector: 'care_homes', council: 'Nowhere', company_number: '09999991', ...over });

  test('the council’s locations, blocked on the postcode, scored on their addresses: the match’s registration kept, never a name', async () => {
    const { app, t, ctx } = await rig(cqcFixtures);
    const run = await C.runConnector(cqc, ctx, q(), ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED');
    const paths = t.seen.map((s) => new URL(s.url).pathname);
    assert.deepEqual(paths, ['/public/v1/locations', '/public/v1/locations/1-INVENTED01', '/public/v1/locations/1-INVENTED02', '/public/v1/providers/1-INVPROV01']);
    assert.equal(new URL(t.seen[0]!.url).searchParams.get('localAuthority'), 'Nowhere');
    assert.equal(paths.includes('/public/v1/locations/1-INVENTED03'), false, 'a location at another postcode was fetched');
    for (const s of t.seen) {
      assert.equal(s.headers['Ocp-Apim-Subscription-Key'], 'cqc-fixture-key-146c');
      assert.equal(new URL(s.url).host, 'api.service.cqc.org.uk');
      assert.equal(/partnerCode/i.test(s.url), false);
    }
    assert.deepEqual(run.bundle?.records[0]?.fields, {
      cqc_location_id: '1-INVENTED01', cqc_provider_id: '1-INVPROV01', registration_status: 'Registered', registration_date: '2014-06-01',
      beds_registered: 40, regulated_activities: 'Accommodation for persons who require nursing or personal care',
      service_types: 'Care home service with nursing', specialisms: 'Dementia, Physical disabilities',
    });
    const all = JSON.stringify(run.bundle);
    for (const name of ['Invented Care Home', 'Manager', 'Director', 'Zedford']) assert.equal(all.includes(name), false, `${name} was kept`);
    app.close();
  });

  test('a provider named with a different company is flagged for a person, and nothing about it is kept', async () => {
    const { app, ctx } = await rig(cqcFixtures);
    const run = await C.runConnector(cqc, ctx, q({ company_number: '01234567' }), ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED');
    assert.match(run.detail, /says another company runs it/);
    app.close();
  });

  test('NOT ENGLAND, NOT ASKED; NO COUNCIL AREA, NO SEARCH — and neither sends anything', async () => {
    const { app, t, ctx } = await rig(cqcFixtures);
    const wales = await C.runConnector(cqc, ctx, q({ nation: 'wales' }), ALLOWED, KEYS, ALL_ON);
    assert.deepEqual([wales.state, wales.readiness], ['NOT_RUN', 'READY']);
    assert.match(wales.detail, /covers England only/);
    const unknown = await C.runConnector(cqc, ctx, q({ nation: null }), ALLOWED, KEYS, ALL_ON);
    assert.equal(unknown.state, 'NOT_RUN');
    const nocouncil = await C.runConnector(cqc, ctx, q({ council: null }), ALLOWED, KEYS, ALL_ON);
    assert.deepEqual([nocouncil.state, nocouncil.failure_code], ['FAILED', 'INSUFFICIENT_INPUT']);
    assert.match(nocouncil.detail, /only be searched by council area, not by postcode/);
    assert.equal(t.seen.length, 0);
    app.close();
  });

  test('beds: absent stays absent, never 0 (N4)', () => {
    assert.equal(locationFields({ locationId: '1-X' })?.['beds_registered'], undefined);
    assert.equal(locationFields({ locationId: '1-X', numberOfBeds: 0 })?.['beds_registered'], 0);
  });

  // PHASE 155 (lines 1-2), 4 October 2026: built, from each regulator's downloaded list on this server — so this test now
  // asserts the opposite of what it did, and test/phase155.test.ts proves what they do.
  test('CIW and the Care Inspectorate are built (Phase 155), and the panel no longer calls them unbuilt', () => {
    assert.ok(FREE_CONNECTORS['CIW'] !== undefined && FREE_CONNECTORS['CARE_INSPECTORATE'] !== undefined);
    assert.equal(NOT_BUILT['CIW'], undefined);
  });
});

/* ================================================================== *
 * 4 · ENERGY CERTIFICATES
 * ================================================================== */

describe('energy certificates: non-domestic and display, domestic for supported living; England and Wales only', () => {
  test('the latest certificate at the matched address is fetched, and only its figures are kept', async () => {
    const { app, t, ctx } = await rig({
      'GET /api/non-domestic/search': ok('epc-nondomestic-search.json'),
      'GET /api/display/search': { status: 404, body: fx('epc-not-found.json') },
      'GET /api/certificate': ok('epc-certificate-nondomestic.json'),
    });
    const run = await C.runConnector(epc, ctx, { property: PROPERTY, nation: 'england', sector: 'care_homes' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.deepEqual(t.seen.map((s) => new URL(s.url).pathname), ['/api/non-domestic/search', '/api/display/search', '/api/certificate']);
    assert.equal(new URL(t.seen[2]!.url).searchParams.get('certificate_number'), '0000-0000-0000-0000-0002', 'not the latest at the address');
    for (const s of t.seen) {
      assert.equal(s.headers.authorization, 'Bearer epc-fixture-token-146c');
      assert.equal(new URL(s.url).host, 'api.get-energy-performance-data.communities.gov.uk');
    }
    assert.deepEqual(run.bundle?.records[0]?.fields, {
      epc_rrn: '0000-0000-0000-0000-0002', epc_total_floor_area_m2: 1240,
      epc_property_type: 'C2 Residential Institutions - Residential care homes, hospitals, nursing homes', epc_lodgement_date: '2023-06-12',
    });
    assert.equal(JSON.stringify(run.bundle).includes('Invented Assessor'), false, 'the assessor was kept');
    assert.equal(JSON.stringify(run.bundle).includes('Invented Road'), false, 'an address line was kept');
    app.close();
  });

  test('supported living asks the domestic register too; its coded age band and tenure are not kept undecoded', async () => {
    assert.deepEqual(registersFor('supported_living'), ['non-domestic', 'display', 'domestic']);
    assert.deepEqual(registersFor('dental'), ['non-domestic', 'display']);
    const { app, ctx } = await rig({
      'GET /api/non-domestic/search': { status: 404, body: '{}' }, 'GET /api/display/search': { status: 404, body: '{}' },
      'GET /api/domestic/search': ok('epc-domestic-search.json'), 'GET /api/certificate': ok('epc-certificate-domestic.json'),
    });
    const run = await C.runConnector(epc, ctx, { property: HOME, nation: 'england', sector: 'supported_living' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.deepEqual(run.bundle?.records[0]?.fields, { epc_rrn: '1111-0000-0000-0000-0001', epc_total_floor_area_m2: 142, epc_property_type: 'Detached house', epc_lodgement_date: '2025-04-04' });
    app.close();
  });

  test('nothing found in any register is NO_MATCH, not an error; Scotland is not asked; a REVIEW fetches no certificate', async () => {
    const none = await rig({ 'GET /api/non-domestic/search': { status: 404, body: '{}' }, 'GET /api/display/search': { status: 404, body: '{}' } });
    const a = await C.runConnector(epc, none.ctx, { property: PROPERTY, nation: 'england', sector: 'gp' }, ALLOWED, KEYS, ALL_ON);
    assert.deepEqual([a.state, a.failure_code], ['FAILED', 'NO_MATCH']);
    const b = await C.runConnector(epc, none.ctx, { property: PROPERTY, nation: 'scotland', sector: 'gp' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(b.state, 'NOT_RUN');
    assert.match(b.detail, /England or Wales/);
    none.app.close();

    const near = await rig({ 'GET /api/non-domestic/search': ok('epc-nondomestic-search.json'), 'GET /api/display/search': { status: 404, body: '{}' } });
    // 16 Invented Road scores 0.84 against both 12 and 14: REVIEW, never a guess between them.
    const c = await C.runConnector(epc, near.ctx, { property: { ...PROPERTY, address_line_1: '16 Invented Road' }, nation: 'england', sector: 'gp' }, ALLOWED, KEYS, ALL_ON);
    assert.equal(c.failure_code, 'MATCH_REVIEW');
    assert.notEqual(c.state, 'FIRED');
    assert.equal(near.t.seen.some((s) => s.url.includes('/api/certificate')), false, 'a certificate was fetched without an ACCEPT');
    near.app.close();
  });
});

/* ================================================================== *
 * 5 · SALE PRICES
 * ================================================================== */

describe('HM Land Registry sale prices: every sector (Phase 159g), the latest sale at the address, the attribution word for word', () => {
  test('PHASE 159g (L11): every sector is asked — a care home, a dental practice, a surgery and a hospital too; a nation not known is not', async () => {
    const { app, t, ctx } = await rig({ 'GET /data/ppi/transaction-record.json': ok('ppd-transactions.json') });
    for (const sector of ['care_homes', 'dental', 'gp', 'private_hospital', null]) {
      const run = await C.runConnector(pricePaid, ctx, { property: HOME, nation: 'england', sector }, ALLOWED, emptySecrets(), ALL_ON);
      assert.equal(run.state, 'FIRED', String(sector));
      // The fixture's sale is category B: kept, and said to be a lead for the surveyor, not the price.
      assert.equal(run.bundle?.records[0]?.fields['ppd_category'], 'B', String(sector));
      assert.match(run.detail, /a lead for the surveyor to confirm, not the price/);
    }
    assert.equal(t.seen.length, 5);
    const none = await C.runConnector(pricePaid, ctx, { property: HOME, nation: null, sector: 'gp' }, ALLOWED, emptySecrets(), ALL_ON);
    assert.notEqual(none.state, 'FIRED');
    assert.equal(t.seen.length, 5);
    app.close();
  });

  test('supported living: the latest sale at the matched address, its date made ISO, its tenure read', async () => {
    const { app, t, ctx } = await rig({ 'GET /data/ppi/transaction-record.json': ok('ppd-transactions.json') });
    const run = await C.runConnector(pricePaid, ctx, { property: HOME, nation: 'england', sector: 'supported_living' }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.equal(new URL(t.seen[0]!.url).searchParams.get('propertyAddress.postcode'), 'ZZ3 3ZZ');
    assert.deepEqual(run.bundle?.records[0], {
      sourceId: 'HMLR_PPD', entityId: 'INVENTED-TX-0002',
      fields: { price_paid: 465000, transaction_date: '2021-10-11', tenure: 'freehold', property_type_ppd: 'detached', new_build_flag: false, ppd_category: 'B' },
    });
    assert.equal(run.bundle?.facts['attribution'], PRICE_PAID_ATTRIBUTION);
    assert.ok(run.detail.includes(PRICE_PAID_ATTRIBUTION));
    assert.equal(isoDate('Thu, 19 Sep 2013'), '2013-09-19');
    assert.equal(isoDate('19/09/2013'), null);
    app.close();
  });

  test('THE ATTRIBUTION IS HM LAND REGISTRY’S, VERBATIM, 2021 AND ALL — read from the licence register, never retyped', () => {
    assert.equal(PRICE_PAID_ATTRIBUTION,
      'Contains HM Land Registry data © Crown copyright and database right 2021. This data is licensed under the Open Government Licence v3.0.');
    assert.equal(LICENCES.find((l) => l.licence_id === 'HMLR_PPD')?.attribution_text, PRICE_PAID_ATTRIBUTION);
    assert.equal(readFileSync(join(SRC, 'connectors', 'price-paid.ts'), 'utf8').includes("'Contains HM Land Registry"), false, 'the words were retyped');
  });

  test('THE SURVEYOR NEVER RECEIVES THE PRICE: a sale price is an amount agreed between buyer and seller, so it waits with our estimate', async () => {
    const app = await testApp();
    await seed(app.db, app.hasher, app.now);
    const job = app.db.get<{ id: string; business_id: string; surveyor_id: string }>('SELECT id, business_id, surveyor_id FROM surveyor_jobs WHERE surveyor_id IS NOT NULL ORDER BY id LIMIT 1');
    assert.ok(job, 'the seed has no surveyor job');
    ingestRegisterRecord(app.db, newId, app.now, job.business_id, {
      sourceId: 'HMLR_PPD', entityId: 'INVENTED-TX-9',
      fields: { price_paid: 465000, transaction_date: '2021-10-11', tenure: 'freehold' },
    });
    const p = S.payloadFor({ db: app.db, audit: app.audit, now: app.now, newId }, actor('SURVEYING', job.surveyor_id), job.id);
    const ppd = p.register_records.find((r) => r.source_id === 'HMLR_PPD');
    assert.ok(ppd, 'the sale record did not reach the surveyor at all');
    assert.deepEqual(ppd.fields, { transaction_date: '2021-10-11', tenure: 'freehold' });
    assert.equal(JSON.stringify(p).includes('465000'), false, 'the price reached the surveyor');
    assert.deepEqual(S.REGISTER_AMOUNTS_WITHHELD['HMLR_PPD'], ['price_paid']);
    app.close();
  });

  test('WHEREVER A PRICE PAID IS SHOWN, THE ATTRIBUTION IS SHOWN WITH IT: every screen that draws register records carries it', () => {
    // The two screens that draw a register record's values: the client page's checks (approvals) and the surveyor's evidence.
    assert.match(readFileSync(join(SRC, 'web', 'approvals.ts'), 'utf8'), /attribution: registerAttribution\(r\.source_id\)/);
    assert.match(readFileSync(join(SRC, 'web', 'approvals-pages.ts'), 'utf8'), /f\.attribution/);
    assert.match(readFileSync(join(SRC, 'web', 'surveyor-pages.ts'), 'utf8'), /registerAttribution\(r\.source_id\)/);
    assert.equal(R.registerAttribution('HMLR_PPD'), PRICE_PAID_ATTRIBUTION);
    assert.equal(R.registerAttribution('NOT_A_SOURCE'), null);
  });
});

/* ================================================================== *
 * 6 · PLANNING
 * ================================================================== */

describe('planning: planning.data.gov.uk first, then PlanIt at its one request a minute — five fields, never a person', () => {
  test('nothing on planning.data.gov.uk: PlanIt is asked with our identifier, and the matched address’s applications are kept', async () => {
    const { app, t, ctx } = await rig({ 'GET /entity.json': ok('planning-data-empty.json'), 'GET /api/applics/json': ok('planit-applics.json') });
    const run = await C.runConnector(planning, ctx, { property: PROPERTY, nation: 'england' }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.deepEqual(t.seen.map((s) => new URL(s.url).host), ['www.planning.data.gov.uk', 'www.planit.org.uk']);
    assert.equal(t.seen[1]!.headers['user-agent'], PLANIT_USER_AGENT);
    assert.match(PLANIT_USER_AGENT, /@/);
    const refs = run.bundle?.records.map((r) => r.entityId);
    assert.deepEqual(refs, ['23/00911/ADV', '19/00042/FUL'], 'the neighbour’s application was kept, or the order is wrong');
    for (const r of run.bundle?.records ?? []) {
      for (const k of Object.keys(r.fields)) assert.equal(classifyField('PLANNING', k).kind, 'kept', k);
    }
    const all = JSON.stringify(run.bundle);
    for (const name of ['Applicant', 'Agents', 'Officer', 'Neighbour']) assert.equal(all.includes(name), false, `${name} was kept`);
    app.close();
  });

  test('a match on planning.data.gov.uk does not spend a PlanIt request', async () => {
    const { app, t, ctx } = await rig({ 'GET /entity.json': ok('planning-data-hit.json'), 'GET /api/applics/json': ok('planit-applics.json') });
    const run = await C.runConnector(planning, ctx, { property: PROPERTY, nation: 'england' }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(run.state, 'FIRED', run.detail);
    assert.equal(t.seen.length, 1);
    assert.deepEqual(run.bundle?.records[0]?.fields, {
      planning_reference: 'ZZ/21/00001/FUL', planning_decision: 'approved', planning_decision_date: '2021-06-30',
      planning_received_date: '2021-03-02', planning_description: 'Two storey side extension to care home',
    });
    app.close();
  });

  test('PLANIT’S OWN LIMITS: one request a minute and 300 a day, one try only — a second call inside the minute is not made', async () => {
    const p = CALL_POLICIES['PLANNING']!;
    assert.deepEqual([p.rate.limit, p.rate.window_ms, p.daily_limit, p.max_attempts], [1, 60_000, 300, 1]);
    assert.match(p.rate_basis, /published: one request a minute/);
    let now = 0;
    const app = await testApp();
    const t = fixtureTransport({ 'GET /api/applics/json': ok('planit-applics.json') });
    const d: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(() => now), clock: () => now };
    const call = () => callOutside(d, { service_id: 'PLANNING', endpoint: '/api/applics/json', actor_id: null, claim_id: null, gate: GATE });
    assert.equal((await call()).outcome, 'OK');
    assert.equal((await call()).outcome, 'RATE_LIMITED');
    let made = 1;
    for (let i = 0; i < 400; i++) { now += 61_000; if ((await call()).outcome === 'OK') made++; }
    assert.ok(made <= 300, `${made} calls in a day`);
    assert.equal(t.seen.length, made);
    app.close();
  });
});

/* ================================================================== *
 * 7 · THE ONS POSTCODE TABLE
 * ================================================================== */

describe('the ONS postcode table: read on this server, nothing sent; no Northern Ireland; no table, no lookup', () => {
  test('the council area and the nation, and not one call', async () => {
    const { app, t, ctx } = await rig({});
    const run = await C.runConnector(onsPostcode, ctx, { postcode: 'zz1 1zz', store: STORE }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(run.state, 'FIRED');
    assert.deepEqual(run.bundle, { records: [], facts: { ons_lad_code: 'E06000999', ons_lad_name: 'Nowhere', ons_country_code: 'E92000001' } });
    assert.match(run.detail, /Nothing was sent outside/);
    assert.equal(t.seen.length, 0);
    const ni = await C.runConnector(onsPostcode, ctx, { postcode: 'BT1 1AA', store: STORE }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(ni.state, 'NOT_RUN');
    assert.match(ni.detail, /Northern Ireland/);
    const none = await C.runConnector(onsPostcode, ctx, { postcode: 'ZZ1 1ZZ', store: null }, ALLOWED, emptySecrets(), ALL_ON);
    assert.equal(none.state, 'NOT_RUN');
    assert.match(none.detail, /not set up here yet/);
    app.close();
  });
});

/* ================================================================== *
 * 8 · "RUN THE RESEARCH" — the connectors behind the gates
 * ================================================================== */

describe('"Run the research" runs a connector only for what the gates allow — and today they allow nothing', () => {
  const EVERYTHING = {
    'GET /search/companies': ok('ch-search.json'), 'GET /company/09999991': ok('ch-profile.json'),
    'GET /company/09999991/filing-history': ok('ch-filing-accounts.json'), 'GET /document/INVENTED-DOC-1': ok('ch-document-pdf.json'),
    'GET /company/09999991/persons-with-significant-control': ok('ch-psc.json'),
    'GET /public/v1/locations': ok('cqc-locations.json'), 'GET /public/v1/locations/1-INVENTED01': ok('cqc-location-01.json'),
    'GET /public/v1/locations/1-INVENTED02': ok('cqc-location-02.json'), 'GET /public/v1/providers/1-INVPROV01': ok('cqc-provider.json'),
    'GET /api/non-domestic/search': ok('epc-nondomestic-search.json'), 'GET /api/display/search': { status: 404, body: '{}' },
    'GET /api/certificate': ok('epc-certificate-nondomestic.json'),
    'GET /entity.json': ok('planning-data-empty.json'), 'GET /api/applics/json': ok('planit-applics.json'),
  };

  async function client(app: Awaited<ReturnType<typeof testApp>>): Promise<string> {
    const r = await seed(app.db, app.hasher, app.now);
    const id = r.businesses[0]!.id;
    app.db.run("UPDATE businesses SET name = 'Zedford Care Homes', legal_name = NULL, company_number = NULL, sector = 'care_homes' WHERE id = ?", [id]);
    const p = app.db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', [id]);
    if (p === undefined) {
      app.db.run("INSERT INTO properties (id, business_id, label, postcode, created_at) VALUES (?, ?, 'Main site', 'ZZ1 1ZZ', ?)", [newId(), id, app.now()]);
    }
    app.db.run("UPDATE properties SET address_line_1 = '12 Invented Road', address_line_2 = NULL, town = 'Nowhere', postcode = 'ZZ1 1ZZ', jurisdiction = 'england' WHERE business_id = ?", [id]);
    return id;
  }

  test('THE FREE GATE IS SHUT: with every key, every recorded answer and every switch on, the button sends NOTHING and fires nothing', async () => {
    const app = await testApp();
    const id = await client(app);
    const t = fixtureTransport(EVERYTHING);
    const before = app.db.all('SELECT id FROM register_records').length;
    const d = { db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS, switches: ALL_ON, postcodeStore: STORE } };
    const admin = app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1")!.id;
    const out = await R.runResearch(d, actor('ADMIN', admin), id);
    assert.equal(registryGate().enabled, false);
    assert.deepEqual([out.ok, out.fired, out.failed], [true, 0, 0]);
    assert.equal(t.seen.length, 0, 'a call was made with the free gate shut');
    assert.equal(app.db.all('SELECT id FROM register_records').length, before);
    for (const s of R.sourcesFor(app.db, actor('ADMIN'), id).sources.filter((x) => x.tier === 'FREE')) {
      assert.equal(s.state, 'NOT_PERMITTED_YET', s.source_id);
      assert.equal(s.retrieved_at, null);
    }
    app.close();
  });

  test('the route passes the app’s key file and transport; the key file is read ONCE, at start-up, into the app', async () => {
    const pages = readFileSync(join(SRC, 'web', 'engaged-pages.ts'), 'utf8');
    assert.match(pages, /await R\.runResearch\(\{ \.\.\.deps, outside: \{ transport: d\.app\.outside, secrets: d\.app\.secrets \} \}/);
    assert.match(pages, /await R\.retryFailedSource\(\{ \.\.\.deps, outside: \{ transport: d\.app\.outside, secrets: d\.app\.secrets \} \}/);
    const app = await buildApp({ hasher: fakeHasher(), now: fixedClock() });
    assert.equal(app.secrets.state, 'NO_FILE', 'the test runner read this machine’s key file');
    assert.deepEqual(app.secrets.names(), []);
    app.close();
    const keyed = await buildApp({ hasher: fakeHasher(), now: fixedClock(), secrets: KEYS });
    assert.equal(keyed.secrets, KEYS);
    keyed.close();
    // No module reads the key file per request: loadSecrets/processSecrets are called at start-up (app.ts) and by the
    // four modules that already read it when asked (analytics, the two mail stubs) — and by no connector.
    // (claude.ts, Phase 146e's, takes the store as a default argument; the register connectors take it from the app.)
    for (const f of readdirSync(join(SRC, 'connectors')).filter((n) => n.endsWith('.ts') && n !== 'claude.ts')) {
      assert.equal(/\b(loadSecrets|processSecrets)\(/.test(readFileSync(join(SRC, 'connectors', f), 'utf8')), false, `${f} reads the key file`);
    }
  });

  test('ALLOWED, SWITCHED ON AND KEYED (as a test hands it): FIRED with the time read, stored only through the one door, into derive()’s names', async () => {
    const app = await testApp();
    const id = await client(app);
    const t = fixtureTransport(EVERYTHING);
    const d = { db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS, switches: ALL_ON, postcodeStore: STORE } };
    const cat = R.catalogue();
    const decided = ['ONS_POSTCODE', 'CH_COMPANY', 'CQC', 'EPC', 'HMLR_PPD', 'PLANNING', 'CIW', 'VOA'].map((sid) => ({ entry: cat.find((e) => e.source_id === sid)!, ...ALLOWED }));
    const out = await R.consultAllowed(d, actor('ADMIN'), id, decided, { free_gate_open: true, engagement_signed: false });
    const by = Object.fromEntries(out.map((o) => [o.entry.source_id, o]));
    assert.deepEqual(Object.fromEntries(out.map((o) => [o.entry.source_id, o.state])), {
      ONS_POSTCODE: 'FIRED', CH_COMPANY: 'FIRED', CQC: 'FIRED', EPC: 'FIRED', HMLR_PPD: 'FAILED', PLANNING: 'FIRED', CIW: 'NOT_RUN', VOA: 'NOT_RUN',
    });
    // PHASE 159g (L11): Price Paid is asked for a care home too. This fixture set holds no answer for it, so it fails,
    // and says so; it is no longer "homes only".
    assert.doesNotMatch(by['HMLR_PPD']!.detail, /homes only/);
    // Phase 155: the Welsh regulator has a connector now; this client's property is in England, so it is not asked.
    assert.match(by['CIW']!.detail, /not in Wales/);
    app.db.tx(() => R.storeResearchOutcomes(d, id, out, app.now()));
    const rows = app.db.all<{ source_id: string; state: string; fired_at: string | null; retrieved_at: string | null; failure_code: string | null }>(
      'SELECT source_id, state, fired_at, retrieved_at, failure_code FROM research_sources WHERE business_id = ?', [id]);
    for (const r of rows.filter((x) => x.state === 'FIRED')) assert.ok(r.fired_at && r.retrieved_at, `${r.source_id} FIRED with no time`);
    for (const r of rows.filter((x) => x.state !== 'FIRED')) assert.equal(r.retrieved_at, null, `${r.source_id} has a retrieval it never made`);
    const bundle = E.registerBundle(app.db, id);
    assert.equal(bundle['epc']?.['floor_area_m2'], 1240);
    assert.equal(bundle['cqc']?.['bed_count'], 40);
    assert.equal(bundle['companies_house']?.['year_end'], '03-31');
    assert.equal(bundle['epc']?.['epc_total_floor_area_m2'], undefined, 'a register name reached derive()');
    // derive() is still switched off: every question it would retire stays asked.
    const derived = REGISTRY.derive(bundle, { sector: 'care_homes' });
    assert.equal(derived.enabled, false);
    assert.deepEqual(derived.values, {});
    // Stored twice is kept once.
    const n = app.db.all('SELECT id FROM register_records WHERE business_id = ?', [id]).length;
    app.db.tx(() => R.storeResearchOutcomes(d, id, out, app.now()));
    assert.equal(app.db.all('SELECT id FROM register_records WHERE business_id = ?', [id]).length, n);
    app.close();
  });

  test('SWITCHED OFF (as shipped) or with no key: allowed, and still nothing is sent — the panel says which', async () => {
    const app = await testApp();
    const id = await client(app);
    const t = fixtureTransport(EVERYTHING);
    const entry = R.catalogue().find((e) => e.source_id === 'EPC')!;
    const off = await R.consultAllowed({ db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS } }, actor('ADMIN'), id,
      [{ entry, ...ALLOWED }], { free_gate_open: true, engagement_signed: false });
    assert.equal(off[0]?.state, 'NOT_RUN');
    assert.match(off[0]?.detail ?? '', /not switched on/);
    const nokey = await R.consultAllowed({ db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: emptySecrets(), switches: ALL_ON } }, actor('ADMIN'), id,
      [{ entry, ...ALLOWED }], { free_gate_open: true, engagement_signed: false });
    assert.match(nokey[0]?.detail ?? '', /EPC_API_TOKEN/);
    const nooutside = await R.consultAllowed({ db: app.db, audit: app.audit, now: app.now, newId }, actor('ADMIN'), id,
      [{ entry, ...ALLOWED }], { free_gate_open: true, engagement_signed: false });
    assert.equal(nooutside[0]?.state, 'NOT_RUN');
    assert.equal(t.seen.length, 0);
    app.close();
  });

  test('a lookup that FAILED keeps its reason and no facts — and the order runs the postcode table first, the company before its people', async () => {
    const app = await testApp();
    const id = await client(app);
    const t = fixtureTransport({ 'GET /api/non-domestic/search': { status: 500, body: '{}' } });
    const d = { db: app.db, audit: app.audit, now: app.now, newId, outside: { transport: t, secrets: KEYS, switches: ALL_ON, postcodeStore: STORE } };
    const entry = R.catalogue().find((e) => e.source_id === 'EPC')!;
    const out = await R.consultAllowed(d, actor('ADMIN'), id, [{ entry, ...ALLOWED }], { free_gate_open: true, engagement_signed: false });
    assert.deepEqual([out[0]?.state, out[0]?.failure_code, out[0]?.bundle], ['FAILED', 'HTTP_ERROR', null]);
    app.db.tx(() => R.storeResearchOutcomes(d, id, out, app.now()));
    const row = app.db.get<{ failure_code: string; retrieved_at: string | null }>("SELECT failure_code, retrieved_at FROM research_sources WHERE business_id = ? AND source_id = 'EPC'", [id]);
    assert.deepEqual({ ...row }, { failure_code: 'HTTP_ERROR', retrieved_at: null });
    const order = runOrder(['EPC', 'CH_PSC', 'CQC', 'CH_COMPANY', 'ONS_POSTCODE', 'VOA']);
    assert.equal(order[0], 'ONS_POSTCODE');
    assert.ok(order.indexOf('CH_COMPANY') < order.indexOf('CH_PSC'));
    assert.equal(order[order.length - 1], 'VOA');
    assert.equal(researchSubject(app.db, id).property?.jurisdiction, 'england');
    app.close();
  });
});

/* ================================================================== *
 * 9 · THE MAPPINGS, THE REGISTER, THE STAMP, THE SWITCHES
 * ================================================================== */

describe('only fields both registers permit; the supplier docs recorded and dated; every switch off and stamped', () => {
  test('DERIVE_FIELD_OF maps only a field the source register permits, the name exclusion register keeps, and CB_REGISTRY lists', () => {
    for (const [source, names] of Object.entries(DERIVE_FIELD_OF)) {
      const src = REGISTER_SOURCES.find((s) => s.source_id === source);
      assert.ok(src, source);
      const key = R.REGISTRY_ID_OF[source];
      assert.ok(key, `${source} has no CB_REGISTRY source`);
      const cbFields = (REGISTRY.SOURCES[key] as unknown as { fields: string[] }).fields;
      for (const [from, to] of Object.entries(names)) {
        assert.ok(src.permitted_fields.includes(from), `${source}.${from} is not permitted by the source register`);
        assert.equal(classifyField(source, from).kind, 'kept', `${source}.${from} is not kept by the name exclusion register`);
        assert.ok(cbFields.includes(to), `${to} is not a CB_REGISTRY field on ${key}`);
      }
    }
  });

  test('EVERY FIELD A CONNECTOR KEEPS IS ONE THE ONE DOOR ACCEPTS — the fields each fixture run produced, checked against the name exclusion register', () => {
    const fields: Record<string, string[]> = {
      CH_COMPANY: ['company_number', 'company_status', 'sic_codes', 'accounts_year_end', 'incorporation_date', 'accounts_type', 'accounts_made_up_to'],
      CH_PSC: ['psc_name', 'psc_kind', 'psc_natures_of_control', 'psc_ceased_on', 'company_number'],
      CQC: ['cqc_location_id', 'cqc_provider_id', 'registration_status', 'registration_date', 'beds_registered', 'regulated_activities', 'service_types', 'specialisms'],
      EPC: ['epc_rrn', 'epc_total_floor_area_m2', 'epc_property_type', 'epc_lodgement_date'],
      HMLR_PPD: ['price_paid', 'transaction_date', 'tenure', 'property_type_ppd', 'new_build_flag', 'ppd_category'],
      PLANNING: ['planning_reference', 'planning_decision', 'planning_decision_date', 'planning_received_date', 'planning_description'],
    };
    for (const [source, list] of Object.entries(fields)) {
      const src = REGISTER_SOURCES.find((s) => s.source_id === source)!;
      assert.ok(NAME_EXCLUSION_POLICY.some((p) => p.sourceId === source), source);
      for (const f of list) {
        assert.ok(src.permitted_fields.includes(f), `${source}.${f} not permitted`);
        assert.notEqual(classifyField(source, f).kind, 'unclassified', `${source}.${f} unclassified`);
        assert.notEqual(classifyField(source, f).kind, 'name_excluded', `${source}.${f} excluded`);
      }
    }
  });

  test('THE SOURCE REGISTER: the EPC endpoint is the API host; CQC’s cache window is 30 days in the test system (Phase 153c); every service row’s address is in SUPPLIER_DOCS, dated', () => {
    assert.equal(REGISTER_SOURCES.find((s) => s.source_id === 'EPC')?.endpoint, 'https://api.get-energy-performance-data.communities.gov.uk');
    assert.equal(LICENCES.find((l) => l.licence_id === 'CQC_SYNDICATION')?.cache_max_age_days, 30);
    // This phase's sources. The paid lookups' rows (Homedata, the title register) are Phase 146d's to document.
    for (const p of Object.values(CALL_POLICIES)) {
      if (p.register_source === null || p.base_url === null || FREE_CONNECTORS[p.register_source] === undefined) continue;
      const d = SUPPLIER_DOCS.find((x) => x.source_id === p.register_source);
      assert.ok(d, `${p.service_id}: no supplier docs for ${p.register_source}`);
      assert.ok(d.api_base.includes(p.base_url), `${p.service_id}: ${p.base_url} is not in the docs read`);
    }
    for (const sid of Object.keys(FREE_CONNECTORS)) {
      const d = SUPPLIER_DOCS.find((x) => x.source_id === sid);
      assert.ok(d, `${sid} was built without its documentation recorded`);
      // Phase 155 read the Welsh and Scottish regulators' terms on 4 October 2026, before building them.
      assert.equal(d.read_on, ['CIW', 'CARE_INSPECTORATE'].includes(sid) ? '2026-10-04' : '2026-09-23', sid);
      assert.ok(d.docs.length > 0 && d.docs.every((u) => u.startsWith('https://')));
    }
  });

  test('THE CQC RATE LIMIT SAYS IT IS UNPUBLISHED; Companies House’s two APIs share the key’s 600', async () => {
    assert.match(CALL_POLICIES['CQC']!.rate_basis, /NOT PUBLISHED/);
    assert.equal(CALL_POLICIES['COMPANIES_HOUSE']!.rate_bucket, 'COMPANIES_HOUSE');
    assert.equal(CALL_POLICIES['COMPANIES_HOUSE_DOCUMENTS']!.rate_bucket, 'COMPANIES_HOUSE');
    const app = await testApp();
    const t = fixtureTransport({});
    const d: CallDeps = { audit: app.audit, now: app.now, transport: t, limiter: new RateLimiter(() => 0), clock: () => 0 };
    for (let i = 0; i < 300; i++) await callOutside(d, { service_id: 'COMPANIES_HOUSE', endpoint: '/x', actor_id: null, claim_id: null, gate: GATE });
    for (let i = 0; i < 300; i++) await callOutside(d, { service_id: 'COMPANIES_HOUSE_DOCUMENTS', endpoint: '/x', actor_id: null, claim_id: null, gate: GATE });
    assert.equal((await callOutside(d, { service_id: 'COMPANIES_HOUSE_DOCUMENTS', endpoint: '/x', actor_id: null, claim_id: null, gate: GATE })).outcome, 'RATE_LIMITED');
    assert.equal(t.seen.length, 600);
    app.close();
  });

  test('a stepped connector cannot call a service it did not declare', async () => {
    const { app, t, ctx } = await rig({});
    const sneaky = C.defineSteppedConnector<null>({
      source_id: 'EPC', service_id: 'EPC', owner: null, needs: [], first: () => ({ endpoint: '/x' }),
      lookup: async (step) => { const c = await step({ service_id: 'COMPANIES_HOUSE', endpoint: '/company/{n}', params: { n: '1' } }); return { kind: 'CALL_FAILED', call: c, calls: [c] }; },
    });
    const run = await C.runConnector(sneaky, ctx, null, ALLOWED, emptySecrets(), ALL_ON);
    assert.deepEqual([run.state, run.failure_code], ['FAILED', 'REFUSED']);
    assert.equal(t.seen.length, 0);
    app.close();
  });

  /* PHASE 146h, 23 September 2026 adds a THIRD map to this reading: PICK_SWITCHES, a person's pick for a close
     match (src/web/match-review.ts). It is not a connector switch and is deliberately not in REGISTER_SWITCHES, so
     the count below carries it by name rather than by accident. */
  test('EVERY SWITCH IS STILL OFF, AND THE CASE STAMP READS EVERY ONE — each lookup’s, the document reader’s and the pick’s', () => {
    for (const [k, v] of Object.entries(C.REGISTER_SWITCHES)) assert.equal(v, false, k);
    const readings = connectorSwitchReadings();
    assert.equal(readings.length,
      Object.keys(C.REGISTER_SWITCHES).length + Object.keys(CLAUDE_SWITCHES).length + Object.keys(PICK_SWITCHES).length);
    for (const k of Object.keys(PICK_SWITCHES)) assert.ok(readings.some((r) => r.switch === `PICK_SWITCHES.${k}` && r.on === false), k);
    for (const k of Object.keys(C.REGISTER_SWITCHES)) assert.ok(readings.some((r) => r.switch === `REGISTER_SWITCHES.${k}` && r.on === false), k);
    for (const k of Object.keys(CLAUDE_SWITCHES)) assert.ok(readings.some((r) => r.switch === `CLAUDE_SWITCHES.${k}` && r.on === false), k);
    const stamp = readFileSync(join(SRC, 'web', 'case-stamp.ts'), 'utf8');
    assert.match(stamp, /connectors: stamp\.connector_switches/);
  });

  test('THE 200-PROPERTY MEASUREMENT IS WRITTEN AND NOT RUN: its self-test holds, it refuses without the officer, and the research flow never measures', () => {
    const out = execFileSync(process.execPath, [join(HERE, '..', 'tools', 'match-measure.ts'), '--self-test'], { encoding: 'utf8' });
    assert.match(out, /every check held/);
    let refused = '';
    try { execFileSync(process.execPath, [join(HERE, '..', 'tools', 'match-measure.ts'), '--run', '/tmp/x.csv', '--out', '/tmp/y.csv', '--db', '/tmp/z.db'], { encoding: 'utf8' }); }
    catch (e) { refused = String((e as { stdout?: string }).stdout ?? ''); assert.equal((e as { status?: number }).status, 2); }
    assert.match(refused, /data protection officer has not yet answered/);
    const subject = { business_id: 'b', name: 'n', company_number: null, sector: 'supported_living', property: PROPERTY };
    for (const [sid, b] of Object.entries(FREE_CONNECTORS)) {
      const q = b.query(subject, new Map(), STORE) as Record<string, unknown>;
      assert.equal('measure' in q, false, `${sid}: the research flow sets a measurement hook`);
    }
  });

  test('every connector key this phase needs is in the key file’s list, and STUBS says the connectors are built and off', () => {
    for (const k of ['COMPANIES_HOUSE_API_KEY', 'CQC_SUBSCRIPTION_KEY', 'EPC_API_TOKEN']) assert.ok(SECRET_KEYS.some((s) => s.name === k), k);
    const row = STUBS.find((s) => s.id === 'registers');
    assert.match(row?.what ?? '', /Phase 146c/);
    assert.match(row?.what ?? '', /switched off/);
  });
});
