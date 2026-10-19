/**
 * PHASE 160a — THE BACK OFFICE IN THE LAYOUT LAKHBIR CHOSE, 19 October 2026 (the Cap Rebate Simple CRM design;
 * src/web/navigation.ts staffShell and Shell.bar, src/web/html.ts page(), the PHASE 160a block in src/web/assets.ts).
 * A navy menu down the left holding only the login's own sections; a white top bar over the page with where you are,
 * Admin's views, the search, Help and the user menu; a page's own trail moved up into it. Staff only: the client portal
 * and the public pages keep their look. Which sections each login may open is still test/phase135.test.ts's.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { BRAND_TOKENS, SITE_CSS, TEXT_PAIRINGS } from '../src/web/assets.ts';
import { SECTIONS, tabsFor } from '../src/web/navigation.ts';
import type { Actor } from '../src/authz.ts';
import type { AppRole } from '../src/roles.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string };
const STAFF = ['admin', 'sales', 'accounting', 'surveying', 'readonly'] as const;
const WHO = [...STAFF, 'client'] as const;
type Who = (typeof WHO)[number];
const ROLE: Readonly<Record<(typeof STAFF)[number], AppRole>> = {
  admin: 'ADMIN', sales: 'SALES', accounting: 'ACCOUNTING', surveying: 'SURVEYING', readonly: 'READ_ONLY',
};

let made: Made;
let base = '';
const cookies = new Map<Who, string>();
const get = async (who: Who | null, path: string): Promise<Res> => {
  const x = await fetch(base + path, { redirect: 'manual', headers: { cookie: who === null ? '' : cookies.get(who) ?? '' } });
  return { status: x.status, body: await x.text() };
};
const sidebar = (body: string): string => /<header class="top">([\s\S]*?)<\/header>/.exec(body)?.[1] ?? '';
const topBar = (body: string): string | null => /<\/header><div class="crumbbar">([\s\S]*?)<\/div>\s*<main/.exec(body)?.[1] ?? null;
const mainOf = (body: string): string => /<main[^>]*>([\s\S]*?)<\/main>/.exec(body)?.[1] ?? '';
const words = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
/** The trail as the words of each step, and which step is the page itself. */
function trailOf(bar: string): { steps: string[]; current: string | null } {
  const nav = /<nav class="crumbs" aria-label="Where you are"><ol>([\s\S]*?)<\/ol><\/nav>/.exec(bar)?.[1] ?? '';
  return {
    steps: [...nav.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => words(m[1] ?? '')),
    current: /<span aria-current="page">([\s\S]*?)<\/span>/.exec(nav)?.[1] ?? null,
  };
}
const actorOf = (who: (typeof STAFF)[number]): Actor => {
  const u = made.app.db.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [`${who}@example.invalid`]);
  assert.ok(u !== undefined, who);
  return { id: u.id, role: ROLE[who], business_id: null, disabled: false } as Actor;
};

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160a-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-160a', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
  );
  for (const who of WHO) {
    const r = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: `${who}@example.invalid`, password: s.password }).toString(),
    });
    assert.equal(r.status, 303, `${who} could not sign in`);
    cookies.set(who, r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '));
  }
});
after(() => made.close());

describe('Phase 160a: the menu down the left holds the login’s own sections, and nothing else', () => {
  for (const who of STAFF) {
    test(`${who}: the sidebar is the name, exactly its menu and the Menu button; the search, Help and user menu are not in it`, async () => {
      const r = await get(who, '/staff');
      assert.equal(r.status, 200);
      assert.match(r.body, /<body class="app staffapp">/);
      const side = sidebar(r.body);
      assert.match(side, /^<div class="topline"><a class="brand" href="\/staff">Cap Rebate<span class="brandsub">Back office<\/span><\/a><nav class="appnav" aria-label="Sections">/);
      const hrefs = [...side.matchAll(/<ul class="tabs-main">[\s\S]*?<\/ul><\/li>/g)].flatMap((g) =>
        [...(g[0] ?? '').replace(/<ul class="subnav">[\s\S]*?<\/ul>/g, '').matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]));
      assert.deepEqual(hrefs, tabsFor(actorOf(who)).primary.map((s) => s.href), `${who}'s sidebar is not its menu`);
      assert.doesNotMatch(side, /class="gsearch"|class="usermenu"|class="helplink"|class="dash-tabs"|class="util"/);
      assert.match(side, /<\/nav><input type="checkbox" id="navtoggle" class="navtoggle"><label for="navtoggle" class="navbutton">Menu<\/label><\/div>$/);
    });
  }
});

describe('Phase 160a: the top bar over the page', () => {
  for (const who of STAFF) {
    test(`${who}: the trail, then the search, Help and the user menu, between the sidebar and the page`, async () => {
      const bar = topBar((await get(who, '/staff/tasks')).body);
      assert.ok(bar !== null, 'no top bar between the header and the page');
      assert.match(bar, /^<a class="crumbroot" href="\/staff">Cap Rebate<\/a><nav class="crumbs" aria-label="Where you are"><ol>/);
      assert.deepEqual(trailOf(bar), { steps: ['Tasks'], current: 'Tasks' });
      assert.match(bar, /<div class="util"><form class="gsearch" method="get" action="\/staff\/search" role="search">[\s\S]*<a class="helplink" href="\/staff\/help\?screen=B22">Help<\/a><details class="usermenu">/);
    });
  }

  test('the trail names the section and then the page; on a section’s own list it is the section alone', async () => {
    assert.deepEqual(trailOf(topBar((await get('admin', '/staff')).body) ?? ''), { steps: ['Home'], current: 'Home' });
    assert.deepEqual(trailOf(topBar((await get('admin', '/staff/leads')).body) ?? ''), { steps: ['Leads'], current: 'Leads' });
    const users = trailOf(topBar((await get('admin', '/staff/users')).body) ?? '');
    assert.equal(users.steps[0], 'Settings', 'a page under Settings is not under Settings in the trail');
    assert.equal(users.steps.length, 2);
    assert.equal(users.current, users.steps[1]);
    // the section is a link back to it; the page itself is words
    assert.match(topBar((await get('admin', '/staff/users')).body) ?? '', /<li><a href="\/staff\/admin">Settings<\/a><\/li><li><span aria-current="page">/);
  });

  test('a page that draws its own trail has it moved up, unchanged, so the page shows one trail, not two', async () => {
    const list = (await get('admin', '/staff/clients')).body;
    const id = /href="\/staff\/clients\/([A-Za-z0-9-]+)"/.exec(list)?.[1];
    assert.ok(id !== undefined, 'no client to open');
    const r = await get('admin', `/staff/clients/${id}`);
    assert.equal(r.status, 200);
    const bar = topBar(r.body) ?? '';
    assert.match(bar, /^<a class="crumbroot" href="\/staff">Cap Rebate<\/a><nav class="crumbs" aria-label="Where you are"><ol><li><a href="\/staff\/clients">Clients<\/a><\/li><li><span aria-current="page">/);
    assert.equal((r.body.match(/<nav class="crumbs"/g) ?? []).length, 1, 'the page shows two trails');
    assert.doesNotMatch(mainOf(r.body), /class="crumbs"/);
  });

  test('Admin’s "Home shows" views are in the top bar, and only Admin has them', async () => {
    assert.match(topBar((await get('admin', '/staff')).body) ?? '', /<\/nav><nav class="dash-tabs" aria-label="Whose dashboard">[\s\S]*?<\/nav><div class="util">/);
    for (const who of ['sales', 'accounting', 'surveying', 'readonly'] as const) {
      assert.doesNotMatch((await get(who, '/staff')).body, /class="dash-tabs"/, who);
    }
  });
});

describe('Phase 160a: staff only, and nothing loosened', () => {
  test('the client portal keeps its header and has no top bar; the public pages have neither', async () => {
    const portal = (await get('client', '/portal')).body;
    assert.match(portal, /<body class="app">/);
    assert.equal(topBar(portal), null);
    assert.doesNotMatch(portal, /class="crumbbar"|class="crumbroot"|class="brandsub"/);
    assert.match(sidebar(portal), /<div class="util"><a class="helplink" href="\/portal\/help">Help<\/a><details class="usermenu">/);
    const home = (await get(null, '/login')).body;
    assert.match(home, /<body class="public">/);
    assert.doesNotMatch(home, /class="crumbbar"|staffapp/);
  });

  test('no back-office page carries a style attribute or a script', async () => {
    for (const path of ['/staff', '/staff/leads', '/staff/clients', '/staff/tasks', '/staff/finance', '/staff/admin', '/staff/survey']) {
      const r = await get('admin', path);
      assert.equal(r.status, 200, path);
      assert.doesNotMatch(r.body, /\sstyle=|<script/i, path);
    }
  });

  test('a section off a login’s menu is still refused by its address', async () => {
    assert.equal((await get('sales', '/staff/finance')).status, 403);
    assert.equal((await get('surveying', '/staff/leads')).status, 403);
  });

  test('every section has its icon, the stylesheet fetches nothing, and every rule of the block is the back office’s', () => {
    const from = SITE_CSS.lastIndexOf('/*', SITE_CSS.indexOf('PHASE 160a — THE BACK OFFICE IN THE LAYOUT'));
    const block = SITE_CSS.slice(from, SITE_CSS.indexOf('THE PUBLIC PAGES IN THE HOME PAGE'));
    for (const s of SECTIONS) {
      assert.match(block, new RegExp(`body\\.staffapp \\.tabs-main>li>a\\[href="${s.href}"\\]::before\\{content:"\\\\[0-9A-F]{4}";content:"\\\\[0-9A-F]{4}" / ""\\}`), `${s.label} has no icon`);
    }
    assert.doesNotMatch(block, /url\(|@import|@font-face/);
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '');
    for (const m of rules.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const one of (m[1] ?? '').split(',')) assert.match(one.trim(), /^body\.staffapp\b/, `a rule reaches past the back office: ${one}`);
    }
  });

  test('the navy, the grey page and the column headings are tokens, and each pairing reads at 4.5:1 or better', () => {
    const lum = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
    };
    const ratio = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05); };
    for (const t of ['navy', 'navy-2', 'navy-mute', 'page', 'rule', 'thead']) assert.match(BRAND_TOKENS[t] ?? '', /^#[0-9a-f]{6}$/i, t);
    const wanted: readonly (readonly [string, string])[] = [['white', 'navy'], ['navy-mute', 'navy'], ['white', 'navy-2'], ['navy-mute', 'navy-2'],
      ['ink', 'page'], ['body', 'page'], ['navy', 'white'], ['navy', 'page'], ['thead', 'white'], ['thead', 'page'], ['thead', 'zebra'], ['mint', 'navy']];
    for (const [fg, bg] of wanted) {
      assert.ok(TEXT_PAIRINGS.some(([a, b]) => a === fg && b === bg), `${fg} on ${bg} is not a listed pairing`);
      const r = ratio(BRAND_TOKENS[fg] ?? '#000000', BRAND_TOKENS[bg] ?? '#000000');
      assert.ok(r >= 4.5, `${fg} on ${bg} reads at ${r.toFixed(2)}:1`);
    }
  });
});
