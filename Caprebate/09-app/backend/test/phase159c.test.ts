/**
 * PHASE 159c, 9 October 2026 — SEVERAL EVENTS ON ONE BUILDING: A PURCHASE, THEN THE WORKS (the back end's half).
 *
 * The engine's half is Suite AO in the site harness (03-app/caprebate-regression.cjs). From the stress test of that day
 * (E1, E4; the Lockwood Surgery run, L5: a GP surgery bought for £650,000 and refurbished for £90,000 reached a figure for
 * the purchase alone). Each test fails on the code before this phase:
 *   1  the works screen is "add an event": each piece of work its own row, with its own kind, cost and date
 *   2  each event is sized on its own band and the building's ceiling is the sum (£258,000 for Lockwood), on the page too
 *   3  the engine session carries the events, and the engine prices each on its own band
 *   4  the assessment keeps each event on the property; the lead shows them; no low end is stored (line 8)
 *   5  the claim page shows each event with its own figure and documents, and a person can add one
 *   6  the pack prices each piece of work on its own cost (the cost-led mode), adds it to the purchase, and the approved
 *      version, the report and the return entries show both
 *   7  chapter 20 runs per piece of work and says the repair part is a deduction; it reads the state's 'properties'
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testApp, actor } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import * as F4 from '../src/web/funnel4.ts';
import * as AS from '../src/web/assessment.ts';
import * as C from '../src/web/crm.ts';
import * as LD from '../src/web/leads.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as L from '../src/web/pack-legal.ts';
import * as A from '../src/web/pack-approve.ts';
import * as EV from '../src/web/survey-evidence.ts';
import * as CH from '../src/web/pack-chapters.ts';
import * as RE from '../src/web/return-entries.ts';
import * as REP from '../src/web/survey-report.ts';
import * as PS from '../src/web/pack-sums.ts';
import * as SH from '../src/web/pack-sheets.ts';
import * as PE from '../src/web/property-events.ts';
import { sessionFromFunnel } from '../src/web/funnel-session.ts';
import { estimate } from '../src/web/engine.ts';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';

type S = Record<string, unknown>;
type App = Awaited<ReturnType<typeof testApp>>;
const form = (o: Record<string, string>) => new URLSearchParams(o);
const T = '2026-09-08T00:00:00.000Z';
const SAM = actor('SURVEYING', 'u-sam');
const ADMIN = actor('ADMIN');
const SALES = actor('SALES');

/** Lockwood's one building through the screens: a GP bought for £650,000 in March 2025, then the works screen as given. */
function lockwood(works: Record<string, string>): { s: S; errors: string[] } {
  const s: S = {};
  F4.markFunnel4(s);
  const errors: string[] = [];
  errors.push(...F4.applyF4(s, 'buildings', form({ b0_sector: 'gp' })).errors);
  errors.push(...F4.applyF4(s, 'spend-on', form({ b0_trigger: 'purchase' })).errors);
  errors.push(...F4.applyF4(s, 'amounts', form({ b0_spend: '650000', b0_date: '03/2025' })).errors);
  errors.push(...F4.applyF4(s, 'tax', form({ b0_tax: 'yes', b0_profit: 'profitable' })).errors);
  errors.push(...F4.applyF4(s, 'claims', form({ b0_prior: 'no', b0_seller: 'dont_know' })).errors);
  errors.push(...F4.applyF4(s, 'works', form(works)).errors);
  return { s, errors };
}
const REFIT = { b0_works: 'yes', b0_works_count: '1', b0_w0_type: 'refurb', b0_w0_spend: '90000', b0_w0_date: '2025' };

describe('1 · the works screen is "add an event"', () => {
  test('each piece of work is its own row: added, removed, and kept as an event with its own kind, cost and date', () => {
    const { s } = lockwood({ b0_works: 'yes' });
    // "+ Add another piece of work" keeps the screen and what was typed, and adds a row.
    const add = F4.applyF4(s, 'works', form({ ...REFIT, add_work: '0' }));
    assert.equal(add.stay, true);
    assert.equal(add.errors.length, 0, 'adding a row is not an error');
    assert.equal(F4.laterEvents(F4.buildings(s)[0]!).length, 2);
    // A second piece of work typed, then the first removed.
    F4.applyF4(s, 'works', form({ ...REFIT, b0_works_count: '2', b0_w1_type: 'extension', b0_w1_spend: '200000', b0_w1_date: '06/2024' }));
    assert.deepEqual(F4.laterEvents(F4.buildings(s)[0]!).map((e) => [e.type, e.cost, e.date]), [['refurb', 90000, '2025'], ['extension', 200000, '06/2024']]);
    const rm = F4.applyF4(s, 'works', form({ ...REFIT, b0_works_count: '2', b0_w1_type: 'extension', b0_w1_spend: '200000', b0_w1_date: '06/2024', remove_work: '0:0' }));
    assert.equal(rm.stay, true);
    assert.deepEqual(F4.laterEvents(F4.buildings(s)[0]!).map((e) => e.type), ['extension']);
    // The whole list is kept on the building, the first event first.
    const evs = F4.buildings(s)[0]!['events'] as { type: string; first: boolean }[];
    assert.deepEqual(evs.map((e) => [e.type, e.first]), [['purchase', true], ['extension', false]]);
    assert.equal(F4.firstIncomplete(s), 'details');
  });

  test('a row with no kind, cost or date is asked for again, and the screen is kept', () => {
    const { s, errors } = lockwood({ b0_works: 'yes', b0_works_count: '1' });
    assert.ok(errors.some((e) => /what kind of work was done/.test(e)), errors.join(' | '));
    assert.ok(errors.some((e) => /roughly how much/.test(e)), errors.join(' | '));
    assert.equal(F4.firstIncomplete(s), 'works');
  });

  test('a page from before this phase, with its one works answer, is read as the first row', () => {
    const { s, errors } = lockwood({ b0_works: 'yes', b0_works_type: 'full', b0_works_spend: '90000', b0_works_year: '2025' });
    assert.equal(errors.length, 0, errors.join(' | '));
    assert.deepEqual(F4.laterEvents(F4.buildings(s)[0]!).map((e) => [e.type, e.cost, e.date]), [['refurb', 90000, '2025']]);
  });

  test('"No" keeps no work; and the spend-on screen says the work is added later, each on its own', () => {
    const { s } = lockwood({ b0_works: 'no' });
    assert.equal(F4.laterEvents(F4.buildings(s)[0]!).length, 0);
    assert.match(F4.F4_TEXT['spend-on'].help, /add each piece of work a few questions on/);
    assert.doesNotMatch(F4.F4_TEXT['spend-on'].help, /choose “We bought it”/, 'F3, one answer per building, is gone');
  });
});

describe('2 · each event on its own band; the ceiling is the sum', () => {
  test('Lockwood: up to £258,000 — the purchase £195,000 and the refurbishment £63,000 — on the figure page too', () => {
    const { s } = lockwood(REFIT);
    const fig = F4.figureF4(s);
    assert.equal(fig.high, 258000);
    assert.deepEqual(fig.parts[0]?.events.map((e) => e.high), [195000, 63000]);
    const page = String(F4.figureBody(s, { available: false, say: '' }, undefined, []));
    assert.match(page, /Refurbished or refitted it, £90,000 \(2025\): up to £63,000/);
    assert.match(page, /Bought it, £650,000 \(03\/2025\): up to £195,000/);
  });
  test('redecoration adds nothing and says why; an owner with no UK tax counts none of its work', () => {
    const cos = lockwood({ ...REFIT, b0_w0_type: 'cosmetic' }).s;
    assert.equal(F4.figureF4(cos).high, 195000);
    assert.match(String(F4.figureBody(cos, { available: false, say: '' }, undefined, [])), /Redecoration or repairs, £90,000 \(2025\): not counted in this figure/);
  });
});

describe('3 · the engine session carries the events', () => {
  test('sessionFromFunnel maps every event with its own cost, and estimate() adds the purchase and the refit', () => {
    const { s } = lockwood(REFIT);
    const m = sessionFromFunnel('gp', s);
    assert.ok(m.set.includes('events'));
    assert.deepEqual((m.session as unknown as { events: unknown }).events, [
      { type: 'purchase', cost: 650000, date: '03/2025' }, { type: 'refurb', cost: 90000, date: '2025' }]);
    assert.equal((m.session as unknown as { base_amount: number }).base_amount, 650000, 'the works never join the one amount');
    const r = estimate('gp', m.session) as unknown as { QE: [number, number]; events: unknown[] };
    assert.equal(Math.round(r.QE[1]), 258000);
    assert.equal(r.events.length, 2);
  });
});

describe('4 · the assessment keeps each event; the lead shows them; no low end is stored', () => {
  test('submit writes the purchase and the refurbishment on the property, each answer row, and the ceiling alone', async () => {
    const app = await testApp();
    const { s } = lockwood(REFIT);
    F4.applyF4(s, 'details', form({ b0_business: 'Lockwood Surgery Partners', b0_entity: 'partnership', b0_line1: '1 Test Road', b0_town: 'Testtown', b0_postcode: 'ZZ9 9ZZ' }));
    (s['contact'] as Record<string, unknown>)['full_name'] = 'Test Person';
    const out = AS.submit(app.db, { token: 'tok-159c', state: s as never, screen: 'Q1' as never }, app.now, randomUUID);
    const evs = app.db.all<{ kind: string; event_date: string | null; cost_pence: number | null; ord: number; source: string }>(
      'SELECT kind, event_date, cost_pence, ord, source FROM property_events WHERE assessment_id = ? ORDER BY ord', [out.assessment_id]);
    assert.deepEqual(evs.map((e) => [e.ord, e.kind, e.event_date, e.cost_pence, e.source]),
      [[1, 'PURCHASE', '2025-03', 65_000_000, 'ASSESSMENT'], [2, 'REFURBISHMENT', '2025', 9_000_000, 'ASSESSMENT']]);
    const a = app.db.get<{ lo: number | null; hi: number | null }>('SELECT shown_low_pence AS lo, shown_high_pence AS hi FROM assessments WHERE id = ?', [out.assessment_id]);
    assert.deepEqual([a?.lo, a?.hi], [null, 25_800_000], 'the ceiling alone is kept: the client was shown "up to" only');
    const rows = app.db.all<{ question_id: string; value: string | null }>("SELECT question_id, value FROM assessment_answers WHERE assessment_id = ? AND question_id GLOB 'Q3-1-w[0-9]*'", [out.assessment_id]);
    assert.deepEqual(rows.map((r) => [r.question_id, r.value]).sort(), [['Q3-1-w1-date', '2025'], ['Q3-1-w1-spend', '90000'], ['Q3-1-w1-type', 'refurb']]);
    const lv = LD.leadView(app.db, SALES, out.lead_id);
    assert.deepEqual(lv.events.map((e) => [e.what, e.when, e.cost]), [['The purchase', 'March 2025', '£650,000'], ['A refurbishment or refit', '2025', '£90,000']]);
    assert.ok(lv.initial_property_value.some((x) => /Work 1: roughly how much/.test(x.question)), 'the lead\'s answers carry the work');
    app.close();
  });
});

describe('5 · the claim page: each event, its own figure, its own documents; and add one', () => {
  let made: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  let password = '';
  const cookieFor = new Map<string, string>();
  const go = async (who: string, path: string, init: RequestInit = {}) => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { cookie: cookieFor.get(who) ?? '', ...(init.headers as Record<string, string> | undefined) } });
    return { status: x.status, location: x.headers.get('location'), body: await x.text() };
  };
  before(async () => {
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-159c-')) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const addr = made.server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
    password = (await seed(made.app.db, made.app.hasher, made.app.now)).password;
    for (const who of ['sales', 'accounting']) {
      const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: `${who}@example.invalid`, password }).toString() });
      cookieFor.set(who, r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '));
    }
  });
  after(() => made.close());

  test('a person adds the purchase and a refit; the page lists each, with its figure for Sales and none for Accounting', async () => {
    const c = made.app.db.get<{ id: string; property_id: string }>("SELECT id, property_id FROM claims WHERE property_id IS NOT NULL AND stage = 'SURVEY' LIMIT 1")
      ?? made.app.db.get<{ id: string; property_id: string }>('SELECT id, property_id FROM claims WHERE property_id IS NOT NULL LIMIT 1');
    assert.ok(c);
    const post = (f: Record<string, string>) => go('sales', `/staff/claims/${c.id}/events`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
    assert.equal((await post({ kind: 'PURCHASE', date: '03/2025', cost: '650000' })).status, 303);
    assert.equal((await post({ kind: 'REFURBISHMENT', date: '06/2025', cost: '90,000' })).status, 303);
    const twice = await post({ kind: 'PURCHASE', date: '2019', cost: '1' });
    assert.notEqual(twice.status, 303, 'a second purchase is refused');
    const page = (await go('sales', `/staff/claims/${c.id}`)).body;
    const sec = page.slice(page.indexOf('id="claim-events"'), page.indexOf('</details>', page.indexOf('id="claim-events"')));
    assert.match(sec, /The purchase<\/strong>, March 2025, £650,000/);
    assert.match(sec, /A refurbishment or refit<\/strong>, June 2025, £90,000 \(added on the claim\)/);
    assert.match(sec, /Up to £[\d,]+ on the sector’s range/);
    assert.match(sec, /Final account, or the contractor(&#39;|')s cost breakdown by element \(not received yet\)/, 'the final account is on its documents');
    assert.match(sec, /Completion statement/);
    const acc = (await go('accounting', `/staff/claims/${c.id}`)).body;
    const accSec = acc.slice(acc.indexOf('id="claim-events"'), acc.indexOf('</details>', acc.indexOf('id="claim-events"')));
    assert.match(accSec, /A refurbishment or refit/);
    assert.doesNotMatch(accSec, /£90,000|Up to £/, 'the claim value is not shown to a login that may not read it');
    assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'PROPERTY_EVENT_ADDED'")?.n, 2);
  });
});

/* ------------------------------------------------------------------ 6 · the pack */

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

/** Lockwood's claim at the survey: the purchase and the refurbishment on the property, as the assessment wrote them. */
function setup(app: App, tag: string, events: readonly ('PURCHASE' | 'REFURBISHMENT')[] = ['PURCHASE', 'REFURBISHMENT']) {
  const b = `b-${tag}`, p = `p-${tag}`, as = `as-${tag}`, job = `job-${tag}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, `Lockwood ${tag} Limited`, 'gp', 'SURVEY', T, 'COMPANY']);
  app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [p, b, 'Lockwood Surgery', 'ZZ9 9ZZ', T]);
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [as, b, 'gp', T, null, 25_800_000, T]);
  app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [`e-${tag}`, as, b, 25_800_000, 0.35, 0, 0, 0, 1, 0, T, 'not-a-real-hash']);
  PE.writeAssessmentEvents(app.db, randomUUID, { property_id: p, business_id: b, assessment_id: as, at: T },
    events.map((k) => (k === 'PURCHASE' ? { type: 'purchase', cost: 650000, date: '03/2025' } : { type: 'refurb', cost: 90000, date: '2025' })));
  const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: as, workstream: 'PLANT_AND_MACHINERY', stage: 'SURVEY', owner_id: null, surveyor_id: null });
  app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [job, b, as, 'u-sam', 'SEALED', null, T, claim.id]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-epc-${tag}`, b, 'EPC', `RRN-${tag}`, JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T, p]);
  app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
    [`rr-title-${tag}`, b, 'HMLR_TITLE', `ZZ${tag}`, JSON.stringify({ title_number: `ZZ${tag}`, price_paid: 650000 }), T, p]);
  CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_START', '2025-04-01');
  CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_END', '2026-03-31');
  return { b, p, job, claim: claim.id };
}
const view = (app: App, job: string) => SP.packView(deps(app), SAM, job);
const lview = (app: App, job: string) => L.legalView(deps(app), SAM, job);
function fillPurchase(app: App, job: string): void {
  const keep = view(app, job).lines.slice(0, 2).map((l) => l.id);
  for (const l of view(app, job).lines) { if (keep.includes(l.id) || l.removed) continue; ok(SP.setLineRemoved(deps(app), SAM, job, { line: l.id, reason: 'Not here', seq: String(view(app, job).seq) }, true)); }
  ok(SP.saveLine(deps(app), SAM, job, { line: keep[0] as string, qty: '10', rate: '2000', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', qpct: '100', pool: 'SR', reason: 'Counted', seq: String(view(app, job).seq) }));
  ok(SP.saveLine(deps(app), SAM, job, { line: keep[1] as string, qty: '100', rate: '300', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', qpct: '100', pool: 'MP', reason: 'Counted', seq: String(view(app, job).seq) }));
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'land', value: '150000', reason: 'Land registry', seq: String(view(app, job).seq) }));
  ok(SP.savePackValue(deps(app), SAM, job, { field: 'building_rate', value: '1500', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', reason: 'BCIS', seq: String(view(app, job).seq) }));
}
function finish(app: App, job: string) {
  ok(EV.setBasis(deps(app), SAM, job, { basis: 'DESKTOP_EVIDENCE', note: '' }));
  A.saveDetails(deps(app), SAM, job, { rics_number: '1234567', firm: 'Survey Firm' });
  ok(L.answerLegal(deps(app), SAM, job, { question: 'G8', values: ['new_build'], source: 'The client’s contract', seq: String(lview(app, job).seq) }));
  ok(L.answerLegal(deps(app), SAM, job, { question: 'G9d', values: ['2025-06-01'], source: 'The client’s contract', seq: String(lview(app, job).seq) }));
  for (const c of CH.chaptersToRead()) A.recordRead(deps(app), SAM, job, c, lview(app, job).seq);
  return A.approvePack(deps(app), SAM, job, { seq: String(view(app, job).seq), legal_seq: String(lview(app, job).seq) });
}
/** The refit's final account: £90,000 in all — plant £30,000 + £20,000, builder's work £5,000, demolition £1,000, other
 *  £20,000, repairs £4,000, preliminaries £6,000, fees £4,000. */
const FINAL = { works_total: '90000', works_main: '30000', works_special: '20000', works_bwic: '5000', works_demolition: '1000',
  works_other: '20000', works_repairs: '4000', works_prelims: '6000', works_fees: '4000' };
function fillWorks(app: App, job: string, values: Record<string, string> = FINAL) {
  const w = view(app, job).works[0]!;
  return SP.saveWorks(deps(app), SAM, job, { event: w.event.id, values, reason: 'From the final account dated 30 June 2025', seq: String(view(app, job).seq) });
}

describe('6 · the pack prices each piece of work on its own cost, and adds it to the purchase', () => {
  test('the cost-led sum: the plant with its builder\'s work and demolition, and its share of the preliminaries and fees; the repair part apart', () => {
    const v = (n: number) => ({ value: n * 100, source: null });
    const w = PS.worksSums('e1', 'Refit', Object.fromEntries(Object.entries(FINAL).map(([k, x]) => [k, v(Number(x))])) as unknown as PS.WorksInputs);
    // direct £80,000; on-costs £10,000. Qualifies £56,000 + £10,000 × 56/80 = £63,000; main £63,000 × 30/50 = £37,800.
    assert.deepEqual([w.complete, w.qualifying_pence, w.main_pool_pence, w.special_pool_pence, w.repairs_pence],
      [true, 6_300_000, 3_780_000, 2_520_000, 450_000]);
    const off = PS.worksSums('e1', 'Refit', Object.fromEntries(Object.entries({ ...FINAL, works_total: '91000' }).map(([k, x]) => [k, v(Number(x))])) as unknown as PS.WorksInputs);
    assert.equal(off.qualifying_pence, null);
    assert.match(off.problems[0]?.words ?? '', /the parts add up to £90,000, but the final account says £91,000/);
    const gap = PS.worksSums('e1', 'Refit', { ...Object.fromEntries(Object.entries(FINAL).map(([k, x]) => [k, v(Number(x))])), works_fees: { value: null, source: null } } as unknown as PS.WorksInputs);
    assert.equal(gap.complete, false);
    assert.equal(gap.needed.length, 1, 'one value missing, named, and no total (N4)');
  });

  test('Lockwood\'s pack: the refit is drafted from the client\'s word, needed until its parts are in, and then added to the purchase', async () => {
    const app = await world();
    const a = setup(app, 'L');
    fillPurchase(app, a.job);
    const before = view(app, a.job);
    assert.equal(before.works.length, 1);
    assert.equal(before.works[0]?.inputs.works_total.value, 9_000_000, 'the final account is drafted from what the client said');
    assert.equal(before.works[0]?.inputs.works_total.source?.kind, 'EVIDENCE');
    assert.equal(before.sums.complete, false, 'no total while the work\'s parts are missing');
    assert.ok(before.sums.needed.some((n) => n.where === 'WORKS'));
    ok(fillWorks(app, a.job));
    const v = view(app, a.job);
    assert.equal(v.sums.complete, true, JSON.stringify(v.sums.needed));
    assert.equal(v.sums.qualifying_pence, (v.purchase_sums.qualifying_pence as number) + 6_300_000);
    assert.equal(v.sums.main_pool_pence, (v.purchase_sums.main_pool_pence as number) + 3_780_000);
    assert.equal(v.sums.special_pool_pence, (v.purchase_sums.special_pool_pence as number) + 2_520_000);
    // Chapter 20 runs for the refit, and says the repair part is a deduction, not in the figure.
    const ch20 = SH.packSheet(app.db, v, 20)!;
    assert.equal(ch20.applies, true);
    assert.ok(ch20.rows.some((r) => /A refurbishment or refit, 2025: the repair part/.test(r.label) && /£4,500\. A repair comes off the profits/.test(r.value ?? '')), JSON.stringify(ch20.rows));
    app.close();
  });

  test('approved: the version keeps each spend; the report shows both; the return adds each on its own row', async () => {
    const app = await world();
    const a = setup(app, 'R');
    fillPurchase(app, a.job);
    ok(fillWorks(app, a.job));
    const v = view(app, a.job);
    const r = finish(app, a.job);
    ok(r);
    const kept = A.approvedVersion(deps(app), ADMIN, a.job, 1)!;
    const snap = kept.snapshot as typeof kept.snapshot & { events?: { purchase_applies: boolean; works: { label: string; qualifying_pence: number }[] } };
    assert.equal(snap.sums.qualifying_pence, v.sums.qualifying_pence);
    assert.deepEqual(snap.events?.works.map((w) => [w.label, w.qualifying_pence]), [['A refurbishment or refit, 2025', 6_300_000]]);
    const m = REP.reportModel(kept.snapshot, kept.row.fingerprint);
    assert.deepEqual(m.events.map((e) => [e.label, e.qualifying]), [['The purchase', PS.poundsWords(v.purchase_sums.qualifying_pence)], ['A refurbishment or refit, 2025', '£63,000']]);
    assert.equal(m.headline.qualifying, PS.poundsWords(v.sums.qualifying_pence));
    assert.match(m.headline_note ?? '', /the purchase and the work done since/);
    assert.match(m.sum_words.join(' '), new RegExp(PS.poundsWords(v.purchase_sums.qualifying_pence).replace(/[£,.]/g, (c) => `\\${c}`)), 'the section 562 sum is the purchase\'s own');
    const html = String(REP.reportHtml(m, { pdf: null }));
    assert.match(html, /Each spend on the building/);
    assert.ok(REP.reportPdf(m).bytes.length > 1000);
    const rows = RE.returnEntries(kept.snapshot, { period_start: '2025-04-01', is_company: true }).filter((e) => e.return_no === 1 && /added to the pool/.test(e.entry));
    assert.deepEqual(rows.map((e) => [e.pool, e.entry, e.amount_pence]), [
      ['Main pool', 'Spend that counts, added to the pool: the purchase', v.purchase_sums.main_pool_pence],
      ['Main pool', 'Spend that counts, added to the pool: A refurbishment or refit, 2025', 3_780_000],
      ['Special rate pool', 'Spend that counts, added to the pool: the purchase', v.purchase_sums.special_pool_pence],
      ['Special rate pool', 'Spend that counts, added to the pool: A refurbishment or refit, 2025', 2_520_000]]);
    // The surveyor's committed figures carry the total, and the building includes what the work cost.
    const k = app.db.get<{ a: number; b: number }>('SELECT a_qualifying_plant_pence AS a, b_building_pence AS b FROM surveyor_commitments WHERE job_id = ? ORDER BY rowid DESC LIMIT 1', [a.job]);
    assert.deepEqual([k?.a, k?.b], [v.sums.qualifying_pence, (v.purchase_sums.building_price_pence as number) + 9_000_000]);
    app.close();
  });

  test('a building that was not bought: no price to share out, the work alone is the figure', async () => {
    const app = await world();
    const a = setup(app, 'W', ['REFURBISHMENT']);
    const before = view(app, a.job);
    assert.equal(before.purchase_applies, false);
    assert.ok(before.sums.needed.every((n) => n.where === 'WORKS'), 'the price, the land and the fixture lines are not asked for');
    ok(fillWorks(app, a.job));
    const v = view(app, a.job);
    assert.deepEqual([v.sums.complete, v.sums.qualifying_pence, v.sums.building_price_pence], [true, 6_300_000, null]);
    app.close();
  });

  test('a pack with no events recorded is the pack it always was', async () => {
    const app = await world();
    const a = setup(app, 'O', []);
    fillPurchase(app, a.job);
    const v = view(app, a.job);
    assert.equal(v.works.length, 0);
    assert.equal(v.purchase_applies, true);
    assert.deepEqual(v.sums, v.purchase_sums);
    app.close();
  });
});

describe('7 · chapter 20 reads the client\'s words from the state the funnel keeps', () => {
  test('a pack with no events recorded reads funnel["properties"], not funnel["buildings"]', async () => {
    const app = await world();
    const a = setup(app, 'K', []);
    const { s } = lockwood({ b0_works: 'yes', b0_works_count: '1', b0_w0_type: 'refurb', b0_w0_spend: '90000', b0_w0_date: '2025' });
    const p0 = F4.buildings(s)[0]!; p0['trigger'] = 'refurb';
    app.db.run('INSERT INTO assessment_drafts (token, state_json, screen, created_at, updated_at, submitted_assessment_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['tok-K', JSON.stringify(s), 'Q1', T, T, `as-K`]);
    const ch20 = SH.packSheet(app.db, view(app, a.job), 20)!;
    const said = ch20.rows.find((r) => r.label === 'What the client said about the works');
    assert.equal(ch20.applies, true);
    assert.match(said?.value ?? '', /Refurbished or refitted it, £90,000, 2025/);
    app.close();
  });
});
