/**
 * THE ACCOUNTANT'S CONFIRMATIONS, ON SCREEN — Phase 158d, 9 October 2026 (F46). src/web/accountant-confirm.ts holds the rules.
 *
 *   On the claim page   "The accountant's confirmations": what was sent and what came back, and (Admin and Sales, at the
 *                       right stage, on the accountant route) a form to send the link.
 *   POST /staff/claims/{id}/accountant-confirm   send one (`email.queue`).
 *   /confirm/{token}    the accountant's own page: no login, the link alone. They confirm, or say it is not so.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { can, type Actor } from '../authz.ts';
import type { Db } from '../db.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { badge } from './components.ts';
import { localDate, localStamp, ukDate } from './localtime.ts';
import * as A from './accountant-confirm.ts';
import { accountantFiles } from './claim-record.ts';

const KIND_WORDS: Readonly<Record<A.ConfirmKind, string>> = Object.freeze({
  RETURN_FIT: 'The claim fits the return and the amendment window',
  FILED: 'The amended return was filed',
});

/** The claim page's block. Empty where the client has no accountant (the client-filing route) and nothing was sent. */
export function accountantConfirmBlock(db: Db, actor: Actor, claim_id: string): Safe {
  const c = db.get<{ business_id: string; stage: string | null }>('SELECT business_id, stage FROM claims WHERE id = ?', [claim_id]);
  if (c === undefined) return raw('');
  const rows = A.confirmRequestsOf(db, claim_id);
  const kind = (Object.keys(A.CONFIRM_ASKS) as A.ConfirmKind[]).find((k) => A.CONFIRM_ASKS[k].stages.includes(c.stage ?? ''));
  const mayAsk = kind !== undefined && accountantFiles(db, claim_id) && can(actor, 'email.queue', { type: 'email', id: c.business_id, business_id: c.business_id });
  if (rows.length === 0 && !mayAsk) return raw('');
  const people = mayAsk ? A.accountantContacts(db, c.business_id) : [];
  const returns = mayAsk && kind === 'FILED' ? A.returnsOf(db, claim_id, new Date().toISOString()) ?? [] : [];
  // A closed claim asks only about a return held in aftercare (PHASE 159l).
  if (c.stage === 'CLOSED' && returns.length <= 1 && rows.length === 0) return raw('');
  const asking = mayAsk && !(c.stage === 'CLOSED' && returns.length <= 1);
  return h`<div class="pblock" id="accountant-confirm"><h3>The accountant’s confirmations</h3>
    <p class="help">The client’s accountant confirms these for themselves, through a private link we email them. Nobody here ticks them.</p>
    ${rows.length === 0 ? raw('') : h`<ul class="plain">${rows.map((r) => h`<li>${KIND_WORDS[r.kind]}${r.period_end === null ? '' : ` (the period ending ${ukDate(r.period_end)})`} — ${r.answer === null
      ? h`${badge('Waiting for an answer')} sent to ${r.contact_name} by ${r.sent_by_name}, ${localStamp(r.sent_at)}`
      : r.answer.outcome === 'CONFIRMED'
        ? h`${badge('Confirmed', 'ok')} by ${r.answer.signer_name} of ${r.answer.signer_firm ?? ''}${r.answer.filed_on === null ? '' : `, filed on ${ukDate(r.answer.filed_on)}`}, ${localStamp(r.answer.answered_at)}`
        : h`${badge('Not confirmed', 'warn')} ${r.answer.signer_name}: “${r.answer.reason ?? ''}”, ${localStamp(r.answer.answered_at)}`}</li>`)}</ul>`}
    ${!asking || kind === undefined ? raw('') : people.length === 0
      ? h`<p>${badge('No accountant to ask', 'warn')} Add the client’s accountant as a contact, with their email address, first.</p>`
      : h`<form method="post" action="/staff/claims/${claim_id}/accountant-confirm"><input type="hidden" name="kind" value="${kind}">
        <p>Ask them: <strong>${kind === 'FILED' && returns.length > 1 ? 'The tax return you choose below, carrying its part of this claim, has been filed.' : A.askFor(kind, kind === 'FILED' ? returns[0]?.period_end ?? null : null)}</strong></p>
        ${kind === 'FILED' && returns.length > 1 ? h`<p class="help">This claim goes into ${String(returns.length)} tax returns. Each is confirmed by its own link.</p>
        <label>Which return <select name="period_end" required><option value="">choose</option>${returns.map((r) => h`<option value="${r.period_end}">The period ending ${ukDate(r.period_end)}${r.due_on === null ? '' : `, due ${ukDate(r.due_on)}`} (${r.parts.join('; ')})</option>`)}</select></label>` : raw('')}
        <label>Their accountant <select name="contact_id" required><option value="">choose</option>${people.map((p) => h`<option value="${p.id}">${p.name} (${p.email})</option>`)}</select></label>
        <button type="submit">Email them the link</button></form>`}</div>`;
}

export async function handleAccountantConfirmStaff(
  d: { app: App; newId: () => string; origin: string; problem: (res: ServerResponse, actor: Actor, title: string, why: string, back: string, field?: string) => 'handled' },
  req: IncomingMessage, res: ServerResponse, url: URL, method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const m = /^\/staff\/claims\/([A-Za-z0-9-]+)\/accountant-confirm$/.exec(url.pathname);
  if (m === null || method !== 'POST') return 'not-mine';
  const id = m[1] ?? '';
  const f = await form(req);
  const r = A.sendConfirmRequest({ db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId, email: d.app.email }, actor, id,
    { kind: f.get('kind') ?? '', contact_id: f.get('contact_id') ?? '', origin: d.origin, period_end: f.get('period_end') ?? '' });
  if (!r.ok) return d.problem(res, actor, 'Not sent', r.why, `/staff/claims/${id}#accountant-confirm`, r.field);
  res.writeHead(303, { location: `/staff/claims/${id}?done=${r.requested === true ? 'emailed' : 'saved-email'}#accountant-confirm` });
  res.end();
  return 'handled';
}

const LINK_HEADERS = Object.freeze({ ...HTML_HEADERS, 'cache-control': 'no-store' });
function linkPage(res: ServerResponse, status: number, title: string, body: Safe): 'handled' {
  res.writeHead(status, LINK_HEADERS);
  res.end(page({ title, wide: true, body }));
  return 'handled';
}

/** The accountant's page, by the link alone. */
export async function handleConfirmLink(
  app: App, newId: () => string, req: IncomingMessage, res: ServerResponse, url: URL, method: string,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<'handled' | 'not-mine'> {
  const m = /^\/confirm\/([A-Za-z0-9_-]{1,100})$/.exec(url.pathname);
  if (m === null) return 'not-mine';
  const token = m[1] ?? '';
  let err: { why: string } | null = null;
  let posted: URLSearchParams | null = null;
  if (method === 'POST') {
    posted = await form(req);
    const r = A.answerConfirmLink({ db: app.db, audit: app.audit, now: app.now, newId }, token, {
      outcome: posted.get('outcome') ?? '', name: posted.get('name') ?? '', firm: posted.get('firm') ?? '',
      filed_on: posted.get('filed_on') ?? '', reason: posted.get('reason') ?? '', sure: posted.get('sure') ?? '',
    });
    if (r.ok) { res.writeHead(303, { location: `/confirm/${token}` }); res.end(); return 'handled'; }
    err = { why: r.why };
  } else if (method !== 'GET') {
    return 'not-mine';
  }
  const v = A.confirmLinkView(app.db, app.now(), token);
  if (v.state === 'NONE') return linkPage(res, 404, 'Link not found', h`<div class="card"><h1>This link is not one of ours</h1><p>Check it was copied in full, or ask Cap Rebate for a new one.</p></div>`);
  if (v.state === 'EXPIRED') return linkPage(res, 410, 'Link run out', h`<div class="card"><h1>This link has run out</h1><p>Ask Cap Rebate for a new one.</p></div>`);
  if (v.state === 'ANSWERED') {
    return linkPage(res, err === null ? 200 : 409, 'Thank you', h`<div class="card">${err === null ? raw('') : h`<p role="alert"><strong>${err.why}</strong></p>`}<h1>Thank you</h1>
      <p>We have your answer, from ${ukDate(localDate(v.answered_at))}. This link does nothing more.</p></div>`);
  }
  const val = (k: string) => posted?.get(k) ?? '';
  return linkPage(res, err === null ? 200 : 400, 'Please confirm', h`
    <div class="card"><h1>${v.company} — please confirm</h1>
      <p><strong>Dear ${v.contact_name},</strong> we are working with ${v.company} on their capital allowances claim (our reference ${v.claim_ref}). Please tell us, for yourself, whether this is true:</p>
      <p class="pdash-big">${A.askFor(v.kind, v.period_end)}</p>
      <p class="help">This link is for you alone. It works once, until ${ukDate(localDate(v.expires_at))}.</p></div>
    ${err === null ? raw('') : h`<div class="gate" role="alert"><strong>Not saved.</strong> ${err.why}</div>`}
    <div class="rp-forms">
      <form method="post" action="/confirm/${token}" class="pk-add"><input type="hidden" name="outcome" value="CONFIRMED">
        <h3>Yes, this is true</h3>
        <div class="pk-fields"><label>Your full name <input class="fi" name="name" maxlength="200" required autocomplete="name" value="${val('outcome') === 'CONFIRMED' ? val('name') : ''}"></label>
          <label>Your firm, as registered <input class="fi" name="firm" maxlength="300" required autocomplete="organization" placeholder="ending Limited, LLP or plc" value="${val('firm')}"></label>
          ${v.kind === 'FILED' ? h`<label>The day it was filed <input class="fi" type="date" name="filed_on" required value="${val('filed_on')}"></label>` : raw('')}</div>
        <label class="ck"><input type="checkbox" name="sure" value="yes" required> I confirm this is true.</label>
        <button class="cta" type="submit">I confirm it</button></form>
      <form method="post" action="/confirm/${token}" class="pk-add"><input type="hidden" name="outcome" value="NOT_CONFIRMED">
        <h3>No, it is not</h3>
        <div class="pk-fields"><label>Your full name <input class="fi" name="name" maxlength="200" required autocomplete="name" value="${val('outcome') === 'NOT_CONFIRMED' ? val('name') : ''}"></label></div>
        <label class="pk-why-l">Why? <textarea class="fi" name="reason" maxlength="2000" rows="4" required>${val('reason')}</textarea></label>
        <button class="btn" type="submit">Send this answer</button></form>
    </div>
    <p class="help">You can answer once. Your name, your firm and the time are kept with the claim.</p>`);
}
