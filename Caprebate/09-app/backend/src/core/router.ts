/**
 * THE WEB HALF'S ROUTER SHELL. Block C of the Developer Build Order. It reads each
 * request once and answers the core's own addresses (sign-in, the back office's
 * door, the upload pieces, the timers, the webhooks and the core's own files). For
 * the rest it asks each module's routes file (src/modules/<module>/routes.ts) at
 * the point where that module's addresses have always been matched, so the order
 * in which addresses are tried never depends on where the code lives.
 *
 * ONE PROCESS, BOTH APPLICATIONS. This mounts alongside the JSON API in
 * src/core/server.ts; there is no second server, no second session store and no
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
import type { App } from './app.ts';
import { NotAuthorised, type Actor } from './authz.ts';
import { authenticate, logout, AuthError, SESSION_COOKIE_NAME, GENERIC_AUTH_FAILURE, TEMPORARY_PASSWORD_EXPIRED,
  requestPasswordReset, completePasswordReset, type LoginResult } from './auth.ts';
import * as SI from './sign-in.ts';
import { RECOVERY_CODES_LOW } from './recovery-codes.ts';
import { toActor } from './users.ts';
import { cookie, form, html, inContext, lendShellParts, nav, readBody, redirect, simple, clientIp, JSON_HEADERS, type WebDeps, type WebRequest, type WebResult } from './http.ts';
import { navContext } from './nav-context.ts';
import { SITE_CSS, CSS_HEADERS, PNG_HEADERS } from '../shared/index.ts';
import { LOGO_INK_PNG } from '../shared/index.ts';
import { h, page, raw } from '../shared/index.ts';
import { portalModule as P } from '../modules/portal/index.ts';
import { acceptClientBytes, finishUpload, issuedJob, readerFor } from '../modules/claims/index.ts';
import { singleFile } from './multipart.ts';
import { putPiece, startPieces, sweepPieces, PIECE_BYTES } from './upload-pieces.ts';
import { UPLOAD_PIECES_JS } from './upload-pieces-script.ts';
import { handleStaff, handlePortalSettings } from './staff.ts';
import { mayEnterBackOffice, NotFoundAsRefusal } from './backoffice.ts';
import { staffShell, portalShell } from './navigation.ts';
import { inboundEmailModule as IE } from '../modules/crm/index.ts';
import { PHOTO_UPLOAD_JS } from '../modules/survey/photo-upload-script.ts';
import { SIGNATURE_PAD_JS } from '../shared/index.ts';
import { sweepUploads } from '../modules/survey/photo-upload.ts';
import { runTimerJob, timerJobOf, timerWordRefusal, TIMER_PATH_PREFIX } from './timers.ts';
import { sweepVideos } from '../modules/survey/survey-video.ts';
import { receiveWhatsApp } from '../modules/crm/index.ts';
import { webhookChallenge } from '../integrations/index.ts';
import { ga4MeasurementId } from '../integrations/index.ts';
import { localDate, ukDate } from '../shared/index.ts';
import { SITE_JS_HEADERS } from '../modules/public-site/index.ts';
import { offerSignup, requestSignup, verifyOpen, confirmSignup, MIN_PASSWORD } from './signup.ts';
import { IDENTITY_HOOK_MAX_BYTES, IDENTITY_HOOK_PATH, IDENTITY_SIGNATURE_HEADERS, receiveIdentityResult, storageReason } from '../modules/compliance/identity-checks.ts';
import { CONSENT_COOKIE, consentChoice, cookieBanner, wantsBanner } from '../modules/public-site/index.ts';
import { agreementPage, agreementTick, approvalsPage, currentApprovals, currentTermsVersions, hasAgreedCurrent, keepAgreement, recordApproval } from '../modules/compliance/legal-approvals.ts';
import { nav as staffNav } from './staff.ts';
// Each module's addresses, asked below at the point where they have always been matched.
import { publicSiteEnquiry, publicSiteRoutes } from '../modules/public-site/index.ts';
import { assessmentAssets, assessmentRoutes } from '../modules/assessment/index.ts';
import { portalConfirmLink, portalEntry, portalSignLink } from '../modules/portal/index.ts';
import { crmAssets, crmCallPage, crmReferralForm } from '../modules/crm/index.ts';
import { claimsAssets, claimsSignoffLink } from '../modules/claims/index.ts';

/* What the route files cannot reach through the core's front door, because each part reads business modules itself. */
lendShellParts({
  signedInHeader: (actor) => mayEnterBackOffice(actor) ? staffShell(actor) : portalShell(actor),
  offerSignup, requestSignup, verifyOpen, confirmSignup, MIN_PASSWORD, handlePortalSettings, NotFoundAsRefusal,
  currentApprovals, currentTermsVersions, agreementTick, agreementPage, hasAgreedCurrent, keepAgreement,
});


/* ------------------------------------------------------------------ *
 * plumbing
 * ------------------------------------------------------------------ */

/** STRESS TEST: the addresses where a HEAD is answered as a GET, because their GET changes nothing. */
function HEAD_AS_GET(path: string): boolean {
  return path === '/' || path.startsWith('/assets/') || path === '/login' || path === '/favicon.svg' || path === '/favicon.ico'
    || path === '/privacy/' || path === '/privacy' || path === '/notices/' || path === '/notices'
    || path.startsWith('/capital-allowances');
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

function piecesJson(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

/**
 * A GET OF THE BACK OFFICE, DRAWN INTO A STRING, for `problem()` to redraw the page a refused form was on.
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

/**
 * THE REFUSAL, AS A PAGE. Which addresses answer a refusal with a page: the two applications' screens, and
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

export async function handleWeb(d: WebDeps, req: IncomingMessage, res: ServerResponse): Promise<WebResult> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  /* STRESS TEST: A HEAD asks for a GET's headers without its body (Node drops the body itself). Link
     checkers, uptime monitors and link previews send it, and got a 401. Answered as a GET only where a GET changes
     nothing: the home page, the files, sign-in, the notices. Anywhere else a HEAD meets the page for unknown addresses. */
  const method = req.method === 'HEAD' && HEAD_AS_GET(path) ? 'GET' : req.method ?? 'GET';
  const newId = d.newId ?? randomUUID;
  const now = d.app.now;
  /* The legal pages are served on the test website (`notices`) or wherever the `legal` setting is on. */
  const legalServed = d.notices === true || d.legal === true;

  /* A FORM SENT FROM ANOTHER WEBSITE IS REFUSED. The session cookie is SameSite=Lax, which
     stops a browser sending it with another site's form; this is the second lock. Browsers mark every request with
     where it came from (Sec-Fetch-Site), and no page of ours posts from elsewhere. The Origin header cannot be used
     for this here: under our no-referrer policy a browser sends "Origin: null" even on our own forms. A service calling
     us (a webhook) sends no Sec-Fetch-Site, so it is not affected. */
  if (method !== 'GET' && method !== 'HEAD' && req.headers['sec-fetch-site'] === 'cross-site') {
    html(res, 403, simple('Not sent', 'That form came from another website, so nothing was done. Open Cap Rebate and try again.'));
    return 'handled';
  }

  const session = authenticate(d.app.deps, cookie(req, SESSION_COOKIE_NAME));
  const actor: Actor | undefined = session ? toActor(session.user) : undefined;
  const w: WebRequest = { d, req, res, url, path, method, actor, session, newId, now, legalServed };
  let mine: WebResult | undefined; // a module's answer, once one takes the request

  /* THE COOKIE BANNER (src/modules/public-site/legal-pages.ts), on the test website with the notices. A
     visitor who is not signed in and has not answered gets it at the foot of any page of ours: two buttons of the same
     size, no script. It is added as the page leaves, so every page writer (page, the home page, the notices page)
     carries it without knowing about it. */
  if (legalServed && method === 'GET' && wantsBanner(path, actor !== undefined, consentChoice(cookie(req, CONSENT_COOKIE)))) {
    const analyticsOn = ga4MeasurementId(d.app.secrets) !== null;
    const back = `${path}${url.search}`;
    const end = res.end.bind(res) as (...a: unknown[]) => ServerResponse;
    res.end = ((...args: unknown[]) => {
      const body = args[0];
      if (typeof body === 'string' && res.statusCode === 200 && /^<!doctype html/i.test(body) && body.includes('</body>')) {
        args[0] = body.replace(/<\/body>(?![\s\S]*<\/body>)/, `${cookieBanner(back, analyticsOn)}</body>`);
      }
      return end(...args);
    }) as typeof res.end;
  }

  /* ---------------------------------------------------------- assets */
  if (path === '/assets/site.css' && method === 'GET') {
    res.writeHead(200, CSS_HEADERS); res.end(SITE_CSS); return 'handled';
  }
  if ((mine = await crmAssets(w)) !== undefined) return mine;
  if ((mine = await claimsAssets(w)) !== undefined) return mine;
  if ((mine = await assessmentAssets(w)) !== undefined) return mine;
  // The engagement letter's signing pad (src/shared/signature-pad-script.ts).
  if (path === '/assets/signature-pad.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(SIGNATURE_PAD_JS); return 'handled';
  }
  // The photo page's one script (src/modules/survey/photo-upload-script.ts).
  if (path === '/assets/photo-upload.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(PHOTO_UPLOAD_JS); return 'handled';
  }
  // The upload forms' one script (src/core/upload-pieces-script.ts), which sends a big file in pieces.
  if (path === '/assets/upload-pieces.js' && method === 'GET') {
    res.writeHead(200, SITE_JS_HEADERS); res.end(UPLOAD_PIECES_JS); return 'handled';
  }
  /* A FILE SENT IN PIECES (src/core/upload-pieces.ts) - Vercel takes at most 4.5 MB a request. JSON for the
     page's script only; any signed-in person, for their own send only. The form that sends the file takes it. */
  if (path === '/upload/pieces/start' && method === 'POST') {
    if (actor === undefined) { piecesJson(res, 401, { ok: false, why: 'You need to be signed in.' }); return 'handled'; }
    await sweepPieces(d.app, d.store);
    const r = startPieces({ db: d.app.db, now: d.app.now, newId }, actor, (await form(req)).get('size') ?? '');
    piecesJson(res, r.ok ? 200 : 400, r); return 'handled';
  }
  const piecePut = /^\/upload\/pieces\/([A-Za-z0-9-]{8,64})\/(\d{1,3})$/.exec(path);
  if (piecePut !== null && method === 'PUT') {
    if (actor === undefined) { piecesJson(res, 401, { ok: false, why: 'You need to be signed in.' }); return 'handled'; }
    let bytes: Buffer;
    try { bytes = await readBody(req, PIECE_BYTES); } catch { piecesJson(res, 413, { ok: false, why: 'That piece is too big.' }); return 'handled'; }
    const r = await putPiece({ db: d.app.db, now: d.app.now, newId }, d.store, actor, piecePut[1] ?? '', piecePut[2] ?? '', new Uint8Array(bytes));
    piecesJson(res, r.ok ? 200 : 400, r); return 'handled';
  }
  if ((mine = await portalSignLink(w)) !== undefined) return mine;

  if ((mine = await crmCallPage(w)) !== undefined) return mine;
  // The supplied logo, from memory, like the stylesheet — never from a path on disk.
  if (path === '/assets/cap-rebate-logo.png' && method === 'GET') {
    res.writeHead(200, PNG_HEADERS); res.end(LOGO_INK_PNG); return 'handled';
  }
  // STRESS TEST: the house mark as the browser tab's icon. A browser asked for /favicon.ico on every page
  // and met a 401, which it logged as an error; pages now name /favicon.svg, and /favicon.ico answers "nothing here".
  if (path === '/favicon.svg' && method === 'GET') { res.writeHead(200, FAVICON_HEADERS); res.end(FAVICON_SVG); return 'handled'; }
  if (path === '/favicon.ico' && method === 'GET') { res.writeHead(204, { 'cache-control': 'public, max-age=86400' }); res.end(); return 'handled'; }
  if ((mine = await publicSiteRoutes(w)) !== undefined) return mine;
  if ((mine = await claimsSignoffLink(w)) !== undefined) return mine;
  if ((mine = await portalConfirmLink(w)) !== undefined) return mine;
  /* WHATSAPP — THE ADDRESS META CALLS (src/modules/crm/whatsapp.ts). No login: Meta has none. GET is Meta checking
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
  /* THE LIVE WEBSITE'S OWN TIMERS (src/core/timers.ts). No login: Vercel Cron calls them, with the
     project's word (CRON_SECRET) in the Authorization header. Refused without it, and answered with counts only. */
  if (path.startsWith(TIMER_PATH_PREFIX) && method === 'GET') {
    const job = timerJobOf(path);
    const auth = req.headers['authorization'];
    const why = job === null ? 'there is no such timer' : timerWordRefusal(d.app.secrets, typeof auth === 'string' ? auth : undefined);
    if (why !== null || job === null) {
      console.log(`timer ${job ?? 'unknown'}: refused, ${why ?? 'there is no such timer'}`);
      res.writeHead(job === null ? 404 : 401, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`refused: ${why ?? 'there is no such timer'}`);
      return 'handled';
    }
    const r = await runTimerJob({ app: d.app, store: d.store }, job);
    console.log(r.line);
    res.writeHead(r.ok ? 200 : 500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(r.line);
    return 'handled';
  }
  /* THE REPLY TIMER (src/modules/crm/inbound-email.ts, timerMayRead). No login: an outside timer calls it, with its
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
    // The same wake clears photo uploads never finished within a day (src/modules/survey/photo-upload.ts).
    await sweepUploads({ db: d.app.db, now: d.app.now }, d.store);
    await sweepVideos({ db: d.app.db, now: d.app.now }, d.store);
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(r === null ? (IE.lastReadWords(d.app)?.ok === false ? 'could not read the inbox' : 'read in the last two minutes')
      : r.state === 'OFF' ? 'reading replies is off' : `read ${String(r.read)}, filed ${String(r.filed)}, to sort ${String(r.queued)}`);
    return 'handled';
  }
  /* THE IDENTITY CHECK'S SIGNED RESULT. The service has no login, so this sits outside it — and believes
     nothing it is sent unless the signature holds (src/modules/compliance/identity-checks.ts). A bad signature is refused and audited.
     The answer is a status and nothing else: the service reads no page, and a refusal says nothing about why. */
  if (path === IDENTITY_HOOK_PATH && method === 'POST') {
    const raw0 = (await readBody(req, IDENTITY_HOOK_MAX_BYTES)).toString('utf8');
    // Didit signs with two headers and dates the result; any may be missing, and then nothing is believed.
    const one = (name: string): string | null => { const v = req.headers[name]; return typeof v === 'string' ? v : null; };
    const r = receiveIdentityResult(d.app, newId, raw0, {
      v2: one(IDENTITY_SIGNATURE_HEADERS.v2), raw: one(IDENTITY_SIGNATURE_HEADERS.raw), timestamp: one(IDENTITY_SIGNATURE_HEADERS.timestamp),
    });
    res.writeHead(r.status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end(r.status === 200 ? 'ok' : r.note === undefined ? 'refused' : `refused. ${r.note}`);
    return 'handled';
  }
  if ((mine = await publicSiteEnquiry(w)) !== undefined) return mine;

  if ((mine = await assessmentRoutes(w)) !== undefined) return mine;

  if ((mine = await crmReferralForm(w)) !== undefined) return mine;

  /* ------------------------------------------------------------ login */
  if (path === '/login' && method === 'GET') {
    // The website's "Log in" button, pressed by somebody already signed in, goes straight to their home.
    if (actor !== undefined) { redirect(res, mayEnterBackOffice(actor) ? '/staff' : '/portal'); return 'handled'; }
    html(res, 200, loginPage(undefined)); return 'handled';
  }
  if (path === '/login' && method === 'POST') {
    const f = await form(req);
    try {
      // The password first, then the steps it still needs - a session only when none is left.
      const r = await SI.beginSignIn(d.app, f.get('email') ?? '', f.get('password') ?? '', clientIp(req));
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

  /* THE STEPS BETWEEN A RIGHT PASSWORD AND A SESSION (src/core/sign-in.ts). */
  if (path === '/login/step' && method === 'GET') {
    // ?use=recovery draws the VERIFY step as the recovery-code form.
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
      // A second step just set up shows its recovery codes, once, here - they are kept nowhere as text, so
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

  /* A FORGOTTEN PASSWORD: an emailed link, single-use, 30 minutes (src/core/auth.ts). The page says the same
     thing whether or not the address has an account, so it cannot be used to find out who has one. */
  if (path === '/login/forgot' && method === 'GET') { html(res, 200, forgotPage(undefined)); return 'handled'; }
  if (path === '/login/forgot' && method === 'POST') {
    const email = ((await form(req)).get('email') ?? '').trim();
    const r = requestPasswordReset(d.app.deps, email, clientIp(req));
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

  /* A PERSON'S OWN SECOND STEP: set it up, change it, or (a client only) turn it off. A client's page is
     under /portal and a member of staff's under /staff, so each header links only inside its own application. */
  const own = /^\/(staff|portal)\/two-factor(\/change|\/off|\/recovery-codes)?$/.exec(path);
  if (own) {
    if (actor === undefined) { redirect(res, '/login'); return 'handled'; }
    const home = actor.role === 'CLIENT' ? '/portal/two-factor' : '/staff/two-factor';
    if (`/${own[1]}/two-factor` !== home) { redirect(res, home); return 'handled'; }
    if (own[2] === undefined && method === 'GET') {
      html(res, 200, twoFactorPage(actor, home, SI.ownTwoFactor(d.app, actor), url.searchParams.get('done'), undefined, SI.ownRecoveryCodesLeft(d.app, actor))); return 'handled';
    }
    /* "Make new recovery codes" - ten new ones, shown once on this answer, and every unused old one gone. */
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
    /* The legal pages' approvals (src/modules/compliance/legal-approvals.ts). Admins only; recorded once, never changed. */
    if ((path === '/staff/legal' && method === 'GET') || (path === '/staff/legal/approve' && method === 'POST')) {
      if (actor.role !== 'ADMIN') { html(res, 403, simple('Not allowed', 'Only an admin can see or record the legal pages’ approvals.')); return 'handled'; }
      return inContext(d, path, async () => {
        if (method === 'GET') { html(res, 200, approvalsPage(staffNav(actor), currentApprovals(d.app.db))); return 'handled'; }
        const r = recordApproval(d.app, actor, await form(req), newId);
        html(res, r.ok ? 200 : 400, approvalsPage(staffNav(actor), currentApprovals(d.app.db), r.ok ? { ok: true, text: 'The approval is recorded.' } : { ok: false, text: r.why }));
        return 'handled';
      });
    }
    // The header reads the database, the clock and the address from this context — see src/core/navigation.ts.
    const rerender = async (href: string): Promise<{ status: number; body: string }> => {
      const u = new URL(href, 'http://localhost');
      const cap = captureResponse();
      await inContext(d, u.pathname, () => handleStaff({ app: d.app, store: d.store, newId, ...(d.publicOrigin === undefined ? {} : { publicOrigin: d.publicOrigin }), ...(d.signing === undefined ? {} : { signing: d.signing }) }, req, cap.res, u, 'GET', actor, form, readBody));
      return cap.done;
    };
    return inContext(d, path, () => handleStaff(
      { app: d.app, store: d.store, newId, ...(d.publicOrigin === undefined ? {} : { publicOrigin: d.publicOrigin }), ...(d.signing === undefined ? {} : { signing: d.signing }) }, req, res, url, method, actor, form, readBody,
    ), rerender);
  }

  if ((mine = await portalEntry(w)) !== undefined) return mine;

  /* ------------------------------------------- the upload write itself */
  /* A PUT, OR A BROWSER'S FORM — the CRM follow-on. The portal's page asked for an HTTP PUT, which no browser form can make
     and the content security policy allows no script to make, so a client could not finish an upload from a browser. A
     multipart POST is read by src/core/multipart.ts and then takes EXACTLY the PUT's path: the same document authorised,
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
    /* `reading` carries the process's key store and transport to steps 9 and 10 of the receipt contract,
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
    const again = r.sent_before === null ? '' : ` You sent us this same file on ${ukDate(localDate(r.sent_before))}; we have kept both.`;
    html(res, 200, simple('Received', (done.received_request === null || done.received_request === undefined
      ? 'We read it, then deleted the file.'
      : 'We read it, then deleted the file. What we asked you for is now marked received.') + again));
    return 'handled';
  }

  /* STRESS TEST: AN ADDRESS NOBODY OWNS. It fell through to the JSON API, which asked for a login and
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
 * pages
 * ------------------------------------------------------------------ */

/* The cookies of a sign-in - the part-way step's, and the session's. */
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
  // The recovery codes - how many are left, a warning with two or fewer, and a button for new ones.
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
 * WHY A SIGN-IN STEP IS LOST, SAID WHERE IT HAPPENS. A step lives in the database (sign_in_steps).
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

export { NotAuthorised };
