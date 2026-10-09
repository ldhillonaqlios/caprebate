/**
 * PHASE 158d — 9 October 2026. What Phase 158c's second run of the invented client found, with nobody ticking a step
 * for somebody else (04-phase-work/sim-2026-10-06/Friary-House-simulation-findings.md, OneDrive: F43 to F47).
 *
 *   F43  The portal told the client less than the claim knew: still "Step 1 of 6" just after they signed, nothing new,
 *        and "Nothing at the moment" while the gate waited on their documents or their acceptance of the report.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import type { App } from '../src/app.ts';
import * as C from '../src/web/crm.ts';
import * as CF from './claim-fixtures.ts';
import { ENGAGEMENT_SIGNING_TEST, letterFacts, shownLetter, signEngagement } from '../src/web/signing.ts';
import { TEST_LETTER_PATH } from '../src/web/letter.ts';
import { sendEngagementLetter } from '../src/web/engagement-send.ts';
import { portalDashboard } from '../src/web/portal-dashboard.ts';

const T0 = '2026-10-09T09:00:00.000Z';
let n = 0;

function staff(app: App): void {
  for (const role of ['SURVEYING', 'SALES', 'ADMIN', 'ACCOUNTING'] as const) {
    app.db.run('INSERT OR IGNORE INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@158d.example.invalid`, `${role.toLowerCase()}@158d.example.invalid`, `${role[0]}${role.slice(1).toLowerCase()} Person`, role, 'x', T0, T0]);
  }
}

/** An invented partnership with a client login, its assessment, property and one claim at `stage`. */
function client(app: App, stage: string, bizStage = 'ASSESSMENT_SUBMITTED') {
  n += 1;
  const business = `b-158d-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source,claimant_type) VALUES (?,?,?,?,?,?,?)',
    [business, `Practice ${n} (TEST)`, 'gp', bizStage, T0, 'WEBSITE', 'PARTNERSHIP']);
  const user = `u-cl-${n}`;
  app.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,'Ivy','CLIENT','x',?,?,?)",
    [user, `${user}@example.invalid`, `${user}@example.invalid`, T0, T0, business]);
  const property = `p-158d-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-158d-${n}`;
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'gp', T0, 127_500_00, 255_000_00, T0]);
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'UNKNOWN', stage, owner_id: null, surveyor_id: null,
  });
  return { business, user, property, assessment, claim: made.id };
}

const bizStage = (app: App, business: string) => app.db.get<{ stage: string }>('SELECT stage FROM businesses WHERE id = ?', [business])?.stage;

function signNow(app: App, c: { business: string; user: string }) {
  const session = randomUUID();
  app.db.run('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    [session, c.user, randomBytes(16).toString('hex'), T0, '2099-01-01T00:00:00.000Z', T0]);
  const deps = { db: app.db, audit: app.audit, email: app.email, now: app.now, newId: randomUUID };
  sendEngagementLetter(deps, actor('SALES', 'u-SALES'), c.business);
  const name = app.db.get<{ name: string }>('SELECT name FROM businesses WHERE id = ?', [c.business])?.name ?? '';
  return signEngagement(deps, actor('CLIENT', c.user, c.business), c.business,
    { full_name: 'Ivy Inventedperson', role: 'Partner', authorised: true, typed_as_signature: true,
      letter_sha256: shownLetter({ name }, TEST_LETTER_PATH, letterFacts(app.db, c.business)).sha256 },
    { ip: '203.0.113.9', session_id: session }, { cfg: ENGAGEMENT_SIGNING_TEST, letterPath: TEST_LETTER_PATH });
}

const dash = (app: App, c: { business: string; user: string }, requests: { id: string; state: string; type: { label: string }; due: { label: string; overdue: boolean } }[] = []) =>
  String(portalDashboard({ db: app.db, actor: actor('CLIENT', c.user, c.business), business_id: c.business, nowIso: app.now(),
    bookings: [], tasks: [], requests, done: [], delivered: [], joins: {} }));
const card = (html: string, id: string) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</section>', html.indexOf(`id="${id}"`)));

describe('F43 — the portal says what the claim knows', () => {
  test('signing the letter moves the client to step 2 at once, and never lowers a client already past it', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'ENGAGEMENT');
    assert.equal(bizStage(app, c.business), 'ASSESSMENT_SUBMITTED');
    const r = signNow(app, c);
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    assert.equal(bizStage(app, c.business), 'ENGAGEMENT_SIGNED');
    assert.match(card(dash(app, c), 'where-you-are'), /Step 2 of 6: Engagement letter signed/);
    const later = client(app, 'ENGAGEMENT', 'AT_SURVEY');
    assert.equal(signNow(app, later).ok, true);
    assert.equal(bizStage(app, later.business), 'AT_SURVEY', 'signing lowered a client already further on');
    app.close();
  });

  test('"New for you" says the letter is signed', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'ENGAGEMENT');
    assert.doesNotMatch(card(dash(app, c), 'new-for-you'), /signed your engagement letter/);
    assert.equal(signNow(app, c).ok, true);
    assert.match(card(dash(app, c), 'new-for-you'), /You signed your engagement letter/);
    app.close();
  });

  test('"What we need from you" lists the documents the step is waiting on, whether or not we asked, once each', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'DATA_GATHERING', 'ENGAGEMENT_SIGNED');
    const needs = card(dash(app, c), 'waiting-on-you');
    assert.doesNotMatch(needs, /Nothing at the moment/);
    assert.match(needs, /Tax return/);
    assert.match(needs, /Tax computation/);
    // One already asked for appears once, as the request.
    const asked = card(dash(app, c, [{ id: 'r1', state: 'REQUESTED', type: { label: 'Tax return' }, due: { label: 'no date', overdue: false } }]), 'waiting-on-you');
    assert.equal(asked.split('Tax return').length - 1, 1, 'the tax return is listed twice');
    // At Survey the documents are behind the claim: nothing is asked.
    const on = client(app, 'SURVEY', 'AT_SURVEY');
    assert.match(card(dash(app, on), 'waiting-on-you'), /Nothing at the moment/);
    app.close();
  });

  test('"What we need from you" asks the client to accept their report once it is released, and not after', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'REPORTS', 'AT_SURVEY');
    assert.match(card(dash(app, c), 'waiting-on-you'), /Nothing at the moment/);
    CF.signOffRow(app, c.business, c.assessment, c.claim);
    CF.releaseReportFor(app, c.claim);
    const needs = card(dash(app, c), 'waiting-on-you');
    assert.match(needs, /Your survey report — read it and tell us you accept it/);
    assert.match(needs, /href="\/portal\/report"/);
    CF.clientAccepted(app, c.claim);
    const who = app.db.get<{ user_id: string }>('SELECT user_id FROM client_report_acceptances WHERE claim_id = ?', [c.claim])?.user_id ?? '';
    assert.match(card(dash(app, { business: c.business, user: who }), 'waiting-on-you'), /Nothing at the moment/);
    app.close();
  });
});

/* ================================================================== *
 * F44 — "floor area sourced" needs a floor area on record
 * ================================================================== */
import * as P from '../src/web/pipeline.ts';

/** A client question put and answered in the portal, and its answer ticked by Sales as checked (or not). */
function answered(app: App, business: string, fact_id: string, answer: string, approve = true): string {
  const id = `ct-${randomUUID()}`;
  const at = app.now();
  app.db.run('INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, fact_id, sent_to_portal_at) ' +
    "VALUES (?, ?, 'u-SALES', 'a question', 'why', 'this claim', 'ANSWERED', 'ANSWERED', ?, ?, NULL, 'CLIENT', ?, ?, ?)", [id, business, answer, at, at, fact_id, at]);
  if (approve) app.db.run("INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, 'APPROVED', NULL, 'u-SALES', ?)", [randomUUID(), business, `ans.${id}`, at]);
  return id;
}

describe('F44 — "Data gathering complete — floor area sourced" needs a floor area on record', () => {
  const tick = (app: App, claim: string) => P.recordMilestone(CF.recordDeps(app), actor('SALES'), claim, 'DATA_GATHERING_COMPLETE', null);

  test('with no floor area anywhere the tick is refused, and says where one comes from', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'DATA_GATHERING', 'ENGAGEMENT_SIGNED');
    const r = tick(app, c.claim);
    assert.equal(r.ok, false);
    assert.match(r.ok ? '' : r.why, /No floor area is on record yet/);
    assert.match(r.ok ? '' : r.why, /energy certificate/);
    app.close();
  });

  test('the energy certificate of this property counts; another property’s does not', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'DATA_GATHERING', 'ENGAGEMENT_SIGNED');
    const other = client(app, 'DATA_GATHERING', 'ENGAGEMENT_SIGNED');
    CF.floorAreaOnRecord(app, other.business, other.property, 300);
    assert.equal(tick(app, c.claim).ok, false);
    CF.floorAreaOnRecord(app, c.business, c.property, 450);
    assert.equal(tick(app, c.claim).ok, true);
    app.close();
  });

  test('the client’s answer to "how big is the building" counts once it is checked, and only with a number in it', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'DATA_GATHERING', 'ENGAGEMENT_SIGNED');
    answered(app, c.business, 'floor_area_m2', 'about 450 square metres', false);
    assert.equal(tick(app, c.claim).ok, false, 'an answer nobody checked counted');
    answered(app, c.business, 'floor_area_m2', 'not sure');
    assert.equal(tick(app, c.claim).ok, false, 'an answer with no number counted');
    answered(app, c.business, 'floor_area_m2', 'about 450 square metres');
    assert.equal(tick(app, c.claim).ok, true);
    app.close();
  });
});

/* ================================================================== *
 * F45 — one purchase date, and the client's year end, read by the window
 * ================================================================== */
import * as F from '../src/web/claim-facts.ts';

/** The surveyor's answer to the legal check's G9d ("On what date did that happen?") on a pack on this claim. */
function surveyorSaid(app: App, c: { business: string; assessment: string; claim: string }, iso: string): void {
  const job = randomUUID();
  const pack = randomUUID();
  const at = app.now();
  app.db.run("INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,'u-SURVEYING','SEALED',NULL,?,?)",
    [job, c.business, c.assessment, at, c.claim]);
  app.db.run("INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, NULL, ?, 'u-SURVEYING')", [pack, job, at]);
  app.db.run("INSERT INTO survey_pack_legal_answers (id, pack_id, seq, question_id, value_json, by_user, source_note, at) VALUES (?, ?, 1, 'G9d', ?, 'u-SURVEYING', 'the completion statement', ?)",
    [randomUUID(), pack, JSON.stringify(iso), at]);
}

describe('F45 — the window reads the purchase date and year end the client or the surveyor gave, and says which', () => {
  const at = (app: App, claim: string) => {
    const c = app.db.get<{ id: string; business_id: string; property_id: string | null }>('SELECT id, business_id, property_id FROM claims WHERE id = ?', [claim]);
    assert.ok(c);
    return F.amendmentWindowReading(app.db, c, app.now().slice(0, 10));
  };
  const setUp = async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'REPORTS', 'AT_SURVEY');
    CF.fact(app, c.claim, 'PARTNERSHIP_HAS_COMPANY_MEMBER', 'NO');
    return { app, c };
  };

  test('nothing given: not known, as before', async () => {
    const { app, c } = await setUp();
    assert.equal(at(app, c.claim).state, 'UNKNOWN');
    assert.match(at(app, c.claim).why, /the acquisition date and the accounting period/);
    app.close();
  });

  test('the surveyor’s completion date and the client’s checked year end are read, and the window says where each came from', async () => {
    const { app, c } = await setUp();
    surveyorSaid(app, c, '2024-06-14');
    answered(app, c.business, 'year_end', '5 April');
    const w = at(app, c.claim);
    assert.equal(w.state, 'OPEN', w.why);
    assert.equal(w.deadline, '2027-01-31');
    assert.match(w.why, /the purchase date from the surveyor’s legal check \(14 Jun 2024\)/);
    assert.match(w.why, /the accounting period from the client’s year end \(6 Apr 2024 to 5 Apr 2025\)/);
    app.close();
  });

  test('the client’s checked completion date is read; an unchecked one is not; one with no full date is not', async () => {
    const { app, c } = await setUp();
    CF.fact(app, c.claim, 'ACCOUNTING_PERIOD_START', '2024-04-06');
    CF.fact(app, c.claim, 'ACCOUNTING_PERIOD_END', '2025-04-05');
    answered(app, c.business, 'completion_date', '14 June 2024', false);
    assert.equal(at(app, c.claim).state, 'UNKNOWN', 'an unchecked answer was read');
    answered(app, c.business, 'completion_date', 'June 2024');
    assert.equal(at(app, c.claim).state, 'UNKNOWN', 'a month alone was read as a date');
    answered(app, c.business, 'completion_date', '14 June 2024');
    const w = at(app, c.claim);
    assert.equal(w.state, 'OPEN', w.why);
    assert.match(w.why, /the purchase date from the client’s own answer, checked \(14 Jun 2024\)/);
    app.close();
  });

  test('a date on the property record wins, and recorded accounting periods win over the year end', async () => {
    const { app, c } = await setUp();
    surveyorSaid(app, c, '2019-06-14');
    answered(app, c.business, 'year_end', '31 March');
    app.db.run("UPDATE properties SET acquisition_date = '2024-06-14' WHERE id = ?", [c.property]);
    CF.fact(app, c.claim, 'ACCOUNTING_PERIOD_START', '2024-04-06');
    CF.fact(app, c.claim, 'ACCOUNTING_PERIOD_END', '2025-04-05');
    const w = at(app, c.claim);
    assert.equal(w.state, 'OPEN', w.why);
    assert.doesNotMatch(w.why, /surveyor|year end/);
    app.close();
  });
});

/* ================================================================== *
 * F46 — the client's accountant confirms for themselves
 * ================================================================== */
import * as AC from '../src/web/accountant-confirm.ts';
import * as R from '../src/web/claim-record.ts';

function accountantContact(app: App, business: string): string {
  const id = randomUUID();
  app.db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, whatsapp_optin, created_at, contact_type, email) VALUES (?, ?, 'Test Accountant (TEST)', 1, 0, 0, ?, 'ACCOUNTANT', ?)",
    [id, business, T0, `acct-${id}@example.invalid`]);
  return id;
}
const tokenIn = (app: App): string => /\/confirm\/([A-Za-z0-9_-]{43})/.exec(app.db.get<{ body: string }>('SELECT body FROM outbox ORDER BY rowid DESC LIMIT 1')?.body ?? '')?.[1] ?? '';
const send = (app: App, claim: string, kind: string, contact_id: string) => AC.sendConfirmRequest(
  { db: app.db, audit: app.audit, now: app.now, newId: randomUUID, email: app.email }, actor('SALES'), claim, { kind, contact_id, origin: 'https://caprebate.example.invalid' });
const answer = (app: App, token: string, f: Partial<{ outcome: string; name: string; firm: string; filed_on: string; reason: string; sure: string }>) =>
  AC.answerConfirmLink({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID }, token,
    { outcome: 'CONFIRMED', name: 'Test Accountant', firm: 'Test Accountants LLP', filed_on: '', reason: '', sure: 'yes', ...f });

describe('F46 — the accountant confirms the return fit and the filing through their own link', () => {
  test('the staff tick is retired: nobody can tick it, and the Reports gate no longer reads it', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'REPORTS', 'AT_SURVEY');
    assert.ok(P.MILESTONES.ACCOUNTANT_CONFIRMED_RETURN.retired !== undefined);
    for (const role of ['SALES', 'ADMIN'] as const) {
      assert.equal(P.recordMilestone(CF.recordDeps(app), actor(role), c.claim, 'ACCOUNTANT_CONFIRMED_RETURN', null).ok, false, role);
    }
    const need = P.gateOut(app.db, P.loadPipelineClaim(app.db, c.claim), 'REPORTS', { today: app.now() }).needs.find((n) => n.what.startsWith('The client’s accountant'));
    assert.equal(need?.what, AC.RETURN_FIT_NEED);
    assert.equal(need?.met, false);
    assert.match(need?.why ?? '', /has not answered yet/);
    app.close();
  });

  test('the link is sent only at its stage, only to the company’s accountant, and the accountant’s own answer opens the need', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'REPORTS', 'AT_SURVEY');
    const other = client(app, 'REPORTS', 'AT_SURVEY');
    const theirs = accountantContact(app, other.business);
    assert.equal(send(app, c.claim, 'RETURN_FIT', theirs).ok, false, 'another company’s accountant was sent the link');
    const mine = accountantContact(app, c.business);
    assert.equal(send(app, c.claim, 'FILED', mine).ok, false, 'the filing link went out at Reports');
    assert.equal(send(app, c.claim, 'RETURN_FIT', mine).ok, true);
    const token = tokenIn(app);
    assert.equal(token.length, 43);
    // The link's token is never stored; only its fingerprint.
    assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM accountant_confirm_requests WHERE token_sha256 = ?', [token])?.n, 0);
    const need = () => P.gateOut(app.db, P.loadPipelineClaim(app.db, c.claim), 'REPORTS', { today: app.now() }).needs.find((n) => n.what === AC.RETURN_FIT_NEED);
    assert.equal(answer(app, token, { firm: 'Just A Name' }).ok, false, 'a firm with no registered ending');
    assert.equal(answer(app, token, { sure: '' }).ok, false, 'confirmed without the tick');
    assert.equal(answer(app, token, {}).ok, true);
    assert.equal(answer(app, token, {}).ok, false, 'answered twice');
    assert.equal(need()?.met, true);
    assert.match(need()?.why ?? '', /confirmed by Test Accountant of Test Accountants LLP/);
    app.close();
  });

  test('"not so" keeps the need shut and says why', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'REPORTS', 'AT_SURVEY');
    CF.accountantAnswers(app, c.claim, 'RETURN_FIT', { outcome: 'NOT_CONFIRMED', reason: 'The 2024 return is already closed.' });
    const need = P.gateOut(app.db, P.loadPipelineClaim(app.db, c.claim), 'REPORTS', { today: app.now() }).needs.find((n) => n.what === AC.RETURN_FIT_NEED);
    assert.equal(need?.met, false);
    assert.match(need?.why ?? '', /said it does not: “The 2024 return is already closed\.”/);
    app.close();
  });

  test('the filing: staff cannot type it where the accountant files; the accountant’s date becomes the claim’s, and closing reads it', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'DEFENCE_PACK', 'AT_SURVEY');
    CF.signOffRow(app, c.business, c.assessment, c.claim);
    const need = () => P.gateOut(app.db, P.loadPipelineClaim(app.db, c.claim), 'DEFENCE_PACK', { today: app.now() }).needs.find((n) => n.what.startsWith('The claim’s filing is recorded'));
    assert.match(need()?.why ?? '', /has not confirmed the filing yet/);
    // A reconciliation to hold the date (the fixture opens one with the sign-off).
    CF.filingRecorded(app, c.claim, '2026-09-01');
    assert.equal(need()?.met, true);
    assert.match(need()?.why ?? '', /filed on 2026-09-01, confirmed by Test Accountant of Test Accountants LLP/);
    assert.equal(app.db.get<{ f: string }>('SELECT filed_on AS f FROM claim_reconciliations WHERE claim_id = ?', [c.claim])?.f, '2026-09-01');
    const typed = R.recordFiling(CF.recordDeps(app), actor('SALES'), c.claim, { filed_on: '2026-09-02' });
    assert.equal(typed.ok, false);
    assert.match(typed.ok ? '' : typed.why, /accountant files this return/);
    app.close();
  });

  test('where the client has no accountant (their own written yes, and none on file), staff still record the filing as before', async () => {
    const app = await testApp(); staff(app);
    const c = client(app, 'DEFENCE_PACK', 'AT_SURVEY');
    app.db.run("INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) VALUES (?, ?, ?, 'u-SALES', 'SALES', 'FORWARD', 'TAX_ADVISER_SIGNOFF', 'REPORTS', NULL, NULL)",
      [randomUUID(), c.claim, '2026-09-01T00:00:00.000Z']);
    app.db.run("INSERT INTO client_filing_confirmations (id, claim_id, business_id, confirmed_by_party, no_accountant_or_adviser, will_file_amendment, last_day_acknowledged, last_day_stated, remains_responsible, written_evidence, recorded_by, recorded_at) " +
      "VALUES (?, ?, ?, 'CLIENT', 'YES', 'YES', 'YES', '2027-01-31', 'YES', 'the client’s email (TEST)', 'u-SALES', ?)", [randomUUID(), c.claim, c.business, '2026-09-02T00:00:00.000Z']);
    assert.equal(R.accountantFiles(app.db, c.claim), false);
    CF.filingRecorded(app, c.claim);
    assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM accountant_confirm_requests WHERE claim_id = ?', [c.claim])?.n, 0);
    app.close();
  });
});

async function salesWeb() {
  const { createApp } = await import('../src/server.ts');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-158d-web-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const hash = await made.app.hasher.hash('Invented-Pass-158d');
  made.app.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-SALES','sales@158d.example.invalid','sales@158d.example.invalid','Sales Person','SALES',?,?,?,NULL)", [hash, T0, T0]);
  const browser = () => {
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
      for (const x of r.headers.getSetCookie()) { const f = x.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((y) => y && y.split('=')[0] !== k), f].join('; '); }
      return { status: r.status, body: await r.text(), location: r.headers.get('location') };
    };
    const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
    return { req, post };
  };
  const sales = browser();
  assert.equal((await sales.post('/login', { email: 'sales@158d.example.invalid', password: 'Invented-Pass-158d' })).status, 303);
  return { made, sales, outsider: browser() };
}

describe('F46 — on screen', () => {
  test('Sales sends the link from the claim page; the accountant answers on their own page, with no login; the gate opens', async () => {
    const w = await salesWeb();
    try {
      const app = w.made.app;
      staff(app);
      const c = client(app, 'REPORTS', 'AT_SURVEY');
      const contact = accountantContact(app, c.business);
      const page = await w.sales.req(`/staff/claims/${c.claim}`);
      assert.match(page.body, /id="accountant-confirm"[\s\S]*Nobody here ticks them[\s\S]*action="\/staff\/claims\/[^"]+\/accountant-confirm"/);
      assert.doesNotMatch(page.body, /name="milestone" value="ACCOUNTANT_CONFIRMED_RETURN"/, 'the retired tick is still offered');
      const sent = await w.sales.post(`/staff/claims/${c.claim}/accountant-confirm`, { kind: 'RETURN_FIT', contact_id: contact });
      assert.equal(sent.status, 303, sent.body.slice(0, 300));
      const token = tokenIn(app);
      const open = await w.outsider.req(`/confirm/${token}`);
      assert.equal(open.status, 200);
      assert.match(open.body, /The claim fits the client’s tax return, and it can still go in inside the amendment window\./);
      const done = await w.outsider.post(`/confirm/${token}`, { outcome: 'CONFIRMED', name: 'Test Accountant', firm: 'Test Accountants LLP', sure: 'yes' });
      assert.equal(done.status, 303);
      assert.match((await w.outsider.req(`/confirm/${token}`)).body, /Thank you/);
      assert.equal((await w.outsider.req('/confirm/not-a-real-link-at-all-not-a-real-link-at-al')).status, 404);
      const after = await w.sales.req(`/staff/claims/${c.claim}`);
      assert.match(after.body, /Confirmed[\s\S]*by Test Accountant of Test Accountants LLP/);
    } finally { w.made.close(); }
  });
});
