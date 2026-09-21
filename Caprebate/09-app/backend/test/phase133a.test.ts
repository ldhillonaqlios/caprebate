/**
 * PHASE 133a — THE CRM'S LAYOUT. 17 September 2026.
 *
 * Lakhbir asked for a CRM that looks and works like the big ones — "easy to use, intuitive, an easy layout for each one
 * of the logins". The redesign moved every screen onto a new shell. This file proves the rules it was not allowed to
 * break, and the few things it promised:
 *
 *   THE MENU            → for every login, every link in the header opens (200); every back-office section NOT in the
 *                          header is refused (403). The menu shows what a login can open, and nothing it cannot.
 *   NO INLINE ANYTHING   → no page any login reaches carries a script, a style element, a style attribute or an event
 *                          handler; the stylesheet fetches nothing from anywhere.
 *   THE CSP              → the header is exactly the string it was before the phase.
 *   THE STAGE BAR        → the claim page marks the claim's STORED stage, for each of the ten, closed, a hold and an exit.
 *   JAVASCRIPT OFF       → the tabs are anchors with their panels on the page, the More menu and the user menu are
 *                          <details>, the board is a list, every page has its skip link — nothing waits on a script.
 *   A REFUSAL IS A PAGE  → 403, with a sentence, naming nothing about what was asked for.
 *   CONTRAST             → the palette's text colours meet WCAG 2.2 AA on their backgrounds.
 *
 * WRITTEN AGAINST HTTP ONLY, AND IMPORTING NOTHING THE PHASE ADDED, so the same file runs against the pre-change copy
 * (the .bak-phase133a files) to prove it can fail. The record of that run is in 04-phase-work/phase133a/.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { SITE_CSS } from '../src/web/assets.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; location: string | null; body: string; csp: string | null; type: string | null };
type Client = { get(path: string): Promise<Res> };

const LOGINS = ['admin', 'sales', 'accounting', 'surveying', 'readonly', 'client'] as const;
type Login = (typeof LOGINS)[number];

/** The CSP the HTML responses carried before this phase, copied from src/web/html.ts.bak-phase133a. */
const CSP_BEFORE = "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/** EVERY BACK-OFFICE SECTION, listed here by hand from the routes — not read from the navigation it is testing. */
// PHASE 136: '/staff/reports' stands where '/staff/dashboard' stood — the same page, under the same gate, behind Home's
// Reports tile. The old address now answers 303 to Home, asserted in test/phase135.test.ts.
const SECTIONS = [
  '/staff', '/staff/reports', '/staff/search', '/staff/tasks', '/staff/next-actions', '/staff/assessments', '/staff/leads',
  '/staff/pipeline', '/staff/clients', '/staff/organisations', '/staff/properties', '/staff/claims', '/staff/documents',
  '/staff/document-types', '/staff/introducers', '/staff/introducer-rewards', '/staff/survey', '/staff/finance',
  '/staff/calendar', '/staff/compliance', '/staff/admin-settings', '/staff/automation', '/staff/templates', '/staff/audit',
  '/staff/users', '/staff/settings', '/staff/admin',
];

/**
 * PHASE 135 — A SECTION CAN BE OFF A LOGIN'S MENU AND STILL OPEN. Lakhbir asked for menus that list only what each login
 * works in daily, so being allowed to open a section is no longer a reason to list it. The sections each login may open
 * but is not shown are listed here BY HAND, from the verdict table in the Developer Spec — so a section that starts
 * opening for a login, or drops off its menu, still turns this suite red.
 */
const OFF_MENU: Readonly<Record<Exclude<Login, 'client'>, readonly string[]>> = {
  admin: ['/staff/reports', '/staff/next-actions', '/staff/assessments', '/staff/properties', '/staff/claims', '/staff/documents',
    '/staff/document-types', '/staff/introducer-rewards', '/staff/compliance', '/staff/admin-settings', '/staff/automation',
    '/staff/templates', '/staff/audit', '/staff/users'],
  sales: ['/staff/reports', '/staff/next-actions', '/staff/assessments', '/staff/properties', '/staff/claims', '/staff/documents',
    '/staff/document-types', '/staff/introducer-rewards', '/staff/survey', '/staff/admin-settings', '/staff/automation', '/staff/templates'],
  accounting: ['/staff/reports', '/staff/documents', '/staff/introducers'],
  surveying: ['/staff/reports', '/staff/assessments', '/staff/properties', '/staff/claims', '/staff/documents'],
  readonly: ['/staff/reports', '/staff/tasks', '/staff/next-actions', '/staff/assessments', '/staff/properties', '/staff/claims',
    '/staff/documents', '/staff/document-types', '/staff/introducers', '/staff/introducer-rewards', '/staff/calendar',
    '/staff/admin-settings', '/staff/automation', '/staff/templates'],
};

async function boot(): Promise<{ made: Made; base: string; password: string; signIn(who: Login): Promise<Client> }> {
  const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-133a-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  // The seed assigns the read-only login to nobody (Phase 132e); this suite needs one.
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-133a', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  return {
    made, base, password: s.password,
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
          return { status: x.status, location: x.headers.get('location'), body: await x.text(), csp: x.headers.get('content-security-policy'), type: x.headers.get('content-type') };
        },
      };
    },
  };
}

/** The links a person can follow from the header: every href in it, and the search form's address. */
function headerLinks(body: string): string[] {
  const m = /<header class="top">([\s\S]*?)<\/header>/.exec(body);
  assert.ok(m !== null, 'the page has no header');
  const head = m[1] ?? '';
  const out = new Set<string>();
  for (const x of head.matchAll(/href="([^"#]+)"/g)) out.add((x[1] ?? '').replace(/&amp;/g, '&'));
  for (const x of head.matchAll(/<form[^>]*method="get"[^>]*action="([^"]+)"/g)) out.add(x[1] ?? '');
  return [...out];
}

/** Every same-origin page a login reaches by following links from its home — one example of each shape of address. */
async function crawl(c: Client, start: string): Promise<Map<string, Res>> {
  const seen = new Map<string, Res>();
  const shapes = new Set<string>();
  const queue = [start];
  while (queue.length > 0 && seen.size < 300) {
    const u = queue.shift() ?? '';
    if (seen.has(u)) continue;
    const r = await c.get(u);
    seen.set(u, r);
    if (r.status !== 200 || !(r.type ?? '').startsWith('text/html')) continue;
    for (const x of r.body.matchAll(/href="([^"#]+)"/g)) {
      const href = (x[1] ?? '').replace(/&amp;/g, '&');
      if (!href.startsWith('/') || href.startsWith('//')) continue;
      if (/^\/(assets|logout)|\.csv(\?|$)|\/upload\//.test(href)) continue;
      const shape = href.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}').replace(/=[^&]*/g, '=');
      if (shapes.has(shape)) continue;
      shapes.add(shape);
      queue.push(href);
    }
  }
  return seen;
}

let h: Awaited<ReturnType<typeof boot>>;
const clients = new Map<Login, Client>();
before(async () => {
  h = await boot();
  for (const who of LOGINS) clients.set(who, await h.signIn(who));
});
after(() => h.made.close());
const as = (who: Login): Client => clients.get(who) as Client;

/* ================================================================== *
 * THE MENU
 * ================================================================== */

describe('the menu shows each login what it can open, and nothing it cannot', () => {
  for (const who of LOGINS.filter((l) => l !== 'client')) {
    test(`${who}: every header link opens, and every section not in the header is refused unless it is one of this login's off-menu sections`, async () => {
      const home = await as(who).get('/staff');
      assert.equal(home.status, 200);
      const links = headerLinks(home.body);
      assert.ok(links.length >= 3, `${who}'s header carries almost nothing: ${links.join(', ')}`);
      for (const href of links) {
        const r = await as(who).get(href);
        assert.equal(r.status, 200, `${who}'s header links to ${href}, which answers ${r.status}`);
      }
      const off = OFF_MENU[who as Exclude<Login, 'client'>];
      for (const path of SECTIONS) {
        if (links.includes(path)) continue;
        const r = await as(who).get(path);
        if (off.includes(path)) { assert.equal(r.status, 200, `${path} is ${who}'s off-menu section, and answers ${r.status}`); continue; }
        // Phase 135: the organisations list is the one Clients list; its address sends a login that may read it there.
        if (path === '/staff/organisations' && links.includes('/staff/clients')) {
          assert.equal(r.status, 303, `${path} for ${who}`); assert.equal(r.location, '/staff/clients'); continue;
        }
        assert.equal(r.status, 403, `${path} opens for ${who} (${r.status}) but is neither in ${who}'s menu nor off-menu by name`);
      }
    });
  }

  for (const who of LOGINS) {
    test(`${who}: no link on any page reached from home leads to a screen this login is refused`, async () => {
      const pages = await crawl(as(who), who === 'client' ? '/portal' : '/staff');
      const refused = [...pages].filter(([, r]) => r.status === 403).map(([u]) => u);
      assert.deepEqual(refused, [], `${who} is shown links to screens it is refused`);
    });
  }

  test('the menu differs by login: Accounting is not shown the sections it is refused', async () => {
    const links = headerLinks((await as('accounting').get('/staff')).body);
    for (const refused of ['/staff/leads', '/staff/pipeline', '/staff/organisations', '/staff/compliance', '/staff/audit', '/staff/users']) {
      assert.equal(links.includes(refused), false, `accounting's menu links to ${refused}`);
    }
    assert.ok(links.includes('/staff/finance'), 'accounting has no Finance tab');
  });

  test('the client: the portal header links only to the portal, and the back office is refused', async () => {
    const home = await as('client').get('/portal');
    assert.equal(home.status, 200);
    for (const href of headerLinks(home.body)) {
      assert.ok(href.startsWith('/portal'), `the client's header links outside the portal: ${href}`);
      assert.equal((await as('client').get(href)).status, 200, href);
    }
    for (const path of SECTIONS) assert.equal((await as('client').get(path)).status, 403, `${path} for the client`);
  });
});

/* ================================================================== *
 * NO INLINE SCRIPT OR STYLE, AND THE CSP
 * ================================================================== */

const INLINE: readonly [RegExp, string][] = [
  [/<script\b/i, 'a script element'],
  [/<style\b/i, 'a style element'],
  [/\sstyle\s*=/i, 'a style attribute'],
  [/\son[a-z]+\s*=/i, 'an event-handler attribute'],
  [/href\s*=\s*"javascript:/i, 'a javascript: link'],
];

describe('no page carries inline script or style, and the CSP is unchanged', () => {
  for (const who of LOGINS) {
    test(`${who}: every page reached from home`, async () => {
      const pages = await crawl(as(who), who === 'client' ? '/portal' : '/staff');
      let html = 0;
      for (const [u, r] of pages) {
        if (!(r.type ?? '').startsWith('text/html')) continue;
        html++;
        for (const [re, what] of INLINE) assert.equal(re.test(r.body), false, `${u} (${who}) carries ${what}`);
        assert.equal(r.csp, CSP_BEFORE, `${u} (${who}) carries a different Content-Security-Policy`);
      }
      assert.ok(html >= 3, `${who} reached only ${html} pages`);
    });
  }

  test('the public pages, and the refusal page', async () => {
    for (const path of ['/', '/login', '/assessment']) {
      const r = await fetch(h.base + path, { redirect: 'manual' });
      let body = await r.text();
      if (r.status !== 200) continue;
      /* PHASE 133j: `/` IS THE WEBSITE, and it carries exactly one script: its own, from this origin, as a file. Its CSP
         is the back end's with `script-src 'self'` added and nothing else loosened. Every other rule still holds. */
      if (path === '/') {
        assert.equal(r.headers.get('content-security-policy'), CSP_BEFORE.replace("form-action", "script-src 'self'; form-action"),
          '/ carries a policy other than the back end’s plus its own script');
        assert.equal([...body.matchAll(/<script\b/gi)].length, 1, '/ carries more than its one script');
        body = body.replace('<script src="/assets/site-page.js"></script>', '');
      }
      for (const [re, what] of INLINE) assert.equal(re.test(body), false, `${path} carries ${what}`);
    }
    const refused = await as('accounting').get('/staff/organisations');
    for (const [re, what] of INLINE) assert.equal(re.test(refused.body), false, `the refusal page carries ${what}`);
  });

  test('the one stylesheet fetches nothing: no url(), no @import, no @font-face', () => {
    assert.equal(/url\s*\(/i.test(SITE_CSS), false);
    assert.equal(/@import/i.test(SITE_CSS), false);
    assert.equal(/@font-face/i.test(SITE_CSS), false);
  });
});

/* ================================================================== *
 * THE STAGE BAR
 * ================================================================== */

describe('the stage bar marks the claim’s real stage', () => {
  const TEN = ['ENQUIRY', 'ASSESSMENT', 'ENGAGEMENT', 'DATA_GATHERING', 'SURVEY', 'VALUATION', 'TAX_ADVISER_SIGNOFF', 'REPORTS', 'INVOICE', 'DEFENCE_PACK'];

  function bar(body: string): { current: string[]; done: string[]; todo: string[] } {
    const m = /<nav class="stagebar"[^>]*>([\s\S]*?)<\/nav>/.exec(body);
    assert.ok(m !== null, 'the claim page has no stage bar');
    const read = (cls: string): string[] => [...(m[1] ?? '').matchAll(new RegExp(`<li class="${cls}"[^>]*data-stage="([A-Z_]+)"`, 'g'))].map((x) => x[1] ?? '');
    const current = [...(m[1] ?? '').matchAll(/aria-current="step" data-stage="([A-Z_]+)"/g)].map((x) => x[1] ?? '');
    return { current, done: read('done'), todo: read('todo') };
  }

  test('each of the ten stages, as stored, is the one step marked current; every stage before it is done', async () => {
    const claim = h.made.app.db.get<{ id: string }>("SELECT id FROM claims ORDER BY claim_ref LIMIT 1");
    assert.ok(claim);
    for (const [i, key] of TEN.entries()) {
      h.made.app.db.run('UPDATE claims SET stage = ? WHERE id = ?', [key, claim.id]);
      const page = await as('sales').get(`/staff/claims/${claim.id}`);
      assert.equal(page.status, 200);
      const b = bar(page.body);
      assert.deepEqual(b.current, [key], `stored ${key}, the bar marks ${b.current.join(', ') || 'nothing'}`);
      assert.deepEqual(b.done, TEN.slice(0, i), `stored ${key}: the done steps`);
      assert.ok(b.todo.includes('CLOSED'), `stored ${key}: Closed is still to do`);
    }
  });

  test('closed marks every step done; a hold marks the stage it returns to; an exit marks where it left', async () => {
    const claim = h.made.app.db.get<{ id: string }>("SELECT id FROM claims ORDER BY claim_ref LIMIT 1");
    assert.ok(claim);
    h.made.app.db.run("UPDATE claims SET stage = 'CLOSED', completed_at = '2026-09-08' WHERE id = ?", [claim.id]);
    let b = bar((await as('sales').get(`/staff/claims/${claim.id}`)).body);
    assert.deepEqual(b.current, []);
    assert.deepEqual(b.done, [...TEN, 'CLOSED']);

    h.made.app.db.run("UPDATE claims SET stage = 'ON_HOLD', completed_at = NULL, hold_reason = 'waiting for the client', hold_return_stage = 'SURVEY' WHERE id = ?", [claim.id]);
    const held = await as('sales').get(`/staff/claims/${claim.id}`);
    b = bar(held.body);
    assert.deepEqual(b.current, ['SURVEY']);
    assert.match(held.body, /class="badge b-warn">On hold</);

    h.made.app.db.run("UPDATE claims SET stage = 'LOST', hold_reason = NULL, hold_return_stage = NULL WHERE id = ?", [claim.id]);
    const lost = await as('sales').get(`/staff/claims/${claim.id}`);
    assert.match(lost.body, /Left the procedure: Lost/);
  });
});

/* ================================================================== *
 * JAVASCRIPT OFF
 * ================================================================== */

describe('every page works with JavaScript switched off', () => {
  test('every page has a skip link to its main content, and nothing that needs a script', async () => {
    for (const who of LOGINS) {
      const pages = await crawl(as(who), who === 'client' ? '/portal' : '/staff');
      for (const [u, r] of pages) {
        if (r.status !== 200 || !(r.type ?? '').startsWith('text/html')) continue;
        assert.match(r.body, /<a class="skip" href="#main">/, `${u} (${who}) has no skip link`);
        assert.match(r.body, /<main id="main"/, `${u} (${who}) has no main landmark`);
        assert.equal(/<noscript/i.test(r.body), false, `${u} (${who}) asks for a script`);
      }
    }
  });

  test('record tabs are links to panels that are on the page; menus are <details>; the board is a list', async () => {
    const claim = h.made.app.db.get<{ id: string; business_id: string; property_id: string | null }>("SELECT id, business_id, property_id FROM claims ORDER BY claim_ref LIMIT 1");
    assert.ok(claim);
    const lead = h.made.app.db.get<{ id: string }>('SELECT id FROM leads LIMIT 1');
    assert.ok(lead);
    // Phase 134: the organisation's page is the one client page, whose tabs test/phase133b.test.ts reads.
    // Phase 138: the claim page is coloured sections that open and close, not tabs — test/phase138.test.ts reads them;
    // here it is enough that each is a <details> with its own id, which needs no script.
    const claimPage = await as('sales').get(`/staff/claims/${claim.id}`);
    for (const id of ['move', 'claim-documents', 'activity']) {
      assert.match(claimPage.body, new RegExp(`<details class="sec sec-[a-z]+" id="${id}"`), `the claim page has no ${id} section`);
    }
    const records = [`/staff/leads/${lead.id}`,
      ...(claim.property_id === null ? [] : [`/staff/properties/${claim.property_id}`])];
    for (const path of records) {
      const page = await as('sales').get(path);
      assert.equal(page.status, 200, path);
      for (const tab of ['details', 'related', 'activity']) {
        assert.ok(page.body.includes(`href="#${tab}"`), `${path}: no ${tab} tab`);
        assert.ok(page.body.includes(`class="tabpanel" id="${tab}"`), `${path}: the ${tab} panel is not on the page`);
      }
      assert.match(page.body, /<header class="highlights">/, `${path}: no highlights panel`);
      assert.match(page.body, /<aside class="side"/, `${path}: no right-hand panel`);
    }
    const home = await as('sales').get('/staff');
    assert.match(home.body, /<details class="usermenu">/);
    assert.match(home.body, /<li class="more"><details/);
    const board = await as('sales').get('/staff/pipeline');
    assert.match(board.body, /<ol class="board"/);
    assert.match(board.body, /<li id="stage-ENQUIRY"/);
  });
});

/* ================================================================== *
 * A REFUSAL IS A PAGE
 * ================================================================== */

describe('a refused screen answers 403, as a page that names nothing', () => {
  test('accounting opening an organisation', async () => {
    const org = h.made.app.db.get<{ id: string; name: string }>('SELECT id, name FROM businesses ORDER BY name LIMIT 1');
    assert.ok(org);
    const r = await as('accounting').get(`/staff/organisations/${org.id}`);
    assert.equal(r.status, 403);
    assert.match(r.type ?? '', /text\/html/);
    assert.match(r.body, /You cannot open this page/);
    assert.equal(r.body.includes(org.name), false, 'the refusal names the organisation');
    assert.equal(r.body.includes(org.id), false, 'the refusal carries the id');
  });

  test('a data address keeps its JSON refusal', async () => {
    const r = await as('accounting').get('/staff/pipeline/view.json');
    assert.equal(r.status, 403);
    assert.match(r.type ?? '', /application\/json/);
  });
});

/* ================================================================== *
 * CONTRAST
 * ================================================================== */

describe('the palette meets WCAG 2.2 AA', () => {
  function lum(hex: string): number {
    const n = hex.replace('#', '');
    const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  }
  const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05); };
  const token = (name: string): string => {
    const m = new RegExp(`--${name}:(#[0-9a-fA-F]{6})`).exec(SITE_CSS);
    assert.ok(m !== null, `the stylesheet has no --${name}`);
    return m[1] ?? '';
  };

  test('text on its backgrounds is at least 4.5:1', () => {
    // PHASE 133c: the Cap Rebate brand tokens replaced Phase 133a's green (brand book slides 31 to 33). Muted grey is
    // checked on white only, where it is used; the accent is Cap Ink until the design team supplies one.
    const pairs: [string, string][] = [
      ['ink', 'white'], ['ink', 'mist'], ['ink', 'mint'], ['body', 'white'], ['body', 'mist'], ['mut', 'white'],
      ['accent', 'white'], ['accent', 'mist'], ['on-accent', 'accent'],
      ['ok', 'okbg'], ['warn', 'warnbg'], ['stop', 'stopbg'], ['stop', 'white'], ['stop', 'mist'],
    ];
    for (const [fg, bg] of pairs) {
      const r = ratio(token(fg), token(bg));
      assert.ok(r >= 4.5, `--${fg} on --${bg} is ${r.toFixed(2)}:1`);
    }
    assert.ok(ratio('#ffffff', token('mint')) < 4.5, 'white on mint fails, which is why the brand forbids it');
  });
});
