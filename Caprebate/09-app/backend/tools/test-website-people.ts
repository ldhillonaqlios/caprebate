/**
 * PHASE 161n1a, 16 November 2026 (ITRoadway's second review, M-07) — REAL PEOPLE OFF THE TEST WEBSITE'S DATABASE.
 *
 * The test website's database is Turso in AWS us-east-1, and until Phase 161n1a the test website sent real email, ran
 * real Didit identity checks and linked WhatsApp. So it may hold real people. This command, run on Lakhbir's Mac:
 *
 *   node tools/test-website-people.ts
 *       LISTS, reading only: how many records of each kind belong to a real person (an address that is not one of the
 *       reserved invented ones, example.invalid and the like), and every identity check and result, enquiry, received
 *       email and WhatsApp message (all of which came from outside). COUNTS ONLY: never a name, an address or a number.
 *   node tools/test-website-people.ts --delete --yes
 *       on Lakhbir's yes (and the data protection officer's OK through him), EMPTIES the test database and builds it
 *       again from the invented seed, with the invented logins locked; then writes one TEST_DATABASE_CLEARED entry to the
 *       new audit log with the counts and why. With the document store's token set, every uploaded file in it goes too.
 *
 * WHY EMPTY IT RATHER THAN PICK THE ROWS OUT. The schema has 197 tables and 494 links between them, and the identity
 * tables and the audit log refuse a delete by design (their triggers keep evidence). Picking real people out row by row
 * would mean switching those guards off on a database in another country and still risk missing a table. The test
 * database holds nothing that must be kept: its invented seed is rebuilt the same, and its logins are being replaced in
 * this phase anyway (one per tester). Emptying it is the only way to be sure nothing real is left.
 *
 *   node tools/test-website-people.ts --rebuild --yes
 *       a test database left PART BUILT (only one whose seed did not finish) is emptied and built again the same way.
 *
 * HOW IT IS BUILT AGAIN (16 Nov 2026): on this computer, then copied there (rebuild and copyDatabase below). Running the
 * migrations on Turso failed at 049, one of the eight that rebuild a table: Turso did not hold "foreign keys off".
 *
 * WHERE: the test website's database, from CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN (or Vercel's TURSO_DATABASE_URL and
 * TURSO_AUTH_TOKEN), or `--file <path>` for a copy on this computer. The document store: CAPREBATE_BLOB_TOKEN or
 * BLOB_READ_WRITE_TOKEN. Copy them from the test project's settings for the run only; never into a file in the repository.
 * IT REFUSES the live website (CAPREBATE_PRODUCTION=1) and any database without the test website's invented seed.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Db = {
  get<T = Record<string, unknown>>(sql: string, p?: readonly unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, p?: readonly unknown[]): T[];
};

/** An address nobody can receive at (src/integrations/email/email.ts, isInventedAddress): RFC 2606 and 6761 names. */
export function invented(address: unknown): boolean {
  const d = (String(address ?? '').split('@').pop() ?? '').trim().toLowerCase().replace(/\.$/, '');
  return /(^|\.)(invalid|test|example|localhost)$/.test(d) || /(^|\.)example\.(com|net|org)$/.test(d);
}

export type Count = { readonly what: string; readonly n: number | null };

/**
 * Every kind of record a real person may be in, counted. `n` is null where the table is not there (an older database).
 * Read only. A record is a real person's when its address is not an invented one; the kinds marked "every" only ever
 * come from outside the website (a check, a reply, a message), so every one is counted.
 */
export function countRealPeople(db: Db): Count[] {
  const has = (t: string): boolean => db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [t]) !== undefined;
  const real = (t: string, col: string): number | null => (has(t)
    ? db.all<{ a: unknown }>(`SELECT ${col} AS a FROM "${t}" WHERE ${col} IS NOT NULL AND trim(${col}) <> ''`).filter((r) => !invented(r.a)).length
    : null);
  const every = (t: string): number | null => (has(t) ? Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${t}"`)?.n ?? 0) : null);
  return [
    { what: 'logins at a real address', n: real('users', 'email_canonical') },
    { what: 'client companies with a real contact address', n: real('businesses', 'contact_email') },
    { what: 'contacts with a real address', n: real('contacts', 'email') },
    { what: 'client sign-ups from a real address', n: real('client_signups', 'email_canonical') },
    { what: 'enquiries from the public contact form (every one)', n: every('website_enquiries') },
    { what: 'complaint forms (every one)', n: every('complaint_forms') },
    { what: 'identity checks sent (every one)', n: every('identity_checks') },
    { what: 'identity results received (every one)', n: every('identity_check_results') },
    { what: 'people named for an identity notice (every one)', n: every('identity_persons') },
    { what: 'emails to a real address in the outbox', n: real('outbox', 'to_email') },
    { what: 'emails received in reply (every one)', n: every('inbound_email') },
    { what: 'WhatsApp messages (every one)', n: every('whatsapp_messages') },
    { what: 'WhatsApp chats added by hand (every one)', n: every('whatsapp_imports') },
    { what: 'letters signed by a real address', n: real('engagement_signatures', 'signer_email') },
    { what: 'addresses stopped after a bounce, real', n: real('email_suppressions', 'address_canonical') },
    { what: 'uploaded documents (every one; invented or not, they are files someone uploaded)', n: every('documents') },
  ];
}

export function holdsTestSeed(db: Db): boolean {
  const users = db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'") !== undefined;
  return users && db.get("SELECT id FROM users WHERE id = 'u-demo-readonly'") !== undefined;
}

export function listLines(counts: readonly Count[]): string[] {
  const total = counts.reduce((t, c) => t + (c.n ?? 0), 0);
  return [
    'Records in the test database that belong to, or came from, a real person (counts only):',
    ...counts.map((c) => `  ${String(c.n ?? 'n/a').padStart(5)}  ${c.what}`),
    `  ${String(total).padStart(5)}  in all`,
  ];
}

type Lasting = { location: string; authToken?: string };

/** Where to work: --file, else the test website's database from the settings. Null when neither is given. */
export function where(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): Lasting | null {
  const i = argv.indexOf('--file');
  if (i >= 0 && argv[i + 1] !== undefined) return { location: argv[i + 1] as string };
  const pick = (a: string, b: string): string => (env[a] ?? '').trim() || (env[b] ?? '').trim();
  const url = pick('CAPREBATE_DB_URL', 'TURSO_DATABASE_URL');
  const token = pick('CAPREBATE_DB_TOKEN', 'TURSO_AUTH_TOKEN');
  return url !== '' && token !== '' ? { location: url, authToken: token } : null;
}

/** The whole run, for the command line and the tests. Lines to print and the exit code. */
export async function run(argv: readonly string[], env: Readonly<Record<string, string | undefined>>,
  deps: Deps = {}): Promise<{ lines: string[]; code: number }> {
  if ((env['CAPREBATE_PRODUCTION'] ?? '').trim() === '1') return { lines: ['Refused: this is never run on the live website (CAPREBATE_PRODUCTION=1).'], code: 1 };
  const at = where(argv, env);
  if (at === null) return { lines: ['Say which database: set CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN (the test project\'s Turso settings) for this run, or --file <path>.'], code: 1 };
  const { Db: DbClass } = await import('../src/core/db.ts');
  const open = () => new DbClass(at.location, at.authToken === undefined ? {} : { authToken: at.authToken });
  const api = (await import(pathToFileURL(join(import.meta.dirname, '..', '..', '..', '..', 'api', 'index.mjs')).href)) as {
    emptyTestDatabase(db: unknown): { emptied: boolean; why: string };
    emptyHalfBuilt(db: unknown): { emptied: boolean; why: string };
    seedOnce(made: unknown, seed: unknown): Promise<{ complete: boolean }>;
    lockSeedLogins(db: unknown, now: () => string): number;
  };

  if (argv.includes('--rebuild')) {
    /* A test database left PART BUILT (16 Nov 2026: the first --delete emptied it, then its rebuild stopped at migration
       049 on Turso). Only a database whose seed did NOT finish: emptyHalfBuilt refuses a finished one. */
    if (!argv.includes('--yes')) return { lines: ['Not rebuilt: add --yes.'], code: 1 };
    const d0 = open();
    let e0: { emptied: boolean; why: string };
    try { e0 = api.emptyHalfBuilt(d0); } finally { d0.close(); }
    if (!e0.emptied) return { lines: [`Not rebuilt: ${e0.why}.`], code: 1 };
    return finish([], null, await rebuild(at, api, env, deps, { why: 'the test database built again after a deletion that stopped part way (Phase 161n1a, 16 Nov 2026)', counts: null }));
  }

  const db = open();
  let counts: Count[];
  try {
    if (!holdsTestSeed(db)) return { lines: ['Refused: this database does not hold the test website\'s invented seed, so it is not the test database. Nothing was read or changed. (A database left part built is rebuilt with --rebuild --yes.)'], code: 1 };
    counts = countRealPeople(db);
  } finally {
    db.close();
  }
  const lines = listLines(counts);
  const del = argv.includes('--delete');
  if (!del) return { lines: [...lines, '', 'Nothing was changed. To empty the test database and build it again from the invented seed: --delete --yes.'], code: 0 };
  if (!argv.includes('--yes')) return { lines: [...lines, '', 'Not deleted: add --yes once Lakhbir has said yes (and the data protection officer has given their OK).'], code: 1 };
  const db2 = open();
  let emptied: { emptied: boolean; why: string };
  try { emptied = api.emptyTestDatabase(db2); } finally { db2.close(); }
  if (!emptied.emptied) return { lines: [...lines, '', `Not emptied: ${emptied.why}.`], code: 1 };
  return finish(lines, counts, await rebuild(at, api, env, deps, {
    why: 'real people kept off the test website (ITRoadway second review, M-07; Phase 161n1a), on Lakhbir\'s yes',
    counts: Object.fromEntries(counts.map((c) => [c.what, c.n])) }));
}

type Deps = { blobClient?: (auth: { token?: string }) => Promise<{ list?: (p: string, c?: string) => Promise<{ objects: { pathname: string }[]; cursor: string | null }>; remove(p: string): Promise<void> }> };
type Rebuilt = { files: string; copied: CopyResult };

function finish(lines: string[], counts: Count[] | null, r: Rebuilt): { lines: string[]; code: number } {
  return { lines: [...lines, ...(lines.length ? [''] : []),
    `${counts === null ? 'Rebuilt' : 'Deleted'}: the test database was emptied and built again from the invented seed (its logins locked): ${r.copied.tables} tables, ${r.copied.rows} rows, ${r.copied.indexes} indexes and ${r.copied.triggers} triggers, checked against the copy built on this computer.`,
    `  ${r.files}.`, `  Written to the new audit log as TEST_DATABASE_CLEARED${counts === null ? '' : ', with the counts above'}.`,
    '  Next: make your own Admin login (node src/app/cli.ts first-admin ...), then one login per tester.'], code: 0 };
}

/**
 * BUILD THE TEST DATABASE HERE, THEN COPY IT THERE (16 Nov 2026). Building it on Turso ran each migration there, and the
 * eight that rebuild a table need foreign keys switched off first; on Turso that switch did not hold, and the first
 * --delete stopped at migration 049 with "FOREIGN KEY constraint failed". So the database is built on this computer
 * (where it holds), seeded, its invented logins locked and the deletion written to its audit log; then copied:
 * every table and index, then the rows (parents before children), then the triggers, so no trigger fires on a
 * copied row and no table is ever rebuilt there. The copy is checked table by table before it says it is done.
 */
async function rebuild(at: Lasting, api: { seedOnce(made: unknown, seed: unknown): Promise<{ complete: boolean }>; lockSeedLogins(db: unknown, now: () => string): number },
  env: Readonly<Record<string, string | undefined>>, deps: Deps, detail: { why: string; counts: Record<string, number | null> | null }): Promise<Rebuilt> {
  const { createApp } = await import('../src/app/server.ts');
  const { seed } = await import('../src/app/seed.ts');
  const { Db: DbClass } = await import('../src/core/db.ts');
  const local = join(mkdtempSync(join(tmpdir(), 'cb-rebuild-')), 'test.db');
  const made = await createApp(local, { documentRoot: mkdtempSync(join(tmpdir(), 'cb-clear-')) });
  let files = 'the document store was not touched (no CAPREBATE_BLOB_TOKEN or BLOB_READ_WRITE_TOKEN for this run): its files are still there';
  try {
    const s = await api.seedOnce(made, seed);
    const locked = api.lockSeedLogins(made.app.db, made.app.now);
    let filesDeleted: number | null = null;
    const token = (env['CAPREBATE_BLOB_TOKEN'] ?? '').trim() || (env['BLOB_READ_WRITE_TOKEN'] ?? '').trim();
    if (token !== '') {
      const { SHARED_PREFIX, vercelBlobClient } = await import('../src/shared/index.ts');
      const client = await (deps.blobClient ?? vercelBlobClient)({ token });
      if (client.list === undefined) files = 'the document store cannot list its files, so none were deleted';
      else {
        filesDeleted = 0;
        let cursor: string | undefined;
        for (;;) {
          const page = await client.list(SHARED_PREFIX, cursor);
          for (const o of page.objects) { await client.remove(o.pathname); filesDeleted++; }
          if (page.cursor === null) break;
          cursor = page.cursor;
        }
        files = `${filesDeleted} uploaded file${filesDeleted === 1 ? '' : 's'} deleted from the document store`;
      }
    }
    made.app.audit.append({ at: made.app.now(), kind: 'TEST_DATABASE_CLEARED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
      object_type: 'database', object_id: 'test-website',
      detail: { why: detail.why, counts: detail.counts, files_deleted: filesDeleted, seeded_again: s.complete, invented_logins_locked: locked } });
  } finally {
    made.close();
  }
  const from = new DbClass(local);
  const to = new DbClass(at.location, at.authToken === undefined ? {} : { authToken: at.authToken });
  try {
    return { files, copied: copyDatabase(from, to) };
  } finally {
    from.close(); to.close();
  }
}

type CopyDb = import('../src/core/db.ts').Db;
export type CopyResult = { tables: number; rows: number; indexes: number; triggers: number };
const q = (n: string): string => `"${n.replace(/"/g, '""')}"`;

/** Copy a built database into an EMPTY one: tables, rows (parents first), indexes, views, triggers; then check it. */
export function copyDatabase(from: CopyDb, to: CopyDb): CopyResult {
  if (to.all("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").length > 0) {
    throw new Error('the database to copy into is not empty');
  }
  const objs = from.all<{ type: string; name: string; tbl_name: string; sql: string | null }>(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY rowid");
  const tables = objs.filter((o) => o.type === 'table');
  for (const t of tables) to.execDdl(String(t.sql));
  // The indexes before the rows: a link to two columns needs its unique index there first ("foreign key mismatch").
  for (const o of objs.filter((x) => x.type === 'index')) to.execDdl(String(o.sql));
  // Parents before children (a table's own rows by rowid, which keeps a self-reference's parent first).
  const parents = new Map(tables.map((t) => [t.name, new Set(from.all<{ table: string }>(`PRAGMA foreign_key_list(${q(t.name)})`).map((f) => f.table).filter((p) => p !== t.name))]));
  const order: string[] = [];
  const left = new Set(tables.map((t) => t.name));
  while (left.size > 0) {
    const ready = [...left].filter((t) => [...(parents.get(t) ?? [])].every((p) => !left.has(p)));
    const take = ready.length > 0 ? ready : [[...left][0] as string]; // a cycle: take one; the row-by-row passes sort it
    for (const t of take) { order.push(t); left.delete(t); }
  }
  let rows = 0;
  const pending: { table: string; cols: string[]; row: unknown[] }[] = [];
  for (const t of order) {
    const cols = from.all<{ name: string; hidden: number }>(`PRAGMA table_xinfo(${q(t)})`).filter((c) => c.hidden === 0).map((c) => c.name);
    const data = from.all<Record<string, unknown>>(`SELECT ${cols.map(q).join(', ')} FROM ${q(t)} ORDER BY rowid`).map((r) => cols.map((c) => r[c]));
    const per = Math.max(1, Math.floor(400 / cols.length));
    for (let i = 0; i < data.length; i += per) {
      const chunk = data.slice(i, i + per);
      const sql = `INSERT INTO ${q(t)} (${cols.map(q).join(', ')}) VALUES ${chunk.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ')}`;
      try { to.run(sql, chunk.flat() as never[]); rows += chunk.length; } catch { for (const row of chunk) pending.push({ table: t, cols, row }); }
    }
  }
  // Rows a cycle held back, one at a time, in passes, until none is left or a pass places none.
  for (let pass = 0; pending.length > 0 && pass < 10; pass++) {
    const before = pending.length;
    for (const p of pending.splice(0)) {
      try { to.run(`INSERT INTO ${q(p.table)} (${p.cols.map(q).join(', ')}) VALUES (${p.cols.map(() => '?').join(', ')})`, p.row as never[]); rows++; } catch { pending.push(p); }
    }
    if (pending.length === before) break;
  }
  if (pending.length > 0) throw new Error(`${pending.length} rows could not be copied (first in ${pending[0]?.table})`);
  const rest = objs.filter((o) => o.type !== 'table');
  for (const kind of ['view', 'trigger']) for (const o of rest.filter((x) => x.type === kind)) to.execDdl(String(o.sql));
  // The check: the same objects, the same rows in every table, and no broken link.
  const count = (db: CopyDb, type: string): number => Number(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL", [type])?.n ?? 0);
  for (const type of ['table', 'index', 'trigger', 'view']) if (count(from, type) !== count(to, type)) throw new Error(`the copy has ${count(to, type)} ${type}s, the built database ${count(from, type)}`);
  for (const t of order) {
    const a = Number(from.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${q(t)}`)?.n ?? 0);
    const b = Number(to.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${q(t)}`)?.n ?? 0);
    if (a !== b) throw new Error(`${t}: ${b} rows copied of ${a}`);
  }
  const broken = to.all('PRAGMA foreign_key_check');
  if (broken.length > 0) throw new Error(`${broken.length} broken links after the copy`);
  return { tables: tables.length, rows, indexes: count(to, 'index'), triggers: count(to, 'trigger') };
}

if (import.meta.main) {
  const r = await run(process.argv.slice(2), process.env);
  for (const l of r.lines) console.log(l);
  process.exit(r.code);
}
