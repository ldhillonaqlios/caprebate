/**
 * FINANCE'S ADDRESSES THE STAFF PAGES ASK: Accounting's clients area and chasing an invoice, and Caprebate's finance.
 * The staff pages' dispatch (src/app/staff.ts) asks each function at the point where its addresses have always been
 * matched, so the order in which every address is tried is unchanged (Phase 162; both were asked there through their own
 * handlers, which they still are: src/modules/finance/billing.ts and finance-pages.ts). Each answers 'handled', or
 * undefined for an address that is not its own.
 */
import type { StaffRequest, WebResult } from '../../core/index.ts';
import { handleBilling } from './billing.ts';
import { handleFinance } from './finance-pages.ts';

const mine = (r: WebResult): WebResult | undefined => (r === 'handled' ? 'handled' : undefined);

/** Accounting's clients area, and chasing an invoice. */
export async function financeBilling(w: StaffRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, method, actor, form, nav, problem } = w;
  return mine(await handleBilling({ app: d.app, newId: d.newId, nav, problem }, req, res, url, method, actor, form));
}

/** Caprebate's finance: invoices, payments, credit notes, the VAT settings. */
export async function financePages(w: StaffRequest): Promise<WebResult | undefined> {
  const { d, req, res, url, method, actor, form, nav, stamp, problem } = w;
  return mine(await handleFinance({ app: d.app, nav, stamp, problem }, req, res, url, method, actor, form));
}
