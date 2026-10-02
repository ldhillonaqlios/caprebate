/**
 * 29 SEPTEMBER 2026 — THE NEW HOME PAGE ON THE TEST WEBSITE, AND THE ASSESSMENT IN ITS COLOURS.
 *
 * Lakhbir: "this look good, push it to vercel", and "make sure when someone clicks am i eligble it matches the colours
 * of the new home page". The page is Caprebate/09-app/site/home.html, served at `/` by src/web/home-site.ts.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { buildHomeEdition, HOME_PATH, HOME_PAGE_CSP } from '../src/web/home-site.ts';
import { SITE_CSS } from '../src/web/assets.ts';
import { avoidHits } from '../src/web/voice.ts';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-home-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
});
after(() => made.close());

const get = (path: string) => fetch(base + path, { redirect: 'manual' });
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

describe('the home page', () => {
  test('/ is the new page, under its own policy: this site, plus Cloudflare’s security check, and nothing else', async () => {
    const r = await get('/');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-security-policy'), HOME_PAGE_CSP);
    assert.match(HOME_PAGE_CSP, /script-src 'self' https:\/\/challenges\.cloudflare\.com; frame-src https:\/\/challenges\.cloudflare\.com;/);
    assert.doesNotMatch(HOME_PAGE_CSP, /unsafe-inline|unsafe-eval|\*/);
    const body = await r.text();
    assert.match(body, /<h1 id="hero-title"><span class="kick">Capital allowances for healthcare property<\/span>There is tax relief built into your building\.<\/h1>/);
    assert.doesNotMatch(body, /cdnjs\.cloudflare\.com/, 'GSAP is still fetched from a CDN');
    assert.match(body, /<script src="\/assets\/gsap\.min\.js" defer><\/script>/);
  });

  test('every button that starts the assessment says "Am I eligible?" and goes to the back end', async () => {
    const body = await (await get('/')).text();
    const ctas = [...body.matchAll(/<a class="cta[^"]*" href="([^"]*)">([^<]*)<\/a>/g)];
    assert.ok(ctas.length >= 4);
    for (const m of ctas) assert.deepEqual([m[1], m[2]], ['/assessment', 'Am I eligible?']);
    assert.doesNotMatch(visible(body), /Start the free assessment/);
  });

  test('its style and script are files from this site; the page itself carries nothing inline', async () => {
    const css = await get('/assets/home.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
    assert.match(await css.text(), /\.funnel\{/);
    const js = await get('/assets/home.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /^text\/javascript/);
    const src = await js.text();
    assert.match(src, /function capBuilding\(gsap, root, opts\)/);
    assert.match(src, /function setVars\(root\)/);
    const body = await (await get('/')).text();
    assert.doesNotMatch(body, /\sstyle\s*=/i, 'a style attribute');
    assert.doesNotMatch(body, /\son[a-z]+\s*=/i, 'an inline event handler');
    assert.doesNotMatch(body, /<style\b/i, 'an inline <style>');
  });

  test('a phone can sign in: Log in stays in the top bar when the menu is hidden (2 Oct 2026, Lakhbir on an iPhone)', async () => {
    const body = await (await get('/')).text();
    const header = /<header class="bar" id="bar">([\s\S]*?)<\/header>/.exec(body)?.[1] ?? '';
    assert.match(header, /<\/nav>\s*<a class="bar-login-m" href="\/login">Log in<\/a>\s*<a class="cta bar-cta" href="\/assessment">/, 'no Log in beside "Am I eligible?"');
    const css = await (await get('/assets/home.css')).text();
    assert.match(css, /\.bar-login-m\{display:none;/, 'the phone link shows on a wide screen too');
    assert.ok(css.includes('@media (max-width:980px){.bar-nav{display:none}.bar-login-m{display:inline-flex}'), 'the menu hides with no Log in in its place');
  });

  test('the edition is refused if the file gains anything inline', () => {
    const ok = '<html><head><style>a{}</style></head><body><p>x</p><script>1</script></body></html>';
    assert.doesNotThrow(() => buildHomeEdition(ok));
    assert.throws(() => buildHomeEdition(ok.replace('<p>x</p>', '<p style="color:red">x</p>')), /style attribute/);
    assert.throws(() => buildHomeEdition(ok.replace('<p>x</p>', '<a onclick="go()">x</a>')), /event handler/);
    assert.throws(() => buildHomeEdition(ok.replace('<p>x</p>', '<style>p{}</style>')), /inline <style>/);
    assert.doesNotThrow(() => buildHomeEdition(ok.replace('<p>x</p>', '<script type="application/ld+json">{}</script>')));
  });

  test('the contact form is the live form: the same fields, posted to /enquiry, and an enquiry from it is kept', async () => {
    const body = await (await get('/')).text();
    const form = /<form class="c-form" id="contactform" action="\/enquiry" method="post" novalidate[\s\S]*?<\/form>/.exec(body)?.[0] ?? '';
    const names = [...form.matchAll(/\sname="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['name', 'firm', 'email', 'phone', 'ptype', 'message']);
    const r = await fetch(`${base}/enquiry`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'Home Page Person', firm: '', email: 'home.page@example.invalid', phone: '', ptype: 'Care home', message: '' }).toString() });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Thank you — that is with us\./);
  });

  test('what a person reads keeps the house voice: no "rebate" as a refund, no exclamation mark, the name is "Cap Rebate"', async () => {
    const text = visible(await (await get('/')).text());
    assert.deepEqual(avoidHits(text).map((x) => x.word), []);
    assert.equal(text.includes('!'), false);
    assert.equal(/Caprebate/.test(text), false);
  });

  test('the file in the repository is the page served', () => {
    assert.match(readFileSync(HOME_PATH, 'utf8'), /There is tax relief built into your building\./);
  });
});

describe('the assessment in the home page’s colours', () => {
  test('the public pages wear the home page’s ground, type, mint and mark; the nav says "Am I eligible?"', async () => {
    const r = await get('/assessment');
    assert.equal(r.status, 303);
    const cookie = (r.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';
    const q1 = await (await fetch(`${base}/assessment/Q1`, { headers: { cookie } })).text();
    assert.match(q1, /<body class="public">/);
    assert.match(q1, /<a class="brandmark" href="\/" aria-label="Cap Rebate, home"><svg class="mark"/);
    assert.match(q1, /<a class="navcta" href="\/assessment">Am I eligible\?<\/a>/);
    assert.match(SITE_CSS, /body\.public\{--white:#121614;--mist:#1b201e;--ink:#EDEAE2;[^}]*--accent:#ABEDD8;--on-accent:#111111/);
    assert.match(SITE_CSS, /body\.public \.opt:hover,body\.public \.opt:focus-within\{border-color:#ABEDD8;box-shadow:[^}]*rgba\(171,237,216,\.3\)\}/);
  });

  test('the back office is untouched: every rule of the theme starts body.public', () => {
    const start = SITE_CSS.indexOf('THE PUBLIC PAGES IN THE HOME PAGE');
    assert.ok(start > 0);
    const block = SITE_CSS.slice(SITE_CSS.indexOf('*/', start) + 2);
    for (const rule of block.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)) {
      const sel = (rule[1] ?? '').trim();
      if (sel === '' || /^(from|to|\d+%)/.test(sel)) continue;
      for (const one of sel.split(',')) assert.match(one.trim(), /^body\.public\b/, `a theme rule reaches past the public pages: ${one}`);
    }
  });
});
