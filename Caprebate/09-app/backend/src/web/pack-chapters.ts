/**
 * THE SURVEY PACK'S 23 CHAPTERS — one list, read by the pages (src/web/survey-pack-pages.ts) and by approval
 * (src/web/pack-approve.ts): every chapter that is built must be opened before the pack can be approved.
 */
/** The report's 23 chapters, in the report template's order (surveyor-valuation-report-template-v2.md). */
/* PHASE 153f, 4 October 2026: chapters 1, 3, 6, 12, 13 and 21 built — each shows what the pack already holds.
   PHASE 153g, the same day: the other ten (5, 8, 11, 14, 16, 17, 18, 19, 20, 22), from src/web/pack-sheets.ts, with the
   surveyor's own words where the template asks for them (src/web/pack-words.ts). Every chapter is now built. */
export const CHAPTERS: readonly { readonly n: number; readonly title: string; readonly built: boolean }[] = Object.freeze([
  { n: 1, title: 'Report and property', built: true }, { n: 2, title: 'Your inspection', built: true },
  { n: 3, title: 'Purpose and basis', built: true }, { n: 4, title: 'Summary', built: true },
  { n: 5, title: 'The building', built: true }, { n: 6, title: 'Room schedule', built: true },
  { n: 7, title: 'The legal check', built: true }, { n: 8, title: 'Dwellings', built: true },
  { n: 9, title: 'Price, land and floor area', built: true }, { n: 10, title: 'Rebuild cost and split', built: true },
  { n: 11, title: 'Bare land', built: true }, { n: 12, title: 'Fixtures, item by item', built: true },
  { n: 13, title: 'Pools', built: true }, { n: 14, title: 'Qualifying share', built: true },
  { n: 15, title: 'Grants and VAT', built: true }, { n: 16, title: 'Leaseback', built: true },
  { n: 17, title: 'Structures allowance', built: true }, { n: 18, title: 'Other reliefs', built: true },
  { n: 19, title: 'Judgement calls', built: true }, { n: 20, title: 'Repairs or capital', built: true },
  { n: 21, title: 'Limits', built: true }, { n: 22, title: 'Findings', built: true }, { n: 23, title: 'Sign', built: true },
]);

/** The chapters the surveyor must open before approving: every built one, but the signing chapter itself. */
export function chaptersToRead(): readonly number[] {
  return CHAPTERS.filter((c) => c.built && c.n !== 23).map((c) => c.n);
}
