/**
 * THE ONE CLIENTS LIST — PHASE 135, 21 September 2026.
 *
 * Phase 134 made one client page per company, but left two lists of the same companies — "Engaged clients" at
 * /staff/clients and "Organisations" at /staff/organisations — each opening that one page. This is the one list, at
 * /staff/clients. The old list address sends the reader here, after asking the gate it always asked.
 *
 * WHO MAY OPEN IT IS WHO MAY OPEN THE ORGANISATIONS LIST: `organisation.read` — Admin, Sales and Read only. That is the
 * gate the organisations list used, so the view-only login can read the one list, and nobody gains a screen they could
 * not open before. Each row is still asked of `organisation.read` on its own company.
 *
 * WHAT EACH COLUMN NEEDS IS ASKED PER ROW. "Waiting on" is built from the letter, the questions and the missing facts,
 * which is the research's rule (`research.read`, Admin and Sales). `waitingOn` in src/web/engaged.ts answers null for a
 * login that rule refuses, so the view-only login sees company, status, owner and claims, and no waiting column — the
 * same as the organisations list showed it before this phase.
 */

import type { Db } from '../db.ts';
import type { Actor } from '../authz.ts';
import { organisationList, assertOrganisationSection, NOT_RECORDED } from './crm.ts';
import { waitingOn, type WaitingOn } from './engaged.ts';
import { h, raw, page, type Safe } from './html.ts';
import { badge } from './components.ts';

export type ClientListRow = {
  readonly id: string;
  readonly name: string;
  /** The registered name, only where it differs from the name the client gave us. */
  readonly legal_name: string | null;
  readonly sector: string;
  readonly status: string;
  readonly do_not_contact: boolean;
  readonly owner: string | null;
  readonly claims: number;
  /** Null where this login may not read who is holding the claim up. */
  readonly waiting: { readonly who: WaitingOn; readonly why: string } | null;
};

export type ClientList = { readonly rows: readonly ClientListRow[]; readonly shows_waiting: boolean };

const WAITING_ORDER: Readonly<Record<WaitingOn, number>> = Object.freeze({ US: 0, CLIENT: 1, NOBODY: 2 });

export const CLIENT_SORTS = Object.freeze({ waiting: 'Waiting on us first', name: 'A to Z' });
export type ClientSort = keyof typeof CLIENT_SORTS;

/** The one list: every company this login may read, each asked on its own. */
export function clientList(db: Db, actor: Actor, sort: ClientSort = 'waiting'): ClientList {
  assertOrganisationSection(actor);
  const rows: ClientListRow[] = organisationList(db, actor).map((o) => ({
    id: o.id, name: o.trading_name,
    legal_name: o.legal_name !== NOT_RECORDED && o.legal_name !== o.trading_name ? o.legal_name : null,
    sector: o.sector.replace(/_/g, ' ').toLowerCase(),
    status: o.client_status, do_not_contact: o.do_not_contact, owner: o.owner, claims: o.claims,
    waiting: waitingOn(db, actor, o.id),
  }));
  const shows_waiting = rows.some((r) => r.waiting !== null);
  const byName = (a: ClientListRow, b: ClientListRow): number => a.name.localeCompare(b.name);
  rows.sort(sort === 'waiting' && shows_waiting
    ? (a, b) => (WAITING_ORDER[a.waiting?.who ?? 'NOBODY'] - WAITING_ORDER[b.waiting?.who ?? 'NOBODY']) || byName(a, b)
    : byName);
  return { rows, shows_waiting };
}

function waitingCell(w: ClientListRow['waiting']): Safe {
  if (w === null) return h`<span class="help">—</span>`;
  const who = w.who === 'US' ? badge('Us', 'warn') : w.who === 'CLIENT' ? badge('The client', 'plain') : badge('Nobody', 'ok');
  return h`${who}<br><span class="help">${w.why}</span>`;
}

/** The page. Company name first; nothing explains itself in a paragraph. */
export function clientListPage(nav: Safe, list: ClientList, sort: ClientSort): string {
  const ours = list.rows.filter((r) => r.waiting?.who === 'US').length;
  const theirs = list.rows.filter((r) => r.waiting?.who === 'CLIENT').length;
  const sorts = list.shows_waiting ? (Object.keys(CLIENT_SORTS) as ClientSort[]) : [];
  return page({
    title: 'Clients', nav, wide: true,
    body: h`<div class="pagehead"><div><p class="eyebrow">Clients</p><h1>Clients</h1></div></div>
      ${sorts.length === 0 ? raw('') : h`<nav class="viewbar" aria-label="Sort">${sorts.map((k) => k === sort
        ? h`<a href="/staff/clients?sort=${k}" aria-current="page">${CLIENT_SORTS[k]}</a>`
        : h`<a href="/staff/clients?sort=${k}">${CLIENT_SORTS[k]}</a>`)}</nav>`}
      <p class="help">${list.rows.length} ${list.rows.length === 1 ? 'company' : 'companies'}${list.shows_waiting
        ? h`. <strong>${ours} waiting on us</strong>, ${theirs} waiting on the client.` : raw('.')}</p>
      ${list.rows.length === 0
        ? h`<p class="empty">No clients yet. A company appears here when it fills in the assessment or is recorded as a lead.</p>`
        : h`<table class="stack clientlist"><thead><tr><th>Company</th>${list.shows_waiting ? h`<th>Waiting on</th>` : raw('')}
            <th>Status</th><th>Owner</th><th>Claims</th></tr></thead>
          <tbody>${list.rows.map((r) => h`<tr>
            <td data-label="Company"><a class="rowname" href="/staff/clients/${r.id}">${r.name}</a>${
              r.legal_name === null ? raw('') : h`<br><span class="help">${r.legal_name}</span>`}<br><span class="help">${r.sector}</span></td>
            ${list.shows_waiting ? h`<td data-label="Waiting on">${waitingCell(r.waiting)}</td>` : raw('')}
            <td data-label="Status">${r.do_not_contact ? h`<strong>${r.status}</strong>` : h`${r.status}`}</td>
            <td data-label="Owner">${r.owner ?? h`<span class="help">nobody yet</span>`}</td>
            <td data-label="Claims">${r.claims}</td></tr>`)}</tbody></table>`}`,
  });
}
