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
import { organisationList, assertOrganisationSection, NOT_RECORDED, CLIENT_STATUSES, pipelineBoard, pipelineBoardGate } from './crm.ts';
import { opens } from './navigation.ts';
import { kpiRow, nobodyBadge, siteOf, stageBadge } from './look.ts';
import { waitingOn, type WaitingOn } from './engaged.ts';
import { h, raw, page, type Safe } from './html.ts';
import { badge } from './components.ts';
import { newFromClient } from './messages.ts';
import { newDot } from './client-layout.ts';

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
  /** 1 Oct 2026: messages from the client — portal, email, WhatsApp — this person has not read (the red dot). */
  readonly new_messages: number;
  /** UI tidy phase 6: the status's key, for its colour. */
  readonly status_key: string;
  /** UI tidy phase 6: each claim's site, number and stage — only for a login that may read the pipeline. */
  readonly claims_at: readonly { readonly id: string; readonly ref: string; readonly site: string; readonly stage_key: string | null; readonly stage_label: string }[];
};

export type ClientList = { readonly rows: readonly ClientListRow[]; readonly shows_waiting: boolean };

const WAITING_ORDER: Readonly<Record<WaitingOn, number>> = Object.freeze({ US: 0, CLIENT: 1, NOBODY: 2 });

export const CLIENT_SORTS = Object.freeze({ waiting: 'Waiting on us first', name: 'A to Z' });
export type ClientSort = keyof typeof CLIENT_SORTS;

/** The one list: every company this login may read, each asked on its own. */
export function clientList(db: Db, actor: Actor, sort: ClientSort = 'waiting', nowIso = new Date().toISOString()): ClientList {
  assertOrganisationSection(actor);
  const cards = opens(actor, pipelineBoardGate) ? (() => {
    const b = pipelineBoard(db, actor, nowIso);
    return [...b.columns.flatMap((c) => c.cards), ...b.on_hold, ...b.exited.flatMap((e) => e.cards), ...b.unrecognised];
  })() : [];
  const statusKey = (label: string): string => Object.entries(CLIENT_STATUSES).find(([, w]) => w === label)?.[0] ?? label;
  const rows: ClientListRow[] = organisationList(db, actor).map((o) => ({
    id: o.id, name: o.trading_name,
    legal_name: o.legal_name !== NOT_RECORDED && o.legal_name !== o.trading_name ? o.legal_name : null,
    sector: o.sector.replace(/_/g, ' ').toLowerCase(),
    status: o.client_status, do_not_contact: o.do_not_contact, owner: o.owner, claims: o.claims,
    waiting: waitingOn(db, actor, o.id),
    new_messages: newFromClient(db, actor, o.id),
    status_key: statusKey(o.client_status),
    claims_at: cards.filter((c) => c.business_id === o.id).sort((x, y) => x.claim_ref.localeCompare(y.claim_ref))
      .map((c) => ({ id: c.id, ref: c.claim_ref, site: siteOf(o.trading_name, c.property), stage_key: c.stage_key, stage_label: c.stage_label })),
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

/**
 * UI TIDY PHASE 6, 2 October 2026: who to act on first. A line of counts and solid boxes (waiting on us, waiting on the
 * client, asked not to be contacted, every company), each a link to that filter; one row with the search, the filters and
 * the two orders; the status in its colour; each claim beside its company, by site and number, its stage in its colour,
 * so two claims of one company cannot be mixed up. Search and filters are links: nothing needs a script.
 */
export const CLIENT_SHOWS = Object.freeze({ '': 'All', us: 'Waiting on us', client: 'Waiting on the client', dnc: 'Do not contact' });
export type ClientShow = keyof typeof CLIENT_SHOWS;

const STATUS_TONE: Readonly<Record<string, string>> = Object.freeze({ ACTIVE: 'ok', PROSPECT: 'info', DO_NOT_CONTACT: 'late' });

function statusBadge(r: ClientListRow): Safe {
  return h`<span class="badge${STATUS_TONE[r.status_key] === undefined ? '' : ` b-${STATUS_TONE[r.status_key]}`}">${r.status}</span>`;
}

/** The page. Company name first; nothing explains itself in a paragraph. */
export function clientListPage(nav: Safe, list: ClientList, sort: ClientSort, f: { q: string; show: string } = { q: '', show: '' }): string {
  const ours = list.rows.filter((r) => r.waiting?.who === 'US').length;
  const theirs = list.rows.filter((r) => r.waiting?.who === 'CLIENT').length;
  const dnc = list.rows.filter((r) => r.do_not_contact).length;
  const sorts = list.shows_waiting ? (Object.keys(CLIENT_SORTS) as ClientSort[]) : [];
  const shows = (Object.keys(CLIENT_SHOWS) as ClientShow[]).filter((k) => list.shows_waiting || k === '' || k === 'dnc');
  const show: ClientShow = (shows as string[]).includes(f.show) ? f.show as ClientShow : '';
  const q = f.q.trim().toLowerCase();
  const rows = list.rows.filter((r) =>
    (q === '' || r.name.toLowerCase().includes(q) || (r.legal_name ?? '').toLowerCase().includes(q) || r.claims_at.some((c) => c.ref.toLowerCase().includes(q) || c.site.toLowerCase().includes(q)))
    && (show === '' || (show === 'us' && r.waiting?.who === 'US') || (show === 'client' && r.waiting?.who === 'CLIENT') || (show === 'dnc' && r.do_not_contact)));
  const link = (k: { show?: string; sort?: string }): string => {
    const p = new URLSearchParams();
    if (f.q !== '') p.set('q', f.q);
    const sh = k.show ?? show; if (sh !== '') p.set('show', sh);
    const so = k.sort ?? sort; if (so !== 'waiting') p.set('sort', so);
    const s = p.toString(); return s === '' ? '/staff/clients' : `/staff/clients?${s}`;
  };
  return page({
    title: 'Clients', nav, wide: true,
    body: h`<div class="pagehead"><div><h1>Clients</h1><p class="lede">${list.rows.length} ${list.rows.length === 1 ? 'company' : 'companies'}${list.shows_waiting
        ? ` · ${ours} waiting on us · ${theirs} waiting on the client` : ''}</p></div></div>
      ${kpiRow([
        ...(list.shows_waiting ? [
          { label: 'Waiting on us', value: String(ours), tone: ours > 0 ? 'warn' as const : 'plain' as const, href: link({ show: 'us' }) },
          { label: 'Waiting on the client', value: String(theirs), tone: 'plain' as const, href: link({ show: 'client' }) },
        ] : []),
        { label: 'Asked not to be contacted', value: String(dnc), tone: dnc > 0 ? 'late' as const : 'plain' as const, href: link({ show: 'dnc' }) },
        { label: 'Every company', value: String(list.rows.length), tone: 'total' as const, href: link({ show: '' }) },
      ])}
      <section class="card"><div class="listtools"><form method="get" action="/staff/clients" role="search" class="inlineform"><label for="cq">Find a client</label>
          <input id="cq" name="q" type="search" value="${f.q}" placeholder="A company, a site or a claim number">${show === '' ? raw('') : h`<input type="hidden" name="show" value="${show}">`}${
          sort === 'waiting' ? raw('') : h`<input type="hidden" name="sort" value="${sort}">`}
          <button type="submit" class="btn-quiet">Find</button></form>
        <nav class="viewbar" aria-label="Show">${shows.map((k) => h`<a href="${link({ show: k })}"${k === show ? raw(' aria-current="page"') : raw('')}>${CLIENT_SHOWS[k]}</a>`)}</nav>
        ${sorts.length === 0 ? raw('') : h`<nav class="viewbar" aria-label="Sort">${sorts.map((k) => k === sort
          ? h`<a href="${link({ sort: k })}" aria-current="page">${CLIENT_SORTS[k]}</a>`
          : h`<a href="${link({ sort: k })}">${CLIENT_SORTS[k]}</a>`)}</nav>`}</div>
      ${list.rows.length === 0
        ? h`<p class="empty">No clients yet. A company appears here when it fills in the assessment or is recorded as a lead.</p>`
        : rows.length === 0 ? h`<p class="empty">No client matches. <a href="/staff/clients">Show every client</a></p>`
        : h`<div class="tablewrap"><table class="stack clientlist"><thead><tr><th>Company</th>${list.shows_waiting ? h`<th>Waiting on</th>` : raw('')}
            <th>Status</th><th>Owner</th><th>Claims</th></tr></thead>
          <tbody>${rows.map((r) => h`<tr>
            <td data-label="Company"><a class="rowname" href="/staff/clients/${r.id}${r.new_messages > 0 ? '?chat=all#chat' : ''}">${r.name}</a>${newDot(r.new_messages)}${
              r.legal_name === null ? raw('') : h`<br><span class="help">${r.legal_name}</span>`}<br><span class="help">${r.sector}</span></td>
            ${list.shows_waiting ? h`<td data-label="Waiting on">${waitingCell(r.waiting)}</td>` : raw('')}
            <td data-label="Status">${statusBadge(r)}</td>
            <td data-label="Owner">${r.owner ?? nobodyBadge('Nobody yet')}</td>
            <td data-label="Claims">${r.claims_at.length === 0 ? h`${r.claims}` : h`<ul class="claimsat">${r.claims_at.map((c) => h`<li>${
              c.stage_key === null ? h`<span class="badge">${c.stage_label}</span>` : stageBadge(c.stage_key, c.stage_label)} <a href="/staff/claims/${c.id}">${c.site}</a> <span class="help">${c.ref}</span></li>`)}</ul>`}</td></tr>`)}</tbody></table></div>`}
      </section>`,
  });
}
