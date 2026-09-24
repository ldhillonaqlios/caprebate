/**
 * CHAT ON EVERY CLIENT — THE PAGES. Phase 142, 22 September 2026. "Back office and portal clean-up, 9 of 11."
 *
 * ON THE CLIENT PAGE (staff) a section called "Chat" with two tabs, which are plain links (no script):
 *   ?chat=team     "Team only"        the company's internal notes, as a conversation. Written through the note route,
 *                                     POST /staff/clients/:id/notes, which is unchanged.
 *   ?chat=client   "With the client"  the thread the client reads in their portal as "Messages".
 *   POST /staff/clients/:id/messages  write to the client.
 *
 * IN THE PORTAL (the client)
 *   GET  /portal/messages             the thread, and the box to write in, with a file if they want to send one
 *   POST /portal/messages             send it; a file goes through the upload path every file takes, into Files under
 *                                     "From the client", linked to this message
 *   GET  /portal/messages/:id         one message — looked for only on the client's own thread, so any other id is 404
 *
 * NOTHING HERE DECIDES WHO SEES WHAT: src/web/messages.ts asks every rule on every read and write.
 */

import { EMAIL_SENDING, auditMailConnections, sendingOn, smtpLoginFromKeyFile } from '../stubs/email-provider.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Db } from '../db.ts';
import { can, type Actor } from '../authz.ts';
import { h, raw, HTML_HEADERS, type Safe } from './html.ts';
import { savedMessage, why } from './components.ts';
import type { FsObjectStore } from './objectstore.ts';
import * as M from './messages.ts';
import * as IE from './inbound-email.ts';
import { page } from './html.ts';
import { imapLoginFromKeyFile, imapMailbox, readingOn, INBOUND_EMAIL, type InboundEmail, type Mailbox } from '../stubs/email-inbound.ts';
import { receiveFile } from './client-files-pages.ts';
import { boundaryOf, parseMultipart, type Part } from './multipart.ts';
import { UPLOAD_LIMITS } from './upload-handler-port.ts';
import { receivableTypes } from './documents.ts';

export type WebResult = 'handled' | 'not-mine';

export type ChatTab = 'team' | 'client';

/**
 * THE TAB A PAGE IS DRAWN WITH: the one asked for, where this login may open it; otherwise "With the client" when the
 * client has written something this person has not read, and "Team only" when not — where the notes always were.
 */
export function chatTab(db: Db, actor: Actor, business_id: string, asked: string | null): ChatTab | null {
  const team = can(actor, 'internal_note.read', { type: 'internal_note', id: business_id, business_id });
  const client = can(actor, 'client_message.read', { type: 'client_message', id: business_id, business_id });
  if (asked === 'team' && team) return 'team';
  if (asked === 'client' && client) return 'client';
  if (client && M.unreadCount(db, actor, business_id, 'CLIENT') > 0) return 'client';
  return team ? 'team' : client ? 'client' : null;
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

/* ================================================================== *
 * DRAWING A THREAD
 * ================================================================== */

function bubble(m: M.ThreadMessage, team: boolean, extra: Safe = raw('')): Safe {
  return h`<li class="msg${m.mine ? ' mine' : ''}${team ? ' team' : ''}" id="msg-${m.id}">
    <p class="msgmeta"><strong>${m.who}</strong> · ${m.when}</p>
    <p class="msgbody">${m.body}</p>
    ${m.files.length === 0 ? raw('') : h`<ul class="msgfiles">${m.files.map((f) => h`<li><a href="${f.href}">${f.name}</a></li>`)}</ul>`}
    ${m.about === null ? raw('') : h`<p class="msgabout">About ${m.about}</p>`}${extra}</li>`;
}

/**
 * PHASE 142b — THE THREAD WITH THE CLIENT, FOR THE SURVEYOR ON AN ASSIGNED JOB. Read only: no form, and nothing marked
 * read. Lakhbir, 22 September 2026: the surveyor sees "With the client", never "Team only". Null for a login the rule
 * does not admit, so the tab is not drawn at all.
 */
export function surveyorThreadPanel(db: Db, actor: Actor, business_id: string): Safe | null {
  if (!can(actor, 'client_message.read', { type: 'client_message', id: business_id, business_id,
    assigned_surveyor_ids: db.all<{ surveyor_id: string }>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', [business_id]).map((r) => r.surveyor_id) })) return null;
  const t = M.clientThread(db, actor, business_id);
  return h`<h2>Messages with the client</h2>
    <p class="help">What the client and our team have written to each other. You can read it, not reply. Ask Sales to pass on a question.</p>
    ${t.messages.length === 0 ? h`<p class="empty">No messages yet.</p>` : h`<ol class="chat">${t.messages.map((m) => bubble(m, false))}</ol>`}`;
}

/**
 * PHASE 142 — THE FILES OF AN EMAILED REPLY THAT NOBODY HAS SAVED YET. One small form each: say what it is, and it is
 * fetched from the mailbox and saved to Files through the upload path. Only for Admin and Sales (`inbound_email.file`).
 */
function emailedFiles(db: Db, actor: Actor, m: M.ThreadMessage, types: readonly { code: string; label: string }[]): Safe {
  if (!m.by_email) return raw('');
  const files = IE.unsavedFiles(db, actor, m.id);
  if (files.length === 0) return raw('');
  return h`<div class="msgfiles"><p class="help">The email came with ${files.length === 1 ? 'a file' : `${files.length} files`}. Say what each is to save it to Files.</p>${
    files.map((f) => h`<form method="post" action="/staff/replies/files/${f.id}" class="tickform">
      <span>${f.label}</span>
      <label class="vh" for="ef-${f.id}">What is it?</label>
      <select class="fi" id="ef-${f.id}" name="type_code" required><option value="">What is it?</option>${types.map((t) => h`<option value="${t.code}">${t.label}</option>`)}</select>
      <button type="submit">Save to Files</button></form>`)}</div>`;
}

function claimPicker(id: string, claims: readonly M.ClaimChoice[], clientWords: boolean): Safe {
  if (claims.length === 0) return raw('');
  return h`<label class="fl" for="${id}">${clientWords ? 'Which claim is it about?' : 'About which claim?'}</label>
    <select class="fi" id="${id}" name="claim_id"><option value="">${clientWords ? 'All of them, or not sure' : 'The company in general'}</option>${
      claims.map((c) => h`<option value="${c.id}">${clientWords ? c.name : `${c.name} (${c.ref})`}</option>`)}</select>`;
}

/** THE TWO TABS, each with its unread number. A tab this login may not open is not drawn. */
function tabs(business_id: string, current: ChatTab, team: number | null, client: number | null): Safe {
  const link = (tab: ChatTab, label: string, n: number | null): Safe => (n === null ? raw('') : h`<li><a href="/staff/clients/${business_id}?chat=${tab}#chat"${
    current === tab ? raw(' aria-current="page"') : raw('')}>${label}${n > 0 ? h` <span class="unread" aria-label="${n} not read">${n}</span>` : raw('')}</a></li>`);
  return h`<ul class="chattabs" aria-label="Which chat">${link('team', 'Team only', team)}${link('client', 'With the client', client)}</ul>`;
}

/**
 * THE CHAT SECTION'S BODY on the client page. Reading the tab marks it read for this person — the unread numbers shown on
 * the tabs are the ones before this visit, so the person sees what was new.
 */
export function chatBlock(d: { app: App; newId: () => string }, actor: Actor, business_id: string, asked: string | null, done?: string): { body: Safe; unread: number; tab: ChatTab; started: boolean } | null {
  const tab = chatTab(d.app.db, actor, business_id, asked);
  if (tab === null) return null;
  const db = d.app.db;
  const deps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const mayTeam = can(actor, 'internal_note.read', { type: 'internal_note', id: business_id, business_id });
  const mayClient = can(actor, 'client_message.read', { type: 'client_message', id: business_id, business_id });
  const teamN = mayTeam ? M.unreadCount(db, actor, business_id, 'TEAM') : null;
  const clientN = mayClient ? M.unreadCount(db, actor, business_id, 'CLIENT') : null;
  const top = tabs(business_id, tab, teamN, clientN);
  const unread = (teamN ?? 0) + (clientN ?? 0);
  // Whether either thread this login may read has anything in it — for the section's chip.
  const started = (mayTeam && db.get('SELECT 1 FROM internal_notes WHERE business_id = ? LIMIT 1', [business_id]) !== undefined)
    || (mayClient && db.get('SELECT 1 FROM client_messages WHERE business_id = ? LIMIT 1', [business_id]) !== undefined);
  // A thread is marked read only when the person opened its tab — never because the page was drawn with it folded away.
  const opened = asked !== null;
  if (tab === 'team') {
    const t = M.teamThread(db, actor, business_id);
    if (opened) M.markRead(deps, actor, business_id, 'TEAM');
    const claims = mayClient ? M.clientThread(db, actor, business_id).claims : [];
    return {
      tab, unread, started, body: h`${top}
      <p class="teamnote">Only your team sees this. The client never does.</p>
      ${done === 'note' ? savedMessage('Saved. Only your team can see it.') : raw('')}
      ${t.messages.length === 0 ? h`<p class="empty">No messages yet. Start the conversation below.</p>` : h`<ol class="chat">${t.messages.map((m) => bubble(m, true))}</ol>`}
      ${t.may_write ? h`<form method="post" action="/staff/clients/${business_id}/notes" class="pblock chatform">
        <label class="fl" for="team-body">Write to your team</label>
        <textarea class="fi" id="team-body" name="body" required maxlength="${String(M.MAX_MESSAGE)}" rows="3"></textarea>
        ${claimPicker('team-claim', claims, false)}
        <button class="cta" type="submit">Send to the team</button></form>` : raw('')}`,
    };
  }
  const c = M.clientThread(db, actor, business_id);
  const types = IE.mayReadQueue(actor) ? receivableTypes(db) : [];
  if (opened) M.markRead(deps, actor, business_id, 'CLIENT');
  return {
    tab, unread, started, body: h`${top}
    ${done === 'message' ? savedMessage('Sent. The client will see it in their portal.') : raw('')}
    ${done === 'saved-file' ? savedMessage('Saved to Files, under From the client.') : raw('')}
    ${c.messages.length === 0 ? h`<p class="empty">No messages with ${c.company} yet.</p>` : h`<ol class="chat">${c.messages.map((m) => bubble(m, false, emailedFiles(db, actor, m, types)))}</ol>`}
    ${!c.may_write ? raw('') : c.do_not_contact
      ? h`<div class="gate" role="note"><strong>You cannot write to this company.</strong> They asked us not to contact them.</div>`
      : h`<form method="post" action="/staff/clients/${business_id}/messages" class="pblock chatform">
        <label class="fl" for="client-body">Write to ${c.company}</label>
        <textarea class="fi" id="client-body" name="body" required maxlength="${String(M.MAX_MESSAGE)}" rows="4"></textarea>
        ${claimPicker('client-claim', c.claims, false)}
        <button class="cta" type="submit">Send to the client</button>
        <p class="help">${sendingOn(EMAIL_SENDING, smtpLoginFromKeyFile())
          ? 'They read it in their portal. We email them to say a message is waiting — never the message itself.'
          : 'They read it in their portal. We do not email them about it yet.'}</p></form>`}`,
  };
}

/* ================================================================== *
 * STAFF: WRITE TO THE CLIENT
 * ================================================================== */

export type StaffMessageDeps = {
  app: App; store: FsObjectStore; newId: () => string;
  nav: (actor: Actor) => Safe;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
  /** Tests pass their own; the application reads INBOUND_EMAIL and the environment. */
  inbound?: InboundEmail; mailbox?: Mailbox | null;
};

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

/** The mailbox, where reading replies is on and a login is set; otherwise null, and nothing is fetched. */
function mailboxFor(d: StaffMessageDeps): Mailbox | null {
  if (d.mailbox !== undefined) return d.mailbox;
  const login = imapLoginFromKeyFile();
  return readingOn(d.inbound ?? INBOUND_EMAIL, login) && login !== null
    ? imapMailbox(login, undefined, undefined, auditMailConnections(d.app.audit, d.app.now)) : null;
}

export async function handleStaffMessages(
  d: StaffMessageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const deps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };

  const m = /^\/staff\/clients\/([A-Za-z0-9-]+)\/messages$/.exec(path);
  if (m && method === 'POST') {
    const id = m[1] ?? '';
    const f = await form(req);
    const r = M.postClientMessage(deps, actor, id, { body: f.get('body') ?? '', claim_id: f.get('claim_id') });
    if (!r.ok) return d.problem(res, actor, 'Not sent', r.why, `/staff/clients/${id}?chat=client#chat`);
    redirect(res, `/staff/clients/${id}?chat=client&done=message#chat`);
    return 'handled';
  }

  /* ---- PHASE 142: EMAIL REPLIES THE MAILBOX READER COULD NOT FILE ---- */
  if (path === '/staff/replies' && method === 'GET') {
    const q = IE.replyQueue(db, actor);
    const companies = db.all<{ id: string; name: string }>('SELECT id, name FROM businesses ORDER BY name');
    const inbound = d.inbound ?? INBOUND_EMAIL;
    const done = url.searchParams.get('done');
    html(res, 200, page({
      title: 'Email replies to sort', nav: d.nav(actor), wide: true,
      body: h`<h1>Email replies to sort</h1>
        ${done === 'filed' ? savedMessage('Filed. It is on the company’s chat now.') : raw('')}
        ${inbound.enabled ? raw('') : h`<div class="gate" role="note"><strong>We are not reading replies yet.</strong> The contact@caprebate.co.uk mailbox is not set up.</div>`}
        <p class="help">We could not tell which company sent these. Read each one, then choose the company.</p>
        ${q.length === 0 ? h`<p class="empty">Nothing to sort.</p>` : h`<ul class="emaillist">${q.map((e) => h`<li class="tile">
          <p class="tilename">${e.subject === '' ? '(no subject)' : e.subject}</p>
          <p class="filefrom">From ${e.from_address} · ${e.when}${e.files > 0 ? ` · ${e.files} ${e.files === 1 ? 'file' : 'files'}` : ''}</p>
          <p class="help">${e.why}</p>
          <details><summary>Read it</summary><p class="msgbody">${e.text}</p></details>
          <form method="post" action="/staff/replies/${e.id}/file" class="tickform">
            <label class="vh" for="co-${e.id}">Which company is it from?</label>
            <select class="fi" id="co-${e.id}" name="business_id" required><option value="">Which company is it from?</option>${
              companies.map((c) => h`<option value="${c.id}">${c.name}</option>`)}</select>
            <button type="submit">File it</button></form></li>`)}</ul>`}`,
    }));
    return 'handled';
  }
  const file = /^\/staff\/replies\/([A-Za-z0-9-]+)\/file$/.exec(path);
  if (file && method === 'POST') {
    const f = await form(req);
    const r = IE.fileQueued(deps, actor, file[1] ?? '', f.get('business_id') ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not filed', r.why, '/staff/replies');
    redirect(res, '/staff/replies?done=filed');
    return 'handled';
  }
  const save = /^\/staff\/replies\/files\/([A-Za-z0-9-]+)$/.exec(path);
  if (save && method === 'POST') {
    const f = await form(req);
    const r = await IE.saveEmailedFile({ app: d.app, store: d.store, newId: d.newId }, actor, save[1] ?? '', f.get('type_code') ?? '', mailboxFor(d));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, '/staff');
    redirect(res, `/staff/clients/${r.business_id}?chat=client&done=saved-file#chat`);
    return 'handled';
  }
  return 'not-mine';
}

/* ================================================================== *
 * THE PORTAL: MESSAGES
 * ================================================================== */

const PORTAL_DONE: Readonly<Record<string, string>> = Object.freeze({
  sent: 'Sent. We will reply here.',
  file: 'Sent, with your file. It is saved in your documents.',
});

/** The portal's Messages page body. Reading it marks our messages read. */
export function portalMessagesBody(
  d: { app: App; newId: () => string }, actor: Actor, business_id: string, done: string | null, refused?: { why: string; body: string },
): { title: string; body: Safe } {
  const db = d.app.db;
  const t = M.clientThread(db, actor, business_id);
  M.markRead({ db, audit: d.app.audit, now: d.app.now, newId: d.newId }, actor, business_id, 'CLIENT');
  const types = receivableTypes(db);
  return {
    title: 'Messages',
    body: h`
      <header class="highlights"><p class="eyebrow">${t.company}</p><h1>Messages</h1>
        <p>Write to us here. Only you and Cap Rebate can read these messages.</p></header>
      ${done !== null && PORTAL_DONE[done] !== undefined ? savedMessage(PORTAL_DONE[done]) : raw('')}
      ${refused === undefined ? raw('') : h`<p class="err" role="alert"><strong>Not sent.</strong> ${refused.why}</p>`}
      <section class="card" id="thread">
        ${t.messages.length === 0 ? h`<p class="empty">No messages yet. Ask us anything below.</p>` : h`<ol class="chat">${t.messages.map((m) => bubble(m, false))}</ol>`}
      </section>
      ${t.may_write ? h`<section class="card" id="write"><div class="card-h"><h2>Write to us</h2></div>
        <form method="post" action="/portal/messages" enctype="multipart/form-data" class="chatform">
          <label class="fl" for="pm-body">Your message</label>
          <textarea class="fi" id="pm-body" name="body" required maxlength="${String(M.MAX_MESSAGE)}" rows="5">${refused?.body ?? ''}</textarea>
          ${claimPicker('pm-claim', t.claims, true)}
          <fieldset class="chatfile"><legend class="fl">Send a file too (you do not have to)</legend>
            <label class="dropzone" for="pm-file"><span class="dropwords">Drop the file here, or tap to choose it</span>
              <input id="pm-file" type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"></label>
            <label class="fl" for="pm-type">What is the file?</label>
            <select class="fi" id="pm-type" name="type_code"><option value="">Choose one if you send a file</option>${
              types.map((x) => h`<option value="${x.code}">${x.label}</option>`)}</select>
          </fieldset>
          <button class="cta" type="submit">Send</button>
          <div class="help">${why('A file you send is saved in your documents, and we read it. We keep what we need from it.')}</div>
        </form></section>` : raw('')}
      <p><a href="/portal">Back to your claims</a></p>`,
  };
}

/** A multipart form's text fields and file, where the form was sent as one. */
export type PortalSend = { readonly body: string; readonly claim_id: string | null; readonly type_code: string | null; readonly bytes: Uint8Array | null };

/** Read what the client sent: a form with a file, or without one. */
export async function readPortalSend(
  req: IncomingMessage, form: (r: IncomingMessage) => Promise<URLSearchParams>,
  body: (r: IncomingMessage, max?: number) => Promise<Buffer>,
): Promise<{ ok: true; send: PortalSend } | { ok: false; why: string }> {
  const type = req.headers['content-type'];
  if (/^multipart\/form-data\b/i.test(type ?? '')) {
    const boundary = boundaryOf(type);
    if (boundary === null) return { ok: false, why: 'Something went wrong. Try again.' };
    let raw0: Buffer;
    try { raw0 = await body(req, UPLOAD_LIMITS.max_bytes + 64 * 1024); } catch { return { ok: false, why: `That file is too big. The most we take is ${Math.round(UPLOAD_LIMITS.max_bytes / 1024 / 1024)} MB.` }; }
    let parts: Part[];
    try { parts = parseMultipart(new Uint8Array(raw0), boundary); } catch { return { ok: false, why: 'Something went wrong. Try again.' }; }
    // THE FILE IS NOT REQUIRED: an empty file box is a message with no file. More than one file is refused, as everywhere.
    const files = parts.filter((p) => p.filename !== undefined && p.bytes.length > 0);
    if (files.length > 1) return { ok: false, why: 'Send one file at a time.' };
    const field = (n: string): string | null => {
      const p = parts.find((x) => x.filename === undefined && x.name === n);
      return p === undefined ? null : Buffer.from(p.bytes).toString('utf8');
    };
    return { ok: true, send: { body: field('body') ?? '', claim_id: field('claim_id'), type_code: field('type_code'), bytes: files[0]?.bytes ?? null } };
  }
  const f = await form(req);
  return { ok: true, send: { body: f.get('body') ?? '', claim_id: f.get('claim_id'), type_code: f.get('type_code'), bytes: null } };
}

/**
 * SEND A CLIENT'S MESSAGE, WITH ITS FILE IF THERE IS ONE. Everything that could refuse the message is asked BEFORE the
 * file is received, so a refused message leaves no file behind; the file then goes through `receiveFile`, the path every
 * upload takes, tagged to the claim picked; and the message is written with the file linked to it.
 */
export async function sendFromPortal(
  d: { app: App; store: FsObjectStore; newId: () => string }, actor: Actor, business_id: string, s: PortalSend,
): Promise<{ ok: true; with_file: boolean } | { ok: false; why: string }> {
  const db = d.app.db;
  const claim_id = s.claim_id === null || s.claim_id === '' ? null : s.claim_id;
  const refusal = M.messageRefusal(db, actor, business_id, { body: s.body, claim_id });
  if (refusal !== null) return { ok: false, why: refusal };
  const files: string[] = [];
  if (s.bytes !== null && s.bytes.length > 0) {
    if (s.type_code === null || s.type_code === '') return { ok: false, why: 'Choose what the file is.' };
    const r = await receiveFile(d, actor, { business_id, type_code: s.type_code, logical_document_id: null, request_id: null, claim_id }, s.bytes);
    if (!r.ok) return { ok: false, why: r.why };
    files.push(r.logical_document_id);
  }
  const w = M.postClientMessage({ db, audit: d.app.audit, now: d.app.now, newId: d.newId }, actor, business_id, { body: s.body, claim_id }, files);
  if (!w.ok) return w;
  return { ok: true, with_file: files.length > 0 };
}
