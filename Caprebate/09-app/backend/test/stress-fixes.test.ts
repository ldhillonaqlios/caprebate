/**
 * 29 SEPTEMBER 2026 — WHAT THE STRESS TEST OF THE TEST WEBSITE FOUND, AND THE FIXES.
 *
 * Lakhbir: "stress test the vercel ensure no links are broken and every works as it should". A crawl of the live site
 * and of every login's screens found: every enquiry answering 500 on Vercel; the Privacy and Public notices links (on
 * every page) answering 401; any mistyped address answering 401 "those details did not match" as JSON; HEAD answering
 * 401; the browser's /favicon.ico answering 401 on every page; one link to a finance section that does not exist.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingMessage } from 'node:http';
import { createApp } from '../src/server.ts';
import { clientIp } from '../src/web/router.ts';
import { HOME_PATH } from '../src/web/home-site.ts';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-stress-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
});
after(() => made.close());
const go = (path: string, init: RequestInit = {}) => fetch(base + path, { redirect: 'manual', ...init });

describe('addresses nobody owns, and HEAD', () => {
  test('a mistyped address is a page that says so (404), not a 401 in JSON', async () => {
    for (const path of ['/no-such-page', '/capital-allowances/care-homes/', '/sitemap.xml', '/assets/nope.css']) {
      const r = await go(path);
      assert.equal(r.status, 404, path);
      assert.match(r.headers.get('content-type') ?? '', /^text\/html/, path);
      const body = await r.text();
      assert.match(body, /<h1>We cannot find that page<\/h1>/, path);
      assert.match(body, /<a class="cta" href="\/">Go to the home page<\/a>/, path);
    }
  });

  test('the JSON API keeps its own answers: an unknown /api address is still JSON', async () => {
    const r = await go('/api/no-such-thing');
    assert.match(r.headers.get('content-type') ?? '', /application\/json/);
    assert.doesNotMatch(await r.text(), /<h1>/, 'the API answered with a page');
  });

  test('HEAD is answered for the home page, its files, sign-in and the notices; elsewhere it changes nothing', async () => {
    for (const path of ['/', '/assets/home.css', '/assets/home.js', '/login', '/favicon.svg', '/privacy/']) {
      assert.equal((await go(path, { method: 'HEAD' })).status, 200, `HEAD ${path}`);
    }
    const before = made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM assessment_drafts')?.n ?? 0;
    const r = await go('/assessment', { method: 'HEAD' });
    assert.notEqual(r.status, 303, 'a HEAD started an assessment');
    assert.equal(made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM assessment_drafts')?.n ?? 0, before, 'a HEAD made a draft');
  });
});

describe('the pages every footer links to', () => {
  test('/privacy/ and /notices/ say the notices are being prepared and how to reach us, until they are published', async () => {
    for (const path of ['/privacy/', '/privacy', '/notices/', '/notices']) {
      const r = await go(path);
      assert.equal(r.status, 200, path);
      const body = await r.text();
      assert.match(body, /<h1>Privacy and public notices<\/h1>/, path);
      assert.match(body, /are being prepared\. They will be published on this page before the website opens to clients\./, path);
      assert.match(body, /<a href="mailto:contact@caprebate\.co\.uk">contact@caprebate\.co\.uk<\/a>/, path);
    }
  });

  test('the enquiry’s address, opened as a page, goes back to the contact form', async () => {
    const r = await go('/enquiry');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/#contact');
  });
});

describe('the browser tab’s icon', () => {
  test('/favicon.svg is the house mark; /favicon.ico answers "nothing here"; every page names the icon', async () => {
    const svg = await go('/favicon.svg');
    assert.equal(svg.status, 200);
    assert.equal(svg.headers.get('content-type'), 'image/svg+xml');
    assert.match(await svg.text(), /<path d="M14 43 H34 A4 4 0 0 0 38 39 V20\.5 L24 8 L10 20\.5 V39/);
    assert.equal((await go('/favicon.ico')).status, 204);
    for (const path of ['/', '/login', '/privacy/']) {
      assert.match(await (await go(path)).text(), /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/, path);
    }
  });
});

describe('the enquiry on Vercel', () => {
  test('the visitor’s address is read without throwing, whatever the request carries', () => {
    const no = { headers: {}, socket: undefined } as unknown as IncomingMessage;
    assert.equal(clientIp(no), 'unknown');
    const odd = { headers: {}, get socket(): never { throw new Error('no socket here'); } } as unknown as IncomingMessage;
    assert.equal(clientIp(odd), 'unknown');
    const fine = { headers: {}, socket: { remoteAddress: '203.0.113.5' } } as unknown as IncomingMessage;
    assert.equal(clientIp(fine), '203.0.113.5');
  });
});

describe('the rest', () => {
  test('the claim page’s "Raise it on the finance page" goes to a section the finance page has', () => {
    const billing = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'billing.ts'), 'utf8');
    const finance = readFileSync(join(import.meta.dirname, '..', 'src', 'web', 'finance-pages.ts'), 'utf8');
    const target = /href="\/staff\/finance#([a-z-]+)">Raise it on the finance page/.exec(billing)?.[1];
    assert.equal(target, 'to-invoice');
    assert.match(finance, new RegExp(`id="${target}"`));
  });

  test('the home page has a skip link to its main content', async () => {
    const body = await (await go('/')).text();
    assert.match(body, /<a class="skip" href="#main">Skip to content<\/a>/);
    assert.match(body, /<main id="main">/);
    assert.match(readFileSync(HOME_PATH, 'utf8'), /<main id="main">/);
  });

  test('the home page’s style and script may be kept for five minutes', async () => {
    for (const path of ['/assets/home.css', '/assets/home.js']) {
      assert.equal((await go(path)).headers.get('cache-control'), 'public, max-age=300', path);
    }
  });
});
