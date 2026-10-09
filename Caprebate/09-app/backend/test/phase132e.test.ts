/**
 * PHASE 132e — THE BACK END'S HALF OF ACTING ON THE ANSWERS.   16 September 2026
 *
 * One file for the lines that are not a change to an existing suite's subject:
 * the view-only login over HTTP (line 9), customer due diligence for every client
 * (line 11), the client's own filing confirmation (line 7), the percentage
 * referral model (line 10) and the letter's commercial terms (line 2). The rule
 * table's own exhaustive view-only tests are in test/authz.test.ts; the client's
 * cancellation is in test/portal-booking.test.ts.
 *
 * THE CLOCK IS PASSED, NOT READ, everywhere in this file: the seed carries fixed
 * dates, so every app here is built on `fixedClock()`.
 */
/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { isAppRole } from '../src/roles.ts';
import { can, type Actor } from '../src/authz.ts';
import { createStaffUser } from '../src/web/settings.ts';
import { actor, fixedClock, testApp } from './helpers.ts';
import { APP_ROLES } from '../src/roles.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as F from '../src/web/claim-facts.ts';
import * as T from '../src/web/tasks.ts';
import * as CFL from '../src/web/client-filing.ts';
import * as CF from './claim-fixtures.ts';
import * as I from '../src/web/introducers.ts';
import * as INV from '../src/web/invoices.ts';
import * as R from '../src/web/claim-record.ts';
import { loadLetter, unresolvedTerms } from '../src/web/letter.ts';
import * as FC from '../src/web/fee-controls.ts';
import * as FD from '../src/web/fee-discounts.ts';
import { feeRate } from '../src/web/engine.ts';
import * as AC from '../src/web/accountant-confirm.ts';

type Res = { status: number; body: string; location: string | null };
type Client = { get(path: string): Promise<Res>; post(path: string, fields: Record<string, string>): Promise<Res> };
type Made = Awaited<ReturnType<typeof createApp>>;

async function boot(): Promise<{ made: Made; password: string; signIn(email: string): Promise<Client>; close(): void }> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-132e-')), now: fixedClock() });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(made.server.address() as { port: number }).port}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const client = (cookie: string): Client => {
    const raw = async (path: string, init: RequestInit): Promise<Res> => {
      const x = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> | undefined), cookie } });
      return { status: x.status, body: await x.text(), location: x.headers.get('location') };
    };
    return {
      get: (path) => raw(path, {}),
      post: (path, fields) => raw(path, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString(),
      }),
    };
  };
  return {
    made, password: s.password, close: () => made.close(),
    async signIn(email) {
      const r = await fetch(`${base}/login`, {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email, password: s.password }).toString(),
      });
      assert.equal(r.status, 303, `${email} could not sign in`);
      return Object.assign(client(r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ')), { landed: r.headers.get('location') });
    },
  };
}

function adminOf(made: Made): Actor {
  const u = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
  assert.ok(u);
  return { id: u.id, role: 'ADMIN', business_id: null, disabled: false };
}

/* ================================================================== *
 * LINE 9 — THE VIEW-ONLY LOGIN, OVER HTTP
 * ================================================================== */

describe('line 9 — a view-only login: assigned to nobody, it reads and writes nothing', () => {
  test('NOBODY HOLDS IT: the role exists and is assignable, and the seed gives it to no one', async () => {
    const h = await boot();
    try {
      assert.equal(isAppRole('READ_ONLY'), true);
      assert.equal(h.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM roles WHERE role = 'READ_ONLY'")?.n, 1);
      assert.equal(h.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'READ_ONLY'")?.n, 0);
      assert.throws(() => h.made.app.db.run("INSERT INTO roles (role, description) VALUES ('MANAGER', 'x')"), /roles are fixed/);
    } finally { h.close(); }
  });

  test('AN ADMIN CREATES ONE; IT LANDS IN THE BACK OFFICE, READS, AND IS REFUSED EVERY WRITE AND EVERY SEALED ROUTE', async () => {
    const h = await boot();
    try {
      const d = { db: h.made.app.db, audit: h.made.app.audit, now: h.made.app.now, hash: (p: string) => h.made.app.hasher.hash(p) };
      await createStaffUser(d, adminOf(h.made), { email: 'viewer@example.invalid', display_name: 'A Viewer', role: 'READ_ONLY', password: h.password });
      const ro = await h.signIn('viewer@example.invalid') as Client & { landed: string | null };
      assert.equal(ro.landed, '/staff');

      const claim = h.made.app.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM claims LIMIT 1');
      assert.ok(claim);
      for (const path of ['/staff', '/staff/calendar', `/staff/claims/${claim.id}`, `/staff/organisations/${claim.business_id}/view.json`, '/staff/pipeline']) {
        const r = await ro.get(path);
        assert.equal(r.status, 200, `READ_ONLY could not read ${path}`);
      }
      const cal = await ro.get('/staff/calendar');
      assert.equal(/give it a time/.test(cal.body) && /type="submit">Save/.test(cal.body), false);

      for (const path of ['/staff/audit', '/staff/claims/export.csv', '/staff/finance/view.json', '/staff/compliance/view.json']) {
        assert.equal((await ro.get(path)).status, 403, `READ_ONLY was not refused ${path}`);
      }
      const stage = h.made.app.db.get<{ stage: string }>('SELECT stage FROM claims WHERE id = ?', [claim.id])?.stage;
      const writes: [string, Record<string, string>][] = [
        [`/staff/claims/${claim.id}/team`, { contact_id: 'x' }],
        ['/staff/settings/users', { email: 'x@example.invalid', display_name: 'X Person', role: 'ADMIN', password: 'a-long-password-here' }],
      ];
      for (const [path, fields] of writes) {
        const r = await ro.post(path, fields);
        assert.ok(r.status === 403 || r.status === 404, `READ_ONLY write ${path} answered ${r.status}`);
      }
      assert.equal(h.made.app.db.get<{ stage: string }>('SELECT stage FROM claims WHERE id = ?', [claim.id])?.stage, stage);
      assert.equal(h.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE email_canonical = 'x@example.invalid'")?.n, 0);

      const viewer = h.made.app.db.get<{ id: string }>("SELECT id FROM users WHERE role = 'READ_ONLY'");
      assert.ok(viewer);
      const a: Actor = { id: viewer.id, role: 'READ_ONLY', business_id: null, disabled: false };
      assert.equal(can(a, 'claim.read_value', { type: 'claim', id: claim.id, business_id: claim.business_id, assigned_surveyor_ids: [] }), false);
      void randomUUID;
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * LINE 7 — A CLIENT WITH NO ACCOUNTANT CONFIRMS THEIR OWN FILING
 * ================================================================== */

type TApp = Awaited<ReturnType<typeof testApp>>;
const T0 = '2026-09-08T00:00:00.000Z';
const TODAY = '2026-09-16T12:00:00.000Z';
let orgN = 0;

async function reportsClaim(): Promise<{ app: TApp; business: string; claim: string; deadline: string }> {
  const app = await testApp();
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
  orgN += 1;
  const business = `b-132e-${orgN}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, `Filing ${orgN} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-132e-${orgN}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-132e-${orgN}`;
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'dental', T0, 100_000_00, 200_000_00, T0]);
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'PLANT_AND_MACHINERY',
    stage: 'REPORTS', owner_id: null, surveyor_id: null,
  });
  P.recordOpened(CF.recordDeps(app), null, made.id, 'REPORTS', 'a test fixture');
  T.insertTask(app.db, app.now, randomUUID, {
    title: 'the next action', description: null, owner_id: 'u-SALES', owner_role: null, due_on: '2026-12-31', priority: null,
    activity_type: 'TASK', business_id: business, property_id: null, claim_id: made.id, lead_id: null, contact_id: null,
    fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF', automation_run_id: null, created_by: 'u-SALES',
  });
  CF.readyForReports(app, business, property, assessment, made.id);
  const w = F.amendmentWindowReading(app.db, { id: made.id, business_id: business, property_id: property }, TODAY);
  assert.equal(w.state, 'OPEN');
  assert.ok(w.deadline !== null);
  return { app, business, claim: made.id, deadline: w.deadline };
}

const CLIENT_NEED = /the client’s own confirmation, not an accountant’s/;
// PHASE 158d (F46): the accountant's route reads their own answer through their link now, not the retired staff tick.
const ACCOUNTANT_NEED = AC.RETURN_FIT_NEED;

function gate(app: TApp, claim: string, today = TODAY): P.GateReading {
  return P.gateOut(app.db, P.loadPipelineClaim(app.db, claim), 'REPORTS', { today });
}
function clientNeed(app: TApp, claim: string, today = TODAY): P.Need | undefined {
  return gate(app, claim, today).needs.find((n) => CLIENT_NEED.test(n.what));
}
function confirmByClient(app: TApp, claim: string, fields: Record<string, string | null>): { ok: boolean } {
  return CFL.recordClientFilingConfirmation(CF.recordDeps(app) as never, actor('SALES'), claim, { written_evidence: 'signed form dated 16 September 2026', ...fields });
}

describe('line 7 — where the client has no accountant, the client’s own written confirmation stands at REPORTS', () => {
  test('THE WORDS: three things, the last-day sentence marked as awaiting the tax adviser’s wording', () => {
    assert.equal(CFL.CLIENT_FILING_WORDS.last_day_acknowledged.awaiting !== null, true);
    assert.match(CFL.CLIENT_FILING_WORDS.last_day_acknowledged.awaiting ?? '', /tax adviser/);
    assert.equal(CFL.CLIENT_FILING_WORDS.will_file_amendment.awaiting, null);
    assert.equal(CFL.CLIENT_FILING_WORDS.remains_responsible.awaiting, null);
  });

  test('NO CONFIRMATION: the gate is exactly as before — the accountant confirms', async () => {
    const { app, claim } = await reportsClaim();
    try {
      const g = gate(app, claim);
      assert.ok(g.needs.some((n) => n.what === ACCOUNTANT_NEED && !n.met));
      assert.equal(clientNeed(app, claim), undefined);
      assert.equal(g.open, false);
    } finally { app.close(); }
  });

  test('ALL THREE A YES, NO ACCOUNTANT, THE DATE AS WE STATE IT: the client route’s need is met, the accountant’s is not asked, and the claim moves', async () => {
    const { app, claim, deadline } = await reportsClaim();
    try {
      CF.clientAccepted(app, claim); // PHASE 158c (F39): the client accepts in their portal, not a staff tick
      assert.equal(confirmByClient(app, claim, { no_accountant_or_adviser: 'YES', will_file_amendment: 'YES', last_day_acknowledged: 'YES', last_day_stated: deadline, remains_responsible: 'YES' }).ok, true);
      const g = gate(app, claim);
      assert.equal(clientNeed(app, claim)?.met, true, JSON.stringify(g.needs));
      assert.equal(g.needs.some((n) => n.what === ACCOUNTANT_NEED), false, 'the accountant’s confirmation was still asked');
      assert.equal(g.open, true, JSON.stringify(g.needs.filter((n) => !n.met)));
      // NEVER RECORDED AS AN ACCOUNTANT'S: no milestone row, and the party is the client.
      assert.equal(app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claim_milestones WHERE claim_id = ? AND milestone = 'ACCOUNTANT_CONFIRMED_RETURN'", [claim])?.n ?? 0, 0);
      assert.equal(app.db.get<{ p: string }>('SELECT confirmed_by_party AS p FROM client_filing_confirmations WHERE claim_id = ?', [claim])?.p, 'CLIENT');
    } finally { app.close(); }
  });

  for (const field of ['will_file_amendment', 'last_day_acknowledged', 'remains_responsible'] as const) {
    for (const bad of ['NO', 'UNSURE', null] as const) {
      test(`N4: ${field} ${bad === null ? 'ABSENT' : bad} leaves the gate shut, identically`, async () => {
        const { app, claim, deadline } = await reportsClaim();
        try {
          const fields: Record<string, string | null> = { no_accountant_or_adviser: 'YES', will_file_amendment: 'YES', last_day_acknowledged: 'YES', last_day_stated: deadline, remains_responsible: 'YES' };
          fields[field] = bad;
          assert.equal(confirmByClient(app, claim, fields).ok, true);
          const n = clientNeed(app, claim);
          assert.equal(n?.met, false, `${field} = ${String(bad)} passed`);
          assert.match(n?.why ?? '', /not confirmed as a yes/);
          assert.equal(gate(app, claim).open, false);
        } finally { app.close(); }
      });
    }
  }

  test('THE LAST DAY: absent, not the window we state, or a window not known — shut', async () => {
    const { app, claim, deadline } = await reportsClaim();
    try {
      const base = { no_accountant_or_adviser: 'YES', will_file_amendment: 'YES', last_day_acknowledged: 'YES', remains_responsible: 'YES' };
      assert.equal(confirmByClient(app, claim, { ...base, last_day_stated: null }).ok, true);
      assert.equal(clientNeed(app, claim)?.met, false);
      assert.equal(confirmByClient(app, claim, { ...base, last_day_stated: '2027-01-01' }).ok, true);
      assert.match(clientNeed(app, claim)?.why ?? '', /but the window we state now ends/);
      assert.equal(confirmByClient(app, claim, { ...base, last_day_stated: deadline }).ok, true);
      assert.equal(clientNeed(app, claim)?.met, true);
      app.db.run("UPDATE properties SET acquisition_date = NULL WHERE business_id = (SELECT business_id FROM claims WHERE id = ?)", [claim]);
      assert.equal(clientNeed(app, claim)?.met, false, 'a window not known passed');
    } finally { app.close(); }
  });

  test('A CLIENT WITH AN ACCOUNTANT STILL GOES THE ACCOUNTANT’S WAY — however the client answered', async () => {
    const { app, business, claim, deadline } = await reportsClaim();
    try {
      assert.equal(confirmByClient(app, claim, { no_accountant_or_adviser: 'YES', will_file_amendment: 'YES', last_day_acknowledged: 'YES', last_day_stated: deadline, remains_responsible: 'YES' }).ok, true);
      assert.equal(clientNeed(app, claim)?.met, true);
      app.db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, contact_type, created_at) VALUES (?, ?, 'An Accountant', 1, 0, 'ACCOUNTANT', ?)", [randomUUID(), business, T0]);
      const g = gate(app, claim);
      assert.equal(clientNeed(app, claim), undefined, 'the client route was taken with an accountant on record');
      assert.ok(g.needs.some((n) => n.what === ACCOUNTANT_NEED && !n.met));
    } finally { app.close(); }
  });

  test('N4 ON THE ROUTE: "no accountant" answered NO, NOT SURE or not at all keeps the accountant route, identically', async () => {
    for (const noAdviser of ['NO', 'UNSURE', null]) {
      const { app, claim, deadline } = await reportsClaim();
      try {
        assert.equal(confirmByClient(app, claim, { no_accountant_or_adviser: noAdviser, will_file_amendment: 'YES', last_day_acknowledged: 'YES', last_day_stated: deadline, remains_responsible: 'YES' }).ok, true);
        assert.equal(clientNeed(app, claim), undefined, `no_accountant_or_adviser ${String(noAdviser)} took the client route`);
        assert.ok(gate(app, claim).needs.some((n) => n.what === ACCOUNTANT_NEED));
      } finally { app.close(); }
    }
  });

  test('THE RECORD: append-only, the party can only be the client, a bad answer refused, and the audit line holds no text', async () => {
    const { app, claim, deadline } = await reportsClaim();
    try {
      assert.equal(confirmByClient(app, claim, { no_accountant_or_adviser: 'MAYBE' }).ok, false);
      assert.equal(confirmByClient(app, claim, { no_accountant_or_adviser: 'YES', last_day_stated: '16/09/2027' }).ok, false);
      assert.equal(CFL.recordClientFilingConfirmation(CF.recordDeps(app) as never, actor('SALES'), claim, { no_accountant_or_adviser: 'YES' }).ok, false, 'no written evidence was accepted');
      assert.equal(confirmByClient(app, claim, { no_accountant_or_adviser: 'YES', last_day_stated: deadline }).ok, true);
      const id = app.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM client_filing_confirmations WHERE claim_id = ?', [claim]);
      assert.ok(id);
      assert.throws(() => app.db.run("UPDATE client_filing_confirmations SET will_file_amendment = 'YES' WHERE id = ?", [id.id]), /kept as recorded/);
      assert.throws(() => app.db.run('DELETE FROM client_filing_confirmations WHERE id = ?', [id.id]), /kept as recorded/);
      assert.throws(() => app.db.run("INSERT INTO client_filing_confirmations (id, claim_id, business_id, confirmed_by_party, written_evidence, recorded_by, recorded_at) VALUES ('x', ?, ?, 'ACCOUNTANT', 'an email', 'u-SALES', ?)", [claim, id.business_id, T0]), /CHECK constraint/);
      const line = app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'CLIENT_FILING_CONFIRMED' ORDER BY seq DESC LIMIT 1");
      assert.ok(line);
      assert.equal(line.detail.includes('signed form') || line.detail.includes(deadline), false);
    } finally { app.close(); }
  });

  test('WHO MAY RECORD IT: ADMIN and SALES; every other role is refused', async () => {
    const { app, business, claim } = await reportsClaim();
    try {
      const obj = { type: 'claim' as const, id: claim, business_id: business, assigned_surveyor_ids: ['u-SURVEYING'] };
      for (const role of APP_ROLES) {
        assert.equal(can(actor(role, `u-${role}`, business), 'client_filing.record', obj), role === 'ADMIN' || role === 'SALES', role);
      }
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * LINE 10 — REWARD MODEL C: A PERCENTAGE OF OUR FEE ACTUALLY INVOICED
 * ================================================================== */

async function referredAtInvoice(firmType = 'ACCOUNTANT_FIRM', signed = true): Promise<{ app: TApp; business: string; claim: string; firm: string }> {
  const app = await testApp();
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
  orgN += 1;
  const business = `b-c-${orgN}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, `Referred ${orgN} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-c-${orgN}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-c-${orgN}`;
  app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'dental', T0, 100_00, 200_00, T0]);
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: business, property_id: property, assessment_id: assessment, workstream: 'UNKNOWN', stage: 'INVOICE', owner_id: null, surveyor_id: null,
  });
  P.recordOpened(CF.recordDeps(app), null, made.id, 'INVOICE', 'a test fixture');
  CF.signOffRow(app, business, assessment, made.id, 240_000_00);
  T.insertTask(app.db, app.now, randomUUID, {
    title: 'a fixture next action', description: null, owner_id: 'u-SALES', owner_role: null, due_on: '2026-12-31', priority: null,
    activity_type: 'TASK', business_id: business, property_id: null, claim_id: made.id, lead_id: null, contact_id: null, fact_id: null,
    recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF', automation_run_id: null, created_by: 'u-SALES',
  });
  CF.openWindow(app, business, property, made.id);
  CF.deliverForFiling(app, made.id);
  const f = I.createIntroducer(CF.recordDeps(app) as never, actor('ADMIN'), { firm_name: `Ledger ${orgN} LLP`, introducer_type: firmType });
  assert.ok(f.ok, f.ok ? '' : f.why);
  const firm = f.ok ? f.id : '';
  // Phase 157: a REGISTERED accountancy firm has signed our introducer terms (migration 094); test/phase157 proves an
  // unsigned one accrues nothing.
  if (signed) assert.ok(I.recordTermsSigned(CF.recordDeps(app) as never, actor('ADMIN'), firm, { signed_on: '2026-09-01', firm_signatory: 'An Invented Partner', our_signatory: 'An Invented Director' }).ok);
  app.db.run(
    "INSERT INTO leads (id, business_id, claim_id, origin, source, introducer_id, lead_date, status, converted_at, created_at, updated_at) VALUES (?, ?, ?, 'REFERRAL', ?, ?, '2026-09-08', 'CONVERTED', ?, ?, ?)",
    [randomUUID(), business, made.id, firmType === 'ACCOUNTANT_FIRM' ? 'ACCOUNTANT' : 'ADVISER', firm, T0, T0, T0]);
  return { app, business, claim: made.id, firm };
}

function invoiceDeps(app: TApp): INV.InvoiceDeps { return { db: app.db, audit: app.audit, now: app.now, newId: randomUUID }; }
function entries(app: TApp): { entry_kind: string; basis_pence: number; percent_bp: number; amount_pence: number }[] {
  return app.db.all<{ entry_kind: string; basis_pence: number; percent_bp: number; amount_pence: number }>(
    'SELECT entry_kind, basis_pence, percent_bp, amount_pence FROM introducer_percentage_entries ORDER BY created_at, rowid').map((r) => ({ ...r }));
}
function reduceUnderClause13(app: TApp, claim: string, invoice: string, amended: string): { ok: boolean } {
  const rd = CF.recordDeps(app);
  const opened = R.openEnquiry(rd, actor('SALES'), claim, { opened_on: '2026-09-01' });
  assert.equal(opened.ok, true);
  const outcome = Object.keys(R.ENQUIRY_OUTCOMES).find((k) => k !== 'NO_CHANGE') ?? '';
  assert.equal(R.closeEnquiry(rd, actor('SALES'), claim, opened.ok ? opened.id : '', { closed_on: '2026-09-05', outcome, amended_figure: amended }).ok, true);
  const real = loadLetter();
  const settled = { paragraphs: real.paragraphs, openTerms: real.openTerms.filter((t) => !/^clause 13 —/.test(t.clause)) };
  return INV.creditClause13(invoiceDeps(app), actor('ACCOUNTING'), invoice, {}, { clawback: { enabled: true }, letter: settled });
}

describe('line 10 — model C: 10% of our fee as invoiced, off, refused while clause 1 is blank, reversed under clause 13', () => {
  test('SHIPS OFF, AND IS REFUSED WHILE CLAUSE 1 IS BLANK EXACTLY AS A AND B ARE — audited, nothing changed', async () => {
    const { app } = await referredAtInvoice();
    try {
      assert.equal(I.rewardSetting(app.db).model, 'OFF');
      assert.ok(I.clauseOneBlanks().length > 0, 'the real letter’s clause 1 is no longer blank — this test’s premise moved');
      for (const model of ['A_RECIPROCITY', 'B_DISCLOSED_FEE', 'C_PERCENT_OF_INVOICED_FEE']) {
        const r = I.setRewardModel(CF.recordDeps(app) as never, actor('ADMIN'), { model, fee_pounds: '500' });
        assert.equal(r.ok, false, `${model} was switched on with clause 1 blank`);
        if (!r.ok) assert.match(r.why, /clause 1 of the engagement letter is blank/);
      }
      assert.equal(I.rewardSetting(app.db).model, 'OFF');
      assert.equal(app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'INTRODUCER_REWARD_SWITCHED' AND outcome = 'REFUSED'")?.n, 3);
      assert.equal(I.REFERRAL_PERCENTAGE.percent_bp, 1000);
      assert.ok(I.setRewardModel(CF.recordDeps(app) as never, actor('ADMIN'), { model: 'C_PERCENT_OF_INVOICED_FEE' }, { openTerms: [] }).ok);
      assert.equal(I.rewardSetting(app.db).percent_bp, 1000, 'model C did not take the decided 10%');
      assert.equal(can(actor('SALES'), 'introducer_reward.switch', { type: 'introducer_reward', id: 'the-setting' }), false);
    } finally { app.close(); }
  });

  test('OFF (as shipped): raising our fee on a referred claim accrues nothing', async () => {
    const { app, claim } = await referredAtInvoice();
    try {
      const r = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), claim, { kind: 'FEE' });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      assert.deepEqual(entries(app), []);
    } finally { app.close(); }
  });

  test('ON: 10% OF THE FEE AS INVOICED — read off the invoice row, not a quote — and only for a registered accountancy firm', async () => {
    const { app, claim } = await referredAtInvoice();
    try {
      assert.ok(I.setRewardModel(CF.recordDeps(app) as never, actor('ADMIN'), { model: 'C_PERCENT_OF_INVOICED_FEE' }, { openTerms: [] }).ok);
      const r = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), claim, { kind: 'FEE' });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const fee = app.db.get<{ fee_pence: number }>('SELECT fee_pence FROM invoices WHERE id = ?', [r.ok ? r.id : ''])?.fee_pence ?? 0;
      assert.ok(fee > 0);
      assert.deepEqual(entries(app), [{ entry_kind: 'ACCRUAL', basis_pence: fee, percent_bp: 1000, amount_pence: Math.round(fee / 10) }]);
      // Not a second accrual on the same invoice, and the ledger is readable by ADMIN and ACCOUNTING only.
      I.onFeeInvoiced(CF.recordDeps(app) as never, actor('ACCOUNTING'), r.ok ? r.id : '');
      assert.equal(entries(app).length, 1);
      assert.equal(I.percentageLedger(app.db, actor('ADMIN')).length, 1);
      assert.equal(I.percentageLedger(app.db, actor('SALES')).length, 1);
      assert.equal(I.percentageLedger(app.db, actor('SURVEYING')).length, 0);
    } finally { app.close(); }
    const other = await referredAtInvoice('TAX_ADVISER');
    try {
      assert.ok(I.setRewardModel(CF.recordDeps(other.app) as never, actor('ADMIN'), { model: 'C_PERCENT_OF_INVOICED_FEE' }, { openTerms: [] }).ok);
      assert.equal(INV.raiseInvoice(invoiceDeps(other.app), actor('ACCOUNTING'), other.claim, { kind: 'FEE' }).ok, true);
      assert.deepEqual(entries(other.app), [], 'a firm that is not a registered accountancy firm accrued model C');
    } finally { other.app.close(); }
  });

  // PHASE 157 (the sweep): the draft introducer terms' clause 1 — registered means SIGNED, not merely marked an accountancy firm.
  test('PHASE 157: an accountancy firm that has not signed our introducer terms accrues nothing; once its signature is recorded, it does', async () => {
    const { app, claim, firm } = await referredAtInvoice('ACCOUNTANT_FIRM', false);
    try {
      assert.ok(I.setRewardModel(CF.recordDeps(app) as never, actor('ADMIN'), { model: 'C_PERCENT_OF_INVOICED_FEE' }, { openTerms: [] }).ok);
      assert.equal(I.termsSignature(app.db, firm), null);
      const first = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), claim, { kind: 'FEE' });
      assert.equal(first.ok, true, first.ok ? '' : first.why);
      assert.deepEqual(entries(app), [], 'an unsigned firm accrued model C');
      // Refused: no date, a future date, no names. Accounting may not record one.
      for (const bad of [{}, { signed_on: '2099-01-01', firm_signatory: 'A B', our_signatory: 'C D' }, { signed_on: '2026-09-01', firm_signatory: '', our_signatory: 'C D' }]) {
        assert.equal(I.recordTermsSigned(CF.recordDeps(app) as never, actor('ADMIN'), firm, bad).ok, false, JSON.stringify(bad));
      }
      assert.throws(() => I.recordTermsSigned(CF.recordDeps(app) as never, actor('ACCOUNTING'), firm, { signed_on: '2026-09-01', firm_signatory: 'A B', our_signatory: 'C D' }));
      const sig = I.recordTermsSigned(CF.recordDeps(app) as never, actor('SALES'), firm, { signed_on: '2026-09-01', firm_signatory: 'An Invented Partner', our_signatory: 'An Invented Director' });
      assert.ok(sig.ok);
      assert.equal(I.termsSignature(app.db, firm)?.version, I.INTRODUCER_TERMS.version);
      assert.throws(() => app.db.run('UPDATE introducer_terms_signatures SET signed_on = ?', ['2026-01-01']), /never edited/);
      assert.throws(() => app.db.run('DELETE FROM introducer_terms_signatures'), /never deleted/);
      const audit = app.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'INTRODUCER_TERMS_SIGNED'")!.detail;
      assert.ok(!audit.includes('Invented Partner'), 'a name reached the audit log');
      I.onFeeInvoiced(CF.recordDeps(app) as never, actor('ACCOUNTING'), first.ok ? first.id : '');
      assert.equal(entries(app).length, 1, 'the signed firm did not accrue');
      assert.equal(I.INTRODUCER_TERMS.agreed, false, 'the terms are still a draft');
    } finally { app.close(); }
  });

  test('CLAUSE 13: A REDUCED FEE WRITES A REVERSING ENTRY — the accrual is kept, never edited or deleted, and the net is 10% of the fee left', async () => {
    const { app, claim } = await referredAtInvoice();
    try {
      assert.ok(I.setRewardModel(CF.recordDeps(app) as never, actor('ADMIN'), { model: 'C_PERCENT_OF_INVOICED_FEE' }, { openTerms: [] }).ok);
      const r = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), claim, { kind: 'FEE' });
      assert.equal(r.ok, true);
      const invoice = r.ok ? r.id : '';
      const fee = app.db.get<{ fee_pence: number }>('SELECT fee_pence FROM invoices WHERE id = ?', [invoice])?.fee_pence ?? 0;
      // Switched off again before the reduction: the reversal still follows the accrual that exists.
      assert.ok(I.setRewardModel(CF.recordDeps(app) as never, actor('ADMIN'), { model: 'OFF' }).ok);
      const c13 = reduceUnderClause13(app, claim, invoice, '200000');
      assert.equal(c13.ok, true);
      const credited = app.db.get<{ amount_pence: number }>("SELECT amount_pence FROM invoice_credit_notes WHERE basis = 'CLAUSE_13_REDUCTION'")?.amount_pence ?? 0;
      assert.ok(credited > 0);
      const e = entries(app);
      assert.equal(e.length, 2);
      assert.deepEqual(e[0], { entry_kind: 'ACCRUAL', basis_pence: fee, percent_bp: 1000, amount_pence: Math.round(fee / 10) });
      assert.deepEqual(e[1], { entry_kind: 'REVERSAL', basis_pence: credited, percent_bp: 1000, amount_pence: -Math.round(credited / 10) });
      const net = e.reduce((t, x) => t + x.amount_pence, 0);
      assert.equal(net, Math.round(fee / 10) - Math.round(credited / 10));
      assert.throws(() => app.db.run('UPDATE introducer_percentage_entries SET amount_pence = 1'), /never an edit/);
      assert.throws(() => app.db.run('DELETE FROM introducer_percentage_entries'), /never a delete/);
      assert.ok(app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'INTRODUCER_PERCENTAGE_REVERSED'")?.n === 1);
    } finally { app.close(); }
  });

  test('A CREDIT IN FULL IS NOT A CLAUSE 13 REDUCTION, AND NO ACCRUAL MEANS NOTHING TO REVERSE', async () => {
    const { app, claim } = await referredAtInvoice();
    try {
      const r = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), claim, { kind: 'FEE' });
      assert.equal(r.ok, true);
      assert.equal(reduceUnderClause13(app, claim, r.ok ? r.id : '', '200000').ok, true);
      assert.deepEqual(entries(app), [], 'a reversal was written with no accrual');
    } finally { app.close(); }
  });

  test('THE DATABASE REFUSES AN ACCRUAL WHILE C IS OFF, AND A REVERSAL WITH NO ACCRUAL', async () => {
    const { app, business, claim, firm } = await referredAtInvoice();
    try {
      const r = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), claim, { kind: 'FEE' });
      assert.equal(r.ok, true);
      assert.throws(() => app.db.run(
        "INSERT INTO introducer_percentage_entries (id, introducer_id, claim_id, business_id, invoice_id, entry_kind, basis_pence, percent_bp, amount_pence, created_at) VALUES ('x', ?, ?, ?, ?, 'ACCRUAL', 100, 1000, 10, ?)",
        [firm, claim, business, r.ok ? r.id : '', T0]), /E_REWARD_OFF/);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * LINE 1 — THE FLAT 3% FEE: A DISCOUNT IS RECORDED, NEVER APPLIED
 * ================================================================== */

describe('line 1 — a multi-site discount entered on a claim is recorded, audited, shown as awaiting, and never applied', () => {
  test('THE FEE IS 3% AND A RECORDED 50% DISCOUNT DOES NOT MOVE IT', async () => {
    const { app, claim } = await referredAtInvoice();
    try {
      assert.equal(feeRate(), 0.03);
      const d = FD.recordFeeDiscount(CF.recordDeps(app) as never, actor('SALES'), claim, { discount_percent: '50', reason: 'three further sites for the same group' });
      assert.equal(d.ok, true, d.ok ? '' : d.why);
      const r = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), claim, { kind: 'FEE' });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      const inv = app.db.get<{ fee_pence: number; claim_value_pence: number; fee_rate: number; fee_basis: string }>('SELECT fee_pence, claim_value_pence, fee_rate, fee_basis FROM invoices WHERE id = ?', [r.ok ? r.id : '']);
      assert.ok(inv);
      assert.equal(inv.fee_pence, Math.round(inv.claim_value_pence * 0.03), 'a recorded discount was applied to the fee');
      assert.equal(inv.fee_rate, 0.03);
      assert.match(inv.fee_basis, /none — decided: there is no minimum fee/);
      assert.match(inv.fee_basis, /never taken off a fee by the system/);
      const views = FD.discountsFor(app.db, actor('ACCOUNTING'), claim);
      assert.equal(views.length, 1);
      assert.equal(views[0]?.state, 'AWAITING_CEILING_AND_APPROVER');
      assert.equal(views[0]?.applied, false);
      assert.match(views[0]?.says ?? '', /the largest discount and who approves it/);
      const line = app.db.get<{ detail: string; actor_role: string }>("SELECT detail, actor_role FROM audit_log WHERE kind = 'FEE_DISCOUNT_RECORDED'");
      assert.equal(line?.actor_role, 'SALES');
      assert.equal(line?.detail.includes('three further sites'), false, 'the reason reached the audit log');
      assert.throws(() => app.db.run('UPDATE fee_discounts SET discount_bp = 1'), /kept as recorded/);
      assert.throws(() => app.db.run('DELETE FROM fee_discounts'), /kept as recorded/);
    } finally { app.close(); }
  });

  test('REFUSED: no share, a share of nothing or over 100%, and no reason — nothing written; and only ADMIN and SALES may enter one, ADMIN, SALES and ACCOUNTING read', async () => {
    const { app, business, claim } = await referredAtInvoice();
    try {
      for (const input of [{ reason: 'x sites' }, { discount_percent: '0', reason: 'x sites' }, { discount_percent: '101', reason: 'x sites' }, { discount_percent: '10' }]) {
        assert.equal(FD.recordFeeDiscount(CF.recordDeps(app) as never, actor('ADMIN'), claim, input).ok, false, JSON.stringify(input));
      }
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM fee_discounts')?.n, 0);
      const obj = { type: 'claim' as const, id: claim, business_id: business, assigned_surveyor_ids: ['u-SURVEYING'] };
      for (const role of APP_ROLES) {
        assert.equal(can(actor(role, `u-${role}`, business), 'fee_discount.record', obj), role === 'ADMIN' || role === 'SALES', `${role} record`);
        assert.equal(can(actor(role, `u-${role}`, business), 'fee_discount.read', obj), role === 'ADMIN' || role === 'SALES' || role === 'ACCOUNTING', `${role} read`);
      }
      assert.deepEqual(FD.discountsFor(app.db, actor('SURVEYING'), claim), []);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * LINE 2 — THE LETTER'S COMMERCIAL TERMS, READ BY THE BACK END, EACH BOTH WAYS
 * ================================================================== */

function letterWith(replace: (t: string) => string): { paragraphs: { text: string; heading: boolean }[]; openTerms: ReturnType<typeof unresolvedTerms> } {
  const real = loadLetter();
  const paragraphs = real.paragraphs.map((p) => ({ ...p, text: replace(p.text) }));
  return { paragraphs, openTerms: unresolvedTerms(paragraphs) };
}

const ENQUIRY_SUPPORT = 'If HMRC opens an enquiry into the claim, we will support you on our valuation and apportionment free of charge, with no time limit and no limit on hours. This support does not extend to representation at a tax tribunal.';

describe('line 2 — the engagement letter’s commercial terms, as the back end reads them', () => {
  test('(i) CLAUSE 4’S FEE BASIS IS 3% OF THE ALLOWANCES IDENTIFIED — no longer an open term, and the same rate the engine charges; the old bracket reads as open', () => {
    const real = loadLetter();
    const clause4 = real.paragraphs.map((p) => p.text).join('\n');
    assert.match(clause4, /Our fee for the Services is 3% of the capital allowances identified/);
    assert.equal(/5% of the capital allowances/.test(clause4), false, 'a 5% survives in the letter');
    assert.equal(real.openTerms.some((t) => /fee basis/.test(t.text)), false);
    const stated = Number(/Our fee for the Services is (\d+(?:\.\d+)?)% of the capital allowances identified/.exec(clause4)?.[1]) / 100;
    assert.equal(stated, feeRate(), 'the letter and the engine state different rates');
    const old = letterWith((t) => t.replace('Our fee for the Services is 3% of the capital allowances identified,', 'Our fee for the Services is [fee basis e.g. 5% of the capital allowances identified, or a fixed fee of £[amount]],'));
    assert.equal(old.openTerms.some((t) => /fee basis/.test(t.text)), true, 'the other way: a bracketed basis is not read as open');
  });

  test('(ii) CLAUSE 4’S PAYMENT TERMS: 14 days of the date of the invoice → an invoice is due on its date + 14; blank → no due date, never assumed', async () => {
    assert.deepEqual({ ...FC.letterFees().payment_terms }, { state: 'DAYS', days: 14, label: 'within 14 days of the invoice, as clause 4 states' });
    const blank = letterWith((t) => t.replace('payable within 14 days of the date of the invoice.', 'payable [payment terms — e.g. on completion / within 14 days of invoice].'));
    assert.equal(FC.letterFees(blank).payment_terms.state, 'BLANK');
    const { app, claim } = await referredAtInvoice();
    try {
      const set = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), claim, { kind: 'FEE' });
      assert.equal(set.ok, true, set.ok ? '' : set.why);
      const row = app.db.get<{ invoice_date: string; due_on: string | null }>('SELECT invoice_date, due_on FROM invoices WHERE id = ?', [set.ok ? set.id : '']);
      assert.ok(row);
      assert.equal(row.due_on, T.addDaysToDate(row.invoice_date, 14));
    } finally { app.close(); }
    const other = await referredAtInvoice();
    try {
      const unset = INV.raiseInvoice(invoiceDeps(other.app), actor('ACCOUNTING'), other.claim, { kind: 'FEE' }, { letter: blank });
      assert.equal(unset.ok, true);
      assert.equal(other.app.db.get<{ due_on: string | null }>('SELECT due_on FROM invoices WHERE id = ?', [unset.ok ? unset.id : ''])?.due_on, null);
    } finally { other.app.close(); }
  });

  test('(iii) THE FEE TRIGGER: the letter says it is earned on delivery for filing, and does not say we file or sign — the gate and the expected-fee date read the delivery; unknown delivery has no date, not today', async () => {
    const text = loadLetter().paragraphs.map((p) => p.text).join('\n');
    assert.match(text, /Our fee is earned when we deliver our report for filing, whether to the Client or to the Client's accountant or tax adviser/);
    assert.equal(/we (will )?(submit|file|sign)/i.test(text.replace(/does not sign the filing position/, '')), false, 'the letter now says Caprebate submits, files or signs');
    assert.equal(P.FEE_TRIGGER.reading, 'REPORT_DELIVERED_FOR_FILING');

    const { app, claim } = await referredAtInvoice();
    try {
      // Delivered (the fixture issued the computation pack on 1 September 2026): an expected-fee date and its due date.
      const dash = INV.financeDashboard(app.db, actor('ACCOUNTING'), app.now());
      const mine = dash.expected.claims.find((c) => c.claim_id === claim);
      assert.equal(mine?.expected_on, '2026-09-01');
      assert.equal(mine?.due_if_invoiced_on_delivery, '2026-09-15');
      assert.ok((dash.months.find((m) => m.month === '2026-09')?.expected_pence ?? 0) > 0);

      // NOT delivered: a second claim at INVOICE with no report issued — no date, and certainly not today.
      const org = app.db.get<{ business_id: string; property_id: string; assessment_id: string }>('SELECT business_id, property_id, assessment_id FROM claims WHERE id = ?', [claim]);
      assert.ok(org);
      const made = C.insertClaim(app.db, app.now, randomUUID, {
        business_id: org.business_id, property_id: org.property_id, assessment_id: org.assessment_id, workstream: 'UNKNOWN', stage: 'INVOICE', owner_id: null, surveyor_id: null,
      });
      P.recordOpened(CF.recordDeps(app), null, made.id, 'INVOICE', 'a test fixture');
      CF.signOffRow(app, org.business_id, org.assessment_id, made.id, 100_000_00);
      const dash2 = INV.financeDashboard(app.db, actor('ACCOUNTING'), app.now());
      const undelivered = dash2.expected.claims.find((c) => c.claim_id === made.id);
      assert.ok(undelivered, 'the undelivered claim is not listed among fees expected');
      assert.equal(undelivered.expected_on, null, 'an unknown delivery was given a date');
      assert.notEqual(undelivered.expected_on, app.now().slice(0, 10));
      assert.equal(undelivered.due_if_invoiced_on_delivery, null);
      assert.match(undelivered.expected_on_reading, /^NO DATE/);
      const sept = (d: typeof dash2) => d.months.find((m) => m.month === '2026-09')?.expected_pence ?? 0;
      assert.equal(sept(dash2), sept(dash), 'an undelivered claim was counted in a month');
      assert.equal(P.feeTriggerReached(app.db, P.loadPipelineClaim(app.db, made.id)).met, false);
      const refused = INV.raiseInvoice(invoiceDeps(app), actor('ACCOUNTING'), made.id, { kind: 'FEE' });
      assert.equal(refused.ok, false, 'our fee was raised on a claim whose report is not delivered');
    } finally { app.close(); }
  });

  test('(iv) CLAUSE 13: refund decided (a) yes, time limit completed — and with the trigger and settlement still blank the clawback raises nothing, even switched on; complete, it applies', () => {
    const real = loadLetter();
    const blanks13 = real.openTerms.filter((t) => /^clause 13 —/.test(t.clause)).map((t) => t.text);
    assert.equal(blanks13.length, 2);
    assert.ok(blanks13.some((t) => /^\[Trigger:/.test(t)) && blanks13.some((t) => /^\[Settlements:/.test(t)));
    assert.equal(blanks13.some((t) => /Time limit/.test(t)), false, 'the time limit is still an open term');
    assert.match(real.paragraphs.map((p) => p.text).join('\n'), /Time limit: this clause applies for so long as the claim remains open to enquiry\./);
    assert.equal(R.FEE_CLAWBACK.decided.refund, 'YES');
    assert.equal(R.FEE_CLAWBACK.decided.time_limit, 'for so long as the claim remains open to enquiry');
    assert.equal(R.FEE_CLAWBACK.enabled, false, 'the clawback switch was turned on');
    const on = R.clawbackReading({ gate: { enabled: true } });
    assert.equal(on.applies, false);
    assert.equal(on.reason, 'CLAUSE_13_BLANK');
    assert.equal(on.blanks.length, 2);
    assert.equal(R.clawbackReading().reason, 'SWITCH_OFF');
    assert.equal(R.clawbackReading({ gate: { enabled: true }, openTerms: [] }).applies, true, 'the other way: complete and on, it applies');
  });

  test('(v) THE FREE ENQUIRY SUPPORT SENTENCE IS IN THE LETTER IN EXACTLY THE DECIDED WORDS, and is not an open term', () => {
    const real = loadLetter();
    assert.equal(real.paragraphs.filter((p) => p.text === ENQUIRY_SUPPORT).length, 1);
    assert.equal(real.openTerms.some((t) => /enquiry into the claim/.test(t.text)), false);
  });
});

/* ================================================================== *
 * LINE 3's BACK-END HALF — THE ENGAGEMENT GATE IS ON IN THE ENGINE, AND THE BACK END QUOTES NOTHING TO A CLIENT
 *
 * The engine ships CB_GATE_CONFIG.enabled true with jobs_per_year 120 and no costing injected. No back-end route
 * quotes a fee to a client: its fee readings are the invoice on an EARNED fee and the finance views. So no costing is
 * injected here, and this test pins that the pre-engagement gate never withholds an earned fee from being invoiced.
 * ================================================================== */

describe('line 3 (back end) — the engagement gate is on in the engine and withholds no earned fee here', () => {
  test('the engine’s gate is on, undetermined with no costing injected, and computeFee raises the plain 3% on every sector and size', async () => {
    const { feeDisplay } = await import('../src/web/engine.ts');
    const d = feeDisplay(10_000, null, {}) as unknown as { render: boolean; gate: { enabled: boolean; outcome: string; withholds_quote: boolean; missing: string[] } };
    assert.equal(d.gate.enabled, true, 'the engine’s engagement gate is not on — the engine workstream’s premise moved');
    assert.equal(d.gate.withholds_quote, false);
    assert.equal(d.gate.outcome, 'UNDETERMINED');
    assert.ok(d.gate.missing.includes('costing') || d.gate.missing.includes('sector'));
    for (const sector of ['dental', 'gp', 'care_homes', 'private_hospital', 'supported_living', null]) {
      for (const pence of [5_000_00, 50_000_00, 240_000_00]) {
        const f = FC.computeFee({ claim_value_pence: pence, sector, entity_type: null, tax_rate: null, pool_split_main_pence: null, pool_split_special_pence: null, period_start: null });
        assert.ok(f.ok, `an earned fee on a ${String(sector)} claim of ${pence} was withheld`);
        if (f.ok) assert.equal(f.fee_pence, Math.round(pence * 0.03));
      }
    }
  });
});
