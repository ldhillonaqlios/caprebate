# Module 05 — Private Hospitals / Clinics: Stress-Tested Specification

**What this is:** the build-ready logic for the private-hospital / clinic module, produced by stress-testing the sector against the Modules 01–04 baselines. Same structure; sector-specific content.

**How private hospitals/clinics differ (the headline):** structurally this sector adds **no new gate** — it's a *trade/institution* (not a dwelling, like care homes) that is *fit-out- or purchase-led* (like dental and care homes), held increasingly through *REIT sale-and-leaseback* (like care-home PropCo/OpCo). What it adds is: (1) the **richest fixture taxonomy in the framework**, where the value lies in the **main-pool-vs-special-rate pool-allocation judgement** on specialist clinical services; (2) a **re-weighting of the relief levers** toward Full Expensing / 50% FYA / WDAs because projects dwarf the £1m AIA; and (3) a **charity claimant gate** that catches a major market player.

**Status:** Current as of June 2026 (post-Autumn 2025 Budget rates). Indicative technical reference, **not tax advice**. Items in §11 need professional sign-off. Valuation signed off by a chartered surveyor; filing position by a tax specialist (CTA).

> **Legend:** `[GATE]` = wrong answer kills/reduces the claim. `[BRANCH]` = changes the path. `[MODIFIER]` = changes size/speed/type. `[FLAG]` = route to specialist. `(CORE)` = shared engine. `(PH)` = private-hospital/clinic-specific.
> Pool tags: `MP` = main pool (14% from Apr 2026), `SR` = special rate / integral features (6%), `SBA` = structures & buildings (3% straight-line).

---

## 1. Module scope

**In scope:** private acute hospitals, day-surgery units, specialist and diagnostic clinics, cosmetic/aesthetic clinics, fertility/IVF, dialysis, oncology, ophthalmic and endoscopy centres.

**The acuity gradient (drives the taxonomy and the relief levers):**
- *Consulting-room / outpatient clinic* → modest fit-out; behaves like a dental/GP fit-out.
- *Day-surgery / treatment centre* → theatres, recovery, sterile services → fixture-dense.
- *Full acute private hospital* → the whole high-acuity taxonomy (theatres, ICU, imaging, medical gas, pharmacy aseptic) and multi-million-pound projects → Full Expensing territory (§5).

**Claimant types:** the operator running a healthcare **trade** — usually a taxpaying **company** (plc/Ltd: Spire, Circle, Ramsay, HCA), occasionally a **partnership** (consultant-owned clinics); and/or a property owner. **Watch: some major operators are charities/not-for-profits (e.g. Nuffield Health) — non-taxpayers that cannot claim (Q2).**

**Route elsewhere:** a setting that is genuinely residential care → Modules 01/03; an NHS body → non-taxpayer (no claim, though a private tenant may claim its fit-out).

---

## 2. The question flow (in order)

### A. Claimant, ownership & structure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q1 | Legal structure? (Ltd / plc / partnership / LLP) | `MODIFIER` `(CORE)` | Which allowances apply. **Full Expensing & 50% FYA = companies only** — central here (§5). AIA / 40% FYA / WDAs = all. |
| Q2 | Is the claimant a UK taxpayer (income/corporation tax) and **not a charity / not-for-profit**? | `GATE` `(PH)` | **Live and high-value here.** Major operators such as **Nuffield Health are registered charities → non-taxpayers → no claim.** Hospices and some not-for-profits likewise. Confirm status before anything else. |
| Q1a | Multiple sites / group? | `MODIFIER` `(CORE)` | **£1m AIA shared** across the group — but at hospital scale the claim dwarfs AIA anyway, so the company FYAs dominate (§5). |
| Q3 | Accounts on cash basis or accruals? | `GATE` `(CORE)` | Cash basis → no property fixtures claim. (Rare at this scale.) |
| Q4 | Who **owns** the property — the **operator** (freehold), a **healthcare REIT / investor** (sale-and-leaseback), a **pension scheme**, an **NHS body**; or is it **leased**? | `GATE` `BRANCH` `(PH)` | **Operator-owned** → operator claims (+ purchase apportionment if recently bought). **REIT/investor-owned (sale-and-leaseback)** → the **REIT's property income is tax-exempt → it can't beneficially claim → the operator-tenant claims its fit-out and trade plant.** **Pension/NHS-owned** → owner can't claim → tenant claims fit-out (Q5). |
| Q5 | (If leased / REIT-owned) Who **incurred** the fit-out, and what do the **lease** and any **contribution** say? | `GATE` `(PH)` | Tenant claims fit-out it pays for (even short lease). Lease-drafting trap; landlord contribution reduces the tenant's qualifying spend (s.532). |
| Q5v | Roughly what share of the fit-out did the landlord contribute? | `MODIFIER` `(PH)` | **F-7** — captured as a number and actually deducted in Stage 1 (s.532), not left as a note for survey. |
| Q5a | Has there been (or will there be) a **sale-and-leaseback**? | `BRANCH` `FLAG` `(PH)` | **The dominant model in this sector.** Disposal event → fixtures election + potential **balancing charge** for the seller (s.187B(6)). **Route to specialist** (§10). |

### B. Property & use — *the dwelling-house gate is essentially off*

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q6 | Is the property a **dedicated hospital/clinic**, or a **clinic in a converted house / building with residential**? | `BRANCH` `(PH)` | Dedicated clinical premises → **no dwelling-house issue** (a trade/institution; s.35 doesn't apply). **Mixed residential** (e.g. a clinic with a flat above) → apportion out the residential part. The only residue of the dwelling-house gate. |
| Q7 | Is the provider **CQC-registered** (England) / HIW / HIS equivalent? | `MODIFIER` (evidence) `(PH)` | Confirms the regulated healthcare trade. |

### C. Transaction & expenditure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q8 | What triggered the spend — **purchase / new build / theatre or ward refurbishment / fit-out / major equipment installation**? | `BRANCH` `(CORE)` | New builds and theatre/ward refurbs are common and large → invoice-based claim + repairs split + Full Expensing optimisation (§5). Purchase → apportionment + entitlement history (§D). |
| Q9 | Approximate amount(s) and date(s)? (often **£millions**) | `MODIFIER` `(CORE)` | Sizing → drives the relief-lever choice (§5). |
| Q10 | Cost information available (build cost breakdown, M&E packages, equipment schedule, sale contract)? | `MODIFIER` `(CORE)` | Hospital projects usually have detailed M&E cost data → strong invoice-based analysis. |
| Q10a | (Refurb branch) Like-for-like **repairs/renewals** vs improvements? | `BRANCH` `(CORE)` | Split out **repairs** (100% immediate), on top of allowances. Entirety test (§7). |
| Q10b | **Run-down building acquired and refurbished before clinical use?** | `FLAG` `(CORE)` | **Law Shipping trap** — such repairs usually capital (§7). |

### D. Entitlement history — *only where a property/freehold is bought*

> Apply only if Q8 includes a property purchase. For new builds, fit-outs and refurbs in owned/leased premises, skip to §E.

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q11 | Has a previous owner claimed on the fixtures? | `GATE` `(CORE)` | Pooling/fixed-value + s.185 cap. |
| Q12 | Prior owner able to claim, or developer/stock / tax-exempt (REIT, NHS, charity, pension)? | `GATE` / opportunity `(CORE)` | Tax-exempt prior owner → no pooling requirement → fresh s.562 claim. |
| Q13 | Connected-party / group transfers? | `FLAG` `(CORE)` | Route to specialist. |
| Q14 | Existing s.198 election and value? | `GATE` `(CORE)` | Fixtures-only, within 2 years, s.201 content, irrevocable; low value caps the claim. |
| Q15 | Seller acquired pre-April 2008? | opportunity `(CORE)` | Possible integral-features uplift (~15%). |
| Q16 | CPSE replies on capital allowances? | evidence `(CORE)` | Buyer bears the burden of proof (*Tapsell*). |

### E. Funding, VAT & the relief levers

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q17 | Was any spend **grant- or donation-funded** (relevant mainly to charitable providers)? | `MODIFIER` `(PH)` | Grant/donation-funded spend is excluded — but note charities can't claim anyway (Q2). **Unlike GPs, private hospitals have no NHS premises-grant regime**; NHS-contract income is **revenue**, not a capital grant, and doesn't reduce qualifying spend. |
| Q18 | Was VAT charged, and is it **irrecoverable**? | `MODIFIER` `(PH)` | Private clinical care is **VAT-exempt** → irrecoverable VAT **includable**. But the mix of **exempt clinical / standard-rated cosmetic / NHS-contract** work makes **partial exemption** genuinely complex — confirm the recoverable proportion before including VAT. |
| Q19 | Given the project size, which **relief levers** apply? | `MODIFIER` `(PH)` | **The re-weighting.** A single project usually **exceeds the £1m AIA**, so (companies): **Full Expensing 100%** on new **main-rate** plant; **50% FYA** on new **special-rate**; **AIA best directed at special-rate** items; **WDAs** for the balance and all **second-hand** plant. Sole-trader/partnership clinics: AIA + 40% FYA + WDAs. |
| Q20 | Tax year, and is the relevant return still **amendable**? | `MODIFIER` `(CORE)` | In time → fast relief / refund; out of time → WDAs. |

### F. Prior claims

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q21 | Has the operator/accountant already claimed on the fit-out / loose medical equipment? | `GATE` `(CORE)` | Avoid double-counting; specialist focuses on embedded fixtures not already pooled. |

---

## 3. The critical gates (the ones that decide or shape a private-hospital claim)

1. **Charity / not-for-profit status (Q2):** a charitable operator (e.g. Nuffield-type) is a non-taxpayer and **cannot claim** — check first.
2. **Ownership / who can claim (Q4/Q5/Q5a):** a REIT/investor landlord (tax-exempt property income) can't beneficially claim → the **operator-tenant's fit-out** is the claim; and **sale-and-leasebacks** are disposal events with balancing-charge exposure.
3. **Pool allocation (Q-taxonomy, §4):** the main-pool-vs-special-rate judgement on specialist clinical services — the highest-value technical call in the sector.
4. **Prior claims / double-counting (Q21).**

---

## 4. Private-hospital / clinic fixture taxonomy — *the framework's richest, and the pool judgement is the value*

The recurring high-value question is whether a specialist clinical service is **main-pool trade apparatus (`MP`, 14%)** — apparatus with which the clinical trade is carried on — or a **special-rate integral feature (`SR`, 6%)** — part of the building's services. The faster MP classification must be defended on the function test; *(judgement/contested)* marks where HMRC may push to SR.

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

> **Order note for this sector.** The MP-versus-SR pool call is a **P6** question and only arises once
> the item has survived P1–P5. Arguing that a UCV canopy or an IPS panel is trade apparatus rather than
> an integral feature does not exempt it from the common-law test — it moves the row **off** the `IF`
> route, which was the only route that would have exempted it. A row argued to `MP` on function
> therefore acquires `common_law_required = true` that it would not have carried at `SR`. The faster
> pool and the harder evidential burden travel together.


**Integral features — special rate (`SR`, 6%) — route `IF`** *(qualify regardless of function; no common-law test)***:** the building's general electrical & lighting; cold water; general space/water heating and comfort ventilation/air-cooling/air-purification; passenger lifts; external solar shading; thermal insulation; long-life assets.

**General plant & fixtures — main pool (`MP`, 14%) — routes `LISTC→CL`, `CL`, `S25`** *(`common_law_required = true` throughout: sanitaryware and fitted furniture are List C item 5, fire alarm item 10, security item 8, signage item 15, data/comms item 8. Carpets, floor coverings, blinds and door ironmongery have no List C item. "Alterations incidental to installing plant" is `S25`.)***:** sanitaryware & washroom fittings; fitted reception/admin furniture; fire alarm/detection; security (CCTV, access control); signage; carpets/floor coverings (incl. specialist clinical/anti-static flooring); blinds; data/comms; door ironmongery; alterations incidental to installing plant.

**High-acuity clinical plant — routes `LISTC→CL`, `CL`:** *(`common_law_required = true` throughout. MGPS, the pneumatic tube and the endoscopy and dialysis RO plant reach the list through items 1 and 2; CSSD through items 1, 2 and 4; pathology benching and fume cupboards through items 4 and 5; nurse-call through item 8; hoists through item 6; mortuary refrigeration through item 9; and hydrotherapy pools through item 16. Item 2 is conditional on the system being provided **mainly** for the trade or to serve particular plant. UCV, isolation-room pressure ventilation, IPS panels, theatre pendants and scrub-up stations, fixed operating lighting, radiation and RF shielding and the aseptic clean-room have **no List C item at all** and rest on the common-law test alone — the shielding additionally carries s.23(4) risk. Item 16 settles nothing on its own: a hydrotherapy pool used in delivering rehabilitation is a different case from an amenity pool that forms part of the setting.)*
- **Medical gas pipeline systems (MGPS / HTM 02-01)** — VIE/oxygen plant, manifolds, compressors, AGSS, copper distribution pipework, area valve service units, terminal outlets, alarms — `MP` (trade apparatus)
- **Operating-theatre ultra-clean / laminar-flow ventilation (UCV, HTM 03-01)** — `MP` *(judgement/contested — specialist argues process apparatus; HMRC may treat as an integral-feature ventilation system `SR`. The single biggest pool call in the sector.)* **s.23(4) / s.33A(6) also bites here and is unresolved:** s.33A(5)(c) expressly brings in *"any floor or ceiling comprised in"* a ventilation system, while s.33A(6) excludes anything whose principal purpose is to provide a permanent ceiling. A UCV canopy and its plenum ceiling sit exactly on that line. **This is CTA open question 3 on Rulebook D — the engine must surface it, not resolve it.**
- **Isolation-room / critical-care pressure ventilation** (positive/negative pressure, HEPA) — `MP` *(judgement/contested vs `SR`)*
- **Isolated power supply (IPS) / medical IT electrical systems** for theatres/critical care — `MP` *(judgement — medical electrical apparatus vs general electrical `SR`)*
- **Theatre service pendants, surgeon's panels, scrub-up stations, theatre control panels** — `MP`
- **Fixed operating / examination lighting** — `MP`
- **Radiation shielding (lead-lined walls/doors/glass) for X-ray/CT/fluoroscopy; RF shielding/Faraday cage for MRI** — `MP` *(judgement — installation/trade apparatus vs structural)*
- **Sterile services / CSSD / decontamination** — washer-disinfectors, fixed sterilisers/autoclaves, RO/purified water, dedicated drainage — `MP`
- **Endoscopy decontamination; dialysis RO water plant and station services** — `MP`
- **Aseptic pharmacy / clean-room fit-out** (controlled environment, filtration) — `MP` *(judgement)*
- **Pathology/lab fit-out** — fume cupboards, fixed benching, specialist services — `MP`
- **Pneumatic tube transport system** (specimens/drugs/notes) — `MP`
- **Nurse-call / emergency-call / patient-monitoring infrastructure** — `MP`
- **Patient hoists, bariatric and specialist lifts** — `MP`
- **Hydrotherapy pools and plant** (rehab) — `MP`
- **Commercial catering/kitchen, laundry; mortuary refrigeration** — `MP`

**Loose equipment — chattels (`MP` via AIA/FYA, the operator's kit) — route `CL`:** *(chattels; ss.21–22 never engage — the common-law and durability tests are the whole enquiry)* imaging machines (CT/MRI/X-ray units themselves), surgical robots and instruments, patient monitors, beds and trolleys, freestanding diagnostic and clinical equipment, IT hardware. *The room, shielding, and dedicated services are fixed (above); the machine is usually moveable — don't double-count.*


**Building alterations incidental to installing plant — route `S25`, pool follows the plant served**

s.25 is a **claimable category in its own right**, not a footnote to the main-pool list. Capital expenditure on alterations to an existing building incidental to installing plant is treated as expenditure **on that plant**, and the works form part of it. Two consequences the old prose lost:

1. **The works take the pool of the plant they serve**, not the main pool. Chasing for a special-rate electrical run is special-rate.
2. **On a purchase, the buyer's own s.25 expenditure sits on top of the s.185 cap** — s.185(3) gives the past owner's disposal value **plus** the buyer's s.25 spend, so an election value is not an absolute ceiling on the buyer (Rulebook C §5; board item C-4).

**The largest s.25 exposure in the framework.** Typical lines: forming plant rooms, risers and openings for MGPS and UCV; structural support and deflection limits for theatre canopies and pendants; excavation and tanking for hydrotherapy pool plant; floor forming and drainage for CSSD, endoscopy and dialysis RO; service routes for the pneumatic tube. *Urenco* at [139] expressly names swimming-pool excavation as claimable ancillary cost. Where the parent element is one of this sector's `APPORTION` rows — UCV, isolation ventilation, IPS — **the works inherit that open pool call too.**

*Every s.25 line must name the parent element it serves. Works that merely **host** plant are not expenditure on the plant — that is the limit in *Urenco* at [97].*

**Structure (residual) — `SBA` (3% straight-line) — route `EXCL` for plant and machinery:** the shell on a new build, extensions, structural alterations — non-residential, post-29-Oct-2018. Material on large builds. CGT base-cost interaction applies; a buyer needs the seller's allowance statement.

---

## 5. How the claim figure is built — and the relief-lever optimisation

**The usual case (new build / theatre or ward refurb / fit-out).** Built from **invoices and M&E cost packages**, allocated across pools with the §4 judgements defended, plus apportioned **preliminaries & professional fees** (*JD Wetherspoon*). On a large build this is a substantial quantity-surveying exercise.

**Where a hospital/clinic is bought**, the s.562 just-and-reasonable apportionment applies (Bowerswood formula), capped by **s.185 / s.62**, with the buyer's burden of proof (*Tapsell*; *Glais House*).

**The relief-lever optimisation (the distinctive part).** Because projects exceed £1m, the order of relief matters (companies):
1. **Full Expensing (100%)** on new **main-rate** plant — uncapped.
2. **AIA (100%, £1m)** best aimed at **special-rate** items (better than the 50% FYA).
3. **50% FYA** on remaining new **special-rate** plant.
4. **WDAs** (14% / 6%) on the balance and on all **second-hand** plant (e.g. fixtures in a purchased hospital).
Sole-trader/partnership clinics use **AIA + 40% FYA + WDAs**. Charities (Q2) get none of this.

**Convert to tax saving:** qualifying expenditure × marginal rate (corporation tax 19–25%; partnership clinics income tax up to 45%).

---

## 6. Yield logic — *high end of the framework, conditioned*

**Indicative bands** (label outputs as estimates):

| Trigger | Base | Indicative qualifying % |
|---|---|---|
| New-build acute hospital | Build cost | ~35–45% (plus SBA on the shell) |
| Theatre / clinical refurbishment or fit-out | Spend | High (includes a repairs element) |
| Purchase of an existing hospital/clinic | Property price | 25–45% embedded fixtures |
| Outpatient / consulting-room clinic | Modest — behaves like a dental/GP fit-out |

**Conditioning rules:**
- **Charity operator (Q2)** → **nil** (non-taxpayer).
- **REIT/investor landlord** → the claim is the **operator-tenant's fit-out**, not the property.
- **Pool allocation (§4)** → defend MP on specialist services to accelerate relief.
- **Refurb** → split out **repairs** (100% immediate, §7).
- **Loose equipment already claimed (Q21)** → exclude.

**Output rule:** always an **estimate**; defensible figure from the M&E/invoice analysis or s.562 apportionment, subject to the §5 caps, with the §4 pool judgements documented.

---

## 7. Repairs vs capital — theatre and ward refurbishments

Hospitals refurbish theatres, wards and plant frequently. The **entirety test** (PIM2020 / BIM35480 / CA22340): replacing **subsidiary parts** = repair; reconstructing **substantially the whole entirety** or **improving** the character = capital. Stripping out and upgrading a theatre leans **capital**; like-for-like renewal of components leans **repair**. The **Law Shipping trap** (Q10b) and the **50% integral-features rule** (s.33B) apply as in Modules 01–02.

---

## 8. Adjacent reliefs

**SBA:** §4 — material on new builds and extensions (3% on the non-residential structure).

**Land Remediation Relief (LRR):** companies-only 150% deduction for remediating contaminated/derelict property acquired in that state (asbestos in older converted buildings; brownfield hospital developments) — flag for incorporated operators; polluter-pays applies. CTA 2009 Part 14.

**The relief-lever optimisation (§5)** is itself the distinctive value here — sequencing Full Expensing, AIA, 50% FYA and WDAs to accelerate a multi-million-pound claim.

---

## 9. Failure modes / HMRC challenge points (hard-code as warnings)

1. **A charity / not-for-profit operator claiming** (e.g. Nuffield-type) — non-taxpayer, no claim (Q2).
2. **A REIT / investor landlord claiming** — property income tax-exempt; the operator-tenant claims its fit-out.
3. **Wrong pool allocation** — the central technical risk here: over-stating MP where HMRC would insist on SR (theatre ventilation, IPS, shielding), or under-claiming by defaulting specialist apparatus to SR.
4. **Double-counting** loose medical equipment the accountant already claimed (Q21).
5. **Ignoring sale-and-leaseback balancing charges** and the disposal-value/election (s.187B(6)).
6. **Over-claiming repairs** vs improvement on a theatre/ward refurb — entirety test / Law Shipping / 50% rule (§7).
7. **Misapplying Full Expensing** to second-hand plant (it's new-only) or to a non-company.
8. **Over-including VAT** without resolving the partial-exemption proportion (Q18).
9. On a purchase: **ignoring the s.185/s.62 caps** and the buyer's burden of proof.

---

## 10. Sell-side note (service + risk)

Sale-and-leaseback is the **dominant** model in this sector, so the disposal-side workstream is central: managing the disposal value and the s.198 election on a freehold sale to a REIT, and protecting the seller from a balancing charge (s.187B(6)). A pre-deal capital allowances review — ideally at heads of terms — maximises relief and frames the position for both parties. This is a significant product line here, not an afterthought.

---

## 11. Open items to validate before go-live

- [ ] Chartered-surveyor + CTA **sign-off on the main-pool-vs-special-rate judgements** in §4 — above all **theatre ultra-clean ventilation**, **isolation/critical-care pressure ventilation**, **IPS**, and **radiation/RF shielding**. This is the highest-value and most contestable wording in the module.
- [ ] Confirm the **charity / not-for-profit claimant gate** reliably catches Nuffield-type operators and hospices (Q2).
- [ ] Confirm the **REIT / sale-and-leaseback** entitlement and disposal logic (Q4/Q5a).
- [ ] Confirm the **relief-lever sequencing** (Full Expensing / AIA / 50% FYA / WDAs) for large company projects (Q19/§5).
- [ ] Confirm **VAT partial-exemption** treatment (exempt clinical / standard cosmetic / NHS contract) for the includable irrecoverable VAT (Q18).
- [ ] Calibrate the **new-build / refurb / purchase yield bands** against real private-hospital projects.

---

## Sources & references

**Legislation (CAA 2001 unless noted):** s.11; s.21–22; s.33A integral features; s.33B / 50% rule; s.35 dwelling-house restriction (property businesses & special leasing — not trades); s.62 / s.185 caps; s.187A and FA 2012 Sch 10 fixtures rules; s.187B(6); s.198/199 elections and s.201 content; s.532 / s.537–538 (contributions); s.562 apportionment; SBA (FA 2019); Full Expensing and 50%/40% FYAs (FA 2023 and subsequent); Land Remediation Relief (CTA 2009 Part 14). **HMRC manuals:** CA11520/CA23060 (dwelling-house; CA20020 is archived — its content moved to CA23060 in the FHL-repeal tidy-up, E-14 — do not cite CA20020 as live); CA22340 (integral-features repairs / 50% test); BIM35480 / PIM2020 (repairs vs capital). **Healthcare M&E standards:** HTM 02-01 (medical gas), HTM 03-01 (specialist ventilation). **Case law:** *SSE Generation Ltd v HMRC* **[2023] UKSC 17** (Supreme Court — do not cite the lower instances); *Urenco Chemplants Ltd v HMRC* **[2022] EWCA Civ 1587** (Court of Appeal — the Upper Tribunal decision was reversed); *Cheshire Cavity Storage 1 Ltd v HMRC* [2022] EWCA Civ 305; *Bowerswood House Retirement Home Ltd v HMRC* [2015] UKFTT 94; *Glais House Care Ltd v HMRC* [2019] UKFTT 59; *Tapsell & Lester v HMRC* [2011] UKFTT 376; *JD Wetherspoon plc v HMRC* [2012] UKUT 42; *Law Shipping Co Ltd v CIR* [1923] 12 TC 621. Ownership-structure context (healthcare REIT sale-and-leaseback; operator charity status) drawn from published market and legal commentary (incl. Clifford Chance, Savills, Nuffield Health, Electca, Colne). All figures indicative and subject to validation. **Citation control:** see Module 00, Sources — cite the instance that is still good law, and say which instance a paragraph number comes from.
