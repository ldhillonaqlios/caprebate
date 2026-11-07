/**
 * Phase 161f, 5 November 2026 — the claim calculator is edited as normal code, and the website takes it from there.
 *
 * The ITRoadway technical audit (2 November 2026, section 5): "The claim calculator is stored in an unusual way. It is
 * copied out of one very large web page file and can't be edited directly, which makes it easy to change the wrong
 * file by mistake." Until this phase `Caprebate site.html` was the source and the engine package the copy
 * (engine/tools/extract.cjs). Now the source is engine/src/calculator/, and the page is built from it
 * (`npm run page` in 09-app/engine: tools/build.cjs, then tools/page-from-engine.cjs). extract.cjs is gone.
 *
 * WHAT THE TEST WEBSITE RUNS. The page's own copy of the calculator sits inside the in-page assessment
 * (`<template id="assessTpl">`), which the served edition leaves out (src/web/public-site.ts). So the website's
 * eligibility check runs the engine package, on the server, through src/shared/engine.ts: these tests hold both halves.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { buildSiteEdition, SITE_PATH } from '../src/web/public-site.ts';
import { CB } from '../src/shared/engine.ts';

const ENGINE = join(import.meta.dirname, '..', '..', 'engine');
const req = createRequire(import.meta.url);
type Parts = { shared: string; sectors: Record<string, string> };
const build = req('../../engine/tools/build.cjs') as {
  SITE: string; SECTORS: string[];
  buildParts: () => Parts;
  partsInPage: (page: string) => Parts;
  differences: (page: string, parts: Parts) => string[];
  locate: (page: string) => { shared: [number, number]; sectors: Record<string, [number, number]> };
  pageWith: (page: string, parts: Parts) => string;
};

test('the calculator the website serves its page with is exactly the built engine (the app copy and the original)', () => {
  const parts = build.buildParts();
  for (const file of [SITE_PATH, build.SITE]) {
    assert.ok(existsSync(file), file);
    assert.deepEqual(build.differences(readFileSync(file, 'utf8'), parts), [], file);
  }
});

test('a planted edit to the calculator inside the page turns the check red, and an edit outside it does not', () => {
  const parts = build.buildParts();
  const page = readFileSync(SITE_PATH, 'utf8');
  const w = build.locate(page);
  // one figure in the shared layer, changed by hand in the page
  const shared = page.slice(w.shared[0], w.shared[1]);
  const at = w.shared[0] + shared.search(/\b0\.\d+\b/) + 2;
  const planted = page.slice(0, at) + (page[at] === '9' ? '8' : '9') + page.slice(at + 1);
  const red = build.differences(planted, parts);
  assert.equal(red.length, 1);
  assert.match(red[0] ?? '', /shared layer differs from src\/calculator\/shared\.js/);
  // one character in every sector's calculator
  for (const s of build.SECTORS) {
    const i = page.indexOf('function runEngine(', build.locate(page).sectors[s]?.[0]);
    const edited = `${page.slice(0, i)}function runEngine (${page.slice(i + 'function runEngine('.length)}`;
    assert.match(build.differences(edited, parts).join('\n'), new RegExp(`${s} calculator differs from src/calculator/sector-${s}\\.js`));
  }
  // the page's own renderer is not the calculator
  const r = page.indexOf('//  RENDERER', w.sectors.gp?.[1]);
  assert.deepEqual(build.differences(`${page.slice(0, r)}//  RENDERER, edited${page.slice(r + 12)}`, parts), []);
  // and writing the engine into the page puts it right, leaving the rest of the page as it was
  assert.deepEqual(build.differences(build.pageWith(planted, parts), parts), []);
  assert.equal(build.pageWith(page, parts), page);
});

test('the served website carries no copy of the calculator: the page leaves it out with the in-page assessment', () => {
  const edition = buildSiteEdition(readFileSync(SITE_PATH, 'utf8'));
  for (const [what, text] of [['page', edition.html], ['script', edition.js], ['style', edition.css]] as const) {
    for (const mark of ['var CB_PLANT', 'function runEngine(', 'CB_ELECTION', 'assessTpl"']) {
      assert.ok(!text.includes(mark), `the served ${what} carries "${mark}"`);
    }
  }
});

test("the website's eligibility check runs the engine package's calculator (src/calculator), on the server", () => {
  const shared = req('../../engine/src/calculator/shared.js') as Record<string, unknown>;
  for (const name of ['CB_FUNNEL', 'CB_FRONTDOOR', 'CB_BAND', 'CB_FEE', 'CB_GATE', 'CB_CTA']) {
    assert.equal((CB as Record<string, unknown>)[name], shared[name], `${name} is not the calculator's own`);
  }
});

test('the extractor is retired: no tool copies the page into the engine, and the engine says where to edit', () => {
  assert.equal(existsSync(join(ENGINE, 'tools', 'extract.cjs')), false);
  assert.equal(existsSync(join(ENGINE, 'src', 'generated')), false);
  const pkg = JSON.parse(readFileSync(join(ENGINE, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['extract'], undefined);
  assert.match(pkg.scripts['page'] ?? '', /build\.cjs && node tools\/page-from-engine\.cjs/);
  for (const doc of ['README.md', 'EXTRACTION.md']) {
    assert.match(readFileSync(join(ENGINE, doc), 'utf8'), /change the calculator in engine\/src; the page is built from it/i, doc);
  }
});

test('the page check and its planted-edit self-test pass (engine/tools/verify-page.cjs)', () => {
  for (const args of [[], ['--self-test']]) {
    const r = spawnSync(process.execPath, [join(ENGINE, 'tools', 'verify-page.cjs'), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
});
