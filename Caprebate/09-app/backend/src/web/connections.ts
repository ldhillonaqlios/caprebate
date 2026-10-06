/**
 * PHASE 156e, 5 October 2026 — THE ADMIN "CONNECTIONS" PAGE (B3), AND THE TWO CARE REGULATORS' LISTS (B4).
 *
 *   GET  /staff/connections                          every outside service on one page, read only. Admin only.
 *   GET  /staff/connections/import?list={CIW|CARE_INSPECTORATE}   the import page, with its one script. Admin only.
 *   POST /staff/connections/register/{CIW|CARE_INSPECTORATE}   import that regulator's downloaded list. Admin only.
 * The Connections page itself carries no script, as every page reached from Home must (test/phase133a); the import
 * page, which needs one, is opened by a button, as the WhatsApp upload page is (Phase 156c).
 *
 * WHY. "So nobody has to read code to know": one row per outside service - is its key there (yes or no, NEVER the
 * value), is it switched on (and what switch says so), is it on for testing under a waiver or for real clients, when it
 * was last called and how that went, and what it still waits on. Built from what the code already decides - the key
 * list (src/secrets.ts), each service's own switch (src/web/saved-keys.ts, `serviceOn`), the outside-call policies
 * (src/connectors/sources.ts) and the audit log's CONNECTOR_CALLED rows - so the page can never say something the code
 * does not do. Nothing on it changes anything; keys are changed in Home's Admin tab, switches in code.
 *
 * NOTHING IS ON FOR REAL CLIENTS. Every service that is on, is on for testing only, under a recorded waiver or approval
 * (Lakhbir, and Sadique for the US transfers); the column says so, and what turns it on for real is in "Waits on".
 *
 * THE TWO LISTS (Lakhbir, 5 Oct 2026, asked whether his 2 Oct "All the free ones" covers them: "Yes, include them").
 * Care Inspectorate Wales and the Care Inspectorate (Scotland) publish a file, not an API (src/web/register-files.ts).
 * The Scottish file is about 10 MB (31 August 2026's: 9,859,714 bytes, read 5 Oct 2026) and the test website takes about
 * 4.5 MB a request. So the page's script (src/web/register-import-script.ts) reads the file ON THE ADMIN'S COMPUTER and
 * sends only the columns we keep - the names, telephone numbers and emails in these files never leave that computer.
 * With no script, a file under 4.4 MB goes as it is and the server reads only the same columns. Either way the import
 * is the one Phase 155 built (`importRegisterFile`): refused whole on wrong columns, replacing that list whole.
 * A list not imported this calendar month is shown on Home's Admin view, so each new monthly file is imported.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { SECRET_KEYS, type SecretOwner } from '../secrets.ts';
import { serviceOn } from './saved-keys.ts';
import { switchedOn, switchesHere, TEST_WEBSITE_LOOKUPS, lookupsWaivedHere } from '../connectors/registers.ts';
import { POSTCODE_CHECK } from '../connectors/postcode-check.ts';
import { FILE_SOURCES, decodeRegisterFile, importRegisterFile, RegisterFileError, type FileSourceId } from './register-files.ts';
import { singleFile } from './multipart.ts';
import { localStamp, localPartsOf } from './localtime.ts';
import { ADDRESS_SEARCH_CAP, searchesToday } from '../connectors/address-lookup.ts';

/** One outside service as the page shows it. */
export type Connection = {
  readonly id: string;
  readonly name: string;
  readonly does: string;
  /** The key file's owner whose keys this service reads; null for a service with no key. */
  readonly owner: SecretOwner | null;
  /** CALL_POLICIES ids whose CONNECTOR_CALLED rows are this service's calls. */
  readonly calls: readonly string[];
  /** The switch, by name, as a developer finds it. */
  readonly switch_name: string;
  /** For a service with no key, whether it is on, and why not. */
  readonly on?: (app: App) => { on: boolean; why: string };
  /** What turns it on for real clients, or what it still waits on. */
  readonly waits: string;
  /** A regulator's list imported from a file. */
  readonly file?: FileSourceId;
  /** PHASE 156f: a count for today, in words, shown under the service (the address box's searches against its cap). */
  readonly today?: (app: App) => string;
};

const yes = { on: true, why: '' };
const off = (why: string) => ({ on: false, why });

/**
 * EVERY OUTSIDE SERVICE, in the order the work meets them. Each `calls` id is a CALL_POLICIES row (test/phase156e
 * proves every row is on this page, so a new service cannot be added and left off it).
 */
export const CONNECTIONS: readonly Connection[] = Object.freeze([
  { id: 'POSTCODES_IO', name: 'Postcodes.io', does: 'Checks a postcode at the assessment.', owner: null, calls: ['POSTCODES_IO'],
    switch_name: 'POSTCODE_CHECK', on: () => (POSTCODE_CHECK.enabled ? yes : off('The postcode check is not switched on.')),
    waits: 'For real clients: the published privacy notice naming Postcodes.io.' },
  { id: 'COMPANIES_HOUSE', name: 'Companies House', does: '“Find my company” at the assessment; the company’s facts after sign-up.', owner: 'COMPANIES_HOUSE',
    calls: ['COMPANIES_HOUSE', 'COMPANIES_HOUSE_DOCUMENTS'], switch_name: 'COMPANY_SEARCH; CH_COMPANY for research',
    waits: 'For real clients: the published privacy notice naming Companies House.' },
  { id: 'CQC', name: 'Care Quality Commission (England)', does: 'Care registrations and places, after a client signs.', owner: 'CQC', calls: ['CQC'],
    switch_name: 'REGISTER_SWITCHES.CQC', waits: 'For real clients: the privacy notice, once it is published.' },
  { id: 'CIW', name: 'Care Inspectorate Wales', does: 'Care services in Wales, from its downloaded list.', owner: null, calls: [], file: 'CIW',
    switch_name: 'REGISTER_SWITCHES.CIW',
    on: () => (switchedOn('CIW', switchesHere()) ? yes : off('Looked up on the test website only.')),
    waits: 'The new month’s file, imported here each month. For real clients: the published privacy notice.' },
  { id: 'CARE_INSPECTORATE', name: 'Care Inspectorate (Scotland)', does: 'Care services in Scotland, from its downloaded list.', owner: null, calls: [], file: 'CARE_INSPECTORATE',
    switch_name: 'REGISTER_SWITCHES.CARE_INSPECTORATE',
    on: () => (switchedOn('CARE_INSPECTORATE', switchesHere()) ? yes : off('Looked up on the test website only.')),
    waits: 'The new month’s file, imported here each month. For real clients: the published privacy notice.' },
  { id: 'EPC', name: 'Energy certificates (EPC)', does: 'Floor area and age band, after a client signs.', owner: 'EPC', calls: ['EPC'],
    switch_name: 'REGISTER_SWITCHES.EPC', waits: 'For real clients: the privacy notice, once it is published.' },
  { id: 'HMLR_PPD', name: 'HM Land Registry price paid', does: 'What the building sold for.', owner: null, calls: ['HMLR_PPD'],
    switch_name: 'REGISTER_SWITCHES.HMLR_PPD',
    on: () => (switchedOn('HMLR_PPD', switchesHere()) ? yes : off('Looked up on the test website only.')),
    waits: 'For real clients: the privacy notice, once it is published.' },
  { id: 'PLANNING', name: 'Planning history', does: 'Planning applications for the site (planning.data.gov.uk, PlanIt).', owner: null, calls: ['PLANNING', 'PLANNING_DATA'],
    switch_name: 'REGISTER_SWITCHES.PLANNING',
    on: () => (switchedOn('PLANNING', switchesHere()) ? yes : off('Looked up on the test website only.')),
    waits: 'For real clients: the privacy notice. After a client signs, Homedata answers instead, by the property’s own number.' },
  { id: 'HMLR_INSPIRE', name: 'HM Land Registry land boundaries', does: 'Site area, from a council’s boundary file.', owner: null, calls: ['HMLR_INSPIRE'],
    switch_name: 'REGISTER_SWITCHES (land boundary)', on: () => off('Switched off: it needs files a real server keeps.'),
    waits: 'A real server that can keep the boundary files. The developers set it up.' },
  { id: 'OS_FEATURES', name: 'Ordnance Survey building outlines', does: 'The building outlines on the report’s site plan.', owner: 'OS_MAPS', calls: ['OS_FEATURES'],
    switch_name: 'lookupsWaivedHere', waits: 'Nothing for testing. For real clients: the published privacy notice.' },
  { id: 'HOMEDATA', name: 'Homedata', does: '“Find my address” at the assessment. After a client signs: the address, planning history and site boundary.', owner: 'HOMEDATA_ADDRESS',
    calls: ['HOMEDATA_POSTCODE', 'HOMEDATA_ADDRESS', 'HOMEDATA_PLANNING'],
    switch_name: 'ADDRESS_LOOKUP; REGISTER_SWITCHES.HOMEDATA_*; TEST_WEBSITE_PAID_LOOKUPS',
    today: (app) => `Address box today: ${String(searchesToday(app.db, app.now()))} of ${String(ADDRESS_SEARCH_CAP.per_day)} searches (2p each).`,
    waits: 'On for testing (6 Oct 2026). For real clients: the privacy notice naming Homedata.' },
  { id: 'DIDIT', name: 'Didit', does: 'The online identity check.', owner: 'DIDIT_IDV', calls: ['DIDIT_IDV'],
    switch_name: 'IDENTITY_CHECK', waits: 'How long Didit keeps results. Set it in Didit once Sadique agrees how long we keep things. Then the privacy notice.' },
  { id: 'IONOS_EMAIL', name: 'IONOS email sending', does: 'Emails from staff, sign-in codes and calendar invites.', owner: 'IONOS_EMAIL', calls: [],
    switch_name: 'EMAIL_SENDING', waits: 'For real clients: the privacy notice and the engagement letter naming IONOS.' },
  { id: 'IONOS_MAILBOX', name: 'IONOS mailbox reading', does: 'Replies to contact@ come into the back office.', owner: 'IONOS_MAILBOX', calls: [],
    switch_name: 'INBOUND_EMAIL; the cron-job.org timer', waits: 'For real clients: the privacy notice.' },
  { id: 'ZOOM', name: 'Zoom', does: 'Video calls, made on our account and joined inside the back office.', owner: 'ZOOM', calls: ['ZOOM_OAUTH', 'ZOOM_API'],
    switch_name: 'zoomMissing; ZOOM_PLAN', waits: 'For real clients: Sadique’s approval of the transfer. Zoom Pro is optional (40 minutes, no recording on the free plan).' },
  { id: 'WHATSAPP', name: 'WhatsApp (live connection)', does: 'Sending from the back office. Chats are added by hand instead (Phase 156c).', owner: 'WHATSAPP', calls: ['WHATSAPP_CLOUD', 'WHATSAPP_MEDIA'],
    switch_name: 'whatsappMissing', waits: 'Nothing: off on purpose. Staff export a chat on the phone and add it to the record.' },
  { id: 'CLOUDFLARE_TURNSTILE', name: 'Cloudflare Turnstile', does: 'The contact form’s check that a person, not a robot, sent it.', owner: 'CLOUDFLARE_TURNSTILE', calls: ['CLOUDFLARE_TURNSTILE'],
    switch_name: 'turnstileWhy', waits: 'Approved for testing (5 Oct 2026). For real clients: the privacy notice naming Cloudflare.' },
  { id: 'CLAUDE_DOCUMENTS', name: 'Anthropic (reading documents)', does: 'Reads clients’ documents for the facts a claim needs.', owner: 'CLAUDE_DOCUMENTS', calls: ['CLAUDE_DOCUMENTS'],
    switch_name: 'CLAUDE_SWITCHES',
    waits: 'Approved for testing (5 Oct 2026); its reading switches stay off and the key is not on the test website. For real clients: the privacy notice and Sadique’s retention answer.' },
  { id: 'GOOGLE_ANALYTICS', name: 'Google Analytics', does: 'Website visits, after consent.', owner: 'GOOGLE_ANALYTICS', calls: [],
    switch_name: 'GA4_MEASUREMENT_ID', waits: 'Dropped for now (Lakhbir, 4 Oct 2026): the marketing team may pick it up later.' },
] satisfies readonly Connection[]);

/** The services kept off on purpose, or never called from here, that no CONNECTOR_CALLED row is expected for. */
export const RETIRED_CALLS: readonly string[] = Object.freeze(['HMLR_TITLE', 'HMLR_TITLE_TEST']);

export type ConnectionRow = {
  readonly c: Connection;
  readonly keys: readonly { readonly name: string; readonly present: boolean }[];
  readonly on: boolean;
  readonly why_off: string;
  /** 'TESTING' while on (nothing is on for real clients yet); 'OFF' otherwise. */
  readonly use: 'TESTING' | 'OFF';
  readonly last: { readonly at: string; readonly result: string; readonly status: number | null } | null;
  readonly file: { readonly imported_at: string; readonly kept: number; readonly skipped: number; readonly by: string | null; readonly this_month: boolean } | null;
};

/** The newest CONNECTOR_CALLED row for each service, in one query. */
function lastCalls(app: App): Map<string, { at: string; result: string; status: number | null }> {
  const rows = app.db.all<{ s: string | null; at: string; result: string | null; status: number | null }>(
    `SELECT json_extract(a.detail, '$.service') AS s, a.at, json_extract(a.detail, '$.result') AS result, json_extract(a.detail, '$.status') AS status
       FROM audit_log a JOIN (SELECT json_extract(detail, '$.service') AS s, max(seq) AS m FROM audit_log WHERE kind = 'CONNECTOR_CALLED' GROUP BY 1) x
         ON x.m = a.seq`);
  const out = new Map<string, { at: string; result: string; status: number | null }>();
  for (const r of rows) if (r.s !== null) out.set(r.s, { at: r.at, result: r.result ?? 'unknown', status: r.status });
  return out;
}

/** The last time email was sent, or the mailbox read, from their own records (they are not CONNECTOR_CALLED rows). */
function lastMail(app: App, id: string): { at: string; result: string; status: number | null } | null {
  if (id === 'IONOS_EMAIL') {
    const r = app.db.get<{ at: string | null }>('SELECT max(sent_at) AS at FROM outbox WHERE sent_at IS NOT NULL');
    return r?.at == null ? null : { at: r.at, result: 'SENT', status: null };
  }
  if (id === 'IONOS_MAILBOX') {
    const r = app.db.get<{ at: string; failed: number }>('SELECT last_try_at AS at, last_failed AS failed FROM mailbox_reads WHERE id = 1');
    return r === undefined ? null : { at: r.at, result: r.failed === 1 ? 'FAILED' : 'OK', status: null };
  }
  return null;
}

/** True when the import happened in the same calendar month as now (UK time). */
function sameMonth(a: string, b: string): boolean {
  const x = localPartsOf(Date.parse(a)), y = localPartsOf(Date.parse(b));
  return x.year === y.year && x.month === y.month;
}

export function lastImport(app: App, source: FileSourceId): ConnectionRow['file'] {
  const r = app.db.get<{ imported_at: string; rows_kept: number; rows_skipped: number; who: string | null }>(
    `SELECT i.imported_at, i.rows_kept, i.rows_skipped, u.display_name AS who FROM register_file_imports i LEFT JOIN users u ON u.id = i.by_user
      WHERE i.source_id = ? ORDER BY i.imported_at DESC, i.rowid DESC LIMIT 1`, [source]);
  return r === undefined ? null : { imported_at: r.imported_at, kept: r.rows_kept, skipped: r.rows_skipped, by: r.who, this_month: sameMonth(r.imported_at, app.now()) };
}

/** Every row of the page. Admin only; anyone else gets nothing. */
export function connectionsView(app: App, actor: Actor): readonly ConnectionRow[] {
  if (actor.role !== 'ADMIN') return [];
  const calls = lastCalls(app);
  return CONNECTIONS.map((c): ConnectionRow => {
    const keys = c.owner === null ? [] : SECRET_KEYS.filter((k) => k.owner === c.owner && k.retired === undefined)
      .map((k) => ({ name: k.name, present: app.secrets.forOwner(k.owner).has(k.name) }));
    const st = c.on !== undefined ? c.on(app) : c.owner === null ? off('Not switched on.') : serviceOn(app, c.owner);
    const newest = c.calls.map((id) => calls.get(id)).filter((x) => x !== undefined).sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? lastMail(app, c.id);
    return { c, keys, on: st.on, why_off: st.why, use: st.on ? 'TESTING' : 'OFF', last: newest ?? null, file: c.file === undefined ? null : lastImport(app, c.file) };
  });
}

/** PHASE 156e: a regulator's list not imported this calendar month, for Home's Admin view. Null when both are current. */
export function listsToImport(app: App): string | null {
  const due = (Object.keys(FILE_SOURCES) as FileSourceId[]).filter((s) => TEST_WEBSITE_LOOKUPS.sources.includes(s))
    .filter((s) => { const f = lastImport(app, s); return f === null || !f.this_month; });
  if (due.length === 0) return null;
  const names = due.map((s) => CONNECTIONS.find((c) => c.file === s)?.name ?? s);
  return `${names.join(' and ')}: import this month’s list${due.length === 1 ? '' : 's'} on the Connections page.`;
}

/* ================================================================== *
 * THE PAGE
 * ================================================================== */

const RESULT_WORDS: Readonly<Record<string, string>> = {
  OK: 'worked', SENT: 'sent', REFUSED: 'refused here', RATE_LIMITED: 'held back by our limit', HTTP_ERROR: 'the service said no',
  TIMEOUT: 'no answer in time', NETWORK: 'not reached', TOO_LARGE: 'answer too big', FAILED: 'failed',
};

/** Words for the browser script: the columns each list keeps, so only they leave the Admin's computer. */
function keptColumns(source: FileSourceId): string[] {
  const f = FILE_SOURCES[source];
  return [f.ref, f.postcode, ...f.address, ...Object.values(f.fields)].filter((c): c is string => typeof c === 'string')
    .filter((c, i, a) => a.indexOf(c) === i);
}

function fileCell(r: ConnectionRow, now: string): Safe {
  if (r.c.file === undefined) return raw('');
  return h`<div class="conn-file">
    <p class="help">${r.file === null ? 'Never imported.' : `Last imported ${localStamp(r.file.imported_at, now)}${r.file.by === null ? '' : ` by ${r.file.by}`}: ${String(r.file.kept)} services kept, ${String(r.file.skipped)} passed over.`}
      ${r.file !== null && !r.file.this_month ? h` <strong>Import this month’s list.</strong>` : raw('')}</p>
    <form method="get" action="/staff/connections/import" class="inline"><input type="hidden" name="list" value="${r.c.file}">
      <button class="btn-quiet" type="submit">Import a new list</button></form></div>`;
}

/** PHASE 156e: the import page for one list - the form the script trims a file from. */
export function importPage(app: App, actor: Actor, nav: Safe, source: FileSourceId): string {
  const src = FILE_SOURCES[source];
  const last = actor.role === 'ADMIN' ? lastImport(app, source) : null;
  return page({
    title: `Import ${src.publisher}’s list`, nav,
    body: h`<p><a href="/staff/connections#conn-${source}">Back to Connections</a></p>
      <h1>Import ${src.publisher}’s list</h1>
      <p class="lede">${last === null ? 'Never imported.' : `Last imported ${localStamp(last.imported_at, app.now())}: ${String(last.kept)} services kept.`} The new file replaces the old list whole.</p>
      <form method="post" action="/staff/connections/register/${source}" enctype="multipart/form-data" class="conn-import"
        data-encoding="${src.encoding}" data-delimiter="${src.delimiter}" data-columns="${JSON.stringify(keptColumns(source))}">
        <label class="fl" for="file-${source}">The file from ${src.download}</label>
        <input class="fi" id="file-${source}" name="file" type="file" accept=".csv,text/csv" required>
        <button class="cta" type="submit">Import it</button>
        <p class="help conn-note" role="status">Only the columns we keep are sent. Names, phone numbers and emails in the file stay on this computer.</p>
      </form>`,
  });
}

export function connectionsPage(app: App, actor: Actor, nav: Safe, done: string | null): string {
  const now = app.now();
  const rows = connectionsView(app, actor);
  const on = rows.filter((r) => r.on).length;
  return page({
    title: 'Connections', nav, wide: true,
    body: h`<div class="pagehead"><div><h1>Connections</h1>
      <p class="lede">Every outside service the system uses. ${String(on)} of ${String(rows.length)} are on, all for testing only: none is on for real clients yet.</p></div></div>
      ${done === null ? raw('') : h`<p class="saved" role="status">${done}</p>`}
      <p class="help">A key shows only as there or not, never its value. Keys are changed on Home’s Admin tab. This page changes nothing else.</p>
      <table class="stack dash-table conn-table"><thead><tr><th>Service</th><th>Key</th><th>Switched on</th><th>For</th><th>Last call</th><th>Waits on</th></tr></thead><tbody>${
        rows.map((r) => h`<tr id="conn-${r.c.id}">
          <td data-label="Service"><strong>${r.c.name}</strong><br><span class="help">${r.c.does}</span>${r.c.today === undefined ? raw('') : h`<p class="help conn-today">${r.c.today(app)}</p>`}${fileCell(r, now)}</td>
          <td data-label="Key">${r.keys.length === 0 ? h`<span class="help">No key needed</span>` : h`<ul class="dash-list">${r.keys.map((k) => h`<li><code>${k.name}</code> <span class="chip ${k.present ? 'key-on' : 'key-off'}">${k.present ? 'There' : 'Not set'}</span></li>`)}</ul>`}</td>
          <td data-label="Switched on">${r.on ? h`<span class="chip key-on">On</span>` : h`<span class="chip key-idle">Off</span> <span class="help">${r.why_off}</span>`}<br><span class="help"><code>${r.c.switch_name}</code></span></td>
          <td data-label="For">${r.use === 'TESTING' ? 'Testing only' : 'Nothing yet'}</td>
          <td data-label="Last call">${r.last === null ? h`<span class="help">Never from here</span>` : `${localStamp(r.last.at, now)}: ${RESULT_WORDS[r.last.result] ?? r.last.result.toLowerCase()}${r.last.status === null ? '' : ` (${String(r.last.status)})`}`}</td>
          <td data-label="Waits on">${r.c.waits}</td></tr>`)}</tbody></table>
      <p class="help">Testing only means the test website uses it, with made-up clients. Each one has a written yes from Lakhbir.
        ${lookupsWaivedHere() ? '' : 'This copy is not the test website, so the free lookups are off here.'}</p>`,
  });
}

/* ================================================================== *
 * THE ROUTES
 * ================================================================== */

/** The test website takes about 4.5 MB a request; a file over this goes trimmed by the page's script. */
export const ONE_REQUEST_BYTES = Math.floor(4.4 * 1024 * 1024);

export type ConnectionsDeps = {
  readonly app: App; readonly nav: (a: Actor) => Safe;
  readonly problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string) => 'handled';
};
type WebResult = 'handled' | 'not-mine';

export async function handleConnections(
  d: ConnectionsDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
): Promise<WebResult> {
  const path = url.pathname;
  if (path === '/staff/connections' && method === 'GET') {
    if (actor.role !== 'ADMIN') return d.problem(res, actor, 'Not for you', 'The Connections page is for Admin.', '/staff');
    const k = url.searchParams.get('done');
    const kept = url.searchParams.get('kept');
    const done = k !== null && (k === 'CIW' || k === 'CARE_INSPECTORATE')
      ? `Imported ${FILE_SOURCES[k].publisher}’s list: ${kept ?? '0'} services kept. The old list is replaced.` : null;
    res.writeHead(200, HTML_HEADERS);
    res.end(connectionsPage(d.app, actor, d.nav(actor), done));
    return 'handled';
  }
  if (path === '/staff/connections/import' && method === 'GET') {
    if (actor.role !== 'ADMIN') return d.problem(res, actor, 'Not for you', 'Importing a regulator’s list is for Admin.', '/staff');
    const list = url.searchParams.get('list');
    if (list !== 'CIW' && list !== 'CARE_INSPECTORATE') return d.problem(res, actor, 'No such list', 'Choose a list on the Connections page.', '/staff/connections');
    res.writeHead(200, CONNECTIONS_PAGE_HEADERS);
    res.end(withImportScript(importPage(d.app, actor, d.nav(actor), list)));
    return 'handled';
  }
  const m = /^\/staff\/connections\/register\/(CIW|CARE_INSPECTORATE)$/.exec(path);
  if (m !== null && method === 'POST') {
    const source = m[1] as FileSourceId;
    const back = '/staff/connections';
    if (actor.role !== 'ADMIN') return d.problem(res, actor, 'Not imported', 'Only Admin may import a regulator’s list.', back);
    let raw0: Buffer;
    try { raw0 = await body(req, ONE_REQUEST_BYTES + 64 * 1024); } catch {
      return d.problem(res, actor, 'Not imported', 'That file is too big to come through the website in one go. Choose it again with the page’s script on: it sends only the columns we keep.', back);
    }
    const up = singleFile(new Uint8Array(raw0), req.headers['content-type']);
    if (!up.ok) return d.problem(res, actor, 'Not imported', `Choose the file first (${up.why}).`, back);
    // Trimmed by the page's script: already UTF-8, holding only the kept columns. Otherwise the publisher's own bytes.
    const text = up.fields['trimmed'] === '1' ? Buffer.from(up.part.bytes).toString('utf8') : decodeRegisterFile(up.part.bytes, source);
    try {
      const r = importRegisterFile({ db: d.app.db, audit: d.app.audit, now: d.app.now }, source, text,
        (up.fields['filename'] ?? up.part.filename ?? 'uploaded file').slice(0, 200), { id: actor.id, role: actor.role });
      res.writeHead(303, { location: `${back}?done=${source}&kept=${String(r.kept)}#conn-${source}` }); res.end();
      return 'handled';
    } catch (e) {
      return d.problem(res, actor, 'Not imported', e instanceof RegisterFileError ? `${e.message}.` : 'That file could not be read.', back);
    }
  }
  return 'not-mine';
}

/** The import page's own policy: our one script and nothing else from outside. */
export const CONNECTIONS_PAGE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
});

export function withImportScript(html: string): string {
  const i = html.lastIndexOf('</body>');
  return i < 0 ? html : `${html.slice(0, i)}<script src="/assets/register-import.js"></script>${html.slice(i)}`;
}

