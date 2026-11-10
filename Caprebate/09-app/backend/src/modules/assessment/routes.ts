/**
 * THE ASSESSMENT'S ADDRESSES: the address box's script, a client's own login made from the assessment, and the
 * four-stage assessment itself, with its pages. The router shell (src/app/router.ts) asks each function at the point
 * where its addresses have always been matched, so the order in which every address is tried is unchanged.
 */
import type { ServerResponse } from 'node:http';
import { JSON_HEADERS, clockOf, cookie, form, html, nav, redirect, setCookie, simple, type Actor, type WebDeps, type WebRequest, type WebResult } from '../../core/index.ts';
import { BOOKING, FRONTDOOR, FUNNEL, HTML_HEADERS, formatPence, formatShownRange, h, localWhen, noticeAtAddress, page, raw, registryGate, toPence, why, zoneNotice, type Safe } from '../../shared/index.ts';
import { ADDRESS_LOOKUP, COMPANY_SEARCH, EMAIL_SENDING, POSTCODE_CHECK, addressLookupMissing, checkPostcode, companySearchOffered, findAddresses, mailWhere, normalisePostcode, postcodeCheckMissing, searchCompanies, searchesToday, sendingOn, smtpLoginFromKeyFile } from '../../integrations/index.ts';
import { SLOT_MINUTES, activeMeeting, bookingInviteFile, fireAutomation, getBusinessesEById, insertBookings2, insertContacts4, isBookable, linkBookingToLead, publicSlots, reconcileVideoMeeting, sendVideoInvite } from '../clients/index.ts';
import { SITE_JS_HEADERS } from '../../shared/index.ts';
import { freeGate, recordLookupsDeclined } from './address-check.ts';
import { ADDRESS_LOOKUP_JS } from './address-lookup-script.ts';
import { closeGatedExit, isGatedExit, loadDraft, newDraft, saveDraft, submit, type Draft } from './assessment.ts';
import { signupParts, termsParts } from './signup-port.ts';
import { F4_ROUTE, F4_SCREENS, F4_TEXT, allGated, applyF4, applyReach, buildings, figureBody, firstIncomplete, isFunnel4, screenBody, stageBar, stageOf, submitEnquiry, type F4Screen } from './funnel4.ts';

const DRAFT_COOKIE = 'cb_draft';

/** The address box's script. */
export async function assessmentAssets(w: WebRequest): Promise<WebResult | undefined> {
  const { res, path, method } = w;
  // The assessment's address box's one script (src/modules/assessment/address-lookup-script.ts).
  if (path === '/assets/address-lookup.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(ADDRESS_LOOKUP_JS); return 'handled';
  }
  return undefined;
}

/** A client's own login from the assessment, and the assessment itself. */
export async function assessmentRoutes(w: WebRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, path, method, actor, newId, now, legalServed } = w;
  const { requestSignup, verifyOpen, confirmSignup, offerSignup } = signupParts();
  const { currentTermsVersions } = termsParts();
  /* ------------------------------------------ a client's own login */
  if (path === '/account/create' && method === 'POST') {
    const r = await requestSignup(d.app, d.publicOrigin ?? 'http://localhost:8103', await form(req), legalServed ? currentTermsVersions() : null);
    if (!r.ok) { html(res, 400, simple('Your login was not created', r.why)); return 'handled'; }
    html(res, 200, simple('Check your email',
      'If that address can be given a login, we have sent it a link. Open the link to confirm the address and finish creating your login. It works once, for 24 hours.'));
    return 'handled';
  }
  if (path === '/account/verify' && method === 'GET') {
    const token = url.searchParams.get('token') ?? '';
    if (!verifyOpen(d.app, token)) { html(res, 400, simple('This link is no longer valid', 'It works once, for 24 hours. Your assessment is still with us; telephone us and we will set up your login.')); return 'handled'; }
    html(res, 200, page({ title: 'Confirm your login', nav: nav(actor),
      body: h`<h1>Confirm your login</h1><p>Press the button to confirm your email address and create your login.</p>
        <form method="post" action="/account/verify"><input type="hidden" name="token" value="${token}">
        <button class="cta" type="submit">Confirm and create my login</button></form>` }));
    return 'handled';
  }
  if (path === '/account/verify' && method === 'POST') {
    const r = confirmSignup(d.app, (await form(req)).get('token') ?? '', newId);
    if (!r.ok) { html(res, 400, simple('Your login was not created', r.why)); return 'handled'; }
    html(res, 200, page({ title: 'Your login is ready', nav: nav(actor),
      body: h`<h1>Your login is ready.</h1><p>Sign in with the address and password you chose to follow your claim.</p>
        <p><a class="cta" href="/login">Log in</a></p>` }));
    return 'handled';
  }

  /* ------------------------------------------------------- assessment */
  if (path === '/assessment' && method === 'GET') {
    const draft = newDraft(d.app.db, now, newId);
    setCookie(res, DRAFT_COOKIE, draft.token, 60 * 60 * 6);
    // The assessment opens on stage 1 of the four-stage funnel (src/modules/assessment/funnel4.ts).
    redirect(res, '/assessment/buildings'); return 'handled';
  }

  /* The first screen of 29 September (the company and the property up front) is retired: the four-stage
     funnel asks for them per building, at stage 3. An old link to it opens stage 1. */
  if (path === '/assessment/start') { redirect(res, '/assessment/buildings'); return 'handled'; }

  /* THE FOUR-STAGE FUNNEL (src/modules/assessment/funnel4.ts). Buildings, then the checks per building, then who
     owns each and where, then the figure. The server keeps a person on the first screen that is not complete, and a
     follow-up that does not apply is not kept. */
  /* THE ADDRESS BOX'S LIST, FOR THE PAGE'S SCRIPT. The postcode a person has typed on "Your details",
     once it is a complete UK postcode: the addresses there, as JSON, through the same search (and the same £1 a day
     cap) as the "Find my address" button. Only for an assessment already at that screen. */
  if (path === '/assessment/details/addresses' && method === 'POST') {
    const draft = loadDraft(d.app.db, cookie(req, DRAFT_COOKIE));
    const s = draft === undefined ? undefined : draft.state as unknown as Record<string, unknown>;
    const lookups = f4Lookups(d.app);
    const f = await form(req);
    const b = s !== undefined && isFunnel4(s) && F4_SCREENS.indexOf(firstIncomplete(s) ?? 'details') >= F4_SCREENS.indexOf('details')
      ? buildings(s)[Number(f.get('building') ?? 'x')] : undefined;
    if (draft === undefined || s === undefined || b === undefined || !lookups.address) {
      res.writeHead(404, JSON_HEADERS); res.end(JSON.stringify({ addresses: [], why: 'Please type your address below.' })); return 'handled';
    }
    const pc = normalisePostcode(f.get('postcode') ?? '');
    if (pc === null) { res.writeHead(200, JSON_HEADERS); res.end(JSON.stringify({ addresses: [], why: null })); return 'handled'; }
    if (b['postcode'] !== pc) { b['postcode'] = pc; delete b['postcode_check']; delete b['address_results']; delete b['address_searched_for']; b['address_id'] = null; b['uprn'] = null; }
    await addressSearch(d.app, s, b);
    saveDraft(d.app.db, draft, now);
    const found = (b['address_results'] ?? []) as { uprn: string; label: string; line1: string; town: string | null }[];
    res.writeHead(200, JSON_HEADERS);
    res.end(JSON.stringify({
      addresses: found.map((a) => ({ uprn: a.uprn, label: a.label, line1: a.line1, town: a.town })),
      why: found.length > 0 ? null : typeof b['address_note'] === 'string' ? b['address_note'] : null,
    }));
    return 'handled';
  }

  const f4 = F4_ROUTE.exec(path);
  if (f4 && (method === 'GET' || method === 'POST')) {
    const id = f4[1] as F4Screen;
    const draft = loadDraft(d.app.db, cookie(req, DRAFT_COOKIE));
    if (draft === undefined) { redirect(res, '/assessment'); return 'handled'; }
    const s = draft.state as unknown as Record<string, unknown>;
    const lookups = f4Lookups(d.app);
    // No jumping ahead: a screen past the first incomplete one sends the person back to that one.
    const gap = isFunnel4(s) ? firstIncomplete(s) : 'buildings';
    if (gap !== null && F4_SCREENS.indexOf(id) > F4_SCREENS.indexOf(gap)) { redirect(res, `/assessment/${gap}`); return 'handled'; }
    if (isFunnel4(s) && allGated(s) && F4_SCREENS.indexOf(id) > F4_SCREENS.indexOf('tax')) { redirect(res, '/assessment/no-claim'); return 'handled'; }
    if (method === 'GET') { f4Html(res, 200, f4Page(draft, id, actor, lookups, []), id, lookups); return 'handled'; }
    const posted = await form(req);
    const find = posted.get('find');
    const r = applyF4(s, id, posted);
    if (id === 'details' && find !== null) {
      const [what, at] = find.split(':');
      const b = buildings(s)[Number(at)];
      if (b !== undefined && what === 'company' && lookups.company) {
        const got = await searchCompanies({ name: typeof b['business_name'] === 'string' ? b['business_name'] : '', gate: lookups.gate,
          deps: { audit: d.app.audit, now: d.app.now, transport: d.app.outside }, secrets: d.app.secrets, config: lookups.companyConfig });
        b['company_results'] = got.state === 'FOUND' ? got.candidates : [];
        b['company_note'] = got.state === 'FOUND' ? null : got.state === 'NONE'
          ? 'No company matched that name. Check the spelling, or carry on with the name as you typed it.' : got.why;
      }
      if (b !== undefined && what === 'postcode' && lookups.postcode) {
        const got = await checkPostcode({ postcode: typeof b['postcode'] === 'string' ? b['postcode'] : '', gate: lookups.gate, config: lookups.postcodeConfig,
          deps: { audit: d.app.audit, now: d.app.now, transport: d.app.outside } });
        b['postcode_check'] = got.state === 'CHECKED' ? { postcode: got.postcode, council_area: got.council_area, region: got.region, country: got.country }
          : { not_found: got.state === 'NOT_FOUND' ? 'We could not find that postcode. Check it, or carry on with it as typed.' : got.why };
      }
      if (b !== undefined && what === 'address' && lookups.address) await addressSearch(d.app, s, b);
      saveDraft(d.app.db, draft, now); redirect(res, `/assessment/details#b${at ?? '0'}`); return 'handled';
    }
    saveDraft(d.app.db, draft, now);
    if (r.stay === true) { redirect(res, `/assessment/${id}`); return 'handled'; }
    if (r.errors.length > 0) { f4Html(res, 400, f4Page(draft, id, actor, lookups, r.errors), id, lookups); return 'handled'; }
    if (id === 'tax' && allGated(s)) { redirect(res, '/assessment/no-claim'); return 'handled'; }
    const next = F4_SCREENS[F4_SCREENS.indexOf(id) + 1];
    redirect(res, next === undefined ? '/assessment/figure' : `/assessment/${next}`); return 'handled';
  }

  /* The six screens of the first funnel are retired; an old link opens the four-stage funnel.
     Nothing they recorded is changed or deleted. Any request, GET or POST, with or without a draft, is sent to stage 1:
     no draft is made, read, saved or removed here. The privacy-notice link which sat on the old address
     screen (Q2), is drawn on the four-stage address screen ("details") instead, under the same switch. */
  if (/^\/assessment\/(Q1|Q1a|Q1b|Q1c|Q2|Q3)$/.test(path)) { redirect(res, '/assessment/buildings'); return 'handled'; }

  if (path === '/assessment/figure' && method === 'GET') {
    const draft = loadDraft(d.app.db, cookie(req, DRAFT_COOKIE));
    if (draft === undefined) { redirect(res, '/assessment'); return 'handled'; }
    // A four-stage draft sees its figure only when stage 3 is done.
    if (isFunnel4(draft.state)) {
      const s = draft.state as unknown as Record<string, unknown>;
      if (allGated(s)) { redirect(res, '/assessment/no-claim'); return 'handled'; }
      const gap = firstIncomplete(s);
      if (gap !== null) { redirect(res, `/assessment/${gap}`); return 'handled'; }
      html(res, 200, f4FigurePage(draft, actor, publicSlots(d.app.db, now()))); return 'handled';
    }
    // UC-C9: a reasoned negative never produces a figure.
    if (isGatedExit(draft.state)) { redirect(res, '/assessment/no-claim'); return 'handled'; }
    html(res, 200, figurePage(draft, actor)); return 'handled';
  }

  if (path === '/assessment/no-claim' && method === 'GET') {
    const draft = loadDraft(d.app.db, cookie(req, DRAFT_COOKIE));
    if (draft === undefined) { redirect(res, '/assessment'); return 'handled'; }
    // AND NOTHING ELSE REACHES IT. A draft the gate has not stopped — "not sure"
    // and never-asked among them — goes back to the screen it was on, so an
    // unknown is never shown a reasoned negative the engine did not give (C3, N4).
    if (!isGatedExit(draft.state)) { redirect(res, `/assessment/${draft.screen}`); return 'handled'; }
    html(res, 200, gatedExitPage(draft, actor)); return 'handled';
  }

  if (path === '/assessment/close') {
    const draft = loadDraft(d.app.db, cookie(req, DRAFT_COOKIE));
    if (draft === undefined) { redirect(res, '/assessment'); return 'handled'; }
    if (method === 'GET') {
      html(res, 200, closePage(draft, actor, undefined, publicSlots(d.app.db, now())));
      return 'handled';
    }
    if (method === 'POST' && isFunnel4(draft.state) && !allGated(draft.state as unknown as Record<string, unknown>)) {
      /* THE FOUR-STAGE CLOSE. First name, surname, position; then telephone (a time and the number),
         video call (a time and an email address) or email. One organisation per business that owns a building, each
         with its own lead, linked as one enquiry; the person is the contact on each; one booking, on the first. */
      const s = draft.state as unknown as Record<string, unknown>;
      if (firstIncomplete(s) !== null) { redirect(res, '/assessment/figure'); return 'handled'; }
      const f = await form(req);
      const err = applyReach(s, f, FUNNEL.ROLES as readonly (readonly [string, string])[], (ch, v) => contactValueProblem(ch, v));
      saveDraft(d.app.db, draft, now);
      if (err !== undefined) { html(res, 400, f4FigurePage(draft, actor, publicSlots(d.app.db, now()), err)); return 'handled'; }
      const out = submitEnquiry(d.app.db, draft, now, newId);
      let booked: { booked_at: string | null; booking_id: string | null } = { booked_at: null, booking_id: null };
      out.parts.forEach((p, k) => {
        d.app.audit.append({
          at: now(), kind: 'LEAD_CREATED', outcome: 'ALLOWED', actor_id: null, actor_role: null, object_type: 'lead', object_id: p.lead_id,
          detail: { business: p.business_id, origin: p.business_id === null ? 'GATED_EXIT' : 'ASSESSMENT', route: 'funnel4_close', enquiry: out.enquiry_id },
        });
        const holder = p.business_id !== null ? { business_id: p.business_id } : { lead_id: p.lead_id };
        const w = writeBookingAndContact(d, draft, holder, p.business_id === null ? 'gated_exit' : 'funnel_close', newId, k === 0);
        if (k === 0) booked = w;
        fireAutomation({ db: d.app.db, audit: d.app.audit, now, newId }, null, { trigger: 'LEAD_CREATED', lead_id: p.lead_id });
      });
      // A video call with a time gets its Zoom meeting now, and its invitation carries the link.
      let video: { join: string | null } | undefined;
      if (booked.booking_id !== null && booked.booked_at !== null && (s['contact'] as Record<string, unknown>)['channel'] === 'video') {
        await reconcileVideoMeeting(d.app, booked.booking_id);
        sendVideoInvite(d.app, d.publicOrigin ?? 'http://localhost:8103', booked.booking_id, 'arranged');
        const m = activeMeeting(d.app.db, booked.booking_id);
        video = { join: m === undefined ? null : `/call/${m.client_token}` };
      }
      const first = out.parts.find((p) => p.business_id !== null && p.assessment_id !== null);
      const offer = first !== undefined ? offerSignup(d.app, newId, first.business_id as string, first.assessment_id) : undefined;
      const totals = { business_id: first?.business_id ?? '', assessment_id: first?.assessment_id ?? out.enquiry_id,
        low_pence: out.parts.reduce((a, p) => a + (p.low_pence ?? 0), 0) || null, high_pence: out.parts.reduce((a, p) => a + (p.high_pence ?? 0), 0) || null };
      html(res, 200, submittedPage(totals, booked, actor, actor === undefined ? offer : undefined, true, video, sendingOn(EMAIL_SENDING, smtpLoginFromKeyFile(d.app.secrets), mailWhere(d.app)), legalServed)); return 'handled';
    }
    if (method === 'POST') {
      const f = await form(req);
      const err = applyClose(draft, f);
      if (err !== undefined) {
        html(res, 400, closePage(draft, actor, err, publicSlots(d.app.db, now())));
        return 'handled';
      }
      saveDraft(d.app.db, draft, now);
      if (isGatedExit(draft.state)) {
        /* THE CALL FROM THE REASONED NEGATIVE — the gated-exit repair. There is no
           property and no sector, so `submit()` cannot run and must not: it would
           invent an organisation for a funnel that produced no figure. This used
           to answer 500 and write nothing. A LEAD is recorded with no
           organisation, and the person and the channel go onto a contact and a
           booking that belong to it, in one transaction (migration 011, row E22). */
        const closed = closeGatedExit(d.app.db, draft, now, newId,
          (lead_id) => writeBookingAndContact(d, draft, { lead_id }, 'gated_exit', newId));
        d.app.audit.append({
          at: now(), kind: 'LEAD_CREATED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
          object_type: 'lead', object_id: closed.lead_id,
          detail: { business: null, origin: 'GATED_EXIT', route: 'gated_exit' },
        });
        /* CRM 3 of 10: "lead created" fires for a GATED_EXIT lead with no organisation too. A rule whose
           effect needs an organisation records that it did not run; the lead is never skipped silently. */
        fireAutomation({ db: d.app.db, audit: d.app.audit, now, newId }, null, { trigger: 'LEAD_CREATED', lead_id: closed.lead_id });
        html(res, 200, gatedThankYouPage(closed.written, actor)); return 'handled';
      }
      const out = submit(d.app.db, draft, now, newId);
      // The client asked us to leave the lookups alone. Kept with their organisation.
      if ((draft.state as Record<string, unknown>)['lookups_declined'] === true) recordLookupsDeclined({ db: d.app.db, audit: d.app.audit, now }, out.business_id);
      // CRM 2 of 10: the funnel records a LEAD, and the claim waits for the
      // enquiry gate. There is no actor — a prospect has no account — and the
      // detail carries ids only.
      d.app.audit.append({
        at: now(), kind: 'LEAD_CREATED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
        object_type: 'lead', object_id: out.lead_id,
        detail: { business: out.business_id, origin: 'ASSESSMENT', route: 'funnel_close' },
      });
      const booked = writeBookingAndContact(d, draft, { business_id: out.business_id }, 'funnel_close', newId);
      // The offer of a login for this organisation, made once, here, and only here.
      const offer = offerSignup(d.app, newId, out.business_id, out.assessment_id);
      // CRM 3 of 10: lead created → a first follow-up, waiting with Sales until somebody takes it.
      fireAutomation({ db: d.app.db, audit: d.app.audit, now, newId }, null, { trigger: 'LEAD_CREATED', lead_id: out.lead_id });
      html(res, 200, submittedPage(out, booked, actor, actor === undefined ? offer : undefined, false, undefined, false, legalServed)); return 'handled';
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * applying a screen's answers — server-side, always
 * ------------------------------------------------------------------ */

/**
 * — THE FUNNEL'S CLOSE NEEDS A WAY TO REACH THE PERSON, on the channel they chose:
 * an email address for email, a telephone number for a call or a text. Blank, or not one, is refused in words, and
 * nothing is saved. "We must get contact details, it is a non negotiable".
 */
export function contactValueProblem(channel: string, value: string): string | undefined {
  if (channel === 'email') {
    if (value === '') return 'We need your email address so we can reach you.';
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : 'That does not look like an email address. Please check it.';
  }
  if (value === '') return 'We need your telephone number so we can reach you.';
  const digits = value.replace(/\D/g, '').length;
  return /^[0-9+()\-\s]+$/.test(value) && digits >= 10 && digits <= 15 ? undefined : 'That does not look like a telephone number. Please check it.';
}

function applyClose(draft: Draft, f: URLSearchParams): string | undefined {
  const c = (draft.state as { contact: Record<string, unknown> }).contact;
  const name = (f.get('full_name') ?? '').trim();
  const channelId = f.get('channel') ?? '';
  const channels = BOOKING.CHANNELS;
  if (name.length === 0) return 'We need a name to know who we are calling.';
  if (!channels.some((ch) => ch.id === channelId)) return 'Choose how you would like us to reach you.';
  // Contact details are not optional. No way to reach them, no client.
  const reach = contactValueProblem(channelId, (f.get('contact_value') ?? '').trim());
  if (reach !== undefined) return reach;
  if (f.get('contact_consent') !== 'on') {
    return 'We need your permission to contact you about this. It is not marketing consent.';
  }
  c.full_name = name;
  // The box is filled from the first screen; left empty, the first screen's name stands.
  c.business_name = (f.get('business_name') ?? '').trim() || (typeof c.business_name === 'string' && c.business_name.trim() !== '' ? c.business_name : null);
  c.job_role = f.get('job_role');
  c.channel = channelId;
  c.contact_value = (f.get('contact_value') ?? '').trim() || null;
  c.sms_variant = channelId === 'sms_whatsapp' ? (f.get('sms_variant') ?? 'sms') : null;
  c.contact_consent = true;
  c.marketing_optin = f.get('marketing_optin') === 'on';
  /* THE CHOSEN MOMENT, IF THEY CHOSE ONE.
     Only the telephone books a moment — CB_BOOKING.booksASlot is the authority
     and the bookings table refuses a time on any other channel — so a slot
     posted alongside email or text message is DROPPED rather than refused: the
     client is not doing anything wrong, they have simply left a radio button
     selected from before they changed channel. Whether the moment is still free
     is decided at the write, not here. */
  c.slot = channelId === 'phone' ? (f.get('slot') ?? null) : null;
  return undefined;
}

/**
 * The lead is written at the funnel close, which is what CB_BOOKING says:
 * "The lead is written HERE. Account creation is the next screen and it is
 * skippable, so a caller that defers persistence to it loses the client
 * entirely."
 *
 * AND AT THE REASONED NEGATIVE, where there is no organisation. The same two
 * rows are written in the same words, with the LEAD in place of the organisation
 * (migration 011, disposition row E22). The contact holds the address the
 * prospect typed, because there is no organisation row to hold it; the booking
 * holds its slot where `isBookable` looks, so nobody else is offered that moment.
 */
function writeBookingAndContact(
  d: WebDeps, draft: Draft, holder: { business_id: string } | { lead_id: string },
  entry_point: 'funnel_close' | 'gated_exit', newId: () => string,
  /** False for the second and later businesses of one enquiry — the person, not a second call. */
  withBooking = true,
): { booked_at: string | null; booking_id: string | null } {
  const c = (draft.state as { contact: Record<string, unknown> }).contact;
  const at = d.app.now();
  const business_id = 'business_id' in holder ? holder.business_id : null;
  const lead_id = 'lead_id' in holder ? holder.lead_id : null;
  // The person's own contact holds the address they typed, at the funnel close too. It was
  // kept only on the organisation there, which left every website client with a contact nobody could reach.
  const typed = typeof c.contact_value === 'string' && c.contact_value.trim() !== '' ? c.contact_value.trim() : null;
  insertContacts4(d.app.db, [newId(), business_id, lead_id, String(c.full_name ?? ''), c.job_role as string | null,
     c.job_role_other as string | null, c.contact_consent === true ? 1 : 0,
     c.marketing_optin === true ? 1 : 0, c.whatsapp_optin === true ? 1 : 0,
     c.channel === 'email' || c.channel === 'video' ? typed : null,
     c.channel === 'phone' || c.channel === 'sms_whatsapp' ? typed : null, at]);
  if (!withBooking) return { booked_at: null, booking_id: null };

  /* THE SLOT IS RE-CHECKED HERE AGAINST THE WORKING TIMES, NOT TRUSTED.
     The picker showed what was free when the page was drawn. By now somebody
     else may have taken it, and a caller who never loaded the page can post
     whatever they like — so `isBookable` asks the same working times again, at
     the moment of writing. That is what makes "a slot outside a user's working
     hours must not be offerable" a property of the STORE.
     A TAKEN OR INVALID SLOT DOES NOT LOSE THE LEAD. The booking is written
     without a time and lands in the back office's "asked for a call, no time
     yet" queue, which is exactly where a request nobody could place belongs.
     Refusing the whole submission over a race would throw away the client. */
  const wanted = typeof c.slot === 'string' && c.slot !== '' ? c.slot : null;
  let starts: string | null = null;
  let ends: string | null = null;
  let owner: string | null = null;
  if (wanted !== null) {
    const check = isBookable(d.app.db, wanted, { now: at });
    if (check.ok) {
      starts = wanted;
      ends = new Date(Date.parse(wanted) + SLOT_MINUTES * 60_000).toISOString();
      owner = check.user_id;
    }
  }

  const booking_id = newId();
  insertBookings2(d.app.db, [booking_id, business_id, lead_id, owner, String(c.channel), c.sms_variant as string | null,
     entry_point, starts, ends, at]);
  // CRM 2 of 10: the booking belongs to the lead the submission just opened. A
  // lead with no organisation cannot carry `booking_id` — the leads table refuses
  // it without one — so its booking points at the lead instead, and conversion
  // hands the lead its booking once the organisation exists.
  if (business_id !== null) linkBookingToLead(d.app.db, business_id, booking_id, at);
  /* A CALL GIVEN A TIME HERE GETS ITS INVITATION TOO, like one given a time by staff or moved by the
     client — the same email, the same .ics, the same switch (EMAIL_SENDING, off). With no email address recorded,
     nothing is written: the call still stands, and staff reach them the way they asked. */
  // A VIDEO call's invitation waits for its meeting, so it carries the link (sendVideoInvite, below).
  if (starts !== null && ends !== null && c.channel !== 'video') {
    const to = business_id !== null
      ? getBusinessesEById<{ e: string | null }>(d.app.db, [business_id])?.e ?? null
      : null;
    const invite = bookingInviteFile(d.app.db, d.app.now, { booking_id, method: 'REQUEST', starts_at: starts, ends_at: ends, to });
    if (invite !== null && to !== null) {
      d.app.email.send({
        to_email: to,
        subject: `Your call with Cap Rebate — ${localWhen(starts)}`,
        body: `A telephone call has been arranged for ${localWhen(starts)}, lasting ${SLOT_MINUTES} minutes.\n\n` +
          'Not sent yet. Emails and calendar invites are not switched on yet. ' +
          'This message and its invite are saved with the emails waiting to send.',
        kind: 'CALENDAR_INVITE',
        business_id,
        inline_files: [invite],
      });
    }
  }
  return { booked_at: starts, booking_id };
}

/* ------------------------------------------------: the four-stage funnel's pages */

type F4Lookups = {
  readonly gate: ReturnType<typeof freeGate>; readonly company: boolean; readonly postcode: boolean;
  readonly companyConfig: typeof COMPANY_SEARCH; readonly postcodeConfig: typeof POSTCODE_CHECK;
  /** "Find my address": its switch, its key and its outside-call row. */
  readonly address: boolean;
};

/** Whether each lookup at stage 3 can run: its gate, its switch and, for Companies House, its key. Tests may set all three. */
function f4Lookups(app: WebDeps['app']): F4Lookups {
  const o = app.startLookups;
  const gate = o?.gate ?? freeGate();
  const companyConfig = o?.company ?? COMPANY_SEARCH;
  const postcodeConfig = o?.postcode ?? POSTCODE_CHECK;
  return { gate, companyConfig, postcodeConfig,
    company: companySearchOffered(companyConfig, gate, app.secrets),
    postcode: postcodeCheckMissing(postcodeConfig, gate).length === 0,
    address: addressLookupMissing(app.addressLookup?.config ?? ADDRESS_LOOKUP, app.secrets, app.addressLookup?.policy).length === 0 };
}

/**
 * ONE SEARCH FOR THE ADDRESS BOX, for the button and the page's script alike. A postcode already searched
 * in this assessment is not searched again (the list stands, and narrowing it is free); otherwise Homedata is asked once,
 * inside the £1 a day cap (today's searches from the audit log, and this visitor's from the draft).
 */
async function addressSearch(app: WebDeps['app'], s: Record<string, unknown>, b: Record<string, unknown>): Promise<void> {
  const pc = typeof b['postcode'] === 'string' ? normalisePostcode(b['postcode']) : null;
  if (pc !== null && b['address_searched_for'] === pc) return;
  const visitor = typeof s['address_searches'] === 'number' ? s['address_searches'] : 0;
  const got = await findAddresses({
    postcode: typeof b['postcode'] === 'string' ? b['postcode'] : '', secrets: app.secrets,
    deps: { audit: app.audit, now: app.now, transport: app.outside },
    used: { today: searchesToday(app.db, app.now()), visitor },
    ...(app.addressLookup === undefined ? {} : { config: app.addressLookup.config, ...(app.addressLookup.policy === undefined ? {} : { policy_override: app.addressLookup.policy }) }),
  });
  if (got.searched) { s['address_searches'] = visitor + 1; b['address_searched_for'] = pc; }
  b['address_results'] = got.state === 'FOUND' ? got.addresses : [];
  b['address_note'] = got.state === 'FOUND' ? null : got.why;
}

/** The funnel's pages, with the address box's one script on "Your details" while "Find my address" is on. */
function f4Html(res: ServerResponse, status: number, body: string, id: F4Screen, lookups: F4Lookups): void {
  if (id !== 'details' || !lookups.address) { html(res, status, body); return; }
  res.writeHead(status, { ...HTML_HEADERS, 'content-security-policy': ADDRESS_PAGE_CSP });
  res.end(body.replace('</body>', '<script src="/assets/address-lookup.js" defer></script></body>'));
}

/** The details page's policy: every page's, plus OUR OWN script and calls back to this site. Nothing else loosened. */
export const ADDRESS_PAGE_CSP = "default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'self'; connect-src 'self'; " +
  "form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

function f4Page(draft: Draft, id: F4Screen, actor: Actor | undefined, lookups: F4Lookups, errors: readonly string[]): string {
  const s = draft.state as unknown as Record<string, unknown>;
  const t = F4_TEXT[id];
  return page({
    title: t.heading, nav: nav(actor),
    body: h`${stageBar(stageOf(id))}
      <h1 class="f4-h">${t.heading}</h1>
      <p class="help">${t.help}</p>
      ${errors.length === 0 ? raw('') : h`<div class="err" role="alert"><p>Please check these:</p><ul>${errors.map((e) => h`<li>${e}</li>`)}</ul></div>`}
      <form method="post" action="/assessment/${id}" class="f4-form f4-${id}">
        <button type="submit" class="vh" tabindex="-1" aria-hidden="true">Continue</button>
        ${id === 'details' ? noticeAtAddress(registryGate()) : raw('')}
        ${screenBody(s, id, lookups)}
        <p class="f4-nav">${F4_SCREENS.indexOf(id) > 0 ? h`<a class="f4-back" href="/assessment/${F4_SCREENS[F4_SCREENS.indexOf(id) - 1] ?? 'buildings'}">← Back</a>` : raw('')}
        <button class="cta" type="submit">${id === 'details' ? 'Show my figure →' : 'Continue →'}</button></p>
      </form>`,
  });
}

function f4FigurePage(draft: Draft, actor: Actor | undefined, slots: ReturnType<typeof publicSlots>, error?: string): string {
  return page({
    title: 'Your figure', nav: nav(actor),
    body: h`${stageBar(3)}${figureBody(draft.state as unknown as Record<string, unknown>, slots, error, FUNNEL.ROLES as readonly (readonly [string, string])[])}`,
  });
}

function radios(name: string, opts: readonly { value: string; label: string }[], selected: unknown): Safe {
  return h`<div class="opts">${opts.map((o) => h`
    <label class="opt${o.value === selected ? ' sel' : ''}">
      <input type="radio" name="${name}" value="${o.value}"${o.value === selected ? raw(' checked') : raw('')}>
      ${o.label}
    </label>`)}</div>`;
}

/**
 * THE FIGURE, AND WHY IT GOES THROUGH shown-range.ts.
 *
 * This used to round the funnel's float straight to pounds. `assessments`
 * stores integer PENCE, so the back office was rounding a different number and
 * the two agreed almost always — which is the worst property a client-facing
 * figure can have. Pounds become pence once, in `toPence`, and every screen
 * that shows this figure renders `formatPence` of that integer: this page, the
 * client's portal, and both staff screens. One conversion, one formatter, no
 * second rounding. A test drives the funnel over HTTP and asserts the string
 * from this page appears on the staff page.
 */
function money(n: unknown): string {
  return typeof n === 'number' ? formatPence(toPence(n)) : '—';
}

function figurePage(draft: Draft, actor: Actor | undefined): string {
  const f = FUNNEL.figure(draft.state);
  const many = (f.count ?? 1) > 1;
  const assumptions = FUNNEL.assumptions(draft.state) as string[];
  return page({
    title: 'Your indicative range', nav: nav(actor),
    body: h`
      <div class="rung">Indicative · based only on what you have told us</div>
      <h2>${many ? `Across your ${f.count} properties, you could be entitled to up to` : 'You could be entitled to up to'}</h2>
      <div class="figbig">${money(f.total)}</div>
      ${many ? h`<table><tbody>${(f.breakdown ?? []).map((p) => h`
        <tr><td>${p.address ?? 'This property'}</td><td>up to ${money(p.ceiling)}</td></tr>`)}</tbody></table>` : raw('')}
      ${(f.incompleteProperties ?? []).map((p) => h`
        <div class="flag"><strong>${p.address ?? 'One property'}</strong> — ${p.why ?? 'we need to talk this one through'}</div>`)}
      <p class="help">of qualifying plant and fixtures. <strong>A ceiling, not a forecast</strong> — this is the
      top of the range, and researching the ${many ? 'properties' : 'property'} will move it
      <strong>down</strong>, not up.</p>
      <div class="assumebox"><strong>What this figure assumes</strong>
        <ul>${assumptions.map((a) => h`<li>${a}</li>`)}</ul></div>
      <p><a class="cta" href="/assessment/close">Find out what you are entitled to →</a></p>`,
  });
}

/**
 * THE REASONED NEGATIVE — screen C3. The site's own `screenExit`, ported as every
 * other screen here is: its heading, the line under it, THE GATE'S REASON IN THE
 * ENGINE'S WORDS, and the note about later spend — then CB_BOOKING's gated-exit
 * offer and the call to action. The page this replaced printed no reason and a
 * sentence the site never said; nobody saw it, because the gate never fired.
 * Only a draft the engine has stopped reaches it — the router asks.
 */
function gatedExitPage(draft: Draft, actor: Actor | undefined): string {
  const g = FRONTDOOR.gateQ1b(draft.state);
  const o = BOOKING.offerAt('gated_exit') as { heading?: string; body?: string };
  return page({
    title: 'On these answers, there is likely little or no claim', nav: nav(actor),
    body: h`
      <div class="group">Result</div>
      <h2>On these answers, there is likely little or no claim</h2>
      <p class="help">And here is exactly why — not a dead end, and not a soft no.</p>
      <div class="assumebox"><strong>The reason.</strong><p>${g.message ?? ''}</p></div>
      <div class="assumebox"><strong>Still worth knowing.</strong><p>This says nothing about money you have spent since. Work you paid for yourself, like a fit-out, a refurbishment or new plant, is a separate claim with its own rules.</p></div>
      <h2>${o.heading ?? ''}</h2>
      <p class="help">${o.body ?? ''}</p>
      <p><a class="cta" href="/assessment/close">Talk to someone →</a></p>`,
  });
}

/**
 * THE THANK-YOU AT A REASONED NEGATIVE. It prints NO RANGE, because the prospect
 * was shown none, and it does not say an assessment was recorded, because none
 * was. What is true: the request is with us, and whether a time is held.
 */
function gatedThankYouPage(booked: { booked_at: string | null }, actor: Actor | undefined): string {
  return page({
    title: 'Thank you', nav: nav(actor),
    body: h`
      <h1>Thank you — that is with us.</h1>
      <p>Somebody will be in touch through the channel you chose.</p>
      ${booked.booked_at !== null
        ? h`<p>We have held <strong>${clockOf(booked.booked_at)}</strong> for your call.</p>
            <p class="help">The calendar invitation has not been sent yet.</p>`
        : h`<p class="help">No time is held yet. Either the way you chose to talk does not book a time,
            or the time you picked had gone. We will ring you to arrange one.</p>`}
      <p class="help">Nothing has been looked up about you or your business.</p>`,
  });
}

function closePage(
  draft: Draft, actor: Actor | undefined, error: string | undefined,
  slots: ReturnType<typeof publicSlots>,
): string {
  // The offer for where the prospect is. At a reasoned negative there is no
  // figure above this form, and the funnel close's own words say there is.
  const o = BOOKING.offerAt(isGatedExit(draft.state) ? 'gated_exit' : 'funnel_close') as { heading?: string; body?: string };
  // A CHANNEL WHOSE PROCESSOR IS NOT DECLARED MUST NOT RENDER. Nothing has been
  // declared in this build, so WhatsApp/SMS does not appear — CB_BOOKING is
  // asked rather than second-guessed.
  const declaredProcessors: string[] = [];
  const channels = BOOKING.renderableChannels(declaredProcessors) as { id: string; label: string }[];
  const roles = FUNNEL.ROLES as [string, string][];
  return page({
    title: 'Speak to us', nav: nav(actor),
    body: h`
      <div class="group">Speak to us</div>
      <h2>${o.heading ?? ''}</h2>
      <p class="help">${o.body ?? ''}</p>
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      <form method="post" action="/assessment/close">
        <label class="fl" for="close-full-name">Your name</label>
        <input class="fi" id="close-full-name" name="full_name" autocomplete="name" required>
        <label class="fl" for="close-business-name">Your business</label>
        <input class="fi" id="close-business-name" name="business_name" value="${(draft.state as { contact?: { business_name?: string | null } }).contact?.business_name ?? ''}" autocomplete="organization">
        <label class="fl">Your role in the business</label>
        ${radios('job_role', roles.map(([v, l]) => ({ value: v, label: l })), null)}
        <label class="fl">How would you like us to reach you?</label>
        ${radios('channel', channels.map((c) => ({ value: c.id, label: c.label })), null)}
        <label class="fl" for="close-contact-value">Your telephone number or email address</label>
        <input class="fi" id="close-contact-value" name="contact_value" required>
        <label class="fl">If you chose the telephone, when suits you?</label>
        ${slots.available
          ? h`<p class="help">${zoneNotice(slots.slots[0]?.starts_at ?? '')}</p>
              <div class="opts">${slots.slots.slice(0, 24).map((sl) => h`
              <label class="opt"><input type="radio" name="slot" value="${sl.starts_at}">
                ${clockOf(sl.starts_at)}</label>`)}
              <label class="opt"><input type="radio" name="slot" value="" checked>
                I would rather you rang to arrange a time</label></div>`
          : h`<div class="flag">${slots.say}</div>`}
        <label class="ck"><input type="checkbox" name="contact_consent"> Yes, you may contact me about this enquiry.</label>
        <label class="ck"><input type="checkbox" name="marketing_optin"> Separately, you may send me occasional updates. (Optional, and never a condition of submitting.)</label>
        <button class="cta" type="submit">Send</button>
      </form>
      <div class="gate">Only a telephone call books a set time. Text message and WhatsApp are not offered yet.${why(h`WhatsApp is run by
      another firm. It is not yet on our public list of firms that handle your data, so we do not offer it.
      If you choose email, or a call with no set time, we take your details and contact you.`)}</div>`,
  });
}

function submittedPage(
  out: { business_id: string; assessment_id: string; low_pence: number | null; high_pence: number | null },
  booked: { booked_at: string | null }, actor: Actor | undefined, offer?: string,
  /** The four-stage funnel shows "up to" a figure, not a range, so the thank-you says what was shown. */
  upTo = false,
  /** A video call with a time: its join page when the meeting was made, else null (the link will follow). */
  video?: { join: string | null },
  /** Whether emails are being sent, so the page does not say an invitation is unsent when it is going. */
  sending = false,
  /** Where the legal pages are served, the sign-up asks for the tick that the person has read them. */
  agreement = false,
): string {
  const { MIN_PASSWORD } = signupParts();
  const { agreementTick } = termsParts();
  return page({
    title: 'Thank you', nav: nav(actor),
    body: h`
      <h1>Thank you — that is with us.</h1>
      <p>We have your assessment, and our team can see it. Somebody will be in touch
      through the channel you chose.</p>
      ${upTo && out.high_pence !== null
        ? h`<p>The figure you were shown: <strong>up to ${formatPence(out.high_pence)}</strong>.</p>`
        : h`<p>The figure you were shown: <strong>${formatShownRange(out)}</strong>.</p>`}
      ${booked.booked_at !== null
        ? h`<p>We have held <strong>${clockOf(booked.booked_at)}</strong> for your ${video === undefined ? 'call' : 'video call'}.</p>
            ${video === undefined ? raw('') : video.join !== null
              ? h`<p>Your video call link: <a href="${video.join}">join the call here</a>. It opens half an hour before the call.${sending ? " We are emailing it to you too, with Zoom's own link if you would rather use the Zoom app." : ''}</p>`
              : h`<p class="help">We will email you the link for the video call before it starts.</p>`}
            <p class="help">${sending ? 'We are emailing you the calendar invitation now.' : 'The calendar invitation has not been sent yet.'}</p>`
        : h`<p class="help">No time is held yet. Either the way you chose to talk does not book a time,
            or the time you picked had gone. We will ring you to arrange one.</p>`}
      <p class="help">Your reference: <code>${out.assessment_id}</code>. We looked up your postcode only to find your address. No property registers have been checked yet.</p>
      ${offer === undefined ? h`<p><a href="/login">Log in to your claim</a></p>` : h`
      <div class="pblock"><div class="pnum">Follow your claim online</div>
        <p class="help">Create a login to see your claim, your call and your documents. We send a link to your email address
        to confirm it; the login is created only when you open that link. This is optional.</p>
        <form method="post" action="/account/create"><input type="hidden" name="offer" value="${offer}">
          <label class="fl" for="signup-email">Your email address</label><input class="fi" id="signup-email" type="email" name="email" autocomplete="email" maxlength="254" required>
          <label class="fl" for="signup-name">Your name</label><input class="fi" id="signup-name" name="display_name" autocomplete="name" maxlength="200" required>
          <label class="fl" for="signup-password">Choose a password (at least ${MIN_PASSWORD} characters)</label><input class="fi" id="signup-password" type="password" name="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required>
          ${agreement ? agreementTick() : raw('')}
          <button class="cta" type="submit">Create my login</button>
        </form>
        <p class="help">Already have one? <a href="/login">Log in</a>.</p></div>`}`,
  });
}
