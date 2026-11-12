/**
 * THE ROUTES FOR DOCUMENTS ON THE CLAIM — a document and its versions, the
 * document types, links, staff uploads and document requests. CRM 4 of 10.
 *
 * Same shape as `handleCrm` and `handleTasks`: it returns 'not-mine' for anything
 * it does not own, so the mounting in staff.ts is one line. THERE IS NO ROUTE THAT
 * MARKS A REQUEST RECEIVED, because received is not a click.
 *
 * Split by what each part does: this file reads the request and answers it,
 * src/modules/claims/documents-pages.ts draws the pages, src/modules/claims/documents.ts
 * holds the rules and src/modules/claims/documents.permissions.ts the gates.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authorise, type Actor } from '../../core/index.ts';
import { piecesOf, piecesPage } from '../../core/index.ts';
import { h, raw, page, HTML_HEADERS } from '../../shared/index.ts';
import * as D from './documents.ts';
import { mayWriteTypes } from './documents.permissions.ts';
import { centrePage, documentPageHtml, typesPage, type DocumentPageDeps } from './documents-pages.ts';
import { openKeptOriginal, sweepOriginals } from './uploads.ts';
import { earlyVouchesFrom } from './document-reading.ts';
import { readUpload, receiveFile } from './receive-file.ts';

export type WebResult = 'handled' | 'not-mine';

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
});

function html(res: ServerResponse, status: number, body: string): void {
  // An upload form's page also gets the script that sends a big file in pieces.
  const p = piecesPage(HTML_HEADERS, body);
  res.writeHead(status, p.headers);
  res.end(p.body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body, null, 2));
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

function posted(f: URLSearchParams, names: readonly string[]): D.Fields {
  const out: Record<string, string | null> = {};
  for (const n of names) {
    if (!f.has(n)) continue;
    const v = (f.get(n) ?? '').trim();
    out[n] = v === '' ? null : v;
  }
  return out;
}

const TYPE_FIELDS = ['code', 'label', 'readers', 'carries_value', 'retention_ref', 'active'] as const;

/** After a save, land on the section the type now sits in; a value the vocabulary does not list lands at the top. */
function readersAnchor(v: string | null): string {
  return v !== null && Object.prototype.hasOwnProperty.call(D.READERS, v) ? `#readers-${v.toLowerCase().replace(/_/g, '-')}` : '';
}

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleDocuments(
  d: DocumentPageDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const now = d.app.now;
  const deps: D.DocDeps = { db, audit: d.app.audit, now, newId: d.newId };
  const done = url.searchParams.get('done') ?? undefined;

  /* ------------------------------------------- the document centre (the CRM follow-on) */
  if (path === '/staff/documents' && method === 'GET') {
    // A COMPANY'S DOCUMENTS ARE IN ITS FILES. Asked for one company and nothing else, the reader is sent to that
    // company's folder, which asks its own rules again. Anything else stays this list, reached from search — never a menu.
    const only = [...url.searchParams.keys()];
    const org = url.searchParams.get('organisation') ?? '';
    if (only.length === 1 && only[0] === 'organisation' && /^[A-Za-z0-9-]+$/.test(org)) {
      redirect(res, `/staff/clients/${org}/files`);
      return 'handled';
    }
    html(res, 200, centrePage(d, actor, D.documentCentre(db, actor, url.searchParams), url.searchParams.toString()));
    return 'handled';
  }
  if (path === '/staff/documents/view.json' && method === 'GET') {
    json(res, 200, D.documentCentre(db, actor, url.searchParams));
    return 'handled';
  }

  /* ------------------------------------------------------------ types */
  if (path === '/staff/document-types' && method === 'GET') {
    html(res, 200, typesPage(d, actor, D.typeList(db, actor), mayWriteTypes(actor), done));
    return 'handled';
  }
  if (path === '/staff/document-types' && method === 'POST') {
    const f = await form(req);
    const r = D.createType(deps, actor, posted(f, TYPE_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Type not added', r.why, '/staff/document-types', r.field);
    redirect(res, `/staff/document-types?done=added${readersAnchor(f.get('readers'))}`);
    return 'handled';
  }
  const typeMatch = /^\/staff\/document-types\/([A-Z][A-Z0-9_]{1,59})$/.exec(path);
  if (typeMatch && method === 'POST') {
    const f = await form(req);
    const r = D.updateType(deps, actor, typeMatch[1] ?? '', posted(f, TYPE_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Type not changed', r.why, '/staff/document-types', r.field);
    redirect(res, `/staff/document-types?done=saved${readersAnchor(f.get('readers'))}`);
    return 'handled';
  }

  /* -------------------------------------------------------- a document */
  const docJson = /^\/staff\/documents\/([A-Za-z0-9-]+)\/view\.json$/.exec(path);
  if (docJson && method === 'GET') {
    json(res, 200, D.documentPage(deps, actor, docJson[1] ?? '', 'view.json', now()));
    return 'handled';
  }
  const docPage = /^\/staff\/documents\/([A-Za-z0-9-]+)$/.exec(path);
  if (docPage && method === 'GET') {
    html(res, 200, documentPageHtml(d, actor, D.documentPage(deps, actor, docPage[1] ?? '', 'page', now()), done));
    return 'handled';
  }
  /**
   * DB-W1 — THE SERVING ENDPOINT FOR STAFF, and like the portal's it serves nothing:
   * under the fail-closed settings the original was deleted from quarantine once
   * the strip had run. It asks `document.read_original` and writes the access
   * record either way.
   */
  const docDownload = /^\/staff\/documents\/([A-Za-z0-9-]+)\/download$/.exec(path);
  if (docDownload && method === 'GET') {
    const id = docDownload[1] ?? '';
    const r = D.requestOriginal(deps, actor, id);
    // WHERE KEEP_ORIGINALS KEPT ONE, the newest kept original, decrypted, as a download — never shown in the
    // page, never cached. Otherwise the plain answer, and a way back to what we took from it: never a broken link.
    // Whatever has run out of time is deleted first, so an expired original is gone before anything is looked for.
    await sweepOriginals({ db, store: d.store, now, audit: d.app.audit }, actor);
    const version = D.keptVersionOf(db, id, now());
    const kept = version === null ? null : await openKeptOriginal({ db, store: d.store, now, audit: d.app.audit }, actor, version);
    if (kept !== null) {
      const ext = kept.sniffed_as === 'pdf' ? 'pdf' : kept.sniffed_as === 'png' ? 'png' : kept.sniffed_as === 'jpeg' ? 'jpg' : 'bin';
      const type = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'application/octet-stream';
      res.writeHead(200, {
        'content-type': type, 'content-disposition': `attachment; filename="${kept.filename}.${ext}"`,
        'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
        'content-security-policy': "default-src 'none'; sandbox",
      });
      res.end(kept.bytes);
      return 'handled';
    }
    html(res, 410, page({
      title: 'The original was deleted', nav: d.nav(actor),
      body: h`<h1>${r.label}</h1><p>${D.ORIGINALS_NOTE}</p><p><a href="/staff/documents/${id}">See what we took from it</a></p>`,
    }));
    return 'handled';
  }
  /**
   * A PERSON SAYS WHETHER A NAME BELONGS TO AN ORGANISATION. One button per answer, so there is no
   * drop-down to leave on its first value and no script. `vouchDocumentField` authorises it and decides everything
   * about it; this route carries the posted answer and nothing else.
   */
  const docVouch = /^\/staff\/documents\/([A-Za-z0-9-]+)\/vouch$/.exec(path);
  if (docVouch && method === 'POST') {
    const id = docVouch[1] ?? '';
    const f = await form(req);
    const r = D.vouchDocumentField(deps, actor, id, f.get('field_id') ?? '', f.get('answer'));
    if (!r.ok) return d.problem(res, actor, 'Not answered', r.why, `/staff/documents/${id}`);
    redirect(res, `/staff/documents/${id}?done=answered`);
    return 'handled';
  }
  /**
   * TAKING A YES BACK. Its own act, with a reason, like taking a tick off. `withdrawVouch` authorises it,
   * finds what the yes let in and takes that one field out; this route carries the field and the reason, nothing else.
   * The result page says what to look at again, because a redirect would lose it.
   */
  const docWithdraw = /^\/staff\/documents\/([A-Za-z0-9-]+)\/vouch\/withdraw$/.exec(path);
  if (docWithdraw && method === 'POST') {
    const id = docWithdraw[1] ?? '';
    const f = await form(req);
    const r = D.withdrawVouch(deps, actor, id, f.get('field_id') ?? '', f.get('reason'));
    if (!r.ok) return d.problem(res, actor, 'Not taken back', r.why, `/staff/documents/${id}`, r.field);
    html(res, 200, page({
      title: 'The yes was taken back', nav: d.nav(actor),
      body: h`<h1>The yes was taken back</h1><p class="say">${r.why}</p>
        ${r.look_again.length === 0 ? raw('') : h`<ul>${r.look_again.map((x) => h`<li>${x.words}</li>`)}</ul>`}
        <p><a href="/staff/documents/${id}">Back to the file</a></p>`,
    }));
    return 'handled';
  }
  // Tie a document to the piece of work it proves, or untie it.
  const docEvent = /^\/staff\/documents\/([A-Za-z0-9-]+)\/event$/.exec(path);
  if (docEvent && method === 'POST') {
    const id = docEvent[1] ?? '';
    const f = await form(req);
    const r = D.setDocumentEvent(deps, actor, id, f.get('event_id'));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/documents/${id}`);
    redirect(res, `/staff/documents/${id}?done=saved`);
    return 'handled';
  }
  const docLink = /^\/staff\/documents\/([A-Za-z0-9-]+)\/links$/.exec(path);
  if (docLink && method === 'POST') {
    const id = docLink[1] ?? '';
    const f = await form(req);
    const r = D.linkDocument(deps, actor, id, { claim_id: f.get('claim_id'), property_id: f.get('property_id') });
    if (!r.ok) return d.problem(res, actor, 'Not linked', r.why, `/staff/documents/${id}`);
    redirect(res, `/staff/documents/${id}?done=linked`);
    return 'handled';
  }
  // CRM 9 of 10: THE PROPERTY PAGE'S LINK FORM — through `linkDocument`, the same store the document page uses.
  const propertyLink = /^\/staff\/properties\/([A-Za-z0-9-]+)\/documents\/link$/.exec(path);
  if (propertyLink && method === 'POST') {
    const id = propertyLink[1] ?? '';
    const f = await form(req);
    const r = D.linkDocument(deps, actor, f.get('document_id') ?? '', { claim_id: null, property_id: id });
    if (!r.ok) return d.problem(res, actor, 'Not linked', r.why, `/staff/properties/${id}`);
    redirect(res, `/staff/properties/${id}?done=linked`);
    return 'handled';
  }
  const linkEnd = /^\/staff\/document-links\/([A-Za-z0-9-]+)\/end$/.exec(path);
  if (linkEnd && method === 'POST') {
    const r = D.unlinkDocument(deps, actor, linkEnd[1] ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not unlinked', r.why, '/staff');
    redirect(res, `/staff/documents/${r.document_id ?? ''}?done=unlinked`);
    return 'handled';
  }
  // A NEW VERSION, THE FILE WITH THE FORM — through `receiveFile`, the client's own path. No upload address.
  const docVersion = /^\/staff\/documents\/([A-Za-z0-9-]+)\/versions$/.exec(path);
  if (docVersion && method === 'POST') {
    const id = docVersion[1] ?? '';
    const business_id = D.businessOfDocument(db, id);
    // Asked before a byte of the body is read: a login that may not upload is refused, not told its file was malformed.
    authorise(actor, 'document.upload', { type: 'business', id: business_id });
    const up = await readUpload(req, body, piecesOf(d.app, d.store, actor));
    if (!up.ok) return d.problem(res, actor, 'Not uploaded', up.why, `/staff/documents/${id}`);
    const r = await receiveFile(d, actor, { business_id, type_code: null, logical_document_id: id, request_id: null, claim_id: null }, up.bytes);
    if (!r.ok) return d.problem(res, actor, 'Not uploaded', r.why, `/staff/documents/${id}`);
    redirect(res, `/staff/documents/${id}?done=uploaded`);
    return 'handled';
  }

  /* ------------------------------------------------- on the claim page */
  // AN UPLOAD FROM THE CLAIM PAGE, THE FILE WITH THE FORM. Lands in the claim's own folder of the company's files.
  const claimUpload = /^\/staff\/claims\/([A-Za-z0-9-]+)\/documents$/.exec(path);
  if (claimUpload && method === 'POST') {
    const id = claimUpload[1] ?? '';
    const business_id = D.businessOfClaim(db, id);
    authorise(actor, 'document.upload', { type: 'business', id: business_id });
    const up = await readUpload(req, body, piecesOf(d.app, d.store, actor));
    if (!up.ok) return d.problem(res, actor, 'Not uploaded', up.why, `/staff/claims/${id}`);
    const r = await receiveFile(d, actor, {
      business_id, type_code: up.fields.type_code ?? null, logical_document_id: null, request_id: null, claim_id: id,
      shown_to_client: up.fields.shown_to_client === 'yes', event_id: up.fields.event_id ?? null,
      // The question about a name, answered where the type is chosen.
      early_vouch: earlyVouchesFrom((n) => up.fields[n]),
    }, up.bytes);
    if (!r.ok) return d.problem(res, actor, 'Not uploaded', r.why, `/staff/claims/${id}`);
    redirect(res, `/staff/clients/${business_id}/files?folder=claim-${id}&done=uploaded`);
    return 'handled';
  }
  const claimLink = /^\/staff\/claims\/([A-Za-z0-9-]+)\/documents\/link$/.exec(path);
  if (claimLink && method === 'POST') {
    const id = claimLink[1] ?? '';
    const f = await form(req);
    const r = D.linkDocument(deps, actor, f.get('document_id') ?? '', { claim_id: id, property_id: null });
    if (!r.ok) return d.problem(res, actor, 'Not linked', r.why, `/staff/claims/${id}`);
    redirect(res, `/staff/claims/${id}?done=linked`);
    return 'handled';
  }
  const claimRequest = /^\/staff\/claims\/([A-Za-z0-9-]+)\/document-requests$/.exec(path);
  if (claimRequest && method === 'POST') {
    const id = claimRequest[1] ?? '';
    const f = await form(req);
    const r = D.createDocumentRequest(deps, actor, {
      business_id: D.businessOfClaim(db, id), claim_id: id, type_code: f.get('type_code'), event_id: f.get('event_id'),
      why: f.get('why'), holds_up: f.get('holds_up'), due_on: f.get('due_on'),
      // The question about a name, answered where the type is chosen — kept with the request, and taken
      // up by the file that answers it before that file is read.
      early_vouch: earlyVouchesFrom((n) => f.get(n)),
    });
    if (!r.ok) return d.problem(res, actor, 'Not requested', r.why, `/staff/claims/${id}`, r.field);
    // Phase 161m2: the client is emailed what we asked for (documents-needed)
    D.emailDocumentsNeeded({ ...deps, email: d.app.email }, actor, D.businessOfClaim(db, id), [r.id], d.publicOrigin);
    redirect(res, `/staff/claims/${id}?done=requested`);
    return 'handled';
  }
  const withdraw = /^\/staff\/document-requests\/([A-Za-z0-9-]+)\/withdraw$/.exec(path);
  if (withdraw && method === 'POST') {
    const r = D.withdrawDocumentRequest(deps, actor, withdraw[1] ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not withdrawn', r.why, '/staff');
    redirect(res, r.claim_id !== null && r.claim_id !== undefined ? `/staff/claims/${r.claim_id}?done=withdrawn` : `/staff/clients/${r.business_id ?? ''}?done=withdrawn`);
    return 'handled';
  }

  return 'not-mine';
}
