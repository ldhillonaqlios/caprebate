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
import { createRequire } from 'node:module';
import { join } from 'node:path';

export type Param = string | number | null | bigint | Uint8Array;
export type Row = Record<string, unknown>;

/**
 * PHASE 151e (line 4), 27 September 2026 — WHERE THE DATABASE IS, AS THE SERVER ITSELF KNOWS IT.
 *
 *   memory   ':memory:' — this process only. Gone when the process ends, and never seen by a second copy of it. The
 *            test website runs this way until a lasting database is set (api/index.mjs), and a page that must warn
 *            about it reads `kind` here: never a setting and never a flag a page sends.
 *   file     a SQLite file on this machine: lasts, but only this machine reaches it.
 *   remote   a libSQL database reached over the network (Turso, a native Vercel Marketplace integration), by a
 *            libsql:// or https:// address and a token. Every copy of the server reaches the same one.
 *
 * WHY libSQL AND NOT POSTGRES. Everything in this back end calls run / get / all and gets its answer back at once. The
 * `libsql` package answers the same way (better-sqlite3's API, synchronous, the same SQL dialect, STRICT tables
 * included), so nothing above this class changes. A Postgres driver answers later (a promise), and would change
 * every one of those calls. The package is loaded only when it is asked for, so memory and file never touch it.
 */
export type DbKind = 'memory' | 'file' | 'remote';
/** PHASE 151i: how long a handle on a file waits for another handle's write lock. */
export const BUSY_TIMEOUT_MS = 5000;
export type DbOptions = {
  /** The remote database's token. Read from the website's settings or the key file by the caller, never from here. */
  readonly authToken?: string;
  /** Tests only: open a memory or file database through libsql instead of node:sqlite, to prove the two agree. */
  readonly engine?: 'node:sqlite' | 'libsql';
};

/** The addresses that mean a remote libSQL database. Plain http:// is refused: a token never travels unencrypted. */
const REMOTE_ADDRESS = /^(libsql|https):\/\/[^\s/]+/;

type Statement = {
  run(...p: Param[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...p: Param[]): unknown;
  all(...p: Param[]): unknown[];
};
type Engine = { exec(sql: string): unknown; prepare(sql: string): Statement; close(): void };

function openLibsql(location: string, authToken: string | undefined): Engine {
  const Database = createRequire(import.meta.url)('libsql') as new (path: string, opts?: { authToken?: string }) => Engine;
  return authToken === undefined ? new Database(location) : new Database(location, { authToken });
}

/**
 * A libsql row made to read as node:sqlite's does, which is what every caller and test was written against. Proved by
 * running the whole back end's suite on libsql (Phase 151e): the two differences found are both here.
 *   - libsql adds a `_metadata` field (the query's duration) to each row. It is not a column, and it is dropped.
 *   - libsql gives a BLOB as an ArrayBuffer; node:sqlite gives a Uint8Array. It is given as a Uint8Array.
 */
function asNodeSqliteRow<T extends Row>(r: T): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === '_metadata') continue;
    out[k] = v instanceof ArrayBuffer ? new Uint8Array(v) : v;
  }
  return out as T;
}

export function dbKind(location: string): DbKind {
  if (location === ':memory:') return 'memory';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(location)) {
    if (REMOTE_ADDRESS.test(location)) return 'remote';
    throw new Error('A remote database address must start libsql:// or https://.');
  }
  return 'file';
}

export class Db {
  #db: Engine;
  /** Where this database is. Read it; never infer it from anything a request carries. */
  readonly kind: DbKind;
  /** Which library answers: node:sqlite, built into Node, or libsql (always, for a remote database). */
  readonly engine: 'node:sqlite' | 'libsql';

  constructor(location = ':memory:', opts: DbOptions = {}) {
    this.kind = dbKind(location);
    this.engine = this.kind === 'remote' || opts.engine === 'libsql' ? 'libsql' : 'node:sqlite';
    if (this.kind === 'remote') {
      const token = (opts.authToken ?? '').trim();
      if (token === '') throw new Error('A remote database needs its token.');
      this.#db = openLibsql(location, token);
    } else {
      this.#db = this.engine === 'libsql' ? openLibsql(location, undefined) : new DatabaseSync(location) as unknown as Engine;
    }
    // Referential integrity is not optional. SQLite defaults it OFF in some
    // builds, so it is asserted rather than assumed.
    this.#db.exec('PRAGMA foreign_keys = ON');
    // A remote database keeps its own journal; the setting is this machine's only.
    if (this.kind !== 'remote') this.#db.exec('PRAGMA journal_mode = WAL');
    // PHASE 151i: a second handle on the same file waits this long for another's write lock, rather than failing at
    // once. A remote database's server does its own waiting.
    if (this.kind === 'file') this.#db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
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
    const r = this.#db.prepare(sql).get(...params) as T | undefined;
    return r === undefined || this.engine === 'node:sqlite' ? r : asNodeSqliteRow(r);
  }

  all<T extends Row = Row>(sql: string, params: readonly Param[] = []): T[] {
    const rows = this.#db.prepare(sql).all(...params) as T[];
    return this.engine === 'node:sqlite' ? rows : rows.map(asNodeSqliteRow);
  }

  /**
   * All-or-nothing. A partial write of an audited action is worse than none.
   *
   * PHASE 151i, 28 September 2026: IMMEDIATE, so the write lock is taken FIRST. With a plain BEGIN, a transaction
   * that read the audit chain's end and then wrote could meet a row another copy of the server had added in between
   * (the test website's copies share one database since Phase 151e): on a file its write fails, and the whole
   * audited action is lost. Holding the lock from the start, every other writer waits until this one commits, and
   * reads what it wrote. libSQL's own client asks for a write transaction the same way.
   */
  tx<T>(fn: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
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
