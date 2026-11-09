/**
 * PHASE 161l1: THE JOINS SPLIT BY OWNER GIVE WHAT THE JOINS GAVE (09-app/docs/ARCHITECTURE.md rule 3).
 *
 * Each read below once joined another area's table (users above all) in one statement. Phase 161l1 split each into
 * the area's own read plus a read through the owner's front door, combined in code. This pins every one to the
 * statement it replaced, kept here word for word: on a seeded database with a row in every table they read (and the
 * cases a LEFT JOIN finds no one for), each gives exactly what the statement gives: the same rows, in the same order,
 * with the same keys in the same order and the same values, NULL where NULL. And each finds at least one row, so no
 * pin passes by reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testApp } from '../helpers.ts';
import { seed } from '../../src/app/seed.ts';
import type { Db, Param, Row } from '../../src/core/index.ts';

/** The statement each read replaced, word for word: [get or all, the text]. Keyed by the area it is read from. */
const ORIGINAL: Readonly<Record<string, readonly ['get' | 'all', string]>> = {
  'survey.getSurveyInspectionBasisBasisNoteByJobId': ['get', 'SELECT b.basis, b.note, u.display_name AS by_name, b.at FROM survey_inspection_basis b JOIN users u ON u.id = b.by_user WHERE b.job_id = ? ORDER BY b.at DESC, b.rowid DESC LIMIT 1'],
  'survey.listSurveyPackAddedLinesIdLabelByPackId': ['all', 'SELECT a.id, a.label, a.unit, u.display_name AS by_name, a.added_at, a.reason FROM survey_pack_added_lines a JOIN users u ON u.id = a.added_by WHERE a.pack_id = ? ORDER BY a.added_at ASC, a.id ASC'],
  'survey.getSurveyPackApprovalsIdVersionByJobIdVersion': ['get', 'SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at, a.snapshot_json ' +
    'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN users u ON u.id = a.approved_by WHERE p.job_id = ? AND a.version = ?'],
  'survey.listSurveyPackApprovalsIdVersionByPackId': ['all', 'SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at ' +
    'FROM survey_pack_approvals a JOIN users u ON u.id = a.approved_by WHERE a.pack_id = ? ORDER BY a.version DESC'],
  'survey.listSurveyPackEntriesIdSeqByPackId': ['all', 'SELECT e.id, e.seq, e.line_key, e.field, e.value, e.pool, e.by_user, u.display_name AS by_name, e.reason, e.at, e.rate_basis, e.rate_ref, e.rate_priced_at ' +
    'FROM survey_pack_entries e JOIN users u ON u.id = e.by_user WHERE e.pack_id = ? ORDER BY e.seq ASC'],
  'survey.listSurveyPackLegalAnswersQuestionIdValueJsonByPackId': ['all', 'SELECT a.question_id, a.value_json, u.display_name AS by_name, a.source_note, a.at, a.seq FROM survey_pack_legal_answers a JOIN users u ON u.id = a.by_user WHERE a.pack_id = ? ORDER BY a.seq ASC'],
  'survey.listSurveyPackWordsFieldWordsByPackId': ['all', 'SELECT w.field, w.words, u.display_name AS by_name, w.at, w.reason FROM survey_pack_words w JOIN users u ON u.id = w.by_user ' +
    'WHERE w.pack_id = ? ORDER BY w.at, w.rowid'],
  'survey.listSurveyPhotoSortsIdItemKeyByPhotoIdJO': ['all', 'SELECT p.id, COALESCE((SELECT s.item_key FROM survey_photo_sorts s WHERE s.photo_id = p.id ORDER BY s.at DESC, s.rowid DESC LIMIT 1), p.item_key) AS item_key, ' +
    'p.content_type, p.byte_size, p.note, p.taken_at, u.display_name AS taken_by_name FROM survey_photos p JOIN users u ON u.id = p.taken_by ' +
    'LEFT JOIN survey_photo_withdrawals w ON w.photo_id = p.id WHERE p.job_id = ? AND w.photo_id IS NULL ORDER BY p.taken_at, p.rowid'],
  'survey.listSurveyVideosIdContentTypeByJobIdVideoId': ['all', 'SELECT v.id, v.content_type, v.byte_size, v.duration_ms, v.note, v.taken_at, u.display_name AS taken_by_name FROM survey_videos v JOIN users u ON u.id = v.taken_by ' +
    'LEFT JOIN survey_video_withdrawals w ON w.video_id = v.id WHERE v.job_id = ? AND w.video_id IS NULL ORDER BY v.taken_at, v.rowid'],
  'survey.listSurveyWalkthroughAsksAtByNameByJobId': ['all', 'SELECT a.at, u.display_name AS by_name FROM survey_walkthrough_asks a JOIN users u ON u.id = a.by_user WHERE a.job_id = ? ORDER BY a.at DESC'],
  'survey.getSurveyorJobsIdSurveyorByClaimId': ['get', 'SELECT j.id, u.display_name AS surveyor, j.created_at, j.state FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id ' +
    'WHERE j.claim_id = ? ORDER BY j.created_at DESC, j.id LIMIT 1'],
  'survey.getSurveyorJobsSurveyorByClaimId': ['get', 'SELECT u.display_name AS surveyor FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id WHERE j.claim_id = ? LIMIT 1'],
  'survey.listSurveyorRoomCountsRoomIdRoomCountByJobId': ['all', 'SELECT c.room_id, c.room_count, c.recorded_at, u.display_name AS by_name FROM surveyor_room_counts c LEFT JOIN users u ON u.id = c.recorded_by WHERE c.job_id = ?'],
  'survey.listClaimGrantsAmountPenceByIdPaidTo': ['all', "SELECT g.amount_pence FROM claim_grants g JOIN surveyor_jobs j ON j.claim_id = g.claim_id WHERE j.id = ? AND g.paid_to = 'PAST_OWNER' AND g.withdrawn_at IS NULL"],
  'survey.getEstimatesXById': ['get', 'SELECT 1 AS x FROM estimates e JOIN surveyor_jobs j ON j.assessment_id = e.assessment_id WHERE j.id = ?'],
  'survey.getSurveyorJobsPropertyIdPById': ['get', 'SELECT COALESCE(sp.property_id, c.property_id) AS p FROM surveyor_jobs j LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN claims c ON c.id = j.claim_id WHERE j.id = ?'],
  'survey.getSurveyorJobsIdBusinessIdById': ['get', "SELECT j.id, j.business_id, b.sector, COALESCE(p.label, b.name) AS place, j.surveyor_id FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id " +
    'LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN properties p ON p.id = sp.property_id WHERE j.id = ?'],
  'survey.getSurveyorJobsIdBusinessIdById2': ['get', 'SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, b.name, b.sector, b.stage, u.display_name AS surveyor_name, j.claim_id, cl.stage AS claim_stage, cl.claim_ref, p.label AS property_label, p.postcode AS property_postcode FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id LEFT JOIN users u ON u.id = j.surveyor_id LEFT JOIN claims cl ON cl.id = j.claim_id LEFT JOIN properties p ON p.id = cl.property_id WHERE j.id = ?'],
  'survey.listSurveyorJobsIdBusinessId': ['all', 'SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, b.name, b.sector, b.stage, u.display_name AS surveyor_name, j.claim_id, cl.stage AS claim_stage, cl.claim_ref, p.label AS property_label, p.postcode AS property_postcode FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id LEFT JOIN users u ON u.id = j.surveyor_id LEFT JOIN claims cl ON cl.id = j.claim_id LEFT JOIN properties p ON p.id = cl.property_id ORDER BY j.created_at DESC LIMIT ?'],
  'survey.listSurveyorJobsIdBusinessIdByBusinessId': ['all', "SELECT j.id, j.business_id, b.sector, COALESCE(p.label, b.name) AS place, j.surveyor_id FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id " +
    'LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN properties p ON p.id = sp.property_id WHERE j.business_id = ? ORDER BY j.created_at, j.id'],
  'survey.listVideoMeetingsIdBookingIdByBookingIdJO': ['all', 'SELECT w.id, w.booking_id, b.starts_at, b.cancelled_at, u.display_name AS booked_by_name, ' +
    '(SELECT m.meeting_id FROM video_meetings m WHERE m.booking_id = b.id ORDER BY m.created_at DESC LIMIT 1) AS meeting_id ' +
    'FROM survey_walkthroughs w JOIN bookings b ON b.id = w.booking_id JOIN users u ON u.id = w.booked_by WHERE w.job_id = ? ORDER BY w.booked_at DESC'],
  'admin.getClaimsClaimRefBusinessNameById': ['get', 'SELECT c.claim_ref, b.name AS business_name, c.property_id FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?'],
  'admin.listSavedKeysNameSealedByRowidName': ['all', 'SELECT k.name, k.sealed, k.set_at, u.display_name AS who FROM saved_keys k LEFT JOIN users u ON u.id = k.set_by ' +
    'WHERE k.rowid = (SELECT max(x.rowid) FROM saved_keys x WHERE x.name = k.name) ORDER BY k.name'],
  'admin.getRegisterFileImportsImportedAtRowsKeptBySourceId': ['get', `SELECT i.imported_at, i.rows_kept, i.rows_skipped, u.display_name AS who FROM register_file_imports i LEFT JOIN users u ON u.id = i.by_user
    WHERE i.source_id = ? ORDER BY i.imported_at DESC, i.rowid DESC LIMIT 1`],
  'claims.getResearchRunsWhoAtByBusinessIdAt': ['get', 'SELECT u.display_name AS who, r.at FROM research_runs r LEFT JOIN users u ON u.id = r.actor_id ' +
    'WHERE r.business_id = ? AND r.at <= ? ORDER BY r.at DESC LIMIT 1'],
  'finance.listInvoiceChasesChasedOnHowByInvoiceId': ['all', 'SELECT c.chased_on, c.how, c.note, u.display_name AS who FROM invoice_chases c LEFT JOIN users u ON u.id = c.chased_by ' +
    'WHERE c.invoice_id = ? ORDER BY c.chased_on DESC, c.rowid DESC'],
  'finance.listInvoiceCreditNotesIdBasisByInvoiceId': ['all', 'SELECT c.id, c.basis, c.amount_pence, c.vat_pence, c.issued_on, c.reason, c.recorded_at, u.display_name AS who, n.seq ' +
    'FROM invoice_credit_notes c LEFT JOIN users u ON u.id = c.recorded_by LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id ' +
    'WHERE c.invoice_id = ? ORDER BY c.recorded_at ASC, c.rowid ASC'],
  'finance.listInvoicePaymentsIdReceivedOnByInvoiceId': ['all', 'SELECT p.id, p.received_on, p.amount_pence, p.bank_details_confirmed, p.recorded_at, u.display_name AS who, p.voided_at, ' +
    'p.void_reason, v.display_name AS voider FROM invoice_payments p LEFT JOIN users u ON u.id = p.recorded_by ' +
    'LEFT JOIN users v ON v.id = p.voided_by WHERE p.invoice_id = ? ORDER BY p.received_on ASC, p.rowid ASC'],
  'finance.getClaimsCreatedAtNameById': ['get', 'SELECT c.created_at, b.name FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?'],
  'finance.getClaimsIdBusinessIdById': ['get', 'SELECT c.id, c.business_id, c.claim_ref, c.stage, c.created_at, b.sector FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?'],
  'finance.getInvoicesIdBusinessIdById': ['get', 'SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.id = ?'],
  'finance.listInvoicesIdBusinessId': ['all', 'SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by ORDER BY i.invoice_date DESC, n.seq DESC LIMIT ?'],
  'finance.listInvoicesIdBusinessIdByClaimId': ['all', 'SELECT i.id, i.business_id, i.claim_id, i.kind, i.claim_value_pence, i.fee_pence, i.fee_rate, i.invoice_status, i.vat_position, i.vat_pence, i.invoice_date, i.due_on, i.due_basis, i.sent_on, i.fee_basis, i.fee_warning, i.cancelled_at, i.cancel_reason, i.created_at, i.entity_type, i.tax_rate, i.pool_split_main_pence, i.pool_split_special_pence, i.period_start, c.claim_ref, b.name AS client_name, n.seq, n.state AS number_state, u.display_name AS raiser, x.display_name AS canceller FROM invoices i JOIN claims c ON c.id = i.claim_id JOIN businesses b ON b.id = i.business_id LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = \'INVOICE\' LEFT JOIN users u ON u.id = i.raised_by LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.claim_id = ? ORDER BY i.invoice_date ASC, n.seq ASC'],
  'portal.getAccountantConfirmRequestsIdKindByTokenSha256': ['get', 'SELECT r.id, r.kind, r.expires_at, r.period_end, k.full_name AS name, b.name AS company, c.claim_ref, x.outcome, x.answered_at ' +
    'FROM accountant_confirm_requests r JOIN contacts k ON k.id = r.contact_id JOIN claims c ON c.id = r.claim_id JOIN businesses b ON b.id = c.business_id ' +
    'LEFT JOIN accountant_confirm_answers x ON x.request_id = r.id WHERE r.token_sha256 = ?'],
  'portal.listAccountantConfirmRequestsIdKindByClaimId': ['all', 'SELECT r.id, r.kind, k.full_name AS contact_name, r.to_email, u.display_name AS sent_by_name, r.sent_at, r.expires_at, r.period_end, ' +
    'x.outcome, x.signer_name, x.signer_firm, x.filed_on, x.reason, x.answered_at FROM accountant_confirm_requests r ' +
    'JOIN contacts k ON k.id = r.contact_id JOIN users u ON u.id = r.sent_by LEFT JOIN accountant_confirm_answers x ON x.request_id = r.id ' +
    'WHERE r.claim_id = ? ORDER BY r.sent_at DESC, r.rowid DESC'],
  'portal.getClaimsIdBusinessIdById8': ['get', 'SELECT c.id, c.business_id, c.stage, c.claim_ref, b.name AS company FROM claims c JOIN businesses b ON b.id = c.business_id WHERE c.id = ?'],
  'portal.getDocumentsIdBusinessIdById4': ['get', 'SELECT d.id, d.business_id, d.filename, d.declared_type, d.doc_type, d.byte_size, d.sniffed_as, d.state, d.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, d.logical_document_id, d.version_no, d.original_kept_at, d.original_deleted_at, t.label AS type_label, l.seq FROM documents d LEFT JOIN document_types t ON t.code = d.type_code LEFT JOIN logical_documents l ON l.id = d.logical_document_id WHERE d.id = ?'],
  'portal.listDocumentsIdBusinessIdByBusinessId': ['all', 'SELECT d.id, d.business_id, d.filename, d.declared_type, d.doc_type, d.byte_size, d.sniffed_as, d.state, d.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, d.logical_document_id, d.version_no, d.original_kept_at, d.original_deleted_at, t.label AS type_label, l.seq FROM documents d LEFT JOIN document_types t ON t.code = d.type_code LEFT JOIN logical_documents l ON l.id = d.logical_document_id WHERE d.business_id = ? ORDER BY d.created_at DESC'],
  'assessment.getFinanceSettingsIdSettingBySettingEffectiveFrom': ['get', 'SELECT s.id, s.setting, s.value, s.effective_from, s.source, s.recorded_at, u.display_name AS recorder FROM finance_settings s LEFT JOIN users u ON u.id = s.recorded_by WHERE s.setting = ? AND s.effective_from <= ? ORDER BY s.effective_from DESC, s.recorded_at DESC, s.rowid DESC LIMIT 1'],
  'assessment.listFinanceSettingsIdSetting': ['all', 'SELECT s.id, s.setting, s.value, s.effective_from, s.source, s.recorded_at, u.display_name AS recorder FROM finance_settings s LEFT JOIN users u ON u.id = s.recorded_by ORDER BY s.setting ASC, s.effective_from DESC, s.rowid DESC'],
  'claims.listClaimFactsIdFactKeyByClaimIdFactKey': ['all', 'SELECT f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
    'u.display_name AS recorder FROM claim_facts f LEFT JOIN users u ON u.id = f.recorded_by ' +
    'WHERE f.claim_id = ? AND f.fact_key = ? ORDER BY f.recorded_at DESC, f.rowid DESC'],
  'claims.listClaimFactsSeqIdByClaimId': ['all', 'SELECT f.rowid AS seq, f.id, f.fact_key, f.answer, f.value_text, f.value_pence, f.value_date, f.source_id, f.note, f.recorded_at, ' +
    'u.display_name AS recorder FROM claim_facts f LEFT JOIN users u ON u.id = f.recorded_by WHERE f.claim_id = ? ' +
    'ORDER BY f.recorded_at ASC, f.rowid ASC'],
  'claims.listClaimGrantsIdKindByClaimId': ['all', 'SELECT g.id, g.kind, g.payer_class, g.amount_pence, g.amount_basis, g.traced, g.traced_elements, g.source_id, g.note, ' +
    'g.recorded_at, u.display_name AS recorder, g.withdrawn_at, g.withdraw_reason, g.paid_to, g.event_id FROM claim_grants g ' +
    'LEFT JOIN users u ON u.id = g.recorded_by WHERE g.claim_id = ? ORDER BY g.recorded_at ASC, g.rowid ASC'],
  'claims.listClaimOwnerChainIdPositionByClaimIdWithdrawnAt': ['all', 'SELECT o.id, o.position, o.owner, o.acquired_on, o.ceased_on, o.claimed, o.source_id, o.recorded_at, u.display_name AS recorder ' +
    'FROM claim_owner_chain o LEFT JOIN users u ON u.id = o.recorded_by WHERE o.claim_id = ? AND o.withdrawn_at IS NULL ORDER BY o.position ASC'],
  'claims.getClaimStageMovesAtWhoByClaimIdKind': ['get', 'SELECT m.at, u.display_name AS who, m.reason_text AS reason, m.to_stage AS "to" FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id ' +
    "WHERE m.claim_id = ? AND m.kind = 'REOPEN' AND m.to_stage IN (SELECT value FROM json_each(?)) ORDER BY m.at DESC, m.rowid DESC LIMIT 1"],
  'claims.getDocumentsIdBusinessIdById': ['get', 'SELECT d.id, d.business_id, d.type_code, d.request_id, d.logical_document_id, d.version_no, d.strip_recorded_at, ' +
    'd.quarantine_discharged_at, d.failure_code, d.uploaded_by, u.role FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.id = ?'],
  'claims.getDocumentsLogicalDocumentIdUploadedByByIdTypeCode': ['get', 'SELECT d.logical_document_id, d.uploaded_by, u.role, d.version_no FROM documents d JOIN logical_documents l ON l.id = d.logical_document_id ' +
    'LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.id = ? AND l.type_code = ? AND d.strip_recorded_at IS NOT NULL ' +
    'AND d.quarantine_discharged_at IS NOT NULL AND d.failure_code IS NULL'],
  'claims.getDocumentsRoleById': ['get', 'SELECT u.role FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.id = ?'],
  'claims.listEngagementRequiredSignersUserIdSeqByEngagementId': ['all', 'SELECT r.user_id, r.seq, u.display_name AS name, u.email FROM engagement_required_signers r JOIN users u ON u.id = r.user_id ' +
    'WHERE r.engagement_id = ? ORDER BY r.seq ASC'],
  'claims.getEngagementsIdLetterStateByBusinessId': ['get', 'SELECT e.id, e.letter_state, e.created_at, e.sent_at, u.display_name AS sent_by, e.viewed_at, e.signed_at FROM engagements e LEFT JOIN users u ON u.id = e.sent_by WHERE e.business_id = ?'],
  'claims.listFactApprovalsFactRefActionByBusinessId': ['all', 'SELECT a.fact_ref, a.action, a.reason, a.at, u.display_name AS who FROM fact_approvals a ' +
    'LEFT JOIN users u ON u.id = a.actor_id WHERE a.business_id = ? ORDER BY a.at ASC, a.rowid ASC'],
  'claims.listHmrcEnquiriesIdOpenedOnByClaimId': ['all', 'SELECT e.id, e.opened_on, e.note, e.closed_on, e.outcome, e.amended_figure_pence, e.opened_recorded_at, u.display_name AS opener ' +
    'FROM hmrc_enquiries e LEFT JOIN users u ON u.id = e.opened_by WHERE e.claim_id = ? ORDER BY e.opened_on DESC, e.rowid DESC'],
  'claims.getLogicalDocumentsRoleById': ['get', 'SELECT u.role FROM logical_documents l JOIN users u ON u.id = l.created_by WHERE l.id = ?'],
  'claims.getUsersRoleById2': ['get', 'SELECT u.role FROM users u WHERE u.id = (SELECT created_by FROM logical_documents WHERE id = ?)'],
  'claims.listDocumentsIdLogicalDocumentIdByLogicalDocumentId': ['all', 'SELECT d.id, d.logical_document_id, d.version_no, d.type_code, d.retention_ref, d.request_id, d.state, d.doc_type, d.strip_recorded_at, d.quarantine_discharged_at, d.failure_code, d.created_at, u.role AS uploader_role, d.original_kept_at, d.original_delete_after, d.original_deleted_at FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.logical_document_id = ? ORDER BY d.version_no DESC'],
  'claims.getTaxAdviserSignoffsIdClaimIdByClaimId': ['get', 'SELECT s.id, s.claim_id, s.adviser, s.credential, s.signed_on, s.scope, s.method_note, s.switch_readings_json, s.figure_pence, s.commitment_id, s.record_hash, s.recorded_at, u.display_name AS recorder, s.approval_id FROM tax_adviser_signoffs s LEFT JOIN users u ON u.id = s.recorded_by WHERE s.claim_id = ? ORDER BY s.recorded_at DESC, s.rowid DESC LIMIT 1'],
  'claims.getTaxAdviserSignoffsIdClaimIdByClaimIdRecordedAt': ['get', 'SELECT s.id, s.claim_id, s.adviser, s.credential, s.signed_on, s.scope, s.method_note, s.switch_readings_json, s.figure_pence, s.commitment_id, s.record_hash, s.recorded_at, u.display_name AS recorder, s.approval_id FROM tax_adviser_signoffs s LEFT JOIN users u ON u.id = s.recorded_by WHERE s.claim_id = ? AND s.recorded_at >= ? ORDER BY s.recorded_at DESC, s.rowid DESC LIMIT 1'],
  'claims.listRegisterRecordsIdSourceIdBySourceIdBusinessId': ['all', "SELECT r.id, r.source_id, r.obtained_at, r.property_id, r.fields_json FROM register_records r JOIN documents v ON v.id = r.entity_id " +
    "WHERE r.source_id = 'CLIENT_DOC' AND r.business_id = ? AND v.logical_document_id = ? ORDER BY r.obtained_at ASC, r.id ASC"],
  'claims.getAssessmentsBusinessIdNameByBusinessIdId': ['get', 'SELECT b.id AS business_id, b.name, b.sector, b.stage, ' +
    '(SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at ' +
    'FROM businesses b WHERE b.id = ?'],
  'claims.listAssessmentsBusinessIdNameByBusinessId': ['all', 'SELECT b.id AS business_id, b.name, b.sector, b.stage, ' +
    '(SELECT MAX(a.submitted_at) FROM assessments a WHERE a.business_id = b.id) AS submitted_at ' +
    'FROM businesses b ORDER BY b.created_at DESC, b.name ASC LIMIT ?'],
  'claims.listClientStepNoticesClaimIdStepByBusinessId': ['all', 'SELECT e.claim_id, e.step, e.action, e.reason, e.at, u.display_name AS who FROM client_step_notices e ' +
    'LEFT JOIN users u ON u.id = e.actor_id WHERE e.business_id = ? ORDER BY e.at ASC, e.rowid ASC'],
  'claims.listClientTasksQuestionAnswerByBusinessIdState': ['all', "SELECT t.question, t.answer, t.answer_state, t.answered_at, t.answered_by_role AS role, u.display_name AS who, " +
    'c.display_name AS checker, k.checked_at FROM client_tasks t LEFT JOIN users u ON u.id = t.answered_by ' +
    'LEFT JOIN client_task_checks k ON k.task_id = t.id LEFT JOIN users c ON c.id = k.checked_by ' +
    "WHERE t.business_id = ? AND t.state = 'ANSWERED' AND t.kind = 'QUESTION' AND (t.claim_id = ? OR t.claim_id IS NULL) " +
    "AND (t.answered_by_role = 'STAFF' OR k.outcome = 'ACCEPTED') ORDER BY t.answered_at DESC"],
  'claims.getEngagementSignLinksIdEngagementIdByTokenSha256': ['get', 'SELECT k.id, k.engagement_id, k.user_id, k.sent_to, k.used_at, k.expires_at, e.business_id, e.letter_state, b.name AS business_name, ' +
    'b.company_number, u.disabled_at FROM engagement_sign_links k JOIN engagements e ON e.id = k.engagement_id ' +
    'JOIN businesses b ON b.id = e.business_id JOIN users u ON u.id = k.user_id WHERE k.token_sha256 = ?'],
  'claims.listFeeDiscountsIdDiscountBpByClaimId': ['all', 'SELECT f.id, f.discount_bp, f.reason, f.recorded_at, u.display_name AS who FROM fee_discounts f LEFT JOIN users u ON u.id = f.recorded_by ' +
    'WHERE f.claim_id = ? ORDER BY f.recorded_at DESC, f.rowid DESC'],
  'claims.listInternalNotesIdBodyByBusinessId': ['all', 'SELECT n.id, n.body, n.created_at, u.display_name AS author_name ' +
    'FROM internal_notes n LEFT JOIN users u ON u.id = n.author_id ' +
    'WHERE n.business_id = ? ORDER BY n.created_at DESC'],
  'claims.listLogicalDocumentsIdBusinessIdByBusinessId': ['all', 'SELECT l.id, l.business_id, l.type_code, l.seq, l.created_at, t.label, t.readers, t.carries_value, t.handler_type, ' +
    't.retention_ref AS type_retention, u.role AS created_role, u.display_name AS created_name FROM logical_documents l ' +
    'JOIN document_types t ON t.code = l.type_code LEFT JOIN users u ON u.id = l.created_by WHERE l.business_id = ? ' +
    'ORDER BY l.created_at DESC, l.seq DESC'],
  'claims.getPackClientNoticesToldAtToldByNameByApprovalId': ['get', 'SELECT n.told_at, u.display_name AS told_by_name FROM pack_client_notices n JOIN users u ON u.id = n.told_by WHERE n.approval_id = ?'],
  'claims.listPackSignoffRequestsIdApprovalIdByJobId': ['all', 'SELECT r.id, r.approval_id, a.version, c.full_name AS contact_name, r.to_email, r.permission_note, u.display_name AS sent_by_name, r.sent_at, r.expires_at, ' +
    'o.sent_at AS sent_at_outbox, o.last_error AS send_error, x.id AS a_id, x.outcome, x.signer_name, x.signer_firm, x.signer_credential, x.reason, x.answered_at, ' +
    'k.signoff_id AS recorded_signoff ' +
    'FROM pack_signoff_requests r JOIN survey_pack_approvals a ON a.id = r.approval_id JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN contacts c ON c.id = r.contact_id JOIN users u ON u.id = r.sent_by JOIN outbox o ON o.id = r.outbox_id ' +
    'LEFT JOIN pack_signoff_answers x ON x.request_id = r.id LEFT JOIN pack_signoff_recorded k ON k.answer_id = x.id ' +
    'WHERE p.job_id = ? ORDER BY r.sent_at DESC, r.rowid DESC'],
  'claims.listSurveyPackApprovalsIdVersionByBusinessIdClaimId': ['all', 'SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at, a.snapshot_json, j.id AS job_id, j.claim_id ' +
    'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id JOIN users u ON u.id = a.approved_by ' +
    'WHERE j.business_id = ? AND j.claim_id IS NOT NULL AND EXISTS (SELECT 1 FROM tax_adviser_signoffs s WHERE s.claim_id = j.claim_id ' +
    "AND s.approval_id = a.id AND s.figure_pence = json_extract(a.snapshot_json, '$.sums.qualifying_pence')) " +
    'ORDER BY a.approved_at DESC, a.version DESC'],
  'claims.getSurveyorJobsIdSurveyorIdByClaimId': ['get', 'SELECT j.id, j.surveyor_id, u.display_name AS who FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id ' +
    'WHERE j.claim_id = ? ORDER BY j.created_at DESC LIMIT 1'],
  'claims.listClientTasksIdFactIdByBusinessIdKind2': ['all', 'SELECT t.id, t.fact_id, t.question, t.why, t.holds_up, t.state, t.answer_state, t.answer, t.answered_at, t.answered_by_role, t.sent_to_portal_at, t.created_at, t.withdrawn_at, t.due_on, ab.display_name AS asked_by_name, an.display_name AS answered_by_name, wb.display_name AS withdrawn_by_name FROM client_tasks t LEFT JOIN users ab ON ab.id = t.asked_by LEFT JOIN users an ON an.id = t.answered_by LEFT JOIN users wb ON wb.id = t.withdrawn_by WHERE t.business_id = ? AND t.kind = \'QUESTION\' ORDER BY t.created_at ASC'],
  'claims.listDocumentFieldVouchesIdBusinessIdByRequestIdJO': ['all', 'SELECT ct.id, ct.business_id, ct.claim_id, c.claim_ref, ct.requested_type, t.label AS type_label, ct.state, ct.why, ct.holds_up, ct.due_on, ct.created_at, ct.withdrawn_at, ct.answered_at, ab.display_name AS asked_by, d.logical_document_id AS received_document, d.version_no AS received_version, (SELECT v.answer FROM document_field_vouches v WHERE v.request_id = ct.id LIMIT 1) AS early_answer, ct.event_id, pe.kind AS event_kind, pe.event_date AS event_date FROM client_tasks ct JOIN document_types t ON t.code = ct.requested_type LEFT JOIN claims c ON c.id = ct.claim_id LEFT JOIN users ab ON ab.id = ct.asked_by LEFT JOIN documents d ON d.id = ct.received_document_id LEFT JOIN property_events pe ON pe.id = ct.event_id WHERE ct.kind = \'DOCUMENT\' AND ct.business_id = ? AND ct.claim_id = ? ORDER BY CASE WHEN ct.state = \'OPEN\' THEN 0 ELSE 1 END, ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC'],
  'claims.listDocumentFieldVouchesIdBusinessIdByRequestIdJO2': ['all', 'SELECT ct.id, ct.business_id, ct.claim_id, c.claim_ref, ct.requested_type, t.label AS type_label, ct.state, ct.why, ct.holds_up, ct.due_on, ct.created_at, ct.withdrawn_at, ct.answered_at, ab.display_name AS asked_by, d.logical_document_id AS received_document, d.version_no AS received_version, (SELECT v.answer FROM document_field_vouches v WHERE v.request_id = ct.id LIMIT 1) AS early_answer, ct.event_id, pe.kind AS event_kind, pe.event_date AS event_date FROM client_tasks ct JOIN document_types t ON t.code = ct.requested_type LEFT JOIN claims c ON c.id = ct.claim_id LEFT JOIN users ab ON ab.id = ct.asked_by LEFT JOIN documents d ON d.id = ct.received_document_id LEFT JOIN property_events pe ON pe.id = ct.event_id WHERE ct.kind = \'DOCUMENT\' AND ct.business_id = ? ORDER BY CASE WHEN ct.state = \'OPEN\' THEN 0 ELSE 1 END, ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC'],

};

type Read = (db: Db, params?: readonly Param[]) => unknown;
/** Where a read is found: its area's borrowed file, else its data file, else the outside services' front door. */
async function readsOf(area: string): Promise<Record<string, Read>> {
  const borrowed = await import(`../../src/modules/${area}/data-borrowed.ts`) as Record<string, Read>;
  const data = await import(`../../src/modules/${area}/data.ts`) as Record<string, Read>;
  const outside = await import('../../src/integrations/index.ts') as unknown as Record<string, Read>;
  return new Proxy({}, { get: (_t, k: string) => borrowed[k] ?? data[k] ?? outside[k] }) as Record<string, Read>;
}

/**
 * The parameters each read is asked with: a query whose rows are the parameter lists (each row's values, in order).
 * Every id of the kind the read takes, so each row the fixture wrote is read.
 */
const ASKED: Readonly<Record<string, string>> = {
  'survey.getSurveyInspectionBasisBasisNoteByJobId': 'SELECT id FROM surveyor_jobs',
  'survey.listSurveyPackAddedLinesIdLabelByPackId': 'SELECT id FROM survey_packs',
  'survey.getSurveyPackApprovalsIdVersionByJobIdVersion': 'SELECT p.job_id, a.version FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id',
  'survey.listSurveyPackApprovalsIdVersionByPackId': 'SELECT id FROM survey_packs',
  'survey.listSurveyPackEntriesIdSeqByPackId': 'SELECT id FROM survey_packs',
  'survey.listSurveyPackLegalAnswersQuestionIdValueJsonByPackId': 'SELECT id FROM survey_packs',
  'survey.listSurveyPackWordsFieldWordsByPackId': 'SELECT id FROM survey_packs',
  'survey.listSurveyPhotoSortsIdItemKeyByPhotoIdJO': 'SELECT id FROM surveyor_jobs',
  'survey.listSurveyVideosIdContentTypeByJobIdVideoId': 'SELECT id FROM surveyor_jobs',
  'survey.listSurveyWalkthroughAsksAtByNameByJobId': 'SELECT id FROM surveyor_jobs',
  'survey.getSurveyorJobsIdSurveyorByClaimId': 'SELECT id FROM claims',
  'survey.getSurveyorJobsSurveyorByClaimId': 'SELECT id FROM claims',
  'survey.listSurveyorRoomCountsRoomIdRoomCountByJobId': 'SELECT id FROM surveyor_jobs',
  'survey.listClaimGrantsAmountPenceByIdPaidTo': 'SELECT id FROM surveyor_jobs',
  'survey.getEstimatesXById': 'SELECT id FROM surveyor_jobs',
  'survey.getSurveyorJobsPropertyIdPById': 'SELECT id FROM surveyor_jobs',
  'survey.getSurveyorJobsIdBusinessIdById': 'SELECT id FROM surveyor_jobs',
  'survey.getSurveyorJobsIdBusinessIdById2': 'SELECT id FROM surveyor_jobs',
  'survey.listSurveyorJobsIdBusinessId': 'SELECT 100 UNION ALL SELECT 2',
  'survey.listSurveyorJobsIdBusinessIdByBusinessId': 'SELECT id FROM businesses',
  'survey.listVideoMeetingsIdBookingIdByBookingIdJO': 'SELECT id FROM surveyor_jobs',
  'admin.getClaimsClaimRefBusinessNameById': 'SELECT id FROM claims',
  'admin.getRegisterFileImportsImportedAtRowsKeptBySourceId': 'SELECT DISTINCT source_id FROM register_file_imports',
  'claims.getResearchRunsWhoAtByBusinessIdAt': "SELECT id, '9999' FROM businesses",
  'finance.listInvoiceChasesChasedOnHowByInvoiceId': 'SELECT id FROM invoices',
  'finance.listInvoiceCreditNotesIdBasisByInvoiceId': 'SELECT id FROM invoices',
  'finance.listInvoicePaymentsIdReceivedOnByInvoiceId': 'SELECT id FROM invoices',
  'finance.getClaimsCreatedAtNameById': 'SELECT id FROM claims',
  'finance.getClaimsIdBusinessIdById': 'SELECT id FROM claims',
  'finance.getInvoicesIdBusinessIdById': 'SELECT id FROM invoices',
  'finance.listInvoicesIdBusinessId': 'SELECT 100 UNION ALL SELECT 1',
  'finance.listInvoicesIdBusinessIdByClaimId': 'SELECT id FROM claims',
  'portal.getAccountantConfirmRequestsIdKindByTokenSha256': 'SELECT token_sha256 FROM accountant_confirm_requests',
  'portal.listAccountantConfirmRequestsIdKindByClaimId': 'SELECT id FROM claims',
  'portal.getClaimsIdBusinessIdById8': 'SELECT id FROM claims',
  'portal.getDocumentsIdBusinessIdById4': 'SELECT id FROM documents',
  'portal.listDocumentsIdBusinessIdByBusinessId': 'SELECT id FROM businesses',
  'assessment.getFinanceSettingsIdSettingBySettingEffectiveFrom': "SELECT DISTINCT setting, '9999-12-31' FROM finance_settings",
  'claims.listClaimFactsIdFactKeyByClaimIdFactKey': 'SELECT DISTINCT claim_id, fact_key FROM claim_facts',
  'claims.listClaimFactsSeqIdByClaimId': 'SELECT id FROM claims',
  'claims.listClaimGrantsIdKindByClaimId': 'SELECT id FROM claims',
  'claims.listClaimOwnerChainIdPositionByClaimIdWithdrawnAt': 'SELECT id FROM claims',
  'claims.getClaimStageMovesAtWhoByClaimIdKind': 'SELECT id, (SELECT json_group_array(DISTINCT to_stage) FROM claim_stage_moves) FROM claims',
  'claims.getDocumentsIdBusinessIdById': 'SELECT id FROM documents',
  'claims.getDocumentsLogicalDocumentIdUploadedByByIdTypeCode': 'SELECT d.id, l.type_code FROM documents d JOIN logical_documents l ON l.id = d.logical_document_id',
  'claims.getDocumentsRoleById': 'SELECT id FROM documents',
  'claims.listEngagementRequiredSignersUserIdSeqByEngagementId': 'SELECT id FROM engagements',
  'claims.getEngagementsIdLetterStateByBusinessId': 'SELECT id FROM businesses',
  'claims.listFactApprovalsFactRefActionByBusinessId': 'SELECT id FROM businesses',
  'claims.listHmrcEnquiriesIdOpenedOnByClaimId': 'SELECT id FROM claims',
  'claims.getLogicalDocumentsRoleById': 'SELECT id FROM logical_documents',
  'claims.getUsersRoleById2': "SELECT id FROM logical_documents UNION ALL SELECT 'no-such-document'",
  'claims.listDocumentsIdLogicalDocumentIdByLogicalDocumentId': 'SELECT id FROM logical_documents',
  'claims.getTaxAdviserSignoffsIdClaimIdByClaimId': 'SELECT id FROM claims',
  'claims.getTaxAdviserSignoffsIdClaimIdByClaimIdRecordedAt': "SELECT id, '' FROM claims",
  'claims.listRegisterRecordsIdSourceIdBySourceIdBusinessId': 'SELECT business_id, id FROM logical_documents',
  'claims.getAssessmentsBusinessIdNameByBusinessIdId': 'SELECT id FROM businesses',
  'claims.listAssessmentsBusinessIdNameByBusinessId': 'SELECT 100 UNION ALL SELECT 3',
  'claims.listClientStepNoticesClaimIdStepByBusinessId': 'SELECT id FROM businesses',
  'claims.listClientTasksQuestionAnswerByBusinessIdState': 'SELECT b.id AS b, c.id AS c FROM businesses b JOIN claims c ON c.business_id = b.id',
  'claims.getEngagementSignLinksIdEngagementIdByTokenSha256': 'SELECT token_sha256 FROM engagement_sign_links',
  'claims.listFeeDiscountsIdDiscountBpByClaimId': 'SELECT id FROM claims',
  'claims.listInternalNotesIdBodyByBusinessId': 'SELECT id FROM businesses',
  'claims.listLogicalDocumentsIdBusinessIdByBusinessId': 'SELECT id FROM businesses',
  'claims.getPackClientNoticesToldAtToldByNameByApprovalId': 'SELECT id FROM survey_pack_approvals',
  'claims.listPackSignoffRequestsIdApprovalIdByJobId': 'SELECT id FROM surveyor_jobs',
  'claims.listSurveyPackApprovalsIdVersionByBusinessIdClaimId': 'SELECT id FROM businesses',
  'claims.getSurveyorJobsIdSurveyorIdByClaimId': 'SELECT id FROM claims',
  'claims.listClientTasksIdFactIdByBusinessIdKind2': 'SELECT id FROM businesses',
  'claims.listDocumentFieldVouchesIdBusinessIdByRequestIdJO': 'SELECT b.id AS b, c.id AS c FROM businesses b JOIN claims c ON c.business_id = b.id',
  'claims.listDocumentFieldVouchesIdBusinessIdByRequestIdJO2': 'SELECT id FROM businesses',
};
// Two reads take no parameter: they are asked once, with none.
const NO_PARAMS = new Set(['admin.listSavedKeysNameSealedByRowidName', 'assessment.listFinanceSettingsIdSetting']);

/** One fixture row (a test may write rows; the walls are for src/), saying which statement failed if one does. */
function put(db: Db, sql: string, params: readonly Param[]): void {
  try {
    db.run(sql, params);
  } catch (e) {
    throw new Error(`the fixture could not run ${sql}: ${(e as Error).message}`);
  }
}

/** A row in every table the reads read, on top of the seed, with users present and absent where a LEFT JOIN allows. */
function fixture(db: Db, at: () => string): void {
  const user = (role: string): string => db.get<{ id: string }>('SELECT id FROM users WHERE role = ?', [role])?.id ?? '';
  const admin = user('ADMIN'), sales = user('SALES'), accounting = user('ACCOUNTING'), surveyor = user('SURVEYING'), client = user('CLIENT');
  const job = db.get<{ id: string; business_id: string; claim_id: string }>('SELECT id, business_id, claim_id FROM surveyor_jobs WHERE claim_id IS NOT NULL ORDER BY rowid LIMIT 1');
  assert.ok(job !== undefined, 'the seed has a survey job on a claim');
  const claim = db.get<{ id: string; business_id: string; property_id: string | null; assessment_id: string }>('SELECT id, business_id, property_id, assessment_id FROM claims WHERE id = ?', [job.claim_id]);
  assert.ok(claim !== undefined);
  const B = job.business_id, C = job.claim_id, J = job.id;
  // A second job on the same claim, with no surveyor yet (the LEFT JOIN on users finds no one).
  const J2 = randomUUID();
  put(db, 'INSERT INTO surveyor_jobs (id, business_id, assessment_id, surveyor_id, state, committed_at, created_at, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [J2, B, claim.assessment_id, null, 'SEALED', null, at(), C]);
  const pack = randomUUID(), pack2 = randomUUID();
  put(db, 'INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)', [pack, J, claim.property_id, at(), surveyor]);
  put(db, 'INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)', [pack2, J2, null, at(), surveyor]);
  const approval = randomUUID();
  const snapshot = JSON.stringify({ fixture: true, sums: { qualifying_pence: 240_000_00 } });
  put(db, 'INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [approval, pack, 1, 1, 0, snapshot, 'f'.repeat(64), surveyor, at()]);
  put(db, 'INSERT INTO survey_inspection_basis (id, job_id, basis, note, by_user, at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), J, 'SITE_VISIT', 'a fixture basis', surveyor, at()]);
  put(db, 'INSERT INTO survey_pack_added_lines (id, pack_id, label, unit, added_by, added_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), pack, 'A fixture line', 'no', surveyor, at(), 'a fixture reason']);
  put(db, 'INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), pack, 1, 'L1', 'qty', '1000', null, surveyor, 'a fixture entry', at()]);
  put(db, 'INSERT INTO survey_pack_legal_answers (id, pack_id, seq, question_id, value_json, by_user, source_note, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), pack, 1, 'G9d', '"YES"', surveyor, 'a fixture note', at()]);
  put(db, 'INSERT INTO survey_pack_words (id, pack_id, field, words, by_user, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), pack, 'works_scope', 'Fixture words.', surveyor, 'a fixture reason', at()]);
  const photo = randomUUID();
  put(db, 'INSERT INTO survey_photos (id, job_id, item_key, object_key, content_type, byte_size, sha256, note, taken_by, taken_at, nobody_in_it) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [photo, J, 'KITCHEN', 'survey-photos/fixture-1', 'image/jpeg', 10, 'a'.repeat(64), null, surveyor, at(), 1]);
  put(db, 'INSERT INTO survey_photo_sorts (id, photo_id, item_key, by_user, at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), photo, 'BOILER', surveyor, at()]);
  const send = randomUUID();
  put(db, 'INSERT INTO survey_video_sends (id, job_id, by_user, byte_size, pieces, note, nobody_in_it, public_key, private_key_sealed, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [send, J, surveyor, 10, 1, null, 1, 'k'.repeat(100), 'p'.repeat(100), at(), '2099-01-01T00:00:00.000Z']);
  put(db, 'INSERT INTO survey_videos (id, job_id, content_type, byte_size, duration_ms, pieces, places_blanked, note, taken_by, taken_at, nobody_in_it) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [send, J, 'video/mp4', 10, 1000, 1, 0, null, surveyor, at(), 1]);
  put(db, 'INSERT INTO survey_walkthrough_asks (id, job_id, by_user, at) VALUES (?, ?, ?, ?)', [randomUUID(), J, sales, at()]);
  const booking = db.get<{ id: string }>('SELECT id FROM bookings ORDER BY rowid LIMIT 1');
  assert.ok(booking !== undefined, 'the seed has a booking');
  put(db, 'INSERT INTO survey_walkthroughs (id, job_id, booking_id, booked_by, booked_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), J, booking.id, sales, at()]);
  put(db, 'INSERT INTO video_meetings (id, booking_id, provider, meeting_id, join_url, passcode, client_token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), booking.id, 'zoom', '123456789', 'https://example.invalid/1', null, '1'.repeat(64), at()]);
  put(db, 'INSERT INTO surveyor_room_counts (id, job_id, room_id, room_count, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), J, 'surgery', 2, null, surveyor, at()]);
  put(db, 'INSERT INTO claim_grants (id, claim_id, kind, payer_class, amount_pence, amount_basis, traced, traced_elements, source_id, note, recorded_by, recorded_at, paid_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), C, 'GRANT', 'nhs', 1000, 'agreement', 'NO', null, 'CLIENT_DOC', null, sales, at(), 'PAST_OWNER']);
  put(db, 'INSERT INTO saved_keys (id, name, sealed, set_by, set_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), 'FIXTURE_KEY', 'cbkey1:fixture', admin, at()]);
  put(db, 'INSERT INTO register_file_imports (source_id, file_name, imported_at, rows_kept, rows_skipped, by_user) VALUES (?, ?, ?, ?, ?, ?)', ['CIW', 'fixture.csv', at(), 1, 0, admin]);
  put(db, 'INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, not_permitted, failed, kind, source_id, cost_pence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), B, sales, at(), 1, 1, 0, 0, 'RUN', null, null]);
  const invoice = db.get<{ id: string }>('SELECT id FROM invoices WHERE claim_id IS NOT NULL ORDER BY rowid LIMIT 1');
  assert.ok(invoice !== undefined, 'the seed has an invoice on a claim');
  const raised = db.get<{ id: string; fee_pence: number }>("SELECT id, fee_pence FROM invoices WHERE claim_id IS NOT NULL AND invoice_status IN ('RAISED','SENT') ORDER BY rowid LIMIT 1");
  if (raised !== undefined) {
    put(db, 'INSERT INTO invoice_credit_notes (id, invoice_id, basis, amount_pence, vat_pence, corrected_claim_value_pence, issued_on, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), raised.id, 'CREDIT_IN_FULL', 1, 0, null, '2026-09-02', 'a fixture credit', accounting, at()]);
  }
  put(db, 'INSERT INTO invoice_chases (id, invoice_id, chased_on, how, note, chased_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), invoice.id, '2026-09-01', 'PHONE', null, accounting, at()]);
  const contact = db.get<{ id: string }>('SELECT id FROM contacts WHERE business_id = ? ORDER BY rowid LIMIT 1', [B]);
  assert.ok(contact !== undefined, 'the seed has a contact at the organisation');
  const outbox = randomUUID();
  put(db, 'INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, business_id, claim_id, last_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [outbox, at(), 'finance@b.example.invalid', 'Fixture', 'Fixture.', 'TEMPLATE', at(), B, C, null]);
  const request = randomUUID();
  put(db, 'INSERT INTO accountant_confirm_requests (id, claim_id, kind, contact_id, to_email, token_sha256, outbox_id, sent_by, sent_at, expires_at, period_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [request, C, 'FILED', contact.id, 'finance@b.example.invalid', 'b'.repeat(64), outbox, sales, at(), '2099-01-01T00:00:00.000Z', '2025-12-31']);
  put(db, 'INSERT INTO pack_signoff_requests (id, approval_id, contact_id, to_email, token_sha256, permission_note, outbox_id, sent_by, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), approval, contact.id, 'finance@b.example.invalid', 'c'.repeat(64), 'a fixture note', outbox, sales, at(), '2099-01-01T00:00:00.000Z']);
  const message = randomUUID();
  put(db, 'INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [message, B, C, 'TO_CLIENT', 'STAFF', sales, null, 'Your report is ready.', at()]);
  put(db, 'INSERT INTO pack_client_notices (approval_id, message_id, told_by, told_at) VALUES (?, ?, ?, ?)', [approval, message, sales, at()]);
  const type = db.get<{ code: string }>('SELECT code FROM document_types WHERE handler_type IS NOT NULL AND active = 1 ORDER BY ord LIMIT 1');
  assert.ok(type !== undefined);
  const logical = randomUUID(), doc = randomUUID(), doc2 = randomUUID();
  put(db, 'INSERT INTO logical_documents (id, business_id, type_code, seq, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', [logical, B, type.code, 1, sales, at()]);
  put(db, 'INSERT INTO documents (id, business_id, uploaded_by, filename, state, strip_recorded_at, quarantine_discharged_at, created_at, logical_document_id, version_no, type_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [doc, B, client, 'fixture.pdf', 'RECEIVED', at(), at(), at(), logical, 1, type.code]);
  put(db, 'INSERT INTO documents (id, business_id, uploaded_by, filename, state, created_at, logical_document_id, version_no, type_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [doc2, B, sales, 'loose.pdf', 'RECEIVED', at(), null, null, null]);
  put(db, 'INSERT INTO register_records (id, business_id, source_id, entity_id, obtained_at, property_id, fields_json) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), B, 'CLIENT_DOC', doc, at(), claim.property_id, '{}']);
  put(db, 'INSERT INTO claim_stage_moves (id, claim_id, at, actor_id, actor_role, kind, from_stage, to_stage, reason_code, reason_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), C, at(), sales, 'SALES', 'REOPEN', 'VALUATION', 'SURVEY', null, 'a fixture reopening']);
  put(db, 'INSERT INTO claim_owner_chain (id, claim_id, position, owner, claimed, source_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), C, 1, 'A fixture owner', 'NO', 'CLIENT_DOC', sales, at()]);
  put(db, 'INSERT INTO client_step_notices (id, business_id, claim_id, step, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), B, C, 'TAX', 'TOLD', null, sales, at()]);
  const task = randomUUID(), task2 = randomUUID();
  put(db, 'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, answer_state, answer, answered_at, answered_by, answered_by_role, created_at, kind, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [task, B, sales, 'A fixture question?', 'Because.', 'the claim', 'ANSWERED', 'ANSWERED', 'Yes.', at(), client, 'CLIENT', at(), 'QUESTION', C]);
  put(db, 'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, kind, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [task2, B, null, 'Unasked?', 'Because.', 'the claim', 'OPEN', at(), 'QUESTION', null]);
  put(db, 'INSERT INTO client_task_checks (id, task_id, outcome, reason, checked_by, checked_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), task, 'ACCEPTED', null, sales, at()]);
  put(db, 'INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, kind, requested_type, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), B, sales, 'Please send the accounts.', 'Because.', 'the claim', 'OPEN', at(), 'DOCUMENT', type.code, C]);
  const engagement = db.get<{ id: string; business_id: string }>('SELECT id, business_id FROM engagements WHERE business_id = ?', [B]);
  assert.ok(engagement !== undefined, 'the seed has a letter for the organisation');
  db.run('UPDATE engagements SET sent_by = ? WHERE id = ?', [sales, engagement.id]);
  put(db, 'INSERT INTO engagement_required_signers (id, engagement_id, user_id, seq, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), engagement.id, client, 1, sales, at()]);
  put(db, 'INSERT INTO engagement_sign_links (id, engagement_id, user_id, token_sha256, sent_to, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), engagement.id, client, 'd'.repeat(64), 'client@b.example.invalid', sales, at(), '2099-01-01T00:00:00.000Z']);
  put(db, 'INSERT INTO fact_approvals (id, business_id, fact_ref, action, reason, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), B, 'fact-1', 'APPROVED', null, client, at()]);
  put(db, 'INSERT INTO fee_discounts (id, claim_id, business_id, discount_bp, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [randomUUID(), C, B, 500, 'a fixture reason', admin, at()]);
  put(db, 'INSERT INTO hmrc_enquiries (id, claim_id, opened_on, note, opened_by, opened_recorded_at) VALUES (?, ?, ?, ?, ?, ?)', [randomUUID(), C, '2026-09-01', null, sales, at()]);
  put(db, 'INSERT INTO internal_notes (id, business_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [randomUUID(), B, sales, 'A fixture note.', at()]);
  const commitment = db.get<{ id: string }>('SELECT id FROM surveyor_commitments WHERE job_id = ?', [J])?.id ?? randomUUID();
  if (db.get('SELECT 1 AS x FROM surveyor_commitments WHERE id = ?', [commitment]) === undefined) {
    put(db, 'INSERT INTO surveyor_commitments (id, job_id, surveyor_id, a_qualifying_plant_pence, b_building_pence, c_bare_land_pence, qualifying_pct, method_note, committed_at, figures_hash, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [commitment, J, surveyor, 250_000_00, 700_000_00, 50_000_00, 0.25, 'a fixture commitment', at(), 'f'.repeat(64), at()]);
  }
  put(db, 'INSERT INTO tax_adviser_signoffs (id, claim_id, adviser, credential, signed_on, scope, method_note, switch_readings_json, figure_pence, commitment_id, kind, record_hash, recorded_by, recorded_at, approval_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), C, 'CAPREBATE_CTA', 'Chartered Tax Adviser', '2026-09-01', 'the fixture claim', 'a fixture method', '[]', 240_000_00, commitment, 'RECORD_NOT_A_SIGNATURE', 'e'.repeat(64), sales, at(), approval]);
}

test('every read split by owner gives exactly what the join it replaced gave, and finds rows', async () => {
  const app = await testApp();
  await seed(app.db, app.hasher, app.now);
  fixture(app.db, app.now);
  const areas = new Map<string, Record<string, Read>>();
  const empty: string[] = [];
  for (const [key, [kind, sql]] of Object.entries(ORIGINAL)) {
    const [area, name] = key.split('.') as [string, string];
    if (!areas.has(area)) areas.set(area, await readsOf(area));
    const read = areas.get(area)?.[name];
    assert.equal(typeof read, 'function', `${key} is not found`);
    const asked: (readonly Param[])[] = NO_PARAMS.has(key) ? [[]]
      : app.db.all<Row>(ASKED[key] ?? assert.fail(`${key} has no parameters`)).map((r) => Object.values(r) as Param[]);
    let found = 0;
    for (const params of asked) {
      const now = (read as Read)(app.db, params);
      const was = kind === 'get' ? app.db.get(sql, params) : app.db.all(sql, params);
      assert.equal(JSON.stringify(now), JSON.stringify(was), `${key}(${JSON.stringify(params)})`);
      found += Array.isArray(was) ? was.length : was === undefined ? 0 : 1;
    }
    if (found === 0) empty.push(key);
  }
  assert.deepEqual(empty, [], 'these reads found no row, so their pins prove nothing');
  app.close();
});
