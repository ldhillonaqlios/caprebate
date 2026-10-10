/**
 * PHASE 159e, 10 October 2026 — THE ALLOWANCES ON EACH EVENT, AND THE RETURN ENTRIES (the back end's half).
 *
 * The engine's half is Suite AQ in the site harness. From the stress test of 9 October 2026 (C13, C15, C17, C18) and
 * the Lockwood run (L4). Each test fails on the code before this phase (src/web/allowances.ts did not exist, so this
 * file does not load on it at all):
 *   1  C18, items 7 and 8: a 2019 purchase W2 into the 2024 pool and a 2025 refit W1 in its own year, full expensing
 *      and the 50% allowance on the refit, the half left joining the pool the year after; the report shows each part
 *   2  item 1: the annual investment allowance only on recorded headroom (N4: absent and "none" alike), special rate
 *      first; not for a partnership with a company partner, nor where that is not known; on a second-hand W1
 *      purchase, but not full expensing — unless bought new and unused from the developer; W2 is writing-down only;
 *      the 40% allowance for an individual from 2026
 *   3  item 2: the structures and buildings allowance on work (from the month after it, 2% before April 2020, 3%
 *      after) and on a purchase from the seller's statement; none on homes (supported living)
 *   4  item 3: C13 the dated rates (8% special rate before April 2019, blended across it; 20% main before April 2012);
 *      C17 a pool of £1,000 or less written off
 *   5  item 4: C15 the spreadsheet reads the period the window reads; no version is approved without the year end
 *   6  item 5: the cash basis takes the claim on fixtures away for a sole trader, never for a company
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import * as C from '../src/web/crm.ts';
import * as F from '../src/web/claim-facts.ts';
import * as RT from '../src/web/claim-route.ts';
import * as PE from '../src/web/property-events.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as L from '../src/web/pack-legal.ts';
import * as A from '../src/web/pack-approve.ts';
import * as EV from '../src/web/survey-evidence.ts';
import * as CH from '../src/web/pack-chapters.ts';
import * as REP from '../src/web/survey-report.ts';
import * as RE from '../src/web/return-entries.ts';
import * as AL from '../src/web/allowances.ts';
import type { Snapshot } from '../src/web/pack-approve.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T = '2026-09-08T00:00:00.000Z';
const SAM = actor('SURVEYING', 'u-sam');
const ADMIN = actor('ADMIN');

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

type Ev = { type: string; cost: number | null; date: string };
function claimWith(app: App, tag: string, o: { acquired?: string; events?: Ev[]; claimant?: string; period?: [string, string] | null; stage?: string; sector?: string } = {}) {
  const b = `b-${tag}`, p = `p-${tag}`, as = `as-${tag}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)',
    [b, `Allowance ${tag} Limited`, o.sector ?? 'gp', 'SURVEY', T, o.claimant ?? 'COMPANY']);
  app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at,acquisition_date) VALUES (?,?,?,?,?,?)', [p, b, 'Allowance Surgery', 'ZZ9 9ZZ', T, o.acquired ?? '2019-06-15']);
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [as, b, o.sector ?? 'gp', T, null, 19_500_000, T]);
  app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [`e-${tag}`, as, b, 19_500_000, 0.3, 0, 0, 0, 1, 0, T, 'not-a-real-hash']);
  if (o.events !== undefined) PE.writeAssessmentEvents(app.db, randomUUID, { property_id: p, business_id: b, assessment_id: as, at: T }, o.events);
  const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: as, workstream: 'PLANT_AND_MACHINERY', stage: o.stage ?? 'VALUATION', owner_id: null, surveyor_id: null });
  if (o.period !== undefined && o.period !== null) { CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_START', o.period[0]); CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_END', o.period[1]); }
  return { b, p, as, claim: claim.id, ref: { id: claim.id, business_id: b, property_id: p } };
}
/** The client's year end, answered in the portal and ticked as checked by Sales. */
function yearEnd(app: App, business: string, answer = '31 December'): void {
  const id = `ct-${randomUUID()}`;
  app.db.run('INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, fact_id, sent_to_portal_at) ' +
    "VALUES (?, ?, 'u-SALES', 'Your year end?', 'why', 'this claim', 'ANSWERED', 'ANSWERED', ?, ?, NULL, 'CLIENT', ?, 'year_end', ?)", [id, business, answer, T, T, T]);
  app.db.run("INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, 'APPROVED', NULL, 'u-SALES', ?)", [randomUUID(), business, `ans.${id}`, T]);
}
const view = (app: App, job: string) => SP.packView(deps(app), SAM, job);
const lview = (app: App, job: string) => L.legalView(deps(app), SAM, job);
function packed(app: App, tag: string, events: Ev[], acquired: string, o: { period?: [string, string] | null } = {}) {
  const a = claimWith(app, tag, { acquired, events, ...(o.period === undefined ? {} : { period: o.period }) });
  const job = `job-${tag}`;
  app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [job, a.b, a.as, 'u-sam', 'SEALED', null, T, a.claim]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-epc-${tag}`, a.b, 'EPC', `RRN-${tag}`, JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T, a.p]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-title-${tag}`, a.b, 'HMLR_TITLE', `ZZ${tag}`, JSON.stringify({ title_number: `ZZ${tag}`, price_paid: 650000 }), T, a.p]);
  const keep = view(app, job).lines.slice(0, 2).map((l) => l.id);
  for (const l of view(app, job).lines) { if (keep.includes(l.id) || l.removed) continue; ok(SP.setLineRemoved(deps(app), SAM, job, { line: l.id, reason: 'Not here', seq: String(view(app, job).seq) }, true)); }
  ok(SP.saveLine(deps(app), SAM, job, { line: keep[0] as string, qty: '10', rate: '2000', qpct: '100', pool: 'SR', reason: 'Counted', seq: String(view(app, job).seq) }));
  ok(SP.saveLine(deps(app), SAM, job, { line: keep[1] as string, qty: '100', rate: '300', qpct: '100', pool: 'MP', reason: 'Counted', seq: String(view(app, job).seq) }));
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'land', value: '150000', reason: 'Land registry', seq: String(view(app, job).seq) }));
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'building_rate', value: '1500', reason: 'BCIS', seq: String(view(app, job).seq) }));
  ok(EV.setBasis(deps(app), SAM, job, { basis: 'DESKTOP_EVIDENCE', note: '' }));
  A.saveDetails(deps(app), SAM, job, { rics_number: '1234567', firm: 'Survey Firm' });
  for (const [q, v] of [['G8', ['new_build']], ['G9d', [acquired]]] as const) {
    if (lview(app, job).asked.some((x) => x.id === q)) ok(L.answerLegal(deps(app), SAM, job, { question: q, values: [...v], source: 'The contract', seq: String(lview(app, job).seq) }));
  }
  return { ...a, job };
}
const REFIT = { works_total: '90000', works_main: '30000', works_special: '20000', works_bwic: '5000', works_demolition: '1000', works_other: '20000', works_repairs: '4000', works_prelims: '6000', works_fees: '4000' };
function priceWorks(app: App, a: { job: string }) {
  for (const w of view(app, a.job).works) ok(SP.saveWorks(deps(app), SAM, a.job, { event: w.event.id, reason: 'From the final account', seq: String(view(app, a.job).seq), values: REFIT }));
}
function approve(app: App, job: string) {
  for (const c of CH.chaptersToRead()) A.recordRead(deps(app), SAM, job, c, lview(app, job).seq);
  return A.approvePack(deps(app), SAM, job, { seq: String(view(app, job).seq), legal_seq: String(lview(app, job).seq) });
}
const row = (es: readonly RE.ReturnEntry[], n: number, pool: string, entry: string | RegExp) =>
  es.find((e) => e.return_no === n && e.pool === pool && (typeof entry === 'string' ? e.entry === entry : entry.test(e.entry)));

/* ------------------------------------------------------------------ synthetic versions, for the rules alone */

type Route = { route: string; kind: string; event_id: string | null; event_date: string | null; period: { start: string; end: string } | null; first_open?: { start: string; end: string } | null; label?: string; words?: string };
function snap(o: { purchase?: { main: number; special: number; date?: string } | null; works?: { id: string; label: string; date: string; main: number; special: number; total?: number; qualifying?: number; repairs?: number }[]; routes?: Route[]; sector?: string }): Snapshot {
  const works = (o.works ?? []).map((w) => ({ event_id: w.id, kind: 'REFURBISHMENT', event_date: w.date, label: w.label,
    inputs: { works_total: w.total ?? w.main + w.special }, qualifying_pence: w.qualifying ?? w.main + w.special, main_pool_pence: w.main, special_pool_pence: w.special, repairs_pence: w.repairs ?? 0 }));
  const p = o.purchase ?? null;
  return {
    version: 1, business: { id: 'b', name: 'Invented Practice Limited' }, job: { id: 'j', sector: o.sector ?? 'gp' },
    sums: { main_pool_pence: (p?.main ?? 0) + works.reduce((a, w) => a + w.main_pool_pence, 0), special_pool_pence: (p?.special ?? 0) + works.reduce((a, w) => a + w.special_pool_pence, 0) },
    ...(works.length === 0 ? {} : { events: { purchase_applies: p !== null, purchase: p === null ? null : { qualifying_pence: p.main + p.special, main_pool_pence: p.main, special_pool_pence: p.special }, works } }),
    routes: o.routes ?? [],
  } as unknown as Snapshot;
}
const Y = (y: number) => ({ start: `${String(y)}-01-01`, end: `${String(y)}-12-31` });
const facts = (f: Partial<AL.AllowanceFacts>): AL.AllowanceFacts => ({ ...AL.NO_FACTS, ...f });

describe('1 · C18, items 7 and 8 — each part in its own year, with its own first-year relief', () => {
  test('a 2019 purchase goes into the 2024 pool (W2); a June 2025 refit takes full expensing and the 50% allowance in 2025 (W1); the report shows each part', async () => {
    const app = await world();
    const a = packed(app, 'A', [{ type: 'purchase', cost: 650000, date: '06/2019' }, { type: 'refurb', cost: 90000, date: '06/2025' }], '2019-06-01', { period: null });
    yearEnd(app, a.b);
    CF.fact(app, a.claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
    CF.fact(app, a.claim, 'SBA_STATEMENT_HELD', 'YES', 'CLIENT_DOC');
    CF.fact(app, a.claim, 'SBA_QUALIFYING_EXPENDITURE', '200000', 'CLIENT_DOC');
    priceWorks(app, a);
    ok(approve(app, a.job));
    const kept = A.approvedVersion(deps(app), ADMIN, a.job, 1)!;
    const purchase = view(app, a.job).purchase_sums;
    const es = RE.returnEntries(kept.snapshot, RE.returnContextFor(app.db, kept.row.id, a.claim, a.b));
    // Return 1 is 2024, the first year still open: the purchase goes in there, writing-down allowances only.
    assert.equal(row(es, 1, 'Main pool', 'Writing-down allowance')?.period, '2024-01-01 to 2024-12-31');
    assert.equal(row(es, 1, 'Main pool', 'Spend that counts, added to the pool: the purchase')?.amount_pence, purchase.main_pool_pence);
    assert.match(row(es, 1, 'Main pool', 'Spend that counts, added to the pool: the purchase')?.how ?? '', /W2/);
    assert.equal(row(es, 1, 'Main pool', /Full expensing/), undefined, 'W2: no first-year relief');
    // Return 2 is 2025: the refit, full expensing on its £37,800 of main pool plant, 50% of its £25,200 special rate.
    const label = 'A refurbishment or refit, June 2025';
    assert.equal(row(es, 2, 'Main pool', `Spend that counts: ${label}`)?.period, '2025-01-01 to 2025-12-31');
    assert.equal(row(es, 2, 'Main pool', `Full expensing: ${label}`)?.amount_pence, 3_780_000);
    assert.equal(row(es, 2, 'Special rate pool', `First-year allowance at 50%: ${label}`)?.amount_pence, 1_260_000);
    // The other half joins the special rate pool in 2026.
    assert.equal(row(es, 3, 'Special rate pool', `Added to the pool from last year’s first-year allowance: ${label}`)?.amount_pence, 1_260_000);
    // Item 2: the purchase's structures allowance from the seller's statement, a full 2024 at 3%; the refit's from July 2025.
    assert.equal(row(es, 1, 'Structures and buildings allowance', 'Structures and buildings allowance: the purchase')?.amount_pence, 600_000);
    assert.equal(row(es, 2, 'Structures and buildings allowance', `Structures and buildings allowance: ${label}`)?.amount_pence, Math.round(2_250_000 * 0.03 * 184 / 365));
    // Return 2's total is every allowance in it.
    const r2 = (pool: string, entry: string | RegExp) => row(es, 2, pool, entry)?.amount_pence ?? Number.NaN;
    assert.equal(row(es, 2, 'All', 'All the allowances in this return')?.amount_pence,
      r2('Main pool', /^Full expensing/) + r2('Special rate pool', /^First-year allowance/) + r2('Main pool', 'Writing-down allowance') + r2('Special rate pool', 'Writing-down allowance')
      + r2('Structures and buildings allowance', /the purchase/) + r2('Structures and buildings allowance', new RegExp(label)));
    // Item 6: the report says the same, part by part and year by year.
    const m = REP.reportModel(kept.snapshot, kept.row.fingerprint, RE.contextForApproval(app.db, kept.row.id));
    assert.deepEqual(m.allowances.parts.map((p) => [p.part, p.year]), [['The purchase', '1 January 2024 to 31 December 2024'], [label, '1 January 2025 to 31 December 2025']]);
    assert.match(m.allowances.parts[1]?.reliefs ?? '', /Full expensing £37,800; First-year allowance at 50% £12,600/);
    assert.match(m.allowances.parts[1]?.to_pool ?? '', /£12,600 the year after/);
    assert.match(String(REP.reportHtml(m, { pdf: null })), /The allowances, part by part[\s\S]*Year by year/);
    app.close();
  });
});

describe('2 · item 1 — first-year relief by route and claimant', () => {
  const work = { id: 'w1', label: 'A refit, June 2025', date: '2025-06', main: 4_000_000, special: 1_000_000 };
  const w1 = (date = '2025-06', id = 'w1'): Route => ({ route: 'W1', kind: 'REFURBISHMENT', event_id: id, event_date: date, period: Y(Number(date.slice(0, 4))) });
  test('N4: the annual investment allowance only on recorded headroom — absent and "none" alike give none; special rate first', () => {
    for (const f of [facts({ claimant: 'SOLE_TRADER' }), facts({ claimant: 'SOLE_TRADER', aia_headroom_pence: 0 })]) {
      const a = AL.allowancesFor(snap({ works: [work], routes: [w1()] }), { period_start: null, is_company: false, facts: f });
      assert.deepEqual(a.parts[0]?.reliefs, [], JSON.stringify(f));
    }
    const a = AL.allowancesFor(snap({ works: [work], routes: [w1()] }), { period_start: null, is_company: false, facts: facts({ claimant: 'SOLE_TRADER', aia_headroom_pence: 2_000_000 }) });
    assert.deepEqual(a.parts[0]?.reliefs.map((r) => [r.name, r.pool, r.pence]), [
      ['Annual investment allowance', 'Special rate pool', 1_000_000], ['Annual investment allowance', 'Main pool', 1_000_000]]);
    assert.deepEqual(a.parts[0]?.to_pool_now, { main: 3_000_000, special: 0 }, 'what the headroom did not cover is written down this year');
  });
  test('not for a partnership with a company partner, nor where that is not known', () => {
    for (const member of [true, null]) {
      const a = AL.allowancesFor(snap({ works: [work], routes: [w1()] }), { period_start: null, is_company: false, facts: facts({ claimant: 'PARTNERSHIP', company_member: member, aia_headroom_pence: 100_000_000 }) });
      assert.deepEqual(a.parts[0]?.reliefs, []);
      assert.match(a.parts[0]?.no_relief_why[0] ?? '', /company as a partner/);
    }
  });
  test('a company: AIA on the special rate pool, full expensing on the main pool — not AIA spent on what full expensing covers', () => {
    const a = AL.allowancesFor(snap({ works: [work], routes: [w1()] }), { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY', aia_headroom_pence: 100_000_000 }) });
    assert.deepEqual(a.parts[0]?.reliefs.map((r) => [r.name, r.pence]), [['Annual investment allowance', 1_000_000], ['Full expensing', 4_000_000]]);
  });
  test('the 40% allowance (s.45U) for an individual on new main pool plant from January 2026; the rest joins the pool the year after', () => {
    const a = AL.allowancesFor(snap({ works: [{ ...work, date: '2026-02' }], routes: [w1('2026-02')] }), { period_start: null, is_company: false, facts: facts({ claimant: 'SOLE_TRADER' }) });
    assert.deepEqual(a.parts[0]?.reliefs.map((r) => [r.name, r.pence]), [['First-year allowance at 40%', 1_600_000]]);
    assert.deepEqual(a.parts[0]?.to_pool_next, { main: 2_400_000, special: 0 });
  });
  test('a W1 purchase is second-hand: AIA on recorded headroom, never full expensing — unless bought new and unused from the developer', () => {
    const r: Route = { route: 'W1', kind: 'PURCHASE', event_id: null, event_date: '2025-06-01', period: Y(2025) };
    const s = snap({ purchase: { main: 4_000_000, special: 1_000_000 }, routes: [r] });
    const used = AL.allowancesFor(s, { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY', aia_headroom_pence: 1_500_000 }) });
    assert.deepEqual(used.parts[0]?.reliefs.map((x) => [x.name, x.pence]), [['Annual investment allowance', 1_000_000], ['Annual investment allowance', 500_000]]);
    assert.match(used.parts[0]?.no_relief_why.join(' ') ?? '', /second-hand/);
    const fresh = AL.allowancesFor(s, { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY', new_from_developer: true }) });
    assert.deepEqual(fresh.parts[0]?.reliefs.map((x) => [x.name, x.pence]), [['Full expensing', 4_000_000], ['First-year allowance at 50%', 500_000]]);
  });
  test('W2 is writing-down allowances only, and a route not settled grants nothing (N4)', () => {
    for (const route of ['W2', 'NOT_KNOWN']) {
      const a = AL.allowancesFor(snap({ works: [work], routes: [{ ...w1(), route, first_open: Y(2025) }] }), { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY', aia_headroom_pence: 100_000_000 }) });
      assert.deepEqual(a.parts[0]?.reliefs, [], route);
    }
  });
});

describe('3 · item 2 — the structures and buildings allowance', () => {
  const wk = (date: string) => ({ id: 'w', label: 'An extension', date, main: 2_000_000, special: 1_000_000, total: 13_000_000, qualifying: 3_000_000, repairs: 0 });
  test('on work: the part that is not plant or repair, from the month after it — 2% a year before April 2020, 3% after', () => {
    const a = AL.allowancesFor(snap({ works: [wk('2018-11')], routes: [{ route: 'W1', kind: 'EXTENSION', event_id: 'w', event_date: '2018-11', period: Y(2018) }] }), { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY' }) });
    const p = a.parts[0]!;
    assert.equal(p.sba.base_pence, 10_000_000);
    assert.equal(p.sba.from, '2018-12-01');
    assert.equal(p.sba.by_return[0], Math.round(10_000_000 * 0.02 * 31 / 365), 'December 2018, at 2%');
    assert.equal(p.sba.by_return[1], 200_000, '2019, a whole year at 2%');
    assert.equal(p.sba.by_return[3], 300_000, '2021, a whole year at 3%');
    const before = AL.allowancesFor(snap({ works: [wk('2018-10')], routes: [{ route: 'W1', kind: 'EXTENSION', event_id: 'w', event_date: '2018-10', period: Y(2018) }] }), { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY' }) });
    assert.equal(before.parts[0]?.sba.applies, false, 'October 2018 may be before the contract date: none');
  });
  test('none on homes (supported living); a purchase from the seller’s statement, or not worked out until it is held', () => {
    const homes = AL.allowancesFor(snap({ sector: 'supported_living', works: [wk('2022-05')], routes: [{ route: 'W1', kind: 'EXTENSION', event_id: 'w', event_date: '2022-05', period: Y(2022) }] }), { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY' }) });
    assert.equal(homes.parts[0]?.sba.applies, false);
    assert.match(homes.parts[0]?.sba.why ?? '', /s\.270CF/);
    const r: Route = { route: 'W1', kind: 'PURCHASE', event_id: null, event_date: '2025-07-01', period: Y(2025) };
    const s = snap({ purchase: { main: 100, special: 100 }, routes: [r] });
    const asked = AL.allowancesFor(s, { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY' }) });
    assert.equal(asked.parts[0]?.sba.applies, null);
    assert.equal(asked.periods[0]?.total_pence, null, 'a figure not known leaves the year’s total not known');
    const none = AL.allowancesFor(s, { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY', sba_statement: false }) });
    assert.equal(none.parts[0]?.sba.applies, false, 'no statement, as recorded: none, and the year’s total stands');
    assert.notEqual(none.periods[0]?.total_pence, null);
    const held = AL.allowancesFor(s, { period_start: null, is_company: true, facts: facts({ claimant: 'COMPANY', sba_statement: true, sba_purchase_pence: 36_500_000 }) });
    assert.equal(held.parts[0]?.sba.by_return[0], Math.round(36_500_000 * 0.03 * 184 / 365), 'from the purchase date, 1 July 2025');
  });
});

describe('4 · item 3 — the rates by date (C13) and the small pools (C17)', () => {
  const bare = (main: number, special: number) => snap({ purchase: { main, special } });
  test('the special rate pool at 8% in 2018, 6.5% across April 2019, 6% after; the main pool at 20% in 2011', () => {
    const a = AL.allowancesFor(bare(10_000_000, 10_000_000), { period_start: '2018-01-01', is_company: true, facts: null });
    assert.deepEqual(a.periods.slice(0, 3).map((p) => p.pools['Special rate pool'].rate), [0.08, 0.065, 0.06]);
    const es = RE.returnEntries(bare(10_000_000, 10_000_000), { period_start: '2011-01-01', is_company: true });
    assert.equal(row(es, 1, 'Main pool', 'Writing-down allowance')?.how, '20% of the balance on the pool.');
    assert.equal(row(es, 1, 'Main pool', 'Writing-down allowance')?.amount_pence, 2_000_000);
  });
  test('a pool of £1,000 or less is written off in full (s.56A), and says so', () => {
    const es = RE.returnEntries(bare(80_000, 2_000_000), { period_start: '2024-01-01', is_company: true });
    assert.equal(row(es, 1, 'Main pool', 'Small pool written off')?.amount_pence, 80_000);
    assert.match(row(es, 1, 'Main pool', 'Small pool written off')?.how ?? '', /£1,000 or less/);
    assert.equal(row(es, 1, 'Main pool', 'Balance carried forward')?.amount_pence, 0);
  });
});

describe('5 · item 4 — one period source (C15, L4), and the year end before approval', () => {
  test('no period recorded, the client’s checked year end: the spreadsheet reads the period the window reads', async () => {
    const app = await world();
    const a = claimWith(app, 'C', { acquired: '2025-02-10', period: null, stage: 'REPORTS' });
    assert.equal(RE.returnContext(app.db, a.claim, a.b).period_start, null);
    yearEnd(app, a.b, '31 March');
    const w = F.amendmentWindowReading(app.db, a.ref, '2026-10-09T12:00:00.000Z');
    assert.match(w.why, /1 Apr 2024 to 31 Mar 2025/);
    assert.equal(RE.returnContext(app.db, a.claim, a.b).period_start, '2024-04-01');
    app.close();
  });
  test('a version is not approved until the year end (or the accounting period) is on the claim', async () => {
    const app = await world();
    const a = packed(app, 'D', [{ type: 'purchase', cost: 650000, date: '06/2025' }], '2025-06-01', { period: null });
    const r = approve(app, a.job);
    assert.equal(r.ok, false);
    assert.match((r as { why: string }).why, /Record the client’s year end first/);
    yearEnd(app, a.b);
    ok(approve(app, a.job));
    app.close();
  });
});

describe('6 · item 5 — the cash basis', () => {
  test('a sole trader on the cash basis claims nothing on the fixtures (W3); a company’s answer does not apply', async () => {
    const app = await world();
    const s = claimWith(app, 'E', { claimant: 'SOLE_TRADER', acquired: '2025-06-01', period: ['2025-04-06', '2026-04-05'] });
    CF.fact(app, s.claim, 'CASH_BASIS', 'CASH', 'CLIENT_ANSWER');
    const r = RT.claimRoutes(app.db, s.ref, '2026-10-09T12:00:00.000Z')[0]!;
    assert.equal(r.route, 'W3');
    assert.match(r.why, /cash basis/);
    const c = claimWith(app, 'F', { acquired: '2025-06-01', period: ['2025-01-01', '2025-12-31'] });
    CF.fact(app, c.claim, 'CASH_BASIS', 'CASH', 'CLIENT_ANSWER');
    assert.equal(RT.claimRoutes(app.db, c.ref, '2026-10-09T12:00:00.000Z')[0]?.route, 'W1');
    for (const k of ['CASH_BASIS', 'BOUGHT_NEW_FROM_DEVELOPER', 'SBA_STATEMENT_HELD']) assert.ok(F.FACTS[k], `${k} is on the facts panel`);
    app.close();
  });
});
