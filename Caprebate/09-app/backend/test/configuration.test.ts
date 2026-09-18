/**
 * CRM 9 OF 10 — ADMIN SETTINGS: THE CONFIGURABLE LISTS, THE REFUSALS BY THE STORE, A RULE THAT
 * ASKS FOR A DOCUMENT, AND MERGING A FIRM. 12 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                                   → WHO MAY DO WHAT
 *   "configurable lists … sources, lost reasons, priorities, task types,
 *    document types, property types, introducer types"     → THE LISTS
 *   "refusals by the store, each with a test"               → WHAT NO SETTING MAY CHANGE
 *   "REQUEST_DOCUMENT … through createDocumentRequest, refused for a type with no
 *    receipt policy and for DO_NOT_CONTACT"                 → A RULE THAT ASKS FOR A DOCUMENT
 *   "merge a firm … a replacement trigger for contacts_introducer_fixed, its own
 *    audit kind"                                            → MERGING A FIRM
 *   the rebuilt tables keep every trigger they had           → MIGRATION 019, READ BACK
 *   "show finance_settings and compliance_settings"         → THE SCREEN, OVER HTTP
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, NotAuthorised, REGISTERED_ACTIONS, type Obj } from '../src/authz.ts';
import * as CF from '../src/web/configuration.ts';
import * as V from '../src/web/vocabularies.ts';
import * as A from '../src/web/automation.ts';
import * as C from '../src/web/crm.ts';
import * as I from '../src/web/introducers.ts';
import * as L from '../src/web/leads.ts';
import * as P from '../src/web/pipeline.ts';
import * as T from '../src/web/tasks.ts';
import { NO_RECEIPT_POLICY } from '../src/web/documents.ts';
import { ctaSwitchReadings } from '../src/web/engine.ts';
import { FEE_CONTROLS } from '../src/web/fee-controls.ts';
import { localDate } from '../src/web/localtime.ts';
import { actor, testApp } from './helpers.ts';

const T0 = '2026-09-08T00:00:00.000Z';

type App = Awaited<ReturnType<typeof testApp>>;

const deps = (app: App) => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });
const ADMIN = actor('ADMIN');
const SALES = actor('SALES');

function staffUsers(app: App): void {
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    app.db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
  }
}

async function app(): Promise<App> {
  const a = await testApp();
  staffUsers(a);
  return a;
}

function count(a: App, sql: string, params: readonly (string | null)[] = []): number {
  return a.db.get<{ n: number }>(sql, params)?.n ?? -1;
}

/** Every table a setting could reach, read whole — fixed statements, so a refusal can be shown to have changed nothing. */
const SNAPSHOT = [
  'SELECT * FROM vocabularies ORDER BY list, code',
  'SELECT * FROM reason_lists ORDER BY list, code',
  'SELECT * FROM document_types ORDER BY code',
  'SELECT * FROM automation_rules ORDER BY id',
  'SELECT * FROM finance_settings ORDER BY rowid',
  'SELECT * FROM compliance_settings ORDER BY rowid',
  'SELECT * FROM introducer_reward_setting ORDER BY rowid',
  'SELECT * FROM roles ORDER BY role',
  'SELECT * FROM users ORDER BY id',
] as const;
const snapshot = (a: App): string => JSON.stringify(SNAPSHOT.map((sql) => a.db.all(sql)));

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

describe('who may do what — three new actions, deny by default, every role not granted refused', () => {
  test('configuration.read, configuration.write and introducer.merge, per role, a disabled user refused', () => {
    const settings: Obj = { type: 'configuration', id: 'settings' };
    const firm: Obj = { type: 'introducer', id: 'f-1' };
    const cases: readonly [string, Obj, readonly AppRole[]][] = [
      ['configuration.read', settings, ['ADMIN', 'SALES']],
      ['configuration.write', settings, ['ADMIN']],
      ['introducer.merge', firm, ['ADMIN']],
    ];
    for (const [action, obj, granted] of cases) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const who = actor(role, `u-${role}`, role === 'CLIENT' ? 'biz-1' : null);
        assert.equal(can(who, action, obj), granted.includes(role), `${role} on ${action}`);
        assert.equal(can({ ...who, disabled: true }, action, obj), false, `a disabled ${role} on ${action}`);
      }
    }
  });

  test('the store asks: SALES reads and writes nothing; ACCOUNTING, SURVEYING and a client cannot open the settings', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const sales = CF.configurationView(a.db, SALES, a.now());
      assert.equal(sales.may_write, false);
      assert.equal(sales.finance, undefined, 'SALES reached the finance settings');
      assert.throws(() => CF.addValue(d, SALES, { list: 'LEAD_SOURCE', code: 'PODCAST', label: 'A podcast' }), NotAuthorised);
      assert.throws(() => CF.changeValue(d, SALES, 'LEAD_SOURCE', 'EVENT', { active: '0' }), NotAuthorised);
      assert.throws(() => CF.addReason(d, SALES, { list: 'LEAD_LOST', code: 'NO_BUDGET', label: 'No budget' }), NotAuthorised);
      assert.throws(() => CF.refuseSetting(d, SALES, 'FREE_REGISTER_GATE'), NotAuthorised);
      for (const role of ['ACCOUNTING', 'SURVEYING', 'CLIENT'] as const) {
        assert.throws(() => CF.configurationView(a.db, actor(role, `u-${role}`, role === 'CLIENT' ? 'biz-1' : null), a.now()), NotAuthorised, role);
      }
      assert.equal(count(a, "SELECT COUNT(*) AS n FROM vocabularies WHERE code = 'PODCAST'"), 0);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * WHAT NO SETTING MAY CHANGE
 * ================================================================== */

describe('what no setting may change — refused by the store, by name, recorded, and nothing moved', () => {
  test('the forbidden list names every rule the phase lists', () => {
    const keys = Object.keys(CF.FORBIDDEN_SETTINGS);
    for (const k of [
      'STAGE_LIST', 'FREE_REGISTER_GATE', 'PAID_REGISTER_GATE', 'REWARD_MODEL', 'FEE_CLAWBACK', 'AML_IN_SCOPE', 'CLIENT_SHARE_GIVE',
      'QUOTE_GAP_REVIEW_PCT', 'ROLE_BOUNDARY', 'DOCUMENT_TYPE_RECEIPT_POLICY', 'DOCUMENT_TYPE_CARRIES_VALUE_UNSET',
      'RETENTION_PARAMETERS', 'FACT_KEYS', 'RECIPROCITY_KINDS',
    ]) assert.ok(keys.includes(k), `${k} is not refused`);
    assert.ok(keys.filter((k) => k.startsWith('STAGE_GATE:')).length > 0, 'no stage gate is refused');
    assert.equal(keys.filter((k) => k.startsWith('FEE_CONTROL:')).length, Object.keys(FEE_CONTROLS).length, 'a fee control is not refused');
    assert.ok(keys.filter((k) => k.startsWith('CTA_SWITCH:')).length > 0, 'no CTA switch is refused');
    for (const [k, why] of Object.entries(CF.FORBIDDEN_SETTINGS)) assert.ok(why.trim().length > 20, `${k} is refused without a reason`);
  });

  test('ADMIN asking for each one is refused with its reason, each refusal audited, and not one row, switch or permission changed', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const before = snapshot(a);
      const cta = JSON.stringify(ctaSwitchReadings());
      const fees = JSON.stringify(FEE_CONTROLS);
      const perms = JSON.stringify(APP_ROLES.map((role) => REGISTERED_ACTIONS.map((x) => can(actor(role), x, { type: 'configuration', id: 'settings' }))));
      const keys = Object.keys(CF.FORBIDDEN_SETTINGS);
      for (const k of keys) {
        const r = CF.refuseSetting(d, ADMIN, k);
        assert.equal(r.ok, false);
        assert.equal(r.why, CF.FORBIDDEN_SETTINGS[k], k);
      }
      const refused = a.audit.entries().filter((e) => e.kind === 'CONFIGURATION_REFUSED');
      assert.deepEqual(refused.map((e) => (e.detail as { setting: string }).setting), keys);
      assert.ok(refused.every((e) => e.outcome === 'REFUSED' && e.actor_role === 'ADMIN'));
      // Negative control: something that is not on the list is not a setting at all, and is not recorded as one refused.
      assert.match(CF.refuseSetting(d, ADMIN, 'NOT_A_THING').why, /not a setting/);
      assert.equal(a.audit.entries().filter((e) => e.kind === 'CONFIGURATION_REFUSED').length, keys.length);
      assert.equal(snapshot(a), before, 'a refused setting changed a row');
      assert.equal(JSON.stringify(ctaSwitchReadings()), cta);
      assert.equal(JSON.stringify(FEE_CONTROLS), fees);
      assert.equal(JSON.stringify(APP_ROLES.map((role) => REGISTERED_ACTIONS.map((x) => can(actor(role), x, { type: 'configuration', id: 'settings' })))), perms);
    } finally { a.close(); }
  });

  test('THE ROLE BOUNDARY: no list of roles, the table refuses a list it does not keep, and the five roles are fixed at the database', async () => {
    const a = await app();
    try {
      const r = CF.addValue(deps(a), ADMIN, { list: 'ROLE', code: 'INTRODUCER', label: 'An introducer' });
      assert.equal(r.ok, false);
      assert.throws(() => a.db.run(
        "INSERT INTO vocabularies (list, code, label, ord, active, fixed, source, created_at, updated_at) VALUES ('ROLE', 'INTRODUCER', 'x', 1, 1, 0, 'x', ?, ?)", [T0, T0]),
      /CHECK constraint/);
      assert.throws(() => a.db.run("INSERT INTO roles (role, description) VALUES ('INTRODUCER', 'x')"), /roles are fixed/);
      assert.throws(() => a.db.run("UPDATE roles SET description = 'x' WHERE role = 'SALES'"), /roles are fixed/);
      assert.throws(() => a.db.run("DELETE FROM roles WHERE role = 'CLIENT'"), /roles are fixed/);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM roles'), 6); // Phase 132e: READ_ONLY, by migration 026
    } finally { a.close(); }
  });

  test('THE RECIPROCITY KINDS stay reward model A’s: refused by the store and by the table', async () => {
    const a = await app();
    try {
      for (const code of Object.keys(T.RECIPROCITY_ACTIVITY_TYPES)) {
        const r = CF.addValue(deps(a), ADMIN, { list: 'ACTIVITY_TYPE', code, label: 'x' });
        assert.equal(r.ok, false);
        assert.equal(r.ok ? '' : r.why, CF.FORBIDDEN_SETTINGS['RECIPROCITY_KINDS']);
        assert.throws(() => a.db.run(
          "INSERT INTO vocabularies (list, code, label, ord, active, fixed, source, created_at, updated_at) VALUES ('ACTIVITY_TYPE', ?, 'x', 1, 1, 0, 'x', ?, ?)", [code, T0, T0]),
        /E_RECIPROCITY_RESERVED/);
      }
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE LISTS
 * ================================================================== */

describe('the lists — added, relabelled and retired, never deleted; a retired value kept where it is recorded and refused for anything new', () => {
  test('a new lead source is offered and taken; retired, it is refused for a new lead and kept on the lead that has it', async () => {
    const a = await app();
    try {
      const d = deps(a);
      assert.ok(CF.addValue(d, ADMIN, { list: 'LEAD_SOURCE', code: 'podcast', label: 'A podcast' }).ok, 'the code is taken in capitals');
      assert.equal(V.vocabulary(a.db, 'LEAD_SOURCE')['PODCAST'], 'A podcast');
      const lead = L.createLead(d, SALES, { prospect_organisation: 'Podcast Listener Limited', source: 'PODCAST' });
      assert.ok(lead.ok, lead.ok ? '' : lead.why);

      assert.ok(CF.changeValue(d, ADMIN, 'LEAD_SOURCE', 'PODCAST', { label: 'A podcast interview' }).ok);
      assert.ok(CF.changeValue(d, ADMIN, 'LEAD_SOURCE', 'PODCAST', { active: '0' }).ok);
      const changes = a.audit.entries().filter((e) => e.kind === 'CONFIGURATION_VALUE_CHANGED').map((e) => (e.detail as { fields: string[] }).fields);
      assert.deepEqual(changes, [['label'], ['active']]);
      assert.equal(a.audit.entries().filter((e) => e.kind === 'CONFIGURATION_VALUE_ADDED').length, 1);

      assert.equal(V.vocabulary(a.db, 'LEAD_SOURCE')['PODCAST'], undefined, 'a retired value is still offered');
      assert.match(V.vocabulary(a.db, 'LEAD_SOURCE', 'PODCAST')['PODCAST'] ?? '', /\(retired\)/, 'the record that has it does not show it');
      const again = L.createLead(d, SALES, { prospect_organisation: 'Late Listener Limited', source: 'PODCAST' });
      assert.equal(again.ok, false, 'a retired source was taken for a new lead');
      if (lead.ok) {
        const kept = L.updateLead(d, SALES, lead.id, { priority: 'HIGH' });
        assert.ok(kept.ok, kept.ok ? '' : kept.why);
        assert.equal(a.db.get<{ source: string }>('SELECT source FROM leads WHERE id = ?', [lead.id])?.source, 'PODCAST');
      }
      // Brought back by changing it, never by adding it again.
      assert.equal(CF.addValue(d, ADMIN, { list: 'LEAD_SOURCE', code: 'PODCAST', label: 'again' }).ok, false);
      assert.ok(CF.changeValue(d, ADMIN, 'LEAD_SOURCE', 'PODCAST', { active: '1' }).ok);
      assert.ok(L.createLead(d, SALES, { prospect_organisation: 'Returning Listener Limited', source: 'PODCAST' }).ok);
    } finally { a.close(); }
  });

  test('a value the application writes is never retired — by the store or at the table; no value is deleted and no code changes', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const r = CF.changeValue(d, ADMIN, 'LEAD_SOURCE', 'WEBSITE', { active: '0' });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /never retired/);
      assert.ok(CF.changeValue(d, ADMIN, 'LEAD_SOURCE', 'WEBSITE', { label: 'The website form' }).ok, 'a fixed value may still be relabelled');
      assert.throws(() => a.db.run("UPDATE vocabularies SET active = 0 WHERE list = 'LEAD_SOURCE' AND code = 'WEBSITE'"), /never retired/);
      assert.throws(() => a.db.run("DELETE FROM vocabularies WHERE list = 'LEAD_SOURCE' AND code = 'EVENT'"), /never deleted/);
      assert.throws(() => a.db.run("UPDATE vocabularies SET code = 'EVENTS' WHERE list = 'LEAD_SOURCE' AND code = 'EVENT'"), /permanent/);
      assert.throws(() => a.db.run("UPDATE vocabularies SET fixed = 1 WHERE list = 'LEAD_SOURCE' AND code = 'EVENT'"), /fixed by a migration/);
      assert.throws(() => CF.changeValue(d, ADMIN, 'LEAD_SOURCE', 'NOT_ON_IT', { active: '0' }));
    } finally { a.close(); }
  });

  test('a priority an active rule gives its tasks is not retired; unknown codes are refused at every table that names a list', async () => {
    const a = await app();
    try {
      const d = deps(a);
      assert.ok(CF.addValue(d, ADMIN, { list: 'PRIORITY', code: 'URGENT', label: 'Urgent' }).ok);
      const rule = A.createRule(d, ADMIN, {
        label: 'Urgent follow-up', trigger_event: 'LEAD_CREATED', effect: 'CREATE_TASK', task_title: 'Call today',
        task_activity_type: 'CALL', task_priority: 'URGENT', due_in_days: '0', assign_to: 'ROLE', assign_role: 'SALES',
      });
      assert.ok(rule.ok, rule.ok ? '' : rule.why);
      const r = CF.changeValue(d, ADMIN, 'PRIORITY', 'URGENT', { active: '0' });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /automation rule/);
      assert.equal(V.priorityRank(a.db)('URGENT') < V.priorityRank(a.db)('LOW'), true, 'a priority added last does not sort first');

      const lead = L.createLead(d, SALES, { prospect_organisation: 'Source Invented Limited', source: 'EVENT' });
      assert.ok(lead.ok, lead.ok ? '' : lead.why);
      assert.throws(() => a.db.run("UPDATE leads SET source = 'NOT_A_SOURCE' WHERE id = ?", [lead.ok ? lead.id : '']), /lead-source list/);
      const biz = randomUUID();
      assert.throws(() => a.db.run("INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,'NOT_A_SOURCE')",
        [biz, 'Nowhere Limited', 'dental', 'ASSESSMENT_SUBMITTED', T0]), /lead-source list/);
      a.db.run("INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,'EVENT')", [biz, 'Somewhere Limited', 'dental', 'ASSESSMENT_SUBMITTED', T0]);
      assert.throws(() => a.db.run("INSERT INTO properties (id,business_id,label,property_type,created_at) VALUES (?,?,?,'A castle',?)", [randomUUID(), biz, 'Site', T0]), /property-type list/);
      a.db.run("INSERT INTO properties (id,business_id,label,property_type,created_at) VALUES (?,?,?,'CARE_HOME',?)", [randomUUID(), biz, 'Site', T0]);
      assert.throws(() => a.db.run("INSERT INTO introducers (id, firm_name, introducer_type, created_via, created_at, updated_at) VALUES (?, 'x', 'NOT_A_TYPE', 'STAFF', ?, ?)", [randomUUID(), T0, T0]), /introducer-type list/);
    } finally { a.close(); }
  });

  test('the lost and exit reasons: added and relabelled; “other” is never retired', async () => {
    const a = await app();
    try {
      const d = deps(a);
      assert.ok(CF.addReason(d, ADMIN, { list: 'LEAD_LOST', code: 'NO_BUDGET', label: 'No budget this year' }).ok);
      assert.ok(CF.changeReason(d, ADMIN, 'LEAD_LOST', 'NO_BUDGET', { label: 'No budget this financial year' }).ok);
      assert.equal(CF.changeReason(d, ADMIN, 'LEAD_LOST', 'OTHER', { active: '0' }).ok, false);
      assert.equal(CF.addReason(d, ADMIN, { list: 'CLIENT_TYPES', code: 'X_Y', label: 'x' }).ok, false);
      const kinds = a.audit.entries().map((e) => e.kind).filter((k) => k === 'REASON_ADDED' || k === 'REASON_CHANGED');
      assert.deepEqual(kinds, ['REASON_ADDED', 'REASON_CHANGED']);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * A RULE THAT ASKS FOR A DOCUMENT
 * ================================================================== */

describe('a rule that asks the client for a document — through createDocumentRequest, and only for what something can receive', () => {
  function organisation(a: App): { business: string; claim: string } {
    const business = randomUUID();
    a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, 'Request Invented Limited', 'dental', 'ASSESSMENT_SUBMITTED', T0]);
    const property = randomUUID();
    a.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
    const assessment = randomUUID();
    a.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
      [assessment, business, 'dental', T0, 100_00, 200_00, T0]);
    const made = C.insertClaim(a.db, a.now, randomUUID, {
      business_id: business, property_id: property, assessment_id: assessment, workstream: 'UNKNOWN', stage: 'SURVEY', owner_id: null, surveyor_id: null,
    });
    P.recordOpened(deps(a), null, made.id, 'SURVEY', 'a test fixture');
    return { business, claim: made.id };
  }

  test('refused for a type nothing can receive, on a document request, and at the table; run by ADMIN it raises the request; with no one to raise it, or on a do-not-contact organisation, it does not', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const receivable = a.db.get<{ code: string }>('SELECT code FROM document_types WHERE handler_type IS NOT NULL AND active = 1 ORDER BY ord LIMIT 1')?.code;
      const unreceivable = a.db.get<{ code: string }>('SELECT code FROM document_types WHERE handler_type IS NULL AND active = 1 ORDER BY ord LIMIT 1')?.code;
      assert.ok(receivable !== undefined && unreceivable !== undefined, 'the seeded document types have both kinds');
      const input = {
        label: 'Ask for the lease', trigger_event: 'STAGE_ENTERED', trigger_stage: 'VALUATION', effect: 'REQUEST_DOCUMENT',
        request_type: receivable, task_title: 'The valuation reads the lease term', task_description: 'The valuation', due_in_days: '7',
      };

      const none = A.createRule(d, ADMIN, { ...input, request_type: unreceivable });
      assert.equal(none.ok, false);
      assert.ok(!none.ok && none.why.includes(NO_RECEIPT_POLICY), 'the refusal does not say why');
      assert.equal(A.createRule(d, ADMIN, { ...input, trigger_event: 'DOCUMENT_REQUESTED', trigger_stage: null }).ok, false, 'a document request raised a rule that raises one');
      assert.equal(A.createRule(d, ADMIN, { ...input, task_description: null }).ok, false, 'a request that does not say what it holds up');

      const rule = A.createRule(d, ADMIN, input);
      assert.ok(rule.ok, rule.ok ? '' : rule.why);
      if (!rule.ok) return;
      assert.throws(() => a.db.run('UPDATE automation_rules SET request_type = ? WHERE id = ?', [unreceivable, rule.id]), /E_NO_RECEIPT_POLICY/);
      assert.throws(() => a.db.run("UPDATE automation_rules SET trigger_event = 'DOCUMENT_REQUESTED', trigger_stage = NULL WHERE id = ?", [rule.id]), /CHECK constraint/);
      assert.throws(() => a.db.run("UPDATE automation_rules SET effect = 'CREATE_TASK' WHERE id = ?", [rule.id]), /CHECK constraint/);

      const org = organisation(a);
      const requests = () => count(a, "SELECT COUNT(*) AS n FROM client_tasks WHERE business_id = ? AND kind = 'DOCUMENT'", [org.business]);
      const mine = (out: readonly A.RunOutcome[]) => out.filter((o) => o.rule_id === rule.id).map((o) => [o.outcome, o.reason]);

      assert.deepEqual(mine(A.fireAutomation(d, null, { trigger: 'STAGE_ENTERED', claim_id: org.claim, stage: 'VALUATION' })), [['NOT_RUN', 'NO_ONE_TO_RAISE_THE_REQUEST']]);
      assert.equal(requests(), 0);

      assert.deepEqual(mine(A.fireAutomation(d, ADMIN, { trigger: 'STAGE_ENTERED', claim_id: org.claim, stage: 'VALUATION' })), [['RAN', null]]);
      assert.equal(requests(), 1);
      const made = a.db.get<{ requested_type: string; why: string; holds_up: string; due_on: string; claim_id: string; state: string }>(
        "SELECT requested_type, why, holds_up, due_on, claim_id, state FROM client_tasks WHERE business_id = ? AND kind = 'DOCUMENT'", [org.business]);
      assert.deepEqual(JSON.parse(JSON.stringify(made)), {
        requested_type: receivable, why: 'The valuation reads the lease term', holds_up: 'The valuation',
        due_on: T.addDaysToDate(localDate(a.now()), 7), claim_id: org.claim, state: 'OPEN',
      });
      assert.equal(a.audit.entries().filter((e) => e.kind === 'DOCUMENT_REQUESTED').length, 1, 'the request was not raised through createDocumentRequest');

      a.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [org.business]);
      assert.deepEqual(mine(A.fireAutomation(d, ADMIN, { trigger: 'STAGE_ENTERED', claim_id: org.claim, stage: 'VALUATION' })), [['NOT_RUN', 'DO_NOT_CONTACT']]);
      assert.equal(requests(), 1, 'a rule wrote to a do-not-contact organisation');
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * MERGING A FIRM
 * ================================================================== */

describe('merging a firm — leads, people and open tasks move under one merge row; nothing moves outside one', () => {
  test('ADMIN alone; the database refuses a move without a merge; the merge moves what it says, keeps what it says, and is audited', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const referral = I.intakeReferral(d, SALES, {
        firm_name: 'Ledger and Co', introducer_type: 'ACCOUNTANT_FIRM', contact_name: 'Pat Partner', contact_email: 'pat@ledger.example.invalid',
        prospect_organisation: 'Meadow Dental Limited', prospect_sector: 'dental', prospect_postcode: 'zz9 9zz',
        prospect_event: 'PURCHASE', prospect_event_year: '2021',
      }, 'STAFF');
      assert.ok(referral.ok, referral.ok ? '' : referral.why);
      if (!referral.ok) return;
      const from = a.db.get<{ introducer_id: string }>('SELECT introducer_id FROM leads WHERE id = ?', [referral.id])?.introducer_id ?? '';
      const into = I.createIntroducer(d, SALES, { firm_name: 'Ledger & Co', introducer_type: 'ACCOUNTANT_FIRM' });
      assert.ok(into.ok);
      if (!into.ok) return;
      const task = (title: string) => {
        T.insertTask(a.db, a.now, randomUUID, {
          title, description: null, owner_id: 'u-SALES', owner_role: null, due_on: null, priority: null, activity_type: 'CALL',
          business_id: null, property_id: null, claim_id: null, lead_id: null, introducer_id: from, contact_id: null, fact_id: null,
          recurrence: null, recurred_from_id: null, is_next_action: false, origin: 'STAFF', automation_run_id: null, created_by: 'u-SALES',
        });
        return a.db.get<{ id: string }>('SELECT id FROM staff_tasks WHERE title = ?', [title])?.id ?? '';
      };
      const open = task('Call the partner');
      const closed = task('An old call');
      const cancelled = T.setTaskStatus(d, SALES, closed, 'CANCELLED', 'made in error');
      assert.ok(cancelled.ok, cancelled.ok ? '' : cancelled.why);
      const people = count(a, 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id = ?', [from]);
      assert.ok(people > 0);

      assert.throws(() => I.mergeIntroducer(d, SALES, from, { into_id: into.id, reason: 'the same firm' }), NotAuthorised);
      assert.throws(() => a.db.run('UPDATE contacts SET introducer_id = ? WHERE introducer_id = ?', [into.id, from]), /stays at that introducer/);
      assert.throws(() => a.db.run('UPDATE introducers SET merged_into_id = ?, merged_at = ?, merged_by = ? WHERE id = ?', [into.id, T0, 'u-ADMIN', from]), /only by a merge/);
      assert.throws(() => a.db.run('INSERT INTO introducer_merges (id, from_id, into_id, reason, merged_by, started_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), from, into.id, 'x', 'u-SALES', T0]), /by an administrator/);
      assert.equal(I.mergeIntroducer(d, ADMIN, from, { into_id: from, reason: 'the same firm' }).ok, false, 'a firm merged onto itself');
      assert.equal(I.mergeIntroducer(d, ADMIN, from, { into_id: into.id, reason: '' }).ok, false, 'a merge with no reason');
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM introducer_merges'), 0, 'a refused merge left a row');

      const merged = I.mergeIntroducer(d, ADMIN, from, { into_id: into.id, reason: 'The public form made a second row for Ledger & Co' });
      assert.ok(merged.ok, merged.ok ? '' : merged.why);
      assert.equal(a.db.get<{ introducer_id: string }>('SELECT introducer_id FROM leads WHERE id = ?', [referral.id])?.introducer_id, into.id);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id = ?', [from]), 0);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id = ?', [into.id]), people);
      assert.equal(a.db.get<{ introducer_id: string }>('SELECT introducer_id FROM staff_tasks WHERE id = ?', [open])?.introducer_id, into.id);
      assert.equal(a.db.get<{ introducer_id: string }>('SELECT introducer_id FROM staff_tasks WHERE id = ?', [closed])?.introducer_id, from, 'a closed task moved');
      assert.deepEqual(JSON.parse(JSON.stringify(a.db.get('SELECT merged_into_id, merged_by, notice_contact_id FROM introducers WHERE id = ?', [from]))),
        { merged_into_id: into.id, merged_by: 'u-ADMIN', notice_contact_id: null });
      assert.deepEqual(JSON.parse(JSON.stringify(a.db.get('SELECT leads_moved, people_moved, tasks_moved, completed_at IS NOT NULL AS done FROM introducer_merges WHERE from_id = ?', [from]))),
        { leads_moved: 1, people_moved: people, tasks_moved: 1, done: 1 });
      const audit = a.audit.entries().filter((e) => e.kind === 'INTRODUCER_MERGED');
      assert.equal(audit.length, 1);
      assert.deepEqual(audit[0]?.detail, { merge: (audit[0]?.detail as { merge: string }).merge, from, into: into.id, leads: 1, people, tasks: 1, closed_tasks_kept: 1 });
      assert.equal(a.db.all('SELECT * FROM pragma_foreign_key_check').length, 0);

      // Once merged, it stays merged; nothing is merged onto it; the merge row is never edited or deleted.
      assert.equal(I.mergeIntroducer(d, ADMIN, from, { into_id: into.id, reason: 'again' }).ok, false);
      const third = I.createIntroducer(d, SALES, { firm_name: 'Third Firm LLP' });
      assert.ok(third.ok);
      if (third.ok) assert.equal(I.mergeIntroducer(d, ADMIN, third.id, { into_id: from, reason: 'onto a merged firm' }).ok, false);
      assert.throws(() => a.db.run('UPDATE introducers SET merged_into_id = NULL WHERE id = ?', [from]), /stays merged/);
      assert.throws(() => a.db.run('DELETE FROM introducer_merges'), /never deleted/);
      assert.throws(() => a.db.run("UPDATE introducer_merges SET reason = 'changed'"), /recorded once/);
      // After the merge the person stays where the merge put them.
      assert.throws(() => a.db.run('UPDATE contacts SET introducer_id = ? WHERE introducer_id = ?', [from, into.id]), /stays at that introducer/);

      const view = I.introducerView(a.db, ADMIN, from, a.now());
      assert.equal(view.merged_into?.id, into.id);
      assert.equal(view.merge, undefined, 'a merged firm is offered a merge');
      const target = I.introducerView(a.db, ADMIN, into.id, a.now());
      assert.equal(target.merge?.choices.some((c) => c.id === from), false, 'a merged firm is offered as a target');
      assert.equal(I.introducerView(a.db, SALES, into.id, a.now()).merge, undefined, 'SALES was offered the merge');
    } finally { a.close(); }
  });

  test('a firm with a fee recorded against it is refused: money is never moved by a merge', async () => {
    const a = await app();
    try {
      const d = deps(a);
      const from = I.createIntroducer(d, SALES, { firm_name: 'Northgate Accountants LLP' });
      const into = I.createIntroducer(d, SALES, { firm_name: 'Northgate Chartered Accountants' });
      assert.ok(from.ok && into.ok);
      if (!from.ok || !into.ok) return;
      const business = randomUUID();
      a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, 'Fee Invented Limited', 'dental', 'ASSESSMENT_SUBMITTED', T0]);
      const assessment = randomUUID();
      a.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
        [assessment, business, 'dental', T0, 100_00, 200_00, T0]);
      const claim = C.insertClaim(a.db, a.now, randomUUID, {
        business_id: business, property_id: null, assessment_id: assessment, workstream: 'UNKNOWN', stage: 'SURVEY', owner_id: null, surveyor_id: null,
      });
      // No fee can exist while reward model B is off, and it ships off. This test's own database lifts the two insert
      // triggers to place one, so that what is tested is the merge's own refusal and not the switch.
      a.db.execDdl('DROP TRIGGER introducer_fees_only_under_model_b; DROP TRIGGER introducer_fees_referred_by_that_firm;');
      a.db.run("INSERT INTO introducer_fees (id, introducer_id, claim_id, business_id, amount_pence, state, created_at, updated_at) VALUES (?, ?, ?, ?, 150000, 'ACCRUED', ?, ?)",
        [randomUUID(), from.id, claim.id, business, T0, T0]);
      const r = I.mergeIntroducer(d, ADMIN, from.id, { into_id: into.id, reason: 'The same firm' });
      assert.equal(r.ok, false);
      assert.match(r.ok ? '' : r.why, /never moved by a merge/);
      assert.equal(count(a, 'SELECT COUNT(*) AS n FROM introducer_merges'), 0);
      assert.equal(a.db.get<{ introducer_id: string }>('SELECT introducer_id FROM introducer_fees')?.introducer_id, from.id);
      assert.equal(a.db.get<{ merged_into_id: string | null }>('SELECT merged_into_id FROM introducers WHERE id = ?', [from.id])?.merged_into_id, null);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * MIGRATION 019, READ BACK
 * ================================================================== */

describe('migration 019 — the rebuilt tables keep every trigger, and the replaced pairs are in place by name', () => {
  test('introducers, automation_rules and the list pairs, by name; the seeded rules kept; no foreign key broken', async () => {
    const a = await app();
    try {
      const on = (table: string) => a.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? ORDER BY name", [table]).map((x) => x.name);
      assert.deepEqual(on('introducers'), [
        'introducers_created_via_fixed', 'introducers_merged_once', 'introducers_merged_only_by_a_merge', 'introducers_never_deleted',
        'introducers_not_onto_a_merged_firm', 'introducers_notice_contact_is_the_firms_insert', 'introducers_notice_contact_is_the_firms_update',
        'introducers_type_insert', 'introducers_type_update',
      ]);
      assert.deepEqual(on('automation_rules'), [
        'automation_rules_activity_insert', 'automation_rules_activity_update', 'automation_rules_never_deleted',
        'automation_rules_request_receivable_insert', 'automation_rules_request_receivable_update', 'automation_rules_stage_insert', 'automation_rules_stage_update',
      ]);
      assert.deepEqual(on('vocabularies'), [
        'vocabularies_code_is_permanent', 'vocabularies_fixed_is_fixed', 'vocabularies_fixed_stays_active', 'vocabularies_never_deleted', 'vocabularies_reciprocity_reserved',
      ]);
      assert.deepEqual(on('introducer_merges'), ['introducer_merges_by_an_administrator', 'introducer_merges_completed_once', 'introducer_merges_never_deleted']);
      assert.deepEqual(on('roles'), ['roles_fixed_delete', 'roles_fixed_insert', 'roles_fixed_update']);
      const all = new Set(a.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('trigger','index')").map((x) => x.name));
      for (const name of [
        'businesses_source_insert', 'businesses_source_update', 'leads_source_insert', 'leads_source_update',
        'staff_tasks_vocabulary_insert', 'staff_tasks_vocabulary_update', 'properties_property_type_insert', 'properties_property_type_update',
        'contacts_introducer_fixed', 'leads_introducer_exists_insert', 'leads_introducer_exists_update', 'introducer_merges_from_once_uq',
      ]) assert.ok(all.has(name), `${name} is missing`);
      assert.equal(count(a, "SELECT COUNT(*) AS n FROM automation_rules WHERE id = 'rule-lead-first-follow-up'"), 1, 'a seeded rule was lost in the rebuild');
      assert.deepEqual(a.db.all('SELECT * FROM pragma_foreign_key_check'), []);
      const lists = a.db.all<{ list: string; n: number }>('SELECT list, COUNT(*) AS n FROM vocabularies GROUP BY list ORDER BY list').map((x) => x.list);
      assert.deepEqual(lists, ['ACTIVITY_TYPE', 'INTRODUCER_TYPE', 'LEAD_SOURCE', 'PRIORITY', 'PROPERTY_TYPE']);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE SCREEN, OVER HTTP
 * ================================================================== */

describe('the admin settings screen — the lists, the reasons, the folded screens, and the finance and compliance settings', () => {
  test('ADMIN sees and writes it all; SALES reads the lists alone; ACCOUNTING and SURVEYING are refused; the refusal route records and changes nothing', async () => {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-config-')) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    try {
      const addr = made.server.address();
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
      const s = await seed(made.app.db, made.app.hasher, made.app.now);
      const signIn = async (role: string) => {
        const r = await fetch(`${base}/login`, {
          method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ email: `${role.toLowerCase()}@example.invalid`, password: s.password }).toString(),
        });
        assert.equal(r.status, 303);
        const cookie = r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
        return {
          get: async (path: string) => { const x = await fetch(base + path, { redirect: 'manual', headers: { cookie } }); return { status: x.status, body: await x.text() }; },
          post: async (path: string, f: Record<string, string>) => {
            const x = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
            return { status: x.status, body: await x.text() };
          },
        };
      };
      const db = made.app.db;

      const admin = await signIn('ADMIN');
      const pageHtml = (await admin.get('/staff/admin-settings')).body;
      for (const heading of ['Finance settings', 'Compliance settings', 'Document types', 'Automation rules', 'Email templates', 'What a setting may not change']) {
        // Phase 133b: each is a section of the left-hand section list, headed by an <h2>, where it was a panel headed by a div.
        assert.match(pageHtml, new RegExp(`<section class="tabpanel card" id="[a-z-]+"><h2 class="sechead">${heading}</h2>`), `the screen draws no ${heading}`);
      }
      assert.match((await admin.get('/staff')).body, /href="\/staff\/admin-settings"/, 'the navigation does not link the settings');
      const view = JSON.parse((await admin.get('/staff/admin-settings/view.json')).body) as CF.ConfigurationView;
      assert.equal(view.lists.length, 5);
      assert.equal(view.reasons.length, 2);
      assert.ok(view.finance !== undefined && view.compliance !== undefined && view.compliance.length === 2);
      assert.equal(view.may_write, true);
      assert.equal((await admin.post('/staff/admin-settings/values', { list: 'LEAD_SOURCE', code: 'TRADE_SHOW', label: 'A trade show' })).status, 303);
      assert.equal(db.get<{ label: string }>("SELECT label FROM vocabularies WHERE list = 'LEAD_SOURCE' AND code = 'TRADE_SHOW'")?.label, 'A trade show');

      const before = JSON.stringify(SNAPSHOT.map((sql) => db.all(sql)));
      const asked = await admin.post('/staff/admin-settings/setting', { setting: 'PAID_REGISTER_GATE' });
      assert.notEqual(asked.status, 303, 'a refusal redirected as though saved');
      assert.ok(asked.body.includes('Not a setting'));
      assert.equal(made.app.audit.entries().filter((e) => e.kind === 'CONFIGURATION_REFUSED').length, 1);
      assert.equal(JSON.stringify(SNAPSHOT.map((sql) => db.all(sql))), before);

      const sales = await signIn('SALES');
      const salesView = JSON.parse((await sales.get('/staff/admin-settings/view.json')).body) as CF.ConfigurationView;
      assert.equal(salesView.may_write, false);
      assert.equal(salesView.finance, undefined);
      assert.equal(salesView.compliance, undefined);
      assert.doesNotMatch((await sales.get('/staff/admin-settings')).body, /Ask to change one anyway/);
      assert.equal((await sales.post('/staff/admin-settings/values', { list: 'LEAD_SOURCE', code: 'SALES_ADDED', label: 'x' })).status, 403);
      assert.equal((await sales.post('/staff/admin-settings/setting', { setting: 'PAID_REGISTER_GATE' })).status, 403);
      const firm = db.get<{ id: string }>('SELECT id FROM introducers ORDER BY rowid LIMIT 1')?.id ?? 'no-firm';
      assert.equal((await sales.post(`/staff/introducers/${firm}/merge`, { into_id: firm, reason: 'x' })).status, 403);

      for (const role of ['ACCOUNTING', 'SURVEYING']) {
        const who = await signIn(role);
        for (const path of ['/staff/admin-settings', '/staff/admin-settings/view.json']) {
          assert.equal((await who.get(path)).status, 403, `${role} opened ${path}`);
        }
      }
      assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM vocabularies WHERE code = 'SALES_ADDED'")?.n, 0);
    } finally {
      await new Promise<void>((r) => made.server.close(() => r()));
      made.close();
    }
  });
});
