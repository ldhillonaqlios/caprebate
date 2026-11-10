/**
 * THE CLIENT RECORD'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3; the CRM's until Phase 161l1, moved whole and
 * unchanged when the client record became its own area low in the order). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: organisations, leads, the pipeline, tasks, messages, the calendar and introducers. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
// The users' names and roles, the core's, put in place of a join to users (Phase 161l2; src/core/data.ts fillUsers).
import { fillUser, fillUsers, getUsersCountByBusinessIdsEmailCanonical, listUsersIdDisplayNameByIdsDisabledAt } from '../../core/index.ts';
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

// Phase 161l1: read by a list of ids (a JSON array), for the areas above that joined these tables to their own rows.
export function listContactsIdFullNameByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, full_name FROM contacts WHERE id IN (SELECT value FROM json_each(?))', params);
}
export function listBusinessesIdNameSectorByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, name, sector FROM businesses WHERE id IN (SELECT value FROM json_each(?))', params);
}
// For the seed (src/app/seed.ts): an organisation with a signed letter is a client.
export function updateBusinessesClientStatusActiveById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE businesses SET client_status = 'ACTIVE' WHERE id = ?", params);
}

export function getBookingsStartsAtEndsAtBusinessIdLeadIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT b.starts_at, b.ends_at, b.cancelled_at, b.business_id, b.lead_id FROM bookings b WHERE b.id = ?', params);
}
export function listBookingsIdByIdChannelOverlap<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(`SELECT o.id FROM bookings o
    WHERE o.id <> ? AND o.channel = 'video' AND o.cancelled_at IS NULL AND o.starts_at IS NOT NULL AND o.ends_at IS NOT NULL
    AND o.starts_at < ? AND o.ends_at > ?`, params);
}
/** The companies the given ids name, for a company's name in place of a join to businesses. */
export function listBusinessesIdNameByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT b.id, b.name FROM businesses b WHERE b.id IN (SELECT value FROM json_each(?))', params);
}
export function listClientMessagesIdCreatedAtByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.id, m.created_at FROM client_messages m WHERE m.id IN (SELECT value FROM json_each(?))', params);
}
/** The claims an introducer's leads hold (with_claim: only the leads that hold one; each lead once). */
export function listLeadsClaimIdByIntroducerIdWithClaim<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.claim_id FROM leads l WHERE l.introducer_id = ? AND l.claim_id IS NOT NULL', params);
}
export function listLeadsClaimIdByIntroducerIdEvery<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.claim_id FROM leads l WHERE l.introducer_id = ?', params);
}
export function listClientTasksIdKindAnsweredByByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.id, t.kind, t.question, t.answer, t.answer_state, t.received_document_id, t.answered_by, t.answered_at ' +
    'FROM client_tasks t LEFT JOIN client_task_checks k ON k.task_id = t.id ' +
    "WHERE t.business_id = ? AND (t.claim_id = ? OR t.claim_id IS NULL) AND t.state = 'ANSWERED' AND t.answered_by_role = 'CLIENT' " +
    'AND k.id IS NULL ORDER BY t.answered_at ASC, t.rowid ASC', params);
}
export function listClientTasksIdRequestedTypeByAskedByKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT ct.id, ct.requested_type, ct.due_on, ct.business_id, b.name AS business_name, ct.claim_id FROM client_tasks ct ' +
    'JOIN businesses b ON b.id = ct.business_id ' +
    "WHERE ct.asked_by = ? AND ct.kind = 'DOCUMENT' AND ct.state = 'OPEN' ORDER BY ct.due_on IS NULL, ct.due_on ASC, ct.created_at ASC", params);
}
export function listClientTasksQuestionCreatedAtAskedByByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT ct.question, ct.created_at, ct.sent_to_portal_at, ct.answered_at, ct.answer_state, ct.answered_by_role, ct.withdrawn_at, ' +
    'ct.due_on, ct.asked_by, ct.answered_by, ct.withdrawn_by, ct.kind, ct.requested_type, ct.claim_id, ct.received_document_id FROM client_tasks ct ' +
    'WHERE ct.business_id = ? ORDER BY ct.created_at', params);
}
export function listClientMessageFilesLogicalDocumentIdByMessageId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT f.logical_document_id FROM client_message_files f WHERE f.message_id = ? ORDER BY f.linked_at', params);
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
export function listContactsIdFullNameContactTypeByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.id, c.full_name, c.contact_type FROM contacts c WHERE c.id IN (SELECT value FROM json_each(?))', params);
}

// Phase 161l2: the retention list's record kinds on the client record's tables (src/modules/compliance/compliance-identity.ts
// RECORD_KINDS): each kind's count, text unchanged from compliance's borrowed file. A kind not here reads nothing.
const RECORD_KIND_STATEMENTS: Readonly<Record<string, string>> = Object.freeze({
  LEADS_NEVER_CONVERTED: "SELECT COUNT(*) AS n FROM leads WHERE status <> 'CONVERTED'",
  LEAD_PEOPLE: 'SELECT COUNT(*) AS n FROM contacts WHERE lead_id IS NOT NULL AND business_id IS NULL',
  STAFF_TASKS: 'SELECT COUNT(*) AS n FROM staff_tasks',
  LEAD_FOLLOW_UP_TASKS: "SELECT COUNT(*) AS n FROM staff_tasks t JOIN leads l ON l.id = t.lead_id WHERE l.status <> 'CONVERTED'",
  AUTOMATION_RUNS: 'SELECT COUNT(*) AS n FROM automation_runs',
  INTRODUCERS: 'SELECT COUNT(*) AS n FROM introducers',
  INTRODUCER_PEOPLE: 'SELECT COUNT(*) AS n FROM contacts WHERE introducer_id IS NOT NULL',
  SHARE_CONSENTS: 'SELECT COUNT(*) AS n FROM introducer_share_consents',
  INTRODUCER_NOTICES: 'SELECT COUNT(*) AS n FROM introducer_notices',
  CLIENT_MESSAGE: 'SELECT COUNT(*) AS n FROM client_messages',
  TEAM_MESSAGE: 'SELECT COUNT(*) AS n FROM internal_notes',
});
export function countClientRecordKind<T extends Row = Row>(db: Db, kind: string, params: readonly Param[] = []): T | undefined {
  const sql = RECORD_KIND_STATEMENTS[kind];
  return sql === undefined ? undefined : db.get<T>(sql, params);
}

// Phase 161l2: read by a list of ids (a JSON array), for the areas above that joined these tables to their own rows.
export function listBusinessesIdNameSectorStageByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, name, sector, stage FROM businesses WHERE id IN (SELECT value FROM json_each(?))', params);
}
export function listBookingsIdStartsAtCancelledAtByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, starts_at, cancelled_at FROM bookings WHERE id IN (SELECT value FROM json_each(?))', params);
}

/*
 * Phase 161l2: THE STATEMENTS THAT WAITED IN THIS MODULE'S BORROWED FILE, AT HOME. Each read the client record's own
 * tables and joined the core's users (or, for the enquiry checks, a table that is now this module's: see
 * architecture/tables.json). Each now reads this module's rows with the user's id standing where the joined column stood,
 * and the core's fillUsers puts the user's column in its place: the same rows, in the same order, with the same keys,
 * NULL where the LEFT JOIN found no one (test/crm/borrowed-split-161l2.test.ts keeps each old statement and compares).
 * The statements that joined the claims' or the assessment's tables are split in the CRM (src/modules/crm/split-reads.ts)
 * or the claims (src/modules/claims/claim-row.ts), above this module; the rows of this module they need are here.
 */
// booking_changes
export function listBookingChangesAtFromStartsAtByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT c.at, c.from_starts_at, c.to_starts_at, c.changed_by AS who, c.cancelled FROM booking_changes c ' +
    'WHERE c.booking_id = ? ORDER BY c.at', params), { who: 'display_name' });
}
export function listBookingChangesFromStartsAtToStartsAtByBookingId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT c.from_starts_at, c.to_starts_at, c.changed_by AS changed_by_name, c.at, c.cancelled ' +
    'FROM booking_changes c WHERE c.booking_id = ? ORDER BY c.at ASC', params), { changed_by_name: 'display_name' });
}

// bookings
/** The booking's assigned member of staff, when that user is there, not disabled and not a client (was: JOIN users u ON u.id = b.assigned_to). */
export function getBookingsIdEmailByIdDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const b = db.get<{ assigned_to: unknown }>('SELECT b.assigned_to FROM bookings b WHERE b.id = ?', params);
  const u = b === undefined ? undefined : fillUser(db, { id: b.assigned_to, email: b.assigned_to, display_name: b.assigned_to, disabled_at: b.assigned_to, role: b.assigned_to },
    { email: 'email', display_name: 'display_name', disabled_at: 'disabled_at', role: 'role' });
  if (u === undefined || u.role === null || u.disabled_at !== null || u.role === 'CLIENT') return undefined;
  return { id: u.id, email: u.email, display_name: u.display_name } as Row as T;
}
export function listBookingsIdChannelByBusinessIdChannel<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>("SELECT b.id, b.channel, b.starts_at, b.ends_at, b.created_at, b.cancelled_at, b.assigned_to AS who FROM bookings b " +
    "WHERE b.business_id = ? AND b.channel IN ('video','phone') ORDER BY b.created_at, b.id", params), { who: 'display_name' });
}
/*
 * The calendar (src/modules/crm/assessments-and-calendar.ts), with the note it came with:
 * LEFT JOINS, AND THAT IS PART OF THE GATED-EXIT REPAIR. This was an inner join
 * onto `businesses`, so a booking with no organisation — a call asked for at the
 * reasoned negative (migration 011) — would have been recorded and then vanished
 * from the calendar's queue, invisible to the people who have to make the call.
 */
const BOOKING_SELECT =
  'SELECT k.id, k.business_id, k.lead_id, COALESCE(b.name, l.prospect_organisation) AS business_name, k.channel, ' +
  'k.sms_variant, k.entry_point, k.starts_at, k.ends_at, k.assigned_to, k.assigned_to AS assigned_name, ' +
  'k.created_at, k.cancelled_at, k.cancelled_by AS cancelled_by_name, k.cancelled_by AS cancelled_by_role ' +
  'FROM bookings k LEFT JOIN businesses b ON b.id = k.business_id ' +
  'LEFT JOIN leads l ON l.id = k.lead_id ';
function bookingRows<T extends Row>(db: Db, rows: T[]): T[] {
  return fillUsers(db, rows, { assigned_name: 'display_name', cancelled_by_name: 'display_name', cancelled_by_role: 'role' });
}
export function listBookingsScheduled<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return bookingRows(db, db.all<T>(BOOKING_SELECT + 'WHERE k.starts_at IS NOT NULL AND k.starts_at >= ? AND k.starts_at < ? ' +
    'ORDER BY k.starts_at ASC', params));
}
export function listBookingsWithNoTime<T extends Row = Row>(db: Db): T[] {
  return bookingRows(db, db.all<T>(BOOKING_SELECT + 'WHERE k.starts_at IS NULL AND k.cancelled_at IS NULL ORDER BY k.created_at ASC'));
}
export function listBookingsCancelled<T extends Row = Row>(db: Db): T[] {
  return bookingRows(db, db.all<T>(BOOKING_SELECT + 'WHERE k.cancelled_at IS NOT NULL ORDER BY k.cancelled_at DESC LIMIT 100'));
}
export function getBookingById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return bookingRows(db, db.all<T>(BOOKING_SELECT + 'WHERE k.id = ?', params))[0];
}

// businesses
export function getBusinessesIdNameById5<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT b.id, b.name, b.sector, b.stage, b.created_at, b.legal_name, b.company_number, b.claimant_type, b.registered_address, b.trading_address, b.website, b.client_status, b.source, b.owner_id, b.updated_at, b.owner_id AS owner_name FROM businesses b WHERE b.id = ?', params), { owner_name: 'display_name' });
}
export function listBusinessesIdName5<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT b.id, b.name, b.sector, b.stage, b.created_at, b.legal_name, b.company_number, b.claimant_type, b.registered_address, b.trading_address, b.website, b.client_status, b.source, b.owner_id, b.updated_at, b.owner_id AS owner_name FROM businesses b ORDER BY b.name ASC LIMIT ?', params), { owner_name: 'display_name' });
}

// call_logs
export function listCallLogsIdLoggedAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT k.id, k.logged_at, k.outcome, k.notes, k.contact_id, c.full_name AS contact, k.logged_by AS writer FROM call_logs k LEFT JOIN contacts c ON c.id = k.contact_id ' +
    'WHERE k.business_id = ? ORDER BY k.logged_at, k.id', params), { writer: 'display_name' });
}

// client_task_checks
export function getClientTaskChecksOutcomeWhoByTaskId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT k.outcome, k.checked_by AS who, k.checked_at, k.reason FROM client_task_checks k WHERE k.task_id = ?', params), { who: 'display_name' });
}

// enquiry_checks (this module's since Phase 161l2: architecture/tables.json; the public site never read or wrote them)
export function insertEnquiryChecks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO enquiry_checks (id, lead_id, claim_id, check_key, answer, note, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertEnquiryChecks2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO enquiry_checks (id, lead_id, claim_id, check_key, answer, note, recorded_by, recorded_at) ' +
    'VALUES (?, ?, NULL, ?, ?, NULL, ?, ?)', params);
}
export function listEnquiryChecksRecordedAtCheckKeyByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT e.recorded_at, e.check_key, e.answer, e.recorded_by AS who FROM enquiry_checks e WHERE e.claim_id = ? ORDER BY e.recorded_at', params), { who: 'display_name' });
}
export function listEnquiryChecksRecordedAtCheckKeyByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT e.recorded_at, e.check_key, e.answer, e.recorded_by AS who FROM enquiry_checks e WHERE e.lead_id = ? ORDER BY e.recorded_at', params), { who: 'display_name' });
}
export function listEnquiryChecksSeqCheckKeyByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT e.rowid AS seq, e.check_key, e.answer, e.note, e.recorded_at, e.recorded_by AS recorder FROM enquiry_checks e WHERE e.claim_id = ?', params), { recorder: 'display_name' });
}
export function listEnquiryChecksSeqCheckKeyByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT e.rowid AS seq, e.check_key, e.answer, e.note, e.recorded_at, e.recorded_by AS recorder FROM enquiry_checks e WHERE e.lead_id = ?', params), { recorder: 'display_name' });
}

// introducer_fees and introducer_percentage_entries: the claim's reference is the claims' (an inner JOIN on claims), so
// each row carries the claim's id where the reference stood, for the caller to put in place (withClaimRefs).
const FEE_SELECT = 'SELECT f.id, f.introducer_id, i.firm_name, f.claim_id, f.claim_id AS claim_ref, f.business_id, f.amount_pence, f.disclosure_given_at, ' +
  'f.disclosure_recorded_by AS discloser, f.state, f.paid_at, f.paid_recorded_by AS payer FROM introducer_fees f JOIN introducers i ON i.id = f.introducer_id ';
function feeRows<T extends Row>(db: Db, rows: T[]): T[] {
  return fillUsers(db, rows, { discloser: 'display_name', payer: 'display_name' });
}
export function getIntroducerFeesIdIntroducerIdByIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return feeRows(db, db.all<T>(FEE_SELECT + 'WHERE f.id = ?', params))[0];
}
export function listIntroducerFeesIdIntroducerIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return feeRows(db, db.all<T>(FEE_SELECT + 'ORDER BY f.created_at DESC, f.id ASC', params));
}
export function listIntroducerFeesIdIntroducerIdByIntroducerIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return feeRows(db, db.all<T>(FEE_SELECT + 'WHERE f.introducer_id = ? ORDER BY f.created_at DESC, f.id ASC', params));
}
const PERCENTAGE_SELECT = 'SELECT e.id, e.introducer_id, i.firm_name, e.claim_id, e.claim_id AS claim_ref, e.business_id, e.entry_kind, e.basis_pence, e.percent_bp, e.amount_pence, e.created_at ' +
  'FROM introducer_percentage_entries e JOIN introducers i ON i.id = e.introducer_id ';
export function listIntroducerPercentageEntriesIdIntroducerIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PERCENTAGE_SELECT + 'ORDER BY e.created_at DESC, e.rowid DESC', params);
}
export function listIntroducerPercentageEntriesIdIntroducerIdByIntroducerIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PERCENTAGE_SELECT + 'WHERE e.introducer_id = ? ORDER BY e.created_at DESC, e.rowid DESC', params);
}
/** Each row's claim_ref (holding the claim's id) as the claim's reference; a row whose claim is not found is left out (the inner JOIN). */
export function withClaimRefs<T extends Row>(rows: readonly T[], refs: ReadonlyMap<string, unknown>): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const id = r.claim_ref;
    if (typeof id !== 'string' || !refs.has(id)) continue;
    out.push({ ...r, claim_ref: refs.get(id) ?? null });
  }
  return out;
}

// introducer_reward_setting
export function getIntroducerRewardSettingModelFeePenceById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT s.model, s.fee_pence, s.percent_bp, s.changed_at, s.changed_by AS who FROM introducer_reward_setting s WHERE s.id = 1', params), { who: 'display_name' });
}

// introducer_share_consents
export function getIntroducerShareConsentsIdDecisionByIntroducerIdLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT s.id, s.decision, s.wording_version, s.recorded_at, s.recorded_by AS who FROM introducer_share_consents s ' +
    'WHERE s.introducer_id = ? AND (s.lead_id = ? OR s.business_id = ? ' +
    'OR s.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?)) ORDER BY s.rowid DESC LIMIT 1', params), { who: 'display_name' });
}

// introducers
const INTRODUCER_SELECT = 'SELECT i.id, i.firm_name, i.introducer_type, i.owner_id, i.relationship_started_on, i.notice_contact_id, i.notes, i.created_via, i.created_at, i.updated_at, ' +
  'i.owner_id AS owner_name, i.merged_into_id, m.firm_name AS merged_into_name, i.merged_at FROM introducers i LEFT JOIN introducers m ON m.id = i.merged_into_id ';
export function getIntroducersIdFirmNameById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>(INTRODUCER_SELECT + 'WHERE i.id = ?', params), { owner_name: 'display_name' });
}
export function listIntroducersIdFirmName2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>(INTRODUCER_SELECT + 'ORDER BY i.firm_name ASC, i.id ASC LIMIT ?', params), { owner_name: 'display_name' });
}

// staff_tasks
export function getStaffTasksIdTitleByClaimIdIsNextAction<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT t.id, t.title, t.owner_id, t.owner_role, t.owner_id AS owner_name, t.due_on FROM staff_tasks t ' +
    "WHERE t.claim_id = ? AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')", params), { owner_name: 'display_name' });
}
export function listStaffTasksIdTitleByIntroducerIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT t.id, t.title, t.description, t.activity_type, t.status, t.due_on, t.completed_at, t.cancelled_at, t.owner_id, ' +
    't.owner_role, t.owner_id AS owner, t.completed_by AS completer, c.full_name AS person FROM staff_tasks t ' +
    'LEFT JOIN contacts c ON c.id = t.contact_id ' +
    "WHERE t.introducer_id = ? ORDER BY t.status IN ('COMPLETED','CANCELLED'), t.due_on IS NULL, t.due_on ASC, " +
    't.completed_at DESC, t.created_at DESC', params), { owner: 'display_name', completer: 'display_name' });
}
const TASK_HISTORY_SELECT = 'SELECT t.id, t.title, t.activity_type, t.origin, t.status, t.owner_id, t.owner_role, t.business_id, t.claim_id, t.lead_id, t.created_at, t.started_at, ' +
  't.completed_at, t.cancelled_at, t.cancel_reason, t.created_by, t.completed_by, t.cancelled_by FROM staff_tasks t ';
function taskHistoryRows<T extends Row>(db: Db, rows: T[]): T[] {
  return fillUsers(db, rows, { created_by: 'display_name', completed_by: 'display_name', cancelled_by: 'display_name' });
}
export function listStaffTasksIdTitleByBusinessIdLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return taskHistoryRows(db, db.all<T>(TASK_HISTORY_SELECT + 'WHERE t.business_id = ? OR t.lead_id IN (SELECT l.id FROM leads l WHERE l.business_id = ?) ORDER BY t.created_at', params));
}
export function listStaffTasksIdTitleByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return taskHistoryRows(db, db.all<T>(TASK_HISTORY_SELECT + 'WHERE t.claim_id = ? ORDER BY t.created_at', params));
}
export function listStaffTasksIdTitleByLeadId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return taskHistoryRows(db, db.all<T>(TASK_HISTORY_SELECT + 'WHERE t.lead_id = ? ORDER BY t.created_at', params));
}
/** A property's tasks and its claims' (the claims' ids given as a JSON list: the claims are the claims', above this module). */
export function listStaffTasksIdTitleByPropertyIdClaimIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return taskHistoryRows(db, db.all<T>(TASK_HISTORY_SELECT + 'WHERE t.property_id = ? OR t.claim_id IN (SELECT value FROM json_each(?)) ORDER BY t.created_at', params));
}

// users who keep working times (was: users u JOIN working_times w, DISTINCT): the people are the core's
export function listUsersIdDisplayNameByDisabledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const ids = db.all<{ user_id: unknown }>('SELECT DISTINCT w.user_id FROM working_times w', params).map((r) => r.user_id);
  return listUsersIdDisplayNameByIdsDisabledAt<T>(db, [idsOf(ids)]);
}

// the do-not-contact check (src/modules/clients/do-not-contact.ts): a client login of an organisation marked do not
// contact (was: users u JOIN businesses b ON b.id = u.business_id); the logins are the core's
export function getUsersCountByClientStatusEmailCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const marked = db.all<{ id: unknown }>("SELECT b.id FROM businesses b WHERE b.client_status = 'DO_NOT_CONTACT'").map((r) => r.id);
  return getUsersCountByBusinessIdsEmailCanonical<T>(db, [idsOf(marked), params[0] ?? null]);
}

// search (the global search, src/modules/crm/search.ts): the fixed statements on this module's tables, moved with their
// notes. The properties and claims are the claims' (src/modules/crm/split-reads.ts puts them together).
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

const NOTES_ALL =
  'SELECT n.id, n.business_id, n.claim_id, n.property_id, substr(n.body, 1, 160) AS snippet, b.name AS business_name ' +
  'FROM internal_notes n JOIN businesses b ON b.id = n.business_id ' +
  "WHERE lower(n.body) LIKE ? ESCAPE '\\' ORDER BY n.created_at DESC, n.id ASC LIMIT 25";

/** The organisations whose trading name matches, for a claim found by its company's name (the claims' search). */
const ORGANISATION_NAMES =
  "SELECT b.id, b.name FROM businesses b WHERE lower(b.name) LIKE ? ESCAPE '\\'";
export function searchOrganisations<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(ORGANISATIONS_ALL, params);
}
export function searchProspects<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(PROSPECTS_ALL, params);
}
export function searchContacts<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(CONTACTS_ALL, params);
}
export function searchNotes<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(NOTES_ALL, params);
}
export function searchOrganisationNames<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(ORGANISATION_NAMES, params);
}
/** Every statement the search runs on this module's tables (src/modules/crm/search.ts statements(), for test/core/global-search.test.ts). */
export const CLIENT_SEARCH_STATEMENTS: readonly string[] = Object.freeze([ORGANISATIONS_ALL, PROSPECTS_ALL, CONTACTS_ALL, NOTES_ALL, ORGANISATION_NAMES]);

// Phase 161l2: the client record's half of the claims' lists (src/modules/claims/claim-row.ts, src/modules/crm/split-reads.ts).
/** The claims' next actions (one per claim at most: migration 012's unique index), by a list of claim ids. */
export function listStaffTasksNextActionByClaimIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT t.claim_id, t.title, t.due_on FROM staff_tasks t WHERE t.claim_id IN (SELECT value FROM json_each(?)) ' +
    "AND t.is_next_action = 1 AND t.status IN ('OPEN','IN_PROGRESS')", params);
}
/** The leads on the claims named (one per claim at most: leads_one_per_claim_uq), with the introducing firm's name. */
export function listLeadsClaimIdSourceIntroducerByClaimIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.claim_id, l.lead_date, l.source, l.introducer_id, i.firm_name FROM leads l LEFT JOIN introducers i ON i.id = l.introducer_id ' +
    'WHERE l.claim_id IN (SELECT value FROM json_each(?))', params);
}
export function listBusinessesIdNameSectorSourceByIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, name, sector, source FROM businesses WHERE id IN (SELECT value FROM json_each(?))', params);
}
/** The automation rules' runs, newest first, with the rule's label; the claim's id as recorded (the admin page nulls one that is not there). */
export function listAutomationRunsAtTriggerEventOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.at, r.trigger_event, r.outcome, r.reason, r.tasks_created, r.outbox_id, r.claim_id, r.lead_id, r.task_id, ' +
    'ar.label FROM automation_runs r JOIN automation_rules ar ON ar.id = r.rule_id ' +
    'ORDER BY r.at DESC, r.rowid DESC LIMIT ?', params);
}
/*
 * Phase 161l2: THE CLIENT RECORD'S HALF OF THE CRM'S STATEMENTS THAT JOINED THE CLAIMS OR THE ASSESSMENT (the whole
 * statement is put together in src/modules/crm/split-reads.ts, above both). Each is this module's rows, with the other
 * owner's id (or the user's) standing where each of its columns stood, every join on this module's own tables kept.
 */
// leads
export function getLeadsIdStatusByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.id AS lead_id, l.status AS lead_status FROM leads l WHERE l.assessment_id = ?', params);
}
export function getLeadsAssessmentIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.assessment_id FROM leads l WHERE l.id = ?', params);
}
export function getLeadsReferredOpenedByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT (SELECT COUNT(*) FROM leads WHERE introducer_id = ?) AS referred, ' +
    '(SELECT COUNT(*) FROM leads WHERE introducer_id = ? AND claim_id IS NOT NULL) AS opened', params);
}
export function getLeadsIntroducerIdClaimIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT l.introducer_id, l.claim_id FROM leads l WHERE l.claim_id = ? AND l.introducer_id IS NOT NULL', params);
}
export function listLeadsIdOrganisationByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, COALESCE(b.name, l.prospect_organisation) AS organisation, l.lead_date, l.status, l.claim_id, ' +
    'l.claim_id AS claim_ref, l.claim_id AS stage FROM leads l LEFT JOIN businesses b ON b.id = l.business_id ' +
    'WHERE l.introducer_id = ? ORDER BY l.lead_date DESC, l.id ASC', params);
}
/** The lead backfilled for an organisation (src/modules/crm/leads.ts backfillLeadFor): every column, as worked out by the CRM. */
export function insertLeadsBackfilled(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO leads (id, business_id, assessment_id, booking_id, claim_id, origin, source, introducer_id, ' +
    'prospect_organisation, prospect_sector, lead_date, owner_id, priority, next_action, next_action_due, status, ' +
    'lost_reason, lost_note, converted_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function getBusinessesIdSourceCreatedAtOwnerIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT b.id, b.source, b.created_at, b.owner_id FROM businesses b WHERE b.id = ?', params);
}
export function getBookingsFirstIdEntryPointByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT y.id, y.entry_point, y.created_at FROM bookings y WHERE y.business_id = ? ORDER BY y.created_at ASC, y.id ASC LIMIT 1', params);
}
/** A lead's page and the leads board: the lead, its organisation, its next action; the owner's and the claim's ids where their columns stood. */
const LEAD_ROW = 'SELECT l.id, l.business_id, l.assessment_id, l.booking_id, l.claim_id, l.origin, l.source, l.introducer_id, l.prospect_postcode, l.prospect_event, ' +
  'l.prospect_event_year, l.prospect_organisation, l.prospect_sector, l.lead_date, l.owner_id, l.priority, ' +
  "(SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, " +
  "(SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, " +
  'l.status, l.lost_reason, l.lost_note, l.converted_at, l.created_at, l.updated_at, b.name AS business_name, b.sector AS business_sector, ' +
  'l.owner_id AS owner_name, l.claim_id AS claim_ref FROM leads l LEFT JOIN businesses b ON b.id = l.business_id ';
export function getLeadRowByIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(LEAD_ROW + 'WHERE l.id = ?', params);
}
export function listLeadRowsOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(LEAD_ROW + 'ORDER BY l.lead_date DESC, l.id ASC LIMIT ?', params);
}
/** The leads list (src/modules/crm/claim-lists.ts): its lines, the owner's, claim's and assessment's ids where their columns stood. */
export function listLeadListLinesOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.id, l.business_id, l.assessment_id, l.origin, l.source, l.introducer_id, i.firm_name, l.prospect_organisation, ' +
    'l.prospect_sector, l.lead_date, l.owner_id, l.owner_id AS owner_name, l.priority, l.status, l.claim_id, l.claim_id AS claim_ref, ' +
    'b.name AS business_name, b.sector AS business_sector, ' +
    "(SELECT t.title FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') " +
    'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action, ' +
    "(SELECT t.due_on FROM staff_tasks t WHERE t.lead_id = l.id AND t.status IN ('OPEN','IN_PROGRESS') " +
    'ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC, t.id ASC LIMIT 1) AS next_action_due, ' +
    'l.assessment_id AS shown_low_pence, l.assessment_id AS shown_high_pence ' +
    'FROM leads l LEFT JOIN businesses b ON b.id = l.business_id ' +
    'LEFT JOIN introducers i ON i.id = l.introducer_id ORDER BY l.lead_date DESC, l.id ASC LIMIT 1000', params);
}

// staff_tasks
export function getStaffTasksIdBusinessIdByIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT t.id, t.business_id, t.property_id, t.claim_id, t.lead_id, t.owner_id, t.activity_type, t.claim_id AS claim_ref FROM staff_tasks t WHERE t.id = ?', params);
}
/** A task's whole row and every label it is shown with; the users', claim's and property's ids where their columns stood. */
const TASK_ROW = 'SELECT t.id, t.title, t.description, t.owner_id, t.owner_role, t.due_on, t.priority, t.status, t.activity_type, t.business_id, t.property_id, t.claim_id, ' +
  't.lead_id, t.contact_id, t.fact_id, t.recurrence, t.recurred_from_id, t.is_next_action, t.origin, t.automation_run_id, t.created_by, t.created_at, t.updated_at, ' +
  't.started_at, t.completed_at, t.completed_by, t.cancelled_at, t.cancelled_by, t.cancel_reason, t.introducer_id, t.company_subject, t.owner_id AS owner_name, ' +
  't.created_by AS created_by_name, t.completed_by AS completed_by_name, t.cancelled_by AS cancelled_by_name, t.claim_id AS claim_ref, b.name AS business_name, ' +
  'COALESCE(lb.name, l.prospect_organisation) AS lead_label, ct.full_name AS contact_label, t.property_id AS property_label, ar.label AS rule_label, ' +
  '(SELECT i.firm_name FROM introducers i WHERE i.id = t.introducer_id) AS introducer_label FROM staff_tasks t ' +
  'LEFT JOIN businesses b ON b.id = t.business_id LEFT JOIN leads l ON l.id = t.lead_id LEFT JOIN businesses lb ON lb.id = l.business_id ' +
  'LEFT JOIN contacts ct ON ct.id = t.contact_id LEFT JOIN automation_runs run ON run.id = t.automation_run_id LEFT JOIN automation_rules ar ON ar.id = run.rule_id ';
export function getTaskRowByIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(TASK_ROW + 'WHERE t.id = ?', params);
}
export function listTaskRowsByClaimIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(TASK_ROW + "WHERE t.claim_id = ? ORDER BY CASE WHEN t.status IN ('OPEN','IN_PROGRESS') THEN 0 ELSE 1 END, t.due_on IS NULL, t.due_on ASC, t.created_at DESC", params);
}
export function listTaskRowsOpenByOwnerOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(TASK_ROW + "WHERE t.status IN ('OPEN','IN_PROGRESS') AND (t.owner_id = ? OR (t.owner_id IS NULL AND t.owner_role = ?)) ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC", params);
}
export function listTaskRowsOpenDueByOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(TASK_ROW + "WHERE t.status IN ('OPEN','IN_PROGRESS') AND t.due_on IS NOT NULL AND t.due_on <= ? ORDER BY t.due_on ASC, t.created_at ASC LIMIT ?", params);
}
export function listTaskRowsOpenOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(TASK_ROW + "WHERE t.status IN ('OPEN','IN_PROGRESS') ORDER BY t.due_on IS NULL, t.due_on ASC, t.created_at ASC LIMIT ?", params);
}

// client_messages
const MESSAGE_ROW = 'SELECT m.id, m.business_id, m.claim_id, m.direction, m.source, m.author_id, m.created_at, m.body, m.author_id AS author, m.author_id AS author_role, ' +
  'ct.full_name AS contact, m.claim_id AS claim_ref, m.claim_id AS claim_property FROM client_messages m LEFT JOIN contacts ct ON ct.id = m.contact_id ';
export function getClientMessagesIdBusinessIdByIdBusinessIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>(MESSAGE_ROW + 'WHERE m.id = ? AND m.business_id = ?', params);
}
export function listClientMessagesIdBusinessIdByBusinessIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(MESSAGE_ROW + 'WHERE m.business_id = ? ORDER BY m.created_at ASC, m.rowid ASC', params);
}
const MESSAGE_LINE = 'SELECT m.created_at, m.direction, m.source, m.author_id AS who, ct.full_name AS contact, m.claim_id AS claim_ref, ' +
  '(SELECT COUNT(*) FROM client_message_files f WHERE f.message_id = m.id) AS files FROM client_messages m LEFT JOIN contacts ct ON ct.id = m.contact_id ';
export function listClientMessageLinesByBusinessIdClaimIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(MESSAGE_LINE + 'WHERE m.business_id = ? AND (m.claim_id = ? OR m.claim_id IS NULL) ORDER BY m.created_at', params);
}
export function listClientMessageLinesByBusinessIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(MESSAGE_LINE + 'WHERE m.business_id = ? ORDER BY m.created_at', params);
}

// internal_notes
export function listInternalNotesIdAuthorIdByBusinessIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT n.id, n.author_id, n.created_at, n.body, n.author_id AS who, n.claim_id AS claim_ref, n.claim_id AS claim_property, n.property_id AS property_label ' +
    'FROM internal_notes n WHERE n.business_id = ? ORDER BY n.created_at ASC, n.rowid ASC', params);
}
/** The timeline's notes, with their organisation's name (__company) for naming a claim's property in its frame. */
const NOTE_LINE = 'SELECT n.created_at, n.body, n.author_id AS who, n.claim_id AS claim_ref, n.claim_id AS claim_property, n.property_id AS property_label, nb.name AS __company ' +
  'FROM internal_notes n JOIN businesses nb ON nb.id = n.business_id ';
export function listNoteLinesByBusinessIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(NOTE_LINE + 'WHERE n.business_id = ? ORDER BY n.created_at DESC', params);
}
export function listNoteLinesByBusinessIdClaimIdOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(NOTE_LINE + 'WHERE n.business_id = ? AND (n.claim_id = ? OR (n.claim_id IS NULL AND n.property_id IS NULL)) ORDER BY n.created_at DESC', params);
}
/** A property's notes and its claims' (the claims' ids given as a JSON list). */
export function listNoteLinesByPropertyIdClaimIdsOwn<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>(NOTE_LINE + 'WHERE n.property_id = ? OR n.claim_id IN (SELECT value FROM json_each(?)) ORDER BY n.created_at DESC', params);
}
