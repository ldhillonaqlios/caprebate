/**
 * PHASE 136 — HOME AS TILES. 21 September 2026.
 *
 * Lakhbir, 18 September 2026: "tiles over heavy text, especially on the menu page. The menu page should flow: new leads,
 * existing leads' next actions, today and overdue, pipeline by stage."
 *
 *   THE ORDER          → Sales, Admin and Read only: New leads, Existing leads — next actions, Today and overdue, Pipeline
 *                        by stage, in that order; Admin then its own row. Accounting: Money, then Today and overdue.
 *                        Surveying: Survey jobs, then Today and overdue.
 *   NEW LEADS          → a count tile first, then one tile per uncontacted lead, oldest first, red after one working day.
 *   EMPTY IS SAID      → a row with nothing in it says so in one line.
 *   EVERY TILE OPENS   → every tile on every login's Home answers 200 for that login, and no tile holds more than
 *                        three lines.
 *   GONE FROM THE PAGE → "Signed in as", the two dashed notes, the welcome card and the dashboard button.
 *   ONE PLACE          → the next-actions row links to "Claims with no next step"; it does not repeat the list.
 *   WORKING DAYS       → Friday to Monday is one; Friday to Tuesday is two.
 *
 * Written against HTTP, apart from the one pure helper, so it fails against the .bak-phase136 copy.
 */

/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { localDate } from '../src/web/localtime.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };
type Client = { get(path: string): Promise<Res> };

const STAFF = ['admin', 'sales', 'accounting', 'surveying', 'readonly'] as const;
type Staff = (typeof STAFF)[number];

async function boot(): Promise<{ made: Made; signIn(who: Staff): Promise<Client> }> {
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-136-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-136', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  return {
    made,
    async signIn(who) {
      const r = await fetch(`${base}/login`, {
        method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
      });
      assert.equal(r.status, 303, `${who} could not sign in`);
      const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      return {
        async get(path) {
          const x = await fetch(base + path, { redirect: 'manual', headers: { cookie } });
          return { status: x.status, location: x.headers.get('location'), body: await x.text() };
        },
      };
    },
  };
}

function rowIds(body: string): string[] {
  return [...body.matchAll(/<section class="homerow" aria-labelledby="row-([a-z-]+)">/g)].map((m) => m[1] ?? '');
}

function row(body: string, id: string): string {
  const m = new RegExp(`<section class="homerow" aria-labelledby="row-${id}">([\\s\\S]*?)</section>`).exec(body);
  return m?.[1] ?? '';
}

function tiles(html: string): { href: string; lines: string[]; late: boolean }[] {
  return [...html.matchAll(/<li class="tile hometile([^"]*)"><a class="tilelink" href="([^"]+)">([\s\S]*?)<\/a><\/li>/g)].map((m) => ({
    late: (m[1] ?? '').includes('late'),
    href: (m[2] ?? '').replace(/&amp;/g, '&'),
    lines: [...(m[3] ?? '').matchAll(/<span class="tile(?:name|count|line)[^"]*">([\s\S]*?)<\/span>/g)].map((x) => x[1] ?? ''),
  }));
}

/** A lead nobody has contacted, arrived at `at`. */
function addNewLead(made: Made, id: string, name: string, at: string): void {
  made.app.db.run(
    'INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, prospect_organisation, ' +
      'prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at) ' +
      "VALUES (?, NULL, NULL, NULL, NULL, 'STAFF', 'REFERRAL', NULL, ?, 'dental', ?, NULL, 'NORMAL', NULL, NULL, 'NEW', NULL, NULL, NULL, ?, ?)",
    [id, name, at, at, at],
  );
}

let h: Awaited<ReturnType<typeof boot>>;
const clients = new Map<Staff, Client>();
const as = (who: Staff): Client => {
  const c = clients.get(who);
  assert.ok(c, who);
  return c;
};

before(async () => {
  h = await boot();
  const now = Date.parse(h.made.app.now());
  addNewLead(h.made, 'lead-136-old', 'Oldest Waiting Dental Limited', new Date(now - 20 * 86_400_000).toISOString());
  addNewLead(h.made, 'lead-136-new', 'Newest Arrival Dental Limited', h.made.app.now());
  for (const who of STAFF) clients.set(who, await h.signIn(who));
});
after(() => { h.made.close(); });

describe('the rows, in Lakhbir\'s order', () => {
  test('each login\'s Home is its rows, in exactly the brief\'s order', async () => {
    // 1 Oct 2026 — Home as a dashboard, in Lakhbir's new order ("whos a new lead … whats in the pipeline … new messages
    // … a calendar … and below it … activities for today"); Admin's own row is on the Admin tab.
    const want: Record<Staff, string[]> = {
      // UI tidy phase 4: the work on the left (Do these first, new leads, leads' next steps), the pipeline on the right.
      sales: ['today', 'new-leads', 'next-actions', 'pipeline'],
      readonly: ['today', 'new-leads', 'next-actions', 'pipeline'],
      admin: ['today', 'new-leads', 'next-actions', 'pipeline'],
      accounting: ['today', 'money'],
      surveying: ['today', 'jobs'],
    };
    for (const who of STAFF) assert.deepEqual(rowIds((await as(who).get('/staff')).body), want[who], who);
    assert.deepEqual(rowIds((await as('admin').get('/staff?view=admin')).body), ['admin']);
  });

  test('new leads: a count tile first, then oldest first, and red once a lead has waited more than one working day', async () => {
    const t = tiles(row((await as('sales').get('/staff')).body, 'new-leads'));
    assert.equal(t[0]?.href, '/staff/leads#leads-new'); // Phase 137: New section, enquiries included (was ?status=NEW)
    assert.match(t[0]?.lines[0] ?? '', /^\d+$/, 'the count tile leads the row');
    const names = t.slice(1).map((x) => x.lines[0]);
    const iOld = names.indexOf('Oldest Waiting Dental Limited');
    const iNew = names.indexOf('Newest Arrival Dental Limited');
    assert.ok(iOld >= 0 && iNew > iOld, 'oldest first');
    assert.equal(t[iOld + 1]?.late, true, 'twenty days waiting is red');
    assert.equal(t[iNew + 1]?.late, false, 'arrived today is not red');
    assert.equal(t[iNew + 1]?.lines[2], 'Came in today');
    assert.equal(t[iOld + 1]?.lines[1], 'From Referral');
    assert.equal(t[0]?.late, true, 'the count tile is red while a lead waits too long');
  });

  test('the next-actions row links to Tasks\' "Claims with no next step" and does not repeat it', async () => {
    for (const who of ['sales', 'admin'] as const) {
      const body = (await as(who).get('/staff')).body;
      assert.ok(tiles(row(body, 'next-actions')).some((x) => x.href === '/staff/next-actions'), who);
      assert.doesNotMatch(body, /My next actions|Claims nobody owns with no next step/, who);
    }
  });

  test('the pipeline row: the five groups of stages as bars, each with its count, then Open the pipeline and Reports', async () => {
    // UI tidy phase 4: Lakhbir agreed the eleven stage tiles become one small chart (00-START-HERE/hub/UI-TIDY-PLAN.md).
    const r = row((await as('sales').get('/staff')).body, 'pipeline');
    const bars = [...r.matchAll(/<a class="gbar" href="\/staff\/pipeline"><span class="gbar-name">([^<]+)<\/span><span class="gbar-track"><span class="gbar-fill g-([a-z]+) gw-(\d+)"><\/span><\/span><span class="gbar-n">(\d+)<\/span><\/a>/g)];
    assert.deepEqual(bars.map((m) => m[1]), ['Winning it', 'Gathering', 'Surveying', 'Signing off', 'Getting paid']);
    assert.deepEqual(bars.map((m) => m[2]), ['win', 'gather', 'survey', 'sign', 'paid']);
    const n = bars.map((m) => Number(m[4]));
    const most = Math.max(...n);
    for (const m of bars) assert.equal(Number(m[3]), Number(m[4]) === 0 ? 0 : Math.max(1, Math.round((Number(m[4]) / most) * 10)), m[1] ?? '');
    const inProgress = Number(/<span class="kpi-label">Claims in progress<\/span><span class="kpi-value">(\d+)<\/span>/.exec((await as('sales').get('/staff')).body)?.[1]);
    assert.equal(n.reduce((a, b) => a + b, 0), inProgress, 'the bars do not add up to the claims in progress');
    assert.match(r, /<p class="homelinks"><a href="\/staff\/pipeline">Open the pipeline<\/a>( · <a href="\/staff\/claims\?status=ON_HOLD">[^<]+<\/a>)? · <a href="\/staff\/reports">Reports: Figures by month, quarter or year<\/a><\/p>/);
  });

  test('Admin\'s own row: Users, Switches, Audit log and Refused sign-ins', async () => {
    const t = tiles(row((await as('admin').get('/staff?view=admin')).body, 'admin'));
    assert.deepEqual(t.map((x) => x.lines[0]), ['Users', 'Switches', 'Audit log', 'Refused sign-ins']);
    assert.equal(t[2]?.lines[1], 'Checked — nothing changed');
  });
});

describe('every tile', () => {
  test('opens for the login it is drawn for, and holds no more than three lines', async () => {
    for (const who of STAFF) {
      const all = tiles((await as(who).get('/staff')).body);
      assert.ok(all.length > 0, who);
      for (const x of all) {
        assert.ok(x.lines.length <= 3, `${who}: a tile of ${x.lines.length} lines`);
        const r = await as(who).get(x.href.split('#')[0] ?? x.href);
        assert.equal(r.status, 200, `${who}: ${x.href}`);
      }
    }
  });
});

describe('gone from the page', () => {
  test('no "Signed in as", no dashed notes, no welcome card and no dashboard button on any Home', async () => {
    for (const who of STAFF) {
      const body = (await as(who).get('/staff')).body;
      const main = body.slice(body.indexOf('<main'));
      assert.doesNotMatch(main, /Signed in as/, who);
      assert.doesNotMatch(main, /class="gate"/, who);
      assert.doesNotMatch(main, /Welcome to Cap Rebate/, who);
      assert.doesNotMatch(main, /See the dashboard/, who);
    }
  });

  test('an empty row says so in one line, rather than vanishing', async () => {
    const saved = h.made.app.db.all<{ id: string }>("SELECT id FROM leads WHERE status = 'NEW'");
    h.made.app.db.run("UPDATE leads SET status = 'NURTURE' WHERE status = 'NEW'");
    try {
      const body = (await as('sales').get('/staff')).body;
      assert.match(row(body, 'new-leads'), /<p class="empty">No new leads\.<\/p>/);
    } finally {
      for (const l of saved) h.made.app.db.run("UPDATE leads SET status = 'NEW' WHERE id = ?", [l.id]);
    }
  });

  test('the Reports page marks Home as the current tab', async () => {
    const r = await as('sales').get('/staff/reports');
    assert.equal(r.status, 200);
    assert.match(r.body, /<a href="\/staff" aria-current="page">Home<\/a>/);
  });
});

describe('working days, and phone width', () => {
  test('Friday to Monday is one working day; Friday to Tuesday is two', async () => {
    const { workingDaysSince } = await import('../src/web/home.ts');
    assert.equal(workingDaysSince('2026-09-18T09:00:00.000Z', '2026-09-18T15:00:00.000Z'), 0);
    assert.equal(workingDaysSince('2026-09-18T09:00:00.000Z', '2026-09-21T09:00:00.000Z'), 1);
    assert.equal(workingDaysSince('2026-09-18T09:00:00.000Z', '2026-09-22T09:00:00.000Z'), 2);
    assert.equal(localDate('2026-09-18T23:30:00.000Z'), '2026-09-19', 'a UK day, not a UTC one');
  });

  test('the tiles stack into one column at phone width', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/web/assets.ts'), 'utf8');
    const phone = css.slice(css.indexOf('@media (max-width:720px)'));
    assert.match(phone, /\.hometiles\{grid-template-columns:minmax\(0,1fr\)\}/);
  });
});
