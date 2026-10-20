/**
 * GLOBAL SEARCH, THE LIST CONTROLS, SAVED VIEWS AND CSV EXPORT — the routes and the
 * blocks. CRM 9 of 10, 12 September 2026.
 *
 * Same shape as every other section: it returns 'not-mine' for anything it does not
 * own. It is mounted in staff.ts BEFORE the CRM and pipeline sections, because the
 * export routes share their prefixes.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/search.ts and src/web/lists.ts ask `can()`
 * for every row and every column; this file draws what they return with the `h`
 * tagged template, and serves a CSV body those functions built.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { can, type Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as LI from './lists.ts';
import * as S from './search.ts';
import { documentCentreGate } from './documents.ts';
import { opens } from './navigation.ts';
import { piecesPage } from './upload-pieces.ts';

export type WebResult = 'handled' | 'not-mine';

export type ListPageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
});

const BASE: Readonly<Record<LI.ListKey, string>> = Object.freeze({ CLAIMS: '/staff/claims', LEADS: '/staff/leads' });

function html(res: ServerResponse, status: number, body: string): void {
  // PHASE 160e: a page with an upload form also names the script that sends a big file in pieces.
  const pp = piecesPage(HTML_HEADERS, body);
  res.writeHead(status, pp.headers);
  res.end(pp.body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

/** The parameters a list request asks for — a saved view's, where one is named, or the request's own. */
export function requestParams(app: App, actor: Actor, list: LI.ListKey, q: URLSearchParams): { params: LI.ListParams; ignored: string[]; view: string | null } {
  const view = q.get('view');
  if (view !== null && view !== '') return { ...LI.readParams(list, LI.viewParams(app.db, actor, list, view)), view };
  return { ...LI.readParams(list, q), view: null };
}

export function mayShareViews(actor: Actor): boolean {
  return can(actor, 'saved_view.share', { type: 'saved_view', id: '__new__', owner_id: actor.id, shared: true });
}

export async function handleLists(
  d: ListPageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const deps: LI.ListDeps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };

  if (path === '/staff/search' && method === 'GET') {
    html(res, 200, searchPage(d, actor, S.search(d.app.db, actor, url.searchParams.get('q') ?? '')));
    return 'handled';
  }
  if (path === '/staff/search/view.json' && method === 'GET') {
    // Read first: the store's refusal must reach the error handler before any header is sent.
    const found = S.search(d.app.db, actor, url.searchParams.get('q') ?? '');
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify(found));
    return 'handled';
  }

  const exportMatch = /^\/staff\/(claims|leads)\/export\.csv$/.exec(path);
  if (exportMatch && method === 'GET') {
    const list: LI.ListKey = exportMatch[1] === 'leads' ? 'LEADS' : 'CLAIMS';
    const asked = requestParams(d.app, actor, list, url.searchParams);
    const q = new URLSearchParams(LI.canonical(asked.params));
    const out = LI.exportList(deps, actor, list, q);
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${out.filename}"`,
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    });
    res.end(out.body);
    return 'handled';
  }

  if (path === '/staff/views' && method === 'POST') {
    const f = await form(req);
    const list = f.get('list');
    const back = list === 'LEADS' ? BASE.LEADS : BASE.CLAIMS;
    const r = LI.saveView(deps, actor, { list, name: f.get('name'), shared: f.get('shared') === 'yes', query: new URLSearchParams(f.get('params') ?? '') });
    if (!r.ok) return d.problem(res, actor, 'View not saved', r.why, back);
    redirect(res, `${BASE[r.list]}?view=${r.id}`);
    return 'handled';
  }
  const retire = /^\/staff\/views\/([A-Za-z0-9-]+)\/retire$/.exec(path);
  if (retire && method === 'POST') {
    const r = LI.retireView(deps, actor, retire[1] ?? '');
    if (!r.ok) return d.problem(res, actor, 'View not retired', r.why, '/staff/claims');
    redirect(res, BASE[r.list]);
    return 'handled';
  }
  return 'not-mine';
}

/* ------------------------------------------------------------------ *
 * THE LIST CONTROLS — drawn above the claims and leads lists
 * ------------------------------------------------------------------ */

/** The filters, and the order, a list did not apply — by their labels, from the fixed tables. */
function notAppliedWords(list: LI.ListKey, keys: readonly string[]): string {
  const labels = keys.map((k) => (k === 'sort' ? 'the order asked for' : (LI.filtersOf(list).find((f) => f.key === k)?.label ?? k).toLowerCase()));
  return labels.length === 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1] ?? ''}`;
}

export function listControls(
  list: LI.ListKey, v: LI.ListView<unknown>, views: readonly LI.SavedView[], mayShare: boolean, current: string | null,
  /** PHASE 137: `keep` rides along on every filter (the leads' List view); `noSort` leaves out the order, where a page has its own. */
  opts: { readonly keep?: Readonly<Record<string, string>>; readonly noSort?: boolean } = {},
): Safe {
  const base = BASE[list];
  const keep = Object.entries(opts.keep ?? {});
  const clear = keep.length === 0 ? base : `${base}?${new URLSearchParams(keep).toString()}`;
  const now = new URLSearchParams(v.params);
  const field = (f: LI.FilterDef): Safe => {
    const value = now.get(f.key) ?? '';
    if (f.kind === 'choice') {
      // The markup is split across lines on purpose: tools/lint-sql.cjs reads the HTML word for a drop-down, after a
      // backtick and before an interpolation on one line, as SQL — a false positive not worth weakening the lint for.
      const options = (v.choices[f.key] ?? []).map((c) => h`<option value="${c.value}"${c.value === value ? raw(' selected') : raw('')}>${c.label}</option>`);
      return h`<label>${f.label}
        <select name="${f.key}"><option value="">any</option>${options}</select></label>`;
    }
    return h`<label>${f.label} <input name="${f.key}" value="${value}"${f.kind === 'date' ? raw(' type="date"') : raw(' inputmode="numeric"')}></label>`;
  };
  return h`<div class="pblock filters"><div class="pnum">Filter, sort and save</div>
    <form method="get" action="${base}">
      ${keep.map(([k, x]) => h`<input type="hidden" name="${k}" value="${x}">`)}
      ${v.filters.map(field)}
      ${opts.noSort === true ? raw('') : h`<label>Order
        <select name="sort">
        ${v.sorts.map((s) => h`<option value="${s.value}"${s.value === v.sort.key ? raw(' selected') : raw('')}>${s.label}</option>`)}</select></label>`}
      <button type="submit">Show</button> <a href="${clear}">Clear</a>
    </form>
    <p class="help">${v.rows.length} of the ${v.read} you may read${opts.noSort === true ? '' : `, ${v.sort.label.toLowerCase()}`}.${v.applied.length === 0 ? '' : ' Filtered by '}${
      v.applied.map((a, i) => h`${i === 0 ? '' : '; '}${a.label.toLowerCase()} — ${a.value}`)}${v.applied.length === 0 ? '' : '.'}
      ${current === null ? raw('') : h` <strong>A saved view.</strong>`}</p>
    ${v.said.length === 0 ? raw('') : h`<ul>${v.said.map((x) => h`<li class="help">${x}</li>`)}</ul>`}
    ${views.length === 0 ? h`<p class="help">No saved view yet.</p>` : h`<p><strong>Saved views</strong></p><ul>${views.map((x) => h`<li>
      <a href="${base}?view=${x.id}">${x.name}</a>${x.shared ? h` <span class="help">— shared by an administrator</span>` : h` <span class="help">— yours</span>`}${
      x.may_retire ? h` <form method="post" action="/staff/views/${x.id}/retire" class="inline"><button class="linkish" type="submit">Retire</button></form>` : raw('')}</li>`)}</ul>`}
    <form method="post" action="/staff/views">
      <input type="hidden" name="list" value="${list}"><input type="hidden" name="params" value="${v.params}">
      <label>Save these filters as <input name="name" required maxlength="120"></label>
      ${mayShare ? h`<label><input type="checkbox" name="shared" value="yes"> Share with everybody</label>` : raw('')}
      <button type="submit">Save view</button></form>
    ${v.may_export ? h`<p><a href="${base}/export.csv?${v.params}">Export these ${v.rows.length} rows as CSV</a>
      <span class="help">— only the columns you may read; the export is recorded.</span>${v.not_applied.length === 0 ? raw('') : h`
      <br><strong>The file does not apply ${notAppliedWords(list, v.not_applied)}</strong> <span class="help">— your role does not see those columns.
      The file cannot say so, so we say it here. The export record names them too.</span>`}</p>` : raw('')}
  </div>`;
}

/**
 * PHASE 133a — A SORTABLE COLUMN HEADING. A heading is a link to the same list with its order changed and every filter
 * kept, for an order this login may already choose in the form beside the list (`v.sorts`, which leaves out what the
 * login may not read, such as the value). Any other heading is plain words. The current order is said in words.
 */
export type SortBy = (key: string, label: string) => Safe;

export function sortHeading(list: LI.ListKey, v: LI.ListView<unknown>, keep: Readonly<Record<string, string>> = {}): SortBy {
  return (key, label) => {
    if (!v.sorts.some((s) => s.value === key)) return h`${label}`;
    const q = new URLSearchParams(v.params);
    q.set('sort', key);
    for (const [k, x] of Object.entries(keep)) q.set(k, x);
    return v.sort.key === key
      ? h`<a href="${BASE[list]}?${q.toString()}" aria-current="true">${label}</a> <span class="sorted">— sorted</span>`
      : h`<a href="${BASE[list]}?${q.toString()}">${label}</a>`;
  };
}

/* ------------------------------------------------------------------ *
 * THE SEARCH PAGE
 * ------------------------------------------------------------------ */

function searchPage(d: ListPageDeps, actor: Actor, r: S.SearchResult): string {
  const kinds = [...new Set(r.hits.map((x) => x.kind))];
  return page({
    title: 'Search', nav: d.nav(actor), wide: true,
    body: h`<h1>Search</h1>
      <form method="get" action="/staff/search"><label>Search for <input name="q" value="${r.term}" autofocus></label>
        <button type="submit">Search</button></form>
      ${opens(actor, documentCentreGate) ? h`<p class="help">Looking for a file? Each company’s files are on its page, under Files.
        <a href="/staff/documents">Find a document across every client</a>.</p>` : raw('')}
      ${r.note === null ? raw('') : h`<p class="help">${r.note}</p>`}
      ${kinds.map((k) => h`<div class="pblock"><div class="pnum">${S.KIND_LABELS[k]}</div><table><tbody>${
        r.hits.filter((x) => x.kind === k).map((x) => h`<tr><th><a href="${x.href}">${x.label}</a></th><td>${x.detail}</td></tr>`)}</tbody></table></div>`)}
      ${r.scope.length === 0 ? raw('') : h`<div class="pblock"><div class="pnum">What was searched</div><ul>${r.scope.map((s) => h`<li>${S.KIND_LABELS[s.kind]} — ${
        s.searched === 'ALL' ? 'searched' : s.searched === 'ASSIGNED' ? 'searched, the ones your own survey jobs reach' : 'not searched: not yours to read'}</li>`)}</ul></div>`}
      <div class="gate"><strong>Never searched, for anyone:</strong> ${r.never.join('; ')}.</div>`,
  });
}
