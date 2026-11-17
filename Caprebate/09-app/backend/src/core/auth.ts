/**
 * Authentication: login, sessions, logout, password change, password reset.
 *
 * THE RULES THIS FILE EXISTS TO KEEP, each of which has a test:
 *
 *   A password is never logged, never returned, never stored in clear.
 *   Sessions are httpOnly, secure, SameSite=Lax, ROTATED ON PRIVILEGE CHANGE, and
 *     revocable server-side — which is real revocation, not an expiry wish. A password change ends every one of the
 *     person's sessions (Phase 161n1b, ITRoadway M-06), and a session left idle ends (L-03).
 *   Login and reset are rate-limited, by email AND network address together, so nobody can lock another person out
 *     from their own address (M-02); a right password with a second step to give is never held back by them.
 *   FAILURE MESSAGES ARE GENERIC. "those details did not match", never "no such
 *     user" — the second is an account-enumeration oracle, and so is a login
 *     that returns faster for an unknown address than for a wrong password.
 *   A reset token is single-use and expiring, and only its HASH is stored.
 *   A PASSWORD ALONE NEVER OPENS A STAFF ACCOUNT. `login` issues a session only when nothing is left to
 *     do; a temporary password, or a second factor to set up or give, is a step, and `login` refuses with
 *     E_SECOND_STEP rather than skip it. The steps are walked only by src/core/sign-in.ts - by the website and, since
 *     By the JSON API's /api/login and /api/login/step routes (src/app/server.ts), on the same functions.
 */

import { randomBytes } from 'node:crypto';
import type { Db } from './db.ts';
import type { AuditLog } from './audit.ts';
import type { PasswordHasher } from './password.ts';
import type { User } from './users.ts';
import { findByEmailWithSecret, findById, hashToken, newId, setPasswordHash, toActor } from './users.ts';
import { getPasswordResetTokensIdUserIdByTokenHash, getRateLimitHitsHitsByBucketWindowStart, getSessionsIdUserIdByTokenHash, getSessionsRevokedReasonRoleByTokenHash, getUsersRolePasswordTemporaryUntilById, insertPasswordResetTokens, insertRateLimitHits, insertSessions, listUsersIdEmailCanonicalByRoleAdminOpen, updatePasswordResetTokensUsedAtByIdUnused, updatePasswordResetTokensUsedAtByUserIdUnused, updateSessionsLastSeenAtById, updateSessionsRevokedAtRevokedReasonByIdRevokedAt, updateSessionsRevokedAtRevokedReasonByUserIdOthers, updateSessionsRevokedAtRevokedReasonByUserIdRevokedAt, updateUsersPasswordTemporaryUntilById2 } from './data.ts';

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

/**
 * THE SESSION COOKIE. SameSite=Lax, which is what src/core/http.ts writes (ITRoadway's second review, L-02: this type said
 * Strict while the header said Lax). Lax on purpose (Lakhbir's reply, 16 Nov 2026): a link in one of our emails opens
 * the portal signed in. Lax sends the cookie on a top-level GET from another site and on nothing else, so the rule that
 * goes with it is that NO GET CHANGES DATA (test/core/sign-in-and-sessions.test.ts crawls every page to prove it); a
 * POST from another site is refused twice over, by the form tokens and by Sec-Fetch-Site (src/app/router.ts).
 */
export type SessionCookie = {
  readonly name: string;
  readonly value: string;
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'Lax';
  readonly path: '/';
  readonly expires: string;
};

export const SESSION_COOKIE_NAME = 'cb_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
/**
 * HOW LONG A SESSION MAY SIT UNUSED (ITRoadway's second review, L-03; the limits Lakhbir put to them on 16 Nov 2026):
 * 30 minutes for staff, 2 hours for a client. Past it the session is ended (reason IDLE) and the login page says why.
 * `last_seen_at` is written at most once a minute (LAST_SEEN_EVERY_MS), so the limit is right to the minute. The 8 hours
 * from sign-in still ends every session, however busy.
 */
export const IDLE_STAFF_MS = 30 * 60 * 1000;
export const IDLE_CLIENT_MS = 2 * 60 * 60 * 1000;
export function idleLimitMs(role: string): number {
  return role === 'CLIENT' ? IDLE_CLIENT_MS : IDLE_STAFF_MS;
}
const RESET_TTL_MS = 30 * 60 * 1000;

/**
 * WHO MUST GIVE A SECOND FACTOR. The owner: every staff login; a client may choose to.
 *   STAFF   the rule, and the default: a staff login with no second factor set up must set one up at sign-in.
 *   OFF     no second step for anyone, and a temporary password is not asked to change - the setting the older
 *           test files pass, each saying so, because they test other things through a password sign-in. Never set
 *           in src/, api/ or a tool a person runs to use the system.
 * There was a third, STAFF_EXCEPT_INVENTED (29 Sep 2026 to 16 Nov 2026): the test website let the invented
 * @example.invalid logins skip the second step. ITRoadway's second review (H-01) found that, with one shared password,
 * it gave Admin to anyone who learned the password. Phase 161n1a took it out: the test website is STAFF, like the live.
 */
export type TwoFactorPolicy = 'STAFF' | 'OFF';

/** The reserved domain the invented seed logins use. Matched on the whole domain, in any case. Since Phase 161n1a
 *  the test website uses it to lock those logins (api/index.mjs, lockSeedLogins): they cannot sign in there. */
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
  /** Absent is STAFF: the safe reading of a Deps built by hand. */
  twoFactor?: TwoFactorPolicy;
  /** Injected so a test can make a token predictable without weakening the real one. */
  randomToken?: () => string;
  /**
   * An email to one person, for the sign-in's own alerts (Phase 161n1b: many tries at one login). Given by
   * src/app/build-app.ts from the outbox; absent, the audit row is still written.
   */
  alert?: (to_email: string, subject: string, text: string) => void;
};

function token(d: Deps): string {
  return (d.randomToken ?? (() => randomBytes(32).toString('hex')))();
}

function cookieFor(value: string, expires: string): SessionCookie {
  return {
    name: SESSION_COOKIE_NAME, value,
    httpOnly: true, secure: true, sameSite: 'Lax', path: '/', expires,
  };
}

/* ------------------------------------------------------------------ *
 * Rate limiting — fixed window, counted in the database so it survives a
 * restart and so two processes cannot each grant a full allowance.
 * ------------------------------------------------------------------ */

/**
 * WRONG TRIES AT ONE LOGIN FROM ONE NETWORK ADDRESS (ITRoadway's second review, M-02). It was per email alone, so
 * anybody who knew a staff address could keep that person out with five wrong passwords every 15 minutes. It is now
 * the email AND the address together: a stranger's tries slow the stranger, never the person.
 */
export const LOGIN_LIMIT = 5;
/**
 * MANY TRIES AT ONE LOGIN FROM ANYWHERE, in an hour: it refuses nothing. Past it an audit row is written and every
 * Admin is emailed, once an hour, so a spread-out attack on one login is seen.
 */
export const LOGIN_EMAIL_ALERT = 50;
const ALERT_WINDOW_MS = 60 * 60 * 1000;
export const RESET_LIMIT = 3;
/**
 * FROM ONE NETWORK ADDRESS, as well as per email. The stress test sent 100 wrong sign-ins
 * on 100 different addresses from one machine and none was slowed (one password tried on many logins). These count
 * every try from one address in the window, whatever the email; an office of a dozen people signing in is far below.
 */
export const LOGIN_SOURCE_LIMIT = 30;
export const RESET_SOURCE_LIMIT = 10;
/**
 * THE PUBLIC FORMS, FROM ONE NETWORK ADDRESS (Phase 161n1c, ITRoadway M-04): the website's enquiry form, the
 * assessment's submit and a client's sign-up, in the same 15-minute window. Here, in the core, because three areas use
 * them (public-site, assessment), and neither may import the other.
 */
export const ENQUIRY_SOURCE_LIMIT = 10;
export const ASSESSMENT_SOURCE_LIMIT = 10;
export const SIGNUP_SOURCE_LIMIT = 10;
/** Too many from one place: what the form, the assessment and sign-up say. */
export const FROM_ONE_PLACE = 'We have had a lot of these from where you are in a short time, so this one was not sent. Please wait a few minutes, or email contact@caprebate.co.uk.';
const WINDOW_MS = 15 * 60 * 1000;

function windowStart(nowIso: string, windowMs: number = WINDOW_MS): string {
  const t = Date.parse(nowIso);
  return new Date(t - (t % windowMs)).toISOString();
}

/** One more hit on a bucket in this window; how many there now are. */
function countHit(d: Deps, bucket: string, windowMs: number = WINDOW_MS): number {
  const w = windowStart(d.now(), windowMs);
  insertRateLimitHits(d.db, [bucket, w]);
  return getRateLimitHitsHitsByBucketWindowStart<{ hits: number }>(d.db, [bucket, w])?.hits ?? 0;
}

export function rateLimit(d: Deps, bucket: string, limit: number): boolean {
  return countHit(d, bucket) <= limit;
}

/** The same, counted over a window of its own (Phase 161n1c: the enquiry emails, an hour). */
export function rateLimitOver(d: Deps, bucket: string, limit: number, windowMs: number): boolean {
  return countHit(d, bucket, windowMs) <= limit;
}

/* ------------------------------------------------------------------ *
 * Login
 * ------------------------------------------------------------------ */

export type LoginResult = { user: User; cookie: SessionCookie; session_id: string };

export async function login(d: Deps, email: string, password: string): Promise<LoginResult> {
  const found = await verifyPassword(d, email, password);
  // A password alone never skips a step. Only src/core/sign-in.ts walks them (the website and the JSON API).
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
 * The session, once every step is done. Only `login` and src/core/sign-in.ts call it, and the latter only at the end
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
 * WHAT IS STILL TO DO BEFORE A SESSION, for a person whose password was right.
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
  const r = getUsersRolePasswordTemporaryUntilById<{ role: string; password_temporary_until: string | null; mfa_method: string | null; email: string }>(d.db, [user_id]);
  if (r === undefined) throw new AuthError('E_AUTH_FAILED', GENERIC_AUTH_FAILURE);
  if ((d.twoFactor ?? 'STAFF') === 'OFF') return null;
  if (r.password_temporary_until !== null) {
    if (Date.parse(r.password_temporary_until) <= Date.parse(d.now())) {
      throw new AuthError('E_TEMPORARY_EXPIRED', TEMPORARY_PASSWORD_EXPIRED);
    }
    return 'NEW_PASSWORD';
  }
  if (r.mfa_method !== null) return 'VERIFY';
  return r.role === 'CLIENT' ? null : 'SETUP';
}

/**
 * The password, checked: rate-limited, the same time for an unknown address, the one generic failure, and a weak
 * stored hash upgraded. It issues NOTHING — a session comes from `login` or from the steps.
 *
 * THE LIMITS (Phase 161n1b, ITRoadway M-02), both counted before the password is read:
 *   from one network address, whatever the email (LOGIN_SOURCE_LIMIT, 30 in 15 minutes): past it every try from that
 *     address is refused at once, unread, as before. It is the address's own tries that count, so it slows only the
 *     one trying, and it caps the password checks one address can make the server do;
 *   one email from one address (LOGIN_LIMIT, 5): past it a wrong password is refused as ever, and so is a right one,
 *     UNLESS the account has a second step to give (an app or an email code) under a policy that asks for it: then the
 *     right password goes on to that step, which has its own five wrong codes. The second step is what stops
 *     guessing. An account with no second step (a client who chose none) stays held back, because its password alone
 *     would open it. From any other address the person signs in as ever: a stranger's tries never lock them out.
 * And one email from anywhere is counted by the hour (LOGIN_EMAIL_ALERT): past it, an audit row and an email to every
 * Admin, and nothing refused.
 */
export async function verifyPassword(d: Deps, email: string, password: string, source?: string): Promise<User> {
  const canonical = email.trim().toLowerCase();
  // The network address and the email are personal data, so they are HASHED before they become keys, and no key or
  // address reaches a log line. An absent source is not counted on its own, and is one address for the pair.
  const burst = countHit(d, 'login-email:' + hashToken(canonical), ALERT_WINDOW_MS) === LOGIN_EMAIL_ALERT + 1;
  if (source !== undefined && countHit(d, 'login-from:' + hashToken(source)) > LOGIN_SOURCE_LIMIT) {
    if (burst) alertBurst(d, findByEmailWithSecret(d.db, email));
    d.audit.append({ at: d.now(), kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'login_from_one_address' } });
    throw new AuthError('E_RATE_LIMITED', GENERIC_AUTH_FAILURE);
  }
  const overPair = countHit(d, 'login:' + hashToken(canonical + '|' + (source ?? ''))) > LOGIN_LIMIT;

  const found = findByEmailWithSecret(d.db, email);
  if (burst) alertBurst(d, found);

  // TIMING. An unknown address still pays for a verification, so the response
  // time does not answer "does this account exist". The dummy hash is a real
  // argon2id string, so the work done is the same work. Past the pair limit too: the answer must not say which.
  const stored = found?.password_hash ?? DUMMY_HASH;
  const ok = await d.hasher.verify(stored, password);
  const limited = (): AuthError => {
    d.audit.append({ at: d.now(), kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'login' } });
    return new AuthError('E_RATE_LIMITED', GENERIC_AUTH_FAILURE);
  };

  if (found === undefined || !ok || found.disabled) {
    if (overPair) throw limited();
    d.audit.append({
      at: d.now(), kind: 'LOGIN_FAILED', outcome: 'REFUSED',
      actor_id: found?.id ?? null, actor_role: found?.role ?? null,
      // WHY it failed is not recorded against the account: it would turn the
      // audit log into the enumeration oracle the message avoids being.
      detail: { reason: 'credentials_or_state' },
    });
    throw new AuthError('E_AUTH_FAILED', GENERIC_AUTH_FAILURE);
  }
  if (overPair) {
    if (!hasSecondStepToGive(d, found.id)) throw limited();
    d.audit.append({ at: d.now(), kind: 'RATE_LIMITED', outcome: 'ALLOWED', actor_id: found.id, actor_role: found.role,
      detail: { what: 'login', passed_to: 'second_step' } });
  }

  // A weak stored hash is upgraded on the one occasion the plaintext is in hand.
  if (d.hasher.needsRehash(found.password_hash)) {
    setPasswordHash(d.db, d.now, found.id, await d.hasher.hash(password));
  }

  const { password_hash: _drop, ...user } = found;
  void _drop;
  return user;
}

/** Whether a right password still leaves this person a second step to give: one set up, under a policy that asks. */
function hasSecondStepToGive(d: Deps, user_id: string): boolean {
  if ((d.twoFactor ?? 'STAFF') === 'OFF') return false;
  const r = getUsersRolePasswordTemporaryUntilById<{ mfa_method: string | null }>(d.db, [user_id]);
  return r !== undefined && r.mfa_method !== null;
}

/** What every Admin is emailed when one login has had more than LOGIN_EMAIL_ALERT tries in an hour. */
export const SIGN_IN_BURST_SUBJECT = 'Many sign-in tries at one login';
export function signInBurstText(login: string): string {
  return `There have been more than ${String(LOGIN_EMAIL_ALERT)} tries to sign in to ${login} in the last hour.\n\n` +
    'Nobody has been locked out: a right password and a right second step still sign in. If this was not the person ' +
    'themselves, someone may be guessing their password. You can see the tries in the Audit log. ' +
    'If you are worried, ask them to change their password and use "Sign out of all other devices".';
}

function alertBurst(d: Deps, found: User | undefined): void {
  d.audit.append({ at: d.now(), kind: 'SIGN_IN_BURST', outcome: 'ALLOWED', actor_id: found?.id ?? null, actor_role: found?.role ?? null,
    detail: { tries_over: LOGIN_EMAIL_ALERT, known_login: found !== undefined } });
  // Only a real login is named to the Admins; an address with no account has nothing to protect.
  if (found === undefined || d.alert === undefined) return;
  for (const a of listUsersIdEmailCanonicalByRoleAdminOpen<{ id: string; email_canonical: string }>(d.db)) {
    d.alert(a.email_canonical, SIGN_IN_BURST_SUBJECT, signInBurstText(found.email));
  }
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
  insertSessions(d.db, [id, user_id, hashToken(raw), created, expires, created, rotated_from ?? null]);
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
  const row = getSessionsIdUserIdByTokenHash<{ id: string; user_id: string; expires_at: string; revoked_at: string | null; last_seen_at: string | null }>(d.db, [hashToken(rawToken)]);
  if (row === undefined) return undefined;
  if (row.revoked_at !== null) return undefined;
  if (Date.parse(row.expires_at) <= Date.parse(d.now())) return undefined;

  const user = findById(d.db, row.user_id);
  if (user === undefined || user.disabled) return undefined;

  // L-03: a session left unused past its limit ends here, for good (reason IDLE), and the login page says why.
  const now = d.now();
  if (row.last_seen_at !== null && Date.parse(now) - Date.parse(row.last_seen_at) >= idleLimitMs(user.role)) {
    updateSessionsRevokedAtRevokedReasonByIdRevokedAt(d.db, [now, 'IDLE', row.id]);
    d.audit.append({ at: now, kind: 'SESSION_REVOKED', outcome: 'ALLOWED', actor_id: user.id, actor_role: user.role,
      object_type: 'session', object_id: row.id, detail: { reason: 'IDLE', count: 1 } });
    return undefined;
  }

  // FASTER CLICKS 2: "last seen" is written at most once a minute, not twice a click (the server and the
  // page router each check the session). On the test website a write is a trip to the lasting database's primary, and
  // it made the click forget every read it had (src/core/db.ts withReadMemo). Only Admin's Home reads it — "working now" is
  // seen in the last 30 minutes, "last signed in" is to the minute — so a minute's grain changes nothing shown. The idle
  // limit above reads it too (Phase 161n1b), to the same minute; the 8-hour expiry does not.
  if (row.last_seen_at === null || Date.parse(now) - Date.parse(row.last_seen_at) >= LAST_SEEN_EVERY_MS) {
    updateSessionsLastSeenAtById(d.db, [now, row.id]);
  }
  return { user, session_id: row.id };
}

/**
 * WHY THE SESSION IN A BROWSER'S HAND ENDED, when it ended for being left idle: the person's role, so the login page
 * can say how long. Anything else (signed out, expired, unknown, still live) is undefined.
 */
export function endedIdle(d: Deps, rawToken: string | undefined): { role: string } | undefined {
  if (rawToken === undefined || rawToken === '') return undefined;
  const r = getSessionsRevokedReasonRoleByTokenHash<{ revoked_reason: string | null; role: string }>(d.db, [hashToken(rawToken)]);
  return r !== undefined && r.revoked_reason === 'IDLE' ? { role: r.role } : undefined;
}

export function logout(d: Deps, session_id: string, actor: User): void {
  updateSessionsRevokedAtRevokedReasonByIdRevokedAt(d.db, [d.now(), 'LOGOUT', session_id]);
  d.audit.append({
    at: d.now(), kind: 'LOGOUT', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role, object_type: 'session', object_id: session_id, detail: {},
  });
}

export function revokeAllSessions(d: Deps, user_id: string, reason: string): number {
  const r = updateSessionsRevokedAtRevokedReasonByUserIdRevokedAt(d.db, [d.now(), reason, user_id]);
  d.audit.append({
    at: d.now(), kind: 'SESSION_REVOKED', outcome: 'ALLOWED',
    actor_id: user_id, object_type: 'session', detail: { reason, count: r.changes },
  });
  return r.changes;
}

/**
 * "SIGN OUT OF ALL OTHER DEVICES" (Phase 161n1b, ITRoadway M-06), from Settings, staff and portal: every one of the
 * person's sessions but the one in their hand. Returns how many ended.
 */
export function signOutOtherSessions(d: Deps, actor: User, session_id: string): number {
  const r = updateSessionsRevokedAtRevokedReasonByUserIdOthers(d.db, [d.now(), 'SIGNED_OUT_ELSEWHERE', actor.id, session_id]);
  d.audit.append({
    at: d.now(), kind: 'SESSION_REVOKED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'session', object_id: session_id, detail: { reason: 'SIGNED_OUT_ELSEWHERE', count: r.changes },
  });
  return r.changes;
}

/**
 * ROTATION ON PRIVILEGE CHANGE. The old session is revoked and a new one issued
 * carrying `rotated_from`, so the rotation is evidence rather than an assertion
 * in a comment. Call this whenever a role changes or a password changes.
 */
export function rotateSession(d: Deps, old_session_id: string, user_id: string): { cookie: SessionCookie; session_id: string } {
  updateSessionsRevokedAtRevokedReasonByIdRevokedAt(d.db, [d.now(), 'PRIVILEGE_CHANGE', old_session_id]);
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
  // A PASSWORD CHANGE ENDS EVERY SESSION (ITRoadway's second review, M-06): somebody who changes it because they fear
  // another has it must be rid of that other's session too, not only their own. Then this browser is given a fresh
  // one, carrying `rotated_from`, so the person is not signed out by their own success.
  revokeAllSessions(d, actor.id, 'PASSWORD_CHANGED');
  const issued = issueSession(d, actor.id, session_id === '' ? undefined : session_id);
  d.audit.append({
    at: d.now(), kind: 'SESSION_ROTATED', outcome: 'ALLOWED',
    actor_id: actor.id, object_type: 'session', object_id: issued.session_id, detail: { rotated_from: session_id, because: 'PASSWORD_CHANGED' },
  });
  return issued;
}

/**
 * Requests a reset. ALWAYS reports the same thing to the caller, whether or not
 * the address is known — the response must not be an enumeration oracle either.
 * Returns the plaintext token ONLY so the caller can hand it to the email
 * transport; it is never returned to a browser and never stored in clear.
 */
export function requestPasswordReset(
  d: Deps, email: string, source?: string,
): { accepted: true; user?: User; plaintextToken?: string } {
  // Many addresses' resets asked from one network address are slowed too, so nobody can fill inboxes.
  if (source !== undefined && !rateLimit(d, 'reset-from:' + hashToken(source), RESET_SOURCE_LIMIT)) {
    d.audit.append({ at: d.now(), kind: 'RATE_LIMITED', outcome: 'REFUSED', detail: { what: 'password_reset_from_one_address' } });
    return { accepted: true }; // still generic
  }
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
  // L-04: a new link voids the person's older unused ones, so only the newest email works.
  updatePasswordResetTokensUsedAtByUserIdUnused(d.db, [created, found.id]);
  insertPasswordResetTokens(d.db, [newId(), found.id, hashToken(raw), created, new Date(Date.parse(created) + RESET_TTL_MS).toISOString()]);
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
  const row = getPasswordResetTokensIdUserIdByTokenHash<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(d.db, [hashToken(rawToken)]);
  if (row === undefined || row.used_at !== null || Date.parse(row.expires_at) <= Date.parse(d.now())) {
    throw new AuthError('E_BAD_TOKEN', 'that reset link is no longer valid');
  }
  const hash = await d.hasher.hash(next);
  d.db.tx(() => {
    // L-04: taken only if still unused, in this one statement; two at once give one success and one refusal.
    if (updatePasswordResetTokensUsedAtByIdUnused(d.db, [d.now(), row.id]).changes === 0) {
      throw new AuthError('E_BAD_TOKEN', 'that reset link is no longer valid');
    }
    setPasswordHash(d.db, d.now, row.user_id, hash);
    // A password the person chose replaces a temporary one. The second factor stays as it was.
    updateUsersPasswordTemporaryUntilById2(d.db, [row.user_id]);
  });
  revokeAllSessions(d, row.user_id, 'PASSWORD_RESET');
  d.audit.append({
    at: d.now(), kind: 'PASSWORD_RESET_COMPLETED', outcome: 'ALLOWED',
    actor_id: row.user_id, detail: {},
  });
}

export { toActor };
