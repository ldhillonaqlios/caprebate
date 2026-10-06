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
import { badge, brandName, claimRef, dataLink, fields, highlights, nextStepCard, recordLayout, savedMessage, section, sidePanel, why, type Need, type SectionContext, type SectionSpec } from './components.ts';
import { sectionPrefs } from './sections.ts';
import { leadNextStep, plainNeed } from './next-step.ts';
import { dueReading, dueWords, ukDatesIn } from './localtime.ts';
import { navContext, filterBar, LEAD_FILTERS } from './navigation.ts';
import { STAGE_GROUPS, groupBand, groupBar, kpiRow, lateBadge, noDateBadge, nobodyBadge, siteOf, stageBadge, stageGroupOf, stageLabel, type GroupKey } from './look.ts';
export { siteOf } from './look.ts';
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
import * as E from './enquiries.ts';
import { leadSectionCounts, leadSections, type CardDeps } from './lead-cards.ts';

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

  /* ------------------------------------------- website enquiries (PHASE 133j) */
  if (path === '/staff/enquiries' && method === 'GET') {
    html(res, 200, enquiriesPage(d, actor, E.openEnquiries(deps, actor), done));
    return 'handled';
  }
  const enquiryAct = /^\/staff\/enquiries\/([A-Za-z0-9-]+)\/(lead|close)$/.exec(path);
  if (enquiryAct && method === 'POST') {
    const fromCards = (await form(req)).get('back') === 'leads';
    const id = enquiryAct[1] ?? '';
    if (enquiryAct[2] === 'lead') {
      const r = E.enquiryToLead(deps, actor, id);
      if (!r.ok) return d.problem(res, actor, 'Not opened as a lead', r.why, '/staff/enquiries');
      redirect(res, `/staff/leads/${r.lead_id}?done=created`);
      return 'handled';
    }
    const r = E.closeEnquiry(deps, actor, id);
    if (!r.ok) return d.problem(res, actor, 'Not closed', r.why, '/staff/enquiries');
    // PHASE 137: closed from its card in the leads' New section, it returns there.
    redirect(res, fromCards ? '/staff/leads?done=closed#leads-new' : '/staff/enquiries?done=closed');
    return 'handled';
  }

  /* ------------------------------------------------------------ leads */
  if (path === '/staff/leads' && method === 'GET') {
    // CRM 9 of 10: filtered, sorted and saved through src/web/lists.ts, each row still asked of `lead.read`.
    // PHASE 137: cards in four sections by default; `layout=list` is the table, for anyone who prefers it. Neither
    // `layout` nor `done` is a filter, so neither is handed to the list to be reported as one it did not apply.
    const asList = url.searchParams.get('layout') === 'list';
    const q = new URLSearchParams(url.searchParams);
    q.delete('layout');
    q.delete('done');
    // UI TIDY PHASE 5: `record=1` opens the folded "Record a lead by hand" form; like `layout`, it is not a filter.
    const openForm = q.get('record') === '1';
    q.delete('record');
    const asked = requestParams(d.app, actor, 'LEADS', q);
    const v = LI.leadsList(db, actor, asked.params, asked.ignored);
    const keep: Record<string, string> = asList ? { layout: 'list' } : {};
    const controls = listControls('LEADS', v, LI.viewsFor(db, actor, 'LEADS'), mayShareViews(actor), asked.view,
      asList ? { keep } : { noSort: true });
    const filtered = v.applied.length > 0 || asked.view !== null;
    html(res, 200, asList
      ? leadsPage(d, actor, v.rows, organisationsFor(db, actor), done, controls, sortHeading('LEADS', v, keep), filtered, openForm)
      : leadCardsPage(d, actor, v.rows, organisationsFor(db, actor), done, controls, filtered, openForm));
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

  // PHASE 137: "Log a call" from a lead's card.
  const leadCall = /^\/staff\/leads\/([A-Za-z0-9-]+)\/call$/.exec(path);
  if (leadCall && method === 'POST') {
    const id = leadCall[1] ?? '';
    const r = L.logLeadCall(deps, actor, id, posted(await form(req), ['spoke', 'note']));
    if (!r.ok) return d.problem(res, actor, 'Call not saved', r.why, '/staff/leads', r.field);
    redirect(res, `/staff/leads?done=called#lead-${id}`);
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
    const f = await form(req);
    // PHASE 137: "take it" and "Mark as lost" post from a card and return to the cards; `back` is one fixed word, never a path.
    const fromCards = f.get('back') === 'leads';
    const r = L.updateLead(deps, actor, id, posted(f, LEAD_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, fromCards ? '/staff/leads' : `/staff/leads/${id}`);
    redirect(res, fromCards ? `/staff/leads?done=saved#lead-${id}` : `/staff/leads/${id}?done=saved`);
    return 'handled';
  }

  /* ----------------------------------------------------------- the board */
  if (path === '/staff/pipeline/view.json' && method === 'GET') {
    json(res, 200, C.pipelineBoard(db, actor, d.app.now()));
    return 'handled';
  }
  if (path === '/staff/pipeline' && method === 'GET') {
    // UI TIDY PHASE 3: one table, grouped by stage, by default; `layout=board` is the board of columns, as it was.
    const b = C.pipelineBoard(db, actor, d.app.now());
    html(res, 200, url.searchParams.get('layout') === 'board' ? boardPage(d, actor, b, done)
      : pipelineTable(d, actor, b, done, d.app.now(), { q: url.searchParams.get('q') ?? '', show: url.searchParams.get('show') ?? '' }));
    return 'handled';
  }

  /* ------------------------------------- a claim's moves, confirmations, checks */
  const move = /^\/staff\/claims\/([A-Za-z0-9-]+)\/stage$/.exec(path);
  if (move && method === 'POST') {
    const id = move[1] ?? '';
    const f = await form(req);
    // UI tidy phase 3: `back` is one fixed word, never a path — the table (`board`) or the board of columns (`columns`).
    const back = f.get('back') === 'board' ? '/staff/pipeline' : f.get('back') === 'columns' ? '/staff/pipeline?layout=board' : `/staff/claims/${id}`;
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
    redirect(res, `${back}${back.includes('?') ? '&' : '?'}done=moved`);
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

/**
 * THE WEBSITE'S ENQUIRY FORM, WAITING FOR SALES — PHASE 133j. Each enquiry is opened as a lead (with a contact
 * holding the person) or closed. Nothing here decides anything: src/web/enquiries.ts authorises and writes.
 */
function enquiriesPage(d: PipelinePageDeps, actor: Actor, rows: readonly E.EnquiryRow[], msg: string | undefined): string {
  return page({
    title: 'Website enquiries', nav: d.nav(actor), wide: true,
    body: h`<div class="pagehead"><div><p class="eyebrow">Leads</p><h1>Website enquiries</h1></div><p><a href="/staff/leads">All leads</a></p></div>${done(msg)}
      <div class="help">${rows.length} waiting, newest first. These came from the website's "Request my estimate" form. Each person
      agreed to be contacted about their enquiry; that is not marketing consent.</div>
      ${rows.length === 0 ? h`<p class="empty">No website enquiries are waiting.</p>` : h`<div class="tablewrap"><table>
        <thead><tr><th>Received</th><th>Name</th><th>Practice or company</th><th>How to reach them</th><th>Property</th><th>What they wrote</th><th>Action</th></tr></thead>
        <tbody>${rows.map((r) => h`<tr><td class="when">${ukDatesIn(r.created_at)}</td><td>${r.full_name}</td><td>${orNot(r.firm, '—')}</td>
          <td>${r.email}${r.phone === null ? raw('') : h`<br>${r.phone}`}</td><td>${r.property_type}</td><td>${orNot(r.message, '—')}</td>
          <td><form method="post" action="/staff/enquiries/${r.id}/lead"><button type="submit">Open as a lead</button></form>
            <form method="post" action="/staff/enquiries/${r.id}/close"><button class="linkish" type="submit">Close, nothing more needed</button></form></td></tr>`)}</tbody></table></div>`}`,
  });
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

/**
 * PHASE 137: the top of both leads layouts — the heading, the two lists, the saved message and the Cards / List view switch.
 * UI TIDY PHASE 5, 2 October 2026: one heading with one line of counts and one main button, Record a lead; then the
 * sections' counts as solid boxes (cards only, each a link to its section); then every switch on one row — the two lists,
 * the two layouts, Website enquiries with its count, and Filter. The record form is folded until it is asked for.
 */
export const RECORD_LEAD_HREF = '/staff/leads?record=1#record-lead';

function leadsHead(d: PipelinePageDeps, actor: Actor, msg: string | undefined, asList: boolean, controls: Safe, filtered: boolean,
  counts: Readonly<Record<'new' | 'going' | 'later' | 'closed', number>> | null): Safe {
  const deps = { db: d.app.db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const mayWrite = can(actor, 'lead.write', { type: 'lead', id: '__lead_section__', business_id: null });
  const lede = counts === null ? raw('')
    : h`<p class="lede">${counts.new} new · ${counts.going} in progress · ${counts.later} for later · ${counts.closed} closed</p>`;
  return h`<div class="pagehead"><div><h1>Leads</h1>${lede}</div>${mayWrite ? h`<p><a class="btn btn-primary" href="${RECORD_LEAD_HREF}">Record a lead</a></p>` : raw('')}</div>${done(msg)}
      ${counts === null ? raw('') : kpiRow([
        { label: 'New — not called yet', value: String(counts.new), tone: counts.new > 0 ? 'win' : 'plain', href: '#leads-new' },
        { label: 'In progress', value: String(counts.going), tone: 'total', href: '#leads-going' },
        { label: 'Saved for later', value: String(counts.later), tone: 'plain', href: '#leads-later' },
        { label: 'Closed', value: String(counts.closed), tone: 'plain', href: '#leads-closed' },
      ])}
      <div class="leadtools">${filterBar(actor, LEAD_FILTERS, '/staff/leads')}<nav class="viewbar" aria-label="Layout">${asList
        ? h`<a href="/staff/leads">Cards</a><a href="/staff/leads?layout=list" aria-current="page">List view</a>`
        : h`<a href="/staff/leads" aria-current="page">Cards</a><a href="/staff/leads?layout=list">List view</a>`}</nav>${
        can(actor, 'lead.write', { type: 'lead', id: '__website_enquiries__', business_id: null })
          ? h`<p class="toolnote"><a href="/staff/enquiries">Website enquiries</a>: ${E.openEnquiryCount(deps, actor)} waiting${asList ? '' : ', at the top of New'}</p>`
          : raw('')}
      <details class="filterbox"${filtered ? raw(' open') : raw('')}><summary>Filter${filtered ? ' — on' : ''}</summary>${controls}</details></div>`;
}

function recordLeadForm(d: PipelinePageDeps, orgs: readonly { id: string; name: string }[], open: boolean): Safe {
  return h`<details class="pblock recordlead" id="record-lead"${open ? raw(' open') : raw('')}><summary class="pnum">Record a lead by hand</summary>
        <div class="help">A referral, an event, an outbound call, or another property for an existing client.${why('A lead names no person. Add the people as contacts on the organisation.')}</div>
        <form method="post" action="/staff/leads">
          <label>An organisation already recorded <select name="business_id">${people(orgs, null, 'None. Name it below.')}</select></label>
          <label>Or the organisation's name <input name="prospect_organisation"></label>
          <label>Where it came from <span class="req">(required)</span> <select name="source">${options(vocabulary(d.app.db, 'LEAD_SOURCE'), null, 'Choose')}</select></label>
          <details class="more-options"><summary>More options</summary>
          <label>Its sector <select name="prospect_sector">${options(L.SECTORS, null, 'Not recorded')}</select></label>
          <label>Next action <input name="next_action" maxlength="300"></label>
          <p class="help">It becomes a task on the lead, yours to own.</p>
          <label>Due <input name="next_action_due" type="date"></label></details>
          <button type="submit">Record the lead</button></form></details>`;
}

/**
 * PHASE 137 — THE LEADS AS CARDS, IN FOUR SECTIONS (src/web/lead-cards.ts draws them). New is first and never folded;
 * Closed is folded. Each card opens in place. The filters are behind one button, and the table is "List view".
 */
function leadCardsPage(
  d: PipelinePageDeps, actor: Actor, rows: readonly LI.LeadListRow[], orgs: readonly { id: string; name: string }[],
  msg: string | undefined, controls: Safe, filtered: boolean, openForm = false,
): string {
  const db = d.app.db;
  const deps: C.CrmDeps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const mayHandleEnquiries = can(actor, 'lead.write', { type: 'lead', id: '__website_enquiries__', business_id: null });
  const cardDeps: CardDeps = {
    actor, nowIso: nowIso(), mayAddTask: T.mayCreateTask(actor), mayHandleEnquiries,
    view: (id) => { try { return L.leadView(db, actor, id); } catch { return undefined; } },
  };
  // A filter is a question about leads, so the enquiries — not leads yet — are drawn only on the unfiltered page.
  const enquiries = mayHandleEnquiries && !filtered ? E.openEnquiries(deps, actor) : [];
  return page({
    title: 'Leads', nav: d.nav(actor), wide: true,
    body: h`${leadsHead(d, actor, msg, false, controls, filtered, leadSectionCounts(rows, enquiries, cardDeps))}
      <div class="leadsecs">${leadSections(rows, enquiries, cardDeps)}</div>
      ${recordLeadForm(d, orgs, openForm)}`,
  });
}

function leadsPage(
  d: PipelinePageDeps, actor: Actor, rows: readonly L.LeadRow[], orgs: readonly { id: string; name: string }[],
  msg: string | undefined, controls: Safe = raw(''), sortBy: SortBy = (_k, l) => h`${l}`, filtered = false, openForm = false,
): string {
  return page({
    title: 'Leads', nav: d.nav(actor), wide: true,
    body: h`${leadsHead(d, actor, msg, true, controls, filtered, null)}
      <div class="help">${rows.length} shown. A lead becomes a client when every answer before it is a yes.${why(h`A lead is not a second intake: a filled assessment, a call asked for and a referral are already
      leads, and this is where they are worked. <strong>There is no lead score</strong> —
      a score built on the estimate would rank the unknowns. Converting opens the claim.`)}</div>
      ${rows.length === 0 ? h`<p class="empty">No leads yet. <a href="${RECORD_LEAD_HREF}">Record your first lead</a></p>` : h`<div class="tablewrap"><table class="stack">
        <thead><tr><th>Company</th><th>Source</th><th>What made it a lead</th><th>${sortBy('newest', 'Date')}</th><th>Owner</th>
        <th>Status</th><th>${sortBy('next_action', 'Next action')}</th><th>Claim</th><th>${sortBy('value', 'Range shown')}</th></tr></thead>
        <tbody>${rows.map((r) => h`<tr><td><a href="/staff/leads/${r.id}">${r.organisation}</a>${
          r.organisation_recorded ? raw('') : h`<br><span class="help">No company record yet</span>`}</td>
          <td data-label="Source">${r.source}</td><td data-label="What made it a lead">${r.origin}</td><td class="when" data-label="Date">${ukDatesIn(r.lead_date)}</td><td data-label="Owner">${orNot(r.owner, '—')}</td>
          <td data-label="Status">${r.status.label}</td><td data-label="Next action">${orNot(r.next_action, '—')}</td>
          <td data-label="Claim">${r.claim === null ? h`<span class="help">—</span>` : h`<a href="/staff/claims/${r.claim.id}">Open the claim</a> ${claimRef(r.claim.claim_ref)}`}</td>
          <td data-label="Range shown">${r.shown_range === undefined ? h`<span class="help">${r.range_note ?? 'not shown to this role'}</span>` : h`${r.shown_range}`}</td></tr>`)}</tbody></table></div>`}

      ${recordLeadForm(d, orgs, openForm)}`,
  });
}

function leadPage(d: PipelinePageDeps, actor: Actor, v: L.LeadView, msg: string | undefined, tail: Safe = raw('')): string {
  const org = v.organisation.linkable && v.organisation.id !== null
    ? h`<a href="/staff/clients/${v.organisation.id}">${v.organisation.name}</a>` : h`${v.organisation.name}`;
  const step = leadNextStep({ open: v.enquiry.open, needs: v.enquiry.checks.map((c) => ({ what: c.label, met: c.passes })) },
    v.edit !== undefined && v.may_convert, v.may_write);
  /* PHASE 139 (carried from 138): A LEAD'S PAGE AS SECTIONS. WE NEED is the enquiry checks not yet passed; the old tab ids
     stay the anchors. */
  const ctx: SectionContext = { prefs: sectionPrefs(d.app.db, actor), back: `/staff/leads/${v.id}` };
  const leadNeed: Need[] = v.enquiry.checks.filter((c) => !c.passes).map((c) => ({ label: c.label }));
  const converted = v.converted !== null;
  return page({
    title: v.organisation.name, nav: d.nav(actor), wide: true,
    body: h`${done(msg)}
      ${highlights('Lead', v.organisation.name, [
        { label: 'Status', value: v.status.label },
        v.owner === null ? null : { label: 'Owner', value: v.owner.name },
        { label: 'Source', value: v.source.label },
        v.next_action === null ? null : { label: 'Next action', value: `${v.next_action}${v.next_action_due === null ? '' : ` — ${dueWords(v.next_action_due, nowIso())}`}` },
        { label: 'Lead date', value: ukDatesIn(v.lead_date) },
        v.converted === null ? null : { label: 'Converted to', value: h`<a href="/staff/claims/${v.converted.claim_id}">Open the claim</a> ${claimRef(v.converted.claim_ref)}` },
      ])}
      ${recordLayout(h`${([
        { key: 'lead.details', id: 'details', kind: 'company', heading: 'The lead',
          status: converted ? 'DONE' : 'WORKING',
          working: converted ? 'Nothing — this lead is now a claim.' : leadNeed.length === 0
            // PHASE 157c (the Friary House run, F7): the Convert button shows only once the lead is Qualified; say so.
            ? (v.status.key === 'QUALIFIED' ? 'Every check is a yes. Convert it to open the claim.' : 'Every check is a yes. Set the status to Qualified (Change the lead, below), then convert it to open the claim.')
            : 'Checking whether this is a claim we can take on.',
          need: converted ? [] : leadNeed, from: ['the client', v.source.label], body: h`
      <div class="pblock">${fields([
        { label: 'Organisation', value: org, ...(v.organisation.id === null ? { why: 'Not yet an organisation record. The assessment creates one.' } : {}) },
        { label: 'Sector', value: v.sector },
        { label: 'What made it a lead', value: v.origin.label },
        { label: 'Source', value: v.source.label },
        { label: 'Introducer', value: v.introducer === null ? null : v.introducer.introducer.name },
        v.same_enquiry.length === 0 ? null : { label: 'Same enquiry as', value: h`${v.same_enquiry.map((o, i) => h`${i === 0 ? '' : ', '}<a href="/staff/leads/${o.lead_id}">${o.name}</a>`)}`,
          why: 'One assessment, with buildings owned by different businesses. Each business is its own lead, engagement and claim.' },
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
        v.converted === null ? null : { label: 'Converted', value: h`${ukDatesIn(v.converted.at)} — <a href="/staff/claims/${v.converted.claim_id}">Open the claim</a> ${claimRef(v.converted.claim_ref)}` },
        { label: 'How they asked to be reached', value: v.contact_channel },
        v.person === undefined ? null : { label: 'Who asked', value: h`${v.person.name}${v.person.role === null ? raw('') : h`<br><span class="help">${v.person.role}</span>`}${v.person.reach === null ? raw('') : h`<br>${v.person.reach}`}`,
          why: 'Held on the lead until it has an organisation.' },
      ], v.edit !== undefined && v.may_write ? { href: '#change-lead' } : undefined)}</div>

      <div class="pblock" id="enquiry-gate"><div class="pnum">Can we take this on? The checks</div>
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
        <div class="help">The checks are asked again when you press the button.${why('The claim opens at the assessment step, with the lead’s assessment. It uses the organisation’s first property, unless you pick another.')}</div>
        <form method="post" action="/staff/leads/${v.id}/convert">
          ${v.organisation.id !== null ? raw('') : h`<label>Link to the organisation the assessment created
            <select name="business_id">${people(v.edit.organisations, null, 'choose')}</select></label>`}
          ${v.edit.properties.length === 0 ? raw('') : h`<label>Property
            <select name="property_id">${people(v.edit.properties.map((p) => ({ id: p.id, name: p.label })), null, 'the first property')}</select></label>`}
          <button type="submit">Convert and open the claim</button></form></div>`}

` },
        { key: 'lead.related', id: 'related', kind: 'facts', heading: 'Where it came from',
          status: 'DONE', working: 'Nothing right now.', need: [], from: ['the assessment', 'the firm that referred them'], body: h`
      ${referralBlock(v.id, v.introducer)}

      <div class="pblock"><div class="pnum">What the assessment captured</div>
        <p class="help">Read, never re-keyed. A spend is shown as the client gave it, with the question.</p>
        ${v.initial_property_value.length === 0 ? h`<p class="help">No spend answer is held for this lead.</p>`
          : h`<table><tbody>${v.initial_property_value.map((a) => h`<tr><th>${a.question}</th><td>${a.answer}</td></tr>`)}</tbody></table>`}
        ${v.opportunity_value === undefined ? raw('') : h`<p>The range the client was shown: <strong>${v.opportunity_value.shown_range}</strong></p>`}
      </div>

` },
        { key: 'lead.activity', id: 'activity', kind: 'messages', heading: 'Messages and activity',
          status: tail.html.trim() === '' ? 'NOT_STARTED' : 'WORKING', working: 'Keeping a record of every call, email and follow-up.',
          need: [], from: ['you and your team', 'the client'], body: h`
      ${tail}` },
      ] satisfies SectionSpec[]).map((sp) => section(sp, ctx))}`, sidePanel(null, [
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
  // PHASE 134: a card leads with the company; the property under it; the reference a small grey label.
  return h`<li class="cardlet"><p class="ref"><a href="/staff/claims/${c.id}">${c.client}</a></p>
    <p class="help">${c.property ?? 'no property recorded'} ${claimRef(c.claim_ref)}<br>owner: ${c.owner ?? 'nobody yet'} ·
    ${c.age_days} day${c.age_days === 1 ? '' : 's'} since its last move</p>
    ${c.next_action === null ? raw('') : h`<p>Next action: ${c.next_action}</p>`}${c.value === undefined ? raw('') : h`<p class="help">Range shown ${c.value}</p>`}
    ${c.hold === undefined ? raw('') : h`<p class="help">On hold: ${c.hold.reason ?? 'no reason recorded'} — returns to ${c.hold.returns_to}</p>`}
    ${c.next === undefined ? raw('') : h`<form method="post" action="/staff/claims/${c.id}/stage">
      <input type="hidden" name="kind" value="FORWARD"><input type="hidden" name="to" value="${c.next.key}">
      <input type="hidden" name="back" value="columns"><button type="submit" class="btn-quiet">Move to ${c.next.label}</button></form>`}</li>`;
}

function cards(list: readonly C.BoardCard[]): Safe {
  return list.length === 0 ? h`<p class="none">None.</p>` : h`<ul class="cardlist">${list.map(card)}</ul>`;
}

function column(id: string, label: string, list: readonly C.BoardCard[], about: Safe = raw('')): Safe {
  return h`<li id="${id}" class="${list.length === 0 ? 'empty-col' : ''}"><h2 class="colhead"><span>${label}</span>${badge(String(list.length))}</h2>
    ${about}${cards(list)}</li>`;
}

/* ------------------------------------------------------------------ *
 * THE PIPELINE AS ONE TABLE — UI TIDY PHASE 3, 2 October 2026
 * ------------------------------------------------------------------ */

/**
 * Lakhbir chose "design 2" (00-START-HERE/hub/UI-TIDY-PLAN.md): the pipeline as one table, grouped by stage, with colours
 * and darker boxes "to make this easier to read". At laptop width the board of columns ran off the right edge. Every
 * claim the board showed is a row here, in the same groups of stages (src/web/look.ts), the latest next step first; the
 * row keeps the card's Move button, under its next step, and the board itself is one click away (`layout=board`). Search and the four
 * filters are links, so nothing needs a script.
 */
type PipelineFilter = { readonly q: string; readonly show: string };

const PIPELINE_SHOWS: readonly (readonly [string, string])[] = [['', 'All'], ['late', 'Late'], ['mine', 'Mine'], ['nobody', 'Nobody owns it']];

/** Whole days a next step is late, or null when it is not late (or has no date). */
function daysLate(due: string | null, nowIso: string): number | null {
  const r = dueReading(due, nowIso);
  if (!r.overdue) return null;
  const n = Number(/^(\d+)/.exec(r.words)?.[1] ?? 'NaN');
  return Number.isFinite(n) ? n : null;
}

function dueCell(c: C.BoardCard, nowIso: string): Safe {
  if (c.next_action === null) return raw('');
  const late = daysLate(c.next_action_due, nowIso);
  if (late !== null) return lateBadge(`${late} ${late === 1 ? 'day' : 'days'} late`);
  if (c.next_action_due === null) return noDateBadge('No date');
  const r = dueReading(c.next_action_due, nowIso);
  return h`<span class="when">${r.words === '' ? r.date : r.words}</span>`;
}

function pipelineRow(c: C.BoardCard, nowIso: string, withValue: boolean): Safe {
  return h`<tr><td data-label="Business and site"><a class="rowlink" href="/staff/claims/${c.id}">${c.client}</a><br><span class="help">${
      siteOf(c.client, c.property)} · ${c.claim_ref}</span></td>
    <td data-label="Stage">${c.stage_key === null ? h`<span class="badge">${c.stage_label}</span>` : stageBadge(c.stage_key, c.stage_label)}</td>
    <td data-label="Next step">${c.next_action ?? h`<span class="help">No next step yet</span>`}${c.hold === undefined ? raw('')
      : h`<br><span class="help">On hold: ${c.hold.reason ?? 'no reason recorded'} — returns to ${c.hold.returns_to}</span>`}${
      c.next === undefined ? raw('') : h`<form method="post" action="/staff/claims/${c.id}/stage" class="moveform">
      <input type="hidden" name="kind" value="FORWARD"><input type="hidden" name="to" value="${c.next.key}">
      <input type="hidden" name="back" value="board"><button type="submit" class="btn-quiet">Move to ${c.next.label}</button></form>`}</td>
    <td data-label="Due">${dueCell(c, nowIso)}</td>
    <td data-label="Owner">${c.owner ?? nobodyBadge('Nobody yet')}</td>
    ${withValue ? h`<td data-label="Range shown">${c.value ?? ''}</td>` : raw('')}</tr>`;
}

/** The latest next step first; then a step with a date before one without; then by reference. */
function byUrgency(nowIso: string): (a: C.BoardCard, b: C.BoardCard) => number {
  const key = (c: C.BoardCard): number => daysLate(c.next_action_due, nowIso) ?? (c.next_action_due === null ? -1e9 : -Date.parse(c.next_action_due) / 864e5 - 1e6);
  return (a, b) => key(b) - key(a) || a.claim_ref.localeCompare(b.claim_ref);
}

function pipelineTable(d: PipelinePageDeps, actor: Actor, b: C.Board, msg: string | undefined, nowIso: string, f: PipelineFilter): string {
  const inProgress = b.columns.flatMap((col) => col.cards);
  const all = [...inProgress, ...b.on_hold, ...b.exited.flatMap((e) => e.cards), ...b.unrecognised];
  const q = f.q.trim().toLowerCase();
  const show = PIPELINE_SHOWS.some(([k]) => k === f.show) ? f.show : '';
  const keep = (c: C.BoardCard): boolean =>
    (q === '' || c.client.toLowerCase().includes(q) || c.claim_ref.toLowerCase().includes(q) || (c.property ?? '').toLowerCase().includes(q))
    && (show === '' || (show === 'late' && daysLate(c.next_action_due, nowIso) !== null) || (show === 'mine' && c.owner_id === actor.id)
      || (show === 'nobody' && c.owner_id === null));
  const late = inProgress.filter((c) => daysLate(c.next_action_due, nowIso) !== null).length;
  const nobody = inProgress.filter((c) => c.owner_id === null).length;
  const withValue = all.some((c) => c.value !== undefined);
  const cols = withValue ? 6 : 5;
  const counts: Partial<Record<GroupKey, number>> = {};
  for (const c of inProgress) { const g = stageGroupOf(c.stage_key); if (g !== null) counts[g.key] = (counts[g.key] ?? 0) + 1; }
  const { bar, empty } = groupBar(counts);
  const sort = byUrgency(nowIso);
  const groups: { band: Safe; rows: C.BoardCard[] }[] = [
    ...STAGE_GROUPS.map((g) => {
      const rows = inProgress.filter((c) => stageGroupOf(c.stage_key)?.key === g.key && keep(c)).sort(sort);
      return { band: groupBand(g, `${g.name} · ${g.stages.map((k) => stageLabel(k)).join(', ')} · ${rows.length} ${rows.length === 1 ? 'claim' : 'claims'}`), rows };
    }),
    { band: groupBand(null, `On hold · ${b.on_hold.filter(keep).length}`), rows: b.on_hold.filter(keep).sort(sort) },
    { band: groupBand(null, `Stopped — the record is kept · ${b.exited.flatMap((e) => e.cards).filter(keep).length}`), rows: b.exited.flatMap((e) => e.cards).filter(keep) },
    { band: groupBand(null, `No step set · ${b.unrecognised.filter(keep).length}`), rows: b.unrecognised.filter(keep) },
  ].filter((g) => g.rows.length > 0);
  const link = (k: string): string => { const p = new URLSearchParams(); if (f.q !== '') p.set('q', f.q); if (k !== '') p.set('show', k); const s = p.toString(); return s === '' ? '/staff/pipeline' : `/staff/pipeline?${s}`; };
  const shown = groups.reduce((n, g) => n + g.rows.length, 0);
  return page({
    title: 'Pipeline', nav: d.nav(actor), wide: true,
    body: h`<div class="pagehead"><div><p class="eyebrow">Claims</p><h1>Pipeline</h1>
        <p class="help">${inProgress.length} ${inProgress.length === 1 ? 'claim' : 'claims'} in progress · ${late} with a late next step</p></div>
      <p><a class="btn" href="/staff/pipeline?layout=board">Show as a board</a>${can(actor, 'lead.write', { type: 'lead', id: '__lead_section__', business_id: null }) ? h` <a class="btn btn-primary" href="${RECORD_LEAD_HREF}">Record a lead</a>` : raw('')}</p></div>${done(msg)}
      ${kpiRow([
        { label: 'In progress', value: String(inProgress.length), tone: 'total' },
        { label: 'Next step late', value: String(late), tone: 'late', href: link('late') },
        { label: 'Nobody owns it', value: String(nobody), tone: 'warn', href: link('nobody') },
        { label: 'On hold', value: String(b.on_hold.length), tone: 'plain' },
      ])}
      <section class="card"><h2 class="vh">Where the claims are</h2>${bar}${empty.length === 0 || inProgress.length === 0 ? raw('')
        : h`<p class="help">Nothing at ${empty.join(', ')}.</p>`}
      <div class="help">A claim moves one step at a time, and each move is checked when you press it.${why(h`There are ten steps, from enquiry to defence pack.
      <strong>Each step is checked before a claim can move on</strong> — the button alone does not move it. Our fee is
      due ${b.fee_trigger}.`)}</div></section>
      <section class="card">
        <div class="listtools"><form method="get" action="/staff/pipeline" role="search" class="inlineform"><label for="pq">Find a claim</label>
          <input id="pq" name="q" type="search" value="${f.q}" placeholder="A business, a site or a claim number">${show === '' ? raw('') : h`<input type="hidden" name="show" value="${show}">`}
          <button type="submit" class="btn-quiet">Find</button></form>
        <nav class="viewbar" aria-label="Show">${PIPELINE_SHOWS.map(([k, label]) => h`<a href="${link(k)}"${k === show ? raw(' aria-current="page"') : raw('')}>${label}</a>`)}</nav></div>
        ${shown === 0 ? h`<p class="empty">No claim matches. <a href="/staff/pipeline">Show every claim</a></p>`
          : h`<div class="tablewrap"><table class="stack pipetable">
          <thead><tr><th scope="col">Business and site</th><th scope="col">Stage</th><th scope="col">Next step</th><th scope="col">Due</th><th scope="col">Owner</th>${
            withValue ? h`<th scope="col">Range shown</th>` : raw('')}</tr></thead>
          ${groups.map((g) => h`<tbody><tr class="bandrow"><th scope="colgroup" colspan="${cols}">${g.band}</th></tr>${g.rows.map((c) => pipelineRow(c, nowIso, withValue))}</tbody>`)}
        </table></div>`}
      </section>
      ${dataLink(actor, '/staff/pipeline/view.json')}`,
  });
}

function boardPage(d: PipelinePageDeps, actor: Actor, b: C.Board, msg: string | undefined): string {
  const exited = b.exited.filter((e) => e.cards.length > 0);
  const open = b.columns.reduce((n, c) => n + c.cards.length, 0);
  return page({
    title: 'Pipeline', nav: d.nav(actor), wide: true,
    body: h`<div class="pagehead"><div><p class="eyebrow">Claims</p><h1>Pipeline</h1></div><p class="help">${open} in progress · ${b.on_hold.length} on hold
      <a class="btn" href="/staff/pipeline">Show as a list</a></p></div>${done(msg)}
      <div class="help">A claim moves one step at a time, and each move is checked when you press it.${why(h`There are ten steps, from enquiry to defence pack.
      <strong>Each step is checked before a claim can move on</strong> — the button alone does not move it. Our fee is
      due ${b.fee_trigger}.`)}</div>
      <ol class="board" aria-label="The pipeline, one column per stage">${b.columns.map((col) => column(`stage-${col.key}`, col.label, col.cards,
        col.owner === '' && col.gate === '' ? raw('') : h`<details><summary>Owner and what this step needs</summary>
          ${col.owner === '' ? raw('') : h`<p class="help">Owner: ${brandName(col.owner)}</p>`}
          ${col.gate === '' ? raw('') : h`<p class="help">What this step needs: ${brandName(col.gate)}</p>`}</details>`))}</ol>
      <ol class="board" aria-label="Claims on hold and claims that have stopped">
        ${column('on-hold', 'On hold', b.on_hold)}
        ${exited.length === 0 ? h`<li class="empty-col"><h2 class="colhead"><span>Stopped — the record is kept</span></h2><p class="none">No claim has stopped.</p></li>`
          : exited.map((e) => column(`exit-${e.key}`, `Exit: ${e.label}`, e.cards))}
        ${b.unrecognised.length === 0 ? raw('') : column('unrecognised', 'No step set', b.unrecognised,
          h`<p class="help">No step is set for these claims yet. An admin may reopen one at the enquiry.</p>`)}
      </ol>
      ${dataLink(actor, '/staff/pipeline/view.json')}`,
  });
}
