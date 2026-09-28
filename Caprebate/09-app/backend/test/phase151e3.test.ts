/**
 * PHASE 151e, lines 4 and 5, 27 September 2026 — A CHECK AND ITS RESULT ON ONE DATABASE, AND THE EMPTY IDENTITY PANEL.
 *
 * THE FAULT. The test website builds the application on a database in memory, and every copy of it (a cold start, or
 * a second copy Vercel starts beside the first) has its own. Lakhbir's own check on 25 September 2026 showed Passed
 * only because the copy that sent it also received the result. A result that reaches another copy finds no check, and
 * is refused: rightly, because a result is never matched to the nearest check.
 *
 * WHAT IS BUILT, AND PROVED HERE, every connector on recorded answers, every result INVENTED and signed with an
 * invented secret, and no network:
 *   4a  one database for every copy: two copies of the application on ONE database, the check sent from the first
 *       and the signed result posted to /hooks/identity-check on the second - a 200 and a row. On node:sqlite and on
 *       libsql, the library that reaches the lasting database (Turso) Lakhbir is asked to open. The test website uses
 *       it only when its address, its token and the test password are all in its settings (api/index.mjs), and seeds
 *       it only when it is empty.
 *   4b  on a database in memory the identity panel says so, and so does the refusal of a result that finds no check,
 *       with what to do: send it again. The words come from the database the server opened, never from a page.
 *       On two memories the result is still REFUSED, audited, and nothing is written.
 *   5   a client with no contacts: the panel says to add the person as a contact first, with a link to that form.
 */
/* PHASE 151j: this file tests other things through a password sign-in, so it builds the application with
   twoFactor: 'off'. The second step itself is proved in test/phase151j.test.ts, on the default (staff must). */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/server.ts';
import { seed } from '../src/seed.ts';
import type { Actor } from '../src/authz.ts';
import { Db, dbKind } from '../src/db.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { IDENTITY_CHECK, IDENTITY_SESSION_ENDPOINT, type IdentityCheckConfig } from '../src/connectors/identity-check.ts';

/**
 * A CLIENT WITH NO CONTACT, INVENTED FOR THE TEST. Since Phase 151e line 7 every seeded client has a contact, so the
 * state a real client can still be in (one made before line 6, say) is made here, the way the seed writes a client.
 */
function bareClient(db: Pick<import('../src/db.ts').Db, 'run'>): { id: string } {
  const id = `b-bare-${Math.random().toString(36).slice(2)}`;
  db.run('INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, 'Invented Bare Client Limited', 'care_homes', 'ASSESSMENT_SUBMITTED', null, null, '2026-09-28T09:00:00.000Z']);
  return { id };
}

import {
  FORGETFUL_DATABASE_WORDS, FORGOTTEN_CHECK_WORDS, IDENTITY_HOOK_PATH, IDENTITY_SIGNATURE_HEADERS, NO_CONTACTS_WORDS,
  identityChecks, identityPanel, sendIdentityCheck,
} from '../src/web/identity-checks.ts';

const NOW = '2026-09-27T10:00:00.000Z';
const KEYS = { DIDIT_API_KEY: 'test-didit-key-not-real-151e3', DIDIT_WEBHOOK_SECRET: 'test-didit-secret-not-real-151e3', DIDIT_WORKFLOW_ID: '11111111-2222-3333-4444-151e30000000' };
const ON: IdentityCheckConfig = Object.freeze({ ...IDENTITY_CHECK, enabled: true, named_in_privacy_notice: true, named_in_engagement_letter: true, papers_waived_for_testing: false, waiver_record: null });
const SESSION = 'a1b2c3d4-0000-4000-8000-151e30000001';
const SESSION_OK: Fixture = {
  status: 201,
  body: JSON.stringify({ session_id: SESSION, session_number: 3, session_token: 'INVENTED151E3', url: 'https://verify.didit.me/en/session/INVENTED151E3', status: 'Not Started' }),
};
/* An invented, signed result, shaped as Didit sends one (the fields Phase 151b's tests use). */
const decision = (status: string, check_ref: string, session = SESSION) => JSON.stringify({
  event_id: 'e0000000-0000-4000-8000-151e30000001', webhook_type: 'status.updated', environment: 'sandbox',
  session_id: session, status, vendor_data: check_ref, created_at: 1790503200, timestamp: 1790503200,
  decision: { id_verifications: [{ node_id: 'n1', status: 'Approved', document_type: 'Passport', issuing_state: 'GBR' }] },
});
const signed = (body: string, secret = KEYS.DIDIT_WEBHOOK_SECRET) => ({
  'content-type': 'application/json',
  [IDENTITY_SIGNATURE_HEADERS.raw]: createHmac('sha256', secret).update(body, 'utf8').digest('hex'),
  [IDENTITY_SIGNATURE_HEADERS.timestamp]: String(Date.parse(NOW) / 1000),
});

type Made = Awaited<ReturnType<typeof createApp>>;
type Copy = { made: Made; base: string; post: (body: string, headers: Record<string, string>) => Promise<{ status: number; body: string }>; get: (path: string) => Promise<{ status: number; body: string }> };

/** One copy of the application - what one Vercel instance is - listening, with recorded answers and invented keys. */
async function copy(location: string, opts: { engine?: 'node:sqlite' | 'libsql' } = {}): Promise<Copy> {
  const made = await createApp(location, { twoFactor: 'off',
    documentRoot: mkdtempSync(join(tmpdir(), 'cb-151e3-')), now: () => NOW, sealKey: randomBytes(32),
    ...(opts.engine === undefined ? {} : { dbEngine: opts.engine }),
  });
  made.app.outside = fixtureTransport({ [`POST ${IDENTITY_SESSION_ENDPOINT}`]: SESSION_OK });
  made.app.secrets = secretsFromValues(KEYS);
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  const base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}) => {
    const headers = { ...(init.headers as Record<string, string> | undefined), ...(cookie === '' ? {} : { cookie }) };
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
    const set = r.headers.getSetCookie();
    if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
    return { status: r.status, body: await r.text() };
  };
  return {
    made, base,
    post: (body, headers) => req(IDENTITY_HOOK_PATH, { method: 'POST', headers, body }),
    get: async (path) => {
      if (cookie === '') {
        const r = await req('/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: 'admin@example.invalid', password: 'change-this-seed-password' }).toString() });
        assert.equal(r.status, 303, 'admin could not sign in');
      }
      return req(path);
    },
  };
}
const adminOf = (db: Db) => ({ id: db.get<{ id: string }>("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1")!.id, role: 'ADMIN', business_id: null, disabled: false } as Actor);
const aContact = (db: Db) => db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM contacts ORDER BY id LIMIT 1')!;
const refusals = (db: Db) => db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'IDENTITY_RESULT_REFUSED' ORDER BY seq");
const close = (c: Copy) => { c.made.server.close(); c.made.close(); };

/** Copy A sends a check (recorded answer, no network) for a seeded contact. */
async function sendFrom(a: Copy, id: string) {
  const c = aContact(a.made.app.db);
  const r = await sendIdentityCheck({ app: a.made.app, newId: () => id }, adminOf(a.made.app.db),
    { business_id: c.business_id, contact_id: c.id, cdd_check_id: null, first_name: 'Invented', last_name: 'Person' }, { config: ON });
  assert.equal(r.ok, true, r.ok ? '' : r.why);
  return c;
}

/* ================================================================== 4a · ONE DATABASE FOR EVERY COPY */

describe('151e line 4a · a check sent from one copy, and its signed result received by another, on ONE database', () => {
  for (const engine of ['node:sqlite', 'libsql'] as const) {
    test(`${engine}: copy B takes the result for copy A's check - a 200, the row, and the panel on copy A reads Passed`, async () => {
      const file = join(mkdtempSync(join(tmpdir(), 'cb-151e3-db-')), 'one.db');
      const a = await copy(file, { engine });
      await seed(a.made.app.db, a.made.app.hasher, a.made.app.now);
      const b = await copy(file, { engine });
      try {
        assert.equal(a.made.app.db.engine, engine, 'the copy did not open the database through the library asked for');
        assert.equal(b.made.app.db.kind, 'file');
        const c = await sendFrom(a, 'idc-151e3-one');
        const body = decision('Approved', 'idc-151e3-one');
        const r = await b.post(body, signed(body));
        assert.equal(r.status, 200, r.body);
        assert.equal(b.made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM identity_check_results WHERE identity_check_id = 'idc-151e3-one' AND outcome = 'PASS'")?.n, 1);
        assert.equal(identityChecks(a.made.app.db, { business_id: c.business_id })[0]?.outcome_words, 'Passed', 'copy A does not see what copy B kept');
        // and a signed result for a check nobody sent is still refused on the shared database, with no memory note
        const stray = decision('Approved', 'idc-never-sent', 'a1b2c3d4-0000-4000-8000-151e3000ffff');
        const s = await b.post(stray, signed(stray));
        assert.equal(s.status, 404);
        assert.equal(s.body, 'refused');
        assert.doesNotMatch(refusals(b.made.app.db).at(-1)!.detail, /in memory/);
      } finally { close(b); close(a); }
    });
  }

  test('libsql runs every migration and the whole seed, as node:sqlite does: the same tables, and the same counts', async () => {
    const counts = async (engine: 'node:sqlite' | 'libsql') => {
      const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-151e3-')), now: () => NOW, sealKey: randomBytes(32), dbEngine: engine });
      try {
        await seed(made.app.db, made.app.hasher, made.app.now);
        const tables = made.app.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name);
        // table names cannot be parameters, and SQL is never built from text (npm run lint:sql): a fixed list of literal counts
        const COUNTS = [
          'SELECT COUNT(*) AS n FROM users', 'SELECT COUNT(*) AS n FROM businesses', 'SELECT COUNT(*) AS n FROM contacts',
          'SELECT COUNT(*) AS n FROM properties', 'SELECT COUNT(*) AS n FROM claims', 'SELECT COUNT(*) AS n FROM leads',
          'SELECT COUNT(*) AS n FROM audit_log',
          'SELECT COUNT(*) AS n FROM schema_migrations',
        ] as const;
        return { engine: made.app.db.engine, tables, rows: COUNTS.map((q) => [q, made.app.db.get<{ n: number }>(q)?.n]) };
      } finally { made.close(); }
    };
    const node = await counts('node:sqlite');
    const lib = await counts('libsql');
    assert.equal(node.engine, 'node:sqlite');
    assert.equal(lib.engine, 'libsql');
    assert.ok(node.tables.includes('identity_checks'));
    assert.deepEqual(lib.tables, node.tables);
    assert.deepEqual(lib.rows, node.rows);
    assert.ok(node.rows.every(([, n]) => typeof n === 'number' && n > 0), 'a count read nothing - the comparison proves nothing');
  });

  test('a libsql row reads as a node:sqlite row: no _metadata field, and bytes as a Uint8Array (the two differences the whole suite found)', () => {
    for (const engine of ['node:sqlite', 'libsql'] as const) {
      const db = new Db(':memory:', { engine });
      try {
        db.execDdl('CREATE TABLE t (id TEXT PRIMARY KEY, b BLOB) STRICT');
        db.run('INSERT INTO t (id, b) VALUES (?, ?)', ['x', new Uint8Array([1, 2, 3])]);
        const one = db.get<{ id: string; b: Uint8Array }>('SELECT id, b FROM t')!;
        assert.deepEqual(Object.keys(one), ['id', 'b'], `${engine}: a field that is not a column`);
        assert.ok(one.b instanceof Uint8Array, `${engine}: bytes did not come back as a Uint8Array`);
        assert.deepEqual([...one.b], [1, 2, 3]);
        assert.deepEqual(Object.keys(db.all('SELECT id FROM t')[0]!), ['id']);
      } finally { db.close(); }
    }
  });

  test('where the database is, as the server knows it: memory, a file, or a remote address that needs its token', () => {
    assert.equal(dbKind(':memory:'), 'memory');
    assert.equal(dbKind('/tmp/x.db'), 'file');
    assert.equal(dbKind('caprebate.db'), 'file');
    assert.equal(dbKind('libsql://invented-151e3.turso.io'), 'remote');
    assert.equal(dbKind('https://invented-151e3.turso.io'), 'remote');
    assert.throws(() => dbKind('http://invented-151e3.turso.io'), /libsql:\/\/ or https:\/\//, 'a token must never travel unencrypted');
    assert.throws(() => new Db('libsql://invented-151e3.turso.io'), /needs its token/);
    assert.throws(() => new Db('libsql://invented-151e3.turso.io', { authToken: '  ' }), /needs its token/);
  });
});

/* ================================================================== the test website's entry point */

type Lasting = { location: string; authToken?: string; why: string };
async function entry() {
  return (await import(new URL('../../../../api/index.mjs', import.meta.url).href)) as {
    lastingDatabase: (env: Record<string, string | undefined>) => Lasting;
    seedOnce: (made: Made, s: typeof seed) => Promise<{ seeded: boolean; complete: boolean }>;
    LASTING_DATABASE_KEYS: readonly string[];
  };
}

describe('151e line 4a · the test website uses a lasting database only when it is given one, behind its own password', () => {
  const URL0 = 'libsql://caprebate-test-invented.turso.io';
  const TOKEN = 'invented-token-not-real-151e3';
  const PW = 'an-invented-test-password-151e3';

  test('switched off as shipped: nothing set, half set, no test password, or plain http - memory, as before', async () => {
    const { lastingDatabase, LASTING_DATABASE_KEYS } = await entry();
    assert.deepEqual([...LASTING_DATABASE_KEYS], ['CAPREBATE_DB_URL', 'CAPREBATE_DB_TOKEN']);
    for (const env of [{}, { CAPREBATE_DB_URL: URL0 }, { CAPREBATE_DB_TOKEN: TOKEN, CAPREBATE_TEST_PASSWORD: PW },
      { CAPREBATE_DB_URL: URL0, CAPREBATE_DB_TOKEN: TOKEN }, { CAPREBATE_DB_URL: URL0, CAPREBATE_DB_TOKEN: TOKEN, CAPREBATE_TEST_PASSWORD: 'short' },
      { CAPREBATE_DB_URL: 'http://caprebate-test-invented.turso.io', CAPREBATE_DB_TOKEN: TOKEN, CAPREBATE_TEST_PASSWORD: PW }]) {
      const l = lastingDatabase(env);
      assert.equal(l.location, ':memory:', JSON.stringify(Object.keys(env)));
      assert.equal(l.authToken, undefined);
      assert.match(l.why, /kept in memory/);
    }
  });

  test('the names Vercel\'s Turso integration adds work too, and ours win where both are set', async () => {
    const { lastingDatabase } = await entry();
    const t = lastingDatabase({ TURSO_DATABASE_URL: URL0, TURSO_AUTH_TOKEN: TOKEN, CAPREBATE_TEST_PASSWORD: PW });
    assert.equal(t.location, URL0);
    assert.equal(t.authToken, TOKEN);
    const both = lastingDatabase({ TURSO_DATABASE_URL: 'libsql://theirs.turso.io', TURSO_AUTH_TOKEN: 'theirs', CAPREBATE_DB_URL: URL0, CAPREBATE_DB_TOKEN: TOKEN, CAPREBATE_TEST_PASSWORD: PW });
    assert.equal(both.location, URL0);
    assert.equal(both.authToken, TOKEN);
    assert.equal(lastingDatabase({ TURSO_DATABASE_URL: URL0, CAPREBATE_TEST_PASSWORD: PW }).location, ':memory:');
  });

  test('all three set: the lasting database, and what it prints names neither the address nor the token', async () => {
    const { lastingDatabase } = await entry();
    const l = lastingDatabase({ CAPREBATE_DB_URL: URL0, CAPREBATE_DB_TOKEN: TOKEN, CAPREBATE_TEST_PASSWORD: PW });
    assert.equal(l.location, URL0);
    assert.equal(l.authToken, TOKEN);
    assert.ok(!l.why.includes(TOKEN) && !l.why.includes('turso.io'));
  });

  test('the seed runs only on an empty database: the second cold start on a lasting one finds everyone there', async () => {
    const { seedOnce } = await entry();
    const file = join(mkdtempSync(join(tmpdir(), 'cb-151e3-seed-')), 'lasting.db');
    const users = (m: Made) => m.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n;
    const first = await createApp(file, { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-151e3-')), now: () => NOW, sealKey: randomBytes(32) });
    try {
      assert.deepEqual(await seedOnce(first, seed), { seeded: true, complete: true });
      assert.ok(first.app.db.get("SELECT id FROM users WHERE id = 'u-demo-readonly'"), 'the view-only login is missing');
    } finally { first.close(); }
    const second = await createApp(file, { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-151e3-')), now: () => NOW, sealKey: randomBytes(32) });
    try {
      const before = users(second);
      assert.deepEqual(await seedOnce(second, seed), { seeded: false, complete: true });
      assert.equal(users(second), before);
    } finally { second.close(); }
  });

  test('the entry point reads CAPREBATE_DB_URL and CAPREBATE_DB_TOKEN from the settings, and never from a file of ours', () => {
    const src = readFileSync(new URL('../../../../api/index.mjs', import.meta.url), 'utf8');
    assert.match(src, /lastingDatabase\(process\.env\)/);
    assert.match(src, /dbAuthToken: lasting\.authToken/);
    // Phase 151e line 7: memory is now the FALLBACK inside openLasting, so the build must go through it with the settings
    assert.match(src, /openLasting\(createApp, seed, lastingDatabase\(process\.env\)/, 'the entry point builds on memory whatever it is given');
  });
});

/* ================================================================== 4b · SAYING SO, ON A DATABASE IN MEMORY */

describe('151e line 4b · on a database in memory the panel says so, and a result that finds no check is still refused', () => {
  test('two copies, two memories: the result reaches the copy that never saw the check - REFUSED, audited with what to do, nothing written', async () => {
    const a = await copy(':memory:');
    const b = await copy(':memory:');
    try {
      await seed(a.made.app.db, a.made.app.hasher, a.made.app.now);
      await seed(b.made.app.db, b.made.app.hasher, b.made.app.now);
      await sendFrom(a, 'idc-151e3-lost');
      const body = decision('Approved', 'idc-151e3-lost');
      const r = await b.post(body, signed(body));
      assert.equal(r.status, 404);
      assert.equal(r.body, `refused. ${FORGOTTEN_CHECK_WORDS}`);
      assert.equal(b.made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM identity_check_results')?.n, 0, 'a result was matched to something');
      const d = JSON.parse(refusals(b.made.app.db).at(-1)!.detail) as Record<string, string>;
      assert.equal(d['why'], 'the result names no check we sent');
      assert.equal(d['database'], 'in memory');
      assert.equal(d['what_to_do'], FORGOTTEN_CHECK_WORDS);
      assert.match(FORGOTTEN_CHECK_WORDS, /Send the check again/);
    } finally { close(b); close(a); }
  });

  test('a bad signature on a memory database is refused as before, with no note: the note is only for a check we cannot find', async () => {
    const b = await copy(':memory:');
    try {
      const body = decision('Approved', 'idc-151e3-x');
      const r = await b.post(body, signed(body, 'wrong-secret'));
      assert.equal(r.status, 401);
      assert.equal(r.body, 'refused');
    } finally { close(b); }
  });

  test('the identity panel says the records are kept in memory - on memory only, and from the database the server opened', async () => {
    const mem = await copy(':memory:');
    const file = await copy(join(mkdtempSync(join(tmpdir(), 'cb-151e3-panel-')), 'p.db'));
    try {
      for (const m of [mem, file]) await seed(m.made.app.db, m.made.app.hasher, m.made.app.now);
      const c = aContact(mem.made.app.db);
      const memPage = await mem.get(`/staff/clients/${c.business_id}`);
      assert.equal(memPage.status, 200);
      assert.match(memPage.body, /id="identity-forgetful-database"/);
      assert.ok(memPage.body.includes('Records kept in memory.'));
      assert.ok(memPage.body.includes('send the check again'), 'the panel does not say what to do');
      const fc = aContact(file.made.app.db);
      const filePage = await file.get(`/staff/clients/${fc.business_id}`);
      assert.equal(filePage.status, 200);
      assert.doesNotMatch(filePage.body, /identity-forgetful-database/);
      // a query string or a header cannot put it there, or take it away
      const asked = await file.get(`/staff/clients/${fc.business_id}?memory=1&database=memory`);
      assert.doesNotMatch(asked.body, /identity-forgetful-database/);
      assert.match(FORGETFUL_DATABASE_WORDS, /send the check again/);
    } finally { close(file); close(mem); }
  });
});

/* ================================================================== 5 · THE EMPTY IDENTITY PANEL */

describe('151e line 5 · a client with no contacts: the panel says to add the person as a contact first, with the link', () => {
  test('no contacts: the words and a link to this client\'s contact form, and no form to send', async () => {
    const w = await copy(':memory:');
    try {
      await seed(w.made.app.db, w.made.app.hasher, w.made.app.now);
      const db = w.made.app.db;
      const bare = bareClient(db);
      const html = String(identityPanel(w.made.app, adminOf(db), { business_id: bare.id }, []));
      assert.match(html, /id="identity-no-contacts"/);
      assert.ok(html.includes(NO_CONTACTS_WORDS));
      assert.ok(html.includes(`href="/staff/clients/${bare.id}#contacts"`), 'no link to the form that adds a contact');
      assert.doesNotMatch(html, /Send an identity check/);
      const page = await w.get(`/staff/clients/${bare.id}`);
      assert.equal(page.status, 200);
      assert.match(page.body, /id="identity-no-contacts"/);
      assert.match(page.body, /<details><summary>Add a contact<\/summary>/, 'the link points at a form that is not on the page');
    } finally { close(w); }
  });

  test('with contacts: the form, and no such words', async () => {
    const w = await copy(':memory:');
    try {
      await seed(w.made.app.db, w.made.app.hasher, w.made.app.now);
      const db = w.made.app.db;
      const c = aContact(db);
      const contacts = db.all<{ id: string; full_name: string }>('SELECT id, full_name FROM contacts WHERE business_id = ?', [c.business_id]);
      const html = String(identityPanel(w.made.app, adminOf(db), { business_id: c.business_id }, contacts));
      assert.match(html, /Send an identity check/);
      assert.doesNotMatch(html, /identity-no-contacts/);
    } finally { close(w); }
  });

  test('a login that does not keep the registers (Sales) sees no panel, so is not told to add a contact to send a check it cannot send', async () => {
    const w = await copy(':memory:');
    try {
      await seed(w.made.app.db, w.made.app.hasher, w.made.app.now);
      const db = w.made.app.db;
      const bare = bareClient(db);
      const sales = { id: 'u-x', role: 'SALES', business_id: null, disabled: false } as Actor;
      assert.equal(String(identityPanel(w.made.app, sales, { business_id: bare.id }, [])), '');
    } finally { close(w); }
  });
});
