/**
 * PHASE 160n, 28 OCTOBER 2026 — THE X-RAY HOME PAGE.
 *
 * Lakhbir: "i want you claude to make the website front end as the new design". The design is the X-ray, option 02
 * of the redesign options (chosen 26 Oct 2026, redrawn as a private clinic on 28 Oct): the outer walls of a clinic
 * slide away on a twelve-second scan, six systems that can qualify light up one by one, and it ends on the figure.
 * The design file is Website Content/landing-page/redesign-options/02-x-ray.html (outside this repository); the
 * tool writes site/home.html from it (`convertXray` in tools/site-from-design.mjs). These tests read what the server
 * sends; test/home-page.test.ts keeps the home page's older promises (the policy, nothing inline, the live form, Log in,
 * "Am I eligible?").
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { HOME_PATH, SITE_DIR, FONT_FILES } from '../src/web/home-site.ts';
// @ts-expect-error the tool is plain JavaScript
import { convertXray } from '../tools/site-from-design.mjs';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160n-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
});
after(() => made.close());

const text = async (path: string) => {
  const r = await fetch(base + path);
  assert.equal(r.status, 200, path);
  return r.text();
};
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');

describe('Phase 160n: the X-ray home page', () => {
  test('/ is the X-ray: a clinic, six systems that can qualify, and the figure it ends on', async () => {
    const html = await text('/');
    assert.match(html, /<section class="xr" id="xray" aria-labelledby="h1">/);
    const label = /<div class="art" id="art" role="img" aria-label="([^"]+)"/.exec(html)?.[1] ?? '';
    assert.match(label, /private clinic/, 'the drawing is not described as a clinic');
    assert.doesNotMatch(label, /care home|nurse/i);
    assert.equal([...html.matchAll(/<svg class="layer sys sys-[a-z]+" data-i="\d"/g)].length, 6, 'not six systems');
    assert.equal([...html.matchAll(/<li class="tag[^"]*" data-i="\d"/g)].length, 6, 'not six labels');
    assert.match(html, /of the 6 shown here/);
    for (const name of ['Wiring', 'Heating and hot water', 'Air and medical gases', 'Lifts', 'Fire alarms and patient call', 'Lighting']) {
      assert.ok(html.includes(`<h2><i></i>${name}<span class="q">Qualifies</span></h2>`), name);
    }
    // the figure is in the page itself, for a visitor with no script and for search engines
    assert.match(html, /<p class="t-lead"><span>On a £1\.5m private clinic purchase:<\/span> <span>capital allowances of up to<\/span><\/p>\s*<p class="t-fig" id="tFig">£675,000<\/p>/);
  });

  test('the scan runs for twelve seconds once the stage is in view, with Skip and Play it again', async () => {
    const html = await text('/');
    assert.match(html, /<button type="button" class="hb" id="xrSkip">Skip to the end<\/button>/);
    assert.match(html, /<button type="button" class="hb" id="xrReplay" hidden>[\s\S]*?Play it again<\/button>/);
    const js = await text('/assets/home.js');
    assert.match(js, /var DUR=12000/, 'not a twelve-second scan');
    assert.match(js, /new IntersectionObserver\(function\(es\)\{es\.forEach\(function\(e\)\{if\(e\.isIntersecting\)\{io\.disconnect\(\);play\(\)\}\}\)\},\{threshold:\.4\}\)/, 'it does not wait for the stage to be in view');
    assert.match(js, /replayB\.addEventListener\('click',play\);skipB\.addEventListener\('click',skip\);/);
    // someone who asked their device for less motion sees the finished picture: the motion class is never added
    assert.match(await text('/assets/home-head.js'), /prefers-reduced-motion: reduce\)'\)\.matches;if\(!m\)document\.documentElement\.classList\.add\('motion'\)/);
  });

  test('its two fonts are served from this site, with their licences in the repository', async () => {
    const css = await text('/assets/home.css');
    assert.match(css, /@font-face\{font-family:"Inter Tight";font-style:normal;font-weight:400 700;font-display:swap;src:url\(\/assets\/fonts\/inter-tight-latin-wght-normal\.woff2\) format\("woff2"\)\}/);
    assert.match(css, /@font-face\{font-family:"JetBrains Mono";font-style:normal;font-weight:500;font-display:swap;src:url\(\/assets\/fonts\/jetbrains-mono-latin-500-normal\.woff2\) format\("woff2"\)\}/);
    for (const name of ['inter-tight-latin-wght-normal.woff2', 'jetbrains-mono-latin-500-normal.woff2']) {
      assert.ok((FONT_FILES as readonly string[]).includes(name), name);
      const r = await fetch(`${base}/assets/fonts/${name}`);
      assert.equal(r.status, 200, name);
      assert.equal(r.headers.get('content-type'), 'font/woff2', name);
    }
    for (const lic of ['OFL-INTER-TIGHT.txt', 'OFL-JETBRAINS-MONO.txt']) {
      assert.match(readFileSync(join(SITE_DIR, 'fonts', lic), 'utf8'), /SIL Open Font License, Version 1\.1/, lic);
    }
  });

  test('every question the search engines are told about is on the page, word for word', async () => {
    const html = await text('/');
    const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}') as
      { '@graph': { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[] };
    const faq = ld['@graph'].find((g) => g['@type'] === 'FAQPage')?.mainEntity ?? [];
    assert.equal(faq.length, 6);
    for (const q of faq) {
      assert.ok(html.includes(`<details class="q"><summary>${q.name}</summary><p>${q.acceptedAnswer.text}</p></details>`), q.name);
    }
    assert.match(html, /<link rel="canonical" href="https:\/\/caprebate\.co\.uk\/">/);
    assert.match(html, /<title>Capital Allowances for Healthcare Property \| Cap Rebate<\/title>/);
  });

  test('every link stays on this site, and nothing of the mock-up is left', async () => {
    const html = await text('/');
    const body = html.slice(html.indexOf('<body'));
    for (const m of body.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
      assert.match(m[1] ?? '', /^(\/|#[a-z]|mailto:contact@caprebate\.co\.uk$)/, `a link off the site: ${m[1]}`);
    }
    assert.doesNotMatch(html.replace(/<!--[\s\S]*?-->/g, ''), /index\.html|redesign-options|class="mock"|id="cform"/);
    assert.doesNotMatch(visible(html), /mock-up|Mock-up|Direction 2|All options/);
    assert.doesNotMatch(visible(html), /care home's|nurse call buttons by every bed/);
  });

  test('a phone gets a Menu button that opens and closes the menu', async () => {
    const html = await text('/');
    assert.match(html, /<nav class="nav" id="nav" aria-label="Main">\s*<ul>[\s\S]*?<li class="nav-login"><a href="\/login">Log in<\/a><\/li>\s*<\/ul>\s*<\/nav>/);
    const js = await text('/assets/home.js');
    assert.match(js, /function menu\(o\)\{hdr\.classList\.toggle\('open',o\);mb\.setAttribute\('aria-expanded',o\?'true':'false'\)\}/);
    assert.match(js, /e\.key==='Escape'/, 'Escape does not close the menu');
    const css = await text('/assets/home.css');
    assert.match(css, /@media \(max-width:1180px\)\{\s*\.nav\{display:none\}\s*\.mbtn\{display:inline-flex\}/);
  });

  test('on a desktop screen the X-ray and every section are one window tall', async () => {
    const css = await text('/assets/home.css');
    assert.match(css, /\.motion \.xr-pin\{position:relative;height:calc\(100vh - var\(--hh\)\);min-height:0;overflow:hidden\}/);
    assert.match(css, /@media \(min-width:1000px\)\{\.sec\{min-height:calc\(100vh - var\(--hh\)\)\}\}/);
  });

  test('the file in the repository was written by the tool from the X-ray design file', () => {
    const file = readFileSync(HOME_PATH, 'utf8');
    assert.match(file, /^<!doctype html>\n<!-- Cap Rebate home page\. Written by tools\/site-from-design\.mjs from its design file, redesign-options\/02-x-ray\.html \(Phase 160n\)/);
    assert.ok(existsSync(join(SITE_DIR, 'fonts', 'inter-tight-latin-wght-normal.woff2')));
  });
});

describe('Phase 160n: the converter for the X-ray (convertXray)', () => {
  const design = (body: string) => `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<!-- a note to the designer -->
<style>body{margin:0}</style>
</head>
<body>
${body}
<footer class="foot"><nav aria-label="Legal"><a href="#">Privacy</a></nav></footer>
<div class="mock">Redesign mock-up · Direction 2: The X-ray <a href="index.html">All options</a></div>
<script>var x=1;</script>
</body>
</html>`;
  const FORM = '<form class="form" id="cform" novalidate><input name="company"></form>';

  test('the live form, our fonts, the legal links; the review label, the Google fonts and the notes come off', () => {
    const out = convertXray(design(`<li class="tag" style="--x:20%;--c:#ffb020">x</li>${FORM}`)) as string;
    assert.match(out, /<form class="form" id="contactform" action="\/enquiry" method="post" novalidate/);
    const form = /<form class="form" id="contactform"[\s\S]*?<\/form>/.exec(out)?.[0] ?? '';
    assert.deepEqual([...form.matchAll(/\sname="([a-z]+)"/g)].map((m) => m[1]), ['name', 'firm', 'email', 'phone', 'ptype', 'message']);
    assert.match(out, /<div id="c-turnstile" class="c-turnstile"><\/div>/);
    assert.match(out, /<nav aria-label="Legal"><h2>Legal<\/h2><ul><li><a href="\/notices\/">Public notices<\/a><\/li>/);
    assert.match(out, /@font-face\{font-family:"Inter Tight"/);
    assert.match(out, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
    assert.doesNotMatch(out, /fonts\.googleapis|fonts\.gstatic|class="mock"|a note to the designer|id="cform"/);
    // the style attribute became a class whose rule still wins
    assert.match(out, /<li class="tag z[0-9a-f]{7}">x<\/li>/);
    assert.match(out, /\.z[0-9a-f]{7}\{--x:20%!important;--c:#ffb020!important\}/);
    assert.match(out, /var SITEKEY='[^']+';/, 'the form script is not added');
  });

  test('it refuses a design file without its form or its legal links', () => {
    assert.throws(() => convertXray(design('<p>no form</p>')), /the X-ray form not found/);
    assert.throws(() => convertXray(design(FORM).replace(/<nav aria-label="Legal">[\s\S]*?<\/nav>/, '')), /footer links not found/);
  });
});
