/**
 * THE ROUTES AND PAGES FOR DOCUMENTS ON THE CLAIM — a document and its versions,
 * the document types, links, staff uploads and document requests — and the panel
 * the claim page draws. CRM 4 of 10, 11 September 2026.
 *
 * Same shape as `handleCrm` and `handleTasks`: it returns 'not-mine' for anything
 * it does not own, so the mounting in staff.ts is one line.
 *
 * THE THREE RULES FROM router.ts APPLY UNCHANGED: authorise on the object on every
 * request, no route maps a path onto the filesystem, and every response is built
 * with the `h` tagged template. A request's "why" and "what it holds up" and a
 * type's label are STAFF-SUPPLIED TEXT RENDERED IN A STAFF PAGE AND IN THE
 * PORTAL, and test/documents.test.ts posts a script tag into them.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/documents.ts does every authorisation and
 * every derivation; this file draws what it returns. THERE IS NO ROUTE THAT MARKS A
 * REQUEST RECEIVED, because received is not a click.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as D from './documents.ts';
import { badge, claimRef, dataLink, savedMessage, sectionList, why, type RecordTab } from './components.ts';
import type { FsObjectStore } from './objectstore.ts';

export type WebResult = 'handled' | 'not-mine';

export type DocumentPageDeps = {
  app: App;
  store: FsObjectStore;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
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

/**
 * THE DOCUMENT CENTRE'S PAGE — the CRM follow-on, row 22.13. It draws what `documentCentre` returns and decides nothing:
 * every row was asked of `document.read` there. A drop-down's markup starts its own line, because tools/lint-sql.cjs reads
 * the HTML word for one after a backtick as SQL.
 */
function centrePage(d: DocumentPageDeps, actor: Actor, v: D.DocumentCentre, query: string): string {
  const asked = new URLSearchParams(query);
  const field = (f: (typeof D.CENTRE_FILTERS)[number]): Safe => {
    const options = (v.choices[f.key] ?? []).map((c) => h`<option value="${c.value}"${asked.get(f.key) === c.value ? raw(' selected') : raw('')}>${c.label}</option>`);
    return h`<label>${f.label}
      <select name="${f.key}"><option value="">any</option>${options}</select></label>`;
  };
  const sorts = v.sorts.map((s) => h`<option value="${s.value}"${s.value === v.sort.key ? raw(' selected') : raw('')}>${s.label}</option>`);
  return page({
    title: 'Documents', nav: d.nav(actor), wide: true,
    body: h`<h1>Documents</h1>
      <p class="help">Every document you may read, across every organisation and claim — ${v.rows.length} of the ${v.read} you may read,
      ${v.sort.label.toLowerCase()}${v.applied.length === 0 ? '' : ', filtered by '}${v.applied.map((a, i) => h`${i === 0 ? '' : '; '}${a.label.toLowerCase()} — ${a.value}`)}.
      Each row is asked of the same rule the document’s own page asks: a document you may not open is not on this list.</p>
      <form method="get" action="/staff/documents" class="pblock">
        ${v.filters.map(field)}
        <label>Order
          <select name="sort">${sorts}</select></label>
        <button type="submit">Show</button> <a href="/staff/documents">Clear</a>
      </form>
      ${v.said.length === 0 ? raw('') : h`<ul>${v.said.map((x) => h`<li class="help">${x}</li>`)}</ul>`}
      ${v.rows.length === 0 ? h`<p class="help">No document you may read matches.</p>` : h`<table>
        <thead><tr><th>Document</th><th>Type</th><th>Company</th><th>Claims</th><th>State</th><th>Newest version</th><th>Versions</th></tr></thead>
        <tbody>${v.rows.map((r) => h`<tr><td><a href="${r.href}">${r.label}</a></td><td>${r.type.label}</td>
          <td>${r.organisation.href === null ? h`${r.organisation.name}` : h`<a href="${r.organisation.href}">${r.organisation.name}</a>`}</td>
          <td>${r.claims.length === 0 ? h`<span class="help">on no claim</span>` : r.claims.map((c) => h`${c.href === null ? h`${c.property ?? 'a claim'}` : h`<a href="${c.href}">${c.property ?? 'a claim'}</a>`} ${claimRef(c.claim_ref)}<br>`)}</td>
          <td>${r.state.label}</td>
          <td>${r.newest === null ? h`<span class="help">no version</span>` : h`version ${r.newest.version_no ?? '—'}, ${r.newest.uploaded}<br><span class="help">${r.newest.by}</span>`}</td>
          <td>${r.versions}</td></tr>`)}</tbody></table>`}
      <div class="gate"><strong>Never on this page, for anyone:</strong> ${v.never.join('; ')}.</div>
      ${dataLink(actor, `/staff/documents/view.json${query === '' ? '' : `?${query}`}`)}`,
  });
}

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleDocuments(
  d: DocumentPageDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const now = d.app.now;
  const deps: D.DocDeps = { db, audit: d.app.audit, now, newId: d.newId };
  const done = url.searchParams.get('done') ?? undefined;

  /* ------------------------------------------- the document centre (the CRM follow-on) */
  if (path === '/staff/documents' && method === 'GET') {
    html(res, 200, centrePage(d, actor, D.documentCentre(db, actor, url.searchParams), url.searchParams.toString()));
    return 'handled';
  }
  if (path === '/staff/documents/view.json' && method === 'GET') {
    json(res, 200, D.documentCentre(db, actor, url.searchParams));
    return 'handled';
  }

  /* ------------------------------------------------------------ types */
  if (path === '/staff/document-types' && method === 'GET') {
    html(res, 200, typesPage(d, actor, D.typeList(db, actor), D.mayWriteTypes(actor), done));
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
    const r = D.requestOriginal(deps, actor, docDownload[1] ?? '');
    html(res, 410, page({
      title: 'No original to serve', nav: d.nav(actor),
      body: h`<h1>${r.label}: there is no original file, by design</h1><p>${D.ORIGINALS_NOTE}</p>`,
    }));
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
  const docVersion = /^\/staff\/documents\/([A-Za-z0-9-]+)\/versions$/.exec(path);
  if (docVersion && method === 'POST') {
    const id = docVersion[1] ?? '';
    const r = await D.startDocumentUpload({ ...deps, store: d.store }, actor, {
      business_id: D.businessOfDocument(db, id), type_code: null, logical_document_id: id, request_id: null, claim_id: null,
    });
    if (!r.ok) return d.problem(res, actor, 'No upload link issued', r.why, `/staff/documents/${id}`);
    html(res, 200, ticketPage(d, actor, r, `/staff/documents/${id}`));
    return 'handled';
  }

  /* ------------------------------------------------- on the claim page */
  const claimUpload = /^\/staff\/claims\/([A-Za-z0-9-]+)\/documents$/.exec(path);
  if (claimUpload && method === 'POST') {
    const id = claimUpload[1] ?? '';
    const f = await form(req);
    const r = await D.startDocumentUpload({ ...deps, store: d.store }, actor, {
      business_id: D.businessOfClaim(db, id), type_code: f.get('type_code'), logical_document_id: null, request_id: null, claim_id: id,
    });
    if (!r.ok) return d.problem(res, actor, 'No upload link issued', r.why, `/staff/claims/${id}`);
    html(res, 200, ticketPage(d, actor, r, `/staff/claims/${id}`));
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
      business_id: D.businessOfClaim(db, id), claim_id: id, type_code: f.get('type_code'),
      why: f.get('why'), holds_up: f.get('holds_up'), due_on: f.get('due_on'),
    });
    if (!r.ok) return d.problem(res, actor, 'Not requested', r.why, `/staff/claims/${id}`, r.field);
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

/* ------------------------------------------------------------------ *
 * THE CLAIM PAGE'S PANEL
 * ------------------------------------------------------------------ */

function clockCell(c: D.RetentionReading): Safe {
  return c.state === 'UNSET' ? h`<span class="help"><strong>UNSET</strong> — ${c.label.replace(/^UNSET — /, '')}</span>` : h`<span class="help">${c.label}</span>`;
}

function dueCell(r: D.RequestView): Safe {
  return r.due.overdue ? h`<strong class="err">${r.due.label}</strong>` : h`${r.due.label}`;
}

/**
 * CRM 9 of 10. DOCUMENTS ON AN ORGANISATION OR A PROPERTY — the claim panel's table, drawn from a panel built for
 * this reader. A property's panel carries a form to link one of the organisation's documents to it.
 */
export function placeDocumentsBlock(p: D.PlaceDocumentsPanel | undefined, property_id: string | null, heading = true): Safe {
  if (p === undefined) return raw('');
  // PHASE 138: inside a coloured section the section's own heading names it, so the block's heading is left out; the
  // sentence that explained it sits behind "Why?".
  return h`<div class="pblock">${heading ? h`<div class="pnum">Documents</div>` : raw('')}
    <div class="help">${why(property_id === null
      ? 'Every document of this organisation you may read. A document is linked to its claims and properties on its own page.'
      : 'The documents linked to this property that you may read. A lease or a plan belongs to the organisation and is linked here.')}</div>
    ${p.documents.length === 0 ? h`<p class="help">No document you may read is here.</p>` : h`<table>
      <thead><tr><th>Document</th><th>Who may read it</th><th>Versions</th><th>Current version</th><th>Its deletion clock</th></tr></thead>
      <tbody>${p.documents.map((x) => h`<tr><td><a href="${x.href}">${x.label}</a></td><td class="help">${x.readers}</td>
        <td>${x.versions}</td><td>${x.current === null ? h`<span class="help">no version</span>` : h`version ${x.current.version_no ?? ''} — ${x.current.state}`}</td>
        <td>${x.current === null ? raw('') : clockCell(x.current.clock)}</td></tr>`)}</tbody></table>`}
    ${property_id !== null && p.may_link && (p.linkable ?? []).length > 0 ? h`<form method="post" action="/staff/properties/${property_id}/documents/link">
      <p><strong>Link one of the organisation's documents to this property</strong></p>
      <label>Document <select name="document_id">${(p.linkable ?? []).map((x) => h`<option value="${x.id}">${x.label}</option>`)}</select></label>
      <button type="submit">Link it</button></form>` : raw('')}
  </div>`;
}

/** DOCUMENTS ON THE CLAIM. Drawn from `claimDocumentsPanel`, which built it for this reader. */
export function claimDocumentsBlock(claim_id: string, p: D.ClaimDocumentsPanel | undefined, heading = true): Safe {
  if (p === undefined) return raw('');
  const types = p.request_types ?? [];
  return h`<div class="pblock">${heading ? h`<div class="pnum">Documents</div>` : raw('')}
    <div class="help">${why('A document belongs to the company and can be linked to any number of its claims — one lease can serve two. Every upload goes through our safety checks; nothing is overwritten, and each version keeps its own deletion date.')}</div>
    ${p.documents.length === 0 ? h`<p class="help">No document is linked to this claim that you may read.</p>` : h`<table>
      <thead><tr><th>Document</th><th>Who may read it</th><th>Versions</th><th>Current version</th><th>Its deletion clock</th></tr></thead>
      <tbody>${p.documents.map((x) => h`<tr><td><a href="${x.href}">${x.label}</a></td><td class="help">${x.readers}</td>
        <td>${x.versions}</td><td>${x.current === null ? h`<span class="help">no version</span>` : h`version ${x.current.version_no ?? ''} — ${x.current.state}`}</td>
        <td>${x.current === null ? raw('') : clockCell(x.current.clock)}</td></tr>`)}</tbody></table>`}

    ${p.requests === undefined ? raw('') : h`<div><strong>Requests</strong> — ${p.outstanding ?? 0} outstanding${
      (p.overdue ?? 0) > 0 ? h`, <strong class="err">${p.overdue ?? 0} OVERDUE</strong>` : raw('')}.
      ${why('A request is marked received when an upload of that type passes our safety checks. There is no button for it.')}</div>
      ${p.requests.length === 0 ? h`<p class="help">No document has been requested on this claim.</p>` : h`<table>
        <thead><tr><th>Document</th><th>State</th><th>Due</th><th>Why</th><th>What it holds up</th><th></th></tr></thead>
        <tbody>${p.requests.map((r) => h`<tr class="${r.due.overdue ? 'overdue' : ''}"><td>${r.type.label}</td><td>${r.state_words}${
          r.received === null ? raw('') : h`<br><a href="/staff/documents/${r.received.document_id}">version ${r.received.version_no ?? ''}</a>`}</td>
          <td>${dueCell(r)}</td><td>${r.why}</td><td>${r.holds_up}</td>
          <td>${r.state === 'REQUESTED' && p.may_request ? h`<form method="post" action="/staff/document-requests/${r.id}/withdraw" class="inline">
            <button type="submit">Withdraw — asked in error</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}`}

    ${p.may_request && types.length > 0 ? h`<form method="post" action="/staff/claims/${claim_id}/document-requests">
      <p><strong>Ask the client for a document</strong> <span class="help">— it goes to their portal, and only a type with a receipt policy can be asked for</span></p>
      <label>Document <select name="type_code">${types.map((t) => h`<option value="${t.code}">${t.label}</option>`)}</select></label>
      <label>Why we need it <input name="why" required></label>
      <label>What it holds up <input name="holds_up" required></label>
      <label>Due <input name="due_on" type="date"></label>
      <button type="submit">Request it</button></form>` : raw('')}

    ${p.may_upload && types.length > 0 ? h`<form method="post" action="/staff/claims/${claim_id}/documents">
      <p><strong>Upload a document to this claim</strong> <span class="help">— through the same upload handler as the client's, and its name is derived</span></p>
      <label>Document <select name="type_code">${types.map((t) => h`<option value="${t.code}">${t.label}</option>`)}</select></label>
      <button type="submit">Get an upload link</button></form>` : raw('')}

    ${p.may_link && (p.linkable ?? []).length > 0 ? h`<form method="post" action="/staff/claims/${claim_id}/documents/link">
      <p><strong>Link one of the organisation's documents to this claim</strong></p>
      <label>Document <select name="document_id">${(p.linkable ?? []).map((x) => h`<option value="${x.id}">${x.label}</option>`)}</select></label>
      <button type="submit">Link it</button></form>` : raw('')}
  </div>`;
}

/* ------------------------------------------------------------------ *
 * PAGES
 * ------------------------------------------------------------------ */

function saved(msg: string | undefined): Safe {
  return msg === undefined ? raw('') : savedMessage();
}

function documentPageHtml(d: DocumentPageDeps, actor: Actor, p: D.DocumentPage, msg: string | undefined): string {
  return page({
    title: p.label, nav: d.nav(actor), wide: true,
    body: h`<h1>${p.label}</h1>${saved(msg)}
      <div class="pblock"><div class="pnum">The document</div><dl>
        <dt>Type</dt><dd>${p.type.label}</dd>
        <dt>Who may read it</dt><dd>${p.type.readers}</dd>
        <dt>The receipt strip</dt><dd>${p.type.strip.label}</dd>
        <dt>The type's deletion clock today</dt><dd>${clockCell(p.type.clock_now)}</dd>
      </dl></div>

      <div class="pblock"><div class="pnum">Linked to</div>
        ${p.links.length === 0 ? h`<p class="help">Linked to no claim and no property: it is the organisation's, and a surveyor on any of its jobs may read it if it is claim evidence.</p>` : h`<table>
          <thead><tr><th>To</th><th>Linked</th><th>Ended</th><th></th></tr></thead>
          <tbody>${p.links.map((k) => h`<tr><td>${k.to}: ${k.href === null ? h`${k.label}` : h`<a href="${k.href}">${k.label}</a>`}${k.ref === undefined ? raw('') : h` ${claimRef(k.ref)}`}</td>
            <td>${k.linked}</td><td>${k.ended ?? h`<span class="help">still linked</span>`}</td>
            <td>${k.ended === null && p.may_link ? h`<form method="post" action="/staff/document-links/${k.id}/end" class="inline"><button type="submit">End this link</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}
        ${p.may_link && (p.linkable_claims ?? []).length > 0 ? h`<form method="post" action="/staff/documents/${p.id}/links">
          <label>Link to claim <select name="claim_id">${(p.linkable_claims ?? []).map((c) => h`<option value="${c.id}">${c.property ?? 'A claim with no property'} (${c.claim_ref})</option>`)}</select></label>
          <button type="submit">Link</button></form>` : raw('')}
      </div>

      <div class="pblock"><div class="pnum">Version history</div>
        <p class="help">${p.history}</p>
        <table><thead><tr><th>Version</th><th>Uploaded</th><th>By</th><th>State</th><th>Receipt strip</th><th>The original</th><th>This version's deletion clock</th></tr></thead>
        <tbody>${p.versions.map((v) => h`<tr><td>${v.version_no ?? '—'}</td><td>${v.uploaded}</td><td>${v.by}</td><td>${v.state}</td>
          <td>${v.strip}</td><td>${v.original}</td><td>${clockCell(v.clock)}</td></tr>`)}</tbody></table>
        <p class="help">${p.original}</p>
        ${p.may_upload_version ? h`<form method="post" action="/staff/documents/${p.id}/versions"><button type="submit">Upload a new version</button></form>` : raw('')}
      </div>

      ${dataLink(actor, `/staff/documents/${p.id}/view.json`)}`,
  });
}

/** PHASE 133b — after a save, land on the section the type now sits in; a value the vocabulary does not list lands at the top. */
function readersAnchor(v: string | null): string {
  return v !== null && Object.prototype.hasOwnProperty.call(D.READERS, v) ? `#readers-${v.toLowerCase().replace(/_/g, '-')}` : '';
}

/**
 * PHASE 133b — DOCUMENT TYPES AS A LEFT-HAND SECTION LIST. The one long table is drawn as one table per reader group, in
 * the order the vocabulary lists the groups, each with the same columns, the same row and the same inline form; adding a
 * type is the last section. A type whose reader value is not in the vocabulary is never dropped: it gets a section of its
 * own, named by its value. Every type is on the page whichever section is showing.
 */
function typesPage(d: DocumentPageDeps, actor: Actor, types: readonly D.TypeView[], mayWrite: boolean, msg: string | undefined): string {
  const readers = Object.entries(D.READERS);
  const clocks = [['', 'UNSET'], ...Object.entries(D.RETENTION_REFS)] as const;
  const groups = [...readers.map(([k]) => k), ...new Set(types.map((t) => t.readers.value).filter((k) => !Object.prototype.hasOwnProperty.call(D.READERS, k)))];
  /* ONE LINE PER TYPE, OPENING TO THE REST. The summary carries the name, the code and three badges in words; opened, a
     type shows where it came from, who may read it, the receipt strip and the deletion clock in full, and its form. A
     closed <details> needs no script, and its contents are in the page for a browser's find and a screen reader. */
  const table = (rows: readonly D.TypeView[]): Safe => rows.length === 0
    ? h`<p class="help">No type is read by this group.</p>`
    : h`<ul class="typelist">${rows.map((t) => h`<li><details><summary><strong>${t.label}</strong> <code>${t.code}</code>
        ${badge(t.carries_value ? 'can carry a value' : 'carries no value', t.carries_value ? 'warn' : 'plain')}
        ${badge(t.retention.ref === null ? 'deletion clock UNSET' : `deletion clock ${t.retention.ref}`, t.retention.ref === null ? 'stop' : 'plain')}
        ${badge(t.active ? 'active' : 'retired', t.active ? 'ok' : 'plain')}</summary>
        <dl class="typefacts">
          <dt>From</dt><dd>${t.source}</dd>
          <dt>Who may read it</dt><dd>${t.readers.label}</dd>
          <dt>Can carry a value</dt><dd>${t.carries_value ? 'yes — never a surveyor' : 'no'}</dd>
          <dt>Receipt strip</dt><dd class="help">${t.strip.label}</dd>
          <dt>Deletion clock</dt><dd>${clockCell(t.retention)}</dd>
          <dt>Active</dt><dd>${t.active ? 'active' : 'retired'}</dd>
        </dl>
        ${mayWrite ? h`<form method="post" action="/staff/document-types/${t.code}" class="form-row">
          <label>Label <input name="label" value="${t.label}"></label>
          <label>Who may read it <select name="readers">${readers.map(([k, v]) => h`<option value="${k}"${t.readers.value === k ? raw(' selected') : raw('')}>${v}</option>`)}</select></label>
          <label>Can it carry a value <select name="carries_value">${t.carries_value ? h`<option value="1" selected>can carry a value</option>` : h`<option value="0" selected>cannot</option><option value="1">can carry a value</option>`}</select></label>
          <label>Deletion clock <select name="retention_ref">${clocks.map(([k, v]) => h`<option value="${k}"${(t.retention.ref ?? '') === k ? raw(' selected') : raw('')}>${v}</option>`)}</select></label>
          <label>State <select name="active"><option value="1"${t.active ? raw(' selected') : raw('')}>active</option><option value="0"${t.active ? raw('') : raw(' selected')}>retired</option></select></label>
          <button type="submit">Save ${t.label}</button></form>` : raw('')}
      </details></li>`)}</ul>`;
  const sections: RecordTab[] = [
    ...groups.map((k) => {
      const rows = types.filter((t) => t.readers.value === k);
      const label = D.READERS[k]?.split(' — ')[0] ?? k;
      return { id: `readers-${k.toLowerCase().replace(/_/g, '-')}`, label, count: rows.length, body: h`<p class="help">${D.READERS[k] ?? h`A reader value this build does not list: <code>${k}</code>.`}</p>${table(rows)}` };
    }),
    ...(mayWrite ? [{ id: 'add-type', label: 'Add a type', body: h`
        <p class="help">A type added here has no receipt policy, so it can be recorded and configured but not received. It can carry a value unless you say it cannot.</p>
        <form method="post" action="/staff/document-types">
          <label>Code <input name="code" required pattern="[A-Z][A-Z0-9_]{1,59}"></label>
          <label>Label <input name="label" required></label>
          <label>Who may read it <select name="readers">${readers.map(([k, v]) => h`<option value="${k}">${v}</option>`)}</select></label>
          <label>Can it carry a claim value, a tax benefit or a fee? <select name="carries_value"><option value="1">yes, or we cannot say</option><option value="0">no</option></select></label>
          <label>Deletion clock <select name="retention_ref">${clocks.map(([k, v]) => h`<option value="${k}">${v}</option>`)}</select></label>
          <button type="submit">Add the type</button></form>` }] : []),
  ];
  return page({
    title: 'Document types', nav: d.nav(actor), wide: true,
    body: h`<h1>Document types</h1>${saved(msg)}
      <p class="help">Who may read each type, its deletion clock — <strong>UNSET</strong> is a state and is shown as one, never
      filled in — and whether an upload of it can be received at all. Only a type with a receipt policy can be received or asked for;
      a policy is bound by a migration, never on this page.</p>
      <p class="help">${types.length} ${types.length === 1 ? 'type' : 'types'}, grouped by who may read them.</p>
      ${sectionList('Document types, by who may read them', sections)}`,
  });
}

function ticketPage(d: DocumentPageDeps, actor: Actor, r: Extract<D.Started, { ok: true }>, back: string): string {
  return page({
    title: 'Upload link', nav: d.nav(actor),
    body: h`<h1>Upload link for version ${r.version_no}</h1>
      <p>Send the file with an HTTP <code>PUT</code> to the address below. The link is scoped to this one upload, expires at
      ${r.expires_at}, is used once, and is not stored or logged anywhere — it is shown to you once.</p>
      <p><code>PUT ${r.url}&amp;doc=${r.doc_id}</code></p>
      <div class="gate">The allow-list, the size cap, the content sniff and the receipt strip all run on the server, on the bytes that arrive.</div>
      <p><a href="${back}">Back</a></p>`,
  });
}
