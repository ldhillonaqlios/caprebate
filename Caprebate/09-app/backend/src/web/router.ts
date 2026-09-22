/**
 * THE WEB HALF'S ROUTES — the public site, the assessment, the login and the
 * client portal. Block C of the Developer Build Order.
 *
 * ONE PROCESS, BOTH APPLICATIONS. This mounts alongside the JSON API in
 * src/server.ts; there is no second server, no second session store and no
 * second authorisation function.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THREE RULES THAT SHOW UP IN EVERY HANDLER BELOW
 *
 * 1. AUTHORISE ON THE OBJECT, ON EVERY REQUEST. Handlers do not branch on a
 *    role. They fetch the row and hand it to `authorise`, which is why an id
 *    swapped in the URL returns a refusal rather than a page.
 *
 * 2. NO STATIC FILE ROUTE. Nothing here maps a request path onto the
 *    filesystem — the only asset is a string constant, and
 *    `assertNoStaticFileRoute` reads this file's own source to keep that true.
 *    That is the first half of requirement DB-W1.
 *
 * 3. ESCAPE ON OUTPUT. Every response is built with the `h` tagged template in
 *    html.ts, which escapes anything that is not already Safe. There is no
 *    string concatenation of markup anywhere in this file.
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from '../app.ts';
import { authorise, can, NotAuthorised, type Actor } from '../authz.ts';
import type { Db } from '../db.ts';
import { authenticate, login, logout, AuthError, SESSION_COOKIE_NAME, GENERIC_AUTH_FAILURE } from '../auth.ts';
import { toActor } from '../users.ts';
import { SITE_CSS, CSS_HEADERS, PNG_HEADERS } from './assets.ts';
import { LOGO_INK_PNG } from './brand-logo.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { FUNNEL, FRONTDOOR, BOOKING, registryGate } from './engine.ts';
import {
  SCREEN_IDS, SCREENS, OPTIONS, COSMETIC_NOTE, asksProfit, nextScreen, isGatedExit, PAST_THE_GATE,
  newDraft, loadDraft, saveDraft, submit, closeGatedExit, type Draft, type ScreenId,
} from './assessment.ts';
import { loadLetter } from './letter.ts';
import * as P from './portal.ts';
import { ENGAGEMENT_SIGNING, shownLetter, signEngagement, signingMissing } from './signing.ts';
import { portalMessagesBody, readPortalSend, sendFromPortal } from './messages-pages.ts';
import { clientMessage, type ThreadMessage as MessageView } from './messages.ts';
import { FsObjectStore } from './objectstore.ts';
import { acceptClientBytes, finishUpload, issuedJob } from './uploads.ts';
import { singleFile } from './multipart.ts';
import { readUpload, receiveFile } from './client-files-pages.ts';
import { READ_AND_DELETED } from './originals.ts';
import { receivableTypes, startDocumentUpload, readLines, type RequestView } from './documents.ts';
import { handleStaff, handlePortalSettings } from './staff.ts';
import { mayEnterBackOffice, NotFoundAsRefusal } from './backoffice.ts';
import { navContext, staffShell, portalShell, type NameSwitches, type NavContext } from './navigation.ts';
import { badge, breadcrumb, card, claimRef, clientStageBar, propertyIn, savedMessage, welcomeCard, why } from './components.ts';
import { stepName } from './portal-steps.ts';
import { clientSteps, type ClientStep } from './approvals.ts';
import { clientStepsCard } from './approvals-pages.ts';
import { welcomeShown, dismissWelcome, WELCOME_JOBS } from './welcome.ts';
import { clientHelp } from './help.ts';
import { nameSwitches } from './navigation.ts';
import { publicSlots, isBookable, SLOT_MINUTES } from './schedule.ts';
import { bookingInviteFile } from './booking-invite.ts';
import { ga4MeasurementId, sitePolicy, withMeasurementId } from '../analytics.ts';
import { localStamp, localWhen, ukDate, ukDatesIn, zoneNotice } from './localtime.ts';
import { formatPence, formatShownRange, toPence, RANGE_QUALIFIER } from './shown-range.ts';
import { linkBookingToLead, SECTORS } from './leads.ts';
import { fireAutomation } from './automation.ts';
import {
  PROSPECT_EVENTS, REFERRAL_FORM, intakeReferral, referralFormOpen, clientShareChoices, recordShareConsentByClient, type ClientShareChoice,
} from './introducers.ts';
import { clientDeliverables, type ClientDeliverable } from './claim-record.ts';
import { siteEdition, SITE_PAGE_CSP, SITE_PAGE_HEADERS, SITE_JS_HEADERS } from './public-site.ts';
import { receiveEnquiry } from './enquiries.ts';
import { offerSignup, requestSignup, verifyOpen, confirmSignup, MIN_PASSWORD } from './signup.ts';

const DRAFT_COOKIE = 'cb_draft';

export type WebDeps = {
  app: App;
  store: FsObjectStore;
  newId?: () => string;
  /** CRM 5 of 10: the public referral form's gate. Absent is `REFERRAL_FORM`, shipped off. */
  referralForm?: { readonly enabled: boolean; readonly requires: string };
  /** PHASE 133c: the portal name switch (the menu switch went in Phase 135). Absent is `NAME_SWITCHES` in src/web/navigation.ts, off. */
  names?: NameSwitches;
  /**
   * PHASE 133j: the site's own address, for a link sent by email (a client's sign-up). CONFIGURED, NEVER TAKEN FROM THE
   * REQUEST'S Host header, which is whatever the sender typed. Absent is http://localhost:8103.
   */
  publicOrigin?: string;
};

/* ------------------------------------------------------------------ *
 * plumbing
 * ------------------------------------------------------------------ */

function cookie(req: IncomingMessage, name: string): string | undefined {
  const raw0 = req.headers.cookie;
  if (raw0 === undefined) return undefined;
  for (const part of raw0.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function setCookie(res: ServerResponse, name: string, value: string, maxAge: number): void {
  const prior = res.getHeader('set-cookie');
  const line = `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  res.setHeader('set-cookie', Array.isArray(prior) ? [...prior, line] : prior ? [String(prior), line] : [line]);
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

/** Bodies are capped. A cap is a control, not a nicety. */
async function readBody(req: IncomingMessage, max = 2 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = c as Buffer;
    size += b.length;
    if (size > max) throw new PayloadTooLarge();
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export class PayloadTooLarge extends Error {
  constructor() { super('body too large'); this.name = 'PayloadTooLarge'; }
}

async function form(req: IncomingMessage): Promise<URLSearchParams> {
  const typed = new URLSearchParams((await readBody(req)).toString('utf8'));
  // PHASE 133c: what the form carried is kept for this request, so a refusal can put it back where it was typed (B6).
  const scratch = navContext.getStore()?.form;
  if (scratch !== undefined) { scratch.typed = typed; scratch.action = new URL(req.url ?? '/', 'http://localhost').pathname; }
  return typed;
}

/**
 * PHASE 133c — A GET OF THE BACK OFFICE, DRAWN INTO A STRING, for `problem()` to redraw the page a refused form was on.
 * It is the ordinary route under the same login, so it shows exactly what that login's GET shows and nothing else.
 */
function captureResponse(): { res: ServerResponse; done: Promise<{ status: number; body: string }> } {
  let status = 200; const chunks: string[] = [];
  let finish: (v: { status: number; body: string }) => void = () => {};
  const done = new Promise<{ status: number; body: string }>((r) => { finish = r; });
  const fake = {
    headersSent: false,
    writeHead(code: number) { status = code; this.headersSent = true; return fake; },
    setHeader() { return fake; },
    write(c: string | Buffer) { chunks.push(String(c)); return true; },
    end(c?: string | Buffer) { if (c !== undefined) chunks.push(String(c)); finish({ status, body: chunks.join('') }); return fake; },
  };
  return { res: fake as unknown as ServerResponse, done };
}

/** Run a back-office or portal request inside its context, and wait for a refusal's redraw before the request ends. */
async function inContext(d: WebDeps, path: string, work: () => Promise<WebResult>, rerender?: NonNullable<NavContext['form']>['rerender']): Promise<WebResult> {
  const scratch: NonNullable<NavContext['form']> = rerender === undefined ? {} : { rerender };
  const ctx: NavContext = { db: d.app.db, now: d.app.now, path, form: scratch, ...(d.names === undefined ? {} : { names: d.names }) };
  return navContext.run(ctx, async () => {
    const r = await work();
    if (scratch.pending !== undefined) await scratch.pending;
    return r;
  });
}

function nav(actor: Actor | undefined): Safe {
  return actor === undefined
    ? h`<nav><a href="/assessment">Free assessment</a><a href="/login">Log in</a></nav>`
    // PHASE 133a: a signed-in person gets their application's header — the back office's for staff, the portal's for a client.
    : mayEnterBackOffice(actor) ? staffShell(actor) : portalShell(actor);
}

/**
 * PHASE 133a — THE REFUSAL, AS A PAGE. Which addresses answer a refusal with a page: the two applications' screens, and
 * not their data addresses, whose readers expect JSON or a file.
 */
export function refusalAsPage(path: string): boolean {
  const screen = path === '/staff' || path.startsWith('/staff/') || path === '/portal' || path.startsWith('/portal/');
  return screen && !/\.(json|csv)$/.test(path);
}

/** 403, with the signed-in person's own header and a way back. It names nothing about what was asked for. */
export function sendRefusalPage(app: App, res: ServerResponse, actor: Actor | undefined, path: string): void {
  const home = actor === undefined ? '/' : mayEnterBackOffice(actor) ? '/staff' : '/portal';
  const body = navContext.run({ db: app.db, now: app.now, path }, () => page({
    title: 'You cannot open this page', nav: nav(actor), wide: true,
    body: h`<div class="refusal card" role="alert"><p class="eyebrow">Not available to your login</p>
      <h1>You cannot open this page</h1>
      <p>Your login does not give access to it. That is the system working as it should, not a fault.</p>
      <p>If you think you need it for your work, ask an administrator.</p>
      <p><a class="btn btn-primary" href="${home}">Go to your home page</a></p></div>`,
  }));
  html(res, 403, body);
}

/* ------------------------------------------------------------------ *
 * the router
 * ------------------------------------------------------------------ */

export type WebResult = 'handled' | 'not-mine';

export async function handleWeb(d: WebDeps, req: IncomingMessage, res: ServerResponse): Promise<WebResult> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const newId = d.newId ?? randomUUID;
  const now = d.app.now;

  const session = authenticate(d.app.deps, cookie(req, SESSION_COOKIE_NAME));
  const actor: Actor | undefined = session ? toActor(session.user) : undefined;

  /* ---------------------------------------------------------- assets */
  if (path === '/assets/site.css' && method === 'GET') {
    res.writeHead(200, CSS_HEADERS); res.end(SITE_CSS); return 'handled';
  }
  // PHASE 133c: the supplied logo, from memory, like the stylesheet — never from a path on disk.
  if (path === '/assets/cap-rebate-logo.png' && method === 'GET') {
    res.writeHead(200, PNG_HEADERS); res.end(LOGO_INK_PNG); return 'handled';
  }

  /* ------------------------------------------------------ public site */
  /* PHASE 133j: THE WEBSITE IS `Caprebate site.html`, served from the one file (src/web/public-site.ts) with its style
     and script as two fixed assets. Its "Start your assessment" links come here, to /assessment, and its enquiry form
     to /enquiry. With no site file beside the build, `/` is the back end's own home page, as before. */
  if (path === '/assets/site-page.css' && method === 'GET') {
    const site = siteEdition();
    if (site !== undefined) { res.writeHead(200, CSS_HEADERS); res.end(site.css); return 'handled'; }
  }
  if (path === '/assets/site-page.js' && method === 'GET') {
    const site = siteEdition();
    if (site !== undefined) { res.writeHead(200, SITE_JS_HEADERS); res.end(site.js); return 'handled'; }
  }
  if (path === '/' && method === 'GET') {
    const site = siteEdition();
    if (site !== undefined) {
      // PHASE 146f: the analytics measurement id comes from the key file, not the file (src/analytics.ts). None, no change.
      const ga = ga4MeasurementId();
      res.writeHead(200, ga === null ? SITE_PAGE_HEADERS : { ...SITE_PAGE_HEADERS, 'content-security-policy': sitePolicy(SITE_PAGE_CSP, ga) });
      res.end(withMeasurementId(site.html, ga));
      return 'handled';
    }
    html(res, 200, home(actor)); return 'handled';
  }
  if (path === '/enquiry' && method === 'POST') {
    const r = receiveEnquiry(d.app.deps, newId, await form(req));
    if (!r.ok) {
      html(res, 400, page({ title: 'Your enquiry was not sent', nav: nav(actor),
        body: h`<h1>Your enquiry was not sent</h1><p class="err">${r.why}</p><p><a href="/#contact">Go back to the form</a></p>` }));
      return 'handled';
    }
    html(res, 200, page({ title: 'Thank you', nav: nav(actor),
      body: h`<h1>Thank you — that is with us.</h1><p>One of our team will reply within one working day, to the address you gave.</p>
        <p>If you would like a figure now, <a href="/assessment">start the free assessment</a>. It takes a few minutes.</p>
        <p><a href="/">Back to the website</a></p>` }));
    return 'handled';
  }

  /* ------------------------------------------ a client's own login (PHASE 133j) */
  if (path === '/account/create' && method === 'POST') {
    const r = await requestSignup(d.app, d.publicOrigin ?? 'http://localhost:8103', await form(req));
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
    const r = confirmSignup(d.app, (await form(req)).get('token') ?? '');
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
    redirect(res, '/assessment/Q1'); return 'handled';
  }

  const screenMatch = /^\/assessment\/(Q1|Q1a|Q1b|Q1c|Q2|Q3)$/.exec(path);
  if (screenMatch) {
    const id = screenMatch[1] as ScreenId;
    const draft = loadDraft(d.app.db, cookie(req, DRAFT_COOKIE));
    if (draft === undefined) { redirect(res, '/assessment'); return 'handled'; }
    // THE GATE HOLDS ON EVERY REQUEST, not only on the redirect from Q1b. A draft
    // the gate has stopped may go back to Q1, Q1a or Q1b and change its answer;
    // it may not open a screen past the gate by typing the address.
    if (PAST_THE_GATE.includes(id) && isGatedExit(draft.state)) {
      redirect(res, '/assessment/no-claim'); return 'handled';
    }
    if (method === 'GET') { html(res, 200, screenPage(draft, id, actor)); return 'handled'; }
    if (method === 'POST') {
      applyScreen(draft, id, await form(req));
      draft.screen = id;
      saveDraft(d.app.db, draft, now);
      const to = nextScreen(draft.state, id);
      redirect(res, to === 'figure' ? '/assessment/figure'
        : to === 'gated_exit' ? '/assessment/no-claim' : `/assessment/${to}`);
      return 'handled';
    }
  }

  if (path === '/assessment/figure' && method === 'GET') {
    const draft = loadDraft(d.app.db, cookie(req, DRAFT_COOKIE));
    if (draft === undefined) { redirect(res, '/assessment'); return 'handled'; }
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
      // CRM 2 of 10: the funnel records a LEAD, and the claim waits for the
      // enquiry gate. There is no actor — a prospect has no account — and the
      // detail carries ids only.
      d.app.audit.append({
        at: now(), kind: 'LEAD_CREATED', outcome: 'ALLOWED', actor_id: null, actor_role: null,
        object_type: 'lead', object_id: out.lead_id,
        detail: { business: out.business_id, origin: 'ASSESSMENT', route: 'funnel_close' },
      });
      const booked = writeBookingAndContact(d, draft, { business_id: out.business_id }, 'funnel_close', newId);
      // PHASE 133j: the offer of a login for this organisation, made once, here, and only here.
      const offer = offerSignup(d.app, newId, out.business_id, out.assessment_id);
      // CRM 3 of 10: lead created → a first follow-up, waiting with Sales until somebody takes it.
      fireAutomation({ db: d.app.db, audit: d.app.audit, now, newId }, null, { trigger: 'LEAD_CREATED', lead_id: out.lead_id });
      html(res, 200, submittedPage(out, booked, actor, actor === undefined ? offer : undefined)); return 'handled';
    }
  }

  /* ----------------------------------- the public referral form (CRM 5 of 10) */
  /* SHIPPED OFF. It collects another firm's client's details, so it waits on a published privacy notice that says
     so. WHILE THE GATE IS SHUT THE ROUTE DOES NOT EXIST: nothing is drawn, nothing is read from the body, and the
     request falls through exactly as a path that does not exist does — to a visitor with no session, the server's
     401, and to a signed-in one, its 404. When it is open it is the funnel's hardened path — a capped
     body, every field validated on the server, every value escaped on output, no script — and it writes through
     the same intake a member of staff uses, as a new firm that staff then check. */
  if (path === '/refer' && referralFormOpen(d.referralForm ?? REFERRAL_FORM)) {
    if (method === 'GET') { html(res, 200, referralFormPage(actor, undefined)); return 'handled'; }
    if (method === 'POST') {
      const f = await form(req);
      const fields: Record<string, string | null> = {};
      for (const k of ['firm_name', 'contact_name', 'contact_email', 'contact_phone', 'prospect_organisation', 'prospect_sector',
        'prospect_postcode', 'prospect_event', 'prospect_event_year', 'attest']) fields[k] = f.get(k);
      const r = intakeReferral({ db: d.app.db, audit: d.app.audit, now, newId }, null, fields, 'PUBLIC_FORM');
      if (!r.ok) { html(res, 400, referralFormPage(actor, r.why)); return 'handled'; }
      html(res, 200, simple('Thank you — the referral is with us',
        'We will contact your client ourselves. Nothing about their claim is shared with you unless they tell us they want it to be.'));
      return 'handled';
    }
  }

  /* ------------------------------------------------------------ login */
  if (path === '/login' && method === 'GET') {
    // PHASE 133j: the website's "Log in" button, pressed by somebody already signed in, goes straight to their home.
    if (actor !== undefined) { redirect(res, mayEnterBackOffice(actor) ? '/staff' : '/portal'); return 'handled'; }
    html(res, 200, loginPage(undefined)); return 'handled';
  }
  if (path === '/login' && method === 'POST') {
    const f = await form(req);
    try {
      const r = await login(d.app.deps, f.get('email') ?? '', f.get('password') ?? '');
      res.setHeader('set-cookie',
        `${r.cookie.name}=${r.cookie.value}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${new Date(r.cookie.expires).toUTCString()}`);
      // WHERE A SIGN-IN LANDS IS NAVIGATION, NOT A CONTROL — and it is still
      // asked of `can()` rather than of the role, so there is one place that
      // knows who the back office is for. Both destinations authorise
      // themselves; a client sent to /staff would be refused rather than shown
      // a page, which is why getting this wrong would be untidy and not unsafe.
      redirect(res, mayEnterBackOffice(toActor(r.user)) ? '/staff' : '/portal');
      return 'handled';
    } catch (e) {
      // GENERIC, ALWAYS. Never "no such user" — and `login` has already paid
      // for a password verification against a real hash so the timing does not
      // answer the question either.
      if (e instanceof AuthError) { html(res, 401, loginPage(GENERIC_AUTH_FAILURE)); return 'handled'; }
      throw e;
    }
  }
  if (path === '/logout' && method === 'POST') {
    if (session !== undefined) logout(d.app.deps, session.session_id, session.user);
    res.setHeader('set-cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
    redirect(res, '/'); return 'handled';
  }

  /* ------------------------------------------------------ back office */
  if (path === '/staff' || path.startsWith('/staff/')) {
    if (actor === undefined) { redirect(res, '/login'); return 'handled'; }
    // PHASE 133a: the header reads the database, the clock and the address from this context — see src/web/navigation.ts.
    const rerender = async (href: string): Promise<{ status: number; body: string }> => {
      const u = new URL(href, 'http://localhost');
      const cap = captureResponse();
      await inContext(d, u.pathname, () => handleStaff({ app: d.app, store: d.store, newId }, req, cap.res, u, 'GET', actor, form, readBody));
      return cap.done;
    };
    return inContext(d, path, () => handleStaff(
      { app: d.app, store: d.store, newId }, req, res, url, method, actor, form, readBody,
    ), rerender);
  }

  /* ----------------------------------------------------------- portal */
  if (path === '/portal' || path.startsWith('/portal/')) {
    if (actor === undefined) { redirect(res, '/login'); return 'handled'; }
    return inContext(d, path, () => portalRoutes(d, req, res, url, method, actor, newId, session?.session_id ?? null));
  }

  /* ------------------------------------------- the upload write itself */
  /* A PUT, OR A BROWSER'S FORM — the CRM follow-on. The portal's page asked for an HTTP PUT, which no browser form can make
     and the content security policy allows no script to make, so a client could not finish an upload from a browser. A
     multipart POST is read by src/web/multipart.ts and then takes EXACTLY the PUT's path: the same document authorised,
     the same single-use key, the same `acceptClientBytes` and `finishUpload`, the same receipt strip. One handler (N3). */
  if (path === '/upload/put' && (method === 'PUT' || method === 'POST')) {
    if (actor === undefined) { html(res, 401, simple('Sign in', 'You need to be signed in.')); return 'handled'; }
    const doc_id = url.searchParams.get('doc') ?? '';
    const token = url.searchParams.get('token') ?? '';
    // The document row is authorised BEFORE the bytes are accepted — a valid
    // capability for somebody else's document is still somebody else's.
    P.document(d.app.db, actor, doc_id);
    // CRM 4 of 10: A LINK IS USED ONCE. A row no longer at ISSUED has been
    // processed, and a second write would put an unredacted copy back into a
    // quarantine that has already been discharged.
    const job = issuedJob(d.app.db, doc_id);
    if (job === null) {
      html(res, 409, simple('That link has been used', 'We already have the file for this link. Ask us for a new link.'));
      return 'handled';
    }
    let bytes: Buffer;
    // The POST's cap holds the multipart envelope around a file at the limit; the file's own cap is `acceptClientBytes`'s.
    try { bytes = await readBody(req, 64 * 1024 * 1024 + (method === 'POST' ? 64 * 1024 : 0)); }
    catch { html(res, 413, simple('Too large', 'That file is larger than we accept.')); return 'handled'; }
    let file: Uint8Array;
    if (method === 'POST') {
      const parsed = singleFile(new Uint8Array(bytes), req.headers['content-type']);
      if (!parsed.ok) { html(res, 400, simple('Not accepted', `${parsed.why}. Choose the file and send it again.`)); return 'handled'; }
      file = parsed.part.bytes;
    } else {
      file = new Uint8Array(bytes);
    }
    const deps = { db: d.app.db, store: d.store, now, actor: actor.id, newId, audit: d.app.audit };
    const r = await acceptClientBytes(deps, { doc_id, token, bytes: file });
    if (!r.ok) { html(res, r.status, simple('Not accepted', r.why)); return 'handled'; }
    // CRM 4 of 10: STEPS 3 TO 7, ON THIS REQUEST. Until today the running
    // application wrote the bytes to quarantine and stopped here.
    const done = await finishUpload(deps, job, r.written_at);
    if (done.error !== undefined) {
      html(res, 422, simple('Not accepted', 'We could not use this file, so we have deleted it. Please send another.'));
      return 'handled';
    }
    html(res, 200, simple('Received', done.received_request === null || done.received_request === undefined
      ? 'We read it, then deleted the file.'
      : 'We read it, then deleted the file. What we asked you for is now marked received.'));
    return 'handled';
  }

  return 'not-mine';
}

/* ------------------------------------------------------------------ *
 * portal routes
 * ------------------------------------------------------------------ */

async function portalRoutes(
  d: WebDeps, req: IncomingMessage, res: ServerResponse, url: URL,
  method: string, actor: Actor, newId: () => string, session_id: string | null = null,
): Promise<WebResult> {
  const db = d.app.db;
  const now = d.app.now;
  const path = url.pathname;

  /**
   * THE BUSINESS THIS REQUEST IS ABOUT.
   *
   * A CLIENT has exactly one and it comes from their own session record, NOT
   * from the URL. A staff actor may name one. That is the single most common
   * way a portal leaks — `?business=<someone else>` — and the shape below is
   * what makes it impossible rather than merely checked: for a CLIENT the
   * parameter is not read at all, and `readBusiness` authorises the row anyway.
   */
  const asked = url.searchParams.get('business');
  const business_id = actor.role === 'CLIENT' ? (actor.business_id ?? '') : (asked ?? '');

  /**
   * AND IF A CLIENT NAMES SOMEBODY ELSE'S BUSINESS, REFUSE — LOUDLY.
   *
   * Ignoring the parameter would already be safe: the id above is taken from
   * the session and the row is authorised regardless, so the request would
   * simply return the client's own page. THAT IS NOT GOOD ENOUGH, for two
   * reasons. It answers 200 to an attempt to read another client's record,
   * which reads like success to whoever tried it and to anyone reviewing a
   * log; and a silently discarded parameter hides the day somebody wires a
   * genuine caller to it and cannot work out why it has no effect.
   *
   * So a client who addresses a business that is not theirs gets a refusal,
   * and it is the SAME refusal a missing business would produce.
   */
  if (actor.role === 'CLIENT' && asked !== null && asked !== actor.business_id) {
    throw new NotAuthorised('business.read', 'business');
  }

  /**
   * A CLIENT'S OWN ACCOUNT SETTINGS — the same implementation the back office
   * uses, mounted here so that a client has somewhere to change their password.
   * Until this phase there was nowhere at all.
   */
  if (path === '/portal/settings' || path.startsWith('/portal/settings/')) {
    return handlePortalSettings(
      { app: d.app, store: d.store, newId }, req, res, url, method, actor,
      (r) => form(r), readBody,
    );
  }

  /**
   * THE CLIENT'S OWN ANSWER ON SHARING PROGRESS WITH THE FIRM THAT REFERRED THEM —
   * CRM 8 of 10. Every check is in introducers.ts, on the object: withdrawing is
   * always open, giving waits on its switch.
   */
  if (path === '/portal/share-progress' && method === 'POST') {
    const f = await form(req);
    const r = recordShareConsentByClient(
      { db, audit: d.app.audit, now, newId }, actor, business_id,
      { introducer_id: f.get('introducer_id'), decision: f.get('decision'), wording_version: f.get('wording_version') },
    );
    if (!r.ok) { html(res, 400, simple('Not changed', r.why)); return 'handled'; }
    redirect(res, '/portal'); return 'handled';
  }

  /* PHASE 133c: the client's Help, and hiding the welcome card. */
  if (path === '/portal/help' && method === 'GET') {
    html(res, 200, page({ title: 'Help', nav: nav(actor), wide: true, body: h`<div class="guide card"><h1>Help with your claim page</h1>${clientHelp()}
      <p>Still stuck? Reply to any message from us, or ask for a call on <a href="/portal#appointment">your claim page</a>.</p></div>` }));
    return 'handled';
  }
  if (path === '/portal/welcome/dismiss' && method === 'POST') {
    dismissWelcome({ db, audit: d.app.audit, now }, actor);
    redirect(res, '/portal'); return 'handled';
  }

  if (path === '/portal' && method === 'GET') {
    const { business, progress } = P.progress(db, actor, business_id);
    const eng = P.engagement(db, actor, business_id);
    const bks = P.bookings(db, actor, business_id);
    const tks = P.tasks(db, actor, business_id);
    const dcs = P.documents(db, actor, business_id);
    const reqs = P.documentRequests(db, actor, business_id, now());
    const rng = P.shownRange(db, actor, business_id);
    /* THE SAME FUNCTION THE FUNNEL-CLOSE PICKER USES — moments, with the people
       taken out. A client must not learn whose diary it is, and building a
       second list here is how the two would come to differ. */
    // CRM 6 of 10: what the deliverables register releases to this client — a reasoned negative is told here, never as a stage.
    const dlv = clientDeliverables(db, actor, business_id);
    // CRM 8 of 10: the client's own share-progress answers. A staff member viewing the portal is not the client, and is not asked.
    const shr = actor.role === 'CLIENT' ? clientShareChoices(db, actor, business_id) : [];
    const welcome = actor.role === 'CLIENT' && welcomeShown(db, actor) ? welcomeCard(WELCOME_JOBS.CLIENT, '/portal/welcome/dismiss') : undefined;
    // PHASE 134: every claim this company holds, each asked of `claim.progress_read`.
    const cls = P.claims(db, actor, business_id);
    // PHASE 139: the steps staff have told this client about — words and dates, and nothing behind them.
    const done = portalSteps(db, actor, business_id);
    html(res, 200, portalPage(actor, business, progress, eng, bks, tks, dcs, reqs, receivableTypes(db), rng,
      publicSlots(db, now()), now(), dlv, shr, { proposedSteps: nameSwitches().portalSteps, claims: cls, done, sent: url.searchParams.get('sent') === '1', ...(welcome === undefined ? {} : { welcome }) }));
    return 'handled';
  }

  /* PHASE 142: MESSAGES — the thread with the client, and nothing else. `business_id` is the session's for a client, so a
     client only ever reads and writes their own company's thread; every read and write is asked of the rule table again. */
  if (path === '/portal/messages' && method === 'GET') {
    const m = portalMessagesBody({ app: d.app, newId }, actor, business_id, url.searchParams.get('done'));
    html(res, 200, page({ title: m.title, nav: nav(actor), wide: true, body: m.body }));
    return 'handled';
  }
  if (path === '/portal/messages' && method === 'POST') {
    const got = await readPortalSend(req, form, readBody);
    const r = got.ok ? await sendFromPortal({ app: d.app, store: d.store, newId }, actor, business_id, got.send) : got;
    if (!r.ok) {
      // Drawn again with what they typed, so a refusal never costs a long message. Nothing was sent.
      const m = portalMessagesBody({ app: d.app, newId }, actor, business_id, null, { why: r.why, body: got.ok ? got.send.body : '' });
      html(res, 400, page({ title: m.title, nav: nav(actor), wide: true, body: m.body }));
      return 'handled';
    }
    redirect(res, `/portal/messages?done=${r.with_file ? 'file' : 'sent'}#thread`);
    return 'handled';
  }
  const oneMessage = /^\/portal\/messages\/([A-Za-z0-9-]+)$/.exec(path);
  if (oneMessage && method === 'GET') {
    let msg: MessageView | null = null;
    try { msg = clientMessage(db, actor, business_id, oneMessage[1] ?? ''); } catch (e) { if (!(e instanceof NotFoundAsRefusal)) throw e; }
    if (msg === null) {
      // A team message, another company's message and an id that does not exist all answer the same.
      html(res, 404, page({ title: 'Message not found', nav: nav(actor), wide: true, body: h`<div class="card"><h1>We cannot find that message</h1>
        <p>It may have been typed wrongly.</p><p><a class="btn btn-primary" href="/portal/messages">See your messages</a></p></div>` }));
      return 'handled';
    }
    html(res, 200, page({ title: 'Message', nav: nav(actor), wide: true, body: h`<div class="card"><p class="msgmeta"><strong>${msg.who}</strong> · ${msg.when}</p>
      <p class="msgbody">${msg.body}</p>${msg.files.length === 0 ? raw('') : h`<ul class="msgfiles">${msg.files.map((f) => h`<li><a href="${f.href}">${f.name}</a></li>`)}</ul>`}
      <p><a href="/portal/messages#msg-${msg.id}">See it in your messages</a></p></div>` }));
    return 'handled';
  }

  /* PHASE 134: ONE CLAIM'S PROGRESS. Looked for only among this company's own claims, so another company's claim and a
     claim that does not exist both answer 404 — the same page, naming nothing. */
  const claimMatch = /^\/portal\/claims\/([A-Za-z0-9-]+)$/.exec(path);
  if (claimMatch && method === 'GET') {
    const { business } = P.progress(db, actor, business_id);
    const c = P.claim(db, actor, business_id, claimMatch[1] ?? '');
    if (c === null) {
      html(res, 404, page({ title: 'Claim not found', nav: nav(actor), wide: true, body: h`<div class="card"><h1>We cannot find that claim</h1>
        <p>It may have been typed wrongly.</p><p><a class="btn btn-primary" href="/portal">See your claims</a></p></div>` }));
      return 'handled';
    }
    html(res, 200, portalClaimPage(actor, business, c, nameSwitches().portalSteps, portalSteps(db, actor, business_id)));
    return 'handled';
  }

  if (path === '/portal/letter' && method === 'GET') {
    const { business } = P.progress(db, actor, business_id);
    P.markViewed(db, actor, business_id, now);
    const eng = P.engagement(db, actor, business_id);
    html(res, 200, letterPage(actor, business, eng));
    return 'handled';
  }

  /* PHASE 146f: THE BUILT-IN SIGNATURE (src/web/signing.ts). Every check is there, on the record: the switch
     (ENGAGEMENT_SIGNING, off), the letter complete, sent and not yet signed, a full name, a role, the tick, and the
     fingerprint of the letter the page drew. A refusal is a page the client reads, with what they typed kept. */
  if (path === '/portal/letter/sign' && method === 'POST') {
    const f = await form(req);
    const { business } = P.progress(db, actor, business_id);
    const typed = { full_name: f.get('full_name') ?? '', role: f.get('signer_role') ?? '' };
    const r = session_id === null
      ? { ok: false as const, why: 'Please sign in again, then sign the letter.' }
      : signEngagement({ db, audit: d.app.audit, email: d.app.email, now, newId }, actor, business_id, {
        ...typed, authorised: f.get('authorised') === 'on', letter_sha256: f.get('letter_sha256') ?? '',
      }, { ip: clientIp(req), session_id });
    if (!r.ok) {
      html(res, 400, letterPage(actor, business, P.engagement(db, actor, business_id), r.why, typed));
      return 'handled';
    }
    html(res, 200, page({ title: 'Letter signed', nav: nav(actor), body: h`<h1>Thank you — the letter is signed</h1>
      <p>We have recorded your signature. A copy of the signed letter, with a signature page, is saved to be emailed to you.</p>
      <p><a class="cta" href="/portal">Back to your claims</a></p>` }));
    return 'handled';
  }

  /**
   * THE CLIENT MOVES THEIR OWN CALL — Phase 113a. One route, two verbs, and the
   * decision about which is a radio button rather than two forms that could
   * disagree about which booking they are addressing.
   *
   * EVERY CHECK IS IN portal.ts, on the object: this reads a form and renders
   * an answer. There is no role test here, no "is it too late" arithmetic here
   * and no slot list built here — a control in a handler is a control that the
   * next handler will not have.
   */
  const bookingMatch = /^\/portal\/bookings\/([A-Za-z0-9-]+)$/.exec(path);
  if (bookingMatch && method === 'POST') {
    const f = await form(req);
    const moveDeps = {
      db, audit: d.app.audit, email: d.app.email, now, newId,
    };
    // Phase 132e: a third verb, `cancel`, on the same route — see cancelOwnBooking in portal.ts.
    const r = f.get('cancel') === 'on'
      ? P.cancelOwnBooking(moveDeps, actor, business_id, { booking_id: bookingMatch[1] ?? '' })
      : f.get('release') === 'on'
        ? P.releaseOwnBooking(moveDeps, actor, business_id, { booking_id: bookingMatch[1] ?? '' })
        : P.moveOwnBooking(moveDeps, actor, business_id, {
            booking_id: bookingMatch[1] ?? '', starts_at: f.get('starts_at') ?? '',
          });
    if (!r.ok) {
      html(res, 400, simple(f.get('cancel') === 'on' ? 'The call was not cancelled' : 'That time was not taken', r.why));
      return 'handled';
    }
    redirect(res, '/portal'); return 'handled';
  }

  const taskMatch = /^\/portal\/tasks\/([A-Za-z0-9-]+)$/.exec(path);
  if (taskMatch && method === 'POST') {
    const f = await form(req);
    const r = P.answerTask(db, actor, business_id, {
      task_id: taskMatch[1] ?? '', dont_know: f.get('dont_know') === 'on',
      answer: f.get('answer') ?? '',
    }, now);
    if (!r.ok) { html(res, 400, simple('Not saved', r.why ?? 'that did not work')); return 'handled'; }
    redirect(res, '/portal'); return 'handled';
  }

  if (path === '/portal/documents' && method === 'POST' && /^multipart\/form-data\b/i.test(req.headers['content-type'] ?? '')) {
    // PHASE 140: THE FILE COMES WITH THE FORM. One step, and exactly the path the upload address takes — the same
    // single-use key, `acceptClientBytes` and `finishUpload` — so no page ever shows an HTTP PUT address.
    const up = await readUpload(req, readBody);
    if (!up.ok) { html(res, 400, simple('Not sent', up.why)); return 'handled'; }
    const r = await receiveFile({ app: d.app, store: d.store, newId }, actor, {
      business_id: P.progress(db, actor, business_id).business.id,
      type_code: up.fields.type_code ?? null, logical_document_id: up.fields.document ?? null, request_id: up.fields.request ?? null, claim_id: null,
    }, up.bytes);
    if (!r.ok) { html(res, 400, simple('Not sent', r.why)); return 'handled'; }
    redirect(res, '/portal?sent=1#documents');
    return 'handled';
  }

  if (path === '/portal/documents' && method === 'POST') {
    const f = await form(req);
    // CRM 4 of 10: AN UPLOAD STARTS AS A VERSION OF A DOCUMENT, of a type with a
    // receipt policy, against a request where there is one. The client no longer
    // types a file name: it is derived, because a file's name can be a person's.
    const b = await startDocumentUpload({ db, audit: d.app.audit, now, newId, store: d.store }, actor, {
      business_id: P.progress(db, actor, business_id).business.id,
      type_code: f.get('type_code'), logical_document_id: f.get('document'), request_id: f.get('request'), claim_id: null,
    });
    if (!b.ok) { html(res, 400, simple('No upload link issued', b.why)); return 'handled'; }
    // The capability goes to the browser and is not stored. The page below is
    // what a real client would see between asking and uploading.
    html(res, 200, uploadTicketPage(b.doc_id, b.url, b.expires_at));
    return 'handled';
  }

  const docMatch = /^\/portal\/documents\/([A-Za-z0-9-]+)$/.exec(path);
  if (docMatch && method === 'GET') {
    const doc = P.document(db, actor, docMatch[1] ?? '');
    // PHASE 144: the same plain counts the staff Files folder shows, from the same reader — never the handler's own step log.
    html(res, 200, documentPage(doc, readLines(db, doc)));
    return 'handled';
  }

  /**
   * DB-W1 — THE SERVING ENDPOINT.
   *
   * The only route in this application that could ever return a client
   * document's bytes, and it authorises THAT document for THIS requester on
   * THIS request (DB-W1-T3), then writes an access record naming who, what and
   * when (DB-W1-T6) whether it serves or refuses.
   *
   * IT DOES NOT SERVE THE ORIGINAL, and that is not a limitation of the
   * prototype — it is the design. Under FAIL_CLOSED_SETTINGS the unredacted
   * file is deleted from quarantine as soon as the strip has run and is never
   * promoted to durable storage, so THERE IS NOTHING TO SERVE. Returning 410
   * with that explanation is the honest answer; inventing a copy to serve
   * would undo the control the whole pipeline exists to perform.
   */
  const dlMatch = /^\/portal\/documents\/([A-Za-z0-9-]+)\/download$/.exec(path);
  if (dlMatch && method === 'GET') {
    const id = dlMatch[1] ?? '';
    let doc: P.DocumentView;
    try {
      doc = P.document(db, actor, id);
    } catch (e) {
      d.app.audit.append({
        at: now(), kind: 'DOCUMENT_ACCESSED', actor_id: actor.id, actor_role: actor.role,
        object_type: 'document', object_id: id, outcome: 'REFUSED', detail: { route: 'download' },
      });
      throw e;
    }
    d.app.audit.append({
      at: now(), kind: 'DOCUMENT_ACCESSED', actor_id: actor.id, actor_role: actor.role,
      object_type: 'document', object_id: doc.id, outcome: 'ALLOWED',
      detail: { route: 'download', state: doc.state },
    });
    html(res, 410, simple(
      'That file no longer exists, by design',
      'We read it, then deleted the file. We did not keep a copy. ' +
      'We keep what we took from it, not the file. ' +
      'The document’s own page shows when we deleted it.'));
    return 'handled';
  }

  return 'not-mine';
}

/* ------------------------------------------------------------------ *
 * applying a screen's answers — server-side, always
 * ------------------------------------------------------------------ */

function pick(f: URLSearchParams, name: string, allowed: readonly { value: string }[]): string | null {
  const v = f.get(name);
  return v !== null && allowed.some((o) => o.value === v) ? v : null;
}

function applyScreen(draft: Draft, id: ScreenId, f: URLSearchParams): void {
  const s = draft.state as Record<string, unknown>;
  if (id === 'Q1') s.own_prior_claim = pick(f, 'own_prior_claim', OPTIONS.own_prior_claim);
  if (id === 'Q1a') s.previous_owner_claimed = pick(f, 'previous_owner_claimed', OPTIONS.previous_owner_claimed);
  if (id === 'Q1b') {
    s.is_uk_taxpayer = pick(f, 'is_uk_taxpayer', OPTIONS.is_uk_taxpayer);
    s.current_year_position = pick(f, 'current_year_position', OPTIONS.current_year_position);
  }
  if (id === 'Q1c') {
    const t = f.get('trigger_default');
    s.trigger_default = t !== null && Object.hasOwn(FUNNEL.TRIGGER_LABEL, t) ? t : null;
  }
  if (id === 'Q2' || id === 'Q3') {
    const props = (s.properties ?? []) as Record<string, unknown>[];
    props.forEach((p, i) => {
      const g = (k: string): string | null => f.get(`p${i}_${k}`);
      if (id === 'Q2') {
        p.address = g('address');
        const sec = g('sector'); p.sector = sec !== null && Object.hasOwn(FUNNEL.SECTOR_LABEL, sec) ? sec : null;
        const ent = g('entity_type'); p.entity_type = ent !== null && Object.hasOwn(FUNNEL.ENTITY_LABEL, ent) ? ent : null;
        const tr = g('trigger') ?? (s.trigger_default as string | null);
        p.trigger = tr !== null && Object.hasOwn(FUNNEL.TRIGGER_LABEL, tr) ? tr : null;
        p.spend_unknown = f.get(`p${i}_spend_unknown`) === 'on';
        p.spend = p.spend_unknown === true ? null : num(g('spend'));
        p.date_unknown = f.get(`p${i}_date_unknown`) === 'on';
        p.date = p.date_unknown === true ? null : g('date');
      } else {
        p.works = pick(f, `p${i}_works`, OPTIONS.works);
        p.works_type = pick(f, `p${i}_works_type`, OPTIONS.works_type);
        p.works_spend_unknown = f.get(`p${i}_works_spend_unknown`) === 'on';
        p.works_spend = p.works_spend_unknown === true ? null : num(g('works_spend'));
        p.works_year_unknown = f.get(`p${i}_works_year_unknown`) === 'on';
        p.works_year = p.works_year_unknown === true ? null : g('works_year');
      }
    });
    if (id === 'Q2' && f.get('add_property') === 'on') props.push(FUNNEL.blankProperty() as Record<string, unknown>);
    s.properties = props;
  }
}

/** Digits only, and an unparseable figure stays NULL. It never becomes 0. */
function num(v: string | null): number | null {
  if (v === null) return null;
  const cleaned = v.replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function applyClose(draft: Draft, f: URLSearchParams): string | undefined {
  const c = (draft.state as { contact: Record<string, unknown> }).contact;
  const name = (f.get('full_name') ?? '').trim();
  const channelId = f.get('channel') ?? '';
  const channels = BOOKING.CHANNELS;
  if (name.length === 0) return 'We need a name to know who we are calling.';
  if (!channels.some((ch) => ch.id === channelId)) return 'Choose how you would like us to reach you.';
  if (f.get('contact_consent') !== 'on') {
    return 'We need your permission to contact you about this. It is not marketing consent.';
  }
  c.full_name = name;
  c.business_name = (f.get('business_name') ?? '').trim() || null;
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
): { booked_at: string | null } {
  const c = (draft.state as { contact: Record<string, unknown> }).contact;
  const at = d.app.now();
  const business_id = 'business_id' in holder ? holder.business_id : null;
  const lead_id = 'lead_id' in holder ? holder.lead_id : null;
  // At the funnel close the address is already on the organisation (`submit()`);
  // with no organisation, the prospect's own contact is the only place for it.
  const typed = lead_id !== null && typeof c.contact_value === 'string' ? c.contact_value : null;
  d.app.db.run(
    'INSERT INTO contacts (id, business_id, lead_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, ' +
      'email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), business_id, lead_id, String(c.full_name ?? ''), c.job_role as string | null,
     c.job_role_other as string | null, c.contact_consent === true ? 1 : 0,
     c.marketing_optin === true ? 1 : 0,
     c.channel === 'email' ? typed : null,
     c.channel === 'phone' || c.channel === 'sms_whatsapp' ? typed : null, at],
  );

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
  d.app.db.run(
    'INSERT INTO bookings (id, business_id, lead_id, assigned_to, channel, sms_variant, entry_point, ' +
      'starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [booking_id, business_id, lead_id, owner, String(c.channel), c.sms_variant as string | null,
     entry_point, starts, ends, at],
  );
  // CRM 2 of 10: the booking belongs to the lead the submission just opened. A
  // lead with no organisation cannot carry `booking_id` — the leads table refuses
  // it without one — so its booking points at the lead instead, and conversion
  // hands the lead its booking once the organisation exists.
  if (business_id !== null) linkBookingToLead(d.app.db, business_id, booking_id, at);
  /* PHASE 146f: A CALL GIVEN A TIME HERE GETS ITS INVITATION TOO, like one given a time by staff or moved by the
     client — the same email, the same .ics, the same switch (EMAIL_SENDING, off). With no email address recorded,
     nothing is written: the call still stands, and staff reach them the way they asked. */
  if (starts !== null && ends !== null) {
    const to = business_id !== null
      ? d.app.db.get<{ e: string | null }>('SELECT contact_email AS e FROM businesses WHERE id = ?', [business_id])?.e ?? null
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
  return { booked_at: starts };
}

/* ------------------------------------------------------------------ *
 * pages
 * ------------------------------------------------------------------ */

/**
 * A moment, spelled out, IN UK TIME — "Wednesday 2026-06-10 at 10:00 BST".
 *
 * ONE OF THE FOUR DISPLAY EDGES (Phase 113a). It used to print UTC and the
 * callers appended the word, which was honest and an hour wrong for eight
 * months of the year: a client offered "Wednesday at 09:00" in June would have
 * turned up at ten. The stored value is untouched; localtime.ts converts, and
 * the abbreviation comes from Intl rather than from an `if`.
 *
 * THE ZONE IS PART OF THE STRING because everything this renders is a moment a
 * CLIENT is going to keep. A terse cell in a staff table uses `stamp` instead.
 */
function clockOf(iso: string): string {
  return localWhen(iso);
}

function simple(title: string, body: string): string {
  return page({ title, body: h`<h1>${title}</h1><p>${body}</p>` });
}

/**
 * THE PUBLIC REFERRAL FORM — CRM 5 of 10, and drawn only while its gate is open.
 * The paper's section 5 step 2: practice, contact, the client business's name,
 * sector and property basics. No script; every value escaped; the accountant
 * confirms their client agreed to the details being passed on.
 */
function referralFormPage(actor: Actor | undefined, why: string | undefined): string {
  const opt = (vocab: Readonly<Record<string, string>>): Safe =>
    h`<option value="">not known</option>${Object.entries(vocab).map(([k, l]) => h`<option value="${k}">${l}</option>`)}`;
  return page({
    title: 'Refer a client', nav: nav(actor),
    body: h`<h1>Refer a client</h1>
      ${why === undefined ? raw('') : h`<p class="err">${why}</p>`}
      <p>Tell us about a client whose property might carry unclaimed capital allowances. We contact them ourselves,
      and nothing about their claim is shared with you unless they tell us they want it to be.</p>
      <form method="post" action="/refer">
        <label>Your practice <input name="firm_name" required maxlength="300"></label>
        <label>Your name <input name="contact_name" required maxlength="200"></label>
        <label>Your email <input name="contact_email" type="email" required maxlength="254"></label>
        <label>Your telephone <input name="contact_phone" maxlength="40"></label>
        <label>Your client's business <input name="prospect_organisation" required maxlength="300"></label>
        <label>Its sector <select name="prospect_sector">${opt(SECTORS)}</select></label>
        <label>The property's postcode, or its first half <input name="prospect_postcode" maxlength="10"></label>
        <label>What happened at the property <select name="prospect_event">${opt(PROSPECT_EVENTS)}</select></label>
        <label>In which year <input name="prospect_event_year" inputmode="numeric" maxlength="4"></label>
        <label class="ck"><input type="checkbox" name="attest"> My client has agreed to my passing their business's details to Cap Rebate.</label>
        <button type="submit">Send the referral</button>
      </form>`,
  });
}

function home(actor: Actor | undefined): string {
  const gate = registryGate();
  return page({
    title: 'Capital allowances for healthcare property',
    nav: nav(actor),
    body: h`
      <h1>There is tax relief built into your building.</h1>
      <p>Cap Rebate finds out, on evidence, what capital allowances you can claim when you buy, build
      or fit out healthcare premises. We tell you plainly, whether the answer is large, small or nothing.</p>
      <p>A chartered surveyor signs every split of costs. A chartered tax adviser checks every claim
      before it is filed. We work alongside your accountant, who still files your return and looks after you.
      If there is no claim, we tell you early, in writing, and explain why.</p>
      <p><a class="cta" href="/assessment">Start the free assessment</a></p>
      <div class="gate">We do not look anything up about you from this page.${why(h`We do not look anything up about anyone yet.
      Free checks of public records are ${gate.enabled ? 'switched on' : 'switched off'}, and they wait on this: ${gate.requires}.
      Paid checks wait until you have signed our engagement letter and one of our team starts the research.`)}</div>`,
  });
}

function screenPage(draft: Draft, id: ScreenId, actor: Actor | undefined): string {
  const sc = SCREENS[id];
  const n = SCREEN_IDS.indexOf(id) + 1;
  return page({
    title: sc.heading, nav: nav(actor),
    body: h`
      <p class="rung">Step ${n} of ${SCREEN_IDS.length}</p>
      <div class="group">${sc.group}</div>
      <h2>${sc.heading}</h2>
      ${sc.help !== undefined ? h`<p class="help">${sc.help}</p>` : raw('')}
      <form method="post" action="/assessment/${id}">
        ${screenFields(draft, id)}
        <button class="cta" type="submit">Continue →</button>
      </form>`,
  });
}

function radios(name: string, opts: readonly { value: string; label: string }[], selected: unknown): Safe {
  return h`<div class="opts">${opts.map((o) => h`
    <label class="opt${o.value === selected ? ' sel' : ''}">
      <input type="radio" name="${name}" value="${o.value}"${o.value === selected ? raw(' checked') : raw('')}>
      ${o.label}
    </label>`)}</div>`;
}

function screenFields(draft: Draft, id: ScreenId): Safe {
  const s = draft.state as Record<string, unknown>;
  if (id === 'Q1') return radios('own_prior_claim', OPTIONS.own_prior_claim, s.own_prior_claim);
  if (id === 'Q1a') return radios('previous_owner_claimed', OPTIONS.previous_owner_claimed, s.previous_owner_claimed);
  if (id === 'Q1b') {
    return h`${radios('is_uk_taxpayer', OPTIONS.is_uk_taxpayer, s.is_uk_taxpayer)}
      ${asksProfit(draft.state) ? h`
        <h2>Is the business currently running at a profit?</h2>
        ${radios('current_year_position', OPTIONS.current_year_position, s.current_year_position)}` : raw('')}`;
  }
  if (id === 'Q1c') {
    const labels = FUNNEL.TRIGGER_LABEL as Record<string, string>;
    return radios('trigger_default',
      Object.keys(labels).map((k) => ({ value: k, label: labels[k] ?? k })), s.trigger_default);
  }
  const props = (s.properties ?? []) as Record<string, unknown>[];
  if (id === 'Q2') {
    const sectors = FUNNEL.SECTOR_LABEL as Record<string, string>;
    const entities = FUNNEL.ENTITY_LABEL as Record<string, string>;
    const triggers = FUNNEL.TRIGGER_LABEL as Record<string, string>;
    return h`${props.map((p, i) => {
      const f = FRONTDOOR.spendFieldsFor(p.trigger) as { label?: string; dateLabel?: string } | null;
      return h`<div class="pblock"><div class="pnum">Property ${i + 1}</div>
        <label class="fl">Where is it?</label>
        <input class="fi" name="p${i}_address" value="${p.address ?? ''}" placeholder="e.g. Meadowcroft House, LE2 3QP">
        <label class="fl">What kind of business operates here?</label>
        ${radios(`p${i}_sector`, Object.keys(sectors).map((k) => ({ value: k, label: sectors[k] ?? k })), p.sector)}
        <label class="fl">Which kind of legal entity holds it?</label>
        ${radios(`p${i}_entity_type`, Object.keys(entities).map((k) => ({ value: k, label: entities[k] ?? k })), p.entity_type)}
        <label class="fl">How did you come by this one?</label>
        ${radios(`p${i}_trigger`, Object.keys(triggers).map((k) => ({ value: k, label: triggers[k] ?? k })), p.trigger ?? s.trigger_default)}
        ${f !== null ? h`
          <label class="fl">${f.label ?? 'Roughly what was spent?'}</label>
          <input class="fi" inputmode="numeric" name="p${i}_spend" value="${p.spend ?? ''}" placeholder="£">
          <label class="ck"><input type="checkbox" name="p${i}_spend_unknown"${p.spend_unknown === true ? raw(' checked') : raw('')}> I don’t know</label>
          <label class="fl">${f.dateLabel ?? 'Roughly when?'}</label>
          <input class="fi" name="p${i}_date" value="${p.date ?? ''}" placeholder="MM/YYYY">
          <label class="ck"><input type="checkbox" name="p${i}_date_unknown"${p.date_unknown === true ? raw(' checked') : raw('')}> I don’t know</label>` : raw('')}
      </div>`;
    })}
    <label class="ck"><input type="checkbox" name="add_property"> Add another property</label>`;
  }
  // Q3
  return h`${props.map((p, i) => {
    const w = FRONTDOOR.worksHeadingFor(p.trigger) as { heading?: string; sub?: string };
    return h`<div class="pblock">
      <div class="pnum">${p.address ?? `Property ${i + 1}`}</div>
      <div class="wh">${w.heading ?? 'Any other work done?'}</div>
      ${w.sub !== undefined ? h`<p class="help">${w.sub}</p>` : raw('')}
      ${radios(`p${i}_works`, OPTIONS.works, p.works)}
      <label class="fl">What kind?</label>
      ${radios(`p${i}_works_type`, OPTIONS.works_type, p.works_type)}
      ${p.works_type === 'cosmetic' ? h`<div class="flag"><strong>Worth knowing:</strong> ${COSMETIC_NOTE.replace('Worth knowing: ', '')}</div>` : raw('')}
      <label class="fl">Roughly how much?</label>
      <input class="fi" inputmode="numeric" name="p${i}_works_spend" value="${p.works_spend ?? ''}" placeholder="£">
      <label class="ck"><input type="checkbox" name="p${i}_works_spend_unknown"${p.works_spend_unknown === true ? raw(' checked') : raw('')}> I don’t know</label>
      <label class="fl">Roughly when?</label>
      <input class="fi" name="p${i}_works_year" value="${p.works_year ?? ''}" placeholder="YYYY">
      <label class="ck"><input type="checkbox" name="p${i}_works_year_unknown"${p.works_year_unknown === true ? raw(' checked') : raw('')}> I don’t know</label>
    </div>`;
  })}`;
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
        <input class="fi" id="close-business-name" name="business_name" autocomplete="organization">
        <label class="fl">Your role in the business</label>
        ${radios('job_role', roles.map(([v, l]) => ({ value: v, label: l })), null)}
        <label class="fl">How would you like us to reach you?</label>
        ${radios('channel', channels.map((c) => ({ value: c.id, label: c.label })), null)}
        <label class="fl" for="close-contact-value">Your telephone number or email address</label>
        <input class="fi" id="close-contact-value" name="contact_value">
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
): string {
  return page({
    title: 'Thank you', nav: nav(actor),
    body: h`
      <h1>Thank you — that is with us.</h1>
      <p>We have your assessment, and our team can see it. Somebody will be in touch
      through the channel you chose.</p>
      <p>The range you were shown: <strong>${formatShownRange(out)}</strong>.</p>
      ${booked.booked_at !== null
        ? h`<p>We have held <strong>${clockOf(booked.booked_at)}</strong> for your call.</p>
            <p class="help">The calendar invitation has not been sent yet.</p>`
        : h`<p class="help">No time is held yet. Either the way you chose to talk does not book a time,
            or the time you picked had gone. We will ring you to arrange one.</p>`}
      <p class="help">Your reference: <code>${out.assessment_id}</code>. Nothing has been looked up about your property.</p>
      ${offer === undefined ? h`<p><a href="/login">Log in to your claim</a></p>` : h`
      <div class="pblock"><div class="pnum">Follow your claim online</div>
        <p class="help">Create a login to see your claim, your call and your documents. We send a link to your email address
        to confirm it; the login is created only when you open that link. This is optional.</p>
        <form method="post" action="/account/create"><input type="hidden" name="offer" value="${offer}">
          <label class="fl" for="signup-email">Your email address</label><input class="fi" id="signup-email" type="email" name="email" autocomplete="email" maxlength="254" required>
          <label class="fl" for="signup-name">Your name</label><input class="fi" id="signup-name" name="display_name" autocomplete="name" maxlength="200" required>
          <label class="fl" for="signup-password">Choose a password (at least ${MIN_PASSWORD} characters)</label><input class="fi" id="signup-password" type="password" name="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required>
          <button class="cta" type="submit">Create my login</button>
        </form>
        <p class="help">Already have one? <a href="/login">Log in</a>.</p></div>`}`,
  });
}

/**
 * MOVING OR CANCELLING YOUR OWN CALL — Phase 113a, revised by Phase 132e.
 *
 * IT DRAWS WHAT THE STORE WOULD ACCEPT, AND NOTHING MORE. Every condition below
 * is asked of the same functions the write path asks: `BOOKING.booksASlot` for
 * whether this channel holds a moment at all, `P.tooSoonForNewTime` for the new
 * time's notice period, and `publicSlots` for the times. THE FORM IS NOT THE
 * CONTROL — a client who posts a time this panel never drew is refused by
 * `isBookable` and the notice period at the moment of writing.
 *
 * PHASE 132e: THE CONTROL IS DRAWN AT ANY TIME, however close or past the call
 * is ("Give the client full control to cancel at any time, and rebook at a time
 * that suits them"). THE ORDER IS THE DECISION: new times first, then "ring me
 * instead", then cancelling outright.
 */
function movePanel(
  b: P.BookingView, slots: ReturnType<typeof publicSlots>, nowIso: string,
): Safe {
  if (b.cancelled_at !== null) {
    return h`<div class="flag">You cancelled this call on ${clockOf(b.cancelled_at)}. Your enquiry is still
      open — telephone us, or reply to any message from us, and we will arrange another call.</div>`;
  }
  if (!BOOKING.booksASlot(b.channel)) return raw('');
  const offerable = slots.available ? slots.slots.filter((sl) => !P.tooSoonForNewTime(nowIso, sl.starts_at)) : [];
  const cancelForm = h`
      <p class="help">Or cancel this call altogether. Your enquiry stays open and nothing else about it
      changes; we will not call you at this time.</p>
      <form method="post" action="/portal/bookings/${b.id}">
        <input type="hidden" name="cancel" value="on">
        <button class="linkish" type="submit">Cancel this call</button>
      </form>`;
  if (b.starts_at === null) {
    return h`<p class="help">No time is held for this call yet — we will ring you to arrange one.</p>${cancelForm}`;
  }
  return h`
    <details class="pblock">
      <summary>Change or cancel this call</summary>
      <p class="help">${zoneNotice(b.starts_at)}</p>
      ${offerable.length > 0
        ? h`<form method="post" action="/portal/bookings/${b.id}">
            <label class="fl">Choose another time</label>
            <div class="opts">${offerable.slice(0, 24).map((sl) => h`
              <label class="opt"><input type="radio" name="starts_at" value="${sl.starts_at}">
                ${clockOf(sl.starts_at)}</label>`)}</div>
            <button class="cta" type="submit">Move my call</button>
          </form>`
        : h`<div class="flag">${slots.available ? 'There are no other times free at the moment.' : slots.say}</div>`}
      <p class="help">If none of those work, give this time back and we will telephone you to
      arrange another. Your enquiry stays open and nothing else about it changes — we simply
      stop holding a slot you cannot make.</p>
      <form method="post" action="/portal/bookings/${b.id}">
        <input type="hidden" name="release" value="on">
        <button class="linkish" type="submit">None of these work — ring me instead</button>
      </form>
      ${cancelForm}
    </details>`;
}

function loginPage(error: string | undefined): string {
  return page({
    title: 'Sign in',
    body: h`
      <h1>Sign in</h1>
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      <form method="post" action="/login">
        <label class="fl" for="login-email">Email</label><input class="fi" id="login-email" type="email" name="email" autocomplete="username" required>
        <label class="fl" for="login-password">Password</label><input class="fi" id="login-password" type="password" name="password" autocomplete="current-password" required>
        <button class="cta" type="submit">Sign in</button>
      </form>
      <p class="help">After too many tries you must wait a while. If sign-in fails, we do not say why.
      That way, nobody can find out who has a login.</p>`,
  });
}

/** Where a booking came from, in words a client reads. */
const BOOKED_FROM: Readonly<Record<string, string>> = Object.freeze({
  funnel_close: 'your assessment', gated_exit: 'your enquiry', portal: 'your claim page',
});

/**
 * THE RANGE'S BASIS, FOR THE CLIENT — PHASE 133c. The brand book: "Estimates always render as a range with its basis
 * stated underneath" (slide 49). The same facts as RANGE_QUALIFIER, which the back office still shows, in the client's
 * words and with no build language.
 */
export const CLIENT_RANGE_BASIS =
  'An indicative range, built only from what you told us in the assessment. It is the top of the range: our research ' +
  'can move it down, not up. Nothing has been looked up about you or your property yet.';

function portalPage(
  actor: Actor, business: P.Business, progress: ReturnType<typeof P.progress>['progress'],
  eng: P.EngagementView | null, bks: P.BookingView[], tks: P.TaskView[], dcs: P.DocumentView[],
  reqs: readonly RequestView[], types: readonly { code: string; label: string }[],
  rng: P.ShownRangeView | null,
  slots: ReturnType<typeof publicSlots>, nowIso: string,
  dlv: readonly ClientDeliverable[] = [],
  share: readonly ClientShareChoice[] = [],
  extra: { readonly proposedSteps?: boolean; readonly welcome?: Safe; readonly claims?: readonly P.PortalClaim[]; readonly done?: readonly ClientStep[]; readonly sent?: boolean } = {},
): string {
  const open = tks.filter((t) => t.state === 'OPEN');
  const asked = reqs.filter((r) => r.state === 'REQUESTED');
  const versionable = [...new Map(dcs.filter((x) => x.logical_document_id !== null && x.type_label !== null)
    .map((x) => [x.logical_document_id ?? '', `${x.type_label ?? ''} ${x.seq ?? ''}`] as const)).entries()];
  const named = extra.proposedSteps === true;
  const cls = extra.claims ?? [];
  return page({
    title: business.name, nav: nav(actor), wide: true,
    /* PHASE 133c (B9): THE PORTAL, IN THE ORDER A CLIENT NEEDS IT. At the top, how to reach us and book a call; then where
       the claim is; the range with its basis underneath; what we need from you; then everything else. The long step
       explanations sit behind "What happens at each step". Every section Phase 133a drew is still on the page. */
    body: h`
      <header class="highlights"><p class="eyebrow">${cls.length === 1 ? 'Your claim' : 'Your claims'}</p><h1>${business.name}</h1>
        <p><a class="btn btn-primary" href="/portal/messages">Send us a message</a> <a class="btn" href="#appointment">Book a call</a></p></header>
      ${extra.welcome ?? raw('')}
      ${cls.length === 0 ? raw('') : card('Your claims', portalClaimTiles(cls, named, business.name), { count: cls.length, id: 'your-claims' })}
      ${clientStepsCard(extra.done ?? [], cls.map((c) => ({ id: c.id, name: propertyIn(business.name, c.property) ?? 'Your claim' })))}
      <section class="card" id="contact-us"><div class="card-h"><h2>How to contact us</h2></div>
        <p>Write to us under <a href="/portal/messages">Messages</a> — you can send a file there too — or ask for a call under
        <a href="#appointment">Your appointment</a>. If you are unhappy with anything we have done, our
        <a href="/notices/">public notices</a> say how to complain.</p>
      </section>
      ${cls.length === 0 && progress.known ? clientStageBar(progress.steps.map((s) => ({ label: stepName(s.stage, named), state: s.state }))) : raw('')}

      <section class="card" id="your-range"><div class="card-h"><h2>The range you were shown</h2></div>
      ${rng === null
        ? h`<p class="help">No assessment has been recorded for this business.</p>`
        : h`<p class="figbig">${formatShownRange(rng)}</p>
            <p class="help">${CLIENT_RANGE_BASIS}</p>`}
      </section>

      <section class="card" id="waiting-on-you"><div class="card-h"><h2>What we need from you</h2><span class="count">${open.length + asked.length}</span></div>
        ${open.length + asked.length === 0 ? h`<p class="empty">Nothing at the moment. We are working on your claim, and we will tell you here if we need anything.</p>`
          : h`<ul class="plain">${open.map((t) => h`<li><a href="#question-${t.id}">${t.question}</a> <span class="help">— a question</span></li>`)}${
            asked.map((r) => h`<li><a href="#request-${r.id}">${r.type.label}</a> <span class="help">— a document, ${ukDatesIn(r.due.label)}</span></li>`)}</ul>`}
      </section>

      <section class="card"><div class="card-h"><h2>Questions we still need answered</h2></div>
      ${open.length === 0
        ? h`<p class="help">Nothing is waiting on you.</p>`
        : open.map((t) => h`
          <div class="pblock" id="question-${t.id}">
            <p><strong>${t.question}</strong></p>
            <div class="help">${why(h`<em>Why we are asking:</em> ${t.why}<br><em>What it holds up:</em> ${t.holds_up}`)}</div>
            <form method="post" action="/portal/tasks/${t.id}">
              <label class="vh" for="answer-${t.id}">Your answer to: ${t.question}</label>
              <input class="fi" id="answer-${t.id}" name="answer" placeholder="Your answer">
              <label class="ck"><input type="checkbox" name="dont_know"> I don’t know</label>
              <button class="cta" type="submit">Send this answer</button>
            </form>
          </div>`)}
      ${tks.filter((t) => t.state === 'ANSWERED').map((t) => h`
        <p class="help">✓ ${t.question} — ${t.answer_state === 'DONT_KNOW' ? 'answered “I don’t know”' : t.answer}
        (${t.answered_by_role === 'CLIENT' ? 'you' : 'Cap Rebate'}, ${t.answered_at === null ? '' : localStamp(t.answered_at, nowIso)})</p>`)}
      </section>

      <section class="card"><div class="card-h"><h2>Documents we have asked you for</h2></div>
      ${asked.length === 0
        ? h`<p class="help">We are not waiting on any document from you.</p>`
        : asked.map((r) => h`
          <div class="pblock" id="request-${r.id}">
            <p><strong>${r.type.label}</strong> — ${r.due.overdue ? h`<strong>${ukDatesIn(r.due.label)}</strong>` : h`${ukDatesIn(r.due.label)}`}</p>
            <div class="help">${why(h`<em>Why we are asking:</em> ${r.why}<br><em>What it holds up:</em> ${r.holds_up}`)}</div>
            <form method="post" action="/portal/documents" enctype="multipart/form-data">
              <input type="hidden" name="request" value="${r.id}">
              <label class="dropzone" for="send-${r.id}"><span class="dropwords">Drop the file here, or tap to choose it</span>
                <input id="send-${r.id}" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"></label>
              <button class="cta" type="submit">Send this file</button>
            </form>
            <p class="help">It is marked received when the file arrives and passes our checks. There is no button
            to say you have sent it.</p>
          </div>`)}
      ${reqs.filter((r) => r.state === 'RECEIVED').map((r) => h`
        <p class="help">✓ ${r.type.label} — received${r.received === null ? '' : `, version ${r.received.version_no ?? ''}, ${ukDatesIn(r.received.at)}`}</p>`)}
      </section>

      <section class="card"><div class="card-h"><h2>What happens at each step</h2></div>
      ${progress.known
        ? h`<details><summary>Show each step</summary><ul class="steps">${progress.steps.map((s) => h`
            <li class="${s.state}"><span class="lab">${stepName(s.stage, named)}</span><br>
            <span class="say">${s.stage.toTheClient}</span></li>`)}</ul></details>`
        : h`<div class="flag">We cannot show where this claim is right now, and we will not guess.
            Ask us and we will tell you. <span class="help">${P.stageInWords(business.stage)}</span></div>`}
      </section>

      <section class="card"><div class="card-h"><h2>What we have issued to you</h2></div>
      ${dlv.length === 0
        ? h`<p class="help">Nothing has been issued yet.</p>`
        : h`<table><tbody>${dlv.map((x) => h`<tr><td>${x.label}</td><td>version ${x.version}, issued ${ukDate(x.issued_on)}</td>
            <td class="help">${x.note}</td></tr>`)}</tbody></table>`}
      </section>

      ${share.length === 0 ? raw('') : h`
      <section class="card"><div class="card-h"><h2>The firm that referred you</h2></div>
      ${share.map((s) => h`
        <div class="pblock">
          <p><strong>${s.says}</strong></p>
          <p class="help">${s.words}</p>
          ${s.can_withdraw ? h`<form method="post" action="/portal/share-progress">
              <input type="hidden" name="introducer_id" value="${s.introducer_id}">
              <input type="hidden" name="decision" value="WITHDRAWN">
              <input type="hidden" name="wording_version" value="${s.wording_version}">
              <button class="cta" type="submit">Stop telling ${s.firm_name} how my claim is progressing</button>
            </form>` : raw('')}
          ${s.can_give ? h`<form method="post" action="/portal/share-progress">
              <input type="hidden" name="introducer_id" value="${s.introducer_id}">
              <input type="hidden" name="decision" value="GIVEN">
              <input type="hidden" name="wording_version" value="${s.wording_version}">
              <button class="cta" type="submit">Keep ${s.firm_name} informed</button>
            </form>` : raw('')}
        </div>`)}</section>`}

      <section class="card"><div class="card-h"><h2>Your engagement letter</h2></div>
      ${eng === null
        ? h`<p class="help">No engagement letter has been prepared yet.</p>`
        : h`<p>Status: <strong>${eng.state.toLowerCase().replace('_', ' ')}</strong>${eng.signed_at !== null ? h`, ${localStamp(eng.signed_at, nowIso)}` : raw('')}.</p>
            <p><a class="cta" href="/portal/letter">Read the letter</a></p>`}
      </section>

      <section class="card" id="appointment"><div class="card-h"><h2>Your appointment</h2></div>
      ${bks.length === 0
        ? h`<p class="help">Nothing is booked. Reply to any message from us and we will arrange a call.</p>`
        : h`<table><thead><tr><th>How</th><th>When</th><th>Booked from</th></tr></thead><tbody>
            ${bks.map((b) => h`<tr>
              <td>${b.channel === 'phone' ? 'Telephone' : b.channel === 'email' ? 'Email' : 'Text message / WhatsApp'}</td>
              <td>${b.starts_at === null
                ? 'No set time. Only a telephone call books a time.'
                : clockOf(b.starts_at)}</td>
              <td>${BOOKED_FROM[b.entry_point] ?? b.entry_point.replace(/_/g, ' ')}</td></tr>`)}</tbody></table>
          ${bks.map((b) => movePanel(b, slots, nowIso))}`}
      </section>

      <section class="card" id="documents"><div class="card-h"><h2>Documents</h2></div>
      ${extra.sent === true ? savedMessage('Thank you. We have your file.') : raw('')}
      ${dcs.length === 0 ? h`<p class="help">Nothing uploaded yet.</p>` : h`
        <table><thead><tr><th>Document</th><th>Version</th><th>State</th><th></th></tr></thead><tbody>
        ${dcs.map((x) => h`<tr><td>${x.type_label === null ? x.filename : `${x.type_label} ${x.seq ?? ''}`}</td>
          <td>${x.version_no === null ? '—' : String(x.version_no)}</td>
          <td>${x.failure_code !== null ? 'We could not use it' : x.strip_recorded_at !== null && x.quarantine_discharged_at !== null ? 'Read' : 'Not read yet'}</td>
          <td><a href="/portal/documents/${x.id}">What we did with it</a></td></tr>`)}</tbody></table>`}
      <form method="post" action="/portal/documents" enctype="multipart/form-data">
        <p class="fl"><strong>Send us a document</strong></p>
        <label class="dropzone" for="send-file"><span class="dropwords">Drop a file here, or tap to choose one</span>
          <input id="send-file" type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx"></label>
        <label class="fl" for="send-type">What is it?</label>
        <select class="fi" id="send-type" name="type_code">${types.map((t) => h`<option value="${t.code}">${t.label}</option>`)}</select>
        ${versionable.length === 0 ? raw('') : h`<label class="fl" for="send-version">A new version of one you have already sent? (optional)</label>
        <select class="fi" id="send-version" name="document"><option value="">No — a new document</option>${
          versionable.map(([id, label]) => h`<option value="${id}">${label}</option>`)}</select>`}
        <p class="help">We name the file ourselves, so nothing personal is kept in its name. Nothing you send replaces
        an earlier version: each is kept as a version of its own.</p>
        <button class="cta" type="submit">Send</button>
      </form></section>

      <section class="card"><div class="card-h"><h2>Your account</h2></div>
      <p><a href="/portal/settings">Change your password, name or username</a></p></section>`,
  });
}

/** A claim's stage in the client's words. */
function portalClaimStage(c: P.PortalClaim, named: boolean): string {
  if (c.state === 'FINISHED') return 'Finished';
  if (c.state === 'CLOSED') return 'Closed';
  if (c.state === 'UNKNOWN' || c.progress.current === undefined) return 'We will update this soon';
  return stepName(c.progress.current, named);
}

/** PHASE 134 — ONE TILE PER CLAIM: the property, its town, how far it has got, and its reference in grey. */
function portalClaimTiles(cls: readonly P.PortalClaim[], named: boolean, company: string): Safe {
  return h`<ul class="tiles">${cls.map((c) => h`<li class="tile">
    <p class="tilename"><a href="/portal/claims/${c.id}">${propertyIn(company, c.property) ?? 'Your claim'}</a></p>
    ${c.town === null || c.town.trim() === '' ? raw('') : h`<p class="help">${c.town}</p>`}
    <p>${badge(portalClaimStage(c, named), c.state === 'OPEN' ? 'info' : 'plain')}</p>
    <p>${claimRef(c.ref)}</p></li>`)}</ul>
    <p class="help">Questions, documents and messages for all your claims are on this page.</p>`;
}

/** PHASE 134 — ONE CLAIM'S PROGRESS, inside the company's portal. Questions, documents and messages stay on /portal. */
/** PHASE 139: the client's told steps, or none for a login that may not read them. Never a refusal on the portal's own page. */
function portalSteps(db: Db, actor: Actor, business_id: string): ClientStep[] {
  return can(actor, 'client_step.read', { type: 'client_steps', id: business_id, business_id }) ? clientSteps(db, actor, business_id) : [];
}

function portalClaimPage(actor: Actor, business: P.Business, c: P.PortalClaim, named: boolean, done: readonly ClientStep[] = []): string {
  const property = propertyIn(business.name, c.property);
  const where = [property, c.town].filter((x): x is string => x !== null && x.trim() !== '').join(', ');
  return page({
    title: `${business.name} — ${property ?? 'your claim'}`, nav: nav(actor), wide: true,
    body: h`${breadcrumb([{ label: business.name, href: '/portal' }, { label: property ?? 'Your claim' }])}
      <header class="highlights"><p class="eyebrow">Your claim</p><h1>${business.name}</h1>
        <p class="subhead">${where === '' ? 'Your claim' : `Claim on ${where}`} ${claimRef(c.ref)}</p>
        <p>${badge(portalClaimStage(c, named), c.state === 'OPEN' ? 'info' : 'plain')}</p></header>
      ${c.progress.known ? clientStageBar(c.progress.steps.map((s) => ({ label: stepName(s.stage, named), state: s.state }))) : raw('')}
      <section class="card"><div class="card-h"><h2>Where this claim is</h2></div>
        ${c.state === 'FINISHED' ? h`<p>This claim is finished.</p>`
          : c.state === 'CLOSED' ? h`<p>This claim is closed. We will have told you why. Ask us if anything is unclear.</p>`
            : c.progress.current === undefined ? h`<p>We will update this soon. Ask us if you need to know now.</p>`
              : h`<p>${c.progress.current.toTheClient}</p>`}
      </section>
      ${clientStepsCard(done, [{ id: c.id, name: property ?? 'Your claim' }], c.id)}
      <section class="card"><div class="card-h"><h2>What we need from you</h2></div>
        <p>Questions, documents and messages for all your claims are in one place.</p>
        <p><a class="btn btn-primary" href="/portal#waiting-on-you">See what we need from you</a></p>
      </section>
      <p><a href="/portal">Back to your claims</a></p>`,
  });
}

/**
 * PHASE 146f: THE ADDRESS A SIGNATURE CAME FROM. The socket's own address; behind a host's proxy, the first address in
 * X-Forwarded-For, but only when CAPREBATE_TRUST_PROXY=1 says a proxy we trust set it — otherwise anyone could type one.
 */
function clientIp(req: IncomingMessage): string {
  if (process.env.CAPREBATE_TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function letterPage(
  actor: Actor, business: P.Business, eng: P.EngagementView | null,
  problem?: string, typed?: { full_name: string; role: string },
): string {
  // The record's number travels with its name. Absent is omitted, never passed as undefined; a blank is passed and
  // letter.ts treats it as absent — the specimen stays and is flagged, never read as the client's (N4).
  const shown = shownLetter(business);
  const openTerms = loadLetter({
    clientName: business.name,
    ...(business.company_number === undefined || business.company_number === null ? {} : { companyNumber: business.company_number }),
  });
  const missing = signingMissing(ENGAGEMENT_SIGNING, shown);
  const canSign = eng !== null && (eng.state === 'SENT' || eng.state === 'VIEWED');
  return page({
    title: 'Engagement letter', nav: nav(actor),
    body: h`
      <h1>Engagement letter</h1>
      <p>Status: <strong>${eng === null ? 'not prepared' : eng.state.toLowerCase().replace('_', ' ')}</strong>.</p>
      ${problem === undefined ? raw('') : h`<p class="err">${problem}</p>`}

      ${openTerms.openTerms.length > 0 ? h`<div class="flag"><strong>Some terms are not settled yet, so they are left blank on purpose.</strong>
      ${openTerms.openTerms.length} of them. We will not issue the letter until they are.${why(h`If we guessed a figure, the contract would hold a
      number nobody has agreed. These terms are CAP REBATE LTD’s to settle.`)}
      <ul>${openTerms.openTerms.map((t) => h`<li><strong>${t.clause}</strong> — <q class="letter-quote">${t.text}</q></li>`)}</ul></div>` : raw('')}

      ${openTerms.specimens.length > 0 ? h`<div class="flag"><strong>Sample wording still in this
      letter:</strong> ${openTerms.specimens.join('; ')}. It is an example, not your figure.</div>` : raw('')}

      <div class="letter">${shown.paragraphs.map((p) => p.heading
        ? h`<p class="clause">${p.text}</p>`
        : h`<p>${p.text}</p>`)}</div>

      ${eng !== null && eng.state === 'SIGNED' ? h`<p><strong>You signed this letter${eng.signed_at === null ? '' : ` on ${localWhen(eng.signed_at)}`}.</strong></p>` : canSign ? h`
      <form method="post" action="/portal/letter/sign" class="sign">
        <h2>Sign the letter</h2>
        <input type="hidden" name="letter_sha256" value="${shown.sha256}">
        <label>Your full name <input name="full_name" required maxlength="200" autocomplete="name" value="${typed?.full_name ?? ''}"></label>
        <label>Your role in the business <input name="signer_role" required maxlength="120" autocomplete="organization-title" value="${typed?.role ?? ''}"></label>
        <label class="ck"><input type="checkbox" name="authorised" required> I confirm I may sign this letter for ${business.name}.</label>
        <button class="cta" type="submit">Sign</button>
      </form>
      ${missing.length === 0 ? raw('') : h`<div class="gate">Signing is not switched on yet.${why(h`${missing.join(' ')}`)}</div>`}` : raw('')}
      <div class="gate">When you sign, we keep a record of it.${why(h`We keep your name, your role and the time. We keep the internet address you signed from. We keep a fingerprint of this exact letter. You get a copy of the signed letter by email. We never take a payment here.`)}</div>`,
  });
}

/**
 * THE UPLOAD LINK, AND A FORM THAT USES IT — the CRM follow-on. A browser sends the file with the form below: a multipart
 * POST to the same address a PUT uses, carrying the same single-use key, and no script. The PUT is still described for a
 * caller that is not a browser.
 */
function uploadTicketPage(doc_id: string, url: string, expires_at: string): string {
  return page({
    title: 'Upload link', body: h`
      <h1>Your upload link is ready</h1>
      <form method="post" action="${url}&doc=${doc_id}" enctype="multipart/form-data">
        <label class="fl" for="upload-file">Choose the file</label>
        <input class="fi" id="upload-file" type="file" name="file" required>
        <button class="cta" type="submit">Send the file</button>
      </form>
      <p class="help">This link works once, for this one document, until ${localStamp(expires_at)}.</p>
      <p class="help">We check the file's type and size when it arrives.</p>
      <p><a href="/portal">Back to your claim</a></p>`,
  });
}

/**
 * THE CLIENT'S OWN DOCUMENT PAGE. PHASE 144: what we read is said in the same plain counts the staff Files folder shows
 * ("We read 3 pages."), from `readLines` — counts only, never the file's words, a note or a figure. Anything not known yet
 * is said as not known, never left out.
 */
function documentPage(doc: P.DocumentView, read: { state: 'READ' | 'WAITING' | 'REFUSED'; lines: readonly string[] }): string {
  return page({
    title: doc.filename, body: h`
      <h1>${doc.type_label === null ? doc.filename : `${doc.type_label} ${doc.seq ?? ''} — version ${doc.version_no ?? ''}`}</h1>
      <table><tbody>
        <tr><th>Sent</th><td>${localStamp(doc.created_at)}</td></tr>
        <tr><th>Where it is</th><td>${read.state === 'READ' ? 'We have read it' : read.state === 'REFUSED' ? 'We could not use it' : 'Not read yet'}</td></tr>
        <tr><th>What it is</th><td>${doc.type_label ?? 'Not known yet'}</td></tr>
        <tr><th>Kind of file</th><td>${doc.sniffed_as === null ? 'Not known yet' : `${doc.sniffed_as} (we checked the file itself, not its name)`}</td></tr>
        <tr><th>We read it</th><td>${doc.strip_recorded_at === null ? 'Not yet' : localStamp(doc.strip_recorded_at)}</td></tr>
        <tr><th>We deleted the file</th><td>${doc.quarantine_discharged_at === null ? 'Not yet' : localStamp(doc.quarantine_discharged_at)}</td></tr>
      </tbody></table>

      <h3>What we did with it</h3>
      <ul>${read.lines.map((l) => h`<li>${l}</li>`)}</ul>

      <p class="help">${doc.original_kept_at === null || doc.original_deleted_at !== null ? READ_AND_DELETED : 'We have kept the original safely.'}</p>
      <p><a href="/portal">Back to your claim</a></p>`,
  });
}

export { NotAuthorised };
