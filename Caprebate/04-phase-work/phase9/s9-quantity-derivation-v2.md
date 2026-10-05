# QD-S9 — Quantity Derivation Model, v3: room-driven is now the standing instruction, not one row's fix

**Monday item:** 12819686328
**Version:** 3.1 · 12 September 2026 · emergency lighting and dental ventilation coefficients tagged `APPORTION` and never defaulted (see §0B). v3.0 of 1 September 2026 superseded v2.0 of 31 August 2026, which superseded `strawman-s9-quantity-derivation.md` (v1, Phase 9)
**Prepared by:** Claude (Phase 52 for v2, Phase 63 for v3), Caprebate
**Instruction this version applies:** surveyor-pack question I4, answered by Lakhbir Dhillon on 1 September 2026 — *"I would rather this be over engineered."*
**Companion:** `room-equipment-schedule-v2.md` (item 12819698557) supplies this model's Stage 2 input.

---

## 0. What changed at v2, and why it matters more than it looks

v1 built the mechanism correctly and left all fourteen coefficients blank for a surveyor to supply.
That was right about the values. **It was wrong about the shape of one of them, and being wrong
about shape is worse than being wrong about value**, because a wrong value gets corrected by the
first surveyor who looks at it, and a wrong shape gets *filled in* by the first surveyor who looks
at it — they supply a number for the question we asked, not for the question we should have asked.

### The finding: RD-01 is not an area-density problem

RD-01 was specified as "fire-detection points per m² GIA". We tested it on a real 268 m² dental
fit-out (worked case, item 12818132946, Document 3).

| Method | Result for the same 268 m² building |
|---|---|
| **Area density**, read off published detector-spacing guidance for a smoke detector, converted to a coverage area | **2.4 to 4.8 detection points** |
| **Room-by-room count**, one detection point per enclosed room plus circulation and voids | **15 to 19 detection points** |

That is not a factor-of-two disagreement that a better coefficient would close. **It is a factor of
four to six, and it goes the same way every time**, because the two methods are answering different
questions.

**Why.** Detection follows **compartmentation**, not floor area. A detector's maximum spacing sets
an *upper bound* on how far apart detectors may be within one space — but a 14 m² dental surgery
needs its own detector whether the building around it is 268 m² or 2,680 m², because it is a
separate enclosed room with a door. Healthcare buildings are heavily cellularised: many small rooms,
each with a door, each needing its own device. **An area density derived from spacing implicitly
assumes an open floor plate.** Applied to a cellular building it under-counts by roughly the ratio
of rooms-to-open-plate, which in a clinical building is large.

**This generalises beyond detectors.** Any device whose real driver is *"one per enclosed space"*
has the same defect if modelled per m²: emergency lighting, room thermostats, door contacts,
extract grilles, call points. The rule below is written to catch the family, not just the instance.

### The rule this version adopts

> **A quantity whose real driver is the number of enclosed spaces is derived room-by-room. An
> area-density figure for the same quantity is retained only as a labelled sanity floor — a
> lower bound that says "fewer than this would be surprising" — and may never be the number
> that reaches a report.**

The area-density readings are not deleted. Deleting them would lose a genuine check. They are
**demoted and relabelled**, and the model refuses to emit one as a result.

### What v2 does not change

- **No coefficient has been given a value.** Every blank in v1 is still blank in v2. What changed is
  which question each blank asks.
- **`quantity` is still schema-fixed at grade D.** Nothing here makes a quantity engine-ready
  without a surveyor's signature.
- **RD-04 stays open and is now explicitly labelled as such** — see §6b. It is closed by a standards
  purchase, not by reasoning, and we have not made the purchase.

---

## 0A. What changed at v3 — the rule is promoted from a fix to a default

**v2 applied the room-driven rule to the row where the defect was found. v3 makes it the standing
instruction for the whole model.** The change came from outside this document: the surveyor pack
asked (question I4) whether quantities are driven by floor area, by room count, or by something
else, and on **1 September 2026 Lakhbir Dhillon answered *"I would rather this be over
engineered"*.**

### The rule, restated as a default rather than an exception

> **Where a quantity can be derived either by counting rooms or by applying a density to floor
> area, it is derived by counting rooms. Area density is retained as a labelled sanity floor and
> may never be the number that reaches a report. A new coefficient is written room-driven unless
> there is a stated reason it cannot be.**

v2 said this about RD-01. v3 says it about the model. **The practical difference is what happens to
the next coefficient somebody adds:** under v2 it would have been written area-density by default,
because that was the house style everywhere except the one row that had been caught.

### Why this was ours to decide and the coefficient values are not

**Choosing between two derivations is a method choice. Supplying the number inside the chosen
derivation is a professional opinion.** This document has always kept those apart — every
coefficient below is still blank — and v3 does not blur the line. It changes which question each
blank asks, exactly as v2 did, and it supplies no answers.

### What v3 changes, precisely

| Row | v2 | v3 |
|---|---|---|
| **RD-01a / RD-01b** | Room-driven primary, area floor | **Unchanged.** v2 already got this one right — it is the row the finding came from |
| **RD-13** | Demoted to sanity floor | **Unchanged.** Already room-driven in effect |
| **RD-04** (data / comms outlets) | Single area-density coefficient, open by purchase | **SPLIT into RD-04a (room-driven, cellular spaces — primary) and RD-04b (area density, open-plan portion). Still unvalued, still open by purchase.** See below |
| **RD-15** (emergency lighting) | Room-driven, blocked behind XS-1 | **Unchanged, and it already conforms.** Blocked upstream, not by shape |
| **General lighting** | *No coefficient exists* | **Still none — and that is now recorded as a gap rather than a silence.** See §0A.2 |

### §0A.1 — RD-04: the split, and the two objections it does and does not answer

**v2's §6b refused to apply the room-driven substitution to RD-04, and gave two reasons. v3 accepts
one of them and acts on the other.**

**Reason 2 stands and is untouched:** a published structured-cabling standard states a figure, and
reasoning our way to a different one is how a repository acquires an invented number that later
looks sourced. **RD-04 is still closed by a purchase, not by judgement, and nothing here closes
it.** Every row depending on it still resolves to `UNRESOLVED` and is still routed to survey.

**Reason 1 is what the split addresses.** v2 said data outlets are *genuinely mixed* — partly
area-driven in open-plan space, partly room-driven in cellular space — and that the mix is unknown,
so the RD-01 substitution does not obviously transfer. **That is a good argument for not replacing
the coefficient. It is not an argument for leaving it as a single area-density figure**, because a
single area figure silently assumes the mix is 100% open-plan, which in a clinical building is the
assumption we already know to be wrong. **Splitting the coefficient makes the mix a question
somebody has to answer rather than an assumption nobody has to notice.**

**What the split does not do:** it does not estimate the mix, it does not supply either half, and it
does not let the model emit a data-outlet count. **Both halves are blank and the row stays
`UNRESOLVED`.** The only thing that has changed is that the standard, when purchased, will be read
against two questions instead of one.

### §0A.2 — General lighting has no coefficient at all, and that is now on the record

The instruction that produced this version named *"data points and light fittings"*. Data points are
RD-04, above. **Light fittings are not a coefficient in this model in any form.** RD-15 covers
*emergency* lighting only, and is blocked behind taxonomy gap XS-1.

**So there is nothing to convert, and the honest statement is that general lighting was never
modelled rather than that it was modelled the wrong way.** It is recorded here as a gap so the next
person looking for it finds an entry rather than an absence. **If a general-lighting row is added,
the v3 rule applies from birth: it is written room-driven, because a fitting count follows rooms and
task areas rather than gross floor area.**

### §0A.3 — What v3 changes in the running system: nothing, and that is not a hedge

**No output value moves, because no output value is produced.** There is no code anywhere in this
project that derives a device quantity — the QD-S9 model is a specification, every coefficient in it is
blank by design, and `quantity` is schema-fixed at confidence grade D pending a chartered surveyor's
signature. **The three test suites were re-run after this edit and are unchanged, which is the
correct result and not a sign the edit did nothing.**

**This matters for how the next phase reads the room-driven decision.** It is settled as a *method*
and it is written down here. It becomes visible in a client's report only when the coefficients have
values, and those are the surveyor's — §4c says which two to buy first.

---

## 0B. What changed at v3.1 — emergency lighting and dental ventilation, never defaulted (12 September 2026)

The companion room schedule (`room-equipment-schedule-v2.md`, v2.1) now carries emergency lighting in
every sector (CH-27, SL-4, DN-32, GP-26, PH-32) and dental ventilation in three rows (DN-10, DN-14, and
new DN-33 for ventilation whose purpose is not yet known). They match the two questions the surveyor is
being asked — "Emergency lighting, and six other things we could not place" and "Ventilation — is this
one question or four?" **This model now carries the matching counting coefficients, and says in terms
that neither may be defaulted:**

| Row | What it counts | Pool | Value |
|---|---|---|---|
| **RD-15** | Emergency-lighting fittings per enclosed space and per escape-route segment | **`APPORTION`** — the classification question (a separate item, or inside general electrical and lighting?) is open | blank |
| **RD-16** *(new)* | Clinically-driven ventilation installations per decontamination room and per surgery where aerosol-generating procedures are carried out | **`APPORTION`** — the ventilation question (ordinary building ventilation, or clinical equipment that happens to move air?) is open | blank |

**The rule for both, stated so it can be checked.** A client answer of **"not sure"** and **no answer on
file** produce the same result: the row resolves to `UNRESOLVED`, contributes nothing to any total, and
keeps pool `APPORTION`. Neither is read as "none fitted" (0), as "one per room" (1), as a sector typical
figure, or as a pool. **Only a known presence, a known purpose and a surveyor-supplied coefficient move
either row off `UNRESOLVED`.**

**Nothing in the running system changes**, because no quantity is produced and no coefficient has a
value — the same position as §0A.3.

---

## 1. What the schema already fixes, and this model must not re-litigate

1. **`quantity` is already grade D** (Schema §1.G: `int` | `COND:present_flag=TRUE` | `SV / CA` | **D**).
   Even a plain client-asserted room count, with no derivation at all, is capped at D — surveyor
   sign-off required, blocks the sign-off-ready output (§0.5, I-3). **This model cannot output
   better than D under any circumstance.**
2. **`gross_internal_area_m2` is grade D, not B** (Schema §1.C: `CD (EPC/plans) / SV`). Floor area is
   not a register lookup.
3. **`room_counts` and its sector sub-fields are grade C** (`CA / SV`) and per I-17 **may not drive a
   GATE uncorroborated.** This model gates nothing — it produces quantities, not eligibility — but
   the same caution applies by extension.

---

## 2. The derivation chain

```
STAGE 1  Floor area intake
STAGE 2  Room schedule intake  (consumes room-equipment-schedule-v2.md)
STAGE 3  Corroboration pass    (API/CD cross-checks where they exist)
STAGE 4  Sector room-count aggregation  (feeds the schema's *_room_counts fields)
STAGE 5  Per-taxonomy-row quantity resolution
           5a  Measured        — a real document exists
           5b  Room-driven     — count the enclosed spaces      << PRIMARY at v2
           5c  Per-room ratio  — a known count x a multiplier
           5d  Area-density    << DEMOTED at v2: sanity floor only, never a result
           5e  Unresolved      — say so, contribute nothing
STAGE 6  Sanity-floor check    (new at v2 — see §7)
STAGE 7  Confidence grading    (worst-of-inputs; never A)
STAGE 8  UNKNOWN handling      (never the larger-claim default)
STAGE 9  Output assembly
```

### Stage 1 — Floor area intake

**In:** `gross_internal_area_m2` (Schema §1.C, grade D), split by floor or zone where the plans show
it. For Supported Living, also the dwelling / common-parts split
(`ch_communal_vs_dwelling_split_m2`, `sl_common_parts_areas`, Schema §3.1, §3.3) — **this split is
applied before anything downstream runs**, or a dwelling-restricted sector has excluded floor area
silently feeding a common-parts count (§8, F-2).

**The EPC caveat, carried unchanged from v1.** An EPC-sourced floor area is not interchangeable with
a chartered surveyor's GIA measurement, for three separable reasons: the RICS measurement basis is
itself in an unresolved interim state (Property Measurement 2nd ed. archived 9 June 2025; the Code
of Measuring Practice 7th edition expected later in 2026, so a surveyor today has a live choice
between "IPMS: All Buildings" and the Code); the EPC figure is GIA filtered through the NCM's
"activity area" concept, which excludes unheated enclosed space a surveyor's GIA would include; and
the provenance differs (an accredited energy assessor working an SBEM zone model is not a chartered
survey). **An EPC figure is therefore very likely to be smaller than a surveyor's GIA of the same
building.** Flag `EPC_FLOOR_AREA_NOT_SURVEYOR_GIA`. No numeric adjustment factor is offered because
no source states one; the surveyor's measurement supersedes the EPC figure rather than being
reconciled against it.

**If Stage 1 cannot produce a number at all:** stop. Nothing downstream runs. Route to survey.

### Stage 2 — Room schedule intake

**In:** the sector room-type list from `room-equipment-schedule-v2.md` §1–§5, populated for this
property: which room types exist, and where known, how many of each.

**New at v2 — three fields per room type, not one.** Stage 5b needs more than a count:

| Field | What it is | Where it comes from |
|---|---|---|
| `room_type` | matches a row in the companion document | companion doc |
| `count` | how many rooms of that type, or `UNKNOWN` | client, partial document, or plans |
| `enclosed` | is each one a separately enclosed space with a door? | plans, or the client's description |
| `typical_area_m2` | approximate area of one such room, or `UNKNOWN` | plans, or `UNKNOWN` |

`enclosed` is the field that makes Stage 5b work and it did not exist at v1. A ward bay and a
single-bed side room are both "bed spaces"; only one of them is an enclosed space, and the count of
detection points, thermostats and door contacts differs accordingly.

### Stage 3 — Corroboration pass

Cross-check the client's room counts against anything an external register can say. In practice
this is sector-thin: ODS gives GP dispensing status (grade A, and it **gates the existence of the
dispensary room**); CQC gives registration and, for care homes, a registered maximum capacity that
bounds — but does not equal — a bed count; Companies House gives identity; HMLR gives title and
extent. Nothing external states how many treatment rooms a practice has.

A mismatch between a client assertion and a register raises
`ROOM_COUNT_CORROBORATION_MISMATCH` and **does not silently prefer either figure.**

### Stage 4 — Sector room-count aggregation

Aggregate Stage 2's room types into the schema's own fields: `ch_bed_room_count`,
`dn_surgery_chair_count`, `gp_consulting_room_counts <consulting, treatment, minor_ops>`,
`ph_high_acuity_room_counts <theatre, icu, imaging, sterile_services>`.

**Open, flagged at v2 (companion doc PH-8):** the private-hospital theatre count is ambiguous. A
theatre suite is typically three to five spaces (theatre, anaesthetic, prep, scrub, recovery). Does
`ph_high_acuity_room_counts.theatre` mean *theatres* or *theatre spaces*? For a fixture count driven
by enclosed spaces, the difference is a factor of three to five on the highest-value rooms in the
framework. **Routed to the surveyor — see §10, Q-S9-1.**

### Stage 5 — Per-taxonomy-row quantity resolution

Runs once per taxonomy row the room schedule says is present. Resolve in **strict order**; stop at
the first path that succeeds; **never blend two paths for the same row.**

**(5a) Measured — a real document exists.** A priced BoQ, M&E schedule, fire plan, drawings set,
asset register or fixed-asset register that can be read against this row's `quantity_basis`. Grade B
at the derivation level (C below the extraction threshold, RD-14). **This is the case an invoiced
fit-out normally presents, and it needs no model at all** — QD-S9 exists for when it is unavailable.

**(5b) Room-driven — count the enclosed spaces. `<< PRIMARY at v2 >>`**

Applies to any row whose real driver is *"one (or a fixed small number) per enclosed space"*. The
quantity is built by walking the room schedule, not by scaling floor area:

```
qty = Σ over room types r of:
        count(r)
        × devices_per_room(r)                  // usually 1; see the per-room table, §6a
        + circulation_devices                  // corridors, lobbies, stairs — counted as spaces
        + concealed_space_devices              // voids above ceilings / below access floors,
                                               // where the specification requires them
```

Every term is a count of *spaces*, not an area. Where a single room is large enough that one device
cannot cover it, the area-derived spacing figure returns — but **as a within-room subdivision**
(`ceil(room_area / max_coverage_per_device)`), never as a whole-building density. That is the only
legitimate use of a spacing figure in this model: dividing up one large space, not sizing a
building.

**Rows resolved on 5b:** `LS-MP-003` (fire detection), `LS-MP-004` (sprinklers, subject to the same
compartmentation logic), emergency lighting (RD-15) and room thermostats **once they have taxonomy rows**
(companion doc XS-1) — emergency lighting with its pool left `APPORTION` even then, `LS-CH-001` (nurse-call points), `LS-DEN-012`, `LS-GP-006`, `LS-SL-003`,
`LS-PH-013`.

**(5c) Per-room ratio.** A known room count multiplied by a per-room multiplier where more than one
instance sits in a single room — `LS-GP-001` (hand-wash basins per consulting room, RD-10),
`LS-PH-001` (MGPS outlets per theatre, RD-11), `LS-PH-013` (monitoring points per bed, RD-12).
From v3.1, `LS-DEN-015` (clinically-driven ventilation installations per decontamination room and per
aerosol-procedure surgery, RD-16) — **only once the ventilation question has said which rooms'
ventilation is clinical**; until then the row is 5e, with pool `APPORTION`.
Distinct from 5b only in that the multiplier is not 1 and is not obvious. Grade: as Stage 2–4.

**(5d) Area-density — DEMOTED. A sanity floor, not a result.**

At v1 this was the fallback that produced a number when no room count existed. At v2 it **may not
produce a number that reaches a report.** It has exactly two permitted uses:

1. **As a lower-bound check** on a 5b result (Stage 6, §7). If the room-driven count comes out
   *below* the area-density floor, something is wrong with the room schedule — rooms are missing —
   and the result is flagged, not overwritten.
2. **As an explicitly labelled indicative range** where the room count is `UNKNOWN` and the client
   is being shown a triage figure, never a claim figure. It carries the flag
   `AREA_DENSITY_INDICATIVE_ONLY_NOT_A_QUANTITY` and is excluded from every total.

**It is never the quantity.** Where 5b cannot run because the room schedule is unknown, the correct
outcome is 5e, not 5d.

**(5e) Unresolved.** None of 5a–5c apply. Mark `UNRESOLVED`, contribute nothing to any total, route
to survey (§9). **Do not invent a number so the report has something in every row.**

### Stage 6 — Sanity-floor check *(new at v2)*

For every row resolved on 5b, compute the area-density figure as well and compare:

| Outcome | Meaning | Action |
|---|---|---|
| room-driven ≥ area-density floor | Expected. A cellular building has more devices than an open plate. | Record both; proceed. |
| room-driven **<** area-density floor | **The room schedule is probably incomplete** — rooms are missing from it, or `enclosed` has been set wrongly. | Flag `ROOM_COUNT_BELOW_AREA_FLOOR`. **Do not substitute the floor figure.** Route the room schedule back for completion. |
| room-driven ≫ area-density floor (say, > 6×) | Possible but check: are we counting a device per room where the specification only requires one per compartment? | Flag `ROOM_DRIVEN_FAR_ABOVE_FLOOR` for surveyor attention. |

The 268 m² dental case sits at roughly **4× to 6×** the floor — the upper band. On the reasoning
above that is the expected shape for a cellular clinical fit-out, but it is exactly the kind of
"expected" that should be confirmed by someone who has counted devices in a real dental practice.
**Routed to the surveyor — §10, Q-S9-2.**

### Stage 7 — Confidence grading

Schema §0.5, I-2, applied mechanically: **a derived quantity's grade is the worst grade among
everything that fed it, and it is never A.**

| Path | Inputs | Derivation grade | Field grade reaching the engine |
|---|---|---|---|
| 5a measured, above threshold | `CD` document | B | **D** (schema floor on `quantity`) |
| 5a measured, below threshold | `CD` document | C | **D** |
| 5b room-driven, client-asserted rooms | `CA` room counts | C | **D** |
| 5b room-driven, corroborated (Stage 3) | `CA` + `API` | C | **D** — corroboration raises confidence *in* the figure, not the field's grade |
| 5c per-room ratio | room count + `SV` coefficient | D | **D** |
| 5d area-density | GIA (D) × `SV` coefficient (D) | D | **not a quantity — excluded from totals** |
| 5e unresolved | — | not a grade | flagged, not graded |

**Stated once so it is not missed:** because `quantity` is schema-fixed at D, this model **can never
make a quantity sign-off-free.** What it changes is not the grade ceiling — it is **whether there is
a candidate number for the surveyor to confirm or correct, versus nothing at all.** Recording B at
the derivation level while the field carries D is not an inconsistency: it tells the surveyor how
much independent checking a given number already has behind it, which is how they decide where to
spend their time.

### Stage 8 — UNKNOWN handling

Schema §0.3 / I-1: `UNKNOWN` is a first-class value, never coalesced to a default, never routed to
the branch producing the larger claim. Applied here by direct analogy:

- **Room count `UNKNOWN`:** do not impute a typical number for the sector. Record `UNKNOWN`, exclude
  every row that depended on it, raise `QUANTITY_NOT_DETERMINED`.
- **Coefficient unset:** the row stays `UNRESOLVED`. No placeholder ratio invented to make the
  report look complete.
- **`<< NEW AT v3.1 >>` Presence or purpose "not sure" is the same as not recorded.** For emergency
  lighting (RD-15) and dental ventilation (RD-16), both leave the row `UNRESOLVED` with pool
  `APPORTION`. Neither becomes 0, 1, a sector typical figure, or a pool. See §0B.
- **Direction of the error is deliberate.** This produces an **under-count**, never an over-count.
  "We could price 11 of the 15 rows we believe are present; 4 need a survey" is honest. Quietly
  guessing the missing 4 is the mis-selling failure mode Module 00 §7 FM #15 names in another shape.

### Stage 9 — Output assembly

```
QuantityDerivationResult {
  taxonomy_row_ref:     "LS-XX-NNN"
  resolution_path:      "measured" | "room_driven" | "per_room_ratio" | "unresolved"
                        // NOTE: "area_density" is NOT a valid resolution_path at v2.
  quantity_low:         number | null
  quantity_high:        number | null
  unit:                 string                  // taxonomy CSV 'unit'
  confidence_grade:     "B" | "C" | "D" | null  // null only when unresolved
  provenance:           string[]                // e.g. ["CD:floor_plans", "SV:coefficient RD-05"]
  coefficients_used:    string[]
  sanity_floor:         { value: number, method: "area_density", coefficient: string } | null
  sanity_floor_result:  "above" | "below" | "far_above" | "not_computed"
  flags:                string[]                // QUANTITY_NOT_DETERMINED,
                                                // ROOM_COUNT_CORROBORATION_MISMATCH,
                                                // DWELLING_AREA_EXCLUDED_BEFORE_DENSITY,
                                                // ROOM_COUNT_BELOW_AREA_FLOOR,
                                                // EPC_FLOOR_AREA_NOT_SURVEYOR_GIA
}
```

Shaped deliberately like `Build-Prep-05`'s `EstimateResult` (ranges never point figures; flags and
assumptions always populated; a stated basis) so the two compose.

**What this feeds and does not feed.** A `QuantityDerivationResult` is an input to the separate,
unbuilt rate table and to the surveyor's working papers. It is **not** `cost_basis` (Schema §1.G),
which stays `DR / CD / SV`, grade D, and is never computed by multiplying an unreviewed quantity by
an unreviewed rate.

---

## 3. Resolution decision table, restated

| `quantity_basis` (taxonomy CSV) | Document exists? | Path | Derivation grade |
|---|---|---|---|
| `fire plan` | Yes | 5a measured | B |
| `fire plan` | **No** | **5b room-driven** (RD-01a), with RD-01b as sanity floor | C |
| `M&E schedule` | Yes | 5a measured | B |
| `M&E schedule` | **No**, and the row is one-per-space | **5b room-driven** | C |
| `M&E schedule` | **No**, and the row is a per-room ratio | 5c (RD-10/11/12) | D |
| `M&E schedule` | **No**, and the row is genuinely area-driven (see §6b) | **5e unresolved** — RD-04 open | — |
| `drawings` / `elevations` | Yes | 5a measured | B |
| `drawings` / `elevations` | **No** | 5e unresolved — lifts, partitions, blinds are geometry-specific | — |
| `priced BoQ` | Yes | 5a measured | B |
| `priced BoQ` | **No** | 5e unresolved — enabling works follow a named parent element with a measured cost | — |
| `asset register` / `fixed-asset register` | Yes | 5a measured | B |
| `asset register` | **No** | 5e unresolved — chattel rows; guessing risks the double-count | — |
| `bed count` | Room schedule available | 5b or 5c | C→D |
| `bed count` | Room schedule `UNKNOWN` | **5e** — *changed at v2; v1 sent this to area-density* | — |
| `surgery (chair) count` | Available | 5b | D |
| `consulting room count` | Available | 5b / 5c | D |
| `theatre count` / `imaging room count` | Available | 5b — **but see the theatre-suite ambiguity, §2 Stage 4** | D |
| `communal GIA m2` | Common-parts split known | 5b on the common-parts rooms; RD-13 as floor only | D |
| `dispensing flag (ODS)` | — | **Not a quantity — a gate on whether the Dispensary room exists.** Resolved at Stage 3 | A (the gate) |

**The changed row is the important one.** At v1, a `bed count` basis with an unknown room schedule
fell through to area-density and produced a number. At v2 it produces nothing, because the number it
produced was the wrong shape. **Fewer rows now resolve. That is the point.**

---

## 4. The coefficients — restructured, still unvalued

Fourteen coefficients at v1. **Fifteen at v2**, because RD-01 splits into a primary and a floor. No
value has been supplied for any of them.

### §4a — Coefficients that drive a room-driven count (5b/5c) — the ones that matter

| ID | Question it asks | Unit | Feeds | Sector | Value |
|---|---|---|---|---|---|
| **RD-01a** | **How many detection points per enclosed room type, by room type?** Plus: how are corridors counted, and are ceiling/floor voids detected? | points / room, by room type | `LS-MP-003` | ALL | **__________** |
| RD-02 | Sprinkler heads: driven by compartment or by area? If by compartment, heads per room type | heads / room **or** heads / 100 m² | `LS-MP-004` | ALL | **__________** — *and tell us which of the two units is right* |
| RD-05 | Nurse-call points per bedroom | points / bedroom | `LS-CH-001` | Care Homes | **__________** |
| RD-06 | Proportion of bedrooms hoist-fitted, no O&M manual | % of bedrooms | `LS-CH-002` (fixed side only) | Care Homes | **__________** |
| RD-07 | Sluice rooms per bedroom-count band | sluice rooms / N bedrooms | room count, companion doc CH-8 | Care Homes | **__________** |
| RD-08 | Chair-position service sets per surgery — **verification only**, should be 1:1 | sets / surgery | sense-check on `LS-DEN-003` | Dental | **__________** |
| RD-09 | Acoustic-insulation linear metres per consulting room, no drawings | m / room | `LS-GP-004` | GP | **__________** |
| RD-10 | Clinical hand-wash basins per consulting/treatment room | basins / room | `LS-GP-001` | GP | **__________** |
| RD-11 | MGPS terminal outlets per theatre — **and per theatre *space*, if the suite is counted as spaces** | outlets / theatre | `LS-PH-001` | Private Hospitals | **__________** |
| RD-12 | Nurse-call and monitoring points per bed | points / bed | `LS-PH-013` | Private Hospitals | **__________** |
| **RD-15** | **Emergency-lighting fittings per enclosed space and per escape-route segment** | fittings / space | the emergency-lighting rows (companion doc CH-27, SL-4, DN-32, GP-26, PH-32) **once a taxonomy row exists** (XS-1) — **pool `APPORTION`, never defaulted** | ALL | **__________** — *blocked behind XS-1. No default and no sector typical figure* |
| **RD-04a** *(new at v3)* | **Data / comms outlets per enclosed room, by room type** — the cellular portion of the building | outlets / room, by room type | `LS-MP-008` (with RD-04b) | ALL | **__________** — *primary path under the v3 rule. Still blocked by the standards purchase; see §0A.1 and §6b* |
| **RD-16** *(new at v3.1)* | **Clinically-driven ventilation installations per decontamination room and per surgery where aerosol-generating procedures are carried out** — asked only once it is known which rooms' ventilation is clinical | installations / room | `LS-DEN-015` (companion doc DN-10, DN-14, DN-33) — **pool `APPORTION`, never defaulted** | Dental | **__________** — *blocked behind XS-7. Presence or purpose "not sure" is treated as not recorded* |

### §4b — Coefficients that remain area-density, and their status

| ID | Question | Unit | Feeds | Status |
|---|---|---|---|---|
| **RD-01b** | Detection points per 100 m² GIA | points / 100 m² | **sanity floor only** for `LS-MP-003` | **Demoted at v2.** Retained as the Stage 6 lower bound. **May never be a result.** |
| RD-03 | CCTV / access-control points per 100 m of perimeter | points / 100 m | `LS-MP-006`, `LS-MP-007` | Genuinely perimeter-driven, not area-driven, and perimeter is a real geometric quantity. **Retained as a primary path.** Needs a value. |
| **RD-04b** *(was RD-04)* | **Data / comms outlets per 100 m² of OPEN-PLAN floor area** — no longer applied to the whole building | points / 100 m² | `LS-MP-008` (with RD-04a) | **OPEN — AND IT STAYS OPEN.** Split at v3 so that the open-plan/cellular mix is a question rather than a silent assumption; **the split does not close it.** See §0A.1 and §6b. |
| RD-13 | Common-parts fire / security point density per 100 m² of **post-split** common-parts GIA | points / 100 m² | `LS-SL-003`, `LS-SL-004` | **Demoted to sanity floor**, same reasoning as RD-01b. Common parts are cellular too. |
| RD-14 | Extraction confidence threshold for a room schedule read from a partial document | % confidence | grading of Stage 5a | Not a quantity coefficient. **This is schema gap G-3 restated, not a new gap.** |

### §4c — Which of these are worth a surveyor's paid time first

Running the model over a fully worked dental case resolved 20 of 21 taxonomy rows on 5a or 5b —
the coefficients were reached **once**. That is a property of the trigger type, not of the
coefficient set.

| Tier | Coefficients | When actually reached |
|---|---|---|
| **1 — reached on both trigger types** | **RD-01a**, RD-02, RD-03 | Whenever the fire plan or M&E schedule is missing, regardless of invoiced-vs-purchase. **RD-01a is the one the worked case actually hit, and the one whose shape was wrong.** |
| **1 — open by purchase, not by judgement** | RD-04 | Same frequency as tier 1, but **no amount of surveyor time closes it.** See §6b. |
| **2 — reached almost only on a purchase apportionment** | RD-05, RD-06, RD-07, RD-09, RD-11, RD-12, RD-13 | Rare on an invoiced fit-out (path 5b succeeds first); on nearly every row on a bare purchase. |
| **3 — verification only** | RD-08 | Flags a discrepancy rather than supplying a number. Lowest priority. |
| **Blocked upstream** | RD-15, RD-16 | RD-15 cannot be asked until the emergency-lighting classification question is answered (XS-1). RD-16 cannot be asked until the ventilation question says which dental rooms' ventilation is clinical (XS-7). **Both keep pool `APPORTION` whatever the count turns out to be.** |
| **Not a quantity coefficient** | RD-14 | Schema gap G-3. |

**Practical upshot.** On fit-out work — the trigger type the pilot should lead with — only tier 1 is
likely to be reached, and even then only when the specific document is missing. **Ask for RD-01a and
RD-02 first.** Tier 2's seven are the ones worth deferring past the pilot.

### §4d — Where the values should come from

Real completed projects per sector — the same "calibrate against real projects" open item every
module spec already lists (Module 01 §8, Module 02 §11, Module 03 §11, Module 04 §11, Module 05 §11)
— **not a published national average**, because fixture density genuinely varies with acuity,
sub-type and building age within a sector. Module 01 §5, Module 02 §1 and Module 05 §1 all say this
explicitly for their yield bands; the same caution applies to a quantity density.

---

## 5. Worked illustration of the two methods, on the case that produced the finding

**Building:** dental fit-out, 268 m² GIA. **Row:** `LS-MP-003`, fire detection points.
**Documents held:** none that state a device count. Path 5a unavailable.

**Area-density method (RD-01b, the v1 primary).** Take a published maximum-spacing figure for a
smoke detector, convert to a nominal coverage area, divide GIA by it. Reading the spacing guidance
at its two plausible interpretations gives a coverage band, and 268 m² across that band gives
**2.4 to 4.8 points.**

**Room-driven method (RD-01a, the v2 primary).** Walk the room schedule for a practice of that size:
surgeries, LDU, X-ray room, plant cupboard, reception/waiting, staff room, WCs, corridor, store.
One detection point per enclosed room, plus circulation, plus any concealed void the specification
requires. That gives **15 to 19 points**, the range reflecting how many surgeries and whether the
voids are detected.

**The gap is 4× to 6×, and it is not noise.** A 14 m² surgery gets a device because it is a room,
not because of its share of 268 m².

**What we are not claiming.** We are not claiming 15–19 is *right*. We are claiming the *method* is
right and that 2.4–4.8 is answering a different question. The 15–19 range still needs someone who
has counted devices in a real dental practice to confirm it, and that is Q-S9-2 below.

---

## 6. Two open items, stated plainly rather than buried

### §6a — The per-room device table does not exist yet

RD-01a asks for detection points *by room type*, which implies a table this document does not
contain: one row per room type in `room-equipment-schedule-v2.md`, giving the expected device count.
**We have not drafted it, deliberately.** Drafting it would mean writing "1" against forty room
types, which reads as an answer and is actually an assumption — the interesting cases are exactly
the ones where it is not 1 (a long open-plan ward, a large plant room, a two-storey atrium, a room
with a false ceiling and a detected void above it). **The table's *shape* is specified; its rows are
the surveyor's.** Q-S9-2.

### §6b — RD-04 is open, and it is open by purchase, not by reasoning

> **Amended at v3, 1 September 2026.** RD-04 is now **RD-04a** (room-driven, cellular — primary) and
> **RD-04b** (area density, open-plan portion). **Everything in this section still applies to both
> halves.** The split changed the shape of the question; it did not close it, and no figure has been
> supplied for either half. Reason 2 below — *the standard exists and states a figure* — is the reason
> this stays open, and it is untouched. See §0A.1.

**RD-04 (data and comms outlets per unit floor area) cannot be closed by anything in this document,
by any amount of surveyor conversation, or by any further research on our part.** The figure lives
in structured-cabling design standards which are commercially published documents we do not hold and
have not licensed.

**Why we are not modelling around it.** We could reason our way to a plausible outlets-per-m² figure
from room counts, as we did for detection. We are not doing so, for two reasons:

1. **Data outlets genuinely are partly area-driven** in the open-plan parts of a building and partly
   room-driven in the cellular parts, and we do not know the mix. Unlike detection, where the
   physics is unambiguous, this one is genuinely mixed, so the room-driven substitution that fixes
   RD-01 does not obviously fix RD-04.
2. **The standard exists and states a figure.** Reasoning our way to a different number when a
   published answer exists is how a repo acquires an invented figure that later looks sourced.

**Status: OPEN — closed by a standards purchase, not by judgement.** Every row depending on RD-04
resolves to `UNRESOLVED` and is routed to survey. `LS-MP-008` will be missing from totals until
this is closed. **That is a visible, labelled gap and it is the correct behaviour.**

**Action for Lakhbir, not for the surveyor:** decide whether to buy the standard. It is a purchase
decision of the same kind as the cost-library purchase (board item 12804374406), and it should be
priced and decided rather than left to drift.

---

## 7. Failure modes and guards

1. **Guessing a coefficient because the table "should" be complete.** Guard: §4 ships with blanks; a
   resolution engine must refuse any path whose coefficient is unset and emit `UNRESOLVED`.
2. **Applying a whole-building density to a dwelling-restricted area.** Guard: Stage 1 applies the
   Supported Living dwelling/common-parts split first; RD-13 is defined only against the post-split
   common-parts figure.
3. **Blending a measured and a derived count for the same row.** Guard: Stage 5's order is strict and
   exclusive. A partial M&E schedule covering three of five rows does not get topped up with a
   density guess for those same three rows.
4. **Double-counting a chattel as a fixture.** Guard: this model never resolves `fixture_vs_chattel`.
   5e refuses to guess a quantity for a row whose only basis is an asset register that does not
   exist, rather than reading it off the room schedule instead.
5. **One national coefficient masking sector and acuity variation.** Guard: coefficients are defined
   per sector, and where the module specs already flag acuity variation (Module 02 §1, Module 05 §1)
   they should be split further before being relied on. This model names where a finer split is
   needed; it does not build one.
6. **The extraction-confidence threshold (G-3) is genuinely undefined.** Not a guard this model can
   build — an upstream gap it inherits. RD-14 restates it.
7. **Treating a resolved quantity as if it settles eligibility.** Guard: the output carries no
   eligibility field. A grade-B count of UCV installations says nothing about whether they are `MP`
   or `SR`.
8. **`<< NEW AT v2 >>` Using a sanity floor as a result because it is the only number available.**
   This is the specific failure v1 had built in. Guard: `resolution_path` has no `area_density`
   value. A floor figure can only appear in `sanity_floor`, and a `sanity_floor` with a null
   `quantity_low` contributes nothing to any total. **The type system enforces the demotion; a
   comment would not have.**
9. **`<< NEW AT v2 >>` A room-driven count silently masking an incomplete room schedule.** Guard:
   Stage 6. If the room-driven count falls below the area floor, the schedule is incomplete —
   flagged, and never silently replaced by the floor.

---

## 8. Where the model stops and hands over

1. **No floor area at all.** Stage 1 cannot start. Route to survey.
2. **No room schedule, and the client cannot describe the rooms even qualitatively.** Stage 2 cannot
   populate room *types*. **At v2 this is a harder stop than at v1**, because area-density no longer
   rescues it.
3. **Any row whose `quantity_basis` names a document that does not exist and which is not
   one-per-space** — enabling works, chattels, geometry-specific items. Not retried with a weaker
   method; named as needing a document request or a visit.
4. **Any row already flagged `APPORTION`, `CONTESTED` or `(judgement)`.** A resolved quantity is a
   count of installations. Whether they sit in `MP` or `SR`, or are fixtures at all, is untouched.
5. **Any unset coefficient.** An absence, flagged — not a temporary default pending calibration.
6. **The Supported Living dwelling/common-parts split**, where unresolved. Consumed, not produced.
7. **Every `fixture_item[]` field the schema reserves for the surveyor** — `fixture_vs_chattel`,
   `already_pooled`, `newness`, `present_flag`, `pool_tag`, `cost_basis`.

---

## 9. Internal sanity check against published price books — outcome only

Caprebate holds three commercially licensed price books (Spon's M&E 2021 and 2022, Spon's
A&B 2024). **Since 24 September 2026 (Word answers 6 and 8) BCIS is the cost source and these three
books are kept where they are, unused.** **They are used here as an internal check on our own reasoning and nothing more.** No
rate, table or figure from any of them is transcribed into this document, the repo, the taxonomy or
the source register, for three reasons: their provenance in this business is unestablished; item
12830181420 requires publisher, licence and retrieval timestamp on every field written; and **a rate
we cannot licence-evidence cannot go in a defence pack.**

A further reason applies specifically to *interpreting* any gap we find: **the editions are two to
five years old.** A difference between our figure and a book figure cannot be attributed. It may be
our error, or it may be four years of construction cost inflation, and nothing in this repo can tell
the two apart.

**Outcome recorded, §11.**

---

## 10. Questions this model puts to the surveyor

These are additions to the plain-English question set on item 12933605005. They are the QD-S9-specific
ones.

**Q-S9-1 — How should a theatre suite be counted?** A theatre suite is typically three to five
enclosed spaces. Our schema field `ph_high_acuity_room_counts.theatre` does not say whether it means
theatres or theatre spaces. For a room-driven fixture count, that is a factor of three to five on
the most valuable rooms we handle. **Which is it, and does the fixture list differ between the
theatre proper and the anaesthetic / prep / recovery spaces?**

*Built in the test system, 4 October 2026 (Phase 153e), on the answer to Word question 148 — a test
default for you to confirm:* the room list now has the theatre (`PH-R2`) and four suite spaces
(anaesthetic `PH-R2A`, preparation `PH-R2B`, scrub `PH-R2C`, recovery `PH-R2D`), each counted. Ultra-clean
ventilation and the operating lights stay with the theatre; medical gases and monitoring are counted
from every space that carries them (`SUITE_ROWS` in `09-app/backend/src/web/pack-lines.ts`).

**Q-S9-2 — Is the room-driven detection count right in size, not just in shape?** We believe
detection follows compartmentation and we have rebuilt the method accordingly. On a 268 m² dental
fit-out that gives us 15–19 detection points against 2.4–4.8 on the area reading. **Is 15–19 the
right order of magnitude for a practice that size? And how do you count corridors, and do you count
voids above suspended ceilings?**

**Q-S9-3 — Which other quantities have we modelled against the wrong driver?** Detection was the one
we caught. For each of the following, is it driven by floor area, by the number of rooms, by the
number of beds/chairs, or by something else: sprinkler heads, emergency lighting, data outlets,
CCTV points, hand-wash basins, MGPS outlets? **And where a rule of thumb is genuinely fine, say so —
we do not want to over-engineer this.**

**Q-S9-4 — What proportion of care-home bedrooms are typically hoist-fitted (RD-06)?** If there is
no typical figure, tell us and we will route it to survey rather than model it. **A "there is no
such number" answer is as useful to us as a number.**

**Q-S9-5 — Where should these coefficients come from at all?** We have assumed real completed
projects per sector rather than a published national average, on the grounds that density varies
with acuity. **Is that right, or is there a published source you would use that we do not know
about?**

**Q-S9-6 — Emergency lighting and dental ventilation: what drives the count, once the classification
is settled?** RD-15 assumes emergency lighting follows enclosed spaces and escape-route segments; RD-16
assumes clinical ventilation is counted per decontamination room and per aerosol-procedure surgery.
**Is either the wrong driver?** Please answer after the two classification questions — "Emergency
lighting, and six other things we could not place" and "Ventilation — is this one question or four?" —
because until they are answered neither count can reach a claim.

---

## 11. Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 29 Aug 2026 | Initial straw man. Fourteen coefficients, all blank. Area-density as the primary fallback path. |
| 2.0 | 31 Aug 2026 | **RD-01 split into RD-01a (room-driven, primary) and RD-01b (area-density, sanity floor only). Area-density removed as a valid `resolution_path`. Stage 6 sanity-floor check added. Stage 2 gains `enclosed` and `typical_area_m2`. RD-13 demoted alongside RD-01b. RD-15 added (emergency lighting), blocked behind taxonomy gap XS-1. RD-04 explicitly labelled open-by-purchase. `bed count` + unknown room schedule now resolves to `UNRESOLVED` rather than area-density. Five surveyor questions added at §10. Price-book check outcome recorded at §9 / §12.** |
| **3.0** | **1 September 2026** | **The room-driven rule promoted from one row's fix to the model's standing default (§0A), on Lakhbir Dhillon's answer to surveyor-pack question I4. RD-04 split into RD-04a (room-driven, cellular — primary) and RD-04b (area density, open-plan only); both still blank and still open by purchase. §6b amended to cover both halves. General lighting recorded as having no coefficient at all rather than the wrong one (§0A.2). No coefficient given a value; no code changed; all three test suites re-run and unchanged (§0A.3).** |
| **3.1** | **12 September 2026** | **RD-15 (emergency lighting) restated with pool `APPORTION` and no default. RD-16 added (dental clinically-driven ventilation): pool `APPORTION`, blank, blocked behind the ventilation question. Stages 5b, 5c and 8 state that "not sure" and not recorded behave identically for both (§0B). Q-S9-6 added. No coefficient given a value; no code changed.** |

---

## 12. Sources and status

`Build-Prep-05-Estimate-Engine-Specification.md` (the spend-based Stage 1–7 estimator this model
sits alongside; the "cost library NOT YET AVAILABLE" note that defines what a rate table means
here); `Build-Prep-Consolidated-Schema.md` §0 (provenance codes, confidence grades, I-1 and I-2),
§1.C, §1.G, §3.1–§3.5, §4 (gaps G-3, G-4); `Module-00-Master-Engine-Specification.md` §5
(`APPORTION` / `CONTESTED`); `Caprebate-Fixture-Taxonomy-v1.csv`;
`room-equipment-schedule-v2.md` (Stage 2 input). Worked dental case: board item 12818132946,
Document 3, §A.2.1 and §A.4.

Detector-spacing reasoning at §5 is our own arithmetic over published spacing guidance, stated as a
method rather than a reproduced figure; **the spacing standard itself is not quoted or reproduced
here.**

Indicative technical scaffolding. **Not tax advice and not an engine-ready model.** Every
coefficient is unset by design; every quantity this model can produce still requires chartered-
surveyor confirmation, per the schema's own fixed grade on the `quantity` field.
