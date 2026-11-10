/**
 * THE CLIENT'S ACCOUNTANT'S OWN CONFIRMATIONS, AS THE CRM ASKS THE PORTAL FOR THEM, THROUGH A PORT THE CRM OWNS
 * (Phase 161l2; 09-app/docs/ARCHITECTURE.md rule 2).
 *
 * The accountant answers by their own private link (src/modules/portal/accountant-confirm.ts), and the portal keeps the
 * requests and the answers (its tables). The back office's claim page shows the block of those confirmations, and the
 * pipeline's Reports gate needs the accountant's own "the claim fits the return" answer; both are CRM screens and rules,
 * and the CRM sits below the portal, so it cannot import them. The portal hands both in as its front door loads
 * (src/modules/portal/ports.ts), and the CRM asks here. Each is the portal's own function, unchanged.
 *
 * Asked before they are handed in, it refuses rather than draw a claim page or decide a gate without the accountant's
 * answer. Asked only while code runs. Declared with `var`, so a hand-in that comes while this file is still loading is
 * kept.
 */
import type { Actor, Db } from '../../core/index.ts';
import type { Safe } from '../../shared/index.ts';

/** A gate's need, as the pipeline reads it: what is needed, whether it is met, and why. */
export type AccountantNeed = { readonly what: string; readonly met: boolean; readonly why: string };

export type AccountantConfirmations = {
  /** The Reports gate's need on the accountant route: a confirmed RETURN_FIT answered since the claim entered Reports. */
  readonly accountantFitNeed: (db: Db, claim_id: string, since: string) => AccountantNeed;
  /** The claim page's block of the accountant's confirmations. */
  readonly accountantConfirmBlock: (db: Db, actor: Actor, claim_id: string) => Safe;
};

var parts: AccountantConfirmations | undefined;

/** The portal hands in the accountant's confirmations (src/modules/portal/ports.ts). */
export function setAccountantConfirmations(p: AccountantConfirmations): void { parts = p; }

/** The accountant's confirmations, as the claim page and the pipeline's gate ask them. */
export function accountantConfirmations(): AccountantConfirmations {
  if (parts === undefined) throw new Error('The accountant\'s confirmations are not set up. The portal sets them up when it loads, so the claim cannot be read without them.');
  return parts;
}
