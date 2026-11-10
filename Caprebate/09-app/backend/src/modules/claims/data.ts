/**
 * THE CLAIMS' DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: the claim record, its facts, documents, signing and research. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUser, fillUsers } from '../../core/index.ts';
import { listRegisterRecordsIdSourceIdBySourceIdBusinessIdEntityIds } from '../../integrations/index.ts';
// Phase 161l2: the client record's half of the statements the claims split, and the assessment's dates (both below).
import { getBusinessesIdOwnerIdById, getBusinessesNameCompanyNumberById, listBusinessesBusinessIdNameSectorStageById, listBusinessesBusinessIdNameSectorStageNewest, listClientTasksDocumentRequestsByBusinessId, listClientTasksDocumentRequestsByBusinessIdClaimId } from '../clients/index.ts';
import { listAssessmentsBusinessIdSubmittedAtByBusinessIds } from '../assessment/index.ts';
import { getSurveyPackLegalAnswersValueJsonAtByPropertyIdClaimIdsG9d, listSurveyorJobsSurveyorIdByClaimIds, listSurveyPackApprovalsIdFingerprintSnapshotJsonByClaimId, listSurveyPackApprovalsSnapshotJsonVersionByPropertyIdClaimIds } from './above-ports.ts';
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

// FOR FINANCE'S VAT READING (Phase 161l2, src/modules/finance/vat.ts): its statements joined these tables to the client
// record's organisations and finance's own invoices; each now reads its own rows and looks these up by the claim.
/** The claims at the invoice stage, in claim reference order. */
export function listClaimsIdClaimRefByStage2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT c.id, c.claim_ref, c.business_id FROM claims c WHERE c.stage = 'INVOICE' ORDER BY c.claim_ref ASC", params);
}
/** Each claim's first issued client report: the date the VAT tax point may be brought forward to. */
export function listClaimDeliverablesClaimIdFirstIssuedOnByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT d.claim_id, MIN(d.issued_on) AS first_issued_on FROM claim_deliverables d WHERE d.kind = 'CLIENT_REPORT' " +
    'AND d.issued_on IS NOT NULL GROUP BY d.claim_id', params);
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
// The retention list's count of document links (src/modules/compliance/compliance-identity.ts), text unchanged from it.
export function getDocumentLinksCount<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM document_links', params);
}
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
// The retention list's count of document versions (src/modules/compliance/compliance-identity.ts), text unchanged from it.
export function getDocumentsCountVersions<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM documents WHERE logical_document_id IS NOT NULL', params);
}
// The document version a person named on a document points at (src/modules/compliance/compliance-identity.ts readPerson).
export function getDocumentsTypeCodeCreatedAtRetentionRefById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT type_code, created_at, retention_ref FROM documents WHERE id = ?', params);
}
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
// The retention list's count of documents (src/modules/compliance/compliance-identity.ts), text unchanged from it.
export function getLogicalDocumentsCount<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM logical_documents', params);
}
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

// Phase 161l1: read by a list of ids (a JSON array), for the areas above that joined these tables to their own rows.
// Each reads its own rows with the id where the joined columns stood, then puts these columns in their places.
export function listClaimsIdBusinessIdStageClaimRefByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, business_id, stage, claim_ref, property_id, created_at FROM claims WHERE id IN (SELECT value FROM json_each(?))', params);
}
export function listPropertiesIdLabelPostcodeByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, label, postcode FROM properties WHERE id IN (SELECT value FROM json_each(?))', params);
}
export function listClaimGrantsAmountPenceByClaimIdPaidTo<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT g.amount_pence FROM claim_grants g WHERE g.claim_id = ? AND g.paid_to = 'PAST_OWNER' AND g.withdrawn_at IS NULL", params);
}
// The client's documents for the portal; type_label holds the type's code, for the portal to put the label in its place.
export function getDocumentsIdBusinessIdTypeCodeById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT d.id, d.business_id, d.filename, d.declared_type, d.doc_type, d.byte_size, d.sniffed_as, d.state, d.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, d.logical_document_id, d.version_no, d.original_kept_at, d.original_deleted_at, d.type_code AS type_label, l.seq FROM documents d LEFT JOIN logical_documents l ON l.id = d.logical_document_id WHERE d.id = ?', params);
}
export function listDocumentsIdBusinessIdTypeCodeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.id, d.business_id, d.filename, d.declared_type, d.doc_type, d.byte_size, d.sniffed_as, d.state, d.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, d.logical_document_id, d.version_no, d.original_kept_at, d.original_deleted_at, d.type_code AS type_label, l.seq FROM documents d LEFT JOIN logical_documents l ON l.id = d.logical_document_id WHERE d.business_id = ? ORDER BY d.created_at DESC', params);
}

// Phase 161l1: these joined users (the core) or the register records (the outside services), both below the claims.
// Each reads this module's rows with the id where the joined column stood; the core's fillUsers (or the outside
// services' read) puts the column in its place: the same rows, in the same order, with the same keys in the same places.
export function listClaimFactsIdFactKeyByClaimIdFactKey<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
    'f.recorded_by AS recorder FROM claim_facts f ' +
    'WHERE f.claim_id = ? AND f.fact_key = ? ORDER BY f.recorded_at DESC, f.rowid DESC', params), { recorder: 'display_name' });
}
export function listClaimFactsSeqIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT f.rowid AS seq, f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
    'f.recorded_by AS recorder FROM claim_facts f WHERE f.claim_id = ? ' +
    'ORDER BY f.recorded_at ASC, f.rowid ASC', params), { recorder: 'display_name' });
}
export function listClaimGrantsIdKindByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT g.id, g.kind, g.payer_class, g.amount_pence, g.amount_basis, g.traced, g.traced_elements, g.source_id, g.note, ' +
    'g.recorded_at, g.recorded_by AS recorder, g.withdrawn_at, g.withdraw_reason, g.paid_to, g.event_id FROM claim_grants g ' +
    'WHERE g.claim_id = ? ORDER BY g.recorded_at ASC, g.rowid ASC', params), { recorder: 'display_name' });
}
export function listClaimOwnerChainIdPositionByClaimIdWithdrawnAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT o.id, o.position, o.owner, o.acquired_on, o.ceased_on, o.claimed, o.source_id, o.recorded_at, o.recorded_by AS recorder ' +
    'FROM claim_owner_chain o WHERE o.claim_id = ? AND o.withdrawn_at IS NULL ORDER BY o.position ASC', params), { recorder: 'display_name' });
}
export function getClaimStageMovesAtWhoByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT m.at, m.actor_id AS who, m.reason_text AS reason, m.to_stage AS "to" FROM claim_stage_moves m ' +
    "WHERE m.claim_id = ? AND m.kind = 'REOPEN' AND m.to_stage IN (SELECT value FROM json_each(?)) ORDER BY m.at DESC, m.rowid DESC LIMIT 1", params), { who: 'display_name' });
}
export function getDocumentsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT d.id, d.business_id, d.type_code, d.request_id, d.logical_document_id, d.version_no, d.strip_recorded_at, ' +
    'd.quarantine_discharged_at, d.failure_code, d.uploaded_by, d.uploaded_by AS role FROM documents d WHERE d.id = ?', params), { role: 'role' });
}
export function getDocumentsLogicalDocumentIdUploadedByByIdTypeCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT d.logical_document_id, d.uploaded_by, d.uploaded_by AS role, d.version_no FROM documents d JOIN logical_documents l ON l.id = d.logical_document_id ' +
    'WHERE d.id = ? AND l.type_code = ? AND d.strip_recorded_at IS NOT NULL ' +
    'AND d.quarantine_discharged_at IS NOT NULL AND d.failure_code IS NULL', params), { role: 'role' });
}
export function getDocumentsRoleById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT d.uploaded_by AS role FROM documents d WHERE d.id = ?', params), { role: 'role' });
}
export function listEngagementRequiredSignersUserIdSeqByEngagementId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT r.user_id, r.seq, r.user_id AS name, r.user_id AS email FROM engagement_required_signers r ' +
    'WHERE r.engagement_id = ? ORDER BY r.seq ASC', params), { name: 'display_name', email: 'email' });
}
export function getEngagementsIdLetterStateByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT e.id, e.letter_state, e.created_at, e.sent_at, e.sent_by, e.viewed_at, e.signed_at FROM engagements e WHERE e.business_id = ?', params), { sent_by: 'display_name' });
}
export function listFactApprovalsFactRefActionByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT a.fact_ref, a.action, a.reason, a.at, a.actor_id AS who FROM fact_approvals a ' +
    'WHERE a.business_id = ? ORDER BY a.at ASC, a.rowid ASC', params), { who: 'display_name' });
}
export function listHmrcEnquiriesIdOpenedOnByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT e.id, e.opened_on, e.note, e.closed_on, e.outcome, e.amended_figure_pence, e.opened_recorded_at, e.opened_by AS opener ' +
    'FROM hmrc_enquiries e WHERE e.claim_id = ? ORDER BY e.opened_on DESC, e.rowid DESC', params), { opener: 'display_name' });
}
export function getLogicalDocumentsRoleById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT l.created_by AS role FROM logical_documents l WHERE l.id = ?', params), { role: 'role' });
}
/** The role of the person who made the logical document (none when there is no such document). */
export function getUsersRoleById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return getLogicalDocumentsRoleById<T>(db, params);
}
export function listDocumentsIdLogicalDocumentIdByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT d.id, d.logical_document_id, d.version_no, d.type_code, d.retention_ref, d.request_id, d.state, d.doc_type, d.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, d.uploaded_by AS uploader_role, d.original_kept_at, d.original_delete_after, d.original_deleted_at FROM documents d WHERE d.logical_document_id = ? ORDER BY d.version_no DESC', params), { uploader_role: 'role' });
}
export function getTaxAdviserSignoffsIdClaimIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT s.id, s.claim_id, s.adviser, s.credential, s.signed_on, s.scope, s.method_note, s.switch_readings_json, s.figure_pence, s.commitment_id, s.record_hash, s.recorded_at, s.recorded_by AS recorder, s.approval_id FROM tax_adviser_signoffs s WHERE s.claim_id = ? ORDER BY s.recorded_at DESC, s.rowid DESC LIMIT 1', params), { recorder: 'display_name' });
}
export function getTaxAdviserSignoffsIdClaimIdByClaimIdRecordedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT s.id, s.claim_id, s.adviser, s.credential, s.signed_on, s.scope, s.method_note, s.switch_readings_json, s.figure_pence, s.commitment_id, s.record_hash, s.recorded_at, s.recorded_by AS recorder, s.approval_id FROM tax_adviser_signoffs s WHERE s.claim_id = ? AND s.recorded_at >= ? ORDER BY s.recorded_at DESC, s.rowid DESC LIMIT 1', params), { recorder: 'display_name' });
}
/** The register records read from a client's document: any version of the logical document (params: business, document). */
export function listRegisterRecordsIdSourceIdBySourceIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const versions = db.all<{ id: string }>('SELECT v.id FROM documents v WHERE v.logical_document_id = ?', [params[1] ?? null]).map((v) => v.id);
  return versions.length === 0 ? [] : listRegisterRecordsIdSourceIdBySourceIdBusinessIdEntityIds<T>(db, [params[0] ?? null, JSON.stringify(versions)]);
}
// For the seed (src/app/seed.ts), which writes and reads each area's rows through its front door.
export function getClaimsIdByBusinessIdAssessmentIdNotNull<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM claims WHERE business_id = ? AND assessment_id IS NOT NULL ORDER BY claim_ref LIMIT 1', params);
}
export function getClaimsIdByBusinessIdAssessmentIdNull<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM claims WHERE business_id = ? AND assessment_id IS NULL ORDER BY claim_ref LIMIT 1', params);
}
export function listEngagementsBusinessIdByLetterStateSigned<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT business_id FROM engagements WHERE letter_state = 'SIGNED'", params);
}

// FOR THE CRM (Phase 161l1): its statements that joined these tables to its own, or to the core's users, now read
// here and look the rest up through the other area's front door (src/modules/clients/data-borrowed.ts).
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
export function getClaimDeliverablesContentHashByClaimIdIssuedReport<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT content_hash FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' " +
    "AND state = 'ISSUED' ORDER BY version DESC LIMIT 1", params);
}
/** The documents the given ids name: each one's logical document, version and the logical document's number. */
export function listDocumentsIdLogicalDocumentIdVersionNoByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.id, d.logical_document_id, d.version_no, l.seq FROM documents d LEFT JOIN logical_documents l ON l.id = d.logical_document_id ' +
    'WHERE d.id IN (SELECT value FROM json_each(?))', params);
}
export function listDocumentsUploadedByByBusinessIdSince<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.uploaded_by FROM documents d WHERE d.business_id = ? AND d.created_at >= ?', params);
}
/** The logical documents the given ids name, each with its latest version. */
export function listLogicalDocumentsIdTypeCodeVersionByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, ' +
    '(SELECT d.id FROM documents d WHERE d.logical_document_id = l.id ORDER BY d.version_no DESC LIMIT 1) AS version ' +
    'FROM logical_documents l WHERE l.id IN (SELECT value FROM json_each(?))', params);
}
export function listDocumentsIdDeclaredTypeTypeCodeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.id, d.declared_type, d.doc_type, d.state, d.created_at, d.type_code, l.seq, d.version_no FROM documents d ' +
    'LEFT JOIN logical_documents l ON l.id = d.logical_document_id ' +
    'WHERE d.business_id = ? ORDER BY d.created_at', params);
}
export function listDocumentLinksLogicalDocumentIdTypeCodeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.logical_document_id, l.business_id, l.type_code, l.seq, k.claim_id, c.claim_ref, p.label AS property_label, ' +
    'k.linked_at, k.unlinked_at, k.linked_by, k.unlinked_by FROM document_links k ' +
    'JOIN logical_documents l ON l.id = k.logical_document_id ' +
    'LEFT JOIN claims c ON c.id = k.claim_id LEFT JOIN properties p ON p.id = k.property_id ' +
    'WHERE l.business_id = ? ORDER BY k.linked_at', params);
}

// client_step_notices (Phase 161l2: the claims' table; moved from the portal's data file, text unchanged)
export function insertClientStepNotices(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_step_notices (id, business_id, claim_id, step, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertClientStepNotices2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_step_notices (id, business_id, claim_id, step, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)', params);
}
export function listClientStepNoticesClaimIdStepByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT claim_id, step, action, at FROM client_step_notices WHERE business_id = ? ORDER BY at ASC, rowid ASC', params);
}
export function listClientStepNoticesCOALESCEClaimIdKByBusinessIdStep<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT COALESCE(claim_id, '') AS k, action, at FROM client_step_notices WHERE business_id = ? AND step = ? ORDER BY at ASC, rowid ASC", params);
}

/*
 * Phase 161l2: THE CLAIMS' PART OF FOUR READS THAT JOINED THE SURVEY'S TABLES (the packs, their approved versions, their
 * legal answers, the survey jobs). The survey runs its part through the port it fills (./above-ports.ts); the claims run
 * the part on their own tables (the claims, the tax adviser's sign-offs, the stage moves, the document links) here, and
 * the rows are put together as the join gave them. test/claims/survey-reads-by-owner.test.ts keeps each statement as it
 * was and checks these give its rows.
 */
/** The claims on a building. */
export function listClaimsIdByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM claims WHERE property_id = ?', params);
}
/** The sign-offs naming any of these approved versions, in the order they were recorded. */
export function listTaxAdviserSignoffsApprovalIdClaimIdByApprovalIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT approval_id, claim_id, figure_pence, recorded_at FROM tax_adviser_signoffs WHERE approval_id IN (SELECT value FROM json_each(?)) ORDER BY rowid', params);
}
/** The claims a document is linked to, directly or through its building, while the link stands. */
export function listDocumentLinksClaimIdByLogicalDocumentIdLinked<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.claim_id AS id FROM document_links k WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.claim_id IS NOT NULL ' +
    'UNION SELECT c.id FROM document_links k JOIN claims c ON c.property_id = k.property_id ' +
    'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.property_id IS NOT NULL', params);
}

/**
 * `s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence')` as SQLite decides it: a column of whole
 * numbers against a value with no type of its own, so text that reads as a number is compared as that number, and
 * NULL equals nothing.
 */
export function sameFigure(figure_pence: unknown, q: unknown): boolean {
  if (figure_pence === null || figure_pence === undefined || q === null || q === undefined) return false;
  if (typeof q === 'string' && !/^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(q)) return false;
  return Number(q) === Number(figure_pence);
}

type Signoff = { approval_id: string; claim_id: string; figure_pence: number; recorded_at: string };
function signoffsOf(db: Db, approval_ids: readonly string[]): Signoff[] {
  return approval_ids.length === 0 ? [] : listTaxAdviserSignoffsApprovalIdClaimIdByApprovalIds<Signoff>(db, [JSON.stringify([...new Set(approval_ids)])]);
}

/**
 * The newest approved version on a building's packs (or on a pack naming no building, whose job's claim is on it) that
 * a sign-off on the job's claim names, recorded since that claim's valuation was last reopened (to one of the stages
 * given). Was one statement joining the survey's tables to the claims, the sign-offs and the stage moves.
 * Parameters: [property_id, property_id, the stages as a JSON list].
 */
export function getSurveyPackApprovalsSnapshotJsonVersionByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const [property_id, , stages] = params;
  const claims = listClaimsIdByPropertyId<{ id: string }>(db, [property_id ?? null]).map((c) => c.id);
  const versions = listSurveyPackApprovalsSnapshotJsonVersionByPropertyIdClaimIds<{ id: string; snapshot_json: string; version: number; approved_at: string; claim_id: string }>(
    db, [property_id ?? null, JSON.stringify(claims)]);
  const signoffs = signoffsOf(db, versions.map((v) => v.id));
  const since = new Map<string, string>();
  const reopened = (claim_id: string): string => {
    if (!since.has(claim_id)) since.set(claim_id, getClaimStageMovesAtByClaimIdKind2<{ at: string | null }>(db, [claim_id, stages ?? null])?.at ?? '');
    return since.get(claim_id) ?? '';
  };
  /* The statement met the sign-offs first, in the order they were recorded, and kept the first of the newest: so two
     versions approved at the same moment with the same number go to the one whose sign-off was recorded first. */
  let v: (typeof versions)[number] | undefined;
  for (const s of signoffs) {
    const a = versions.find((x) => x.id === s.approval_id && x.claim_id === s.claim_id);
    if (a === undefined || s.recorded_at < reopened(a.claim_id)) continue;
    if (v === undefined || a.approved_at > v.approved_at || (a.approved_at === v.approved_at && a.version > v.version)) v = a;
  }
  return v === undefined ? undefined : { snapshot_json: v.snapshot_json, version: v.version, approved_at: v.approved_at, claim_id: v.claim_id } as Row as T;
}

/**
 * The approved versions on a claim's survey jobs whose figure a sign-off on the claim names, recorded at or after the
 * time given, newest first. Was one statement joining the survey's tables to the sign-offs. Parameters: [claim_id, since].
 */
export function listSurveyPackApprovalsFingerprintSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const [claim_id, since] = params;
  const versions = listSurveyPackApprovalsIdFingerprintSnapshotJsonByClaimId<{ id: string; fingerprint: string; snapshot_json: string; q: unknown }>(db, [claim_id ?? null]);
  const signoffs = signoffsOf(db, versions.map((v) => v.id)).filter((s) => s.claim_id === claim_id && since !== null && since !== undefined && s.recorded_at >= String(since));
  return versions.filter((a) => signoffs.some((s) => s.approval_id === a.id && sameFigure(s.figure_pence, a.q)))
    .map((a) => ({ fingerprint: a.fingerprint, snapshot_json: a.snapshot_json }) as Row as T);
}

/**
 * The legal check's newest answer to G9d on a building's packs, or on a pack naming no building whose job's claim is on
 * it. Was one statement joining the survey's tables to the claims. Parameters: [property_id, property_id].
 */
export function getSurveyPackLegalAnswersValueJsonAtByQuestionIdPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const [property_id] = params;
  const claims = listClaimsIdByPropertyId<{ id: string }>(db, [property_id ?? null]).map((c) => c.id);
  return getSurveyPackLegalAnswersValueJsonAtByPropertyIdClaimIdsG9d<T>(db, [property_id ?? null, JSON.stringify(claims)]);
}

/**
 * The surveyors with a job on a claim a document is linked to (directly or through its building), each once. Was one
 * statement joining the survey jobs to the links and the claims. Parameters: [logical_document_id, logical_document_id].
 */
export function listSurveyorJobsSurveyorIdBySurveyorIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const claims = listDocumentLinksClaimIdByLogicalDocumentIdLinked<{ id: string }>(db, params).map((c) => c.id);
  return claims.length === 0 ? [] : listSurveyorJobsSurveyorIdByClaimIds<T>(db, [JSON.stringify(claims)]);
}

/*
 * Phase 161l2: THE CLAIMS' AND PROPERTIES' HALF OF THE CLIENT RECORD'S BORROWED STATEMENTS. Each statement once in
 * src/modules/clients/data-borrowed.ts joined the claims and properties to the client record's organisations, leads,
 * tasks or the core's users. Here is the claims' half: the claim (and its property: both the claims'), with the other
 * owner's id standing where each of its columns stood, for the claim row (src/modules/claims/claim-row.ts) and the CRM
 * (src/modules/crm/split-reads.ts) to put the rest in place. No LIMIT: where the join had one, it is applied after the
 * rows whose organisation is not found are left out.
 */
const CLAIM_ROW = 'SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, ' +
  'c.id AS next_action, c.id AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, ' +
  'c.tax_adviser_signoff_at, c.business_id AS business_name, c.owner_id AS owner_name, c.surveyor_id AS surveyor_name, p.label AS property_label, ' +
  'p.town AS property_town FROM claims c LEFT JOIN properties p ON p.id = c.property_id ';
export function getClaimRowById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(CLAIM_ROW + 'WHERE c.id = ?', params);
}
export function listClaimRowsByClaimRefAsc<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIM_ROW + 'ORDER BY c.claim_ref ASC', params);
}
export function listClaimRowsByClaimRefDesc<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIM_ROW + 'ORDER BY c.claim_ref DESC', params);
}
export function listClaimRowsByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIM_ROW + 'WHERE c.business_id = ? ORDER BY c.claim_ref ASC', params);
}
export function listClaimRowsByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIM_ROW + 'WHERE c.property_id = ? ORDER BY c.claim_ref ASC', params);
}
/** A claim's naming: its organisation (the id, for its name), its property's label and its reference. */
export function getClaimsBusinessIdCompanyPropertyRefById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.business_id, c.business_id AS company, p.label AS property, c.claim_ref AS ref FROM claims c ' +
    'LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ?', params);
}
/** The claims a task may be about, every one and those with no owner, by reference. */
export function listClaimsIdClaimRefBusinessIdStageOwner<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.stage, c.business_id AS business_name, c.owner_id AS owner_name FROM claims c ORDER BY c.claim_ref ASC', params);
}
export function listClaimsIdClaimRefBusinessIdStageByOwnerNull<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.stage, c.business_id AS business_name FROM claims c WHERE c.owner_id IS NULL ORDER BY c.claim_ref ASC', params);
}
export function listClaimsIdCompletedAtByStageClosed<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT c.id, c.completed_at FROM claims c WHERE c.stage = 'CLOSED'", params);
}
/** A claim with its property's label, for a claim named in its organisation's frame. */
const CLAIM_PLACE = 'SELECT c.id, c.claim_ref, c.business_id, p.label AS property_label FROM claims c LEFT JOIN properties p ON p.id = c.property_id ';
export function getClaimsIdClaimRefPropertyLabelById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(CLAIM_PLACE + 'WHERE c.id = ?', params);
}
export function listClaimsIdClaimRefPropertyLabelByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIM_PLACE + 'WHERE c.business_id = ? ORDER BY c.claim_ref', params);
}
export function listClaimsIdClaimRefPropertyLabelByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIM_PLACE + 'WHERE c.property_id = ? ORDER BY c.claim_ref', params);
}
export function listClaimsIdClaimRefPropertyLabelByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIM_PLACE + 'WHERE c.id IN (SELECT value FROM json_each(?))', params);
}
/** A property's whole row, with its organisation's id where the organisation's name stood. */
const PROPERTY_ROW = 'SELECT p.id, p.business_id, p.label, p.postcode, p.created_at, p.address_line_1, p.address_line_2, p.town, p.jurisdiction, p.property_type, ' +
  'p.property_use, p.tenure, p.occupier, p.acquisition_date, p.acquisition_price_pence, p.completion_date, p.disposal_date, p.previous_owner, p.construction_notes, ' +
  'p.existing_ca_claimed, p.prior_claim_notes, p.updated_at, p.sale_in_prospect, p.claimant_role, p.lease_end_date, p.landlord, p.business_id AS business_name FROM properties p ';
export function getPropertyRowById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(PROPERTY_ROW + 'WHERE p.id = ?', params);
}
export function listPropertyRows<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROPERTY_ROW + 'ORDER BY p.rowid', params);
}
export function listPropertyRowsByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROPERTY_ROW + 'WHERE p.business_id = ? ORDER BY p.created_at ASC, p.id ASC', params);
}
// The global search's statements on the claims' tables (src/modules/crm/search.ts), with the organisation's id where its
// name stood; the organisation's name is matched by the client record (searchOrganisationNames) and given as a list.
const PROPERTIES_FOUND =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.town, p.business_id AS business_name FROM properties p ' +
  "WHERE lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' " +
  "OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\' ORDER BY p.label ASC, p.id ASC";
const PROPERTIES_OF_BUSINESSES_FOUND =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.town, p.business_id AS business_name FROM properties p ' +
  'WHERE p.business_id IN (SELECT value FROM json_each(?)) ' +
  "AND (lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' " +
  "OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\') ORDER BY p.label ASC, p.id ASC";
const CLAIMS_FOUND =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, c.business_id AS business_name, p.label AS property_label FROM claims c ' +
  'LEFT JOIN properties p ON p.id = c.property_id ' +
  "WHERE lower(c.claim_ref) LIKE ? ESCAPE '\\' OR c.business_id IN (SELECT value FROM json_each(?))";
const CLAIMS_OF_IDS_FOUND =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, c.business_id AS business_name, p.label AS property_label FROM claims c ' +
  'LEFT JOIN properties p ON p.id = c.property_id WHERE c.id IN (SELECT value FROM json_each(?)) ' +
  "AND (lower(c.claim_ref) LIKE ? ESCAPE '\\' OR c.business_id IN (SELECT value FROM json_each(?)))";
export function searchPropertiesFound<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROPERTIES_FOUND, params);
}
export function searchPropertiesOfBusinessesFound<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROPERTIES_OF_BUSINESSES_FOUND, params);
}
export function searchClaimsFound<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIMS_FOUND, params);
}
export function searchClaimsOfIdsFound<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIMS_OF_IDS_FOUND, params);
}
/** Every statement the search runs on the claims' tables (src/modules/crm/search.ts statements(), for test/core/global-search.test.ts). */
export const CLAIM_SEARCH_STATEMENTS: readonly string[] = Object.freeze([PROPERTIES_FOUND, PROPERTIES_OF_BUSINESSES_FOUND, CLAIMS_FOUND, CLAIMS_OF_IDS_FOUND]);
/** The claim list's lines (src/modules/crm/claim-lists.ts), the claims' and properties' columns, by reference, newest first. */
export function listClaimListLines<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.created_at, c.stage, c.workstream, c.owner_id, c.priority, c.expected_completion, ' +
    'p.label AS property_label, p.property_type, p.jurisdiction, p.postcode, c.assessment_id FROM claims c LEFT JOIN properties p ON p.id = c.property_id ' +
    'ORDER BY c.claim_ref DESC', params);
}
/** An organisation's first claim (by when it was made), on the assessment given, and of any assessment (a backfilled lead's claim). */
export function getClaimsFirstIdByBusinessIdAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT z.id, z.created_at FROM claims z WHERE z.business_id = ? AND z.assessment_id = ? ORDER BY z.created_at, z.id LIMIT 1', params);
}
export function getClaimsFirstIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT z.id, z.created_at FROM claims z WHERE z.business_id = ? ORDER BY z.created_at, z.id LIMIT 1', params);
}
/* Phase 161l2: TWO TABLES WHOSE ONLY WRITER IS THE CLAIMS, given to the claims (architecture/tables.json).
   signatory_checks: the check of who signed the letter of engagement, written and read by the claims' research
   (research.ts, runSignatoryCheck) and read by the take-back (take-back.ts); the compliance module never touched it.
   client_step_notices: a step of the client's checks told to the client or taken back, written by the claims'
   checks panel (approvals.ts) and read by it and by the take-back; the portal only read it, for the take-back that
   has moved here. Each statement moved here with its text unchanged. */
// signatory_checks
export function getSignatoryChecksCountByBusinessIdSource<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM signatory_checks WHERE business_id = ? AND source = ? AND checked_at >= ?', params);
}
export function getSignatoryChecksResultReasonByBusinessIdSource<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT result, reason, checked_at FROM signatory_checks WHERE business_id = ? AND source = ? ORDER BY checked_at DESC, rowid DESC LIMIT 1', params);
}
export function insertSignatoryChecks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO signatory_checks (id, business_id, engagement_id, source, result, reason, checked_at, checked_by) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listSignatoryChecksSourceByEngagementIdResult<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT DISTINCT source FROM signatory_checks WHERE engagement_id = ? AND result IN ('YES','NO')", params);
}

// client_step_notices
export function listClientStepNoticesClaimIdStepByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT e.claim_id, e.step, e.action, e.reason, e.at, e.actor_id AS who FROM client_step_notices e ' +
    'WHERE e.business_id = ? ORDER BY e.at ASC, e.rowid ASC', params), { who: 'display_name' });
}

/* Phase 161l2: client_filing_confirmations, given to the claims with the file that is its only reader and writer
   (client-filing.ts, moved here from the portal): staff record, on the claim's page, the client's own written
   confirmation that they file the claim where they have no accountant. Text unchanged. */
// client_filing_confirmations
export function getClientFilingConfirmationsByClaimIdRecordedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM client_filing_confirmations WHERE claim_id = ? AND recorded_at >= ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1', params);
}
export function insertClientFilingConfirmations(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_filing_confirmations (id, claim_id, business_id, confirmed_by_party, no_accountant_or_adviser, will_file_amendment, ' +
    'last_day_acknowledged, last_day_stated, remains_responsible, written_evidence, recorded_by, recorded_at) ' +
    "VALUES (?, ?, ?, 'CLIENT', ?, ?, ?, ?, ?, ?, ?, ?)", params);
}

/* Phase 161l2: document_types, given to the claims (architecture/tables.json). The list of document types is the
   document centre's (documents.ts writes it: insertDocumentTypes, updateDocumentTypesLabelReadersByCode), and every
   read of it joins or labels the claims' own documents. The administration's settings pages only show it, and read it
   through the claims' door, as the CRM and the portal do (the administration's door names these as before).
   Each statement moved here from src/modules/admin/data.ts with its text unchanged. */
// document_types
export function getDocumentTypesCodeByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT code FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesCodeLabelByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesHandlerTypeActiveByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT handler_type, active FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesHandlerTypeByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT handler_type FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesLabelByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesLabelByCode2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesM<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(ord) AS m FROM document_types', params);
}
export function getDocumentTypesOrdByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT ord FROM document_types WHERE code = ?', params);
}
export function insertDocumentTypes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO document_types (code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at) ' +
    'VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listDocumentTypesCodeLabel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label FROM document_types', params);
}
export function listDocumentTypesCodeLabel2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, source, handler_type, readers, carries_value, retention_ref, active, ord, note, created_at, updated_at FROM document_types ORDER BY ord ASC, code ASC', params);
}
export function listDocumentTypesCodeLabelByActiveHandlerType<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, handler_type FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord ASC, code ASC', params);
}
export function listDocumentTypesCodeLabelByActiveHandlerType2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord ASC, code ASC', params);
}
// For the CRM (Phase 161l1): the document types the given codes name, in place of the CRM's joins to document_types.
export function listDocumentTypesCodeReadersLabelByCodes<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.code, t.readers, t.carries_value, t.label FROM document_types t WHERE t.code IN (SELECT value FROM json_each(?))', params);
}
export function updateDocumentTypesLabelReadersByCode(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE document_types SET label = ?, readers = ?, carries_value = ?, retention_ref = ?, active = ?, updated_at = ? WHERE code = ?', params);
}

/* Phase 161l2: the logical documents with their type, moved here from the borrowed file now that both tables are the
   claims'. Text unchanged. */
// logical_documents with document_types
export function listLogicalDocumentsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, ' +
    't.retention_ref AS type_retention, l.created_by AS created_role, l.created_by AS created_name FROM logical_documents l ' +
    'JOIN document_types t ON t.code = l.type_code WHERE l.business_id = ? ' +
    'ORDER BY l.created_at DESC, l.seq DESC', params), { created_role: 'role', created_name: 'display_name' });
}
export function getLogicalDocumentsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id = ?', params);
}
export function listLogicalDocumentsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code ORDER BY l.created_at DESC, l.id ASC LIMIT 2000', params);
}
export function listLogicalDocumentsIdBusinessIdByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.business_id = ?', params);
}
export function listLogicalDocumentsIdBusinessIdByBusinessId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.business_id = ? ORDER BY t.ord ASC, l.seq ASC', params);
}
export function listLogicalDocumentsIdBusinessIdByIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id IN (SELECT k.logical_document_id FROM document_links k LEFT JOIN claims c ON c.property_id = k.property_id WHERE k.unlinked_at IS NULL AND (k.claim_id = ? OR c.id = ?)) ORDER BY t.ord ASC, l.seq ASC', params);
}
export function listLogicalDocumentsIdBusinessIdByIdUnlinkedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, t.retention_ref AS type_retention FROM logical_documents l JOIN document_types t ON t.code = l.type_code WHERE l.id IN (SELECT k.logical_document_id FROM document_links k WHERE k.unlinked_at IS NULL AND k.property_id = ?) ORDER BY t.ord ASC, l.seq ASC', params);
}

/* Phase 161l2: fee_discounts, given to the claims (architecture/tables.json). A multi-site discount a person enters is a
   record on the claim and nothing more (fee-discounts.ts: "No invoice reads this module"); only the claims write and
   read it. The insert moved here from src/modules/finance/data.ts, the read from the borrowed file; text unchanged. */
// fee_discounts
export function insertFeeDiscounts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO fee_discounts (id, claim_id, business_id, discount_bp, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listFeeDiscountsIdDiscountBpByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT f.id, f.discount_bp, f.reason, f.recorded_at, f.recorded_by AS who FROM fee_discounts f ' +
    'WHERE f.claim_id = ? ORDER BY f.recorded_at DESC, f.rowid DESC', params), { who: 'display_name' });
}

/* Phase 161l2: THE CLAIMS' HALF OF THE STATEMENTS THEY SPLIT with the client record (each was in data-borrowed.ts and
   joined businesses or client_tasks). The client record's half is read through its door; these put the claims' own
   rows in place, so each function gives what its statement gave: the same rows, keys, order and nulls. The replaced
   statements are kept word for word in test/claims/borrowed-split-by-owner.test.ts. */
/** (SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at, from the assessment. */
function submittedAt<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const ids = [...new Set(rows.map((r) => r.business_id).filter((x): x is string => typeof x === 'string'))];
  const at = new Map(ids.length === 0 ? [] : listAssessmentsBusinessIdSubmittedAtByBusinessIds<{ business_id: string; submitted_at: unknown }>(db, [JSON.stringify(ids)]).map((a) => [a.business_id, a.submitted_at]));
  return rows.map((r) => ({ ...r, submitted_at: at.get(String(r.business_id)) ?? null }) as Row as T);
}

export function getAssessmentsBusinessIdNameByBusinessIdId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return submittedAt<T>(db, listBusinessesBusinessIdNameSectorStageById(db, params))[0];
}
export function listAssessmentsBusinessIdNameByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return submittedAt<T>(db, listBusinessesBusinessIdNameSectorStageNewest(db, params));
}

export function listClaimsOwnerIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT owner_id AS o FROM claims WHERE business_id = ?', params);
}
/**
 * The organisation's owner and its claims' owners, each once (was: SELECT owner_id AS o FROM businesses WHERE id = ?
 * UNION SELECT owner_id AS o FROM claims WHERE business_id = ?). A UNION gives each value once, in its order: no owner
 * first, then the ids in order, byte by byte. Params as before: [business_id, business_id].
 */
export function listBusinessesOByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const b = getBusinessesIdOwnerIdById<{ owner_id: string | null }>(db, [params[0] ?? null]);
  const all = [...(b === undefined ? [] : [b.owner_id]), ...listClaimsOwnerIdByBusinessId<{ o: string | null }>(db, [params[1] ?? null]).map((r) => r.o)];
  const once = [...new Set(all)];
  const bytes = (x: string): Buffer => Buffer.from(x, 'utf8');
  once.sort((x, y) => (x === y ? 0 : x === null ? -1 : y === null ? 1 : Buffer.compare(bytes(x), bytes(y))));
  return once.map((o) => ({ o }) as Row as T);
}

/** The link's letter, with the organisation's name and number put in place from the client record (was a JOIN). */
export function getEngagementSignLinksIdEngagementIdByTokenSha256<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const k = db.get<Row>('SELECT k.id, k.engagement_id, k.user_id, k.sent_to, k.used_at, k.expires_at, e.business_id, e.letter_state, NULL AS business_name, ' +
    'NULL AS company_number, k.user_id AS disabled_at FROM engagement_sign_links k JOIN engagements e ON e.id = k.engagement_id ' +
    'WHERE k.token_sha256 = ?', params);
  if (k === undefined) return undefined;
  const b = getBusinessesNameCompanyNumberById<{ name: unknown; company_number: unknown }>(db, [k.business_id as Param]);
  if (b === undefined) return undefined; // JOIN businesses: no organisation, no row
  return fillUser(db, { ...k, business_name: b.name, company_number: b.company_number } as Row as T, { disabled_at: 'disabled_at' });
}

export function listDocumentTypesCodeLabelByCodes<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.code, t.label FROM document_types t WHERE t.code IN (SELECT value FROM json_each(?))', params);
}
export function listClaimsIdClaimRefByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref FROM claims c WHERE c.id IN (SELECT value FROM json_each(?))', params);
}
export function listPropertyEventsIdKindEventDateByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT pe.id, pe.kind, pe.event_date FROM property_events pe WHERE pe.id IN (SELECT value FROM json_each(?))', params);
}
export function getDocumentFieldVouchesAnswerByRequestId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT v.answer FROM document_field_vouches v WHERE v.request_id = ? LIMIT 1', params);
}

type RequestFromClients = {
  id: string; business_id: string; claim_id: string | null; requested_type: string | null; state: unknown; why: unknown; holds_up: unknown;
  due_on: unknown; created_at: unknown; withdrawn_at: unknown; answered_at: unknown; asked_by: string | null;
  received_document_id: string | null; event_id: string | null;
};
/**
 * A client's document requests with the claim, the type's label, the version received, the first early answer and the
 * event put in place, in the client record's order (was one statement joining client_tasks to document_types, claims,
 * documents and property_events). JOIN document_types: a request whose type is not on the list is left out.
 */
function requestsWithClaimsRows<T extends Row>(db: Db, rows: readonly RequestFromClients[]): T[] {
  const ids = (xs: readonly (string | null)[]): string => JSON.stringify([...new Set(xs.filter((x): x is string => x !== null))]);
  const claims = new Map(listClaimsIdClaimRefByIds<{ id: string; claim_ref: unknown }>(db, [ids(rows.map((r) => r.claim_id))]).map((c) => [c.id, c.claim_ref]));
  const types = new Map(listDocumentTypesCodeLabelByCodes<{ code: string; label: unknown }>(db, [ids(rows.map((r) => r.requested_type))]).map((t) => [t.code, t.label]));
  const docs = new Map(listDocumentsIdLogicalDocumentIdVersionNoByIds<{ id: string; logical_document_id: unknown; version_no: unknown }>(db, [ids(rows.map((r) => r.received_document_id))]).map((d) => [d.id, d]));
  const events = new Map(listPropertyEventsIdKindEventDateByIds<{ id: string; kind: unknown; event_date: unknown }>(db, [ids(rows.map((r) => r.event_id))]).map((e) => [e.id, e]));
  const out: Row[] = [];
  for (const r of rows) {
    if (r.requested_type === null || !types.has(r.requested_type)) continue;
    const d = r.received_document_id === null ? undefined : docs.get(r.received_document_id);
    const e = r.event_id === null ? undefined : events.get(r.event_id);
    out.push({
      id: r.id, business_id: r.business_id, claim_id: r.claim_id, claim_ref: (r.claim_id === null ? undefined : claims.get(r.claim_id)) ?? null,
      requested_type: r.requested_type, type_label: types.get(r.requested_type) ?? null, state: r.state, why: r.why, holds_up: r.holds_up,
      due_on: r.due_on, created_at: r.created_at, withdrawn_at: r.withdrawn_at, answered_at: r.answered_at, asked_by: r.asked_by,
      received_document: d?.logical_document_id ?? null, received_version: d?.version_no ?? null,
      early_answer: getDocumentFieldVouchesAnswerByRequestId<{ answer: unknown }>(db, [r.id])?.answer ?? null,
      event_id: r.event_id, event_kind: e?.kind ?? null, event_date: e?.event_date ?? null,
    } as Row);
  }
  return fillUsers(db, out as T[], { asked_by: 'display_name' });
}
export function listDocumentFieldVouchesIdBusinessIdByRequestIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return requestsWithClaimsRows<T>(db, listClientTasksDocumentRequestsByBusinessIdClaimId<RequestFromClients>(db, params));
}
export function listDocumentFieldVouchesIdBusinessIdByRequestIdJO2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return requestsWithClaimsRows<T>(db, listClientTasksDocumentRequestsByBusinessId<RequestFromClients>(db, params));
}

