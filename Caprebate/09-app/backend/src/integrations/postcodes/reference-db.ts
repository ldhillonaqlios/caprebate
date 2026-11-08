/**
 * THE REFERENCE DATABASE — the ONS postcode table and Ordnance Survey's OSTN15 grid, where the live website can read
 * them. Phase 161h, 7 November 2026 (the live website on Vercel; the developer question pack, D12).
 *
 * WHY A DATABASE OF ITS OWN. A Vercel function has no disk that lasts and cannot carry a 75 MB table in its bundle, so
 * the two big files that used to sit on a server's disk (CAPREBATE_POSTCODE_DB and CAPREBATE_OSTN15_FILE) live in ONE
 * read-only Turso database instead. It is built as an ordinary SQLite file on a computer each quarter, by the ingest the
 * postcode module already had plus tools/build-reference-db.ts, and uploaded whole (turso db create --from-file). It is
 * kept APART from the client database on purpose: loading 2.7 million rows into the client database over the network
 * would take hours, every nightly backup would carry 75 MB of free public data, and a quarterly refresh would write to
 * the database that holds clients' records. This one holds no personal data at all, is never backed up (it is rebuilt
 * from two free downloads) and is opened with a read-only token.
 *
 * WHERE. CAPREBATE_REFERENCE_DB_URL: a libsql:// or https:// address (with CAPREBATE_REFERENCE_DB_TOKEN), or the path of
 * the same file on this computer. Unset, nothing changes: no postcode store and no grid, exactly as before, and every
 * answer that needs them is withheld with its reason (N4).
 *
 * WHAT IT HOLDS. The tables SQLITE_SCHEMA names (postcode_authority, authority_name, table_meta), as the ingest writes
 * them, and OSTN15_SCHEMA's one table, ostn15_grid: one row per kilometre point of OSTN15, keyed by k = i + j * 701.
 */
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { sqlitePostcodeStore, type PostcodeStore, type SqliteDatabase, type SqliteOpen } from './postcode-store.ts';
import { OSTN15_POINTS, type Ostn15Grid } from '../connectors/ostn15.ts';

export type Env = Readonly<Record<string, string | undefined>>;

/** The one table this file adds to the ingest's three. Written by tools/build-reference-db.ts. */
export const OSTN15_SCHEMA = `
CREATE TABLE ostn15_grid (
  k        INTEGER PRIMARY KEY,
  e_shift  REAL NOT NULL,
  n_shift  REAL NOT NULL,
  flag     INTEGER NOT NULL
);
`;

export type ReferenceLocation =
  | { readonly kind: 'none'; readonly why: string }
  | { readonly kind: 'remote'; readonly location: string; readonly authToken: string; readonly why: string }
  | { readonly kind: 'file'; readonly location: string; readonly why: string };

const REMOTE = /^(libsql|https):\/\/[^\s/]+/;

/** Where the reference database is, from the settings. Says why in words, never the address or the token. */
export function referenceLocation(env: Env = process.env): ReferenceLocation {
  const url = (env['CAPREBATE_REFERENCE_DB_URL'] ?? '').trim();
  const token = (env['CAPREBATE_REFERENCE_DB_TOKEN'] ?? '').trim();
  if (url === '') return { kind: 'none', why: 'no reference database is set (CAPREBATE_REFERENCE_DB_URL). So there is no postcode table and no map grid' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    if (!REMOTE.test(url)) return { kind: 'none', why: 'the reference database address must start libsql:// or https://, so it was not used' };
    if (token === '') return { kind: 'none', why: 'the reference database needs its token, and none is set. So it was not used (CAPREBATE_REFERENCE_DB_TOKEN)' };
    return { kind: 'remote', location: url, authToken: token, why: 'the postcode table and the OSTN15 grid are read from the reference database' };
  }
  return { kind: 'file', location: url, why: 'the postcode table and the OSTN15 grid are read from the reference database file on this computer' };
}

/**
 * Opens the reference database READ ONLY in the shape the postcode store already reads (SqliteOpen). A remote one through
 * libsql, a file through node:sqlite. The read-only token is the control on Turso; readOnly is the control on a file.
 */
export function referenceOpener(where: ReferenceLocation): SqliteOpen | null {
  if (where.kind === 'none') return null;
  if (where.kind === 'file') return (path) => new DatabaseSync(path, { readOnly: true }) as unknown as SqliteDatabase;
  const token = where.authToken;
  return (path) => {
    const Database = createRequire(import.meta.url)('libsql') as new (p: string, o: { authToken: string }) => SqliteDatabase;
    return new Database(path, { authToken: token });
  };
}

/** The postcode store on the reference database, or null with no reference database. Throws only if it cannot be opened. */
export function referencePostcodeStore(env: Env = process.env, open?: SqliteOpen): PostcodeStore | null {
  const where = referenceLocation(env);
  const opener = open ?? referenceOpener(where);
  if (where.kind === 'none' || opener === null) return null;
  return sqlitePostcodeStore(opener, where.location);
}

type GridRow = { e_shift: number; n_shift: number; flag: number };

/**
 * OSTN15 READ FROM THE REFERENCE DATABASE, a point at a time. The conversion reads four points round the property
 * (src/integrations/connectors/ostn15.ts, etrs89ToBritishNationalGrid), so it asks for those four rows and nothing else; loading all
 * 876,951 points over the network for one conversion would take far longer than the conversion. A point the table does
 * not hold reads as NaN with flag 0: outside the grid, refused with its reason, never defaulted.
 *
 * `complete` is checked once, by counting, when the grid is first opened: a table without every point is refused whole,
 * as a file without every point is (loadOstn15File).
 */
export function ostn15GridFromDatabase(db: SqliteDatabase, source: string): Ostn15Grid {
  const n = Number((db.prepare('SELECT COUNT(*) AS n FROM ostn15_grid').get() as { n: number | bigint } | undefined)?.n ?? 0);
  if (n !== OSTN15_POINTS) throw new Error(`The reference database's OSTN15 table holds ${n} of the ${OSTN15_POINTS} grid points. It was not used.`);
  const q = db.prepare('SELECT e_shift, n_shift, flag FROM ostn15_grid WHERE k = ?');
  const seen = new Map<number, GridRow | null>();
  const row = (k: number): GridRow | null => {
    if (!seen.has(k)) seen.set(k, (q.get(k) as GridRow | undefined) ?? null);
    return seen.get(k)!;
  };
  const column = (pick: (r: GridRow) => number, missing: number): { readonly [k: number]: number } =>
    new Proxy({}, { get: (_t, p) => {
      if (typeof p !== 'string' || !/^\d+$/.test(p)) return undefined;
      const r = row(Number(p));
      return r === null ? missing : Number(pick(r));
    } }) as { readonly [k: number]: number };
  return { source, complete: true, se: column((r) => r.e_shift, Number.NaN), sn: column((r) => r.n_shift, Number.NaN), flag: column((r) => r.flag, 0) };
}

let gridCache: { key: string; grid: Ostn15Grid | null } | null = null;

/** The grid on the reference database, opened once per copy, or null with no reference database or no grid table. */
export function referenceOstn15Grid(env: Env = process.env, open?: SqliteOpen): Ostn15Grid | null {
  const where = referenceLocation(env);
  if (where.kind === 'none') return null;
  const key = `${where.kind}:${where.location}`;
  if (gridCache !== null && gridCache.key === key) return gridCache.grid;
  const opener = open ?? referenceOpener(where);
  if (opener === null) return null;
  const db = opener(where.location, { readOnly: true });
  const hasTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ostn15_grid'").get() !== undefined;
  const grid = hasTable ? ostn15GridFromDatabase(db, 'the reference database') : null;
  gridCache = { key, grid };
  return grid;
}

/** For tests. */
export function forgetReferenceGrid(): void { gridCache = null; }
