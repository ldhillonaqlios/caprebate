/**
 * 1 OCTOBER 2026 — A CONNECTION TURSO DROPPED IS OPENED AGAIN (src/db.ts, droppedConnection).
 *
 * The test website's build stopped part way through refilling its lasting database, every time, with Turso's
 * "stream not found" — so the database stayed half filled, every copy of the website ran on its own memory, and replies
 * never met the emails they answered. A local libsql file stands in for Turso here, and an engine that drops its
 * connection on the calls chosen stands in for the network. Nothing reaches Turso.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Db, droppedConnection, type Engine } from '../src/db.ts';

const DROPPED = 'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: b66b9865:5418346\\"}"))';

describe('a dropped connection', () => {
  test('is known by Turso’s words, and nothing else is', () => {
    assert.equal(droppedConnection(new Error(DROPPED)), true);
    assert.equal(droppedConnection(new Error('UNIQUE constraint failed: users.email')), false);
    assert.equal(droppedConnection(new Error('no such table: outbox')), false);
  });

  test('a call that meets one opens the connection again and is made once more; the write lands once', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cb-drop-')), 'db.sqlite');
    const Database = createRequire(import.meta.url)('libsql') as new (path: string) => Engine;
    let opened = 0;
    // Call 1 makes the table; the connection drops on call 2, the insert.
    const db = new Db(':memory:', { openEngine: flakyOn(() => { opened++; return new Database(file); }, [2]), engine: 'libsql' });
    db.execDdl('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
    db.run('INSERT INTO t (v) VALUES (?)', ['once']);
    assert.equal(opened, 2, 'the connection was not opened again');
    assert.deepEqual(db.all('SELECT v FROM t').map((r) => ({ ...r })), [{ v: 'once' }]);
    db.close();
  });

  test('a transaction that meets one is begun again from the start, and is kept once; a second drop is not hidden', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cb-drop-tx-')), 'db.sqlite');
    const Database = createRequire(import.meta.url)('libsql') as new (path: string) => Engine;
    let armed = false, opened = 0;
    const open = (): Engine => {
      opened++;
      const real = new Database(file);
      return {
        exec: (sql) => real.exec(sql),
        prepare: (sql) => { const st = real.prepare(sql); return { run: (...p) => { if (armed) { armed = false; throw new Error(DROPPED); } return st.run(...p); }, get: (...p) => st.get(...p), all: (...p) => st.all(...p) }; },
        close: () => real.close(),
      };
    };
    const db = new Db(':memory:', { openEngine: open, engine: 'libsql' });
    db.execDdl('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
    let runs = 0;
    db.tx(() => {
      runs++;
      db.run('INSERT INTO t (v) VALUES (?)', ['first']);
      if (runs === 1) armed = true; // the connection drops on the next write, inside the transaction
      db.run('INSERT INTO t (v) VALUES (?)', ['second']);
    });
    assert.equal(runs, 2, 'the transaction was not begun again');
    assert.equal(opened, 2, 'the connection was not opened again');
    assert.deepEqual(db.all('SELECT v FROM t ORDER BY id').map((r) => ({ ...r })), [{ v: 'first' }, { v: 'second' }], 'the transaction was kept twice, or in part');
    // Dropped again on the retry: said, not hidden.
    assert.throws(() => db.tx(() => { armed = true; db.run('INSERT INTO t (v) VALUES (?)', ['x']); armed = true; db.run('INSERT INTO t (v) VALUES (?)', ['y']); }), /stream not found/);
    db.close();
  });

  test('a file or memory database never retries: an error is the error', () => {
    const db = new Db(':memory:');
    assert.throws(() => db.run('INSERT INTO nowhere (v) VALUES (1)'), /no such table/);
    db.close();
  });
});

/** An engine factory whose connection drops on the given call numbers of its first opening only. */
function flakyOn(open: () => Engine, drops: number[]): () => Engine {
  let first = true;
  return () => {
    const real = open();
    if (!first) return real;
    first = false;
    let n = 0;
    const left = new Set(drops.map((d) => d + 2)); // after the two PRAGMAs the Db sends when it opens
    const hit = (): void => { n++; if (left.has(n)) { left.delete(n); throw new Error(DROPPED); } };
    return {
      exec: (sql) => { hit(); return real.exec(sql); },
      prepare: (sql) => { const st = real.prepare(sql); return { run: (...p) => { hit(); return st.run(...p); }, get: (...p) => { hit(); return st.get(...p); }, all: (...p) => { hit(); return st.all(...p); } }; },
      close: () => real.close(),
    };
  };
}
