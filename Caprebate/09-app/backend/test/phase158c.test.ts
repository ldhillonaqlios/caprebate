/**
 * PHASE 158c — 7 October 2026. The steps staff ticked for other people, found by Phase 158b's run of the invented
 * client from Survey to Closed (04-phase-work/sim-2026-10-06/Friary-House-simulation-findings.md, OneDrive: F34 to F42).
 *
 *   F34, F35  The Valuation gate read the staff tick VALUATION_SIGNED ("Valuation signed by the surveyor"), which the
 *             surveyor could not make and Sales could, while the survey pack had no approved version. The gate now
 *             reads the surveyor's own approval of the pack on a job on the claim, and the tick is retired.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp, actor } from './helpers.ts';
import type { App } from '../src/app.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as CF from './claim-fixtures.ts';

const T0 = '2026-10-07T09:00:00.000Z';
let n = 0;

function staff(app: App): void {
  for (const role of ['SURVEYING', 'SALES', 'ADMIN', 'ACCOUNTING'] as const) {
    app.db.run('INSERT OR IGNORE INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@158c.example.invalid`, `${role.toLowerCase()}@158c.example.invalid`, `${role[0]}${role.slice(1).toLowerCase()} Person`, role, 'x', T0, T0]);
  }
}

function claimAt(app: App, stage: string): { business: string; assessment: string; claim: string } {
  n += 1;
  const business = `b-158c-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, `Practice ${n} (TEST)`, 'gp', 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-158c-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-158c-${n}`;
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'gp', T0, 127_500_00, 255_000_00, T0]);
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'UNKNOWN', stage, owner_id: null, surveyor_id: null,
  });
  return { business, assessment, claim: made.id };
}

const gateNeed = (app: App, claim: string, starts: string) =>
  P.pipelinePanel(app.db, actor('SALES'), P.loadPipelineClaim(app.db, claim)).gate?.needs.find((x) => x.what.startsWith(starts));

describe('F34, F35 — the surveyor’s valuation is the surveyor’s approval of the pack, not a staff tick', () => {
  test('the Valuation gate needs an approved pack on a job on this claim', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'VALUATION');
    CF.noGrants(app, c.claim);
    const before = gateNeed(app, c.claim, 'The surveyor approved and signed the survey pack');
    assert.ok(before !== undefined, 'the need is on the gate');
    assert.equal(before?.met, false);
    assert.match(before?.why ?? '', /Only the surveyor’s approval counts/);
    // Another claim's approval does not open this one.
    const other = claimAt(app, 'VALUATION');
    CF.packApprovedOn(app, other.business, other.assessment, other.claim);
    assert.equal(gateNeed(app, c.claim, 'The surveyor approved')?.met, false);
    CF.packApprovedOn(app, c.business, c.assessment, c.claim);
    const after = gateNeed(app, c.claim, 'The surveyor approved');
    assert.equal(after?.met, true);
    assert.match(after?.why ?? '', /version 1 approved by Surveying Person/);
    app.close();
  });

  test('VALUATION_SIGNED is retired: nobody can tick it, and it is not on the gate', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'VALUATION');
    assert.ok(P.MILESTONES.VALUATION_SIGNED.retired !== undefined);
    for (const role of ['SALES', 'ADMIN'] as const) {
      assert.equal(P.recordMilestone(CF.recordDeps(app), actor(role), c.claim, 'VALUATION_SIGNED', null).ok, false, role);
    }
    assert.equal(gateNeed(app, c.claim, 'Valuation signed by the surveyor'), undefined);
    app.close();
  });
});

/* ================================================================== *
 * F38, F36 — the client report and the accountant's pack are the application's own report, never a typed fingerprint
 * ================================================================== */
import * as R from '../src/web/claim-record.ts';

const deliver = (app: App, claim: string, kind: string, action: string, extra: Record<string, string> = {}) =>
  R.recordDeliverable(CF.recordDeps(app), actor('SALES'), claim, { kind, action, ...extra });

describe('F38, F36 — reports issued from the survey report the surveyor approved', () => {
  test('the client report is refused until a version is released, then issued with that version’s own fingerprint', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'REPORTS');
    CF.signOffRow(app, c.business, c.assessment, c.claim, 195_000_00);
    assert.equal(deliver(app, c.claim, 'CLIENT_REPORT', 'DRAFT').ok, true);
    const typed = 'a'.repeat(64);
    const early = deliver(app, c.claim, 'CLIENT_REPORT', 'ISSUE', { issued_on: app.now().slice(0, 10), content_hash: typed });
    assert.equal(early.ok, false);
    if (!early.ok) assert.match(early.why, /from the survey report the surveyor approved/);
    // The surveyor approves a version stating £195,000; a sign-off of that figure is recorded after it: released.
    CF.packApprovedOn(app, c.business, c.assessment, c.claim, 'u-SURVEYING', 195_000_00);
    CF.signOffRow(app, c.business, c.assessment, c.claim, 195_000_00);
    const fp = app.db.get<{ fingerprint: string }>(
      'SELECT a.fingerprint FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id WHERE j.claim_id = ?', [c.claim])!.fingerprint;
    const ok = deliver(app, c.claim, 'CLIENT_REPORT', 'ISSUE', { issued_on: app.now().slice(0, 10), content_hash: typed });
    assert.equal(ok.ok, true, ok.ok ? '' : ok.why);
    const row = app.db.get<{ content_hash: string }>("SELECT content_hash FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' AND state = 'ISSUED'", [c.claim])!;
    assert.equal(row.content_hash, fp, 'the fingerprint is the approved version’s, not the one typed');
    // The accountant's pack likewise.
    assert.equal(deliver(app, c.claim, 'ACCOUNTANT_COMPUTATION_PACK', 'DRAFT').ok, true);
    assert.equal(deliver(app, c.claim, 'ACCOUNTANT_COMPUTATION_PACK', 'ISSUE', { issued_on: app.now().slice(0, 10) }).ok, true);
    assert.equal(app.db.get<{ content_hash: string }>("SELECT content_hash FROM claim_deliverables WHERE claim_id = ? AND kind = 'ACCOUNTANT_COMPUTATION_PACK' AND state = 'ISSUED'", [c.claim])?.content_hash, fp);
    app.close();
  });

  test('a version whose figure no sign-off matches is not released, so the report cannot be issued', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'REPORTS');
    CF.packApprovedOn(app, c.business, c.assessment, c.claim, 'u-SURVEYING', 195_000_00);
    CF.signOffRow(app, c.business, c.assessment, c.claim, 180_000_00);
    assert.equal(deliver(app, c.claim, 'CLIENT_REPORT', 'DRAFT').ok, true);
    assert.equal(deliver(app, c.claim, 'CLIENT_REPORT', 'ISSUE', { issued_on: app.now().slice(0, 10) }).ok, false);
    app.close();
  });

  test('the table says what is true of each: made here, receivable under its rule, or not storable yet', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'REPORTS');
    const lines = new Map(R.deliverablesPanel(app.db, actor('SALES'), c.claim).lines.map((l) => [l.kind, l.stored] as const));
    assert.match(lines.get('CLIENT_REPORT') ?? '', /Made here from the survey report the surveyor approved/);
    assert.match(lines.get('ACCOUNTANT_COMPUTATION_PACK') ?? '', /Made here from the survey report the surveyor approved/);
    assert.match(lines.get('DEFENCE_PACK') ?? '', /It cannot be stored yet/);
    assert.doesNotMatch(R.deliverablesPanel(app.db, actor('SALES'), c.claim).generation, /None can be stored yet/);
    app.close();
  });
});

describe('F38 — the issue form asks for no fingerprint where the application works it out', () => {
  test('no SHA-256 box for the client report or the accountant’s pack; the defence pack keeps its own', async () => {
    const { deliverablesBlock } = await import('../src/web/claim-record-pages.ts');
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'REPORTS');
    CF.signOffRow(app, c.business, c.assessment, c.claim, 195_000_00);
    for (const k of ['CLIENT_REPORT', 'DEFENCE_PACK']) assert.equal(deliver(app, c.claim, k, 'DRAFT').ok, true, k);
    const html = String(deliverablesBlock(c.claim, R.deliverablesPanel(app.db, actor('SALES'), c.claim)));
    const formOf = (k: string) => new RegExp(`name="kind" value="${k}"><input type="hidden" name="action" value="ISSUE">([\\s\\S]*?)</form>`).exec(html)?.[1] ?? '';
    assert.doesNotMatch(formOf('CLIENT_REPORT'), /content_hash/);
    assert.match(formOf('DEFENCE_PACK'), /name="content_hash"/);
    app.close();
  });
});

/* ================================================================== *
 * F39 — the client reads the report in the portal and accepts it there; the gate reads that, not a staff tick
 * ================================================================== */
import * as RA from '../src/web/report-accept.ts';

function clientLogin(app: App, business: string, id = `u-cl-${business}`): string {
  app.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,'CLIENT','x',?,?,?)",
    [id, `${id}@158c.example.invalid`, `${id}@158c.example.invalid`, 'Client Person', T0, T0, business]);
  return id;
}

/** A claim at REPORTS whose report is released and issued. */
function released(app: App): { business: string; assessment: string; claim: string; fingerprint: string } {
  const c = claimAt(app, 'REPORTS');
  CF.signOffRow(app, c.business, c.assessment, c.claim, 195_000_00);
  CF.issue(app, c.claim, 'CLIENT_REPORT');
  const fingerprint = R.releasedReportFingerprint(app.db, c.claim) ?? '';
  return { ...c, fingerprint };
}

describe('F39 — the client accepts the report in the portal', () => {
  test('a client login of the business accepts the released version, once; staff and other clients cannot', async () => {
    const app = await testApp(); staff(app);
    const c = released(app);
    const me = clientLogin(app, c.business);
    const deps = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
    assert.throws(() => RA.acceptReport(deps, actor('SALES'), c.business), 'staff accepted for the client');
    const stranger = claimAt(app, 'REPORTS');
    const them = clientLogin(app, stranger.business);
    assert.throws(() => RA.acceptReport(deps, actor('CLIENT', them, stranger.business), c.business), 'another client');
    const r = RA.acceptReport(deps, actor('CLIENT', me, c.business), c.business);
    assert.equal(r.ok, true, r.ok ? '' : r.why);
    const row = app.db.get<{ claim_id: string; fingerprint: string; user_id: string }>('SELECT claim_id, fingerprint, user_id FROM client_report_acceptances')!;
    assert.deepEqual(row, { claim_id: c.claim, fingerprint: c.fingerprint, user_id: me });
    const again = RA.acceptReport(deps, actor('CLIENT', me, c.business), c.business);
    assert.equal(again.ok, false);
    if (!again.ok) assert.match(again.why, /already accepted/);
    assert.throws(() => app.db.run('DELETE FROM client_report_acceptances'), /never/);
    app.close();
  });

  test('with no released version there is nothing to accept', async () => {
    const app = await testApp(); staff(app);
    const c = claimAt(app, 'REPORTS');
    const me = clientLogin(app, c.business);
    const r = RA.acceptReport({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID }, actor('CLIENT', me, c.business), c.business);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.why, /not ready yet/);
    app.close();
  });

  test('the Reports gate reads the client’s acceptance of the issued report; the staff tick is retired', async () => {
    const app = await testApp(); staff(app);
    const c = released(app);
    const me = clientLogin(app, c.business);
    assert.ok(P.MILESTONES.CLIENT_ACCEPTED_REPORT.retired !== undefined);
    assert.equal(P.recordMilestone(CF.recordDeps(app), actor('SALES'), c.claim, 'CLIENT_ACCEPTED_REPORT', null).ok, false);
    const need = () => gateNeed(app, c.claim, 'The client accepted the report');
    assert.equal(need()?.met, false);
    assert.match(need()?.why ?? '', /in their portal/);
    RA.acceptReport({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID }, actor('CLIENT', me, c.business), c.business);
    assert.equal(need()?.met, true);
    assert.match(need()?.why ?? '', /accepted by Client Person/);
    // The fee trigger's cautious reading reads the same acceptance.
    assert.equal(P.feeTriggerReached(app.db, P.loadPipelineClaim(app.db, c.claim), 'CLIENT_ACCEPTED_REPORT').met, true);
    app.close();
  });
});

describe('F39 — the portal’s accept box and its route', () => {
  test('the box offers "I accept this report", then says when this login accepted it', async () => {
    const { acceptBox } = await import('../src/web/report-pages.ts');
    const app = await testApp(); staff(app);
    const c = released(app);
    const me = clientLogin(app, c.business);
    const who = actor('CLIENT', me, c.business);
    const before = String(acceptBox(app, who, c.business));
    assert.match(before, /<form method="post" action="\/portal\/report\/accept"/);
    assert.match(before, /I accept this report/);
    assert.doesNotMatch(before, /<script/);
    RA.acceptReport({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID }, who, c.business);
    assert.match(String(acceptBox(app, who, c.business)), /You accepted this report on /);
    app.close();
  });

  test('POST /portal/report/accept as the client records it; a second press is refused in plain words', async () => {
    const { createApp } = await import('../src/server.ts');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-158c-')), publicOrigin: 'https://caprebate.example.invalid' });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    try {
      const a = made.server.address();
      const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
      staff(made.app);
      const c = released(made.app);
      const hash = await made.app.hasher.hash('Invented-Pass-158c');
      made.app.db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-cl-web','cl@158c.example.invalid','cl@158c.example.invalid','Client Person','CLIENT',?,?,?,?)",
        [hash, T0, T0, c.business]);
      let cookie = '';
      const req = async (path: string, init: RequestInit = {}) => {
        const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
        for (const x of r.headers.getSetCookie()) { const f = x.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((y) => y && y.split('=')[0] !== k), f].join('; '); }
        return { status: r.status, body: await r.text(), location: r.headers.get('location') };
      };
      const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
      assert.equal((await post('/login', { email: 'cl@158c.example.invalid', password: 'Invented-Pass-158c' })).status, 303);
      const ok = await post('/portal/report/accept', {});
      assert.equal(ok.status, 303);
      assert.equal(ok.location, '/portal/report?done=accepted');
      assert.equal(made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_report_acceptances WHERE user_id = 'u-cl-web'")?.n, 1);
      const again = await post('/portal/report/accept', {});
      assert.equal(again.status, 400);
      assert.match(again.body, /already accepted this version/);
    } finally { made.close(); }
  });
});

describe('F39 — what the portal says the team is working on, once the report is out', () => {
  test('ready → accepted; before release, the step’s own words', async () => {
    const { workingWords } = await import('../src/web/portal-dashboard.ts');
    const app = await testApp(); staff(app);
    const early = claimAt(app, 'REPORTS');
    const e = clientLogin(app, early.business);
    assert.equal(workingWords(app.db, actor('CLIENT', e, early.business), early.business, 'A chartered surveyor is valuing the property.'), 'A chartered surveyor is valuing the property.');
    const c = released(app);
    const me = actor('CLIENT', clientLogin(app, c.business), c.business);
    assert.match(workingWords(app.db, me, c.business, 'A chartered surveyor is valuing the property.'), /Your survey report is ready/);
    RA.acceptReport({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID }, me, c.business);
    assert.match(workingWords(app.db, me, c.business, null), /You accepted your survey report/);
    app.close();
  });
});
