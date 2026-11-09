/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE ASSESSMENT (09-app/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// claims
export function listClaimsIdClaimRefByStageClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id ' +
    "WHERE c.stage = 'INVOICE' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.claim_id = c.id AND i.kind = 'FEE' " +
    "AND i.invoice_status IN ('RAISED','SENT') AND i.fee_pence > COALESCE((SELECT SUM(n.amount_pence) FROM invoice_credit_notes n WHERE n.invoice_id = i.id), 0)) " +
    'ORDER BY c.claim_ref ASC', params);
}
export function getInvoicesNByClaimIdInvoiceStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT SUM(i.fee_pence) AS n FROM invoices i WHERE i.claim_id IS NOT NULL AND i.invoice_status IN ('RAISED','SENT') " +
    "AND MIN(i.invoice_date, CASE WHEN i.kind = 'FEE' THEN COALESCE((SELECT MIN(d.issued_on) FROM claim_deliverables d " +
    "WHERE d.claim_id = i.claim_id AND d.kind = 'CLIENT_REPORT' AND d.issued_on IS NOT NULL), i.invoice_date) ELSE i.invoice_date END) " +
    'BETWEEN ? AND ?', params);
}

// surveyor_jobs
export function getSurveyorJobsBusinessIdClaimIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT j.business_id, j.claim_id, b.sector FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id WHERE j.id = ?', params);
}

// finance_settings
export function getFinanceSettingsIdSettingBySettingEffectiveFrom<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT s.id, s.setting, s.value, s.effective_from, s.source, s.recorded_at, u.display_name AS recorder FROM finance_settings s LEFT JOIN users u ON u.id = s.recorded_by WHERE s.setting = ? AND s.effective_from <= ? ORDER BY s.effective_from DESC, s.recorded_at DESC, s.rowid DESC LIMIT 1', params);
}
export function listFinanceSettingsIdSetting<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT s.id, s.setting, s.value, s.effective_from, s.source, s.recorded_at, u.display_name AS recorder FROM finance_settings s LEFT JOIN users u ON u.id = s.recorded_by ORDER BY s.setting ASC, s.effective_from DESC, s.rowid DESC', params);
}
