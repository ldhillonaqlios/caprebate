/**
 * THE NEXT STEP, IN PLAIN WORDS — PHASE 133c, 17 September 2026.
 *
 * A gate's needs are written for the record: "The surveyor’s commitment is recorded, on a survey job on this claim".
 * A person new to the system needs the answer first: what is still needed, and the one thing that fixes it. This file
 * holds that translation, in ONE table, and decides nothing. Whether a gate is open is still `gateOut` in
 * src/web/pipeline.ts, read on the request; a move is still refused on the server when the gate is not open, whatever
 * the card shows.
 *
 * A need this table does not know is shown in its own words, so a new gate can never be hidden by a missing row.
 * test/phase133c.test.ts reads every stage's needs on the seed and requires each to have a plain reading.
 *
 * THE ANCHORS are the claim page's own (src/web/crm-pages.ts): #move, #claim-facts, #claim-documents, #claim-tasks,
 * #add-task, #claim-deliverables, #claim-figures.
 */

export type PlainNeed = { readonly words: string; readonly fix: { readonly href: string; readonly label: string } | null };

const TABLE: readonly (readonly [RegExp, PlainNeed])[] = [
  [/^The property is healthcare property in the UK/, { words: 'Confirm it is UK healthcare property', fix: { href: '#enquiry-gate', label: 'Record the check' } }],
  [/^The client is a trading business/, { words: 'Confirm the client is a trading business', fix: { href: '#enquiry-gate', label: 'Record the check' } }],
  [/^The enquirer is the owner/, { words: 'Confirm who owns the building, or that the enquirer acts for the owner', fix: { href: '#enquiry-gate', label: 'Record the check' } }],
  [/^There is no existing claim conflict/, { words: 'Confirm no conflicting claim, ours or another adviser’s, on this property', fix: { href: '#enquiry-gate', label: 'Record the check' } }],
  [/^An assessment is on record/, { words: 'An assessment from the client', fix: { href: '#add-task', label: 'Ask the client' } }],
  [/^A signed engagement letter/, { words: 'The signed engagement letter', fix: { href: '#add-task', label: 'Chase the letter' } }],
  [/due diligence/i, { words: 'Customer due diligence', fix: { href: '/staff/compliance/aml', label: 'Open due diligence' } }],
  [/^No unresolved s\.198 or s\.199 election/, { words: 'An answer on the s.198 or s.199 election', fix: { href: '#claim-facts', label: 'Record the fact' } }],
  [/^Data gathering complete/, { words: 'Confirm the data gathering is complete', fix: { href: '#move', label: 'Confirm it' } }],
  [/ is received — /, { words: 'A required document from the client', fix: { href: '#claim-documents', label: 'Request a document' } }],
  [/^The surveyor’s commitment is recorded/, { words: 'The surveyor’s figures', fix: { href: '#add-task', label: 'Ask the surveyor' } }],
  [/^Every grant or contribution traced/, { words: 'Trace every grant to the costs it paid for', fix: { href: '#claim-facts', label: 'Record the fact' } }],
  // Phase 153a (src/web/grant-checks.ts): the grant papers or the tax adviser's view; the client's check with the payer.
  [/^No grant is split in equal share/, { words: 'The grant papers, or the tax adviser’s view on splitting a grant', fix: { href: '#claim-grants', label: 'Open the grants' } }],
  [/^The client has checked with whoever paid/, { words: 'The client’s confirmation that they checked with whoever paid the grant', fix: { href: '#claim-grants', label: 'Record it' } }],
  // Phase 158c: the surveyor's own approval of the survey pack (F34, F35), the client's acceptance in their portal (F39),
  // the invoice sent (F41) and the filing recorded (F42). Staff ticks no longer stand in for any of them.
  [/^The surveyor approved and signed the survey pack/, { words: 'The surveyor’s approval of the survey pack', fix: { href: '#add-task', label: 'Ask the surveyor' } }],
  [/^The tax adviser’s sign-off is on record/, { words: 'The tax adviser’s sign-off', fix: { href: '#claim-figures', label: 'Record the sign-off' } }],
  [/^The client report is issued/, { words: 'Issue the client report', fix: { href: '#claim-deliverables', label: 'Open the reports' } }],
  [/^The accountant’s computation pack is issued/, { words: 'Issue the accountant’s computation pack', fix: { href: '#claim-deliverables', label: 'Open the reports' } }],
  [/^The defence pack is issued/, { words: 'Issue the defence pack', fix: { href: '#claim-deliverables', label: 'Open the reports' } }],
  [/^The client accepted the report/, { words: 'The client’s acceptance of the report, in their portal', fix: { href: '#add-task', label: 'Ask the client' } }],
  // Phase 158d (F46): the accountant answers through their own link; nobody here ticks it.
  [/^The client’s accountant confirmed/, { words: 'The accountant’s own confirmation that the claim fits the return', fix: { href: '#accountant-confirm', label: 'Send them the link' } }],
  [/^The client confirmed in writing/, { words: 'The client’s written confirmation that they will file the amendment', fix: { href: '#claim-facts', label: 'Record it' } }],
  [/^The claim is within the amendment window/, { words: 'The claim must go in inside the amendment window', fix: { href: '#claim-facts', label: 'Check the dates' } }],
  [/^The amendment window is open/, { words: 'The amendment window must still be open', fix: { href: '#claim-facts', label: 'Check the dates' } }],
  [/^The fee trigger is reached/, { words: 'The point at which our fee is due', fix: { href: '#move', label: 'Confirm it' } }],
  [/^Our fee invoice is sent/, { words: 'Our fee invoice, sent to the client', fix: { href: '#add-task', label: 'Ask Accounting' } }],
  [/^The claim’s filing is recorded/, { words: 'The date the claim was filed', fix: { href: '#claim-figures', label: 'Record the filing' } }],
];

/** The plain reading of one need. Unknown wording is shown as it is, with no invented action. */
export function plainNeed(what: string): PlainNeed {
  for (const [re, p] of TABLE) if (re.test(what)) return p;
  return { words: what, fix: null };
}

/** Whether the table has a row for this wording — what the phase test asks of every need on the seed. */
export function hasPlainReading(what: string): boolean {
  return TABLE.some(([re]) => re.test(what));
}

type GateLike = { readonly open: boolean; readonly needs: readonly { readonly what: string; readonly met: boolean }[] };
type MovesLike = { readonly forward: { readonly to: string; readonly label: string; readonly open: boolean } | null } | undefined;

export type Step =
  | { readonly kind: 'move'; readonly action: string; readonly to: string; readonly label: string }
  | { readonly kind: 'wait'; readonly needed: string; readonly fix: { readonly href: string; readonly label: string } | null; readonly more: string }
  | { readonly kind: 'go'; readonly words: string; readonly href: string; readonly label: string }
  | { readonly kind: 'none'; readonly words: string };

/**
 * A CLAIM'S NEXT STEP, from the pipeline panel its view already carries. Nothing for a login whose view carries no moves
 * (the surveyor, read only): they see the stage bar, and no button they could not press.
 */
export function claimNextStep(claim_id: string, gate: GateLike | undefined, moves: MovesLike, hold: { readonly returns_to: string } | undefined): Step | null {
  if (moves === undefined) return null;
  if (hold !== undefined) return { kind: 'none', words: `On hold. It goes back to ${hold.returns_to} when it is resumed.` };
  if (moves.forward === null) return null;
  if (gate !== undefined && !gate.open) {
    const first = gate.needs.find((n) => !n.met);
    const p = first === undefined ? { words: 'Nothing is recorded that this stage needs yet', fix: null } : plainNeed(first.what);
    return { kind: 'wait', needed: p.words, fix: p.fix, more: '#stage-needs' };
  }
  return { kind: 'move', action: `/staff/claims/${claim_id}/stage`, to: moves.forward.to, label: moves.forward.label };
}

/** A LEAD'S NEXT STEP: convert when every enquiry check is a recorded yes, otherwise the first check still needed. */
export function leadNextStep(enquiry: GateLike, mayConvert: boolean, mayWrite: boolean): Step | null {
  if (!mayWrite) return null;
  if (enquiry.open) {
    return mayConvert ? { kind: 'go', words: 'Every enquiry check is a yes.', href: '#convert', label: 'Convert and open the claim' } : null;
  }
  const first = enquiry.needs.find((n) => !n.met);
  const p = first === undefined ? { words: 'Record the enquiry checks', fix: { href: '#enquiry-gate', label: 'Record the check' } } : plainNeed(first.what);
  return { kind: 'wait', needed: p.words, fix: p.fix, more: '#enquiry-gate' };
}
