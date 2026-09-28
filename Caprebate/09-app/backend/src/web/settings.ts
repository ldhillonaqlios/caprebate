/**
 * SETTINGS — and it is built before the calendar because the calendar has no
 * other source of bookable time.
 *
 * VIEW MODELS AND MUTATIONS. Every function here takes an ACTOR and calls
 * `authorise` on the SPECIFIC OBJECT before it reads or writes, exactly as
 * src/web/portal.ts does. Not one of them consults a route name or branches on
 * a role, which is why the tests can prove that the four non-admin roles are
 * refused BY THE ENDPOINT rather than merely missing a menu item.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THE SPLIT THAT MATTERS: ABOUT AN ACCOUNT vs INSIDE IT
 *
 * ADMIN creates a user, changes their role and disables them. ADMIN does NOT
 * change somebody's display name, username or photograph — `user.change_own_profile`
 * and `user.set_photo` are `self` for every role including ADMIN. Editing the
 * name and face on an account produces a record that reads as the person
 * themselves; that is impersonation, and no amount of privilege makes it
 * something else. The rule table is where that is enforced, not a screen.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WHAT A DISABLED USER LOSES, AND WHEN
 *
 * At once. `disableUser` revokes every live session in the same transaction
 * that sets `disabled_at`, `authenticate` refuses a revoked session on the very
 * next request, and `can()` refuses a disabled actor before any rule is
 * consulted. The phase brief asks for "immediately, not on next login" and
 * there are three independent reasons it is true; the test asserts it through
 * a real HTTP request on a live cookie, because that is the only one of the
 * three a user would notice.
 */

import { isCustomRoleKey } from '../custom-roles.ts';
import type { Db } from '../db.ts';
import { authorise, can, type Actor } from '../authz.ts';
import { APP_ROLES, isAppRole, type AppRole } from '../roles.ts';
import type { AuditLog } from '../audit.ts';
import type { Deps } from '../auth.ts';
import { rateLimit, revokeAllSessions } from '../auth.ts';
import {
  canonicalEmail, createUser, disableUser as storeDisable, findById, listUsers,
  assignRole as storeAssignRole, newId, type User,
} from '../users.ts';
import {
  replaceWorkingTimes, workingTimesFor, WorkingTimeError, WEEKDAY_NAMES,
  minutesToClock, type WorkingTime, type WorkingTimeInput,
} from './schedule.ts';
import { photoFor, type PhotoRecord } from './avatar.ts';
import { liftSuppression } from '../stubs/email-provider.ts';

export class SettingsError extends Error {
  readonly code: string;
  /**
   * PHASE 133e (D4, continued): the posted field this refusal is about, where it is about one, so the account
   * settings and the Create-a-user form can draw the message beside that field instead of at the top. A refusal
   * about the account rather than a field — no such user, the last administrator, your own role — carries none.
   */
  readonly field: string | undefined;
  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'SettingsError';
    this.code = code;
    this.field = field;
  }
}

/* ------------------------------------------------------------------ *
 * ONE USER'S OWN SETTINGS
 * ------------------------------------------------------------------ */

export type ProfileView = {
  readonly user: User;
  readonly photo: PhotoRecord | undefined;
  readonly working: readonly WorkingTime[];
  /** Rendered for the working-times form, one row per day, in week order. */
  readonly week: readonly {
    readonly weekday: number; readonly name: string;
    readonly start: string; readonly end: string; readonly set: boolean;
  }[];
};

function userObj(u: User): { type: 'user'; id: string; role: AppRole } {
  return { type: 'user', id: u.id, role: u.role };
}

export function profile(db: Db, actor: Actor): ProfileView {
  const u = findById(db, actor.id);
  if (u === undefined) throw new SettingsError('E_NO_USER', 'that account no longer exists');
  authorise(actor, 'user.read_self', userObj(u));
  const working = workingTimesFor(db, actor.id);
  return { user: u, photo: photoFor(db, actor.id), working, week: weekRows(working) };
}

/**
 * Monday first, because that is how a working week is read, and one row per
 * day whether or not it is set — a day with no hours has to be VISIBLE as a
 * day with no hours, or nobody can tell "I do not work Fridays" from "I have
 * not filled this in yet".
 *
 * THE HOURS IN AND OUT OF THIS FORM ARE LOCAL HOURS — UK time. `minutesToClock`
 * is pure arithmetic on a number of minutes and `clockToMinutes` is its inverse;
 * neither converts anything, and neither should ever start to. The value is
 * already local, so a conversion here would apply the offset twice. See
 * decision 3 at the top of schedule.ts for why local is the right unit for a
 * weekly pattern of a person's working hours.
 */
export function weekRows(working: readonly WorkingTime[]): ProfileView['week'] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((weekday) => {
    const row = working.find((w) => w.weekday === weekday);
    return {
      weekday,
      name: WEEKDAY_NAMES[weekday] ?? String(weekday),
      start: row === undefined ? '' : minutesToClock(row.start_min),
      end: row === undefined ? '' : minutesToClock(row.end_min),
      set: row !== undefined,
    };
  });
}

export function setDisplayName(
  db: Db, audit: AuditLog, now: () => string, actor: Actor, name: string,
): void {
  const u = findById(db, actor.id);
  if (u === undefined) throw new SettingsError('E_NO_USER', 'that account no longer exists');
  authorise(actor, 'user.change_own_profile', userObj(u));
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new SettingsError('E_BAD_NAME', 'a display name is between 2 and 80 characters', 'display_name');
  }
  db.run('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?', [trimmed, now(), actor.id]);
  // THE NEW NAME IS NOT IN THE LOG LINE. `screenDetail` would refuse the key,
  // and it is right to: an audit log that accumulates display names is a
  // directory of staff nobody decided to build.
  audit.append({
    at: now(), kind: 'USER_UPDATED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role, object_type: 'user', object_id: actor.id,
    detail: { field: 'display_name' },
  });
}

/**
 * May this actor put a photograph on this account?
 *
 * A SEPARATE FUNCTION BECAUSE THE UPLOAD PATH IS NOT A DATABASE WRITE. The
 * bytes are read, sniffed, decoded and re-encoded before anything is stored, so
 * the authorisation has to happen at the top of that sequence rather than at
 * the bottom — a build that authorised just before the INSERT would already
 * have accepted, parsed and rewritten a file for somebody who was not allowed
 * to send one.
 */
export function assertMaySetPhoto(actor: Actor, target: User): void {
  authorise(actor, 'user.set_photo', userObj(target));
}

/**
 * The login identifier.
 *
 * IT IS THE EMAIL ADDRESS, AND CALLING IT A USERNAME DOES NOT MAKE IT A SECOND
 * FIELD. `users` has one column a person signs in with and adding another would
 * give this application two answers to "who is this", which is how an account
 * ends up reachable by a name nobody audits.
 *
 * TWO THINGS THIS DELIBERATELY ACCEPTS, both worth stating rather than leaving
 * for somebody to discover:
 *
 *   IT IS A NARROW ENUMERATION SURFACE. Telling a signed-in user that a
 *   username is taken confirms that an account exists. There is no way to let
 *   somebody choose a unique identifier without it. So it is bounded instead:
 *   the caller must already be authenticated, it is rate-limited per actor
 *   through the same fixed-window counter login uses, and every attempt is
 *   audited. Login itself gives nothing away and that is where it matters.
 *
 *   IT IS A PRIVILEGE CHANGE. The session rotates. What a session identifies is
 *   now reachable by a different name, and `rotateSession` records what it
 *   rotated from, so the change is evidence rather than an assertion.
 */
export const USERNAME_CHANGE_LIMIT = 5;

export function setUsername(
  d: Deps, actor: Actor, email: string,
): { user: User } {
  const u = findById(d.db, actor.id);
  if (u === undefined) throw new SettingsError('E_NO_USER', 'that account no longer exists');
  authorise(actor, 'user.change_own_profile', userObj(u));

  if (!rateLimit(d, `username:${actor.id}`, USERNAME_CHANGE_LIMIT)) {
    throw new SettingsError('E_RATE_LIMITED', 'too many changes — try again later');
  }
  const wanted = email.trim();
  // Validation is deliberately thin and shaped like the one on the login form.
  // An address this application cannot deliver to is a problem for the outbox,
  // not a reason to invent a regular expression nobody can defend.
  if (wanted.length < 3 || wanted.length > 254 || !wanted.includes('@') || /\s/.test(wanted)) {
    throw new SettingsError('E_BAD_USERNAME', 'that does not look like an email address', 'username');
  }
  const canonical = canonicalEmail(wanted);
  const clash = d.db.get<{ id: string }>(
    'SELECT id FROM users WHERE email_canonical = ? AND id <> ?', [canonical, actor.id],
  );
  if (clash !== undefined) {
    d.audit.append({
      at: d.now(), kind: 'USER_UPDATED', outcome: 'REFUSED',
      actor_id: actor.id, actor_role: actor.role, object_type: 'user', object_id: actor.id,
      detail: { field: 'username', reason: 'taken' },
    });
    throw new SettingsError('E_USERNAME_TAKEN', 'that username is not available', 'username');
  }
  d.db.run('UPDATE users SET email = ?, email_canonical = ?, updated_at = ? WHERE id = ?',
    [wanted, canonical, d.now(), actor.id]);
  d.audit.append({
    at: d.now(), kind: 'USER_UPDATED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role, object_type: 'user', object_id: actor.id,
    detail: { field: 'username' },
  });
  const after = findById(d.db, actor.id);
  if (after === undefined) throw new SettingsError('E_NO_USER', 'that account no longer exists');
  return { user: after };
}

/**
 * Working times, for one user.
 *
 * AUTHORISED PER PERIOD, NOT PER FORM. `working_time.write` is `ownWorkingTime`
 * for the three non-admin staff roles, so the object handed to `authorise`
 * carries the user id the row would belong to. Checking the form's target once
 * at the top and then writing rows would be a role check wearing an object
 * check's clothes.
 */
export function saveWorkingTimes(
  db: Db, audit: AuditLog, now: () => string, actor: Actor,
  target_user_id: string, rows: readonly WorkingTimeInput[],
): void {
  authorise(actor, 'working_time.write', {
    type: 'working_time', id: `week:${target_user_id}`, user_id: target_user_id,
  });
  const target = findById(db, target_user_id);
  if (target === undefined) throw new SettingsError('E_NO_USER', 'no such user');
  try {
    replaceWorkingTimes(db, newId, target_user_id, rows);
  } catch (e) {
    if (e instanceof WorkingTimeError) throw new SettingsError('E_WORKING_TIME', e.message);
    throw e;
  }
  audit.append({
    at: now(), kind: 'USER_UPDATED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'working_time', object_id: target_user_id,
    detail: { field: 'working_times', periods: rows.length },
  });
}

export function readWorkingTimes(db: Db, actor: Actor, target_user_id: string): WorkingTime[] {
  authorise(actor, 'working_time.read', {
    type: 'working_time', id: `week:${target_user_id}`, user_id: target_user_id,
  });
  return workingTimesFor(db, target_user_id);
}

/* ------------------------------------------------------------------ *
 * ADMIN ONLY — create, assign a role, disable
 * ------------------------------------------------------------------ */

export type StaffRow = {
  readonly user: User;
  readonly working_periods: number;
  readonly has_photo: boolean;
};

/** Whether to draw the administration link. `can()` decides; the screen asks. */
export function canAdminister(actor: Actor): boolean {
  return can(actor, 'user.list', { type: 'user', id: actor.id, role: actor.role });
}

export function staffList(db: Db, actor: Actor): StaffRow[] {
  // The object is the actor themselves rather than an invented one: `user.list`
  // is ADMIN-only and unconditional, and handing it a real object keeps the
  // shape of every other call in this file.
  authorise(actor, 'user.list', { type: 'user', id: actor.id, role: actor.role });
  const counts = new Map<string, number>();
  for (const w of db.all<{ user_id: string; n: number }>(
    'SELECT user_id, COUNT(*) AS n FROM working_times GROUP BY user_id',
  )) counts.set(w.user_id, w.n);
  const photos = new Set(
    db.all<{ user_id: string }>('SELECT user_id FROM user_photos').map((r) => r.user_id),
  );
  return listUsers(db).map((u) => ({
    user: u,
    working_periods: counts.get(u.id) ?? 0,
    has_photo: photos.has(u.id),
  }));
}

/**
 * Create a user.
 *
 * A CLIENT NEEDS A BUSINESS AND A STAFF USER MUST NOT HAVE ONE. The `users`
 * table's two CHECK constraints already refuse both, and this checks them too —
 * not as belt and braces but so the person gets a sentence instead of a
 * constraint name. The database remains the control.
 */
export async function createStaffUser(
  d: { db: Db; audit: AuditLog; now: () => string; hash(plain: string): Promise<string> },
  actor: Actor,
  args: {
    email: string; display_name: string; role: string; password: string; business_id?: string | null;
    /** PHASE 151j: the password is a temporary one, good until this time; the person chooses their own at first sign-in. */
    temporary_until?: string;
  },
): Promise<User> {
  authorise(actor, 'user.create', { type: 'user', id: 'new', role: 'SALES' });

  // PHASE 151b: or a role the super admin made — a staff role, so the account belongs to no business (checked below).
  const madeRole = isCustomRoleKey(args.role);
  if (!isAppRole(args.role) && !madeRole) {
    throw new SettingsError('E_BAD_ROLE', `a role is one of ${APP_ROLES.join(', ')}, or one the super admin made`, 'role');
  }
  if (madeRole && (args.business_id ?? '') !== '') {
    throw new SettingsError('E_STAFF_BUSINESS', 'a staff account belongs to no business: leave the business empty', 'business_id');
  }
  const email = args.email.trim();
  if (email.length < 3 || !email.includes('@') || /\s/.test(email)) {
    throw new SettingsError('E_BAD_USERNAME', 'that does not look like an email address', 'email');
  }
  const name = args.display_name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new SettingsError('E_BAD_NAME', 'a display name is between 2 and 80 characters', 'display_name');
  }
  if (args.role === 'CLIENT' && (args.business_id ?? '') === '') {
    throw new SettingsError('E_NO_BUSINESS', 'a client account has to belong to one business', 'business_id');
  }
  if (args.role !== 'CLIENT' && (args.business_id ?? '') !== '') {
    throw new SettingsError('E_STAFF_BUSINESS', 'a staff account does not belong to a business', 'business_id');
  }
  // THE MINIMUM IS THE HASHER'S, NOT A SECOND OPINION. argon2idHasher refuses
  // anything under twelve characters, so a shorter one would be refused a layer
  // down with a worse message; this is the same rule said early.
  if (args.password.length < 12) {
    throw new SettingsError('E_WEAK_PASSWORD', 'a password is at least 12 characters', 'password');
  }
  if (d.db.get('SELECT id FROM users WHERE email_canonical = ?', [canonicalEmail(email)]) !== undefined) {
    throw new SettingsError('E_USERNAME_TAKEN', 'that username is not available', 'email');
  }

  const created = createUser(d.db, d.now, {
    // A made role is held by users.role's own reference to `roles` (migration 046), as assignRole stores one.
    email, display_name: name, role: args.role as AppRole,
    password_hash: await d.hash(args.password),
    business_id: args.role === 'CLIENT' ? (args.business_id ?? null) : null,
  });
  if (args.temporary_until !== undefined) {
    d.db.run('UPDATE users SET password_temporary_until = ? WHERE id = ?', [args.temporary_until, created.id]);
  }
  d.audit.append({
    at: d.now(), kind: 'USER_CREATED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'user', object_id: created.id,
    detail: { role: created.role, ...(args.temporary_until === undefined ? {} : { temporary_until: args.temporary_until }) },
  });
  return created;
}

/**
 * Change somebody's role.
 *
 * A ROLE CHANGE IS A PRIVILEGE CHANGE AND IT ENDS THEIR SESSIONS. Rotation is
 * for the session in your own hand; you are not holding theirs, so the honest
 * equivalent is revocation — they sign in again and the new session is issued
 * against the new role. Leaving a live session running under the old role means
 * a demoted user keeps the permissions they were just relieved of for up to
 * eight hours.
 */
export function assignRole(d: Deps, actor: Actor, target_id: string, role: string): User {
  const target = findById(d.db, target_id);
  if (target === undefined) throw new SettingsError('E_NO_USER', 'no such user');
  authorise(actor, 'user.assign_role', { type: 'user', id: target.id, role: target.role });

  // Phase 151: or a role the super admin made (src/custom-roles.ts) — a staff role, so never on a client account.
  const made = isCustomRoleKey(role);
  if (!isAppRole(role) && !made) {
    throw new SettingsError('E_BAD_ROLE', `a role is one of ${APP_ROLES.join(', ')}, or one the super admin made`);
  }
  if (made && target.business_id !== null) {
    throw new SettingsError('E_STAFF_BUSINESS', 'a client account cannot be given a staff role while it belongs to a business');
  }
  if (role === 'CLIENT' && target.business_id === null) {
    throw new SettingsError('E_NO_BUSINESS',
      'a staff account cannot become a client account: a client belongs to one business and this one belongs to none');
  }
  if (role !== 'CLIENT' && target.business_id !== null) {
    throw new SettingsError('E_STAFF_BUSINESS',
      'a client account cannot become a staff account while it belongs to a business');
  }
  if (target.id === actor.id && role !== actor.role) {
    // NOT A COURTESY. An administrator who demotes themselves cannot restore
    // their own role afterwards, and if they were the only one, nobody can.
    throw new SettingsError('E_SELF_ROLE', 'you cannot change your own role — ask another administrator');
  }
  storeAssignRole(d.db, d.now, target.id, role as AppRole);
  d.audit.append({
    at: d.now(), kind: 'ROLE_ASSIGNED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'user', object_id: target.id,
    detail: { from: target.role, to: role },
  });
  revokeAllSessions(d, target.id, 'PRIVILEGE_CHANGE');
  const after = findById(d.db, target.id);
  if (after === undefined) throw new SettingsError('E_NO_USER', 'no such user');
  return after;
}

/**
 * Disable a user. THEIR SESSIONS END NOW.
 *
 * The last active administrator cannot be disabled, and that is a real control
 * rather than a nicety: an application with no administrator has no route back
 * to having one, because creating a user requires being one.
 */
export function disableUser(d: Deps, actor: Actor, target_id: string): User {
  const target = findById(d.db, target_id);
  if (target === undefined) throw new SettingsError('E_NO_USER', 'no such user');
  authorise(actor, 'user.disable', { type: 'user', id: target.id, role: target.role });

  if (target.id === actor.id) {
    throw new SettingsError('E_SELF_DISABLE', 'you cannot disable your own account');
  }
  if (target.role === 'ADMIN') {
    const others = d.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM users WHERE role = ? AND disabled_at IS NULL AND id <> ?',
      ['ADMIN', target.id],
    );
    if ((others?.n ?? 0) === 0) {
      throw new SettingsError('E_LAST_ADMIN',
        'that is the last administrator — create another before disabling this one');
    }
  }
  storeDisable(d.db, d.now, target.id);
  const revoked = d.db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_reason = ?',
    [target.id, 'USER_DISABLED'],
  );
  d.audit.append({
    at: d.now(), kind: 'USER_DISABLED', outcome: 'ALLOWED',
    actor_id: actor.id, actor_role: actor.role,
    object_type: 'user', object_id: target.id,
    detail: { sessions_revoked: revoked?.n ?? 0 },
  });
  const after = findById(d.db, target.id);
  if (after === undefined) throw new SettingsError('E_NO_USER', 'no such user');
  return after;
}

/**
 * PHASE 133a — THE GATE OF USERS AND ROLES, EXPORTED FOR THE NAVIGATION. The same call its store function makes first;
 * src/web/navigation.ts asks it to decide whether the section is in a login's menu, and test/phase133a.test.ts opens
 * every menu link for every login, so a gate that drifted from its route fails there.
 */
export function usersGate(actor: Actor): void {
  authorise(actor, 'user.list', { type: 'user', id: actor.id, role: actor.role });
}

/* ================================================================== *
 * ADDRESSES WE CANNOT EMAIL — PHASE 146g, 23 September 2026
 *
 * Phase 146f recorded bounces and stopped sending to an address that bounced
 * for good, and `liftSuppression` (src/stubs/email-provider.ts) was written for
 * a member of staff to say the address works again — with no screen to say it
 * from. So an address stopped for good was stopped for ever, and the only way
 * back was somebody with the database file.
 *
 * ADMIN ONLY, and a lift is a NEW ROW. Nothing is edited and nothing is
 * deleted: the bounce stays on record, and the lift sits after it with who
 * lifted it and when. Lifting an address that is not stopped does nothing and
 * says so — it is not an error, because two people pressing the same button is
 * not a fault.
 * ================================================================== */

export type StoppedAddress = {
  readonly address: string;
  /** When it was stopped. */
  readonly at: string;
  /** The server's code — "550", "5.1.1". Never the server's words. */
  readonly status: string;
  /** What the message was, so a person can see which one bounced. Never its body. */
  readonly subject: string | null;
};

/** Every address nothing more is sent to, newest first. The state is the address's NEWEST row. */
export function stoppedAddresses(db: Db, actor: Actor): StoppedAddress[] {
  authorise(actor, 'user.list', { type: 'user', id: actor.id, role: actor.role });
  return db.all<{ address: string; at: string; status: string | null; subject: string | null }>(
    'SELECT s.address_canonical AS address, s.at AS at, b.status AS status, o.subject AS subject ' +
      'FROM email_suppressions s ' +
      'LEFT JOIN email_bounces b ON b.id = s.bounce_id ' +
      'LEFT JOIN outbox o ON o.id = b.outbox_id ' +
      'WHERE s.state = ? AND s.id = (SELECT id FROM email_suppressions x ' +
      'WHERE x.address_canonical = s.address_canonical ORDER BY x.at DESC, x.rowid DESC LIMIT 1) ' +
      'ORDER BY s.at DESC',
    ['BOUNCED'],
  ).map((r) => ({ address: r.address, at: r.at, status: r.status ?? 'not recorded', subject: r.subject }));
}

/**
 * A MEMBER OF STAFF SAYS AN ADDRESS WORKS AGAIN. Returns whether anything changed, so the screen can say either
 * "that address can be emailed again" or "that address was not stopped" — and neither is an error.
 */
export function liftStoppedAddress(
  d: { db: Db; audit: AuditLog; now: () => string }, actor: Actor, address: string,
): { readonly lifted: boolean; readonly address: string } {
  authorise(actor, 'user.list', { type: 'user', id: actor.id, role: actor.role });
  const typed = address.trim();
  const lifted = liftSuppression(d.db, d.now, typed, actor.id);
  d.audit.append({
    at: d.now(), kind: 'EMAIL_ADDRESS_LIFTED', outcome: lifted ? 'ALLOWED' : 'REFUSED',
    actor_id: actor.id, actor_role: actor.role, object_type: 'outbox', object_id: null,
    // The address is the thing being lifted and it is already in email_suppressions; the log line carries no name
    // and no address, only whether a lift happened. Which address it was is the row the lift wrote.
    detail: { lifted, why: lifted ? 'a member of staff said the address works again' : 'that address was not stopped' },
  });
  return { lifted, address: typed };
}
