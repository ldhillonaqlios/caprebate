/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE CRM (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// assessments
export function getAssessmentsIdLeadIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.id, l.id AS lead_id, l.status AS lead_status FROM assessments a LEFT JOIN leads l ON l.assessment_id = a.id ' +
    'WHERE a.business_id = ? ORDER BY a.submitted_at DESC, a.id DESC LIMIT 1', params);
}

// audit_log

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

// claim_milestones

// claim_stage_moves

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

// document_links
export function listDocumentLinksLogicalDocumentIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.logical_document_id, l.business_id, t.readers, t.carries_value, t.label, l.seq, k.claim_id, c.claim_ref, p.label AS property_label, ' +
    'k.linked_at, k.unlinked_at, lb.display_name AS linked_by, ub.display_name AS unlinked_by FROM document_links k ' +
    'JOIN logical_documents l ON l.id = k.logical_document_id JOIN document_types t ON t.code = l.type_code ' +
    'LEFT JOIN claims c ON c.id = k.claim_id LEFT JOIN properties p ON p.id = k.property_id ' +
    'LEFT JOIN users lb ON lb.id = k.linked_by LEFT JOIN users ub ON ub.id = k.unlinked_by WHERE l.business_id = ? ORDER BY k.linked_at', params);
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

// enquiry_checks
export function listEnquiryChecksRecordedAtCheckKeyByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.recorded_at, e.check_key, e.answer, u.display_name AS who FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.claim_id = ? ORDER BY e.recorded_at', params);
}
export function listEnquiryChecksRecordedAtCheckKeyByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.recorded_at, e.check_key, e.answer, u.display_name AS who FROM enquiry_checks e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.lead_id = ? ORDER BY e.recorded_at', params);
}

// estimates

// inbound_email

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

// research_runs

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

// video_meetings

// whatsapp_import_lines

// whatsapp_imports

// whatsapp_messages

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

// survey_walkthroughs: kept here, not in the survey module's data file, because the survey's front door loads files
// that load the CRM's door, so reading it through that door from video-calls.ts loops while the CRM loads (161l;
// tried again in 161l1: "Cannot access 'SAME_TIME_WORDS' before initialization", test/core/load-alone.test.ts).
export function getSurveyWalkthroughsXByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM survey_walkthroughs WHERE booking_id = ?', params);
}
export function getAssessmentsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.id, a.business_id, b.name AS business_name, a.sector, a.submitted_at, ' +
    'a.shown_low_pence, a.shown_high_pence ' +
    'FROM assessments a JOIN businesses b ON b.id = a.business_id WHERE a.id = ?', params);
}
export function listAssessmentsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.id, a.business_id, b.name AS business_name, a.sector, a.submitted_at, ' +
    'a.shown_low_pence, a.shown_high_pence ' +
    'FROM assessments a JOIN businesses b ON b.id = a.business_id ' +
    'ORDER BY a.submitted_at DESC, a.id DESC LIMIT ?', params);
}
export function listBookingChangesFromStartsAtToStartsAtByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.from_starts_at, c.to_starts_at, u.display_name AS changed_by_name, c.at, c.cancelled ' +
    'FROM booking_changes c LEFT JOIN users u ON u.id = c.changed_by ' +
    'WHERE c.booking_id = ? ORDER BY c.at ASC', params);
}
export function listUsersIdDisplayNameByDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT u.id, u.display_name FROM users u JOIN working_times w ON w.user_id = u.id ' +
    'WHERE u.disabled_at IS NULL ORDER BY u.display_name ASC', params);
}

// bookings (the calendar, src/modules/crm/assessments-and-calendar.ts): the statement, moved with its note
/*
 * LEFT JOINS, AND THAT IS PART OF THE GATED-EXIT REPAIR. This was an inner join
 * onto `businesses`, so a booking with no organisation — a call asked for at the
 * reasoned negative (migration 011) — would have been recorded and then vanished
 * from the calendar's queue, invisible to the people who have to make the call.
 */
const BOOKING_SELECT =
  'SELECT k.id, k.business_id, k.lead_id, COALESCE(b.name, l.prospect_organisation) AS business_name, k.channel, ' +
  'k.sms_variant, k.entry_point, k.starts_at, k.ends_at, k.assigned_to, u.display_name AS assigned_name, ' +
  'k.created_at, k.cancelled_at, cu.display_name AS cancelled_by_name, cu.role AS cancelled_by_role ' +
  'FROM bookings k LEFT JOIN businesses b ON b.id = k.business_id ' +
  'LEFT JOIN leads l ON l.id = k.lead_id LEFT JOIN users u ON u.id = k.assigned_to ' +
  'LEFT JOIN users cu ON cu.id = k.cancelled_by ';
export function listBookingsScheduled<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(
    BOOKING_SELECT + 'WHERE k.starts_at IS NOT NULL AND k.starts_at >= ? AND k.starts_at < ? ' +
      'ORDER BY k.starts_at ASC',
    params,
  );
}
export function listBookingsWithNoTime<T extends Row = Row>(db: Db): T[] {
  return db.all<T>(BOOKING_SELECT + 'WHERE k.starts_at IS NULL AND k.cancelled_at IS NULL ORDER BY k.created_at ASC');
}
export function listBookingsCancelled<T extends Row = Row>(db: Db): T[] {
  return db.all<T>(BOOKING_SELECT + 'WHERE k.cancelled_at IS NOT NULL ORDER BY k.cancelled_at DESC LIMIT 100');
}
export function getBookingById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(BOOKING_SELECT + 'WHERE k.id = ?', params);
}

// search (the global search, src/modules/crm/search.ts): the fixed statements, moved with their notes
const ORGANISATIONS_ALL =
  'SELECT b.id, b.name, b.legal_name, b.sector FROM businesses b ' +
  "WHERE lower(b.name) LIKE ? ESCAPE '\\' OR lower(COALESCE(b.legal_name, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(b.company_number, '')) LIKE ? ESCAPE '\\' ORDER BY b.name ASC, b.id ASC LIMIT 25";

const PROSPECTS_ALL =
  'SELECT l.id, l.prospect_organisation FROM leads l ' +
  "WHERE l.business_id IS NULL AND lower(COALESCE(l.prospect_organisation, '')) LIKE ? ESCAPE '\\' " +
  'ORDER BY l.lead_date DESC, l.id ASC LIMIT 25';

/** The client's own contacts, and a prospect's — never a person at an introducing firm. */
const CONTACTS_ALL =
  'SELECT c.id, c.full_name, c.business_id, c.lead_id, b.name AS business_name FROM contacts c ' +
  'LEFT JOIN businesses b ON b.id = c.business_id WHERE c.introducer_id IS NULL ' +
  "AND (lower(c.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.email, '')) LIKE ? ESCAPE '\\') " +
  'ORDER BY c.full_name ASC, c.id ASC LIMIT 25';

const PROPERTIES_ALL =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.town, b.name AS business_name FROM properties p ' +
  'JOIN businesses b ON b.id = p.business_id ' +
  "WHERE lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' " +
  "OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\' ORDER BY p.label ASC, p.id ASC LIMIT 25";

const PROPERTIES_ASSIGNED =
  'SELECT p.id, p.business_id, p.label, p.postcode, p.town, b.name AS business_name FROM properties p ' +
  'JOIN businesses b ON b.id = p.business_id ' +
  // The surveyor's companies (from the survey's jobs, src/modules/crm/search.ts), as a list of ids (Phase 161l1).
  'WHERE p.business_id IN (SELECT value FROM json_each(?)) ' +
  "AND (lower(p.label) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.address_line_1, '')) LIKE ? ESCAPE '\\' " +
  "OR lower(COALESCE(p.address_line_2, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.town, '')) LIKE ? ESCAPE '\\' " +
  "OR replace(lower(COALESCE(p.postcode, '')), ' ', '') LIKE ? ESCAPE '\\') ORDER BY p.label ASC, p.id ASC LIMIT 25";

// A claim is found by its reference AND by its company's name, and is named by its company and property.
const CLAIMS_ALL =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, p.label AS property_label FROM claims c ' +
  'JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id ' +
  "WHERE lower(c.claim_ref) LIKE ? ESCAPE '\\' OR lower(b.name) LIKE ? ESCAPE '\\' ORDER BY b.name ASC, c.claim_ref DESC LIMIT 25";

const CLAIMS_ASSIGNED =
  'SELECT c.id, c.claim_ref, c.business_id, c.stage, b.name AS business_name, p.label AS property_label FROM claims c ' +
  'JOIN businesses b ON b.id = c.business_id LEFT JOIN properties p ON p.id = c.property_id ' +
  // The surveyor's claims (from the survey's jobs, src/modules/crm/search.ts), as a list of ids (Phase 161l1).
  'WHERE c.id IN (SELECT value FROM json_each(?)) ' +
  "AND (lower(c.claim_ref) LIKE ? ESCAPE '\\' OR lower(b.name) LIKE ? ESCAPE '\\') ORDER BY b.name ASC, c.claim_ref DESC LIMIT 25";

const NOTES_ALL =
  'SELECT n.id, n.business_id, n.claim_id, n.property_id, substr(n.body, 1, 160) AS snippet, b.name AS business_name ' +
  'FROM internal_notes n JOIN businesses b ON b.id = n.business_id ' +
  "WHERE lower(n.body) LIKE ? ESCAPE '\\' ORDER BY n.created_at DESC, n.id ASC LIMIT 25";
export function searchOrganisations<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(ORGANISATIONS_ALL, params);
}
export function searchProspects<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROSPECTS_ALL, params);
}
export function searchContacts<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CONTACTS_ALL, params);
}
export function searchProperties<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROPERTIES_ALL, params);
}
export function searchPropertiesOfBusinesses<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROPERTIES_ASSIGNED, params);
}
export function searchClaims<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIMS_ALL, params);
}
export function searchClaimsOfIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CLAIMS_ASSIGNED, params);
}
export function searchNotes<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(NOTES_ALL, params);
}

/**
 * EVERY STATEMENT SEARCH CAN RUN, exported so test/core/global-search.test.ts can assert that none of them names the identity
 * store, a compliance register, a document's content or the estimate. The prose at the top of this file names those
 * tables on purpose, so the test reads these and not the source text.
 */
export const SEARCH_STATEMENTS: readonly string[] = Object.freeze([
  ORGANISATIONS_ALL, PROSPECTS_ALL, CONTACTS_ALL, PROPERTIES_ALL, PROPERTIES_ASSIGNED, CLAIMS_ALL, CLAIMS_ASSIGNED, NOTES_ALL,
]);

// the claim and lead lists (src/modules/crm/claim-lists.ts, from src/shared/): the fixed statements, moved with
// their notes. Each joins the claim or the lead to other owners' tables, so it waits here.
/** CLIENT AND REFERENCE — the whole of what ACCOUNTING reads of a claim. No join to anything else. */
const CLAIMS_MONEY =
  'SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, NULL AS sector, NULL AS org_source, NULL AS stage, ' +
  'NULL AS workstream, NULL AS owner_id, NULL AS owner_name, NULL AS priority, NULL AS expected_completion, NULL AS property_label, ' +
  'NULL AS property_type, NULL AS jurisdiction, NULL AS postcode, NULL AS lead_source, NULL AS introducer_id, NULL AS firm_name, ' +
  'NULL AS next_action, NULL AS next_action_due, NULL AS q, NULL AS shown_low_pence, NULL AS shown_high_pence, NULL AS has_estimate ' +
  'FROM claims c JOIN businesses b ON b.id = c.business_id ORDER BY c.claim_ref DESC LIMIT 1000';

/** THE WORKING LINE — no estimate, no assessment, for a reader who may not read the value. */
const CLAIMS_WORKING =
  'SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, b.sector, b.source AS org_source, c.stage, c.workstream, ' +
  'c.owner_id, u.display_name AS owner_name, c.priority, c.expected_completion, p.label AS property_label, p.property_type, ' +
  'p.jurisdiction, p.postcode, l.source AS lead_source, l.introducer_id, i.firm_name, ' +
  "(SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, " +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, " +
  'NULL AS q, NULL AS shown_low_pence, NULL AS shown_high_pence, NULL AS has_estimate ' +
  'FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id ' +
  'LEFT JOIN properties p ON p.id = c.property_id LEFT JOIN leads l ON l.claim_id = c.id LEFT JOIN introducers i ON i.id = l.introducer_id ' +
  'ORDER BY c.claim_ref DESC LIMIT 1000';

/** THE WORKING LINE AND THE VALUE — for a reader `claim.read_value` admits, and still asked per claim. */
const CLAIMS_VALUE =
  'SELECT c.id, c.claim_ref, c.business_id, b.name AS client, c.created_at, b.sector, b.source AS org_source, c.stage, c.workstream, ' +
  'c.owner_id, u.display_name AS owner_name, c.priority, c.expected_completion, p.label AS property_label, p.property_type, ' +
  'p.jurisdiction, p.postcode, l.source AS lead_source, l.introducer_id, i.firm_name, ' +
  "(SELECT t.title FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action, " +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.claim_id = c.id AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')) AS next_action_due, " +
  // q and has_estimate are the assessment's estimate, from the assessment area by value_of (src/modules/crm/claim-lists.ts).
  'NULL AS q, a.shown_low_pence, a.shown_high_pence, NULL AS has_estimate, c.assessment_id AS value_of ' +
  'FROM claims c JOIN businesses b ON b.id = c.business_id LEFT JOIN users u ON u.id = c.owner_id ' +
  'LEFT JOIN properties p ON p.id = c.property_id LEFT JOIN leads l ON l.claim_id = c.id LEFT JOIN introducers i ON i.id = l.introducer_id ' +
  'LEFT JOIN assessments a ON a.id = c.assessment_id ORDER BY c.claim_ref DESC LIMIT 1000';

/** A LEAD'S NEXT ACTION IS ITS EARLIEST OPEN TASK — migration 018 retired the free text. One sort, one source. */
const LEADS_ALL =
  'SELECT l.id, l.business_id, l.assessment_id, l.origin, l.source, l.introducer_id, i.firm_name, l.prospect_organisation, ' +
  'l.prospect_sector, l.lead_date, l.owner_id, u.display_name AS owner_name, l.priority, l.status, l.claim_id, c.claim_ref, ' +
  'b.name AS business_name, b.sector AS business_sector, ' +
  "(SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') " +
  'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, ' +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') " +
  'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, ' +
  'a.shown_low_pence, a.shown_high_pence ' +
  'FROM leads l LEFT JOIN businesses b ON b.id = l.business_id LEFT JOIN users u ON u.id = l.owner_id ' +
  'LEFT JOIN claims c ON c.id = l.claim_id LEFT JOIN introducers i ON i.id = l.introducer_id ' +
  'LEFT JOIN assessments a ON a.id = l.assessment_id ORDER BY l.lead_date DESC, l.id ASC LIMIT 1000';

/** The claim list's rows in the shape its reader may see: the money line, the working line and the value, or the working line. */
export function listClaimsRows<T extends Row = Row>(db: Db, shape: 'MONEY' | 'VALUE' | 'WORKING'): T[] {
  const statement = shape === 'MONEY' ? CLAIMS_MONEY : shape === 'VALUE' ? CLAIMS_VALUE : CLAIMS_WORKING;
  return db.all<T>(statement);
}
export function listLeadsRows<T extends Row = Row>(db: Db): T[] {
  return db.all<T>(LEADS_ALL);
}

// the do-not-contact check (src/modules/crm/do-not-contact.ts): a client login of an organisation marked do not contact;
// from src/integrations/data-borrowed.ts, text unchanged. It joins the core's users to the CRM's businesses.
export function getUsersCountByClientStatusEmailCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM users u JOIN businesses b ON b.id = u.business_id ' +
    "WHERE b.client_status = 'DO_NOT_CONTACT' AND u.email_canonical = lower(?)", params);
}
