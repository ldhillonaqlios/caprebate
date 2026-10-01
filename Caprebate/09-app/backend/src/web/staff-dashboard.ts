/**
 * HOME AS A DASHBOARD — 1 October 2026.
 *
 * Lakhbir: "the users (both client and also works) home page should behave more like a dashboard … this needs to be
 * focused … for workers, it should be client driven whos a new lead (where did the lead come from) whats in the pipeline
 * at which stage, any new messages received, a calendar allowing users to block off time look what what they have booked
 * in the future, and below it should be activities for today if its a telephone call, teams call and if they need to
 * send any initial emails. which each of the section for contact there should be a CTA on each, if its a zoom call
 * clicking the CTA launches zoom and the same goes for email. Phone will be manual." And: "Admin should have a full
 * overview allowing them to click tabs across the top to see the sales dashboard and essentially only what someone in
 * sales see, same does for accounting and survayor, admin should then have a special tab which is admin".
 *
 * ONE PAGE, FOUR VIEWS — what each role sees; Admin sees every one, as tabs across the top (`?view=`):
 *   SALES       the figures at a glance · new leads (and where each came from) · new messages · the pipeline by stage ·
 *               the calendar · today's activities (calls and first emails, each with its button) · today and overdue ·
 *               leads' next actions
 *   ACCOUNTING  the figures at a glance · money · the calendar · today's activities · today and overdue
 *   SURVEYING   the figures at a glance · survey jobs · the calendar · today's activities · today and overdue
 *   ADMIN       (Admin only) who is working and when · the admin tiles
 * The view-only login sees the Sales view, with no buttons that change anything.
 *
 * THE BUTTONS: a video call's is "Start the Zoom call" (the host's page inside the site, src/web/video-calls.ts); a
 * first email's is "Write the first email" (the email page, filled in); a telephone call is made by hand, so its button
 * opens the call's page to note it, and the number is shown beside it.
 *
 * NOTHING HERE DECIDES WHO SEES WHAT: every list reads through the store its own screen reads, which asks `can()` on
 * each row. A view of another role's work for Admin is Admin's own permissions, drawn in that role's shape.
 */

import type { App } from '../app.ts';
import { can, type Actor } from '../authz.ts';
import { h, raw, type Safe } from './html.ts';
import { opens } from './navigation.ts';
import { assertLeadSection } from './leads.ts';
import { leadsList } from './lists.ts';
import { pipelineBoard, pipelineBoardGate, organisationList } from './crm.ts';
import { financeDashboard } from './invoices.ts';
import { assertFinanceSection } from './finance.ts';
import { assertSurveySection, surveyorJobs } from './surveyor.ts';
import { isLateNewLead } from './working-days.ts';
import { localClock, localDate, localPartsOf, localStamp, ukDate, WEEKDAY_NAMES } from './localtime.ts';
import { addLocalDays, startOfLocalDay, startOfLocalWeek } from './schedule.ts';
import * as B from './backoffice.ts';
import * as M from './messages.ts';
import { adminRow, jobsRow, leadsRows, moneyRow, pipelineRow, todayRow } from './home.ts';
import { blocksFor, mayBlockTime } from './time-blocks.ts';
import { newDot } from './client-layout.ts';
import { keysView } from './saved-keys.ts';

export type DashView = 'sales' | 'accounting' | 'surveying' | 'admin';

const VIEW_LABEL: Readonly<Record<DashView, string>> = { sales: 'Sales', accounting: 'Accounting', surveying: 'Surveyor', admin: 'Admin' };

/** The view this login is drawn: Admin chooses; everyone else sees their own role's. Null for a login with no dashboard. */
export function dashView(actor: Actor, asked: string | null): DashView | null {
  if (actor.role === 'ADMIN') return asked === 'accounting' || asked === 'surveying' || asked === 'admin' ? asked : 'sales';
  if (actor.role === 'SALES' || actor.role === 'READ_ONLY') return 'sales';
  if (actor.role === 'ACCOUNTING') return 'accounting';
  if (actor.role === 'SURVEYING') return 'surveying';
  return null;
}

/* ================================================================== *
 * PIECES
 * ================================================================== */

type Stat = { label: string; value: string; sub?: string; href: string; tone?: 'late' | 'ok' };

function strip(stats: readonly Stat[]): Safe {
  return h`<ul class="dash-strip" aria-label="At a glance">${stats.map((s) => h`<li class="dash-stat${s.tone === 'late' ? ' late' : s.tone === 'ok' ? ' ok' : ''}">
    <a href="${s.href}"><span class="dash-num">${s.value}</span><span class="dash-label">${s.label}</span>${s.sub === undefined ? raw('') : h`<span class="dash-sub">${s.sub}</span>`}</a></li>`)}</ul>`;
}

function card(id: string, title: string, body: Safe, extra: Safe = raw('')): Safe {
  return h`<section class="dash-card" id="${id}" aria-labelledby="${id}-h"><div class="dash-card-h"><h2 id="${id}-h">${title}</h2>${extra}</div>${body}</section>`;
}

/** The view's tabs, for Admin. */
function tabs(view: DashView): Safe {
  const order: DashView[] = ['sales', 'accounting', 'surveying', 'admin'];
  return h`<nav class="dash-tabs" aria-label="Whose dashboard">${order.map((v) => h`<a href="/staff?view=${v}" class="dash-tab"${v === view ? raw(' aria-current="page"') : raw('')}>${VIEW_LABEL[v]}</a>`)}</nav>`;
}

/* ------------------------------------------------------------------ the calls in a window */

export type CallItem = {
  readonly id: string; readonly at: string; readonly channel: string; readonly company: string; readonly mine: boolean;
  readonly who: string | null; readonly phone: string | null; readonly href: string; readonly cta: string; readonly cta_href: string;
};

/** The calls with a time in [from, to) that are this person's or nobody's yet — for a login that may read bookings. */
export function callsBetween(app: App, actor: Actor, fromIso: string, toIso: string): CallItem[] {
  if (!can(actor, 'booking.read', { type: 'booking', id: '__staff_section__', business_id: '__staff_section__' })) return [];
  const v = B.calendar(app.db, actor, { view: 'week', date: fromIso, now: app.now() });
  const rows = [...v.scheduled];
  // The window may run past the week the calendar drew (a fortnight ahead): ask again for the next one.
  if (toIso > v.to) rows.push(...B.calendar(app.db, actor, { view: 'week', date: v.to, now: app.now() }).scheduled);
  return rows
    .filter((b) => b.starts_at !== null && b.starts_at >= fromIso && b.starts_at < toIso && b.cancelled_at === null)
    .filter((b) => b.assigned_to === null || b.assigned_to === actor.id || actor.role === 'READ_ONLY')
    .map((b) => {
      const person = app.db.get<{ full_name: string; phone: string | null }>(
        "SELECT full_name, phone FROM contacts WHERE ((business_id IS NOT NULL AND business_id = ?) OR (lead_id IS NOT NULL AND lead_id = ?)) ORDER BY phone IS NULL OR trim(phone) = '', created_at LIMIT 1",
        [b.business_id ?? '', b.lead_id ?? '']);
      const video = b.channel === 'video';
      return {
        id: b.id, at: b.starts_at ?? '', channel: video ? 'Zoom call' : 'Telephone call', company: b.business_name, mine: b.assigned_to === actor.id,
        who: person?.full_name ?? null, phone: video ? null : (person?.phone ?? null), href: `/staff/calendar/${b.id}`,
        cta: video ? 'Start the Zoom call' : 'Open the call', cta_href: video ? `/staff/calendar/${b.id}/video` : `/staff/calendar/${b.id}`,
      };
    });
  // In time order already: the calendar reads them by start, and a second week only ever follows the first.
}

/* ------------------------------------------------------------------ first emails */

export type FirstEmail = { readonly lead_id: string; readonly company: string; readonly from: string; readonly late: boolean };

/** New leads nobody has written to yet: "if they need to send any initial emails". */
export function firstEmails(app: App, actor: Actor): FirstEmail[] {
  if (!opens(actor, assertLeadSection) || !can(actor, 'email.queue', { type: 'email', id: '__home__', business_id: '__home__' })) return [];
  const now = app.now();
  return leadsList(app.db, actor, { filters: {}, sort: 'age' }).rows
    .filter((l) => l.claim === null && l.status.key === 'NEW')
    .filter((l) => app.db.get(
      "SELECT 1 AS x FROM outbox o WHERE o.kind IN ('FREE_TYPED','TEMPLATE') AND (o.lead_id = ? OR o.business_id = (SELECT business_id FROM leads WHERE id = ?)) LIMIT 1",
      [l.id, l.id]) === undefined)
    .map((l) => ({ lead_id: l.id, company: l.organisation, from: l.source, late: isLateNewLead(l.lead_at, now) }));
}

function todayActivities(app: App, actor: Actor): Safe {
  const now = app.now();
  const from = startOfLocalDay(now);
  const calls = callsBetween(app, actor, from, addLocalDays(from, 1));
  const emails = firstEmails(app, actor);
  const writes = actor.role !== 'READ_ONLY';
  const items: Safe[] = [
    ...calls.map((c) => h`<li class="act act-${c.channel === 'Zoom call' ? 'video' : 'phone'}${c.at < now ? ' past' : ''}">
      <span class="act-when">${localClock(c.at)}</span>
      <span class="act-what"><span class="chip">${c.channel}</span> <a href="${c.href}">${c.company}</a>${c.who === null ? raw('') : h` · ${c.who}`}${
        c.phone === null ? raw('') : h` · <span class="act-phone">${c.phone}</span>`}${c.mine ? raw('') : h` <span class="help">· nobody has taken it yet</span>`}</span>
      ${writes ? h`<a class="${c.channel === 'Zoom call' ? 'cta' : 'btn'} act-cta" href="${c.cta_href}">${c.cta}</a>` : raw('')}</li>`),
    ...emails.map((e) => h`<li class="act act-email${e.late ? ' late' : ''}">
      <span class="act-when">Email</span>
      <span class="act-what"><span class="chip">First email</span> <a href="/staff/leads/${e.lead_id}">${e.company}</a> · from ${e.from}${e.late ? h` <span class="help">· waiting too long</span>` : raw('')}</span>
      ${writes ? h`<a class="cta act-cta" href="/staff/leads/${e.lead_id}/email">Write the first email</a>` : raw('')}</li>`),
  ];
  const body = items.length === 0
    ? h`<p class="empty">No calls today, and no first emails waiting.</p>`
    : h`<ol class="acts">${items}</ol><p class="help">A telephone call is made by hand: ring the number, then open the call to note how it went.</p>`;
  const p = localPartsOf(Date.parse(now));
  return card('today-activities', 'Today’s activities', body, h`<span class="help">${WEEKDAY_NAMES[p.weekday] ?? ''} ${ukDate(localDate(now))}</span>`);
}

/* ------------------------------------------------------------------ the calendar */

function weekStart(asked: string | null, nowIso: string): string {
  const ok = asked !== null && /^\d{4}-\d{2}-\d{2}$/.test(asked) && Number.isFinite(Date.parse(`${asked}T12:00:00Z`));
  return startOfLocalWeek(ok ? `${asked}T12:00:00.000Z` : nowIso);
}

function calendarCard(app: App, actor: Actor, view: DashView, asked: string | null, done: string | null): Safe {
  const now = app.now();
  const from = weekStart(asked, now);
  const to = addLocalDays(from, 7);
  const calls = callsBetween(app, actor, from, to);
  const blocks = blocksFor(app.db, actor.id, from, to);
  const today = localDate(now);
  const days = Array.from({ length: 7 }, (_, i) => addLocalDays(from, i));
  const prev = localDate(addLocalDays(from, -7));
  const next = localDate(addLocalDays(from, 7));
  const viewQ = actor.role === 'ADMIN' ? `view=${view}&` : '';
  const back = `/staff?${viewQ}week=${localDate(from)}#calendar`;
  const grid = h`<ol class="wk">${days.map((d) => {
    const end = addLocalDays(d, 1);
    const date = localDate(d);
    const p = localPartsOf(Date.parse(d));
    const dayCalls = calls.filter((c) => c.at >= d && c.at < end);
    const dayBlocks = blocks.filter((b) => b.starts_at < end && b.ends_at > d);
    return h`<li class="wk-day${date === today ? ' today' : ''}${date < today ? ' past' : ''}"${date === today ? raw(' aria-current="date"') : raw('')}>
      <p class="wk-h"><span>${WEEKDAY_NAMES[p.weekday]?.slice(0, 3) ?? ''}</span> ${String(p.day)}</p>
      ${dayCalls.length === 0 && dayBlocks.length === 0 ? h`<p class="wk-free">Free</p>` : raw('')}
      <ul class="wk-items">${dayCalls.map((c) => h`<li class="wk-call"><a href="${c.href}"><strong>${localClock(c.at)}</strong> ${c.channel === 'Zoom call' ? 'Zoom' : 'Phone'} · ${c.company}</a></li>`)}${
        dayBlocks.map((b) => h`<li class="wk-block"><strong>${b.starts_at < d ? 'All day' : localClock(b.starts_at)}${b.ends_at > end ? '' : `–${localClock(b.ends_at)}`}</strong> Blocked${b.reason === '' ? '' : ` · ${b.reason}`}
          ${b.ends_at > now ? h`<form method="post" action="/staff/time-blocks/${b.id}/remove" class="inline"><input type="hidden" name="back" value="${back}"><button class="linkish" type="submit">Free it</button></form>` : raw('')}</li>`)}</ul></li>`;
  })}</ol>`;
  const form = mayBlockTime(actor) ? h`<details class="wk-add"${done === 'blocked' || done === 'block-refused' ? raw(' open') : raw('')}><summary>Block off time</summary>
    <form method="post" action="/staff/time-blocks" class="wk-form">
      <input type="hidden" name="back" value="${back}">
      <label class="fl" for="tb-date">Day</label><input class="fi" id="tb-date" name="date" type="date" required value="${date10(asked, today)}">
      <label class="fl" for="tb-from">From</label><input class="fi" id="tb-from" name="from" type="time" required value="09:00">
      <label class="fl" for="tb-to">Until</label><input class="fi" id="tb-to" name="to" type="time" required value="17:00">
      <label class="fl" for="tb-until">Last day, for more than one day <span class="help">(you do not have to)</span></label><input class="fi" id="tb-until" name="until_date" type="date">
      <label class="fl" for="tb-reason">What for <span class="help">(only staff see it; you do not have to)</span></label><input class="fi" id="tb-reason" name="reason" maxlength="120">
      <button class="cta" type="submit">Block it off</button>
      <p class="help">Nobody can book you a call in time you have blocked — not the client’s booking page, and not a colleague.</p>
    </form></details>` : raw('');
  return card('calendar', 'Your calendar', h`${done === 'blocked' ? h`<p class="saved" role="status">Blocked off. Nobody can book you a call then.</p>` : raw('')}${
    done === 'freed' ? h`<p class="saved" role="status">Freed. That time can be booked again.</p>` : raw('')}${grid}${form}`,
  h`<span class="wk-nav"><a href="/staff?${viewQ}week=${prev}#calendar">Last week</a> · <a href="${actor.role === 'ADMIN' ? `/staff?view=${view}` : '/staff'}#calendar">This week</a> · <a href="/staff?${viewQ}week=${next}#calendar">Next week</a></span>`);
}

function date10(asked: string | null, today: string): string {
  return asked !== null && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= today ? asked : today;
}

/* ------------------------------------------------------------------ new messages */

function messagesCard(app: App, actor: Actor): Safe | null {
  if (!can(actor, 'client_message.read', { type: 'client_message', id: '__home__', business_id: '__home__' })) return null;
  const fresh = organisationList(app.db, actor)
    .map((o) => ({ id: o.id, name: o.trading_name, n: M.newFromClient(app.db, actor, o.id) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return card('new-messages', 'New messages', fresh.length === 0 ? h`<p class="empty">Nothing new from a client.</p>`
    : h`<ul class="dash-list">${fresh.map((x) => h`<li><a href="/staff/clients/${x.id}?chat=all#chat">${x.name}</a>${newDot(x.n)}
        <a class="btn act-cta" href="/staff/clients/${x.id}?chat=all#chat">Read and reply</a></li>`)}</ul>`);
}

/* ------------------------------------------------------------------ who is working (Admin) */

export type WorkingRow = { readonly name: string; readonly role: string; readonly now: boolean; readonly first: string | null; readonly last: string | null };

/** Every member of staff who can sign in: working now (seen in the last 30 minutes), and today's first and last moments. */
export function staffWorking(app: App, actor: Actor): WorkingRow[] {
  if (actor.role !== 'ADMIN') return [];
  const now = app.now();
  const dayStart = startOfLocalDay(now);
  const recent = new Date(Date.parse(now) - 30 * 60_000).toISOString();
  return app.db.all<{ display_name: string; role: string; first: string | null; last: string | null; live: number }>(
    'SELECT u.display_name, u.role, ' +
    '(SELECT min(s.created_at) FROM sessions s WHERE s.user_id = u.id AND s.last_seen_at >= ?) AS first, ' +
    '(SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id AND s.last_seen_at >= ?) AS last, ' +
    '(SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > ? AND s.last_seen_at >= ?) AS live ' +
    "FROM users u WHERE u.disabled_at IS NULL AND u.role <> 'CLIENT' ORDER BY u.display_name",
    [dayStart, dayStart, now, recent])
    .map((r) => ({ name: r.display_name, role: r.role, now: r.live > 0, first: r.first === null ? null : (r.first < dayStart ? dayStart : r.first), last: r.last }));
}

/** People who can sign in, and those archived: Admin's tools for each, on the Admin tab. */
function peopleCard(app: App, actor: Actor): Safe {
  const people = app.db.all<{ id: string; display_name: string; role: string; disabled_at: string | null; last: string | null }>(
    "SELECT u.id, u.display_name, u.role, u.disabled_at, (SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last FROM users u WHERE u.role <> 'CLIENT' ORDER BY u.display_name");
  const now = app.now();
  const active = people.filter((p) => p.disabled_at === null);
  const archived = people.filter((p) => p.disabled_at !== null);
  const back = h`<input type="hidden" name="back" value="/staff?view=admin">`;
  return card('people', 'People', h`<table class="stack dash-table"><thead><tr><th>Who</th><th>Role</th><th>Last signed in</th><th>Do</th></tr></thead><tbody>${
    active.map((p) => h`<tr><td data-label="Who">${p.display_name}</td><td data-label="Role">${p.role.replace(/_/g, ' ').toLowerCase()}</td>
      <td data-label="Last signed in">${p.last === null ? h`<span class="help">Never</span>` : localStamp(p.last, now)}</td>
      <td data-label="Do"><form method="post" action="/staff/users/${p.id}/temporary-password" class="inline"><button class="linkish" type="submit">Reset password</button></form>${
        p.id === actor.id ? raw('') : h` · <form method="post" action="/staff/users/${p.id}/disable" class="inline">${back}<button class="linkish" type="submit">Archive</button></form>`}</td></tr>`)}</tbody></table>
    <p><a class="cta" href="/staff/users#create-user">Add a person</a> <a href="/staff/users">Roles and second steps</a></p>
    <p class="help">Reset password makes a temporary one, shown to you once, and signs them out. Archive stops them signing in at once; what they did stays.</p>
    ${archived.length === 0 ? raw('') : h`<details><summary>Archived (${String(archived.length)})</summary><ul class="dash-list">${archived.map((p) => h`<li>${p.display_name} <span class="help">· ${p.role.replace(/_/g, ' ').toLowerCase()} · archived ${localStamp(p.disabled_at ?? '', now)}</span></li>`)}</ul></details>`}`);
}

const FROM_WORDS: Readonly<Record<string, string>> = { SAVED: 'Saved here', FILE: 'From the key file or the website’s settings', NOT_SET: 'Not set', UNREADABLE: 'Saved here, but this server cannot open it' };
/** 1 Oct 2026, Lakhbir: "not set = red, active = green, set but not active = amber". Colour is never the only sign. */
const STATE_CHIP: Readonly<Record<string, { cls: string; words: string }>> = {
  ACTIVE: { cls: 'key-on', words: 'In use' },
  SET_OFF: { cls: 'key-idle', words: 'Set, not in use' },
  NOT_SET: { cls: 'key-off', words: 'Not set' },
};

/** Every key Admin may change: where each comes from, and a box to save a new one. Never a value. */
function keysCard(app: App, actor: Actor, done: string | null): Safe {
  const v = keysView(app, actor);
  return card('keys', 'API keys', h`${done === 'key-saved' ? h`<p class="saved" role="status">Saved and locked. It is in use from now on.</p>` : raw('')}${
    done === 'key-unsaved' ? h`<p class="saved" role="status">Taken off. The key file’s value, or the website’s setting, is in use again.</p>` : raw('')}
    ${v.why_not === null ? raw('') : h`<div class="gate" role="note">${v.why_not}</div>`}
    <p class="help">A key you save is locked before it is stored, and is never shown again — here or anywhere. To save one, type the password you sign in to this site with (not the key’s own password).</p>
    <ul class="dash-list keylist">${v.rows.map((r) => h`<li id="key-${r.name}"><details><summary><code>${r.name}</code> <span class="chip ${STATE_CHIP[r.state]?.cls ?? ''}">${STATE_CHIP[r.state]?.words ?? r.state}</span></summary>
      <p class="help">${r.what}. ${r.from === 'NOT_SET' ? 'Not set anywhere.' : `${FROM_WORDS[r.from] ?? r.from}${r.saved === null ? '' : `, ${r.saved}`}.`}</p>
      ${r.why_off === null ? raw('') : h`<p class="help key-why">Why it is not in use: ${r.why_off}</p>`}
      ${!v.can_save ? raw('') : h`<form method="post" action="/staff/keys/${r.name}" class="keyform">
        <div><label class="fl" for="kv-${r.name}">New value for ${r.name}</label><input class="fi" id="kv-${r.name}" name="value" type="${r.secret ? 'password' : 'text'}" autocomplete="off" required maxlength="4096"></div>
        <div><label class="fl" for="kp-${r.name}">The password you sign in to this site with</label><input class="fi" id="kp-${r.name}" name="password" type="password" autocomplete="current-password" required></div>
        <button class="cta" type="submit">Save it</button></form>`}
      ${r.from !== 'SAVED' && r.from !== 'UNREADABLE' ? raw('') : h`<form method="post" action="/staff/keys/${r.name}/unsave" class="keyform">
        <div><label class="fl" for="ku-${r.name}">The password you sign in to this site with</label><input class="fi" id="ku-${r.name}" name="password" type="password" autocomplete="current-password" required></div>
        <button class="btn-quiet" type="submit">Use the key file’s value again</button></form>`}</details></li>`)}</ul>`);
}

function adminView(app: App, actor: Actor, done: string | null = null): Safe[] {
  const rows = staffWorking(app, actor);
  const working = rows.filter((r) => r.now).length;
  const today = rows.filter((r) => r.last !== null).length;
  const table = rows.length === 0 ? h`<p class="empty">Nobody yet.</p>` : h`<table class="stack dash-table"><thead><tr><th>Who</th><th>Role</th><th>Now</th><th>Today</th></tr></thead><tbody>${
    rows.map((r) => h`<tr><td data-label="Who">${r.name}</td><td data-label="Role">${r.role.replace(/_/g, ' ').toLowerCase()}</td>
      <td data-label="Now">${r.now ? h`<span class="chip chip-ok">Working</span>` : h`<span class="help">Away</span>`}</td>
      <td data-label="Today">${r.first === null || r.last === null ? h`<span class="help">Not signed in today</span>` : `${localClock(r.first)} to ${localClock(r.last)}`}</td></tr>`)}</tbody></table>`;
  return [
    strip([
      { label: 'working now', value: String(working), href: '#staff-working', ...(working > 0 ? { tone: 'ok' as const } : {}) },
      { label: 'signed in today', value: String(today), sub: `of ${rows.length} staff`, href: '#staff-working' },
    ]),
    card('staff-working', 'Who is working', h`${table}<p class="help">Working now means seen in the last 30 minutes. Times are from their sign-ins today.</p>`),
    ...(done === 'archived' ? [h`<p class="saved" role="status">Archived. They cannot sign in, and what they did stays.</p>`] : []),
    peopleCard(app, actor),
    keysCard(app, actor, done),
    ...adminRow(actor, app),
  ];
}

/* ================================================================== *
 * THE PAGE BODY
 * ================================================================== */

export function dashboard(app: App, actor: Actor, view: DashView, q: { week: string | null; done: string | null }): Safe {
  const now = app.now();
  const parts: Safe[] = [];
  if (view === 'admin') {
    parts.push(...adminView(app, actor, q.done));
  } else if (view === 'sales') {
    const leads = opens(actor, assertLeadSection)
      ? leadsList(app.db, actor, { filters: {}, sort: 'age' }).rows.filter((l) => l.claim === null && l.status.key === 'NEW') : [];
    const late = leads.filter((l) => isLateNewLead(l.lead_at, now)).length;
    const board = opens(actor, pipelineBoardGate) ? pipelineBoard(app.db, actor, now) : null;
    const inPipe = board === null ? 0 : board.columns.reduce((n, c) => n + c.cards.length, 0);
    const msgs = can(actor, 'client_message.read', { type: 'client_message', id: '__home__', business_id: '__home__' })
      ? organisationList(app.db, actor).reduce((n, o) => n + M.newFromClient(app.db, actor, o.id), 0) : 0;
    const from = startOfLocalDay(now);
    const calls = callsBetween(app, actor, from, addLocalDays(from, 1)).length;
    parts.push(strip([
      { label: leads.length === 1 ? 'new lead' : 'new leads', value: String(leads.length), ...(late > 0 ? { sub: `${late} waiting too long`, tone: 'late' as const } : {}), href: '#row-new-leads' },
      { label: msgs === 1 ? 'new message' : 'new messages', value: String(msgs), href: '#new-messages', ...(msgs > 0 ? { tone: 'late' as const } : {}) },
      { label: calls === 1 ? 'call today' : 'calls today', value: String(calls), href: '#today-activities' },
      { label: inPipe === 1 ? 'claim in the pipeline' : 'claims in the pipeline', value: String(inPipe), href: '#row-pipeline' },
    ]));
    const [newLeads, nextActions] = leadsRows(actor, app, now);
    const msgCard = messagesCard(app, actor);
    parts.push(h`<div class="dash-grid">${newLeads ?? raw('')}${msgCard ?? raw('')}</div>`);
    parts.push(...pipelineRow(actor, app, now));
    parts.push(calendarCard(app, actor, view, q.week, q.done));
    parts.push(todayActivities(app, actor), todayRow(actor, app, now));
    if (nextActions !== undefined) parts.push(nextActions);
  } else if (view === 'accounting') {
    if (opens(actor, assertFinanceSection)) {
      const f = financeDashboard(app.db, actor, now);
      parts.push(strip([
        { label: 'not yet paid', value: f.totals.outstanding, href: '/staff/finance#claim-invoices' },
        { label: f.totals.overdue_count === 1 ? 'invoice late' : 'invoices late', value: String(f.totals.overdue_count), href: '/staff/finance#claim-invoices', ...(f.totals.overdue_count > 0 ? { tone: 'late' as const } : {}) },
        { label: f.expected.claims.length === 1 ? 'claim ready for our fee' : 'claims ready for our fee', value: String(f.expected.claims.length), href: '/staff/finance#to-invoice' },
      ]));
    }
    parts.push(...moneyRow(actor, app, now), calendarCard(app, actor, view, q.week, q.done), todayActivities(app, actor), todayRow(actor, app, now));
  } else {
    if (opens(actor, assertSurveySection)) {
      const jobs = surveyorJobs(app.db, actor);
      const waiting = jobs.filter((j) => j.state === 'SEALED').length;
      parts.push(strip([
        { label: waiting === 1 ? 'job waiting for your figures' : 'jobs waiting for your figures', value: String(waiting), href: '/staff/survey', ...(waiting > 0 ? { tone: 'late' as const } : {}) },
        { label: jobs.length === 1 ? 'survey job' : 'survey jobs', value: String(jobs.length), href: '/staff/survey' },
      ]));
    }
    parts.push(...jobsRow(actor, app), calendarCard(app, actor, view, q.week, q.done), todayActivities(app, actor), todayRow(actor, app, now));
  }
  return h`${actor.role === 'ADMIN' ? tabs(view) : raw('')}${parts}`;
}
