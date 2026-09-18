/**
 * CRM 5 OF 10 — INTRODUCERS AND THE REFERRAL CHANNEL. 11 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                                  → WHO MAY DO WHAT
 *   "an introducer is NEVER a user and has no login"       → NEVER A USER
 *   "enforce the reference with a named trigger pair"      → THE SCHEMA
 *   "a lead with source ACCOUNTANT and the introducer set … NO PERSON … converts
 *    only once linked"                                     → REFERRAL INTAKE
 *   "its route SHIPS OFF until the privacy notice is published"
 *                                                          → THE PUBLIC FORM
 *   "a test proves nothing is queued when it is false AND when it was never asked"
 *                                                          → THE OPT-IN, BOTH WAYS
 *   "a reasoned negative is told … under the same opt-in and no other way"
 *                                                          → THE REASONED NEGATIVE
 *   "the switch refuses to turn on while clause 1 of the letter is blank"
 *                                                          → THE REWARD MODEL
 *   "derived by query, never stored"                       → THE DASHBOARD
 *   "N4 … assert both"                                     → throughout, marked N4
 *   "capture what the close returns when it answers 404, and fix what races"
 *                                                          → THE FLAKE
 *
 * EVERY REFUSAL HAS ITS NEGATIVE CONTROL: the same act, with the missing thing
 * supplied, succeeds. A refusal that could not have been a success proves nothing.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, NotAuthorised, type Actor, type Obj } from '../src/authz.ts';
import * as I from '../src/web/introducers.ts';
import * as L from '../src/web/leads.ts';
import * as P from '../src/web/pipeline.ts';
import * as T from '../src/web/tasks.ts';
import { actor, testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));
const PASSWORD = 'a-very-long-development-password';
const T0 = '2026-09-08T00:00:00.000Z';
const SCRIPT = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const PARTNER_EMAIL = 'pat@ledger.example.invalid';

type App = Awaited<ReturnType<typeof testApp>>;
type Deps = I.IntroducerDeps;

function deps(app: { db: App['db']; audit: App['audit']; now: App['now'] }): Deps {
  return { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
}

/** A row from node:sqlite has no prototype and a literal does; compare what they say, not what they are made of. */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function staffUsers(db: App['db'], hash = 'fake$x'): void {
  for (const role of APP_ROLES.filter((r) => r !== 'CLIENT')) {
    db.run(
      'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, hash, T0, T0]);
  }
}

async function app(): Promise<App> {
  const a = await testApp();
  staffUsers(a.db);
  return a;
}

const SALES = actor('SALES');
const ADMIN = actor('ADMIN');
const ACCOUNTING = actor('ACCOUNTING');
const SURVEYING = actor('SURVEYING');

/** A referral from a new accountancy firm, as SALES records it, with every property basic given. */
function refer(a: App, overrides: Record<string, string | null> = {}): { lead: string; firm: string } {
  const r = I.intakeReferral(deps(a), SALES, {
    firm_name: 'Ledger & Co', introducer_type: 'ACCOUNTANT_FIRM', contact_name: 'Pat Partner', contact_email: PARTNER_EMAIL,
    prospect_organisation: 'Meadow Dental Limited', prospect_sector: 'dental', prospect_postcode: 'zz9 9zz',
    prospect_event: 'PURCHASE', prospect_event_year: '2021', ...overrides,
  }, 'STAFF');
  assert.ok(r.ok, r.ok ? '' : r.why);
  const firm = a.db.get<{ introducer_id: string }>('SELECT introducer_id FROM leads WHERE id = ?', [r.id])?.introducer_id;
  assert.ok(firm);
  return { lead: r.id, firm };
}

function business(a: App, name: string): string {
  const id = randomUUID();
  a.db.run('INSERT INTO businesses (id,name,sector,stage,created_at,source) VALUES (?,?,?,?,?,?)', [id, name, 'dental', 'ASSESSMENT_SUBMITTED', T0, 'WEBSITE']);
  return id;
}

/** The enquiry gate passed and the lead converted onto an organisation — the claim opens at ASSESSMENT. */
function convert(a: App, lead: string, biz: string): string {
  const d = deps(a);
  for (const check_key of Object.keys(P.ENQUIRY_CHECKS)) {
    const r = P.recordEnquiryCheck(d, SALES, { lead_id: lead }, { check_key, answer: 'YES', note: null });
    assert.equal(r.ok, true);
  }
  const q = L.updateLead(d, SALES, lead, { status: 'QUALIFIED' });
  assert.ok(q.ok, q.ok ? '' : q.why);
  const c = L.convertLead(d, SALES, lead, { business_id: biz });
  assert.ok(c.ok, c.ok ? '' : c.why);
  return c.id;
}

/** ENGAGEMENT → DATA_GATHERING through the real gate: a signed letter, and the next action carried on the move. */
function engage(a: App, claim: string, biz: string): P.MoveResult {
  a.db.run('UPDATE claims SET stage = ? WHERE id = ?', ['ENGAGEMENT', claim]);
  a.db.run(
    'INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(business_id) DO UPDATE SET letter_state = excluded.letter_state, signed_at = excluded.signed_at',
    [randomUUID(), biz, 'SIGNED', T0, T0]);
  return P.moveClaim(deps(a), SALES, claim, {
    kind: 'FORWARD', to: 'DATA_GATHERING', next_action: { title: 'Gather the data', owner_id: 'u-SALES', due_on: '2026-12-31' },
  });
}

function share(a: App, lead: string, decision: string): void {
  const r = I.recordShareConsent(deps(a), SALES, lead, { decision, wording_version: I.CURRENT_SHARE_WORDING });
  assert.ok(r.ok, r.ok ? '' : r.why);
}

function outboxTo(a: App, email: string): { subject: string; body: string; kind: string; sent_at: string | null }[] {
  return plain(a.db.all('SELECT subject, body, kind, sent_at FROM outbox WHERE lower(to_email) = lower(?) ORDER BY created_at', [email]));
}

function notices(a: App, lead: string): { notice: string; outcome: string; reason: string | null }[] {
  return plain(a.db.all('SELECT notice, outcome, reason FROM introducer_notices WHERE lead_id = ? ORDER BY rowid', [lead]));
}

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

describe('WHO MAY DO WHAT — twelve new actions, deny by default, every role not granted refused', () => {
  const GRANTS: Readonly<Record<string, readonly AppRole[]>> = {
    'introducer.enter': ['ADMIN', 'SALES', 'ACCOUNTING'],
    'introducer.read': ['ADMIN', 'SALES'],
    'introducer.read_value': ['ADMIN', 'SALES'],
    'introducer.read_money': ['ADMIN', 'ACCOUNTING'],
    'introducer.write': ['ADMIN', 'SALES'],
    'share_consent.read': ['ADMIN', 'SALES'],
    'share_consent.record': ['ADMIN', 'SALES'],
    'introducer_reward.read': ['ADMIN', 'SALES', 'ACCOUNTING'],
    'introducer_reward.switch': ['ADMIN'],
    'introducer_fee.read': ['ADMIN', 'SALES', 'ACCOUNTING'],
    'introducer_fee.disclose': ['ADMIN', 'SALES'],
    'introducer_fee.record_settled': ['ADMIN', 'ACCOUNTING'],
  };
  const objFor = (action: string): Obj => action.startsWith('share_consent') ? { type: 'share_consent', id: 'l1', business_id: 'b1' }
    : action.startsWith('introducer_reward') ? { type: 'introducer_reward', id: 'the-setting' }
      : action.startsWith('introducer_fee') ? { type: 'introducer_fee', id: 'f1', business_id: 'b1' }
        : { type: 'introducer', id: 'i1' };

  test('each role on each action, a client on its own organisation included, and a disabled user refused everything', () => {
    for (const [action, granted] of Object.entries(GRANTS)) {
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const who = actor(role, `u-${role}`, 'b1');
        assert.equal(can(who, action, objFor(action)), granted.includes(role), `${role} on ${action}`);
      }
      assert.equal(can({ ...actor('ADMIN'), disabled: true }, action, objFor(action)), false, `a disabled admin on ${action}`);
    }
  });

  test('the store refuses what the table refuses: a surveyor cannot open the section, a sales person cannot switch the reward, accounting cannot record a referral', async () => {
    const a = await app();
    try {
      assert.throws(() => I.introducerList(a.db, SURVEYING, a.now()), NotAuthorised);
      assert.throws(() => I.setRewardModel(deps(a), SALES, { model: 'OFF' }), NotAuthorised);
      assert.throws(() => I.intakeReferral(deps(a), ACCOUNTING, { firm_name: 'x', prospect_organisation: 'y' }, 'STAFF'), NotAuthorised);
      // Negative control: the same list for SALES, and the same switch for ADMIN.
      assert.deepEqual(I.introducerList(a.db, SALES, a.now()), []);
      assert.equal(I.setRewardModel(deps(a), ADMIN, { model: 'OFF' }).ok, true);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * NEVER A USER
 * ================================================================== */

describe('an introducer is a firm and never a user', () => {
  test('a referral creates a firm, a person of type INTRODUCER on it, and no login — and no role or action reaches a firm’s person', async () => {
    const a = await app();
    try {
      const users = a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n;
      const { firm } = refer(a);
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n, users, 'a referral made a user');
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users WHERE email_canonical = ?', [PARTNER_EMAIL])?.n, 0);
      const person = a.db.get<{ contact_type: string; business_id: string | null; lead_id: string | null }>(
        'SELECT contact_type, business_id, lead_id FROM contacts WHERE introducer_id = ?', [firm]);
      assert.deepEqual(plain(person), { contact_type: 'INTRODUCER', business_id: null, lead_id: null });
      for (const table of ['introducers', 'introducer_share_consents', 'introducer_notices', 'introducer_fees', 'introducer_reward_setting']) {
        const cols = a.db.all<{ name: string }>('SELECT name FROM pragma_table_info(?)', [table]).map((c) => c.name);
        assert.equal(cols.some((c) => /password|login|session|role/.test(c)), false, `${table} carries something a login would need`);
      }
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE SCHEMA
 * ================================================================== */

describe('THE SCHEMA — migration 014', () => {
  test('it creates the five introducer tables and rebuilds two, and nothing else: no event, timeline or activity table', () => {
    const sql = readFileSync(join(MIGRATIONS, '014-introducers-and-referrals.sql'), 'utf8');
    assert.deepEqual([...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]).sort(), [
      '_fk_check_guard', 'contacts_new', 'introducer_fees', 'introducer_notices', 'introducer_reward_setting',
      'introducer_share_consents', 'introducers', 'staff_tasks_new',
    ]);
  });

  test('the named trigger pair is leads.introducer_id’s foreign key: a firm that does not exist is refused on insert and update, and a firm is never deleted', async () => {
    const a = await app();
    try {
      const { lead, firm } = refer(a);
      assert.throws(() => a.db.run('UPDATE leads SET introducer_id = ? WHERE id = ?', ['no-such-firm', lead]), /must name an introducer that exists/);
      assert.throws(() => a.db.run(
        "INSERT INTO leads (id, origin, source, introducer_id, prospect_organisation, lead_date, status, created_at, updated_at) VALUES (?, 'REFERRAL', 'ACCOUNTANT', 'no-such-firm', 'X', ?, 'NEW', ?, ?)",
        [randomUUID(), T0, T0, T0]), /must name an introducer that exists/);
      assert.throws(() => a.db.run('DELETE FROM introducers WHERE id = ?', [firm]), /never deleted/);
      // A lead a firm referred came by referral, at the database too.
      assert.throws(() => a.db.run("UPDATE leads SET source = 'WEBSITE' WHERE id = ?", [lead]), /came by referral/);
      // Negative control: a firm that exists is accepted.
      const other = I.createIntroducer(deps(a), SALES, { firm_name: 'Other & Co' });
      assert.ok(other.ok);
      a.db.run('UPDATE leads SET introducer_id = ? WHERE id = ?', [other.id, lead]);
      assert.equal(a.db.all('SELECT * FROM pragma_foreign_key_check').length, 0);
    } finally { a.close(); }
  });

  test('a person at a firm is on the firm alone and typed INTRODUCER; a task on a firm is about the firm alone; its contact is the firm’s own', async () => {
    const a = await app();
    try {
      const { firm } = refer(a);
      const biz = business(a, 'Someone Limited');
      assert.throws(() => a.db.run(
        "INSERT INTO contacts (id, business_id, introducer_id, full_name, contact_consent, marketing_optin, contact_type, created_at) VALUES (?, ?, ?, 'X', 0, 0, 'INTRODUCER', ?)",
        [randomUUID(), biz, firm, T0]), /CHECK constraint/);
      assert.throws(() => a.db.run(
        "INSERT INTO contacts (id, introducer_id, full_name, contact_consent, marketing_optin, contact_type, created_at) VALUES (?, ?, 'X', 0, 0, 'ACCOUNTANT', ?)",
        [randomUUID(), firm, T0]), /CHECK constraint/);
      const person = a.db.get<{ id: string }>('SELECT id FROM contacts WHERE introducer_id = ?', [firm]);
      assert.ok(person);
      assert.throws(() => a.db.run('UPDATE contacts SET introducer_id = NULL, business_id = ? WHERE id = ?', [biz, person.id]), /stays at that introducer/);

      const base: T.TaskInsert = {
        title: 'A call', description: null, owner_id: 'u-SALES', owner_role: null, due_on: null, priority: null, activity_type: 'CALL',
        business_id: null, property_id: null, claim_id: null, lead_id: null, introducer_id: firm, contact_id: null, fact_id: null,
        recurrence: null, recurred_from_id: null, is_next_action: false, origin: 'STAFF', automation_run_id: null, created_by: 'u-SALES',
      };
      assert.throws(() => T.insertTask(a.db, a.now, randomUUID, { ...base, business_id: biz }), /CHECK constraint/);
      const theirs = I.createIntroducer(deps(a), SALES, { firm_name: 'Another Firm' });
      assert.ok(theirs.ok);
      assert.throws(() => T.insertTask(a.db, a.now, randomUUID, { ...base, introducer_id: theirs.id, contact_id: person.id }), /own organisation/);
      // Negative control: the firm's own task, naming the firm's own person.
      T.insertTask(a.db, a.now, randomUUID, { ...base, contact_id: person.id });
      const names = a.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE tbl_name = 'staff_tasks' AND type = 'trigger' ORDER BY name").map((r) => r.name);
      assert.deepEqual(names, [
        'staff_tasks_closed_is_final', 'staff_tasks_contact_belongs_insert', 'staff_tasks_contact_belongs_update',
        'staff_tasks_lead_same_organisation_insert', 'staff_tasks_lead_same_organisation_update', 'staff_tasks_never_deleted',
        'staff_tasks_reciprocity_under_model_a_insert', 'staff_tasks_reciprocity_under_model_a_update',
        'staff_tasks_vocabulary_insert', 'staff_tasks_vocabulary_update',
      ]);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * REFERRAL INTAKE
 * ================================================================== */

describe('REFERRAL INTAKE — a lead with no person, the firm set, and conversion only once linked', () => {
  test('SALES records a referral: origin REFERRAL, source ACCOUNTANT derived from the firm, the introducer set, the name, sector and basics, and no person on the lead', async () => {
    const a = await app();
    try {
      const { lead, firm } = refer(a);
      const row = a.db.get<Record<string, unknown>>(
        'SELECT business_id, origin, source, introducer_id, prospect_organisation, prospect_sector, prospect_postcode, prospect_event, prospect_event_year, status FROM leads WHERE id = ?', [lead]);
      assert.deepEqual(plain(row), {
        business_id: null, origin: 'REFERRAL', source: 'ACCOUNTANT', introducer_id: firm, prospect_organisation: 'Meadow Dental Limited',
        prospect_sector: 'dental', prospect_postcode: 'ZZ9 9ZZ', prospect_event: 'PURCHASE', prospect_event_year: 2021, status: 'NEW',
      });
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM contacts WHERE lead_id = ?', [lead])?.n, 0, 'a person was put on the lead');
      assert.equal(a.db.get<{ notice_contact_id: string | null }>('SELECT notice_contact_id FROM introducers WHERE id = ?', [firm])?.notice_contact_id !== null, true);
      // Audited with ids, never a name.
      const lines = a.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind IN ('LEAD_CREATED','INTRODUCER_CREATED','CONTACT_CREATED')");
      assert.ok(lines.length >= 3);
      for (const l of lines) assert.equal(/Pat|Partner|Meadow|Ledger|ledger\.example/.test(l.detail), false, `a name reached the audit log: ${l.detail}`);
      // The lead page reads the firm's name, and the basics as given.
      const v = L.leadView(a.db, SALES, lead);
      assert.equal(v.introducer?.introducer.name, 'Ledger & Co');
      assert.deepEqual(v.property_basics, { postcode: 'ZZ9 9ZZ', event: 'A property purchase', year: 2021 });
    } finally { a.close(); }
  });

  test('N4: nothing but the client business’s name is required — a sector, a postcode, an event and a year not given are not given, and never become a value', async () => {
    const a = await app();
    try {
      const { lead } = refer(a, { prospect_sector: null, prospect_postcode: null, prospect_event: null, prospect_event_year: null, contact_name: null, contact_email: null });
      assert.deepEqual(plain(a.db.get('SELECT prospect_sector, prospect_postcode, prospect_event, prospect_event_year FROM leads WHERE id = ?', [lead])),
        { prospect_sector: null, prospect_postcode: null, prospect_event: null, prospect_event_year: null });
      assert.equal(L.leadView(a.db, SALES, lead).property_basics, undefined, 'basics nobody gave were drawn as if given');
      const none = I.intakeReferral(deps(a), SALES, { firm_name: 'Ledger & Co', prospect_organisation: null }, 'STAFF');
      assert.equal(none.ok, false);
      const bad = I.intakeReferral(deps(a), SALES, { firm_name: 'Ledger & Co', prospect_organisation: 'X', prospect_postcode: 'NOT A POSTCODE' }, 'STAFF');
      assert.equal(bad.ok, false);
    } finally { a.close(); }
  });

  test('the source is derived from the firm: a tax adviser refers as ADVISER, and a firm whose kind is not recorded refers as REFERRAL', async () => {
    const a = await app();
    try {
      const adviser = refer(a, { firm_name: 'Adviser LLP', introducer_type: 'TAX_ADVISER' });
      const unknown = refer(a, { firm_name: 'Unknown LLP', introducer_type: null });
      assert.equal(a.db.get<{ source: string }>('SELECT source FROM leads WHERE id = ?', [adviser.lead])?.source, 'ADVISER');
      assert.equal(a.db.get<{ source: string }>('SELECT source FROM leads WHERE id = ?', [unknown.lead])?.source, 'REFERRAL');
      assert.equal(a.db.get<{ introducer_type: string | null }>('SELECT introducer_type FROM introducers WHERE id = ?', [unknown.firm])?.introducer_type, null);
    } finally { a.close(); }
  });

  test('a referral converts only once linked to an organisation — and then its name, sector and basics give way to the organisation’s, and the firm stays', async () => {
    const a = await app();
    try {
      const { lead, firm } = refer(a);
      const d = deps(a);
      for (const check_key of Object.keys(P.ENQUIRY_CHECKS)) P.recordEnquiryCheck(d, SALES, { lead_id: lead }, { check_key, answer: 'YES', note: null });
      assert.ok(L.updateLead(d, SALES, lead, { status: 'QUALIFIED' }).ok);
      const refused = L.convertLead(d, SALES, lead, {});
      assert.equal(refused.ok, false);
      assert.match(refused.ok ? '' : refused.why, /no organisation yet/);
      const claim = L.convertLead(d, SALES, lead, { business_id: business(a, 'Meadow Dental Limited') });
      assert.ok(claim.ok);
      assert.deepEqual(plain(a.db.get('SELECT status, introducer_id, prospect_organisation, prospect_sector, prospect_postcode, prospect_event, prospect_event_year FROM leads WHERE id = ?', [lead])),
        { status: 'CONVERTED', introducer_id: firm, prospect_organisation: null, prospect_sector: null, prospect_postcode: null, prospect_event: null, prospect_event_year: null });
    } finally { a.close(); }
  });

  test('a lead from the website is attributed to a firm only with a referral source, and a firm offered to a reader of introducers', async () => {
    const a = await app();
    try {
      const firm = I.createIntroducer(deps(a), SALES, { firm_name: 'Ledger & Co' });
      assert.ok(firm.ok);
      const made = L.createLead(deps(a), SALES, { prospect_organisation: 'Walk-in Limited', source: 'WEBSITE' });
      assert.ok(made.ok);
      assert.equal(L.updateLead(deps(a), SALES, made.id, { introducer_id: firm.id }).ok, false);
      assert.ok(L.updateLead(deps(a), SALES, made.id, { introducer_id: firm.id, source: 'ACCOUNTANT' }).ok);
      assert.equal(L.updateLead(deps(a), SALES, made.id, { introducer_id: 'no-such-firm' }).ok, false);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE PUBLIC FORM
 * ================================================================== */

async function serve(opts: { referralForm?: { enabled: boolean; requires: string } } = {}): Promise<{
  made: Awaited<ReturnType<typeof createApp>>; base: string; close(): void;
  post(path: string, fields: Record<string, string>, cookie?: string): Promise<{ status: number; body: string; cookie: string }>;
  get(path: string, cookie?: string): Promise<{ status: number; body: string }>;
}> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-intro-')), ...opts });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  return {
    made, base, close: made.close,
    async post(path, fields, cookie = '') {
      const r = await fetch(base + path, {
        method: 'POST', redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie === '' ? {} : { cookie }) },
        body: new URLSearchParams(fields).toString(),
      });
      return { status: r.status, body: await r.text(), cookie: r.headers.getSetCookie().map((x) => x.split(';')[0] ?? '').join('; ') };
    },
    async get(path, cookie = '') {
      const r = await fetch(base + path, { redirect: 'manual', headers: cookie === '' ? {} : { cookie } });
      return { status: r.status, body: await r.text() };
    },
  };
}

const PUBLIC_REFERRAL = {
  firm_name: 'Ledger & Co', contact_name: 'Pat Partner', contact_email: PARTNER_EMAIL, prospect_organisation: 'Meadow Dental Limited',
  prospect_sector: 'dental', attest: 'on',
};

describe('THE PUBLIC REFERRAL FORM SHIPS OFF', () => {
  test('as shipped, /refer does not exist: GET and POST answer exactly as a path that does not exist, draw no form, and write nothing', async () => {
    const s = await serve();
    try {
      assert.equal(I.referralFormOpen(), false);
      const counts = (): string => JSON.stringify(['introducers', 'leads', 'contacts'].map((t) =>
        s.made.app.db.get<{ n: number }>(t === 'introducers' ? 'SELECT COUNT(*) AS n FROM introducers' : t === 'leads' ? 'SELECT COUNT(*) AS n FROM leads' : 'SELECT COUNT(*) AS n FROM contacts')?.n));
      const before = counts();
      // Exactly as a path that does not exist — to a visitor with no session, the server's own 401 before its 404.
      const nowhere = await s.get('/no-such-route-anywhere');
      assert.notEqual(nowhere.status, 200);
      const off = await s.get('/refer');
      assert.equal(off.status, nowhere.status);
      assert.equal(off.body.includes('name="attest"'), false, 'the shut form was drawn');
      assert.equal((await s.post('/refer', PUBLIC_REFERRAL)).status, (await s.post('/no-such-route-anywhere', PUBLIC_REFERRAL)).status);
      assert.equal(counts(), before);
    } finally { s.close(); }
  });

  test('with its gate opened, it is the funnel’s hardened path: the client’s agreement confirmed or nothing, a new firm row never matched to one recorded, and every value escaped', async () => {
    const s = await serve({ referralForm: { enabled: true, requires: 'a test' } });
    try {
      const db = s.made.app.db;
      const page = await s.get('/refer');
      assert.equal(page.status, 200);
      assert.match(page.body, /name="attest"/);
      const noAgreement = await s.post('/refer', { ...PUBLIC_REFERRAL, attest: '' });
      assert.equal(noAgreement.status, 400);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leads')?.n, 0);

      staffUsers(db);
      const known = I.createIntroducer(deps(s.made.app), SALES, { firm_name: 'Ledger & Co' });
      assert.ok(known.ok);
      const ok = await s.post('/refer', { ...PUBLIC_REFERRAL, firm_name: 'Ledger & Co' });
      assert.equal(ok.status, 200);
      const made = db.get<{ id: string; created_via: string; introducer_type: string }>(
        "SELECT id, created_via, introducer_type FROM introducers WHERE created_via = 'PUBLIC_FORM'");
      assert.ok(made);
      assert.notEqual(made.id, known.id, 'a public form attached itself to a firm already recorded');
      assert.equal(made.introducer_type, 'ACCOUNTANT_FIRM');
      assert.deepEqual(plain(db.get('SELECT origin, source, business_id FROM leads WHERE introducer_id = ?', [made.id])),
        { origin: 'REFERRAL', source: 'ACCOUNTANT', business_id: null });

      const xss = await s.post('/refer', { ...PUBLIC_REFERRAL, firm_name: SCRIPT, attest: '' });
      assert.equal(xss.status, 400);
      assert.equal(xss.body.includes('<script>alert(1)</script>'), false);
    } finally { s.close(); }
  });
});

/* ================================================================== *
 * THE OPT-IN, BOTH WAYS
 * ================================================================== */

describe('SHARING PROGRESS — nothing reaches the firm unless the client said yes', () => {
  async function engagedWith(decision: 'NEVER_ASKED' | 'DECLINED' | 'GIVEN' | 'WITHDRAWN'): Promise<{ a: App; lead: string; claim: string; biz: string }> {
    const a = await app();
    const { lead } = refer(a);
    const biz = business(a, 'Meadow Dental Limited');
    const claim = convert(a, lead, biz);
    if (decision === 'DECLINED') share(a, lead, 'DECLINED');
    if (decision === 'GIVEN') share(a, lead, 'GIVEN');
    if (decision === 'WITHDRAWN') { share(a, lead, 'GIVEN'); share(a, lead, 'WITHDRAWN'); }
    const moved = engage(a, claim, biz);
    assert.ok(moved.ok, moved.ok ? '' : moved.why);
    return { a, lead, claim, biz };
  }

  test('N4, BOTH: never asked and a no queue nothing at the engaged stage — identically — and a yes queues exactly one notice', async () => {
    const never = await engagedWith('NEVER_ASKED');
    const no = await engagedWith('DECLINED');
    const yes = await engagedWith('GIVEN');
    try {
      assert.deepEqual(outboxTo(never.a, PARTNER_EMAIL), []);
      assert.deepEqual(outboxTo(no.a, PARTNER_EMAIL), []);
      const engagedNever = notices(never.a, never.lead).filter((n) => n.notice === 'ENGAGED');
      const engagedNo = notices(no.a, no.lead).filter((n) => n.notice === 'ENGAGED');
      assert.deepEqual(engagedNever, [{ notice: 'ENGAGED', outcome: 'NOT_QUEUED', reason: 'NO_OPT_IN' }]);
      assert.deepEqual(engagedNo, engagedNever, 'never asked and a no were told apart');

      const sent = outboxTo(yes.a, PARTNER_EMAIL);
      const engaged = sent.filter((m) => /Engaged/.test(m.subject));
      assert.equal(engaged.length, 1);
      assert.equal(engaged[0]?.kind, 'NOTIFICATION');
      assert.equal(engaged[0]?.sent_at, null, 'the stub sent something');
      assert.equal(/Pat|Partner|£|\d{2},\d{3}/.test(engaged[0]?.body ?? ''), false, 'a person or a figure reached the firm');
      assert.deepEqual(notices(yes.a, yes.lead).filter((n) => n.notice === 'ENGAGED'), [{ notice: 'ENGAGED', outcome: 'QUEUED', reason: null }]);
    } finally { never.a.close(); no.a.close(); yes.a.close(); }
  });

  test('a yes withdrawn shares nothing more; and a notice already queued is not queued again when its stage is entered again', async () => {
    const w = await engagedWith('WITHDRAWN');
    const y = await engagedWith('GIVEN');
    try {
      assert.deepEqual(outboxTo(w.a, PARTNER_EMAIL).filter((m) => /Engaged/.test(m.subject)), []);
      I.onClaimStageEntered(deps(y.a), SALES, y.claim, 'DATA_GATHERING');
      assert.equal(outboxTo(y.a, PARTNER_EMAIL).filter((m) => /Engaged/.test(m.subject)).length, 1);
    } finally { w.a.close(); y.a.close(); }
  });

  test('a yes on a referral with no claim yet tells the firm it is referred — once, however often the yes is recorded', async () => {
    const a = await app();
    try {
      const { lead } = refer(a);
      assert.deepEqual(notices(a, lead), [{ notice: 'REFERRED', outcome: 'NOT_QUEUED', reason: 'NO_OPT_IN' }], 'the referral was not kept as due');
      share(a, lead, 'GIVEN');
      share(a, lead, 'GIVEN');
      assert.equal(outboxTo(a, PARTNER_EMAIL).length, 1);
      assert.match(outboxTo(a, PARTNER_EMAIL)[0]?.subject ?? '', /Referred/);
    } finally { a.close(); }
  });

  test('a yes still queues nothing where nobody at the firm can receive it, or where the client is marked do not contact', async () => {
    const noAddress = await app();
    const dnc = await app();
    try {
      const n = refer(noAddress, { contact_name: null, contact_email: null });
      share(noAddress, n.lead, 'GIVEN');
      assert.deepEqual(notices(noAddress, n.lead).slice(-1), [{ notice: 'REFERRED', outcome: 'NOT_QUEUED', reason: 'NO_ADDRESS' }]);

      const d = refer(dnc);
      const biz = business(dnc, 'Meadow Dental Limited');
      const claim = convert(dnc, d.lead, biz);
      share(dnc, d.lead, 'GIVEN');
      dnc.db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", [biz]);
      const before = outboxTo(dnc, PARTNER_EMAIL).length;
      assert.ok(engage(dnc, claim, biz).ok);
      assert.equal(outboxTo(dnc, PARTNER_EMAIL).length, before);
      assert.deepEqual(notices(dnc, d.lead).slice(-1), [{ notice: 'ENGAGED', outcome: 'NOT_QUEUED', reason: 'DO_NOT_CONTACT' }]);
    } finally { noAddress.close(); dnc.close(); }
  });

  test('the database refuses a queued notice whose opt-in is a no, or a yes the client has since withdrawn — and accepts one under the client’s current yes', async () => {
    const a = await app();
    try {
      const { lead, firm } = refer(a);
      const outbox = (): string => {
        const id = randomUUID();
        a.db.run('INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, transport, business_id) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)',
          [id, T0, PARTNER_EMAIL, 'x', 'x', 'NOTIFICATION', 'STUB']);
        return id;
      };
      const queue = (notice: string, consent: string): void => { a.db.run(
        "INSERT INTO introducer_notices (id, introducer_id, lead_id, claim_id, notice, outcome, reason, consent_id, outbox_id, at) VALUES (?, ?, ?, NULL, ?, 'QUEUED', NULL, ?, ?, ?)",
        [randomUUID(), firm, lead, notice, consent, outbox(), T0]); };
      const latest = (): string => a.db.get<{ id: string }>('SELECT id FROM introducer_share_consents WHERE lead_id = ? ORDER BY rowid DESC LIMIT 1', [lead])?.id ?? '';
      share(a, lead, 'DECLINED');
      assert.throws(() => queue('ENGAGED', latest()), /E_NO_OPT_IN/);
      share(a, lead, 'GIVEN');
      const given = latest();
      share(a, lead, 'WITHDRAWN');
      assert.throws(() => queue('ENGAGED', given), /E_NO_OPT_IN/);
      share(a, lead, 'GIVEN');
      queue('ENGAGED', latest());
      assert.throws(() => a.db.run('DELETE FROM introducer_share_consents'), /append-only/);
    } finally { a.close(); }
  });

  test('an opt-in is recorded only for a firm that referred the client, only with the words on the page, and never assumed', async () => {
    const a = await app();
    try {
      const { lead } = refer(a);
      const other = I.createIntroducer(deps(a), SALES, { firm_name: 'Other & Co' });
      assert.ok(other.ok);
      assert.throws(() => a.db.run(
        "INSERT INTO introducer_share_consents (id, introducer_id, lead_id, decision, wording_version, route, recorded_by, recorded_at) VALUES (?, ?, ?, 'GIVEN', 'SHARE-PROGRESS-1', 'STAFF_RECORDED', 'u-SALES', ?)",
        [randomUUID(), other.id, lead, T0]), /a firm that referred them/);
      assert.equal(I.recordShareConsent(deps(a), SALES, lead, { decision: null, wording_version: I.CURRENT_SHARE_WORDING }).ok, false);
      assert.equal(I.recordShareConsent(deps(a), SALES, lead, { decision: 'GIVEN', wording_version: 'SHARE-PROGRESS-0' }).ok, false);
      const walkIn = L.createLead(deps(a), SALES, { prospect_organisation: 'Walk-in Limited', source: 'WEBSITE' });
      assert.ok(walkIn.ok);
      assert.equal(I.recordShareConsent(deps(a), SALES, walkIn.id, { decision: 'GIVEN', wording_version: I.CURRENT_SHARE_WORDING }).ok, false);
      assert.equal(I.shareReading(a.db, { id: lead, business_id: null, introducer_id: null }).shares, false);
    } finally { a.close(); }
  });

  test('every notice the paper names maps onto the procedure stage whose entry is its event, and back', () => {
    assert.deepEqual(Object.fromEntries(Object.entries(I.NOTICES).map(([k, n]) => [k, n.stage])), {
      REFERRED: 'ENQUIRY', RANGE_ISSUED: 'ASSESSMENT', ENGAGED: 'DATA_GATHERING', REPORT_DELIVERED: 'INVOICE',
      FEE_SETTLED: 'DEFENCE_PACK', REASONED_NEGATIVE: 'REASONED_NEGATIVE',
    });
    for (const [k, n] of Object.entries(I.NOTICES)) assert.equal(I.noticeForStage(n.stage), k);
    assert.equal(I.noticeForStage('SURVEY'), null);
  });
});

/* ================================================================== *
 * THE REASONED NEGATIVE
 * ================================================================== */

describe('THE REASONED NEGATIVE — told to the firm under the same opt-in, and no other way', () => {
  test('an exit to a reasoned negative queues nothing without the yes, and with it queues the listed reason and never the note', async () => {
    for (const decision of ['NEVER_ASKED', 'GIVEN'] as const) {
      const a = await app();
      try {
        const { lead } = refer(a);
        const biz = business(a, 'Meadow Dental Limited');
        const claim = convert(a, lead, biz);
        if (decision === 'GIVEN') share(a, lead, 'GIVEN');
        assert.ok(engage(a, claim, biz).ok);
        const exit = P.moveClaim(deps(a), SALES, claim, {
          kind: 'EXIT', to: 'REASONED_NEGATIVE', reason_code: 'ADVISER_DIRECTED_NEGATIVE', reason: 'Spoke to Jane Doe at the practice',
        });
        assert.ok(exit.ok, exit.ok ? '' : exit.why);
        const told = outboxTo(a, PARTNER_EMAIL).filter((m) => /Reasoned negative/.test(m.subject));
        if (decision === 'NEVER_ASKED') {
          assert.deepEqual(told, []);
          assert.deepEqual(notices(a, lead).slice(-1), [{ notice: 'REASONED_NEGATIVE', outcome: 'NOT_QUEUED', reason: 'NO_OPT_IN' }]);
        } else {
          assert.equal(told.length, 1);
          assert.match(told[0]?.body ?? '', /The tax adviser directed a reasoned negative/);
          assert.equal((told[0]?.body ?? '').includes('Jane Doe'), false, 'the staff note reached the firm');
        }
      } finally { a.close(); }
    }
  });

  test('no other route addresses a firm: a template merge reaches only the claim’s own organisation’s contacts, never a person at a firm', async () => {
    const a = await app();
    try {
      const { firm } = refer(a);
      const person = a.db.get<{ id: string }>('SELECT id FROM contacts WHERE introducer_id = ?', [firm]);
      assert.ok(person);
      const reachable = a.db.all<{ id: string }>('SELECT id FROM contacts WHERE business_id IS NOT NULL OR lead_id IS NOT NULL').map((c) => c.id);
      assert.equal(reachable.includes(person.id), false);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE REWARD MODEL
 * ================================================================== */

describe('THE REWARD MODEL — both built, both off, and the switch refuses while clause 1 is blank', () => {
  test('it ships off; the real letter’s clause 1 has a blank; A and B are refused and the refusal is audited; OFF is always allowed', async () => {
    const a = await app();
    try {
      assert.equal(I.rewardSetting(a.db).model, 'OFF');
      const blanks = I.clauseOneBlanks();
      assert.ok(blanks.length > 0, 'the premise: clause 1 of the letter, read from the .docx, still has a square-bracket blank');
      for (const model of ['A_RECIPROCITY', 'B_DISCLOSED_FEE']) {
        const r = I.setRewardModel(deps(a), ADMIN, { model, fee_pounds: '500' });
        assert.equal(r.ok, false);
        assert.match(r.ok ? '' : r.why, /clause 1/);
        assert.equal(I.rewardSetting(a.db).model, 'OFF');
      }
      const refusals = a.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'INTRODUCER_REWARD_SWITCHED' AND outcome = 'REFUSED'");
      assert.equal(refusals.length, 2);
      assert.ok(refusals.every((x) => JSON.parse(x.detail).reason === 'CLAUSE_1_BLANK'));
      assert.equal(I.REWARD_QUESTION, 'Is anything paid to the accountant?');
      // Negative control: a letter whose clause 1 is complete lets it on.
      assert.ok(I.setRewardModel(deps(a), ADMIN, { model: 'A_RECIPROCITY' }, { openTerms: [] }).ok);
      assert.equal(I.rewardSetting(a.db).model, 'A_RECIPROCITY');
      assert.ok(I.setRewardModel(deps(a), ADMIN, { model: 'OFF' }).ok);
    } finally { a.close(); }
  });

  test('model A: reciprocity is refused while A is off — by the store and by the database — and logged as a task on the firm once it is on', async () => {
    const a = await app();
    try {
      const { firm } = refer(a);
      const cpd = { kind: 'CPD_SESSION', title: 'A CPD session on capital allowances basics' };
      assert.equal(I.logContact(deps(a), SALES, firm, cpd).ok, false);
      const raw: T.TaskInsert = {
        title: 'x', description: null, owner_id: 'u-SALES', owner_role: null, due_on: null, priority: null, activity_type: 'CPD_SESSION',
        business_id: null, property_id: null, claim_id: null, lead_id: null, introducer_id: firm, contact_id: null, fact_id: null,
        recurrence: null, recurred_from_id: null, is_next_action: false, origin: 'STAFF', automation_run_id: null, created_by: 'u-SALES',
      };
      assert.throws(() => T.insertTask(a.db, a.now, randomUUID, raw), /E_REWARD_OFF/);
      assert.ok(I.setRewardModel(deps(a), ADMIN, { model: 'A_RECIPROCITY' }, { openTerms: [] }).ok);
      // Even under A, reciprocity belongs on a firm and on nothing else.
      const biz = business(a, 'Someone Limited');
      assert.throws(() => T.insertTask(a.db, a.now, randomUUID, { ...raw, introducer_id: null, business_id: biz }), /E_REWARD_OFF/);
      const logged = I.logContact(deps(a), SALES, firm, cpd);
      assert.ok(logged.ok, logged.ok ? '' : logged.why);
      assert.deepEqual(plain(a.db.get('SELECT activity_type, status, introducer_id, business_id FROM staff_tasks WHERE id = ?', [logged.id])),
        { activity_type: 'CPD_SESSION', status: 'COMPLETED', introducer_id: firm, business_id: null });
      assert.match(I.introducerView(a.db, SALES, firm, a.now()).details?.last_contact.label ?? '', /cpd session/i);
    } finally { a.close(); }
  });

  test('model B: nothing accrues while B is off; under B a referred claim that closes accrues the fixed fee to the firm; nothing is payable before the disclosure, by the store and the database', async () => {
    const a = await app();
    try {
      const { lead, firm } = refer(a);
      const biz = business(a, 'Meadow Dental Limited');
      const claim = convert(a, lead, biz);
      I.onClaimStageEntered(deps(a), SALES, claim, 'CLOSED');
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM introducer_fees')?.n, 0);
      assert.throws(() => a.db.run(
        "INSERT INTO introducer_fees (id, introducer_id, claim_id, business_id, amount_pence, state, created_at, updated_at) VALUES (?, ?, ?, ?, 50000, 'ACCRUED', ?, ?)",
        [randomUUID(), firm, claim, biz, T0, T0]), /E_REWARD_OFF/);

      assert.equal(I.setRewardModel(deps(a), ADMIN, { model: 'B_DISCLOSED_FEE' }, { openTerms: [] }).ok, false, 'model B without its fixed fee');
      assert.ok(I.setRewardModel(deps(a), ADMIN, { model: 'B_DISCLOSED_FEE', fee_pounds: '500' }, { openTerms: [] }).ok);
      I.onClaimStageEntered(deps(a), SALES, claim, 'CLOSED');
      I.onClaimStageEntered(deps(a), SALES, claim, 'CLOSED');
      const fee = a.db.get<{ id: string; amount_pence: number; introducer_id: string; state: string }>('SELECT id, amount_pence, introducer_id, state FROM introducer_fees WHERE claim_id = ?', [claim]);
      assert.deepEqual(fee && { amount_pence: fee.amount_pence, introducer_id: fee.introducer_id, state: fee.state }, { amount_pence: 50000, introducer_id: firm, state: 'ACCRUED' });
      assert.equal(a.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM introducer_fees')?.n, 1, 'one fee per claim');
      assert.ok(fee);
      const cols = a.db.all<{ name: string }>("SELECT name FROM pragma_table_info('introducer_fees')").map((c) => c.name);
      assert.equal(cols.some((c) => /contact|person|name|email/.test(c)), false, 'a fee row could name a person');

      const early = I.recordFeeSettled(deps(a), ACCOUNTING, fee.id);
      assert.equal(early.ok, false);
      assert.throws(() => a.db.run("UPDATE introducer_fees SET state = 'PAID', paid_at = ?, paid_recorded_by = 'u-ACCOUNTING' WHERE id = ?", [T0, fee.id]), /CHECK constraint/);
      assert.equal(I.feeList(a.db, ACCOUNTING)[0]?.payable, false);
      assert.throws(() => I.recordFeeDisclosure(deps(a), ACCOUNTING, fee.id), NotAuthorised);
      assert.ok(I.recordFeeDisclosure(deps(a), SALES, fee.id).ok);
      assert.equal(I.feeList(a.db, ACCOUNTING)[0]?.payable, true);
      assert.ok(I.recordFeeSettled(deps(a), ACCOUNTING, fee.id).ok);
      assert.throws(() => a.db.run('UPDATE introducer_fees SET disclosure_given_at = NULL, disclosure_recorded_by = NULL WHERE id = ?', [fee.id]), /final|stays given/);
      assert.equal(a.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'INTRODUCER_FEE_PAID' AND outcome = 'REFUSED'")?.n, 1);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * THE DASHBOARD
 * ================================================================== */

describe('THE DASHBOARD — derived by query, never stored, and built forwards for each role', () => {
  test('leads referred, claims opened and won, reasoned negatives counted apart; the value for SALES and the money for ACCOUNTING, each and nothing else', async () => {
    const a = await app();
    try {
      const first = refer(a);
      const firm = first.firm;
      const second = I.intakeReferral(deps(a), SALES, { introducer_id: firm, prospect_organisation: 'Second Clinic Limited' }, 'STAFF');
      const third = I.intakeReferral(deps(a), SALES, { introducer_id: firm, prospect_organisation: 'Third Surgery Limited' }, 'STAFF');
      assert.ok(second.ok && third.ok);
      const bizA = business(a, 'Meadow Dental Limited');
      const bizB = business(a, 'Second Clinic Limited');
      const won = convert(a, first.lead, bizA);
      const negative = convert(a, second.id, bizB);
      a.db.run("UPDATE claims SET stage = 'CLOSED', completed_at = ? WHERE id = ?", [T0, won]);
      a.db.run("UPDATE claims SET stage = 'REASONED_NEGATIVE' WHERE id = ?", [negative]);
      // CRM 7 of 10: THE REFERRED CLAIM'S OWN invoice, and money recorded as received against it. An invoice on the
      // organisation from before invoices sat on the claim is not the firm's referral, and is not counted.
      const onWon = CF.claimInvoiceRow(a, bizA, won, { fee_pence: 150000 });
      a.db.run("INSERT INTO invoice_payments (id, invoice_id, received_on, amount_pence, method, bank_details_confirmed, recorded_by, recorded_at) VALUES (?, ?, '2026-09-08', 50000, 'BANK_TRANSFER', NULL, 'u-ACCOUNTING', ?)",
        [randomUUID(), onWon, T0]);
      a.db.run("INSERT INTO invoices (id, business_id, claim_value_pence, fee_pence, invoice_status, payment_status, vat_position, created_at) VALUES (?, ?, NULL, 999900, 'SENT', 'PAID', 'NOT_REGISTERED', ?)", [randomUUID(), bizA, T0]);
      // A claim's invoice always carries its fee — the table refuses one without — so none of them is ever counted as nought.
      assert.throws(() => a.db.run("INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, vat_position, vat_setting_id, vat_pence, invoice_date, due_basis, fee_basis, raised_by, created_at) VALUES (?, ?, ?, 'FEE', 1, NULL, 0.05, 'RAISED', 'UNPAID', 'x', 'finance-setting-vat-position-2026-08-28', 0, '2026-09-08', 'x', 'x', 'u-ACCOUNTING', ?)",
        [randomUUID(), bizA, won, T0]), /CHECK constraint/);

      const sales = I.introducerView(a.db, SALES, firm, a.now());
      assert.deepEqual(sales.pipeline, { leads_referred: 3, claims_opened: 2, claims_won: 1, reasoned_negatives: 1 });
      // N4: the won claim carries no sealed estimate, so the value is not known — never nought — and it is counted.
      assert.match(sales.value?.estimated_allowances ?? '', /^not known/);
      assert.equal(sales.value?.claims_without_estimate, 1);
      assert.equal(sales.value?.claims_with_estimate, 0);
      assert.equal(sales.money, undefined, 'SALES reached the money');

      const accounting = I.introducerView(a.db, ACCOUNTING, firm, a.now());
      assert.deepEqual(Object.keys(accounting).sort(), ['fees', 'firm_name', 'id', 'may_write', 'money', 'reward']);
      assert.match(accounting.money?.fees_invoiced ?? '', /1,500/);
      assert.match(accounting.money?.fees_paid ?? '', /£500/, 'the money recorded as received against the referred claim’s invoice');
      assert.equal(accounting.money?.invoices_counted, 1, 'an invoice on the organisation, not on the referred claim, was counted');
      assert.equal(accounting.money?.invoices_without_a_fee, 0);
      assert.deepEqual(Object.keys(I.introducerList(a.db, ACCOUNTING, a.now())[0] ?? {}).sort(), ['firm_name', 'id', 'money']);

      assert.throws(() => I.introducerView(a.db, SURVEYING, firm, a.now()), NotAuthorised);
      const cols = a.db.all<{ name: string }>("SELECT name FROM pragma_table_info('introducers')").map((c) => c.name);
      assert.equal(cols.some((c) => /count|referred|opened|won|negative|value|fee|paid|invoic|last_contact|next_contact/.test(c)), false,
        `a figure is stored on the firm: ${cols.join(', ')}`);
    } finally { a.close(); }
  });

  test('the last contact and the next are tasks on the firm: a logged call, and a planned contact overdue by the UK date', async () => {
    const a = await app();
    try {
      const { firm } = refer(a);
      assert.match(I.introducerView(a.db, SALES, firm, a.now()).details?.next_contact.label ?? '', /not planned/);
      assert.ok(I.logContact(deps(a), SALES, firm, { kind: 'CALL', title: 'Introduced the service' }).ok);
      const planned = I.planContact(deps(a), SALES, firm, { kind: 'MEETING', title: 'Offer the one-pager', owner_id: 'u-SALES', due_on: '2026-09-01' });
      assert.ok(planned.ok, planned.ok ? '' : planned.why);
      assert.equal(I.planContact(deps(a), SALES, firm, { kind: 'MEETING', title: 'No owner', due_on: '2026-09-01' }).ok, false);
      const v = I.introducerView(a.db, SALES, firm, a.now());
      assert.match(v.details?.last_contact.label ?? '', /call/i);
      assert.equal(v.details?.next_contact.overdue, true);
      assert.equal(v.contact_log?.length, 2);
      // The planned contact is an ordinary task: it is on its owner's list, and "about" names the firm.
      const mine = T.myWork(a.db, SALES, a.now()).tasks.find((t) => t.id === planned.id);
      assert.ok(mine);
      assert.deepEqual(mine.about.map((x) => x.kind), ['introducer']);
    } finally { a.close(); }
  });
});

/* ================================================================== *
 * OVER HTTP
 * ================================================================== */

describe('OVER HTTP — escaped, and refused to a surveyor', () => {
  test('SALES opens the firm and the lead: a firm’s name and notes carrying a script are escaped; SURVEYING is refused every introducer route', async () => {
    const s = await serve();
    try {
      const db = s.made.app.db;
      staffUsers(db, await s.made.app.hasher.hash(PASSWORD));
      const signIn = async (role: string): Promise<string> => {
        const r = await s.post('/login', { email: `${role.toLowerCase()}@example.invalid`, password: PASSWORD });
        assert.equal(r.status, 303);
        return r.cookie;
      };
      const firm = I.createIntroducer(deps(s.made.app), SALES, { firm_name: SCRIPT, notes: SCRIPT });
      assert.ok(firm.ok);
      const lead = I.intakeReferral(deps(s.made.app), SALES, { introducer_id: firm.id, prospect_organisation: 'Escaped Clinic Limited' }, 'STAFF');
      assert.ok(lead.ok);
      const sales = await signIn('SALES');
      for (const path of ['/staff/introducers', `/staff/introducers/${firm.id}`, `/staff/leads/${lead.id}`]) {
        const page = await s.get(path, sales);
        assert.equal(page.status, 200, path);
        assert.equal(page.body.includes('<script>alert(1)</script>'), false, `a script tag reached ${path}`);
        assert.equal(/<img[\s>]/i.test(page.body), false, `an unescaped img tag reached ${path}`);
        assert.match(page.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, `the value was not drawn at all on ${path}`);
      }
      assert.match((await s.get(`/staff/leads/${lead.id}`, sales)).body, /share-progress/);

      const surveyor = await signIn('SURVEYING');
      for (const path of ['/staff/introducers', `/staff/introducers/${firm.id}`, `/staff/introducers/${firm.id}/view.json`, '/staff/introducer-rewards']) {
        assert.equal((await s.get(path, surveyor)).status, 403, path);
      }
      assert.equal((await s.post(`/staff/leads/${lead.id}/share-progress`, { decision: 'GIVEN', wording_version: I.CURRENT_SHARE_WORDING }, surveyor)).status, 403);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM introducer_share_consents')?.n, 0);
    } finally { s.close(); }
  });
});

/* ================================================================== *
 * THE FLAKE
 * ================================================================== */

describe('THE FLAKE — every server a test starts binds 127.0.0.1 itself', () => {
  test('no test file and not the payload proof listens on every address, where another program on 127.0.0.1 could take its requests', () => {
    const files = [
      ...readdirSync(HERE).filter((f) => f.endsWith('.test.ts')).map((f) => join(HERE, f)),
      fileURLToPath(new URL('../tools/payload-proof.ts', import.meta.url)),
    ];
    let listening = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\.listen\(0,([^)]*)\)/g)) {
        listening++;
        assert.match(m[1] ?? '', /'127\.0\.0\.1'/, `${f} listens on every address: ${m[0]}`);
      }
    }
    assert.ok(listening >= 14, `the search found only ${listening} listening servers — it is blind`);
  });
});

void (null as unknown as Actor);
