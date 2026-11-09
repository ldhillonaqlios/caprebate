/**
 * THE CRM'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: organisations, leads, the pipeline, tasks, messages, the calendar and introducers. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
// This module's permissions are registered whenever its data is, so every path into the module can ask them.
import './actions.ts';

// automation_rules
export function getAutomationRulesCOUNTByActiveTaskPriority<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT (SELECT COUNT(*) FROM automation_rules WHERE active = 1 AND task_priority = ?) + " +
    "(SELECT COUNT(*) FROM staff_tasks WHERE status IN ('OPEN','IN_PROGRESS') AND recurrence IS NOT NULL AND priority = ?) AS n", params);
}
export function getAutomationRulesN<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(ord) AS n FROM automation_rules', params);
}
export function insertAutomationRules(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO automation_rules (id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, ' +
    'task_description, task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord, ' +
    'source, created_at, updated_at, request_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateAutomationRulesLabelTriggerEventById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE automation_rules SET label = ?, trigger_event = ?, trigger_stage = ?, trigger_activity = ?, effect = ?, ' +
    'task_title = ?, task_description = ?, task_activity_type = ?, task_priority = ?, due_in_days = ?, assign_to = ?, ' +
    'assign_role = ?, attach_to = ?, active = ?, request_type = ?, updated_at = ? WHERE id = ?', params);
}

// automation_runs
export function insertAutomationRuns(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO automation_runs (id, rule_id, at, trigger_event, stage, claim_id, lead_id, task_id, business_id, actor_id, ' +
    'outcome, reason, tasks_created, outbox_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// booking_changes
export function getBookingChangesCountByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM booking_changes WHERE booking_id = ?', params);
}
export function insertBookingChanges2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, ' +
    'from_assigned, to_assigned, at, cancelled) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, 1)', params);
}
export function insertBookingChanges3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, ' +
    'from_assigned, to_assigned, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertBookingChanges4(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, ' +
    'from_assigned, to_assigned, at) VALUES (?, ?, ?, ?, NULL, ?, NULL, ?)', params);
}

// bookings
export function getBookingsBusinessIdLeadIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id, lead_id, starts_at, ends_at, channel FROM bookings WHERE id = ?', params);
}
export function getBookingsChannelById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT channel FROM bookings WHERE id = ?', params);
}
export function getBookingsChannelStartsAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT channel, starts_at, cancelled_at FROM bookings WHERE id = ?', params);
}
export function getBookingsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, channel, starts_at, assigned_to, cancelled_at FROM bookings WHERE id = ?', params);
}
export function getBookingsIdByAssignedToCancelledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM bookings WHERE assigned_to = ? AND cancelled_at IS NULL AND starts_at IS NOT NULL AND starts_at < ? AND ends_at > ? LIMIT 1', params);
}
export function getBookingsIdByLeadIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM bookings WHERE lead_id = ? AND business_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', params);
}
export function getBookingsSById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT starts_at AS s FROM bookings WHERE id = ?', params);
}
export function getBookingsStartsAtEndsAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT starts_at, ends_at, channel, cancelled_at FROM bookings WHERE id = ?', params);
}
export function insertBookings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO bookings (id, business_id, assigned_to, channel, sms_variant, entry_point, ' +
    'starts_at, ends_at, created_at) VALUES (?, ?, NULL, ?, ?, ?, NULL, NULL, ?)', params);
}
export function insertBookings2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO bookings (id, business_id, lead_id, assigned_to, channel, sms_variant, entry_point, ' +
    'starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertBookings3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO bookings (id, business_id, lead_id, assigned_to, channel, sms_variant, entry_point, starts_at, ends_at, created_at) VALUES (?, ?, NULL, ?, 'video', NULL, 'staff', ?, ?, ?)", params);
}
export function listBookingsAssignedToStartsAtByStartsAtEndsAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT assigned_to, starts_at, ends_at FROM bookings ' +
    'WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL AND cancelled_at IS NULL AND starts_at < ? AND ends_at > ?', params);
}
export function listBookingsIdAssignedToByStartsAtEndsAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, assigned_to, starts_at, ends_at FROM bookings ' +
    'WHERE starts_at IS NOT NULL AND ends_at IS NOT NULL AND cancelled_at IS NULL AND starts_at < ? AND ends_at > ?', params);
}
export function listBookingsIdBusinessIdByBusinessIdLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.id, k.business_id, k.lead_id, k.channel, k.entry_point, k.created_at FROM bookings k ' +
    'WHERE k.business_id = ? OR k.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?) ORDER BY k.created_at', params);
}
export function listBookingsIdBusinessIdByLeadIdId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT k.id, k.business_id, k.lead_id, k.channel, k.entry_point, k.created_at FROM bookings k ' +
    'WHERE k.lead_id = ? OR k.id = (SELECT l.booking_id FROM leads l WHERE l.id = ?) ORDER BY k.created_at', params);
}
export function listBookingsIdChannelByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, channel, sms_variant, entry_point, starts_at, ends_at, cancelled_at FROM bookings ' +
    'WHERE business_id = ? ORDER BY created_at DESC', params);
}
export function updateBookingsBusinessIdByLeadIdBusinessId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE bookings SET business_id = ? WHERE lead_id = ? AND business_id IS NULL', params);
}
export function updateBookingsCancelledAtCancelledByById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE bookings SET cancelled_at = ?, cancelled_by = ? WHERE id = ?', params);
}
export function updateBookingsStartsAtEndsAtById2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE bookings SET starts_at = ?, ends_at = ?, assigned_to = ? WHERE id = ?', params);
}
export function updateBookingsStartsAtEndsAtById3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE bookings SET starts_at = NULL, ends_at = NULL, assigned_to = NULL WHERE id = ?', params);
}

// businesses
export function getBusinessesClaimantTypeById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT claimant_type FROM businesses WHERE id = ?', params);
}
export function getBusinessesClientStatusById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT client_status FROM businesses WHERE id = ?', params);
}
export function getBusinessesCompanyNumberById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT company_number FROM businesses WHERE id = ?', params);
}
export function getBusinessesContactEmailNameById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT contact_email, name FROM businesses WHERE id = ?', params);
}
export function getBusinessesEById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT contact_email AS e FROM businesses WHERE id = ?', params);
}
export function getBusinessesIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM businesses WHERE id = ?', params);
}
export function getBusinessesIdByRowid<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM businesses WHERE rowid = ?', params);
}
export function getBusinessesIdNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, name FROM businesses WHERE id = ?', params);
}
export function getBusinessesIdNameById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, name, client_status FROM businesses WHERE id = ?', params);
}
export function getBusinessesIdNameById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, name, sector, stage, contact_email, contact_phone, company_number FROM businesses WHERE id = ?', params);
}
export function getBusinessesIdNameById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, name, sector, stage, created_at FROM businesses WHERE id = ?', params);
}
export function getBusinessesIdOwnerIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, owner_id FROM businesses WHERE id = ?', params);
}
export function getBusinessesIdSourceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, source FROM businesses WHERE id = ?', params);
}
export function getBusinessesNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT name FROM businesses WHERE id = ?', params);
}
export function getBusinessesNameCompanyNumberById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT name, company_number FROM businesses WHERE id = ?', params);
}
export function getBusinessesNameSectorById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT name, sector FROM businesses WHERE id = ?', params);
}
export function getBusinessesRowidById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT rowid FROM businesses WHERE id = ?', params);
}
export function getBusinessesSById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT client_status AS s FROM businesses WHERE id = ?', params);
}
export function getBusinessesSById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT stage AS s FROM businesses WHERE id = ?', params);
}
export function getBusinessesSectorById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT sector FROM businesses WHERE id = ?', params);
}
export function getBusinessesSourceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT source FROM businesses WHERE id = ?', params);
}
export function getBusinessesStageById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT stage FROM businesses WHERE id = ?', params);
}
export function getBusinessesXById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM businesses WHERE id = ?', params);
}
export function insertBusinesses(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at, source, updated_at, company_number) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertBusinesses2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO businesses (id, name, sector, stage, contact_email, contact_phone, created_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listBusinessesIdName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, name FROM businesses', params);
}
export function listBusinessesIdName2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, name FROM businesses ORDER BY name', params);
}
export function listBusinessesIdName3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, name FROM businesses ORDER BY name ASC LIMIT 500', params);
}
export function listBusinessesIdName4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, name FROM businesses ORDER BY name LIMIT 1000', params);
}
export function updateBusinessesClaimantTypeById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE businesses SET claimant_type = 'LLP' WHERE id = ?", params);
}
export function updateBusinessesClientStatusById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE businesses SET client_status = 'DO_NOT_CONTACT' WHERE id = ?", params);
}
export function updateBusinessesLegalNameCompanyNumberById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE businesses SET legal_name = ?, company_number = ?, claimant_type = ?, registered_address = ?, ' +
    'trading_address = ?, website = ?, client_status = ?, source = ?, owner_id = ?, updated_at = ? WHERE id = ?', params);
}
export function updateBusinessesLegalNameCompanyNumberById2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE businesses SET legal_name = ?, company_number = ?, claimant_type = ?, registered_address = ?, ' +
    'trading_address = ?, website = ?, owner_id = ? WHERE id = ?', params);
}
export function updateBusinessesSourceUpdatedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE businesses SET source = 'WEBSITE', updated_at = ?", params);
}
export function updateBusinessesSourceUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE businesses SET source = ?, updated_at = ? WHERE id = ?', params);
}
export function updateBusinessesStageUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE businesses SET stage = ?, updated_at = ? WHERE id = ?', params);
}

// call_logs
export function insertCallLogs(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO call_logs (id, business_id, claim_id, contact_id, outcome, notes, logged_by, logged_at, task_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// channel_reads
export function getChannelReadsAtByUserIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(read_at) AS at FROM channel_reads WHERE user_id = ? AND business_id = ? AND channel = ?', params);
}
export function insertChannelReads(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO channel_reads (id, user_id, business_id, channel, read_at) VALUES (?, ?, ?, ?, ?)', params);
}

// client_message_files
export function deleteClientMessageFilesByMessageId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM client_message_files WHERE message_id = ?', params);
}
export function getClientMessageFilesIdBusinessIdByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT m.id, m.business_id, m.direction FROM client_message_files f JOIN client_messages m ON m.id = f.message_id WHERE f.logical_document_id = ?', params);
}
export function getClientMessageFilesIdDirectionByLogicalDocumentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT m.id, m.direction FROM client_message_files f JOIN client_messages m ON m.id = f.message_id WHERE f.logical_document_id = ?', params);
}
export function insertClientMessageFiles(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_message_files (id, message_id, logical_document_id, linked_at) VALUES (?, ?, ?, ?)', params);
}

// client_messages
export function deleteClientMessagesById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM client_messages WHERE id = ?', params);
}
export function getClientMessagesBusinessIdDirectionById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT m.business_id, m.direction, b.name, b.owner_id FROM client_messages m JOIN businesses b ON b.id = m.business_id WHERE m.id = ?', params);
}
export function getClientMessagesCountByBusinessIdDirection<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM client_messages WHERE business_id = ? AND direction = ? AND created_at > ? AND (source <> 'EMAIL' OR created_at > ?)", params);
}
export function getClientMessagesCountByBusinessIdDirection2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM client_messages WHERE business_id = ? AND direction = 'FROM_CLIENT' AND source = 'EMAIL' AND created_at > ?", params);
}
export function getClientMessagesExistsByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 FROM client_messages WHERE business_id = ? LIMIT 1', params);
}
export function insertClientMessages(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)', params);
}
export function insertClientMessages2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)', params);
}
export function insertClientMessages3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_messages (id, business_id, claim_id, direction, source, author_id, contact_id, body, created_at) VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, ?)', params);
}
export function listClientMessagesBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT business_id FROM client_messages UNION SELECT business_id FROM internal_notes ORDER BY business_id', params);
}
export function listClientMessagesBusinessIdNameByDirectionCreatedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.business_id, b.name, MIN(m.created_at) AS since, COUNT(*) AS n FROM client_messages m JOIN businesses b ON b.id = m.business_id ' +
    "WHERE m.direction = 'FROM_CLIENT' AND m.created_at > COALESCE((SELECT MAX(r.created_at) FROM client_messages r " +
    "WHERE r.business_id = m.business_id AND r.direction = 'TO_CLIENT'), '') GROUP BY m.business_id, b.name ORDER BY since ASC", params);
}
export function listClientMessagesIdCreatedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, created_at FROM client_messages WHERE business_id = ?', params);
}

// client_task_checks
export function getClientTaskChecksIdByTaskId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM client_task_checks WHERE task_id = ?', params);
}
export function insertClientTaskChecks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO client_task_checks (id, task_id, outcome, reason, asked_again_task_id, checked_by, checked_at) VALUES (?, ?, 'ACCEPTED', NULL, NULL, ?, ?)", params);
}
export function insertClientTaskChecks2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO client_task_checks (id, task_id, outcome, reason, asked_again_task_id, checked_by, checked_at) VALUES (?, ?, 'ASKED_AGAIN', ?, ?, ?, ?)", params);
}

// client_tasks
export function getClientTasksCountByKindState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM client_tasks WHERE kind = 'DOCUMENT' AND state = 'OPEN' AND requested_type = ? AND event_id = ?", params);
}
export function getClientTasksIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, kind, state, claim_id FROM client_tasks WHERE id = ?', params);
}
export function getClientTasksIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, kind, state, requested_type, claim_id, event_id FROM client_tasks WHERE id = ?', params);
}
export function getClientTasksIdBusinessIdById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, state, fact_id, kind FROM client_tasks WHERE id = ?', params);
}
export function getClientTasksIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, state, kind FROM client_tasks WHERE id = ?', params);
}
export function getClientTasksIdClaimIdByBusinessIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id, claim_id FROM client_tasks WHERE business_id = ? AND kind = 'DOCUMENT' AND requested_type = ? AND state = 'OPEN' " +
    'ORDER BY due_on IS NULL, due_on ASC, created_at ASC, id ASC LIMIT 1', params);
}
export function getClientTasksIdClaimIdByIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id, claim_id FROM client_tasks WHERE id = ? AND kind = 'DOCUMENT' AND state = 'OPEN'", params);
}
export function getClientTasksIdKindById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, kind, question, why, holds_up, fact_id, requested_type, event_id, state, answered_by_role AS role, claim_id, business_id FROM client_tasks WHERE id = ?', params);
}
export function getClientTasksOpenSentByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT ' +
    "SUM(CASE WHEN state = 'OPEN' THEN 1 ELSE 0 END) AS open, " +
    "SUM(CASE WHEN state = 'OPEN' AND sent_to_portal_at IS NOT NULL THEN 1 ELSE 0 END) AS sent, " +
    "SUM(CASE WHEN state = 'ANSWERED' THEN 1 ELSE 0 END) AS answered " +
    'FROM client_tasks WHERE business_id = ?', params);
}
export function insertClientTasks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, ' +
    'created_at, fact_id, sent_to_portal_at, due_on, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertClientTasks2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, created_at, fact_id, sent_to_portal_at, due_on, ' +
    'kind, requested_type, claim_id, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)', params);
}
export function insertClientTasks3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO client_tasks (id, business_id, asked_by, question, why, holds_up, state, ' +
    'created_at, fact_id, sent_to_portal_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)', params);
}
export function listClientTasksAnswerStateByBusinessIdFactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT answer_state FROM client_tasks WHERE business_id = ? AND fact_id = ? AND state = 'ANSWERED' " +
    'AND (claim_id IS NULL OR claim_id = ?)', params);
}
export function listClientTasksFactIdByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT fact_id FROM client_tasks WHERE business_id = ? AND claim_id = ? AND state = 'OPEN' AND fact_id IS NOT NULL", params);
}
export function listClientTasksFactIdByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT fact_id FROM client_tasks WHERE business_id = ? AND state = 'OPEN' AND fact_id IS NOT NULL", params);
}
export function listClientTasksFactIdStateByBusinessIdFactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT fact_id, state, answer_state FROM client_tasks WHERE business_id = ? AND fact_id IS NOT NULL', params);
}
export function listClientTasksIdAnswerByBusinessIdFactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, answer, answered_at FROM client_tasks WHERE business_id = ? AND fact_id = ? AND state = 'ANSWERED' AND answer_state = 'ANSWERED' " +
    'ORDER BY answered_at DESC, rowid DESC', params);
}
export function listClientTasksIdBusinessIdByStateDueOn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, business_id, kind, due_on, sent_to_portal_at FROM client_tasks WHERE state = 'OPEN' ORDER BY due_on IS NULL, due_on ASC", params);
}
export function listClientTasksIdFactIdByBusinessIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, fact_id, claim_id, question, answer_state, answer, answered_at FROM client_tasks " +
    "WHERE business_id = ? AND kind = 'QUESTION' AND state = 'ANSWERED' AND answered_by_role = 'CLIENT' ORDER BY answered_at ASC, id ASC", params);
}
export function listClientTasksIdQuestionByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, question, why, holds_up, state, answer_state, answer, answered_at, answered_by_role ' +
    "FROM client_tasks WHERE business_id = ? AND state <> ? AND kind = 'QUESTION' ORDER BY created_at ASC", params);
}
export function listClientTasksIdRequestedTypeByBusinessIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, requested_type FROM client_tasks WHERE business_id = ? AND kind = 'DOCUMENT'", params);
}
export function listClientTasksQuestionDueOnByAskedByState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT ct.question, ct.due_on, ct.business_id, b.name AS business_name FROM client_tasks ct ' +
    "JOIN businesses b ON b.id = ct.business_id WHERE ct.asked_by = ? AND ct.state = 'OPEN' AND ct.kind = 'QUESTION' " +
    'AND ct.due_on IS NOT NULL AND ct.due_on < ? ORDER BY ct.due_on ASC', params);
}
export function listClientTasksQuestionDueOnByAskedByState2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT ct.question, ct.due_on, ct.business_id, b.name AS business_name, ct.sent_to_portal_at FROM client_tasks ct ' +
    "JOIN businesses b ON b.id = ct.business_id WHERE ct.asked_by = ? AND ct.state = 'OPEN' AND ct.kind = 'QUESTION' " +
    'ORDER BY ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC', params);
}
export function listClientTasksQuestionDueOnByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT question, due_on, sent_to_portal_at FROM client_tasks WHERE business_id = ? AND state = 'OPEN' AND kind = 'QUESTION' " +
    'AND due_on IS NOT NULL AND due_on < ? ORDER BY due_on ASC', params);
}
export function listClientTasksQuestionKindByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT question, kind, due_on, created_at, sent_to_portal_at AS sent FROM client_tasks WHERE business_id = ? AND state = 'OPEN' " +
    'AND (claim_id = ? OR claim_id IS NULL) ORDER BY due_on IS NULL, due_on ASC, created_at ASC', params);
}
export function updateClientTasksStateAnswerStateById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE client_tasks SET state = ?, answer_state = ?, answer = ?, answered_at = ?, ' +
    'answered_by = ?, answered_by_role = ? WHERE id = ?', params);
}
export function updateClientTasksStateAnswerStateByIdState(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE client_tasks SET state = 'ANSWERED', answer_state = 'ANSWERED', answer = ?, answered_at = ?, answered_by = ?, " +
    "answered_by_role = ?, received_document_id = ? WHERE id = ? AND state = 'OPEN'", params);
}
export function updateClientTasksStateWithdrawnAtByIdState(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE client_tasks SET state = 'WITHDRAWN', withdrawn_at = ?, withdrawn_by = ? WHERE id = ? AND state = 'OPEN'", params);
}

// contacts
export function getContactsBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id FROM contacts WHERE id = ?', params);
}
export function getContactsBusinessIdLeadIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id, lead_id, introducer_id FROM contacts WHERE id = ?', params);
}
export function getContactsCountByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM contacts WHERE business_id = ?', params);
}
export function getContactsCountByBusinessIdId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM contacts WHERE business_id = ? AND id IS NOT ? AND (TRIM(COALESCE(email, '')) <> '' OR TRIM(COALESCE(phone, '')) <> '')", params);
}
export function getContactsCountByClientStatus2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM contacts c JOIN businesses b ON b.id = c.business_id WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(c.email) = lower(?)", params);
}
export function getContactsEByBusinessIdEmail<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT email AS e FROM contacts WHERE business_id = ? AND email IS NOT NULL AND trim(email) <> '' ORDER BY created_at, id LIMIT 1", params);
}
export function getContactsEByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT email AS e FROM contacts WHERE lead_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', params);
}
export function getContactsFullNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT full_name FROM contacts WHERE id = ?', params);
}
export function getContactsFullNamePhoneByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT full_name, phone FROM contacts WHERE ((business_id IS NOT NULL AND business_id = ?) OR (lead_id IS NOT NULL AND lead_id = ?)) ORDER BY phone IS NULL OR trim(phone) = '', created_at LIMIT 1", params);
}
export function getContactsFullNameWhatsappOptinById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT full_name, whatsapp_optin FROM contacts WHERE id = ?', params);
}
export function getContactsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, contact_type FROM contacts WHERE id = ?', params);
}
export function getContactsIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, email FROM contacts WHERE id = ?', params);
}
export function getContactsIdBusinessIdById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, lead_id FROM contacts WHERE id = ?', params);
}
export function getContactsIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM contacts WHERE business_id = ? AND lower(trim(email)) = lower(?) ORDER BY created_at LIMIT 1', params);
}
export function getContactsIdByBusinessIdContactType<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM contacts WHERE business_id = ? AND contact_type = 'FINANCE'", params);
}
export function getContactsIdByBusinessIdContactType2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM contacts WHERE business_id = ? AND contact_type IN ('ACCOUNTANT','ADVISER') LIMIT 1", params);
}
export function getContactsIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM contacts WHERE id = ?', params);
}
export function getContactsIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM contacts WHERE id = ? AND business_id = ?', params);
}
export function getContactsIdByIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM contacts WHERE id = ? AND introducer_id = ?', params);
}
export function getContactsIdEmailByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, email, phone FROM contacts WHERE id = ? AND business_id = ?', params);
}
export function getContactsIdFullNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT c.id, c.full_name, c.business_id, c.lead_id, c.contact_consent, c.marketing_optin, c.created_at, COALESCE(b.name, l.prospect_organisation, i.firm_name) AS org ' +
    'FROM contacts c LEFT JOIN businesses b ON b.id = c.business_id LEFT JOIN leads l ON l.id = c.lead_id LEFT JOIN introducers i ON i.id = c.introducer_id WHERE c.id = ?', params);
}
export function getContactsIdFullNameByIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, full_name, job_role_other, email, phone, notes FROM contacts WHERE id = ? AND introducer_id = ?', params);
}
export function getContactsIdFullNameByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, full_name, job_role, job_role_other, email, phone FROM contacts WHERE lead_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', params);
}
export function getContactsNByBusinessIdLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT full_name AS n FROM contacts WHERE (business_id = ? OR lead_id = ?) ORDER BY created_at ASC, id ASC LIMIT 1', params);
}
export function getContactsXByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT 1 AS x FROM contacts WHERE business_id = ? AND lower(email) = lower(?)", params);
}
export function getContactsXByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM contacts WHERE id = ? AND business_id = ?', params);
}
export function insertContacts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO contacts (id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, ' +
    'created_at, contact_type, is_decision_maker, email, phone, notes, updated_at) ' +
    'VALUES (?, ?, ?, NULL, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertContacts2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO contacts (id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, ' +
    'created_at, contact_type, is_decision_maker, email, phone, updated_at) ' +
    'VALUES (?, ?, ?, NULL, NULL, 0, 0, ?, ?, ?, ?, ?, ?)', params);
}
export function insertContacts3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO contacts (id, business_id, lead_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, email, phone, created_at) ' +
    'VALUES (?, NULL, ?, ?, NULL, NULL, 1, 0, ?, ?, ?)', params);
}
export function insertContacts4(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO contacts (id, business_id, lead_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, whatsapp_optin, ' +
    'email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertContacts5(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO contacts (id, business_id, lead_id, introducer_id, full_name, job_role, job_role_other, contact_consent, ' +
    "marketing_optin, created_at, contact_type, email, phone, notes, updated_at) VALUES (?, NULL, NULL, ?, ?, NULL, ?, 0, 0, ?, 'INTRODUCER', ?, ?, ?, ?)", params);
}
export function listContactsEByBusinessIdEmail<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT lower(email) AS e FROM contacts WHERE business_id = ? AND email IS NOT NULL UNION SELECT lower(contact_email) FROM businesses WHERE id = ? AND contact_email IS NOT NULL', params);
}
export function listContactsEmailNameByBusinessIdEmail<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT email, full_name AS name FROM contacts WHERE business_id = ? AND email IS NOT NULL AND trim(email) <> '' ORDER BY full_name", params);
}
export function listContactsFullNameByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT full_name FROM contacts WHERE business_id = ?', params);
}
export function listContactsFullNameJobRoleByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT full_name, job_role, email, phone FROM contacts WHERE business_id = ? ORDER BY is_decision_maker DESC, full_name', params);
}
export function listContactsIdBusinessIdByBusinessIdPhone<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, business_id, phone FROM contacts WHERE business_id IS NOT NULL AND phone IS NOT NULL AND trim(phone) <> ''", params);
}
export function listContactsIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id FROM contacts WHERE business_id = ? AND (TRIM(COALESCE(email, '')) <> '' OR TRIM(COALESCE(phone, '')) <> '')", params);
}
export function listContactsIdCreatedAtByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, created_at FROM contacts WHERE lead_id = ?', params);
}
export function listContactsIdFullName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT c.id, c.full_name, c.business_id, c.lead_id, c.introducer_id, COALESCE(b.name, l.prospect_organisation, i.firm_name) AS org FROM contacts c " +
    'LEFT JOIN businesses b ON b.id = c.business_id LEFT JOIN leads l ON l.id = c.lead_id LEFT JOIN introducers i ON i.id = c.introducer_id ' +
    "WHERE lower(c.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.email, '')) LIKE ? ESCAPE '\\' OR lower(COALESCE(c.phone, '')) LIKE ? ESCAPE '\\' LIMIT 200", params);
}
export function listContactsIdFullNameByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, full_name FROM contacts WHERE business_id = ? ORDER BY full_name', params);
}
export function listContactsIdFullNameByBusinessId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, full_name, email, phone FROM contacts WHERE business_id = ? ORDER BY full_name, id', params);
}
export function listContactsIdFullNameByBusinessIdContactType<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, full_name, contact_type FROM contacts WHERE business_id = ? AND contact_type IN ('ACCOUNTANT','ADVISER') " +
    'ORDER BY full_name ASC, id ASC', params);
}
export function listContactsIdFullNameByBusinessIdPhone<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, full_name, phone, whatsapp_optin FROM contacts WHERE business_id = ? AND phone IS NOT NULL AND trim(phone) <> '' ORDER BY full_name", params);
}
export function listContactsIdFullNameByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, full_name, job_role_other, email, phone, notes FROM contacts WHERE introducer_id = ? ORDER BY full_name ASC, id ASC', params);
}
export function listContactsIdFullNameByLeadIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, full_name, email, contact_consent FROM contacts WHERE lead_id = ? AND business_id IS NULL ORDER BY full_name ASC, id ASC', params);
}
export function listContactsIdNameByBusinessIdContactType<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, full_name AS name, email FROM contacts WHERE business_id = ? AND contact_type IN ('ACCOUNTANT', 'ADVISER') " +
    "AND email IS NOT NULL AND trim(email) <> '' ORDER BY full_name", params);
}
export function listContactsIdNameByBusinessIdContactType2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, full_name AS name, email, contact_type AS type FROM contacts WHERE business_id = ? AND contact_type IN ('ACCOUNTANT', 'ADVISER') " +
    "AND email IS NOT NULL AND trim(email) <> '' ORDER BY full_name", params);
}
export function updateContactsBusinessIdUpdatedAtByLeadIdBusinessId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE contacts SET business_id = ?, updated_at = ? WHERE lead_id = ? AND business_id IS NULL', params);
}
export function updateContactsContactConsentUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE contacts SET contact_consent = ?, updated_at = ? WHERE id = ?', params);
}
export function updateContactsFullNameJobRoleOtherById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE contacts SET full_name = ?, job_role_other = ?, contact_type = ?, is_decision_maker = ?, email = ?, ' +
    'phone = ?, notes = ?, updated_at = ? WHERE id = ?', params);
}
export function updateContactsFullNameJobRoleOtherById2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE contacts SET full_name = ?, job_role_other = ?, email = ?, phone = ?, notes = ?, updated_at = ? WHERE id = ?', params);
}
export function updateContactsIntroducerIdUpdatedAtByIntroducerId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE contacts SET introducer_id = ?, updated_at = ? WHERE introducer_id = ?', params);
}
export function updateContactsMarketingOptinUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE contacts SET marketing_optin = ?, updated_at = ? WHERE id = ?', params);
}

// healthcare_premises
export function getHealthcarePremisesXBySourceIdSourceRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM healthcare_premises WHERE source_id = ? AND source_ref = ?', params);
}
export function insertHealthcarePremises(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO healthcare_premises (id, business_name, address, postcode, sector, source_id, source_ref, licence, imported_by, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// internal_notes
export function deleteInternalNotesById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM internal_notes WHERE id = ?', params);
}
export function getInternalNotesCountByBusinessIdAuthorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM internal_notes WHERE business_id = ? AND author_id <> ? AND created_at > ?', params);
}
export function getInternalNotesExistsByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 FROM internal_notes WHERE business_id = ? LIMIT 1', params);
}
export function insertInternalNotes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO internal_notes (id, business_id, author_id, body, created_at, claim_id, property_id) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listInternalNotesIdCreatedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, created_at FROM internal_notes WHERE business_id = ?', params);
}

// introducer_fees
export function getIntroducerFeesCountByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM introducer_fees WHERE introducer_id = ?', params);
}
export function getIntroducerFeesIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM introducer_fees WHERE claim_id = ?', params);
}
export function insertIntroducerFees(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducer_fees (id, introducer_id, claim_id, business_id, amount_pence, disclosure_given_at, disclosure_recorded_by, ' +
    "state, paid_at, paid_recorded_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'ACCRUED', NULL, NULL, ?, ?)", params);
}
export function updateIntroducerFeesDisclosureGivenAtDisclosureRecordedByByI(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE introducer_fees SET disclosure_given_at = ?, disclosure_recorded_by = ?, updated_at = ? WHERE id = ?', params);
}
export function updateIntroducerFeesStatePaidAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE introducer_fees SET state = 'PAID', paid_at = ?, paid_recorded_by = ?, updated_at = ? WHERE id = ?", params);
}

// introducer_merges
export function insertIntroducerMerges(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducer_merges (id, from_id, into_id, reason, merged_by, started_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function updateIntroducerMergesCompletedAtLeadsMovedById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE introducer_merges SET completed_at = ?, leads_moved = ?, people_moved = ?, tasks_moved = ? WHERE id = ?', params);
}

// introducer_notices
export function getIntroducerNoticesIdByLeadIdNotice<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM introducer_notices WHERE lead_id = ? AND notice = ? AND outcome = 'QUEUED'", params);
}
export function insertIntroducerNotices(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducer_notices (id, introducer_id, lead_id, claim_id, notice, outcome, reason, consent_id, outbox_id, at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listIntroducerNoticesAtNoticeByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT at, notice, outcome, reason FROM introducer_notices WHERE lead_id = ? ORDER BY rowid ASC', params);
}

// introducer_percentage_entries
export function getIntroducerPercentageEntriesIdByInvoiceIdEntryKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM introducer_percentage_entries WHERE invoice_id = ? AND entry_kind = 'ACCRUAL'", params);
}
export function getIntroducerPercentageEntriesIntroducerIdClaimIdByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT introducer_id, claim_id, business_id, percent_bp FROM introducer_percentage_entries WHERE invoice_id = ? AND entry_kind = 'ACCRUAL'", params);
}
export function getIntroducerPercentageEntriesTByInvoiceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT SUM(amount_pence) AS t FROM introducer_percentage_entries WHERE invoice_id = ?', params);
}
export function insertIntroducerPercentageEntries(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducer_percentage_entries (id, introducer_id, claim_id, business_id, invoice_id, credit_note_id, entry_kind, basis_pence, percent_bp, amount_pence, recorded_by, created_at) ' +
    "VALUES (?, ?, ?, ?, ?, ?, 'REVERSAL', ?, ?, ?, ?, ?)", params);
}
export function insertIntroducerPercentageEntries2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducer_percentage_entries (id, introducer_id, claim_id, business_id, invoice_id, credit_note_id, entry_kind, basis_pence, percent_bp, amount_pence, recorded_by, created_at) ' +
    "VALUES (?, ?, ?, ?, ?, NULL, 'ACCRUAL', ?, ?, ?, ?, ?)", params);
}

// introducer_reward_setting
export function updateIntroducerRewardSettingModelFeePenceById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE introducer_reward_setting SET model = ?, fee_pence = ?, percent_bp = ?, changed_by = ?, changed_at = ? WHERE id = 1', params);
}

// introducer_share_consents
export function insertIntroducerShareConsents(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducer_share_consents (id, introducer_id, business_id, lead_id, decision, wording_version, route, recorded_by, recorded_at) ' +
    "VALUES (?, ?, ?, ?, ?, ?, 'STAFF_RECORDED', ?, ?)", params);
}
export function insertIntroducerShareConsents2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducer_share_consents (id, introducer_id, business_id, lead_id, decision, wording_version, route, recorded_by, recorded_at) ' +
    "VALUES (?, ?, ?, NULL, ?, ?, 'CLIENT_PORTAL', ?, ?)", params);
}
export function listIntroducerShareConsentsIdDecisionByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, decision FROM introducer_share_consents WHERE (business_id IS NOT NULL AND business_id = ?) OR (lead_id IS NOT NULL AND lead_id = ?)', params);
}
export function listIntroducerShareConsentsRecordedAtDecisionByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT s.recorded_at, s.decision, s.wording_version, s.route, i.firm_name AS firm FROM introducer_share_consents s JOIN introducers i ON i.id = s.introducer_id ' +
    'WHERE (s.business_id IS NOT NULL AND s.business_id = ?) OR (s.lead_id IS NOT NULL AND s.lead_id = ?) ' +
    'OR (s.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id IS NOT NULL AND l.business_id = ?)) ORDER BY s.rowid', params);
}

// introducer_terms_signatures
export function getIntroducerTermsSignaturesTermsVersionSignedOnByIntroducer<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT terms_version, signed_on, recorded_at FROM introducer_terms_signatures WHERE introducer_id = ? ORDER BY signed_on DESC, recorded_at DESC, rowid DESC LIMIT 1', params);
}
export function insertIntroducerTermsSignatures(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducer_terms_signatures (id, introducer_id, terms_version, signed_on, firm_signatory, our_signatory, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// introducers
export function getIntroducersFirmNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT firm_name FROM introducers WHERE id = ?', params);
}
export function getIntroducersIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM introducers WHERE id = ?', params);
}
export function getIntroducersIdIntroducerTypeById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, introducer_type FROM introducers WHERE id = ?', params);
}
export function getIntroducersIdMergedIntoIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, merged_into_id FROM introducers WHERE id = ?', params);
}
export function insertIntroducers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducers (id, firm_name, introducer_type, owner_id, relationship_started_on, ' +
    "notice_contact_id, notes, created_via, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, 'STAFF', ?, ?)", params);
}
export function insertIntroducers2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO introducers (id, firm_name, introducer_type, owner_id, relationship_started_on, ' +
    'notice_contact_id, notes, created_via, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)', params);
}
export function listIntroducersIdFirmName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, firm_name FROM introducers ORDER BY firm_name ASC, id ASC LIMIT 500', params);
}
export function listIntroducersIdName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, firm_name AS name FROM introducers ORDER BY firm_name ASC, id ASC LIMIT 500', params);
}
export function listIntroducersIdNameByIdMergedIntoId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, firm_name AS name FROM introducers WHERE id <> ? AND merged_into_id IS NULL ORDER BY firm_name ASC, id ASC LIMIT 500', params);
}
export function updateIntroducersFirmNameIntroducerTypeById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE introducers SET firm_name = ?, introducer_type = ?, owner_id = ?, relationship_started_on = ?, ' +
    'notes = ?, notice_contact_id = ?, updated_at = ? WHERE id = ?', params);
}
export function updateIntroducersMergedIntoIdMergedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE introducers SET merged_into_id = ?, merged_at = ?, merged_by = ?, notice_contact_id = NULL, updated_at = ? WHERE id = ?', params);
}
export function updateIntroducersNoticeContactIdUpdatedAtByIdNoticeContactId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE introducers SET notice_contact_id = ?, updated_at = ? WHERE id = ? AND notice_contact_id IS NULL', params);
}

// leads
export function getLeadsBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT business_id FROM leads WHERE id = ?', params);
}
export function getLeadsClaimIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT claim_id FROM leads WHERE id = ?', params);
}
export function getLeadsEnquiryIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT enquiry_id FROM leads WHERE id = ?', params);
}
export function getLeadsIdBusinessIdByBusinessIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, introducer_id FROM leads WHERE business_id = ? AND introducer_id = ? ORDER BY rowid LIMIT 1', params);
}
export function getLeadsIdBusinessIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.id, l.business_id, l.origin, l.source, l.introducer_id, i.firm_name FROM leads l ' +
    'LEFT JOIN introducers i ON i.id = l.introducer_id WHERE l.claim_id = ?', params);
}
export function getLeadsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id FROM leads WHERE id = ?', params);
}
export function getLeadsIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, introducer_id FROM leads WHERE id = ?', params);
}
export function getLeadsIdBusinessIdById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, owner_id FROM leads WHERE id = ?', params);
}
export function getLeadsIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, status FROM leads WHERE id = ?', params);
}
export function getLeadsIdBusinessIdById5<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, status, enquiry_id FROM leads WHERE id = ?', params);
}
export function getLeadsIdBusinessIdById6<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.id, l.business_id, b.name AS organisation_name FROM leads l LEFT JOIN businesses b ON b.id = l.business_id WHERE l.id = ?', params);
}
export function getLeadsIdBusinessIdById7<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT l.id, l.business_id, l.introducer_id, COALESCE(b.name, l.prospect_organisation, 'the client') AS organisation, " +
    'i.firm_name, c.email AS to_email FROM leads l LEFT JOIN businesses b ON b.id = l.business_id ' +
    'LEFT JOIN introducers i ON i.id = l.introducer_id LEFT JOIN contacts c ON c.id = i.notice_contact_id WHERE l.id = ?', params);
}
export function getLeadsIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM leads WHERE claim_id = ?', params);
}
export function getLeadsIdByClaimIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM leads WHERE claim_id = ? AND introducer_id IS NOT NULL', params);
}
export function getLeadsIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM leads WHERE id = ?', params);
}
export function getLeadsIdByOriginStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM leads WHERE origin = 'REFERRAL' AND status <> 'CONVERTED' LIMIT 1", params);
}
export function getLeadsIdByRowid<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM leads WHERE rowid = ?', params);
}
export function getLeadsIntroducerIdByClaimIdIntroducerType<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT l.introducer_id FROM leads l JOIN introducers i ON i.id = l.introducer_id WHERE l.claim_id = ? AND i.introducer_type = 'ACCOUNTANT_FIRM' " +
    'AND EXISTS (SELECT 1 FROM introducer_terms_signatures s WHERE s.introducer_id = i.id)', params);
}
export function getLeadsIntroducerIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT introducer_id FROM leads WHERE id = ?', params);
}
export function getLeadsRowidById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT rowid FROM leads WHERE id = ?', params);
}
export function insertLeads(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
    'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
    'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
    "VALUES (?, ?, ?, NULL, NULL, 'ASSESSMENT', 'WEBSITE', NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, 'NEW', " +
    'NULL, NULL, NULL, ?, ?)', params);
}
export function insertLeads2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
    'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
    'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
    'VALUES (?, ?, NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, ?, ?)', params);
}
export function insertLeads3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
    'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
    'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
    'VALUES (?, NULL, NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, NULL, NULL, ?, ?)', params);
}
export function insertLeads4(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
    'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
    'lost_reason, lost_note, converted_at, created_at, updated_at) ' +
    "VALUES (?, NULL, NULL, NULL, NULL, 'GATED_EXIT', 'WEBSITE', NULL, ?, NULL, ?, NULL, NULL, NULL, NULL, 'NEW', " +
    'NULL, NULL, NULL, ?, ?)', params);
}
export function insertLeads5(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
    'prospect_organisation, prospect_sector, prospect_postcode, prospect_event, prospect_event_year, lead_date, owner_id, ' +
    'priority, next_action, next_action_due, status, lost_reason, lost_note, converted_at, created_at, updated_at) ' +
    "VALUES (?, NULL, NULL, NULL, NULL, 'REFERRAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'NEW', NULL, NULL, NULL, ?, ?)", params);
}
export function listLeadsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, business_id, source, status, lead_date FROM leads ORDER BY source ASC', params);
}
export function listLeadsIdBusinessIdByStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, business_id, lost_reason FROM leads WHERE status = 'LOST'", params);
}
export function listLeadsIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM leads WHERE business_id = ?', params);
}
export function listLeadsIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM leads WHERE claim_id = ?', params);
}
export function listLeadsIdFirmNameByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT i.id, i.firm_name, COUNT(l.id) AS n FROM leads l JOIN introducers i ON i.id = l.introducer_id ' +
    'WHERE l.business_id = ? GROUP BY i.id, i.firm_name ORDER BY i.firm_name ASC, i.id ASC', params);
}
export function listLeadsIdStatusByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, status, enquiry_id FROM leads WHERE business_id = ?', params);
}
export function listLeadsIdUpdatedAtByEnquiryIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, updated_at FROM leads WHERE enquiry_id IS NOT NULL AND status = 'LOST'", params);
}
export function listLeadsLeadIdIntroducerIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id AS lead_id, l.introducer_id, i.firm_name FROM leads l JOIN introducers i ON i.id = l.introducer_id ' +
    'WHERE l.business_id = ? ORDER BY l.rowid', params);
}
export function listLeadsLeadIdNameByEnquiryIdId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id AS lead_id, COALESCE(b.name, l.prospect_organisation) AS name FROM leads l LEFT JOIN businesses b ON b.id = l.business_id ' +
    'WHERE l.enquiry_id = ? AND l.id <> ? ORDER BY l.created_at, l.id', params);
}
export function listLeadsUpdatedAtByEnquiryIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT updated_at FROM leads WHERE enquiry_id IS NOT NULL AND status = 'LOST'", params);
}
export function updateLeadsBookingIdUpdatedAtByBusinessIdBookingId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE leads SET booking_id = ?, updated_at = ? WHERE business_id = ? AND booking_id IS NULL', params);
}
export function updateLeadsEnquiryIdById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE leads SET enquiry_id = ? WHERE id = ?', params);
}
export function updateLeadsIntroducerIdUpdatedAtByIntroducerId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE leads SET introducer_id = ?, updated_at = ? WHERE introducer_id = ?', params);
}
export function updateLeadsOwnerIdPriorityById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE leads SET owner_id = ?, priority = ?, source = ?, status = ?, ' +
    'lost_reason = ?, lost_note = ?, prospect_organisation = ?, prospect_sector = ?, introducer_id = ?, updated_at = ? WHERE id = ?', params);
}
export function updateLeadsStatusConvertedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE leads SET status = ?, converted_at = ?, claim_id = ?, business_id = ?, assessment_id = ?, booking_id = ?, ' +
    'prospect_organisation = NULL, prospect_sector = NULL, prospect_postcode = NULL, prospect_event = NULL, ' +
    'prospect_event_year = NULL, updated_at = ? WHERE id = ?', params);
}
export function updateLeadsUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE leads SET updated_at = ? WHERE id = ?', params);
}

// staff_tasks
export function getStaffTasksAtByContactIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT MAX(completed_at) AS at FROM staff_tasks WHERE contact_id = ? AND status = 'COMPLETED' AND activity_type IN ('CALL','EMAIL','MEETING')", params);
}
export function getStaffTasksCompletedAtActivityTypeByIntroducerIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT completed_at, activity_type FROM staff_tasks WHERE introducer_id = ? AND status = 'COMPLETED' " +
    "AND activity_type IN ('CALL','EMAIL','MEETING','CPD_SESSION','CO_BRANDED_ONE_PAGER','PRIORITY_TURNAROUND') " +
    'ORDER BY completed_at DESC, rowid DESC LIMIT 1', params);
}
export function getStaffTasksCountByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM staff_tasks WHERE introducer_id = ?', params);
}
export function getStaffTasksDueOnNByContactIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT MIN(due_on) AS due_on, COUNT(*) AS n FROM staff_tasks WHERE contact_id = ? AND status IN ('OPEN','IN_PROGRESS')", params);
}
export function getStaffTasksDueOnTitleByIntroducerIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT due_on, title, (SELECT COUNT(*) FROM staff_tasks x WHERE x.introducer_id = ? AND x.status IN ('OPEN','IN_PROGRESS')) AS n " +
    "FROM staff_tasks WHERE introducer_id = ? AND status IN ('OPEN','IN_PROGRESS') ORDER BY due_on IS NULL, due_on ASC, created_at ASC LIMIT 1", params);
}
export function getStaffTasksIdByCompanySubjectStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM staff_tasks WHERE company_subject = 'VAT_THRESHOLD' AND status IN ('OPEN','IN_PROGRESS') LIMIT 1", params);
}
export function getStaffTasksIdByCreatedByOrigin<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM staff_tasks WHERE created_by = ? AND origin = 'STAFF' AND status = 'OPEN' AND created_at >= ? AND title = ? " +
    'AND description IS ? AND owner_id IS ? AND owner_role IS ? AND due_on IS ? AND priority IS ? AND activity_type IS ? ' +
    'AND recurrence IS ? AND is_next_action = ? AND business_id IS ? AND property_id IS ? AND claim_id IS ? AND lead_id IS ? ' +
    'AND contact_id IS ? ORDER BY created_at DESC, id LIMIT 1', params);
}
export function getStaffTasksIdByPropertyIdTitle<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id FROM staff_tasks WHERE property_id = ? AND title IN (?, ?) AND status IN ('OPEN','IN_PROGRESS')", params);
}
export function getStaffTasksIdTitleByClaimIdRuleId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT t.id, t.title, t.status, t.due_on, t.owner_id, t.owner_role, t.business_id, t.claim_id FROM staff_tasks t ' +
    'JOIN automation_runs r ON r.id = t.automation_run_id WHERE t.claim_id = ? AND r.rule_id = ? ORDER BY t.created_at DESC LIMIT 1', params);
}
export function getStaffTasksTitleDueOnByClaimIdIsNextAction<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT title, due_on FROM staff_tasks WHERE claim_id = ? AND is_next_action = 1 AND status IN ('OPEN','IN_PROGRESS')", params);
}
export function getStaffTasksTitleOwnerIdByLeadIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT title, owner_id, due_on, activity_type FROM staff_tasks WHERE lead_id = ? AND status IN ('OPEN','IN_PROGRESS') AND due_on IS NOT NULL ORDER BY due_on ASC, created_at ASC, id ASC LIMIT 1", params);
}
export function insertStaffTasks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO staff_tasks (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type, ' +
    'business_id, property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id, is_next_action, ' +
    'origin, automation_run_id, created_by, created_at, updated_at, introducer_id, company_subject) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertStaffTasks2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO staff_tasks (id, title, description, owner_id, owner_role, due_on, priority, status, activity_type, business_id, ' +
    'property_id, claim_id, lead_id, contact_id, fact_id, recurrence, recurred_from_id, is_next_action, origin, automation_run_id, ' +
    'created_by, created_at, updated_at) VALUES (?, ?, NULL, ?, NULL, ?, NULL, ?, ?, NULL, NULL, NULL, ?, NULL, NULL, NULL, NULL, 0, ?, NULL, ?, ?, ?)', params);
}
export function listStaffTasksFactIdByBusinessIdFactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT fact_id FROM staff_tasks WHERE business_id = ? AND fact_id IS NOT NULL AND status IN ('OPEN','IN_PROGRESS')", params);
}
export function listStaffTasksIdBusinessIdByStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, business_id, owner_id, owner_role, due_on, status FROM staff_tasks WHERE status IN ('OPEN','IN_PROGRESS')", params);
}
export function listStaffTasksIdTitleByContactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, title FROM staff_tasks WHERE contact_id = ?', params);
}
export function listStaffTasksIdTitleByPropertyIdTitle<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, title, status FROM staff_tasks WHERE property_id = ? AND title IN (?, ?) ORDER BY created_at DESC', params);
}
export function updateStaffTasksIntroducerIdUpdatedAtByIntroducerIdStatus(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE staff_tasks SET introducer_id = ?, updated_at = ? WHERE introducer_id = ? AND status IN ('OPEN','IN_PROGRESS')", params);
}
export function updateStaffTasksIsNextActionUpdatedAtByClaimIdIsNextAction(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE staff_tasks SET is_next_action = 0, updated_at = ? WHERE claim_id = ? AND is_next_action = 1 AND status IN ('OPEN','IN_PROGRESS')", params);
}
export function updateStaffTasksIsNextActionUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE staff_tasks SET is_next_action = 1, updated_at = ? WHERE id = ?', params);
}
export function updateStaffTasksStatusCancelledAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE staff_tasks SET status = 'CANCELLED', cancelled_at = ?, cancelled_by = ?, cancel_reason = ?, updated_at = ? WHERE id = ?", params);
}
export function updateStaffTasksStatusCompletedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE staff_tasks SET status = 'COMPLETED', completed_at = ?, completed_by = ?, updated_at = ? WHERE id = ?", params);
}
export function updateStaffTasksStatusStartedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE staff_tasks SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?", params);
}
export function updateStaffTasksStatusUpdatedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE staff_tasks SET status = 'OPEN', updated_at = ? WHERE id = ?", params);
}
export function updateStaffTasksTitleDescriptionById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE staff_tasks SET title = ?, description = ?, owner_id = ?, owner_role = ?, due_on = ?, priority = ?, ' +
    'activity_type = ?, recurrence = ?, updated_at = ? WHERE id = ?', params);
}

// thread_reads
export function getThreadReadsAtByUserIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(read_at) AS at FROM thread_reads WHERE user_id = ? AND business_id = ? AND thread = ?', params);
}
export function insertThreadReads(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO thread_reads (id, user_id, business_id, thread, read_at) VALUES (?, ?, ?, ?, ?)', params);
}

// time_blocks
export function getTimeBlocksUserIdRemovedAtById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT user_id, removed_at FROM time_blocks WHERE id = ?', params);
}
export function insertTimeBlocks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO time_blocks (id, user_id, starts_at, ends_at, reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listTimeBlocksIdAssignedToByRemovedAtStartsAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, user_id AS assigned_to, starts_at, ends_at FROM time_blocks WHERE removed_at IS NULL AND starts_at < ? AND ends_at > ?', params);
}
export function listTimeBlocksIdUserIdByUserIdRemovedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, user_id, starts_at, ends_at, reason FROM time_blocks WHERE user_id = ? AND removed_at IS NULL AND starts_at < ? AND ends_at > ? ORDER BY starts_at, id', params);
}
export function listTimeBlocksUserIdStartsAtByRemovedAtStartsAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT user_id, starts_at, ends_at FROM time_blocks WHERE removed_at IS NULL AND starts_at < ? AND ends_at > ?', params);
}
export function updateTimeBlocksRemovedAtRemovedByByIdRemovedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE time_blocks SET removed_at = ?, removed_by = ? WHERE id = ? AND removed_at IS NULL', params);
}

// working_times
export function deleteWorkingTimesByUserId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM working_times WHERE user_id = ?', params);
}
export function insertWorkingTimes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO working_times (id, user_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?, ?)', params);
}
export function listWorkingTimesIdUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, user_id, weekday, start_min, end_min FROM working_times ' +
    'ORDER BY user_id ASC, weekday ASC, start_min ASC', params);
}
export function listWorkingTimesIdUserIdByUserIdStartM<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, user_id, weekday, start_min, end_min FROM working_times WHERE user_id = ? ' +
    'ORDER BY weekday ASC, start_min ASC', params);
}
export function listWorkingTimesUserIdN<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT user_id, COUNT(*) AS n FROM working_times GROUP BY user_id', params);
}

// automation_rules
export function getAutomationRulesIdLabelById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, task_description, task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord, source, created_at, updated_at, request_type FROM automation_rules WHERE id = ?', params);
}
export function listAutomationRulesIdLabel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, task_description, task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord, source, created_at, updated_at, request_type FROM automation_rules ORDER BY ord ASC, id ASC', params);
}
export function listAutomationRulesIdLabelByActiveTriggerEvent<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, label, trigger_event, trigger_stage, trigger_activity, effect, task_title, task_description, task_activity_type, task_priority, due_in_days, assign_to, assign_role, attach_to, active, ord, source, created_at, updated_at, request_type FROM automation_rules WHERE active = 1 AND trigger_event = ? ORDER BY ord ASC, id ASC', params);
}

// contacts
export function getContactsIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, contact_type, is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes FROM contacts WHERE id = ?', params);
}
export function listContactsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, business_id, full_name, job_role, job_role_other, contact_consent, marketing_optin, contact_type, is_decision_maker, email, phone, last_contact_at, next_follow_up_at, notes FROM contacts WHERE business_id = ? ORDER BY full_name ASC, id ASC', params);
}

// automation_runs
export function listAutomationRunsAtOutcomeByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.at, r.outcome, r.reason, r.tasks_created, r.outbox_id, ar.label, r.claim_id, r.lead_id FROM automation_runs r JOIN automation_rules ar ON ar.id = r.rule_id WHERE r.business_id = ? AND r.claim_id IS NULL AND r.lead_id IS NULL ORDER BY r.at', params);
}
export function listAutomationRunsAtOutcomeByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.at, r.outcome, r.reason, r.tasks_created, r.outbox_id, ar.label, r.claim_id, r.lead_id FROM automation_runs r JOIN automation_rules ar ON ar.id = r.rule_id WHERE r.claim_id = ? ORDER BY r.at', params);
}
export function listAutomationRunsAtOutcomeByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.at, r.outcome, r.reason, r.tasks_created, r.outbox_id, ar.label, r.claim_id, r.lead_id FROM automation_runs r JOIN automation_rules ar ON ar.id = r.rule_id WHERE r.lead_id = ? ORDER BY r.at', params);
}

// Moved here from the lower layers' borrowed files: their statements are on this module's tables.
export function getBookingsChannelSmsVariantByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT channel, sms_variant, entry_point FROM bookings WHERE business_id = ? ' +
    'ORDER BY created_at ASC LIMIT 1', params);
}
export function getBookingsChannelSmsVariantByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT channel, sms_variant, entry_point FROM bookings WHERE lead_id = ? ' +
    'ORDER BY created_at ASC LIMIT 1', params);
}
export function getBusinessesContactEmailNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT contact_email, name FROM businesses WHERE id = ?', params);
}
export function getBusinessesCountByClientStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM businesses WHERE client_status = 'DO_NOT_CONTACT' AND lower(contact_email) = lower(?)", params);
}
export function getBusinessesCountByIdClientStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM businesses WHERE id = ? AND client_status = 'DO_NOT_CONTACT'", params);
}
export function getBusinessesNameLegalNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT name, legal_name, company_number, sector FROM businesses WHERE id = ?', params);
}
export function getContactsContactEmailNameByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT email AS contact_email, full_name AS name FROM contacts WHERE lead_id = ? ORDER BY created_at ASC, id ASC LIMIT 1', params);
}
export function getContactsCountByClientStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM contacts c JOIN businesses b ON b.id = c.business_id ' +
    "WHERE b.client_status = 'DO_NOT_CONTACT' AND lower(c.email) = lower(?)", params);
}
export function insertBookingChanges(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO booking_changes (id, booking_id, changed_by, from_starts_at, to_starts_at, ' +
    'from_assigned, to_assigned, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listBusinessesNameLegalName<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT name, legal_name, company_number FROM businesses', params);
}
export function listLeadsProspectOrganisationProspectPostcode<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT prospect_organisation, prospect_postcode FROM leads', params);
}
export function updateBookingsStartsAtEndsAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE bookings SET starts_at = ?, ends_at = ?, assigned_to = ? WHERE id = ?', params);
}

// THE CRM'S OWN HALF OF A SPLIT JOIN (Phase 161l1): its statements that joined other areas' tables now read the
// CRM's rows here and look the rest up through the other area's front door (src/modules/crm/data-borrowed.ts).
/** The contacts the given ids name: one read by a list of ids, in place of a join to contacts. */
export function listContactsIdFullNameByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.full_name, c.contact_type FROM contacts c WHERE c.id IN (SELECT value FROM json_each(?))', params);
}
export function getBookingsStartsAtEndsAtBusinessIdLeadIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT b.starts_at, b.ends_at, b.cancelled_at, b.business_id, b.lead_id FROM bookings b WHERE b.id = ?', params);
}
export function listBookingsIdByIdChannelOverlap<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(`SELECT o.id FROM bookings o
    WHERE o.id <> ? AND o.channel = 'video' AND o.cancelled_at IS NULL AND o.starts_at IS NOT NULL AND o.ends_at IS NOT NULL
    AND o.starts_at < ? AND o.ends_at > ?`, params);
}

// HELPERS FOR A SPLIT JOIN (Phase 161l1): no SQL; used where the CRM puts its rows and another area's together.
/** The ids a list of rows names, for a lookup by ids (SELECT ... WHERE id IN (SELECT value FROM json_each(?))). */
export function idsOf(ids: readonly unknown[]): string {
  return JSON.stringify([...new Set(ids.filter((id): id is string => typeof id === 'string'))]);
}
export function byId<R extends { id: string }>(rows: readonly R[]): Map<string, R> {
  return new Map(rows.map((r) => [r.id, r]));
}
export function lookUp<R>(rows: Map<string, R>, id: unknown): R | undefined {
  return typeof id === 'string' ? rows.get(id) : undefined;
}
/** SQLite's ORDER BY ... ASC for the values these statements sort on: NULL first, numbers before text, text by its bytes. */
export function sqlOrder(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return Buffer.compare(Buffer.from(String(a)), Buffer.from(String(b)));
}
