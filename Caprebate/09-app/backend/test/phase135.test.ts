/**
 * PHASE 135 — THE MENUS. 21 September 2026.
 *
 * Lakhbir, 18 September 2026: "Some of the tabs along the top seem to be replicating information - this needs to be
 * streamlined and not bloated", and "some of the users have so much information under More - think if this is actually
 * needed for each user or not."
 *
 *   EXACT MENUS          → each login's tabs and More, read off its header, equal the table in the Developer Spec. Written
 *                          here BY HAND, so a section cannot creep back onto a menu without this file changing.
 *   MORE ≤ 4             → no login's More holds more than four entries, and a login with none has no More at all.
 *   NO PERMISSION MOVED  → every back-office address answers each login exactly as it did before this phase (the table
 *                          below was taken from the pre-change build), except the two this phase changed on purpose:
 *                          the one Clients list opens for Read only, and the organisations list sends its readers there.
 *   ONE CLIENTS LIST     → company name first, the columns each login may read, and Read only can open it.
 *   ONE TAB, TWO VIEWS   → Leads and filled assessments; Tasks and the claims with no next step; each marks its tab.
 *   SETTINGS             → Admin's one page of eight tiles, each opening; nobody else is given the page.
 *   OLD ADDRESSES        → every address that left a menu still opens for whoever could open it.
 *
 * WRITTEN AGAINST HTTP ONLY, AND IMPORTING NOTHING THE PHASE ADDED, so it runs against the pre-change copy (the
 * .bak-phase135 files) and fails there.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string };
type Client = { get(path: string): Promise<Res> };

const STAFF = ['admin', 'sales', 'accounting', 'surveying', 'readonly'] as const;
type Staff = (typeof STAFF)[number];

/** THE TARGET MENUS — the Developer Spec's table "The menus", section 2. Tabs in order, then More in order. */
const MENUS: Readonly<Record<Staff, { tabs: readonly string[]; more: readonly string[] }>> = {
  sales: { tabs: ['Home', 'Leads', 'Clients', 'Pipeline', 'Tasks', 'Introducers'], more: ['Calendar'] },
  // PHASE 151b (Word answer 40): Accounting's Clients tab — its billing view of the clients area (src/web/billing.ts).
  accounting: { tabs: ['Home', 'Clients', 'Claims', 'Finance', 'Tasks'], more: ['Introducer fees'] },
  surveying: { tabs: ['Home', 'Survey jobs', 'Tasks'], more: [] },
  readonly: { tabs: ['Home', 'Leads', 'Clients', 'Pipeline'], more: [] },
  admin: { tabs: ['Home', 'Leads', 'Clients', 'Pipeline', 'Tasks', 'Finance', 'Settings'], more: ['Calendar', 'Introducers', 'Survey jobs'] },
};

/**
 * WHAT EACH ADDRESS ANSWERED EACH LOGIN BEFORE THIS PHASE, read off the pre-change build on 21 September 2026 with the
 * same seed: 200 opens, 403 refused. The menu change must not move one of them — except the two marked CHANGED.
 */
// PHASE 136: '/staff/reports' stands where '/staff/dashboard' stood — the same page, under the same gate, behind Home's
// Reports tile. The old address now answers 303 to Home, asserted in test/phase135.test.ts.
const SECTIONS = [
  '/staff', '/staff/reports', '/staff/search', '/staff/tasks', '/staff/next-actions', '/staff/assessments', '/staff/leads',
  '/staff/pipeline', '/staff/clients', '/staff/organisations', '/staff/properties', '/staff/claims', '/staff/documents',
  '/staff/document-types', '/staff/introducers', '/staff/introducer-rewards', '/staff/survey', '/staff/finance',
  '/staff/calendar', '/staff/compliance', '/staff/admin-settings', '/staff/automation', '/staff/templates', '/staff/audit',
  '/staff/users', '/staff/settings',
] as const;
const OPENED_BEFORE: Readonly<Record<Staff, readonly string[]>> = {
  admin: SECTIONS,
  sales: SECTIONS.filter((p) => !['/staff/finance', '/staff/compliance', '/staff/audit', '/staff/users'].includes(p)),
  accounting: ['/staff', '/staff/reports', '/staff/search', '/staff/tasks', '/staff/claims', '/staff/documents', '/staff/introducers',
    '/staff/introducer-rewards', '/staff/finance', '/staff/settings'],
  surveying: ['/staff', '/staff/reports', '/staff/search', '/staff/tasks', '/staff/assessments', '/staff/properties', '/staff/claims',
    '/staff/documents', '/staff/survey', '/staff/settings'],
  readonly: ['/staff', '/staff/reports', '/staff/search', '/staff/tasks', '/staff/next-actions', '/staff/assessments', '/staff/leads',
    '/staff/pipeline', '/staff/organisations', '/staff/properties', '/staff/claims', '/staff/documents', '/staff/document-types',
    '/staff/introducers', '/staff/introducer-rewards', '/staff/calendar', '/staff/admin-settings', '/staff/automation',
    '/staff/templates', '/staff/settings'],
};

async function boot(): Promise<{ made: Made; signIn(who: Staff): Promise<Client> }> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-135-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  // The seed assigns the read-only login to nobody (Phase 132e); this suite needs one.
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-135', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
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

/** The visible words of a link: tags dropped, and the screen-reader-only words with them. */
function words(html: string): string {
  return html.replace(/<span class="vh">[\s\S]*?<\/span>/g, '').replace(/<span class="tabcount[^"]*">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** A header's tabs and More, as the words a person reads. */
function menuOf(body: string): { tabs: string[]; more: string[] | null } {
  const nav = /<nav class="appnav"[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
  const moreHtml = /<li class="more">([\s\S]*?)<\/li><\/ul><\/nav>/.exec(nav)?.[1] ?? null;
  const main = moreHtml === null ? nav : nav.slice(0, nav.indexOf('<li class="more">'));
  const labels = (x: string): string[] => [...x.matchAll(/<a href="[^"]+"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => words(m[1] ?? ''));
  return { tabs: labels(main), more: moreHtml === null ? null : labels(moreHtml) };
}

function currentTab(body: string): string | null {
  const nav = /<nav class="appnav"[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';
  const m = /<a href="[^"]+" aria-current="page">([\s\S]*?)<\/a>/.exec(nav);
  return m === null ? null : words(m[1] ?? '');
}

let h: Awaited<ReturnType<typeof boot>>;
const clients = new Map<Staff, Client>();
before(async () => {
  h = await boot();
  for (const who of STAFF) clients.set(who, await h.signIn(who));
});
after(() => h.made.close());
const as = (who: Staff): Client => clients.get(who) as Client;

describe('each login has exactly its menu', () => {
  for (const who of STAFF) {
    test(`${who}: the tabs and More are exactly the table's`, async () => {
      const m = menuOf((await as(who).get('/staff')).body);
      assert.deepEqual(m.tabs, MENUS[who].tabs, `${who}'s tabs`);
      if (MENUS[who].more.length === 0) assert.equal(m.more, null, `${who} has no More entries, so it has no More`);
      else assert.deepEqual(m.more, MENUS[who].more, `${who}'s More`);
    });
  }

  test('More holds at most four entries for every login', async () => {
    for (const who of STAFF) {
      const m = menuOf((await as(who).get('/staff')).body);
      assert.ok((m.more ?? []).length <= 4, `${who}'s More holds ${(m.more ?? []).length}`);
    }
  });

  test('no two tabs open the same address, for any login', async () => {
    for (const who of STAFF) {
      const nav = /<nav class="appnav"[\s\S]*?<\/nav>/.exec((await as(who).get('/staff')).body)?.[0] ?? '';
      const hrefs = [...nav.matchAll(/<a href="([^"]+)"/g)].map((x) => x[1]);
      assert.deepEqual(hrefs, [...new Set(hrefs)], `${who}'s menu repeats an address`);
    }
  });

  test('the header no longer carries a second way into Tasks: the count is on the Tasks tab', async () => {
    const body = (await as('sales').get('/staff')).body;
    const util = /<div class="util">[\s\S]*?<\/div>\s*<nav/.exec(body)?.[0] ?? '';
    assert.equal(util.includes('/staff/tasks'), false, 'the header still links to Tasks outside the tabs');
    assert.match(body, /<a href="\/staff\/tasks">Tasks <span class="tabcount/);
  });

  test('the user menu says "Your account", so only Admin\'s tab is called Settings', async () => {
    const body = (await as('admin').get('/staff')).body;
    assert.match(body, /<a href="\/staff\/settings">Your account<\/a>/);
    assert.equal((body.match(/>Settings</g) ?? []).length, 1);
  });
});

describe('the menu grants nothing and removes nothing', () => {
  for (const who of STAFF) {
    test(`${who}: every address answers as it did before the phase, except the two changed on purpose`, async () => {
      for (const path of SECTIONS) {
        const r = await as(who).get(path);
        const before = OPENED_BEFORE[who].includes(path);
        if (path === '/staff/clients' && who === 'readonly') {
          assert.equal(r.status, 200, 'CHANGED: the one Clients list opens for Read only (brief item 7)');
        } else if (path === '/staff/clients' && who === 'accounting') {
          // PHASE 151b, Word answer 40: Accounting's billing view of the clients area — and the record stays refused.
          assert.equal(r.status, 200, 'CHANGED by Phase 151b: the clients area opens for Accounting, as its billing view');
        } else if (path === '/staff/organisations' && before) {
          assert.equal(r.status, 303, `CHANGED: ${path} for ${who} sends the reader to the one list`);
          assert.equal(r.location, '/staff/clients');
        } else {
          assert.equal(r.status, before ? 200 : 403, `${path} for ${who}`);
        }
      }
    });
  }
});

describe('the one Clients list', () => {
  test('company name first; who it waits on, status, owner and claims', async () => {
    const r = await as('sales').get('/staff/clients');
    assert.equal(r.status, 200);
    const heads = [...(/<thead>([\s\S]*?)<\/thead>/.exec(r.body)?.[1] ?? '').matchAll(/<th>([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(heads, ['Company', 'Waiting on', 'Status', 'Owner', 'Claims']);
    const first = /<tbody>\s*<tr>\s*<td[^>]*><a[^>]*href="\/staff\/clients\/[^"]+"[^>]*>([^<]+)<\/a>/.exec(r.body);
    assert.ok(first !== null, 'the first cell of a row is not the company, linked to its page');
    assert.equal(/CR-\d{4}-\d{4}/.test(first[1] ?? ''), false, 'a claim reference is the link text');
  });

  test('Read only reads it: company, status, owner and claims — and no "waiting on", which is the research\'s rule', async () => {
    const r = await as('readonly').get('/staff/clients');
    assert.equal(r.status, 200);
    const heads = [...(/<thead>([\s\S]*?)<\/thead>/.exec(r.body)?.[1] ?? '').matchAll(/<th>([^<]+)<\/th>/g)].map((m) => m[1]);
    assert.deepEqual(heads, ['Company', 'Status', 'Owner', 'Claims']);
    const id = /href="\/staff\/clients\/([A-Za-z0-9-]+)"/.exec(r.body)?.[1];
    assert.ok(id !== undefined);
    assert.equal((await as('readonly').get(`/staff/clients/${id}`)).status, 200, 'Read only cannot open the client page from the list');
  });

  test('Sales and Read only list the same companies', async () => {
    const names = (b: string): string[] => [...b.matchAll(/class="rowname" href="[^"]+">([^<]+)</g)].map((m) => m[1] ?? '').sort();
    assert.deepEqual(names((await as('readonly').get('/staff/clients')).body), names((await as('sales').get('/staff/clients')).body));
  });

  test('the old list address sends a reader to it, and still refuses whoever it refused', async () => {
    const r = await as('sales').get('/staff/organisations');
    assert.equal(r.status, 303);
    assert.equal(r.location, '/staff/clients');
    assert.equal((await as('accounting').get('/staff/organisations')).status, 403);
    assert.equal((await as('surveying').get('/staff/organisations')).status, 403);
  });

  test('the Clients tab is current on the list and on a company\'s page', async () => {
    const list = await as('sales').get('/staff/clients');
    assert.equal(currentTab(list.body), 'Clients');
    const id = /href="\/staff\/clients\/([A-Za-z0-9-]+)"/.exec(list.body)?.[1];
    assert.equal(currentTab((await as('sales').get(`/staff/clients/${id}`)).body), 'Clients');
  });
});

describe('one tab, two views', () => {
  test('Leads and filled assessments: each shows both filters, and the Leads tab is current on both', async () => {
    for (const path of ['/staff/leads', '/staff/assessments']) {
      const r = await as('sales').get(path);
      assert.equal(r.status, 200, path);
      assert.match(r.body, /<nav class="viewbar" aria-label="Show">/, path);
      assert.match(r.body, new RegExp(`<a href="${path}" aria-current="page">`), path);
      assert.equal(currentTab(r.body), 'Leads', path);
    }
  });

  test('Tasks and the claims with no next step: each shows the filters, and the Tasks tab is current on both', async () => {
    for (const path of ['/staff/tasks', '/staff/next-actions']) {
      const r = await as('sales').get(path);
      assert.equal(r.status, 200, path);
      assert.match(r.body, /Claims with no next step/, path);
      assert.equal(currentTab(r.body), 'Tasks', path);
    }
  });

  test('a filter a login would be refused is not drawn', async () => {
    // Surveying may open the filled assessments but not the leads, so it is not offered a Leads filter.
    const r = await as('surveying').get('/staff/assessments');
    assert.equal(r.status, 200);
    assert.equal(r.body.includes('href="/staff/leads"'), false);
    // Accounting may not see the claims with no next step.
    assert.equal((await as('accounting').get('/staff/tasks')).body.includes('/staff/next-actions'), false);
  });
});

describe('Settings — Admin\'s one page of tiles', () => {
  const TILES = ['Users', 'Switches', 'Document types', 'Automation', 'Email templates', 'Compliance', 'Audit log', 'Introducer fees'];

  test('eight tiles in the brief\'s order, and every one opens', async () => {
    const r = await as('admin').get('/staff/admin');
    assert.equal(r.status, 200);
    const tiles = [...r.body.matchAll(/<a class="tilelink" href="([^"]+)">\s*<span class="tilename">([^<]+)<\/span>/g)];
    assert.deepEqual(tiles.map((t) => t[2]), TILES);
    for (const t of tiles) assert.equal((await as('admin').get(t[1] ?? '')).status, 200, String(t[1]));
    assert.equal(currentTab(r.body), 'Settings');
    assert.equal(currentTab((await as('admin').get('/staff/automation')).body), 'Settings', 'a tile\'s screen does not mark Settings');
  });

  test('nobody but Admin is given the page', async () => {
    for (const who of ['sales', 'accounting', 'surveying', 'readonly'] as const) {
      assert.equal((await as(who).get('/staff/admin')).status, 403, who);
    }
  });
});

describe('the dashboard is reached from Home', () => {
  // PHASE 136: the dashboard folded into Home. Its old address sends every login it admitted to Home (303), a bookmarked
  // period goes to the same report behind the Reports tile, view.json answers as before, and the button is gone.
  test('/staff/dashboard sends each login it admits to Home, and its figures are the Reports tile', async () => {
    for (const who of STAFF) {
      const r = await as(who).get('/staff/dashboard');
      assert.equal(r.status, 303, who);
      assert.equal(r.location, '/staff', who);
      assert.equal((await as(who).get('/staff/dashboard?period=MONTH')).location, '/staff/reports?period=MONTH', who);
      assert.equal((await as(who).get('/staff/dashboard/view.json')).status, 200, `${who} view.json`);
      const home = (await as(who).get('/staff')).body;
      assert.doesNotMatch(home, /See the dashboard/, who);
      assert.match(home, /<a class="tilelink" href="\/staff\/reports"><span class="tilename">Reports<\/span>/, who);
    }
  });
});
