/**
 * PHASE 160l, 21 OCTOBER 2026 — THE WEBSITE'S FINISHING TOUCHES.
 *
 * Lakhbir, on the live test site: "add black outline to the 3%", "ensure the date here is always todays date",
 * "remove scale", "add fake signiture". Made in the design files and written into site/ by tools/site-from-design.mjs;
 * these tests read what the server sends.
 *
 * PHASE 160n, 28 OCTOBER 2026: the home page is now the X-ray, which has no title block, no 3% figure on a drawing
 * sheet and no surveyor's line, so these touches are checked on the five sector pages, which still carry them.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
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
  ...SECTOR_SLUGS.map((slug) => ({ page: `/capital-allowances/${slug}/`, asset: `ca-${slug}` })),
];

/** The part of a page script that dates the title block, run against a fake page on a fixed day. */
function dateTheBlock(js: string, day: Date): string {
  const start = js.indexOf('/* Phase 160l');
  assert.ok(start >= 0, 'the dating script is not in the page script');
  const end = js.indexOf('})();', start) + '})();'.length;
  const el = { textContent: 'unset' };
  const RealDate = Date;
  class FixedDate extends RealDate { constructor() { super(day.getTime()); } }
  vm.runInNewContext(js.slice(start, end), {
    Date: FixedDate,
    document: { querySelectorAll: (q: string) => (q === '[data-today]' ? [el] : []), querySelector: () => null },
    window: {},
  });
  return el.textContent;
}

describe('Phase 160l: the website finishing touches', () => {
  for (const { page, asset } of PAGES) {
    test(`${page}: the title block is dated by the page script and has no Scale box`, async () => {
      const html = await text(page);
      assert.equal([...html.matchAll(/<small>Date<\/small><span data-today>\d\d\.\d\d\.\d{4}<\/span>/g)].length, 1, 'the date is not marked to be set');
      assert.doesNotMatch(html, /Not to scale|<small>Scale<\/small>|class="c-scale"/, 'the Scale box is still there');
      const js = await text(`/assets/${asset}.js`);
      assert.equal(dateTheBlock(js, new Date(2027, 2, 5)), '05.03.2027');
      assert.equal(dateTheBlock(js, new Date(2026, 11, 31)), '31.12.2026');
    });

    test(`${page}: the 3% is outlined in black, and Region takes the Scale box's place`, async () => {
      const css = await text(`/assets/${asset}.css`);
      assert.match(css, /\.spec \.sp-fee b\{-webkit-text-stroke:3px var\(--ink\);paint-order:stroke fill\}/);
      assert.match(css, /\.tb \.c-region\{grid-column:span 4\}/);
      // the outline comes after the earlier "flat" rule that took the stroke off, so it wins
      assert.ok(css.lastIndexOf('-webkit-text-stroke:3px var(--ink)') > css.lastIndexOf('-webkit-text-stroke:0'), 'the flat rule still wins');
    });
  }

});
