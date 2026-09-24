/**
 * ROLES A SUPER ADMIN CAN MAKE. Phase 151, 24 September 2026.
 *
 * WHAT LAKHBIR DECIDED (Word answers 39 and 40, closed 24 September 2026). The super admin must be able to create
 * roles, choose what each can see and do, and give people roles.
 *
 * HOW A ROLE IS MADE, AND WHY THIS SHAPE. A role the super admin makes is a NAME and a LIST OF GRANTS. Each grant is one
 * action the back office knows (src/authz.ts, REGISTERED_ACTIONS) together with THE BUILT-IN ROLE WHOSE RULE IT BORROWS
 * — "claim.read, as Sales reads it". So a made role never invents a rule: every yes it can give is a yes one of the four
 * staff roles already gives, with that role's test on the specific object (the assigned surveyor's own job, the owner's
 * own task, the organisation's own documents). Authorisation stays on the server, for each request and each object,
 * exactly as it is for the built-in roles: `can()` in src/authz.ts decides a made role by the same table.
 *
 * THE HARD LIMITS. No role editor may break these, and a role that would is REFUSED WITH A PLAIN SENTENCE
 * (`roleRefusal`), never saved in part:
 *   1. THE SURVEYOR NEVER RECEIVES THE ESTIMATE. A role that can survey — any grant borrowed from Surveying, or the
 *      right to sign a survey off — may hold none of the actions that reveal the estimate or the value of a claim
 *      (SEALED_FROM_SURVEY). And a made role is sent to the estimate quarantine AS THE SURVEYOR unless it holds
 *      `estimate.read` itself (src/roles.ts, toQuarantineRole), so the survey workspace's payload withholds the sealed
 *      estimate from it; test/phase151.test.ts runs payload-proof's check on such a role.
 *   2. ONLY THE SUPER ADMIN RUNS ACCOUNTS AND ROLES. Creating, changing and disabling users, giving roles, and making
 *      or changing roles (NEVER_GRANTED) cannot be given to a made role.
 *   3. A GRANT MUST BE ONE THE BUILT-IN ROLE ACTUALLY HOLDS. A client's rule is never borrowed: a made role is a staff
 *      role, and the client's own-organisation rule would give a staff member a client's view.
 *   4. EVERY CHANGE IS IN THE AUDIT LOG — made, changed, refused and given (src/web/role-editor.ts).
 *
 * WHERE THEY LIVE. The `custom_roles` and `custom_role_grants` tables (migration 046), and a row in `roles`, so a user
 * holding one is held by the database's own reference. This module keeps the set in memory for `can()`, which is pure;
 * `loadCustomRoles` fills it when the application starts and after every change.
 *
 * THIS FILE IMPORTS NOTHING FROM src/authz.ts, on purpose: authz.ts reads it, and the validation is handed the one fact
 * it needs about the built-in table (`holds`) by its caller.
 */

import type { Db } from './db.ts';

/** The four staff roles a made role may borrow a rule from. Never CLIENT, never READ_ONLY, never the DPO. */
export const BORROWABLE_ROLES = ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING'] as const;
export type BorrowableRole = (typeof BORROWABLE_ROLES)[number];

export type Grant = { readonly action: string; readonly as_role: BorrowableRole };

export type CustomRole = {
  /** The key users.role holds: "ROLE_" and the name in capitals. */
  readonly key: string;
  readonly name: string;
  readonly grants: readonly Grant[];
};

export const CUSTOM_ROLE_PREFIX = 'ROLE_';

/** Hard limit 2. Accounts and roles are the super admin's alone. */
export const NEVER_GRANTED: readonly string[] = Object.freeze([
  'user.create', 'user.update', 'user.disable', 'user.assign_role', 'user.list', 'role.manage',
]);

/** Hard limit 1. What a role that can survey may never hold: the estimate, and every figure that reveals it. */
export const SEALED_FROM_SURVEY: readonly string[] = Object.freeze([
  'estimate.read', 'claim.read_value', 'claim_figures.read', 'claim_facts.read',
  'invoice.read', 'introducer.read_value', 'introducer.read_money', 'introducer_fee.read', 'fee_discount.read',
]);
/* NOT HERE, ON PURPOSE: `claim_facts.read_released`. It is the surveyor's own read of the facts the quarantine releases
   AFTER they commit (src/payload.ts, RELEASED_FACTS_TO_SURVEYOR) — Surveying holds it, and a made surveyor may too. */

/** Whether a role can survey: any rule borrowed from Surveying, or the right to sign a survey off. */
export function canSurvey(grants: readonly Grant[]): boolean {
  return grants.some((g) => g.as_role === 'SURVEYING' || g.action === 'surveyor_job.commit');
}

export function customRoleKey(name: string): string {
  return CUSTOM_ROLE_PREFIX + name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const BUILT_IN_NAMES = ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING', 'CLIENT', 'READ_ONLY', 'DPO'];

/**
 * Why this role may not be saved, as one plain sentence — or null when it may. `holds(action, role)` says whether the
 * built-in table gives that role that action; `registered` is every action the back office knows.
 */
export function roleRefusal(
  input: { readonly name: string; readonly grants: readonly { readonly action: string; readonly as_role: string }[] },
  registered: readonly string[],
  holds: (action: string, role: BorrowableRole) => boolean,
): string | null {
  const name = input.name.trim();
  if (name.length === 0) return 'Give the role a name.';
  if (name.length > 60) return 'Keep the role’s name to 60 letters or fewer.';
  if (!/[A-Za-z]/.test(name)) return 'The role’s name needs at least one letter.';
  const bare = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (BUILT_IN_NAMES.includes(bare)) return `“${name}” is already the name of a built-in role. Choose another name.`;
  if (input.grants.length === 0) return 'Choose at least one thing this role can see or do.';
  const seen = new Set<string>();
  for (const g of input.grants) {
    if (seen.has(g.action)) return 'Each thing a role can do is chosen once.';
    seen.add(g.action);
    if (!registered.includes(g.action)) return 'One of the things chosen is not something the back office does.';
    if (NEVER_GRANTED.includes(g.action)) {
      return 'Only the super admin can create users, give roles or make roles. No role you make can do that.';
    }
    if (!(BORROWABLE_ROLES as readonly string[]).includes(g.as_role)) {
      return 'A role you make borrows each right from Admin, Sales, Accounting or Surveying — never from a client.';
    }
    if (!holds(g.action, g.as_role as BorrowableRole)) {
      return 'One of the things chosen is not something that built-in role can do, so it cannot be borrowed from it.';
    }
  }
  if (!seen.has('backoffice.enter')) return 'A role you make must be able to open the back office.';
  const grants = input.grants as readonly Grant[];
  if (canSurvey(grants) && grants.some((g) => SEALED_FROM_SURVEY.includes(g.action))) {
    return 'A role that can survey can never see our estimate or a claim’s value. Take away one or the other.';
  }
  return null;
}

/* ------------------------------------------------------------------ the set in memory, for can() */

const REGISTRY = new Map<string, CustomRole>();

export function customRoleOf(key: string): CustomRole | undefined {
  return REGISTRY.get(key);
}

export function isCustomRoleKey(key: string): boolean {
  return REGISTRY.has(key);
}

/** Read every live made role from the database into memory. Called at start-up and after every change. */
export function loadCustomRoles(db: Db): void {
  const roles = db.all<{ role: string; name: string }>('SELECT role, name FROM custom_roles WHERE retired_at IS NULL ORDER BY role');
  const grants = db.all<{ role: string; action: string; as_role: string }>('SELECT role, action, as_role FROM custom_role_grants ORDER BY role, action');
  REGISTRY.clear();
  for (const r of roles) {
    REGISTRY.set(r.role, Object.freeze({
      key: r.role, name: r.name,
      grants: Object.freeze(grants.filter((g) => g.role === r.role).map((g) => Object.freeze({ action: g.action, as_role: g.as_role as BorrowableRole }))),
    }));
  }
}
