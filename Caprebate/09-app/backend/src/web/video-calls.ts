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
 */

import { randomBytes } from 'node:crypto';
import type { App } from '../app.ts';
import type { Db } from '../db.ts';
import { BOOKING } from './engine.ts';
import { SLOT_MINUTES } from './schedule.ts';
import { localWhen } from './localtime.ts';
import { h, type Safe } from './html.ts';
import { cancelZoomMeeting, makeZoomMeeting, moveZoomMeeting, ZOOM_SDK_BASE, type ZoomDeps } from '../connectors/zoom.ts';

/** A call that holds a moment: a telephone call (CB_BOOKING) or, since 30 Sep 2026, a video call. */
export function booksATime(channel: string): boolean {
  return BOOKING.booksASlot(channel) || channel === 'video';
}

export type Meeting = {
  readonly id: string; readonly booking_id: string; readonly meeting_id: string; readonly join_url: string;
  readonly passcode: string | null; readonly client_token: string; readonly created_at: string;
};

export function activeMeeting(db: Db, booking_id: string): Meeting | undefined {
  return db.get<Meeting>(
    'SELECT id, booking_id, meeting_id, join_url, passcode, client_token, created_at FROM video_meetings WHERE booking_id = ? AND cancelled_at IS NULL',
    [booking_id]);
}

export function zoomDeps(app: App): ZoomDeps {
  return { audit: app.audit, now: app.now, transport: app.outside, secrets: app.secrets,
    ...(app.zoomPolicy === undefined ? {} : { policy_override: app.zoomPolicy }) };
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
  const made = await makeZoomMeeting(zd, b.starts_at, SLOT_MINUTES).catch(() => ({ state: 'NOT_MADE' as const, why: 'Zoom could not be reached.' }));
  if (made.state !== 'MADE') return { not_made: made.why };
  app.db.run(
    'INSERT INTO video_meetings (id, booking_id, provider, meeting_id, join_url, passcode, client_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [randomBytes(16).toString('hex'), booking_id, 'zoom', made.meeting_id, made.join_url, made.passcode, randomBytes(32).toString('hex'), app.now()]);
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
export function videoJoinWords(db: Db, booking_id: string, origin: string): { location: string; lines: string } | null {
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
