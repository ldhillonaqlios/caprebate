/**
 * PHASE 158b — 7 October 2026. What Phase 158a's Friary House run found at and before Survey
 * (04-phase-work/sim-2026-10-06/Friary-House-simulation-findings.md, OneDrive: F22 to F33).
 *
 *   F31  Nothing in the application opened a survey job, and nothing locked the estimate the surveyor's commit
 *        releases: surveyor_jobs and estimates were written only by the seed and the tests. Staff (Admin and Sales,
 *        the existing `surveyor_job.assign`) now open one from the claim at Survey. Opening it seals the figure the
 *        four-stage funnel showed the client as the estimate, with its basis recorded (migration 100), and the
 *        surveyor's commit then releases it.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { testApp, actor } from './helpers.ts';
import type { App } from '../src/app.ts';
import * as C from '../src/web/crm.ts';
import * as SO from '../src/web/survey-open.ts';
import { commitFigures, workspace } from '../src/web/surveyor.ts';

const T0 = '2026-10-07T09:00:00.000Z';
let n = 0;

/** A GP practice that bought its building for £850,000 and was shown "up to £255,000", with a claim at a stage. */
function claimAt(app: App, stage: string, shownHigh: number | null = 255_000_00): { business: string; assessment: string; claim: string } {
  n += 1;
  const business = `b-158b-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, `Practice ${n} (TEST)`, 'gp', 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-158b-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-158b-${n}`;
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'gp', T0, shownHigh === null ? null : shownHigh / 2, shownHigh, T0]);
  for (const [ord, q, v] of [[0, 'Q2-1-trigger', 'purchase'], [1, 'Q2-1-spend', '850000']] as const) {
    app.db.run('INSERT INTO assessment_answers (id,assessment_id,ord,question_id,question_text,state,value) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), assessment, ord, q, q, 'ANSWERED', v]);
  }
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'UNKNOWN', stage, owner_id: null, surveyor_id: null,
  });
  return { business, assessment, claim: made.id };
}

function staff(app: App): void {
  for (const role of ['SURVEYING', 'SALES', 'ADMIN', 'ACCOUNTING'] as const) {
    app.db.run('INSERT OR IGNORE INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@158b.example.invalid`, `${role.toLowerCase()}@158b.example.invalid`, `${role[0]}${role.slice(1).toLowerCase()} Person`, role, 'x', T0, T0]);
  }
}

const deps = (app: App): SO.OpenDeps => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });

describe('F31 — staff open a survey job from the claim at Survey, and it seals the estimate', () => {
  test('Sales opens one: the job is on the claim and the surveyor, and the estimate is the figure the client was shown', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'SURVEY');
    const r = SO.openSurveyJob(deps(app), actor('SALES'), c.claim, 'u-SURVEYING');
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    const job = app.db.get<{ state: string; surveyor_id: string; claim_id: string; assessment_id: string; business_id: string }>(
      'SELECT state, surveyor_id, claim_id, assessment_id, business_id FROM surveyor_jobs WHERE claim_id = ?', [c.claim])!;
    assert.deepEqual(job, { state: 'SEALED', surveyor_id: 'u-SURVEYING', claim_id: c.claim, assessment_id: c.assessment, business_id: c.business });
    const e = app.db.get<Record<string, unknown>>('SELECT * FROM estimates WHERE assessment_id = ?', [c.assessment])!;
    assert.equal(e['qualifying_expenditure_pence'], 255_000_00);
    assert.equal(e['qualifying_pct'], 0.3, '£255,000 of £850,000');
    for (const k of ['pool_split_main_pence', 'pool_split_special_pence', 'bare_land_pence', 'multiplier', 'indicative_lifetime_saving_pence']) {
      assert.equal(e[k], 0, `${k}: the assessment does not estimate it`);
    }
    assert.equal(e['basis'], SO.FUNNEL_CEILING);
    assert.match(String(e['estimate_hash']), /^[0-9a-f]{64}$/);
    const a = app.audit.entries().filter((x) => x.kind === 'SURVEY_JOB_OPENED');
    assert.equal(a.length, 1);
    assert.doesNotMatch(JSON.stringify(a[0]?.detail ?? {}), /255|0\.3/, 'no estimate figure in the log line');
    app.close();
  });

  test('the surveyor can now commit, and the commit releases the estimate', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'SURVEY');
    const r = SO.openSurveyJob(deps(app), actor('ADMIN'), c.claim, 'u-SURVEYING');
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(workspace(deps(app), actor('SURVEYING'), r.job_id).estimate_basis, null, 'nothing about the estimate before the commit');
    const out = commitFigures(deps(app), actor('SURVEYING'), r.job_id, {
      a_qualifying_plant: '195000', b_building: '700000', c_bare_land: '75000', qualifying_pct: '20',
      method_note: 'TEST: an apportionment from the documents.', rates: [],
    });
    assert.equal(out.ok, true, out.ok ? '' : out.why);
    assert.equal(app.db.get<{ state: string }>('SELECT state FROM surveyor_jobs WHERE id = ?', [r.job_id])?.state, 'COMMITTED_AND_RELEASED');
    const w = workspace(deps(app), actor('SURVEYING'), r.job_id);
    assert.equal(w.payload.estimate?.qualifying_expenditure_pence, 255_000_00, 'released to the surveyor after the commit');
    assert.equal(w.estimate_basis, SO.FUNNEL_CEILING);
    app.close();
  });

  test('refused, in plain words: not at Survey, not a surveyor, a job already open, no figure shown', async () => {
    const app = await testApp(); staff(app);
    const early = claimAt(app, 'DATA_GATHERING');
    const r1 = SO.openSurveyJob(deps(app), actor('SALES'), early.claim, 'u-SURVEYING');
    assert.equal(r1.ok, false);
    if (!r1.ok) assert.match(r1.why, /opened at the Survey stage/);

    const c = claimAt(app, 'SURVEY');
    const r2 = SO.openSurveyJob(deps(app), actor('SALES'), c.claim, 'u-ACCOUNTING');
    assert.equal(r2.ok, false);
    if (!r2.ok) { assert.match(r2.why, /Choose a surveyor/); assert.equal(r2.field, 'surveyor_id'); }
    const r2b = SO.openSurveyJob(deps(app), actor('SALES'), c.claim, null);
    assert.equal(r2b.ok, false);

    assert.ok(SO.openSurveyJob(deps(app), actor('SALES'), c.claim, 'u-SURVEYING').ok);
    const r3 = SO.openSurveyJob(deps(app), actor('SALES'), c.claim, 'u-SURVEYING');
    assert.equal(r3.ok, false);
    if (!r3.ok) assert.match(r3.why, /already open on this claim/);
    assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM surveyor_jobs WHERE claim_id = ?', [c.claim])?.n, 1);

    const blank = claimAt(app, 'SURVEY', null);
    const r4 = SO.openSurveyJob(deps(app), actor('SALES'), blank.claim, 'u-SURVEYING');
    assert.equal(r4.ok, false);
    if (!r4.ok) assert.match(r4.why, /no figure to lock/);
    assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM estimates WHERE assessment_id = ?', [blank.assessment])?.n, 0);
    app.close();
  });

  test('only Admin and Sales may open one', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'SURVEY');
    for (const role of ['SURVEYING', 'ACCOUNTING'] as const) {
      assert.throws(() => SO.openSurveyJob(deps(app), actor(role), c.claim, 'u-SURVEYING'), role);
    }
    assert.equal(SO.surveyJobPanel(app.db, actor('SURVEYING'), c.claim)?.may_open ?? false, false);
    assert.equal(SO.surveyJobPanel(app.db, actor('SALES'), c.claim)?.may_open, true);
    app.close();
  });

  test('an estimate already sealed for the assessment is kept as it was, never re-sealed', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'SURVEY');
    app.db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,' +
      'pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ['e-old', c.assessment, c.business, 1, 0.1, 1, 0, 0, 0.25, 0, T0, 'a'.repeat(64)]);
    assert.ok(SO.openSurveyJob(deps(app), actor('SALES'), c.claim, 'u-SURVEYING').ok);
    const e = app.db.get<{ id: string; estimate_hash: string; basis: string | null }>('SELECT id, estimate_hash, basis FROM estimates WHERE assessment_id = ?', [c.assessment])!;
    assert.deepEqual(e, { id: 'e-old', estimate_hash: 'a'.repeat(64), basis: null });
    app.close();
  });
});

/** The real server, three staff logins with one password, and a sign-in. */
async function web() {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-158b-web-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const hash = await made.app.hasher.hash('Invented-Pass-158b');
  for (const role of ['ADMIN', 'SALES', 'SURVEYING'] as const) {
    made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role[0]}${role.slice(1).toLowerCase()} Person`, role, hash, T0, T0]);
  }
  const as = async (email: string) => {
    let cookie = '';
    const req = async (path: string, init: RequestInit = {}) => {
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
      for (const x of r.headers.getSetCookie()) { const f = x.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((y) => y && y.split('=')[0] !== k), f].join('; '); }
      return { status: r.status, body: await r.text(), location: r.headers.get('location') };
    };
    const c = { get: (p: string) => req(p), post: (p: string, f: Record<string, string>) => req(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() }) };
    assert.equal((await c.post('/login', { email, password: 'Invented-Pass-158b' })).status, 303, email);
    return c;
  };
  return { made, as };
}

describe('F31 — the claim page at Survey', () => {
  test('Sales sees "Open the survey job" with the surveyors, opens it, and the page then says whose it is - never a figure', async () => {
    const w = await web();
    try {
      const c = claimAt(w.made.app, 'SURVEY');
      const sales = await w.as('sales@example.invalid');
      const before = await sales.get(`/staff/claims/${c.claim}`);
      assert.equal(before.status, 200);
      assert.match(before.body, /action="\/staff\/claims\/[^"]+\/survey-job"/);
      assert.match(before.body, /<option value="u-SURVEYING">Surveying Person<\/option>/);
      const bad = await sales.post(`/staff/claims/${c.claim}/survey-job`, { surveyor_id: '' });
      assert.equal(bad.status, 400);
      assert.match(bad.body, /Choose a surveyor/);
      const ok = await sales.post(`/staff/claims/${c.claim}/survey-job`, { surveyor_id: 'u-SURVEYING' });
      assert.equal(ok.status, 303);
      assert.equal(ok.location, `/staff/claims/${c.claim}?done=survey-job#survey-job`);
      const after = await sales.get(`/staff/claims/${c.claim}?done=survey-job`);
      assert.match(after.body, /Waiting for the surveyor’s figures[\s\S]*Open with <strong>Surveying Person<\/strong>/);
      assert.doesNotMatch(after.body, /action="\/staff\/claims\/[^"]+\/survey-job"/, 'one job per claim');
      // The surveyor's list now carries it.
      const surveyor = await w.as('surveying@example.invalid');
      assert.match((await surveyor.get('/staff/survey')).body, new RegExp(`Practice ${n} \\(TEST\\)`));
    } finally { w.made.close(); }
  });

  test('before Survey there is no form, and the route refuses', async () => {
    const w = await web();
    try {
      const c = claimAt(w.made.app, 'DATA_GATHERING');
      const sales = await w.as('sales@example.invalid');
      assert.doesNotMatch((await sales.get(`/staff/claims/${c.claim}`)).body, /survey-job/);
      const r = await sales.post(`/staff/claims/${c.claim}/survey-job`, { surveyor_id: 'u-SURVEYING' });
      assert.equal(r.status, 400);
      assert.match(r.body, /opened at the Survey stage/);
    } finally { w.made.close(); }
  });
});

/* ================================================================== *
 * F22 — the letter names the client as they are, and the property, the date and the figure they saw
 * ================================================================== */
import { loadLetter, TEST_LETTER_PATH } from '../src/web/letter.ts';
import { letterFacts, shownLetter, signingMissing, ENGAGEMENT_SIGNING_TEST } from '../src/web/signing.ts';

const line = (l: ReturnType<typeof loadLetter>, start: string): string => l.paragraphs.find((p) => p.text.startsWith(start))?.text ?? '';

describe('F22 — the letter says who the client is, and what it is about', () => {
  test('a partnership is described as one, with no company number anywhere; the specimen number is gone', () => {
    const l = loadLetter({ clientName: 'Friary House Surgery', claimantType: 'PARTNERSHIP' });
    assert.equal(line(l, 'Client:'), 'Client: Friary House Surgery, a partnership (“you”, “the Client”)');
    const all = l.paragraphs.map((p) => p.text).join('\n');
    assert.doesNotMatch(all, /98604417/);
    assert.match(all, /^Friary House Surgery$/m, 'the signature block names the partnership with no company number');
    assert.ok(!l.specimens.some((s) => s.includes('company number')));
  });

  test('a sole trader and an individual likewise; a company keeps its number; an LLP is called one', () => {
    assert.match(line(loadLetter({ clientName: 'A Smith', claimantType: 'SOLE_TRADER' }), 'Client:'), /^Client: A Smith, a sole trader \(/);
    assert.match(line(loadLetter({ clientName: 'A Smith', claimantType: 'INDIVIDUAL' }), 'Client:'), /^Client: A Smith, an individual \(/);
    assert.match(line(loadLetter({ clientName: 'B Ltd', claimantType: 'COMPANY', companyNumber: '12345678' }), 'Client:'),
      /a company registered in England and Wales under company number 12345678/);
    const llp = loadLetter({ clientName: 'C LLP', claimantType: 'LLP', companyNumber: 'OC123456' });
    assert.match(line(llp, 'Client:'), /a limited liability partnership registered in England and Wales under number OC123456/);
    assert.match(llp.paragraphs.map((p) => p.text).join('\n'), /^C LLP \(Registered No\. OC123456\)$/m);
    // A company with no number on record: the specimen stays, and is flagged, as before.
    assert.ok(loadLetter({ clientName: 'D Ltd', claimantType: 'COMPANY' }).specimens.some((s) => s.includes('98604417')));
  });

  test('the property, the date and the figure the client was shown are filled in', () => {
    for (const path of [undefined, TEST_LETTER_PATH]) {
      const l = loadLetter({ ...(path === undefined ? {} : { path }), clientName: 'Friary House Surgery', claimantType: 'PARTNERSHIP',
        property: 'Friary House, 2A Beaumont Road, Plymouth, PL4 9BH', date: '7 Oct 2026', range: 'up to £255,000' });
      assert.equal(line(l, 'Subject property:'), 'Subject property: Friary House, 2A Beaumont Road, Plymouth, PL4 9BH');
      assert.equal(line(l, 'Date:'), 'Date: 7 Oct 2026');
      assert.match(l.paragraphs.map((p) => p.text).join('\n'), /The indicative range discussed with the Client is up to £255,000\./);
      assert.deepEqual(l.specimens, [], 'no specimen left');
    }
  });

  test('letterFacts reads them from the records: the type, every property, the date sent and the figure shown', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'ENGAGEMENT');
    app.db.run("UPDATE businesses SET claimant_type = 'PARTNERSHIP' WHERE id = ?", [c.business]);
    app.db.run("INSERT INTO engagements (id,business_id,letter_state,signed_at,created_at,sent_at,sent_by) VALUES (?,?,'SENT',NULL,?,?,?)",
      [randomUUID(), c.business, T0, '2026-10-07T17:39:54.553Z', 'u-SALES']);
    assert.deepEqual(letterFacts(app.db, c.business), { claimant_type: 'PARTNERSHIP', property: 'Main site', date: '7 Oct 2026', range: 'up to £255,000' });
    app.close();
  });

  test('signing refuses a letter that still names the specimen company number - the test copy too', () => {
    const party = { name: 'D Ltd', company_number: null };
    const test = shownLetter(party, TEST_LETTER_PATH, { claimant_type: 'COMPANY', property: 'Main site', date: '7 Oct 2026', range: 'up to £1' });
    assert.equal(test.party_unknown, true);
    assert.match(signingMissing(ENGAGEMENT_SIGNING_TEST, test).join(' '), /does not yet say which business/);
    const ok = shownLetter({ name: 'P', company_number: null }, TEST_LETTER_PATH, { claimant_type: 'PARTNERSHIP', property: 'Main site', date: '7 Oct 2026', range: 'up to £1' });
    assert.equal(ok.party_unknown, false);
    assert.deepEqual(signingMissing(ENGAGEMENT_SIGNING_TEST, ok), []);
  });
});

/* ================================================================== *
 * F28 — "bought" is the client's own answer until staff record otherwise; and letterFacts reads the entity answer
 * ================================================================== */
import { clientSaidBought } from '../src/web/claim-facts.ts';
import { mandatoryDocumentNeeds, MANDATORY_DOCUMENTS } from '../src/web/mandatory-documents.ts';

describe('F28 — the client said they bought it, and the claim reads that', () => {
  test('clientSaidBought: purchase is YES, a build or a fit-out is NO, nothing said is null', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'DATA_GATHERING');
    const prop = app.db.get<{ property_id: string }>('SELECT property_id FROM claims WHERE id = ?', [c.claim])!.property_id;
    assert.equal(clientSaidBought(app.db, prop), 'YES');
    app.db.run("UPDATE assessment_answers SET value = 'fit_out' WHERE assessment_id = ? AND question_id = 'Q2-1-trigger'", [c.assessment]);
    assert.equal(clientSaidBought(app.db, prop), 'NO');
    app.db.run("DELETE FROM assessment_answers WHERE assessment_id = ? AND question_id = 'Q2-1-trigger'", [c.assessment]);
    assert.equal(clientSaidBought(app.db, prop), null);
    app.close();
  });

  test('Data gathering asks for the contract and the CPSE replies on the client’s word, before anyone records the fact', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'DATA_GATHERING');
    const prop = app.db.get<{ property_id: string }>('SELECT property_id FROM claims WHERE id = ?', [c.claim])!.property_id;
    const needs = mandatoryDocumentNeeds(app.db, { id: c.claim, property_id: prop }, { ...MANDATORY_DOCUMENTS, enabled: true });
    for (const t of ['Sale or purchase contract', 'Pre-contract enquiry replies']) {
      const need = needs.find((x) => x.what.startsWith(t));
      assert.ok(need !== undefined, t);
      assert.match(need?.why ?? '', /has been received on this claim/, `${t} is asked for: ${need?.why ?? ''}`);
    }
    app.close();
  });

  test('letterFacts takes the claimant from the client’s entity answer when the organisation has none recorded', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'ENGAGEMENT');
    app.db.run('INSERT INTO assessment_answers (id,assessment_id,ord,question_id,question_text,state,value) VALUES (?,?,?,?,?,?,?)',
      [randomUUID(), c.assessment, 2, 'Q2-1-entity', 'entity', 'ANSWERED', 'partnership']);
    assert.equal(letterFacts(app.db, c.business).claimant_type, 'PARTNERSHIP');
    app.close();
  });
});
