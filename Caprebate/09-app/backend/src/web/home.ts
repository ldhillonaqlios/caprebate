/**
 * HOME AS TILES — PHASE 136, 21 September 2026.
 *
 * Lakhbir, 18 September 2026: "tiles over heavy text, especially on the menu page. The menu page should flow: new leads,
 * existing leads' next actions, today and overdue, pipeline by stage." This file draws exactly that, as rows of tiles:
 *
 *   Sales, Admin, Read only   1 New leads · 2 Existing leads — next actions · 3 Today and overdue · 4 Pipeline by stage
 *   Admin, then               5 Users, Switches, Audit log, Refused sign-ins
 *   Accounting                the three money tiles, then Today and overdue
 *   Surveying                 the two job tiles, then Today and overdue
 *
 * The dashboard's figures are behind the "Reports" tile (/staff/reports), which ends the pipeline row, or the money or
 * job row, for every login the dashboard's own gate admits.
 *
 * NOTHING HERE DECIDES WHO SEES WHAT. Every row reads through the store function its own screen reads — the leads list,
 * the pipeline board, the finance view, the survey jobs, the audit log — each of which asks `can()` on every row. A row
 * whose section refuses the login is not drawn; a row the login may see but that has nothing in it says so in one line,
 * so empty is never mistaken for broken. No tile carries a claim's value, and no tile carries more than three lines.
 */

import type { App } from '../app.ts';
import { can, type Actor } from '../authz.ts';
import { openEnquiries } from './enquiries.ts';
import { h, raw, type Safe } from './html.ts';
import { opens } from './navigation.ts';
import { assertDashboard } from './dashboard.ts';
import { assertLeadSection } from './leads.ts';
import { leadsList, type LeadListRow } from './lists.ts';
import { pipelineBoard, pipelineBoardGate } from './crm.ts';
import { financeDashboard } from './invoices.ts';
import { assertFinanceSection } from './finance.ts';
import { assertSurveySection, surveyorJobs } from './surveyor.ts';
import { auditLogView } from './audit-log.ts';
import { isLateNewLead, waitedWords, workingDaysSince } from './working-days.ts';
import * as T from './tasks.ts';
import * as M from './messages.ts';
import * as IE from './inbound-email.ts';
import * as S from './settings.ts';
import { STAGE_GROUPS } from './look.ts';

/** One tile: a name and at most two more lines. `late` draws it red. */
export type HomeTile = {
  readonly href: string;
  readonly name: string;
  readonly lines: readonly string[];
  readonly late?: boolean;
  /** A count tile: the number is the name, drawn large. */
  readonly count?: boolean;
};

/** Most tiles a row draws before its last tile becomes "See all". */
export const ROW_LIMIT = 12;

/**
 * Text on a tile, whitespace collapsed and NEVER CUT (29 September 2026, Lakhbir: "too many texts have been cut off").
 * Until then every tile's text stopped at 48 characters with "…", so a next action read "Confirm who owns the
 * building, and that we…". A tile now wraps its whole text; the grid gives every tile in a row the same height.
 */
export function short(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ================================================================== *
 * WORKING DAYS — a new lead turns red once it has waited more than one.
 * PHASE 137: the rule moved to src/web/working-days.ts, which knows the
 * England and Wales bank holidays, so Home and Leads read one function.
 * ================================================================== */

export { workingDaysSince, waitedWords } from './working-days.ts';

/* ================================================================== *
 * DRAWING
 * ================================================================== */

function tile(t: HomeTile): Safe {
  const cls = `tile hometile${t.late === true ? ' late' : ''}${t.count === true ? ' counttile' : ''}`;
  return h`<li class="${cls}"><a class="tilelink" href="${t.href}">${t.count === true
    ? h`<span class="tilecount">${t.name}</span>` : h`<span class="tilename">${t.name}</span>`}${
    t.lines.slice(0, 2).map((l, i) => h`<span class="tileline${i === t.lines.length - 1 && t.late === true ? ' when' : ''}">${l}</span>`)}</a></li>`;
}

/** A row: its heading, then its tiles — or one line saying it is empty. */
export function homeRow(
  id: string, title: string, tiles: readonly HomeTile[], empty: string, more?: { href: string; total: number }, listClass = '',
): Safe {
  const shown = more !== undefined && more.total > tiles.length
    ? [...tiles, { href: more.href, name: 'See all', lines: [`${more.total} in all`] }]
    : tiles;
  return h`<section class="homerow" aria-labelledby="row-${id}"><h2 id="row-${id}">${title}</h2>${
    shown.length === 0 ? h`<p class="empty">${empty}</p>` : h`<ul class="tiles hometiles${listClass === '' ? '' : ` ${listClass}`}">${shown.map(tile)}</ul>`}</section>`;
}

function capped(tiles: readonly HomeTile[], href: string): { tiles: readonly HomeTile[]; more?: { href: string; total: number } } {
  return tiles.length <= ROW_LIMIT ? { tiles } : { tiles: tiles.slice(0, ROW_LIMIT - 1), more: { href, total: tiles.length } };
}

/* ================================================================== *
 * THE ROWS
 * ================================================================== */

/** In progress: a lead somebody has contacted that is not yet a claim, and not lost. */
const IN_PROGRESS = new Set(['CONTACTED', 'QUALIFIED', 'NURTURE']);

export function leadsRows(actor: Actor, app: App, nowIso: string): Safe[] {
  if (!opens(actor, assertLeadSection)) return [];
  const rows = leadsList(app.db, actor, { filters: {}, sort: 'age' }).rows.filter((l) => l.claim === null);
  const fresh = rows.filter((l) => l.status.key === 'NEW');
  // PHASE 137: an unanswered website enquiry is in the Leads page's New section, so it is here too — for the logins that
  // may handle enquiries only — and Home and Leads count, order and colour New the same way.
  const enquiries = can(actor, 'lead.write', { type: 'lead', id: '__website_enquiries__', business_id: null })
    ? openEnquiries({ db: app.db, audit: app.audit, now: app.now, newId: () => '' }, actor) : [];
  const waiting = [
    ...fresh.map((l) => ({ at: l.lead_at, id: l.id, href: `/staff/leads/${l.id}`, name: l.organisation, from: `From ${short(l.source)}` })),
    ...enquiries.map((e) => ({ at: e.created_at, id: e.id, href: `/staff/leads#enquiry-${e.id}`, name: e.firm ?? e.full_name, from: 'From the website form' })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const freshTiles: HomeTile[] = waiting.map((w) => ({
    href: w.href, name: short(w.name), lines: [w.from, waitedWords(workingDaysSince(w.at, nowIso))], late: isLateNewLead(w.at, nowIso),
  }));
  const lateCount = freshTiles.filter((t) => t.late === true).length;
  const countTile: HomeTile = {
    href: '/staff/leads#leads-new', name: String(waiting.length), count: true, late: lateCount > 0,
    lines: [waiting.length === 1 ? 'new lead' : 'new leads', ...(lateCount > 0 ? [`${lateCount} waiting too long`] : [])],
  };
  const a = capped(freshTiles, '/staff/leads#leads-new');
  const newRow = homeRow('new-leads', 'New leads', waiting.length === 0 ? [] : [countTile, ...a.tiles], 'No new leads.', a.more);

  const going = rows.filter((l) => IN_PROGRESS.has(l.status.key))
    .sort((x, y) => (x.next_action_due ?? '9999-99-99').localeCompare(y.next_action_due ?? '9999-99-99'));
  const goingTiles: HomeTile[] = going.map((l: LeadListRow) => {
    const due = T.dueReading(l.next_action_due, nowIso);
    return {
      href: `/staff/leads/${l.id}`, name: short(l.organisation),
      lines: l.next_action === null ? ['No next step yet — add one'] : [`Next: ${short(l.next_action)}`, due.state === 'NO_DUE_DATE' ? 'No due date' : due.label],
      late: due.overdue || l.next_action === null,
    };
  });
  const b = capped(goingTiles, '/staff/leads?sort=next_action');
  // ONE PLACE FOR "WHAT NEXT" (Phase 135, carried): the claims with no next step are Tasks' own view — linked, not repeated.
  const claimsLink: HomeTile[] = opens(actor, T.nextActionsGate)
    ? [{ href: '/staff/next-actions', name: 'Claims with no next step', lines: ['Open the list in Tasks'] }] : [];
  const nextRow = homeRow('next-actions', 'Existing leads — next actions', goingTiles.length === 0 ? [] : [...b.tiles, ...claimsLink],
    'No leads in progress.', b.more);
  // An empty lead list still offers the claims link, beneath the one line that says the row is empty.
  const nextRowFinal = goingTiles.length === 0 && claimsLink.length > 0
    ? h`<section class="homerow" aria-labelledby="row-next-actions"><h2 id="row-next-actions">Existing leads — next actions</h2>
        <p class="empty">No leads in progress.</p><ul class="tiles hometiles">${claimsLink.map(tile)}</ul></section>`
    : nextRow;
  return [newRow, nextRowFinal];
}

type Dated = { readonly due_on: string; readonly late: boolean; readonly tile: HomeTile };

/**
 * TODAY AND OVERDUE — every task due today or late that the login may read (its own and its team's for Accounting and
 * Surveying; every one it may read for the others, which covers the next actions of leads and claims, since each of those
 * is a task), and the questions and document requests it put to clients that are due today or late. Late first.
 */
export function todayRow(actor: Actor, app: App, nowIso: string): Safe {
  const items = todayItems(actor, app, nowIso);
  const c = capped(items, '/staff/tasks');
  // UI TIDY PHASE 4: "Do these first" — the late ones first, then today's; the same items as before.
  return homeRow('today', 'Do these first', c.tiles, 'Nothing is due today, and nothing is late.', c.more);
}

/** The items on "Do these first", late first: what `todayRow` draws, and what Home's "Late" box counts. */
export function todayItems(actor: Actor, app: App, nowIso: string): HomeTile[] {
  const db = app.db;
  const work = T.myWork(db, actor, nowIso);
  const own = actor.role === 'ACCOUNTING' || actor.role === 'SURVEYING';
  const tasks = own ? work.tasks.filter((t) => t.due.state === 'OVERDUE' || t.due.state === 'DUE_TODAY') : T.tasksDueByToday(db, actor, nowIso);
  const items: Dated[] = [];
  for (const t of tasks) {
    const org = t.about.find((a) => a.kind === 'organisation') ?? t.about.find((a) => a.kind === 'lead');
    items.push({
      due_on: t.due_on ?? '', late: t.due.overdue,
      tile: { href: `/staff/tasks/${t.id}`, name: short(org?.label ?? t.title), lines: [...(org === undefined ? [] : [short(t.title)]), t.due.label], late: t.due.overdue },
    });
  }
  for (const q of work.questions_waiting) {
    if (q.due.state !== 'OVERDUE' && q.due.state !== 'DUE_TODAY') continue;
    items.push({
      due_on: '', late: q.due.overdue,
      tile: { href: `/staff/clients/${q.business_id}`, name: short(q.client), lines: [`Question: ${short(q.question)}`, q.due.label], late: q.due.overdue },
    });
  }
  for (const r of work.document_requests_outstanding) {
    if (r.due.state !== 'OVERDUE' && r.due.state !== 'DUE_TODAY') continue;
    items.push({
      due_on: '', late: r.due.overdue,
      tile: { href: `/staff/clients/${r.business_id}`, name: short(r.client), lines: [`Document: ${short(r.type_label)}`, r.due.label], late: r.due.overdue },
    });
  }
  // PHASE 142: A CLIENT WAITING FOR A REPLY on the company's chat for more than one working day. Only for a login that may
  // read that thread; a message waiting less than that is not late and not "due", so it is not on this row.
  for (const m of M.clientMessagesWaiting(db, actor, nowIso)) {
    if (!m.late) continue;
    items.push({
      due_on: '', late: true,
      tile: { href: `/staff/clients/${m.business_id}?chat=client#chat`, name: short(m.company),
        lines: [m.count === 1 ? 'A message waiting for a reply' : `${m.count} messages waiting for a reply`, waitedWords(m.working_days)], late: true },
    });
  }
  // PHASE 142: EMAIL REPLIES THE MAILBOX READER COULD NOT FILE, for Admin and Sales. One tile, with the number.
  if (IE.mayReadQueue(actor)) {
    const q = IE.replyQueue(db, actor);
    if (q.length > 0) items.push({ due_on: '', late: true, tile: { href: '/staff/replies', name: 'Email replies to sort', lines: [`${q.length} waiting — choose the company`], late: true } });
  }
  return [...items.filter((x) => x.late), ...items.filter((x) => !x.late)].map((x) => x.tile);
}

function reportsTile(actor: Actor): HomeTile[] {
  return opens(actor, assertDashboard) ? [{ href: '/staff/reports', name: 'Reports', lines: ['Figures by month, quarter or year'] }] : [];
}

/**
 * UI TIDY PHASE 4: THE PIPELINE AS FIVE COLOURED BARS. Lakhbir agreed the eleven stage tiles become one small chart: each
 * group of stages (src/web/look.ts) with its count, as long as its share, each a link to the Pipeline. On hold, when any,
 * and Reports follow as links. The numbers are the same board's.
 */
export function pipelineRow(actor: Actor, app: App, nowIso: string): Safe[] {
  if (!opens(actor, pipelineBoardGate)) return [];
  const board = pipelineBoard(app.db, actor, nowIso);
  const cards = board.columns.flatMap((col) => col.cards.map((c) => col.key));
  const most = Math.max(1, ...STAGE_GROUPS.map((g) => cards.filter((k) => g.stages.includes(k)).length));
  const bars = STAGE_GROUPS.map((g) => {
    const n = cards.filter((k) => g.stages.includes(k)).length;
    return h`<li><a class="gbar" href="/staff/pipeline"><span class="gbar-name">${g.name}</span><span class="gbar-track"><span class="gbar-fill g-${g.key} gw-${
      n === 0 ? 0 : Math.max(1, Math.round((n / most) * 10))}"></span></span><span class="gbar-n">${n}</span></a></li>`;
  });
  const links = [
    h`<a href="/staff/pipeline">Open the pipeline</a>`,
    ...(board.on_hold.length > 0 ? [h`<a href="/staff/claims?status=ON_HOLD">${plural(board.on_hold.length, 'claim', 'claims')} on hold</a>`] : []),
    ...reportsTile(actor).map((t) => h`<a href="${t.href}">${t.name}: ${t.lines[0] ?? ''}</a>`),
  ];
  return [h`<section class="homerow" aria-labelledby="row-pipeline"><h2 id="row-pipeline">Pipeline</h2>${
    cards.length === 0 ? h`<p class="empty">No claims yet.</p>` : h`<ul class="gbars">${bars}</ul>`}<p class="homelinks">${links.map((l, i) => h`${i === 0 ? raw('') : raw(' · ')}${l}`)}</p></section>`];
}

const VAT_WORDS: Readonly<Record<string, string>> = Object.freeze({
  BELOW: 'Below the VAT limit',
  INSIDE_MARGIN: 'Close to the VAT limit',
  OVER: 'Over the VAT limit — tell Lakhbir',
  CANNOT_SAY: 'Cannot tell — a setting is missing',
});

export function moneyRow(actor: Actor, app: App, nowIso: string): Safe[] {
  if (!opens(actor, assertFinanceSection)) return [];
  const f = financeDashboard(app.db, actor, nowIso);
  const band = f.vat.rolling.band;
  const tiles: HomeTile[] = [
    {
      href: '/staff/finance#claim-invoices', name: 'Invoices due',
      lines: [`${f.totals.outstanding} not yet paid`, f.totals.overdue_count === 0 ? 'None late' : `${f.totals.overdue} late (${plural(f.totals.overdue_count, 'invoice', 'invoices')})`],
      late: f.totals.overdue_count > 0,
    },
    {
      href: '/staff/finance#to-invoice', name: 'Fees to invoice',
      lines: [f.expected.claims.length === 0 ? 'None waiting' : `${plural(f.expected.claims.length, 'claim', 'claims')} ready for our fee`],
    },
    {
      href: '/staff/finance#vat-monitoring', name: 'VAT position',
      lines: [VAT_WORDS[band] ?? band, `Last 12 months: ${f.vat.rolling.turnover}`], late: band === 'INSIDE_MARGIN' || band === 'OVER',
    },
  ];
  return [homeRow('money', 'Money', [...tiles, ...reportsTile(actor)], 'Nothing to show.')];
}

export function jobsRow(actor: Actor, app: App): Safe[] {
  if (!opens(actor, assertSurveySection)) return [];
  const jobs = surveyorJobs(app.db, actor);
  const waiting = jobs.filter((j) => j.state === 'SEALED').length;
  const tiles: HomeTile[] = [
    { href: '/staff/survey', name: 'Waiting for your figures', lines: [waiting === 0 ? 'None waiting' : plural(waiting, 'job', 'jobs')] },
    { href: '/staff/survey', name: 'All your survey jobs', lines: [plural(jobs.length, 'job', 'jobs'), `${jobs.length - waiting} with your figures in`] },
  ];
  return [homeRow('jobs', 'Survey jobs', [...tiles, ...reportsTile(actor)], 'No survey jobs.')];
}

export function adminRow(actor: Actor, app: App): Safe[] {
  if (actor.role !== 'ADMIN') return [];
  const staff = S.staffList(app.db, actor);
  const log = auditLogView({ db: app.db, audit: app.audit, now: app.now }, actor, new URLSearchParams());
  const refusedSignIns = log.lines.filter((l) => l.kind === 'LOGIN_FAILED').length;
  const tiles: HomeTile[] = [
    { href: '/staff/users', name: 'Users', lines: [plural(staff.length, 'person can sign in', 'people can sign in')] },
    { href: '/staff/admin-settings', name: 'Switches', lines: ['Turn features on or off'] },
    {
      href: '/staff/audit', name: 'Audit log', late: !log.chain.intact,
      lines: [log.chain.intact ? 'Checked — nothing changed' : 'Problem found — tell Lakhbir'],
    },
    {
      href: '/staff/audit?kind=LOGIN_FAILED', name: 'Refused sign-ins', late: refusedSignIns > 0,
      lines: [refusedSignIns === 0 ? 'None lately' : `${refusedSignIns} lately`],
    },
  ];
  return [homeRow('admin', 'Admin', tiles, 'Nothing to show.')];
}

/** EVERY ROW OF THIS LOGIN'S HOME, in Lakhbir's order. */
export function homeRows(app: App, actor: Actor): Safe {
  const nowIso = app.now();
  const rows: Safe[] = [];
  switch (actor.role) {
    case 'ACCOUNTING':
      rows.push(...moneyRow(actor, app, nowIso), todayRow(actor, app, nowIso));
      break;
    case 'SURVEYING':
      rows.push(...jobsRow(actor, app), todayRow(actor, app, nowIso));
      break;
    case 'SALES': case 'ADMIN': case 'READ_ONLY':
      rows.push(...leadsRows(actor, app, nowIso), todayRow(actor, app, nowIso), ...pipelineRow(actor, app, nowIso), ...adminRow(actor, app));
      break;
    default:
      return raw('');
  }
  return h`${rows}`;
}
