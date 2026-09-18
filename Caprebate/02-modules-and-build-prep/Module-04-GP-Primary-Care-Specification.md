# Module 04 — GP Surgeries / Primary Care: Stress-Tested Specification

**What this is:** the build-ready logic for the GP / primary-care module, produced by stress-testing the sector against the Modules 01–03 baselines. Same structure; sector-specific content.

**How GP/primary care differs (the headline):** structurally it is **dental's fit-out-and-leasehold logic** (a commercial profession, often leasehold or pension-owned, VAT-exempt) **plus one genuinely new and dominant gate — the NHS premises-funding interaction.** NHS improvement grants and capital allowances are **mutually exclusive on the same cost element**, and taking a grant **abates the practice's notional rent**. So for GPs the claim is not only a retrospective recovery but can be a deliberate **alternative to NHS grant funding** — which makes this module as much an advisory tool as a recovery tool.

**Status:** Current as of June 2026 (post-Autumn 2025 Budget rates; reflects the NHS (GMS – Premises Costs) Directions 2024). Indicative technical reference, **not tax advice**. Items in §11 need professional sign-off. Valuation signed off by a chartered surveyor; filing position by a tax specialist (CTA).

> **Legend:** `[GATE]` = wrong answer kills/reduces the claim. `[BRANCH]` = changes the path. `[MODIFIER]` = changes size/speed/type. `[FLAG]` = route to specialist. `(CORE)` = shared engine. `(GP)` = primary-care-specific.
> Pool tags: `MP` = main pool (14% from Apr 2026), `SR` = special rate / integral features (6%), `SBA` = structures & buildings (3% straight-line).

---

## 1. Module scope

**In scope:** GP practices (GMS/PMS/APMS), primary-care medical centres and health centres, primary care network (PCN) and federation premises, and dispensing practices.

**The primary-care gradient (drives the fixture density):**
- *Modern purpose-built medical centre* → fixture-dense (multiple consulting/treatment rooms, clinical plumbing, minor-ops, sometimes a dispensary) → higher yield.
- *Converted house / high-street surgery* → lower fixture density; watch the **mixed-residential** gate (§2B).
- *Tenant in a developer / LIFT / PFI / REIT-owned building* → claim sits with the **practice's own fit-out** (§2A).

**Claimant types:** the practice carrying on a profession — a **GP partnership** (most common), an incorporated practice (**Ltd**), a **federation/PCN** entity; and/or the **GP partners** who personally own the premises. Salaried GPs and locums are not the claimant.

**Route elsewhere:** premises owned by an **NHS body / NHS Property Services** (non-taxpayer — no claim, but a GP tenant may claim its fit-out); a building that is genuinely a **care/residential** setting → Modules 01/03.

---

## 2. The question flow (in order)

### A. Claimant, ownership & occupation

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q1 | Legal structure? (GP partnership / LLP / Ltd / federation / PCN) | `MODIFIER` `(CORE)` | Which allowances apply. A GP partnership/profession is a qualifying activity. Full Expensing & 50% FYA = companies only; AIA / 40% FYA / WDAs = all. |
| Q1a | **Multiple sites / federation / at-scale provider?** | `MODIFIER` `(CORE)` | The **£1m AIA is shared** across a group/commonly-controlled businesses. Affects speed, not entitlement. |
| Q2 | Is the claimant a UK taxpayer (income/corporation tax) and not an exempt body? | `GATE` `(CORE)` | GP partners/practices are taxpayers. **NHS bodies / NHS Property Services landlords are not** — they can't claim (but a tenant practice may). |
| Q3 | Accounts on cash basis or accruals? | `GATE` `(CORE)` | Cash basis → no property fixtures claim (cars only). |
| Q4 | Who **owns** the premises — the **GP partners** (freehold), a **third-party developer / LIFT / PFI / REIT**, an **NHS body**, or a **pension scheme (SIPP/SSAS)**; or is it **leased**? | `GATE` `BRANCH` `(GP)` | **Partner-owned** → partners claim (+ purchase apportionment if recently bought). **Developer/REIT/NHS-owned** → landlord usually **can't beneficially claim** (REIT property income is tax-exempt; NHS bodies aren't taxpayers) → the **practice claims its own fit-out** (Q5). **Pension-owned** → pension can't claim → practice claims fit-out (Q5). |
| Q5 | (If leased / third-party-owned) Who **incurred** the fit-out, and what do the **lease / agreement** say about it and any **landlord/NHS contribution**? | `GATE` `(GP)` | Tenant can claim fit-out it pays for (even short lease). **Trap:** lease drafting can leave neither party able to claim; a **landlord contribution reduces the tenant's qualifying spend** (s.532). **NB an NHS grant-funded element is excluded entirely — see §E.** |
| Q5v | Roughly what share of the fit-out did the landlord/NHS contribute? | `MODIFIER` `(GP)` | **F-7** — captured as a number and actually deducted in Stage 1 (s.532), not left as a note for survey; separate from the NHS grant strip at Q17. |

### B. Property & use — *the shrunken dwelling-house gate*

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q6 | Is the surgery **wholly commercial**, or a **converted house / building with residential (e.g. flat above, or GP working from home)**? | `BRANCH` `(GP)` | Wholly commercial → no dwelling-house issue (a profession; s.35 doesn't apply). **Mixed residential** → apportion out the residential part. |
| Q7 | Is the practice **CQC-registered**? | `MODIFIER` (evidence) `(GP)` | Confirms the commercial primary-care activity. |

### C. Transaction & expenditure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q8 | What triggered the spend — **purchase / new build / extension / refurbishment / fit-out**? (can be more than one) | `BRANCH` `(CORE)` | Extensions and refurbs (capacity, CQC, infection control) are very common → invoice-based claim + repairs split. Purchase → apportionment + entitlement history (§D). |
| Q8a | (Practice transition) Is this a **change of premises ownership among partners** rather than a sale of the business? | `BRANCH` `(GP)` | **NHS general-practice goodwill cannot be sold**, so there is no goodwill/share-sale branch — transitions concern **partnership premises ownership**. Establish who owns the property and whether a claim has been made before. |
| Q9 | Approximate amount(s) and date(s)? | `MODIFIER` `(CORE)` | Sizing + amendment window (retrospective claims common — §E). |
| Q10 | Cost information available (invoices, contractor breakdown, sale contract)? | `MODIFIER` `(CORE)` | Shapes method (invoice analysis vs valuation apportionment). |
| Q10a | (Refurb branch) Like-for-like **repairs/renewals** vs improvements? | `BRANCH` `(CORE)` | Split out **repairs** (100% immediate), on top of allowances. Entirety test (§7). |
| Q10b | **Run-down premises acquired and refurbished before use?** | `FLAG` `(CORE)` | **Law Shipping trap**: such repairs are usually capital (§7). |

### D. Entitlement history — *only where a property/freehold is bought*

> Apply only if Q8 includes a property purchase (or a partner buys in to an owned surgery). For extensions/refurbs/fit-outs in owned or leased premises, skip to §E.

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q11 | Has a previous owner claimed on the fixtures? | `GATE` `(CORE)` | Pooling/fixed-value + s.185 cap. |
| Q12 | Prior owner able to claim, or developer/stock / tax-exempt (NHS body, REIT, pension)? | `GATE` / opportunity `(CORE)` | Tax-exempt prior owner → no pooling requirement → fresh s.562 claim. |
| Q13 | Connected-party / partnership transfers? | `FLAG` `(CORE)` | Route to specialist. |
| Q14 | Existing s.198 election and value? | `GATE` `(CORE)` | Fixtures-only, within 2 years, s.201 content, irrevocable; low value caps the claim. |
| Q15 | Seller acquired pre-April 2008? | opportunity `(CORE)` | Possible integral-features uplift (~15%). |
| Q16 | CPSE replies on capital allowances? | evidence `(CORE)` | Buyer bears the burden of proof (*Tapsell*). |

### E. Funding & timing — *the dominant GP block*

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q17 | Did/will the practice receive an **NHS premises improvement grant** (or other **public capital** — S106/CIL/Modernisation funds) towards the works? | `GATE` `(GP)` | **The defining GP gate.** Under the NHS (GMS – Premises Costs) Directions 2024, a grant **cannot fund any cost element on which a tax allowance is claimed** — the two are **mutually exclusive per cost element**. Strip grant-funded elements from the claim. **For future projects, this is a strategic choice (Q17a).** |
| Q17q | Does the grant offer letter name **specific works or elements** (e.g. heating, electrical, other M&E), or is it a **percentage/lump sum against the whole scheme cost**? | `GATE` `(GP)` | **F-1** — *Cyril Lord Carpets Ltd v Schofield* 42 TC 637: a grant traceable to specific items must be netted off **in full against those items**, not spread pro-rata across the whole base. NHS grants typically target M&E/integral features, so a flat percentage of total spend **understates** the true reduction — the estimate is shown as a conservative floor pending the per-element breakdown, not a final figure. Only where the grant is genuinely quantified against the whole scheme is a straight pro-rata reduction correct and final. |
| Q17a | (Planning a project) Is the practice deciding **between taking an NHS grant and self-funding + claiming allowances**? | `BRANCH` `FLAG` `(GP)` | Grant = no upfront cost **but** the **notional rent is abated** proportionally + guaranteed-use period + possible legal charge. Self-fund + claim = upfront/borrowing cost **but** full notional rent retained, flexibility on use/sale, and the tax relief. **F-12: the advisory must state the compound downside of a guaranteed-use breach — no allowances were claimed on the grant-funded spend, the grant must be repaid, AND repayment does not retroactively unlock the allowances (F-11). This is worse than either staying compliant or self-funding from the start, not a return to the self-fund position.** **Advisory opportunity** — model both; route to specialist. |

> **F-11 — a repaid grant does not restore the relief.** Every time Q17 confirms a grant was received, state plainly that if the guaranteed-use period is later breached and the grant is clawed back (broadly 6–18 years by grant size), that repayment does **not** unlock the allowances originally stripped out. ESC/B49, the concession that once softened this, was withdrawn in 2013 — there is no statutory route back. This is a standing caveat on the grant reduction itself, not conditional on the client raising it.

> **F-16 — claiming on a grant-funded element risks the grant itself, independently of tax.** Under the NHS (GMS – Premises Costs) Directions 2024, Direction 5(1)(b) requires the practice to declare its capital-allowances intention when applying for the grant, and Direction 56 lets the NHS recover the grant if that declaration is breached. This is a separate, non-tax consequence from the s.532 stripping the estimate already applies — flagged every time Q17 confirms a grant was received (`onSet`, alongside F-11), and repeated in the Q17a advisory review (`showAdvisory()`) so it surfaces on both the confirmed-grant path and the planning-stage grant-vs-self-fund choice. Client should be told to check what was actually declared before filing anything.
| Q18 | Is the practice's **notional rent / borrowing-cost reimbursement** being treated correctly? | `MODIFIER` `(GP)` | **Rent reimbursement is income, not a capital grant** — it does **not** reduce qualifying capital expenditure (unlike a grant at Q17). Owner-occupiers receive borrowing costs **or** notional rent, not both. Don't confuse the two. |
| Q19 | Was VAT charged, and is it **irrecoverable**? | `MODIFIER` `(GP)` | Medical services are **VAT-exempt**, so input VAT is generally irrecoverable → **includable** in qualifying expenditure. **Dispensing practices** have a partial-exemption wrinkle (drug supply). Watch VAT on **sale-and-leaseback**. |
| Q20 | Tax year, and is the relevant return still **amendable**? | `MODIFIER` `(CORE)` | **Retrospective claims are common and valuable** for GPs (surgery purchases, added consulting rooms) — if assets still owned and not previously claimed. In time → AIA 100% / refund; out of time → WDAs. |

### F. Prior claims

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q21 | Has the accountant already claimed on the fit-out / loose equipment? | `GATE` `(CORE)` | Avoid double-counting; specialist focuses on embedded fixtures not already pooled. |

---

## 3. The critical gates (the ones that most often shrink a GP claim)

1. **NHS grant funding (Q17):** grant-funded cost elements are **excluded** and mutually exclusive with allowances; missing this over-states the claim. Plus the **strategic grant-vs-self-fund choice** (Q17a) on future projects.
2. **Ownership / who can claim (Q4/Q5):** developer/REIT/NHS landlords usually can't beneficially claim → the **practice's own fit-out** is the claim; pension-owned premises behave the same way.
3. **Prior claims / double-counting (Q21).**
4. **Mixed residential (Q6):** no allowances on the residential portion of a converted-house surgery.

---

## 4. GP / primary-care fixture taxonomy

The split is **embedded fixtures (specialist)** vs **loose equipment (accountant's AIA)**, as in dental. Pool allocation is subject to the **function test**; *(judgement)* marks defended positions. Modern medical centres are fixture-dense; older converted surgeries much less so.

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


**Integral features — special rate (`SR`, 6%) — route `IF`** *(qualify regardless of function; no common-law test)***:** general electrical & lighting; cold water; heating/hot water, ventilation/air-cooling/air-purification; any passenger lift; thermal insulation added to the building; long-life assets.

**General plant & fixtures — main pool (`MP`, 14%) — routes `LISTC→CL`, `CL`, `S25`** *(`common_law_required = true` throughout: sanitaryware and fitted joinery are List C item 5, fire alarm item 10, security items 8 and 11, signage item 15, data/comms item 8. Carpets, floor coverings, blinds and door ironmongery have no List C item and are argued against List A item 1 on the common-law test alone. "Alterations incidental to installing plant" is `S25`.)***:** sanitaryware & washroom fittings; fitted reception desk, cabinetry, worktops; fire alarm/detection; security (CCTV, intruder, access control, door entry); signage; carpets/floor coverings; blinds; **data/comms and IT infrastructure** (significant in modern practices); door ironmongery; alterations incidental to installing plant.

**Primary-care-specific embedded plant (`MP` unless noted) — routes `LISTC→CL`, `CL`:** *(`common_law_required = true` throughout. Clinical plumbing, medical gas, the minor-ops sluice and decontamination drainage reach the list through item 2 — conditional on the system being provided **mainly** for the trade or to serve particular plant; fitted furniture and the dispensary through item 5; check-in, calling and telephone systems through item 8; cold-chain cooling through item 9; hoists and patient lifts through item 6; and acoustic insulation through item 7, which is itself conditional on being provided **mainly** for the trade and is subject to the s.23(4) carve-out. Fixed examination lighting and enhanced or negative-pressure ventilation have **no List C item** and rest on the common-law test alone.)*
- Consulting/treatment-room clinical hand-wash basins + dedicated clinical plumbing — `MP`
- Examination/treatment lighting (fixed) — `MP`
- Fitted consulting/treatment-room furniture and worktops — `MP`
- **Trade-related acoustic insulation/soundproofing** for consultation confidentiality — `MP` *(judgement — function test; **List C item 7, and subject to the s.23(4) carve-out**. Item 7 requires the insulation to be provided **mainly** to meet the particular requirements of the practice; s.23(4) then removes it anyway if its principal purpose is to insulate the interior. Both conditions have to be satisfied, and the evidence is clinical — confidentiality as a requirement of consultation, not comfort. Where it fails, there is no other route: it is not an integral feature and it has no second List C item.)*
- Patient check-in / calling / queue-management systems — `MP`
- Telephone / call systems — `MP`
- Minor-ops/treatment room: specialist lighting, scrub facilities, sterilisation/decontamination (fixed autoclaves), sluice — `MP`
- Treatment-room / negative-pressure or enhanced ventilation (infection control) — `MP` *(specialist; judgement vs `SR` HVAC)*
- Occasional **medical gas (oxygen)** / piped supplies — `MP`
- **Dispensary fit-out** (dispensing practices): fitted dispensing units, controlled-drugs storage, dedicated security — `MP`
- Cold-chain: dedicated power/cooling for vaccine storage — `MP` *(the vaccine fridges themselves are loose — below)*
- Disabled-access hoists, patient lifts — `MP`

**Loose equipment — chattels (accountant's AIA territory, `MP` via AIA) — route `CL`:** *(chattels; ss.21–22 never engage — the common-law and durability tests are the whole enquiry)* clinical equipment, vaccine/drug fridges (free-standing), examination couches, computers and IT hardware, freestanding furniture, portable diagnostic kit. *Specialist must not re-claim these.*


**Building alterations incidental to installing plant — route `S25`, pool follows the plant served**

s.25 is a **claimable category in its own right**, not a footnote to the main-pool list. Capital expenditure on alterations to an existing building incidental to installing plant is treated as expenditure **on that plant**, and the works form part of it. Two consequences the old prose lost:

1. **The works take the pool of the plant they serve**, not the main pool. Chasing for a special-rate electrical run is special-rate.
2. **On a purchase, the buyer's own s.25 expenditure sits on top of the s.185 cap** — s.185(3) gives the past owner's disposal value **plus** the buyer's s.25 spend, so an election value is not an absolute ceiling on the buyer (Rulebook C §5; board item C-4).

Typical primary-care lines: chasing and trunking for clinical plumbing, medical gas and call systems; forming openings and ductwork routes for treatment-room and negative-pressure ventilation; substrates and service runs for dispensary units and controlled-drugs storage; floor forming and drainage for the minor-ops sluice. **Watch the grant interaction:** where the parent element is grant-funded the enabling works are cut by the same contribution under s.532 — do not claim the works while disclaiming the plant.

*Every s.25 line must name the parent element it serves. Works that merely **host** plant are not expenditure on the plant — that is the limit in *Urenco* at [97].*

**Structure (residual) — `SBA` (3% straight-line) — route `EXCL` for plant and machinery:** the shell on a new build, extensions, structural alterations — non-residential, post-29-Oct-2018. Relevant for GP extensions/new builds (but see the grant interaction, §E). CGT base-cost interaction applies.

---

## 5. How the claim figure is built

**The usual GP case (refurb / extension / fit-out).** Built from **invoices**, allocated across pools, **after stripping out any NHS-grant-funded or public-capital-funded cost elements** (Q17) and any landlord contribution (s.532). Preliminaries and professional fees apportion to qualifying P&M (*JD Wetherspoon*) — **F-14: only the share the practice actually bore.** The NHS (GMS – Premises Costs) Directions 2024 separately reimburse professional fees up to 12% of the works and project management up to 1% (Directions 15 and 39(2)) — apply the apportionment to fees **net of that reimbursement**, never gross of it, or the qualifying base is overstated by a cost the practice never incurred. *(Verified: no numeric fee/prelims uplift is currently coded anywhere in the live Stage-1 engine — this is a documentation caveat for whoever builds the fuller Tier-2 survey apportionment, not a fix to existing engine output.)*

**Where a surgery is bought**, the s.562 just-and-reasonable apportionment applies (Bowerswood formula), capped by **s.185 / s.62**, with the buyer's burden of proof (*Tapsell*; *Glais House*).

**Speed of relief.** A practice fit-out/extension usually sits within the **£1m AIA** → 100% if the return is in time; otherwise WDAs (14% / 6%). SBA at 3% on the qualifying structure. Full Expensing / 40% FYA apply only to **new** equipment bought by a company.

**Convert to tax saving:** qualifying expenditure × marginal rate (GP partners: income tax up to 45%, higher in Scotland; incorporated: corporation tax 19–25%).

---

## 6. Yield logic — *conditioned on grant funding*

**Indicative bands** (label outputs as estimates; base differs by trigger):

| Trigger | Base | Indicative qualifying % |
|---|---|---|
| New-build / purpose-built medical centre | Build cost | ~35% (plus SBA on the shell) |
| Refurbishment / extension / fit-out | Spend | 40–70%+ (includes a repairs element) |
| Purchase of an existing surgery | Property price | 15–30% embedded fixtures |
| Converted-house / older surgery | Lower across the board; mixed-residential apportionment |

**Conditioning rules:**
- **NHS grant / public capital (Q17)** → **deduct the grant-funded cost elements** before applying the band (the single biggest GP adjustment).
- **Pension/charity/NHS prior owner OR pre-2008** (purchases) → top of band, possible ~15% integral-features uplift.
- **Refurb** → split out **repairs** (100% immediate, §7).
- **Loose equipment already claimed (Q21)** → exclude it.

**Output rule:** always an **estimate**, net of grant-funded elements; defensible figure from invoice analysis / survey (and, on a purchase, the s.562 apportionment subject to the §5 caps).

---

## 7. Repairs vs capital — common on GP refurbs/extensions

Practices refurbish and extend frequently (capacity, CQC, infection control). The **entirety test** (PIM2020 / BIM35480 / CA22340) governs the split: replacing **subsidiary parts** = repair; reconstructing **substantially the whole entirety** or **improving** the character = capital. Adding consulting rooms / reconfiguring leans **capital**; like-for-like renewal leans **repair**. The **Law Shipping trap** (Q10b) and the **50% integral-features rule** (s.33B) apply as in Modules 01–02.

**Software implication:** the refurb path offers the repairs/capital split, flags the entirety judgement and Law Shipping, and applies the 50% test — *and* nets off grant-funded elements first.

---

## 8. Adjacent reliefs

**SBA:** §4 — genuinely relevant for GP new builds and extensions (3% on the non-residential structure), subject to the grant interaction. **F-8: if a landlord/private contribution was tested as s.536-exempt for the P&M claim (Q5v), that does NOT carry over to SBA — s.536(6) disapplies the exception for SBA specifically, so the SBA-eligible structure spend is still reduced by s.532 regardless. Never inherit the P&M contribution answer for the SBA base.**

**Land Remediation Relief (LRR):** companies-only 150% deduction for contaminated/derelict remediation (e.g. asbestos in an older converted surgery) — rare but flag for incorporated practices; polluter-pays applies. CTA 2009 Part 14.

**The grant-vs-allowances decision (the GP advisory edge):** §E Q17a — for a planned project, capital allowances can be a viable **alternative to an NHS grant**, preserving full notional rent and flexibility. Modelling both is a distinctive primary-care advisory service, not just a recovery claim.

---

## 9. Failure modes / HMRC challenge points (hard-code as warnings)

1. **Claiming on grant-funded cost elements** — prohibited under the Premises Costs Directions; the central GP error (Q17).
2. **Confusing notional-rent/borrowing-cost reimbursement (income) with a capital grant** — only capital grants reduce qualifying spend (Q18).
3. **A developer/REIT/NHS landlord claiming** — usually can't claim beneficially; the practice tenant claims its fit-out.
4. **Pension (SIPP/SSAS) owner claiming** — tax-exempt; the practice claims its fit-out.
5. **Double-counting** loose equipment the accountant already claimed (Q21).
6. **Claiming on the residential portion** of a converted-house surgery (Q6).
7. **Over-claiming repairs** vs improvement on an extension/refurb — entirety test / Law Shipping / 50% rule (§7).
8. **Lease drafting / landlord contribution** leaving the tenant unable to claim or reducing its qualifying spend (s.532).
9. On a purchase: **ignoring the s.185/s.62 caps** and the buyer's burden of proof.

---

## 10. Advisory & sell-side note

The distinctive primary-care play is **advisory**: helping a practice decide between an NHS improvement grant and self-funding + capital allowances (Q17a), modelling the notional-rent abatement against the tax relief and flexibility. On exit/transition, GP goodwill can't be sold, so the focus is **partnership premises ownership** and any **sale-and-leaseback** (manage the disposal value/election and the VAT position). A pre-project review adds most value *before* the funding decision is made.

---

## 11. Open items to validate before go-live

- [ ] Tax-specialist sign-off on the **NHS grant-vs-allowances** treatment and the **mutual-exclusivity per cost element** wording (Q17), and the capital-grant-vs-rent-reimbursement distinction (Q18).
- [ ] **Documents review, not a legal question (F-1-Q2, carried from the Cyril Lord Carpets case-read):** do NHS GMS Premises Directions grants and Social and Affordable Housing Programme grants quantify by reference to specified works/elements (Q17q → F-1.1 bites) or a global scheme cost (F-1.5 apportionment applies)? Pull a sample of real offer letters — this is the highest-value open question feeding Q17q.
- [ ] Confirm the **developer/REIT/NHS landlord** entitlement position (when the landlord genuinely can/can't claim) and the **pension** treatment (Q4).
- [ ] Confirm the **GP goodwill / partnership premises** transition logic (Q8a).
- [ ] Chartered-surveyor + CTA **sign-off on the GP pool allocations** marked *(judgement)* in §4 (acoustic insulation; clinical/negative-pressure ventilation; cold-chain power).
- [ ] Confirm **VAT partial-exemption** treatment for **dispensing** practices (Q19).
- [ ] Calibrate the **new-build / refurb / purchase yield bands** against real primary-care projects.

---

## Sources & references

**Legislation (CAA 2001 unless noted):** s.11 (ownership/interest, incl. tenant fixtures); s.21–22; s.33A integral features; s.33B / 50% rule; s.35 dwelling-house restriction (property businesses & special leasing — not trades/professions); s.62 / s.185 caps; s.187A and FA 2012 Sch 10 fixtures rules; s.187B(6); s.198/199 elections and s.201 content; s.532 (contributions reduce qualifying expenditure) and s.537–538 (contribution allowances); s.562 apportionment; SBA (FA 2019); Land Remediation Relief (CTA 2009 Part 14). **NHS framework:** NHS (General Medical Services – Premises Costs) Directions 2024 (improvement grants up to 100%; grant cannot fund cost elements on which a tax allowance is claimed; notional-rent abatement; **Direction 15 reimburses professional fees up to 12% of the works and Direction 39(2) reimburses project management up to 1% — apportion prelims/fees to qualifying P&M net of this reimbursement, F-14**); NHS England primary care premises policy and capital grants policy. **HMRC manuals:** CA11520/CA23060 (dwelling-house; CA20020 is archived — its content moved to CA23060 in the FHL-repeal tidy-up, E-14 — do not cite CA20020 as live); CA22340 (integral-features repairs / 50% test); BIM35480 / PIM2020 (repairs vs capital). **Case law:** *SSE Generation Ltd v HMRC* **[2023] UKSC 17** (Supreme Court — do not cite the lower instances); *Urenco Chemplants Ltd v HMRC* **[2022] EWCA Civ 1587** (Court of Appeal — the Upper Tribunal decision was reversed); *Cheshire Cavity Storage 1 Ltd v HMRC* [2022] EWCA Civ 305; *Bowerswood House Retirement Home Ltd v HMRC* [2015] UKFTT 94; *Glais House Care Ltd v HMRC* [2019] UKFTT 59; *Tapsell & Lester v HMRC* [2011] UKFTT 376; *JD Wetherspoon plc v HMRC* [2012] UKUT 42; *Law Shipping Co Ltd v CIR* [1923] 12 TC 621; *Cyril Lord Carpets Ltd v Schofield* 42 TC 637 (grant-tracing to specific items; contributions "met directly or indirectly" — F-1). GP premises-funding and REIT/developer-model treatment drawn from published professional guidance (incl. Albert Goodman/VWV, GP Surveyors, PMA, Ashfords, NHS England). All figures indicative and subject to validation. **Citation control:** see Module 00, Sources — cite the instance that is still good law, and say which instance a paragraph number comes from.
