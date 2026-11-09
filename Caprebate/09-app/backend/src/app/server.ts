/**
 * The HTTP surface. ONE PROCESS SERVING BOTH APPLICATIONS.
 *
 * Node's own http server, no framework — the routing table is small enough to
 * read in one screen, and a reviewer can see that every route that touches an
 * object goes through `authorise` before it touches it.
 *
 * THE SHAPE THAT MATTERS: a handler receives the ACTOR and the OBJECT, and
 * calls authorise(actor, action, object). It never asks "what is this user's
 * role" and branches. A role check at the top of a handler is how the fourth
 * one gets forgotten.
 *
 * WHAT WAS NOT HERE, AND NOW IS. The enforcement was built first, saying
 * "Phases 104 to 107 build what sits on it". The first of
 * them — the public site, the assessment, the login and the client portal —
 * and it is mounted BEFORE the JSON API below, in src/app/router.ts.
 *
 * ONE PROCESS, ONE SESSION STORE, ONE `can()`. The web half does not get its
 * own authentication, its own authorisation or its own database handle; it is
 * handed this application. That is the whole reason it is mounted here rather
 * than run as a second server.
 */

import { TEST_LETTER_PATH } from '../modules/claims/index.ts';
import { ENGAGEMENT_SIGNING_TEST } from '../modules/claims/index.ts';
import { turnstileWhy } from '../integrations/index.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { buildApp } from './build-app.ts';
import { AuthError, GENERIC_AUTH_FAILURE, NotAuthorised, PayloadTooLarge, REGISTERED_ACTIONS, SESSION_COOKIE_NAME, addTokensToPages, authenticate, authorise, bindResponse, can, clientIp, formToken, formTokenRefusal, formTokensMode, keyFileStartCheck, logout, onceToken, readBody, refuseForm, toActor, withReadMemo } from '../core/index.ts';
import type { Actor, FormTokens, LoginResult, Obj } from '../core/index.ts';
import * as SI from '../core/index.ts'; // the sign-in steps (src/core/sign-in.ts), through the core's door
import { payloadFor, assertSurveySection } from '../modules/survey/index.ts';
import { handleWeb, refusalAsPage, sendRefusalPage } from './router.ts';
import { FsObjectStore, sealKeyFromEnv, type KeepOriginals } from '../shared/index.ts';
import { SharedObjectStore, type BlobClient } from '../shared/shared-objectstore.ts';
import { EMAIL_SENDING, auditMailConnections, dispatchOutbox, mailWhere, sendingOn, smtpLoginFromKeyFile, smtpProvider } from '../integrations/index.ts';
import { isInventedAddress } from '../integrations/index.ts';
// Straight from the file, not the core's door: the saved keys read business modules as they load (Phase 161l).
import { refreshSavedKeys } from '../core/saved-keys.ts';
import { openKeptOriginal } from '../modules/claims/index.ts';
import { listOutboxIdToEmailBySendRequestedSentAt2, updateOutboxLastErrorByIdLastError2, updateOutboxLastErrorByIdLastError3, updateOutboxLastErrorByIdLastError4 } from '../integrations/index.ts';
import { getSurveyorJobsIdBusinessIdById4 } from '../modules/survey/index.ts';
import { getInvoicesIdBusinessIdById2, getInvoicesIdBusinessIdById4 } from '../modules/finance/index.ts';

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (raw === undefined) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  // a cap is a control. The web half's reader, so a body over it is a 413 that closes its
  // connection - it was a plain Error, answered 500, with the rest of the body left in a kept-alive connection.
  const body = await readBody(req, 1_000_000);
  if (body.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Escape on output. Nothing here builds HTML by concatenation from user input. */
function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(json);
}

export type ServerOptions = {
  /** The token of a remote database named by `location` (src/core/db.ts). Absent for memory and file. */
  dbAuthToken?: string;
  /** Tests only: see BuildOptions.dbEngine. */
  dbEngine?: 'node:sqlite' | 'libsql';
  /** Faster clicks, part 2: see BuildOptions.dbLocalCopy. */
  dbLocalCopy?: string;
  /** See BuildOptions.twoFactor. Absent is 'staff'. */
  twoFactor?: 'staff' | 'off' | 'staff-except-invented';
  /** See BuildOptions.schema. Absent builds the tables, as always. */
  schema?: 'apply' | 'require-built';
  /**
   * Where client documents live. OUTSIDE THE WEB ROOT — which is trivially
   * true here because this application has no static file route at all, and
   * `assertNoStaticFileRoute` proves it from the router's own source.
   */
  documentRoot?: string;
  /**
   * ONE PRIVATE STORE FOR EVERY COPY, instead of `documentRoot`. Absent is the folder, as before. Only
   * api/index.mjs passes it, and only when the lasting database is in use and a Blob store is connected
   * (src/shared/shared-objectstore.ts says why and how it stays private).
   */
  sharedDocuments?: { readonly client: BlobClient; readonly linkSecret: Buffer };
  /**
   * THE PUBLIC REFERRAL FORM'S SWITCH — CRM 5 of 10. Absent means the shipped
   * gate, `REFERRAL_FORM` in src/modules/crm/introducers.ts, which is off. A test passes
   * an open gate to prove the form works; nothing that runs outside a test does.
   */
  referralForm?: { readonly enabled: boolean; readonly requires: string };
  /** The portal name switch. Absent is `NAME_SWITCHES`, off. A test passes both positions. */
  names?: { readonly portalSteps: boolean };
  /**
   * THE CLOCK. Absent means the real one, as before. A test whose seed or fixtures
   * carry fixed calendar dates passes a fixed clock, so it reads the same on any day it runs: four tests read the
   * wall clock through here and went red before, and one again from 31 December 2027.
   */
  now?: () => string;
  /** The site's own address, for links sent by email. Absent is CAPREBATE_PUBLIC_ORIGIN, then http://localhost:8103. */
  publicOrigin?: string;
  /** The KEEP_ORIGINALS switch. Absent is `KEEP_ORIGINALS` in src/shared/originals.ts, off. A test passes it on. */
  keepOriginals?: KeepOriginals;
  /** Show the TEST-ONLY engagement letter (test defaults, never signed). Absent is the real letter. api/index.mjs alone passes it. */
  testLetter?: boolean;
  /** The public notices page and its complaint form (src/modules/public-site/notices-site.ts). api/index.mjs passes it; nothing else does. */
  testNotices?: boolean;
  /** The legal pages for the live website, each a Draft until approved (src/modules/compliance/legal-approvals.ts). Off unless CAPREBATE_LEGAL_PAGES=on. */
  legal?: boolean;
  /** Signing on for testing — the test copy of the letter only (ENGAGEMENT_SIGNING_TEST). Needs testLetter. api/index.mjs passes it; locally CAPREBATE_SIGNING_TEST=1. */
  testSigning?: boolean;
  /** The key a kept original is encrypted with. Absent is CAPREBATE_ORIGINALS_KEY; with neither, nothing is kept. */
  sealKey?: Buffer | null;
  /**
   * The form tokens (src/core/form-token.ts). Every real start says 'on'. With no word, they
   * are on, except inside Node's test runner, where the existing tests post forms without them.
   */
  formTokens?: FormTokens;
};

/** The `legal` setting, read from CAPREBATE_LEGAL_PAGES. Only the word "on" switches it on. */
export function legalPagesSetting(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.CAPREBATE_LEGAL_PAGES ?? '').trim() === 'on';
}

export async function createApp(
  location = ':memory:',
  opts: ServerOptions = {},
): Promise<{ server: ReturnType<typeof createServer>; close: () => void; app: Awaited<ReturnType<typeof buildApp>>; store: FsObjectStore }> {
  const app = await buildApp({
    location, ...(opts.now === undefined ? {} : { now: opts.now }), ...(opts.dbAuthToken === undefined ? {} : { dbAuthToken: opts.dbAuthToken }), ...(opts.dbLocalCopy === undefined ? {} : { dbLocalCopy: opts.dbLocalCopy }),
    ...(opts.dbEngine === undefined ? {} : { dbEngine: opts.dbEngine }),
    ...(opts.twoFactor === undefined ? {} : { twoFactor: opts.twoFactor }),
    ...(opts.schema === undefined ? {} : { schema: opts.schema }),
  });
  const kept = {
    now: app.now,
    ...(opts.keepOriginals === undefined ? {} : { originals: opts.keepOriginals }),
    sealKey: opts.sealKey === undefined ? sealKeyFromEnv() : opts.sealKey,
  };
  const formTokensOn = formTokensMode(opts.formTokens) === 'on';
  const store: FsObjectStore = opts.sharedDocuments === undefined
    ? new FsObjectStore({ root: opts.documentRoot ?? process.env.CAPREBATE_DOCS ?? join(import.meta.dirname, '..', '..', '.documents'), ...kept })
    : new SharedObjectStore({ ...kept, client: opts.sharedDocuments.client, linkSecret: opts.sharedDocuments.linkSecret });

  /* EMAILS SAVED TO BE SENT ARE SENT BEFORE THE ANSWER FINISHES. Sending is on for testing
     (EMAIL_SENDING); before, only `node src/app/cli.ts send-outbox` could send, and nothing ran it. The answer's end is held
     until every email this request saved to be sent - by any part of the site: an invitation, a staff email, a message
     alert - has been tried once through IONOS, then released; so the test website's copy, frozen once it has answered,
     still sends. Each row is claimed first (last_error set while it goes), so two copies never send one email twice. An
     invented address (@example.invalid, example.com: the seed's and the tests') is never sent to. A failure is kept on the
     row and never stops the answer. The same checks as the command line: do not contact, a bounced address, a lost file. */
  const sendSaved = async (since: string): Promise<void> => {
    const login = smtpLoginFromKeyFile(app.secrets);
    if (!sendingOn(EMAIL_SENDING, login, mailWhere(app)) || login === null) return;
    const rows = listOutboxIdToEmailBySendRequestedSentAt2<{ id: string; to_email: string }>(app.db, [since]);
    if (rows.length === 0) return;
    const provider = smtpProvider(login, app.smtpConnect, 15_000, auditMailConnections(app.audit, app.now));
    for (const r of rows) {
      if (isInventedAddress(r.to_email)) {
        updateOutboxLastErrorByIdLastError3(app.db, ['An invented address, so it was not sent.', r.id]);
        continue;
      }
      if (updateOutboxLastErrorByIdLastError4(app.db, ['Being sent.', r.id]).changes !== 1) continue;
      try {
        await dispatchOutbox({ db: app.db, now: app.now }, EMAIL_SENDING, login, provider, async (doc) => {
          const k = await openKeptOriginal({ db: app.db, store, now: app.now, audit: app.audit }, { id: 'system', role: 'SYSTEM' }, doc);
          return k === null ? null : { filename: k.filename, content_type: 'application/octet-stream', bytes: k.bytes };
        }, r.id);
      } catch {
        updateOutboxLastErrorByIdLastError2(app.db, ['It could not be sent just now.', r.id]);
      }
    }
  };

  // FASTER CLICKS: each request remembers its own reads until anything is written (src/core/db.ts withReadMemo).
  const server = createServer((req, res) => withReadMemo(() => {
    bindResponse(req, res);
    // Faster clicks, part 2: with a local copy of the lasting database, first bring in what any copy wrote since — one
    // trip. If it cannot, this click reads the copy as it stands; the next click tries again.
    try { app.db.refresh(); } catch (e) { console.error(`the local copy of the database was not brought up to date: ${e instanceof Error ? e.name : typeof e}`); }
    const since = app.now();
    // 1 Oct 2026: a key Admin saved on another copy of the website is read here from this request on (src/core/saved-keys.ts).
    try { refreshSavedKeys(app); } catch { /* a database without migration 067 yet keeps the keys it has */ }
    const end = res.end.bind(res) as (...a: unknown[]) => ServerResponse;
    let ending = false;
    (res as unknown as { end: (...a: unknown[]) => ServerResponse }).end = (...a: unknown[]): ServerResponse => {
      if (ending) return end(...a);
      ending = true;
      void sendSaved(since).catch(() => undefined).finally(() => { end(...a); });
      return res;
    };
    void handle(req, res).catch((e: unknown) => {
      // NO INTERNALS IN AN ERROR MESSAGE. The audit log carries the detail.
      // A REFUSAL AND A MISSING ROW LOOK THE SAME FROM OUTSIDE. Distinguishing
      // them would confirm which ids exist, which is an enumeration oracle.
      if (e instanceof NotAuthorised || (e as { code?: string }).code === 'E_NOT_AUTHORISED') {
        return send(res, 403, { error: 'not authorised' });
      }
      if (e instanceof AuthError) return send(res, 401, { error: e.message });
      if (e instanceof PayloadTooLarge) return send(res, 413, { error: 'body too large' });
      /* STRESS TEST: SAID IN THE LOG, which no 500 was before, so a fault on the test website can be found.
         The kind of error and the line of code only: never its message, which could carry what a person typed. */
      const where = e instanceof Error ? (e.stack ?? '').split('\n').find((l) => l.includes('/src/'))?.trim() ?? '' : '';
      console.error(`500 on ${req.method ?? '?'} ${new URL(req.url ?? '/', 'http://localhost').pathname}: ${e instanceof Error ? e.name : typeof e} ${where}`);
      send(res, 500, { error: 'something went wrong' });
    });
  }));

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;

    /* THE STATUS PAGE SAYS ONLY "OK". It answers
       {"ok":true} when the database answers, and 503 {"ok":false} when it does not - nothing else, so it tells nobody
       which parts are built or switched on. It is answered first, before any sign-in is read, so an uptime check sees
       the database and nothing in front of it. The list of what is built and switched off (STUBS) is for Admin only,
       at /staff/connections/switches.json (src/modules/admin/connections.ts). */
    if (path === '/api/health' && req.method === 'GET') {
      try { app.db.get('SELECT 1 AS ok'); } catch { return send(res, 503, { ok: false }); }
      return send(res, 200, { ok: true });
    }
    const raw = readCookie(req, SESSION_COOKIE_NAME);
    const session = authenticate(app.deps, raw);
    const actor: Actor | undefined = session ? toActor(session.user) : undefined;

    /* 4 November 2026 (the ITRoadway audit): A SIGNED-IN PERSON'S FORM CARRIES OUR TOKEN, checked here,
       before any route, for every request that would change something (src/core/form-token.ts says what and why). And
       every page this request answers with gets the tokens put into its forms as it leaves. */
    if (formTokensOn) {
      if (session !== undefined && actor !== undefined && raw !== undefined) {
        const who = { cookie: raw, user_id: actor.id, role: actor.role };
        const deps = { db: app.db, audit: app.audit, now: app.now };
        const why = await formTokenRefusal(deps, req, path, who);
        if (why !== null) return refuseForm(deps, res, path, who, why);
      }
      addTokensToPages(res, path, SESSION_COOKIE_NAME, session === undefined ? undefined : raw, () => Date.parse(app.now()));
    }

    // THE WEB HALF FIRST. It returns 'not-mine' for anything it does not own,
    // so the JSON API below is unchanged and nothing is shadowed by accident.
    try {
      const publicOrigin = opts.publicOrigin ?? process.env.CAPREBATE_PUBLIC_ORIGIN;
      if (await handleWeb({ app, store, ...(opts.referralForm === undefined ? {} : { referralForm: opts.referralForm }), ...(opts.names === undefined ? {} : { names: opts.names }), ...(publicOrigin === undefined ? {} : { publicOrigin }), ...(opts.testLetter === true ? { letterPath: TEST_LETTER_PATH } : {}), ...(opts.testNotices === true ? { notices: true } : {}), ...(opts.legal === true ? { legal: true } : {}), ...(opts.testLetter === true && opts.testSigning === true ? { signing: ENGAGEMENT_SIGNING_TEST } : {}) }, req, res) === 'handled') return;
    } catch (e) {
      // A REFUSED SCREEN IS STILL REFUSED — 403 — BUT AS A PAGE. A person who follows an address they may not
      // open gets the application's header and a sentence, not a line of JSON. The page names no object, so a refusal
      // and a missing row still look the same from outside. Data addresses (.json, .csv) and the API keep the JSON answer.
      if ((e instanceof NotAuthorised || (e as { code?: string }).code === 'E_NOT_AUTHORISED') && !res.headersSent && refusalAsPage(path)) {
        return sendRefusalPage(app, res, actor, path);
      }
      throw e;
    }

    /* THE JSON API WALKS THE SAME STEPS AS THE WEBSITE, through the same functions (src/core/sign-in.ts).
       The password answers 202 with what is still to do and a step token, NEVER a session; each step is a POST to
       /api/login/step/<new-password | method | code | resend> carrying that token in the body (never the address);
       POST /api/login/step with only the token says where the step stands. A session - the cookie and 200 - comes only
       when the last step is done. The limits are the website's, because they are the same rows: 15 minutes a sign-in,
       5 wrong codes, a code once.
       RECOVERY CODES, on the same functions. The answer to the step that sets a second step up carries
       `recovery_codes` ONCE (ten; nothing keeps them as text, so they cannot be asked for again); a session's answer
       carries `recovery_codes_left` for a person with a second step. At the VERIFY step a recovery code goes to its own
       route, POST /api/login/step/recovery with `step_token` and `code` - not /code, so a six-digit code and a recovery
       code are never guessed apart. It shares the 5 wrong codes. Signed in, POST /api/account/recovery-codes makes ten
       new ones (every unused old one thrown away) and answers them once. */
    const sessionCookie = (r: LoginResult): string =>
      `${r.cookie.name}=${r.cookie.value}; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=${new Date(r.cookie.expires).toUTCString()}`;
    const stepAnswer = (status: number, token: string, extra: Record<string, unknown> = {}): void => {
      const v = SI.describeStep(app, token);
      if (v === undefined) return send(res, 401, { error: SI.STEP_GONE });
      // The step token goes back only in the body, to the caller that holds it already or has just earned it.
      send(res, status, { ...extra, step: v.step, needs: v.needs, method: v.method, sent_to: v.sent_to,
        app_key: v.app_key, otpauth_uri: v.otpauth_uri, expires_at: v.expires_at, recovery_code: v.recovery_code, step_token: token,
        ...(v.refused === null ? {} : { error: v.refused }) });
    };

    if (path === '/api/login' && req.method === 'POST') {
      const body = await readJson(req);
      const email = typeof body.email === 'string' ? body.email : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const r = await SI.beginSignIn(app, email, password, clientIp(req)); // the password, rate-limited and generic, as ever
      if (r.kind === 'STEP') return stepAnswer(202, r.token);
      res.setHeader('set-cookie', sessionCookie(r.login));
      // The user, never the hash — `User` has no such field to leak.
      return send(res, 200, { user: r.login.user });
    }

    const apiStep = /^\/api\/login\/step(?:\/(new-password|method|code|resend|recovery))?$/.exec(path);
    if (apiStep && req.method === 'POST') {
      const body = await readJson(req);
      const str = (k: string): string => (typeof body[k] === 'string' ? body[k] as string : '');
      const token = str('step_token');
      const which = apiStep[1];
      if (which === undefined) return stepAnswer(202, token);
      const r = which === 'new-password' ? await SI.submitNewPassword(app, token, str('password'), typeof body.again === 'string' ? body.again : str('password'))
        : which === 'method' ? SI.chooseMethod(app, token, str('method'))
        : which === 'code' ? SI.submitCode(app, token, str('code'))
        : which === 'recovery' ? SI.submitRecoveryCode(app, token, str('code'))
        : SI.resendCode(app, token);
      if (r.kind === 'SESSION') {
        res.setHeader('set-cookie', sessionCookie(r.login));
        return send(res, 200, { user: r.login.user,
          ...(r.recovery_codes === undefined ? {} : { recovery_codes: r.recovery_codes }),
          ...(r.recovery_left === undefined ? {} : { recovery_codes_left: r.recovery_left }) });
      }
      if (r.kind === 'ACCOUNT_DONE') return send(res, 200, { done: true, ...(r.recovery_codes === undefined ? {} : { recovery_codes: r.recovery_codes }) });
      if (r.kind === 'GONE') return send(res, 401, { error: r.why });
      if (r.kind === 'ERROR') return stepAnswer(400, token, { error: r.why });
      return stepAnswer(202, token, r.note === undefined ? {} : { note: r.note });
    }

    if (actor === undefined || session === undefined) {
      return send(res, 401, { error: GENERIC_AUTH_FAILURE });
    }

    if (path === '/api/logout' && req.method === 'POST') {
      logout(app.deps, session.session_id, session.user);
      res.setHeader('set-cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
      return send(res, 200, { ok: true });
    }

    if (path === '/api/account/recovery-codes' && req.method === 'POST') {
      const r = SI.makeNewRecoveryCodes(app, actor); // The same function as the website's button
      return r.ok ? send(res, 200, { recovery_codes: r.codes }) : send(res, 400, { error: r.why });
    }

    /* A single-use token for the JSON API's sensitive actions (x-cb-once), one per ask. */
    if (path === '/api/once-token' && req.method === 'GET' && raw !== undefined) {
      return send(res, 200, { once_token: onceToken(raw, Date.parse(app.now())) });
    }

    if (path === '/api/whoami' && req.method === 'GET') {
      return send(res, 200, {
        user: session.user,
        // The form token the JSON API sends in x-cb-form (src/core/form-token.ts).
        ...(raw === undefined ? {} : { form_token: formToken(raw) }),
        // What THIS actor may do, computed rather than hard-coded per role.
        actions: REGISTERED_ACTIONS.filter((a) =>
          can(actor, a, { type: 'business', id: session.user.business_id ?? 'none' } as Obj),
        ),
      });
    }

    if (path.startsWith('/api/invoices/') && req.method === 'GET') {
      const id = path.slice('/api/invoices/'.length);
      const row = getInvoicesIdBusinessIdById2<{ id: string; business_id: string }>(app.db, [id]);
      if (row === undefined) return send(res, 404, { error: 'not found' });
      authorise(actor, 'invoice.read', { type: 'invoice', id: row.id, business_id: row.business_id });
      const full = getInvoicesIdBusinessIdById4(app.db, [id]);
      return send(res, 200, { invoice: full });
    }

    if (path.startsWith('/api/surveyor-jobs/') && req.method === 'GET') {
      const id = path.slice('/api/surveyor-jobs/'.length);
      const job = getSurveyorJobsIdBusinessIdById4<{ id: string; business_id: string; surveyor_id: string | null }>(app.db, [id]);
      if (job === undefined) return send(res, 404, { error: 'not found' });
      authorise(actor, 'surveyor_job.read', {
        type: 'surveyor_job', id: job.id, business_id: job.business_id, surveyor_id: job.surveyor_id,
      });
      /* CORRECTED. THIS RETURNED 501 AND SAID
         "the surveyor workspace is Phase 107". The workspace was built on
         9 September, and a route that still announces the feature as future
         work is a stub that lies about the state of the system — which is
         precisely what the developer spec's stub table exists to prevent.

         IT SERVES THE SAME OBJECT THE SCREEN SERVES, THROUGH THE SAME
         ASSEMBLER. `payloadFor` calls `loadJob`, which authorises on the
         specific job, and then `assembleSurveyorPayload`, which builds the
         surveyor's object FORWARDS from what the quarantine released. There is
         no second assembly path and no second rule — N1 holds here because it
         is the same code, not because this route repeats the precaution. */
      assertSurveySection(actor);
      return send(res, 200, payloadFor(
        { db: app.db, audit: app.audit, now: app.now, newId: () => randomUUID() },
        actor, job.id,
      ));
    }

    return send(res, 404, { error: 'not found' });
  }

  return { server, close: () => { server.close(); app.close(); }, app, store };
}

if (import.meta.filename === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8103);
  const location = process.env.CAPREBATE_DB ?? 'caprebate.db';
  // CAPREBATE_SIGNING_TEST=1 runs this copy with the test letter and signing on for testing (the test copy only).
  const signingTest = (process.env.CAPREBATE_SIGNING_TEST ?? '').trim() === '1';
  /* A key file others could open stops a live start (CAPREBATE_PRODUCTION=1) and is a warning anywhere
     else. The words name the file and its permissions, never a key. */
  /* CAPREBATE_LEGAL_PAGES=on serves the legal pages (each a Draft until approved). Anything else: off. */
  const legal = legalPagesSetting();
  const keyCheck = keyFileStartCheck();
  for (const line of keyCheck.lines) console.error(line);
  if (keyCheck.stop) process.exitCode = 1;
  // A real start says the form tokens are on, in so many words.
  else void createApp(location, { ...(signingTest ? { testLetter: true, testSigning: true } : {}), ...(legal ? { legal: true } : {}), formTokens: 'on' }).then(({ server, app }) => {
    server.listen(port, () => {
      console.log(`caprebate back end on http://localhost:${port}`);
      console.log(`  ${turnstileWhy(app.secrets)}`); // The contact form's security check, said at start-up
      if (signingTest) console.log('  signing ON FOR TESTING: the test copy of the engagement letter only');
      console.log(legal ? '  legal pages ON (CAPREBATE_LEGAL_PAGES=on): each shows its Draft line until approved' : '  legal pages off (CAPREBATE_LEGAL_PAGES is not on)');
    });
  });
}
