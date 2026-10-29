/**
 * PHASE 160p, 29 OCTOBER 2026 — THE X-RAY'S FINISHING TOUCHES.
 *
 * Lakhbir, with three screenshots of the live home page: "just remove this box it makes no sense" (the "qualifying
 * systems found" box and its bars under the captions), "remove the disclaimer from supported living" (the note on its
 * card), "make property type box same height as name email phone ect", "on the animation 1) make the lift go up and
 * down 2) flicker the lights as they turn on". All five are in the design file (redesign-options/02-x-ray.html);
 * tools/site-from-design.mjs writes the site from it. These tests read what the server sends.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160p-')) });
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

describe('Phase 160p: the X-ray home page', () => {
  test('no box under the captions: the figure arrives on its own at the end of the scan', async () => {
    const html = await text('/');
    assert.doesNotMatch(html, /Qualifying systems found|class="t-run"|id="tBar"|class="t-bar"/);
    assert.match(html, /<div class="tally" id="tally">\s*<div class="t-end">\s*<p class="t-lead">[\s\S]*?<p class="t-fig" id="tFig">£675,000<\/p>/);
    const css = await text('/assets/home.css');
    assert.match(css, /\.tally\{position:relative;display:grid\}/, 'the box still has a frame or a background');
    assert.doesNotMatch(css, /\.t-bar|\.t-run|\.tally\.done\{/);
    const js = await text('/assets/home.js');
    assert.doesNotMatch(js, /#tBar|segs/);
    // the figure still waits for the end, and counts up
    assert.match(css, /\.motion \.t-end\{opacity:0;/);
    assert.match(js, /tally\.classList\.toggle\('done',fin\);if\(fin\)countUp\(\)/);
  });

  test('the supported-living card has no note', async () => {
    const html = await text('/');
    const card = /<h3>Supported living<\/h3>([\s\S]*?)<\/article>/.exec(html)?.[1] ?? '';
    assert.match(card, /<li>Shared stairs, lifts and corridors<\/li>/);
    assert.doesNotMatch(card, /class="note"|do not qualify|can be nil/);
    assert.doesNotMatch(await text('/assets/home.css'), /\.sc \.note\{/);
  });

  test('the property type menu is as tall as the name, email and phone boxes', async () => {
    const html = await text('/');
    assert.match(html, /<select id="c-ptype" name="ptype" required>/);
    const css = await text('/assets/home.css');
    assert.match(css, /\.f input,\.f select,\.f textarea\{[^}]*min-height:46px;/);
    // browsers draw their own menu at their own size unless the page draws it, arrow and all; then it takes the
    // same font, line height, padding and border as the boxes, so it is exactly as tall
    assert.match(css, /\.f select\{-webkit-appearance:none;appearance:none;padding-right:40px;background-image:linear-gradient\(/);
    assert.doesNotMatch(css, /\.f select\{[^}]*height:/, 'a fixed height, which can differ from the boxes');
    assert.doesNotMatch(css, /url\(["']?data:/, 'a picture the security policy would block');
  });

  test('the lift: its car travels up a floor and back down, the cables shortening with it, once the lift lights up', async () => {
    const html = await text('/');
    const lifts = /<svg class="layer sys sys-lifts"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? '';
    assert.match(lifts, /<g class="lift-car"><rect x="468" y="472" width="44" height="72"/);
    assert.match(lifts, /<g class="lift-cable"><line x1="484" y1="126" x2="484" y2="472"/);
    const css = await text('/assets/home.css');
    // the car's top goes from 472 to 262 (the first floor's doors); the cables from 346 long to 136 (136 / 346 = .393)
    assert.match(css, /@keyframes lift\{0%,12%\{transform:none\}44%,62%\{transform:translateY\(-210px\)\}94%,100%\{transform:none\}\}/);
    assert.match(css, /@keyframes cable\{0%,12%\{transform:none\}44%,62%\{transform:scaleY\(\.393\)\}94%,100%\{transform:none\}\}/);
    assert.match(css, /\.lift-car\{animation:lift 7s ease-in-out infinite\}/);
    assert.match(css, /\.lift-cable\{transform-box:fill-box;transform-origin:50% 0;animation:cable 7s ease-in-out infinite\}/);
    assert.match(css, /\.motion \.xr:not\(\.lift-live\) \.lift-car,\.motion \.xr:not\(\.lift-live\) \.lift-cable\{animation:none\}/);
    assert.match(await text('/assets/home.js'), /stage\.classList\.toggle\('lift-live',p>=S0\+3\*SW\)/);
  });

  test('the lights: each of the ten lamps flickers as it comes on, in its own time; the exit signs stay steady', async () => {
    const html = await text('/');
    const lights = /<svg class="layer sys sys-lighting"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? '';
    const lamps = [...lights.matchAll(/<g class="lamp">([\s\S]*?)<\/g>/g)];
    assert.equal(lamps.length, 10);
    for (const [, lamp] of lamps) assert.match(lamp ?? '', /<polygon [^>]*fill="url\(#cone\)"/, 'a lamp without its light');
    assert.match(lights, /<\/g><rect x="586" y="176" width="20" height="8"/, 'the exit sign went into a lamp');
    const css = await text('/assets/home.css');
    assert.match(css, /\.motion \.xr\.lights-live \.lamp\{animation:flick 1\.1s linear both\}/);
    assert.equal([...css.matchAll(/\.motion \.xr\.lights-live \.lamp:nth-of-type\(\d+\)\{animation-delay:/g)].length, 9);
    assert.match(css, /@keyframes flick\{0%\{opacity:0\}[^}]*\}[\s\S]*?48%,100%\{opacity:1\}\}/);
    assert.match(await text('/assets/home.js'), /stage\.classList\.toggle\('lights-live',p>=S0\+5\*SW\)/);
  });

  test('a visitor who asks for less motion sees the finished picture: nothing moves or flickers', async () => {
    const css = await text('/assets/home.css');
    assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*html\{scroll-behavior:auto\}\s*\*,\*::before,\*::after\{animation:none!important;transition:none!important\}/);
    // the flicker needs the page's motion mode, which such a visitor never gets
    assert.match(await text('/assets/home-head.js'), /prefers-reduced-motion: reduce\)'\)\.matches;if\(!m\)document\.documentElement\.classList\.add\('motion'\)/);
  });

  test('the scan still lasts twelve seconds', async () => {
    assert.match(await text('/assets/home.js'), /var DUR=12000/);
  });
});
