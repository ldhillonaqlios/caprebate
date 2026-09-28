/**
 * PHASE 151i, 28 September 2026 — THE TEST WEBSITE'S UPLOADED DOCUMENTS ON A STORE EVERY COPY REACHES, SWITCHED OFF;
 * AND THE AUDIT LOG ON A DATABASE TWO COPIES SHARE.
 *
 *   1  A document written through one copy is read through another: a private Vercel Blob store, reached through the
 *      same FsObjectStore every caller already takes (src/web/shared-objectstore.ts). Two copies of the website on one
 *      database file and one store: Sales uploads through the first, Admin opens the kept original through the second.
 *   2  Never reachable without the authorising route: every call private, no Blob address kept or shown, the upload
 *      link still ours and still one key, nothing on the copy's own disk.
 *   3  Switched off, nothing changes: api/index.mjs uses the store only with the lasting database in use AND a store
 *      setting; any less, today's temporary folder.
 *   4  The audit log: two Db handles on one file appending in turn, interleaved, and across two processes; the chain
 *      stays whole and no request is lost.
 *
 * NO NETWORK. The Blob store here answers as the @vercel/blob SDK's documentation says it does (vercel.com/docs/
 * vercel-blob/using-blob-sdk, read 28 Sep 2026): `get` gives null for a missing object, `head` throws BlobNotFoundError,
 * `del` of a missing object is not an error, a private store refuses a public write, and a write over an existing
 * object needs allowOverwrite. Invented data only.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createApp } from '../src/server.ts';
import { seed, SEED_PASSWORD } from '../src/seed.ts';
import { Db, migrate } from '../src/db.ts';
import { AuditLog } from '../src/audit.ts';
import { FsObjectStore, assertNoStaticFileRoute } from '../src/web/objectstore.ts';
import * as SO from '../src/web/shared-objectstore.ts';
import { durableKeyFor, quarantineKeyFor, retainedTextKeyFor } from '../src/web/upload-handler-port.ts';
import { KEEP_ORIGINALS_QUESTION } from '../src/web/originals.ts';
import { pdfOf } from './document-fixtures.ts';

const HERE = fileURLToPath(new URL('..', import.meta.url));   // 09-app/backend/
const REPO = join(HERE, '..', '..', '..');                     // Development/
const NOW = '2026-09-28T12:00:00.000Z';
const INVENTED_DB_TOKEN = 'invented-database-token-151i';
const STORE_HOST = 'invented0store.private.blob.vercel-storage.com';

/* ------------------------------------------------------------------ a Blob store, as its SDK is documented */

class RecordedBlobNotFound extends Error {
  constructor() { super('The requested blob does not exist'); }
}
type Call = { op: string; pathname: string; opts: Record<string, unknown> };

function recordedBlob(o: { deleteDoesNothing?: boolean } = {}) {
  const objects = new Map<string, Buffer>();
  const calls: Call[] = [];
  const sdk = {
    async put(pathname: string, body: Buffer, opts: Record<string, unknown>) {
      calls.push({ op: 'put', pathname, opts });
      if (opts['access'] !== 'private') throw new Error('Vercel Blob: this store is private and refuses public access');
      if (objects.has(pathname) && opts['allowOverwrite'] !== true) throw new Error('Vercel Blob: This blob already exists');
      objects.set(pathname, Buffer.from(body));
      return { pathname, url: `https://${STORE_HOST}/${pathname}`, downloadUrl: `https://${STORE_HOST}/${pathname}?download=1`, contentType: String(opts['contentType']), etag: '"1"' };
    },
    async get(pathname: string, opts: Record<string, unknown>) {
      calls.push({ op: 'get', pathname, opts });
      const b = objects.get(pathname);
      if (b === undefined) return null;
      return { statusCode: 200, stream: new Blob([new Uint8Array(b)]).stream() };
    },
    async head(pathname: string, opts: Record<string, unknown>) {
      calls.push({ op: 'head', pathname, opts });
      if (!objects.has(pathname)) throw new RecordedBlobNotFound();
      return { pathname, url: `https://${STORE_HOST}/${pathname}` };
    },
    async del(pathname: string, opts: Record<string, unknown>) {
      calls.push({ op: 'del', pathname, opts });
      if (o.deleteDoesNothing !== true) objects.delete(pathname);
    },
    BlobNotFoundError: RecordedBlobNotFound,
  };
  return { sdk, objects, calls };
}

async function sharedStore(blob: ReturnType<typeof recordedBlob>, sealKey: Buffer | null = null, dbToken = INVENTED_DB_TOKEN, token?: string) {
  const client = await SO.vercelBlobClient(token === undefined ? {} : { token }, blob.sdk);
  return new SO.SharedObjectStore({ client, linkSecret: SO.uploadLinkSecret(dbToken), sealKey, now: () => NOW,
    originals: { enabled: true, retention_days: 30, question: KEEP_ORIGINALS_QUESTION } });
}

const PDF = (): Uint8Array => new Uint8Array(pdfOf([['DEMISE AND TERM:', 'Annual rent 25000']], { compress: true }));

type Lasting = { location: string; authToken?: string; why: string };
type EntryPoint = {
  sharedDocumentStore: (env: Record<string, string | undefined>, lasting: Lasting) => { shared: boolean; token?: string; why: string };
  sharedDocumentOptions: (docs: { shared: boolean; token?: string }, lasting: Lasting, sdk?: unknown) => Promise<Record<string, unknown>>;
  documentsWhy: (docs: { shared: boolean; why: string }, lastingInUse: boolean) => string;
  lastingDatabase: (env: Record<string, string | undefined>) => { location: string; authToken?: string; why: string };
  openLasting: (c: typeof createApp, s: typeof seed, l: { location: string; authToken?: string; why: string }, o: object, waitMs?: number, lastingOnly?: object) =>
    Promise<{ made: Awaited<ReturnType<typeof createApp>>; lasting: boolean; why: string }>;
};
const entry = async (): Promise<EntryPoint> => (await import(pathToFileURL(join(REPO, 'api', 'index.mjs')).href)) as EntryPoint;

/* ================================================================== */

describe('151i · 1 · a document written through one copy is read through another', () => {
  test('the store: bytes, the retained text and a sealed original written by one copy are read by another; the first copy keeps nothing of its own', async () => {
    const blob = recordedBlob();
    const key = randomBytes(32);
    const a = await sharedStore(blob, key);
    const b = await sharedStore(blob, key);
    const bytes = PDF();
    await a.putClientBytes(quarantineKeyFor('doc-151i'), bytes);
    assert.ok(Buffer.from(await b.get(quarantineKeyFor('doc-151i'))).equals(Buffer.from(bytes)), 'the second copy did not read the first copy\'s upload');
    await a.putText(retainedTextKeyFor('doc-151i'), 'DEMISE AND TERM: Annual rent 25000');
    assert.equal(Buffer.from(await b.get(retainedTextKeyFor('doc-151i'))).toString('utf8'), 'DEMISE AND TERM: Annual rent 25000');
    // The original is sealed on the way into the store, and opened by the other copy with the same key.
    await a.copy(quarantineKeyFor('doc-151i'), durableKeyFor('doc-151i'));
    const stored = blob.objects.get(SO.SHARED_PREFIX + durableKeyFor('doc-151i'));
    assert.ok(stored !== undefined && !stored.equals(Buffer.from(bytes)) && stored.subarray(0, 4).toString('latin1') !== '%PDF', 'a kept original sits in the store in the clear');
    assert.ok((await b.openOriginal(durableKeyFor('doc-151i'))).equals(Buffer.from(bytes)));
    // And with no key, still no original is kept - the rule is the base class's, unchanged.
    await assert.rejects(() => (async () => (await sharedStore(blob, null)).copy(quarantineKeyFor('doc-151i'), durableKeyFor('doc-151j')))(), /no encryption key/);
    for (const s of [a, b]) assert.deepEqual(readdirSync(s.root), [], 'a byte went to the copy\'s own disk');
  });

  test('an upload link issued by one copy is accepted by another, and by nothing signed with a different secret', async () => {
    const blob = recordedBlob();
    const a = await sharedStore(blob);
    const b = await sharedStore(blob);
    const k = quarantineKeyFor('doc-link');
    const link = await a.presignPut(k, '2026-09-28T12:15:00.000Z');
    assert.match(link.url, /^\/upload\/put\?token=/, 'the upload link is not ours');
    const token = decodeURIComponent(link.url.slice('/upload/put?token='.length));
    assert.deepEqual(b.verifyPutToken(token, k), { ok: true }, 'a second copy refused a good link');
    assert.equal(b.verifyPutToken(token, quarantineKeyFor('doc-other')).ok, false, 'a link widened to another key');
    const other = await sharedStore(blob, null, 'a-different-invented-token');
    assert.equal(other.verifyPutToken(token, k).ok, false, 'a link signed for one database opened another');
    // Why the secret had to be shared: two folder stores, each with its own secret, refuse each other's links.
    const f1 = new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-151i-f1-')) });
    const f2 = new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-151i-f2-')) });
    assert.equal(f2.verifyPutToken(f1.mintPutToken(k, '2026-09-28T12:15:00.000Z'), k).ok, false);
    assert.throws(() => SO.uploadLinkSecret('  '), /needs the lasting database token/);
  });

  test('THE WEBSITE: Sales uploads through one copy, and Admin opens the kept original through another - same database, same store', async () => {
    const { openLasting } = await entry();
    const blob = recordedBlob();
    const file = join(mkdtempSync(join(tmpdir(), 'cb-151i-db-')), 'turso-stand-in.db');
    const sealKey = randomBytes(32);
    const lasting = { location: file, authToken: INVENTED_DB_TOKEN, why: 'the records are kept in the lasting database' };
    const optsFor = (name: string) => ({ documentRoot: mkdtempSync(join(tmpdir(), `cb-151i-${name}-`)), twoFactor: 'off', now: () => NOW, sealKey,
      keepOriginals: { enabled: true, retention_days: 30, question: KEEP_ORIGINALS_QUESTION } });
    const shared = async () => ({ sharedDocuments: { client: await SO.vercelBlobClient({}, blob.sdk), linkSecret: SO.uploadLinkSecret(INVENTED_DB_TOKEN) } });
    const oa = optsFor('a');
    const ob = optsFor('b');
    const A = await openLasting(createApp, seed, lasting, oa, 0, await shared());
    const B = await openLasting(createApp, seed, lasting, ob, 0, await shared());
    const listen = async (m: typeof A.made) => {
      await new Promise<void>((r) => m.server.listen(0, '127.0.0.1', () => r()));
      const addr = m.server.address();
      return `http://127.0.0.1:${typeof addr === 'object' && addr !== null ? addr.port : 0}`;
    };
    try {
      assert.equal(A.lasting && B.lasting, true);
      const [baseA, baseB] = [await listen(A.made), await listen(B.made)];
      // One browser whose requests Vercel sends to whichever copy it likes: a cookie, and a base per request.
      const browser = () => {
        let cookie = '';
        return async (base: string, path: string, init: RequestInit = {}) => {
          const headers = { ...(init.headers as Record<string, string> | undefined), ...(cookie === '' ? {} : { cookie }) };
          const r = await fetch(base + path, { redirect: 'manual', ...init, headers });
          const set = r.headers.getSetCookie();
          if (set.length > 0) cookie = set.map((x) => x.split(';')[0] ?? '').join('; ');
          return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) };
        };
      };
      const signIn = async (who: string, base: string) => {
        const go = browser();
        const r = await go(base, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ email: `${who}@example.invalid`, password: SEED_PASSWORD }).toString() });
        assert.equal(r.status, 303, `${who} could not sign in`);
        return go;
      };
      const db = A.made.app.db;
      const biz = db.get<{ business_id: string }>("SELECT business_id FROM users WHERE role = 'CLIENT' LIMIT 1")?.business_id ?? '';
      const bytes = PDF();
      const b = `----cb151i${randomBytes(8).toString('hex')}`;
      const body = Buffer.concat([
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="type_code"\r\n\r\nLEASE\r\n`),
        Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="invented-lease.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        Buffer.from(bytes), Buffer.from(`\r\n--${b}--\r\n`)]);
      const sales = await signIn('sales', baseA);
      assert.equal((await sales(baseA, `/staff/clients/${biz}/files`, { method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${b}` }, body })).status, 303);
      const lid = db.get<{ id: string }>('SELECT id FROM logical_documents ORDER BY created_at DESC, rowid DESC LIMIT 1')?.id ?? '';
      const v = db.get<{ id: string }>('SELECT id FROM documents WHERE logical_document_id = ? ORDER BY version_no DESC LIMIT 1', [lid])?.id ?? '';
      assert.ok(db.get<{ original_kept_at: string | null }>('SELECT original_kept_at FROM documents WHERE id = ?', [v])?.original_kept_at, 'nothing was kept');

      // Signed in on the FIRST copy, the download asked of the SECOND: the session and the file are both shared.
      const admin = await signIn('admin', baseA);
      const got = await admin(baseB, `/staff/documents/${lid}/download`);
      assert.equal(got.status, 200, 'the second copy could not open a document uploaded through the first');
      assert.ok(got.bytes.equals(Buffer.from(bytes)), 'the second copy gave back something else');
      // Neither copy's own disk holds it.
      for (const o of [oa, ob]) assert.equal(existsSync(join(o.documentRoot, durableKeyFor(v))), false, 'a copy kept it on its own disk');

      // 2 · NEVER WITHOUT THE AUTHORISING ROUTE: no session, and the wrong role, get nothing.
      const stranger = browser();
      const anon = await stranger(baseB, `/staff/documents/${lid}/download`);
      assert.notEqual(anon.status, 200);
      assert.equal(anon.bytes.includes(Buffer.from(bytes).subarray(0, 64)), false);
      assert.equal((await (await signIn('accounting', baseB))(baseB, `/staff/documents/${lid}/download`)).status, 403);
      // The Blob store's own address is never kept: not anywhere in the database's bytes, its journal included.
      for (const f of [file, `${file}-wal`]) {
        if (existsSync(f)) assert.equal(readFileSync(f).includes('blob.vercel-storage.com'), false, `the store's address is in ${f}`);
      }
    } finally {
      A.made.close();
      B.made.close();
    }
  });
});

describe('151i · 2 · never reachable without the authorising route', () => {
  test('every write is private, bytes to a browser, cached the least Blob allows and never under a random name; every read skips the cache', async () => {
    const blob = recordedBlob();
    const s = await sharedStore(blob, randomBytes(32));
    await s.putClientBytes(quarantineKeyFor('d1'), PDF());
    await s.putText(retainedTextKeyFor('d1'), 'text');
    await s.copy(quarantineKeyFor('d1'), durableKeyFor('d1'));
    await s.get(quarantineKeyFor('d1'));
    const puts = blob.calls.filter((c) => c.op === 'put');
    assert.equal(puts.length, 3);
    for (const p of puts) {
      assert.deepEqual(p.opts, { access: 'private', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60, contentType: 'application/octet-stream' });
      assert.ok(p.pathname.startsWith(SO.SHARED_PREFIX));
    }
    for (const g of blob.calls.filter((c) => c.op === 'get')) assert.deepEqual(g.opts, { access: 'private', useCache: false });
  });

  test('a read-write token goes to the SDK on every call and nowhere else; with none, the SDK signs itself in by Vercel\'s OIDC', async () => {
    const withToken = recordedBlob();
    const s = await sharedStore(withToken, null, INVENTED_DB_TOKEN, 'invented-blob-token');
    await s.putClientBytes(quarantineKeyFor('d2'), PDF());
    await s.get(quarantineKeyFor('d2'));
    await s.delete(quarantineKeyFor('d2'));
    for (const c of withToken.calls) assert.equal(c.opts['token'], 'invented-blob-token', `${c.op} went without the token`);
    const oidc = recordedBlob();
    const t = await sharedStore(oidc);
    await t.putClientBytes(quarantineKeyFor('d3'), PDF());
    for (const c of oidc.calls) assert.equal('token' in c.opts, false);
  });

  test('the store is private: a store made public by mistake refuses the write, and the upload fails rather than landing in public', async () => {
    const blob = recordedBlob();
    const publicStore = { ...blob.sdk, async put(p: string, b: Buffer, o: Record<string, unknown>) { void p; void b; void o; throw new Error('Vercel Blob: Cannot use private access on a public store'); } };
    const s = new SO.SharedObjectStore({ client: await SO.vercelBlobClient({}, publicStore), linkSecret: SO.uploadLinkSecret(INVENTED_DB_TOKEN) });
    await assert.rejects(() => s.putClientBytes(quarantineKeyFor('d4'), PDF()), /public store/);
    assert.equal(blob.objects.size, 0);
  });

  test('a deletion is proved: a missing object throws, and so does one the store kept after deleting it', async () => {
    const blob = recordedBlob();
    const s = await sharedStore(blob);
    await s.putClientBytes(quarantineKeyFor('d5'), PDF());
    await s.delete(quarantineKeyFor('d5'));
    await assert.rejects(() => s.get(quarantineKeyFor('d5')), /object not found/);
    await assert.rejects(() => s.delete(quarantineKeyFor('d5')), /object not found/, 'a missing object read as a deletion');
    const sticky = recordedBlob({ deleteDoesNothing: true });
    const t = await sharedStore(sticky);
    await t.putClientBytes(quarantineKeyFor('d6'), PDF());
    await assert.rejects(() => t.delete(quarantineKeyFor('d6')), /still readable after delete/);
  });

  test('a key that would escape is refused before the store is asked, and the new file serves nothing from disk and calls no network itself', async () => {
    const blob = recordedBlob();
    const s = await sharedStore(blob);
    for (const bad of ['../x', '/abs', 'quarantine/../../x', '']) await assert.rejects(() => s.get(bad));
    assert.equal(blob.calls.length, 0);
    const src = readFileSync(join(HERE, 'src', 'web', 'shared-objectstore.ts'), 'utf8');
    await assertNoStaticFileRoute(src);
    assert.equal(/\bfetch\s*\(/.test(src), false, 'only src/connectors/http.ts may call fetch');
  });
});

describe('151i · 3 · switched off, nothing changes', () => {
  const LASTING = { location: 'libsql://invented.turso.io', authToken: INVENTED_DB_TOKEN, why: 'x' };
  const MEMORY = { location: ':memory:', why: 'no lasting database is set, so the records are kept in memory' };

  test('the switch: a store only with the lasting database AND a store setting; every lesser combination keeps the folder, and says why without a token or an id', async () => {
    const { sharedDocumentStore } = await entry();
    const cases: [Record<string, string>, Lasting, boolean][] = [
      [{}, LASTING, false],
      [{ BLOB_STORE_ID: 'store_invented151i' }, MEMORY, false],
      [{ BLOB_READ_WRITE_TOKEN: 'invented-rw-token' }, MEMORY, false],
      [{ BLOB_STORE_ID: '   ' }, LASTING, false],
      [{ BLOB_STORE_ID: 'store_invented151i' }, LASTING, true],
      [{ BLOB_READ_WRITE_TOKEN: 'invented-rw-token' }, LASTING, true],
      [{ CAPREBATE_BLOB_TOKEN: 'invented-ours' }, LASTING, true],
    ];
    for (const [env, lasting, want] of cases) {
      const d = sharedDocumentStore(env, lasting);
      assert.equal(d.shared, want, JSON.stringify(env));
      for (const secret of ['store_invented151i', 'invented-rw-token', 'invented-ours', INVENTED_DB_TOKEN]) assert.equal(d.why.includes(secret), false);
      if (!want) assert.match(d.why, /temporary disk/);
    }
    assert.equal(sharedDocumentStore({ BLOB_STORE_ID: 'store_invented151i' }, LASTING).token, undefined, 'OIDC needs no token of ours');
    assert.equal(sharedDocumentStore({ CAPREBATE_BLOB_TOKEN: 'invented-ours', BLOB_READ_WRITE_TOKEN: 'invented-rw-token' }, LASTING).token, 'invented-ours', 'ours wins');
  });

  test('no options unless shared; and a lasting database that did not open keeps the folder, whatever the store settings say', async () => {
    const { sharedDocumentOptions, documentsWhy, openLasting } = await entry();
    assert.deepEqual(await sharedDocumentOptions({ shared: false }, LASTING), {});
    assert.deepEqual(await sharedDocumentOptions({ shared: true }, MEMORY), {});
    const blob = recordedBlob();
    const opts = await sharedDocumentOptions({ shared: true }, LASTING, blob.sdk);
    assert.ok('sharedDocuments' in opts);
    assert.match(documentsWhy({ shared: true, why: 'kept in the private document store' }, false), /temporary disk/);
    // The lasting database cannot be opened: memory, and the store goes with it.
    const failing = (async (loc: string, o: object) => {
      if (loc !== ':memory:') throw Object.assign(new Error('invented refusal'), { code: 'ECONNREFUSED' });
      return createApp(loc, o);
    }) as typeof createApp;
    const root = mkdtempSync(join(tmpdir(), 'cb-151i-off-'));
    const o = await openLasting(failing, seed, LASTING, { documentRoot: root, now: () => NOW }, 0, opts);
    try {
      assert.equal(o.lasting, false);
      assert.equal(o.made.store instanceof SO.SharedObjectStore, false, 'memory records with a shared store');
      await o.made.store.putClientBytes(quarantineKeyFor('d7'), PDF());
      assert.equal(existsSync(join(root, quarantineKeyFor('d7'))), true, 'the folder is no longer used');
      assert.equal(blob.calls.length, 0);
    } finally { o.made.close(); }
  });

  test('createApp without the option is the folder store it always was', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cb-151i-plain-'));
    const made = await createApp(':memory:', { documentRoot: root, now: () => NOW });
    try {
      assert.equal(made.store instanceof SO.SharedObjectStore, false);
      assert.equal(made.store.root, root);
      await made.store.putClientBytes(quarantineKeyFor('d8'), PDF());
      assert.equal(existsSync(join(root, quarantineKeyFor('d8'))), true);
    } finally { made.close(); }
  });

  test('the entry point decides the store from the website\'s settings and hands it only to the lasting database', () => {
    const src = readFileSync(join(REPO, 'api', 'index.mjs'), 'utf8');
    const build = src.slice(src.indexOf('async function build()'), src.indexOf('export async function configureTestDeploy'));
    assert.match(build, /sharedDocumentStore\(process\.env, lasting\)/);
    assert.match(build, /openLasting\(createApp, seed, lasting, \{[\s\S]*?\}, 10_000, await sharedDocumentOptions\(docs, lasting\)\)/);
    assert.match(src, /createApp\(lasting\.location, \{ \.\.\.opts, \.\.\.lastingOnly, dbAuthToken: lasting\.authToken \}\)/);
    assert.match(src, /const made = await createApp\(':memory:', opts\);/, 'memory must never get the shared store');
  });
});

describe('151i · 4 · the audit log on a database two copies share', () => {
  const openPair = () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cb-151i-audit-')), 'shared.db');
    const a = new Db(file);
    migrate(a, join(HERE, 'migrations'));
    const b = new Db(file);
    return { file, a, b };
  };
  const row = (n: string) => ({ at: NOW, kind: 'LOGIN_SUCCEEDED' as const, outcome: 'ALLOWED' as const, actor_id: n, detail: { n } });

  test('two handles appending in turn: one chain, every number once, intact', () => {
    const { a, b } = openPair();
    try {
      const la = new AuditLog(a);
      const lb = new AuditLog(b);
      for (let i = 0; i < 6; i++) (i % 2 === 0 ? la : lb).append(row(`turn-${i}`));
      const e = la.entries();
      assert.deepEqual(e.map((x) => x.seq), [1, 2, 3, 4, 5, 6]);
      assert.deepEqual(lb.verify(), { intact: true, broken_at: null });
    } finally { a.close(); b.close(); }
  });

  for (const when of ['after its first read of the chain', 'just before its write'] as const) {
    test(`interleaved: the other copy appends ${when} - both rows kept, the chain intact`, () => {
      const { a, b } = openPair();
      try {
        const lb = new AuditLog(b);
        lb.append(row('first'));
        let slipped = false;
        const slip = (): void => { if (!slipped) { slipped = true; lb.append(row('the other copy')); } };
        // Handle A, with the other copy's append slipped in between its reading the chain and its writing to it.
        const racing = new Proxy(a, {
          get(t, p) {
            if (p === 'get' && when === 'after its first read of the chain') {
              return (sql: string, params?: readonly unknown[]) => {
                const r = t.get(sql, params as never);
                if (/FROM audit_log/.test(sql)) slip();
                return r;
              };
            }
            if (p === 'run' && when === 'just before its write') {
              return (sql: string, params?: readonly unknown[]) => {
                if (/INSERT INTO audit_log/.test(sql)) slip();
                return t.run(sql, params as never);
              };
            }
            const v = Reflect.get(t, p, t) as unknown;
            return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
          },
        }) as Db;
        const mine = new AuditLog(racing).append(row('this copy'));
        assert.equal(slipped, true, 'the test never interleaved');
        const e = new AuditLog(a).entries();
        assert.deepEqual(e.map((x) => x.actor_id), ['first', 'the other copy', 'this copy'], 'a request was lost, or the order is wrong');
        assert.equal(mine.seq, 3);
        assert.deepEqual(new AuditLog(b).verify(), { intact: true, broken_at: null }, 'the chain forked');
      } finally { a.close(); b.close(); }
    });
  }

  test('two processes: while another holds a write, an audited action waits for it rather than failing, and follows it', async () => {
    const { file, a, b } = openPair();
    b.close();
    const url = (p: string) => pathToFileURL(join(HERE, 'src', p)).href;
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      const { Db } = await import(${JSON.stringify(url('db.ts'))});
      const { AuditLog } = await import(${JSON.stringify(url('audit.ts'))});
      const db = new Db(${JSON.stringify(file)});
      db.tx(() => {
        new AuditLog(db).append({ at: ${JSON.stringify(NOW)}, kind: 'LOGIN_SUCCEEDED', outcome: 'ALLOWED', actor_id: 'the other process', detail: {} });
        process.stdout.write('locked\\n');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
      });
      db.close();
    `], { stdio: ['ignore', 'pipe', 'inherit'] });
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (d: Buffer) => { if (d.toString().includes('locked')) resolve(); });
        child.on('exit', () => reject(new Error('the other process ended before it held its write')));
      });
      const la = new AuditLog(a);
      a.tx(() => la.append(row('this process')));
      await new Promise((r) => child.on('exit', r));
      assert.deepEqual(la.entries().map((x) => x.actor_id), ['the other process', 'this process']);
      assert.deepEqual(la.verify(), { intact: true, broken_at: null });
    } finally {
      child.kill();
      a.close();
    }
  });

  test('verify-audit reads the shared file and finds it intact', async () => {
    const { file, a, b } = openPair();
    try {
      for (let i = 0; i < 4; i++) new AuditLog(i % 2 === 0 ? a : b).append(row(`v-${i}`));
    } finally { a.close(); b.close(); }
    const r = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const p = spawn(process.execPath, [join(HERE, 'src', 'cli.ts'), 'verify-audit'], { env: { ...process.env, CAPREBATE_DB: file }, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      p.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      p.on('exit', (code) => resolve({ code, out }));
    });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /audit log intact: 4 entries/);
  });
});

describe('151i follow-up · why the lasting database would not open, in the library\'s own words', () => {
  // What libsql 0.5.29 throws when a remote open fails, measured on this Mac on 28 Sep 2026: an Error whose code is
  // EMPTY and whose message carries everything. The live test website logged "could not be opened ()" from exactly this.
  const ADDRESS = 'libsql://caprebate-invented-151i.aws-us-east-1.turso.io';
  const TOKEN = 'eyJhbGciOiJFZERTQSJ9.eyJpbnZlbnRlZCI6dHJ1ZX0.aW52ZW50ZWQtc2lnbmF0dXJl';
  const lasting = { location: ADDRESS, authToken: TOKEN, why: 'the records are kept in the lasting database' };
  const libsqlError = (message: string) => Object.assign(new Error(message), { code: '' });
  type WithFailure = { openFailure: (e: unknown, l: Lasting) => string };

  test('the reason names what went wrong, and never the address, its host or the token, even when the library repeats them', async () => {
    const { openFailure } = (await entry()) as unknown as WithFailure;
    const refused = openFailure(libsqlError('Hrana(Http("error trying to connect: tcp connect error: Connection refused (os error 61)"))'), lasting);
    assert.match(refused, /^Error: Hrana\(Http\("error trying to connect: tcp connect error: Connection refused/);
    const told = openFailure(libsqlError(`Hrana(Api("status=401 Unauthorized, token ${TOKEN} refused by caprebate-invented-151i.aws-us-east-1.turso.io at ${ADDRESS}"))`), lasting);
    assert.match(told, /401 Unauthorized/);
    for (const secret of [TOKEN, ADDRESS, 'caprebate-invented-151i', 'eyJ']) assert.equal(told.includes(secret), false, `the reason carries ${secret}`);
    const other = openFailure(libsqlError(`failed for another-db.turso.io with eyJvdGhlciI6MX0.eyJ4IjoxfQ.c2ln and https://x.example.invalid/y`), lasting);
    assert.equal(/turso\.io|eyJ|example\.invalid/.test(other), false, other);
    assert.ok(openFailure(libsqlError('x'.repeat(1000)), lasting).length <= 'Error: '.length + 200);
    assert.equal(openFailure(Object.assign(new Error(''), { code: 'ECONNREFUSED' }), lasting), 'ECONNREFUSED');
  });

  test('the website falls back to memory and its log line says why, in words', async () => {
    const { openLasting } = await entry();
    const failing = (async (loc: string, o: object) => {
      if (loc !== ':memory:') throw libsqlError(`Hrana(Api("status=404 Not Found: database ${ADDRESS} does not exist"))`);
      return createApp(loc, o);
    }) as typeof createApp;
    const o = await openLasting(failing, seed, lasting, { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151i-why-')), now: () => NOW }, 0);
    try {
      assert.equal(o.lasting, false);
      assert.match(o.why, /^the lasting database could not be opened \(Error: Hrana\(Api\("status=404 Not Found: database \[hidden\] does not exist"\)\)\), so the records are kept in memory$/);
      assert.equal(o.why.includes(ADDRESS) || o.why.includes(TOKEN), false);
    } finally { o.made.close(); }
  });
});

describe('151i follow-up 3 · a first start cut off while it built the tables', () => {
  // The live test website, 28 Sep 2026, 11:28: "the lasting database could not be opened (Error: Hrana(Api("SQLite input
  // error: table claim_facts already exists (at offset 13)"))), so the records are kept in memory". vercel.json's own
  // limit of 30 seconds had stopped the first start part way through the migrations.
  test('the log line says what to do: the tables were left part built - empty the database in Turso and redeploy', async () => {
    const { openLasting } = await entry();
    const lasting = { location: 'libsql://invented-151i.turso.io', authToken: 'invented-token-151i', why: 'x' };
    const failing = (async (loc: string, o: object) => {
      if (loc !== ':memory:') throw Object.assign(new Error('Hrana(Api("SQLite input error: table claim_facts already exists (at offset 13)"))'), { code: '' });
      return createApp(loc, o);
    }) as typeof createApp;
    const o = await openLasting(failing, seed, lasting, { documentRoot: mkdtempSync(join(tmpdir(), 'cb-151i-half-')), now: () => NOW }, 0);
    try {
      assert.equal(o.lasting, false);
      assert.match(o.why, /table claim_facts already exists .*\): the tables were left part built - empty the database in Turso and redeploy, so the records are kept in memory$/);
    } finally { o.made.close(); }
  });

  test('the website\'s time limit leaves a first start room: 300 seconds, the most Vercel\'s Hobby plan allows (read 28 Sep 2026)', () => {
    const v = JSON.parse(readFileSync(join(REPO, 'vercel.json'), 'utf8')) as { functions: Record<string, { maxDuration?: number }> };
    assert.equal(v.functions['api/index.mjs']?.maxDuration, 300);
  });
});

describe('151i follow-up 4 · the lasting database is built once, while Vercel builds the deploy', () => {
  // The live website, 28 Sep 2026: copies started in pairs (11:46:09.38 and .70; 11:50:02 and :06) on one empty Turso
  // database and both migrated and seeded - "duplicate column name: legal_name", then "a seed that never finished".
  type Prep = { prepareLasting: (c: typeof createApp, s: typeof seed, l: Lasting, o?: object) => Promise<{ prepared: boolean; why: string }> };
  const stand = () => ({ location: join(mkdtempSync(join(tmpdir(), 'cb-151i-prep-')), 'turso-stand-in.db'), authToken: 'invented-token-151i-prep', why: 'the records are kept in the lasting database' });
  const opts = () => ({ documentRoot: mkdtempSync(join(tmpdir(), 'cb-151i-prep-docs-')), now: () => NOW });

  test('the build makes the tables and the seed once; a second build and every copy after it find them finished and add nothing', async () => {
    const { prepareLasting, openLasting } = (await entry()) as unknown as Prep & EntryPoint;
    const l = stand();
    const first = await prepareLasting(createApp, seed, l, opts());
    assert.deepEqual(first, { prepared: true, why: 'the lasting database is built and seeded (its first time)' });
    const again = await prepareLasting(createApp, seed, l, opts());
    assert.deepEqual(again, { prepared: true, why: 'the lasting database was already built; its tables are up to date' });
    // Two copies starting together now both find it finished: nothing to migrate, nothing to seed, no collision.
    const [a, b] = await Promise.all([openLasting(createApp, seed, l, opts(), 0), openLasting(createApp, seed, l, opts(), 0)]);
    try {
      for (const o of [a, b]) {
        assert.equal(o.lasting, true);
        assert.doesNotMatch(o.why, /seeded now/);
      }
      assert.ok((a.made.app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')?.n ?? 0) > 0);
    } finally { a.made.close(); b.made.close(); }
  });

  test('with no lasting database it does nothing; a database that cannot be built is reported without its address or token', async () => {
    const { prepareLasting } = (await entry()) as unknown as Prep;
    const none = await prepareLasting(createApp, seed, { location: ':memory:', why: 'no lasting database is set, so the records are kept in memory' }, opts());
    assert.deepEqual(none, { prepared: false, why: 'nothing to prepare, because no lasting database is set, so the records are kept in memory' });
    const l = { location: 'libsql://invented-151i-prep.turso.io', authToken: 'invented-token-151i-prep', why: 'x' };
    const failing = (async () => { throw Object.assign(new Error('Hrana(Api("SQLite error: duplicate column name: legal_name"))'), { code: '' }); }) as unknown as typeof createApp;
    const r = await prepareLasting(failing, seed, l, opts());
    assert.equal(r.prepared, false);
    assert.match(r.why, /duplicate column name: legal_name.*the tables were left part built - empty the database in Turso and redeploy$/);
    assert.equal(r.why.includes('invented-151i-prep') || r.why.includes('invented-token'), false);
  });

  test('vercel.json runs the build step, which sits outside api/ (every file there is a public address) and always exits 0', async () => {
    const v = JSON.parse(readFileSync(join(REPO, 'vercel.json'), 'utf8')) as { buildCommand: string };
    assert.equal(v.buildCommand, 'node Caprebate/09-app/backend/tools/prepare-lasting.mjs');
    assert.deepEqual(readdirSync(join(REPO, 'api')).filter((f) => !f.includes('.bak')), ['index.mjs'], 'a second file in api/ would be a public address');
    const env = { ...process.env };
    for (const k of ['CAPREBATE_DB_URL', 'CAPREBATE_DB_TOKEN', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'CAPREBATE_TEST_PASSWORD']) delete env[k];
    const r = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const p = spawn(process.execPath, [join(HERE, 'tools', 'prepare-lasting.mjs')], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      p.stdout.on('data', (d: Buffer) => { out += d.toString(); });
      p.on('exit', (code) => resolve({ code, out }));
    });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^build: nothing to prepare, because no lasting database is set/);
  });
});
