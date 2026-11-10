/**
 * COMPLIANCE'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: identity checks, data protection, the breach log, retention and complaints. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
// This module's permissions are registered whenever its data is, so every path into the module can ask them.
import './actions.ts';

// aml_firm_risk_assessments
export function getAmlFirmRiskAssessmentsAssessedOnDocumentRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT assessed_on, document_ref, covers, contingent_fee_named FROM aml_firm_risk_assessments ORDER BY assessed_on DESC, rowid DESC LIMIT 1', params);
}
export function insertAmlFirmRiskAssessments(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO aml_firm_risk_assessments (id, assessed_on, document_ref, covers, contingent_fee_named, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}

// aml_officers
export function getAmlOfficersAppointedOnEndedOnById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT appointed_on, ended_on FROM aml_officers WHERE id = ?', params);
}
// The officers' register, each with the user who holds the office (that user's name is the core's: src/modules/compliance/compliance-aml.ts)
export function listAmlOfficersIdOfficeUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.id, o.office, o.user_id, o.appointed_on, o.ended_on, o.source FROM aml_officers o ORDER BY o.appointed_on DESC', params);
}
export function insertAmlOfficers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO aml_officers (id, office, user_id, appointed_on, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateAmlOfficersEndedOnById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE aml_officers SET ended_on = ? WHERE id = ?', params);
}

// breach_awareness_corrections
export function insertBreachAwarenessCorrections(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO breach_awareness_corrections (id, incident_id, corrected_to, reason, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listBreachAwarenessCorrectionsCorrectedToReasonByIncidentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT corrected_to, reason, recorded_at FROM breach_awareness_corrections WHERE incident_id = ? ORDER BY rowid', params);
}

// breach_decisions
export function getBreachDecisionsByIncidentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM breach_decisions WHERE incident_id = ?', params);
}
export function insertBreachDecisions(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO breach_decisions (art33_decision, art33_reasoning, notified_at, notified_recipient, delay_reasons, art34_decision, art34_reasoning, ' +
    'communicated_at, communicated_route, fact_device_encrypted, fact_backup_restored, fact_recipient_confirmed_deletion, fact_route_to_individual, ' +
    'decided_by, decided_at, deputy_route_used, dpo_contact_attempts, countersigned_by, id, incident_id, recorded_by, created_at, updated_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateBreachDecisionsArt33DecisionArt33ReasoningById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE breach_decisions SET art33_decision = ?, art33_reasoning = ?, notified_at = ?, notified_recipient = ?, delay_reasons = ?, art34_decision = ?, ' +
    'art34_reasoning = ?, communicated_at = ?, communicated_route = ?, fact_device_encrypted = ?, fact_backup_restored = ?, ' +
    'fact_recipient_confirmed_deletion = ?, fact_route_to_individual = ?, decided_by = ?, decided_at = ?, deputy_route_used = ?, ' +
    'dpo_contact_attempts = ?, countersigned_by = ?, updated_at = ? WHERE id = ?', params);
}

// breach_incidents
export function getBreachIncidentsAnnexRefById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT annex_ref FROM breach_incidents WHERE id = ?', params);
}
export function getBreachIncidentsById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM breach_incidents WHERE id = ?', params);
}
export function getBreachIncidentsCountByAnnexRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM breach_incidents WHERE annex_ref IS NOT NULL", params);
}
export function getBreachIncidentsExistsByAnnexRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 FROM breach_incidents WHERE annex_ref = ?', params);
}
export function insertBreachIncidents(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO breach_incidents (id, incident_ref, kind, business_id, claim_id, fraud_attempted_on, discovered_at, discovered_by, discovery_route, ' +
    'awareness_at, awareness_basis, occurred_state, occurred_at, occurred_basis, description, status, recorded_by, created_at, updated_at) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)", params);
}
export function listBreachIncidents<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT * FROM breach_incidents ORDER BY awareness_at DESC LIMIT 500', params);
}
export function updateBreachIncidentsAnnexRefUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE breach_incidents SET annex_ref = ?, updated_at = ? WHERE id = ?', params);
}
export function updateBreachIncidentsDescriptionSubjectCategoriesAndNumberBy(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE breach_incidents SET description = ?, subject_categories_and_number = ?, record_categories_and_number = ?, special_category_present = ?, ' +
    'likely_consequences = ?, remedial_action = ?, mitigating_action = ?, processor_involved = ?, lessons_and_changes = ?, occurred_basis = ?, ' +
    'classification_reason = ?, is_personal_data_breach = ?, annex_ref = ?, updated_at = ? WHERE id = ?', params);
}
export function updateBreachIncidentsStatusClosedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE breach_incidents SET status = 'CLOSED', closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ?", params);
}
export function updateBreachIncidentsStatusUpdatedAtByIdStatus(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE breach_incidents SET status = 'NOTIFICATION_DECIDED', updated_at = ? WHERE id = ? AND status = 'OPEN'", params);
}

// breach_names
export function insertBreachNames(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO breach_names (id, annex_ref, incident_id, name, how_involved, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listBreachNamesAnnexRefNameByIncidentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT annex_ref, name, how_involved, note, recorded_at FROM breach_names WHERE incident_id = ? ORDER BY recorded_at, rowid', params);
}

// breach_names_deputies
export function getBreachNamesDeputiesUserIdSource<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT user_id, source, named_at FROM breach_names_deputies ORDER BY named_at DESC, rowid DESC LIMIT 1', params);
}
export function insertBreachNamesDeputies(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO breach_names_deputies (id, user_id, source, named_by, named_at) VALUES (?, ?, ?, ?, ?)', params);
}

// breach_notification_phases
export function getBreachNotificationPhasesCOALESCEMAXPhaseNoNByIncidentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COALESCE(MAX(phase_no), 0) + 1 AS n FROM breach_notification_phases WHERE incident_id = ?', params);
}
export function getBreachNotificationPhasesCountByIncidentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM breach_notification_phases WHERE incident_id = ?', params);
}
export function insertBreachNotificationPhases(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO breach_notification_phases (id, incident_id, phase_no, sent_at, what_was_sent, outstanding, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listBreachNotificationPhasesPhaseNoSentAtByIncidentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT phase_no, sent_at, what_was_sent, outstanding FROM breach_notification_phases WHERE incident_id = ? ORDER BY phase_no', params);
}

// breach_other_notifications
export function getBreachOtherNotificationsIdByIncidentIdRecipientKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM breach_other_notifications WHERE incident_id = ? AND recipient_kind = ?', params);
}
export function insertBreachOtherNotifications(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO breach_other_notifications (id, incident_id, recipient_kind, position, told_at, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertBreachOtherNotifications2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO breach_other_notifications (id, incident_id, recipient_kind, position, told_at, note, recorded_by, recorded_at) VALUES (?, ?, 'INSURER', 'NO_POLICY_IN_FORCE', NULL, ?, ?, ?)", params);
}
export function listBreachOtherNotificationsRecipientKindPositionByIncidentI<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT recipient_kind, position, told_at, note FROM breach_other_notifications WHERE incident_id = ? ORDER BY recipient_kind', params);
}
export function updateBreachOtherNotificationsPositionToldAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE breach_other_notifications SET position = ?, told_at = ?, note = ?, recorded_by = ?, recorded_at = ? WHERE id = ?', params);
}

// cdd_beneficial_owners
export function getCddBeneficialOwnersCountByCheckId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM cdd_beneficial_owners WHERE check_id = ?', params);
}
export function insertCddBeneficialOwners(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO cdd_beneficial_owners (id, check_id, contact_id, basis_of_control, identified_from, evidence_document_id, psc_decision_id, verified_how, recorded_by, recorded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// cdd_checks
export function getCddChecksCompletedAtByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT completed_at FROM cdd_checks WHERE business_id = ? AND state = 'COMPLETE' ORDER BY completed_at DESC LIMIT 1", params);
}
export function getCddChecksIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, claim_id, claimant_type, claimant_type_note, identified, verification_method, register_ref, evidence_document_id, beneficial_ownership, authority_basis, authority_contact_id, authority_evidence, entity_status, sanctions_screen, sanctions_screened_on, risk_rating, risk_level, risk_rating_basis, checked_on, checked_by, state, completed_at, withdrawn_reason, created_at, updated_at FROM cdd_checks WHERE id = ?', params);
}
export function getCddChecksIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM cdd_checks WHERE id = ? AND business_id = ?', params);
}
export function getCddChecksStateByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT state FROM cdd_checks WHERE id = ? AND business_id = ?', params);
}
export function getCddChecksStateVerificationMethodById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT state, verification_method FROM cdd_checks WHERE id = ?', params);
}
export function insertCddChecks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO cdd_checks (id, business_id, claim_id, claimant_type, claimant_type_note, state, created_by, created_at, updated_at) ' +
    "VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)", params);
}
export function updateCddChecksIdentifiedVerificationMethodById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE cdd_checks SET identified = ?, verification_method = ?, register_ref = ?, evidence_document_id = ?, beneficial_ownership = ?, ' +
    'authority_basis = ?, authority_contact_id = ?, authority_evidence = ?, entity_status = ?, sanctions_screen = ?, sanctions_screened_on = ?, ' +
    'risk_rating = ?, risk_level = ?, risk_rating_basis = ?, checked_on = ?, checked_by = ?, updated_at = ? WHERE id = ?', params);
}
export function updateCddChecksStateCompletedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE cdd_checks SET state = 'COMPLETE', completed_at = ?, updated_at = ? WHERE id = ?", params);
}
export function updateCddChecksStateWithdrawnReasonById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE cdd_checks SET state = 'WITHDRAWN', withdrawn_reason = ?, updated_at = ? WHERE id = ?", params);
}
export function updateCddChecksVerificationMethodUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE cdd_checks SET verification_method = ?, updated_at = ? WHERE id = ?', params);
}

// cdd_monitoring_notes
export function insertCddMonitoringNotes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO cdd_monitoring_notes (id, business_id, check_id, noted_on, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listCddMonitoringNotesNotedOnNoteByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT noted_on, note FROM cdd_monitoring_notes WHERE business_id = ? ORDER BY noted_on DESC', params);
}

// cdd_psc_decisions
export function getCddPscDecisionsIdByCheckIdDecision<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM cdd_psc_decisions WHERE check_id = ? AND decision = 'RELIED_ON_FOR_BENEFICIAL_OWNERSHIP' ORDER BY rowid DESC LIMIT 1", params);
}
export function insertCddPscDecisions(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO cdd_psc_decisions (id, check_id, research_source_id, pull_retrieved_at, decision, reasoning, decided_on, decided_by, recorded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listCddPscDecisionsIdDecisionByCheckId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, decision, reasoning, decided_on, pull_retrieved_at FROM cdd_psc_decisions WHERE check_id = ? ORDER BY rowid', params);
}

// complaint_progress_updates
export function insertComplaintProgressUpdates(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO complaint_progress_updates (id, complaint_id, told_on, said, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listComplaintProgressUpdatesToldOnByComplaintId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT told_on FROM complaint_progress_updates WHERE complaint_id = ?', params);
}
export function listComplaintProgressUpdatesToldOnSaidByComplaintId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT told_on, said FROM complaint_progress_updates WHERE complaint_id = ? ORDER BY told_on', params);
}

// complaints
export function getComplaintsById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM complaints WHERE id = ?', params);
}
export function getComplaintsRefReceivedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT complaint_ref AS ref, received_at, business_id FROM complaints WHERE id = ?', params);
}
export function insertComplaints(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO complaints (id, complaint_ref, received_at, received_via, received_via_detail, forwarded_at, forwarded_by, complainant_as_described, ' +
    'complaint_verbatim, business_id, claim_id, contact_id, is_164a, classification_reason, classified_at, classified_by, status, recorded_by, created_at, updated_at) ' +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)", params);
}
export function listComplaints<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT * FROM complaints ORDER BY received_at DESC LIMIT 500', params);
}
export function listComplaintsIdComplaintRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, complaint_ref FROM complaints WHERE lower(COALESCE(complainant_as_described, '')) LIKE ? ESCAPE '\\' OR lower(complaint_verbatim) LIKE ? ESCAPE '\\' LIMIT 100", params);
}
export function listComplaintsIdRefByPersonRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, complaint_ref AS ref FROM complaints WHERE person_ref = ?', params);
}
export function listComplaintsReceivedAtIs164a<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT received_at, is_164a FROM complaints', params);
}
export function updateComplaintsAllegedInfringementInfringementMappingById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE complaints SET alleged_infringement = ?, infringement_mapping = ?, acknowledged_route = ?, enquiries_made = ?, out_of_scope_route = ?, ' +
    'outcome_reasoning = ?, undue_delay_assessment = ?, decided_by = ?, decided_by_reason = ?, countersigned_by = ?, countersigner_view = ?, ' +
    'lessons_and_changes = ?, acknowledged_at = ?, outcome_notified_at = ?, limb = ?, outcome = ?, status = ?, updated_at = ? WHERE id = ?', params);
}
export function updateComplaintsIs164aClassificationReasonById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE complaints SET is_164a = ?, classification_reason = ?, classified_at = ?, classified_by = ?, updated_at = ? WHERE id = ?', params);
}
export function updateComplaintsStatusOnwardRouteGivenById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE complaints SET status = 'CLOSED', onward_route_given = ?, closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ?", params);
}

// compliance_links
export function insertComplianceLinks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO compliance_links (id, from_kind, from_id, to_kind, to_id, linked_by, linked_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listComplianceLinksKIByFromKindFromId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT to_kind AS k, to_id AS i FROM compliance_links WHERE from_kind = ? AND from_id = ? ' +
    'UNION SELECT from_kind AS k, from_id AS i FROM compliance_links WHERE to_kind = ? AND to_id = ?', params);
}

// compliance_ref_series
export function getComplianceRefSeriesLastNByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT last_n FROM compliance_ref_series WHERE kind = ?', params);
}
export function updateComplianceRefSeriesLastNByKind(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE compliance_ref_series SET last_n = last_n + 1 WHERE kind = ?', params);
}

// compliance_settings
export function getComplianceSettingsValueEffectiveFromBySettingEffectiveFro<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT value, effective_from, source FROM compliance_settings WHERE setting = ? AND effective_from <= ? ' +
    'ORDER BY effective_from DESC, rowid DESC LIMIT 1', params);
}
export function insertComplianceSettings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO compliance_settings (id, setting, value, effective_from, source, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}

// disclosure_log
export function getDisclosureLogBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id FROM disclosure_log WHERE id = ?', params);
}
// One client's disclosures, each with who recorded it (that user's name is the core's: src/modules/compliance/disclosure-log.ts)
export function listDisclosureLogIdRecipientRecordedByByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT d.id, d.recipient, d.data_categories, d.occasion, d.route, d.lawful_basis, d.disclosed_at, d.corrects_id, d.recorded_by ' +
    'FROM disclosure_log d WHERE d.business_id = ? ORDER BY d.disclosed_at ASC, d.recorded_at ASC', params);
}
export function insertDisclosureLog(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO disclosure_log (id, business_id, claim_id, recipient, recipient_contact_id, recipient_user_id, data_categories, occasion, route, ' +
    'lawful_basis, disclosed_at, recorded_by, recorded_at, corrects_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// identity_check_results
export function getIdentityCheckResultsOutcomeReceivedAtByIdentityCheckId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT outcome, received_at FROM identity_check_results WHERE identity_check_id = ? ORDER BY received_at DESC, rowid DESC LIMIT 1', params);
}
export function insertIdentityCheckResults(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO identity_check_results (id, identity_check_id, outcome, provider_status, decided_at, received_at, body_sha256, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// identity_checks
export function getIdentityChecksIdBusinessIdBySessionId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, cdd_check_id FROM identity_checks WHERE session_id = ?', params);
}
export function getIdentityChecksIdBySessionId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM identity_checks WHERE session_id = ?', params);
}
export function insertIdentityChecks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO identity_checks (id, business_id, contact_id, cdd_check_id, provider, session_id, link, sent_by, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// identity_persons
// One person named on a document, with the document version it points at (that document is the claims module's: readPerson)
export function getIdentityPersonsPersonRefNameByPersonRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT p.person_ref, p.name, p.role, p.contact_route, p.contact_route_kind, p.doc_id, p.notice_template, p.notice_route, p.notice_sent_on, p.notice_published_too, ' +
    'p.exemption_article, p.exemption_reason, p.source_record_ref FROM identity_persons p WHERE p.person_ref = ?', params);
}
export function getIdentityPersonsPersonRefNoticeTemplateByPersonRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT person_ref, notice_template, exemption_article FROM identity_persons WHERE person_ref = ?', params);
}
export function insertIdentityPersons(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO identity_persons (person_ref, name, role, contact_route, contact_route_kind, doc_id, source_record_ref, recorded_by, recorded_at, updated_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listIdentityPersonsPersonRefRole<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT person_ref, role, doc_id FROM identity_persons WHERE lower(name) LIKE ? ESCAPE '\\' ORDER BY recorded_at LIMIT 100", params);
}
export function updateIdentityPersonsExemptionArticleExemptionReasonByPerson(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE identity_persons SET exemption_article = ?, exemption_reason = ?, exemption_recorded_by = ?, exemption_recorded_at = ?, updated_at = ? WHERE person_ref = ?', params);
}
export function updateIdentityPersonsNoticeTemplateNoticeRouteByPersonRef(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE identity_persons SET notice_template = ?, notice_route = ?, notice_sent_on = ?, notice_published_too = ?, updated_at = ? WHERE person_ref = ?', params);
}

// identity_search_log
export function insertIdentitySearchLog(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO identity_search_log (id, term, result_count, searched_by, searched_at) VALUES (?, ?, ?, ?, ?)', params);
}

// legal_approvals
export function getLegalApprovalsCountByPageVersion<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM legal_approvals WHERE page = ? AND version = ? AND approver_role = ?', params);
}
export function insertLegalApprovals(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO legal_approvals (id, page, version, approved_by, approver_role, approved_on, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listLegalApprovalsPageVersion<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT page, version, approved_by, approver_role, approved_on FROM legal_approvals', params);
}

// legal_holds
export function getLegalHoldsLiftedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT lifted_at FROM legal_holds WHERE id = ?', params);
}
export function insertLegalHolds(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO legal_holds (id, hold_kind, record_kind, record_id, reason_kind, rights_request_id, complaint_id, incident_id, reason, review_on, set_by, set_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listLegalHoldsIdHoldKindByRecordKindRecordId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, hold_kind, record_kind, record_id, reason_kind, reason, review_on, set_at, lifted_at, lift_reason, rights_request_id, complaint_id, incident_id FROM legal_holds WHERE record_kind = ? AND record_id = ? ORDER BY set_at', params);
}
export function listLegalHoldsRecordIdByRecordKindLiftedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT record_id FROM legal_holds WHERE record_kind = ? AND lifted_at IS NULL AND hold_kind = 'LEGAL_HOLD'", params);
}
export function updateLegalHoldsLiftedAtLiftedByById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE legal_holds SET lifted_at = ?, lifted_by = ?, lift_reason = ? WHERE id = ?', params);
}

// rights_request_limbs
export function getRightsRequestLimbsIdRequestIdByRequestIdLimb<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, request_id, limb, clarification_requested_at, clarification_received_at, extension_notified_at, extension_ground, extension_reasons, decision, decision_reasoning, undue_delay_assessment FROM rights_request_limbs WHERE request_id = ? AND limb = ?', params);
}
export function insertRightsRequestLimbs(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO rights_request_limbs (id, request_id, limb, clarification_requested_at, clarification_received_at, extension_notified_at, extension_ground, ' +
    'extension_reasons, decision, decision_reasoning, undue_delay_assessment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertRightsRequestLimbs2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO rights_request_limbs (id, request_id, limb, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', params);
}
export function listRightsRequestLimbsIdRequestIdByRequestId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, request_id, limb, clarification_requested_at, clarification_received_at, extension_notified_at, extension_ground, extension_reasons, decision, decision_reasoning, undue_delay_assessment FROM rights_request_limbs WHERE request_id = ?', params);
}
export function listRightsRequestLimbsIdRequestIdByRequestId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, request_id, limb, clarification_requested_at, clarification_received_at, extension_notified_at, extension_ground, extension_reasons, decision, decision_reasoning, undue_delay_assessment FROM rights_request_limbs WHERE request_id = ? ORDER BY limb', params);
}
export function updateRightsRequestLimbsClarificationRequestedAtClarificatio(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE rights_request_limbs SET clarification_requested_at = ?, clarification_received_at = ?, extension_notified_at = ?, extension_ground = ?, ' +
    'extension_reasons = ?, decision = ?, decision_reasoning = ?, undue_delay_assessment = ?, updated_at = ? WHERE id = ?', params);
}

// rights_requests
export function getRightsRequestsById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM rights_requests WHERE id = ?', params);
}
export function insertRightsRequests(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO rights_requests (id, request_ref, received_at, received_via, received_via_detail, forwarded_at, forwarded_by, requester_as_described, ' +
    "request_verbatim, contact_id, lead_id, classification_alternatives, status, recorded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)", params);
}
export function listRightsRequests<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT * FROM rights_requests ORDER BY received_at DESC LIMIT 500', params);
}
export function listRightsRequestsIdRefByPersonRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, request_ref AS ref FROM rights_requests WHERE person_ref = ?', params);
}
export function listRightsRequestsIdRequestRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, request_ref FROM rights_requests WHERE lower(COALESCE(requester_as_described, '')) LIKE ? ESCAPE '\\' OR lower(request_verbatim) LIKE ? ESCAPE '\\' LIMIT 100", params);
}
export function updateRightsRequestsRequesterAsDescribedClassificationAltern(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE rights_requests SET requester_as_described = ?, classification_alternatives = ?, identity_standard_applied = ?, authority_grantor = ?, ' +
    'clarification = ?, search_scope = ?, records_found = ?, response_route = ?, outcome = ?, received_via_detail = ?, forwarded_by = ?, ' +
    'forwarded_at = ?, id_requested_at = ?, id_received_at = ?, fee_charged_at = ?, fee_paid_at = ?, restriction_applied_at = ?, responded_at = ?, ' +
    'identity_status = ?, identity_route = ?, identity_outcome = ?, identity_evidence = ?, fee_status = ?, search_done_on = ?, status = ?, updated_at = ? WHERE id = ?', params);
}
export function updateRightsRequestsStatusResponseContentCheckById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE rights_requests SET status = 'CLOSED', response_content_check = ?, closed_at = ?, closed_by = ?, updated_at = ? WHERE id = ?", params);
}

// terms_agreements
export function getTermsAgreementsCountByUserIdPortalTermsVersion<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM terms_agreements WHERE user_id = ? AND portal_terms_version = ? AND website_terms_version = ? AND privacy_version = ?', params);
}
export function insertTermsAgreements(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO terms_agreements (id, user_id, agreed_at, portal_terms_version, website_terms_version, privacy_version) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// Moved here from other areas' borrowed files: their statements are on this module's tables.
export function getComplaintFormsIdReceivedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, received_at, name, reply_to, on_behalf, authority_detail, matching_info, complaint_verbatim, remedy_sought, rights, logged_complaint_id FROM complaint_forms WHERE id = ?', params);
}
export function getSignatoryChecksCountByBusinessIdSource<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM signatory_checks WHERE business_id = ? AND source = ? AND checked_at >= ?', params);
}
export function getSignatoryChecksResultReasonByBusinessIdSource<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT result, reason, checked_at FROM signatory_checks WHERE business_id = ? AND source = ? ORDER BY checked_at DESC, rowid DESC LIMIT 1', params);
}
export function insertComplaintForms(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO complaint_forms (id, received_at, name, reply_to, on_behalf, authority_detail, matching_info, about, complaint_verbatim, remedy_sought, rights) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertDeletionLog(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, ' +
    'executed_at, stores_json, backups_pending, backup_cycle_days, backup_copies_expire_at, verified_by, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)', params);
}
export function insertDeletionLog2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO deletion_log (deletion_ref, record_kind, record_id, category, basis_rule, basis_due_on, approved_by, review_ref, executed_by, ' +
    'executed_at, stores_json, backups_pending, backup_cycle_days, backup_copies_expire_at, verified_by, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)', params);
}
export function insertSignatoryChecks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO signatory_checks (id, business_id, engagement_id, source, result, reason, checked_at, checked_by) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listComplaintFormsIdReceivedAtByLoggedComplaintId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, received_at, name, reply_to, complaint_verbatim FROM complaint_forms WHERE logged_complaint_id IS NULL ORDER BY received_at', params);
}
export function listSignatoryChecksSourceByEngagementIdResult<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT DISTINCT source FROM signatory_checks WHERE engagement_id = ? AND result IN ('YES','NO')", params);
}
export function updateComplaintFormsLoggedComplaintIdLoggedAtByIdLoggedCompl(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE complaint_forms SET logged_complaint_id = ?, logged_at = ?, logged_by = ? WHERE id = ? AND logged_complaint_id IS NULL', params);
}

// Statements a caller chose between by a key: the choice moved here with the text, each statement unchanged.
// legal_holds: a hold's register entry, by the column that points at it (rights request, complaint or breach entry)
export function getHoldEntryId<T extends Row = Row>(db: Db, column: 'rights_request_id' | 'complaint_id' | 'incident_id', params: readonly Param[] = []): T | undefined {
  const sql = column === 'rights_request_id' ? 'SELECT id FROM rights_requests WHERE id = ?'
    : column === 'complaint_id' ? 'SELECT id FROM complaints WHERE id = ?'
      : 'SELECT id FROM breach_incidents WHERE id = ?';
  return db.get<T>(sql, params);
}
export function listLegalHoldsForEntry<T extends Row = Row>(db: Db, column: 'rights_request_id' | 'complaint_id' | 'incident_id', params: readonly Param[] = []): T[] {
  const sql = column === 'rights_request_id' ? 'SELECT id, hold_kind, record_kind, record_id, reason_kind, reason, review_on, set_at, lifted_at, lift_reason, rights_request_id, complaint_id, incident_id FROM legal_holds WHERE rights_request_id = ? ORDER BY set_at'
    : column === 'complaint_id' ? 'SELECT id, hold_kind, record_kind, record_id, reason_kind, reason, review_on, set_at, lifted_at, lift_reason, rights_request_id, complaint_id, incident_id FROM legal_holds WHERE complaint_id = ? ORDER BY set_at'
      : 'SELECT id, hold_kind, record_kind, record_id, reason_kind, reason, review_on, set_at, lifted_at, lift_reason, rights_request_id, complaint_id, incident_id FROM legal_holds WHERE incident_id = ? ORDER BY set_at';
  return db.all<T>(sql, params);
}
// a cross-reference's other end: its reference, by the kind of entry (an unknown kind reads nothing)
export function getLinkedEntryRef<T extends Row = Row>(db: Db, kind: string, params: readonly Param[] = []): T | undefined {
  const sql = kind === 'RIGHTS_REQUEST' ? 'SELECT request_ref AS ref FROM rights_requests WHERE id = ?'
    : kind === 'COMPLAINT' ? 'SELECT complaint_ref AS ref FROM complaints WHERE id = ?'
      : kind === 'BREACH' ? 'SELECT incident_ref AS ref FROM breach_incidents WHERE id = ?' : null;
  return sql === null ? undefined : db.get<T>(sql, params);
}

// identity_persons, identity_search_log: the identity store's shape in counts, by which count is asked (text unchanged)
export type IdentityCount = 'people' | 'route_a' | 'route_b' | 'notices' | 'exemptions' | 'searches';
const IDENTITY_COUNTS: Readonly<Record<IdentityCount, string>> = Object.freeze({
  people: 'SELECT COUNT(*) AS n FROM identity_persons',
  route_a: 'SELECT COUNT(*) AS n FROM identity_persons WHERE contact_route IS NOT NULL',
  route_b: 'SELECT COUNT(*) AS n FROM identity_persons WHERE contact_route IS NULL',
  notices: 'SELECT COUNT(*) AS n FROM identity_persons WHERE notice_route IS NOT NULL',
  exemptions: 'SELECT COUNT(*) AS n FROM identity_persons WHERE exemption_article IS NOT NULL',
  searches: 'SELECT COUNT(*) AS n FROM identity_search_log',
});
export function getIdentityCount<T extends Row = Row>(db: Db, which: IdentityCount, params: readonly Param[] = []): T | undefined {
  return db.get<T>(IDENTITY_COUNTS[which], params);
}

// The retention list's record kinds on this module's tables (compliance-identity.ts RECORD_KINDS): each kind's count, and the
// rows with the moment its clock starts where the determination gives one this build records; text unchanged. The other
// kinds' counts are their owners' (compliance-identity.ts says whose); a kind not here reads nothing.
const RECORD_KIND_STATEMENTS: Readonly<Record<string, { count: string; clockRows: string | null }>> = Object.freeze({
  RIGHTS_REQUESTS: { count: 'SELECT COUNT(*) AS n FROM rights_requests', clockRows: null },
  COMPLAINTS: { count: 'SELECT COUNT(*) AS n FROM complaints', clockRows: 'SELECT id, outcome_notified_at AS starts FROM complaints' },
  BREACH_INCIDENTS: { count: 'SELECT COUNT(*) AS n FROM breach_incidents', clockRows: 'SELECT id, closed_at AS starts FROM breach_incidents' },
  IDENTITY_PERSON: { count: 'SELECT COUNT(*) AS n FROM identity_persons', clockRows: null },
  IDENTITY_SEARCH_LOG: { count: 'SELECT COUNT(*) AS n FROM identity_search_log', clockRows: null },
  DELETION_LOG: { count: 'SELECT COUNT(*) AS n FROM deletion_log', clockRows: null },
  CDD_RECORDS: { count: 'SELECT COUNT(*) AS n FROM cdd_checks', clockRows: null },
});
export function countRecordKind<T extends Row = Row>(db: Db, kind: string, params: readonly Param[] = []): T | undefined {
  const s = RECORD_KIND_STATEMENTS[kind];
  return s === undefined ? undefined : db.get<T>(s.count, params);
}
export function recordKindHasClock(kind: string): boolean {
  return (RECORD_KIND_STATEMENTS[kind]?.clockRows ?? null) !== null;
}
export function listRecordKindClockRows<T extends Row = Row>(db: Db, kind: string, params: readonly Param[] = []): T[] {
  const sql = RECORD_KIND_STATEMENTS[kind]?.clockRows ?? null;
  return sql === null ? [] : db.all<T>(sql, params);
}

// sqlite_master: the trigger that blocks deleting from a table, if there is one (the retention list says so)
export function getSqliteMasterNameByTblName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND upper(sql) LIKE '%BEFORE DELETE%'", params);
}
