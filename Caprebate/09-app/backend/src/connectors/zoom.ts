/**
 * VIDEO CALLS THROUGH ZOOM — a meeting made for each call, and joined inside our own pages. 30 September 2026.
 *
 * Lakhbir: "with the video call link this should be sent automatically, and i feel zoom would be best for this as we
 * can run it via our platform, is there a way to have zoom embeded on our back end so its done though there?"
 *
 * TWO ZOOM APPS, BOTH MADE IN THE ZOOM APP MARKETPLACE ON OUR OWN ACCOUNT (developers.zoom.us, read 30 Sep 2026):
 *   · a SERVER-TO-SERVER OAUTH app — ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET. The server swaps them for an
 *     hour's token and makes, moves and cancels the meeting for each video call, and asks for the host's start token
 *     (ZAK) when a member of staff opens the call. Scopes: meeting:write:meeting:admin, meeting:update:meeting:admin,
 *     meeting:delete:meeting:admin, and user:read:token:admin — the first live call (30 Sep 2026) showed the start token
 *     needs that one ("user:read:zak:admin" is not enough: Zoom answered 4711).
 *   · a MEETING SDK app — ZOOM_SDK_CLIENT_ID, ZOOM_SDK_CLIENT_SECRET. Its secret signs each join ON THIS SERVER (a JWT,
 *     HMAC-SHA256: appKey, mn, role, iat, exp, tokenExp), so the meeting runs inside our page with Zoom's own Web SDK.
 *     Meetings on our own account need no Zoom review; since 2 March 2026 only joining OTHER accounts' meetings does.
 * The host is a user on our account (ZOOM_HOST_EMAIL, else the account's owner). Calls are booked for an hour
 * (SLOT_MINUTES). A FREE Zoom plan stops a meeting at 40 minutes, and for testing that is accepted (Lakhbir, 30 Sep
 * 2026: "leave the time for having it free at 40 mins but each appointment should be 1 hour"); a paid licence lifts it.
 *
 * NOTHING HAPPENS UNTIL BOTH ARE TRUE, each said in words by `zoomMissing`: the five keys are in the key file, and
 * the transfer is approved (sources.ts, ZOOM_OAUTH and ZOOM_API: Zoom is a US company). The transfer was approved for
 * testing on 30 September 2026 (Sadique Maskeen, relayed by Lakhbir). Without the keys no meeting is made, the booking
 * stands, and the back office says "send them a link", as before.
 *
 * 1 OCT 2026 — ONLY THE TEST WEBSITE CALLS ZOOM. A copy on Lakhbir's Mac (a demo server reading the real key file) booked
 * a test call from the Communication tab and made a REAL meeting on our Zoom account. So a third thing must be true,
 * said in words by `zoomPlaceRefusal`: the app is the deployed test website (Vercel says so: VERCEL=1, VERCEL_ENV
 * production or preview, and VERCEL_URL set), OR the copy was started with CAPREBATE_LOCAL_ZOOM=1, for when Lakhbir
 * really wants to try Zoom on his own computer. A test's recorded answers reach nobody, so they are never refused.
 *
 * WHAT IS SENT TO ZOOM: the time, the length and the words "Cap Rebate call". Never the client's name, email or number.
 * No key is ever printed, logged or put in a page; a join signature and a ZAK go only to the one person joining.
 */

import { createHmac } from 'node:crypto';
import type { AuditLog } from '../audit.ts';
import type { SecretStore } from '../secrets.ts';
import { callOutside, isLiveTransport, liveTransport, policyRefusal, type Transport } from './http.ts';
import { CALL_POLICIES, type CallPolicy } from './sources.ts';
import { onTestWebsite, type Env } from './place.ts';

export { onTestWebsite };

export const ZOOM_OAUTH = 'ZOOM_OAUTH';
export const ZOOM_API = 'ZOOM_API';
/** The Web SDK the join pages load, from Zoom's own address (checked on 30 Sep 2026: every file answers 200). */
export const ZOOM_SDK_VERSION = '6.5.0';
export const ZOOM_SDK_BASE = `https://source.zoom.us/${ZOOM_SDK_VERSION}`;
/** What Zoom's meeting is called. Deliberately nobody's name. */
export const MEETING_TOPIC = 'Cap Rebate call';

export type ZoomDeps = {
  readonly audit: AuditLog;
  readonly now: () => string;
  readonly transport: Transport;
  readonly secrets: SecretStore;
  /** Tests only: the two services' policy with some values changed (the transfer approved). */
  readonly policy_override?: Partial<CallPolicy>;
  /** Tests only: the settings asked whether this copy is the test website. Absent, the process's own. */
  readonly env?: Env;
};

/** Everything that stops a call to Zoom from these deps, in words. */
function blocked(d: ZoomDeps): string[] {
  return zoomMissing(d.secrets, d.policy_override, { outside: d.transport, ...(d.env === undefined ? {} : { env: d.env }) });
}

type Keys = { account: string; id: string; secret: string; sdkId: string; sdkSecret: string; host: string };

function keys(store: SecretStore): Keys | null {
  const s = store.forOwner('ZOOM');
  const v = (n: string): string => (s.get(n) ?? '').trim();
  const k = { account: v('ZOOM_ACCOUNT_ID'), id: v('ZOOM_CLIENT_ID'), secret: v('ZOOM_CLIENT_SECRET'), sdkId: v('ZOOM_SDK_CLIENT_ID'), sdkSecret: v('ZOOM_SDK_CLIENT_SECRET') };
  if (Object.values(k).some((x) => x === '')) return null;
  const host = v('ZOOM_HOST_EMAIL');
  return { ...k, host: host === '' ? 'me' : host };
}

function transferRefused(o?: Partial<CallPolicy>): string | null {
  for (const id of [ZOOM_OAUTH, ZOOM_API]) {
    const base = CALL_POLICIES[id];
    const r = policyRefusal(base === undefined ? undefined : { ...base, ...o });
    if (r !== null) return r;
  }
  return null;
}

/** 1 Oct 2026: the setting that lets a copy that is not the test website call Zoom. Off unless it is exactly "1". */
export const ZOOM_LOCAL_OPT_IN = 'CAPREBATE_LOCAL_ZOOM';

/**
 * 1 Oct 2026: why THIS copy may not call Zoom, in words, or null when it may. Only a live transport is ever refused:
 * a test's recorded answers reach nobody.
 */
export function zoomPlaceRefusal(outside: Transport, env: Env = process.env): string | null {
  if (!isLiveTransport(outside)) return null;
  if (onTestWebsite(env)) return null;
  if ((env[ZOOM_LOCAL_OPT_IN] ?? '').trim() === '1') return null;
  return `This copy is not the test website, so it does not call Zoom. A call from here would make a real meeting on our Zoom account. To try Zoom here on purpose, start it with ${ZOOM_LOCAL_OPT_IN}=1.`;
}

/** Where the app runs, for `zoomMissing`: how it reaches outside, and its settings (the process's, unless a test gives some). */
export type ZoomWhere = { readonly outside: Transport; readonly env?: Env };

/**
 * What must be true before a meeting is made, in words. Empty means Zoom is on. Names only, never a value. With
 * `where` (every caller in src/ passes it; a test asks for the keys and the transfer alone), whether this copy may
 * call Zoom at all is said too.
 */
export function zoomMissing(store: SecretStore, o?: Partial<CallPolicy>, where?: ZoomWhere): string[] {
  const out: string[] = [];
  const s = store.forOwner('ZOOM');
  const absent = ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET', 'ZOOM_SDK_CLIENT_ID', 'ZOOM_SDK_CLIENT_SECRET']
    .filter((n) => (s.get(n) ?? '').trim() === '');
  if (absent.length > 0) out.push(`Put the Zoom keys in the key file: ${absent.join(', ')}.`);
  if (transferRefused(o) !== null) out.push('Zoom is a US company: the data protection officer approves the transfer (sources.ts, ZOOM_OAUTH and ZOOM_API).');
  const place = where === undefined ? null : zoomPlaceRefusal(where.outside, where.env);
  if (place !== null) out.push(place);
  return out;
}

/* The access token, kept for its hour less a minute, per client id. Never written anywhere. */
const tokens = new Map<string, { token: string; until: number }>();
/** Tests only. */
export function forgetZoomToken(): void { tokens.clear(); }

const gate = { free_gate_open: false, engagement_signed: false, switched_on: true } as const;

async function token(d: ZoomDeps, k: Keys): Promise<string | null> {
  const held = tokens.get(k.id);
  const nowMs = Date.parse(d.now());
  if (held !== undefined && held.until > nowMs) return held.token;
  const r = await callOutside(
    { audit: d.audit, now: d.now, transport: d.transport, ...(d.policy_override === undefined ? {} : { policy_override: d.policy_override }) },
    { service_id: ZOOM_OAUTH, endpoint: '/oauth/token', method: 'POST',
      query: { grant_type: 'account_credentials', account_id: k.account },
      headers: { authorization: 'Basic ' + Buffer.from(`${k.id}:${k.secret}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
      body: '', actor_id: null, actor_role: null, claim_id: null, gate },
  );
  if (r.outcome !== 'OK' || r.body === null) return null;
  try {
    const j = JSON.parse(r.body) as { access_token?: unknown; expires_in?: unknown };
    if (typeof j.access_token !== 'string' || j.access_token === '') return null;
    const secs = typeof j.expires_in === 'number' && j.expires_in > 120 ? j.expires_in : 3600;
    tokens.set(k.id, { token: j.access_token, until: nowMs + (secs - 60) * 1000 });
    return j.access_token;
  } catch { return null; }
}

async function api(d: ZoomDeps, k: Keys, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', endpoint: string, params: Record<string, string>, body?: object, query?: Record<string, string>) {
  const t = await token(d, k);
  if (t === null) return null;
  return callOutside(
    { audit: d.audit, now: d.now, transport: d.transport, ...(d.policy_override === undefined ? {} : { policy_override: d.policy_override }) },
    { service_id: ZOOM_API, endpoint, params, method, ...(query === undefined ? {} : { query }),
      headers: { authorization: `Bearer ${t}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      actor_id: null, actor_role: null, claim_id: null, gate },
  );
}

export type MadeMeeting =
  | { readonly state: 'MADE'; readonly meeting_id: string; readonly join_url: string; readonly passcode: string | null }
  | { readonly state: 'NOT_MADE'; readonly why: string };

/** Zoom's start_time in UTC, to the second: "2026-10-02T09:00:00Z". */
function zoomTime(iso: string): string { return new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z'); }

/** Make the meeting for one call. At most one token call and one meeting call; never throws. */
/** 2 Oct 2026: `record` — a survey walkthrough call (src/web/survey-evidence.ts) is recorded to Zoom's cloud. */
export async function makeZoomMeeting(d: ZoomDeps, startsAt: string, minutes: number, opts: { readonly record?: boolean } = {}): Promise<MadeMeeting> {
  const missing = blocked(d);
  if (missing.length > 0) return { state: 'NOT_MADE', why: missing.join(' ') };
  const k = keys(d.secrets)!;
  const r = await api(d, k, 'POST', '/v2/users/{user}/meetings', { user: k.host }, {
    topic: MEETING_TOPIC, type: 2, start_time: zoomTime(startsAt), duration: minutes, timezone: 'Europe/London',
    settings: { join_before_host: false, waiting_room: true, mute_upon_entry: false, host_video: true, participant_video: true, approval_type: 2, auto_recording: opts.record === true ? 'cloud' : 'none' },
  });
  if (r === null) return { state: 'NOT_MADE', why: 'Zoom did not give us a token: check the Server-to-Server app’s keys and that it is activated.' };
  if (r.outcome !== 'OK' || r.body === null) return { state: 'NOT_MADE', why: `Zoom did not make the meeting (${r.why}).` };
  try {
    const j = JSON.parse(r.body) as { id?: unknown; join_url?: unknown; password?: unknown };
    const id = typeof j.id === 'number' ? String(j.id) : typeof j.id === 'string' ? j.id : '';
    const url = typeof j.join_url === 'string' ? j.join_url : '';
    if (!/^\d{9,12}$/.test(id) || !/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//.test(url)) return { state: 'NOT_MADE', why: 'Zoom’s answer did not carry a meeting we could read.' };
    return { state: 'MADE', meeting_id: id, join_url: url, passcode: typeof j.password === 'string' && j.password !== '' ? j.password : null };
  } catch { return { state: 'NOT_MADE', why: 'Zoom’s answer did not carry a meeting we could read.' }; }
}

export type Recording = { readonly state: 'FOUND'; readonly share_url: string; readonly passcode: string | null; readonly minutes: number; readonly recorded_at: string }
  | { readonly state: 'NOT_YET' | 'NOT_FOUND'; readonly why: string };

/**
 * 2 Oct 2026: a walkthrough call's cloud recording, as Zoom describes it (GET /v2/meetings/{meetingId}/recordings,
 * developers.zoom.us, read 2 Oct 2026). Only its sharing link, passcode, length and start are read; the video stays
 * with Zoom. Needs the Server-to-Server app's recording scope, and cloud recording on our Zoom plan.
 */
export async function zoomRecording(d: ZoomDeps, meetingId: string): Promise<Recording> {
  const missing = blocked(d);
  if (missing.length > 0) return { state: 'NOT_FOUND', why: missing.join(' ') };
  if (!/^\d{9,12}$/.test(meetingId)) return { state: 'NOT_FOUND', why: 'That is not a Zoom meeting.' };
  const r = await api(d, keys(d.secrets)!, 'GET', '/v2/meetings/{meeting}/recordings', { meeting: meetingId });
  if (r === null) return { state: 'NOT_FOUND', why: 'Zoom did not give us a token: check the Server-to-Server app’s keys and that it is activated.' };
  if (r.status === 404) return { state: 'NOT_YET', why: 'Zoom has no recording of this call yet. It can take a while after the call ends.' };
  if (r.outcome !== 'OK' || r.body === null) return { state: 'NOT_FOUND', why: `Zoom did not answer (${r.why}). Check the app has the recording scope, and that cloud recording is on.` };
  try {
    const j = JSON.parse(r.body) as { share_url?: unknown; password?: unknown; duration?: unknown; start_time?: unknown };
    const url = typeof j.share_url === 'string' ? j.share_url : '';
    if (!/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//.test(url)) return { state: 'NOT_YET', why: 'Zoom’s answer did not carry a recording we could read.' };
    const minutes = typeof j.duration === 'number' && Number.isFinite(j.duration) ? Math.max(0, Math.min(600, Math.round(j.duration))) : 0;
    const at = typeof j.start_time === 'string' && !Number.isNaN(Date.parse(j.start_time)) ? new Date(j.start_time).toISOString() : '';
    if (at === '') return { state: 'NOT_YET', why: 'Zoom’s answer did not say when it was recorded.' };
    return { state: 'FOUND', share_url: url, passcode: typeof j.password === 'string' && j.password !== '' ? j.password.slice(0, 64) : null, minutes, recorded_at: at };
  } catch { return { state: 'NOT_YET', why: 'Zoom’s answer did not carry a recording we could read.' }; }
}

/** Move a meeting to a new time. True when Zoom took it. */
export async function moveZoomMeeting(d: ZoomDeps, meetingId: string, startsAt: string, minutes: number): Promise<boolean> {
  if (blocked(d).length > 0) return false;
  const r = await api(d, keys(d.secrets)!, 'PATCH', '/v2/meetings/{meeting}', { meeting: meetingId }, { start_time: zoomTime(startsAt), duration: minutes, timezone: 'Europe/London' });
  return r !== null && r.outcome === 'OK';
}

/** Delete a cancelled call's meeting. True when Zoom took it (or it was already gone). */
export async function cancelZoomMeeting(d: ZoomDeps, meetingId: string): Promise<boolean> {
  if (blocked(d).length > 0) return false;
  const r = await api(d, keys(d.secrets)!, 'DELETE', '/v2/meetings/{meeting}', { meeting: meetingId });
  return r !== null && (r.outcome === 'OK' || r.status === 404);
}

/** The host's start token (ZAK), so a member of staff starts the call as its host inside our page. Null if refused. */
export async function hostZak(d: ZoomDeps): Promise<string | null> {
  if (blocked(d).length > 0) return null;
  const k = keys(d.secrets)!;
  const r = await api(d, k, 'GET', '/v2/users/{user}/token', { user: k.host }, undefined, { type: 'zak' });
  if (r === null || r.outcome !== 'OK' || r.body === null) return null;
  try { const j = JSON.parse(r.body) as { token?: unknown }; return typeof j.token === 'string' && j.token !== '' ? j.token : null; } catch { return null; }
}

const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

/**
 * The Meeting SDK's join signature (developers.zoom.us/docs/meeting-sdk/auth, read 30 Sep 2026): a JWT, HMAC-SHA256
 * with the SDK app's secret, carrying appKey, mn, role (0 a participant, 1 the host), iat, exp and tokenExp. It lasts
 * two hours (Zoom's floor is 30 minutes, its ceiling 48 hours). WebRTC video is asked for, so the page needs no
 * cross-origin isolation.
 */
export function joinSignature(store: SecretStore, meetingId: string, role: 0 | 1, nowIso: string): { sdk_key: string; signature: string } | null {
  const k = keys(store);
  if (k === null || !/^\d{9,12}$/.test(meetingId)) return null;
  const iat = Math.floor(Date.parse(nowIso) / 1000) - 30;
  const exp = iat + 2 * 60 * 60;
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ appKey: k.sdkId, sdkKey: k.sdkId, mn: meetingId, role, iat, exp, tokenExp: exp, video_webrtc_mode: 1 }));
  const sig = createHmac('sha256', k.sdkSecret).update(`${head}.${body}`).digest('base64url');
  return { sdk_key: k.sdkId, signature: `${head}.${body}.${sig}` };
}

/** For the start-up log: whether video calls get a meeting, and if not why. Names only. */
export function zoomWhy(store: SecretStore, outside: Transport = liveTransport, env: Env = process.env): string {
  const m = zoomMissing(store, undefined, { outside, env });
  return m.length === 0 ? 'video calls get a Zoom meeting, sent to the client and joined inside the site'
    : `video calls get no Zoom meeting yet, so the team sends a link: ${m.join(' ')}`;
}
