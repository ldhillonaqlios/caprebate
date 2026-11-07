/**
 * Users. The row type that LEAVES this module has no password field — that is
 * how "never returned" is enforced, rather than by remembering to delete a key.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import type { AppRole } from './roles.ts';
import type { Actor } from './authz.ts';

/** What the rest of the application may see. THERE IS NO password_hash HERE. */
export type User = {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly role: AppRole;
  readonly disabled: boolean;
  readonly business_id: string | null;
  readonly created_at: string;
};

/** Only auth.ts asks for this, and only to verify against it. */
type UserWithSecret = User & { readonly password_hash: string };

/* Written out at every call site rather than interpolated from a constant.
   Interpolating even a trusted constant into SQL is the pattern tools/lint-sql.cjs
   refuses, and a rule with one blessed exception is a rule people route around. */

type UserRow = {
  id: string; email: string; display_name: string; role: string;
  disabled_at: string | null; business_id: string | null; created_at: string;
  password_hash?: string;
};

function toUser(r: UserRow): User {
  return {
    id: r.id, email: r.email, display_name: r.display_name,
    role: r.role as AppRole, disabled: r.disabled_at !== null,
    business_id: r.business_id, created_at: r.created_at,
  };
}

export function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function newId(): string {
  return randomUUID();
}

export function createUser(
  db: Db, now: () => string,
  u: { email: string; display_name: string; role: AppRole; password_hash: string; business_id?: string | null },
): User {
  const id = newId();
  const t = now();
  db.run(
    'INSERT INTO users (id, email, email_canonical, display_name, role, password_hash, disabled_at, created_at, updated_at, business_id) ' +
      'VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)',
    [id, u.email, canonicalEmail(u.email), u.display_name, u.role, u.password_hash, t, t, u.business_id ?? null],
  );
  const row = db.get<UserRow>(
    'SELECT id, email, display_name, role, disabled_at, business_id, created_at FROM users WHERE id = ?',
    [id],
  );
  if (row === undefined) throw new Error('user insert did not read back');
  return toUser(row);
}

export function findById(db: Db, id: string): User | undefined {
  const r = db.get<UserRow>(
    'SELECT id, email, display_name, role, disabled_at, business_id, created_at FROM users WHERE id = ?',
    [id],
  );
  return r === undefined ? undefined : toUser(r);
}

/** auth.ts only. The name says what it hands back so nothing uses it by accident. */
export function findByEmailWithSecret(db: Db, email: string): UserWithSecret | undefined {
  const r = db.get<UserRow>(
    'SELECT id, email, display_name, role, disabled_at, business_id, created_at, password_hash ' +
      'FROM users WHERE email_canonical = ?',
    [canonicalEmail(email)],
  );
  if (r === undefined || r.password_hash === undefined) return undefined;
  return { ...toUser(r), password_hash: r.password_hash };
}

export function listUsers(db: Db): User[] {
  return db
    .all<UserRow>(
      'SELECT id, email, display_name, role, disabled_at, business_id, created_at ' +
        'FROM users ORDER BY created_at ASC',
    )
    .map(toUser);
}

export function setPasswordHash(db: Db, now: () => string, user_id: string, hash: string): void {
  db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now(), user_id]);
}

export function assignRole(db: Db, now: () => string, user_id: string, role: AppRole): void {
  db.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, now(), user_id]);
}

/**
 * Disabling revokes every session IMMEDIATELY, not on next login. That is the
 * point of server-side sessions and it is asserted by a test.
 */
export function disableUser(db: Db, now: () => string, user_id: string): void {
  const t = now();
  db.tx(() => {
    db.run('UPDATE users SET disabled_at = ?, updated_at = ? WHERE id = ?', [t, t, user_id]);
    db.run(
      'UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL',
      [t, 'USER_DISABLED', user_id],
    );
  });
}

export function toActor(u: User): Actor {
  return { id: u.id, role: u.role, business_id: u.business_id, disabled: u.disabled };
}

/** Tokens are stored hashed, so a database copy does not hand over live sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
