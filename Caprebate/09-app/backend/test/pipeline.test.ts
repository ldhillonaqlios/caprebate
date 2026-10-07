/**
 * CRM 2 OF 10 — THE CLAIM PIPELINE: THE OPERATING PROCEDURE'S TEN STAGES, THEIR
 * GATES AND THEIR EXITS. 10 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a skip test per gate"                       → EVERY GATE, one test each that tries to skip it
 *   "exits keep the row"                         → EXITS KEEP THE RECORD
 *   "the payload proof"                          → tools/payload-proof.ts, and SURVEYING over HTTP here
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                         → WHO MAY DO WHAT
 *   "stages.ts MAPS ... write the mapping down"  → MAP, DO NOT INVENT — read against the procedure's own file
 *   "REPLACE THOSE TWO TRIGGERS ... never rebuild the claims table"
 *                                                → THE VOCABULARY, and MIGRATION 010's CONVERSION
 *   "make claimSurveyors read it"                → SURVEYOR REACH
 *   "keep the engaged-client list's tests passing; record the decision"
 *                                                → THE ORGANISATION'S STAGE — raised, never lowered
 *
 * EVERY SKIP TEST ENDS WITH ITS NEGATIVE CONTROL: the same move, with the gate's
 * record in place, succeeds. A refusal that could not have been a success proves
 * nothing about the gate.
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { Db, migrate } from '../src/db.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, REGISTERED_ACTIONS, NotAuthorised, type Obj } from '../src/authz.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as S from '../src/web/stages.ts';
import * as T from '../src/web/tasks.ts';
import { actor, signatureRecordFor, testApp } from './helpers.ts';
import * as CF from './claim-fixtures.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const SOP_EXPORT = fileURLToPath(new URL(
  '../../../08-monday-doc-exports/12552682457__Item-2-Standard-Operating-Procedures-enquiry-to-defence-pack.md', import.meta.url));

type App = Awaited<ReturnType<typeof testApp>>;
type Made = Awaited<ReturnType<typeof createApp>>;
type Org = { business: string; property: string; assessment: string | null };

function deps(app: { db: Db; audit: App['audit']; now: () => string }): P.PipelineDeps {
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
function organisation(app: App, opts: { assessment?: boolean; stage?: string } = {}): Org {
  n += 1;
  const business = `b-${n}`;
  app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)',
    [business, `Organisation ${n} Limited`, 'dental', opts.stage ?? 'ASSESSMENT_SUBMITTED', T0]);
  const property = `p-${n}`;
  app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', [property, business, 'Main site', T0]);
  let assessment: string | null = null;
  if (opts.assessment !== false) {
    assessment = `a-${n}`;
    app.db.run(
      'INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
      [assessment, business, 'dental', T0, 100_00, 200_00, T0]);
  }
  return { business, property, assessment };
}

/** A claim placed straight at a stage — a fixture, so each gate can be tried on its own. */
function claimAt(app: App, org: Org, stage: string, opts: { signoff?: boolean } = {}): string {
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: org.business, property_id: org.property, assessment_id: org.assessment, workstream: 'UNKNOWN',
    stage, owner_id: null, surveyor_id: null,
  });
  P.recordOpened(deps(app), null, made.id, stage, 'a test fixture');
  // CRM 6 of 10: the sign-off is a record in tax_adviser_signoffs — the column this used to set is retired and refused.
  if (opts.signoff === true) CF.signOffRow(app, org.business, org.assessment ?? CF.assessmentFor(app, org.business), made.id);
  // CRM 3 of 10: every open claim keeps one next action with an owner and a due date, and a move without one is
  // refused. A fixture carries one, so each gate below is tried on its own; test/tasks.test.ts tries the rule.
  const owner = app.db.get<{ id: string }>("SELECT id FROM users WHERE role IN ('ADMIN','SALES') ORDER BY id LIMIT 1");
  if (owner !== undefined) {
    T.insertTask(app.db, app.now, randomUUID, {
      title: 'a fixture next action', description: null, owner_id: owner.id, owner_role: null, due_on: '2026-12-31',
      priority: null, activity_type: 'TASK', business_id: org.business, property_id: null, claim_id: made.id, lead_id: null,
      contact_id: null, fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: true, origin: 'STAFF',
      automation_run_id: null, created_by: owner.id,
    });
  }
  return made.id;
}

function stageOf(app: App, claim: string): string | null {
  return app.db.get<{ stage: string | null }>('SELECT stage FROM claims WHERE id = ?', [claim])?.stage ?? null;
}

function fwd(app: App, who: AppRole, claim: string, to: string, opts: P.GateOptions = {}): P.MoveResult {
  return P.moveClaim(deps(app), actor(who), claim, { kind: 'FORWARD', to }, opts);
}

function letter(app: App, business: string, state: 'NOT_SENT' | 'SENT' | 'VIEWED' | 'SIGNED'): void {
  app.db.run(
    'INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(business_id) DO UPDATE SET letter_state = excluded.letter_state, signed_at = excluded.signed_at',
    [randomUUID(), business, state, state === 'SIGNED' ? T0 : null, T0]);
  if (state === 'SIGNED') signatureRecordFor(app.db, business, T0);
}

function commitOn(app: App, org: Org, claim: string | null): void {
  const job = randomUUID();
  app.db.run(
    'INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
    [job, org.business, org.assessment, 'u-SURVEYING', 'COMMITTED_AND_RELEASED', T0, T0, claim]);
  app.db.run(
    'INSERT INTO surveyor_commitments (id,job_id,surveyor_id,a_qualifying_plant_pence,b_building_pence,c_bare_land_pence,' +
      'qualifying_pct,method_note,committed_at,figures_hash,released_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [randomUUID(), job, 'u-SURVEYING', 1, 1, 1, 0.1, 'a test commitment', T0, 'not-a-hash', T0]);
}

function confirm(app: App, claim: string, milestone: string): void {
  const r = P.recordMilestone(deps(app), actor('SALES'), claim, milestone, null);
  assert.equal(r.ok, true, r.ok ? '' : r.why);
}

function checks(app: App, subject: P.EnquirySubject, answers: Partial<Record<P.CheckKey, 'YES' | 'NO' | 'UNKNOWN'>>): void {
  for (const [check_key, answer] of Object.entries(answers)) {
    const r = P.recordEnquiryCheck(deps(app), actor('SALES'), subject, { check_key, answer, note: null });
    assert.equal(r.ok, true, r.ok ? '' : r.why);
  }
}

/** CRM 7 of 10: THE CLAIM'S OWN fee invoice. An organisation's invoice no longer opens the gate — test/finance-claim.test.ts.
 *  PHASE 158c (F41): and it is SENT to the client — raised and not sent does not open it (test/phase158c.test.ts). */
function raiseInvoice(app: App, business: string, claim: string): void {
  CF.claimInvoiceRow(app, business, claim, { status: 'SENT' });
}

const ALL_YES = { UK_HEALTHCARE_PROPERTY: 'YES', TRADING_CLIENT: 'YES', OWNER_OR_AUTHORISED: 'YES', NO_CLAIM_CONFLICT: 'YES' } as const;

/* ------------------------------------------------------------- HTTP helpers */

type Res = { status: number; location: string | null; body: string };
type Client = { req(path: string, init?: RequestInit): Promise<Res>; post(path: string, fields: Record<string, string>): Promise<Res> };

function makeClient(base: string): Client {
  let cookie = '';
  const c: Client = {
    async req(path, init = {}) {
      const headers = { ...(init.headers as Record<string, string> | undefined) };
      if (cookie !== '') headers['cookie'] = cookie;
      const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
      const set = r.headers.getSetCookie();
      if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
      return { status: r.status, location: r.headers.get('location'), body: await r.text() };
    },
    post(path, fields) {
      return c.req(path, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      });
    },
  };
  return c;
}

async function bootSeeded(): Promise<{ made: Made; close(): void; signIn(who: string): Promise<Client> }> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-pipe-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  return {
    made, close: made.close,
    async signIn(who) {
      const c = makeClient(base);
      const r = await c.post('/login', { email: `${who}@example.invalid`, password: s.password });
      assert.equal(r.status, 303, `${who} could not sign in`);
      return c;
    },
  };
}
void PASSWORD;

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

const GRANTED: Readonly<Record<string, readonly AppRole[]>> = Object.freeze({
  'lead.read': ['ADMIN', 'SALES'],
  'lead.write': ['ADMIN', 'SALES'],
  'lead.convert': ['ADMIN', 'SALES'],
  'pipeline.read': ['ADMIN', 'SALES'],
  'claim.move': ['ADMIN', 'SALES'],
  'claim.reopen': ['ADMIN'],
});

function objectFor(action: string): Obj {
  const noun = action.split('.')[0];
  if (noun === 'lead') return { type: 'lead', id: 'l-1', business_id: 'biz-1' };
  if (noun === 'pipeline') return { type: 'pipeline', id: 'board' };
  // The surveyor IS on this claim, so a refusal is the role being refused and not the object test failing.
  return { type: 'claim', id: 'c-1', business_id: 'biz-1', assigned_surveyor_ids: ['u-SURVEYING'] };
}

describe('who may do what — the six new actions, every role', () => {
  test('each new action admits exactly the roles granted it, and REFUSES every other role — and a disabled user every one', () => {
    for (const [action, granted] of Object.entries(GRANTED)) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const a = actor(role, `u-${role}`, role === 'CLIENT' ? 'biz-1' : null);
        assert.equal(can(a, action, objectFor(action)), granted.includes(role),
          `${role} on ${action}: expected ${granted.includes(role) ? 'allowed' : 'REFUSED'}`);
      }
      assert.equal(can({ ...actor('ADMIN'), disabled: true }, action, objectFor(action)), false, `disabled ADMIN on ${action}`);
    }
  });

  test('over HTTP on the seed: ACCOUNTING, SURVEYING and CLIENT are refused the board, the leads and every move; SALES is not', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const claim = db.get<{ id: string }>("SELECT id FROM claims WHERE stage = 'SURVEY' LIMIT 1");
      const lead = db.get<{ id: string }>('SELECT id FROM leads LIMIT 1');
      assert.ok(claim && lead);
      for (const who of ['accounting', 'surveying', 'client']) {
        const c = await h.signIn(who);
        for (const path of ['/staff/pipeline', '/staff/pipeline/view.json', '/staff/leads', `/staff/leads/${lead.id}`, `/staff/leads/${lead.id}/view.json`]) {
          assert.equal((await c.req(path)).status, 403, `${who} reached ${path}`);
        }
        assert.equal((await c.post(`/staff/claims/${claim.id}/stage`, { kind: 'EXIT', to: 'CANCELLED', reason_code: 'OTHER', reason: 'x' })).status, 403, `${who} moved a claim`);
        assert.equal((await c.post(`/staff/leads/${lead.id}`, { status: 'LOST', lost_reason: 'OTHER', lost_note: 'x' })).status, 403, `${who} wrote a lead`);
      }
      assert.equal(stageOf(h.made.app as unknown as App, claim.id), 'SURVEY', 'a refused move changed the stage');
      const sales = await h.signIn('sales');
      assert.equal((await sales.req('/staff/pipeline')).status, 200);
      assert.equal((await sales.req('/staff/leads')).status, 200);
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * MAP, DO NOT INVENT
 * ================================================================== */

describe('stages.ts maps the procedure; it does not invent a stage', () => {
  const flat = readFileSync(SOP_EXPORT, 'utf8').replace(/[│├─►▼]/g, ' ').replace(/\s+/g, ' ').replace(/\/ /g, '/');

  test('every stage, gate and exit is the procedure’s own words, found in the procedure’s own file', () => {
    assert.equal(S.PROCEDURE_STAGES.length, 10);
    for (const s of S.PROCEDURE_STAGES) {
      assert.ok(flat.includes(`## SOP ${s.sop} — ${s.label}`), `SOP ${s.sop}'s heading is not "${s.label}"`);
      for (const fragment of s.gate.split('…').map((x) => x.trim()).filter((x) => x !== '')) {
        assert.ok(flat.includes(fragment), `${s.key}'s gate is not in the procedure: "${fragment}"`);
      }
      // Disposition row 29.4: who is responsible for each stage is the procedure's own "Owner:" line.
      for (const fragment of s.owner.split('…').map((x) => x.trim()).filter((x) => x !== '')) {
        assert.ok(flat.includes(fragment), `${s.key}'s owner is not in the procedure: "${fragment}"`);
      }
    }
    for (const e of S.EXITS.filter((x) => x.source.startsWith('the procedure'))) {
      assert.ok(flat.includes(`EXIT: ${e.label}`), `the exit "${e.label}" is not in the procedure`);
    }
    // Every exit the map draws from a stage is reachable from that stage.
    for (const s of S.PROCEDURE_STAGES.filter((x) => x.exit !== null)) {
      const e = S.exitStage(s.exit);
      assert.ok(e && (e.from === 'ANY_OPEN' || e.from.includes(s.key)), `${s.key}'s own exit is not reachable from it`);
    }
  });

  test('every procedure stage maps onto one of the six client-facing labels, never ahead of the one before it, and never onto RESEARCH_PART_RUN or PAID', () => {
    let last = -1;
    for (const key of [...S.PROCEDURE_KEYS, 'CLOSED'] as const) {
      const client = S.clientStageFor(key);
      assert.ok(client !== null && S.stage(client) !== undefined, `${key} maps onto no client-facing label`);
      assert.notEqual(client, 'RESEARCH_PART_RUN');
      assert.notEqual(client, 'PAID');
      const i = S.stageIndex(client);
      assert.ok(i >= last, `${key} evidences less than the stage before it`);
      last = i;
    }
    // The portal still has its six, and nothing else.
    assert.equal(S.STAGES.length, 6);
  });

  test('an unrecognised or absent stage is UNKNOWN — never the enquiry', () => {
    for (const k of [null, 'SOMETHING_ELSE', 'AT_SURVEY']) {
      assert.equal(S.claimStage(k).kind, 'UNKNOWN');
      assert.equal(S.clientStageFor(k), null);
    }
  });
});

/* ================================================================== *
 * THE VOCABULARY
 * ================================================================== */

describe('the vocabulary — two triggers replaced, and the claims table not rebuilt', () => {
  test('the claims table is 009’s own; the two named triggers carry the procedure; the six old keys are refused', async () => {
    const app = await testApp();
    try {
      const table = app.db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'claims'")?.sql ?? '';
      const nine = readFileSync(join(MIGRATIONS, '009-crm-backbone.sql'), 'utf8');
      assert.ok(nine.includes('stage               TEXT,'), 'the fixture no longer matches 009');
      assert.ok(table.includes('stage               TEXT,'), 'the claims table was rebuilt');
      assert.equal(/ENQUIRY/.test(table), false, 'the stage vocabulary was put into the table');
      for (const name of ['claims_stage_insert', 'claims_stage_update']) {
        const sql = app.db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", [name])?.sql ?? '';
        assert.match(sql, /DEFENCE_PACK/, `${name} does not carry the procedure`);
        assert.equal(/ASSESSMENT_SUBMITTED/.test(sql), false, `${name} still carries the old keys`);
      }
      staff(app);
      const org = organisation(app);
      for (const key of [...S.PROCEDURE_KEYS, ...S.EXIT_KEYS]) assert.ok(claimAt(app, org, key));
      for (const old of ['ASSESSMENT_SUBMITTED', 'RESEARCH_PART_RUN', 'ENGAGEMENT_SIGNED', 'AT_SURVEY', 'INVOICED', 'PAID']) {
        assert.throws(() => claimAt(app, org, old), /operating procedure/, `${old} was accepted`);
      }
      const c = claimAt(app, org, 'SURVEY');
      assert.throws(() => app.db.run("UPDATE claims SET stage = 'PAID' WHERE id = ?", [c]), /operating procedure/);
      // ON_HOLD carries its return; CLOSED carries its completion date — both at the database.
      assert.throws(() => app.db.run("UPDATE claims SET stage = 'ON_HOLD' WHERE id = ?", [c]), /hold reason/);
      assert.throws(() => app.db.run("UPDATE claims SET stage = 'CLOSED' WHERE id = ?", [c]), /completion date/);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * EVERY GATE — ONE TEST EACH THAT TRIES TO SKIP IT
 * ================================================================== */

describe('every gate is server-side, and every gate has a test that tries to skip it', () => {
  test('ENQUIRY → ASSESSMENT: a check recorded UNKNOWN and a check never asked refuse IDENTICALLY; a NO refuses; four recorded YES open it', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const never = claimAt(app, org, 'ENQUIRY');
      const unknown = claimAt(app, org, 'ENQUIRY');
      const three = { UK_HEALTHCARE_PROPERTY: 'YES', TRADING_CLIENT: 'YES', OWNER_OR_AUTHORISED: 'YES' } as const;
      checks(app, { claim_id: never }, three);
      checks(app, { claim_id: unknown }, { ...three, NO_CLAIM_CONFLICT: 'UNKNOWN' });

      const pick = (id: string) => {
        const c = P.enquiryGate(app.db, { claim_id: id }).checks.find((x) => x.key === 'NO_CLAIM_CONFLICT');
        assert.ok(c);
        return { answer: c.answer, passes: c.passes, reading: c.reading };
      };
      assert.deepEqual(pick(never), pick(unknown), 'never asked and not known read differently');
      assert.equal(pick(never).passes, false, 'never asked became a pass');
      assert.equal(pick(unknown).passes, false, 'not known became a pass');
      const a = fwd(app, 'SALES', never, 'ASSESSMENT');
      const b = fwd(app, 'ADMIN', unknown, 'ASSESSMENT');
      assert.equal(a.ok, false);
      assert.equal(b.ok, false);
      assert.equal(a.ok ? '' : a.why, b.ok ? '' : b.why, 'the two refusals say different things');
      assert.equal(stageOf(app, never), 'ENQUIRY');

      checks(app, { claim_id: never }, { NO_CLAIM_CONFLICT: 'NO' });
      assert.equal(fwd(app, 'SALES', never, 'ASSESSMENT').ok, false, 'a NO passed');

      // THE NEGATIVE CONTROL: a recorded YES, and the same move succeeds.
      checks(app, { claim_id: unknown }, { NO_CLAIM_CONFLICT: 'YES' });
      assert.equal(fwd(app, 'SALES', unknown, 'ASSESSMENT').ok, true);
      assert.equal(stageOf(app, unknown), 'ASSESSMENT');
    } finally { app.close(); }
  });

  test('ASSESSMENT → ENGAGEMENT: no assessment on record refuses', async () => {
    const app = await testApp();
    try {
      staff(app);
      const bare = organisation(app, { assessment: false });
      const c = claimAt(app, bare, 'ASSESSMENT');
      assert.equal(fwd(app, 'ADMIN', c, 'ENGAGEMENT').ok, false);
      app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,created_at) VALUES (?,?,?,?,?)',
        ['a-late', bare.business, 'dental', T0, T0]);
      assert.equal(fwd(app, 'ADMIN', c, 'ENGAGEMENT').ok, true);
    } finally { app.close(); }
  });

  test('ENGAGEMENT → DATA_GATHERING: only assertSignedEngagement opens it — none, NOT_SENT, SENT and VIEWED refuse, and there is no second gate', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'ENGAGEMENT');
      assert.equal(fwd(app, 'ADMIN', c, 'DATA_GATHERING').ok, false, 'no letter at all passed');
      for (const state of ['NOT_SENT', 'SENT', 'VIEWED'] as const) {
        letter(app, org.business, state);
        const r = P.moveClaim(deps(app), actor('ADMIN'), c, { kind: 'FORWARD', to: 'DATA_GATHERING', reason: 'the client says they signed' });
        assert.equal(r.ok, false, `${state} passed`);
      }
      letter(app, org.business, 'SIGNED');
      assert.equal(fwd(app, 'ADMIN', c, 'DATA_GATHERING').ok, true);

      const source = readFileSync(join(SRC, 'web/pipeline.ts'), 'utf8');
      assert.match(source, /import \{ assertSignedEngagement \} from '\.\/research\.ts'/);
      assert.equal(/FROM engagements/i.test(source), false, 'pipeline.ts reads the engagements table itself — a second gate');
    } finally { app.close(); }
  });

  test('DATA_GATHERING → SURVEY: the election resolved (a fact, CRM 6 of 10) AND a confirmation, refused at the wrong stage, and a reopen invalidates the confirmation', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      letter(app, org.business, 'SIGNED');
      const c = claimAt(app, org, 'ENGAGEMENT');
      const early = P.recordMilestone(deps(app), actor('SALES'), c, 'DATA_GATHERING_COMPLETE', null);
      assert.equal(early.ok, false, 'a confirmation was recorded before its stage');
      assert.equal(fwd(app, 'SALES', c, 'DATA_GATHERING').ok, true);
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, false, 'no confirmation passed');
      confirm(app, c, 'DATA_GATHERING_COMPLETE');
      // CRM 6 of 10: the confirmation alone no longer passes — the election is a fact, and never asked is not resolved.
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, false, 'a confirmation stood in for the election');
      CF.noElection(app, c);
      CF.mustArriveDocuments(app, org.business, c); // Phase 151b: the documents that must arrive are switched on
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, true);

      // A reopen back to the stage invalidates what was confirmed before it.
      assert.equal(P.moveClaim(deps(app), actor('ADMIN'), c, { kind: 'REOPEN', to: 'DATA_GATHERING', reason: 'the floor area source was wrong' }).ok, true);
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, false, 'a confirmation from before the reopen still counted');
      confirm(app, c, 'DATA_GATHERING_COMPLETE');
      assert.equal(fwd(app, 'SALES', c, 'SURVEY').ok, true);
    } finally { app.close(); }
  });

  test('SURVEY → VALUATION: only a surveyor_commitments row on a job ON THIS CLAIM opens it — not a confirmation, not a commitment on another claim', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY');
      const other = claimAt(app, org, 'SURVEY');
      assert.equal(fwd(app, 'ADMIN', c, 'VALUATION').ok, false);
      assert.equal(P.recordMilestone(deps(app), actor('ADMIN'), c, 'SURVEY_COMPLETE', null).ok, false, 'a click stood in for the commitment');
      commitOn(app, org, other);
      assert.equal(fwd(app, 'ADMIN', c, 'VALUATION').ok, false, 'another claim’s commitment opened this gate');
      commitOn(app, org, null);
      assert.equal(fwd(app, 'ADMIN', c, 'VALUATION').ok, false, 'a commitment on no claim opened this gate');
      commitOn(app, org, c);
      assert.equal(fwd(app, 'ADMIN', c, 'VALUATION').ok, true);
    } finally { app.close(); }
  });

  test('VALUATION → TAX_ADVISER_SIGNOFF: every grant traced (a fact, CRM 6 of 10) AND the surveyor’s approval of the pack (Phase 158c)', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'VALUATION');
      assert.equal(fwd(app, 'SALES', c, 'TAX_ADVISER_SIGNOFF').ok, false);
      // PHASE 158c (F35): the staff tick is retired; the surveyor's approval of the survey pack stands in its place.
      assert.equal(P.recordMilestone(deps(app), actor('SALES'), c, 'VALUATION_SIGNED', null).ok, false, 'the retired tick was taken');
      CF.packApprovedOn(app, org.business, org.assessment ?? '', c);
      // CRM 6 of 10: the approval alone does not pass — every grant traced is a fact, and never asked does not pass.
      assert.equal(fwd(app, 'SALES', c, 'TAX_ADVISER_SIGNOFF').ok, false, 'the approval stood in for every grant traced');
      CF.noGrants(app, c);
      assert.equal(fwd(app, 'SALES', c, 'TAX_ADVISER_SIGNOFF').ok, true);
    } finally { app.close(); }
  });

  test('TAX_ADVISER_SIGNOFF → REPORTS: SHUT until the sign-off RECORD exists (CRM 6 of 10) — the retired column is refused, and no confirmation stands in for it', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'TAX_ADVISER_SIGNOFF');
      for (const who of ['ADMIN', 'SALES'] as const) assert.equal(fwd(app, who, c, 'REPORTS').ok, false, `${who} opened the sign-off gate`);
      for (const m of ['TAX_ADVISER_SIGNED_OFF', 'CTA_SIGNOFF', 'VALUATION_SIGNED']) {
        assert.equal(P.recordMilestone(deps(app), actor('ADMIN'), c, m, null).ok, false, `${m} was recorded at the sign-off stage`);
      }
      assert.equal(P.claimableFigureReleased(app.db, P.loadPipelineClaim(app.db, c)).released, false);
      // The column CRM 2 of 10 built the gate against is retired: a date typed into it is refused by the database.
      assert.throws(() => app.db.run('UPDATE claims SET tax_adviser_signoff_at = ? WHERE id = ?', [app.now(), c]), /E_SIGNOFF_IS_A_RECORD/);
      assert.equal(fwd(app, 'SALES', c, 'REPORTS').ok, false);

      // Nothing writes the column. Every .ts under src/, read as text.
      const writes: string[] = [];
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const p = join(dir, e.name);
          if (e.isDirectory()) walk(p);
          // A write is SQL: the column assigned a parameter, or named in an UPDATE's SET on one line. A
          // comparison in code (`=== null`) is a read and is not matched.
          else if (e.name.endsWith('.ts') && /tax_adviser_signoff_at\s*=\s*[?:$@]|\bSET\b[^'"\n]*tax_adviser_signoff_at/i.test(readFileSync(p, 'utf8'))) writes.push(p);
        }
      };
      walk(SRC);
      assert.deepEqual(writes, [], 'something in src/ writes the sign-off');
      // And nothing client-facing names a claimable figure at all.
      assert.equal(/claimable/i.test(readFileSync(join(SRC, 'web/portal.ts'), 'utf8')), false);

      // THE NEGATIVE CONTROL — the sign-off record itself (CRM 6 of 10).
      CF.signOffRow(app, org.business, org.assessment ?? '', c);
      assert.equal(fwd(app, 'SALES', c, 'REPORTS').ok, true);
      assert.equal(P.claimableFigureReleased(app.db, P.loadPipelineClaim(app.db, c)).released, true);
    } finally { app.close(); }
  });

  test('REPORTS → INVOICE: the sign-off carried forward, BOTH reports issued and BOTH confirmations, and the amendment window open (CRM 6 of 10)', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'REPORTS', { signoff: true });
      assert.equal(fwd(app, 'SALES', c, 'INVOICE').ok, false);
      // PHASE 158c (F39): the client's acceptance is theirs, in the portal - a staff tick is refused.
      assert.equal(P.recordMilestone(deps(app), actor('SALES'), c, 'CLIENT_ACCEPTED_REPORT', null).ok, false, 'the retired tick was taken');
      confirm(app, c, 'ACCOUNTANT_CONFIRMED_RETURN');
      assert.equal(fwd(app, 'SALES', c, 'INVOICE').ok, false, 'the accountant’s confirmation passed with no report issued');
      CF.issue(app, c, 'CLIENT_REPORT');
      CF.issue(app, c, 'ACCOUNTANT_COMPUTATION_PACK');
      assert.equal(fwd(app, 'SALES', c, 'INVOICE').ok, false, 'the client’s acceptance was skipped');
      CF.clientAccepted(app, c);
      assert.equal(fwd(app, 'SALES', c, 'INVOICE').ok, false, 'an amendment window nobody established passed');
      CF.openWindow(app, org.business, org.property, c);
      // A claim at REPORTS with no sign-off — it can only be put there by hand — still does not pass.
      const unsigned = claimAt(app, org, 'REPORTS');
      confirm(app, unsigned, 'ACCOUNTANT_CONFIRMED_RETURN');
      assert.equal(fwd(app, 'SALES', unsigned, 'INVOICE').ok, false, 'a report with no sign-off went to invoice');
      assert.equal(fwd(app, 'SALES', c, 'INVOICE').ok, true);
    } finally { app.close(); }
  });

  test('INVOICE → DEFENCE_PACK: the claim inside the amendment window (CRM 6 of 10), the fee trigger at its DECIDED reading — our report delivered for filing (Phase 132e) — and an invoice raised; tried under all four readings', async () => {
    const app = await testApp();
    try {
      assert.equal(P.FEE_TRIGGER.reading, 'REPORT_DELIVERED_FOR_FILING');
      assert.equal(P.FEE_TRIGGER.decided, true);
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'REPORTS', { signoff: true });
      confirm(app, c, 'ACCOUNTANT_CONFIRMED_RETURN');
      CF.readyForReports(app, org.business, org.property, org.assessment ?? '', c);
      CF.clientAccepted(app, c); // PHASE 158c (F39): the client accepts in their portal
      assert.equal(fwd(app, 'SALES', c, 'INVOICE').ok, true);
      const gate = (claim: string, trigger?: P.FeeTrigger) =>
        P.gateOut(app.db, P.loadPipelineClaim(app.db, claim), 'INVOICE',
          trigger === undefined ? { today: app.now() } : { feeTrigger: trigger, today: app.now() }).open;

      raiseInvoice(app, org.business, c);
      // The reports went to the client and the accountant on their issue date: delivered for filing, so earned.
      assert.equal(P.reportDeliveredOn(app.db, c)?.on, '2026-09-01');
      assert.equal(gate(c), true, 'the decided reading did not read the delivered report');
      assert.equal(gate(c, 'CLIENT_ACCEPTED_REPORT'), true);
      assert.equal(gate(c, 'AMENDED_RETURN_FILED'), false);
      assert.equal(gate(c, 'HMRC_PROCESSED_RELIEF'), false, 'the old cautious reading passed with nothing confirmed');
      confirm(app, c, 'AMENDED_RETURN_FILED');
      assert.equal(gate(c, 'AMENDED_RETURN_FILED'), true);

      // NOTHING DELIVERED — UNKNOWN IS NOT REACHED (N4): no report issued, however much else is confirmed.
      const bare = organisation(app);
      const d = claimAt(app, bare, 'INVOICE', { signoff: true });
      CF.openWindow(app, bare.business, bare.property, d);
      confirm(app, d, 'HMRC_PROCESSED_RELIEF');
      assert.equal(P.reportDeliveredOn(app.db, d), null);
      assert.equal(gate(d, 'HMRC_PROCESSED_RELIEF'), false, 'no invoice, and the gate opened');
      raiseInvoice(app, bare.business, d);
      assert.equal(gate(d, 'HMRC_PROCESSED_RELIEF'), true, 'the negative control: the old reading with its confirmation and an invoice');
      assert.equal(gate(d), false, 'the decided reading passed with no report delivered');
      assert.match(P.feeTriggerReached(app.db, P.loadPipelineClaim(app.db, d)).why, /not known is not reached/);

      assert.equal(fwd(app, 'SALES', c, 'DEFENCE_PACK').ok, true);
      assert.equal(fwd(app, 'SALES', d, 'DEFENCE_PACK').ok, false);
    } finally { app.close(); }
  });

  test('DEFENCE_PACK → CLOSED: the defence pack ISSUED in the register, with its hash (CRM 6 of 10) — the confirmation is retired — and the filing recorded (Phase 158c, F42); the claim records its completion date', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'DEFENCE_PACK', { signoff: true });
      assert.equal(fwd(app, 'SALES', c, 'CLOSED').ok, false);
      assert.equal(P.recordMilestone(deps(app), actor('SALES'), c, 'DEFENCE_PACK_COMPLETE', null).ok, false, 'the retired confirmation was recorded');
      assert.equal(fwd(app, 'SALES', c, 'CLOSED').ok, false);
      CF.issue(app, c, 'DEFENCE_PACK');
      assert.equal(fwd(app, 'SALES', c, 'CLOSED').ok, false, 'closed with no filing recorded');
      CF.filingRecorded(app, c); // PHASE 158c (F42)
      assert.equal(fwd(app, 'SALES', c, 'CLOSED').ok, true);
      assert.ok(app.db.get<{ at: string | null }>('SELECT completed_at AS at FROM claims WHERE id = ?', [c])?.at);
      assert.equal(fwd(app, 'SALES', c, 'CLOSED').ok, false, 'a closed claim moved on');
    } finally { app.close(); }
  });

  test('ONE STAGE AT A TIME: a skip is refused even when every gate on the way is open; SALES cannot reopen', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      letter(app, org.business, 'SIGNED');
      const c = claimAt(app, org, 'ENGAGEMENT');
      assert.equal(fwd(app, 'ADMIN', c, 'SURVEY').ok, false, 'a claim jumped a stage');
      assert.equal(fwd(app, 'ADMIN', c, 'ASSESSMENT').ok, false, 'FORWARD moved a claim back');
      assert.equal(stageOf(app, c), 'ENGAGEMENT');
      assert.throws(() => P.moveClaim(deps(app), actor('SALES'), c, { kind: 'REOPEN', to: 'ASSESSMENT', reason: 'x' }), NotAuthorised);
      assert.equal(fwd(app, 'ADMIN', c, 'DATA_GATHERING').ok, true);
    } finally { app.close(); }
  });

  test('THE WRITE ASKS THE GATE AGAIN: a board card’s move button past a shut gate is refused over HTTP, the stage stays, and the attempt is audited', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const claim = db.get<{ id: string }>(
        "SELECT c.id FROM claims c JOIN surveyor_jobs j ON j.claim_id = c.id WHERE c.stage = 'SURVEY' LIMIT 1");
      assert.ok(claim);
      const sales = await h.signIn('sales');
      const board = JSON.parse((await sales.req('/staff/pipeline/view.json')).body) as C.Board;
      const card = board.columns.find((c) => c.key === 'SURVEY')?.cards.find((x) => x.id === claim.id);
      assert.equal(card?.next?.key, 'VALUATION', 'the card offers no move');
      const r = await sales.post(`/staff/claims/${claim.id}/stage`, { kind: 'FORWARD', to: 'VALUATION', back: 'board' });
      assert.equal(r.status, 400);
      assert.match(r.body, /Not ready to move on from Survey yet/); // Phase 133c: a stop is information, not a failure
      assert.equal(db.get<{ stage: string }>('SELECT stage FROM claims WHERE id = ?', [claim.id])?.stage, 'SURVEY');
      assert.ok(h.made.app.audit.entries().some((e) =>
        e.kind === 'CLAIM_STAGE_MOVED' && e.outcome === 'REFUSED' && e.object_id === claim.id && e.detail['to'] === 'VALUATION'));
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * EXITS KEEP THE RECORD
 * ================================================================== */

describe('exits keep the record — nothing is deleted', () => {
  test('an exit keeps the row, its reference and its history; the audit line carries the reason’s code and never the note', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'SURVEY');
      const before = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims')?.n;
      const ref = app.db.get<{ r: string }>('SELECT claim_ref AS r FROM claims WHERE id = ?', [c])?.r;
      const r = P.moveClaim(deps(app), actor('SALES'), c,
        { kind: 'EXIT', to: 'REASONED_NEGATIVE', reason_code: 'ELECTION_UNRESOLVED', reason: 'Jane Smith at the seller confirmed a £1 election' });
      assert.equal(r.ok, true, r.ok ? '' : r.why);
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims')?.n, before);
      assert.equal(app.db.get<{ r: string }>('SELECT claim_ref AS r FROM claims WHERE id = ?', [c])?.r, ref);
      assert.equal(stageOf(app, c), 'REASONED_NEGATIVE');
      const move = app.db.get<{ kind: string; from_stage: string; reason_code: string; reason_text: string }>(
        "SELECT kind, from_stage, reason_code, reason_text FROM claim_stage_moves WHERE claim_id = ? AND kind = 'EXIT'", [c]);
      assert.deepEqual({ ...move }, { kind: 'EXIT', from_stage: 'SURVEY', reason_code: 'ELECTION_UNRESOLVED', reason_text: 'Jane Smith at the seller confirmed a £1 election' });
      assert.throws(() => app.db.run('DELETE FROM claims WHERE id = ?', [c]), /never deleted/);
      assert.throws(() => app.db.run('DELETE FROM claim_stage_moves'), /append-only/);
      assert.throws(() => app.db.run("UPDATE claim_stage_moves SET reason_text = 'x'"), /append-only/);
      const line = app.audit.entries().find((e) => e.kind === 'CLAIM_STAGE_MOVED' && e.outcome === 'ALLOWED' && e.object_id === c);
      assert.ok(line);
      assert.deepEqual([line.detail['from'], line.detail['to'], line.detail['reason'], line.actor_id],
        ['SURVEY', 'REASONED_NEGATIVE', 'ELECTION_UNRESOLVED', 'u-SALES']);
      assert.equal(JSON.stringify(app.audit.entries()).includes('Jane Smith'), false, 'a note reached the audit log');
      assert.equal(app.audit.verify().intact, true);
    } finally { app.close(); }
  });

  test('an exit is the procedure’s exit from that stage, and carries a listed, active reason', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const survey = claimAt(app, org, 'SURVEY');
      const enquiry = claimAt(app, org, 'ENQUIRY');
      const exit = (c: string, to: string, reason_code: string | null, reason: string | null = null) =>
        P.moveClaim(deps(app), actor('SALES'), c, { kind: 'EXIT', to, reason_code, reason });
      assert.equal(exit(survey, 'DECLINED_AT_ENQUIRY', 'OUTSIDE_SCOPE').ok, false, 'declined at enquiry from a survey');
      assert.equal(exit(enquiry, 'REASONED_NEGATIVE', 'OTHER', 'x').ok, false, 'a reasoned negative from the enquiry');
      assert.equal(exit(enquiry, 'CLIENT_WITHDREW', 'CLIENT_REJECTED_REPORT').ok, false, 'a withdrawal before the reports');
      assert.equal(exit(enquiry, 'DECLINED_AT_ENQUIRY', null).ok, false, 'an exit with no reason');
      assert.equal(exit(enquiry, 'DECLINED_AT_ENQUIRY', 'NOT_ON_THE_LIST').ok, false, 'an unlisted reason');
      assert.equal(exit(enquiry, 'DECLINED_AT_ENQUIRY', 'OTHER').ok, false, '“another reason” with nothing written');
      app.db.run("UPDATE reason_lists SET active = 0 WHERE list = 'CLAIM_EXIT' AND code = 'OUTSIDE_SCOPE'");
      assert.equal(exit(enquiry, 'DECLINED_AT_ENQUIRY', 'OUTSIDE_SCOPE').ok, false, 'a retired reason');
      assert.throws(() => app.db.run("DELETE FROM reason_lists WHERE code = 'OUTSIDE_SCOPE'"), /never deleted/);
      assert.equal(exit(enquiry, 'DECLINED_AT_ENQUIRY', 'OWNERSHIP_NOT_DEMONSTRATED').ok, true);
    } finally { app.close(); }
  });

  test('OUTSIDE_AMENDMENT_WINDOW is reachable from every one of the ten stages and from a hold — and after it no fee can be incurred', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      // CRM 7 of 10: an invoice on the organisation opens no claim's gate, and raising one on an exited claim is refused
      // by the store (test/finance-claim.test.ts) — it is kept here so the exit is still tried with an invoice on record.
      app.db.run("INSERT INTO invoices (id,business_id,claim_value_pence,fee_pence,invoice_status,payment_status,vat_position,created_at) VALUES (?,?,NULL,NULL,'RAISED','UNPAID','not VAT registered',?)",
        [randomUUID(), org.business, T0]);
      for (const stage of S.PROCEDURE_KEYS) {
        const c = claimAt(app, org, stage, { signoff: true });
        const r = P.moveClaim(deps(app), actor('SALES'), c, { kind: 'EXIT', to: 'OUTSIDE_AMENDMENT_WINDOW', reason_code: 'AMENDMENT_WINDOW_CLOSED' });
        assert.equal(r.ok, true, `not reachable from ${stage}: ${r.ok ? '' : r.why}`);
      }
      const held = claimAt(app, org, 'VALUATION');
      assert.equal(P.moveClaim(deps(app), actor('SALES'), held, { kind: 'HOLD', reason: 'waiting on the accounts' }).ok, true);
      assert.equal(P.moveClaim(deps(app), actor('SALES'), held, { kind: 'EXIT', to: 'OUTSIDE_AMENDMENT_WINDOW', reason_code: 'AMENDMENT_WINDOW_CLOSED' }).ok, true);

      // Stopped at INVOICE, before the fee: nothing moves it on and nothing can be confirmed.
      const invoice = app.db.get<{ id: string }>(
        "SELECT m.claim_id AS id FROM claim_stage_moves m WHERE m.kind = 'EXIT' AND m.from_stage = 'INVOICE'");
      assert.ok(invoice);
      assert.equal(fwd(app, 'ADMIN', invoice.id, 'DEFENCE_PACK').ok, false);
      assert.equal(P.recordMilestone(deps(app), actor('ADMIN'), invoice.id, 'HMRC_PROCESSED_RELIEF', null).ok, false);

      // Not from a closed claim: it has finished.
      const closed = claimAt(app, org, 'DEFENCE_PACK');
      CF.issue(app, closed, 'DEFENCE_PACK'); // CRM 6 of 10: the register's issued pack, not a confirmation
      CF.filingRecorded(app, closed); // PHASE 158c (F42): and the filing recorded
      assert.equal(fwd(app, 'SALES', closed, 'CLOSED').ok, true);
      assert.equal(P.moveClaim(deps(app), actor('SALES'), closed, { kind: 'EXIT', to: 'OUTSIDE_AMENDMENT_WINDOW', reason_code: 'AMENDMENT_WINDOW_CLOSED' }).ok, false);
    } finally { app.close(); }
  });

  test('ON_HOLD carries its reason and the stage it returns to, and resumes there and nowhere else', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'VALUATION');
      assert.equal(P.moveClaim(deps(app), actor('SALES'), c, { kind: 'HOLD' }).ok, false, 'a hold with no reason');
      assert.equal(P.moveClaim(deps(app), actor('SALES'), c, { kind: 'HOLD', reason: 'waiting on the client’s accounts' }).ok, true);
      const row = app.db.get<{ stage: string; hold_return_stage: string; hold_reason: string }>(
        'SELECT stage, hold_return_stage, hold_reason FROM claims WHERE id = ?', [c]);
      assert.deepEqual({ ...row }, { stage: 'ON_HOLD', hold_return_stage: 'VALUATION', hold_reason: 'waiting on the client’s accounts' });
      assert.equal(fwd(app, 'SALES', c, 'TAX_ADVISER_SIGNOFF').ok, false, 'a claim on hold moved on');
      assert.equal(C.updateClaim(deps(app), actor('SALES'), c, { hold_reason: null }).ok, false, 'the hold reason was cleared');
      assert.equal(P.moveClaim(deps(app), actor('SALES'), c, { kind: 'RESUME', to: 'SURVEY' }).ok, false, 'resumed somewhere else');
      assert.equal(P.moveClaim(deps(app), actor('SALES'), c, { kind: 'RESUME' }).ok, true);
      assert.equal(stageOf(app, c), 'VALUATION');
    } finally { app.close(); }
  });

  test('ADMIN reopens, with a reason — never past where the claim has been', async () => {
    const app = await testApp();
    try {
      staff(app);
      const c = claimAt(app, organisation(app), 'SURVEY');
      assert.equal(P.moveClaim(deps(app), actor('SALES'), c, { kind: 'EXIT', to: 'CANCELLED', reason_code: 'OTHER', reason: 'client asked us to stop' }).ok, true);
      const reopen = (to: string, reason: string | null) => P.moveClaim(deps(app), actor('ADMIN'), c, { kind: 'REOPEN', to, reason });
      assert.equal(reopen('SURVEY', null).ok, false, 'a reopen with no reason');
      assert.equal(reopen('VALUATION', 'x').ok, false, 'reopened past where it had been');
      assert.equal(reopen('SURVEY', 'the client changed their mind').ok, true);
      assert.equal(stageOf(app, c), 'SURVEY');
      assert.equal(reopen('VALUATION', 'x').ok, false, 'REOPEN moved a claim forward');
      assert.equal(reopen('ENQUIRY', 'start again').ok, true);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * THE ORGANISATION'S STAGE — RAISED, NEVER LOWERED
 * ================================================================== */

describe('businesses.stage stays the sort key and the portal’s source — a move raises it, and nothing lowers it', () => {
  test('a move raises it to what the claim evidences; an exit, a reopen and a lower claim do not lower it', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app, { stage: 'ASSESSMENT_SUBMITTED' });
      letter(app, org.business, 'SIGNED');
      const stage = () => app.db.get<{ s: string }>('SELECT stage AS s FROM businesses WHERE id = ?', [org.business])?.s;
      const c = claimAt(app, org, 'ENGAGEMENT');
      assert.equal(stage(), 'ASSESSMENT_SUBMITTED', 'placing a fixture moved the stored stage');
      assert.equal(fwd(app, 'SALES', c, 'DATA_GATHERING').ok, true);
      assert.equal(stage(), 'ENGAGEMENT_SIGNED');
      assert.equal(P.moveClaim(deps(app), actor('ADMIN'), c, { kind: 'REOPEN', to: 'ENGAGEMENT', reason: 'x' }).ok, true);
      assert.equal(stage(), 'ENGAGEMENT_SIGNED', 'a reopen lowered the portal');

      const paid = organisation(app, { stage: 'PAID' });
      letter(app, paid.business, 'SIGNED');
      const p = claimAt(app, paid, 'ENGAGEMENT');
      assert.equal(fwd(app, 'SALES', p, 'DATA_GATHERING').ok, true);
      assert.equal(app.db.get<{ s: string }>('SELECT stage AS s FROM businesses WHERE id = ?', [paid.business])?.s, 'PAID');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * SURVEYOR REACH — BY THE JOB'S CLAIM, NOT ITS ASSESSMENT (E5)
 * ================================================================== */

describe('surveyor reach is the job’s claim, not its assessment', () => {
  test('two claims on one assessment: the job’s claim is reachable and the other is not; a job on no claim reaches nothing; a job’s claim is its own organisation’s', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const mine = claimAt(app, org, 'SURVEY');
      const sibling = claimAt(app, org, 'SURVEY');
      const s = actor('SURVEYING');
      const reach = (id: string) => can(s, 'claim.read', C.claimObjFor(app.db, { id, business_id: org.business }));
      app.db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,created_at,claim_id) VALUES (?,?,?,?,?,?,NULL)',
        ['j-1', org.business, org.assessment, 'u-SURVEYING', 'SEALED', T0]);
      assert.equal(reach(mine), false, 'a job on no claim reached a claim through its assessment');
      app.db.run('UPDATE surveyor_jobs SET claim_id = ? WHERE id = ?', [mine, 'j-1']);
      assert.equal(reach(mine), true);
      assert.equal(reach(sibling), false, 'a claim sharing the assessment was reached');
      const stranger = organisation(app);
      assert.throws(() => app.db.run('UPDATE surveyor_jobs SET claim_id = ? WHERE id = ?', [claimAt(app, stranger, 'SURVEY'), 'j-1']), /own organisation/);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * THE BOARD
 * ================================================================== */

describe('the pipeline board', () => {
  test('a column per stage and a lane for ON_HOLD; each card carries reference, client, property, owner, next action and age — and a value only for a reader of the estimate', async () => {
    const h = await bootSeeded();
    try {
      const sales = await h.signIn('sales');
      const board = JSON.parse((await sales.req('/staff/pipeline/view.json')).body) as C.Board;
      assert.deepEqual(board.columns.map((c) => c.key), [...S.PROCEDURE_KEYS, 'CLOSED']);
      assert.ok(Array.isArray(board.on_hold));
      assert.deepEqual(board.exited.map((e) => e.key), [...S.EXIT_KEYS]);
      const cards = board.columns.flatMap((c) => c.cards);
      assert.ok(cards.length >= 7, 'the seed’s claims are not all on the board');
      const withAssessment = cards.find((c) => c.value !== undefined && c.value !== 'no estimate yet');
      assert.ok(withAssessment, 'SALES sees no value on any card — the check below would prove nothing');
      for (const k of ['id', 'claim_ref', 'client', 'property', 'owner', 'next_action', 'age_days']) {
        assert.ok(k in withAssessment, `a card has no ${k}`);
      }

      // BUILT FORWARDS: the same card for a role that may not read the estimate carries no value at all.
      const db = h.made.app.db;
      const row = C.loadClaimRow(db, withAssessment.id);
      for (const who of ['SURVEYING', 'ACCOUNTING', 'CLIENT'] as const) {
        const card = C.boardCard(db, actor(who, `u-${who}`, who === 'CLIENT' ? row.business_id : null), row, h.made.app.now());
        assert.equal('value' in card, false, `${who}’s card carries a value`);
        assert.equal('next' in card, false, `${who}’s card offers a move`);
      }
    } finally { h.close(); }
  });

  test('the seed shows the procedure: the gates placed each seeded claim, and a claim opened by staff starts at the enquiry', async () => {
    const app = await testApp();
    try {
      await seed(app.db, app.hasher, app.now);
      const at = (name: string) => app.db.all<{ stage: string }>(
        'SELECT c.stage FROM claims c JOIN businesses b ON b.id = c.business_id WHERE b.name = ? ORDER BY c.claim_ref', [name]).map((r) => r.stage);
      assert.deepEqual(at('Aldergate Care Group Limited'), ['ASSESSMENT']);
      assert.deepEqual(at('Brackenfell Dental Partnership LLP'), ['ENGAGEMENT'], 'research part-run with an unsigned letter was placed past the engagement');
      assert.deepEqual(at('Corvale Supported Living Limited'), ['DATA_GATHERING']);
      // The CRM follow-on seeds Dunmarrow's branch surgery as a claim at INVOICE, walked there with every record its gates read,
      // so "Raise our fee" can be shown in training. Its assessed claim is still placed at the survey.
      assert.deepEqual(at('Dunmarrow Medical Practice Limited'), ['SURVEY', 'INVOICE']);
      // Phase 134: the outpatient annexe's own claim, opened by staff, starts at the enquiry too.
      assert.deepEqual(at('Elverton Private Hospital Limited'), ['SURVEY', 'ENQUIRY', 'ENQUIRY'], 'invoiced with no commitment was placed past the survey');
      assert.deepEqual(at('Fenmoor Nursing Homes Limited'), ['SURVEY']);
      // Every seeded survey job carries its claim.
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM surveyor_jobs WHERE claim_id IS NULL')?.n, 0);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * MIGRATION 010 — ONE CONVERSION, AND NO CLAIM PAST A GATE
 * ================================================================== */

describe('migration 010 converts every claim and every organisation’s lead, and places no claim past a gate its records cannot open', () => {
  test('on a database migrated to 009 and full of the six old keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-mig-'));
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files.filter((x) => x < '009')) copyFileSync(join(MIGRATIONS, f), join(dir, f));
    const db = new Db(':memory:');
    try {
      migrate(db, dir);
      db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        ['u-S', 's@example.invalid', 's@example.invalid', 'Surveyor', 'SURVEYING', 'x', T0, T0]);
      const business = (id: string, stage: string, letterState: string | null, assessment: boolean): void => {
        db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [id, `${id} Limited`, 'gp', stage, T0]);
        if (letterState !== null) {
          db.run('INSERT INTO engagements (id,business_id,letter_state,signed_at,created_at) VALUES (?,?,?,?,?)',
            [`e-${id}`, id, letterState, letterState === 'SIGNED' ? T0 : null, T0]);
        }
        if (assessment) {
          db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,created_at) VALUES (?,?,?,?,?)', [`a-${id}`, id, 'gp', T0, T0]);
        }
      };
      business('paid', 'PAID', 'SIGNED', true);
      business('invoiced', 'INVOICED', 'SIGNED', false);
      business('research', 'RESEARCH_PART_RUN', 'SENT', true);
      business('signed', 'ENGAGEMENT_SIGNED', 'SIGNED', true);
      business('new', 'ASSESSMENT_SUBMITTED', null, true);
      business('odd', 'SOMETHING_ELSE', null, false);
      db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at) VALUES (?,?,?,?,?,?,?)',
        ['j-paid', 'paid', 'a-paid', 'u-S', 'COMMITTED_AND_RELEASED', T0, T0]);
      db.run('INSERT INTO surveyor_commitments (id,job_id,surveyor_id,a_qualifying_plant_pence,b_building_pence,c_bare_land_pence,qualifying_pct,method_note,committed_at,figures_hash,released_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        ['k-paid', 'j-paid', 'u-S', 1, 1, 1, 0.1, 'm', T0, 'h', T0]);

      copyFileSync(join(MIGRATIONS, '009-crm-backbone.sql'), join(dir, '009-crm-backbone.sql'));
      migrate(db, dir);
      // An organisation that arrives between 009 and 010, with no claim, from a gated exit's call.
      db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['late', 'Late Limited', 'gp', 'ASSESSMENT_SUBMITTED', T0]);
      db.run('INSERT INTO bookings (id,business_id,channel,entry_point,created_at) VALUES (?,?,?,?,?)', ['k-late', 'late', 'email', 'gated_exit', T0]);

      for (const f of files.filter((x) => x >= '010')) copyFileSync(join(MIGRATIONS, f), join(dir, f));
      assert.deepEqual(migrate(db, dir), files.filter((x) => x >= '010'));

      const stage = (b: string) => db.get<{ stage: string | null }>('SELECT stage FROM claims WHERE business_id = ?', [b])?.stage;
      assert.equal(stage('paid'), 'TAX_ADVISER_SIGNOFF', 'PAID with a commitment and no sign-off');
      assert.equal(stage('invoiced'), 'SURVEY', 'INVOICED with no commitment');
      assert.equal(stage('research'), 'ENGAGEMENT', 'research part-run with the letter only SENT');
      assert.equal(stage('signed'), 'DATA_GATHERING');
      assert.equal(stage('new'), 'ASSESSMENT');
      assert.equal(stage('odd'), null, 'an unrecognised stage became a stage');

      const moves = db.all<{ from_stage: string; to_stage: string }>(
        "SELECT from_stage, to_stage FROM claim_stage_moves WHERE kind = 'CONVERTED' ORDER BY from_stage");
      assert.equal(moves.length, 5, 'every recognised claim is a CONVERTED move, and the unrecognised one is not');
      assert.ok(moves.some((m) => m.from_stage === 'PAID' && m.to_stage === 'TAX_ADVISER_SIGNOFF'));
      assert.equal(db.get<{ c: string }>("SELECT claim_id AS c FROM surveyor_jobs WHERE id = 'j-paid'")?.c,
        db.get<{ id: string }>("SELECT id FROM claims WHERE business_id = 'paid'")?.id, 'the job was not given its claim');

      const lead = (b: string) => db.get<{ status: string; origin: string; source: string; claim_id: string | null; booking_id: string | null }>(
        'SELECT status, origin, source, claim_id, booking_id FROM leads WHERE business_id = ?', [b]);
      assert.deepEqual({ ...lead('paid') }, {
        status: 'CONVERTED', origin: 'ASSESSMENT', source: 'WEBSITE',
        claim_id: db.get<{ id: string }>("SELECT id FROM claims WHERE business_id = 'paid'")?.id ?? null, booking_id: null,
      });
      assert.deepEqual({ ...lead('late') }, { status: 'NEW', origin: 'GATED_EXIT', source: 'OTHER', claim_id: null, booking_id: 'k-late' });
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leads')?.n, 7, 'one lead per organisation');
      assert.ok((db.get<{ n: number }>('SELECT COUNT(*) AS n FROM reason_lists')?.n ?? 0) > 0, 'the reason lists were not seeded');
    } finally { db.close(); }
  });
});
