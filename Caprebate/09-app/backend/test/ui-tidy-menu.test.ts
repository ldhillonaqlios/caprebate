/**
 * UI TIDY PHASE 2 — THE LEFT-HAND MENU, 2 October 2026 (src/web/navigation.ts, its rules in src/web/assets.ts).
 * Each login's menu in named groups with nothing under More; the entries that open out under the current section;
 * the phone's Menu button, which needs no script. Which addresses each login may open is test/phase135.test.ts's.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { SITE_CSS } from '../src/web/assets.ts';
import { navContext, setSubMenu, staffShell } from '../src/web/navigation.ts';
import type { Actor } from '../src/authz.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string };
const WHO = ['admin', 'sales', 'accounting', 'surveying', 'readonly', 'client'] as const;
type Who = (typeof WHO)[number];

/** Each login's menu: each group's name (none for the first), then its sections, in order. */
const GROUPS: Readonly<Record<Exclude<Who, 'client'>, readonly (readonly [string | null, readonly string[]])[]>> = {
  admin: [[null, ['Home', 'Tasks']], ['Winning clients', ['Leads', 'Pipeline', 'Introducers']],
    ['Clients and claims', ['Clients', 'Survey jobs', 'Calendar']], ['Money', ['Finance']], ['Admin', ['Settings']]],
  sales: [[null, ['Home', 'Tasks']], ['Winning clients', ['Leads', 'Pipeline', 'Introducers']], ['Clients and claims', ['Clients', 'Calendar']]],
  accounting: [[null, ['Home', 'Tasks']], ['Clients and claims', ['Clients', 'Claims']], ['Money', ['Finance', 'Introducer fees']]],
  surveying: [[null, ['Home', 'Survey jobs', 'Tasks']]],
  readonly: [[null, ['Home']], ['Winning clients', ['Leads', 'Pipeline']], ['Clients and claims', ['Clients']]],
};

const SETTINGS = ['Users', 'Switches', 'Document types', 'Automation', 'Email templates', 'Compliance', 'Audit log', 'Introducer fees'];

const words = (html: string): string => html.replace(/<span class="(vh|tabcount|subnote)[^"]*">[\s\S]*?<\/span>(<\/span>)?/g, '')
  .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const navOf = (body: string): string => /<nav class="appnav[^"]*" aria-label="Sections">[\s\S]*?<\/nav>/.exec(body)?.[0] ?? '';

/** The groups as drawn: a group's name, then the words of each top-level link (the opened-out entries left aside). */
function groupsOf(body: string): [string | null, string[]][] {
  return [...navOf(body).matchAll(/<li class="navgroup">([\s\S]*?)<\/ul><\/li>(?=<li class="navgroup">|<\/ul><\/nav>)/g)].map((m) => {
    const g = (m[1] ?? '').replace(/<p class="subtitle">[\s\S]*?<\/p>/g, '').replace(/<ul class="subnav">[\s\S]*?<\/ul>/g, '');
    const label = /<p class="navlabel">([\s\S]*?)<\/p>/.exec(g)?.[1] ?? null;
    return [label, [...g.matchAll(/<a href="[^"]+"[^>]*>([\s\S]*?)<\/a>/g)].map((a) => words(a[1] ?? ''))];
  });
}

function subOf(body: string): { title: string | null; items: string[]; current: string[] } | null {
  const nav = navOf(body);
  const ul = /<ul class="subnav">([\s\S]*?)<\/ul>/.exec(nav)?.[1];
  if (ul === undefined) return null;
  return {
    title: /<p class="subtitle">([\s\S]*?)<\/p>/.exec(nav)?.[1] ?? null,
    items: [...ul.matchAll(/<a href="[^"]+"[^>]*>([\s\S]*?)<\/a>/g)].map((a) => words(a[1] ?? '')),
    current: [...ul.matchAll(/<a href="[^"]+" aria-current="page">([\s\S]*?)<\/a>/g)].map((a) => words(a[1] ?? '')),
  };
}

let made: Made;
let base = '';
const cookies = new Map<Who, string>();
const get = async (who: Who, path: string): Promise<Res> => {
  const x = await fetch(base + path, { redirect: 'manual', headers: { cookie: cookies.get(who) ?? '' } });
  return { status: x.status, body: await x.text() };
};

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-uit2-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const t = made.app.now();
  made.app.db.run(
    'INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-readonly-uit2', 'readonly@example.invalid', 'readonly@example.invalid', 'Read-only Person', 'READ_ONLY', await made.app.hasher.hash(s.password), t, t],
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

describe('UI tidy phase 2: each login’s menu, in named groups', () => {
  for (const who of ['admin', 'sales', 'accounting', 'surveying', 'readonly'] as const) {
    test(`${who}: exactly its groups, in order, and nothing under More`, async () => {
      const r = await get(who, '/staff');
      assert.equal(r.status, 200);
      assert.deepEqual(groupsOf(r.body), GROUPS[who].map(([l, s]) => [l, [...s]]));
      assert.doesNotMatch(r.body, /<li class="more">|<summary>More<\/summary>/);
    });
  }

  test('a section is listed only where its gate admits the login: a switched-off login is listed none', () => {
    const admin = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@example.invalid'");
    assert.ok(admin !== undefined);
    const html = navContext.run({ db: made.app.db, now: made.app.now, path: '/staff' },
      () => staffShell({ id: admin.id, role: 'ADMIN', business_id: null, disabled: true }).html);
    assert.deepEqual(groupsOf(html), []);
  });

  test('the client’s menu is Your claims and Messages, with no group names', async () => {
    const r = await get('client', '/portal');
    const nav = navOf(r.body);
    assert.match(nav, /<a href="\/portal" aria-current="page">Your claims<\/a>/);
    assert.match(nav, /<a href="\/portal\/messages">Messages/);
    assert.doesNotMatch(nav, /navlabel|subnav/);
  });
});

describe('UI tidy phase 2: the menu opens out under the current section', () => {
  test('on a setting’s page, Settings opens out to every setting Admin may open, that one marked', async () => {
    const r = await get('admin', '/staff/users');
    assert.equal(r.status, 200);
    assert.match(navOf(r.body), /<a href="\/staff\/admin" aria-current="page">Settings<\/a><ul class="subnav">/);
    assert.deepEqual(subOf(r.body), { title: null, items: SETTINGS, current: ['Users'] });
    const audit = await get('admin', '/staff/audit');
    assert.deepEqual(subOf(audit.body)?.current, ['Audit log']);
  });

  test('on Settings itself every setting is listed and none is marked; elsewhere nothing opens out', async () => {
    assert.deepEqual(subOf((await get('admin', '/staff/admin')).body), { title: null, items: SETTINGS, current: [] });
    for (const [who, path] of [['admin', '/staff'], ['admin', '/staff/pipeline'], ['sales', '/staff/tasks'], ['accounting', '/staff/introducer-rewards'], ['client', '/portal']] as const) {
      assert.equal(subOf((await get(who, path)).body), null, `${who} ${path}`);
    }
  });

  test('a page’s own entries replace the default, are escaped, and last for that one request', async () => {
    const admin = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@example.invalid'");
    assert.ok(admin !== undefined);
    const actor: Actor = { id: admin.id, role: 'ADMIN', business_id: null, disabled: false };
    const ctx = { db: made.app.db, now: made.app.now, path: '/staff/clients/x' };
    const html = navContext.run(ctx, () => {
      setSubMenu({ title: '<Dunmarrow>', items: [{ href: '/a', label: 'Main site', note: '2 days late', current: true }, { href: '/b', label: 'B & C' }] });
      return staffShell(actor).html;
    });
    assert.match(html, /<a href="\/staff\/clients" aria-current="page">Clients<\/a><p class="subtitle">&lt;Dunmarrow&gt;<\/p><ul class="subnav"><li><a href="\/a" aria-current="page">Main site <span class="subnote">2 days late<\/span><\/a><\/li><li><a href="\/b">B &amp; C<\/a><\/li><\/ul>/);
    const again = navContext.run({ db: made.app.db, now: made.app.now, path: '/staff/clients/x' }, () => staffShell(actor).html);
    assert.doesNotMatch(again, /subnav/, 'a page’s entries outlived its request');
    const untitled = navContext.run({ db: made.app.db, now: made.app.now, path: '/staff/users' },
      () => { setSubMenu({ items: [{ href: '/c', label: 'Only this' }] }); return staffShell(actor).html; });
    assert.match(untitled, /<ul class="subnav"><li><a href="\/c">Only this<\/a><\/li><\/ul>/, 'a page’s own entries, untitled, did not replace Settings’ list');
    assert.doesNotThrow(() => setSubMenu({ items: [] }), 'outside a request it does nothing');
    const none = navContext.run({ db: made.app.db, now: made.app.now, path: '/staff/clients/x' }, () => { setSubMenu({ items: [] }); return staffShell(actor).html; });
    assert.doesNotMatch(none, /subnav|subtitle/, 'an empty list draws nothing');
  });
});

describe('UI tidy phase 2: the phone’s Menu button and the left-hand layout', () => {
  test('every login’s header ends with one Menu button: a checkbox and its label, no script', async () => {
    for (const [who, path] of [['admin', '/staff'], ['sales', '/staff/leads'], ['accounting', '/staff/finance'], ['surveying', '/staff/survey'], ['readonly', '/staff'], ['client', '/portal']] as const) {
      const body = (await get(who, path)).body;
      const header = /<header class="top">([\s\S]*?)<\/header>/.exec(body)?.[1] ?? '';
      assert.match(header, /<\/nav><input type="checkbox" id="navtoggle" class="navtoggle"><label for="navtoggle" class="navbutton">Menu<\/label><\/div>$/, `${who} ${path}`);
      assert.equal((body.match(/id="navtoggle"/g) ?? []).length, 1);
      assert.doesNotMatch(body, /<script/i);
    }
  });

  test('from 900 px the header is a black menu down the left, and under 900 px it folds behind the button', () => {
    assert.match(SITE_CSS, /@media \(min-width:900px\)\{\n {2}body\.app\{display:grid;grid-template-columns:15\.5rem minmax\(0,1fr\)/);
    assert.match(SITE_CSS, /body\.app>header\.top\{grid-column:1;grid-row:1\/span 2;position:sticky;top:0;height:100vh;overflow-y:auto\}/);
    assert.match(SITE_CSS, /body\.app>header\.top\{background:var\(--ink\)/);
    assert.match(SITE_CSS, /\.navtoggle,\.navbutton\{display:none\}/);
    assert.match(SITE_CSS, /@media \(max-width:899\.98px\)\{[\s\S]*?body\.app \.navbutton\{display:inline-flex/);
    assert.match(SITE_CSS, /body\.app \.topline \.dash-tabs,body\.app \.gsearch,body\.app \.appnav,body\.app \.helplink,body\.app \.usermenu\{display:none/);
    assert.match(SITE_CSS, /body\.app \.topline:has\(\.navtoggle:checked\) \.appnav\{display:block/);
    assert.match(SITE_CSS, /body\.app \.navtoggle:focus-visible\+\.navbutton\{outline:3px solid var\(--mint\)/, 'the button shows keyboard focus');
  });

  test('the current page is mint with black words, never white on mint; the public pages are untouched', () => {
    assert.match(SITE_CSS, /body\.app \.tabs-main>li>a\[aria-current="page"\]\{background:var\(--mint\);color:var\(--ink\)/);
    assert.match(SITE_CSS, /body\.app \.subnav a\[aria-current="page"\]\{background:var\(--mint\);color:var\(--ink\)/);
    const from = SITE_CSS.lastIndexOf('/*', SITE_CSS.indexOf('UI TIDY PHASE 2 — THE LEFT-HAND MENU'));
    const block = SITE_CSS.slice(from, SITE_CSS.indexOf('\n/* ', from + 10)); // up to the next block's opening comment
    const rules = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '');
    for (const m of rules.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
      for (const one of (m[1] ?? '').split(',')) {
        assert.match(one.trim(), /^(body\.app\b|\.navtoggle$|\.navbutton$)/, `a rule reaches past the app: ${one.trim()}`);
      }
    }
    for (const m of block.matchAll(/font-size:(\d+)px/g)) assert.ok(Number(m[1]) >= 12, `font-size ${m[1]}px`);
  });
});
