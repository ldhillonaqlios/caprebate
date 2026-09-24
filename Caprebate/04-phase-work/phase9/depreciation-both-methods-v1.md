# Depreciation — both methods built, neither chosen

**Monday item:** 12927234437 (ATP-F-3)
**Version:** 1.0 · 31 August 2026
**Prepared by:** Claude (Phase 52), Caprebate
**Code:** `phase9/caprebate-cost-model.cjs` — `LEG-E5b`, `resolveDepreciationMethod`
**Tests:** `caprebate-cost-model.test.cjs` H1–H22. Suite 51 → **73 pass / 0 fail**

---

## 0. The one-line version

There is now a `depreciation_method` switch with three positions — `none`, `per_element`,
`whole_building`. **It defaults to `none`, which is exactly today's behaviour, and no number
anywhere changes.** Both real methods are built, both are gated off with empty tables, and the
choice between them is a surveyor's.

---

## 1. Why a second method was needed at all

`LEG-E5` (per-element depreciation) was built in Phase 9 with a strong argument in its header, and
the argument is sound as far as it goes:

> Plant lives differ by an order of magnitude across the taxonomy — a lift, a boiler, a nurse-call
> system and the drainage under the slab do not age together. Depreciating the whole replacement
> cost at one rate moves value between the main pool, the special rate pool and the non-qualifying
> residual, and those attract 14%, 6% and 3%. **A pooling error is a permanent timing error, not a
> rounding one.**

All true. Three things weigh the other way, and **not one of them is ours to settle:**

1. **E5 is a methodological hybrid nobody has ruled on.** It applies PAFOAS — a whole-*building*
   VOA obsolescence scale — per plant *element*, over a CIBSE life. That is not stock VOA
   methodology. It may be perfectly defensible. It is an invention, it is already named in the
   Calibration Research Protocol §10 as *"the single largest open methodological question, and
   different surveyors will answer differently"*, and **it has never been asked.** (Finding ATP-F-3.)
2. **Whole-building depreciation is the stock contractor's-basis treatment**, so it is the one an
   HMRC valuer is likeliest to recognise on sight. That is not an argument that it is *right*; it is
   an argument that it should exist as an option rather than being unavailable.
3. **E5 needs a crosswalk that does not exist.** `CB_CIBSE_PLANT_LIVES.lives_years` is keyed on
   `element_ref`; the fixture taxonomy emits ids in its own naming across 95 rows and five sector
   prefixes; CIBSE names components in its own vocabulary. **No crosswalk between them exists**, and
   a partial one throws mid-job on the first unlisted element. E5b needs no crosswalk at all,
   because a building has no plant life to look up.

   **Corrected 13 September 2026 (Phase 129a).** Part of point 3 is out of date and part still
   holds. **Still true:** no crosswalk exists — the CIBSE plant-life table in the cost model is
   still an empty stub with no life for any taxonomy id. **Out of date:** the taxonomy count.
   Counted by code on 13 September 2026, `Caprebate-Fixture-Taxonomy-v1.csv` holds 103 element
   ids across eight prefixes (the five sector prefixes plus `LS-SR`, `LS-MP` and `LS-SBA`), not 95
   rows across five, so a complete crosswalk needs a life for all 103.

**The consequence, stated plainly.** If a surveyor rules that PAFOAS may not be applied per plant
element, `LEG-E5` does not ship in its current form — and until today there was **no second method
to fall back to**. That is what this phase fixed. The fallback is now a switch position rather than
a rebuild.

---

## 2. The three positions

| Position | What it does | Gate | Tables needed |
|---|---|---|---|
| **`none`** *(default)* | Factor 1 on every element. **Today's behaviour, unchanged.** | — | none |
| `per_element` | `LEG-E5`. CIBSE expected life per element → age ratio → VOA obsolescence scale → surviving proportion. **A different factor per element.** | `leg_e5_per_element_depreciation` | `CB_CIBSE_PLANT_LIVES` **and** `CB_VOA_OBSOLESCENCE` |
| `whole_building` | `LEG-E5b`. Building age in years → VOA whole-building obsolescence allowance. **One factor, applied to every element.** | `leg_e5b_whole_building_depreciation` | `CB_VOA_BUILDING_OBSOLESCENCE` only |

**The table shapes differ, and the difference is not cosmetic.** E5's scale is banded on an *age
ratio* (age ÷ expected life). E5b's is banded on *age in years*, because a building has no CIBSE
expected life to form a ratio against — that concept belongs to plant. **This is why the two methods
cannot share a table, and why choosing between them is a real choice rather than a parameter.**

**One table, not two.** E5b needing a single table where E5 needs two is the clearest statement of
how much less the whole-building method assumes. It is also, incidentally, why it is closer to
shippable: one licence clearance instead of two plus a 95-row professional crosswalk.
_(Corrected 13 September 2026 (Phase 129a): the crosswalk would now need 103 rows, one for each
taxonomy id — see the note under point 3 above.)_

---

## 3. Why the default is `none` and not `per_element`

Both methods are gated off with empty tables, so **today every method produces a factor of 1** and
the default changes no number whatever it is set to.

But a default is not neutral. It is what runs when nobody decides, and **on the day a table lands,
the default is what silently starts applying.** Defaulting to a *method* would be choosing between
them by inaction, and choosing between them is precisely the thing this item exists to hand to a
surveyor. Same discipline as the CTA switches in Phase 51: build both, ship neither, put the choice
in front of the person qualified to make it.

### The one back-compatibility rule, and why it is not a choice

Before this phase there was exactly one method, and turning the E5 gate on applied it. *"Default to
current behaviour"* means that configuration must keep behaving identically:

| Configuration | Resolved method | Why |
|---|---|---|
| E5 gate **on**, E5b **off**, no method stated | **`per_element`** | Exactly the pre-Phase-52 behaviour. `method_source: 'e5_gate'`, flagged `DEPRECIATION_METHOD_INHERITED_FROM_E5_GATE`. **No number changes.** |
| E5b gate **on**, E5 **off**, no method stated | **`none`** | E5b is new. Nothing was behaving that way before, so falling into it would not be preserving behaviour — it would be choosing. |
| **Both** gates on, no method stated | **`none`**, flagged `DEPRECIATION_AVAILABLE_BUT_METHOD_NOT_CHOSEN` | This is the configuration in which a genuine choice exists, and it is the one place where inaction must not become a decision. |
| Both gates off, no method stated | `none` | Identical to today. |

**The rule runs one way only.** That asymmetry is deliberate and is asserted in test H4.

---

## 4. The two methods are alternatives, not layers

Applying an element's own age allowance *and* the building's on top of it depreciates the same asset
twice. There is no configuration in which stacking them is right, so it is an **error**
(`E_DEPRECIATION_METHODS_STACKED`), not a flag. The dispatcher in `residualApportionment` is
exclusive by construction: an element takes exactly one of the three arms.

**What the choice is worth, on a worked case.** Test H15/H16, on a 30-year-old building with a
30-year-old lift (20-year life) and a 30-year-old shell (60-year life), using invented fixtures:

| Method | Lift factor | Shell factor |
|---|---|---|
| `per_element` | 0.25 (past its life, clamped, floored) | 0.55 (halfway through its life) |
| `whole_building` | 0.60 | 0.60 |

The two give qualifying figures more than 5% apart on that case. **We deliberately do not assert
which is higher.** Which method produces the bigger claim depends entirely on the age profile of the
plant against the age of the building, and that dependence is exactly why a surveyor has to choose
rather than us.

---

## 5. The guards, which are the same on both sides

| Guard | Per element | Whole building |
|---|---|---|
| Gate off → factor 1, flagged | `LEG_E5_NO_DEPRECIATION` | `LEG_E5B_NO_DEPRECIATION` |
| Gate on over an empty stub → refuse, never guess | `E_TABLE_NOT_LOADED` | `E_TABLE_NOT_LOADED` |
| Missing age → refuse, never assume nought | `E_ELEMENT_AGE_REQUIRED` | `E_BUILDING_AGE_REQUIRED` |
| Unlisted scale → refuse, never fall back to default | `E_OBSOLESCENCE_SCALE_NOT_IN_TABLE` | `E_BUILDING_OBSOLESCENCE_SCALE_NOT_IN_TABLE` |
| Past the end of the scale → **clamp to the last band, never extrapolate** | ratio clamped at 1 | age clamped at the last band's ceiling, flagged `BUILDING_AGE_BEYOND_SCALE` |
| **Never depreciate a working asset to zero** | residual floor read from the scale | residual floor read from the scale, flagged `RESIDUAL_FLOOR_APPLIED` |
| Replacement-new basis → no depreciation at all | ✓ | ✓ (test H17 covers all three methods) |
| Attribution recorded | `basis_source` | `method_source`: `default` / `e5_gate` / `config` / `surveyor` |

**On extrapolation.** Where a scale's final band is closed — say it ends at 80 years — a 100-year-old
building takes that band's value rather than a value read off a curve nobody published.
**Extrapolating a scale beyond its last band is inventing data**, and it is the failure mode both
methods are written to refuse.

---

## 6. What this does NOT do

- **It does not put a single real number in either table.** `CB_VOA_BUILDING_OBSOLESCENCE` ships
  `loaded: false` with an empty `scales` object and a licence note, exactly like the other five
  tables. Every fixture in the test file is invented and says so.
- **It does not clear any gate.** Both remain false.
- **It does not resolve ATP-F-3's crosswalk gap.** The 95-row CIBSE-to-taxonomy crosswalk still does not
  exist, and `assertCrosswalkComplete` (prepared, not shipped — item 12927234437 Document) still
  needs to run before `leg_e5_per_element_depreciation` is ever flipped. **What changed is that a
  negative ruling on E5 no longer leaves the model with nothing.**
  **Corrected 13 September 2026 (Phase 129a).** Two parts of this bullet are out of date.
  `assertCrosswalkComplete` is no longer only prepared: it was built on 12 September 2026 (Phase
  129) behind its own switch, `leg_e5_crosswalk_completeness_gate`, which is off. And the crosswalk
  would now need 103 rows, not 95. The rest holds: the crosswalk still does not exist, and the
  check must still pass before per-element depreciation is turned on.
- **It does not decide the valuation basis.** `resolveValuationBasis` still defaults to DRC, and the
  `DRC_SELECTED_BUT_DEPRECIATION_UNAVAILABLE` flag now correctly considers **both** methods rather
  than E5 alone — otherwise a DRC report using the whole-building method would carry a flag saying
  no depreciation was possible (test H21).
- **It does not decide which method is right.** That is question §7.

---

## 7. The questions this puts to the surveyor

Additions to the plain-English set on item 12933605005, and a sharpening of the one already there
(Question 5, "How should we age equipment?").

**Q-DEP-1 — may a whole-building obsolescence scale be applied per plant element at all?** This is
ATP-F-3's real gate, and it is upstream of both licences. Our per-element method applies a
whole-*building* VOA obsolescence scale to each plant *element* over a CIBSE life. **That hybrid is
our invention. Is it defensible, or is it two methods spliced together?** *(If the answer is no,
`per_element` does not ship in its current form and `whole_building` is what we use. That is a cheap
question against an expensive assumption — which is why we are asking it before buying either
licence.)*

**Q-DEP-2 — per element or whole building, and does it depend on the case?** Per element is more
accurate and much more work. Whole building is quick and cruder. **We do not know whether the extra
accuracy is worth having or is false precision.** If the answer is "it depends", tell us what it
depends on — building age, plant age spread, claim size — and we will build that as the selector
rather than asking again on every job.

**Q-DEP-3 — where do expected plant lives come from?** We had assumed CIBSE Guide M. Is that what
you would use, is there something better, and **is a published indicative life the right input at all
for an asset you can see the condition of?**

**Q-DEP-4 — what happens past the end of a scale?** We clamp to the last band and apply a residual
floor, on the reasoning that a 30-year-old boiler that still works is not worth nothing. **Is a
residual floor the right instrument, and what does a surveyor actually do with an asset past its
indicative life but plainly still in service?**

**Q-DEP-5 — does the pool split change the answer?** Depreciating at one rate moves value between
pools attracting 14%, 6% and 3%. **Does that tax consequence legitimately bear on which valuation
method you would use, or is that a tax consideration that has no business influencing a valuation
judgement?** We suspect the latter and would rather be told.

---

## 8. Sign-off chain, unchanged except at one row

| Step | Who |
|---|---|
| VOA obsolescence scales cleared and retrieved | Solicitor/DPO |
| CIBSE terms cleared — **an item now exists: "CIBSE plant lives" (24 Sep 2026, Phase 147). The terms are read and held as refusals in the licence CIBSE_KNOWLEDGE; the download and permission request are Word question 213** | Solicitor/DPO |
| **Whether PAFOAS may be applied per plant element at all** (Q-DEP-1) | **Surveyor** — ask this first; it may retire the other rows |
| **Which method, per element or whole building** (Q-DEP-2) | **Surveyor** — new row; this choice did not exist before |
| The crosswalk, `assertCrosswalkComplete`, the monotonicity and ordinal checks | Developer |
| The pool reallocation between main (14%), special (6%) and SBA (3%) — a permanent timing effect | **CTA — mandatory. A pooling error is not a rounding error** |

**Ask the surveyor rows before pursuing the licences in earnest.** If Q-DEP-1 comes back negative,
neither licence was ever the real blocker for the method we end up using.

---

## 9. Tests

`caprebate-cost-model.test.cjs`, group H. Suite 51 → **73 pass / 0 fail**.

| Group | Asserts |
|---|---|
| H1–H4 | The default is `none`; with both gates off the switch changes no number; **back-compat runs one way only** — E5's gate self-selects per-element, E5b's never self-selects, and both gates on resolves to `none` |
| H5–H9 | The whole-building method: gate off is flagged; an injected scale bands correctly; **it consults no CIBSE life at all**; past the scale it clamps rather than extrapolating; the residual floor bites |
| H10–H13 | Refusals: empty stub, unknown building age, unlisted scale, unknown method name |
| H14–H17 | The methods are alternatives — stacking is an error; whole-building applies one factor to every element and per-element does not; **the two give materially different answers**; replacement-new skips depreciation whichever method is selected |
| H18–H22 | Attribution recorded like the valuation basis; selecting a gated-off method says so; the method is graded D; the DRC warning considers both methods; the result carries the method on its face |

**Every fixture in group H is invented** — a whole-building scale banded on age with a closed final
band at 80 years and a 30% floor, chosen so the clamp and the floor can both be asserted by eye. It
is not the VOA allowance and must never be promoted to a default.

---

## Sources

`phase9/caprebate-cost-model.cjs` (LEG-E2 to LEG-E5, the valuation basis switch, and now LEG-E5b);
item 12927234437 Document — the ATP-F-3 prepared patch, its crosswalk-completeness gate and its §5
statement that per-element PAFOAS is a prior decision upstream of any code;
`Caprebate-Calibration-Research-Protocol-v1.md` §10; the Activation Test Plan (item 12830205481,
Document 2, §8);`Caprebate-Fixture-Taxonomy-v1.csv` (95 rows, five sector prefixes).
_(Corrected 13 September 2026 (Phase 129a): the taxonomy file now holds 103 element ids across eight
prefixes, counted by code — see the note under point 3 of section 1.)_

**Nothing in this file is shipped, and nothing in it is licensed content.** Both gates are false,
all six tables are empty stubs carrying their licence position, and the default configuration
reproduces today's arithmetic exactly.
