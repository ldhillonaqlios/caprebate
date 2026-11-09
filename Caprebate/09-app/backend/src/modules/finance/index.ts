/**
 * FINANCE'S FRONT DOOR: invoices, VAT, billing and filing. Another area imports this module only from here (09-app/ARCHITECTURE.md rule 1).
 * Generated from the imports other areas made on the day the module moved, and kept by hand since: add a name here when
 * another area needs it, never a whole file.
 */
export { billingViewFor, clientsAreaGate, handleBilling } from './billing.ts';
export { getInvoicesIdBusinessIdById2, getInvoicesIdBusinessIdById4, insertInvoicePayments, insertInvoices2 } from './data.ts';
export { handleFinance } from './finance-pages.ts';
export { assertFinanceSection, financeSectionObj, INVOICE_WORDS, PAYMENT_WORDS } from './finance.ts';
export { allocateNumber, claimMoneyLines, CREDIT_BASES, financeDashboard, formatInvoiceNumber, INVOICE_KINDS } from './invoices.ts';
export type { ClaimMoneyLine, FinanceDashboard } from './invoices.ts';
