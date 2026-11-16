/**
 * PHASE 151k, 28 September 2026 — SIGNING A TOOL IN PAST THE SECOND STEP, ON THE DEMO'S INVENTED LOGINS ONLY.
 *
 * Since Phase 151j every staff login gives a second step, so the screenshot tool
 * (04-phase-work/phase144/tools/crawl-shots.mjs), which signed in with a password, stopped at the step page and reached
 * no staff screen at all. This signs it in through the JSON API's steps (src/app/server.ts, /api/login and
 * /api/login/step/...), the same functions a person's sign-in runs:
 *
 *   SET UP (a login with no second step yet, which is every staff login on a demo just started)
 *       it chooses an authenticator app, is given the key as a person is, and works out the six numbers from it itself
 *       (src/core/totp.ts). The key is kept only in this process, for this run.
 *   GIVE A CODE
 *       an app it set up in this run: the next code from the key it holds;
 *       an emailed code: read from the demo's outbox page, /staff/dev-outbox, which an Admin signed in by this run opens
 *       (`readOutbox`). Since Phase 161n1a (ITRoadway's second review, L-06) the demo no longer prints emails to its
 *       console: a code or a link in a terminal is one anybody sharing it can use.
 *   ANYTHING ELSE IT DOES NOT DO, AND SAYS WHICH LOGIN IT COULD NOT REACH AND WHY: a temporary password to replace; an
 *       app set up before this run, whose key it never held; an emailed code with no outbox page to read.
 *
 * NEVER A REAL PERSON'S ACCOUNT. It refuses any address not ending in @example.invalid (the seed's invented logins) and
 * any website not on this machine (localhost, 127.0.0.1 or ::1) - so it can never set up a second step on the test
 * website's logins, which Lakhbir uses, or anywhere else.
 */
import { codeAt, stepAt } from '../src/core/totp.ts';

export const DEMO_DOMAIN = '@example.invalid';

export type Cookie = { readonly name: string; readonly value: string };
export type SignedIn = { readonly ok: true; readonly cookies: readonly Cookie[]; readonly how: string };
export type NotSignedIn = { readonly ok: false; readonly why: string };

export type DemoSignInOptions = {
  /** The demo's outbox page (/staff/dev-outbox, as an Admin of this run sees it), for an emailed code. Absent: none is read. */
  readonly readOutbox?: () => Promise<string>;
  /** App keys this run set up, by address. Filled in here; pass the same map for the whole run. */
  readonly appKeys?: Map<string, string>;
  /** The clock, in milliseconds. Tests pass the server's. */
  readonly nowMs?: () => number;
  /** How long to wait for an emailed code to be printed. The demo prints once a second. */
  readonly waitMs?: number;
};

export function isOnThisMachine(base: string): boolean {
  try {
    const h = new URL(base).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
  } catch {
    return false;
  }
}

type Answer = { status: number; body: Record<string, unknown>; cookies: Cookie[] };

async function post(base: string, path: string, body: Record<string, unknown>): Promise<Answer> {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const cookies = r.headers.getSetCookie().map((c) => c.split(';')[0] ?? '').map((kv) => {
    const i = kv.indexOf('=');
    return { name: kv.slice(0, i), value: kv.slice(i + 1) };
  }).filter((c) => c.name !== '' && c.value !== '');
  let parsed: Record<string, unknown> = {};
  try { parsed = (await r.json()) as Record<string, unknown>; } catch { /* not JSON */ }
  return { status: r.status, body: parsed, cookies };
}

/**
 * The newest sign-in code on the outbox page for this address, with the email's id (newest first on the page), or null.
 * The branded email (Phase 161m2): its heading "Your sign-in code", then the code on a line of its own.
 */
export function codeFromOutboxPage(page: string, email: string): { id: string; code: string } | null {
  const to = `to ${email.toLowerCase()} ·`;
  for (const part of page.split('<section class="card"').slice(1)) {
    if (!part.includes('Your Cap Rebate sign-in code') || !part.toLowerCase().includes(to)) continue;
    const id = /data-id="([^"]+)"/.exec(part)?.[1] ?? '';
    const code = /Your sign-in code\s+(\d{6})\s/.exec(part)?.[1];
    if (code !== undefined) return { id, code };
  }
  return null;
}

export async function demoSignIn(base: string, email: string, password: string, opts: DemoSignInOptions = {}): Promise<SignedIn | NotSignedIn> {
  if (!email.toLowerCase().endsWith(DEMO_DOMAIN)) return { ok: false, why: `${email} is not one of the demo's invented logins (${DEMO_DOMAIN}), so it was not signed in` };
  if (!isOnThisMachine(base)) return { ok: false, why: `${base} is not on this machine, so no login there was signed in: this is for the demo only` };
  const now = opts.nowMs ?? (() => Date.now());
  const keys = opts.appKeys ?? new Map<string, string>();
  // Only an email saved from here on: an older code for the same login must never be read as this one.
  const before = opts.readOutbox === undefined ? null : codeFromOutboxPage(await opts.readOutbox(), email)?.id ?? null;

  const first = await post(base, '/api/login', { email, password });
  if (first.status === 200) return { ok: true, cookies: first.cookies, how: 'password alone' };
  if (first.status !== 202) return { ok: false, why: `${email}: the password was not taken (${String(first.body.error ?? first.status)})` };
  const token = String(first.body.step_token ?? '');
  let step = first.body;

  const giveCode = async (code: string): Promise<Answer> => post(base, '/api/login/step/code', { step_token: token, code });

  if (step.needs === 'CHOOSE_PASSWORD') {
    return { ok: false, why: `${email} has a temporary password to replace first; the tool does not choose passwords` };
  }
  if (step.needs === 'CHOOSE_METHOD') {
    step = (await post(base, '/api/login/step/method', { step_token: token, method: 'APP' })).body;
    const key = typeof step.app_key === 'string' ? step.app_key.replace(/\s/g, '') : '';
    if (key === '') return { ok: false, why: `${email}: no app key was given (${String(step.error ?? 'no reason given')})` };
    const done = await giveCode(codeAt(key, stepAt(now())));
    if (done.status !== 200) return { ok: false, why: `${email}: the app code was not taken (${String(done.body.error ?? done.status)})` };
    keys.set(email.toLowerCase(), key);
    return { ok: true, cookies: done.cookies, how: 'set up an authenticator app' };
  }
  if (step.needs === 'GIVE_CODE' && step.method === 'APP') {
    const key = keys.get(email.toLowerCase());
    if (key === undefined) {
      return { ok: false, why: `${email}: its authenticator app was set up before this run, so the tool does not hold its key. Restart the demo (npm run start:demo) and run the tool again` };
    }
    // The code of this 30 seconds may already have been used by this run; the next one is also taken (src/core/totp.ts).
    for (const ahead of [0, 1]) {
      const done = await giveCode(codeAt(key, stepAt(now()) + ahead));
      if (done.status === 200) return { ok: true, cookies: done.cookies, how: 'authenticator app' };
    }
    return { ok: false, why: `${email}: the app code was not taken` };
  }
  if (step.needs === 'GIVE_CODE' && step.method === 'EMAIL') {
    if (opts.readOutbox === undefined) {
      return { ok: false, why: `${email} is asked for an emailed code, and the tool was not given the demo's outbox page to read it from (sign in the Admin first)` };
    }
    const until = Date.now() + (opts.waitMs ?? 3000);
    let code: string | null = null;
    for (;;) {
      const found = codeFromOutboxPage(await opts.readOutbox(), email);
      if (found !== null && found.id !== before) code = found.code;
      if (code !== null || Date.now() > until) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (code === null) return { ok: false, why: `${email}: no new sign-in code for it was found on the demo's outbox page` };
    const done = await giveCode(code);
    if (done.status !== 200) return { ok: false, why: `${email}: the emailed code was not taken (${String(done.body.error ?? done.status)})` };
    return { ok: true, cookies: done.cookies, how: 'emailed code, read from the demo outbox page' };
  }
  return { ok: false, why: `${email}: a step the tool does not know (${String(step.needs ?? step.error ?? 'none')})` };
}
