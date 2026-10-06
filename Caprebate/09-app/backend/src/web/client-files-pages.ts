/**
 * THE CLIENT'S FILES — Phase 140, 21 September 2026. "Back office and portal clean-up, 7 of 11."
 *
 * Lakhbir: "There is no folder icon which allows the user to see what the customer has uploaded, but also the ability to
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
 * ONE WAY IN FOR A FILE. `receiveFile` below is the whole of a staff upload, and it is EXACTLY the path a client's upload
 * takes through PUT /upload/put: `startDocumentUpload` (which asks `document.upload` and issues a single-use key),
 * `acceptClientBytes` (the key, the size cap and the content check, on the bytes) and `finishUpload` (the upload
 * handler's receipt contract — classify, read, strip, write, delete the quarantined copy). It only saves the person a
 * second page with an address on it: THERE IS NO HTTP PUT ADDRESS ON ANY SCREEN NOW, staff or portal.
 *
 * NO SCRIPT. The content security policy allows none, and none is needed: a browser's own file picker takes a file
 * dropped onto it, so the drop area is the picker, drawn large.
 *
 * NOTHING HERE DECIDES WHO SEES WHAT. src/web/documents.ts builds the folder and asks `document.read` of every file;
 * src/authz.ts decides whether a client may see a file.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { authorise, type Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { badge, breadcrumb, claimRef, highlights, propertyIn, savedMessage, why } from './components.ts';
import * as C from './crm.ts';
import * as D from './documents.ts';
import type { FsObjectStore } from './objectstore.ts';
import { singleFile } from './multipart.ts';
import { acceptClientBytes, finishUpload, issuedJob, sweepOriginals, readerFor, DAMAGED_PDF } from './uploads.ts';
import { UPLOAD_LIMITS, pdfLooksComplete, sniffAccepted } from './upload-handler-port.ts';
import { NO_DUE_DATE } from './tasks.ts';
import { ANSWER_WORDS, EARLY_VOUCH_PREFIX, VOUCH_ANSWERS, earlyVouchesFrom } from './document-reading.ts';

export type WebResult = 'handled' | 'not-mine';

export type ClientFilesDeps = {
  app: App;
  store: FsObjectStore;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

/** A folder icon, drawn inline. Decoration only: the words beside it say what it is. */
export const FOLDER_ICON = '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>';

export function folderIcon(): Safe {
  return h`<svg class="fold-svg" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${raw(FOLDER_ICON)}</svg>`;
}

/** The folder button in a client page's header: the icon, the word, and how many files this login may open. */
export function filesButton(business_id: string, count: number, beside: Safe = raw('')): Safe {
  return h`<p class="filesbtn-row"><a class="filesbtn" href="/staff/clients/${business_id}/files">${folderIcon()}<span>Files</span>
    <span class="filecount" aria-label="${count} ${count === 1 ? 'file' : 'files'}">${count}</span></a>${beside}</p>`;
}

const MAX_BODY = UPLOAD_LIMITS.max_bytes + 64 * 1024;
const TOO_BIG = `That file is too big. The most we take is ${Math.round(UPLOAD_LIMITS.max_bytes / 1024 / 1024)} MB.`;
const NOT_ACCEPTED = 'We cannot take that kind of file. Send a PDF, a photo (JPEG or PNG), or a Word or Excel file.';

/**
 * RECEIVE ONE FILE FROM A MEMBER OF STAFF — through exactly the path a client's upload takes. The size and content check
 * run here first only so a refused file leaves no half-made document behind; `acceptClientBytes` runs them again on the
 * bytes, as it always does, and that is the control.
 */
export async function receiveFile(
  d: { app: App; store: FsObjectStore; newId: () => string }, actor: Actor, args: D.StartArgs, bytes: Uint8Array,
): Promise<{ ok: true; logical_document_id: string; sent_before: string | null } | { ok: false; why: string }> {
  if (bytes.length === 0) return { ok: false, why: 'That file is empty. Choose it again.' };
  if (bytes.length > UPLOAD_LIMITS.max_bytes) return { ok: false, why: TOO_BIG };
  if (sniffAccepted(bytes) === null) return { ok: false, why: NOT_ACCEPTED };
  // PHASE 157d (F19): a PDF with no end is damaged. acceptClientBytes refuses it too; this only says so first.
  if (sniffAccepted(bytes) === 'pdf' && !pdfLooksComplete(bytes)) return { ok: false, why: 'That PDF is damaged or incomplete: it stops part-way. Save or export it again, then send it.' };
  const db = d.app.db;
  const now = d.app.now;
  const b = await D.startDocumentUpload({ db, audit: d.app.audit, now, newId: d.newId, store: d.store }, actor, args);
  if (!b.ok) return { ok: false, why: b.why };
  // The same single-use key the upload address carries, used here on the same request — never shown, never stored.
  const token = new URL(b.url, 'http://localhost').searchParams.get('token') ?? '';
  const job = issuedJob(db, b.doc_id);
  if (job === null) return { ok: false, why: 'Something went wrong. Try again.' };
  /* PHASE 146g: `reading` carries the process's key store and transport to steps 9 and 10 of the receipt contract.
     It switches nothing on — CLAUDE_SWITCHES.DOCUMENT_READING is false — and with it off a finished upload behaves
     exactly as it did before. args.business_id is the client whose gates are recorded on the reading's audit row. */
  const deps = { db, store: d.store, now, actor: actor.id, newId: d.newId, audit: d.app.audit,
    reading: readerFor(d.app, args.business_id, actor.role) };
  const r = await acceptClientBytes(deps, { doc_id: b.doc_id, token, bytes });
  if (!r.ok) return { ok: false, why: r.status === 413 ? TOO_BIG : r.status === 415 ? NOT_ACCEPTED : r.why === DAMAGED_PDF ? 'That PDF is damaged or incomplete: it stops part-way. Save or export it again, then send it.' : 'Something went wrong. Try again.' };
  const done = await finishUpload(deps, job, r.written_at);
  if (done.error !== undefined) {
    return { ok: false, why: done.error.code === 'E_UNRECOGNISED_DOC_TYPE'
      ? 'We could not read it as that kind of document. Check what it is and try again.'
      : 'We could not use that file. Try again, or send it as a PDF.' };
  }
  return { ok: true, logical_document_id: b.logical_document_id, sent_before: r.sent_before };
}

/** A multipart upload's file and fields, or why not. */
export async function readUpload(
  req: IncomingMessage, body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
): Promise<{ ok: true; bytes: Uint8Array; fields: Record<string, string> } | { ok: false; why: string }> {
  let raw0: Buffer;
  try { raw0 = await body(req, MAX_BODY); } catch { return { ok: false, why: TOO_BIG }; }
  const parsed = singleFile(new Uint8Array(raw0), req.headers['content-type']);
  if (!parsed.ok) return { ok: false, why: parsed.why === 'no file was attached' ? 'Choose a file first.' : `${parsed.why.charAt(0).toUpperCase()}${parsed.why.slice(1)}.` };
  return { ok: true, bytes: parsed.part.bytes, fields: parsed.fields };
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
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
    const up = await readUpload(req, body);
    if (!up.ok) return d.problem(res, actor, 'Not uploaded', up.why, back);
    const claim = (up.fields.claim_id ?? '').trim();
    if (claim !== '' && !org.claims.some((c) => c.id === claim)) return d.problem(res, actor, 'Not uploaded', 'Choose one of this company’s claims.', back);
    const r = await receiveFile(d, actor, {
      business_id: org.id, type_code: up.fields.type_code ?? null, logical_document_id: null, request_id: null,
      claim_id: claim === '' ? null : claim, shown_to_client: up.fields.shown_to_client === 'yes',
      // PHASE 146j: the question about a name, answered on this form so the first reading can keep it.
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
  return h`<form method="post" action="/staff/clients/${f.business_id}/files" enctype="multipart/form-data" class="pblock uploadbox">
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

/** One tile per folder, each opening the Files page at that folder. Used there and in the client page's Files section. */
export function folderTiles(f: D.ClientFolder, key: string | null = null): Safe {
  const tile = (x: D.Folder): Safe => h`<li class="tile foldertile${key === x.key ? ' current' : ''}">
    <a class="tilelink" href="/staff/clients/${f.business_id}/files?folder=${x.key}"${key === x.key ? raw(' aria-current="page"') : raw('')}>
      ${folderIcon()}<span class="tilename">${x.key.startsWith('claim-') ? (propertyIn(f.company, x.name) ?? x.name) : x.name}</span>
      <span class="tileline">${x.count} ${x.key === 'asked' ? (x.count === 1 ? 'thing' : 'things') : (x.count === 1 ? 'file' : 'files')}</span></a>
    ${x.ref === undefined ? raw('') : h`<p class="tileref">${claimRef(x.ref)}</p>`}</li>`;
  return h`<ul class="tiles foldertiles">${f.folders.map(tile)}</ul>`;
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

/**
 * PHASE 146j — THE QUESTION ABOUT A NAME, ASKED WHERE THE TYPE IS CHOSEN. The upload forms and the request form draw
 * this; each question says which kinds of file it is about, because the form runs no script and cannot hide it until a
 * type is picked. Only the answer that belongs to the type chosen is kept. "Leave it for now" sends nothing, and the
 * question is then asked on the file's own page, as before — it is never read as a no.
 */
export function earlyQuestions(
  qs: readonly { readonly field_id: string; readonly question: string; readonly types: readonly string[] }[] | undefined, idp: string,
): Safe {
  if (qs === undefined || qs.length === 0) return raw('');
  return h`<fieldset class="early"><legend>Only if it is one of these</legend>
    ${qs.map((q) => h`<p><strong>If it is ${q.types.join(' or ')}:</strong> ${q.question}</p>
      <p class="choices">${VOUCH_ANSWERS.map((a) => h`<label class="tickbox"><input type="radio" id="${idp}-${q.field_id}-${a}" name="${EARLY_VOUCH_PREFIX}${q.field_id}" value="${a}"> ${ANSWER_WORDS[a]}</label>`)}
        <label class="tickbox"><input type="radio" name="${EARLY_VOUCH_PREFIX}${q.field_id}" value="" checked> Leave it for now</label></p>`)}
    <p class="help">Only yes lets us keep the name the first time we read the file. You can change it later on the file’s own page.</p>
  </fieldset>`;
}
