/**
 * A CLAIM'S OWN LIVE FEE INVOICES (Phase 161l1, moved from src/modules/crm/pipeline.ts unchanged): raised or sent, and
 * not credited in full. Read by the finance view when it raises a fee, and by the CRM's pipeline gate.
 */
import type { Db } from '../../core/index.ts';
import { getInvoicesFeeCountByClaimId } from './data.ts';
import type { Need, PipelineClaim } from '../claims/index.ts';

/**
 * THE CLAIM'S OWN LIVE FEE INVOICES — CRM 7 of 10. Raised or sent, and not
 * credited in full. An organisation's invoice, another claim's, a cancelled one
 * and one credited in full are none of them this claim's fee.
 */
export function liveFeeInvoiceCount(db: Db, claim_id: string): number {
  return getInvoicesFeeCountByClaimId<{ n: number }>(db, [claim_id])?.n ?? 0;
}

export type FeeTrigger = 'REPORT_DELIVERED_FOR_FILING' | 'CLIENT_ACCEPTED_REPORT' | 'AMENDED_RETURN_FILED' | 'HMRC_PROCESSED_RELIEF';

/*
 * WHETHER THE FEE TRIGGER IS REACHED IS THE CRM'S TO SAY (its pipeline reads FEE_TRIGGER in one place,
 * src/modules/crm/pipeline.ts feeTriggerReached): A PORT THIS FILE OWNS, handed in by src/modules/crm/ports.ts as the
 * CRM's front door loads, so raising our fee reads it without importing the CRM. Asked before it is handed in, it
 * refuses rather than guess. Asked only while code runs.
 */
export type FeeTriggerReader = (db: Db, c: PipelineClaim, trigger?: FeeTrigger) => Need;

var feeTrigger: FeeTriggerReader | undefined;

export function setFeeTriggerReader(read: FeeTriggerReader): void { feeTrigger = read; }

/** Whether the fee trigger is reached on this claim (the CRM's feeTriggerReached). */
export function feeTriggerReached(db: Db, c: PipelineClaim, trigger?: FeeTrigger): Need {
  if (feeTrigger === undefined) throw new Error('The fee trigger is not set up. The CRM sets it up when it loads, so no fee was raised.');
  return trigger === undefined ? feeTrigger(db, c) : feeTrigger(db, c, trigger);
}
