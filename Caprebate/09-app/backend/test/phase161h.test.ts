/**
 * PHASE 161h, 7 November 2026 — PRODUCTION ON VERCEL: the live website's start, its keys, its timers, its backup and
 * restore, the reference database, and the one settings file both projects build from.
 *
 * Every test here runs with no network and no key: the live website is started on a database FILE in a temporary folder
 * (the same code that opens Turso opens a file), with an in-memory document store, as the ACCEPT list asks of a preview:
 * /api/health, a second step for staff, the legal pages following their setting, a timer refused without its word, and
 * a backup made and restored on a copy. What only a real Vercel preview can show is listed in the phase record.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/core/server.ts';
import { Db } from '../src/core/db.ts';
import { AuditLog } from '../src/core/audit.ts';
import { SECRET_KEYS, secretsFromValues, forgetRegisteredSecretsForTest } from '../src/core/secrets.ts';
import { signS3, s3EncodePath, s3LoginFrom, s3Target } from '../src/integrations/connectors/s3-backup.ts';
import {
  BACKUP_KEEP_DAYS, backupDocuments, folderTarget, lockBackup, restoreDatabase, restoreDocuments, runNightlyBackup, unlockBackup,
} from '../src/core/backup.ts';
import { FsObjectStore } from '../src/shared/objectstore.ts';
import { rowsToRetry, timerJobOf, timerWordRefusal, TIMER_SCHEDULES, TIMER_JOBS } from '../src/core/timers.ts';
import {
  holdsInventedSeed, LIVE_KEYS, LIVE_REQUIRED, liveStartCheck, prepareLiveDatabase, startLiveWebsite, TEST_ONLY_SETTINGS,
} from '../src/core/live-website.ts';
import { forgetReferenceGrid, OSTN15_SCHEMA, referenceLocation, referenceOstn15Grid, referencePostcodeStore } from '../src/integrations/postcodes/reference-db.ts';
import { SQLITE_SCHEMA } from '../src/integrations/postcodes/postcode-store.ts';
import { etrs89ToBritishNationalGrid, ostn15GridFromRows, OSTN15_COLUMNS, OSTN15_ROWS } from '../src/integrations/connectors/ostn15.ts';
import { postcodeStore, resetPostcodeStore, resolveProperty } from '../src/integrations/postcodes/postcode.ts';
import { buildReferenceDb } from '../tools/build-reference-db.ts';
import { restoreFromFolder } from '../tools/restore-backup.ts';
import { openSecret, resealSecrets, sealSecret, type MfaKey } from '../src/core/mfa-seal.ts';
import type { BlobClient } from '../src/shared/shared-objectstore.ts';

const VERCEL = (await import(new URL('../../../../vercel.ts', import.meta.url).href)) as {
  vercelConfig: (e: Record<string, string>) => { crons?: { path: string; schedule: string }[] } & Record<string, unknown>;
};
const BACKEND = join(import.meta.dirname, '..');
const KEY_B64 = randomBytes(32).toString('base64');
const WORD = 'w'.repeat(40);

/** A Blob client in memory that answers as @vercel/blob does: the live start needs one, and nothing leaves the test. */
function memoryBlob(): BlobClient {
  const m = new Map<string, { b: Buffer; at: string }>();
  return {
    async put(p, body) { m.set(p, { b: Buffer.from(body), at: new Date().toISOString() }); },
    async read(p) { const v = m.get(p); return v === undefined ? null : new Uint8Array(v.b); },
    async exists(p) { return m.has(p); },
    async remove(p) { m.delete(p); },
    async list(prefix) { return { objects: [...m].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => ({ pathname: k, written_at: v.at })), cursor: null }; },
  };
}

/** The settings of a complete live project, on a database FILE (invented values). */
function liveEnv(dbFile: string, more: Record<string, string> = {}): Record<string, string> {
  return {
    CAPREBATE_PRODUCTION: '1', CAPREBATE_DB_URL: dbFile, CAPREBATE_DB_TOKEN: 'invented-database-token-161h-0001',
    CAPREBATE_BLOB_TOKEN: 'invented-blob-token-161h', CAPREBATE_MFA_KEY: randomBytes(32).toString('base64'),
    CRON_SECRET: WORD, CAPREBATE_BACKUP_KEY: KEY_B64, CAPREBATE_PUBLIC_ORIGIN: 'https://caprebate.co.uk', ...more,
  };
}

/* ================================================================== 1. one settings file, two projects */

describe('161h · 1 · vercel.ts gives the timers to the live project only', () => {
  test('with no CAPREBATE_PRODUCTION there are no crons (the test project, on the free plan); with it, the three', () => {
    assert.equal(VERCEL.vercelConfig({}).crons, undefined);
    const live = VERCEL.vercelConfig({ CAPREBATE_PRODUCTION: '1' }).crons ?? [];
    assert.deepEqual(live.map((c) => c.path), TIMER_JOBS.map((j) => `/hooks/timer/${j}`));
    for (const c of live) assert.equal(c.schedule, TIMER_SCHEDULES[c.path.slice('/hooks/timer/'.length) as keyof typeof TIMER_SCHEDULES]);
    // nothing else differs between the two projects
    const { crons: _c, ...rest } = VERCEL.vercelConfig({ CAPREBATE_PRODUCTION: '1' });
    assert.deepEqual(rest, VERCEL.vercelConfig({}));
  });
  test('vercel.json is gone: Vercel takes one settings file, and two would disagree', () => {
    assert.equal(existsSync(join(BACKEND, '..', '..', '..', 'vercel.json')), false);
  });
});

/* ================================================================== 2. the keys and the start check */

describe('161h · 2 · the live start: every required setting, no test switch, names never values', () => {
  test('LIVE_KEYS is every key that is not retired, and holds the new ones', () => {
    assert.deepEqual([...LIVE_KEYS], SECRET_KEYS.filter((k) => k.retired === undefined).map((k) => k.name));
    for (const n of ['CRON_SECRET', 'CAPREBATE_BACKUP_KEY', 'BACKUP_S3_BUCKET', 'CAPREBATE_REFERENCE_DB_TOKEN']) assert.ok(LIVE_KEYS.includes(n), n);
    assert.ok(!LIVE_KEYS.includes('HMLR_BG_PASSWORD'), 'a retired key is read');
  });
  test('a complete set of settings passes', () => {
    assert.deepEqual(liveStartCheck(liveEnv('/x.db')), { stop: false, lines: [] });
  });
  test('each required setting missing stops the start and is named; its neighbours’ values are never printed', () => {
    for (const r of LIVE_REQUIRED) {
      const env: Record<string, string> = liveEnv('/x.db');
      for (const n of r.names) delete env[n];
      const c = liveStartCheck(env);
      const first = r.names[0] as string;
      assert.equal(c.stop, true, first);
      assert.ok(c.lines.some((l) => l.includes(first)), first);
      for (const v of Object.values(env)) if (v.length > 12) assert.ok(!c.lines.join('\n').includes(v), 'a value was printed');
    }
  });
  test('every test-only setting stops the live start', () => {
    for (const n of TEST_ONLY_SETTINGS) {
      const c = liveStartCheck(liveEnv('/x.db', { [n]: '1' }));
      assert.equal(c.stop, true, n);
      assert.ok(c.lines.some((l) => l.includes(n)), n);
    }
  });
  test('a short timer word, a backup key of the wrong size and an address that is not https stop it', () => {
    assert.equal(liveStartCheck(liveEnv('/x.db', { CRON_SECRET: 'short' })).stop, true);
    assert.equal(liveStartCheck(liveEnv('/x.db', { CAPREBATE_BACKUP_KEY: 'c2hvcnQ=' })).stop, true);
    assert.equal(liveStartCheck(liveEnv('/x.db', { CAPREBATE_PUBLIC_ORIGIN: 'http://caprebate.co.uk' })).stop, true);
  });
  test('a database holding the test website’s invented people is refused', async () => {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161h-')) });
    try {
      assert.equal(holdsInventedSeed(made.app.db), false);
      const t = made.app.now();
      made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        ['u-x', 'sales@example.invalid', 'sales@example.invalid', 'Invented', 'SALES', 'x', t, t]);
      assert.equal(holdsInventedSeed(made.app.db), true);
    } finally { made.close(); }
  });
});

/* ================================================================== 3. the live website, started for real on a file */

async function liveWorld(more: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cb-161h-live-'));
  const file = join(dir, 'live.db');
  const env = liveEnv(file, more);
  const prep = await prepareLiveDatabase(env);
  assert.equal(prep.ok, true, prep.why);
  let made: Awaited<ReturnType<typeof createApp>> | undefined;
  let seenOpts: Record<string, unknown> = {};
  const r = await startLiveWebsite(env, {
    blobClient: async () => memoryBlob(),
    createApp: (async (loc: string, opts: Record<string, unknown>) => { seenOpts = opts; made = await createApp(loc, opts as never); return made; }) as never,
  });
  assert.equal(r.started, true, r.lines.join('\n'));
  const { createServer } = await import('node:http');
  const server = createServer(r.listener);
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
  return { made: made!, base, env, seenOpts, lines: r.lines, close: () => { forgetRegisteredSecretsForTest(); server.close(); made!.close(); } };
}

describe('161h · 3 · the live website starts with none of the test website’s switches (the ACCEPT list, on a file)', () => {
  test('/api/health is {"ok":true}; the options carry no test switch; form tokens on; the keys are the live list', async () => {
    const w = await liveWorld();
    try {
      const r = await fetch(`${w.base}/api/health`);
      assert.equal(r.status, 200);
      assert.equal(await r.text(), '{"ok":true}');
      for (const k of ['testLetter', 'testSigning', 'testNotices', 'twoFactor', 'keepOriginals']) assert.equal(k in w.seenOpts, false, k);
      assert.equal(w.seenOpts['formTokens'], 'on');
      assert.equal(w.seenOpts['schema'], 'require-built');
      assert.equal(w.made.app.secrets.forOwner('TIMERS').get('CRON_SECRET'), WORD);
      assert.equal(w.made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n, 0, 'the live database was seeded');
      assert.ok(!w.lines.join('\n').includes(WORD), 'a key was printed');
    } finally { w.close(); }
  });

  test('a staff login needs a second step: the password alone answers 202 and no session', async () => {
    const w = await liveWorld();
    try {
      const t = w.made.app.now();
      w.made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
        ['u-161h', 'staff@live-test.invalid', 'staff@live-test.invalid', 'A Person', 'ADMIN', await w.made.app.hasher.hash('a long password 161h'), t, t]);
      const r = await fetch(`${w.base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'staff@live-test.invalid', password: 'a long password 161h' }) });
      assert.equal(r.status, 202);
      assert.equal(r.headers.getSetCookie().some((c) => c.startsWith('cb_session=')), false);
    } finally { w.close(); }
  });

  test('the legal pages follow CAPREBATE_LEGAL_PAGES', async () => {
    const off = await liveWorld();
    try { assert.match(await (await fetch(`${off.base}/privacy-policy/`)).text(), /<h1>This page is being prepared<\/h1>/); } finally { off.close(); }
    const on = await liveWorld({ CAPREBATE_LEGAL_PAGES: 'on' });
    try {
      const r = await fetch(`${on.base}/privacy-policy/`);
      assert.equal(r.status, 200);
      assert.match(await r.text(), /Draft/);
    } finally { on.close(); }
  });

  test('a timer call without its word, or with the wrong one, is refused; with it, the job runs and says so in counts', async () => {
    const w = await liveWorld();
    try {
      assert.equal((await fetch(`${w.base}/hooks/timer/nightly`)).status, 401);
      assert.equal((await fetch(`${w.base}/hooks/timer/nightly`, { headers: { authorization: `Bearer ${'x'.repeat(40)}` } })).status, 401);
      assert.equal((await fetch(`${w.base}/hooks/timer/no-such-job`, { headers: { authorization: `Bearer ${WORD}` } })).status, 404);
      const ok = await fetch(`${w.base}/hooks/timer/nightly`, { headers: { authorization: `Bearer ${WORD}` } });
      const body = await ok.text();
      assert.equal(ok.status, 200, body);
      assert.match(body, /^timer nightly: kept originals deleted: 0; messages: .*; audit chain: intact/);
      const five = await fetch(`${w.base}/hooks/timer/every-five-minutes`, { headers: { authorization: `Bearer ${WORD}` } });
      assert.equal(five.status, 200, await five.text());
    } finally { w.close(); }
  });

  test('a live start with a setting missing answers 503 everywhere, /api/health {"ok":false}', async () => {
    const env = liveEnv('/nowhere.db'); delete (env as Record<string, string>).CRON_SECRET;
    const r = await startLiveWebsite(env);
    assert.equal(r.started, false);
    const { createServer } = await import('node:http');
    const server = createServer(r.listener);
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', () => res()));
    try {
      const a = server.address();
      const h = await fetch(`http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}/api/health`);
      assert.equal(h.status, 503);
      assert.equal(await h.text(), '{"ok":false}');
    } finally { server.close(); }
  });

  test('a database the build never built is refused, never run on memory', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-161h-unbuilt-'));
    const r = await startLiveWebsite(liveEnv(join(dir, 'empty.db')), { blobClient: async () => memoryBlob() });
    assert.equal(r.started, false);
    assert.match(r.lines.join(' '), /not built/);
  });
});

/* ================================================================== 4. the timer word */

describe('161h · 4 · the timers', () => {
  test('the word: missing, short, wrong and right', () => {
    assert.match(timerWordRefusal(secretsFromValues({}), `Bearer ${WORD}`) ?? '', /no word is set/);
    assert.match(timerWordRefusal(secretsFromValues({ CRON_SECRET: 'short' }), 'Bearer short') ?? '', /no word is set/);
    assert.match(timerWordRefusal(secretsFromValues({ CRON_SECRET: WORD }), undefined) ?? '', /no word was sent/);
    assert.match(timerWordRefusal(secretsFromValues({ CRON_SECRET: WORD }), `Bearer ${WORD}x`) ?? '', /does not match/);
    assert.equal(timerWordRefusal(secretsFromValues({ CRON_SECRET: WORD }), `Bearer ${WORD}`), null);
    assert.equal(timerJobOf('/hooks/timer/backup'), 'backup');
    assert.equal(timerJobOf('/hooks/timer/../backup'), null);
  });

  test('the email retry takes only rows safe to try again: never one refused for good, a sent one, an old one or a fresh one', async () => {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161h-')) });
    try {
      const now = '2026-11-07T12:00:00.000Z';
      const at = (min: number): string => new Date(Date.parse(now) - min * 60_000).toISOString();
      const add = (id: string, created: string, last_error: string | null, sent: string | null = null): void => {
        made.app.db.run("INSERT INTO outbox (id, created_at, to_email, subject, body, kind, send_requested, sent_at, last_error) VALUES (?,?,?,?,?,'NOTIFICATION',1,?,?)",
          [id, created, 'someone@caprebate-client.invalid', 's', 'b', sent, last_error]);
      };
      add('never-tried', at(10), null);
      add('could-not', at(10), 'It could not be sent just now.');
      add('stuck', at(30), 'Being sent.');
      add('in-flight', at(5), 'Being sent.');
      add('do-not-contact', at(10), 'This company is marked do not contact. It was not sent.');
      add('invented', at(10), 'An invented address, so it was not sent.');
      add('sent', at(10), null, at(9));
      add('too-old', at(60 * 25), null);
      add('too-fresh', at(1), null);
      assert.deepEqual(rowsToRetry(made.app.db, now).map((r) => r.id).sort(), ['could-not', 'never-tried', 'stuck']);
    } finally { made.close(); }
  });
});

/* ================================================================== 5. the backup, and a restore tried on a copy */

describe('161h · 5 · the nightly backup, locked, and restored on a copy', () => {
  test('a locked file opens only with its key, and a changed byte stops it', () => {
    const key = Buffer.from(KEY_B64, 'base64');
    const locked = lockBackup(Buffer.from('a client’s record'), key);
    assert.equal(unlockBackup(locked, key).toString(), 'a client’s record');
    assert.ok(!locked.includes(Buffer.from('record')), 'the text is readable in the locked file');
    assert.throws(() => unlockBackup(locked, randomBytes(32)));
    const changed = Buffer.from(locked); changed[changed.length - 1] = (changed[changed.length - 1] as number) ^ 1;
    assert.throws(() => unlockBackup(changed, key));
  });

  test('without the key, or with nowhere to go, nothing is copied and it says which', async () => {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161h-')) });
    try {
      const d = { db: made.app.db, store: made.store, secrets: secretsFromValues({}), outside: made.app.outside, now: made.app.now };
      assert.match((await runNightlyBackup(d, {})).why, /CAPREBATE_BACKUP_KEY is not set/);
      assert.match((await runNightlyBackup({ ...d, secrets: secretsFromValues({ CAPREBATE_BACKUP_KEY: KEY_B64 }) }, {})).why, /nowhere to copy it to \(not set: BACKUP_S3_BUCKET/);
    } finally { made.close(); }
  });

  test('backup, then restore on a copy: the same database (audit chain intact), the same documents, the holding places left out', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-161h-backup-'));
    const made = await createApp(join(dir, 'live.db'), { documentRoot: join(dir, 'docs') });
    try {
      made.app.audit.append({ at: made.app.now(), kind: 'LOGIN_FAILED', outcome: 'REFUSED', actor_id: null, actor_role: null, detail: { why: 'a test row, 161h' } });
      await made.store.putText('durable/doc-1.retained.json', '{"kept":"yes"}');
      await made.store.putText('survey-photos/p-1', 'sealed photo bytes (pretend)');
      await made.store.putText('quarantine/doc-2', 'an UNREDACTED upload waiting in the holding place');
      await made.store.putText('survey-incoming/x-1', 'a locked photo waiting');
      const backups = join(dir, 'backups');
      const d = { db: made.app.db, store: made.store, secrets: secretsFromValues({ CAPREBATE_BACKUP_KEY: KEY_B64 }), outside: made.app.outside, now: () => '2026-11-07T02:00:00.000Z' };
      const r = await runNightlyBackup(d, { CAPREBATE_BACKUP_DIR: backups });
      assert.equal(r.ok, true, r.why);
      assert.match(r.why, /2 new or changed documents copied/);
      assert.match(r.why, /2 in the holding places left out/);
      // nothing in the backup folder is readable without the key
      assert.ok(!readFileSync(join(backups, 'database', '2026-11-07.db.cbbk')).includes(Buffer.from('SQLite format')));
      // the restore, on a copy
      const target = folderTarget(backups);
      const key = Buffer.from(KEY_B64, 'base64');
      const copy = join(dir, 'restored.db');
      await restoreDatabase(target, key, '2026-11-07', copy);
      const db = new Db(copy);
      try {
        const log = new AuditLog(db);
        assert.equal(log.verify().intact, true);
        assert.equal(log.entries().length, new AuditLog(made.app.db).entries().length);
        assert.ok(db.get("SELECT seq FROM audit_log WHERE kind = 'LOGIN_FAILED'") !== undefined);
      } finally { db.close(); }
      const store2 = new FsObjectStore({ root: join(dir, 'docs-restored') });
      assert.equal(await restoreDocuments(target, key, store2), 2);
      assert.equal(Buffer.from(await store2.readStored('durable/doc-1.retained.json')).toString(), '{"kept":"yes"}');
      await assert.rejects(store2.readStored('quarantine/doc-2'));
      await assert.rejects(store2.readStored('survey-incoming/x-1'));
      // a second night copies only what changed
      const again = await runNightlyBackup({ ...d, now: () => '2026-11-08T02:00:00.000Z' }, { CAPREBATE_BACKUP_DIR: backups });
      assert.match(again.why, /0 new or changed documents copied to a folder on this computer, 2 unchanged/);
    } finally { made.close(); }
  });

  test(`a document deleted from the website leaves the backup once it has been gone ${BACKUP_KEEP_DAYS} days`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-161h-keep-'));
    const store = new FsObjectStore({ root: join(dir, 'docs') });
    const target = folderTarget(join(dir, 'b'));
    const key = Buffer.from(KEY_B64, 'base64');
    await store.putText('durable/gone', 'deleted later');
    await backupDocuments(store, target, key, '2026-11-01T02:00:00.000Z');
    assert.equal(await target.exists('documents/durable/gone.cbbk'), true);
    await store.delete('durable/gone');
    assert.equal((await backupDocuments(store, target, key, '2026-11-02T02:00:00.000Z')).removed, 0);
    assert.equal((await backupDocuments(store, target, key, '2026-12-06T02:00:00.000Z')).removed, 0, 'removed too early');
    assert.equal((await backupDocuments(store, target, key, '2026-12-07T02:00:00.000Z')).removed, 1);
    assert.equal(await target.exists('documents/durable/gone.cbbk'), false);
  });

  test('the restore command opens a night\u2019s database into a new file, checks it, and puts the documents back', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cb-161h-cli-'));
    const made = await createApp(join(dir, 'live.db'), { documentRoot: join(dir, 'docs') });
    try {
      await made.store.putText('durable/doc-9.retained.json', '{"n":9}');
      const r = await runNightlyBackup({ db: made.app.db, store: made.store, secrets: secretsFromValues({ CAPREBATE_BACKUP_KEY: KEY_B64 }), outside: made.app.outside, now: () => '2026-11-07T02:00:00.000Z' },
        { CAPREBATE_BACKUP_DIR: join(dir, 'bucket') });
      assert.equal(r.ok, true, r.why);
    } finally { made.close(); }
    const lines = await restoreFromFolder({ from: join(dir, 'bucket'), date: '2026-11-07', to: join(dir, 'restored.db'), documents: join(dir, 'docs2'), keyB64: KEY_B64 });
    assert.match(lines.join('\n'), /tables are complete/);
    assert.match(lines.join('\n'), /audit chain is intact/);
    assert.match(lines.join('\n'), /1 document put back/);
    await assert.rejects(restoreFromFolder({ from: join(dir, 'bucket'), date: '2026-11-07', to: join(dir, 'again.db'), keyB64: randomBytes(32).toString('base64') }));
    await assert.rejects(restoreFromFolder({ from: join(dir, 'bucket'), date: '2026-11-07', to: join(dir, 'restored.db'), keyB64: KEY_B64 }), /already there/);
  });

  test('a backup folder inside the code folder is refused', () => {
    assert.throws(() => folderTarget(join(BACKEND, 'backups-161h')), /inside the code folder/);
  });
});

/* ================================================================== 6. the second place: S3's signing */

describe('161h · 6 · the backup bucket: AWS Signature Version 4, checked against AWS’s own example', () => {
  test('AWS’s published GET example signs to its published signature', () => {
    // "Example: GET Object", Amazon S3 API reference, Signature Version 4 (the documented example keys, not ours).
    const auth = signS3({
      method: 'GET', path: '/test.txt', amzDate: '20130524T000000Z', region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      headers: { host: 'examplebucket.s3.amazonaws.com', range: 'bytes=0-9', 'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'x-amz-date': '20130524T000000Z' },
    });
    assert.equal(auth, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  });

  test('a PUT goes to the London bucket, signed, carrying only locked bytes; the four settings are all needed', async () => {
    assert.deepEqual(s3LoginFrom(secretsFromValues({}).forOwner('BACKUPS')).missing, ['BACKUP_S3_BUCKET', 'BACKUP_S3_REGION', 'BACKUP_S3_ACCESS_KEY_ID', 'BACKUP_S3_SECRET_ACCESS_KEY']);
    const login = s3LoginFrom(secretsFromValues({ BACKUP_S3_BUCKET: 'caprebate-backups-example', BACKUP_S3_REGION: 'eu-west-2', BACKUP_S3_ACCESS_KEY_ID: 'AKIAEXAMPLE161H', BACKUP_S3_SECRET_ACCESS_KEY: 'invented-secret-161h-not-a-key' }).forOwner('BACKUPS')).login!;
    const seen: { url: string; method: string; headers: Record<string, string>; body?: string | Uint8Array }[] = [];
    const t = s3Target(login, async (url, init) => { seen.push({ url, method: init.method, headers: init.headers, ...(init.body === undefined ? {} : { body: init.body }) }); return new Response(null, { status: 200 }); }, () => '2026-11-07T02:00:00.000Z');
    const locked = lockBackup(Buffer.from('x'), Buffer.from(KEY_B64, 'base64'));
    await t.put('database/2026-11-07.db.cbbk', locked);
    const s = seen[0]!;
    assert.equal(s.url, 'https://caprebate-backups-example.s3.eu-west-2.amazonaws.com/database/2026-11-07.db.cbbk');
    assert.equal(s.method, 'PUT');
    assert.match(s.headers['authorization'] ?? '', /^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE161H\/20261107\/eu-west-2\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    assert.equal(s.headers['x-amz-content-sha256'], createHash('sha256').update(locked).digest('hex'));
    assert.ok(!JSON.stringify(s.headers).includes('invented-secret-161h'), 'the secret travelled');
    assert.equal(s3EncodePath('/a b/c$d'), '/a%20b/c%24d');
  });
});

/* ================================================================== 7. the reference database */

describe('161h · 7 · the postcode table and the OSTN15 grid, read from the reference database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cb-161h-ref-'));
  const file = join(dir, 'reference.db');
  const db = new DatabaseSync(file);
  db.exec(SQLITE_SCHEMA);
  db.prepare('INSERT INTO postcode_authority VALUES (?,?,?,?,?)').run('M1 1AE', 'E08000003', 'E92000001', 'E12000002', null);
  db.prepare('INSERT INTO authority_name VALUES (?,?)').run('E08000003', 'Manchester');
  for (const [k, v] of [['source', 'HAND-TYPED TEST FIXTURE - not an ONS file'], ['licence', 'n/a'], ['release', 'AUG_2026'], ['release_year', '2026'], ['record_count', '1']] as [string, string][]) db.prepare('INSERT INTO table_meta VALUES (?,?)').run(k, v);
  // A whole grid of invented shifts (every point: the reference database refuses part of one, as a file is refused).
  const shift = (i: number, j: number): [number, number] => [80 + (i % 7) * 0.25 + j * 0.0001, -70 - (j % 5) * 0.5 + i * 0.0002];
  db.exec(OSTN15_SCHEMA);
  const ins = db.prepare('INSERT INTO ostn15_grid VALUES (?,?,?,1)');
  db.exec('BEGIN');
  for (let j = 0; j < OSTN15_ROWS; j++) for (let i = 0; i < OSTN15_COLUMNS; i++) { const [e, n] = shift(i, j); ins.run(i + j * OSTN15_COLUMNS, e, n); }
  db.exec('COMMIT');
  db.close();
  const env = { CAPREBATE_REFERENCE_DB_URL: file };

  test('unset is none; a remote address needs its token; a file is a file', () => {
    assert.equal(referenceLocation({}).kind, 'none');
    assert.equal(referenceLocation({ CAPREBATE_REFERENCE_DB_URL: 'libsql://ref.example.invalid' }).kind, 'none');
    assert.equal(referenceLocation({ CAPREBATE_REFERENCE_DB_URL: 'libsql://ref.example.invalid', CAPREBATE_REFERENCE_DB_TOKEN: 't' }).kind, 'remote');
    assert.equal(referenceLocation(env).kind, 'file');
  });

  test('the postcode lookup answers from it, through the application’s own postcodeStore()', () => {
    resetPostcodeStore();
    try {
      const store = postcodeStore(env);
      assert.ok(store !== null);
      assert.equal(store.get('M1 1AE')?.lad_name, 'Manchester');
      const r = resolveProperty('M1 1AE', { store });
      assert.equal(r.region, 'North West');
      assert.equal(referencePostcodeStore({}), null);
    } finally { resetPostcodeStore(); }
  });

  test('the grid read a point at a time gives exactly what the same grid read whole gives', () => {
    forgetReferenceGrid();
    const fromDb = referenceOstn15Grid(env);
    assert.ok(fromDb !== null);
    const rows = function* () { for (let j = 0; j < OSTN15_ROWS; j++) for (let i = 0; i < OSTN15_COLUMNS; i++) { const [e, n] = shift(i, j); yield { easting: i * 1000, northing: j * 1000, e_shift: e, n_shift: n, flag: 1 }; } };
    const whole = ostn15GridFromRows(rows(), 'the same, in memory');
    for (const p of [{ latitude: 53.48, longitude: -2.24 }, { latitude: 51.5, longitude: -0.12 }, { latitude: 57.1, longitude: -4.2 }]) {
      const a = etrs89ToBritishNationalGrid({ ...p, datum: 'ETRS89' }, fromDb);
      const b = etrs89ToBritishNationalGrid({ ...p, datum: 'ETRS89' }, whole);
      assert.equal(a.ok, true);
      assert.deepEqual(a, b);
    }
    forgetReferenceGrid();
  });

  test('the quarterly build refuses to write inside the code folder, before it reads anything', () => {
    assert.throws(() => buildReferenceDb({ postcodes: file, ostn15: '/none', out: join(BACKEND, 'reference-161h.db') }), /outside the code folder/);
    assert.throws(() => buildReferenceDb({ postcodes: file, ostn15: '/none', out: file }), /already there|OSTN15|no such file/i);
  });
});

/* ================================================================== 8. changing the authenticator key */

describe('161h · 8 · reseal-app-secrets moves every sealed secret to a new key, all or nothing', () => {
  test('moved: each opens with the new key and not the old; a wrong old key changes nothing', async () => {
    const made = await createApp(':memory:', { documentRoot: mkdtempSync(join(tmpdir(), 'cb-161h-')) });
    try {
      const key = (): MfaKey => ({ state: 'KEY', key: randomBytes(32) });
      const oldK = key(), newK = key(), wrong = key();
      const t = made.app.now();
      for (const [id, secret] of [['u-a', 'JBSWY3DPEHPK3PXP'], ['u-b', 'KRSXG5DSNFXGOIDB']] as const) {
        const sealed = sealSecret(oldK, id, secret);
        assert.ok(sealed.ok);
        made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id,mfa_secret) VALUES (?,?,?,?,?,?,?,?,NULL,?)',
          [id, `${id}@live-test.invalid`, `${id}@live-test.invalid`, 'A Person', 'ADMIN', 'x', t, t, sealed.stored]);
      }
      const before = made.app.db.all('SELECT id, mfa_secret FROM users ORDER BY id');
      assert.deepEqual(resealSecrets(made.app.db, wrong, newK), { ok: false, resealed: 0, would_not_open: 2 });
      assert.deepEqual(made.app.db.all('SELECT id, mfa_secret FROM users ORDER BY id'), before, 'a failed move changed something');
      assert.deepEqual(resealSecrets(made.app.db, oldK, newK), { ok: true, resealed: 2, would_not_open: 0 });
      const a = made.app.db.get<{ mfa_secret: string }>("SELECT mfa_secret FROM users WHERE id = 'u-a'")!.mfa_secret;
      assert.deepEqual(openSecret(newK, 'u-a', a), { ok: true, secret: 'JBSWY3DPEHPK3PXP' });
      assert.equal(openSecret(oldK, 'u-a', a).ok, false);
    } finally { made.close(); }
  });
});
