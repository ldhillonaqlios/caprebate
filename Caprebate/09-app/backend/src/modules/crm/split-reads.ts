/**
 * THE CRM'S READS THAT JOINED THE CLIENT RECORD TO THE CLAIMS OR THE ASSESSMENT, SPLIT BY OWNER (Phase 161l2;
 * 09-app/docs/ARCHITECTURE.md rule 3). Each statement here once waited in the client record's borrowed file
 * (src/modules/clients/data-borrowed.ts, now gone), because it joined the client record's tables (organisations, leads,
 * tasks, messages, notes, introducers) to the claims' (claims, properties) or the assessment's (assessments), which sit
 * above the client record. Only the CRM called them, and the CRM sits above all three, so each is put together here:
 * each owner's own read through its front door, the core's users through fillUsers, and the rows joined in code as the
 * statement joined them. The same rows, in the same order, with the same keys and values, NULL where a LEFT JOIN found
 * nothing, and a row left out where an inner JOIN found nothing (any LIMIT applied after that).
 * test/crm/borrowed-split-161l2.test.ts keeps every old statement, word for word, and compares.
 * No SQL here: every statement is in its owner's data file.
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { fillUsers } from '../../core/index.ts';
import {
  CLIENT_SEARCH_STATEMENTS, byId, getBookingsFirstIdEntryPointByBusinessId, getBusinessesIdSourceCreatedAtOwnerIdById, getClientMessagesIdBusinessIdByIdBusinessIdOwn,
  getIntroducerFeesIdIntroducerIdByIdOwn, getLeadRowByIdOwn, getLeadsAssessmentIdById, getLeadsIdStatusByAssessmentId, getLeadsIntroducerIdClaimIdByClaimId,
  getLeadsReferredOpenedByIntroducerId, getStaffTasksIdBusinessIdByIdOwn, getTaskRowByIdOwn, idsOf, insertLeadsBackfilled, listBusinessesIdNameByIds,
  listBusinessesIdNameSectorSourceByIds, listClientMessageLinesByBusinessIdClaimIdOwn, listClientMessageLinesByBusinessIdOwn, listClientMessagesIdBusinessIdByBusinessIdOwn,
  listInternalNotesIdAuthorIdByBusinessIdOwn, listIntroducerPercentageEntriesIdIntroducerIdByIntroducerIdOwn, listIntroducerPercentageEntriesIdIntroducerIdOwn,
  listLeadListLinesOwn, listLeadRowsOwn, listLeadsClaimIdByIntroducerIdWithClaim, listLeadsClaimIdSourceIntroducerByClaimIds, listLeadsIdOrganisationByIntroducerId,
  listNoteLinesByBusinessIdClaimIdOwn, listNoteLinesByBusinessIdOwn, listNoteLinesByPropertyIdClaimIdsOwn, listStaffTasksIdTitleByPropertyIdClaimIds,
  listStaffTasksNextActionByClaimIds, listTaskRowsByClaimIdOwn, listTaskRowsOpenByOwnerOwn, listTaskRowsOpenDueByOwn, listTaskRowsOpenOwn, searchOrganisationNames,
  sqlOrder, withClaimRefs,
} from '../clients/index.ts';
import {
  CLAIM_SEARCH_STATEMENTS, getClaimsFirstIdByBusinessId, getClaimsFirstIdByBusinessIdAssessmentId, getClaimsIdClaimRefPropertyLabelById, getPropertyRowById,
  listClaimListLines, listClaimsIdBusinessIdStageClaimRefByIds, listClaimsIdByPropertyId, listClaimsIdClaimRefBusinessIdStageByOwnerNull,
  listClaimsIdClaimRefBusinessIdStageOwner, listClaimsIdClaimRefPropertyLabelByBusinessId, listClaimsIdClaimRefPropertyLabelByIds,
  listClaimsIdClaimRefPropertyLabelByPropertyId, listClaimsIdClaimRefStageByIds, listClaimsIdCompletedAtByStageClosed, listPropertiesIdLabelPostcodeByIds,
  listPropertyRows, listPropertyRowsByBusinessId, searchClaimsFound, searchClaimsOfIdsFound, searchPropertiesFound, searchPropertiesOfBusinessesFound,
} from '../claims/index.ts';
import { getAssessmentLineById, getAssessmentsFirstSubmittedAtByBusinessId, getAssessmentsIdByBusinessId2, listAssessmentLines, listAssessmentsIdShownByIds } from '../assessment/index.ts';

// HELPERS (no SQL): put one owner's column in place of the id another's row carries.
/** The LIMIT ? the joined statement ended with (its last parameter). */
function limitOf(params: readonly Param[]): number {
  const n = Number(params[params.length - 1]);
  return Number.isFinite(n) && n >= 0 ? n : Infinity;
}
function at<R>(rows: ReadonlyMap<string, R>, id: unknown): R | undefined {
  return typeof id === 'string' ? rows.get(id) : undefined;
}
/** The organisations' names by id, for the rows' ids at the keys given. */
function companies(db: Db, ids: readonly unknown[]): Map<string, { id: string; name: unknown }> {
  return byId(listBusinessesIdNameByIds<{ id: string; name: unknown }>(db, [idsOf(ids)]));
}
/** The claims' reference and property label by id. */
function claimPlaces(db: Db, ids: readonly unknown[]): Map<string, { id: string; claim_ref: unknown; property_label: unknown }> {
  return byId(listClaimsIdClaimRefPropertyLabelByIds<{ id: string; claim_ref: unknown; property_label: unknown }>(db, [idsOf(ids)]));
}
function propertyLabels(db: Db, ids: readonly unknown[]): Map<string, { id: string; label: unknown }> {
  return byId(listPropertiesIdLabelPostcodeByIds<{ id: string; label: unknown }>(db, [idsOf(ids)]));
}
/** The rows whose organisation (its id at `key`) is found, with the name in its place (an inner JOIN on businesses). */
function namedOnly(db: Db, rows: readonly Row[], key: string): Row[] {
  const names = companies(db, rows.map((r) => r[key]));
  const out: Row[] = [];
  for (const r of rows) {
    const b = at(names, r[key]);
    if (b !== undefined) out.push({ ...r, [key]: b.name ?? null });
  }
  return out;
}
/** SQLite's LIKE with no ESCAPE: % any run, _ any one character, ASCII letters in either case, anything else as itself. */
function sqliteLike(pattern: string, text: string): boolean {
  let re = '';
  for (const ch of pattern) {
    if (ch === '%') re += '[\\s\\S]*';
    else if (ch === '_') re += '[\\s\\S]';
    else if (/[A-Za-z]/.test(ch)) re += `[${ch.toLowerCase()}${ch.toUpperCase()}]`;
    else re += ch.replace(/[\\^$.*+?()[\]{}|/-]/g, (c) => `\\${c}`);
  }
  return new RegExp(`^${re}$`, 'u').test(text);
}
/**
 * CASE WHEN label LIKE name || ' — %' THEN substr(label, length(name) + 4) ELSE label END: a property recorded as
 * "Company — main site" is named "main site" where the company is the frame. NULL in, the label out.
 */
function inCompanyFrame(label: unknown, name: unknown): unknown {
  if (typeof label !== 'string' || typeof name !== 'string') return label ?? null;
  if (!sqliteLike(`${name} — %`, label)) return label;
  return [...label].slice([...name].length + 3).join('');
}

// assessments (the assessment's) with the organisation's name; an assessment's lead
export function getAssessmentsIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const a = getAssessmentLineById(db, params);
  return a === undefined ? undefined : namedOnly(db, [a], 'business_name')[0] as T | undefined;
}
export function listAssessmentsIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return namedOnly(db, listAssessmentLines(db), 'business_name').slice(0, limitOf(params)) as T[];
}
/** The organisation's latest assessment and its lead (was: assessments a LEFT JOIN leads l ON l.assessment_id = a.id ... LIMIT 1). */
export function getAssessmentsIdLeadIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const a = getAssessmentsIdByBusinessId2<{ id: string }>(db, params);
  if (a === undefined) return undefined;
  const l = getLeadsIdStatusByAssessmentId<{ lead_id: unknown; lead_status: unknown }>(db, [a.id]);
  return { id: a.id, lead_id: l?.lead_id ?? null, lead_status: l?.lead_status ?? null } as Row as T;
}

// claims (the claims') for a task's picker, with the organisation's and owner's names
export function listClaimsIdClaimRef<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return fillUsers(db, namedOnly(db, listClaimsIdClaimRefBusinessIdStageOwner(db, params), 'business_name'), { owner_name: 'display_name' }) as T[];
}
export function listClaimsIdClaimRefByOwnerId2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return namedOnly(db, listClaimsIdClaimRefBusinessIdStageByOwnerNull(db, params), 'business_name') as T[];
}
/** The closed claims with their lead's date (was: claims c LEFT JOIN leads l ON l.claim_id = c.id; one lead per claim at most). */
export function listClaimsIdCompletedAtByStage<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const claims = listClaimsIdCompletedAtByStageClosed<{ id: string; completed_at: unknown }>(db, params);
  const leads = new Map(listLeadsClaimIdSourceIntroducerByClaimIds<{ claim_id: string; lead_date: unknown }>(db, [idsOf(claims.map((c) => c.id))]).map((l) => [l.claim_id, l]));
  return claims.map((c) => ({ id: c.id, completed_at: c.completed_at, lead_date: at(leads, c.id)?.lead_date ?? null })) as Row[] as T[];
}

// a claim named in its organisation's frame (the timeline)
function framed<T extends Row>(db: Db, rows: readonly { id: string; claim_ref: unknown; business_id: unknown; property_label: unknown }[]): T[] {
  const names = companies(db, rows.map((r) => r.business_id));
  const out: Row[] = [];
  for (const r of rows) {
    const b = at(names, r.business_id);
    if (b !== undefined) out.push({ id: r.id, claim_ref: r.claim_ref, business_id: r.business_id, property_label: inCompanyFrame(r.property_label, b.name) });
  }
  return out as T[];
}
type Place = { id: string; claim_ref: unknown; business_id: unknown; property_label: unknown };
export function getClaimsIdClaimRefById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const c = getClaimsIdClaimRefPropertyLabelById<Place>(db, params);
  return c === undefined ? undefined : framed<T>(db, [c])[0];
}
export function listClaimsIdClaimRefByBusinessId4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return framed<T>(db, listClaimsIdClaimRefPropertyLabelByBusinessId<Place>(db, params));
}
export function listClaimsIdClaimRefByPropertyId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return framed<T>(db, listClaimsIdClaimRefPropertyLabelByPropertyId<Place>(db, params));
}

// client_messages with the author (the core's), the contact, and the claim's reference and property (the claims')
function messageRows<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const claims = claimPlaces(db, rows.map((r) => r.claim_ref));
  return fillUsers(db, rows, { author: 'display_name', author_role: 'role' }).map((m) => {
    const c = at(claims, m.claim_ref);
    return { ...m, claim_ref: c?.claim_ref ?? null, claim_property: c?.property_label ?? null };
  }) as Row[] as T[];
}
export function getClientMessagesIdBusinessIdByIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const m = getClientMessagesIdBusinessIdByIdBusinessIdOwn(db, params);
  return m === undefined ? undefined : messageRows<T>(db, [m])[0];
}
export function listClientMessagesIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return messageRows<T>(db, listClientMessagesIdBusinessIdByBusinessIdOwn(db, params));
}
function messageLines<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const claims = claimPlaces(db, rows.map((r) => r.claim_ref));
  return fillUsers(db, rows, { who: 'display_name' }).map((m) => ({ ...m, claim_ref: at(claims, m.claim_ref)?.claim_ref ?? null })) as Row[] as T[];
}
export function listClientMessageFilesCreatedAtDirectionByMessageIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return messageLines<T>(db, listClientMessageLinesByBusinessIdClaimIdOwn(db, params));
}
export function listClientMessageFilesCreatedAtDirectionByMessageIdJO2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return messageLines<T>(db, listClientMessageLinesByBusinessIdOwn(db, params));
}

// internal_notes with the author, the claim's reference and property, and the note's own property
export function listInternalNotesIdAuthorIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listInternalNotesIdAuthorIdByBusinessIdOwn(db, params);
  const claims = claimPlaces(db, rows.map((r) => r.claim_ref));
  const props = propertyLabels(db, rows.map((r) => r.property_label));
  return fillUsers(db, rows, { who: 'display_name' }).map((n) => {
    const c = at(claims, n.claim_ref);
    return { ...n, claim_ref: c?.claim_ref ?? null, claim_property: c?.property_label ?? null, property_label: at(props, n.property_label)?.label ?? null };
  }) as Row[] as T[];
}
function noteLines<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const claims = claimPlaces(db, rows.map((r) => r.claim_ref));
  const props = propertyLabels(db, rows.map((r) => r.property_label));
  return fillUsers(db, rows, { who: 'display_name' }).map(({ __company, ...n }) => {
    const c = at(claims, n.claim_ref);
    return { ...n, claim_ref: c?.claim_ref ?? null, claim_property: inCompanyFrame(c?.property_label ?? null, __company), property_label: at(props, n.property_label)?.label ?? null };
  }) as Row[] as T[];
}
export function listInternalNotesCreatedAtBodyByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return noteLines<T>(db, listNoteLinesByBusinessIdOwn(db, params));
}
export function listInternalNotesCreatedAtBodyByBusinessIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return noteLines<T>(db, listNoteLinesByBusinessIdClaimIdOwn(db, params));
}
/** A property's notes and those of its claims (params: the property, twice, as the statement took it). */
export function listInternalNotesCreatedAtBodyByPropertyIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const [property = null, ofClaims = null] = params;
  const claims = listClaimsIdByPropertyId<{ id: unknown }>(db, [ofClaims]).map((c) => c.id);
  return noteLines<T>(db, listNoteLinesByPropertyIdClaimIdsOwn(db, [property, idsOf(claims)]));
}
/** A property's tasks and its claims' (params: the property, twice, as the statement took it). */
export function listStaffTasksIdTitleByPropertyIdClaimId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const [property = null, ofClaims = null] = params;
  const claims = listClaimsIdByPropertyId<{ id: unknown }>(db, [ofClaims]).map((c) => c.id);
  return listStaffTasksIdTitleByPropertyIdClaimIds<T>(db, [property, idsOf(claims)]);
}

// introducers' fees and percentage entries, each on a claim that is there (an inner JOIN on claims)
function claimRefs(db: Db, rows: readonly Row[]): Map<string, unknown> {
  return new Map(listClaimsIdClaimRefStageByIds<{ id: string; claim_ref: unknown }>(db, [idsOf(rows.map((r) => r.claim_ref))]).map((c) => [c.id, c.claim_ref]));
}
export function getIntroducerFeesIdIntroducerIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const f = getIntroducerFeesIdIntroducerIdByIdOwn(db, params);
  return f === undefined ? undefined : withClaimRefs([f], claimRefs(db, [f]))[0] as T | undefined;
}
export function listIntroducerPercentageEntriesIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listIntroducerPercentageEntriesIdIntroducerIdOwn(db, params);
  return withClaimRefs(rows, claimRefs(db, rows)) as T[];
}
export function listIntroducerPercentageEntriesIdIntroducerIdByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listIntroducerPercentageEntriesIdIntroducerIdByIntroducerIdOwn(db, params);
  return withClaimRefs(rows, claimRefs(db, rows)) as T[];
}

// leads (the client record's) with the claims' and assessments' columns
/** A lead counts when its assessment showed a figure (was: leads l JOIN assessments a ... COUNT(*)). */
export function getLeadsCountByIdShownLowPence<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const l = getLeadsAssessmentIdById<{ assessment_id: unknown }>(db, params);
  const a = l === undefined ? undefined : byId(listAssessmentsIdShownByIds<{ id: string; shown_low_pence: unknown; shown_high_pence: unknown }>(db, [idsOf([l.assessment_id])])).get(String(l.assessment_id));
  return { n: a !== undefined && (a.shown_low_pence !== null || a.shown_high_pence !== null) ? 1 : 0 } as Row as T;
}
/** An introducer's leads: referred, opened, won and reasoned negatives (params: the introducer, four times). */
export function getLeadsCOUNTByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const [a = null, b = null, c = null, d = null] = params;
  const counts = getLeadsReferredOpenedByIntroducerId<{ referred: unknown; opened: unknown }>(db, [a, b]);
  const stageOf = (who: Param): unknown[] => {
    const held = listLeadsClaimIdByIntroducerIdWithClaim<{ claim_id: unknown }>(db, [who]).map((l) => l.claim_id);
    const stages = new Map(listClaimsIdClaimRefStageByIds<{ id: string; stage: unknown }>(db, [idsOf(held)]).map((x) => [x.id, x.stage]));
    return held.filter((id) => typeof id === 'string' && stages.has(id)).map((id) => stages.get(id as string));
  };
  return {
    referred: counts?.referred ?? 0, opened: counts?.opened ?? 0,
    won: stageOf(c).filter((s) => s === 'CLOSED').length, negatives: stageOf(d).filter((s) => s === 'REASONED_NEGATIVE').length,
  } as Row as T;
}
export function getLeadsIntroducerIdBusinessIdByClaimIdIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const l = getLeadsIntroducerIdClaimIdByClaimId<{ introducer_id: unknown; claim_id: unknown }>(db, params);
  const c = l === undefined ? undefined : listClaimsIdBusinessIdStageClaimRefByIds<{ business_id: unknown }>(db, [idsOf([l.claim_id])])[0];
  return l === undefined || c === undefined ? undefined : ({ introducer_id: l.introducer_id, business_id: c.business_id } as Row as T);
}
export function listLeadsIdBusinessIdByIntroducerId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const rows = listLeadsIdOrganisationByIntroducerId(db, params);
  const claims = byId(listClaimsIdClaimRefStageByIds<{ id: string; claim_ref: unknown; stage: unknown }>(db, [idsOf(rows.map((r) => r.claim_ref))]));
  return rows.map((r) => {
    const c = at(claims, r.claim_ref);
    return { ...r, claim_ref: c?.claim_ref ?? null, stage: c?.stage ?? null };
  }) as Row[] as T[];
}
function leadRows<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const claims = byId(listClaimsIdClaimRefStageByIds<{ id: string; claim_ref: unknown }>(db, [idsOf(rows.map((r) => r.claim_ref))]));
  return fillUsers(db, rows, { owner_name: 'display_name' }).map((r) => ({ ...r, claim_ref: at(claims, r.claim_ref)?.claim_ref ?? null })) as Row[] as T[];
}
export function getStaffTasksIdBusinessIdByLeadIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const l = getLeadRowByIdOwn(db, params);
  return l === undefined ? undefined : leadRows<T>(db, [l])[0];
}
export function listStaffTasksIdBusinessIdByLeadIdStatus<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return leadRows<T>(db, listLeadRowsOwn(db, params));
}
/**
 * The lead backfilled for an organisation that has none (was one INSERT ... SELECT over businesses, its latest
 * assessment, its first booking and its first claim). Each is read from its owner, and the same values are worked out
 * here as the statement's CASE and COALESCE worked them out; nothing is written for an organisation that is not there.
 */
export function insertLeadsByBusinessIdId(db: Db, params: readonly Param[] = []): { changes: number; lastInsertRowid: number } {
  const [id = null, business_id = null] = params;
  const b = getBusinessesIdSourceCreatedAtOwnerIdById<{ id: string; source: unknown; created_at: unknown; owner_id: unknown }>(db, [business_id]);
  if (b === undefined) return { changes: 0, lastInsertRowid: 0 };
  const a = getAssessmentsIdByBusinessId2<{ id: string }>(db, [b.id]);
  const k = getBookingsFirstIdEntryPointByBusinessId<{ id: string; entry_point: unknown; created_at: unknown }>(db, [b.id]);
  const onAssessment = a === undefined ? undefined : getClaimsFirstIdByBusinessIdAssessmentId<{ id: string; created_at: unknown }>(db, [b.id, a.id]);
  const cl = onAssessment ?? getClaimsFirstIdByBusinessId<{ id: string; created_at: unknown }>(db, [b.id]);
  const first = getAssessmentsFirstSubmittedAtByBusinessId<{ first: unknown }>(db, [b.id])?.first ?? null;
  const origin = a !== undefined ? 'ASSESSMENT' : k !== undefined && k.entry_point === 'gated_exit' ? 'GATED_EXIT' : k !== undefined ? 'BOOKING' : 'STAFF';
  return insertLeadsBackfilled(db, [
    id, b.id, a?.id ?? null, k?.id ?? null, cl?.id ?? null, origin, (b.source ?? (a !== undefined ? 'WEBSITE' : 'OTHER')) as Param, null, null, null,
    (first ?? k?.created_at ?? b.created_at) as Param, b.owner_id as Param, null, null, null, cl !== undefined ? 'CONVERTED' : 'NEW', null, null,
    (cl?.created_at ?? null) as Param, b.created_at as Param, b.created_at as Param,
  ]);
}

// staff_tasks with the claim's reference; a task's whole row with every label
export function getStaffTasksIdBusinessIdById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const t = getStaffTasksIdBusinessIdByIdOwn(db, params);
  return t === undefined ? undefined : ({ ...t, claim_ref: claimRefs(db, [t]).get(String(t.claim_ref)) ?? null } as Row as T);
}
function taskRows<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const refs = claimRefs(db, rows);
  const props = propertyLabels(db, rows.map((r) => r.property_label));
  return fillUsers(db, rows, { owner_name: 'display_name', created_by_name: 'display_name', completed_by_name: 'display_name', cancelled_by_name: 'display_name' })
    .map((t) => ({ ...t, claim_ref: typeof t.claim_ref === 'string' ? refs.get(t.claim_ref) ?? null : null, property_label: at(props, t.property_label)?.label ?? null })) as Row[] as T[];
}
export function getIntroducersIdTitleByIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const t = getTaskRowByIdOwn(db, params);
  return t === undefined ? undefined : taskRows<T>(db, [t])[0];
}
export function listIntroducersIdTitleByIdJO<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return taskRows<T>(db, listTaskRowsByClaimIdOwn(db, params));
}
export function listIntroducersIdTitleByIdJO2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return taskRows<T>(db, listTaskRowsOpenByOwnerOwn(db, params));
}
export function listIntroducersIdTitleByIdJO3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return taskRows<T>(db, listTaskRowsOpenDueByOwn(db, params));
}
export function listIntroducersIdTitleByIdJO4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return taskRows<T>(db, listTaskRowsOpenOwn(db, params));
}

// properties (the claims') with the organisation's name
export function getPropertiesIdBusinessIdById4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const p = getPropertyRowById(db, params);
  return p === undefined ? undefined : namedOnly(db, [p], 'business_name')[0] as T | undefined;
}
/** ORDER BY b.name ASC, p.label ASC LIMIT ?: the name is the client record's, so the list is sorted here, after the reads. */
export function listPropertiesIdBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return namedOnly(db, listPropertyRows(db), 'business_name')
    .sort((a, b) => sqlOrder(a.business_name, b.business_name) || sqlOrder(a.label, b.label)).slice(0, limitOf(params)) as T[];
}
export function listPropertiesIdBusinessIdByBusinessId<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return namedOnly(db, listPropertyRowsByBusinessId(db, params), 'business_name') as T[];
}

// THE GLOBAL SEARCH (src/modules/crm/search.ts): a property or claim found, with its organisation's name. A claim is
// found by its reference or by its organisation's name (asked of the client record), and listed by that name A to Z,
// then by reference Z to A; at most 25, after the ones whose organisation is not there are left out.
const SEARCH_LIMIT = 25;
export function searchProperties<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return namedOnly(db, searchPropertiesFound(db, params), 'business_name').slice(0, SEARCH_LIMIT) as T[];
}
export function searchPropertiesOfBusinesses<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return namedOnly(db, searchPropertiesOfBusinessesFound(db, params), 'business_name').slice(0, SEARCH_LIMIT) as T[];
}
function claimsByName(rows: Row[]): Row[] {
  return rows.sort((a, b) => sqlOrder(a.business_name, b.business_name) || sqlOrder(b.claim_ref, a.claim_ref)).slice(0, SEARCH_LIMIT);
}
/** params: the reference's pattern, the organisation name's pattern (as the statement took them). */
export function searchClaims<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const [ref = null, name = null] = params;
  const named = searchOrganisationNames<{ id: unknown }>(db, [name]).map((b) => b.id);
  return claimsByName(namedOnly(db, searchClaimsFound(db, [ref, idsOf(named)]), 'business_name')) as T[];
}
/** params: the claims' ids (a JSON list), the reference's pattern, the organisation name's pattern. */
export function searchClaimsOfIds<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  const [ids = null, ref = null, name = null] = params;
  const named = searchOrganisationNames<{ id: unknown }>(db, [name]).map((b) => b.id);
  return claimsByName(namedOnly(db, searchClaimsOfIdsFound(db, [ids, ref, idsOf(named)]), 'business_name')) as T[];
}
/** Every statement the search runs on the client record's and the claims' tables (for test/core/global-search.test.ts). */
export const SEARCH_STATEMENTS: readonly string[] = Object.freeze([...CLIENT_SEARCH_STATEMENTS, ...CLAIM_SEARCH_STATEMENTS]);

/*
 * THE CLAIM AND LEAD LISTS (src/modules/crm/claim-lists.ts), with the notes they came with. Each joined the claim or
 * the lead to other owners' tables; each owner's columns are now read from it and put in their places.
 *   MONEY    CLIENT AND REFERENCE: the whole of what ACCOUNTING reads of a claim. No other column (each NULL).
 *   WORKING  THE WORKING LINE: no estimate, no assessment, for a reader who may not read the value.
 *   VALUE    THE WORKING LINE AND THE VALUE: for a reader `claim.read_value` admits, and still asked per claim; q and
 *            has_estimate are the assessment's estimate, put in by claim-lists.ts from value_of (the assessment's id).
 * A claim has one lead at most (leads_one_per_claim_uq) and one next action at most (migration 012), so the joins add
 * no line. At most 1,000 lines, newest reference first, after the claims whose organisation is not there are left out.
 */
const CLAIM_LIST_LIMIT = 1000;
export function listClaimsRows<T extends Row = Row>(db: Db, shape: 'MONEY' | 'VALUE' | 'WORKING'): T[] {
  const lines = listClaimListLines<Row & { id: string }>(db);
  const orgs = byId(listBusinessesIdNameSectorSourceByIds<{ id: string; name: unknown; sector: unknown; source: unknown }>(db, [idsOf(lines.map((c) => c.business_id))]));
  const kept = lines.flatMap((c) => { const b = at(orgs, c.business_id); return b === undefined ? [] : [{ c, b }]; }).slice(0, CLAIM_LIST_LIMIT);
  if (shape === 'MONEY') {
    return kept.map(({ c, b }) => ({
      id: c.id, claim_ref: c.claim_ref, business_id: c.business_id, client: b.name, created_at: c.created_at, sector: null, org_source: null, stage: null,
      workstream: null, owner_id: null, owner_name: null, priority: null, expected_completion: null, property_label: null, property_type: null, jurisdiction: null,
      postcode: null, lead_source: null, introducer_id: null, firm_name: null, next_action: null, next_action_due: null, q: null, shown_low_pence: null,
      shown_high_pence: null, has_estimate: null,
    })) as Row[] as T[];
  }
  const ids = kept.map(({ c }) => c.id);
  const leads = new Map(listLeadsClaimIdSourceIntroducerByClaimIds<{ claim_id: string; source: unknown; introducer_id: unknown; firm_name: unknown }>(db, [idsOf(ids)]).map((l) => [l.claim_id, l]));
  const next = new Map(listStaffTasksNextActionByClaimIds<{ claim_id: string; title: unknown; due_on: unknown }>(db, [idsOf(ids)]).map((t) => [t.claim_id, t]));
  const shown = shape === 'VALUE' ? byId(listAssessmentsIdShownByIds<{ id: string; shown_low_pence: unknown; shown_high_pence: unknown }>(db, [idsOf(kept.map(({ c }) => c.assessment_id))])) : new Map();
  const rows = kept.map(({ c, b }) => {
    const l = leads.get(c.id), t = next.get(c.id), a = at(shown, c.assessment_id);
    const line: Row = {
      id: c.id, claim_ref: c.claim_ref, business_id: c.business_id, client: b.name, created_at: c.created_at, sector: b.sector, org_source: b.source, stage: c.stage,
      workstream: c.workstream, owner_id: c.owner_id, owner_name: c.owner_id, priority: c.priority, expected_completion: c.expected_completion, property_label: c.property_label,
      property_type: c.property_type, jurisdiction: c.jurisdiction, postcode: c.postcode, lead_source: l?.source ?? null, introducer_id: l?.introducer_id ?? null,
      firm_name: l?.firm_name ?? null, next_action: t?.title ?? null, next_action_due: t?.due_on ?? null, q: null,
      shown_low_pence: shape === 'VALUE' ? a?.shown_low_pence ?? null : null, shown_high_pence: shape === 'VALUE' ? a?.shown_high_pence ?? null : null, has_estimate: null,
    };
    if (shape === 'VALUE') line.value_of = c.assessment_id;
    return line;
  });
  return fillUsers(db, rows, { owner_name: 'display_name' }) as T[];
}
export function listLeadsRows<T extends Row = Row>(db: Db): T[] {
  const rows = listLeadListLinesOwn(db);
  const claims = byId(listClaimsIdClaimRefStageByIds<{ id: string; claim_ref: unknown }>(db, [idsOf(rows.map((r) => r.claim_ref))]));
  const shown = byId(listAssessmentsIdShownByIds<{ id: string; shown_low_pence: unknown; shown_high_pence: unknown }>(db, [idsOf(rows.map((r) => r.shown_low_pence))]));
  return fillUsers(db, rows, { owner_name: 'display_name' }).map((r) => {
    const a = at(shown, r.shown_low_pence);
    return { ...r, claim_ref: at(claims, r.claim_ref)?.claim_ref ?? null, shown_low_pence: a?.shown_low_pence ?? null, shown_high_pence: a?.shown_high_pence ?? null };
  }) as Row[] as T[];
}
