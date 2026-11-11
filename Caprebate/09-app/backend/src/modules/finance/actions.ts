/**
 * FINANCE'S PERMISSIONS (09-app/docs/ARCHITECTURE.md: each module declares its own actions). The rules are
 * the same as they were in the one table (src/core/authz.ts), word for word; the core puts every module's together
 * when the module loads (registerActions), and authorise() decides exactly as before. Loaded first by the front door.
 */
import { PREDICATES, registerActions } from '../../core/index.ts';

const { always } = PREDICATES;

export const FINANCE_ACTIONS = registerActions('finance', {

  /* --- Caprebate's own finance --- */
  'invoice.read': { ADMIN: always, ACCOUNTING: always },
  'invoice.write': { ADMIN: always, ACCOUNTING: always },
  /*
   * CRM 7 of 10 — FINANCE ON THE CLAIM. EVERY ROW BELOW IS NEW AND EVERY ROLE NOT
   * NAMED IS REFUSED — test/finance/invoices-and-fee-controls.test.ts asserts it per role, per action.
   *
   * RAISING, CREDITING AND RECORDING MONEY RECEIVED ARE ACCOUNTING'S AND ADMIN'S,
   * as the invoice is. None of them takes money: `record_received` records what a
   * person saw arrive, and test/finance/accounting-view.test.ts still refuses any action named for
   * taking a payment. A FINANCE SETTING — the VAT position, the threshold, the
   * margin — IS ADMIN'S ALONE: the monitoring is a director's check, and the person
   * whose invoices it monitors does not move its line.
   */
  'invoice.raise': { ADMIN: always, ACCOUNTING: always },
  /*
   * PHASE 161m1 (Lakhbir, 11 November 2026: "its only the 3% admin can send invoices manually"). A break fee is never
   * raised by the app: an ADMIN raises it by hand, with the amount they enter, when a client ends early. Admin alone.
   */
  'invoice.raise_by_hand': { ADMIN: always },
  'invoice.credit': { ADMIN: always, ACCOUNTING: always },
  'invoice.record_received': { ADMIN: always, ACCOUNTING: always },
  'finance_setting.write': { ADMIN: always },
  /**
   * THE CLIENTS AREA, AS ACCOUNTING READS IT. Word answer 40: Accounting should
   * see the clients area, so it is told to raise the invoice, chases it and records payment. NOT `organisation.read`:
   * the whole record carries the notes, the research, the answers and where the client came from, and opening it to
   * Accounting failed fifteen tests that guard those boundaries. This is the billing view of the same area
   * (src/modules/finance/billing.ts): each client's name, the people to chase and how to reach them, the claims waiting for an
   * invoice, and the invoices with every chase. Read only.
   */
  'client_billing.read': { ADMIN: always, ACCOUNTING: always },
});
