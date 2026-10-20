/**
 * 30 SEPTEMBER 2026 — VIDEO CALLS THROUGH ZOOM (src/connectors/zoom.ts, src/web/video-calls.ts).
 *
 * Lakhbir: "with the video call link this should be sent automatically, and i feel zoom would be best for this as we
 * can run it via our platform, is there a way to have zoom embeded on our back end so its done though there?"
 *
 * Recorded answers only: nothing here reaches Zoom. The keys are invented, and the transfer is approved only through
 * the test hook (app.zoomPolicy); as shipped it is not, and no meeting is made.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { fixtureTransport, liveTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { forgetZoomToken, joinSignature, makeZoomMeeting, zoomMissing, MEETING_TOPIC } from '../src/connectors/zoom.ts';
import { clientMayJoin, reconcileVideoMeeting, VIDEO_PAGE_CSP, zoomDeps } from '../src/web/video-calls.ts';
import { CALL_POLICIES } from '../src/connectors/sources.ts';

const T = '2026-09-08T00:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const KEYS = {
  ZOOM_ACCOUNT_ID: 'invented-account', ZOOM_CLIENT_ID: 'invented-s2s-id', ZOOM_CLIENT_SECRET: 'invented-s2s-secret',
  ZOOM_SDK_CLIENT_ID: 'invented-sdk-id', ZOOM_SDK_CLIENT_SECRET: 'invented-sdk-secret',
};
const APPROVED = { international_transfer_approved: true } as const;
const TOKEN: Fixture = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access_token: 'invented-access-token', token_type: 'bearer', expires_in: 3599 }) };
const MEETING: Fixture = { status: 201, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 81234567890, join_url: 'https://us06web.zoom.us/j/81234567890?pwd=invented', password: 'Inv3nt', start_url: 'https://us06web.zoom.us/s/81234567890?zak=never-kept' }) };
const ZAK: Fixture = { status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'invented-zak-token' }) };
const NONE: Fixture = { status: 204, body: '' };
const FIXTURES = {
  'POST /oauth/token': TOKEN, 'POST /v2/users/me/meetings': MEETING, 'GET /v2/users/me/token': ZAK,
  'PATCH /v2/meetings/81234567890': NONE, 'DELETE /v2/meetings/81234567890': NONE,
};

let made: Awaited<ReturnType<typeof createApp>>;
let base = '';
before(async () => {
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-vc-')), publicOrigin: 'https://caprebate.example.invalid' });
  await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
  const a = made.server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
  const hash = await made.app.hasher.hash(PASSWORD);
  made.app.db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
    ['u-vc-sales', 'vc.sales@example.invalid', 'vc.sales@example.invalid', 'Sam Sales', 'SALES', hash, T, T]);
  for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
    made.app.db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)', [`wt-vc-${weekday}`, 'u-vc-sales', weekday, 0, 24 * 60]);
  }
});
after(() => made.close());
beforeEach(() => { forgetZoomToken(); made.app.outside = liveTransport; made.app.secrets = secretsFromValues({}); delete made.app.zoomPolicy; });

/** Zoom set up: invented keys, recorded answers, the transfer approved through the test hook. */
function zoomOn() {
  const t = fixtureTransport(FIXTURES);
  made.app.outside = t;
  made.app.secrets = secretsFromValues(KEYS);
  made.app.zoomPolicy = APPROVED;
  return t;
}

type Res = { status: number; body: string; location: string | null; headers: Headers };
function client() {
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}): Promise<Res> => {
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
    for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
    return { status: r.status, body: await r.text(), location: r.headers.get('location'), headers: r.headers };
  };
  const post = (path: string, f: Record<string, string>) => req(path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
  return { req, post };
}

/** One building, to the figure page, as a client choosing a video call; returns the page and the client. */
async function toFigure(name: string) {
  const c = client();
  await c.req('/assessment');
  await c.post('/assessment/buildings', { b0_sector: 'dental' });
  await c.post('/assessment/spend-on', { b0_trigger: 'fit_out' });
  await c.post('/assessment/amounts', { b0_spend: '500000', b0_date: '2023' });
  await c.post('/assessment/tax', { b0_tax: 'yes', b0_profit: 'profitable' });
  await c.post('/assessment/claims', { b0_prior: 'no' });
  await c.post('/assessment/works', { b0_works: 'no' });
  await c.post('/assessment/details', { b0_business: name, b0_entity: 'ltd', b0_line1: '3 Invented Row', b0_town: 'Leicester', b0_postcode: 'LE1 1AA' });
  const fig = (await c.req('/assessment/figure')).body;
  return { c, fig };
}
async function sendVideo(name: string, email: string, slotIndex = 3) {
  const { c, fig } = await toFigure(name);
  const slots = [...fig.matchAll(/name="slot" value="([^"]+)"/g)].map((m) => m[1]!).filter((x) => x !== '');
  const slot = slots[slotIndex]!;
  const day = [...fig.matchAll(/name="day" value="(\d{4}-\d\d-\d\d)"/g)].map((m) => m[1]!).find((d) => new Date(slot).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === d)!; // the UK date, never the UTC one
  const sent = await c.post('/assessment/close', { first_name: 'Ada', surname: 'Invented', job_role: 'owner_director', channel: 'video', email, day, slot, contact_consent: 'on' });
  const business = made.app.db.get<{ id: string }>('SELECT id FROM businesses WHERE name = ?', [name])!.id;
  const booking = made.app.db.get<{ id: string; starts_at: string }>('SELECT id, starts_at FROM bookings WHERE business_id = ?', [business])!;
  return { sent, booking, slot };
}

describe('the Zoom connector', () => {
  test('the transfer is approved (30 Sep 2026, for testing); without the keys nothing is made, and they are named', () => {
    assert.equal(CALL_POLICIES['ZOOM_API']?.international_transfer_approved, true);
    assert.equal(CALL_POLICIES['ZOOM_OAUTH']?.international_transfer_approved, true);
    assert.equal(CALL_POLICIES['ZOOM_API']?.max_attempts, 1, 'making a meeting is not safe to repeat');
    assert.deepEqual(zoomMissing(secretsFromValues({})), [
      'Put the Zoom keys in the key file: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_SDK_CLIENT_ID, ZOOM_SDK_CLIENT_SECRET.',
    ]);
    assert.deepEqual(zoomMissing(secretsFromValues(KEYS)), []);
    // Were the approval taken back, the transfer would be named again.
    assert.deepEqual(zoomMissing(secretsFromValues(KEYS), { international_transfer_approved: false }), ['Zoom is a US company: the data protection officer approves the transfer (sources.ts, ZOOM_OAUTH and ZOOM_API).']);
  });

  test('a meeting is made with the time, an hour, the waiting room and "Cap Rebate call" — nobody\'s name — and the token is asked for once', async () => {
    const t = zoomOn();
    const d = zoomDeps(made.app);
    const one = await makeZoomMeeting(d, '2026-10-02T09:00:00.000Z', 60);
    assert.deepEqual(one, { state: 'MADE', meeting_id: '81234567890', join_url: 'https://us06web.zoom.us/j/81234567890?pwd=invented', passcode: 'Inv3nt' });
    await makeZoomMeeting(d, '2026-10-03T09:00:00.000Z', 60);
    const tok = t.seen.filter((x) => x.url.includes('/oauth/token'));
    assert.equal(tok.length, 1, 'the hour-long token was not kept');
    assert.equal(new URL(tok[0]!.url).searchParams.get('grant_type'), 'account_credentials');
    assert.equal(new URL(tok[0]!.url).searchParams.get('account_id'), 'invented-account');
    assert.equal(tok[0]!.headers['authorization'], 'Basic ' + Buffer.from('invented-s2s-id:invented-s2s-secret').toString('base64'));
    const mk = t.seen.filter((x) => x.url.endsWith('/v2/users/me/meetings'));
    assert.equal(mk.length, 2);
    assert.equal(mk[0]!.headers['authorization'], 'Bearer invented-access-token');
    const body = JSON.parse(mk[0]!.body ?? '{}') as Record<string, unknown>;
    assert.equal(body['topic'], MEETING_TOPIC);
    assert.equal(body['start_time'], '2026-10-02T09:00:00Z');
    assert.equal(body['duration'], 60);
    assert.deepEqual((body['settings'] as Record<string, unknown>)['waiting_room'], true);
    assert.deepEqual((body['settings'] as Record<string, unknown>)['join_before_host'], false);
  });

  test('the join signature is Zoom\'s JWT: HMAC-SHA256 with the SDK secret, the meeting, the role, two hours, WebRTC', () => {
    const s = joinSignature(secretsFromValues(KEYS), '81234567890', 1, '2026-10-02T09:00:00.000Z')!;
    assert.equal(s.sdk_key, 'invented-sdk-id');
    const [h, p, sig] = s.signature.split('.');
    assert.equal(sig, createHmac('sha256', 'invented-sdk-secret').update(`${h}.${p}`).digest('base64url'));
    assert.deepEqual(JSON.parse(Buffer.from(h!, 'base64url').toString()), { alg: 'HS256', typ: 'JWT' });
    const body = JSON.parse(Buffer.from(p!, 'base64url').toString()) as Record<string, number | string>;
    assert.equal(body['appKey'], 'invented-sdk-id');
    assert.equal(body['mn'], '81234567890');
    assert.equal(body['role'], 1);
    assert.equal(Number(body['exp']) - Number(body['iat']), 7200);
    assert.equal(body['tokenExp'], body['exp']);
    assert.equal(body['video_webrtc_mode'], 1);
    assert.equal(joinSignature(secretsFromValues({}), '81234567890', 0, T), null, 'signed with no key');
    assert.equal(joinSignature(secretsFromValues(KEYS), '12; drop', 0, T), null);
  });

  test('the client\'s page opens half an hour before the call and closes an hour after it', () => {
    const s = '2026-10-02T09:00:00.000Z', e = '2026-10-02T10:00:00.000Z';
    assert.equal(clientMayJoin(s, e, '2026-10-02T08:29:00.000Z'), 'early');
    assert.equal(clientMayJoin(s, e, '2026-10-02T08:30:00.000Z'), 'open');
    assert.equal(clientMayJoin(s, e, '2026-10-02T11:00:00.000Z'), 'open');
    assert.equal(clientMayJoin(s, e, '2026-10-02T11:01:00.000Z'), 'over');
  });
});

describe('a video call booked at the figure page', () => {
  test('with Zoom on: the meeting is made, the thank-you gives the join link, and the email carries it with Zoom\'s link and passcode', async () => {
    const t = zoomOn();
    const { sent, booking } = await sendVideo('Zoom Dental One Limited', 'ada.vc1@example.com');
    assert.equal(sent.status, 200, sent.body.slice(0, 300));
    const m = made.app.db.get<{ meeting_id: string; client_token: string; join_url: string }>('SELECT meeting_id, client_token, join_url FROM video_meetings WHERE booking_id = ? AND cancelled_at IS NULL', [booking.id]);
    assert.ok(m !== undefined, 'no meeting was made');
    assert.equal(m.meeting_id, '81234567890');
    assert.match(m.client_token, /^[0-9a-f]{64}$/);
    assert.match(sent.body, new RegExp(`Your video call link: <a href="/call/${m.client_token}">join the call here</a>`));
    const mail = made.app.db.get<{ subject: string; body: string; id: string }>("SELECT id, subject, body FROM outbox WHERE to_email = 'ada.vc1@example.com' AND kind = 'CALENDAR_INVITE'");
    assert.ok(mail !== undefined, 'no invitation was saved');
    assert.match(mail.subject, /^Your video call with Cap Rebate: /);
    assert.match(mail.body, /A video call has been arranged for .*, lasting 60 minutes\./);
    assert.ok(mail.body.includes(`Join the video call in your web browser: https://caprebate.example.invalid/call/${m.client_token}`));
    assert.ok(mail.body.includes('Or open it in the Zoom app: https://us06web.zoom.us/j/81234567890?pwd=invented'));
    assert.match(mail.body, /Meeting ID: 812 3456 7890, passcode: Inv3nt/);
    const ics = made.app.db.get<{ bytes: Uint8Array }>('SELECT bytes FROM outbox_inline_files WHERE outbox_id = ?', [mail.id]);
    assert.ok(ics !== undefined, 'no calendar file');
    const text = Buffer.from(ics.bytes).toString('utf8').replace(/\r\n /g, '');
    assert.ok(text.includes(`LOCATION:https://caprebate.example.invalid/call/${m.client_token}`), text);
    // Nothing about the client went to Zoom: not their name, not their email, not their business.
    for (const x of t.seen) assert.doesNotMatch(`${x.url} ${x.body ?? ''}`, /Ada|Invented|ada\.vc1|Zoom Dental/);
    // Only one telephone-style invitation was not also written.
    assert.equal(made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE to_email = 'ada.vc1@example.com' AND kind = 'CALENDAR_INVITE'")?.n, 1);
  });

  test('without Zoom (as shipped): the call is held, no meeting is made, and the page and email say the link will follow', async () => {
    const { sent, booking } = await sendVideo('Zoom Dental Two Limited', 'ada.vc2@example.com');
    assert.equal(sent.status, 200);
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM video_meetings WHERE booking_id = ?', [booking.id])?.n, 0);
    assert.match(sent.body, /We will email you the link for the video call before it starts\./);
    const mail = made.app.db.get<{ body: string }>("SELECT body FROM outbox WHERE to_email = 'ada.vc2@example.com' AND kind = 'CALENDAR_INVITE'");
    assert.match(mail?.body ?? '', /We will email you the link for the video call before it starts\./);
  });
});

describe('joining inside our site', () => {
  test('the client\'s page: before the time it says when; at the time it runs Zoom\'s SDK under its own policy, as a participant', async () => {
    zoomOn();
    const { booking } = await sendVideo('Zoom Dental Three Limited', 'ada.vc3@example.com', 5);
    const token = made.app.db.get<{ t: string }>('SELECT client_token AS t FROM video_meetings WHERE booking_id = ?', [booking.id])!.t;
    const early = await client().req(`/call/${token}`);
    assert.equal(early.status, 200);
    assert.match(early.body, /The call opens here half an hour before it starts\./);
    assert.doesNotMatch(early.body, /data-signature/);
    assert.match(early.body, /Open the call in Zoom<\/a> \(passcode Inv3nt\)/);
    // Bring the call to ten minutes from now.
    const soon = new Date(Date.parse(made.app.now()) + 10 * 60_000).toISOString();
    made.app.db.run('UPDATE bookings SET starts_at = ?, ends_at = ? WHERE id = ?', [soon, new Date(Date.parse(soon) + 3_600_000).toISOString(), booking.id]);
    const open = await client().req(`/call/${token}`);
    assert.equal(open.status, 200);
    assert.equal(open.headers.get('content-security-policy'), VIDEO_PAGE_CSP);
    // The first real call (30 Sep 2026): Zoom loads part of its video screen as a blob: script. Still nothing inline.
    const scriptSrc = /script-src ([^;]+);/.exec(VIDEO_PAGE_CSP)?.[1] ?? '';
    assert.ok(scriptSrc.split(' ').includes('blob:'), 'Zoom\'s blob: scripts are refused');
    assert.ok(!scriptSrc.includes("'unsafe-inline'"), 'inline script allowed');
    assert.equal(open.headers.get('cache-control'), 'no-store');
    assert.match(open.body, /<script src="https:\/\/source\.zoom\.us\/6\.5\.0\/zoom-meeting-embedded-6\.5\.0\.min\.js" crossorigin="anonymous"><\/script><script src="\/assets\/video-call\.js"><\/script>/);
    assert.doesNotMatch(open.body, /<script>|<script [^>]*>[^<]+<\/script>/, 'an inline script');
    const sig = /data-signature="([^"]+)"/.exec(open.body)?.[1] ?? '';
    const payload = JSON.parse(Buffer.from(sig.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>;
    assert.equal(payload['role'], 0, 'the client joins as a participant');
    assert.match(open.body, /data-zak=""/, 'a start token reached the client');
    assert.match(open.body, /data-name="Ada Invented"/);
    assert.match(open.body, />Join the call<\/button>/);
    const js = await client().req('/assets/video-call.js');
    assert.equal(js.status, 200);
    assert.match(js.body, /ZoomMtgEmbedded\.createClient\(\)/);
    assert.equal((await client().req(`/call/${'0'.repeat(64)}`)).status, 404);
  });

  test('staff see "Join the video call" on the call, and start it inside the back office as the host with Zoom\'s start token', async () => {
    const t = zoomOn();
    const { booking } = await sendVideo('Zoom Dental Four Limited', 'ada.vc4@example.com');
    const s = client();
    await s.post('/login', { email: 'vc.sales@example.invalid', password: PASSWORD });
    const page = await s.req(`/staff/calendar/${booking.id}`);
    assert.match(page.body, new RegExp(`<a class="cta" href="/staff/calendar/${booking.id}/video">Join the video call</a>`));
    const v = await s.req(`/staff/calendar/${booking.id}/video`);
    assert.equal(v.status, 200, v.body.slice(0, 400));
    assert.equal(v.headers.get('content-security-policy'), VIDEO_PAGE_CSP);
    assert.equal(v.headers.get('cache-control'), 'no-store');
    assert.match(v.body, /data-zak="invented-zak-token"/);
    assert.match(v.body, /data-role="host"/);
    assert.match(v.body, />Start the call<\/button>/);
    const sig = /data-signature="([^"]+)"/.exec(v.body)?.[1] ?? '';
    assert.equal((JSON.parse(Buffer.from(sig.split('.')[1] ?? '', 'base64url').toString()) as Record<string, unknown>)['role'], 1);
    assert.ok(t.seen.some((x) => x.url.endsWith('/v2/users/me/token?type=zak')));
    // Nobody signed in: no way in.
    assert.equal((await client().req(`/staff/calendar/${booking.id}/video`)).location, '/login');
  });

  test('a video call with no time can now be given one by staff; its meeting is made then and the client is sent the link', async () => {
    const t = zoomOn();
    const { c, fig } = await toFigure('Zoom Dental Five Limited');
    const day = /name="day" value="(\d{4}-\d\d-\d\d)"/.exec(fig)![1]!;
    const sent = await c.post('/assessment/close', { first_name: 'Ada', surname: 'Invented', job_role: 'owner_director', channel: 'video', email: 'ada.vc5@example.com', day, slot: '', contact_consent: 'on' });
    assert.equal(sent.status, 200);
    const biz = made.app.db.get<{ id: string }>("SELECT id FROM businesses WHERE name = 'Zoom Dental Five Limited'")!.id;
    const bk = made.app.db.get<{ id: string; starts_at: string | null }>('SELECT id, starts_at FROM bookings WHERE business_id = ?', [biz])!;
    assert.equal(bk.starts_at, null);
    assert.equal(t.seen.filter((x) => x.url.includes('/meetings')).length, 0, 'a meeting was made with no time');
    const s = client();
    await s.post('/login', { email: 'vc.sales@example.invalid', password: PASSWORD });
    assert.match((await s.req(`/staff/calendar/${bk.id}`)).body, /No Zoom meeting yet\. It has no time yet; its meeting is made when it is given one\./);
    const when = /name="starts_at" value="([^"]+)"/.exec((await s.req(`/staff/calendar/${bk.id}`)).body)![1]!;
    const r = await s.post(`/staff/calendar/${bk.id}/schedule`, { starts_at: when });
    assert.equal(r.status, 303, r.body.slice(0, 300));
    assert.ok(made.app.db.get('SELECT 1 AS x FROM video_meetings WHERE booking_id = ? AND cancelled_at IS NULL', [bk.id]), 'no meeting was made');
    const mail = made.app.db.get<{ body: string }>("SELECT body FROM outbox WHERE to_email = 'ada.vc5@example.com' AND kind = 'CALENDAR_INVITE' ORDER BY rowid DESC LIMIT 1");
    assert.match(mail?.body ?? '', /A video call has been arranged for .*\n\nJoin the video call in your web browser: https:\/\/caprebate\.example\.invalid\/call\/[0-9a-f]{64}/);
    assert.equal(made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE to_email = 'ada.vc5@example.com' AND body LIKE 'A telephone call%'")?.n, 0, 'a video call was called a telephone call');
  });

  test('moved: Zoom moves the same meeting; cancelled: Zoom deletes it, the row closes, and the client\'s link stops', async () => {
    const t = zoomOn();
    const { booking } = await sendVideo('Zoom Dental Six Limited', 'ada.vc6@example.com');
    const token = made.app.db.get<{ t: string }>('SELECT client_token AS t FROM video_meetings WHERE booking_id = ?', [booking.id])!.t;
    const later = new Date(Date.parse(booking.starts_at) + 24 * 3_600_000).toISOString();
    made.app.db.run('UPDATE bookings SET starts_at = ?, ends_at = ? WHERE id = ?', [later, new Date(Date.parse(later) + 3_600_000).toISOString(), booking.id]);
    assert.equal(await reconcileVideoMeeting(made.app, booking.id), 'MOVED');
    const patch = t.seen.find((x) => x.method === 'PATCH');
    assert.equal(JSON.parse(patch?.body ?? '{}')['start_time'], later.replace(/\.\d{3}Z$/, 'Z'));
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM video_meetings WHERE booking_id = ?', [booking.id])?.n, 1, 'a second meeting was made for a move');
    made.app.db.run('UPDATE bookings SET cancelled_at = ?, cancelled_by = ? WHERE id = ?', [made.app.now(), 'u-vc-sales', booking.id]);
    assert.equal(await reconcileVideoMeeting(made.app, booking.id), 'CANCELLED');
    assert.ok(t.seen.some((x) => x.method === 'DELETE' && x.url.endsWith('/v2/meetings/81234567890')));
    assert.equal((await client().req(`/call/${token}`)).status, 404);
    assert.throws(() => made.app.db.run('UPDATE video_meetings SET cancelled_at = NULL WHERE booking_id = ?', [booking.id]), /final/);
  });
});
