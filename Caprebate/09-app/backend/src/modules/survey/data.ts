/**
 * THE SURVEY'S DATA FILE (09-app/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: the surveyor workspace, the survey pack, the report, photos and video. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';

// anchor_log
export function getAnchorLogByJobIdKind<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM anchor_log WHERE job_id = ? AND kind = ? ORDER BY seq ASC LIMIT 1', params);
}
export function getAnchorLogCOALESCEMAXSeqN<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COALESCE(MAX(seq),0) + 1 AS n FROM anchor_log', params);
}
export function getAnchorLogHash<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT hash FROM anchor_log ORDER BY seq DESC LIMIT 1', params);
}
export function insertAnchorLog(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO anchor_log (seq, kind, job_id, actor, at, detail_json, prev_hash, hash) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listAnchorLog<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT * FROM anchor_log ORDER BY seq ASC', params);
}
export function listAnchorLogByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT * FROM anchor_log WHERE job_id = ? ORDER BY seq ASC', params);
}

// survey_checklist_marks
export function insertSurveyChecklistMarks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_checklist_marks (id, job_id, item_key, mark, by_user, at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listSurveyChecklistMarksItemKeyMarkByJobIdRowid<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT m.item_key, m.mark FROM survey_checklist_marks m WHERE m.job_id = ? AND m.rowid = (SELECT x.rowid FROM survey_checklist_marks x WHERE x.job_id = m.job_id AND x.item_key = m.item_key ORDER BY x.at DESC, x.rowid DESC LIMIT 1)', params);
}

// survey_inspection_basis
export function insertSurveyInspectionBasis(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_inspection_basis (id, job_id, basis, note, by_user, at) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// survey_pack_added_lines
export function insertSurveyPackAddedLines(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_pack_added_lines (id, pack_id, label, unit, added_by, added_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}

// survey_pack_approvals
export function insertSurveyPackApprovals(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_pack_approvals (id, pack_id, version, pack_seq, legal_seq, snapshot_json, fingerprint, approved_by, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listSurveyPackApprovalsSnapshotJsonJobIdByVersionPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.snapshot_json, p.job_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
    'WHERE a.version = (SELECT MAX(x.version) FROM survey_pack_approvals x WHERE x.pack_id = a.pack_id)', params);
}

// survey_pack_entries
export function insertSurveyPackEntriesByPackId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at, rate_basis, rate_ref, rate_priced_at) ' +
    'SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM survey_pack_entries WHERE pack_id = ?', params);
}
export function insertSurveyPackEntriesByPackId2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_pack_entries (id, pack_id, seq, line_key, field, value, pool, by_user, reason, at, rate_ref) ' +
    "SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, NULL, 'location', ?, NULL, ?, ?, ?, ? FROM survey_pack_entries WHERE pack_id = ?", params);
}

// survey_pack_legal_answers
export function getSurveyPackLegalAnswersSByPackIdByUser<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT MAX(seq) AS s FROM survey_pack_legal_answers WHERE pack_id = ? AND by_user <> ?', params);
}
export function insertSurveyPackLegalAnswersByPackId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_pack_legal_answers (id, pack_id, seq, question_id, value_json, by_user, source_note, at) ' +
    'SELECT ?, ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ? FROM survey_pack_legal_answers WHERE pack_id = ?', params);
}
export function listSurveyPackLegalAnswersQuestionIdValueJsonByPackId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT question_id, value_json FROM survey_pack_legal_answers WHERE pack_id = ? ORDER BY seq ASC', params);
}

// survey_pack_reads
export function insertSurveyPackReads(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT OR IGNORE INTO survey_pack_reads (id, job_id, user_id, chapter, legal_seq, at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listSurveyPackReadsChapterSeqByJobIdUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT chapter, MAX(legal_seq) AS seq FROM survey_pack_reads WHERE job_id = ? AND user_id = ? GROUP BY chapter', params);
}

// survey_pack_words
export function insertSurveyPackWords(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_pack_words (id, pack_id, field, words, by_user, reason, at) VALUES (?, ?, ?, ?, ?, ?, ?)', params);
}

// survey_packs
export function getSurveyPacksIdByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM survey_packs WHERE job_id = ?', params);
}
export function getSurveyPacksIdPropertyIdByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, property_id FROM survey_packs WHERE job_id = ?', params);
}
export function insertSurveyPacks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_packs (id, job_id, property_id, created_at, created_by) VALUES (?, ?, ?, ?, ?)', params);
}
export function updateSurveyPacksPropertyIdByIdPropertyId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE survey_packs SET property_id = ? WHERE id = ? AND property_id IS NULL', params);
}

// survey_photo_sorts
export function insertSurveyPhotoSorts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_photo_sorts (id, photo_id, item_key, by_user, at) VALUES (?, ?, ?, ?, ?)', params);
}

// survey_photo_withdrawals
export function getSurveyPhotoWithdrawalsXByPhotoId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM survey_photo_withdrawals WHERE photo_id = ?', params);
}
export function insertSurveyPhotoWithdrawals(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_photo_withdrawals (photo_id, by_user, reason, at) VALUES (?, ?, ?, ?)', params);
}

// survey_photos
export function getSurveyPhotosCountByJobIdPhotoId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM survey_photos p LEFT JOIN survey_photo_withdrawals w ON w.photo_id = p.id WHERE p.job_id = ? AND w.photo_id IS NULL', params);
}
export function getSurveyPhotosJobIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT p.job_id, j.business_id FROM survey_photos p JOIN surveyor_jobs j ON j.id = p.job_id WHERE p.id = ?', params);
}
export function getSurveyPhotosJobIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT p.job_id, j.business_id, p.object_key, p.content_type, (w.photo_id IS NOT NULL) AS withdrawn FROM survey_photos p JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'LEFT JOIN survey_photo_withdrawals w ON w.photo_id = p.id WHERE p.id = ?', params);
}
export function insertSurveyPhotos(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_photos (id, job_id, item_key, object_key, content_type, byte_size, sha256, note, taken_by, taken_at, nobody_in_it) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)', params);
}

// survey_recording_views
export function insertSurveyRecordingViews(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_recording_views (id, recording_id, by_user, at) VALUES (?, ?, ?, ?)', params);
}
export function listSurveyRecordingViewsIdShareUrlByRecordingIdWalkthroughId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT r.id, r.share_url, r.passcode, r.minutes, r.recorded_at, (SELECT COUNT(*) FROM survey_recording_views v WHERE v.recording_id = r.id) AS views FROM survey_recordings r WHERE r.walkthrough_id = ? ORDER BY r.recorded_at', params);
}

// survey_recordings
export function getSurveyRecordingsShareUrlByIdJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT r.share_url FROM survey_recordings r JOIN survey_walkthroughs w ON w.id = r.walkthrough_id WHERE r.id = ? AND w.job_id = ?', params);
}
export function insertSurveyRecordings(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_recordings (id, walkthrough_id, share_url, passcode, minutes, recorded_at, fetched_by, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// survey_upload_outcomes
export function insertSurveyUploadOutcomes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO survey_upload_outcomes (slot_id, outcome, photo_id, why, at) VALUES (?, 'ABANDONED', NULL, ?, ?)", params);
}
export function insertSurveyUploadOutcomes2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO survey_upload_outcomes (slot_id, outcome, photo_id, why, at) VALUES (?, 'KEPT', ?, NULL, ?)", params);
}
export function insertSurveyUploadOutcomes3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO survey_upload_outcomes (slot_id, outcome, photo_id, why, at) VALUES (?, 'REFUSED', NULL, ?, ?)", params);
}

// survey_upload_sessions
export function getSurveyUploadSessionsIdJobIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, job_id, by_user, photos_planned, note, private_key_sealed, expires_at FROM survey_upload_sessions WHERE id = ?', params);
}
export function insertSurveyUploadSessions(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_upload_sessions (id, job_id, by_user, photos_planned, note, nobody_in_it, public_key, private_key_sealed, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)', params);
}

// survey_upload_slots
export function getSurveyUploadSlotsIdSessionIdByIdSessionId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT s.id, s.session_id, s.staged_key, s.byte_size, s.issued_at, o.outcome, o.photo_id, o.why FROM survey_upload_slots s ' +
    'LEFT JOIN survey_upload_outcomes o ON o.slot_id = s.id WHERE s.id = ? AND s.session_id = ?', params);
}
export function getSurveyUploadSlotsXBySessionIdN<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM survey_upload_slots WHERE session_id = ? AND n = ?', params);
}
export function insertSurveyUploadSlots(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_upload_slots (id, session_id, n, staged_key, byte_size, issued_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listSurveyUploadSlotsIdStagedKeyBySlotIdIssuedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT s.id, s.staged_key FROM survey_upload_slots s LEFT JOIN survey_upload_outcomes o ON o.slot_id = s.id WHERE o.slot_id IS NULL AND s.issued_at < ? ORDER BY s.issued_at LIMIT ?', params);
}

// survey_video_outcomes
export function getSurveyVideoOutcomesOutcomeWhyBySendId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT outcome, why FROM survey_video_outcomes WHERE send_id = ?', params);
}
export function insertSurveyVideoOutcomes(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO survey_video_outcomes (send_id, outcome, why, at) VALUES (?, 'ABANDONED', ?, ?)", params);
}
export function insertSurveyVideoOutcomes2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO survey_video_outcomes (send_id, outcome, why, at) VALUES (?, 'KEPT', NULL, ?)", params);
}
export function insertSurveyVideoOutcomes3(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO survey_video_outcomes (send_id, outcome, why, at) VALUES (?, 'REFUSED', ?, ?)", params);
}

// survey_video_pieces
export function getSurveyVideoPiecesCountBySendId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT count(*) AS n FROM survey_video_pieces WHERE send_id = ?', params);
}
export function insertSurveyVideoPieces(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_video_pieces (send_id, n, slot_id, byte_size, sha256, at) VALUES (?, ?, ?, ?, ?, ?)', params);
}

// survey_video_sends
export function getSurveyVideoSendsIdJobIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, job_id, by_user, byte_size, pieces, note, private_key_sealed, expires_at FROM survey_video_sends WHERE id = ?', params);
}
export function insertSurveyVideoSends(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_video_sends (id, job_id, by_user, byte_size, pieces, note, nobody_in_it, public_key, private_key_sealed, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)', params);
}
export function listSurveyVideoSendsIdPiecesBySendIdCreatedAt<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT s.id, s.pieces FROM survey_video_sends s LEFT JOIN survey_video_outcomes o ON o.send_id = s.id WHERE o.send_id IS NULL AND s.created_at < ? ORDER BY s.created_at LIMIT ?', params);
}

// survey_video_slots
export function getSurveyVideoSlotsIdSendIdByIdSendId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT s.id, s.send_id, s.n, s.staged_key, s.byte_size, s.issued_at, (p.slot_id IS NOT NULL) AS kept FROM survey_video_slots s ' +
    'LEFT JOIN survey_video_pieces p ON p.slot_id = s.id WHERE s.id = ? AND s.send_id = ?', params);
}
export function getSurveyVideoSlotsXBySendIdN<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM survey_video_slots WHERE send_id = ? AND n = ?', params);
}
export function insertSurveyVideoSlots(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_video_slots (id, send_id, n, staged_key, byte_size, issued_at) VALUES (?, ?, ?, ?, ?, ?)', params);
}
export function listSurveyVideoSlotsStagedKeyBySendId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT staged_key FROM survey_video_slots WHERE send_id = ?', params);
}

// survey_video_withdrawals
export function getSurveyVideoWithdrawalsXByVideoId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM survey_video_withdrawals WHERE video_id = ?', params);
}
export function insertSurveyVideoWithdrawals(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_video_withdrawals (video_id, by_user, reason, at) VALUES (?, ?, ?, ?)', params);
}

// survey_videos
export function getSurveyVideosBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT j.business_id FROM survey_videos v JOIN surveyor_jobs j ON j.id = v.job_id WHERE v.id = ?', params);
}
export function getSurveyVideosJobIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT v.job_id, j.business_id, v.byte_size, v.pieces, v.content_type, (w.video_id IS NOT NULL) AS withdrawn FROM survey_videos v JOIN surveyor_jobs j ON j.id = v.job_id ' +
    'LEFT JOIN survey_video_withdrawals w ON w.video_id = v.id WHERE v.id = ?', params);
}
export function getSurveyVideosMsById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT duration_ms AS ms FROM survey_videos WHERE id = ?', params);
}
export function insertSurveyVideos(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_videos (id, job_id, content_type, byte_size, duration_ms, pieces, places_blanked, note, taken_by, taken_at, nobody_in_it) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)', params);
}

// survey_walkthrough_asks
export function getSurveyWalkthroughAsksXByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM survey_walkthrough_asks a WHERE a.job_id = ? AND NOT EXISTS (SELECT 1 FROM survey_walkthroughs w WHERE w.job_id = a.job_id AND w.booked_at >= a.at)', params);
}
export function insertSurveyWalkthroughAsks(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_walkthrough_asks (id, job_id, by_user, at) VALUES (?, ?, ?, ?)', params);
}

// survey_walkthroughs
export function insertSurveyWalkthroughs(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO survey_walkthroughs (id, job_id, booking_id, booked_by, booked_at) VALUES (?, ?, ?, ?, ?)', params);
}

// surveyor_commitments
export function getSurveyorCommitmentsByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT * FROM surveyor_commitments WHERE job_id = ?', params);
}
export function insertSurveyorCommitments(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO surveyor_commitments (id, job_id, surveyor_id, a_qualifying_plant_pence, b_building_pence, c_bare_land_pence, ' +
    'qualifying_pct, method_note, committed_at, figures_hash, released_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}

// surveyor_control_observations
export function insertSurveyorControlObservations(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO surveyor_control_observations (id, job_id, surveyor_id, field_id, sector, region, ' +
    'value, at, anchor_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (job_id, field_id) DO NOTHING', params);
}

// surveyor_details
export function getSurveyorDetailsRicsNumberFirmByUserId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT rics_number, firm, at FROM surveyor_details WHERE user_id = ? ORDER BY at DESC, rowid DESC LIMIT 1', params);
}
export function insertSurveyorDetails(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO surveyor_details (id, user_id, rics_number, firm, at) VALUES (?, ?, ?, ?, ?)', params);
}

// surveyor_jobs
export function getSurveyorJobsAssessmentIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT assessment_id FROM surveyor_jobs WHERE id = ?', params);
}
export function getSurveyorJobsIdBusinessIdById3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id FROM surveyor_jobs WHERE id = ?', params);
}
export function getSurveyorJobsIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id, business_id, surveyor_id FROM surveyor_jobs WHERE id = ?', params);
}
export function getSurveyorJobsIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT id FROM surveyor_jobs WHERE claim_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', params);
}
export function insertSurveyorJobs(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO surveyor_jobs (id, business_id, assessment_id, surveyor_id, state, committed_at, created_at, claim_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertSurveyorJobs2(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("INSERT INTO surveyor_jobs (id, business_id, assessment_id, surveyor_id, state, committed_at, created_at, claim_id) VALUES (?, ?, ?, ?, 'SEALED', NULL, ?, ?)", params);
}
export function updateSurveyorJobsStateCommittedAtById(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run("UPDATE surveyor_jobs SET state = 'COMMITTED_AND_RELEASED', committed_at = ? WHERE id = ?", params);
}

// surveyor_rate_events
export function getSurveyorRateEventsCountByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM surveyor_rate_events WHERE job_id = ?', params);
}
export function insertSurveyorRateEvents(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO surveyor_rate_events (id, job_id, surveyor_id, field_id, sector, region, ' +
    'prefilled_value, prefill_origin, final_value, outcome, relative_delta, reason, at, ' +
    'anchor_verdict, reviewed, blank_control) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT (job_id, field_id) DO UPDATE SET final_value = excluded.final_value, ' +
    'outcome = excluded.outcome, relative_delta = excluded.relative_delta, ' +
    'reason = excluded.reason, at = excluded.at, reviewed = excluded.reviewed', params);
}
export function listSurveyorRateEventsBySurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT * FROM surveyor_rate_events WHERE surveyor_id = ? ORDER BY at ASC, id ASC', params);
}
export function listSurveyorRateEventsFieldIdFinalValueByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT field_id, final_value, outcome, reason FROM surveyor_rate_events WHERE job_id = ?', params);
}

// surveyor_room_counts
export function getSurveyorRoomCountsCountByJobIdRoomCount<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM surveyor_room_counts WHERE job_id = ? AND room_count IS NOT NULL', params);
}
export function insertSurveyorRoomCounts(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO surveyor_room_counts (id, job_id, room_id, room_count, note, recorded_by, recorded_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (job_id, room_id) DO UPDATE SET ' +
    'room_count = excluded.room_count, note = excluded.note, ' +
    'recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at', params);
}
export function listSurveyorRoomCountsRoomIdRoomCountByJobId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT room_id, room_count FROM surveyor_room_counts WHERE job_id = ?', params);
}
export function listSurveyorRoomCountsRoomIdRoomCountByJobId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT room_id, room_count, note, recorded_at FROM surveyor_room_counts WHERE job_id = ?', params);
}

// Moved here from other areas' borrowed files: their statements are on this module's tables.
export function getAnchorLogCountByJobIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COUNT(*) AS n FROM anchor_log WHERE job_id IN (SELECT id FROM surveyor_jobs WHERE claim_id = ?)', params);
}
export function getAnchorLogSeqHashByJobIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT seq, hash FROM anchor_log WHERE job_id IN (SELECT id FROM surveyor_jobs WHERE claim_id = ?) ORDER BY seq DESC LIMIT 1', params);
}
export function getSitePlansPostcodeHalfMByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT postcode, half_m, buildings_json, chosen, how, metres, attribution, fetched_at FROM site_plans WHERE job_id = ? ORDER BY fetched_at DESC, rowid DESC LIMIT 1', params);
}
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
export function getSurveyPackApprovalsSnapshotJsonVersionByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.snapshot_json, a.version FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function getSurveyPackApprovalsVersionSnapshotJsonByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.version, a.snapshot_json FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE j.claim_id = ? ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function getSurveyorCommitmentsCommittedAtByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT sc.committed_at FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
    'WHERE j.claim_id = ? ORDER BY sc.committed_at ASC LIMIT 1', params);
}
export function getSurveyorCommitmentsIdJobIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT sc.id, sc.job_id, sc.a_qualifying_plant_pence, sc.b_building_pence, sc.c_bare_land_pence, sc.qualifying_pct, ' +
    'sc.method_note, sc.committed_at, sc.figures_hash FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
    'WHERE j.claim_id = ? ORDER BY sc.committed_at DESC LIMIT 1', params);
}
export function getSurveyorCommitmentsNByAssessmentId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS n FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id WHERE j.assessment_id = ? LIMIT 1', params);
}
export function getSurveyorJobsCountByBusinessIdState<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT COUNT(*) AS n FROM surveyor_jobs WHERE business_id = ? AND (state = 'SEALED' OR committed_at >= ?)", params);
}
export function getSurveyorJobsSurveyorIdByBusinessIdSurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL ' +
    'ORDER BY created_at DESC LIMIT 1', params);
}
export function insertPackClientNotices(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO pack_client_notices (approval_id, message_id, told_by, told_at) VALUES (?, ?, ?, ?)', params);
}
export function insertPackSignoffAnswers(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO pack_signoff_answers (id, request_id, outcome, signer_name, signer_firm, signer_credential, reason, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertPackSignoffRecorded(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO pack_signoff_recorded (answer_id, signoff_id, recorded_by, recorded_at) VALUES (?, ?, ?, ?)', params);
}
export function insertPackSignoffRequests(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO pack_signoff_requests (id, approval_id, contact_id, to_email, token_sha256, permission_note, outbox_id, sent_by, sent_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function insertSitePlans(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('INSERT INTO site_plans (id, job_id, postcode, easting, northing, half_m, buildings_json, chosen, how, metres, attribution, fetched_by, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params);
}
export function listSurveyPackApprovalsSnapshotJsonAssessmentIdByVersionPack<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.snapshot_json, j.assessment_id FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN surveyor_jobs j ON j.id = p.job_id ' +
    'WHERE a.version = (SELECT MAX(x.version) FROM survey_pack_approvals x WHERE x.pack_id = a.pack_id)', params);
}
export function listSurveyorJobsIdBusinessIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT id, business_id, surveyor_id FROM surveyor_jobs WHERE claim_id = ?', params);
}
export function listSurveyorJobsIdSurveyorIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT j.id, j.surveyor_id, j.created_at, sc.committed_at, sc.id AS commitment FROM surveyor_jobs j ' +
    'LEFT JOIN surveyor_commitments sc ON sc.job_id = j.id WHERE j.claim_id = ? ORDER BY j.created_at ASC', params);
}
export function listSurveyorJobsSurveyorIdByBusinessIdSurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', params);
}
export function listSurveyorJobsSurveyorIdByBusinessIdSurveyorId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', params);
}
export function listSurveyorJobsSurveyorIdByBusinessIdSurveyorId3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE business_id = ? AND surveyor_id IS NOT NULL', params);
}
export function listSurveyorJobsSurveyorIdByClaimIdSurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE claim_id = ? AND surveyor_id IS NOT NULL', params);
}
export function listSurveyorJobsSurveyorIdByClaimIdSurveyorId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT DISTINCT surveyor_id FROM surveyor_jobs WHERE claim_id = ? AND surveyor_id IS NOT NULL', params);
}
export function updateSurveyorJobsClaimIdByBusinessIdAssessmentId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  return db.run('UPDATE surveyor_jobs SET claim_id = ? WHERE business_id = ? AND assessment_id = ? AND claim_id IS NULL', params);
}
