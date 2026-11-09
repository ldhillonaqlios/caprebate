/**
 * THE ROLE EDITOR — MAKE, CHANGE AND RETIRE A ROLE. Phase 151, 24 September 2026.
 *
 * The design and the hard limits are src/core/custom-roles.ts. This file is the only place a made role is written, and
 * every write is on the server, for the super admin alone (`role.manage`, which no made role can be given):
 *
 *   makeRole     a new role: its name and what it can see and do, each borrowed from a built-in staff role;
 *   changeRole   a new list of grants for an existing role — the people holding it are signed out, because a role
 *                change is a privilege change (the same rule as src/modules/admin/settings.ts, assignRole);
 *   retireRole   a role nobody holds, kept for the audit log's sake, never deleted.
 *
 * EVERY ROLE CHANGE IS IN THE AUDIT LOG: ROLE_CREATED, ROLE_CHANGED, and ROLE_REFUSED for an attempt the hard limits
 * stopped — with the reason, and the grants as action and borrowed role (never a person). Giving a person a role is
 * src/modules/admin/settings.ts's assignRole, which writes ROLE_ASSIGNED and now accepts a made role.
 *
 * A REFUSAL IS ONE PLAIN SENTENCE and nothing is saved, in part or at all.
 */

import type { Db } from '../../core/index.ts';
import type { AuditLog } from '../../core/audit.ts';
import { authorise, builtInHolds, REGISTERED_ACTIONS, type Actor } from '../../core/index.ts';
import { customRoleKey, loadCustomRoles, roleRefusal, type Grant } from '../../core/index.ts';
import { deleteCustomRoleGrantsByRole, getCustomRolesNameRetiredAtByRole, getCustomRolesRoleByName, getRolesRoleByRole, getUsersCountByRole, insertCustomRoleGrants, insertCustomRoles, insertRoles, listCustomRoleGrantsActionAsRoleByRole, listCustomRolesRoleName, listUsersIdByRole, updateCustomRolesRetiredAtUpdatedAtByRole, updateCustomRolesUpdatedAtByRole, updateSessionsRevokedAtRevokedReasonByUserIdRevokedAt } from '../../core/index.ts';

/** All or nothing: a role is never saved in part. */
function tx(db: Db, fn: () => void): void {
  db.run('BEGIN');
  try { fn(); db.run('COMMIT'); } catch (e) { db.run('ROLLBACK'); throw e; }
}

export type RoleEditorDeps = { readonly db: Db; readonly audit: AuditLog; readonly now: () => string };
export type RoleWrite = { readonly ok: true; readonly role: string } | { readonly ok: false; readonly why: string };
export type RoleInput = { readonly name: string; readonly grants: readonly { readonly action: string; readonly as_role: string }[] };

function refuse(d: RoleEditorDeps, actor: Actor, role: string | null, why: string, input: RoleInput): RoleWrite {
  d.audit.append({
    at: d.now(), kind: 'ROLE_REFUSED', outcome: 'REFUSED', actor_id: actor.id, actor_role: actor.role,
    object_type: 'role', object_id: role ?? 'new',
    detail: { why, grants: input.grants.map((g) => `${g.action} as ${g.as_role}`) },
  });
  return { ok: false, why };
}

function writeGrants(db: Db, role: string, grants: readonly Grant[]): void {
  deleteCustomRoleGrantsByRole(db, [role]);
  for (const g of grants) insertCustomRoleGrants(db, [role, g.action, g.as_role]);
}

export function makeRole(d: RoleEditorDeps, actor: Actor, input: RoleInput): RoleWrite {
  authorise(actor, 'role.manage', { type: 'role', id: 'new' });
  const why = roleRefusal(input, REGISTERED_ACTIONS, builtInHolds);
  if (why !== null) return refuse(d, actor, null, why, input);
  const name = input.name.trim();
  const key = customRoleKey(name);
  if (getRolesRoleByRole(d.db, [key]) !== undefined || getCustomRolesRoleByName(d.db, [name]) !== undefined) {
    return refuse(d, actor, null, `A role called “${name}” already exists. Choose another name.`, input);
  }
  const at = d.now();
  tx(d.db, () => {
    insertRoles(d.db, [key, `Made by the super admin: ${name}.`]);
    insertCustomRoles(d.db, [key, name, actor.id, at, at]);
    writeGrants(d.db, key, input.grants as readonly Grant[]);
  });
  loadCustomRoles(d.db);
  d.audit.append({
    at, kind: 'ROLE_CREATED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'role', object_id: key,
    detail: { role: key, grants: input.grants.map((g) => `${g.action} as ${g.as_role}`) },
  });
  return { ok: true, role: key };
}

export function changeRole(d: RoleEditorDeps, actor: Actor, key: string, input: { readonly grants: RoleInput['grants'] }): RoleWrite {
  authorise(actor, 'role.manage', { type: 'role', id: key });
  const row = getCustomRolesNameRetiredAtByRole<{ name: string; retired_at: string | null }>(d.db, [key]);
  const whole: RoleInput = { name: row?.name ?? '', grants: input.grants };
  if (row === undefined) return refuse(d, actor, key, 'There is no role like that to change. Built-in roles cannot be changed here.', whole);
  if (row.retired_at !== null) return refuse(d, actor, key, 'That role is retired. Make a new one instead.', whole);
  const why = roleRefusal(whole, REGISTERED_ACTIONS, builtInHolds);
  if (why !== null) return refuse(d, actor, key, why, whole);
  const before = listCustomRoleGrantsActionAsRoleByRole<{ action: string; as_role: string }>(d.db, [key]);
  const at = d.now();
  const holders = listUsersIdByRole<{ id: string }>(d.db, [key]).map((u) => u.id);
  tx(d.db, () => {
    writeGrants(d.db, key, input.grants as readonly Grant[]);
    updateCustomRolesUpdatedAtByRole(d.db, [at, key]);
  });
  // A role change is a privilege change: everybody holding it signs in again under the new rules.
  // The same revocation src/core/auth.ts's revokeAllSessions makes, with its own audit row per person.
  for (const id of holders) {
    const r = updateSessionsRevokedAtRevokedReasonByUserIdRevokedAt(d.db, [at, 'PRIVILEGE_CHANGE', id]);
    d.audit.append({ at, kind: 'SESSION_REVOKED', outcome: 'ALLOWED', actor_id: id, object_type: 'session', detail: { reason: 'PRIVILEGE_CHANGE', count: r.changes } });
  }
  loadCustomRoles(d.db);
  d.audit.append({
    at, kind: 'ROLE_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'role', object_id: key,
    detail: {
      from: before.map((g) => `${g.action} as ${g.as_role}`), to: input.grants.map((g) => `${g.action} as ${g.as_role}`),
      people_signed_out: holders.length,
    },
  });
  return { ok: true, role: key };
}

export function retireRole(d: RoleEditorDeps, actor: Actor, key: string): RoleWrite {
  authorise(actor, 'role.manage', { type: 'role', id: key });
  const row = getCustomRolesNameRetiredAtByRole<{ name: string; retired_at: string | null }>(d.db, [key]);
  const none: RoleInput = { name: row?.name ?? '', grants: [] };
  if (row === undefined) return refuse(d, actor, key, 'There is no role like that to retire. Built-in roles cannot be retired.', none);
  if (row.retired_at !== null) return refuse(d, actor, key, 'That role is already retired.', none);
  const n = getUsersCountByRole<{ n: number }>(d.db, [key])?.n ?? 0;
  if (n > 0) return refuse(d, actor, key, `${n === 1 ? 'One person still has' : `${n} people still have`} this role. Give them another role first.`, none);
  const at = d.now();
  updateCustomRolesRetiredAtUpdatedAtByRole(d.db, [at, at, key]);
  loadCustomRoles(d.db);
  d.audit.append({
    at, kind: 'ROLE_CHANGED', outcome: 'ALLOWED', actor_id: actor.id, actor_role: actor.role, object_type: 'role', object_id: key,
    detail: { retired: true },
  });
  return { ok: true, role: key };
}

/** Every role the super admin made, live first, with what each can do, for the screen. */
export function listMadeRoles(db: Db, actor: Actor): { key: string; name: string; retired: boolean; grants: { action: string; as_role: string }[]; holders: number }[] {
  authorise(actor, 'role.manage', { type: 'role', id: 'list' });
  return listCustomRolesRoleName<{ role: string; name: string; retired_at: string | null }>(db)
    .map((r) => ({
      key: r.role, name: r.name, retired: r.retired_at !== null,
      grants: listCustomRoleGrantsActionAsRoleByRole<{ action: string; as_role: string }>(db, [r.role]),
      holders: getUsersCountByRole<{ n: number }>(db, [r.role])?.n ?? 0,
    }));
}
