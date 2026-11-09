/**
 * PHASE 161i, 7 November 2026 — REGROUP 1: core, shared and integrations as areas with front doors, and the CSS as real
 * files. Moves, not rewrites: what a person sees does not change.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const BACKEND = join(import.meta.dirname, '..', '..');
const R = createRequire(import.meta.url)('../../tools/route-list.cjs') as { routeList: (b: string) => string };

test('161i: every route the code answers is the same list as before the first move (test/fixtures/route-list.txt)', () => {
  assert.equal(R.routeList(BACKEND), readFileSync(join(BACKEND, 'test', 'fixtures', 'route-list.txt'), 'utf8'));
});

/* The stylesheet's bytes, by SHA-256: a change to src/styles/site.css changes this on purpose, in the same commit. */
const CSS_BEFORE = '68ccad9e98e1f12dab6c1781804571659ec84d2436f631f6703808525358eae0';

test('161i: the CSS is a real file (src/styles/site.css), served at the same address with the same bytes and headers', async () => {
  const { SITE_CSS, CSS_HEADERS } = await import('../../src/shared/assets.ts');
  const file = readFileSync(join(BACKEND, 'src', 'styles', 'site.css'), 'utf8');
  assert.equal(SITE_CSS, file);
  assert.equal(createHash('sha256').update(file).digest('hex'), CSS_BEFORE);
  const { createApp } = await import('../../src/core/server.ts');
  const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-161i-')) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  try {
    const a = made.server.address();
    const r = await fetch(`http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}/assets/site.css`);
    assert.equal(r.status, 200);
    assert.equal(createHash('sha256').update(await r.text()).digest('hex'), CSS_BEFORE);
    for (const [k, v] of Object.entries(CSS_HEADERS)) assert.equal(r.headers.get(k), v, k);
  } finally { made.server.close(); made.close(); }
});

test('161i: the parts made from code (tokens, font stacks, menu icons, current tab) must stay in the file, or the start stops', async () => {
  const { SITE_CSS, cssPartsMissing, BRAND_TOKENS } = await import('../../src/shared/assets.ts');
  assert.deepEqual(cssPartsMissing(SITE_CSS), []);
  const changed = SITE_CSS.replace(`--mint:${BRAND_TOKENS['mint'] ?? ''}`, '--mint:#000000');
  assert.notEqual(changed, SITE_CSS);
  assert.deepEqual(cssPartsMissing(changed), ['the brand tokens']);
});

test('161i: core, shared and integrations each have a front door, and other areas reach them only through it or as counted breaks', () => {
  const m = JSON.parse(readFileSync(join(BACKEND, 'architecture', 'modules.json'), 'utf8')) as { doors: Record<string, string> };
  for (const a of ['core', 'shared', 'integrations']) {
    assert.equal(m.doors[a], `src/${a}/index.ts`);
    assert.match(readFileSync(join(BACKEND, m.doors[a] as string), 'utf8'), /FRONT DOOR/);
  }
});
