/**
 * THE CLIENT'S STEP NAMES — BUILT, SWITCHED OFF, AND ASKED. PHASE 133c, 17 September 2026 (B9).
 *
 * The portal names its six steps with the business flow's own labels (src/web/stages.ts), which were written for us and
 * read like a build note to a client: "The engine runs → a narrowed estimate". The proposed names below are a second
 * label set, shown only while the portal-steps switch is on (NAME_SWITCHES in src/web/navigation.ts, shipped OFF). Which
 * set to use is a question for Lakhbir in CAPREBATE QUESTIONS, "The new names and the client's step names - which do we
 * switch on?".
 *
 * CHECKED BEFORE WRITING THEM DOWN, on 17 September 2026:
 *   · against the brand book's avoid list (slide 15): no "guaranteed", "HMRC approved", "we get you", "capital gains",
 *     and no "rebate" as a refund — test/phase133c.test.ts greps the portal under both switch positions;
 *   · against the open solicitor point on whether we submit anything on a client's behalf (register SDP, Phase 132e,
 *     point 1): "5 Claim filed" says the claim is filed and NOT who files it, so it promises neither answer.
 *
 * A STEP'S NAME CHANGES; ITS MEANING DOES NOT. The key, the order and what counts as done are stages.ts's, unchanged.
 */

import { STAGES, type StageKey } from './stages.ts';

export const PROPOSED_STEP_NAMES: Readonly<Record<StageKey, string>> = Object.freeze({
  ASSESSMENT_SUBMITTED: '1 Your estimate',
  ENGAGEMENT_SIGNED: '2 Engagement letter signed',
  RESEARCH_PART_RUN: '3 We research your property',
  AT_SURVEY: '4 Expert sign-off',
  INVOICED: '5 Claim filed',
  PAID: '6 Aftercare',
});

/** A step's name under the switch. */
export function stepName(stage: { readonly key: StageKey; readonly label: string }, proposed: boolean): string {
  return proposed ? PROPOSED_STEP_NAMES[stage.key] : stage.label;
}

/**
 * PHASE 158b (F27, the Friary House run): the line the client's portal shows for a step - "Step 2 of 6: Engagement
 * letter signed" - so the claim page can quote it as the client sees it. The claim page quoted the business flow's own
 * labels with no number, and "Engagement - letter, data & AI consent" read as a step BEFORE "The engine runs" when it is
 * the one after it.
 */
export function portalStepLine(key: StageKey, proposed: boolean): string {
  const i = STAGES.findIndex((s) => s.key === key);
  const s = STAGES[i];
  if (s === undefined) return 'a step the client’s page does not show';
  return `Step ${String(i + 1)} of ${String(STAGES.length)}: ${stepName(s, proposed).replace(/^\d+\s+/, '')}`;
}
