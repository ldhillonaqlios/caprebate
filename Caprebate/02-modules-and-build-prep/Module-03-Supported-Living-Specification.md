# Module 03 — Supported Living / Specialist Supported Housing: Stress-Tested Specification

**What this is:** the build-ready logic for the supported-living module, produced by stress-testing the sector against the Module 01 (care homes) and Module 02 (dental) baselines. Same structure; sector-specific content.

**How supported living differs (the headline):** this is the framework's hardest module because the **dwelling-house exclusion runs in the opposite direction to every other sector** — most of the asset is residents' homes (dwellings), so for the usual claimant (an investor-landlord) the claim collapses to common parts, and is sometimes **nil**. The module's primary job is therefore to **gate out invalid claims**, settle the **supported-living-vs-care-home** question, and find the **narrow legitimate claim** — not to produce a headline yield. The first module whose honest output is often "little or no claim."

**Status:** Current as of June 2026 (post-Autumn 2025 Budget rates). Indicative technical reference, **not tax advice**. Items in §11 need professional sign-off; given the mis-selling risk in this sector, client-facing output here should be conservative. Valuation signed off by a chartered surveyor; filing position by a tax specialist (CTA).

> **Legend:** `[GATE]` = wrong answer kills/reduces the claim. `[BRANCH]` = changes the path. `[MODIFIER]` = changes size/speed/type. `[FLAG]` = route to specialist. `[STOP]` = likely no/minimal claim — return a reasoned negative. `(CORE)` = shared engine. `(SL)` = supported-living-specific.
> Pool tags: `MP` = main pool (14% from Apr 2026), `SR` = special rate / integral features (6%), `SBA` = structures & buildings (3% straight-line — but residential/dwelling-restricted, §4).

---

## 1. Module scope

**In scope:** supported living and supported accommodation for vulnerable adults (learning disability, autism, mental health, physical disability), older people's extra-care/housing-with-care, specialist supported housing (SSH), and supported accommodation for care leavers/young people — **where occupants live in their own homes under tenancies, with care/support provided as a service.**

**The defining distinction (the master gate, §2B):** supported living = residents have **tenancies and occupy their own homes** (dwellings) → letting business → **dwelling-house restriction**. A residential **care home** = residents are residents of an **institution** receiving care, no separate tenancies → not a dwelling → **Module 01** (full claim). Same-looking buildings, opposite tax treatment.

**Claimant types (and why most can't claim much):**
- *Investor/owner-landlord* (REIT, fund, private investor) — a **property-letting business** → inside s.35 → **common parts only**. The likely taxpayer, and the party the restriction targets.
- *Registered Provider (RP) / housing association* — typically **leases** rather than owns, and is frequently a **charity/CIC → non-taxpayer → cannot claim**.
- *Care/support provider* — runs a care **trade**, not a letting business, so **s.35 does not restrict it at all**; usually doesn't own the property or incur the building capex, so any claim is on its own fit-out only — limited by **ownership of the expenditure (s.11)** and the **purposes-of-the-trade test**, not by location within the building.

**Route elsewhere:** genuine registered **care homes / nursing homes / institutional settings** → **Module 01**. Domiciliary care with no qualifying property → no property claim.

---

## 2. The question flow (in order)

### A. Claimant & structure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q1 | Legal structure? (sole trader / partnership / LLP / Ltd / charity / RP / CIC) | `MODIFIER` `(CORE)` | Which allowances apply. **Charity / CIC / housing association → likely non-taxpayer (Q2).** For-profit RPs/investors are taxpayers but still caught by s.35 (§2B). |
| Q2 | Is the claimant a UK taxpayer (income/corporation tax) and **not** a charity, CIC or other exempt body? | `GATE` `(CORE)` | **Very live here.** Charitable RPs and many operators are non-taxpayers → **no claim**. The owner-investor is usually the only taxpayer in the chain. |
| Q3 | Accounts on cash basis or accruals? | `GATE` `(CORE)` | Cash basis → no property fixtures claim. |
| Q4 | What is the claimant's **role and interest** — investor/owner (freehold/long lease let to an RP), RP (leases and sub-lets), or care provider (occupier delivering support)? | `GATE` `BRANCH` `(SL)` | **Owner/investor letting** → property business → s.35 (Q6). **RP leasing/sub-letting** → usually no owned capex + often non-taxpayer. **Care provider** → runs a trade, not a letting business, so **s.35 does not apply**; its claim (on its own fit-out only, wherever sited) is limited instead by **ownership of the expenditure (s.11)** and the **purposes-of-the-trade test**. Identifies who (if anyone) has a claim. |
| Q5 | Is this the typical **lease-based SSH model** (investor owns → long FRI/CPI lease to RP → RP lets to tenants → LA commissions a separate care provider)? | `MODIFIER` `(SL)` | Confirms the chain. The investor's claim (if any) is common-parts-only; the care is a separate transaction that doesn't create the investor a claim. |
| Q5v | **Is any part of the scheme currently vacant?** — no / an ordinary void between tenancies / vacant mid-conversion from a different previous use (e.g. a former care home) / not sure | `GATE` `(SL)` | **E-12.** An ordinary void changes nothing — a property doesn't stop being a dwelling just because no one's living in it (CA11520). A building vacant **mid-conversion from a different previous use** is a genuinely fact-sensitive question (does it still carry its old, non-dwelling character, or has it already become a dwelling?) that turns on how far the works have progressed → **specialist referral**, not a guess. |

### B. The master gate — supported living vs care home, then the dwelling-house analysis

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q6 | **Do occupants have their own tenancy and occupy the unit as their home (supported living), or are they residents of a registered care home / institution receiving care (no separate tenancy)?** | `GATE` `BRANCH` `(SL)` | **Tenancy / own home → supported living → dwelling-house restriction (Q6a).** **Institution / care home → not a dwelling → use Module 01 (full claim).** This single answer routes the entire claim. |
| Q6a | (Supported living) **How many separate homes are there, and does each one have its own kitchen and bathroom** — one home, several self-contained homes, or several bedrooms sharing a kitchen/lounge? | `GATE` `BRANCH` `STOP` `(SL)` | **Just one home** → the whole property is a dwelling → **likely no claim** (`STOP`, reasoned negative). **Several self-contained homes** → proceeds, with the treatment of any shared lounge/kitchen outside them flagged as unresolved. **Several bedrooms sharing a kitchen/lounge** (or "not sure") → proceeds on the settled position that the shared kitchen/lounge is part of residents' homes and excluded (CA11520; *Hora Tevfik*). Either way, the **dwellings are excluded**; only the **common parts** may qualify (Q6b–Q6d), segregated. |
| Q6b | Which of these does the building have **outside the residents' homes** — circulation (lobby/corridors/stairs/lift), staff areas, plant/boiler/tank/switch rooms, or the landlord's services (electrics, lighting, door entry, CCTV, fire alarm)? | `GATE` `STOP` `(SL)` | Nothing ticked → **likely no claim** (`STOP`, reasoned negative): everything sits inside residents' homes. Shared kitchens/lounges are deliberately not on this list — they are part of the homes (Q6a). |
| Q6c | **How are the residents' homes heated, and where is their hot water made** — shared central plant, individual plant per home, a mix, or not sure? | `GATE` `(SL)` | **The E-2 fix.** Central, mixed or unconfirmed → the plant is excluded **wherever it is sited**, because it serves the dwellings (CA23060) — usually the largest single item in the scheme. Individual → in-home plant is excluded anyway as inside a dwelling; only plant serving solely the common parts survives to Q6d. |
| Q6d | Can the **common-parts/staff/office areas** and the **plant serving them** be **separately identified and costed**? | `GATE` `(SL)` | The *Hora Tevfik* trap: common parts qualify, but **only if the expenditure on them is separately identified** — the taxpayer lost on the evidence despite being right on the law. No segregation → claim fails even where items qualify. |
| Q7 | Is the support/care provider **CQC-registered**; what is the **regulatory status** (RP registered with the Regulator of Social Housing; Ofsted for young people)? | `MODIFIER` (evidence) `(SL)` | Helps characterise the operation and the supported-living-vs-care-home position. |

### C. Transaction & expenditure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q8 | What triggered the spend — **purchase / conversion-adaptation / new build / common-parts fit-out or refurbishment**? | `BRANCH` `(CORE)` | Conversions/adaptations and new builds are common. Claim (if any) focuses on **common-parts/non-dwelling** elements. |
| Q9 | Approximate amount(s) and date(s)? | `MODIFIER` `(CORE)` | Sizing + amendment window. |
| Q10 | Cost information available, and can **dwelling vs common-parts** costs be separated? | `MODIFIER` `(SL)` | Segregation is the make-or-break (Q6d). |
| Q10a | (Refurb) Like-for-like **repairs** in common parts? | `BRANCH` `(CORE)` | Repairs in qualifying common parts → revenue (100%); dwellings are out of scope anyway (§7). |

### D. Entitlement history — *only where a property is actually purchased second-hand*

> Apply only if Q8 includes a second-hand **property purchase**. Many SSH schemes are new conversions/developments where this block is replaced by a direct analysis of the (common-parts) build spend.

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q11 | Has a previous owner claimed on the (common-parts) fixtures? | `GATE` `(CORE)` | Pooling/fixed-value + s.185 cap. |
| Q12 | Prior owner able to claim, or developer/stock / tax-exempt (incl. charity RP)? | `GATE` / opportunity `(CORE)` | Tax-exempt prior owner → no pooling requirement → fresh s.562 claim on qualifying (common) parts. |
| Q13 | Connected-party / group transfers? | `FLAG` `(CORE)` | Route to specialist. |
| Q14 | Existing s.198 election and value? | `GATE` `(CORE)` | Fixtures-only, within 2 years, s.201 content, irrevocable; low value caps the claim. |
| Q15 | Seller acquired pre-April 2008? | opportunity `(CORE)` | Possible integral-features uplift (on the qualifying common parts). |
| Q16 | CPSE replies on capital allowances? | evidence `(CORE)` | Buyer bears the burden of proof (*Tapsell*). |

### E. Funding & timing — *the grant gate is dominant here*

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q17 | Was any spend funded by a **capital grant or subsidy** (Homes England / SAHP, local-authority capital, etc.)? | `GATE` `MODIFIER` `(SL)` | **Very live.** Grant-funded expenditure is **excluded** from qualifying spend → further shrinks any common-parts claim. Establish the grant-funded proportion early. **F-11: state, every time this fires, that a later recovery/recycling event (SAHP grants carry these on early disposal or change of use) does NOT restore the relief — ESC/B49 was withdrawn in 2013, so repayment of the grant has no statutory effect on the allowances already stripped out.** |
| Q18 | Was VAT charged, and is it irrecoverable? | `MODIFIER` `(SL)` | Welfare/support services are largely **VAT-exempt**. New-build construction may be **zero-rated** (relevant residential / dwellings) — affecting how much VAT exists to include. Confirm the position. |
| Q19 | Tax year, and is the relevant return still amendable? | `MODIFIER` `(CORE)` | In time → AIA 100% on the qualifying (common-parts) spend; out of time → WDAs. |

### F. Prior claims

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q20 | Has the owner/accountant already claimed on the common-parts fixtures or on office/admin equipment? | `GATE` `(CORE)` | Avoid double-counting; claim only what hasn't been pooled. |

---

## 3. The critical gates (the ones that decide whether there is a claim at all)

1. **The master determination (Q6):** supported living (dwelling + letting → restricted) vs care home (institution + trade → Module 01). Routes everything.
2. **Dwelling-house / common-parts only (Q6a–Q6d):** dwellings excluded, including any shared kitchen/lounge and any central plant serving the homes wherever sited (E-2); only segregated common parts qualify; a single home is usually a `STOP`.
3. **Claimant status (Q2):** charity/CIC/housing-association operators are non-taxpayers and can't claim; the investor-landlord is the usual claimant — and is the party s.35 restricts.
4. **Grant funding (Q17):** excludes grant-funded spend — often a large slice.

---

## 4. Fixture taxonomy — *common-parts/non-dwelling only*

For a genuine supported-living scheme, **everything inside the dwellings is excluded** — including any shared kitchen/lounge that forms part of residents' homes, and any central plant that serves the homes, wherever it is sited (E-2). The taxonomy is therefore limited to the **common parts, staff and plant areas** of a building containing two or more homes, plus the operator's loose equipment. Pool allocation is subject to the function test.

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

> **Order note for this sector.** The s.35 dwelling-house restriction is a separate and later cut. An
> item must first survive ss.21–25 on the routes above; only then does the common-parts-versus-dwelling
> apportionment apply to what is left. Surviving s.35 is not qualification either.

> **s.35 runs per row, not once on the base — E-7.** The dwelling-versus-common-parts test is a
> function test on each individual element, not a location test on the room it happens to sit in. A
> plant room can pass the location test (it's a common part, Q6b) while still containing a mix of
> items with **opposite** s.35 answers: a shared boiler that heats the residents' homes is excluded in
> full wherever it stands (E-2; CA23060), while the corridor lighting circuit in the very same room is
> a genuine common-parts service and is apportionable. The taxonomy therefore carries a
> **`serves_dwellings`** field on every row — `COMMON_PARTS_ONLY`, `DWELLINGS_EXCLUDED`,
> `MIXED_TEST_REQUIRED` (assess on the facts; typically split by which specific system is involved,
> as with heating/hot-water below), or `FOLLOWS_PARENT_ROW` for s.25 works — and it must be read row
> by row, never assumed from the room's own common-parts classification.

**Qualifying common-parts/non-dwelling fixtures (where present and segregated):**
- **Integral features (`SR`, 6%) — route `IF`** *(qualify regardless of function; no common-law test)* serving the **common parts**: the electrical/lighting and cold-water systems *to the extent they serve common parts* (`serves_dwellings = COMMON_PARTS_ONLY`); **lifts** serving common parts. (A central system serving both the common parts and the dwellings is apportioned between the two; HMRC CA23060.)
- **Heating, hot-water and ventilation systems/plant (`SR`, 6%) — route `IF`, tested separately from the row above (`serves_dwellings = MIXED_TEST_REQUIRED`; E-2/E-7):** plant that serves the residents' homes is **excluded in full wherever it is sited** (CA23060) — it does not become claimable by standing in a shared plant room. Only heating/hot-water/ventilation plant that serves solely the common parts (e.g. a separate corridor or office circuit) is apportionable. Assess this independently of the electrical/cold-water row even where both share one plant room.
- **General plant (`MP`, 14%) — routes `LISTC→CL`, `CL`, `S25`** *(`common_law_required = true` throughout: fire alarm is List C item 10, security items 8 and 11, common-parts sanitaryware and the staff kitchen and fitted furniture item 5, signage item 15, data/comms item 8. Common-parts floor coverings and blinds have no List C item. "Alterations incidental to installing this plant" is `S25`.)* in common-parts/staff areas: fire alarm/detection; security (CCTV, access control, door entry); common-parts sanitaryware; staff kitchen and catering (not a shared resident kitchen/lounge, which is part of the dwellings — Q6a); fitted reception/office furniture; common-parts floor coverings, blinds, signage; data/comms; alterations incidental to installing this plant.
- **Care/support trade plant in non-dwelling areas (`MP`) — routes `LISTC→CL`, `CL`:** *(`common_law_required = true`. Hoists are List C item 6, accessible bathing and sensory rooms item 5, and assistive technology and staff call item 8. Each still has to be shown to be apparatus with which the support trade is carried on.)* assistive technology, hoists, accessible bathing or sensory rooms **located in common-parts/clinical areas** (not within a resident's dwelling); staff call/alarm systems.
- **Loose equipment (`MP` via AIA) — route `CL`:** *(chattels; ss.21–22 never engage — the common-law and durability tests are the whole enquiry)* office equipment, computers, freestanding furniture used in the business.


**Building alterations incidental to installing plant — route `S25`, pool follows the plant served**

s.25 is a **claimable category in its own right**, not a footnote to the main-pool list. Capital expenditure on alterations to an existing building incidental to installing plant is treated as expenditure **on that plant**, and the works form part of it. Two consequences the old prose lost:

1. **The works take the pool of the plant they serve**, not the main pool. Chasing for a special-rate electrical run is special-rate.
2. **On a purchase, the buyer's own s.25 expenditure sits on top of the s.185 cap** — s.185(3) gives the past owner's disposal value **plus** the buyer's s.25 spend, so an election value is not an absolute ceiling on the buyer (Rulebook C §5; board item C-4).

Typical common-parts lines: forming openings and enclosures for lifts and hoists serving the common parts; chasing for staff call, door entry and fire detection in common parts; plinths and bases for plant that serves the common parts.

**This sector's works follow their parent element through both cuts** — s.25 for the pool, and then the common-parts-versus-dwelling apportionment for the amount.

> **Two exclusions, and the second is the one that gets missed.** Works inside a resident's dwelling are excluded along with the plant they serve — that much is obvious. But **plant that *serves* the dwellings is excluded wherever it is sited**, so the works enabling it are excluded too: forming a plant-room slab, or chasing a riser, for a boiler or hot-water system that heats the homes is **not** claimable merely because the plant room is outside the dwellings. **A plant room is not blanket claimable space.** Authority: CA23060; board item E-2 (12851716945). The test is what the plant *serves*, not where it sits.
>
> Where central plant serves both the dwellings and the common parts, the works follow the plant into the same apportionment — they do not escape it by sitting in a common part.

*Every s.25 line must name the parent element it serves. Works that merely **host** plant are not expenditure on the plant — that is the limit in *Urenco* at [97].*

**Explicitly excluded (no allowances):** anything **within a resident's dwelling** — the dwelling's own heating/electrical/sanitaryware, fitted kitchens, flooring, white goods, fixtures and furniture.

**Structure — `SBA` (3%):** **largely unavailable** here — the residential-use test (s.270CA) bars a building used, or expected to be used, as a dwelling, so it does **not** rescue the dwelling parts. **Not the same position as Care Homes (E-10):** s.270CF's personal-care exception generally does not reach this sector — residents hold their own tenancies and support is delivered as a separate service, not personal care integrated into the accommodation itself, so the usual paradigm the exception targets isn't present here. Any genuinely non-residential common-parts block element should still be tested separately and conservatively.

---

## 5. How the claim figure is built

**The usual case (conversion / new build / common-parts fit-out).** Build the claim **directly from the costs of the qualifying common-parts/non-dwelling elements**, after **(a)** excluding everything within the dwellings — including any shared kitchen/lounge and any central plant serving the homes wherever sited (E-2) — and **(b)** deducting grant-funded amounts. Preliminaries and professional fees apportion to the qualifying P&M (*JD Wetherspoon*) — but only on the qualifying (common-parts) proportion.

**Where a second-hand property is bought**, the s.562 just-and-reasonable apportionment applies **to the qualifying common parts only**, using the Bowerswood VOA formula, capped by **s.185** and **s.62**, with the buyer's burden of proof (*Tapsell*; *Glais House*).

> **A s.198/199 election fixes value, not entitlement — E-9.** Even a fully valid election, covering the whole property at full value, only sets the figure that a *later, separate* entitlement analysis is capped by. It does not itself decide whether the buyer is entitled to claim, or on what. The s.35 dwelling-house restriction is applied **in the purchaser's own hands**, independently of what the election says or covers — a valid election on the whole property does not widen the buyer's claim beyond the common parts. The order is always: establish entitlement and the common-parts figure first (§§2B, 5 above), *then* apply the election as a cap on top, never the reverse.

**Convert to tax saving:** qualifying (common-parts) expenditure × marginal rate (income tax up to 45%; corporation tax 19–25%) — noting the base is small.

**Output rule (critical for this module):** the engine must support a **reasoned negative** — "based on your answers, there is little or no capital allowances claim, because [the property is a dwelling / you are a non-taxpayer / the spend was grant-funded]." Delivered well, that protects the client and the firm's credibility.

---

## 6. Yield logic — *low bands, often nil; route to specialist*

**Indicative bands (qualifying % of the relevant spend):**

| Scenario | Indicative outcome |
|---|---|
| Single converted house / self-contained dwelling, investor-landlord | Usually **nil** (`STOP`) |
| Multi-dwelling scheme, common parts only, investor-landlord | **Low** — common-parts/non-dwelling elements only (a small fraction of total cost), reduced further by grant funding |
| Charity / housing-association operator | **Nil** (non-taxpayer) |
| Genuine registered care home (misfiled here) | Use **Module 01** (20–40% etc.) |

**Conditioning rules:** apply the master gate first; suppress any instant estimate for self-contained/single-dwelling cases; deduct grant funding; exclude any central plant serving the homes wherever sited (E-2); segregate common-parts costs; never present a headline percentage of total scheme cost.

> **Two independently unverified assessments compound here — E-11, feeds R-B8.** The common-parts share (§4, §5) and the fixture-density-within-common-parts band above are genuinely different questions — a spatial/spend apportionment and a fixture-density ratio — but neither has independent calibration, and both currently sit at the same 0.25 ceiling. Their product (an effective ceiling around 6% of total scheme cost) is *less* evidenced than either number alone, not more, and it must never be presented without disclosing both factors that produced it. This is not resolved by picking better-looking numbers — per R-B8, no sector band in the system has independent calibration yet, and this module needs **two** independent sources (one per factor), not one, before either ceiling is relied on client-facing.

**Output rule:** always an estimate, conservative, and capable of returning a reasoned negative. Route anything ambiguous to specialist review rather than estimating.

---

## 7. Repairs vs capital — limited scope here

Dwellings are out of scope, so the repairs/capital analysis applies only to **qualifying common parts**. The entirety test (PIM2020 / BIM35480 / CA22340), the Law Shipping trap, and the 50% integral-features rule operate as in Modules 01–02, but on a much smaller base. Note: for a residential property business, **Replacement of Domestic Items Relief** (not capital allowances) is the route for items within dwellings — outside this module's scope but worth signposting to clients.

---

## 8. Adjacent reliefs

**Land Remediation Relief (LRR):** companies-only **150% deduction** for remediating contaminated/derelict property acquired in that state — potentially relevant where an investor **company** converts a derelict or contaminated building into supported housing (asbestos, knotweed, contamination). Not restricted by the dwelling-house rule in the same way (it's a separate relief), so it can be one of the few meaningful reliefs on an SSH conversion — **subject to the polluter-pays rule and corporate status**. CTA 2009 Part 14. **Flag this actively on conversion/brownfield SSH schemes.**

**SBA:** §4 — largely unavailable (dwelling-restricted, s.270CA); the s.270CF personal-care exception that can rescue this for Care Homes does not generally apply here (E-10). If SBA is ever found to be live on a genuinely non-residential common-parts block, note for F-8: a s.536-exempt landlord/private contribution to the P&M claim does not exempt that SBA element — s.536(6) disapplies the exception for SBA, so test it separately.

**Replacement of Domestic Items Relief:** the in-dwelling route (not a capital allowance) — signpost only.

> On SSH specifically, **LRR is often the more valuable relief than capital allowances** — a useful repositioning of the engagement away from a P&M claim that may not exist.

---

## 9. Failure modes / HMRC challenge points (hard-code as warnings)

1. **Treating a dwelling scheme as fully qualifying** — the central mis-selling error; the dwellings are excluded under s.35.
2. **Claiming on assets inside residents' dwellings** — not qualifying.
3. **A charity / housing-association / CIC operator claiming** — non-taxpayer, no claim.
4. **Ignoring grant funding** — grant-funded spend is excluded.
5. **Failing to segregate** common-parts costs (*Hora Tevfik*).
6. **Misclassifying** a registered care home as supported living (under-claiming) or supported living as a care home (over-claiming) — get Q6 right.
7. **Treating SBA as available** on the dwellings — it isn't (residential-restricted).
8. On a property purchase: ignoring the **s.185/s.62 caps** and the buyer's burden of proof.
9. **Overstating returns to investors** — reputational and potentially regulatory risk; keep client-facing estimates conservative and evidenced.
10. **Treating a valid s.198/199 election as conferring entitlement** — it fixes value, not entitlement; s.35 is applied in the purchaser's own hands regardless, and a whole-property election never widens the buyer's claim beyond the common parts (E-9).
11. **Assuming vacancy changes a property's character** — an ordinary void doesn't (CA11520), but a building vacant mid-conversion from a different previous use is fact-sensitive and needs a specialist test, not a guess in either direction (E-12).

---

## 10. Investor-protection & sell-side note (the credibility play)

This sector is marketed to private investors with promises of "tax benefits" that frequently don't survive the dwelling-house analysis. A firm that **tells investors the truth** — often that the P&M claim is small or nil, but that **LRR** (for companies) or a different structure may help — builds exactly the trust the brand depends on. On disposal, the lease-based model is effectively a sale-and-leaseback: manage any disposal value/election on the qualifying (common-parts) plant. Position the service as **due-diligence and expectation-management**, not headline-yield generation.

---

## 11. Open items to validate before go-live

- [ ] Tax-specialist sign-off on the **master determination wording** (Q6) — supported living vs care home — and the **dwelling-configuration / common-parts** logic (Q6a–Q6d), including the central-plant exclusion (E-2). This is the highest-stakes wording in the whole framework.
- [ ] Confirm the **claimant-status gate** reliably catches charitable RPs/CICs (Q2).
- [ ] Confirm the **grant-funding** treatment and how the tool captures the grant-funded proportion (Q17).
- [ ] Confirm the **VAT** position (welfare exemption + new-build zero-rating) for the irrecoverable-VAT inclusion (Q18).
- [ ] Confirm **SBA residential restriction** scope for any non-residential common-parts element.
- [ ] Legal/marketing review of **client-facing language** given the mis-selling risk in this sector.
- [ ] **Independently calibrate BOTH the common-parts share and the fixture-density band** (§6) — two separate sources needed, not one; per R-B8, neither currently has any independent evidence and their product is presented as a single ceiling without disclosing that it is two guesses multiplied together (E-11).

---

## Sources & references

**Legislation (CAA 2001 unless noted):** s.11; s.33A integral features; s.35 dwelling-house restriction (property businesses & special leasing — the dominant gate here); s.62 / s.185 caps; s.187A and FA 2012 Sch 10 fixtures rules; s.198/199 elections and s.201 content; s.562 apportionment; SBA (FA 2019; s.270CA residential-use test; s.270CF personal-care exception, generally not reached in this sector — E-10); Land Remediation Relief (CTA 2009 Part 14). **HMRC manuals/guidance:** CA11520 (meaning of dwelling-house), CA23060 (plant in/serving dwelling-houses and common parts; CA20020 is archived, folded into CA23060 in the FHL-repeal tidy-up — do not cite it as live, E-14); CA22340 (integral-features repairs / 50% test); GOV.UK "Claim capital allowances" (common-parts example; care-business rules). **Case law:** *SSE Generation Ltd v HMRC* **[2023] UKSC 17** (Supreme Court — do not cite the lower instances); *Urenco Chemplants Ltd v HMRC* **[2022] EWCA Civ 1587** (Court of Appeal — the Upper Tribunal decision was reversed); *Cheshire Cavity Storage 1 Ltd v HMRC* [2022] EWCA Civ 305; *Hora Tevfik v HMRC* [2019] TC07383 (common-parts claim failed for lack of cost segregation — the taxpayer lost on the evidence despite being right on the law); *Bowerswood House Retirement Home Ltd v HMRC* [2015] UKFTT 94; *Glais House Care Ltd v HMRC* [2019] UKFTT 59; *Tapsell & Lester v HMRC* [2011] UKFTT 376. **Sector structure:** Regulator of Social Housing, "Lease-based providers of specialised supported housing" (2019); LGA SSH commissioner guidance; Homes England Capital Funding Guide (specialist homes). All figures indicative and subject to validation; client-facing output to be conservative. **Citation control:** see Module 00, Sources — cite the instance that is still good law, and say which instance a paragraph number comes from.
