/**
 * PHASE 160m, 21 OCTOBER 2026 — EVERY WEBSITE SECTION FITS ONE WINDOW ON A DESKTOP SCREEN.
 *
 * Lakhbir: "polish the website - look at the scroll points everything in each section should fit within one window".
 * The rules are made in the design files and written into site/ by tools/site-from-design.mjs. They were measured in a
 * browser at five window sizes; these tests check that what the server sends carries them, and only for a desktop
 * window, so phones and tablets are as they were.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { SECTOR_SLUGS } from '../src/web/home-site.ts';

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160m-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const addr = made.server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
});
after(() => made.close());

const css = async (asset: string) => {
  const r = await fetch(`${base}/assets/${asset}.css`);
  assert.equal(r.status, 200, asset);
  return r.text();
};

const DESKTOP = '@media (min-width:1000px) and (min-height:600px){';

/** The text of each block that opens with `head`, up to its closing brace. */
function blocks(text: string, head: string): string[] {
  const out: string[] = [];
  for (let at = text.indexOf(head); at >= 0; at = text.indexOf(head, at + 1)) {
    let depth = 0;
    for (let i = at; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) { out.push(text.slice(at, i + 1)); break; }
    }
  }
  return out;
}

describe('Phase 160m: every section fits one window on a desktop screen', () => {
  for (const asset of ['home', ...SECTOR_SLUGS.map((s) => `ca-${s}`)]) {
    test(`${asset}: each section is one window tall, sized by the window's height, and the page rests on it`, async () => {
      const text = await css(asset);
      const desk = blocks(text, DESKTOP);
      assert.equal(desk.length, 1, 'the desktop rules are not there once');
      const all = desk.join('\n');
      assert.match(all, /:root\{--sheet:calc\(100svh - 2 \* var\(--ey\) - var\(--hh\)\)\}/);
      assert.match(all, /html\{scroll-snap-type:y proximity;scroll-padding-top:calc\(var\(--ey\) \+ var\(--hh\)\)\}/);
      assert.match(all, /\.hero,\.sec\{scroll-snap-align:start\}/);
      assert.match(all, /\.sec:not\(:has\(\.pin-track\)\)\{min-height:var\(--sheet\);display:flex;flex-direction:column;justify-content:center;/);
      assert.match(all, /\.hero\{min-height:var\(--sheet\);/);
      assert.match(all, /\.h2\{font-size:min\(clamp\(2\.1rem,1\.25rem \+ 3\.3vw,4\.4rem\),7\.2vh\)\}/, 'headings do not shrink with the window height');
      // a shorter window steps everything tighter, still only on a desktop
      assert.ok(blocks(text, '@media (min-width:1000px) and (min-height:600px) and (max-height:900px){').length >= 1, 'no tighter step for a shorter window');
    });

    test(`${asset}: none of it reaches a phone or a tablet`, async () => {
      const text = (await css(asset)).replace(/\/\*[\s\S]*?\*\//g, '');
      const outside = text.split(DESKTOP).map((part, i) => (i === 0 ? part : part.slice(blocks(DESKTOP + part, DESKTOP)[0]!.length - DESKTOP.length)))
        .join('');
      assert.doesNotMatch(outside, /scroll-snap-type/, 'snapping outside the desktop rules');
      assert.doesNotMatch(outside, /--sheet/, 'the window sizing outside the desktop rules');
    });
  }
});
