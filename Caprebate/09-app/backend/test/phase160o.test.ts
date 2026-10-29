/**
 * PHASE 160o, 28 OCTOBER 2026 — THE WEBSITE IN ONE DESIGN.
 *
 * Lakhbir, with three screenshots of the live X-ray home page: "remove the 1-6 this isnt needed", "make the text above
 * it bigger", "remove the survayor icon thing", "we need both am i eligible and also try calculator", "change the log in
 * words to a icon of a person so people know thats log in", "ensure all sectors follow the same wordpress elementor
 * design". The home page's design file (redesign-options/02-x-ray.html) took the first five; the five sector pages are
 * rebuilt in the same design by redesign-options/tools/build_sectors.py, which carries every word of the old pages,
 * and tools/site-from-design.mjs writes all six. These tests read what the server sends.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { SECTOR_SLUGS, sectorPath } from '../src/web/home-site.ts';
// @ts-expect-error the tool is plain JavaScript
import { convertXray } from '../tools/site-from-design.mjs';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160o-')) });
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
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ');
const PRESET: Record<(typeof SECTOR_SLUGS)[number], string> = {
  'care-homes': 'care_homes', 'dental-practices': 'dental', 'gp-surgeries': 'gp', 'supported-living': 'supported_living',
  'private-hospitals-and-clinics': 'private_hospital',
};
const PAGES = ['/', ...SECTOR_SLUGS.map((s) => `/capital-allowances/${s}/`)];

describe('Phase 160o: the home page', () => {
  test('the scan box has no count of systems found (and since Phase 160p no box at all)', async () => {
    const html = await text('/');
    assert.doesNotMatch(html, /<b class="t-n"|shown here|id="tN"/);
    assert.doesNotMatch(await text('/assets/home.js'), /tN\.textContent/, 'the script still writes the count');
  });

  test('the captions above it are bigger, and the small print at the end too', async () => {
    const css = await text('/assets/home.css');
    assert.match(css, /\.cap h2\{font-size:clamp\(21px,3\.2vh,27px\);/);
    assert.match(css, /\.cap p\{color:var\(--on-night-2\);font-size:clamp\(16\.5px,2\.6vh,19\.5px\);/);
    assert.match(css, /\.cap \.fine\{font-size:clamp\(15\.5px,2\.3vh,17\.5px\);/);
  });

  test('no surveyor placeholder', async () => {
    const html = await text('/');
    assert.doesNotMatch(html, /class="ph"|ph-face|Placeholder|RICS membership \(to be supplied/);
    assert.doesNotMatch(await text('/assets/home.css'), /\.ph\{|\.ph-face/);
  });

  test('"Am I eligible?" and "Try the calculator" side by side in How it works, as in the X-ray and Contact', async () => {
    const html = await text('/');
    const how = /<div class="how-cta">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
    assert.match(how, /href="\/assessment">Am I eligible\?/);
    assert.match(how, /href="#calculator">Try the calculator<\/a>/);
    // the fee note's colour no longer reaches the button's arrow
    assert.match(await text('/assets/home.css'), /\.how-cta>span\{color:var\(--muted\);font-size:15px\}/);
  });
});

describe('Phase 160o: every page', () => {
  for (const page of PAGES) {
    test(`${page}: Log in is a person icon, with its words for screen readers; a Sectors menu lists all five pages`, async () => {
      const html = await text(page);
      const header = /<header class="top" id="top">([\s\S]*?)<\/header>/.exec(html)?.[1] ?? '';
      assert.match(header, /<li class="nav-login"><a href="\/login" title="Log in"><svg [^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg><span class="nav-login-t">Log in<\/span><\/a><\/li>/);
      assert.doesNotMatch(header, />Log in<\/a>/, 'Log in is still a word on the bar');
      for (const s of SECTOR_SLUGS) assert.match(header, new RegExp(`<a href="/capital-allowances/${s}/"`), s);
      const css = await text(page === '/' ? '/assets/home.css' : `/assets/ca-${page.split('/')[2]}.css`);
      // hidden from sight on the bar, shown in the phone menu
      assert.match(css, /\.nav-login-t\{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect\(0 0 0 0\);white-space:nowrap\}/);
      assert.match(css, /\.top\.open \.nav-login-t\{position:static;/);
    });
  }
});

describe('Phase 160o: the five sector pages in the X-ray design', () => {
  for (const slug of SECTOR_SLUGS) {
    test(`/capital-allowances/${slug}/: the X-ray look, its drawing, its calculator opening on it`, async () => {
      const html = await text(`/capital-allowances/${slug}/`);
      assert.match(html, /<section class="sx-hero" aria-labelledby="h1">/);
      assert.match(html, /<nav class="crumb" aria-label="Breadcrumb"><ol><li><a href="\/">Home<\/a><\/li>/);
      assert.match(html, /<figure class="sx-fig"><svg class="sx-thumb" role="img" aria-label="Drawing of [^"]+"/);
      assert.match(html, new RegExp(`<form class="cbox" id="calc" data-preset="${PRESET[slug]}"`));
      assert.match(html, new RegExp(`<input type="radio" name="sector" id="[^"]+" value="${PRESET[slug]}" checked>`));
      assert.match(html, /<input type="radio" name="trig" id="t-p" value="purchase" checked>/);
      for (const id of ['brief', 'qualifies', 'calculator', 'watch', 'ask', 'guide', 'how', 'questions', 'start']) {
        assert.match(html, new RegExp(`<section class="sec[^"]*" id="${id}"`), id);
      }
      const css = await text(`/assets/ca-${slug}.css`);
      assert.match(css, /\.sx-hero\{background:radial-gradient/);
      assert.doesNotMatch(css, /IBM Plex/, 'the old design’s fonts');
      const js = await text(`/assets/ca-${slug}.js`);
      assert.match(js, /var pre=form\.getAttribute\('data-preset'\)/);
      assert.match(js, /function menu\(o\)/, 'no phone menu');
    });

    test(`/capital-allowances/${slug}/: "Am I eligible?" always beside "Try the calculator"`, async () => {
      const html = await text(`/capital-allowances/${slug}/`);
      // the calculator's own button is left alone: it sits in the calculator
      const outside = html.replace(/<form class="cbox"[\s\S]*?<\/form>/, '');
      const groups = [...outside.matchAll(/<div class="(?:acts|how-cta)">([\s\S]*?)<\/div>/g)].map((m) => m[1] ?? '');
      assert.ok(groups.length >= 3, `${groups.length} button groups`);
      for (const g of groups) {
        assert.match(g, /href="\/assessment">Am I eligible\?/);
        assert.match(g, /href="#calculator">Try the calculator<\/a>/);
      }
    });

    test(`/capital-allowances/${slug}/: nothing of the old design is left in what a person reads`, async () => {
      const html = await text(`/capital-allowances/${slug}/`);
      const words = visible(html);
      assert.doesNotMatch(words, /Keep scrolling|Scan 000%|Rebuild|Sheet \d of 6|Not to scale|Detail [A-J] ·|Section [A-F]-[A-F] ·|\[ ?\d\d ?\]/);
      assert.doesNotMatch(html, /kurbelwerk|data-today|class="pin-|class="hcta/i);
    });

    test(`the file for ${slug} was written by the tool from its X-ray design file`, () => {
      assert.match(readFileSync(sectorPath(slug), 'utf8'), new RegExp(`^<!doctype html>\\n<!-- Cap Rebate sector page: ${slug}\\. Written by tools/site-from-design\\.mjs from its design file, redesign-options/sectors/${slug}\\.html \\(Phase 160o\\)`));
    });
  }

  test('the converter: a sector page needs no form and gets no form script', () => {
    const page = `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight&display=swap" rel="stylesheet">
<style>body{margin:0}</style></head><body><section class="sec" id="brief"><p>x</p></section>
<footer class="foot"><nav aria-label="Legal"><a href="#">Privacy</a></nav></footer><script>var x=1;</script></body></html>`;
    const out = convertXray(page, 'care-homes') as string;
    assert.match(out, /^<!doctype html>\n<!-- Cap Rebate sector page: care-homes\. Written by tools\/site-from-design\.mjs/);
    assert.doesNotMatch(out, /SITEKEY|contactform|c-turnstile/, 'a sector page got the form or its script');
    assert.match(out, /<nav aria-label="Legal"><h2>Legal<\/h2>/);
    assert.match(out, /@font-face\{font-family:"Inter Tight"/);
    assert.throws(() => convertXray(page.replace(' onclick', '').replace('<p>x</p>', '<p onclick="go()">x</p>'), 'care-homes'), /inline event handler/);
  });
});
