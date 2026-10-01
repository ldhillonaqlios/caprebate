/**
 * 1 OCTOBER 2026 — ONLY THE TEST WEBSITE CALLS ZOOM (src/connectors/zoom.ts, zoomPlaceRefusal).
 *
 * A copy on Lakhbir's Mac (a demo server reading the real key file) booked a test call from the Communication tab and
 * made a REAL meeting on our Zoom account. Now a copy calls Zoom only when it is the deployed test website, or when it
 * was started with CAPREBATE_LOCAL_ZOOM=1. A refusal says why in words, on the Communication tab, the calendar and the
 * API keys card. A test's recorded answers reach nobody, so they are never refused.
 *
 * Nothing here reaches Zoom: the keys are invented, and a live transport under the test runner is refused by
 * src/connectors/http.ts as well — which is how the tests below tell the two refusals apart.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { fixtureTransport, isLiveTransport, liveTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { cancelZoomMeeting, forgetZoomToken, hostZak, makeZoomMeeting, moveZoomMeeting, onTestWebsite, zoomMissing, zoomPlaceRefusal, zoomWhy, ZOOM_LOCAL_OPT_IN } from '../src/connectors/zoom.ts';
import { zoomBlockers, zoomDeps } from '../src/web/video-calls.ts';
import { serviceOn } from '../src/web/saved-keys.ts';

const T = '2026-10-01T09:00:00.000Z';
const PASSWORD = 'a-very-long-development-password';
const KEYS = {
  ZOOM_ACCOUNT_ID: 'invented-account', ZOOM_CLIENT_ID: 'invented-s2s-id', ZOOM_CLIENT_SECRET: 'invented-s2s-secret',
  ZOOM_SDK_CLIENT_ID: 'invented-sdk-id', ZOOM_SDK_CLIENT_SECRET: 'invented-sdk-secret',
};
const APPROVED = { international_transfer_approved: true } as const;
const WORDS = 'This copy is not the test website, so it does not call Zoom. A call from here would make a real meeting on our Zoom account. To try Zoom here on purpose, start it with CAPREBATE_LOCAL_ZOOM=1.';
/** What Vercel sets on the test website's own servers. */
const TEST_WEBSITE = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_URL: 'caprebate-test.vercel.app' };
const FIXTURES: Record<string, Fixture> = {
  'POST /oauth/token': { status: 200, body: JSON.stringify({ access_token: 'invented-access-token', expires_in: 3599 }) },
  'POST /v2/users/me/meetings': { status: 201, body: JSON.stringify({ id: 81234567890, join_url: 'https://us06web.zoom.us/j/81234567890?pwd=invented', password: 'Inv3nt' }) },
};

describe('where a copy may call Zoom from', () => {
  test('a live transport is refused unless this is the test website or the setting is exactly 1; a test\'s recorded answers never are', () => {
    assert.equal(isLiveTransport(liveTransport), true);
    assert.equal(isLiveTransport(fixtureTransport({})), false);
    // A local copy: the Mac's demo server, a page-render script, `npm start`.
    assert.equal(zoomPlaceRefusal(liveTransport, {}), WORDS);
    // The test website, live or a preview.
    assert.equal(zoomPlaceRefusal(liveTransport, TEST_WEBSITE), null);
    assert.equal(zoomPlaceRefusal(liveTransport, { ...TEST_WEBSITE, VERCEL_ENV: 'preview' }), null);
    // `vercel dev` on a computer says "development"; half of Vercel's settings copied into a file is not enough.
    assert.equal(zoomPlaceRefusal(liveTransport, { ...TEST_WEBSITE, VERCEL_ENV: 'development' }), WORDS);
    assert.equal(zoomPlaceRefusal(liveTransport, { VERCEL: '1', VERCEL_ENV: 'production' }), WORDS);
    assert.equal(zoomPlaceRefusal(liveTransport, { VERCEL_ENV: 'production', VERCEL_URL: 'x.vercel.app' }), WORDS);
    assert.equal(onTestWebsite(TEST_WEBSITE), true);
    // The opt-in, for when Lakhbir really means it. Nothing but "1" turns it on.
    assert.equal(ZOOM_LOCAL_OPT_IN, 'CAPREBATE_LOCAL_ZOOM');
    assert.equal(zoomPlaceRefusal(liveTransport, { CAPREBATE_LOCAL_ZOOM: '1' }), null);
    for (const v of ['yes', 'true', '0', '', ' ']) assert.equal(zoomPlaceRefusal(liveTransport, { CAPREBATE_LOCAL_ZOOM: v }), WORDS, `"${v}" opened it`);
    // Recorded answers reach nobody: never refused, wherever the test runs.
    assert.equal(zoomPlaceRefusal(fixtureTransport({}), {}), null);
  });

  test('zoomMissing names it beside the keys and the transfer; zoomWhy (the start-up log) says it', () => {
    const keys = secretsFromValues(KEYS);
    assert.deepEqual(zoomMissing(keys, APPROVED, { outside: liveTransport, env: {} }), [WORDS]);
    assert.deepEqual(zoomMissing(keys, APPROVED, { outside: liveTransport, env: TEST_WEBSITE }), []);
    assert.deepEqual(zoomMissing(keys, APPROVED, { outside: fixtureTransport({}), env: {} }), []);
    assert.equal(zoomMissing(secretsFromValues({}), APPROVED, { outside: liveTransport, env: {} }).length, 2, 'the keys and the place are both named');
    assert.equal(zoomWhy(keys, liveTransport, {}), `video calls get no Zoom meeting yet, so the team sends a link: ${WORDS}`);
    assert.equal(zoomWhy(keys, liveTransport, TEST_WEBSITE), 'video calls get a Zoom meeting, sent to the client and joined inside the site');
  });

  test('a local copy makes, moves and deletes no meeting and asks for no start token: nothing reaches the line that calls out, and the words say why', async () => {
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-zg1-')) });
    try {
      forgetZoomToken();
      made.app.secrets = secretsFromValues(KEYS);
      made.app.zoomPolicy = APPROVED;
      made.app.outside = liveTransport;
      const calls = () => made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM audit_log WHERE kind = 'CONNECTOR_CALLED'")!.n;
      const before = calls();
      const local = { ...zoomDeps(made.app), env: {} };
      assert.deepEqual(await makeZoomMeeting(local, '2026-10-02T08:00:00.000Z', 60), { state: 'NOT_MADE', why: WORDS });
      assert.equal(await hostZak(local), null);
      // Nor moves or deletes one (the stray meeting of 2 October stays Lakhbir's to delete by hand).
      assert.equal(await moveZoomMeeting(local, '81234567890', '2026-10-02T09:00:00.000Z', 60), false);
      assert.equal(await cancelZoomMeeting(local, '81234567890'), false);
      assert.equal(calls(), before, 'a local copy reached the line that calls Zoom');
      // The same keys on the test website DO reach that line (and there the test runner's own refusal stops it).
      const site = { ...zoomDeps(made.app), env: TEST_WEBSITE };
      const r = await makeZoomMeeting(site, '2026-10-02T08:00:00.000Z', 60);
      assert.equal(r.state, 'NOT_MADE');
      assert.equal(calls(), before + 1, 'the test website did not try');
    } finally { made.close(); }
  });

  test('a test\'s own recorded answers still make the meeting, whatever the settings say', async () => {
    forgetZoomToken();
    const made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-zg2-')) });
    try {
      made.app.secrets = secretsFromValues(KEYS);
      made.app.zoomPolicy = APPROVED;
      made.app.outside = fixtureTransport(FIXTURES);
      const r = await makeZoomMeeting({ ...zoomDeps(made.app), env: {} }, '2026-10-02T08:00:00.000Z', 60);
      assert.equal(r.state, 'MADE');
      assert.deepEqual(zoomBlockers(made.app), []);
    } finally { made.close(); }
  });

  test('every screen in src/ asks with the place: no zoomMissing call without it, outside the connector itself', () => {
    const dir = new URL('../src/', import.meta.url);
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts') && !f.endsWith('connectors/zoom.ts'));
    const asked: string[] = [];
    for (const f of files) {
      const s = readFileSync(new URL(f, dir), 'utf8');
      for (const m of s.matchAll(/zoomMissing\(([^)]*)\)/g)) asked.push(`${f}: ${m[1] ?? ''}`);
    }
    assert.deepEqual(asked, ['web/video-calls.ts: app.secrets, app.zoomPolicy, { outside: app.outside }']);
  });
});

describe('the screens say why, on a local copy with the keys', () => {
  let made: Awaited<ReturnType<typeof createApp>>;
  let base = '';
  let cookie = '';
  const req = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(base + path, { redirect: 'manual', ...init, headers: { ...(init.headers as Record<string, string> ?? {}), ...(cookie ? { cookie } : {}) } });
    for (const s of r.headers.getSetCookie()) { const f = s.split(';')[0] ?? ''; const k = f.split('=')[0]; cookie = [...cookie.split('; ').filter((x) => x && x.split('=')[0] !== k), f].join('; '); }
    return { status: r.status, body: await r.text(), location: r.headers.get('location') };
  };
  const form = (f: Record<string, string>): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(f).toString() });
  const hint = (body: string): string => /<div class="only for-zoom">\s*(<p class="hint">Zoom is not switched on here:[^<]*<\/p>)?/.exec(body)?.[1] ?? '';

  before(async () => {
    made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-zg3-')), now: () => T });
    await new Promise<void>((r) => made.server.listen(0, '127.0.0.1', () => r()));
    const a = made.server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a !== null ? a.port : 0}`;
    const db = made.app.db;
    db.run('INSERT INTO users (id,email,email_canonical,display_name,role,password_hash,created_at,updated_at,business_id) VALUES (?,?,?,?,?,?,?,?,NULL)',
      ['u-zg-admin', 'zg.admin@example.invalid', 'zg.admin@example.invalid', 'Ada Admin', 'ADMIN', await made.app.hasher.hash(PASSWORD), T, T]);
    db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, 5, 540, 1020)', [randomUUID(), 'u-zg-admin']); // Fridays 9 to 5
    db.run('INSERT INTO businesses (id,name,sector,stage,created_at,contact_email) VALUES (?,?,?,?,?,?)', ['b-zg', 'Zoom Guard Limited', 'dental', 'ASSESSMENT_SUBMITTED', T, 'office@zoom-guard.invented.co.uk']);
    db.run("INSERT INTO contacts (id, business_id, full_name, contact_consent, marketing_optin, created_at, email, phone) VALUES ('c-zg', 'b-zg', 'Pat Guard', 1, 0, ?, 'pat@zoom-guard.invented.co.uk', NULL)", [T]);
    await req('/login', form({ email: 'zg.admin@example.invalid', password: PASSWORD }));
  });
  after(() => made.close());
  beforeEach(() => {
    forgetZoomToken();
    made.app.secrets = secretsFromValues(KEYS);
    made.app.zoomPolicy = APPROVED;
    made.app.outside = liveTransport; // a running copy's own way out; the test runner's settings are not the test website's
  });

  test('the Communication tab says it above the Zoom buttons; booking still books, with no meeting, and the banner says so', async () => {
    const page = (await req('/staff/clients/b-zg?chat=all&via=zoom')).body;
    assert.equal(hint(page), `<p class="hint">Zoom is not switched on here: ${WORDS} A call is still booked, with no Zoom meeting, so send them a link yourself.</p>`);
    const slot = /<select class="fi" id="cm-slot" name="slot"><optgroup label="[^"]+"><option value="([^"]+)"/.exec(page)?.[1] ?? '';
    assert.notEqual(slot, '');
    const r = await req('/staff/clients/b-zg/communicate', form({ via: 'zoom', zoom_to: 'pat@zoom-guard.invented.co.uk', slot, go: 'zoom-book' }));
    assert.equal(r.location, '/staff/clients/b-zg?chat=all&done=booked-no-zoom#chat');
    assert.match((await req(r.location ?? '')).body, /Booked, but Zoom made no meeting, so the invite has no join link\. Choose Zoom call to see why\./);
    const b = made.app.db.get<{ id: string }>("SELECT id FROM bookings WHERE business_id = 'b-zg' AND channel = 'video'")!;
    assert.equal(made.app.db.get<{ n: number }>('SELECT count(*) AS n FROM video_meetings WHERE booking_id = ?', [b.id])!.n, 0);
    assert.equal(made.app.db.get<{ n: number }>("SELECT count(*) AS n FROM audit_log WHERE kind = 'CONNECTOR_CALLED'")!.n, 0, 'Zoom was asked');
    // The calendar's page for the call says the same words.
    const cal = (await req(`/staff/calendar/${b.id}`)).body;
    assert.ok(cal.includes(`<tr><th>Video call</th><td>No Zoom meeting yet. ${WORDS}</td></tr>`), 'the calendar does not say why');
    // "Start a Zoom call now" opens the call page, which says why there is nothing to join.
    const now = await req('/staff/clients/b-zg/communicate', form({ via: 'zoom', zoom_to: 'pat@zoom-guard.invented.co.uk', go: 'zoom-now' }));
    const call = (await req(now.location ?? '')).body;
    assert.ok(call.includes(WORDS), 'the call page does not say why');
  });

  test('the API keys card shows Zoom amber, with the same words', () => {
    assert.deepEqual(serviceOn(made.app, 'ZOOM'), { on: false, why: WORDS });
  });

  test('with recorded answers (every other test\'s way), no words, and the meeting is made', async () => {
    made.app.outside = fixtureTransport(FIXTURES);
    assert.equal(hint((await req('/staff/clients/b-zg?chat=all&via=zoom')).body), '');
    assert.deepEqual(serviceOn(made.app, 'ZOOM'), { on: true, why: '' });
  });
});
