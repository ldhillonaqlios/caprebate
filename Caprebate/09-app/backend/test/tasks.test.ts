/**
 * CRM 3 OF 10 — STAFF TASKS, ONE NEXT ACTION PER CLAIM, OVERDUE, THE ACTIVITY
 * TIMELINE, AND "MY TASKS". 11 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                           → WHO MAY DO WHAT
 *   "a new table, distinct from client_tasks … cancelled, never deleted …
 *    a simple recurrence … not a scheduler"         → STAFF TASKS
 *   "the one-next-action refusal"                   → ONE NEXT ACTION — THE REFUSAL, each with its negative control
 *   "a list shows the claims breaking the rule … reuse the engaged-client
 *    list's existing rule"                          → THE BREAKERS LIST
 *   "stored in UTC, shown in UK time"               → OVERDUE
 *   "flagged on the claim, on the owner's list and on the landing page" and
 *   "MY TASKS on the landing page for every staff role"  → over HTTP, on the seed
 *   "DO NOT BUILD A SECOND EVENT LOG"               → THE TIMELINE IS A READ
 *   "internal notes are separate … ACCOUNTING financial only; SURVEYING nothing
 *    outside an assigned job"                       → WHO SEES WHICH TIMELINE
 *   "read them on the LEAD's timeline too"          → THE GATED-EXIT LEAD
 *   "derive the first from this timeline and make the second a task"
 *                                                    → A CONTACT'S LAST CONTACT AND FOLLOW-UP
 *   N4 — "assert both"                              → no due date; a cancelled call and silence
 */

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
import { can, REGISTERED_ACTIONS, NotAuthorised, type Actor, type Obj } from '../src/authz.ts';
import * as C from '../src/web/crm.ts';
import * as P from '../src/web/pipeline.ts';
import * as L from '../src/web/leads.ts';
import * as T from '../src/web/tasks.ts';
import * as TL from '../src/web/timeline.ts';
import * as E from '../src/web/engaged.ts';
import { actor, fixedClock, testApp } from './helpers.ts';
import { localDate } from '../src/web/localtime.ts';

const T0 = '2026-09-08T00:00:00.000Z';
const SCRIPT = '<script>alert(1)</script><img src=x onerror=alert(2)>';
const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));
const SRC = fileURLToPath(new URL('../src/', import.meta.url));

type App = Awaited<ReturnType<typeof testApp>>;
type Made = Awaited<ReturnType<typeof createApp>>;
type Org = { business: string; property: string; assessment: string | null };

function deps(app: { db: Db; audit: App['audit']; now: () => string }): T.TaskDeps {
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

function task(t: Partial<T.TaskInsert>): T.TaskInsert {
  return {
    title: 'a task', description: null, owner_id: 'u-SALES', owner_role: null, due_on: null, priority: null,
    activity_type: 'TASK', business_id: null, property_id: null, claim_id: null, lead_id: null, contact_id: null,
    fact_id: null, recurrence: null, recurred_from_id: null, is_next_action: false, origin: 'STAFF',
    automation_run_id: null, created_by: 'u-SALES', ...t,
  };
}

/** A claim placed at a stage, with its next action as asked: kept, none, unowned or undated. */
function claimAt(app: App, org: Org, stage: string, next: 'full' | 'none' | 'no-owner' | 'no-due' = 'full'): string {
  const made = C.insertClaim(app.db, app.now, randomUUID, {
    business_id: org.business, property_id: org.property, assessment_id: org.assessment, workstream: 'UNKNOWN',
    stage, owner_id: null, surveyor_id: null,
  });
  P.recordOpened(deps(app), null, made.id, stage, 'a test fixture');
  if (next !== 'none') {
    T.insertTask(app.db, app.now, randomUUID, task({
      title: 'the next action', business_id: org.business, claim_id: made.id, is_next_action: true,
      owner_id: next === 'no-owner' ? null : 'u-SALES', owner_role: next === 'no-owner' ? 'SALES' : null,
      due_on: next === 'no-due' ? null : '2026-12-31',
    }));
  }
  return made.id;
}

function stageOf(app: App, claim: string): string | null {
  return app.db.get<{ stage: string | null }>('SELECT stage FROM claims WHERE id = ?', [claim])?.stage ?? null;
}

function why(r: { ok: boolean } & ({ ok: true } | { ok: false; why: string })): string {
  assert.equal(r.ok, false, 'expected a refusal');
  return r.ok ? '' : r.why;
}

/** node:sqlite returns rows with a null prototype, and deepStrictEqual compares prototypes: compare the values. */
function plain<V>(v: V): V {
  return v === undefined ? v : JSON.parse(JSON.stringify(v)) as V;
}

function businessNamed(db: Db, name: string): string {
  const b = db.get<{ id: string }>('SELECT id FROM businesses WHERE name = ?', [name]);
  assert.ok(b, name);
  return b.id;
}

function firstClaim(db: Db, business: string): string {
  const c = db.get<{ id: string }>('SELECT id FROM claims WHERE business_id = ? AND assessment_id IS NOT NULL ORDER BY claim_ref LIMIT 1', [business]);
  assert.ok(c);
  return c.id;
}

function realActor(s: { users: { id: string; role: AppRole }[] }, role: AppRole): Actor {
  const u = s.users.find((x) => x.role === role);
  assert.ok(u, role);
  return { id: u.id, role, business_id: null, disabled: false };
}

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

/**
 * THE CLOCK IS PASSED, NOT READ — Phase 132, 15 September 2026. The seed and the task this file sends are due on fixed
 * dates; on the wall clock a task due 1 September 2026 was not yet OVERDUE before then. The same fixed clock testApp() uses.
 */
async function bootSeeded(): Promise<{ made: Made; close(): void; signIn(who: string): Promise<Client> }> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-tasks-')), now: fixedClock() });
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

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

const GRANTED: Readonly<Record<string, readonly AppRole[]>> = Object.freeze({
  'staff_task.read': ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'],
  'staff_task.create': ['ADMIN', 'SALES'],
  'staff_task.write': ['ADMIN', 'SALES'],
  'staff_task.progress': ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'],
  'timeline.read': ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'],
  'automation_rule.read': ['ADMIN', 'SALES'],
  'automation_rule.write': ['ADMIN'],
  'email_template.read': ['ADMIN', 'SALES'],
  'email_template.write': ['ADMIN'],
  'email.queue': ['ADMIN', 'SALES'],
});

/**
 * THE OBJECT EACH ROLE IS ASKED ABOUT IS THE MOST FAVOURABLE ONE IT COULD BE: a
 * task it owns, on a claim an assigned job reaches — so a refusal is the ROLE
 * being refused, and not the object test failing.
 */
function objectFor(action: string, role: AppRole): Obj {
  const noun = action.split('.')[0];
  if (noun === 'staff_task') {
    return { type: 'staff_task', id: 't-1', business_id: 'biz-1', owner_id: `u-${role}`, owner_role: null, assigned_surveyor_ids: [`u-${role}`] };
  }
  if (noun === 'timeline') return { type: 'timeline', id: 'c-1', business_id: 'biz-1', assigned_surveyor_ids: [`u-${role}`] };
  if (noun === 'automation_rule') return { type: 'automation_rule', id: 'r-1' };
  if (noun === 'email_template') return { type: 'email_template', id: 'm-1' };
  return { type: 'email', id: 'c-1', business_id: 'biz-1' };
}

describe('who may do what — the ten new actions, every role', () => {
  test('each new action admits exactly the roles granted it, and REFUSES every other role — and a disabled user every one', () => {
    for (const [action, granted] of Object.entries(GRANTED)) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
      for (const role of APP_ROLES.filter((r) => r !== 'READ_ONLY') /* Phase 132e: READ_ONLY is asserted rule by rule in test/authz.test.ts */) {
        const a = actor(role, `u-${role}`, role === 'CLIENT' ? 'biz-1' : null);
        assert.equal(can(a, action, objectFor(action, role)), granted.includes(role),
          `${role} on ${action}: expected ${granted.includes(role) ? 'allowed' : 'REFUSED'}`);
      }
      assert.equal(can({ ...actor('ADMIN'), disabled: true }, action, objectFor(action, 'ADMIN')), false, `disabled ADMIN on ${action}`);
    }
  });

  test('ACCOUNTING and SURVEYING reach their own tasks and no others; a surveyor reaches nothing outside an assigned job; a predicate fails closed', () => {
    const acc = actor('ACCOUNTING');
    const sur = actor('SURVEYING');
    const t = (o: Partial<Extract<Obj, { type: 'staff_task' }>>): Obj =>
      ({ type: 'staff_task', id: 't', business_id: 'b', owner_id: null, owner_role: null, assigned_surveyor_ids: [], ...o });
    assert.equal(can(acc, 'staff_task.read', t({ owner_id: 'u-SALES' })), false, 'ACCOUNTING read somebody else’s task');
    assert.equal(can(acc, 'staff_task.read', t({ owner_role: 'ACCOUNTING' })), true, 'ACCOUNTING could not read a task waiting with Accounting');
    assert.equal(can(acc, 'staff_task.read', t({ owner_role: 'SALES' })), false, 'ACCOUNTING read a task waiting with Sales');
    assert.equal(can(sur, 'staff_task.read', t({ owner_id: 'u-SURVEYING', assigned_surveyor_ids: [] })), false, 'a surveyor read their task on a claim no job of theirs reaches');
    assert.equal(can(sur, 'staff_task.progress', t({ owner_id: 'u-SURVEYING', assigned_surveyor_ids: ['u-SURVEYING'] })), true);
    assert.equal(can(sur, 'timeline.read', { type: 'timeline', id: 'p', business_id: 'b', assigned_surveyor_ids: [] }), false);
    assert.equal(can(acc, 'staff_task.read', { type: 'business', id: 'b' } as unknown as Obj), false, 'a predicate read a field the object does not have');
  });
});

/* ================================================================== *
 * STAFF TASKS
 * ================================================================== */

describe('staff tasks — a job a colleague does, not a question the client answers', () => {
  test('two tables with no foreign key between them in either direction, and a task writes nothing to client_tasks', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const fks = (t: string): string[] => app.db.all<{ table: string }>('SELECT "table" FROM pragma_foreign_key_list(?)', [t]).map((r) => r.table);
      assert.equal(fks('staff_tasks').includes('client_tasks'), false);
      assert.equal(fks('client_tasks').includes('staff_tasks'), false);
      const before = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM client_tasks')?.n;
      assert.equal(T.createTask(deps(app), actor('SALES'), { business_id: org.business, title: 'Ring the accountant', activity_type: 'CALL', owner_id: 'u-SALES' }).ok, true);
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM client_tasks')?.n, before);
    } finally { app.close(); }
  });

  test('a task is about something; a claim and a property are their own organisation’s; the lists refuse at the store and at the table', async () => {
    const app = await testApp();
    try {
      staff(app);
      const a = organisation(app);
      const b = organisation(app);
      const c = claimAt(app, a, 'SURVEY');
      const d = deps(app);
      assert.match(why(T.createTask(d, actor('SALES'), { title: 'x', activity_type: 'TASK', owner_id: 'u-SALES' })), /about something/);
      assert.match(why(T.createTask(d, actor('SALES'), { claim_id: c, property_id: b.property, title: 'x', activity_type: 'TASK', owner_id: 'u-SALES' })), /claim’s own organisation/);
      assert.match(why(T.createTask(d, actor('SALES'), { business_id: a.business, title: 'x', activity_type: 'PHONE', owner_id: 'u-SALES' })), /kind of activity/);
      assert.match(why(T.createTask(d, actor('SALES'), { business_id: a.business, title: 'x', activity_type: 'TASK' })), /who owns this task/);
      assert.throws(() => T.insertTask(app.db, app.now, randomUUID, task({})), /CHECK constraint/);
      assert.throws(() => T.insertTask(app.db, app.now, randomUUID, task({ business_id: b.business, claim_id: c })), /FOREIGN KEY/);
      assert.throws(() => T.insertTask(app.db, app.now, randomUUID, task({ business_id: a.business, activity_type: 'PHONE' })), /activity_type/);
      const ok = T.createTask(d, actor('SALES'), { business_id: a.business, title: 'x', activity_type: 'TASK', owner_role: 'SALES' });
      assert.equal(ok.ok, true);
      if (ok.ok) assert.match(why(T.setTaskStatus(d, actor('SALES'), ok.id, 'DONE', null)), /not a status/);
      assert.throws(() => T.createTask(d, actor('ACCOUNTING'), { business_id: a.business, title: 'x', activity_type: 'TASK', owner_role: 'SALES' }), NotAuthorised);
    } finally { app.close(); }
  });

  test('CANCELLED, NEVER DELETED — and a completed or cancelled task keeps its record, with no reason in the audit line', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const d = deps(app);
      const made = T.createTask(d, actor('SALES'), { business_id: org.business, title: 'A job', activity_type: 'TASK', owner_id: 'u-SALES' });
      assert.ok(made.ok);
      assert.match(why(T.setTaskStatus(d, actor('SALES'), made.id, 'CANCELLED', null)), /with its reason/);
      assert.equal(T.setTaskStatus(d, actor('SALES'), made.id, 'CANCELLED', 'A reason nobody should find in the audit log').ok, true);
      assert.throws(() => app.db.run('DELETE FROM staff_tasks WHERE id = ?', [made.id]), /never deleted/);
      assert.throws(() => app.db.run('UPDATE staff_tasks SET title = ? WHERE id = ?', ['changed', made.id]), /keeps its record/);
      assert.match(why(T.setTaskStatus(d, actor('SALES'), made.id, 'COMPLETED', null)), /keeps its record/);
      assert.match(why(T.updateTask(d, actor('SALES'), made.id, { title: 'changed' })), /keeps its record/);
      assert.equal(app.audit.entries().some((e) => JSON.stringify(e.detail).includes('A reason nobody')), false);
      assert.equal(app.audit.verify().intact, true);
    } finally { app.close(); }
  });

  test('A RECURRENCE IS NOT A SCHEDULER: completing a monthly task creates the next, once, due a month on — and the next action carries over', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY', 'none');
      const d = deps(app);
      const made = T.createTask(d, actor('SALES'), {
        claim_id: c, title: 'Month-end check', activity_type: 'REVIEW', owner_id: 'u-SALES', due_on: '2026-01-31',
        recurrence: 'MONTHLY', as_next_action: 'yes',
      });
      assert.ok(made.ok, made.ok ? '' : made.why);
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM staff_tasks WHERE claim_id = ?', [c])?.n, 1, 'a recurrence created a task before completion');
      const done = T.setTaskStatus(d, actor('SALES'), made.id, 'COMPLETED', null);
      assert.ok(done.ok);
      const next = app.db.get<{ id: string; due_on: string; status: string; recurred_from_id: string; is_next_action: number; origin: string }>(
        'SELECT id, due_on, status, recurred_from_id, is_next_action, origin FROM staff_tasks WHERE recurred_from_id = ?', [made.id]);
      assert.deepEqual(
        next === undefined ? null : { due_on: next.due_on, status: next.status, is_next_action: next.is_next_action, origin: next.origin },
        { due_on: '2026-02-28', status: 'OPEN', is_next_action: 1, origin: 'RECURRENCE' });
      assert.match(why(T.setTaskStatus(d, actor('SALES'), made.id, 'COMPLETED', null)), /keeps its record/);
      assert.throws(() => T.insertTask(app.db, app.now, randomUUID, task({ business_id: org.business, recurred_from_id: made.id, origin: 'RECURRENCE' })), /UNIQUE/);
      assert.equal(T.addMonthsToDate('2026-03-31', 3), '2026-06-30');
      assert.equal(T.nextDueOn('2026-12-28', 'WEEKLY'), '2027-01-04');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * ONE NEXT ACTION
 * ================================================================== */

describe('one next action per claim, with an owner and a due date', () => {
  test('THE REFUSAL: a move that would leave a claim without one is refused — none, unowned, undated — and each negative control moves', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const none = claimAt(app, org, 'ASSESSMENT', 'none');
      const noOwner = claimAt(app, org, 'ASSESSMENT', 'no-owner');
      const noDue = claimAt(app, org, 'ASSESSMENT', 'no-due');
      const kept = claimAt(app, org, 'ASSESSMENT', 'full');
      const d = deps(app);
      const fwd = (c: string, extra: Partial<P.MoveRequest> = {}): P.MoveResult =>
        P.moveClaim(d, actor('SALES'), c, { kind: 'FORWARD', to: 'ENGAGEMENT', ...extra });

      for (const [c, reason] of [[none, /has no next action/], [noOwner, /nobody named as its owner/], [noDue, /has no due date/]] as const) {
        const r = fwd(c);
        assert.equal(r.ok, false, 'a move left a claim without one next action with an owner and a due date');
        if (!r.ok) {
          assert.match(r.why, /needs one next step, with an owner and a due date/);
          assert.match(r.why, reason);
        }
        assert.equal(stageOf(app, c), 'ASSESSMENT', 'a refused move changed the stage');
      }
      assert.ok(app.audit.entries().some((e) => e.kind === 'CLAIM_STAGE_MOVED' && e.outcome === 'REFUSED' && e.object_id === none));

      // NEGATIVE CONTROL: the same move, on a claim that keeps its next action.
      assert.equal(fwd(kept).ok, true);
      // A next action carried on the move is written with it, in the move's own transaction.
      const carried = fwd(none, { next_action: { title: 'Send the engagement letter', owner_id: 'u-SALES', due_on: '2026-10-01' } });
      assert.equal(carried.ok, true, carried.ok ? '' : carried.why);
      assert.equal(T.nextActionReading(app.db, { id: none, stage: 'ENGAGEMENT' }, app.now()).task?.title, 'Send the engagement letter');
      assert.ok(app.audit.entries().some((e) => e.kind === 'NEXT_ACTION_SET' && e.detail['claim'] === none));
      // One carried with no owner is refused exactly as one set in the panel is.
      assert.match(why(fwd(noDue, { next_action: { title: 'x', owner_id: null, due_on: '2026-10-01' } })), /has an owner/);
      // A hold is a move that leaves the claim open; an exit is not.
      assert.equal(P.moveClaim(d, actor('SALES'), noDue, { kind: 'HOLD', reason: 'waiting for the client' }).ok, false);
      const exit = P.moveClaim(d, actor('SALES'), noOwner, { kind: 'EXIT', to: 'CANCELLED', reason_code: 'OTHER', reason: 'a test' });
      assert.equal(exit.ok, true, 'an exit needed a next action — a claim that has finished keeps none');
      // The gate's refusal is still the gate's: it is asked first.
      const atEngagement = claimAt(app, org, 'ENGAGEMENT', 'none');
      assert.match(why(P.moveClaim(d, actor('SALES'), atEngagement, { kind: 'FORWARD', to: 'DATA_GATHERING' })), /Not ready to move on from Engagement yet/);
      // And at most one, at the database.
      assert.throws(() => T.insertTask(app.db, app.now, randomUUID, task({ business_id: org.business, claim_id: kept, is_next_action: true, due_on: '2026-12-31' })), /UNIQUE/);
    } finally { app.close(); }
  });

  test('setting it needs an owner and a due date, keeps the one before as a task, and is refused on a claim that has left the procedure', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const c = claimAt(app, org, 'SURVEY', 'none');
      const d = deps(app);
      assert.match(why(T.setNextAction(d, actor('SALES'), c, { title: 'x', due_on: '2026-10-01' })), /has an owner/);
      assert.match(why(T.setNextAction(d, actor('SALES'), c, { title: 'x', owner_id: 'u-SALES' })), /due date/);
      assert.equal(T.setNextAction(d, actor('SALES'), c, { title: 'first', owner_id: 'u-SALES', due_on: '2026-10-01' }).ok, true);
      assert.equal(T.setNextAction(d, actor('SALES'), c, { title: 'second', owner_id: 'u-ADMIN', due_on: '2026-10-02' }).ok, true);
      assert.deepEqual(
        plain(app.db.all<{ title: string; is_next_action: number; status: string }>(
          'SELECT title, is_next_action, status FROM staff_tasks WHERE claim_id = ? ORDER BY created_at', [c])),
        [{ title: 'first', is_next_action: 0, status: 'OPEN' }, { title: 'second', is_next_action: 1, status: 'OPEN' }]);
      const undated = T.createTask(d, actor('SALES'), { claim_id: c, title: 'undated', activity_type: 'TASK', owner_id: 'u-SALES' });
      assert.ok(undated.ok);
      assert.match(why(T.setNextAction(d, actor('SALES'), c, { task_id: undated.id })), /give that task both/);
      assert.throws(() => T.setNextAction(d, actor('ACCOUNTING'), c, { title: 'x', owner_id: 'u-SALES', due_on: '2026-10-01' }), NotAuthorised);
      assert.throws(() => T.setNextAction(d, actor('SURVEYING'), c, { title: 'x', owner_id: 'u-SALES', due_on: '2026-10-01' }), NotAuthorised);
      assert.equal(P.moveClaim(d, actor('SALES'), c, { kind: 'EXIT', to: 'LOST', reason_code: 'OTHER', reason: 'a test' }).ok, true);
      assert.match(why(T.setNextAction(d, actor('SALES'), c, { title: 'x', owner_id: 'u-SALES', due_on: '2026-10-01' })), /keeps no next action/);
      assert.equal(T.nextActionReading(app.db, { id: c, stage: 'LOST' }, app.now()).required, false);
    } finally { app.close(); }
  });

  test('THE BREAKERS LIST: every open claim breaking the rule and only those — and who is waiting is the engaged-client list’s own answer, where both waiting reads as ours', async () => {
    const app = await testApp();
    try {
      const s = await seed(app.db, app.hasher, app.now);
      const sales = realActor(s, 'SALES');
      const b = T.nextActionBreakers(app.db, sales, app.now());
      const of = (list: readonly T.BreakerRow[], name: string): readonly T.BreakerRow[] => list.filter((r) => r.client === name);
      assert.equal(of(b.breaking, 'Brackenfell Dental Partnership LLP')[0]?.reading.breaks, 'NONE');
      assert.equal(of(b.breaking, 'Corvale Supported Living Limited')[0]?.reading.breaks, 'NO_DUE_DATE');
      assert.equal(of(b.breaking, 'Dunmarrow Medical Practice Limited').length, 0);
      assert.equal(of(b.overdue, 'Aldergate Care Group Limited').length, 1, 'the overdue next action is not listed');
      const engaged = E.engagedClients(app.db, sales);
      for (const r of [...b.breaking, ...b.overdue]) {
        const e = engaged.find((x) => x.name === r.client);
        assert.ok(e && r.waiting, r.client);
        assert.deepEqual(r.waiting, { who: e.waiting_on, why: e.waiting_why }, `${r.client}: a second answer to who is waiting`);
      }
      const src = readFileSync(join(SRC, 'web/tasks.ts'), 'utf8');
      assert.match(src, /import \{ waitingOn, type WaitingOn \} from '\.\/engaged\.ts'/);
      assert.equal(/whoIsWaiting\(|letter_state/.test(src), false, 'tasks.ts has a waiting ladder of its own');

      const brackenfell = firstClaim(app.db, businessNamed(app.db, 'Brackenfell Dental Partnership LLP'));
      assert.equal(P.moveClaim(deps(app), sales, brackenfell, { kind: 'EXIT', to: 'CANCELLED', reason_code: 'OTHER', reason: 'a test' }).ok, true);
      assert.equal(of(T.nextActionBreakers(app.db, sales, app.now()).breaking, 'Brackenfell Dental Partnership LLP').length, 0, 'a claim that left the procedure is listed');
      assert.throws(() => T.nextActionBreakers(app.db, actor('ACCOUNTING'), app.now()), NotAuthorised);
      assert.throws(() => T.nextActionBreakers(app.db, actor('SURVEYING'), app.now()), NotAuthorised);
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * OVERDUE
 * ================================================================== */

describe('overdue — stored in UTC, shown in UK time, and no due date is neither', () => {
  test('at 00:30 BST on 11 September the UTC date is still the 10th: a task due on the 10th is OVERDUE by the UK date; in January the two agree', async () => {
    assert.equal('2026-09-10' < '2026-09-10T23:30:00.000Z'.slice(0, 10), false, 'the control: by the UTC date it is not overdue');
    assert.equal(T.dueReading('2026-09-10', '2026-09-10T23:30:00.000Z').state, 'OVERDUE');
    assert.equal(T.dueReading('2026-09-11', '2026-09-10T23:30:00.000Z').state, 'DUE_TODAY');
    assert.equal(T.dueReading('2026-01-10', '2026-01-10T23:30:00.000Z').state, 'DUE_TODAY');
    const none = T.dueReading(null, '2026-09-10T23:30:00.000Z');
    assert.deepEqual(none, { state: 'NO_DUE_DATE', overdue: false, label: T.NO_DUE_DATE });

    for (const f of ['web/tasks.ts', 'web/timeline.ts', 'web/automation.ts', 'web/templates.ts', 'web/tasks-pages.ts']) {
      assert.equal(/Europe\/|timeZone|getTimezoneOffset/.test(readFileSync(join(SRC, f), 'utf8')), false, `${f} names a zone`);
    }

    // N4 — NO REQUIRED FIELD FORCES A GUESS: a task needs no due date and no priority, and is not counted either way.
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      assert.equal(T.createTask(deps(app), actor('SALES'), { business_id: org.business, title: 'No date given', activity_type: 'TASK', owner_id: 'u-SALES' }).ok, true);
      const mine = T.myWork(app.db, actor('SALES'), app.now());
      assert.equal(mine.tasks.find((t) => t.title === 'No date given')?.due.state, 'NO_DUE_DATE');
      assert.equal(mine.overdue, 0);
    } finally { app.close(); }
  });

  test('FLAGGED on the claim, on the owner’s list and on the landing page — a task and a client question alike; and MY TASKS on the landing page for every staff role', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const b1 = businessNamed(db, 'Aldergate Care Group Limited');
      const b1claim = firstClaim(db, b1);
      const sales = await h.signIn('sales');
      assert.equal((await sales.post(`/staff/clients/${b1}/tasks/send`, {
        fact_id: '', question: 'Is the roof original?', why: 'we need it', holds_up: 'the survey', due_on: '2026-09-01',
      })).status, 303);
      // PHASE 136: Home is rows of tiles. The overdue question is a red tile in "Today and overdue"; MY TASKS is on Tasks.
      const home = await sales.req('/staff');
      assert.equal(home.status, 200);
      assert.match(home.body, /<li class="tile hometile late"><a class="tilelink" href="\/staff\/clients\/[^"]+"><span class="tilename">Aldergate Care Group Limited<\/span><span class="tileline">Question: Is the roof original\?<\/span>/,
        'the landing page does not show the overdue question as a red tile');
      assert.ok((await sales.req('/staff/tasks')).body.includes('OVERDUE'), 'the owner’s list does not flag it');
      const claimPage = await sales.req(`/staff/claims/${b1claim}`);
      assert.ok(claimPage.body.includes('OVERDUE') && claimPage.body.includes('Is the roof original?'), 'the claim does not flag it');

      // Every task a login may read that is due today or late is on its Home — its own and its team's for Accounting and
      // Surveying, every one it may read for Sales, Admin and Read only — and a task not yet due is not.
      const now = h.made.app.now();
      for (const [who, role] of [['sales', 'SALES'], ['accounting', 'ACCOUNTING'], ['surveying', 'SURVEYING'], ['admin', 'ADMIN']] as const) {
        const a = db.get<{ id: string }>('SELECT id FROM users WHERE role = ? LIMIT 1', [role]);
        assert.ok(a);
        const me: Actor = { id: a.id, role, business_id: null, disabled: false };
        const due = role === 'ACCOUNTING' || role === 'SURVEYING'
          ? T.myWork(db, me, now).tasks.filter((t) => t.due.state === 'OVERDUE' || t.due.state === 'DUE_TODAY')
          : T.tasksDueByToday(db, me, now);
        const r = await (await h.signIn(who)).req('/staff');
        assert.equal(r.status, 200, who);
        for (const t of due) assert.ok(r.body.includes(`href="/staff/tasks/${t.id}"`), `${who}’s Home is missing a task due by today: ${t.title}`);
        const later = T.myWork(db, me, now).tasks.filter((t) => t.due.state === 'NOT_YET_DUE' || t.due.state === 'NO_DUE_DATE');
        for (const t of later) assert.equal(r.body.includes(`href="/staff/tasks/${t.id}"`), false, `${who}’s Home shows a task not yet due: ${t.title}`);
        assert.ok((await (await h.signIn(who)).req('/staff/tasks')).body.includes('My tasks'), `${who}: My tasks is on Tasks`);
      }
      const salesTasks = db.all<{ id: string }>("SELECT t.id FROM staff_tasks t JOIN users u ON u.id = t.owner_id WHERE u.role = 'SALES'");
      for (const who of ['accounting', 'surveying'] as const) {
        const body = (await (await h.signIn(who)).req('/staff')).body;
        for (const t of salesTasks) assert.equal(body.includes(`href="/staff/tasks/${t.id}"`), false, `${who} saw Sales’s task`);
      }
      assert.equal((await (await h.signIn('client')).req('/staff')).status, 403);
    } finally { h.close(); }
  });

  test('over HTTP: the breakers list, the rules and the templates admit Admin and Sales, and refuse Accounting and Surveying', async () => {
    const h = await bootSeeded();
    try {
      for (const who of ['admin', 'sales']) {
        const c = await h.signIn(who);
        for (const path of ['/staff/next-actions', '/staff/automation', '/staff/templates', '/staff/tasks?view=all']) {
          assert.equal((await c.req(path)).status, 200, `${who} refused ${path}`);
        }
      }
      for (const who of ['accounting', 'surveying']) {
        const c = await h.signIn(who);
        for (const path of ['/staff/next-actions', '/staff/automation', '/staff/templates']) {
          assert.equal((await c.req(path)).status, 403, `${who} reached ${path}`);
        }
        assert.equal((await c.post('/staff/tasks', { title: 'x', activity_type: 'TASK', owner_role: 'SALES', business_id: 'x' })).status, 403, `${who} added a task`);
      }
    } finally { h.close(); }
  });
});

/* ================================================================== *
 * THE TIMELINE
 * ================================================================== */

describe('the timeline is a read over what is already recorded — not a second log', () => {
  test('migration 012 creates four tables and no event, timeline or activity table: the event-named tables are exactly the ones before it', async () => {
    const sql = readFileSync(join(MIGRATIONS, '012-staff-tasks-automation-templates.sql'), 'utf8');
    assert.deepEqual([...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]).sort(),
      ['automation_rules', 'automation_runs', 'email_templates', 'staff_tasks']);
    const dir = mkdtempSync(join(tmpdir(), 'cb-before-012-'));
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql') && x < '012')) copyFileSync(join(MIGRATIONS, f), join(dir, f));
    const before = new Db(':memory:');
    migrate(before, dir);
    const eventish = (db: Db): string[] => db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%event%' OR name LIKE '%timeline%' OR name LIKE '%activit%') ORDER BY name",
    ).map((r) => r.name);
    const app = await testApp();
    try {
      assert.deepEqual(eventish(app.db), eventish(before));
    } finally { app.close(); before.close(); }
  });

  test('a claim, an organisation and a property: events from the tables that hold them; notes apart, in the data; what the client sees is marked', async () => {
    const app = await testApp();
    try {
      const s = await seed(app.db, app.hasher, app.now);
      const sales = realActor(s, 'SALES');
      const admin = realActor(s, 'ADMIN');
      const d = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
      const b4 = businessNamed(app.db, 'Dunmarrow Medical Practice Limited');
      const claim = firstClaim(app.db, b4);
      assert.equal(E.sendTaskToPortal(d, sales, b4, { fact_id: null, question: 'Which year was the extension built?', why: 'w', holds_up: 'h' }).ok, true);
      assert.equal(E.addNote(d, sales, b4, 'A note about the claim, for staff only', { claim_id: claim }).ok, true);

      const t = TL.timelineFor(app.db, sales, { kind: 'claim', id: claim });
      assert.ok(t.internal_notes?.some((x) => x.body === 'A note about the claim, for staff only' && / · CR-\d{4}-\d{4}$/.test(x.about)), 'the note is not in the notes'); // Phase 134: named by its property, the reference last
      assert.equal(t.events.some((e) => e.what.includes('A note about the claim')), false, 'a note reached the events');
      const put = t.events.find((e) => e.what.startsWith('A question was put to the client') && e.what.includes('Which year was the extension built?'));
      assert.equal(put?.audience, 'CLIENT_SEES');
      const cats = new Set(t.events.map((e) => e.category));
      for (const c of ['BOOKING', 'ENGAGEMENT', 'TASK', 'CLIENT_QUESTION']) assert.ok(cats.has(c as TL.Category), `no ${c} event`);
      assert.equal(cats.has('FINANCE'), false, 'SALES, which is not on invoice.read, was given the invoices');
      assert.ok(TL.timelineFor(app.db, admin, { kind: 'claim', id: claim }).events.some((e) => e.category === 'FINANCE'), 'ADMIN was not given the invoices');
      for (const e of t.events) assert.ok(e.at !== '' && e.when !== '' && e.scope !== '', 'an event is missing its time or its scope');
      assert.equal(t.read_not_log, TL.READ_NOT_LOG);

      const b5 = businessNamed(app.db, 'Elverton Private Hospital Limited');
      const refs = app.db.all<{ claim_ref: string; property_id: string }>('SELECT claim_ref, property_id FROM claims WHERE business_id = ? ORDER BY claim_ref', [b5]);
      assert.equal(refs.length, 3); // Phase 134: the annexe has a claim of its own
      const orgScopes = new Set(TL.timelineFor(app.db, sales, { kind: 'organisation', id: b5 }).events.map((e) => e.scope));
      const propScopes = new Set(TL.timelineFor(app.db, sales, { kind: 'property', id: refs[0]?.property_id ?? '' }).events.map((e) => e.scope));
      for (const r of refs) {
        // Phase 134: a claim in the timeline is named by its property, and its reference ends the words.
        assert.ok([...orgScopes].some((x) => x.endsWith(` · ${r.claim_ref}`)), `the organisation’s timeline has nothing from ${r.claim_ref}`);
        if (r.property_id !== refs[0]?.property_id) continue;
        assert.ok([...propScopes].some((x) => x.endsWith(` · ${r.claim_ref}`)), `the property’s timeline has nothing from ${r.claim_ref}`);
      }
    } finally { app.close(); }
  });

  test('ACCOUNTING: financial events only. SURVEYING: only an assigned job’s claim — its stage, its own tasks and its commitment. CLIENT: none', async () => {
    const app = await testApp();
    try {
      const s = await seed(app.db, app.hasher, app.now);
      const accounting = realActor(s, 'ACCOUNTING');
      const surveying = realActor(s, 'SURVEYING');
      const b4 = businessNamed(app.db, 'Dunmarrow Medical Practice Limited');
      const b5 = businessNamed(app.db, 'Elverton Private Hospital Limited');

      const ta = TL.timelineFor(app.db, accounting, { kind: 'claim', id: firstClaim(app.db, b5) });
      assert.ok(ta.events.length > 0, 'ACCOUNTING’s timeline is empty — the check below would prove nothing');
      assert.deepEqual([...new Set(ta.events.map((e) => e.category))], ['FINANCE']);
      assert.equal('internal_notes' in ta, false);
      assert.equal(ta.limited_to, TL.FINANCE_ONLY);
      assert.throws(() => TL.timelineFor(app.db, accounting, { kind: 'organisation', id: b5 }), NotAuthorised);
      assert.throws(() => TL.timelineFor(app.db, accounting, { kind: 'property', id: app.db.get<{ id: string }>('SELECT id FROM properties WHERE business_id = ?', [b5])?.id ?? '' }), NotAuthorised);

      const b4claim = firstClaim(app.db, b4);
      const ts = TL.timelineFor(app.db, surveying, { kind: 'claim', id: b4claim });
      assert.ok([...new Set(ts.events.map((e) => e.category))].every((c) => ['STAGE', 'TASK', 'SURVEY'].includes(c)), 'a surveyor was given more than the job reaches');
      assert.ok(ts.events.some((e) => e.what.includes('Check the floor plans against the room schedule')), 'the surveyor’s own task is missing');
      assert.equal(ts.events.some((e) => e.what.includes('Confirm the surveyor has the floor plans')), false, 'a surveyor saw Sales’s task');
      assert.ok(ts.events.filter((e) => e.category === 'STAGE').every((e) => e.who === null && /now at/.test(e.what)), 'a surveyor was given a stage move’s reasons or who made it');
      assert.equal(ts.limited_to, TL.SURVEY_ONLY);
      assert.equal('internal_notes' in ts, false);
      assert.throws(() => TL.timelineFor(app.db, surveying, { kind: 'claim', id: firstClaim(app.db, businessNamed(app.db, 'Aldergate Care Group Limited')) }), NotAuthorised);
      assert.throws(() => TL.timelineFor(app.db, surveying, { kind: 'property', id: app.db.get<{ id: string }>('SELECT property_id AS id FROM claims WHERE id = ?', [b4claim])?.id ?? '' }), NotAuthorised);
      assert.throws(() => TL.timelineFor(app.db, surveying, { kind: 'organisation', id: b4 }), NotAuthorised);
      const lead = app.db.get<{ id: string }>('SELECT id FROM leads WHERE business_id = ?', [b4]);
      assert.ok(lead);
      assert.throws(() => TL.timelineFor(app.db, surveying, { kind: 'lead', id: lead.id }), NotAuthorised);

      const clientUser = s.users.find((u) => u.role === 'CLIENT');
      assert.ok(clientUser);
      const clientBusiness = app.db.get<{ business_id: string }>('SELECT business_id FROM users WHERE id = ?', [clientUser.id])?.business_id ?? null;
      const client: Actor = { id: clientUser.id, role: 'CLIENT', business_id: clientBusiness, disabled: false };
      assert.throws(() => TL.timelineFor(app.db, client, { kind: 'claim', id: firstClaim(app.db, clientBusiness ?? '') }), NotAuthorised);
    } finally { app.close(); }
  });

  test('THE GATED-EXIT LEAD: its call and its person are on the LEAD’s timeline, where a read keyed on the organisation would drop them — and on the organisation’s once they move', async () => {
    const app = await testApp();
    try {
      staff(app);
      const lead = L.openLeadForGatedExit(app.db, randomUUID, { prospect_organisation: 'Gated Invented Limited', at: T0 });
      app.db.run(
        'INSERT INTO contacts (id, business_id, lead_id, full_name, contact_consent, marketing_optin, phone, created_at) VALUES (?, NULL, ?, ?, 1, 0, ?, ?)',
        [randomUUID(), lead, 'Asked At The Gate', '01632 960001', T0]);
      app.db.run("INSERT INTO bookings (id, business_id, lead_id, channel, entry_point, created_at) VALUES (?, NULL, ?, 'phone', 'gated_exit', ?)",
        [randomUUID(), lead, T0]);
      assert.equal(app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM bookings WHERE business_id IS NULL AND lead_id = ?', [lead])?.n, 1);

      const t = TL.timelineFor(app.db, actor('SALES'), { kind: 'lead', id: lead });
      assert.ok(t.events.some((e) => e.category === 'BOOKING' && e.scope === 'this lead'), 'the call is not on the lead’s timeline');
      assert.ok(t.events.some((e) => e.category === 'CONTACT'), 'the person who asked is not on the lead’s timeline');

      const org = organisation(app);
      assert.equal(TL.timelineFor(app.db, actor('SALES'), { kind: 'organisation', id: org.business }).events.some((e) => e.category === 'BOOKING'), false);
      // What conversion does to these rows (row E22): the same rows move onto the organisation.
      app.db.run('UPDATE leads SET business_id = ?, prospect_organisation = NULL WHERE id = ?', [org.business, lead]);
      app.db.run('UPDATE contacts SET business_id = ? WHERE lead_id = ?', [org.business, lead]);
      app.db.run('UPDATE bookings SET business_id = ? WHERE lead_id = ?', [org.business, lead]);
      assert.ok(TL.timelineFor(app.db, actor('SALES'), { kind: 'organisation', id: org.business }).events.some((e) => e.category === 'BOOKING'),
        'the call moved onto the organisation and its timeline dropped it');
    } finally { app.close(); }
  });
});

/* ================================================================== *
 * A CONTACT'S LAST CONTACT AND FOLLOW-UP (rows 5.11 and 5.12)
 * ================================================================== */

describe('a contact’s last contact is derived from the timeline, and a follow-up is a task', () => {
  test('N4: never contacted, a cancelled call and an unsent email read IDENTICALLY; a completed call is a contact; both old fields are refused, by the store and by the table', async () => {
    const app = await testApp();
    try {
      staff(app);
      const org = organisation(app);
      const cd: C.CrmDeps = { db: app.db, audit: app.audit, now: app.now, newId: randomUUID };
      const made = C.addContact(cd, actor('SALES'), org.business, { full_name: 'Finance Contact', email: 'finance@org.example.invalid' });
      assert.ok(made.ok);
      const read = (): C.ContactView => {
        const c = C.contactsFor(app.db, actor('SALES'), org.business).find((x) => x.id === made.id);
        assert.ok(c);
        return c;
      };
      const never = read();
      assert.deepEqual({ at: never.last_contact_at, label: never.last_contact }, { at: null, label: TL.NO_CONTACT_RECORDED });

      const d = deps(app);
      const call = T.createTask(d, actor('SALES'), { business_id: org.business, contact_id: made.id, title: 'Ring them', activity_type: 'CALL', owner_id: 'u-SALES', due_on: '2026-10-01' });
      assert.ok(call.ok);
      assert.deepEqual({ due: read().next_follow_up_at, open: read().follow_ups_open }, { due: '2026-10-01', open: 1 });
      assert.equal(T.setTaskStatus(d, actor('SALES'), call.id, 'CANCELLED', 'wrong number').ok, true);
      app.db.run("INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, transport, business_id) VALUES (?, ?, ?, 'x', 'x', 'NOTIFICATION', NULL, 'STUB', ?)",
        [randomUUID(), T0, 'finance@org.example.invalid', org.business]);
      const cancelled = read();
      assert.deepEqual({ at: cancelled.last_contact_at, label: cancelled.last_contact }, { at: never.last_contact_at, label: never.last_contact },
        'a cancelled call or an unsent email read differently from never having been contacted');
      assert.equal(cancelled.next_follow_up_at, null);

      const call2 = T.createTask(d, actor('SALES'), { business_id: org.business, contact_id: made.id, title: 'Ring them again', activity_type: 'CALL', owner_id: 'u-SALES' });
      assert.ok(call2.ok);
      assert.equal(T.setTaskStatus(d, actor('SALES'), call2.id, 'COMPLETED', null).ok, true);
      const completedAt = app.db.get<{ at: string }>('SELECT completed_at AS at FROM staff_tasks WHERE id = ?', [call2.id])?.at ?? null;
      assert.equal(read().last_contact_at, completedAt);
      assert.match(read().last_contact, /completed call/);

      assert.equal(C.updateContact(cd, actor('SALES'), made.id, { next_follow_up_at: '2026-10-01' }).ok, false);
      assert.equal(C.updateContact(cd, actor('SALES'), made.id, { last_contact_at: '2026-10-01' }).ok, false);
      assert.throws(() => app.db.run('UPDATE contacts SET next_follow_up_at = ? WHERE id = ?', ['2026-10-01', made.id]), /retired/);
      assert.throws(() => app.db.run('UPDATE contacts SET last_contact_at = ? WHERE id = ?', ['2026-10-01', made.id]), /derived/);
    } finally { app.close(); }
  });

  test('migration 012 carries a claim’s next action and a contact’s follow-up into tasks, keeps a recorded last contact, and retires the columns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-012-'));
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql') && x < '012')) copyFileSync(join(MIGRATIONS, f), join(dir, f));
    const db = new Db(':memory:');
    try {
      migrate(db, dir);
      db.run("INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES ('u-S','s@example.invalid','s@example.invalid','Sales Person','SALES','x',?,?,NULL)", [T0, T0]);
      db.run("INSERT INTO businesses (id,name,sector,stage,created_at) VALUES ('b','Old Limited','dental','ASSESSMENT_SUBMITTED',?)", [T0]);
      db.run("INSERT INTO claims (id, claim_ref, business_id, workstream, stage, owner_id, next_action, next_action_due, created_at, updated_at) VALUES ('c-open','CR-2026-0001','b','UNKNOWN','SURVEY','u-S','Ring the client back','2026-10-02',?,?)", [T0, T0]);
      db.run("INSERT INTO claims (id, claim_ref, business_id, workstream, stage, owner_id, next_action, next_action_due, created_at, updated_at) VALUES ('c-gone','CR-2026-0002','b','UNKNOWN','CANCELLED',NULL,'Send the closing letter',NULL,?,?)", [T0, T0]);
      db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, next_follow_up_at, last_contact_at) VALUES ('ct','b','Finance Contact',0,0,?,'2026-10-03','2026-08-01')", [T0]);
      copyFileSync(join(MIGRATIONS, '012-staff-tasks-automation-templates.sql'), join(dir, '012-staff-tasks-automation-templates.sql'));
      migrate(db, dir);

      const rows = db.all<{ claim_id: string | null; title: string; due_on: string | null; owner_id: string | null; owner_role: string | null; is_next_action: number; origin: string; contact_id: string | null; activity_type: string }>(
        'SELECT claim_id, title, due_on, owner_id, owner_role, is_next_action, origin, contact_id, activity_type FROM staff_tasks ORDER BY title');
      assert.deepEqual(plain(rows), [
        { claim_id: null, title: 'Follow up with this contact', due_on: '2026-10-03', owner_id: null, owner_role: 'SALES', is_next_action: 0, origin: 'MIGRATION', contact_id: 'ct', activity_type: 'CALL' },
        { claim_id: 'c-open', title: 'Ring the client back', due_on: '2026-10-02', owner_id: 'u-S', owner_role: null, is_next_action: 1, origin: 'MIGRATION', contact_id: null, activity_type: 'TASK' },
        { claim_id: 'c-gone', title: 'Send the closing letter', due_on: null, owner_id: null, owner_role: null, is_next_action: 0, origin: 'MIGRATION', contact_id: null, activity_type: 'TASK' },
      ]);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims WHERE next_action IS NOT NULL OR next_action_due IS NOT NULL')?.n, 0);
      assert.equal(db.get<{ v: string | null }>("SELECT next_follow_up_at AS v FROM contacts WHERE id = 'ct'")?.v, null);
      assert.equal(db.get<{ v: string | null }>("SELECT last_contact_at AS v FROM contacts WHERE id = 'ct'")?.v, '2026-08-01', 'a recorded last contact was lost');
      assert.match(TL.lastContactFor(db, { id: 'ct', email: null, last_contact_at: '2026-08-01' }).label, /recorded by staff before/);
      assert.throws(() => db.run("UPDATE claims SET next_action = 'x' WHERE id = 'c-open'"), /retired/);
    } finally { db.close(); }
  });
});

/* ================================================================== *
 * STORED CROSS-SITE SCRIPTING
 * ================================================================== */

describe('STORED CROSS-SITE SCRIPTING', () => {
  test('a task’s title and description and a note on a claim are escaped on the claim page, the task page, my tasks and the landing page', async () => {
    const h = await bootSeeded();
    try {
      const db = h.made.app.db;
      const claim = firstClaim(db, businessNamed(db, 'Dunmarrow Medical Practice Limited'));
      const salesId = db.get<{ id: string }>("SELECT id FROM users WHERE role = 'SALES' LIMIT 1")?.id ?? '';
      const sales = await h.signIn('sales');
      assert.equal((await sales.post('/staff/tasks', {
        // PHASE 136: due today, so it is on Home's "Today and overdue" row, which is where Home draws a task now.
        claim_id: claim, title: SCRIPT, description: SCRIPT, activity_type: 'TASK', owner_id: salesId, back: `/staff/claims/${claim}`,
        due_on: localDate(h.made.app.now()),
      })).status, 303);
      assert.equal((await sales.post(`/staff/claims/${claim}/notes`, { body: SCRIPT })).status, 303);
      const taskId = db.get<{ id: string }>('SELECT id FROM staff_tasks WHERE title = ?', [SCRIPT])?.id ?? '';
      assert.equal(db.get<{ v: string }>('SELECT body AS v FROM internal_notes WHERE claim_id = ?', [claim])?.v, SCRIPT);
      for (const path of [`/staff/claims/${claim}`, `/staff/tasks/${taskId}`, '/staff/tasks', '/staff']) {
        const page = await sales.req(path);
        assert.equal(page.status, 200, path);
        assert.equal(page.body.includes('<script>alert(1)</script>'), false, `a script tag reached ${path}`);
        assert.equal(/<img[\s>]/i.test(page.body), false, `an unescaped img tag reached ${path}`);
        assert.match(page.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, `the value was not rendered at all on ${path}`);
      }
    } finally { h.close(); }
  });
});
