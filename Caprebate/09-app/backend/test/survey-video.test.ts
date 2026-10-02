/**
 * 2 OCTOBER 2026 — "SHOW US YOUR BUILDING", REDESIGNED, AND A VIDEO OF THE BUILDING (src/web/survey-video.ts,
 * src/web/evidence-pages.ts, src/web/photo-upload-script.ts; migration 077).
 *
 * Lakhbir: "The UI is horrible, everything seems everywhere and there no distinction around being able to send a video";
 * "we need to add an option of upload video"; the mock-up, with "item by item needs a "i dont have this" which takes it
 * from the list when clicked"; "10 minutes, 1 GB each"; videos kept "Same as photos".
 *
 * Proven here, each piece locked with the page's own script as a phone does:
 *   · a video send: only a client of that company, with the tick, up to 1 GB, with the key set; cut into 4 MB pieces;
 *   · a piece: only in one's own send, the exact size, once; a changed piece opens nothing and is removed; kept encrypted;
 *   · the video: kept only when every piece has come; an MP4 or QuickTime file of at most ten minutes; the place it was
 *     filmed blanked in place, digit for digit, even where the header crosses two pieces; refused otherwise, its pieces
 *     removed; asked twice, the same answer;
 *   · played back a piece at a time, by range, only to the client of that company, the assigned surveyor, Admin and
 *     Sales; a video taken back is shown to nobody; a send never finished is swept after a day;
 *   · the pages: three choices; Photos with "I don't have this" taking an item off the list (and back); the video page's
 *     policy and script; a range over HTTP; the staff's videos page and chapter 2's row; nothing new edited or deleted.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createApp } from '../src/server.ts';
import { FsObjectStore } from '../src/web/objectstore.ts';
import { PHOTO_UPLOAD_JS } from '../src/web/photo-upload-script.ts';
import { LOCK_OVERHEAD } from '../src/web/photo-upload.ts';
import * as V from '../src/web/survey-video.ts';
import * as E from '../src/web/survey-evidence.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { actor } from './helpers.ts';

type Lock = (key: string, bytes: Uint8Array) => Promise<Uint8Array>;
const ctx: Record<string, unknown> = { crypto: globalThis.crypto, atob, Uint8Array, Math, String };
vm.createContext(ctx);
vm.runInContext(PHOTO_UPLOAD_JS, ctx);
const lockPiece = (ctx['CapRebatePhotoLock'] as { lockPhoto: Lock }).lockPhoto;

/* ------------------------------------------------------------------ a made-up phone video */

const box = (type: string, body: Buffer) => { const h = Buffer.alloc(8); h.writeUInt32BE(body.length + 8); h.write(type, 4, 'latin1'); return Buffer.concat([h, body]); };
const PLACE = '+51.5072-000.1276+011.000/';
/** A small JPEG, for an item with a photo. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]), Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'),
  Buffer.from([0xff, 0xdb, 0, 67]), Buffer.alloc(65, 1), Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0]), Buffer.from('PIXELS'.repeat(40), 'latin1'), Buffer.from([0xff, 0xd9])]);
/** ftyp, a big mdat, then moov with mvhd (the length) and udta/©xyz (where it was filmed) - moov crossing a 4 MB edge. */
function video(seconds: number, opts: { brand?: string; mdat?: number } = {}): Buffer {
  const ftyp = box('ftyp', Buffer.concat([Buffer.from(opts.brand ?? 'isom', 'latin1'), Buffer.alloc(4), Buffer.from('isomiso2mp41', 'latin1')]));
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(seconds * 1000, 16);
  const xyzBody = Buffer.concat([Buffer.from([0, PLACE.length, 0x15, 0xc7]), Buffer.from(PLACE, 'latin1')]);
  const xyz = Buffer.concat([Buffer.from([0, 0, 0, xyzBody.length + 8, 0xa9]), Buffer.from('xyz', 'latin1'), xyzBody]);
  const moov = box('moov', Buffer.concat([box('mvhd', mvhd), box('udta', xyz)]));
  // The mdat ends 40 bytes before the second 4 MB edge, so moov starts in piece 2 and ends in piece 3.
  const mdatLen = opts.mdat ?? 2 * V.VIDEO_PIECE_BYTES - ftyp.length - 40;
  const mdat = box('mdat', Buffer.alloc(mdatLen - 8, 0x5a));
  return Buffer.concat([ftyp, mdat, moov]);
}

/* ------------------------------------------------------------------ the app */

const T0 = '2026-10-02T09:00:00.000Z';
let clock = T0;
const PASSWORD = 'a-very-long-development-password';
const JOB = 'job-vd-1';
const CLIENT = actor('CLIENT', 'u-vd-client', 'b-vd');
const OTHER = actor('CLIENT', 'u-vd-other', 'b-vd-other');
const COLLEAGUE = actor('CLIENT', 'u-vd-colleague', 'b-vd');
const SAM = actor('SURVEYING', 'u-vd-sam');
const OLA = actor('SURVEYING', 'u-vd-ola');
const ADMIN = actor('ADMIN', 'u-vd-admin');
const SALES = actor('SALES', 'u-vd-sales');
const ACC = actor('ACCOUNTING', 'u-vd-acc');
const ROOT = mkdtempSync(join(tmpdir(), 'cb-vd-'));
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let n = 0;
const deps = () => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `vd-${(++n).toString().padStart(6, '0')}` });

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: ROOT, now: () => clock, sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-vd', 'Video Practice Limited', 'gp', 'SURVEY', T0, 'COMPANY']);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-vd-other', 'Other Practice Limited', 'gp', 'SURVEY', T0, 'COMPANY']);
  for (const [id, role, name, biz] of [['u-vd-client', 'CLIENT', 'Cleo Client', 'b-vd'], ['u-vd-other', 'CLIENT', 'Otto Other', 'b-vd-other'], ['u-vd-colleague', 'CLIENT', 'Col League', 'b-vd'], ['u-vd-sam', 'SURVEYING', 'Sam Surveyor', null],
    ['u-vd-ola', 'SURVEYING', 'Ola Other', null], ['u-vd-admin', 'ADMIN', 'Ada Admin', null], ['u-vd-sales', 'SALES', 'Sid Sales', null], ['u-vd-acc', 'ACCOUNTING', 'Al Accounts', null]] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T0, T0, biz]);
  }
  db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-vd', 'b-vd', 'gp', T0, 100, 200, T0]);
  db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [JOB, 'b-vd', 'as-vd', 'u-vd-sam', 'SEALED', null, T0, null]);
  for (const w of ['u-vd-client', 'u-vd-sam', 'u-vd-admin']) {
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
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, body: buf.toString('utf8'), bytes: buf, headers: r.headers, location: r.headers.get('location') };
}
const post = (who: string, path: string, form: Record<string, string>) => req(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const start = (who = CLIENT, f: Partial<{ job_id: string; size: string; nobody: string; note: string }> = {}, store: FsObjectStore = made.store) =>
  V.startVideo(deps(), store, who, { job_id: JOB, size: '1000', nobody: 'yes', note: '', ...f });

/** Send a video as the phone does, piece by piece; `skip` leaves pieces unsent. Returns the send. */
async function sendAll(bytes: Buffer, opts: { skip?: number[]; note?: string } = {}): Promise<string> {
  const s = start(CLIENT, { size: String(bytes.length), note: opts.note ?? '' });
  assert.ok(s.ok, JSON.stringify(s));
  if (!s.ok) throw new Error('no send');
  for (let k = 1; k <= s.pieces; k++) {
    if (opts.skip?.includes(k)) continue;
    const plain = bytes.subarray((k - 1) * s.piece_bytes, Math.min(bytes.length, k * s.piece_bytes));
    const locked = await lockPiece(s.key, plain);
    const slot = await V.videoSlot(deps(), made.store, CLIENT, s.send, { n: String(k), size: String(locked.length) });
    assert.ok(slot.ok, JSON.stringify(slot));
    if (!slot.ok) throw new Error('no slot');
    assert.deepEqual(await V.putVideoLocal(deps(), made.store, CLIENT, s.send, slot.slot, locked), { ok: true });
    assert.deepEqual(await V.finishPiece(deps(), made.store, CLIENT, s.send, slot.slot), { ok: true, n: k });
    assert.deepEqual(await V.finishPiece(deps(), made.store, CLIENT, s.send, slot.slot), { ok: true, n: k }, 'asked twice');
    const staged = made.app.db.get<{ k: string }>('SELECT staged_key AS k FROM survey_video_slots WHERE id = ?', [slot.slot])!.k;
    assert.ok(!existsSync(join(ROOT, staged)), 'the locked piece was kept');
  }
  return s.send;
}
async function wholeVideo(id: string, who = CLIENT): Promise<Buffer> {
  const parts: Buffer[] = [];
  for (let at = 0; ;) {
    const r = await V.videoBytes(deps(), made.store, who, id, `bytes=${String(at)}-`);
    if (r === null || r === 'BAD_RANGE') throw new Error('no bytes');
    parts.push(r.bytes);
    at = r.end + 1;
    if (at >= r.total) break;
  }
  return Buffer.concat(parts);
}

let kept = '';

describe('a video send', () => {
  test('only a client of that company, with the tick, up to 1 GB, a short note and the key set; cut into 4 MB pieces', () => {
    for (const who of [OTHER, SAM, ADMIN]) assert.throws(() => start(who), /not authorised|NotAuthorised/i, who.id);
    const no = (f: Parameters<typeof start>[1], why: RegExp, store?: FsObjectStore) => { const r = start(CLIENT, f, store); assert.equal(r.ok, false); if (!r.ok) assert.match(r.why, why); };
    no({ nobody: '' }, /nobody is in the video/);
    no({ size: '0' }, /Choose a video first/);
    no({ size: String(V.MAX_VIDEO_BYTES + 1) }, /over 1 GB/);
    no({ note: 'x'.repeat(501) }, /under 500/);
    no({}, /key that encrypts them is not set/, new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-vd-nokey-')), now: made.app.now, sealKey: null }));
    const r = start(CLIENT, { size: String(V.MAX_VIDEO_BYTES) });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual([r.pieces, r.piece_bytes], [256, V.VIDEO_PIECE_BYTES]);
    const small = start(CLIENT, { size: String(V.VIDEO_PIECE_BYTES + 1) });
    if (small.ok) assert.equal(small.pieces, 2);
  });

  test('a piece: in one’s own send only, the exact size, once; a changed piece opens nothing and is removed', async () => {
    const s = start(CLIENT, { size: String(V.VIDEO_PIECE_BYTES + 100) });
    assert.ok(s.ok);
    if (!s.ok) return;
    for (const who of [OTHER, COLLEAGUE]) await assert.rejects(V.videoSlot(deps(), made.store, who, s.send, { n: '1', size: '1' }), /not authorised|NotAuthorised/i, who.id);
    const no = async (f: { n: string; size: string }, why: RegExp) => { const x = await V.videoSlot(deps(), made.store, CLIENT, s.send, f); assert.equal(x.ok, false); if (!x.ok) assert.match(x.why, why); };
    await no({ n: '3', size: String(100 + LOCK_OVERHEAD) }, /not one of this video/);
    await no({ n: '1', size: String(100 + LOCK_OVERHEAD) }, /not the size it should be/);
    await no({ n: '2', size: String(101 + LOCK_OVERHEAD) }, /not the size it should be/);
    const plain = randomBytes(100);
    const locked = Buffer.from(await lockPiece(s.key, plain));
    const slot = await V.videoSlot(deps(), made.store, CLIENT, s.send, { n: '2', size: String(locked.length) });
    assert.ok(slot.ok);
    if (!slot.ok) return;
    await no({ n: '2', size: String(locked.length) }, /already been sent/);
    assert.equal((await V.putVideoLocal(deps(), made.store, CLIENT, s.send, slot.slot, locked.subarray(1))).ok, false, 'a short piece was taken');
    assert.deepEqual(await V.finishPiece(deps(), made.store, CLIENT, s.send, slot.slot), { ok: false, why: 'That piece has not arrived yet. Send the video again.' });
    locked[200] = (locked[200] ?? 0) ^ 1;
    await V.putVideoLocal(deps(), made.store, CLIENT, s.send, slot.slot, locked);
    assert.deepEqual(await V.finishPiece(deps(), made.store, CLIENT, s.send, slot.slot), { ok: false, why: 'That piece could not be opened. Send the video again.' });
    assert.equal(made.app.db.get('SELECT 1 AS x FROM survey_video_pieces WHERE slot_id = ?', [slot.slot]), undefined);
    assert.ok(!readdirSync(join(ROOT, 'survey-incoming', s.send)).some((f) => f.includes(slot.slot)), 'a refused piece was kept');
    // A piece that reached the store at another size than its slot said (the store is not asked to check it).
    const other = await V.videoSlot(deps(), made.store, CLIENT, s.send, { n: '1', size: String(V.VIDEO_PIECE_BYTES + LOCK_OVERHEAD) });
    assert.ok(other.ok);
    if (!other.ok) return;
    const staged = made.app.db.get<{ k: string }>('SELECT staged_key AS k FROM survey_video_slots WHERE id = ?', [other.slot])!.k;
    writeFileSync(join(ROOT, staged), Buffer.alloc(V.VIDEO_PIECE_BYTES + LOCK_OVERHEAD + 1));
    assert.deepEqual(await V.finishPiece(deps(), made.store, CLIENT, s.send, other.slot), { ok: false, why: 'That piece is not the size it said it was.' });
    assert.ok(!existsSync(join(ROOT, staged)), 'a piece of the wrong size was kept');
  });
});

describe('the video', () => {
  test('kept only when every piece has come: an MP4 of 90 seconds, its place blanked digit for digit across two pieces, kept encrypted', async () => {
    const original = video(90);
    const send = await sendAll(original, { skip: [3], note: 'the ground floor' });
    const early = await V.finishVideo(deps(), made.store, CLIENT, send);
    assert.deepEqual(early, { ok: false, why: '1 of the video’s 3 pieces have not come yet.' });
    assert.equal(made.app.db.get('SELECT 1 AS x FROM survey_video_outcomes WHERE send_id = ?', [send]), undefined, 'waiting was recorded as an outcome');
    // The third piece now, as the phone would on its next try.
    const s = made.app.db.get<{ public_key: string }>('SELECT public_key FROM survey_video_sends WHERE id = ?', [send])!;
    const third = original.subarray(2 * V.VIDEO_PIECE_BYTES);
    const locked = await lockPiece(s.public_key, third);
    const slot = await V.videoSlot(deps(), made.store, CLIENT, send, { n: '3', size: String(locked.length) });
    assert.ok(slot.ok);
    if (slot.ok) { await V.putVideoLocal(deps(), made.store, CLIENT, send, slot.slot, locked); await V.finishPiece(deps(), made.store, CLIENT, send, slot.slot); }
    const done = await V.finishVideo(deps(), made.store, CLIENT, send);
    assert.deepEqual(done, { ok: true, video: send, minutes: 2 });
    kept = send;
    const row = made.app.db.get<{ content_type: string; byte_size: number; duration_ms: number; pieces: number; places_blanked: number; note: string }>(
      'SELECT content_type, byte_size, duration_ms, pieces, places_blanked, note FROM survey_videos WHERE id = ?', [send])!;
    assert.deepEqual({ ...row }, { content_type: 'video/mp4', byte_size: original.length, duration_ms: 90_000, pieces: 3, places_blanked: 1, note: 'the ground floor' });
    const back = await wholeVideo(send);
    assert.equal(back.length, original.length);
    const expected = Buffer.from(original);
    const at = expected.indexOf(Buffer.from(PLACE, 'latin1'));
    assert.ok(at > 2 * V.VIDEO_PIECE_BYTES - 40 && at < 2 * V.VIDEO_PIECE_BYTES + 200);
    Buffer.from(PLACE.replace(/\d/g, '0'), 'latin1').copy(expected, at);
    assert.ok(back.equals(expected), 'the video is not as sent with its place blanked');
    assert.ok(!back.includes(Buffer.from('51.5072', 'latin1')), 'the place is still in the video');
    // Kept encrypted: no piece on disk holds the video's own bytes.
    for (const f of readdirSync(join(ROOT, 'survey-videos', send))) assert.ok(!readFileSync(join(ROOT, 'survey-videos', send, f)).includes(Buffer.alloc(64, 0x5a)), `piece ${f} is in the clear`);
    assert.deepEqual(await V.finishVideo(deps(), made.store, CLIENT, send), done, 'asked twice');
    assert.equal((await V.videoSlot(deps(), made.store, CLIENT, send, { n: '1', size: '1' })).ok, false, 'a kept video takes more pieces');
  });

  test('a QuickTime video is kept as one; a video over ten minutes, or a file that is not a video, is refused and its pieces removed', async () => {
    const mov = await sendAll(video(30, { brand: 'qt  ', mdat: 5000 }));
    assert.ok((await V.finishVideo(deps(), made.store, CLIENT, mov)).ok);
    assert.equal(made.app.db.get<{ t: string }>('SELECT content_type AS t FROM survey_videos WHERE id = ?', [mov])!.t, 'video/quicktime');
    const long = await sendAll(video(11 * 60, { mdat: 5000 }));
    const r = await V.finishVideo(deps(), made.store, CLIENT, long);
    assert.deepEqual(r, { ok: false, why: 'That video is 11 minutes long. The most is 10 minutes: film the building in two or three parts.' });
    assert.ok(!existsSync(join(ROOT, 'survey-videos', long, '1')), 'a refused video’s piece was kept');
    assert.deepEqual(await V.finishVideo(deps(), made.store, CLIENT, long), r, 'asked twice');
    const words = 'That is not a video we can read. Send an MP4 or a phone’s own video (MOV).';
    assert.deepEqual(await V.finishVideo(deps(), made.store, CLIENT, await sendAll(Buffer.from('not a video, just some words of text'))), { ok: false, why: words });
    // Boxes as a video has them, but not starting with the file's type.
    const odd = video(30, { mdat: 5000 });
    odd.write('free', 4, 'latin1');
    assert.deepEqual(await V.finishVideo(deps(), made.store, CLIENT, await sendAll(odd)), { ok: false, why: words });
    assert.equal(made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM survey_video_outcomes WHERE outcome = 'REFUSED'")!.n, 3);
  });

  test('a length in words: under a minute, one minute, minutes', () => {
    assert.deepEqual([0, 1, 2, 12].map(V.minutesWords), ['under a minute', '1 minute', '2 minutes', '12 minutes']);
  });

  test('the place is blanked wherever the header writes it; other numbers are left alone', () => {
    const b = Buffer.from(`abc ${PLACE} 12.5 x -33.8688+151.2093/ 2026-10-02`, 'latin1');
    assert.equal(V.blankPlaces(b), 2);
    assert.equal(b.toString('latin1'), `abc ${PLACE.replace(/\d/g, '0')} 12.5 x -00.0000+000.0000/ 2026-10-02`);
  });
});

describe('who sees a video, and playing it back', () => {
  test('a piece at a time, by range: the client, the assigned surveyor, Admin and Sales; nobody else', async () => {
    for (const who of [CLIENT, SAM, ADMIN, SALES]) {
      const r = await V.videoBytes(deps(), made.store, who, kept, 'bytes=0-1');
      if (r === null || r === 'BAD_RANGE') throw new Error(`no bytes for ${who.id}`);
      assert.deepEqual([r.start, r.end, r.bytes.length, r.content_type], [0, 1, 2, 'video/mp4']);
    }
    for (const who of [OTHER, OLA, ACC]) await assert.rejects(V.videoBytes(deps(), made.store, who, kept, 'bytes=0-1'), Error, who.id);
    const total = made.app.db.get<{ n: number }>('SELECT byte_size AS n FROM survey_videos WHERE id = ?', [kept])!.n;
    const all = await V.videoBytes(deps(), made.store, CLIENT, kept, undefined);
    if (all !== null && all !== 'BAD_RANGE') assert.deepEqual([all.start, all.end], [0, V.VIDEO_PIECE_BYTES - 1], 'more than a piece at once');
    const tail = await V.videoBytes(deps(), made.store, CLIENT, kept, 'bytes=-10');
    if (tail !== null && tail !== 'BAD_RANGE') assert.deepEqual([tail.start, tail.end], [total - 10, total - 1]);
    for (const bad of ['bytes=x-1', 'bytes=-', `bytes=${String(total)}-`, 'bytes=5-2', 'lines=0-1']) assert.equal(await V.videoBytes(deps(), made.store, CLIENT, kept, bad), 'BAD_RANGE', bad);
    assert.equal(await V.videoBytes(deps(), made.store, CLIENT, 'no-such-video', undefined), null);
  });

  test('taken back by the client, or by Admin or Sales with a reason, it is shown to nobody; once; never by the surveyor', async () => {
    const other = await sendAll(video(20, { mdat: 3000 }));
    assert.ok((await V.finishVideo(deps(), made.store, CLIENT, other)).ok);
    assert.throws(() => V.withdrawVideo(deps(), SAM, other, 'blurred'), /not authorised|NotAuthorised/i);
    assert.equal(V.withdrawVideo(deps(), SALES, other, ' ').ok, false, 'staff say why');
    assert.deepEqual(V.withdrawVideo(deps(), SALES, other, 'A patient is in it'), { ok: true });
    assert.deepEqual(V.withdrawVideo(deps(), CLIENT, other, ''), { ok: false, why: 'That video has already been taken back.' });
    assert.equal(await V.videoBytes(deps(), made.store, ADMIN, other, 'bytes=0-1'), null);
    assert.ok(!V.videosOf(made.app.db, JOB).some((x) => x.id === other));
  });

  test('a send never finished is removed after a day, its kept pieces too, and recorded once', async () => {
    const send = await sendAll(video(15, { mdat: 3000 }));
    clock = new Date(Date.parse(T0) + (V.VIDEO_ABANDON_HOURS + 1) * 3_600_000).toISOString();
    try {
      // The reply timer sweeps them, as it sweeps photos.
      const word = 'w'.repeat(40);
      made.app.secrets = secretsFromValues({ REPLY_TIMER_TOKEN: word });
      try {
        const hook = await fetch(`${base}/hooks/read-replies`, { method: 'POST', headers: { authorization: `Bearer ${word}` } });
        assert.equal(hook.status, 200);
      } finally { made.app.secrets = secretsFromValues({}); }
      assert.ok(!existsSync(join(ROOT, 'survey-videos', send, '1')), 'an abandoned piece was kept');
      assert.equal(made.app.db.get<{ o: string }>('SELECT outcome AS o FROM survey_video_outcomes WHERE send_id = ?', [send])!.o, 'ABANDONED');
      assert.equal(await V.sweepVideos(deps(), made.store), 0, 'swept twice');
    } finally { clock = T0; }
  });
});

describe('the pages', () => {
  test('Photos: "I don’t have this" takes an item off the list, says how many are hidden, and puts it back on asking', async () => {
    const list = await req('u-vd-client', `/portal/building/photos?job=${JOB}`);
    assert.match(list.body, /id="i-WATER-TANK"/);
    assert.match(list.body, /<button class="btn-quiet" type="submit">I don’t have this<\/button>/);
    const m = await post('u-vd-client', '/portal/building/mark', { job: JOB, item: 'WATER-TANK', mark: 'NOT_HERE', back: `/portal/building/photos?job=${JOB}#i-WATER-TANK` });
    assert.equal(m.location, `/portal/building/photos?job=${JOB}&done=marked#i-WATER-TANK`);
    const after = (await req('u-vd-client', `/portal/building/photos?job=${JOB}`)).body;
    assert.doesNotMatch(after, /id="i-WATER-TANK"/, 'the item is still on the list');
    assert.match(after, /1 item you don’t have is hidden\. <a href="\/portal\/building\/photos\?job=job-vd-1&amp;hidden=1#items">Show it<\/a>/);
    const shown = (await req('u-vd-client', `/portal/building/photos?job=${JOB}&hidden=1`)).body;
    assert.match(shown, /id="i-WATER-TANK"/);
    assert.match(shown, /You don’t have this/);
    assert.match(shown, /I do have this/);
    // An item with a photo stays on the list, whatever it is marked: its photo is not hidden.
    const other = E.checklistView(made.app.db, JOB)!.items.find((i) => i.key !== 'WATER-TANK')!.key;
    assert.ok((await E.addPhoto(deps(), made.store, CLIENT, { job_id: JOB, item_key: other, bytes: JPEG, nobody: 'yes', note: '' })).ok);
    assert.ok(E.markItem(deps(), CLIENT, { job_id: JOB, item_key: other, mark: 'NOT_HERE' }).ok);
    const withPhoto = (await req('u-vd-client', `/portal/building/photos?job=${JOB}`)).body;
    assert.match(withPhoto, new RegExp(`id="i-${other}"`), 'an item with a photo was hidden');
    assert.match(withPhoto, /1 item you don’t have is hidden/);
    assert.ok(E.markItem(deps(), CLIENT, { job_id: JOB, item_key: other, mark: 'CLEARED' }).ok);
    const c = await post('u-vd-client', '/portal/building/mark', { job: JOB, item: 'WATER-TANK', mark: 'CLEARED', back: `/portal/building/photos?job=${JOB}&hidden=1#i-WATER-TANK` });
    assert.match(c.location ?? '', /^\/portal\/building\/photos\?job=job-vd-1&hidden=1.*#i-WATER-TANK$/, 'the hidden items were folded away again');
    assert.match((await req('u-vd-client', `/portal/building/photos?job=${JOB}`)).body, /id="i-WATER-TANK"/, 'not back on the list');
    assert.equal(E.checklistView(made.app.db, JOB)!.marked, 0);
  });

  test('A video: the page’s own script and policy (playing from this site, a chosen video’s length), its videos, and a range over HTTP', async () => {
    const page = await req('u-vd-client', `/portal/building/video?job=${JOB}`);
    assert.equal(page.status, 200);
    const csp = page.headers.get('content-security-policy') ?? '';
    assert.match(csp, /script-src 'self'; media-src 'self' blob:;/);
    assert.ok(page.body.includes('<script src="/assets/photo-upload.js" defer></script></body>'));
    for (const id of ['video-form', 'video-progress', 'video-bar', 'video-count', 'video-end', 'video-end-words', 'video-lock']) assert.ok(page.body.includes(`id="${id}"`), id);
    assert.match(page.body, /name="video" accept="video\/\*" required/);
    assert.ok(page.body.includes(`<video class="ev-video" controls preload="none" src="/portal/building/video/${kept}/play"></video>`), 'the client’s video is not on the page');
    assert.doesNotMatch((await req('u-vd-client', `/portal/building/photos?job=${JOB}`)).headers.get('content-security-policy') ?? '', /media-src/, 'Photos plays media');
    const r = await req('u-vd-client', `/portal/building/video/${kept}/play`, { headers: { range: 'bytes=0-15' } });
    assert.equal(r.status, 206);
    assert.match(r.headers.get('content-range') ?? '', /^bytes 0-15\/\d+$/);
    assert.equal(r.headers.get('accept-ranges'), 'bytes');
    assert.equal(r.bytes.subarray(4, 8).toString('latin1'), 'ftyp');
    assert.equal((await req('u-vd-client', `/portal/building/video/${kept}/play`, { headers: { range: 'bytes=999999999-' } })).status, 416);
    // A browser that could not run the script is told why.
    const noScript = await post('u-vd-client', '/portal/building/video', { job: JOB });
    assert.equal(noScript.location, `/portal/building/video?job=${JOB}&done=script`);
  });

  test('a whole video over HTTP, as the phone sends it: start, slot, piece, done, finish', async () => {
    const bytes = video(12, { mdat: 2000 });
    const st = JSON.parse((await post('u-vd-client', '/portal/building/video/start', { job: JOB, size: String(bytes.length), nobody: 'yes', note: 'the kitchen' })).body) as { ok: boolean; send: string; key: string; pieces: number };
    assert.ok(st.ok);
    const locked = await lockPiece(st.key, bytes);
    const slot = JSON.parse((await post('u-vd-client', `/portal/building/video/${st.send}/slot`, { n: '1', size: String(locked.length) })).body) as { ok: boolean; slot: string; url: string };
    assert.equal((await req('u-vd-client', slot.url, { method: 'PUT', body: locked })).status, 200);
    assert.equal((await post('u-vd-client', `/portal/building/video/${st.send}/slot/${slot.slot}/done`, {})).status, 200);
    const fin = await post('u-vd-client', `/portal/building/video/${st.send}/finish`, {});
    assert.equal(fin.status, 200);
    assert.deepEqual(JSON.parse(fin.body), { ok: true, video: st.send, minutes: 0 });
  });

  test('the staff: chapter 2 says how many videos and how long, the videos page plays them, and only Admin or Sales may take one back', async () => {
    const ch2 = (await req('u-vd-sam', `/staff/survey/${JOB}/pack?ch=2`)).body;
    assert.match(ch2, /<tr><td>Videos from the client<\/td><td>3 videos, 2 min 12 s<\/td>/);
    assert.match((await req('u-vd-client', `/portal/building?job=${JOB}`)).body, /<p class="ev-state">3 videos sent, 2 minutes<\/p>/);
    const page = await req('u-vd-sam', `/staff/survey/${JOB}/pack/videos`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy') ?? '', /media-src 'self';/);
    assert.ok(page.body.includes(`src="/staff/survey/${JOB}/pack/video/${kept}"`));
    assert.ok(!page.body.includes('name="reason"'), 'the surveyor is offered to take a video back');
    assert.ok((await req('u-vd-admin', `/staff/survey/${JOB}/pack/videos`)).body.includes('name="reason"'), 'Admin is not');
    const r = await req('u-vd-sam', `/staff/survey/${JOB}/pack/video/${kept}`, { headers: { range: 'bytes=4-7' } });
    assert.deepEqual([r.status, r.bytes.toString('latin1')], [206, 'ftyp']);
  });
});

describe('the records', () => {
  test('none is ever edited or deleted', () => {
    for (const sql of [
      'UPDATE survey_video_sends SET note = note', 'DELETE FROM survey_video_sends',
      'UPDATE survey_video_slots SET n = n', 'DELETE FROM survey_video_slots',
      'UPDATE survey_video_pieces SET at = at', 'DELETE FROM survey_video_pieces',
      'UPDATE survey_video_outcomes SET at = at', 'DELETE FROM survey_video_outcomes',
      'UPDATE survey_videos SET note = note', 'DELETE FROM survey_videos',
      'UPDATE survey_video_withdrawals SET reason = reason', 'DELETE FROM survey_video_withdrawals',
    ]) assert.throws(() => made.app.db.run(sql), /never/, sql);
  });
});
