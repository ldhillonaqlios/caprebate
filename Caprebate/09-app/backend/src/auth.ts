/**
 * Authentication: login, sessions, logout, password change, password reset.
 *
 * THE RULES THIS FILE EXISTS TO KEEP, each of which has a test:
 *
 *   A password is never logged, never returned, never stored in clear.
 *   Sessions are httpOnly, secure, sameSite, ROTATED ON PRIVILEGE CHANGE, and
 *     revocable server-side — which is real revocation, not an expiry wish.
 *   Login and reset are rate-limited.
 *   FAILURE MESSAGES ARE GENERIC. "those details did not match", never "no such
 *     user" — the second is an account-enumeration oracle, and so is a login
 *     that returns faster for an unknown address than for a wrong password.
 *   A reset token is single-use and expiring, and only its HASH is stored.
 *   PHASE 151j: A PASSWORD ALONE NEVER OPENS A STAFF ACCOUNT. `login` issues a session only when nothing is left to
 *     do; a temporary password, or a second factor to set up or give, is a step, and `login` refuses with
 *     E_SECOND_STEP rather than skip it. The steps are walked only by src/web/sign-in.ts - by the website and, since
 *     Phase 151k, by the JSON API's /api/login and /api/login/step routes (src/server.ts), on the same functions.
 */

import { randomBytes } from 'node:crypto';
import type { Db } from './db.ts';
import type { AuditLog } from './audit.ts';
import type { PasswordHasher } from './password.ts';
import type { User } from './users.ts';
import { findByEmailWithSecret, findById, hashToken, newId, setPasswordHash, toActor } from './users.ts';

/** The ONE message every authentication failure returns. */
export const GENERIC_AUTH_FAILURE = 'those details did not match';

export class AuthError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export type SessionCookie = {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'Strict';
  readonly path: '/';
  readonly expires: string;
};

export const SESSION_COOKIE_NAME = 'cb_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;

/**
 * PHASE 151j — WHO MUST GIVE A SECOND FACTOR. Lakhbir, 28 September 2026: every staff login; a client may choose to.
 *   STAFF   the rule, and the default: a staff login with no second factor set up must set one up at sign-in.
 *   OFF     no second step for anyone, and a temporary password is not asked to change - the setting the older
 *           test files pass, each saying so, because they test other things through a password sign-in. Never set
 *           in src/, api/ or a tool a person runs to use the system.
 *   STAFF_EXCEPT_INVENTED   (29 September 2026, Lakhbir: "stop it for the @example.invalid emails") STAFF for every
 *           login, except that one whose address is at the reserved domain example.invalid asks for no second step.
 *           That domain can never receive mail (RFC 2606), so only the invented seed logins carry it. Set by the test
 *           website ONLY (api/index.mjs), never by default and never for production. A temporary password is still
 *           asked to change.
 */
export type TwoFactorPolicy = 'STAFF' | 'OFF' | 'STAFF_EXCEPT_INVENTED';

/** The reserved domain the invented seed logins use. Matched on the whole domain, in any case. */
export const INVENTED_DOMAIN = 'example.invalid';
export function isInventedLogin(email: string): boolean {
  const at = email.trim().toLowerCase().lastIndexOf('@');
  return at > 0 && email.trim().toLowerCase().slice(at + 1) === INVENTED_DOMAIN;
}

export type Deps = {
  db: Db;
  audit: AuditLog;
  hasher: PasswordHasher;
  now: () => string;
  /** PHASE 151j. Absent is STAFF: the safe reading of a Deps built by hand. */
  twoFactor?: TwoFactorPolicy;
  /** Injected so a test can make a token predictable without weakening the real one. */
  randomToken?: () => string;
};

function token(d: Deps): string {
  return (d.randomToken ?? (() => randomBytes(32).toString('hex')))();
}

function cookieFor(value: string, expires: string): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME, value,
    httpOnly: true, secure: true, sameSite: 'Strict', path: '/', expires,
  };
}

/* ------------------------------------------------------------------ *
 * Rate limiting — fixed window, counted in the database so it survives a
 * restart and so two processes cannot each grant a full allowance.
 * ------------------------------------------------------------------ */

export const LOGIN_LIMIT = 5;
export const RESET_LIMIT = 3;
const WINDOW_MS = 15 * 60 * 1000;

function windowStart(nowIso: string): string {
  const t = Date.parse(nowIso);
  return new Date(t - (t % WINDOW_MS)).toISOString();
}

export function rateLimit(d: Deps, bucket: string, limit: number): boolean {
  const w = windowStart(d.now());
  d.db.run(
    'INSERT INTO rate_limit_hits (bucket, window_start, hits) VALUES (?, ?, 1) ' +
      'ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1',
    [bucket, w],
  );
  const row = d.db.get<{ hits: number }>(
    'SELECT hits FROM rate_limit_hits WHERE bucket = ? AND window_start = ?', [bucket, w],
  );
  return (row?.hits ?? 0) <= limit;
}

/* ------------------------------------------------------------------ *
 * Login
 * ------------------------------------------------------------------ */

export type LoginResult = { user: User; cookie: SessionCookie; session_id: string };

export async function login(d: Deps, email: string, password: string): Promise<LoginResult> {
  const found = await verifyPassword(d, email, password);
  // PHASE 151j: a password alone never skips a step. Only src/web/sign-in.ts walks them (the website and the JSON API).
  const step = nextSignInStep(d, found.id);
  if (step !== null) {
    d.audit.append({
      at: d.now(), kind: 'SIGN_IN_STEP_REFUSED', outcome: 'REFUSED', actor_id: found.id, actor_role: found.role,
      detail: { step, where: 'login' },
    });
    throw new AuthError('E_SECOND_STEP', SECOND_STEP_NEEDED);
  }
  return startSession(d, found, {});
}

/** What a caller that cannot walk the steps is told, once the password was right. */
export const SECOND_STEP_NEEDED = 'Sign in on the website: this account has another step to finish first.';

/**
 * The session, once every step is done. Only `login` and src/web/sign-in.ts call it, and the latter only at the end
 * of a finished step.
 */
export function startSession(d: Deps, user: User, detail: Record<string, unknown>): LoginResult {
  const { cookie, session_id } = issueSession(d, user.id);
  d.audit.append({
    at: d.now(), kind: 'LOGIN_SUCCEEDED', outcome: 'ALLOWED',
    actor_id: user.id, actor_role: user.role,
    object_type: 'session', object_id: session_id, detail,
  });
  return { user, cookie, session_id };
}

/**
 * PHASE 151j — WHAT IS STILL TO DO BEFORE A SESSION, for a person whose password was right.
 *   NEW_PASSWORD   their password is a temporary one the super user gave them
 *   SETUP          they must give a second factor and have none set up (every staff login, under STAFF)
 *   VERIFY         they have one: an emailed code, or their authenticator app
 *   null           nothing: a session may be issued
 * A temporary password past its date is refused outright, with its own words: the password was right, so this
 * answers nothing about who has an account.
 */
export type SignInStep = 'NEW_PASSWORD' | 'SETUP' | 'VERIFY';
export const TEMPORARY_PASSWORD_EXPIRED = 'Your temporary password has expired. Ask your administrator for a new one.';

export function nextSignInStep(d: Deps, user_id: string): SignInStep | null {
  const r = d.db.get<{ role: string; password_temporary_until: string | null; mfa_method: string | null; email: string }>(
    'SELECT role, password_temporary_until, mfa_method, email FROM users WHERE id = ?', [user_id]);
  if (r === undefined) throw new AuthError('E_AUTH_FAILED', GENERIC_AUTH_FAILURE);
  if ((d.twoFactor ?? 'STAFF') === 'OFF') return null;
  if (r.password_temporary_until !== null) {
    if (Date.parse(r.password_temporary_until) <= Date.parse(d.now())) {
      throw new AuthError('E_TEMPORARY_EXPIRED', TEMPORARY_PASSWORD_EXPIRED);
    }
    return 'NEW_PASSWORD';
  }
  if (d.twoFactor === 'STAFF_EXCEPT_INVENTED' && isInventedLogin(r.email)) return null;
  if (r.mfa_method !== null) return 'VERIFY';
  return r.role === 'CLIENT' ? null : 'SETUP';
}

/**
 * The password, checked: rate-limited, the same time for an unknown address, the one generic failure, and a weak
 * stored hash upgraded. It issues NOTHING — a session comes from `login` or from the steps.
 */
export async function verifyPassword(d: Deps, email: string, password: string): Promise<User> {
  // The bucket is the email, which IS personal data — so it is HASHED before it
  // becomes a key, and the key never reaches a log line.
  const bucket = 'login:' + hashToken(email.trim().toLowerCase());
  if (!rateLimit(d, bucket, LOGIN_LIMIT)) {
    d.audit.append({ at: d.now(), kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'login' } });
    throw new AuthError('E_RATE_LIMITED', GENERIC_AUTH_FAILURE);
  }

  const found = findByEmailWithSecret(d.db, email);

  // TIMING. An unknown address still pays for a verification, so the response
  // time does not answer "does this account exist". The dummy hash is a real
  // argon2id string, so the work done is the same work.
  const stored = found?.password_hash ?? DUMMY_HASH;
  const ok = await d.hasher.verify(stored, password);

  if (found === undefined || !ok || found.disabled) {
    d.audit.append({
      at: d.now(), kind: 'LOGIN_FAILED', outcome: 'REFUSED',
      actor_id: found?.id ?? null, actor_role: found?.role ?? null,
      // WHY it failed is not recorded against the account: it would turn the
      // audit log into the enumeration oracle the message avoids being.
      detail: { reason: 'credentials_or_state' },
    });
    throw new AuthError('E_AUTH_FAILED', GENERIC_AUTH_FAILURE);
  }

  // A weak stored hash is upgraded on the one occasion the plaintext is in hand.
  if (d.hasher.needsRehash(found.password_hash)) {
    setPasswordHash(d.db, d.now, found.id, await d.hasher.hash(password));
  }

  const { password_hash: _drop, ...user } = found;
  void _drop;
  return user;
}

/**
 * A real argon2id hash of a value nobody holds. Generated once at load so the
 * verify path for an unknown address costs the same as for a known one.
 */
let DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export async function primeTimingDefence(hasher: PasswordHasher): Promise<void> {
  DUMMY_HASH = await hasher.hash(randomBytes(24).toString('hex'));
}

function issueSession(d: Deps, user_id: string, rotated_from?: string): { cookie: SessionCookie; session_id: string } {
  const raw = token(d);
  const id = newId();
  const created = d.now();
  const expires = new Date(Date.parse(created) + SESSION_TTL_MS).toISOString();
  d.db.run(
    'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at, revoked_at, revoked_reason, rotated_from) ' +
      'VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)',
    [id, user_id, hashToken(raw), created, expires, created, rotated_from ?? null],
  );
  return { cookie: cookieFor(raw, expires), session_id: id };
}

/* ------------------------------------------------------------------ *
 * Reading a session back
 * ------------------------------------------------------------------ */

export type Authenticated = { user: User; session_id: string };

/** Faster clicks 2: how often a session's "last seen" is written, at most. */
export const LAST_SEEN_EVERY_MS = 60_000;

/** Returns undefined for absent, unknown, expired, revoked, or disabled-owner. */
export function authenticate(d: Deps, rawToken: string | undefined): Authenticated | undefined {
  if (rawToken === undefined || rawToken === '') return undefined;
  const row = d.db.get<{ id: string; user_id: string; expires_at: string; revoked_at: string | null; last_seen_at: string | null }>(
    'SELECT id, user_id, expires_at, revoked_at, last_seen_at FROM sessions WHERE token_hash = ?',
    [hashToken(rawToken)],
  );
  if (row === undefined) return undefined;
  if (row.revoked_at !== null) return undefined;
  if (Date.parse(row.expires_at) <= Date.parse(d.now())) return undefined;

  const user = findById(d.db, row.user_id);
  if (user === undefined || user.disabled) return undefined;

  // FASTER CLICKS 2, 3 October 2026: "last seen" is written at most once a minute, not twice a click (the server and the
  // page router each check the session). On the test website a write is a trip to the lasting database's primary, and
  // it made the click forget every read it had (src/db.ts withReadMemo). Only Admin's Home reads it — "working now" is
  // seen in the last 30 minutes, "last signed in" is to the minute — so a minute's grain changes nothing shown. Expiry
  // never reads it: a session ends at `expires_at` or when revoked, as before.
  const now = d.now();
  if (row.last_seen_at === null || Date.parse(now) - Date.parse(row.last_seen_at) >= LAST_SEEN_EVERY_MS) {
    d.db.run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [now, row.id]);
  }
  return { user, session_id: row.id };
}

export function logout(d: Deps, session_id: string, actor: User): void {
  d.db.run(
    'UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL',
    [d.now(), 'LOGOUT', session_id],
  );
  d.audit.append({
    at: d.now(), kind: 'LOGOUT', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role, object_type: 'session', object_id: session_id, detail: {},
  });
}

export function revokeAllSessions(d: Deps, user_id: string, reason: string): number {
  const r = d.db.run(
    'UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL',
    [d.now(), reason, user_id],
  );
  d.audit.append({
    at: d.now(), kind: 'SESSION_REVOKED', outcome: 'ALLOWED',
    actor_id: user_id, object_type: 'session', detail: { reason, count: r.changes },
  });
  return r.changes;
}

/**
 * ROTATION ON PRIVILEGE CHANGE. The old session is revoked and a new one issued
 * carrying `rotated_from`, so the rotation is evidence rather than an assertion
 * in a comment. Call this whenever a role changes or a password changes.
 */
export function rotateSession(d: Deps, old_session_id: string, user_id: string): { cookie: SessionCookie; session_id: string } {
  d.db.run(
    'UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL',
    [d.now(), 'PRIVILEGE_CHANGE', old_session_id],
  );
  const issued = issueSession(d, user_id, old_session_id);
  d.audit.append({
    at: d.now(), kind: 'SESSION_ROTATED', outcome: 'ALLOWED',
    actor_id: user_id, object_type: 'session', object_id: issued.session_id,
    detail: { rotated_from: old_session_id },
  });
  return issued;
}

/* ------------------------------------------------------------------ *
 * Password change and reset
 * ------------------------------------------------------------------ */

export async function changeOwnPassword(
  d: Deps, actor: User, session_id: string, current: string, next: string,
): Promise<{ cookie: SessionCookie; session_id: string }> {
  const withSecret = findByEmailWithSecret(d.db, actor.email);
  if (withSecret === undefined || !(await d.hasher.verify(withSecret.password_hash, current))) {
    throw new AuthError('E_AUTH_FAILED', GENERIC_AUTH_FAILURE);
  }
  setPasswordHash(d.db, d.now, actor.id, await d.hasher.hash(next));
  d.audit.append({
    at: d.now(), kind: 'PASSWORD_CHANGED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role, detail: {},
  });
  // A password change is a privilege change.
  return rotateSession(d, session_id, actor.id);
}

/**
 * Requests a reset. ALWAYS reports the same thing to the caller, whether or not
 * the address is known — the response must not be an enumeration oracle either.
 * Returns the plaintext token ONLY so the caller can hand it to the email
 * transport; it is never returned to a browser and never stored in clear.
 */
export function requestPasswordReset(
  d: Deps, email: string,
): { accepted: true; user?: User; plaintextToken?: string } {
  const bucket = 'reset:' + hashToken(email.trim().toLowerCase());
  if (!rateLimit(d, bucket, RESET_LIMIT)) {
    d.audit.append({ at: d.now(), kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'password_reset' } });
    return { accepted: true }; // still generic
  }

  const found = findByEmailWithSecret(d.db, email);
  if (found === undefined || found.disabled) {
    d.audit.append({
      at: d.now(), kind: 'PASSWORD_RESET_REQUESTED', outcome: 'REFUSED',
      detail: { reason: 'no_active_account' },
    });
    return { accepted: true };
  }

  const raw = token(d);
  const created = d.now();
  d.db.run(
    'INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at, used_at) ' +
      'VALUES (?, ?, ?, ?, ?, NULL)',
    [newId(), found.id, hashToken(raw), created, new Date(Date.parse(created) + RESET_TTL_MS).toISOString()],
  );
  d.audit.append({
    at: d.now(), kind: 'PASSWORD_RESET_REQUESTED', outcome: 'ALLOWED',
    actor_id: found.id, actor_role: found.role, detail: {},
  });
  const { password_hash: _drop, ...user } = found;
  void _drop;
  return { accepted: true, user, plaintextToken: raw };
}

/** Single-use and expiring. Consuming it revokes every session the user held. */
export async function completePasswordReset(d: Deps, rawToken: string, next: string): Promise<void> {
  const row = d.db.get<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?',
    [hashToken(rawToken)],
  );
  if (row === undefined || row.used_at !== null || Date.parse(row.expires_at) <= Date.parse(d.now())) {
    throw new AuthError('E_BAD_TOKEN', 'that reset link is no longer valid');
  }
  const hash = await d.hasher.hash(next);
  d.db.tx(() => {
    d.db.run('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', [d.now(), row.id]);
    setPasswordHash(d.db, d.now, row.user_id, hash);
    // PHASE 151j: a password the person chose replaces a temporary one. The second factor stays as it was.
    d.db.run('UPDATE users SET password_temporary_until = NULL WHERE id = ?', [row.user_id]);
  });
  revokeAllSessions(d, row.user_id, 'PASSWORD_RESET');
  d.audit.append({
    at: d.now(), kind: 'PASSWORD_RESET_COMPLETED', outcome: 'ALLOWED',
    actor_id: row.user_id, detail: {},
  });
}

export { toActor };
