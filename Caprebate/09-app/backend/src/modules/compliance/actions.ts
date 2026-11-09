/**
 * COMPLIANCE'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The rules are
 * the same as they were in the one table (src/core/authz.ts), word for word; the core puts every module's together
 * when the module loads (registerActions), and authorise() decides exactly as before. Loaded first by the front door.
 */
import { PREDICATES, registerActions } from '../../core/index.ts';

const { always } = PREDICATES;

export const COMPLIANCE_ACTIONS = registerActions('compliance', {

  /* --- the compliance registers. CRM 8 of 10 ---------------
   *
   * EVERY ROW BELOW IS NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/
   * test/compliance/compliance-registers.test.ts asserts the refusal for each one, per action.
   *
   * NONE OF THIS IS FOR SALES, ACCOUNTING OR SURVEYING, and ADMIN holds it TODAY
   * ONLY because nobody else can. There is no data protection officer role and
   * ADMIN is a super user, not an officer: whether compliance needs a role of its
   * own is the owner's question, "Do we need a compliance role separate from Admin?",
   * and a sixth role is not ENABLED here. One is DEFINED and switched off —
   * `DPO_RULES` and `canAsDpo` below — and while `DPO_ROLE_SWITCH` is off it reaches nothing.
   *
   * THE IDENTITY STORE IS NARROWER THAN EVERYTHING ELSE. `compliance.read` does not
   * reach it and nothing inherits it: a person in S2 is read only through
   * `compliance.identity_read`, by person_ref or by a logged name search, and
   * every read is audited (Dashboard Data Specification, section 7).
   *
   * THE CLIENT'S OWN ROUTE TO THE SHARE-PROGRESS OPT-IN is the one row here for a
   * CLIENT, on their own organisation — withdrawing always, giving only while its
   * switch is on.
   * ------------------------------------------------------------------------ */
  'compliance.read': { ADMIN: always },
  'compliance.write': { ADMIN: always },
  'compliance.identity_read': { ADMIN: always },
  'compliance.identity_write': { ADMIN: always },
  /* The restricted breach names list. ADMIN here only as the door: src/modules/compliance/breach-names.ts
     lets an Admin through only when they are the deputy named in breach_names_deputies (migration 080). */
  'compliance.breach_names': { ADMIN: always },

  /* --- the per-disclosure log. -------------------
   *
   * BOTH ROWS ARE NEW AND EVERY ROLE NOT NAMED IS REFUSED — test/compliance/data-protection-switches.test.ts
   * asserts the refusal for each one, per action. The log is switched off
   * (`DISCLOSURE_LOG` in src/modules/compliance/disclosure-log.ts), so today these rows admit a
   * person to a refusal that says so, and nothing more.
   *
   * RECORDING a disclosure is ADMIN's and SALES's — the people who send a
   * client's papers to a surveyor, a tax adviser or the client's accountant.
   * READING who has received a client's data is a compliance register, ADMIN's
   * alone, as the rights-request register is.
   * ------------------------------------------------------------------------ */
  'disclosure.read': { ADMIN: always },
  'disclosure.record': { ADMIN: always, SALES: always },

  /* --- the audit log is readable by the super user alone ---
   * The CRM follow-on built the page that asks it: /staff/audit, kinds, ids and outcomes and never a value. */
  'audit.read': { ADMIN: always },
});
