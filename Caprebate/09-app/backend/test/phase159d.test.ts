/**
 * PHASE 159d, 9 October 2026 — EACH EVENT'S ROUTE: THE DEADLINE GATE, AND "DO YOU STILL OWN IT" (the back end's half).
 *
 * The engine's half is Suite AP in the site harness. From the stress test of 9 October 2026 (C1, C9, C10, C24, C25, C27)
 * and the Lockwood run (L9). Each test fails on the code before this phase:
 *   1  a purchase whose window has closed, still owned, goes into the first open period's pool (W2) and passes Reports;
 *      not owned is W3; ownership not known is no route, and passes nothing (N4)
 *   2  "do you still own it": the recorded fact, the title register naming the client's company, and a sale date
 *   3  "outside the amendment window" ends a claim only where every part is W3; the early warning says "this year's pool"
 *   4  the invoice tests the return each route names
 *   5  the route is decided per event: a 2019 purchase W2 beside a 2025 refit W1; a work dated across two periods is
 *      not placed
 *   6  C9: a legal check clear only until a deadline that has passed stops the sign-off and Reports
 *   7  C24 the charity types; C25 basis period reform, on the back end's window
 *   8  item 8: a purchase that fails the legal check is W3 on its own; the works stand, and the report says so
 *   9  item 6: the portal and the report say how each part goes in
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp, actor } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import * as C from '../src/web/crm.ts';
import * as F from '../src/web/claim-facts.ts';
import * as R from '../src/web/claim-record.ts';
import * as P from '../src/web/pipeline.ts';
import * as RT from '../src/web/claim-route.ts';
import * as PE from '../src/web/property-events.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as L from '../src/web/pack-legal.ts';
import * as A from '../src/web/pack-approve.ts';
import * as EV from '../src/web/survey-evidence.ts';
import * as CH from '../src/web/pack-chapters.ts';
import * as REP from '../src/web/survey-report.ts';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T = '2026-09-08T00:00:00.000Z';
const TODAY = '2026-10-09T12:00:00.000Z';
const SAM = actor('SURVEYING', 'u-sam');
const ADMIN = actor('ADMIN');
const SALES = actor('SALES');

async function world(): Promise<App> {
  const app = await testApp();
  for (const [id, role] of [['u-sam', 'SURVEYING'], ['u-ADMIN', 'ADMIN'], ['u-SALES', 'SALES'], ['u-SURVEYING', 'SURVEYING'], ['u-ACCOUNTING', 'ACCOUNTING']] as const) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, `${id}@x.invalid`, `${id}@x.invalid`, `${id} name`, role, 'x', T, T]);
  }
  return app;
}
const deps = (app: App) => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });
const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));

type Ev = { type: string; cost: number | null; date: string };
/** A company that bought a GP surgery (and perhaps refitted it), at Reports, its year end 31 December. */
function claimWith(app: App, tag: string, o: { acquired?: string; events?: Ev[]; claimant?: string; period?: [string, string] | null; stage?: string } = {}) {
  const b = `b-${tag}`, p = `p-${tag}`, as = `as-${tag}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type,company_number) VALUES (?,?,?,?,?,?,?)',
    [b, `Route ${tag} Limited`, 'gp', 'SURVEY', T, o.claimant ?? 'COMPANY', `0${String(1000000 + tag.length)}`.slice(0, 8)]);
  app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at,acquisition_date) VALUES (?,?,?,?,?,?)', [p, b, 'Route Surgery', 'ZZ9 9ZZ', T, o.acquired ?? '2019-06-15']);
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [as, b, 'gp', T, null, 19_500_000, T]);
  app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [`e-${tag}`, as, b, 19_500_000, 0.3, 0, 0, 0, 1, 0, T, 'not-a-real-hash']);
  if (o.events !== undefined) PE.writeAssessmentEvents(app.db, randomUUID, { property_id: p, business_id: b, assessment_id: as, at: T }, o.events);
  const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: as, workstream: 'PLANT_AND_MACHINERY', stage: o.stage ?? 'REPORTS', owner_id: null, surveyor_id: null });
  const period = o.period === undefined ? ['2019-01-01', '2019-12-31'] as [string, string] : o.period;
  if (period !== null) { CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_START', period[0]); CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_END', period[1]); }
  return { b, p, as, claim: claim.id, ref: { id: claim.id, business_id: b, property_id: p } };
}
/** The client's year end, answered in the portal and ticked as checked by Sales (as test/phase158d.test.ts records one). */
function yearEnd(app: App, business: string, answer = '31 December'): void {
  const id = `ct-${randomUUID()}`;
  app.db.run('INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, fact_id, sent_to_portal_at) ' +
    "VALUES (?, ?, 'u-SALES', 'Your year end?', 'why', 'this claim', 'ANSWERED', 'ANSWERED', ?, ?, NULL, 'CLIENT', ?, 'year_end', ?)", [id, business, answer, T, T, T]);
  app.db.run("INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, 'APPROVED', NULL, 'u-SALES', ?)", [randomUUID(), business, `ans.${id}`, T]);
}

describe('1 · C1, L9 — a closed window, still owned, goes into this year’s pool (W2)', () => {
  test('a company that bought in June 2019: not owned-known is no route; still owned is W2 and passes Reports; sold is W3', async () => {
    const app = await world();
    const a = claimWith(app, 'A');
    const reports = () => R.reportsWindowNeed(app.db, a.ref, TODAY);
    // The window for 2019 closed on 31 December 2021. Ownership not recorded: no route, and Reports refuses (N4).
    assert.equal(RT.claimRoutes(app.db, a.ref, TODAY)[0]?.route, 'NOT_KNOWN');
    assert.equal(reports().met, false);
    CF.fact(app, a.claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
    const r = RT.claimRoutes(app.db, a.ref, TODAY)[0]!;
    assert.equal(r.route, 'W2', r.why);
    assert.deepEqual([r.first_open?.start, r.first_open?.end, r.first_open?.deadline], ['2024-01-01', '2024-12-31', '2026-12-31'], 'the first period still open is 2024');
    assert.match(r.words, /this year’s pool/);
    assert.equal(reports().met, true, reports().why);
    // Recorded as sold: W3, and nothing left to claim.
    CF.fact(app, a.claim, 'STILL_OWNED', 'NO', 'CLIENT_ANSWER');
    assert.equal(RT.claimRoutes(app.db, a.ref, TODAY)[0]?.route, 'W3');
    assert.match(reports().why, /nothing is left to claim/);
    app.close();
  });
});

describe('2 · "do you still own it"', () => {
  test('the title register naming the client’s company is evidence; a sale date on the property is NO, whatever was recorded', async () => {
    const app = await world();
    const a = claimWith(app, 'B');
    const co = app.db.get<{ n: string }>('SELECT company_number AS n FROM businesses WHERE id = ?', [a.b])!.n;
    assert.equal(RT.stillOwned(app.db, a.ref).value, null);
    app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), a.b, 'HMLR_TITLE', 'ZZ1', JSON.stringify({ title_number: 'ZZ1', proprietor_company_number: co }), T, a.p]);
    assert.deepEqual(RT.stillOwned(app.db, a.ref), { value: 'YES', why: 'the current title register names the client’s company as the owner' });
    CF.fact(app, a.claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
    app.db.run("UPDATE properties SET disposal_date = '2026-01-31' WHERE id = ?", [a.p]);
    assert.equal(RT.stillOwned(app.db, a.ref).value, 'NO');
    assert.ok(F.FACTS['STILL_OWNED'], 'the fact is on the facts panel');
    app.close();
  });
});

describe('3 · the window exit and the early warning', () => {
  test('"outside the amendment window" is refused while any part goes in, and taken once every part is W3', async () => {
    const app = await world();
    const a = claimWith(app, 'C', { stage: 'SURVEY' });
    CF.fact(app, a.claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
    const exit = () => P.moveClaim(deps(app), SALES, a.claim, { kind: 'EXIT', to: 'OUTSIDE_AMENDMENT_WINDOW', reason_code: 'AMENDMENT_WINDOW_CLOSED' }, { today: TODAY });
    const refused = exit();
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? '' : refused.why, /does not stop for the window.*W2/);
    app.db.run("UPDATE properties SET disposal_date = '2026-01-31' WHERE id = ?", [a.p]);
    ok(exit());
    app.close();
  });
  test('the early warning says the relief comes through this year’s pool, not that the claim is lost', () => {
    const s = F.earlyWindowWarning;
    assert.equal(typeof s, 'function');
    assert.match(String(F.earlyWindowWarning.toString()), /relief comes through this year’s pool/);
  });
});

describe('4 · the invoice tests the return each route names', () => {
  test('W2: the first open return’s window; a filing inside a part’s own window passes after it has closed', async () => {
    const app = await world();
    const a = claimWith(app, 'D');
    CF.fact(app, a.claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
    const inv = (today: string) => R.invoiceWindowNeed(app.db, a.ref, today);
    assert.equal(inv(TODAY).met, true, inv(TODAY).why);
    assert.match(inv(TODAY).why, /the first open return can be amended until 2026-12-31/);
    // A claim of 2025 spend filed in time passes in 2028, after its window has closed.
    const b = claimWith(app, 'E', { acquired: '2025-06-15', period: ['2025-01-01', '2025-12-31'] });
    CF.filingRecorded(app, b.claim, '2026-09-01');
    assert.equal(R.invoiceWindowNeed(app.db, b.ref, '2028-06-01T12:00:00.000Z').met, true);
    app.close();
  });
});

describe('5 · the route is decided per event', () => {
  test('a 2019 purchase, still owned, is W2; a 2025 refit is W1; a work dated across two periods is not placed', async () => {
    const app = await world();
    const a = claimWith(app, 'F', { events: [{ type: 'purchase', cost: 650000, date: '06/2019' }, { type: 'refurb', cost: 90000, date: '06/2025' }] });
    yearEnd(app, a.b);
    CF.fact(app, a.claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
    const routes = RT.claimRoutes(app.db, a.ref, TODAY);
    assert.deepEqual(routes.map((r) => [r.label, r.route]), [['The purchase, June 2019', 'W2'], ['A refurbishment or refit, June 2025', 'W1']]);
    assert.equal(routes[1]?.deadline, '2027-12-31');
    assert.equal(R.reportsWindowNeed(app.db, a.ref, TODAY).met, true);
    // A year end of 31 March and a work dated only "2024": it could fall in either period, so it is not placed.
    const b = claimWith(app, 'G', { events: [{ type: 'purchase', cost: 650000, date: '06/2019' }, { type: 'refurb', cost: 90000, date: '2024' }] });
    yearEnd(app, b.b, '31 March');
    CF.fact(app, b.claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
    const w = RT.claimRoutes(app.db, b.ref, TODAY)[1]!;
    assert.equal(w.route, 'NOT_KNOWN');
    assert.match(w.why, /either of two accounting periods/);
    assert.equal(R.reportsWindowNeed(app.db, b.ref, TODAY).met, false, 'a part with no route passed Reports');
    // Redecoration takes no route: it is a repair, not an allowance.
    const c = claimWith(app, 'H', { acquired: '2025-06-15', period: ['2025-01-01', '2025-12-31'], events: [{ type: 'purchase', cost: 650000, date: '06/2025' }, { type: 'cosmetic', cost: 5000, date: '2025' }] });
    assert.deepEqual(RT.claimRoutes(app.db, c.ref, TODAY).map((r) => r.kind), ['PURCHASE']);
    app.close();
  });
});

/* ------------------------------------------------------------------ the pack, for 6 and 8 */

const view = (app: App, job: string) => SP.packView(deps(app), SAM, job);
const lview = (app: App, job: string) => L.legalView(deps(app), SAM, job);
function packed(app: App, tag: string, events: Ev[], acquired: string) {
  const a = claimWith(app, tag, { acquired, period: [`${acquired.slice(0, 4)}-01-01`, `${acquired.slice(0, 4)}-12-31`], events, stage: 'VALUATION' });
  const job = `job-${tag}`;
  app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [job, a.b, a.as, 'u-sam', 'SEALED', null, T, a.claim]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-epc-${tag}`, a.b, 'EPC', `RRN-${tag}`, JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T, a.p]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-title-${tag}`, a.b, 'HMLR_TITLE', `ZZ${tag}`, JSON.stringify({ title_number: `ZZ${tag}`, price_paid: 650000 }), T, a.p]);
  const keep = view(app, job).lines.slice(0, 2).map((l) => l.id);
  for (const l of view(app, job).lines) { if (keep.includes(l.id) || l.removed) continue; ok(SP.setLineRemoved(deps(app), SAM, job, { line: l.id, reason: 'Not here', seq: String(view(app, job).seq) }, true)); }
  ok(SP.saveLine(deps(app), SAM, job, { line: keep[0] as string, qty: '10', rate: '2000', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', qpct: '100', pool: 'SR', reason: 'Counted', seq: String(view(app, job).seq) }));
  ok(SP.saveLine(deps(app), SAM, job, { line: keep[1] as string, qty: '100', rate: '300', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', qpct: '100', pool: 'MP', reason: 'Counted', seq: String(view(app, job).seq) }));
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'land', value: '150000', reason: 'Land registry', seq: String(view(app, job).seq) }));
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'building_rate', value: '1500', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', reason: 'BCIS', seq: String(view(app, job).seq) }));
  ok(EV.setBasis(deps(app), SAM, job, { basis: 'DESKTOP_EVIDENCE', note: '' }));
  A.saveDetails(deps(app), SAM, job, { rics_number: '1234567', firm: 'Survey Firm' });
  return { ...a, job };
}
/** The legal check for a purchase from a tax-paying seller who claimed, directly, with no election and no tribunal. */
function legalPurchase(app: App, job: string, date: string) {
  const answers: [string, string[]][] = [['G8', ['purchase']], ['G8a', ['property']], ['G9d', [date]], ['G11', ['yes']], ['G12', ['taxpaying']], ['G14s', ['sale']],
    ['G14', ['no']], ['G14po', ['sold_market']], ['G14pod', [date]], ['G14t', ['none']], ['G15', ['no']], ['G14fvr', ['no']]];
  for (const [q, v] of answers) {
    if (!lview(app, job).asked.some((x) => x.id === q)) continue;
    ok(L.answerLegal(deps(app), SAM, job, { question: q, values: v, source: 'The CPSE replies', seq: String(lview(app, job).seq) }));
  }
}
function approve(app: App, job: string) {
  for (const c of CH.chaptersToRead()) A.recordRead(deps(app), SAM, job, c, lview(app, job).seq);
  return A.approvePack(deps(app), SAM, job, { seq: String(view(app, job).seq), legal_seq: String(lview(app, job).seq) });
}

describe('6 · C9 — a legal check clear only until a deadline is read again', () => {
  test('approved while there was time to fix the value; after the deadline, the sign-off and Reports stop until it is fixed', async () => {
    const app = await world();
    const a = packed(app, 'J', [{ type: 'purchase', cost: 650000, date: '06/2025' }], '2025-06-01');
    legalPurchase(app, a.job, '2025-06-01');
    const lv = lview(app, a.job);
    assert.equal(lv.verdict.level, 'URGENT', JSON.stringify(lv.verdict));
    assert.equal(lv.verdict.deadline, '2027-05-31', 'C10: the day before the second anniversary');
    ok(approve(app, a.job));
    assert.equal(RT.legalDeadlineNeed(app.db, { id: a.claim }, '2027-05-31T12:00:00.000Z').met, true, 'open all of the last day');
    const lapsed = RT.legalDeadlineNeed(app.db, { id: a.claim }, '2027-06-01T08:00:00.000Z');
    assert.equal(lapsed.met, false);
    assert.match(lapsed.why, /had to be fixed by 2027-05-31/);
    app.db.run("UPDATE claims SET stage = 'TAX_ADVISER_SIGNOFF' WHERE id = ?", [a.claim]);
    const late = { ...CF.recordDeps(app), now: () => '2027-06-02T10:00:00.000Z' };
    const r = R.recordSignOff(late, ADMIN, a.claim, { adviser: 'Test Tax Advisers LLP', credential: 'Chartered Tax Adviser', signed_on: '2027-06-02', scope: 'the report', method_note: 'read it', figure: '1.00', confirmed_switches: '' });
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.why, /Not signed off: the value had to be fixed by 2027-05-31/);
    const gate = P.gateOut(app.db, P.loadPipelineClaim(app.db, a.claim), 'TAX_ADVISER_SIGNOFF', { today: '2027-06-02T10:00:00.000Z' });
    const n = gate.needs.find((x) => x.what === 'A legal check that was clear only until a deadline is still clear');
    assert.equal(n?.met, false, 'the sign-off gate does not read it');
    app.close();
  });
});

describe('7 · C24 the charity types; C25 basis period reform', () => {
  test('a charitable company is on the company date, a charitable trust on self assessment; a charity recorded without saying which is not known', async () => {
    const app = await world();
    const co = claimWith(app, 'K', { claimant: 'CHARITY_COMPANY', acquired: '2025-06-15', period: ['2025-01-01', '2025-12-31'] });
    const tr = claimWith(app, 'KK', { claimant: 'CHARITABLE_TRUST', acquired: '2025-06-15', period: ['2025-01-01', '2025-12-31'] });
    const ch = claimWith(app, 'KKK', { claimant: 'CHARITY', acquired: '2025-06-15', period: ['2025-01-01', '2025-12-31'] });
    assert.equal(F.amendmentWindowReading(app.db, co.ref, TODAY).deadline, '2027-12-31');
    assert.match(F.amendmentWindowReading(app.db, co.ref, TODAY).assumption ?? '', /charitable company/);
    assert.equal(F.amendmentWindowReading(app.db, tr.ref, TODAY).deadline, '2027-01-31', 'C25: a period ending 31 December 2025 reaches the 2024-25 return');
    assert.match(F.amendmentWindowReading(app.db, ch.ref, TODAY).why, /charitable company .* or a charitable trust/);
    assert.ok(C.CLAIMANT_TYPES['CHARITY_COMPANY'] && C.CLAIMANT_TYPES['CHARITABLE_TRUST']);
    app.close();
  });
  test('C25: a sole trader’s 12 months to 30 June 2025 reaches the 2024-25 return: amendable until 31 January 2027, not 2028', async () => {
    const app = await world();
    const st = claimWith(app, 'M', { claimant: 'SOLE_TRADER', acquired: '2024-09-01', period: ['2024-07-01', '2025-06-30'] });
    assert.equal(F.amendmentWindowReading(app.db, st.ref, TODAY).deadline, '2027-01-31');
    // A year end of 5 April is not shared between two tax years, and is unchanged.
    const aligned = claimWith(app, 'MM', { claimant: 'SOLE_TRADER', acquired: '2024-09-01', period: ['2024-04-06', '2025-04-05'] });
    assert.equal(F.amendmentWindowReading(app.db, aligned.ref, TODAY).deadline, '2027-01-31');
    app.close();
  });
});

describe('8 · item 8 — the legal check is the purchase’s', () => {
  test('a 2019 purchase that fails s.187A is W3; the 2025 refit stands, the pack is approved on it, and the report says the purchase is not claimed', async () => {
    const app = await world();
    const a = packed(app, 'N', [{ type: 'purchase', cost: 650000, date: '06/2019' }, { type: 'refurb', cost: 90000, date: '06/2025' }], '2019-06-01');
    legalPurchase(app, a.job, '2019-06-01');
    assert.equal(lview(app, a.job).verdict.level, 'RED', 'C27: bought straight from the owner who claimed, nothing fixed, two years gone');
    const w = view(app, a.job).works[0]!;
    ok(SP.saveWorks(deps(app), SAM, a.job, { event: w.event.id, reason: 'From the final account', seq: String(view(app, a.job).seq), values: {
      works_total: '90000', works_main: '30000', works_special: '20000', works_bwic: '5000', works_demolition: '1000', works_other: '20000', works_repairs: '4000', works_prelims: '6000', works_fees: '4000' } }));
    const v = view(app, a.job);
    assert.equal(v.purchase_w3, true);
    assert.equal(v.sums.qualifying_pence, 6_300_000, 'the works alone');
    ok(approve(app, a.job));
    const kept = A.approvedVersion(deps(app), ADMIN, a.job, 1)!;
    const m = REP.reportModel(kept.snapshot, kept.row.fingerprint);
    assert.match(m.events[0]?.note ?? '', /Not claimed\. The purchase does not pass the second-hand fixtures rules/);
    assert.equal(m.headline.qualifying, '£63,000');
    // And the routes: the purchase W3, the refit W1 (placed in its own period by the client's checked year end).
    CF.fact(app, a.claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
    yearEnd(app, a.b);
    assert.deepEqual(RT.claimRoutes(app.db, a.ref, TODAY).map((r) => r.route), ['W3', 'W1']);
    app.close();
  });
});

describe('9 · item 6 — the report and the portal say how each part goes in', () => {
  test('the approved version keeps each part’s route; the report shows them', async () => {
    const app = await world();
    const a = packed(app, 'Q', [{ type: 'purchase', cost: 650000, date: '06/2025' }], '2025-06-01');
    ok(L.answerLegal(deps(app), SAM, a.job, { question: 'G8', values: ['new_build'], source: 'The contract', seq: String(lview(app, a.job).seq) }));
    ok(L.answerLegal(deps(app), SAM, a.job, { question: 'G9d', values: ['2025-06-01'], source: 'The contract', seq: String(lview(app, a.job).seq) }));
    ok(approve(app, a.job));
    const kept = A.approvedVersion(deps(app), ADMIN, a.job, 1)!;
    const m = REP.reportModel(kept.snapshot, kept.row.fingerprint);
    assert.deepEqual(m.routes.map((r) => r.label), ['The purchase, June 2025']);
    assert.match(m.routes[0]?.words ?? '', /can still be amended/);
    assert.match(String(REP.reportHtml(m, { pdf: null })), /How each part goes in/);
    app.close();
  });

  let made: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  before(async () => {
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-159d-')) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const addr = made.server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  });
  after(() => made.close());
  test('the client sees "How each part goes in" on their claim', async () => {
    const pw = (await seed(made.app.db, made.app.hasher, made.app.now)).password;
    const client = made.app.db.get<{ email: string; business_id: string }>("SELECT email, business_id FROM users WHERE role = 'CLIENT' AND business_id IS NOT NULL LIMIT 1");
    assert.ok(client);
    const c = made.app.db.get<{ id: string }>("SELECT id FROM claims WHERE business_id = ? AND stage NOT IN ('CLOSED','CANCELLED','LOST','CLIENT_WITHDREW','OUTSIDE_AMENDMENT_WINDOW','REASONED_NEGATIVE','DECLINED_AT_ENQUIRY','CLIENT_DID_NOT_PROCEED','CLIENT_DECLINED_TO_SIGN') LIMIT 1", [client.business_id]);
    assert.ok(c, 'the seeded client has an open claim');
    const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: client.email, password: pw }).toString() });
    const cookie = r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
    const page = await (await fetch(`${base}/portal/claims/${c.id}`, { headers: { cookie } })).text();
    assert.match(page, /How each part goes in/);
  });
});
