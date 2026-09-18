# Module 02 — Dental Practices: Stress-Tested Specification

**What this is:** the build-ready logic for the dental-practice module, produced by stress-testing the sector against the Module 00 (master engine) baseline and Modules 01/03/04/05. Same structure; sector-specific content. (This is the spec that was missing from the set; it is written to the locked template so it can feed the build-prep layer like the others.)

**How dental practices differ (the headline):** structurally dental adds **no new gate type** — it's a clinical **trade** (so the dwelling-house restriction is essentially off, as for GPs and private hospitals) that is **fit-out-led** with a modest purchase element. What it adds is a distinctive *combination*: (1) the **deal-structure gate is genuinely live** — unlike NHS general-practice goodwill, **dental goodwill is a saleable asset**, so practice acquisitions are commonly **share deals**, where the company keeps its existing pools and the purchase is not a claim event; (2) **SIPP/SSAS pension ownership** of the surgery premises is endemic — a tax-exempt owner that cannot claim, with the trading practice claiming its own fit-out; (3) the **fixtures-vs-chattels double-count discipline is the sharpest in the framework**, because the accountant has usually already claimed the loose dental equipment, and the value lies in the *un-pooled embedded services*; and (4) a **distinctive but modest clinical fixture set** (surgery services — compressor, suction/aspiration ring mains, dedicated power/water/drainage at each chair; decontamination/LDU; X-ray/CBCT shielding; amalgam separators where still present). Relief is **AIA-led**, because a dental fit-out is usually under £1m.

**Status:** Current as of June 2026 (post-Autumn 2025 Budget rates; rates verified 14 June 2026). Indicative technical reference, **not tax advice**. Items in §11 need professional sign-off. Valuation signed off by a chartered surveyor; filing position by a tax specialist (CTA).

> **Legend:** `[GATE]` = wrong answer kills/reduces the claim. `[BRANCH]` = changes the path. `[MODIFIER]` = changes size/speed/type. `[FLAG]` = route to specialist. `[STOP]` = likely no/minimal claim — return a reasoned negative. `(CORE)` = shared engine. `(DEN)` = dental-specific.
> Pool tags: `MP` = main pool (14% from Apr 2026), `SR` = special rate / integral features (6%), `SBA` = structures & buildings (3% straight-line).

---

## 1. Module scope

**In scope:** general dental practices (NHS, private, and mixed); specialist and referral practices (orthodontics, endodontics, periodontics, oral surgery, implantology); practices offering dental hygiene/therapy, sedation, or in-house imaging (OPG/panoramic, CBCT). Both **squat (newly fitted-out) practices** and **acquired practices**.

**The practice gradient (drives the taxonomy and the size of the claim):**
- *Single-surgery / small practice* → modest clinical fit-out.
- *Multi-surgery practice* → more chair positions, more dedicated services → fixture-denser.
- *Specialist practice* (CBCT imaging, IV/inhalation sedation, minor oral surgery) → the richer end of the dental taxonomy.

**Claimant types:** the dentist or practice owner running a dental **trade** — a **sole trader**, **partnership/LLP**, or (increasingly common) an **incorporated practice (Ltd)**. The surgery premises are frequently held in a **SIPP/SSAS pension scheme** let to the trading practice, or held **leasehold**, or owned **freehold** by the practice/owner. Consolidators / dental service organisations (DSOs) acquiring practices are usually companies.

**Route elsewhere:** dental is a clean standalone trade — there is little to re-route. A "practice" that is genuinely a room within a dwelling, or a surgery with residential accommodation above, raises only the narrow residential-apportionment point (Q6). NHS-body-owned premises are rare in dentistry (most premises are privately owned or leased).

---

## 2. The question flow (in order)

### A. Claimant, ownership & structure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q1 | Legal structure? (sole trader / partnership / LLP / Ltd) | `MODIFIER` `(CORE)` | Which allowances apply. **Full Expensing & 50% FYA = companies only**; AIA, the 40% FYA and WDAs = all. Many dentists incorporate, so the company levers are often live. |
| Q1a | Multiple practices / group under common control? | `MODIFIER` `(CORE)` | **£1m AIA shared** across the group — relevant because dental fit-outs usually sit within the AIA. |
| Q2 | Is the claimant a UK taxpayer (income/corporation tax)? | `GATE` `(CORE)` | The trading practice is a taxpayer. A **SIPP/SSAS that owns the premises is tax-exempt and cannot claim** — but that is the *owner*, not the trading practice (Q4). |
| Q3 | Accounts on cash basis or accruals? | `GATE` `(CORE)` | Cash basis → no property fixtures claim (only items such as cars). |
| Q4 | Who **owns** the surgery premises — the **practice/owner** (freehold), a **SIPP/SSAS pension scheme**, a **private landlord (leasehold)**, or a **connected party**? | `GATE` `BRANCH` `(DEN)` | **The dominant ownership gate.** **Practice-owned freehold** → the practice claims (+ purchase apportionment if recently bought). **SIPP/SSAS-owned** → the pension is **tax-exempt → cannot beneficially claim → the trading practice claims its own fit-out** (Q5). **Leasehold** → the practice claims the fit-out it paid for. |
| Q5 | (If pension-owned / leasehold) Who **incurred** the fit-out, what does the **lease** say, and was there a **landlord/connected-party contribution**? | `GATE` `(DEN)` | Practice claims the fit-out it pays for (even on a short lease). The **connected-party SIPP lease** (the dentist's own pension owns the premises let to their own practice) is common and needs care: lease-drafting can defeat entitlement; a contribution reduces the practice's qualifying spend (s.532). |

### B. Property & use — *the dwelling-house gate is essentially off*

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q6 | Is the property a **dedicated practice premises**, or a **surgery in a converted house / with residential accommodation above**? | `BRANCH` `(DEN)` | Dedicated clinical premises → **no dwelling-house issue** (a trade; s.35 doesn't apply). **Residential element** (a flat above, or part used as a home) → apportion out the residential part. The only residue of the dwelling-house gate. |
| Q7 | Is the practice **CQC-registered** (England) / HIW / HIS / RQIA equivalent? | `MODIFIER` (evidence) `(DEN)` | Confirms the regulated dental trade. |

### C. Transaction & expenditure

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q8 | What triggered the spend — **bought an existing practice / fitted out a squat (new) practice / refurbished / equipment-led fit-out**? | `BRANCH` `(CORE)` | **Squat fit-outs and refurbishments are the common, high-yield cases.** A purchase routes to Q8a then the entitlement history (§D) only if the **property** is bought. |
| Q8a | (If a practice was bought) Did you buy the **property/assets and goodwill**, or the **shares** in the company that owns the practice? | `BRANCH` `STOP` `(DEN)` | **Live gate — unlike NHS GP goodwill, dental goodwill is saleable, so share deals are common.** **Share purchase** → the company keeps its existing tax position → **no new claim event on the deal** (`STOP`/reasoned negative if it's the only trigger; later fit-out still counts). **Asset/goodwill purchase** → claim runs on any property/fixtures element acquired. **Property purchase** → entitlement history (§D). |
| Q9 | Approximate amount(s) and date(s)? | `MODIFIER` `(CORE)` | Sizing + amendment window. **A dental fit-out is usually under £1m → the AIA covers it** (§5). |
| Q10 | Cost information available (fit-out cost breakdown / M&E package, equipment schedule, sale contract)? | `MODIFIER` `(CORE)` | Dental fit-outs are usually well-documented (the fit-out contractor's package) → strong invoice-based analysis. |
| Q10a | (Refurb branch) Like-for-like **repairs/renewals** vs improvements? | `BRANCH` `(CORE)` | Split out **repairs** (100% immediate). Stripping out and re-fitting a surgery leans **capital**; like-for-like renewal leans **repair**. Entirety test (§7). |
| Q10b | **Run-down premises acquired and refurbished before clinical use?** | `FLAG` `(CORE)` | **Law Shipping trap** — such repairs usually capital (§7). |
| Q10c | (Company) Asbestos/contamination removed, or a derelict building developed, that you acquired in that state? | `BRANCH` `(CORE)` | **Land Remediation Relief** (companies-only 150%) — relevant where an incorporated practice converts an older/derelict building. Polluter-pays applies (§8). |

### D. Entitlement history — *only where a property/freehold is actually bought*

> Apply only if Q8a = **property purchase**. **Most dental transactions are share/asset-and-goodwill deals or squat fit-outs**, so this block is frequently **not reached** — a defining feature of the sector.

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q11 | Has a previous owner claimed on the fixtures? | `GATE` `(CORE)` | Pooling/fixed-value + s.185 cap. |
| Q12 | Prior owner able to claim, or developer/stock / tax-exempt (incl. a SIPP/SSAS or charity)? | `GATE` / opportunity `(CORE)` | Tax-exempt prior owner (e.g. a pension scheme) → no pooling requirement → fresh s.562 claim. |
| Q13 | Connected-party / group transfers (incl. pension-scheme transfers)? | `FLAG` `(CORE)` | Route to specialist. |
| Q14 | Existing s.198 election and value? | `GATE` `(CORE)` | Fixtures-only, within 2 years, s.201 content, irrevocable; low value caps the claim. |
| Q15 | Seller acquired pre-April 2008? | opportunity `(CORE)` | Possible integral-features uplift (~15%). |
| Q16 | CPSE replies on capital allowances? | evidence `(CORE)` | Buyer bears the burden of proof (*Tapsell*). |

### E. Funding, VAT & the relief levers

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q17 | Was any spend **grant- or subsidy-funded**? | `MODIFIER` `(DEN)` | Grant-funded spend is excluded — but note: **unlike GPs, dentistry has no NHS premises-grant regime**, and NHS dental-contract (UDA) income is **revenue**, not a capital grant, so it does **not** reduce qualifying spend. Usually a light gate. |
| Q18 | Was VAT charged, and is it **irrecoverable**? | `MODIFIER` `(DEN)` | Dental care is largely **VAT-exempt** → irrecoverable VAT **includable**. But practices with **standard-rated cosmetic** work (e.g. tooth whitening) and **NHS + private** mixes can be **partially exempt** — confirm the recoverable proportion before including VAT. |
| Q19 | Given the project size, which **relief levers** apply? | `MODIFIER` `(DEN)` | A fit-out usually **sits within the £1m AIA → 100%**. Above the AIA: **company** → Full Expensing (new main-rate) + 50% FYA (new special-rate); **sole trader/partnership** → **40% FYA** (new main-rate, from Jan 2026) + WDAs. Second-hand plant (a purchased practice's fixtures) → AIA/WDAs only. |
| Q20 | Tax year, and is the relevant return still **amendable**? | `MODIFIER` `(CORE)` | In time → fast 100% relief / refund; out of time → WDAs. Retrospective fit-out claims are common and worthwhile. |

### F. Prior claims

| # | Question | Type | Determines / action |
|---|---|---|---|
| Q21 | Has the practice or its accountant already claimed on the fit-out or on **loose dental equipment**? | `GATE` `(CORE)` `(DEN)` | **The sharpest fixtures-vs-chattels point in the framework.** The accountant has usually pooled the **loose equipment** (chairs/units, instruments, imaging machines, IT) via AIA; the **embedded services** (the suction/air ring mains, dedicated power/water/drainage at each chair, decontamination plumbing, shielding installation) are frequently **un-pooled** and are where the value is. Claim each item **once**, in the right place. |

---

## 3. The critical gates (the ones that decide or shape a dental claim)

1. **Ownership / who can claim (Q4/Q5):** a **SIPP/SSAS** (or any non-taxpayer) that owns the premises **cannot claim**; the trading practice claims its own fit-out. The endemic dental structure, and the dominant ownership gate.
2. **Deal structure (Q8a):** **dental goodwill is saleable**, so practice acquisitions are commonly **share deals** → the company keeps its pools → **no new claim event on the deal**. (This is the key contrast with the GP module, where NHS goodwill cannot be sold.)
3. **Fixtures-vs-chattels double-count (Q21):** the central technical discipline — do not re-claim loose equipment the accountant has already pooled; do claim the un-pooled embedded services. The **dental chair/unit** is the classic borderline item.
4. **(Minor) the dwelling residue (Q6):** residential-above apportionment only; otherwise the dwelling-house gate is off (a trade).

---

## 4. Dental fixture taxonomy — *modest but distinctive; the value is the un-pooled embedded services*

Pool allocation follows the function test. The recurring dental question is not (as in private hospitals) main-pool-vs-special-rate, but **fixture-vs-chattel**: the embedded *services* are claimable fixtures; the *equipment* connected to them is usually loose plant the accountant has pooled.

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


**Integral features — special rate (`SR`, 6%) — route `IF`** *(qualify regardless of function; no common-law test)***:** the building's general electrical & lighting; cold water; general space/water heating and comfort ventilation/air-conditioning; thermal insulation; long-life assets.

**General plant & fixtures — main pool (`MP`, 14%) — routes `LISTC→CL`, `CL`, `S25`** *(`common_law_required = true` throughout: joinery and sanitaryware are List C item 5, fire alarm item 10, security item 8, signage item 15, data/comms item 8 — the exclusion lifts, qualification does not follow. Floor coverings, blinds and door ironmongery have no List C item and rest on the common-law test alone against List A item 1. "Alterations incidental to installing plant" is `S25`.)***:** reception/waiting-room fitted furniture and joinery; sanitaryware & washroom fittings; fire alarm/detection; security (CCTV, access control, door entry); signage; floor coverings (incl. specialist clinical / anti-static flooring); blinds; data/comms cabling; door ironmongery; alterations incidental to installing plant.

**Dental-specific clinical plant (`MP` — trade apparatus) — routes `LISTC→CL`, `CL`:** *(`common_law_required = true` throughout. The compressor and suction plant are List C item 1 and the LDU washer-disinfectors and autoclaves item 1 or 4; the chair-position services, aspiration ring main, amalgam drainage, RO water and sedation piping reach the list through item 2, which is itself conditional on the system being provided **mainly** to meet the particular requirements of the dental trade or to serve particular plant — general foul drainage stays excluded by List A item 4. Fixed operating and examination lighting and the imaging shielding have **no List C item** and rest on the common-law test alone.)*
- **Dental compressor / oil-free medical-air plant** (compressed air for handpieces) and its distribution pipework.
- **Suction / aspiration plant** (central suction pump) and the **aspiration ring main** to each surgery.
- **Dedicated services at each chair position** — dedicated power, water supply, drainage, and the compressed-air / suction terminals serving each operatory. *(These embedded services are distinct from the chair itself and are the most commonly missed value.)*
- **Dental chair / treatment unit** — *borderline (fixtures-vs-chattels flag):* plumbed and connected, but commonly claimed as loose plant via AIA by the accountant. Claim it **once**, in the right place; do not double-count.
- **Fixed operating / examination lighting** (surgery lights).
- **Decontamination / Local Decontamination Unit (LDU)** — fixed washer-disinfectors and autoclaves/sterilisers, dedicated RO/purified water, dedicated drainage, and the clean/dirty bench and sink infrastructure (HTM 01-05).
- **X-ray / imaging shielding & radiation protection** — lead-lining or barrier/distance protection and the controlled-area installation for intraoral, OPG/panoramic and **CBCT** rooms (Ionising Radiations Regulations 2017). *(Judgement — the installation/shielding is trade apparatus; the X-ray/CBCT machine itself is loose plant.)*
- **Amalgam separators and dedicated amalgam drainage** — `MP` **where present**. *(Mandatory in GB practices using amalgam since 1 January 2019 under the retained Mercury Regulation; a declining fixture, as amalgam is phased down toward the 2034 Minamata global phase-out — Northern Ireland practices have ceased use, and amalgam-free fit-outs will not have them. Claim only where actually installed — see failure mode 9.)*
- **Inhalation-sedation / nitrous-oxide (and oxygen) piping** where the practice offers sedation.
- **Nurse-call / surgery-call and patient-management call systems.**

**Loose equipment — chattels (`MP` via AIA; usually already the accountant's claim — do NOT double-count) — route `CL`** *(chattels are not fixtures, so ss.21–22 never engage; the ordinary common-law test and the two-year durability test are the whole enquiry)***:** X-ray and CBCT machines, intraoral scanners, freestanding autoclaves, hand instruments, computers and IT hardware, freestanding furniture, and (commonly) the dental **chairs/units** themselves.


> **Suspended ceilings and acoustic linings — the s.23(4) / s.33A(6) carve-out.** Dental fit-outs
> routinely install suspended ceilings to conceal the aspiration ring main and compressed-air runs,
> and acoustic linings between surgeries. Neither is safely claimable on the face of it: s.23(4)
> removes from List C items 1–16 anything whose principal purpose is to insulate or enclose the
> interior or to provide a permanent interior ceiling, and s.33A(6) does the same to integral
> features. A ceiling that exists to hide services is enclosing the interior; the services above it
> are a different matter and are claimed on their own rows. Acoustic lining is List C item 7 and has
> to be provided **mainly** to meet the particular requirements of the practice before the carve-out
> is even reached. *Urenco* at [97] is the same point from the other direction — fabric that merely
> hosts plant is not expenditure on the plant.

**Building alterations incidental to installing plant — route `S25`, pool follows the plant served**

s.25 is a **claimable category in its own right**, not a footnote to the main-pool list. Capital expenditure on alterations to an existing building incidental to installing plant is treated as expenditure **on that plant**, and the works form part of it. Two consequences the old prose lost:

1. **The works take the pool of the plant they serve**, not the main pool. Chasing for a special-rate electrical run is special-rate.
2. **On a purchase, the buyer's own s.25 expenditure sits on top of the s.185 cap** — s.185(3) gives the past owner's disposal value **plus** the buyer's s.25 spend, so an election value is not an absolute ceiling on the buyer (Rulebook C §5; board item C-4).

Typical dental lines: chasing and floor channels for the aspiration ring main and compressed-air runs; forming plant-room openings and acoustic enclosures for the compressor and suction plant; drainage falls and floor forming at each chair position; benching substrates and service risers in the LDU. Module 02 names the embedded chair-position services as the most commonly missed value in the sector — **the works that bury them get missed with them.**

*Every s.25 line must name the parent element it serves. Works that merely **host** plant are not expenditure on the plant — that is the limit in *Urenco* at [97].*

**Structure (residual) — `SBA` (3%) — route `EXCL` for plant and machinery:** the shell on a squat **new build** and structural alterations — non-residential, post-29-Oct-2018. **Modest in most dental cases**, which are fit-outs within an existing shell; material only on a genuine new build.

---

## 5. How the claim figure is built

**The usual case (squat fit-out / refurbishment).** Built from **invoices and the fit-out / M&E cost breakdown**, allocated across pools, with **preliminaries and professional fees apportioned** to the qualifying P&M (*JD Wetherspoon*). Dental fit-outs are usually well-documented by the specialist fit-out contractor, which supports a strong invoice-based analysis. **The essential step is the fixtures-vs-chattels reconciliation against the practice's existing capital-allowances claims** (the accountant's fixed-asset register) — to add the un-pooled embedded services without re-claiming pooled loose equipment.

**Where an existing practice is bought**, the structure decides everything (Q8a): a **share** purchase is **not a claim event** (the company keeps its pools); an **asset/goodwill** purchase without the property gives a claim only on any fit-out the buyer then incurs (not on goodwill); a **property** purchase triggers a **s.562 just-and-reasonable apportionment** (Bowerswood formula) on the property/fixtures element, capped by **s.185 / s.62**, with the buyer's burden of proof (*Tapsell*; *Glais House*).

**Relief levers:** a fit-out usually sits within the **£1m AIA → 100%** in year one (if in time). Above the AIA — a **company** uses **Full Expensing** (new main-rate) and the **50% FYA** (new special-rate); a **sole trader / partnership** uses **AIA + the 40% FYA** (new main-rate, from January 2026) **+ WDAs**. Second-hand plant (the fixtures in a purchased practice) gets **AIA or WDAs** only — not Full Expensing or the FYAs.

**Convert to tax saving:** qualifying expenditure × marginal rate — **income tax up to 45%** for unincorporated dentists (many sit at higher/additional rate), **corporation tax 19–25%** for incorporated practices.

---

## 6. Yield logic — *high on fit-out, modest on purchase, nil on a share deal*

**Indicative bands** (label outputs as estimates):

| Trigger | Base | Indicative qualifying % |
|---|---|---|
| Squat (new) practice fit-out | Fit-out spend | **~50–90%** (fixture-dense clinical fit-out) |
| Refurbishment of an existing practice | Spend | **High** (includes a repairs element) |
| Purchase of an existing practice — **property** bought | Property price | **~15–30%** embedded fixtures |
| Acquisition by **share** purchase | — | **Nil** on the deal itself (later fit-out still counts) |

**Conditioning rules:**
- **SIPP/SSAS (or other non-taxpayer) owner (Q4)** → the claim is the **practice's fit-out**, not the property.
- **Share purchase (Q8a)** → **nil** on the deal.
- **Fixtures-vs-chattels reconciliation (Q21)** → exclude already-pooled loose equipment; capture the un-pooled embedded services.
- **Refurb** → split out repairs (100% immediate, §7).
- **Mixed/cosmetic VAT (Q18)** → resolve partial exemption before including VAT.

**Output rule:** always an **estimate**; usually a healthy fit-out figure, modest on a property purchase, **nil on a share deal**. Defensible figure from the invoice/M&E analysis or the s.562 apportionment, subject to the §5 caps, with the fixtures-vs-chattels boundary documented.

---

## 7. Repairs vs capital — surgery refurbishments

Practices refurbish surgeries and decontamination rooms regularly. The **entirety test** (PIM2020 / BIM35480 / CA22340): replacing **subsidiary parts** = repair; reconstructing the **whole entirety** or **improving** the character = capital. Stripping out and re-fitting a surgery leans **capital**; like-for-like component renewal leans **repair**. The **Law Shipping trap** (Q10b) — repairs to newly-acquired run-down premises before use are capital — and the **50% integral-features rule** (s.33B) apply as in Modules 01/04/05.

---

## 8. Adjacent reliefs

**Land Remediation Relief (LRR):** companies-only **150% deduction** for remediating contamination/dereliction (asbestos in older converted premises) acquired in that state — flag for incorporated practices; polluter-pays applies. CTA 2009 Part 14.

**SBA:** §4 — **modest**, because most dental projects are fit-outs within an existing shell; material only on a genuine squat new build (3% on the non-residential structure; CGT base-cost interaction; buyer needs the seller's allowance statement).

**No NHS premises-grant regime** (the contrast with GPs): NHS dental-contract income is revenue, not a capital grant, and does not reduce qualifying spend.

---

## 9. Failure modes / HMRC challenge points (hard-code as warnings)

1. **Fixtures-vs-chattels double-count** — re-claiming loose dental equipment the accountant has already pooled (the central dental error, Q21).
2. **Treating a share purchase as a claim event** — dental goodwill is saleable, so share deals are common; the company keeps its pools (Q8a).
3. **A SIPP/SSAS (or other non-taxpayer) owner claiming** — the tax-exempt owner can't claim; the trading practice claims its fit-out (Q4).
4. **Lease drafting / connected-party SIPP lease** leaving the practice unable to claim, or a contribution reducing qualifying spend (s.532) (Q5).
5. **Over-claiming repairs** vs improvement on a refurb — entirety test / Law Shipping / 50% rule (§7).
6. **Misapplying Full Expensing** to second-hand plant (it's new-only) or to a non-company (sole-trader/partnership dentists use AIA + the 40% FYA) (Q19).
7. **Over-including VAT** without resolving partial exemption for mixed NHS / private / standard-rated cosmetic work (Q18).
8. On a property purchase: **ignoring the s.185/s.62 caps** and the buyer's burden of proof (§D).
9. **Claiming amalgam-related fixtures that aren't present** (amalgam-free practices) — or missing them where they are still installed (§4).

---

## 10. Sell-side note (service + risk)

Dental is a **high-transaction sector** — corporate consolidators / DSOs acquire practices frequently, and structure matters: a **share** deal and an **asset** deal have very different capital-allowances consequences. Pre-sale, manage the disposal value and the **s.198 election** on any fixtures, and advise on the share-vs-asset structure. The **SIPP/SSAS pension-ownership** arrangement is a recurring advisory point (the dentist's pension owns the premises let to the practice). The strongest product lines are the **squat fit-out claim** (high yield, well-documented), the **fixtures-vs-chattels top-up** on existing practices (capturing un-pooled embedded services), and **pre-sale election management**. Keep estimates conservative and evidence the fixtures-vs-chattels boundary.

---

## 11. Open items to validate before go-live

- [ ] CTA sign-off on the **fixtures-vs-chattels boundary** (§4 / Q21) — above all the **dental chair/unit** and the **dedicated chair-position services**. This is the central and most contestable technical call in the module.
- [ ] Confirm the **SIPP/SSAS owner and connected-party-lease treatment** (Q4/Q5), including the connected-party contribution (s.532).
- [ ] Confirm the **deal-structure gate** (share vs asset/goodwill vs property) and the dental-goodwill-saleable position (Q8a).
- [ ] Confirm the **X-ray/CBCT shielding** pool allocation (trade installation vs structural) and the **amalgam-separator** position as a declining fixture (§4).
- [ ] Confirm **VAT partial-exemption** treatment for mixed NHS / private / standard-rated cosmetic practices (Q18).
- [ ] Calibrate the **fit-out / refurb / purchase yield bands** against real dental projects.

---

## Sources & references

**Legislation (CAA 2001 unless noted):** s.11; s.21–22; s.33A integral features; s.33B / 50% rule; s.35 dwelling-house restriction (property businesses & special leasing — **not** trades/professions, so essentially off for a dental practice); s.62 / s.185 caps; s.187A and FA 2012 Sch 10 fixtures rules; s.198/199 elections and s.201 content; s.532 / s.537–538 (contributions); s.562 apportionment; SBA (FA 2019); Full Expensing and the 50%/40% FYAs (FA 2023 and subsequent); Land Remediation Relief (CTA 2009 Part 14). **HMRC manuals:** CA22340 (integral-features repairs / 50% test); BIM35480 / PIM2020 (repairs vs capital); CA20000-series (fixtures and the burden of proof). **Dental / clinical standards:** HTM 01-05 (decontamination in primary dental care); Ionising Radiations Regulations 2017 (dental X-ray / CBCT). **Mercury / amalgam:** retained EU Regulation 2017/852 (amalgam separators mandatory in GB since 1 January 2019; encapsulated amalgam only); EU Regulation 2024/1849 (EU amalgam-use ban from 1 January 2025; manufacturing/import restrictions to 1 July 2026); the UK's position differs post-Brexit (draft Control of Mercury (Enforcement) (Amendment) Regulations; Northern Ireland follows EU rules under the Windsor Framework); Minamata Convention global phase-out date of 2034 (set at COP6, November 2025). **Pensions / ownership context:** SIPP/SSAS holding of commercial property let to a connected trading practice (a registered pension scheme is a non-taxpayer for these purposes). **Case law:** *SSE Generation Ltd v HMRC* **[2023] UKSC 17** (Supreme Court — do not cite the lower instances); *Urenco Chemplants Ltd v HMRC* **[2022] EWCA Civ 1587** (Court of Appeal — the Upper Tribunal decision was reversed); *Cheshire Cavity Storage 1 Ltd v HMRC* [2022] EWCA Civ 305; *Bowerswood House Retirement Home Ltd v HMRC* [2015] UKFTT 94; *Glais House Care Ltd v HMRC* [2019] UKFTT 59; *Tapsell & Lester v HMRC* [2011] UKFTT 376; *JD Wetherspoon plc v HMRC* [2012] UKUT 42; *Law Shipping Co Ltd v CIR* [1923] 12 TC 621. Rates verified 14 June 2026 (main-pool WDA 14% from April 2026; special-rate 6%; AIA £1m; Full Expensing 100% and 50% FYA for companies; 40% FYA from January 2026 including unincorporated businesses; SBA 3%; corporation tax 19–25%). All figures indicative and subject to validation; client-facing output to be conservative. **This is a technical reference, not tax advice.** **Citation control:** see Module 00, Sources — cite the instance that is still good law, and say which instance a paragraph number comes from.
