/**
 * FINANCE'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: invoices, VAT, billing and filing. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';

// invoice_chases
export function insertInvoiceChases(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO invoice_chases (id, invoice_id, chased_on, how, note, chased_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}

// invoice_credit_notes
export function getInvoiceCreditNotesAVByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT SUM(amount_pence) AS a, SUM(vat_pence) AS v FROM invoice_credit_notes WHERE invoice_id = ?', params);
}
export function insertInvoiceCreditNotes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO invoice_credit_notes (id, invoice_id, basis, amount_pence, vat_pence, corrected_claim_value_pence, issued_on, reason, recorded_by, recorded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listInvoiceCreditNotesInvoiceIdAmountPence<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT invoice_id, amount_pence, issued_on FROM invoice_credit_notes', params);
}

// invoice_numbers
export function getInvoiceNumbersCOALESCEMAXSeqN<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM invoice_numbers', params);
}
export function insertInvoiceNumbers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO invoice_numbers (seq, kind, invoice_id, credit_note_id, state, issued_at, issued_by) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateInvoiceNumbersStateCancelledAtByInvoiceIdKind(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE invoice_numbers SET state = 'CANCELLED', cancelled_at = ?, cancelled_by = ? WHERE invoice_id = ? AND kind = 'INVOICE'", params);
}

// invoice_payments
export function getInvoicePaymentsCountByInvoiceIdVoidedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM invoice_payments WHERE invoice_id = ? AND voided_at IS NULL ' +
    "AND (bank_details_confirmed IS NULL OR bank_details_confirmed <> 'OTHER_CHANNEL')", params);
}
export function getInvoicePaymentsIdInvoiceIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, invoice_id, voided_at FROM invoice_payments WHERE id = ?', params);
}
export function getInvoicePaymentsNByInvoiceIdVoidedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT SUM(amount_pence) AS n FROM invoice_payments WHERE invoice_id = ? AND voided_at IS NULL', params);
}
export function insertInvoicePayments(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO invoice_payments (id, invoice_id, received_on, amount_pence, method, bank_details_confirmed, recorded_by, recorded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listInvoicePaymentsInvoiceIdAmountPenceByVoidedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT invoice_id, amount_pence, received_on FROM invoice_payments WHERE voided_at IS NULL', params);
}
export function updateInvoicePaymentsVoidedAtVoidedByById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE invoice_payments SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', params);
}

// invoices
export function getInvoicesCountByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM invoices WHERE claim_id IS NULL', params);
}
export function getInvoicesCountByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM invoices i WHERE i.claim_id = ? AND i.kind = ? AND i.invoice_status IN ('RAISED','SENT') " +
    'AND i.fee_pence > COALESCE((SELECT SUM(c.amount_pence) FROM invoice_credit_notes c WHERE c.invoice_id = i.id), 0)', params);
}
export function getInvoicesIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id FROM invoices WHERE id = ?', params);
}
export function getInvoicesIdBusinessIdById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, claim_id FROM invoices WHERE id = ?', params);
}
export function getInvoicesIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, claim_value_pence, fee_pence, invoice_status, payment_status, vat_position ' +
    'FROM invoices WHERE id = ?', params);
}
export function getInvoicesIdBusinessIdByIdClaimId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id FROM invoices WHERE id = ? AND claim_id IS NOT NULL', params);
}
export function getInvoicesIdByIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM invoices WHERE id = ? AND claim_id IS NOT NULL', params);
}
export function insertInvoices(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, ' +
    'vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, fee_basis, fee_warning, raised_by, created_at, entity_type) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertInvoices2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, ' +
    'vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, sent_on, fee_basis, fee_warning, raised_by, created_at, ' +
    'entity_type, tax_rate, pool_split_main_pence, pool_split_special_pence, period_start) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateInvoicesInvoiceStatusCancelledAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE invoices SET invoice_status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?", params);
}
export function updateInvoicesInvoiceStatusPaymentStatusById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE invoices SET invoice_status = ?, payment_status = ? WHERE id = ?', params);
}
export function updateInvoicesInvoiceStatusSentOnById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE invoices SET invoice_status = 'SENT', sent_on = ? WHERE id = ?", params);
}

// Moved here from other areas' borrowed files: their statements are on this module's tables.
export function getInvoiceCreditNotesIdInvoiceIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, invoice_id, basis, amount_pence FROM invoice_credit_notes WHERE id = ?', params);
}
export function getInvoiceCreditNotesNByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT SUM(amount_pence) AS n FROM invoice_credit_notes WHERE invoice_id = ?', params);
}
export function getInvoiceCreditNotesNByIssuedOn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT SUM(amount_pence) AS n FROM invoice_credit_notes WHERE issued_on >= ? AND issued_on <= ?', params);
}
export function getInvoiceNumbersSeqByInvoiceIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT (SELECT n.seq FROM invoice_numbers n WHERE n.invoice_id = i.id AND n.kind = 'INVOICE') AS seq, i.sent_on, i.fee_pence FROM invoices i " +
    "WHERE i.claim_id = ? AND i.kind = 'FEE' AND i.invoice_status = 'SENT' ORDER BY i.sent_on DESC LIMIT 1", params);
}
export function getInvoicesCountByClaimIdInvoiceStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM invoices WHERE claim_id IS NULL AND invoice_status IN ('RAISED','SENT')", params);
}
export function getInvoicesFeeCountByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM invoices i WHERE i.claim_id = ? AND i.kind = 'FEE' AND i.invoice_status IN ('RAISED','SENT') " +
    'AND i.fee_pence > COALESCE((SELECT SUM(n.amount_pence) FROM invoice_credit_notes n WHERE n.invoice_id = i.id), 0)', params);
}
export function getInvoicesIdClaimIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, claim_id, business_id, kind, fee_pence FROM invoices WHERE id = ?', params);
}
export function getInvoicesSentOnByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT i.sent_on FROM invoices i WHERE i.claim_id = ? AND i.kind = 'FEE' AND i.invoice_status = 'SENT' " +
    'AND i.fee_pence > COALESCE((SELECT SUM(n.amount_pence) FROM invoice_credit_notes n WHERE n.invoice_id = i.id), 0) ORDER BY i.sent_on DESC LIMIT 1', params);
}
export function insertFeeDiscounts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO fee_discounts (id, claim_id, business_id, discount_bp, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertFinanceSettings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO finance_settings (id, setting, value, effective_from, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listInvoicesCreatedAtInvoiceStatusByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT created_at, invoice_status, payment_status FROM invoices WHERE business_id = ? AND claim_id IS NULL ORDER BY created_at', params);
}
