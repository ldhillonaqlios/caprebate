/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE SURVEY (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';

// claim_grants
export function listClaimGrantsAmountPenceByIdPaidTo<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT g.amount_pence FROM claim_grants g JOIN surveyor_jobs j ON j.claim_id = g.claim_id WHERE j.id = ? AND g.paid_to = 'PAST_OWNER' AND g.withdrawn_at IS NULL", params);
}

// estimates
export function getEstimatesXById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT 1 AS x FROM estimates e JOIN surveyor_jobs j ON j.assessment_id = e.assessment_id WHERE j.id = ?', params);
}

// survey_inspection_basis
export function getSurveyInspectionBasisBasisNoteByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT b.basis, b.note, u.display_name AS by_name, b.at FROM survey_inspection_basis b JOIN users u ON u.id = b.by_user WHERE b.job_id = ? ORDER BY b.at DESC, b.rowid DESC LIMIT 1', params);
}

// survey_pack_added_lines
export function listSurveyPackAddedLinesIdLabelByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.id, a.label, a.unit, u.display_name AS by_name, a.added_at, a.reason FROM survey_pack_added_lines a JOIN users u ON u.id = a.added_by WHERE a.pack_id = ? ORDER BY a.added_at ASC, a.id ASC', params);
}

// survey_pack_approvals
export function getSurveyPackApprovalsIdVersionByJobIdVersion<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at, a.snapshot_json ' +
    'FROM survey_pack_approvals a JOIN survey_packs p ON p.id = a.pack_id JOIN users u ON u.id = a.approved_by WHERE p.job_id = ? AND a.version = ?', params);
}
export function listSurveyPackApprovalsIdVersionByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.id, a.version, a.pack_seq, a.legal_seq, a.fingerprint, a.approved_by, u.display_name AS approver_name, a.approved_at ' +
    'FROM survey_pack_approvals a JOIN users u ON u.id = a.approved_by WHERE a.pack_id = ? ORDER BY a.version DESC', params);
}

// survey_pack_entries
export function listSurveyPackEntriesIdSeqByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT e.id, e.seq, e.line_key, e.field, e.value, e.pool, e.by_user, u.display_name AS by_name, e.reason, e.at, e.rate_basis, e.rate_ref, e.rate_priced_at ' +
    'FROM survey_pack_entries e JOIN users u ON u.id = e.by_user WHERE e.pack_id = ? ORDER BY e.seq ASC', params);
}

// survey_pack_legal_answers
export function listSurveyPackLegalAnswersQuestionIdValueJsonByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.question_id, a.value_json, u.display_name AS by_name, a.source_note, a.at, a.seq FROM survey_pack_legal_answers a JOIN users u ON u.id = a.by_user WHERE a.pack_id = ? ORDER BY a.seq ASC', params);
}

// survey_pack_words
export function listSurveyPackWordsFieldWordsByPackId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT w.field, w.words, u.display_name AS by_name, w.at, w.reason FROM survey_pack_words w JOIN users u ON u.id = w.by_user ' +
    'WHERE w.pack_id = ? ORDER BY w.at, w.rowid', params);
}

// survey_photo_sorts
export function listSurveyPhotoSortsIdItemKeyByPhotoIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT p.id, COALESCE((SELECT s.item_key FROM survey_photo_sorts s WHERE s.photo_id = p.id ORDER BY s.at DESC, s.rowid DESC LIMIT 1), p.item_key) AS item_key, ' +
    'p.content_type, p.byte_size, p.note, p.taken_at, u.display_name AS taken_by_name FROM survey_photos p JOIN users u ON u.id = p.taken_by ' +
    'LEFT JOIN survey_photo_withdrawals w ON w.photo_id = p.id WHERE p.job_id = ? AND w.photo_id IS NULL ORDER BY p.taken_at, p.rowid', params);
}

// survey_videos
export function listSurveyVideosIdContentTypeByJobIdVideoId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT v.id, v.content_type, v.byte_size, v.duration_ms, v.note, v.taken_at, u.display_name AS taken_by_name FROM survey_videos v JOIN users u ON u.id = v.taken_by ' +
    'LEFT JOIN survey_video_withdrawals w ON w.video_id = v.id WHERE v.job_id = ? AND w.video_id IS NULL ORDER BY v.taken_at, v.rowid', params);
}

// survey_walkthrough_asks
export function listSurveyWalkthroughAsksAtByNameByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT a.at, u.display_name AS by_name FROM survey_walkthrough_asks a JOIN users u ON u.id = a.by_user WHERE a.job_id = ? ORDER BY a.at DESC', params);
}

// surveyor_jobs
export function getSurveyorJobsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>("SELECT j.id, j.business_id, b.sector, COALESCE(p.label, b.name) AS place, j.surveyor_id FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id " +
    'LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN properties p ON p.id = sp.property_id WHERE j.id = ?', params);
}
export function getSurveyorJobsIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, b.name, b.sector, b.stage, u.display_name AS surveyor_name, j.claim_id, cl.stage AS claim_stage, cl.claim_ref, p.label AS property_label, p.postcode AS property_postcode FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id LEFT JOIN users u ON u.id = j.surveyor_id LEFT JOIN claims cl ON cl.id = j.claim_id LEFT JOIN properties p ON p.id = cl.property_id WHERE j.id = ?', params);
}
export function getSurveyorJobsIdSurveyorByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT j.id, u.display_name AS surveyor, j.created_at, j.state FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id ' +
    'WHERE j.claim_id = ? ORDER BY j.created_at DESC, j.id LIMIT 1', params);
}
export function getSurveyorJobsPropertyIdPById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT COALESCE(sp.property_id, c.property_id) AS p FROM surveyor_jobs j LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN claims c ON c.id = j.claim_id WHERE j.id = ?', params);
}
export function getSurveyorJobsSurveyorByClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return db.get<T>('SELECT u.display_name AS surveyor FROM surveyor_jobs j LEFT JOIN users u ON u.id = j.surveyor_id WHERE j.claim_id = ? LIMIT 1', params);
}
export function listSurveyorJobsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, b.name, b.sector, b.stage, u.display_name AS surveyor_name, j.claim_id, cl.stage AS claim_stage, cl.claim_ref, p.label AS property_label, p.postcode AS property_postcode FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id LEFT JOIN users u ON u.id = j.surveyor_id LEFT JOIN claims cl ON cl.id = j.claim_id LEFT JOIN properties p ON p.id = cl.property_id ORDER BY j.created_at DESC LIMIT ?', params);
}
export function listSurveyorJobsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>("SELECT j.id, j.business_id, b.sector, COALESCE(p.label, b.name) AS place, j.surveyor_id FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id " +
    'LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN properties p ON p.id = sp.property_id WHERE j.business_id = ? ORDER BY j.created_at, j.id', params);
}

// surveyor_room_counts
export function listSurveyorRoomCountsRoomIdRoomCountByJobId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT c.room_id, c.room_count, c.recorded_at, u.display_name AS by_name FROM surveyor_room_counts c LEFT JOIN users u ON u.id = c.recorded_by WHERE c.job_id = ?', params);
}

// video_meetings
export function listVideoMeetingsIdBookingIdByBookingIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return db.all<T>('SELECT w.id, w.booking_id, b.starts_at, b.cancelled_at, u.display_name AS booked_by_name, ' +
    '(SELECT m.meeting_id FROM video_meetings m WHERE m.booking_id = b.id ORDER BY m.created_at DESC LIMIT 1) AS meeting_id ' +
    'FROM survey_walkthroughs w JOIN bookings b ON b.id = w.booking_id JOIN users u ON u.id = w.booked_by WHERE w.job_id = ? ORDER BY w.booked_at DESC', params);
}
