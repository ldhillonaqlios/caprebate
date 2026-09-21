/**
 * THE MANAGEMENT DASHBOARD'S ROUTES AND PAGE. CRM 9 of 10, 12 September 2026.
 *
 * Same shape as `handleCrm` and `handleCompliance`: it returns 'not-mine' for
 * anything it does not own, so the mounting in staff.ts is one line.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/dashboard.ts asks `can()` for every tile
 * and every row; this file draws what it returns, with the `h` tagged template.
 * `view.json` serves the same object to the same actor under the same rule, so
 * N1 is verified on the wire — tools/payload-proof.ts reads it as SURVEYING.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { dataLink, why } from './components.ts';
import * as D from './dashboard.ts';
import { localDate } from './localtime.ts';

export type WebResult = 'handled' | 'not-mine';

export type DashboardPageDeps = {
  app: App;
  nav: (actor: Actor) => Safe;
};

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
});

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

export async function handleDashboard(
  d: DashboardPageDeps, _req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
): Promise<WebResult> {
  const path = url.pathname;
  if (method !== 'GET') return 'not-mine';
  if (path !== '/staff/dashboard/view.json' && path !== '/staff/dashboard' && path !== '/staff/reports') return 'not-mine';
  // THE CRM FOLLOW-ON: the period, read through the fixed table — and the gate asked first, so a refused reader is refused
  // before anything about their request is read.
  D.assertDashboard(actor);
  // PHASE 136: THE DASHBOARD FOLDED INTO HOME. Its figures are the Reports tile's page; the old address sends a person
  // Home, and one that carried a period (a bookmarked report) to the same report. view.json answers exactly as before.
  if (path === '/staff/dashboard') {
    res.writeHead(303, { location: url.search === '' ? '/staff' : `/staff/reports${url.search}`, 'cache-control': 'no-store' });
    res.end();
    return 'handled';
  }
  const now = d.app.now();
  const asked = D.readPeriod(url.searchParams, localDate(now));
  const v = D.dashboard(d.app.db, actor, now, asked.period, asked.said);
  if (path === '/staff/dashboard/view.json') json(res, 200, v);
  else html(res, 200, reportsPage(d, actor, v));
  return 'handled';
}

function tileBlock(t: D.Tile): Safe {
  return h`<div class="pblock" id="tile-${t.key}"><div class="pnum">${t.title}</div>
    <table><tbody>${t.lines.map((l) => h`<tr${l.flag === true ? raw(' class="overdue"') : raw('')}>
      <th>${l.href === undefined ? h`${l.label}` : h`<a href="${l.href}">${l.label}</a>`}</th>
      <td>${l.flag === true ? h`<strong>${l.value}</strong>` : h`${l.value}`}</td></tr>`)}</tbody></table>
    ${t.apart.length === 0 ? raw('') : h`<ul>${t.apart.map((a) => h`<li class="help">${a}</li>`)}</ul>`}
    ${why(t.basis)}
  </div>`;
}

/**
 * THE PERIOD CONTROL — the CRM follow-on. The dashboard over a period is the reports screen: there is no second one. A
 * drop-down's markup starts its own line, because tools/lint-sql.cjs reads the HTML word for one after a backtick as SQL.
 */
function periodForm(v: D.Dashboard): Safe {
  const p = v.period;
  const options = (Object.entries(D.PERIODS) as [D.PeriodKey, string][]).map(([k, l]) => h`<option value="${k}"${k === p.key ? raw(' selected') : raw('')}>${l}</option>`);
  return h`<form method="get" action="/staff/reports" class="pblock"><div class="pnum">Pick a period</div>
    <label>Period
      <select name="period">${options}</select></label>
    <label>For a financial year, the year it starts in <input name="fy" inputmode="numeric" maxlength="4" value="${p.key === 'FINANCIAL_YEAR' ? (p.from ?? '').slice(0, 4) : ''}"></label>
    <label>For a range, from <input name="from" type="date" value="${p.key === 'RANGE' ? (p.from ?? '') : ''}"></label>
    <label>to <input name="to" type="date" value="${p.key === 'RANGE' ? (p.to ?? '') : ''}"></label>
    <button type="submit">Show</button> <a href="/staff/reports">No period</a>
    <p class="help">${p.key === 'NONE' ? 'No period chosen: everything recorded, as at today.'
      : h`Showing <strong>${p.words}</strong>, ${p.from ?? ''} to ${p.to ?? ''}.`}</p>
    ${v.said.length === 0 ? raw('') : h`<ul>${v.said.map((x) => h`<li class="help">${x}</li>`)}</ul>`}
  </form>`;
}

/** PHASE 136: the dashboard's page, reached from Home's Reports tile. The same figures, under the same gate. */
function reportsPage(d: DashboardPageDeps, actor: Actor, v: D.Dashboard): string {
  const groups = (Object.keys(D.GROUP_TITLES) as D.TileGroup[]).filter((g) => v.tiles.some((t) => t.group === g));
  const q = D.periodQuery(v.period);
  return page({
    title: 'Reports', nav: d.nav(actor), wide: true,
    body: h`<h1>Reports</h1>
      <p class="help">As at ${v.today}.</p>${why(h`${v.note} Each figure is shown only to a role that may read every number in it.`)}
      ${periodForm(v)}
      ${groups.map((g) => h`<h2>${D.GROUP_TITLES[g]}</h2>${v.tiles.filter((t) => t.group === g).map(tileBlock)}`)}
      ${dataLink(actor, `/staff/dashboard/view.json${q === '' ? '' : `?${q}`}`)}`,
  });
}
