/**
 * THE SURVEY PACK'S 23 CHAPTERS — one list, read by the pages (src/web/survey-pack-pages.ts) and by approval
 * (src/web/pack-approve.ts): every chapter that is built must be opened before the pack can be approved.
 */
/** The report's 23 chapters, in the report template's order (surveyor-valuation-report-template-v2.md). */
export const CHAPTERS: readonly { readonly n: number; readonly title: string; readonly built: boolean }[] = Object.freeze([
  { n: 1, title: 'Report and property', built: false }, { n: 2, title: 'Your inspection', built: true },
  { n: 3, title: 'Purpose and basis', built: false }, { n: 4, title: 'Summary', built: true },
  { n: 5, title: 'The building', built: false }, { n: 6, title: 'Room schedule', built: false },
  { n: 7, title: 'The legal check', built: true }, { n: 8, title: 'Dwellings', built: false },
  { n: 9, title: 'Price, land and floor area', built: true }, { n: 10, title: 'Rebuild cost and split', built: true },
  { n: 11, title: 'Bare land', built: false }, { n: 12, title: 'Fixtures, item by item', built: false },
  { n: 13, title: 'Pools', built: false }, { n: 14, title: 'Qualifying share', built: false },
  { n: 15, title: 'Grants and VAT', built: true }, { n: 16, title: 'Leaseback', built: false },
  { n: 17, title: 'Structures allowance', built: false }, { n: 18, title: 'Other reliefs', built: false },
  { n: 19, title: 'Judgement calls', built: false }, { n: 20, title: 'Repairs or capital', built: false },
  { n: 21, title: 'Limits', built: false }, { n: 22, title: 'Findings', built: false }, { n: 23, title: 'Sign', built: true },
]);

/** The chapters the surveyor must open before approving: every built one, but the signing chapter itself. */
export function chaptersToRead(): readonly number[] {
  return CHAPTERS.filter((c) => c.built && c.n !== 23).map((c) => c.n);
}
