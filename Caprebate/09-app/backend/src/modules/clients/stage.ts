/**
 * THE CLIENT'S STEP RAISED BY THE RESEARCH (Phase 161l1, carved from src/modules/crm/pipeline.ts unchanged). Asked by
 * the claims' research run; raise only, never lowered.
 */
import type { Db } from '../../core/index.ts';
import { stageIndex } from '../../shared/index.ts';
import { getBusinessesStageById, updateBusinessesStageUpdatedAtById } from './data.ts';

/**
 * No claim stage maps to the client's step 3, "We research your property", so a
 * client went from step 2 to step 4 while we researched. A research run that got an answer from at least one register,
 * on a client whose letter is signed, raises the client's step to it. Raise only, as raiseBusinessStage: a business
 * already past it stays where it is, and one whose letter is not signed is never shown a step it has not reached.
 */
export function raiseToResearch(db: Db, business_id: string, at: string, run: { readonly signed: boolean; readonly fired: number }): boolean {
  if (!run.signed || run.fired === 0) return false;
  const b = getBusinessesStageById<{ stage: string }>(db, [business_id]);
  if (b === undefined || stageIndex(b.stage) >= stageIndex('RESEARCH_PART_RUN')) return false;
  updateBusinessesStageUpdatedAtById(db, ['RESEARCH_PART_RUN', at, business_id]);
  return true;
}
