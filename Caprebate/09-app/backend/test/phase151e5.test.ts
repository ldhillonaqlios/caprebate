/**
 * PHASE 151e, line 7, 28 September 2026 — AN INVENTED CONTACT FOR EVERY SEEDED CLIENT, AND A TEST WEBSITE THAT NEVER
 * GOES DOWN FOR ITS DATABASE.
 *
 *   1  Lakhbir asked for an invented contact on each seeded client: every client the seed makes has a contact we can
 *      reach (line 6's rule), so the demo and the test website show no flag on a seeded client.
 *   2  Turso is being opened. The test website uses it when it is set, and if it cannot be opened, or holds a seed a
 *      cut-off first start never finished, it runs on memory as before and says why - never the address or the token.
 *      A file database stands in for Turso here (the same code path past the open): no network, invented data only.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { reachableContacts } from '../src/web/crm.ts';

const NOW = '2026-09-28T12:00:00.000Z';
const opts = () => ({ documentRoot: mkdtempSync(join(tmpdir(), 'cb-151e5-')), now: () => NOW, sealKey: randomBytes(32) });

type Made = Awaited<ReturnType<typeof createApp>>;
type Opened = { made: Made; lasting: boolean; why: string };
type Lasting = { location: string; authToken?: string; why: string };
async function entry() {
  return (await import(new URL('../../../../api/index.mjs', import.meta.url).href)) as {
    openLasting: (c: typeof createApp, s: typeof seed, l: Lasting, o: object, waitMs?: number) => Promise<Opened>;
    seedOnce: (made: Made, s: typeof seed) => Promise<{ seeded: boolean; complete: boolean }>;
  };
}
const users = (m: Made) => m.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0;

describe('151e line 7 · 1 · every seeded client has an invented contact we can reach', () => {
  test('no seeded client is flagged: each has a contact with an email address or a telephone number, all invented', async () => {
    const made = await createApp(':memory:', opts());
    try {
      await seed(made.app.db, made.app.hasher, made.app.now);
      const clients = made.app.db.all<{ id: string; name: string }>('SELECT id, name FROM businesses ORDER BY name');
      assert.equal(clients.length, 6);
      for (const c of clients) assert.ok(reachableContacts(made.app.db, c.id) > 0, `${c.name} has no contact we can reach`);
      const added = made.app.db.all<{ email: string; phone: string }>("SELECT email, phone FROM contacts WHERE full_name = 'Main Contact'");
      assert.equal(added.length, 5, 'Dunmarrow keeps its own two, and the other five get one each');
      for (const a of added) {
        assert.match(a.email, /@b[0-9]\.example\.invalid$/, 'a contact that is not invented');
        assert.match(a.phone, /^01632 96/, 'not a number in the range kept for drama');
      }
    } finally { made.close(); }
  });
});

describe('151e line 7 · 2 · the test website opens its lasting database, or falls back to memory and says why', () => {
  const lastingAt = (file: string): Lasting => ({ location: file, authToken: 'invented-token-not-real-151e5', why: 'the records are kept in the lasting database' });

  test('nothing set: memory, seeded, as before', async () => {
    const { openLasting } = await entry();
    const o = await openLasting(createApp, seed, { location: ':memory:', why: 'no lasting database is set, so the records are kept in memory' }, opts(), 0);
    try {
      assert.equal(o.lasting, false);
      assert.equal(o.made.app.db.kind, 'memory');
      assert.ok(users(o.made) > 0);
    } finally { o.made.close(); }
  });

  test('a lasting database that cannot be opened: memory, and the reason names neither the address nor the token', async () => {
    const { openLasting } = await entry();
    const failing: typeof createApp = async (location, o) => {
      if (location !== ':memory:') throw Object.assign(new Error('connect failed to libsql://secret-host.turso.io'), { code: 'ECONNREFUSED' });
      return createApp(location, o);
    };
    const o = await openLasting(failing, seed, { location: 'libsql://secret-host.turso.io', authToken: 'invented-secret-token', why: 'x' }, opts(), 0);
    try {
      assert.equal(o.lasting, false);
      assert.equal(o.made.app.db.kind, 'memory');
      assert.match(o.why, /could not be opened \(ECONNREFUSED\), so the records are kept in memory/);
      assert.ok(!o.why.includes('secret-host') && !o.why.includes('invented-secret-token'), 'the address or the token was printed');
      assert.ok(users(o.made) > 0, 'the fallback was not seeded');
    } finally { o.made.close(); }
  });

  test('the first start seeds the lasting database; the next start finds it there and seeds nothing', async () => {
    const { openLasting } = await entry();
    const file = join(mkdtempSync(join(tmpdir(), 'cb-151e5-db-')), 'turso-stand-in.db');
    const first = await openLasting(createApp, seed, lastingAt(file), opts(), 0);
    let n = 0;
    try {
      assert.equal(first.lasting, true);
      assert.match(first.why, /seeded now/);
      n = users(first.made);
    } finally { first.made.close(); }
    const second = await openLasting(createApp, seed, lastingAt(file), opts(), 0);
    try {
      assert.equal(second.lasting, true);
      assert.doesNotMatch(second.why, /seeded now/);
      assert.equal(users(second.made), n, 'the second start seeded again');
    } finally { second.made.close(); }
  });

  test('a seed a first start never finished: memory, and it says what to do - it never tries to finish half a seed', async () => {
    const { openLasting } = await entry();
    const file = join(mkdtempSync(join(tmpdir(), 'cb-151e5-db-')), 'cut-off.db');
    const first = await openLasting(createApp, seed, lastingAt(file), opts(), 0);
    first.made.app.db.run("DELETE FROM users WHERE id = 'u-demo-readonly'"); // the last row a finished seed writes
    const before = users(first.made);
    first.made.close();
    const again = await openLasting(createApp, seed, lastingAt(file), opts(), 0);
    try {
      assert.equal(again.lasting, false);
      assert.equal(again.made.app.db.kind, 'memory');
      assert.match(again.why, /never finished: empty it in Turso and redeploy/);
    } finally { again.made.close(); }
    const look = await createApp(file, opts());
    try { assert.equal(users(look), before, 'something was written to the half-seeded database'); } finally { look.close(); }
  });
});
