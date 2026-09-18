# How the engine got out of the HTML file, and how to keep it honest

**Built by Phase 102, 8 September 2026. Block A of the Developer Build Order.**

The estimate engine used to live inside `Caprebate site.html`, a 740KB page. A
website, a back end and a developer spec cannot all share it from there. This
package is that engine, and nothing else.

**The one thing this extraction had to prove is that it changed no tax answer.**
Everything below is in service of that.

---

## The rule

**Nothing changes except where the code lives.** No rename, no refactor, no
tidying a switch table or a rate table on the way past. Every behavioural change
belongs to another phase and would be blamed on this one.

So the engine in `src/generated/` is not a port. It is a **byte-for-byte slice**
of the site file, cut mechanically by `tools/extract.cjs`. Nobody retyped 9,000
lines of tax logic, because nobody can prove that safe.

**Never edit `src/generated/`.** To change the engine, change
`Caprebate site.html` and re-run the extractor. The generated files say so at the
top of each one.

---

## Where the cuts are

Two of the three boundaries are **the ones the regression harness has always
used**, so the package and the harness cannot disagree about what "the engine"
is:

| Piece | From | To |
|---|---|---|
| The shared `CB_` layer | `var CB_PLANT` | `/* ===== care_homes` |
| Each sector engine | the `(function(){` after its `/* ===== <sector> ===== */` marker | the `})();` that closes it |

The third cut is this package's own, and it is the only structural decision
here. **Each sector module is cut again at its `RENDERER` banner.** Above the
banner is the engine — `YIELD_BAND`, the question array `Q`, `pushFlag`,
`runEngine`. Below it is DOM code that draws the flow. The package takes only
what is above, which is why it can honestly claim to contain no DOM.

The extractor refuses to write anything if that cut loses `runEngine`, `Q`,
`YIELD_BAND` or `pushFlag`, or if it leaves any DOM or network call behind.

### The twenty modules are re-derived, never listed

The shared layer had **eighteen** `CB_` modules on 6 September 2026 and
**twenty** on 7 September, when Phase 96 added `CB_ACQ` and `CB_TAXPOS`. It will
happen again. So `tools/extract.cjs` reads the list off the source on every run
and a hard-coded list appears nowhere in this package.

### The renderer shim — the only lines the extractor writes itself

Two lines above the banner belong to the renderer rather than the engine:
`let S = {}` and `function reset(){ ... idx=0; history=[]; render(); }`.
`reset()` is the *flow's* entry point, `runEngine` never calls it, and it sits
inside the verbatim slice.

Editing the slice to remove it would forfeit the byte-comparison this whole
design rests on. So instead, each generated sector file carries a **four-line
shim**, fenced by `@@CAPREBATE-SHIM-OPEN@@` / `@@CAPREBATE-SHIM-CLOSE@@`,
declaring the three bindings `reset()` names. `render()` **throws**, so DOM code
can never run from inside this package by accident.

`tools/verify-extraction.cjs` asserts the shim declares those two names and
nothing else.

### No `"use strict"`, deliberately

The site's script runs in sloppy mode and so does the harness's `new Function`
lift. Adding strict mode to the generated files would change the semantics of
the very code this package promises not to change.

---

## The two kinds of evidence

A refactor that fooled one of these would have to fool the other too.

**1. The text is the same.** `node tools/verify-extraction.cjs` re-slices the
site and byte-compares. A re-indent fails it. A corrected typo in a help string
fails it. It also asserts what the package must not have acquired — no `fetch(`,
no DOM, no storage, no secrets, no `process.env` — and that all **twelve** CTA
switches are still `false`, counted at runtime rather than quoted (eleven until
Phase 113j added the twelfth on 10 September 2026 — which is why it is counted).

**2. The behaviour is the same.** The regression harness runs against **either**
the site file or this package:

```
node 03-app/caprebate-regression.cjs             the site file (default)
node 03-app/caprebate-regression.cjs --package   this package
CAPREBATE_ENGINE=package node 03-app/...         the same, by environment
```

**There is no cut-over, and that is deliberate.** A harness that only tested the
package could not tell you the package still matches the file, which is the one
thing the extraction has to prove. **The totals from the two runs must match.**
If they ever stop matching, that is the finding — do not adjust an assertion to
close the gap.

Both modes report the same total, and **that matching is the assertion — the
number itself moves whenever a suite outside the engine gains a test.** It was
**634 / 0 / 4** at the close of Phase 102 on 8 September 2026 and **640 / 0 / 4**
on 9 September, when Phase 108 added six handover assertions to suite M. **Run
both; do not quote either.**

### What the package mode does not test, and you should know it

Suites that assert on the **page's own text** — the brand name, the absence of
payment processors, the served-jurisdiction sentence — still read the site file
in both modes. They are website-copy checks, not engine checks, and the package
is not where that copy lives.

One consequence is worth naming rather than leaving to be discovered. **Suite
Q's yield-band drift trap reads the bands out of the page text with a regular
expression, not out of the loaded module.** In package mode it therefore
compares the *site's* sector bands against the *package's* shared table. A band
that diverged in the package's sector files alone would pass. This was found by
negative control — changing a band in the package left the suite green — and it
is left alone on purpose, because changing an assertion in the same phase as the
extraction would destroy the before-and-after comparison the phase exists for.
It is written up as its own phase.

---

## The TypeScript, and what `strict: true` is actually protecting

`tsconfig.json` turns on `strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess` and the rest. But **the generated files are JavaScript
and are not type-checked** (`allowJs: true`, `checkJs: false`). Annotating a
verbatim slice would fork the engine. They are typed from the outside by the
hand-written `.d.ts` beside each one, and **those are** checked under every flag.

### `aia_headroom` has four states and they are not interchangeable

Gate 2 of the cash gates tells all four apart:

| Value | Meaning | What the engine does |
|---|---|---|
| `"none"` | the client **has** no headroom left | no AIA modelled, and it says so |
| a number | a headroom amount was stated | AIA applied, capped at the statutory limit |
| `"unsure"` | they were asked and did not know | no AIA modelled, flagged as not captured |
| **absent** | nobody ever asked | **identical to `"unsure"`** |

Narrowing this to `number | undefined` would lose the first and the third. Giving
it a **default** would turn "we do not know" into a favourable answer. That is
non-negotiable **N4**: unknown is not a branch, and it is the one thing a
refactor breaks silently.

### A green typecheck does not prove N4 survives — this was tested

`AiaHeadroom` was narrowed to `number` on purpose and **`tsc --noEmit` over the
whole package stayed green**, because nothing in the package's own TypeScript
consumes the union in a way that would break.

So the assertions live in `typetests/n4.types.ts`, where a narrowing is a
compile error, and **they were proved able to fail before they were kept** —
three separate breakages (collapsing `AiaHeadroom`, deleting `"unsure"` from
`sufficient_profit`, removing `null` from a cash gate) each produced errors, and
the restored file was clean.

```
npm run typecheck         the package
npm run typecheck:types   the N4 type assertions
```

### Why so much of `Session` is `unknown`

About **190** distinct facts can appear on a session. The ~40 whose value sets
come from a question's own option list are **derived** into
`src/generated/session.d.ts` by reading the five `Q` arrays — so they cannot
drift from the questions. Note what that produces: nearly every union contains
`"unsure"`. That is N4 showing up in the type system.

The rest arrive as `unknown` through an index signature, which forces a narrow
before use. **That is the honest position.** The engine usually compares a fact
against *one* value and treats everything else as the other branch, so
`s.claimant_type === "company"` tells you nothing about what the other claimant
types are called. A type invented for a fact nobody checked is worse than no
type, because it reads as evidence. Type each one as you come to need it, from
the code rather than from the name.

---

## Commands

```
node tools/extract.cjs             rewrite src/generated/ from the site
node tools/extract.cjs --check     exit 1 if src/generated/ is stale
node tools/verify-extraction.cjs   byte-compare, and the must-nots
npm run typecheck                  strict tsc over the package
npm run typecheck:types            the N4 type assertions
npm test                           all four
```

`npm run typecheck` needs `npm install` first; nothing else in this list needs
any dependency at all.
