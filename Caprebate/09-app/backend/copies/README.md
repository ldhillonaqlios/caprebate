# The app's own copies — do not edit these files

Phase 161d1, 5 November 2026. The application reads these five files from here, so that nothing it runs reads
anything outside `Caprebate/09-app` (the ITRoadway audit, 2 November 2026, section 5). Each is an exact copy of a file
that people edit somewhere else, and that other checks read there:

| The copy here | The original, which is the one to edit | Read by |
|---|---|---|
| `Caprebate site.html` | `Caprebate site.html` in `Development/` | `src/web/public-site.ts` |
| `caprebate-notices-page.html` | `Caprebate/03-app/caprebate-notices-page.html` | `src/web/notices-site.ts` |
| `Caprebate-Fixture-Taxonomy-v1.csv` | `Caprebate/02-modules-and-build-prep/Caprebate-Fixture-Taxonomy-v1.csv` | `src/web/pack-lines.ts` |
| `Caprebate Engagement Letter.docx` | `Caprebate/06-commercial-and-governance/Caprebate Engagement Letter.docx` | `src/web/letter.ts` |
| `Caprebate Engagement Letter - TEST DEFAULTS, not agreed.docx` | the same name, in `Caprebate/06-commercial-and-governance/` | `src/web/letter.ts` (the test website only) |

**Edit the original, never the copy. Then, in `Caprebate/09-app/backend`, run `npm run copies`.** `npm run check`
(`npm run lint:copies`, `tools/app-copies.cjs`) fails while any copy here is missing or differs from its original by a
single byte, and while this folder holds a file it does not know.
