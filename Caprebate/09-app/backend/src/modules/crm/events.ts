/**
 * WHAT THE CRM LISTENS FOR (09-app/docs/ARCHITECTURE.md rule 2). The modules below the CRM announce what happened
 * (src/core/events.ts) and never import it; the CRM does its part here, in the same transaction as their change.
 * Loaded by the CRM's front door.
 */
import { listen } from '../../core/index.ts';
import { stageIndex } from '../../shared/index.ts';
import { getBusinessesStageById, updateBusinessesStageUpdatedAtById } from '../clients/index.ts';
import { onClause13Credit, onFeeInvoiced } from './introducers.ts';

/* The client signed and their portal still said "Step 1 of 6: Your estimate" until staff moved the claim. Signing is
   the step: it raises the client to it, and never lowers one past it. */
listen('letter.signed', 'crm', 'raise the client to engagement signed', (ctx, e) => {
  const now = getBusinessesStageById<{ stage: string }>(ctx.db, [e.business_id])?.stage ?? '';
  if (stageIndex(now) < stageIndex('ENGAGEMENT_SIGNED')) {
    updateBusinessesStageUpdatedAtById(ctx.db, ['ENGAGEMENT_SIGNED', e.signed_at, e.business_id]);
  }
});

/* Reward model C accrues its percentage on the fee AS INVOICED: silent unless C is the setting. */
listen('invoice.raised', 'crm', 'accrue the introducer percentage on a fee invoice', (ctx, e) => {
  if (e.kind !== 'FEE') return;
  onFeeInvoiced({ db: ctx.db, audit: ctx.audit, now: ctx.now, newId: need(ctx.newId) }, actorOf(ctx), e.invoice_id);
});

/* A fee reduced under clause 13 reverses reward model C's percentage on it: a reversing entry, never a delete. */
listen('credit_note.issued', 'crm', 'reverse the introducer percentage on a clause 13 credit', (ctx, e) => {
  if (e.basis !== 'CLAUSE_13_REDUCTION') return;
  onClause13Credit({ db: ctx.db, audit: ctx.audit, now: ctx.now, newId: need(ctx.newId) }, actorOf(ctx), e.credit_note_id);
});

/* Asked only if a row is made (the listener is silent unless model C is the setting). */
function need(newId: (() => string) | undefined): () => string {
  return newId ?? ((): string => { throw new Error('This listener makes a row, so it needs newId.'); });
}

/* The finance module announces with the signed-in person who acted (an Actor). */
function actorOf(ctx: { readonly actor: unknown }): Parameters<typeof onFeeInvoiced>[1] {
  return ctx.actor as Parameters<typeof onFeeInvoiced>[1];
}
