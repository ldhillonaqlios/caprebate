/**
 * The database handle, and the only place SQL text is executed.
 *
 * SQLite through node:sqlite — built into Node 24, so there is no server to
 * install and no dependency to vet. One adapter away from Postgres or MySQL:
 * everything below goes through `run` / `get` / `all`, and each takes SQL plus
 * a parameter array.
 *
 * NO STRING-BUILT SQL ANYWHERE. There is no interpolation helper here, on
 * purpose — there is nothing to reach for. `npm run lint:sql` greps the source
 * for a template literal or a `+` inside a prepare() call and fails the build
 * if one appears, because a rule nothing checks is a comment.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type Param = string | number | null | bigint | Uint8Array;
export type Row = Record<string, unknown>;

export class Db {
  #db: DatabaseSync;

  constructor(location = ':memory:') {
    this.#db = new DatabaseSync(location);
    // Referential integrity is not optional. SQLite defaults it OFF in some
    // builds, so it is asserted rather than assumed.
    this.#db.exec('PRAGMA foreign_keys = ON');
    this.#db.exec('PRAGMA journal_mode = WAL');
  }

  /** Schema only. Never accepts caller data — migrations and DDL exclusively. */
  execDdl(sql: string): void {
    this.#db.exec(sql);
  }

  run(sql: string, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
    const r = this.#db.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }

  get<T extends Row = Row>(sql: string, params: readonly Param[] = []): T | undefined {
    return this.#db.prepare(sql).get(...params) as T | undefined;
  }

  all<T extends Row = Row>(sql: string, params: readonly Param[] = []): T[] {
    return this.#db.prepare(sql).all(...params) as T[];
  }

  /** All-or-nothing. A partial write of an audited action is worse than none. */
  tx<T>(fn: () => T): T {
    this.#db.exec('BEGIN');
    try {
      const out = fn();
      this.#db.exec('COMMIT');
      return out;
    } catch (e) {
      this.#db.exec('ROLLBACK');
      throw e;
    }
  }

  close(): void {
    this.#db.close();
  }
}

/**
 * Migrations, applied in filename order and recorded so they run once.
 *
 * Deliberately dumb: no down-migrations, no checksums-with-auto-repair. A
 * migration that has run is recorded; a new one runs; anything else is a
 * person's decision, not a framework's.
 */
export function migrate(db: Db, dir: string): string[] {
  db.execDdl(
    'CREATE TABLE IF NOT EXISTS schema_migrations (' +
      'filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT',
  );
  const done = new Set(
    db.all<{ filename: string }>('SELECT filename FROM schema_migrations').map((r) => r.filename),
  );
  const applied: string[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    db.execDdl(readFileSync(join(dir, f), 'utf8'));
    db.run('INSERT INTO schema_migrations (filename, applied_at) VALUES (?, ?)', [
      f,
      new Date().toISOString(),
    ]);
    applied.push(f);
  }
  return applied;
}
