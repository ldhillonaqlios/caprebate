/**
 * PHASE 159l, 10 October 2026 — WHAT THE SECOND LOCKWOOD RUN FOUND (04-phase-work/sim-2026-10-10-lockwood/, L13-L20).
 *
 * Each test fails on the code before this phase:
 *   item 1 (L13)  the company search's accounts type and status are kept with the assessment (migration 114) and shown
 *                 beside the qualifying-activity check on the lead and on the claim, before the research runs
 *   item 2 (L15)  a filing per return: each claimed part names its return (claim-route.ts claimReturns); the accountant's
 *                 FILED link names the return it asks about (migration 115); the claim closes once each return already
 *                 due is confirmed filed, and a return not yet due is held in aftercare with its due date
 *   item 3 (L18)  the research panel's postcodes.io row says it is the address question's check, and what the research's
 *                 own postcode check did on the click
 *   item 4 (L19)  "What happened to the building" shows each event's approved figure once the survey has priced it
 *   item 5 (L20)  the report prints each piece of work's nine final-account values with their source (page and PDF),
 *                 frozen with the version; a version approved before says its sources were not kept
 *   item 6 (L17)  BCIS's base quarter is said as a month ("January 2026"), on new drafts and on older versions alike
 *   item 8        two more readings in the pack's legal check (#9 the s.187A(6)(b) statements route, #10 the fixed value
 *                 requirement needing a past owner who claimed): held on by a scoped override for the whole legal flow,
 *                 put back after, and never in the public estimate; the walk re-recorded
 */
import { describe, test, before, after } from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import { DORMANT_WORDS } from '../src/connectors/companies-house.ts';
import * as W from '../src/web/who-claims.ts';
import * as F4 from '../src/web/funnel4.ts';
import * as PL from '../src/web/pipeline.ts';
import * as CF from './claim-fixtures.ts';
import * as C from '../src/web/crm.ts';
import * as RT from '../src/web/claim-route.ts';
import * as PE from '../src/web/property-events.ts';
import * as AC from '../src/web/accountant-confirm.ts';
import * as R from '../src/web/claim-record.ts';
import { accountantConfirmBlock } from '../src/web/accountant-confirm-pages.ts';
import { aftercareBlock } from '../src/web/claim-record-pages.ts';
import * as RS from '../src/web/research.ts';
import { fixtureTransport } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import * as SP from '../src/web/survey-pack.ts';
import * as L from '../src/web/pack-legal.ts';
import * as A from '../src/web/pack-approve.ts';
import * as EV from '../src/web/survey-evidence.ts';
import * as CH from '../src/web/pack-chapters.ts';
import * as REP from '../src/web/survey-report.ts';
import { baseWords } from '../src/web/bcis-data.ts';
import { CB } from '../src/web/engine.ts';

type App = Awaited<ReturnType<typeof testApp>>;
const T = '2026-10-10T09:00:00.000Z';
const ADMIN = actor('ADMIN');

/** The four-stage funnel, through to submission, with the company picked from the search's list. */
function submitWithCompany(app: App, results: Record<string, unknown>[], pick: string): string {
  const s: Record<string, unknown> = {};
  F4.markFunnel4(s);
  const steps: [F4.F4Screen, Record<string, string>][] = [
    ['buildings', { b0_sector: 'gp' }], ['spend-on', { b0_trigger: 'purchase' }], ['amounts', { b0_spend: '250000', b0_date: '06/2020' }],
    ['tax', { b0_tax: 'yes', b0_profit: 'profitable' }], ['claims', { b0_prior: 'no', b0_seller: 'dont_know' }], ['works', { b0_works: 'no' }]];
  for (const [id, f] of steps) assert.deepEqual(F4.applyF4(s, id, new URLSearchParams(f)).errors, [], id);
  F4.buildings(s)[0]!['company_results'] = results;
  assert.deepEqual(F4.applyF4(s, 'details', new URLSearchParams({ b0_business: 'Lockwood Surgery', b0_company_number: pick, b0_entity: 'ltd', b0_line1: '1 Invented Road', b0_postcode: 'ZZ1 1ZZ', b0_use: 'own_use' })).errors, []);
  const out = F4.submitEnquiry(app.db, { token: `tok-${randomUUID()}`, state: s as never, screen: 'Q1' as never }, app.now, randomUUID);
  const b = out.parts[0]?.business_id;
  assert.ok(b);
  return b;
}

describe('item 1 (L13) — the dormant flag before the letter', () => {
  const LOCKWOOD = { name: 'LOCKWOOD SURGERY PRIME HEALTH LTD', number: '09037233', status: 'active', office_postcode: null, accounts_type: 'dormant' };

  test('the search’s accounts type is kept with the assessment, and a dormant company shows on the lead and the claim before the research', async () => {
    const app = await testApp();
    const b = submitWithCompany(app, [LOCKWOOD, { name: 'OTHER LTD', number: '01234567', status: 'active', office_postcode: null, accounts_type: 'full' }], '09037233');
    assert.deepEqual(app.db.get('SELECT company_number, company_status, company_accounts_type FROM assessments WHERE business_id = ?', [b]),
      { company_number: '09037233', company_status: 'active', company_accounts_type: 'dormant' });
    assert.equal(app.db.get("SELECT COUNT(*) AS n FROM register_records WHERE business_id = ? AND source_id = 'CH_COMPANY'", [b])?.['n' as never], 0);
    const ev = PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT;
    assert.ok(ev.some((l) => /Companies House, from the company search at the assessment: company number 09037233, active, dormant accounts\./.test(l)), ev.join(' | '));
    assert.ok(ev.includes(DORMANT_WORDS));
    assert.match(W.dormantWarning(app.db, b) ?? '', /dormant accounts.*from the company search at the assessment, company number 09037233/);
    app.close();
  });

  test('a type the search could not read is not known, never "not dormant" (N4); the register record, once read, wins', async () => {
    const app = await testApp();
    const b = submitWithCompany(app, [{ ...LOCKWOOD, accounts_type: null }], '09037233');
    assert.equal(W.companyAtAssessment(app.db, b)?.accounts_type, null);
    assert.equal(W.dormantWarning(app.db, b), null);
    const ev = PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT;
    assert.ok(ev.some((l) => /company number 09037233, active, accounts type not known\./.test(l)), ev.join(' | '));
    assert.ok(!ev.includes(DORMANT_WORDS));
    // The research's register record is newer: it is the one said, and the search's line goes.
    app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at) VALUES (?,?,?,?,?,?)',
      [randomUUID(), b, 'CH_COMPANY', '09037233', JSON.stringify({ company_number: '09037233', company_status: 'active', accounts_type: 'dormant', accounts_made_up_to: '2025-05-31' }), T]);
    const after = PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT;
    assert.ok(after.some((l) => /^Companies House: active, dormant accounts made up to 2025-05-31\./.test(l)));
    assert.ok(!after.some((l) => /from the company search at the assessment/.test(l)));
    assert.match(W.dormantWarning(app.db, b) ?? '', /made up to 2025-05-31/);
    app.close();
  });

  test('no company picked: nothing is kept and nothing is said', async () => {
    const app = await testApp();
    const b = submitWithCompany(app, [LOCKWOOD], 'none');
    assert.equal(W.companyAtAssessment(app.db, b), null);
    assert.ok(!PL.enquiryEvidence(app.db, ADMIN, b, null).TRADING_CLIENT.some((l) => /Companies House/.test(l)));
    app.close();
  });
});

/* ================================================================== */

/** A company that bought a GP surgery in June 2019 and refitted it in June 2025, year end 31 December, still owned, with
 *  an accountant on file, at the defence pack. Today (the test clock) is 8 September 2026. */
function twoReturns(app: App) {
  for (const [id, role] of [['u-SALES', 'SALES'], ['u-ADMIN', 'ADMIN'], ['u-SURVEYING', 'SURVEYING']] as const) {
    if (app.db.get('SELECT id FROM users WHERE id = ?', [id]) === undefined) {
      app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        [id, `${id}@x.invalid`, `${id}@x.invalid`, `${id} name`, role, 'x', T, T]);
    }
  }
  const b = `b-${randomUUID()}`, p = `p-${randomUUID()}`, as = `as-${randomUUID()}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type,company_number) VALUES (?,?,?,?,?,?,?)', [b, 'Two Returns Limited', 'gp', 'SURVEY', T, 'COMPANY', '01234567']);
  app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at,acquisition_date) VALUES (?,?,?,?,?,?)', [p, b, 'Two Returns Surgery', 'ZZ9 9ZZ', T, '2019-06-15']);
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [as, b, 'gp', T, null, 19_500_000, T]);
  app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [`e-${as}`, as, b, 19_500_000, 0.3, 0, 0, 0, 1, 0, T, 'not-a-real-hash']);
  PE.writeAssessmentEvents(app.db, randomUUID, { property_id: p, business_id: b, assessment_id: as, at: T },
    [{ type: 'purchase', cost: 650000, date: '06/2019' }, { type: 'refurb', cost: 90000, date: '06/2025' }]);
  const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: as, workstream: 'PLANT_AND_MACHINERY', stage: 'DEFENCE_PACK', owner_id: null, surveyor_id: null }).id;
  CF.fact(app, claim, 'ACCOUNTING_PERIOD_START', '2019-01-01');
  CF.fact(app, claim, 'ACCOUNTING_PERIOD_END', '2019-12-31');
  CF.fact(app, claim, 'STILL_OWNED', 'YES', 'CLIENT_ANSWER');
  const task = `ct-${randomUUID()}`;
  app.db.run('INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, fact_id, sent_to_portal_at) ' +
    "VALUES (?, ?, 'u-SALES', 'Your year end?', 'why', 'this claim', 'ANSWERED', 'ANSWERED', '31 December', ?, NULL, 'CLIENT', ?, 'year_end', ?)", [task, b, T, T, T]);
  app.db.run("INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, 'APPROVED', NULL, 'u-SALES', ?)", [randomUUID(), b, `ans.${task}`, T]);
  const contact = randomUUID();
  app.db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, whatsapp_optin, created_at, contact_type, email) VALUES (?, ?, 'Test Accountant (TEST)', 1, 0, 0, ?, 'ACCOUNTANT', ?)",
    [contact, b, T, `acct-${contact}@example.invalid`]);
  CF.signOffRow(app, b, as, claim);
  return { b, p, claim, contact, ref: { id: claim, business_id: b, property_id: p } };
}
const tokenIn = (app: App): string => /\/confirm\/([A-Za-z0-9_-]{43})/.exec(app.db.get<{ body: string }>('SELECT body FROM outbox ORDER BY rowid DESC LIMIT 1')?.body ?? '')?.[1] ?? '';
const send = (app: App, claim: string, contact_id: string, period_end?: string) => AC.sendConfirmRequest(
  { db: app.db, audit: app.audit, now: app.now, newId: randomUUID, email: app.email }, actor('SALES'), claim,
  { kind: 'FILED', contact_id, origin: 'https://caprebate.example.invalid', ...(period_end === undefined ? {} : { period_end }) });
const answer = (app: App, filed_on: string) => AC.answerConfirmLink({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID }, tokenIn(app),
  { outcome: 'CONFIRMED', name: 'Test Accountant', firm: 'Test Accountants LLP', filed_on, reason: '', sure: 'yes' });
const closing = (app: App, claim: string) => PL.gateOut(app.db, PL.loadPipelineClaim(app.db, claim), 'DEFENCE_PACK', { today: app.now() }).needs.find((n) => /filed|filing/.test(n.what));

describe('item 2 (L15) — a filing per return', () => {
  test('the due day is twelve months before the amendment window ends; each claimed part names its return', () => {
    assert.equal(RT.dueFromAmendBy('2027-05-31'), '2026-05-31');
    assert.equal(RT.dueFromAmendBy('2028-02-29'), '2027-02-28');
    assert.equal(RT.dueFromAmendBy('not a date'), null);
    const route = (o: Partial<RT.EventRoute>): RT.EventRoute => ({ event_id: null, kind: 'PURCHASE', label: 'x', route: 'W1', window: { state: 'OPEN', deadline: null, assumption: null, why: '' },
      event_date: null, period: null, first_open: null, deadline: null, why: '', words: '', ...o } as RT.EventRoute);
    const lockwood = [
      route({ label: 'The purchase, June 2020', route: 'W2', first_open: { start: '2024-06-01', end: '2025-05-31', deadline: '2027-05-31' }, deadline: '2027-05-31' }),
      route({ label: 'A refurbishment or refit, 2025', kind: 'REFURB' as never, route: 'W1', period: { start: '2025-06-01', end: '2026-05-31' }, deadline: '2028-05-31' }),
      route({ label: 'Repairs', route: 'W3' }),
    ];
    assert.deepEqual(RT.claimReturns(lockwood), [
      { period_end: '2025-05-31', amend_by: '2027-05-31', due_on: '2026-05-31', parts: ['The purchase, June 2020'] },
      { period_end: '2026-05-31', amend_by: '2028-05-31', due_on: '2027-05-31', parts: ['A refurbishment or refit, 2025'] }]);
    // Two parts in one period are one return; a claimed part with no period is not known (N4), never one return.
    assert.equal(RT.claimReturns([lockwood[1]!, { ...lockwood[1]!, label: 'Another work' }])?.length, 1);
    assert.equal(RT.claimReturns([lockwood[0]!, route({ route: 'W1', period: null })]), null);
  });

  test('two returns: the link names its return; the claim closes once the return already due is filed; the later one waits in aftercare', async () => {
    const app = await testApp();
    const w = twoReturns(app);
    const returns = AC.returnsOf(app.db, w.claim, app.now()) ?? [];
    assert.deepEqual(returns.map((r) => [r.period_end, r.due_on]), [['2024-12-31', '2025-12-31'], ['2025-12-31', '2026-12-31']]);
    // One answer for the whole claim no longer fits: the link must name its return.
    const vague = send(app, w.claim, w.contact);
    assert.equal(vague.ok, false);
    assert.match(vague.ok ? '' : vague.why, /more than one tax return/);
    const form = accountantConfirmBlock(app.db, actor('SALES'), w.claim).toString();
    assert.match(form, /name="period_end"/);
    assert.match(form, /The period ending 31 Dec 2024, due 31 Dec 2025/);
    // Not yet filed: the return already due holds the claim, and the later return is said to be not due yet.
    assert.equal(closing(app, w.claim)?.met, false);
    assert.match(closing(app, w.claim)?.why ?? '', /period ending 31 Dec 2024.*has not confirmed it is filed.*period ending 31 Dec 2025.*not due until 31 Dec 2026/);
    // The 2024 return, by its own link: the email and the page ask about that return alone.
    assert.equal(send(app, w.claim, w.contact, '2024-12-31').ok, true);
    assert.match(app.db.get<{ body: string }>('SELECT body FROM outbox ORDER BY rowid DESC LIMIT 1')?.body ?? '', /The tax return for the period ending 31 Dec 2024, carrying its part of this claim, has been filed\./);
    const v = AC.confirmLinkView(app.db, app.now(), tokenIn(app));
    assert.equal(v.state === 'OPEN' ? v.period_end : null, '2024-12-31');
    assert.equal(answer(app, '2026-08-20').ok, true);
    assert.equal(closing(app, w.claim)?.met, true, closing(app, w.claim)?.why ?? '');
    // The later return is held in aftercare with its due date, and its link may still be sent once the claim is closed.
    const after = R.aftercarePanel(app.db, actor('ADMIN'), w.claim, { today: app.now() });
    assert.deepEqual(after.returns_to_file.map((r) => [r.period_end, r.due_on, r.state]), [['2025-12-31', '2026-12-31', 'NOT_DUE']]);
    assert.match(aftercareBlock(w.claim, after).toString(), /Returns still to be filed.*not due until 31 Dec 2026/s);
    app.db.run("UPDATE claims SET stage = 'CLOSED', completed_at = ? WHERE id = ?", [app.now(), w.claim]);
    assert.equal(send(app, w.claim, w.contact, '2025-12-31').ok, true);
    assert.equal(answer(app, '2026-09-01').ok, true);
    assert.deepEqual(R.aftercarePanel(app.db, actor('ADMIN'), w.claim, { today: app.now() }).returns_to_file, []);
    app.close();
  });

  test('a return already due and not filed keeps the claim open, whatever the other return says', async () => {
    const app = await testApp();
    const w = twoReturns(app);
    // Only the later return confirmed: the earlier one, already due, still holds the claim.
    assert.equal(send(app, w.claim, w.contact, '2025-12-31').ok, true);
    assert.equal(answer(app, '2026-08-20').ok, true);
    assert.equal(closing(app, w.claim)?.met, false);
    // One return only (no refit): one link, as before, naming that return, and the claim closes on it.
    const one = twoReturns(app);
    app.db.run("DELETE FROM property_events WHERE property_id = ? AND kind <> 'PURCHASE'", [one.p]);
    assert.equal(AC.returnFilings(app.db, one.claim, app.now()), null);
    assert.equal(send(app, one.claim, one.contact).ok, true);
    assert.equal(app.db.get<{ p: string }>('SELECT period_end AS p FROM accountant_confirm_requests WHERE claim_id = ?', [one.claim])?.p, '2024-12-31');
    assert.equal(answer(app, '2026-08-20').ok, true);
    assert.equal(closing(app, one.claim)?.met, true, closing(app, one.claim)?.why ?? '');
    app.close();
  });
});

/* ================================================================== */

describe('item 3 (L18) — the research panel’s postcode row', () => {
  async function click(answers: boolean) {
    const app = await testApp();
    const biz = randomUUID();
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [biz, 'Lockwood Surgery', 'gp', 'ASSESSMENT_SUBMITTED', T, 'WEBSITE']);
    app.db.run("INSERT INTO properties (id, business_id, label, address_line_1, town, postcode, created_at) VALUES (?, ?, 'Lockwood Surgery', '1 Invented Road', 'Huddersfield', 'HD1 3QN', ?)", [randomUUID(), biz, T]);
    const t = fixtureTransport({
      'GET /postcodes/HD13QN': answers ? { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 200, result: { postcode: 'HD1 3QN', admin_district: 'Kirklees', region: 'Yorkshire and The Humber', country: 'England' } }) }
        : { status: 404, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 404, error: 'Postcode not found' }) },
    });
    const by = (id: string) => RS.catalogue().find((e) => e.source_id === id)!;
    const out = await RS.consultAllowed(
      { db: app.db, audit: app.audit, now: app.now, newId: randomUUID, outside: { transport: t, secrets: secretsFromValues({}), env: { CAPREBATE_LOOKUPS_HERE: '1' }, sleep: async () => {} } },
      actor('ADMIN', 'u-ADMIN'), biz,
      [{ entry: by('PLANNING'), state: 'NOT_RUN', detail: 'not run yet' },
        { entry: by('POSTCODES_IO'), state: 'NOT_PERMITTED_YET', detail: 'free lookups wait until our privacy notice is published: the notice' }],
      { free_gate_open: false, engagement_signed: false });
    app.close();
    return out.find((o) => o.entry.source_id === 'POSTCODES_IO');
  }

  test('a click that checked the postcode: the row says it is the address question’s, and what the research’s own check found', async () => {
    const row = await click(true);
    assert.equal(row?.state, 'NOT_PERMITTED_YET');
    assert.match(row?.detail ?? '', /^This row is the postcode check at the address question, which is a different step from the research\. free lookups wait until our privacy notice is published: the notice\. On this run the research checked the postcode with postcodes\.io itself.*it gave England and the council area Kirklees, kept on the property/);
  });

  test('a check that gave no answer says so, and never claims a council area', async () => {
    const row = await click(false);
    assert.match(row?.detail ?? '', /tried to check the postcode with postcodes\.io itself, and it gave no answer\.$/);
    assert.doesNotMatch(row?.detail ?? '', /Kirklees/);
  });
});

/* ================================================================== */

describe('item 4 (L19) — the events’ figures after the survey', () => {
  let made: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  const cookie = new Map<string, string>();
  const go = async (who: string, path: string, init: RequestInit = {}) => {
    const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { cookie: cookie.get(who) ?? '', ...(init.headers as Record<string, string> | undefined) } });
    return { status: x.status, body: await x.text() };
  };
  before(async () => {
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-159l-')) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const addr = made.server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
    const password = (await seed(made.app.db, made.app.hasher, made.app.now)).password;
    for (const who of ['sales', 'accounting']) {
      const r = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: `${who}@example.invalid`, password }).toString() });
      cookie.set(who, r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '));
    }
  });
  after(() => made.close());

  test('until the survey prices them, the band; once a version is approved, each event’s approved figure from it', async () => {
    const db = made.app.db;
    const c = db.get<{ id: string; business_id: string; assessment_id: string }>('SELECT id, business_id, assessment_id FROM claims WHERE property_id IS NOT NULL AND assessment_id IS NOT NULL AND id NOT IN (SELECT claim_id FROM surveyor_jobs WHERE claim_id IS NOT NULL) LIMIT 1');
    assert.ok(c);
    const post = (f: Record<string, string>) => go('sales', `/staff/claims/${c.id}/events`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
    assert.equal((await post({ kind: 'PURCHASE', date: '06/2020', cost: '250000' })).status, 303);
    assert.equal((await post({ kind: 'REFURBISHMENT', date: '2025', cost: '90000' })).status, 303);
    const section = async (who: string) => { const b = (await go(who, `/staff/claims/${c.id}`)).body; const i = b.indexOf('id="claim-events"'); return b.slice(i, b.indexOf('</details>', i)); };
    const beforeSurvey = await section('sales');
    assert.equal((beforeSurvey.match(/until the survey prices it/g) ?? []).length, 2);
    // The survey approves a version: the purchase £199,689.12 and the refit £63,000, as on Lockwood.
    const refit = db.get<{ id: string }>("SELECT id FROM property_events WHERE property_id = (SELECT property_id FROM claims WHERE id = ?) AND kind = 'REFURBISHMENT'", [c.id]);
    assert.ok(refit);
    CF.packApprovedOn(made.app as never, c.business_id, c.assessment_id, c.id, db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SURVEYING' LIMIT 1")?.id ?? '');
    const pack = db.get<{ id: string }>('SELECT p.id FROM survey_packs p JOIN surveyor_jobs j ON j.id = p.job_id WHERE j.claim_id = ?', [c.id])?.id ?? '';
    const snap = JSON.stringify({ version: 2, sums: { qualifying_pence: 26_268_912 }, events: { purchase_applies: true, purchase: { qualifying_pence: 19_968_912 },
      works: [{ event_id: refit.id, kind: 'REFURBISHMENT', qualifying_pence: 6_300_000 }] } });
    db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, 2, 2, 0, ?, ?, ?, ?)',
      [randomUUID(), pack, snap, createHash('sha256').update(snap).digest('hex'), db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SURVEYING' LIMIT 1")?.id ?? '', made.app.now()]);
    const afterSurvey = await section('sales');
    assert.doesNotMatch(afterSurvey, /until the survey prices it/);
    assert.match(afterSurvey, /£199,689\.12 qualifies, as the survey approved it in version 2\./);
    assert.match(afterSurvey, /£63,000 qualifies, as the survey approved it in version 2\./);
    // A login that may not read the claim's value sees neither.
    assert.doesNotMatch(await section('accounting'), /qualifies|Up to £/);
  });
});

/* ================================================================== */

describe('items 5 and 6 (L20, L17) — the work’s own costs on the report, and BCIS’s quarter in words', () => {
  const SAM = actor('SURVEYING', 'u-sam');
  const deps = (app: App) => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });
  const ok = (r: { ok: boolean }) => assert.equal(r.ok, true, JSON.stringify(r));
  const view = (app: App, job: string) => SP.packView(deps(app), SAM, job);
  const lview = (app: App, job: string) => L.legalView(deps(app), SAM, job);
  const pdfText = (bytes: Uint8Array): string => [...Buffer.from(bytes).toString('latin1').matchAll(/<([0-9a-f]+)> Tj/g)]
    .map((m) => Buffer.from(m[1] ?? '', 'hex').toString('latin1')).join('\n').replace(/\x92/g, '’');

  /** Lockwood at the survey (as test/phase159c.test.ts): the purchase and a 2025 refit, priced and approved. */
  async function approvedLockwood() {
    const app = await testApp();
    for (const [id, role] of [['u-sam', 'SURVEYING'], ['u-ADMIN', 'ADMIN'], ['u-SALES', 'SALES'], ['u-SURVEYING', 'SURVEYING']] as const) {
      app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        [id, `${id}@x.invalid`, `${id}@x.invalid`, `${id} name`, role, 'x', T, T]);
    }
    const b = 'b-l20', p = 'p-l20', as = 'as-l20', job = 'job-l20';
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', [b, 'Lockwood L20 Limited', 'gp', 'SURVEY', T, 'COMPANY']);
    app.db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', [p, b, 'Lockwood Surgery', 'ZZ9 9ZZ', T]);
    app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', [as, b, 'gp', T, null, 25_800_000, T]);
    app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ['e-l20', as, b, 25_800_000, 0.35, 0, 0, 0, 1, 0, T, 'not-a-real-hash']);
    PE.writeAssessmentEvents(app.db, randomUUID, { property_id: p, business_id: b, assessment_id: as, at: T },
      [{ type: 'purchase', cost: 650000, date: '03/2025' }, { type: 'refurb', cost: 90000, date: '2025' }]);
    const claim = C.insertClaim(app.db, app.now, randomUUID, { business_id: b, property_id: p, assessment_id: as, workstream: 'PLANT_AND_MACHINERY', stage: 'SURVEY', owner_id: null, surveyor_id: null });
    app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [job, b, as, 'u-sam', 'SEALED', null, T, claim.id]);
    app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      ['rr-epc-l20', b, 'EPC', 'RRN-l20', JSON.stringify({ epc_total_floor_area_m2: 640.5 }), T, p]);
    app.db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      ['rr-title-l20', b, 'HMLR_TITLE', 'ZZl20', JSON.stringify({ title_number: 'ZZl20', price_paid: 650000 }), T, p]);
    CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_START', '2025-04-01');
    CF.fact(app, claim.id, 'ACCOUNTING_PERIOD_END', '2026-03-31');
    const keep = view(app, job).lines.slice(0, 2).map((l) => l.id);
    for (const l of view(app, job).lines) { if (keep.includes(l.id) || l.removed) continue; ok(SP.setLineRemoved(deps(app), SAM, job, { line: l.id, reason: 'Not here', seq: String(view(app, job).seq) }, true)); }
    ok(SP.saveLine(deps(app), SAM, job, { line: keep[0] as string, qty: '10', rate: '2000', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', qpct: '100', pool: 'SR', reason: 'Counted', seq: String(view(app, job).seq) }));
    ok(SP.saveLine(deps(app), SAM, job, { line: keep[1] as string, qty: '100', rate: '300', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', qpct: '100', pool: 'MP', reason: 'Counted', seq: String(view(app, job).seq) }));
    ok(SP.savePackValue(deps(app), SAM, job, { field: 'land', value: '150000', reason: 'Land registry', seq: String(view(app, job).seq) }));
    ok(SP.savePackValue(deps(app), SAM, job, { field: 'building_rate', value: '1500', rate_basis: 'QS_SCHEDULE', rate_ref: 'Test schedule, item 1', rate_priced_at: '2026-09-01', reason: 'BCIS', seq: String(view(app, job).seq) }));
    const w = view(app, job).works[0]!;
    ok(SP.saveWorks(deps(app), SAM, job, { event: w.event.id, values: { works_total: '90000', works_main: '30000', works_special: '20000', works_bwic: '5000', works_demolition: '1000',
      works_other: '20000', works_repairs: '4000', works_prelims: '6000', works_fees: '4000' }, reason: 'From the final account dated 30 June 2025', seq: String(view(app, job).seq) }));
    ok(EV.setBasis(deps(app), SAM, job, { basis: 'DESKTOP_EVIDENCE', note: '' }));
    A.saveDetails(deps(app), SAM, job, { rics_number: '1234567', firm: 'Survey Firm' });
    ok(L.answerLegal(deps(app), SAM, job, { question: 'G8', values: ['new_build'], source: 'The client’s contract', seq: String(lview(app, job).seq) }));
    ok(L.answerLegal(deps(app), SAM, job, { question: 'G9d', values: ['2025-06-01'], source: 'The client’s contract', seq: String(lview(app, job).seq) }));
    for (const c of CH.chaptersToRead()) A.recordRead(deps(app), SAM, job, c, lview(app, job).seq);
    ok(A.approvePack(deps(app), SAM, job, { seq: String(view(app, job).seq), legal_seq: String(lview(app, job).seq) }));
    return { app, kept: A.approvedVersion(deps(app), actor('ADMIN'), job, 1)! };
  }

  test('L20: each of the refit’s nine values is in “Where each number came from”, with the surveyor’s name and reason, on the page and in the PDF', async () => {
    const { app, kept } = await approvedLockwood();
    const snap = kept.snapshot as unknown as { events: { works: { input_sources: Record<string, { kind: string; reason: string | null } | null> }[] } };
    assert.equal(Object.keys(snap.events.works[0]!.input_sources).length, 9);
    assert.equal(snap.events.works[0]!.input_sources['works_main']?.reason, 'From the final account dated 30 June 2025');
    const m = REP.reportModel(kept.snapshot, kept.row.fingerprint);
    const works = m.sources.filter((r) => r.label.startsWith('A refurbishment or refit, 2025: '));
    assert.deepEqual(works.map((r) => [r.label.replace('A refurbishment or refit, 2025: ', ''), r.value]), [
      ['the final account, in all', '£90,000'], ['plant and machinery (main pool)', '£30,000'], ['integral features (special rate pool)', '£20,000'],
      ['builder’s work for that plant', '£5,000'], ['taking out old plant', '£1,000'], ['other building work, which does not qualify', '£20,000'],
      ['the repair part', '£4,000'], ['preliminaries', '£6,000'], ['professional fees', '£4,000']]);
    for (const r of works) {
      assert.equal(r.chip.kind, 'SURVEYOR', r.label);
      assert.equal(r.reason, 'From the final account dated 30 June 2025', r.label);
    }
    const html = String(REP.reportHtml(m, { pdf: null }));
    const where = html.slice(html.indexOf('Where each number came from'));
    assert.match(where, /A refurbishment or refit, 2025: plant and machinery \(main pool\)<\/td><td class="n">£30,000/);
    const pdf = pdfText(REP.reportPdf(m).bytes);
    assert.match(pdf, /A refurbishment or refit, 2025: preliminaries/);
    assert.match(pdf, /From the final account dated 30 June 2025/);
    // A version approved before this phase kept no sources: the values are printed, and it says so (never a made-up source).
    const old = JSON.parse(JSON.stringify(kept.snapshot)) as { events: { works: Record<string, unknown>[] } };
    delete old.events.works[0]!['input_sources'];
    const om = REP.reportModel(old as never, kept.row.fingerprint).sources.filter((r) => r.label.startsWith('A refurbishment'));
    assert.equal(om.length, 9);
    assert.ok(om.every((r) => r.chip.kind === 'NONE' && r.reason === 'Its source was not kept with this version.'));
    app.close();
  });

  test('L17: BCIS’s base quarter is a month in words, on a new draft and on a version approved before', () => {
    assert.deepEqual(['2026-01', '2026-04', '2025-10', 'not a quarter'].map(baseWords), ['January 2026', 'April 2026', 'October 2025', 'not a quarter']);
    const src = { kind: 'DRAFT', text: 'x', basis: { kind: 'BCIS', ref: 'Health centres, clinics, group practice surgeries, mean £2,650/m² at 2026-01', priced_at: null, location: null, index: null } };
    // A version approved before kept "at 2026-01" in its source: the report reads it "at January 2026"; a day such as
    // 2026-01-31 is left alone.
    const words = (REP as unknown as { rateWordsForTest?: (s: unknown) => string }).rateWordsForTest;
    assert.equal(typeof words, 'function');
    assert.equal(words!(src), 'BCIS: Health centres, clinics, group practice surgeries, mean £2,650/m² at January 2026.');
    assert.match(words!({ ...src, basis: { ...src.basis, ref: 'schedule dated at 2026-01-31' } }), /at 2026-01-31/);
  });
});

/* ================================================================== */

describe('item 8 — the statements route and the fixed value requirement, in the pack’s legal check', () => {
  const NOW = '2026-10-09T09:00:00.000Z';
  const CTA = (CB as unknown as { CB_CTA: Record<string, unknown> }).CB_CTA;
  const OFF = { s187a_6b_statements_route: false, fvr_requires_past_owner_claim: false };
  /** A walk path (test/legal-paths-walk.ts) where the owner in between could never claim and both statements are held. */
  const STATEMENTS = new Map(Object.entries({ G8: ['purchase'], G8a: 'property', G9d: '2025-06-01', G11: 'yes', G12: 'other', 'LC-seller-nontax': 'yes', G12b: 'unsure',
    G14: 'held', G14s: 'lease_premium', G14s3: 'unsure', G14sx: 's.198', G14d: '2025-06-01', G14n: '2025-09-01', G14fvr: 'yes', G14po: 'new_lease_premium', G14pol: 'yes',
    G14pold: '2019-06-01', G14iv: 'unsure', G14ivne: 'no', G14st8: 'held', G14rs: 'split', G14rsv: 50000, G14sc: 'listed_items', G14mp: 'no',
    G14c: ['amount', 'plant', 'land', 'interest', 'utrs', 'both'], G14v: 60000, G15: 'no' }));

  test('#9: the pack asks the two statements questions and the route clears the claim; off, they are not asked and it is not settled', () => {
    const on = L.assessLegal('gp', STATEMENTS, NOW, 'company');
    assert.ok(on.asked.some((q) => q.id === 'G14ivne') && on.asked.some((q) => q.id === 'G14st8'));
    assert.equal(on.verdict.level, 'GREEN');
    assert.ok(on.verdict.why.some((w) => /two written statements s\.187A\(8\) requires\. That route has no time limit/.test(w)), on.verdict.why.join(' | '));
    const off = L.assessLegalUnder(OFF, 'gp', STATEMENTS, NOW, 'company');
    assert.ok(!off.asked.some((q) => q.id === 'G14ivne' || q.id === 'G14st8'));
    assert.equal(off.verdict.level, 'AMBER');
    // N4: "not sure" about the statements, or never answered, is never the route.
    for (const v of ['unsure', undefined]) {
      const a = new Map(STATEMENTS);
      if (v === undefined) a.delete('G14st8'); else a.set('G14st8', v);
      assert.notEqual(L.assessLegal('gp', a, NOW, 'company').verdict.level, 'GREEN', String(v));
    }
  });

  test('the override is scoped: the engine’s switches are off before and after, even when the flow throws, and the public estimate never sees them on', () => {
    assert.deepEqual([CTA['s187a_6b_statements_route'], CTA['fvr_requires_past_owner_claim']], [false, false]);
    let inside: unknown[] = [];
    L.withLegalEngineReadings(L.LEGAL_READINGS, () => { inside = [CTA['s187a_6b_statements_route'], CTA['fvr_requires_past_owner_claim']]; });
    assert.deepEqual(inside, [true, true]);
    assert.throws(() => L.withLegalEngineReadings(L.LEGAL_READINGS, () => { throw new Error('boom'); }), /boom/);
    L.assessLegal('gp', STATEMENTS, NOW, 'company');
    assert.deepEqual([CTA['s187a_6b_statements_route'], CTA['fvr_requires_past_owner_claim']], [false, false]);
    assert.deepEqual([...L.LEGAL_ENGINE_SWITCHES], ['s187a_6b_statements_route', 'fvr_requires_past_owner_claim']);
  });
});
