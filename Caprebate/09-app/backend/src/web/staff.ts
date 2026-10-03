/**
 * THE BACK OFFICE'S ROUTES AND PAGES — settings, filled assessments, the
 * calendar. Block D of the Developer Build Order.
 *
 * IN ITS OWN FILE RATHER THAN IN router.ts, which is already 850 lines and
 * carries the public half. `handleStaff` has the same shape as `portalRoutes`:
 * it returns 'not-mine' for anything it does not own, so nothing is shadowed by
 * accident and the mounting in router.ts is one line.
 *
 * THE THREE RULES FROM router.ts APPLY HERE UNCHANGED and are not restated:
 * authorise on the object on every request, no route maps a path onto the
 * filesystem, and every response is built with the `h` tagged template. The
 * third has one apparent exception — the profile photo, which is bytes rather
 * than markup — and it is the reason `assertNoStaticFileRoute` now reads EVERY
 * file in src/web/ instead of only the router: a rule that was checked in one
 * file stopped being a rule the moment a second file could serve.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT IS STUBBED HERE, AND IT SAYS SO ON SCREEN
 *
 * Outbound email and calendar invitations. Both write to the `outbox` table
 * from Phase 103 and neither leaves the building. The settings page shows the
 * outbox so that "not sent" is something a person can look at rather than a
 * claim in a footer.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import * as SI from './sign-in.ts';
import type { App } from '../app.ts';
import { type Actor } from '../authz.ts';
import { changeOwnPassword, SESSION_COOKIE_NAME, AuthError } from '../auth.ts';
import { APP_ROLES } from '../roles.ts';
import { handleRoleEditor, madeRoleChoices } from './role-editor-pages.ts';
import { handleBilling } from './billing.ts';
import { customRoleOf } from '../custom-roles.ts';
import { findById, hashToken } from '../users.ts';
import type { FsObjectStore } from './objectstore.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { staffShell, portalShell, opens, navContext, filterBar, LEAD_FILTERS, setSubMenu } from './navigation.ts';
import { kpiRow, lateBadge, nobodyBadge } from './look.ts';
import { settingsBody, settingsTiles } from './admin-tiles.ts';
import { homeRows } from './home.ts';
import { dashboard, dashView } from './staff-dashboard.ts';
import { addBlock, removeBlock } from './time-blocks.ts';
import { saveKey } from './saved-keys.ts';
import { mayReadQueue, readRepliesIfDue } from './inbound-email.ts';
import { refillForm, typedValues } from './refill.ts';
import { welcomeCard, why } from './components.ts';
import { welcomeShown, dismissWelcome, WELCOME_JOBS } from './welcome.ts';
import { keepSectionChoice } from './sections.ts';
import { staffHelp } from './help.ts';
import * as S from './settings.ts';
import * as B from './backoffice.ts';
import { handleEngaged } from './engaged-pages.ts';
import { handleClientPage } from './client-page.ts';
import { handleClientFiles } from './client-files-pages.ts';
import { handleFreeEmail } from './free-email-pages.ts';
import { handleStaffMessages } from './messages-pages.ts';
import { handleSurveyor } from './surveyor-pages.ts';
import { handleSurveyPack } from './survey-pack-pages.ts';
import { handleReportStaff } from './report-pages.ts';
import { handleStaffEvidence } from './evidence-pages.ts';
import { handleFinance } from './finance-pages.ts';
import { handleCrm } from './crm-pages.ts';
import { handlePipeline } from './pipeline-pages.ts';
import { handleTasks } from './tasks-pages.ts';
import { handleDocuments } from './documents-pages.ts';
import { handleIntroducers } from './introducers-pages.ts';
import { handleClaimRecord } from './claim-record-pages.ts';
import { handleCompliance } from './compliance-pages.ts';
import { handleDashboard } from './dashboard-pages.ts';
import { handleLists } from './lists-pages.ts';
import { handleConfiguration } from './configuration-pages.ts';
import { setPhoto, clearPhoto, readPhoto, photoFor, PHOTO_HEADERS, IMAGE_LIMITS } from './avatar.ts';
import {
  HORIZON_DAYS, SLOT_MINUTES, WEEKDAY_NAMES, addLocalDays, clockToMinutes, distinctMoments,
  startOfLocalDay, staffSlots, type Availability, type WorkingTimeInput,
} from './schedule.ts';
import {
  localClock, localDate, localPartsOf, localStamp, localWhen, zoneNotice,
} from './localtime.ts';
import { singleFile } from './multipart.ts';
import { RANGE_QUALIFIER } from './shown-range.ts';
import { AUDIT_OUTCOMES, AUDIT_PAGE_SIZE, auditLogView, type AuditLogView } from './audit-log.ts';
import { activeMeeting, clientJoinUrl, joinPanel, reconcileVideoMeeting, withJoinScripts, zoomBlockers, zoomDeps, VIDEO_PAGE_HEADERS } from './video-calls.ts';
import { sendVideoInvite } from './booking-invite.ts';
import { hostZak, joinSignature } from '../connectors/zoom.ts';

export type StaffDeps = {
  app: App;
  store: FsObjectStore;
  newId: () => string;
  /** 30 Sep 2026: the site's address, for a video call's join page in its invitation. */
  publicOrigin?: string;
};

export type WebResult = 'handled' | 'not-mine';

/* ------------------------------------------------------------------ *
 * plumbing — the same four helpers router.ts uses, imported rather than
 * re-invented where they are exported, and duplicated where they are not.
 * ------------------------------------------------------------------ */

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

/** A day, as a date input wants it — the LOCAL calendar date. */
function isoDate(iso: string): string {
  return localDate(iso);
}

/**
 * "2026-09-08" from a query string, or today. Never throws on rubbish.
 *
 * A DATE IN A QUERY STRING IS A LOCAL DAY. The person who clicked "next" meant
 * the next day on their own calendar, so it is resolved to the instant that
 * local day begins — not to 00:00Z, which in summer is one o'clock in the
 * morning and puts the first hour of the day in yesterday's column.
 */
function askedDate(raw0: string | null, now: string): string {
  if (raw0 !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw0)) {
    const t = Date.parse(`${raw0}T12:00:00.000Z`);
    // Midday, then back to the start of that local day: midday is inside the
    // right local date in every zone on earth, whereas midnight is not.
    if (Number.isFinite(t)) return startOfLocalDay(new Date(t).toISOString());
  }
  return startOfLocalDay(now);
}

/**
 * A STORED TIMESTAMP, FOR A PERSON.
 *
 * `2026-09-08T18:52:26.289Z` is what the database holds and it is right that it
 * does — ISO-8601 UTC sorts, survives a Postgres port and cannot be confused
 * about seconds and milliseconds. It is also unreadable in a table a person is
 * scanning, and printing it raw is how six of them become one grey block. The
 * stored value is unchanged; this is a rendering.
 *
 * SINCE PHASE 113a IT IS ALSO A CONVERSION, and this is one of the four places
 * that does one. The database keeps UTC; a person reads UK time. See
 * localtime.ts, which is the only file in the application that names a zone.
 */
export function stamp(iso: string): string {
  return localStamp(iso);
}

/** A moment somebody is going to keep, with the zone spelled out. */
function when(iso: string | null): string {
  if (iso === null) return 'no time yet';
  return localWhen(iso);
}

/**
 * THE NAVIGATION — PHASE 133a. Until 17 September 2026 this drew the same twenty links for every staff role, on the
 * reasoning that a menu built from permissions puts an authorisation decision in a renderer. Lakhbir asked for "an easy
 * layout for each one of the logins", and the phase brief for a menu that "shows only what the role can open". The
 * reversal, and how it keeps the worry answered, is written at the top of src/web/navigation.ts: the menu asks each
 * section's own gate, and test/phase133a.test.ts opens every link for every login in both directions.
 */
export function nav(actor: Actor, view: string | null = null): Safe {
  return staffShell(actor, view);
}

/**
 * The one place this file turns a refusal or a validation failure into a page.
 * A `SettingsError` is a sentence for the person; a `NotAuthorised` is not
 * caught here at all and reaches the server's own handler, which answers 403
 * without naming the object.
 */
export function problem(res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string): 'handled' {
  // PHASE 133d (D4): where the refusal names the field it is about, the message is drawn beside that field instead.
  // PHASE 133c (B6): A REFUSED FORM KEEPS WHAT WAS TYPED. Where the request carried a form, the page it was typed on is
  // drawn again under the same login with the values put back and the refusal's words at the top of the form
  // (src/web/refill.ts). The status is still 400. Where that page cannot be drawn, or holds no such form, the plain
  // refusal below is shown with what was typed listed under it, so it is never simply lost.
  const scratch = navContext.getStore()?.form;
  const typed = scratch?.typed;
  const plain = (): void => {
    const kept = typed === undefined ? [] : typedValues(typed);
    html(res, 400, page({
      title, nav: nav(actor),
      body: h`<h1>${title}</h1><p class="err" role="alert">${why}</p>${kept.length === 0 ? raw('') : h`<div class="card"><p><strong>What you typed</strong>, so you can copy it back:</p>
        <dl>${kept.map((k) => h`<dt>${k.name.replace(/_/g, ' ')}</dt><dd>${k.value}</dd>`)}</dl></div>`}<p><a href="${back}">Go back</a></p>`,
    }));
  };
  if (scratch === undefined || typed === undefined || scratch.action === undefined || scratch.rerender === undefined || res.headersSent) {
    plain();
    return 'handled';
  }
  const { action, rerender } = scratch;
  scratch.pending = (async () => {
    try {
      const got = await rerender(back);
      const refilled = got.status === 200 ? refillForm(got.body, action, typed, title, why, field) : null;
      if (refilled !== null) { html(res, 400, refilled); return; }
    } catch { /* the plain refusal below says the same, with the values listed */ }
    plain();
  })();
  return 'handled';
}

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleStaff(
  d: StaffDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const now = d.app.now;

  /**
   * THE BACK OFFICE'S FRONT DOOR, ASKED ONCE FOR THE WHOLE PREFIX.
   *
   * Every section behind it authorises its own objects as well — this is not a
   * substitute for that and removing any one of those checks would be a defect.
   * What it stops is a CLIENT being shown the back office's shell, its
   * navigation and its outbox on a page whose own object rule happens to pass
   * for them, which is what `/staff/settings` did until this line existed:
   * `user.read_self` is `self` for every role, so the settings page rendered
   * perfectly well for a client who had no business being in the back office
   * at all. The section is a thing you are allowed into, separately from the
   * objects inside it.
   */
  B.assertBackOffice(actor);

  /* ------------------------------------------------------------ home */
  if (path === '/staff' && method === 'GET') {
    // 1 Oct 2026: Home is a dashboard, in the shape of the login's role; Admin has a tab for each (src/web/staff-dashboard.ts).
    const view = dashView(actor, url.searchParams.get('view'));
    // 1 Oct 2026: the inbox is read first (at most every two minutes), so "new messages" counts a reply that just came.
    if (mayReadQueue(actor)) await readRepliesIfDue(d.app);
    html(res, 200, homePage(actor, view === null ? homeRows(d.app, actor)
      : dashboard(d.app, actor, view, { week: url.searchParams.get('week'), done: url.searchParams.get('done') }), view)); return 'handled';
  }

  /* ------------------------------------------ 1 OCT 2026 · blocking off time in your own diary */
  if (path === '/staff/time-blocks' && method === 'POST') {
    const f = await form(req);
    const r = addBlock({ db, audit: d.app.audit, now, newId: d.newId }, actor, {
      date: f.get('date') ?? '', from: f.get('from') ?? '', to: f.get('to') ?? '', until_date: f.get('until_date') ?? '', reason: f.get('reason') ?? '' });
    const back = safeBack(f.get('back'));
    if (!r.ok) return problem(res, actor, 'Not blocked', r.why, back);
    redirect(res, withDone(back, 'blocked')); return 'handled';
  }
  const freeIt = /^\/staff\/time-blocks\/([A-Za-z0-9-]+)\/remove$/.exec(path);
  if (freeIt && method === 'POST') {
    const f = await form(req);
    const r = removeBlock({ db, audit: d.app.audit, now, newId: d.newId }, actor, freeIt[1] ?? '');
    const back = safeBack(f.get('back'));
    if (!r.ok) return problem(res, actor, 'Not freed', r.why, back);
    redirect(res, withDone(back, 'freed')); return 'handled';
  }

  /* ------------------------------------------ PHASE 133c · the welcome card and Help */
  if (path === '/staff/welcome/dismiss' && method === 'POST') {
    dismissWelcome({ db, audit: d.app.audit, now }, actor);
    redirect(res, '/staff/help'); return 'handled';
  }
  /* ------------------------------------------ PHASE 138 · a person keeps a page section open or closed */
  if (path === '/staff/me/sections' && method === 'POST') {
    const f = await form(req);
    const r = keepSectionChoice({ db, audit: d.app.audit, now }, actor, {
      section: f.get('section') ?? '', open: f.get('open') ?? '', back: f.get('back') ?? '', anchor: f.get('anchor') ?? '',
    });
    if (!r.ok) return problem(res, actor, 'Not kept', 'That choice could not be kept. Go back and try again.', '/staff');
    redirect(res, r.to); return 'handled';
  }
  /* ------------------------------------------ PHASE 135 · Settings, one page of tiles (Admin) */
  if (path === '/staff/admin' && method === 'GET') {
    const tiles = settingsTiles(actor, opens);
    html(res, 200, page({ title: 'Settings', nav: nav(actor), wide: true, body: settingsBody(tiles) })); return 'handled';
  }
  if (path === '/staff/help' && method === 'GET') {
    const help = staffHelp(url.searchParams.get('screen') ?? 'B0');
    // PHASE 136: the welcome card lives here now, on Help's own landing section, until the person hides it.
    const welcome = (url.searchParams.get('screen') ?? 'B0') === 'B0' && welcomeShown(db, actor)
      ? welcomeCard(WELCOME_JOBS[actor.role], '/staff/welcome/dismiss') : raw('');
    html(res, 200, page({ title: help.title, nav: nav(actor), wide: true, body: h`${welcome}${help.body}` })); return 'handled';
  }

  /* ------------------------------------------ SECTION 1 · assessments */
  if (path === '/staff/assessments' && method === 'GET') {
    html(res, 200, assessmentsPage(actor, B.filedAssessments(db, actor)));
    return 'handled';
  }
  const oneAssessment = /^\/staff\/assessments\/([A-Za-z0-9-]+)$/.exec(path);
  if (oneAssessment && method === 'GET') {
    const detail = B.assessmentDetail(db, actor, oneAssessment[1] ?? '');
    html(res, 200, assessmentPage(actor, detail));
    return 'handled';
  }

  /* --------------------------------------------- SECTION 2 · calendar */
  if (path === '/staff/calendar' && method === 'GET') {
    const view = url.searchParams.get('view') === 'week' ? 'week' : 'day';
    const date = askedDate(url.searchParams.get('date'), now());
    const cal = B.calendar(db, actor, { view, date, now: now() });
    html(res, 200, calendarPage(actor, cal, B.assignableStaffIfPermitted(db, actor), isoDate(now())));
    return 'handled';
  }

  const schedule = /^\/staff\/calendar\/([A-Za-z0-9-]+)\/schedule$/.exec(path);
  if (schedule && method === 'POST') {
    const f = await form(req);
    const id = schedule[1] ?? '';
    const day = f.get('day') ?? '';
    const time = f.get('time') ?? '';
    const starts = f.get('starts_at') ?? (day !== '' && time !== '' ? `${day}T${time}:00.000Z` : '');
    if (starts === '') {
      return problem(res, actor, 'Not scheduled', 'Pick a time.', '/staff/calendar');
    }
    const hadTime = db.get<{ s: string | null }>('SELECT starts_at AS s FROM bookings WHERE id = ?', [id])?.s ?? null;
    const r = B.scheduleBooking(
      { db, audit: d.app.audit, email: d.app.email, now, newId: d.newId },
      actor,
      { booking_id: id, starts_at: starts, assigned_to: f.get('assigned_to') },
    );
    if (!r.ok) return problem(res, actor, 'Not scheduled', r.why, '/staff/calendar');
    // 30 Sep 2026: a video call's Zoom meeting is made (or moved) for the time, and its invitation carries the link.
    if (r.booking.channel === 'video') {
      await reconcileVideoMeeting(d.app, id);
      sendVideoInvite(d.app, d.publicOrigin ?? 'http://localhost:8103', id, hadTime === null ? 'arranged' : 'moved');
    }
    redirect(res, `/staff/calendar?view=day&date=${isoDate(r.booking.starts_at ?? now())}`);
    return 'handled';
  }

  /* 30 Sep 2026: A VIDEO CALL, JOINED INSIDE THE BACK OFFICE. Those who arrange calls start it as the host (Zoom's start
     token, asked for now and put only in this page, which is never cached); anyone else who may see the call joins it. */
  const videoCall = /^\/staff\/calendar\/([A-Za-z0-9-]+)\/video$/.exec(path);
  if (videoCall && method === 'GET') {
    const id = videoCall[1] ?? '';
    const bk = B.bookingById(db, actor, id);
    const m = bk.channel === 'video' && bk.cancelled_at === null ? activeMeeting(db, id) : undefined;
    if (m === undefined || bk.starts_at === null) {
      const why = bk.channel !== 'video' ? 'This is not a video call.' : bk.cancelled_at !== null ? 'This call was cancelled.'
        : bk.starts_at === null ? 'Give the call a time first; its meeting is made then.' : zoomBlockers(d.app).join(' ') || 'Zoom did not make a meeting for this call. Give it its time again to try once more, or send the client a link yourself.';
      return problem(res, actor, 'No video call to join', why, `/staff/calendar/${id}`);
    }
    const host = B.mayArrangeCalls(actor);
    // 1 Oct 2026: the first time a host opens the call, it is marked started — the Communication tab shows it.
    if (host && db.run('UPDATE video_meetings SET host_opened_at = ?, host_opened_by = ? WHERE id = ? AND host_opened_at IS NULL', [now(), actor.id, m.id]).changes === 1) {
      d.app.audit.append({ at: now(), kind: 'VIDEO_CALL_OPENED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'booking', object_id: id, detail: {} });
    }
    const zak = host ? await hostZak(zoomDeps(d.app)) : null;
    const sig = joinSignature(d.app.secrets, m.meeting_id, host && zak !== null ? 1 : 0, now());
    if (sig === null) return problem(res, actor, 'No video call to join', zoomBlockers(d.app).join(' '), `/staff/calendar/${id}`);
    const name = db.get<{ n: string }>('SELECT display_name AS n FROM users WHERE id = ?', [actor.id])?.n ?? 'Cap Rebate';
    const out = page({ title: `Video call · ${bk.business_name}`, nav: nav(actor), wide: true, body: h`
      <h1>Video call with ${bk.business_name}</h1>
      <p><strong>${when(bk.starts_at)}</strong>, for an hour. ${host && zak === null ? h`<span class="help">Zoom did not give us the host's start token, so you join as a participant; start the meeting from the Zoom app if the client is waiting.</span>` : raw('')}</p>
      ${joinPanel({ meeting_id: m.meeting_id, passcode: m.passcode, signature: sig.signature, sdk_key: sig.sdk_key, user_name: `${name} · Cap Rebate`, zak: host ? zak : null }, host && zak !== null ? 'host' : 'client')}
      <p class="help">Or open it in the Zoom app: <a href="${m.join_url}" rel="noopener noreferrer">${m.join_url}</a>. The client's own page: ${clientJoinUrl(d.publicOrigin ?? 'http://localhost:8103', m.client_token)}</p>
      <p><a href="/staff/calendar/${id}">Back to the call</a></p>` });
    res.writeHead(200, VIDEO_PAGE_HEADERS); res.end(withJoinScripts(out));
    return 'handled';
  }

  const oneBooking = /^\/staff\/calendar\/([A-Za-z0-9-]+)$/.exec(path);
  if (oneBooking && method === 'GET') {
    const id = oneBooking[1] ?? '';
    const bk = B.bookingById(db, actor, id);
    // THE SAME FUNCTION THE CALENDAR AND THE CLIENT'S OWN PICKER ASK. One
    // source of bookable time, reached from three places.
    const slots = staffSlots(db, now(), addLocalDays(startOfLocalDay(now()), HORIZON_DAYS), { now: now() });
    // 30 Sep 2026: a video call says whether its Zoom meeting is ready to join, and if not why.
    const video = bk.channel !== 'video' || bk.cancelled_at !== null ? undefined
      : activeMeeting(db, id) !== undefined ? { ready: true as const }
      : { ready: false as const, why: bk.starts_at === null ? 'It has no time yet; its meeting is made when it is given one.' : zoomBlockers(d.app).join(' ') || 'Zoom did not make a meeting. Give it its time again to try once more, or send the client a link yourself.' };
    html(res, 200, bookingPage(actor, bk, B.bookingHistory(db, actor, id),
      B.assignableStaffIfPermitted(db, actor), slots, video));
    return 'handled';
  }

  /* ------------------------------------------------ PHASE 151b · Accounting's clients area, and chasing an invoice */
  const billing = await handleBilling({ app: d.app, newId: d.newId, nav, problem }, req, res, url, method, actor, form);
  if (billing === 'handled') return 'handled';

  /* ------------------ SECTION 3 · a free-typed email to a company or a lead (Phase 141) */
  const freeEmail = await handleFreeEmail({ app: d.app, store: d.store, newId: d.newId, nav, problem }, req, res, url, method, actor, form);
  if (freeEmail === 'handled') return 'handled';

  /* ------------------ SECTION 3 · writing to the client on the company's chat, and email replies to sort (Phase 142) */
  const chat = await handleStaffMessages({ app: d.app, store: d.store, newId: d.newId, nav, problem, ...(d.publicOrigin === undefined ? {} : { publicOrigin: d.publicOrigin }) }, req, res, url, method, actor, form);
  if (chat === 'handled') return 'handled';

  /* ------------------ SECTION 3 · the company's files, in folders, and a staff upload (Phase 140) */
  const clientFiles = await handleClientFiles({ app: d.app, store: d.store, newId: d.newId, nav, problem }, req, res, url, method, actor, form, body);
  if (clientFiles === 'handled') return 'handled';

  /* ------------------ SECTION 3 · the one client page, and a claim inside it (Phase 134) */
  const client = await handleClientPage({ app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor);
  if (client === 'handled') return 'handled';

  /* ------------------------------ SECTION 3 · engaged clients (Phase 106) */
  const engaged = await handleEngaged(
    { app: d.app, newId: d.newId, nav, stamp, problem, ...(d.publicOrigin === undefined ? {} : { publicOrigin: d.publicOrigin }) }, req, res, url, method, actor, form,
  );
  if (engaged === 'handled') return 'handled';

  /* ------------------------- SECTION 4 · the surveyor workspace (Phase 107) */
  const survey = await handleSurveyor(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (survey === 'handled') return 'handled';
  // 1 Oct 2026: the survey pack — the sums, the surveyor's stamped changes (src/web/survey-pack-pages.ts).
  const pack = await handleSurveyPack({ app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form);
  if (pack === 'handled') return 'handled';
  // 2 Oct 2026: the approved report, its PDF, and sending it for sign-off (src/web/report-pages.ts).
  const report = await handleReportStaff({ app: d.app, newId: d.newId, nav, stamp, problem, origin: d.publicOrigin ?? 'http://localhost:8103' }, req, res, url, method, actor, form);
  if (report === 'handled') return 'handled';
  // 2 Oct 2026: the client's photos, the walkthrough call and how the surveyor inspected (src/web/evidence-pages.ts).
  const evidence = await handleStaffEvidence({ app: d.app, store: d.store, newId: d.newId, nav, problem, origin: d.publicOrigin ?? 'http://localhost:8103' }, req, res, url, method, actor, form);
  if (evidence === 'handled') return 'handled';

  /* ------------------------------ SECTION 5 · Caprebate's finance (Phase 107) */
  const finance = await handleFinance(
    { app: d.app, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (finance === 'handled') return 'handled';

  /* ------ SECTION 5a · search, list views and CSV export (CRM 9 of 10) — before the sections whose prefixes they share */
  const lists = await handleLists({ app: d.app, newId: d.newId, nav, problem }, req, res, url, method, actor, form);
  if (lists === 'handled') return 'handled';

  /* ------ SECTION 6 · organisations, properties and claims (CRM 1 of 10) */
  const crm = await handleCrm(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (crm === 'handled') return 'handled';

  /* ------------------------- SECTION 7 · leads and the pipeline (CRM 2 of 10) */
  const pipeline = await handlePipeline(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (pipeline === 'handled') return 'handled';

  /* ---- SECTION 8 · tasks, next actions, automation and templates (CRM 3 of 10) */
  const tasks = await handleTasks(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (tasks === 'handled') return 'handled';

  /* ---------- SECTION 9 · documents on the claim, types and requests (CRM 4 of 10) */
  const documents = await handleDocuments(
    { app: d.app, store: d.store, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form, body,
  );
  if (documents === 'handled') return 'handled';

  /* ------ SECTION 10 · introducers, the referral channel and the reward model (CRM 5 of 10) */
  const introducers = await handleIntroducers(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (introducers === 'handled') return 'handled';

  /* ------ SECTION 11 · the claim's facts, figures, sign-off, deliverables and aftercare (CRM 6 of 10) */
  const claimRecord = await handleClaimRecord(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (claimRecord === 'handled') return 'handled';

  /* ------ SECTION 12 · the compliance registers (CRM 8 of 10) */
  const compliance = await handleCompliance(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (compliance === 'handled') return 'handled';

  /* ------ SECTION 14 · the admin settings screen (CRM 9 of 10) */
  const configuration = await handleConfiguration({ app: d.app, newId: d.newId, nav, problem }, req, res, url, method, actor, form);
  if (configuration === 'handled') return 'handled';

  /* ------ SECTION 13 · the management dashboard (CRM 9 of 10) */
  const dash = await handleDashboard({ app: d.app, nav }, req, res, url, method, actor);
  if (dash === 'handled') return 'handled';

  /* --------------------------------------------------- 7 · settings */
  const settled = await handleSettings(d, req, res, url, method, actor, form, body, '/staff/settings');
  if (settled === 'handled') return 'handled';

  /* ------------------------------------------------ ADMIN ONLY · the audit log (the CRM follow-on) */
  if (path === '/staff/audit' && method === 'GET') {
    html(res, 200, auditPage(actor, auditLogView({ db, audit: d.app.audit, now }, actor, url.searchParams)));
    return 'handled';
  }

  /* ------------------------------------------------ PHASE 151b · SUPER ADMIN ONLY · the roles they make */
  const roles = await handleRoleEditor({ app: d.app, nav, problem }, req, res, url, method, actor, form);
  if (roles === 'handled') return 'handled';

  /* ------------------------------------------------ ADMIN ONLY · users */
  if (path === '/staff/users' && method === 'GET') {
    html(res, 200, usersPage(actor, S.staffList(db, actor), undefined, madeRoleChoices(d.app, actor), url.searchParams.get('add') === '1')); return 'handled';
  }

  if (path === '/staff/users/create' && method === 'POST') {
    const f = await form(req);
    /* PHASE 151j (Lakhbir, 28 Sep 2026): the system makes a TEMPORARY password, shown once, here, to hand over. The
       person chooses their own at their first sign-in, and sets up their second step. Nobody types a password here. */
    const password = SI.temporaryPassword();
    const until = SI.temporaryUntil(now());
    let created;
    try {
      created = await S.createStaffUser(
        { db, audit: d.app.audit, now, hash: (p) => d.app.hasher.hash(p) },
        actor,
        {
          email: f.get('email') ?? '', display_name: f.get('display_name') ?? '',
          role: f.get('role') ?? '', password, temporary_until: until,
          business_id: f.get('business_id'),
        },
      );
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not created', e.message, '/staff/users', e.field);
      throw e;
    }
    html(res, 200, temporaryPasswordPage(actor, created.display_name, created.email, roleName(created.role), password, until, true)); return 'handled';
  }

  /* PHASE 151j: the super user gives somebody a new temporary password (a forgotten one, or none to hand), or clears
     their second step (a lost phone). Either ends their sessions. */
  const tempMatch = /^\/staff\/users\/([A-Za-z0-9-]+)\/temporary-password$/.exec(path);
  if (tempMatch && method === 'POST') {
    const r = await SI.issueTemporaryPassword(d.app, actor, tempMatch[1] ?? '');
    html(res, 200, temporaryPasswordPage(actor, r.user.display_name, r.user.email, roleName(r.user.role), r.password, r.until, false)); return 'handled';
  }
  const mfaMatch = /^\/staff\/users\/([A-Za-z0-9-]+)\/reset-two-factor$/.exec(path);
  if (mfaMatch && method === 'POST') {
    SI.resetTwoFactor(d.app, actor, mfaMatch[1] ?? '');
    redirect(res, '/staff/users?done=two-factor'); return 'handled';
  }

  const roleMatch = /^\/staff\/users\/([A-Za-z0-9-]+)\/role$/.exec(path);
  if (roleMatch && method === 'POST') {
    const f = await form(req);
    try {
      S.assignRole(d.app.deps, actor, roleMatch[1] ?? '', f.get('role') ?? '');
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not changed', e.message, '/staff/users');
      throw e;
    }
    redirect(res, '/staff/users?done=role'); return 'handled';
  }

  const disableMatch = /^\/staff\/users\/([A-Za-z0-9-]+)\/disable$/.exec(path);
  if (disableMatch && method === 'POST') {
    // 1 Oct 2026: "Archive" on Home's Admin tab posts here too, and goes back there.
    const fromHome = (await form(req)).get('back') === '/staff?view=admin';
    try {
      S.disableUser(d.app.deps, actor, disableMatch[1] ?? '');
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not disabled', e.message, '/staff/users');
      throw e;
    }
    /* PHASE 151 (Word answer 166, closed 24 September 2026): a leaver's photo is deleted when their account is disabled
       — the row and the file, by the same clearPhoto a person uses on their own, which fails rather than report a file
       gone that is still on disk. Only once the account is disabled: a refused disable deletes nothing. */
    const hadPhoto = photoFor(db, disableMatch[1] ?? '') !== undefined;
    await clearPhoto({ db, store: d.store }, disableMatch[1] ?? '');
    if (hadPhoto) {
      d.app.audit.append({
        at: now(), kind: 'USER_UPDATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'user', object_id: disableMatch[1] ?? '', detail: { photo_deleted: true, because: 'ACCOUNT_DISABLED' },
      });
    }
    redirect(res, fromHome ? '/staff?view=admin&done=archived#people' : '/staff/users?done=disabled'); return 'handled';
  }

  /* ------------------------------------------ 1 OCT 2026 · Admin saves an API key, sealed (src/web/saved-keys.ts) */
  const keyMatch = /^\/staff\/keys\/([A-Z0-9_]{1,64})(\/unsave)?$/.exec(path);
  if (keyMatch && method === 'POST') {
    const f = await form(req);
    const unsave = keyMatch[2] !== undefined;
    const r = await saveKey(d.app, actor, keyMatch[1] ?? '', unsave ? null : (f.get('value') ?? ''), f.get('password') ?? '');
    if (!r.ok) return problem(res, actor, 'Not saved', r.why, '/staff?view=admin#keys');
    redirect(res, `/staff?view=admin&done=${unsave ? 'key-unsaved' : 'key-saved'}#key-${keyMatch[1] ?? ''}`); return 'handled';
  }

  /* ---------------------------------- PHASE 146g · addresses we cannot email */
  if (path === '/staff/email-addresses' && method === 'GET') {
    html(res, 200, stoppedAddressesPage(actor, S.stoppedAddresses(db, actor), url.searchParams.get('done') ?? undefined));
    return 'handled';
  }
  if (path === '/staff/email-addresses/lift' && method === 'POST') {
    const f = await form(req);
    const r = S.liftStoppedAddress({ db, audit: d.app.audit, now }, actor, f.get('address') ?? '');
    redirect(res, `/staff/email-addresses?done=${r.lifted ? 'lifted' : 'not-stopped'}`); return 'handled';
  }

  return 'not-mine';
}

/**
 * SETTINGS, MOUNTED TWICE — once at `/staff/settings` for the back office and
 * once at `/portal/settings` for a client.
 *
 * ONE IMPLEMENTATION, AND THAT IS THE POINT. A client has to be able to change
 * their own password; before this phase there was nowhere they could. The lazy
 * fix is a second settings page in the portal, and within a month one of the
 * two would rotate the session on a password change and the other would not.
 *
 * WHAT DIFFERS BETWEEN THE TWO IS PRESENTATION AND NOTHING ELSE — the shell,
 * the navigation, and whether the working-times and administration sections are
 * drawn. Every authorisation is the same `can()` call on the same object, and
 * a client posting to the working-times route is refused by `working_time.write`
 * rather than by the absence of a form.
 */
async function handleSettings(
  d: StaffDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
  base: string,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const now = d.app.now;

  if (path === base && method === 'GET') {
    html(res, 200, settingsPage(d, actor, base, url.searchParams.get('saved') ?? undefined, undefined));
    return 'handled';
  }

  if (path === `${base}/profile` && method === 'POST') {
    const f = await form(req);
    try {
      S.setDisplayName(db, d.app.audit, now, actor, f.get('display_name') ?? '');
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not saved', e.message, base, e.field);
      throw e;
    }
    redirect(res, `${base}?saved=name`); return 'handled';
  }

  if (path === `${base}/username` && method === 'POST') {
    const f = await form(req);
    try {
      S.setUsername(d.app.deps, actor, f.get('username') ?? '');
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not changed', e.message, base, e.field);
      throw e;
    }
    redirect(res, `${base}?saved=username`); return 'handled';
  }

  if (path === `${base}/password` && method === 'POST') {
    const f = await form(req);
    const next = f.get('next') ?? '';
    const again = f.get('again') ?? '';
    if (next !== again) {
      return problem(res, actor, 'Not changed', 'The two new passwords are not the same.', base, 'again');
    }
    const u = findById(db, actor.id);
    if (u === undefined) return problem(res, actor, 'Not changed', 'That account no longer exists.', '/');
    const session = url.searchParams.get('__never') ?? '';
    void session;
    try {
      // A PASSWORD CHANGE IS A PRIVILEGE CHANGE. `changeOwnPassword` revokes the
      // session in hand and issues a new one carrying `rotated_from`, so the
      // browser has to be given the replacement or the person is signed out by
      // their own success.
      const rotated = await changeOwnPassword(
        d.app.deps, u, currentSessionId(d, req), f.get('current') ?? '', next,
      );
      res.setHeader('set-cookie',
        `${SESSION_COOKIE_NAME}=${rotated.cookie.value}; HttpOnly; Secure; SameSite=Lax; Path=/; ` +
        `Expires=${new Date(rotated.cookie.expires).toUTCString()}`);
    } catch (e) {
      if (e instanceof AuthError) {
        // PHASE 133e (D4, continued): the only thing a password change can be refused on here is the current one.
        return problem(res, actor, 'Not changed', e.message, base, 'current');
      }
      if (e instanceof Error && /at least 12/.test(e.message)) {
        return problem(res, actor, 'Not changed', 'A password is at least 12 characters.', base, 'next');
      }
      throw e;
    }
    redirect(res, `${base}?saved=password`); return 'handled';
  }

  if (path === `${base}/working-times` && method === 'POST') {
    const f = await form(req);
    const rows: WorkingTimeInput[] = [];
    for (const weekday of [1, 2, 3, 4, 5, 6, 0]) {
      if (f.get(`d${weekday}_on`) !== 'on') continue;
      const start = clockToMinutes(f.get(`d${weekday}_start`) ?? '');
      const end = clockToMinutes(f.get(`d${weekday}_end`) ?? '');
      if (start === null || end === null) {
        return problem(res, actor, 'Not saved',
          `${WEEKDAY_NAMES[weekday] ?? 'That day'} needs a start and an end, as HH:MM.`, base);
      }
      rows.push({ weekday, start_min: start, end_min: end });
    }
    try {
      S.saveWorkingTimes(db, d.app.audit, now, actor, actor.id, rows);
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not saved', e.message, base);
      throw e;
    }
    redirect(res, `${base}?saved=hours`); return 'handled';
  }

  /* ------------------------------------------------- the photo */
  if (path === `${base}/photo` && method === 'GET') {
    // AUTHORISED ON THE OBJECT, ON THIS REQUEST. `user.read_self` is `self` for
    // every role, so this can only ever serve the requester their own face.
    const u = findById(db, actor.id);
    if (u === undefined) { html(res, 404, page({ title: 'No photo', body: h`<p>No photo.</p>` })); return 'handled'; }
    S.profile(db, actor); // the same authorisation the page does, on the same object
    const got = await readPhoto({ db, store: d.store }, actor.id);
    if (got === undefined) {
      html(res, 404, page({ title: 'No photo', body: h`<p>There is no photo on this account.</p>` }));
      return 'handled';
    }
    res.writeHead(200, { ...PHOTO_HEADERS, 'content-length': String(got.bytes.length) });
    res.end(Buffer.from(got.bytes));
    return 'handled';
  }

  if (path === `${base}/photo` && method === 'POST') {
    const u = findById(db, actor.id);
    if (u === undefined) return problem(res, actor, 'Not saved', 'That account no longer exists.', '/');
    // The rule for putting a face on an account is its own, and it is `self`
    // for every role — including ADMIN, which cannot do it to anybody else.
    S.assertMaySetPhoto(actor, u);
    let raw0: Buffer;
    try {
      // The cap is generous enough to hold the multipart envelope around a file
      // at the limit; the file's own cap is enforced on the extracted part.
      raw0 = await body(req, IMAGE_LIMITS.max_bytes + 64 * 1024);
    } catch {
      return problem(res, actor, 'Not saved',
        `That file is larger than the ${Math.round(IMAGE_LIMITS.max_bytes / 1024 / 1024)} MB we accept.`, base);
    }
    // A browser form can only carry a file one way, and this reads that one way
    // and nothing else. A caller posting the bytes directly — curl, or the
    // tests — is accepted too, because the controls that matter run on the
    // bytes either way.
    const ct = req.headers['content-type'];
    let bytes: Uint8Array;
    if (ct !== undefined && /^multipart\/form-data\b/i.test(ct)) {
      const parsed = singleFile(new Uint8Array(raw0), ct);
      if (!parsed.ok) return problem(res, actor, 'Not saved', parsed.why, base);
      bytes = parsed.part.bytes;
    } else {
      bytes = new Uint8Array(raw0);
    }
    const r = await setPhoto({ db, store: d.store, now }, actor.id, bytes);
    if (!r.ok) return problem(res, actor, 'Not saved', r.why, base);
    d.app.audit.append({
      at: now(), kind: 'USER_UPDATED', outcome: 'ALLOWED',
      actor_id: actor.id, actor_role: actor.role, object_type: 'user', object_id: actor.id,
      detail: { field: 'photo', stored_bytes: r.record.byte_size, source_format: r.record.source_format },
    });
    redirect(res, `${base}?saved=photo`); return 'handled';
  }

  if (path === `${base}/photo/remove` && method === 'POST') {
    const u = findById(db, actor.id);
    if (u === undefined) return problem(res, actor, 'Not saved', 'That account no longer exists.', '/');
    S.assertMaySetPhoto(actor, u);
    await clearPhoto({ db, store: d.store }, actor.id);
    d.app.audit.append({
      at: now(), kind: 'USER_UPDATED', outcome: 'ALLOWED',
      actor_id: actor.id, actor_role: actor.role, object_type: 'user', object_id: actor.id,
      detail: { field: 'photo', removed: true },
    });
    redirect(res, `${base}?saved=photo-removed`); return 'handled';
  }

  return 'not-mine';
}

/** The portal's mount of the same settings. See `handleSettings`. */
export function handlePortalSettings(
  d: StaffDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
): Promise<WebResult> {
  return handleSettings(d, req, res, url, method, actor, form, body, '/portal/settings');
}

/**
 * The session id in the caller's hand. `changeOwnPassword` rotates it, so it
 * has to be the real one — passing anything else would revoke a session nobody
 * is holding and leave the live one running past a password change.
 */
function currentSessionId(d: StaffDeps, req: IncomingMessage): string {
  const raw0 = req.headers.cookie ?? '';
  for (const part of raw0.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE_NAME) {
      const s = d.app.db.get<{ id: string }>(
        'SELECT id FROM sessions WHERE token_hash = ? AND revoked_at IS NULL',
        [hashToken(decodeURIComponent(v.join('=')))],
      );
      return s?.id ?? '';
    }
  }
  return '';
}

/* ================================================================== *
 * PAGES
 * ================================================================== */

/* ------------------------------------------------------------------ *
 * HOME — PHASE 136: ROWS OF TILES, IN LAKHBIR'S ORDER (src/web/home.ts)
 * ------------------------------------------------------------------ */

/**
 * The page is a heading and the rows. Nothing else: the "Signed in as" line, the welcome card (now on Help) and the two
 * notes (the outbox is on Your account; UK time is in the guide) left the page, and the dashboard is the Reports tile.
 */
/** Back to a page of Home only: its own path and plain characters, never another site. */
function safeBack(back: string | null): string {
  const b = back ?? '';
  return b.startsWith('/staff') && /^\/staff[A-Za-z0-9/?=&_#-]*$/.test(b) && !b.startsWith('//') ? b : '/staff#calendar';
}

/** The same address with ?done= set, before any #part. */
function withDone(back: string, done: string): string {
  const [path, hash] = back.split('#');
  const clean = (path ?? '').replace(/([?&])done=[^&]*&?/, '$1').replace(/[?&]$/, '');
  return `${clean}${clean.includes('?') ? '&' : '?'}done=${done}${hash === undefined ? '' : `#${hash}`}`;
}

function homePage(actor: Actor, rows: Safe, view: string | null = null): string {
  // UI TIDY PHASE 4: a dashboard draws its own heading, with the day and what is late beside it (src/web/staff-dashboard.ts).
  return page({ title: 'Home', nav: nav(actor, view), wide: true, body: view === null ? h`<h1>Home</h1>${rows}` : rows });
}

/**
 * THE AUDIT LOG PAGE — the CRM follow-on. Draws what `auditLogView` returns: the chain's state, and each line's kind,
 * ids and outcome. `detail` is not in the view, so it cannot be drawn. A drop-down's markup starts its own line, because
 * tools/lint-sql.cjs reads the HTML word for one after a backtick as SQL.
 */
function auditPage(actor: Actor, v: AuditLogView): string {
  const kinds = v.kinds.map((k) => h`<option value="${k}"${v.applied.kind === k ? raw(' selected') : raw('')}>${k}</option>`);
  const outcomes = Object.entries(AUDIT_OUTCOMES).map(([k, l]) => h`<option value="${k}"${v.applied.outcome === k ? raw(' selected') : raw('')}>${l}</option>`);
  return page({
    title: 'Audit log', nav: nav(actor), wide: true,
    body: h`
      <h1>Audit log</h1>
      <div class="${v.chain.intact ? 'gate' : 'flag'}"><strong>${v.chain.says}</strong></div>
      <p class="help">${v.never} The newest ${AUDIT_PAGE_SIZE} lines that match are shown, newest first.
      Opening this page adds a line to the log.</p>
      <form method="get" action="/staff/audit" class="pblock">
        <label>Kind
          <select name="kind"><option value="">any</option>${kinds}</select></label>
        <label>Outcome
          <select name="outcome"><option value="">any</option>${outcomes}</select></label>
        <button type="submit">Show</button> <a href="/staff/audit">Clear</a>
      </form>
      ${v.said.length === 0 ? raw('') : h`<ul>${v.said.map((x) => h`<li class="help">${x}</li>`)}</ul>`}
      ${v.lines.length === 0 ? h`<p class="help">No line matches.</p>` : h`<div class="tablewrap" id="audit-lines"><table>
        <thead><tr><th>#</th><th>When</th><th>Kind</th><th>Role</th><th>Who (id)</th><th>About</th><th>Outcome</th></tr></thead>
        <tbody>${v.lines.map((l) => h`<tr class="${l.outcome === 'REFUSED' ? 'overdue' : ''}"><td>${l.seq}</td><td class="when">${l.at}</td><td>${l.kind}</td>
          <td>${l.actor_role ?? h`<span class="help">no session</span>`}</td><td>${l.actor_id ?? '—'}</td>
          <td>${l.object_type ?? '—'} ${l.object_id ?? ''}</td><td>${AUDIT_OUTCOMES[l.outcome] ?? l.outcome}</td></tr>`)}</tbody></table></div>`}`,
  });
}

/* ------------------------------------------------- section 1 pages */

function contactCell(c: B.ContactView): Safe {
  return h`${c.label}${c.variant !== null ? h` (${c.variant})` : raw('')}
    ${c.entry_point !== null ? h`<br><span class="help">asked at ${B.entryPointWords(c.entry_point)}</span>` : raw('')}`;
}

function assessmentsPage(actor: Actor, rows: readonly B.AssessmentRow[]): string {
  return page({
    title: 'Filled assessments', nav: nav(actor), wide: true,
    body: h`
      <div class="pagehead"><div><p class="eyebrow">Leads</p><h1>Filled assessments</h1></div></div>
      ${filterBar(actor, LEAD_FILTERS, '/staff/assessments')}
      <p class="help">${rows.length} submitted, newest first.</p>
      ${rows.length === 0
        ? h`<p class="help">Nothing has been submitted yet.</p>`
        : h`<table><thead><tr>
            <th>Business</th><th>Sector</th><th>Property</th>
            <th>Range shown</th><th>Submitted</th><th>How to reach them</th></tr></thead>
          <tbody>${rows.map((r) => h`<tr>
            <td><a href="/staff/assessments/${r.id}">${r.business_name}</a></td>
            <td>${r.sector.replace(/_/g, ' ')}</td>
            <td>${r.properties.length === 0
              ? h`<span class="help">none recorded</span>`
              : r.properties.map((p) => h`${p.label}${p.postcode !== null ? h` (${p.postcode})` : raw('')}<br>`)}</td>
            <td>${'range' in r ? r.range : h`<span class="help">withheld — the estimate is not released to this role</span>`}</td>
            <td class="when">${stamp(r.submitted_at)}</td>
            <td>${contactCell(r.contact)}</td>
          </tr>`)}</tbody></table>`}
      <div class="gate">${RANGE_QUALIFIER}</div>`,
  });
}

function assessmentPage(actor: Actor, a: B.AssessmentDetail): string {
  return page({
    title: a.business_name, nav: nav(actor),
    body: h`
      <h1>${a.business_name}</h1>
      <table><tbody>
        <tr><th>Sector</th><td>${a.sector.replace(/_/g, ' ')}</td></tr>
        <tr><th>Submitted</th><td class="when">${stamp(a.submitted_at)}</td></tr>
        <tr><th>Property</th><td>${a.properties.length === 0
          ? h`<span class="help">none recorded</span>`
          : a.properties.map((p) => h`${p.label}${p.postcode !== null ? h` (${p.postcode})` : raw('')}<br>`)}</td></tr>
        <tr><th>Range shown to the client</th><td>${'range' in a ? a.range
          : h`<span class="help">withheld — our estimate is not released to this role until the survey is committed</span>`}</td></tr>
        <tr><th>How to reach them</th><td>${contactCell(a.contact)}</td></tr>
      </tbody></table>

      <h3>Every question, in the order asked</h3>
      <p class="help">${a.answers.length} questions — ${a.answered} answered,
      ${a.dont_know} answered “I don’t know”, ${a.skipped} skipped.
      <strong>A skipped question is a fact about the claim, not a blank</strong>, and “I don’t know”
      is an answer in its own right. Neither is shown as an empty cell anywhere on this page.</p>
      <table><thead><tr><th>#</th><th>Question</th><th>Answer</th></tr></thead>
      <tbody>${a.answers.map((x) => h`<tr class="${x.state.toLowerCase()}">
        <td>${x.ord + 1}</td><td>${x.question_text}</td>
        <td>${x.state === 'ANSWERED' ? h`${x.label}` : h`<em>${x.label}</em>`}</td>
      </tr>`)}</tbody></table>

      <div class="gate">${RANGE_QUALIFIER} It is the same figure the client sees on their own screen.</div>
      <p><a href="/staff/assessments">Back to the list</a></p>`,
  });
}

/* ------------------------------------------------- section 2 pages */

function availabilityNote(a: B.CalendarView['availability']): Safe {
  if (a.available) {
    return h`<p class="help">${a.slots.length} free ${SLOT_MINUTES}-minute slots in this window,
      worked out from working times. <strong>Nothing else sets them.</strong></p>`;
  }
  return h`<div class="flag"><strong>No slots to offer.</strong> ${a.say}</div>`;
}

/**
 * UI TIDY PHASE 13 — THE CALENDAR, 3 October 2026. The page opens with what it is showing ("Friday 2 Oct 2026"), the
 * buttons to move (Earlier, Today, Later) and to switch between the day and the week, and four boxes counting the calls
 * held in the window and the three lists below. The week is seven boxes side by side on a laptop — each day's calls, or
 * "Nothing booked" — instead of seven headings; the day is one table. A call with nobody on it says "Nobody yet" in
 * amber; a cancelled call says so in red. The work queue keeps its words and its order (asked for a call, then
 * cancelled, then another way); each row's link says what it does, "Give it a time" for a login that may arrange calls
 * and "Open" for any other. The cancelled calls fold away, with how many. The sections are in the left-hand menu.
 */
export function calendarCounts(cal: Pick<B.CalendarView, 'days' | 'awaiting' | 'capture_only' | 'cancelled'>): {
  held: number; awaiting: number; another_way: number; cancelled: number;
} {
  return {
    held: cal.days.reduce((n, d) => n + d.bookings.filter((b) => b.cancelled_at === null).length, 0),
    awaiting: cal.awaiting.length, another_way: cal.capture_only.length, cancelled: cal.cancelled.length,
  };
}

function calendarPage(
  actor: Actor, cal: B.CalendarView,
  staff: readonly { id: string; display_name: string }[], today: string,
): string {
  const otherView = cal.view === 'day' ? 'week' : 'day';
  const prev = addLocalDays(cal.from, cal.view === 'day' ? -1 : -7);
  const next = addLocalDays(cal.from, cal.view === 'day' ? 1 : 7);
  const n = calendarCounts(cal);
  const arrange = B.mayArrangeCalls(actor);
  const dayName = (iso: string): string => WEEKDAY_NAMES[localPartsOf(Date.parse(iso)).weekday] ?? '';
  const at = (view: string): string => `/staff/calendar?view=${view}&date=${isoDate(cal.from)}`;
  const count = (k: number): { note?: string } => (k > 0 ? { note: String(k) } : {});
  setSubMenu({ items: [
    { href: at('day'), label: 'Day', current: cal.view === 'day' },
    { href: at('week'), label: 'Week', current: cal.view === 'week' },
    { href: `${at(cal.view)}#waiting`, label: 'Waiting for a time', ...count(n.awaiting) },
    { href: `${at(cal.view)}#cancelled`, label: 'Cancelled', ...count(n.cancelled) },
    { href: `${at(cal.view)}#another-way`, label: 'Asked another way', ...count(n.another_way) },
  ] });
  const who = (b: B.BookingRow): Safe => (b.assigned_name === null ? nobodyBadge('Nobody yet') : h`${b.assigned_name}`);
  const gone = (b: B.BookingRow): Safe => (b.cancelled_at === null ? raw('') : h` ${lateBadge('Cancelled')}`);
  return page({
    title: 'Calendar', nav: nav(actor), wide: true,
    body: h`
      <div class="pagehead"><div><h1>Calendar</h1>
        <p class="lede">${cal.view === 'day' ? h`${dayName(cal.from)} ${isoDate(cal.from)}`
          : h`The week of ${isoDate(cal.from)} to ${isoDate(addLocalDays(cal.to, -1))}`}</p></div>
        <p class="calnav"><a class="btn" href="/staff/calendar?view=${cal.view}&amp;date=${isoDate(prev)}">← Earlier</a>
          <a class="btn" href="/staff/calendar?view=${cal.view}&amp;date=${today}">Today</a>
          <a class="btn" href="/staff/calendar?view=${cal.view}&amp;date=${isoDate(next)}">Later →</a>
          <a class="btn btn-primary" href="/staff/calendar?view=${otherView}&amp;date=${isoDate(cal.from)}">Show the ${otherView}</a></p></div>
      ${kpiRow([
        { label: cal.view === 'day' ? 'Calls that day' : 'Calls that week', value: String(n.held), tone: 'total', href: '#booked' },
        { label: 'Waiting for a time', value: String(n.awaiting), tone: n.awaiting > 0 ? 'warn' : 'plain', href: '#waiting' },
        { label: 'Asked another way', value: String(n.another_way), tone: 'plain', href: '#another-way' },
        { label: 'Cancelled', value: String(n.cancelled), tone: 'plain', href: '#cancelled' },
      ])}
      <p class="help">${zoneNotice(cal.from)}</p>

      ${availabilityNote(cal.availability)}

      <h2 id="booked">${cal.view === 'day' ? 'The day' : 'The week'}</h2>
      ${cal.view === 'week'
        ? h`<ol class="weekgrid">${cal.days.map((day) => h`<li class="wday${isoDate(day.date) === today ? ' today' : ''}">
            <p class="wday-h">${dayName(day.date).slice(0, 3)} ${isoDate(day.date)}${isoDate(day.date) === today ? h` <span class="badge b-info">Today</span>` : raw('')}</p>
            ${day.bookings.length === 0
              ? h`<p class="wnone">Nothing booked</p>`
              : h`<ul class="wcalls">${day.bookings.map((b) => h`<li><a href="/staff/calendar/${b.id}"><strong>${b.starts_at === null ? '—' : localClock(b.starts_at)}</strong> ${b.business_name}</a>
<span class="wmeta">${b.channel_label}</span><span class="wmeta">${who(b)}${gone(b)}</span></li>`)}</ul>`}</li>`)}</ol>`
        : cal.days.map((day) => day.bookings.length === 0
          ? h`<p class="help">Nothing booked.</p>`
          : h`<table class="stack"><thead><tr><th>Time</th><th>Business</th><th>Channel</th><th>Assigned to</th><th></th></tr></thead>
            <tbody>${day.bookings.map((b) => h`<tr>
              <td><strong>${b.starts_at === null ? '—' : localClock(b.starts_at)}</strong></td>
              <td data-label="Business">${b.business_name}${gone(b)}${b.cancelled_at !== null
                ? h` <span class="help">by ${b.cancelled_by_name ?? 'unknown'}, ${stamp(b.cancelled_at)}</span>` : raw('')}</td>
              <td data-label="Channel">${b.channel_label}</td>
              <td data-label="Assigned to">${who(b)}</td>
              <td><a class="btn" href="/staff/calendar/${b.id}">Open</a></td></tr>`)}</tbody></table>`)}

      <h2 id="waiting">Asked for a call, no time yet</h2>
      <p class="help">These came in from the client's own steps. Nobody typed them in again.
      Only a phone call gets a time. No other way of reaching them can have one.</p>
      ${cal.awaiting.length === 0
        ? h`<p class="help">Nothing outstanding.</p>`
        : h`<table class="stack"><thead><tr><th>Business</th><th>Asked at</th><th>Since</th><th></th></tr></thead>
          <tbody>${cal.awaiting.map((b) => h`<tr>
            <td>${b.business_name}</td><td data-label="Asked at">${B.entryPointWords(b.entry_point)}</td>
            <td class="when" data-label="Since">${stamp(b.created_at)}</td>
            <td><a class="btn${arrange ? ' btn-primary' : ''}" href="/staff/calendar/${b.id}">${arrange ? 'Give it a time' : 'Open'}</a></td></tr>`)}</tbody></table>`}

      <details class="morelist" id="cancelled"><summary>Cancelled calls <span class="count">${String(n.cancelled)}</span></summary>
      <p class="help">Calls the client cancelled in their own portal, newest first. The time is kept
      for the record and is free for somebody else. <strong>The enquiry is still open</strong> —
      nothing about the lead, the claim or the organisation changed.</p>
      ${cal.cancelled.length === 0
        ? h`<p class="help">None.</p>`
        : h`<table class="stack"><thead><tr><th>Business</th><th>Was booked for</th><th>Cancelled by</th><th>Cancelled at</th><th></th></tr></thead>
          <tbody>${cal.cancelled.map((b) => h`<tr>
            <td>${b.business_name}</td><td data-label="Was booked for">${when(b.starts_at)}</td>
            <td data-label="Cancelled by">${b.cancelled_by_name ?? 'unknown'}${b.cancelled_by_role === 'CLIENT' ? ' (the client)' : ''}</td>
            <td class="when" data-label="Cancelled at">${stamp(b.cancelled_at ?? '')}</td>
            <td><a class="btn" href="/staff/calendar/${b.id}">Open</a></td></tr>`)}</tbody></table>`}
      </details>

      <h2 id="another-way">Asked to hear from us another way, not by a call</h2>
      <p class="help">For email and text, we take the details and stop there. These people are
      waiting to hear from us too. They are kept apart so nobody looks for a time they never asked for.</p>
      ${cal.capture_only.length === 0
        ? h`<p class="help">None.</p>`
        : h`<table class="stack"><thead><tr><th>Business</th><th>Channel</th><th>Asked at</th><th>Since</th></tr></thead>
          <tbody>${cal.capture_only.map((b) => h`<tr>
            <td>${b.business_name}</td><td data-label="Channel">${b.channel_label}</td>
            <td data-label="Asked at">${B.entryPointWords(b.entry_point)}</td>
            <td class="when" data-label="Since">${stamp(b.created_at)}</td></tr>`)}</tbody></table>`}

      <div class="gate"><strong>Calendar invites are not sent yet.</strong> Giving a call a time saves
      an invite with the emails waiting to send. Nothing goes to anybody. ${staff.length === 0
        ? 'No member of staff has working times set, so no time can be offered.'
        : staff.length === 1 ? '1 member of staff has working times set.' : `${staff.length} members of staff have working times set.`}</div>`,
  });
}

function bookingPage(
  actor: Actor, b: B.BookingRow,
  history: readonly { from_starts_at: string | null; to_starts_at: string | null; changed_by_name: string | null; at: string; cancelled?: number }[],
  staff: readonly { id: string; display_name: string }[],
  slots: Availability,
  video?: { ready: true } | { ready: false; why: string },
): string {
  return page({
    title: b.business_name, nav: nav(actor),
    body: h`
      <h1>${b.business_name}</h1>
      ${b.business_id === null && b.lead_id !== null
        ? h`<p class="help">No organisation yet. This call belongs to <a href="/staff/leads/${b.lead_id}">its lead</a>,
            where the person who asked is recorded, until the lead is linked to an organisation.</p>`
        : raw('')}
      <table><tbody>
        <tr><th>Channel</th><td>${b.channel_label}${b.sms_variant !== null ? h` (${b.sms_variant})` : raw('')}</td></tr>
        <tr><th>Asked at</th><td>${B.entryPointWords(b.entry_point)}</td></tr>
        <tr><th>Requested</th><td class="when">${stamp(b.created_at)}</td></tr>
        <tr><th>Booked for</th><td>${when(b.starts_at)}</td></tr>
        <tr><th>Assigned to</th><td>${b.assigned_name ?? 'nobody'}</td></tr>
        ${video === undefined ? raw('') : video.ready
          ? h`<tr><th>Video call</th><td><a class="cta" href="/staff/calendar/${b.id}/video">Join the video call</a> <span class="help">in the back office, through Zoom. The client has been sent their own link.</span></td></tr>`
          : h`<tr><th>Video call</th><td>No Zoom meeting yet. ${video.why}</td></tr>`}
        ${b.cancelled_at !== null
          ? h`<tr><th>Cancelled</th><td><strong>Cancelled by ${b.cancelled_by_name ?? 'unknown'}${b.cancelled_by_role === 'CLIENT' ? ' (the client)' : ''}</strong>,
              <span class="when">${stamp(b.cancelled_at)}</span>. The enquiry is still open.</td></tr>`
          : raw('')}
      </tbody></table>

      ${b.cancelled_at !== null
        ? h`<p class="help">A cancelled call cannot be given a time or moved; arrange a new call with the client.</p>`
        : !B.mayArrangeCalls(actor)
          ? h`<p class="help">You can view this call. Giving it a time or moving it is for the people who arrange calls.</p>`
        : slots.available
        ? h`<h3>${b.starts_at === null ? 'Give it a time' : 'Move it'}</h3>
          <form method="post" action="/staff/calendar/${b.id}/schedule">
            <label class="fl">A free slot</label>
            <div class="opts">${distinctMoments(slots.slots).slice(0, 40).map((s) => h`
              <label class="opt${s.starts_at === b.starts_at ? ' sel' : ''}">
                <input type="radio" name="starts_at" value="${s.starts_at}"${s.starts_at === b.starts_at ? raw(' checked') : raw('')}>
                ${when(s.starts_at)}${s.starts_at === b.starts_at ? ' — where it is now' : ''}
                ${s.how_many === 1 ? h`<span class="help"> · only one person is free then</span>` : raw('')}
              </label>`)}</div>
            <label class="fl">Assign to</label>
            <div class="opts"><label class="opt"><input type="radio" name="assigned_to" value="" checked>
              Whoever is free at that time</label>
              ${staff.map((u) => h`<label class="opt"><input type="radio" name="assigned_to" value="${u.id}"> ${u.display_name}</label>`)}</div>
            <button class="cta" type="submit">Save</button>
          </form>`
        : h`<div class="flag"><strong>Nothing to offer.</strong> ${slots.say}</div>`}

      <h3>What has happened to this booking</h3>
      ${history.length === 0
        ? h`<p class="help">It has not been moved since the client asked for it.</p>`
        : h`<table><thead><tr><th>From</th><th>To</th><th>By</th><th>When</th></tr></thead>
          <tbody>${history.map((c) => h`<tr>
            <td>${when(c.from_starts_at)}</td><td>${c.cancelled === 1 ? 'cancelled' : when(c.to_starts_at)}</td>
            <td>${c.changed_by_name ?? '—'}</td>
            <td class="when">${stamp(c.at)}</td></tr>`)}</tbody></table>`}
      <p><a href="/staff/calendar">Back to the calendar</a></p>`,
  });
}

/* ------------------------------------------------------ settings pages */

/** The kind of a waiting email, said in words. The stored kind is never shown. */
const OUTBOX_KIND_WORDS: Readonly<Record<string, string>> = Object.freeze({
  TEMPLATE: 'From a template', FREE_TYPED: 'Typed by staff', NOTIFICATION: 'An alert', CALENDAR_INVITE: 'Calendar invite',
  PASSWORD_RESET: 'Password reset', WELCOME: 'Welcome', COMPLIANCE_LETTER: 'Rights or complaint letter', ACCOUNT_VERIFY: 'Email address check', SIGNED_LETTER: 'Signed letter',
});

/** The kinds a company's Email page lists (src/web/free-email.ts) — only these rows link there. */
const ON_EMAIL_PAGE: readonly string[] = ['FREE_TYPED', 'TEMPLATE'];

function settingsPage(
  d: StaffDeps, actor: Actor, base: string, saved: string | undefined, error: string | undefined,
): string {
  const p = S.profile(d.app.db, actor);
  /**
   * WHAT IS DRAWN, NOT WHAT IS ALLOWED. Both are asked of `can()`; the forms
   * below are simply not drawn where the answer is no, so a client is not shown
   * a working-times form that would be refused on submission. The refusal is
   * still there — this is the courtesy, not the control.
   */
  const inBackOffice = B.mayEnterBackOffice(actor);
  /* THE OUTBOX IS THE BACK OFFICE'S, AND IT IS NOT READ FOR A CLIENT.
     It holds messages addressed to every client, so drawing it conditionally
     while still fetching it would be a screen omitting a field — the thing this
     application refuses to call a control. It is not read at all. */
  /* PHASE 146g: AND WHETHER IT BOUNCED. Phase 146f recorded bounces and nothing showed them, so an email the
     server would not deliver looked exactly like one that had not been sent yet. The newest bounce for each
     message, its kind and the server's CODE — never the server's words. */
  const outbox = inBackOffice
    ? d.app.db.all<{ created_at: string; to_email: string; subject: string; kind: string; sent_at: string | null;
      business_id: string | null; bounce_kind: string | null; bounce_status: string | null }>(
      'SELECT o.created_at, o.to_email, o.subject, o.kind, o.sent_at, o.business_id, ' +
        'b.kind AS bounce_kind, b.status AS bounce_status FROM outbox o ' +
        'LEFT JOIN email_bounces b ON b.id = (SELECT id FROM email_bounces x WHERE x.outbox_id = o.id ' +
        'ORDER BY x.at DESC, x.rowid DESC LIMIT 1) ORDER BY o.created_at DESC LIMIT 20')
    : [];
  const stopped = inBackOffice && S.canAdminister(actor) ? S.stoppedAddresses(d.app.db, actor).length : 0;
  return page({
    title: 'Your account', nav: inBackOffice ? nav(actor) : portalShell(actor),
    body: h`
      <h1>Your account</h1>
      ${saved !== undefined ? h`<p class="help">Saved.</p>` : raw('')}
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}

      <h3>You</h3>
      <p class="help">Signed in as <strong>${p.user.display_name}</strong> (${p.user.role.toLowerCase()}).</p>
      ${p.photo === undefined
        ? h`<p class="help">No photograph on this account.</p>`
        : h`<p><img src="${base}/photo" alt="Your profile photograph" width="${p.photo.width}" height="${p.photo.height}"></p>`}

      <form method="post" action="${base}/profile">
        <label class="fl" for="me-display-name">Display name</label>
        <input class="fi" id="me-display-name" name="display_name" value="${p.user.display_name}" required>
        <button class="cta" type="submit">Save the name</button>
      </form>

      <form method="post" action="${base}/username">
        <label class="fl" for="me-username">Username — the address you sign in with</label>
        <input class="fi" id="me-username" name="username" value="${p.user.email}" autocomplete="username" required>
        <button class="cta" type="submit">Change the username</button>
      </form>
      <p class="help">Changing it signs this browser in again for you. Your old sign-in stops working.</p>

      <form method="post" action="${base}/password">
        <label class="fl" for="pw-current">Current password</label>
        <input class="fi" id="pw-current" type="password" name="current" autocomplete="current-password" required>
        <label class="fl" for="pw-next">New password — at least 12 characters</label>
        <input class="fi" id="pw-next" type="password" name="next" autocomplete="new-password" required>
        <label class="fl" for="pw-again">And again</label>
        <input class="fi" id="pw-again" type="password" name="again" autocomplete="new-password" required>
        <button class="cta" type="submit">Change the password</button>
      </form>

      <h3>Your photograph</h3>
      <p class="help">PNG only, up to ${Math.round(IMAGE_LIMITS.max_bytes / 1024 / 1024)} MB, kept at
      no more than ${IMAGE_LIMITS.max_stored_dimension} pixels on the long side.
      <strong>Nothing you send is stored.</strong> We read the picture and save a fresh copy of it.
      Anything else hidden in the file is left out. That is why we only take PNG.</p>
      <form method="post" action="${base}/photo" enctype="application/octet-stream">
        <p class="help">Choose a PNG file, then press Upload.</p>
        <input class="fi" type="file" name="photo" accept="image/png">
        <button class="cta" type="submit">Upload</button>
      </form>
      ${p.photo === undefined ? raw('') : h`
        <form method="post" action="${base}/photo/remove">
          <button class="cta" type="submit">Remove the photograph</button>
        </form>
        <p class="help">Saved: ${p.photo.width}×${p.photo.height}, ${p.photo.byte_size} bytes.
        Made from a ${p.photo.source_format.toUpperCase()} of ${p.photo.source_bytes} bytes
        on ${stamp(p.photo.updated_at)}.</p>`}

      ${inBackOffice ? h`<h3>Your working times</h3>
      <p class="help"><strong>Bookings only use these hours.</strong> No time outside them is offered,
      on the calendar or on the client's own picker. A time outside them is refused when saved.</p>
      <p class="help"><strong>These hours are UK time.</strong> Nine to five means nine to five all
      year. The clock changes in March and October are done for you. A call booked in June still
      shows the right time in December.</p>
      <form method="post" action="${base}/working-times">
        ${p.week.map((row) => h`<div class="pblock">
          <label class="ck"><input type="checkbox" name="d${row.weekday}_on"${row.set ? raw(' checked') : raw('')}>
            ${row.name}</label>
          <label class="fl">From</label>
          <input class="fi" name="d${row.weekday}_start" value="${row.start}" placeholder="09:00">
          <label class="fl">To</label>
          <input class="fi" name="d${row.weekday}_end" value="${row.end}" placeholder="17:00">
        </div>`)}
        <button class="cta" type="submit">Save the week</button>
      </form>

      ${S.canAdminister(actor) ? h`<h3>Administration</h3>
        <p><a class="cta" href="/staff/users">Users and roles</a></p>
        <p><a class="cta" href="/staff/email-addresses">Addresses we cannot email</a>${stopped === 0
          ? raw('') : h` — ${stopped} stopped`}</p>` : raw('')}

      <h3>Emails waiting to send</h3>
      <p class="help">Emails are not being sent yet. Each one is saved here until sending is switched on.
      Calendar invites wait here too. A company's own emails are on its Email page.</p>
      ${outbox.length === 0
        ? h`<p class="help">No emails waiting.</p>`
        : h`<table><thead><tr><th>When</th><th>What it is</th><th>Subject</th><th>State</th><th></th></tr></thead>
          <tbody>${outbox.map((m) => h`<tr><td class="when">${stamp(m.created_at)}</td><td>${OUTBOX_KIND_WORDS[m.kind] ?? 'Other'}</td>
            <td>${m.subject}</td><td>${m.bounce_kind === 'HARD'
              ? h`<strong>Came back — that address does not work</strong> (code ${m.bounce_status ?? 'not recorded'})`
              : m.bounce_kind === 'SOFT'
                ? h`Came back — try again later (code ${m.bounce_status ?? 'not recorded'})`
                : m.sent_at === null ? h`Saved — not sent yet` : h`Sent ${stamp(m.sent_at)}`}</td>
            <td>${m.business_id !== null && ON_EMAIL_PAGE.includes(m.kind)
              ? h`<a href="/staff/clients/${m.business_id}/email">Open the Email page</a>` : raw('')}</td></tr>`)}</tbody></table>`}`
      : h`<p><a href="/portal">Back to your claim</a></p>`}`,
  });
}

/**
 * ADDRESSES WE CANNOT EMAIL — PHASE 146g, 23 September 2026. Admin only.
 *
 * An address the mail server refused for good is stopped, and nothing more is sent to it. That was built by Phase
 * 146f with no way back: `liftSuppression` existed and no screen called it. This is the screen.
 *
 * A LIFT IS A NEW ROW, not an edit. The bounce stays on record and so does the stop; the lift sits after them with
 * who pressed the button and when. Pressing it for an address that is not stopped is not an error and says so.
 */
function stoppedAddressesPage(actor: Actor, rows: readonly S.StoppedAddress[], done: string | undefined): string {
  return page({
    title: 'Addresses we cannot email', nav: nav(actor), wide: true,
    body: h`
      <h1>Addresses we cannot email</h1>
      ${done === 'lifted' ? h`<p class="help">Done. We can email that address again.</p>`
        : done === 'not-stopped' ? h`<p class="help">That address was not stopped, so nothing changed.</p>` : raw('')}
      <p class="help">An email came back saying the address does not work, so we stopped sending to it.
      <strong>Check with the person first.</strong> If they tell you the address is right, or they give you a new
      one, press the button. Nothing is deleted: the bounce stays on record, and so does your lift.</p>
      ${rows.length === 0
        ? h`<p class="help">No addresses are stopped.</p>`
        : h`<table><thead><tr><th>Address</th><th>Stopped</th><th>Code</th><th>The email</th><th></th></tr></thead>
          <tbody>${rows.map((r) => h`<tr>
            <td>${r.address}</td><td class="when">${stamp(r.at)}</td><td>${r.status}</td>
            <td>${r.subject ?? 'not recorded'}</td>
            <td><form method="post" action="/staff/email-addresses/lift" class="inline">
              <input type="hidden" name="address" value="${r.address}">
              <button class="linkish" type="submit">This address works again</button></form></td>
          </tr>`)}</tbody></table>`}
      <p><a href="/staff/settings">Back to your account</a></p>`,
  });
}

/** A role as a person reads it: a built-in role's own word, or the name the super admin gave a made one. */
function roleName(role: string): string {
  return customRoleOf(role)?.name ?? role;
}

/** PHASE 151j: the temporary password, shown ONCE, to be handed over by the super user. Never stored in clear. */
function temporaryPasswordPage(actor: Actor, name: string, email: string, role: string, password: string, until: string, isNew: boolean): string {
  return page({
    title: 'Temporary password', nav: nav(actor),
    body: h`
      <h1>${isNew ? `${name}’s account is ready` : `A new temporary password for ${name}`}</h1>
      <p>Give ${name} these sign-in details yourself — in person or by telephone, not by email.</p>
      <table><tbody>
        <tr><th>Username</th><td><code>${email}</code></td></tr>
        <tr><th>Temporary password</th><td><strong><code id="temporary-password">${password}</code></strong></td></tr>
        <tr><th>Role</th><td>${role}</td></tr>
        <tr><th>Works until</th><td>${localWhen(until)}</td></tr>
      </tbody></table>
      <div class="gate"><strong>This password is shown once.</strong> We do not keep it, so it cannot be shown again. If it
      is lost, give a new temporary password from the Users page.</div>
      <p class="help">When ${name} first signs in, they choose their own password${role === 'CLIENT' ? '' : ' and set up their second step: an authenticator app or an email code'}.</p>
      <p><a href="/staff/users">Back to users</a></p>`,
  });
}

/** UI TIDY PHASE 15: where Add a user lands — the form, opened. Home's "Add a person" card links here too. */
export const ADD_USER_HREF = '/staff/users?add=1#create-user';

/** UI TIDY PHASE 15: the counts over the users list. "Staff" leaves out client logins; turned off accounts count apart. */
export function userCounts(rows: readonly Pick<S.StaffRow, 'user' | 'working_periods'>[]): {
  staff: number; clients: number; off: number; no_hours: number;
} {
  const on = rows.filter((r) => !r.user.disabled);
  const staff = on.filter((r) => r.user.role !== 'CLIENT');
  return {
    staff: staff.length, clients: on.length - staff.length, off: rows.length - on.length,
    no_hours: staff.filter((r) => r.working_periods === 0).length,
  };
}

/**
 * UI TIDY PHASE 15 — USERS AND ROLES, 3 October 2026. Was 5,000 px: a block of six role buttons for every person, then
 * the create form. Now: a header with Make or change a role and Add a user, four boxes, and one table that stacks on a
 * phone — each person's name over their username, their role as a label, Active in green or Turned off in red, and their
 * actions: the three that were there, and Change role, folded in their own row, a list of the roles instead of six
 * buttons. Add a user is folded until its button, a link to it, or a refusal opens it. Nobody's own row offers a role.
 */
function usersPage(actor: Actor, rows: readonly S.StaffRow[], error: string | undefined,
  made: readonly { key: string; name: string }[] = [], adding = false): string {
  // PHASE 151b: the roles the super admin made are offered beside the built-in ones, by their own names.
  const staffOnly = made.map((m) => ({ value: m.key, label: m.name }));
  const all = [...APP_ROLES.map((r) => ({ value: r as string, label: r as string })), ...staffOnly];
  const n = userCounts(rows);
  return page({
    title: 'Users and roles', nav: nav(actor), wide: true,
    body: h`
      <div class="pagehead"><div><h1>Users and roles</h1>
        <p class="lede">Add a user, change a role, or turn an account off.</p></div>
        <p><a class="btn" href="/staff/admin/roles">Make or change a role</a> <a class="btn btn-primary" href="${ADD_USER_HREF}">Add a user</a></p></div>
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      ${kpiRow([
        { label: 'Staff', value: String(n.staff), tone: 'total' },
        { label: 'Client logins', value: String(n.clients), tone: 'plain' },
        { label: 'Turned off', value: String(n.off), tone: 'plain' },
        { label: 'Staff with no working hours', value: String(n.no_hours), tone: 'plain' },
      ])}
      <p class="help"><strong>You cannot change someone's name, username or photo.</strong> Only they can, from their
      own account. Changing a role signs that person out at once. They sign in again with the new role.</p>

      <div class="tablewrap"><table class="stack userlist"><thead><tr><th>Name</th><th>Role</th><th>Hours set</th><th>Photo</th><th>State</th><th></th></tr></thead>
      <tbody>${rows.map((r) => h`<tr>
        <td>${r.user.display_name}<br><span class="help">${r.user.email}</span></td>
        <td data-label="Role"><span class="badge b-info">${roleName(r.user.role)}</span></td>
        <td data-label="Hours set">${r.working_periods === 0 ? h`<span class="help">none</span>` : r.working_periods}</td>
        <td data-label="Photo">${r.has_photo ? 'yes' : 'no'}</td>
        <td data-label="State">${r.user.disabled ? h`<span class="badge b-late">Turned off</span>` : h`<span class="badge b-ok">Active</span>`}</td>
        <td>${r.user.disabled ? raw('') : h`
          <form method="post" action="/staff/users/${r.user.id}/disable" class="inline">
            <button class="linkish" type="submit">Disable</button></form>
          <form method="post" action="/staff/users/${r.user.id}/temporary-password" class="inline">
            <button class="linkish" type="submit">New temporary password</button></form>
          <form method="post" action="/staff/users/${r.user.id}/reset-two-factor" class="inline">
            <button class="linkish" type="submit">Reset second step</button></form>
          ${r.user.id === actor.id ? raw('') : h`<details class="formfold rolefold"><summary>Change role</summary>
            <form method="post" action="/staff/users/${r.user.id}/role">
              <label>New role for ${r.user.display_name} <select name="role">${all.map((role) => h`
                <option value="${role.value}"${role.value === r.user.role ? raw(' selected') : raw('')}>${role.label}</option>`)}</select></label>
              <button type="submit">Assign</button></form></details>`}`}</td>
      </tr>`)}</tbody></table></div>

      <details class="pblock recordlead" id="create-user"${adding ? raw(' open') : raw('')}><summary class="pnum">Add a user</summary>
      <form method="post" action="/staff/users/create">
        <label class="fl" for="new-user-email">Username — an email address</label>
        <input class="fi" id="new-user-email" name="email" required>
        <label class="fl" for="new-user-display-name">Display name</label>
        <input class="fi" id="new-user-display-name" name="display_name" required>
        <label class="fl" for="new-user-role">Role</label>
        <select class="fi" id="new-user-role" name="role"><option value="">choose a role</option>${all.map((role) => h`
          <option value="${role.value}">${role.label}</option>`)}</select>
        <label class="fl" for="new-user-business">Business — for a CLIENT account only</label>
        <input class="fi" id="new-user-business" name="business_id" placeholder="leave empty for a staff account">
        <button class="cta" type="submit">Create</button>
      </form>
      <p class="help">We make a temporary password for the new person and show it to you once. Give it to them
      yourself, not by email. It works for ${SI.TEMPORARY_PASSWORD_DAYS} days. When they first sign in, they choose their own
      password and set up their second step.</p></details>
      <p><a href="/staff/settings">Back to settings</a></p>`,
  });
}
