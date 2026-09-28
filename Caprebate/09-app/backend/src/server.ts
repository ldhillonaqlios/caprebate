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
 * WHAT WAS NOT HERE, AND NOW IS. Phase 103 built the enforcement and said
 * "Phases 104 to 107 build what sits on it". Phase 104 built the first of
 * them — the public site, the assessment, the login and the client portal —
 * and it is mounted BEFORE the JSON API below, in src/web/router.ts.
 *
 * ONE PROCESS, ONE SESSION STORE, ONE `can()`. The web half does not get its
 * own authentication, its own authorisation or its own database handle; it is
 * handed this application. That is the whole reason it is mounted here rather
 * than run as a second server.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { buildApp, STUBS } from './app.ts';
import { authorise, can, NotAuthorised, REGISTERED_ACTIONS, type Actor, type Obj } from './authz.ts';
import { authenticate, login, logout, SESSION_COOKIE_NAME, AuthError, GENERIC_AUTH_FAILURE } from './auth.ts';
import { toActor } from './users.ts';
import { payloadFor, assertSurveySection } from './web/surveyor.ts';
import { handleWeb, PayloadTooLarge, refusalAsPage, sendRefusalPage } from './web/router.ts';
import { FsObjectStore } from './web/objectstore.ts';
import { SharedObjectStore, type BlobClient } from './web/shared-objectstore.ts';
import { sealKeyFromEnv, type KeepOriginals } from './web/originals.ts';

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
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = c as Buffer;
    size += b.length;
    if (size > 1_000_000) throw new Error('body too large'); // a cap is a control
    chunks.push(b);
  }
  if (chunks.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
  /** PHASE 151e (line 4): the token of a remote database named by `location` (src/db.ts). Absent for memory and file. */
  dbAuthToken?: string;
  /** Tests only: see BuildOptions.dbEngine. */
  dbEngine?: 'node:sqlite' | 'libsql';
  /** PHASE 151j: see BuildOptions.twoFactor. Absent is 'staff'. */
  twoFactor?: 'staff' | 'off';
  /**
   * Where client documents live. OUTSIDE THE WEB ROOT — which is trivially
   * true here because this application has no static file route at all, and
   * `assertNoStaticFileRoute` proves it from the router's own source.
   */
  documentRoot?: string;
  /**
   * PHASE 151i: ONE PRIVATE STORE FOR EVERY COPY, instead of `documentRoot`. Absent is the folder, as before. Only
   * api/index.mjs passes it, and only when the lasting database is in use and a Blob store is connected
   * (src/web/shared-objectstore.ts says why and how it stays private).
   */
  sharedDocuments?: { readonly client: BlobClient; readonly linkSecret: Buffer };
  /**
   * THE PUBLIC REFERRAL FORM'S SWITCH — CRM 5 of 10. Absent means the shipped
   * gate, `REFERRAL_FORM` in src/web/introducers.ts, which is off. A test passes
   * an open gate to prove the form works; nothing that runs outside a test does.
   */
  referralForm?: { readonly enabled: boolean; readonly requires: string };
  /** PHASE 133c: the portal name switch (B9; the menu switch went in Phase 135). Absent is `NAME_SWITCHES`, off. A test passes both positions. */
  names?: { readonly portalSteps: boolean };
  /**
   * THE CLOCK — Phase 132, 15 September 2026. Absent means the real one, as before. A test whose seed or fixtures
   * carry fixed calendar dates passes a fixed clock, so it reads the same on any day it runs: four tests read the
   * wall clock through here and went red before September 2026, and one again from 31 December 2027.
   */
  now?: () => string;
  /** PHASE 133j: the site's own address, for links sent by email. Absent is CAPREBATE_PUBLIC_ORIGIN, then http://localhost:8103. */
  publicOrigin?: string;
  /** PHASE 140: the KEEP_ORIGINALS switch. Absent is `KEEP_ORIGINALS` in src/web/originals.ts, off. A test passes it on. */
  keepOriginals?: KeepOriginals;
  /** PHASE 140: the key a kept original is encrypted with. Absent is CAPREBATE_ORIGINALS_KEY; with neither, nothing is kept. */
  sealKey?: Buffer | null;
};

export async function createApp(
  location = ':memory:',
  opts: ServerOptions = {},
): Promise<{ server: ReturnType<typeof createServer>; close: () => void; app: Awaited<ReturnType<typeof buildApp>>; store: FsObjectStore }> {
  const app = await buildApp({
    location, ...(opts.now === undefined ? {} : { now: opts.now }), ...(opts.dbAuthToken === undefined ? {} : { dbAuthToken: opts.dbAuthToken }),
    ...(opts.dbEngine === undefined ? {} : { dbEngine: opts.dbEngine }),
    ...(opts.twoFactor === undefined ? {} : { twoFactor: opts.twoFactor }),
  });
  const kept = {
    now: app.now,
    ...(opts.keepOriginals === undefined ? {} : { originals: opts.keepOriginals }),
    sealKey: opts.sealKey === undefined ? sealKeyFromEnv() : opts.sealKey,
  };
  const store: FsObjectStore = opts.sharedDocuments === undefined
    ? new FsObjectStore({ root: opts.documentRoot ?? process.env.CAPREBATE_DOCS ?? join(import.meta.dirname, '..', '.documents'), ...kept })
    : new SharedObjectStore({ ...kept, client: opts.sharedDocuments.client, linkSecret: opts.sharedDocuments.linkSecret });

  const server = createServer((req, res) => {
    void handle(req, res).catch((e: unknown) => {
      // NO INTERNALS IN AN ERROR MESSAGE. The audit log carries the detail.
      // A REFUSAL AND A MISSING ROW LOOK THE SAME FROM OUTSIDE. Distinguishing
      // them would confirm which ids exist, which is an enumeration oracle.
      if (e instanceof NotAuthorised || (e as { code?: string }).code === 'E_NOT_AUTHORISED') {
        return send(res, 403, { error: 'not authorised' });
      }
      if (e instanceof AuthError) return send(res, 401, { error: e.message });
      if (e instanceof PayloadTooLarge) return send(res, 413, { error: 'body too large' });
      send(res, 500, { error: 'something went wrong' });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const raw = readCookie(req, SESSION_COOKIE_NAME);
    const session = authenticate(app.deps, raw);
    const actor: Actor | undefined = session ? toActor(session.user) : undefined;

    // THE WEB HALF FIRST. It returns 'not-mine' for anything it does not own,
    // so the JSON API below is unchanged and nothing is shadowed by accident.
    try {
      const publicOrigin = opts.publicOrigin ?? process.env.CAPREBATE_PUBLIC_ORIGIN;
      if (await handleWeb({ app, store, ...(opts.referralForm === undefined ? {} : { referralForm: opts.referralForm }), ...(opts.names === undefined ? {} : { names: opts.names }), ...(publicOrigin === undefined ? {} : { publicOrigin }) }, req, res) === 'handled') return;
    } catch (e) {
      // PHASE 133a: A REFUSED SCREEN IS STILL REFUSED — 403 — BUT AS A PAGE. A person who follows an address they may not
      // open gets the application's header and a sentence, not a line of JSON. The page names no object, so a refusal
      // and a missing row still look the same from outside. Data addresses (.json, .csv) and the API keep the JSON answer.
      if ((e instanceof NotAuthorised || (e as { code?: string }).code === 'E_NOT_AUTHORISED') && !res.headersSent && refusalAsPage(path)) {
        return sendRefusalPage(app, res, actor, path);
      }
      throw e;
    }

    if (path === '/api/health' && req.method === 'GET') {
      return send(res, 200, { ok: true, stubs: STUBS });
    }

    if (path === '/api/login' && req.method === 'POST') {
      const body = await readJson(req);
      const email = typeof body.email === 'string' ? body.email : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const r = await login(app.deps, email, password);
      res.setHeader(
        'set-cookie',
        `${r.cookie.name}=${r.cookie.value}; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=${new Date(r.cookie.expires).toUTCString()}`,
      );
      // The user, never the hash — `User` has no such field to leak.
      return send(res, 200, { user: r.user });
    }

    if (actor === undefined || session === undefined) {
      return send(res, 401, { error: GENERIC_AUTH_FAILURE });
    }

    if (path === '/api/logout' && req.method === 'POST') {
      logout(app.deps, session.session_id, session.user);
      res.setHeader('set-cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
      return send(res, 200, { ok: true });
    }

    if (path === '/api/whoami' && req.method === 'GET') {
      return send(res, 200, {
        user: session.user,
        // What THIS actor may do, computed rather than hard-coded per role.
        actions: REGISTERED_ACTIONS.filter((a) =>
          can(actor, a, { type: 'business', id: session.user.business_id ?? 'none' } as Obj),
        ),
      });
    }

    if (path.startsWith('/api/invoices/') && req.method === 'GET') {
      const id = path.slice('/api/invoices/'.length);
      const row = app.db.get<{ id: string; business_id: string }>(
        'SELECT id, business_id FROM invoices WHERE id = ?', [id],
      );
      if (row === undefined) return send(res, 404, { error: 'not found' });
      authorise(actor, 'invoice.read', { type: 'invoice', id: row.id, business_id: row.business_id });
      const full = app.db.get(
        'SELECT id, business_id, claim_value_pence, fee_pence, invoice_status, payment_status, vat_position ' +
          'FROM invoices WHERE id = ?', [id],
      );
      return send(res, 200, { invoice: full });
    }

    if (path.startsWith('/api/surveyor-jobs/') && req.method === 'GET') {
      const id = path.slice('/api/surveyor-jobs/'.length);
      const job = app.db.get<{ id: string; business_id: string; surveyor_id: string | null }>(
        'SELECT id, business_id, surveyor_id FROM surveyor_jobs WHERE id = ?', [id],
      );
      if (job === undefined) return send(res, 404, { error: 'not found' });
      authorise(actor, 'surveyor_job.read', {
        type: 'surveyor_job', id: job.id, business_id: job.business_id, surveyor_id: job.surveyor_id,
      });
      /* CORRECTED 9 SEPTEMBER 2026 (Phase 108). THIS RETURNED 501 AND SAID
         "the surveyor workspace is Phase 107". Phase 107 built it on
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
  void createApp(location).then(({ server }) => {
    server.listen(port, () => console.log(`caprebate back end on http://localhost:${port}`));
  });
}
