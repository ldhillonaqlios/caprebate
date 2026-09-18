/**
 * THE CRM BACKBONE'S ROUTES AND PAGES — organisations, properties, and the
 * claim page's header and overview. CRM 1 of 10, 10 September 2026.
 *
 * Same shape as `handleEngaged` and `handleSurveyor`: it returns 'not-mine' for
 * anything it does not own, so the mounting in staff.ts is one line and nothing
 * is shadowed by accident.
 *
 * THE THREE RULES FROM router.ts APPLY UNCHANGED: authorise on the object on
 * every request, no route maps a path onto the filesystem, and every response
 * is built with the `h` tagged template. The third matters on every page here —
 * a contact's notes, a property's construction notes and a claim's next action
 * are all STAFF-SUPPLIED TEXT RENDERED IN A STAFF PAGE, which is where stored
 * cross-site scripting lives. test/crm.test.ts posts a script tag into each and
 * asserts what comes back is escaped. A website is shown as TEXT, never as a
 * link, so a hostile href has nowhere to go.
 *
 * `view.json` IS NOT A CONVENIENCE. The property and the claim each serve the
 * object their page is drawn from, to the same actor under the same rule, so
 * that N1 can be verified on the wire — tools/payload-proof.ts reads both.
 *
 * NOTHING HERE DECIDES ANYTHING. src/web/crm.ts does every authorisation and
 * every derivation; this file draws what it returns.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as C from './crm.ts';
import type { PipelinePanel } from './pipeline.ts';
import { enquiryBlock } from './pipeline-pages.ts';
import { can } from '../authz.ts';
import { claimTasksBlock, emailBlock, newTaskForm, notesBlock, timelineBlock } from './tasks-pages.ts';
import { mayCreateTask, taskOwnerChoices } from './tasks.ts';
import { timelineIfPermitted, type Timeline } from './timeline.ts';
import { activeTemplates } from './templates.ts';
import { claimDocumentsBlock, placeDocumentsBlock } from './documents-pages.ts';
import * as LI from './lists.ts';
import { taskChoices, vocabulary } from './vocabularies.ts';
import { listControls, mayShareViews, requestParams, sortHeading, type SortBy } from './lists-pages.ts';
import { aftercareBlock, deliverablesBlock, factsBlock, figuresBlock } from './claim-record-pages.ts';
import { opens } from './navigation.ts';
import { assertClientsSection } from './engaged.ts';
import { badge, brandName, claimStageBar, dataLink, fields, highlights, nextStepCard, recordLayout, recordTabs, savedMessage, sidePanel, why, type QuickAction } from './components.ts';
import { claimNextStep } from './next-step.ts';
import { dueWords, localStamp, ukDate } from './localtime.ts';
import { navContext } from './navigation.ts';

type Owner = { readonly id: string; readonly name: string; readonly role: string };

export type WebResult = 'handled' | 'not-mine';

export type CrmPageDeps = {
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

/** The posted fields a form carried — absent keys untouched, an empty box clears. */
function posted(f: URLSearchParams, names: readonly string[]): C.Fields {
  const out: Record<string, string | null> = {};
  for (const n of names) {
    if (!f.has(n)) continue;
    const v = (f.get(n) ?? '').trim();
    out[n] = v === '' ? null : v;
  }
  return out;
}

const ORGANISATION_FIELDS = ['legal_name', 'company_number', 'claimant_type', 'registered_address', 'trading_address',
  'website', 'client_status', 'source', 'owner_id'] as const;
// CRM 3 of 10: the last contact is derived and a follow-up is a task, so neither is posted.
const CONTACT_FIELDS = ['full_name', 'job_title', 'contact_type', 'is_decision_maker', 'email', 'phone', 'notes'] as const;
const PROPERTY_FIELDS = ['label', 'postcode', 'address_line_1', 'address_line_2', 'town', 'jurisdiction', 'property_type',
  'property_use', 'tenure', 'occupier', 'acquisition_date', 'acquisition_price', 'completion_date', 'disposal_date',
  'previous_owner', 'construction_notes', 'existing_ca_claimed', 'prior_claim_notes', 'sale_in_prospect'] as const;
// CRM 3 of 10: the next action is a task, set in its own panel, so the form does not draw it. THE CRM FOLLOW-ON: it is
// still READ here when posted, so `updateClaim` refuses it with its reason — dropping it answered "saved" and wrote nothing.
const CLAIM_FIELDS = ['owner_id', 'surveyor_id', 'priority', 'workstream', 'property_id',
  'hold_reason', 'lost_reason', 'expected_completion', 'next_action', 'next_action_due'] as const;

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

export async function handleCrm(
  d: CrmPageDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor,
  form: (r: IncomingMessage) => Promise<URLSearchParams>,
): Promise<WebResult> {
  const path = url.pathname;
  const db = d.app.db;
  const deps: C.CrmDeps = { db, audit: d.app.audit, now: d.app.now, newId: d.newId };
  const done = url.searchParams.get('done') ?? undefined;

  /* ---------------------------------------------------- organisations */
  if (path === '/staff/organisations' && method === 'GET') {
    html(res, 200, organisationsPage(d, actor, C.organisationList(db, actor)));
    return 'handled';
  }

  // THE CRM FOLLOW-ON: the organisation serves the object its page is drawn from, as the property and the claim do, so
  // the firm that referred it can be seen on the wire. ADMIN and SALES; everyone else refused by `organisation.read`.
  const orgJson = /^\/staff\/organisations\/([A-Za-z0-9-]+)\/view\.json$/.exec(path);
  if (orgJson && method === 'GET') {
    json(res, 200, C.organisationView(db, actor, orgJson[1] ?? ''));
    return 'handled';
  }

  const org = /^\/staff\/organisations\/([A-Za-z0-9-]+)$/.exec(path);
  if (org && method === 'GET') {
    const v = C.organisationView(db, actor, org[1] ?? '');
    html(res, 200, organisationPage(d, actor, v, done, {
      timeline: timelineIfPermitted(db, actor, { kind: 'organisation', id: v.id }),
      owners: mayCreateTask(actor) ? taskOwnerChoices(db) : null,
      may_note: can(actor, 'internal_note.write', { type: 'internal_note', id: v.id, business_id: v.id }),
    }));
    return 'handled';
  }
  if (org && method === 'POST') {
    const id = org[1] ?? '';
    const r = C.updateOrganisation(deps, actor, id, posted(await form(req), ORGANISATION_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/organisations/${id}`, r.field);
    redirect(res, `/staff/organisations/${id}?done=saved`);
    return 'handled';
  }

  const addContact = /^\/staff\/organisations\/([A-Za-z0-9-]+)\/contacts$/.exec(path);
  if (addContact && method === 'POST') {
    const id = addContact[1] ?? '';
    const r = C.addContact(deps, actor, id, posted(await form(req), CONTACT_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Contact not added', r.why, `/staff/organisations/${id}`, r.field);
    redirect(res, `/staff/organisations/${id}?done=contact`);
    return 'handled';
  }

  const contact = /^\/staff\/contacts\/([A-Za-z0-9-]+)$/.exec(path);
  if (contact && method === 'POST') {
    const f = await form(req);
    const back = `/staff/organisations/${f.get('business_id') ?? ''}`;
    const r = C.updateContact(deps, actor, contact[1] ?? '', posted(f, CONTACT_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Contact not saved', r.why, back);
    redirect(res, `${back}?done=contact`);
    return 'handled';
  }

  const addProperty = /^\/staff\/organisations\/([A-Za-z0-9-]+)\/properties$/.exec(path);
  if (addProperty && method === 'POST') {
    const id = addProperty[1] ?? '';
    const r = C.addProperty(deps, actor, id, posted(await form(req), ['label', 'postcode']));
    if (!r.ok) return d.problem(res, actor, 'Property not added', r.why, `/staff/organisations/${id}`, r.field);
    redirect(res, `/staff/properties/${r.id}?done=added`);
    return 'handled';
  }

  /* ------------------------------------------------------- properties */
  if (path === '/staff/properties' && method === 'GET') {
    html(res, 200, propertiesPage(d, actor, C.propertyList(db, actor)));
    return 'handled';
  }

  const propJson = /^\/staff\/properties\/([A-Za-z0-9-]+)\/view\.json$/.exec(path);
  if (propJson && method === 'GET') {
    json(res, 200, C.propertyView(db, actor, propJson[1] ?? ''));
    return 'handled';
  }

  const prop = /^\/staff\/properties\/([A-Za-z0-9-]+)$/.exec(path);
  if (prop && method === 'GET') {
    const v = C.propertyView(db, actor, prop[1] ?? '');
    html(res, 200, propertyPage(d, actor, v, done, {
      // A surveyor may open the property and not its timeline: `timelineIfPermitted` asks, and draws nothing for them.
      timeline: timelineIfPermitted(db, actor, { kind: 'property', id: v.id }),
      owners: mayCreateTask(actor) ? taskOwnerChoices(db) : null,
      // CRM 9 of 10: a note may name a property (migration 012), and the property page now offers it.
      may_note: can(actor, 'internal_note.write', { type: 'internal_note', id: v.business.id, business_id: v.business.id }),
    }));
    return 'handled';
  }
  if (prop && method === 'POST') {
    const id = prop[1] ?? '';
    const r = C.updateProperty(deps, actor, id, posted(await form(req), PROPERTY_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/properties/${id}`);
    redirect(res, `/staff/properties/${id}?done=saved`);
    return 'handled';
  }

  const openClaim = /^\/staff\/properties\/([A-Za-z0-9-]+)\/claims$/.exec(path);
  if (openClaim && method === 'POST') {
    const id = openClaim[1] ?? '';
    const r = C.openClaim(deps, actor, id, posted(await form(req), ['workstream']));
    if (!r.ok) return d.problem(res, actor, 'Claim not opened', r.why, `/staff/properties/${id}`);
    redirect(res, `/staff/claims/${r.id}?done=opened`);
    return 'handled';
  }

  /* ----------------------------------------------------------- claims */
  if (path === '/staff/claims' && method === 'GET') {
    // CRM 9 of 10: filtered, sorted and saved through src/web/lists.ts, each row still asked of `claim.read`.
    const asked = requestParams(d.app, actor, 'CLAIMS', url.searchParams);
    const v = LI.claimsList(db, actor, asked.params, asked.ignored);
    html(res, 200, claimsPage(d, actor, v.rows, listControls('CLAIMS', v, LI.viewsFor(db, actor, 'CLAIMS'), mayShareViews(actor), asked.view), sortHeading('CLAIMS', v)));
    return 'handled';
  }

  const claimJson = /^\/staff\/claims\/([A-Za-z0-9-]+)\/view\.json$/.exec(path);
  if (claimJson && method === 'GET') {
    json(res, 200, C.claimView(db, actor, claimJson[1] ?? '', { now: d.app.now() }));
    return 'handled';
  }

  const claim = /^\/staff\/claims\/([A-Za-z0-9-]+)$/.exec(path);
  if (claim && method === 'GET') {
    const v = C.claimView(db, actor, claim[1] ?? '', { now: d.app.now() });
    const biz = v.client.business_id;
    const mayEmail = can(actor, 'email.queue', { type: 'email', id: v.id, business_id: biz });
    const contacts = mayEmail && can(actor, 'contact.read', { type: 'contact', id: biz, business_id: biz })
      ? C.contactsFor(db, actor, biz).map((c) => ({ id: c.id, name: c.full_name, email: c.email }))
      : undefined;
    html(res, 200, claimPage(d, actor, v, done, {
      templates: mayEmail ? activeTemplates(db, actor) : [],
      contacts,
      may_note: can(actor, 'internal_note.write', { type: 'internal_note', id: biz, business_id: biz }),
    }));
    return 'handled';
  }
  if (claim && method === 'POST') {
    const id = claim[1] ?? '';
    const r = C.updateClaim(deps, actor, id, posted(await form(req), CLAIM_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/claims/${id}`, r.field);
    redirect(res, `/staff/claims/${id}?done=saved`);
    return 'handled';
  }

  /* ----------------------------------------------- the claim team (the CRM follow-on) */
  const team = /^\/staff\/claims\/([A-Za-z0-9-]+)\/team$/.exec(path);
  if (team && method === 'POST') {
    const id = team[1] ?? '';
    const r = C.linkClaimContact(deps, actor, id, (await form(req)).get('contact_id'));
    if (!r.ok) return d.problem(res, actor, 'Not added to the team', r.why, `/staff/claims/${id}`);
    redirect(res, `/staff/claims/${id}?done=team`);
    return 'handled';
  }
  const teamEnd = /^\/staff\/claim-team\/([A-Za-z0-9-]+)\/end$/.exec(path);
  if (teamEnd && method === 'POST') {
    const r = C.unlinkClaimContact(deps, actor, teamEnd[1] ?? '');
    const back = r.claim_id === undefined ? '/staff/claims' : `/staff/claims/${r.claim_id}`;
    if (!r.ok) return d.problem(res, actor, 'Not taken off the team', r.why, back);
    redirect(res, `${back}?done=team`);
    return 'handled';
  }

  return 'not-mine';
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

function orNot(v: string | null | undefined, none = C.NOT_RECORDED): Safe {
  return v === null || v === undefined || v === '' ? h`<span class="help">${none}</span>` : h`${v}`;
}

/** A fact and where it came from — "from the Companies House register record" where derived, "recorded by staff" where not. */
function factCell(f: C.Fact): Safe {
  return h`${f.value === null ? h`<span class="help">${f.display}</span>` : h`${f.display}`}${
    f.source === null ? raw('') : h`<br><span class="help">${f.derived ? `from ${f.source}` : f.source}</span>`}`;
}

function done(msg: string | undefined): Safe {
  return msg === undefined ? raw('') : savedMessage();
}

/** The request's clock, for "Due in 3 days" and "Today, 12:32". Outside a request (a unit test) it is the wall clock. */
function nowIso(): string {
  return navContext.getStore()?.now() ?? new Date().toISOString();
}

/** A due date as words and the date: "Due in 3 days (24 Sep 2026)". */
function due(d: string | null | undefined): string {
  return d === null || d === undefined ? '' : dueWords(d, nowIso());
}

function valuePanel(v: C.ClaimValue): Safe {
  return v.established
    ? h`<dl><dt>The range the client was shown</dt><dd>${v.shown_range}</dd>
        <dt>Estimated qualifying expenditure</dt><dd>${v.qualifying_expenditure}</dd>
        <dt>Indicative lifetime tax saving</dt><dd>${v.indicative_lifetime_saving}</dd></dl>`
    : h`<p class="help">No value yet — ${v.why}.</p>`;
}

/**
 * THE CLAIM'S PIPELINE PANEL — CRM 2 of 10. Built from `pipeline` in the claim's
 * view, which is itself built forwards: a surveyor's carries the stage and its
 * steps and nothing else, so this draws nothing else for them. Every form posts
 * to src/web/pipeline-pages.ts, and the server asks the gate again.
 */
/**
 * CRM 3 of 10 — THE NEXT ACTION A MOVE MAY CARRY. Optional: without it, the move
 * needs the claim to keep its own next action, and the server refuses it
 * otherwise. Drawn only for a reader offered owners.
 */
function nextActionFields(owners: readonly Owner[]): Safe {
  if (owners.length === 0) return raw('');
  return h`<details><summary>…and name the next action after it</summary>
    <label>Next action <input name="next_action_title"></label>
    <label>Owner <select name="next_action_owner"><option value="">keep the claim’s current next action</option>${
      owners.map((o) => h`<option value="${o.id}">${o.name}</option>`)}</select></label>
    <label>Due <input name="next_action_due" type="date"></label></details>`;
}

function pipelineBlock(id: string, p: PipelinePanel | undefined, owners: readonly Owner[] = []): Safe {
  if (p === undefined) return raw('');
  const m = p.moves;
  // PHASE 133c (B2): the ten stages are drawn once, in the stage bar at the top of the page, so this panel no longer lists
  // them a second time. Everything the gate reads — the procedure's words, each need and its reading, what the client's
  // portal shows, the fee trigger and the claimable figure — is still here, behind "See everything this stage needs".
  return h`<div class="pblock"><div class="pnum">Stage and moves</div>
    <p>Stage: <strong>${p.stage.label}</strong></p>
    ${p.hold === undefined ? raw('') : h`<p class="help">On hold — ${p.hold.reason ?? 'no reason recorded'}. It returns to ${p.hold.returns_to}.</p>`}
    ${p.steps.length === 0 ? h`<p class="help">No steps can be drawn for a stage that is not recognised.</p>`
      : p.steps.some((s) => s.state === 'exited') ? h`<p class="help">It left the procedure at ${p.steps.find((s) => s.state === 'exited')?.label ?? ''}.</p>` : raw('')}
    ${p.gate === undefined && p.portal === undefined ? raw('') : h`<details id="stage-needs"><summary>See everything this stage needs</summary>
    ${p.gate === undefined ? raw('') : h`<h3>Moving on from ${p.gate.label}: ${p.gate.open ? badge('Ready', 'ok') : badge('Not ready yet')}</h3>
      <p class="help">The procedure: “${brandName(p.gate.procedure_gate)}” Owner of the stage: ${brandName(p.gate.owner)}</p>
      <table><tbody>${p.gate.needs.map((n) => h`<tr><td>${n.met ? 'Done' : 'Still needed'}</td><td>${n.what}</td><td>${n.why}</td></tr>`)}</tbody></table>`}
    ${p.portal === undefined ? raw('') : h`<div class="help">The client’s page shows “${p.portal.shows}”.${why(h`${p.portal.this_claim_evidences === null ? 'This claim’s stage matches no step on the client’s page.'
        : `This claim’s stage matches “${p.portal.this_claim_evidences}” on the client’s page.`} A move raises the client’s step and never lowers it.`)}</div>`}
    </details>`}
    ${p.enquiry === undefined ? raw('') : h`<div id="enquiry-gate">${enquiryBlock(p.enquiry, m?.may_record === true ? `/staff/claims/${id}/checks` : null)}</div>`}
    ${p.confirmations === undefined || p.confirmations.length === 0 ? raw('') : h`<h3>Confirmations at this stage</h3>
      <table><tbody>${p.confirmations.map((c) => h`<tr><td>${c.label}</td><td>${c.recorded === null
        ? h`<span class="help">not confirmed since the claim entered this stage</span>` : h`confirmed ${c.recorded}`}</td>
        <td>${c.recorded === null && m?.may_record === true ? h`<form method="post" action="/staff/claims/${id}/milestones" class="inline">
          <input type="hidden" name="milestone" value="${c.key}"><input name="note" placeholder="note">
          <button type="submit">Confirm</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}
    ${p.claimable_figure === undefined ? raw('') : h`<div class="help">A claimable figure for the client: ${p.claimable_figure.released
      ? 'released' : 'not released yet'}.${p.claimable_figure.released ? raw('') : why(p.claimable_figure.why)}</div>`}
    ${p.fee_trigger === undefined ? raw('') : h`<div class="help">When our fee is due: ${p.fee_trigger.reading}.${why(h`${
      p.fee_trigger.decided ? 'This is decided.' : 'This is the most cautious reading, while it is undecided.'} The open question: “${p.fee_trigger.question}”`)}</div>`}
    ${m === undefined ? raw('') : h`<h3>Move the claim</h3>
      <div class="help">A move is checked again when you press the button.${why('Every move asks the gate on the server. A gate that is not ready refuses it, whatever this page shows.')}</div>
      ${m.forward === null ? raw('') : h`<form method="post" action="/staff/claims/${id}/stage">
        <input type="hidden" name="kind" value="FORWARD"><input type="hidden" name="to" value="${m.forward.to}">
        <label>Note <input name="reason"></label>${nextActionFields(owners)}
        <button type="submit">Move to ${m.forward.label}${m.forward.open ? '' : ' (not ready yet)'}</button></form>`}
      ${m.exits.length === 0 ? raw('') : h`<form method="post" action="/staff/claims/${id}/stage">
        <input type="hidden" name="kind" value="EXIT">
        <label>Exit to <select name="to">${m.exits.map((e) => h`<option value="${e.key}">${e.label}</option>`)}</select></label>
        <label>Reason <select name="reason_code"><option value="">choose</option>${
          m.exit_reasons.map((r) => h`<option value="${r.code}">${r.label}</option>`)}</select></label>
        <label>Note <input name="reason"></label>
        <button type="submit">Close the claim here</button><span class="help"> The record is kept.</span></form>`}
      ${m.may_hold ? h`<form method="post" action="/staff/claims/${id}/stage">
        <input type="hidden" name="kind" value="HOLD">
        <label>Hold reason <input name="reason" required></label>${nextActionFields(owners)}
        <button type="submit">Put on hold</button></form>` : raw('')}
      ${m.resume === null ? raw('') : h`<form method="post" action="/staff/claims/${id}/stage">
        <input type="hidden" name="kind" value="RESUME"><input type="hidden" name="to" value="${m.resume.to}">${nextActionFields(owners)}
        <button type="submit">Resume at ${m.resume.label}</button></form>`}
      ${m.reopen.length === 0 ? raw('') : h`<form method="post" action="/staff/claims/${id}/stage">
        <input type="hidden" name="kind" value="REOPEN">
        <label>Reopen at <select name="to">${m.reopen.map((r) => h`<option value="${r.key}">${r.label}</option>`)}</select></label>
        <label>Reason <input name="reason" required></label>${nextActionFields(owners)}
        <button type="submit">Reopen</button></form>`}`}
    ${p.history === undefined ? raw('') : h`<h3>Every move</h3>${p.history.length === 0 ? h`<p class="help">No move is recorded.</p>`
      : h`<table><thead><tr><th>When</th><th>What</th><th>From</th><th>To</th><th>Who</th><th>Reason</th></tr></thead>
        <tbody>${p.history.map((x) => h`<tr><td>${x.at}</td><td>${x.what}</td><td>${x.from}</td><td>${x.to}</td><td>${x.who}</td>
          <td>${x.reason ?? ''}${x.note === null ? raw('') : h`<br><span class="help">${x.note}</span>`}</td></tr>`)}</tbody></table>`}`}
  </div>`;
}

function claimLines(claims: readonly C.ClaimSummary[]): Safe {
  if (claims.length === 0) return h`<p class="help">No claim you may open is recorded here.</p>`;
  return h`<table><thead><tr><th>Reference</th><th>Workstream</th><th>Stage</th><th>Next action</th><th>Value</th></tr></thead>
    <tbody>${claims.map((c) => h`<tr><td><a href="/staff/claims/${c.id}">${c.claim_ref}</a></td><td>${c.workstream}</td>
      <td>${c.stage}</td><td>${orNot(c.next_action, '—')}</td>
      <td>${c.value === undefined
        ? h`<span class="help">not shown to this role</span>`
        : c.value.established ? h`${c.value.shown_range}` : h`<span class="help">no estimate yet</span>`}</td></tr>`)}</tbody></table>`;
}

/* ------------------------------------------------------------------ *
 * ORGANISATIONS
 * ------------------------------------------------------------------ */

function organisationsPage(d: CrmPageDeps, actor: Actor, rows: readonly C.OrganisationRow[]): string {
  return page({
    title: 'Organisations', nav: d.nav(actor), wide: true,
    body: h`<h1>Organisations</h1>
      <p class="help">Every client organisation, with its properties and claims. ${rows.length} shown.
      An organisation marked <strong>do not contact</strong> receives nothing: the outbox refuses it.</p>
      ${rows.length === 0 ? h`<p class="empty">No organisations yet. An organisation is recorded when a client completes the assessment, or when a lead is recorded for it.</p>` : h`<table>
        <thead><tr><th>Trading name</th><th>Legal name</th><th>Claimant type</th><th>Status</th><th>Owner</th>
        <th>Properties</th><th>Claims</th></tr></thead>
        <tbody>${rows.map((r) => h`<tr><td><a href="/staff/organisations/${r.id}">${r.trading_name}</a></td>
          <td>${r.legal_name}</td><td>${r.claimant_type}</td>
          <td>${r.do_not_contact ? h`<strong>${r.client_status}</strong>` : h`${r.client_status}`}</td>
          <td>${orNot(r.owner, 'nobody yet')}</td><td>${r.properties}</td><td>${r.claims}</td></tr>`)}</tbody></table>`}`,
  });
}

function contactForm(action: string, business_id: string, c: C.ContactView | null, button: string): Safe {
  return h`<form method="post" action="${action}">
    <input type="hidden" name="business_id" value="${business_id}">
    <label>Name <input name="full_name" value="${c?.full_name ?? ''}" required></label>
    <label>Job title <input name="job_title" value="${c?.job_title ?? ''}"></label>
    <label>Contact type <select name="contact_type">${options(C.CONTACT_TYPES, c?.contact_type.value ?? null, 'not recorded')}</select></label>
    <label>Decision maker <select name="is_decision_maker">
      <option value=""${c === null || !c.is_decision_maker.known ? raw(' selected') : raw('')}>not recorded</option>
      <option value="yes"${c?.is_decision_maker.value === 'yes' ? raw(' selected') : raw('')}>Yes</option>
      <option value="no"${c?.is_decision_maker.value === 'no' ? raw(' selected') : raw('')}>No</option></select></label>
    <label>Email <input name="email" type="email" value="${c?.email ?? ''}"></label>
    <label>Telephone <input name="phone" value="${c?.phone ?? ''}"></label>
    <p class="help">The last contact is read from the timeline, and a follow-up is a task — add one below.</p>
    <label>Notes — internal, never shown to the client <textarea name="notes">${c?.notes ?? ''}</textarea></label>
    <button type="submit">${button}</button></form>`;
}

function organisationPage(
  d: CrmPageDeps, actor: Actor, v: C.OrganisationView, msg: string | undefined,
  x: { timeline: Timeline | undefined; owners: readonly Owner[] | null; may_note: boolean },
): string {
  return page({
    title: v.trading_name, nav: d.nav(actor), wide: true,
    body: h`${done(msg)}
      ${highlights('Organisation', v.trading_name, [
        { label: 'Client status', value: v.client_status.do_not_contact ? badge(v.client_status.label, 'stop') : v.client_status.label },
        { label: 'Owner', value: orNot(v.owner?.name, 'nobody yet') },
        { label: 'Sector', value: v.sector.replace(/_/g, ' ') },
        v.legal_name.value === null ? null : { label: 'Legal name', value: factCell(v.legal_name) },
        { label: 'Source', value: v.source.label },
      ])}
      ${opens(actor, assertClientsSection) ? h`<p class="help">The organisation. Its questions, sources, missing facts and internal notes are on
      <a href="/staff/clients/${v.id}">the business page</a>.</p>` : raw('')}
      ${recordLayout(recordTabs([
        { id: 'details', label: 'Details', body: h`
      ${v.client_status.do_not_contact
        ? h`<div class="gate"><strong>Do not contact.</strong> Nothing can be queued to this organisation or to any
            address it holds — the outbox refuses it, and so does the database.</div>`
        : raw('')}

      <div class="pblock"><div class="pnum">The organisation</div>${fields([
        { label: 'Trading name', value: v.trading_name, why: 'The name the client gave us.' },
        // The claimant type decides the claim's route, so "not known" is an answer and stays.
        { label: 'Legal name', value: v.legal_name.value === null ? null : factCell(v.legal_name) },
        { label: 'Company number', value: v.company_number.value === null ? null : factCell(v.company_number) },
        { label: 'Claimant type', value: v.claimant_type.value === null ? 'Not known' : factCell(v.claimant_type), keep: true },
        { label: 'Sector', value: v.sector.replace(/_/g, ' ') },
        { label: 'Registered address', value: v.registered_address },
        { label: 'Trading address', value: v.trading_address },
        { label: 'Website', value: v.website },
        { label: 'Client status', value: v.client_status.label },
        { label: 'Source', value: v.source.label },
        v.referred_by === undefined || v.referred_by.length === 0 ? null : { label: 'Referred by', value: h`${
          v.referred_by.map((f) => h`<a href="${f.href}">${f.firm_name}</a> <span class="help">— ${f.leads} ${f.leads === 1 ? 'lead' : 'leads'}</span><br>`)}`,
          why: 'Read from the organisation’s leads, never typed here.' },
        { label: 'Owner', value: v.owner?.name },
        { label: 'Last changed', value: v.updated === null ? null : localStamp(v.updated, nowIso()) },
      ], v.may_write ? { href: '#change-organisation' } : undefined)}
      ${v.may_write ? h`<details id="change-organisation"><summary>Change these</summary>
        <form method="post" action="/staff/organisations/${v.id}">
          ${v.legal_name.derived ? h`<p class="help">The legal name is known from ${v.legal_name.source} and is not asked.</p>`
            : h`<label>Legal name <input name="legal_name" value="${v.legal_name.value ?? ''}"></label>`}
          ${v.company_number.derived ? h`<p class="help">The company number is known from ${v.company_number.source} and is not asked.</p>`
            : h`<label>Company number <input name="company_number" value="${v.company_number.value ?? ''}"></label>`}
          ${v.claimant_type.derived ? h`<p class="help">The claimant type is known from ${v.claimant_type.source} and is not asked.</p>`
            : h`<label>Claimant type
                <select name="claimant_type">${options(C.CLAIMANT_TYPES, v.claimant_type.value, 'not recorded')}</select></label>`}
          <label>Registered address <textarea name="registered_address">${v.registered_address ?? ''}</textarea></label>
          <label>Trading address <textarea name="trading_address">${v.trading_address ?? ''}</textarea></label>
          <label>Website <input name="website" value="${v.website ?? ''}"></label>
          <label>Client status <select name="client_status">${options(C.CLIENT_STATUSES, v.client_status.value, null)}</select></label>
          <label>Source <select name="source">${options(vocabulary(d.app.db, 'LEAD_SOURCE', v.source.value), v.source.value, 'not recorded')}</select></label>
          <label>Owner <select name="owner_id">${people(v.owner_choices, v.owner?.id ?? null, 'nobody yet')}</select></label>
          <button type="submit">Save</button></form></details>` : raw('')}
      </div>

` },
        { id: 'related', label: 'Related', count: (v.contacts?.length ?? 0) + v.properties.length + v.claims.length, body: h`
      <div class="pblock"><div class="pnum">Contacts</div>
      ${v.contacts === null ? h`<p class="help">Contacts are not shown to this role.</p>` : h`
        ${v.contacts.length === 0 ? h`<p class="help">No contact is recorded.</p>` : h`<table>
          <thead><tr><th>Name</th><th>Job title</th><th>Type</th><th>Decision maker</th><th>Email</th><th>Telephone</th>
          <th>Last contact</th><th>Next follow-up</th><th>Notes</th></tr></thead>
          <tbody>${v.contacts.map((c) => h`<tr><td>${c.full_name}</td><td>${orNot(c.job_title)}</td><td>${c.contact_type.label}</td>
            <td>${c.is_decision_maker.label}</td><td>${orNot(c.email)}</td><td>${orNot(c.phone)}</td>
            <td><span class="help">${c.last_contact}</span></td>
            <td>${c.next_follow_up_at !== null ? h`${c.next_follow_up_at}` : h`<span class="help">${c.follow_ups_open === 0
              ? 'none — a follow-up is a task naming the contact' : 'an open follow-up with no due date'}</span>`}</td>
            <td>${orNot(c.notes, 'none')}</td></tr>
            ${v.may_write ? h`<tr><td colspan="9"><details><summary>Change ${c.full_name}</summary>
              ${contactForm(`/staff/contacts/${c.id}`, v.id, c, 'Save contact')}</details></td></tr>` : raw('')}`)}</tbody></table>`}
        ${v.may_write ? h`<details><summary>Add a contact</summary>
          <p class="help">A client's accountant or adviser is a contact, and never has a login.</p>
          ${contactForm(`/staff/organisations/${v.id}/contacts`, v.id, null, 'Add contact')}</details>` : raw('')}`}
      </div>

      <div class="pblock"><div class="pnum">Properties</div>
      ${v.properties.length === 0 ? h`<p class="help">No property is recorded.</p>` : h`<table>
        <thead><tr><th>Property</th><th>Postcode</th><th>Jurisdiction</th><th>Claims</th></tr></thead>
        <tbody>${v.properties.map((p) => h`<tr><td><a href="/staff/properties/${p.id}">${p.label}</a></td>
          <td>${orNot(p.postcode)}</td><td>${p.jurisdiction}</td><td>${p.claims}</td></tr>`)}</tbody></table>`}
      ${v.may_write ? h`<details><summary>Add a property</summary>
        <form method="post" action="/staff/organisations/${v.id}/properties">
          <label>Name of the site or building <input name="label" required></label>
          <label>Postcode <input name="postcode"></label>
          <button type="submit">Add property</button></form></details>` : raw('')}
      </div>

      <div class="pblock"><div class="pnum">Claims</div>${claimLines(v.claims)}</div>

      ${placeDocumentsBlock(v.documents, null)}

` },
        { id: 'activity', label: 'Activity', body: h`
      ${x.owners === null ? raw('') : h`<div class="pblock" id="org-tasks"><div class="pnum">Tasks and follow-ups</div>${newTaskForm(
        taskChoices(d.app.db), { business_id: v.id }, x.owners, `/staff/organisations/${v.id}`, 'Add a task, or a follow-up with a contact',
        (v.contacts ?? []).map((c) => ({ id: c.id, name: c.full_name })))}</div>`}
      ${timelineBlock(x.timeline)}
      <div id="org-notes">${notesBlock(x.timeline, x.may_note ? `/staff/clients/${v.id}/notes` : null)}</div>` },
      ]), sidePanel(null, [
        ...(x.owners === null ? [] : [{ href: '#add-task', label: 'Log a call or add a follow-up' }]),
        ...(v.may_write ? [{ href: '#related', label: 'Add a contact or a property' }] : []),
        ...(x.may_note ? [{ href: '#org-notes', label: 'Add a note' }] : []),
        ...(opens(actor, assertClientsSection) ? [{ href: `/staff/clients/${v.id}`, label: 'The business page — questions and sources' }] : []),
      ]))}`,
  });
}

/* ------------------------------------------------------------------ *
 * PROPERTIES
 * ------------------------------------------------------------------ */

function propertiesPage(d: CrmPageDeps, actor: Actor, rows: readonly C.PropertyRow[]): string {
  return page({
    title: 'Properties', nav: d.nav(actor), wide: true,
    body: h`<h1>Properties</h1>
      <p class="help">${rows.length} shown. A surveyor sees the properties of the organisations whose survey jobs are
      assigned to them, and no others.</p>
      ${rows.length === 0 ? h`<p class="empty">No properties yet. Add one from its organisation’s page.</p>` : h`<table>
        <thead><tr><th>Property</th><th>Organisation</th><th>Postcode</th><th>Jurisdiction</th><th>Claims</th></tr></thead>
        <tbody>${rows.map((p) => h`<tr><td><a href="/staff/properties/${p.id}">${p.label}</a></td><td>${p.business_name}</td>
          <td>${orNot(p.postcode)}</td><td>${p.jurisdiction}</td><td>${p.claims}</td></tr>`)}</tbody></table>`}`,
  });
}

function propertyPage(
  d: CrmPageDeps, actor: Actor, v: C.PropertyView, msg: string | undefined,
  x: { timeline: Timeline | undefined; owners: readonly Owner[] | null; may_note: boolean },
): string {
  return page({
    title: v.label, nav: d.nav(actor), wide: true,
    body: h`${done(msg)}
      ${highlights('Property', v.label, [
        { label: 'Organisation', value: v.business.linkable ? h`<a href="/staff/organisations/${v.business.id}">${v.business.name}</a>` : v.business.name },
        { label: 'Postcode', value: orNot(v.postcode) },
        { label: 'Jurisdiction', value: v.jurisdiction.label },
        { label: 'Tenure', value: v.tenure.label },
        { label: 'Claims', value: String(v.claims.length) },
      ])}
      <p class="help">Belongs to ${v.business.linkable ? h`<a href="/staff/organisations/${v.business.id}">${v.business.name}</a>` : h`${v.business.name}`}.
      Survey status, date and surveyor belong to each claim, not to the building.</p>

      ${recordLayout(recordTabs([
        { id: 'details', label: 'Details', body: h`
      <div class="pblock"><div class="pnum">The property</div>${fields([
        { label: 'Address', value: [v.address_line_1, v.address_line_2, v.town].filter((x) => x !== null).join(', ') },
        { label: 'Postcode', value: v.postcode },
        // The jurisdiction and the prior-claim answers decide the claim, so "not known" is an answer and stays.
        { label: 'Jurisdiction', value: v.jurisdiction.label, keep: true, ...(v.jurisdiction.why === '' ? {} : { why: `Not derived: ${v.jurisdiction.why}` }) },
        { label: 'Property type', value: v.property_type === null ? null : v.property_type_label },
        { label: 'Property use', value: v.property_use },
        { label: 'Tenure', value: v.tenure.label },
        { label: 'Occupier', value: v.occupier },
        { label: 'Acquired', value: v.acquisition_date === null ? null : ukDate(v.acquisition_date) },
        { label: 'Acquisition price', value: v.acquisition_price },
        { label: 'Completed', value: v.completion_date === null ? null : ukDate(v.completion_date) },
        { label: 'Disposed of', value: v.disposal_date === null ? null : ukDate(v.disposal_date) },
        { label: 'Previous owner', value: v.previous_owner },
        { label: 'Construction or refurbishment', value: v.construction_notes },
        { label: 'Allowances claimed before?', value: v.existing_ca_claimed.label, keep: true,
          ...(!v.existing_ca_claimed.derived && v.existing_ca_claimed.source !== null ? { why: v.existing_ca_claimed.source } : {}) },
        { label: 'A sale in prospect?', value: v.sale_in_prospect.label, keep: true },
        { label: 'Prior claim information', value: v.prior_claim_notes },
      ], v.may_write ? { href: '#change-property' } : undefined)}</div>

      <div class="pblock"><div class="pnum">What the client told us in the assessment</div>
      ${v.from_the_assessment.length === 0 ? h`<p class="help">Nothing in the assessment is matched to this property.</p>` : h`
        <p class="help">Shown as the client gave it and never copied into the fields above: a month or a year is not a
        date, and a round figure is not a price.</p>
        <table><tbody>${v.from_the_assessment.map((a) => h`<tr><th>${a.question}</th><td>${a.answer}</td></tr>`)}</tbody></table>`}
      </div>

      ${v.may_write ? h`<div class="pblock" id="change-property"><div class="pnum">Change the property</div>
        <form method="post" action="/staff/properties/${v.id}">
          <label>Name <input name="label" value="${v.label}" required></label>
          <label>Address line 1 <input name="address_line_1" value="${v.address_line_1 ?? ''}"></label>
          <label>Address line 2 <input name="address_line_2" value="${v.address_line_2 ?? ''}"></label>
          <label>Town <input name="town" value="${v.town ?? ''}"></label>
          <label>Postcode <input name="postcode" value="${v.postcode ?? ''}"></label>
          ${v.jurisdiction.derived ? h`<p class="help">The jurisdiction is derived from the postcode and is not asked.</p>`
            : h`<label>Jurisdiction
                <select name="jurisdiction">${options(C.JURISDICTIONS, v.jurisdiction.value, 'not known')}</select></label>`}
          <label>Property type <select name="property_type">${options(vocabulary(d.app.db, 'PROPERTY_TYPE', v.property_type), v.property_type, 'not recorded')}</select></label>
          <label>Property use <input name="property_use" value="${v.property_use ?? ''}"></label>
          <label>Tenure <select name="tenure">${options(C.TENURES, v.tenure.value, 'not recorded')}</select></label>
          <label>Occupier — a company name or a role, never a person <input name="occupier"></label>
          <label>Acquisition date <input name="acquisition_date" type="date" value="${v.acquisition_date ?? ''}"></label>
          <label>Acquisition price, in pounds <input name="acquisition_price"></label>
          <label>Completion date <input name="completion_date" type="date" value="${v.completion_date ?? ''}"></label>
          <label>Disposal date <input name="disposal_date" type="date" value="${v.disposal_date ?? ''}"></label>
          <label>Previous owner — a company name, or one of ${Object.keys(C.OWNER_ROLE_TOKENS).join(', ')} <input name="previous_owner"></label>
          <label>Construction or refurbishment <textarea name="construction_notes">${v.construction_notes ?? ''}</textarea></label>
          ${v.existing_ca_claimed.derived ? h`<p class="help">Whether allowances were claimed before is known from ${v.existing_ca_claimed.source} and is not asked.</p>`
            : h`<label>Allowances claimed before?
                <select name="existing_ca_claimed">${options(C.PRIOR_CLAIM, v.existing_ca_claimed.value, 'not recorded')}</select></label>`}
          <label>A sale in prospect? <select name="sale_in_prospect">${options(C.PRIOR_CLAIM, v.sale_in_prospect.value, 'not recorded')}</select></label>
          <label>Prior claim information <textarea name="prior_claim_notes">${v.prior_claim_notes ?? ''}</textarea></label>
          <p class="help">Occupier, previous owner and price are left blank here so that saving the form never re-types a
          value; fill one in only to change it.</p>
          <button type="submit">Save</button></form></div>` : raw('')}

` },
        { id: 'related', label: 'Related', count: v.claims.length, body: h`
      <div class="pblock"><div class="pnum">Claims on this property</div>${claimLines(v.claims)}
      ${v.may_open_claim ? h`<form method="post" action="/staff/properties/${v.id}/claims">
        <label>Open a claim for <select name="workstream">${options(C.WORKSTREAMS, null, null)}</select></label>
        <button type="submit">Open claim</button></form>` : raw('')}
      </div>

      ${placeDocumentsBlock(v.documents, v.id)}
` },
        { id: 'activity', label: 'Activity', body: h`
      ${x.owners === null ? raw('') : h`<div class="pblock"><div class="pnum">Tasks on this property</div>${
        newTaskForm(taskChoices(d.app.db), { property_id: v.id }, x.owners, `/staff/properties/${v.id}`)}</div>`}
      ${timelineBlock(x.timeline)}
      <div id="property-notes">${notesBlock(x.timeline, x.may_note ? `/staff/properties/${v.id}/notes` : null)}</div>` },
      ]), sidePanel(null, [
        ...(x.owners === null ? [] : [{ href: '#add-task', label: 'Log a call or add a task' }]),
        ...(v.may_open_claim ? [{ href: '#related', label: 'Open a claim on this property' }] : []),
        ...(x.may_note ? [{ href: '#property-notes', label: 'Add a note' }] : []),
      ]))}

      ${dataLink(actor, `/staff/properties/${v.id}/view.json`)}`,
  });
}

/* ------------------------------------------------------------------ *
 * CLAIMS
 * ------------------------------------------------------------------ */

function claimsPage(d: CrmPageDeps, actor: Actor, rows: readonly C.ClaimRow[], controls: Safe = raw(''), sortBy: SortBy = (_k, l) => h`${l}`): string {
  // PHASE 133a: the filters and saved views in a panel beside the list; sortable headings; one table style.
  return page({
    title: 'Claims', nav: d.nav(actor), wide: true,
    body: h`<div class="pagehead"><div><p class="eyebrow">Claims</p><h1>Claims</h1></div><p class="help">${rows.length} shown.</p></div>
      <div class="listlayout">${controls}<div class="listmain">
      ${rows.length === 0 ? h`<p class="empty">No claims yet. A claim opens when a lead is converted, or from a property’s page.</p>` : h`<div class="tablewrap"><table>
        <thead><tr><th>${sortBy('reference', 'Reference')}</th><th>Client</th><th>Property</th><th>Workstream</th><th>Stage</th><th>Owner</th>
        <th>${sortBy('next_action', 'Next action')}</th><th>${sortBy('value', 'Value')}</th></tr></thead>
        <tbody>${rows.map((r) => h`<tr><td><a href="/staff/claims/${r.id}">${r.claim_ref}</a></td><td>${r.client}</td>
          <td>${r.property === undefined ? h`<span class="help">—</span>` : orNot(r.property, 'none recorded')}</td>
          <td>${r.workstream ?? '—'}</td><td>${r.stage ?? '—'}</td>
          <td>${r.owner === undefined ? h`<span class="help">—</span>` : orNot(r.owner, 'nobody yet')}</td>
          <td>${r.next_action === undefined ? h`<span class="help">—</span>` : orNot(r.next_action, 'none recorded')}</td>
          <td>${r.shown_range === undefined ? h`<span class="help">not shown to this role</span>` : h`${r.shown_range}`}</td></tr>`)}</tbody></table></div>`}
      </div></div>`,
  });
}

/**
 * THE CLAIM TEAM — the CRM follow-on, rows 8.4 and 23.7. Drawn from `team` in the claim's view, which is built forwards:
 * a surveyor's holds the owner and the surveyor and nothing else, so this draws nothing else for them.
 */
function teamBlock(v: C.ClaimView): Safe {
  const t = v.team;
  if (t === undefined) return raw('');
  return h`<div class="pblock"><div class="pnum">The claim team</div><dl>
    <dt>Owner</dt><dd>${orNot(t.owner, 'nobody yet')}</dd>
    <dt>Surveyor</dt><dd>${orNot(t.surveyor, 'none named')}${why(t.surveyor_reach)}</dd>
    ${t.tax_adviser === undefined ? raw('') : h`<dt>Tax adviser</dt><dd>${t.tax_adviser.state === 'RECORDED'
      ? h`${t.tax_adviser.adviser}, ${t.tax_adviser.credential}<br><span class="help">signed off ${ukDate(t.tax_adviser.signed_on)}</span>${why(h`The sign-off record, signed on ${ukDate(t.tax_adviser.signed_on)} and recorded ${t.tax_adviser.recorded} — the adviser is on the claim as their record, never as a person.`)}`
      : h`Not signed off yet${why(t.tax_adviser.reading)}`}</dd>`}
    </dl>
    ${t.contacts === undefined ? raw('') : h`<p><strong>The organisation’s accountant and adviser on this claim</strong></p>
      ${t.contacts.length === 0 ? h`<p class="help">Nobody is linked to this claim yet.</p>` : h`<table>
        <thead><tr><th>Contact</th><th>Type</th><th>On the team since</th><th></th></tr></thead>
        <tbody>${t.contacts.map((c) => h`<tr><td>${c.name}</td><td>${c.type}</td><td>${c.since} <span class="help">by ${c.linked_by}</span></td>
          <td>${t.may_link ? h`<form method="post" action="/staff/claim-team/${c.link_id}/end" class="inline"><button class="linkish" type="submit">Take off the team</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}
      ${t.candidates === undefined ? raw('') : t.candidates.length === 0
        ? h`<div class="help"><a href="/staff/organisations/${v.client.business_id}#related">Add the accountant or adviser as a contact</a>${why('The organisation has no other contact recorded as its accountant or adviser. Add one on the organisation page, typed as such.')}</div>`
        : h`<form method="post" action="/staff/claims/${v.id}/team">
            <label>Add to the team <select name="contact_id">${t.candidates.map((c) => h`<option value="${c.id}">${c.name} — ${c.type}</option>`)}</select></label>
            <button type="submit">Add</button></form>`}
      <div class="help">${why('A contact on the team stays a contact of the organisation. Nobody here has a login.')}</div>`}
  </div>`;
}

function claimPage(
  d: CrmPageDeps, actor: Actor, v: C.ClaimView, msg: string | undefined,
  x: {
    templates: readonly { id: string; label: string }[];
    contacts: readonly { id: string; name: string; email: string | null }[] | undefined;
    may_note: boolean;
  },
): string {
  const client = v.client.linkable ? h`<a href="/staff/organisations/${v.client.business_id}">${v.client.name}</a>` : h`${v.client.name}`;
  /* PHASE 133a: THE RECORD PAGE — highlights, the stage bar, three tabs and a right-hand panel. EVERY PANEL THE PAGE DREW
     BEFORE IS STILL DRAWN, in one of the tabs, from the same view; nothing is read that the view did not already carry. */
  const tasks = claimTasksBlock(v.id, v.tasks, taskChoices(d.app.db));
  const docs = claimDocumentsBlock(v.id, v.documents);
  const email = emailBlock(v.id, x.templates, x.contacts);
  const notes = notesBlock(v.timeline, x.may_note ? `/staff/claims/${v.id}/notes` : null);
  const pipe = pipelineBlock(v.id, v.pipeline, v.tasks?.may_set_next_action === true ? (v.tasks.owner_choices ?? []) : []);
  const quick: QuickAction[] = [
    ...(tasks.html.includes('action="/staff/tasks"') ? [{ href: '#add-task', label: 'Log a call or add a task' }] : []),
    ...(tasks.html.includes('/next-action"') ? [{ href: '#claim-tasks', label: 'Set the next action' }] : []),
    ...(docs.html.includes('/document-requests"') ? [{ href: '#claim-documents', label: 'Request a document' }] : []),
    ...(pipe.html.includes('/stage"') ? [{ href: '#move', label: 'Move the claim' }] : []),
    ...(email.html.includes('/email"') ? [{ href: '#claim-email', label: 'Email a contact' }] : []),
    ...(notes.html.includes('/notes"') ? [{ href: '#claim-notes', label: 'Add a note' }] : []),
  ];
  const related = (v.documents.documents.length) + (v.money?.length ?? 0) + (v.contacts?.length ?? 0);
  const nextAction = v.header === undefined ? null : v.header.next_action === null
    ? h`<p>${badge('None recorded', 'warn')}</p><p class="help">Every open claim has exactly one next action, with an owner and a due date.</p>`
    : h`<p><strong>${v.header.next_action}</strong></p>${v.header.next_action_due === null ? raw('') : h`<p class="help">${due(v.header.next_action_due)}</p>`}
        ${v.header.owner === null ? raw('') : h`<p class="help">${v.header.owner}</p>`}`;
  const step = v.pipeline === undefined ? null : claimNextStep(v.id, v.pipeline.gate, v.pipeline.moves, v.pipeline.hold);
  return page({
    title: v.claim_ref, nav: d.nav(actor), wide: true,
    body: h`${done(msg)}
      ${highlights('Claim', h`${v.claim_ref} · ${v.client.name}`, [
        v.header === undefined ? null : { label: 'Stage', value: v.header.stage.label },
        v.header === undefined ? null : { label: 'Owner', value: orNot(v.header.owner, 'nobody yet') },
        v.header === undefined ? null : { label: 'Property', value: v.header.property === null ? 'none recorded' : v.header.property.label },
        v.overview === undefined ? null : { label: 'Priority', value: v.overview.priority.label },
        v.value === undefined ? null : { label: 'Value', value: v.value.established ? v.value.shown_range : 'no estimate yet' },
        { label: 'Client', value: client },
      ])}
      ${v.pipeline === undefined ? raw('') : claimStageBar(v.pipeline.stage, v.pipeline.steps, v.pipeline.gate)}
      ${recordLayout(recordTabs([
        { id: 'details', label: 'Details', body: h`
      <div class="pblock"><div class="pnum">The claim</div>${fields([
        { label: 'Reference', value: v.claim_ref },
        { label: 'Client', value: client },
        v.header === undefined ? null : { label: 'Property', value: v.header.property === null ? null
          : v.header.property.linkable ? h`<a href="/staff/properties/${v.header.property.id}">${v.header.property.label}</a>` : v.header.property.label },
        v.header === undefined ? null : { label: 'Stage', value: v.header.stage.label },
        v.header === undefined ? null : { label: 'Owner', value: v.header.owner },
        v.header === undefined ? null : { label: 'Next action', value: v.header.next_action === null ? null
          : h`${v.header.next_action}${v.header.next_action_due === null ? raw('') : h`<br><span class="help">${due(v.header.next_action_due)}</span>`}` },
        v.value === undefined ? null : { label: 'Value', value: v.value.established ? v.value.shown_range : 'No estimate yet' },
        v.origin === undefined ? null : { label: 'Came from', value: v.origin.lead === null ? 'Opened by staff'
          : h`<a href="${v.origin.lead.href}">Its lead</a>`, why: v.origin.lead === null ? 'No lead: this claim was opened by staff on a property.' : v.origin.lead.origin },
        v.origin === undefined ? null : { label: 'Source', value: v.origin.source.label, why: `From ${v.origin.source.from}.` },
        v.origin?.introducer === undefined ? null : { label: 'Introducer', value: v.origin.introducer === null ? null
          : h`<a href="${v.origin.introducer.href}">${v.origin.introducer.firm_name}</a>` },
      ], v.edit === undefined ? undefined : { href: '#change-claim' })}</div>
      ${teamBlock(v)}
      ${v.estimated_fee === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Our estimated fee</div>
        <p>${v.estimated_fee.known ? h`<strong>${v.estimated_fee.amount}</strong> — ${v.estimated_fee.reading}` : h`<strong>${v.estimated_fee.reading}</strong>`}</p>
        <p class="${v.estimated_fee.gate.outcome === 'FIRE' ? 'flag' : 'help'}">${v.estimated_fee.gate.reading}. <span class="help">${v.estimated_fee.gate.placeholder_caveat}</span></p>
        <p class="help">${v.estimated_fee.basis} No fee invoice is raised on this claim yet; once one is, the money below carries it.</p></div>`}

      ${v.fee_discounts === undefined ? raw('') : h`<div class="pblock"><div class="pnum">A multi-site discount</div>
        ${v.fee_discounts.length === 0
          ? h`<p class="help">None proposed. A discount is discretionary and never applied automatically; the largest discount and who approves it are not decided.</p>`
          : h`<table><thead><tr><th>Proposed</th><th>Why</th><th>Recorded</th><th>State</th></tr></thead><tbody>${v.fee_discounts.map((x) => h`<tr>
              <td>${x.discount}</td><td>${x.reason}</td><td class="when">${x.recorded}</td><td><strong>${x.state === 'AWAITING_CEILING_AND_APPROVER' ? 'AWAITING THE DECISION' : 'NOT APPLIED'}</strong><br><span class="help">${x.says}</span></td></tr>`)}</tbody></table>`}</div>`}
      ${v.overview === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Overview</div>${fields([
        { label: 'Workstream', value: v.overview.workstream.label },
        { label: 'Priority', value: v.overview.priority.label },
        { label: 'Surveyor', value: v.overview.surveyor, why: v.overview.surveyor_reach },
        { label: 'Acquired', value: v.overview.acquisition_date === null ? null : ukDate(v.overview.acquisition_date) },
        { label: 'Acquisition price', value: v.overview.acquisition_price },
        { label: 'Tenure', value: v.overview.tenure.label },
        { label: 'Jurisdiction', value: v.overview.jurisdiction },
        // A fact that decides something: "not known" is an answer, and it stays.
        { label: 'Allowances claimed before?', value: v.overview.existing_ca_claimed.label, keep: true },
        { label: 'Expected completion', value: v.overview.expected_completion === null ? null : ukDate(v.overview.expected_completion) },
        { label: 'Hold reason', value: v.overview.hold_reason },
        { label: 'Lost reason', value: v.overview.lost_reason },
      ], v.edit === undefined ? undefined : { href: '#change-claim' })}</div>`}
      <div id="move">${pipe}</div>
      <div id="claim-facts">${factsBlock(v.id, v.facts)}</div>
      <div id="claim-figures">${figuresBlock(v.id, v.figures)}</div>
      ${v.value === undefined ? raw('') : h`<div class="pblock"><div class="pnum">The value</div>${valuePanel(v.value)}</div>`}
      ${v.edit === undefined ? raw('') : h`<div class="pblock" id="change-claim"><div class="pnum">Change the claim</div>
        <div class="help">The stage is not changed here.${why('It moves through the operating procedure’s gates, under Stage and moves above.')}</div>
        <form method="post" action="/staff/claims/${v.id}">
          <label>Owner <select name="owner_id">${people(v.edit.owners, v.edit.current.owner_id, 'nobody yet')}</select></label>
          <label>Surveyor <select name="surveyor_id">${people(v.edit.surveyors, v.edit.current.surveyor_id, 'none named')}</select></label>
          <label>Priority <select name="priority">${options(vocabulary(d.app.db, 'PRIORITY', v.edit.current.priority), v.edit.current.priority, 'not set')}</select></label>
          <label>Workstream <select name="workstream">${options(C.WORKSTREAMS, v.edit.current.workstream, null)}</select></label>
          <label>Property <select name="property_id">${people(v.edit.properties.map((p) => ({ id: p.id, name: p.label })), v.edit.current.property_id, 'none recorded')}</select></label>
          <label>Expected completion <input name="expected_completion" type="date" value="${v.edit.current.expected_completion ?? ''}"></label>
          <label>Hold reason <input name="hold_reason" value="${v.edit.current.hold_reason ?? ''}"></label>
          <label>Lost reason <input name="lost_reason" value="${v.edit.current.lost_reason ?? ''}"></label>
          <button type="submit">Save</button></form></div>`}` },
        { id: 'related', label: 'Related', count: related, body: h`
      <div id="claim-documents">${docs}</div>
      ${v.money === undefined ? raw('') : h`<div class="pblock"><div class="pnum">Money</div>
        <p class="help">This claim's own invoices. Recorded, not collected.</p>
        ${v.money.length === 0 ? h`<p class="help">No invoice is raised on this claim.</p>` : h`<table>
          <thead><tr><th>Number</th><th>For</th><th>Amount</th><th>Invoice</th><th>Money</th><th>Outstanding</th><th>Due</th><th>VAT</th></tr></thead>
          <tbody>${v.money.map((m) => h`<tr><td>${m.number ?? 'unnumbered'}</td><td>${m.kind}</td><td>${m.fee}</td><td>${m.invoice_status}</td>
            <td>${m.payment_status}</td><td>${m.outstanding}</td><td>${m.due}</td><td>${m.vat_position}</td></tr>`)}</tbody></table>`}</div>`}
      ${v.contacts === undefined ? raw('') : h`<div class="pblock"><div class="pnum">The organisation's contacts</div>
        ${v.contacts.length === 0 ? h`<p class="help">No contact is recorded.</p>` : h`<table><tbody>${
          v.contacts.map((c) => h`<tr><td>${c.name}</td><td>${c.type}</td><td>decision maker: ${c.decision_maker}</td></tr>`)}</tbody></table>`}</div>`}
      <div id="claim-deliverables">${deliverablesBlock(v.id, v.deliverables)}</div>
      ${aftercareBlock(v.id, v.aftercare)}` },
        { id: 'activity', label: 'Activity', body: h`
      <div id="claim-tasks">${tasks}</div>
      <div id="claim-email">${email}</div>
      ${timelineBlock(v.timeline)}
      <div id="claim-notes">${notes}</div>` },
      ]), sidePanel(nextAction, quick, raw(''), step === null ? raw('') : nextStepCard(step)))}

      ${dataLink(actor, `/staff/claims/${v.id}/view.json`)}`,
  });
}
