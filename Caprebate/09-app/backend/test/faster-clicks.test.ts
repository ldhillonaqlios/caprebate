/**
 * FASTER CLICKS, 3 October 2026 (src/db.ts withReadMemo, src/server.ts).
 * Lakhbir: "The back end is really slow to react to clicks." Each query on the test website is a trip to the lasting
 * database, and Home asked 467 to 737 of them a click. While one click is answered, the same read is now asked once —
 * and never answered from memory after anything was written, inside a transaction, or with a file's bytes as a value.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Db, withReadMemo, type Engine } from '../src/db.ts';
import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import { startHarness } from './ui-tidy-harness.ts';

const fresh = (): Db => {
  const db = new Db(':memory:');
  db.execDdl('CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT, b BLOB)');
  db.run("INSERT INTO t (id, v) VALUES ('a', 'one'), ('b', 'two')");
  return db;
};

describe('Faster clicks: one answer per question, per click', () => {
  test('outside a click every read is a trip; inside one, the same read is one trip and a different one is its own', () => {
    const db = fresh();
    let t = db.trips;
    db.get('SELECT v FROM t WHERE id = ?', ['a']); db.get('SELECT v FROM t WHERE id = ?', ['a']);
    assert.equal(db.trips - t, 2);
    withReadMemo(() => {
      t = db.trips;
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v, 'one');
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v, 'one');
      assert.equal(db.all('SELECT v FROM t ORDER BY id').length, 2);
      assert.equal(db.all('SELECT v FROM t ORDER BY id').length, 2);
      assert.equal(db.trips - t, 2, 'the same two reads were asked twice each');
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['b'])?.v, 'two');
      assert.equal(db.get('SELECT v FROM t WHERE id = ?', ['c']), undefined);
      assert.equal(db.get('SELECT v FROM t WHERE id = ?', ['c']), undefined);
      assert.equal(db.trips - t, 4, 'a different value is a different question; "none" is remembered too');
    });
  });

  test('any write forgets everything remembered, so a read after it sees it', () => {
    const db = fresh();
    withReadMemo(() => {
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v, 'one');
      db.run("UPDATE t SET v = 'uno' WHERE id = 'a'");
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v, 'uno');
      assert.deepEqual(db.all<{ v: string }>('SELECT v FROM t ORDER BY id').map((r) => r.v), ['uno', 'two']);
      db.tx(() => { db.run("UPDATE t SET v = 'eins' WHERE id = 'a'"); });
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v, 'eins');
      try { db.tx(() => { db.run("UPDATE t SET v = 'x' WHERE id = 'a'"); throw new Error('undo'); }); } catch { /* rolled back */ }
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v, 'eins');
      assert.equal(db.all('SELECT v FROM t ORDER BY id').length, 2);
      db.execDdl("INSERT INTO t (id, v) VALUES ('c', 'three')");
      assert.equal(db.all('SELECT v FROM t ORDER BY id').length, 3);
    });
  });

  test('a write by another click in this process is seen at once', async () => {
    const db = fresh();
    let release!: () => void;
    const other = new Promise<void>((r) => { release = r; });
    const reader = withReadMemo(async () => {
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v, 'one');
      await other;
      return db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v;
    });
    withReadMemo(() => { db.run("UPDATE t SET v = 'changed' WHERE id = 'a'"); });
    release();
    assert.equal(await reader, 'changed');
  });

  test('inside a transaction nothing is remembered or reused', () => {
    const db = fresh();
    withReadMemo(() => {
      db.get('SELECT v FROM t WHERE id = ?', ['a']);
      db.tx(() => {
        const t = db.trips;
        db.get('SELECT v FROM t WHERE id = ?', ['a']); db.get('SELECT v FROM t WHERE id = ?', ['a']);
        assert.equal(db.trips - t, 2);
      });
    });
  });

  test('each caller gets its own copy; a file’s bytes as a value are never remembered; two clicks never share', () => {
    const db = fresh();
    withReadMemo(() => {
      const r = db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a']);
      assert.ok(r); r.v = 'scribbled';
      assert.equal(db.get<{ v: string }>('SELECT v FROM t WHERE id = ?', ['a'])?.v, 'one');
      const rows = db.all<{ v: string }>('SELECT v FROM t ORDER BY id'); rows[0]!.v = 'scribbled'; rows.pop();
      assert.deepEqual(db.all<{ v: string }>('SELECT v FROM t ORDER BY id').map((x) => x.v), ['one', 'two']);
      const t = db.trips;
      db.get('SELECT id FROM t WHERE b IS ?', [new Uint8Array([1])]); db.get('SELECT id FROM t WHERE b IS ?', [new Uint8Array([1])]);
      assert.equal(db.trips - t, 2);
    });
    let t = 0;
    withReadMemo(() => { db.get('SELECT v FROM t WHERE id = ?', ['b']); t = db.trips; });
    withReadMemo(() => { db.get('SELECT v FROM t WHERE id = ?', ['b']); });
    assert.equal(db.trips - t, 1, 'a second click asked again');
  });

  test('on the server, each click remembers its reads: Home asks far fewer than it did, and the next click sees a change', async () => {
    const H = await startHarness('faster');
    try {
      const db = H.made.app.db;
      await H.get('sales', '/staff');
      const t = db.trips;
      const home = await H.get('sales', '/staff');
      assert.equal(home.status, 200);
      assert.ok(db.trips - t < 300, `Home asked ${db.trips - t} trips; it asked 737 before`);
      const before = (await H.get('sales', '/staff/tasks')).body;
      assert.doesNotMatch(before, /Faster clicks task/);
      const org = db.get<{ id: string }>("SELECT id FROM businesses WHERE name LIKE 'Fenmoor%'")?.id ?? '';
      const made = await H.post('sales', '/staff/tasks', { title: 'Faster clicks task', business_id: org, owner_id: H.actor('sales').id, due_on: '2026-12-01', activity_type: 'OTHER' });
      assert.equal(made.status, 303);
      assert.match((await H.get('sales', '/staff/tasks')).body, /Faster clicks task/);
    } finally { H.close(); }
  });
});

/* ------------------------------------------------------------------ *
 * PART 2 — A LOCAL COPY OF THE LASTING DATABASE, SWITCHED ON BY THE WEBSITE'S SETTINGS
 * ------------------------------------------------------------------ */

type Lasting = { location: string; authToken?: string; localCopy?: boolean; why: string };
type Made = Awaited<ReturnType<typeof createApp>>;
async function entry() {
  return (await import(new URL('../../../../api/index.mjs', import.meta.url).href)) as {
    lastingDatabase: (env: Record<string, string>) => Lasting;
    openLasting: (c: typeof createApp, s: typeof seed, l: Lasting, o: object, waitMs?: number) => Promise<{ made: Made; lasting: boolean; why: string }>;
    prepareLasting: (c: typeof createApp, s: typeof seed, l: Lasting, o?: object) => Promise<{ prepared: boolean }>;
  };
}
const opts = () => ({ documentRoot: mkdtempSync(join(tmpdir(), 'cb-fc-')), sealKey: randomBytes(32) });
const SET = { CAPREBATE_DB_URL: 'libsql://invented-fc.turso.io', CAPREBATE_DB_TOKEN: 'invented-token-fc', CAPREBATE_TEST_PASSWORD: 'an-invented-test-password' };

describe('Faster clicks, part 2: a local copy of the lasting database', () => {
  test('the website’s settings switch it on only with CAPREBATE_DB_LOCAL_COPY=on', async () => {
    const { lastingDatabase } = await entry();
    assert.equal(lastingDatabase(SET).localCopy, false);
    assert.equal(lastingDatabase({ ...SET, CAPREBATE_DB_LOCAL_COPY: 'on' }).localCopy, true);
    assert.equal(lastingDatabase({ ...SET, CAPREBATE_DB_LOCAL_COPY: ' ON ' }).localCopy, true);
    assert.equal(lastingDatabase({ ...SET, CAPREBATE_DB_LOCAL_COPY: 'yes' }).localCopy, false);
    assert.equal(lastingDatabase({ CAPREBATE_DB_LOCAL_COPY: 'on' }).location, ':memory:', 'it never stands in for the lasting database itself');
  });

  test('a local copy is brought up to date at every refresh, one trip each, and forgets what this click remembered', () => {
    let syncs = 0;
    const open = (): Engine => {
      const e = new DatabaseSync(':memory:') as unknown as Engine;
      return Object.assign(e, { sync: () => { syncs++; } });
    };
    const db = new Db(':memory:', { openEngine: open, localCopy: 'invented-copy.db' });
    assert.equal(db.localCopy, true);
    db.execDdl("CREATE TABLE t (id TEXT); INSERT INTO t VALUES ('a')");
    withReadMemo(() => {
      db.all('SELECT id FROM t');
      const t = db.trips;
      db.refresh();
      assert.equal(syncs, 1);
      db.all('SELECT id FROM t');
      assert.equal(db.trips - t, 2, 'the refresh and the read after it (not answered from before the refresh)');
    });
    const plain = new Db(':memory:');
    assert.equal(plain.localCopy, false);
    assert.equal(new Db(':memory:', { localCopy: 'invented-copy.db' }).localCopy, false, 'only a remote database has a local copy');
    const t = plain.trips; plain.refresh();
    assert.equal(plain.trips, t, 'without a local copy a refresh asks nothing');
  });

  test('switched on, the website opens with a local copy; if that cannot open, with the lasting database, and says so', async () => {
    const { openLasting, prepareLasting } = await entry();
    const file = join(mkdtempSync(join(tmpdir(), 'cb-fc-db-')), 'turso-stand-in.db');
    const lasting = (localCopy: boolean): Lasting => ({ location: file, authToken: 'invented-token-fc', localCopy, why: 'the records are kept in the lasting database' });
    assert.equal((await prepareLasting(createApp, seed, lasting(false), opts())).prepared, true);
    const asked: (string | undefined)[] = [];
    const working: typeof createApp = async (location, o) => {
      asked.push((o as { dbLocalCopy?: string }).dbLocalCopy);
      const { dbLocalCopy: _gone, ...rest } = o as { dbLocalCopy?: string };
      return createApp(location, rest);
    };
    const on = await openLasting(working, seed, lasting(true), opts(), 0);
    try {
      assert.equal(on.lasting, true);
      assert.match(asked[0] ?? '', /cb-copy-[^/]+\/copy\.db$/, 'the copy is a file of its own in the temporary folder');
      assert.equal(asked.length, 1);
      assert.equal(on.why, 'the records are kept in the lasting database, with a copy of it kept next to this copy of the website');
    } finally { on.made.close(); }
    asked.length = 0;
    const failing: typeof createApp = async (location, o) => {
      asked.push((o as { dbLocalCopy?: string }).dbLocalCopy);
      if ((o as { dbLocalCopy?: string }).dbLocalCopy !== undefined) throw Object.assign(new Error('sync failed at libsql://invented-fc.turso.io'), { code: 'ESYNC' });
      return createApp(location, o);
    };
    const fell = await openLasting(failing, seed, lasting(true), opts(), 0);
    try {
      assert.equal(fell.lasting, true, 'it still uses the lasting database');
      assert.equal(asked.length, 2);
      assert.equal(asked[1], undefined);
      assert.match(fell.why, /; its local copy could not be opened \(ESYNC: sync failed at \[address\]\), so every query goes to it$/);
      assert.ok(!fell.why.includes('invented-fc.turso.io'), 'the address was printed');
    } finally { fell.made.close(); }
    asked.length = 0;
    const off = await openLasting(working, seed, lasting(false), opts(), 0);
    try { assert.deepEqual(asked, [undefined]); assert.equal(off.why, 'the records are kept in the lasting database'); } finally { off.made.close(); }
  });

  test('every click refreshes the database first; a refresh that fails does not stop the click', async () => {
    const H = await startHarness('faster2');
    try {
      const db = H.made.app.db;
      let n = 0;
      db.refresh = () => { n++; };
      await H.get('sales', '/staff/tasks');
      await H.get('sales', '/staff/clients');
      assert.equal(n, 2);
      db.refresh = () => { throw new Error('sync failed'); };
      assert.equal((await H.get('sales', '/staff/tasks')).status, 200);
    } finally { H.close(); }
  });
});

/* ------------------------------------------------------------------ *
 * FASTER CLICKS 2 — "LAST SEEN" AT MOST ONCE A MINUTE, NOT TWICE A CLICK
 * ------------------------------------------------------------------ */

describe('Faster clicks 2: last seen is written at most once a minute', () => {
  test('a click writes nothing when last seen is under a minute old; once it is a minute old, one write, and Admin’s Home still says who is working', async () => {
    let now = Date.parse('2026-10-03T10:00:00.000Z');
    const made = await createApp(':memory:', { ...opts(), now: () => new Date(now).toISOString(), twoFactor: 'off' });
    try {
      const s = await seed(made.app.db, made.app.hasher, made.app.now);
      await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
      const addr = made.server.address();
      const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
      const login = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'admin@example.invalid', password: s.password }).toString() });
      const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      const db = made.app.db as unknown as { run: (...a: unknown[]) => unknown };
      const writes: string[] = [];
      const run0 = db.run.bind(made.app.db);
      db.run = (...a: unknown[]) => { writes.push(String(a[0])); return run0(...a); };
      const seen = () => made.app.db.get<{ at: string }>("SELECT max(last_seen_at) AS at FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = 'admin@example.invalid'")?.at;
      const get = (p: string) => fetch(base + p, { headers: { cookie } });
      now += 1000; assert.equal((await get('/staff/tasks')).status, 200);
      now += 30_000; assert.equal((await get('/staff/tasks')).status, 200);
      assert.deepEqual(writes.filter((w) => w.includes('last_seen_at')), [], 'last seen was written within the minute');
      const before = seen();
      now += 30_000; assert.equal((await get('/staff/tasks')).status, 200);
      assert.equal(writes.filter((w) => w.includes('last_seen_at')).length, 1, 'once a minute had passed, last seen was written once, not twice');
      assert.notEqual(seen(), before);
      assert.equal(seen(), new Date(now).toISOString());
      const home = await (await get('/staff?view=admin')).text();
      assert.match(home, /Admin User/);
    } finally { made.close(); }
  });
});
