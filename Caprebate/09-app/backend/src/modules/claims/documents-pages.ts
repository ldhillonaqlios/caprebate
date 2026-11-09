/**
 * THE PAGES FOR DOCUMENTS ON THE CLAIM — a document and its versions, the
 * document types and the document centre — and the panel the claim page draws.
 * CRM 4 of 10. The routes that serve them are src/modules/claims/documents.routes.ts.
 *
 * THE THREE RULES FROM router.ts APPLY UNCHANGED: authorise on the object on every
 * request, no route maps a path onto the filesystem, and every response is built
 * with the `h` tagged template. A request's "why" and "what it holds up" and a
 * type's label are STAFF-SUPPLIED TEXT RENDERED IN A STAFF PAGE AND IN THE
 * PORTAL, and test/claims/documents.test.ts posts a script tag into them.
 *
 * NOTHING HERE DECIDES ANYTHING. src/modules/claims/documents.ts does every authorisation and
 * every derivation; this file draws what it returns.
 */

import type { ServerResponse } from 'node:http';
import type { App } from '../../core/app.ts';
import type { Actor } from '../../core/index.ts';
import { h, raw, page, type Safe } from '../../shared/index.ts';
import * as D from './documents.ts';
import { badge, claimRef, dataLink, savedMessage, sectionList, why, type RecordTab } from '../../shared/index.ts';
import type { FsObjectStore } from '../../shared/objectstore.ts';
import { ANSWER_WORDS, LEFT_OUT_NOTE, VOUCH_ANSWERS } from './document-reading.ts';
import { earlyQuestions } from '../portal/index.ts';

export type DocumentPageDeps = {
  app: App;
  store: FsObjectStore;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  stamp: (iso: string) => string;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
};

/**
 * THE DOCUMENT CENTRE'S PAGE — the CRM follow-on, row 22.13. It draws what `documentCentre` returns and decides nothing:
 * every row was asked of `document.read` there. A drop-down's markup starts its own line, because tools/lint-sql.cjs reads
 * the HTML word for one after a backtick as SQL.
 */
export function centrePage(d: DocumentPageDeps, actor: Actor, v: D.DocumentCentre, query: string): string {
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
      <p class="help">All the documents you may open. Showing ${v.rows.length} of ${v.read},
      ${v.sort.label.toLowerCase()}${v.applied.length === 0 ? '' : ', filtered by '}${v.applied.map((a, i) => h`${i === 0 ? '' : '; '}${a.label.toLowerCase()} — ${a.value}`)}.</p>
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
      <div class="gate"><strong>This page never offers:</strong> ${v.never.join('; ')}.</div>
      ${dataLink(actor, `/staff/documents/view.json${query === '' ? '' : `?${query}`}`)}`,
  });
}

/* ------------------------------------------------------------------ *
 * THE CLAIM PAGE'S PANEL
 * ------------------------------------------------------------------ */

function clockCell(c: D.RetentionReading): Safe {
  return c.state === 'UNSET'
    ? h`<span class="help"><strong>No deletion date set yet.</strong> ${c.label.replace(/^No deletion date set yet\. /, '')}</span>`
    : h`<span class="help">${c.label}</span>`;
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
  // Inside a coloured section the section's own heading names it, so the block's heading is left out; the
  // sentence that explained it sits behind "Why?".
  return h`<div class="pblock">${heading ? h`<div class="pnum">Documents</div>` : raw('')}
    <div class="help">${why(property_id === null
      ? 'Every document of this organisation you may read. A document is linked to its claims and properties on its own page.'
      : 'The documents linked to this property that you may read. A lease or a plan belongs to the organisation and is linked here.')}</div>
    ${p.documents.length === 0 ? h`<p class="help">No document you may read is here.</p>` : h`<table>
      <thead><tr><th>Document</th><th>Who may read it</th><th>Versions</th><th>Current version</th><th>When it is deleted</th></tr></thead>
      <tbody>${p.documents.map((x) => h`<tr><td><a href="${x.href}">${x.label}</a></td><td class="help">${x.readers}</td>
        <td>${x.versions}</td><td>${x.current === null ? h`<span class="help">no version</span>` : h`version ${x.current.version_no ?? ''} — ${x.current.state}`}</td>
        <td>${x.current === null ? raw('') : clockCell(x.current.clock)}</td></tr>`)}</tbody></table>`}
    ${property_id !== null && p.may_link && (p.linkable ?? []).length > 0 ? h`<form method="post" action="/staff/properties/${property_id}/documents/link">
      <p><strong>Link one of the organisation's documents to this property</strong></p>
      <label>Document <select name="document_id">${(p.linkable ?? []).map((x) => h`<option value="${x.id}">${x.label}</option>`)}</select></label>
      <button type="submit">Link it</button></form>` : raw('')}
  </div>`;
}

/** "Which piece of work is it for?" — offered where the building has more than one event. With one,
 *  a document that names none is counted to it anyway, so the question would only be noise. */
function eventChoice(evs: readonly { readonly id: string; readonly label: string }[] | undefined, chosen: string | null = null): Safe {
  if (evs === undefined || evs.length < 2) return raw('');
  const options = evs.map((e) => h`<option value="${e.id}"${e.id === chosen ? raw(' selected') : raw('')}>${e.label}</option>`);
  return h`<label>Which piece of work is it for?
    <select name="event_id"><option value="">Not one piece of work</option>${options}</select></label>`;
}

/** DOCUMENTS ON THE CLAIM. Drawn from `claimDocumentsPanel`, which built it for this reader. */
export function claimDocumentsBlock(claim_id: string, p: D.ClaimDocumentsPanel | undefined, heading = true): Safe {
  if (p === undefined) return raw('');
  const types = p.request_types ?? [];
  return h`<div class="pblock">${heading ? h`<div class="pnum">Documents</div>` : raw('')}
    <div class="help">${why('A document belongs to the company and can be linked to any number of its claims — one lease can serve two. Every upload goes through our safety checks; nothing is overwritten, and each version keeps its own deletion date.')}</div>
    ${p.documents.length === 0 ? h`<p class="help">No document is linked to this claim that you may read.</p>` : h`<table>
      <thead><tr><th>Document</th><th>Who may read it</th><th>Versions</th><th>Current version</th><th>When it is deleted</th></tr></thead>
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
          <td>${dueCell(r)}</td><td>${r.why}${r.early_answer === null ? raw('') : h`<br><span class="help">About the name on it, you said: ${ANSWER_WORDS[r.early_answer]}.</span>`}</td><td>${r.holds_up}</td>
          <td>${r.state === 'REQUESTED' && p.may_request ? h`<form method="post" action="/staff/document-requests/${r.id}/withdraw" class="inline">
            <button type="submit">Withdraw — asked in error</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}`}

    ${p.may_request && types.length > 0 ? h`<form method="post" action="/staff/claims/${claim_id}/document-requests">
      <p><strong>Ask the client for a document</strong> <span class="help">— it goes to their portal. You can only ask for a type we can accept.</span></p>
      <label>Document <select name="type_code">${types.map((t) => h`<option value="${t.code}">${t.label}</option>`)}</select></label>
      ${eventChoice(p.events)}
      <label>Why we need it <input name="why" required></label>
      <label>What it holds up <input name="holds_up" required></label>
      <label>Due <input name="due_on" type="date"></label>
      ${earlyQuestions(p.early_questions, `rq-${claim_id}`)}
      <button type="submit">Request it</button></form>` : raw('')}

    ${p.may_upload && types.length > 0 ? h`<form method="post" action="/staff/claims/${claim_id}/documents" enctype="multipart/form-data" class="uploadbox" data-pieces>
      <p><strong>Upload a file to this claim</strong></p>
      <label class="dropzone" for="claim-file-${claim_id}"><span class="dropwords">Drop a file here, or tap to choose one</span>
        <input id="claim-file-${claim_id}" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"></label>
      <label>What is it? <select name="type_code">${types.map((t) => h`<option value="${t.code}">${t.label}</option>`)}</select></label>
      ${eventChoice(p.events)}
      <label class="tickbox"><input type="checkbox" name="shown_to_client" value="yes"> Let the client see this file</label>
      ${earlyQuestions(p.early_questions, `cu-${claim_id}`)}
      <button type="submit">Upload</button></form>` : raw('')}

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

export function documentPageHtml(d: DocumentPageDeps, actor: Actor, p: D.DocumentPage, msg: string | undefined): string {
  return page({
    title: p.label, nav: d.nav(actor), wide: true,
    body: h`<h1>${p.label}</h1>${saved(msg)}
      <div class="pblock"><div class="pnum">The document</div><dl>
        <dt>Type</dt><dd>${p.type.label}</dd>
        <dt>Who may read it</dt><dd>${p.type.readers}</dd>
        <dt>What we did with the file</dt><dd>${p.type.strip.label}</dd>
        <dt>When files of this type are deleted</dt><dd>${clockCell(p.type.clock_now)}</dd>
        ${p.event === null && (p.event_choices ?? []).length === 0 ? raw('') : h`<dt>The piece of work it proves</dt><dd>${p.event === null ? h`<span class="help">Not tied to one piece of work</span>` : p.event.label}</dd>`}
      </dl>
      ${(p.event_choices ?? []).length === 0 ? raw('') : h`<form method="post" action="/staff/documents/${p.id}/event" class="inline">
        <label>Which piece of work does it prove? <select name="event_id"><option value="">Not one piece of work</option>${(p.event_choices ?? []).map((e) => h`<option value="${e.id}"${e.id === p.event?.id ? raw(' selected') : raw('')}>${e.label}</option>`)}</select></label>
        <button type="submit">Save</button></form>`}</div>

      <div class="pblock"><div class="pnum">Linked to</div>
        ${p.links.length === 0 ? h`<p class="help">Not linked to a claim or a property. It belongs to the company. If it is claim evidence, a surveyor on any of its jobs may read it.</p>` : h`<table>
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
        <table><thead><tr><th>Version</th><th>Sent</th><th>By</th><th>What happened</th><th>Read</th><th>The original</th><th>When this version is deleted</th></tr></thead>
        <tbody>${p.versions.map((v) => h`<tr><td>${v.version_no ?? '—'}</td><td>${v.uploaded}</td><td>${v.by}</td><td>${v.state}</td>
          <td>${v.strip}</td><td>${v.original}</td><td>${clockCell(v.clock)}</td></tr>`)}</tbody></table>
        <p class="help">${p.original_href === undefined ? p.original : h`We kept the original. <a href="${p.original_href}">Open the original</a>`}</p>
        ${p.may_upload_version ? h`<form method="post" action="/staff/documents/${p.id}/versions" enctype="multipart/form-data" class="uploadbox" data-pieces>
          <label class="dropzone" for="version-file"><span class="dropwords">Drop the new version here, or tap to choose it</span>
            <input id="version-file" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"></label>
          <button type="submit">Upload a new version</button></form>` : raw('')}
      </div>

      ${readingBlock(p)}
      ${vouchBlock(p)}

      <div class="pblock"><div class="pnum">Who can see it</div>
        <p>${p.shown_to_client ? badge('The client can see this', 'ok') : badge('Only Cap Rebate can see this')}</p>
        ${p.may_show && !p.from_client ? h`<form method="post" action="/staff/documents/${p.id}/shown" class="inline">
          <input type="hidden" name="shown_to_client" value="${p.shown_to_client ? 'no' : 'yes'}">
          <button type="submit">${p.shown_to_client ? 'Hide it from the client' : 'Let the client see it'}</button></form>` : raw('')}
        <p><a href="/staff/clients/${p.business_id}/files">All of this company’s files</a></p>
      </div>

      ${dataLink(actor, `/staff/documents/${p.id}/view.json`)}`,
  });
}

/**
 * WHAT HAPPENED WHEN WE READ IT, ON A SCREEN AT LAST.
 *
 * `finishUpload` has reported this and nothing drew it, so a file that came back unreadable looked
 * exactly like one nobody had asked about. THE EMPTY CASE IS DRAWN TOO, and that is the point: "we have not tried"
 * and "we tried and could not" are different facts and a blank space says neither.
 *
 * STAFF ONLY. `documentPage` returns no rows at all to the client, and never a word of the document to anybody.
 */
function readingBlock(p: D.DocumentPage): Safe {
  return h`<div class="pblock"><div class="pnum">What happened when we read it</div>
    ${p.readings.length === 0
      ? h`<p class="help">We have not tried to read this file. Reading files is not switched on yet.</p>`
      : h`<table><thead><tr><th>Version</th><th>When</th><th>What happened</th><th>Why</th></tr></thead>
          <tbody>${p.readings.map((r) => h`<tr><td>${r.version_no ?? '—'}</td><td>${r.at}</td>
            <td>${r.worked ? badge(r.label, 'ok') : badge(r.label)}</td><td>${r.why}</td></tr>`)}</tbody></table>`}
    <p class="help">Only Cap Rebate sees this. The client is not shown it.</p></div>`;
}

/**
 * THE ONE THING ONLY A PERSON CAN SAY, on the two kinds of file that need it. Every other kind draws
 * nothing, because there is nothing about it anybody could be asked.
 */
function vouchBlock(p: D.DocumentPage): Safe {
  const v = p.vouch;
  if (v === null) return raw('');
  return h`<div class="pblock"><div class="pnum">One thing only a person can say</div>
    <p><strong>${v.question}</strong></p>
    <p>${v.answer === null
      ? h`Nobody has answered yet. ${v.effect}`
      : h`${ANSWER_WORDS[v.answer]} — ${v.by}, ${v.answered}${v.asked_on === null ? '' : `, ${v.asked_on}`}. ${v.effect}`}</p>
    ${v.withdrawn === null ? raw('') : h`<p class="help">The yes was taken back by ${v.withdrawn.by}, ${v.withdrawn.at}: ${v.withdrawn.reason}</p>`}
    <p class="help">We keep ${v.what} only if the answer is yes. ${LEFT_OUT_NOTE}</p>
    ${v.may_answer ? h`<form method="post" action="/staff/documents/${p.id}/vouch" class="inline">
      <input type="hidden" name="field_id" value="${v.field_id}">
      ${VOUCH_ANSWERS.map((a) => h`<button type="submit" name="answer" value="${a}">${ANSWER_WORDS[a]}</button>`)}
    </form>` : raw('')}
    ${/* A yes that stands is taken back by its own act, with a reason — and that takes the name out of
          what we kept. The plain No button will not do it once a name has been kept. */
      v.may_withdraw ? h`<details class="undo"><summary>Take the yes back</summary>
      <form method="post" action="/staff/documents/${p.id}/vouch/withdraw">
        <input type="hidden" name="field_id" value="${v.field_id}">
        <label>Why? <input name="reason" required maxlength="2000"></label> <button type="submit">Take it back</button>
        <span class="help"> We take ${v.what} out of what we kept from this file, and nothing else. Your reason is kept.</span></form></details>` : raw('')}</div>`;
}

/**
 * DOCUMENT TYPES AS A LEFT-HAND SECTION LIST. The one long table is drawn as one table per reader group, in
 * the order the vocabulary lists the groups, each with the same columns, the same row and the same inline form; adding a
 * type is the last section. A type whose reader value is not in the vocabulary is never dropped: it gets a section of its
 * own, named by its value. Every type is on the page whichever section is showing.
 */
export function typesPage(d: DocumentPageDeps, actor: Actor, types: readonly D.TypeView[], mayWrite: boolean, msg: string | undefined): string {
  const readers = Object.entries(D.READERS);
  const clocks = [['', 'No deletion date set yet'], ...Object.entries(D.RETENTION_REFS)] as const;
  const groups = [...readers.map(([k]) => k), ...new Set(types.map((t) => t.readers.value).filter((k) => !Object.prototype.hasOwnProperty.call(D.READERS, k)))];
  /* ONE LINE PER TYPE, OPENING TO THE REST. The summary carries the name, the code and three badges in words; opened, a
     type shows where it came from, who may read it, the receipt strip and the deletion clock in full, and its form. A
     closed <details> needs no script, and its contents are in the page for a browser's find and a screen reader. */
  const table = (rows: readonly D.TypeView[]): Safe => rows.length === 0
    ? h`<p class="help">No type is read by this group.</p>`
    : h`<ul class="typelist">${rows.map((t) => h`<li><details><summary><strong>${t.label}</strong> <code>${t.code}</code>
        ${badge(t.carries_value ? 'can carry a value' : 'carries no value', t.carries_value ? 'warn' : 'plain')}
        ${badge(t.retention.ref === null ? 'No deletion date set yet' : 'Deletion rule chosen', t.retention.ref === null ? 'stop' : 'plain')}
        ${badge(t.active ? 'active' : 'retired', t.active ? 'ok' : 'plain')}</summary>
        <dl class="typefacts">
          <dt>From</dt><dd>${t.source}</dd>
          <dt>Who may read it</dt><dd>${t.readers.label}</dd>
          <dt>Can carry a value</dt><dd>${t.carries_value ? 'yes — never a surveyor' : 'no'}</dd>
          <dt>What we do with the file</dt><dd class="help">${t.strip.label}</dd>
          <dt>When it is deleted</dt><dd>${clockCell(t.retention)}</dd>
          <dt>Active</dt><dd>${t.active ? 'active' : 'retired'}</dd>
        </dl>
        ${mayWrite ? h`<form method="post" action="/staff/document-types/${t.code}" class="form-row">
          <label>Label <input name="label" value="${t.label}"></label>
          <label>Who may read it <select name="readers">${readers.map(([k, v]) => h`<option value="${k}"${t.readers.value === k ? raw(' selected') : raw('')}>${v}</option>`)}</select></label>
          <label>Can it carry a value <select name="carries_value">${t.carries_value ? h`<option value="1" selected>can carry a value</option>` : h`<option value="0" selected>cannot</option><option value="1">can carry a value</option>`}</select></label>
          <label>When it is deleted <select name="retention_ref">${clocks.map(([k, v]) => h`<option value="${k}"${(t.retention.ref ?? '') === k ? raw(' selected') : raw('')}>${v}</option>`)}</select></label>
          <label>State <select name="active"><option value="1"${t.active ? raw(' selected') : raw('')}>active</option><option value="0"${t.active ? raw('') : raw(' selected')}>retired</option></select></label>
          <button type="submit">Save ${t.label}</button></form>` : raw('')}
      </details></li>`)}</ul>`;
  const sections: RecordTab[] = [
    ...groups.map((k) => {
      const rows = types.filter((t) => t.readers.value === k);
      const label = D.READERS[k]?.split(' — ')[0] ?? k;
      return { id: `readers-${k.toLowerCase().replace(/_/g, '-')}`, label, count: rows.length, body: h`<p class="help">${D.READERS[k] ?? h`A reader group we do not know: <code>${k}</code>.`}</p>${table(rows)}` };
    }),
    ...(mayWrite ? [{ id: 'add-type', label: 'Add a type', body: h`
        <p class="help">A type added here has no rule for reading its files yet, so nobody can send one. It can carry a value unless you say it cannot.</p>
        <form method="post" action="/staff/document-types">
          <label>Code <input name="code" required pattern="[A-Z][A-Z0-9_]{1,59}"></label>
          <label>Label <input name="label" required></label>
          <label>Who may read it <select name="readers">${readers.map(([k, v]) => h`<option value="${k}">${v}</option>`)}</select></label>
          <label>Can it carry a claim value, a tax benefit or a fee? <select name="carries_value"><option value="1">yes, or we cannot say</option><option value="0">no</option></select></label>
          <label>When it is deleted <select name="retention_ref">${clocks.map(([k, v]) => h`<option value="${k}">${v}</option>`)}</select></label>
          <button type="submit">Add the type</button></form>` }] : []),
  ];
  return page({
    title: 'Document types', nav: d.nav(actor), wide: true,
    body: h`<h1>Document types</h1>${saved(msg)}
      <p class="help">For each type: who may read it, when its files are deleted, and whether we can accept it.
      <strong>No deletion date set yet</strong> means just that. We never fill in a date for you.
      Only a type with a rule for reading its files can be sent or asked for. That rule is added in a system update, not on this page.</p>
      <p class="help">${types.length} ${types.length === 1 ? 'type' : 'types'}, grouped by who may read them.</p>
      ${sectionList('Document types, by who may read them', sections)}`,
  });
}
