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
 */
import { describe, test } from 'node:test';
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
