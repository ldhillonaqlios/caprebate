/**
 * PHASE 159i, 10 October 2026 — THE MONEY ADJUSTMENTS: GRANTS, VAT, ACQUISITION COSTS AND THE BUYER'S OWN WORK.
 *
 * From the stress test of 9 October 2026 (C12, C23; Rulebook F, F-R12; coverage matrix section 13) and the item carried
 * from Phase 159c. Each test fails on the code before this phase (src/web/money-readings.ts did not exist, so this file
 * does not load on it; and each behaviour below was absent):
 *   1  item 1: a grant not traced to its items comes off in full (not as an equal share); an earlier owner's grant takes
 *      nothing off the buyer's sums and lowers the cap from the earlier sale; C23: every route's rows add up
 *   2  item 2, C12: irrecoverable VAT is shared between the land and the building; the capital goods scheme is a note
 *   3  item 3: stamp duty and fees into the price shared out; the buyer's own alterations on top of the cap
 *   4  item 4: a grant recorded against a piece of work comes off that work; each event's VAT is added to its cost; only
 *      a grant whose spend is not recorded stops the total
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import * as C from '../src/web/crm.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as F from '../src/web/claim-facts.ts';
import { packSums, type PackInputs, type PackLine, type Pool, type Valued, type WorksSums } from '../src/web/pack-sums.ts';
import { applyGrants, type GrantSwitches, type PackGrant } from '../src/web/pack-grants.ts';
import { capped, withPastOwnerGrants, type LegalVerdict } from '../src/web/pack-legal.ts';
import { moneyReadingsHere, MONEY_READINGS_OFF, MONEY_READINGS_ON } from '../src/web/money-readings.ts';
import { setEventVat } from '../src/web/property-events.ts';

const gbp = (p: number) => p * 100;
const ev = (value: number | null): Valued => ({ value, source: value === null ? null : { kind: 'EVIDENCE', text: 'test' } });
const L = (id: string, element_id: string | null, qty: number, rate: number, qpct: number, pool: Pool): PackLine => ({
  id, label: `Line ${id}`, element_id, unit: 'no', pool, pool_source: null, qty_milli: ev(qty), rate_pence: ev(rate), qpct_bp: ev(qpct), removed: false, removed_source: null,
});
// The worked pack of test/pack-grants.test.ts: £140,000 qualifies, £60,000 main pool, £80,000 special rate pool.
const IN: PackInputs = { price_paid_pence: ev(gbp(1_000_000)), land_pence: ev(gbp(200_000)), gia_milli_m2: ev(1_000_000), building_rate_pence: ev(gbp(1_000)) };
const PACK: readonly PackLine[] = [L('A', 'LS-SR-001', 1_000_000, gbp(100), 10000, 'SR'), L('B', 'LS-MP-003', 1000, gbp(50_000), 10000, 'MP'), L('C', 'LS-MP-001', 10_000, gbp(5_000), 5000, 'MP')];
const TEST: GrantSwitches = { element_trace: true, connected_no_reduction: false, untraced_full: true };
const OFF: GrantSwitches = { element_trace: false, connected_no_reduction: false };
const G = (id: string, pounds: number | null, o: Partial<PackGrant> = {}): PackGrant => ({ id, payer_class: 'nhs', amount_pence: pounds === null ? null : gbp(pounds), element_ids: [], ...o });
const run = (grants: readonly PackGrant[], sw: GrantSwitches) => applyGrants(IN, PACK, packSums(IN, PACK), grants, sw);

describe('0 · the readings: on in test, off elsewhere', () => {
  test('all on on the test system, all off on a laptop', () => {
    assert.deepEqual(moneyReadingsHere({ CAPREBATE_COST_MODEL_TEST: '1' }), MONEY_READINGS_ON);
    assert.deepEqual(moneyReadingsHere({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'x' }), MONEY_READINGS_ON);
    assert.deepEqual(moneyReadingsHere({}), MONEY_READINGS_OFF);
  });
});

describe('1 · item 1 — grants to the extent they paid', () => {
  test('an untraced grant comes off in full (£20,000 off £140,000), the pools sharing it; off, the equal share is kept', () => {
    const r = run([G('g1', 20_000)], TEST);
    assert.equal(r.effects[0]?.route, 'FULL');
    assert.equal(r.sums.qualifying_pence, gbp(120_000));
    assert.equal((r.sums.main_pool_pence ?? 0) + (r.sums.special_pool_pence ?? 0), gbp(120_000));
    assert.equal(r.effects[0]?.reduction_pence, gbp(20_000));
    // Off: the old equal share, 2% of the price, so 2% of what qualifies.
    const o = run([G('g1', 20_000)], OFF);
    assert.equal(o.effects[0]?.route, 'EQUAL_SHARE');
    assert.equal(o.sums.qualifying_pence, gbp(137_200));
  });

  test('a traced grant still comes off its own items only; an earlier owner’s grant takes nothing off the buyer’s sums', () => {
    const traced = run([G('g1', 10_000, { element_ids: ['LS-MP-003'] })], TEST);
    assert.equal(traced.effects[0]?.route, 'ITEMS');
    const past = run([G('p1', 50_000, { paid_to: 'PAST_OWNER' })], TEST);
    assert.equal(past.effects[0]?.route, 'PAST_OWNER');
    assert.equal(past.sums.qualifying_pence, gbp(140_000));
  });

  test('C23: two grants’ rows add up to the total, each route', () => {
    for (const sw of [TEST, OFF]) {
      const r = run([G('a', 33_333), G('b', 16_667), G('c', 7)], sw);
      const rows = r.effects.reduce((t, e) => t + (e.reduction_pence ?? 0), 0);
      assert.equal(rows, r.reduction_pence, JSON.stringify(sw));
    }
  });

  test('an earlier owner’s grant lowers the cap from the earlier sale; not known is not settled; with no cap it is said', () => {
    const v: LegalVerdict = { level: 'GREEN', headline: 'met', why: [], actions: [], deadline: null, cap_pence: gbp(50_000), cap_words: 'the value the section 198 election fixes for the fixtures' };
    const down = withPastOwnerGrants(v, [gbp(20_000)]);
    assert.equal(down.cap_pence, gbp(30_000));
    assert.match(down.cap_words ?? '', /less the earlier owner’s grant of £20,000/);
    assert.equal(withPastOwnerGrants(v, [null]).level, 'AMBER');
    assert.match(withPastOwnerGrants({ ...v, cap_pence: null, cap_words: null }, [gbp(1)]).actions.join(' '), /size the cap from the earlier sale/);
    assert.equal(withPastOwnerGrants(v, []), v);
  });
});

describe('3 · item 3 — the buyer’s own alterations sit on top of the cap', () => {
  test('the cap is checked against the figure less the alterations, in the main pool', () => {
    assert.deepEqual(capped({ sums: { qualifying_pence: 1000, main_pool_pence: 600, special_pool_pence: 400 }, money: { alterations_pence: 300 } }),
      [700, { main_pence: 300, special_pence: 400 }]);
    assert.deepEqual(capped({ sums: { qualifying_pence: null, main_pool_pence: null, special_pool_pence: null } }), [null, { main_pence: null, special_pence: null }]);
  });
});

describe('4 · item 4 — each piece of work’s own grants and VAT', () => {
  const w: WorksSums = { event_id: 'e1', direct_pence: gbp(80_000), oncost_pence: gbp(20_000), qualifying_pence: gbp(60_000), main_pool_pence: gbp(40_000),
    special_pool_pence: gbp(20_000), repairs_pence: gbp(10_000), needed: [], problems: [], complete: true };
  test('VAT the client could not reclaim follows every part; a grant for the work comes off in full; an amount not known gives no total', () => {
    const vat = SP.adjustWorks(w, gbp(20_000), [], gbp(100_000));
    assert.deepEqual([vat.qualifying_pence, vat.main_pool_pence, vat.special_pool_pence, vat.repairs_pence], [gbp(72_000), gbp(48_000), gbp(24_000), gbp(12_000)]);
    const grant = SP.adjustWorks(w, null, [gbp(15_000)], gbp(100_000));
    assert.deepEqual([grant.qualifying_pence, grant.main_pool_pence, grant.special_pool_pence], [gbp(45_000), gbp(30_000), gbp(15_000)]);
    const unknown = SP.adjustWorks(w, null, [null], gbp(100_000));
    assert.equal(unknown.complete, false);
    assert.equal(unknown.qualifying_pence, null);
  });

  test('a grant is recorded with who received it and which spend it paid for; an event’s VAT is recorded on the claim', async () => {
    const app = await testApp();
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-ADMIN', 'a@x.invalid', 'a@x.invalid', 'Admin', 'ADMIN', 'x', app.now(), app.now()]);
    const b = 'b-159i', p = 'p-159i';
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, 'Money Ltd', 'gp', 'SURVEY', app.now(), 'COMPANY']);
    app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [p, b, 'Money Surgery', 'ZZ1 1ZZ', app.now()]);
    app.db.run("INSERT INTO property_events (id,property_id,business_id,ord,kind,event_date,cost_pence,vat,source,created_at,created_by) VALUES ('e-refit',?,?,1,'REFURBISHMENT','2025-06',9000000,NULL,'STAFF',?,'u-ADMIN')", [p, b, app.now()]);
    const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: null, workstream: 'PLANT_AND_MACHINERY', stage: 'VALUATION', owner_id: null, surveyor_id: null }).id;
    const d = CF.recordDeps(app) as unknown as F.FactDeps;
    const base = { kind: 'GRANT', payer_class: 'nhs', amount: '15000', amount_basis: 'agreement', traced: 'NO', source_id: 'CLIENT_DOC' };
    assert.equal(F.recordGrant(d, actor('ADMIN'), claim, { ...base, event_id: 'e-refit' }).ok, true);
    assert.equal(F.recordGrant(d, actor('ADMIN'), claim, { ...base, paid_to: 'PAST_OWNER' }).ok, true);
    assert.equal(F.recordGrant(d, actor('ADMIN'), claim, { ...base, event_id: 'nowhere' }).ok, false);
    assert.equal(F.recordGrant(d, actor('ADMIN'), claim, { ...base, paid_to: 'PAST_OWNER', event_id: 'e-refit' }).ok, false);
    const gs = F.packGrantsFor(app.db, claim);
    assert.deepEqual(gs.map((g) => [g.paid_to, g.event_id]), [['CLIENT', 'e-refit'], ['PAST_OWNER', null]]);
    assert.equal(setEventVat(app.db, app.now(), p, 'e-refit', { position: 'INCLUDED_NOT_RECLAIMABLE', amount_pence: gbp(18_000) }).ok, true);
    assert.equal(setEventVat(app.db, app.now(), p, 'e-refit', { position: 'EXCLUDED_OR_RECLAIMED', amount_pence: gbp(1) }).ok, false);
    assert.equal(app.db.get<{ v: number }>("SELECT vat_pence AS v FROM property_events WHERE id = 'e-refit'")?.v, gbp(18_000));
    // A grant cannot be changed after it is recorded, its two new columns included.
    assert.throws(() => app.db.run("UPDATE claim_grants SET paid_to = 'CLIENT' WHERE paid_to = 'PAST_OWNER'"));
    app.close();
  });
});

describe('2, 3 · the purchase in the pack: VAT and costs shared with the land, alterations on top', () => {
  test('C12: £200,000 VAT on a £1m price with £300,000 land — the land takes £60,000 of it; stamp duty and fees are shared the same way; the alterations are added on top', async () => {
    const app = await testApp();
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-sam', 's@x.invalid', 's@x.invalid', 'Sam', 'SURVEYING', 'x', app.now(), app.now()]);
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-SALES', 'sl@x.invalid', 'sl@x.invalid', 'Sales', 'SALES', 'x', app.now(), app.now()]);
    const b = 'b-vat', p = 'p-vat', job = 'job-vat';
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, 'Vat Ltd', 'gp', 'SURVEY', app.now(), 'COMPANY']);
    app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [p, b, 'Vat Surgery', 'ZZ1 1ZZ', app.now()]);
    app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-vat', b, 'gp', app.now(), null, 1, app.now()]);
    const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: 'as-vat', workstream: 'PLANT_AND_MACHINERY', stage: 'VALUATION', owner_id: null, surveyor_id: null }).id;
    app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [job, b, 'as-vat', 'u-sam', 'SEALED', null, app.now(), claim]);
    const deps = (money: typeof MONEY_READINGS_ON) => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID, money });
    const sam = actor('SURVEYING', 'u-sam');
    const seq = () => String(SP.packView(deps(MONEY_READINGS_OFF), sam, job).seq);
    for (const [field, value] of [['price_paid', '1000000'], ['land', '300000'], ['gia', '1000'], ['building_rate', '1000']] as const) {
      const r = SP.savePackValue(deps(MONEY_READINGS_OFF), sam, job, { field, value, reason: 'test', seq: seq(), ...(field === 'building_rate' ? { rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule', rate_priced_at: '2025-06-01' } : {}) } as never);
      assert.equal(r.ok, true, `${field}: ${JSON.stringify(r)}`);
    }
    for (const [field, value] of [['vat_position', 'EXEMPT'], ['vat', '200000']] as const) {
      assert.equal(SP.savePackExtra(deps(MONEY_READINGS_OFF), sam, job, { field, value, reason: 'test', seq: seq() }).ok, true, field);
    }
    const off = SP.packView(deps(MONEY_READINGS_OFF), sam, job);
    const on = SP.packView(deps(MONEY_READINGS_ON), sam, job);
    assert.equal(off.money.land_share_pence, 0);
    assert.equal(on.money.land_share_pence, gbp(60_000), on.money.words.join(' '));
    // The building's price: off £1.2m − £300k = £900k; on £1.2m − £360k = £840k.
    assert.equal(off.purchase_sums.building_price_pence, gbp(900_000));
    assert.equal(on.purchase_sums.building_price_pence, gbp(840_000));
    // Stamp duty £40,000 and fees £10,000: on in test, added to the price and shared with the land.
    CF.fact(app, claim, 'TRANSACTION_TAX', '40000');
    CF.fact(app, claim, 'ACQUISITION_COSTS', '10000');
    CF.fact(app, claim, 'BUYER_ALTERATIONS', 'YES');
    CF.fact(app, claim, 'BUYER_ALTERATIONS_AMOUNT', '25000');
    CF.fact(app, claim, 'VAT_CGS_ADJUSTMENT', '3000');
    const on2 = SP.packView(deps(MONEY_READINGS_ON), sam, job);
    assert.equal(on2.money.costs_pence, gbp(50_000));
    assert.equal(on2.money.land_share_pence, gbp(75_000));
    assert.equal(on2.purchase_sums.building_price_pence, gbp(1_250_000 - 375_000));
    assert.equal(on2.money.alterations_pence, gbp(25_000));
    assert.equal(on2.money.cgs_pence, gbp(3_000));
    assert.ok(on2.money.words.some((w) => /capital goods scheme adjustment of £3,000 is recorded\. It is a note/.test(w)));
    // Off, none of it moves the figure.
    const off2 = SP.packView(deps(MONEY_READINGS_OFF), sam, job);
    assert.deepEqual([off2.money.costs_pence, off2.money.alterations_pence], [0, 0]);
    app.close();
  });
});
