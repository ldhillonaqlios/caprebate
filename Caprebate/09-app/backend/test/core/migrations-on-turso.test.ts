/**
 * PHASE 161n1e (CARRIED FROM 161n1a), 17 NOVEMBER 2026 — A TABLE-REBUILDING MIGRATION ON A REMOTE DATABASE.
 *
 * The 16 Nov 2026 rebuild of the test website's Turso database stopped at migration 049, "FOREIGN KEY constraint
 * failed": the file's "PRAGMA foreign_keys = OFF" line went as its own request and did not hold for the body. Here a
 * stand-in for Turso does exactly that (each request starts with foreign keys on, as a new connection would; one batch
 * keeps what it sets), and proves: (1) the old way of sending it fails, as the test website did; (2) migrate() now sends
 * it as one batch and it applies, with its record; (3) on any database, a body that leaves a reference pointing at
 * nothing is never recorded as done. `tools/turso-migration-proof.ts` runs the same proof on a real Turso database.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Db, migrate, splitMigration, type Engine } from '../../src/core/db.ts';

const PARENT_AND_CHILD = `CREATE TABLE parent (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id)) STRICT;
INSERT INTO parent VALUES ('p1', 'one'), ('p2', 'two');
INSERT INTO child VALUES ('c1', 'p1'), ('c2', 'p2');
`;
/** The shape 049 has: the parent table rebuilt under the child that points at it. */
const REBUILD_PARENT = `PRAGMA foreign_keys = OFF;
BEGIN;
CREATE TABLE parent_new (id TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT) STRICT;
INSERT INTO parent_new (id, name) SELECT id, name FROM parent;
DROP TABLE parent;
ALTER TABLE parent_new RENAME TO parent;
COMMIT;
PRAGMA foreign_keys = ON;
`;
const LEAVES_A_DANGLING_CHILD = `PRAGMA foreign_keys = OFF;
BEGIN;
DELETE FROM parent WHERE id = 'p2';
COMMIT;
PRAGMA foreign_keys = ON;
`;

/** A stand-in for Turso: every request is a new connection (foreign keys on); one batch keeps its own settings. */
function tursoLike(): Engine {
  const real = new DatabaseSync(':memory:');
  const fresh = (): void => { real.exec('PRAGMA foreign_keys = ON'); };
  return {
    exec(sql: string) { fresh(); return real.exec(sql); },
    prepare(sql: string) { fresh(); return real.prepare(sql) as unknown as ReturnType<Engine['prepare']>; },
    close() { real.close(); },
  };
}

function dir(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), 'cb-161n1e-mig-'));
  for (const [n, s] of Object.entries(files)) writeFileSync(join(d, n), s);
  return d;
}

describe('161n1e · item 9: a migration that rebuilds a table, on a remote database', () => {
  test('the stand-in fails the old way, exactly as the test website did: the pragma, then the body, as separate requests', () => {
    const db = new Db('libsql://proof.example.invalid', { openEngine: tursoLike });
    migrate(db, dir({ '001-parent-and-child.sql': PARENT_AND_CHILD }));
    const parts = splitMigration('002-rebuild-parent.sql', REBUILD_PARENT);
    assert.ok(parts !== null);
    db.execDdl(parts.pre);
    assert.throws(() => db.tx(() => { db.execDdl(parts.body); }), /FOREIGN KEY constraint failed/);
    db.close();
  });

  test('migrate() sends it as one batch: it applies, with its record, the references hold, and foreign keys are back on', () => {
    const db = new Db('libsql://proof.example.invalid', { openEngine: tursoLike });
    assert.equal(db.kind, 'remote');
    const applied = migrate(db, dir({ '001-parent-and-child.sql': PARENT_AND_CHILD, '002-rebuild-parent.sql': REBUILD_PARENT }));
    assert.deepEqual(applied, ['001-parent-and-child.sql', '002-rebuild-parent.sql']);
    assert.deepEqual(db.all<{ filename: string }>('SELECT filename FROM schema_migrations ORDER BY filename').map((r) => r.filename), applied);
    assert.ok(db.all<{ name: string }>('PRAGMA table_info(parent)').some((c) => c.name === 'note'), 'rebuilt');
    assert.equal(db.all('PRAGMA foreign_key_check').length, 0);
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM child')?.n, 2);
    assert.equal(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys, 1);
    db.close();
  });

  test('on a file, a body that would leave a reference pointing at nothing is refused, and nothing from it lands', () => {
    const db = new Db(':memory:');
    const d = dir({ '001-parent-and-child.sql': PARENT_AND_CHILD, '002-leaves-a-dangling-child.sql': LEAVES_A_DANGLING_CHILD });
    assert.throws(() => migrate(db, d), /002-leaves-a-dangling-child\.sql was not run: it would leave 1 reference\(s\) pointing at nothing/);
    assert.equal(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM parent')?.n, 2, 'rolled back');
    assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM schema_migrations WHERE filename LIKE '002-%'")?.n, 0, 'not recorded');
    assert.equal(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys, 1);
    db.close();
  });

  test('on a remote database the same body stops the start, saying so', () => {
    const db = new Db('libsql://proof.example.invalid', { openEngine: tursoLike });
    assert.throws(() => migrate(db, dir({ '001-parent-and-child.sql': PARENT_AND_CHILD, '002-leaves-a-dangling-child.sql': LEAVES_A_DANGLING_CHILD })),
      /left 1 reference\(s\) pointing at nothing\. Restore the database from before this release/);
    db.close();
  });

  test('a file name that is not the usual shape is never written into the batch', () => {
    const db = new Db('libsql://proof.example.invalid', { openEngine: tursoLike });
    assert.throws(() => migrate(db, dir({ "002-x');DROP TABLE users;--.sql": REBUILD_PARENT })), /its name is not three digits/);
    db.close();
  });

  test('every real migration\'s name is the usual shape, and all still apply on a file and on the stand-in', () => {
    const migrations = join(import.meta.dirname, '..', '..', 'migrations');
    const onFile = new Db(':memory:');
    const n = migrate(onFile, migrations).length;
    assert.ok(n > 120, `${String(n)} migrations`);
    onFile.close();
    const remote = new Db('libsql://proof.example.invalid', { openEngine: tursoLike });
    assert.equal(migrate(remote, migrations).length, n, 'every migration, those that rebuild tables among them, applies the remote way');
    remote.close();
  });
});
