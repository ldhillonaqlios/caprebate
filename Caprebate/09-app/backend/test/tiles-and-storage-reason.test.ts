/**
 * 29 SEPTEMBER 2026 — HOME TILES SHOW THEIR WHOLE TEXT, AND THE "RECORDS KEPT IN MEMORY" BOX SAYS WHY.
 *
 * Lakhbir: "the UI UX needs to be addressed, too many texts have been cut off. Also it says records kept in memory only."
 *   1. every Home tile's text was cut at 48 characters with "…"; it now wraps whole, and a late date wraps inside its tile;
 *   2. the test website knows why it runs on memory (api/index.mjs, openLasting) and printed it only to the log; the
 *      identity panel and the sign-in time-out page now say it too - never an address and never a token.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import { short } from '../src/web/home.ts';
import { forgetfulDatabaseWarning, FORGETFUL_DATABASE_WORDS, storageReason } from '../src/web/identity-checks.ts';
import { stepGoneWhy, STEP_LOST_ON_MEMORY } from '../src/web/router.ts';
import { SITE_CSS } from '../src/web/assets.ts';

describe('Home tiles show their whole text', () => {
  test('a long line is kept whole, only its spaces tidied', () => {
    const long = 'Confirm who owns the building, and that we would be acting for them';
    assert.equal(short(long), long);
    assert.equal(short('  two   spaces\n and a line  '), 'two spaces and a line');
    assert.doesNotMatch(readFileSync(new URL('../src/web/home.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /…/);
  });

  test('the seeded next action reaches Sales\'s Home whole, with no "…" on any tile', async () => {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-tiles-')), twoFactor: 'off' });
    try {
      await seed(made.app.db, made.app.hasher, made.app.now);
      await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
      const a = made.server.address();
      const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
      const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'sales@example.invalid', password: SEED_PASSWORD }).toString() });
      const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      const home = await (await fetch(`${base}/staff`, { headers: { cookie } })).text();
      assert.match(home, /Confirm who owns the building, and that we would be acting for them/);
      const tileText = [...home.matchAll(/<span class="tile(?:name|line)[^"]*">([^<]*)<\/span>/g)].map((m) => m[1] ?? '');
      assert.ok(tileText.length > 0);
      assert.equal(tileText.filter((t) => t.endsWith('…')).length, 0, tileText.filter((t) => t.endsWith('…')).join(' | '));
    } finally { made.close(); }
  });

  test('a tile\'s late date wraps inside the tile instead of running past its edge', () => {
    assert.match(SITE_CSS, /\.hometile \.tileline,main \.hometile \.tileline\.when\{white-space:normal;overflow-wrap:break-word\}/);
    // MORE SPECIFIC than the general rule that keeps a date on one line (main.wide .when is one element and two
    // classes; main .hometile .tileline.when is one element and three), and after it - checked in a browser on
    // 29 Sep 2026, where a rule of equal weight lost.
    assert.ok(SITE_CSS.indexOf('main .hometile .tileline.when{white-space:normal') > SITE_CSS.indexOf('main.wide .when{white-space:nowrap}'));
  });
});

describe('two more places text ran past its box (found by the crawl, 29 Sep 2026)', () => {
  test('a lead card\'s next-action line wraps, instead of running past the card', () => {
    assert.match(SITE_CSS, /main \.leadcard \.lc-line\.when\{white-space:normal;overflow-wrap:break-word\}/);
    assert.ok(SITE_CSS.indexOf('main .leadcard .lc-line.when{white-space:normal') > SITE_CSS.indexOf('main.wide .when{white-space:nowrap}'));
  });

  test('the audit log\'s wide table scrolls inside its own frame, so the page does not', async () => {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-audit-')), twoFactor: 'off' });
    try {
      await seed(made.app.db, made.app.hasher, made.app.now);
      await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
      const a = made.server.address();
      const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
      const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'admin@example.invalid', password: SEED_PASSWORD }).toString() });
      const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      const page = await (await fetch(`${base}/staff/audit`, { headers: { cookie } })).text();
      assert.match(page, /<div class="tablewrap" id="audit-lines"><table>\s*<thead><tr><th>#<\/th><th>When<\/th>/);
    } finally { made.close(); }
  });
});

describe('the memory box says why', () => {
  const why = 'no lasting database is set, so the records are kept in memory';

  test('with a reason, the identity panel\'s words end with it, as one sentence', () => {
    const app = { db: { kind: 'memory' }, storageWhy: why } as unknown as Parameters<typeof forgetfulDatabaseWarning>[0];
    assert.equal(forgetfulDatabaseWarning(app), `${FORGETFUL_DATABASE_WORDS} Why: No lasting database is set, so the records are kept in memory.`);
    assert.equal(storageReason('the lasting database could not be opened (SERVER_ERROR). '), 'Why: The lasting database could not be opened (SERVER_ERROR).');
  });

  test('without one, or on a lasting database, nothing changes', () => {
    assert.equal(forgetfulDatabaseWarning({ db: { kind: 'memory' } } as never), FORGETFUL_DATABASE_WORDS);
    assert.equal(forgetfulDatabaseWarning({ db: { kind: 'remote' }, storageWhy: why } as never), null);
    assert.equal(stepGoneWhy({ db: { kind: 'remote' }, storageWhy: why }), undefined);
    assert.equal(stepGoneWhy({ db: { kind: 'memory' } }), STEP_LOST_ON_MEMORY);
  });

  test('the sign-in time-out page gives the same reason', () => {
    assert.equal(stepGoneWhy({ db: { kind: 'memory' }, storageWhy: why }), `${STEP_LOST_ON_MEMORY} Why: No lasting database is set, so the records are kept in memory.`);
  });

  test('the test website sets it only when it runs on memory, from the reason it logs', () => {
    const api = readFileSync(new URL('../../../../api/index.mjs', import.meta.url), 'utf8');
    assert.match(api, /if \(!opened\.lasting\) made\.app\.storageWhy = opened\.why;/);
  });
});
