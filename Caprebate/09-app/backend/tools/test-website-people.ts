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
  deps: { blobClient?: (auth: { token?: string }) => Promise<{ list?: (p: string, c?: string) => Promise<{ objects: { pathname: string }[]; cursor: string | null }>; remove(p: string): Promise<void> }> } = {}): Promise<{ lines: string[]; code: number }> {
  if ((env['CAPREBATE_PRODUCTION'] ?? '').trim() === '1') return { lines: ['Refused: this is never run on the live website (CAPREBATE_PRODUCTION=1).'], code: 1 };
  const at = where(argv, env);
  if (at === null) return { lines: ['Say which database: set CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN (the test project\'s Turso settings) for this run, or --file <path>.'], code: 1 };
  const { Db: DbClass } = await import('../src/core/db.ts');
  const db = new DbClass(at.location, at.authToken === undefined ? {} : { authToken: at.authToken });
  let counts: Count[];
  try {
    if (!holdsTestSeed(db)) return { lines: ['Refused: this database does not hold the test website\'s invented seed, so it is not the test database. Nothing was read or changed.'], code: 1 };
    counts = countRealPeople(db);
  } finally {
    db.close();
  }
  const lines = listLines(counts);
  const del = argv.includes('--delete');
  if (!del) return { lines: [...lines, '', 'Nothing was changed. To empty the test database and build it again from the invented seed: --delete --yes.'], code: 0 };
  if (!argv.includes('--yes')) return { lines: [...lines, '', 'Not deleted: add --yes once Lakhbir has said yes (and the data protection officer has given their OK).'], code: 1 };

  const api = (await import(pathToFileURL(join(import.meta.dirname, '..', '..', '..', '..', 'api', 'index.mjs')).href)) as {
    emptyTestDatabase(db: unknown): { emptied: boolean; why: string };
    seedOnce(made: unknown, seed: unknown): Promise<{ complete: boolean }>;
    lockSeedLogins(db: unknown, now: () => string): number;
  };
  const db2 = new DbClass(at.location, at.authToken === undefined ? {} : { authToken: at.authToken });
  let emptied: { emptied: boolean; why: string };
  try { emptied = api.emptyTestDatabase(db2); } finally { db2.close(); }
  if (!emptied.emptied) return { lines: [...lines, '', `Not emptied: ${emptied.why}.`], code: 1 };

  const { createApp } = await import('../src/app/server.ts');
  const { seed } = await import('../src/app/seed.ts');
  const made = await createApp(at.location, { documentRoot: mkdtempSync(join(tmpdir(), 'cb-clear-')), ...(at.authToken === undefined ? {} : { dbAuthToken: at.authToken }) });
  let files = 'the document store was not touched (no CAPREBATE_BLOB_TOKEN or BLOB_READ_WRITE_TOKEN for this run): its files are still there';
  let filesDeleted: number | null = null;
  try {
    const s = await api.seedOnce(made, seed);
    const locked = api.lockSeedLogins(made.app.db, made.app.now);
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
      detail: { why: 'real people kept off the test website (ITRoadway second review, M-07; Phase 161n1a), on Lakhbir\'s yes',
        counts: Object.fromEntries(counts.map((c) => [c.what, c.n])), files_deleted: filesDeleted, seeded_again: s.complete, invented_logins_locked: locked } });
    return { lines: [...lines, '', 'Deleted: the test database was emptied and built again from the invented seed (its logins locked).',
      `  ${files}.`, '  Written to the new audit log as TEST_DATABASE_CLEARED, with the counts above.',
      '  Next: make your own Admin login again (node src/app/cli.ts first-admin ...), then one login per tester.'], code: 0 };
  } finally {
    made.close();
  }
}

if (import.meta.main) {
  const r = await run(process.argv.slice(2), process.env);
  for (const l of r.lines) console.log(l);
  process.exit(r.code);
}
