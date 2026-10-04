/**
 * THE REPORT'S ASSUMPTIONS — PHASE 153e, 4 October 2026 (Word question 145, the surveyor's).
 *
 * The planning assumption moves the land value, and a higher land value means a smaller claim, so it is stated on the
 * face of every report. Built on our recommendation, for the surveyor to approve or reword: Lakhbir's wording (recorded
 * 25 September) and the draft in the answer box agree. A TEST READING: until the surveyor approves it, each approved
 * version carries these words (frozen into the snapshot at approval, so a version approved before shows none), and the
 * surveyor-facing template carries the same (04-phase-work/phase9/surveyor-valuation-report-template-v2.md, sections 11
 * and 21).
 */
export const PLANNING_ASSUMPTION =
  'We assume the property’s current use is lawful, and that no planning limits or enforcement we have not been told about affect its value. ' +
  'We did not check the planning records, unless this report says so. Any planning permission, limit or doubt we know of is named separately.';

export const REPORT_ASSUMPTIONS: readonly string[] = Object.freeze([PLANNING_ASSUMPTION]);
