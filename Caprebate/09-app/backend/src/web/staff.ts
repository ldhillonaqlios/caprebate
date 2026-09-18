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
import type { App } from '../app.ts';
import { type Actor } from '../authz.ts';
import { changeOwnPassword, SESSION_COOKIE_NAME, AuthError } from '../auth.ts';
import { APP_ROLES } from '../roles.ts';
import { findById, hashToken } from '../users.ts';
import type { FsObjectStore } from './objectstore.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { staffShell, portalShell, opens, navContext } from './navigation.ts';
import { refillForm, typedValues } from './refill.ts';
import { badge, card, emptyState, welcomeCard, why } from './components.ts';
import { welcomeShown, dismissWelcome, WELCOME_JOBS } from './welcome.ts';
import { staffHelp } from './help.ts';
import { financeDashboard } from './invoices.ts';
import { assertFinanceSection } from './finance.ts';
import { BAND_WORDS } from './vat.ts';
import { assertSurveySection, surveyorJobs } from './surveyor.ts';
import { pipelineBoard, pipelineBoardGate } from './crm.ts';
import { assertLeadSection } from './leads.ts';
import { leadsList } from './lists.ts';
import * as S from './settings.ts';
import * as B from './backoffice.ts';
import { handleEngaged } from './engaged-pages.ts';
import { handleSurveyor } from './surveyor-pages.ts';
import { handleFinance } from './finance-pages.ts';
import { handleCrm } from './crm-pages.ts';
import { handlePipeline } from './pipeline-pages.ts';
import { handleTasks, myTasksBlock } from './tasks-pages.ts';
import { handleDocuments } from './documents-pages.ts';
import { handleIntroducers } from './introducers-pages.ts';
import { handleClaimRecord } from './claim-record-pages.ts';
import { handleCompliance } from './compliance-pages.ts';
import { handleDashboard } from './dashboard-pages.ts';
import { handleLists } from './lists-pages.ts';
import { handleConfiguration } from './configuration-pages.ts';
import * as T from './tasks.ts';
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
import { STUB_NOTICE } from '../stubs/email.ts';
import { AUDIT_OUTCOMES, AUDIT_PAGE_SIZE, auditLogView, type AuditLogView } from './audit-log.ts';

export type StaffDeps = {
  app: App;
  store: FsObjectStore;
  newId: () => string;
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
export function nav(actor: Actor): Safe {
  return staffShell(actor);
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
    const welcome = welcomeShown(db, actor) ? welcomeCard(WELCOME_JOBS[actor.role], '/staff/welcome/dismiss') : raw('');
    html(res, 200, homePage(actor, T.myWork(db, actor, now()), homeCards(d.app, actor), welcome)); return 'handled';
  }

  /* ------------------------------------------ PHASE 133c · the welcome card and Help */
  if (path === '/staff/welcome/dismiss' && method === 'POST') {
    dismissWelcome({ db, audit: d.app.audit, now }, actor);
    redirect(res, '/staff'); return 'handled';
  }
  if (path === '/staff/help' && method === 'GET') {
    const help = staffHelp(url.searchParams.get('screen') ?? 'B0');
    html(res, 200, page({ title: help.title, nav: nav(actor), wide: true, body: help.body })); return 'handled';
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
    html(res, 200, calendarPage(actor, cal, B.assignableStaffIfPermitted(db, actor)));
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
    const r = B.scheduleBooking(
      { db, audit: d.app.audit, email: d.app.email, now, newId: d.newId },
      actor,
      { booking_id: id, starts_at: starts, assigned_to: f.get('assigned_to') },
    );
    if (!r.ok) return problem(res, actor, 'Not scheduled', r.why, '/staff/calendar');
    redirect(res, `/staff/calendar?view=day&date=${isoDate(r.booking.starts_at ?? now())}`);
    return 'handled';
  }

  const oneBooking = /^\/staff\/calendar\/([A-Za-z0-9-]+)$/.exec(path);
  if (oneBooking && method === 'GET') {
    const id = oneBooking[1] ?? '';
    const bk = B.bookingById(db, actor, id);
    // THE SAME FUNCTION THE CALENDAR AND THE CLIENT'S OWN PICKER ASK. One
    // source of bookable time, reached from three places.
    const slots = staffSlots(db, now(), addLocalDays(startOfLocalDay(now()), HORIZON_DAYS), { now: now() });
    html(res, 200, bookingPage(actor, bk, B.bookingHistory(db, actor, id),
      B.assignableStaffIfPermitted(db, actor), slots));
    return 'handled';
  }

  /* ------------------------------ SECTION 3 · engaged clients (Phase 106) */
  const engaged = await handleEngaged(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (engaged === 'handled') return 'handled';

  /* ------------------------- SECTION 4 · the surveyor workspace (Phase 107) */
  const survey = await handleSurveyor(
    { app: d.app, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
  );
  if (survey === 'handled') return 'handled';

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
    { app: d.app, store: d.store, newId: d.newId, nav, stamp, problem }, req, res, url, method, actor, form,
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

  /* ------------------------------------------------ ADMIN ONLY · users */
  if (path === '/staff/users' && method === 'GET') {
    html(res, 200, usersPage(actor, S.staffList(db, actor), undefined)); return 'handled';
  }

  if (path === '/staff/users/create' && method === 'POST') {
    const f = await form(req);
    try {
      await S.createStaffUser(
        { db, audit: d.app.audit, now, hash: (p) => d.app.hasher.hash(p) },
        actor,
        {
          email: f.get('email') ?? '', display_name: f.get('display_name') ?? '',
          role: f.get('role') ?? '', password: f.get('password') ?? '',
          business_id: f.get('business_id'),
        },
      );
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not created', e.message, '/staff/users', e.field);
      throw e;
    }
    redirect(res, '/staff/users?done=created'); return 'handled';
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
    try {
      S.disableUser(d.app.deps, actor, disableMatch[1] ?? '');
    } catch (e) {
      if (e instanceof S.SettingsError) return problem(res, actor, 'Not disabled', e.message, '/staff/users');
      throw e;
    }
    redirect(res, '/staff/users?done=disabled'); return 'handled';
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

/**
 * THE LANDING PAGE — AND "MY TASKS" IS ON IT FOR EVERY STAFF ROLE (CRM 3 of 10).
 * What I own and what waits with my team, overdue first; for those who put
 * questions to clients, the ones past due; for a claim owner, the claims breaking
 * the one-next-action rule. Each list is built by src/web/tasks.ts through `can()`.
 */
/* ------------------------------------------------------------------ *
 * HOME — PHASE 133a: "WHAT DO I DO NEXT", PER LOGIN
 * ------------------------------------------------------------------ */

/**
 * THE CARDS AT THE TOP OF EACH LOGIN'S HOME. Each card is drawn only when its section's own gate lets the login in, and
 * each reads through the store function that section's screen reads — which authorises every row again. Nothing here
 * reads a figure a login's own screens do not already show it: Accounting's cards are the finance view's, the surveyor's
 * are its job list (which never carries our estimate), and no card on any home carries a claim's value.
 *
 * WHICH CARDS, PER LOGIN (the phase brief): Sales — my next actions, today's and overdue tasks, my pipeline by stage,
 * new leads; Accounting — invoices due and overdue, fees waiting to be invoiced, the VAT threshold position; Surveying —
 * claims waiting for review and sign; Admin — users, switches, recent audit events and anything refused; Read only —
 * the pipeline by stage and new leads. My tasks follows on every home, unchanged.
 */
function homeCards(app: App, actor: Actor): Safe {
  const db = app.db;
  const now = app.now();
  const out: Safe[] = [];
  const role = actor.role;

  if (role === 'ACCOUNTING') {
    if (opens(actor, assertFinanceSection)) {
      const f = financeDashboard(db, actor, now);
      const live = f.invoices.filter((v) => v.state.key !== 'CANCELLED' && v.money.outstanding_pence > 0);
      live.sort((x, y) => (x.money.overdue === y.money.overdue ? (x.due_on ?? '9999').localeCompare(y.due_on ?? '9999') : x.money.overdue ? -1 : 1));
      out.push(card('Invoices due and overdue', h`<div class="stat-row">
          <div><span class="lab">Outstanding</span><span class="stat">${f.totals.outstanding}</span></div>
          <div><span class="lab">Overdue</span><span class="stat${f.totals.overdue_count > 0 ? ' overdue' : ''}">${f.totals.overdue}</span>
            <span class="help">${f.totals.overdue_count} ${f.totals.overdue_count === 1 ? 'invoice' : 'invoices'}</span></div></div>
        ${f.totals.without_a_due_date === 0 ? raw('') : h`<p class="help">${f.totals.without_a_due_date} open ${f.totals.without_a_due_date === 1 ? 'invoice has' : 'invoices have'} no due date — never counted as overdue, and never as on time.</p>`}
        ${live.length === 0 ? emptyState('Nothing is waiting to be paid.') : h`<ul class="plain">${live.slice(0, 5).map((v) => h`<li>
          <a href="/staff/finance/${v.id}">${v.number ?? 'unnumbered'}</a> · ${v.client_name} · ${v.money.outstanding}
          ${v.money.overdue ? badge('Overdue', 'stop') : badge(v.due_shown, 'plain')}</li>`)}</ul>`}`, { href: '/staff/finance#claim-invoices' }));
      out.push(card('Fees waiting to be invoiced', f.expected.claims.length === 0
        ? emptyState('No claim is at the invoice stage without our fee raised.')
        : h`<ul class="plain">${f.expected.claims.slice(0, 5).map((e) => h`<li><a href="/staff/claims/${e.claim_id}">${e.claim_ref}</a> · ${e.client_name}
            <br><span class="help">expected ${e.expected} · earned ${e.expected_on ?? 'NO DATE'}</span></li>`)}</ul>
          <p><a class="btn" href="/staff/finance#to-invoice">Raise our fee in Finance</a></p>`, { count: f.expected.claims.length, href: '/staff/finance#to-invoice' }));
      const vat = f.vat;
      out.push(card('The VAT position', h`<div class="stat-row"><div><span class="lab">Rolling twelve months</span><span class="stat">${vat.rolling.turnover}</span></div>
          <div><span class="lab">Threshold</span><span class="stat">${vat.threshold?.shown ?? 'not set'}</span></div></div>
        <p>${badge(BAND_WORDS[vat.rolling.band], vat.rolling.band === 'BELOW' ? 'ok' : vat.rolling.band === 'CANNOT_SAY' ? 'warn' : 'stop')}
          <span class="help">${vat.rolling.from} to ${vat.rolling.to}</span></p>
        ${vat.warning === null ? raw('') : h`<p class="flag">${vat.warning}</p>`}`, { href: '/staff/finance#vat-monitoring' }));
    }
  }

  if (role === 'SURVEYING') {
    if (opens(actor, assertSurveySection)) {
      const jobs = surveyorJobs(db, actor);
      const waiting = jobs.filter((j) => j.state === 'SEALED');
      out.push(card('Waiting for your review and figures', waiting.length === 0 ? emptyState('No survey job is waiting for your figures.')
        : h`<ul class="plain">${waiting.map((j) => h`<li><a href="/staff/survey/${j.job_id}#figures">${j.business_name}</a> · ${j.stage_label}
            <br><span class="help">${j.rooms_counted} of ${j.rooms_total} room types counted</span></li>`)}</ul>`, { count: waiting.length, href: '/staff/survey' }));
      out.push(card('All your survey jobs', h`<p class="stat">${jobs.length}</p><p class="help">${jobs.length - waiting.length} with your figures committed.</p>
        <p><a class="btn" href="/staff/survey">Open the review queue</a></p>`, { href: '/staff/survey' }));
    }
  }

  if (role === 'SALES' || role === 'READ_ONLY') {
    if (role !== 'READ_ONLY') {
      const w = T.myWork(db, actor, now);
      out.push(card('My next actions', w.my_claims.length === 0 ? emptyState('You own no open claims yet.', { href: '/staff/claims', label: 'See all claims' })
        : h`<ul class="plain">${w.my_claims.slice(0, 6).map((c) => h`<li><a href="/staff/claims/${c.id}">${c.claim_ref}</a> · ${c.stage}
            ${c.overdue ? badge('Overdue', 'stop') : raw('')}<br><span class="help">${c.next_action}</span></li>`)}</ul>`, { count: w.my_claims.length }));
      out.push(card('Today and overdue', h`<div class="stat-row"><div><span class="lab">My open tasks</span><span class="stat">${w.tasks.length}</span></div>
          <div><span class="lab">Overdue</span><span class="stat${w.overdue > 0 ? ' overdue' : ''}">${w.overdue}</span></div>
          <div><span class="lab">Due today</span><span class="stat">${w.tasks.filter((t) => t.due.state === 'DUE_TODAY').length}</span></div></div>
        <p><a href="#my-tasks">See them below</a> · <a href="/staff/tasks">All my tasks</a></p>`));
    }
    if (opens(actor, pipelineBoardGate)) {
      const board = pipelineBoard(db, actor, now);
      const total = board.columns.reduce((n, c) => n + c.cards.length, 0);
      out.push(card(role === 'SALES' ? 'My pipeline by stage' : 'The pipeline by stage', h`<table class="compact"><tbody>${board.columns.map((c) => h`<tr>
          <td><a href="/staff/pipeline#stage-${c.key}">${c.label}</a></td><td class="num">${c.cards.length}</td></tr>`)}
          ${board.on_hold.length === 0 ? raw('') : h`<tr><td><a href="/staff/pipeline#on-hold">On hold</a></td><td class="num">${board.on_hold.length}</td></tr>`}</tbody></table>`,
        { count: `${total} open`, href: '/staff/pipeline' }));
    }
    if (opens(actor, assertLeadSection)) {
      const leads = leadsList(db, actor, { filters: {}, sort: 'newest' }).rows.filter((l) => l.claim === null).slice(0, 5);
      out.push(card('New leads', leads.length === 0 ? (role === 'READ_ONLY' ? emptyState('No leads yet.') : emptyState('No leads yet.', { href: '/staff/leads#record-lead', label: 'Record your first lead' }))
        : h`<ul class="plain">${leads.map((l) => h`<li><a href="/staff/leads/${l.id}">${l.organisation}</a> · ${l.source}
            <br><span class="help">${l.lead_date} · ${l.status.label}${l.owner === null ? ' · nobody owns it yet' : ` · ${l.owner}`}</span></li>`)}</ul>`, { href: '/staff/leads' }));
    }
  }

  if (role === 'ADMIN') {
    const staff = S.staffList(db, actor);
    const byRole = APP_ROLES.map((r) => ({ r, n: staff.filter((x) => x.user.role === r).length })).filter((x) => x.n > 0);
    out.push(card('Users', h`<table class="compact"><tbody>${byRole.map((x) => h`<tr><td>${x.r.replace('_', ' ').toLowerCase()}</td><td class="num">${x.n}</td></tr>`)}</tbody></table>
      <p><a class="btn" href="/staff/users">Users and roles</a></p>`, { count: staff.length, href: '/staff/users' }));
    out.push(card('Settings and switches', h`<ul class="quick">
      <li><a href="/staff/admin-settings">Admin settings — lists, reasons, finance and compliance values</a></li>
      <li><a href="/staff/document-types">Document types</a></li><li><a href="/staff/automation">Automation rules</a></li>
      <li><a href="/staff/templates">Email templates</a></li><li><a href="/staff/introducer-rewards">The reward model</a></li></ul>
      <p class="help">Some switches have no screen on purpose; the administrator guide lists them.</p>`));
    const log = auditLogView({ db, audit: app.audit, now: app.now }, actor, new URLSearchParams());
    const refused = log.lines.filter((l) => l.outcome === 'REFUSED');
    out.push(card('Recent audit events', h`<p>${log.chain.intact ? badge('Chain intact', 'ok') : badge('Chain BROKEN', 'stop')}</p>
      <table class="compact"><tbody>${log.lines.slice(0, 6).map((l) => h`<tr><td class="when">${l.at}</td><td>${l.kind}</td><td>${l.actor_role ?? ''}</td></tr>`)}</tbody></table>`,
      { href: '/staff/audit' }));
    out.push(card('Refused', refused.length === 0 ? emptyState(`Nothing refused in the last ${log.lines.length} events.`)
      : h`<table class="compact"><tbody>${refused.slice(0, 6).map((l) => h`<tr class="overdue"><td class="when">${l.at}</td><td>${l.kind}</td><td>${l.actor_role ?? ''}</td></tr>`)}</tbody></table>
        <p><a href="/staff/audit?outcome=REFUSED">Every refusal</a></p>`, { count: refused.length }));
  }

  return out.length === 0 ? raw('') : h`<div class="cards">${out}</div>`;
}

const HOME_WORDS: Readonly<Record<string, string>> = Object.freeze({
  SALES: 'Your next actions, your tasks, the pipeline and new leads.',
  ACCOUNTING: 'Invoices due and overdue, fees waiting to be invoiced, and the VAT position.',
  SURVEYING: 'The survey jobs waiting for your review and figures, and your tasks.',
  ADMIN: 'Users, settings and switches, and what the audit log has recorded.',
  READ_ONLY: 'The pipeline and new leads. This login can look, and cannot change anything.',
});

function homePage(actor: Actor, work: T.MyWork, cards: Safe = raw(''), welcome: Safe = raw('')): string {
  return page({
    title: 'Home', nav: nav(actor), wide: true,
    body: h`
      <div class="pagehead"><div><p class="eyebrow">Back office</p><h1>Home</h1>
      <p class="help">Signed in as ${actor.role.toLowerCase()}. ${HOME_WORDS[actor.role] ?? ''}</p></div></div>
      ${welcome}
      ${cards}
      <div id="my-tasks">${myTasksBlock(work)}</div>
      <div class="gate">Emails and calendar invitations are not sent yet. They wait in the outbox at the foot of
      <a href="/staff/settings">Settings</a>.${why(h`Outbound email and calendar invitations are stubbed in this build, and it is not hidden: both are
      written to the outbox and neither leaves the building. ${STUB_NOTICE}`)}</div>
      <div class="gate">Times are UK time.${why(h`Greenwich Mean Time in winter and British Summer Time in summer, and the change is handled
      for you. Times are stored in UTC and converted for display, so nothing needs adjusting in March or October.`)}</div>`,
  });
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
      <div class="${v.chain.intact ? 'gate' : 'flag'}"><strong>The hash chain:</strong> ${v.chain.says}</div>
      <p class="help">${v.never} The newest ${AUDIT_PAGE_SIZE} lines that match are shown, newest first. To verify the chain without
      the server, run <code>${v.command}</code> against the database file. Reading this page is itself a line in the log.</p>
      <form method="get" action="/staff/audit" class="pblock">
        <label>Kind
          <select name="kind"><option value="">any</option>${kinds}</select></label>
        <label>Outcome
          <select name="outcome"><option value="">any</option>${outcomes}</select></label>
        <button type="submit">Show</button> <a href="/staff/audit">Clear</a>
      </form>
      ${v.said.length === 0 ? raw('') : h`<ul>${v.said.map((x) => h`<li class="help">${x}</li>`)}</ul>`}
      ${v.lines.length === 0 ? h`<p class="help">No line matches.</p>` : h`<table>
        <thead><tr><th>#</th><th>When</th><th>Kind</th><th>Role</th><th>Who (id)</th><th>About</th><th>Outcome</th></tr></thead>
        <tbody>${v.lines.map((l) => h`<tr class="${l.outcome === 'REFUSED' ? 'overdue' : ''}"><td>${l.seq}</td><td class="when">${l.at}</td><td>${l.kind}</td>
          <td>${l.actor_role ?? h`<span class="help">no session</span>`}</td><td>${l.actor_id ?? '—'}</td>
          <td>${l.object_type ?? '—'} ${l.object_id ?? ''}</td><td>${AUDIT_OUTCOMES[l.outcome] ?? l.outcome}</td></tr>`)}</tbody></table>`}`,
  });
}

/* ------------------------------------------------- section 1 pages */

function contactCell(c: B.ContactView): Safe {
  return h`${c.label}${c.variant !== null ? h` (${c.variant})` : raw('')}
    ${c.entry_point !== null ? h`<br><span class="help">asked at ${c.entry_point.replace(/_/g, ' ')}</span>` : raw('')}`;
}

function assessmentsPage(actor: Actor, rows: readonly B.AssessmentRow[]): string {
  return page({
    title: 'Filled assessments', nav: nav(actor), wide: true,
    body: h`
      <h1>Filled assessments</h1>
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

      <div class="gate">${RANGE_QUALIFIER} The figure above is read from the one column the client's
      own screen reads, so the two views of it cannot differ.</div>
      <p><a href="/staff/assessments">Back to the list</a></p>`,
  });
}

/* ------------------------------------------------- section 2 pages */

function availabilityNote(a: B.CalendarView['availability']): Safe {
  if (a.available) {
    return h`<p class="help">${a.slots.length} free ${SLOT_MINUTES}-minute slots in this window,
      derived from working times. <strong>That is the only source there is.</strong></p>`;
  }
  return h`<div class="flag"><strong>No slots to offer.</strong> ${a.say}</div>`;
}

function calendarPage(
  actor: Actor, cal: B.CalendarView,
  staff: readonly { id: string; display_name: string }[],
): string {
  const otherView = cal.view === 'day' ? 'week' : 'day';
  const prev = addLocalDays(cal.from, cal.view === 'day' ? -1 : -7);
  const next = addLocalDays(cal.from, cal.view === 'day' ? 1 : 7);
  return page({
    title: 'Calendar', nav: nav(actor), wide: true,
    body: h`
      <h1>Calendar</h1>
      <p class="rung">${cal.view === 'day' ? 'Day' : 'Week'} · ${isoDate(cal.from)}
        ${cal.view === 'week' ? h` to ${isoDate(addLocalDays(cal.to, -1))}` : raw('')}</p>
      <p class="help">${zoneNotice(cal.from)}</p>
      <p>
        <a href="/staff/calendar?view=${cal.view}&amp;date=${isoDate(prev)}">← earlier</a> ·
        <a href="/staff/calendar?view=${cal.view}&amp;date=${isoDate(next)}">later →</a> ·
        <a href="/staff/calendar?view=${otherView}&amp;date=${isoDate(cal.from)}">show the ${otherView}</a>
      </p>

      ${availabilityNote(cal.availability)}

      ${cal.days.map((day) => h`
        <h3>${WEEKDAY_NAMES[localPartsOf(Date.parse(day.date)).weekday] ?? ''} ${isoDate(day.date)}</h3>
        ${day.bookings.length === 0
          ? h`<p class="help">Nothing booked.</p>`
          : h`<table><thead><tr><th>Time</th><th>Business</th><th>Channel</th><th>Assigned to</th><th></th></tr></thead>
            <tbody>${day.bookings.map((b) => h`<tr>
              <td>${b.starts_at === null ? '—' : localClock(b.starts_at)}</td>
              <td>${b.business_name}${b.cancelled_at !== null
                ? h` <strong>— cancelled</strong> <span class="help">by ${b.cancelled_by_name ?? 'unknown'}, ${stamp(b.cancelled_at)}</span>`
                : raw('')}</td>
              <td>${b.channel_label}</td>
              <td>${b.assigned_name ?? h`<span class="help">nobody</span>`}</td>
              <td><a href="/staff/calendar/${b.id}">open</a></td></tr>`)}</tbody></table>`}`)}

      <h3>Asked for a call, no time yet</h3>
      <p class="help">These came through the client's own journey and nobody re-entered them.
      Only the telephone books a moment — CB_BOOKING is the authority and the database refuses a
      time on any other channel.</p>
      ${cal.awaiting.length === 0
        ? h`<p class="help">Nothing outstanding.</p>`
        : h`<table><thead><tr><th>Business</th><th>Asked at</th><th>Since</th><th></th></tr></thead>
          <tbody>${cal.awaiting.map((b) => h`<tr>
            <td>${b.business_name}</td><td>${b.entry_point.replace(/_/g, ' ')}</td>
            <td class="when">${stamp(b.created_at)}</td>
            <td><a href="/staff/calendar/${b.id}">give it a time</a></td></tr>`)}</tbody></table>`}

      <h3>Cancelled calls</h3>
      <p class="help">Calls the client cancelled in their own portal, newest first. The time is kept
      for the record and is free for somebody else. <strong>The enquiry is still open</strong> —
      nothing about the lead, the claim or the organisation changed.</p>
      ${cal.cancelled.length === 0
        ? h`<p class="help">None.</p>`
        : h`<table><thead><tr><th>Business</th><th>Was booked for</th><th>Cancelled by</th><th>Cancelled at</th><th></th></tr></thead>
          <tbody>${cal.cancelled.map((b) => h`<tr>
            <td>${b.business_name}</td><td>${when(b.starts_at)}</td>
            <td>${b.cancelled_by_name ?? 'unknown'}${b.cancelled_by_role === 'CLIENT' ? ' (the client)' : ''}</td>
            <td class="when">${stamp(b.cancelled_at ?? '')}</td>
            <td><a href="/staff/calendar/${b.id}">open</a></td></tr>`)}</tbody></table>`}

      <h3>Asked for something that does not book a moment</h3>
      <p class="help">Email and text message capture and finish — CB_BOOKING's own words. They are
      here because these people are waiting to hear from us too, and they are kept apart from the
      list above so nobody goes looking for a slot that was never asked for.</p>
      ${cal.capture_only.length === 0
        ? h`<p class="help">None.</p>`
        : h`<table><thead><tr><th>Business</th><th>Channel</th><th>Asked at</th><th>Since</th></tr></thead>
          <tbody>${cal.capture_only.map((b) => h`<tr>
            <td>${b.business_name}</td><td>${b.channel_label}</td>
            <td>${b.entry_point.replace(/_/g, ' ')}</td>
            <td class="when">${stamp(b.created_at)}</td></tr>`)}</tbody></table>`}

      <div class="gate"><strong>Calendar invitations are stubbed.</strong> Scheduling a call writes
      a message to the outbox and nothing is sent to anybody. ${staff.length === 0
        ? 'No member of staff has working times set, so no slot can be offered anywhere in this system.'
        : `${staff.length} member(s) of staff have working times set.`}</div>`,
  });
}

function bookingPage(
  actor: Actor, b: B.BookingRow,
  history: readonly { from_starts_at: string | null; to_starts_at: string | null; changed_by_name: string | null; at: string; cancelled?: number }[],
  staff: readonly { id: string; display_name: string }[],
  slots: Availability,
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
        <tr><th>Asked at</th><td>${b.entry_point.replace(/_/g, ' ')}</td></tr>
        <tr><th>Requested</th><td class="when">${stamp(b.created_at)}</td></tr>
        <tr><th>Booked for</th><td>${when(b.starts_at)}</td></tr>
        <tr><th>Assigned to</th><td>${b.assigned_name ?? 'nobody'}</td></tr>
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
  const outbox = inBackOffice
    ? d.app.db.all<{ created_at: string; to_email: string; subject: string; kind: string; sent_at: string | null }>(
        'SELECT created_at, to_email, subject, kind, sent_at FROM outbox ORDER BY created_at DESC LIMIT 20')
    : [];
  return page({
    title: 'Settings', nav: inBackOffice ? nav(actor) : portalShell(actor),
    body: h`
      <h1>Settings</h1>
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
      <p class="help">Changing it signs this browser back in behind the scenes: a new session is
      issued and the old one is revoked, because what a session identifies is now reachable by a
      different name.</p>

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
      <p class="help">PNG only, up to ${Math.round(IMAGE_LIMITS.max_bytes / 1024 / 1024)} MB, stored at
      no more than ${IMAGE_LIMITS.max_stored_dimension} pixels on the long edge.
      <strong>Nothing you send is stored.</strong> The file is decoded to pixels and a new one is
      written from those pixels, so every text chunk, colour profile and anything appended after the
      end of the image is dropped by construction rather than by being stripped. That is why the
      list is PNG alone: this build re-encodes what it can decode honestly, and it will not store a
      file it has not rebuilt.</p>
      <form method="post" action="${base}/photo" enctype="application/octet-stream">
        <p class="help">Send the PNG as the body of a POST to <code>${base}/photo</code>.
        The browser form below posts the bytes directly.</p>
        <input class="fi" type="file" name="photo" accept="image/png">
        <button class="cta" type="submit">Upload</button>
      </form>
      ${p.photo === undefined ? raw('') : h`
        <form method="post" action="${base}/photo/remove">
          <button class="cta" type="submit">Remove the photograph</button>
        </form>
        <p class="help">Stored: ${p.photo.width}×${p.photo.height}, ${p.photo.byte_size} bytes,
        re-encoded from a ${p.photo.source_format.toUpperCase()} of ${p.photo.source_bytes} bytes
        on ${stamp(p.photo.updated_at)}.</p>`}

      ${inBackOffice ? h`<h3>Your working times</h3>
      <p class="help"><strong>These are the booking system's only input.</strong> A slot outside them
      is not offered anywhere — not on the calendar, and not on the client's own picker — and the
      write path asks these hours again at the moment of saving, so a posted time that never
      appeared on a screen is refused too.</p>
      <p class="help"><strong>These hours are YOUR LOCAL HOURS — UK time.</strong> Nine to five means
      nine to five in January and in July; the March and October changes are handled for you and you
      never need to re-enter them. What is stored against a booking is the exact moment in UTC, which
      is why a call arranged in June still reads correctly when it is looked at in December.</p>
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
        <p><a class="cta" href="/staff/users">Users and roles</a></p>` : raw('')}

      <h3>The outbox — what would have been sent</h3>
      <p class="help">${STUB_NOTICE} Calendar invitations go the same way, for the same reason.</p>
      ${outbox.length === 0
        ? h`<p class="help">Nothing in the outbox.</p>`
        : h`<table><thead><tr><th>When</th><th>Kind</th><th>Subject</th><th>Sent</th></tr></thead>
          <tbody>${outbox.map((m) => h`<tr><td class="when">${stamp(m.created_at)}</td><td>${m.kind}</td>
            <td>${m.subject}</td><td>${m.sent_at ?? 'NOT SENT'}</td></tr>`)}</tbody></table>`}`
      : h`<p><a href="/portal">Back to your claim</a></p>`}`,
  });
}

function usersPage(actor: Actor, rows: readonly S.StaffRow[], error: string | undefined): string {
  return page({
    title: 'Users and roles', nav: nav(actor), wide: true,
    body: h`
      <h1>Users and roles</h1>
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      <p class="help">Creating a user, changing a role and disabling an account are the whole of what
      administration is. <strong>An administrator cannot change somebody's name, username or
      photograph</strong> — that is inside their account rather than about it, and a record edited
      that way reads as the person themselves.</p>

      <table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Hours set</th><th>Photo</th><th>State</th><th></th></tr></thead>
      <tbody>${rows.map((r) => h`<tr>
        <td>${r.user.display_name}</td><td>${r.user.email}</td><td>${r.user.role}</td>
        <td>${r.working_periods === 0 ? h`<span class="help">none</span>` : r.working_periods}</td>
        <td>${r.has_photo ? 'yes' : 'no'}</td>
        <td>${r.user.disabled ? 'disabled' : 'active'}</td>
        <td>${r.user.disabled ? raw('') : h`
          <form method="post" action="/staff/users/${r.user.id}/disable" class="inline">
            <button class="linkish" type="submit">Disable</button></form>`}</td>
      </tr>`)}</tbody></table>

      <h3>Change somebody's role</h3>
      <p class="help">A role change is a privilege change: every session that user holds is revoked
      at once, and they sign in again under the new role.</p>
      ${rows.filter((r) => !r.user.disabled && r.user.id !== actor.id).map((r) => h`
        <form method="post" action="/staff/users/${r.user.id}/role">
          <label class="fl">${r.user.display_name} — currently ${r.user.role}</label>
          <div class="opts">${APP_ROLES.map((role) => h`
            <label class="opt"><input type="radio" name="role" value="${role}"${role === r.user.role ? raw(' checked') : raw('')}> ${role}</label>`)}</div>
          <button class="cta" type="submit">Assign</button>
        </form>`)}

      <h3>Create a user</h3>
      <form method="post" action="/staff/users/create">
        <label class="fl" for="new-user-email">Username — an email address</label>
        <input class="fi" id="new-user-email" name="email" required>
        <label class="fl" for="new-user-display-name">Display name</label>
        <input class="fi" id="new-user-display-name" name="display_name" required>
        <label class="fl">Role</label>
        <div class="opts">${APP_ROLES.map((role) => h`
          <label class="opt"><input type="radio" name="role" value="${role}"> ${role}</label>`)}</div>
        <label class="fl" for="new-user-business">Business — for a CLIENT account only</label>
        <input class="fi" id="new-user-business" name="business_id" placeholder="leave empty for a staff account">
        <label class="fl" for="new-user-password">Initial password — at least 12 characters</label>
        <input class="fi" id="new-user-password" type="password" name="password" autocomplete="new-password" required>
        <button class="cta" type="submit">Create</button>
      </form>
      <div class="gate">A welcome message would be stubbed like everything else that leaves the
      building, so the password is set here and handed over out of band rather than emailed to an
      address nothing can reach.</div>
      <p><a href="/staff/settings">Back to settings</a></p>`,
  });
}
