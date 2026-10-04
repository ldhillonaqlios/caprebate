/**
 * PHASE 153b, 4 October 2026 — tax readings built on our recommendation, for the accountant to check. The back end's
 * half; the engine's readings are Suite AI of the site harness (03-app/caprebate-regression.cjs).
 *
 *   line 10  Word question 98  — the survey pack's cap says when the engine cut an elected figure down to the law's limit
 *   line 16  Word question 121 — the return entries for each year, as a spreadsheet beside the PDF
 *   line 18  Word question 198 — Companies House's company type, kept and mapped only with its switch on
 *   line 19  Word question 202 — Homedata planning is the chosen planning route, and still off
 *   line 20  Word question 226 — the works-VAT answer reaches the fee comparison only for the same business, unchanged
 *
 * Each is asserted both ways, and wherever something would relieve or fill in for the client, "not known" and absent
 * are both asserted (N4).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { CB, clientVatFromWorks } from '../src/web/engine.ts';
import { assessLegal } from '../src/web/pack-legal.ts';
import { csvCell, returnEntries, returnEntriesCsv, RETURN_YEARS } from '../src/web/return-entries.ts';
import { COMPANY_TYPE_FROM_REGISTER, entityFromCompanyType, searchCompanies } from '../src/connectors/company-search.ts';
import { PLANNING_ROUTE, REGISTER_SWITCHES } from '../src/connectors/registers.ts';
import { catalogue } from '../src/web/research.ts';
import { fixtureTransport } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { SOURCES } from '../../../04-phase-work/phase3/caprebate-source-register.ts';
import type { Snapshot } from '../src/web/pack-approve.ts';

const NOW = '2026-10-04T09:00:00.000Z';
const CTA = (CB as unknown as { CB_CTA: Record<string, boolean> }).CB_CTA;
function withSwitch<T>(key: string, fn: () => T): T {
  const was = CTA[key];
  CTA[key] = true;
  try { return fn(); } finally { CTA[key] = was as boolean; }
}

describe('line 10 — Word question 98: an elected figure above the law’s limit, in the survey pack', () => {
  const PURCHASE = { G8: ['purchase'], G8a: 'property', G9d: '2024-03-01' };
  const ELECTION = (value: number, extra: Record<string, unknown> = {}) => new Map(Object.entries({
    ...PURCHASE, G11: 'yes', G12: 'taxpaying', G14: 'held', G14sx: 's.198', G14d: '2024-03-01', G14n: '2024-09-01', G14po: 'sold_market', G14pod: '2024-03-01',
    G14iv: 'no', G14t: 'none', G14rs: 'split', G14rsv: Math.floor(value / 3), G14sc: 'all_fixtures', G14mp: 'no',
    G14c: ['amount', 'plant', 'land', 'interest', 'utrs', 'both'], G14v: value, G15: 'no', G14fvr: 'no', ...extra,
  }));
  test('off, as shipped: the cap is the figure the election states, even above what the seller paid; the seller’s cost is not asked', () => {
    assert.equal(CTA['election_value_cut_to_lawful_max'], false);
    const r = assessLegal('gp', ELECTION(300_000, { G51elcost: 250_000 }), NOW, 'company');
    assert.equal(r.verdict.level, 'GREEN', JSON.stringify(r.verdict));
    assert.equal(r.verdict.cap_pence, 30_000_000);
    assert.equal(r.verdict.cap_words, 'the value the section 198 election fixes for the fixtures');
    assert.equal(r.asked.some((q) => q.id === 'G51elcost'), false);
  });
  test('on: the review’s example (£300,000 elected, the seller paid £250,000) caps the pack at £250,000, and says why', () => {
    const r = withSwitch('election_value_cut_to_lawful_max', () => assessLegal('gp', ELECTION(300_000, { G51elcost: 250_000 }), NOW, 'company'));
    assert.equal(r.asked.some((q) => q.id === 'G51elcost'), true, 'the seller’s cost is asked with the switch on');
    assert.equal(r.verdict.cap_pence, 25_000_000);
    assert.match(r.verdict.cap_words ?? '', /the most the law lets the section 198 election fix: what the seller paid for the fixtures/);
  });
  test('on, N4: the seller’s cost not known cuts nothing and blocks nothing — the cap stays at the elected figure, the question optional', () => {
    const r = withSwitch('election_value_cut_to_lawful_max', () => assessLegal('gp', ELECTION(300_000), NOW, 'company'));
    assert.equal(r.verdict.level, 'GREEN', JSON.stringify(r.verdict));
    assert.equal(r.verdict.cap_pence, 30_000_000);
    assert.equal(r.unanswered.some((q) => q.id === 'G51elcost'), false);
  });
});

describe('line 16 — Word question 121: the return entries for each year, beside the PDF', () => {
  const snap = (main: number, special: number) => ({
    version: 3, business: { id: 'b', name: 'Invented Practice Limited' },
    sums: { main_pool_pence: main, special_pool_pence: special },
  }) as unknown as Snapshot;
  test('a company with its accounting period recorded: both pools added in return 1, then five years of allowances at the engine’s rates', () => {
    const rows = returnEntries(snap(10_000_000, 5_000_000), { period_start: '2026-04-01', is_company: true });
    assert.equal(rows.length, 2 + RETURN_YEARS * 4);
    assert.deepEqual(rows.slice(0, 2).map((r) => [r.return_no, r.pool, r.entry, r.amount_pence]),
      [[1, 'Main pool', 'Spend that counts, added to the pool', 10_000_000], [1, 'Special rate pool', 'Spend that counts, added to the pool', 5_000_000]]);
    const y1 = rows.filter((r) => r.return_no === 1 && r.entry === 'Writing-down allowance');
    // A company's period from 1 April 2026 is wholly after the change: 14% on the main pool, 6% on the special rate pool.
    assert.deepEqual(y1.map((r) => [r.pool, r.amount_pence, r.how]), [
      ['Main pool', 1_400_000, '14% of the balance on the pool.'], ['Special rate pool', 300_000, '6% of the balance on the pool.']]);
    assert.equal(rows[2]!.period, '2026-04-01 to 2027-03-31');
    const cf = rows.find((r) => r.return_no === 1 && r.pool === 'Main pool' && r.entry === 'Balance carried forward');
    assert.equal(cf?.amount_pence, 8_600_000);
  });
  test('N4: no accounting period recorded — the main pool’s allowance is left blank and says why; the special rate pool’s 6% is still given', () => {
    const rows = returnEntries(snap(10_000_000, 5_000_000), { period_start: null, is_company: true });
    const main = rows.filter((r) => r.pool === 'Main pool' && r.entry !== 'Spend that counts, added to the pool');
    assert.ok(main.every((r) => r.amount_pence === null), JSON.stringify(main));
    assert.match(main[0]!.how, /The accounting period is not on the claim yet/);
    assert.equal(rows.find((r) => r.pool === 'Special rate pool' && r.entry === 'Writing-down allowance')?.amount_pence, 300_000);
  });
  test('N4: the claimant type not known — a figure stands only where a company and an individual would get the same rate', () => {
    const straddle = returnEntries(snap(10_000_000, 0), { period_start: '2026-04-03', is_company: null });
    assert.equal(straddle.find((r) => r.return_no === 1 && r.pool === 'Main pool' && r.entry === 'Writing-down allowance')?.amount_pence, null,
      'a period from 3 April 2026 is after the companies’ change and before the individuals’: no figure');
    const after = returnEntries(snap(10_000_000, 0), { period_start: '2027-01-01', is_company: null });
    assert.equal(after.find((r) => r.return_no === 1 && r.pool === 'Main pool' && r.entry === 'Writing-down allowance')?.amount_pence, 1_400_000);
  });
  test('the spreadsheet: a header, quoted cells, a cell a spreadsheet would read as a formula made plain, and the version it came from', () => {
    const csv = returnEntriesCsv(snap(10_000_000, 5_000_000), { period_start: '2026-04-01', is_company: true }, 'f'.repeat(64));
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'Return,Accounting period,Pool,Entry,Amount (£),How it is worked out');
    assert.equal(lines[1], '1,2026-04-01 to 2027-03-31,Main pool,"Spend that counts, added to the pool",100000.00,"From the approved survey report: the main pool, after any grant."');
    assert.match(csv, /Invented Practice Limited, approved survey report version 3, fingerprint f{64}/);
    assert.equal(csv.endsWith('\r\n'), true);
    assert.deepEqual(['=SUM(A1)', '+1', '-1', '@x', 'a "b"', 'plain'].map(csvCell), ["'=SUM(A1)", "'+1", "'-1", "'@x", '"a ""b"""', 'plain']);
  });
});

describe('line 18 — Word question 198: Companies House’s company type', () => {
  test('the switch ships off; the source register lists the type as a proposed permitted field', () => {
    assert.equal(COMPANY_TYPE_FROM_REGISTER.enabled, false);
    const ch = SOURCES.find((s) => s.source_id === 'CH_COMPANY');
    assert.ok(ch?.permitted_fields.includes('company_type'));
  });
  test('the mapping, on: ltd and plc are a limited company; an LLP only with the person’s confirmation; anything else is asked', () => {
    const on = { enabled: true };
    assert.deepEqual(['ltd', 'plc', 'LLP', 'private-unlimited', 'private-limited-guarant-nsc', 'scottish-partnership'].map((t) => entityFromCompanyType(t, on)),
      [{ entity: 'ltd', confirm: false }, { entity: 'ltd', confirm: false }, { entity: 'llp', confirm: true }, null, null, null]);
  });
  test('N4: a type not known — absent, blank, null — is asked; and with the switch off nothing is filled in at all', () => {
    const on = { enabled: true };
    assert.deepEqual([undefined, null, '', '  '].map((t) => entityFromCompanyType(t, on)), [null, null, null, null]);
    assert.deepEqual(['ltd', 'llp'].map((t) => entityFromCompanyType(t)), [null, null]);
  });
  test('the search keeps the type only with the switch on; off, the candidate is exactly as before', async () => {
    const t = fixtureTransport({ 'GET /search/companies': { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [
      { title: 'INVENTED DENTAL LLP', company_number: 'OC123456', company_status: 'active', company_type: 'llp', address: { postal_code: 'LE10 1AA' } }] }) } });
    const audit = { append: () => undefined } as never;
    const go = (enabled: boolean) => searchCompanies({ name: 'invented dental', gate: { free_enabled: true } as never,
      deps: { audit, now: () => NOW, transport: t }, secrets: secretsFromValues({ COMPANIES_HOUSE_API_KEY: 'invented-key' }),
      config: { enabled: true, named_in_privacy_notice: true }, typeConfig: { enabled } });
    const off = await go(false), on = await go(true);
    assert.equal(off.state, 'FOUND');
    assert.deepEqual(off.state === 'FOUND' ? off.candidates[0] : null, { name: 'INVENTED DENTAL LLP', number: 'OC123456', status: 'active', office_postcode: 'LE10 1AA' });
    assert.equal(on.state === 'FOUND' ? on.candidates[0]?.company_type : null, 'llp');
  });
});

describe('line 19 — Word question 202: the planning route', () => {
  test('Homedata planning is the chosen route, PlanIt the fallback, and both stay switched off', () => {
    assert.deepEqual([PLANNING_ROUTE.chosen, PLANNING_ROUTE.fallback, PLANNING_ROUTE.question], ['HOMEDATA_PLANNING', 'PLANNING', 202]);
    assert.deepEqual([REGISTER_SWITCHES['HOMEDATA_PLANNING'], REGISTER_SWITCHES['PLANNING']], [false, false]);
  });
  test('the research panel’s planning row says so; no other row carries a chosen route', () => {
    const rows = catalogue();
    const planning = rows.find((r) => r.source_id === 'PLANNING');
    assert.match(planning?.chosen_route ?? '', /Chosen route: Homedata planning.*switched off until our Homedata account is open.*PlanIt.*fallback/);
    assert.deepEqual(rows.filter((r) => r.chosen_route !== null).map((r) => r.source_id), ['PLANNING']);
  });
});

describe('line 20 — Word question 226: the works-VAT answer and VAT on our fee', () => {
  test('only the same business, unchanged: "Reclaimed in full" can reclaim, "Not reclaimable (exempt)" cannot', () => {
    assert.deepEqual([clientVatFromWorks({ works_vat: 'reclaim', works_vat_same_business: true }), clientVatFromWorks({ works_vat: 'exempt', works_vat_same_business: true })],
      ['can_reclaim', 'cannot_reclaim']);
  });
  test('N4: every other answer, and no confirmation ("no", not sure, absent), is not known', () => {
    assert.deepEqual([
      clientVatFromWorks({ works_vat: 'mixed', works_vat_same_business: true }), clientVatFromWorks({ works_vat: 'reclaim', works_vat_same_business: false }),
      clientVatFromWorks({ works_vat: 'exempt' }), clientVatFromWorks({ works_vat: 'exempt', works_vat_same_business: null }), clientVatFromWorks({}), clientVatFromWorks(null),
    ], [null, null, null, null, null, null]);
  });
});

describe('line 21 — the two switches that act only in the survey pack, each on alone: which way they move it', () => {
  /* The flows' direction for the other 27 is counted by 03-app/caprebate-switch-direction.cjs. These two cannot move an
     estimate figure: grant_traced_to_elements is read only by the pack (Suite H, H24), and the flows put the s.187A
     caps only on a seller KNOWN to have claimed, while fvr_requires_past_owner_claim acts only on one known NOT to have. */
  test('fvr_requires_past_owner_claim — BIGGER in the pack: a seller who never claimed, bought in 2019, is unsettled off and clear on', () => {
    const st = new Map(Object.entries({ G8: ['purchase'], G8a: 'property', G9d: '2019-06-01', G11: 'no', G12: 'taxpaying', G14: 'no',
      G14po: 'sold_market', G14pod: '2019-06-01', G14iv: 'no', G14t: 'none', G15: 'no', G14fvr: 'yes' }));
    const off = assessLegal('gp', st, NOW, 'company').verdict.level;
    const on = withSwitch('fvr_requires_past_owner_claim', () => assessLegal('gp', st, NOW, 'company').verdict.level);
    assert.deepEqual([off, on], ['AMBER', 'GREEN']);
  });
  test('grant_traced_to_elements — EITHER WAY in the pack: off, £40,000 of NHS money takes £5,600 off a £140,000 pack; on, matched to the fire alarm it takes £40,000, matched to items that never qualify it takes nothing', async () => {
    const { packSums } = await import('../src/web/pack-sums.ts');
    const { applyGrants } = await import('../src/web/pack-grants.ts');
    const ev = (value: number) => ({ value, source: { kind: 'EVIDENCE' as const, text: 'test' } });
    const L = (id: string, element_id: string, qty: number, rate: number, qpct: number, pool: 'SR' | 'MP') =>
      ({ id, label: id, element_id, unit: 'no', pool, pool_source: null, qty_milli: ev(qty), rate_pence: ev(rate), qpct_bp: ev(qpct), removed: false, removed_source: null });
    const IN = { price_paid_pence: ev(100_000_000), land_pence: ev(20_000_000), gia_milli_m2: ev(1_000_000), building_rate_pence: ev(100_000) };
    const PACK = [L('A', 'LS-SR-001', 1_000_000, 10_000, 10000, 'SR'), L('B', 'LS-MP-003', 1000, 5_000_000, 10000, 'MP'), L('C', 'LS-MP-001', 10_000, 500_000, 5000, 'MP')];
    const q = (ids: readonly string[], trace: boolean) => applyGrants(IN as never, PACK as never, packSums(IN as never, PACK as never),
      [{ id: 'g', payer_class: 'nhs', amount_pence: 4_000_000, element_ids: ids }], { element_trace: trace, connected_no_reduction: false }).sums.qualifying_pence;
    const off = q(['LS-MP-003'], false);
    assert.deepEqual([off, q(['LS-MP-003'], true), q(['SL-X-001'], true)], [13_440_000, 10_000_000, 14_000_000]);
  });
});
