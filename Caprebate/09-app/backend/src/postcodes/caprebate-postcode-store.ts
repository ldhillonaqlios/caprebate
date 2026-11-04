/**
 * Caprebate — WHERE THE POSTCODE TABLE LIVES AT RUNTIME.
 *
 * Board item 12993800139, Phase 110, 9 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE PROBLEM THIS FILE IS THE ANSWER TO
 *
 * `caprebate-postcode-authority.ts` resolves a postcode to a billing
 * authority by reading `table.byPostcode[postcode]` — a plain JavaScript
 * object holding all 2,657,599 rows. That is the only shape it has ever had,
 * and it is a shape, not a decision: the module was written before anybody
 * had run it on the real file, and the real file turned out to be 292 MB of
 * JSON built by an ingest that needed a 10 GB heap.
 *
 * A 292 MB table cannot go in the repository (md §9) and cannot be an
 * afterthought at deployment either. So this file does two things:
 *
 *   1. it puts a PORT between the resolver and the storage, so the choice can
 *      change without touching a line of the resolver;
 *   2. it implements the two adapters worth having, and records what each one
 *      actually costs — MEASURED, not asserted.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE THREE OPTIONS, AND WHAT EACH ONE COSTS
 *
 * Measured by `caprebate-postcode-store-costing.cjs`, on synthetic data at
 * the real shape and scale (2,657,599 postcodes, 352 authorities), macOS
 * arm64, node v24.20.0, 9 September 2026. RE-RUN IT RATHER THAN QUOTING IT.
 *
 *   (a) JSON IN MEMORY
 *         serialised file          290.3 MB
 *         heap held by the table   310.4 MB
 *         process resident set     630.9 MB
 *         lookup                   0.51 us
 *
 *       THE PHASE PROMPT COSTED THIS AT "~292 MB resident per process". That
 *       is the FILE size. The process actually sits at about 630 MB, because
 *       2.66 million string keys and 2.66 million small objects cost more
 *       live than serialised, and building the table churns a multiple of it
 *       again — the real ingest was run with --max-old-space-size=10240 and
 *       needed it. On a small VM this option is not "simplest", it is the
 *       one that decides how much memory the whole application must be
 *       given, per process, forever.
 *
 *   (b) A KEYED STORE — SQLite, built once, opened read-only
 *         database file            74.5 MB
 *         resident, reading        ~11 MB above baseline
 *         lookup                   7.55 us
 *
 *       Fifteen times slower per lookup and the number is still 7.55
 *       MICROseconds. This system does ONE postcode lookup per assessment,
 *       behind a form submission. Twenty-eight times less resident memory
 *       for a cost nothing in this application can perceive.
 *
 *       Most of the disk saving is not SQLite being clever. It is that
 *       2.66 million copies of 352 authority NAMES become 352 rows in a
 *       second table — a redundancy the JSON shape has and nobody noticed
 *       because nobody had measured it.
 *
 *   (c) TRIMMED TO WHAT WE SERVE
 *         kept                     2,444,991 of 2,657,599  (92.0%)
 *         serialised file          267.1 MB   — saves 23.2 MB
 *         heap held by the table   296.8 MB   — saves 13.6 MB
 *
 *       THIS ONE DOES NOT WORK AND THE MEASUREMENT IS WHY. Dropping Scotland
 *       removes 8% of the rows and 4% of the heap. It leaves option (a) at
 *       297 MB of heap against option (b)'s 11 MB. Trimming is not a
 *       storage strategy; it is a rounding error on one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RECOMMENDATION, AND THE PART OF (c) THAT IS KEPT ANYWAY
 *
 * RECOMMENDED: (b). A separate, read-only SQLite file, built by the ingest
 * and shipped as a deployment artefact.
 *
 * SEPARATE FROM THE APPLICATION DATABASE, and that is the one design point
 * worth arguing. The back end already runs node:sqlite, so "put it in the
 * back end's database" is nearly free — and wrong. This table is PUBLIC
 * REFERENCE DATA that is reproduced in full every quarter from a free
 * download. Putting it in the application database means every backup,
 * every restore and every migration carries 75 MB of data that nobody would
 * miss and anybody could rebuild, and a quarterly refresh becomes a
 * migration against live client data instead of a file swap. A refresh
 * should be: build the new file, point at it, delete the old one.
 *
 * AND (c) IS NOT REJECTED, IT IS RELOCATED. The prompt is right that a
 * Scottish postcode must refuse as OUTSIDE THE SERVED JURISDICTION rather
 * than as "not in table". That is a CORRECTNESS requirement and it is worth
 * having whatever the storage is — so it lives in the resolver, driven by
 * the served set, in `caprebate-location-key.ts`. Buying it by deleting rows
 * would have made the served set a property of a data file: flipping
 * CB_JURIS.SERVED to include Scotland — one boolean, Lakhbir's to flip —
 * would then silently require a re-ingest, and until somebody ran one every
 * Scottish client would be refused by a table that no longer meant to
 * refuse them. The decision belongs in CB_JURIS and nowhere else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE MAY NOT DO
 *
 * It may not resolve anything. Normalisation, the Northern Ireland licence
 * refusal, the terminated-postcode rule and the refusal-not-guess discipline
 * all stay in `caprebate-postcode-authority.ts`. A store answers exactly one
 * question — "what row is under this canonical postcode" — and a second
 * implementation of any rule above it is the failure the engine extraction
 * was done to prevent.
 *
 * Runs on Node >= 22.6 with type stripping. No enums, no namespaces.
 * Run:  cd phase9 && node --test caprebate-postcode-store.test.ts
 */

import type {
  PostcodeAuthorityRow,
  PostcodeAuthorityTable,
} from './caprebate-postcode-authority.ts';
import {
  CB_ONS_POSTCODE_AUTHORITY,
  ONS_TABLE_MAX_AGE_DAYS,
  PostcodeAuthorityError,
} from './caprebate-postcode-authority.ts';

/* ------------------------------------------------------------------ *
 * 1. The port
 * ------------------------------------------------------------------ */

/**
 * WHAT THE RESOLVER NEEDS FROM STORAGE, AND NOTHING ELSE.
 *
 * `get` takes a CANONICAL postcode — the resolver has already normalised it —
 * and returns the row or undefined. Undefined means "not in this table" and
 * never "outside our area", "terminated" or "we are not sure": every one of
 * those is a decision the resolver makes and this layer must not pre-empt.
 *
 * The metadata fields are not decoration. `release_year` substitutes into the
 * ONS attribution lines, so an answer cannot be produced without the thing
 * that makes it licensed; `verified_at` is what staleness is measured from;
 * and `lad_column_used` records which header the local-authority code was
 * actually read from, because ONS renames it every release.
 */
export type PostcodeStore = {
  readonly store_id: string;
  readonly kind: 'in-memory' | 'sqlite';
  readonly loaded: boolean;
  readonly source: string;
  readonly licence: string;
  readonly release: string | null;
  readonly release_year: number | null;
  readonly verified_at: string | null;
  readonly record_count: number;
  readonly lad_column_used: string | null;
  get(canonicalPostcode: string): PostcodeAuthorityRow | undefined;
  /** Release a file handle. In-memory stores do nothing and say so. */
  close(): void;
};

/* ------------------------------------------------------------------ *
 * 2. Adapter (a) — the table as a JavaScript object
 * ------------------------------------------------------------------ */

/**
 * THE SHAPE THE MODULE ALREADY HAD, NOW BEHIND THE PORT.
 *
 * Kept, and not only for backwards compatibility. It is the right adapter
 * for a test fixture, for one of the ONS per-area extracts, and for anybody
 * who wants to run the resolver with no file on disk at all — which is every
 * one of the resolver's own 38 assertions. What it is NOT right for is the
 * whole UK table in a server process; see the measurements in the header.
 */
export function inMemoryPostcodeStore(
  table: PostcodeAuthorityTable = CB_ONS_POSTCODE_AUTHORITY,
): PostcodeStore {
  return {
    store_id: table.table_id,
    kind: 'in-memory',
    loaded: table.loaded,
    source: table.source,
    licence: table.licence,
    release: table.release,
    release_year: table.release_year,
    verified_at: table.verified_at,
    record_count: table.record_count,
    lad_column_used: table.lad_column_used ?? null,
    get: (pc) => table.byPostcode[pc],
    close: () => { /* nothing to release */ },
  };
}

/* ------------------------------------------------------------------ *
 * 3. Adapter (b) — SQLite, read-only
 * ------------------------------------------------------------------ */

/** The schema the build writes and the read adapter expects. */
export const SQLITE_SCHEMA = `
CREATE TABLE postcode_authority (
  postcode      TEXT PRIMARY KEY,
  lad_code      TEXT NOT NULL,
  country_code  TEXT NOT NULL,
  region_code   TEXT,
  terminated_on TEXT
) WITHOUT ROWID;

CREATE TABLE authority_name (
  lad_code TEXT PRIMARY KEY,
  lad_name TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE table_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
) WITHOUT ROWID;
`;

/**
 * The minimum of node:sqlite this file uses, declared rather than imported as
 * a type, so nothing here depends on a particular @types package and the
 * module still type-strips on a machine that has none.
 */
export type SqliteStatement = {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
};
export type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};
/** `(path, { readOnly }) => db`. Supplied by the caller so this module has no
 *  import of its own and stays runnable where node:sqlite is unavailable. */
export type SqliteOpen = (path: string, opts: { readOnly: boolean }) => SqliteDatabase;

const META_KEYS = [
  'source', 'licence', 'release', 'release_year',
  'verified_at', 'record_count', 'lad_column_used',
] as const;

/**
 * BUILD THE FILE. Run out of band, by the same job that runs the ingest, and
 * never by the application.
 *
 * It takes the ingest's result — the shape `createNsplIngest().finish()`
 * returns — so the ingest does not need to know a store exists. The 292 MB
 * JSON is therefore optional rather than a step: a caller can stream NSPL
 * straight into this and never write the JSON at all.
 */
export function buildSqliteStore(
  open: SqliteOpen,
  path: string,
  table: PostcodeAuthorityTable,
): { rows: number; authorities: number } {
  if (!table.loaded) {
    throw new PostcodeAuthorityError(
      'E_TABLE_NOT_LOADED',
      'refusing to build a store from a table that was never ingested. An ' +
        'empty store is indistinguishable from a working one until the first ' +
        'client is refused by it.',
      { table_id: table.table_id },
    );
  }
  const db = open(path, { readOnly: false });
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
  db.exec(SQLITE_SCHEMA);

  const ins = db.prepare(
    'INSERT INTO postcode_authority (postcode, lad_code, country_code, region_code, terminated_on) VALUES (?,?,?,?,?)',
  );
  const insName = db.prepare('INSERT OR IGNORE INTO authority_name VALUES (?,?)');
  const insMeta = db.prepare('INSERT OR REPLACE INTO table_meta VALUES (?,?)');

  let rows = 0;
  const names = new Set<string>();
  db.exec('BEGIN');
  for (const pc in table.byPostcode) {
    const r = table.byPostcode[pc];
    ins.run(pc, r.lad_code, r.country_code, r.region_code ?? null, r.terminated_on);
    if (!names.has(r.lad_code)) { insName.run(r.lad_code, r.lad_name); names.add(r.lad_code); }
    rows++;
  }
  const meta: Record<string, unknown> = {
    source: table.source, licence: table.licence, release: table.release,
    release_year: table.release_year, verified_at: table.verified_at,
    record_count: rows, lad_column_used: table.lad_column_used ?? null,
  };
  for (const k of META_KEYS) insMeta.run(k, meta[k] === null || meta[k] === undefined ? null : String(meta[k]));
  db.exec('COMMIT');
  db.close();
  return { rows, authorities: names.size };
}

/**
 * OPEN THE FILE READ-ONLY, and read-only is the control rather than a hint.
 * The application has no business writing to a table it can rebuild from a
 * free download, and a process that cannot write cannot corrupt the copy the
 * next process will open.
 */
export function sqlitePostcodeStore(open: SqliteOpen, path: string): PostcodeStore {
  const db = open(path, { readOnly: true });
  const metaRows = db.prepare('SELECT key, value FROM table_meta').all() as
    { key: string; value: string | null }[];
  const meta: Record<string, string | null> = {};
  for (const r of metaRows) meta[r.key] = r.value;

  const q = db.prepare(
    `SELECT p.lad_code, a.lad_name, p.country_code, p.region_code, p.terminated_on
       FROM postcode_authority p
       JOIN authority_name a USING (lad_code)
      WHERE p.postcode = ?`,
  );

  const num = (k: string): number | null => {
    const v = meta[k];
    return v === null || v === undefined || v === '' ? null : Number(v);
  };

  return {
    store_id: CB_ONS_POSTCODE_AUTHORITY.table_id,
    kind: 'sqlite',
    loaded: true,
    source: meta.source ?? CB_ONS_POSTCODE_AUTHORITY.source,
    licence: meta.licence ?? CB_ONS_POSTCODE_AUTHORITY.licence,
    release: meta.release ?? null,
    release_year: num('release_year'),
    verified_at: meta.verified_at ?? null,
    record_count: num('record_count') ?? 0,
    lad_column_used: meta.lad_column_used ?? null,
    get: (pc) => {
      const row = q.get(pc) as {
        lad_code: string; lad_name: string; country_code: string;
        region_code: string | null; terminated_on: string | null;
      } | undefined;
      if (row === undefined) return undefined;
      return {
        lad_code: row.lad_code,
        lad_name: row.lad_name,
        country_code: row.country_code,
        region_code: row.region_code,
        terminated_on: row.terminated_on,
      };
    },
    close: () => db.close(),
  };
}

/* ------------------------------------------------------------------ *
 * 4. Staleness — what an out-of-date table DOES
 * ------------------------------------------------------------------ */

/**
 * JOB 3. `tableIsStale()` has existed since 8 September and NOTHING READ IT.
 * A staleness report nobody consumes is a comment with a return type.
 *
 * WHAT GOING STALE ACTUALLY BREAKS, because the answer decides the policy.
 * ONS publishes quarterly and two different things drift:
 *
 *   NEW POSTCODES ARE MISSING. A property on a postcode created since the
 *   last refresh is absent, and the resolver already refuses that correctly
 *   and loudly — E_POSTCODE_NOT_IN_TABLE. Age makes this MORE COMMON; it does
 *   not make it wrong. Nothing needs to change for it.
 *
 *   A REORGANISED COUNCIL RESOLVES TO ITS OLD NAME. This one is silent. Local
 *   government reorganisation takes effect on 1 April, districts merge into
 *   unitaries, and a table from before the change returns an authority that
 *   no longer exists — with no error, in a surveyor's report, looking exactly
 *   like an answer. THIS is the failure staleness has to be about.
 *
 * SO: SERVE WITH A FLAG, THEN REFUSE. Two thresholds, not one.
 *
 *   FRESH     under 120 days. A quarter plus a month's grace.
 *   STALE     120 to 365 days. The answer is still given and it is still
 *             almost always right — but it carries ONS_TABLE_STALE in the
 *             same `flags` array the terminated-postcode flag uses, so it
 *             travels with the answer into whatever consumes it, exactly as
 *             the attribution lines do. Refusing here would take a system
 *             that works and stop it because a calendar passed, which is a
 *             worse failure than the one it prevents.
 *   EXPIRED   over 365 days. REFUSE. A table more than a year old has been
 *             through an April, therefore through any reorganisation that
 *             happened in the meantime, and it cannot be assumed to name a
 *             council that still exists. A year is also long enough that
 *             nobody can present the refresh as having been overlooked.
 *
 * NEVER-LOADED IS NOT STALE. An empty table refuses with
 * E_TABLE_NOT_LOADED and that message says an ingest has not been run, which
 * is a different job for a different person. Conflating the two would send
 * whoever reads it to the wrong procedure.
 */
export const ONS_TABLE_EXPIRY_DAYS = 365;

export type Freshness = {
  readonly state: 'never-loaded' | 'fresh' | 'stale' | 'expired';
  readonly age_days: number | null;
  readonly verified_at: string | null;
  readonly release: string | null;
  /** Empty when fresh. Carried into BillingAuthority.flags otherwise. */
  readonly flags: readonly string[];
  /** Plain English, for a screen and for the refresh procedure's escalation. */
  readonly message: string;
};

export const ONS_TABLE_STALE_FLAG = 'ONS_TABLE_STALE';

export function freshnessOf(
  store: Pick<PostcodeStore, 'loaded' | 'verified_at' | 'release'>,
  asAt: Date,
): Freshness {
  if (!store.loaded || store.verified_at === null) {
    return {
      state: 'never-loaded', age_days: null, verified_at: null,
      release: store.release ?? null, flags: [],
      message:
        'the ONS postcode table has never been ingested. This is not staleness — ' +
        'nothing has gone out of date, an ingest has not been run. See the ONS ' +
        'postcode table refresh procedure.',
    };
  }
  const age = (asAt.getTime() - new Date(store.verified_at).getTime()) / 86400000;
  const days = Math.floor(age);
  if (age > ONS_TABLE_EXPIRY_DAYS) {
    return {
      state: 'expired', age_days: days, verified_at: store.verified_at,
      release: store.release ?? null, flags: ['ONS_TABLE_EXPIRED'],
      message:
        `the ONS postcode table was built from release ${store.release ?? 'unknown'} and ` +
        `verified ${days} days ago, which is more than ${ONS_TABLE_EXPIRY_DAYS}. Local ` +
        'government reorganisations take effect each April, so a table this old may ' +
        'name a council that no longer exists — and it would do so silently, in a ' +
        'report. Refusing until it is refreshed. ONS publishes quarterly and the ' +
        'download is free.',
    };
  }
  if (age > ONS_TABLE_MAX_AGE_DAYS) {
    return {
      state: 'stale', age_days: days, verified_at: store.verified_at,
      release: store.release ?? null, flags: [ONS_TABLE_STALE_FLAG],
      message:
        `the ONS postcode table is ${days} days old (release ${store.release ?? 'unknown'}); ` +
        `ONS publishes quarterly and this one is past ${ONS_TABLE_MAX_AGE_DAYS} days. The ` +
        'answer is still given and is still almost certainly right; it is flagged so ' +
        'that whoever relies on it knows the table is due a refresh.',
    };
  }
  return {
    state: 'fresh', age_days: days, verified_at: store.verified_at,
    release: store.release ?? null, flags: [],
    message: `the ONS postcode table is ${days} days old (release ${store.release ?? 'unknown'}).`,
  };
}
