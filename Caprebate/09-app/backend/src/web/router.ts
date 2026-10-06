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
import { cleanForm } from './typed.ts';
import type { App } from '../app.ts';
import { authorise, can, NotAuthorised, type Actor } from '../authz.ts';
import type { Db } from '../db.ts';
import { authenticate, logout, AuthError, SESSION_COOKIE_NAME, GENERIC_AUTH_FAILURE, TEMPORARY_PASSWORD_EXPIRED,
  requestPasswordReset, completePasswordReset, type LoginResult } from '../auth.ts';
import * as SI from './sign-in.ts';
import { RECOVERY_CODES_LOW } from './recovery-codes.ts';
import { toActor } from '../users.ts';
import { SITE_CSS, CSS_HEADERS, PNG_HEADERS } from './assets.ts';
import { LOGO_INK_PNG } from './brand-logo.ts';
import { h, raw, page, HTML_HEADERS, type Safe } from './html.ts';
import { FUNNEL, FRONTDOOR, BOOKING, registryGate } from './engine.ts';
import {
  isGatedExit, newDraft, loadDraft, saveDraft, submit, closeGatedExit, type Draft,
} from './assessment.ts';
import { F4_ROUTE, F4_SCREENS, F4_TEXT, applyF4, applyReach, allGated, buildings, figureBody, firstIncomplete, isFunnel4, screenBody, stageBar, stageOf, submitEnquiry, type F4Screen } from './funnel4.ts';
import { searchCompanies, companySearchOffered, COMPANY_SEARCH } from '../connectors/company-search.ts';
import { checkPostcode, normalisePostcode, postcodeCheckMissing, POSTCODE_CHECK } from '../connectors/postcode-check.ts';
import { ADDRESS_LOOKUP, addressLookupMissing, findAddresses, searchesToday } from '../connectors/address-lookup.ts';
import { ADDRESS_LOOKUP_JS } from './address-lookup-script.ts';
import { loadLetter } from './letter.ts';
import * as P from './portal.ts';
import { ENGAGEMENT_SIGNING, shownLetter, signEngagement, signingMissing } from './signing.ts';
import { portalMessagesBody, readPortalSend, sendFromPortal } from './messages-pages.ts';
import { clientMessage, type ThreadMessage as MessageView } from './messages.ts';
import { FsObjectStore } from './objectstore.ts';
import { acceptClientBytes, finishUpload, issuedJob, readerFor } from './uploads.ts';
import { singleFile } from './multipart.ts';
import { readUpload, receiveFile } from './client-files-pages.ts';
import { READ_AND_DELETED } from './originals.ts';
import { receivableTypes, startDocumentUpload, readLines, type RequestView } from './documents.ts';
import { handleStaff, handlePortalSettings } from './staff.ts';
import { mayEnterBackOffice, NotFoundAsRefusal } from './backoffice.ts';
import { navContext, staffShell, portalShell, setSubMenu, type NameSwitches, type NavContext } from './navigation.ts';
import { badge, breadcrumb, card, claimRef, clientStageBar, noticeAtAddress, propertyIn, savedMessage, welcomeCard, why } from './components.ts';
import { stepName } from './portal-steps.ts';
import { clientSteps, type ClientStep } from './approvals.ts';
import { clientStepsCard } from './approvals-pages.ts';
import { welcomeShown, dismissWelcome, WELCOME_JOBS } from './welcome.ts';
import { clientHelp } from './help.ts';
import { nameSwitches } from './navigation.ts';
import { publicSlots, isBookable, SLOT_MINUTES } from './schedule.ts';
import { activeMeeting, booksATime, clientMayJoin, joinPanel, reconcileVideoMeeting, withJoinScripts, VIDEO_PAGE_HEADERS } from './video-calls.ts';
import { portalDashboard } from './portal-dashboard.ts';
import * as IE from './inbound-email.ts';
import { joinSignature } from '../connectors/zoom.ts';
import { VIDEO_CALL_JS } from './video-call-script.ts';
import { PHOTO_UPLOAD_JS } from './photo-upload-script.ts';
import { SIGNATURE_PAD_JS } from './signature-pad-script.ts';
import { signedCopy } from './engagement-send.ts';
import { WHATSAPP_IMPORT_JS } from './whatsapp-import-script.ts';
import { REGISTER_IMPORT_JS } from './register-import-script.ts';
import { sweepUploads } from './photo-upload.ts';
import { sweepVideos } from './survey-video.ts';
import { receiveWhatsApp } from './whatsapp.ts';
import { webhookChallenge } from '../connectors/whatsapp.ts';
import { EMAIL_SENDING, mailWhere, sendingOn, smtpLoginFromKeyFile } from '../stubs/email-provider.ts';
import { bookingInviteFile, sendVideoInvite } from './booking-invite.ts';
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
import { homeEdition, gsapScript, HOME_PAGE_HEADERS } from './home-site.ts';
import { checkTurnstile, refusalWords, turnstileSiteKey, withSiteKey, TURNSTILE_FIELD } from '../connectors/turnstile.ts';
import { receiveEnquiry } from './enquiries.ts';
import { offerSignup, requestSignup, verifyOpen, confirmSignup, MIN_PASSWORD } from './signup.ts';
import { freeGate, recordLookupsDeclined } from './address-check.ts';
import { IDENTITY_HOOK_MAX_BYTES, IDENTITY_HOOK_PATH, IDENTITY_SIGNATURE_HEADERS, receiveIdentityResult, storageReason } from './identity-checks.ts';
import { handleSignoffLink, portalReport, portalReportCard } from './report-pages.ts';
import { handlePortalEvidence, portalEvidenceCard } from './evidence-pages.ts';

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
  /** PHASE 153d: the test-only letter (src/web/letter.ts, TEST_LETTER_PATH). Absent is the real letter. Only the test website passes it. */
  letterPath?: string;
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

/** STRESS TEST, 29 SEP 2026: the addresses where a HEAD is answered as a GET, because their GET changes nothing. */
function HEAD_AS_GET(path: string): boolean {
  return path === '/' || path.startsWith('/assets/') || path === '/login' || path === '/favicon.svg' || path === '/favicon.ico'
    || path === '/privacy/' || path === '/privacy' || path === '/notices/' || path === '/notices';
}

/** The browser tab's icon: the home page's mark (the calculator drawn as a house) on the ink ground. */
const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="10" fill="#121614"/>' +
  '<g transform="translate(3 3) scale(0.875)"><path d="M14 43 H34 A4 4 0 0 0 38 39 V20.5 L24 8 L10 20.5 V39 A4 4 0 0 0 14 43 Z" fill="none" stroke="#EDEAE2" stroke-width="3.4" stroke-linejoin="round"/>' +
  '<rect x="16" y="20" width="16" height="5.5" rx="1.6" fill="none" stroke="#ABEDD8" stroke-width="2.8"/>' +
  '<g fill="#EDEAE2"><rect x="16" y="29.5" width="4" height="4" rx="1"/><rect x="22" y="29.5" width="4" height="4" rx="1"/><rect x="28" y="29.5" width="4" height="4" rx="1"/>' +
  '<rect x="16" y="35.5" width="4" height="4" rx="1"/><rect x="22" y="35.5" width="4" height="4" rx="1"/><rect x="28" y="35.5" width="4" height="4" rx="1"/></g></g></svg>';
const FAVICON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'image/svg+xml', 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=86400',
});

const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
});

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, HTML_HEADERS);
  res.end(body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

/**
 * PHASE 154a1 (line 3), 4 October 2026 — A REFUSED BODY CLOSES ITS CONNECTION, CLEANLY. The 3 October sweep found that
 * after a 413 on a kept-alive connection the next request on it hung about 6 s and was reset: reading stopped part-way,
 * the rest of the body was left in the connection, and the connection was kept. Now the rest of a body over its cap is
 * read and dropped - up to DRAIN_MAX more, so the sender is never cut off mid-send and sees the answer - and the 413
 * says "Connection: close", so the connection ends when the answer has gone and nothing left in it is taken for the
 * next request. A body more than DRAIN_MAX over its cap is refused at once and the connection closed under it.
 * server.ts tells this file which response each request is answered on.
 */
const DRAIN_MAX = 8 * 1024 * 1024;
const RESPONSES = new WeakMap<IncomingMessage, ServerResponse>();
export function bindResponse(req: IncomingMessage, res: ServerResponse): void { RESPONSES.set(req, res); }
function closeAfterAnswer(req: IncomingMessage): void {
  const res = RESPONSES.get(req);
  if (res === undefined || res.headersSent) return;
  res.shouldKeepAlive = false;
  res.setHeader('connection', 'close');
}

/** Bodies are capped. A cap is a control, not a nicety. */
export function readBody(req: IncomingMessage, max = 2 * 1024 * 1024): Promise<Buffer> {
  if (req.readableEnded) return Promise.resolve(Buffer.alloc(0));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    let settled = false;
    const refuse = (): void => {
      if (settled) return;
      settled = true;
      closeAfterAnswer(req);
      reject(new PayloadTooLarge());
    };
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (!over && size > max) { over = true; chunks.length = 0; }
      if (over) { if (size > max + DRAIN_MAX) refuse(); return; } // the rest of a refused body is read and dropped
      chunks.push(c);
    });
    req.once('end', () => {
      if (over) { refuse(); return; }
      if (!settled) { settled = true; resolve(Buffer.concat(chunks)); }
    });
    req.once('error', (e) => { if (!settled) { settled = true; reject(e); } });
  });
}

export class PayloadTooLarge extends Error {
  constructor() { super('body too large'); this.name = 'PayloadTooLarge'; }
}

async function form(req: IncomingMessage): Promise<URLSearchParams> {
  // PHASE 154a1 (line 9): invisible characters out on the way in (src/web/typed.ts).
  const typed = cleanForm(new URLSearchParams((await readBody(req)).toString('utf8')));
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
    // 29 Sep 2026: the public header says what the home page's button says (Lakhbir: "Am I eligible?").
    ? h`<nav><a class="navcta" href="/assessment">Am I eligible?</a><a href="/login">Log in</a></nav>`
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
  /* STRESS TEST, 29 SEP 2026: A HEAD asks for a GET's headers without its body (Node drops the body itself). Link
     checkers, uptime monitors and link previews send it, and got a 401. Answered as a GET only where a GET changes
     nothing: the home page, the files, sign-in, the notices. Anywhere else a HEAD meets the page for unknown addresses. */
  const method = req.method === 'HEAD' && HEAD_AS_GET(path) ? 'GET' : req.method ?? 'GET';
  const newId = d.newId ?? randomUUID;
  const now = d.app.now;

  const session = authenticate(d.app.deps, cookie(req, SESSION_COOKIE_NAME));
  const actor: Actor | undefined = session ? toActor(session.user) : undefined;

  /* ---------------------------------------------------------- assets */
  if (path === '/assets/site.css' && method === 'GET') {
    res.writeHead(200, CSS_HEADERS); res.end(SITE_CSS); return 'handled';
  }
  // 30 Sep 2026: the join pages' one script (src/web/video-call-script.ts).
  if (path === '/assets/video-call.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(VIDEO_CALL_JS); return 'handled';
  }
  // PHASE 156c: the WhatsApp pages' one script, which opens an exported chat on the person's computer.
  if (path === '/assets/whatsapp-import.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(WHATSAPP_IMPORT_JS); return 'handled';
  }
  // PHASE 156e: the Connections page's one script, which trims a care regulator's list on the Admin's computer.
  if (path === '/assets/register-import.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(REGISTER_IMPORT_JS); return 'handled';
  }
  // PHASE 156f: the assessment's address box's one script (src/web/address-lookup-script.ts).
  if (path === '/assets/address-lookup.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(ADDRESS_LOOKUP_JS); return 'handled';
  }
  // PHASE 157c: the engagement letter's signing pad (src/web/signature-pad-script.ts).
  if (path === '/assets/signature-pad.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(SIGNATURE_PAD_JS); return 'handled';
  }
  // 2 Oct 2026: the photo page's one script (src/web/photo-upload-script.ts).
  if (path === '/assets/photo-upload.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(PHOTO_UPLOAD_JS); return 'handled';
  }
  /* 30 Sep 2026: THE CLIENT'S JOIN PAGE, /call/<token>. The token is the only key: 64 hex characters, made when the
     meeting was made and sent only to the client. It opens from half an hour before the call until an hour after. */
  const callMatch = /^\/call\/([0-9a-f]{64})$/.exec(path);
  if (callMatch && method === 'GET') {
    const m = d.app.db.get<{ booking_id: string; meeting_id: string; join_url: string; passcode: string | null; starts_at: string | null; ends_at: string | null; cancelled_at: string | null; business_id: string | null; lead_id: string | null }>(
      'SELECT v.booking_id, v.meeting_id, v.join_url, v.passcode, b.starts_at, b.ends_at, b.cancelled_at, b.business_id, b.lead_id ' +
      'FROM video_meetings v JOIN bookings b ON b.id = v.booking_id WHERE v.client_token = ? AND v.cancelled_at IS NULL', [callMatch[1] ?? '']);
    if (m === undefined || m.starts_at === null || m.ends_at === null || m.cancelled_at !== null) {
      res.writeHead(404, VIDEO_PAGE_HEADERS);
      res.end(page({ title: 'Video call', nav: nav(actor), body: h`<h1>This call is not available</h1>
        <p>The link may be for a call that was moved or cancelled. Please check the latest email from us, or reply to it and we will help.</p>` }));
      return 'handled';
    }
    const when = clientMayJoin(m.starts_at, m.ends_at, now());
    const who = d.app.db.get<{ n: string }>(
      'SELECT full_name AS n FROM contacts WHERE (business_id = ? OR lead_id = ?) ORDER BY created_at ASC, id ASC LIMIT 1', [m.business_id, m.lead_id])?.n ?? 'Guest';
    const sig = when === 'open' ? joinSignature(d.app.secrets, m.meeting_id, 0, now()) : null;
    const head = h`<h1>Your video call with Cap Rebate</h1><p><strong>${clockOf(m.starts_at)}</strong>, for an hour.</p>`;
    const zoomApp = h`<p class="help">Rather use the Zoom app, or on a phone? <a href="${m.join_url}" rel="noopener noreferrer">Open the call in Zoom</a>${m.passcode === null ? '' : ` (passcode ${m.passcode})`}.</p>`;
    const body = when === 'early' ? h`${head}<p>The call opens here half an hour before it starts. Come back then, or keep the email we sent you.</p>${zoomApp}`
      : when === 'over' ? h`${head}<p>This call has finished. If you missed it, reply to our email and we will arrange another.</p>`
      : sig === null ? h`${head}<p>The call cannot open on this page just now.</p>${zoomApp}`
      : h`${head}${joinPanel({ meeting_id: m.meeting_id, passcode: m.passcode, signature: sig.signature, sdk_key: sig.sdk_key, user_name: who.slice(0, 60), zak: null }, 'client')}${zoomApp}`;
    const out = page({ title: 'Your video call', nav: nav(actor), body, wide: true });
    res.writeHead(200, VIDEO_PAGE_HEADERS); res.end(sig === null ? out : withJoinScripts(out)); return 'handled';
  }
  // PHASE 133c: the supplied logo, from memory, like the stylesheet — never from a path on disk.
  if (path === '/assets/cap-rebate-logo.png' && method === 'GET') {
    res.writeHead(200, PNG_HEADERS); res.end(LOGO_INK_PNG); return 'handled';
  }
  // STRESS TEST, 29 SEP 2026: the house mark as the browser tab's icon. A browser asked for /favicon.ico on every page
  // and met a 401, which it logged as an error; pages now name /favicon.svg, and /favicon.ico answers "nothing here".
  if (path === '/favicon.svg' && method === 'GET') { res.writeHead(200, FAVICON_HEADERS); res.end(FAVICON_SVG); return 'handled'; }
  if (path === '/favicon.ico' && method === 'GET') { res.writeHead(204, { 'cache-control': 'public, max-age=86400' }); res.end(); return 'handled'; }
  /* STRESS TEST, 29 SEP 2026: THE PRIVACY NOTICE AND THE PUBLIC NOTICES ARE NOT PUBLISHED YET (03-app's notices page is a
     draft with facts not set, and the privacy notice waits on the data protection officer), but every page links to them
     and the links answered 401. Until they are published, a page that says so and how to reach us - nothing more. */
  if ((path === '/privacy/' || path === '/privacy' || path === '/notices/' || path === '/notices') && method === 'GET') {
    html(res, 200, page({ title: 'Privacy and public notices', nav: nav(actor), body: h`<h1>Privacy and public notices</h1>
      <p>Our privacy notice and our public notices are being prepared. They will be published on this page before the website opens to clients.</p>
      <p>Until then, if you have a question about how we use your details, or you want to make a complaint, email
      <a href="mailto:contact@caprebate.co.uk">contact@caprebate.co.uk</a>. A person will read it and reply.</p>
      <p><a href="/">Back to the home page</a></p>` }));
    return 'handled';
  }
  // STRESS TEST, 29 SEP 2026: the enquiry's thank-you page, reloaded or bookmarked, is a GET; it goes back to the form.
  if (path === '/enquiry' && method === 'GET') { redirect(res, '/#contact'); return 'handled'; }

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
  /* 29 SEPTEMBER 2026: THE NEW HOME PAGE (src/web/home-site.ts), its style, its script and GSAP, when the file is beside
     the build. Without it, `/` is `Caprebate site.html` as below. */
  if (path === '/assets/home.css' && method === 'GET') {
    const edition = homeEdition();
    if (edition !== undefined) { res.writeHead(200, { ...CSS_HEADERS, 'cache-control': 'public, max-age=300' }); res.end(edition.css); return 'handled'; }
  }
  if (path === '/assets/home.js' && method === 'GET') {
    const edition = homeEdition();
    // The configured Turnstile site key goes in here; without one the page keeps Cloudflare's test key.
    if (edition !== undefined) { res.writeHead(200, { ...SITE_JS_HEADERS, 'cache-control': 'public, max-age=300' }); res.end(withSiteKey(edition.js, turnstileSiteKey(d.app.secrets))); return 'handled'; }
  }
  if (path === '/assets/gsap.min.js' && method === 'GET') {
    const gsap = gsapScript();
    if (gsap !== null) { res.writeHead(200, { ...SITE_JS_HEADERS, 'cache-control': 'public, max-age=86400' }); res.end(gsap); return 'handled'; }
  }
  if (path === '/' && method === 'GET') {
    const edition = homeEdition();
    if (edition !== undefined) { res.writeHead(200, HOME_PAGE_HEADERS); res.end(edition.html); return 'handled'; }
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
  /* PHASE 151b: THE IDENTITY CHECK'S SIGNED RESULT. The service has no login, so this sits outside it — and believes
     nothing it is sent unless the signature holds (src/web/identity-checks.ts). A bad signature is refused and audited.
     The answer is a status and nothing else: the service reads no page, and a refusal says nothing about why. */
  /* 2 OCT 2026: THE ACCOUNTANT'S PRIVATE SIGN-OFF LINK (src/web/report-pages.ts). No login: the link is the key, kept only
     as its SHA-256, answered once, for 30 days. */
  if (path.startsWith('/signoff/')) {
    const r = await handleSignoffLink(d.app, newId, req, res, url, method, form);
    if (r === 'handled') return 'handled';
  }
  /* 30 SEP 2026: WHATSAPP — THE ADDRESS META CALLS (src/web/whatsapp.ts). No login: Meta has none. GET is Meta checking
     the address with our verify word; POST carries messages and statuses, believed only under Meta's signature. */
  if (path === '/hooks/whatsapp' && method === 'GET') {
    const ok = webhookChallenge(d.app.secrets, url.searchParams.get('hub.mode'), url.searchParams.get('hub.verify_token'), url.searchParams.get('hub.challenge'));
    res.writeHead(ok === null ? 403 : 200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(ok ?? 'refused');
    return 'handled';
  }
  if (path === '/hooks/whatsapp' && method === 'POST') {
    const raw0 = (await readBody(req, 1024 * 1024)).toString('utf8');
    const sig = req.headers['x-hub-signature-256'];
    const r = receiveWhatsApp(d.app, raw0, typeof sig === 'string' ? sig : null);
    res.writeHead(r.status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(r.status === 200 ? 'ok' : 'refused');
    return 'handled';
  }
  /* 1 OCT 2026: THE REPLY TIMER (src/web/inbound-email.ts, timerMayRead). No login: an outside timer calls it, with its
     word in the Authorization header. Counts only in the answer. */
  if (path === '/hooks/read-replies' && (method === 'POST' || method === 'GET')) {
    const auth = req.headers['authorization'];
    const why = IE.timerRefusal(d.app.secrets, typeof auth === 'string' ? auth : undefined);
    if (why !== null) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`refused: ${why}`);
      return 'handled';
    }
    const r = await IE.readRepliesIfDue(d.app);
    // 2 Oct 2026: the same wake clears photo uploads never finished within a day (src/web/photo-upload.ts).
    await sweepUploads({ db: d.app.db, now: d.app.now }, d.store);
    await sweepVideos({ db: d.app.db, now: d.app.now }, d.store);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(r === null ? (IE.lastReadWords(d.app)?.ok === false ? 'could not read the inbox' : 'read in the last two minutes')
      : r.state === 'OFF' ? 'reading replies is off' : `read ${String(r.read)}, filed ${String(r.filed)}, to sort ${String(r.queued)}`);
    return 'handled';
  }
  if (path === IDENTITY_HOOK_PATH && method === 'POST') {
    const raw0 = (await readBody(req, IDENTITY_HOOK_MAX_BYTES)).toString('utf8');
    // PHASE 151f: Didit signs with two headers and dates the result; any may be missing, and then nothing is believed.
    const one = (name: string): string | null => { const v = req.headers[name]; return typeof v === 'string' ? v : null; };
    const r = receiveIdentityResult(d.app, newId, raw0, {
      v2: one(IDENTITY_SIGNATURE_HEADERS.v2), raw: one(IDENTITY_SIGNATURE_HEADERS.raw), timestamp: one(IDENTITY_SIGNATURE_HEADERS.timestamp),
    });
    res.writeHead(r.status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(r.status === 200 ? 'ok' : r.note === undefined ? 'refused' : `refused. ${r.note}`);
    return 'handled';
  }
  if (path === '/enquiry' && method === 'POST') {
    const posted = await form(req);
    /* 29 SEPTEMBER 2026: THE SECURITY CHECK, ON THE SERVER (src/connectors/turnstile.ts). Without a secret key, or before
       the transfer to Cloudflare is approved, nothing is checked and the enquiry is kept as before. With both, an answer
       that is missing, rejected or unanswered refuses the enquiry: nothing is kept, and the audit says which. */
    const check = await checkTurnstile({ audit: d.app.audit, now: d.app.now, transport: d.app.outside, secrets: d.app.secrets,
      ...(d.app.turnstilePolicy === undefined ? {} : { policy_override: d.app.turnstilePolicy }) }, posted.get(TURNSTILE_FIELD), clientIp(req));
    if (check.state === 'FAILED') {
      d.app.audit.append({ at: d.app.now(), kind: 'WEBSITE_ENQUIRY_REFUSED', outcome: 'REFUSED', actor_id: null, actor_role: null,
        detail: { why: 'security_check', reason: check.reason, codes: [...check.codes] } });
      html(res, 400, page({ title: 'Your enquiry was not sent', nav: nav(actor),
        body: h`<h1>Your enquiry was not sent</h1><p class="err">${refusalWords(check)}</p><p><a href="/#contact">Go back to the form</a></p>` }));
      return 'handled';
    }
    const r = receiveEnquiry(d.app.deps, newId, posted, check.state === 'PASSED' ? 'passed' : `not_checked:${check.reason}`);
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
    // 30 Sep 2026: the assessment opens on stage 1 of the four-stage funnel (src/web/funnel4.ts).
    redirect(res, '/assessment/buildings'); return 'handled';
  }

  /* 30 SEPTEMBER 2026: the first screen of 29 September (the company and the property up front) is retired: the four-stage
     funnel asks for them per building, at stage 3. An old link to it opens stage 1. */
  if (path === '/assessment/start') { redirect(res, '/assessment/buildings'); return 'handled'; }

  /* 30 SEPTEMBER 2026: THE FOUR-STAGE FUNNEL (src/web/funnel4.ts). Buildings, then the checks per building, then who
     owns each and where, then the figure. The server keeps a person on the first screen that is not complete, and a
     follow-up that does not apply is not kept. */
  /* PHASE 156f (B1): THE ADDRESS BOX'S LIST, FOR THE PAGE'S SCRIPT. The postcode a person has typed on "Your details",
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

  /* PHASE 153f, 4 October 2026: the six screens of the first funnel are retired; an old link opens the four-stage funnel.
     Nothing they recorded is changed or deleted. Any request, GET or POST, with or without a draft, is sent to stage 1:
     no draft is made, read, saved or removed here. The privacy-notice link of Phase 153, which sat on the old address
     screen (Q2), is drawn on the four-stage address screen ("details") instead, under the same switch. */
  if (/^\/assessment\/(Q1|Q1a|Q1b|Q1c|Q2|Q3)$/.test(path)) { redirect(res, '/assessment/buildings'); return 'handled'; }

  if (path === '/assessment/figure' && method === 'GET') {
    const draft = loadDraft(d.app.db, cookie(req, DRAFT_COOKIE));
    if (draft === undefined) { redirect(res, '/assessment'); return 'handled'; }
    // 30 Sep 2026: a four-stage draft sees its figure only when stage 3 is done.
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
      /* 30 SEPTEMBER 2026: THE FOUR-STAGE CLOSE. First name, surname, position; then telephone (a time and the number),
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
      // 30 Sep 2026: a video call with a time gets its Zoom meeting now, and its invitation carries the link.
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
      html(res, 200, submittedPage(totals, booked, actor, actor === undefined ? offer : undefined, true, video, sendingOn(EMAIL_SENDING, smtpLoginFromKeyFile(d.app.secrets), mailWhere(d.app)))); return 'handled';
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
      // PHASE 151b (Word answer 180): the client asked us to leave the lookups alone. Kept with their organisation.
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
      // PHASE 151j: the password first, then the steps it still needs - a session only when none is left.
      const r = await SI.beginSignIn(d.app, f.get('email') ?? '', f.get('password') ?? '');
      if (r.kind === 'STEP') {
        res.setHeader('set-cookie', stepCookie(r.token));
        redirect(res, '/login/step'); return 'handled';
      }
      signedIn(res, r.login);
      return 'handled';
    } catch (e) {
      // GENERIC, ALWAYS. Never "no such user" — and `login` has already paid
      // for a password verification against a real hash so the timing does not
      // answer the question either. The one exception is a temporary password past its date: the password was RIGHT,
      // so saying so tells nobody anything they did not already know.
      if (e instanceof AuthError && e.code === 'E_TEMPORARY_EXPIRED') { html(res, 401, loginPage(TEMPORARY_PASSWORD_EXPIRED)); return 'handled'; }
      if (e instanceof AuthError) { html(res, 401, loginPage(GENERIC_AUTH_FAILURE)); return 'handled'; }
      throw e;
    }
  }

  /* PHASE 151j — THE STEPS BETWEEN A RIGHT PASSWORD AND A SESSION (src/web/sign-in.ts). */
  if (path === '/login/step' && method === 'GET') {
    // PHASE 151m: ?use=recovery draws the VERIFY step as the recovery-code form.
    const body = SI.stepPage(d.app, cookie(req, SI.STEP_COOKIE), undefined, undefined, url.searchParams.get('use') === 'recovery' ? 'recovery' : undefined);
    if (body === undefined) { res.setHeader('set-cookie', stepCookie(null)); html(res, 200, loginPage(SI.STEP_GONE, undefined, stepGoneWhy(d.app))); return 'handled'; }
    html(res, 200, body); return 'handled';
  }
  const stepAction = /^\/login\/step\/(password|method|code|resend|recovery)$/.exec(path);
  if (stepAction && method === 'POST') {
    const f = await form(req);
    const raw0 = cookie(req, SI.STEP_COOKIE);
    const which = stepAction[1];
    const r = which === 'password' ? await SI.submitNewPassword(d.app, raw0, f.get('password') ?? '', f.get('again') ?? '')
      : which === 'method' ? SI.chooseMethod(d.app, raw0, f.get('method') ?? '')
      : which === 'code' ? SI.submitCode(d.app, raw0, f.get('code') ?? '')
      : which === 'recovery' ? SI.submitRecoveryCode(d.app, raw0, f.get('code') ?? '')
      : SI.resendCode(d.app, raw0);
    if (r.kind === 'SESSION') {
      res.setHeader('set-cookie', [stepCookie(null), sessionCookie(r.login)]);
      // PHASE 151m: a second step just set up shows its recovery codes, once, here - they are kept nowhere as text, so
      // this answer is the page. With two or fewer left, the page after sign-in is "Your second step", which says so.
      const home = mayEnterBackOffice(toActor(r.login.user)) ? '/staff' : '/portal';
      if (r.recovery_codes !== undefined) { html(res, 200, SI.recoveryCodesPage(r.recovery_codes, { href: home, label: 'I have saved them. Continue' })); return 'handled'; }
      if (r.recovery_left !== undefined && r.recovery_left <= RECOVERY_CODES_LOW) {
        redirect(res, r.login.user.role === 'CLIENT' ? '/portal/two-factor' : '/staff/two-factor'); return 'handled';
      }
      redirectHome(res, r.login); return 'handled';
    }
    if (r.kind === 'ACCOUNT_DONE') {
      res.setHeader('set-cookie', stepCookie(null));
      const done = actor?.role === 'CLIENT' ? '/portal/two-factor?done=set' : '/staff/two-factor?done=set';
      if (r.recovery_codes !== undefined) { html(res, 200, SI.recoveryCodesPage(r.recovery_codes, { href: done, label: 'I have saved them. Continue' }, nav(actor))); return 'handled'; }
      redirect(res, done); return 'handled';
    }
    if (r.kind === 'GONE') { res.setHeader('set-cookie', stepCookie(null)); html(res, 401, loginPage(r.why, undefined, stepGoneWhy(d.app))); return 'handled'; }
    const page0 = SI.stepPage(d.app, raw0, r.kind === 'ERROR' ? r.why : undefined, r.kind === 'STEP' ? r.note : undefined,
      which === 'recovery' ? 'recovery' : undefined);
    if (page0 === undefined) { res.setHeader('set-cookie', stepCookie(null)); html(res, 401, loginPage(SI.STEP_GONE, undefined, stepGoneWhy(d.app))); return 'handled'; }
    html(res, r.kind === 'ERROR' ? 400 : 200, page0); return 'handled';
  }

  /* PHASE 151j — A FORGOTTEN PASSWORD: an emailed link, single-use, 30 minutes (src/auth.ts). The page says the same
     thing whether or not the address has an account, so it cannot be used to find out who has one. */
  if (path === '/login/forgot' && method === 'GET') { html(res, 200, forgotPage(undefined)); return 'handled'; }
  if (path === '/login/forgot' && method === 'POST') {
    const email = ((await form(req)).get('email') ?? '').trim();
    const r = requestPasswordReset(d.app.deps, email);
    if (r.user !== undefined && r.plaintextToken !== undefined) {
      d.app.email.send({
        to_email: r.user.email, kind: 'PASSWORD_RESET',
        subject: 'Reset your Cap Rebate password',
        body: `Somebody asked to reset the password for this Cap Rebate login. To choose a new one, open this link:\n\n` +
          `${d.publicOrigin ?? 'http://localhost:8103'}/login/reset?token=${r.plaintextToken}\n\n` +
          'The link works once, for 30 minutes. If you did not ask, you need do nothing: your password has not changed.',
      });
    }
    html(res, 200, forgotPage(FORGOT_SENT)); return 'handled';
  }
  if (path === '/login/reset' && method === 'GET') {
    html(res, 200, resetPage(url.searchParams.get('token') ?? '', undefined)); return 'handled';
  }
  if (path === '/login/reset' && method === 'POST') {
    const f = await form(req);
    const tok = f.get('token') ?? '';
    const next = f.get('password') ?? '';
    if (next.length < SI.MIN_PASSWORD || next.length > 1024) { html(res, 400, resetPage(tok, `Choose a password of at least ${SI.MIN_PASSWORD} characters.`)); return 'handled'; }
    if (next !== (f.get('again') ?? '')) { html(res, 400, resetPage(tok, 'The two passwords are not the same. Type it again.')); return 'handled'; }
    try {
      await completePasswordReset(d.app.deps, tok, next);
    } catch (e) {
      if (e instanceof AuthError) { html(res, 400, forgotPage(undefined, 'That reset link has expired or has been used. Ask for a new one below.')); return 'handled'; }
      throw e;
    }
    html(res, 200, loginPage(undefined, 'Your password has been changed. Sign in with it now.')); return 'handled';
  }

  /* PHASE 151j — A PERSON'S OWN SECOND STEP: set it up, change it, or (a client only) turn it off. A client's page is
     under /portal and a member of staff's under /staff, so each header links only inside its own application. */
  const own = /^\/(staff|portal)\/two-factor(\/change|\/off|\/recovery-codes)?$/.exec(path);
  if (own) {
    if (actor === undefined) { redirect(res, '/login'); return 'handled'; }
    const home = actor.role === 'CLIENT' ? '/portal/two-factor' : '/staff/two-factor';
    if (`/${own[1]}/two-factor` !== home) { redirect(res, home); return 'handled'; }
    if (own[2] === undefined && method === 'GET') {
      html(res, 200, twoFactorPage(actor, home, SI.ownTwoFactor(d.app, actor), url.searchParams.get('done'), undefined, SI.ownRecoveryCodesLeft(d.app, actor))); return 'handled';
    }
    /* PHASE 151m: "Make new recovery codes" - ten new ones, shown once on this answer, and every unused old one gone. */
    if (own[2] === '/recovery-codes' && method === 'POST') {
      const r = SI.makeNewRecoveryCodes(d.app, actor);
      if (!r.ok) { html(res, 400, twoFactorPage(actor, home, SI.ownTwoFactor(d.app, actor), null, r.why, SI.ownRecoveryCodesLeft(d.app, actor))); return 'handled'; }
      html(res, 200, SI.recoveryCodesPage(r.codes, { href: home, label: 'I have saved them. Back to your second step' }, nav(actor))); return 'handled';
    }
    if (own[2] === '/change' && method === 'POST') {
      res.setHeader('set-cookie', stepCookie(SI.startAccountSetup(d.app, actor)));
      redirect(res, '/login/step'); return 'handled';
    }
    if (own[2] === '/off' && method === 'POST') {
      const r = SI.removeOwnTwoFactor(d.app, actor);
      if (!r.ok) { html(res, 400, twoFactorPage(actor, home, SI.ownTwoFactor(d.app, actor), null, r.why, SI.ownRecoveryCodesLeft(d.app, actor))); return 'handled'; }
      redirect(res, `${home}?done=off`); return 'handled';
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
      await inContext(d, u.pathname, () => handleStaff({ app: d.app, store: d.store, newId, ...(d.publicOrigin === undefined ? {} : { publicOrigin: d.publicOrigin }) }, req, cap.res, u, 'GET', actor, form, readBody));
      return cap.done;
    };
    return inContext(d, path, () => handleStaff(
      { app: d.app, store: d.store, newId, ...(d.publicOrigin === undefined ? {} : { publicOrigin: d.publicOrigin }) }, req, res, url, method, actor, form, readBody,
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
    /* PHASE 146g: `reading` carries the process's key store and transport to steps 9 and 10 of the receipt contract,
       which nothing in src/ reached until this phase. It switches nothing on — CLAUDE_SWITCHES.DOCUMENT_READING is
       false — and with it off a finished upload behaves exactly as it did before. The document's own business is
       whose gates the reading's audit row records; `P.document` above has already authorised this actor on it. */
    const deps = { db: d.app.db, store: d.store, now, actor: actor.id, newId, audit: d.app.audit,
      reading: readerFor(d.app, job.entity_id, actor.role) };
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

  /* STRESS TEST, 29 SEP 2026: AN ADDRESS NOBODY OWNS. It fell through to the JSON API, which asked for a login and
     answered 401 "those details did not match" to a person who had only mistyped an address. A GET or HEAD outside
     /api now gets a page that says so. The JSON API keeps its own answers: every one of its addresses is under /api. */
  if ((method === 'GET' || method === 'HEAD') && path !== '/api' && !path.startsWith('/api/')) {
    html(res, 404, page({ title: 'Page not found', nav: nav(actor), body: h`<h1>We cannot find that page</h1>
      <p>The address may be mistyped, or the page may have moved.</p>
      <p><a class="cta" href="/">Go to the home page</a></p>` }));
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
    // 30 Sep 2026: each video call with a meeting gets its join link on the portal.
    const joins: Record<string, string> = {};
    for (const b of bks) { const m = b.channel === 'video' ? activeMeeting(db, b.id) : undefined; if (m !== undefined) joins[b.id] = `/call/${m.client_token}`; }
    // 1 Oct 2026: the top of the portal as a dashboard (src/web/portal-dashboard.ts).
    // 2 Oct 2026: the survey report's card leads, once a tax adviser's sign-off has released it (src/web/report-pages.ts).
    const dashboard = h`${portalReportCard(d.app, business_id)}${portalEvidenceCard(db, business_id)}${portalDashboard({ db, actor, business_id, nowIso: now(), bookings: bks, tasks: tks, requests: reqs, done, delivered: dlv, joins })}`;
    html(res, 200, portalPage(actor, business, progress, eng, bks, tks, dcs, reqs, receivableTypes(db), rng,
      publicSlots(db, now()), now(), dlv, shr, { proposedSteps: nameSwitches().portalSteps, claims: cls, done, sent: url.searchParams.get('sent') === '1', joins, dashboard, ...(welcome === undefined ? {} : { welcome }) }));
    return 'handled';
  }

  /* PHASE 142: MESSAGES — the thread with the client, and nothing else. `business_id` is the session's for a client, so a
     client only ever reads and writes their own company's thread; every read and write is asked of the rule table again. */
  /* 2 OCT 2026: "SHOW US YOUR BUILDING" — the photo checklist and the recorded walkthrough call (src/web/evidence-pages.ts). */
  if (path === '/portal/building' || path.startsWith('/portal/building/')) {
    P.progress(db, actor, business_id); // the business is asked of the rule table, as every portal page does
    const r = await handlePortalEvidence({ app: d.app, store: d.store, newId, nav: nav(actor), form, readBody }, req, res, url, method, actor, business_id);
    if (r === 'handled') return 'handled';
  }
  /* 2 OCT 2026: THE CLIENT'S SURVEY REPORT — only the version a tax adviser's sign-off has released (src/web/report-pages.ts). */
  if ((path === '/portal/report' || path === '/portal/report.pdf') && method === 'GET') {
    P.progress(db, actor, business_id); // the business is asked of the rule table, as every portal page does
    return portalReport(d.app, actor, business_id, path, res, nav(actor));
  }
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
    letterHtml(res, 200, letterPage(actor, business, eng, undefined, undefined, d.letterPath));
    return 'handled';
  }

  /* PHASE 157c: the signed copy - the letter, the signature page and the certificate of completion - for the client. */
  if (path === '/portal/letter/signed.pdf' && method === 'GET') {
    const c = signedCopy(db, actor, business_id);
    if (c === null) { html(res, 404, simple('No signed copy', 'Your letter is not signed yet.')); return 'handled'; }
    res.writeHead(200, { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${c.filename}"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(Buffer.from(c.pdf));
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
        signature_strokes: f.get('signature_strokes') ?? '', typed_as_signature: f.get('typed_as_signature') === 'on',
      }, { ip: clientIp(req), session_id }, d.letterPath === undefined ? {} : { letterPath: d.letterPath });
    if (!r.ok) {
      letterHtml(res, 400, letterPage(actor, business, P.engagement(db, actor, business_id), r.why, typed, d.letterPath));
      return 'handled';
    }
    html(res, 200, page({ title: 'Letter signed', nav: nav(actor), body: h`<h1>Thank you — the letter is signed</h1>
      <p>We have recorded your signature. A copy of the signed letter, with a signature page and a certificate of completion, is saved to be emailed to you.</p>
      <p><a class="btn" href="/portal/letter/signed.pdf">Download your signed copy</a></p>
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
    // 30 Sep 2026: a video call's Zoom meeting follows the change (moved, or deleted when cancelled or given back).
    await reconcileVideoMeeting(d.app, bookingMatch[1] ?? '');
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

/**
 * PHASE 151e (line 6), 28 September 2026 — THE FUNNEL'S CLOSE NEEDS A WAY TO REACH THE PERSON, on the channel they chose:
 * an email address for email, a telephone number for a call or a text. Blank, or not one, is refused in words, and
 * nothing is saved. "We must get contact details, it is a non negotiable" (Lakhbir).
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
  // PHASE 151e (line 6): contact details are not optional (Lakhbir, 28 Sep 2026). No way to reach them, no client.
  const reach = contactValueProblem(channelId, (f.get('contact_value') ?? '').trim());
  if (reach !== undefined) return reach;
  if (f.get('contact_consent') !== 'on') {
    return 'We need your permission to contact you about this. It is not marketing consent.';
  }
  c.full_name = name;
  // 29 Sep 2026: the box is filled from the first screen; left empty, the first screen's name stands.
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
  /** 30 Sep 2026: false for the second and later businesses of one enquiry — the person, not a second call. */
  withBooking = true,
): { booked_at: string | null; booking_id: string | null } {
  const c = (draft.state as { contact: Record<string, unknown> }).contact;
  const at = d.app.now();
  const business_id = 'business_id' in holder ? holder.business_id : null;
  const lead_id = 'lead_id' in holder ? holder.lead_id : null;
  // PHASE 151e (line 6): the person's own contact holds the address they typed, at the funnel close too. It was
  // kept only on the organisation there, which left every website client with a contact nobody could reach.
  const typed = typeof c.contact_value === 'string' && c.contact_value.trim() !== '' ? c.contact_value.trim() : null;
  d.app.db.run(
    // PHASE 153f (migration 086): the funnel's optional "you may also message me on WhatsApp" box, kept on the contact.
    'INSERT INTO contacts (id, business_id, lead_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, whatsapp_optin, ' +
      'email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), business_id, lead_id, String(c.full_name ?? ''), c.job_role as string | null,
     c.job_role_other as string | null, c.contact_consent === true ? 1 : 0,
     c.marketing_optin === true ? 1 : 0, c.whatsapp_optin === true ? 1 : 0,
     c.channel === 'email' || c.channel === 'video' ? typed : null,
     c.channel === 'phone' || c.channel === 'sms_whatsapp' ? typed : null, at],
  );
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
  // 30 Sep 2026: a VIDEO call's invitation waits for its meeting, so it carries the link (sendVideoInvite, below).
  if (starts !== null && ends !== null && c.channel !== 'video') {
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
  return { booked_at: starts, booking_id };
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

/* ------------------------------------------------ 30 Sep 2026: the four-stage funnel's pages */

type F4Lookups = {
  readonly gate: ReturnType<typeof freeGate>; readonly company: boolean; readonly postcode: boolean;
  readonly companyConfig: typeof COMPANY_SEARCH; readonly postcodeConfig: typeof POSTCODE_CHECK;
  /** "Find my address" (Homedata since Phase 156f): its switch, its key and its outside-call row. */
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
 * PHASE 156f (B1): ONE SEARCH FOR THE ADDRESS BOX, for the button and the page's script alike. A postcode already searched
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

/** PHASE 156f: the funnel's pages, with the address box's one script on "Your details" while "Find my address" is on. */
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
  /** 30 Sep 2026: the four-stage funnel shows "up to" a figure, not a range, so the thank-you says what was shown. */
  upTo = false,
  /** 30 Sep 2026: a video call with a time: its join page when the meeting was made, else null (the link will follow). */
  video?: { join: string | null },
  /** 30 Sep 2026: whether emails are being sent, so the page does not say an invitation is unsent when it is going. */
  sending = false,
): string {
  return page({
    title: 'Thank you', nav: nav(actor),
    body: h`
      <h1>Thank you — that is with us.</h1>
      <p>We have your assessment, and our team can see it. Somebody will be in touch
      through the channel you chose.</p>
      ${upTo && out.high_pence !== null
        ? h`<p>The figure you were shown: <strong>up to ${formatPence(out.high_pence)}</strong>.</p>`
        : h`<p>The range you were shown: <strong>${formatShownRange(out)}</strong>.</p>`}
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
  if (!booksATime(b.channel)) return raw('');
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

/* PHASE 151j: the cookies of a sign-in - the part-way step's, and the session's. */
function stepCookie(token: string | null): string {
  return token === null ? `${SI.STEP_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
    : `${SI.STEP_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.floor(SI.STEP_TTL_MS / 1000)}`;
}
function sessionCookie(r: LoginResult): string {
  return `${r.cookie.name}=${r.cookie.value}; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=${new Date(r.cookie.expires).toUTCString()}`;
}
/*
 * WHERE A SIGN-IN LANDS IS NAVIGATION, NOT A CONTROL — and it is still asked of `can()` rather than of the role, so
 * there is one place that knows who the back office is for. Both destinations authorise themselves; a client sent to
 * /staff would be refused rather than shown a page, which is why getting this wrong would be untidy and not unsafe.
 */
function redirectHome(res: ServerResponse, r: LoginResult): void {
  redirect(res, mayEnterBackOffice(toActor(r.user)) ? '/staff' : '/portal');
}
function signedIn(res: ServerResponse, r: LoginResult): void {
  res.setHeader('set-cookie', sessionCookie(r));
  redirectHome(res, r);
}

const FORGOT_SENT = 'If that address has a Cap Rebate login, we have sent it a link to choose a new password. It works for 30 minutes.';

function forgotPage(sent: string | undefined, error?: string): string {
  return page({
    title: 'Forgotten password',
    body: h`
      <h1>Forgotten your password?</h1>
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      ${sent !== undefined ? h`<p class="ok">${sent}</p>` : raw('')}
      <p class="help">Type the email address you sign in with. We will email you a link to choose a new password.</p>
      <form method="post" action="/login/forgot">
        <label class="fl" for="forgot-email">Email</label><input class="fi" id="forgot-email" type="email" name="email" autocomplete="username" required>
        <button class="cta" type="submit">Email me a link</button>
      </form>
      <p class="help"><a href="/login">Back to sign in</a></p>`,
  });
}

function resetPage(tok: string, error: string | undefined): string {
  return page({
    title: 'Choose a new password',
    body: h`
      <h1>Choose a new password</h1>
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      <p class="help">Use at least ${SI.MIN_PASSWORD} characters. Your second step, if you have one, stays as it is.</p>
      <form method="post" action="/login/reset">
        <input type="hidden" name="token" value="${tok}">
        <label class="fl" for="reset-new">New password</label><input class="fi" id="reset-new" type="password" name="password" autocomplete="new-password" required>
        <label class="fl" for="reset-again">Type it again</label><input class="fi" id="reset-again" type="password" name="again" autocomplete="new-password" required>
        <button class="cta" type="submit">Save my new password</button>
      </form>`,
  });
}

function twoFactorPage(actor: Actor, home: string, method: SI.Method | null, done: string | null, error: string | undefined, recoveryLeft: number): string {
  const words = method === 'APP' ? 'an authenticator app' : method === 'EMAIL' ? 'a code sent to your email' : 'nothing yet';
  // PHASE 151m: the recovery codes - how many are left, a warning with two or fewer, and a button for new ones.
  const rc = SI.recoveryCodesWords(recoveryLeft);
  const recovery = method === null ? raw('') : h`
      <h2>Recovery codes</h2>
      <p class="${rc.low ? 'err' : 'help'}">${rc.text}</p>
      <p class="help">A recovery code lets you sign in if you lose your phone or cannot get your code. Each works once.
      Making new codes throws away every one you have not used.</p>
      <form method="post" action="${home}/recovery-codes"><button class="cta" type="submit">Make new recovery codes</button></form>`;
  return page({
    title: 'Your second step', nav: nav(actor),
    body: h`
      <h1>Your second step</h1>
      ${done === 'set' ? h`<p class="ok">Your second step is set up.</p>` : done === 'off' ? h`<p class="ok">Your second step is turned off.</p>` : raw('')}
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      <p>When you sign in, after your password you use: <strong>${words}</strong>.</p>
      <form method="post" action="${home}/change"><button class="cta" type="submit">${method === null ? 'Set it up' : 'Change it'}</button></form>
      ${actor.role === 'CLIENT' && method !== null ? h`<form method="post" action="${home}/off"><button class="linkish" type="submit">Turn it off</button></form>` : raw('')}
      ${actor.role === 'CLIENT' ? raw('') : h`<p class="help">Every staff login needs a second step, so it cannot be turned off.</p>`}
      ${recovery}`,
  });
}

/**
 * 29 SEPTEMBER 2026 — WHY A SIGN-IN STEP IS LOST, SAID WHERE IT HAPPENS. A step lives in the database (sign_in_steps).
 * On a database kept in memory, each copy of the website has its own, so a step begun on one copy is not there when the
 * next request reaches another, and it reads as "timed out" at once. Reproduced that day with two copies on memory.
 * The test website runs on memory whenever its lasting database is not in use (api/index.mjs, lastingDatabase).
 */
export const STEP_LOST_ON_MEMORY = 'This website keeps its records in memory. Each copy of it has its own. So a sign-in step can be lost when the next page reaches another copy. If this happens every time, the lasting database is not in use.';
export function stepGoneWhy(app: { db: { kind: string }; storageWhy?: string }): string | undefined {
  if (app.db.kind !== 'memory') return undefined;
  return app.storageWhy === undefined ? STEP_LOST_ON_MEMORY : `${STEP_LOST_ON_MEMORY} ${storageReason(app.storageWhy)}`;
}

function loginPage(error: string | undefined, note?: string, why?: string): string {
  return page({
    title: 'Sign in',
    body: h`
      <h1>Sign in</h1>
      ${error !== undefined ? h`<p class="err">${error}</p>` : raw('')}
      ${why !== undefined ? h`<p class="help" id="step-lost-why">${why}</p>` : raw('')}
      ${note !== undefined ? h`<p class="ok">${note}</p>` : raw('')}
      <form method="post" action="/login">
        <label class="fl" for="login-email">Email</label><input class="fi" id="login-email" type="email" name="email" autocomplete="username" required>
        <label class="fl" for="login-password">Password</label><input class="fi" id="login-password" type="password" name="password" autocomplete="current-password" required>
        <button class="cta" type="submit">Sign in</button>
      </form>
      <p><a href="/login/forgot">Forgotten your password?</a></p>
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
  'can move it down, not up. No property registers have been checked yet.';

function portalPage(
  actor: Actor, business: P.Business, progress: ReturnType<typeof P.progress>['progress'],
  eng: P.EngagementView | null, bks: P.BookingView[], tks: P.TaskView[], dcs: P.DocumentView[],
  reqs: readonly RequestView[], types: readonly { code: string; label: string }[],
  rng: P.ShownRangeView | null,
  slots: ReturnType<typeof publicSlots>, nowIso: string,
  dlv: readonly ClientDeliverable[] = [],
  share: readonly ClientShareChoice[] = [],
  extra: { readonly proposedSteps?: boolean; readonly welcome?: Safe; readonly claims?: readonly P.PortalClaim[]; readonly done?: readonly ClientStep[]; readonly sent?: boolean; readonly joins?: Readonly<Record<string, string>>; readonly dashboard?: Safe } = {},
): string {
  const open = tks.filter((t) => t.state === 'OPEN');
  const asked = reqs.filter((r) => r.state === 'REQUESTED');
  const versionable = [...new Map(dcs.filter((x) => x.logical_document_id !== null && x.type_label !== null)
    .map((x) => [x.logical_document_id ?? '', `${x.type_label ?? ''} ${x.seq ?? ''}`] as const)).entries()];
  const named = extra.proposedSteps === true;
  const cls = extra.claims ?? [];
  const answered = tks.filter((t) => t.state === 'ANSWERED');
  const received = reqs.filter((r) => r.state === 'RECEIVED');
  // UI TIDY PHASE 16: the page's parts open out under Your claims in the left-hand menu.
  setSubMenu({ items: [
    ...(extra.dashboard === undefined ? [] : [{ href: '#where-you-are', label: 'Where your claim is' }]),
    { href: '#waiting-on-you', label: 'What we need from you', ...(open.length + asked.length > 0 ? { note: String(open.length + asked.length) } : {}) },
    { href: '#done-so-far', label: 'What we have done' },
    { href: '#your-range', label: 'The figure you were shown' },
    { href: '#letter', label: 'Your engagement letter' },
    { href: '#appointment', label: 'Your appointment' },
    { href: '#documents', label: 'Documents' },
    { href: '#contact-us', label: 'How to contact us' },
  ] });
  return page({
    title: business.name, nav: nav(actor), wide: true,
    /* PHASE 133c (B9): THE PORTAL, IN THE ORDER A CLIENT NEEDS IT. At the top, how to reach us and book a call; then where
       the claim is; the range with its basis underneath; what we need from you; then everything else. The long step
       explanations sit behind "What happens at each step". Every section Phase 133a drew is still on the page.
       UI TIDY PHASE 16 (3 October 2026): the header also offers Send us a document; the questions and the documents asked
       for are drawn only when there is one (the "What we need from you" card already says when nothing is); How to
       contact us moves to the end, its words unchanged; the parts are listed under Your claims in the left-hand menu. */
    body: h`
      <header class="highlights"><p class="eyebrow">${cls.length === 1 ? 'Your claim' : 'Your claims'}</p><h1>${business.name}</h1>
        <p><a class="btn btn-primary" href="/portal/messages">Send us a message</a> <a class="btn" href="#appointment">Book a call</a> <a class="btn" href="#documents">Send us a document</a></p></header>
      ${extra.welcome ?? raw('')}
      ${extra.dashboard ?? raw('')}
      ${cls.length === 0 ? raw('') : card('Your claims', portalClaimTiles(cls, named, business.name), { count: cls.length, id: 'your-claims' })}
      ${clientStepsCard(extra.done ?? [], cls.map((c) => ({ id: c.id, name: propertyIn(business.name, c.property) ?? 'Your claim' })))}
      ${cls.length === 0 && progress.known ? clientStageBar(progress.steps.map((s) => ({ label: stepName(s.stage, named), state: s.state }))) : raw('')}

      <section class="card" id="your-range"><div class="card-h"><h2>The figure you were shown</h2></div>
      ${rng === null
        ? h`<p class="help">No assessment has been recorded for this business.</p>`
        /* PHASE 157c (the Friary House run, F13): the assessment shows a ceiling, "up to £X", and never a low end, so
           this says the same. It said "£127,500 to £255,000", a range the client was never shown. */
        : h`<p class="figbig">${formatShownRange({ low_pence: null, high_pence: rng.high_pence })}</p>
            <p class="help">${CLIENT_RANGE_BASIS}</p>`}
      </section>

      ${extra.dashboard !== undefined ? raw('') : h`<section class="card" id="waiting-on-you"><div class="card-h"><h2>What we need from you</h2><span class="count">${open.length + asked.length}</span></div>
        ${open.length + asked.length === 0 ? h`<p class="empty">Nothing at the moment. We are working on your claim, and we will tell you here if we need anything.</p>`
          : h`<ul class="plain">${open.map((t) => h`<li><a href="#question-${t.id}">${t.question}</a> <span class="help">— a question</span></li>`)}${
            asked.map((r) => h`<li><a href="#request-${r.id}">${r.type.label}</a> <span class="help">— a document, ${ukDatesIn(r.due.label)}</span></li>`)}</ul>`}
      </section>`}

      ${open.length + answered.length === 0 ? raw('') : h`<section class="card" id="questions"><div class="card-h"><h2>Questions we still need answered</h2></div>
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
      ${answered.map((t) => h`
        <p class="help">✓ ${t.question} — ${t.answer_state === 'DONT_KNOW' ? 'answered “I don’t know”' : t.answer}
        (${t.answered_by_role === 'CLIENT' ? 'you' : 'Cap Rebate'}, ${t.answered_at === null ? '' : localStamp(t.answered_at, nowIso)})</p>`)}
      </section>`}

      ${asked.length + received.length === 0 ? raw('') : h`<section class="card" id="asked-documents"><div class="card-h"><h2>Documents we have asked you for</h2></div>
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
      ${received.map((r) => h`
        <p class="help">✓ ${r.type.label} — received${r.received === null ? '' : `, version ${r.received.version_no ?? ''}, ${ukDatesIn(r.received.at)}`}</p>`)}
      </section>`}

      <section class="card"><div class="card-h"><h2>What happens at each step</h2></div>
      ${progress.known
        ? h`<details><summary>Show each step</summary><ul class="steps">${progress.steps.map((s) => h`
            <li class="${s.state}"><span class="lab">${stepName(s.stage, named)}</span><br>
            <span class="say">${s.stage.toTheClient}</span></li>`)}</ul></details>`
        : h`<div class="flag">We cannot show where this claim is right now, and we will not guess.
            Ask us and we will tell you. <span class="help">${P.stageInWords(business.stage)}</span></div>`}
      </section>

      <section class="card" id="issued"><div class="card-h"><h2>What we have issued to you</h2></div>
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

      <section class="card" id="letter"><div class="card-h"><h2>Your engagement letter</h2></div>
      ${eng === null
        ? h`<p class="help">No engagement letter has been prepared yet.</p>`
        : h`<p>Status: <strong>${eng.state.toLowerCase().replace('_', ' ')}</strong>${eng.signed_at !== null ? h`, ${localStamp(eng.signed_at, nowIso)}` : raw('')}.</p>
            <p><a class="cta" href="/portal/letter">${eng.state === 'SIGNED' ? 'Read the letter' : 'Read and sign the letter'}</a>${eng.state === 'SIGNED' ? h` <a class="btn" href="/portal/letter/signed.pdf">Download your signed copy</a>` : raw('')}</p>`}
      </section>

      <section class="card" id="appointment"><div class="card-h"><h2>Your appointment</h2></div>
      ${bks.length === 0
        ? h`<p class="help">Nothing is booked. Reply to any message from us and we will arrange a call.</p>`
        : h`<table><thead><tr><th>How</th><th>When</th><th>Booked from</th></tr></thead><tbody>
            ${bks.map((b) => h`<tr>
              <td>${b.channel === 'phone' ? 'Telephone' : b.channel === 'video' ? 'Video call' : b.channel === 'email' ? 'Email' : 'Text message / WhatsApp'}</td>
              <td>${b.starts_at === null
                ? 'No set time yet.'
                : clockOf(b.starts_at)}${extra.joins?.[b.id] === undefined ? '' : h` · <a href="${extra.joins[b.id]!}">Join the video call</a>`}</td>
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

      <section class="card" id="contact-us"><div class="card-h"><h2>How to contact us</h2></div>
        <p>Write to us under <a href="/portal/messages">Messages</a> — you can send a file there too — or ask for a call under
        <a href="#appointment">Your appointment</a>. If you are unhappy with anything we have done, our
        <a href="/notices/">public notices</a> say how to complain.</p>
      </section>

      <section class="card" id="account"><div class="card-h"><h2>Your account</h2></div>
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
  // PHASE 157c (F8): the town only where the property's words do not already carry it.
  const where = [property, c.town !== null && property !== null && property.toLowerCase().includes(c.town.trim().toLowerCase()) ? null : c.town].filter((x): x is string => x !== null && x.trim() !== '').join(', ');
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
export function clientIp(req: IncomingMessage): string {
  if (process.env.CAPREBATE_TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  /* STRESS TEST, 29 SEP 2026: every enquiry answered 500 on the test website, and nothing else there differs from a
     local run but the request. The address is now read so that a request with no socket cannot throw. */
  try { return req.socket?.remoteAddress ?? 'unknown'; } catch { return 'unknown'; }
}

/**
 * PHASE 157c: the letter page. While the letter can be signed (the signing form, and its pad, are on the page), every
 * page's policy plus OUR OWN script, the signing pad's. Otherwise exactly every page's policy, with no script at all.
 */
export const LETTER_PAGE_CSP = "default-src 'none'; style-src 'self'; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
function letterHtml(res: ServerResponse, status: number, body: string): void {
  if (!body.includes('data-sig-pad')) { res.writeHead(status, HTML_HEADERS); res.end(body); return; }
  res.writeHead(status, { ...HTML_HEADERS, 'content-security-policy': LETTER_PAGE_CSP });
  res.end(body.replace('</body>', '<script src="/assets/signature-pad.js" defer></script></body>'));
}

function letterPage(
  actor: Actor, business: P.Business, eng: P.EngagementView | null,
  problem?: string, typed?: { full_name: string; role: string }, letterPath?: string,
): string {
  // The record's number travels with its name. Absent is omitted, never passed as undefined; a blank is passed and
  // letter.ts treats it as absent — the specimen stays and is flagged, never read as the client's (N4).
  const shown = shownLetter(business, letterPath);
  const openTerms = loadLetter({
    ...(letterPath === undefined ? {} : { path: letterPath }),
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

      ${eng !== null && eng.state === 'SIGNED' ? h`<p><strong>You signed this letter${eng.signed_at === null ? '' : ` on ${localWhen(eng.signed_at)}`}.</strong> <a class="btn" href="/portal/letter/signed.pdf">Download your signed copy</a></p>` : canSign ? h`
      <form method="post" action="/portal/letter/sign" class="sign">
        <h2>Sign the letter</h2>
        <input type="hidden" name="letter_sha256" value="${shown.sha256}">
        <label>Your full name <input name="full_name" required maxlength="200" autocomplete="name" value="${typed?.full_name ?? ''}"></label>
        <label>Your role in the business <input name="signer_role" required maxlength="120" autocomplete="organization-title" value="${typed?.role ?? ''}"></label>
        <fieldset class="sig"><legend>Your signature</legend>
          ${missing.length > 0 ? raw('') /* PHASE 157c: the pad, and its one script, only while the letter can be signed */ : h`<div class="sig-pad" data-sig-pad hidden>
            <canvas class="sig-canvas" width="600" height="200" aria-label="Draw your signature here"></canvas>
            <p class="help" data-sig-note></p>
            <button type="button" class="btn-quiet" data-sig-clear>Clear and draw again</button>
          </div>`}
          <input type="hidden" name="signature_strokes" value="">
          <label class="ck"><input type="checkbox" name="typed_as_signature"> Use my typed name as my signature (if you cannot, or would rather not, draw it)</label>
        </fieldset>
        <label class="ck"><input type="checkbox" name="authorised" required> I confirm I may sign this letter for ${business.name}.</label>
        <button class="cta" type="submit">Sign</button>
      </form>
      ${missing.length === 0 ? raw('') : h`<div class="gate">Signing is not switched on yet.${why(h`${missing.join(' ')}`)}</div>`}` : raw('')}
      <div class="gate">When you sign, we keep a record of it.${why(h`We keep your name, your role, your signature and the time. We keep the internet address you signed from. We keep a fingerprint of this exact letter. You get a copy of the signed letter by email, and you can download it here. We never take a payment here.`)}</div>`,
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
