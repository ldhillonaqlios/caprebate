/**
 * 2 OCTOBER 2026 — FULL-SIZE PHOTOS, SENT STRAIGHT TO THE FILE STORE, LOCKED ON THE PHONE (src/web/photo-upload.ts,
 * src/web/photo-upload-script.ts, the store's incoming steps; migration 076).
 *
 * Lakhbir: "go with option 2"; "Lock on the phone"; "100 photos, 25 MB each"; "Yes, build it as shown".
 *
 * Proven here, with the page's OWN SCRIPT locking each photo exactly as a phone does (run in Node's Web Crypto):
 *   · a photo locked on the phone opens only with its send's private half; a changed byte, another send's key or a
 *     strange file opens nothing; the private half is kept only encrypted with the store's key;
 *   · a send: only a client of that company, with the tick, 1 to 100 photos, with the key set; a slot: only in one's own
 *     send, in range, once each, at most 25 MB locked, before the send runs out;
 *   · done: opened, checked, cleaned, encrypted and kept as not yet sorted; the locked upload removed whatever happens;
 *     a non-photo or a changed upload refused and recorded once; one not yet arrived asked for again; done twice, the
 *     same answer;
 *   · on the test website the phone is given a one-time Blob address for exactly that file, private, size-capped and
 *     short-lived, never another site's; our own route then refuses;
 *   · the sweep removes an upload never finished after a day, at the next send or when the outside timer wakes the site;
 *   · the page: its own script, allowed by its own policy and no other page's; the whole send over HTTP; full-size
 *     photos fit the photos table now; nothing new is ever edited or deleted.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { constants, createHash, privateDecrypt, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createApp } from '../src/server.ts';
import { FsObjectStore } from '../src/web/objectstore.ts';
import { SharedObjectStore, vercelBlobClient, BLOB_UPLOAD_ORIGIN, type VercelBlobSdk } from '../src/web/shared-objectstore.ts';
import { PHOTO_UPLOAD_JS } from '../src/web/photo-upload-script.ts';
import * as U from '../src/web/photo-upload.ts';
import * as E from '../src/web/survey-evidence.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { actor } from './helpers.ts';

/* ------------------------------------------------------------------ the phone's lock, from the page's own script */

type Lock = (key: string, bytes: Uint8Array) => Promise<Uint8Array>;
function phoneLock(): Lock {
  const ctx: Record<string, unknown> = { crypto: globalThis.crypto, atob, Uint8Array, Math, String };
  vm.createContext(ctx);
  vm.runInContext(PHOTO_UPLOAD_JS, ctx);
  return (ctx['CapRebatePhotoLock'] as { lockPhoto: Lock }).lockPhoto;
}
const lockPhoto = phoneLock();

const PIXELS = Buffer.from('PIXELS-OF-THE-PLANT-ROOM-'.repeat(8), 'latin1');
const seg = (m: number, p: string) => { const b = Buffer.from(p, 'latin1'); return Buffer.concat([Buffer.from([0xff, m, (b.length + 2) >> 8, (b.length + 2) & 255]), b]); };
const JPEG_CLEAN = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'), seg(0xda, '\x01\x01\0\0\x3f\0'), PIXELS, Buffer.from([0xff, 0xd9])]);
const JPEG = Buffer.concat([JPEG_CLEAN.subarray(0, 20), seg(0xe1, 'Exif\0\0GPS 51.5072N iPhone 15 Pro'), JPEG_CLEAN.subarray(20)]);

/* ------------------------------------------------------------------ the app */

const T0 = '2026-10-02T09:00:00.000Z';
let clock = T0;
const PASSWORD = 'a-very-long-development-password';
const JOB = 'job-pu-1';
const CLIENT = actor('CLIENT', 'u-pu-client', 'b-pu');
const OTHER = actor('CLIENT', 'u-pu-other', 'b-pu-other');
const COLLEAGUE = actor('CLIENT', 'u-pu-colleague', 'b-pu');
const ADMIN = actor('ADMIN', 'u-pu-admin');
const ROOT = mkdtempSync(join(tmpdir(), 'cb-pu-'));
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let n = 0;
const deps = () => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `pu-${(++n).toString().padStart(6, '0')}` });
const later = (hours: number) => new Date(Date.parse(T0) + hours * 3_600_000).toISOString();

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: ROOT, now: () => clock, sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-pu', 'Upload Practice Limited', 'gp', 'SURVEY', T0, 'COMPANY']);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-pu-other', 'Other Practice Limited', 'gp', 'SURVEY', T0, 'COMPANY']);
  for (const [id, role, name, biz] of [['u-pu-client', 'CLIENT', 'Cleo Client', 'b-pu'], ['u-pu-other', 'CLIENT', 'Otto Other', 'b-pu-other'], ['u-pu-admin', 'ADMIN', 'Ada Admin', null], ['u-pu-colleague', 'CLIENT', 'Col League', 'b-pu'], ['u-pu-sam', 'SURVEYING', 'Sam Surveyor', null]] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T0, T0, biz]);
  }
  db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-pu', 'b-pu', 'gp', T0, 100, 200, T0]);
  db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [JOB, 'b-pu', 'as-pu', 'u-pu-sam', 'SEALED', null, T0, null]);
  db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', ['job-pu-2', 'b-pu', 'as-pu', 'u-pu-sam', 'SEALED', null, later(1), null]);
  for (const w of ['u-pu-client', 'u-pu-other']) {
    await req(w, '/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ email: `${w}@example.invalid`, password: PASSWORD }).toString() });
  }
});
after(() => made.close());

const jars = new Map<string, string>();
async function req(who: string, path: string, init: RequestInit = {}) {
  let cookie = jars.get(who) ?? '';
  const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
  for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
  jars.set(who, cookie);
  return { status: r.status, body: await r.text(), headers: r.headers };
}
const post = (who: string, path: string, form: Record<string, string>) => req(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const start = (who = CLIENT, f: Partial<{ job_id: string; photos: string; nobody: string; note: string }> = {}, store: FsObjectStore = made.store) =>
  U.startUpload(deps(), store, who, { job_id: JOB, photos: '3', nobody: 'yes', note: '', ...f });
const privateKeyOf = (session: string) => made.store.openBytes(Buffer.from(made.app.db.get<{ k: string }>('SELECT private_key_sealed AS k FROM survey_upload_sessions WHERE id = ?', [session])!.k, 'base64'));

describe('the lock on the phone', () => {
  test('a photo locked by the page’s own script opens only with its send’s private half; a changed byte or another key opens nothing', async () => {
    const a = start();
    const b = start();
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    const locked = await lockPhoto(a.key, JPEG);
    assert.equal(locked.length, JPEG.length + U.LOCK_OVERHEAD);
    assert.ok(!Buffer.from(locked).includes(PIXELS.subarray(0, 16)) && !Buffer.from(locked).includes(Buffer.from('GPS')), 'the photo is readable once locked');
    assert.deepEqual(U.unlockPhoto(privateKeyOf(a.session), locked), JPEG);
    assert.equal(U.unlockPhoto(privateKeyOf(b.session), locked), null, 'another send’s key opened it');
    for (const at of [0, 6, 100, 7 + 256 + 3, locked.length - 1]) {
      const bad = Buffer.from(locked); bad[at] = (bad[at] ?? 0) ^ 1;
      assert.equal(U.unlockPhoto(privateKeyOf(a.session), bad), null, `a changed byte at ${String(at)} opened`);
    }
    assert.equal(U.unlockPhoto(privateKeyOf(a.session), locked.subarray(0, U.LOCK_OVERHEAD)), null, 'cut short');
    assert.equal(U.unlockPhoto(privateKeyOf(a.session), JPEG), null, 'an unlocked photo');
    // Two locks of the same photo differ: a fresh random key and nonce every time.
    const again = await lockPhoto(a.key, JPEG);
    assert.notDeepEqual(again, locked);
    const keyOf = (x: Uint8Array) => privateDecrypt({ key: privateKeyOf(a.session), format: 'der', type: 'pkcs8', padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(x.subarray(7, 7 + 256)));
    assert.notDeepEqual(keyOf(again), keyOf(locked), 'the same key locked two photos');
    assert.notDeepEqual(keyOf(locked), Buffer.alloc(32), 'a key of nothing but zeros');
  });

  test('the private half is kept only encrypted with the store’s key; the public half is what the phone gets', () => {
    const r = start();
    assert.ok(r.ok);
    if (!r.ok) return;
    const row = made.app.db.get<{ public_key: string; private_key_sealed: string; expires_at: string }>('SELECT public_key, private_key_sealed, expires_at FROM survey_upload_sessions WHERE id = ?', [r.session])!;
    assert.equal(row.public_key, r.key);
    assert.equal(Buffer.from(row.private_key_sealed, 'base64').subarray(0, 7).toString('latin1'), 'CBORIG1', 'not sealed with the store’s key');
    assert.equal(row.expires_at, later(U.SEND_HOURS));
    assert.equal(r.max_bytes, U.MAX_LOCKED_BYTES);
  });
});

describe('a send', () => {
  test('only a client of that company, with the tick, 1 to 100 photos, a short note, and the key set', () => {
    for (const who of [OTHER, ADMIN]) assert.throws(() => start(who), /not authorised|NotAuthorised/i, who.id);
    const no = (f: Parameters<typeof start>[1], why: RegExp, store?: FsObjectStore) => { const r = start(CLIENT, f, store); assert.equal(r.ok, false); if (!r.ok) assert.match(r.why, why); };
    no({ nobody: '' }, /nobody is in the photos/);
    no({ photos: '0' }, /Choose your photos first/);
    no({ photos: 'x' }, /Choose your photos first/);
    no({ photos: '101' }, /at most 100 photos/);
    no({ note: 'x'.repeat(501) }, /under 500/);
    no({}, /key that encrypts them is not set/, new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-pu-nokey-')), now: made.app.now, sealKey: null }));
    assert.equal(start(CLIENT, { photos: '100' }).ok, true);
  });

  test('a slot: in one’s own send only, in range, once each, at most 25 MB locked, before the send runs out; here our own route', async () => {
    const r = start();
    assert.ok(r.ok);
    if (!r.ok) return;
    await assert.rejects(U.slotFor(deps(), made.store, OTHER, r.session, { n: '1', size: '1000' }), /not authorised|NotAuthorised/i);
    await assert.rejects(U.slotFor(deps(), made.store, CLIENT, 'no-such-send', { n: '1', size: '1000' }), /not authorised|NotAuthorised/i);
    await assert.rejects(U.slotFor(deps(), made.store, COLLEAGUE, r.session, { n: '1', size: '1000' }), /not authorised|NotAuthorised/i, 'a colleague used another person’s send');
    const no = async (f: { n: string; size: string }, why: RegExp) => { const x = await U.slotFor(deps(), made.store, CLIENT, r.session, f); assert.equal(x.ok, false); if (!x.ok) assert.match(x.why, why); };
    await no({ n: '0', size: '1000' }, /not one of this send/);
    await no({ n: '4', size: '1000' }, /not one of this send/);
    await no({ n: '1', size: String(U.LOCK_OVERHEAD) }, /empty/);
    await no({ n: '1', size: String(U.MAX_LOCKED_BYTES + 1) }, /too big\. The most is 25 MB/);
    const s = await U.slotFor(deps(), made.store, CLIENT, r.session, { n: '1', size: String(U.MAX_LOCKED_BYTES) });
    assert.ok(s.ok);
    if (s.ok) assert.deepEqual([s.url, s.headers], [`/portal/building/upload/${r.session}/slot/${s.slot}`, {}]);
    await no({ n: '1', size: '1000' }, /already been sent/);
    clock = later(U.SEND_HOURS);
    await no({ n: '2', size: '1000' }, /run out of time/);
    clock = T0;
  });
});

describe('done', () => {
  const send = async (bytes: Uint8Array, opts: { lockedWith?: string; change?: number } = {}) => {
    const r = start(CLIENT, { note: 'the plant room' });
    assert.ok(r.ok);
    if (!r.ok) throw new Error('no send');
    const locked = Buffer.from(await lockPhoto(opts.lockedWith ?? r.key, bytes));
    if (opts.change !== undefined) locked[opts.change] = (locked[opts.change] ?? 0) ^ 1;
    const s = await U.slotFor(deps(), made.store, CLIENT, r.session, { n: '1', size: String(locked.length) });
    assert.ok(s.ok);
    if (!s.ok) throw new Error('no slot');
    const staged = made.app.db.get<{ k: string }>('SELECT staged_key AS k FROM survey_upload_slots WHERE id = ?', [s.slot])!.k;
    return { r, s, locked, staged };
  };

  test('opened, checked, cleaned, encrypted and kept as not yet sorted; the locked upload removed; done twice, the same answer', async () => {
    const { r, s, locked, staged } = await send(JPEG);
    assert.deepEqual(await U.finishSlot(deps(), made.store, CLIENT, r.session, s.slot), { ok: false, why: 'That photo has not arrived yet. Send it again.' });
    assert.equal(made.app.db.get('SELECT 1 AS x FROM survey_upload_outcomes WHERE slot_id = ?', [s.slot]), undefined, 'not arriving was recorded as an outcome');
    assert.equal((await U.putLocal(deps(), made.store, OTHER, r.session, s.slot, locked).catch((e: Error) => ({ ok: false, why: e.message }))).ok, false);
    assert.equal((await U.putLocal(deps(), made.store, CLIENT, r.session, s.slot, Buffer.concat([locked, Buffer.from([0])]))).ok, false, 'bigger than it said');
    assert.deepEqual(await U.putLocal(deps(), made.store, CLIENT, r.session, s.slot, locked), { ok: true });
    assert.ok(existsSync(join(ROOT, staged)));
    const done = await U.finishSlot(deps(), made.store, CLIENT, r.session, s.slot);
    assert.ok(done.ok);
    if (!done.ok) return;
    const row = made.app.db.get<{ item_key: string; byte_size: number; sha256: string; note: string; object_key: string }>('SELECT item_key, byte_size, sha256, note, object_key FROM survey_photos WHERE id = ?', [done.photo])!;
    assert.deepEqual([row.item_key, row.byte_size, row.note], [E.UNSORTED, JPEG_CLEAN.length, 'the plant room']);
    assert.equal(row.sha256, createHash('sha256').update(JPEG_CLEAN).digest('hex'), 'its hidden details were not taken out');
    assert.deepEqual(await made.store.getSealed(row.object_key), JPEG_CLEAN);
    assert.ok(!existsSync(join(ROOT, staged)), 'the locked upload was kept');
    assert.deepEqual({ ...made.app.db.get('SELECT outcome, photo_id, why FROM survey_upload_outcomes WHERE slot_id = ?', [s.slot]) }, { outcome: 'KEPT', photo_id: done.photo, why: null });
    assert.deepEqual(await U.finishSlot(deps(), made.store, CLIENT, r.session, s.slot), done, 'done twice');
    assert.ok(E.unsortedOf(made.app.db, JOB).some((p) => p.id === done.photo), 'not waiting to be sorted');
  });

  test('a non-photo, a changed upload, or one locked for another send is refused once, in words, and its upload removed', async () => {
    const other = start();
    assert.ok(other.ok);
    for (const [bytes, opts, why] of [
      [Buffer.from('GIF89a, not a photo at all'), {}, /JPEG or PNG/],
      [JPEG, { change: 300 }, /could not be opened/],
      [JPEG, { lockedWith: other.ok ? other.key : '' }, /could not be opened/],
    ] as const) {
      const { r, s, locked, staged } = await send(bytes, opts);
      assert.deepEqual(await U.putLocal(deps(), made.store, CLIENT, r.session, s.slot, locked), { ok: true });
      const done = await U.finishSlot(deps(), made.store, CLIENT, r.session, s.slot);
      assert.equal(done.ok, false);
      if (!done.ok) assert.match(done.why, why);
      assert.ok(!existsSync(join(ROOT, staged)), 'a refused upload was kept');
      assert.equal(made.app.db.get<{ o: string }>('SELECT outcome AS o FROM survey_upload_outcomes WHERE slot_id = ?', [s.slot])!.o, 'REFUSED');
      assert.deepEqual(await U.finishSlot(deps(), made.store, CLIENT, r.session, s.slot), done, 'asked again, the same answer');
      assert.equal((await U.putLocal(deps(), made.store, CLIENT, r.session, s.slot, locked)).ok, false, 'sent again after its outcome');
    }
  });

  test('a slot whose half hour has passed takes nothing more', async () => {
    const { r, s, locked } = await send(JPEG);
    clock = new Date(Date.parse(T0) + (U.SLOT_MINUTES + 1) * 60_000).toISOString();
    const x = await U.putLocal(deps(), made.store, CLIENT, r.session, s.slot, locked);
    clock = T0;
    assert.equal(x.ok, false);
    if (!x.ok) assert.match(x.why, /run out of time/);
  });
});

describe('the test website: straight to the file store', () => {
  /** A Blob store as @vercel/blob 2.8 answers, in memory, recording what it was asked. */
  function fakeBlob() {
    const objects = new Map<string, Buffer>();
    const asked: { issue: Record<string, unknown>[]; presign: Record<string, unknown>[]; removed: string[] } = { issue: [], presign: [], removed: [] };
    class NotFound extends Error {}
    let host = 'https://vercel.com/api/blob/';
    const sdk: VercelBlobSdk = {
      async put(p, body) { objects.set(p, Buffer.from(body)); return {}; },
      async get(p) { const b = objects.get(p); return b === undefined ? null : { statusCode: 200, stream: new Response(b).body }; },
      async head(p) { if (!objects.has(p)) throw new NotFound(); return {}; },
      async del(p) { asked.removed.push(p); objects.delete(p); },
      BlobNotFoundError: NotFound as never,
      async issueSignedToken(o) { asked.issue.push(o); return { clientSigningToken: 'invented-signing', delegationToken: 'invented-delegation' }; },
      async presignUrl(_t, o) { asked.presign.push(o); return { presignedUrl: `${host}?pathname=${encodeURIComponent(String(o['pathname']))}&vercel-blob-signature=invented` }; },
      parseStoreIdFromPresignedUrl() { return 'store_invented'; },
    };
    return { sdk, objects, asked, setHost: (h: string) => { host = h; } };
  }

  test('the phone gets a one-time address for exactly that file, private, size-capped and short-lived; our own route then refuses', async () => {
    const blob = fakeBlob();
    const store = new SharedObjectStore({ client: await vercelBlobClient({}, blob.sdk), linkSecret: randomBytes(32), now: made.app.now, sealKey: randomBytes(32) });
    assert.equal(store.incomingOrigin, BLOB_UPLOAD_ORIGIN);
    const r = start(CLIENT, {}, store);
    assert.ok(r.ok);
    if (!r.ok) return;
    const s = await U.slotFor(deps(), store, CLIENT, r.session, { n: '1', size: '5000' });
    assert.ok(s.ok);
    if (!s.ok) return;
    const path = `caprebate-documents/survey-incoming/${r.session}/${s.slot}.lock`;
    const until = Date.parse(T0) + U.SLOT_MINUTES * 60_000;
    assert.deepEqual(blob.asked.issue, [{ pathname: path, validUntil: until, maximumSizeInBytes: 5000, allowedContentTypes: ['application/octet-stream'], operations: ['put'] }]);
    assert.deepEqual(blob.asked.presign, [{ pathname: path, validUntil: until, maximumSizeInBytes: 5000, allowedContentTypes: ['application/octet-stream'], operation: 'put', access: 'private', addRandomSuffix: false, allowOverwrite: false }]);
    assert.ok(s.url.startsWith('https://vercel.com/api/blob/?pathname='));
    assert.deepEqual(s.headers, { 'x-vercel-blob-access': 'private', 'x-api-version': '12', 'x-vercel-blob-store-id': 'store_invented', 'x-content-type': 'application/octet-stream' });
    assert.deepEqual(await U.putLocal(deps(), store, CLIENT, r.session, s.slot, Buffer.from('x')), { ok: false, why: 'Photos go straight to the file store here, not through this page.' });
    // The phone sends it to the store; done reads it from there, keeps the photo, and removes the locked upload.
    blob.objects.set(path, Buffer.from(await lockPhoto(r.key, JPEG)));
    const done = await U.finishSlot(deps(), store, CLIENT, r.session, s.slot);
    assert.ok(done.ok);
    assert.ok(blob.asked.removed.includes(path) && !blob.objects.has(path));
    // An upload bigger than its slot said (the store's own limit failing) is refused, and removed.
    const s2 = await U.slotFor(deps(), store, CLIENT, r.session, { n: '3', size: '5000' });
    assert.ok(s2.ok);
    if (!s2.ok) return;
    const path2 = `caprebate-documents/survey-incoming/${r.session}/${s2.slot}.lock`;
    blob.objects.set(path2, Buffer.alloc(5001, 1));
    assert.deepEqual(await U.finishSlot(deps(), store, CLIENT, r.session, s2.slot), { ok: false, why: 'That photo is not the size it said it was.' });
    assert.ok(!blob.objects.has(path2));
    // An address on any other site is never handed to a phone: that photo goes through our own route instead.
    blob.setHost('https://evil.example.com/api/blob/');
    const s3 = await U.slotFor(deps(), store, CLIENT, r.session, { n: '2', size: '5000' });
    assert.ok(s3.ok);
    if (s3.ok) assert.ok(s3.url.startsWith(`/portal/building/upload/${r.session}/slot/`) && !s3.url.includes('evil'), s3.url);
  });

  test('when the store gives no address, a photo up to 4.4 MB comes through our own route and is kept; a bigger one is refused in words', async () => {
    const blob = fakeBlob();
    blob.sdk.issueSignedToken = async () => { throw Object.assign(new Error('Vercel Blob: Access denied at https://vercel.com/api/blob/signed-token?t=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH'), { name: 'BlobAccessError' }); };
    const store = new SharedObjectStore({ client: await vercelBlobClient({}, blob.sdk), linkSecret: randomBytes(32), now: made.app.now, sealKey: randomBytes(32) });
    const r = start(CLIENT, {}, store);
    assert.ok(r.ok);
    if (!r.ok) return;
    const big = await U.slotFor(deps(), store, CLIENT, r.session, { n: '1', size: String(U.SITE_MAX_LOCKED_BYTES + 1) });
    assert.equal(big.ok, false);
    if (!big.ok) {
      assert.match(big.why, /^This photo is over 4\.4 MB, and the direct way to our file store is not working yet/);
      assert.match(big.why, /BlobAccessError: Vercel Blob: Access denied at \[address\]/);
      assert.doesNotMatch(big.why, /abcdefghijklmnop|https:/, 'the address or a token was shown');
    }
    const locked = await lockPhoto(r.key, JPEG);
    const s = await U.slotFor(deps(), store, CLIENT, r.session, { n: '2', size: String(locked.length) });
    assert.ok(s.ok);
    if (!s.ok) return;
    assert.deepEqual([s.url, s.headers], [`/portal/building/upload/${r.session}/slot/${s.slot}`, {}]);
    const path = `caprebate-documents/survey-incoming/${r.session}/${s.slot}.site.lock`;
    assert.deepEqual(await U.putLocal(deps(), store, CLIENT, r.session, s.slot, locked), { ok: true });
    assert.ok(blob.objects.has(path), 'the fallback upload is not in the store');
    const done = await U.finishSlot(deps(), store, CLIENT, r.session, s.slot);
    assert.ok(done.ok);
    assert.ok(!blob.objects.has(path), 'the fallback upload was kept');
  });

  test('what went wrong is said safely: its kind and words, no address, no token, at most 200 characters', () => {
    assert.equal(U.failureWords(new TypeError('fetch failed')), 'TypeError: fetch failed');
    assert.equal(U.failureWords('plain words'), 'Error: plain words');
    const w = U.failureWords(new Error(`token ${'Z'.repeat(60)} at https://x.example.com/a?b=c and then ${'more words '.repeat(40)}`));
    assert.ok(w.length <= 200);
    assert.doesNotMatch(w, /ZZZZZZZZZZ|https?:/);
    assert.match(w, /^Error: token \[…\] at \[address\] and then more words/);
  });

  test('an older store client with no presigned PUT keeps photos on our own route', async () => {
    const blob = fakeBlob();
    const { issueSignedToken: _i, presignUrl: _p, parseStoreIdFromPresignedUrl: _s, ...older } = blob.sdk;
    const store = new SharedObjectStore({ client: await vercelBlobClient({}, older as VercelBlobSdk), linkSecret: randomBytes(32), now: made.app.now, sealKey: randomBytes(32) });
    assert.equal(store.incomingOrigin, null);
    assert.equal(await store.incomingTarget('survey-incoming/x/y.lock', 10, Date.now()), null);
    await assert.rejects(store.incomingTarget('documents/x', 10, Date.now()), /not an incoming key/);
  });
});

describe('the sweep', () => {
  test('an upload never finished is removed after a day and recorded once; a fresh one is left; the next send and the timer both sweep', async () => {
    const r = start();
    assert.ok(r.ok);
    if (!r.ok) return;
    const s = await U.slotFor(deps(), made.store, CLIENT, r.session, { n: '1', size: String(JPEG.length + U.LOCK_OVERHEAD) });
    assert.ok(s.ok);
    if (!s.ok) return;
    await U.putLocal(deps(), made.store, CLIENT, r.session, s.slot, await lockPhoto(r.key, JPEG));
    const staged = made.app.db.get<{ k: string }>('SELECT staged_key AS k FROM survey_upload_slots WHERE id = ?', [s.slot])!.k;
    clock = later(U.ABANDON_HOURS - 1);
    assert.equal(await U.sweepUploads(deps(), made.store), 0, 'a fresh upload was swept');
    assert.ok(existsSync(join(ROOT, staged)));
    clock = later(U.ABANDON_HOURS + 1);
    // The outside timer's wake sweeps too.
    const word = 'w'.repeat(40);
    made.app.secrets = secretsFromValues({ REPLY_TIMER_TOKEN: word });
    try {
      const hook = await fetch(`${base}/hooks/read-replies`, { method: 'POST', headers: { authorization: `Bearer ${word}` } });
      assert.equal(hook.status, 200);
    } finally { made.app.secrets = secretsFromValues({}); }
    assert.ok(!existsSync(join(ROOT, staged)), 'the timer did not sweep');
    assert.deepEqual({ ...made.app.db.get('SELECT outcome, photo_id, why FROM survey_upload_outcomes WHERE slot_id = ?', [s.slot]) }, { outcome: 'ABANDONED', photo_id: null, why: 'Never finished: removed after a day.' });
    assert.equal(await U.sweepUploads(deps(), made.store), 0, 'swept twice');
    assert.equal((await U.finishSlot(deps(), made.store, CLIENT, r.session, s.slot)).ok, false, 'an abandoned upload was kept later');
    clock = T0;
    // A new send sweeps too: an upload from more than a day before is cleared when the client next starts a send.
    clock = later(-30);
    const old = start();
    assert.ok(old.ok);
    if (!old.ok) return;
    const os = await U.slotFor(deps(), made.store, CLIENT, old.session, { n: '1', size: '1000' });
    assert.ok(os.ok);
    clock = T0;
    assert.equal((await post('u-pu-client', '/portal/building/upload/start', { job: JOB, photos: '1', nobody: 'yes', note: '' })).status, 200);
    if (os.ok) assert.equal(made.app.db.get<{ o: string }>('SELECT outcome AS o FROM survey_upload_outcomes WHERE slot_id = ?', [os.slot])?.o, 'ABANDONED', 'a new send did not sweep');
  });
});

describe('the page and the whole send over HTTP', () => {
  test('the photo page names its own script and allows it; no other portal page does; the script is served', async () => {
    const page = await req('u-pu-client', `/portal/building/photos?job=${JOB}`);
    assert.equal(page.status, 200, String(page.headers.get('location')));
    const csp = page.headers.get('content-security-policy') ?? '';
    assert.match(csp, /script-src 'self';/);
    assert.match(csp, /connect-src 'self';/, 'a copy that is not the test website sends to itself only');
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.ok(page.body.includes('<script src="/assets/photo-upload.js" defer></script></body>'));
    assert.equal((page.body.match(/<script/g) ?? []).length, 1, 'more than the one script');
    for (const id of ['many-form', 'many-progress', 'many-list', 'many-bar', 'many-end', 'many-limit', 'many-lock']) assert.ok(page.body.includes(`id="${id}"`), id);
    assert.match(page.body, /<div id="many-progress" class="ev-progress" hidden>/);
    const home = await req('u-pu-client', '/portal');
    assert.doesNotMatch(home.headers.get('content-security-policy') ?? '', /script-src/);
    const item = await req('u-pu-client', `/portal/building/item/VOIDS?job=${JOB}`);
    assert.doesNotMatch(item.headers.get('content-security-policy') ?? '', /script-src/);
    const js = await fetch(`${base}/assets/photo-upload.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') ?? '', /javascript/);
    assert.equal(await js.text(), PHOTO_UPLOAD_JS);
    assert.doesNotMatch(PHOTO_UPLOAD_JS, /\.style\b|innerHTML|eval\(|new Function/, 'the script sets a style, writes markup or runs text');
  });

  test('a whole send, as the phone does it: start, slot, send, done — and another client can do none of it', async () => {
    const before = E.unsortedOf(made.app.db, JOB).length;
    const startR = await post('u-pu-client', '/portal/building/upload/start', { job: JOB, photos: '2', nobody: 'yes', note: '' });
    assert.equal(startR.status, 200);
    const st = JSON.parse(startR.body) as { ok: boolean; session: string; key: string };
    assert.ok(st.ok);
    assert.equal((await post('u-pu-client', '/portal/building/upload/start', { job: JOB, photos: '2', nobody: '', note: '' })).status, 400);
    for (const [k, photo] of [JPEG, Buffer.from('not a photo')].entries()) {
      const locked = await lockPhoto(st.key, photo);
      const slot = JSON.parse((await post('u-pu-client', `/portal/building/upload/${st.session}/slot`, { n: String(k + 1), size: String(locked.length) })).body) as { ok: boolean; slot: string; url: string };
      assert.ok(slot.ok);
      assert.notEqual((await req('u-pu-other', slot.url, { method: 'PUT', body: locked })).status, 200, 'another client sent into it');
      const put = await req('u-pu-client', slot.url, { method: 'PUT', body: locked });
      assert.equal(put.status, 200);
      const done = await post('u-pu-client', `/portal/building/upload/${st.session}/slot/${slot.slot}/done`, {});
      assert.equal(done.status, k === 0 ? 200 : 400);
      if (k === 1) assert.match((JSON.parse(done.body) as { why: string }).why, /JPEG or PNG/);
    }
    assert.equal(E.unsortedOf(made.app.db, JOB).length, before + 1);
    assert.notEqual((await post('u-pu-other', `/portal/building/upload/${st.session}/slot`, { n: '1', size: '1000' })).status, 200);
    const tooBig = await req('u-pu-client', `/portal/building/upload/${st.session}/slot/nope`, { method: 'PUT', body: Buffer.alloc(U.MAX_LOCKED_BYTES + 10) });
    assert.equal(tooBig.status, 413);
  });

  test('a step that fails answers in words — what went wrong, never "the website did not answer"', async () => {
    // The second survey's photo folder is blocked by a file of that name, so keeping the photo fails.
    mkdirSync(join(ROOT, 'survey-photos'), { recursive: true });
    writeFileSync(join(ROOT, 'survey-photos', 'job-pu-2'), 'in the way');
    const st = JSON.parse((await post('u-pu-client', '/portal/building/upload/start', { job: 'job-pu-2', photos: '1', nobody: 'yes', note: '' })).body) as { ok: boolean; session: string; key: string };
    assert.ok(st.ok);
    const locked = await lockPhoto(st.key, JPEG);
    const slot = JSON.parse((await post('u-pu-client', `/portal/building/upload/${st.session}/slot`, { n: '1', size: String(locked.length) })).body) as { slot: string; url: string };
    assert.equal((await req('u-pu-client', slot.url, { method: 'PUT', body: locked })).status, 200);
    const done = await post('u-pu-client', `/portal/building/upload/${st.session}/slot/${slot.slot}/done`, {});
    assert.equal(done.status, 500);
    assert.match(done.headers.get('content-type') ?? '', /application\/json/);
    const body = JSON.parse(done.body) as { ok: boolean; why: string };
    assert.equal(body.ok, false);
    assert.match(body.why, /^This photo arrived but could not be kept\. Please try again later; we have been told\. \(Error: /);
  });
});

describe('the records', () => {
  test('a full-size photo fits now, and nothing over 25 MB; nothing new is ever edited or deleted', () => {
    const db = made.app.db;
    const ins = (id: string, size: number) => db.run("INSERT INTO survey_photos (id, job_id, item_key, object_key, content_type, byte_size, sha256, note, taken_by, taken_at, nobody_in_it) VALUES (?, ?, 'UNSORTED', ?, 'image/jpeg', ?, ?, NULL, 'u-pu-client', ?, 1)",
      [id, JOB, `survey-photos/${id}.jpg`, size, 'a'.repeat(64), T0]);
    ins(randomUUID(), U.MAX_FULL_PHOTO_BYTES);
    assert.throws(() => ins(randomUUID(), U.MAX_FULL_PHOTO_BYTES + 1), /CHECK/);
    for (const sql of [
      'UPDATE survey_photos SET note = note', 'DELETE FROM survey_photos',
      'UPDATE survey_upload_sessions SET note = note', 'DELETE FROM survey_upload_sessions',
      'UPDATE survey_upload_slots SET n = n', 'DELETE FROM survey_upload_slots',
      'UPDATE survey_upload_outcomes SET at = at', 'DELETE FROM survey_upload_outcomes',
    ]) assert.throws(() => db.run(sql), /never/, sql);
    assert.equal(db.get<{ n: number }>('SELECT count(*) AS n FROM pragma_foreign_key_check')!.n, 0);
  });
});
