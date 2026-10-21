/**
 * PHASE 160k, 21 OCTOBER 2026 — THE NEW PUBLIC WEBSITE: THE KURBELWERK HOME PAGE AND FIVE SECTOR LANDING PAGES.
 *
 * Lakhbir: "push it live" (the test site). The home page (site/home.html) and five sector pages
 * (site/capital-allowances/<sector>.html) are written from their design files by tools/site-from-design.mjs and served
 * by src/web/home-site.ts: /capital-allowances/<sector>/, each under the home page's policy, nothing inline, its style
 * and scripts as /assets/ca-<sector>.css, -head.js and .js, and the fonts from /assets/fonts/.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { HOME_PAGE_CSP, SECTOR_SLUGS, sectorPath, FONT_FILES, buildEdition } from '../src/web/home-site.ts';
import { avoidHits } from '../src/web/voice.ts';
// @ts-expect-error the tool is plain JavaScript (an .mjs file with no type declarations)
import { convert } from '../tools/site-from-design.mjs';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160k-')), testNotices: true, publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
});
after(() => made.close());

const get = (path: string, init: RequestInit = {}) => fetch(base + path, { redirect: 'manual', ...init });
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

const TERMS: Record<(typeof SECTOR_SLUGS)[number], string> = {
  'care-homes': 'Capital allowances for care homes',
  'dental-practices': 'Capital allowances for dental practices',
  'gp-surgeries': 'Capital allowances for GP surgeries',
  'supported-living': 'Capital allowances for supported living',
  'private-hospitals-and-clinics': 'Capital allowances for private hospitals',
};

describe('the five sector landing pages', () => {
  for (const slug of SECTOR_SLUGS) {
    test(`/capital-allowances/${slug}/ is its page: the policy, the search basics, nothing inline`, async () => {
      const r = await get(`/capital-allowances/${slug}/`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-security-policy'), HOME_PAGE_CSP);
      const body = await r.text();
      assert.match(body, new RegExp(`<title>${TERMS[slug]}[^<]* \\| Cap Rebate</title>`, 'i'), 'the title does not lead with the search term');
      const h1 = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
      assert.equal(h1.length, 1, 'one heading of the first rank');
      assert.ok((h1[0]?.[1] ?? '').startsWith(TERMS[slug]), 'the heading does not lead with the search term');
      assert.match(body, new RegExp(`<link rel="canonical" href="https://caprebate\\.co\\.uk/capital-allowances/${slug}/">`));
      assert.match(body, /<meta name="description" content="[^"]{60,160}">/);
      assert.match(body, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
      assert.doesNotMatch(body, /\sstyle\s*=/i, 'a style attribute');
      assert.doesNotMatch(body, /\son[a-z]+\s*=/i, 'an inline event handler');
      assert.doesNotMatch(body, /<style\b/i, 'an inline <style>');
      const scripts = [...body.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
      assert.deepEqual([...scripts].sort(), ['<script type="application/ld+json">', `<script src="/assets/ca-${slug}-head.js">`, `<script src="/assets/ca-${slug}.js">`].sort());
      assert.equal(scripts[scripts.length - 1], `<script src="/assets/ca-${slug}.js">`, 'the page script is not last');
      assert.doesNotMatch(body, /fonts\.googleapis|fonts\.gstatic|cdnjs|template-options|index\.html/);
    });

    test(`/capital-allowances/${slug}/: its structured data parses, and its FAQ is the one a person reads`, async () => {
      const body = await (await get(`/capital-allowances/${slug}/`)).text();
      const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(body)?.[1] ?? '{}') as { '@graph': { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[] };
      const types = ld['@graph'].map((n) => n['@type']);
      for (const t of ['Service', 'BreadcrumbList', 'FAQPage']) assert.ok(types.includes(t), `no ${t}`);
      const faq = ld['@graph'].find((n) => n['@type'] === 'FAQPage')?.mainEntity ?? [];
      assert.ok(faq.length >= 8, `${faq.length} questions`);
      const text = visible(body);
      for (const q of faq) {
        assert.ok(text.includes(q.name), `the question is not on the page: ${q.name}`);
        assert.ok(text.includes(q.acceptedAnswer.text), `the answer is not on the page: ${q.name}`);
      }
    });

    test(`/capital-allowances/${slug}/: written to rank, and in the house voice`, async () => {
      const body = await (await get(`/capital-allowances/${slug}/`)).text();
      const text = visible(body);
      assert.ok(text.split(' ').length > 3000, `only ${text.split(' ').length} words`);
      assert.match(body, /<section class="sec" id="brief"/, 'no "In brief" answer');
      assert.match(body, /<section class="sec" id="guide"/, 'no guide');
      assert.deepEqual(avoidHits(text).map((x) => x.word), []);
      assert.equal(text.includes('!'), false);
      assert.equal(text.includes('—'), false, 'a long dash');
      assert.equal(/Caprebate/.test(text), false);
    });

    test(`/capital-allowances/${slug}/: its links stay on this site; "Am I eligible" is the assessment; Log in is in the menu`, async () => {
      const body = await (await get(`/capital-allowances/${slug}/`)).text();
      const eligible = [...body.matchAll(/<a\b[^>]*\shref="([^"]*)"[^>]*>((?:(?!<\/a>)[\s\S])*?)<\/a>/g)].filter((m) => /Am I eligible/.test(m[2] ?? ''));
      assert.ok(eligible.length >= 2);
      for (const m of eligible) assert.equal(m[1], '/assessment');
      const header = /<header class="top" id="top">([\s\S]*?)<\/header>/.exec(body)?.[1] ?? '';
      assert.match(header, /<li class="nav-login"><a href="\/login">Log in<\/a><\/li>/);
      for (const other of SECTOR_SLUGS) assert.match(header, new RegExp(`href="/capital-allowances/${other}/"`), `the menu has no link to ${other}`);
      assert.match(header, new RegExp(`href="/capital-allowances/${slug}/" aria-current="page"`), 'the menu does not mark this page');
      for (const m of body.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
        const href = m[1] ?? '';
        assert.ok(href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:'), `a link off this site: ${href}`);
      }
      const legal = /<nav aria-label="Legal">([\s\S]*?)<\/nav>/.exec(body)?.[1] ?? '';
      for (const p of ['/notices/', '/terms/', '/cookies/', '/cookies/#choice', '/accessibility/', '/disclaimer/']) assert.match(legal, new RegExp(`href="${p}"`), p);
    });

    test(`/assets/ca-${slug}.css, -head.js and .js are files from this site`, async () => {
      const css = await get(`/assets/ca-${slug}.css`);
      assert.equal(css.status, 200);
      assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
      assert.match(await css.text(), /@font-face\{font-family:"IBM Plex Mono"/);
      const head = await get(`/assets/ca-${slug}-head.js`);
      assert.equal(head.status, 200);
      assert.match(await head.text(), /classList\.add\('js'\)/);
      const js = await get(`/assets/ca-${slug}.js`);
      assert.equal(js.status, 200);
      const src = await js.text();
      assert.match(src, /data-preset/, 'the calculator does not open on its sector');
      assert.equal((await get(`/assets/ca-${slug}.js`, { method: 'HEAD' })).status, 200);
    });

    test(`the file in the repository is the page served, and it was written by the tool`, () => {
      assert.match(readFileSync(sectorPath(slug), 'utf8'), /^<!doctype html>\n<!-- Cap Rebate sector page: [a-z-]+\. Written by tools\/site-from-design\.mjs/);
    });
  }

  test('an address without its slash is sent to the page; the folder goes to the sectors on the home page; a sector we do not have is a 404', async () => {
    const r = await get('/capital-allowances/care-homes?from=menu');
    assert.equal(r.status, 303);
    assert.equal(r.headers.get('location'), '/capital-allowances/care-homes/?from=menu');
    assert.equal((await get('/capital-allowances/')).headers.get('location'), '/#sectors');
    assert.equal((await get('/capital-allowances/castles/')).status, 404);
    assert.equal((await get('/capital-allowances/care-homes/', { method: 'HEAD' })).status, 200);
  });

  test('the cookie banner is on a sector page once, as on every public page', async () => {
    const body = await (await get('/capital-allowances/gp-surgeries/')).text();
    assert.equal(body.match(/<section class="cookie-banner"/g)?.length ?? 0, 1);
  });

  test('every self-hosted font is served; a name not on the list is not', async () => {
    for (const name of FONT_FILES) {
      const r = await get(`/assets/fonts/${name}`);
      assert.equal(r.status, 200, name);
      assert.equal(r.headers.get('content-type'), 'font/woff2', name);
    }
    for (const bad of ['nope.woff2', '..%2F..%2Fpackage.json', 'OFL-LICENSE.txt']) assert.equal((await get(`/assets/fonts/${bad}`)).status, 404, bad);
  });

  test('the home page lists the five sectors, and each row links to its page', async () => {
    const body = await (await get('/')).text();
    for (const slug of SECTOR_SLUGS) assert.match(body, new RegExp(`<td class="nm"><a href="/capital-allowances/${slug}/">`), slug);
  });
});

describe('the converter (tools/site-from-design.mjs)', () => {
  const page = (body: string) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono" rel="stylesheet">
<script>document.documentElement.classList.add('js')</script>
<style>a{}</style>
<style>b{}</style>
</head>
<body>
<header class="top" id="top"><a class="brand" href="#main">x</a>
 <nav class="nav" id="nav" aria-label="Main">
  <ul>
   <li><a href="#calculator">Calculator</a></li>
  </ul>
 </nav>
</header>
${body}
<footer><nav aria-labelledby="ft-leg"><h2>Legal</h2><ul><li><a href="#">Privacy</a></li></ul></nav></footer>
<script>1</script>
</body>
</html>`;

  test('a style attribute becomes a class whose rule still wins; the fonts, the links and the legal footer are the site’s', () => {
    const out = convert(page('<p class="a" style="--d:.3s">x</p><g style="--fx:#C9452F"></g><a class="b" href="../../06-kurbelwerk-animated.html#contact">Am I eligible?</a><a href="../dental-practices/index.html#guide">Dental</a>'), 'care-homes') as string;
    assert.doesNotMatch(out.replace(/<style>[\s\S]*?<\/style>/, ''), /\sstyle=/);
    assert.match(out, /<p class="a z[0-9a-f]{7}">x<\/p>/);
    assert.match(out, /\.z[0-9a-f]{7}\{--d:\.3s!important\}/);
    assert.match(out, /<g class="z[0-9a-f]{7}"><\/g>/);
    assert.match(out, /<a class="b" href="\/assessment">Am I eligible\?<\/a>/);
    assert.match(out, /<a href="\/capital-allowances\/dental-practices\/#guide">Dental<\/a>/);
    assert.match(out, /<li class="nav-login"><a href="\/login">Log in<\/a><\/li>/);
    assert.match(out, /<nav aria-label="Legal">[\s\S]*href="\/disclaimer\/"/);
    assert.doesNotMatch(out, /fonts\.googleapis/);
    assert.equal(out.match(/<style>/g)?.length, 1, 'the page’s style blocks were not joined');
    assert.match(out, /<a class="brand" href="\/">/);
    // and the server's edition builds from it
    assert.doesNotThrow(() => buildEdition(out, 'ca-care-homes'));
  });
});
