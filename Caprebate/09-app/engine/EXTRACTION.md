# How the calculator gets into the page, and how to keep it honest

**Change the calculator in engine/src; the page is built from it.**

**Turned round by Phase 161f, 5 November 2026**, from the ITRoadway technical
audit (2 November 2026, section 5): *"The claim calculator is stored in an
unusual way. It is copied out of one very large web page file and can't be
edited directly, which makes it easy to change the wrong file by mistake."*
Phase 102 (8 September 2026) first lifted the engine out of the page; until
Phase 161f the page was the source and this package was the copy. Now this
package is the source and the page is the copy. `README.md` beside this file is
the short version.

---

## The rule

**The calculator is edited in one place: `src/calculator/` in this package.**

| What | Where | Who writes it |
|---|---|---|
| The shared `CB_` layer | `src/calculator/shared.js`, between its PAGE fences | a person |
| Each sector calculator | `src/calculator/sector-<sector>.js`, between its PAGE fences | a person |
| The built calculator | `dist/page/` (not committed) | `tools/build.cjs` |
| The calculator in the page | `Caprebate site.html`, in the engine script | `tools/page-from-engine.cjs` |
| The back end's copy of the page | `09-app/backend/copies/Caprebate site.html` | `tools/app-copies.cjs --write` (run by the page tool) |
| The derived session types | `src/calculator/session.d.ts` | `tools/build.cjs` |

`npm run page` does the three writing steps in order. `tools/extract.cjs`, which
copied the page into the package, was **retired** by Phase 161f: nothing copies
the page into the engine any more.

**Nothing else changed in Phase 161f.** The text between the fences is the same
text, byte for byte, that the extractor had cut from the page, and the page was
already exactly the built engine: running `npm run page` on the first build left
`Caprebate site.html` unchanged.

---

## Where the parts sit in the page

The page holds the calculator in the same places it always has, and these are
the same boundaries the regression harness uses to lift the engine, so the
page, the harness and this package cannot disagree about what "the calculator"
is:

| Part | In the page, from | to |
|---|---|---|
| `shared.js` | `var CB_PLANT` | `/* ===== care_homes` |
| `sector-<sector>.js` | just inside the `(function(){` after `/* ===== <sector> ===== */` | that sector's `RENDERER` banner |

Below each sector's `RENDERER` banner is the page's own code that draws the
flow (DOM code). It belongs to the page, not to the calculator, and the build
never touches it. The build refuses a part that would break these boundaries
(for example a sector part containing `//  RENDERER`, or any part containing
`</script>`), and a sector part that loses `runEngine`, `Q`, `YIELD_BAND` or
`pushFlag`, or gains DOM or network code.

### The list of shared modules is read from the code, never listed

The shared layer had eighteen `CB_` modules on 6 September 2026 and has
twenty-four now. `tools/build.cjs` reads the list off `shared.js` every time. A
module declared but missing from `module.exports`, or from a sector file's
`const { ... } = SHARED;` line, stops the build with a sentence saying which.

### The renderer shim

Two lines inside each sector's calculator belong to the page's flow rather than
the calculator: `let S = {}` and `function reset(){ ... idx=0; history=[]; render(); }`.
`runEngine` never calls `reset()`. So each sector file carries a short **shim**,
fenced by `@@CAPREBATE-SHIM-OPEN@@` / `@@CAPREBATE-SHIM-CLOSE@@`, that declares
`idx`, `history` and `render` so the file can load on its own. `render()`
**throws**, so DOM code can never run from inside this package. The shim is
outside the PAGE fences and never goes into the page. `tools/verify-page.cjs`
checks it declares those names and nothing else.

### No `"use strict"`, deliberately

The page's script runs in sloppy mode and so does the harness's `new Function`
lift. Strict mode in these files would change how the very code every figure
comes from behaves, and the page carries the same text.

---

## The two kinds of evidence

**1. The text is the same.** `node tools/verify-page.cjs` builds the calculator
afresh, in memory, and compares it with the calculator in `Caprebate site.html`
and in the back end's copy, byte for byte. A re-indent fails it. A corrected
typo in a help string fails it. It also checks what the calculator must not
have acquired (no `fetch(`, no DOM, no storage, no secrets, no `process.env`),
that every tax adviser switch in `CB_CTA` is still `false` (counted when it
runs, never quoted) and that the free-register gate is shut.
`node tools/verify-page.cjs --self-test` plants edits in a copy of the page (a
figure in the shared layer, one character in each sector's `runEngine`, a
re-indent) and proves each one turns the check red, while an edit to the page's
own renderer does not. The back end's `test/phase161f.test.ts` holds the same,
so `npm run check` and GitHub's checks fail on a page edited by hand.

**2. The behaviour is the same.** The regression harness runs against **either**
the page or this package:

```
node 03-app/caprebate-regression.cjs             the page (default)
node 03-app/caprebate-regression.cjs --package   this package
CAPREBATE_ENGINE=package node 03-app/...         the same, by environment
```

**The totals from the two runs must match.** If they ever stop matching, that
is the finding: do not adjust an assertion to close the gap. **Run both; do not
quote either** — the number moves whenever a suite outside the engine gains a
test.

### Where the website runs the calculator

The engine script in `Caprebate site.html` sits inside the in-page assessment
(`<template id="assessTpl">`). The served website leaves that template out
(`backend/src/web/public-site.ts`), so **the served page carries no calculator**.
The test website's eligibility check runs **this package**, on the server
(`backend/src/web/engine.ts` imports `src/index.ts`). The back end's
`test/phase161f.test.ts` checks both: the served page has no calculator, and the
server's `CB` modules are the objects `src/calculator/shared.js` exports.

### What the package mode does not test, and you should know it

Suites that assert on the **page's own text** — the brand name, the absence of
payment processors, the served-jurisdiction sentence — still read the page in
both modes. They are website-copy checks, not calculator checks.

---

## The TypeScript, and what `strict: true` is actually protecting

`tsconfig.json` turns on `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess` and the rest. But **the calculator files are
JavaScript and are not type-checked** (`allowJs: true`, `checkJs: false`),
because the page runs the same text as it is. They are typed from the outside
by the hand-written `.d.ts` beside each one, and **those are** checked under
every flag.

### `aia_headroom` has four states and they are not interchangeable

Gate 2 of the cash gates tells all four apart:

| Value | Meaning | What the engine does |
|---|---|---|
| `"none"` | the client **has** no headroom left | no AIA modelled, and it says so |
| a number | a headroom amount was stated | AIA applied, capped at the statutory limit |
| `"unsure"` | they were asked and did not know | no AIA modelled, flagged as not captured |
| **absent** | nobody ever asked | **identical to `"unsure"`** |

Narrowing this to `number | undefined` would lose the first and the third.
Giving it a **default** would turn "we do not know" into a favourable answer.
That is non-negotiable **N4**: unknown is not a branch, and it is the one thing
a refactor breaks silently.

### A green typecheck does not prove N4 survives — this was tested

`AiaHeadroom` was narrowed to `number` on purpose and **`tsc --noEmit` over the
whole package stayed green**, because nothing in the package's own TypeScript
consumes the union in a way that would break.

So the assertions live in `typetests/n4.types.ts`, where a narrowing is a
compile error, and **they were proved able to fail before they were kept** —
three separate breakages (collapsing `AiaHeadroom`, deleting `"unsure"` from
`sufficient_profit`, removing `null` from a cash gate) each produced errors, and
the restored file was clean.

### Why so much of `Session` is `unknown`

About **190** distinct facts can appear on a session. The ~40 whose value sets
come from a question's own option list are **derived** into
`src/calculator/session.d.ts` by `tools/build.cjs`, reading the five `Q`
arrays, so they cannot drift from the questions. Nearly every union contains
`"unsure"`: that is N4 showing up in the type system.

The rest arrive as `unknown` through an index signature, which forces a narrow
before use. **That is the honest position.** The engine usually compares a fact
against *one* value and treats everything else as the other branch, so
`s.claimant_type === "company"` tells you nothing about what the other claimant
types are called. Type each one as you come to need it, from the code rather
than from the name.

---

## Commands (from `Caprebate/09-app/engine`)

```
npm run page                          build, write the page, refresh the back end's copy
npm run build:page                    build only: dist/page/ and session.d.ts
node tools/verify-page.cjs            the page carries exactly the built engine; the must-nots
node tools/verify-page.cjs --self-test   a planted edit in the page turns it red
node tools/build.cjs --check          exit 1 if session.d.ts (or a dist/page/ that exists) is stale
npm run typecheck                     strict tsc over the package
npm run typecheck:types               the N4 type assertions
npm test                              verify, self-test, build check and both typechecks
```

`npm run typecheck` needs `npm install` first; nothing else in this list needs
any dependency at all.
