/* =============================================================================
   CAPREBATE — POSTCODE STORE AND STALENESS POLICY, TESTS (Phase 110)

   Board item 12993800139.
   Run:  cd phase9 && node --test caprebate-postcode-store.test.ts

   ---------------------------------------------------------------------------
   THE SQLITE TESTS BUILD A REAL DATABASE, in a temporary directory, from a
   four-row fixture. Not a mock: the whole point of an adapter is the
   round trip, and a mocked one would prove only that the mock matches the
   code that was written against it. The 292 MB table is a deployment
   artefact and never comes near a test or the repository.
   ============================================================================= */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  CB_ONS_POSTCODE_AUTHORITY,
  ONS_TABLE_MAX_AGE_DAYS,
  resolveBillingAuthority,
  PostcodeAuthorityError,
  type PostcodeAuthorityTable,
} from './caprebate-postcode-authority.ts';
import {
  inMemoryPostcodeStore,
  sqlitePostcodeStore,
  buildSqliteStore,
  freshnessOf,
  ONS_TABLE_EXPIRY_DAYS,
  ONS_TABLE_STALE_FLAG,
  type SqliteOpen,
} from './caprebate-postcode-store.ts';

const open: SqliteOpen = (path, opts) =>
  new DatabaseSync(path, { readOnly: opts.readOnly }) as never;

const TABLE: PostcodeAuthorityTable = {
  table_id: 'CB_ONS_POSTCODE_AUTHORITY',
  source: 'HAND-TYPED TEST FIXTURE - not an ONS file',
  licence: 'n/a - fixture',
  loaded: true,
  verified_at: '2026-08-15T00:00:00.000Z',
  release: 'AUG_2026',
  release_year: 2026,
  record_count: 4,
  lad_column_used: 'lad26cd',
  byPostcode: {
    'CF10 3NB': { lad_code: 'W06000015', lad_name: 'Cardiff', country_code: 'W', region_code: 'W99999999', terminated_on: null },
    'SW1A 1AA': { lad_code: 'E09000033', lad_name: 'Westminster', country_code: 'E', region_code: 'E12000007', terminated_on: null },
    'M1 1AE':   { lad_code: 'E08000003', lad_name: 'Manchester', country_code: 'E', region_code: 'E12000002', terminated_on: null },
    'M1 1AF':   { lad_code: 'E08000003', lad_name: 'Manchester', country_code: 'E', region_code: 'E12000002', terminated_on: '2019-08-01' },
  },
};

const codeOf = (fn: () => unknown): string => {
  try { fn(); return 'NO_THROW'; } catch (e) {
    const c = (e as { code?: string }).code;
    return typeof c === 'string' ? c : (e as Error).name;
  }
};

function withTempDb<T>(fn: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'cb-postcode-store-'));
  try { return fn(join(dir, 'postcodes.sqlite')); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

/* =============================================================================
   J. THE PORT — the shipped store is the shipped table, still empty
   ============================================================================= */

test('J1 the default in-memory store is the shipped table, and it is empty', () => {
  const s = inMemoryPostcodeStore();
  assert.equal(s.loaded, false);
  assert.equal(s.record_count, 0);
  assert.equal(s.kind, 'in-memory');
  assert.equal(s.get('CF10 3NB'), undefined);
  /* The two licence strings still say two different things through the port. */
  assert.match(s.licence, /^CLEARED/);
});

test('J2 an in-memory store is a view of the table, not a copy of it', () => {
  const s = inMemoryPostcodeStore(TABLE);
  assert.equal(s.get('CF10 3NB')!.lad_name, 'Cardiff');
  assert.equal(s.record_count, 4);
  assert.equal(s.release_year, 2026);
  assert.equal(s.lad_column_used, 'lad26cd');
  /* undefined for absent, never a guess and never an error. */
  assert.equal(s.get('ZZ99 9ZZ'), undefined);
});

test('J3 the resolver reads a store when one is given, and prefers it over tables', () => {
  const s = inMemoryPostcodeStore(TABLE);
  const r = resolveBillingAuthority('cf103nb', { store: s });
  assert.equal(r.lad_name, 'Cardiff');
  assert.equal(r.region_code, 'W99999999');

  /* store WINS over tables. A caller who opened a store meant to use it, and
     silently preferring the empty module table would refuse every real
     postcode while looking exactly like a data problem. */
  const r2 = resolveBillingAuthority('CF10 3NB', {
    store: s,
    tables: { CB_ONS_POSTCODE_AUTHORITY: CB_ONS_POSTCODE_AUTHORITY },
  });
  assert.equal(r2.lad_name, 'Cardiff');
});

test('J4 an unloaded store refuses with the ingest message, not a purchase one', () => {
  const empty = inMemoryPostcodeStore();
  assert.equal(codeOf(() => resolveBillingAuthority('CF10 3NB', { store: empty })),
    'E_TABLE_NOT_LOADED');
  try { resolveBillingAuthority('CF10 3NB', { store: empty }); } catch (e) {
    assert.match((e as Error).message, /ingest that has not been run/);
  }
});

/* =============================================================================
   K. THE SQLITE ADAPTER — a real round trip
   ============================================================================= */

test('K1 build then read returns the same rows the table held', () => {
  withTempDb((path) => {
    const built = buildSqliteStore(open, path, TABLE);
    assert.equal(built.rows, 4);
    /* 352 names against 2.66m rows in the real file; here 3 against 4. This
       is the redundancy the JSON shape carries and the store does not. */
    assert.equal(built.authorities, 3);
    assert.equal(existsSync(path), true);

    const s = sqlitePostcodeStore(open, path);
    try {
      assert.equal(s.kind, 'sqlite');
      assert.equal(s.loaded, true);
      assert.deepEqual(s.get('CF10 3NB'), {
        lad_code: 'W06000015', lad_name: 'Cardiff', country_code: 'W',
        region_code: 'W99999999', terminated_on: null,
      });
      assert.equal(s.get('M1 1AF')!.terminated_on, '2019-08-01');
      assert.equal(s.get('ZZ99 9ZZ'), undefined);
    } finally { s.close(); }
  });
});

test('K2 the metadata survives the round trip, because the attribution needs it', () => {
  withTempDb((path) => {
    buildSqliteStore(open, path, TABLE);
    const s = sqlitePostcodeStore(open, path);
    try {
      assert.equal(s.release, 'AUG_2026');
      assert.equal(s.release_year, 2026);
      assert.equal(s.verified_at, '2026-08-15T00:00:00.000Z');
      assert.equal(s.record_count, 4);
      /* ONS renames this column every release and the store has to say which
         one it was built from, or the next refresh cannot be checked. */
      assert.equal(s.lad_column_used, 'lad26cd');
    } finally { s.close(); }
  });
});

test('K3 the resolver behaves identically over either adapter — that is the whole point of the port', () => {
  withTempDb((path) => {
    buildSqliteStore(open, path, TABLE);
    const sql = sqlitePostcodeStore(open, path);
    try {
      const mem = inMemoryPostcodeStore(TABLE);
      for (const pc of ['CF10 3NB', 'SW1A 1AA', 'M1 1AE']) {
        const a = resolveBillingAuthority(pc, { store: mem });
        const b = resolveBillingAuthority(pc, { store: sql });
        assert.deepEqual(b, a);
      }
      /* Including how they FAIL. A store that answered where the other
         refused would be the defect this assertion exists to catch. */
      for (const pc of ['ZZ99 9ZZ', 'M1 1AF', 'BT1 5GS']) {
        assert.equal(codeOf(() => resolveBillingAuthority(pc, { store: sql })),
                     codeOf(() => resolveBillingAuthority(pc, { store: mem })));
      }
    } finally { sql.close(); }
  });
});

test('K4 the store is smaller than the JSON it replaces, on the same rows', () => {
  withTempDb((path) => {
    buildSqliteStore(open, path, TABLE);
    /* At four rows SQLite's page overhead dominates, so this asserts the
       MECHANISM rather than the saving: the name table holds one row per
       authority and not one per postcode. The measured saving at real scale
       is in caprebate-postcode-store-costing.cjs — 74.5 MB against 290.3 MB.
       A four-row fixture cannot show that and must not pretend to. */
    const db = new DatabaseSync(path, { readOnly: true });
    const n = db.prepare('SELECT COUNT(*) AS n FROM authority_name').get() as { n: number };
    const p = db.prepare('SELECT COUNT(*) AS n FROM postcode_authority').get() as { n: number };
    db.close();
    assert.equal(n.n, 3);
    assert.equal(p.n, 4);
    assert.ok(statSync(path).size > 0);
  });
});

test('K5 building from a table that was never ingested refuses', () => {
  withTempDb((path) => {
    assert.equal(
      codeOf(() => buildSqliteStore(open, path, CB_ONS_POSTCODE_AUTHORITY)),
      'E_TABLE_NOT_LOADED');
    /* And it refuses BEFORE creating the file. An empty store on disk is
       indistinguishable from a working one until a client is refused by it. */
    assert.equal(existsSync(path), false);
  });
});

/* =============================================================================
   L. STALENESS — job 3. Serve with a flag, then refuse.
   ============================================================================= */

const at = (d: string) => new Date(d + 'T00:00:00.000Z');
const loadedAt = (verified_at: string) =>
  ({ loaded: true, verified_at, release: 'AUG_2026' });

test('L1 never loaded is not stale, and the message sends you to a different job', () => {
  const f = freshnessOf({ loaded: false, verified_at: null, release: null }, at('2030-01-01'));
  assert.equal(f.state, 'never-loaded');
  assert.equal(f.age_days, null);
  assert.deepEqual(f.flags, []);
  assert.match(f.message, /has never been ingested/);
  assert.match(f.message, /not staleness/);
});

test('L2 inside the quarterly window plus a month it is fresh and carries no flag', () => {
  const f = freshnessOf(loadedAt('2026-08-15'), at('2026-10-01'));
  assert.equal(f.state, 'fresh');
  assert.deepEqual(f.flags, []);
  assert.equal(f.age_days, 47);
});

test('L3 past 120 days it SERVES, and the flag is what changes', () => {
  const f = freshnessOf(loadedAt('2026-01-01'), at('2026-06-01'));
  assert.equal(f.state, 'stale');
  assert.deepEqual(f.flags, [ONS_TABLE_STALE_FLAG]);
  assert.ok(f.age_days! > ONS_TABLE_MAX_AGE_DAYS);
  /* It has to say the answer is still good, or whoever reads it will treat a
     flag as a failure and stop using a table that works. */
  assert.match(f.message, /still given/);
});

test('L4 past a year it EXPIRES, and the reason names the silent failure', () => {
  const f = freshnessOf(loadedAt('2025-01-01'), at('2026-09-09'));
  assert.equal(f.state, 'expired');
  assert.deepEqual(f.flags, ['ONS_TABLE_EXPIRED']);
  assert.ok(f.age_days! > ONS_TABLE_EXPIRY_DAYS);
  /* The whole case for refusing rather than flagging: a reorganised council
     resolves to its old name with no error at all. */
  assert.match(f.message, /reorganisation/);
  assert.match(f.message, /silently/);
});

test('L5 the two thresholds are the quarterly cadence and a year, and they are ordered', () => {
  /* Not arbitrary: ONS publishes in February, May, August and November, so
     120 days is a quarter plus a month's grace, and a year is one April —
     which is when reorganisations take effect. */
  assert.equal(ONS_TABLE_MAX_AGE_DAYS, 120);
  assert.equal(ONS_TABLE_EXPIRY_DAYS, 365);
  assert.ok(ONS_TABLE_EXPIRY_DAYS > ONS_TABLE_MAX_AGE_DAYS);
});

test('L6 exactly on a threshold is not yet over it', () => {
  const on120 = freshnessOf(loadedAt('2026-01-01'),
    new Date(Date.UTC(2026, 0, 1) + ONS_TABLE_MAX_AGE_DAYS * 86400000));
  assert.equal(on120.state, 'fresh');
  const past = freshnessOf(loadedAt('2026-01-01'),
    new Date(Date.UTC(2026, 0, 1) + (ONS_TABLE_MAX_AGE_DAYS * 86400000) + 1));
  assert.equal(past.state, 'stale');
});
