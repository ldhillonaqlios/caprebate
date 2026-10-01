/**
 * FREE-TYPED EMAIL — THE PAGES. Phase 141, 21 September 2026. "Back office and portal clean-up, 8 of 11."
 *
 *   GET  /staff/clients/:id/email    write an email to one of the company's contacts; ?claim= tags a claim, and
 *                                    ?template= with ?contact= starts it from a template
 *   POST /staff/clients/:id/email    save it (and send it, the day sending is on)
 *   GET  /staff/leads/:id/email      the same, from a lead card
 *   POST /staff/leads/:id/email
 *
 * The "Email" button sits in the client page's header beside Files, on each lead card, and on a claim page (which opens
 * this page with the claim already chosen). NOTHING HERE DECIDES ANYTHING: src/web/free-email.ts asks every rule again on
 * the POST, whatever the form offered.
 *
 * NO SCRIPT, as everywhere (the content security policy allows none): "Start from a template" is a small form that
 * reloads this page with the template's words in the boxes; staff then edit them.
 *
 * 1 OCTOBER 2026 — TWO HALVES. Lakhbir: "the right hand side should show the chain of emails allowing a user to click on
 * reply making them apart of the chain so essentially the left becomes a send message, if no current email chain (on the
 * right) is selected then it fires as a new email." On the left, the email being written: To is filled in (the main
 * contact, or the chain's correspondent) and can be typed over, with the company's contacts offered as suggestions. On
 * the right, every chain of emails with them (src/web/email-chains.ts), the newest open; "Reply" under a chain opens this
 * page with ?thread=, and the left becomes a reply in that chain. Opening the page reads their emails (the red dot on
 * Chat goes).
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { savedMessage, why } from './components.ts';
import type { FsObjectStore } from './objectstore.ts';
import * as F from './free-email.ts';
import { SAVED_NOT_SENT } from '../stubs/email.ts';
import { EMAIL_SENDING, auditMailConnections, dispatchOutbox, smtpLoginFromKeyFile, smtpProvider, type EmailSending, type SmtpLogin } from '../stubs/email-provider.ts';
import { openKeptOriginal } from './uploads.ts';
import { markChannelRead } from './messages.ts';
import type { EmailChain } from './email-chains.ts';

export type WebResult = 'handled' | 'not-mine';

export type EmailPageDeps = {
  app: App;
  store: FsObjectStore;
  newId: () => string;
  nav: (actor: Actor) => Safe;
  problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled';
  /** Tests pass their own; the application reads EMAIL_SENDING and the environment. */
  sending?: EmailSending;
  login?: SmtpLogin | null;
};

/** An envelope, drawn inline. Decoration only: the word beside it says what it is. */
export const ENVELOPE_ICON = '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3.5 7l8.5 6 8.5-6"/>';

export function emailIcon(): Safe {
  return h`<svg class="fold-svg" aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${raw(ENVELOPE_ICON)}</svg>`;
}

/** The Email button: in the client page's header, on a lead card, and on a claim page with the claim chosen. */
export function emailButton(href: string): Safe {
  return h`<a class="filesbtn emailbtn" href="${href}">${emailIcon()}<span>Email</span></a>`;
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

const ASK = ['claim', 'template', 'contact', 'thread'] as const;

export async function handleFreeEmail(
  d: EmailPageDeps, req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const m = /^\/staff\/(clients|leads)\/([A-Za-z0-9-]+)\/email$/.exec(url.pathname);
  if (!m) return 'not-mine';
  const subject: F.EmailSubject = { kind: m[1] === 'clients' ? 'company' : 'lead', id: m[2] ?? '' };
  const sending = d.sending ?? EMAIL_SENDING;
  const login = d.login === undefined ? smtpLoginFromKeyFile() : d.login;
  const deps: F.EmailDeps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId, sending, login };

  if (method === 'GET') {
    const ask: Record<string, string | null> = {};
    for (const k of ASK) ask[k] = url.searchParams.get(k);
    const f = F.emailForm(deps, actor, subject, ask);
    // Their emails are on this page: reading it reads them.
    if (f.business_id !== null) markChannelRead({ db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId }, actor, f.business_id, 'EMAIL');
    html(res, 200, emailPage(d, actor, f, url.searchParams.get('done')));
    return 'handled';
  }
  if (method !== 'POST') return 'not-mine';
  const p = await form(req);
  const input: Record<string, string | null> = {};
  for (const k of ['contact_id', 'claim_id', 'subject', 'body', 'to_email', 'thread']) input[k] = p.get(k);
  const r = F.saveEmail(deps, actor, subject, input, p.getAll('attach'));
  if (!r.ok) {
    // Drawn again with what was typed, so a refusal never costs a long email. Nothing was saved.
    const f = F.emailForm(deps, actor, subject, {
      claim: input['claim_id'] ?? null, contact: input['contact_id'] ?? null, thread: input['thread'] ?? null, to: input['to_email'] ?? null,
    });
    html(res, 400, emailPage(d, actor, { ...f, prefill: { ...f.prefill, subject: input['subject'] ?? '', body: input['body'] ?? '' } }, null, r.why));
    return 'handled';
  }
  let done = 'saved';
  if (r.requested) {
    // Sending is on: send this one now. A failure leaves it saved, with the reason, and the page says so.
    const provider = login === null ? null : smtpProvider(login, undefined, undefined, auditMailConnections(d.app.audit, d.app.now));
    const out = await dispatchOutbox({ db: d.app.db, now: d.app.now }, sending, login, provider, async (document_id) => {
      const kept = await openKeptOriginal({ db: d.app.db, store: d.store, now: d.app.now, audit: d.app.audit }, actor, document_id);
      if (kept === null) return null;
      const ext = kept.sniffed_as === 'pdf' ? 'pdf' : kept.sniffed_as === 'png' ? 'png' : kept.sniffed_as === 'jpeg' ? 'jpg' : 'bin';
      const type = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : 'application/octet-stream';
      return { filename: `${kept.filename}.${ext}`, content_type: type, bytes: kept.bytes };
    }, r.id);
    done = out.state === 'RAN' && out.sent === 1 ? 'sent' : 'failed';
  }
  redirect(res, `${r.action}?done=${done}`);
  return 'handled';
}

const DONE: Readonly<Record<string, string>> = Object.freeze({
  saved: SAVED_NOT_SENT,
  sent: 'Sent.',
  failed: 'Saved, but it could not be sent. The reason is in the list below.',
});

function selected(on: boolean): Safe {
  return on ? raw(' selected') : raw('');
}

function sendingNotice(f: F.EmailForm): Safe {
  if (f.sending.on) return raw('');
  return h`<div class="gate" role="note"><strong>Emails are not being sent yet.</strong> We save each one here and on the company’s timeline.
    ${why(h`Before emails can go out: <ul>${f.sending.missing.map((x) => h`<li>${x}</li>`)}</ul>`)}</div>`;
}

function templateStarter(f: F.EmailForm): Safe {
  if (f.templates.length === 0 || f.do_not_contact) return raw('');
  return h`<details class="lc-act emailtpl"><summary>Start from a template</summary>
    <form method="get" action="${f.action}">
      <label class="fl" for="tpl-template">Template</label>
      <select class="fi" id="tpl-template" name="template">${f.templates.map((t) => h`<option value="${t.id}"${selected(t.id === f.prefill.template_id)}>${t.label}</option>`)}</select>
      <input type="hidden" name="contact" value="${f.prefill.contact_id}">
      ${f.replying === null ? raw('') : h`<input type="hidden" name="thread" value="${f.replying.key}">`}
      ${f.prefill.claim_id === '' ? raw('') : h`<input type="hidden" name="claim" value="${f.prefill.claim_id}">`}
      <button class="cta" type="submit">Use this template</button>
      <p class="help">It fills in the subject and the message. Change anything before you save.</p>
    </form></details>`;
}

function composeForm(f: F.EmailForm): Safe {
  if (f.do_not_contact) {
    return h`<div class="gate" role="note"><strong>You cannot email this company.</strong> They asked us not to contact them.</div>`;
  }
  const main = f.contacts.find((c) => c.email.toLowerCase() === f.prefill.to.toLowerCase());
  return h`<form method="post" action="${f.action}" class="pblock emailform">
    ${f.replying === null ? raw('') : h`<input type="hidden" name="thread" value="${f.replying.key}">`}
    <p class="emailfrom"><span class="help">From</span> ${f.sender.from_header}</p>
    <label class="fl" for="em-to">To</label>
    <input class="fi" id="em-to" name="to_email" type="email" required maxlength="254" list="em-to-list" autocomplete="off" value="${f.prefill.to}">
    ${f.contacts.length === 0 ? raw('') : h`<datalist id="em-to-list">${f.contacts.map((c) => h`<option value="${c.email}">${c.name}</option>`)}</datalist>`}
    <p class="help">${f.contacts.length === 0
      ? h`None of their contacts has an email address yet. Type one${f.subject.kind === 'company' ? h`, or <a href="/staff/clients/${f.subject.id}#contacts">add it to a contact</a>` : raw('')}.`
      : h`${main === undefined ? 'Typed in.' : `${main.name}.`} You can type another address. A reply from an address that is not one of their contacts waits under Email replies to sort.`}</p>
    ${f.claims.length === 0 ? raw('') : h`<label class="fl" for="em-claim">Which claim is it about?</label>
      <select class="fi" id="em-claim" name="claim_id"><option value="">The whole company</option>${
        f.claims.map((c) => h`<option value="${c.id}"${selected(c.id === f.prefill.claim_id)}>${c.name} (${c.ref})</option>`)}</select>`}
    <label class="fl" for="em-subject">Subject</label>
    <input class="fi" id="em-subject" name="subject" required maxlength="300" value="${f.prefill.subject}">
    <label class="fl" for="em-body">Message</label>
    <textarea class="fi" id="em-body" name="body" required maxlength="20000" rows="10">${f.prefill.body}</textarea>
    <fieldset class="emailfiles"><legend class="fl">Attach files</legend>
      ${f.attachable.length === 0 ? h`<p class="help">${f.attach_words ?? 'No file can be attached.'}</p>`
        : h`${f.attachable.map((a) => h`<label class="tickbox"><input type="checkbox" name="attach" value="${a.id}"> ${a.name}</label>`)}
          <p class="help">Up to ${String(F.MAX_ATTACHMENTS)} files, from this company’s Files.</p>`}
    </fieldset>
    <button class="cta" type="submit">${f.sending.on ? (f.replying === null ? 'Send' : 'Send the reply') : 'Save the email'}</button>
    ${f.sending.on ? raw('') : h`<p class="help">It will not be sent yet.</p>`}
  </form>`;
}

/** One chain: its emails, oldest first, each marked ours or theirs; and Reply. The newest chain, or the one being replied
 *  to, is open. */
function chainBlock(f: F.EmailForm, c: EmailChain, open: boolean): Safe {
  const replying = f.replying?.key === c.key;
  return h`<details class="echain${replying ? ' is-reply' : ''}" id="chain-${c.key}"${open ? raw(' open') : raw('')}>
    <summary><span class="echain-subj">${c.subject}</span>${c.unread > 0 ? h` <span class="newdot" aria-label="${String(c.unread)} new">New</span>` : raw('')}
      <span class="help echain-meta">${String(c.emails.length)} ${c.emails.length === 1 ? 'email' : 'emails'} · ${c.emails[c.emails.length - 1]?.when ?? ''}</span></summary>
    <ol class="chat">${c.emails.map((e) => h`<li class="msg${e.ours ? ' mine' : ''}${e.unread ? ' is-new' : ''}">
      <p class="msgmeta"><span class="via">Email</span> <strong>${e.who}</strong> · ${e.when}${e.state === null ? '' : ` · ${e.state}`}</p>
      ${e.subject.replace(/^(re:\s*)+/i, '') === c.subject ? raw('') : h`<p class="msgsubj">${e.subject}</p>`}
      <p class="msgbody">${e.body}</p></li>`)}</ol>
    ${f.do_not_contact ? raw('') : replying ? h`<p class="help">You are replying to this one, on the left.</p>`
      : h`<p><a class="btn" href="${f.action}?thread=${c.key}#compose">Reply</a></p>`}
  </details>`;
}

function chainsPanel(f: F.EmailForm): Safe {
  if (f.chains.length === 0) return h`<p class="empty">No emails with ${f.company} yet. Write the first on the left.</p>`;
  return h`${f.chains.map((c, i) => chainBlock(f, c, f.replying === null ? i === 0 : f.replying.key === c.key))}`;
}

function emailPage(d: EmailPageDeps, actor: Actor, f: F.EmailForm, done: string | null, refused?: string): string {
  return page({
    title: `Email ${f.company}`, nav: d.nav(actor), wide: true,
    body: h`
      ${done !== null && DONE[done] !== undefined ? savedMessage(DONE[done]) : raw('')}
      ${refused === undefined ? raw('') : h`<p class="err" role="alert"><strong>Not saved.</strong> ${refused}</p>`}
      <h1>Email ${f.company}</h1>
      <p><a href="${f.back}">Back to ${f.subject.kind === 'company' ? f.company : 'the leads'}</a></p>
      ${sendingNotice(f)}
      <div class="convo">
        <section class="convo-write" id="compose" aria-labelledby="compose-h">
          <h2 id="compose-h">${f.replying === null ? 'New email' : 'Reply'}</h2>
          ${f.replying === null
            ? (f.chains.length === 0 ? raw('') : h`<p class="help">To answer an email, press Reply under it. This one starts a new conversation.</p>`)
            : h`<p class="help">In the conversation “${f.replying.subject}”. <a href="${f.action}">Write a new email instead</a></p>`}
          ${templateStarter(f)}
          ${composeForm(f)}
          ${f.not_offered.length === 0 ? raw('') : h`<p class="help">Not suggested: ${f.not_offered.map((n, i) => h`${i === 0 ? '' : '; '}${n.name} (${n.why})`)}.</p>`}
        </section>
        <section class="convo-chain" aria-labelledby="chains-h">
          <h2 id="chains-h">Emails with ${f.company}</h2>
          ${chainsPanel(f)}
        </section>
      </div>`,
  });
}
