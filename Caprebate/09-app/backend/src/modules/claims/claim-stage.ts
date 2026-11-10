/**
 * A CLAIM'S STAGE, READ (Phase 161l1, moved from src/modules/crm/pipeline.ts unchanged): the claim as the pipeline reads
 * it, when it last entered a stage, when our report was delivered for filing, a gate's need, and the client's step a
 * claim evidences, raised on the organisation and never lowered. Read by the CRM's pipeline, the claim page and the
 * finance view; the moves themselves are the CRM's.
 */
import type { Db } from '../../core/index.ts';
import { NotFoundAsRefusal } from '../../core/index.ts';
import { clientStageFor, stageIndex, type ProcedureKey, type StageKey } from '../../shared/index.ts';
import { getBusinessesStageById, updateBusinessesStageUpdatedAtById } from '../clients/index.ts';
import { getClaimDeliverablesIssuedOnKindByClaimIdState, getClaimReconciliationsFiledOnByClaimId, getClaimStageMovesAtByClaimIdToStage, getClaimsIdBusinessIdById3, listClaimsIdStageByBusinessId } from './data.ts';

/**
 * WHEN OUR REPORT WAS DELIVERED FOR FILING — the earliest issue date of the claim's CLIENT_REPORT or
 * ACCOUNTANT_COMPUTATION_PACK that stands ISSUED in the deliverables register, or null where neither is (N4: an
 * unknown delivery is null, never today). Read by the fee trigger and by the finance view's expected-fee date.
 */
export function reportDeliveredOn(db: Db, claim_id: string): { readonly on: string; readonly kind: string } | null {
  const r = getClaimDeliverablesIssuedOnKindByClaimIdState<{ issued_on: string; kind: string }>(db, [claim_id]);
  return r === undefined ? null : { on: r.issued_on, kind: r.kind };
}

export type PipelineClaim = {
  id: string; business_id: string; assessment_id: string | null; stage: string | null;
  hold_return_stage: string | null; hold_reason: string | null;
  /** RETIRED BY CRM 6 of 10 and read by no gate: the database refuses any write to it. The sign-off is a record. */
  tax_adviser_signoff_at: string | null;
  created_at: string;
  /** CRM 6 of 10: the amendment window reads the property's acquisition date. */
  property_id: string | null;
};

export function loadPipelineClaim(db: Db, id: string): PipelineClaim {
  const c = getClaimsIdBusinessIdById3<PipelineClaim>(db, [id]);
  // A missing row and a forbidden row look the same from outside.
  if (c === undefined) throw new NotFoundAsRefusal();
  return c;
}

/**
 * WHEN THE CLAIM LAST ENTERED A STAGE — by moving into it, being opened in it,
 * being converted into it, or being reopened at it. A RESUME is not an entry:
 * a hold is a pause, and what was confirmed before it still stands.
 */
export function enteredAt(db: Db, c: { id: string; created_at: string }, stageKey: string): string {
  const r = getClaimStageMovesAtByClaimIdToStage<{ at: string | null }>(db, [c.id, stageKey]);
  return r?.at ?? c.created_at;
}

export type Need = { readonly what: string; readonly met: boolean; readonly why: string };

/**
 * THE ORGANISATION'S STORED STAGE, RAISED — NEVER LOWERED.
 *
 * `businesses.stage` stays the engaged-client list's sort key and the portal's
 * source. A move raises it to the client label the organisation's most advanced
 * open claim evidences (stages.ts), and never lowers it: an exit, a hold or a
 * reopen does not move a client's progress backwards, and no migration rewrites
 * a stored stage. Returns the key it was raised to, or null.
 */
export function raiseBusinessStage(db: Db, business_id: string, at: string): StageKey | null {
  const b = getBusinessesStageById<{ stage: string }>(db, [business_id]);
  if (b === undefined) return null;
  let best: StageKey | null = null;
  for (const c of listClaimsIdStageByBusinessId<{ id: string; stage: string | null; hold_return_stage: string | null }>(db, [business_id])) {
    const k = clientStageForClaim(db, c.id, c.stage === 'ON_HOLD' ? c.hold_return_stage : c.stage);
    if (k !== null && (best === null || stageIndex(k) > stageIndex(best))) best = k;
  }
  if (best === null || stageIndex(b.stage) >= stageIndex(best)) return null;
  updateBusinessesStageUpdatedAtById(db, [best, at, business_id]);
  return best;
}

/**
 * The client's step a claim evidences. The defence pack and Closed are the
 * client's "5 Claim filed", and the portal said so with no record that the claim was filed. Until the filing date is on
 * the claim's reconciliation, such a claim evidences "4 Expert sign-off"; recording it raises the client's step.
 */
export function clientStageForClaim(db: Db, claim_id: string, key: string | null): StageKey | null {
  const k = clientStageFor(key);
  if (k !== 'INVOICED') return k;
  const filed = getClaimReconciliationsFiledOnByClaimId<{ filed_on: string | null }>(db, [claim_id])?.filed_on ?? null;
  return filed === null ? 'AT_SURVEY' : k;
}

/*
 * WHAT A STAGE'S GATE STILL NEEDS IS THE CRM'S TO SAY (its pipeline, src/modules/crm/pipeline.ts gateOut): A PORT THIS
 * FILE OWNS, handed in by src/modules/crm/ports.ts as the CRM's front door loads, so the claim page reads the needs
 * without importing the CRM. Asked before it is handed in, it refuses rather than guess. Asked only while code runs.
 */
export type GateNeeds = (db: Db, c: PipelineClaim, from: ProcedureKey, opts: { readonly today?: string }) => { readonly needs: readonly Need[] };
var gateNeeds: GateNeeds | undefined;
export function setGateOutReader(read: GateNeeds): void { gateNeeds = read; }

/** What the gate out of a stage needs, and whether each is met (the CRM's gateOut). */
export function gateOut(db: Db, c: PipelineClaim, from: ProcedureKey, opts: { readonly today?: string } = {}): { readonly needs: readonly Need[] } {
  if (gateNeeds === undefined) throw new Error('The pipeline\'s gates are not set up. The CRM sets them up when it loads, so nothing was read.');
  return gateNeeds(db, c, from, opts);
}
