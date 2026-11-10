/**
 * WHO MAY ENTER THE COMPLIANCE REGISTERS: the section gates.
 *
 * Kept apart from the rules in src/modules/compliance/compliance.ts so a change to who may open a section is made in one small file (Phase 161l2,
 * the same split as src/modules/crm/crm.permissions.ts). Every view and write still authorises on its own object as well;
 * they only decide whether a login may enter the section at all. Moved here unchanged.
 */
import { authorise, type Actor } from '../../core/index.ts';

const SECTION = '__compliance_section__';

export function complianceObj(id: string = SECTION): { type: 'compliance'; id: string } {
  return { type: 'compliance', id };
}

export function assertComplianceRead(actor: Actor): void {
  authorise(actor, 'compliance.read', complianceObj());
}

export function assertComplianceWrite(actor: Actor): void {
  authorise(actor, 'compliance.write', complianceObj());
}
