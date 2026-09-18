# Module 01 — Care Homes: Stress-Tested Specification

**What this is:** the hardened, build-ready logic for the care-home module of the assessment software — the question flow (with gates and branches), the fixture taxonomy, the yield logic, and the failure modes — incorporating the care-home stress test.

**Status:** Current as of June 2026 (post-Autumn 2025 Budget rates). Indicative, not tax advice; items flagged in Section 8 need professional sign-off before go-live. Valuations are signed off by a chartered surveyor and filing positions by a tax specialist.

**The core insight this module is built around:** "care home" is not one thing. It's a spectrum from a *traditional nursing home* (an institution → full-building claim) to *extra-care / assisted-living* (self-contained flats → dwelling-house restricted → common parts only). The module's primary job is to locate the client on that spectrum and gate accordingly. A flat "care home = full claim" rule is wrong.

> **Legend:** `[GATE]` = wrong answer kills or severely reduces the claim (must block/route). `[BRANCH]` = changes the path. `[MODIFIER]` = changes size/speed/type of relief. `[FLAG]` = route to specialist review. `(CORE)` = shared engine, reused across all sectors. `(CH)` = care-home-specific.
> Pool tags: `MP` = main pool (14% from Apr 2026), `SR` = special rate / integral features (6%), `SBA` = structures & buildings (3%).

---

## 1. Module scope

**In scope:** residential care homes, nursing homes, dementia/EMI units, and — with restriction — extra-care / assisted-living / close-care.

**Claimant types:** a care provider running a care trade (commercial), and/or an investor owning care-home property and letting it commercially.

**Route elsewhere:** pure supported living → Supported Living module (different dwelling-house treatment); children's residential homes → validate separately; domiciliary care with no qualifying property → no property claim.

---

## 2. The question flow (in order)

### A. Claimant & ownership structure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q1 | Legal structure? (sole trader / partnership / LLP / Ltd) | `MODIFIER` `(CORE)` | Which allowances apply. Full Expensing & 50% special-rate FYA = companies only; AIA / 40% FYA / WDAs = all. Largely academic on a second-hand purchase. |
| Q2 | Is the claimant a UK taxpayer (income/corporation tax) and **not** a charity or pension fund? | `GATE` `(CORE)` | If not a taxpayer → no claim (but may still matter on the **sell side** — see §7). |
| Q3 | Accounts on cash basis or accruals? | `GATE` `(CORE)` | Cash basis (sole trader/partnership) → **no property fixtures claim** (cars only). |
| Q4 | Does one entity own the property **and** run the care trade, or is it split (PropCo owns / OpCo operates)? | `BRANCH` `(CH)` | Owner-occupier → simplest. Split → go to Q4a/Q4b. |
| Q4a | (If split) Is there a **formal lease** giving the operator an interest in the property, or is occupation under **licence**? | `GATE` `(CH)` | Lease → operator can claim on the fit-out it installs for its trade. Licence / no lease → entitlement weak **and** capex enhancing the PropCo asset can be a **constructive distribution** (income-tax/dividend or employment-benefit charge). **Flag.** |
| Q4c | (If leased) Did the landlord (or a connected party) contribute towards the fit-out? | `GATE` `(CH)` | A landlord contribution reduces the operator's qualifying spend (s.532) — the landlord may separately claim contribution allowances (s.537–538). **F-7: previously this was entirely unasked here — captured now as a number and deducted in Stage 1, not left as a note for survey.** |
| Q4cv | Roughly what share of the fit-out did the landlord contribute? | `MODIFIER` `(CH)` | Sizes the deduction at Q4c. |
| Q4b | (If split) Are PropCo and OpCo in the **same group**? | `MODIFIER` `(CH)` | Affects whether any distribution is exempt (grouped) or taxable (ungrouped). |
| Q5 | Has there been a **sale-and-leaseback** of the property (recently or planned)? | `BRANCH` `FLAG` `(CH)` | Disposal event → fixtures election + potential balancing charge for the seller. Very common in this sector. **Route to specialist.** |

### B. Property & the dwelling-house test — *the critical care-home gate*

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q6 | Do residents occupy **self-contained flats** (own kitchen + bathroom + living space) or **rooms within a care setting** with shared dining/lounge and care provided? | `GATE` `BRANCH` `(CH)` | **Rooms in a care setting** → traditional home = *institution*, not a dwelling-house → **full-building claim available**, and worth testing the s.270CF SBA personal-care exception on the residual structure (E-10). **Self-contained flats** → extra-care *or* sheltered/retirement housing — **both are dwelling-houses under CA11520** (the extra-care/sheltered distinction doesn't change the P&M answer) → **dwelling-house restriction**: only communal/care/staff areas qualify, costs must be **segregated**, consider specialist review; **and additionally barred from SBA on the residual structure by CA92800** — the s.270CF exception does not rescue self-contained flats (E-13). **Mixed** → segregate and apply to the qualifying parts only. |
| Q7 | Is the home **CQC-registered** and providing personal/nursing care? | `MODIFIER` (evidence) `(CH)` | Supports the "care trade / institution" position that takes the property outside the dwelling-house restriction. |

### C. Transaction & expenditure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q8 | What triggers the claim — **purchase / new build / fit-out / refurbishment**? (can be more than one) | `BRANCH` `(CORE)` | Purchase → s.562 apportionment + entitlement history (§D). New build → P&M first, then SBA on residual. Fit-out/refurb → richest claims + repairs angle. |
| Q9 | Approximate amount(s) and date(s) of expenditure? | `MODIFIER` `(CORE)` | Sizing + timing/amendment window. |
| Q10 | Is cost information available (sale contract, build cost breakdown, invoices), or only high-level summaries? | `MODIFIER` `(CORE)` | Missing detail doesn't kill the claim — it's why a surveyor values/apportions — but shapes method. |
| Q10a | (Refurb branch) Were any works **like-for-like repairs/renewals** rather than improvements? | `BRANCH` `(CORE)` | Split out **repairs** → 100% immediate revenue relief, separate from and on top of capital allowances. Flag for the repair/improvement judgement (HMRC challenge point). |

### D. Entitlement history — *governs the yield, not just eligibility*

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q11 | (Purchase) Has any **previous owner claimed** capital allowances on the fixtures? | `GATE` `(CORE)` | Drives the pooling/fixed-value analysis. |
| Q12 | Was any prior owner **able** to claim (a taxpaying business), or were they a **developer holding as stock** or a **tax-exempt body** (pension fund/charity)? | `GATE` / opportunity `(CORE)` | If a prior owner could claim → they must have **pooled** and there must be a valid **s.198 election**, else buyer entitlement = **nil**. If no prior owner was ever entitled → **fresh s.562 claim** available (best case). |
| Q13 | Were prior transfers between **connected parties / within a group**? | `FLAG` `(CH)` | Connected/intra-group transfers can silently destroy entitlement (e.g. timing barring pre-commencement integral features). **Route to specialist.** |
| Q14 | Is there an **existing s.198 election**, and what value does it fix? | `GATE` `(CORE)` | Validity check: must cover **fixtures only** (loose items invalidate it), submitted **within 2 years**, with s.201 content. A **low-value election caps** the buyer's claim. |
| Q15 | Did the seller **acquire before April 2008**? | opportunity `(CORE)` | If so, seller couldn't have claimed integral features → buyer may get an **integral-features uplift (~15%)**. |
| Q16 | What do the **CPSE replies** say on capital allowances? | evidence `(CORE)` | Documentary evidence of the position; blanks/"N/A" = investigate, not closed. |

### E. Funding & timing

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q17 | Was any spend funded by a **grant or subsidy**? | `MODIFIER` `(CORE)` | Grant-funded expenditure generally **excluded** from qualifying spend. **"Not sure" is a flag, not a nil assumption (F-2)** — the estimate must route to specialist review rather than silently defaulting to "no grant" and producing an over-claim. |
| Q18 | Was VAT charged and is it **irrecoverable**? | `MODIFIER` `(CORE)` | Irrecoverable VAT (plus SDLT and fees on a purchase) can be **included** in qualifying expenditure. |
| Q19 | Tax year, and is the relevant return still **amendable**? | `MODIFIER` `(CORE)` | In time → **AIA at 100%** (fast relief, possible refund). Out of time → **WDAs** going forward (allowances not lost, just slower). |

### F. Prior claims

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q20 | Has the current owner or their accountant **already claimed** on this property's fixtures? | `GATE` `(CORE)` | Allowances claimable **once** per fixture; avoid double-counting (loose-equipment claims don't preclude an embedded-fixtures claim). |

---

## 3. The four gates that most often kill or shrink a care-home claim

1. **Dwelling-house / self-containment (Q6)** — extra-care with self-contained flats restricts the claim to common parts and demands cost segregation. Get this wrong and HMRC denies, or the claim collapses for lack of segregation (the *Hora Tevfik* failure mode).
2. **Ownership structure (Q4/Q4a)** — no formal lease for the operator means weak entitlement and a constructive-distribution tax charge.
3. **Entitlement history / connected transfer + existing election (Q12–Q14)** — a prior claim with a low-value election, or a connected-party transfer in the chain, can reduce the available claim to a fraction or nil.
4. **Prior claim by current owner (Q20)** — double-counting risk.

---

## 4. Care-home fixture taxonomy

Pool allocation is subject to the statutory **function test**; items marked *(judgement)* are where a specialist defends the position and where HMRC may push back.

> **How to read this taxonomy — membership of a statutory list is not qualification.**
> CAA 2001 excludes almost everything by ss.21–22 and then carves exceptions back out, and the two
> carve-outs are **not** equivalent. Every row below therefore carries a **route**:
>
> | Route | Meaning | Common-law test still runs? |
> |---|---|---|
> | **`IF`** | s.23(2) — integral feature (s.33A), thermal insulation, personal security, software | **No.** Treated as plant regardless of function |
> | **`LISTC→CL`** | s.23(3) — List C. **The exclusion lifts; the item is not thereby plant** | **Yes.** Must be passed on the facts of this trade |
> | **`CL`** | No statutory exclusion applies | **Yes** |
> | **`S25`** | Building alterations incidental to installing plant | n/a — follows the plant it serves |
> | **`EXCL`** | Excluded, no route back | n/a |
>
> **The rule this taxonomy previously got wrong.** A `LISTC→CL` row must never be claimed on the
> strength of the list item alone. List C answers *"is it excluded?"*; it does not answer *"is it
> plant?"* HMRC says so expressly at CA21010, and the *Wimpy* three tests, four factors and the
> durability test all still run. Accordingly the engine must hold **`common_law_required = true`**
> against every List C row; the qualifying percentage on such a row is a judgement about what the
> item does **in this trade**, not a property of the item; and the report must state what the test
> turns on. Where the common-law test is not evidenced, the conservative position is nil for that row.
>
> **Consequence for §5.** The yield bands below were assembled when List C membership was read as
> qualification. They are therefore capable of overstating this sector and must be re-tested against
> a routed taxonomy before they are relied on (see the calibration items on the board).
>
> Authority: CAA 2001 ss.21–25 and s.33A; HMRC CA21010, CA21140; *Urenco Chemplants* [2022] EWCA Civ
> 1587. Full decision order at Rulebook D §3 (P0–P6). **s.23(2) is resolved before s.23(3).**


### Integral features — special rate (`SR`, 6%) — route `IF`

*Qualify regardless of function. No common-law test runs on these rows.*

Electrical & lighting systems; cold water system; space/water heating, powered ventilation/air-cooling/air-purification (and floors/ceilings forming part of such systems); **passenger lifts**; external solar shading; thermal insulation added to the existing building; long-life assets.

### General plant & fixtures — main pool (`MP`, 14%) — routes `LISTC→CL`, `CL`, `S25`

*`common_law_required = true` on every row here. Sanitaryware, fire alarm, sprinklers, intruder alarm, CCTV, access control, data/comms, signage and demountable partitioning reach this list only through List C items 5, 10, 11, 8, 15 and 13 — each of which lifts the exclusion and no more. Partitioning under item 13 additionally requires the partitions to be moveable **and intended to be moved** in the course of the trade. Window blinds, carpets, floor coverings, door ironmongery and stair nosings have no List C item at all and are argued against List A item 1 on the common-law test alone. "Alterations incidental to installing plant" is `S25`, not List C.*

Sanitaryware & fitted washroom fittings; fire alarm/detection; security (CCTV, intruder alarm, access control); signage; demountable partitioning; window blinds; carpets/floor coverings; fitted furniture, cabinetry, reception desks; data/comms cabling (where qualifying); door ironmongery, stair nosings; alterations incidental to installing plant.

### Care-specific plant (`MP` unless noted) — routes `LISTC→CL`, `CL`

*`common_law_required = true` on every row here. Hoists are List C item 6; assisted bathing, commercial laundry and catering are item 5; AV, wander-guard and dementia-safe access are item 8; the standby generator is item 1; sluice rooms and bedpan washers reach the list through item 2, which is itself conditional on the system being provided **mainly** to meet the particular requirements of the care trade or to serve particular plant. Nurse-call, through-floor and platform lifts, stairlifts, assistive flooring and handrails have **no List C item** and stand or fall on the common-law test alone.*

- Nurse-call / emergency-call systems — `MP` (trade apparatus, **not** an integral feature)
- Patient hoists (ceiling-track & mobile-fixed) — `MP`
- **Through-floor / platform lift** for disabled use — `MP` *(judgement — distinct from a passenger lift `SR`)*
- Stairlifts — `MP`
- Assisted-bathing systems / specialist baths / wet rooms — `MP`
- Sluice rooms, bedpan washers, macerators — `MP`
- Commercial laundry installation — `MP`
- Commercial/industrial kitchen & catering — `MP`
- Communal AV / entertainment systems — `MP`
- Dementia-safe door access / wander-guard — `MP`
- Standby generator / UPS — `MP`
- Assistive flooring, handrails (trade-related) — `MP` *(judgement)*
- Underfloor heating — `SR` (heating system) or `MP` depending on configuration *(judgement; **also carries the s.33A(6) carve-out.** Where the screed or floor build-up is claimed as part of the heating system, s.33A(6) excludes an interior floor intended to remain permanently in place. Same unresolved tension as the plenum-ceiling question — CTA open question 3 on Rulebook D. Surface it; do not resolve it.)*

### Building alterations incidental to installing plant — route `S25`

**Building alterations incidental to installing plant — route `S25`, pool follows the plant served**

s.25 is a **claimable category in its own right**, not a footnote to the main-pool list. Capital expenditure on alterations to an existing building incidental to installing plant is treated as expenditure **on that plant**, and the works form part of it. Two consequences the old prose lost:

1. **The works take the pool of the plant they serve**, not the main pool. Chasing for a special-rate electrical run is special-rate.
2. **On a purchase, the buyer's own s.25 expenditure sits on top of the s.185 cap** — s.185(3) gives the past owner's disposal value **plus** the buyer's s.25 spend, so an election value is not an absolute ceiling on the buyer (Rulebook C §5; board item C-4).

Typical care-home lines: forming openings and shaft enclosures for through-floor and platform lifts; chasing and trunking for nurse-call and wander-guard; bases and plinths for the standby generator and commercial laundry plant; drainage runs and floor forming for sluice rooms and assisted-bathing rooms. **Not** the passenger-lift shaft itself — that stays excluded by List A item 5 even though the lift installation is an integral feature.

*Every s.25 line must name the parent element it serves. Works that merely **host** plant are not expenditure on the plant — that is the limit in *Urenco* at [97].*

### Structure (residual) — `SBA` (3%) — route `EXCL` for plant and machinery

*Excluded by List A item 1 with no route back into a P&M claim; relief, if any, is SBA only.*

Walls, floors, foundations, roof-as-structure, doors, windows, stairs — only where construction/renovation incurred on/after 29 Oct 2018. **Remember the CGT base-cost interaction** (SBA reduces the base cost on sale; P&M allowances do not).

**The residential-use bar does not simply apply — test the s.270CF exception first (E-10).** SBA is barred where a building is used, or expected to be used, as a dwelling (s.270CA) — but s.270CF carves out a building providing residential accommodation **together with personal care**. A genuine registered care home providing personal care (Q6: rooms in a care setting) is the paradigm case the exception is aimed at, so "care home → residential → no SBA" is the wrong default: the correct default is to test s.270CF on the facts (nursing/personal-care provision, the regulatory model) before concluding a bar applies. This is genuinely contested — HMRC's technical note treats care homes like hotels as capable of qualifying, while some commentary argues the exception does not reach nursing homes — so flag it for CTA sign-off rather than asserting either way, but **never silently assume it's barred**.

**Extra-care and sheltered accommodation don't get that benefit of the doubt (E-13).** Where residents occupy self-contained flats (Q6), s.270CF does not rescue the structure — these are dwelling-houses in their own right (CA11520), and **CA92800 additionally bars self-contained extra-care/sheltered apartments from SBA specifically**, independent of whatever personal care is available on site. Don't extend the s.270CF test from a genuine institutional care setting to a self-contained-flats scheme; the two get different SBA answers even though the P&M dwelling-house-restriction answer is the same for both.

---

## 5. Yield logic — *conditioned on history, not a flat band*

**Base bands (traditional care home):**

| Transaction | Indicative qualifying % |
|---|---|
| Purchase (second-hand) | 20–40% |
| New build | ~25–35% |
| Refurb / fit-out | 60–90% (includes a repairs element) |

**Conditioning rules the calculator must apply:**
- **Prior owner claimed + low-value election** → push toward the **bottom**, potentially near nil.
- **No prior entitlement (developer/charity seller) OR seller acquired pre-2008** → **top** of band, plus **~15% integral-features uplift** where the pre-2008 condition is met.
- **Extra-care / self-contained flats (Q6)** → reduce **materially** — common parts only — or suppress the instant estimate and route to specialist review.
- **Refurb** → split out **repairs** (100% immediate) from capital before applying the band.

**Output rule:** always label as an **estimate**. The defensible figure comes from the survey and a CAA 2001 s.562 apportionment. Convert to tax saving = qualifying expenditure × marginal rate (income tax up to 45%, higher in Scotland; corporation tax 19–25%), with speed depending on AIA-in-time vs WDAs.

---

## 6. Failure modes / HMRC challenge points (hard-code as warnings)

1. Claiming on **self-contained dwelling** areas in extra-care (dwelling-house exclusion).
2. **Failing to segregate** common-parts costs where the model is mixed (the *Hora Tevfik* failure — the items qualified but weren't separately identified, so the claim failed).
3. **Invalid s.198 election** — loose items included, or filed outside the 2-year window.
4. **Over-claiming repairs** vs improvement on refurbishments (the "entirety" test).
5. **Wrong pool allocation** in the election (e.g. main-pool items pushed to special rate).
6. **Constructive distribution** in a PropCo/OpCo with no formal lease.
7. **Connected-transfer** entitlement loss in the ownership chain.
8. **Ignoring the seller's balancing charge** (the pooling/fixed-value requirements don't affect the vendor's disposal value — s.187B(6) CAA 2001).
9. **Assuming SBA on the structure is barred without testing s.270CF** (E-10) — a genuine registered care home providing personal care may fall within the personal-care exception to the residential-use bar; silently skipping SBA here is a missed relief, not a safe default.
10. **Extending the s.270CF SBA exception to self-contained extra-care/sheltered flats** (E-13) — the opposite mistake to #9: CA92800 additionally bars these specifically, regardless of on-site personal care, so the s.270CF benefit of the doubt from #9 stops at the self-contained-flats gate (Q6).

---

## 7. Sell-side note (service + risk)

Care homes change hands frequently and via sale-and-leaseback, so there's a distinct **disposal-side** workstream: managing the disposal value and the s.198 election on exit, and protecting sellers from a balancing charge even in cases where the buyer can claim nothing. A buy-side-only service ignores this exposure — worth scoping as a product line and building the relevant questions into the disposal flow.

---

## 8. Open items to validate before go-live

- [ ] Calibrate the yield for **extra-care common-parts-only** claims (the base bands assume a traditional home).
- [ ] Confirm treatment of **children's residential homes** and specialist children's care settings.
- [ ] Chartered-surveyor + CTA **sign-off on the pool allocations** marked *(judgement)* in §4.
- [ ] Tax-specialist sign-off on the exact **wording and threshold** of the self-containment question (Q6) so it reliably distinguishes care home from extra-care.
- [ ] Confirm the **PropCo/OpCo distribution** warning wording with a tax specialist.

---

## Sources & references

Capital Allowances Act 2001 (notably s.11; s.21–22; s.33A integral features; s.35 dwelling-house restriction; s.187A / s.187B(6) and Finance Act 2012 Sch 10 fixtures rules; s.198/199 elections and s.201 content; s.562 apportionment), HMRC Capital Allowances Manual (incl. CA11520 on dwelling-house, CA23060), HMRC Briefs 66/08 and 45/10 on the meaning of dwelling-house, and the SBA rules (FA 2019; s.270CA residential-use test; **s.270CF personal-care exception — E-10**; **CA92800, the additional bar on self-contained extra-care/sheltered flats — E-13**). Case law: *SSE Generation Ltd v HMRC* **[2023] UKSC 17** (Supreme Court — do not cite the lower instances); *Urenco Chemplants Ltd v HMRC* **[2022] EWCA Civ 1587** (Court of Appeal — the Upper Tribunal decision was reversed); *Carr v Sayer* [1992] STC 396 (purpose-built care buildings are the premises, not plant — the boundary a care-home claim is tested against); *JD Wetherspoon plc v HMRC*; *Bowerswood House Retirement Home Ltd v HMRC*; *Hora Tevfik v HMRC*; *Uratemp Ventures Ltd v Collins*. **Citation control:** see Module 00, Sources — cite the instance that is still good law, and say which instance a paragraph number comes from. Sector benchmarks and PropCo/OpCo treatment drawn from published professional guidance (incl. Lovell Consulting, Bonham & Brook, Six Forward, BDO, Tax Adviser). All figures indicative and subject to survey validation.
