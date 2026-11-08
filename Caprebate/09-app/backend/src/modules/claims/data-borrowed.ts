/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CLAIMS (09-app/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// anchor_log
export function getAnchorLogCountByJobIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM anchor_log WHERE job_id IN (SELECT id FROM surveyor_jobs WHERE claim_id = ?)', params);
}
export function getAnchorLogHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT hash FROM anchor_log ORDER BY seq DESC LIMIT 1', params);
}
export function getAnchorLogSeqHashByJobIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT seq, hash FROM anchor_log WHERE job_id IN (SELECT id FROM surveyor_jobs WHERE claim_id = ?) ORDER BY seq DESC LIMIT 1', params);
}

// assessments
export function getAssessmentsBusinessIdNameByBusinessIdId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT b.id AS business_id, b.name, b.sector, b.stage, ' +
    '(SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at ' +
    'FROM businesses b WHERE b.id = ?', params);
}
export function listAssessmentsBusinessIdNameByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT b.id AS business_id, b.name, b.sector, b.stage, ' +
    '(SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at ' +
    'FROM businesses b ORDER BY b.created_at DESC, b.name ASC LIMIT ?', params);
}

// businesses
export function listBusinessesOByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT owner_id AS o FROM businesses WHERE id = ? UNION SELECT owner_id AS o FROM claims WHERE business_id = ?', params);
}

// claim_facts
export function listClaimFactsIdFactKeyByClaimIdFactKey<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
    'u.display_name AS recorder FROM claim_facts f LEFT JOIN users u ON u.id = f.recorded_by ' +
    'WHERE f.claim_id = ? AND f.fact_key = ? ORDER BY f.recorded_at DESC, f.rowid DESC', params);
}
export function listClaimFactsSeqIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT f.rowid AS seq, f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
    'u.display_name AS recorder FROM claim_facts f LEFT JOIN users u ON u.id = f.recorded_by WHERE f.claim_id = ? ' +
    'ORDER BY f.recorded_at ASC, f.rowid ASC', params);
}

// claim_grants
export function listClaimGrantsIdKindByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT g.id, g.kind, g.payer_class, g.amount_pence, g.amount_basis, g.traced, g.traced_elements, g.source_id, g.note, ' +
    'g.recorded_at, u.display_name AS recorder, g.withdrawn_at, g.withdraw_reason, g.paid_to, g.event_id FROM claim_grants g ' +
    'LEFT JOIN users u ON u.id = g.recorded_by WHERE g.claim_id = ? ORDER BY g.recorded_at ASC, g.rowid ASC', params);
}

// claim_owner_chain
export function listClaimOwnerChainIdPositionByClaimIdWithdrawnAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.id, o.position, o.owner, o.acquired_on, o.ceased_on, o.claimed, o.source_id, o.recorded_at, u.display_name AS recorder ' +
    'FROM claim_owner_chain o LEFT JOIN users u ON u.id = o.recorded_by WHERE o.claim_id = ? AND o.withdrawn_at IS NULL ORDER BY o.position ASC', params);
}

// claim_stage_moves
export function getClaimStageMovesAtWhoByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT m.at, u.display_name AS who, m.reason_text AS reason, m.to_stage AS "to" FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id ' +
    "WHERE m.claim_id = ? AND m.kind = 'REOPEN' AND m.to_stage IN (SELECT value FROM json_each(?)) ORDER BY m.at DESC, m.rowid DESC LIMIT 1", params);
}

// client_step_notices
export function listClientStepNoticesClaimIdStepByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.claim_id, e.step, e.action, e.reason, e.at, u.display_name AS who FROM client_step_notices e ' +
    'LEFT JOIN users u ON u.id = e.actor_id WHERE e.business_id = ? ORDER BY e.at ASC, e.rowid ASC', params);
}

// client_tasks
export function listClientTasksQuestionAnswerByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT t.question, t.answer, t.answer_state, t.answered_at, t.answered_by_role AS role, u.display_name AS who, " +
    'c.display_name AS checker, k.checked_at FROM client_tasks t LEFT JOIN users u ON u.id = t.answered_by ' +
    'LEFT JOIN client_task_checks k ON k.task_id = t.id LEFT JOIN users c ON c.id = k.checked_by ' +
    "WHERE t.business_id = ? AND t.state = 'ANSWERED' AND t.kind = 'QUESTION' AND (t.claim_id = ? OR t.claim_id IS NULL) " +
    "AND (t.answered_by_role = 'STAFF' OR k.outcome = 'ACCEPTED') ORDER BY t.answered_at DESC", params);
}

// document_types
export function getDocumentTypesCodeByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT code FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesHandlerTypeByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT handler_type FROM document_types WHERE code = ?', params);
}
export function getDocumentTypesLabelByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
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
export function listDocumentTypesCodeLabelByActiveHandlerType<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, handler_type FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord ASC, code ASC', params);
}
export function updateDocumentTypesLabelReadersByCode(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE document_types SET label = ?, readers = ?, carries_value = ?, retention_ref = ?, active = ?, updated_at = ? WHERE code = ?', params);
}

// documents
export function getDocumentsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT d.id, d.business_id, d.type_code, d.request_id, d.logical_document_id, d.version_no, d.strip_recorded_at, ' +
    'd.quarantine_discharged_at, d.failure_code, d.uploaded_by, u.role FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.id = ?', params);
}
export function getDocumentsLogicalDocumentIdUploadedByByIdTypeCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT d.logical_document_id, d.uploaded_by, u.role, d.version_no FROM documents d JOIN logical_documents l ON l.id = d.logical_document_id ' +
    'LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.id = ? AND l.type_code = ? AND d.strip_recorded_at IS NOT NULL ' +
    'AND d.quarantine_discharged_at IS NOT NULL AND d.failure_code IS NULL', params);
}
export function getDocumentsRoleById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT u.role FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.id = ?', params);
}

// engagement_required_signers
export function listEngagementRequiredSignersUserIdSeqByEngagementId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.user_id, r.seq, u.display_name AS name, u.email FROM engagement_required_signers r JOIN users u ON u.id = r.user_id ' +
    'WHERE r.engagement_id = ? ORDER BY r.seq ASC', params);
}

// engagement_sign_links
export function getEngagementSignLinksIdEngagementIdByTokenSha256<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT k.id, k.engagement_id, k.user_id, k.sent_to, k.used_at, k.expires_at, e.business_id, e.letter_state, b.name AS business_name, ' +
    'b.company_number, u.disabled_at FROM engagement_sign_links k JOIN engagements e ON e.id = k.engagement_id ' +
    'JOIN businesses b ON b.id = e.business_id JOIN users u ON u.id = k.user_id WHERE k.token_sha256 = ?', params);
}

// engagements
export function getEngagementsIdLetterStateByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT e.id, e.letter_state, e.created_at, e.sent_at, u.display_name AS sent_by, e.viewed_at, e.signed_at FROM engagements e LEFT JOIN users u ON u.id = e.sent_by WHERE e.business_id = ?', params);
}

// fact_approvals
export function listFactApprovalsFactRefActionByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.fact_ref, a.action, a.reason, a.at, u.display_name AS who FROM fact_approvals a ' +
    'LEFT JOIN users u ON u.id = a.actor_id WHERE a.business_id = ? ORDER BY a.at ASC, a.rowid ASC', params);
}

// fee_discounts
export function insertFeeDiscounts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO fee_discounts (id, claim_id, business_id, discount_bp, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listFeeDiscountsIdDiscountBpByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT f.id, f.discount_bp, f.reason, f.recorded_at, u.display_name AS who FROM fee_discounts f LEFT JOIN users u ON u.id = f.recorded_by ' +
    'WHERE f.claim_id = ? ORDER BY f.recorded_at DESC, f.rowid DESC', params);
}

// hmrc_enquiries
export function listHmrcEnquiriesIdOpenedOnByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.id, e.opened_on, e.note, e.closed_on, e.outcome, e.amended_figure_pence, e.opened_recorded_at, u.display_name AS opener ' +
    'FROM hmrc_enquiries e LEFT JOIN users u ON u.id = e.opened_by WHERE e.claim_id = ? ORDER BY e.opened_on DESC, e.rowid DESC', params);
}

// internal_notes
export function listInternalNotesIdBodyByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT n.id, n.body, n.created_at, u.display_name AS author_name ' +
    'FROM internal_notes n LEFT JOIN users u ON u.id = n.author_id ' +
    'WHERE n.business_id = ? ORDER BY n.created_at DESC', params);
}

// invoice_numbers
export function getInvoiceNumbersSeqByInvoiceIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT (SELECT n.seq FROM invoice_numbers n WHERE n.invoice_id = i.id AND n.kind = 'INVOICE') AS seq, i.sent_on, i.fee_pence FROM invoices i " +
    "WHERE i.claim_id = ? AND i.kind = 'FEE' AND i.invoice_status = 'SENT' ORDER BY i.sent_on DESC LIMIT 1", params);
}

// logical_documents
export function getLogicalDocumentsRoleById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT u.role FROM logical_documents l JOIN users u ON u.id = l.created_by WHERE l.id = ?', params);
}
export function listLogicalDocumentsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, ' +
    't.retention_ref AS type_retention, u.role AS created_role, u.display_name AS created_name FROM logical_documents l ' +
    'JOIN document_types t ON t.code = l.type_code LEFT JOIN users u ON u.id = l.created_by WHERE l.business_id = ? ' +
    'ORDER BY l.created_at DESC, l.seq DESC', params);
}

// pack_client_notices
export function getPackClientNoticesToldAtToldByNameByApprovalId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT n.told_at, u.display_name AS told_by_name FROM pack_client_notices n JOIN users u ON u.id = n.told_by WHERE n.approval_id = ?', params);
}
export function insertPackClientNotices(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO pack_client_notices (approval_id, message_id, told_by, told_at) VALUES (?, ?, ?, ?)', params);
}

// pack_signoff_answers
export function insertPackSignoffAnswers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO pack_signoff_answers (id, request_id, outcome, signer_name, signer_firm, signer_credential, reason, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// pack_signoff_recorded
export function insertPackSignoffRecorded(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO pack_signoff_recorded (answer_id, signoff_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?)', params);
}

// pack_signoff_requests
export function getPackSignoffRequestsIdApprovalIdByTokenSha256<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT r.id, r.approval_id, r.expires_at, c.full_name AS name, b.name AS company, a.snapshot_json, a.fingerprint, x.outcome, x.answered_at, j.claim_id, j.business_id ' +
    'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN contacts c ON c.id = r.contact_id ' +
    'JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id JOIN businesses b ON b.id = j.business_id ' +
    'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id WHERE r.token_sha256 = ?', params);
}
export function insertPackSignoffRequests(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO pack_signoff_requests (id, approval_id, contact_id, to_email, token_sha256, permission_note, outbox_id, sent_by, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listPackSignoffRequestsIdApprovalIdByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.id, r.approval_id, a.version, c.full_name AS contact_name, r.to_email, r.permission_note, u.display_name AS sent_by_name, r.sent_at, r.expires_at, ' +
    'o.sent_at AS sent_at_outbox, o.last_error AS send_error, x.id AS a_id, x.outcome, x.signer_name, x.signer_firm, x.signer_credential, x.reason, x.answered_at, ' +
    'k.signoff_id AS recorded_signoff ' +
    'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN contacts c ON c.id = r.contact_id JOIN users u ON u.id = r.sent_by JOIN outbox o ON o.id = r.outbox_id ' +
    'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id LEFT JOIN pack_signoff_recorded k ON k.answer_id = x.id ' +
    'WHERE p.job_id = ? ORDER BY r.sent_at DESC, r.rowid DESC', params);
}

// register_records
export function listRegisterRecordsIdSourceIdBySourceIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT r.id, r.source_id, r.obtained_at, r.property_id, r.fields_json FROM register_records r JOIN documents v ON v.id = r.entity_id " +
    "WHERE r.source_id = 'CLIENT_DOC' AND r.business_id = ? AND v.logical_document_id = ? ORDER BY r.obtained_at ASC, r.id ASC", params);
}

// research_runs
export function getResearchRunsWhoAtByBusinessIdAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT u.display_name AS who, r.at FROM research_runs r LEFT JOIN users u ON u.id = r.actor_id ' +
    'WHERE r.business_id = ? AND r.at <= ? ORDER BY r.at DESC LIMIT 1', params);
}

// signatory_checks
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

// site_plans
export function getSitePlansPostcodeHalfMByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT postcode, half_m, buildings_json, chosen, how, metres, attribution, fetched_at FROM site_plans WHERE job_id = ? ORDER BY fetched_at DESC, rowid DESC LIMIT 1', params);
}
export function insertSitePlans(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO site_plans (id, job_id, postcode, easting, northing, half_m, buildings_json, chosen, how, metres, attribution, fetched_by, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// survey_pack_approvals
export function getSurveyPackApprovalsClaimIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT j.claim_id, j.business_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id WHERE a.id = ?', params);
}
export function getSurveyPackApprovalsCountByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM survey_pack_approvals WHERE pack_id = ?', params);
}
export function getSurveyPackApprovalsIdVersionByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.id, a.version FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function getSurveyPackApprovalsJsonExtractSnapshotJsonFById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT json_extract(snapshot_json, '$.sums.qualifying_pence') AS f FROM survey_pack_approvals WHERE id = ?", params);
}
export function getSurveyPackApprovalsJsonExtractSnapshotJsonQById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT json_extract(snapshot_json, '$.sums.qualifying_pence') AS q FROM survey_pack_approvals WHERE id = ?", params);
}
export function getSurveyPackApprovalsSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.snapshot_json FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function getSurveyPackApprovalsSnapshotJsonVersionByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.snapshot_json, a.version, a.approved_at, j.claim_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN surveyor_jobs j ON j.id = p.job_id LEFT JOIN claims c ON c.id = j.claim_id ' +
    'JOIN tax_adviser_signoffs s ON s.approval_id = a.id AND s.claim_id = j.claim_id ' +
    'WHERE (p.property_id = ? OR (p.property_id IS NULL AND c.property_id = ?)) ' +
    "AND s.recorded_at >= COALESCE((SELECT MAX(m.at) FROM claim_stage_moves m WHERE m.claim_id = j.claim_id AND m.kind = 'REOPEN' " +
    "AND m.to_stage IN (SELECT value FROM json_each(?))), '') " +
    'ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function getSurveyPackApprovalsVersionSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.version, a.snapshot_json FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function listSurveyPackApprovalsFingerprintSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.fingerprint, a.snapshot_json FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
    "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence') AND s.recorded_at >= ?) " +
    'ORDER BY a.approved_at DESC, a.version DESC', params);
}
export function listSurveyPackApprovalsIdVersionByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at, a.snapshot_json, j.id AS job_id, j.claim_id ' +
    'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id JOIN users u ON u.id = a.approved_by ' +
    'WHERE j.business_id = ? AND j.claim_id IS NOT NULL AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
    "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence')) " +
    'ORDER BY a.approved_at DESC, a.version DESC', params);
}

// survey_pack_legal_answers
export function getSurveyPackLegalAnswersSByPackIdByUser<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(seq) AS s FROM survey_pack_legal_answers WHERE pack_id = ? AND by_user <> ?', params);
}
export function getSurveyPackLegalAnswersValueJsonAtByQuestionIdPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.value_json, a.at FROM survey_pack_legal_answers a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    "LEFT JOIN claims c ON c.id = j.claim_id WHERE a.question_id = 'G9d' AND (p.property_id = ? OR (p.property_id IS NULL AND c.property_id = ?)) " +
    'ORDER BY a.at DESC, a.seq DESC LIMIT 1', params);
}

// survey_pack_reads
export function listSurveyPackReadsChapterSeqByJobIdUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT chapter, MAX(legal_seq) AS seq FROM survey_pack_reads WHERE job_id = ? AND user_id = ? GROUP BY chapter', params);
}

// survey_packs
export function getSurveyPacksIdByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM survey_packs WHERE job_id = ?', params);
}

// surveyor_commitments
export function getSurveyorCommitmentsIdJobIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT sc.id, sc.job_id, sc.a_qualifying_plant_pence, sc.b_building_pence, sc.c_bare_land_pence, sc.qualifying_pct, ' +
    'sc.method_note, sc.committed_at, sc.figures_hash FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
    'WHERE j.claim_id = ? ORDER BY sc.committed_at DESC LIMIT 1', params);
}

// surveyor_jobs
export function getSurveyorJobsIdSurveyorIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT j.id, j.surveyor_id, u.display_name AS who FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id ' +
    'WHERE j.claim_id = ? ORDER BY j.created_at DESC LIMIT 1', params);
}
export function listSurveyorJobsIdSurveyorIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT j.id, j.surveyor_id, j.created_at, sc.committed_at, sc.id AS commitment FROM surveyor_jobs j ' +
    'LEFT JOIN surveyor_commitments sc ON sc.job_id = j.id WHERE j.claim_id = ? ORDER BY j.created_at ASC', params);
}
export function listSurveyorJobsSurveyorIdByBusinessIdSurveyorId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', params);
}
export function listSurveyorJobsSurveyorIdByClaimIdSurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE claim_id = ? AND surveyor_id IS NOT NULL', params);
}
export function listSurveyorJobsSurveyorIdBySurveyorIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT j.surveyor_id FROM surveyor_jobs j WHERE j.surveyor_id IS NOT NULL AND j.claim_id IN (' +
    'SELECT k.claim_id FROM document_links k WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.claim_id IS NOT NULL ' +
    'UNION SELECT c.id FROM document_links k JOIN claims c ON c.property_id = k.property_id ' +
    'WHERE k.logical_document_id = ? AND k.unlinked_at IS NULL AND k.property_id IS NOT NULL)', params);
}

// users
export function getUsersRoleById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT u.role FROM users u WHERE u.id = (SELECT created_by FROM logical_documents WHERE id = ?)', params);
}
