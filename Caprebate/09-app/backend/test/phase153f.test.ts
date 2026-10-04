/**
 * PHASE 153f, 4 October 2026 — work found on 3 October that no phase held.
 *
 * Line 4: each video call is hosted on Zoom by its own member of staff (one Zoom user hosts one meeting at a time), and
 * the start token is asked for that same person; a member of staff with no Zoom user on our account falls back to the
 * shared host, and the call's page says so. Recorded Zoom answers only: nothing reaches Zoom.
 */

import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { fixtureTransport, liveTransport, type Fixture } from '../src/connectors/http.ts';
import { secretsFromValues } from '../src/secrets.ts';
import { forgetZoomToken } from '../src/connectors/zoom.ts';
import { activeMeeting, meetingHost, reconcileVideoMeeting } from '../src/web/video-calls.ts';

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
  made = await createApp(':memory:', { twoFactor: 'off', documentRoot: mkdtempSync(join(tmpdir(), 'cb-153f-')), publicOrigin: 'https://caprebate.example.invalid' });
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
beforeEach(() => { forgetZoomToken(); made.app.outside = liveTransport; made.app.secrets = secretsFromValues({}); delete made.app.zoomPolicy; });

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
