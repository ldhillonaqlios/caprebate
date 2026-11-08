/**
 * THE OUTSIDE SERVICES' DATA FILE. The only file that runs
 * SQL on the tables architecture/tables.json gives the outside services: the outbox and the mailbox, the register
 * records and research runs, WhatsApp and video meetings. Every other file asks through these functions, from another
 * area through the outside services' front door. Each statement is the one its caller ran before, text unchanged.
 */
import type { Db, Param, Row } from '../core/index.ts';

// email_bounces
export function insertEmailBounces(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO email_bounces (id, outbox_id, kind, source, status, at) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// email_suppressions
export function getEmailSuppressionsStateByAddressCanonical<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT state FROM email_suppressions WHERE address_canonical = ? ORDER BY at DESC, rowid DESC LIMIT 1', params);
}
export function insertEmailSuppressions(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO email_suppressions (id, address_canonical, state, bounce_id, set_by, at) VALUES (?, ?, ?, ?, NULL, ?)', params);
}
export function insertEmailSuppressions2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO email_suppressions (id, address_canonical, state, bounce_id, set_by, at) VALUES (?, ?, ?, NULL, ?, ?)', params);
}
export function listEmailSuppressionsAddressAtByStateId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT s.address_canonical AS address, s.at AS at, b.status AS status, o.subject AS subject ' +
    'FROM email_suppressions s ' +
    'LEFT JOIN email_bounces b ON b.id = s.bounce_id ' +
    'LEFT JOIN outbox o ON o.id = b.outbox_id ' +
    'WHERE s.state = ? AND s.id = (SELECT id FROM email_suppressions x ' +
    'WHERE x.address_canonical = s.address_canonical ORDER BY x.at DESC, x.rowid DESC LIMIT 1) ' +
    'ORDER BY s.at DESC', params);
}

// inbound_bounce_notices
export function getInboundBounceNoticesIdByMailboxUid<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM inbound_bounce_notices WHERE mailbox_uid = ?', params);
}
export function insertInboundBounceNotices(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO inbound_bounce_notices (id, mailbox_uid, received_at, matched_outbox_id, bounce_id) VALUES (?, ?, ?, ?, ?)', params);
}

// inbound_email
export function deleteInboundEmailById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM inbound_email WHERE id = ?', params);
}
export function getInboundEmailIdByMailboxUid<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM inbound_email WHERE mailbox_uid = ?', params);
}
export function getInboundEmailIdFromAddressByIdOutcome<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id, from_address, text_body FROM inbound_email WHERE id = ? AND outcome = 'QUEUED' " +
    'AND NOT EXISTS (SELECT 1 FROM inbound_email_filings g WHERE g.inbound_email_id = inbound_email.id)', params);
}
export function getInboundEmailN<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(n) AS n FROM (SELECT MAX(CAST(mailbox_uid AS INTEGER)) AS n FROM inbound_email ' +
    'UNION ALL SELECT MAX(CAST(mailbox_uid AS INTEGER)) FROM inbound_bounce_notices)', params);
}
export function getInboundEmailXByMailboxUid<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM inbound_email WHERE mailbox_uid = ?', params);
}
export function insertInboundEmail(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO inbound_email (id, received_at, mailbox_uid, message_id, from_address, subject, text_body, matched_outbox_id, business_id, claim_id, ' +
    'contact_id, outcome, queue_reason, client_message_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listInboundEmailIdByClientMessageId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id FROM inbound_email WHERE client_message_id = ? UNION SELECT inbound_email_id AS id FROM inbound_email_filings WHERE client_message_id = ?', params);
}
export function listInboundEmailIdFromAddressByOutcomeBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.id, e.from_address, e.text_body, o.id AS outbox_id, o.business_id, o.claim_id, o.to_email, e.received_at FROM inbound_email e ' +
    "JOIN outbox o ON o.id = e.matched_outbox_id WHERE e.outcome = 'QUEUED' AND o.business_id IS NOT NULL " +
    'AND NOT EXISTS (SELECT 1 FROM inbound_email_filings g WHERE g.inbound_email_id = e.id) ORDER BY e.received_at, e.id', params);
}
export function listInboundEmailIdReceivedAtByOutcomeInboundEmailId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, received_at FROM inbound_email WHERE outcome = 'QUEUED' AND NOT EXISTS (SELECT 1 FROM inbound_email_filings g WHERE g.inbound_email_id = inbound_email.id)", params);
}

// inbound_email_file_saves
export function deleteInboundEmailFileSavesByInboundEmailFileIdInboundEmailI(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM inbound_email_file_saves WHERE inbound_email_file_id IN (SELECT id FROM inbound_email_files WHERE inbound_email_id = ?)', params);
}
export function getInboundEmailFileSavesIdByInboundEmailFileId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM inbound_email_file_saves WHERE inbound_email_file_id = ?', params);
}
export function insertInboundEmailFileSaves(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO inbound_email_file_saves (id, inbound_email_file_id, logical_document_id, saved_by, saved_at) VALUES (?, ?, ?, ?, ?)', params);
}

// inbound_email_files
export function deleteInboundEmailFilesByInboundEmailId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM inbound_email_files WHERE inbound_email_id = ?', params);
}
export function getInboundEmailFilesIdPartNoById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT f.id, f.part_no, e.mailbox_uid AS uid, COALESCE(e.client_message_id, g.client_message_id) AS message, ' +
    'COALESCE(e.business_id, g.business_id) AS business_id, e.claim_id FROM inbound_email_files f ' +
    'JOIN inbound_email e ON e.id = f.inbound_email_id LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id WHERE f.id = ?', params);
}
export function insertInboundEmailFiles(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO inbound_email_files (id, inbound_email_id, part_no, content_type, size_bytes) VALUES (?, ?, ?, ?, ?)', params);
}
export function listInboundEmailFilesIdPartNoByClientMessageId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT f.id, f.part_no, f.content_type, f.size_bytes FROM inbound_email_files f JOIN inbound_email e ON e.id = f.inbound_email_id ' +
    'LEFT JOIN inbound_email_filings g ON g.inbound_email_id = e.id ' +
    'WHERE (e.client_message_id = ? OR g.client_message_id = ?) AND NOT EXISTS (SELECT 1 FROM inbound_email_file_saves s WHERE s.inbound_email_file_id = f.id) ' +
    'ORDER BY f.part_no', params);
}
export function listInboundEmailFilesIdReceivedAtByInboundEmailIdOutcome<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.id, e.received_at, e.from_address, e.subject, e.text_body, e.queue_reason, ' +
    '(SELECT COUNT(*) FROM inbound_email_files f WHERE f.inbound_email_id = e.id) AS files FROM inbound_email e ' +
    "WHERE e.outcome = 'QUEUED' AND NOT EXISTS (SELECT 1 FROM inbound_email_filings g WHERE g.inbound_email_id = e.id) " +
    'ORDER BY e.received_at ASC', params);
}

// inbound_email_filings
export function deleteInboundEmailFilingsByInboundEmailId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM inbound_email_filings WHERE inbound_email_id = ?', params);
}
export function insertInboundEmailFilings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO inbound_email_filings (id, inbound_email_id, business_id, claim_id, client_message_id, filed_by, filed_at) VALUES (?, ?, ?, NULL, ?, ?, ?)', params);
}
export function insertInboundEmailFilings2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO inbound_email_filings (id, inbound_email_id, business_id, claim_id, client_message_id, filed_by, rule, filed_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)', params);
}

// mailbox_reads
export function getMailboxReadsAtFailedById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT last_try_at AS at, last_failed AS failed FROM mailbox_reads WHERE id = 1', params);
}
export function getMailboxReadsLastOkAtLastFailedById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT last_ok_at, last_failed FROM mailbox_reads WHERE id = 1', params);
}
export function insertMailboxReads(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO mailbox_reads (id, last_try_at, last_ok_at, last_failed) VALUES (1, ?, ?, ?) ' +
    'ON CONFLICT(id) DO UPDATE SET last_try_at = excluded.last_try_at, last_failed = excluded.last_failed, ' +
    'last_ok_at = COALESCE(excluded.last_ok_at, mailbox_reads.last_ok_at)', params);
}

// mailbox_watermark
export function getMailboxWatermarkUidById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT uid FROM mailbox_watermark WHERE id = 1', params);
}
export function insertMailboxWatermark(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO mailbox_watermark (id, uid, set_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING', params);
}
export function insertMailboxWatermarkByUid(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO mailbox_watermark (id, uid, set_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET uid = excluded.uid, set_at = excluded.set_at WHERE excluded.uid > mailbox_watermark.uid', params);
}

// outbox
export function getOutboxAtBySentAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT max(sent_at) AS at FROM outbox WHERE sent_at IS NOT NULL', params);
}
export function getOutboxAtBySentAt2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(sent_at) AS at FROM outbox WHERE sent_at IS NOT NULL AND lower(to_email) = lower(?)', params);
}
export function getOutboxCOALESCEThreadKeyKById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COALESCE(thread_key, id) AS k FROM outbox WHERE id = ?', params);
}
export function getOutboxIdBusinessIdByProviderRefSentAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, claim_id, to_email FROM outbox WHERE provider_ref = ? AND sent_at IS NOT NULL', params);
}
export function getOutboxIdByProviderRefSentAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM outbox WHERE provider_ref = ? AND sent_at IS NOT NULL', params);
}
export function getOutboxRById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT send_requested AS r FROM outbox WHERE id = ?', params);
}
export function getOutboxToEmailById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT to_email FROM outbox WHERE id = ?', params);
}
export function insertOutbox(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO outbox (id, created_at, to_email, subject, body, kind, sent_at, transport, business_id, from_header, reply_to, ' +
    'claim_id, lead_id, contact_id, written_by, send_requested, thread_key, in_reply_to, references_ids) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listOutboxCreatedAtToEmailByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT created_at, to_email, subject, body, sent_at, kind FROM outbox WHERE business_id = ? ORDER BY created_at', params);
}
export function listOutboxCreatedAtToEmailByOutboxId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT o.created_at, o.to_email, o.subject, o.kind, o.sent_at, o.business_id, ' +
    'b.kind AS bounce_kind, b.status AS bounce_status FROM outbox o ' +
    'LEFT JOIN email_bounces b ON b.id = (SELECT id FROM email_bounces x WHERE x.outbox_id = o.id ' +
    'ORDER BY x.at DESC, x.rowid DESC LIMIT 1) ORDER BY o.created_at DESC LIMIT 20', params);
}
export function listOutboxIdCreatedAtByBusinessIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, created_at, to_email, subject, sent_at, send_requested, last_error, claim_id FROM outbox WHERE business_id = ? AND kind IN ('FREE_TYPED','TEMPLATE') ORDER BY created_at DESC LIMIT 20", params);
}
export function listOutboxIdCreatedAtByLeadIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, created_at, to_email, subject, sent_at, send_requested, last_error, claim_id FROM outbox WHERE lead_id = ? AND kind IN ('FREE_TYPED','TEMPLATE') ORDER BY created_at DESC LIMIT 20", params);
}
export function listOutboxIdToEmailBySendRequestedSentAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, to_email FROM outbox WHERE send_requested = 1 AND sent_at IS NULL AND created_at >= ? AND created_at < ? ' +
    'AND (last_error IS NULL OR last_error = ? OR (last_error = ? AND created_at < ?)) ORDER BY created_at LIMIT ?', params);
}
export function listOutboxIdToEmailBySendRequestedSentAt2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, to_email FROM outbox WHERE send_requested = 1 AND sent_at IS NULL AND last_error IS NULL AND created_at >= ? ORDER BY created_at', params);
}
export function listOutboxIdToEmailBySentAtSendRequested<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, to_email, subject, body, business_id, from_header, reply_to, in_reply_to, references_ids FROM outbox WHERE sent_at IS NULL AND send_requested = 1 AND id = ?', params);
}
export function listOutboxIdToEmailBySentAtSendRequested2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, to_email, subject, body, business_id, from_header, reply_to, in_reply_to, references_ids FROM outbox WHERE sent_at IS NULL AND send_requested = 1 ORDER BY created_at', params);
}
export function updateOutboxBodyByIdSentAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE outbox SET body = ? WHERE id = ? AND sent_at IS NOT NULL AND kind IN ('SIGN_IN_CODE', 'PASSWORD_RESET', 'ACCOUNT_VERIFY', 'REPORT_FOR_SIGNOFF') AND body <> ?", params);
}
export function updateOutboxLastErrorById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE outbox SET last_error = ? WHERE id = ?', params);
}
export function updateOutboxLastErrorByIdLastError(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE outbox SET last_error = ? WHERE id = ? AND last_error = ?', params);
}
export function updateOutboxLastErrorByIdLastError2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE outbox SET last_error = ? WHERE id = ? AND last_error = 'Being sent.'", params);
}
export function updateOutboxLastErrorByIdLastError3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE outbox SET last_error = ? WHERE id = ? AND last_error IS NULL', params);
}
export function updateOutboxLastErrorByIdLastError4(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE outbox SET last_error = ? WHERE id = ? AND last_error IS NULL AND sent_at IS NULL', params);
}
export function updateOutboxLastErrorByIdSentAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE outbox SET last_error = ? WHERE id = ? AND sent_at IS NULL', params);
}
export function updateOutboxLastErrorByIdSentAt2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE outbox SET last_error = ? WHERE id = ? AND sent_at IS NULL AND (last_error IS NULL OR last_error = ? OR (last_error = ? AND created_at < ?))', params);
}
export function updateOutboxSentAtTransportById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE outbox SET sent_at = ?, transport = ?, provider_ref = ?, last_error = NULL WHERE id = ?', params);
}

// outbox_attachments
export function getOutboxAttachmentsCountByOutboxId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM outbox_attachments WHERE outbox_id = ?', params);
}
export function insertOutboxAttachments(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO outbox_attachments (id, outbox_id, logical_document_id, document_id) VALUES (?, ?, ?, ?)', params);
}
export function listOutboxAttachmentsDocumentIdByOutboxId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT document_id FROM outbox_attachments WHERE outbox_id = ?', params);
}

// outbox_inline_files
export function insertOutboxInlineFiles(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO outbox_inline_files (id, outbox_id, part_no, filename, content_type, bytes, sha256) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listOutboxInlineFilesFilenameContentTypeByOutboxId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT filename, content_type, bytes FROM outbox_inline_files WHERE outbox_id = ? ORDER BY part_no', params);
}

// register_file_imports
export function getRegisterFileImportsAtBySourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(imported_at) AS at FROM register_file_imports WHERE source_id = ?', params);
}
export function insertRegisterFileImports(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO register_file_imports (source_id, file_name, imported_at, rows_kept, rows_skipped, by_user) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// register_file_rows
export function deleteRegisterFileRowsBySourceId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM register_file_rows WHERE source_id = ?', params);
}
export function getRegisterFileRowsCountBySourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM register_file_rows WHERE source_id = ?', params);
}
export function insertRegisterFileRows(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO register_file_rows (source_id, ref, postcode_key, address, fields, imported_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listRegisterFileRowsRefAddressBySourceIdPostcodeKey<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT ref, address, postcode_key, fields FROM register_file_rows WHERE source_id = ? AND postcode_key = ? ORDER BY ref', params);
}

// register_match_picks
export function deleteRegisterMatchPicksByBusinessIdSourceId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM register_match_picks WHERE business_id = ? AND source_id = ? AND taken_back_at IS NULL', params);
}
export function getRegisterMatchPicksChosenKeyReasonByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT chosen_key, taken_back_reason AS reason, taken_back_at FROM register_match_picks ' +
    'WHERE business_id = ? AND source_id = ? AND taken_back_at IS NOT NULL ORDER BY taken_back_at DESC, rowid DESC LIMIT 1', params);
}
export function getRegisterMatchPicksChosenKeyScoreByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT chosen_key, score, grade, picked_at, picked_by FROM register_match_picks ' +
    'WHERE business_id = ? AND source_id = ? AND taken_back_at IS NULL', params);
}
export function getRegisterMatchPicksIdChosenKeyByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, chosen_key, record_id, picked_at FROM register_match_picks WHERE business_id = ? AND source_id = ? AND taken_back_at IS NULL', params);
}
export function insertRegisterMatchPicks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO register_match_picks (id, business_id, source_id, chosen_key, score, grade, record_id, picked_by, picked_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listRegisterMatchPicksChosenKeyTakenBackAtByBusinessIdSource<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT chosen_key, taken_back_at, taken_back_by, taken_back_reason AS reason, removed_record_id, look_again_json FROM register_match_picks ' +
    'WHERE business_id = ? AND source_id = ? AND taken_back_at IS NOT NULL ORDER BY taken_back_at DESC, rowid DESC', params);
}
export function listRegisterMatchPicksSourceIdByBusinessIdTakenBackAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT source_id FROM register_match_picks WHERE business_id = ? AND taken_back_at IS NULL ' +
    'AND chosen_key IS NOT NULL AND record_id IS NOT NULL', params);
}
export function listRegisterMatchPicksSourceIdTakenBackAtByBusinessIdTakenBa<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT source_id, taken_back_at, taken_back_reason, look_again_json FROM register_match_picks ' +
    'WHERE business_id = ? AND taken_back_at IS NOT NULL ORDER BY taken_back_at ASC, rowid ASC', params);
}
export function updateRegisterMatchPicksRecordIdRemovedRecordIdById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE register_match_picks SET record_id = NULL, removed_record_id = ?, taken_back_at = ?, taken_back_by = ?, ' +
    'taken_back_reason = ?, look_again_json = ? WHERE id = ?', params);
}

// register_records
export function deleteRegisterRecordsByIdBusinessId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('DELETE FROM register_records WHERE id = ? AND business_id = ?', params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = ? AND (property_id = ? OR ? IS NULL) ORDER BY obtained_at DESC LIMIT 1', params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId10<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HOMEDATA_ADDRESS' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1", params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId11<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HOMEDATA_BOUNDARY' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1", params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = ? AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1', params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = ? ORDER BY obtained_at DESC, rowid DESC LIMIT 1', params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'CH_COMPANY' " +
    'ORDER BY obtained_at DESC LIMIT 1', params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId5<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'EPC' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1", params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId6<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HMLR_INSPIRE' AND entity_id = ?", params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId7<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HMLR_PPD' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1", params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId8<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HMLR_TITLE' AND property_id = ? ORDER BY obtained_at DESC LIMIT 1", params);
}
export function getRegisterRecordsFieldsJsonByBusinessIdSourceId9<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json FROM register_records WHERE business_id = ? AND source_id = 'HMLR_TITLE' AND property_id = ? ORDER BY obtained_at DESC, id DESC LIMIT 1", params);
}
export function getRegisterRecordsFieldsJsonById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT fields_json FROM register_records WHERE id = ?', params);
}
export function getRegisterRecordsFieldsJsonByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT fields_json FROM register_records WHERE id = ? AND business_id = ?', params);
}
export function getRegisterRecordsFieldsJsonObtainedAtByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT fields_json, obtained_at FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?', params);
}
export function getRegisterRecordsFieldsJsonObtainedAtByBusinessIdSourceId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT fields_json, obtained_at FROM register_records WHERE business_id = ? AND source_id = ? AND property_id = ? ' +
    'ORDER BY obtained_at DESC, id DESC LIMIT 1', params);
}
export function getRegisterRecordsFieldsJsonObtainedAtByBusinessIdSourceId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json, obtained_at FROM register_records WHERE business_id = ? AND source_id = 'CH_COMPANY' ORDER BY obtained_at DESC, id DESC LIMIT 1", params);
}
export function getRegisterRecordsFieldsJsonObtainedAtByBusinessIdSourceId4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT fields_json, obtained_at FROM register_records WHERE business_id = ? AND source_id = 'HMLR_TITLE' AND property_id = ? ORDER BY obtained_at DESC LIMIT 1", params);
}
export function getRegisterRecordsIdByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?', params);
}
export function getRegisterRecordsIdFieldsJsonByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, fields_json FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id = ?', params);
}
export function getRegisterRecordsIdSourceIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, source_id, obtained_at, property_id FROM register_records WHERE id = ? AND business_id = ?', params);
}
export function getRegisterRecordsObtainedAtByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT obtained_at FROM register_records WHERE business_id = ? AND source_id = ? AND entity_id LIKE 'by-hand:%' ORDER BY obtained_at DESC LIMIT 1", params);
}
export function insertRegisterRecords(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO register_records (id, business_id, source_id, entity_id, fields_json, obtained_at, property_id) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}
export function listRegisterRecordsFieldsJsonBySourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT fields_json FROM register_records WHERE source_id = 'HOMEDATA_ADDRESS'", params);
}
export function listRegisterRecordsFieldsJsonPropertyIdByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT fields_json, property_id FROM register_records WHERE business_id = ? AND source_id = ? ORDER BY obtained_at DESC', params);
}
export function listRegisterRecordsFieldsJsonPropertyIdByBusinessIdSourceId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT fields_json, property_id, obtained_at FROM register_records WHERE business_id = ? AND source_id = 'EPC' ORDER BY obtained_at DESC", params);
}
export function listRegisterRecordsIdSourceIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, source_id, entity_id, fields_json, obtained_at, property_id FROM register_records WHERE business_id = ? ORDER BY obtained_at ASC, id ASC', params);
}
export function listRegisterRecordsSourceIdEntityIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT source_id, entity_id, fields_json FROM register_records WHERE business_id = ? ORDER BY source_id ASC', params);
}
export function listRegisterRecordsSourceIdEntityIdByBusinessIdPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT source_id, entity_id, fields_json, obtained_at FROM register_records WHERE business_id = ? ' +
    'AND (property_id IS NULL OR property_id = ? OR ? IS NULL) ORDER BY obtained_at DESC, rowid DESC', params);
}
export function listRegisterRecordsSourceIdFieldsJsonByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT source_id, fields_json FROM register_records WHERE business_id = ? ORDER BY obtained_at ASC, id ASC', params);
}
export function listRegisterRecordsSourceIdFieldsJsonByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT source_id, fields_json, property_id FROM register_records WHERE business_id = ? AND source_id IN ('EPC', 'HOMEDATA_ADDRESS') ORDER BY obtained_at DESC", params);
}
export function updateRegisterRecordsFieldsJsonByIdBusinessId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE register_records SET fields_json = ? WHERE id = ? AND business_id = ?', params);
}

// research_runs
export function getResearchRunsCostPenceAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT cost_pence, at FROM research_runs WHERE business_id = ? ORDER BY at DESC, rowid DESC LIMIT 1', params);
}
export function getResearchRunsCountByBusinessIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM research_runs WHERE business_id = ? AND kind = ? AND at >= ?', params);
}
export function insertResearchRuns(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, ' +
    'not_permitted, failed, kind, source_id, cost_pence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)', params);
}
export function insertResearchRuns2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO research_runs (id, business_id, actor_id, at, considered, fired, ' +
    'not_permitted, failed, kind, source_id, cost_pence) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)', params);
}

// research_sources
export function getResearchSourcesCountByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM research_sources WHERE business_id = ? AND source_id = 'PLANNING' AND route = 'HOMEDATA_PLANNING'", params);
}
export function getResearchSourcesCountByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM research_sources WHERE business_id = ? AND state = ?', params);
}
export function getResearchSourcesCountByBusinessIdState2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM research_sources WHERE business_id = ? AND state = 'FIRED'", params);
}
export function getResearchSourcesIdAttemptsByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, attempts FROM research_sources WHERE business_id = ? AND source_id = ?', params);
}
export function getResearchSourcesIdStateByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id, state, retrieved_at, fired_at FROM research_sources WHERE business_id = ? AND source_id = 'CH_PSC'", params);
}
export function getResearchSourcesStateFailureCodeByBusinessIdSourceId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT state, failure_code FROM research_sources WHERE business_id = ? AND source_id = ?', params);
}
export function insertResearchSources(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO research_sources (id, business_id, source_id, tier, state, fired_at, detail, ' +
    'publisher, licence_id, retrieved_at, failure_code, attempts, route) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listResearchSourcesSourceIdStateByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT source_id, state, fired_at, retrieved_at, attempts, failure_code, detail, route ' +
    'FROM research_sources WHERE business_id = ?', params);
}
export function updateResearchSourcesDetailByBusinessIdSourceId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE research_sources SET detail = ? WHERE business_id = ? AND source_id = ?', params);
}
export function updateResearchSourcesStateFailureCodeByBusinessIdSourceId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE research_sources SET state = 'FAILED', failure_code = ?, retrieved_at = NULL, detail = ? WHERE business_id = ? AND source_id = ?", params);
}

// video_meetings
export function getVideoMeetingsCallMinutesCallPeopleByBookingIdCancelledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT call_minutes, call_people, call_check_state, call_checked_at FROM video_meetings WHERE booking_id = ? AND cancelled_at IS NULL', params);
}
export function getVideoMeetingsIdBookingIdByBookingIdCancelledAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, booking_id, meeting_id, join_url, passcode, client_token, created_at, host_user_id FROM video_meetings WHERE booking_id = ? AND cancelled_at IS NULL', params);
}
export function insertVideoMeetings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO video_meetings (id, booking_id, provider, meeting_id, join_url, passcode, client_token, created_at, host_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateVideoMeetingsCallCheckStateCallCheckedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE video_meetings SET call_check_state = CASE WHEN call_minutes IS NULL THEN ? ELSE 'FOUND' END, call_checked_at = ? WHERE id = ?", params);
}
export function updateVideoMeetingsCallMinutesCallPeopleById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE video_meetings SET call_minutes = ?, call_people = ?, call_check_state = ?, call_checked_at = ? WHERE id = ?', params);
}
export function updateVideoMeetingsCancelledAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE video_meetings SET cancelled_at = ? WHERE id = ?', params);
}
export function updateVideoMeetingsHostOpenedAtHostOpenedByByIdHostOpenedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE video_meetings SET host_opened_at = ?, host_opened_by = ? WHERE id = ? AND host_opened_at IS NULL', params);
}

// whatsapp_import_lines
export function getWhatsappImportLinesExistsByFingerprint<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 FROM whatsapp_import_lines WHERE fingerprint = ?', params);
}
export function insertWhatsappImportLines(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO whatsapp_import_lines (message_id, import_id, contact_id, sender, attachment, fingerprint) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listWhatsappImportLinesAttachmentByImportIdAttachment<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.attachment FROM whatsapp_import_lines l LEFT JOIN whatsapp_media m ON m.message_id = l.message_id ' +
    'WHERE l.import_id = ? AND l.attachment IS NOT NULL AND m.message_id IS NULL ORDER BY l.attachment', params);
}
export function listWhatsappImportLinesMessageIdByImportIdAttachment<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT l.message_id FROM whatsapp_import_lines l LEFT JOIN whatsapp_media m ON m.message_id = l.message_id ' +
    'WHERE l.import_id = ? AND l.attachment = ? AND m.message_id IS NULL', params);
}
export function listWhatsappImportLinesPhoneLastAtByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT phone, max(created_at) AS last_at, min(id) AS first_id, sum(CASE WHEN direction = 'IN' AND created_at > ? AND id NOT IN (SELECT message_id FROM whatsapp_import_lines) THEN 1 ELSE 0 END) AS unread " +
    'FROM whatsapp_messages WHERE business_id = ? GROUP BY phone', params);
}

// whatsapp_imports
export function getWhatsappImportsByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM whatsapp_imports WHERE id = ? AND business_id = ?', params);
}
export function insertWhatsappImports(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO whatsapp_imports (id, business_id, contact_id, phone, status, filename, layout, chat_key, zip_key, file_names, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function updateWhatsappImportsStatusById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE whatsapp_imports SET status = 'CANCELLED' WHERE id = ?", params);
}
export function updateWhatsappImportsStatusUsNameById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE whatsapp_imports SET status = 'SAVED', us_name = ?, from_date = ?, saved_by = ?, saved_at = ?, added = ? WHERE id = ?", params);
}

// whatsapp_media
export function getWhatsappMediaMediaIdByMessageId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT media_id FROM whatsapp_media WHERE message_id = ?', params);
}
export function getWhatsappMediaMessageIdBusinessIdByMessageId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT m.message_id, w.business_id, m.media_type, m.mime, m.filename, m.object_key, m.bytes, m.fetched_at FROM whatsapp_media m ' +
    'JOIN whatsapp_messages w ON w.id = m.message_id WHERE m.message_id = ?', params);
}
export function insertWhatsappMedia(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO whatsapp_media (message_id, media_id, media_type, mime, sha256, filename, object_key, bytes, fetched_by, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertWhatsappMedia2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO whatsapp_media (message_id, media_id, media_type, mime, sha256, filename) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function updateWhatsappMediaObjectKeyBytesByMessageIdFetchedAt(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE whatsapp_media SET object_key = ?, bytes = ?, mime = ?, sha256 = ?, fetched_by = ?, fetched_at = ? WHERE message_id = ? AND fetched_at IS NULL', params);
}

// whatsapp_messages
export function getWhatsappMessagesAtByPhoneDirection<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT max(created_at) AS at FROM whatsapp_messages WHERE phone = ? AND direction = 'IN' AND id NOT IN (SELECT message_id FROM whatsapp_import_lines)", params);
}
export function getWhatsappMessagesCByBusinessIdContactId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT contact_id AS c FROM whatsapp_messages WHERE business_id = ? AND contact_id IS NOT NULL ORDER BY created_at DESC LIMIT 1", params);
}
export function getWhatsappMessagesCountByBusinessIdDirection<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM whatsapp_messages WHERE business_id = ? AND direction = 'IN' AND created_at > ? AND id NOT IN (SELECT message_id FROM whatsapp_import_lines)", params);
}
export function getWhatsappMessagesIdStatusByWaIdDirection<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT id, status FROM whatsapp_messages WHERE wa_id = ? AND direction = 'OUT'", params);
}
export function insertWhatsappMessages(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, error, written_by, created_at, status_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertWhatsappMessages2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, error, written_by, filed_by, created_at, status_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)', params);
}
export function insertWhatsappMessages3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT OR IGNORE INTO whatsapp_messages (id, business_id, contact_id, direction, phone, kind, body, wa_id, status, created_at, status_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listWhatsappMessagesIdPhoneByBusinessIdDirection<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT id, phone, created_at, body FROM whatsapp_messages WHERE business_id IS NULL AND direction = 'IN' ORDER BY created_at DESC", params);
}
export function updateWhatsappMessagesBusinessIdFiledByByIdBusinessId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE whatsapp_messages SET business_id = ?, filed_by = ? WHERE id = ? AND business_id IS NULL AND direction = 'IN'", params);
}
export function updateWhatsappMessagesStatusStatusAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE whatsapp_messages SET status = ?, status_at = ?, error = ? WHERE id = ?', params);
}

// moved by hand: a statement whose text depends on one switch, kept exactly as its caller built it
/** research_sources: a source's row after a run (src/web/research.ts); a fired source also records when and by which route. */
export function updateResearchSourcesAfterRun(db: Db, fired: boolean, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run(
    'UPDATE research_sources SET tier = ?, state = ?, detail = ?, publisher = ?, licence_id = ?, attempts = ?, ' +
      'failure_code = ?' + (fired ? ', fired_at = ?, retrieved_at = ?, route = ?' : '') + ' WHERE id = ?',
    params,
  );
}
/** register_records: how many records of a source a company gained since a time (src/modules/portal/take-back.ts), for one building when it has one. */
export function countRegisterRecordsSince<T extends Row = Row>(db: Db, forBuilding: boolean, params: readonly Param[] = []): T | undefined {
  return db.get<T>(
    'SELECT COUNT(*) AS n FROM register_records WHERE business_id = ? AND source_id = ? AND obtained_at >= ?' +
      (!forBuilding ? '' : ' AND entity_id = ?'),
    params,
  );
}
/** research_sources: the example data's first row per source, before any lookup may run (src/core/seed.ts). */
export function insertResearchSourcesNotPermittedYet(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run(
    'INSERT INTO research_sources (id, business_id, source_id, tier, state, fired_at, detail, ' +
      'publisher, licence_id) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)',
    params,
  );
}
