/**
 * PHASE 160h — THE WEBSITE'S OTHER LEGAL PAGES AND THE COOKIE BANNER, 20 October 2026 (src/web/legal-pages.ts; the routes
 * and the banner in src/web/router.ts; the footers in src/web/html.ts and 09-app/site/home.html).
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { IncomingMessage } from 'node:http';
import { CONSENT_COOKIE, LEGAL_GAPS, LEGAL_PAGES, consentSetCookie, legalPageHtml, optionalAllowed, safeBack, wantsBanner } from '../src/web/legal-pages.ts';
import { HOME_PATH } from '../src/web/home-site.ts';

type Made = Awaited<ReturnType<typeof createApp>>;
type Res = { status: number; body: string; headers: Headers };
let onTest: Made; let offTest: Made;
let baseOn = ''; let baseOff = '';
let clientCookie = '';

async function listen(m: Made): Promise<string> {
  await new Promise<void>((r) => m.server.listen(0, '127.0.0.1', () => r()));
  const a = m.server.address();
  return `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
}
const get = async (base: string, path: string, cookie = ''): Promise<Res> => {
  const x = await fetch(base + path, { redirect: 'manual', headers: { cookie } });
  return { status: x.status, body: await x.text(), headers: x.headers };
};
const BANNER = /<section class="cookie-banner" aria-label="Cookies">/;

before(async () => {
  onTest = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160h-')), testNotices: true });
  offTest = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160h-off-')) });
  baseOn = await listen(onTest); baseOff = await listen(offTest);
  const s = await seed(onTest.app.db, onTest.app.hasher, onTest.app.now);
  const r = await fetch(`${baseOn}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: 'client@example.invalid', password: s.password }).toString() });
  clientCookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
});
after(() => { onTest.close(); offTest.close(); });

describe('Phase 160h: the legal pages', () => {
  test('each page is served on the test website, says it is a draft, and has no long dash, script or style attribute', async () => {
    assert.equal(LEGAL_PAGES.length, 5);
    for (const [path, title] of LEGAL_PAGES) {
      const r = await get(baseOn, path, `${CONSENT_COOKIE}=essential`);
      assert.equal(r.status, 200, path);
      assert.match(r.body, new RegExp(`<h1>${title}</h1><p class="draft-note" role="note"><strong>Draft\\.</strong> Our solicitor and our data protection officer`), path);
      assert.doesNotMatch(r.body, /—|<script|\sstyle=/i, path);
    }
    const noSlash = await get(baseOn, '/terms');
    assert.equal(noSlash.status, 303);
    assert.equal(noSlash.headers.get('location'), '/terms/');
  });

  test('away from the test website the addresses say the pages are being prepared', async () => {
    for (const [path] of LEGAL_PAGES) {
      const r = await get(baseOff, path);
      assert.equal(r.status, 200, path);
      assert.match(r.body, /<h1>This page is being prepared<\/h1>/, path);
    }
  });

  test('the company facts come from the record, and every fact we do not have is shown as a gap, never made up', () => {
    const terms = legalPageHtml('/terms/', null) ?? '';
    assert.match(terms, /CAP REBATE LTD, trading as Cap Rebate/);
    assert.match(terms, /number 17307313/);
    assert.match(terms, /1st Floor, 1-9 Castle Street, Hinckley, LE10 1DA/);
    assert.match(terms, /Our telephone number: <span class="gap">to be added<\/span>\./);
    assert.match(terms, /Our registration number with the Information Commissioner: <span class="gap">to be added<\/span>\./);
    assert.equal(LEGAL_GAPS.length, 2);
    assert.match(legalPageHtml('/accessibility/', null) ?? '', /Telephone:\s*<span class="gap">to be added<\/span>/);
  });

  test('the cookie policy names every cookie we set, with what it does and how long it lasts', () => {
    const c = legalPageHtml('/cookies/', null) ?? '';
    for (const name of ['cb_session', 'cb_step', 'cb_draft', CONSENT_COOKIE]) assert.match(c, new RegExp(`<td><code>${name}</code></td>`), name);
    // The cookies the code sets are exactly these (and the answer's own cookie).
    const src = ['auth.ts', 'web/sign-in.ts', 'web/router.ts'].map((f) => readFileSync(join(import.meta.dirname, '..', 'src', f), 'utf8')).join('\n');
    for (const name of ['cb_session', 'cb_step', 'cb_draft']) assert.match(src, new RegExp(name), `${name} is no longer set: update the cookie policy`);
    assert.match(c, /Cloudflare/);
    assert.match(c, /Zoom/);
  });
});

describe('Phase 160h: the cookie banner', () => {
  test('a visitor who has not answered sees it on the home page, sign-in, the notices and the legal pages; no script', async () => {
    for (const path of ['/', '/login', '/notices/', '/terms/']) {
      const r = await get(baseOn, path);
      assert.equal(r.status, 200, path);
      assert.match(r.body, BANNER, path);
      const banner = r.body.slice(r.body.search(BANNER));
      assert.doesNotMatch(banner.slice(0, banner.indexOf('</section>')), /<script|\sstyle=|\son[a-z]+=/i, path);
      assert.equal((r.body.match(BANNER) ?? []).length, 1, `${path}: two banners`);
    }
  });

  test('its two buttons are the same size and style, and its form comes back to the same page', async () => {
    const r = await get(baseOn, '/login?x=1');
    assert.match(r.body, /<input type="hidden" name="back" value="\/login\?x=1">\s*<button type="submit" name="choice" value="all" class="cookie-btn">Accept all<\/button>\s*<button type="submit" name="choice" value="essential" class="cookie-btn">Reject non-essential<\/button>/);
    const css = await get(baseOn, '/assets/cookie-banner.css');
    assert.equal(css.status, 200);
    assert.match(css.body, /\.cookie-btn\{/);
    assert.doesNotMatch(css.body, /\.cookie-btn\[value/, 'one button is styled apart from the other');
  });

  test('an answer is kept for twelve months in a strictly necessary cookie, and the banner does not come back', async () => {
    for (const choice of ['all', 'essential']) {
      const r = await fetch(`${baseOn}/cookies/choice`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ choice, back: '/login' }).toString() });
      assert.equal(r.status, 303);
      assert.equal(r.headers.get('location'), '/login');
      assert.equal(r.headers.get('set-cookie'), consentSetCookie(choice as 'all' | 'essential'));
      assert.match(r.headers.get('set-cookie') ?? '', /^cb_cookies=(all|essential); Max-Age=31536000; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
      assert.doesNotMatch((await get(baseOn, '/login', `${CONSENT_COOKIE}=${choice}`)).body, BANNER);
    }
  });

  test('a made-up answer saves nothing, and "back" never leads to another website', async () => {
    const r = await fetch(`${baseOn}/cookies/choice`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ choice: 'everything', back: '//evil.example/' }).toString() });
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('set-cookie'), null);
    assert.equal(r.headers.get('location'), '/');
    for (const bad of ['//evil.example', 'https://evil.example', '\\\\evil', '', 'login']) assert.equal(safeBack(bad), '/', bad);
    assert.equal(safeBack('/cookies/#choice'), '/cookies/#choice');
  });

  test('the cookie policy shows the answer and lets it be changed; a change says it is saved', async () => {
    const r = await get(baseOn, '/cookies/?saved=1', `${CONSENT_COOKIE}=all`);
    assert.match(r.body, /Thank you\. Your answer is saved\./);
    assert.match(r.body, /You have accepted all cookies\./);
    assert.match(r.body, /<form class="cookie-choice" method="post" action="\/cookies\/choice">/);
    const back = await fetch(`${baseOn}/cookies/choice`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ choice: 'essential', back: '/cookies/#choice' }).toString() });
    assert.equal(back.headers.get('location'), '/cookies/?saved=1#choice');
  });

  test('nothing optional loads without "Accept all": the gate says no to every other answer, and no page loads a tag', async () => {
    const asking = (value: string | undefined) => optionalAllowed({} as IncomingMessage, () => value);
    assert.equal(asking('all'), true);
    for (const v of [undefined, '', 'essential', 'ALL', 'all; x', 'yes']) assert.equal(asking(v), false, String(v));
    for (const cookie of ['', `${CONSENT_COOKIE}=essential`, `${CONSENT_COOKIE}=all`]) {
      for (const path of ['/', '/login', '/terms/', '/cookies/']) {
        assert.doesNotMatch((await get(baseOn, path, cookie)).body, /googletagmanager|google-analytics|gtag\(/i, `${path} with "${cookie}"`);
      }
    }
  });

  test('no banner for someone signed in, in the back office or the portal, or away from the test website', async () => {
    assert.doesNotMatch((await get(baseOn, '/portal', clientCookie)).body, BANNER);
    assert.doesNotMatch((await get(baseOff, '/login')).body, BANNER);
    assert.equal(wantsBanner('/staff/leads', false, null), false);
    assert.equal(wantsBanner('/portal', false, null), false);
    assert.equal(wantsBanner('/assets/site.css', false, null), false);
    assert.equal(wantsBanner('/login', false, null), true);
    assert.equal(wantsBanner('/login', false, 'essential'), false);
    assert.equal(wantsBanner('/login', true, null), false);
  });
});

describe('Phase 160h: the footers', () => {
  test('every page footer links the legal pages and Cookie settings', async () => {
    const body = (await get(baseOn, '/login', `${CONSENT_COOKIE}=essential`)).body;
    for (const href of ['/terms/', '/cookies/', '/cookies/#choice', '/accessibility/', '/acceptable-use/', '/disclaimer/', '/notices/', '/privacy/']) {
      assert.match(body, new RegExp(`<footer class="foot">[\\s\\S]*href="${href.replace(/[/#]/g, (c) => `\\${c}`)}"`), href);
    }
    assert.match(body, />Cookie settings<\/a>/);
  });

  test('the home page footer links them too', () => {
    const home = readFileSync(HOME_PATH, 'utf8');
    const nav = /<nav aria-label="Legal">([\s\S]*?)<\/nav>/.exec(home)?.[1] ?? '';
    for (const href of ['/terms/', '/cookies/', '/cookies/#choice', '/accessibility/', '/disclaimer/']) assert.ok(nav.includes(`href="${href}"`), href);
  });
});
