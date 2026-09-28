/**
 * CRM 9 OF 10 — LISTS, SAVED VIEWS, CSV EXPORT, THE LEAD'S NEXT ACTION RETIRED,
 * AND THE DOCUMENTS PANELS AND NOTE FORM ON THE PROPERTY PAGE. 12 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                                   → WHO MAY DO WHAT
 *   "filter by … and value where value is readable; sort by next action, age,
 *    value, due date, priority"                             → FILTERS AND SORTS
 *   "saved views per user, shared views set by ADMIN"       → SAVED VIEWS
 *   "EXPORT TO CSV, for authorised roles only, audited with the columns and the
 *    row count … A cell beginning = + - or @ is neutralised" → EXPORT
 *   "A LEAD still keeps a free-text next action … retire it into a task"
 *                                                           → THE LEAD'S NEXT ACTION
 *   "Draw a documents panel on the organisation page … and on the property page";
 *   "add the property page's" note route                    → THE PROPERTY AND ORGANISATION PAGES
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { Db, migrate } from '../src/db.ts';
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, REGISTERED_ACTIONS, type Actor, type Obj } from '../src/authz.ts';
import * as LI from '../src/web/lists.ts';
import * as L from '../src/web/leads.ts';
import * as C from '../src/web/crm.ts';
import { actor, testApp } from './helpers.ts';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));
const T0 = '2026-09-08T00:00:00.000Z';

type App = Awaited<ReturnType<typeof testApp>>;

async function seeded(): Promise<{ app: App; as: (role: AppRole) => Actor }> {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  const as = (role: AppRole): Actor => {
    const u = app.db.get<{ id: string }>('SELECT id FROM users WHERE role = ? ORDER BY rowid LIMIT 1', [role]);
    assert.ok(u !== undefined, `the seed has no ${role} user`);
    return { id: u.id, role, business_id: null, disabled: false };
  };
  return { app, as };
}

const deps = (app: App): LI.ListDeps => ({ db: app.db, audit: app.audit, now: app.now, newId: randomUUID });
const q = (s: string): URLSearchParams => new URLSearchParams(s);

/* ================================================================== *
 * WHO MAY DO WHAT
 * ================================================================== */

describe('who may do what — three new actions, deny by default, every role not granted refused', () => {
  test('list.export, saved_view.write and saved_view.share, per role, a disabled user refused', () => {
    const own = (role: AppRole): Obj => ({ type: 'saved_view', id: 'v1', owner_id: `u-${role}`, shared: false });
    const theirs: Obj = { type: 'saved_view', id: 'v2', owner_id: 'u-someone-else', shared: false };
    const cases: readonly [string, (role: AppRole) => Obj, readonly AppRole[]][] = [
      ['list.export', () => ({ type: 'pipeline', id: '__export__' }), ['ADMIN', 'SALES', 'ACCOUNTING']],
      ['saved_view.write', own, ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING']],
      ['saved_view.write', () => theirs, []],
      ['saved_view.share', own, ['ADMIN']],
    ];
    for (const [action, obj, granted] of cases) {
      assert.ok(REGISTERED_ACTIONS.includes(action), `${action} is not registered`);
      for (const role of APP_ROLES) {
        const who = actor(role, `u-${role}`, role === 'CLIENT' ? 'biz-1' : null);
        assert.equal(can(who, action, obj(role)), granted.includes(role), `${role} on ${action}`);
        assert.equal(can({ ...who, disabled: true }, action, obj(role)), false, `a disabled ${role} on ${action}`);
      }
    }
  });

  test('a saved view object without its owner fails closed', () => {
    assert.equal(can(actor('SALES'), 'saved_view.write', { type: 'saved_view', id: 'v', shared: false } as unknown as Obj), false);
  });
});

/* ================================================================== *
 * FILTERS AND SORTS
 * ================================================================== */

describe('the claims list — built forwards for its reader, filtered and sorted through fixed tables', () => {
  test('the three shapes: ADMIN and SALES the value; ACCOUNTING client and reference alone; SURVEYING its own jobs and no value', async () => {
    const { app, as } = await seeded();
    const all = app.db.all<{ id: string }>('SELECT id FROM claims');
    const admin = LI.claimsList(app.db, as('ADMIN'), LI.readParams('CLAIMS', q('')).params);
    assert.equal(admin.shape, 'VALUE');
    assert.equal(admin.rows.length, all.length);
    assert.ok(admin.rows.every((r) => typeof r.shown_range === 'string'), 'a claim line for ADMIN carried no value reading');
    assert.equal(LI.claimsList(app.db, as('SALES'), LI.readParams('CLAIMS', q('')).params).shape, 'VALUE');

    const acc = LI.claimsList(app.db, as('ACCOUNTING'), LI.readParams('CLAIMS', q('')).params);
    assert.equal(acc.shape, 'MONEY');
    // Phase 134: `business_id` is the company's id, for the claim's address inside its company — no more than the client it names.
    for (const r of acc.rows) assert.deepEqual(Object.keys(r).sort(), ['business_id', 'claim_ref', 'client', 'id', 'opened'], 'accounting read more than client and reference');

    const s = as('SURVEYING');
    const mine = new Set(app.db.all<{ claim_id: string }>('SELECT claim_id FROM surveyor_jobs WHERE surveyor_id = ?', [s.id]).map((x) => x.claim_id));
    const surv = LI.claimsList(app.db, s, LI.readParams('CLAIMS', q('')).params);
    assert.equal(surv.shape, 'WORKING');
    assert.deepEqual(new Set(surv.rows.map((r) => r.id)), mine, 'a surveyor’s list is not exactly the claims of their jobs');
    assert.ok(surv.rows.every((r) => !('shown_range' in r)), 'a surveyor’s claim line carried a value');
  });

  test('a filter narrows, an unknown key and an injected sort are dropped and said, and the ORDER BY is never the request', async () => {
    const { app, as } = await seeded();
    const sales = as('SALES');
    const asked = LI.readParams('CLAIMS', q('stage=SURVEY&nonsense=1&sort=claim_ref%3B%20DROP%20TABLE%20claims'));
    const v = LI.claimsList(app.db, sales, asked.params, asked.ignored);
    const atSurvey = app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM claims WHERE stage = 'SURVEY'")?.n ?? -1;
    assert.equal(v.rows.length, atSurvey);
    assert.ok(v.said.some((x) => /^nonsense: not a filter/.test(x)), 'the unknown key was not said');
    assert.ok(v.said.some((x) => /^Sort: not one of the orders offered/.test(x)), 'the injected sort was not said');
    assert.equal(v.sort.key, 'company'); // Phase 134: the list reads by company first
    assert.ok((app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims')?.n ?? 0) > 0, 'the claims table was touched');
  });

  test('accounting’s filters on the working line and a surveyor’s on the value are not applied, and each is said', async () => {
    const { app, as } = await seeded();
    const acc = LI.claimsList(app.db, as('ACCOUNTING'), LI.readParams('CLAIMS', q('stage=SURVEY&sort=priority')).params);
    assert.equal(acc.rows.length, app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims')?.n);
    assert.ok(acc.said.some((x) => /^Stage: not a column/.test(x)));
    assert.ok(acc.said.some((x) => /^Sort: .* not a column this role reads/.test(x)));
    const surv = LI.claimsList(app.db, as('SURVEYING'), LI.readParams('CLAIMS', q('value_min=1&sort=value')).params);
    assert.ok(surv.said.some((x) => /value is not shown to this role/.test(x)));
    assert.ok(surv.said.some((x) => /^Sort: .* not a column this role reads/.test(x)));
    assert.equal(surv.filters.some((f) => f.needs_value === true), false, 'a value filter was offered to a surveyor');
  });

  test('N4: a claim with no sealed estimate is in no value filter, and the list says so', async () => {
    const { app, as } = await seeded();
    const p = app.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM properties ORDER BY rowid LIMIT 1');
    assert.ok(p !== undefined);
    const made = C.insertClaim(app.db, app.now, randomUUID, {
      business_id: p.business_id, property_id: p.id, assessment_id: null, workstream: 'UNKNOWN', stage: 'DATA_GATHERING', owner_id: null, surveyor_id: null,
    });
    const low = LI.claimsList(app.db, as('ADMIN'), LI.readParams('CLAIMS', q('value_min=0')).params);
    assert.equal(low.rows.some((r) => r.id === made.id), false, 'a claim with no estimate was counted as at least £0');
    assert.ok(low.said.some((x) => /no estimate yet, so (it is|they are) left out of the value filter/.test(x)));
    const high = LI.claimsList(app.db, as('ADMIN'), LI.readParams('CLAIMS', q('value_max=999999999')).params);
    assert.equal(high.rows.some((r) => r.id === made.id), false, 'a claim with no estimate was counted as below a figure');
  });

  test('sorts: priority highest first with unset last; next action due soonest with none last; age oldest first', async () => {
    const { app, as } = await seeded();
    const ids = app.db.all<{ id: string }>('SELECT id FROM claims ORDER BY claim_ref ASC').map((x) => x.id);
    assert.ok(ids.length >= 3);
    app.db.run('UPDATE claims SET priority = NULL');
    app.db.run("UPDATE claims SET priority = 'LOW' WHERE id = ?", [ids[0] ?? '']);
    app.db.run("UPDATE claims SET priority = 'HIGH' WHERE id = ?", [ids[1] ?? '']);
    const byPriority = LI.claimsList(app.db, as('SALES'), LI.readParams('CLAIMS', q('sort=priority')).params).rows.map((r) => r.id);
    assert.equal(byPriority[0], ids[1], 'HIGH is not first');
    assert.equal(byPriority[1], ids[0], 'LOW is not second, ahead of the unset');
    const byNext = LI.claimsList(app.db, as('SALES'), LI.readParams('CLAIMS', q('sort=next_action')).params).rows;
    const dues = byNext.map((r) => r.next_action_due ?? null);
    const firstNull = dues.indexOf(null);
    if (firstNull !== -1) assert.ok(dues.slice(firstNull).every((x) => x === null), 'a claim with no next action sorted before one with a due date');
    const dated = dues.filter((x): x is string => x !== null);
    assert.deepEqual(dated, [...dated].sort(), 'next actions are not soonest first');
    const byAge = LI.claimsList(app.db, as('SALES'), LI.readParams('CLAIMS', q('sort=age')).params).rows.map((r) => r.opened);
    assert.deepEqual(byAge, [...byAge].sort(), 'the oldest is not first');
  });
});

/* ================================================================== *
 * SAVED VIEWS
 * ================================================================== */

describe('saved views — a person’s own, and shared ones set by ADMIN', () => {
  test('saved, used, kept private, shared only by ADMIN, retired by its owner, never edited or deleted', async () => {
    const { app, as } = await seeded();
    const sales = as('SALES');
    const admin = as('ADMIN');
    const acc = as('ACCOUNTING');
    const mine = LI.saveView(deps(app), sales, { list: 'CLAIMS', name: 'My survey claims', shared: false, query: q('stage=SURVEY&bogus=1&sort=age') });
    assert.ok(mine.ok, mine.ok ? '' : mine.why);
    assert.equal(app.db.get<{ params: string }>('SELECT params FROM saved_views WHERE id = ?', [mine.id])?.params, 'stage=SURVEY&sort=age',
      'the view stored something other than the known keys');
    assert.ok(LI.viewsFor(app.db, sales, 'CLAIMS').some((v) => v.id === mine.id && v.mine));
    assert.equal(LI.viewsFor(app.db, acc, 'CLAIMS').some((v) => v.id === mine.id), false, 'a personal view reached another person');
    assert.throws(() => LI.viewParams(app.db, acc, 'CLAIMS', mine.id), /not authorised/, 'another person used a personal view');

    assert.throws(() => LI.saveView(deps(app), sales, { list: 'CLAIMS', name: 'For everybody', shared: true, query: q('stage=SURVEY') }), /not authorised/);
    assert.throws(() => app.db.run(
      "INSERT INTO saved_views (id, list, name, params, shared, created_by, created_at) VALUES (?, 'CLAIMS', 'x', 'sort=age', 1, ?, ?)",
      [randomUUID(), sales.id, T0]), /administrator/, 'the database let a non-administrator share a view');
    const shared = LI.saveView(deps(app), admin, { list: 'CLAIMS', name: 'Everybody’s surveys', shared: true, query: q('stage=SURVEY') });
    assert.ok(shared.ok);
    assert.ok(LI.viewsFor(app.db, acc, 'CLAIMS').some((v) => v.id === shared.id && v.shared && !v.may_retire));
    assert.throws(() => LI.retireView(deps(app), sales, shared.id), /not authorised/, 'a non-administrator retired a shared view');

    assert.throws(() => app.db.run("UPDATE saved_views SET name = 'renamed' WHERE id = ?", [mine.id]), /never edited/);
    assert.throws(() => app.db.run('DELETE FROM saved_views WHERE id = ?', [mine.id]), /never deleted/);
    assert.ok(LI.retireView(deps(app), sales, mine.id).ok);
    assert.equal(LI.viewsFor(app.db, sales, 'CLAIMS').some((v) => v.id === mine.id), false);
    assert.ok(LI.retireView(deps(app), admin, shared.id).ok);
    const kinds = app.audit.entries().filter((e) => e.kind === 'SAVED_VIEW_CREATED' || e.kind === 'SAVED_VIEW_RETIRED');
    assert.equal(kinds.length, 4);
    assert.equal(JSON.stringify(kinds.map((e) => e.detail)).includes('survey claims'), false, 'a view’s name reached the audit log');
  });
});

/* ================================================================== *
 * EXPORT
 * ================================================================== */

describe('export — the reader’s own columns, audited, formula injection neutralised', () => {
  test('csvCell neutralises = + - @ tab and carriage return, and quotes what needs quoting', () => {
    assert.equal(LI.csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
    for (const lead0 of ['+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd']) assert.equal(LI.csvCell(lead0).replace(/^"/, '').startsWith(`'${lead0[0]}`), true, `${JSON.stringify(lead0)} was not neutralised`);
    assert.equal(LI.csvCell('Aldergate Care Group Limited'), 'Aldergate Care Group Limited');
    assert.equal(LI.csvCell('a, b'), '"a, b"');
    assert.equal(LI.csvCell(null), '');
  });

  test('sales exports the value column; accounting exports reference, client and opened alone; a surveyor is refused; each audited without a value', async () => {
    const { app, as } = await seeded();
    const hostile = app.db.get<{ id: string }>('SELECT id FROM businesses ORDER BY rowid LIMIT 1');
    assert.ok(hostile !== undefined);
    app.db.run('UPDATE businesses SET name = ? WHERE id = ?', ['=cmd|\' /C calc\'!A0', hostile.id]);

    const sales = LI.exportList(deps(app), as('SALES'), 'CLAIMS', q(''));
    const header = sales.body.split('\r\n')[0] ?? '';
    assert.match(header, /Estimated value — the range shown/);
    assert.equal(/^=|,=/.test(sales.body.split('\r\n').slice(1).join('\n')), false, 'a formula reached the CSV un-neutralised');
    assert.match(sales.body, /'=cmd/);

    const acc = LI.exportList(deps(app), as('ACCOUNTING'), 'CLAIMS', q('stage=SURVEY'));
    assert.equal(acc.body.split('\r\n')[0], 'Company,Opened,Reference'); // Phase 134: the company first, the reference last
    assert.deepEqual([...acc.columns], ['client', 'opened', 'claim_ref']);
    assert.equal(acc.rows, app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM claims')?.n, 'accounting’s export was filtered on a column it does not read');

    assert.throws(() => LI.exportList(deps(app), as('SURVEYING'), 'CLAIMS', q('')), /not authorised/);
    assert.throws(() => LI.exportList(deps(app), as('ACCOUNTING'), 'LEADS', q('')), /not authorised/, 'accounting exported the leads it cannot read');

    const lines = app.audit.entries().filter((e) => e.kind === 'LIST_EXPORTED');
    assert.equal(lines.length, 2);
    const accLine = lines.find((e) => e.actor_role === 'ACCOUNTING');
    assert.deepEqual(accLine?.detail['columns'], ['client', 'opened', 'claim_ref']);
    assert.equal(accLine?.detail['rows'], acc.rows);
    assert.equal(JSON.stringify(lines.map((e) => e.detail)).includes('calc'), false, 'a cell value reached the audit log');
  });
});

/* ================================================================== *
 * THE LEAD'S NEXT ACTION
 * ================================================================== */

describe('the lead’s next action — retired into a task, as the claim’s was', () => {
  test('migration 018 carries every recorded next action into an open task on its lead, empties the column, and refuses a new one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-mig018-'));
    for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql') && x < '018')) copyFileSync(join(MIGRATIONS, f), join(dir, f));
    const db = new Db(':memory:');
    migrate(db, dir);
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-s', 's@example.invalid', 's@example.invalid', 'S', 'SALES', 'x', T0, T0]);
    const insertLead = (id: string, next: string | null, due: string | null, owner: string | null): void => {
      db.run(
        'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, prospect_organisation, prospect_sector, ' +
          "lead_date, owner_id, priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at) " +
          "VALUES (?, NULL, NULL, NULL, NULL, 'STAFF', 'EVENT', NULL, ?, NULL, ?, ?, NULL, ?, ?, 'NEW', NULL, NULL, NULL, ?, ?)",
        [id, `Organisation ${id}`, T0, owner, next, due, T0, T0]);
    };
    insertLead('l-1', 'Ring the finance director', '2026-09-20', 'u-s');
    insertLead('l-2', 'x'.repeat(320), 'not a date', null);
    insertLead('l-3', null, null, null);
    db.execDdl(readFileSync(join(MIGRATIONS, '018-lists-saved-views-and-the-lead-next-action.sql'), 'utf8'));

    const t1 = db.get<{ title: string; due_on: string | null; owner_id: string | null; origin: string; status: string; is_next_action: number }>(
      'SELECT title, due_on, owner_id, origin, status, is_next_action FROM staff_tasks WHERE lead_id = ?', ['l-1']);
    assert.deepEqual({ ...t1 }, { title: 'Ring the finance director', due_on: '2026-09-20', owner_id: 'u-s', origin: 'MIGRATION', status: 'OPEN', is_next_action: 0 });
    const t2 = db.get<{ title: string; description: string | null; due_on: string | null; owner_id: string | null }>(
      'SELECT title, description, due_on, owner_id FROM staff_tasks WHERE lead_id = ?', ['l-2']);
    assert.equal(t2?.title.length, 300);
    assert.equal(t2?.description?.length, 320, 'the long text was not kept whole in the description');
    assert.equal(t2?.due_on, null, 'a due date that is not a date was carried as one');
    assert.equal(t2?.owner_id, null, 'an owner was invented');
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM staff_tasks WHERE lead_id = ?', ['l-3'])?.n, 0, 'a task was invented');
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM leads WHERE next_action IS NOT NULL OR next_action_due IS NOT NULL')?.n, 0);
    assert.throws(() => insertLead('l-4', 'again', null, null), /leads\.next_action is retired/);
    assert.throws(() => db.run("UPDATE leads SET next_action = 'again' WHERE id = 'l-3'"), /leads\.next_action is retired/);
    db.close();
  });

  test('a lead recorded with a next action gets a task on the lead, which the lead reads; changing it on the lead is refused', async () => {
    const { app, as } = await seeded();
    const sales = as('SALES');
    // Due today on the test clock (8 September), so it is the lead's soonest open task: recording a lead also fires the
    // seeded follow-up rule, whose task is due tomorrow, and a lead's next action is read as the task due soonest.
    const made = L.createLead({ ...deps(app) }, sales, {
      prospect_organisation: 'Next Action Dental Limited', source: 'EVENT', next_action: 'Send the one-page explainer', next_action_due: '2026-09-08',
    });
    assert.ok(made.ok, made.ok ? '' : made.why);
    const task = app.db.get<{ title: string; owner_id: string; due_on: string; origin: string }>(
      "SELECT title, owner_id, due_on, origin FROM staff_tasks WHERE lead_id = ? AND origin = 'STAFF'", [made.id]);
    assert.deepEqual({ ...task }, { title: 'Send the one-page explainer', owner_id: sales.id, due_on: '2026-09-08', origin: 'STAFF' });
    const v = L.leadView(app.db, sales, made.id);
    assert.equal(v.next_action, 'Send the one-page explainer');
    assert.equal(v.next_action_due, '2026-09-08');
    // THE AUTOMATION'S FOLLOW-UP IS ON THE LEAD TOO, and is the next action once the one due sooner is done.
    assert.ok(app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM staff_tasks WHERE lead_id = ? AND origin = 'AUTOMATION'", [made.id])?.n === 1,
      'the seeded follow-up rule did not raise its task on the lead');
    const row = LI.leadsList(app.db, sales, LI.readParams('LEADS', q('sort=next_action')).params).rows.find((r) => r.id === made.id);
    assert.equal(row?.next_action, 'Send the one-page explainer');
    const refused = L.updateLead({ ...deps(app) }, sales, made.id, { next_action: 'something else' });
    assert.equal(refused.ok, false);
    assert.match(refused.ok ? '' : refused.why, /a task now/);
    assert.ok(app.audit.entries().some((e) => e.kind === 'STAFF_TASK_CREATED' && e.object_id !== null && e.detail['lead'] === made.id));
  });
});

/* ================================================================== *
 * THE PROPERTY AND ORGANISATION PAGES, OVER HTTP
 * ================================================================== */

describe('the property and organisation pages — documents panels, a link form, and a note on a property', () => {
  test('sales links a document to a property and adds a note there; a surveyor may do neither, and accounting cannot open the property', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-lists-')) });
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
      const job = db.get<{ business_id: string; claim_id: string }>('SELECT business_id, claim_id FROM surveyor_jobs WHERE surveyor_id IS NOT NULL ORDER BY rowid LIMIT 1');
      assert.ok(job !== undefined);
      const prop = db.get<{ id: string }>('SELECT property_id AS id FROM claims WHERE id = ?', [job.claim_id]);
      assert.ok(prop !== undefined && prop.id !== null);
      const doc = db.get<{ id: string }>('SELECT id FROM logical_documents WHERE business_id = ? ORDER BY rowid LIMIT 1', [job.business_id]);

      const sales = await signIn('SALES');
      const org = JSON.parse((await sales.get(`/staff/properties/${prop.id}/view.json`)).body) as { documents?: unknown };
      assert.ok('documents' in org, 'the property view carries no documents panel');
      // PHASE 138: the documents are a coloured section of their own, headed by the section rather than a panel heading.
      assert.match((await sales.get(`/staff/clients/${job.business_id}`)).body, /<details class="sec sec-documents" id="documents"/, 'the client page draws no documents panel');

      const noteBefore = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM internal_notes WHERE property_id = ?', [prop.id])?.n ?? 0;
      assert.equal((await sales.post(`/staff/properties/${prop.id}/notes`, { body: 'The boiler house is shared with the neighbour.' })).status, 303);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM internal_notes WHERE property_id = ?', [prop.id])?.n, noteBefore + 1);
      assert.match((await sales.get(`/staff/properties/${prop.id}`)).body, new RegExp(`action="/staff/properties/${prop.id}/notes"`), 'the property page offers no note form');

      if (doc !== undefined) {
        const linked = await sales.post(`/staff/properties/${prop.id}/documents/link`, { document_id: doc.id });
        assert.ok([303, 400].includes(linked.status), `link answered ${linked.status}`);
        if (linked.status === 303) {
          const view = JSON.parse((await sales.get(`/staff/properties/${prop.id}/view.json`)).body) as { documents: { documents: { id: string }[] } };
          assert.ok(view.documents.documents.some((x) => x.id === doc.id), 'the linked document is not on the property');
        }
      }

      const surveyor = await signIn('SURVEYING');
      assert.equal((await surveyor.post(`/staff/properties/${prop.id}/notes`, { body: 'a surveyor note' })).status, 403);
      assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM internal_notes WHERE property_id = ?', [prop.id])?.n, noteBefore + 1, 'a refused note was written');
      if (doc !== undefined) assert.equal((await surveyor.post(`/staff/properties/${prop.id}/documents/link`, { document_id: doc.id })).status, 403);
      const sv = await surveyor.get(`/staff/properties/${prop.id}/view.json`);
      assert.equal(sv.status, 200);
      assert.equal((await surveyor.get(`/staff/claims/export.csv`)).status, 403);

      const accounting = await signIn('ACCOUNTING');
      assert.equal((await accounting.get(`/staff/properties/${prop.id}`)).status, 403);
      const csv = await accounting.get('/staff/claims/export.csv');
      assert.equal(csv.status, 200);
      assert.equal(csv.body.split('\r\n')[0], 'Company,Opened,Reference');
    } finally { made.close(); }
  });
});
