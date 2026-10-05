/**
 * 2 OCTOBER 2026 — THE SURVEY'S EVIDENCE FROM THE CLIENT (src/web/survey-checklist.ts, survey-evidence.ts,
 * evidence-pages.ts; migration 074; the recording call in src/connectors/zoom.ts).
 *
 * Lakhbir: "a recorded phone walkthrough … and add the option for … a guided photo checklist in the client portal";
 * the photos kept, for testing ("Keep them, test only"); the walkthrough a recorded Zoom call ("Recorded Zoom call").
 *
 * Proven here:
 *   · the checklist: in the filming guide's order for every sector, every key fit to keep, every line on the fixture list;
 *   · a photo: only a JPEG or PNG, read from its bytes; at most 4.4 MB; only with "nobody is in it"; only from a client
 *     of that company; its place, camera and comments taken out and its picture kept as it was; ENCRYPTED where it is
 *     kept, and refused in words with no key;
 *   · who sees it: the client of that company, the assigned surveyor, Admin and Sales — nobody else; a photo taken back,
 *     nobody; marks: the newest is the item's;
 *   · the walkthrough: asked for once until booked; its Zoom meeting set to
 *     record to the cloud (and an ordinary call's not) — booked by Admin or Sales, who own client calls in the diary, never
 *     by a surveyor, who is kept out of it; the recording fetched and kept once; opening it recorded;
 *   · how the surveyor inspected: only the assigned surveyor says it, and the pack's chapter 2 shows it;
 *   · the pages: the portal's checklist, an item, the guide, a photo sent through the page; the pack's chapter 2 and each
 *     line's photo chip;
 *   · many at once (Lakhbir, 2 Oct 2026: "not only … individually but also in one go. admin can then split"): only from
 *     the company's client, with the tick, at most 15 and 4.4 MB, all or none; kept unsorted; sorted only by Admin or
 *     Sales, all or nothing, the newest move the photo's item; the portal box, the sorting page and chapter 2's row;
 *   · none of the new records is ever edited or deleted.
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { createApp } from '../src/server.ts';
import { FsObjectStore } from '../src/web/objectstore.ts';
import { manyFiles } from '../src/web/multipart.ts';
import { checklistFor, GROUPS, NOBODY_IN_SHOT } from '../src/web/survey-checklist.ts';
import * as E from '../src/web/survey-evidence.ts';
import { packView } from '../src/web/survey-pack.ts';
import { fixtureTransport, type Fixture } from '../src/connectors/http.ts';
import { forgetZoomToken, makeZoomMeeting } from '../src/connectors/zoom.ts';
import { zoomDeps } from '../src/web/video-calls.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { actor } from './helpers.ts';

/* ------------------------------------------------------------------ made-up images */

const PIXELS = Buffer.from('PIXELS-OF-THE-BOILER-ROOM-'.repeat(8), 'latin1');
function seg(marker: number, payload: string | Buffer): Buffer {
  const p = typeof payload === 'string' ? Buffer.from(payload, 'latin1') : payload;
  return Buffer.concat([Buffer.from([0xff, marker, (p.length + 2) >> 8, (p.length + 2) & 0xff]), p]);
}
const SOI = Buffer.from([0xff, 0xd8]);
const APP0 = seg(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0');
const ICC = seg(0xe2, 'ICC_PROFILE\0\x01\x01colour-profile');
const DQT = seg(0xdb, Buffer.alloc(65, 1));
const SCAN = Buffer.concat([seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), PIXELS, Buffer.from([0xff, 0x00, 0x12, 0xff, 0xd9])]);
/** A JPEG as a phone takes it: where it was, which phone, a comment, a Photoshop block, and a fill byte. */
const JPEG = Buffer.concat([SOI, APP0, seg(0xe1, 'Exif\0\0GPS 51.5072N 0.1276W iPhone 15 Pro'), ICC, seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Dr Example</x:xmpmeta>'),
  seg(0xed, 'Photoshop 3.0\0IPTC byline Dr Example'), seg(0xfe, 'Taken in consulting room 3 by Dr Example'), Buffer.from([0xff]), DQT, SCAN]);
const JPEG_CLEAN = Buffer.concat([SOI, APP0, ICC, DQT, SCAN]);

function chunk(type: string, data: string | Buffer): Buffer {
  const d = typeof data === 'string' ? Buffer.from(data, 'latin1') : data;
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), d]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]));
const IDAT = chunk('IDAT', PIXELS);
const IEND = chunk('IEND', '');
const PNG = Buffer.concat([SIG, IHDR, chunk('tEXt', 'Author\0Dr Example'), chunk('eXIf', 'GPS 51.5072N'), chunk('tIME', '\x07\xea\x0a\x02\x09\0\0'),
  chunk('iTXt', 'Comment\0\0\0\0\0room 3'), chunk('zTXt', 'Software\0\0x'), IDAT, IEND]);
const PNG_CLEAN = Buffer.concat([SIG, IHDR, IDAT, IEND]);

describe('a photo’s hidden details', () => {
  test('a JPEG or PNG is known by its first bytes; anything else is not a photo', () => {
    assert.equal(E.sniffImage(JPEG), 'image/jpeg');
    assert.equal(E.sniffImage(PNG), 'image/png');
    for (const not of [Buffer.from('GIF89a......'), Buffer.from('%PDF-1.4 ....'), Buffer.from('<svg></svg>'), Buffer.from([0xff, 0xd8, 0xff]), SIG, Buffer.alloc(0)]) {
      assert.equal(E.sniffImage(not), null, not.toString('latin1'));
    }
  });

  test('a JPEG loses its place, phone, author and comments; its colour profile and picture stay exactly as they were', () => {
    const out = Buffer.from(E.stripJpeg(JPEG)!);
    assert.deepEqual(out, JPEG_CLEAN);
    for (const gone of ['GPS', 'iPhone', 'Dr Example', 'consulting room', 'xmpmeta', 'IPTC']) assert.ok(!out.toString('latin1').includes(gone), gone);
    assert.ok(out.includes(PIXELS), 'the picture is kept');
    assert.ok(out.toString('latin1').includes('ICC_PROFILE'), 'the colour profile is kept');
    assert.deepEqual(Buffer.from(E.stripJpeg(JPEG_CLEAN)!), JPEG_CLEAN, 'a clean one comes back the same');
    // One it cannot walk to its picture is refused, not passed on as it is.
    assert.equal(E.stripJpeg(JPEG.subarray(0, 40)), null, 'cut short');
    assert.equal(E.stripJpeg(Buffer.concat([SOI, Buffer.from([0xff, 0xe1, 0xff, 0xff]), Buffer.alloc(8)])), null, 'a block longer than the file');
    assert.equal(E.stripJpeg(Buffer.concat([SOI, APP0, Buffer.from([0x00, 0x11, 0x22, 0x33])])), null, 'not a marker');
    assert.equal(E.stripJpeg(Buffer.concat([SOI, APP0, Buffer.from([0xff, 0xd9, 0, 0])])), null, 'ends before any picture');
    assert.equal(E.stripJpeg(Buffer.concat([SOI, APP0, Buffer.from([0xff, 0xd9, 0, 2]), SCAN])), null, 'an end marker before the picture is not read as a block');
    assert.equal(E.stripJpeg(PNG), null);
  });

  test('a PNG loses its text, EXIF and time chunks; the picture stays', () => {
    assert.deepEqual(Buffer.from(E.stripPng(PNG)!), PNG_CLEAN);
    assert.equal(E.stripPng(PNG.subarray(0, PNG.length - 6)), null, 'cut short');
    assert.equal(E.stripPng(Buffer.concat([SIG, IHDR, IDAT])), null, 'no end');
    assert.equal(E.stripPng(JPEG), null);
  });
});

describe('the checklist', () => {
  const SECTORS = ['gp', 'dental', 'care_homes', 'supported_living', 'private_hospital'];
  const csv = readFileSync(new URL('../../../02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv', import.meta.url), 'utf8');
  const known = new Set(csv.split('\n').slice(1).map((l) => l.split(',')[0]).filter((x) => x !== undefined && x !== ''));

  test('for every sector: in the filming guide’s order, every key fit to keep and used once, every line on the fixture list', () => {
    for (const s of SECTORS) {
      const list = checklistFor(s);
      const order = list.map((i) => GROUPS.indexOf(i.group));
      assert.ok(order.every((g, k) => g >= 0 && (k === 0 || g >= (order[k - 1] ?? 0))), `${s}: out of order`);
      assert.equal(new Set(list.map((i) => i.key)).size, list.length, `${s}: a key twice`);
      for (const i of list) {
        assert.match(i.key, /^[A-Z0-9-]{2,60}$/, `${s}: ${i.key}`);
        for (const l of i.lines) assert.ok(known.has(l), `${s}: ${i.key} names ${l}, which is not on the fixture list`);
      }
      const rooms = list.filter((i) => i.group === 'Each room');
      assert.ok(rooms.length > 0 && rooms.every((r) => r.each === true && r.key.startsWith('ROOM-')), `${s}: its rooms`);
      assert.equal(list[0]?.key, 'OUT-FRONT');
      assert.equal(list.at(-1)?.key, 'VOIDS');
    }
    assert.deepEqual(checklistFor('nowhere').filter((i) => i.group === 'Each room'), [], 'a sector it does not know has no rooms, and still the building');
    assert.ok(checklistFor('gp').find((i) => i.key === 'ROOM-GP-R1')!.lines.includes('LS-GP-001'), 'a GP consulting room supports its own lines too');
  });
});

/* ------------------------------------------------------------------ the app */

const T0 = '2026-10-02T09:00:00.000Z';
const clock = T0;
const PASSWORD = 'a-very-long-development-password';
const JOB = 'job-ev-1';
const OTHER_JOB = 'job-ev-2';
const CLIENT = actor('CLIENT', 'u-ev-client', 'b-ev');
const OTHER_CLIENT = actor('CLIENT', 'u-ev-other', 'b-ev-other');
const SAM = actor('SURVEYING', 'u-ev-sam');
const OLA = actor('SURVEYING', 'u-ev-ola');
const ADMIN = actor('ADMIN', 'u-ev-admin');
const SALES = actor('SALES', 'u-ev-sales');
const ACC = actor('ACCOUNTING', 'u-ev-acc');
const RO = actor('READ_ONLY', 'u-ev-ro');
const KEYS = {
  ZOOM_ACCOUNT_ID: 'invented-account', ZOOM_CLIENT_ID: 'invented-s2s-id', ZOOM_CLIENT_SECRET: 'invented-s2s-secret',
  ZOOM_SDK_CLIENT_ID: 'invented-sdk-id', ZOOM_SDK_CLIENT_SECRET: 'invented-sdk-secret',
  // PHASE 156d: these tests are the PAID plan's recorded walkthrough; the free plan's (the default) is the block at the end.
  ZOOM_PLAN: 'pro',
};
const MEETING = '81234567890';
const RECORDING = { share_url: 'https://us06web.zoom.us/rec/share/invented-walkthrough', password: 'Rec0rd', duration: 37, start_time: '2026-10-05T17:30:00Z' };
const FIXTURES: Record<string, Fixture | readonly Fixture[]> = {
  'POST /oauth/token': { status: 200, body: JSON.stringify({ access_token: 'invented-access-token', expires_in: 3599 }) },
  'POST /v2/users/me/meetings': { status: 201, body: JSON.stringify({ id: Number(MEETING), join_url: `https://us06web.zoom.us/j/${MEETING}?pwd=invented`, password: 'Inv3nt' }) },
  [`GET /v2/meetings/${MEETING}/recordings`]: [
    { status: 404, body: '{"code":3301,"message":"This recording does not exist."}' },
    { status: 200, body: JSON.stringify({ ...RECORDING, share_url: 'https://evil.example.com/rec' }) },
    { status: 200, body: JSON.stringify(RECORDING) },
  ],
};
const ROOT = mkdtempSync(join(tmpdir(), 'cb-ev-'));
let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
let n = 0;
let transport: ReturnType<typeof fixtureTransport>;

before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: ROOT, now: () => clock, publicOrigin: 'https://caprebate.example.invalid', sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const db = made.app.db;
  const hash = await made.app.hasher.hash(PASSWORD);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-ev', 'Evidence Practice Limited', 'gp', 'SURVEY', T0, 'COMPANY']);
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-ev-other', 'Other Practice Limited', 'dental', 'SURVEY', T0, 'COMPANY']);
  for (const [id, role, name, biz] of [['u-ev-sam', 'SURVEYING', 'Sam Surveyor', null], ['u-ev-ola', 'SURVEYING', 'Ola Other', null], ['u-ev-admin', 'ADMIN', 'Ada Admin', null],
    ['u-ev-sales', 'SALES', 'Sid Sales', null], ['u-ev-ro', 'READ_ONLY', 'Rita Reader', null], ['u-ev-acc', 'ACCOUNTING', 'Al Accounts', null],
    ['u-ev-client', 'CLIENT', 'Cleo Client', 'b-ev'], ['u-ev-other', 'CLIENT', 'Otto Other', 'b-ev-other']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, `${id}@example.invalid`, `${id}@example.invalid`, name, role, hash, T0, T0, biz]);
  }
  db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-ev', 'b-ev', 'gp', T0, 100, 200, T0]);
  db.run('INSERT INTO estimates (id,assessment_id,business_id,qualifying_expenditure_pence,qualifying_pct,pool_split_main_pence,pool_split_special_pence,bare_land_pence,multiplier,indicative_lifetime_saving_pence,sealed_at,estimate_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ['e-ev', 'as-ev', 'b-ev', 5_000_000, 0.05, 3_000_000, 2_000_000, 15_000_000, 1, 1_000_000, T0, 'test-not-a-real-hash']);
  db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-ev-2', 'b-ev-other', 'dental', T0, 100, 200, T0]);
  db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [JOB, 'b-ev', 'as-ev', 'u-ev-sam', 'SEALED', null, T0, null]);
  db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)', [OTHER_JOB, 'b-ev-other', 'as-ev-2', 'u-ev-ola', 'SEALED', null, T0, null]);
  db.run('INSERT INTO contacts (id,business_id,full_name,contact_consent,marketing_optin,created_at,contact_type,email) VALUES (?,?,?,?,?,?,?,?)', ['c-ev', 'b-ev', 'Dee Director', 1, 0, T0, 'DECISION_MAKER', 'dee@practice.example.com']);
  for (const w of [1, 2, 3, 4, 5]) db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, 540, 1020)', [randomUUID(), 'u-ev-admin', w]);
  forgetZoomToken();
  made.app.secrets = secretsFromValues(KEYS);
  made.app.zoomPolicy = { international_transfer_approved: true };
  transport = fixtureTransport(FIXTURES);
  made.app.outside = transport;
  for (const w of ['u-ev-sam', 'u-ev-ola', 'u-ev-admin', 'u-ev-sales', 'u-ev-client', 'u-ev-other']) {
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
  const buf = new Uint8Array(await r.arrayBuffer());
  return { status: r.status, body: Buffer.from(buf).toString('utf8'), bytes: buf, type: r.headers.get('content-type'), location: r.headers.get('location') };
}
const post = (who: string, path: string, form: Record<string, string>) => req(who, path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
const deps = () => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `ev-${(++n).toString().padStart(6, '0')}` });
const photo = (who = CLIENT, f: Partial<{ job_id: string; item_key: string; bytes: Uint8Array; nobody: string; note: string }> = {}) =>
  E.addPhoto(deps(), made.store, who, { job_id: JOB, item_key: 'PLANT-BOILER', bytes: JPEG, nobody: 'yes', note: '', ...f });
const count = (table: 'survey_photos' | 'survey_checklist_marks') => made.app.db.get<{ n: number }>(table === 'survey_photos' ? 'SELECT count(*) AS n FROM survey_photos' : 'SELECT count(*) AS n FROM survey_checklist_marks')!.n;

describe('a photo from the client', () => {
  test('only a client of that company sends one; staff and another company’s client are refused', async () => {
    for (const who of [OTHER_CLIENT, SAM, ADMIN, SALES]) await assert.rejects(photo(who), /not authorised|NotAuthorised/i, who.id);
    assert.equal(count('survey_photos'), 0);
  });

  test('it is refused, in words, without the tick, empty, too big, not a photo, not an item, or with a long note', async () => {
    const no = async (f: Parameters<typeof photo>[1], field: string | undefined, why: RegExp) => {
      const r = await photo(CLIENT, f);
      assert.equal(r.ok, false);
      if (!r.ok) { assert.equal(r.field, field); assert.match(r.why, why); }
    };
    await no({ nobody: '' }, 'nobody', /nobody is in the photo/);
    await no({ nobody: 'on' }, 'nobody', /nobody is in the photo/);
    await no({ bytes: new Uint8Array(0) }, 'file', /Choose or take a photo/);
    await no({ bytes: Buffer.concat([JPEG, Buffer.alloc(E.MAX_PHOTO_BYTES + 1 - JPEG.length)]) }, 'file', /too big\. The most is 4\.4 MB/);
    await no({ bytes: Buffer.from('GIF89a and so on') }, 'file', /as a JPEG or PNG/);
    await no({ bytes: JPEG.subarray(0, 40) }, 'file', /could not be read/);
    await no({ item_key: 'ROOM-DN-R1' }, undefined, /not one of the checklist’s items/);
    await no({ note: 'x'.repeat(501) }, 'note', /under 500/);
    assert.equal(count('survey_photos'), 0);
    // The most is allowed: a photo of exactly 4.4 MB is taken.
    const big = Buffer.concat([JPEG.subarray(0, JPEG.length - 2), Buffer.alloc(E.MAX_PHOTO_BYTES - JPEG.length), Buffer.from([0xff, 0xd9])]);
    assert.equal(big.length, E.MAX_PHOTO_BYTES);
    const r = await photo(CLIENT, { bytes: big, item_key: 'VOIDS' });
    assert.equal(r.ok, true);
    if (r.ok) E.withdrawPhoto(deps(), CLIENT, r.id, '');
  });

  test('it is kept without its hidden details, ENCRYPTED, with its SHA-256; nothing is kept in the clear', async () => {
    const r = await photo(CLIENT, { note: '  the  second boiler ' });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const row = made.app.db.get<{ object_key: string; content_type: string; byte_size: number; sha256: string; note: string; taken_by: string; nobody_in_it: number }>(
      'SELECT object_key, content_type, byte_size, sha256, note, taken_by, nobody_in_it FROM survey_photos WHERE id = ?', [r.id])!;
    assert.equal(row.object_key, `survey-photos/${JOB}/${r.id}.jpg`);
    assert.deepEqual([row.content_type, row.byte_size, row.note, row.taken_by, row.nobody_in_it], ['image/jpeg', JPEG_CLEAN.length, 'the second boiler', 'u-ev-client', 1]);
    assert.equal(row.sha256, createHash('sha256').update(JPEG_CLEAN).digest('hex'));
    const onDisk = readFileSync(join(ROOT, row.object_key));
    assert.ok(!onDisk.includes(PIXELS.subarray(0, 20)) && !onDisk.includes(Buffer.from('JFIF')), 'the photo is kept in the clear');
    assert.deepEqual(await made.store.getSealed(row.object_key), JPEG_CLEAN);
    assert.equal(made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM audit_log WHERE kind = 'SURVEY_EVIDENCE_ADDED' AND object_id = ? AND detail LIKE ?", [JOB, `%${r.id}%`])!.n, 1);
    // A PNG too.
    const p = await photo(CLIENT, { bytes: PNG, item_key: 'ROOM-GP-R1' });
    assert.equal(p.ok, true);
    if (p.ok) assert.deepEqual((await E.photoBytes(deps(), made.store, CLIENT, p.id))!.bytes, PNG_CLEAN);
  });

  test('with no key it is refused, in words, and nothing is kept; the store keeps nothing unencrypted, nor outside its place', async () => {
    const bare = new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-ev-nokey-')), now: made.app.now, sealKey: null });
    const before = count('survey_photos');
    const r = await E.addPhoto(deps(), bare, CLIENT, { job_id: JOB, item_key: 'PLANT-BOILER', bytes: JPEG, nobody: 'yes', note: '' });
    assert.deepEqual(r, { ok: false, why: 'We cannot keep photos yet: the key that encrypts them is not set. We have been told.' });
    assert.equal(count('survey_photos'), before);
    await assert.rejects(bare.putSealed('survey-photos/x.jpg', JPEG), /no encryption key/);
    await assert.rejects(made.store.putSealed('documents/x.jpg', JPEG), /not a sealed key/);
    await assert.rejects(made.store.getSealed('documents/x.jpg'), /not a sealed key/);
  });

  test('who sees it: the client of that company, the assigned surveyor, Admin and Sales — nobody else', async () => {
    const id = E.photosOf(made.app.db, JOB)[0]!.id;
    for (const who of [CLIENT, SAM, ADMIN, SALES]) assert.deepEqual((await E.photoBytes(deps(), made.store, who, id))?.bytes, JPEG_CLEAN, who.id);
    for (const who of [OTHER_CLIENT, OLA, ACC, RO]) await assert.rejects(E.photoBytes(deps(), made.store, who, id), Error, `${who.id} saw it`);
    assert.equal(await E.photoBytes(deps(), made.store, CLIENT, 'no-such-photo'), null);
  });

  test('taken back by the client, or by Admin or Sales with a reason, it is shown to nobody; once only; never by the surveyor', async () => {
    const r = await photo(CLIENT, { item_key: 'ELEC-METER' });
    assert.ok(r.ok);
    const s = await photo(CLIENT, { item_key: 'ELEC-BOARD' });
    assert.ok(s.ok);
    assert.equal(checklistDone('ELEC-METER'), true);
    assert.throws(() => E.withdrawPhoto(deps(), SAM, r.id, 'blurred'), /not authorised|NotAuthorised/i);
    assert.throws(() => E.withdrawPhoto(deps(), OTHER_CLIENT, r.id, ''), /not authorised|NotAuthorised/i);
    assert.equal(E.withdrawPhoto(deps(), SALES, s.id, ' ').ok, false, 'staff say why');
    assert.deepEqual(E.withdrawPhoto(deps(), CLIENT, r.id, ''), { ok: true, id: r.id });
    assert.equal(made.app.db.get<{ reason: string }>('SELECT reason FROM survey_photo_withdrawals WHERE photo_id = ?', [r.id])!.reason, 'Taken back by the client.');
    assert.deepEqual(E.withdrawPhoto(deps(), ADMIN, r.id, 'again'), { ok: false, why: 'That photo has already been taken back.' });
    assert.deepEqual(E.withdrawPhoto(deps(), SALES, s.id, 'A patient is in it'), { ok: true, id: s.id });
    const both: string[] = [r.id, s.id];
    for (const who of [CLIENT, SAM, ADMIN]) for (const id of both) assert.equal(await E.photoBytes(deps(), made.store, who, id), null);
    assert.ok(!E.photosOf(made.app.db, JOB).some((p) => p.id === r.id || p.id === s.id));
    assert.equal(checklistDone('ELEC-METER'), false, 'the item is to do again');
    assert.deepEqual(E.withdrawPhoto(deps(), ADMIN, 'nope', 'x'), { ok: false, why: 'That photo is not one of ours.' });
  });
});

function checklistDone(key: string): boolean { return E.checklistView(made.app.db, JOB)!.items.find((i) => i.key === key)!.done; }

describe('the checklist as the client has done it', () => {
  test('an item marked not here or not safe is done; the newest mark is the item’s; taken back, it is to do again', () => {
    const mark = (m: string, who = CLIENT) => E.markItem(deps(), who, { job_id: JOB, item_key: 'WATER-TANK', mark: m });
    assert.throws(() => mark('NOT_HERE', SAM), /not authorised|NotAuthorised/i);
    assert.throws(() => mark('NOT_HERE', OTHER_CLIENT), /not authorised|NotAuthorised/i);
    assert.equal(mark('GONE').ok, false);
    assert.equal(E.markItem(deps(), CLIENT, { job_id: JOB, item_key: 'NOT-AN-ITEM', mark: 'NOT_HERE' }).ok, false);
    const v0 = E.checklistView(made.app.db, JOB)!;
    assert.ok(mark('NOT_HERE').ok);
    let v = E.checklistView(made.app.db, JOB)!;
    assert.equal(v.items.find((i) => i.key === 'WATER-TANK')!.mark, 'NOT_HERE');
    assert.equal(v.marked, v0.marked + 1);
    assert.ok(mark('NOT_SAFE').ok);
    assert.equal(E.checklistView(made.app.db, JOB)!.items.find((i) => i.key === 'WATER-TANK')!.mark, 'NOT_SAFE', 'the newest mark is the item’s');
    assert.ok(mark('CLEARED').ok);
    v = E.checklistView(made.app.db, JOB)!;
    assert.deepEqual([v.items.find((i) => i.key === 'WATER-TANK')!.mark, v.items.find((i) => i.key === 'WATER-TANK')!.done, v.marked], [null, false, v0.marked]);
    assert.ok(mark('NOT_HERE').ok);
    // An item with a photo counts once, as done, whatever its mark.
    E.markItem(deps(), CLIENT, { job_id: JOB, item_key: 'PLANT-BOILER', mark: 'NOT_SAFE' });
    v = E.checklistView(made.app.db, JOB)!;
    assert.equal(v.done, v.items.filter((i) => i.photos.length > 0).length);
    assert.equal(v.marked, v.items.filter((i) => i.photos.length === 0 && i.mark !== null).length);
    assert.equal(v.total, checklistFor('gp').length);
  });

  test('each pack line has the photos of the items that are evidence for it', () => {
    const e = E.evidenceByLine(made.app.db, JOB);
    assert.deepEqual(e.get('LS-SR-003'), { count: 2, items: ['The boiler(s)', 'Consulting room'] });
    assert.equal(e.get('LS-GP-001')?.count, 1);
    assert.equal(e.get('LS-SR-008'), undefined, 'no photo, no evidence');
    assert.equal(E.evidenceByLine(made.app.db, 'no-such-job').size, 0);
  });
});

describe('the recorded walkthrough call', () => {
  let walk = '';
  test('the client asks once, until it is booked; the ask is a message to us', () => {
    assert.throws(() => E.askWalkthrough(deps(), SAM, JOB), /not authorised|NotAuthorised/i);
    assert.throws(() => E.askWalkthrough(deps(), OTHER_CLIENT, JOB), /not authorised|NotAuthorised/i);
    assert.ok(E.askWalkthrough(deps(), CLIENT, JOB).ok);
    assert.deepEqual(E.askWalkthrough(deps(), CLIENT, JOB), { ok: false, why: 'We have your request. We will offer you a time.' });
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM client_messages WHERE business_id = ? AND body = ?', ['b-ev', E.ASK_WORDS])!.n, 1);
    assert.equal(E.asksOf(made.app.db, JOB).length, 1);
  });

  test('booked by Admin or Sales at a free time — never the surveyor — it is this job’s walkthrough and its Zoom meeting records to the cloud', async () => {
    assert.ok((await req('u-ev-sam', `/staff/survey/${JOB}/pack?ch=2`)).body.includes('Admin or Sales book the walkthrough call'), 'the surveyor is not told who books it');
    const page = (await req('u-ev-admin', `/staff/survey/${JOB}/pack?ch=2`)).body;
    const slot = /<select class="fi" name="slot"><option value="([^"]+)"/.exec(page)?.[1] ?? '';
    assert.notEqual(slot, '', 'no free time offered');
    await assert.rejects(E.bookWalkthrough(made.app, deps().newId, SAM, JOB, { slot, to: 'dee@practice.example.com', origin: base }), Error, 'the surveyor booked it');
    await assert.rejects(E.bookWalkthrough(made.app, deps().newId, OLA, JOB, { slot, to: 'dee@practice.example.com', origin: base }), Error, 'another surveyor booked it');
    await assert.rejects(E.bookWalkthrough(made.app, deps().newId, ACC, JOB, { slot, to: 'dee@practice.example.com', origin: base }), Error, 'Accounting booked it');
    const bad = await E.bookWalkthrough(made.app, deps().newId, ADMIN, JOB, { slot, to: 'someone@elsewhere.example.com', origin: base });
    assert.equal(bad.ok === false && bad.field, 'to');
    const late = await E.bookWalkthrough(made.app, deps().newId, ADMIN, JOB, { slot: '2026-10-01T09:00:00.000Z', to: 'dee@practice.example.com', origin: base });
    assert.equal(late.ok === false && late.field, 'slot');
    const r = await post('u-ev-admin', `/staff/survey/${JOB}/pack/walkthrough`, { slot, to: 'dee@practice.example.com' });
    assert.equal(r.location, `/staff/survey/${JOB}/pack?ch=2&done=booked#inspection`);
    const made_ = transport.seen.filter((s) => s.method === 'POST' && s.url.endsWith('/v2/users/me/meetings'));
    assert.equal(made_.length, 1);
    assert.equal((JSON.parse(made_[0]!.body ?? '{}') as { settings?: { auto_recording?: string } }).settings?.auto_recording, 'cloud');
    const w = E.walkthroughsOf(made.app.db, JOB);
    assert.equal(w.length, 1);
    assert.deepEqual([w[0]!.meeting_id, w[0]!.starts_at, w[0]!.cancelled, w[0]!.booked_by_name], [MEETING, slot, false, 'Ada Admin']);
    walk = w[0]!.id;
    // Booked, the client may ask again.
    assert.ok(E.askWalkthrough(deps(), CLIENT, JOB).ok);
    // An ordinary video call does not record.
    const plain = await makeZoomMeeting(zoomDeps(made.app), '2026-10-09T09:00:00.000Z', 30);
    assert.equal(plain.state, 'MADE');
    assert.equal((JSON.parse(transport.seen.filter((s) => s.url.endsWith('/v2/users/me/meetings')).at(-1)!.body ?? '{}') as { settings?: { auto_recording?: string } }).settings?.auto_recording, 'none');
  });

  test('its recording is fetched from Zoom once it is there, only a Zoom link is kept, and only once', async () => {
    await assert.rejects(E.fetchRecording(made.app, deps().newId, OLA, JOB, walk));
    assert.deepEqual(await E.fetchRecording(made.app, deps().newId, SAM, JOB, walk), { ok: false, why: 'Zoom has no recording of this call yet. It can take a while after the call ends.' });
    assert.deepEqual(await E.fetchRecording(made.app, deps().newId, SAM, JOB, walk), { ok: false, why: 'Zoom’s answer did not carry a recording we could read.' });
    assert.deepEqual(await E.fetchRecording(made.app, deps().newId, ADMIN, JOB, 'not-a-walkthrough'), { ok: false, why: 'That is not one of this job’s walkthrough calls.' });
    const r = await post('u-ev-admin', `/staff/survey/${JOB}/pack/recording`, { walkthrough: walk });
    assert.equal(r.location, `/staff/survey/${JOB}/pack?ch=2&done=recording#inspection`);
    assert.deepEqual(await E.fetchRecording(made.app, deps().newId, SAM, JOB, walk), { ok: false, why: 'We already have that recording.' });
    const rec = E.walkthroughsOf(made.app.db, JOB)[0]!.recordings;
    assert.deepEqual(rec.map((x) => [x.share_url, x.passcode, x.minutes, x.recorded_at, x.views]), [[RECORDING.share_url, 'Rec0rd', 37, '2026-10-05T17:30:00.000Z', 0]]);
  });

  test('opening the recording is recorded, for whoever may read the job; nobody else opens it', async () => {
    const rec = E.walkthroughsOf(made.app.db, JOB)[0]!.recordings[0]!;
    assert.throws(() => E.watchRecording(deps(), OLA, JOB, rec.id));
    assert.throws(() => E.watchRecording(deps(), ACC, JOB, rec.id));
    const r = await req('u-ev-sam', `/staff/survey/${JOB}/pack/recording/${rec.id}`);
    assert.deepEqual([r.status, r.location], [303, RECORDING.share_url]);
    assert.equal(E.watchRecording(deps(), SALES, JOB, rec.id), RECORDING.share_url);
    assert.equal(E.walkthroughsOf(made.app.db, JOB)[0]!.recordings[0]!.views, 2);
    assert.equal(E.watchRecording(deps(), SAM, JOB, 'not-a-recording'), null);
  });
});

describe('how the surveyor inspected', () => {
  test('only the assigned surveyor says it; the same twice is refused; the newest is theirs', () => {
    assert.equal(E.basisOf(made.app.db, JOB), null);
    for (const who of [ADMIN, SALES, OLA]) assert.throws(() => E.setBasis(deps(), who, JOB, { basis: 'SITE_VISIT', note: '' }), Error, who.id);
    assert.equal(E.setBasis(deps(), SAM, JOB, { basis: 'BY_POST', note: '' }).ok, false);
    assert.equal(E.setBasis(deps(), SAM, JOB, { basis: 'SITE_VISIT', note: 'x'.repeat(501) }).ok, false);
    assert.ok(E.setBasis(deps(), SAM, JOB, { basis: 'SITE_VISIT', note: '' }).ok);
    assert.deepEqual(E.setBasis(deps(), SAM, JOB, { basis: 'SITE_VISIT', note: ' ' }), { ok: false, why: 'That is already how you inspected it.' });
    assert.ok(E.setBasis(deps(), SAM, JOB, { basis: 'DESKTOP_EVIDENCE', note: 'the  plant room by video' }).ok);
    assert.deepEqual(E.basisOf(made.app.db, JOB), { basis: 'DESKTOP_EVIDENCE', words: 'Desktop, with the client’s photos and video', note: 'the plant room by video', by_name: 'Sam Surveyor', at: T0 });
  });
});

describe('the pages', () => {
  test('the portal: the card, the checklist in groups with the rule, an item, the guide; another company’s checklist is not shown', async () => {
    const home = (await req('u-ev-client', '/portal')).body;
    assert.match(home, /<section class="card ev-card" id="show-us"><h2>Show us your building<\/h2>/);
    // 2 Oct 2026, the redesign: three choices on the page, each opening its own page; the checklist is on Photos.
    const r = await req('u-ev-client', '/portal/building');
    assert.equal(r.status, 200);
    assert.ok(r.body.includes(NOBODY_IN_SHOT.replace(/:.*/, '')), 'the rule is not said');
    for (const [h2, href] of [['Photos', '/portal/building/photos'], ['A video', '/portal/building/video'], ['A recorded video call', '/portal/building/call']]) {
      assert.ok(r.body.includes(`<h2>${h2 ?? ''}</h2>`) && r.body.includes(`href="${href ?? ''}?job=${JOB}"`), h2 ?? '');
    }
    assert.ok(r.body.includes('Booked: '), 'the booked call is not shown');
    assert.doesNotMatch(r.body, /<script/, 'the choices page runs a script');
    const photos = await req('u-ev-client', `/portal/building/photos?job=${JOB}`);
    for (const g of GROUPS) assert.ok(photos.body.includes(g), g);
    assert.ok(photos.body.includes(NOBODY_IN_SHOT.replace(/:.*/, '')), 'the rule is not said on Photos');
    const call = await req('u-ev-client', `/portal/building/call?job=${JOB}`);
    assert.equal(call.status, 200);
    assert.ok(call.body.includes('Booked: '), 'the call page does not show the booking');
    const item = await req('u-ev-client', `/portal/building/item/PLANT-PIPES?job=${JOB}`);
    assert.equal(item.status, 200);
    assert.match(item.body, /name="nobody" value="yes" required/);
    assert.match(item.body, /enctype="multipart\/form-data"/);
    assert.equal((await req('u-ev-client', `/portal/building/item/NOT-AN-ITEM?job=${JOB}`)).status, 404);
    assert.equal((await req('u-ev-client', `/portal/building/guide?job=${JOB}`)).status, 200);
    // Another company's job, asked for by name, shows the client's own.
    const theirs = await req('u-ev-client', `/portal/building?job=${OTHER_JOB}`);
    assert.ok(!theirs.body.includes(OTHER_JOB));
    assert.ok(!(await req('u-ev-other', '/portal/building')).body.includes(JOB));
  });

  test('a photo sent through the page is kept, and the client is sent back to the item; only into the checklist', async () => {
    const send = (back: string) => {
      const fd = new FormData();
      for (const [k, v] of [['job', JOB], ['item', 'PLANT-PIPES'], ['nobody', 'yes'], ['note', ''], ['back', back]]) fd.set(k ?? '', v ?? '');
      fd.set('file', new Blob([JPEG], { type: 'image/jpeg' }), 'pipes.jpg');
      return req('u-ev-client', '/portal/building/photo', { method: 'POST', body: fd });
    };
    const r = await send(`/portal/building/item/PLANT-PIPES?job=${JOB}`);
    assert.equal(r.location, `/portal/building/item/PLANT-PIPES?job=${JOB}&done=photo`);
    const id = E.checklistView(made.app.db, JOB)!.items.find((i) => i.key === 'PLANT-PIPES')!.photos[0]!.id;
    const img = await req('u-ev-client', `/portal/building/photo/${id}`);
    assert.deepEqual([img.status, img.type], [200, 'image/jpeg']);
    assert.deepEqual(Buffer.from(img.bytes), JPEG_CLEAN);
    assert.notEqual((await req('u-ev-other', `/portal/building/photo/${id}`)).status, 200);
    assert.equal((await send('https://evil.example.com/')).location, `/portal/building/photos?job=${JOB}&done=photo`, 'sent back somewhere else');
    const m = await post('u-ev-client', '/portal/building/mark', { job: JOB, item: 'COMMS-CABINET', mark: 'NOT_SAFE', back: `/portal/building?job=${JOB}#i-COMMS-CABINET` });
    assert.equal(m.location, `/portal/building?job=${JOB}&done=marked#i-COMMS-CABINET`);
  });

  test('the pack: chapter 2 shows the evidence, the call and the basis; the photos page; each line shows its photos', async () => {
    const ch2 = (await req('u-ev-sam', `/staff/survey/${JOB}/pack?ch=2`)).body;
    const v = E.checklistView(made.app.db, JOB)!;
    assert.ok(ch2.includes(`${String(v.done)} of ${String(v.total)} items, ${String(v.photos)} photos`), 'the checklist count');
    assert.ok(ch2.includes('37 minutes'), 'the recording');
    assert.ok(ch2.includes('Desktop, with the client’s photos and video'), 'the basis');
    // Sales has set no working times, so is told why there is no time to choose, not shown an empty list.
    const sales = (await req('u-ev-sales', `/staff/survey/${JOB}/pack?ch=2`)).body;
    assert.ok(sales.includes('You have no free times in the next 14 days') && !sales.includes('name="slot"'), 'an empty list of times');
    const photos = await req('u-ev-sam', `/staff/survey/${JOB}/pack/photos?line=LS-SR-003`);
    assert.equal(photos.status, 200);
    assert.ok(photos.body.includes('The photos for LS-SR-003') && photos.body.includes('The boiler(s)'));
    assert.ok(!(await req('u-ev-sam', `/staff/survey/${JOB}/pack/photos?line=LS-GP-001`)).body.includes('The boiler(s)'), 'a line shows another line’s photos');
    assert.ok(!photos.body.includes('name="reason"'), 'the surveyor is offered to take a photo back');
    assert.ok((await req('u-ev-admin', `/staff/survey/${JOB}/pack/photos`)).body.includes('name="reason"'), 'Admin is not');
    assert.notEqual((await req('u-ev-ola', `/staff/survey/${JOB}/pack/photos`)).status, 200);
    const lines = packView(deps(), SAM, JOB).lines.filter((l) => l.element_id === 'LS-SR-003');
    assert.ok(lines.length > 0, 'the pack has no heating line');
    const ch10 = (await req('u-ev-sam', `/staff/survey/${JOB}/pack?ch=10`)).body;
    assert.match(ch10, new RegExp(`<a class="ev-chip" href="/staff/survey/${JOB}/pack/photos\\?line=LS-SR-003">\\d+ photos · `));
  });
});

describe('many photos at once, sorted by Admin or Sales', () => {
  const many = (who = CLIENT, f: Partial<{ job_id: string; files: Uint8Array[]; nobody: string; note: string }> = {}) =>
    E.addPhotos(deps(), made.store, who, { job_id: JOB, files: [JPEG, PNG, JPEG_CLEAN], nobody: 'yes', note: '', ...f });
  let ids: readonly string[] = [];

  test('the reader returns every file in order, and refuses too many, none, or a request that is not a form with files', () => {
    const body = (n: number) => Buffer.concat([...Array.from({ length: n }, (_, k) => Buffer.from(`--B\r\nContent-Disposition: form-data; name="files"; filename="p${String(k)}.jpg"\r\nContent-Type: image/jpeg\r\n\r\nX${String(k)}\r\n`)),
      Buffer.from('--B\r\nContent-Disposition: form-data; name="job"\r\n\r\nj1\r\n--B--\r\n')]);
    const r = manyFiles(body(3), 'multipart/form-data; boundary=B', 15);
    assert.ok(r.ok);
    if (r.ok) { assert.deepEqual(r.files.map((f) => Buffer.from(f.bytes).toString()), ['X0', 'X1', 'X2']); assert.equal(r.fields['job'], 'j1'); }
    assert.deepEqual(manyFiles(body(4), 'multipart/form-data; boundary=B', 3), { ok: false, why: 'attach at most 3 files at a time' });
    assert.deepEqual(manyFiles(body(0), 'multipart/form-data; boundary=B', 3), { ok: false, why: 'no file was attached' });
    assert.equal(manyFiles(body(1), 'application/x-www-form-urlencoded', 3).ok, false);
  });

  test('only a client of that company sends them; with the tick; at most 15 and 4.4 MB; one bad photo and none is kept', async () => {
    for (const who of [OTHER_CLIENT, SAM, ADMIN, SALES]) await assert.rejects(many(who), /not authorised|NotAuthorised/i, who.id);
    const before = made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM survey_photos')!.n;
    const no = async (f: Parameters<typeof many>[1], why: RegExp) => { const r = await many(CLIENT, f); assert.equal(r.ok, false); if (!r.ok) assert.match(r.why, why); };
    await no({ nobody: '' }, /nobody is in the photos/);
    await no({ files: [] }, /Choose your photos first/);
    await no({ files: [new Uint8Array(0)] }, /Choose your photos first/);
    await no({ files: Array.from({ length: E.MAX_PHOTOS_AT_ONCE + 1 }, () => JPEG) }, /at most 15 photos/);
    await no({ files: [JPEG, Buffer.alloc(E.MAX_PHOTO_BYTES - JPEG.length + 1, 0xff)] }, /too big together\. The most is 4\.4 MB/);
    await no({ files: [JPEG, Buffer.from('GIF89a, not a photo'), PNG] }, /^Photo 2: Send a photo as a JPEG or PNG\. .* None was sent\.$/);
    await no({ note: 'x'.repeat(501) }, /under 500/);
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM survey_photos')!.n, before, 'a refused send kept something');
    const bare = new FsObjectStore({ root: mkdtempSync(join(tmpdir(), 'cb-ev-nokey2-')), now: made.app.now, sealKey: null });
    assert.equal((await E.addPhotos(deps(), bare, CLIENT, { job_id: JOB, files: [JPEG], nobody: 'yes', note: '' })).ok, false, 'kept with no key');
  });

  test('sent, each is cleaned, encrypted and kept unsorted; it counts towards no item until sorted', async () => {
    const v0 = E.checklistView(made.app.db, JOB)!;
    const r = await many(CLIENT, { note: 'the plant room' });
    assert.ok(r.ok);
    if (!r.ok) return;
    ids = r.ids;
    assert.equal(ids.length, 3);
    const rows = made.app.db.all<{ item_key: string; content_type: string; note: string }>('SELECT item_key, content_type, note FROM survey_photos WHERE id IN (?, ?, ?) ORDER BY rowid', [...ids]);
    assert.deepEqual(rows.map((x) => [x.item_key, x.content_type, x.note]), [['UNSORTED', 'image/jpeg', 'the plant room'], ['UNSORTED', 'image/png', 'the plant room'], ['UNSORTED', 'image/jpeg', 'the plant room']]);
    assert.deepEqual((await E.photoBytes(deps(), made.store, ADMIN, ids[0]!))!.bytes, JPEG_CLEAN, 'its hidden details are still taken out');
    assert.deepEqual((await E.photoBytes(deps(), made.store, ADMIN, ids[1]!))!.bytes, PNG_CLEAN);
    const v = E.checklistView(made.app.db, JOB)!;
    assert.deepEqual([v.unsorted, v.photos, v.done], [3, v0.photos, v0.done]);
    assert.deepEqual(E.unsortedOf(made.app.db, JOB).map((p) => p.id), [...ids]);
  });

  test('only Admin or Sales sort them; a wrong choice saves nothing; the newest move is the photo’s item; one can be taken back', () => {
    for (const who of [SAM, OLA, ACC, RO, CLIENT]) assert.throws(() => E.sortPhotos(deps(), who, JOB, { [ids[0]!]: 'PLANT-CONTROLS' }), Error, who.id);
    assert.equal(E.sortPhotos(deps(), ADMIN, JOB, { [ids[0]!]: 'PLANT-CONTROLS', [ids[1]!]: 'NOT-AN-ITEM' }).ok, false);
    assert.equal(E.sortPhotos(deps(), ADMIN, JOB, { [ids[0]!]: 'UNSORTED' }).ok, false, 'sorted back to unsorted');
    assert.equal(E.sortPhotos(deps(), ADMIN, JOB, { [ids[0]!]: 'PLANT-CONTROLS', 'no-such-photo': 'VOIDS' }).ok, false);
    assert.equal(E.checklistView(made.app.db, JOB)!.unsorted, 3, 'a refused sort saved something');
    assert.deepEqual(E.sortPhotos(deps(), SALES, JOB, { [ids[0]!]: 'PLANT-CONTROLS', [ids[1]!]: E.TAKE_BACK, [ids[2]!]: '' }), { ok: true, sorted: 1, taken_back: 1 });
    let v = E.checklistView(made.app.db, JOB)!;
    assert.equal(v.unsorted, 1);
    assert.deepEqual(v.items.find((i) => i.key === 'PLANT-CONTROLS')!.photos.map((p) => p.id), [ids[0]]);
    assert.equal(v.items.find((i) => i.key === 'PLANT-CONTROLS')!.done, true);
    assert.equal(made.app.db.get<{ reason: string }>('SELECT reason FROM survey_photo_withdrawals WHERE photo_id = ?', [ids[1]!])!.reason, 'Not useful, taken back when sorting.');
    assert.equal(E.sortPhotos(deps(), ADMIN, JOB, { [ids[1]!]: 'VOIDS' }).ok, false, 'a photo taken back is sorted');
    // Moved again, the newest is its item; the same item again is not a move.
    assert.deepEqual(E.sortPhotos(deps(), ADMIN, JOB, { [ids[0]!]: 'PLANT-AIR' }), { ok: true, sorted: 1, taken_back: 0 });
    assert.deepEqual(E.sortPhotos(deps(), ADMIN, JOB, { [ids[0]!]: 'PLANT-AIR' }), { ok: true, sorted: 0, taken_back: 0 });
    v = E.checklistView(made.app.db, JOB)!;
    assert.equal(v.items.find((i) => i.key === 'PLANT-CONTROLS')!.photos.length, 0);
    assert.deepEqual(v.items.find((i) => i.key === 'PLANT-AIR')!.photos.map((p) => p.id), [ids[0]]);
    assert.ok((E.evidenceByLine(made.app.db, JOB).get('LS-GP-008')?.count ?? 0) >= 1, 'a sorted photo is not evidence for its item’s lines');
    assert.equal(made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM audit_log WHERE kind = 'SURVEY_PHOTOS_SORTED' AND object_id = ?", [JOB])!.n, 2);
  });

  test('the pages: the portal box and what waits; sending through it; the sorting page for Admin; chapter 2’s row', async () => {
    const portal = (await req('u-ev-client', `/portal/building/photos?job=${JOB}`)).body;
    assert.match(portal, /<h2>Send lots of photos at once<\/h2>/);
    assert.match(portal, /name="files" accept="image\/jpeg,image\/png" multiple required/);
    assert.ok(portal.includes('1 photo is waiting for us to sort.'), 'what waits is not said');
    const send = (files: Buffer[]) => {
      const fd = new FormData();
      for (const [k, v] of [['job', JOB], ['nobody', 'yes'], ['note', '']]) fd.set(k ?? '', v ?? '');
      files.forEach((f, k) => fd.append('files', new Blob([new Uint8Array(f)], { type: 'image/jpeg' }), `p${String(k)}.jpg`));
      return req('u-ev-client', '/portal/building/photos', { method: 'POST', body: fd });
    };
    const ok = await send([JPEG, JPEG]);
    assert.equal(ok.location, `/portal/building/photos?job=${JOB}&done=photos#many`);
    assert.equal(E.checklistView(made.app.db, JOB)!.unsorted, 3);
    const big = await send([Buffer.alloc(E.MAX_PHOTO_BYTES + 70 * 1024, 0xff)]);
    assert.equal(big.status, 413);
    assert.match(big.body, /too big together\. The most is 4\.4 MB in one go/);
    const bad = await send([JPEG, Buffer.from('not a photo at all')]);
    assert.equal(bad.status, 400);
    assert.match(bad.body, /Photo 2: /);
    // Admin's sorting page: every waiting photo, each with the checklist in groups.
    const sortPage = await req('u-ev-admin', `/staff/survey/${JOB}/pack/sort`);
    assert.equal(sortPage.status, 200);
    const waiting = E.unsortedOf(made.app.db, JOB);
    for (const p of waiting) assert.ok(sortPage.body.includes(`name="to-${p.id}"`), p.id);
    assert.match(sortPage.body, /<optgroup label="The plant room"><option value="PLANT-BOILER">The boiler\(s\)<\/option>/);
    assert.ok(sortPage.body.includes(`<option value="${E.TAKE_BACK}">Not useful: take it back</option>`));
    assert.notEqual((await req('u-ev-sam', `/staff/survey/${JOB}/pack/sort`)).status, 200, 'the surveyor sorts');
    // Chapter 2 says what waits, with the way to sort it for Admin, and who sorts it for the surveyor.
    assert.match((await req('u-ev-admin', `/staff/survey/${JOB}/pack?ch=2`)).body, new RegExp(`Sent all at once, not sorted yet</td><td>3 photos</td>\\s*<td><a class="btn" href="/staff/survey/${JOB}/pack/sort">Sort them</a>`));
    assert.ok((await req('u-ev-sam', `/staff/survey/${JOB}/pack?ch=2`)).body.includes('3 photos · Admin or Sales sort them'));
    const form: Record<string, string> = {};
    waiting.forEach((p, k) => { form[`to-${p.id}`] = k === 0 ? 'KITCHEN' : ''; });
    const saved = await post('u-ev-admin', `/staff/survey/${JOB}/pack/sort`, form);
    assert.equal(saved.location, `/staff/survey/${JOB}/pack/sort?done=1-0`);
    assert.ok((await req('u-ev-admin', saved.location ?? '')).body.includes('Saved: 1 put under the checklist, 0 taken back.'));
    assert.equal(E.checklistView(made.app.db, JOB)!.unsorted, 2);
    assert.ok((await req('u-ev-admin', `/staff/survey/${JOB}/pack/photos`)).body.includes('2 more sent in one go, not sorted yet.'));
  });
});

describe('the records', () => {
  test('none is ever edited or deleted', () => {
    const db = made.app.db;
    for (const sql of [
      'UPDATE survey_photos SET note = note', 'DELETE FROM survey_photos',
      'UPDATE survey_photo_withdrawals SET reason = reason', 'DELETE FROM survey_photo_withdrawals',
      'UPDATE survey_checklist_marks SET mark = mark', 'DELETE FROM survey_checklist_marks',
      'UPDATE survey_walkthrough_asks SET at = at', 'DELETE FROM survey_walkthrough_asks',
      'UPDATE survey_walkthroughs SET booked_at = booked_at', 'DELETE FROM survey_walkthroughs',
      'UPDATE survey_recordings SET minutes = minutes', 'DELETE FROM survey_recordings',
      'UPDATE survey_recording_views SET at = at', 'DELETE FROM survey_recording_views',
      'UPDATE survey_inspection_basis SET note = note', 'DELETE FROM survey_inspection_basis',
      'UPDATE survey_photo_sorts SET at = at', 'DELETE FROM survey_photo_sorts',
    ]) assert.throws(() => db.run(sql), /never/, sql);
    assert.ok(db.get<{ n: number }>('SELECT count(*) AS n FROM survey_recording_views')!.n > 0, 'a table was empty, so its trigger was not tried');
    for (const t of ['survey_photo_withdrawals', 'survey_walkthrough_asks', 'survey_walkthroughs', 'survey_recordings', 'survey_inspection_basis', 'survey_checklist_marks']) {
      assert.ok(db.get<{ n: number }>('SELECT count(*) AS n FROM sqlite_schema WHERE name = ?', [t])!.n === 1, t);
    }
    // The database keeps only a Zoom link and a photo's place, never another.
    assert.throws(() => db.run("INSERT INTO survey_photos (id, job_id, item_key, object_key, content_type, byte_size, sha256, note, taken_by, taken_at, nobody_in_it) VALUES ('x', ?, 'VOIDS', 'documents/x.jpg', 'image/jpeg', 1, ?, NULL, 'u-ev-client', ?, 1)", [JOB, 'a'.repeat(64), T0]), /CHECK/);
    assert.throws(() => db.run("INSERT INTO survey_photos (id, job_id, item_key, object_key, content_type, byte_size, sha256, note, taken_by, taken_at, nobody_in_it) VALUES ('x', ?, 'VOIDS', 'survey-photos/x.jpg', 'image/jpeg', 1, ?, NULL, 'u-ev-client', ?, 0)", [JOB, 'a'.repeat(64), T0]), /CHECK/);
  });
});

/* PHASE 156d, 5 October 2026 — THE WALKTHROUGH CALL ON THE FREE ZOOM PLAN. Lakhbir: "yes change 156d so i dont pay".
   No ZOOM_PLAN is the free plan: Zoom keeps no recording, so nothing promises one, and Zoom is not asked to record. */
describe('PHASE 156d — the walkthrough call on the free Zoom plan', () => {
  const FREE_KEYS: Record<string, string> = { ...KEYS };
  delete FREE_KEYS['ZOOM_PLAN'];
  before(() => { made.app.secrets = secretsFromValues(FREE_KEYS); });
  after(() => { made.app.secrets = secretsFromValues(KEYS); });

  test('the paid words are the ones approved on 2 Oct 2026; the free words promise no recording', () => {
    assert.equal(E.WALK_WORDS.paid.message, E.ASK_WORDS);
    assert.equal(E.WALK_WORDS.paid.lead, 'Join a video call on your phone and walk round while we guide you. The call is recorded so your surveyor can watch it. It takes about 20 to 40 minutes.');
    for (const [k, v] of Object.entries(E.WALK_WORDS.free)) {
      assert.doesNotMatch(v, /is recorded|recorded to|records,|its recording appears|watch it/i, `the free plan's ${k} promises a recording: ${v}`);
    }
    assert.equal(E.walkWords(true), E.WALK_WORDS.free);
    assert.equal(E.walkWords(false), E.WALK_WORDS.paid);
  });

  test('the client\'s pages say "A video call", what happens instead, and the 40 minutes; never that it is recorded', async () => {
    const home = (await req('u-ev-client', `/portal/building?job=${JOB}`)).body;
    assert.ok(home.includes('<h2>A video call</h2>'), 'the choice is not "A video call"');
    assert.ok(home.includes(E.WALK_WORDS.free.choice));
    assert.ok(!home.includes('It is recorded so your surveyor can watch it.'), 'the choice still promises a recording');
    const call = (await req('u-ev-client', `/portal/building/call?job=${JOB}`)).body;
    assert.ok(call.includes('<h1>A video call</h1>'));
    assert.ok(call.includes('write down what we see for your surveyor') && call.includes('A call ends after 40 minutes'), 'the call page does not say what happens instead');
    assert.ok(!call.includes('The call is recorded'), 'the call page still promises a recording');
    const guide = (await req('u-ev-client', `/portal/building/guide?job=${JOB}`)).body;
    assert.ok(guide.includes('For the video call, and for the photos.'));
  });

  test('asking for one sends the free plan\'s words', async () => {
    const r = await post('u-ev-other', '/portal/building/ask', { job: OTHER_JOB });
    assert.equal(r.status, 303, r.body.slice(0, 300));
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM client_messages WHERE business_id = ? AND body = ?', ['b-ev-other', E.WALK_WORDS.free.message])!.n, 1);
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM client_messages WHERE business_id = ? AND body = ?', ['b-ev-other', E.ASK_WORDS])!.n, 0);
  });

  test('booked on the free plan: Zoom is not asked to record, staff are told to write down what they see, and there is no "Get the recording"', async () => {
    const page = (await req('u-ev-admin', `/staff/survey/${JOB}/pack?ch=2`)).body;
    assert.ok(page.includes('<summary>Book the walkthrough call</summary>') && page.includes(E.WALK_WORDS.free.staffHelp));
    assert.ok(!page.includes('recorded to Zoom’s cloud'));
    const slot = /<select class="fi" name="slot"><option value="([^"]+)"/.exec(page)?.[1] ?? '';
    assert.notEqual(slot, '');
    const before_ = transport.seen.length;
    const r = await post('u-ev-admin', `/staff/survey/${JOB}/pack/walkthrough`, { slot, to: 'dee@practice.example.com' });
    assert.equal(r.location, `/staff/survey/${JOB}/pack?ch=2&done=booked#inspection`);
    const mk = transport.seen.slice(before_).filter((s) => s.method === 'POST' && s.url.endsWith('/v2/users/me/meetings'));
    assert.equal(mk.length, 1);
    assert.equal((JSON.parse(mk[0]!.body ?? '{}') as { settings?: { auto_recording?: string } }).settings?.auto_recording, 'none', 'Zoom was asked to record on the free plan');
    const after_ = (await req('u-ev-admin', `/staff/survey/${JOB}/pack?ch=2&done=booked`)).body;
    assert.ok(after_.includes(E.WALK_WORDS.free.booked));
    assert.ok(after_.includes(E.WALK_WORDS.free.noRecording), 'the new call does not say it is not recorded');
    const newest = E.walkthroughsOf(made.app.db, JOB).find((w) => w.starts_at === slot)!; // the clock is fixed, so pick it by its time
    assert.equal(newest.recordings.length, 0);
    assert.ok(!after_.includes(`name="walkthrough" value="${newest.id}"`), 'the free plan offers "Get the recording from Zoom"');
    assert.ok((await req('u-ev-sam', `/staff/survey/${JOB}/pack?ch=2`)).body.length > 0);
  });
});
