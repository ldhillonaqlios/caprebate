/**
 * BORROWED: SQL ON OTHER AREAS' TABLES, RUN FROM THE SURVEY (09-app/docs/ARCHITECTURE.md rules 3 and 4). These statements
 * were in this module's page and logic files, which may not run SQL (rule 4). They read or write tables another area
 * owns, or join this module's tables to another's, so they still go against rule 3 (each counted against the table's
 * owner). Phase 161l1 moves each to its owner's data file, reached through that owner's front door or an event. Nothing
 * new belongs here: this file only gets shorter. Text unchanged from the caller.
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUsers } from '../../core/index.ts';
import { listClaimsIdBusinessIdStageClaimRefByIds, listPropertiesIdLabelPostcodeByIds } from '../claims/index.ts';
import { getVideoMeetingsMeetingIdByBookingId } from '../../integrations/index.ts';

/*
 * Phase 161l1: what is left here joins the CRM's businesses or bookings, which sit above the survey in the order (for
 * the CRM's own split). Users (the core), claims and properties (the claims) and video meetings (the outside services)
 * are below it: read through their front doors and put in place here, so each row is what the join gave.
 */
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

// surveyor_jobs
export function getSurveyorJobsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return placeFromProperties<T>(db, db.all<Placed>('SELECT j.id, j.business_id, b.sector, NULL AS place, j.surveyor_id, sp.property_id AS __place_property, b.name AS __place_name FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id ' +
    'LEFT JOIN survey_packs sp ON sp.job_id = j.id WHERE j.id = ? LIMIT 1', params))[0];
}
export function getSurveyorJobsIdBusinessIdById2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  return jobClaimColumns<T>(db, db.all('SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, b.name, b.sector, b.stage, j.surveyor_id AS surveyor_name, j.claim_id, NULL AS claim_stage, NULL AS claim_ref, NULL AS property_label, NULL AS property_postcode FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id WHERE j.id = ? LIMIT 1', params))[0];
}
export function listSurveyorJobsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return jobClaimColumns<T>(db, db.all('SELECT j.id, j.business_id, j.assessment_id, j.surveyor_id, j.state, j.committed_at, j.created_at, b.name, b.sector, b.stage, j.surveyor_id AS surveyor_name, j.claim_id, NULL AS claim_stage, NULL AS claim_ref, NULL AS property_label, NULL AS property_postcode FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id ORDER BY j.created_at DESC LIMIT ?', params));
}
export function listSurveyorJobsIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return placeFromProperties<T>(db, db.all<Placed>('SELECT j.id, j.business_id, b.sector, NULL AS place, j.surveyor_id, sp.property_id AS __place_property, b.name AS __place_name FROM surveyor_jobs j JOIN businesses b ON b.id = j.business_id ' +
    'LEFT JOIN survey_packs sp ON sp.job_id = j.id WHERE j.business_id = ? ORDER BY j.created_at, j.id', params));
}

// video_meetings
export function listVideoMeetingsIdBookingIdByBookingIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = fillUsers(db, db.all('SELECT w.id, w.booking_id, b.starts_at, b.cancelled_at, w.booked_by AS booked_by_name, NULL AS meeting_id ' +
    'FROM survey_walkthroughs w JOIN bookings b ON b.id = w.booking_id WHERE w.job_id = ? ORDER BY w.booked_at DESC', params), { booked_by_name: 'display_name' });
  return rows.map((r) => ({ ...r, meeting_id: getVideoMeetingsMeetingIdByBookingId<{ meeting_id: unknown }>(db, [r.booking_id as string])?.meeting_id ?? null }) as Row as T);
}
