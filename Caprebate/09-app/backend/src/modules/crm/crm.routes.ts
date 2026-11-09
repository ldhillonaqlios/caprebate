/**
 * THE CRM BACKBONE'S ROUTES — organisations, contacts, properties and the claim
 * record. CRM 1 of 10.
 *
 * Same shape as `handleEngaged` and `handleSurveyor`: it returns 'not-mine' for
 * anything it does not own, so the mounting in staff.ts is one line and nothing
 * is shadowed by accident.
 *
 * `view.json` IS NOT A CONVENIENCE. The property and the claim each serve the
 * object their page is drawn from, to the same actor under the same rule, so
 * that N1 can be verified on the wire — tools/payload-proof.ts reads both.
 *
 * Split by what each part does: this file reads the request and answers it,
 * src/modules/crm/crm-pages.ts draws the pages, src/modules/crm/crm.ts holds the
 * rules and src/modules/crm/crm.permissions.ts the section gates.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Actor } from '../../core/index.ts';
import { authorise, can } from '../../core/index.ts';
import { piecesPage } from '../../core/index.ts';
import { h, page, HTML_HEADERS } from '../../shared/index.ts';
import * as LI from './claim-lists.ts';
import { listControls, mayShareViews, requestParams, sortHeading } from './claim-lists-pages.ts';
import { addStaffEvent, setEventVat } from '../claims/index.ts';
import { requestWorkDocuments } from '../claims/index.ts';
import { siteAreaInputsModule as SI } from '../claims/index.ts';
import { titleByHandModule as TH } from '../claims/index.ts';
import * as C from './crm.ts';
import { assertOrganisationSection } from './crm.permissions.ts';
import { claimsPage, propertiesPage, propertyPage, renderClaim, type CrmPageDeps } from './crm-pages.ts';
import { mayCreateTask, taskOwnerChoices } from './tasks.ts';
import { timelineIfPermitted } from './timeline.ts';
import { getContactsBusinessIdLeadIdById } from './data.ts';

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
  'previous_owner', 'construction_notes', 'existing_ca_claimed', 'prior_claim_notes', 'sale_in_prospect',
  'claimant_role', 'lease_end_date', 'landlord'] as const;
// CRM 3 of 10: the next action is a task, set in its own panel, so the form does not draw it. THE CRM FOLLOW-ON: it is
// still READ here when posted, so `updateClaim` refuses it with its reason — dropping it answered "saved" and wrote nothing.
const CLAIM_FIELDS = ['owner_id', 'surveyor_id', 'priority', 'workstream', 'property_id',
  'hold_reason', 'lost_reason', 'expected_completion', 'next_action', 'next_action_due'] as const;

/* ------------------------------------------------------------------ *
 * THE ROUTER
 * ------------------------------------------------------------------ */

/**
 * — WHERE A SAVED CONTACT GOES BACK TO: the page of whoever the contact belongs to,
 * read from the contact itself. It was the business_id the form posted, so a post without one went to
 * /staff/clients/?done=contact, a 404 (the 3 October sweep), and a wrong one went to somebody else's page.
 */
function contactHome(db: CrmPageDeps['app']['db'], contact_id: string): string {
  const c = getContactsBusinessIdLeadIdById<{ business_id: string | null; lead_id: string | null; introducer_id: string | null }>(db, [contact_id]);
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
  /* The organisations list is the one Clients list now. The address stays alive and asks the gate it always
     asked, so a login refused the list is refused here rather than sent on. */
  if (path === '/staff/organisations' && method === 'GET') {
    assertOrganisationSection(actor);
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

  /* ONE CLIENT PAGE PER COMPANY, at /staff/clients/:id (src/modules/crm/client-page.ts). This address stays alive:
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
      // The site area's point and councils. Everyone who reads the property reads it; the forms are Admin's or Sales's, after signing.
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

  /* THE SITE AREA'S POINT AND A NEIGHBOURING COUNCIL (src/modules/claims/site-area-inputs.ts). Admin or Sales, only once
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

  /* THE TITLE REGISTER, BY HAND (src/modules/claims/title-by-hand.ts). Admin or Sales, once the letter is signed —
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
    // CRM 9 of 10: filtered, sorted and saved through src/modules/crm/claim-lists.ts, each row still asked of `claim.read`.
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
    html(res, 200, renderClaim(d, actor, C.claimView(db, actor, claim[1] ?? '', { now: d.app.now() }), done, undefined, url.searchParams.get('stage') ?? undefined));
    return 'handled';
  }
  if (claim && method === 'POST') {
    const id = claim[1] ?? '';
    const r = C.updateClaim(deps, actor, id, posted(await form(req), CLAIM_FIELDS));
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/claims/${id}`, r.field);
    redirect(res, `/staff/claims/${id}?done=saved`);
    return 'handled';
  }

  /* ----------------------------------------------- (item 4): one event's VAT */
  const eventVat = /^\/staff\/claims\/([A-Za-z0-9-]+)\/events\/([A-Za-z0-9-]+)\/vat$/.exec(path);
  if (eventVat && method === 'POST') {
    const id = eventVat[1] ?? '';
    const row = C.loadClaimRow(db, id);
    authorise(actor, 'claim.write', C.claimObjFor(db, row));
    if (row.property_id === null) return d.problem(res, actor, 'Not saved', 'This claim has no building yet.', `/staff/claims/${id}`);
    const f = await form(req);
    const raw0 = (f.get('amount') ?? '').replace(/[£,\s]/g, '');
    if (raw0 !== '' && !/^\d{1,9}(\.\d{1,2})?$/.test(raw0)) return d.problem(res, actor, 'Not saved', 'Give the VAT in pounds, for example 18000.', `/staff/claims/${id}#claim-events`, 'amount');
    const at = d.app.now();
    const r = setEventVat(db, at, row.property_id, eventVat[2] ?? '', { position: f.get('position'), amount_pence: raw0 === '' ? null : Math.round(Number(raw0) * 100) });
    if (!r.ok) return d.problem(res, actor, 'Not saved', r.why, `/staff/claims/${id}#claim-events`);
    d.app.audit.append({ at, kind: 'PROPERTY_EVENT_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'claim', object_id: id, detail: { event: eventVat[2] ?? '', fields: 'vat' } });
    redirect(res, `/staff/claims/${id}?done=saved#claim-events`);
    return 'handled';
  }

  /* ----------------------------------------------- (item 5): ask for one piece of work's documents */
  const workDocs = /^\/staff\/claims\/([A-Za-z0-9-]+)\/events\/([A-Za-z0-9-]+)\/ask-documents$/.exec(path);
  if (workDocs && method === 'POST') {
    const id = workDocs[1] ?? '';
    const r = requestWorkDocuments({ db, audit: d.app.audit, now: d.app.now, newId: d.newId }, actor, id, workDocs[2] ?? '');
    if (!r.ok) return d.problem(res, actor, 'Not asked', r.why, `/staff/claims/${id}#claim-events`);
    redirect(res, `/staff/claims/${id}?done=${r.asked === 0 ? 'nothing-to-ask' : 'requested'}#claim-events`);
    return 'handled';
  }

  /* ----------------------------------------------- an event on the claim's building */
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
