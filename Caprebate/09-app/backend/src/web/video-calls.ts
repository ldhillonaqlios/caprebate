/**
 * VIDEO CALLS: THE MEETING, THE LINK, AND THE TWO JOIN PAGES. 30 September 2026.
 *
 * Lakhbir: "with the video call link this should be sent automatically, and i feel zoom would be best for this as we
 * can run it via our platform, is there a way to have zoom embeded on our back end so its done though there?"
 *
 * WHEN A VIDEO CALL CHANGES, ITS MEETING FOLLOWS (`reconcileVideoMeeting`, called after every write that changes a
 * call: the funnel's close, the staff calendar, the client's portal). Given a time and no meeting: Zoom makes one. Moved:
 * Zoom moves it, and the link stays the same. Cancelled, or its time given back: Zoom deletes it and the row is closed.
 *
 * THE LINK GOES OUT WITH THE INVITATION. The email and its calendar file carry OUR join page (/call/<token>), where
 * the client joins inside our site, and Zoom's own link and passcode for anyone who would rather use the Zoom app.
 * Emails leave when email sending is switched on (EMAIL_SENDING); until then they wait in the outbox, like every other.
 *
 * STAFF JOIN FROM THE BACK OFFICE (/staff/calls/<booking>/video) as the host; the client joins at /call/<token> as a
 * participant, into the waiting room. Both pages run Zoom's Web SDK (component view) from source.zoom.us, under a
 * security policy of their own that allows exactly that and nothing else from outside (VIDEO_PAGE_HEADERS). Our script
 * (/assets/video-call.js) joins only when the person presses "Join", so no camera is asked for on arrival.
 *
 * WITHOUT ZOOM (no keys yet, or the transfer not approved) nothing here makes a meeting; the call still stands, the
 * email says the link will follow, and the back office says to send one — exactly as before.
 *
 * PHASE 156d, 5 October 2026 — THE FREE ZOOM PLAN AND ONE SHARED HOST (Lakhbir: "yes change 156d so i dont pay";
 * "contact@caprebate is enough"). Three things follow, all here:
 *   · THE 40 MINUTES, SAID PLAINLY (`zoomPlanLine`): where staff book a video call, on the call's pages, and in the
 *     invitation (`videoJoinWords`). Gone once ZOOM_PLAN says a paid plan.
 *   · ONE CALL AT A TIME (`videoCallsAtSameTime`, `SAME_TIME_WORDS`): one Zoom user hosts one meeting at a time, so a
 *     video call booked over another with the same host is warned about wherever it is booked or moved. A warning,
 *     never a refusal.
 *   · HOW LONG IT LASTED (`checkCallLength`): a member of staff asks Zoom after the call; two numbers are kept
 *     (migration 091), or the screen says our plan does not give them.
 */

import { randomBytes } from 'node:crypto';
import type { App } from '../app.ts';
import type { Db } from '../db.ts';
import { BOOKING } from './engine.ts';
import { SLOT_MINUTES } from './schedule.ts';
import { localWhen } from './localtime.ts';
import { h, type Safe } from './html.ts';
import { cancelZoomMeeting, makeZoomMeeting, moveZoomMeeting, zoomMissing, zoomPastCall, zoomPlanIsFree, FREE_PLAN_LINE, NOT_ON_PLAN_WORDS, ZOOM_SDK_BASE, type MadeMeeting, type PastCall, type ZoomDeps } from '../connectors/zoom.ts';

/** A call that holds a moment: a telephone call (CB_BOOKING) or, since 30 Sep 2026, a video call. */
export function booksATime(channel: string): boolean {
  return BOOKING.booksASlot(channel) || channel === 'video';
}

export type Meeting = {
  readonly id: string; readonly booking_id: string; readonly meeting_id: string; readonly join_url: string;
  readonly passcode: string | null; readonly client_token: string; readonly created_at: string;
  /** PHASE 153f (migration 084): whose Zoom user the meeting was made under; null, the shared host. */
  readonly host_user_id: string | null;
};

export function activeMeeting(db: Db, booking_id: string): Meeting | undefined {
  return db.get<Meeting>(
    'SELECT id, booking_id, meeting_id, join_url, passcode, client_token, created_at, host_user_id FROM video_meetings WHERE booking_id = ? AND cancelled_at IS NULL',
    [booking_id]);
}

/**
 * PHASE 153f, 4 October 2026 — WHO HOSTS A CALL. One Zoom user hosts one meeting at a time (learned on the first live
 * calls, 30 Sep 2026), so each call is made under the member of staff it is assigned to: their sign-in email, which must
 * be a user on our Zoom account. A call with nobody assigned, or assigned to someone disabled, uses the shared host.
 */
export function callHost(db: Db, booking_id: string): { readonly user_id: string; readonly email: string; readonly name: string } | null {
  const u = db.get<{ id: string; email: string; display_name: string }>(
    `SELECT u.id, u.email, u.display_name FROM bookings b JOIN users u ON u.id = b.assigned_to
      WHERE b.id = ? AND u.disabled_at IS NULL AND u.role <> 'CLIENT'`, [booking_id]);
  return u === undefined ? null : { user_id: u.id, email: u.email, name: u.display_name };
}

/** PHASE 153f: the meeting's host, for the start token and the call's page. Null, the shared host. */
export function meetingHost(db: Db, m: Meeting): { readonly email: string; readonly name: string } | null {
  if (m.host_user_id === null) return null;
  const u = db.get<{ email: string; display_name: string }>('SELECT email, display_name FROM users WHERE id = ?', [m.host_user_id]);
  return u === undefined ? null : { email: u.email, name: u.display_name };
}

export function zoomDeps(app: App): ZoomDeps {
  return { audit: app.audit, now: app.now, transport: app.outside, secrets: app.secrets,
    ...(app.zoomPolicy === undefined ? {} : { policy_override: app.zoomPolicy }) };
}

/**
 * 1 Oct 2026: everything that stops THIS app calling Zoom, in words: the keys, the transfer, and whether this copy is
 * the test website (or was started with CAPREBATE_LOCAL_ZOOM=1). Empty means Zoom is on. Every screen asks this.
 */
export function zoomBlockers(app: App): string[] {
  return zoomMissing(app.secrets, app.zoomPolicy, { outside: app.outside });
}

/** PHASE 156d: the free plan's 40-minute line, or null on a paid plan. */
export function zoomPlanLine(app: App): string | null {
  return zoomPlanIsFree(app.secrets) ? FREE_PLAN_LINE : null;
}

/** PHASE 156d: said wherever a video call is booked or moved over another with the same Zoom host. */
export const SAME_TIME_WORDS = 'Another video call is booked at this time. Only one can run at once on our Zoom account.';

/**
 * PHASE 156d: how many OTHER live video calls overlap this one and would run under the same Zoom user. A call's host is
 * its meeting's (host_user_id; null is the shared host); a call with no meeting yet counts as the shared host, which is
 * where it would go. Two calls under different members of staff's own Zoom users do not clash.
 */
export function videoCallsAtSameTime(db: Db, booking_id: string): number {
  const b = db.get<{ starts_at: string | null; ends_at: string | null; channel: string; cancelled_at: string | null }>(
    'SELECT starts_at, ends_at, channel, cancelled_at FROM bookings WHERE id = ?', [booking_id]);
  if (b === undefined || b.channel !== 'video' || b.cancelled_at !== null || b.starts_at === null || b.ends_at === null) return 0;
  const host = activeMeeting(db, booking_id)?.host_user_id ?? '';
  return db.get<{ n: number }>(
    `SELECT count(*) AS n FROM bookings o
      WHERE o.id <> ? AND o.channel = 'video' AND o.cancelled_at IS NULL AND o.starts_at IS NOT NULL AND o.ends_at IS NOT NULL
        AND o.starts_at < ? AND o.ends_at > ?
        AND coalesce((SELECT m.host_user_id FROM video_meetings m WHERE m.booking_id = o.id AND m.cancelled_at IS NULL), '') = ?`,
    [booking_id, b.ends_at, b.starts_at, host])?.n ?? 0;
}

/** PHASE 156d: what is kept of a call's length (migration 091). */
export type CallLength = { readonly call_minutes: number | null; readonly call_people: number | null; readonly call_check_state: string | null; readonly call_checked_at: string | null };

export function callLengthOf(db: Db, booking_id: string): CallLength | undefined {
  return db.get<CallLength>('SELECT call_minutes, call_people, call_check_state, call_checked_at FROM video_meetings WHERE booking_id = ? AND cancelled_at IS NULL', [booking_id]);
}

/** PHASE 156d: a call's length in words, or null when nothing has been learned yet. */
export function callLengthWords(c: CallLength | undefined): string | null {
  if (c === undefined) return null;
  if (c.call_check_state === 'NOT_ON_PLAN') return NOT_ON_PLAN_WORDS;
  if (c.call_minutes === null) return null;
  const mins = `${String(c.call_minutes)} minute${c.call_minutes === 1 ? '' : 's'}`;
  return c.call_people === null ? `Lasted ${mins}.` : `Lasted ${mins}. ${String(c.call_people)} ${c.call_people === 1 ? 'person' : 'people'} joined.`;
}

/**
 * PHASE 156d: ask Zoom how long the call lasted and how many joined, and keep the two numbers. A later answer that is
 * not FOUND keeps any numbers already kept. Never throws; one or two calls to Zoom.
 */
export async function checkCallLength(app: App, actor: { id: string; role: string }, booking_id: string): Promise<PastCall> {
  const m = activeMeeting(app.db, booking_id);
  if (m === undefined) return { state: 'NOT_FOUND', why: 'This call has no Zoom meeting, so Zoom has nothing to say about it.' };
  const r: PastCall = await zoomPastCall(zoomDeps(app), m.meeting_id).catch((): PastCall => ({ state: 'NOT_FOUND', why: 'Zoom could not be reached.' }));
  const now = app.now();
  if (r.state === 'FOUND') {
    app.db.run('UPDATE video_meetings SET call_minutes = ?, call_people = ?, call_check_state = ?, call_checked_at = ? WHERE id = ?', [r.minutes, r.people, 'FOUND', now, m.id]);
  } else {
    app.db.run("UPDATE video_meetings SET call_check_state = CASE WHEN call_minutes IS NULL THEN ? ELSE 'FOUND' END, call_checked_at = ? WHERE id = ?", [r.state, now, m.id]);
  }
  app.audit.append({ at: now, kind: 'VIDEO_CALL_LENGTH_CHECKED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'booking', object_id: booking_id, detail: { state: r.state } });
  return r;
}

export type Reconciled = 'MADE' | 'MOVED' | 'CANCELLED' | 'NONE' | { readonly not_made: string };

/** Bring the call's Zoom meeting into line with the call. Never throws; at most two calls to Zoom. */
export async function reconcileVideoMeeting(app: App, booking_id: string): Promise<Reconciled> {
  const b = app.db.get<{ channel: string; starts_at: string | null; cancelled_at: string | null }>(
    'SELECT channel, starts_at, cancelled_at FROM bookings WHERE id = ?', [booking_id]);
  if (b === undefined || b.channel !== 'video') return 'NONE';
  const m = activeMeeting(app.db, booking_id);
  const zd = zoomDeps(app);
  if (b.cancelled_at !== null || b.starts_at === null) {
    if (m === undefined) return 'NONE';
    // Closed here whatever Zoom says: a link to a call that is not happening is never offered again.
    try { await cancelZoomMeeting(zd, m.meeting_id); } catch { /* the row still closes */ }
    app.db.run('UPDATE video_meetings SET cancelled_at = ? WHERE id = ?', [app.now(), m.id]);
    return 'CANCELLED';
  }
  if (m !== undefined) {
    const ok = await moveZoomMeeting(zd, m.meeting_id, b.starts_at, SLOT_MINUTES).catch(() => false);
    return ok ? 'MOVED' : { not_made: 'Zoom did not take the new time. The link still works; the host starts the call at the new time.' };
  }
  // 2 Oct 2026: a survey walkthrough call (src/web/survey-evidence.ts) is recorded, so the surveyor can watch it.
  const record = app.db.get('SELECT 1 AS x FROM survey_walkthroughs WHERE booking_id = ?', [booking_id]) !== undefined;
  // PHASE 153f: made under the assigned member of staff, so two calls at once can both run; if they have no Zoom user
  // on our account, under the shared host instead, and the audit line says so.
  const host = callHost(app.db, booking_id);
  const unreachable: MadeMeeting = { state: 'NOT_MADE', why: 'Zoom could not be reached.' };
  let made: MadeMeeting = await makeZoomMeeting(zd, b.starts_at, SLOT_MINUTES, { record, ...(host === null ? {} : { host: host.email }) }).catch(() => unreachable);
  let hostId: string | null = host === null ? null : host.user_id;
  if (made.state !== 'MADE' && made.host_unknown === true) {
    app.audit.append({ at: app.now(), kind: 'VIDEO_CALL_SHARED_HOST', outcome: 'ALLOWED', actor_id: null, actor_role: null,
      object_type: 'booking', object_id: booking_id, detail: { why: 'NO_ZOOM_USER' } });
    made = await makeZoomMeeting(zd, b.starts_at, SLOT_MINUTES, { record }).catch(() => unreachable);
    hostId = null;
  }
  if (made.state !== 'MADE') return { not_made: made.why };
  app.db.run(
    'INSERT INTO video_meetings (id, booking_id, provider, meeting_id, join_url, passcode, client_token, created_at, host_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [randomBytes(16).toString('hex'), booking_id, 'zoom', made.meeting_id, made.join_url, made.passcode, randomBytes(32).toString('hex'), app.now(), hostId]);
  return 'MADE';
}

/** Our join page for the client. */
export function clientJoinUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/call/${token}`;
}

/**
 * The words about joining, for an email and a calendar file. Null for a call that is not a video call.
 * With a meeting: our page, then Zoom's link and passcode. Without: that the link will follow.
 */
export function videoJoinWords(db: Db, booking_id: string, origin: string, freePlan = false): { location: string; lines: string } | null {
  const b = db.get<{ channel: string }>('SELECT channel FROM bookings WHERE id = ?', [booking_id]);
  if (b === undefined || b.channel !== 'video') return null;
  const m = activeMeeting(db, booking_id);
  if (m === undefined) {
    return { location: 'Video call. We will email you the link.', lines: 'We will email you the link for the video call before it starts.' };
  }
  const ours = clientJoinUrl(origin, m.client_token);
  return {
    location: ours,
    lines: [
      `Join the video call in your web browser: ${ours}`,
      `Or open it in the Zoom app: ${m.join_url}`,
      `Meeting ID: ${m.meeting_id.replace(/(\d{3})(\d{3,4})(\d{4})$/, '$1 $2 $3')}${m.passcode === null ? '' : `, passcode: ${m.passcode}`}`,
      'You will wait in a waiting room until we let you in.',
      // PHASE 156d: the free plan's limit, said in the invitation too.
      ...(freePlan ? [FREE_PLAN_LINE] : []),
    ].join('\n'),
  };
}

/* ------------------------------------------------------------------ the two join pages */

/**
 * The security policy of the two join pages, and only those. Zoom's Web SDK loads its scripts, workers, styles and
 * fonts from source.zoom.us and talks to *.zoom.us; React inside it sets inline styles; its media code is WebAssembly.
 * Everything else stays as strict as every other page: no inline script, no other origin, no framing of the page.
 */
export const VIDEO_PAGE_CSP =
  "default-src 'none'; " +
  // blob: — the first real call (30 Sep 2026) showed Zoom's SDK loads part of its video screen as a blob: script;
  // refused, the call started but its picture did not (ChunkLoadError). Still no inline script and no other origin.
  "script-src 'self' blob: https://source.zoom.us 'wasm-unsafe-eval' 'unsafe-eval'; " +
  "style-src 'self' 'unsafe-inline' https://source.zoom.us; " +
  "img-src 'self' data: blob: https://*.zoom.us; " +
  "media-src 'self' blob: https://*.zoom.us; " +
  "font-src 'self' data: https://source.zoom.us; " +
  "connect-src 'self' https://zoom.us https://*.zoom.us wss://*.zoom.us; " +
  "worker-src 'self' blob: https://source.zoom.us; " +
  "frame-src https://*.zoom.us; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export const VIDEO_PAGE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': VIDEO_PAGE_CSP,
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'camera=(self), microphone=(self), display-capture=(self)',
});

/** Zoom's own files, in the order its component view needs them (developers.zoom.us, read 30 Sep 2026). */
export const ZOOM_SCRIPTS: readonly string[] = Object.freeze([
  `${ZOOM_SDK_BASE}/lib/vendor/react.min.js`, `${ZOOM_SDK_BASE}/lib/vendor/react-dom.min.js`,
  `${ZOOM_SDK_BASE}/lib/vendor/redux.min.js`, `${ZOOM_SDK_BASE}/lib/vendor/redux-thunk.min.js`,
  `${ZOOM_SDK_BASE}/lib/vendor/lodash.min.js`, `${ZOOM_SDK_BASE}/zoom-meeting-embedded-${ZOOM_SDK_BASE.split('/').pop()}.min.js`,
]);

export type JoinData = {
  readonly meeting_id: string; readonly passcode: string | null; readonly signature: string; readonly sdk_key: string;
  readonly user_name: string; readonly zak: string | null;
};

/** The meeting area: the "Join" button and where Zoom draws. The values are data attributes; no script is inline. */
export function joinPanel(j: JoinData, who: 'host' | 'client'): Safe {
  return h`<div class="vc-panel">
      <div id="vc-root" class="vc-root" data-meeting="${j.meeting_id}" data-passcode="${j.passcode ?? ''}" data-signature="${j.signature}"
        data-sdk-key="${j.sdk_key}" data-name="${j.user_name}" data-zak="${j.zak ?? ''}" data-role="${who}"></div>
      <p><button type="button" class="cta" id="vc-join">${who === 'host' ? 'Start the call' : 'Join the call'}</button></p>
      <p class="help" id="vc-status" role="status">${who === 'host' ? 'Your camera and microphone are asked for when you press the button.' : 'Your camera and microphone are asked for when you press the button. You will wait in the waiting room until we let you in.'}</p>
    </div>`;
}

/** The scripts at the foot of a join page: Zoom's, then ours. */
export function joinScripts(): Safe {
  return h`${ZOOM_SCRIPTS.map((src) => h`<script src="${src}" crossorigin="anonymous"></script>`)}<script src="/assets/video-call.js"></script>`;
}

/** A join page: the ordinary page (so staff keep the back office's header), with Zoom's scripts and ours at the foot. */
export function withJoinScripts(pageHtml: string): string {
  const i = pageHtml.lastIndexOf('</body>');
  return i < 0 ? pageHtml : pageHtml.slice(0, i) + joinScripts().html + pageHtml.slice(i);
}

/** When the client's page opens the call: from half an hour before until the hour after it ends. */
export function clientMayJoin(startsAt: string, endsAt: string, nowIso: string): 'early' | 'open' | 'over' {
  const now = Date.parse(nowIso);
  if (now < Date.parse(startsAt) - 30 * 60_000) return 'early';
  if (now > Date.parse(endsAt) + 60 * 60_000) return 'over';
  return 'open';
}

export function whenWords(startsAt: string): string { return localWhen(startsAt); }
