/**
 * PHASE 160m, 21 OCTOBER 2026 — EVERY WEBSITE SECTION FITS ONE WINDOW ON A DESKTOP SCREEN.
 *
 * Lakhbir: "polish the website - look at the scroll points everything in each section should fit within one window".
 * Built then as a block of rules in the old drawing-sheet design.
 *
 * PHASES 160n AND 160o, 28 OCTOBER 2026: every page is now in the X-ray design, which keeps the same promise its own
 * way: on a desktop screen (1,000px wide or more) each section is at least the window less the menu bar, its content
 * centred; phones and tablets are not held to it. Long reading (a sector page's guide) simply runs on.
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

describe('Phase 160m: every section fits one window on a desktop screen (in the X-ray design since Phases 160n and 160o)', () => {
  for (const asset of ['home', ...SECTOR_SLUGS.map((s) => `ca-${s}`)]) {
    test(`${asset}: each section is at least one window tall on a desktop, its content centred; not on a phone`, async () => {
      const text = await css(asset);
      assert.match(text, /\.sec\{position:relative;display:flex;align-items:center;/, 'sections do not centre their content');
      assert.match(text, /@media \(min-width:1000px\)\{\.sec\{min-height:calc\(100vh - var\(--hh\)\)\}\}/, 'not one window tall on a desktop');
      // the window rule appears only inside the desktop query
      assert.equal([...text.matchAll(/min-height:calc\(100vh - var\(--hh\)\)/g)].length >= 1, true);
      assert.doesNotMatch(text.replace(/@media \(min-width:1000px\)\{\.sec\{min-height:calc\(100vh - var\(--hh\)\)\}\}/, ''), /\.sec\{min-height:calc\(100vh/);
    });
  }
});
