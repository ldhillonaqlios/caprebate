/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM FINANCE (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUsers } from '../../core/index.ts';
import { listClaimsIdBusinessIdStageClaimRefByIds } from '../claims/index.ts';

/*
 * Phase 161l1: what is left here joins the CRM's businesses, which sit above finance in the order (for the CRM's own
 * split). The claims are read through the claims' front door and the users through the core's fillUsers, each put in
 * its place. A JOIN on claims (invoices.claim_id refers to claims) kept exactly the rows with a claim: claim_id IS NOT NULL.
 */
type ClaimCols = { id: string; business_id: string; stage: unknown; claim_ref: unknown; created_at: unknown };
function claimsById(db: Db, ids: readonly unknown[]): Map<string, ClaimCols> {
  const want = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
  return new Map(want.length === 0 ? [] : listClaimsIdBusinessIdStageClaimRefByIds<ClaimCols>(db, [JSON.stringify(want)]).map((c) => [c.id, c]));
}
/** The invoice rows' claim_ref (read as the claim's id) and raiser and canceller (read as users' ids), put in place. */
function invoiceRows<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const claims = claimsById(db, rows.map((r) => r.claim_ref));
  return fillUsers(db, rows, { raiser: 'display_name', canceller: 'display_name' })
    .map((r) => ({ ...r, claim_ref: typeof r.claim_ref === 'string' ? claims.get(r.claim_ref)?.claim_ref ?? null : null }) as Row as T);
}

// claims
export function getClaimsCreatedAtNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const c = claimsById(db, [params[0]]).get(String(params[0]));
  const b = c === undefined ? undefined : db.get<{ name: unknown }>('SELECT b.name FROM businesses b WHERE b.id = ?', [c.business_id]);
  return c === undefined || b === undefined ? undefined : ({ created_at: c.created_at, name: b.name } as Row as T);
}
export function getClaimsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const c = claimsById(db, [params[0]]).get(String(params[0]));
  const b = c === undefined ? undefined : db.get<{ sector: unknown }>('SELECT b.sector FROM businesses b WHERE b.id = ?', [c.business_id]);
  return c === undefined || b === undefined ? undefined
    : ({ id: c.id, business_id: c.business_id, claim_ref: c.claim_ref, stage: c.stage, created_at: c.created_at, sector: b.sector } as Row as T);
}

// invoices
export function getInvoicesIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return invoiceRows<T>(db, db.all('SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, i.claim_id AS claim_ref, b.name AS client_name, n.seq, n.state AS number_state, i.raised_by AS raiser, i.cancelled_by AS canceller FROM invoices i JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' WHERE i.claim_id IS NOT NULL AND i.id = ? LIMIT 1', params))[0];
}
export function getInvoicesIdBusinessIdByIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT i.id, i.business_id, i.claim_value_pence, i.fee_pence, i.invoice_status, i.payment_status, i.vat_position, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, b.name FROM invoices i JOIN businesses b ON b.id = i.business_id WHERE i.id = ? AND i.claim_id IS NULL', params);
}
export function listInvoicesIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return invoiceRows<T>(db, db.all('SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, i.claim_id AS claim_ref, b.name AS client_name, n.seq, n.state AS number_state, i.raised_by AS raiser, i.cancelled_by AS canceller FROM invoices i JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' WHERE i.claim_id IS NOT NULL ORDER BY i.invoice_date DESC, n.seq DESC LIMIT ?', params));
}
export function listInvoicesIdBusinessIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return invoiceRows<T>(db, db.all('SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, i.claim_id AS claim_ref, b.name AS client_name, n.seq, n.state AS number_state, i.raised_by AS raiser, i.cancelled_by AS canceller FROM invoices i JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' WHERE i.claim_id = ? ORDER BY i.invoice_date ASC, n.seq ASC', params));
}
export function listInvoicesIdBusinessIdByClaimId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.business_id, i.claim_value_pence, i.fee_pence, i.invoice_status, i.payment_status, i.vat_position, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, b.name FROM invoices i JOIN businesses b ON b.id = i.business_id WHERE i.claim_id IS NULL ORDER BY i.created_at DESC, b.name ASC LIMIT ?', params);
}
