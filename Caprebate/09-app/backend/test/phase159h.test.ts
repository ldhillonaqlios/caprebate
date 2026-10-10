/**
 * PHASE 159h, 10 October 2026 — THE LEGAL CHECK: EVERY PATH ENDS WHERE THE LAW DOES.
 *
 * From the stress test of 9 October 2026 (the claim harness's 20,367-path walk, C6, C7, C8, C11, C26, C28) and the
 * carried item from Phase 159g. Each test fails on the code before this phase (LEGAL_READINGS did not exist, so this
 * file does not load on it; and each behaviour below was absent):
 *   1  C6: answers that contradict each other are AMBER, never clear
 *   2  C7: the earlier owner's disposal value (G12bv) is asked and caps the claim (s.185); AMBER while not known
 *   3  C8: how the property was taken on is asked on every purchase; a new lease for a premium takes the lease route
 *      (s.183 / s.184); no election is available on a transfer below value
 *   4  C11: an election that splits out the integral features caps each pool, not only the total
 *   5  C26, C28: a landlord barred by s.35 is not an entitled seller; a charity or other non-taxpayer seller is asked
 *   6  item 7: the legal check and the route read who claims — a tenant, a landlord, a role not known, a lease ended
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp } from './helpers.ts';
import * as C from '../src/web/crm.ts';
import { assessLegal, legalAllows, legalQuestions, LEGAL_READINGS } from '../src/web/pack-legal.ts';
import { stillOwned } from '../src/web/claim-route.ts';

const NOW = '2026-10-10T09:00:00.000Z';
const ask = (answers: Record<string, unknown>, holding?: { role: 'OWNER_OCCUPIER' | 'LANDLORD' | 'TENANT' | null }) =>
  assessLegal('gp', new Map(Object.entries(answers)), NOW, 'company', holding);
const PURCHASE = (date: string) => ({ G8: ['purchase'], G8a: 'property', G9d: date, G15: 'no' });
const ELECTION = (value: number, sr: number) => ({
  ...PURCHASE('2025-06-01'), G11: 'yes', G12: 'taxpaying', G14: 'held', G14s: 'sale', G14sx: 's.198', G14d: '2025-06-01', G14n: '2025-09-01',
  G14po: 'sold_market', G14pod: '2025-06-01', G14iv: 'no', G14t: 'none', G14rs: 'split', G14rsv: sr, G14sc: 'all_fixtures', G14mp: 'no',
  G14c: ['amount', 'plant', 'land', 'interest', 'utrs', 'both'], G14v: value, G15: 'no', G14fvr: 'no',
});

describe('0 · the readings are on, and named', () => {
  test('four readings, each on in test and each put to the tax adviser', () => {
    assert.deepEqual({ ...LEGAL_READINGS }, { s35_seller_not_entitled: true, non_taxpayer_seller: true, lease_route: true, s185_earlier_cap: true });
    const ids = legalQuestions('gp').map((q) => q.id);
    assert.ok(ids.includes('G12bv'), 'the earlier owner’s disposal value is asked');
    assert.ok(ids.includes('G14s') && ids.includes('G14s3'), 'how the property was taken on, and the s.183 election, are asked');
    assert.equal(ids.indexOf('LC-seller-nontax'), ids.indexOf('G12') + 1, 'the non-taxpayer question follows the seller question');
  });
});

describe('1 · C6 — contradictory answers are never clear', () => {
  test('"a previous owner claimed", an NHS seller and nobody earlier: AMBER, naming the contradiction', () => {
    const r = ask({ ...PURCHASE('2025-06-01'), G11: 'yes', G12: 'nhs', G12b: 'no', G14s: 'sale' });
    assert.equal(r.verdict.level, 'AMBER');
    assert.match(r.verdict.headline, /The answers disagree/);
    // The same chain without the claim is consistent, and the rules do not reach it.
    assert.equal(ask({ ...PURCHASE('2025-06-01'), G11: 'no', G12: 'nhs', G12b: 'no', G14s: 'sale' }).verdict.level, 'GREEN');
  });
});

describe('2 · C7 — section 185 looks past a seller who could never claim', () => {
  test('an earlier owner who could claim: the value fixed at that sale is asked; not known is AMBER; known caps the claim', () => {
    // The stress test's S2 path: an NHS seller, an earlier owner who traded there; allowed with no cap before this phase.
    const chain = { G8: ['purchase'], G8a: 'property', G9d: '2025-06-01', G11: 'yes', G12: 'nhs', G12b: 'yes', G14: 'held', G14s: 'sale', G14sx: 'unsure',
      G14d: '2025-06-01', G14n: '2025-09-01', G14pod: '2019-06-01', G14fvr: 'yes', G14po: 'new_lease_premium', G14pol: 'no', G14pold: '2019-06-01', G14iv: 'no',
      G14rs: 'split', G14rsv: 50000, G14sc: 'all_fixtures', G14mp: 'no', G14c: ['amount'], G14v: 60000, G15: 'no' };
    const r0 = ask(chain);
    assert.ok(r0.asked.some((q) => q.id === 'G12bv'), 'G12bv is asked');
    assert.equal(r0.verdict.level, 'AMBER');
    assert.match(r0.verdict.headline, /Section 185 caps the claim/);
    const r1 = ask({ ...chain, G12bv: 30_000 });
    assert.ok(r1.verdict.level === 'GREEN' || r1.verdict.level === 'URGENT', r1.verdict.headline);
    assert.equal(r1.verdict.cap_pence, 3_000_000);
    assert.match(r1.verdict.cap_words ?? '', /section 185/);
    assert.equal(legalAllows(r1.verdict, 4_000_000).ok, false);
  });
});

describe('3 · C8 — how the property was taken on decides the route', () => {
  test('asked on every purchase of the property, whether or not an election is held', () => {
    const r = ask({ ...PURCHASE('2025-06-01'), G11: 'yes', G12: 'taxpaying', G14: 'no' });
    assert.ok(r.unanswered.some((q) => q.id === 'G14s'), 'G14s is asked with no election');
    assert.equal(r.verdict.level, 'AMBER');
  });

  test('a new lease for a premium from a landlord who could claim: no joint election is RED, not known is AMBER; the s.183 question appears', () => {
    const base = { ...PURCHASE('2025-06-01'), G11: 'yes', G12: 'taxpaying', G14: 'no', G14s: 'lease_premium', G14fvr: 'no', G14po: 'sold_market' };
    const asked = ask(base);
    assert.ok(asked.asked.some((q) => q.id === 'G14s3'), 'the s.183 question appears');
    const no = ask({ ...base, G14s3: 'no' });
    assert.equal(no.verdict.level, 'RED');
    assert.match(no.verdict.headline, /fixtures stay the landlord’s/);
    assert.equal(ask({ ...base, G14s3: 'unsure' }).verdict.level, 'AMBER');
  });

  test('a new lease from a landlord who could never claim (an NHS body): s.184, the lease route does not stop it', () => {
    const r = ask({ ...PURCHASE('2025-06-01'), G11: 'no', G12: 'nhs', G12b: 'no', G14s: 'lease_premium', G14s3: 'no' });
    assert.notEqual(r.verdict.level, 'RED');
    assert.doesNotMatch(r.verdict.headline, /landlord’s/);
  });

  test('a transfer below value: no election is available, so a document calling itself one fixes nothing', () => {
    const r = ask({ ...ELECTION(60_000, 20_000), G14s: 'below_market' });
    assert.equal(r.verdict.cap_words === 'the value the section 198 election fixes for the fixtures', false, 'the election capped a below-value transfer');
  });
});

describe('4 · C11 — an election is checked pool by pool', () => {
  test('£60,000 elected, £20,000 for the integral features: each pool is capped at its own part', () => {
    const r = ask(ELECTION(60_000, 20_000));
    assert.equal(r.verdict.level, 'GREEN', r.verdict.headline);
    assert.deepEqual(r.verdict.pool_caps, { special_pence: 2_000_000, main_pence: 4_000_000 });
    // The total is within the cap, but the special rate pool is not: refused.
    const over = legalAllows(r.verdict, 5_000_000, { main_pence: 2_500_000, special_pence: 2_500_000 });
    assert.equal(over.ok, false);
    assert.match(over.why, /special rate pool is above the election’s figure for the integral features/);
    assert.equal(legalAllows(r.verdict, 5_000_000, { main_pence: 3_500_000, special_pence: 1_500_000 }).ok, true);
    // Without the pools, only the total is checked, as before.
    assert.equal(legalAllows(r.verdict, 5_000_000).ok, true);
  });
});

describe('5 · C26, C28 — the sellers who could never claim', () => {
  test('a landlord who let it as homes (barred by s.35): the check looks past them, to an earlier owner', () => {
    const r = ask({ ...PURCHASE('2019-06-01'), G11: 'no', G12: 'residential_landlord', G14s: 'sale' });
    assert.ok(r.asked.some((q) => q.id === 'G12b'), 'the earlier-owner question is asked');
    const none = ask({ ...PURCHASE('2019-06-01'), G11: 'no', G12: 'residential_landlord', G12b: 'no', G14s: 'sale' });
    assert.equal(none.verdict.level, 'GREEN', none.verdict.headline);
  });

  test('"a private individual / other" is asked whether it was a charity or a body that pays no tax; yes means it could never claim', () => {
    const q = ask({ ...PURCHASE('2025-06-01'), G11: 'no', G12: 'other', G14s: 'sale' });
    assert.ok(q.unanswered.some((x) => x.id === 'LC-seller-nontax'), 'the question is asked');
    const charity = ask({ ...PURCHASE('2025-06-01'), G11: 'no', G12: 'other', 'LC-seller-nontax': 'yes', G12b: 'no', G14s: 'sale' });
    assert.equal(charity.verdict.level, 'GREEN', charity.verdict.headline);
    // A person who pays tax stays not known, as before (N4).
    assert.notEqual(ask({ ...PURCHASE('2025-06-01'), G11: 'no', G12: 'other', 'LC-seller-nontax': 'no', G14s: 'sale' }).verdict.level, 'GREEN');
  });
});

describe('6 · item 7 — the legal check and the route read who claims', () => {
  const clear = { ...PURCHASE('2025-06-01'), G11: 'no', G12: 'nhs', G12b: 'no', G14s: 'sale' };

  test('a tenant’s purchase is not a share of the price: AMBER, marked for the route; a new lease for a premium takes the lease route instead', () => {
    assert.equal(ask(clear).verdict.level, 'GREEN');
    const t = ask(clear, { role: 'TENANT' });
    assert.equal(t.verdict.level, 'AMBER');
    assert.equal(t.verdict.tenant_purchase, true);
    assert.match(t.verdict.headline, /The client rents this building/);
    const lease = ask({ ...clear, G14s: 'lease_premium', G14s3: 'no' }, { role: 'TENANT' });
    assert.notEqual(lease.verdict.tenant_purchase, true);
  });

  test('a landlord is told to leave out the tenant’s fixtures; a role not known is asked and decides nothing', () => {
    const l = ask(clear, { role: 'LANDLORD' });
    assert.equal(l.verdict.level, 'GREEN');
    assert.ok(l.verdict.actions.some((a) => /Leave out any fixture the tenant put in/.test(a)));
    const u = ask(clear, { role: null });
    assert.equal(u.verdict.level, 'GREEN');
    assert.ok(u.verdict.actions.some((a) => /Ask who owns the building and who uses it/.test(a)));
    assert.equal(ask(clear).verdict.actions.some((a) => /tenant|who owns the building/.test(a)), false, 'no property, no role read');
  });

  test('a leasehold whose lease has ended is not still owned (s.188); one still running is not settled by it', async () => {
    const app = await testApp();
    const b = 'b-159h', p = 'p-159h';
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, 'Lease Ltd', 'gp', 'SURVEY', NOW, 'COMPANY']);
    app.db.run("INSERT INTO properties (id,business_id,label,postcode,created_at,tenure,lease_end_date) VALUES (?,?,?,?,?,'LEASEHOLD','2026-03-31')", [p, b, 'Leased Surgery', 'ZZ1 1ZZ', NOW]);
    const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: null, workstream: 'PLANT_AND_MACHINERY', stage: 'VALUATION', owner_id: null, surveyor_id: null }).id;
    const ended = stillOwned(app.db, { id: claim, business_id: b, property_id: p }, NOW);
    assert.equal(ended.value, 'NO');
    assert.match(ended.why, /the lease ended on 2026-03-31.*s\.188/);
    app.db.run("UPDATE properties SET lease_end_date = '2045-03-31' WHERE id = ?", [p]);
    assert.equal(stillOwned(app.db, { id: claim, business_id: b, property_id: p }, NOW).value, null);
    app.close();
  });
});
