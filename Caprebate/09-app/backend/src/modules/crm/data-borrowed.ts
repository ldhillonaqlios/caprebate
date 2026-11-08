/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CRM (09-app/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// assessments
export function getAssessmentsIdLeadIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.id, l.id AS lead_id, l.status AS lead_status FROM assessments a LEFT JOIN leads l ON l.assessment_id = a.id ' +
    'WHERE a.business_id = ? ORDER BY a.submitted_at DESC, a.id DESC LIMIT 1', params);
}

// audit_log
export function listAuditLogAtDetailByKindBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.at, a.detail, u.display_name AS who FROM audit_log a JOIN invoices i ON i.id = a.object_id ' +
    "LEFT JOIN users u ON u.id = a.actor_id WHERE a.kind = 'INVOICE_UPDATED' AND i.business_id = ? AND i.claim_id IS NULL ORDER BY a.seq", params);
}

// automation_runs
export function listAutomationRunsAtTriggerEvent<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.at, r.trigger_event, r.outcome, r.reason, r.tasks_created, r.outbox_id, c.id AS claim_id, r.lead_id, r.task_id, ' +
    'ar.label FROM automation_runs r JOIN automation_rules ar ON ar.id = r.rule_id LEFT JOIN claims c ON c.id = r.claim_id ' +
    'ORDER BY r.at DESC, r.rowid DESC LIMIT ?', params);
}

// booking_changes
export function listBookingChangesAtFromStartsAtByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.at, c.from_starts_at, c.to_starts_at, u.display_name AS who, c.cancelled FROM booking_changes c LEFT JOIN users u ON u.id = c.changed_by ' +
    'WHERE c.booking_id = ? ORDER BY c.at', params);
}

// bookings
export function getBookingsCountByIdChannel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(`SELECT count(*) AS n FROM bookings o
    WHERE o.id <> ? AND o.channel = 'video' AND o.cancelled_at IS NULL AND o.starts_at IS NOT NULL AND o.ends_at IS NOT NULL
    AND o.starts_at < ? AND o.ends_at > ?
    AND coalesce((SELECT m.host_user_id FROM video_meetings m WHERE m.booking_id = o.id AND m.cancelled_at IS NULL), '') = ?`, params);
}
export function getBookingsIdEmailByIdDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(`SELECT u.id, u.email, u.display_name FROM bookings b JOIN users u ON u.id = b.assigned_to
    WHERE b.id = ? AND u.disabled_at IS NULL AND u.role <> 'CLIENT'`, params);
}
export function listBookingsIdChannelByBusinessIdChannel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT b.id, b.channel, b.starts_at, b.ends_at, b.created_at, b.cancelled_at, u.display_name AS who FROM bookings b LEFT JOIN users u ON u.id = b.assigned_to " +
    "WHERE b.business_id = ? AND b.channel IN ('video','phone') ORDER BY b.created_at, b.id", params);
}

// call_logs
export function listCallLogsIdLoggedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.id, k.logged_at, k.outcome, k.notes, k.contact_id, c.full_name AS contact, u.display_name AS writer FROM call_logs k LEFT JOIN contacts c ON c.id = k.contact_id ' +
    'LEFT JOIN users u ON u.id = k.logged_by WHERE k.business_id = ? ORDER BY k.logged_at, k.id', params);
}

// claim_contacts
export function listClaimContactsIdContactIdByClaimIdUnlinkedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.id, k.contact_id, k.linked_at, ct.full_name, ct.contact_type, u.display_name AS linked_by FROM claim_contacts k ' +
    'JOIN contacts ct ON ct.id = k.contact_id LEFT JOIN users u ON u.id = k.linked_by ' +
    'WHERE k.claim_id = ? AND k.unlinked_at IS NULL ORDER BY ct.full_name ASC, k.id ASC', params);
}

// claim_milestones
export function listClaimMilestonesRecordedAtMilestoneByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT cm.recorded_at, cm.milestone, u.display_name AS who FROM claim_milestones cm LEFT JOIN users u ON u.id = cm.recorded_by ' +
    'WHERE cm.claim_id = ? ORDER BY cm.recorded_at', params);
}

// claim_stage_moves
export function getClaimStageMovesLabelByClaimIdToStage<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT r.label FROM claim_stage_moves m JOIN reason_lists r ON r.list = 'CLAIM_EXIT' AND r.code = m.reason_code " +
    "WHERE m.claim_id = ? AND m.to_stage = 'REASONED_NEGATIVE' ORDER BY m.at DESC, m.rowid DESC LIMIT 1", params);
}
export function listClaimStageMovesAtKindByClaimId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.at, m.kind, m.from_stage, m.to_stage, m.reason_code, m.reason_text, u.display_name AS who ' +
    'FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id WHERE m.claim_id = ? ORDER BY m.at DESC, m.rowid DESC', params);
}
export function listClaimStageMovesAtKindByClaimId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.at, m.kind, m.from_stage, m.to_stage, m.reason_code, m.reason_text, u.display_name AS who ' +
    'FROM claim_stage_moves m LEFT JOIN users u ON u.id = m.actor_id WHERE m.claim_id = ? ORDER BY m.at, m.rowid', params);
}

// claims
export function getClaimsBusinessIdCompanyById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.business_id, b.name AS company, p.label AS property, c.claim_ref AS ref FROM claims c JOIN businesses b ON b.id = c.business_id ' +
    'LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ?', params);
}
export function listClaimsIdClaimRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, u.display_name AS owner_name ' +
    'FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.claim_ref ASC', params);
}
export function listClaimsIdClaimRefByOwnerId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name FROM claims c JOIN businesses b ON b.id = c.business_id ' +
    'WHERE c.owner_id IS NULL ORDER BY c.claim_ref ASC', params);
}
export function listClaimsIdCompletedAtByStage<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT c.id, c.completed_at, l.lead_date FROM claims c LEFT JOIN leads l ON l.claim_id = c.id WHERE c.stage = 'CLOSED'", params);
}

// client_report_acceptances
export function getClientReportAcceptancesAcceptedAtNameByClaimIdFingerprint<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT x.accepted_at, u.display_name AS name FROM client_report_acceptances x LEFT JOIN users u ON u.id = x.user_id ' +
    "WHERE x.claim_id = ? AND x.fingerprint = (SELECT content_hash FROM claim_deliverables WHERE claim_id = ? AND kind = 'CLIENT_REPORT' " +
    // An acceptance from before the valuation was last reopened is set aside (src/modules/claims/valuation-lock.ts).
    "AND state = 'ISSUED' ORDER BY version DESC LIMIT 1) AND x.accepted_at >= ? ORDER BY x.accepted_at ASC LIMIT 1", params);
}

// client_task_checks
export function getClientTaskChecksOutcomeWhoByTaskId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT k.outcome, u.display_name AS who, k.checked_at, k.reason FROM client_task_checks k LEFT JOIN users u ON u.id = k.checked_by WHERE k.task_id = ?', params);
}

// client_tasks
export function listClientTasksIdKindByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.kind, t.question, t.answer, t.answer_state, t.received_document_id, d.logical_document_id AS logical, ' +
    'u.display_name AS who, t.answered_at FROM client_tasks t LEFT JOIN client_task_checks k ON k.task_id = t.id ' +
    'LEFT JOIN users u ON u.id = t.answered_by LEFT JOIN documents d ON d.id = t.received_document_id ' +
    "WHERE t.business_id = ? AND (t.claim_id = ? OR t.claim_id IS NULL) AND t.state = 'ANSWERED' AND t.answered_by_role = 'CLIENT' " +
    'AND k.id IS NULL ORDER BY t.answered_at ASC, t.rowid ASC', params);
}
export function listClientTasksIdTypeLabelByAskedByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT ct.id, t.label AS type_label, ct.due_on, ct.business_id, b.name AS business_name, ct.claim_id, c.claim_ref FROM client_tasks ct ' +
    'JOIN document_types t ON t.code = ct.requested_type JOIN businesses b ON b.id = ct.business_id LEFT JOIN claims c ON c.id = ct.claim_id ' +
    "WHERE ct.asked_by = ? AND ct.kind = 'DOCUMENT' AND ct.state = 'OPEN' ORDER BY ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC", params);
}
export function listClientTasksQuestionCreatedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT ct.question, ct.created_at, ct.sent_to_portal_at, ct.answered_at, ct.answer_state, ct.answered_by_role, ct.withdrawn_at, ' +
    'ct.due_on, ab.display_name AS asked_by, an.display_name AS answered_by, wb.display_name AS withdrawn_by, ct.kind, ' +
    't.label AS type_label, ct.claim_id, c.claim_ref, d.version_no AS received_version, l.seq AS received_seq FROM client_tasks ct ' +
    'LEFT JOIN users ab ON ab.id = ct.asked_by LEFT JOIN users an ON an.id = ct.answered_by LEFT JOIN users wb ON wb.id = ct.withdrawn_by ' +
    'LEFT JOIN document_types t ON t.code = ct.requested_type LEFT JOIN claims c ON c.id = ct.claim_id ' +
    'LEFT JOIN documents d ON d.id = ct.received_document_id LEFT JOIN logical_documents l ON l.id = d.logical_document_id ' +
    'WHERE ct.business_id = ? ORDER BY ct.created_at', params);
}

// deletion_log
export function insertDeletionLog(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, ' +
    'executed_at, stores_json, backups_pending, backup_cycle_days, backup_copies_expire_at, verified_by, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)', params);
}

// document_links
export function listDocumentLinksLogicalDocumentIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.logical_document_id, l.business_id, t.readers, t.carries_value, t.label, l.seq, k.claim_id, c.claim_ref, p.label AS property_label, ' +
    'k.linked_at, k.unlinked_at, lb.display_name AS linked_by, ub.display_name AS unlinked_by FROM document_links k ' +
    'JOIN logical_documents l ON l.id = k.logical_document_id JOIN document_types t ON t.code = l.type_code ' +
    'LEFT JOIN claims c ON c.id = k.claim_id LEFT JOIN properties p ON p.id = k.property_id ' +
    'LEFT JOIN users lb ON lb.id = k.linked_by LEFT JOIN users ub ON ub.id = k.unlinked_by WHERE l.business_id = ? ORDER BY k.linked_at', params);
}

// document_types
export function getDocumentTypesHandlerTypeActiveByCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT handler_type, active FROM document_types WHERE code = ?', params);
}
export function listDocumentTypesCodeLabelByActiveHandlerType2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label FROM document_types WHERE active = 1 AND handler_type IS NOT NULL ORDER BY ord ASC, code ASC', params);
}

// documents
export function getDocumentsCountByBusinessIdRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.business_id = ? AND u.role = 'CLIENT' AND d.created_at >= ?", params);
}
export function listDocumentsIdBusinessIdByLogicalDocumentIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, t.readers, t.carries_value, t.label, l.seq, ' +
    '(SELECT d.id FROM documents d WHERE d.logical_document_id = l.id ORDER BY d.version_no DESC LIMIT 1) AS version ' +
    'FROM client_message_files f JOIN logical_documents l ON l.id = f.logical_document_id ' +
    'JOIN document_types t ON t.code = l.type_code WHERE f.message_id = ? ORDER BY f.linked_at', params);
}
export function listDocumentsIdDeclaredTypeByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.id, d.declared_type, d.doc_type, d.state, d.created_at, t.label AS type_label, l.seq, d.version_no FROM documents d ' +
    'LEFT JOIN document_types t ON t.code = d.type_code LEFT JOIN logical_documents l ON l.id = d.logical_document_id ' +
    'WHERE d.business_id = ? ORDER BY d.created_at', params);
}

// email_sender
export function getEmailSenderA<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT address AS a FROM email_sender ORDER BY rowid DESC LIMIT 1', params);
}
export function insertEmailSender(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO email_sender (id, display_name, address, reply_to, set_by, set_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// email_templates
export function getEmailTemplatesLabelSubjectByIdActive<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label, subject, body FROM email_templates WHERE id = ? AND active = 1', params);
}

// enquiry_checks
export function listEnquiryChecksRecordedAtCheckKeyByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.recorded_at, e.check_key, e.answer, u.display_name AS who FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.claim_id = ? ORDER BY e.recorded_at', params);
}
export function listEnquiryChecksRecordedAtCheckKeyByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.recorded_at, e.check_key, e.answer, u.display_name AS who FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.lead_id = ? ORDER BY e.recorded_at', params);
}

// estimates
export function listEstimatesIdClaimRefByAssessmentIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.stage, c.hold_return_stage, c.owner_id, u.display_name AS owner_name, ' +
    'c.assessment_id, c.expected_completion, c.completed_at, c.created_at, ' +
    '(SELECT e.qualifying_expenditure_pence FROM estimates e WHERE e.assessment_id = c.assessment_id ORDER BY e.rowid DESC LIMIT 1) AS q ' +
    'FROM claims c LEFT JOIN users u ON u.id = c.owner_id ORDER BY c.claim_ref ASC', params);
}
export function listEstimatesStageQualifyingExpenditurePenceByAssessmentIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.stage AS stage, (SELECT e.qualifying_expenditure_pence FROM estimates e WHERE e.assessment_id = c.assessment_id ' +
    'ORDER BY e.rowid DESC LIMIT 1) AS q FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ?', params);
}

// inbound_email
export function listInboundEmailIdReceivedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.id, e.received_at, e.from_address, e.subject, e.text_body, e.message_id, e.matched_outbox_id, e.claim_id, c.full_name AS contact, m.created_at AS read_at ' +
    'FROM inbound_email e LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id LEFT JOIN contacts c ON c.id = e.contact_id ' +
    'LEFT JOIN client_messages m ON m.id = COALESCE(e.client_message_id, g.client_message_id) ' +
    'WHERE COALESCE(e.business_id, g.business_id) = ? ORDER BY e.received_at, e.id', params);
}
export function listInboundEmailUidAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.mailbox_uid AS uid, e.received_at AS at, e.from_address, e.subject, e.outcome, e.queue_reason, e.matched_outbox_id AS matched, ' +
    'ob.name AS ours_company, COALESCE(fb.name, gb.name) AS filed_on, u.display_name AS by, g.rule, fb.name AS direct ' +
    'FROM inbound_email e LEFT JOIN outbox o ON o.id = e.matched_outbox_id LEFT JOIN businesses ob ON ob.id = o.business_id ' +
    'LEFT JOIN businesses fb ON fb.id = e.business_id LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id ' +
    'LEFT JOIN businesses gb ON gb.id = g.business_id LEFT JOIN users u ON u.id = g.filed_by ' +
    'ORDER BY CAST(e.mailbox_uid AS INTEGER) DESC LIMIT 12', params);
}

// internal_notes
export function listInternalNotesIdAuthorIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT n.id, n.author_id, n.created_at, n.body, u.display_name AS who, c.claim_ref, cp.label AS claim_property, p.label AS property_label ' +
    'FROM internal_notes n LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id ' +
    'LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id ' +
    'WHERE n.business_id = ? ORDER BY n.created_at ASC, n.rowid ASC', params);
}

// introducer_reward_setting
export function getIntroducerRewardSettingModelFeePenceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT s.model, s.fee_pence, s.percent_bp, s.changed_at, u.display_name AS who FROM introducer_reward_setting s ' +
    'LEFT JOIN users u ON u.id = s.changed_by WHERE s.id = 1', params);
}

// introducer_share_consents
export function getIntroducerShareConsentsIdDecisionByIntroducerIdLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT s.id, s.decision, s.wording_version, s.recorded_at, u.display_name AS who FROM introducer_share_consents s ' +
    'LEFT JOIN users u ON u.id = s.recorded_by WHERE s.introducer_id = ? AND (s.lead_id = ? OR s.business_id = ? ' +
    'OR s.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?)) ORDER BY s.rowid DESC LIMIT 1', params);
}

// invoice_credit_notes
export function getInvoiceCreditNotesIdInvoiceIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, invoice_id, basis, amount_pence FROM invoice_credit_notes WHERE id = ?', params);
}
export function getInvoiceCreditNotesNByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT SUM(amount_pence) AS n FROM invoice_credit_notes WHERE invoice_id = ?', params);
}
export function listInvoiceCreditNotesRecordedAtBasisByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.recorded_at, c.basis, n.seq, u.display_name AS who FROM invoice_credit_notes c LEFT JOIN invoice_numbers n ON n.credit_note_id = c.id ' +
    'LEFT JOIN users u ON u.id = c.recorded_by WHERE c.invoice_id = ? ORDER BY c.recorded_at', params);
}

// invoice_payments
export function getInvoicePaymentsNByInvoiceIdVoidedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT SUM(amount_pence) AS n FROM invoice_payments WHERE invoice_id = ? AND voided_at IS NULL', params);
}
export function listInvoicePaymentsRecordedAtVoidedAtByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT p.recorded_at, p.voided_at, u.display_name AS who, v.display_name AS voider FROM invoice_payments p ' +
    'LEFT JOIN users u ON u.id = p.recorded_by LEFT JOIN users v ON v.id = p.voided_by WHERE p.invoice_id = ? ORDER BY p.recorded_at', params);
}

// invoices
export function getInvoicesCountByClaimIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
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
export function listInvoicesCreatedAtInvoiceStatusByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT created_at, invoice_status, payment_status FROM invoices WHERE business_id = ? AND claim_id IS NULL ORDER BY created_at', params);
}
export function listInvoicesIdFeeByClaimIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.fee_pence AS fee FROM invoices i WHERE i.claim_id IN ' +
    "(SELECT l.claim_id FROM leads l WHERE l.introducer_id = ? AND l.claim_id IS NOT NULL) AND i.invoice_status IN ('RAISED','SENT')", params);
}
export function listInvoicesIdKindByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.kind, i.created_at, i.cancelled_at, n.seq, u.display_name AS raiser, x.display_name AS canceller FROM invoices i ' +
    "LEFT JOIN invoice_numbers n ON n.invoice_id = i.id AND n.kind = 'INVOICE' LEFT JOIN users u ON u.id = i.raised_by " +
    'LEFT JOIN users x ON x.id = i.cancelled_by WHERE i.claim_id = ? ORDER BY i.created_at', params);
}

// leads
export function getLeadsCountByIdShownLowPence<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM leads l JOIN assessments a ON a.id = l.assessment_id ' +
    'WHERE l.id = ? AND (a.shown_low_pence IS NOT NULL OR a.shown_high_pence IS NOT NULL)', params);
}
export function getLeadsCOUNTByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT (SELECT COUNT(*) FROM leads WHERE introducer_id = ?) AS referred, ' +
    '(SELECT COUNT(*) FROM leads WHERE introducer_id = ? AND claim_id IS NOT NULL) AS opened, ' +
    "(SELECT COUNT(*) FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ? AND c.stage = 'CLOSED') AS won, " +
    "(SELECT COUNT(*) FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.introducer_id = ? AND c.stage = 'REASONED_NEGATIVE') AS negatives", params);
}
export function getLeadsIntroducerIdBusinessIdByClaimIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.introducer_id, c.business_id FROM leads l JOIN claims c ON c.id = l.claim_id WHERE l.claim_id = ? AND l.introducer_id IS NOT NULL', params);
}
export function insertLeadsByBusinessIdId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
    'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
    'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
    'SELECT ?, b.id, a.id, k.id, cl.id, ' +
    "CASE WHEN a.id IS NOT NULL THEN 'ASSESSMENT' WHEN k.entry_point = 'gated_exit' THEN 'GATED_EXIT' " +
    "WHEN k.id IS NOT NULL THEN 'BOOKING' ELSE 'STAFF' END, " +
    "COALESCE(b.source, CASE WHEN a.id IS NOT NULL THEN 'WEBSITE' ELSE 'OTHER' END), NULL, NULL, NULL, " +
    'COALESCE((SELECT MIN(x.submitted_at) FROM assessments x WHERE x.business_id = b.id), k.created_at, b.created_at), ' +
    "b.owner_id, NULL, NULL, NULL, CASE WHEN cl.id IS NOT NULL THEN 'CONVERTED' ELSE 'NEW' END, NULL, NULL, " +
    'cl.created_at, b.created_at, b.created_at ' +
    'FROM businesses b ' +
    'LEFT JOIN assessments a ON a.id = (SELECT x.id FROM assessments x WHERE x.business_id = b.id ' +
    'ORDER BY x.submitted_at DESC, x.id DESC LIMIT 1) ' +
    'LEFT JOIN bookings k ON k.id = (SELECT y.id FROM bookings y WHERE y.business_id = b.id ' +
    'ORDER BY y.created_at ASC, y.id ASC LIMIT 1) ' +
    'LEFT JOIN claims cl ON cl.id = COALESCE(' +
    '(SELECT z.id FROM claims z WHERE z.business_id = b.id AND z.assessment_id = a.id ORDER BY z.created_at, z.id LIMIT 1), ' +
    '(SELECT z.id FROM claims z WHERE z.business_id = b.id ORDER BY z.created_at, z.id LIMIT 1)) ' +
    'WHERE b.id = ?', params);
}
export function listLeadsIdBusinessIdByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, COALESCE(b.name, l.prospect_organisation) AS organisation, l.lead_date, l.status, l.claim_id, ' +
    'c.claim_ref, c.stage FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN claims c ON c.id = l.claim_id ' +
    'WHERE l.introducer_id = ? ORDER BY l.lead_date DESC, l.id ASC', params);
}

// outbox
export function getOutboxXByKindLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT 1 AS x FROM outbox o WHERE o.kind IN ('FREE_TYPED','TEMPLATE') AND (o.lead_id = ? OR o.business_id = (SELECT business_id FROM leads WHERE id = ?)) LIMIT 1", params);
}
export function listOutboxAtToEmailByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT o.created_at AS at, o.to_email, b.name AS company, o.subject, o.sent_at, o.send_requested, o.last_error, o.provider_ref FROM outbox o LEFT JOIN businesses b ON b.id = o.business_id " +
    "WHERE o.kind IN ('FREE_TYPED','TEMPLATE','NOTIFICATION') ORDER BY o.created_at DESC LIMIT 8", params);
}
export function listOutboxIdCreatedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.id, o.created_at, o.to_email, o.subject, o.body, o.sent_at, o.send_requested, o.last_error, o.kind, o.provider_ref, o.thread_key, o.claim_id, ' +
    'u.display_name AS writer FROM outbox o LEFT JOIN users u ON u.id = o.written_by WHERE o.business_id = ? ORDER BY o.created_at, o.id', params);
}
export function listOutboxIdCreatedAtByLeadIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.id, o.created_at, o.to_email, o.subject, o.body, o.sent_at, o.send_requested, o.last_error, o.kind, o.provider_ref, o.thread_key, o.claim_id, ' +
    'u.display_name AS writer FROM outbox o LEFT JOIN users u ON u.id = o.written_by WHERE o.lead_id = ? AND o.business_id IS NULL ORDER BY o.created_at, o.id', params);
}

// reason_lists
export function getReasonListsCodeLabelByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT code, label, active FROM reason_lists WHERE list = 'CLAIM_EXIT' AND code = ?", params);
}
export function getReasonListsLabelByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT label FROM reason_lists WHERE list = ? AND code = ?', params);
}
export function listReasonListsCodeLabelByList<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT code, label, active FROM reason_lists WHERE list = ? ORDER BY ord ASC, code ASC', params);
}

// research_runs
export function listResearchRunsAtKindByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.at, r.kind, r.considered, r.fired, r.not_permitted, r.failed, u.display_name AS who FROM research_runs r ' +
    'LEFT JOIN users u ON u.id = r.actor_id WHERE r.business_id = ? ORDER BY r.at', params);
}

// staff_tasks
export function getStaffTasksIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT t.id, t.business_id, t.property_id, t.claim_id, t.lead_id, t.owner_id, t.activity_type, c.claim_ref ' +
    'FROM staff_tasks t LEFT JOIN claims c ON c.id = t.claim_id WHERE t.id = ?', params);
}
export function getStaffTasksIdTitleByClaimIdIsNextAction<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT t.id, t.title, t.owner_id, t.owner_role, u.display_name AS owner_name, t.due_on FROM staff_tasks t ' +
    "LEFT JOIN users u ON u.id = t.owner_id WHERE t.claim_id = ? AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')", params);
}
export function listStaffTasksIdTitleByIntroducerIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.description, t.activity_type, t.status, t.due_on, t.completed_at, t.cancelled_at, t.owner_id, ' +
    't.owner_role, o.display_name AS owner, cu.display_name AS completer, c.full_name AS person FROM staff_tasks t ' +
    'LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cu ON cu.id = t.completed_by LEFT JOIN contacts c ON c.id = t.contact_id ' +
    "WHERE t.introducer_id = ? ORDER BY t.status IN ('COMPLETED','CANCELLED'), t.due_on IS NULL, t.due_on ASC, " +
    't.completed_at DESC, t.created_at DESC', params);
}

// survey_pack_approvals
export function getSurveyPackApprovalsSnapshotJsonVersionByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.snapshot_json, a.version FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function getSurveyPackApprovalsVersionApprovedAtByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.version, a.approved_at, u.display_name AS name FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN surveyor_jobs j ON j.id = p.job_id LEFT JOIN users u ON u.id = a.approved_by WHERE j.claim_id = ? ' +
    'ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}

// survey_walkthroughs
export function getSurveyWalkthroughsXByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM survey_walkthroughs WHERE booking_id = ?', params);
}

// surveyor_commitments
export function getSurveyorCommitmentsCommittedAtByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT sc.committed_at FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
    'WHERE j.claim_id = ? ORDER BY sc.committed_at ASC LIMIT 1', params);
}
export function getSurveyorCommitmentsNByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS n FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id WHERE j.assessment_id = ? LIMIT 1', params);
}
export function listSurveyorCommitmentsCommittedAtJobIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT sc.committed_at, sc.job_id, u.display_name AS who FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
    'LEFT JOIN users u ON u.id = sc.surveyor_id WHERE j.claim_id = ? ORDER BY sc.committed_at', params);
}

// surveyor_jobs
export function getSurveyorJobsSurveyorIdByBusinessIdSurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL ' +
    'ORDER BY created_at DESC LIMIT 1', params);
}
export function listSurveyorJobsIdBusinessIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, business_id, surveyor_id FROM surveyor_jobs WHERE claim_id = ?', params);
}
export function listSurveyorJobsIdBusinessIdBySurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT j.id, j.business_id, j.surveyor_id, j.state, cl.id AS claim_id, cl.claim_ref, cl.stage FROM surveyor_jobs j ' +
    'LEFT JOIN claims cl ON cl.id = j.claim_id WHERE j.surveyor_id = ? ORDER BY j.created_at ASC, j.id ASC', params);
}
export function listSurveyorJobsSurveyorIdByBusinessIdSurveyorId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', params);
}
export function listSurveyorJobsSurveyorIdByClaimIdSurveyorId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE claim_id = ? AND surveyor_id IS NOT NULL', params);
}
export function updateSurveyorJobsClaimIdByBusinessIdAssessmentId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE surveyor_jobs SET claim_id = ? WHERE business_id = ? AND assessment_id = ? AND claim_id IS NULL', params);
}

// video_meetings
export function getVideoMeetingsHostOpenedAtOpenerByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT v.host_opened_at, u.display_name AS opener, 1 AS meeting FROM video_meetings v LEFT JOIN users u ON u.id = v.host_opened_by WHERE v.booking_id = ? ORDER BY v.created_at DESC LIMIT 1', params);
}

// vocabularies
export function getVocabulariesCountByListCode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM vocabularies WHERE list = 'ACTIVITY_TYPE' AND code = ?", params);
}

// whatsapp_import_lines
export function getWhatsappImportLinesImportIdUploadedAtByMessageId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.import_id, i.uploaded_at, u.display_name AS by FROM whatsapp_import_lines l JOIN whatsapp_imports i ON i.id = l.import_id ' +
    'JOIN users u ON u.id = i.uploaded_by WHERE l.message_id = ?', params);
}

// whatsapp_imports
export function listWhatsappImportsIdContactByBusinessIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, c.full_name AS contact, i.status, i.uploaded_at, u.display_name AS by, i.added FROM whatsapp_imports i ' +
    'JOIN contacts c ON c.id = i.contact_id JOIN users u ON u.id = i.uploaded_by WHERE i.business_id = ? AND i.status <> ? ORDER BY i.uploaded_at DESC, i.id', params);
}

// whatsapp_messages
export function listWhatsappMessagesCreatedAtDirectionByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT w.created_at, w.direction, w.body, w.status, w.error, c.full_name AS contact, u.display_name AS writer, w.phone FROM whatsapp_messages w ' +
    'LEFT JOIN contacts c ON c.id = w.contact_id LEFT JOIN users u ON u.id = w.written_by WHERE w.business_id = ? ORDER BY w.created_at', params);
}
export function listWhatsappMessagesIdCreatedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT w.id, w.created_at, w.direction, w.body, w.status, w.error, w.contact_id, c.full_name AS contact, u.display_name AS writer, w.phone, l.sender FROM whatsapp_messages w ' +
    'LEFT JOIN contacts c ON c.id = w.contact_id LEFT JOIN users u ON u.id = w.written_by LEFT JOIN whatsapp_import_lines l ON l.message_id = w.id ' +
    'WHERE w.business_id = ? ORDER BY w.created_at, w.id', params);
}
export function listWhatsappMessagesIdCreatedAtByBusinessIdPhone<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT w.id, w.created_at, w.direction, w.body, w.status, w.error, c.full_name AS contact, u.display_name AS writer, l.sender FROM whatsapp_messages w ' +
    'LEFT JOIN contacts c ON c.id = w.contact_id LEFT JOIN users u ON u.id = w.written_by LEFT JOIN whatsapp_import_lines l ON l.message_id = w.id ' +
    'WHERE w.business_id = ? AND w.phone = ? ORDER BY w.created_at, w.id', params);
}

// businesses
export function getBusinessesIdNameById5<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT b.id, b.name, b.sector, b.stage, b.created_at, b.legal_name, b.company_number, b.claimant_type, b.registered_address, b.trading_address, b.website, b.client_status, b.source, b.owner_id, b.updated_at, u.display_name AS owner_name FROM businesses b LEFT JOIN users u ON u.id = b.owner_id WHERE b.id = ?', params);
}
export function listBusinessesIdName5<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT b.id, b.name, b.sector, b.stage, b.created_at, b.legal_name, b.company_number, b.claimant_type, b.registered_address, b.trading_address, b.website, b.client_status, b.source, b.owner_id, b.updated_at, u.display_name AS owner_name FROM businesses b LEFT JOIN users u ON u.id = b.owner_id ORDER BY b.name ASC LIMIT ?', params);
}

// claims
// A property recorded as "Company — main site" is named "main site" here, where the company is the frame.
export function getClaimsIdClaimRefById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.id, c.claim_ref, c.business_id, CASE WHEN p.label LIKE b.name || \' — %\' THEN substr(p.label, length(b.name) + 4) ELSE p.label END AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ?', params);
}
export function listClaimsIdClaimRefByBusinessId4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, CASE WHEN p.label LIKE b.name || \' — %\' THEN substr(p.label, length(b.name) + 4) ELSE p.label END AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY c.claim_ref', params);
}
export function listClaimsIdClaimRefByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, CASE WHEN p.label LIKE b.name || \' — %\' THEN substr(p.label, length(b.name) + 4) ELSE p.label END AS property_label FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.property_id = ? ORDER BY c.claim_ref', params);
}

// client_messages
export function getClientMessagesIdBusinessIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT m.id, m.business_id, m.claim_id, m.direction, m.source, m.author_id, m.created_at, m.body, u.display_name AS author, u.role AS author_role, ct.full_name AS contact, c.claim_ref, p.label AS claim_property FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id LEFT JOIN properties p ON p.id = c.property_id WHERE m.id = ? AND m.business_id = ?', params);
}
export function listClientMessagesIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.id, m.business_id, m.claim_id, m.direction, m.source, m.author_id, m.created_at, m.body, u.display_name AS author, u.role AS author_role, ct.full_name AS contact, c.claim_ref, p.label AS claim_property FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id LEFT JOIN properties p ON p.id = c.property_id WHERE m.business_id = ? ORDER BY m.created_at ASC, m.rowid ASC', params);
}

// enquiry_checks
export function listEnquiryChecksSeqCheckKeyByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.rowid AS seq, e.check_key, e.answer, e.note, e.recorded_at, u.display_name AS recorder FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.claim_id = ?', params);
}
export function listEnquiryChecksSeqCheckKeyByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.rowid AS seq, e.check_key, e.answer, e.note, e.recorded_at, u.display_name AS recorder FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.lead_id = ?', params);
}

// introducer_fees
export function getIntroducerFeesIdIntroducerIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT f.id, f.introducer_id, i.firm_name, f.claim_id, c.claim_ref, f.business_id, f.amount_pence, f.disclosure_given_at, du.display_name AS discloser, f.state, f.paid_at, pu.display_name AS payer FROM introducer_fees f JOIN introducers i ON i.id = f.introducer_id JOIN claims c ON c.id = f.claim_id LEFT JOIN users du ON du.id = f.disclosure_recorded_by LEFT JOIN users pu ON pu.id = f.paid_recorded_by WHERE f.id = ?', params);
}
export function listIntroducerFeesIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT f.id, f.introducer_id, i.firm_name, f.claim_id, c.claim_ref, f.business_id, f.amount_pence, f.disclosure_given_at, du.display_name AS discloser, f.state, f.paid_at, pu.display_name AS payer FROM introducer_fees f JOIN introducers i ON i.id = f.introducer_id JOIN claims c ON c.id = f.claim_id LEFT JOIN users du ON du.id = f.disclosure_recorded_by LEFT JOIN users pu ON pu.id = f.paid_recorded_by ORDER BY f.created_at DESC, f.id ASC', params);
}
export function listIntroducerFeesIdIntroducerIdByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT f.id, f.introducer_id, i.firm_name, f.claim_id, c.claim_ref, f.business_id, f.amount_pence, f.disclosure_given_at, du.display_name AS discloser, f.state, f.paid_at, pu.display_name AS payer FROM introducer_fees f JOIN introducers i ON i.id = f.introducer_id JOIN claims c ON c.id = f.claim_id LEFT JOIN users du ON du.id = f.disclosure_recorded_by LEFT JOIN users pu ON pu.id = f.paid_recorded_by WHERE f.introducer_id = ? ORDER BY f.created_at DESC, f.id ASC', params);
}

// introducers
export function getIntroducersIdFirmNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT i.id, i.firm_name, i.introducer_type, i.owner_id, i.relationship_started_on, i.notice_contact_id, i.notes, i.created_via, i.created_at, i.updated_at, u.display_name AS owner_name, i.merged_into_id, m.firm_name AS merged_into_name, i.merged_at FROM introducers i LEFT JOIN users u ON u.id = i.owner_id LEFT JOIN introducers m ON m.id = i.merged_into_id WHERE i.id = ?', params);
}
export function getIntroducersIdTitleByIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.id = ?', params);
}
export function listIntroducersIdFirmName2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.firm_name, i.introducer_type, i.owner_id, i.relationship_started_on, i.notice_contact_id, i.notes, i.created_via, i.created_at, i.updated_at, u.display_name AS owner_name, i.merged_into_id, m.firm_name AS merged_into_name, i.merged_at FROM introducers i LEFT JOIN users u ON u.id = i.owner_id LEFT JOIN introducers m ON m.id = i.merged_into_id ORDER BY i.firm_name ASC, i.id ASC LIMIT ?', params);
}
export function listIntroducersIdTitleByIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.claim_id = ? ORDER BY CASE WHEN t.status IN (\'OPEN\',\'IN_PROGRESS\') THEN 0 ELSE 1 END, t.due_on IS NULL, t.due_on ASC, t.created_at DESC', params);
}
export function listIntroducersIdTitleByIdJO2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.status IN (\'OPEN\',\'IN_PROGRESS\') AND (t.owner_id = ? OR (t.owner_id IS NULL AND t.owner_role = ?)) ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC', params);
}
export function listIntroducersIdTitleByIdJO3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.status IN (\'OPEN\',\'IN_PROGRESS\') AND t.due_on IS NOT NULL AND t.due_on <= ? ORDER BY t.due_on ASC, t.created_at ASC LIMIT ?', params);
}
export function listIntroducersIdTitleByIdJO4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, t.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, t.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, o.display_name AS owner_name, cb.display_name AS created_by_name, co.display_name AS completed_by_name, ca.display_name AS cancelled_by_name, c.claim_ref, b.name AS business_name, COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, p.label AS property_label, ar.label AS rule_label, (SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t LEFT JOIN users o ON o.id = t.owner_id LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by LEFT JOIN claims c ON c.id = t.claim_id LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN properties p ON p.id = t.property_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id WHERE t.status IN (\'OPEN\',\'IN_PROGRESS\') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC LIMIT ?', params);
}

// outbox
export function listOutboxCreatedAtKindByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.created_at, o.kind, o.subject, o.sent_at, c.claim_ref, u.display_name AS who, ct.full_name AS to_name FROM outbox o LEFT JOIN claims c ON c.id = o.claim_id LEFT JOIN users u ON u.id = o.written_by LEFT JOIN contacts ct ON ct.id = o.contact_id WHERE o.business_id = ? ORDER BY o.created_at', params);
}
export function listOutboxCreatedAtKindByLeadIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.created_at, o.kind, o.subject, o.sent_at, c.claim_ref, u.display_name AS who, ct.full_name AS to_name FROM outbox o LEFT JOIN claims c ON c.id = o.claim_id LEFT JOIN users u ON u.id = o.written_by LEFT JOIN contacts ct ON ct.id = o.contact_id WHERE o.lead_id = ? AND o.business_id IS NULL ORDER BY o.created_at', params);
}

// properties
export function getPropertiesIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT p.id, p.business_id, p.label, p.postcode, p.created_at, p.address_line_1, p.address_line_2, p.town, p.jurisdiction, p.property_type, p.property_use, p.tenure, p.occupier, p.acquisition_date, p.acquisition_price_pence, p.completion_date, p.disposal_date, p.previous_owner, p.construction_notes, p.existing_ca_claimed, p.prior_claim_notes, p.updated_at, p.sale_in_prospect, p.claimant_role, p.lease_end_date, p.landlord, b.name AS business_name FROM properties p JOIN businesses b ON b.id = p.business_id WHERE p.id = ?', params);
}
export function listPropertiesIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT p.id, p.business_id, p.label, p.postcode, p.created_at, p.address_line_1, p.address_line_2, p.town, p.jurisdiction, p.property_type, p.property_use, p.tenure, p.occupier, p.acquisition_date, p.acquisition_price_pence, p.completion_date, p.disposal_date, p.previous_owner, p.construction_notes, p.existing_ca_claimed, p.prior_claim_notes, p.updated_at, p.sale_in_prospect, p.claimant_role, p.lease_end_date, p.landlord, b.name AS business_name FROM properties p JOIN businesses b ON b.id = p.business_id ORDER BY b.name ASC, p.label ASC LIMIT ?', params);
}
export function listPropertiesIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT p.id, p.business_id, p.label, p.postcode, p.created_at, p.address_line_1, p.address_line_2, p.town, p.jurisdiction, p.property_type, p.property_use, p.tenure, p.occupier, p.acquisition_date, p.acquisition_price_pence, p.completion_date, p.disposal_date, p.previous_owner, p.construction_notes, p.existing_ca_claimed, p.prior_claim_notes, p.updated_at, p.sale_in_prospect, p.claimant_role, p.lease_end_date, p.landlord, b.name AS business_name FROM properties p JOIN businesses b ON b.id = p.business_id WHERE p.business_id = ? ORDER BY p.created_at ASC, p.id ASC', params);
}

// staff_tasks
// CRM 9 of 10: a lead's next action is its earliest open task — migration 018 retired the free text.
export function getStaffTasksIdBusinessIdByLeadIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.id, l.business_id, l.assessment_id, l.booking_id, l.claim_id, l.origin, l.source, l.introducer_id, l.prospect_postcode, l.prospect_event, l.prospect_event_year, l.prospect_organisation, l.prospect_sector, l.lead_date, l.owner_id, l.priority, (SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN (\'OPEN\',\'IN_PROGRESS\') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN (\'OPEN\',\'IN_PROGRESS\') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, l.status, l.lost_reason, l.lost_note, l.converted_at, l.created_at, l.updated_at, b.name AS business_name, b.sector AS business_sector, u.display_name AS owner_name, c.claim_ref AS claim_ref FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN claims c ON c.id = l.claim_id WHERE l.id = ?', params);
}
// CRM 3 of 10: a claim's next action is its flagged open staff task (migration 012). The retired columns are never read.
export function getStaffTasksIdClaimRefByClaimIdIsNextAction<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.id = ?', params);
}
export function listStaffTasksIdBusinessIdByLeadIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.assessment_id, l.booking_id, l.claim_id, l.origin, l.source, l.introducer_id, l.prospect_postcode, l.prospect_event, l.prospect_event_year, l.prospect_organisation, l.prospect_sector, l.lead_date, l.owner_id, l.priority, (SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN (\'OPEN\',\'IN_PROGRESS\') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN (\'OPEN\',\'IN_PROGRESS\') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, l.status, l.lost_reason, l.lost_note, l.converted_at, l.created_at, l.updated_at, b.name AS business_name, b.sector AS business_sector, u.display_name AS owner_name, c.claim_ref AS claim_ref FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN users u ON u.id = l.owner_id LEFT JOIN claims c ON c.id = l.claim_id ORDER BY l.lead_date DESC, l.id ASC LIMIT ?', params);
}
export function listStaffTasksIdClaimRefByClaimIdIsNextAction<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id ORDER BY c.claim_ref ASC LIMIT ?', params);
}
export function listStaffTasksIdClaimRefByClaimIdIsNextAction2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id ORDER BY c.claim_ref DESC LIMIT ?', params);
}
export function listStaffTasksIdClaimRefByClaimIdIsNextAction3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.business_id = ? ORDER BY c.claim_ref ASC', params);
}
export function listStaffTasksIdClaimRefByClaimIdIsNextAction4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.claim_ref, c.business_id, c.property_id, c.assessment_id, c.workstream, c.stage, c.owner_id, c.surveyor_id, c.priority, (SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action, (SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN (\'OPEN\',\'IN_PROGRESS\')) AS next_action_due, c.hold_reason, c.lost_reason, c.expected_completion, c.created_at, c.updated_at, c.hold_return_stage, c.tax_adviser_signoff_at, b.name AS business_name, o.display_name AS owner_name, s.display_name AS surveyor_name, p.label AS property_label, p.town AS property_town FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users o ON o.id = c.owner_id LEFT JOIN users s ON s.id = c.surveyor_id LEFT JOIN properties p ON p.id = c.property_id WHERE c.property_id = ? ORDER BY c.claim_ref ASC', params);
}

// client_message_files
export function listClientMessageFilesCreatedAtDirectionByMessageIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.created_at, m.direction, m.source, u.display_name AS who, ct.full_name AS contact, c.claim_ref, (SELECT COUNT(*) FROM client_message_files f WHERE f.message_id = m.id) AS files FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id WHERE m.business_id = ? AND (m.claim_id = ? OR m.claim_id IS NULL) ORDER BY m.created_at', params);
}
export function listClientMessageFilesCreatedAtDirectionByMessageIdJO2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.created_at, m.direction, m.source, u.display_name AS who, ct.full_name AS contact, c.claim_ref, (SELECT COUNT(*) FROM client_message_files f WHERE f.message_id = m.id) AS files FROM client_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN contacts ct ON ct.id = m.contact_id LEFT JOIN claims c ON c.id = m.claim_id WHERE m.business_id = ? ORDER BY m.created_at', params);
}

// internal_notes
export function listInternalNotesCreatedAtBodyByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT n.created_at, n.body, u.display_name AS who, c.claim_ref, CASE WHEN cp.label LIKE nb.name || \' — %\' THEN substr(cp.label, length(nb.name) + 4) ELSE cp.label END AS claim_property, p.label AS property_label FROM internal_notes n JOIN businesses nb ON nb.id = n.business_id LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id WHERE n.business_id = ? ORDER BY n.created_at DESC', params);
}
export function listInternalNotesCreatedAtBodyByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT n.created_at, n.body, u.display_name AS who, c.claim_ref, CASE WHEN cp.label LIKE nb.name || \' — %\' THEN substr(cp.label, length(nb.name) + 4) ELSE cp.label END AS claim_property, p.label AS property_label FROM internal_notes n JOIN businesses nb ON nb.id = n.business_id LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id WHERE n.business_id = ? AND (n.claim_id = ? OR (n.claim_id IS NULL AND n.property_id IS NULL)) ORDER BY n.created_at DESC', params);
}
export function listInternalNotesCreatedAtBodyByPropertyIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT n.created_at, n.body, u.display_name AS who, c.claim_ref, CASE WHEN cp.label LIKE nb.name || \' — %\' THEN substr(cp.label, length(nb.name) + 4) ELSE cp.label END AS claim_property, p.label AS property_label FROM internal_notes n JOIN businesses nb ON nb.id = n.business_id LEFT JOIN users u ON u.id = n.author_id LEFT JOIN claims c ON c.id = n.claim_id LEFT JOIN properties cp ON cp.id = c.property_id LEFT JOIN properties p ON p.id = n.property_id WHERE n.property_id = ? OR n.claim_id IN (SELECT x.id FROM claims x WHERE x.property_id = ?) ORDER BY n.created_at DESC', params);
}

// introducer_percentage_entries
export function listIntroducerPercentageEntriesIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.id, e.introducer_id, i.firm_name, e.claim_id, c.claim_ref, e.business_id, e.entry_kind, e.basis_pence, e.percent_bp, e.amount_pence, e.created_at FROM introducer_percentage_entries e JOIN introducers i ON i.id = e.introducer_id JOIN claims c ON c.id = e.claim_id ORDER BY e.created_at DESC, e.rowid DESC', params);
}
export function listIntroducerPercentageEntriesIdIntroducerIdByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.id, e.introducer_id, i.firm_name, e.claim_id, c.claim_ref, e.business_id, e.entry_kind, e.basis_pence, e.percent_bp, e.amount_pence, e.created_at FROM introducer_percentage_entries e JOIN introducers i ON i.id = e.introducer_id JOIN claims c ON c.id = e.claim_id WHERE e.introducer_id = ? ORDER BY e.created_at DESC, e.rowid DESC', params);
}

// staff_tasks
export function listStaffTasksIdTitleByBusinessIdLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by WHERE t.business_id = ? OR t.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?) ORDER BY t.created_at', params);
}
export function listStaffTasksIdTitleByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by WHERE t.claim_id = ? ORDER BY t.created_at', params);
}
export function listStaffTasksIdTitleByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by WHERE t.lead_id = ? ORDER BY t.created_at', params);
}
export function listStaffTasksIdTitleByPropertyIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, t.completed_at, t.cancelled_at, t.cancel_reason, cb.display_name AS created_by, co.display_name AS completed_by, ca.display_name AS cancelled_by FROM staff_tasks t LEFT JOIN users cb ON cb.id = t.created_by LEFT JOIN users co ON co.id = t.completed_by LEFT JOIN users ca ON ca.id = t.cancelled_by WHERE t.property_id = ? OR t.claim_id IN (SELECT c.id FROM claims c WHERE c.property_id = ?) ORDER BY t.created_at', params);
}
