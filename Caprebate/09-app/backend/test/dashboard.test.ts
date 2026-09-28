/**
 * CRM 9 OF 10 — THE MANAGEMENT DASHBOARD AND MY WORK. 12 September 2026.
 *
 * THE PHASE'S OWN PROOF LIST, AND WHERE EACH ONE IS BELOW:
 *
 *   "a new action denies by default and a test asserts the refusal for every
 *    role not granted it"                                   → WHO MAY ENTER
 *   "Each tile's authorisation has a test"                  → WHO SEES WHICH TILE
 *   "a SURVEYING session's body carries no estimate-derived number by name, by
 *    value or in the text"                                  → N1
 *   "A tile whose inputs are unknown says so; it never counts them as zero"
 *                                                           → N4
 *   "the overdue-tasks tile counts what dueReading calls OVERDUE — the UK date,
 *    never a UTC comparison — and counts a task with no due date apart"
 *                                                           → OVERDUE BY THE UK DATE
 *   "EVERY TILE IS A QUERY, never a stored total"            → NOTHING STORED
 *   "MY WORK on the landing page for every staff role"       → MY WORK
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
import { APP_ROLES, type AppRole } from '../src/roles.ts';
import { can, REGISTERED_ACTIONS, type Actor } from '../src/authz.ts';
import { quarantinedKeysAndValues } from '../src/payload.ts';
import * as D from '../src/web/dashboard.ts';
import * as T from '../src/web/tasks.ts';
import { actor, testApp, keys, scalars } from './helpers.ts';

const T0 = '2026-09-08T00:00:00.000Z';

function numberInText(text: string, v: unknown): boolean {
  const escaped = String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.])${escaped}(?!\\d)`).test(text);
}

/** The leading count of a tile value — "3 claims" is 3. */
function lead(s: string | undefined): number {
  const m = /^([\d,]+)/.exec(s ?? '');
  return m === null ? Number.NaN : Number((m[1] ?? '').replace(/,/g, ''));
}

/** The count a sentence in a tile's `apart` list starts with, or 0 where the tile says nothing apart of that kind. */
function apartCount(t: D.Tile, pattern: RegExp): number {
  const s = t.apart.find((x) => pattern.test(x));
  return s === undefined ? 0 : lead(s);
}

function tile(v: D.Dashboard, key: D.TileKey): D.Tile {
  const t = v.tiles.find((x) => x.key === key);
  assert.ok(t !== undefined, `the ${key} tile is missing`);
  return t;
}

function line(t: D.Tile, label: RegExp): string {
  const l = t.lines.find((x) => label.test(x.label));
  assert.ok(l !== undefined, `the ${t.key} tile has no line matching ${label}`);
  return l.value;
}

async function seeded(): Promise<{ app: Awaited<ReturnType<typeof testApp>>; as: (role: AppRole) => Actor }> {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  const as = (role: AppRole): Actor => {
    const u = app.db.get<{ id: string }>('SELECT id FROM users WHERE role = ? ORDER BY rowid LIMIT 1', [role]);
    assert.ok(u !== undefined, `the seed has no ${role} user`);
    return { id: u.id, role, business_id: null, disabled: false };
  };
  return { app, as };
}

/* ================================================================== *
 * WHO MAY ENTER
 * ================================================================== */

describe('who may enter the dashboard', () => {
  test('dashboard.enter is the four staff roles; the client and a disabled user are refused', () => {
    assert.ok(REGISTERED_ACTIONS.includes('dashboard.enter'));
    for (const role of APP_ROLES) {
      const a = actor(role, `u-${role}`, role === 'CLIENT' ? 'biz-1' : null);
      assert.equal(can(a, 'dashboard.enter', { type: 'pipeline', id: 'dashboard' }), role !== 'CLIENT', `${role} on dashboard.enter`);
    }
    assert.equal(can({ ...actor('ADMIN'), disabled: true }, 'dashboard.enter', { type: 'pipeline', id: 'dashboard' }), false);
  });

  test('the store refuses a client, not only the route', async () => {
    const app = await testApp();
    assert.throws(() => D.dashboard(app.db, actor('CLIENT', 'u-CLIENT', 'biz-1'), app.now()), /not authorised/);
  });
});

/* ================================================================== *
 * WHO SEES WHICH TILE
 * ================================================================== */

describe('who sees which tile — decided by the rule table, one assertion per role', () => {
  const all = D.TILES.map((t) => t.key);
  const expected: Readonly<Record<AppRole, readonly string[]>> = {
    ADMIN: all,
    SALES: all.filter((k) => !['estimated_fees', 'money', 'compliance'].includes(k)),
    ACCOUNTING: ['estimated_fees', 'money'],
    SURVEYING: ['my_jobs'],
    CLIENT: [],
    /* Phase 132e: the view-only role — the pipeline, leads, deliverables and client requests, and no tile that
       asks for a value, a figure, money, compliance, a survey job or a write (overdue tasks asks staff_task.create). */
    READ_ONLY: ['claims_by_stage', 'claims_by_owner', 'claims_by_introducer', 'leads_by_source', 'days_to_completion',
      'expected_completion', 'exits_and_lost', 'deliverables', 'outstanding_client_requests'],
  };

  test('ADMIN all of it; SALES the pipeline; ACCOUNTING the money; SURVEYING its own jobs and nothing else', () => {
    for (const role of APP_ROLES) {
      assert.deepEqual([...D.tilesFor(actor(role, `u-${role}`, role === 'CLIENT' ? 'biz-1' : null))], [...expected[role]], `${role}’s tiles`);
    }
  });

  test('every action a tile asks is a registered one — a tile never invents a rule', () => {
    for (const t of D.TILES) for (const a of t.asks) assert.ok(REGISTERED_ACTIONS.includes(a.action), `${t.key} asks ${a.action}`);
  });

  test('the drawn dashboard holds exactly the tiles the table admits, for every staff role', async () => {
    const { app, as } = await seeded();
    for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
      assert.deepEqual(D.dashboard(app.db, as(role), app.now()).tiles.map((t) => t.key), [...expected[role]], `${role}’s drawn tiles`);
    }
  });
});

/* ================================================================== *
 * N1
 * ================================================================== */

describe('N1 — a surveyor’s dashboard carries no estimate-derived number, by name, by value or in the text', () => {
  test('on the seeded data: none of any sealed estimate’s seven, and none of the pound figures ADMIN is shown', async () => {
    const { app, as } = await seeded();
    const v = D.dashboard(app.db, as('SURVEYING'), app.now());
    const body = JSON.stringify(v);
    const estimates = app.db.all<Record<string, number>>(
      'SELECT qualifying_expenditure_pence, qualifying_pct, pool_split_main_pence, pool_split_special_pence, ' +
        'bare_land_pence, multiplier, indicative_lifetime_saving_pence FROM estimates');
    assert.ok(estimates.length > 0, 'the seed sealed no estimate, so this proves nothing');
    const present = [...keys(v)];
    const values = [...scalars(v)];
    for (const e of estimates) {
      const { keys: badKeys, values: badValues } = quarantinedKeysAndValues(e as never);
      for (const k of badKeys) assert.equal(present.includes(k), false, `field ${k} reached a surveyor`);
      for (const x of badValues) {
        assert.equal(values.includes(x), false, `value ${String(x)} reached a surveyor`);
        assert.equal(numberInText(body, x), false, `'${String(x)}' is in the surveyor’s text`);
      }
    }
    const pounds = D.dashboard(app.db, as('ADMIN'), app.now()).tiles.flatMap((t) => t.lines.map((l) => l.value))
      .flatMap((s) => s.match(/£[\d,]+/g) ?? []);
    assert.ok(pounds.length > 0, 'ADMIN was shown no pound figure, so the comparison proves nothing');
    for (const p of pounds) assert.equal(body.includes(p), false, `the surveyor was shown ${p}`);
    assert.equal(/£/.test(body), false, 'a pound sign reached a surveyor at all');
  });

  test('the surveyor’s own jobs are on it, each linked to the workspace', async () => {
    const { app, as } = await seeded();
    const s = as('SURVEYING');
    const jobs = app.db.all<{ id: string }>('SELECT id FROM surveyor_jobs WHERE surveyor_id = ?', [s.id]);
    const t = tile(D.dashboard(app.db, s, app.now()), 'my_jobs');
    for (const j of jobs) assert.ok(t.lines.some((l) => l.href === `/staff/survey/${j.id}`), `job ${j.id} is not on the surveyor’s tile`);
  });
});

/* ================================================================== *
 * N4
 * ================================================================== */

describe('N4 — unknown is counted apart and never as nought', () => {
  test('an open claim with no sealed estimate adds nothing to the pipeline value, and is said', async () => {
    const { app, as } = await seeded();
    const admin = as('ADMIN');
    const before = D.dashboard(app.db, admin, app.now());
    const p = app.db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM properties ORDER BY rowid LIMIT 1');
    assert.ok(p !== undefined);
    app.db.run(
      'INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, owner_id, surveyor_id, priority, ' +
        'next_action, next_action_due, hold_reason, lost_reason, expected_completion, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)',
      [randomUUID(), 'CR-2026-9901', p.business_id, p.id, 'UNKNOWN', 'DATA_GATHERING', '2026-09-20', T0, T0]);
    const after = D.dashboard(app.db, admin, app.now());

    const pb = tile(before, 'open_pipeline_value');
    const pa = tile(after, 'open_pipeline_value');
    assert.equal(lead(line(pa, /^Open claims/)), lead(line(pb, /^Open claims/)) + 1, 'the open claim was not counted');
    assert.equal(line(pa, /^Estimated claim value/), line(pb, /^Estimated claim value/), 'a claim with no estimate moved the value');
    assert.equal(apartCount(pa, /no estimate yet — not known, so not counted as £0/), apartCount(pb, /no estimate yet — not known, so not counted as £0/) + 1, 'the claim with no estimate was not counted apart');
    assert.equal(line(tile(after, 'average_claim_value'), /^Average/), line(tile(before, 'average_claim_value'), /^Average/),
      'a claim with no estimate entered the average as nought');

    // And its expected completion date is this month's, read against the UK date of the reading.
    const eb = tile(before, 'expected_completion');
    const ea = tile(after, 'expected_completion');
    assert.equal(lead(line(ea, /this month/)), lead(line(eb, /this month/)) + 1);
  });

  test('a lead source with nothing decided has no conversion rate — not 0%', async () => {
    const { app, as } = await seeded();
    app.db.run(
      'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, prospect_organisation, ' +
        'prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at) ' +
        "VALUES (?, NULL, NULL, NULL, NULL, 'STAFF', 'EVENT', NULL, ?, NULL, ?, NULL, NULL, NULL, NULL, 'NEW', NULL, NULL, NULL, ?, ?)",
      [randomUUID(), 'An Invented Event Prospect Limited', T0, T0, T0]);
    const v = D.dashboard(app.db, as('SALES'), app.now());
    const event = tile(v, 'leads_by_source').lines.find((l) => l.label === 'Event');
    assert.ok(event !== undefined);
    if (!/converted · [1-9]|[1-9]\d* converted/.test(event.value)) {
      assert.match(event.value, /conversion not known — none decided yet/);
      assert.equal(/conversion 0%/.test(event.value), false);
    }
  });
});

/* ================================================================== *
 * OVERDUE BY THE UK DATE
 * ================================================================== */

describe('overdue tasks — the UK date, and a task with no due date apart', () => {
  test('at 23:30 UTC on 8 September it is 9 September in the UK: due on the 8th is overdue, due on the 9th is due today', async () => {
    const { app, as } = await seeded();
    const admin = as('ADMIN');
    const now = '2026-09-08T23:30:00.000Z';
    const biz = app.db.get<{ id: string }>('SELECT id FROM businesses ORDER BY rowid LIMIT 1');
    assert.ok(biz !== undefined);
    const before = tile(D.dashboard(app.db, admin, now), 'overdue_tasks');
    for (const due of ['2026-09-08', '2026-09-09', null]) {
      T.insertTask(app.db, app.now, randomUUID, {
        title: `A task due ${due ?? 'never'}`, description: null, owner_id: null, owner_role: 'SALES', due_on: due, priority: null,
        activity_type: 'TASK', business_id: biz.id, property_id: null, claim_id: null, lead_id: null, contact_id: null, fact_id: null,
        recurrence: null, recurred_from_id: null, is_next_action: false, origin: 'STAFF', automation_run_id: null, created_by: admin.id,
      });
    }
    const after = tile(D.dashboard(app.db, admin, now), 'overdue_tasks');
    assert.equal(lead(line(after, /^Overdue/)), lead(line(before, /^Overdue/)) + 1, 'the task due yesterday in the UK is not overdue');
    assert.equal(lead(line(after, /^Due today/)), lead(line(before, /^Due today/)) + 1,
      'the task due today in the UK was not due today — a UTC comparison would have called it not yet due');
    assert.equal(apartCount(after, /no due date/), apartCount(before, /no due date/) + 1, 'the task with no due date was not counted apart');
    assert.equal(lead(line(after, /^Not yet due/)), lead(line(before, /^Not yet due/)), 'the task with no due date was counted as not yet due');
  });
});

/* ================================================================== *
 * NOTHING STORED
 * ================================================================== */

describe('every tile is a query', () => {
  test('no table, view, index or trigger holds anything for a dashboard', async () => {
    const app = await testApp();
    assert.deepEqual(app.db.all("SELECT name FROM sqlite_master WHERE name LIKE '%dashboard%'"), []);
  });

  test('reading the dashboard writes nothing — no audit line, no task, no run, no outbox message', async () => {
    const { app, as } = await seeded();
    const written = (): number | undefined => app.db.get<{ n: number }>(
      'SELECT (SELECT COUNT(*) FROM audit_log) + (SELECT COUNT(*) FROM staff_tasks) + (SELECT COUNT(*) FROM automation_runs) + ' +
        '(SELECT COUNT(*) FROM outbox) AS n')?.n;
    const before = written();
    for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) D.dashboard(app.db, as(role), app.now());
    assert.equal(written(), before, 'reading the dashboard wrote an audit line, a task, a run or an outbox message');
  });
});

/* ================================================================== *
 * OVER HTTP
 * ================================================================== */

describe('the dashboard over HTTP', () => {
  test('every staff role opens the page; the surveyor’s view.json holds its jobs alone; accounting’s holds the money alone', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-dashboard-')) });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    try {
      const addr = made.server.address();
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
      const s = await seed(made.app.db, made.app.hasher, made.app.now);
      const signIn = async (role: string): Promise<(path: string) => Promise<{ status: number; body: string }>> => {
        const r = await fetch(`${base}/login`, {
          method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ email: `${role.toLowerCase()}@example.invalid`, password: s.password }).toString(),
        });
        const cookie = r.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
        assert.equal(r.status, 303, `${role} could not sign in`);
        return async (path) => {
          const x = await fetch(base + path, { redirect: 'manual', headers: { cookie } });
          return { status: x.status, body: await x.text() };
        };
      };
      for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING']) {
        const get = await signIn(role);
        const page = await get('/staff/reports');
        assert.equal(page.status, 200, `${role} could not open the dashboard`);
        const view = JSON.parse((await get('/staff/dashboard/view.json')).body) as { tiles: { key: string }[] };
        if (role === 'SURVEYING') {
          assert.deepEqual(view.tiles.map((t) => t.key), ['my_jobs']);
          assert.equal(/Open pipeline value|Invoiced, paid/.test(page.body), false, 'the surveyor’s page drew a pipeline or money tile');
        }
        if (role === 'ACCOUNTING') {
          assert.deepEqual(view.tiles.map((t) => t.key), ['estimated_fees', 'money']);
          assert.match(page.body, /Invoiced, paid, outstanding and overdue/);
          assert.equal(/Open pipeline value/.test(page.body), false, 'accounting was drawn the pipeline value');
        }
      }
    } finally { made.close(); }
  });
});

/* ================================================================== *
 * MY WORK
 * ================================================================== */

describe('my work — every question I am waiting on, and my claims with their next actions and who is waiting', () => {
  test('a question not yet due is on my work, and not among the overdue; a claim I own shows its next action', async () => {
    const { app, as } = await seeded();
    const sales = as('SALES');
    const biz = app.db.get<{ id: string }>('SELECT id FROM businesses ORDER BY rowid LIMIT 1');
    assert.ok(biz !== undefined);
    app.db.run(
      'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, fact_id, sent_to_portal_at, due_on, kind) ' +
        "VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, NULL, NULL, ?, 'QUESTION')",
      [randomUUID(), biz.id, sales.id, 'Is the boiler house part of the building you bought?', 'It decides the plant schedule.', 'The survey brief.', T0, '2026-12-01']);
    const w = T.myWork(app.db, sales, app.now());
    const q = w.questions_waiting.find((x) => x.question === 'Is the boiler house part of the building you bought?');
    assert.ok(q !== undefined, 'the question is not on my work');
    assert.equal(q.due.overdue, false);
    assert.equal(q.sent, false, 'a question never sent to the portal read as sent');
    assert.equal(w.client_questions_overdue.some((x) => x.question === q.question), false);

    const open = app.db.get<{ id: string; claim_ref: string }>(
      "SELECT id, claim_ref FROM claims WHERE stage NOT IN ('CLOSED','REASONED_NEGATIVE','LOST','CANCELLED') AND stage IS NOT NULL ORDER BY rowid LIMIT 1");
    assert.ok(open !== undefined);
    app.db.run('UPDATE claims SET owner_id = ? WHERE id = ?', [sales.id, open.id]);
    const mine = T.myWork(app.db, sales, app.now()).my_claims.find((c) => c.id === open.id);
    assert.ok(mine !== undefined, 'a claim I own is not on my work');
    assert.ok(mine.next_action.length > 0);
    assert.ok(mine.waiting === null || ['US', 'CLIENT', 'NOBODY'].includes(mine.waiting.who));
  });
});

/* ================================================================== *
 * ESTIMATE TO OUTCOME — THE RECONCILIATION TILES
 * ================================================================== */

describe('the reconciliation tiles — the quote gap said not known, the variance tag awaited, a withdrawal kept out of the ratios', () => {
  test('a claim signed off opens a case; the tiles read it through varianceOf and never count the unknown quote gap as nought', async () => {
    const R = await import('../src/web/claim-record.ts');
    const P = await import('../src/web/pipeline.ts');
    const C = await import('../src/web/crm.ts');
    const CF = await import('./claim-fixtures.ts');
    const app = await testApp();
    for (const role of ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const) {
      app.db.run(
        'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        [`u-${role}`, `${role.toLowerCase()}@example.invalid`, `${role.toLowerCase()}@example.invalid`, `${role} Person`, role, 'x', T0, T0]);
    }
    const business = 'b-dash-rec';
    app.db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', [business, 'Reconciliation Dental Limited', 'dental', 'ASSESSMENT_SUBMITTED', T0]);
    app.db.run('INSERT INTO properties (id,business_id,label,created_at) VALUES (?,?,?,?)', ['p-dash-rec', business, 'Main site', T0]);
    const assessment = 'a-dash-rec';
    app.db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)',
      [assessment, business, 'dental', T0, 100_000_00, 200_000_00, T0]);
    const claimAt = (stage: string): string => {
      const made = C.insertClaim(app.db, app.now, randomUUID, {
        business_id: business, property_id: 'p-dash-rec', assessment_id: assessment, workstream: 'PLANT_AND_MACHINERY', stage, owner_id: null, surveyor_id: null,
      });
      P.recordOpened(CF.recordDeps(app), null, made.id, stage, 'a test fixture');
      return made.id;
    };
    const admin = actor('ADMIN');

    const empty = D.dashboard(app.db, admin, app.now());
    assert.equal(lead(line(tile(empty, 'reconciliation_cases'), /^Cases$/)), 0);
    assert.equal(line(tile(empty, 'reconciliation_gaps'), /^Quote gap$/), 'no case yet');

    const c = claimAt('TAX_ADVISER_SIGNOFF');
    CF.commitmentOn(app, business, assessment, c);
    const signed = R.recordSignOff(CF.recordDeps(app), actor('SALES'), c, {
      adviser: 'Invented Tax Advisers LLP', credential: 'Chartered Tax Adviser', signed_on: '2026-09-01', scope: 'the whole claim',
      method_note: 'reviewed against the rulebooks', figure: '2400000', confirmed_switches: 'transaction_tax_in_base,grant_after_ceilings',
    });
    assert.equal(signed.ok, true, signed.ok ? '' : signed.why);

    const opened = D.dashboard(app.db, admin, app.now());
    const cases = tile(opened, 'reconciliation_cases');
    assert.equal(lead(line(cases, /^Cases$/)), 1, 'the sign-off opened no case');
    assert.equal(lead(line(cases, /^Open, with the outcome pending$/)), 1);
    assert.equal(lead(line(cases, /^Awaiting the variance tag$/)), 1);
    const gaps = tile(opened, 'reconciliation_gaps');
    assert.equal(line(gaps, /^Quote gap$/), 'known on 0 of 1 case', 'an unknown quote gap was read as known');
    assert.ok(gaps.apart.some((a) => /quote gap is not known/.test(a)), 'the unknown quote gap was not said');
    assert.ok(gaps.apart.some((a) => /no outcome yet, so no delivery gap/.test(a)), 'the missing outcome was not counted apart');
    assert.equal(gaps.lines.some((l) => /^Delivery gap/.test(l.label)), false, 'a delivery gap was drawn with no outcome');
    assert.match(gaps.basis, new RegExp(`${R.QUOTE_GAP_REVIEW_PCT}% — a constant, not a setting`));

    assert.equal(R.recordVariance(CF.recordDeps(app), actor('SALES'), c, { variance_category: 'SURVEY_FINDING', variance_notes: 'more plant found' }).ok, true);
    const tagged = tile(D.dashboard(app.db, admin, app.now()), 'reconciliation_cases');
    assert.equal(lead(line(tagged, /^Awaiting the variance tag$/)), 0);
    assert.equal(lead(line(tagged, /^By category — Survey finding/i)), 1);

    // A CASE WITHDRAWN WITH NO CLAIM, written as its row: tracked, said, and in no ratio.
    const src = app.db.get<Record<string, string | number | null>>('SELECT * FROM claim_reconciliations WHERE claim_id = ?', [c]);
    assert.ok(src !== undefined);
    const w = claimAt('DEFENCE_PACK');
    app.db.run(
      'INSERT INTO claim_reconciliations (id, claim_id, case_id, client_sector, b_basis, surveyor_value_pence, surveyor_commitment_id, ' +
        'surveyor_figures_hash, c_value_pence, c_date_captured, c_cta_reviewer, c_signoff_id, opened_at, snapshot_hash, ' +
        'variance_category, variance_recorded_by, variance_recorded_at, resolution_path, outcome_recorded_by, outcome_recorded_at, status) ' +
        "VALUES (?, ?, ?, 'dental', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLIENT_WITHDRAWAL', 'u-SALES', ?, 'WITHDRAWN_NO_CLAIM', 'u-SALES', ?, 'RECONCILED')",
      [randomUUID(), w, 'CASE-WITHDRAWN', String(src['b_basis']), Number(src['surveyor_value_pence']), String(src['surveyor_commitment_id']),
        String(src['surveyor_figures_hash']), Number(src['c_value_pence']), String(src['c_date_captured']), String(src['c_cta_reviewer']),
        String(src['c_signoff_id']), T0, 'f'.repeat(64), T0, T0]);
    const after = D.dashboard(app.db, admin, app.now());
    assert.equal(lead(line(tile(after, 'reconciliation_cases'), /^Cases$/)), 2);
    assert.ok(tile(after, 'reconciliation_cases').apart.some((a) => /^1 case was withdrawn with no claim/.test(a)), 'the withdrawal was not said apart');
    assert.equal(line(tile(after, 'reconciliation_gaps'), /^Quote gap$/), 'known on 0 of 1 case', 'the withdrawn case entered the ratios');

    // And the tiles are claim_figures.read's: accounting and a surveyor are drawn neither.
    for (const role of ['ACCOUNTING', 'SURVEYING'] as const) {
      const keysFor = D.dashboard(app.db, actor(role), app.now()).tiles.map((t) => t.key);
      assert.equal(keysFor.includes('reconciliation_cases') || keysFor.includes('reconciliation_gaps'), false, `${role} was drawn a reconciliation tile`);
    }
  });
});
