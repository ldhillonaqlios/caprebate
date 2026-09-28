/**
 * SIGNING IN: THE STEPS BETWEEN A RIGHT PASSWORD AND A SESSION. Phase 151j, 28 September 2026.
 *
 * WHAT LAKHBIR DECIDED, 28 September 2026:
 *   - the super user creates a person's account with a TEMPORARY password, shown once, good for seven days; at the
 *     first sign-in the person chooses their own password and sets up a second factor;
 *   - EVERY STAFF LOGIN gives a second factor at every sign-in; a client may choose to;
 *   - the second factor is a CODE BY EMAIL or an AUTHENTICATOR APP (no text messages);
 *   - a forgotten password is reset by an emailed link;
 *   - the super user can give someone a new temporary password, or clear their second factor so they set it up again.
 *
 * HOW. The password is checked by `verifyPassword` (src/auth.ts), which issues nothing. `nextSignInStep` says what is
 * left. If something is, a row in `sign_in_steps` holds the sign-in part way, and the browser holds a random token for
 * it in an httpOnly cookie (only its hash is stored). Each step is short-lived, counts its wrong codes, and finishes
 * once. Only a finished step issues a session (`startSession`). `login` itself refuses while a step is left, so the
 * JSON API cannot be used to go round this.
 *
 * WHAT IS NEVER KEPT OR PRINTED: a password, a code, a token or an app's secret, in any log line or audit row. An
 * emailed code is kept only as a hash, for ten minutes. The app's secret is shown to the person once, as a QR code
 * and as text, while they set it up.
 *
 * PHASE 151k, 28 September 2026:
 *   - THE JSON API WALKS THE SAME STEPS. `/api/login` and `/api/login/step/...` (src/server.ts) call these same
 *     functions, with the step's token in the request body instead of the `cb_step` cookie; `describeStep` says what a
 *     step needs, for the page and for the API alike. There is no second implementation.
 *   - THE APP'S SECRET IS SEALED where a key is set (src/mfa-seal.ts, CAPREBATE_MFA_KEY): in `pending_secret` while
 *     it is set up and in `users.mfa_secret` after. A text secret from before still works, and is sealed the next time
 *     it signs somebody in.
 *   - A SIGN-IN CODE'S EMAIL HAS ITS OWN KIND, SIGN_IN_CODE, so that once it has really been sent its words can be
 *     taken out of the outbox (src/stubs/email-provider.ts, blankSentSecrets).
 */
import { randomBytes, randomInt } from 'node:crypto';
import { renderSVG } from 'uqr';
import type { App } from '../app.ts';
import type { Actor } from '../authz.ts';
import { authorise } from '../authz.ts';
import {
  AuthError, nextSignInStep, revokeAllSessions, startSession, verifyPassword, type LoginResult, type SignInStep,
} from '../auth.ts';
import { findById, hashToken, newId, type User } from '../users.ts';
import { grouped, newSecret, otpauthUri, verifyCode } from '../totp.ts';
import { isSealed, mfaKeyFrom, openSecret, sealSecret } from '../mfa-seal.ts';
import { h, page, raw } from './html.ts';

export const STEP_COOKIE = 'cb_step';
export const STEP_TTL_MS = 15 * 60 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_WRONG_CODES = 5;
export const MAX_CODES_SENT = 5;
export const TEMPORARY_PASSWORD_DAYS = 7;
export const MIN_PASSWORD = 12;
export const ISSUER = 'Cap Rebate';

export type Method = 'EMAIL' | 'APP';
type StepRow = {
  id: string; user_id: string; purpose: 'SIGN_IN' | 'ACCOUNT'; step: SignInStep;
  pending_method: Method | null; pending_secret: string | null;
  code_hash: string | null; code_expires_at: string | null; codes_sent: number; attempts: number;
  expires_at: string; finished_at: string | null;
};
type Security = { mfa_method: Method | null; mfa_secret: string | null; mfa_last_step: number | null; password_hash: string };

export type StepResult =
  | { readonly kind: 'SESSION'; readonly login: LoginResult }
  | { readonly kind: 'ACCOUNT_DONE' }
  | { readonly kind: 'STEP'; readonly note?: string }
  | { readonly kind: 'ERROR'; readonly why: string }
  | { readonly kind: 'GONE'; readonly why: string };

export const STEP_GONE = 'That sign-in has timed out. Please sign in again.';
export const TOO_MANY_CODES = 'Too many wrong codes. Please sign in again.';
export const WRONG_CODE = 'That code is not right, or it has expired. Try again.';

function security(app: App, user_id: string): Security | undefined {
  return app.db.get<Security>('SELECT mfa_method, mfa_secret, mfa_last_step, password_hash FROM users WHERE id = ?', [user_id]);
}

function openStep(app: App, user: User, purpose: StepRow['purpose'], step: SignInStep): string {
  const raw0 = randomBytes(32).toString('hex');
  const at = app.now();
  const id = newId();
  app.db.run(
    'INSERT INTO sign_in_steps (id, token_hash, user_id, purpose, step, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, hashToken(raw0), user.id, purpose, step, at, new Date(Date.parse(at) + STEP_TTL_MS).toISOString()]);
  app.audit.append({ at, kind: 'SIGN_IN_STEP_STARTED', outcome: 'ALLOWED', actor_id: user.id, actor_role: user.role,
    object_type: 'sign_in_step', object_id: id, detail: { step, purpose } });
  if (step === 'VERIFY' && security(app, user.id)?.mfa_method === 'EMAIL') sendCode(app, loadById(app, id)!, user);
  return raw0;
}

function loadById(app: App, id: string): StepRow | undefined {
  return app.db.get<StepRow>(
    'SELECT id, user_id, purpose, step, pending_method, pending_secret, code_hash, code_expires_at, codes_sent, attempts, expires_at, finished_at ' +
      'FROM sign_in_steps WHERE id = ?', [id]);
}

/** A step still open for this token: not finished, not past its time, and its person still active. */
export function openFor(app: App, raw0: string | undefined): { row: StepRow; user: User } | undefined {
  if (raw0 === undefined || raw0 === '') return undefined;
  const row = app.db.get<StepRow>(
    'SELECT id, user_id, purpose, step, pending_method, pending_secret, code_hash, code_expires_at, codes_sent, attempts, expires_at, finished_at ' +
      'FROM sign_in_steps WHERE token_hash = ?', [hashToken(raw0)]);
  if (row === undefined || row.finished_at !== null || Date.parse(row.expires_at) <= Date.parse(app.now())) return undefined;
  const user = findById(app.db, row.user_id);
  if (user === undefined || user.disabled) return undefined;
  return { row, user };
}

function finishRow(app: App, row: StepRow): void {
  app.db.run('UPDATE sign_in_steps SET finished_at = ? WHERE id = ?', [app.now(), row.id]);
}

/** A code is six digits, sent to the person's own sign-in address, kept only as a hash for ten minutes. */
function sendCode(app: App, row: StepRow, user: User): StepResult {
  if (row.codes_sent >= MAX_CODES_SENT) return { kind: 'ERROR', why: 'We have sent the most codes we can for this sign-in. Please sign in again.' };
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const at = app.now();
  app.db.run('UPDATE sign_in_steps SET code_hash = ?, code_expires_at = ?, codes_sent = codes_sent + 1 WHERE id = ?',
    [hashToken(`${row.id}:${code}`), new Date(Date.parse(at) + CODE_TTL_MS).toISOString(), row.id]);
  const sent = app.email.send({
    to_email: user.email, kind: 'SIGN_IN_CODE',
    subject: 'Your Cap Rebate sign-in code',
    body: `Your Cap Rebate sign-in code is ${code}.\n\nIt works once, for 10 minutes. ` +
      'If you did not try to sign in, somebody may have your password: change it, and tell your administrator.',
  });
  app.audit.append({ at, kind: 'SIGN_IN_CODE_SENT', outcome: sent.refused === null ? 'ALLOWED' : 'REFUSED', actor_id: user.id,
    actor_role: user.role, object_type: 'sign_in_step', object_id: row.id, detail: sent.refused === null ? {} : { reason: sent.refused } });
  return { kind: 'STEP', note: 'We have sent you a new code.' };
}

/** THE START: the password, then either a session or the first step. */
export async function beginSignIn(app: App, email: string, password: string): Promise<
  { readonly kind: 'SESSION'; readonly login: LoginResult } | { readonly kind: 'STEP'; readonly token: string }> {
  const user = await verifyPassword(app.deps, email, password);
  const step = nextSignInStep(app.deps, user.id); // may throw E_TEMPORARY_EXPIRED
  if (step === null) return { kind: 'SESSION', login: startSession(app.deps, user, {}) };
  return { kind: 'STEP', token: openStep(app, user, 'SIGN_IN', step) };
}

/** After a step: the next one, or the end. */
function advance(app: App, row: StepRow, user: User, how: Record<string, unknown>): StepResult {
  const next = row.purpose === 'SIGN_IN' ? nextSignInStep(app.deps, user.id) : null;
  if (next === null || (next === 'VERIFY' && (row.step === 'SETUP' || row.step === 'VERIFY'))) {
    finishRow(app, row);
    if (row.purpose === 'ACCOUNT') return { kind: 'ACCOUNT_DONE' };
    return { kind: 'SESSION', login: startSession(app.deps, user, how) };
  }
  app.db.run('UPDATE sign_in_steps SET step = ?, pending_method = NULL, pending_secret = NULL, code_hash = NULL, code_expires_at = NULL, attempts = 0 WHERE id = ?',
    [next, row.id]);
  if (next === 'VERIFY' && security(app, user.id)?.mfa_method === 'EMAIL') sendCode(app, loadById(app, row.id)!, user);
  return { kind: 'STEP' };
}

/** NEW_PASSWORD: the person's own password, in place of the temporary one. */
export async function submitNewPassword(app: App, raw0: string | undefined, next: string, again: string): Promise<StepResult> {
  const open = openFor(app, raw0);
  if (open === undefined) return { kind: 'GONE', why: STEP_GONE };
  const { row, user } = open;
  if (row.step !== 'NEW_PASSWORD') return { kind: 'STEP' };
  if (next.length < MIN_PASSWORD || next.length > 1024) return { kind: 'ERROR', why: `Choose a password of at least ${MIN_PASSWORD} characters.` };
  if (next !== again) return { kind: 'ERROR', why: 'The two passwords are not the same. Type it again.' };
  const s = security(app, user.id);
  if (s !== undefined && await app.hasher.verify(s.password_hash, next)) {
    return { kind: 'ERROR', why: 'Choose a new password, not the temporary one you were given.' };
  }
  const hash = await app.hasher.hash(next);
  app.db.run('UPDATE users SET password_hash = ?, password_temporary_until = NULL, updated_at = ? WHERE id = ?', [hash, app.now(), user.id]);
  app.audit.append({ at: app.now(), kind: 'PASSWORD_CHANGED', outcome: 'ALLOWED', actor_id: user.id, actor_role: user.role,
    detail: { because: 'TEMPORARY_PASSWORD_REPLACED' } });
  return advance(app, row, user, {});
}

/** SETUP: the person picks email codes or an authenticator app. */
export function chooseMethod(app: App, raw0: string | undefined, method: string): StepResult {
  const open = openFor(app, raw0);
  if (open === undefined) return { kind: 'GONE', why: STEP_GONE };
  const { row, user } = open;
  if (row.step !== 'SETUP') return { kind: 'STEP' };
  if (method !== 'EMAIL' && method !== 'APP') return { kind: 'ERROR', why: 'Choose how you would like to get your code.' };
  // PHASE 151k: the new secret is sealed before it is written, where a key is set; a key that is set and not right refuses.
  let pending: string | null = null;
  if (method === 'APP') {
    const sealed = sealSecret(mfaKeyFrom(app.secrets), user.id, newSecret());
    if (!sealed.ok) return { kind: 'ERROR', why: sealed.why };
    pending = sealed.stored;
  }
  app.db.run('UPDATE sign_in_steps SET pending_method = ?, pending_secret = ?, code_hash = NULL, code_expires_at = NULL, attempts = 0 WHERE id = ?',
    [method, pending, row.id]);
  if (method === 'EMAIL') return sendCode(app, loadById(app, row.id)!, user);
  return { kind: 'STEP' };
}

export function resendCode(app: App, raw0: string | undefined): StepResult {
  const open = openFor(app, raw0);
  if (open === undefined) return { kind: 'GONE', why: STEP_GONE };
  const method = open.row.step === 'SETUP' ? open.row.pending_method : security(app, open.user.id)?.mfa_method;
  if (method !== 'EMAIL') return { kind: 'STEP' };
  return sendCode(app, open.row, open.user);
}

/** A code: confirming a new second factor (SETUP), or giving the one they have (VERIFY). */
export function submitCode(app: App, raw0: string | undefined, code: string): StepResult {
  const open = openFor(app, raw0);
  if (open === undefined) return { kind: 'GONE', why: STEP_GONE };
  const { row, user } = open;
  if (row.step === 'NEW_PASSWORD') return { kind: 'STEP' };
  const s = security(app, user.id);
  const method = row.step === 'SETUP' ? row.pending_method : s?.mfa_method ?? null;
  if (method === null || s === undefined) return { kind: 'ERROR', why: 'Choose how you would like to get your code.' };
  // PHASE 151k: the app's secret, opened BEFORE a code is counted - a server that cannot open it is not the person's
  // wrong code. A sealed secret with no key, or the wrong key, refuses in words.
  const key = mfaKeyFrom(app.secrets);
  const stored = method === 'APP' ? (row.step === 'SETUP' ? row.pending_secret : s.mfa_secret) : null;
  let secret: string | null = null;
  if (stored !== null) {
    const opened = openSecret(key, user.id, stored);
    if (!opened.ok) {
      app.audit.append({ at: app.now(), kind: 'SIGN_IN_STEP_REFUSED', outcome: 'REFUSED', actor_id: user.id, actor_role: user.role,
        object_type: 'sign_in_step', object_id: row.id, detail: { reason: 'app_secret_not_opened' } });
      return { kind: 'ERROR', why: opened.why };
    }
    secret = opened.secret;
  }
  app.db.run('UPDATE sign_in_steps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
  if (row.attempts + 1 > MAX_WRONG_CODES) {
    finishRow(app, row);
    app.audit.append({ at: app.now(), kind: 'SIGN_IN_STEP_REFUSED', outcome: 'REFUSED', actor_id: user.id, actor_role: user.role,
      object_type: 'sign_in_step', object_id: row.id, detail: { reason: 'too_many_wrong_codes' } });
    return { kind: 'GONE', why: TOO_MANY_CODES };
  }
  const given = code.replace(/\s/g, '');
  const nowMs = Date.parse(app.now());
  let appStep: number | null = null;
  if (method === 'EMAIL') {
    const good = row.code_hash !== null && row.code_expires_at !== null && Date.parse(row.code_expires_at) > nowMs
      && row.code_hash === hashToken(`${row.id}:${given}`);
    if (!good) return { kind: 'ERROR', why: WRONG_CODE };
  } else {
    appStep = secret === null ? null : verifyCode(secret, given, nowMs, row.step === 'SETUP' ? null : s.mfa_last_step);
    if (appStep === null) return { kind: 'ERROR', why: WRONG_CODE };
  }
  if (row.step === 'SETUP') {
    app.db.run('UPDATE users SET mfa_method = ?, mfa_secret = ?, mfa_last_step = ?, updated_at = ? WHERE id = ?',
      [method, method === 'APP' ? row.pending_secret : null, appStep, app.now(), user.id]);
    app.audit.append({ at: app.now(), kind: 'TWO_FACTOR_SET_UP', outcome: 'ALLOWED', actor_id: user.id, actor_role: user.role,
      object_type: 'user', object_id: user.id, detail: { method, purpose: row.purpose } });
  } else if (appStep !== null) {
    app.db.run('UPDATE users SET mfa_last_step = ? WHERE id = ?', [appStep, user.id]);
    // PHASE 151k: a secret kept as text from before a key was set is sealed now, on the one occasion it is in hand.
    if (key.state === 'KEY' && stored !== null && !isSealed(stored) && secret !== null) {
      const sealed = sealSecret(key, user.id, secret);
      if (sealed.ok) app.db.run('UPDATE users SET mfa_secret = ? WHERE id = ?', [sealed.stored, user.id]);
    }
  }
  return advance(app, row, user, { second_factor: method });
}

/* ------------------------------------------------------------------ the person's own account */

/** Set up, or change, the second factor from a signed-in account: the same step, for this person, ending back there. */
export function startAccountSetup(app: App, actor: Actor): string {
  authorise(actor, 'user.change_own_password', { type: 'user', id: actor.id, role: actor.role });
  const user = findById(app.db, actor.id);
  if (user === undefined) throw new AuthError('E_AUTH_FAILED', 'not signed in');
  return openStep(app, user, 'ACCOUNT', 'SETUP');
}

/** A client may switch their second factor off. Staff may not: it is the rule for every staff login. */
export function removeOwnTwoFactor(app: App, actor: Actor): { ok: true } | { ok: false; why: string } {
  authorise(actor, 'user.change_own_password', { type: 'user', id: actor.id, role: actor.role });
  if (actor.role !== 'CLIENT') return { ok: false, why: 'Every staff login needs a second step. You can change it, but not turn it off.' };
  app.db.run('UPDATE users SET mfa_method = NULL, mfa_secret = NULL, mfa_last_step = NULL, updated_at = ? WHERE id = ?', [app.now(), actor.id]);
  app.audit.append({ at: app.now(), kind: 'TWO_FACTOR_REMOVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'user', object_id: actor.id, detail: { by: 'self' } });
  return { ok: true };
}

export function ownTwoFactor(app: App, actor: Actor): Method | null {
  return (app.db.get<{ mfa_method: Method | null }>('SELECT mfa_method FROM users WHERE id = ?', [actor.id])?.mfa_method) ?? null;
}

/* ------------------------------------------------------------------ the super user's part */

const READABLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** Sixteen characters from a set with no look-alikes (no 0/O, 1/l/I), in four groups a person can read out. */
export function temporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let part = '';
    for (let i = 0; i < 4; i++) part += READABLE[randomInt(0, READABLE.length)];
    groups.push(part);
  }
  return groups.join('-');
}

export function temporaryUntil(now: string): string {
  return new Date(Date.parse(now) + TEMPORARY_PASSWORD_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * A NEW TEMPORARY PASSWORD FOR SOMEBODY, from the super user. Their sessions end; they sign in with it and choose
 * their own. Returned once, to be shown once; never stored in clear, never logged.
 */
export async function issueTemporaryPassword(app: App, actor: Actor, user_id: string): Promise<{ password: string; until: string; user: User }> {
  const user = findById(app.db, user_id);
  if (user === undefined) throw new AuthError('E_NO_USER', 'no such user');
  authorise(actor, 'user.update', { type: 'user', id: user.id, role: user.role });
  const password = temporaryPassword();
  const until = temporaryUntil(app.now());
  app.db.run('UPDATE users SET password_hash = ?, password_temporary_until = ?, updated_at = ? WHERE id = ?',
    [await app.hasher.hash(password), until, app.now(), user.id]);
  revokeAllSessions(app.deps, user.id, 'TEMPORARY_PASSWORD');
  app.audit.append({ at: app.now(), kind: 'TEMPORARY_PASSWORD_ISSUED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'user', object_id: user.id, detail: { until } });
  return { password, until, user };
}

/** Clear somebody's second factor, so they set it up again at their next sign-in (a lost phone). Their sessions end. */
export function resetTwoFactor(app: App, actor: Actor, user_id: string): User {
  const user = findById(app.db, user_id);
  if (user === undefined) throw new AuthError('E_NO_USER', 'no such user');
  authorise(actor, 'user.update', { type: 'user', id: user.id, role: user.role });
  app.db.run('UPDATE users SET mfa_method = NULL, mfa_secret = NULL, mfa_last_step = NULL, updated_at = ? WHERE id = ?', [app.now(), user.id]);
  revokeAllSessions(app.deps, user.id, 'TWO_FACTOR_RESET');
  app.audit.append({ at: app.now(), kind: 'TWO_FACTOR_REMOVED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'user', object_id: user.id, detail: { by: 'administrator' } });
  return user;
}

/* ------------------------------------------------------------------ pages */

function masked(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

/**
 * PHASE 151k — WHAT A STEP NEEDS NEXT, ONCE, for the page below and for the JSON API (src/server.ts). Undefined when the
 * token opens no step. `needs` is what the person does now:
 *   CHOOSE_PASSWORD   type a password of their own, twice
 *   CHOOSE_METHOD     choose EMAIL or APP
 *   ADD_APP           add the key to their app (shown here, once, while they set it up), then give a code from it
 *   GIVE_CODE         give the code from their email or their app
 * `refused` is set when the app's secret cannot be opened on this server (src/mfa-seal.ts); it is said in words.
 */
export type StepView = {
  readonly step: SignInStep;
  readonly needs: 'CHOOSE_PASSWORD' | 'CHOOSE_METHOD' | 'ADD_APP' | 'GIVE_CODE';
  /** The method being set up (SETUP), or the one the person has (VERIFY). */
  readonly method: Method | null;
  /** Where an emailed code goes (CHOOSE_METHOD) or went (GIVE_CODE by email), with most of the address hidden. */
  readonly sent_to: string | null;
  /** ADD_APP only: the app's key, and the address a QR code carries. */
  readonly app_key: string | null;
  readonly otpauth_uri: string | null;
  readonly role: User['role'];
  readonly expires_at: string;
  readonly refused: string | null;
};

export function describeStep(app: App, raw0: string | undefined): StepView | undefined {
  const open = openFor(app, raw0);
  if (open === undefined) return undefined;
  const { row, user } = open;
  const base = { step: row.step, role: user.role, expires_at: row.expires_at, sent_to: null, app_key: null, otpauth_uri: null, refused: null };
  if (row.step === 'NEW_PASSWORD') return { ...base, needs: 'CHOOSE_PASSWORD', method: null };
  if (row.step === 'SETUP' && row.pending_method === null) return { ...base, needs: 'CHOOSE_METHOD', method: null, sent_to: masked(user.email) };
  if (row.step === 'SETUP' && row.pending_method === 'APP' && row.pending_secret !== null) {
    const opened = openSecret(mfaKeyFrom(app.secrets), user.id, row.pending_secret);
    if (!opened.ok) return { ...base, needs: 'ADD_APP', method: 'APP', refused: opened.why };
    return { ...base, needs: 'ADD_APP', method: 'APP', app_key: grouped(opened.secret), otpauth_uri: otpauthUri(ISSUER, user.email, opened.secret) };
  }
  const method = row.step === 'SETUP' ? row.pending_method : security(app, user.id)?.mfa_method ?? null;
  return { ...base, needs: 'GIVE_CODE', method, sent_to: method === 'EMAIL' ? masked(user.email) : null };
}

export function stepPage(app: App, raw0: string | undefined, error?: string, note?: string): string | undefined {
  const v = describeStep(app, raw0);
  if (v === undefined) return undefined;
  const why = error ?? v.refused ?? undefined;
  const msg = h`${why !== undefined ? h`<p class="err">${why}</p>` : raw('')}${note !== undefined ? h`<p class="ok">${note}</p>` : raw('')}`;
  const codeForm = (label: string) => h`<form method="post" action="/login/step/code">
      <label class="fl" for="step-code">${label}</label>
      <input class="fi" id="step-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]*" required>
      <button class="cta" type="submit">Continue</button></form>`;
  const resend = h`<form method="post" action="/login/step/resend" class="inline"><button class="linkish" type="submit">Send me a new code</button></form>`;
  const useEmail = h`<form method="post" action="/login/step/method"><input type="hidden" name="method" value="EMAIL">
        <button class="linkish" type="submit">Use an email code instead</button></form>`;
  let body;
  if (v.needs === 'CHOOSE_PASSWORD') {
    body = h`<h1>Choose your own password</h1>${msg}
      <p class="help">You signed in with a temporary password. Choose your own now. Use at least ${MIN_PASSWORD} characters.</p>
      <form method="post" action="/login/step/password">
        <label class="fl" for="step-new">New password</label><input class="fi" id="step-new" type="password" name="password" autocomplete="new-password" required>
        <label class="fl" for="step-again">Type it again</label><input class="fi" id="step-again" type="password" name="again" autocomplete="new-password" required>
        <button class="cta" type="submit">Save my password</button></form>`;
  } else if (v.needs === 'CHOOSE_METHOD') {
    body = h`<h1>Set up your second step</h1>${msg}
      <p class="help">${v.role === 'CLIENT' ? 'A second step keeps your account safe, even if someone learns your password.'
        : 'Every staff login needs a second step. It keeps our clients’ records safe, even if someone learns your password.'}</p>
      <form method="post" action="/login/step/method">
        <label class="fl">How would you like to get your code?</label>
        <div class="opts">
          <label class="opt"><input type="radio" name="method" value="APP" checked> An authenticator app on my phone (safest)</label>
          <label class="opt"><input type="radio" name="method" value="EMAIL"> An email to ${v.sent_to ?? ''}</label>
        </div>
        <button class="cta" type="submit">Continue</button></form>`;
  } else if (v.needs === 'ADD_APP') {
    body = v.app_key === null || v.otpauth_uri === null
      ? h`<h1>Add Cap Rebate to your authenticator app</h1>${msg}${useEmail}`
      : h`<h1>Add Cap Rebate to your authenticator app</h1>${msg}
      <ol class="help"><li>Open your authenticator app. Google Authenticator and Microsoft Authenticator both work.</li>
        <li>Add an account, and scan this code with your phone.</li>
        <li>Type the six numbers your app shows.</li></ol>
      <div class="qr">${raw(renderSVG(v.otpauth_uri))}</div>
      <p class="help">Cannot scan it? Type this key into the app instead: <strong><code>${v.app_key}</code></strong></p>
      ${codeForm('The six numbers from your app')}
      ${useEmail}`;
  } else {
    const byEmail = v.method === 'EMAIL';
    body = h`<h1>${v.step === 'SETUP' ? 'Check your email' : 'Your second step'}</h1>${msg}
      <p class="help">${byEmail ? `We sent a six-number code to ${v.sent_to ?? ''}. It works for 10 minutes.`
        : 'Open your authenticator app and type the six numbers it shows for Cap Rebate.'}</p>
      ${codeForm(byEmail ? 'The code from the email' : 'The six numbers from your app')}
      ${byEmail ? resend : raw('')}
      ${byEmail ? raw('') : h`<p class="help">Lost your phone? Ask your administrator to reset your second step.</p>`}`;
  }
  return page({ title: 'Sign in', body: h`${body}<p class="help"><a href="/login">Start again</a></p>` });
}
