# Caprebate — Land Boundary Import Connector (Specification)

**Board item 12830205914** — "Pull in land boundary maps to get site size (waiting on the licence)". Phase 9, item 1.

> **STATUS: PREPARED, NOT SHIPPED.**
> No live data pull of any kind has ever been performed by this connector, in this document, or in the tests that accompany it. Every geometry used anywhere in `caprebate-boundary-import.test.ts` is a small, hand-written literal polygon with coordinates invented for this deliverable — a 100m square, a courtyard cut-out, a 40x30 footprint, two 50x50 parcels. None of it was fetched, scraped, or looked up against any real title, address, or dataset. The two licensed reference tables (`HMLR_INSPIRE_INDEX_POLYGON_TABLE`, `OS_MASTERMAP_BUILDING_FOOTPRINT_TABLE`) are empty stubs with `loaded: false` and zero rows. The default fetcher (`DEFAULT_FETCHER`) unconditionally throws before doing anything. This document records the format this connector was built against **as an assumption to verify once the licence lands**, not as a confirmed integration.

> **PHASE 132e, 16 SEPTEMBER 2026 — PERMISSION DECIDED, FETCHING STILL OFF.**
> Lakhbir Dhillon (Head of Business Development) answered "Yes" (answer read 15 September 2026, Phase 132c): land boundaries may be used for **internal calculation only**, and boundary maps **stay out of client reports**. That permission is now written into the connector by name, with who decided and when it was built (§2.4). **Fetching is still switched off**: it still needs the data protection officer's answer on the small, logged test lookup, and a developer to write the fetcher. Both HM Land Registry attribution statements are now in the sources note (§9). Building footprints still wait on Ordnance Survey.
>
> **18 September 2026 (Phase 133i).** The word "director" is taken off Lakhbir Dhillon's name above and at outcome (b): he is Head of Business Development and has no affiliation with CAP REBATE LTD. His answer and its date are unchanged. The code was corrected in the same phase: `decided_by` now reads `Lakhbir Dhillon, Head of Business Development`, and test T36 asserts it carries no company office.

> **PHASE 150, 24 SEPTEMBER 2026 — THE REAL FETCHER IS BUILT, AND FETCHING IS STILL OFF.**
> The fetcher this document said a developer must write now exists: `09-app/backend/src/connectors/inspire.ts`, built under the rules for every integration phase (Phase 146b). It downloads **one council's** INSPIRE file from HM Land Registry's published download page (`/datasets/inspire/download/<Council_Name>.zip`, one of 318 councils listed on 24 September 2026), only through `src/connectors/http.ts`, so the rate limit, size cap, time limit and audit row are the ones every connector has. It opens the zip on our own server, reads the polygons and hands those near the property's point to `findInspirePolygonForPoint` (§14 of the module), which refuses rather than guesses. **Only the council's name leaves our server** — never an address, a postcode or a point. **It cannot fire while `BOUNDARY_FETCHING_SWITCHED_ON` is false**: it reads that constant first and refuses with nothing sent and no audit row. `DEFAULT_FETCHER` is unchanged and still always throws when no fetcher is injected, and nothing in the back end injects this one yet. Proved by `09-app/backend/test/phase150.test.ts` (invented fixtures, no network); the pages it was built from are in the source register's `SUPPLIER_DOCS` under `HMLR_INSPIRE`, dated 24 September 2026. **What was left was one answer**, the data protection officer's to "Can we make a few small, logged test lookups to check a data connector works?", and Lakhbir gave it on 25 September 2026: yes, on five conditions. **Phase 151l (28 September 2026) built the first download as a test lookup under them** — `smoke HMLR_INSPIRE` in the back end (`src/connectors/boundary-test-lookup.ts`), which downloads one council's file, reads every polygon and finds the one holding a public point, then throws both away. Running it is Lakhbir's, or a person he names; switching the fetcher on for the application is his, separately. HM Land Registry does not publish the element names inside its GML, so the first allowed download must confirm the shape; the reader refuses the whole file if it cannot read any polygon in it.

---

## 1. What this is

Two build items were named in board item 12830205914: pull in land boundary maps, and get site size from them. This connector does the second half — the geometry maths — against a documented, assumed input shape, and stages the first half (the fetch) as a pure planning function plus an injectable-but-defaulted-to-refuse fetcher, so that wiring in the real feed later is additive, not a rewrite.

It produces two new derived fields, following Build-Prep-Consolidated-Schema.md §0 conventions:

| `field_id` | Type | Null | Prov | Conf | Feeds / guard |
|---|---|---|---|---|---|
| `site_area_m2` | `area_m2` | `DERIVED` | `DR` (from a boundary artefact, `API`/`CD`/`CA`/`SV` per source) | **B** (typical — see §4) | s.562 apportionment sanity check; `building_coverage_ratio` |
| `building_footprint_m2` | `area_m2` | `DERIVED` | `DR` | inherits from source (typically **D**, see §4) | `building_coverage_ratio` |
| `building_coverage_ratio` | `decimal` (0–1, see §5) | `DERIVED` | `DR` | worst of its two inputs | acuity/site-utilisation signal; sense-check against `gross_internal_area_m2` and `residential_split_m2` |

These three are **proposed additions** to the consolidated schema, not fields that already exist in `Build-Prep-Consolidated-Schema.md` §1.C. `site_area_m2` sits naturally alongside `gross_internal_area_m2` in §1.C (property profile); `building_footprint_m2` and `building_coverage_ratio` are new. They should be formally added to §1.C when this connector is adopted.

---

## 2. The three-outcome licensing design (the point of this task)

Licensing on the land-boundary data source has three possible outcomes, and the brief is explicit that the middle one is the likely one:

| Outcome | Meaning |
|---|---|
| **(a) NOT_CLEARED** | Never cleared at all. The geometry may not be used for anything — not even internal arithmetic. |
| **(b) INTERNAL_CALCULATION_ONLY** | The outcome this connector ships with — **decided by Lakhbir Dhillon (Head of Business Development), answer read 15 September 2026** (§2.4). Boundary geometry may be used to compute `site_area_m2` and `building_coverage_ratio` and feed those numbers into a claim. The geometry itself — the map, a rendered image, a coordinate list that could reconstitute the boundary — may **not** be reproduced in an outgoing client report. |
| **(c) FULL_REPRODUCTION** | Geometry may appear in reports too (e.g. a boundary plan image). |

### 2.1 Why this had to be structural, not conventional

A convention ("don't put geometry in the report template") survives exactly until someone writes a new report template, or a debugging session prints an artefact's internals, or an LLM drafting a report finds the coordinates sitting on an object it already has in scope and helpfully includes them. The brief asked for it to be **structurally hard to leak geometry into a report by accident**, so the split is enforced at the type level:

- **`DerivedScalar<T>`** — what `computeSiteArea` and `computeBuildingCoverageRatio` return. It is a number plus provenance. It **cannot hold a coordinate** — there is no code path that puts ring data into a `DerivedScalar`. Nothing gates reading `.value` off one: it is always safe to place in any report channel, under any of the three outcomes, because by construction it never carries cartographic material.
- **`CartographicArtefact`** — an opaque handle returned by `parseBoundaryGeometry`. Its actual coordinates are **not a property of the object**. They live in a module-private `WeakMap<CartographicArtefact, InternalGeometry>` (`GEOMETRY_STORE`) that only this module's internals can read. A caller holding a `CartographicArtefact` can pass it to `computeSiteArea` / `computeFootprintAreaM2` (internal use, no permission required — that is outcome (b) by default) but **cannot get a single coordinate out of it** by any other means. `caprebate-boundary-import.test.ts` T23 demonstrates this directly: an object that has the right shape (`kind`, `crs`, `grade`, `prov`) but was never produced by `parseBoundaryGeometry` — so it was never entered into `GEOMETRY_STORE` — throws `E_NOT_AN_ARTEFACT` the moment anything tries to read its geometry. Forging the type at the TypeScript level does not forge the WeakMap entry at runtime.
- **`releaseGeometryForReport(artefact, permission)`** — the **single choke point** through which a `CartographicArtefact` can be turned back into plain, exportable ring data. It is the only exported function that reads `GEOMETRY_STORE` and returns what it finds. It takes an explicit `LicencePermission` (defaulting to the module-level `CURRENT_LICENCE_PERMISSION`) and is capable of refusing: if `permission.allow_report_reproduction` is not `true`, it throws `E_LICENCE_NOT_CLEARED_FOR_REPRODUCTION` and returns nothing. There is no second, quieter way to get the rings out — no `.toJSON()`, no `.raw`, no debug dump on the artefact object itself.

### 2.2 The one switch

```ts
export const CURRENT_LICENCE_PERMISSION: LicencePermission = {
  outcome: 'INTERNAL_CALCULATION_ONLY',
  allow_internal_calculation: true,
  allow_report_reproduction: false,
  decided_by: 'Lakhbir Dhillon, Head of Business Development',
  decided_at: '2026-09-15',
  decision_record: 'Answer "Yes" in caprebate-questions.md ... read 15 September 2026 (Phase 132c) ...',
  built_at: '2026-09-16',
  notes: 'Board item 12830205914. Internal calculation only ... Fetching stays off ...',
};
```

This is the **only** place outcome lives. (Until Phase 132e this was written as `permissionFor('INTERNAL_CALCULATION_ONLY', …)` as an unconfirmed default. The fields are now spelled out by name so the decision can be read at a glance; a check that runs when the module loads refuses to load if the two `allow_*` fields ever disagree with `permissionFor(outcome)`, so the outcome is still the one authoritative knob.) `allow_internal_calculation` and `allow_report_reproduction` must match a single `outcome: LicenceOutcome` field (`'NOT_CLEARED' | 'INTERNAL_CALCULATION_ONLY' | 'FULL_REPRODUCTION'`), so there is exactly one authoritative knob, not two booleans that could be set inconsistently.

- Landing on **(a)**: change `outcome` to `'NOT_CLEARED'` and both `allow_*` fields to match (or go back to `permissionFor('NOT_CLEARED', { decided_by, decided_at, notes })`), recording the new decision in `decided_by`, `decided_at`, `decision_record` and `built_at`. `parseBoundaryGeometry` and `fetchAndImportBoundary` both call `assertInternalCalculationAllowed(permission)` before doing anything else, so this alone stops the geometry being held or measured at all (proven by test T28).
- Landing on **(c)**: change `outcome` to `'FULL_REPRODUCTION'` and both `allow_*` fields to match (or go back to `permissionFor('FULL_REPRODUCTION', { decided_by, decided_at, notes })`), recording the new decision in `decided_by`, `decided_at`, `decision_record` and `built_at`. `releaseGeometryForReport` starts succeeding for any caller that doesn't pass an explicit, more restrictive permission (proven by test T27).
- **No other line in `caprebate-boundary-import.ts` changes for either move.** `computeSiteArea`, `computeBuildingCoverageRatio`, `parseBoundaryGeometry`'s geometry maths, the error codes, the field ids — none of it is outcome-dependent.

### 2.3 A second, independent safety net: the fetcher

The `allow_internal_calculation` / `allow_report_reproduction` switch governs what may be done with geometry **once obtained**. It says nothing about whether the module can go and obtain some. That is governed separately, and more conservatively, by the injected fetcher:

```ts
export const DEFAULT_FETCHER: BoundaryFetcher = async (item) => {
  throw new BoundaryImportError('E_LICENCE_NOT_CLEARED', ...);
};
```

`fetchAndImportBoundary` uses `DEFAULT_FETCHER` unless a real one is explicitly injected. Flipping `CURRENT_LICENCE_PERMISSION` to `FULL_REPRODUCTION` does **not** enable a single network call — `DEFAULT_FETCHER` throws regardless of the permission state (test T31, and note T30 tests it directly and unconditionally). Wiring up a real HTTP/file fetch was a deliberate, separate piece of work, and Phase 150 did it (24 September 2026): `09-app/backend/src/connectors/inspire.ts`, which must be injected to be used and which reads `BOUNDARY_FETCHING_SWITCHED_ON` before anything else, so it too refuses while fetching is switched off. This is intentional belt-and-braces: the licence-outcome switch and the "can we even touch the network" switch are two different failure modes and are kept two different mechanisms.

### 2.4 The decision, as built (Phase 132e, 16 September 2026)

| Field | Value | Meaning |
|---|---|---|
| `outcome` | `INTERNAL_CALCULATION_ONLY` | Outcome (b) |
| `allow_internal_calculation` | `true` | A site area may be worked out from a land boundary for our own checks |
| `allow_report_reproduction` | `false` | The boundary — a map, an image or its coordinates — may **not** be shown in a client report. A site area worked out from it may be |
| `decided_by` | `Lakhbir Dhillon, Head of Business Development` | Who decided |
| `decided_at` | `2026-09-15` | The date his answer was read (Phase 132c). The answer box itself carries no date |
| `decision_record` | where the answer is | `caprebate-questions.md`, "Switch on automatic site area from the land boundaries, without waiting for Ordnance Survey?"; boundary maps in client reports: "Stay off" |
| `built_at` | `2026-09-16` | When it was built into the connector (Phase 132e) |

`decision_record` and `built_at` are optional on the `LicencePermission` type and are records only: nothing in the module reads them to decide anything.

**Asking "may we use it for this?"** `checkBoundaryUse(purpose, permission?)` answers without throwing, with `{ permitted, purpose, reason }`, where `reason` is plain English a person can be shown. It only reads the permission; it fetches, stores and changes nothing.

| `purpose` | Answer under the decided permission |
|---|---|
| `'INTERNAL_CALCULATION'` | **Permitted** |
| `'CLIENT_REPORT_DISPLAY'` | **Refused** — "boundary maps stay out of client reports" |
| `'FETCH'` | **Refused, always, whatever the permission says** — fetching is switched off |
| anything else: `'not sure'`, `undefined`, `null`, `''`, wrong case, a number | **Refused, with one identical answer** (rule N4: "not sure" and absent behave the same; never treated as permitted) |

**Fetching is not switched on by this decision.** `BOUNDARY_FETCHING_SWITCHED_ON` is exported as `false`, as a named record, and `DEFAULT_FETCHER` still always throws (§2.3). Setting the constant to `true` would fetch nothing on its own. Fetching still needs (1) the data protection officer's answer on the small, logged test lookup, and (2) a developer to check the five format assumptions (§6) and write and review a real fetcher.

---

## 3. Geometry model and the CRS trap

### 3.1 Format assumed

```ts
type RawBoundaryGeometry =
  | { type: 'Polygon'; crs: string; exterior: Ring; holes?: Ring[] }
  | { type: 'MultiPolygon'; crs: string; polygons: { exterior: Ring; holes?: Ring[] }[] };
// Ring = readonly [number, number][]
```

- A **polygon** carries its exterior ring and, optionally, a list of hole rings — for a parcel with an excluded inner courtyard, or an easement carved out of the title extent.
- A **multipolygon** is a list of such polygons — for a site made up of more than one title, or a site split by an intervening road or third-party strip.
- Every geometry object states its own **CRS** explicitly, as a string (`'EPSG:27700'` etc.), rather than the module assuming one globally.
- A ring is accepted whether or not it repeats its first point at the end (the area routine indexes modulo ring length, so both representations are handled identically).

### 3.2 Area computation — shoelace, winding order, holes

`ringAreaM2` computes the standard shoelace sum over a ring and takes the **absolute value**, so the result does not depend on whether the ring was supplied clockwise or counter-clockwise (test T2 proves the same square gives the same area either way — this is what "handle winding order" means in practice: callers never have to know or normalise it).

A polygon's area is `|exterior| − Σ|holes|`. If the summed hole area exceeds the exterior ring's area, that is refused as `E_HOLE_EXCEEDS_EXTERIOR` (test T5) rather than silently going negative — it almost always means a units or ring-order mistake in the input, not a real courtyard bigger than its building. A multipolygon's area is the sum across its constituent polygons (test T4).

Degenerate input is refused, not coerced: fewer than three points in a ring is `E_DEGENERATE_RING` (T6); a non-finite coordinate (`NaN`, `Infinity`) is `E_INVALID_COORDINATE` (T7); an empty multipolygon is `E_EMPTY_GEOMETRY` (T8). All of this validation runs **eagerly inside `parseBoundaryGeometry`**, so a bad fixture fails at import time, not silently later when someone happens to call `computeSiteArea`.

### 3.3 The CRS trap, handled explicitly

British National Grid (EPSG:27700) is a projected CRS in metres — the shoelace formula gives a true area directly. A lat/long CRS (EPSG:4326/WGS84) is in **degrees**; running the same formula over degree coordinates produces a number, but it is not an area in any usable unit, and it would be silently, confidently wrong if reported as one.

This connector refuses rather than guesses:

- `COMPUTABLE_METRE_CRS = { 'EPSG:27700' }` — the only CRS this module will compute an area in.
- A recognised geographic CRS (`EPSG:4326`, `WGS84`, `CRS84`, `OGC:CRS84`) is refused with **`E_CRS_NOT_PROJECTED`**, naming the specific reason (degrees, not metres) — test T9.
- Any other, unrecognised CRS code is refused with **`E_UNKNOWN_CRS`** — test T10. The module does not assume an unfamiliar code is safe just because it isn't degrees; Web Mercator (EPSG:3857) is in metres but is not equal-area and would also be wrong, so it is treated as unrecognised rather than silently allow-listed.
- Note that `parseBoundaryGeometry` does **not** reject a non-computable CRS — parsing only validates ring geometry. The CRS gate sits specifically at `computeSiteArea` / `computeFootprintAreaM2`, because "receiving a lat/long boundary" is not itself an error; "computing a metric area from it without reprojecting" is, and that is the exact point at which this module refuses.

Reprojection is deliberately **not** implemented here — silently reprojecting inside an area function is its own trap (choice of projection changes the answer). If a feed only offers geographic coordinates, reprojection to EPSG:27700 belongs upstream, as a reviewed step, not inside this connector.

---

## 4. Confidence grade — why a boundary-derived site area is not simply graded A

Build-Prep-Consolidated-Schema.md §1.C grades `gross_internal_area_m2` **D** — surveyor judgement — because measuring internal floor area from plans or on site necessarily involves interpretive calls (what counts as GIA, IPMS/RICS measurement convention edge cases, treatment of voids and partitions). `site_area_m2` is a different kind of measurement: it is arithmetic over a **legal title boundary**, not a physical survey. The temptation is to grade it **A** ("Deterministic — a register lookup, or a pure computation over already-graded inputs" per schema §0.5) because the shoelace formula itself is exact and repeatable.

**This connector does not do that, and schema §0.5 says explicitly why not:**

> "Grade inheritance. A `DR` field's grade is the **worst** grade among its inputs, not `A`. ... Grading derived figures `A` because the arithmetic is deterministic is precisely the mistake this rule exists to prevent."

The arithmetic is deterministic; the **input boundary is not exact**. HM Land Registry title boundaries are drawn under the **general boundaries rule** (s.60, Land Registration Act 2002): the title plan shows the general position of a boundary, not its precise legal line, and HMLR's own guidance states this explicitly on every official copy. A polygon sourced from an HMLR/OS register, however authoritative the publisher, therefore carries an inherent "this is indicative, not exact" caveat that a straightforward register lookup (like a company number from Companies House) does not.

`MAX_GRADE_FOR_SOURCE_KIND` in the code encodes this as a ceiling per source kind, mirroring the `max_grade` idiom already used for the source catalogue in `phase3/caprebate-source-register.ts`:

| `BoundarySourceKind` | Ceiling | Reasoning |
|---|---|---|
| `HMLR_INSPIRE_INDEX_POLYGON` | **B** | Official register source (API), but general-boundaries caveat means it is treated like a document-extraction with an accuracy threshold, not a bare deterministic lookup — never A. |
| `HMLR_TITLE_PLAN_DIGITISED` | **B** | Same reasoning; a digitised official title plan is still a general boundary. |
| `OS_MASTERMAP_BUILDING_FOOTPRINT` | **B** | Ordnance Survey topographic capture is high-quality but is a surveyed representation of what OS could see (roofline, not necessarily the legal footprint), not a legal instrument — capped below A for the same class of reason. |
| `CLIENT_SUPPLIED_SKETCH` | **C** | Client-asserted, unverified — must be corroborated before it may drive anything gate-like, per schema §0.5. |
| `SURVEYOR_MEASURED` | **D** | Same footing as `gross_internal_area_m2` — a chartered surveyor's on-site judgement call, matching the schema's own sibling field exactly. |

None of these ceilings is **A**. `parseBoundaryGeometry` enforces the ceiling structurally (`E_GRADE_EXCEEDS_SOURCE` if a caller tries to claim a better grade than the source kind allows — test T17), the same defensive pattern the source register uses to stop a client answer being graded as if it were a register lookup.

`site_area_m2`'s grade is exactly the grade of the artefact it was computed from (a single-input `DR` field inherits that one grade — test T16, T18). `building_coverage_ratio`'s grade is `worstGrade([site.grade, footprint.grade])` (test T12) — if the footprint came from a surveyor's on-site measurement (D) and the site came from an HMLR polygon (B), the ratio is D, because a claim built on the ratio is only as strong as its weakest input, exactly as schema §0.5 requires.

**Open question flagged for when the licence lands:** if the actual licensed feed turns out to be something more authoritative than an INSPIRE index polygon — e.g. a solicitor-confirmed extract from the official title register, cross-checked against a conveyancing plan — B may still be too conservative or (more likely) exactly right; conversely, if parcel selection is ambiguous (the site as toured spans more than one title, or a title includes land that is not part of the operational site — a shared access strip, an unrelated garden plot), the correct grade for that job is **C**, pending a surveyor or conveyancer confirming which parcels the site actually comprises. This connector does not attempt that judgement automatically; it is a human call that should be recorded via `meta.grade` (capped, never floored) rather than assumed.

---

## 5. Why `building_coverage_ratio` is typed `decimal`, not `percent`

Schema §0.2 already has `percent` (0–100, one decimal) — `grant_fraction` uses it. It was tempting to reuse `percent` for consistency. This connector deliberately does not: a field literally named `..._ratio` that silently stores `12.0` instead of `0.12` is exactly the kind of unit ambiguity this whole task is about avoiding elsewhere (the CRS trap). `building_coverage_ratio` is stored as a **dimensionless decimal fraction, 0–1** (`footprint_m2 / site_area_m2`, rounded to 4 d.p.) — `0.12` means 12% coverage. If this is adopted into the consolidated schema, the field id and its `decimal` typing should travel together so nothing downstream has to guess the scale from the name.

Guards, all coded errors rather than silent bad numbers:
- Zero (or, structurally, negative — unreachable via this module's own area computation, which cannot produce a negative area, but guarded anyway at the ratio step) site area → `E_ZERO_SITE_AREA` (test T13). A site with genuinely zero area cannot host a coverage ratio; dividing would either throw or produce `Infinity`, neither of which belongs in a claim.
- Footprint area exceeding site area → `E_FOOTPRINT_EXCEEDS_SITE` (test T14) — a building cannot cover more ground than its own site; in practice this means the two geometries do not actually correspond to the same parcel and the mismatch needs investigating, not silently reporting a ratio > 1.
- The two scalar arguments are checked by `field_id` so a caller cannot accidentally swap site and footprint into the wrong argument position (`E_WRONG_SCALAR_FIELD`, test T15).

---

## 6. Format assumptions flagged for verification once the licence lands

None of the following has been confirmed against a real feed. Each is a concrete, falsifiable assumption baked into the parsing/derivation logic, listed so it can be checked off (or corrected) the moment the licence and an actual data sample exist.

> **17 September 2026, Phase 133 — checked against HM Land Registry's published pages (no data downloaded).**
> Full quotes, URLs and reading dates are in `04-phase-work/phase133/inspire-format-findings.md`. Only descriptive pages and HM Land Registry's metadata record were read. No polygon file, dataset or lookup was touched, so element names inside the GML files are still unchecked.
>
> 1. **Delivery shape: WRONG.** HM Land Registry publishes GML 3.2.1, one file per local authority, one record per polygon. A polygon on a council boundary appears in both files. Built: `inspirePolygonsToRawBoundaryGeometry` (module §13).
> 2. **CRS: CONFIRMED as British National Grid, EPSG:27700, but the spelling differs.** HM Land Registry's metadata writes `http://www.opengis.net/def/crs/EPSG/0/27700`, which this connector used to refuse. The per-feature `srsName` in the files is not stated. Built: `normaliseEpsgCrs`. A degree CRS is still refused.
> 3. **Units in metres: NOT STATED** by HM Land Registry. Metres follow from the EPSG:27700 definition. No change.
> 4. **Join key is the title number: WRONG.** Each polygon has its own Land Registry-INSPIRE ID, a title can have several polygons, and the INSPIRE data carries no title number. The translation requires an INSPIRE ID on every record. Getting from a title number to INSPIRE IDs is still open: HM Land Registry points to a lookup service, which is not approved.
> 5. **Footprint is a separate geometry: NOT STATED.** The INSPIRE data holds no footprints, which is consistent with the assumption.
> 6. **Separate licences: NOT STATED.**
> 7. **No reprojection: CONFIRMED.** The data is only available in British National Grid.
>
> Also found: the dataset covers **freehold only**, so a leasehold-only site has no INSPIRE polygon. Fetching is still off: `DEFAULT_FETCHER` still throws and `BOUNDARY_FETCHING_SWITCHED_ON` is still `false`. Tests I1–I8 are in `caprebate-boundary-import-inspire.test.ts`. For current totals, re-derive by running the suite (`node --test` from inside `phase9`). Pre-change copies: `caprebate-boundary-import.ts.bak-phase133`, `caprebate-boundary-import.md.bak-phase133`.
>
> **17 September 2026, Phase 133 — spatial join built and switched off.** Because the INSPIRE data carries no title number, `findInspirePolygonForPoint` (module §14) matches a British National Grid point to the one INSPIRE polygon containing it. It refuses when no polygon contains the point, when more than one does, when the point is on an edge, and when the point is missing or not a number. It is not wired into any fetch path, and `planBoundaryFetch` keeps its title-number locator with a comment saying so. Turning a title number or an address into a point still needs a source (an address lookup's coordinates, or HM Land Registry's own service), and that is a lookup nobody has allowed.

1. **Delivery shape.** Assumed: an explicit `{ exterior, holes? }` polygon record, and `{ type: 'MultiPolygon', polygons: [...] }` for multi-part sites. **Verify:** whether the real feed is this shape, raw GeoJSON (`Polygon.coordinates[0]` = exterior, `[1..n]` = holes by position, no named fields), Esri JSON, or GML translated from HMLR's INSPIRE delivery. If it's raw GeoJSON, a thin translation shim maps cleanly onto `RawBoundaryGeometry` — no change to the area maths.
2. **CRS is stated per-feature, explicitly, as an EPSG code string.** **Verify:** HMLR/OS data is almost always British National Grid, but "almost always" is exactly the kind of assumption this task said to refuse rather than trust. Confirm the feed actually states its CRS (rather than this being an implicit convention the connector would have to hard-code), and confirm the EPSG code string format used (`'EPSG:27700'` vs `'27700'` vs `'urn:ogc:def:crs:EPSG::27700'`).
3. **Units are metres under EPSG:27700.** This is true for BNG by definition, so this is low-risk — but if a future source ever supplies feet or a non-metric projected CRS, `COMPUTABLE_METRE_CRS` must be extended deliberately, one CRS at a time, with its unit confirmed, never opened up generically.
4. **The parcel identifier used to join geometry back to the property profile is the HMLR title number**, matching `title_number` in schema §1.C. **Verify:** the licensed feed's identifier format — an INSPIRE Index Polygon dataset is typically keyed by its own polygon ID, which may need a documented cross-reference to the title number rather than being the title number itself.
5. **Building footprint is a separate geometry from the parcel boundary**, not derived from `gross_internal_area_m2` (which is an *internal* area and definitionally smaller than any reasonable footprint for a multi-storey building, or simply from a different source such as an EPC/plans extraction — see schema §1.C). **Verify:** what the actual footprint source will be (OS MasterMap, architect's plans, a manual on-site trace) — `BoundarySourceKind` already anticipates `OS_MASTERMAP_BUILDING_FOOTPRINT` and `SURVEYOR_MEASURED` as two plausible answers with different confidence ceilings (§4); if it's a third thing, add a new source kind with its own ceiling rather than reusing one of these by convenience.
6. **The land-boundary licence and any building-footprint licence are treated as separate, independently-gated things** in this spec (`HMLR_INSPIRE_INDEX_POLYGON_TABLE` vs `OS_MASTERMAP_BUILDING_FOOTPRINT_TABLE` are two distinct empty stubs). **Verify:** board item 12830205914 names only the land-boundary licence; if a footprint dataset is needed too, it may require its own, separate licensing conversation, not an assumed extension of the boundary licence.
7. **No reprojection is ever performed by this module** — a lat/long feed is refused, not silently reprojected (§3.3). This is a design decision, not a gap to be "fixed" quietly later inside this connector; any reprojection step belongs upstream, reviewed on its own, with its projection choice made explicit.

---

## 7. What is empty and why

- `HMLR_INSPIRE_INDEX_POLYGON_TABLE` and `OS_MASTERMAP_BUILDING_FOOTPRINT_TABLE` (in `caprebate-boundary-import.ts` §11) are `ReferenceTableStub` objects: `{ loaded: false, rows: [] }`, frozen, with a note naming the board item and stating plainly that no rows have ever been loaded. They exist so downstream code can already reference "the boundary table" and "the footprint table" by name, without those names accidentally resolving to nothing (`undefined`) once someone starts wiring up real data — but they carry zero data today and are never populated by any code path in this module.
- `DEFAULT_FETCHER` is not merely unimplemented — it is implemented, and its implementation is "throw `E_LICENCE_NOT_CLEARED` and do nothing else." This was a deliberate choice over leaving it `undefined`/absent, so that `fetchAndImportBoundary()` called with no arguments beyond a request object fails loudly and immediately, in a way a test can assert on, rather than failing later with a generic "fetcher is not a function."

## 8. Test coverage

`caprebate-boundary-import.test.ts` — 42 tests, all green on 16 September 2026 (35 before Phase 132e). Run on the Mac from inside the folder: `node --test caprebate-boundary-import.test.ts`. The older Windows command is kept below for the record:

```
cd "C:\Users\L.Dhillon\OneDrive - IT Roadway\Desktop\Caprebate\04-phase-work\phase9"
"C:\Users\L.Dhillon\node-portable\node-v24.16.0-win-x64\node.exe" --test caprebate-boundary-import.test.ts
```

```
ℹ tests 42
ℹ pass 42
ℹ fail 0
```

Covers: shoelace area on a plain square, winding-order independence, hole subtraction, multipolygon summation, four malformed-geometry refusals (hole > exterior, degenerate ring, non-finite coordinate, empty multipolygon), the CRS trap (degree CRS refused, unrecognised CRS refused, BNG accepted), building coverage ratio arithmetic and its three guards (zero site, footprint > site, swapped arguments), grade-ceiling enforcement per source kind (including the never-A rule), the structural artefact/scalar split (wrong artefact kind, a forged-but-never-parsed object yielding no geometry), the full three-outcome permission gate on `releaseGeometryForReport` and on `parseBoundaryGeometry` itself, the pure fetch-planning function, the always-refusing default fetcher, an end-to-end run through `fetchAndImportBoundary` using a hand-written in-memory fetcher, and the two empty reference-table stubs.

Phase 132e added T36–T42: the permission is a recorded decision with who decided and when built (T36); internal calculation is permitted and still works end to end (T37); a client-report display request is refused with a plain reason, and `releaseGeometryForReport` still refuses (T38); fetching is still off — `BOUNDARY_FETCHING_SWITCHED_ON` is false, asking to fetch is refused even under a full-reproduction permission, and `fetchAndImportBoundary` with no fetcher still rejects (T39); rule N4 — "not sure", undefined, null, empty, wrong case and a missing argument all get the same refusal, under the decided permission (T40) and under one that allows everything (T41); and the sources note carries both attribution statements word for word (T42). All seven fail against the pre-change copy `caprebate-boundary-import.ts.bak-phase132e`.

---

## 9. Sources note — HM Land Registry INSPIRE Index Polygons (Phase 132e)

Exported from the connector as `INSPIRE_INDEX_POLYGON_SOURCES_NOTE` (frozen). The wording below was read on **16 September 2026** at HM Land Registry's conditions of use, https://use-land-property-data.service.gov.uk/datasets/inspire, and matches the readings of 13 and 15 September 2026 recorded in the board item exports.

HM Land Registry's statement is required whenever the data is reused — which includes a site area worked out from a polygon:

> This information is subject to Crown copyright and database rights [year of supply or date of publication] and is reproduced with the permission of HM Land Registry.

Ordnance Survey's statement is required whenever the polygons themselves (including their x, y coordinates) are reused. We carry both every time, as the safe course:

> The polygons (including the associated geometry, namely x, y co-ordinates) are subject to Crown copyright and database rights [year of supply or date of publication] Ordnance Survey AC0000851063.

HM Land Registry also asks for a link to its conditions where possible: https://use-land-property-data.service.gov.uk/datasets/inspire/#conditions. The bracketed placeholder is HM Land Registry's own; fill it from the month of supply recorded against the figure (the files are republished monthly).

Having this note does **not** permit showing a boundary in a client report — that stays off (§2.4) — and does not switch fetching on.
