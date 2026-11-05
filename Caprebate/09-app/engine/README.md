# `@caprebate/engine` — the claim calculator

**Change the calculator in engine/src; the page is built from it.**

This package is the only source of the claim calculator: the shared rules
(`CB_PLANT`, `CB_FEE`, `CB_CASH` and the rest) and the five sector calculators
(care homes, dental, supported living, GP, private hospitals). The website page
`Caprebate site.html` carries a copy that is **built from this package**, never
typed by hand.

## To change the calculator

1. Edit the file in `src/calculator/`:
   - `shared.js` for the shared rules;
   - `sector-<sector>.js` for one sector.
   Edit only between the `@@CAPREBATE-PAGE-OPEN@@` and `@@CAPREBATE-PAGE-CLOSE@@`
   lines. That is the part that goes into the page. Above it is this package's
   own wrapper; below it is `module.exports`.
2. From `Caprebate/09-app/engine`, run:

   ```bash
   npm run page
   ```

   This builds the calculator into `dist/page/` (`tools/build.cjs`), writes it
   into `Caprebate site.html` (`tools/page-from-engine.cjs`), and brings the back
   end's copy of the page up to date (`09-app/backend/copies/`).
3. Run the checks (below), then commit `src/calculator/`, the site file and the
   back end's copy together.

**Never edit the calculator inside `Caprebate site.html`.** The next
`npm run page` would overwrite it, and until then `tools/verify-page.cjs` (and
the back end's `npm run check`) fails, naming the file to change instead.

A new `CB_` module in `shared.js` must also be added to `module.exports` at the
end of `shared.js` and to the `const { ... } = SHARED;` line of each sector
file. The build stops and says so if one is missing.

## Where the calculator runs

- **The test website** runs this package on the server: the back end imports
  `src/index.ts` through `backend/src/web/engine.ts`. The served page leaves out
  its own copy of the calculator (it sits inside the in-page assessment, which
  the served page drops).
- **The page's copy** is used when the file is opened on its own, by the
  regression harness (its default mode) and by the proofs in `03-app/`.

The two are the same text, byte for byte, and the checks keep them so.

## The checks

```bash
node tools/verify-page.cjs              # the page carries exactly the built engine; the must-nots; the switches
node tools/verify-page.cjs --self-test  # a planted edit to the calculator in the page turns the check red
node tools/build.cjs --check            # the derived types (src/calculator/session.d.ts) are up to date
npm run typecheck                       # strict TypeScript over the package (needs npm install)
npm run typecheck:types                 # the N4 type assertions (needs npm install)
```

From the project folder (`Caprebate/`), the regression harness runs against the
page and against this package, and the two totals must match:

```bash
node 03-app/caprebate-regression.cjs
node 03-app/caprebate-regression.cjs --package
```

## What the calculator must never do

Facts in, estimate out. No network calls, no DOM, no storage, no secrets, no
`process.env`. Every tax adviser switch stays `false` and the free-register gate
stays shut until the person who owns each decision says otherwise.
`tools/verify-page.cjs` checks all of these. `EXTRACTION.md` has the history and
the reasons, including non-negotiable N4 (an unknown fact is never a default).
