/**
 * THE ROUTE FILES' PLUMBING: reading a request (its cookies, its body, its form) and writing the answer (a page, a
 * redirect), for the router shell (src/app/router.ts) and every module's routes file alike. It loads no business
 * module, so the core's front door can offer it.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from './app.ts';
import type { Actor } from './authz.ts';
import type { authenticate } from './auth.ts';
import type { NotFoundAsRefusal } from './backoffice.ts';
import type { confirmSignup, offerSignup, requestSignup, verifyOpen } from '../modules/portal/signup.ts';
import type { handlePortalSettings } from '../app/staff.ts';
import type { agreementPage, agreementTick, currentApprovals, currentTermsVersions, hasAgreedCurrent, keepAgreement } from '../modules/compliance/index.ts';
import { cleanForm } from './typed.ts';
import { navContext, type NavContext, type NameSwitches } from './nav-context.ts';
import { piecesPage } from './upload-pieces.ts';
import { h, page, localWhen, HTML_HEADERS, type FsObjectStore, type Safe } from '../shared/index.ts';
import type { EngagementSigning } from '../modules/claims/index.ts';

export type WebDeps = {
  app: App;
  store: FsObjectStore;
  newId?: () => string;
  /** CRM 5 of 10: the public referral form's gate. Absent is `REFERRAL_FORM`, shipped off. */
  referralForm?: { readonly enabled: boolean; readonly requires: string };
  /** The portal name switch. Absent is `NAME_SWITCHES` in src/core/navigation.ts, off. */
  names?: NameSwitches;
  /**
   * The site's own address, for a link sent by email (a client's sign-up). CONFIGURED, NEVER TAKEN FROM THE
   * REQUEST'S Host header, which is whatever the sender typed. Absent is http://localhost:8103.
   */
  publicOrigin?: string;
  /** The test-only letter (src/modules/claims/letter.ts, TEST_LETTER_PATH). Absent is the real letter. Only the test website passes it. */
  letterPath?: string;
  /** Signing on for testing (ENGAGEMENT_SIGNING_TEST, the test copy only). Absent is ENGAGEMENT_SIGNING, off. */
  signing?: EngagementSigning;
  /** The public notices page and its complaint form (src/modules/public-site/notices-site.ts). Only the test website passes it. */
  notices?: boolean;
  /**
   * THE LEGAL SETTING, for the live website. The legal pages, the notices page, the cookie
   * banner and the client's tick are served wherever it is on, as on the test website, but each page carries its Draft
   * line until our solicitor and our data protection officer have both approved its version (src/modules/compliance/legal-approvals.ts).
   * Off unless CAPREBATE_LEGAL_PAGES=on (src/app/server.ts). With it and `notices` both off, nothing changes.
   */
  legal?: boolean;
};

export function cookie(req: IncomingMessage, name: string): string | undefined {
  const raw0 = req.headers.cookie;
  if (raw0 === undefined) return undefined;
  for (const part of raw0.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function setCookie(res: ServerResponse, name: string, value: string, maxAge: number): void {
  const prior = res.getHeader('set-cookie');
  const line = `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  res.setHeader('set-cookie', Array.isArray(prior) ? [...prior, line] : prior ? [String(prior), line] : [line]);
}

export const JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
});

export function html(res: ServerResponse, status: number, body: string): void {
  // A page with an upload form gets the script that sends a big file in pieces (src/core/upload-pieces.ts).
  const p = piecesPage(HTML_HEADERS, body);
  res.writeHead(status, p.headers);
  res.end(p.body);
}

export function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to, 'content-type': 'text/plain; charset=utf-8' });
  res.end('');
}

/**
 * — A REFUSED BODY CLOSES ITS CONNECTION, CLEANLY. The 3 October sweep found that
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

/**
 * 4 November 2026: A BODY IS READ ONCE AND KEPT FOR ITS REQUEST. The form-token check (src/app/server.ts,
 * src/core/form-token.ts) reads a form before any route does; the route then reads the same bytes from here, with the
 * token's fields taken out (`keepBody`). A kept body still meets the route's own cap.
 */
const KEPT_BODIES = new WeakMap<IncomingMessage, Buffer>();
export function keepBody(req: IncomingMessage, body: Buffer): void { KEPT_BODIES.set(req, body); }

/** Bodies are capped. A cap is a control, not a nicety. */
export function readBody(req: IncomingMessage, max = 2 * 1024 * 1024): Promise<Buffer> {
  const kept = KEPT_BODIES.get(req);
  if (kept !== undefined) {
    if (kept.length > max) { closeAfterAnswer(req); return Promise.reject(new PayloadTooLarge()); }
    return Promise.resolve(kept);
  }
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
      if (!settled) { settled = true; const all = Buffer.concat(chunks); KEPT_BODIES.set(req, all); resolve(all); }
    });
    req.once('error', (e) => { if (!settled) { settled = true; reject(e); } });
  });
}

export class PayloadTooLarge extends Error {
  constructor() { super('body too large'); this.name = 'PayloadTooLarge'; }
}

export async function form(req: IncomingMessage): Promise<URLSearchParams> {
  // Invisible characters out on the way in (src/core/typed.ts).
  const typed = cleanForm(new URLSearchParams((await readBody(req)).toString('utf8')));
  // What the form carried is kept for this request, so a refusal can put it back where it was typed (B6).
  const scratch = navContext.getStore()?.form;
  if (scratch !== undefined) { scratch.typed = typed; scratch.action = new URL(req.url ?? '/', 'http://localhost').pathname; }
  return typed;
}

/** Run a back-office or portal request inside its context, and wait for a refusal's redraw before the request ends. */
export async function inContext(d: WebDeps, path: string, work: () => Promise<WebResult>, rerender?: NonNullable<NavContext['form']>['rerender']): Promise<WebResult> {
  const scratch: NonNullable<NavContext['form']> = rerender === undefined ? {} : { rerender };
  const ctx: NavContext = { db: d.app.db, now: d.app.now, path, form: scratch, ...(d.names === undefined ? {} : { names: d.names }) };
  return navContext.run(ctx, async () => {
    const r = await work();
    if (scratch.pending !== undefined) await scratch.pending;
    return r;
  });
}

export function nav(actor: Actor | undefined): Safe {
  return actor === undefined
    // The public header says what the home page's button says.
    ? h`<nav><a class="navcta" href="/assessment">Am I eligible?</a><a href="/login">Log in</a></nav>`
    // A signed-in person gets their application's header — the back office's for staff, the portal's for a client.
    : shellParts().signedInHeader(actor);
}

export type WebResult = 'handled' | 'not-mine';

/**
 * A moment, spelled out, IN UK TIME — "Wednesday 2026-06-10 at 10:00 BST".
 *
 * ONE OF THE FOUR DISPLAY EDGES. It used to print UTC and the
 * callers appended the word, which was honest and an hour wrong for eight
 * months of the year: a client offered "Wednesday at 09:00" in June would have
 * turned up at ten. The stored value is untouched; localtime.ts converts, and
 * the abbreviation comes from Intl rather than from an `if`.
 *
 * THE ZONE IS PART OF THE STRING because everything this renders is a moment a
 * CLIENT is going to keep. A terse cell in a staff table uses `stamp` instead.
 */
export function clockOf(iso: string): string {
  return localWhen(iso);
}

export function simple(title: string, body: string): string {
  return page({ title, body: h`<h1>${title}</h1><p>${body}</p>` });
}

/**
 * THE ADDRESS A SIGNATURE CAME FROM. The socket's own address; behind a host's proxy, the first address in
 * X-Forwarded-For, but only when CAPREBATE_TRUST_PROXY=1 says a proxy we trust set it — otherwise anyone could type one.
 */
export function clientIp(req: IncomingMessage): string {
  if (process.env.CAPREBATE_TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  /* STRESS TEST: every enquiry answered 500 on the test website, and nothing else there differs from a
     local run but the request. The address is now read so that a request with no socket cannot throw. */
  try { return req.socket?.remoteAddress ?? 'unknown'; } catch { return 'unknown'; }
}

/** One request, as the router shell has read it, for a module's routes to answer. */
export type WebRequest = {
  readonly d: WebDeps; readonly req: IncomingMessage; readonly res: ServerResponse; readonly url: URL;
  readonly path: string; readonly method: string; readonly actor: Actor | undefined;
  readonly session: ReturnType<typeof authenticate>; readonly newId: () => string; readonly now: () => string;
  /** The legal pages are served on the test website (`notices`) or wherever the `legal` setting is on. */
  readonly legalServed: boolean;
};

/**
 * WHAT THE SHELL LENDS THE ROUTE FILES. A few parts read business modules themselves (the signed-in header, the
 * sign-up, a client's own settings), so the core's front door cannot offer them. The legal pages' approvals and
 * agreements are lent too: their file reads the public site's door as it loads, so a route file that imported it would
 * stop the public site loading when the public site is the first thing loaded. The router shell hands them over when it
 * loads, which is before any request reaches a module.
 */
export type ShellParts = {
  /** A signed-in person's header: the back office's for staff, the portal's for a client. */
  readonly signedInHeader: (actor: Actor) => Safe;
  readonly offerSignup: typeof offerSignup;
  readonly requestSignup: typeof requestSignup;
  readonly verifyOpen: typeof verifyOpen;
  readonly confirmSignup: typeof confirmSignup;
  readonly MIN_PASSWORD: number;
  readonly handlePortalSettings: typeof handlePortalSettings;
  readonly NotFoundAsRefusal: typeof NotFoundAsRefusal;
  readonly currentApprovals: typeof currentApprovals;
  readonly currentTermsVersions: typeof currentTermsVersions;
  readonly agreementTick: typeof agreementTick;
  readonly agreementPage: typeof agreementPage;
  readonly hasAgreedCurrent: typeof hasAgreedCurrent;
  readonly keepAgreement: typeof keepAgreement;
};

let lent: ShellParts | undefined;
export function lendShellParts(parts: ShellParts): void { lent = parts; }
export function shellParts(): ShellParts {
  if (lent === undefined) throw new Error('The router shell (src/app/router.ts) has not lent its parts: it has not loaded.');
  return lent;
}
