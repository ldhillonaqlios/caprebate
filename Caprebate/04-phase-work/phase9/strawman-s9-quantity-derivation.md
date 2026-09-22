# STRAW MAN — QD-S9: Quantity Derivation Model (floor area + room schedule → countable quantities)

> ## ⚠ THIS IS A PROPOSAL FOR THE SURVEYOR TO CORRECT — NOT A FINISHED DOCUMENT
>
> **This document was drafted without a chartered surveyor being appointed.** It exists so that
> when a surveyor *is* appointed, they are correcting a first draft rather than starting from a
> blank page. **Nothing in it is professional advice, a settled position, or engine-ready
> without sign-off.**
>
> - The **mechanism** below (the stages, the derivation chain, the guard conditions) is mine to
>   design, and I have designed it. The **numbers that make it produce a figure** — every
>   density, ratio and per-room coefficient — are **not mine to guess**, and I have not guessed
>   them. Every one is a **named blank** in §5, for the surveyor to supply from real project data.
> - Where I state something as fact, I have cited the repo file it comes from. Where I am
>   proposing a mechanism with no repo precedent, I say so explicitly.
> - A pre-populated skeleton with the coefficients left blank honours the brief. A version of
>   this document with plausible-looking numbers already filled in would be worse than not
>   having it, because it invites the coefficients to be rubber-stamped rather than measured.

**Monday item:** 12819686328 — "QD-S9 — Quantity derivation model: get from floor area + room
schedule to countable quantities WHERE no fire plan or O&M manual exists. Rate table has nothing
to multiply without it." **Owner (intended):** chartered surveyor, not yet appointed. **Blocked
behind:** the room-by-room equipment schedule — see companion document. **Drafted by:** Claude,
Phase 9, as a straw man only.

**Companion document.** `strawman-room-equipment-schedule.md` (Monday item 12819698557) is
consumed here as the Stage 2 input — the five sector room-type lists it produces are what this
model turns into countable quantities. This document does not repeat that content; it references
it by section number.

---

## 0. What problem this actually solves, and what it does not

**What already exists and does NOT need re-solving.** `Build-Prep-05-Estimate-Engine-Specification.md`
already has a working Stage-1 headline estimator: it takes a **spend or price figure**
(`base_amount`) and multiplies it by a **sector/trigger yield band** (e.g. care-homes
purchase 20–40%) to get a range of qualifying expenditure (Stages 1–4 of that spec). That model
needs no room-level quantities at all — it works from money in, money out.

**What does not exist, and is this item's actual subject.** A **defensible, item-by-item claim**
(the kind a chartered surveyor stands behind, and the kind that can support a s.198 election —
Consolidated Schema §1.G `fixture_item[]`) needs a **quantity per taxonomy row** —
how many hoists, how many linear metres of fire-detection cabling, how many chair positions — so
that a **rate** (a £-per-unit or %-of-element cost) has something to multiply. The taxonomy CSV
already names, on almost every row, what that quantity should be measured **against**
(`quantity_basis` — e.g. "bed count", "fire plan", "surgery (chair) count", "GIA m2 + M&E
schedule"). Where the named basis is a **document** (a fire plan, an M&E schedule, a priced
bill-of-quantities, an O&M manual) and that document **does not exist** — the common real-world
case this item names — there is currently no stated route from "we know the gross internal area
and roughly what rooms there are" to "we have a number for row `LS-CH-002`." **This document is
that route.**

**What this model produces.** For each taxonomy row that a room-equipment-schedule entry names as
present: a **candidate quantity range**, a **confidence grade**, and a **provenance trail** — never
a cost, never a pool allocation, and never an eligibility decision. Those three remain exactly
where the schema already puts them (§1 below).

**What a "rate table" is, and why it is explicitly out of scope here.** The Monday item's own
wording — "rate table has nothing to multiply without it" — refers to a £-per-unit or
%-of-element cost table that does not yet exist anywhere in this repo. `Build-Prep-05` names the
adjacent gap directly: the special-rate/main-rate **pool split**'s `"indicative"` basis
("from a calibrated sector cost library") is marked **"NOT YET AVAILABLE... reserved for the
Phase 6 calibration work"**. The rate table this item refers to is that same unbuilt cost
library, generalised from a pool-split ratio to a per-item unit cost. **This document produces the
quantity side of "quantity × rate" only.** The rate side is a separate, larger, and still entirely
unstarted piece of work, and this document does not pretend otherwise.

---

## 1. What the schema already fixes, and that this model must not re-litigate

Three rules already exist in `Build-Prep-Consolidated-Schema.md` and this model is built to sit
inside them, not around them:

1. **`quantity` is already a defined field, and it is already grade D.** Schema §1.G:
   `quantity` | `int` | `COND:present_flag=TRUE` | `SV / CA` | **D**. In other words: **even a
   plain client-asserted room count, with no derivation at all, is already capped at grade D** —
   surveyor sign-off required, blocks the sign-off-ready output (§0.5, I-3). This model cannot
   output anything better than D for a quantity under any circumstance. That is not a limitation
   this model introduces; it is a limitation the schema already states, and §4 below explains why
   nothing here changes it.
2. **`gross_internal_area_m2` is grade D, not B, despite being a number off a document.**
   Schema §1.C: `CD (EPC / plans) / SV` | **D**. Floor area is *not* an API register lookup — a
   client-supplied EPC or plan is corroborating evidence, not settled fact, until a surveyor has
   walked the building. This is the anchor for the grade-inheritance discussion in §4.
3. **`room_counts` and its sector sub-fields are grade C** (`CA / SV`) — client-asserted, unverified,
   and (per I-17) **may not drive a GATE uncorroborated.** This model is not gating anything (it
   produces a quantity, not an eligibility decision), but the same caution applies by extension:
   a client-asserted room count, alone, should not be presented to a client as a confident line
   item without at least the corroboration steps in §3.

---

## 2. The derivation chain — stages a developer could implement

```
STAGE 1  Floor area intake
STAGE 2  Room schedule intake (consumes the companion document's five sector tables)
STAGE 3  Corroboration pass (API/CD cross-checks, where they exist)
STAGE 4  Sector room-count aggregation (feeds the schema's *_room_counts fields)
STAGE 5  Per-taxonomy-row quantity resolution (the actual "rate table has nothing to
         multiply without it" fix — see §5 for the resolution order and §6 for the
         named coefficients)
STAGE 6  Confidence grading (worst-of-inputs; never A; see §4)
STAGE 7  UNKNOWN handling (never the larger-claim default; see §7)
STAGE 8  Output assembly (a QuantityDerivationResult per taxonomy row)
```

Each stage is described below with: what goes in, what comes out, what provenance/grade it
carries, and where it can fail.

### Stage 1 — Floor area intake

**In:** `gross_internal_area_m2` (schema §1.C: `CD` (EPC/plans) `/ SV`, grade D), optionally split
by floor or zone if the client's plans show it. For Supported Living, also
`ch_communal_vs_dwelling_split_m2` / `sl_common_parts_areas` where the dwelling/common-parts split
is already known (schema §3.1, §3.3) — **this split must be applied before any density coefficient
in §5c runs**, or a dwelling-restricted sector will have its excluded floor area silently feeding a
common-parts fixture count (see the guard in §8, failure mode F-4).

**Out:** one scalar (or, better, a small structured set: total GIA, and — where derivable — GIA by
the functional zone the room schedule already distinguishes, e.g. clinical vs administrative vs
plant).

**If this stage cannot produce a number at all** (no EPC, no plans, no survey yet): **stop here.**
Nothing downstream in this model can run without it — see §9.

**RESEARCHED (item 12927112165, Phase 10 finding F-10): a non-domestic EPC's stated floor area is
not simply interchangeable with a fresh chartered-surveyor GIA measurement, even though both are
nominally anchored to the same RICS definition.** The equivalence this stage has always assumed is
*mostly* right but not exact, for three separable reasons — this does not change the grade D this
model already applies to an EPC-sourced figure (§1, item 2), but it does mean a **material**
divergence between an EPC figure and a surveyor's on-site GIA should be *expected*, not treated as
evidence that one of the two is wrong.

1. **The EPC methodology does textually borrow the RICS GIA definition, not invent its own.** Approved
   Document Part L defines "Total Useful Floor Area" (TUFA) as "the total area of all enclosed spaces
   measured to the internal face of the external walls," and states this is equivalent to the "gross
   floor area" measured per RICS guidance. The industry-standard SBEM/NCM conventions that accredited
   non-domestic energy assessors actually work to (*Non-Domestic EPC Conventions for England & Wales*,
   BRE/NCM, successive issues) are explicit: floor space is only counted as EPC floor area "if it has
   permanent fixed access and is a useable floor space in accordance with the definition of GIA from
   the RICS Code of Measuring Practice." So on its face, Stage 1's assumption is textually correct.

2. **But "RICS GIA" has not meant one fixed thing over the life of any given EPC, and does not mean
   one fixed thing today.** RICS Code of Measuring Practice, 6th edition (2015) is the GIA definition
   the SBEM/NCM conventions were written against. Since then: RICS Property Measurement, 2nd edition
   (effective 1 May 2018) introduced IPMS in place of GIA for **offices** (from Jan 2016) and
   **residential** (from May 2018), while GIA under the Code of Measuring Practice continued for other
   use classes. That 2nd edition was itself **archived on 9 June 2025**, and the current interim
   position (per RICS/isurv) is that a surveyor should adopt **either** "IPMS: All Buildings" **or**
   the (still unreplaced) Code of Measuring Practice, pending a 7th edition of the Code expected later
   in 2026. **As of this document (29 Aug 2026), a chartered surveyor measuring a Caprebate property
   today has a live, unresolved choice of measurement basis** — while the EPC on file, however old,
   was produced under whatever SBEM/NCM convention issue and RICS GIA definition were current on its
   own assessment date, which for a 10-year-valid EPC could be up to a decade out of step with the
   basis the surveyor uses today. A GP or dental practice is the case most exposed to this drift, since
   it is the closest of the five sectors to an "office" use for measurement-basis purposes.
3. **Even under a single, agreed GIA definition, the EPC figure is not a pure GIA figure — it is GIA
   filtered through the NCM's "activity area" concept.** The SBEM/NCM conventions explicitly treat an
   unheated car park as a "strongly ventilated space" and exclude it (and other zones without an NCM
   activity) from the useful floor area, and floor area is only counted where it has "permanent fixed
   access." A surveyor's GIA for a capital-allowances measurement is not conditioning-dependent in the
   same way — an enclosed but unheated plant room or covered car park is ordinarily still *inside* GIA
   under the Code of Measuring Practice's own enclosure test. **The practical effect is that an EPC's
   stated floor area is very likely to be smaller than a surveyor's GIA of the same building**,
   specifically by whatever unconditioned-but-enclosed space the NCM model excluded as having no
   assessable activity — not because either figure is wrong, but because they answer subtly different
   questions (assessable/conditioned floor area vs enclosed floor area).
4. **Provenance is also not equivalent.** An EPC is produced by an accredited non-domestic energy
   assessor from a software zone model (SBEM), commonly built from architect's drawings or an on-site
   walkover that is not a chartered survey — a different professional discipline and evidentiary
   standard from a RICS-qualified GIA measurement, independent of whether the definitions converge.

**What this means for Stage 1, stated as a guard rather than a number.** An EPC-sourced
`gross_internal_area_m2` stays grade D (unchanged — this was already the schema's position, and this
research confirms rather than weakens it). Where Stage 1's only source is an EPC, the output should
carry an explicit flag — `EPC_FLOOR_AREA_NOT_SURVEYOR_GIA` — naming the three reasons above, so a
later reconciliation against a surveyor's own measurement is read as an expected feature of using two
different professional sources, not as an error in either one. This model does not attempt to build a
numeric adjustment factor between EPC floor area and surveyor GIA — no source states one, and (per §6's
own discipline) none should be invented; the surveyor's own measurement, once available, simply
supersedes the EPC figure rather than being reconciled against it arithmetically.

**Sources for this finding.** Building Regulations Approved Document Part L (Total Useful Floor Area
definition, equivalence to RICS-measured gross floor area); *Non-Domestic EPC Conventions for England
& Wales* (BRE/NCM, successive issues), on the GIA-per-RICS-Code-of-Measuring-Practice floor-area rule
and the car-park/unheated-space exclusion; RICS Code of Measuring Practice, 6th edition (2015); RICS
Property Measurement, 2nd edition (effective 1 May 2018, archived 9 June 2025) and RICS/isurv's
published interim guidance following that archival (adopt IPMS: All Buildings or the Code of Measuring
Practice pending the Code's 7th edition, expected later in 2026). Not tax advice and not a settled
measurement-practice determination — the interim RICS position itself is unsettled, which is a fact
about the profession right now, not a gap in this research.

### Stage 2 — Room schedule intake

**In:** the room-type list for the relevant sector from `strawman-room-equipment-schedule.md`
§1–§5, populated for this specific property — i.e., which of the listed room types actually exist
here, and (where the client or a partial document can say) how many of each.

**Out:** a list of `{room_type, count, area_m2 (optional), confidence}` entries. Two distinct
sources feed this, and they must not be blended without saying so:

- **Client-asserted** ("we have 40 bedrooms, one commercial kitchen, one laundry") — schema grade
  C, `CA`.
- **Partial document** (a floor plan that labels rooms but was never turned into a fire plan or
  M&E schedule; an old CQC statement of purpose; a planning application drawing) — schema grade B
  if a document genuinely exists and is read (`CD`), dropping to C if the extraction confidence is
  below threshold (schema §0.5; the threshold itself is **G-3, an open gap** — see §8, failure
  mode F-6).

**If the client cannot state even a room count** (only a total GIA and a sector): this stage
degrades to "room types plausible for this sector at this scale" only, with **no count at all** —
carry this forward as `room_count = UNKNOWN` per room type, not as an assumed number (§7).

### Stage 3 — Corroboration pass

This is the step this model adds that neither the room schedule nor the taxonomy currently states,
because it follows directly from the schema's own corroboration rule (I-17: a C-grade field may
not drive a GATE uncorroborated) applied by extension to a quantity that is about to be shown to a
client.

**Correction (Finding F-9, Phase 10): this stage is sector-conditional, not generally available.**
An earlier draft of this section implied a corroboration pass is available regardless of sector.
Run against a worked dental case (Phase 10 walkthrough, item 12818132946, Document 3, §A.2/A.4),
Stage 3 returns **nothing** for Dental: there is no ODS dispensing flag (GP-only — dentistry is not
an ODS-coded dispensing context), no meaningful CQC *capacity* concept for a dental location (CQC
registers a dental provider but not a bed/chair capacity figure the way it does for a care home),
and no planning record to fall back on, because converting office space to a dental surgery is a
change of use **within Class E of the Town and Country Planning (Use Classes) Order 1987 Schedule 2
(as amended)** — no planning application exists to search for in the first place. **Stage 3 is
substantively a Care Homes mechanism that partly generalises to GP**, via the registration/dispensing
rows below; it should not be presented as sector-neutral. The per-sector availability, as currently
known:

| Sector | Stage 3 availability | Why |
|---|---|---|
| Care Homes | Full — both rows below apply | CQC/CIW/HIW/HIS/RQIA registration carries a registered-capacity concept that plausibly corroborates `ch_bed_room_count` (subject to the schema-extension caveat below) |
| GP | Partial — the dispensing-flag row applies; the capacity row does not (GP registration is not bed-count-shaped) | `gp_is_dispensing_practice` is a genuine sector-specific API gate (Consolidated Schema §3.4) |
| Dental | **None** | No ODS flag; no CQC capacity concept; no planning record (Class E permitted change, Use Classes Order 1987 Sch. 2) — see F-9 |
| Supported Living | Not assessed in this pass — flagged for the surveyor, not asserted either way | Registration sits with the Regulator of Social Housing, not usually CQC, for the accommodation itself (companion document §3) |
| Private Hospitals | Not assessed in this pass — flagged for the surveyor, not asserted either way | CQC registration exists but a capacity corroboration concept for an acute facility has not been checked |

A quantity for a dental row that reaches Stage 3 should record `flags: ["STAGE_3_NOT_AVAILABLE_FOR_SECTOR"]`
rather than silently returning an empty corroboration and looking the same as a sector where
corroboration was genuinely attempted and found nothing to say.

**What can genuinely corroborate, today, per the schema as it stands — for the sectors where Stage 3
applies at all (see table above):**

| Corroborating source | Corroborates | Provenance | Status |
|---|---|---|---|
| `gp_is_dispensing_practice` (ODS dispensing flag) | Whether a Dispensary room type should be included at all (GP sector) | `API` (ODS), grade A | **Already in the schema** (§3.4) — genuinely usable today |
| `regulator_registration` (`structured<regulator, provider_id, registration_type>`) | That the property is registered with the stated regulator, and its registration type | `API` (CQC/CIW/HIW/HIS/RQIA), grade A | **Already in the schema** (§1.A) — but does **not** currently carry a bed-count/capacity sub-field |
| A public register's stated registered capacity (e.g. a CQC location record's stated bed number) | A client-asserted bed count (`ch_bed_room_count`) | Would be `API` if built | **Not in the schema today.** This is a **suggested extension, mine, not sourced** — flagged for the surveyor/product owner to decide whether it is worth building, not asserted as existing |

**What this stage does with a mismatch.** Where a corroborating source disagrees materially with
the client-asserted room count (e.g. the register shows a different registered bed number to the
one the client gave), this model does **not** pick a winner. It raises a flag
(`ROOM_COUNT_CORROBORATION_MISMATCH`) and leaves the quantity at whatever grade the uncorroborated
figure would have carried anyway — mismatches are surfaced, not silently resolved, consistent with
the schema's general treatment of unverified `C`-grade inputs (§0.5, I-17).

### Stage 4 — Sector room-count aggregation

Roll the Stage 2/3 output up into the schema's existing sector sub-fields, so this model's output
lands where the rest of the system already expects it:

| Sector | Target field (schema) | Built from |
|---|---|---|
| Care Homes | `ch_bed_room_count` | Count of "resident bedroom" rows in the room schedule |
| Dental | `dn_surgery_chair_count` | Count of "surgery / treatment room" rows |
| GP | `gp_consulting_room_counts.{consulting, treatment, minor_ops}` | Count of each of the three matching room types |
| Private Hospitals | `ph_high_acuity_room_counts.{theatre, icu, imaging, sterile_services}` | Count of each of the four matching room types |
| Supported Living | `sl_common_parts_areas` (`structured<identified, location, m2>`) | The common-parts subset of the room schedule only — **never** the within-dwelling rows (companion document §3b) |

**This stage is pure aggregation, not new derivation** — it does not upgrade any grade. A count
built from grade-C room-schedule rows is still grade C going into Stage 5 (before Stage 6's
worst-of-inputs rule potentially lowers it further).

### Stage 5 — Per-taxonomy-row quantity resolution

This is the core of the model, and it runs once per taxonomy row that the room-equipment schedule
says is present at this property. For each row, resolve in this **strict order** — stop at the
first one that succeeds, and never blend two paths for the same row:

**(a) Measured — a real document exists.** If a priced BoQ, M&E schedule, fire plan, drawings set,
asset register, or fixed-asset register genuinely exists and can be read against this specific
row's `quantity_basis` (taxonomy CSV column), use it. Grade B (or C if extraction is below
threshold — §8 F-6). **This is the case Build-Prep-05's existing pipeline and the taxonomy's
`quantity_basis` column already assume, and it needs no new model** — QD-S9 exists precisely because
this path is frequently unavailable.

**(b) Room-schedule count — direct.** If the row's `quantity_basis` is itself a room-type count
already produced by Stage 4 (`bed count`, `surgery (chair) count`, `consulting room count`,
`theatre count`, `imaging room count`, or the generic `room schedule`), and the item is
**one-per-room or a fixed small number per room** (e.g. one nurse-call point per bedroom, one set
of chair-position services per surgery), the room count **is** the quantity, subject to a
**"per-room multiplier"** where more than one instance sits in a single room (§6, coefficients
RD-10 onward). Grade: whatever Stage 2–4 assigned (C, or D if it also depends on a GIA split — see
§4).

**(c) Area-density — no room-level count, only floor area.** If the row's `quantity_basis` names a
GIA-linked basis (`GIA m2 + M&E schedule`, `communal GIA m2`, `elevations`) or the room-schedule
count itself is `UNKNOWN`, and only a total or zonal GIA is available, apply a **named density
coefficient** (units per m², or a linear-metre-per-m² ratio) from §6. This is the fallback path the
Monday item is actually asking for: *"get from floor area ... to countable quantities."* Grade: D
at best, because `gross_internal_area_m2` is D and grade inheritance (§4) means the output can
never be better than its worst input.

**(d) Cannot be resolved — the item exists in the equipment schedule but has no viable quantity
path.** If none of (a)–(c) apply — the row's `quantity_basis` names a document that does not exist
**and** it is not a simple room-count item **and** no density coefficient has been defined for it
— **stop.** Mark the row `UNRESOLVED`, contribute nothing to any total, and route to survey (§9).
Do **not** invent a number "so the report has something in every row."

### Stage 6 — Confidence grading

Apply the schema's existing rule (§0.5, I-2) mechanically: **a derived quantity's grade is the
worst grade among everything that fed it, and it is never A.**

| Path taken (Stage 5) | Inputs | Resulting grade | Why |
|---|---|---|---|
| (a) Measured document | `CD` document, above threshold | **B** | Document-extracted, per schema §0.5 |
| (a) Measured document | `CD` document, below threshold | **C** | Drops per the stated (but unset — G-3) threshold rule |
| (b) Room-schedule count, client-asserted only | `CA` room count | **C**, but see below | `quantity` itself is fixed at **D** by the schema (§1.G) regardless of path — so in practice this never surfaces to the engine as better than D |
| (b) Room-schedule count, corroborated by API (Stage 3) | `CA` + `API` | Still **D** | Corroboration raises *confidence in* the figure; it does not override the schema's fixed D grade on the `quantity` field itself |
| (c) Area-density | `CD/SV` GIA (D) × a surveyor-supplied coefficient (D — see §6, every coefficient is `SV`) | **D** | Worst of {D, D} = D |
| (d) Unresolved | — | **N/A — not a grade, a non-result** | The row is flagged, not graded |

**The practical upshot, stated once so it is not missed:** because `quantity` is already
schema-fixed at grade D, **this model can never make a quantity "engine-ready" (i.e. sign-off-free)
on its own.** Every quantity this model produces — however it was derived — still requires
surveyor confirmation before the sign-off-ready output can be issued (schema I-3). What this model
changes is not the grade ceiling; it is **whether there is any candidate number for the surveyor to
confirm or correct**, versus nothing at all.

### Stage 7 — UNKNOWN handling

Schema §0.3 states the rule for **GATE** fields: `UNKNOWN` is a first-class value, never coalesced
to a default, and never routed to the branch that produces the larger claim (I-1). A room count or
a quantity is not itself a GATE field, but the same hazard exists in a different shape: **guessing
a plausible-looking quantity where none is known inflates the apparent claim just as surely as
defaulting a grant answer to "no grant" does.** This model applies the same discipline by direct
analogy:

- **If a room count is `UNKNOWN`** (the client cannot say how many bedrooms/surgeries/consulting
  rooms exist, and no document supplies it): the model does **not** impute a "typical" number for
  the sector. It records `room_count = UNKNOWN`, excludes every taxonomy row whose Stage 5 path
  depended on that count from the running total, and raises `QUANTITY_NOT_DETERMINED` against
  each. The visible effect is a **conservative floor** (rows silently missing from the total),
  never an inflated ceiling — matching the direction Module 00's F-2 protects against.
- **If a density coefficient (§6) is not yet supplied by the surveyor:** the same treatment — the
  row stays `UNRESOLVED`, not defaulted to a placeholder ratio invented to make the report look
  complete.
- **This deliberately produces an under-count, not an over-count, wherever data is missing.** A
  report that says "we could only price 11 of the 15 rows we believe are present; 4 need a survey"
  is honest. A report that quietly guesses the missing 4 is the mis-selling failure mode Module 00
  §7 FM #15 names for a different field, recurring here in a new shape.

### Stage 8 — Output assembly

Each resolved (or explicitly unresolved) taxonomy row produces:

```
QuantityDerivationResult {
  taxonomy_row_ref:     "LS-XX-NNN"
  resolution_path:      "measured" | "room_schedule_count" | "area_density" | "unresolved"
  quantity_low:         number | null
  quantity_high:        number | null      // a range where the path involves an estimated
                                            // coefficient (c); a single figure where measured (a)
  unit:                 string             // from the taxonomy CSV 'unit' column
  confidence_grade:     "B" | "C" | "D" | null   // null only when unresolved
  provenance:           string[]           // e.g. ["CD:floor_plans", "SV:coefficient RD-04"]
  coefficients_used:    string[]           // named §6 coefficient ids, if any
  flags:                string[]           // e.g. "QUANTITY_NOT_DETERMINED",
                                            // "ROOM_COUNT_CORROBORATION_MISMATCH",
                                            // "DWELLING_AREA_EXCLUDED_BEFORE_DENSITY"
}
```

This is deliberately shaped like `Build-Prep-05`'s `EstimateResult` (ranges, never a point figure;
flags and assumptions always populated; a stated basis) so the two slot together rather than
introducing a second, incompatible output convention.

**What this feeds, and what it does not feed.** A `QuantityDerivationResult` is an input to the
*separate, unbuilt* rate table (§0) and to the surveyor's own working papers. It is **not** itself
`cost_basis` (schema §1.G), which remains `DR / CD / SV`, grade D, and is never computed by
multiplying an unreviewed quantity by an unreviewed rate without a surveyor confirming both.

---

## 3. Which inputs are API/CD-derivable, and which are irreducibly client-asserted or surveyor-only

**Correction (Finding F-13, Phase 10): the claim that only two inputs are genuinely API-derivable
today is too pessimistic, and was sector-blind.** It holds for GP and (on the registration row)
Care Homes. For **Dental** specifically, `gp_is_dispensing_practice` does not apply at all (ODS is
a GP concept), but the Phase 10 worked dental case (item 12818132946, Document 3, §A.2.1) found
**four** genuinely working API/CD sources, not two: **Companies House** identity (clean), **CQC**
registration (available), **EPC floor area** (available, and the single most load-bearing register
value in that case — see the companion research item 12927112165 on whether its measurement
convention matches a surveyor's GIA), and, **on a purchase**, **HM Land Registry Price Paid**
(clean, but not applicable on a fit-out). VOA works for none of these four — the bulk-data licence
has not cleared, and the connector's own Assumption A-6 records that the compiled-list product
probably does not publish floor area even if it were cleared. The count of "genuinely API-derivable
today" is therefore **sector- and trigger-dependent**, not a single repo-wide figure — restated per
sector below rather than asserted as one number:

| Sector | Genuinely API/CD-derivable today | Notes |
|---|---|---|
| GP | 2: `gp_is_dispensing_practice` (ODS), `regulator_registration` (CQC/CIW/HIS/RQIA) | The original two-input claim, correct for this sector |
| Care Homes | 1 fully (`regulator_registration`), 1 proposed extension (registered capacity, not built) | See the registered-capacity row below |
| Dental | 4 (fit-out): Companies House, CQC registration, EPC floor area, plus GP's `gp_is_dispensing_practice` does **not** apply. **5th on a purchase**: HMLR Price Paid | VOA unavailable for all — licence-blocked and probably lacks floor area regardless |
| Supported Living, Private Hospitals | Not assessed in this pass | Flagged for a future sector-specific pass, not asserted as two, four, or any other number |

| Input | Best available provenance today | Grade | API/CD-derivable? |
|---|---|---|---|
| `gross_internal_area_m2` | `CD` (EPC/plans) `/ SV` | D | **CD-derivable** if a document exists; otherwise SV-only |
| Room type existence (which rooms this property has) | `CA / SV` | C | Client-asserted, corroborated only by SV on inspection |
| Room counts (how many of each type) | `CA / SV` | C | Client-asserted; **not** API-derivable under the schema as it stands |
| `gp_is_dispensing_practice` | `CA / API` (ODS) | A | **API-derivable — genuinely today, not proposed. GP only — does not apply to Dental (F-13)** |
| `regulator_registration` (which regulator, provider id, registration type) | `CA / API` | A | **API-derivable — genuinely today**, including for Dental via CQC (F-13) |
| Companies House entity identity | `CA / API` | A | **API-derivable — genuinely today (F-13).** Not previously listed in this table |
| EPC floor area | `CD / API` (EPC register) | D (see §1, item 2 — floor area is corroborating evidence, not settled fact) | **API/CD-derivable — genuinely today (F-13).** The single most load-bearing register value in the Phase 10 dental case; its equivalence to surveyor GIA is the open question at item 12927112165 |
| HM Land Registry Price Paid | `API` | A (as a transaction fact; feeds `base_amount`, not a quantity) | **API-derivable — genuinely today, on a purchase only (F-13).** Not applicable on a fit-out |
| Registered bed/place capacity as a cross-check on `ch_bed_room_count` | — | — | **Not currently in the schema.** A plausible future `API` extension (public register data), flagged here as a suggestion, not asserted as built |
| Density/ratio coefficients (§6) | `SV` only | D | **Irreducibly surveyor-only.** No document or register states "fire-detection points per m² of a care home" — this is professional judgement calibrated against real projects, exactly the kind of number Rulebook-style calibration work is for |
| Per-room multipliers (§6, RD-10+) | `SV` only | D | As above |
| `fixture_vs_chattel`, `already_pooled`, `newness`, `pool_tag`, `present_flag` (schema §1.G) | `SV / CTA` | D/E | **Entirely outside this model's scope.** A resolved quantity says nothing about whether the item is a fixture, whether it is already pooled, or which pool it sits in — those questions are answered independently, by the surveyor and CTA, regardless of how confidently this model produced the count |

---

## 4. Confidence grade of a derived quantity — worked through explicitly

The schema's rule (§0.5, I-2): **a `DR` field's grade is the worst grade among its inputs, never
`A`.** Two worked examples, because the rule is easy to state and easy to misapply:

**Example 1 — a bed count derived from a client-asserted room schedule alone (no GIA involved).**
Inputs: room-schedule count, `CA/SV`, grade **C**. No GIA in the chain. Worst-of-inputs = C. But
the schema separately fixes `quantity` (schema §1.G) at grade **D** regardless of path — so the
*field* that actually reaches the engine is D, not C. **The two rules do not contradict**: I-2
governs how a *newly computed* field inherits grade from its inputs; the fixed D on `quantity` is
the schema's own floor for that specific field, set because a chartered surveyor must confirm any
per-item count before it is relied on, however it was arrived at. This model's job is to be
explicit that **no derivation shortcut changes that floor** — a well-corroborated, carefully
modelled quantity is still a D-grade quantity, and still needs the surveyor's signature.

**Example 2 — a fire-detection point count derived from GIA via a density coefficient (Stage 5c).**
Inputs: `gross_internal_area_m2` (`CD/SV`, grade **D**) × coefficient RD-01 (`SV`, grade **D** —
every coefficient in §6 is a surveyor input by construction, since none of them exist in any
document today). Worst-of-inputs = D. Consistent with Example 1's floor. **No inflation, no
special case.**

**The one place grade could differ, and why it still doesn't.** One might expect a *measured*
quantity (Stage 5a, reading an actual M&E schedule) to reach grade B, since the source document is
`CD` at grade B under §0.5's general rule. This model records that at the *derivation* level
(Stage 6's table above correctly shows B for path (a)) — but again, `quantity` as a schema field is
fixed at D. **Recording B at the derivation-provenance level while the field itself carries D is
not an inconsistency**: it tells the surveyor *how much independent checking this particular number
already has behind it* (a lot, if B; very little, if D-via-coefficient), which is exactly the
information a surveyor needs to decide how much of their own time a given row deserves — even
though every row still needs their sign-off before it is final.

---

## 5. Resolution order, restated as a decision table

| `quantity_basis` value (from the taxonomy CSV) | Document exists? | Resolution path | Typical grade |
|---|---|---|---|
| `fire plan` | Yes | (a) Measured | B (or C below threshold) |
| `fire plan` | **No** (this item's named scenario) | (c) Area-density, coefficient RD-01/RD-02 (§6) | D |
| `M&E schedule` | Yes | (a) Measured | B |
| `M&E schedule` | **No** | (c) Area-density, sector-specific M&E-linked coefficient (§6) | D |
| `drawings` / `elevations` | Yes | (a) Measured | B |
| `drawings` / `elevations` | **No** | (d) Unresolved — no density coefficient defined for these low-count, geometry-specific items (lifts, partitions, blinds) | N/A, route to survey |
| `priced BoQ` | Yes | (a) Measured | B |
| `priced BoQ` | **No** | (d) Unresolved — enabling-works (`LS-XX-014`/`019` etc.) rows have no sensible area-density proxy; they follow a named parent element that itself needs a measured cost | N/A, route to survey |
| `asset register` / `fixed-asset register` | Yes | (a) Measured | B |
| `asset register` / `fixed-asset register` | **No** | (d) Unresolved — these are chattel/long-life rows; guessing them risks exactly the double-count the schema repeatedly warns against (I-13, §1.G splitting rule) | N/A, route to accountant's fixed-asset register or survey |
| `bed count` | Room schedule available | (b) Room-schedule count | C→D (schema floor) |
| `bed count` | Room schedule `UNKNOWN` | (c) Area-density, coefficient RD-02 | D, flagged conservative |
| `surgery (chair) count` | Room schedule available | (b) Room-schedule count | D |
| `consulting room count` | Room schedule available | (b) Room-schedule count | D |
| `theatre count` / `imaging room count` | Room schedule available | (b) Room-schedule count | D |
| `communal GIA m2` | Common-parts split known | (c) Area-density on the common-parts area only | D |
| `dispensing flag (ODS)` | — | **Not a quantity at all — a gate on whether the Dispensary row exists.** Resolved by API (Stage 3), not by this table | A (the gate); the dispensary's internal quantity still needs (a)/(b)/(c)/(d) |

---

## 6. Named coefficients — every value is a blank for the surveyor to supply

**No ratio, density, or per-room multiplier below has a value filled in, and none should be
invented to make this table look complete.** Each row names the coefficient, its unit, what it
multiplies, and which taxonomy rows/sectors it feeds. The "Value" column is deliberately empty.

**Ranked by frequency-of-use (Finding F-7, Phase 10).** Running this model over a fully worked
dental case (item 12818132946, Document 3, §A.4) resolved **20 of 21 taxonomy rows** on path (a)
Measured or path (b) Room-schedule count — the coefficients below were reached **once**. That is a
property of the trigger type, not of the coefficient set: an **invoiced fit-out** arrives with the
very documents (fire plan, M&E schedule, drawings) these coefficients exist to substitute for, so
almost nothing falls through to path (c). A **purchase apportionment** brings none of those
documents and reaches close to **every row** in Tier 2 below. §5's "handoff pack" register (item
B4) presents all fourteen as one undifferentiated block of narrowable blanks; that overstates how
much surveyor time most of them are worth on fit-out work, which — per the Phase 10 commercial
finding (F-2) — is the trigger type Caprebate should lead its pilot with. Rank before spending any
surveyor's paid time on a coefficient, rather than working through RD-01…RD-14 in numeric order:

| Tier | Coefficients | When actually reached | Why |
|---|---|---|---|
| **1 — reached on both trigger types** | RD-01, RD-02, RD-03, RD-04 | Whenever the relevant document (fire plan, M&E schedule) is missing, **regardless of invoiced-vs-purchase** | These are the four `ALL`-sector coefficients whose `quantity_basis` is itself a *document* (fire plan / M&E schedule), not a room count — there is no path (b) fallback for them, so a missing document routes straight to path (c) on any case. RD-01 was the coefficient actually reached in the worked dental case, and F-4 separately finds it specified against the wrong basis (room-driven, not area-driven) |
| **2 — reached almost only on a purchase apportionment** | RD-05, RD-06, RD-07, RD-09, RD-11, RD-12, RD-13 | Rare on an invoiced fit-out (the room count itself is normally known from the client or a partial document, so path (b) succeeds first); **on nearly every row** on a purchase, where no room-level document exists at all | These coefficients only fire when Stage 2's room count is itself `UNKNOWN` — the case an invoiced fit-out rarely presents, and a bare purchase presents routinely (Phase 10 finding F-2) |
| **3 — verification only, not a gap-filler** | RD-08 | Whenever the row is reached, but it exists to sense-check a figure that "should normally be 1:1", not to substitute for a missing document | Lowest priority for surveyor time — it flags a discrepancy rather than supplying a number nothing else can |
| **Not a quantity coefficient** | RD-14 | Every time Stage 5(a) grades a measured extraction, not just when a document is missing | A meta-threshold (the schema's own open gap G-3), not a density/ratio like the other thirteen — ranking it alongside them in the handoff pack's "fourteen blanks" count conflates two different kinds of open item |

**Practical upshot for surveyor engagement.** On the fit-out work Caprebate should lead with,
only **Tier 1 (four coefficients)** is likely to be reached at all, and even then only when the
specific document is missing. Tier 2's seven coefficients are the ones worth deferring past the
pilot, not the ones worth asking a surveyor to price first.

| Coefficient ID | Name | Unit | Multiplies | Applies to (rows / sector) | Value |
|---|---|---|---|---|---|
| RD-01 | Fire-detection points per m² GIA, no fire plan | points / 100 m² | Quantity for `LS-MP-003` (fire alarm/detection) | ALL sectors | **__________** |
| RD-02 | Sprinkler heads per m² GIA, no fire plan | heads / 100 m² | Quantity for `LS-MP-004` | ALL sectors | **__________** |
| RD-03 | CCTV/access-control points per m of external/internal perimeter, no M&E schedule | points / 100 m | Quantity for `LS-MP-006`, `LS-MP-007` | ALL sectors | **__________** |
| RD-04 | Data/comms points per m² GIA, no M&E schedule | points / 100 m² | Quantity for `LS-MP-008` | ALL sectors | **__________** |
| RD-05 | Nurse-call points per bedroom, where bedroom count is known but the call-point layout is not | points / bedroom | Quantity for `LS-CH-001` | Care Homes | **__________** |
| RD-06 | Hoist-fitted bedrooms as a proportion of total bedrooms, no O&M manual/asset schedule | % of bedrooms | Quantity for `LS-CH-002` (fixed side only, after the fixture/chattel split) | Care Homes | **__________** |
| RD-07 | Sluice rooms per bedroom count band | sluice rooms / N bedrooms | Room count for "Sluice room" (companion doc §1) | Care Homes | **__________** |
| RD-08 | Chair-position service sets per surgery (should normally be 1:1 — flagged only for verification) | sets / surgery | Sense-check on `LS-DEN-003` | Dental | **__________** |
| RD-09 | Consulting-room acoustic-insulation linear metres per room, no drawings | m / room | Quantity for `LS-GP-004` | GP | **__________** |
| RD-10 | Hand-wash-basin count per consulting/treatment room, where more than one basin per room is typical | basins / room | Per-room multiplier for `LS-GP-001` | GP | **__________** |
| RD-11 | MGPS terminal outlets per theatre, no M&E schedule | outlets / theatre | Quantity for `LS-PH-001` | Private Hospitals | **__________** |
| RD-12 | Nurse-call/monitoring points per bed, no M&E schedule | points / bed | Quantity for `LS-PH-013` | Private Hospitals | **__________** |
| RD-13 | Common-parts fire/security point density per m² of common-parts GIA (post dwelling-split) | points / 100 m² | Quantity for `LS-SL-003`, `LS-SL-004` | Supported Living | **__________** |
| RD-14 | Extraction confidence threshold for a room schedule read from a partial document (schema G-3) | % confidence | Determines whether Stage 5(a)/Stage 2 grades B or drops to C | ALL sectors | **__________** (this is the same open threshold named in schema §4, G-3 — not a new gap, restated here because this model depends on it) |

**Where these coefficients should come from, once someone is appointed to set them.** Real
completed projects per sector (the same "calibrate against real projects" open item every module
spec already lists in its §11 — Module 01 §8, Module 02 §11, Module 03 §11, Module 04 §11, Module
05 §11), not a published national average, because fixture density genuinely varies with acuity,
sub-type, and age of building within a sector (Module 01 §5, Module 02 §1, Module 05 §1 all say
this explicitly for their own yield bands, and the same caution applies to a quantity density).

---

## 7. Failure modes and the guards against them

1. **Guessing a coefficient because the table "should" be complete.** Guard: §6 is published with
   blanks; a resolution engine must refuse to run Stage 5(c) for any row whose coefficient is
   unset, and must emit `UNRESOLVED`, not a fabricated ratio.
2. **Applying a whole-building density coefficient to a dwelling-restricted area.** The Supported
   Living sector's common-parts GIA must have the dwelling area excluded (companion document §3,
   schema `sl_common_parts_areas`) **before** any density coefficient in §6 runs — otherwise a
   corridor-lighting density gets scaled by floor area that includes the excluded dwellings, which
   silently inflates a claim the sector's whole design exists to keep small (Module 03 §1, §6).
   Guard: Stage 1 must apply the dwelling/common-parts split first; RD-13 is defined only against
   the post-split common-parts figure.
3. **Blending a measured count and a derived count for the same row.** Guard: Stage 5's resolution
   order is strict and exclusive — the first path that succeeds is used, and the others are not
   consulted, so a partial M&E schedule covering three of five rows does not get topped up with a
   density guess for those same three rows.
4. **Double-counting a chattel as a fixture because the room schedule lists the equipment without
   distinguishing fixed services from the loose item.** Guard: this model never resolves
   `fixture_vs_chattel` (schema §1.G) — every companion-document table explicitly marks chattel
   rows "not this schedule's fixtures target," and Stage 5(d) refuses to guess a quantity for a
   row whose only available basis is an asset register that does not exist, rather than
   double-counting it off the room schedule instead.
5. **One national coefficient masking real sector/acuity variation.** Guard: §6 coefficients are
   defined per sector (and, where the module specs already flag acuity-driven variation — Module
   02 §1's practice gradient, Module 05 §1's acuity gradient — should be further split by sub-type
   before being relied on; this model does not itself build that finer split, it only names where
   one is needed).
6. **The extraction-confidence threshold (schema G-3) being genuinely undefined anywhere in the
   repo.** This is not a guard this model can build — it is an upstream open item this model
   inherits. RD-14 restates it rather than resolving it, because Stage 5(a) cannot correctly grade
   a "measured" result as B vs C without it.
7. **Treating a resolved quantity as if it settles eligibility.** Guard: the output contract (§2,
   Stage 8) carries no eligibility field. A fully resolved, grade-B quantity for a UCV installation
   count says nothing about whether that installation is `MP` or `SR` (taxonomy `APPORTION`,
   Module 05 §4) — that stays a live, unresolved surveyor/CTA call regardless of how good the
   quantity is.

---

## 8. Where the model must stop and hand over to a survey

This model is explicitly bounded. It stops, and states that it has stopped, at each of the
following points — it does not attempt to push through them with an assumption:

1. **No floor area at all** (no EPC, no plans, nothing) — Stage 1 cannot produce even a starting
   number. Nothing downstream runs. Route straight to survey.
2. **No room schedule and the client cannot describe the rooms even qualitatively** — Stage 2
   cannot populate even room *types*, let alone counts. The companion document's tables cannot be
   populated for this property at all.
3. **Any row whose natural `quantity_basis` is a document that does not exist and has no defined
   density-coefficient fallback** (§5's "Unresolved" rows — enabling works, chattels/asset
   registers, geometry-specific items like lifts and partitions). These are not retried with a
   weaker method; they are named as needing a document request or a site visit.
4. **Any taxonomy row already flagged `APPORTION` or `CONTESTED`/`(judgement)` in its source
   module** (underfloor heating, GP enhanced ventilation, private-hospital UCV/isolation
   ventilation/IPS, dental chair fixture-vs-chattel, radiation shielding). A resolved quantity for
   one of these rows is still only a **count of installations**; whether those installations sit in
   `MP` or `SR`, or are a fixture at all, is untouched by this model and stays exactly where the
   source modules already put it — surveyor sign-off and the filing-position signer's under clause 1, never
   defaulted _(Phase 146a, 22 Sep 2026: this said "surveyor and CTA sign-off")_ (Module 00 §5, the
   `APPORTION` note in `Build-Prep-05` §5 Stage 4b).
5. **Any coefficient in §6 that has not yet been supplied.** Not a temporary default pending
   calibration — an absence, flagged, until someone with authority to set it (a chartered surveyor
   working from real project data) does so.
6. **The dwelling/common-parts split itself, in Supported Living**, where it is not already
   resolved (`sl_dwelling_configuration`, `sl_segregation_possible` — schema §3.3, both grade
   D/E-adjacent gates). This model consumes that split; it does not produce it.
7. **Whichever `fixture_item[]` fields the schema already reserves for the surveyor outright**
   (`fixture_vs_chattel`, `already_pooled`, `newness`, `present_flag`, `pool_tag`, `cost_basis`) —
   listed again here only to be unambiguous that a resolved quantity from this model never
   substitutes for any of them.

---

## Sources & references

`Build-Prep-05-Estimate-Engine-Specification.md` (the existing Stage 1–7 spend-based estimator this
model sits alongside, not inside; the pool-split "cost library... NOT YET AVAILABLE" note that
defines what a "rate table" means here); `Build-Prep-Consolidated-Schema.md` §0 (conventions,
provenance codes, confidence grades, the grade-inheritance rule I-2, the UNKNOWN rule I-1), §1.C,
§1.G (`gross_internal_area_m2`, `room_counts`, `quantity`, `fixture_vs_chattel`, `already_pooled`,
`newness`, `present_flag`, `pool_tag`, `cost_basis`), §3.1–§3.5 (sector room-count sub-fields), §4
(known gaps G-3 extraction-confidence threshold, G-4 survey data contract); `Module-00-Master-
Engine-Specification.md` §5 (the `APPORTION`/`CONTESTED` convention); `Caprebate-Fixture-
Taxonomy-v1.csv` (`quantity_basis`, `unit`, `pool` columns, every `LS-XX-NNN` row cited);
`strawman-room-equipment-schedule.md` (this document's Stage 2 input — see its §0–§5).

Indicative technical scaffolding only, **not tax advice and not an engine-ready model.** Every
coefficient is unset by design; every quantity this model can produce still requires chartered-
surveyor confirmation before it is relied on, per the schema's own fixed grade on the `quantity`
field.
