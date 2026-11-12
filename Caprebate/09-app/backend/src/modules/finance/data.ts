/**
 * FINANCE'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: invoices, VAT, billing and filing. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUser, fillUsers } from '../../core/index.ts';
// The claims, and the organisations (the client record's), read through their front doors (Phase 161l2).
import { listClaimsIdBusinessIdStageClaimRefByIds } from '../claims/index.ts';
import { byId, getBusinessesNameById, getBusinessesSectorById, idsOf, listBusinessesIdNameByIds, sqlOrder } from '../clients/index.ts';
// This module's permissions are registered whenever its data is, so every path into the module can ask them.
import './actions.ts';

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

// invoice_credit_notes and invoice_payments, for their emails (Phase 161m2: src/modules/finance/invoices.ts, section 9)
export function getInvoiceCreditNotesEmailById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.id, c.invoice_id, c.basis, c.amount_pence, c.vat_pence, c.corrected_claim_value_pence, n.seq ' +
    'FROM invoice_credit_notes c LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id WHERE c.id = ?', params);
}
export function getInvoicePaymentsEmailById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, invoice_id, amount_pence, voided_at FROM invoice_payments WHERE id = ?', params);
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
/** Phase 161m1: an organisation's live break-fee invoices (raised or sent, not cancelled, not credited in full). One break fee an agreement. */
export function listInvoicesLiveBreakFeeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT i.id, i.claim_id FROM invoices i WHERE i.business_id = ? AND i.kind = 'BREAK_FEE' AND i.invoice_status IN ('RAISED','SENT') " +
    'AND i.fee_pence > COALESCE((SELECT SUM(c.amount_pence) FROM invoice_credit_notes c WHERE c.invoice_id = i.id), 0)', params);
}
export function insertInvoices(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, ' +
    'vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, fee_basis, fee_warning, raised_by, created_at, entity_type, versions_json) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertInvoices2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO invoices (id, business_id, claim_id, kind, claim_value_pence, fee_pence, fee_rate, invoice_status, payment_status, ' +
    'vat_position, vat_setting_id, vat_pence, invoice_date, due_on, due_basis, sent_on, fee_basis, fee_warning, raised_by, created_at, ' +
    'entity_type, tax_rate, pool_split_main_pence, pool_split_special_pence, period_start, versions_json) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
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
export function insertFinanceSettings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO finance_settings (id, setting, value, effective_from, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listInvoicesCreatedAtInvoiceStatusByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT created_at, invoice_status, payment_status FROM invoices WHERE business_id = ? AND claim_id IS NULL ORDER BY created_at', params);
}

// THE VAT READING'S OWN ROWS (Phase 161l2, src/modules/finance/vat.ts; from src/modules/assessment/data-borrowed.ts).
// The dated settings, text unchanged: the recorder's name is the core's, put in its place by fillUser(s).
export function getFinanceSettingsIdSettingBySettingEffectiveFrom<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT s.id, s.setting, s.value, s.effective_from, s.source, s.recorded_at, s.recorded_by AS recorder FROM finance_settings s WHERE s.setting = ? AND s.effective_from <= ? ORDER BY s.effective_from DESC, s.recorded_at DESC, s.rowid DESC LIMIT 1', params), { recorder: 'display_name' });
}
export function listFinanceSettingsIdSetting<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT s.id, s.setting, s.value, s.effective_from, s.source, s.recorded_at, s.recorded_by AS recorder FROM finance_settings s ORDER BY s.setting ASC, s.effective_from DESC, s.rowid DESC', params), { recorder: 'display_name' });
}
// The two reads that joined the claims' tables, split: the invoices' side here, the claims' side through their door.
/** The claims with a live fee invoice: raised or sent, and not wholly credited. */
export function listInvoicesClaimIdByKindInvoiceStatusLive<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT DISTINCT i.claim_id FROM invoices i WHERE i.claim_id IS NOT NULL AND i.kind = 'FEE' " +
    "AND i.invoice_status IN ('RAISED','SENT') AND i.fee_pence > COALESCE((SELECT SUM(n.amount_pence) FROM invoice_credit_notes n WHERE n.invoice_id = i.id), 0)", params);
}
/** Every raised or sent invoice on a claim, with what its tax point is read from. */
export function listInvoicesClaimIdKindByInvoiceStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT i.claim_id, i.kind, i.invoice_date, i.fee_pence FROM invoices i WHERE i.claim_id IS NOT NULL AND i.invoice_status IN ('RAISED','SENT')", params);
}

// Phase 161l1: these joined users (the core); each user's name is put in its place by the core's fillUsers.
export function listInvoiceChasesChasedOnHowByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT c.chased_on, c.how, c.note, c.chased_by AS who FROM invoice_chases c ' +
    'WHERE c.invoice_id = ? ORDER BY c.chased_on DESC, c.rowid DESC', params), { who: 'display_name' });
}
export function listInvoiceCreditNotesIdBasisByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT c.id, c.basis, c.amount_pence, c.vat_pence, c.issued_on, c.reason, c.recorded_at, c.recorded_by AS who, n.seq ' +
    'FROM invoice_credit_notes c LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id ' +
    'WHERE c.invoice_id = ? ORDER BY c.recorded_at ASC, c.rowid ASC', params), { who: 'display_name' });
}
export function listInvoicePaymentsIdReceivedOnByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT p.id, p.received_on, p.amount_pence, p.bank_details_confirmed, p.recorded_at, p.recorded_by AS who, p.voided_at, ' +
    'p.void_reason, p.voided_by AS voider FROM invoice_payments p ' +
    'WHERE p.invoice_id = ? ORDER BY p.received_on ASC, p.rowid ASC', params), { who: 'display_name', voider: 'display_name' });
}

// FOR THE CRM (Phase 161l1): its statements that joined these tables to the core's users or the audit log now read
// here and look the rest up through the other area's front door (src/modules/clients/data-borrowed.ts, emptied in Phase 161l2).
export function listInvoiceCreditNotesRecordedAtBasisRecordedByByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.recorded_at, c.basis, n.seq, c.recorded_by FROM invoice_credit_notes c LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id ' +
    'WHERE c.invoice_id = ? ORDER BY c.recorded_at', params);
}
export function listInvoicePaymentsRecordedAtVoidedAtRecordedByByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT p.recorded_at, p.voided_at, p.recorded_by, p.voided_by FROM invoice_payments p ' +
    'WHERE p.invoice_id = ? ORDER BY p.recorded_at', params);
}
export function listInvoicesIdKindRaisedByByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.kind, i.created_at, i.cancelled_at, n.seq, i.raised_by, i.cancelled_by FROM invoices i ' +
    "LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = 'INVOICE' " +
    'WHERE i.claim_id = ? ORDER BY i.created_at', params);
}
export function listInvoicesIdByBusinessIdWithoutClaim<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id FROM invoices i WHERE i.business_id = ? AND i.claim_id IS NULL', params);
}
export function listInvoicesIdFeeByClaimIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.fee_pence AS fee FROM invoices i WHERE i.claim_id IN (SELECT value FROM json_each(?)) ' +
    "AND i.invoice_status IN ('RAISED','SENT')", params);
}
/**
 * The search's invoices by number (src/modules/crm/search.ts): every match on a claim, by number; the search keeps 25.
 * An invoice by its number — CB-000123, 000123 or 123 — or by the start of it as it is printed: "CB-0", "CB-00012". Never
 * by an amount. The CRM follow-on added the prefix: a whole number was the only thing that found anything. Exported as
 * text too, for test/core/global-search.test.ts, which reads every statement the search can run.
 */
export const INVOICE_NUMBER_SEARCH =
  'SELECT n.seq, i.id, i.business_id, i.claim_id FROM invoice_numbers n JOIN invoices i ON i.id = n.invoice_id ' +
  "WHERE n.kind = 'INVOICE' AND (n.seq = ? OR printf('%06d', n.seq) LIKE ?) AND i.claim_id IS NOT NULL ORDER BY n.seq ASC";
export function listInvoiceNumbersSeqInvoiceIdBySeqLike<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(INVOICE_NUMBER_SEARCH, params);
}

/*
 * Phase 161l2: THE INVOICES AND CLAIMS THAT JOINED THE ORGANISATION, SPLIT (from this module's borrowed file). Each
 * statement joined the organisation (businesses), the client record's (src/modules/clients/, below finance; not the
 * CRM's since Phase 161l1). Now this module reads its own rows, with the organisation's id standing where its name
 * stood, and the client record's door gives the name, put in its place. The JOIN was an inner one, so a row whose
 * organisation is not found is left out, and any LIMIT is applied after that, as the join applied it. The claims
 * through the claims' front door and the users through the core's fillUsers, as Phase 161l1 split them. A JOIN on
 * claims (invoices.claim_id refers to claims) kept exactly the rows with a claim: claim_id IS NOT NULL.
 * test/finance/borrowed-split-161l2.test.ts keeps each original statement and compares.
 */
type ClaimCols = { id: string; business_id: string; stage: unknown; claim_ref: unknown; created_at: unknown };
function claimsById(db: Db, ids: readonly unknown[]): Map<string, ClaimCols> {
  const want = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
  return new Map(want.length === 0 ? [] : listClaimsIdBusinessIdStageClaimRefByIds<ClaimCols>(db, [JSON.stringify(want)]).map((c) => [c.id, c]));
}
/** The organisation's name in place of its id at `key`; a row whose organisation is not found is left out (the inner JOIN). */
function withClientName(db: Db, rows: readonly Row[], key: string): Row[] {
  const names = byId(listBusinessesIdNameByIds<{ id: string; name: unknown }>(db, [idsOf(rows.map((r) => r[key]))]));
  const out: Row[] = [];
  for (const r of rows) {
    const b = typeof r[key] === 'string' ? names.get(r[key] as string) : undefined;
    if (b !== undefined) out.push({ ...r, [key]: b.name ?? null });
  }
  return out;
}
/** The invoice rows' claim_ref (read as the claim's id) and raiser and canceller (read as users' ids), put in place. */
function invoiceRows<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const claims = claimsById(db, rows.map((r) => r.claim_ref));
  return fillUsers(db, rows, { raiser: 'display_name', canceller: 'display_name' })
    .map((r) => ({ ...r, claim_ref: typeof r.claim_ref === 'string' ? claims.get(r.claim_ref)?.claim_ref ?? null : null }) as Row as T);
}
/** The LIMIT ? the joined statement ended with (its last parameter), applied after the rows with no organisation are left out. */
function limitOf(params: readonly Param[]): number {
  const n = Number(params[params.length - 1]);
  return Number.isFinite(n) && n >= 0 ? n : Infinity;
}

// claims, with the organisation's name or sector
export function getClaimsCreatedAtNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const c = claimsById(db, [params[0]]).get(String(params[0]));
  const b = c === undefined ? undefined : getBusinessesNameById<{ name: unknown }>(db, [c.business_id]);
  return c === undefined || b === undefined ? undefined : ({ created_at: c.created_at, name: b.name } as Row as T);
}
export function getClaimsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const c = claimsById(db, [params[0]]).get(String(params[0]));
  const b = c === undefined ? undefined : getBusinessesSectorById<{ sector: unknown }>(db, [c.business_id]);
  return c === undefined || b === undefined ? undefined
    : ({ id: c.id, business_id: c.business_id, claim_ref: c.claim_ref, stage: c.stage, created_at: c.created_at, sector: b.sector } as Row as T);
}

// invoices on a claim, with the claim's reference, the organisation's name, the number, and who raised and cancelled each
const CLAIM_INVOICE = 'SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, i.claim_id AS claim_ref, i.business_id AS client_name, n.seq, n.state AS number_state, i.raised_by AS raiser, i.cancelled_by AS canceller FROM invoices i LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' ';
export function getInvoicesIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return invoiceRows<T>(db, withClientName(db, db.all(CLAIM_INVOICE + 'WHERE i.claim_id IS NOT NULL AND i.id = ?', params), 'client_name').slice(0, 1))[0];
}
export function listInvoicesIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return invoiceRows<T>(db, withClientName(db, db.all(CLAIM_INVOICE + 'WHERE i.claim_id IS NOT NULL ORDER BY i.invoice_date DESC, n.seq DESC'), 'client_name').slice(0, limitOf(params)));
}
export function listInvoicesIdBusinessIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return invoiceRows<T>(db, withClientName(db, db.all(CLAIM_INVOICE + 'WHERE i.claim_id = ? ORDER BY i.invoice_date ASC, n.seq ASC', params), 'client_name'));
}
// the organisation's own invoices (no claim), with its name
const OWN_INVOICE = 'SELECT i.id, i.business_id, i.claim_value_pence, i.fee_pence, i.invoice_status, i.payment_status, i.vat_position, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, i.business_id AS name FROM invoices i ';
export function getInvoicesIdBusinessIdByIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return withClientName(db, db.all(OWN_INVOICE + 'WHERE i.id = ? AND i.claim_id IS NULL', params), 'name')[0] as T | undefined;
}
/** ORDER BY i.created_at DESC, b.name ASC LIMIT ?: the name is the client record's, so the second key is sorted here, after the read. */
export function listInvoicesIdBusinessIdByClaimId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = withClientName(db, db.all(OWN_INVOICE + 'WHERE i.claim_id IS NULL ORDER BY i.created_at DESC'), 'name');
  return rows.sort((a, b) => sqlOrder(b.created_at, a.created_at) || sqlOrder(a.name, b.name)).slice(0, limitOf(params)) as T[];
}
/** Phase 161m: the versions an invoice was raised with (migration 122); null before then. */
export function getInvoicesVersionsJsonById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT versions_json FROM invoices WHERE id = ?', params);
}
