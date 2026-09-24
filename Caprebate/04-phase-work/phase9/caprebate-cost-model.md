# Residual cost model — the four LEG-E fixes and the valuation basis switch

**Phase 9. Board 18422317809. Plan doc 46256300.**
**Status: PREPARED, NOT SHIPPED — except the valuation basis switch, which is done.**

| Item | Board | State after this pass |
|---|---|---|
| LEG-E2 — remove the 18% preliminaries double count | 12804374366 | Prepared, gated off. **Block queried** — see §2. |
| LEG-E3 — VOA fee scale replaces the flat 15% | 12804380489 | Prepared, gated off. Genuinely licence-gated. |
| LEG-E4 — location factor + contract size adjustment | 12804374707 | Prepared, gated off. Blocked on a **purchase**, not a licence. |
| LEG-E5 — per-element depreciation | 12804317685 | Prepared, gated off. Needs **two** sources, not one. |
| Valuation basis switch | 12804374838 | **Done.** Both branches built, tested, default set. |

Files:

- `phase9/caprebate-cost-model.cjs` — the model
- `phase9/caprebate-cost-model.test.cjs` — its own tests, fifty-one when this pass wrote it and one hundred and twenty-nine on 24 September 2026; count them with `node --test caprebate-cost-model.test.cjs` from inside phase9
- Suite I in `caprebate-regression.cjs` — 9 assertions + 3 xfails

Harness after this pass: **216 pass / 0 fail / 14 xfail / 0 xpass** (was 207 / 0 / 11).

---

## 1. Why there was no code to patch

The four LEG-E items read as fixes to a live engine. They are not. They are fixes to the
**residual replacement-cost model** in `Build-Prep-Care-Homes-Estimate-Engine-Specification.md`
§4.1–§4.3, and that model had never been implemented. `caprebate-site.html` values a claim from
sector yield bands — `QE = base_amount × band` — and contains no `prelims`, no `fees`, no `A + B + C`
and no land fraction. The 18% and the 15% exist only in the specification and in the remediation
register at R-B9.

So "prepare a patch" had no file to patch. Phase 9 built the model instead, with the four
corrections designed in from the start and held behind gates. That is the same deliverable arrived
at from the other end: the moment the residual path is wired in, the fixes are already there and
need only to be switched on by whoever clears the block.

Everything below the gates is inert. Every gate is `false`, every licensed or purchased table is an
empty stub with `loaded: false`, and nothing imports this module into the shipped site.

---

## 2. LEG-E2 — is this block real? A question for Lakhbir

**The defect.** §4.2 multiplies both replacement-cost components by `(1 + prelims)`, prelims
defaulting to 0.18. VOA guidance on estimated replacement cost is that on-costs — site set-up,
scaffolding, plant hire, site management, insurances — are already inside the ERC. The further
1.18 counts them twice.

**The size of the error is not 18%.** The residual model divides: `m = PC / (A + B + C)`. A common
uplift on `A` and `B` partly cancels in the product `m × A`. It does not cancel completely, because
`C` — bare-site land value — is not uplifted. So the double count shifts value out of land and into
buildings and plant. It always moves in the direction of **overstating** the claim, and it moves
most on the properties with the highest land fraction. Test B6 asserts both facts: that the
overstatement is real, and that it is materially below 18%.

**The question.** The board marks this blocked on VOA licence clearance. Read the change itself:
turning the gate on sets a multiplier to 1.0 and deletes a parameter. It reproduces no VOA table,
quotes no VOA figure and needs no VOA data to compute — test B2 forces the gate on with **no tables
supplied at all** and the fix still works. The only VOA-derived thing involved is the *knowledge*
that on-costs sit inside ERC, and that knowledge is what tells us our own arithmetic is wrong.

Knowing a double count exists is not the same as republishing the data that revealed it. On that
reading this looks over-blocked, and it is the one fix of the four that could ship on its own.

Two arguments the other way, which is why this is a question and not a conclusion:

1. If the licence terms restrict **derived works** rather than reproduction, a model shaped by VOA
   methodology may be caught even where no VOA number appears in it. That is a question for whoever
   reads the licence, not for me.
2. E2 and E3 touch the same expression. Ship E2 alone and `A` and `B` carry a corrected prelims term
   beside an uncorrected flat 15% fee term. That is a defensible interim, but it is a state someone
   has to be **told** about rather than discover later.

**Not unblocked here.** The gate ships `false` like the other three. Flagged for decision.

### The trap: this is not a contradiction of *JD Wetherspoon*

*JD Wetherspoon plc v HMRC* [2012] UKUT 42 holds that preliminaries and professional fees **do**
apportion to qualifying plant and machinery, pro rata, and that they are routinely missed — which
*understates* claims. `Module-00-Master-Engine-Specification.md` line 104 says exactly that.

Wetherspoon and LEG-E2 are not in conflict. They are about different paths:

| Path | What prelims are | Treatment |
|---|---|---|
| **Invoice / fit-out** | real lines in a cost package | apportion them to qualifying P&M — **add**. *Wetherspoon.* |
| **Residual / valuation** | already inside the price-book rate | a further uplift double counts — **do not add**. VOA. |

Same words, opposite treatment, because one is a real invoiced cost being allocated and the other is
a modelled cost already inclusive. **LEG-E2 changes the residual path only.** Anyone applying it to
the invoice path would understate every fit-out claim and would be reversing Wetherspoon.

The model enforces this structurally: `cost_basis` must be stated as `residual_replacement_cost` or
`invoice_cost_package` and is **never defaulted** (`E_COST_BASIS_REQUIRED`). Test B3 asserts that
forcing the E2 gate on leaves the invoice path at 1.18, untouched.

### Re-tested 12 September 2026 (Phase 129) — turning LEG-E2 on moves no allowance-cap assertion

An earlier note on board item 12804374366 said that turning this gate on would retire the only test of the
£1m annual investment allowance cap. **It would not, and that has now been run rather than argued.** The
gate was switched on in memory for a whole run (nothing on disk changed) and both suites were run against it:

- **This module's own tests: 7 fail** — 325 pass of 332 on the first run, and 338 pass of 345 when it was
  run again later the same day, after other tests had been added. The same seven both times: A1 (every gate ships false); B1, B5 and B6
  (the preliminaries double count itself); D7 and D9 (the location factor's order and tie-back, whose
  expected figures carry the 1.18 uplift); and G8 (with every gate off, the model reproduces spec 4.2).
  **Every one asserts the gate's own off position, or arithmetic that carries the uplift. None is an
  allowance-cap assertion. This module has no allowance-cap arithmetic.**
- **The estimate engine harness: 825 pass, 1 fail, 4 xfail.** The one failure is I1, "every Phase 9 gate
  ships false". **Suite S, which tests the cap, did not move.** It tests the cap in the estimate engine
  itself and rests on no worked case from this model.

So retiring a cap test is not a reason to keep this gate off. The gate stays off for the reasons above and
because it waits on the surveyor's ruling on the convention (FOR THE SURVEYOR, SV-S6). **F-4's `applyAiaCap`
is not built here**, because this model has nothing for it to cap. It is worth building only if the model
ever gains allowance-cap arithmetic.

---

## 3. LEG-E3 — professional fees

**The defect.** §4.2 applies a flat 15% to every line regardless of contract size. R-B9 records that
the 0.15 carries no cited source and may have been back-solved to reproduce the GC-01 golden case.

A flat rate is wrong in **shape** as well as in level. Fee scales are regressive — the percentage
falls as the contract grows — so a flat rate understates fees on small jobs and overstates them on
large ones. The error is signed by job size and does not wash out across a portfolio. Test C4
asserts both directions against a fixture scale.

**Genuinely licence-gated, unlike LEG-E2.** The band table *is* the VOA data. There is no version of
this fix that does not reproduce a VOA schedule, because the schedule is the entire content of the
change. `CB_VOA_FEE_SCALE.bands` is `[]` and stays `[]`.

**Citation.** Wetherspoon settles *whether* professional fees reach qualifying P&M. It says nothing
about *how much* the fees were. LEG-E3 changes only the quantum, and only on the residual path where
the figure is modelled rather than invoiced. The citation is carried in the returned `authority`
string so it reaches the report, and test C7 asserts it survives the fix.

**Band semantics.** Bands are half-open `[floor, ceiling)` so a value on a boundary lands in exactly
one band (test C3). An unbanded value raises `E_BAND_NOT_FOUND` rather than falling through.

### 3.1 F-1 — the fee rate by building type (added 12 September 2026, Phase 129)

**Board item 12927234375.** The VOA fee scale is not only banded by construction cost. It also carries
**adders by building type**: a highly serviced building and a hospital each take a further flat percentage on
top of the banded base rate. Every property this business values is a healthcare building, so the base bands
alone **under-read** the fee on every job we will do. Phase 129 built the prepared patch of 29 August into the
model.

- **The gate.** `leg_e3_building_type_adder`, `false`.
- **The table.** `CB_VOA_FEE_BUILDING_TYPE_ADDERS`, an **empty stub** (`adders: {}`, not loaded), keyed
  `standard` / `highly_serviced` / `hospital`. It is VOA data under the same licence as the base scale. The
  two published figures are quoted in the Activation Test Plan's research note. Quoting a figure in a research
  note is not loading it, so they are not in the module.
- **The interlock.** With `leg_e3_voa_fee_scale` on and this gate off, `feesFactor` refuses with
  `E_BUILDING_TYPE_ADDER_REQUIRED`, so the under-read cannot ship. With the fee scale off, this gate on its own
  changes nothing, and the flat 15% stands whatever the building type.
- **The building type is never defaulted.** With both gates on, `building_type` must be one of the three
  values or the model refuses with `E_BUILDING_TYPE_REQUIRED`. An absent type and "unsure" refuse identically
  (N4). Whether a given GP surgery is "highly serviced" is a valuation judgement, so the type is never
  inferred from the sector. A type with no adder on file raises `E_UNKNOWN_BUILDING_TYPE`, and the shipped
  empty stub refuses with `E_TABLE_NOT_LOADED`.
- **The rate** is the base band plus the adder. The result carries `base_rate`, `adder_rate` and
  `building_type`, cites the base scale and the adder table **separately** in `authority`, and adds the flag
  `LEG_E3_BUILDING_TYPE_ADDER_APPLIED`. `residualApportionment` passes the job's `building_type` through to
  the fee.

**Tests.** C8 to C15 in `caprebate-cost-model.test.cjs`:

- C8: with every gate off, the flat 15% holds whatever the type.
- C9: the adder gate alone changes nothing.
- C10: the scale without the adder refuses.
- C11: an absent type and an unrecognised type both refuse.
- C12: the rate is base plus adder, with both sources cited.
- C13: the adder does not invert the regressive slope.
- C14: a missing adder refuses, and so does the shipped stub.
- C15: the residual model carries the job's type to the fee and refuses a job without one.

Every earlier fee-scale test now turns both gates on. The fixture adders are invented, with `standard` at 0,
so every banded expectation still holds. In the estimate engine harness, Suite I's I5a asserts the refusal.
Run on 12 September 2026, when F-1 landed: this folder's suites were 332 pass / 0 fail at that point, and
the site harness 826 pass / 0 fail / 4 xfail in both modes. Later work the same day added tests to this
folder, so read the current count from the suites, not from this line.

**What clearing the licence now means.** It is no longer "load the band table and turn one gate on". It is
**two tables and two gates, together**: `CB_VOA_FEE_SCALE` and `CB_VOA_FEE_BUILDING_TYPE_ADDERS` loaded from
the licensed source, both gates switched on at once, **and a building type recorded on every residual-path
job** by whoever values it, because the model refuses rather than assume one. Anyone who loads only the band
table and flips only the scale gate gets a refusal, not a lower fee.

---

## 4. LEG-E4 — location and contract size

**Corrected 24 September 2026 (Phase 151): the source is BCIS, and it is a licence question as well as a purchase.**
Lakhbir chose BCIS over Spon's (Word answers 6 and 8); no Spon's book is bought. BCIS's licence (Annex One of its terms of
sale) is held in phase3's source register as `BCIS_COMMERCIAL`, every unpublished term a refusal, and which BCIS product
was agreed is Word question 218. The paragraph below is how it read before, when the choice was open:
**This is not a licence problem, and the board should say so.** LEG-E4 is blocked on a **purchase** —
Spon's or BCIS, item 12804374406, about £330. That is a different kind of block from E2/E3/E5: no
solicitor, no clearance, no negotiation, no counterparty. Someone buys a book. It can be cleared this
week by anyone with a card, whereas the VOA items cannot be cleared by us at all. Worth separating
on the board so it does not sit in the same queue as the things we cannot move.

**The mechanism.** Since 14 September 2026 (Phase 132): the property's factor divided by the factor
**where the price book's rates are priced**, both read from the one location table, whose index base
is declared and checked — times a contract-size factor **interpolated** across the published scale.
It used to be the property's factor divided by the table's mean; see §4.3. The board's worked
example — Cardiff 94 on a national-mean base of 100, with rates priced at that mean — is asserted in
test D2 as a shape check.

### 4.1 Where the factor is applied — corrected 7 September 2026 (Phase 97)

Spon's Architects' and Builders' Price Book says of its own location and contract-size adjustments
that they **"need to be applied to the total cost plan value, not to individual material or element
items"**, and **"should be applied to the whole project and not just to individual elements or
materials"**.

Until 7 September 2026 this module did the opposite: `residualApportionment` multiplied `loc.factor`
into every element inside the costing loop, and the specification's worked example printed
"Cardiff 94" in the source column of five separate element rows.

**The arithmetic was not wrong.** One factor, uniform across every element, multiplies straight out
of the sum — so `components.A` and `components.B` came to the identical figure either way. That is
precisely why nothing caught it, and it is why **no equality test on a total can ever catch this
defect.** What was wrong was the shape, and the shape is what breaks the moment anyone adds a
per-element override.

What the module does now:

- element lines are `qty × rate × depreciation × prelims × index` and **nothing else**. Each line
  carries `location_adjusted: false` and no `location_factor` field at all, so a report generator
  cannot find one to print in a line's source column;
- the single LEG-E4 factor is applied once to the summed total, **before** the fee scale is looked
  up — the VOA fee scale is banded on construction cost, and the adjusted total is the construction
  cost, so looking the band up on an unadjusted total reads the wrong band near an edge;
- `result.cost_plan` shows the step explicitly: `line_sum_unadjusted`,
  `location_factor_applied_once`, `total_after_location`, `fees_factor`, `applied_per_element: false`;
- **two live guards**, not comments. Every line must be explicable by the factors it declares, or
  `E_LOCATION_FACTOR_NOT_APPLIED_ONCE` is raised — that is the one that catches a factor slipped
  back into the loop. And the totals must be the line sum times one location factor and one fee
  factor, which catches the opposite slip of applying it twice.

Test D10 is a **negative control**: it rebuilds the module from source with the defect put back and
asserts the guard refuses it. It also asserts that the mutant passes with the gate **off** — which is
the honest reason this survived so long, since every shipped configuration is one the defect hides in.

**The index base was a separate defect, and Phase 97 did not fix it.** The table comment said
"mean 100"; Spon's is indexed to Outer London = 1.00 and the Mechanical and Electrical book uses a
third base again. Where the factor is applied and what it is indexed to are two different questions.
**Phase 132 fixed the second on 14 September 2026 — see §4.3.**

### 4.2 The contract-size scale — interpolated, and it refuses off the ends

Corrected in the same pass. The contract-size table shipped as `bands: [floor, ceiling, factor]` read
through `bandLookup`, and that was wrong twice over:

- **the published scale is interpolated, not stepped.** A step function puts a discontinuity in the
  middle of the scale, so two jobs £1 apart across a band edge get materially different replacement
  costs — which the source does not say and could not be defended;
- **the source publishes a percentage and the slot held a factor.** Loading published figures
  straight in would have multiplied every cost by roughly minus five rather than by 0.95, and still
  returned a number. `quoted_as` now states which the points hold and
  `percentageAdjustmentToFactor` converts in one place.

The table shape is now `{ assumed_contract_value, quoted_as, valid_from, valid_to, points }`.

**It refuses rather than extrapolating.** Spon's declares that adjustment valid only over roughly
£2m to £5m of contract value. Outside that range the source publishes no adjustment at all, and
continuing its curve is our figure wearing their citation, so `interpolateScale` raises
`E_SCALE_VALUE_OUT_OF_RANGE`. **This is the path that will fire first when the book is bought** — the
standing worked example is a £6m contract (test D12).

**The fee scale keeps its bands, deliberately.** The VOA professional fee scale genuinely is
published as bands, where every contract inside a band carries the same rate. `bandLookup` stays, and
test D16 asserts it still steps.

**Refusals that matter:**

- An unlisted region raises `E_LOCATION_NOT_IN_TABLE`. It does **not** fall back to 1.0. An
  unlisted region is a question, not a national mean (test D4).
- Gate on with no `location_key` raises `E_LOCATION_KEY_REQUIRED` (test D5). Since Phase 132 a key
  recorded as "unsure" raises exactly the same error (test D23); it used to be looked up as a region.
- Gate on with no `contract_value` raises `E_CONTRACT_VALUE_REQUIRED`, and so does "unsure" (tests D6,
  D28). **Until 14 September 2026 an absent contract value took a factor of 1** with the flag
  `LEG_E4_NO_CONTRACT_SIZE` — an absent fact treated as the book's assumed contract size. That flag
  no longer exists.
- A contract value outside the published window raises `E_SCALE_VALUE_OUT_OF_RANGE` (test D12); the
  window boundaries themselves are in range. That stays true while `leg_e4_contract_size_outside_window`
  is off (§4.3, tests D24–D29).
- A scale with no `quoted_as`, no validity window, fewer than two points, non-ascending points, a
  point outside its own window, or no `assumed_contract_value` refuses rather than interpolating
  through it (tests D13, D14).

**Order of operations.** Location and contract size are multiplicative **on the construction cost
total**, applied before indexation and before prelims and fees — i.e. never on a figure that already
carries an uplift. Applying them after one would compound the uplift by a regional factor, which is
not what either adjustment means. Test D7 asserts the order against an explicit arithmetic
expectation so a later refactor cannot quietly transpose it.

**Nothing resolves a property to a location key.** `location_key` is an input this module consumes
and nothing in the system produces — verified again 7 September 2026, and it is the real reason
LEG-E4 could not ship even with the book on the desk. See board item "The council area a property
sits in, and the contract-size scale"; Phase 97 established that the ONS National Statistics Postcode
Lookup resolves it under the Open Government Licence, and building that resolver is now its own
board item.

### 4.3 Phase 132, 14 September 2026 — a declared index base, a rule outside £2m–£5m, and on-costs per price book

Board items "Adjust building costs for where the property is and how big the job is" and "Stop
counting site overheads twice in the cost build-up". Everything below is off, and the cost model is
still wired to nothing, so no client figure moves.

**A declared index base per price source (no new gate — under `leg_e4_location_and_contract_size`).**
`CB_LOCATION_FACTORS` no longer carries `mean: 100`. A loaded table declares `price_source` (the
book it was published with) and `index_base: { basis: "outer_london" | "national_mean" |
"publisher_other", base_key, base_value }`. A new register, `CB_PRICE_SOURCES` (an empty stub,
`loaded: false`), holds one entry per book: `label`, `rates_include_oncosts`, `index_base` and
`rates_priced_at_key` — the row of the location table its unit rates are priced at. The factor is
`factors[location_key] / factors[rates_priced_at_key]`. On a national-mean table with rates priced at
the mean that is Cardiff 94 / 100 = 0.94, as before. On an Outer-London table with rates priced at
Outer London it is the table's own figure; dividing that by a mean of 100 would have given about 0.01
and still returned a number. Refusals:

| Code | When |
|---|---|
| `E_LOCATION_MEAN_DEPRECATED` | a loaded table still carrying a bare `mean` (test D21) |
| `E_LOCATION_INDEX_BASE_MISSING` | the table, or the book, declares no well-formed `index_base` (D19) |
| `E_LOCATION_BASE_NOT_IN_TABLE` | `factors[base_key] !== base_value` (D19) |
| `E_PRICE_SOURCE_REQUIRED` | no `price_source`, "unsure", or one not in the register (D22) |
| `E_LOCATION_INDEX_BASE_MISMATCH` | the table and the rates come from different books, or declare different bases (D20) |
| `E_RATES_PRICING_LOCATION_MISSING` | the book does not say where its rates are priced; null, absent and "unsure" alike (D22) |

Tests D2 (rewritten as a national-mean base) and D17–D23. Test D23 is N4: an absent `location_key` and
"unsure" give the identical error, and neither gives a factor of 1.

**The interpolation and percentage fix — already built by Phase 97, verified 14 September 2026.**
`CB_CONTRACT_SIZE_ADJUSTMENT` with `points`, `quoted_as`, `valid_from` and `valid_to`, the single
`percentageAdjustmentToFactor` conversion, `interpolateScale`, and `bandLookup` kept for the fee bands:
§4.2, tests D11–D16. The one defect found was the N4 pass on an absent contract value, fixed above.

**A contract outside the window — new gate `leg_e4_contract_size_outside_window`, `false`, waits on the
surveyor.** `interpolateScale` takes an option `outside: "refuse" | "hold_at_limit"`, default `refuse`.
Only the LEG-E4 contract-size scale passes it; the fee bands and every other scale are unaffected, and
an option it does not recognise raises `E_SCALE_OUTSIDE_OPTION_INVALID`. Off, both ends refuse as
before. On, above `valid_to` the adjustment is held at the `valid_to` value with
`LEG_E4_CONTRACT_SIZE_HELD_AT_UPPER_LIMIT`, and `contract_size_limit_message` says this **overstates**
cost, because larger contracts carry lower rates. Below `valid_from` it is held at the `valid_from`
value with `LEG_E4_CONTRACT_SIZE_HELD_AT_LOWER_LIMIT`, which **understates**. Inside the window the
output is identical on and off. Tests D24–D29.

**"Rates include on-costs" per price book — new gate `leg_e2_oncosts_by_price_source`, `false`.** On,
residual path only: the job's `price_source` is looked up in `CB_PRICE_SOURCES`.

| `rates_include_oncosts` | Prelims factor | Flag |
|---|---|---|
| `true` | 1 | `LEG_E2_ONCOSTS_IN_RATES` |
| `false` | 1 + preliminaries (today's figure) | `LEG_E2_ONCOSTS_EXCLUDED_BY_SOURCE` |
| null, "unsure", absent, anything not a boolean | refused — `E_ONCOSTS_BASIS_UNKNOWN` | — |

A missing, "unsure" or unlisted source refuses with `E_PRICE_SOURCE_REQUIRED`. The invoice path is
untouched. With both `leg_e2` gates on, the residual path refuses with `E_GATE_CONFLICT`, following
the same interlock pattern as the fee gates. Off, the figure is identical to today over a
representative input set (test B7). Tests B7–B14.

**Checking that the tests can fail.** Every new or rewritten test was run against
`caprebate-cost-model.cjs.bak-phase132` and against single-behaviour mutants built outside the tree.
The Phase 132 build report records the commands and results.

---

## 5. LEG-E5 — per-element depreciation

**Two sources, two blocks.** VOA obsolescence scales (licensed) **and** CIBSE plant lives (a separate
source on its own terms). Clearing the VOA licence does not unblock E5 on its own — test E8 asserts
this by loading CIBSE and leaving the VOA table empty, and confirming the refusal still fires. Worth
knowing before anyone assumes one clearance buys both.

**Why per-element and not per-building.** A single building-wide factor is wrong for a capital
allowances claim in a way a valuer might tolerate and a tax adviser must not. Plant lives differ by
an order of magnitude across the taxonomy — a lift, a boiler, a nurse-call system and the drainage
under the slab do not age together. Depreciating everything at one rate moves value between the main
pool, the special rate pool and the non-qualifying residual, and those attract 14%, 6% and 3% (SBA).
**A pooling error is a permanent timing error, not a rounding one.** Test E3 shows three elements at
the same age depreciating differently, which is the whole argument.

**The chain.** `age_years` → CIBSE expected life → `age_ratio` → VOA obsolescence scale → surviving
proportion.

**The guard that matters.** An element older than its expected life does **not** depreciate to zero.
It is still there and it still works. Two protections:

- `age_ratio` is **clamped** at 1.0, never extrapolated. Extrapolating a scale past its last band is
  inventing data (test E4).
- A **residual floor** taken from the scale — never assumed — puts a bottom under the factor
  (test E5). Depreciating to zero would strip a working asset out of a claim entirely.

**Refusals:** no CIBSE life for an element (`E_PLANT_LIFE_NOT_IN_TABLE`) and no age
(`E_ELEMENT_AGE_REQUIRED`) both throw. Neither is defaulted.

---

## 6. The valuation basis switch — item 12804374838, **DONE**

**Why this one is done and the others are not.** The item's own text says it: *"NOT BLOCKING — build
both branches behind a config flag, surveyor picks."* It had been tagged to the Surveyor and sat
untouched. But a switch does not need a surveyor to **exist** — it needs a surveyor to be **set**.
Building it was never blocked; only choosing it is.

**The two bases.**

| Basis | What it is | Figure |
|---|---|---|
| `replacement_new` | cost to install brand new today | simpler, **higher** |
| `drc` | the same, reduced for the age and condition of what is actually there | more defensible, **lower** |

**The default is `drc`, the conservative basis.** Three reasons, in order of weight.

1. **The asymmetry of being wrong.** Default high and the surveyor lowers it, and a client has
   already been shown a number we then take away — on the residual path that number has usually
   reached them through the public calculator. Default low and the surveyor raises it, and the client
   gets better news than promised. Only one of those costs us a client, and only one of them looks
   like a bait.
2. **It is the harder basis to attack.** DRC values what is actually in the building.
   Replacement-new values a building nobody has, and a twelve-year-old boiler valued as new invites
   an enquiry to open by asking what else we rounded up.
3. **A default is not neutral, so it should not pretend to be.** Whichever way this points, most
   cases will run on it, because defaults are what get accepted. A default that overstates is a
   commercial choice dressed as a technical one.

**And it changes no number today.** Depreciation is LEG-E5, gated off with empty tables. With E5
off, DRC applies a factor of 1.0 to every element — arithmetically identical to replacement-new
(test F3). So the conservative default is live from today and costs nothing, and the day E5's tables
land the basis already points the right way.

**But it says so.** The output carries `DRC_SELECTED_BUT_DEPRECIATION_UNAVAILABLE` and
`depreciation_effective: false`. A DRC label over undepreciated arithmetic would otherwise be a quiet
lie on the face of a report (test F4).

**Attribution.** `basis_source` is `default` until a named surveyor sets it, then `surveyor`, with
`basis_set_by` recorded. Whose judgement a figure rests on is part of the figure. The basis is graded
**D** — surveyor judgement — and under the schema's sign-off rule an unresolved D blocks the
sign-off-ready output.

---

## 7. The model itself

```
m = PC / (A + B + C)
qualifying_pm    = m × A
nonqual_building = m × B
apportioned_land = m × C
```

**Order of operations, and where the four fixes land:**

```
PER ELEMENT LINE — and the location factor is deliberately absent here
base rate
  × depreciation                    LEG-E5   (gate, per element, DRC basis only)
  × (1 + prelims)                   LEG-E2   (gate removes it; residual path only)
  × index to valuation date
  → the element line

ONCE, ON THE SUMMED TOTAL — Spon's requires this on the total cost plan value
sum of element lines
  × location × contract size        LEG-E4   (gate)   <- ONCE, HERE, NOT ABOVE
  → construction cost
  × (1 + fees)                      LEG-E3   (gate makes it banded on that cost)
                                    F-1      (+ a building-type adder; gate interlocked with LEG-E3)
```

Fees are applied to the totals rather than inside the element loop, because the VOA scale is banded
on construction cost and the rate cannot be known until the cost is.

**The s.562 tie-back is checked, not trusted.** The three parts must sum to the purchase
consideration on every run, or `E_APPORTIONMENT_DOES_NOT_TIE_BACK` throws. If the parts do not
reconstitute the price paid, the apportionment is not an apportionment.

**The land inversion.** A higher land value lowers the multiplier, so it lowers plant **and**
building together while raising apportioned land. Outputs are named by **magnitude**, not by which
scenario produced them — a labelling error here is invisible in the arithmetic and obvious in a
report. This was caught by test G1 during the build: `nonqual_building`'s low and high were
inverted. Test G1b now locks the coherence of the two scenarios.

**Grade inheritance.** The result is graded **D**. Under schema §0.5 a derived field takes the
*worst* grade among its inputs, never A: `gross_internal_area_m2` is D, `construction_type` is D, and
the valuation basis is D.

---

## 8. What has to happen before any of this ships

| Gate | Needs | Who | Board |
|---|---|---|---|
| `leg_e2_drop_prelims_from_erc` | a decision on whether the block is real — since 12 September 2026, the surveyor's ruling on the convention (FOR THE SURVEYOR, SV-S6); switching it on retires no allowance-cap test (§2, re-tested) | Surveyor | 12804374366 |
| `leg_e2_oncosts_by_price_source` (Phase 132) | the books bought, each entry in `CB_PRICE_SOURCES` recorded from its own preamble, and a `price_source` on every residual-path job; the alternative to the row above, never with it (§4.3) | Lakhbir (books); Surveyor (which rule) | "Stop counting site overheads twice in the cost build-up" |
| `leg_e3_voa_fee_scale` | VOA licence, then the band table loaded — **and since 12 September 2026 only together with `leg_e3_building_type_adder`**, or it refuses | Solicitor/DPO | 12804380489 |
| `leg_e3_building_type_adder` (F-1) | the same VOA licence, the adder table loaded, and a building type recorded on every residual-path job; switched on together with `leg_e3_voa_fee_scale` (§3.1) | Solicitor/DPO (licence); Surveyor (building type) | 12927234375 |
| `leg_e4_location_and_contract_size` | BCIS subscribed and its product named (Word question 218; BCIS chosen over Spon's, Word answers 6 and 8); since Phase 132 also the location table's `index_base` and `price_source` declared, and the book's `rates_priced_at_key` recorded, and a contract value on every job | Lakhbir | 12804374406 |
| `leg_e4_contract_size_outside_window` (Phase 132) | the surveyor accepting "hold at the nearer limit" for contracts outside the book's window, knowing above it overstates and below it understates (§4.3) | Surveyor | "Adjust building costs for where the property is and how big the job is" |
| `leg_e5_per_element_depreciation` | VOA licence **and** CIBSE terms | Solicitor/DPO | 12804317685 |
| valuation basis | a named surveyor to set it | Surveyor | 12804374838 |

Wiring the model into `caprebate-site.html` is a separate act again, and Suite I's three xfails
watch for it: the day the site imports this module they XPASS, the harness goes red, and whoever did
it is told to convert Suite I from xfail to ordinary assertions.

**Every fixture table in the test file is invented.** They are round numbers chosen so the arithmetic
is checkable by eye, and they exist to prove the mechanisms without a single licensed figure entering
this repository. The one exception is Cardiff 94 against a national mean of 100, which is the worked
example written on board item 12804374707 itself. The Outer-London tables and price-book entries added
by Phase 132 are invented and describe no real book. When the real tables land they go into the module's empty
stubs — never into the tests, which stay invented.

## ATP-F-3 crosswalk completeness gate (Phase 129, 12 September 2026)

`leg_e5_crosswalk_completeness_gate` ships false and, off, changes no number. On, `elementDepreciationFactor` first runs `assertCrosswalkComplete(opts.taxonomy_element_refs)`. That refuses the whole job with E_CROSSWALK_INCOMPLETE, listing every missing id, unless the loaded CIBSE plant-life table holds a finite life above zero for every element id the fixture taxonomy can emit. An absent life and one recorded as not known are the same missing entry. An absent or empty id list refuses with E_TAXONOMY_REFS_REQUIRED, and an element outside the list refuses with E_ELEMENT_NOT_IN_TAXONOMY. `taxonomyElementRefs(csv)` reads the element_id column of Caprebate-Fixture-Taxonomy-v1.csv — 103 ids across nine prefixes on 12 September 2026, where the prepared patch said 95 across five. Today every one of them refuses, because no taxonomy id has a life. The check is the mandatory step before LEG-E5 is turned on. The reactive E_PLANT_LIFE_NOT_IN_TABLE guard is kept unchanged. Tests A1 and J1–J13.

**Corrected 13 September 2026 (Phase 129a).** "Nine prefixes" above is wrong. Counted by code with `taxonomyElementRefs`, the 103 ids sit under eight prefixes: the five sector prefixes (`LS-CH`, `LS-DEN`, `LS-SL`, `LS-GP`, `LS-PH`) and three that apply across sectors (`LS-SR`, `LS-MP`, `LS-SBA`).
