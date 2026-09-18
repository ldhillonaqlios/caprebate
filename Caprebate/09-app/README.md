# `09-app/` — the three deliverables

**Created by Phase 102, 8 September 2026.** This folder holds the working
application and nothing else.

**`00-` to `08-` were not renamed or restructured and must not be.** Two NTFS
junctions point into `04-phase-work` by absolute path, and every numbered folder
name is written as a literal path into the Build Order, the file index and a
dozen governance documents. This folder was *added*; nothing moved.

| | Deliverable | State |
|---|---|---|
| 1 | **Caprebate HTML** — the public site, the assessment, the customer login and the client portal | Phase 104 |
| 2 | **Caprebate back end** — Sales, Admin, Accounting, Surveying, and a super user | Phases 103, 105, 106, 107 — **and the CRM built onto it by ten phases, 10 to 12 September 2026** |
| 3 | **Caprebate Developer Spec** — user cases, how to build it, the wireframe, what every API does | **`CAPREBATE-DEVELOPER-SPEC.md`, beside this file. Phase 108, 9 Sep 2026; the CRM folded in by CRM 10 of 10, 12 Sep 2026; the rows it found unbuilt built by the CRM follow-on, the same day** |

**Beside the Developer Spec, two companions.** `CAPREBATE-CRM-DISPOSITION.md` is
the scope of the CRM: every section and field of the two CRM requirements
documents, each marked, and each adopted row naming the file and the test that
built it — or the phase it is carried to. `CAPREBATE-ADMIN-AND-USER-GUIDE.md` is
**how the system is used**: the administrator guide, the user guide by role, and
training for every CRM screen, each exercise run against the seeded demo.

> ## READ `CAPREBATE-DEVELOPER-SPEC.md` FIRST — and its opening paragraph before you run anything
>
> **This is a working prototype and it is not a product.** Every business, person,
> property and figure in it is invented. It has not been penetration tested, it
> makes zero external network calls, and it **must not be deployed on a public
> address, with no real client data in it**, until the work listed at §5 of that
> document is done. The spec also holds the **only complete list of what is
> stubbed** — four things, each naming its file and its line.

## What is here now

### `engine/` — `@caprebate/engine`

Block A. The estimate engine, lifted out of `Caprebate site.html` so that all
three deliverables can share one copy instead of three forks.

**Facts in, estimate out.** No network calls, no DOM, no storage, no secrets —
those are requirements, not descriptions, and `tools/verify-extraction.cjs`
asserts every one of them.

```js
const { estimate, newSession, SECTOR_IDS } = require("./engine/src/index.js");

const s = newSession("care_homes");
s.base_amount = 2_000_000;
s.claimant_type = "company";
const r = estimate("care_homes", s);   // { outcome, QE, TS, cash, pool, ... }
```

`newSession` sets **no facts at all**. Every fact starts absent, because absent
is what "nobody asked" has to look like — see non-negotiable N4 in the action
plan, and `EXTRACTION.md` for what that means for `aia_headroom` in particular.

**The two gates are shut and are not ours to open.** Free register lookups wait
on a published privacy notice (`CB_REGISTRY.precondition.enabled === false`).
Paid lookups wait on a signed engagement asserted server-side plus one operator
click. This package makes no calls at all, so neither gate is reachable from
here — do not open either to make a screen flow work.

**Read `engine/EXTRACTION.md` before changing anything in `engine/src/generated/`.**
The short version: don't. Change the site file and re-run the extractor.

### `backend/` — `@caprebate/backend`

Both applications in one process, and the CRM built onto it. `backend/README.md`
says how to run it; `npm run start:demo` opens a seeded, in-memory copy for
looking at the screens and for the guide's training exercises.

## Running the checks

From the project root:

```bash
node 03-app/caprebate-regression.cjs              # the site file
node 03-app/caprebate-regression.cjs --package    # this package — the SAME total
node 09-app/engine/tools/verify-extraction.cjs    # 21 checks, byte-for-byte
node 09-app/engine/tools/extract.cjs --check      # is the package stale?
node 03-app/caprebate-crm-fold-check.cjs          # the CRM's table, routes, §4 and guide against the code
```

**The two harness totals must match.** A difference means the extraction changed
a tax answer, and that is the finding, not an obstacle. **The total itself moves
whenever a suite outside the engine gains a test** — it was 634 / 0 / 4 on
8 September 2026 and 640 / 0 / 4 on 9 September — so **the matching is the
assertion and the number is not.** Run them; this project has had a stale
pass-count in four documents at once before, and §4 of the spec is where every
current figure lives.

**The CRM fold check reads a snapshot of two Monday documents**, so refresh
`03-app/signoff-snapshot/` first (`node 03-app/caprebate-signoff-register-check.cjs
--refresh-plan` prints how); it refuses a snapshot older than a day, with exit 2.
