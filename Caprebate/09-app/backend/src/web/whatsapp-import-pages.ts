/**
 * PHASE 156c, 5 October 2026 — THE PAGES AND ROUTES FOR ADDING A CHAT EXPORTED ON THE WHATSAPP PHONE.
 *
 *   POST /staff/clients/:id/whatsapp/import                    the upload (multipart): the whole export, or — when the
 *                                                               page's script opened a big .zip here — its text and names
 *   GET  /staff/clients/:id/whatsapp/import/:iid               the check (?us= and ?from= recount it)
 *   POST /staff/clients/:id/whatsapp/import/:iid               save (us, from), or cancel
 *   GET  /staff/clients/:id/whatsapp/import/:iid/waiting       the file names still to add, as JSON, for the script
 *   POST /staff/clients/:id/whatsapp/import/:iid/file          one file from the export (multipart), after saving
 *
 * Who: `client_message.write` — Admin and Sales (src/web/whatsapp-import.ts authorises every step). The logic is in
 * src/web/whatsapp-import.ts; the reader in src/connectors/whatsapp-export.ts; the script in whatsapp-import-script.ts.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, type Safe } from './html.ts';
import { savedMessage } from './components.ts';
import { boundaryOf, parseMultipart, MultipartError, type Part } from './multipart.ts';
import { ukDate } from './localtime.ts';
import type { FsObjectStore } from './objectstore.ts';
import {
  addImportFile, cancelImport, importCheck, importFilesWaiting, saveImport, startImport, IMPORT_MAX_FILE, IMPORT_MAX_ZIP,
} from './whatsapp-import.ts';
import { WHATSAPP_PAGE_HEADERS, withImportScript } from './whatsapp-page.ts';

type WebResult = 'handled' | 'not-mine';

export type ImportPageDeps = {
  app: App; store: FsObjectStore;
  nav: (actor: Actor) => Safe;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

const BASE = /^\/staff\/clients\/([A-Za-z0-9-]+)\/whatsapp\/import(?:\/([0-9a-f-]{36})(?:\/(waiting|file))?)?$/;

function redirect(res: ServerResponse, to: string): void { res.writeHead(303, { location: to }); res.end(); }

const field = (parts: readonly Part[], name: string): string => {
  const p = parts.find((x) => x.name === name && x.filename === undefined);
  return p === undefined ? '' : Buffer.from(p.bytes).toString('utf8').trim().slice(0, 300);
};
const filePart = (parts: readonly Part[], name: string): Part | undefined => parts.find((x) => x.name === name && x.filename !== undefined && x.bytes.length > 0);

export async function handleWhatsAppImport(
  d: ImportPageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
): Promise<WebResult> {
  const m = BASE.exec(url.pathname);
  if (m === null) return 'not-mine';
  const business_id = m[1] ?? '';
  const iid = m[2] ?? null;
  const tail = m[3] ?? null;
  const back = `/staff/clients/${business_id}/whatsapp`;

  /* ---- THE UPLOAD ---- */
  if (iid === null && method === 'POST') {
    let raw0: Buffer;
    try { raw0 = await body(req, IMPORT_MAX_ZIP + 256 * 1024); } catch { return d.problem(res, actor, 'Not added', 'That file is too big to come through the website. Choose the .zip again: the page opens a big one on this computer.', back); }
    const boundary = boundaryOf(req.headers['content-type']);
    if (boundary === null) return d.problem(res, actor, 'Not added', 'Choose the exported chat first.', back);
    let parts: Part[];
    try { parts = parseMultipart(new Uint8Array(raw0), boundary); } catch (e) { return d.problem(res, actor, 'Not added', e instanceof MultipartError ? e.message : 'That upload could not be read.', back); }
    const whole = filePart(parts, 'export');
    const chat = filePart(parts, 'chat');
    const names = filePart(parts, 'names');
    const r = await startImport(d.app, d.store, actor, business_id, {
      contact_id: field(parts, 'contact_id'),
      filename: field(parts, 'filename') || whole?.filename || 'WhatsApp chat',
      whole: chat === undefined && whole !== undefined ? Buffer.from(whole.bytes) : null,
      chat: chat === undefined ? null : Buffer.from(chat.bytes),
      names: names === undefined ? null : Buffer.from(names.bytes).toString('utf8').split('\n').map((n) => n.trim()).filter((n) => n !== ''),
    });
    if (!r.ok) return d.problem(res, actor, 'Not added', r.why, back);
    redirect(res, `${back}/import/${r.id}`);
    return 'handled';
  }
  if (iid === null) return 'not-mine';

  /* ---- THE FILE NAMES STILL TO ADD, FOR THE SCRIPT ---- */
  if (tail === 'waiting' && method === 'GET') {
    const names = importFilesWaiting(d.app, actor, business_id, iid);
    res.writeHead(names === null ? 404 : 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify({ waiting: names ?? [], max_bytes: IMPORT_MAX_FILE }));
    return 'handled';
  }

  /* ---- ONE FILE FROM THE EXPORT ---- */
  if (tail === 'file' && method === 'POST') {
    const here = `${back}/import/${iid}`;
    let raw0: Buffer;
    try { raw0 = await body(req, IMPORT_MAX_FILE + 64 * 1024); } catch { return answer(res, req, d, actor, false, 'That file is too big.', here); }
    const boundary = boundaryOf(req.headers['content-type']);
    let parts: Part[] = [];
    try { if (boundary !== null) parts = parseMultipart(new Uint8Array(raw0), boundary); } catch { /* answered below */ }
    const f = filePart(parts, 'file');
    if (f === undefined) return answer(res, req, d, actor, false, 'Choose a file first.', here);
    const r = await addImportFile(d.app, d.store, actor, business_id, iid, field(parts, 'name') || f.filename || '', f.bytes);
    return answer(res, req, d, actor, r.ok, r.ok ? 'Added.' : r.why, `${here}?done=file`);
  }

  /* ---- SAVE OR CANCEL ---- */
  if (tail === null && method === 'POST') {
    const f = await form(req);
    const here = `${back}/import/${iid}`;
    if (f.get('cancel') === '1') {
      const r = cancelImport(d.app, actor, business_id, iid);
      if (!r.ok) return d.problem(res, actor, 'Not cancelled', r.why, here);
      redirect(res, `${back}?done=whatsapp-import-cancelled`);
      return 'handled';
    }
    const r = await saveImport(d.app, d.store, actor, business_id, iid, { us: f.get('us') ?? '', from: f.get('from') ?? '' });
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, here);
    redirect(res, r.files_waiting > 0 ? `${here}?done=saved` : `${back}?done=whatsapp-import-saved`);
    return 'handled';
  }

  /* ---- THE CHECK ---- */
  if (tail === null && method === 'GET') {
    const c = await importCheck(d.app, d.store, actor, business_id, iid, { us: url.searchParams.get('us'), from: url.searchParams.get('from') });
    if (c === null) return d.problem(res, actor, 'Not found', 'That upload is not there. Add the chat again.', back);
    const waiting = c.status === 'SAVED' ? (importFilesWaiting(d.app, actor, business_id, iid) ?? []) : [];
    const done = url.searchParams.get('done');
    const here = `${back}/import/${iid}`;
    const bodyHtml = h`${done === 'saved' ? savedMessage(`Saved: ${String(c.added ?? 0)} message${c.added === 1 ? '' : 's'} added. Now add the photos and files.`) : done === 'file' ? savedMessage('File added.') : raw('')}
      <h1>${c.status === 'SAVED' ? 'WhatsApp chat added' : 'Check the WhatsApp chat'}</h1>
      <p><a href="${back}">Back to the WhatsApp page</a></p>
      <dl class="facts">
        <dt>File</dt><dd>${c.filename}</dd>
        <dt>Chat with</dt><dd>${c.contact_name}${c.contact_agreed ? '' : ' — did not tick the WhatsApp box on the assessment (the messages are kept: decided 5 Oct 2026)'}</dd>
        <dt>In the export</dt><dd>${String(c.messages)} message${c.messages === 1 ? '' : 's'}, ${c.first} to ${c.last}</dd>
        <dt>Names in it</dt><dd>${c.senders.join(' and ')}</dd>
      </dl>
      ${c.dates_could_be_month_first ? h`<div class="gate" role="note"><strong>Check the dates.</strong> No day in this chat is after the 12th, so the phone could have written them month first. They are read day first (UK): the first is ${ukDate(c.first_date)}. If that is wrong, the phone's region is not the UK; tell us before saving.</div>` : raw('')}
      ${c.status === 'CHECKING' ? checkForm(here, c) : addFiles(here, waiting, c.whole_zip_kept)}`;
    res.writeHead(200, WHATSAPP_PAGE_HEADERS);
    res.end(withImportScript(page({ title: c.status === 'SAVED' ? 'WhatsApp chat added' : 'Check the WhatsApp chat', nav: d.nav(actor), wide: true, body: bodyHtml })));
    return 'handled';
  }
  return 'not-mine';
}

function checkForm(here: string, c: Awaited<ReturnType<typeof importCheck>> & object): Safe {
  return h`<form method="get" action="${here}" class="pblock">
      <fieldset><legend>Which name is us (Cap Rebate)?</legend>
        ${c.senders.map((s, i) => h`<p><input type="radio" name="us" id="us-${String(i)}" value="${s}"${c.us === s ? raw(' checked') : raw('')} required> <label for="us-${String(i)}">${s}</label></p>`)}
      </fieldset>
      <label class="fl" for="from">Keep the messages from</label>
      <input class="fi" type="date" id="from" name="from" value="${c.from_date}" min="${c.first_date}" max="${c.last_date}" required>
      <p class="help">An export always holds the whole history of the chat. Keep only what belongs on this client’s record.</p>
      <p><button class="btn-quiet" type="submit">Count again</button></p>
    </form>
    <div class="pblock">
      <p><strong>${String(c.to_add)} message${c.to_add === 1 ? '' : 's'} will be added</strong>${c.already > 0 ? `, and ${String(c.already)} ${c.already === 1 ? 'is' : 'are'} on the record already` : ''}${c.files > 0 ? `, with ${String(c.files)} photo${c.files === 1 ? '' : 's'} or file${c.files === 1 ? '' : 's'}` : ''}.</p>
      ${c.files_not_kept > 0 ? h`<p class="help">${String(c.files_not_kept)} file${c.files_not_kept === 1 ? ' is' : 's are'} of a kind we do not keep (a contact card, for example): the message says so, the file is left out.</p>` : raw('')}
      ${c.omitted > 0 ? h`<p class="help">${String(c.omitted)} file${c.omitted === 1 ? ' was' : 's were'} not in the export (exported without media, or too big): the message says so.</p>` : raw('')}
      ${c.us === null ? h`<p class="help">Choose which name is us, then Count again.</p>` : h`<form method="post" action="${here}">
        <input type="hidden" name="us" value="${c.us}"><input type="hidden" name="from" value="${c.from_date}">
        <button class="cta" type="submit">Save to the record</button></form>`}
      <form method="post" action="${here}"><input type="hidden" name="cancel" value="1"><button class="btn-quiet" type="submit">Cancel — add nothing</button></form>
    </div>`;
}

function addFiles(here: string, waiting: readonly string[], zipKept: boolean): Safe {
  if (waiting.length === 0) return h`<p>All the photos and files are added. <a href="${here.replace(/\/import\/.*$/, '')}">See the conversation</a>.</p>`;
  return h`<div class="pblock" id="wa-files" data-waiting="${here}/waiting" data-file="${here}/file">
      <h2>Add the photos and files</h2>
      <p>${String(waiting.length)} photo${waiting.length === 1 ? '' : 's'} or file${waiting.length === 1 ? '' : 's'} from the dates you kept ${waiting.length === 1 ? 'is' : 'are'} still to add.${zipKept ? ' The export that was kept could not give them.' : ''}</p>
      <form method="post" action="${here}/file" enctype="multipart/form-data" id="wa-files-form">
        <label class="fl" for="wa-files-zip">Choose the same exported .zip again (or one photo or file from it)</label>
        <input class="fi" id="wa-files-zip" name="file" type="file" required>
        <p class="help" id="wa-files-note">With the .zip, only the files listed below are sent, one at a time. Each must be under ${String(Math.floor(IMPORT_MAX_FILE / (1024 * 1024)))} MB (the test website takes about 4.5 MB at a time).</p>
        <p><button class="cta" type="submit">Add</button></p>
      </form>
      <details><summary>The files still to add</summary><ul>${waiting.slice(0, 200).map((n) => h`<li>${n}</li>`)}</ul></details>
    </div>`;
}

/** A file step's answer: JSON for the script, a page for a person without it. */
function answer(res: ServerResponse, req: IncomingMessage, d: ImportPageDeps, actor: Actor, ok: boolean, words: string, to: string): 'handled' {
  if ((req.headers.accept ?? '').includes('application/json')) {
    res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify({ ok, words }));
    return 'handled';
  }
  if (!ok) return d.problem(res, actor, 'Not added', words, to.replace(/\?.*$/, ''));
  redirect(res, to);
  return 'handled';
}
