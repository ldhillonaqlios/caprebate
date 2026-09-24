/**
 * THE FIVE APPLICATION ROLES — and the two other role vocabularies they are
 * constantly confused with. This file is the only place the three meet.
 *
 * 1. THESE FIVE: Admin, Sales, Accounting, Surveying, Client. Settled
 *    6 September 2026. Who can use the two applications.
 *
 * 2. THE SIX BOARD OWNER TYPES: Claude, CTA, Lakhbir, Surveyor, Solicitor/DPO,
 *    Developer. Who owns a task on the Monday board. NOT modelled here at all —
 *    they describe the project, not the product.
 *
 * 3. THE FIVE ROLES IN caprebate-anchor-quarantine.ts: SURVEYOR, ANALYST,
 *    CLIENT_MANAGER, CTA, CLIENT. That module predates the settled five and has
 *    its own vocabulary. It is the AUTHORITY on the quarantine and is not being
 *    rewritten to match, so the mapping below is what joins them — one place,
 *    tested, rather than a cast at each call site.
 *
 * ACCOUNTING IS CAPREBATE'S OWN FINANCE. It is not the client's accountant, who
 * has no login at all and receives the computation pack offline.
 */

import type { Role as QuarantineRole } from '../../../04-phase-work/phase3/caprebate-anchor-quarantine.ts';
import { canSurvey, customRoleOf, isCustomRoleKey } from './custom-roles.ts';

/**
 * PHASE 132e, 16 September 2026: A SIXTH ROLE, READ_ONLY — "One main log in for
 * admin/manager/owner, and another log for view only" (Lakhbir). What it may do
 * is an explicit yes or no per action in `READ_ONLY_RULES` (src/authz.ts), and
 * it is assigned to nobody. The five below it are unchanged.
 */
export const APP_ROLES = ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING', 'CLIENT', 'READ_ONLY'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(v: unknown): v is AppRole {
  return typeof v === 'string' && (APP_ROLES as readonly string[]).includes(v);
}

/**
 * The join between vocabulary 1 and vocabulary 3.
 *
 * The only thing the quarantine actually decides on is whether a role is in
 * QUARANTINED_ROLES, which today is ['SURVEYOR'] alone. So the mapping that
 * matters is SURVEYING -> 'SURVEYOR'; the rest exist so the module receives a
 * value of its own declared type instead of a cast.
 *
 * ACCOUNTING has no counterpart in that older list, which was written before
 * the finance role existed. It maps to CLIENT_MANAGER — a non-quarantined
 * staff role — because the quarantine's question is "is this the surveyor",
 * and for accounting the answer is no. Accounting's real restriction is a
 * different and stricter one, and it lives in authz.ts and in the shape of the
 * finance tables, not here.
 */
const TO_QUARANTINE: Readonly<Record<AppRole, QuarantineRole>> = {
  ADMIN: 'CLIENT_MANAGER',
  SALES: 'CLIENT_MANAGER',
  ACCOUNTING: 'CLIENT_MANAGER',
  SURVEYING: 'SURVEYOR',
  CLIENT: 'CLIENT',
  /* Phase 132e: THE CONSERVATIVE MAPPING. READ_ONLY never reaches the quarantine — it is on neither
     `estimate.read` nor `surveyor_job.read` — but if a future route ever handed it a survey payload, the
     quarantine would withhold the sealed estimate from it as it does from the surveyor. */
  READ_ONLY: 'SURVEYOR',
};

export function toQuarantineRole(role: AppRole): QuarantineRole {
  if (Object.prototype.hasOwnProperty.call(TO_QUARANTINE, role)) return TO_QUARANTINE[role];
  /* PHASE 151: A ROLE THE SUPER ADMIN MADE (src/custom-roles.ts). It is sent to the quarantine as the SURVEYOR — the
     sealed estimate withheld — unless it holds `estimate.read` itself, which a role that can survey never may. So a
     made role cannot reach the estimate through the survey workspace's payload that it could not read directly. And a
     role nobody knows is the surveyor too: the conservative mapping, as READ_ONLY's is. */
  const made = customRoleOf(role as string);
  if (made !== undefined && !canSurvey(made.grants) && made.grants.some((g) => g.action === 'estimate.read')) return 'CLIENT_MANAGER';
  return 'SURVEYOR';
}

/**
 * A DATA PROTECTION OFFICER ROLE — DEFINED, AND NOT ENABLED. Phase 129, 12 September 2026.
 *
 * It is NOT one of the five and it is not in APP_ROLES, on purpose: whether compliance needs a role separate from Admin is
 * Lakhbir's question — "Do we need a compliance role separate from Admin?" — and the five-role model is a decision. So:
 *   · `isAppRole('DPO')` is false, and `assignRole` refuses it exactly as it refuses any other word;
 *   · the `roles` table (migration 001) has no DPO row, so the database refuses a user holding it;
 *   · what it WOULD reach — the compliance registers and nothing else — is `DPO_RULES` in src/authz.ts, and while
 *     `DPO_ROLE_SWITCH` is off `can()` refuses a DPO actor every action, which is what it did before this existed.
 * Enabling it is three changes, made only once the question is answered: the switch, a migration adding the role row,
 * and the role joining APP_ROLES.
 */
export const DPO_ROLE = 'DPO' as const;

/** Staff roles hold a seat in the back-office application. CLIENT does not. */
export const STAFF_ROLES: readonly AppRole[] = ['ADMIN', 'SALES', 'ACCOUNTING', 'SURVEYING', 'READ_ONLY'];

export function isStaff(role: AppRole): boolean {
  // Phase 151: a role the super admin made is a staff role; it can never borrow a client's rule.
  return STAFF_ROLES.includes(role) || isCustomRoleKey(role as string);
}
