/**
 * PHASE 156d, 5 October 2026 — ZOOM ON THE FREE PLAN, WITH ONE SHARED HOST.
 *
 * Lakhbir: "yes change 156d so i dont pay", and "right now i dont need to add additonal staff contact@caprebate is
 * enough". So: no ZOOM_PLAN is the free plan (src/connectors/zoom.ts, zoomPlanIsFree); the 40 minutes are said where a
 * video call is booked, on its pages and in its invitation; two video calls at the same time on the one Zoom user are
 * warned about, never refused; and staff can ask Zoom how long a call lasted and how many joined (zoomPastCall,
 * checkCallLength, migration 091) - or the screen says our plan does not give it. The walkthrough call's free-plan
 * words are proved in test/survey-evidence.test.ts.
 *
 * Recorded answers only: nothing here reaches Zoom. The keys are invented; the transfer is approved through the test
 * hook, as test/video-calls.test.ts does.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { fixtureTransport, liveTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { forgetZoomToken, makeZoomMeeting, zoomPastCall, zoomPlanIsFree, FREE_PLAN_LINE, NOT_ON_PLAN_WORDS } from '../src/connectors/zoom.ts';
import {
  callLengthOf, callLengthWords, checkCallLength, videoCallsAtSameTime, videoJoinWords, zoomDeps, zoomPlanLine, SAME_TIME_WORDS,
} from '../src/web/video-calls.ts';
import { sendVideoInvite } from '../src/web/booking-invite.ts';
import { startHarness, type Harness } from './ui-tidy-harness.ts';

const KEYS = {
  ZOOM_ACCOUNT_ID: 'invented-account', ZOOM_CLIENT_ID: 'invented-s2s-id', ZOOM_CLIENT_SECRET: 'invented-s2s-secret',
  ZOOM_SDK_CLIENT_ID: 'invented-sdk-id', ZOOM_SDK_CLIENT_SECRET: 'invented-sdk-secret',
};
const MEETING = '81234567890';
const TOKEN: Fixture = { status: 200, body: JSON.stringify({ access_token: 'invented-access-token', expires_in: 3599 }) };
const MADE_MEETING: Fixture = { status: 201, body: JSON.stringify({ id: Number(MEETING), join_url: `https://us06web.zoom.us/j/${MEETING}?pwd=invented`, password: 'Inv3nt' }) };
/** Zoom's past meeting, as its API reference shows it - with fields we must never keep. */
const PAST = (extra: Record<string, unknown> = {}): Fixture => ({ status: 200, body: JSON.stringify({
  uuid: 'invented-uuid==', id: Number(MEETING), host_id: 'invented-host', type: 2, topic: 'Cap Rebate call', user_name: 'Contact Inbox',
  user_email: 'contact@caprebate.example.invalid', start_time: '2026-10-05T14:00:00Z', end_time: '2026-10-05T14:23:00Z', duration: 23,
  total_minutes: 46, ...extra }) });
const PEOPLE: Fixture = { status: 200, body: JSON.stringify({ page_size: 1, total_records: 3,
  participants: [{ id: 'p1', name: 'Ada Invented', user_email: 'ada@invented.example.invalid', join_time: '2026-10-05T14:00:10Z' }] }) };

let H: Harness;
let business = '';
let contactEmail = '';
before(async () => {
  H = await startHarness('p156d');
  const b = H.made.app.db.get<{ business_id: string; email: string }>(
    "SELECT c.business_id, c.email FROM contacts c JOIN businesses b ON b.id = c.business_id WHERE c.email IS NOT NULL AND trim(c.email) <> '' " +
    "AND coalesce(b.client_status, '') <> 'DO_NOT_CONTACT' ORDER BY c.business_id LIMIT 1");
  assert.ok(b !== undefined, 'the seed has no company contact with an email');
  business = b.business_id;
  contactEmail = b.email;
});
after(() => H.close());
beforeEach(() => { forgetZoomToken(); H.made.app.outside = liveTransport; H.made.app.secrets = secretsFromValues({}); delete H.made.app.zoomPolicy; });

function zoomOn(fixtures: Record<string, Fixture | readonly Fixture[]>, keys: Record<string, string> = KEYS) {
  const t = fixtureTransport({ 'POST /oauth/token': TOKEN, ...fixtures });
  H.made.app.outside = t;
  H.made.app.secrets = secretsFromValues(keys);
  H.made.app.zoomPolicy = { international_transfer_approved: true };
  return t;
}

const at = (minutesFromNow: number): string => new Date(Math.floor(Date.now() / 60_000) * 60_000 + minutesFromNow * 60_000).toISOString();
let n = 0;
/** A video call booked straight into the diary, with (or without) a meeting already made. Returns its id. */
function videoCall(o: { starts: number; minutes?: number; meeting?: boolean; host?: string | null; channel?: string; cancelled?: boolean; business?: string }): string {
  const id = `bk-156d-${++n}`;
  const db = H.made.app.db;
  db.run("INSERT INTO bookings (id, business_id, lead_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at) VALUES (?, ?, NULL, NULL, ?, NULL, 'staff', ?, ?, ?)",
    [id, o.business ?? business, o.channel ?? 'video', at(o.starts), at(o.starts + (o.minutes ?? 60)), at(-600)]);
  // A booking is written uncancelled; cancelling is an update that names who and when (migration 025).
  if (o.cancelled === true) db.run('UPDATE bookings SET cancelled_at = ?, cancelled_by = ? WHERE id = ?', [at(-1), H.actor('sales').id, id]);
  if (o.meeting !== false && (o.channel ?? 'video') === 'video') {
    db.run('INSERT INTO video_meetings (id, booking_id, provider, meeting_id, join_url, passcode, client_token, created_at, host_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [`vm-${id}`, id, 'zoom', MEETING, `https://us06web.zoom.us/j/${MEETING}`, 'Inv3nt', randomBytes(32).toString('hex'), at(-600), o.host ?? null]);
  }
  return id;
}

describe('the plan: free unless ZOOM_PLAN says a paid one', () => {
  test('absent, empty, "free" or anything unknown is the free plan; "pro", "paid" and "business" (any case) are paid', () => {
    for (const v of [undefined, '', 'free', 'basic', 'yes', ' pr o ']) {
      assert.equal(zoomPlanIsFree(secretsFromValues(v === undefined ? {} : { ZOOM_PLAN: v })), true, String(v));
    }
    for (const v of ['pro', 'PRO', ' Paid ', 'business']) assert.equal(zoomPlanIsFree(secretsFromValues({ ZOOM_PLAN: v })), false, v);
  });

  test('the 40-minute line is said on the free plan and gone on a paid one', () => {
    assert.equal(FREE_PLAN_LINE, 'On our current Zoom plan a call ends after 40 minutes. If it does, use the same link to start again.');
    H.made.app.secrets = secretsFromValues(KEYS);
    assert.equal(zoomPlanLine(H.made.app), FREE_PLAN_LINE);
    H.made.app.secrets = secretsFromValues({ ...KEYS, ZOOM_PLAN: 'pro' });
    assert.equal(zoomPlanLine(H.made.app), null);
  });

  test('a walkthrough meeting asks Zoom for a cloud recording only on a paid plan; an ordinary call never does', async () => {
    const t = zoomOn({ 'POST /v2/users/me/meetings': MADE_MEETING });
    const rec = () => (JSON.parse(t.seen.filter((s) => s.url.endsWith('/v2/users/me/meetings')).at(-1)!.body ?? '{}') as { settings: { auto_recording: string } }).settings.auto_recording;
    await makeZoomMeeting(zoomDeps(H.made.app), at(60), 60, { record: true });
    assert.equal(rec(), 'none', 'the free plan was asked to record to the cloud');
    H.made.app.secrets = secretsFromValues({ ...KEYS, ZOOM_PLAN: 'pro' });
    await makeZoomMeeting(zoomDeps(H.made.app), at(60), 60, { record: true });
    assert.equal(rec(), 'cloud');
    await makeZoomMeeting(zoomDeps(H.made.app), at(60), 60);
    assert.equal(rec(), 'none');
  });

  test('the invitation says the 40 minutes on the free plan, and not on a paid one', () => {
    const id = videoCall({ starts: 24 * 60 });
    const free = videoJoinWords(H.made.app.db, id, 'https://caprebate.example.invalid', true)!;
    assert.ok(free.lines.includes(FREE_PLAN_LINE));
    assert.ok(!videoJoinWords(H.made.app.db, id, 'https://caprebate.example.invalid', false)!.lines.includes(FREE_PLAN_LINE));
    H.made.app.secrets = secretsFromValues(KEYS);
    sendVideoInvite(H.made.app, 'https://caprebate.example.invalid', id, 'arranged', contactEmail);
    const body = H.made.app.db.get<{ body: string }>("SELECT body FROM outbox WHERE kind = 'CALENDAR_INVITE' ORDER BY rowid DESC LIMIT 1")!.body;
    assert.ok(body.includes(FREE_PLAN_LINE), 'the email sent on the free plan does not say the 40 minutes');
  });
});

describe('how long a call lasted, from Zoom', () => {
  test('Zoom\'s answer gives the minutes and how many joined - two numbers, nothing else', async () => {
    const t = zoomOn({ [`GET /v2/past_meetings/${MEETING}`]: PAST({ participants_count: 2 }) });
    const r = await zoomPastCall(zoomDeps(H.made.app), MEETING);
    assert.deepEqual(r, { state: 'FOUND', minutes: 23, people: 2 });
    assert.equal(t.seen.filter((s) => s.url.includes('/participants')).length, 0, 'the list of who joined was asked for when the count was given');
  });

  test('without a count, the list of who joined is asked for its total only, and no name or email comes back', async () => {
    const t = zoomOn({ [`GET /v2/past_meetings/${MEETING}`]: PAST(), [`GET /v2/past_meetings/${MEETING}/participants`]: PEOPLE });
    const r = await zoomPastCall(zoomDeps(H.made.app), MEETING);
    assert.deepEqual(r, { state: 'FOUND', minutes: 23, people: 3 });
    const p = t.seen.find((s) => s.url.includes('/participants'))!;
    assert.equal(new URL(p.url).searchParams.get('page_size'), '1');
    assert.doesNotMatch(JSON.stringify(r), /Ada|@|Contact Inbox|uuid/);
  });

  test('not run yet, refused by the plan, or refused for another reason: each said in words', async () => {
    zoomOn({ [`GET /v2/past_meetings/${MEETING}`]: [
      { status: 404, body: '{"code":3001,"message":"Meeting does not exist: 81234567890."}' },
      { status: 400, body: '{"code":3001,"message":"This meeting has not ended."}' },
      { status: 400, body: '{"code":200,"message":"This API is only available for paid users."}' },
      { status: 400, body: '{"code":4711,"message":"Invalid access token, does not contain scopes:[meeting:read:past_meeting:admin]."}' },
    ] });
    const d = zoomDeps(H.made.app);
    const a = await zoomPastCall(d, MEETING);
    assert.equal(a.state, 'NOT_YET');
    assert.equal((await zoomPastCall(d, MEETING)).state, 'NOT_YET');
    assert.deepEqual(await zoomPastCall(d, MEETING), { state: 'NOT_ON_PLAN', why: NOT_ON_PLAN_WORDS, zoom_code: 200 });
    const s = await zoomPastCall(d, MEETING);
    assert.equal(s.state, 'NOT_FOUND');
    assert.match(s.state === 'NOT_FOUND' ? s.why : '', /two past-meeting scopes/);
    assert.equal(NOT_ON_PLAN_WORDS, 'Call length: not shown on our Zoom plan.');
  });

  test('a meeting id that is not one, or Zoom not set up, asks nothing', async () => {
    const t = zoomOn({});
    assert.deepEqual(await zoomPastCall(zoomDeps(H.made.app), '12; drop'), { state: 'NOT_FOUND', why: 'That is not a Zoom meeting.' });
    H.made.app.secrets = secretsFromValues({});
    assert.equal((await zoomPastCall(zoomDeps(H.made.app), MEETING)).state, 'NOT_FOUND');
    assert.equal(t.seen.length, 0);
  });

  test('the words: singular and plural, an unknown count, and the plan\'s refusal', () => {
    assert.equal(callLengthWords({ call_minutes: 23, call_people: 2, call_check_state: 'FOUND', call_checked_at: 'x' }), 'Lasted 23 minutes. 2 people joined.');
    assert.equal(callLengthWords({ call_minutes: 1, call_people: 1, call_check_state: 'FOUND', call_checked_at: 'x' }), 'Lasted 1 minute. 1 person joined.');
    assert.equal(callLengthWords({ call_minutes: 5, call_people: null, call_check_state: 'FOUND', call_checked_at: 'x' }), 'Lasted 5 minutes.');
    assert.equal(callLengthWords({ call_minutes: null, call_people: null, call_check_state: 'NOT_ON_PLAN', call_checked_at: 'x' }), NOT_ON_PLAN_WORDS);
    assert.equal(callLengthWords({ call_minutes: null, call_people: null, call_check_state: 'NOT_YET', call_checked_at: 'x' }), null);
    assert.equal(callLengthWords(undefined), null);
  });

  test('the database keeps two numbers in range and one of four states', () => {
    const id = videoCall({ starts: -120 });
    const db = H.made.app.db;
    assert.throws(() => db.run('UPDATE video_meetings SET call_minutes = 1441 WHERE booking_id = ?', [id]), /CHECK/);
    assert.throws(() => db.run('UPDATE video_meetings SET call_people = -1 WHERE booking_id = ?', [id]), /CHECK/);
    assert.throws(() => db.run("UPDATE video_meetings SET call_check_state = 'MAYBE' WHERE booking_id = ?", [id]), /CHECK/);
  });

  test('asked again later, a "not yet" keeps the numbers already kept', async () => {
    const id = videoCall({ starts: -180 });
    zoomOn({ [`GET /v2/past_meetings/${MEETING}`]: [PAST({ participants_count: 2 }), { status: 404, body: '{"code":3001,"message":"gone"}' }] });
    const who = H.actor('sales');
    assert.equal((await checkCallLength(H.made.app, who, id)).state, 'FOUND');
    assert.equal((await checkCallLength(H.made.app, who, id)).state, 'NOT_YET');
    const kept = callLengthOf(H.made.app.db, id)!;
    assert.deepEqual([kept.call_minutes, kept.call_people, kept.call_check_state], [23, 2, 'FOUND']);
    const audit = H.made.app.db.all<{ detail: string }>("SELECT detail FROM audit_log WHERE kind = 'VIDEO_CALL_LENGTH_CHECKED' AND object_id = ?", [id]);
    assert.equal(audit.length, 2);
    assert.doesNotMatch(audit.map((a) => a.detail).join(' '), /23|Ada|@/, 'the audit line carries more than the state');
  });
});

describe('one Zoom user hosts one call at a time', () => {
  test('two video calls at the same time on the shared host are counted; other hosts, other times, cancelled calls and telephone calls are not', () => {
    const db = H.made.app.db;
    const a = videoCall({ starts: 3000 });
    const b = videoCall({ starts: 3030 });                              // overlaps a by half an hour
    const c = videoCall({ starts: 3060 });                              // starts as a ends: no overlap
    const d = videoCall({ starts: 3000, host: H.actor('admin').id });   // its own member of staff's Zoom user
    const e = videoCall({ starts: 3000, cancelled: true, meeting: false });
    const f = videoCall({ starts: 3000, channel: 'phone' });
    const g = videoCall({ starts: 3010, meeting: false });              // no meeting yet: it would go to the shared host
    assert.equal(videoCallsAtSameTime(db, a), 2, 'a overlaps b and g');
    assert.equal(videoCallsAtSameTime(db, b), 3, 'b overlaps a, c and g');
    assert.equal(videoCallsAtSameTime(db, d), 0, 'a call on its own Zoom user clashes with nobody');
    assert.equal(videoCallsAtSameTime(db, e), 0);
    assert.equal(videoCallsAtSameTime(db, f), 0);
    assert.equal(SAME_TIME_WORDS, 'Another video call is booked at this time. Only one can run at once on our Zoom account.');
  });
});

describe('the call\'s page in the diary', () => {
  test('it warns of another call at the same time, says the 40 minutes, and offers to ask Zoom once the call has started', async () => {
    H.made.app.secrets = secretsFromValues(KEYS);
    const past = videoCall({ starts: -90 });
    videoCall({ starts: -80 });
    const page = (await H.get('sales', `/staff/calendar/${past}`)).body;
    assert.ok(page.includes(SAME_TIME_WORDS), 'no warning of the other call');
    assert.ok(page.includes(FREE_PLAN_LINE), 'the 40 minutes are not said');
    assert.ok(page.includes(`action="/staff/calendar/${past}/length"`) && page.includes('Ask Zoom how long it lasted'));
    const later = videoCall({ starts: 4000 });
    const ahead = (await H.get('sales', `/staff/calendar/${later}`)).body;
    assert.ok(!ahead.includes('Ask Zoom how long it lasted'), 'offered before the call has started');
    assert.ok(!ahead.includes(SAME_TIME_WORDS), 'warned with nothing at the same time');
    H.made.app.secrets = secretsFromValues({ ...KEYS, ZOOM_PLAN: 'pro' });
    assert.ok(!(await H.get('sales', `/staff/calendar/${past}`)).body.includes(FREE_PLAN_LINE), 'the 40 minutes are said on a paid plan');
  });

  test('asking Zoom keeps the length and shows it; a call not yet started, or someone who does not arrange calls, is refused', async () => {
    zoomOn({ [`GET /v2/past_meetings/${MEETING}`]: [PAST({ participants_count: 2 }), { status: 400, body: '{"code":200,"message":"This API is only available for paid users."}' }] });
    const past = videoCall({ starts: -300 });
    const r = await H.post('sales', `/staff/calendar/${past}/length`, {});
    assert.equal(r.location, `/staff/calendar/${past}?length=ok`);
    assert.ok((await H.get('sales', `/staff/calendar/${past}`)).body.includes('Lasted 23 minutes. 2 people joined.'));
    const later = videoCall({ starts: 5000 });
    assert.notEqual((await H.post('sales', `/staff/calendar/${later}/length`, {})).location, `/staff/calendar/${later}?length=ok`);
    assert.equal(callLengthOf(H.made.app.db, later)!.call_checked_at, null, 'Zoom was asked about a call not yet started');
    const ro = await H.post('readonly', `/staff/calendar/${past}/length`, {});
    assert.notEqual(ro.location, `/staff/calendar/${past}?length=ok`);
    // The plan refuses: the page says so in words, and nobody thinks it broke.
    const other = videoCall({ starts: -400 });
    await H.post('admin', `/staff/calendar/${other}/length`, {});
    assert.ok((await H.get('admin', `/staff/calendar/${other}`)).body.includes(NOT_ON_PLAN_WORDS));
  });
});

describe('the Communication tab', () => {
  test('booking a Zoom call says the 40 minutes, warns of a call at the same time, and a past call shows how long it lasted', async () => {
    zoomOn({ 'POST /v2/users/me/meetings': MADE_MEETING, [`GET /v2/past_meetings/${MEETING}`]: PAST({ participants_count: 2 }) });
    const sales = H.actor('sales');
    const db = H.made.app.db;
    for (const w of [0, 1, 2, 3, 4, 5, 6]) db.run('INSERT OR IGNORE INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)', [`wt-156d-${w}`, sales.id, w, 0, 24 * 60]);
    const panel = (await H.get('sales', `/staff/clients/${business}?chat=all`)).body;
    // The form's own hint - not an earlier invitation's words, which the conversation also shows.
    assert.ok(panel.includes(`<p class="hint">${FREE_PLAN_LINE}</p>`), 'the Zoom form does not say the 40 minutes');
    const slot = /<select class="fi" id="cm-slot" name="slot">(?:<optgroup[^>]*>)?<option value="([^"]+)"/.exec(panel)?.[1] ?? '';
    assert.notEqual(slot, '', 'no free hour offered');
    // Another call already at that hour, Admin's, on the shared host (Admin has no Zoom user), so the hour stays free for Sales.
    const other = db.get<{ id: string }>('SELECT id FROM businesses WHERE id <> ? LIMIT 1', [business])!.id;
    db.run("INSERT INTO bookings (id, business_id, lead_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at) VALUES (?, ?, NULL, ?, 'video', NULL, 'staff', ?, ?, ?)",
      ['bk-156d-clash', other, H.actor('admin').id, slot, new Date(Date.parse(slot) + 3_600_000).toISOString(), at(-60)]);
    const r = await H.post('sales', `/staff/clients/${business}/communicate`, { via: 'zoom', zoom_to: contactEmail, slot, go: 'zoom-book' });
    assert.match(r.location ?? '', /done=booked-zoom-same-time/, `not warned: ${r.status} ${r.location ?? ''} ${(/<p class="err"[^]*?<\/p>/.exec(r.body) ?? [''])[0]}`);
    const warned = (await H.get('sales', r.location ?? '/')).body;
    assert.ok(warned.includes(SAME_TIME_WORDS));
    // A call that has run, asked about: the conversation shows how long it lasted.
    const ran = videoCall({ starts: -500 });
    await checkCallLength(H.made.app, sales, ran);
    assert.ok((await H.get('sales', `/staff/clients/${business}?chat=all`)).body.includes('Lasted 23 minutes. 2 people joined.'));
  });
});
