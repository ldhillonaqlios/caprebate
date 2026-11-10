/**
 * ENQUIRY_RETENTION — THE SWITCH, THE PERIOD AND THE QUESTION OF THE CLEAN-UP OF CLOSED WEBSITE ENQUIRIES.
 *
 * Moved here from src/modules/public-site/enquiry-retention.ts (Phase 161l2), which keeps the job itself
 * (`sweepEnquiries`): the enquiries are the client record's table (website_enquiries), and the claims' case stamp
 * records whether the switch is on, so the switch sits where both can read it, as MESSAGE_RETENTION does
 * (src/modules/clients/message-retention.ts). The values are unchanged: OFF until the data protection officer approves.
 */

export type EnquiryRetention = {
  readonly enabled: boolean;
  /** Months after the enquiry was closed. Null: off. */
  readonly closed_months: number | null;
  readonly approved_by: string | null;
  readonly review_ref: string | null;
  readonly question: string;
};

export const ENQUIRY_RETENTION_QUESTION = 'How long do we keep a closed website enquiry before it is deleted?';
export const ENQUIRY_RETENTION_RULE = 'ENQ-RETENTION';

/** OFF, with our recommended twelve months written in, waiting for the officer's approval and its record. */
export const ENQUIRY_RETENTION: EnquiryRetention = Object.freeze({
  enabled: false,
  closed_months: 12,
  approved_by: null,
  review_ref: null,
  question: ENQUIRY_RETENTION_QUESTION,
});

const textOrNull = (s: string | null): string | null => (s !== null && s.trim().length >= 2 ? s.trim() : null);

export function enquiryRetentionMissing(cfg: EnquiryRetention): string[] {
  const out: string[] = [];
  if (!(cfg.closed_months !== null && Number.isInteger(cfg.closed_months) && cfg.closed_months >= 1)) out.push('Set how long a closed enquiry is kept. The data protection officer decides.');
  if (textOrNull(cfg.approved_by) === null || textOrNull(cfg.review_ref) === null) out.push('Record who approved it, and where.');
  if (cfg.enabled !== true) out.push('Then switch the clean-up on.');
  return out;
}
