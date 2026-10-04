/**
 * SEEN ON SITE, OR FROM DOCUMENTS — PHASE 153e, 4 October 2026 (Word question 150, the surveyor's).
 *
 * Lakhbir answered "No": whether old equipment was swapped for the same kind cannot be told from a visit alone. The
 * draft in the answer box: reports should separate what was seen on site from what documents showed. Built on our
 * recommendation, for the surveyor to check: every finding (a survey pack line) carries one of two labels.
 *   SEEN ON SITE — the surveyor inspected the building on site (chapter 2 says so) AND set this line's figures or pool
 *                  themselves. Anything less is not "seen on site".
 *   FROM DOCUMENTS — everything else: records, our draft, the client's papers; with "and the client's photos" where the
 *                  client photographed it. A video or photos are not a visit.
 * N4: no inspection basis recorded reads as not seen on site.
 */
import type { Valued, Source } from './pack-sums.ts';

export const FINDING_LABELS = Object.freeze({ SITE: 'Seen on site', DOCUMENTS: 'From documents' });

type LineLike = {
  readonly qty_milli: Valued; readonly rate_pence: Valued; readonly qpct_bp: Valued;
  readonly pool_source?: Source | null;
};

export function findingSeen(basis: string | null, line: LineLike, photos: number): string {
  const surveyorSet = [line.qty_milli.source, line.rate_pence.source, line.qpct_bp.source, line.pool_source ?? null]
    .some((s) => s !== null && s !== undefined && s.kind === 'SURVEYOR');
  if (basis === 'SITE_VISIT' && surveyorSet) return FINDING_LABELS.SITE;
  return photos > 0 ? `${FINDING_LABELS.DOCUMENTS} and the client’s photos` : FINDING_LABELS.DOCUMENTS;
}
