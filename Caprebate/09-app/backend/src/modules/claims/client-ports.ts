/**
 * WHAT THE CLIENT RECORD ASKS THE CLAIMS, handed in to the ports it owns (src/modules/clients/claims-port.ts) as the
 * claims' front door loads (Phase 161l2): the references of the claims an introducer's fees name. The statement is the
 * claims' own (data.ts).
 */
import { setClaimRefsReader } from '../clients/index.ts';
import { listClaimsIdBusinessIdStageClaimRefByIds } from './data.ts';

setClaimRefsReader((db, ids) => new Map(ids.length === 0 ? []
  : listClaimsIdBusinessIdStageClaimRefByIds<{ id: string; claim_ref: unknown }>(db, [JSON.stringify(ids)]).map((c) => [c.id, c.claim_ref])));
