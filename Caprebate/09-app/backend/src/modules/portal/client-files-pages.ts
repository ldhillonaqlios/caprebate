/**
 * THE CLIENT'S FILES. "Back office and portal clean-up, 7 of 11."
 *
 * the owner: "There is no folder icon which allows the user to see what the customer has uploaded, but also the ability to
 * upload and save documents ourselves within the portal."
 *
 *   GET  /staff/clients/:id/files          the company's files, in folders — From the client, From Cap Rebate, Asked
 *                                          for (still waiting), one per claim. `?folder=` names a folder by its key
 *                                          (ids only, never a name).
 *   POST /staff/clients/:id/files          a member of staff uploads a file: a file picker that also takes a dropped
 *                                          file, what it is, which claim, and whether the client can see it (no, unless
 *                                          ticked).
 *   POST /staff/documents/:id/shown        show one of our files to the client, or stop showing it.
 *
 * ONE WAY IN FOR A FILE. `receiveFile` (src/modules/claims/receive-file.ts since Phase 161l2) is the whole of a staff upload, and it is EXACTLY the path a client's upload
 * takes through PUT /upload/put: `startDocumentUpload` (which asks `document.upload` and issues a single-use key),
 * `acceptClientBytes` (the key, the size cap and the content check, on the bytes) and `finishUpload` (the upload
 * handler's receipt contract — classify, read, strip, write, delete the quarantined copy). It only saves the person a
 * second page with an address on it: THERE IS NO HTTP PUT ADDRESS ON ANY SCREEN NOW, staff or portal.
 *
 * NO SCRIPT. The content security policy allows none, and none is needed: a browser's own file picker takes a file
 * dropped onto it, so the drop area is the picker, drawn large.
 *
 * NOTHING HERE DECIDES WHO SEES WHAT. src/modules/claims/documents.ts builds the folder and asks `document.read` of every file;
 * src/core/authz.ts decides whether a client may see a file.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../../core/app.ts';
import { authorise, type Actor } from '../../core/index.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from '../../shared/index.ts';
import { badge, breadcrumb, claimRef, highlights, propertyIn, savedMessage, why } from '../../shared/index.ts';
import { crmModule as C } from '../crm/index.ts';
// The folder icon, the Files button and the folder tiles are the client page's (src/modules/crm/client-layout.ts).
import { folderTiles } from '../crm/index.ts';
import { documentsModule as D } from '../claims/index.ts';
import type { FsObjectStore } from '../../shared/index.ts';
import { piecesOf, piecesPage } from '../../core/index.ts';
import { sweepOriginals } from '../claims/index.ts';
// One way in for a file, and the question about a name: the claims' (moved there by Phase 161l2).
import { earlyQuestions, readUpload, receiveFile } from '../claims/index.ts';
import { NO_DUE_DATE } from '../clients/index.ts';
import { earlyVouchesFrom } from '../claims/index.ts';

export type WebResult = 'handled' | 'not-mine';

export type ClientFilesDeps = {
  app: App;
  store: FsObjectStore;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

function html(res: ServerResponse, status: number, body: string): void {
  // An upload form's page also gets the script that sends a big file in pieces.
  const p = piecesPage(HTML_HEADERS, body);
  res.writeHead(status, p.headers);
  res.end(p.body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

const DONE: Readonly<Record<string, string>> = Object.freeze({
  uploaded: 'Uploaded. We have read it.',
  shown: 'The client can see that file now.',
  hidden: 'The client can no longer see that file.',
});

const FOLDER_KEY = /^(client|ours|asked|claim-[A-Za-z0-9-]+)$/;

export async function handleClientFiles(
  d: ClientFilesDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;

  const files = /^\/staff\/clients\/([A-Za-z0-9-]+)\/files$/.exec(path);
  if (files && method === 'GET') {
    const org = C.organisationView(db, actor, files[1] ?? '');
    await sweepOriginals({ db, store: d.store, now: d.app.now, audit: d.app.audit }, actor);
    const f = D.clientFolder({ db, now: d.app.now }, actor, org);
    const asked = url.searchParams.get('folder') ?? '';
    const key = FOLDER_KEY.test(asked) && f.folders.some((x) => x.key === asked) ? asked : null;
    html(res, 200, folderPage(d, actor, f, key, url.searchParams.get('done') ?? undefined));
    return 'handled';
  }
  if (files && method === 'POST') {
    const id = files[1] ?? '';
    const back = `/staff/clients/${id}/files`;
    // The company is read through its own rule first: a login that may not see it learns nothing from a refusal.
    const org = C.organisationView(db, actor, id);
    // Asked before a byte of the body is read: a login that may not upload is refused, not told its file was malformed.
    authorise(actor, 'document.upload', { type: 'business', id: org.id });
    if (actor.role === 'CLIENT') return d.problem(res, actor, 'Not uploaded', 'Send files from your own page.', '/portal');
    const up = await readUpload(req, body, piecesOf(d.app, d.store, actor));
    if (!up.ok) return d.problem(res, actor, 'Not uploaded', up.why, back);
    const claim = (up.fields.claim_id ?? '').trim();
    if (claim !== '' && !org.claims.some((c) => c.id === claim)) return d.problem(res, actor, 'Not uploaded', 'Choose one of this company’s claims.', back);
    const r = await receiveFile(d, actor, {
      business_id: org.id, type_code: up.fields.type_code ?? null, logical_document_id: null, request_id: null,
      claim_id: claim === '' ? null : claim, shown_to_client: up.fields.shown_to_client === 'yes',
      // The question about a name, answered on this form so the first reading can keep it.
      early_vouch: earlyVouchesFrom((n) => up.fields[n]),
    }, up.bytes);
    if (!r.ok) return d.problem(res, actor, 'Not uploaded', r.why, back);
    redirect(res, `${back}?folder=ours&done=uploaded`);
    return 'handled';
  }

  const shown = /^\/staff\/documents\/([A-Za-z0-9-]+)\/shown$/.exec(path);
  if (shown && method === 'POST') {
    const f = await form(req);
    const r = D.setShownToClient({ db, audit: d.app.audit, now: d.app.now, newId: d.newId }, actor, shown[1] ?? '', f.get('shown_to_client') === 'yes');
    if (!r.ok) return d.problem(res, actor, 'Not changed', r.why, '/staff/clients');
    const folder = f.get('folder') ?? '';
    redirect(res, `/staff/clients/${r.business_id ?? ''}/files?${FOLDER_KEY.test(folder) ? `folder=${folder}&` : ''}done=${f.get('shown_to_client') === 'yes' ? 'shown' : 'hidden'}`);
    return 'handled';
  }

  return 'not-mine';
}

/* ------------------------------------------------------------------ *
 * THE PAGE
 * ------------------------------------------------------------------ */

function fileCard(f: D.FolderFile, mayShow: boolean, folder: string | null): Safe {
  return h`<li class="tile filecard${f.state === 'REFUSED' ? ' refused' : ''}">
    <p class="tilename"><a href="${f.href}">${f.name}</a></p>
    <p class="filefrom">${f.sender} · ${f.sent}${f.versions > 1 ? ` · ${f.versions} versions` : ''}</p>
    ${f.message_href === undefined ? raw('') : h`<p><a href="${f.message_href}">See the message it came with</a></p>`}
    <p>${f.original.kept
      ? (f.original.href === null ? h`<span class="help">We kept the original. Only Admin, Sales and the data protection officer can open it.</span>` : h`<a href="${f.original.href}">Open the original</a>`)
      : h`<span class="help">${f.original.words}</span>`}</p>
    <ul class="fileread">${f.read.map((line) => h`<li>${line}</li>`)}</ul>
    <p>${f.shown_to_client ? badge('The client can see this', 'ok') : badge('Only Cap Rebate can see this')}</p>
    ${mayShow && f.from === 'US' ? h`<form method="post" action="/staff/documents/${f.id}/shown" class="inline">
      <input type="hidden" name="shown_to_client" value="${f.shown_to_client ? 'no' : 'yes'}">
      ${folder === null ? raw('') : h`<input type="hidden" name="folder" value="${folder}">`}
      <button type="submit">${f.shown_to_client ? 'Hide it from the client' : 'Let the client see it'}</button></form>` : raw('')}
  </li>`;
}

function uploadForm(f: D.ClientFolder): Safe {
  if (!f.may_upload || f.upload_types.length === 0) return raw('');
  return h`<form method="post" action="/staff/clients/${f.business_id}/files" enctype="multipart/form-data" class="pblock uploadbox" data-pieces>
    <h2>Upload a file</h2>
    <label class="dropzone" for="upload-file"><span class="dropwords">Drop a file here, or tap to choose one</span>
      <input id="upload-file" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"></label>
    <label class="fl" for="upload-type">What is it?</label>
    <select class="fi" id="upload-type" name="type_code">${f.upload_types.map((t) => h`<option value="${t.code}">${t.label}</option>`)}</select>
    ${f.claims.length === 0 ? raw('') : h`<label class="fl" for="upload-claim">Which claim is it for?</label>
      <select class="fi" id="upload-claim" name="claim_id"><option value="">The whole company</option>${f.claims.map((c) => h`<option value="${c.id}">${propertyIn(f.company, c.name) ?? c.name} (${c.ref})</option>`)}</select>`}
    <label class="tickbox"><input type="checkbox" name="shown_to_client" value="yes"> Let the client see this file</label>
    ${earlyQuestions(f.early_questions, `up-${f.business_id}`)}
    <button class="cta" type="submit">Upload</button>
    <div class="help">${why('Your file goes through the same safety checks as a client’s. We read it, keep what we need, and delete the original. The client cannot see it unless you tick the box.')}</div>
  </form>`;
}

function folderPage(d: ClientFilesDeps, actor: Actor, f: D.ClientFolder, key: string | null, done: string | undefined): string {
  const inFolder = (k: string | null): readonly D.FolderFile[] => k === null ? f.files
    : k === 'client' ? f.files.filter((x) => x.from === 'CLIENT')
      : k === 'ours' ? f.files.filter((x) => x.from === 'US')
        : f.files.filter((x) => x.claim_ids.includes(k.slice('claim-'.length)));
  const title = key === null ? 'Every file' : (f.folders.find((x) => x.key === key)?.name ?? 'Files');
  const list = key === 'asked'
    ? ((f.asked ?? []).length === 0 ? h`<p class="help">Nothing is waiting. Ask for a file from a claim’s page.</p>`
      : h`<ul class="tiles">${(f.asked ?? []).map((r) => h`<li class="tile filecard${r.due.overdue ? ' late' : ''}">
          <p class="tilename">${r.type.label}</p><p>${r.why}</p>
          <p class="filefrom">Asked ${r.asked}${r.due.label === NO_DUE_DATE ? '' : ` · ${r.due.label}`}</p>
          ${r.claim === null ? raw('') : h`<p>${claimRef(r.claim.claim_ref)}</p>`}</li>`)}</ul>`)
    : inFolder(key).length === 0 ? h`<p class="help">No files here yet.</p>`
      : h`<ul class="tiles">${inFolder(key).map((x) => fileCard(x, f.may_show, key))}</ul>`;
  return page({
    title: `${f.company} — files`, nav: d.nav(actor), wide: true,
    body: h`${breadcrumb([{ label: 'Clients', href: '/staff/clients' }, { label: f.company, href: `/staff/clients/${f.business_id}` }, { label: 'Files' }])}
      ${highlights('Files', f.company, [])}
      ${done !== undefined && DONE[done] !== undefined ? savedMessage(DONE[done]) : raw('')}
      ${folderTiles(f, key)}
      ${uploadForm(f)}
      <h2>${title}${key === null ? raw('') : h` <a class="small" href="/staff/clients/${f.business_id}/files">Show every file</a>`}</h2>
      ${list}
      <p><a href="/staff/clients/${f.business_id}">Back to ${f.company}</a></p>`,
  });
}

