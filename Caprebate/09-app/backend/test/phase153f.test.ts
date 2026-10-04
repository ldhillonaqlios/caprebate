/**
 * PHASE 153f, 4 October 2026 — work found on 3 October that no phase held.
 *
 * Line 4: each video call is hosted on Zoom by its own member of staff (one Zoom user hosts one meeting at a time), and
 * the start token is asked for that same person; a member of staff with no Zoom user on our account falls back to the
 * shared host, and the call's page says so. Recorded Zoom answers only: nothing reaches Zoom.
 *
 * Line 2: six more chapters of the survey pack, each showing what the pack already holds.
 *
 * Line 6(a): a photo, voice note or document someone sends us on WhatsApp is fetched from Meta when a person presses
 * "Get it", checked against Meta's SHA-256, and kept sealed; then opened as a download. Recorded Meta answers only.
 */

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { fixtureTransport, liveTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { forgetZoomToken } from '../src/connectors/zoom.ts';
import { activeMeeting, meetingHost, reconcileVideoMeeting } from '../src/web/video-calls.ts';
import { readWebhook } from '../src/connectors/whatsapp.ts';
import { raw } from '../src/web/html.ts';
import { attachmentOf, fetchWhatsAppAttachment, receiveWhatsApp, whatsAppAttachmentBytes } from '../src/web/whatsapp.ts';

const T = '2026-10-04T00:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const KEYS = {
  ZOOM_ACCOUNT_ID: 'invented-account', ZOOM_CLIENT_ID: 'invented-s2s-id', ZOOM_CLIENT_SECRET: 'invented-s2s-secret',
  ZOOM_SDK_CLIENT_ID: 'invented-sdk-id', ZOOM_SDK_CLIENT_SECRET: 'invented-sdk-secret',
};
const APPROVED = { international_transfer_approved: true } as const;
const json = (status: number, body: object): Fixture => ({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const TOKEN = json(200, { access_token: 'invented-access-token', token_type: 'bearer', expires_in: 3599 });
const meeting = (id: number): Fixture => json(201, { id, join_url: `https://us06web.zoom.us/j/${id}?pwd=invented`, password: 'Inv3nt' });
const SAM = 'zoom.sam@example.invalid';
const PAT = 'zoom.pat@example.invalid';
const NOZOOM = 'no.zoom@example.invalid';
const at = (e: string) => encodeURIComponent(e);
const FIXTURES = {
  'POST /oauth/token': TOKEN,
  [`POST /v2/users/${at(SAM)}/meetings`]: meeting(81111111111),
  [`POST /v2/users/${at(PAT)}/meetings`]: meeting(82222222222),
  [`POST /v2/users/${at(NOZOOM)}/meetings`]: json(404, { code: 1001, message: 'User does not exist: invented.' }),
  'POST /v2/users/me/meetings': meeting(83333333333),
  [`GET /v2/users/${at(SAM)}/token`]: json(200, { token: 'zak-for-sam' }),
  'GET /v2/users/me/token': json(200, { token: 'zak-for-the-shared-host' }),
};

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-153f-')), publicOrigin: 'https://caprebate.example.invalid', sealKey: randomBytes(32) });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const hash = await made.app.hasher.hash(PASSWORD);
  const db = made.app.db;
  for (const [id, email, name] of [['u-zs', SAM, 'Sam Sales'], ['u-zp', PAT, 'Pat Sales'], ['u-zn', NOZOOM, 'Nia Nozoom']] as const) {
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      [id, email, email, name, 'SALES', hash, T, T]);
  }
  db.run('INSERT INTO businesses (id,name,sector,stage,created_at) VALUES (?,?,?,?,?)', ['b-zh', 'Zoom Host Invented Limited', 'dental', 'ASSESSMENT_SUBMITTED', T]);
  const book = (id: string, who: string | null) => db.run(
    "INSERT INTO bookings (id, business_id, assigned_to, channel, entry_point, starts_at, ends_at, created_at) VALUES (?, 'b-zh', ?, 'video', 'staff', '2026-10-06T09:00:00.000Z', '2026-10-06T10:00:00.000Z', ?)", [id, who, T]);
  book('bk-sam', 'u-zs'); book('bk-pat', 'u-zp'); book('bk-none', null); book('bk-nozoom', 'u-zn');
});
after(() => made.close());
beforeEach(() => { forgetZoomToken(); made.app.outside = liveTransport; made.app.secrets = secretsFromValues({}); delete made.app.zoomPolicy; delete made.app.whatsappPolicy; });

function zoomOn() {
  const t = fixtureTransport(FIXTURES);
  made.app.outside = t;
  made.app.secrets = secretsFromValues(KEYS);
  made.app.zoomPolicy = APPROVED;
  return t;
}

type Res = { status: number; body: string; location: string | null };
function client() {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
    for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
    return { status: r.status, body: await r.text(), location: r.headers.get('location') };
  };
  const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
  return { req, post };
}

describe('line 4 — each video call hosted on Zoom by its own member of staff', () => {
  test('two calls at the same time, given to two people, are made under two different Zoom users, each recorded', async () => {
    const t = zoomOn();
    assert.equal(await reconcileVideoMeeting(made.app, 'bk-sam'), 'MADE');
    assert.equal(await reconcileVideoMeeting(made.app, 'bk-pat'), 'MADE');
    const made1 = t.seen.filter((x) => x.method === 'POST' && x.url.includes('/meetings')).map((x) => new URL(x.url).pathname);
    assert.deepEqual(made1, [`/v2/users/${at(SAM)}/meetings`, `/v2/users/${at(PAT)}/meetings`]);
    const sam = activeMeeting(made.app.db, 'bk-sam')!, pat = activeMeeting(made.app.db, 'bk-pat')!;
    assert.deepEqual([sam.meeting_id, sam.host_user_id, pat.meeting_id, pat.host_user_id], ['81111111111', 'u-zs', '82222222222', 'u-zp']);
    assert.deepEqual(meetingHost(made.app.db, sam), { email: SAM, name: 'Sam Sales' });
  });

  test('nobody assigned: the shared host, recorded as null; a member of staff with no Zoom user: the shared host, and the audit says why', async () => {
    const t = zoomOn();
    assert.equal(await reconcileVideoMeeting(made.app, 'bk-none'), 'MADE');
    assert.equal(await reconcileVideoMeeting(made.app, 'bk-nozoom'), 'MADE');
    const paths = t.seen.filter((x) => x.method === 'POST' && x.url.includes('/meetings')).map((x) => new URL(x.url).pathname);
    assert.deepEqual(paths, ['/v2/users/me/meetings', `/v2/users/${at(NOZOOM)}/meetings`, '/v2/users/me/meetings']);
    assert.equal(activeMeeting(made.app.db, 'bk-none')!.host_user_id, null);
    assert.equal(activeMeeting(made.app.db, 'bk-nozoom')!.host_user_id, null);
    const audit = made.app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'VIDEO_CALL_SHARED_HOST' AND object_id = 'bk-nozoom'");
    assert.equal(audit?.n, 1);
  });

  test('the start token is asked for the meeting\'s own host, and the call\'s page names who hosts it', async () => {
    const t = zoomOn();
    const s = client();
    await s.post('/login', { email: SAM, password: PASSWORD });
    const v = await s.req('/staff/calendar/bk-sam/video');
    assert.equal(v.status, 200, v.body.slice(0, 300));
    assert.match(v.body, /data-zak="zak-for-sam"/);
    assert.match(v.body, /Hosted on Zoom by Sam Sales\./);
    assert.ok(t.seen.some((x) => new URL(x.url).pathname === `/v2/users/${at(SAM)}/token`));
    const n = await s.req('/staff/calendar/bk-nozoom/video');
    assert.match(n.body, /data-zak="zak-for-the-shared-host"/);
    assert.match(n.body, /Hosted on Zoom by our shared Zoom user\./);
  });

  test('line 4(b): the two Zoom permissions a call\'s length and attendees need are named, and nothing asks for them yet', () => {
    const z = readFileSync(join(import.meta.dirname, '..', 'src', 'connectors', 'zoom.ts'), 'utf8');
    assert.match(z, /meeting:read:past_meeting:admin/);
    assert.match(z, /meeting:read:list_past_participants:admin/);
    assert.equal(/\/v2\/past_meetings/.test(z.replace(/^\s*\*.*$/gm, '')), false, 'no code calls the past-meeting endpoints yet');
  });
});

/* ------------------------------------------------------------------ line 6(a): WhatsApp attachments */

const WA_KEYS = {
  WHATSAPP_ACCESS_TOKEN: 'invented-token', WHATSAPP_PHONE_NUMBER_ID: '123456789012345', WHATSAPP_APP_SECRET: 'invented-app-secret',
  WHATSAPP_VERIFY_TOKEN: 'invented-verify-word', WHATSAPP_OPENING_TEMPLATE: 'cap_rebate_opening',
};
const PHOTO = Buffer.from('invented photo bytes, not a real picture');
const PHOTO_SHA = createHash('sha256').update(PHOTO).digest('hex');
const LOOKASIDE = 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=invented&ext=1&hash=invented';
const mediaInfo = (over: Record<string, unknown> = {}): Fixture => json(200, { messaging_product: 'whatsapp', url: LOOKASIDE, mime_type: 'image/jpeg', sha256: PHOTO_SHA, file_size: PHOTO.length, id: 'MEDIA1', ...over });
function waOn(fixtures: Record<string, Fixture>) {
  const t = fixtureTransport(fixtures);
  made.app.outside = t;
  made.app.secrets = secretsFromValues(WA_KEYS);
  made.app.whatsappPolicy = { international_transfer_approved: true };
  return t;
}
function webhook(id: string, mediaId: string, from = '447700900111'): string {
  return JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, id, timestamp: '1759564800', type: 'image',
    image: { id: mediaId, mime_type: 'image/jpeg', sha256: PHOTO_SHA, caption: 'the plant room' } }] } }] }] });
}
const signed = (raw: string) => ['sha256', createHmac('sha256', WA_KEYS.WHATSAPP_APP_SECRET).update(raw, 'utf8').digest('hex')].join('=');
const sales = { id: 'u-zs', role: 'SALES' } as never;

describe('line 6(a) — a file someone sends us on WhatsApp, got and kept here', () => {
  before(() => {
    made.app.db.run("INSERT INTO contacts (id, business_id, full_name, phone, contact_consent, marketing_optin, created_at, updated_at) VALUES ('c-wa', 'b-zh', 'Ada Invented', '07700 900111', 1, 0, ?, ?)", [T, T]);
  });

  test('the webhook keeps the attachment\'s id, type and SHA-256 with the message, and says to get it on the page', () => {
    const w = readWebhook(webhook('wamid.A1', 'MEDIA1'));
    assert.deepEqual(w.incoming[0]?.media, { id: 'MEDIA1', type: 'image', mime: 'image/jpeg', sha256: PHOTO_SHA, filename: null });
    assert.match(w.incoming[0]?.body ?? '', /They sent a photo on WhatsApp\. With it: the plant room Get it on their WhatsApp page\./);
    made.app.secrets = secretsFromValues(WA_KEYS);
    const raw = webhook('wamid.A1', 'MEDIA1');
    assert.equal(receiveWhatsApp(made.app, raw, signed(raw)).kept, 1);
    const msg = made.app.db.get<{ id: string }>("SELECT id FROM whatsapp_messages WHERE wa_id = 'wamid.A1'")!.id;
    const a = attachmentOf(made.app.db, msg)!;
    assert.deepEqual([a.business_id, a.media_type, a.fetched_at], ['b-zh', 'image', null]);
  });

  test('"Get it": two calls with our token, the bytes checked against Meta\'s SHA-256, kept sealed, then opened as a download', async () => {
    const t = waOn({ 'GET /v25.0/MEDIA1': mediaInfo(), 'GET /whatsapp_business/attachments/': { status: 200, headers: { 'content-type': 'image/jpeg' }, body: '', bytes: new Uint8Array(PHOTO) } });
    const msg = made.app.db.get<{ id: string }>("SELECT id FROM whatsapp_messages WHERE wa_id = 'wamid.A1'")!.id;
    assert.deepEqual(await fetchWhatsAppAttachment(made.app, made.store, sales, msg), { ok: true });
    assert.deepEqual(t.seen.map((x) => `${x.method} ${new URL(x.url).host}${new URL(x.url).pathname}`),
      ['GET graph.facebook.com/v25.0/MEDIA1', 'GET lookaside.fbsbx.com/whatsapp_business/attachments/']);
    assert.ok(t.seen.every((x) => x.headers['authorization'] === 'Bearer invented-token'));
    const a = attachmentOf(made.app.db, msg)!;
    assert.equal(a.bytes, PHOTO.length);
    assert.match(a.object_key ?? '', /^whatsapp-files\//);
    const kept = Buffer.from(await made.store.get(a.object_key!));
    assert.equal(kept.includes(PHOTO), false, 'kept sealed, never as the plain bytes');
    const out = await whatsAppAttachmentBytes(made.app, made.store, sales, msg);
    assert.deepEqual([out?.bytes.equals(PHOTO), out?.mime, out?.filename], [true, 'image/jpeg', 'whatsapp-image.jpeg']);
    // Fetched once: a second press calls nobody.
    assert.deepEqual(await fetchWhatsAppAttachment(made.app, made.store, sales, msg), { ok: true });
    assert.equal(t.seen.length, 2);
    assert.throws(() => made.app.db.run('UPDATE whatsapp_media SET bytes = 1 WHERE message_id = ?', [msg]), /fetched once/);
    assert.throws(() => made.app.db.run('DELETE FROM whatsapp_media WHERE message_id = ?', [msg]), /retention rule/);
  });

  test('refused, in words, with nothing kept: an address that is not Meta\'s file host, bytes that do not match, a file over 16 MB, WhatsApp not on', async () => {
    const make = (wa: string, media: string) => { const raw = webhook(wa, media); receiveWhatsApp(made.app, raw, signed(raw));
      return made.app.db.get<{ id: string }>('SELECT id FROM whatsapp_messages WHERE wa_id = ?', [wa])!.id; };
    made.app.secrets = secretsFromValues(WA_KEYS);
    const elsewhere = make('wamid.B1', 'MEDIA2'), wrong = make('wamid.B2', 'MEDIA3'), big = make('wamid.B3', 'MEDIA4'), off = make('wamid.B4', 'MEDIA5');
    const t = waOn({
      'GET /v25.0/MEDIA2': mediaInfo({ url: 'https://example.invalid/whatsapp_business/attachments/?mid=x' }),
      'GET /v25.0/MEDIA3': mediaInfo(),
      'GET /v25.0/MEDIA4': mediaInfo({ file_size: 17 * 1024 * 1024 }),
      'GET /whatsapp_business/attachments/': { status: 200, headers: { 'content-type': 'image/jpeg' }, body: '', bytes: new Uint8Array(Buffer.from('something else')) },
    });
    const why = async (id: string) => { const r = await fetchWhatsAppAttachment(made.app, made.store, sales, id); return r.ok ? 'kept' : r.why; };
    assert.match(await why(elsewhere), /not Meta’s file host/);
    assert.match(await why(wrong), /does not match what WhatsApp said/);
    assert.match(await why(big), /larger than 16 MB/);
    assert.equal(t.seen.filter((x) => new URL(x.url).host === 'example.invalid').length, 0, 'never went to the other address');
    made.app.secrets = secretsFromValues({});
    assert.match(await why(off), /Put the WhatsApp keys in the key file/);
    for (const id of [elsewhere, wrong, big, off]) assert.equal(attachmentOf(made.app.db, id)!.fetched_at, null);
  });
});

/* ------------------------------------------------------------------ line 2: six more chapters of the survey pack */

import { packView, saveLine, setLineRemoved, savePackValue, type PackDeps } from '../src/web/survey-pack.ts';
import { reportChapter, purposeChapter, roomsChapter, itemsChapter, poolsChapter, limitsChapter, CHAPTERS } from '../src/web/survey-pack-pages.ts';
import { chaptersToRead } from '../src/web/pack-chapters.ts';
import { actor } from './helpers.ts';

describe('line 2 — chapters 1, 3, 6, 12, 13 and 21 of the survey pack', () => {
  const SV = actor('SURVEYING', 'u-f-sam');
  let k = 0;
  const pd = (): PackDeps => ({ db: made.app.db, audit: made.app.audit, now: made.app.now, newId: () => `f153-${String(++k)}` });
  const pageDeps = () => ({ app: made.app, newId: () => `f153p-${String(++k)}`, nav: () => raw(''), stamp: (x: string) => x, problem: () => 'handled' as const });
  before(() => {
    const db = made.app.db;
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-f-sam', 'sam153f@example.invalid', 'sam153f@example.invalid', 'Sam Surveyor', 'SURVEYING', 'x', T, T]);
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at,claimant_type) VALUES (?,?,?,?,?,?)', ['b-fdn', 'Invented Dental Limited', 'dental', 'SURVEY', T, 'COMPANY']);
    db.run('INSERT INTO properties (id,business_id,label,postcode,created_at) VALUES (?,?,?,?,?)', ['p-fdn', 'b-fdn', '1 Invented Row', 'ZZ9 9ZZ', T]);
    db.run('INSERT INTO assessments (id,business_id,sector,submitted_at,shown_low_pence,shown_high_pence,created_at) VALUES (?,?,?,?,?,?,?)', ['as-fdn', 'b-fdn', 'dental', T, 100, 200, T]);
    db.run('INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      ['c-fdn', 'CR-2026-1539', 'b-fdn', 'p-fdn', 'as-fdn', 'UNKNOWN', 'VALUATION', T, T]);
    db.run('INSERT INTO surveyor_jobs (id,business_id,assessment_id,surveyor_id,state,committed_at,created_at,claim_id) VALUES (?,?,?,?,?,?,?,?)',
      ['j-fdn', 'b-fdn', 'as-fdn', 'u-f-sam', 'SEALED', null, T, 'c-fdn']);
    db.run('INSERT INTO register_records (id,business_id,source_id,entity_id,fields_json,obtained_at,property_id) VALUES (?,?,?,?,?,?,?)',
      ['rr-title-fdn', 'b-fdn', 'HMLR_TITLE', 'ZZFDN', JSON.stringify({ title_number: 'ZZFDN', price_paid: 1000000 }), T, 'p-fdn']);
    const v0 = () => packView(pd(), SV, 'j-fdn');
    for (const l of v0().lines) {
      if (l.element_id === 'LS-SR-001' || l.element_id === 'LS-DEN-015' || l.removed) continue;
      setLineRemoved(pd(), SV, 'j-fdn', { line: l.id, reason: 'Not in this building', seq: String(v0().seq) }, true);
    }
    saveLine(pd(), SV, 'j-fdn', { line: 'LS-SR-001', qty: '1000', rate: '100', qpct: '100', pool: 'SR', reason: 'Measured', seq: String(v0().seq) });
  });

  test('six more chapters are built, so the surveyor opens each before approving (Phase 153g built the other ten)', () => {
    for (const n of [1, 3, 6, 12, 13, 21]) assert.ok(CHAPTERS.find((c) => c.n === n)?.built, String(n));
    for (const n of [1, 3, 6, 12, 13, 21]) assert.ok(chaptersToRead().includes(n), String(n));
  });

  test('chapter 1 names the client, the property, the claim and the surveyor, and says what is not on file', () => {
    const out = String(reportChapter(pageDeps(), SV, packView(pd(), SV, 'j-fdn')));
    for (const w of ['Invented Dental Limited', '1 Invented Row', 'ZZ9 9ZZ', 'Dental practice', 'Sam Surveyor', 'No site plan yet']) assert.ok(out.includes(w), w);
  });

  test('chapter 3: the purpose, and "not recorded" for how the surveyor inspected until chapter 2 says (N4)', () => {
    const out = String(purposeChapter(pageDeps(), packView(pd(), SV, 'j-fdn')));
    assert.match(out, /section 562 of the Capital Allowances Act 2001/);
    assert.match(out, /How you inspected\.<\/strong> <span class="pk-src pk-need">not recorded<\/span>/);
  });

  test('chapter 6: every dental room, uncounted ones said as not counted, and a count shown once it is recorded', () => {
    const v = packView(pd(), SV, 'j-fdn');
    const before = String(roomsChapter(pageDeps(), v));
    assert.match(before, /7 of 7 rooms not counted yet/);
    made.app.db.run('INSERT INTO surveyor_room_counts (id, job_id, room_id, room_count, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', ['rc-f1', 'j-fdn', 'DN-R1', 3, 'u-f-sam', T]);
    const after = String(roomsChapter(pageDeps(), v));
    assert.match(after, /6 of 7 rooms not counted yet/);
    assert.match(after, /<td>3<\/td>/);
  });

  test('chapter 12 lists each item with its pool, share and how it was seen, and our default placements say so; chapter 13 sums the pools', () => {
    const v = packView(pd(), SV, 'j-fdn');
    const items = String(itemsChapter(pageDeps(), v));
    assert.match(items, /Special rate pool/);
    assert.match(items, /From documents/);
    assert.match(items, /Test default \(Phase 153e\), for the surveyor to confirm: treated as normal air flow/);
    const pools = String(poolsChapter(v));
    assert.match(pools, /<td>Special rate pool<\/td><td>2<\/td>/);
    assert.match(pools, /not complete/, 'nothing counted until every value is in');
  });

  test('chapter 21 carries the standard assumptions and the planning assumption, word for word', () => {
    const out = String(limitsChapter());
    assert.match(out, /We assume the property’s current use is lawful\./);
    assert.match(out, /Nobody else may rely on it/);
  });
});
