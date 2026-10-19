/**
 * PHASE 160b — THE CLIENT PORTAL IN THE SAME LAYOUT AS THE BACK OFFICE, 19 October 2026 (Phase 160a's look, now under
 * body.crm, which both carry; src/web/navigation.ts portalShell and its Shell.bar, src/web/html.ts page()). The menu down
 * the left holds the logo and the client's two screens; a top bar over the page holds where you are, Help and the user
 * menu, and no search; a claim page's own trail is moved up into it. What a client may see or do is unchanged.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { SITE_CSS } from '../src/web/assets.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string };

let made: Made;
let base = '';
let cookie = '';
const get = async (path: string): Promise<Res> => {
  const x = await fetch(base + path, { redirect: 'manual', headers: { cookie } });
  return { status: x.status, body: await x.text() };
};
const sidebar = (body: string): string => /<header class="top">([\s\S]*?)<\/header>/.exec(body)?.[1] ?? '';
const topBar = (body: string): string | null => /<\/header><div class="crumbbar">([\s\S]*?)<\/div>\s*<main/.exec(body)?.[1] ?? null;
const mainOf = (body: string): string => /<main[^>]*>([\s\S]*?)<\/main>/.exec(body)?.[1] ?? '';
const words = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function trailOf(bar: string): { steps: string[]; current: string | null } {
  const nav = /<nav class="crumbs" aria-label="Where you are"><ol>([\s\S]*?)<\/ol><\/nav>/.exec(bar)?.[1] ?? '';
  return {
    steps: [...nav.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => words(m[1] ?? '')),
    current: /<span aria-current="page">([\s\S]*?)<\/span>/.exec(nav)?.[1] ?? null,
  };
}

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160b-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  const s = await seed(made.app.db, made.app.hasher, made.app.now);
  const r = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'client@example.invalid', password: s.password }).toString(),
  });
  assert.equal(r.status, 303, 'the client could not sign in');
  cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
});
after(() => made.close());

describe('Phase 160b: the portal’s menu down the left', () => {
  test('the logo, Your claims and Messages, each with its icon, and the Menu button; Help and the user menu are not in it', async () => {
    const r = await get('/portal');
    assert.equal(r.status, 200);
    assert.match(r.body, /<body class="app crm portalapp">/);
    const side = sidebar(r.body);
    // PHASE 160c: the home page's mark and wordmark, with "Client portal" under the name, in place of the supplied lockup.
    assert.match(side, /^<div class="topline"><a class="brandmark" href="\/portal" aria-label="Cap Rebate, home"><svg class="mark"[\s\S]*?<\/svg><span class="wm">Cap Rebate<span class="brandsub">Client portal<\/span><\/span><\/a>/);
    assert.deepEqual([...side.replace(/<ul class="subnav">[\s\S]*?<\/ul>/g, '').matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]), ['/portal', '/portal/messages']);
    assert.doesNotMatch(side, /class="util"|class="helplink"|class="usermenu"|class="gsearch"/);
    assert.match(side, /<\/nav><input type="checkbox" id="navtoggle" class="navtoggle"><label for="navtoggle" class="navbutton">Menu<\/label><\/div>$/);
    for (const href of ['/portal', '/portal/messages']) {
      assert.match(SITE_CSS, new RegExp(`body\\.crm \\.tabs-main>li>a\\[href="${href}"\\]::before\\{content:"\\\\[0-9A-F]{4}"`), `${href} has no icon`);
    }
  });

  test('the unread count still sits on Messages', async () => {
    const biz = made.app.db.get<{ business_id: string }>("SELECT business_id FROM users WHERE email = 'client@example.invalid'");
    const staff = made.app.db.get<{ id: string }>("SELECT id FROM users WHERE email = 'sales@example.invalid'");
    assert.ok(biz !== undefined && staff !== undefined);
    made.app.db.run(
      "INSERT INTO client_messages (id,business_id,claim_id,direction,source,author_id,contact_id,body,created_at) VALUES (?,?,NULL,'TO_CLIENT','STAFF',?,NULL,?,?)",
      [randomUUID(), biz.business_id, staff.id, 'We will visit on Tuesday.', made.app.now()],
    );
    const side = sidebar((await get('/portal')).body);
    assert.match(side, /<a href="\/portal\/messages">Messages <span class="tabcount" aria-label="1 not read">1<\/span><\/a>/);
  });
});

describe('Phase 160b: the portal’s top bar', () => {
  test('Cap Rebate to the portal, the trail, Help and the user menu, and no search', async () => {
    const bar = topBar((await get('/portal')).body);
    assert.ok(bar !== null, 'no top bar between the header and the page');
    assert.match(bar, /^<a class="crumbroot" href="\/portal">Cap Rebate<\/a><nav class="crumbs" aria-label="Where you are"><ol>/);
    // The portal's home is titled with the client's company, so the trail is Your claims, then the company.
    const t = trailOf(bar);
    assert.equal(t.steps[0], 'Your claims');
    assert.equal(t.steps.length, 2);
    assert.equal(t.current, t.steps[1]);
    assert.match(bar, /<li><a href="\/portal">Your claims<\/a><\/li><li><span aria-current="page">/);
    assert.match(bar, /<\/nav><div class="util"><a class="helplink" href="\/portal\/help">Help<\/a><details class="usermenu">[\s\S]*href="\/portal\/settings">Your account<\/a>/);
    assert.doesNotMatch(bar, /gsearch|dash-tabs|href="\/staff/);
  });

  test('Messages, Your account and Help name themselves in the trail', async () => {
    assert.deepEqual(trailOf(topBar((await get('/portal/messages')).body) ?? '').current, 'Messages');
    for (const path of ['/portal/settings', '/portal/help']) {
      const r = await get(path);
      assert.equal(r.status, 200, path);
      const t = trailOf(topBar(r.body) ?? '');
      assert.equal(t.steps.length, 1, path);
      assert.equal(t.current, t.steps[0], path);
    }
  });

  test('a claim page’s own trail is moved up, unchanged, so the page shows one trail', async () => {
    const home = (await get('/portal')).body;
    const href = /href="(\/portal\/claims\/[A-Za-z0-9-]+)"/.exec(home)?.[1];
    assert.ok(href !== undefined, 'the client has no claim to open');
    const r = await get(href);
    assert.equal(r.status, 200);
    const bar = topBar(r.body) ?? '';
    assert.match(bar, /^<a class="crumbroot" href="\/portal">Cap Rebate<\/a><nav class="crumbs" aria-label="Where you are"><ol><li><a href="\/portal">[^<]+<\/a><\/li><li><span aria-current="page">/);
    // The page's own trail names the company, then the site: not the menu's "Your claims".
    const company = trailOf(topBar(home) ?? '').current;
    assert.ok(company !== null);
    assert.equal(trailOf(bar).steps[0], words(company), 'the claim page’s own trail was not the one moved up');
    assert.equal((r.body.match(/<nav class="crumbs"/g) ?? []).length, 1, 'the page shows two trails');
    assert.doesNotMatch(mainOf(r.body), /class="crumbs"/);
  });
});

describe('Phase 160b: nothing else changes', () => {
  test('no portal page carries a style attribute, a script or a back-office link', async () => {
    for (const path of ['/portal', '/portal/messages', '/portal/settings', '/portal/help']) {
      const r = await get(path);
      assert.equal(r.status, 200, path);
      assert.doesNotMatch(r.body, /\sstyle=|<script(?![^>]*\ssrc=)/i, path);
      assert.doesNotMatch(r.body, /href="\/staff/, path);
    }
  });

  test('the client is still refused the back office', async () => {
    const r = await get('/staff');
    assert.notEqual(r.status, 200);
  });

  test('the public pages keep their look: no shared class and no top bar', async () => {
    for (const path of ['/', '/login']) {
      const html = await (await fetch(base + path)).text();
      if (path === '/login') assert.match(html, /<body class="public">/, path);
      assert.doesNotMatch(html, /<body class="app/, path);
      assert.doesNotMatch(html, /class="crumbbar"|class="crumbroot"/, path);
    }
  });
});
