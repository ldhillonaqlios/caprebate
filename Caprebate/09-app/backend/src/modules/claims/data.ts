/**
 * THE CLAIMS' DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: the claim record, its facts, documents, signing and research. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
// This module's permissions are registered whenever its data is, so every path into the module can ask them.
import './actions.ts';

// claim_contacts
export function getClaimContactsIdByClaimIdContactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM claim_contacts WHERE claim_id = ? AND contact_id = ? AND unlinked_at IS NULL', params);
}
export function getClaimContactsIdClaimIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, claim_id, contact_id, unlinked_at FROM claim_contacts WHERE id = ?', params);
}
export function insertClaimContacts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_contacts (id, claim_id, contact_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?)', params);
}
export function updateClaimContactsUnlinkedAtUnlinkedByByIdUnlinkedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE claim_contacts SET unlinked_at = ?, unlinked_by = ? WHERE id = ? AND unlinked_at IS NULL', params);
}

// claim_deliverables
export function getClaimDeliverablesByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT * FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'DRAFT'", params);
}
export function getClaimDeliverablesCountByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM claim_deliverables cd JOIN claims c ON c.id = cd.claim_id WHERE c.business_id = ? " +
    "AND cd.state IN ('ISSUED','SUPERSEDED') AND cd.issued_on >= ?", params);
}
export function getClaimDeliverablesCountByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'ISSUED' AND updated_at >= ?", params);
}
export function getClaimDeliverablesCountByClaimIdKind2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM claim_deliverables WHERE claim_id = ? AND kind = 'REASONED_NEGATIVE' AND state IN ('ISSUED','SUPERSEDED')", params);
}
export function getClaimDeliverablesCountByLogicalDocumentIdTypeCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM claim_deliverables cd JOIN logical_documents l ON l.id = cd.logical_document_id ' +
    "JOIN claims c ON c.id = cd.claim_id WHERE cd.logical_document_id = ? AND l.type_code = 'CA_REPORT' AND cd.kind = 'CLIENT_REPORT' " +
    "AND cd.state = 'ISSUED' AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = c.id AND s.recorded_at >= " +
    "COALESCE((SELECT MAX(m.at) FROM claim_stage_moves m WHERE m.claim_id = c.id AND m.to_stage = 'TAX_ADVISER_SIGNOFF' " +
    "AND m.kind IN ('FORWARD','REOPEN','OPENED','CONVERTED')), c.created_at))", params);
}
export function getClaimDeliverablesFirstByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT MIN(issued_on) AS first FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' AND state IN ('ISSUED','SUPERSEDED')", params);
}
export function getClaimDeliverablesIdByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'DRAFT'", params);
}
export function getClaimDeliverablesIssuedOnKindByClaimIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT issued_on, kind FROM claim_deliverables WHERE claim_id = ? AND state = 'ISSUED' AND issued_on IS NOT NULL " +
    "AND kind IN ('CLIENT_REPORT','ACCOUNTANT_COMPUTATION_PACK') ORDER BY issued_on ASC, kind ASC LIMIT 1", params);
}
export function getClaimDeliverablesIssuedOnVersionByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT issued_on, version FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'ISSUED' AND updated_at >= ? ORDER BY version DESC LIMIT 1", params);
}
export function getClaimDeliverablesNByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(version) AS n FROM claim_deliverables WHERE claim_id = ? AND kind = ?', params);
}
export function getClaimDeliverablesVersionIssuedOnByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT version, issued_on, content_hash FROM claim_deliverables WHERE claim_id = ? AND kind = ? AND state = 'ISSUED' ORDER BY version DESC LIMIT 1", params);
}
export function insertClaimDeliverables(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, created_by, created_at, updated_by, updated_at) ' +
    "VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)", params);
}
export function insertClaimDeliverables2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_deliverables (id, claim_id, kind, version, document_type, state, issued_on, content_hash, logical_document_id, ' +
    "created_by, created_at, updated_by, updated_at) VALUES (?, ?, ?, 1, ?, 'DRAFT', NULL, NULL, NULL, ?, ?, ?, ?)", params);
}
export function listClaimDeliverablesByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT cd.* FROM claim_deliverables cd JOIN claims c ON c.id = cd.claim_id WHERE c.business_id = ? AND cd.state = 'ISSUED' ORDER BY cd.issued_on ASC, cd.kind ASC", params);
}
export function listClaimDeliverablesByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT * FROM claim_deliverables WHERE claim_id = ? ORDER BY kind ASC, version DESC', params);
}
export function listClaimDeliverablesIdKindByClaimIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, kind, version, state, content_hash FROM claim_deliverables WHERE claim_id = ? AND state IN ('ISSUED','SUPERSEDED') ORDER BY kind ASC, version ASC", params);
}
export function listClaimDeliverablesIdVersionByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, version, issued_on, updated_at FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' AND state = 'ISSUED' " +
    'ORDER BY version ASC', params);
}
export function updateClaimDeliverablesStateIssuedOnById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE claim_deliverables SET state = 'ISSUED', issued_on = ?, content_hash = ?, updated_by = ?, updated_at = ? WHERE id = ?", params);
}
export function updateClaimDeliverablesStateIssuedOnById2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE claim_deliverables SET state = 'ISSUED', issued_on = '2026-09-02', updated_by = ?, updated_at = ? WHERE id = ?", params);
}
export function updateClaimDeliverablesStateUpdatedByByClaimIdKind(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE claim_deliverables SET state = 'SUPERSEDED', updated_by = ?, updated_at = ? WHERE claim_id = ? AND kind = ? AND state = 'ISSUED'", params);
}
export function updateClaimDeliverablesStateUpdatedByByClaimIdKind2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE claim_deliverables SET state = 'SUPERSEDED', updated_by = ?, updated_at = ? WHERE claim_id = ? AND kind IN ('CLIENT_REPORT', 'ACCOUNTANT_COMPUTATION_PACK') AND state = 'ISSUED'", params);
}

// claim_facts
export function getClaimFactsAnswerByClaimIdFactKey<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT answer FROM claim_facts WHERE claim_id = ? AND fact_key = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1', params);
}
export function getClaimFactsAnswerValueDateByClaimIdFactKey<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT answer, value_date FROM claim_facts WHERE claim_id = ? AND fact_key = 'ACCOUNTING_PERIOD_END' ORDER BY recorded_at DESC, rowid DESC LIMIT 1", params);
}
export function insertClaimFacts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_facts (id, claim_id, fact_key, answer, value_text, value_pence, value_date, source_id, note, recorded_by, recorded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertClaimFacts2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_facts (id, claim_id, fact_key, answer, value_text, value_pence, value_date, source_id, note, recorded_by, recorded_at) ' +
    "VALUES (?, ?, ?, 'VALUE', ?, NULL, ?, 'CLIENT_DOC', NULL, ?, ?)", params);
}
export function insertClaimFacts3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_facts (id, claim_id, fact_key, answer, value_text, value_pence, value_date, source_id, note, recorded_by, recorded_at) ' +
    "VALUES (?, ?, 'SBA_STATEMENT_HELD', 'VALUE', 'YES', NULL, NULL, 'CLIENT_DOC', ?, ?, ?)", params);
}

// claim_grant_elements
export function insertClaimGrantElements(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_grant_elements (grant_id, element_id) VALUES (?, ?)', params);
}
export function listClaimGrantElementsGrantIdElementIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.grant_id, e.element_id FROM claim_grant_elements e JOIN claim_grants g ON g.id = e.grant_id WHERE g.claim_id = ?', params);
}

// claim_grants
export function getClaimGrantsCountByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM claim_grants g JOIN claims c ON c.id = g.claim_id WHERE c.business_id = ? " +
    "AND g.source_id = 'CLIENT_DOC' AND g.recorded_at >= ? AND g.withdrawn_at IS NULL", params);
}
export function getClaimGrantsIdWithdrawnAtByIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, withdrawn_at FROM claim_grants WHERE id = ? AND claim_id = ?', params);
}
export function insertClaimGrants(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_grants (id, claim_id, kind, payer_class, amount_pence, amount_basis, traced, traced_elements, source_id, note, recorded_by, recorded_at, paid_to, event_id) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateClaimGrantsWithdrawnByWithdrawnAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE claim_grants SET withdrawn_by = ?, withdrawn_at = ?, withdraw_reason = ? WHERE id = ?', params);
}

// claim_milestones
export function getClaimMilestonesAtByClaimIdMilestone<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT recorded_at AS at FROM claim_milestones WHERE claim_id = ? AND milestone = ? AND recorded_at >= ? ' +
    'ORDER BY recorded_at DESC LIMIT 1', params);
}
export function insertClaimMilestones(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_milestones (id, claim_id, milestone, stage_at, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertClaimMilestones2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO claim_milestones (id, claim_id, milestone, stage_at, note, recorded_by, recorded_at) VALUES (?, ?, 'HMRC_PROCESSED_RELIEF', 'INVOICE', ?, ?, ?)", params);
}

// claim_owner_chain
export function getClaimOwnerChainIdByClaimIdPosition<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM claim_owner_chain WHERE claim_id = ? AND position = ? AND withdrawn_at IS NULL', params);
}
export function getClaimOwnerChainIdWithdrawnAtByIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, withdrawn_at FROM claim_owner_chain WHERE id = ? AND claim_id = ?', params);
}
export function insertClaimOwnerChain(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_owner_chain (id, claim_id, position, owner, acquired_on, ceased_on, claimed, source_id, recorded_by, recorded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateClaimOwnerChainWithdrawnByWithdrawnAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE claim_owner_chain SET withdrawn_by = ?, withdrawn_at = ? WHERE id = ?', params);
}

// claim_reconciliations
export function getClaimReconciliationsByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM claim_reconciliations WHERE claim_id = ?', params);
}
export function getClaimReconciliationsFiledOnByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT filed_on FROM claim_reconciliations WHERE claim_id = ?', params);
}
export function getClaimReconciliationsFiledOnSnapshotHashByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT filed_on, snapshot_hash FROM claim_reconciliations WHERE claim_id = ?', params);
}
export function getClaimReconciliationsIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM claim_reconciliations WHERE claim_id = ?', params);
}
export function getClaimReconciliationsIdFiledOnByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, filed_on FROM claim_reconciliations WHERE claim_id = ?', params);
}
export function getClaimReconciliationsIdSnapshotHashByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, snapshot_hash FROM claim_reconciliations WHERE claim_id = ?', params);
}
export function insertClaimReconciliations(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_reconciliations (id, claim_id, case_id, client_sector, transaction_type, a_value_pence, a_range_low_pence, ' +
    'a_range_high_pence, a_date_captured, a_estimate_hash, a_engine_version, b_value_pence, b_range_low_pence, b_range_high_pence, ' +
    'b_date_captured, b_basis, surveyor_value_pence, surveyor_commitment_id, surveyor_figures_hash, c_value_pence, c_date_captured, ' +
    'c_cta_reviewer, c_signoff_id, opened_at, snapshot_hash, status) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN_OUTCOME_PENDING')", params);
}
export function listClaimReconciliationsClaimIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.claim_id, cl.business_id, cl.claim_ref, r.client_sector, r.b_value_pence, r.c_value_pence, r.d_value_pence, ' +
    'r.resolution_path, r.variance_category, r.status FROM claim_reconciliations r JOIN claims cl ON cl.id = r.claim_id ORDER BY cl.claim_ref ASC', params);
}
export function updateClaimReconciliationsDValuePenceDDateCapturedById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE claim_reconciliations SET d_value_pence = ?, d_date_captured = ?, resolution_path = ?, hmrc_enquiry_opened = ?, amount_realised_pence = ?, " +
    "outcome_recorded_by = ?, outcome_recorded_at = ?, status = 'RECONCILED' WHERE id = ?", params);
}
export function updateClaimReconciliationsFiledOnFiledRecordedByById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE claim_reconciliations SET filed_on = ?, filed_recorded_by = ?, filed_recorded_at = ? WHERE id = ?', params);
}
export function updateClaimReconciliationsVarianceCategoryVarianceNotesById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE claim_reconciliations SET variance_category = ?, variance_notes = ?, variance_recorded_by = ?, variance_recorded_at = ? WHERE id = ?', params);
}

// claim_ref_series
export function insertClaimRefSeries<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('INSERT INTO claim_ref_series (year, last_n) VALUES (?, 1) ' +
    'ON CONFLICT(year) DO UPDATE SET last_n = last_n + 1 RETURNING last_n', params);
}

// claim_return_filings
export function insertClaimReturnFilings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_return_filings (id, claim_id, period_end, filed_on, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listClaimReturnFilingsPeriodEndFiledOnByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT period_end, filed_on FROM claim_return_filings WHERE claim_id = ?', params);
}

// claim_stage_moves
export function getClaimStageMovesAtByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(at) AS at FROM claim_stage_moves WHERE claim_id = ?', params);
}
export function getClaimStageMovesAtByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT at FROM claim_stage_moves WHERE claim_id = ? AND kind = 'EXIT' ORDER BY at DESC, rowid DESC LIMIT 1", params);
}
export function getClaimStageMovesAtByClaimIdKind2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT MAX(at) AS at FROM claim_stage_moves WHERE claim_id = ? AND kind = 'REOPEN' AND to_stage IN (SELECT value FROM json_each(?))", params);
}
export function getClaimStageMovesAtByClaimIdToStage<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT MAX(at) AS at FROM claim_stage_moves WHERE claim_id = ? AND to_stage = ? AND kind IN ('FORWARD','REOPEN','OPENED','CONVERTED')", params);
}
export function getClaimStageMovesReasonCodeByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT reason_code FROM claim_stage_moves WHERE claim_id = ? AND kind = 'EXIT' ORDER BY at DESC, rowid DESC LIMIT 1", params);
}
export function insertClaimStageMoves(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertClaimStageMoves2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) ' +
    'VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)', params);
}
export function insertClaimStageMoves3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) ' +
    "VALUES (?, ?, ?, ?, 'SALES', 'FORWARD', ?, ?, NULL, NULL)", params);
}
export function insertClaimStageMoves4(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) ' +
    "VALUES (?, ?, ?, NULL, NULL, 'CONVERTED', ?, ?, NULL, ?)", params);
}
export function listClaimStageMovesAtKindByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT at, kind, to_stage FROM claim_stage_moves WHERE claim_id = ? ORDER BY at, rowid', params);
}
export function listClaimStageMovesClaimIdAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT claim_id, at, to_stage FROM claim_stage_moves ORDER BY claim_id ASC, at ASC, rowid ASC', params);
}
export function listClaimStageMovesFromStageToStageByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT from_stage, to_stage FROM claim_stage_moves WHERE claim_id = ?', params);
}
export function listClaimStageMovesToStageByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT to_stage FROM claim_stage_moves WHERE claim_id = ?', params);
}

// claim_version_stamps
export function insertClaimVersionStamps(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claim_version_stamps (id, claim_id, deliverable_id, engine_version, rulebook_modules_json, switch_readings_json, ' +
    'signoff_refs_json, estimate_hash, anchor_log_head_hash, stamp_hash, stamped_by, stamped_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// claims
export function getClaimsBById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id AS b FROM claims WHERE id = ?', params);
}
export function getClaimsBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id FROM claims WHERE id = ?', params);
}
export function getClaimsBusinessIdPropertyIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id, property_id FROM claims WHERE id = ?', params);
}
export function getClaimsBusinessIdStageById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id, stage FROM claims WHERE id = ?', params);
}
export function getClaimsClaimRefById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT claim_ref FROM claims WHERE id = ?', params);
}
export function getClaimsCountByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM claims WHERE business_id = ?', params);
}
export function getClaimsCountByBusinessIdStage<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM claims WHERE business_id = ? AND stage IS NOT NULL AND stage NOT IN " +
    "('CLOSED','DECLINED_AT_ENQUIRY','CLIENT_DID_NOT_PROCEED','CLIENT_DECLINED_TO_SIGN','REASONED_NEGATIVE'," +
    "'CLIENT_WITHDREW','OUTSIDE_AMENDMENT_WINDOW','CANCELLED','LOST')", params);
}
export function getClaimsIdAssessmentIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, assessment_id FROM claims WHERE id = ?', params);
}
export function getClaimsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id FROM claims WHERE id = ?', params);
}
export function getClaimsIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, assessment_id, stage FROM claims WHERE id = ?', params);
}
export function getClaimsIdBusinessIdById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, assessment_id, stage, hold_return_stage, hold_reason, tax_adviser_signoff_at, created_at, property_id ' +
    'FROM claims WHERE id = ?', params);
}
export function getClaimsIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, created_at FROM claims WHERE id = ?', params);
}
export function getClaimsIdBusinessIdById5<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, property_id FROM claims WHERE id = ?', params);
}
export function getClaimsIdBusinessIdById6<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, property_id, assessment_id, workstream, stage FROM claims WHERE id = ?', params);
}
export function getClaimsIdBusinessIdById7<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, stage FROM claims WHERE id = ?', params);
}
export function getClaimsIdByBusinessIdAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM claims WHERE business_id = ? AND assessment_id IS NOT NULL ORDER BY claim_ref LIMIT 1', params);
}
export function getClaimsIdByBusinessIdLabel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT c.id FROM claims c JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? AND p.label LIKE '%outpatient annexe'", params);
}
export function getClaimsIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM claims WHERE id = ? AND business_id = ?', params);
}
export function getClaimsIdClaimRefById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, claim_ref, business_id FROM claims WHERE id = ?', params);
}
export function getClaimsIdClaimRefById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, claim_ref, business_id, property_id, assessment_id, stage, created_at FROM claims WHERE id = ?', params);
}
export function getClaimsIdClaimRefById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, claim_ref, business_id, property_id, owner_id FROM claims WHERE id = ?', params);
}
export function getClaimsIdCreatedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, created_at FROM claims WHERE id = ?', params);
}
export function getClaimsIdStageById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, stage FROM claims WHERE id = ?', params);
}
export function getClaimsPById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT property_id AS p FROM claims WHERE id = ?', params);
}
export function getClaimsPropertyIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT property_id FROM claims WHERE id = ?', params);
}
export function getClaimsPropertyIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT property_id FROM claims WHERE id = ? AND business_id = ?', params);
}
export function getClaimsStageBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT stage, business_id, property_id FROM claims WHERE id = ?', params);
}
export function getClaimsStageById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT stage FROM claims WHERE id = ?', params);
}
export function getClaimsStageHoldReturnStageById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT stage, hold_return_stage FROM claims WHERE id = ?', params);
}
export function insertClaims(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO claims (id, claim_ref, business_id, property_id, assessment_id, workstream, stage, ' +
    'owner_id, surveyor_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listClaimsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, business_id, assessment_id FROM claims ORDER BY created_at, id', params);
}
export function listClaimsIdBusinessIdByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, business_id, assessment_id FROM claims WHERE property_id = ?', params);
}
export function listClaimsIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM claims WHERE business_id = ?', params);
}
export function listClaimsIdByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM claims WHERE business_id = ? ORDER BY created_at, id', params);
}
export function listClaimsIdByBusinessIdStage<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id FROM claims WHERE business_id = ? AND stage IN ('ENQUIRY','ASSESSMENT','ENGAGEMENT','DATA_GATHERING','SURVEY','VALUATION','TAX_ADVISER_SIGNOFF','REPORTS','INVOICE','DEFENCE_PACK','ON_HOLD')", params);
}
export function listClaimsIdClaimRefByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.property_id, p.label FROM claims c LEFT JOIN properties p ON p.id = c.property_id ' +
    'WHERE c.business_id = ? ORDER BY c.created_at ASC, c.claim_ref ASC', params);
}
export function listClaimsIdClaimRefByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, p.label AS property FROM claims c LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY c.claim_ref ASC', params);
}
export function listClaimsIdClaimRefByBusinessId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, p.label FROM claims c LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY c.claim_ref', params);
}
export function listClaimsIdClaimRefByBusinessIdLabel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, p.label FROM claims c LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ' +
    'ORDER BY p.label IS NULL, p.label ASC, c.claim_ref ASC', params);
}
export function listClaimsIdClaimRefByOwnerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, claim_ref, business_id, stage FROM claims WHERE owner_id = ? ORDER BY claim_ref ASC', params);
}
export function listClaimsIdClaimRefByStage<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, claim_ref, business_id FROM claims WHERE stage = 'REPORTS' ORDER BY claim_ref ASC", params);
}
export function listClaimsIdPropertyIdByBusinessIdStage<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, property_id FROM claims WHERE business_id = ? AND stage = 'DATA_GATHERING' ORDER BY rowid", params);
}
export function listClaimsIdStageByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, stage, hold_return_stage FROM claims WHERE business_id = ?', params);
}
export function updateClaimsOwnerIdPriorityByBusinessId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE claims SET owner_id = ?, priority = ? WHERE business_id = ?', params);
}
export function updateClaimsOwnerIdSurveyorIdById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE claims SET owner_id = ?, surveyor_id = ?, priority = ?, workstream = ?, property_id = ?, ' +
    'hold_reason = ?, lost_reason = ?, expected_completion = ?, updated_at = ? WHERE id = ?', params);
}
export function updateClaimsStageHoldReturnStageById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE claims SET stage = ?, hold_return_stage = ?, hold_reason = ?, completed_at = ?, updated_at = ? WHERE id = ?', params);
}

// defence_pack_manifests
export function insertDefencePackManifests(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO defence_pack_manifests (deliverable_id, claim_id, manifest_json, fingerprint, made_at) VALUES (?, ?, ?, ?, ?)', params);
}

// document_events
export function getDocumentEventsJobIdAtByDocIdContractStep<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT job_id, at FROM document_events WHERE doc_id = ? AND contract_step = 1 ORDER BY at ASC LIMIT 1', params);
}
export function insertDocumentEvents(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_events (id, job_id, doc_id, contract_step, action, outcome, detail_json, at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listDocumentEventsAtContractStepByDocId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT at, contract_step, action, outcome FROM document_events WHERE doc_id = ? ORDER BY contract_step, at', params);
}
export function listDocumentEventsContractStepActionByDocId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT contract_step, action, outcome, detail_json, at FROM document_events ' +
    'WHERE doc_id = ? ORDER BY at ASC, contract_step ASC', params);
}
export function listDocumentEventsContractStepDetailJsonByDocIdContractStep<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT contract_step, detail_json FROM document_events WHERE doc_id = ? AND contract_step IN (4, 5) AND outcome = ? ORDER BY at ASC', params);
}

// document_field_vouches
export function getDocumentFieldVouchesAnswerByRequestIdFieldId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT answer FROM document_field_vouches WHERE request_id = ? AND field_id = ?', params);
}
export function getDocumentFieldVouchesAnsweredByByRequestIdFieldId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT answered_by FROM document_field_vouches WHERE request_id = ? AND field_id = ?', params);
}
export function getDocumentFieldVouchesFieldIdAnswerByRequestId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT field_id, answer FROM document_field_vouches WHERE request_id = ? ORDER BY field_id LIMIT 1', params);
}
export function insertDocumentFieldVouches(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_field_vouches (id, logical_document_id, field_id, answer, answered_by, answered_at, asked_on) '
    + 'VALUES (?,?,?,?,?,?,?) ON CONFLICT (logical_document_id, field_id) DO UPDATE SET '
    + 'answer = excluded.answer, answered_by = excluded.answered_by, answered_at = excluded.answered_at, '
    + 'asked_on = excluded.asked_on, withdrawn_at = NULL, withdrawn_by = NULL, withdrawn_reason = NULL', params);
}
export function insertDocumentFieldVouches2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_field_vouches (id, request_id, field_id, answer, answered_by, answered_at, asked_on) '
    + "VALUES (?,?,?,?,?,?,'REQUEST') ON CONFLICT (request_id, field_id) DO UPDATE SET "
    + 'answer = excluded.answer, answered_by = excluded.answered_by, answered_at = excluded.answered_at', params);
}
export function listDocumentFieldVouchesFieldIdAnswerByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT field_id, answer, answered_by, answered_at, asked_on, withdrawn_at, withdrawn_by, withdrawn_reason ' +
    'FROM document_field_vouches WHERE logical_document_id = ? ORDER BY field_id', params);
}
export function updateDocumentFieldVouchesLogicalDocumentIdByRequestIdFieldI(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE document_field_vouches SET logical_document_id = ? WHERE request_id = ? AND field_id = ? AND logical_document_id IS NULL '
    + 'AND NOT EXISTS (SELECT 1 FROM document_field_vouches v WHERE v.logical_document_id = ? AND v.field_id = ?)', params);
}
export function updateDocumentFieldVouchesWithdrawnAtWithdrawnByByLogicalDoc(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE document_field_vouches SET withdrawn_at = ?, withdrawn_by = ?, withdrawn_reason = ? WHERE logical_document_id = ? AND field_id = ?', params);
}

// document_links
export function getDocumentLinksCountByLogicalDocumentIdUnlinkedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM document_links WHERE logical_document_id = ? AND unlinked_at IS NULL', params);
}
export function getDocumentLinksIdByLogicalDocumentIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM document_links WHERE logical_document_id = ? AND claim_id = ? AND unlinked_at IS NULL', params);
}
export function getDocumentLinksIdByLogicalDocumentIdPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM document_links WHERE logical_document_id = ? AND property_id = ? AND unlinked_at IS NULL', params);
}
export function getDocumentLinksIdLogicalDocumentIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, logical_document_id, unlinked_at, claim_id FROM document_links WHERE id = ?', params);
}
export function insertDocumentLinks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function insertDocumentLinks2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_links (id, logical_document_id, claim_id, property_id, linked_by, linked_at) VALUES (?, ?, ?, NULL, ?, ?)', params);
}
export function listDocumentLinksClaimIdByLogicalDocumentIdUnlinkedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT claim_id FROM document_links WHERE logical_document_id = ? AND unlinked_at IS NULL AND claim_id IS NOT NULL ORDER BY claim_id', params);
}
export function listDocumentLinksClaimIdByLogicalDocumentIdUnlinkedAt2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.claim_id FROM document_links k WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.claim_id IS NOT NULL ' +
    'UNION SELECT c.id FROM document_links k JOIN claims c ON c.property_id = k.property_id ' +
    'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.property_id IS NOT NULL', params);
}
export function listDocumentLinksIdBusinessIdByLogicalDocumentIdUnlinkedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT c.id, c.business_id FROM document_links k JOIN claims c ON c.id = k.claim_id OR (k.property_id IS NOT NULL AND c.property_id = k.property_id) ' +
    'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL ORDER BY c.id', params);
}
export function listDocumentLinksIdClaimIdByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.id, k.claim_id, c.claim_ref, c.business_id AS claim_business, cp.label AS claim_property, k.property_id, p.label AS property_label, k.linked_at, k.unlinked_at ' +
    'FROM document_links k LEFT JOIN claims c ON c.id = k.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = k.property_id ' +
    'WHERE k.logical_document_id = ? ORDER BY k.linked_at ASC', params);
}
export function listDocumentLinksIdClaimRefByLogicalDocumentIdUnlinkedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, p.label AS property FROM document_links k JOIN claims c ON c.id = k.claim_id LEFT JOIN properties p ON p.id = c.property_id ' +
    'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL ORDER BY c.claim_ref ASC', params);
}
export function updateDocumentLinksUnlinkedAtUnlinkedByByIdUnlinkedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE document_links SET unlinked_at = ?, unlinked_by = ? WHERE id = ? AND unlinked_at IS NULL', params);
}

// document_readings
export function insertDocumentReadings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_readings (id, document_id, at, state, why, fields, not_found, left_out) VALUES (?,?,?,?,?,?,?,?)', params);
}
export function listDocumentReadingsVersionNoAtByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.version_no AS version_no, r.at AS at, r.state AS state, r.why AS why '
    + 'FROM document_readings r JOIN documents d ON d.id = r.document_id '
    + 'WHERE d.logical_document_id = ? ORDER BY r.at DESC', params);
}

// document_visibility
export function getDocumentVisibilityShownToClientByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT shown_to_client FROM document_visibility WHERE logical_document_id = ? ORDER BY set_at DESC, rowid DESC LIMIT 1', params);
}
export function insertDocumentVisibility(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_visibility (id, logical_document_id, shown_to_client, set_by, set_at) VALUES (?, ?, ?, ?, ?)', params);
}

// documents
export function getDocumentsAtByTypeCodeStripRecordedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(d.created_at) AS at FROM documents d JOIN logical_documents l ON l.id = d.logical_document_id ' +
    'WHERE l.type_code = ? AND d.strip_recorded_at IS NOT NULL AND d.quarantine_discharged_at IS NOT NULL AND d.failure_code IS NULL ' +
    'AND l.id IN (SELECT k.logical_document_id FROM document_links k LEFT JOIN claims x ON x.property_id = k.property_id ' +
    'WHERE k.unlinked_at IS NULL AND (k.claim_id = ? OR x.id = ?))', params);
}
export function getDocumentsCreatedAtByBusinessIdContentSha256<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT e.created_at FROM documents e JOIN documents me ON me.id = ? WHERE e.business_id = me.business_id AND e.content_sha256 = ? AND e.id <> me.id ORDER BY e.created_at ASC LIMIT 1', params);
}
export function getDocumentsIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, declared_type, state FROM documents WHERE id = ?', params);
}
export function getDocumentsIdBusinessIdById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, logical_document_id FROM documents WHERE id = ?', params);
}
export function getDocumentsIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM documents WHERE id = ?', params);
}
export function getDocumentsIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM documents WHERE id = ? AND business_id = ?', params);
}
export function getDocumentsIdByLogicalDocumentIdOriginalKeptAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM documents WHERE logical_document_id = ? AND original_kept_at IS NOT NULL AND original_deleted_at IS NULL ' +
    'AND original_delete_after > ? ORDER BY version_no DESC LIMIT 1', params);
}
export function getDocumentsLogicalDocumentIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT logical_document_id FROM documents WHERE id = ?', params);
}
export function getDocumentsMByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(version_no) AS m FROM documents WHERE logical_document_id = ?', params);
}
export function getDocumentsOriginalKeptAtOriginalDeletedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT original_kept_at, original_deleted_at, sniffed_as, filename, logical_document_id FROM documents WHERE id = ?', params);
}
export function getDocumentsTypeCodeById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT type_code FROM documents WHERE id = ?', params);
}
export function insertDocuments(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO documents (id, business_id, uploaded_by, filename, declared_type, state, created_at, ' +
    'logical_document_id, version_no, type_code, retention_ref, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listDocumentsIdFilenameByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, filename, doc_type, state, byte_size, strip_recorded_at, ' +
    'quarantine_discharged_at FROM documents WHERE business_id = ? ORDER BY created_at DESC', params);
}
export function listDocumentsIdLogicalDocumentIdByOriginalKeptAtOriginalDele<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, logical_document_id FROM documents WHERE original_kept_at IS NOT NULL AND original_deleted_at IS NULL AND original_delete_after <= ?', params);
}
export function listDocumentsIdTypeCodeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT d.id, COALESCE(d.type_code, 'document') || ' v' || COALESCE(d.version_no, 1) AS label FROM documents d WHERE d.business_id = ? ORDER BY d.created_at DESC", params);
}
export function listDocumentsIdVersionNoByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, version_no, created_at, state, strip_recorded_at, quarantine_discharged_at, failure_code, original_kept_at, ' +
    'original_delete_after, original_deleted_at FROM documents WHERE logical_document_id = ? ORDER BY version_no DESC', params);
}
export function updateDocumentsByteSizeSniffedAsById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE documents SET byte_size = ?, sniffed_as = ?, content_sha256 = ? WHERE id = ?', params);
}
export function updateDocumentsFailureCodeById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE documents SET failure_code = ? WHERE id = ?', params);
}
export function updateDocumentsOriginalDeletedAtByIdOriginalDeletedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE documents SET original_deleted_at = ? WHERE id = ? AND original_deleted_at IS NULL', params);
}
export function updateDocumentsOriginalKeptAtOriginalDeleteAfterByIdOriginal(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE documents SET original_kept_at = ?, original_delete_after = ? WHERE id = ? AND original_kept_at IS NULL', params);
}
export function updateDocumentsStateDocTypeById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE documents SET state = ?, doc_type = ?, strip_recorded_at = ?, quarantine_discharged_at = ? WHERE id = ?', params);
}

// engagement_required_signers
export function deleteEngagementRequiredSignersByEngagementId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM engagement_required_signers WHERE engagement_id = ?', params);
}
export function insertEngagementRequiredSigners(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO engagement_required_signers (id, engagement_id, user_id, seq, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// engagement_sign_links
export function insertEngagementSignLinks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO engagement_sign_links (id, engagement_id, user_id, token_sha256, sent_to, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateEngagementSignLinksUsedAtByIdUsedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE engagement_sign_links SET used_at = ? WHERE id = ? AND used_at IS NULL', params);
}

// engagement_signatures
export function getEngagementSignaturesCountByEngagementId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM engagement_signatures WHERE engagement_id = ?', params);
}
export function getEngagementSignaturesEngagementIdSignerNameByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT s.engagement_id, s.signer_name FROM engagement_signatures s JOIN engagements e ON e.id = s.engagement_id WHERE e.business_id = ? ORDER BY s.signer_seq ASC', params);
}
export function getEngagementSignaturesPdfSignedAtByEngagementId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT pdf, signed_at FROM engagement_signatures WHERE engagement_id = ? ORDER BY signer_seq DESC LIMIT 1', params);
}
export function insertEngagementSignatures(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO engagement_signatures (id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, ' +
    'authority_confirmed, signed_at, ip, letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, ' +
    'record_version, signature_method, signature_ink, signer_email, letter_prepared_at, letter_sent_at, letter_viewed_at, signer_seq, link_id) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listEngagementSignaturesIdEngagementIdByEngagementId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, engagement_id, business_id, origin, user_id, session_id, signer_name, signer_role, business_name, signed_at, ip, ' +
    'letter_text, letter_sha256, pdf, pdf_sha256, record_sha256, record_version, signature_method, signature_ink, signer_email, ' +
    'letter_prepared_at, letter_sent_at, letter_viewed_at, signer_seq, link_id FROM engagement_signatures WHERE engagement_id = ? ORDER BY signer_seq ASC', params);
}
export function listEngagementSignaturesUserIdNameByEngagementId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT user_id, signer_name AS name, signed_at, origin FROM engagement_signatures WHERE engagement_id = ? ORDER BY signer_seq ASC', params);
}

// engagements
export function getEngagementsAtByBusinessIdLetterState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT signed_at AS at FROM engagements WHERE business_id = ? AND letter_state = 'SIGNED'", params);
}
export function getEngagementsCountByBusinessIdSignedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM engagements WHERE business_id = ? AND signed_at IS NOT NULL', params);
}
export function getEngagementsIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsIdCreatedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, created_at, sent_at, viewed_at FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsIdLetterStateByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, letter_state FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsIdLetterStateByBusinessId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, letter_state, signed_at FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsIdSignedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, signed_at FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsLetterStateSignedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT letter_state, signed_at FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsLetterStateSignedAtByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT letter_state, signed_at, created_at FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsSByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT letter_state AS s FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsSentAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT sent_at FROM engagements WHERE business_id = ?', params);
}
export function getEngagementsStateSignedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT letter_state AS state, signed_at FROM engagements WHERE id = ?', params);
}
export function insertEngagements(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at, sent_at, sent_by) VALUES (?, ?, 'SENT', NULL, ?, ?, ?)", params);
}
export function insertEngagements2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO engagements (id, business_id, letter_state, signed_at, created_at) VALUES (?, ?, ?, ?, ?)', params);
}
export function updateEngagementsLetterStateSentAtByBusinessIdLetterState(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE engagements SET letter_state = 'SENT', sent_at = ?, sent_by = ? WHERE business_id = ? AND letter_state = 'NOT_SENT'", params);
}
export function updateEngagementsLetterStateSignedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE engagements SET letter_state = 'SIGNED', signed_at = ? WHERE id = ?", params);
}
export function updateEngagementsLetterStateViewedAtByBusinessIdLetterState(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE engagements SET letter_state = ?, viewed_at = COALESCE(viewed_at, ?) WHERE business_id = ? AND letter_state = ?', params);
}
export function updateEngagementsLetterStateViewedAtByIdLetterState(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE engagements SET letter_state = 'VIEWED', viewed_at = COALESCE(viewed_at, ?) WHERE id = ? AND letter_state = 'SENT'", params);
}

// fact_approvals
export function getFactApprovalsActionByBusinessIdFactRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT action FROM fact_approvals WHERE business_id = ? AND fact_ref = ? ORDER BY at DESC, rowid DESC LIMIT 1', params);
}
export function insertFactApprovals(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertFactApprovals2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, ?, NULL, ?, ?)', params);
}
export function listFactApprovalsFactRefActionByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT fact_ref, action FROM fact_approvals WHERE business_id = ? AND substr(fact_ref, 1, ?) = ? ORDER BY at ASC, rowid ASC', params);
}

// hmrc_enquiries
export function getHmrcEnquiriesAmendedFigurePenceByClaimIdClosedOn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT amended_figure_pence FROM hmrc_enquiries WHERE claim_id = ? AND closed_on IS NOT NULL AND amended_figure_pence IS NOT NULL ' +
    'ORDER BY closed_on DESC, rowid DESC LIMIT 1', params);
}
export function getHmrcEnquiriesClosedOnOutcomeByClaimIdClosedOn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT closed_on, outcome, amended_figure_pence FROM hmrc_enquiries WHERE claim_id = ? AND closed_on IS NOT NULL ORDER BY closed_on DESC, rowid DESC LIMIT 1', params);
}
export function getHmrcEnquiriesIdByClaimIdClosedOn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM hmrc_enquiries WHERE claim_id = ? AND closed_on IS NULL', params);
}
export function getHmrcEnquiriesIdOpenedOnByIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, opened_on, closed_on FROM hmrc_enquiries WHERE id = ? AND claim_id = ?', params);
}
export function insertHmrcEnquiries(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO hmrc_enquiries (id, claim_id, opened_on, note, opened_by, opened_recorded_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function updateHmrcEnquiriesClosedOnOutcomeById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE hmrc_enquiries SET closed_on = ?, outcome = ?, amended_figure_pence = ?, closed_by = ?, closed_recorded_at = ? WHERE id = ?', params);
}

// logical_documents
export function getLogicalDocumentsCountByBusinessIdTypeCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM logical_documents WHERE business_id = ? AND type_code = ?', params);
}
export function getLogicalDocumentsCountByBusinessIdTypeCode2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM logical_documents WHERE business_id = ? AND type_code = ? AND event_id = ?', params);
}
export function getLogicalDocumentsCountByBusinessIdTypeCode3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM logical_documents WHERE business_id = ? AND type_code = ? AND event_id IS NULL', params);
}
export function getLogicalDocumentsEById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT event_id AS e FROM logical_documents WHERE id = ?', params);
}
export function getLogicalDocumentsIdKindById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT pe.id, pe.kind, pe.event_date FROM logical_documents l JOIN property_events pe ON pe.id = l.event_id WHERE l.id = ?', params);
}
export function getLogicalDocumentsMByBusinessIdTypeCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(seq) AS m FROM logical_documents WHERE business_id = ? AND type_code = ?', params);
}
export function insertLogicalDocuments(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at, event_id) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listLogicalDocumentsId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM logical_documents ORDER BY created_at ASC, id ASC', params);
}
export function listLogicalDocumentsIdSeqByBusinessIdTypeCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, seq, created_at FROM logical_documents WHERE business_id = ? AND type_code = ? ORDER BY created_at DESC, seq DESC', params);
}
export function updateLogicalDocumentsEventIdById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE logical_documents SET event_id = ? WHERE id = ?', params);
}

// properties
export function getPropertiesAcquisitionDateById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT acquisition_date FROM properties WHERE id = ?', params);
}
export function getPropertiesAddressLine1AddressLine2ById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT address_line_1, address_line_2, town, postcode FROM properties WHERE id = ?', params);
}
export function getPropertiesBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id FROM properties WHERE id = ?', params);
}
export function getPropertiesBusinessIdLabelById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id, label FROM properties WHERE id = ?', params);
}
export function getPropertiesBusinessIdTenureById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id, tenure FROM properties WHERE id = ?', params);
}
export function getPropertiesClaimantRoleClaimantRoleSourceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT claimant_role, claimant_role_source FROM properties WHERE id = ?', params);
}
export function getPropertiesCouncilAreaById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT council_area FROM properties WHERE id = ?', params);
}
export function getPropertiesCouncilAreaCouncilAreaSourceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT council_area, council_area_source FROM properties WHERE id = ?', params);
}
export function getPropertiesCountByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM properties WHERE business_id = ?', params);
}
export function getPropertiesDisposalDateById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT disposal_date FROM properties WHERE id = ?', params);
}
export function getPropertiesIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id FROM properties WHERE id = ?', params);
}
export function getPropertiesIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, jurisdiction FROM properties WHERE id = ?', params);
}
export function getPropertiesIdBusinessIdById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, postcode FROM properties WHERE id = ?', params);
}
export function getPropertiesIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM properties WHERE business_id = ? LIMIT 1', params);
}
export function getPropertiesIdByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', params);
}
export function getPropertiesIdByBusinessId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM properties WHERE business_id = ? ORDER BY created_at ASC, rowid ASC LIMIT 1', params);
}
export function getPropertiesIdByIdBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM properties WHERE id = ? AND business_id = ?', params);
}
export function getPropertiesPostcodeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT postcode FROM properties WHERE business_id = ? ORDER BY label ASC LIMIT 1', params);
}
export function getPropertiesPostcodeJurisdictionById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT postcode, jurisdiction FROM properties WHERE id = ?', params);
}
export function getPropertiesTenureById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT tenure FROM properties WHERE id = ?', params);
}
export function getPropertiesTenureTenureSourceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT tenure, tenure_source, lease_end_date, landlord FROM properties WHERE id = ?', params);
}
export function insertProperties(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO properties (id, business_id, label, postcode, address_line_1, town, uprn, created_at, updated_at, claimant_role, claimant_role_source, council_area, council_area_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertProperties2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO properties (id, business_id, label, postcode, created_at, tenure, acquisition_date, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertProperties3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO properties (id, business_id, label, postcode, created_at, tenure, updated_at, town) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertProperties4(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO properties (id, business_id, label, postcode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function insertProperties5(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO properties (id, business_id, label, postcode, created_at) VALUES (?, ?, ?, ?, ?)', params);
}
export function listPropertiesBusinessIdLabelByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT business_id, label, existing_ca_claimed FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', params);
}
export function listPropertiesIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM properties WHERE business_id = ?', params);
}
export function listPropertiesIdByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', params);
}
export function listPropertiesIdLabelByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, label FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', params);
}
export function listPropertiesIdLabelByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, label, postcode FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', params);
}
export function listPropertiesIdLabelByBusinessId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, label, postcode FROM properties WHERE business_id = ? ORDER BY label ASC, id ASC', params);
}
export function listPropertiesLabelByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT label FROM properties WHERE business_id = ? ORDER BY created_at ASC, id ASC', params);
}
export function listPropertiesLabelPostcodeByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT label, postcode FROM properties WHERE business_id = ? ORDER BY label ASC', params);
}
export function updatePropertiesAddressLine1TownByBusinessId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET address_line_1 = ?, town = ?, property_type = ?, property_use = ?, tenure = ?, ' +
    'occupier = ?, acquisition_date = ?, acquisition_price_pence = ?, completion_date = ?, previous_owner = ?, ' +
    'existing_ca_claimed = ?, updated_at = ? WHERE business_id = ?', params);
}
export function updatePropertiesClaimantRoleClaimantRoleSourceById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET claimant_role = ?, claimant_role_source = ?, updated_at = ? WHERE id = ?', params);
}
export function updatePropertiesCouncilAreaCouncilAreaSourceById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET council_area = ?, council_area_source = ?, updated_at = ? WHERE id = ?', params);
}
export function updatePropertiesLabelPostcodeById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET label = ?, postcode = ?, address_line_1 = ?, address_line_2 = ?, town = ?, jurisdiction = ?, ' +
    'property_type = ?, property_use = ?, tenure = ?, occupier = ?, acquisition_date = ?, acquisition_price_pence = ?, ' +
    'completion_date = ?, disposal_date = ?, previous_owner = ?, construction_notes = ?, existing_ca_claimed = ?, ' +
    'prior_claim_notes = ?, updated_at = ? WHERE id = ?', params);
}
export function updatePropertiesLandlordUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET landlord = ?, updated_at = ? WHERE id = ?', params);
}
export function updatePropertiesLeaseEndDateUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET lease_end_date = ?, updated_at = ? WHERE id = ?', params);
}
export function updatePropertiesSaleInProspectUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET sale_in_prospect = ?, updated_at = ? WHERE id = ?', params);
}
export function updatePropertiesTenureSourceById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET tenure_source = ? WHERE id = ?', params);
}
export function updatePropertiesTenureTenureSourceById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET tenure = ?, tenure_source = ?, updated_at = ? WHERE id = ?', params);
}
export function updatePropertiesTenureTownById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE properties SET tenure = ?, town = ? WHERE id = ?', params);
}

// property_events
export function getPropertyEventsIdByIdPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM property_events WHERE id = ? AND property_id = ?', params);
}
export function getPropertyEventsIdPropertyIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, created_at, vat_pence FROM property_events WHERE id = ? AND business_id = ?', params);
}
export function insertPropertyEvents(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO property_events (id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, assessment_id, created_at, created_by) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'ASSESSMENT', ?, ?, NULL)", params);
}
export function insertPropertyEvents2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO property_events (id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, assessment_id, created_at, created_by) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'STAFF', NULL, ?, ?)", params);
}
export function listPropertyEventsIdKindByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT pe.id, pe.kind, pe.event_date, p.label AS property, pe.property_id FROM property_events pe JOIN properties p ON p.id = pe.property_id ' +
    'WHERE pe.business_id = ? ORDER BY p.label ASC, pe.ord ASC', params);
}
export function listPropertyEventsIdPropertyIdByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, property_id, business_id, ord, kind, event_date, cost_pence, vat, source, created_at, vat_pence FROM property_events WHERE property_id = ? ORDER BY ord ASC', params);
}
export function listPropertyEventsLabelKindByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT p.label, e.kind, e.event_date, e.cost_pence FROM property_events e JOIN properties p ON p.id = e.property_id ' +
    'WHERE e.assessment_id = ? ORDER BY p.created_at ASC, p.id ASC, e.ord ASC', params);
}
export function updatePropertyEventsVatVatPenceById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE property_events SET vat = ?, vat_pence = ? WHERE id = ?', params);
}

// return_entry_contexts
export function getReturnEntryContextsPeriodStartIsCompanyByApprovalId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT period_start, is_company, facts_json FROM return_entry_contexts WHERE approval_id = ?', params);
}
export function insertReturnEntryContexts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT OR IGNORE INTO return_entry_contexts (approval_id, period_start, is_company, frozen_by, frozen_at, facts_json) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// site_area_inputs
export function getSiteAreaInputsCountByPropertyIdEnteredAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM site_area_inputs WHERE property_id = ? AND entered_at > ?', params);
}
export function getSiteAreaInputsEastingNorthingByPropertyIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT easting, northing, entered_by, entered_at FROM site_area_inputs WHERE property_id = ? AND kind = 'POINT' " +
    'ORDER BY entered_at DESC, rowid DESC LIMIT 1', params);
}
export function insertSiteAreaInputs(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO site_area_inputs (id, business_id, property_id, kind, easting, northing, lad_code, entered_by, entered_at) VALUES (?, ?, ?, 'NEIGHBOUR_COUNCIL', NULL, NULL, ?, ?, ?)", params);
}
export function insertSiteAreaInputs2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO site_area_inputs (id, business_id, property_id, kind, easting, northing, lad_code, entered_by, entered_at) VALUES (?, ?, ?, 'POINT', ?, ?, NULL, ?, ?)", params);
}
export function listSiteAreaInputsLadCodeEnteredByByPropertyIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT lad_code, entered_by, entered_at FROM site_area_inputs WHERE property_id = ? AND kind = 'NEIGHBOUR_COUNCIL' " +
    'ORDER BY entered_at ASC, rowid ASC', params);
}

// site_area_runs
export function getSiteAreaRunsStateWhyByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT state, why, run_at FROM site_area_runs WHERE property_id = ? ORDER BY run_at DESC, rowid DESC LIMIT 1', params);
}
export function insertSiteAreaRuns(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO site_area_runs (id, business_id, property_id, state, why, run_at, run_by) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}

// tax_adviser_signoffs
export function getTaxAdviserSignoffsCountByApprovalIdRecordedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM tax_adviser_signoffs WHERE approval_id = ? AND recorded_at >= ?', params);
}
export function getTaxAdviserSignoffsIdRecordHashByClaimIdRecordedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, record_hash, figure_pence, signed_on FROM tax_adviser_signoffs WHERE claim_id = ? AND recorded_at >= ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1', params);
}
export function insertTaxAdviserSignoffs(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO tax_adviser_signoffs (id, claim_id, adviser, credential, signed_on, scope, method_note, switch_readings_json, ' +
    'figure_pence, commitment_id, kind, record_hash, recorded_by, recorded_at, approval_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertTaxAdviserSignoffs2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO tax_adviser_signoffs (id, claim_id, adviser, credential, signed_on, scope, method_note, switch_readings_json, ' +
    "figure_pence, commitment_id, kind, record_hash, recorded_by, recorded_at) VALUES (?, ?, 'CAPREBATE_CTA', 'Chartered Tax Adviser', " +
    "'2026-09-01', 'The branch surgery: plant and machinery allowances on the fit-out, invented for the seed.', " +
    "'The surveyor''s figures, checked against our rules. No setting changed.', '[]', ?, ?, 'RECORD_NOT_A_SIGNATURE', ?, ?, ?)", params);
}
export function listTaxAdviserSignoffsIdRecordHashByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, record_hash FROM tax_adviser_signoffs WHERE claim_id = ? ORDER BY recorded_at ASC, rowid ASC', params);
}
export function listTaxAdviserSignoffsIdSignedOnByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, signed_on, recorded_at FROM tax_adviser_signoffs WHERE claim_id = ? ORDER BY recorded_at ASC', params);
}

// title_by_hand
export function getTitleByHandIdRecordIdByPropertyIdTakenBackAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, record_id, title_number, recorded_at FROM title_by_hand WHERE property_id = ? AND taken_back_at IS NULL', params);
}
export function getTitleByHandRecordedByById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT recorded_by FROM title_by_hand WHERE id = ?', params);
}
export function insertTitleByHand(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO title_by_hand (id, business_id, property_id, record_id, title_number, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listTitleByHandTitleNumberTakenBackByByPropertyIdTakenBackAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT title_number, taken_back_by, taken_back_at, taken_back_reason FROM title_by_hand WHERE property_id = ? AND taken_back_at IS NOT NULL ORDER BY taken_back_at DESC', params);
}
export function updateTitleByHandRecordIdRemovedRecordIdById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE title_by_hand SET record_id = NULL, removed_record_id = ?, taken_back_at = ?, taken_back_by = ?, taken_back_reason = ?, look_again_json = ? WHERE id = ?', params);
}

// claims
export function getClaimsIdClaimRefByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.id, c.claim_ref, c.business_id, c.stage, c.hold_return_stage, p.label AS property, p.town FROM claims c LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ? AND c.business_id = ?', params);
}
export function listClaimsIdClaimRefByBusinessIdLabel2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.stage, c.hold_return_stage, p.label AS property, p.town FROM claims c LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY p.label IS NULL, p.label ASC, c.claim_ref ASC', params);
}

// claim_deliverables
export function getClaimDeliverablesCountByClaimIdKind3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM claim_deliverables WHERE claim_id = ? AND kind = 'DEFENCE_PACK' AND state = 'ISSUED'", params);
}
export function getClaimDeliverablesCountByClaimIdKind4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM claim_deliverables WHERE claim_id = ? AND kind IN ('CLIENT_REPORT', 'ACCOUNTANT_COMPUTATION_PACK') AND state = 'ISSUED'", params);
}

// tax_adviser_signoffs
export function getTaxAdviserSignoffsCountByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM tax_adviser_signoffs WHERE claim_id = ?', params);
}

// Moved here from the lower layers' borrowed files: their statements are on this module's tables.
export function getPropertiesIdAddressLine1ByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, address_line_1, address_line_2, town, postcode, jurisdiction, uprn FROM properties WHERE business_id = ? ' +
    'ORDER BY created_at ASC, id ASC LIMIT 1', params);
}
export function getPropertiesIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM properties WHERE id = ? AND business_id = ?', params);
}
export function listPropertiesLabelPostcodeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT label, postcode FROM properties WHERE business_id = ? ORDER BY created_at ASC, label ASC', params);
}
export function listPropertiesPostcode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT postcode FROM properties', params);
}
export function listSiteAreaInputsEastingNorthingByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT easting, northing FROM site_area_inputs WHERE kind = 'POINT'", params);
}
export function listSiteAreaInputsLadCodeByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT lad_code FROM site_area_inputs WHERE kind = 'NEIGHBOUR_COUNCIL'", params);
}

// FOR THE CRM (Phase 161l1): its statements that joined these tables to its own, or to the core's users, now read
// here and look the rest up through the other area's front door (src/modules/crm/data-borrowed.ts).
export function listClaimMilestonesRecordedAtMilestoneRecordedByByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT cm.recorded_at, cm.milestone, cm.recorded_by FROM claim_milestones cm ' +
    'WHERE cm.claim_id = ? ORDER BY cm.recorded_at', params);
}
export function listClaimStageMovesReasonCodeByClaimIdToNegative<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.reason_code FROM claim_stage_moves m ' +
    "WHERE m.claim_id = ? AND m.to_stage = 'REASONED_NEGATIVE' ORDER BY m.at DESC, m.rowid DESC", params);
}
export function listClaimStageMovesAtKindActorIdByClaimIdNewest<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.at, m.kind, m.from_stage, m.to_stage, m.reason_code, m.reason_text, m.actor_id ' +
    'FROM claim_stage_moves m WHERE m.claim_id = ? ORDER BY m.at DESC, m.rowid DESC', params);
}
export function listClaimStageMovesAtKindActorIdByClaimIdOldest<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.at, m.kind, m.from_stage, m.to_stage, m.reason_code, m.reason_text, m.actor_id ' +
    'FROM claim_stage_moves m WHERE m.claim_id = ? ORDER BY m.at, m.rowid', params);
}
export function listClaimContactsIdContactIdLinkedByByClaimIdLinked<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.id, k.contact_id, k.linked_at, k.linked_by FROM claim_contacts k ' +
    'WHERE k.claim_id = ? AND k.unlinked_at IS NULL', params);
}
/** The claims the given ids name: one read by a list of ids, in place of another area's join to claims. */
export function listClaimsIdClaimRefStageByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.stage, c.assessment_id FROM claims c WHERE c.id IN (SELECT value FROM json_each(?))', params);
}
export function listClaimsIdClaimRefOwnerIdByClaimRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.stage, c.hold_return_stage, c.owner_id, ' +
    'c.assessment_id, c.expected_completion, c.completed_at, c.created_at FROM claims c ORDER BY c.claim_ref ASC', params);
}
