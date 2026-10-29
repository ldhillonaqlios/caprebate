/**
 * PHASE 160l, 21 OCTOBER 2026 — THE WEBSITE'S FINISHING TOUCHES, AND THEIR RETIREMENT.
 *
 * Lakhbir, on the live test site: "add black outline to the 3%", "ensure the date here is always todays date",
 * "remove scale", "add fake signiture". Those touches belonged to the old drawing-sheet design: its title block (Date,
 * Region, Scale), the 3% on the sheet and the made-up signature on the surveyor's line.
 *
 * PHASE 160n (28 Oct 2026) moved the home page to the X-ray design, and PHASE 160o (28 Oct 2026, Lakhbir: "ensure all
 * sectors follow the same wordpress elementor design") the five sector pages too. No page has a title block, a sheet
 * or a signature any more, so what is checked now is that none of it is left behind half-done: no date waiting to be
 * set, no Scale box, no signature, and no page script still looking for them.
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
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-160l-')) });
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
const PAGES = [
  { page: '/', asset: 'home' },
  ...SECTOR_SLUGS.map((slug) => ({ page: `/capital-allowances/${slug}/`, asset: `ca-${slug}` })),
];

describe('Phase 160l: the drawing-sheet touches, retired with the old design (Phases 160n and 160o)', () => {
  for (const { page, asset } of PAGES) {
    test(`${page}: no title block, Scale box or signature is left, and no script looks for them`, async () => {
      const html = await text(page);
      assert.doesNotMatch(html, /data-today|<small>Scale<\/small>|class="c-scale"|class="sig"|class="sgn"/);
      const js = await text(`/assets/${asset}.js`);
      assert.doesNotMatch(js, /\[data-today\]|sg-wait/);
    });
  }
});
