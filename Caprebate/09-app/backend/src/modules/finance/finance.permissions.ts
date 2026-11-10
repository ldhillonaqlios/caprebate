/**
 * WHO MAY ENTER FINANCE'S SECTIONS: Finance, and the Clients tab's billing view: the section gates.
 *
 * Kept apart from the rules in src/modules/finance/finance.ts and billing.ts so a change to who may open a section is made in one small file (Phase 161l2,
 * the same split as src/modules/crm/crm.permissions.ts). Every view and write still authorises on its own object as well;
 * they only decide whether a login may enter the section at all. Moved here unchanged.
 */
import { authorise, can, type Actor } from '../../core/index.ts';

/**
 * THE SECTION GATE — the sentinel-object idiom, which works here.
 *
 * `invoice.read` is ADMIN and ACCOUNTING, both unconditional, and every rule
 * that lets a CLIENT through anywhere in the table is `ownBusiness`. No
 * client's business is this sentinel, so a client is refused by the same table
 * that admits the two finance roles — no new concept and nothing to keep in
 * step. (The surveyor section could not use this; authz.ts explains why.)
 */
const FINANCE_SECTION = '__finance__';

export function assertFinanceSection(actor: Actor): void {
  authorise(actor, 'invoice.read', financeSectionObj());
}

/** The section's sentinel object, for the section-wide actions — a VAT check, a finance setting. CRM 7 of 10. */
export function financeSectionObj(): { readonly type: 'invoice'; readonly id: string; readonly business_id: string } {
  return { type: 'invoice', id: FINANCE_SECTION, business_id: FINANCE_SECTION };
}

const SECTION = '__clients_billing__';

/** Whether this login reads the billing view of a client — the object test, for one client or the whole area. */
export function billingObj(id: string = SECTION): { type: 'business'; id: string } {
  return { type: 'business', id };
}

/** The Clients tab's gate: the whole record (Admin, Sales, read-only) or the billing view of it (Accounting). */
export function clientsAreaGate(actor: Actor): void {
  if (can(actor, 'organisation.read', { type: 'business', id: '__section__' })) return;
  authorise(actor, 'client_billing.read', billingObj());
}

/** Whether to draw the billing view rather than the client record: billing yes, the whole record no. */
export function billingViewFor(actor: Actor, id: string = SECTION): boolean {
  return !can(actor, 'organisation.read', { type: 'business', id }) && can(actor, 'client_billing.read', billingObj(id));
}
