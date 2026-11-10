/**
 * A CLAIM AS THE CLIENT RECORD NAMES IT (Phase 161l1, carved from src/modules/crm/crm.ts unchanged): the claim row a
 * board card and a task are built from, and a claim's name for a person (its company and its property). No
 * authorisation here: every caller has asked `claim.read` of the claim first.
 *
 * Phase 161l2: moved up from the client record (src/modules/clients/) to the claims, the lowest area that uses it (the
 * claims, admin and the CRM do; the client record does not), and its statements split by owner: the claim and its
 * property from the claims' data file, the organisation's name and the claim's next action from the client record's
 * door, the owner's and surveyor's names from the core's fillUsers (test/crm/borrowed-split-161l2.test.ts keeps each
 * old statement and compares).
 */
import type { Db, Param, Row } from '../../core/index.ts';
import { NotFoundAsRefusal, fillUsers } from '../../core/index.ts';
import { byId, idsOf, listBusinessesIdNameByIds, listStaffTasksNextActionByClaimIds } from '../clients/index.ts';
import { getClaimRowById, getClaimsBusinessIdCompanyPropertyRefById, listClaimRowsByBusinessId, listClaimRowsByClaimRefAsc, listClaimRowsByClaimRefDesc, listClaimRowsByPropertyId } from './data.ts';

export type ClaimDbRow = {
  id: string; claim_ref: string; business_id: string; property_id: string | null; assessment_id: string | null;
  workstream: string; stage: string | null; owner_id: string | null; surveyor_id: string | null;
  priority: string | null; next_action: string | null; next_action_due: string | null;
  hold_reason: string | null; lost_reason: string | null; expected_completion: string | null;
  created_at: string; updated_at: string;
  hold_return_stage: string | null; tax_adviser_signoff_at: string | null;
  business_name: string; owner_name: string | null; surveyor_name: string | null; property_label: string | null;
  /** A claim is named by its company and its property, and a tile shows the property's town. */
  property_town: string | null;
};

function loadClaim(db: Db, id: string): ClaimDbRow {
  const r = getStaffTasksIdClaimRefByClaimIdIsNextAction<ClaimDbRow>(db, [id]);
  if (r === undefined) throw new NotFoundAsRefusal();
  return r;
}

/**
 * A CLAIM'S NAME FOR A PERSON: its company, its property, and its reference for the small grey label.
 * No authorisation: the caller has already asked `claim.read` of the claim it is naming.
 */
export function claimNaming(db: Db, claim_id: string): { readonly business_id: string; readonly company: string; readonly property: string | null; readonly ref: string } | null {
  const r = getClaimsBusinessIdCompanyById<{ business_id: string; company: string; property: string | null; ref: string }>(db, [claim_id]);
  return r ?? null;
}

/** "Company — Property": the words of a link to a claim. Never the reference, which is a label beside it. */
export function claimWords(db: Db, claim_id: string): string {
  const n = claimNaming(db, claim_id);
  if (n === null) return 'a claim';
  if (n.property === null || n.property.trim() === '') return `${n.company} — claim`;
  return n.property.startsWith(n.company) ? n.property : `${n.company} — ${n.property}`;
}

/** The claim row a board card is built from. No authorisation: the caller asks. */
export function loadClaimRow(db: Db, id: string): ClaimDbRow {
  return loadClaim(db, id);
}

/*
 * THE CLAIM ROW'S STATEMENT, SPLIT (Phase 161l2; was claims c JOIN businesses b LEFT JOIN users o, s LEFT JOIN
 * properties p, with the next action and its date as subqueries on staff_tasks). The claims' read carries the
 * organisation's, owner's and surveyor's ids where their names stood and the claim's id where the next action stood;
 * a claim whose organisation is not found is left out (the inner JOIN), and any LIMIT is applied after that.
 */
function claimRows<T extends Row>(db: Db, rows: readonly Row[]): T[] {
  const names = byId(listBusinessesIdNameByIds<{ id: string; name: unknown }>(db, [idsOf(rows.map((r) => r.business_name))]));
  const next = new Map(listStaffTasksNextActionByClaimIds<{ claim_id: string; title: unknown; due_on: unknown }>(db, [idsOf(rows.map((r) => r.id))]).map((t) => [t.claim_id, t]));
  const kept: Row[] = [];
  for (const r of rows) {
    const b = typeof r.business_name === 'string' ? names.get(r.business_name) : undefined;
    if (b === undefined) continue;
    const t = typeof r.id === 'string' ? next.get(r.id) : undefined;
    kept.push({ ...r, next_action: t?.title ?? null, next_action_due: t?.due_on ?? null, business_name: b.name ?? null });
  }
  return fillUsers(db, kept, { owner_name: 'display_name', surveyor_name: 'display_name' }) as T[];
}
function limitOf(params: readonly Param[]): number {
  const n = Number(params[params.length - 1]);
  return Number.isFinite(n) && n >= 0 ? n : Infinity;
}
export function getStaffTasksIdClaimRefByClaimIdIsNextAction<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const r = getClaimRowById(db, params);
  return r === undefined ? undefined : claimRows<T>(db, [r])[0];
}
/** Every claim's row, by reference A to Z, at most the LIMIT given. */
export function listStaffTasksIdClaimRefByClaimIdIsNextAction<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return claimRows<T>(db, listClaimRowsByClaimRefAsc(db)).slice(0, limitOf(params));
}
/** Every claim's row, by reference Z to A, at most the LIMIT given. */
export function listStaffTasksIdClaimRefByClaimIdIsNextAction2<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return claimRows<T>(db, listClaimRowsByClaimRefDesc(db)).slice(0, limitOf(params));
}
/** An organisation's claims' rows, by reference. */
export function listStaffTasksIdClaimRefByClaimIdIsNextAction3<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return claimRows<T>(db, listClaimRowsByBusinessId(db, params));
}
/** A property's claims' rows, by reference. */
export function listStaffTasksIdClaimRefByClaimIdIsNextAction4<T extends Row = Row>(db: Db, params: readonly Param[] = []): T[] {
  return claimRows<T>(db, listClaimRowsByPropertyId(db, params));
}
/** A claim's organisation's name, its property's label and its reference (was: claims c JOIN businesses b LEFT JOIN properties p). */
export function getClaimsBusinessIdCompanyById<T extends Row = Row>(db: Db, params: readonly Param[] = []): T | undefined {
  const r = getClaimsBusinessIdCompanyPropertyRefById<{ business_id: unknown; company: unknown; property: unknown; ref: unknown }>(db, params);
  const b = r === undefined ? undefined : byId(listBusinessesIdNameByIds<{ id: string; name: unknown }>(db, [idsOf([r.company])])).get(String(r.company));
  return r === undefined || b === undefined ? undefined : ({ ...r, company: b.name ?? null } as Row as T);
}
