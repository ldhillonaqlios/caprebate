/**
 * MESSAGE_RETENTION, THE SWITCH OF THE CLEAN-UP JOB FOR BOTH CHAT THREADS (Phase 161l1, carved from
 * src/modules/crm/message-retention.ts unchanged): its periods, who approved them, and the question they answer. The job
 * itself is the CRM's (src/modules/crm/message-retention.ts, sweepMessages); the switch is read by the claims' case stamp
 * and the compliance's retention list too.
 */

export type MessageRetention = {
  readonly enabled: boolean;
  /** Years after the claim file's clock starts, on a company with a claim. Null: that rule is off. */
  readonly with_claim_years: number | null;
  /** Months after the last message, on a company with no claim (and after a newer message's own day). Null: that rule is off. */
  readonly without_claim_months: number | null;
  /** Who approved the periods — the data protection officer. Written into every deletion log entry. */
  readonly approved_by: string | null;
  /** Where that approval is recorded. Written into every deletion log entry. */
  readonly review_ref: string | null;
  readonly question: string;
};

/** The title of the question for the data protection officer in CAPREBATE QUESTIONS. Quoted, not paraphrased. */
export const MESSAGE_RETENTION_QUESTION = 'How long do we keep client messages and the team chat?';

/**
 * ON. the owner answered the question: messages are kept for seven years — from the claim
 * file's clock on a company with a claim, and from the last message on one without (the recommended clocks, with seven
 * years in place of six and of twelve months) — and asked for the job to be switched on now, before the data protection
 * officer signs. The officer's approval is still asked for on the register FOR THE SOLICITOR, THE DPO AND THE DEVELOPER.
 */
export const MESSAGE_RETENTION: MessageRetention = Object.freeze({
  enabled: true,
  with_claim_years: 7,
  without_claim_months: 84,
  approved_by: 'The owner (Head of Business Development)',
  review_ref: 'CAPREBATE QUESTIONS, "How long do we keep client messages and the team chat?", answered 22 September 2026',
  question: MESSAGE_RETENTION_QUESTION,
});
