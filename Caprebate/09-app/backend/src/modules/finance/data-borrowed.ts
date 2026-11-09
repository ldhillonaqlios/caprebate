/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM FINANCE (09-app/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// claims
export function getClaimsCreatedAtNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.created_at, b.name FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?', params);
}
export function getClaimsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.id, c.business_id, c.claim_ref, c.stage, c.created_at, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?', params);
}

// invoice_chases
export function listInvoiceChasesChasedOnHowByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.chased_on, c.how, c.note, u.display_name AS who FROM invoice_chases c LEFT JOIN users u ON u.id = c.chased_by ' +
    'WHERE c.invoice_id = ? ORDER BY c.chased_on DESC, c.rowid DESC', params);
}

// invoice_credit_notes
export function listInvoiceCreditNotesIdBasisByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.basis, c.amount_pence, c.vat_pence, c.issued_on, c.reason, c.recorded_at, u.display_name AS who, n.seq ' +
    'FROM invoice_credit_notes c LEFT JOIN users u ON u.id = c.recorded_by LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id ' +
    'WHERE c.invoice_id = ? ORDER BY c.recorded_at ASC, c.rowid ASC', params);
}

// invoice_payments
export function listInvoicePaymentsIdReceivedOnByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT p.id, p.received_on, p.amount_pence, p.bank_details_confirmed, p.recorded_at, u.display_name AS who, p.voided_at, ' +
    'p.void_reason, v.display_name AS voider FROM invoice_payments p LEFT JOIN users u ON u.id = p.recorded_by ' +
    'LEFT JOIN users v ON v.id = p.voided_by WHERE p.invoice_id = ? ORDER BY p.received_on ASC, p.rowid ASC', params);
}

// invoices
export function getInvoicesIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.id = ?', params);
}
export function getInvoicesIdBusinessIdByIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT i.id, i.business_id, i.claim_value_pence, i.fee_pence, i.invoice_status, i.payment_status, i.vat_position, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, b.name FROM invoices i JOIN businesses b ON b.id = i.business_id WHERE i.id = ? AND i.claim_id IS NULL', params);
}
export function listInvoicesIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by ORDER BY i.invoice_date DESC, n.seq DESC LIMIT ?', params);
}
export function listInvoicesIdBusinessIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.claim_id = ? ORDER BY i.invoice_date ASC, n.seq ASC', params);
}
export function listInvoicesIdBusinessIdByClaimId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.business_id, i.claim_value_pence, i.fee_pence, i.invoice_status, i.payment_status, i.vat_position, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, b.name FROM invoices i JOIN businesses b ON b.id = i.business_id WHERE i.claim_id IS NULL ORDER BY i.created_at DESC, b.name ASC LIMIT ?', params);
}
