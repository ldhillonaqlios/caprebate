/**
 * WHAT THE CLIENT RECORD ASKS THE CLAIMS (Phase 161l2; 09-app/docs/ARCHITECTURE.md rule 2). The claims sit above the
 * client record in the order, so it never imports them: it owns these ports, and the claims' front door fills them as
 * it loads (src/modules/claims/client-ports.ts). Asked while a request runs, never while files load.
 *
 *   claim references  an introducer's fees name their claims (src/modules/clients/introducers.ts feeList): the
 *                     reference of each claim named, and only the claims that are there (what JOIN claims gave).
 */
import type { Db } from '../../core/index.ts';

type ClaimRefsReader = (db: Db, claim_ids: readonly string[]) => ReadonlyMap<string, unknown>;
var claimRefs: ClaimRefsReader | undefined;
export function setClaimRefsReader(read: ClaimRefsReader): void { claimRefs = read; }
/** The reference of each claim named that is there, by its id. Fails loudly when the claims have not handed in their reader. */
export function claimRefsFor(db: Db, claim_ids: readonly unknown[]): ReadonlyMap<string, unknown> {
  if (claimRefs === undefined) throw new Error('The claims\' references are not set up. The claims set them up when they load, so nothing was read.');
  return claimRefs(db, [...new Set(claim_ids.filter((x): x is string => typeof x === 'string'))]);
}
