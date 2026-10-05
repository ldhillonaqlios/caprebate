/**
 * TWO MORE THINGS THE GATE OUT OF VALUATION ASKS ABOUT GRANTS — Phase 153a, 4 October 2026.
 * (Phase 153b lines 12 and 13, done with Phase 153a line 1 because they read the same grant data.)
 *
 *   NO GRANT SPLIT IN EQUAL SHARE WITHOUT ITS PAPERS OR THE TAX ADVISER'S VIEW. Word question 109, "How should we split
 *   a grant when we cannot tell what it paid for?": our recommendation is to keep the equal share only as a labelled
 *   estimate and, before filing, split the grant from its papers or ask the tax adviser. The survey pack takes a grant
 *   in equal share (src/web/pack-grants.ts) whenever it is not matched to rows of the fixture list — and, while
 *   CB_CTA.grant_traced_to_elements is off as it ships, always. So while any grant on the claim would be taken that way,
 *   the gate needs the grant papers received on the claim (a grant or NHS premises funding agreement) or the tax
 *   adviser's view recorded (GRANT_SPLIT_ADVISER_VIEW, YES, with the tax adviser as its source).
 *
 *   THE CLIENT HAS CHECKED WITH WHOEVER PAID. Word question 110, "Is a warning enough when claiming relief might force
 *   a grant to be repaid?": our recommendation is to flag it, name the grant conditions and get the client's
 *   confirmation before including the cost. Every sector, every grant or contribution but insurance money:
 *   GRANT_PROVIDER_CHECKED must be YES.
 *
 * N4: a fact not recorded, recorded as not known, or (for the adviser's view) recorded by anyone but the tax adviser
 * opens nothing. With no grant left on the claim both are met — there is nothing to split and nobody to check with —
 * and the existing check, every grant traced (src/web/claim-facts.ts, grantsTraced), still asks whether there are any.
 */
import type { Db } from '../db.ts';
import type { Need } from './pipeline.ts';
import { latestFacts, packGrantsFor } from './claim-facts.ts';
import { receivedOnClaim } from './mandatory-documents.ts';
import { grantRoute, type GrantSwitches } from './pack-grants.ts';
import { CTA } from './engine.ts';

/** The two switches the survey pack reads, as they ship. */
export function shippedGrantSwitches(): GrantSwitches {
  const t = CTA as unknown as Record<string, unknown>;
  return { element_trace: t['grant_traced_to_elements'] === true, connected_no_reduction: t['connected_contributor_no_reduction'] === true };
}

export const SPLIT_NEED = 'No grant is split in equal share without its papers or the tax adviser’s view';
export const PROVIDER_NEED = 'The client has checked with whoever paid each grant that claiming will not make them pay it back';

/** The grant papers the split check accepts: the Stage 2 upload list's grant or NHS premises funding agreement. */
export const GRANT_PAPERS_TYPE = 'GRANT_FUNDING_AGREEMENT';

export function grantSplitNeed(db: Db, c: { id: string }, sw: GrantSwitches = shippedGrantSwitches()): Need {
  const shared = packGrantsFor(db, c.id).filter((g) => grantRoute(g, sw).route === 'EQUAL_SHARE');
  if (shared.length === 0) return { what: SPLIT_NEED, met: true, why: 'No grant on this claim is taken off in equal share.' };
  const many = shared.length === 1 ? 'One grant is' : `${String(shared.length)} grants are`;
  const papers = receivedOnClaim(db, c, GRANT_PAPERS_TYPE);
  if (papers !== undefined) return { what: SPLIT_NEED, met: true, why: `${many} taken off in equal share, and the grant papers have been received on this claim, to split it from.` };
  const v = latestFacts(db, c.id).get('GRANT_SPLIT_ADVISER_VIEW');
  if (v !== undefined && v.answer === 'VALUE' && v.value_text === 'YES' && v.source_id === 'CTA') {
    return { what: SPLIT_NEED, met: true, why: `${many} taken off in equal share, and the tax adviser’s view on the split is recorded.` };
  }
  const recordedByOther = v !== undefined && v.answer === 'VALUE' && v.value_text === 'YES' && v.source_id !== 'CTA';
  return {
    what: SPLIT_NEED, met: false,
    why: `${many} taken off in equal share — a rough estimate. Before the claim moves on, receive the grant papers on the claim, or record the tax adviser’s view.${
      recordedByOther ? ' The view recorded is not from the tax adviser, so it does not count.' : ''}`,
  };
}

export function grantProviderNeed(db: Db, c: { id: string }): Need {
  const grants = packGrantsFor(db, c.id).filter((g) => g.payer_class !== 'insurer');
  if (grants.length === 0) return { what: PROVIDER_NEED, met: true, why: 'No grant or contribution on this claim to check.' };
  const v = latestFacts(db, c.id).get('GRANT_PROVIDER_CHECKED');
  if (v !== undefined && v.answer === 'VALUE' && v.value_text === 'YES') return { what: PROVIDER_NEED, met: true, why: 'The client has confirmed it.' };
  if (v !== undefined && v.answer === 'VALUE' && v.value_text === 'NO') {
    return { what: PROVIDER_NEED, met: false, why: 'The client has said they have not checked. Claiming on something a grant paid for can make them pay the grant back.' };
  }
  return { what: PROVIDER_NEED, met: false, why: 'Not confirmed yet. Not sure or not known never passes.' };
}
