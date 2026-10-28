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
  /* PHASE 160k, 21 OCTOBER 2026: the home page is the "Kurbelwerk" design (Lakhbir: "push it live"), written from its
     design file by tools/site-from-design.mjs. The promises are the same as before; the markup they look for is new.
     PHASE 160n, 28 OCTOBER 2026: the home page is now the X-ray (redesign-options/02-x-ray.html), written by the same
     tool. The same promises again; where they name the design's own markup (the heading, the drawing, the scan, the
     fonts), they name the X-ray's. Its own tests are in test/phase160n.test.ts. */
  test('/ is the new page, under its own policy: this site, its fonts, plus Cloudflare’s security check, and nothing else', async () => {
    const r = await get('/');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-security-policy'), HOME_PAGE_CSP);
    assert.match(HOME_PAGE_CSP, /font-src 'self'; script-src 'self' https:\/\/challenges\.cloudflare\.com; frame-src https:\/\/challenges\.cloudflare\.com;/);
    assert.doesNotMatch(HOME_PAGE_CSP, /unsafe-inline|unsafe-eval|\*/);
    const body = await r.text();
    assert.match(body, /<h1 id="h1"><span class="sr">Capital allowances for healthcare property: <\/span>There is tax relief built into <em>your building\.<\/em><\/h1>/);
    assert.doesNotMatch(body, /cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/, 'something is still fetched from another site');
  });

  test('every link that starts the assessment says "Am I eligible" and goes to the back end', async () => {
    const body = await (await get('/')).text();
    const links = [...body.matchAll(/<a\b[^>]*\shref="([^"]*)"[^>]*>((?:(?!<\/a>)[\s\S])*?)<\/a>/g)].filter((m) => /Am I eligible/.test(m[2] ?? ''));
    assert.ok(links.length >= 4, `only ${links.length} "Am I eligible" links`);
    for (const m of links) assert.equal(m[1], '/assessment');
    assert.doesNotMatch(visible(body), /Start the free assessment/);
  });

  test('its style and scripts are files from this site; the page itself carries nothing inline', async () => {
    const css = await get('/assets/home.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
    const sheet = await css.text();
    assert.match(sheet, /@font-face\{font-family:"Inter Tight";[^}]*src:url\(\/assets\/fonts\/inter-tight-latin-wght-normal\.woff2\)/);
    assert.match(sheet, /\.skin-in\{position:absolute;inset:0\}/, 'the X-ray’s see-through walls are missing');
    const head = await get('/assets/home-head.js');
    assert.equal(head.status, 200);
    assert.match(await head.text(), /document\.documentElement\.classList\.add\('motion'\)/);
    const js = await get('/assets/home.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /^text\/javascript/);
    const src = await js.text();
    assert.match(src, /function render\(p\)/, 'the scan is missing');
    assert.match(src, /var BANDS=\{/, 'the calculator is missing');
    const body = await (await get('/')).text();
    assert.doesNotMatch(body, /\sstyle\s*=/i, 'a style attribute');
    assert.doesNotMatch(body, /\son[a-z]+\s*=/i, 'an inline event handler');
    assert.doesNotMatch(body, /<style\b/i, 'an inline <style>');
    // the head script is in the head, the page's script after everything it reads
    assert.ok(body.indexOf('<script src="/assets/home-head.js">') < body.indexOf('</head>'));
    assert.ok(body.indexOf('<script src="/assets/home.js">') > body.lastIndexOf('</footer>'));
  });

  test('the fonts are this site’s own, and only the named ones are served', async () => {
    const font = await get('/assets/fonts/ibm-plex-mono-latin-400-normal.woff2');
    assert.equal(font.status, 200);
    assert.equal(font.headers.get('content-type'), 'font/woff2');
    assert.ok((await font.arrayBuffer()).byteLength > 5000);
    assert.equal((await get('/assets/fonts/../../package.json')).status, 404);
    assert.equal((await get('/assets/fonts/OFL-LICENSE.txt')).status, 404);
  });

  test('a phone can sign in: Log in is in the menu, which a phone opens from the Menu button', async () => {
    const body = await (await get('/')).text();
    const header = /<header class="top" id="top">([\s\S]*?)<\/header>/.exec(body)?.[1] ?? '';
    assert.match(header, /<li class="nav-login"><a href="\/login">Log in<\/a><\/li>/, 'no Log in in the menu');
    assert.match(header, /<button class="mbtn" id="menu-btn" type="button" aria-expanded="false" aria-controls="nav">/);
  });

  test('the edition is refused if the file gains anything inline; head and body scripts are kept apart', () => {
    const ok = '<html><head><script>0</script><style>a{}</style></head><body><p>x</p><script>1</script><p>y</p><script>2</script></body></html>';
    assert.doesNotThrow(() => buildHomeEdition(ok));
    const e = buildHomeEdition(ok);
    assert.equal(e.headJs, '0');
    assert.equal(e.js, '1\n;\n2');
    assert.ok(e.html.indexOf('<script src="/assets/home.js">') > e.html.indexOf('<p>y</p>'), 'the body script is not after the page');
    assert.throws(() => buildHomeEdition(ok.replace('<p>x</p>', '<p style="color:red">x</p>')), /style attribute/);
    assert.throws(() => buildHomeEdition(ok.replace('<p>x</p>', '<a onclick="go()">x</a>')), /event handler/);
    assert.throws(() => buildHomeEdition(ok.replace('<p>x</p>', '<style>p{}</style>')), /inline <style>/);
    assert.doesNotThrow(() => buildHomeEdition(ok.replace('<p>x</p>', '<script type="application/ld+json">{}</script>')));
  });

  test('the contact form is the live form: the same fields, posted to /enquiry, and an enquiry from it is kept', async () => {
    const body = await (await get('/')).text();
    const form = /<form class="form" id="contactform" action="\/enquiry" method="post" novalidate[\s\S]*?<\/form>/.exec(body)?.[0] ?? '';
    const names = [...form.matchAll(/\sname="([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names, ['name', 'firm', 'email', 'phone', 'ptype', 'message']);
    assert.match(form, /<div id="c-turnstile" class="c-turnstile"><\/div>/);
    assert.match(form, /<input id="c-website" type="text" tabindex="-1" autocomplete="off">/, 'the honeypot is missing');
    assert.match(await (await get('/assets/home.js')).text(), /var SITEKEY='[^']+';/);
    const r = await fetch(`${base}/enquiry`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'Home Page Person', firm: '', email: 'home.page@example.invalid', phone: '', ptype: 'Care home', message: '' }).toString() });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Thank you: that is with us\./);
  });

  test('what a person reads keeps the house voice: no "rebate" as a refund, no exclamation mark, the name is "Cap Rebate"', async () => {
    const text = visible(await (await get('/')).text());
    assert.deepEqual(avoidHits(text).map((x) => x.word), []);
    assert.equal(text.includes('!'), false);
    assert.equal(/Caprebate/.test(text), false);
    assert.equal(text.includes('—'), false, 'a long dash');
  });

  test('the file in the repository is the page served', () => {
    assert.match(readFileSync(HOME_PATH, 'utf8'), /There is tax relief built into <em>your building\.<\/em>/);
  });
});

describe('the assessment in the home page’s colours', () => {
  test('the public pages wear the home page’s ground, type, mint and mark; the nav says "Am I eligible?"', async () => {
    const r = await get('/assessment');
    assert.equal(r.status, 303);
    const cookie = (r.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';
    // PHASE 153f: the first screen is the four-stage funnel's stage 1 (the old Q1 is retired, and sends a person there).
    assert.equal((await fetch(`${base}/assessment/Q1`, { headers: { cookie }, redirect: 'manual' })).headers.get('location'), '/assessment/buildings');
    const q1 = await (await fetch(`${base}/assessment/buildings`, { headers: { cookie } })).text();
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
