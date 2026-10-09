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
