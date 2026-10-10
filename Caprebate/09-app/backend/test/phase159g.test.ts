/**
 * PHASE 159g, 10 October 2026 — WHO CLAIMS, AND WHAT THE REGISTERS ALREADY SAY.
 *
 * From the Lockwood Surgery live run of 9 October 2026 (L2, L8, L11) and the stress test's coverage matrix (2.4, 2.5,
 * 3.1, 3.6): the run picked a dormant company as the owner, and the registers held a real sale price and tenure that
 * nobody read. Each test fails on the code before this phase (src/web/who-claims.ts did not exist, so this file does
 * not load on it at all; and each behaviour below was absent):
 *   1  item 1 (L2, L8): "Find this company" shows each match's status AND accounts type; a dormant company is flagged;
 *      the company profile is read on the test website under a waiver (the PSC too, still after signing); the register's
 *      year end is the claim's, compared with the client's
 *   2  item 2: the check is "a qualifying activity — a trade, a profession or a property business"; the assessment asks
 *      who uses the building, and the answer becomes the property's claimant role (owner, landlord, tenant)
 *   3  item 3 (L11): Price Paid is asked for every sector; a category B or "Other" sale is a lead, never the price
 *   4  item 4: tenure filled from the title check or Price Paid, with its source; never over a recorded one
 *   5  item 5: a site area far larger than the building is flagged, never used as the plot
 *   6  item 6: a person named as owner, matched against the client's own people, makes "still owned" YES — the name
 *      never kept
 *   7  item 7: the council area kept on the property, and the pack's BCIS location drafted from it
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp, actor, signatureRecordFor } from './helpers.ts';
import { fixtureTransport } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { searchCompanies, accountsTypeOfProfile } from '../src/connectors/company-search.ts';
import { companyFields, isDormant, DORMANT_WORDS } from '../src/connectors/companies-house.ts';
import { categoryOf } from '../src/connectors/price-paid.ts';
import { TEST_WEBSITE_LOOKUPS, freeGateWaived } from '../src/connectors/registers.ts';
import * as W from '../src/web/who-claims.ts';
import * as F4 from '../src/web/funnel4.ts';
import * as PL from '../src/web/pipeline.ts';
import * as C from '../src/web/crm.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as TH from '../src/web/title-by-hand.ts';
import * as B from '../src/web/bcis-data.ts';
import { answerRows, type FunnelState } from '../src/web/assessment.ts';
import { periodFromYearEnd, yearEndReading } from '../src/web/claim-facts.ts';
import { stillOwned } from '../src/web/claim-route.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T = '2026-10-10T09:00:00.000Z';
const ADMIN = actor('ADMIN');
const SAM = actor('SURVEYING', 'u-sam');
const deps = (app: App) => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });
const json = (v: unknown) => ({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });

function business(app: App, tag: string, o: { claimant_type?: string; sector?: string } = {}): { b: string; p: string } {
  const b = `b-${tag}`, p = `p-${tag}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, `Who ${tag}`, o.sector ?? 'gp', 'SURVEY', T, o.claimant_type ?? 'COMPANY']);
  app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [p, b, '3 Invented Road', 'ZZ1 1ZZ', T]);
  return { b, p };
}
/** A signed engagement letter for the client, as the title check typed by hand needs (business rule 13(c)). */
function signed(app: App, b: string): void {
  app.db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, 'SIGNED', ?, ?)", [randomUUID(), b, T, T]);
  signatureRecordFor(app.db, b, T);
  if (app.db.get('SELECT id FROM users WHERE id = ?', [ADMIN.id]) === undefined) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [ADMIN.id, 'admin@x.invalid', 'admin@x.invalid', 'Admin', 'ADMIN', 'x', T, T]);
  }
}
function record(app: App, b: string, source: string, entity: string, fields: Record<string, unknown>, p: string | null = null): void {
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [randomUUID(), b, source, entity, JSON.stringify(fields), T, p]);
}

/* ================================================================== */

describe('1 · item 1 (L2, L8) — the company on the register', () => {
  test('"Find this company" reads each match’s accounts type from its profile, and a dormant company is flagged on the screen', async () => {
    const t = fixtureTransport({
      'GET /search/companies': json({ items: [
        { title: 'LOCKWOOD SURGERY PRIME HEALTH LTD', company_number: '09037233', company_status: 'active', address: { postal_code: 'HD1 3XH' } },
        { title: 'INVENTED SURGERY LLP', company_number: 'OC999999', company_status: 'active', address: { postal_code: 'HD1 3XH' } }] }),
      'GET /company/09037233': json({ company_number: '09037233', accounts: { last_accounts: { type: 'dormant', period_end_on: '2025-05-31' } } }),
      'GET /company/OC999999': json({ company_number: 'OC999999', accounts: { last_accounts: { type: 'full' } } }),
    });
    const got = await searchCompanies({ name: 'lockwood surgery', gate: { free_enabled: true } as never,
      deps: { audit: { append: () => undefined } as never, now: () => T, transport: t }, secrets: secretsFromValues({ COMPANIES_HOUSE_API_KEY: 'invented-key' }),
      config: { enabled: true, named_in_privacy_notice: true } });
    assert.equal(got.state, 'FOUND');
    const c = got.state === 'FOUND' ? got.candidates : [];
    assert.deepEqual(c.map((x) => [x.number, x.status, x.accounts_type]), [['09037233', 'active', 'dormant'], ['OC999999', 'active', 'full']]);
    // The screen: status and accounts type beside each match, and the dormant one flagged at once.
    const s: Record<string, unknown> = {};
    F4.markFunnel4(s);
    F4.buildings(s)[0]!['company_results'] = c;
    const html = String(F4.screenBody(s, 'details', { company: true, postcode: false }));
    assert.match(html, /company number 09037233 · active · dormant accounts/);
    assert.match(html, /Dormant:<\/strong> a dormant company has no tax to relieve/);
    assert.equal((html.match(/f4-dormant/g) ?? []).length, 1);
    // A profile that cannot be read leaves the type not known — never "not dormant" (N4).
    assert.equal(accountsTypeOfProfile('not json'), null);
    assert.equal(isDormant(null), false);
  });

  test('the company profile keeps the accounts type, and the test website reads it under a recorded waiver (the PSC still after signing)', () => {
    assert.deepEqual(companyFields({ company_number: '09037233', accounts: { last_accounts: { type: 'dormant', period_end_on: '2025-05-31' }, accounting_reference_date: { day: 31, month: 5 } } }),
      { company_number: '09037233', accounts_year_end: '05-31', accounts_type: 'dormant', accounts_made_up_to: '2025-05-31' });
    assert.ok(TEST_WEBSITE_LOOKUPS.sources.includes('CH_COMPANY') && TEST_WEBSITE_LOOKUPS.sources.includes('CH_PSC'));
    assert.match(TEST_WEBSITE_LOOKUPS.waiver_record, /10 October 2026 \(Phase 159g\).*CH_COMPANY.*CH_PSC/);
    assert.equal(freeGateWaived('CH_COMPANY', { CAPREBATE_LOOKUPS_HERE: '1' }), true);
    assert.equal(freeGateWaived('CH_COMPANY', {}), false);
  });

  test('a dormant company on record is said in the qualifying-activity evidence, and on the facts panel', async () => {
    const app = await testApp();
    const { b } = business(app, 'dorm');
    assert.equal(W.dormantWarning(app.db, b), null);
    record(app, b, 'CH_COMPANY', '09037233', { company_number: '09037233', company_status: 'active', accounts_type: 'dormant', accounts_made_up_to: '2025-05-31', accounts_year_end: '05-31' });
    assert.match(W.dormantWarning(app.db, b) ?? '', /dormant accounts.*made up to 2025-05-31/);
    const ev = PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT;
    assert.ok(ev.includes(DORMANT_WORDS), ev.join(' | '));
    assert.ok(ev.some((l) => /Companies House: active, dormant accounts made up to 2025-05-31/.test(l)));
    app.close();
  });

  test('L8: the register’s year end is the claim’s; the client’s is compared with it; neither known is not known', async () => {
    const reg = (month: number, day: number) => ({ year_end: { month, day } } as W.RegisterCompany);
    assert.equal(W.yearEndFrom(null, null).used, null);
    assert.deepEqual(W.yearEndFrom({ month: 3, day: 31 }, null), { used: { month: 3, day: 31 }, from: 'CLIENT', client: { month: 3, day: 31 }, register: null, differs: false, words: '31 March, the client’s own answer, checked.' });
    const both = W.yearEndFrom({ month: 3, day: 31 }, reg(5, 31));
    assert.deepEqual([both.used, both.from, both.differs], [{ month: 5, day: 31 }, 'REGISTER', true]);
    assert.match(both.words, /Companies House gives the year end as 31 May, but the client said 31 March/);
    assert.equal(W.yearEndFrom({ month: 5, day: 31 }, reg(5, 31)).differs, false);
    // In the database: a company whose only year end is the register's gets its period from it.
    const app = await testApp();
    const { b } = business(app, 'ye');
    assert.equal(periodFromYearEnd(app.db, b, '2025-03-14'), null);
    record(app, b, 'CH_COMPANY', '09037233', { company_number: '09037233', accounts_year_end: '05-31' });
    assert.deepEqual(periodFromYearEnd(app.db, b, '2025-03-14'), { start: '2024-06-01', end: '2025-05-31' });
    assert.equal(yearEndReading(app.db, b).from, 'REGISTER');
    app.close();
  });
});

describe('2 · item 2 — a qualifying activity, and whose claim it is', () => {
  test('the enquiry check reads "a qualifying activity", so a landlord letting the building is not turned away', () => {
    assert.match(PL.ENQUIRY_CHECKS.TRADING_CLIENT, /^The client has a qualifying activity: it trades, works in a profession, or lets the building to a business/);
    assert.doesNotMatch(PL.ENQUIRY_CHECKS.TRADING_CLIENT, /trading business/);
  });

  test('the assessment asks who uses the building, and keeps the answer as an answer row; "Not sure" is not known', async () => {
    const s: Record<string, unknown> = {};
    F4.markFunnel4(s);
    const html = String(F4.screenBody(s, 'details', { company: false, postcode: false }));
    assert.match(html, /Who uses the building\?/);
    for (const o of F4.BUILDING_USE) assert.ok(html.includes(`value="${o.value}"`), o.value);
    F4.applyF4(s, 'details', new URLSearchParams({ b0_business: 'Invented Holdings Ltd', b0_entity: 'ltd', b0_line1: '3 Invented Road', b0_postcode: 'ZZ1 1ZZ', b0_use: 'let_out' }));
    assert.equal(F4.buildings(s)[0]!['use'], 'let_out');
    const rows = answerRows(s as unknown as FunnelState).filter((r) => r.question_id === 'Q2-1-use');
    assert.deepEqual(rows.map((r) => [r.state, r.value]), [['ANSWERED', 'let_out']]);
    // "Not sure" is not known (N4): a row that says so, and no role.
    F4.applyF4(s, 'details', new URLSearchParams({ b0_business: 'Invented Holdings Ltd', b0_entity: 'ltd', b0_line1: '3 Invented Road', b0_postcode: 'ZZ1 1ZZ', b0_use: 'unsure' }));
    assert.deepEqual(answerRows(s as unknown as FunnelState).filter((r) => r.question_id === 'Q2-1-use').map((r) => r.state), ['DONT_KNOW']);
    assert.deepEqual(W.USE_TO_ROLE, { own_use: 'OWNER_OCCUPIER', let_out: 'LANDLORD', rented: 'TENANT' });
    assert.equal(W.USE_TO_ROLE['unsure'], undefined);
  });

  test('submitted: the property carries the role and the council area the postcode check found, each with its source', async () => {
    const app = await testApp();
    const s: Record<string, unknown> = {};
    F4.markFunnel4(s);
    const steps: [F4.F4Screen, Record<string, string>][] = [
      ['buildings', { b0_sector: 'gp' }], ['spend-on', { b0_trigger: 'purchase' }], ['amounts', { b0_spend: '650000', b0_date: '03/2025' }],
      ['tax', { b0_tax: 'yes', b0_profit: 'profitable' }], ['claims', { b0_prior: 'no', b0_seller: 'dont_know' }], ['works', { b0_works: 'no' }],
      ['details', { b0_business: 'Invented Holdings Ltd', b0_entity: 'ltd', b0_line1: '3 Invented Road', b0_postcode: 'ZZ1 1ZZ', b0_use: 'let_out' }]];
    for (const [id, f] of steps) assert.deepEqual(F4.applyF4(s, id, new URLSearchParams(f)).errors, [], id);
    F4.buildings(s)[0]!['postcode_check'] = { postcode: 'ZZ1 1ZZ', council_area: 'Kirklees', region: null, country: 'England' };
    const out = F4.submitEnquiry(app.db, { token: 'tok-159g', state: s as never, screen: 'Q1' as never }, app.now, randomUUID);
    const p = app.db.get<Record<string, unknown>>('SELECT claimant_role, claimant_role_source, council_area, council_area_source FROM properties WHERE business_id = ?', [out.parts[0]!.business_id]);
    assert.deepEqual(p, { claimant_role: 'LANDLORD', claimant_role_source: 'the client’s own answer in the assessment',
      council_area: 'Kirklees', council_area_source: 'the postcode check at the assessment (postcodes.io)' });
    app.close();
  });

  test('the property’s role is read with its source, and said in the evidence beside the check', async () => {
    const app = await testApp();
    const { b, p } = business(app, 'role');
    assert.equal(W.claimantRole(app.db, p).role, null);
    app.db.run("UPDATE properties SET claimant_role = 'LANDLORD', claimant_role_source = 'the client’s own answer in the assessment' WHERE id = ?", [p]);
    const r = W.claimantRole(app.db, p);
    assert.equal(r.role, 'LANDLORD');
    assert.match(r.words, /a landlord’s claim, through its property business/);
    assert.ok(PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT.some((l) => /Landlord \(lets it out\).*the client’s own answer in the assessment/.test(l)));
    // A role outside the list is refused by the database.
    assert.throws(() => app.db.run("UPDATE properties SET claimant_role = 'OWNER' WHERE id = ?", [p]));
    app.close();
  });
});

describe('3 · item 3 (L11) — Price Paid for every sector: a lead, never the price', () => {
  test('the category is read: standard is A, additional is B, anything else not known', () => {
    assert.equal(categoryOf({ prefLabel: [{ _value: 'Standard price paid transaction' }] }), 'A');
    assert.equal(categoryOf({ _about: 'http://landregistry.data.gov.uk/def/ppi/additionalPricePaidTransaction' }), 'B');
    assert.equal(categoryOf(null), null);
  });

  test('3 Meltham Road: category B, type Other, leasehold — shown as a lead, and the desk-first price skips it', async () => {
    const app = await testApp();
    const { b, p } = business(app, 'ppd');
    record(app, b, 'HMLR_PPD', 'TX-1', { price_paid: 540000, transaction_date: '2020-06-03', tenure: 'leasehold', property_type_ppd: 'Other', ppd_category: 'B' }, p);
    const sale = W.pricePaidSale(app.db, b, p)!;
    assert.equal(sale.lead, true);
    assert.match(sale.words, /sale on 2020-06-03 for £540,000, leasehold, type “Other”, category B\. A lead to confirm, not the price/);
    // A standard residential sale stays a price; a category not stated is a lead (N4).
    assert.equal(W.isPricePaidLead({ ppd_category: 'A', property_type_ppd: 'detached' }), false);
    assert.equal(W.isPricePaidLead({ property_type_ppd: 'detached' }), true);
    assert.equal(W.isPricePaidLead({ ppd_category: 'A', property_type_ppd: 'Other' }), true);
    app.close();
  });
});

describe('4 · item 4 — tenure from the registers, with its source', () => {
  test('filled from the title check first, then Price Paid; never over a tenure already recorded', async () => {
    const app = await testApp();
    const { b, p } = business(app, 'ten');
    record(app, b, 'HMLR_PPD', 'TX-2', { price_paid: 540000, tenure: 'leasehold', ppd_category: 'B' }, p);
    assert.deepEqual(W.fillTenureFromRegisters(app.db, p, T), { tenure: 'LEASEHOLD', source: 'from HM Land Registry’s Price Paid' });
    assert.match(W.propertyTenure(app.db, p).words, /^Leasehold \(from HM Land Registry’s Price Paid\); when the lease ends is not known\.$/);
    // Already recorded: left alone, even where the title says otherwise.
    record(app, b, 'HMLR_TITLE', 'by-hand:ZZ1', { title_number: 'ZZ1', tenure: 'freehold' }, p);
    assert.equal(W.fillTenureFromRegisters(app.db, p, T), null);
    app.db.run("UPDATE properties SET tenure = NULL, tenure_source = NULL WHERE id = ?", [p]);
    assert.deepEqual(W.fillTenureFromRegisters(app.db, p, T), { tenure: 'FREEHOLD', source: 'from the title register' });
    app.db.run("UPDATE properties SET tenure = 'LEASEHOLD', lease_end_date = '2045-03-31', landlord = 'NHS_BODY' WHERE id = ?", [p]);
    assert.match(W.propertyTenure(app.db, p).words, /the lease ends on 2045-03-31; the landlord is NHS_BODY/);
    app.close();
  });
});

describe('4b · item 4 — the client gives the rest on the property page', () => {
  test('how the client holds it, the day the lease ends and the landlord are recorded by staff, each with its source; a bad value is refused', async () => {
    const app = await testApp();
    const { p } = business(app, 'form');
    const sales = actor('SALES');
    assert.equal(C.updateProperty(deps(app), sales, p, { claimant_role: 'TENANT', lease_end_date: '2040-03-31', landlord: 'NHS_BODY', tenure: 'LEASEHOLD' }, { store: null }).ok, true);
    const r = W.propertyTenure(app.db, p);
    assert.deepEqual([r.tenure, r.source, r.role.role, r.role.source, r.lease_end_date, r.landlord], ['LEASEHOLD', 'recorded by staff', 'TENANT', 'recorded by staff', '2040-03-31', 'NHS_BODY']);
    assert.equal(C.propertyView(app.db, sales, p, { store: null }).holding.role_words, 'Tenant (rents it) (recorded by staff)');
    assert.equal(C.updateProperty(deps(app), sales, p, { claimant_role: 'SQUATTER' }, { store: null }).ok, false);
    // Cleared: back to not known, and its source with it.
    assert.equal(C.updateProperty(deps(app), sales, p, { claimant_role: '' }, { store: null }).ok, true);
    assert.equal(W.claimantRole(app.db, p).role, null);
    app.close();
  });
});

describe('5 · item 5 — a site area far larger than the building', () => {
  test('8,170 m² against a 266 m² surgery is flagged for the surveyor; a plot in proportion is not; unknown is never flagged', () => {
    assert.match(W.siteAreaFlag(8170, 266) ?? '', /site area \(8,170 m²\) is 31 times the building’s floor area \(266 m²\).*never used as the plot/);
    assert.equal(W.siteAreaFlag(1200, 266), null);
    assert.equal(W.siteAreaFlag(null, 266), null);
    assert.equal(W.siteAreaFlag(8170, null), null);
  });
});

describe('6 · item 6 — a person named as owner, matched against the client’s own people', () => {
  test('names compare by first name and surname, titles and case aside', () => {
    assert.equal(W.sameName('DR JOHN ALAN SMITH', 'John Smith'), true);
    assert.equal(W.sameName('Jane Smith', 'John Smith'), false);
    assert.equal(W.sameName('Smith', 'John Smith'), false);
  });

  test('the title check typed by hand asks the name, keeps only YES or NO, and "still owned" reads it for a partnership', async () => {
    const app = await testApp();
    const { b, p } = business(app, 'pers', { claimant_type: 'PARTNERSHIP' });
    app.db.run('INSERT INTO contacts (id,business_id,full_name,contact_consent,marketing_optin,created_at) VALUES (?,?,?,?,?,?)', ['ct-1', b, 'Dr Asha Invented', 1, 0, T]);
    const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: null, workstream: 'PLANT_AND_MACHINERY', stage: 'VALUATION', owner_id: null, surveyor_id: null }).id;
    assert.equal(stillOwned(app.db, { id: claim, business_id: b, property_id: p }).value, null);
    signed(app, b);
    const r = TH.recordTitleByHand(deps(app), ADMIN, p, { title_number: 'WYK123456', tenure: 'freehold', owner_person_name: 'ASHA INVENTED' });
    assert.equal(r.ok, true, JSON.stringify(r));
    const f = JSON.parse(app.db.get<{ fields_json: string }>("SELECT fields_json FROM register_records WHERE source_id = 'HMLR_TITLE' AND property_id = ?", [p])!.fields_json) as Record<string, unknown>;
    assert.equal(f['proprietor_personal_match'], 'YES');
    assert.equal(JSON.stringify(f).includes('ASHA'), false, 'the name was kept');
    assert.deepEqual(stillOwned(app.db, { id: claim, business_id: b, property_id: p }), { value: 'YES', why: 'the current title register names one of the client’s own people as the owner' });
    // The title's tenure reached the property too (item 4).
    assert.equal(W.propertyTenure(app.db, p).tenure, 'FREEHOLD');
    app.close();
  });

  test('a company claimant is never matched by a person’s name; a name that is not the client’s is NO; both a company and a name is refused', async () => {
    const app = await testApp();
    const co = business(app, 'co', { claimant_type: 'COMPANY' });
    record(app, co.b, 'HMLR_TITLE', 'by-hand:X1', { title_number: 'X1', proprietor_personal_match: 'YES' }, co.p);
    assert.equal(W.registerNamesClientPerson(app.db, co.b, co.p), false);
    const st = business(app, 'st', { claimant_type: 'SOLE_TRADER' });
    app.db.run('INSERT INTO contacts (id,business_id,full_name,contact_consent,marketing_optin,created_at) VALUES (?,?,?,?,?,?)', ['ct-2', st.b, 'Sam Invented', 1, 0, T]);
    signed(app, st.b);
    const both = TH.recordTitleByHand(deps(app), ADMIN, st.p, { title_number: 'WYK1', proprietor_company_number: '01234567', owner_person_name: 'Sam Invented' });
    assert.equal(both.ok, false);
    assert.equal(TH.recordTitleByHand(deps(app), ADMIN, st.p, { title_number: 'WYK2', owner_person_name: 'Someone Else' }).ok, true);
    assert.equal(W.registerNamesClientPerson(app.db, st.b, st.p), false);
    app.close();
  });
});

describe('7 · item 7 — the BCIS location from the property’s council area', () => {
  test('the council area is kept once, never written over; the pack drafts its location from it where the table names it, and the surveyor’s choice wins', async () => {
    const keep = process.env.CAPREBATE_COST_MODEL_TEST, keepD = process.env.CAPREBATE_BCIS_DATA_FILE;
    process.env.CAPREBATE_COST_MODEL_TEST = '1';
    process.env.CAPREBATE_BCIS_DATA_FILE = join(mkdtempSync(join(tmpdir(), 'cb-159g-')), 'none.json');
    try {
      const app = await testApp();
      app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        ['u-sam', 'u-sam@x.invalid', 'u-sam@x.invalid', 'Sam', 'SURVEYING', 'x', T, T]);
      const { b, p } = business(app, 'loc');
      assert.equal(W.keepCouncilArea(app.db, p, 'Kirklees', 'the postcode check', T), true);
      assert.equal(W.keepCouncilArea(app.db, p, 'Leeds', 'the postcode check', T), false);
      assert.deepEqual(W.councilAreaOf(app.db, p), { area: 'Kirklees', source: 'the postcode check' });
      assert.equal(B.bcisLocationNamed('kirklees'), 'Kirklees');
      assert.equal(B.bcisLocationNamed('Nowhere'), null);
      app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-loc', b, 'gp', T, null, 1, T]);
      app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', ['job-loc', b, 'as-loc', 'u-sam', 'SEALED', null, T, null]);
      const v = SP.packView(deps(app), SAM, 'job-loc');
      assert.equal(v.pricing.location_from, 'COUNCIL');
      assert.equal(v.pricing.bcis.location.area, 'Kirklees');
      // The surveyor puts the UK mean back, with a reason: their choice wins over the council area.
      const r = SP.savePackLocation(deps(app), SAM, 'job-loc', { area: '', reason: 'The site is on the border', seq: String(v.seq) });
      assert.equal(r.ok, true, JSON.stringify(r));
      const after = SP.packView(deps(app), SAM, 'job-loc');
      assert.deepEqual([after.pricing.location_from, after.pricing.bcis.location.area], [null, null]);
      app.close();
    } finally {
      if (keep === undefined) delete process.env.CAPREBATE_COST_MODEL_TEST; else process.env.CAPREBATE_COST_MODEL_TEST = keep;
      if (keepD === undefined) delete process.env.CAPREBATE_BCIS_DATA_FILE; else process.env.CAPREBATE_BCIS_DATA_FILE = keepD;
    }
  });
});
