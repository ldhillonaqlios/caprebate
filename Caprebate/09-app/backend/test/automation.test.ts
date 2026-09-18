/**
 * CRM 3 OF 10 — AUTOMATION RULES, WHAT NO RULE MAY DO, AND EMAIL TEMPLATES.
 * 11 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "seed it with the full specification's list re-keyed onto the procedure"
 *                                                  → THE SEEDED RULES
 *   "lead created fires for a GATED_EXIT lead … a rule whose effect needs an
 *    organisation must record that it did not run"  → LEAD CREATED
 *   "engagement signed -> information-request tasks from the DERIVED missing list"
 *                                                  → STAGE ENTERED, and N4 on the list
 *   "survey committed … client review … INVOICE reached … owner or stage changed"
 *                                                  → STAGE ENTERED and OWNER CHANGED
 *   "WHAT NO RULE MAY DO, each with a test"        → WHAT NO RULE MAY DO — by name, at the table, over the
 *                                                     whole procedure, on a do-not-contact organisation,
 *                                                     to a non-staff owner, and a rule that fails
 *   "merged values are ESCAPED; a missing value renders as a visible gap …
 *    outbox only … bank details or an invoice is refused by the store"
 *                                                  → EMAIL TEMPLATES
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { seed } from '../src/seed.ts';
import type { Db } from '../src/db.ts';
import { NotAuthorised, type Actor } from '../src/authz.ts';
import type { AppRole } from '../src/roles.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as L from '../src/web/leads.ts';
import * as T from '../src/web/tasks.ts';
import * as A from '../src/web/automation.ts';
import * as M from '../src/web/templates.ts';
import * as E from '../src/web/engaged.ts';
import { registryGate, feeGuard } from '../src/web/engine.ts';
import { localDate } from '../src/web/localtime.ts';
import { actor, testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';
import * as R from '../src/web/claim-record.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const require = createRequire(import.meta.url);
const SHARED = require('../../engine/src/generated/shared.js') as { CB_CTA: Record<string, unknown> };

type App = Awaited<ReturnType<typeof testApp>>;
type Org = { business: string; property: string; assessment: string | null };

function deps(app: App): A.AutomationDeps {
  return { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
}

function staff(app: App): void {
  for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
    app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) ' +
        'VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0],
    );
  }
}

let n = 0;
function organisation(app: App): Org {
  n += 1;
  const business = `b-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    [business, `Organisation ${n} Limited`, 'dental', 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  const assessment = `a-${n}`;
  app.db.run(
    'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
    [assessment, business, 'dental', T0, 100_00, 200_00, T0]);
  return { business, property, assessment };
}

/** A claim at a stage, keeping a next action owned by Sales — so every move below is tried on its gate alone. */
function claimAt(app: App, org: Org, stage: string, opts: { property?: string | null } = {}): string {
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: org.business, property_id: opts.property === undefined ? org.property : opts.property,
    assessment_id: org.assessment, workstream: 'UNKNOWN', stage, owner_id: null, surveyor_id: null,
  });
  P.recordOpened(deps(app), null, made.id, stage, 'a test fixture');
  T.insertTask(app.db, app.now, randomUUID, {
    title: 'the next action', description: null, owner_id: 'u-SALES', owner_role: null, due_on: '2026-12-31', priority: null,
    activity_type: 'TASK', business_id: org.business, property_id: null, claim_id: made.id, lead_id: null, contact_id: null,
    fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF', automation_run_id: null,
    created_by: 'u-SALES',
  });
  return made.id;
}

function fwd(app: App, who: Actor, claim: string, to: string): P.MoveResult {
  return P.moveClaim(deps(app), who, claim, { kind: 'FORWARD', to });
}

function confirm(app: App, claim: string, milestone: string): void {
  const r = P.recordMilestone(deps(app), actor('SALES'), claim, milestone, null);
  assert.equal(r.ok, true, r.ok ? '' : r.why);
}

function letter(app: App, business: string): void {
  app.db.run('INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [randomUUID(), business, 'SIGNED', T0, T0]);
}

function commitOn(app: App, org: Org, claim: string): void {
  const job = randomUUID();
  app.db.run(
    'INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
    [job, org.business, org.assessment, 'u-SURVEYING', 'COMMITTED_AND_RELEASED', T0, T0, claim]);
  app.db.run(
    'INSERT INTO surveyor_commitments (id,job_id,surveyor_id,a_qualifying_plant_pence,b_building_pence,c_bare_land_pence,' +
      'qualifying_pct,method_note,committed_at,figures_hash,released_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [randomUUID(), job, 'u-SURVEYING', 1, 1, 1, 0.1, 'a test commitment', T0, 'not-a-hash', T0]);
}

function count(db: Db, sql: string, params: readonly (string | null)[] = []): number {
  return db.get<{ n: number }>(sql, params)?.n ?? 0;
}

/** node:sqlite returns rows with a null prototype, and deepStrictEqual compares prototypes: compare the values. */
function plain<V>(v: V): V {
  return v === undefined ? v : JSON.parse(JSON.stringify(v)) as V;
}

function realActor(s: { users: { id: string; role: AppRole }[] }, role: AppRole): Actor {
  const u = s.users.find((x) => x.role === role);
  assert.ok(u, role);
  return { id: u.id, role, business_id: null, disabled: false };
}

/* ================================================================== *
 * THE SEEDED RULES
 * ================================================================== */

describe('the seeded rules are the full specification’s list, re-keyed onto the operating procedure', () => {
  test('nine rules, each naming where it came from; ADMIN edits them, SALES reads them, nobody else does either', async () => {
    const app = await testApp();
    try {
      staff(app);
      const page = A.rulesPage(app.db, actor('SALES'));
      const shape = page.rules.map((r) => [r.id, r.trigger.key, r.trigger.stage, r.effect.key]);
      assert.deepEqual(shape, [
        ['rule-lead-first-follow-up', 'LEAD_CREATED', null, 'FOLLOW_UP'],
        ['rule-engaged-information-requests', 'STAGE_ENTERED', 'DATA_GATHERING', 'INFORMATION_REQUEST_TASKS'],
        ['rule-survey-brief', 'STAGE_ENTERED', 'SURVEY', 'CREATE_TASK'],
        ['rule-committed-valuation', 'STAGE_ENTERED', 'VALUATION', 'CREATE_TASK'],
        ['rule-committed-reports', 'STAGE_ENTERED', 'VALUATION', 'CREATE_TASK'],
        ['rule-reports-follow-up', 'STAGE_ENTERED', 'REPORTS', 'FOLLOW_UP'],
        ['rule-invoice-finance-task', 'STAGE_ENTERED', 'INVOICE', 'CREATE_TASK'],
        ['rule-stage-notify-owner', 'STAGE_ENTERED', null, 'NOTIFY_OWNER'],
        ['rule-owner-notify', 'OWNER_CHANGED', null, 'NOTIFY_OWNER'],
      ]);
      for (const r of page.rules) assert.match(r.source, /full specification 14\.\d/, `${r.id} does not say where it came from`);
      assert.equal(page.may_write, false);
      assert.equal(A.rulesPage(app.db, actor('ADMIN')).may_write, true);
      for (const who of ['ACCOUNTING', 'SURVEYING'] as const) assert.throws(() => A.rulesPage(app.db, actor(who)), NotAuthorised);
      assert.throws(() => A.rulesPage(app.db, actor('CLIENT', 'u-C', 'b')), NotAuthorised);
      assert.throws(() => A.createRule(deps(app), actor('SALES'), { label: 'x' }), NotAuthorised);
      assert.throws(() => app.db.run("DELETE FROM automation_rules WHERE id = 'rule-owner-notify'"), /never deleted/);

      const retired = A.updateRule(deps(app), actor('ADMIN'), 'rule-owner-notify', {
        label: 'Owner changed: tell the new owner', trigger_event: 'OWNER_CHANGED', effect: 'NOTIFY_OWNER', active: 'no',
      });
      assert.equal(retired.ok, true, retired.ok ? '' : retired.why);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      assert.equal(C.updateClaim(deps(app), actor('SALES'), c, { owner_id: 'u-ADMIN' }).ok, true);
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM automation_runs WHERE rule_id = 'rule-owner-notify'"), 0, 'a retired rule ran');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * LEAD CREATED
 * ================================================================== */

describe('lead created → an owner and a first follow-up', () => {
  test('a staff lead’s follow-up is its owner’s; a GATED_EXIT lead with no organisation gets one waiting with Sales — and a rule needing an organisation records that it did not run', async () => {
    const app = await testApp();
    try {
      staff(app);
      const d = deps(app);
      const made = L.createLead(d, actor('SALES'), { prospect_organisation: 'Referred Invented Limited', source: 'REFERRAL' });
      assert.ok(made.ok, made.ok ? '' : made.why);
      const follow = app.db.get<{ owner_id: string | null; owner_role: string | null; activity_type: string; origin: string; due_on: string }>(
        'SELECT owner_id, owner_role, activity_type, origin, due_on FROM staff_tasks WHERE lead_id = ?', [made.id]);
      assert.deepEqual(plain(follow), {
        owner_id: 'u-SALES', owner_role: null, activity_type: 'CALL', origin: 'AUTOMATION', due_on: T.addDaysToDate(localDate(app.now()), 1),
      });

      const needsOrg = A.createRule(d, actor('ADMIN'), {
        label: 'Check the organisation', trigger_event: 'LEAD_CREATED', effect: 'CREATE_TASK', task_title: 'Check the organisation',
        task_activity_type: 'TASK', due_in_days: '2', assign_to: 'ROLE', assign_role: 'SALES', attach_to: 'ORGANISATION',
      });
      assert.ok(needsOrg.ok, needsOrg.ok ? '' : needsOrg.why);
      const gated = L.openLeadForGatedExit(app.db, randomUUID, { prospect_organisation: 'Gated Invented Limited', at: T0 });
      const out = A.fireAutomation(d, null, { trigger: 'LEAD_CREATED', lead_id: gated });
      assert.deepEqual(out.map((o) => [o.rule_id === needsOrg.id ? 'needs-org' : o.rule_id, o.outcome, o.reason]), [
        ['rule-lead-first-follow-up', 'RAN', null],
        ['needs-org', 'NOT_RUN', 'NEEDS_ORGANISATION'],
      ]);
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM automation_runs WHERE lead_id = ?', [gated]), 2, 'a rule skipped the lead without a record');
      assert.deepEqual(
        plain(app.db.get<{ business_id: string | null; owner_id: string | null; owner_role: string | null }>(
          'SELECT business_id, owner_id, owner_role FROM staff_tasks WHERE lead_id = ?', [gated])),
        { business_id: null, owner_id: null, owner_role: 'SALES' });
      const router = readFileSync(join(SRC, 'web/router.ts'), 'utf8');
      assert.equal([...router.matchAll(/fireAutomation\(\{[^}]*\}, null, \{ trigger: 'LEAD_CREATED'/g)].length, 2, 'the funnel close and the gated exit do not both fire lead created');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * STAGE ENTERED, OWNER CHANGED
 * ================================================================== */

describe('stage entered and owner changed', () => {
  test('ENGAGEMENT SIGNED → one information-request task per fact the DERIVED missing list says nobody has asked for — DONT_KNOW and SKIPPED alike — and re-entering asks nothing twice', async () => {
    const app = await testApp();
    try {
      const s = await seed(app.db, app.hasher, app.now);
      const sales = realActor(s, 'SALES');
      const admin = realActor(s, 'ADMIN');
      const b2 = app.db.get<{ id: string }>("SELECT id FROM businesses WHERE name = 'Brackenfell Dental Partnership LLP'")?.id ?? '';
      const claim = app.db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? AND stage = ?', [b2, 'ENGAGEMENT'])?.id ?? '';
      assert.notEqual(claim, '');
      app.db.run("UPDATE engagements SET letter_state = 'SIGNED', signed_at = ? WHERE business_id = ?", [T0, b2]);
      assert.equal(T.setNextAction(deps(app), sales, claim, { title: 'Start gathering the data', owner_id: sales.id, due_on: '2026-12-31' }).ok, true);

      const expected = E.missingFacts(app.db, sales, b2).filter((m) => !m.has_task);
      assert.ok(expected.length > 0, 'nothing is missing — the check below would prove nothing');
      assert.ok(expected.filter((m) => m.origin === 'answer').length >= 2,
        'the seed’s assessment has one DONT_KNOW and one SKIPPED answer, and both must be on the missing list');

      assert.equal(fwd(app, sales, claim, 'DATA_GATHERING').ok, true);
      const made = app.db.all<{ fact_id: string; title: string; owner_id: string | null }>(
        "SELECT fact_id, title, owner_id FROM staff_tasks WHERE business_id = ? AND origin = 'AUTOMATION' AND fact_id IS NOT NULL", [b2]);
      assert.deepEqual(made.map((t) => t.fact_id).sort(), expected.map((m) => m.fact_id).sort(), 'the tasks are not the derived list');
      assert.ok(made.every((t) => t.title.startsWith('Ask for: ')));
      const run = app.db.get<{ outcome: string; tasks_created: number }>(
        "SELECT outcome, tasks_created FROM automation_runs WHERE rule_id = 'rule-engaged-information-requests' ORDER BY at DESC, rowid DESC LIMIT 1");
      assert.deepEqual(plain(run), { outcome: 'RAN', tasks_created: expected.length });

      assert.equal(P.moveClaim(deps(app), admin, claim, { kind: 'REOPEN', to: 'ENGAGEMENT', reason: 'a test' }).ok, true);
      assert.equal(fwd(app, sales, claim, 'DATA_GATHERING').ok, true);
      const again = app.db.get<{ outcome: string; reason: string | null; tasks_created: number }>(
        "SELECT outcome, reason, tasks_created FROM automation_runs WHERE rule_id = 'rule-engaged-information-requests' ORDER BY at DESC, rowid DESC LIMIT 1");
      assert.deepEqual(plain(again), { outcome: 'RAN', reason: 'NOTHING_MISSING', tasks_created: 0 }, 'a fact already asked for was asked again');
    } finally { app.close(); }
  });

  test('SURVEY COMMITTED → valuation and report tasks; CLIENT REVIEW → a follow-up; INVOICE → a finance task waiting with Accounting, and no email', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const sales = actor('SALES');
      const automated = (claim: string): { title: string; activity_type: string; owner_role: string | null }[] =>
        app.db.all<{ title: string; activity_type: string; owner_role: string | null }>(
          "SELECT title, activity_type, owner_role FROM staff_tasks WHERE claim_id = ? AND origin = 'AUTOMATION' ORDER BY title", [claim])
          .map((t) => ({ ...t }));

      const v = claimAt(app, org, 'SURVEY');
      commitOn(app, org, v);
      assert.equal(fwd(app, sales, v, 'VALUATION').ok, true);
      assert.deepEqual(automated(v).map((t) => t.title), [
        'Prepare the client report and the accountant report',
        "Prepare the valuation under the surveyor's measured record, every rate sourced",
      ]);
      assert.ok(automated(v).every((t) => t.owner_role === 'SALES'), 'a claim with no owner put its task on nobody');

      // CRM 6 of 10: the sign-off is a record, and REPORTS also reads both reports issued and the window open.
      const r = claimAt(app, org, 'TAX_ADVISER_SIGNOFF');
      CF.signOffRow(app, org.business, org.assessment ?? '', r);
      assert.equal(fwd(app, sales, r, 'REPORTS').ok, true);
      assert.deepEqual(automated(r).map((t) => [t.title, t.activity_type]), [["Follow up the client's review of the report", 'CALL']]);

      const i = claimAt(app, org, 'REPORTS');
      CF.readyForReports(app, org.business, org.property, org.assessment ?? '', i);
      confirm(app, i, 'CLIENT_ACCEPTED_REPORT');
      confirm(app, i, 'ACCOUNTANT_CONFIRMED_RETURN');
      const outbox = count(app.db, 'SELECT COUNT(*) AS n FROM outbox');
      assert.equal(fwd(app, sales, i, 'INVOICE').ok, true);
      assert.deepEqual(automated(i), [{ title: 'Raise the invoice for this claim in the finance view', activity_type: 'TASK', owner_role: 'ACCOUNTING' }]);
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM outbox'), outbox, 'reaching the invoice stage wrote to the outbox');
      assert.ok(T.myWork(app.db, actor('ACCOUNTING'), app.now()).tasks.some((t) => t.title === 'Raise the invoice for this claim in the finance view'),
        'the finance task is not on Accounting’s list');
    } finally { app.close(); }
  });

  test('OWNER OR STAGE CHANGED → a notice to the owner, in the outbox and NOT SENT — and the owner who made the change is not told', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const d = deps(app);
      const own = claimAt(app, org, 'ASSESSMENT');
      const theirs = claimAt(app, org, 'ASSESSMENT');
      for (const c of [own, theirs]) assert.equal(C.updateClaim(d, actor('SALES'), c, { owner_id: 'u-ADMIN' }).ok, true);
      const notices = app.db.all<{ subject: string; kind: string; sent_at: string | null; transport: string; business_id: string | null }>(
        "SELECT subject, kind, sent_at, transport, business_id FROM outbox WHERE to_email = 'admin@example.invalid' ORDER BY created_at");
      assert.equal(notices.length, 2);
      for (const x of notices) {
        assert.match(x.subject, /^You now own CR-/);
        assert.deepEqual([x.kind, x.sent_at, x.transport, x.business_id], ['NOTIFICATION', null, 'STUB', org.business]);
      }
      const before = count(app.db, 'SELECT COUNT(*) AS n FROM outbox');
      assert.equal(fwd(app, actor('ADMIN'), own, 'ENGAGEMENT').ok, true);
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM outbox'), before, 'the owner was told about their own move');
      assert.equal(app.db.get<{ reason: string }>(
        "SELECT reason FROM automation_runs WHERE rule_id = 'rule-stage-notify-owner' AND claim_id = ? ORDER BY at DESC, rowid DESC LIMIT 1", [own])?.reason,
      'OWNER_MADE_THE_CHANGE');
      assert.equal(fwd(app, actor('SALES'), theirs, 'ENGAGEMENT').ok, true);
      assert.match(app.db.get<{ subject: string }>('SELECT subject FROM outbox ORDER BY created_at DESC, rowid DESC LIMIT 1')?.subject ?? '', /is now at Engagement$/);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * WHAT NO RULE MAY DO
 * ================================================================== */

describe('what no rule may do — each refused, and each with a test', () => {
  test('BY NAME AT THE STORE, AND AT THE TABLE: open either gate, move a claim, flip a switch, fire a register call, send outside the outbox, write to a do-not-contact organisation, an invoice email', async () => {
    const app = await testApp();
    try {
      staff(app);
      for (const k of ['OPEN_FREE_GATE', 'OPEN_PAID_GATE', 'MOVE_CLAIM', 'FLIP_CTA_SWITCH', 'FIRE_REGISTER_CALL', 'SEND_EMAIL', 'WRITE_TO_DO_NOT_CONTACT', 'INVOICE_EMAIL']) {
        assert.ok(Object.hasOwn(A.FORBIDDEN_EFFECTS, k), `${k} is not a named refusal`);
      }
      for (const [key, reason] of Object.entries(A.FORBIDDEN_EFFECTS)) {
        const r = A.createRule(deps(app), actor('ADMIN'), {
          label: `Try ${key}`, trigger_event: 'STAGE_ENTERED', effect: key, task_title: 'x', task_activity_type: 'TASK',
          due_in_days: '1', assign_to: 'ROLE', assign_role: 'SALES',
        });
        assert.equal(r.ok, false, `${key} was accepted`);
        if (!r.ok) assert.equal(r.why, reason);
        assert.throws(() => app.db.run(
          "INSERT INTO automation_rules (id, label, trigger_event, effect, task_title, task_activity_type, due_in_days, assign_to, assign_role, ord, source, created_at, updated_at) VALUES (?, ?, 'STAGE_ENTERED', ?, 'x', 'TASK', 1, 'ROLE', 'SALES', 999, 'a test', ?, ?)",
          [randomUUID(), key, key, T0, T0]), /CHECK constraint/, `the table accepted ${key}`);
      }
      const unknown = A.createRule(deps(app), actor('ADMIN'), { label: 'x', trigger_event: 'STAGE_ENTERED', effect: 'DELETE_EVERYTHING' });
      assert.equal(unknown.ok, false);
      if (!unknown.ok) assert.match(unknown.why, /not an effect a rule can have/);
    } finally { app.close(); }
  });

  test('THE WHOLE PROCEDURE WITH EVERY RULE ACTIVE: neither gate opens, no switch flips, no register call fires, only a person moves the claim, and nothing leaves the outbox', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'ENQUIRY');
      const d = deps(app);
      const sales = actor('SALES');
      for (const check_key of Object.keys(P.ENQUIRY_CHECKS)) {
        assert.equal(P.recordEnquiryCheck(d, sales, { claim_id: c }, { check_key, answer: 'YES', note: null }).ok, true);
      }
      letter(app, org.business);
      const snapshot = (): Record<string, unknown> => ({
        free_gate_open: registryGate().enabled,
        cta: JSON.stringify(SHARED.CB_CTA),
        fee_switches: JSON.stringify(feeGuard()),
        engagements: JSON.stringify(app.db.all('SELECT * FROM engagements ORDER BY id')),
        research_runs: count(app.db, 'SELECT COUNT(*) AS n FROM research_runs'),
        research_sources: JSON.stringify(app.db.all('SELECT * FROM research_sources ORDER BY id')),
        register_records: count(app.db, 'SELECT COUNT(*) AS n FROM register_records'),
      });
      const before = snapshot();
      assert.equal(before['free_gate_open'], false, 'the free gate was open before the walk — the check below would prove nothing');

      const step = (to: string): void => { const r = fwd(app, sales, c, to); assert.equal(r.ok, true, `${to}: ${r.ok ? '' : r.why}`); };
      step('ASSESSMENT');
      step('ENGAGEMENT');
      step('DATA_GATHERING');
      confirm(app, c, 'DATA_GATHERING_COMPLETE');
      CF.noElection(app, c);
      step('SURVEY');
      commitOn(app, org, c);
      step('VALUATION');
      confirm(app, c, 'VALUATION_SIGNED');
      CF.noGrants(app, c);
      step('TAX_ADVISER_SIGNOFF');
      // CRM 6 of 10: the sign-off RECORD, written through the store a person uses — not a date on the claim.
      const signed = R.recordSignOff(CF.recordDeps(app), actor('SALES'), c, {
        adviser: 'CAPREBATE_CTA', credential: 'Chartered Tax Adviser', signed_on: '2026-09-01', scope: 'the whole claim',
        method_note: 'reviewed against the rulebooks', figure: '1000', confirmed_switches: '',
      });
      assert.equal(signed.ok, true, signed.ok ? '' : signed.why);
      CF.openWindow(app, org.business, org.property, c);
      CF.issue(app, c, 'CLIENT_REPORT');
      CF.issue(app, c, 'ACCOUNTANT_COMPUTATION_PACK');
      step('REPORTS');
      confirm(app, c, 'CLIENT_ACCEPTED_REPORT');
      confirm(app, c, 'ACCOUNTANT_CONFIRMED_RETURN');
      step('INVOICE');
      confirm(app, c, 'HMRC_PROCESSED_RELIEF');
      // CRM 7 of 10: the gate reads THIS claim's own fee invoice — an organisation's no longer opens it.
      CF.claimInvoiceRow(app, org.business, c);
      step('DEFENCE_PACK');
      // CRM 6 of 10: the pack complete is the register's issued defence pack, with its hash; the confirmation is retired.
      CF.issue(app, c, 'DEFENCE_PACK');
      step('CLOSED');

      assert.deepEqual(snapshot(), before, 'a rule changed a gate, a switch, the engagement or the research');
      const moves = app.db.all<{ kind: string; actor_id: string | null }>('SELECT kind, actor_id FROM claim_stage_moves WHERE claim_id = ? ORDER BY at, rowid', [c]);
      assert.deepEqual(moves.filter((m) => m.kind !== 'OPENED').map((m) => [m.kind, m.actor_id]), Array.from({ length: 10 }, () => ['FORWARD', 'u-SALES']),
        'something other than the person moved the claim');
      for (const o of app.db.all<{ sent_at: string | null; transport: string }>('SELECT sent_at, transport FROM outbox')) {
        assert.deepEqual([o.sent_at, o.transport], [null, 'STUB'], 'a message left the outbox');
      }
      assert.equal(new Set(app.db.all<{ stage: string }>(
        "SELECT DISTINCT stage FROM automation_runs WHERE claim_id = ? AND trigger_event = 'STAGE_ENTERED'", [c]).map((r) => r.stage)).size, 10,
      'a stage entered was not put to the rules');

      const auto = readFileSync(join(SRC, 'web/automation.ts'), 'utf8');
      for (const mod of ["from './research.ts'", "from '../stubs/registers.ts'", "from '../stubs/signature.ts'", "from './engine.ts'", "from './pipeline.ts'"]) {
        assert.equal(auto.includes(mod), false, `automation.ts imports ${mod}`);
      }
      for (const name of ['moveClaim', 'recordMilestone', 'recordEnquiryCheck', 'runResearch', 'retryFailedSource', 'ingestRegisterRecord', 'assertSignedEngagement']) {
        assert.equal(new RegExp(`\\b${name}\\b`).test(auto), false, `automation.ts names ${name}`);
      }
      for (const file of ['web/automation.ts', 'web/templates.ts']) {
        const src = readFileSync(join(SRC, file), 'utf8');
        assert.equal(/\b(d|app)\.email\b/.test(src), false, `${file} uses the application's transport`);
        assert.match(src, /outboxTransport\(d\.db, d\.newId, d\.now\)/, `${file} does not build its own outbox transport`);
      }
    } finally { app.close(); }
  });

  test('A DO_NOT_CONTACT ORGANISATION: every rule records NOT_RUN and writes nothing — and the negative control runs once the status is lifted', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      app.db.run("UPDATE claims SET owner_id = 'u-ADMIN' WHERE id = ?", [c]);
      app.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [org.business]);
      const outbox = count(app.db, 'SELECT COUNT(*) AS n FROM outbox');
      const out = A.fireAutomation(deps(app), actor('SALES'), { trigger: 'STAGE_ENTERED', claim_id: c, stage: 'VALUATION' });
      assert.equal(out.length, 3);
      assert.ok(out.every((o) => o.outcome === 'NOT_RUN' && o.reason === 'DO_NOT_CONTACT'), JSON.stringify(out));
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM staff_tasks WHERE claim_id = ? AND origin = 'AUTOMATION'", [c]), 0);
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM outbox'), outbox);

      app.db.run("UPDATE businesses SET client_status = 'ACTIVE' WHERE id = ?", [org.business]);
      const lifted = A.fireAutomation(deps(app), actor('SALES'), { trigger: 'STAGE_ENTERED', claim_id: c, stage: 'VALUATION' });
      assert.ok(lifted.every((o) => o.outcome === 'RAN'), JSON.stringify(lifted));
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM outbox'), outbox + 1);
    } finally { app.close(); }
  });

  test('A RULE WRITES ONLY TO STAFF: an owner who is not staff is not told, and the task goes to the team instead', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
        ['u-CLIENT-1', 'client@org.example.invalid', 'client@org.example.invalid', 'Client User', 'CLIENT', 'x', T0, T0, org.business]);
      app.db.run("UPDATE claims SET owner_id = 'u-CLIENT-1' WHERE id = ?", [c]);
      const out = A.fireAutomation(deps(app), actor('SALES'), { trigger: 'STAGE_ENTERED', claim_id: c, stage: 'VALUATION' });
      assert.equal(out.find((o) => o.rule_id === 'rule-stage-notify-owner')?.reason, 'OWNER_IS_NOT_STAFF');
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM outbox WHERE to_email = 'client@org.example.invalid'"), 0);
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM staff_tasks WHERE claim_id = ? AND origin = 'AUTOMATION' AND owner_role = 'SALES' AND owner_id IS NULL", [c]), 2);
    } finally { app.close(); }
  });

  test('A RULE THAT FAILS records NOT_RUN ERROR, writes nothing, and does not undo the move it followed', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      commitOn(app, org, c);
      app.db.execDdl("CREATE TRIGGER test_refuse_automation_tasks BEFORE INSERT ON staff_tasks WHEN NEW.origin = 'AUTOMATION' BEGIN SELECT RAISE(ABORT, 'a test refusal'); END;");
      assert.equal(fwd(app, actor('SALES'), c, 'VALUATION').ok, true);
      assert.equal(app.db.get<{ stage: string }>('SELECT stage FROM claims WHERE id = ?', [c])?.stage, 'VALUATION');
      const run = app.db.get<{ outcome: string; reason: string; tasks_created: number }>(
        "SELECT outcome, reason, tasks_created FROM automation_runs WHERE rule_id = 'rule-committed-valuation' AND claim_id = ?", [c]);
      assert.deepEqual(plain(run), { outcome: 'NOT_RUN', reason: 'ERROR', tasks_created: 0 });
      assert.equal(count(app.db, "SELECT COUNT(*) AS n FROM staff_tasks WHERE claim_id = ? AND origin = 'AUTOMATION'", [c]), 0);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * EMAIL TEMPLATES
 * ================================================================== */

describe('email templates — merged into the outbox, and nowhere else', () => {
  test('merged values are ESCAPED; a missing value is a visible gap, never an empty string — and a claim with no property reads the same as a property with no address', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      const contact = randomUUID();
      app.db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, email, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)',
        [contact, org.business, '<b>Finance</b> & Co', 'finance@org.example.invalid', T0]);
      const r = M.queueTemplate(deps(app), actor('SALES'), c, { template_id: 'template-next-step', contact_id: contact });
      assert.ok(r.ok, r.ok ? '' : r.why);
      assert.deepEqual(r.gaps, ['property_address']);
      const row = app.db.get<{ subject: string; body: string; kind: string; sent_at: string | null; transport: string; business_id: string }>(
        'SELECT subject, body, kind, sent_at, transport, business_id FROM outbox WHERE id = ?', [r.id]);
      assert.ok(row);
      assert.deepEqual([row.kind, row.sent_at, row.transport, row.business_id], ['TEMPLATE', null, 'STUB', org.business]);
      assert.ok(row.body.includes('Dear &lt;b&gt;Finance&lt;/b&gt; &amp; Co,'), 'the contact’s name was not escaped');
      assert.equal(row.body.includes('<b>'), false);
      assert.ok(row.body.includes('on [property address not recorded].'), 'the missing address is not a visible gap');
      assert.ok(row.body.includes('The next step is: the next action. We expect it by 31 Dec 2026.')); // Phase 133c: UK dates
      assert.equal(/\{\{|\}\}/.test(row.subject + row.body), false, 'a merge field was left unfilled');
      assert.match(row.subject, /^Your claim CR-\d{4}-\d{4} — the next step$/);

      const noProperty = claimAt(app, org, 'SURVEY', { property: null });
      const a = M.mergeValues(app.db, c, contact);
      const b = M.mergeValues(app.db, noProperty, contact);
      assert.equal(a['property_address'], null);
      assert.equal(b['property_address'], null);
      assert.equal(M.mergeText('{{property_address}}', a, false).text, M.mergeText('{{property_address}}', b, false).text);
      app.db.run("UPDATE properties SET address_line_1 = 'Unit 1', town = 'Nowhere Town', postcode = 'ZZ1 1AA' WHERE id = ?", [org.property]);
      assert.equal(M.mergeValues(app.db, c, contact)['property_address'], 'Unit 1, Nowhere Town, ZZ1 1AA', 'the negative control: a recorded address merges');
      assert.equal(M.mergeText('Hi {{contact_name}}', { contact_name: 'line one\nline two' }, true).text, 'Hi line one line two');
    } finally { app.close(); }
  });

  test('A TEMPLATE CARRYING BANK DETAILS OR AN INVOICE IS REFUSED — by the store, by the table, and again at the merge; so is a field that is not a merge field', async () => {
    const app = await testApp();
    try {
      staff(app);
      const d = deps(app);
      const tryBody = (body: string): string => {
        const r = M.createTemplate(d, actor('ADMIN'), { label: 'A test', subject: 'A subject', body });
        assert.equal(r.ok, false, `accepted: ${body}`);
        return r.ok ? '' : r.why;
      };
      assert.match(tryBody('Please pay the attached invoice'), /an invoice/);
      assert.match(tryBody('Our sort code is below'), /a sort code/);
      assert.match(tryBody('Pay to 12-34-56'), /shaped like a sort code/);
      assert.match(tryBody('Account number 12345678'), /an account number/);
      assert.match(tryBody('Our IBAN is GB29 NWBK 6016 1331 9268 19'), /an IBAN/);
      assert.match(tryBody('Our bank details are these'), /bank details/);
      assert.match(tryBody('Hello {{client_secret}}'), /not a merge field/);
      assert.match(tryBody('Hello {{contact_name'), /without its pair/);
      assert.equal(M.createTemplate(d, actor('ADMIN'), { label: 'Fine', subject: 'Your claim {{claim_reference}}', body: 'Dear {{contact_name}}' }).ok, true, 'the negative control');

      for (const body of ['The invoice is attached', 'Our bank details follow']) {
        assert.throws(() => app.db.run('INSERT INTO email_templates (id, label, subject, body, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
          [randomUUID(), 'raw', 'raw', body, T0, T0]), /E_TEMPLATE_REFUSED/);
      }
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      const contact = randomUUID();
      app.db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, email, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)',
        [contact, org.business, 'Finance Contact', 'finance@org.example.invalid', T0]);
      // CRM 7 of 10 widened the table's trigger to "pay to", so the row it misses is now a bare shape the store alone knows.
      app.db.run("INSERT INTO email_templates (id, label, subject, body, active, created_at, updated_at) VALUES ('t-shape', 'raw', 'raw', 'Use 12-34-56', 1, ?, ?)", [T0, T0]);
      const merged = M.queueTemplate(d, actor('SALES'), c, { template_id: 't-shape', contact_id: contact });
      assert.equal(merged.ok, false, 'a template the trigger missed was merged');
      if (!merged.ok) assert.match(merged.why, /sort code/);

      assert.throws(() => M.createTemplate(d, actor('SALES'), { label: 'x', subject: 'x', body: 'x' }), NotAuthorised);
      assert.throws(() => M.templatesPage(app.db, actor('ACCOUNTING')), NotAuthorised);
    } finally { app.close(); }
  });

  test('THE OUTBOX ONLY: a do-not-contact organisation is refused, an address nobody recorded is refused, another organisation’s contact is refused, and Accounting and Surveying may not queue', async () => {
    const app = await testApp();
    try {
      staff(app);
      const d = deps(app);
      const org = organisation(app);
      const other = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      const withEmail = randomUUID();
      const noEmail = randomUUID();
      const elsewhere = randomUUID();
      for (const [id, biz, email] of [[withEmail, org.business, 'finance@org.example.invalid'], [noEmail, org.business, null], [elsewhere, other.business, 'x@other.example.invalid']] as const) {
        app.db.run('INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, email, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)',
          [id, biz, 'A Contact', email, T0]);
      }
      const q = (contact_id: string): M.QueueResult => M.queueTemplate(d, actor('SALES'), c, { template_id: 'template-next-step', contact_id });
      const refusal = (r: M.QueueResult): string => { assert.equal(r.ok, false); return r.ok ? '' : r.why; };
      assert.match(refusal(q(noEmail)), /no email address recorded/);
      assert.match(refusal(q(elsewhere)), /own contacts/);
      const before = count(app.db, 'SELECT COUNT(*) AS n FROM outbox');
      app.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [org.business]);
      assert.match(refusal(q(withEmail)), /do not contact/);
      assert.equal(count(app.db, 'SELECT COUNT(*) AS n FROM outbox'), before);
      app.db.run("UPDATE businesses SET client_status = 'ACTIVE' WHERE id = ?", [org.business]);
      assert.equal(q(withEmail).ok, true, 'the negative control');
      assert.throws(() => M.queueTemplate(d, actor('ACCOUNTING'), c, { template_id: 'template-next-step', contact_id: withEmail }), NotAuthorised);
      assert.throws(() => M.queueTemplate(d, actor('SURVEYING'), c, { template_id: 'template-next-step', contact_id: withEmail }), NotAuthorised);
    } finally { app.close(); }
  });
});
