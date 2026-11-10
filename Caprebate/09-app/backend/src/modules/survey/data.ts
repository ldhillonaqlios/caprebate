/**
 * THE SURVEY'S DATA FILE (09-app/docs/ARCHITECTURE.md rule 3). The only file that runs SQL on the tables
 * architecture/tables.json gives this module: the surveyor workspace, the survey pack, the report, photos and video. Every other file asks through these functions: inside the
 * module from here, from another area through the module's front door (index.ts). Each statement is the one its caller
 * ran before, moved here with its text unchanged; a caller's row type stays with the caller (the type argument).
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUser, fillUsers } from '../../core/index.ts';
import { getEstimatesIdByAssessmentId } from '../assessment/index.ts';
import { listClaimGrantsAmountPenceByClaimIdPaidTo, listClaimsIdBusinessIdStageClaimRefByIds } from '../claims/index.ts';
// The organisations and bookings (the client record's), the properties (the claims') and the video calls (the outside
// services'), read through their front doors for the jobs and walk-throughs below (Phase 161l2).
import { byId, idsOf, listBookingsIdStartsAtCancelledAtByIds, listBusinessesIdNameSectorStageByIds } from '../clients/index.ts';
import { listPropertiesIdLabelPostcodeByIds } from '../claims/index.ts';
import { getVideoMeetingsMeetingIdByBookingId } from '../../integrations/index.ts';
// This module's permissions are registered whenever its data is, so every path into the module can ask them.
import './actions.ts';

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

// Phase 161l1: these joined users (the core), claims' or the assessment's tables. Each reads this module's rows with
// the id where the joined column stood, then asks the owner through its front door and puts the column in its place:
// the same rows, in the same order, with the same keys in the same places.
export function getSurveyInspectionBasisBasisNoteByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT b.basis, b.note, b.by_user AS by_name, b.at FROM survey_inspection_basis b WHERE b.job_id = ? ORDER BY b.at DESC, b.rowid DESC LIMIT 1', params), { by_name: 'display_name' });
}
export function listSurveyPackAddedLinesIdLabelByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT a.id, a.label, a.unit, a.added_by AS by_name, a.added_at, a.reason FROM survey_pack_added_lines a WHERE a.pack_id = ? ORDER BY a.added_at ASC, a.id ASC', params), { by_name: 'display_name' });
}
export function getSurveyPackApprovalsIdVersionByJobIdVersion<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, a.approved_by AS approver_name, a.approved_at, a.snapshot_json ' +
    'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id WHERE p.job_id = ? AND a.version = ?', params), { approver_name: 'display_name' });
}
export function listSurveyPackApprovalsIdVersionByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, a.approved_by AS approver_name, a.approved_at ' +
    'FROM survey_pack_approvals a WHERE a.pack_id = ? ORDER BY a.version DESC', params), { approver_name: 'display_name' });
}
export function listSurveyPackEntriesIdSeqByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT e.id, e.seq, e.line_key, e.field, e.value, e.pool, e.by_user, e.by_user AS by_name, e.reason, e.at, e.rate_basis, e.rate_ref, e.rate_priced_at ' +
    'FROM survey_pack_entries e WHERE e.pack_id = ? ORDER BY e.seq ASC', params), { by_name: 'display_name' });
}
export function listSurveyPackLegalAnswersQuestionIdValueJsonByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT a.question_id, a.value_json, a.by_user AS by_name, a.source_note, a.at, a.seq FROM survey_pack_legal_answers a WHERE a.pack_id = ? ORDER BY a.seq ASC', params), { by_name: 'display_name' });
}
export function listSurveyPackWordsFieldWordsByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT w.field, w.words, w.by_user AS by_name, w.at, w.reason FROM survey_pack_words w ' +
    'WHERE w.pack_id = ? ORDER BY w.at, w.rowid', params), { by_name: 'display_name' });
}
export function listSurveyPhotoSortsIdItemKeyByPhotoIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT p.id, COALESCE((SELECT s.item_key FROM survey_photo_sorts s WHERE s.photo_id = p.id ORDER BY s.at DESC, s.rowid DESC LIMIT 1), p.item_key) AS item_key, ' +
    'p.content_type, p.byte_size, p.note, p.taken_at, p.taken_by AS taken_by_name FROM survey_photos p ' +
    'LEFT JOIN survey_photo_withdrawals w ON w.photo_id = p.id WHERE p.job_id = ? AND w.photo_id IS NULL ORDER BY p.taken_at, p.rowid', params), { taken_by_name: 'display_name' });
}
export function listSurveyVideosIdContentTypeByJobIdVideoId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT v.id, v.content_type, v.byte_size, v.duration_ms, v.note, v.taken_at, v.taken_by AS taken_by_name FROM survey_videos v ' +
    'LEFT JOIN survey_video_withdrawals w ON w.video_id = v.id WHERE v.job_id = ? AND w.video_id IS NULL ORDER BY v.taken_at, v.rowid', params), { taken_by_name: 'display_name' });
}
export function listSurveyWalkthroughAsksAtByNameByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT a.at, a.by_user AS by_name FROM survey_walkthrough_asks a WHERE a.job_id = ? ORDER BY a.at DESC', params), { by_name: 'display_name' });
}
export function getSurveyorJobsIdSurveyorByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT j.id, j.surveyor_id AS surveyor, j.created_at, j.state FROM surveyor_jobs j ' +
    'WHERE j.claim_id = ? ORDER BY j.created_at DESC, j.id LIMIT 1', params), { surveyor: 'display_name' });
}
export function getSurveyorJobsSurveyorByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return fillUser(db, db.get<T>('SELECT j.surveyor_id AS surveyor FROM surveyor_jobs j WHERE j.claim_id = ? LIMIT 1', params), { surveyor: 'display_name' });
}
export function listSurveyorRoomCountsRoomIdRoomCountByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, db.all<T>('SELECT c.room_id, c.room_count, c.recorded_at, c.recorded_by AS by_name FROM surveyor_room_counts c WHERE c.job_id = ?', params), { by_name: 'display_name' });
}
/** The grants paid to a past owner on the job's claim (none when the job has no claim yet). */
export function listClaimGrantsAmountPenceByIdPaidTo<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const job = db.get<{ claim_id: string | null }>('SELECT j.claim_id FROM surveyor_jobs j WHERE j.id = ?', params);
  return job === undefined || job.claim_id === null ? [] : listClaimGrantsAmountPenceByClaimIdPaidTo<T>(db, [job.claim_id]);
}
/** { x: 1 } when the job's assessment has an estimate. */
export function getEstimatesXById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const job = db.get<{ assessment_id: string }>('SELECT j.assessment_id FROM surveyor_jobs j WHERE j.id = ?', params);
  return job === undefined || getEstimatesIdByAssessmentId(db, [job.assessment_id]) === undefined ? undefined : ({ x: 1 } as Row as T);
}
/** The job's property: its pack's, else its claim's. */
export function getSurveyorJobsPropertyIdPById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const j = db.get<{ p: string | null; claim_id: string | null }>('SELECT sp.property_id AS p, j.claim_id FROM surveyor_jobs j LEFT JOIN survey_packs sp ON sp.job_id = j.id WHERE j.id = ?', params);
  if (j === undefined) return undefined;
  const claim = j.p === null && j.claim_id !== null ? listClaimsIdBusinessIdStageClaimRefByIds<{ property_id: string | null }>(db, [JSON.stringify([j.claim_id])])[0] : undefined;
  return { p: j.p ?? claim?.property_id ?? null } as Row as T;
}

// FOR THE CRM (Phase 161l1): its statements that joined these tables to the core's users or the claims now read here
// and look the rest up through the other area's front door (src/modules/clients/data-borrowed.ts).
export function getSurveyPackApprovalsVersionApprovedAtApprovedByByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.version, a.approved_at, a.approved_by FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id ' +
    'JOIN surveyor_jobs j ON j.id = p.job_id WHERE j.claim_id = ? ' +
    'ORDER BY a.approved_at DESC, a.version DESC LIMIT 1', params);
}
export function listSurveyorCommitmentsCommittedAtJobIdSurveyorIdByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT sc.committed_at, sc.job_id, sc.surveyor_id FROM surveyor_commitments sc JOIN surveyor_jobs j ON j.id = sc.job_id ' +
    'WHERE j.claim_id = ? ORDER BY sc.committed_at', params);
}
export function listSurveyorJobsIdBusinessIdClaimIdBySurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT j.id, j.business_id, j.surveyor_id, j.state, j.claim_id FROM surveyor_jobs j ' +
    'WHERE j.surveyor_id = ? ORDER BY j.created_at ASC, j.id ASC', params);
}
export function listSurveyorJobsBusinessIdClaimIdBySurveyorId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT j.business_id, j.claim_id FROM surveyor_jobs j WHERE j.surveyor_id = ?', params);
}

/*
 * Phase 161l2: THE JOBS AND WALK-THROUGHS THAT JOINED THE CLIENT RECORD, SPLIT (from this module's borrowed file).
 * Each statement joined the organisation (businesses) or the booking (bookings), the client record's
 * (src/modules/clients/, below this module). Now this module reads its own rows, with the other row's id standing where
 * each joined column stood, and the client record's door gives those columns, put in their places. The JOIN was an
 * inner one, so a row whose organisation or booking is not found is left out, and any LIMIT is applied after that, as
 * the join applied it. Users (the core), claims and properties (the claims) and video meetings (the outside services)
 * as 161l1 split them. test/survey/borrowed-split-161l2.test.ts keeps each original statement and compares.
 */
/** The keys of each row that stand for the named organisation's columns, put in place; a row with no organisation found is left out. */
function withBusiness(db: Db, rows: readonly Row[], columns: Readonly<Record<string, 'name' | 'sector' | 'stage'>>): Row[] {
  const businesses = byId(listBusinessesIdNameSectorStageByIds<{ id: string } & Row>(db, [idsOf(rows.map((r) => r.business_id))]));
  const out: Row[] = [];
  for (const r of rows) {
    const b = typeof r.business_id === 'string' ? businesses.get(r.business_id) : undefined;
    if (b === undefined) continue;
    const row: Row = { ...r };
    for (const [k, col] of Object.entries(columns)) row[k] = b[col] ?? null;
    out.push(row);
  }
  return out;
}
type Placed = Row & { __place_property?: string | null; __place_name?: unknown };
/** COALESCE(p.label, b.name) AS place, with p the pack's property: the property's label, else the organisation's name. */
function placeFromProperties<T extends Row>(db: Db, rows: readonly Placed[]): T[] {
  const ids = [...new Set(rows.map((r) => r.__place_property).filter((x): x is string => typeof x === 'string'))];
  const label = new Map(ids.length === 0 ? [] : listPropertiesIdLabelPostcodeByIds<{ id: string; label: string | null }>(db, [JSON.stringify(ids)]).map((p) => [p.id, p.label]));
  return rows.map(({ __place_property, __place_name, ...r }) => {
    const l = typeof __place_property === 'string' ? label.get(__place_property) ?? null : null;
    return { ...r, place: l ?? __place_name } as Row as T;
  });
}
/** cl.stage AS claim_stage, cl.claim_ref, p.label AS property_label, p.postcode AS property_postcode, from j.claim_id. */
function jobClaimColumns<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const filled = fillUsers(db, rows, { surveyor_name: 'display_name' });
  const claimIds = [...new Set(filled.map((r) => r.claim_id).filter((x): x is string => typeof x === 'string'))];
  const claims = new Map(claimIds.length === 0 ? [] : listClaimsIdBusinessIdStageClaimRefByIds<{ id: string; stage: unknown; claim_ref: unknown; property_id: string | null }>(db, [JSON.stringify(claimIds)]).map((c) => [c.id, c]));
  const propIds = [...new Set([...claims.values()].map((c) => c.property_id).filter((x): x is string => typeof x === 'string'))];
  const props = new Map(propIds.length === 0 ? [] : listPropertiesIdLabelPostcodeByIds<{ id: string; label: unknown; postcode: unknown }>(db, [JSON.stringify(propIds)]).map((p) => [p.id, p]));
  return filled.map((r) => {
    const c = typeof r.claim_id === 'string' ? claims.get(r.claim_id) : undefined;
    const p = typeof c?.property_id === 'string' ? props.get(c.property_id) : undefined;
    return { ...r, claim_stage: c?.stage ?? null, claim_ref: c?.claim_ref ?? null, property_label: p?.label ?? null, property_postcode: p?.postcode ?? null } as Row as T;
  });
}
/** The LIMIT ? the joined statement ended with (its last parameter), applied after the rows with no organisation are left out. */
function limitOf(params: readonly Param[]): number {
  const n = Number(params[params.length - 1]);
  return Number.isFinite(n) && n >= 0 ? n : Infinity;
}

// surveyor_jobs with the organisation's sector and the place (the pack's property, else the organisation's name)
export function getSurveyorJobsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const rows = db.all('SELECT j.id, j.business_id, j.business_id AS sector, NULL AS place, j.surveyor_id, sp.property_id AS __place_property, j.business_id AS __place_name FROM surveyor_jobs j ' +
    'LEFT JOIN survey_packs sp ON sp.job_id = j.id WHERE j.id = ?', params);
  return placeFromProperties<T>(db, withBusiness(db, rows, { sector: 'sector', __place_name: 'name' }).slice(0, 1))[0];
}
export function listSurveyorJobsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = db.all('SELECT j.id, j.business_id, j.business_id AS sector, NULL AS place, j.surveyor_id, sp.property_id AS __place_property, j.business_id AS __place_name FROM surveyor_jobs j ' +
    'LEFT JOIN survey_packs sp ON sp.job_id = j.id WHERE j.business_id = ? ORDER BY j.created_at, j.id', params);
  return placeFromProperties<T>(db, withBusiness(db, rows, { sector: 'sector', __place_name: 'name' }));
}
// surveyor_jobs with the organisation's name, sector and step, the surveyor's name, and the claim and its property
const JOB_COLUMNS = 'SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, j.business_id AS name, j.business_id AS sector, j.business_id AS stage, ' +
  'j.surveyor_id AS surveyor_name, j.claim_id, NULL AS claim_stage, NULL AS claim_ref, NULL AS property_label, NULL AS property_postcode FROM surveyor_jobs j ';
export function getSurveyorJobsIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const rows = withBusiness(db, db.all(JOB_COLUMNS + 'WHERE j.id = ?', params), { name: 'name', sector: 'sector', stage: 'stage' });
  return jobClaimColumns<T>(db, rows.slice(0, 1))[0];
}
export function listSurveyorJobsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = withBusiness(db, db.all(JOB_COLUMNS + 'ORDER BY j.created_at DESC'), { name: 'name', sector: 'sector', stage: 'stage' });
  return jobClaimColumns<T>(db, rows.slice(0, limitOf(params)));
}

// survey_walkthroughs with the booking's times (the client record's), who booked it (the core's) and the video call
export function listVideoMeetingsIdBookingIdByBookingIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const own = db.all('SELECT w.id, w.booking_id, w.booking_id AS starts_at, w.booking_id AS cancelled_at, w.booked_by AS booked_by_name, NULL AS meeting_id ' +
    'FROM survey_walkthroughs w WHERE w.job_id = ? ORDER BY w.booked_at DESC', params);
  const bookings = byId(listBookingsIdStartsAtCancelledAtByIds<{ id: string } & Row>(db, [idsOf(own.map((r) => r.booking_id))]));
  const joined = own.flatMap((r) => {
    const b = typeof r.booking_id === 'string' ? bookings.get(r.booking_id) : undefined;
    return b === undefined ? [] : [{ ...r, starts_at: b.starts_at ?? null, cancelled_at: b.cancelled_at ?? null } as Row];
  });
  const rows = fillUsers(db, joined, { booked_by_name: 'display_name' });
  return rows.map((r) => ({ ...r, meeting_id: getVideoMeetingsMeetingIdByBookingId<{ meeting_id: unknown }>(db, [r.booking_id as string])?.meeting_id ?? null }) as Row as T);
}
