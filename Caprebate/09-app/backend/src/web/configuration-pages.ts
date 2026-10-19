/**
 * THE ADMIN SETTINGS SCREEN — routes and page. CRM 9 of 10, 12 September 2026.
 *
 * Same shape as every other section: 'not-mine' for anything it does not own.
 * NOTHING HERE DECIDES ANYTHING. src/web/configuration.ts authorises every read and
 * write, refuses every setting no screen may move, and reads the document types,
 * the automation rules, the templates and the finance and compliance settings from
 * their own stores; this page draws them and links to where each is written.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as CF from './configuration.ts';
import { savedMessage, sectionList, why, type RecordTab } from './components.ts';
import { senderSetting, setSender } from './free-email.ts';
import { EMAIL_SENDING, sendingMissing, smtpLoginFromKeyFile } from '../stubs/email-provider.ts';
import { piecesPage } from './upload-pieces.ts';

export type WebResult = 'handled' | 'not-mine';

export type ConfigPageDeps = {
  app: App;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

const BASE = '/staff/admin-settings';

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

function fields(f: URLSearchParams, names: readonly string[]): Readonly<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const n of names) if (f.has(n)) out[n] = (f.get(n) ?? '').trim() || null;
  return out;
}

/** PHASE 133b — after a save, land on the section saved. A list code is capitals and underscores (the routes' own pattern); anything else lands at the top. */
function back(kind: 'list' | 'reasons', list: string | null | undefined): string {
  return typeof list === 'string' && /^[A-Z_]+$/.test(list) ? `#${kind}-${list.toLowerCase()}` : '';
}

export async function handleConfiguration(
  d: ConfigPageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  if (!path.startsWith(BASE)) return 'not-mine';
  const deps: CF.ConfigDeps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const today = d.app.now();

  if (path === BASE && method === 'GET') {
    html(res, 200, settingsPage(d, actor, CF.configurationView(d.app.db, actor, today), url.searchParams.get('done')));
    return 'handled';
  }
  if (path === `${BASE}/view.json` && method === 'GET') {
    // Read first: the store's refusal must reach the error handler before any header is sent.
    const view = CF.configurationView(d.app.db, actor, today);
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
    res.end(JSON.stringify(view));
    return 'handled';
  }
  if (path === `${BASE}/values` && method === 'POST') {
    const f = fields(await form(req), ['list', 'code', 'label']);
    const r = CF.addValue(deps, actor, f);
    if (!r.ok) return d.problem(res, actor, 'Not added', r.why, BASE, r.field);
    redirect(res, `${BASE}?done=added${back('list', f['list'])}`);
    return 'handled';
  }
  const value = /^\/staff\/admin-settings\/values\/([A-Z_]+)\/([A-Z0-9_]+)$/.exec(path);
  if (value && method === 'POST') {
    const r = CF.changeValue(deps, actor, value[1] ?? '', value[2] ?? '', fields(await form(req), ['label', 'active']));
    if (!r.ok) return d.problem(res, actor, 'Not changed', r.why, BASE, r.field);
    redirect(res, `${BASE}?done=changed${back('list', value[1])}`);
    return 'handled';
  }
  if (path === `${BASE}/reasons` && method === 'POST') {
    const f = fields(await form(req), ['list', 'code', 'label']);
    const r = CF.addReason(deps, actor, f);
    if (!r.ok) return d.problem(res, actor, 'Not added', r.why, BASE, r.field);
    redirect(res, `${BASE}?done=added${back('reasons', f['list'])}`);
    return 'handled';
  }
  const reason = /^\/staff\/admin-settings\/reasons\/([A-Z_]+)\/([A-Z_]+)$/.exec(path);
  if (reason && method === 'POST') {
    const r = CF.changeReason(deps, actor, reason[1] ?? '', reason[2] ?? '', fields(await form(req), ['label', 'active']));
    if (!r.ok) return d.problem(res, actor, 'Not changed', r.why, BASE, r.field);
    redirect(res, `${BASE}?done=changed${back('reasons', reason[1])}`);
    return 'handled';
  }
  if (path === `${BASE}/email-sender` && method === 'POST') {
    const r = setSender(deps, actor, fields(await form(req), ['display_name', 'address', 'reply_to']));
    if (!r.ok) return d.problem(res, actor, 'Not changed', r.why, `${BASE}#email-sender`, r.field);
    redirect(res, `${BASE}?done=changed#email-sender`);
    return 'handled';
  }
  if (path === `${BASE}/setting` && method === 'POST') {
    const r = CF.refuseSetting(deps, actor, (await form(req)).get('setting'));
    return d.problem(res, actor, 'Not a setting', r.why, BASE, r.field);
  }
  return 'not-mine';
}

// PHASE 154a1 (line 4): the label box and this list sit in a table row with no label of their own, so each says
// what it is to a screen reader (aria-label), naming the code it is for.
function activeSelect(active: boolean, disabled: boolean, code: string): Safe {
  return disabled
    ? h`<span class="help">written by the application — never retired</span>`
    // Split across lines: tools/lint-sql.cjs reads the HTML word for a drop-down after a backtick as SQL.
    : h`
      <select name="active" aria-label="Whether ${code} is active or retired"><option value="1"${active ? raw(' selected') : raw('')}>active</option><option value="0"${active ? raw('') : raw(' selected')}>retired</option></select>`;
}

/**
 * PHASE 141 — WHO EVERY EMAIL COMES FROM, AS ONE SETTING. Read by the outbox for every email it writes. Admin changes it;
 * Sales reads it. Whether emails are actually sent is not a setting: it is EMAIL_SENDING, in code, off until its three
 * conditions are met.
 */
function senderSection(d: ConfigPageDeps, actor: Actor): RecordTab {
  const s = senderSetting(d.app.db, actor);
  const missing = sendingMissing(EMAIL_SENDING, smtpLoginFromKeyFile(), { live: true });
  return { id: 'email-sender', label: 'Who emails come from', body: h`
    <p><strong>${s.sender.from_header}</strong></p>
    <p class="help">Replies go to ${s.sender.reply_to}.</p>
    ${missing.length === 0 ? h`<p>Emails are being sent.</p>` : h`<p><strong>Emails are not being sent yet.</strong></p>
      ${why(h`Before emails can go out: <ul>${missing.map((x) => h`<li>${x}</li>`)}</ul>`)}`}
    ${s.may_write ? h`<form method="post" action="/staff/admin-settings/email-sender">
      <label>Name people see <input name="display_name" required maxlength="80" value="${s.sender.display_name}"></label>
      <label>Send from <input name="address" type="email" required maxlength="254" value="${s.sender.address}"></label>
      <label>Replies go to <input name="reply_to" type="email" maxlength="254" value="${s.sender.reply_to}"></label>
      <button type="submit">Save</button></form>` : raw('')}` };
}

/**
 * PHASE 133b — ADMIN SETTINGS AS A LEFT-HAND SECTION LIST. Every list, every set of reasons, the four summaries of other
 * admin screens and what a setting may not change are each a section, in the order the page drew them, with the same
 * words and the same forms; the list down the left links to each by anchor, and the stylesheet shows one at a time. With
 * the stylesheet off every section shows, one after another. The view is the same one `configurationView` returned.
 */
function settingsPage(d: ConfigPageDeps, actor: Actor, v: CF.ConfigurationView, done: string | null): string {
  const sections: RecordTab[] = [
    ...v.lists.map((l) => ({ id: `list-${l.list.toLowerCase()}`, label: l.label, count: l.values.length, body: h`
        <p class="help">Holds ${l.holds}.</p>
        <table><thead><tr><th>Code</th><th>Label</th><th>State</th><th>Where it came from</th></tr></thead><tbody>${l.values.map((x) => h`<tr>
          <td><code>${x.code}</code></td>
          <td>${v.may_write ? h`<form method="post" action="/staff/admin-settings/values/${l.list}/${x.code}" class="inline">
            <input name="label" value="${x.label}" maxlength="120" aria-label="The label for ${x.code}"> ${activeSelect(x.active, x.fixed, x.code)} <button type="submit">Save</button></form>` : h`${x.label}`}</td>
          <td>${x.active ? 'active' : 'retired'}${x.fixed ? h` <span class="help">— the application writes it</span>` : raw('')}</td>
          <td class="help">${x.source}</td></tr>`)}</tbody></table>
        ${v.may_write ? h`<form method="post" action="/staff/admin-settings/values"><input type="hidden" name="list" value="${l.list}">
          <label>Code <input name="code" required pattern="[A-Z][A-Z0-9_]{1,59}"></label>
          <label>Label <input name="label" required maxlength="120"></label>
          <button type="submit">Add to ${l.label.toLowerCase()}</button></form>` : raw('')}
      ` })),
    ...v.reasons.map((l) => ({ id: `reasons-${l.list.toLowerCase()}`, label: l.label, count: l.values.length, body: h`
        <table><thead><tr><th>Code</th><th>Label</th><th>State</th></tr></thead><tbody>${l.values.map((x) => h`<tr>
          <td><code>${x.code}</code></td>
          <td>${v.may_write ? h`<form method="post" action="/staff/admin-settings/reasons/${l.list}/${x.code}" class="inline">
            <input name="label" value="${x.label}" maxlength="300" aria-label="The label for ${x.code}"> ${activeSelect(x.active, x.code === 'OTHER', x.code)} <button type="submit">Save</button></form>` : h`${x.label}`}</td>
          <td>${x.active ? 'active' : 'retired'}</td></tr>`)}</tbody></table>
        ${v.may_write ? h`<form method="post" action="/staff/admin-settings/reasons"><input type="hidden" name="list" value="${l.list}">
          <label>Code <input name="code" required pattern="[A-Z][A-Z_]{1,59}"></label>
          <label>Label <input name="label" required maxlength="300"></label>
          <button type="submit">Add a reason</button></form>` : raw('')}
      ` })),
    ...(v.document_types === undefined ? [] : [{ id: 'summary-document-types', label: 'Document types', count: v.document_types.length, body: h`
        <p class="help">Kept on <a href="/staff/document-types">the document types page</a>, with who can read each and when it is deleted.
        Only a system update sets whether we keep a file. A type that can hold a value is never marked as holding none.</p>
        <table><thead><tr><th>Type</th><th>Who may read it</th><th>Kept, or read then deleted</th><th>State</th></tr></thead><tbody>${v.document_types.map((t) => h`<tr>
          <td>${t.label} <code>${t.code}</code></td><td>${t.readers.label}</td><td class="help">${t.strip.label}</td><td>${t.active ? 'active' : 'retired'}</td></tr>`)}</tbody></table>` }]),
    ...(v.automation === undefined ? [] : [{ id: 'summary-automation', label: 'Automation rules', count: v.automation.rules.length, body: h`
        <p class="help">Kept on <a href="/staff/automation">the automation page</a>, which lists what no rule can do, and why.</p>
        <table><thead><tr><th>Rule</th><th>When</th><th>Does</th><th>State</th></tr></thead><tbody>${v.automation.rules.map((r) => h`<tr>
          <td>${r.label}</td><td>${r.trigger.label}</td><td>${r.effect.label}</td><td>${r.active ? 'active' : 'retired'}</td></tr>`)}</tbody></table>` }]),
    ...(v.templates === undefined ? [] : [{ id: 'summary-templates', label: 'Email templates', count: v.templates.count, body: h`
        <p class="help">${v.templates.count} ${v.templates.count === 1 ? 'template' : 'templates'}, kept on <a href="/staff/templates">the templates page</a>.
        Emails made from a template join the emails waiting to send.</p>` }]),
    ...(v.finance === undefined ? [] : [{ id: 'summary-finance', label: 'Finance settings', body: h`
        <p class="help">Dated rows, recorded with their source on <a href="/staff/finance">the finance page</a> — never edited in place.</p>
        <table><tbody>${v.finance.map((s) => h`<tr><th>${s.label}</th><td>${s.setting === null ? h`<strong>Not set</strong>` : h`${s.setting.value}`}</td>
          <td class="help">${s.setting?.effective_from ?? ''} ${s.setting?.source ?? ''}</td></tr>`)}</tbody></table>` }]),
    ...(v.compliance === undefined ? [] : [{ id: 'summary-compliance', label: 'Compliance settings', body: h`
        <p class="help">Dated rows, recorded with their source on <a href="/staff/compliance">the compliance page</a> — never edited in place.</p>
        <table><tbody>${v.compliance.map((s) => h`<tr><th>${s.setting}</th><td><strong>${s.label}</strong></td>
          <td class="help">${s.effective_from ?? ''} ${s.source ?? ''}</td></tr>`)}</tbody></table>` }]),
    senderSection(d, actor),
    { id: 'may-not-change', label: 'What a setting may not change', body: h`
        <p class="help">Each of these is a rule, not a preference. If you ask to change one, the system says no, gives the reason below and
        records that you asked. Asking changes nothing.</p>
        <table><tbody>${v.forbidden.map((f) => h`<tr><th>${f.label}</th><td>${f.why}</td></tr>`)}</tbody></table>
        ${v.may_write ? h`<form method="post" action="/staff/admin-settings/setting">
          <label>Ask to change one anyway <select name="setting">${v.forbidden.map((f) => h`<option value="${f.key}">${f.label}</option>`)}</select></label>
          <button type="submit">Ask</button></form>` : raw('')}
      ` },
  ];
  return page({
    title: 'Admin settings', nav: d.nav(actor), wide: true,
    body: h`<h1>Admin settings</h1>${done === null ? raw('') : savedMessage()}
      <p class="help"><strong>You can change preferences here. Rules are fixed.</strong> The lists and the reasons are kept
      here. A value is retired, never deleted, and its code never changes. The last section lists what no setting can change.
      Asking to change one is refused and recorded.</p>
      ${sectionList('Sections of admin settings', sections)}`,
  });
}
