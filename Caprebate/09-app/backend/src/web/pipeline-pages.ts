/**
 * LEADS AND THE PIPELINE — THE ROUTES AND THE PAGES. CRM 2 of 10, 10 September 2026.
 *
 * Same shape as src/web/crm-pages.ts: it returns 'not-mine' for anything it does
 * not own, so the mounting in staff.ts is one line.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/leads.ts and src/web/pipeline.ts
 * authorise every read and write on the specific object and ask every gate on
 * the server; this file draws what they return and posts what a person asked for.
 *
 * DRAGGING IS A COURTESY, AND IN THIS BUILD IT IS A BUTTON. The content security
 * policy forbids script and every page works without JavaScript, so a card on
 * the board carries a form that asks to move it one stage on. It posts to the
 * same move the claim page makes, and the server asks the gate again — which is
 * the whole of what "the write asks the gate again" requires.
 *
 * Every staff-supplied value — a next action, a note, a hold reason, an
 * organisation's name on a referral — goes through `h` and is escaped on output.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { can, type Actor } from '../authz.ts';
import { badge, brandName, dataLink, fields, highlights, nextStepCard, recordLayout, recordTabs, savedMessage, sidePanel, why } from './components.ts';
import { leadNextStep, plainNeed } from './next-step.ts';
import { dueWords, ukDatesIn } from './localtime.ts';
import { navContext } from './navigation.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as C from './crm.ts';
import * as L from './leads.ts';
import * as P from './pipeline.ts';
import * as T from './tasks.ts';
import { newTaskForm, timelineBlock } from './tasks-pages.ts';
import * as LI from './lists.ts';
import { taskChoices, vocabulary } from './vocabularies.ts';
import { listControls, mayShareViews, requestParams, sortHeading, type SortBy } from './lists-pages.ts';
import { timelineIfPermitted } from './timeline.ts';
import { referralBlock } from './introducers-pages.ts';

export type WebResult = 'handled' | 'not-mine';

export type PipelinePageDeps = {
  app: App;
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

function posted(f: URLSearchParams, names: readonly string[]): C.Fields {
  const out: Record<string, string | null> = {};
  for (const n of names) {
    if (!f.has(n)) continue;
    const v = (f.get(n) ?? '').trim();
    out[n] = v === '' ? null : v;
  }
  return out;
}

function nonBlank(v: string | null): string | null {
  return v === null || v.trim() === '' ? null : v.trim();
}

const NEW_LEAD_FIELDS = ['business_id', 'prospect_organisation', 'prospect_sector', 'source', 'next_action', 'next_action_due'] as const;
// CRM 9 of 10: a lead's next action is a task on the lead now (migration 018), so it is not posted with the lead.
const LEAD_FIELDS = ['owner_id', 'priority', 'source', 'status', 'lost_reason', 'lost_note',
  'prospect_organisation', 'prospect_sector', 'introducer_id'] as const;

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handlePipeline(
  d: PipelinePageDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const deps: C.CrmDeps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const done = url.searchParams.get('done') ?? undefined;

  /* ------------------------------------------------------------ leads */
  if (path === '/staff/leads' && method === 'GET') {
    // CRM 9 of 10: filtered, sorted and saved through src/web/lists.ts, each row still asked of `lead.read`.
    const asked = requestParams(d.app, actor, 'LEADS', url.searchParams);
    const v = LI.leadsList(db, actor, asked.params, asked.ignored);
    html(res, 200, leadsPage(d, actor, v.rows, organisationsFor(db, actor), done,
      listControls('LEADS', v, LI.viewsFor(db, actor, 'LEADS'), mayShareViews(actor), asked.view), sortHeading('LEADS', v)));
    return 'handled';
  }
  if (path === '/staff/leads' && method === 'POST') {
    const r = L.createLead(deps, actor, posted(await form(req), NEW_LEAD_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Lead not recorded', r.why, '/staff/leads', r.field);
    redirect(res, `/staff/leads/${r.id}?done=created`);
    return 'handled';
  }

  const leadJson = /^\/staff\/leads\/([A-Za-z0-9-]+)\/view\.json$/.exec(path);
  if (leadJson && method === 'GET') {
    json(res, 200, L.leadView(db, actor, leadJson[1] ?? ''));
    return 'handled';
  }

  const leadChecks = /^\/staff\/leads\/([A-Za-z0-9-]+)\/checks$/.exec(path);
  if (leadChecks && method === 'POST') {
    const id = leadChecks[1] ?? '';
    const f = await form(req);
    const r = P.recordEnquiryCheck(deps, actor, { lead_id: id },
      { check_key: f.get('check_key'), answer: f.get('answer'), note: f.get('note') });
    if (!r.ok) return d.problem(res, actor, 'Check not recorded', r.why, `/staff/leads/${id}`, r.field);
    redirect(res, `/staff/leads/${id}?done=checked`);
    return 'handled';
  }

  const leadConvert = /^\/staff\/leads\/([A-Za-z0-9-]+)\/convert$/.exec(path);
  if (leadConvert && method === 'POST') {
    const id = leadConvert[1] ?? '';
    const r = L.convertLead(deps, actor, id, posted(await form(req), ['business_id', 'property_id']));
    if (!r.ok) return d.problem(res, actor, 'Not converted', r.why, `/staff/leads/${id}`);
    redirect(res, `/staff/claims/${r.id}?done=opened`);
    return 'handled';
  }

  const lead = /^\/staff\/leads\/([A-Za-z0-9-]+)$/.exec(path);
  if (lead && method === 'GET') {
    const v = L.leadView(db, actor, lead[1] ?? '');
    /* CRM 3 of 10: the lead's own timeline — read by the lead's id, so a call asked
       for at the reasoned negative is on it — and a follow-up or a task on the lead. */
    const tail = h`${timelineBlock(timelineIfPermitted(db, actor, { kind: 'lead', id: v.id }))}${
      T.mayCreateTask(actor)
        ? h`<div class="pblock"><div class="pnum">Tasks on this lead</div>${newTaskForm(taskChoices(db), { lead_id: v.id }, T.taskOwnerChoices(db), `/staff/leads/${v.id}`, 'Add a follow-up or a task')}</div>`
        : raw('')}`;
    html(res, 200, leadPage(d, actor, v, done, tail));
    return 'handled';
  }
  if (lead && method === 'POST') {
    const id = lead[1] ?? '';
    const r = L.updateLead(deps, actor, id, posted(await form(req), LEAD_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/leads/${id}`);
    redirect(res, `/staff/leads/${id}?done=saved`);
    return 'handled';
  }

  /* ----------------------------------------------------------- the board */
  if (path === '/staff/pipeline/view.json' && method === 'GET') {
    json(res, 200, C.pipelineBoard(db, actor, d.app.now()));
    return 'handled';
  }
  if (path === '/staff/pipeline' && method === 'GET') {
    html(res, 200, boardPage(d, actor, C.pipelineBoard(db, actor, d.app.now()), done));
    return 'handled';
  }

  /* ------------------------------------- a claim's moves, confirmations, checks */
  const move = /^\/staff\/claims\/([A-Za-z0-9-]+)\/stage$/.exec(path);
  if (move && method === 'POST') {
    const id = move[1] ?? '';
    const f = await form(req);
    const back = f.get('back') === 'board' ? '/staff/pipeline' : `/staff/claims/${id}`;
    const r = P.moveClaim(deps, actor, id, {
      kind: f.get('kind') ?? '', to: nonBlank(f.get('to')), reason_code: nonBlank(f.get('reason_code')),
      reason: nonBlank(f.get('reason')),
      // CRM 3 of 10: a next action named on the move is written with it; the store checks it.
      next_action: {
        title: nonBlank(f.get('next_action_title')), owner_id: nonBlank(f.get('next_action_owner')),
        due_on: nonBlank(f.get('next_action_due')),
      },
    });
    if (!r.ok) return d.problem(res, actor, 'Not moved', r.why, back, r.field);
    redirect(res, `${back}?done=moved`);
    return 'handled';
  }

  const milestone = /^\/staff\/claims\/([A-Za-z0-9-]+)\/milestones$/.exec(path);
  if (milestone && method === 'POST') {
    const id = milestone[1] ?? '';
    const f = await form(req);
    const r = P.recordMilestone(deps, actor, id, f.get('milestone'), f.get('note'));
    if (!r.ok) return d.problem(res, actor, 'Not confirmed', r.why, `/staff/claims/${id}`);
    redirect(res, `/staff/claims/${id}?done=confirmed`);
    return 'handled';
  }

  const claimChecks = /^\/staff\/claims\/([A-Za-z0-9-]+)\/checks$/.exec(path);
  if (claimChecks && method === 'POST') {
    const id = claimChecks[1] ?? '';
    const f = await form(req);
    const r = P.recordEnquiryCheck(deps, actor, { claim_id: id },
      { check_key: f.get('check_key'), answer: f.get('answer'), note: f.get('note') });
    if (!r.ok) return d.problem(res, actor, 'Check not recorded', r.why, `/staff/claims/${id}`);
    redirect(res, `/staff/claims/${id}?done=checked`);
    return 'handled';
  }

  return 'not-mine';
}

/** The organisations a lead may be recorded against — only for a reader of organisations. */
function organisationsFor(db: C.CrmDeps['db'], actor: Actor): { id: string; name: string }[] {
  if (!can(actor, 'organisation.read', { type: 'business', id: '__crm_section__' })) return [];
  return C.organisationList(db, actor).map((o) => ({ id: o.id, name: o.trading_name }));
}

/* ------------------------------------------------------------------ *
 * PIECES
 * ------------------------------------------------------------------ */

function options(vocab: Readonly<Record<string, string>>, current: string | null, blank: string | null): Safe {
  return h`${blank === null ? raw('') : h`<option value=""${current === null ? raw(' selected') : raw('')}>${blank}</option>`}${
    Object.entries(vocab).map(([k, label]) => h`<option value="${k}"${k === current ? raw(' selected') : raw('')}>${label}</option>`)}`;
}

function people(list: readonly { id: string; name: string }[], current: string | null, blank: string): Safe {
  return h`<option value=""${current === null ? raw(' selected') : raw('')}>${blank}</option>${
    list.map((p) => h`<option value="${p.id}"${p.id === current ? raw(' selected') : raw('')}>${p.name}</option>`)}`;
}

function orNot(v: string | null | undefined, none: string): Safe {
  return v === null || v === undefined || v === '' ? h`<span class="help">${none}</span>` : h`${v}`;
}

function done(msg: string | undefined): Safe {
  return msg === undefined ? raw('') : savedMessage();
}

/** The request's clock, for "Due in 3 days" and "Today, 12:32". */
function nowIso(): string {
  return navContext.getStore()?.now() ?? new Date().toISOString();
}

/**
 * THE ENQUIRY GATE, DRAWN — for a lead, and for a claim a person opened. Every
 * check shows its reading, who last recorded something, and what the build
 * already holds that bears on it. A recorded "not known" and a check nobody
 * recorded read the same, and neither passes.
 */
export function enquiryBlock(
  e: P.EnquiryReading & { readonly evidence: Readonly<Record<P.CheckKey, readonly string[]>> }, action: string | null,
): Safe {
  // PHASE 133c: each check reads as one short answer. "Not known" is an answer that decides the gate, so every check is
  // always shown — a check nobody has recorded reads "Not known" too, because it does not pass either.
  return h`${e.open
    ? h`<p>${badge('Ready', 'ok')} Every check is a yes.</p>`
    : h`<div>${badge('Not ready yet')} Every check must be a yes.${why('Not known does not pass, and neither does a check nobody has recorded.')}</div>`}
    <table><thead><tr><th>Check</th><th>Answer</th><th>Last recorded</th><th>What we already hold</th></tr></thead>
    <tbody>${e.checks.map((c) => {
      const evidence = e.evidence[c.key];
      return h`<tr><td>${plainNeed(c.label).words}${why(c.label)}</td><td>${c.passes ? h`<strong>Yes</strong>` : h`${c.recorded?.answer_given === 'NO' ? 'No' : 'Not known'}`}${why(c.reading)}</td>
        <td>${c.recorded === null ? h`<span class="help">Never recorded</span>`
          : h`${P.CHECK_ANSWERS[c.recorded.answer_given] ?? c.recorded.answer_given}, by ${c.recorded.by}, ${ukDatesIn(c.recorded.at)}${
            c.recorded.note === null ? raw('') : h`<br><span class="help">${c.recorded.note}</span>`}`}</td>
        <td>${evidence.length === 0 ? h`<span class="help">Nothing yet</span>` : h`<ul>${evidence.map((x) => h`<li>${ukDatesIn(x)}</li>`)}</ul>`}</td></tr>`;
    })}</tbody></table>
    ${action === null ? raw('') : h`<form method="post" action="${action}">
      <label>Check <select name="check_key">${options(P.ENQUIRY_CHECKS, null, null)}</select></label>
      <label>Answer <span class="req">(required)</span> <select name="answer" required><option value="">Choose. Not known is an answer.</option>${
        Object.entries(P.CHECK_ANSWERS).map(([k, l]) => h`<option value="${k}">${l}</option>`)}</select></label>
      <label>Note <input name="note"></label>
      <button type="submit">Record the check</button></form>`}`;
}

/* ------------------------------------------------------------------ *
 * LEADS
 * ------------------------------------------------------------------ */

function leadsPage(
  d: PipelinePageDeps, actor: Actor, rows: readonly L.LeadRow[], orgs: readonly { id: string; name: string }[],
  msg: string | undefined, controls: Safe = raw(''), sortBy: SortBy = (_k, l) => h`${l}`,
): string {
  return page({
    title: 'Leads', nav: d.nav(actor), wide: true,
    body: h`<div class="pagehead"><div><p class="eyebrow">Leads</p><h1>Leads</h1></div><p><a class="btn" href="#record-lead">Record a lead by hand</a></p></div>${done(msg)}
      <div class="help">${rows.length} shown, newest first. A lead becomes a claim when every enquiry check is a yes.${why(h`A lead is not a second intake: a filled assessment, a call asked for and a referral are already
      leads, and this is where they are worked. <strong>There is no lead score</strong> —
      a score built on the estimate would rank the unknowns — and a lead converts only when every enquiry check is a
      recorded yes. Converting opens the claim.`)}</div>
      <div class="listlayout">${controls}<div class="listmain">
      ${rows.length === 0 ? h`<p class="empty">No leads yet. <a href="#record-lead">Record your first lead</a></p>` : h`<div class="tablewrap"><table>
        <thead><tr><th>Organisation</th><th>Source</th><th>What made it a lead</th><th>${sortBy('newest', 'Date')}</th><th>Owner</th>
        <th>Status</th><th>${sortBy('next_action', 'Next action')}</th><th>Claim</th><th>${sortBy('value', 'Range shown')}</th></tr></thead>
        <tbody>${rows.map((r) => h`<tr><td><a href="/staff/leads/${r.id}">${r.organisation}</a>${
          r.organisation_recorded ? raw('') : h`<br><span class="help">New enquiry</span>`}</td>
          <td>${r.source}</td><td>${r.origin}</td><td class="when">${ukDatesIn(r.lead_date)}</td><td>${orNot(r.owner, '—')}</td>
          <td>${r.status.label}</td><td>${orNot(r.next_action, '—')}</td>
          <td>${r.claim === null ? h`<span class="help">—</span>` : h`<a href="/staff/claims/${r.claim.id}">${r.claim.claim_ref}</a>`}</td>
          <td>${r.shown_range === undefined ? h`<span class="help">${r.range_note ?? 'not shown to this role'}</span>` : h`${r.shown_range}`}</td></tr>`)}</tbody></table></div>`}
      </div></div>

      <div class="pblock" id="record-lead"><div class="pnum">Record a lead by hand</div>
        <div class="help">A referral, an event, an outbound call, or another property for an existing client.${why('A lead carries no person: an organisation’s contacts are recorded on the organisation.')}</div>
        <form method="post" action="/staff/leads">
          <label>An organisation already recorded <select name="business_id">${people(orgs, null, 'None. Name it below.')}</select></label>
          <label>Or the organisation's name <input name="prospect_organisation"></label>
          <label>Where it came from <span class="req">(required)</span> <select name="source">${options(vocabulary(d.app.db, 'LEAD_SOURCE'), null, 'Choose')}</select></label>
          <details class="more-options"><summary>More options</summary>
          <label>Its sector <select name="prospect_sector">${options(L.SECTORS, null, 'Not recorded')}</select></label>
          <label>Next action <input name="next_action" maxlength="300"></label>
          <p class="help">It becomes a task on the lead, yours to own.</p>
          <label>Due <input name="next_action_due" type="date"></label></details>
          <button type="submit">Record the lead</button></form></div>`,
  });
}

function leadPage(d: PipelinePageDeps, actor: Actor, v: L.LeadView, msg: string | undefined, tail: Safe = raw('')): string {
  const org = v.organisation.linkable && v.organisation.id !== null
    ? h`<a href="/staff/organisations/${v.organisation.id}">${v.organisation.name}</a>` : h`${v.organisation.name}`;
  const step = leadNextStep({ open: v.enquiry.open, needs: v.enquiry.checks.map((c) => ({ what: c.label, met: c.passes })) },
    v.edit !== undefined && v.may_convert, v.may_write);
  return page({
    title: v.organisation.name, nav: d.nav(actor), wide: true,
    body: h`${done(msg)}
      ${highlights('Lead', v.organisation.name, [
        { label: 'Status', value: v.status.label },
        v.owner === null ? null : { label: 'Owner', value: v.owner.name },
        { label: 'Source', value: v.source.label },
        v.next_action === null ? null : { label: 'Next action', value: `${v.next_action}${v.next_action_due === null ? '' : ` — ${dueWords(v.next_action_due, nowIso())}`}` },
        { label: 'Lead date', value: ukDatesIn(v.lead_date) },
        v.converted === null ? null : { label: 'Converted to', value: h`<a href="/staff/claims/${v.converted.claim_id}">${v.converted.claim_ref}</a>` },
      ])}
      ${recordLayout(recordTabs([
        { id: 'details', label: 'Details', body: h`
      <div class="pblock"><div class="pnum">The lead</div>${fields([
        { label: 'Organisation', value: org, ...(v.organisation.id === null ? { why: 'Not yet an organisation record. The assessment creates one.' } : {}) },
        { label: 'Sector', value: v.sector },
        { label: 'What made it a lead', value: v.origin.label },
        { label: 'Source', value: v.source.label },
        { label: 'Introducer', value: v.introducer === null ? null : v.introducer.introducer.name },
        v.property_basics === undefined ? null : { label: 'What the referral said about the property', value: h`${
          v.property_basics.postcode ?? 'No postcode given'} · ${v.property_basics.event ?? 'no event given'}${
          v.property_basics.year === null ? raw('') : h` · ${String(v.property_basics.year)}`}`, why: 'Replaced by the assessment’s own property when the lead converts.' },
        { label: 'Lead date', value: ukDatesIn(v.lead_date) },
        { label: 'Owner', value: v.owner?.name },
        { label: 'Priority', value: v.priority.label },
        { label: 'Next action', value: v.next_action === null ? null : h`${v.next_action}${v.next_action_due === null ? raw('') : h`<br><span class="help">${dueWords(v.next_action_due, nowIso())}</span>`}`,
          why: 'The lead’s earliest open task.' },
        { label: 'Status', value: h`<strong>${v.status.label}</strong>` },
        v.lost === null ? null : { label: v.status.key === 'LOST' ? 'Lost because' : 'Previously lost because', value: h`${v.lost.reason ?? ''}${v.lost.note === null ? raw('') : h`<br><span class="help">${v.lost.note}</span>`}` },
        v.converted === null ? null : { label: 'Converted', value: h`${ukDatesIn(v.converted.at)} — <a href="/staff/claims/${v.converted.claim_id}">${v.converted.claim_ref}</a>` },
        { label: 'How they asked to be reached', value: v.contact_channel },
        v.person === undefined ? null : { label: 'Who asked', value: h`${v.person.name}${v.person.role === null ? raw('') : h`<br><span class="help">${v.person.role}</span>`}${v.person.reach === null ? raw('') : h`<br>${v.person.reach}`}`,
          why: 'Held on the lead until it has an organisation.' },
      ], v.edit !== undefined && v.may_write ? { href: '#change-lead' } : undefined)}</div>

      <div class="pblock" id="enquiry-gate"><div class="pnum">The enquiry gate</div>
        ${enquiryBlock(v.enquiry, v.may_write ? `/staff/leads/${v.id}/checks` : null)}</div>

      ${v.edit === undefined || !v.may_write ? raw('') : h`<div class="pblock" id="change-lead"><div class="pnum">Change the lead</div>
        <form method="post" action="/staff/leads/${v.id}">
          <label>Owner <select name="owner_id">${people(v.edit.owners, v.owner?.id ?? null, 'nobody yet')}</select></label>
          <label>Priority <select name="priority">${options(vocabulary(d.app.db, 'PRIORITY', v.priority.key), v.priority.key, 'not set')}</select></label>
          <div class="help">To set the next action, add a task on this lead.${why('The next action is the lead’s earliest open task.')}</div>
          <label>Source <select name="source">${options(vocabulary(d.app.db, 'LEAD_SOURCE', v.source.key), v.source.key, null)}</select></label>
          ${v.edit.introducers.length === 0 && v.introducer === null ? raw('') : h`<label>Introduced by
            <select name="introducer_id">${people(v.edit.introducers, v.introducer?.introducer.id ?? null, 'no firm')}</select></label>`}
          <label>Status <select name="status">${options(
            Object.fromEntries(Object.entries(L.LEAD_STATUSES).filter(([k]) => k !== 'CONVERTED')), v.status.key, null)}</select></label>
          <label>If lost, why <select name="lost_reason"><option value="">Not lost</option>${
            v.edit.lost_reasons.map((r) => h`<option value="${r.code}">${r.label}</option>`)}</select></label>
          <label>Note on the loss <input name="lost_note"></label>
          ${v.organisation.id !== null ? raw('') : h`
            <label>Organisation's name <input name="prospect_organisation" value="${v.organisation.name}"></label>`}
          <button type="submit">Save</button></form></div>`}

      ${v.edit === undefined || !v.may_convert ? raw('') : h`<div class="pblock" id="convert"><div class="pnum">Convert — this opens the claim</div>
        <div class="help">The checks are asked again when you press the button.${why('The claim opens at the assessment stage, on the organisation’s first property unless you name another, carrying the lead’s assessment.')}</div>
        <form method="post" action="/staff/leads/${v.id}/convert">
          ${v.organisation.id !== null ? raw('') : h`<label>Link to the organisation the assessment created
            <select name="business_id">${people(v.edit.organisations, null, 'choose')}</select></label>`}
          ${v.edit.properties.length === 0 ? raw('') : h`<label>Property
            <select name="property_id">${people(v.edit.properties.map((p) => ({ id: p.id, name: p.label })), null, 'the first property')}</select></label>`}
          <button type="submit">Convert and open the claim</button></form></div>`}

` },
        { id: 'related', label: 'Related', body: h`
      ${referralBlock(v.id, v.introducer)}

      <div class="pblock"><div class="pnum">What the assessment captured</div>
        <p class="help">Read, never re-keyed. A spend is shown as the client gave it, with the question.</p>
        ${v.initial_property_value.length === 0 ? h`<p class="help">No spend answer is held for this lead.</p>`
          : h`<table><tbody>${v.initial_property_value.map((a) => h`<tr><th>${a.question}</th><td>${a.answer}</td></tr>`)}</tbody></table>`}
        ${v.opportunity_value === undefined ? raw('') : h`<p>The range the client was shown: <strong>${v.opportunity_value.shown_range}</strong></p>`}
      </div>

` },
        { id: 'activity', label: 'Activity', body: h`
      ${tail}` },
      ]), sidePanel(null, [
        ...(v.may_write ? [{ href: '#enquiry-gate', label: 'Record an enquiry check' }] : []),
        ...(tail.html.includes('action="/staff/tasks"') ? [{ href: '#add-task', label: 'Log a call or add a follow-up' }] : []),
        ...(v.edit !== undefined && v.may_convert ? [{ href: '#convert', label: 'Convert — open the claim' }] : []),
      ], raw(''), step === null ? raw('') : nextStepCard(step)))}

      ${dataLink(actor, `/staff/leads/${v.id}/view.json`)}`,
  });
}

/* ------------------------------------------------------------------ *
 * THE BOARD
 * ------------------------------------------------------------------ */

/**
 * PHASE 133a: THE BOARD AS COLUMNS OF CARDS. The markup is an ordered list of stages, each holding a list of cards, so
 * without the stylesheet — or on a phone — it reads as a plain list, stage by stage. Nothing about a move changed: the
 * button posts the same form, and the server asks the gate again.
 */
function card(c: C.BoardCard): Safe {
  return h`<li class="cardlet"><p class="ref"><a href="/staff/claims/${c.id}">${c.claim_ref}</a></p><p>${c.client}</p>
    <p class="help">${c.property ?? 'no property recorded'}<br>owner: ${c.owner ?? 'nobody yet'} ·
    ${c.age_days} day${c.age_days === 1 ? '' : 's'} since its last move</p>
    ${c.next_action === null ? raw('') : h`<p>Next action: ${c.next_action}</p>`}${c.value === undefined ? raw('') : h`<p class="help">Range shown ${c.value}</p>`}
    ${c.hold === undefined ? raw('') : h`<p class="help">On hold: ${c.hold.reason ?? 'no reason recorded'} — returns to ${c.hold.returns_to}</p>`}
    ${c.next === undefined ? raw('') : h`<form method="post" action="/staff/claims/${c.id}/stage">
      <input type="hidden" name="kind" value="FORWARD"><input type="hidden" name="to" value="${c.next.key}">
      <input type="hidden" name="back" value="board"><button type="submit" class="btn-quiet">Move to ${c.next.label}</button></form>`}</li>`;
}

function cards(list: readonly C.BoardCard[]): Safe {
  return list.length === 0 ? h`<p class="none">None.</p>` : h`<ul class="cardlist">${list.map(card)}</ul>`;
}

function column(id: string, label: string, list: readonly C.BoardCard[], about: Safe = raw('')): Safe {
  return h`<li id="${id}" class="${list.length === 0 ? 'empty-col' : ''}"><h2 class="colhead"><span>${label}</span>${badge(String(list.length))}</h2>
    ${about}${cards(list)}</li>`;
}

function boardPage(d: PipelinePageDeps, actor: Actor, b: C.Board, msg: string | undefined): string {
  const exited = b.exited.filter((e) => e.cards.length > 0);
  const open = b.columns.reduce((n, c) => n + c.cards.length, 0);
  return page({
    title: 'Pipeline', nav: d.nav(actor), wide: true,
    body: h`<div class="pagehead"><div><p class="eyebrow">Claims</p><h1>Pipeline</h1></div><p class="help">${open} in the procedure · ${b.on_hold.length} on hold</p></div>${done(msg)}
      <div class="help">A claim moves one stage at a time, and each move is checked when you press it.${why(h`The operating procedure's ten stages, enquiry to defence pack.
      <strong>Every move asks that stage's gate on the server</strong> — the button is a courtesy, not a key. The fee
      trigger is read at its most cautious, ${b.fee_trigger}, while it is undecided.`)}</div>
      <ol class="board" aria-label="The pipeline, one column per stage">${b.columns.map((col) => column(`stage-${col.key}`, col.label, col.cards,
        col.owner === '' && col.gate === '' ? raw('') : h`<details><summary>Owner and gate</summary>
          ${col.owner === '' ? raw('') : h`<p class="help">Owner: ${brandName(col.owner)}</p>`}
          ${col.gate === '' ? raw('') : h`<p class="help">The gate: ${brandName(col.gate)}</p>`}</details>`))}</ol>
      <ol class="board" aria-label="Claims on hold and claims that have left the procedure">
        ${column('on-hold', 'On hold', b.on_hold)}
        ${exited.length === 0 ? h`<li class="empty-col"><h2 class="colhead"><span>Exits — the record is kept</span></h2><p class="none">No claim has exited.</p></li>`
          : exited.map((e) => column(`exit-${e.key}`, `Exit: ${e.label}`, e.cards))}
        ${b.unrecognised.length === 0 ? raw('') : column('unrecognised', 'Stage not recognised', b.unrecognised,
          h`<p class="help">Nobody has placed these claims in the procedure. An admin may reopen one at the enquiry.</p>`)}
      </ol>
      ${dataLink(actor, '/staff/pipeline/view.json')}`,
  });
}
