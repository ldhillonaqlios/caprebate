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

import { checksPanelIfPermitted } from './approvals.ts';
import { checksSummary, claimChecksBlock, STEP_ANCHOR } from './approvals-pages.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import * as C from './crm.ts';
import type * as F from './claim-facts.ts';
import type { PipelinePanel } from './pipeline.ts';
import { enquiryBlock } from './pipeline-pages.ts';
import { authorise, can } from '../authz.ts';
import { addStaffEvent, eventsOnClaim, EVENT_KINDS, KIND_WORDS, type EventOnClaim } from './property-events.ts';
import { poundsWords } from './pack-sums.ts';
import { claimTasksBlock, emailBlock, newTaskForm, notesBlock, timelineBlock } from './tasks-pages.ts';
import { mayCreateTask, taskOwnerChoices } from './tasks.ts';
import { timelineIfPermitted, type Timeline } from './timeline.ts';
import { activeTemplates } from './templates.ts';
import { claimDocumentsBlock, placeDocumentsBlock } from './documents-pages.ts';
import * as LI from './lists.ts';
import { taskChoices, vocabulary } from './vocabularies.ts';
import { listControls, mayShareViews, requestParams, sortHeading, type SortBy } from './lists-pages.ts';
import { aftercareBlock, deliverablesBlock, factsBlock, figuresBlock, grantsBlock } from './claim-record-pages.ts';
import { addUnderCurrent, opens } from './navigation.ts';
import { nobodyBadge, stageBadge } from './look.ts';
import { assertClientsSection } from './engaged.ts';
import { badge, brandName, breadcrumb, claimHref, claimName, claimRef, claimStageBar, claimTiles, dataLink, propertyIn, fields, highlights, moreDetail, nextStepCard, recordLayout, savedMessage, section, sidePanel, statusFromNeeds, why, type Need, type QuickAction, type SectionContext, type SectionSpec } from './components.ts';
import { sectionPrefs } from './sections.ts';
import { plainNeed } from './next-step.ts';
import { openClaimQuestions } from './engaged.ts';
import { claimNextStep } from './next-step.ts';
import { dueWords, localStamp, ukDate } from './localtime.ts';
import { nameSwitches, navContext } from './navigation.ts';
import * as SI from './site-area-inputs.ts';
import * as TH from './title-by-hand.ts';
import * as SO from './survey-open.ts';
import { earlyWindowWarning } from './claim-facts.ts';
import { portalStepLine } from './portal-steps.ts';
import { accountantConfirmBlock } from './accountant-confirm-pages.ts';

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

/**
 * PHASE 154a1 (line 5), 4 October 2026 — WHERE A SAVED CONTACT GOES BACK TO: the page of whoever the contact belongs to,
 * read from the contact itself. It was the business_id the form posted, so a post without one went to
 * /staff/clients/?done=contact, a 404 (the 3 October sweep), and a wrong one went to somebody else's page.
 */
function contactHome(db: CrmPageDeps['app']['db'], contact_id: string): string {
  const c = db.get<{ business_id: string | null; lead_id: string | null; introducer_id: string | null }>(
    'SELECT business_id, lead_id, introducer_id FROM contacts WHERE id = ?', [contact_id]);
  if (c?.business_id) return `/staff/clients/${c.business_id}`;
  if (c?.lead_id) return `/staff/leads/${c.lead_id}`;
  if (c?.introducer_id) return `/staff/introducers/${c.introducer_id}`;
  return '/staff/clients';
}

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
  /* PHASE 135: the organisations list is the one Clients list now. The address stays alive and asks the gate it always
     asked, so a login refused the list is refused here rather than sent on. */
  if (path === '/staff/organisations' && method === 'GET') {
    C.assertOrganisationSection(actor);
    redirect(res, `/staff/clients${url.search}`);
    return 'handled';
  }

  // THE CRM FOLLOW-ON: the organisation serves the object its page is drawn from, as the property and the claim do, so
  // the firm that referred it can be seen on the wire. ADMIN and SALES; everyone else refused by `organisation.read`.
  const orgJson = /^\/staff\/organisations\/([A-Za-z0-9-]+)\/view\.json$/.exec(path);
  if (orgJson && method === 'GET') {
    json(res, 200, C.organisationView(db, actor, orgJson[1] ?? ''));
    return 'handled';
  }

  /* PHASE 134 — ONE CLIENT PAGE PER COMPANY, at /staff/clients/:id (src/web/client-page.ts). This address stays alive:
     it is asked exactly as it always was — a login refused the organisation is refused here, not redirected — and then
     sends the reader to the one page. The query (?done=…) travels with it. */
  const org = /^\/staff\/organisations\/([A-Za-z0-9-]+)$/.exec(path);
  if (org && method === 'GET') {
    const v = C.organisationView(db, actor, org[1] ?? '');
    redirect(res, `/staff/clients/${v.id}${url.search}`);
    return 'handled';
  }
  if (org && method === 'POST') {
    const id = org[1] ?? '';
    const r = C.updateOrganisation(deps, actor, id, posted(await form(req), ORGANISATION_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/clients/${id}#details`, r.field);
    redirect(res, `/staff/clients/${id}?done=saved#details`);
    return 'handled';
  }

  const addContact = /^\/staff\/organisations\/([A-Za-z0-9-]+)\/contacts$/.exec(path);
  if (addContact && method === 'POST') {
    const id = addContact[1] ?? '';
    const r = C.addContact(deps, actor, id, posted(await form(req), CONTACT_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Contact not added', r.why, `/staff/clients/${id}#contacts`, r.field);
    redirect(res, `/staff/clients/${id}?done=contact#contacts`);
    return 'handled';
  }

  const contact = /^\/staff\/contacts\/([A-Za-z0-9-]+)$/.exec(path);
  if (contact && method === 'POST') {
    const f = await form(req);
    const back = contactHome(db, contact[1] ?? '');
    const r = C.updateContact(deps, actor, contact[1] ?? '', posted(f, CONTACT_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Contact not saved', r.why, `${back}#contacts`);
    redirect(res, `${back}?done=contact#contacts`);
    return 'handled';
  }

  const addProperty = /^\/staff\/organisations\/([A-Za-z0-9-]+)\/properties$/.exec(path);
  if (addProperty && method === 'POST') {
    const id = addProperty[1] ?? '';
    const r = C.addProperty(deps, actor, id, posted(await form(req), ['label', 'postcode']));
    if (!r.ok) return d.problem(res, actor, 'Property not added', r.why, `/staff/clients/${id}#properties`, r.field);
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
      // PHASE 151c: the site area's point and councils. Everyone who reads the property reads it; the forms are Admin's or Sales's, after signing.
      site: SI.sitePointView(db, actor, v.id),
      title: TH.titleByHandView(db, actor, v.id),
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

  /* PHASE 151c: THE SITE AREA'S POINT AND A NEIGHBOURING COUNCIL (src/web/site-area-inputs.ts). Admin or Sales, only once
     the engagement letter is signed — both asked there, on the server. Saving sends nothing anywhere. */
  const sitePoint = /^\/staff\/properties\/([A-Za-z0-9-]+)\/site-point$/.exec(path);
  if (sitePoint && method === 'POST') {
    const id = sitePoint[1] ?? '';
    const f = await form(req);
    const r = SI.enterSitePoint(deps, actor, id, { easting: f.get('easting'), northing: f.get('northing') });
    if (!r.ok) return d.problem(res, actor, 'The point was not saved', r.why, `/staff/properties/${id}#site-point`);
    redirect(res, `/staff/properties/${id}?done=site-point#site-point`);
    return 'handled';
  }
  const siteCouncil = /^\/staff\/properties\/([A-Za-z0-9-]+)\/site-council$/.exec(path);
  if (siteCouncil && method === 'POST') {
    const id = siteCouncil[1] ?? '';
    const r = SI.addNeighbourCouncil(deps, actor, id, (await form(req)).get('lad_code'));
    if (!r.ok) return d.problem(res, actor, 'The council was not added', r.why, `/staff/properties/${id}#site-point`);
    redirect(res, `/staff/properties/${id}?done=site-council#site-point`);
    return 'handled';
  }

  /* PHASE 146k: THE TITLE REGISTER, BY HAND (src/web/title-by-hand.ts). Admin or Sales, once the letter is signed —
     both asked there, on the server. Recording it sends nothing anywhere; taking it back asks why. */
  const titleHand = /^\/staff\/properties\/([A-Za-z0-9-]+)\/title-register(\/take-back)?$/.exec(path);
  if (titleHand && method === 'POST') {
    const id = titleHand[1] ?? '';
    const f = await form(req);
    const r = titleHand[2] === undefined
      ? TH.recordTitleByHand(deps, actor, id, {
        title_number: f.get('title_number'), tenure: f.get('tenure'), price_paid: f.get('price_paid'),
        transaction_date: f.get('transaction_date'), restriction_count: f.get('restriction_count'),
        proprietor_company_number: f.get('proprietor_company_number'), prior_owner_count: f.get('prior_owner_count'),
        owner_person_name: f.get('owner_person_name'),
      })
      : TH.takeBackTitleByHand(deps, actor, id, f.get('reason'));
    if (!r.ok) return d.problem(res, actor, titleHand[2] === undefined ? 'Not saved' : 'Not taken back', r.why, `/staff/properties/${id}#title-register`, r.field);
    if (titleHand[2] !== undefined && (r.look_again ?? []).length > 0) {
      html(res, 200, page({ title: 'Taken back', nav: d.nav(actor), body: h`<h1>Taken back</h1><p class="say">${r.why}</p>
        <ul>${(r.look_again ?? []).map((l) => h`<li>${l.words}</li>`)}</ul><p><a href="/staff/properties/${id}#title-register">Back to the property</a></p>` }));
      return 'handled';
    }
    redirect(res, `/staff/properties/${id}?done=${titleHand[2] === undefined ? 'title-recorded' : 'title-taken-back'}#title-register`);
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
    html(res, 200, renderClaim(d, actor, C.claimView(db, actor, claim[1] ?? '', { now: d.app.now() }), done));
    return 'handled';
  }
  if (claim && method === 'POST') {
    const id = claim[1] ?? '';
    const r = C.updateClaim(deps, actor, id, posted(await form(req), CLAIM_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/claims/${id}`, r.field);
    redirect(res, `/staff/claims/${id}?done=saved`);
    return 'handled';
  }

  /* ----------------------------------------------- PHASE 159c: an event on the claim's building */
  const addEvent = /^\/staff\/claims\/([A-Za-z0-9-]+)\/events$/.exec(path);
  if (addEvent && method === 'POST') {
    const id = addEvent[1] ?? '';
    const row = C.loadClaimRow(db, id);
    authorise(actor, 'claim.write', C.claimObjFor(db, row));
    if (row.property_id === null) return d.problem(res, actor, 'Not added', 'This claim has no building yet. Choose its property first.', `/staff/claims/${id}`);
    const f = await form(req);
    const at = d.app.now();
    const r = db.tx(() => {
      const out = addStaffEvent(db, d.newId, at, actor.id, { property_id: row.property_id as string, business_id: row.business_id },
        { kind: f.get('kind') ?? '', date: f.get('date') ?? '', cost: f.get('cost') ?? '' });
      if (out.ok) d.app.audit.append({ at, kind: 'PROPERTY_EVENT_ADDED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'claim', object_id: id, detail: { event: out.id, property: row.property_id as string, kind: f.get('kind') ?? '' } });
      return out;
    });
    if (!r.ok) return d.problem(res, actor, 'Not added', r.why, `/staff/claims/${id}#claim-events`, r.field);
    redirect(res, `/staff/claims/${id}?done=event#claim-events`);
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

/**
 * PHASE 159c: each event on the claim's building — what it was, when, what it cost and its own "up to" (for a login that
 * may read the claim's value), and the documents that prove it, each with whether we hold one. Then a form to add one.
 */
function eventsBlock(claim_id: string, evs: readonly EventOnClaim[], value: boolean, mayAdd: boolean): Safe {
  return h`${evs.length === 0 ? h`<p class="help">Nothing is recorded yet. The assessment records the purchase and any work since; add anything it missed below.</p>`
    : h`<ol class="events">${evs.map((e) => h`<li><p><strong>${e.words}</strong>, ${e.when}${value ? `, ${e.cost_pence === null ? 'cost not known' : `${poundsWords(e.cost_pence)}`}` : ''}${e.source === 'STAFF' ? ' (added on the claim)' : ''}</p>
      ${value ? h`<p class="help">${e.ceiling_pence === null ? `No figure for this one yet. ${e.ceiling_why ?? ''}` : `Up to ${poundsWords(e.ceiling_pence)} on the sector’s range for this kind of spend, until the survey prices it.`}</p>` : raw('')}
      <p class="help">Its documents: ${e.documents.map((x, i) => h`${i === 0 ? '' : '; '}${x.label} (${x.held === 0 ? 'not received yet' : `${String(x.held)} held`})`)}.</p></li>`)}</ol>`}
    ${!mayAdd ? raw('') : h`<details class="morelist"><summary>Add an event</summary>
      <form method="post" action="/staff/claims/${claim_id}/events" class="stack">
        <label class="fl" for="ev-kind">What happened</label>
        <select class="fi" id="ev-kind" name="kind" required><option value="">Choose…</option>${EVENT_KINDS.map((k) => h`<option value="${k}">${KIND_WORDS[k]}</option>`)}</select>
        <label class="fl" for="ev-date">When (month and year, like 06/2025, or the year)</label>
        <input class="fi" id="ev-date" name="date" placeholder="MM/YYYY">
        <label class="fl" for="ev-cost">What it cost, in pounds (leave empty if not known)</label>
        <input class="fi" id="ev-cost" name="cost" inputmode="decimal" placeholder="£">
        <button class="cta" type="submit">Add the event</button>
      </form></details>`}`;
}

/**
 * THE CLAIM PAGE, FOR A VIEW ALREADY AUTHORISED — PHASE 134. The same page is drawn at /staff/claims/:id and inside its
 * company's page at /staff/clients/:company/claims/:id (src/web/client-page.ts): the company is the frame either way.
 */
export function renderClaim(d: CrmPageDeps, actor: Actor, v: C.ClaimView, done: string | undefined, step?: string): string {
  const db = d.app.db;
  const biz = v.client.business_id;
  const mayEmail = can(actor, 'email.queue', { type: 'email', id: v.id, business_id: biz });
  const contacts = mayEmail && can(actor, 'contact.read', { type: 'contact', id: biz, business_id: biz })
    ? C.contactsFor(db, actor, biz).map((c) => ({ id: c.id, name: c.full_name, email: c.email }))
    : undefined;
  return claimPage(d, actor, v, done, {
    templates: mayEmail ? activeTemplates(db, actor) : [],
    contacts,
    may_note: can(actor, 'internal_note.write', { type: 'internal_note', id: biz, business_id: biz }),
    ...(step !== undefined && STEP_ANCHOR.test(step) ? { step } : {}),
  });
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
    ? h`<dl><dt>The figure the client was shown</dt><dd>${v.shown_range}</dd>
        <dt>Estimated spend that counts</dt><dd>${v.qualifying_expenditure}</dd>
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

/**
 * PHASE 159a: ONE VERSION AFTER SIGN-OFF, ON THE CLAIM PAGE. Once the figures are fixed it says so; an admin gets
 * "Reopen the valuation", with what that sets aside; and after a reopen, what it set aside and why.
 */
function valuationBlock(id: string, v: NonNullable<PipelinePanel['valuation']>, reopen: { readonly words: string } | null): Safe {
  if (v.locked === null && v.reopened === null) return raw('');
  return h`<div id="valuation" class="help">
    ${v.locked === null ? raw('') : h`<p><strong>The figures are fixed.</strong> ${v.locked}</p>`}
    ${v.reopened === null ? raw('') : h`<p><strong>The valuation was reopened</strong> ${v.reopened.at} by ${v.reopened.who}, back to ${v.reopened.to}. Why: ${v.reopened.reason}.
      It set aside the sign-off, the reports, the client’s acceptance and any defence pack. Each is done again on the new figures.</p>`}
    ${reopen === null ? raw('') : h`<form method="post" action="/staff/claims/${id}/stage">
      <input type="hidden" name="kind" value="REOPEN"><input type="hidden" name="to" value="VALUATION">
      <p>${reopen.words}</p>
      <label>Why it must change <input name="reason" required></label>
      <button type="submit">Reopen the valuation</button></form>`}
  </div>`;
}

function pipelineBlock(id: string, p: PipelinePanel | undefined, owners: readonly Owner[] = []): Safe {
  if (p === undefined) return raw('');
  const m = p.moves;
  // PHASE 133c (B2): the ten stages are drawn once, in the stage bar at the top of the page, so this panel no longer lists
  // them a second time. Everything the gate reads — the procedure's words, each need and its reading, what the client's
  // portal shows, the fee trigger and the claimable figure — is still here, behind "See everything this stage needs".
  return h`<div class="pblock">
    <p>Stage: <strong>${p.stage.label}</strong></p>
    ${p.hold === undefined ? raw('') : h`<p class="help">On hold — ${p.hold.reason ?? 'no reason recorded'}. It returns to ${p.hold.returns_to}.</p>`}
    ${p.steps.length === 0 ? h`<p class="help">No step set yet — pick the claim’s step.</p>`
      : p.steps.some((s) => s.state === 'exited') ? h`<p class="help">It left the steps at ${p.steps.find((s) => s.state === 'exited')?.label ?? ''}.</p>` : raw('')}
    ${p.gate === undefined && p.portal === undefined ? raw('') : h`<details id="stage-needs"><summary>See everything this stage needs</summary>
    ${p.gate === undefined ? raw('') : h`<h3>Moving on from ${p.gate.label}: ${p.gate.open ? badge('Ready', 'ok') : badge('Not ready yet')}</h3>
      <p class="help">What this step needs: “${brandName(p.gate.procedure_gate)}” Who owns this step: ${brandName(p.gate.owner)}</p>
      <table><tbody>${p.gate.needs.map((n) => h`<tr><td>${n.met ? 'Done' : 'Still needed'}</td><td>${n.what}</td><td>${n.why}</td></tr>`)}</tbody></table>`}
    ${p.portal === undefined ? raw('') : h`<div class="help">The client’s page shows “${p.portal.shows_key === null ? p.portal.shows : portalStepLine(p.portal.shows_key, nameSwitches().portalSteps)}”.${why(h`${p.portal.this_claim_evidences === null ? 'This claim’s stage matches no step on the client’s page.'
        : `This claim’s stage matches “${p.portal.evidences_key === null ? p.portal.this_claim_evidences : portalStepLine(p.portal.evidences_key, nameSwitches().portalSteps)}” on the client’s page.`} A move raises the client’s step and never lowers it.`)}</div>`}
    </details>`}
    ${p.enquiry === undefined ? raw('') : h`<div id="enquiry-gate">${enquiryBlock(p.enquiry, m?.may_record === true ? `/staff/claims/${id}/checks` : null)}</div>`}
    ${p.confirmations === undefined || p.confirmations.length === 0 ? raw('') : h`<h3>Confirmations at this stage</h3>
      <table><tbody>${p.confirmations.map((c) => h`<tr><td>${c.label}</td><td>${c.recorded === null
        ? h`<span class="help">not confirmed since the claim entered this stage</span>` : h`confirmed ${c.recorded}`}</td>
        <td>${c.recorded === null && m?.may_record === true ? h`<form method="post" action="/staff/claims/${id}/milestones" class="inline">
          <input type="hidden" name="milestone" value="${c.key}"><input name="note" placeholder="note" aria-label="A note on ${c.label}">
          <button type="submit">Confirm</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}
    ${p.claimable_figure === undefined ? raw('') : h`<div class="help">A claimable figure for the client: ${p.claimable_figure.released
      ? 'released' : 'not released yet'}.${p.claimable_figure.released ? raw('') : why(p.claimable_figure.why)}</div>`}
    ${p.valuation === undefined ? raw('') : valuationBlock(id, p.valuation, m?.reopen_valuation ?? null)}
    ${p.fee_trigger === undefined ? raw('') : h`<div class="help">When our fee is due: ${p.fee_trigger.reading}.${why(h`${
      p.fee_trigger.decided ? 'This is decided.' : 'This is the most cautious reading, while it is undecided.'} The open question: “${p.fee_trigger.question}”`)}</div>`}
    ${m === undefined ? raw('') : h`<h3>Move the claim</h3>
      <div class="help">A move is checked again when you press the button.${why('Each step is checked before a claim can move on. If it is not ready, the move is refused.')}</div>
      ${m.forward === null ? raw('') : h`<form method="post" action="/staff/claims/${id}/stage">
        <input type="hidden" name="kind" value="FORWARD"><input type="hidden" name="to" value="${m.forward.to}">
        <label>Note <input name="reason"></label>${nextActionFields(owners)}
        <button type="submit">Move to ${m.forward.label}${m.forward.open ? '' : ' (not ready yet)'}</button></form>`}
      ${m.exits.length === 0 && !m.may_hold && m.resume === null && m.reopen.length === 0 ? raw('') : moreDetail(h`
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
        <button type="submit">Reopen</button></form>`}`, 'Other moves: close it, put it on hold, resume or reopen')}`}
    ${p.history === undefined ? raw('') : moreDetail(p.history.length === 0 ? h`<p class="help">No move is recorded.</p>`
      : h`<table class="stack"><thead><tr><th>When</th><th>What</th><th>From</th><th>To</th><th>Who</th><th>Reason</th></tr></thead>
        <tbody>${p.history.map((x) => h`<tr><td>${x.at}</td><td data-label="What">${x.what}</td><td data-label="From">${x.from}</td><td data-label="To">${x.to}</td><td data-label="Who">${x.who}</td>
          <td data-label="Reason">${x.reason ?? ''}${x.note === null ? raw('') : h`<br><span class="help">${x.note}</span>`}</td></tr>`)}</tbody></table>`, 'Every move so far')}
  </div>`;
}

/**
 * PHASE 134 — A COMPANY'S CLAIMS AS TILES: the property and its town, the stage, the next action, and the reference as a
 * small grey label. Each opens the claim inside its company's page.
 */
export function claimTilesFor(claims: readonly C.ClaimSummary[], empty = 'No claim you may open is recorded here.', company = ''): Safe {
  return claimTiles(claims.map((c) => ({
    href: claimHref(c.business_id, c.id), property: propertyIn(company, c.property), town: c.town, stage: c.stage,
    next_action: c.next_action, next_due: c.next_action_due === null ? null : due(c.next_action_due), ref: c.claim_ref,
  })), empty);
}

/* ------------------------------------------------------------------ *
 * ORGANISATIONS
 * ------------------------------------------------------------------ */

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

/**
 * PHASE 134 — THE ORGANISATION'S SECTIONS, FOR THE ONE CLIENT PAGE. Until 18 September 2026 these were a page of their
 * own at /staff/organisations/:id, beside a second page for the same company at /staff/clients/:id. They are now drawn
 * inside the one client page (src/web/client-page.ts), from the same view, asked of the same rules: nothing is read that
 * the organisation page did not read before.
 */
export type OrganisationSections = {
  readonly details: Safe;
  readonly contacts: Safe;
  readonly contact_count: number | undefined;
  readonly properties: Safe;
  readonly documents: Safe;
  readonly tasks: Safe;
  readonly quick: readonly QuickAction[];
};

export function organisationSections(
  d: CrmPageDeps, actor: Actor, v: C.OrganisationView,
  x: { owners: readonly Owner[] | null; may_note: boolean },
): OrganisationSections {
  const details = h`
      ${v.client_status.do_not_contact
        ? h`<div class="gate"><strong>Do not contact.</strong> Nothing can be sent to this company or to any address it holds.${
          why('Our system blocks every email to them.')}</div>`
        : raw('')}
      <div class="pblock">${fields([
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
          why: 'Read from the company’s leads, never typed here.' },
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
      </div>`;

  // PHASE 138: ONE CARD PER CONTACT instead of a nine-column table that scrolled sideways on a phone. The card shows what
  // is used every week — name, job, email, telephone, next follow-up; the type, decision maker, last contact and notes sit
  // under "More detail" on the card. The same fields, from the same view.
  const contacts = h`
      <div class="pblock">
      ${v.contacts === null ? h`<p class="help">Contacts are not shown to this role.</p>` : h`
        ${v.contacts.length === 0 ? h`<p class="empty">No contact is recorded yet.</p>` : h`<ul class="contactcards">${v.contacts.map((c) => h`<li class="contactcard">
          <p class="cname">${c.full_name}</p>
          ${c.job_title === null || c.job_title === '' ? raw('') : h`<p class="help">${c.job_title}</p>`}
          <p>${c.email === null || c.email === '' ? h`<span class="help">No email</span>` : h`${c.email}`}</p>
          <p>${c.phone === null || c.phone === '' ? h`<span class="help">No telephone</span>` : h`${c.phone}`}</p>
          <p class="help">Next follow-up: ${c.next_follow_up_at !== null ? h`${c.next_follow_up_at}` : c.follow_ups_open === 0 ? 'none yet' : 'one open, with no date'}</p>
          ${moreDetail(h`<dl><dt>Type</dt><dd>${c.contact_type.label}</dd><dt>Decision maker</dt><dd>${c.is_decision_maker.label}</dd>
            <dt>Last contact</dt><dd>${c.last_contact}</dd><dt>Notes</dt><dd>${orNot(c.notes, 'none')}</dd></dl>`)}
          ${v.may_write ? h`<details><summary>Change ${c.full_name}</summary>
            ${contactForm(`/staff/contacts/${c.id}`, v.id, c, 'Save contact')}</details>` : raw('')}</li>`)}</ul>`}
        ${v.may_write ? h`<details><summary>Add a contact</summary>
          <p class="help">A client's accountant or adviser is a contact, and never has a login.</p>
          ${contactForm(`/staff/organisations/${v.id}/contacts`, v.id, null, 'Add contact')}</details>` : raw('')}`}
      </div>`;

  const properties = h`
      <div class="pblock">
      ${v.properties.length === 0 ? h`<p class="empty">No property is recorded yet.</p>` : h`<table class="stack">
        <thead><tr><th>Property</th><th>Postcode</th><th>Jurisdiction</th><th>Claims</th></tr></thead>
        <tbody>${v.properties.map((p) => h`<tr><td><a href="/staff/properties/${p.id}">${p.label}</a></td>
          <td data-label="Postcode">${orNot(p.postcode)}</td><td data-label="Jurisdiction">${p.jurisdiction}</td><td data-label="Claims">${p.claims}</td></tr>`)}</tbody></table>`}
      ${v.may_write ? h`<details><summary>Add a property</summary>
        <form method="post" action="/staff/organisations/${v.id}/properties">
          <label>Name of the site or building <input name="label" required></label>
          <label>Postcode <input name="postcode"></label>
          <button type="submit">Add property</button></form></details>` : raw('')}
      <p class="help">To open a claim, open the property and choose “Open claim”.</p>
      </div>`;

  const tasks = x.owners === null ? raw('') : h`<div class="pblock" id="org-tasks">${newTaskForm(
    taskChoices(d.app.db), { business_id: v.id }, x.owners, `/staff/clients/${v.id}`, 'Add a task, or a follow-up with a contact',
    (v.contacts ?? []).map((c) => ({ id: c.id, name: c.full_name })))}</div>`;

  return {
    details, contacts, contact_count: v.contacts === null ? undefined : v.contacts.length, properties,
    documents: placeDocumentsBlock(v.documents, null, false), tasks,
    quick: [
      ...(x.owners === null ? [] : [{ href: '#add-task', label: 'Log a call or add a follow-up' }]),
      ...(v.may_write ? [{ href: '#contacts', label: 'Add a contact' }, { href: '#properties', label: 'Add a property' }] : []),
      // PHASE 142: a note is a message on the company's "Team only" chat.
      ...(x.may_note ? [{ href: `/staff/clients/${v.id}?chat=team#chat`, label: 'Message your team' }] : []),
    ],
  };
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

/**
 * PHASE 151c: WHERE THE SITE IS, FOR ITS AREA. The point the land boundary is read at, and the councils whose files are
 * read, with who entered each and when; and, for Admin or Sales once the letter is signed, the two forms.
 */
function sitePointBlock(id: string, s: SI.SitePointView): Safe {
  const pointWords = s.point !== null
    ? `Easting ${s.point.easting}, northing ${s.point.northing}. Entered by ${s.point.by}, ${ukDate(s.point.at)}.`
    : s.homedata_point ? 'The easting and northing from the paid address lookup.' : 'Not known yet.';
  return h`<div class="pblock" id="site-point"><div class="pnum">Where the site is, for its area</div>
    <div class="help">We work out the site's area from HM Land Registry's land boundary, at one point on the site, when
    the research is run. The boundary is for our own checks and never goes in a report.${why('A point is an easting and a northing in metres, as on an Ordnance Survey map. A point you enter here is used before the one from the paid address lookup. A site on the line between two councils can be in either council’s file, so add the other council and both are read.')}</div>
    ${fields([
      { label: 'The point', value: pointWords, keep: true },
      { label: 'Council from the postcode', value: 'name' in s.own_council ? s.own_council.name : `Not known: ${s.own_council.why}`, keep: true },
      { label: 'Councils added', value: s.councils.length === 0 ? null : s.councils.map((c) => `${c.name} (added by ${c.by}, ${ukDate(c.at)})`).join('; ') },
    ])}
    ${s.may_enter ? h`
      <form method="post" action="/staff/properties/${id}/site-point">
        <label>Easting, in metres <input name="easting" inputmode="decimal" autocomplete="off" required></label>
        <label>Northing, in metres <input name="northing" inputmode="decimal" autocomplete="off" required></label>
        <button type="submit">Save the point</button></form>
      <form method="post" action="/staff/properties/${id}/site-council">
        <label>Also read this council's file <select name="lad_code">${s.choices.map((c) => h`<option value="${c.lad_code}">${c.name}</option>`)}</select></label>
        <button type="submit">Add the council</button></form>`
      : s.why_not === null ? raw('') : h`<p class="help">${s.why_not}</p>`}
  </div>`;
}

/**
 * PHASE 146k: THE TITLE REGISTER, BY HAND. What stands, with who typed it and when; entries taken back, with why; and,
 * for Admin or Sales once the letter is signed, the form — or the take-back, where one stands.
 */
function titleBlock(id: string, t: TH.TitleByHandView): Safe {
  return h`<div class="pblock" id="title-register"><div class="pnum">The title register, by hand</div>
    <div class="help">We do not look the title register up by computer. Buy the official copy and the title plan from
    HM Land Registry, upload them, and type in what they say.${why('Only the facts below are kept. We never type an owner’s name: where the owner is a person, leave it out. Where the owner is a company, its company number is enough. A person reads the upload. Our reader never does.')}</div>
    ${t.copies.length === 0 ? h`<p class="help">No official copy uploaded yet.</p>`
      : h`<p>Uploaded: ${t.copies.map((c, i) => h`${i === 0 ? '' : ', '}<a href="/staff/documents/${c.id}">${c.label}</a> (${ukDate(c.at)})`)}</p>`}
    ${t.may_upload ? h`<form method="post" action="/staff/clients/${t.business_id}/files" enctype="multipart/form-data" class="uploadbox">
      <input type="hidden" name="type_code" value="${TH.OFFICIAL_COPY_TYPE}">
      <label class="dropzone" for="oc-file-${id}"><span class="dropwords">Upload the official copy or the title plan</span>
        <input id="oc-file-${id}" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg"></label>
      <button type="submit">Upload</button></form>` : raw('')}
    ${t.standing === null ? h`<p class="help">Nothing recorded yet.</p>` : h`${fields(t.standing.lines.map((l) => ({ label: l.label, value: l.value, keep: true })))}
      <p class="help">Entered by hand by ${t.standing.by}, ${ukDate(t.standing.at)}.</p>`}
    ${t.taken_back.map((x) => h`<p class="help">Title ${x.title_number} was taken back by ${x.by}, ${ukDate(x.at)}: ${x.reason}</p>`)}
    ${!t.may_record ? (t.why_not === null ? raw('') : h`<p class="help">${t.why_not}</p>`)
      : t.standing !== null ? h`<details class="undo"><summary>Take this back</summary>
        <form method="post" action="/staff/properties/${id}/title-register/take-back">
          <label>Why? <input name="reason" required maxlength="2000"></label> <button type="submit">Take it back</button></form></details>`
      : h`<form method="post" action="/staff/properties/${id}/title-register">
        <label>Title number <input name="title_number" required autocomplete="off"></label>
        <label>Freehold or leasehold <select name="tenure"><option value="">Not stated</option><option value="freehold">Freehold</option><option value="leasehold">Leasehold</option></select></label>
        <label>Price paid, in pounds <input name="price_paid" inputmode="decimal" autocomplete="off"></label>
        <label>Date of that price <input name="transaction_date" type="date"></label>
        <label>How many restrictions <input name="restriction_count" inputmode="numeric" autocomplete="off"></label>
        <label>Owner’s company number, if the owner is a company <input name="proprietor_company_number" autocomplete="off"></label>
        <label>Owner’s name, if the owner is a person <input name="owner_person_name" autocomplete="off" maxlength="200"></label>
        <p class="help">We check the name against the client’s own people and keep only yes or no. The name itself is not saved.</p>
        <label>How many earlier owners it names <input name="prior_owner_count" inputmode="numeric" autocomplete="off"></label>
        <button type="submit">Save</button></form>`}
  </div>`;
}

function propertyPage(
  d: CrmPageDeps, actor: Actor, v: C.PropertyView, msg: string | undefined,
  x: { timeline: Timeline | undefined; owners: readonly Owner[] | null; may_note: boolean; site?: SI.SitePointView | null; title?: TH.TitleByHandView | null },
): string {
  /* PHASE 139 (carried from 138): THE PROPERTY PAGE AS SECTIONS, like the client and claim pages. The old tab ids stay
     the anchors, so every link and redirect to #details, #related and #activity still lands. */
  const ctx: SectionContext = { prefs: sectionPrefs(d.app.db, actor), back: `/staff/properties/${v.id}` };
  const propNeed: Need[] = [
    ...(v.acquisition_date === null ? [{ label: 'When the property was bought' }] : []),
    ...(v.tenure.known ? [] : [{ label: 'Whether it is freehold or leasehold' }]),
    ...(v.existing_ca_claimed.known ? [] : [{ label: 'Whether allowances were claimed on it before' }]),
  ];
  const events = x.timeline?.events.length ?? 0;
  return page({
    title: `${v.business.name} — ${propertyIn(v.business.name, v.label) ?? v.label}`, nav: d.nav(actor), wide: true,
    body: h`${breadcrumb([{ label: v.business.name, href: v.business.linkable ? `/staff/clients/${v.business.id}` : null }, { label: propertyIn(v.business.name, v.label) ?? v.label }])}${done(msg)}
      ${highlights('Property', propertyIn(v.business.name, v.label) ?? v.label, [
        { label: 'Company', value: v.business.linkable ? h`<a href="/staff/clients/${v.business.id}">${v.business.name}</a>` : v.business.name },
        { label: 'Postcode', value: orNot(v.postcode) },
        { label: 'Jurisdiction', value: v.jurisdiction.label },
        { label: 'Tenure', value: v.tenure.label },
        { label: 'Claims', value: String(v.claims.length) },
      ])}
      <div class="help">${why('Survey status, date and surveyor belong to each claim, not to the building.')}</div>

      ${recordLayout(h`${([
        { key: 'property.details', id: 'details', kind: 'property', heading: 'The property',
          status: statusFromNeeds(propNeed, true),
          working: propNeed.length === 0 ? 'Nothing right now — the building’s details are in.' : 'Finding the facts about the building.',
          need: propNeed, from: ['HM Land Registry', 'the EPC register', 'the client'], body: h`
      <div class="pblock">${fields([
        { label: 'Address', value: [v.address_line_1, v.address_line_2, v.town].filter((x) => x !== null).join(', ') },
        { label: 'Postcode', value: v.postcode },
        // The jurisdiction and the prior-claim answers decide the claim, so "not known" is an answer and stays.
        { label: 'Jurisdiction', value: v.jurisdiction.label, keep: true, ...(v.jurisdiction.why === '' ? {} : { why: `Not worked out: ${v.jurisdiction.why}` }) },
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
        <p class="help">Shown as the client gave it. It is not copied into the fields above. A month is not a date, and a
        round figure is not a price.</p>
        <table><tbody>${v.from_the_assessment.map((a) => h`<tr><th>${a.question}</th><td>${a.answer}</td></tr>`)}</tbody></table>`}
      </div>

      ${v.may_write ? h`<div class="pblock" id="change-property"><div class="pnum">Change the property</div>
        <form method="post" action="/staff/properties/${v.id}">
          <label>Name <input name="label" value="${v.label}" required></label>
          <label>Address line 1 <input name="address_line_1" value="${v.address_line_1 ?? ''}"></label>
          <label>Address line 2 <input name="address_line_2" value="${v.address_line_2 ?? ''}"></label>
          <label>Town <input name="town" value="${v.town ?? ''}"></label>
          <label>Postcode <input name="postcode" value="${v.postcode ?? ''}"></label>
          ${v.jurisdiction.derived ? h`<p class="help">The jurisdiction comes from the postcode, so we do not ask.</p>`
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
      ${x.site === undefined || x.site === null ? raw('') : sitePointBlock(v.id, x.site)}
      ${x.title === undefined || x.title === null ? raw('') : titleBlock(v.id, x.title)}
` },
        { key: 'property.claims', id: 'related', kind: 'facts', heading: 'Claims on this property', count: v.claims.length,
          status: v.claims.length === 0 ? 'NOT_STARTED' : 'WORKING',
          working: v.claims.length === 0 ? 'No claim yet. Open one below.' : `${v.claims.length} claim${v.claims.length === 1 ? '' : 's'} on this building.`,
          need: [], from: ['you and your team'], body: h`
      <div class="pblock">${claimTilesFor(v.claims, undefined, v.business.name)}
      ${v.may_open_claim ? h`<form method="post" action="/staff/properties/${v.id}/claims">
        <label>Open a claim for <select name="workstream">${options(C.WORKSTREAMS, null, null)}</select></label>
        <button type="submit">Open claim</button></form>` : raw('')}
      </div>
` },
        { key: 'property.documents', id: 'documents', kind: 'documents', heading: 'Documents', count: v.documents.documents.length,
          status: v.documents.documents.length > 0 ? 'DONE' : 'NOT_STARTED',
          working: v.documents.documents.length > 0 ? 'Nothing right now.' : 'No document yet.',
          need: [], from: ['the client', 'the surveyor', 'our own letters'], body: h`
      ${placeDocumentsBlock(v.documents, v.id)}
` },
        { key: 'property.activity', id: 'activity', kind: 'messages', heading: 'Messages and activity',
          status: events > 0 ? 'WORKING' : 'NOT_STARTED', working: 'Keeping a record of every call, email and note.',
          need: [], from: ['you and your team'], body: h`
      ${x.owners === null ? raw('') : h`<div class="pblock"><div class="pnum">Tasks on this property</div>${
        newTaskForm(taskChoices(d.app.db), { property_id: v.id }, x.owners, `/staff/properties/${v.id}`)}</div>`}
      ${timelineBlock(x.timeline)}
      <div id="property-notes">${notesBlock(x.timeline, x.may_note ? `/staff/properties/${v.id}/notes` : null, [], v.business.id)}</div>` },
      ] satisfies SectionSpec[]).map((sp) => section(sp, ctx))}`, sidePanel(null, [
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

/**
 * UI TIDY PHASE 17 (3 October 2026): a column this login may not read on any row is left out, and the page says so,
 * instead of a dash in every row — Accounting reads the company and the reference, so its list is those two. A column
 * read on some rows keeps the dash on the others, as before.
 */
export function claimColumns(rows: readonly Pick<C.ClaimRow, 'property' | 'stage' | 'next_action' | 'owner'>[]): {
  property: boolean; stage: boolean; next_action: boolean; owner: boolean;
} {
  return {
    property: rows.some((r) => r.property !== undefined), stage: rows.some((r) => r.stage !== undefined && r.stage !== null),
    next_action: rows.some((r) => r.next_action !== undefined), owner: rows.some((r) => r.owner !== undefined),
  };
}

function claimsPage(d: CrmPageDeps, actor: Actor, rows: readonly C.ClaimRow[], controls: Safe = raw(''), sortBy: SortBy = (_k, l) => h`${l}`): string {
  // PHASE 133a: the filters and saved views in a panel beside the list; sortable headings; one table style.
  const col = claimColumns(rows);
  const hidden = !col.property || !col.stage || !col.next_action || !col.owner;
  // Each column's heading and cells from one list, so a heading cannot stand over another column's cells.
  const dash = h`<span class="help">—</span>`;
  const shown = ([
    { key: 'property', label: 'Property', head: h`Property`, cell: (r: C.ClaimRow): Safe => (r.property === undefined ? dash : orNot(r.property, 'none recorded')) },
    { key: 'stage', label: 'Stage', head: h`Stage`, cell: (r: C.ClaimRow): Safe => h`${r.stage ?? '—'}` },
    { key: 'next_action', label: 'Next action', head: sortBy('next_action', 'Next action'), cell: (r: C.ClaimRow): Safe => (r.next_action === undefined ? dash : orNot(r.next_action, 'none recorded')) },
    { key: 'owner', label: 'Owner', head: h`Owner`, cell: (r: C.ClaimRow): Safe => (r.owner === undefined ? dash : orNot(r.owner, 'nobody yet')) },
  ] as const).filter((c) => col[c.key]);
  return page({
    title: 'Claims', nav: d.nav(actor), wide: true,
    body: h`<div class="pagehead"><div><p class="eyebrow">Claims</p><h1>Claims</h1></div><p class="help">${rows.length} shown.</p></div>
      <div class="listlayout">${controls}<div class="listmain">
      ${rows.length === 0 ? h`<p class="empty">No claims yet. A claim opens when a lead is converted, or from a property’s page.</p>` : h`${
        hidden ? h`<p class="help">Only the columns your role may read are shown.</p>` : raw('')}<div class="tablewrap"><table class="stack">
        <thead><tr><th>${sortBy('company', 'Company')}</th>${shown.map((c) => h`<th>${c.head}</th>`)}<th>${sortBy('reference', 'Reference')}</th></tr></thead>
        <tbody>${rows.map((r) => h`<tr><td><a href="${claimHref(r.business_id, r.id)}">${r.client}</a></td>
          ${shown.map((c) => h`<td data-label="${c.label}">${c.cell(r)}</td>`)}
          <td data-label="Reference">${claimRef(r.claim_ref)}</td></tr>`)}</tbody></table></div>`}
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
  return h`<div class="pblock"><dl>
    <dt>Owner</dt><dd>${orNot(t.owner, 'nobody yet')}</dd>
    <dt>Surveyor</dt><dd>${orNot(t.surveyor, 'none named')}${why(t.surveyor_reach)}</dd>
    ${t.tax_adviser === undefined ? raw('') : h`<dt>Tax adviser</dt><dd>${t.tax_adviser.state === 'RECORDED'
      ? h`${t.tax_adviser.adviser}, ${t.tax_adviser.credential}<br><span class="help">signed off ${ukDate(t.tax_adviser.signed_on)}</span>${why(h`The sign-off record, signed on ${ukDate(t.tax_adviser.signed_on)} and recorded ${t.tax_adviser.recorded} — we record the adviser’s sign-off, not the person.`)}`
      : h`Not signed off yet${why(t.tax_adviser.reading)}`}</dd>`}
    </dl>
    ${t.contacts === undefined ? raw('') : h`<p><strong>The client’s accountant and adviser on this claim</strong></p>
      ${t.contacts.length === 0 ? h`<p class="help">Nobody is linked to this claim yet.</p>` : h`<table>
        <thead><tr><th>Contact</th><th>Type</th><th>On the team since</th><th></th></tr></thead>
        <tbody>${t.contacts.map((c) => h`<tr><td>${c.name}</td><td>${c.type}</td><td>${c.since} <span class="help">by ${c.linked_by}</span></td>
          <td>${t.may_link ? h`<form method="post" action="/staff/claim-team/${c.link_id}/end" class="inline"><button class="linkish" type="submit">Take off the team</button></form>` : raw('')}</td></tr>`)}</tbody></table>`}
      ${t.candidates === undefined ? raw('') : t.candidates.length === 0
        ? h`<div class="help"><a href="/staff/clients/${v.client.business_id}#contacts">Add the accountant or adviser as a contact</a>${why('The company has no other contact recorded as its accountant or adviser. Add one on the company’s page, typed as such.')}</div>`
        : h`<form method="post" action="/staff/claims/${v.id}/team">
            <label>Add to the team <select name="contact_id">${t.candidates.map((c) => h`<option value="${c.id}">${c.name} — ${c.type}</option>`)}</select></label>
            <button type="submit">Add</button></form>`}
      <div class="help">${why('A contact on the team stays a contact of the organisation. Nobody here has a login.')}</div>`}
  </div>`;
}

/**
 * PHASE 138 — A CLAIM FACT THE CLIENT CAN BE ASKED FOR, as a one-press ask. It posts to the company's own question route
 * (`sendTaskToPortal`, which asks `business.read` and `internal_note.write` again), naming this claim; the answer comes
 * back on the company page's Questions for the client, where it is recorded as the fact.
 */
function claimAsk(business_id: string, claim_id: string, fact_id: string, label: string): Safe {
  return h`<form method="post" action="/staff/clients/${business_id}/tasks/send" class="inline">
    <input type="hidden" name="fact_id" value="${fact_id}"><input type="hidden" name="claim_id" value="${claim_id}">
    <input type="hidden" name="question" value="${`Can you tell us this: ${label}?`}">
    <input type="hidden" name="why" value="We need this to finish your claim."><input type="hidden" name="holds_up" value="this claim">
    <button class="linkish" type="submit">Ask the client</button></form>`;
}

/** The claim facts a client can tell us, in the order the facts table draws them. The rest are worked out, not asked. */
function askableFacts(p: F.FactsPanel): readonly F.FactReading[] {
  return [p.claimant_type, p.acquisition_date, p.accounting_period.start, p.accounting_period.end, p.taxable_profit.sufficient_profit,
    p.allowance_headroom.position, p.election.exists, p.acquisition_costs.costs, p.buyer_alterations.made];
  // PHASE 143: whether anyone else paid is asked in its own section, "Grants and contributions", and not twice.
}

/** UI TIDY PHASE 18: a claim section's state, short enough for the left-hand menu. Done and not started say nothing. */
export const SECTION_STATUS_NOTE: Readonly<Record<'WORKING' | 'WAITING', string>> = Object.freeze({ WORKING: 'to do', WAITING: 'waiting' });

/**
 * PHASE 158b (F31): the claim's survey job. At Survey, with none open, Admin and Sales choose a surveyor and open it,
 * which seals the estimate (src/web/survey-open.ts). Once open, whose it is and whether the figures are in. Never a
 * figure: this page is read by roles the estimate is hidden from.
 */
function surveyJobBlock(claim_id: string, p: SO.SurveyJobPanel | null, preferred: string | null): Safe {
  if (p === null || (!p.at_survey && p.job === null)) return raw('');
  if (p.job !== null) {
    return h`<div class="pblock" id="survey-job"><h3>Survey job</h3>
      <p>${p.job.figures_in ? badge('Figures in', 'ok') : badge('Waiting for the surveyor’s figures')}
        Open with <strong>${p.job.surveyor ?? 'nobody assigned'}</strong>, since ${localStamp(p.job.opened_at)}.</p></div>`;
  }
  if (!p.may_open) return raw('');
  return h`<div class="pblock" id="survey-job"><h3>Survey job</h3>
    <p class="help">No survey job is open yet. Opening one gives it to the surveyor and locks our estimate, so the
      surveyor gives their own figures first.${why('The surveyor sees the figure we showed the client only after they commit theirs.')}</p>
    ${p.surveyors.length === 0 ? h`<p>${badge('No surveyor login yet', 'warn')} Ask an administrator to add one.</p>`
      : h`<form method="post" action="/staff/claims/${claim_id}/survey-job">
      <label>Surveyor <select name="surveyor_id" required>${people(p.surveyors, p.surveyors.some((s) => s.id === preferred) ? preferred : null, 'choose a surveyor')}</select></label>
      <button type="submit">Open the survey job</button></form>`}</div>`;
}

function claimPage(
  d: CrmPageDeps, actor: Actor, v: C.ClaimView, msg: string | undefined,
  x: {
    templates: readonly { id: string; label: string }[];
    contacts: readonly { id: string; name: string; email: string | null }[] | undefined;
    may_note: boolean;
    /** Phase 139: the step just worked in, whose facts open. */
    step?: string;
  },
): string {
  const db = d.app.db;
  const biz = v.client.business_id;
  // PHASE 134: THE COMPANY IS THE FRAME. The heading is the company's name; the property and the reference sit under it.
  const property = v.header?.property ?? null;
  // PHASE 157c (F8): the town only where the label does not already carry it ("…, Plymouth, PL4 9BH, Plymouth").
  const where = property === null ? null : [propertyIn(v.client.name, property.label), property.town !== null && property.label.toLowerCase().includes(property.town.trim().toLowerCase()) ? null : property.town].filter((x): x is string => x !== null && x.trim() !== '').join(', ');
  const tasks = claimTasksBlock(v.id, v.tasks, taskChoices(db));
  const docs = claimDocumentsBlock(v.id, v.documents, false);
  const email = emailBlock(biz, v.id, x.contacts);
  const notes = notesBlock(v.timeline, x.may_note ? `/staff/claims/${v.id}/notes` : null, [], biz);
  const pipe = pipelineBlock(v.id, v.pipeline, v.tasks?.may_set_next_action === true ? (v.tasks.owner_choices ?? []) : []);
  const surveyJob = surveyJobBlock(v.id, SO.surveyJobPanel(db, actor, v.id), v.edit?.current.surveyor_id ?? null);
  // PHASE 158c (F37): the amendment window, warned from the client's own date, from Engagement until Reports.
  const windowRow = db.get<{ stage: string | null; business_id: string; property_id: string | null }>('SELECT stage, business_id, property_id FROM claims WHERE id = ?', [v.id]);
  const windowWarning = windowRow === undefined ? null : earlyWindowWarning(db, windowRow, nowIso());
  const windowBlock = windowWarning === null ? raw('') : h`<div class="flag" id="window-warning"><strong>The amendment window may have closed.</strong> ${windowWarning}</div>`;
  const quick: QuickAction[] = [
    ...(tasks.html.includes('action="/staff/tasks"') ? [{ href: '#add-task', label: 'Log a call or add a task' }] : []),
    ...(tasks.html.includes('/next-action"') ? [{ href: '#claim-tasks', label: 'Set the next action' }] : []),
    ...(docs.html.includes('/document-requests"') ? [{ href: '#claim-documents', label: 'Request a document' }] : []),
    ...(pipe.html.includes('/stage"') ? [{ href: '#move', label: 'Move the claim' }] : []),
    ...(email.html.includes('/email?claim=') ? [{ href: `/staff/clients/${biz}/email?claim=${v.id}`, label: 'Email the client' }] : []),
    ...(notes.html.includes('/notes"') ? [{ href: '#claim-notes', label: 'Add a note' }] : []),
  ];
  const nextAction = v.header === undefined ? null : v.header.next_action === null
    ? h`<p>${badge('None recorded', 'warn')}</p><p class="help">Every open claim has exactly one next action, with an owner and a due date.</p>`
    : h`<p><strong>${v.header.next_action}</strong></p>${v.header.next_action_due === null ? raw('') : h`<p class="help">${due(v.header.next_action_due)}</p>`}
        ${v.header.owner === null ? raw('') : h`<p class="help">${v.header.owner}</p>`}`;
  const step = v.pipeline === undefined ? null : claimNextStep(v.id, v.pipeline.gate, v.pipeline.moves, v.pipeline.hold);

  /* PHASE 138: THE CLAIM'S SECTIONS. Each is built only from a part of the view this login was given, and only where the
     view carries it — a surveyor's view carries the stage and the released facts, Accounting's the money. */
  // UI TIDY PHASE 18: only the stage opens by itself (and the checks, when a step was just worked in); every other section
  // starts closed, as a one-line summary with its status, unless a change was just made in it or the person keeps it open.
  const ctx: SectionContext = {
    prefs: sectionPrefs(db, actor), back: v.client.linkable ? claimHref(biz, v.id) : `/staff/claims/${v.id}`,
    autoOpen: ['claim.stage', ...(x.step === undefined ? [] : ['claim.checks'])],
  };
  const asked = openClaimQuestions(db, actor, biz, v.id);
  const mayAsk = can(actor, 'internal_note.write', { type: 'internal_note', id: biz, business_id: biz });
  const needFor = (fact_id: string, label: string): Need => (asked.has(fact_id) ? { label, asked: true }
    : mayAsk ? { label, ask: claimAsk(biz, v.id, fact_id, label) } : { label });
  const sections: SectionSpec[] = [];

  if (v.pipeline !== undefined) {
    const pl = v.pipeline;
    const firstNeed = pl.gate?.needs.find((n) => !n.met);
    const over = pl.stage.kind === 'CLOSED' || pl.stage.kind === 'EXIT';
    sections.push({
      key: 'claim.stage', id: 'move', kind: 'facts', heading: 'Stage and next move',
      status: over ? 'DONE' : 'WORKING',
      working: over ? `This claim is closed: ${pl.stage.label}.`
        : pl.gate === undefined ? `Stage: ${pl.stage.label}.`
          // PHASE 157c (the Friary House run, F9): a move also needs one next action; "Ready" with none was refused.
          : pl.gate.open ? (v.header !== undefined && v.header.next_action === null
            ? `Ready to move on from ${pl.gate.label} once the claim has a next action (Set the next action).`
            : `Ready to move on from ${pl.gate.label}.`) : `Getting ready to move on: ${plainNeed(firstNeed?.what ?? '').words}`,
      need: [], from: ['our step-by-step procedure', 'you and your team'],
      body: h`${v.overview === undefined ? raw('') : fields([
          { label: 'Workstream', value: v.overview.workstream.label },
          { label: 'Expected completion', value: v.overview.expected_completion === null ? null : ukDate(v.overview.expected_completion) },
          { label: 'Hold reason', value: v.overview.hold_reason },
          { label: 'Lost reason', value: v.overview.lost_reason },
        ])}
        ${windowBlock}
        ${pipe}
        ${surveyJob}
        ${accountantConfirmBlock(db, actor, v.id)}
        ${v.edit === undefined ? raw('') : h`<details id="change-claim"><summary>Change the owner, surveyor or priority</summary>
          <div class="help">The stage is not changed here.${why('It moves through the steps above.')}</div>
          <form method="post" action="/staff/claims/${v.id}">
            <label>Owner <select name="owner_id">${people(v.edit.owners, v.edit.current.owner_id, 'nobody yet')}</select></label>
            <label>Surveyor <select name="surveyor_id">${people(v.edit.surveyors, v.edit.current.surveyor_id, 'none named')}</select></label>
            <label>Priority <select name="priority">${options(vocabulary(db, 'PRIORITY', v.edit.current.priority), v.edit.current.priority, 'not set')}</select></label>
            <label>Workstream <select name="workstream">${options(C.WORKSTREAMS, v.edit.current.workstream, null)}</select></label>
            <label>Property <select name="property_id">${people(v.edit.properties.map((p) => ({ id: p.id, name: p.label })), v.edit.current.property_id, 'none recorded')}</select></label>
            <label>Expected completion <input name="expected_completion" type="date" value="${v.edit.current.expected_completion ?? ''}"></label>
            <label>Hold reason <input name="hold_reason" value="${v.edit.current.hold_reason ?? ''}"></label>
            <label>Lost reason <input name="lost_reason" value="${v.edit.current.lost_reason ?? ''}"></label>
            <button type="submit">Save</button></form></details>`}`,
    });
  }

  if (v.facts !== undefined) {
    const f = v.facts;
    if ('released_to_surveyor' in f) {
      sections.push({
        key: 'claim.facts', id: 'claim-facts', kind: 'facts', heading: 'The claim’s facts', status: 'DONE',
        working: 'These are the facts released to you for the survey.', need: [], from: ['Cap Rebate'], body: factsBlock(v.id, f),
      });
    } else {
      const need = askableFacts(f).filter((r) => !r.known).map((r) => needFor(`claim_fact.${r.key}`, r.label));
      const known = askableFacts(f).filter((r) => r.source !== null).map((r) => r.source?.publisher ?? '');
      sections.push({
        key: 'claim.facts', id: 'claim-facts', kind: 'facts', heading: 'The claim’s facts',
        status: statusFromNeeds(need, true),
        working: need.length === 0 ? 'Nothing — every fact the tax rules need is in.' : 'Collecting the facts the tax rules need.',
        need, from: [...new Set(['the client', ...known.filter((k) => k !== '')])], body: factsBlock(v.id, f),
      });
    }
  }

  /* PHASE 143: GRANTS AND CONTRIBUTIONS, a section of its own. The same facts panel, so Admin and Sales alone; a
     surveyor's released list and Accounting's page never build it. Done only when the valuation check it feeds is met. */
  if (v.facts !== undefined && !('released_to_surveyor' in v.facts)) {
    const f = v.facts;
    const g = f.grants;
    const active = g.lines.filter((l) => l.withdrawn === null);
    const unmatched = active.filter((l) => l.traced_key !== 'YES').length;
    const answer = g.exist.known ? g.exist.value : null;
    const askedIt = asked.has('claim_fact.GRANTS_EXIST');
    const need = g.exist.known ? [] : [needFor('claim_fact.GRANTS_EXIST', 'Whether anyone else paid for any of this work')];
    sections.push({
      key: 'claim.grants', id: 'claim-grants', kind: 'facts', heading: 'Grants and contributions',
      ...(active.length > 0 ? { count: active.length } : {}),
      status: g.traced.met ? 'DONE' : need.length > 0 && askedIt ? 'WAITING' : 'WORKING',
      working: g.traced.met ? (answer === 'NO' ? 'Nothing — nobody else paid for this work.' : `Nothing — every one is matched to the items it paid for.`)
        : answer === null ? (askedIt ? 'Waiting for the client to tell us whether anyone else paid.' : 'Finding out whether anyone else paid for this work.')
          : answer === 'NO' ? 'The answer is No, but some are still listed.'
            : active.length === 0 ? 'Adding who paid, and how much.'
              : `Matching ${unmatched} to the items ${unmatched === 1 ? 'it' : 'they'} paid for.`,
      need, from: ['the client', 'the funding agreement', 'our tax adviser'],
      body: grantsBlock(v.id, f, askedIt),
      ...(msg === 'grants' ? { open_now: true } : {}),
    });
  }

  /* PHASE 139: this claim's steps — each fact with where it came from and a tick, and "Tell the client". */
  {
    const checks = checksPanelIfPermitted(db, actor, biz, d.app.now().slice(0, 10));
    const mine = checks?.claims.find((c) => c.id === v.id);
    if (checks !== null && mine !== undefined) {
      const sum = checksSummary(mine.steps);
      sections.push({
        key: 'claim.checks', id: 'claim-checks', kind: 'facts', heading: 'Check and tell the client',
        ...(sum.count > 0 ? { count: sum.count } : {}),
        status: sum.status, working: sum.working, need: [],
        from: [...new Set(mine.steps.flatMap((s) => s.facts.map((f) => f.chip)))],
        body: claimChecksBlock(checks, v.id, x.step),
        ...(msg === 'checked' || msg === 'unchecked' || (msg?.startsWith('told') ?? false) || msg === 'takenback' ? { open_now: true } : {}),
      });
    }
  }

  if (v.figures !== undefined) {
    const fg = v.figures;
    const surveyed = fg.c_surveyor.state !== 'NOT_YET';
    const signed = fg.d_adviser.state !== 'NOT_YET';
    sections.push({
      key: 'claim.figures', id: 'claim-figures', kind: 'facts', heading: 'Figures',
      status: signed ? 'DONE' : surveyed ? 'WORKING' : 'NOT_STARTED',
      working: signed ? 'Nothing — the tax adviser has signed the figure.'
        : surveyed ? 'Waiting for the tax adviser to sign the figure off.' : 'Waiting for the surveyor’s figures.',
      need: [], from: ['our estimate', 'the surveyor', 'the tax adviser'],
      body: h`${figuresBlock(v.id, fg)}${v.value === undefined ? raw('') : h`<h3>The value</h3>${valuePanel(v.value)}`}`,
    });
  }

  if (v.overview !== undefined) {
    const o = v.overview;
    const need: Need[] = [
      ...(o.acquisition_date === null ? [needFor('property.acquisition_date', 'When the property was bought')] : []),
      ...(o.tenure.known ? [] : [needFor('property.tenure', 'Whether the property is freehold or leasehold')]),
      ...(o.existing_ca_claimed.known ? [] : [needFor('property.existing_ca_claimed', 'Whether allowances were claimed on it before')]),
    ];
    sections.push({
      key: 'claim.property', id: 'claim-property', kind: 'property', heading: 'The property',
      status: statusFromNeeds(need, true),
      working: need.length === 0 ? 'Nothing right now.' : 'Finding the facts about the building.',
      need, from: ['HM Land Registry', 'the EPC register', 'the client'],
      body: h`${fields([
          { label: 'Property', value: v.header?.property === null || v.header?.property === undefined ? null
            : v.header.property.linkable ? h`<a href="/staff/properties/${v.header.property.id}">${v.header.property.label}</a>` : v.header.property.label },
          { label: 'Acquired', value: o.acquisition_date === null ? null : ukDate(o.acquisition_date) },
          { label: 'Acquisition price', value: o.acquisition_price },
          { label: 'Tenure', value: o.tenure.label },
          { label: 'Jurisdiction', value: o.jurisdiction },
          // A fact that decides something: "not known" is an answer, and it stays.
          { label: 'Allowances claimed before?', value: o.existing_ca_claimed.label, keep: true },
        ])}`,
    });
  }

  /* PHASE 159c: WHAT HAPPENED TO THE BUILDING, EVENT BY EVENT — a purchase, then each piece of work — each with its own
     figure and the documents that prove it. The figure (the engine's band on that event's own cost, until the survey
     prices it) and the cost are the claim's value: shown only to a login that may read it. */
  {
    const row = C.loadClaimRow(db, v.id);
    const obj = C.claimObjFor(db, row);
    const sector = db.get<{ sector: string | null }>('SELECT sector FROM businesses WHERE id = ?', [row.business_id])?.sector ?? null;
    const evs = eventsOnClaim(db, { property_id: row.property_id, business_id: row.business_id, sector });
    const value = can(actor, 'claim.read_value', obj);
    const mayAdd = can(actor, 'claim.write', obj) && row.property_id !== null;
    if (evs.length > 0 || mayAdd) {
      const missing = evs.flatMap((e) => e.documents.filter((x) => x.held === 0)).length;
      sections.push({
        key: 'claim.events', id: 'claim-events', kind: 'property', heading: 'What happened to the building',
        ...(evs.length > 0 ? { count: evs.length } : {}),
        status: evs.length === 0 ? 'NOT_STARTED' : missing === 0 ? 'DONE' : 'WORKING',
        working: evs.length === 0 ? 'Nothing is recorded about the building’s purchase or works yet.'
          : missing === 0 ? 'Nothing right now.' : 'Gathering the documents for each event.',
        need: [], from: ['the client', 'you and your team'],
        body: eventsBlock(v.id, evs, value, mayAdd),
        ...(msg === 'event' ? { open_now: true } : {}),
      });
    }
  }

  if (v.team !== undefined || v.origin !== undefined) {
    const owned = v.team?.owner !== null && v.team?.owner !== undefined;
    sections.push({
      key: 'claim.team', id: 'claim-team', kind: 'company', heading: 'The team',
      status: v.team === undefined || owned ? 'DONE' : 'WORKING',
      working: v.team === undefined || owned ? 'Nothing right now.' : 'The claim needs an owner.',
      need: [], from: ['you and your team', 'the client'],
      body: h`${teamBlock(v)}
        ${v.client.linkable ? h`<p><a href="/staff/clients/${biz}#contacts">See all of ${v.client.name}’s contacts</a></p>` : raw('')}
        ${v.origin === undefined ? raw('') : moreDetail(fields([
          { label: 'Came from', value: v.origin.lead === null ? 'Opened by staff'
            : h`<a href="${v.origin.lead.href}">Its lead</a>`, why: v.origin.lead === null ? 'No lead: this claim was opened by staff on a property.' : v.origin.lead.origin },
          { label: 'Source', value: v.origin.source.label, why: `From ${v.origin.source.from}.` },
          v.origin.introducer === undefined ? null : { label: 'Introducer', value: v.origin.introducer === null ? null
            : h`<a href="${v.origin.introducer.href}">${v.origin.introducer.firm_name}</a>` },
        ]), 'Where this claim came from')}`,
    });
  }

  {
    const dp = v.documents;
    const waitingFor = (dp.requests ?? []).filter((r) => r.state === 'REQUESTED');
    sections.push({
      key: 'claim.documents', id: 'claim-documents', kind: 'documents', heading: 'Documents', count: dp.documents.length,
      status: waitingFor.length > 0 ? 'WAITING' : dp.documents.length > 0 ? 'DONE' : 'NOT_STARTED',
      working: waitingFor.length > 0 ? `Waiting for ${waitingFor.length} document${waitingFor.length === 1 ? '' : 's'} from the client.`
        : dp.documents.length > 0 ? 'Nothing right now.' : 'No document yet.',
      need: waitingFor.map((r) => ({ label: r.type.label, asked: true })),
      from: ['the client', 'the surveyor', 'our own letters'],
      body: h`${docs}${v.deliverables === undefined ? raw('') : h`<div id="claim-deliverables">${moreDetail(deliverablesBlock(v.id, v.deliverables), 'The reports we deliver')}</div>`}`,
    });
  }

  if (v.money !== undefined || v.estimated_fee !== undefined || v.fee_discounts !== undefined) {
    const money = v.money ?? [];
    sections.push({
      key: 'claim.money', id: 'claim-money', kind: 'money', heading: 'Money', count: money.length,
      status: money.length > 0 ? 'WORKING' : 'NOT_STARTED',
      working: money.length > 0 ? `${money.length} invoice${money.length === 1 ? '' : 's'} on this claim.` : 'No invoice yet.',
      need: [], from: ['our fee rules', 'our invoices'],
      body: h`${v.estimated_fee === undefined ? raw('') : h`<h3>Our estimated fee</h3>
          <p>${v.estimated_fee.known ? h`<strong>${v.estimated_fee.amount}</strong> — ${v.estimated_fee.reading}` : h`<strong>${v.estimated_fee.reading}</strong>`}</p>
          <div class="${v.estimated_fee.gate.outcome === 'FIRE' ? 'flag' : 'help'}">${v.estimated_fee.gate.reading}.${why(h`${v.estimated_fee.gate.placeholder_caveat} ${v.estimated_fee.basis} No fee invoice is raised on this claim yet; once one is, it is listed below.`)}</div>`}
        ${v.money === undefined ? raw('') : h`<h3>Invoices</h3>
          ${money.length === 0 ? h`<div class="help">No invoice is raised on this claim.${why('This claim’s own invoices. Recorded here, not collected.')}</div>` : h`<table class="stack">
            <thead><tr><th>Number</th><th>For</th><th>Amount</th><th>Invoice</th><th>Money</th><th>Outstanding</th><th>Due</th><th>VAT</th></tr></thead>
            <tbody>${money.map((m) => h`<tr><td>${m.number ?? 'unnumbered'}</td><td data-label="For">${m.kind}</td><td data-label="Amount">${m.fee}</td><td data-label="Invoice">${m.invoice_status}</td>
              <td data-label="Money">${m.payment_status}</td><td data-label="Outstanding">${m.outstanding}</td><td data-label="Due">${m.due}</td><td data-label="VAT">${m.vat_position}</td></tr>`)}</tbody></table>`}`}
        ${v.fee_discounts === undefined ? raw('') : moreDetail(v.fee_discounts.length === 0
          ? h`<p class="help">None proposed. A discount is never applied automatically; the largest discount and who approves it are not decided.</p>`
          : h`<table class="stack"><thead><tr><th>Proposed</th><th>Why</th><th>Recorded</th><th>State</th></tr></thead><tbody>${v.fee_discounts.map((fd) => h`<tr>
              <td>${fd.discount}</td><td data-label="Why">${fd.reason}</td><td data-label="Recorded" class="when">${fd.recorded}</td><td data-label="State"><strong>${fd.state === 'AWAITING_CEILING_AND_APPROVER' ? 'AWAITING THE DECISION' : 'NOT APPLIED'}</strong><br><span class="help">${fd.says}</span></td></tr>`)}</tbody></table>`, 'A multi-site discount')}`,
    });
  }

  if (v.aftercare !== undefined) {
    const a = v.aftercare;
    sections.push({
      key: 'claim.aftercare', id: 'claim-aftercare', kind: 'facts', heading: 'Aftercare',
      status: a.enquiry_open ? 'WORKING' : a.enquiries.length > 0 ? 'DONE' : 'NOT_STARTED',
      working: a.enquiry_open ? 'An HMRC enquiry is open.' : a.enquiries.length > 0 ? 'Nothing — the HMRC enquiry is closed.' : 'Nothing yet — this starts once the claim is filed.',
      need: [], from: ['HMRC', 'the client'], body: aftercareBlock(v.id, a),
    });
  }

  sections.push({
    key: 'claim.activity', id: 'activity', kind: 'messages', heading: 'Messages and activity',
    status: (v.timeline?.events.length ?? 0) > 0 ? 'WORKING' : 'NOT_STARTED',
    working: v.tasks?.waiting === undefined ? 'Keeping a record of every call, email and note.' : `${v.tasks.waiting.why.charAt(0).toUpperCase()}${v.tasks.waiting.why.slice(1)}.`,
    need: [], from: ['you and your team', 'the client'],
    body: h`<div id="claim-tasks">${tasks}</div>
      <div id="claim-email">${email}</div>
      ${v.timeline === undefined || !v.client.linkable ? raw('') : h`<p><a href="/staff/clients/${biz}#activity">See everything for ${v.client.name}</a></p>`}
      ${timelineBlock(v.timeline, 'This claim’s part of the company’s timeline')}
      <div id="claim-notes">${notes}</div>`,
  });

  // UI TIDY PHASE 18: the claim's sections, under this claim in the left-hand menu.
  addUnderCurrent(claimName(v.client.name, property?.label), sections.map((sp) => ({
    href: `#${sp.id}`, label: sp.heading, ...(sp.status === 'WORKING' || sp.status === 'WAITING' ? { note: SECTION_STATUS_NOTE[sp.status] } : {}),
  })));
  return page({
    title: claimName(v.client.name, property?.label), nav: d.nav(actor), wide: true,
    body: h`${breadcrumb([{ label: v.client.name, href: v.client.linkable ? `/staff/clients/${biz}` : null }, { label: propertyIn(v.client.name, property?.label ?? null) ?? 'Claim' }])}${done(msg)}
      ${highlights('Claim', v.client.name, [
        // UI TIDY PHASE 18: the stage in its group's colour, and nobody on it in amber, as on every list.
        v.header === undefined ? null : { label: 'Stage', value: v.header.stage.key === null ? v.header.stage.label : stageBadge(v.header.stage.key, v.header.stage.label) },
        v.header === undefined ? null : { label: 'Owner', value: v.header.owner === null ? nobodyBadge('Nobody yet') : v.header.owner },
        v.overview === undefined ? null : { label: 'Priority', value: v.overview.priority.label },
        v.value === undefined ? null : { label: 'Value', value: v.value.established ? v.value.shown_range : 'no estimate yet' },
      ], raw(''), h`${where === null ? 'Claim' : `Claim on ${where}`} ${claimRef(v.claim_ref)}`)}
      ${v.pipeline === undefined ? raw('') : claimStageBar(v.pipeline.stage, v.pipeline.steps, v.pipeline.gate)}
      ${recordLayout(h`${sections.map((sp) => section(sp, ctx))}`, sidePanel(nextAction, quick, raw(''), step === null ? raw('') : nextStepCard(step)))}

      ${dataLink(actor, `/staff/claims/${v.id}/view.json`)}`,
  });
}
