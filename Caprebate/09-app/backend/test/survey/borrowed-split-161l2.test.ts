/**
 * THE SURVEY'S LAST BORROWED STATEMENTS, SPLIT (Phase 161l2). A surveyor's job joined the organisation (businesses) and
 * a walk-through joined its booking (bookings), both the client record's (src/modules/clients/, below the survey). Each
 * now reads the survey's own rows and asks the client record for the organisation's or booking's columns. Each pin keeps
 * the statement as it was before any split (Phase 161l1 split off the users, claims and properties), word for word, and
 * expects the same rows on a seeded database with awkward rows added: a job whose organisation is not there, a pack on
 * no property, a job on a claim that is not there, equal sort keys, a walk-through whose booking is not there.
 */
import type { Db } from '../../src/core/index.ts';
import * as DATA from '../../src/modules/survey/data.ts';
import { looseSeededDb, pinAll, put } from '../split-pins.ts';

interface World { db: Db; biz: string; biz2: string; jobs: string[] }
let world: Promise<World> | null = null;
function theWorld(): Promise<World> {
  world ??= (async () => {
    const db = await looseSeededDb();
    const claim = db.get<{ id: string; business_id: string; property_id: string | null }>('SELECT id, business_id, property_id FROM claims WHERE property_id IS NOT NULL ORDER BY claim_ref LIMIT 1')!;
    const biz = claim.business_id;
    const biz2 = db.get<{ id: string }>('SELECT id FROM businesses WHERE id <> ? ORDER BY id LIMIT 1', [biz])!.id;
    const staff = db.get<{ id: string }>("SELECT id FROM users WHERE role <> 'CLIENT' ORDER BY email LIMIT 1")!.id;
    const t = (n: number): string => `2026-10-0${n}T09:00:00.000Z`;
    // jobs: on a claim, on a claim not there, with no claim, on an organisation not there, two made at the same moment
    put(db, 'surveyor_jobs', { id: 'sj-1', business_id: biz, claim_id: claim.id, surveyor_id: staff, state: 'OPEN', created_at: t(1) });
    put(db, 'surveyor_jobs', { id: 'sj-2', business_id: biz, claim_id: 'claim-none', surveyor_id: 'u-gone', state: 'OPEN', created_at: t(1) });
    put(db, 'surveyor_jobs', { id: 'sj-3', business_id: biz2, claim_id: null, surveyor_id: null, state: 'OPEN', created_at: t(2) });
    put(db, 'surveyor_jobs', { id: 'sj-4', business_id: 'biz-none', claim_id: claim.id, surveyor_id: staff, state: 'OPEN', created_at: t(3) });
    put(db, 'surveyor_jobs', { id: 'sj-5', business_id: biz, claim_id: claim.id, surveyor_id: staff, state: 'OPEN', created_at: t(3) });
    // a second job on the second organisation, so the case does not depend on how many jobs the seed gives it
    put(db, 'surveyor_jobs', { id: 'sj-6', business_id: biz2, claim_id: null, surveyor_id: staff, state: 'OPEN', created_at: t(2) });
    // packs: one on the claim's property, one on no property, one on a property not there
    put(db, 'survey_packs', { id: 'sp-1', job_id: 'sj-1', property_id: claim.property_id });
    put(db, 'survey_packs', { id: 'sp-2', job_id: 'sj-2', property_id: null });
    put(db, 'survey_packs', { id: 'sp-4', job_id: 'sj-4', property_id: 'property-none' });
    put(db, 'survey_packs', { id: 'sp-5', job_id: 'sj-5', property_id: 'property-none' });
    // walk-throughs: on bookings there and not there, booked at the same moment, with and without a video call
    put(db, 'bookings', { id: 'bk-w1', business_id: biz, channel: 'video', starts_at: t(4), ends_at: t(5), created_at: t(1), cancelled_at: null });
    put(db, 'bookings', { id: 'bk-w2', business_id: biz, channel: 'video', starts_at: null, ends_at: null, created_at: t(1), cancelled_at: t(2) });
    put(db, 'video_meetings', { booking_id: 'bk-w1', meeting_id: 'm-1', created_at: t(2) });
    put(db, 'survey_walkthroughs', { id: 'w-1', job_id: 'sj-1', booking_id: 'bk-w1', booked_by: staff, booked_at: t(1) });
    put(db, 'survey_walkthroughs', { id: 'w-2', job_id: 'sj-1', booking_id: 'bk-w2', booked_by: staff, booked_at: t(1) });
    put(db, 'survey_walkthroughs', { id: 'w-3', job_id: 'sj-1', booking_id: 'bk-none', booked_by: staff, booked_at: t(2) });
    const jobs = db.all<{ id: string }>('SELECT id FROM surveyor_jobs ORDER BY id').map((r) => r.id);
    return { db, biz, biz2, jobs };
  })();
  return world;
}

pinAll<World>('161l2 survey', theWorld, (w) => [
  {
    name: 'getSurveyorJobsIdBusinessIdById', get: true,
    old: "SELECT j.id, j.business_id, b.sector, COALESCE(p.label, b.name) AS place, j.surveyor_id FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id " +
      'LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN properties p ON p.id = sp.property_id WHERE j.id = ?',
    call: DATA.getSurveyorJobsIdBusinessIdById, params: [...w.jobs.map((j) => [j]), ['sj-none']], atLeast: 5,
  },
  {
    name: 'listSurveyorJobsIdBusinessIdByBusinessId',
    old: "SELECT j.id, j.business_id, b.sector, COALESCE(p.label, b.name) AS place, j.surveyor_id FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id " +
      'LEFT JOIN survey_packs sp ON sp.job_id = j.id LEFT JOIN properties p ON p.id = sp.property_id WHERE j.business_id = ? ORDER BY j.created_at, j.id',
    call: DATA.listSurveyorJobsIdBusinessIdByBusinessId, params: [[w.biz], [w.biz2], ['biz-none']], atLeast: 5,
  },
  {
    name: 'getSurveyorJobsIdBusinessIdById2', get: true,
    old: 'SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, b.name, b.sector, b.stage, u.display_name AS surveyor_name, j.claim_id, cl.stage AS claim_stage, cl.claim_ref, p.label AS property_label, p.postcode AS property_postcode FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id LEFT JOIN users u ON u.id = j.surveyor_id LEFT JOIN claims cl ON cl.id = j.claim_id LEFT JOIN properties p ON p.id = cl.property_id WHERE j.id = ?',
    call: DATA.getSurveyorJobsIdBusinessIdById2, params: [...w.jobs.map((j) => [j]), ['sj-none']], atLeast: 5,
  },
  {
    name: 'listSurveyorJobsIdBusinessId',
    old: 'SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, b.name, b.sector, b.stage, u.display_name AS surveyor_name, j.claim_id, cl.stage AS claim_stage, cl.claim_ref, p.label AS property_label, p.postcode AS property_postcode FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id LEFT JOIN users u ON u.id = j.surveyor_id LEFT JOIN claims cl ON cl.id = j.claim_id LEFT JOIN properties p ON p.id = cl.property_id ORDER BY j.created_at DESC LIMIT ?',
    call: DATA.listSurveyorJobsIdBusinessId, params: [[100], [2], [1], [0]], atLeast: 7,
  },
  {
    name: 'listVideoMeetingsIdBookingIdByBookingIdJO',
    old: 'SELECT w.id, w.booking_id, b.starts_at, b.cancelled_at, u.display_name AS booked_by_name, ' +
      '(SELECT m.meeting_id FROM video_meetings m WHERE m.booking_id = b.id ORDER BY m.created_at DESC LIMIT 1) AS meeting_id ' +
      'FROM survey_walkthroughs w JOIN bookings b ON b.id = w.booking_id JOIN users u ON u.id = w.booked_by WHERE w.job_id = ? ORDER BY w.booked_at DESC',
    call: DATA.listVideoMeetingsIdBookingIdByBookingIdJO, params: [['sj-1'], ['sj-2']], atLeast: 2,
  },
]);
