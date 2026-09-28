/**
 * PHASE 151i follow-up 4, 28 September 2026 — BUILD THE TEST WEBSITE'S LASTING DATABASE, ONCE, WHILE VERCEL BUILDS.
 *
 * vercel.json's buildCommand runs this before any copy of the website starts, so the migrations and the invented seed are
 * made by one process, never by two copies racing (api/index.mjs, prepareLasting, says what happened on 28 Sep 2026).
 * With no lasting database set (lastingDatabase: its address, its token AND the test password), it does nothing.
 *
 * IT ALWAYS EXITS 0. A deploy never fails for the database: whatever happened is printed (never the address or the token),
 * and a copy that finds the database unfinished runs on memory, as before. It lives here, not in api/, because every
 * file in api/ is a public address on Vercel.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  const { lastingDatabase, prepareLasting } = await import('../../../../api/index.mjs');
  const { createApp } = await import('../src/server.ts');
  const { seed } = await import('../src/seed.ts');
  const r = await prepareLasting(createApp, seed, lastingDatabase(process.env), { documentRoot: mkdtempSync(join(tmpdir(), 'cb-prepare-')) });
  console.log(`build: ${r.why}`);
} catch (e) {
  console.log(`build: the lasting database was not prepared (${String(e?.code || e?.name || 'an error')}); the website will run on memory if it cannot open it`);
}
process.exit(0);
