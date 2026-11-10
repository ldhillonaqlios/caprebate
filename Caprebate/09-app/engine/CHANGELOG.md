# The claim calculator's change log

Every change to `src/calculator/` raises the engine's version in `package.json` and adds a heading here, newest
first: what changed, why, and whether any figure moves. `tools/engine-version.cjs` (run by `npm run verify`) fails a
calculator change without a new version, and a version without a heading here. A result the back end has sealed
(an estimate, a survey pack, a report, an invoice) records the version it was made with and keeps its figures.

## 0.1.0 - 10 Nov 2026

The calculator as it stood when versions began to be recorded (Phase 161m). Its earlier history is in git: it was
taken out of the site file into this package in Phase 102 and became the page's only source in Phase 161f (5 Nov
2026); Phase 161k changed two comments. No figure moves.
