/**
 * THE RANGE THE CLIENT WAS SHOWN — ONE NUMBER, ONE FORMATTER, THREE SCREENS.
 *
 * The phase brief: "Show the range exactly as the client was shown it. If the
 * staff view and the client view of the same number ever differ, that is a
 * defect, and a test should assert they do not."
 *
 * THE DEFECT IT IS GUARDING AGAINST IS ROUNDING, NOT WORDING, AND THAT IS WHY
 * THIS FILE EXISTS RATHER THAN A SHARED CONSTANT. `assessments` stores integer
 * PENCE; the funnel computes in POUNDS as a float. Round the float for the
 * client's screen and round the pence for the staff screen and the two agree
 * almost always — `£1,234.4999` becomes £1,234 for the client and £1,235 for
 * the back office, because rounding twice is not rounding once. "Almost always"
 * is the worst possible property for a number a client is quoted and a staff
 * member later reads back to them on the telephone.
 *
 * SO THERE IS ONE CONVERSION AND ONE FORMATTER. Pounds become pence exactly
 * once, at `toPence`, and every screen renders `formatPence` of that integer —
 * the assessment's own figure page, the client's portal, and the staff
 * assessment list and detail. Four screens, one function, no second rounding.
 *
 * A test drives the funnel over HTTP, scrapes the figure the client was given,
 * and asserts the same string appears on the staff page. It compares RENDERED
 * OUTPUT rather than two calls to this module, because two calls to the same
 * function agreeing proves nothing about whether both screens call it.
 */

/** Pounds to pence. THE ONLY PLACE THAT CONVERSION HAPPENS. */
export function toPence(pounds: number): number | null {
  if (typeof pounds !== 'number' || !Number.isFinite(pounds)) return null;
  return Math.round(pounds * 100);
}

/**
 * Pence to the string every screen shows. Whole pounds — an indicative ceiling
 * quoted to the penny would claim a precision the band arithmetic does not have.
 *
 * AN ABSENT FIGURE IS NOT ZERO. `null` renders as an em dash and the caller says
 * in words why there is no figure; a `£0` would read as "you are entitled to
 * nothing", which is a different and much stronger claim than "we have not
 * worked one out". N4, on a screen.
 */
export function formatPence(pence: number | null | undefined): string {
  if (pence === null || pence === undefined || !Number.isFinite(pence)) return '—';
  return `£${Math.round(pence / 100).toLocaleString('en-GB')}`;
}

export type ShownRange = {
  readonly low_pence: number | null;
  readonly high_pence: number | null;
};

/**
 * The figure the client was shown, as one line: "up to £X".
 *
 * THE HIGH END IS THE FIGURE. `CB_FUNNEL.figure` produces a CEILING and the
 * client's screen says so in terms — "A ceiling, not a forecast … researching
 * the property will move it DOWN, not up". So this renders "up to £X" and not a
 * bare number, because a bare number is the one thing that phrasing exists to
 * prevent.
 *
 * PHASE 159a (E3; Lakhbir, 9 October 2026: "always show the up to number"): AND
 * NEVER A RANGE. The client is shown "up to £X" alone, so the lead, the claim
 * record, the staff assessment pages and the portal show that too. They showed
 * "£130,000 to £260,000", a low end the client never saw, and one the engine's own
 * low did not support. The stored low stays where it is, an internal reading for
 * the reconciliation; it is not drawn on any screen through here.
 */
export function formatShownRange(r: ShownRange): string {
  const hi = r.high_pence;
  if (hi === null || hi === undefined) return 'no figure was shown';
  return `up to ${formatPence(hi)}`;
}

/** The qualifier that travels with every one of these figures, in one place. */
export const RANGE_QUALIFIER =
  'Indicative, and a ceiling rather than a forecast — built only from what the client told us. ' +
  'Nothing has been looked up.';
