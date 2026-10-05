# Module 00 — Master Engine: Consolidated Specification

**What this is:** the shared, sector-agnostic core of the assessment software — the entitlement question flow, the mechanics of building and capping a claim, the cross-cutting fixture taxonomy, the universal gates and failure modes, and the output framework — extracted once from Modules 01–05 so the sector modules stop repeating it. Each sector module now reduces to a **delta** on top of this engine (see §8).

**Why this exists:** stress-testing five sectors (care homes, dental, supported living, GP/primary care, private hospitals/clinics) proved that roughly two-thirds of the logic is identical across all of them. This document is that identical two-thirds, harmonised. It is the **build baseline**: the shared engine is written once in code and reused; the sector modules supply only what changes.

**Status:** Current as of June 2026 (post-Autumn 2025 Budget rates). Indicative technical reference, **not tax advice**. The consolidated sign-off register (§11) lists everything a tax specialist (CTA) and chartered surveyor must confirm before go-live. In a live claim the *valuation* is signed off by a chartered surveyor and the *filing position* by a tax specialist.

> **Question tags:** `[GATE]` = wrong answer kills/reduces the claim (block or route). `[BRANCH]` = changes the path. `[MODIFIER]` = changes size/speed/type of relief. `[FLAG]` = route to specialist review. `[STOP]` = likely no/minimal claim — return a reasoned negative.
> **Pool tags:** `MP` = main pool (14% from Apr 2026, was 18%); `SR` = special rate / integral features (6%); `SBA` = structures & buildings (3% straight-line).

---

## 1. Architecture — the two-layer model

**Layer 1 — this master engine (always on).** Every assessment runs the core entitlement flow (§2), the figure-building and capping mechanics (§3), the repairs analysis (§4), the cross-cutting taxonomy (§5), the adjacent reliefs (§6) and the universal gates/failure modes (§7).

**Layer 2 — the sector module (locked/unlocked).** A single early routing question — *what is the property/business type?* — unlocks one sector module (§8), which supplies three things and parameterises one gate:
1. the **sector-specific gates** (e.g. NHS grant election for GP; charity check for private hospitals);
2. the **fixture taxonomy delta** (the specialist plant unique to that sector, on top of §5);
3. the **yield bands** for the indicative estimate;
4. the **behaviour of the dwelling-house gate** (§2B), which is the one core gate whose severity is set entirely by sector.

**Three possible outputs** (§10): an **indicative estimate**, a **reasoned negative** ("little or no claim, because…"), or a **specialist-review referral**. The engine must support all three — the reasoned negative is as valuable as the estimate.

---

## 2. The Master Entitlement Engine (shared CORE question flow)

### A. Claimant, ownership & structure

| # | Question | Type | Determines / action |
|---|---|---|---|
| C1 | Legal structure? (sole trader / partnership / LLP / Ltd / charity / CIC / other) | `MODIFIER` | Which allowances apply. Full Expensing, 50% FYA and Land Remediation Relief = **companies only**; AIA / 40% FYA / WDAs = all. Charity/CIC → likely non-taxpayer (C3). |
| C2 | Does the claimant (or its group / common control) operate **multiple properties**? | `MODIFIER` | The **£1m AIA is shared** across a group and across commonly-controlled businesses. Affects speed, not entitlement. |
| C3 | Is the claimant a UK taxpayer (income/corporation tax) and **not** a charity, pension fund, REIT (on its property income) or other exempt body? | `GATE` | Non-taxpayer → **no claim** (but may matter on the sell side, §10). Catches charitable operators, pension/REIT/NHS landlords. |
| C4 | Accounts on cash basis or accruals? | `GATE` | Cash basis (sole trader/partnership) → **no property fixtures claim** (cars only). |
| C5 | Who **owns** the property, and who **occupies / incurs the expenditure**? (owner-occupier / PropCo–OpCo / investor-landlord–tenant / pension (SIPP-SSAS) / REIT / NHS body) | `GATE` `BRANCH` | The "who can claim" determination. Owner-occupier → simplest. Tax-exempt owner (pension/REIT/NHS/charity) → **owner can't claim; the trading tenant claims its own fit-out**. PropCo/OpCo → C5a. |
| C5a | (If split / leased) Is there a **formal lease** giving the occupier an interest, and who **incurred** the fit-out? What does the lease say about a **landlord contribution**? | `GATE` | A tenant can claim on fit-out it pays for (even a short lease). **Traps:** licence/no-lease weakens entitlement and can trigger a **constructive distribution** in a PropCo/OpCo; poorly-drafted leases can leave **neither** party able to claim; a **landlord contribution reduces the tenant's qualifying spend** (s.532), the landlord claiming contribution allowances instead (s.537–538). **F-7: the contribution must be captured as a number and actually deducted in Stage 1 — "flag for lease review" alone is not a mitigation; every one of Care Homes, Dental, GP and Private Hospital had this as a note only, producing an estimate gross of a deduction the artefact itself said applied.** |
| C6 | Has there been (or will there be) a **sale-and-leaseback**? | `BRANCH` `FLAG` | Disposal event → fixtures election + potential **balancing charge** for the seller (s.187B(6)). Route to specialist (§10). |

### B. Property & the dwelling-house test — *parameterised by sector (§8)*

The dwelling-house restriction (**s.35 CAA 2001**) denies plant & machinery allowances on plant *for use in a dwelling-house* **only where the qualifying activity is a property business (letting) or special leasing — not a trade.** Two axes:

| # | Question | Type | Determines / action |
|---|---|---|---|
| C7 | Is the claimant running a **trade** in the property, or **letting** it (a property business)? | `GATE` `BRANCH` | **Trade** (care operator, dental/GP practice, hospital operator, owner-occupier) → s.35 doesn't apply → no dwelling-house restriction. **Letting** (investor/PropCo) → s.35 applies → C7a bites. |
| C7a | Is the occupied space a **dwelling-house** (a self-contained home: own kitchen/bathroom/living space, occupied under a tenancy) or an **institutional / commercial setting** (rooms in a care setting, clinical/commercial premises)? | `GATE` `BRANCH` `STOP` | **Institution / commercial** → not a dwelling → full claim available. **Self-contained dwelling(s)** → restricted: only **communal parts of a building with 2+ dwellings** qualify, costs must be **segregated** (the *Hora Tevfik* trap); a single dwelling is usually a `STOP`. Central systems serving common parts are claimable; the part serving individual dwellings is excluded (HMRC CA23060). |
| M00-C8 | Mixed use — any **residential element** (e.g. flat above)? | `BRANCH` | Apportion out the residential part. |
| C9 | Is the operation **regulated/registered** (CQC / RSH / Ofsted / CIW / HIW)? | `MODIFIER` (evidence) | Supports the trade-vs-letting and institution-vs-dwelling characterisation. *Wales has two distinct regulators depending on sector: CIW (Care Inspectorate Wales) for social care — care homes, supported living; HIW (Healthcare Inspectorate Wales) for independent healthcare — dental, private hospitals/clinics. Neither is a substitute for the other.* |

> **Sector parameterisation of this gate:** essentially **off** for trades in clinical/commercial premises (dental, GP, private hospitals); a **two-axis branch** for care homes (trade vs letting; institution vs extra-care); **dominant and often terminal** for supported living (dwellings let to tenants). See §8.

### C. Transaction & expenditure

| # | Question | Type | Determines / action |
|---|---|---|---|
| C10 | What triggered the claim — **purchase / new build / fit-out / refurbishment / extension**? (can be more than one) | `BRANCH` | Purchase → s.562 apportionment + entitlement history (§D) + caps (§3). New build → P&M first, then SBA on residual; prelims/fees apportion (§3). Fit-out/refurb → direct invoice analysis + the repairs split (§4). |
| C10a | (Acquisition) What is the **deal structure** — asset/property purchase, or a share sale? | `GATE` `BRANCH` | **Share sale** → the company keeps its existing pools; **no new claim event** (run §D only on a genuine property purchase). Goodwill/intangibles are not plant. |
| C11 | Approximate **amount(s) and date(s)**? | `MODIFIER` | Sizing + timing/amendment window + relief-lever choice (§3). |
| C12 | Is **cost information** available (sale contract, build/M&E breakdown, invoices)? | `MODIFIER` | Shapes method (invoice analysis vs valuation apportionment); missing detail doesn't kill the claim. |
| C13 | (Refurb) Any **like-for-like repairs/renewals** rather than improvements? | `BRANCH` | Split out **repairs** → 100% immediate revenue relief, separate from and on top of allowances (§4). |
| C14 | Was the property **acquired run-down/dilapidated and repaired before use**? | `FLAG` | The **Law Shipping trap** — such repairs are usually **capital** (§4). |
| C15 | Did works involve **asbestos / contaminated / derelict land**? | `BRANCH` | Potential **Land Remediation Relief** (companies, 150% — §6). |

### D. Entitlement history — *conditional: only on a genuine second-hand property purchase*

> Skip this whole block for fit-outs, refurbishments, new builds, share sales, and asset/goodwill sales without property. It fires only when a second-hand **property/freehold** changes hands.

| # | Question | Type | Determines / action |
|---|---|---|---|
| C16 | Has any **previous owner claimed** capital allowances on the fixtures? | `GATE` | Drives pooling/fixed-value analysis + the s.185 cap (§3). |
| C17 | Was a prior owner **able** to claim (taxpaying business), or a **developer holding as stock** / **tax-exempt body** (pension/charity/REIT/NHS)? | `GATE` / opportunity | Prior owner could claim → must have **pooled** + a valid **s.198 election**, else buyer entitlement = **nil**. No prior entitlement → **fresh s.562 claim** (best case). |
| C18 | Prior **connected-party / group** transfers? | `FLAG` | Can silently destroy entitlement. Route to specialist. |
| C19 | Existing **s.198 election**, and at what value? | `GATE` | Validity: **fixtures only** (loose items invalidate it), submitted **within 2 years**, s.201 content, **irrevocable** once accepted. A low value **caps** the claim. |
| C20 | Did the seller **acquire before April 2008**? | opportunity | Seller couldn't have claimed integral features → buyer may get an **integral-features uplift (~15%)**. |
| C21 | What do the **CPSE replies** say on capital allowances? | evidence | Documentary evidence; blanks = investigate. **Burden of proof is on the buyer** to show the seller didn't claim (*Tapsell*). |

### E. Funding & timing

| # | Question | Type | Determines / action |
|---|---|---|---|
| C22 | Any **grant or subsidy** funding? | `MODIFIER` / `GATE` | Grant-funded expenditure is **excluded**. *Sector special case:* for **GP practices**, NHS improvement grants are **mutually exclusive with allowances per cost element** and abate notional rent (§8). |
| C23 | Was VAT charged and is it **irrecoverable**? | `MODIFIER` | Irrecoverable VAT is **included** in qualifying expenditure. Healthcare is largely **VAT-exempt**, so this is usually a meaningful uplift — but watch **partial exemption** (cosmetic / dispensing / NHS-contract mixes). *Corrected 12 September 2026 (Phase 129): this used to say "plus SDLT and fees on a purchase". Whether the transaction tax, and the legal and incidental costs of acquiring, are part of the price apportioned is an open question for the tax adviser. The engine adds neither: each is built behind its own switch, and both are off.* |
| C24 | Tax year — is the relevant return still **amendable**? | `MODIFIER` | In time → 100% first-year reliefs available, possible refund. Out of time → WDAs going forward (allowances slower, not lost). *Corrected 12 September 2026 (Phase 129): out of time, that route (Rulebook A's W2, current-period pooling) needs the property **known** to be still owned. Sold → nothing through this route (W3). Ownership "not sure" or never asked → no route and no cash figure until it is confirmed; the two behave identically. A loss carried back produces a repayment only on a route that is actually open, W1 or W2.* |

### F. Prior claims

| # | Question | Type | Determines / action |
|---|---|---|---|
| C25 | Has the current owner / accountant **already claimed** on this property's fixtures or loose equipment? | `GATE` | Allowances claimable **once** per fixture; avoid double-counting. Loose-equipment (chattels) claims don't preclude an embedded-fixtures claim. |

---

## 3. How the claim figure is built — and capped (shared)

**Purchase claims (no s.198 election).** A **CAA 2001 s.562 "just and reasonable apportionment"** of the price (incl. irrecoverable VAT — and SDLT and acquisition fees only if the tax adviser confirms they belong in the consideration; *corrected 12 September 2026 by Phase 129, see C23*) between land, building/setting, and qualifying plant. The tribunal-endorsed method (*Bowerswood House Retirement Home Ltd v HMRC* [2015] UKFTT 94) is the **VOA apportionment formula**, valuing all assets on the same replacement-cost basis:

> Qualifying P&M ≈ Purchase Price × [ replacement cost of P&M ÷ (replacement cost of P&M + replacement cost of building excluding P&M) ], land valued separately.

**The caps (where a prior owner claimed):** **s.185** limits the buyer to the **seller's disposal value**; **s.62(1)** caps that disposal value at the seller's **qualifying expenditure** on the plant — **not simply "original cost"/gross spend (F-9)**: qualifying expenditure is net of any s.532 contribution the seller (or an earlier owner) received, so a past-owner grant lowers the s.62 ceiling below what their apparent purchase/build price suggests. **s.62(3)** extends the same ceiling to the greatest qualifying expenditure incurred by any party across a whole chain of connected-person transactions, not just the immediate seller — read s.62 in full before wiring this (verified against legislation.gov.uk 24 Aug 2026: as-enacted and current text are word-for-word identical, so there is no drift to correct; s.62A is a narrow foreign-branch-exemption provision, not part of this chain, and is out of scope). The **burden of proof** is on the buyer (*Tapsell & Lester v HMRC* [2011] UKFTT 376). Confirmed in a care-home purchase by *Glais House Care Ltd v HMRC* [2019] UKFTT 59 — apportionment correct, but capped under s.62.

**Fit-out / new build / refurb claims.** Built **directly from invoices / M&E cost packages**, allocated across pools. **Preliminaries & professional fees apportion to qualifying P&M** (*JD Wetherspoon plc v HMRC* [2012] UKUT 42) — routinely missed.

**Relief levers — decision logic:**

| Lever | Rate | Who / what | When it applies |
|---|---|---|---|
| AIA | 100% (£1m, shared across group) | All; main + special rate | Return in time; ≤ £1m. Best aimed at **special-rate** items when Full Expensing covers main-rate. |
| Full Expensing | 100%, uncapped | **Companies only**; **new** main-rate plant | Large projects > £1m (e.g. hospitals). Not second-hand. |
| 50% FYA | 50% year 1 | **Companies only**; **new** special-rate | Special-rate above the AIA. Not second-hand. |
| 40% FYA | 40% year 1 | All (incl. unincorporated, leased); **new** main-rate | From 1 Jan 2026. Not second-hand. |
| WDAs | 14% main / 6% special, reducing balance | All | Balance, out-of-time claims, and **all second-hand** plant (e.g. embedded fixtures in a purchase). |
| SBA | 3% straight-line | All | Non-residential structure, post-29-Oct-2018 construction/renovation (§6). |

> On a **second-hand property purchase**, Full Expensing and the FYAs don't apply (second-hand) — the levers are **AIA or WDAs**. On a **large new build/fit-out by a company**, Full Expensing + 50% FYA dominate and AIA is directed at special-rate.

**Tax saving** = qualifying expenditure × marginal rate (income tax up to 45%, higher in Scotland; corporation tax 19–25%).

---

## 3c. Rates come from one place

Every rate this framework asserts comes from **Rulebook I — "Rates and Reliefs Table with Basis
Dates"** (board item 12830060773). Rulebook I rule 7.1: no engine, model, report template or
marketing asset may state a rate that is not in that table.

The engine holds them in a single `CB_RATES` module. Before this, `MARGINAL_RATE` and
`RATE_BASIS` were declared **once per sector module — five times** — and the basis dates had
already drifted apart: three said "14 June 2026" and one said "11 June 2026". Five copies of a
constant is five chances to be wrong, and it had already happened.

Three substantive corrections came out of the consolidation:

1. **The company marginal range is 19% to 26.5%.** All five copies said 19% to 25%. The effective
   rate between the £50,000 and £250,000 limits is **26.5%**, derived from the main rate and the
   3/200 standard fraction, and Rulebook I finding I-11 records it as *"the figure the drifted copies
   most often got wrong"*. It is the correct multiplier for most Caprebate corporate clients.
2. **The main-pool WDA is a function, not a constant.** 18% before, **14%** for chargeable periods
   beginning on or after 1 April 2026 (CT) / 6 April 2026 (IT), with a **day-count hybrid** for any
   straddling period (CA23222, rounded up to two decimals). `CB_RATES.hybridMainRate()` implements
   it and reproduces HMRC's worked example exactly (1 Jan – 31 Dec 2026 → **14.99%**).
3. **The 60% effective income-tax band is deliberately not modelled.** The personal-allowance taper
   creates an effective 60% rate between £100,000 and £125,140 (finding I-12). Rulebook I **open
   question I-Q2** asks whether to model it explicitly or present a conservative 45% and treat the
   excess as upside. Until that is answered the engine takes the conservative option **and says so in
   the reveal**, so the client is not left to discover it.

> **Scotland — closed 25 August 2026 by the Rulebook I addendum** (board item 12889350666), verified
> against gov.uk and gov.scot and cross-checked. It is worth recording what the consolidation found,
> because the error was invisible while the same numbers sat in five separate places.
>
> **The engine said `[0.21, 0.48]`. Both ends were wrong.**
>
> - The floor is the **starter rate, 19%** — not 21%. Scotland's 21% is its *third* band
>   (intermediate), not its lowest marginal rate. The engine had been understating the bottom of
>   every Scottish range.
> - **48% is right only from 2024-25.** It was **47%** in 2023-24 and **46%** in 2022-23. Any claim
>   valued against an amended earlier year was overstated at the top of the range.
>
> **Scotland moves more than rUK, so rule 7.2 is not optional here.** `CB_RATES.SCOTLAND_BY_YEAR`
> carries five verified years with full band structures, and `rangeForYear()` returns the rate in
> force for the period being amended. Note the band *count* changes too — the Advanced rate was
> introduced in 2024-25, so there are six bands from then and five before.
>
> **The effective taper band is 67.5%, not 60%.** The personal allowance is reserved and is withdrawn
> UK-wide at £1 per £2 above £100,000 — but the income in that zone is taxed at the *Scottish*
> marginal rate. From 2024-25 that zone sits entirely inside the Advanced rate, so by the same method
> Rulebook I uses for rUK (marginal × 1.5): **45% × 1.5 = 67.5%**. It was 63.0% in 2023-24 and 61.5%
> in 2022-23.
>
> **67.5% is the highest effective marginal rate anywhere in the UK**, and it lands squarely on the
> client this business sells to — a Scottish GP partner or dental principal drawing in the six
> figures. As with rUK's 60% band, it is **not modelled** in the figure (Rulebook I open question
> I-Q2 is unanswered), but the reveal now names it so the client is not left to discover it.

## 3b. An asserted election is not an election

The fixed-value requirement is satisfied by a **valid election that we hold**, not by a client's
recollection that one was made. Three propositions, in order:

1. **s.187B(1) puts the burden on the client.** "The seller says there was one" is not evidence. If
   the notice cannot be produced the position is **INDET**, not CAP-ELECT, and the claim cannot be
   sized on it.
2. **An invalid election is not an election.** It does not cap the claim at the figure it states — it
   leaves the fixtures it purports to cover at **nil**. The six content requirements are tested
   individually so the failure can be named: a quantified amount (s.201(2)); the plant identified
   (s.201(3)(c)); the land identified (s.201(3)(d)); the interest or lease particularised
   (s.201(3)(e)); both tax references or a statement that a party has none (s.201(3)(f)); and made
   jointly (s.198(2)).
3. **Invalidity inside the two-year window is an opportunity, not a loss.** Irrevocability bites only
   on valid elections (s.200(3)), so where there is no valid election there is nothing to revoke and
   a fresh one can be made. Outside the window the same defect is terminal.

The output must therefore distinguish **four** states that previously collapsed into one figure:
a valid election (capped); a defective election with the window open (**LIVE** — the most valuable
state we can find); a defective election with the window closed (nil, with a named reason); and an
election we have not seen (INDET, with a document request).

### The pool split must come off the election, where the election says

CA26850 requires an election to distinguish fixtures qualifying at the **special rate** from those
qualifying at the **main rate**. An election stating a single undifferentiated figure across both is
therefore a **weakness in the document itself** (Rulebook C row E-B10), not merely an inconvenience
downstream — and it is the prerequisite for the tax-timing layer, because Full Expensing is new
main-rate only and the 50% FYA new special-rate only.

**Row E-B10 is subtler than the other validity rows, and the engine treats it accordingly.** A
missing split does **not** mean the fixed-value requirement fails: the election can be perfectly good
as to quantum in total. What is unsafe is the **split**, and therefore the **timing**. So a
single-figure election still caps the claim at its stated amount; it carries a `splitRisk` marker,
and the named action depends on the window:

| Window | Action |
|---|---|
| Open | Re-elect with the two pools distinguished. The quantum is not at risk; the timing and the CA26850 position are |
| Closed | The split cannot be corrected by re-election. The elected total stands; the allocation between pools goes to the surveyor and the CTA |

**Where the election does state a split, it is the best pool evidence available** — it is a figure
both parties agreed and filed. It therefore feeds §3a's pool model directly at the `measured` basis,
which is the one basis permitted to drive a client-facing pool figure.

> **One restriction, and it matters.** An election split feeds the *whole-property* pool model **only
> where the election covers the fixtures generally**. Where the election is scoped to a schedule
> (see the element-by-element point above), its split describes **the elected items alone** and must
> not be applied to the whole figure. The engine enforces this.

### s.203 — the duty our own work creates

Where an election is made, or where s.200(4) has rewritten an earlier one downwards, **a return
already filed may have become incorrect as a result.** s.203 requires the person to give notice to
HMRC **within three months of becoming aware** of that. Failure is penalised under TMA 1970 s.98.

This runs **against our own client**, and our analysis is frequently what triggers it: a client who
has never heard of s.203 can acquire an affirmative obligation because of diligence we performed.
Naming it in the deliverable is both correct and protective — it is the difference between having
advised on the position and having created an exposure the client did not know about.

**The clock starts when the client becomes aware, which in practice is when our report is issued.**
Both reports therefore carry a named s.203 section (Report Pack §4.3), recording the position, the
trigger, the affected return, the date of awareness, who acts, and the consequence. Where no
obligation arises, the section says so — recording that the question was asked is worth as much as
raising the duty.

Caprebate does not make the notification. The client does, through their own accountant.

### An election covers what it covers — element by element

The fixtures rules operate **asset by asset**. CA26850 accepts a degree of amalgamation where it will
not distort the computation, but is explicit that since integral features were introduced it is
necessary to distinguish special-rate from main-rate fixtures — and that a single election covering
the fixtures across a **portfolio** of properties has never been regarded as acceptable.

The consequence runs in the client's favour, and it is worth stating in one line because the engine
previously got it backwards:

> **An election listing four items at £1 does not extinguish a claim on the twenty items it does not
> mention.**

Fixtures outside an election's scope are governed by whichever entitlement branch applies to them
**on their own facts**. Treating a scoped election as though it covered everything writes off claims
that were never elected away. Rulebook C calls this one of the few places in the whole engine where
careful reading creates value rather than removing it.

The engine therefore carries `election_scope` and caps accordingly:

| Scope | Cap behaviour | Why |
|---|---|---|
| `listed_items` — a schedule of specific items | Floor at the elected figure; **ceiling stays at the band** | The elected figure binds the items it names and nothing else. Without the schedule the split cannot be sized, and narrowing the range would write off unelected fixtures |
| `all_fixtures` — a general description | Cap applied across the range | The old behaviour, now actually justified rather than assumed |
| `unclear` | Conservative (treated as `all_fixtures`) **and flagged** | Obtaining the schedule can only ever increase the claim from here |

**This also gates the nominal reasoned negative.** A £1 election scoped to a schedule does *not*
produce the C-5 early exit, because the claim is not dead — only the items it names are. The
reasoned negative fires where the election covers the fixtures generally, or where scope is unclear.

**Row E-B11 — one election across several properties** is treated as a validity defect: LIVE inside
the two-year window (re-elect separately per property), INDET and referred outside it.

### Nominal elections are valid — and they are the answer more often than anything else here

**A £1 election is valid.** Neither s.198(3) nor s.199(3) contains a floor; both set only a ceiling.
HMRC's own worked example at CA26850 has an exempt charity and its seller agreeing a nominal figure
on solar panels precisely so the position can be handed on, and treats that as an ordinary and proper
use of the provision. A floor at tax written-down value was consulted on in 2011 and **was not
enacted**.

So a nominal election:

- **is valid**, and satisfies the fixed-value requirement;
- **is irrevocable** (s.200(3)) — there is no variation mechanism, and TMA 1970 s.42, including the
  s.42(9) supplementary claim on discovering a mistake, is expressly disapplied by s.201(5);
- **fixes the disposal value for s.185**, which means it **binds every subsequent owner** of the
  property, not merely the party who signed it.

For a business built on retrospective recovery this is the single most important fact to establish
early. The engine therefore **exits at the election-value question** with a reasoned negative rather
than walking the client through the remaining flow to a figure of a few pounds. Rulebook C is
explicit that a well-reasoned negative is a deliverable, not a failure — and commercially it is the
answer that generates referrals.

**Two things survive a nominal election** and the output must say so, because neither is affected by
it: fixtures **outside the election's scope**, which are assessed on their own facts because the
fixtures rules work asset by asset (see the element-by-element point below); and the client's **own
s.25 installation and alteration spend**, which sits on top of the elected figure rather than inside
it (s.185(3)).

> **The de minimis threshold is commercial, not statutory.** There is no de minimis in the
> legislation. The engine treats an election as nominal at or below **£1,000**, or below **0.5%** of
> what was paid for the property. Those numbers decide only whether we stop early; they decide
> nothing about entitlement, and they are meant to be tuned against real pipeline data.

### Which section — and the market shorthand that is wrong

**"s.198 for a freehold, s.199 for a lease" is what the trade says, and it is not what the statute
does.** The section is determined by which item of the s.196 disposal-value Table the transaction
falls into, and HMRC puts **both item 1 and item 9 under s.198** (CA26800):

| s.196 Table item | Transaction | Section |
|---|---|---|
| **1** | Sale of the qualifying interest at not less than market value | **s.198** |
| **9** | Incoming lessee pays a premium at or above market value, **and no s.183 election was made** | **s.198** — a *lease*, under s.198 |
| **5** | Incoming lessee pays a premium **and** lessor and lessee make a joint **s.183 election** | **s.199** |
| **2 / 3** | Not at market value | **No election is available at all.** District valuer route |

So the discriminator on a lease is not that it is a lease. **It is whether a s.183 election was
made** — a different document from the fixtures election itself, granted at the time of the lease.
The engine therefore captures `transaction_type` and `s183_election_made` rather than inferring
the section from the tenure.

Two consequences:

1. **An election made under the wrong section is not a valid election** (Rulebook C row E-B9). Inside
   the two-year window it can be remade under the correct one — a **LIVE** opportunity. Outside it,
   there is no route to correct it, and the position goes to specialist and CTA review (Rulebook C
   open question 3).
2. **On a below-value transfer no election was available**, so a document describing itself as a
   s.198 election has no statutory effect. That does not make the claim nil — it means the value is
   settled through the district valuer instead, and the engine must not cap on the document.

### The two-year limit, and the provision it is constantly confused with

s.201(1): an election **has no effect** unless notice of it is given to HMRC within **two years** of
the acquisition or the grant of the lease. Two points the engine had no way to hold, and both change
answers:

**1. The limit runs to notification, not to signature.** A document dated inside the window that was
notified outside it is out of time, however well drafted it is. `election_notified_date` is
therefore a field in its own right, separate from any date on the face of the document, and it is
what the test reads.

**2. s.201(1) is not the s.187A fixed-value-requirement window.** Both run two years from the same
event, which is exactly why they get conflated — but they do different work:

| | **s.187A(7)** | **s.201(1)** |
|---|---|---|
| Governs | Whether the fixed-value requirement can still be satisfied **at all** | Whether **this election** has effect |
| Owned by | Module B / the entitlement branch | Module C / this engine |
| Failure means | The FVR route closes; other routes may remain | This document is a nullity |

One can fail while the other holds. Modelling them as a single "two-year window" flag produces the
right answer often enough to look correct and the wrong answer where it matters.

**s.201(1A) switches the limit off** where an application was made to the tribunal under
s.187A(7)(a) **within the period** and is still undetermined (Rulebook C row E-B3). The
qualification does the work: a later application does not revive an election that was already out of
time, so the application date is captured and tested, not assumed.

**One filing point that is not a validity failure.** Failing to file a copy with the first affected
return (s.201(4)) is a filing default, not an invalidity — the election stands. Rulebook C flags this
as CTA question 1; do not treat it as fatal.

## 3a. Pool split is part of the entitlement result, not a downstream presentation choice

Qualifying expenditure must be returned split between the **main pool** and the **special rate
pool**, with the evidential basis of that split carried alongside it. Three things depend on it
and none of them can be done from a single blended figure:

1. **Writing-down rates differ** — main pool and special rate are written down at different
   percentages, so lifetime relief arrives on different timelines.
2. **First-year reliefs are pool-specific** — Full Expensing is new **main-rate** plant only;
   the 50% FYA is new **special-rate** only. Neither can be sized without the split.
3. **s.198 election validity** — HMRC's stated position at CA26850 is that since the
   introduction of integral features it is necessary to distinguish fixtures qualifying at the
   special rate from those qualifying at the main rate. A single undifferentiated figure is a
   validity risk on the election itself, not merely a presentational shortcoming (Rulebook C
   row E-B10, board item C-8).

The pool tag lives on the taxonomy row (`pool` in `Caprebate-Fixture-Taxonomy-v1.csv`) and
follows the statutory route, not the trade narrative: s.33A(5) integral features and long-life
assets are `SR`; everything else that survives ss.21–25 is `MP`. Rows tagged `APPORTION` are
open pool calls for the surveyor and must never be defaulted to either pool by the engine.

**No ratio is asserted where none has been evidenced.** Where no M&E schedule or priced element
breakdown has been supplied, the split basis is `"unknown"`, the two pool figures are `null`,
and the engine raises `POOL_SPLIT_NOT_DETERMINED` rather than guessing. See Build-Prep-05
Stage 4b.

## 4. Repairs vs capital — the revenue line (shared)

On a refurbishment, expenditure splits into **revenue repairs** (100% immediate deduction) and **capital** (capital allowances). The **entirety test** (HMRC PIM2020 / BIM35480 / CA22340): replacing **subsidiary parts** of the whole asset = repair; reconstructing **substantially the whole "entirety"**, or **improving** the asset's character beyond the nearest modern equivalent = capital.

- *Law Shipping Co Ltd v CIR* [1923] 12 TC 621 — repairs to a newly-acquired **dilapidated** asset, needed before use = **capital** (the Law Shipping trap, C14).
- *Conn v Robins Brothers Ltd* [1966] 43 TC 266 — repairs to part of a building = **revenue**.
- *Brown v Burnley Football & Athletic Co Ltd* [1980] 53 TC 357 — replacing a distinct entity = **capital**.
- **Integral-features 50% rule (s.33B / CA22340):** spend on an integral feature exceeding **50% of the cost of replacing** it (within 12 months) is treated as **capital**, not repair.

---

## 5. The cross-cutting fixture taxonomy (shared base)

Every sector module adds its specialist plant on top of this base. Pool allocation is subject to the statutory **function test**.

> **The two rescues are not equivalent, and they run in a fixed order.**
> ss.21–22 exclude almost everything a building contains. Two provisions carve items back out,
> and treating them as interchangeable is what caused the taxonomies to overstate every sector:
>
> | | **s.23(2)** | **s.23(3) — List C** |
> |---|---|---|
> | What it does | **Treats the item as plant** | **Lifts the exclusion only** |
> | Common-law test | Does **not** run | **Still runs**, on this trade's facts |
> | Covers | Integral features (s.33A), thermal insulation (s.28), personal security (s.33), software | The 33 List C items |
> | Pool | Special rate | Main rate unless separately an integral feature |
> | Row field | `rescue_route = s23_2_integral` / `s23_2_other` | `rescue_route = list_c_N` |
>
> **s.23(2) is resolved before s.23(3) (Rulebook D §3, P3 before P4).** The order is not
> presentational. If an item is an integral feature the analysis stops there and it qualifies; there
> is no need to find it in List C and no need to prove it functions as plant. An engine that reaches
> for List C first will apply the common-law test to lighting, ventilation and cold water — items
> Parliament removed from that test in 2008 — and will lose claims it should have won.
>
> Conversely, **List C membership changes the question from "is it excluded?" to "is it plant?" It
> does not answer the second question** (HMRC CA21010). A List C row with no function finding is nil,
> not the list-derived percentage.
>
> `Caprebate-Fixture-Taxonomy-v1.csv` carries `s21_status`, `s22_status`, `rescue_route` and
> `common_law_required` on every row so the distinction is machine-readable rather than implied by
> which paragraph of prose a row happened to sit under.

**Integral features — special rate (`SR`, 6%):** electrical & lighting systems; cold water system; space/water heating, powered ventilation/air-cooling/air-purification (and floors/ceilings forming part of such systems); passenger lifts; external solar shading; thermal insulation added to an existing building; long-life assets.

**General plant & fixtures — main pool (`MP`, 14%):** sanitaryware & fitted washroom fittings; fire alarm/detection; security (CCTV, intruder alarm, access control); signage; demountable partitioning; window blinds; carpets/floor coverings; fitted furniture, cabinetry, reception desks; data/comms cabling; door ironmongery; stair nosings; alterations incidental to installing plant.

**Structure (residual) — `SBA` (3%):** walls, floors, foundations, roof-as-structure, doors, windows, stairs — non-residential, post-29-Oct-2018. CGT base-cost interaction applies (SBA reduces base cost on sale; P&M does not); a buyer needs the seller's **allowance statement**.

> **Durability — the two-year test.** An asset with an expected life of under two years is not
> plant. The test is part of the **common-law** enquiry (Rulebook D, P5), which has a consequence the
> old taxonomy could not express: **an item deemed plant by s.23(2) never reaches it.** An integral
> feature qualifies regardless of function, and durability is a question about function. So the
> electrical system, the lift and the ventilation plant are not durability-tested at all, while every
> List C row and every common-law row is.
>
> Every row now carries `durability`:
>
> | Value | Applies to | Meaning |
> |---|---|---|
> | `not_tested` | `rescue_route` in {`s23_2_integral`, `s23_2_other`, `s25`, `excluded`} | Never reaches P5. s.25 works follow the plant they serve, so they inherit its answer |
> | `settled_over_two_years` | Fixed installations reaching the claim through List C or common law | A building-services or clinical installation with a life well beyond two years. Not a live issue |
> | `review_short_cycle` | `category = chattel` | The loose-equipment bundles. **Open — CTA question 7 on Rulebook D** |
>
> **Why the chattel rows are flagged rather than settled.** `LS-DEN-013`, `LS-GP-013`,
> `LS-PH-018` and `LS-SL-012` are *bundles* — "loose dental equipment", "loose GP equipment" — and
> a bundle is not durability-tested as a unit. Some clinical consumables inside them have replacement
> cycles well under two years. Those rows are also the ones the accountant has usually already
> claimed through AIA, so the practical exposure is a double-count on an item that was never plant.
> Rulebook D asks the CTA whether the test presents any live issue in a healthcare context or is
> effectively spent; until that is answered the engine marks and does not decide.

> **The insulate-or-enclose carve-out — s.23(4) and s.33A(6).** Both provisions carry identical
> wording: the rescue does **not** extend to an asset whose principal purpose is to insulate or
> enclose the interior of a building, or to provide an interior wall, floor or ceiling intended to
> remain permanently in place. s.23(4) applies to **List C items 1–16 only**; s.33A(6) applies to
> integral features. It is a *principal purpose* test, so it turns on what the asset is mainly for,
> not on what it incidentally does.
>
> Where it bites in this taxonomy:
>
> - **Moveable partitions** (List C item 13). Item 13 already requires them to be moveable *and
>   intended to be moved*; s.23(4) removes any partition that in truth provides a permanent interior
>   wall. The two conditions together make this a much narrower row than it looks.
> - **Sound insulation** (List C item 7). Item 7 requires the insulation to be provided *mainly* to
>   meet the particular requirements of the trade. If its principal purpose is to insulate the
>   interior, item 7 is unavailable and there is no other route.
>
> **Where it is genuinely unresolved — do not let the engine decide.** s.33A(5)(c) expressly brings
> in *"any floor or ceiling comprised in"* a ventilation system, while s.33A(6) excludes anything
> whose principal purpose is to provide a permanent ceiling. On a plenum ceiling in a clinical area
> these pull in opposite directions, and **which governs is CTA open question 3 on Rulebook D**. The
> affected rows carry `enclose_carveout = open_cta_q3` and must be surfaced as an open call, not
> resolved: care-home underfloor heating, GP enhanced ventilation, and the private-hospital UCV and
> isolation-ventilation rows, plus the shared powered-ventilation row itself.
>
> **One trap worth naming.** Thermal insulation added to an existing building (`LS-SR-007`) is
> *not* caught, because it reaches the claim by s.28 and s.104A(1)(b) rather than through List C or
> s.33A. It is the one insulation product that survives the carve-out, and it survives on a routing
> technicality rather than on its function.

> **Rows with no statutory rescue at all.** Window blinds, carpets and floor coverings, door
> ironmongery and stair nosings appear in the main-pool list above but have **no List C item**. They
> are argued directly against List A item 1 (walls, floors, ceilings, doors, stairs) on the
> common-law test alone, and the taxonomy marks their s.21 position `contested` for that reason.
> They are the weakest rows in the shared base and should not be presented with the same confidence
> as a List C item 5 or item 10 row.

> **Fixtures vs chattels:** loose/movable items (free-standing furniture, mobile equipment) are chattels the accountant typically claims via AIA; the specialist focuses on the **embedded fixtures**. Both can be claimed — avoid double-counting (C25).

---

## 6. Adjacent reliefs (shared)

**Structures & Buildings Allowance (SBA):** 3% straight-line on non-residential construction/renovation cost (post-29-Oct-2018). Slow, with a CGT base-cost interaction — claimed on the residual structure after P&M.

**Land Remediation Relief (LRR):** **companies only** — a **150% deduction** for remediating land/buildings **acquired from a third party in a contaminated/derelict state** (asbestos, knotweed, contamination, buried structures). **"Polluter pays"** — no relief if the claimant/connected party caused it. Loss-makers can surrender for a **16% payable credit** (~24% cash). Needs a major interest (freehold or 7+ year lease). CTA 2009 Part 14.

> Positioning capital allowances + repairs + SBA + LRR together turns a single claim into a **multi-relief review** — more value per client and a stronger differentiator.

---

## 7. Universal gates & failure modes (shared — hard-code as warnings)

**The gates:** (1) taxpayer status (C3) — charities/pensions/REITs/NHS bodies can't claim; (2) cash basis (C4); (3) the **dwelling-house gate** (C7/C7a, parameterised by sector); (4) ownership / who-can-claim (C5/C5a); (5) entitlement history + s.185/s.62 caps (§D, §3); (6) grant funding (C22) — **s.532's general contribution rule, subject to the exceptions at ss.534–536 (F-4)**; (7) prior claim / double-counting (C25).

> **s.532 is not absolute — ss.534–536 (F-4).** Every sector's grant question previously treated ALL contributions the same way (reduce qualifying expenditure), with no branch reachable for the statutory exceptions. Two matter broadly: **s.535** — expenditure met by **insurance or compensation** money for a destroyed/demolished/put-out-of-use asset is treated as incurred **in full**, not reduced. **s.536** — expenditure met by a contribution from someone who is **not a public body** and who gets **no tax relief** for the payment (no capital allowance, and no deduction against trading profits) is also treated as incurred in full; this does **not** apply to SBA (s.536(6)) — **F-8: this is easy to miss once a sector offers SBA as an adjacent-relief pivot, because the SBA branch naturally inherits whatever answer was reached for the P&M grant/contribution question. A contribution that correctly leaves the P&M claim intact under s.536 does NOT correctly leave SBA intact — s.536(6) switches the exception off specifically for SBA, so any SBA-eligible spend within the same project is still reduced by s.532 regardless of the P&M answer. Test s.532/536 separately for the SBA base, never by inheritance.** — and critically it does **not** apply to public-body contributions at all (s.536(2)) — an NHS/local-authority/government grant is never rescued by s.536 and remains fully caught by s.532. **s.534** (Northern Ireland Regional Development Grants) is a narrow historic NI-specific scheme and is out of scope for the live engines. Verified against the statute directly (legislation.gov.uk) rather than assumed, given how easily s.536's "not a public body" condition is missed.

**The failure modes:**
1. Treating a **dwelling** (let by an investor) as fully qualifying — s.35.
2. **Failing to segregate** common-parts costs in a mixed/dwelling model (*Hora Tevfik*).
3. **Invalid s.198 election** — loose items included, or out of time (irrevocable once accepted).
4. **Ignoring the s.185/s.62 caps** and the buyer's **burden of proof** (*Glais House*, *Tapsell*).
5. **Over-claiming repairs** — wrong side of the entirety test, or missing Law Shipping / the 50% rule.
6. **Wrong pool allocation** — main-pool items pushed to special rate or vice versa.
7. **Constructive distribution** in a PropCo/OpCo with no formal lease.
8. **Connected-transfer** entitlement loss.
9. **Ignoring the seller's balancing charge** (s.187B(6)).
10. **Claiming grant-funded** cost elements — **and the mirror-image mistake: stripping out insurance/compensation money (s.535) or a private non-tax-relieved contribution (s.536) as if it were a grant, when neither reduces qualifying expenditure (F-4).**
11. A **charity / non-taxpayer** claiming.
12. **Double-counting** loose equipment already claimed.
13. **Misapplying Full Expensing** to second-hand plant or a non-company.
14. **Over-including VAT** without resolving partial exemption.
15. **An unknown fact silently routed to the most favourable branch (F-2).** Grant status is the recurring example: "not sure" must never quietly default to "assume no grant" (the largest-claim assumption) the way it did in GP/Supported Living, and the *absence* of any stated default (Care Homes/Dental/Private Hospital, where "unsure" simply fell through to `grant_fraction||0`) is the same defect with less visibility, not a safer one. This is the same shape of bug as R-B1's inverted s.187A routing — every gate in this list must route an unknown fact to a flag/specialist-review outcome, never silently to the branch that produces the bigger number.
16. **Assuming a repaid or clawed-back grant restores the relief it originally stripped out (F-11).** ESC/B49, the extra-statutory concession that once softened this, was withdrawn in 2013 — there is no statutory route back. This matters wherever a grant carries a guaranteed-use or recovery period (GP's NHS premises grants, ~6–18 years by grant size; Supported Living's Homes England/SAHP recovery and recycling provisions): a client who later repays the grant, for whatever reason, does not thereby unlock the originally grant-funded spend. State this every time a grant reduction is applied, not just when a client happens to ask.
17. **Assuming the client incurred the expenditure themselves (F-13).** Every question flow in the shared CORE assumes the claimant is the direct payer of the qualifying expenditure — but a client who merely **contributed** towards someone else's plant or machinery (topping up a landlord's central plant; paying towards a shared lift) has a structurally different claim under ss.537–538 (contribution allowances: capped at the contribution, dependent on the contributor's own qualifying-activity use), which this engine does not model. ss.537–538 were cited as an aside in multiple artefacts (usually noting that a landlord who reduces a tenant's claim under s.532 may separately claim contribution allowances) but no flow ever asked whether **our own client** might be the contributor. Every sector must gate on this before any ownership/role question, and route a genuine contributor straight to specialist referral rather than forcing their answer through a flow built for the direct-payer case.

> **Structural note on the `grant_fraction` data model — F-15.** A single percentage-of-spend field is thin for what the contributions regime (ss.532–538) actually needs: a **currency amount** (to reconcile against the grant agreement), a **payer class** (public body vs private, and whether the payer itself gets tax relief — the s.536(2)/(3) conditions), and **traced cost elements** (which specific items the grant funded — the Cyril Lord Carpets/F-1 point). This session added a currency-amount capture alongside the percentage in every sector (`grant_amount`, with an automatic reconciliation flag if the two figures imply materially different totals), which closes the "nothing reconciles to a grant agreement" half of F-15. The **payer-class** and **traced-elements** structure remain genuinely absent: currently "public body vs private, no-relief" is inferred from which option a client picks (`grant_answer`), not independently verified, and there is no per-element list anywhere in the data model. Building those properly is a Tier-2/survey-stage data-model extension, not a Stage-1 question-flow tweak — flagged here rather than attempted, given the scale.

> **Updated 4 October 2026 (Phase 153a) — the two halves the note above calls absent are now built at the survey stage, and the traced half is switched off.** The *payer class* is a closed list on the claim record (the back end's `claim_grants.payer_class`, Rulebook F's eleven classes, checked by the database and by the store since CRM 6 of 10). The *traced elements* are now rows of the fixture list (`Caprebate-Fixture-Taxonomy-v1.csv`, `element_id`) recorded against each grant (migration 078, `claim_grant_elements`), and the survey pack takes the claim's grants off its sums in chapter 15 (`09-app/backend/src/web/pack-grants.ts`). As it ships, every grant comes off every item in equal share — the grant as a share of the price paid, the same route as `grant_fraction` here. Behind the new switch `CB_CTA.grant_traced_to_elements` (OFF), a grant matched to named rows comes off only those rows' qualifying spend; a grant not matched to rows keeps the equal share (N4: an unknown trace is untraced, never zero). **This Stage-1 estimate is unchanged:** it holds no item-by-item spend, so every grant here keeps `grant_fraction` whichever way the switch sits (harness Suite H, H24). Whether a traced grant reduces only the items it paid for is the tax adviser's to confirm — FOR THE ACCOUNTANT, ACC-A16, and the Word question "When a grant's papers say which items it paid for, should it come off only those items?"

---

## 8. The sector module layer (the deltas) — lock/unlock

Selecting the property/business type unlocks one module. Each is a full spec in its own file; the table is the at-a-glance delta.

| Sector (module) | Dwelling-house gate behaviour | Dominant sector-specific gate | Typical ownership | Fixture taxonomy delta | Dominant relief lever | Indicative yield | Distinctive risk / play |
|---|---|---|---|---|---|---|---|
| **01 Care homes** | Two-axis branch (trade vs letting; institution vs **extra-care** self-contained) | Dwelling-house (extra-care) + PropCo/OpCo distribution | Owner-operator; PropCo/OpCo; sale-and-leaseback | Nurse-call, hoists, assisted bathing, sluice, commercial laundry/kitchen, dementia access | AIA (in time) | 20–40% purchase / 60–90% refurb | Children's homes follow; sell-side balancing charge |
| **02 Dental** | Essentially off (except residential-above) | Pension/leasehold ownership; **deal structure** (share/asset/property) | Pension (SIPP/SSAS); leasehold; freehold | Surgery lighting/power, compressor & suction ring mains, decontamination/LDU, X-ray shielding, amalgam drainage | AIA (fit-out usually < £1m) | 50–90% fit-out / 15–30% purchase | Fixtures-vs-chattels double-count; lease drafting |
| **03 Supported living** | **Dominant / often terminal** — master determination supported-living-vs-care-home | Claimant status (charity/RP) + **grant funding** + dwelling-house | Investor→RP lease→tenant; charity RPs | **Communal parts only** (dwellings excluded); SBA largely unavailable | AIA on the small communal base | Low, often **nil** (`STOP`) | Mis-selling; reasoned-negative output; LRR may beat P&M |
| **04 GP / primary care** | Shrunken (except converted-house) | **NHS grant-vs-allowances election** (mutual exclusivity + notional-rent abatement) | Partner-owned; developer/LIFT/PFI/REIT; NHS; pension | Clinical hand-wash/plumbing, minor-ops, dispensary, confidentiality acoustic insulation, IT | AIA (+ SBA on builds) | ~35% new build / 40–70% refurb | Goodwill can't be sold (partnership premises); advisory grant-vs-fund decision |
| **05 Private hospitals / clinics** | Off (except converted-house) | **Charity / not-for-profit** status (Nuffield-type); REIT sale-and-leaseback | Operator-owned; **healthcare REIT sale-and-leaseback**; pension | **Richest:** medical gas (MGPS), theatre UCV ventilation, IPS, radiation/RF shielding, pendants, sterile services, pneumatic tube | **Full Expensing / 50% FYA** (projects > £1m, companies) | 25–45% purchase / 35–45% new build | **MP-vs-SR pool judgement** (theatre ventilation); sale-and-leaseback central |

**Adjacent sectors not yet built (low marginal value — recombinations):** vets, pharmacies, opticians, physio = dental-style fit-out recombinations; hospitality/offices/retail/industrial = the engine with a new fixture taxonomy.

---

## 9. Routing logic (how the engine selects and applies a module)

1. Run core block **A** (claimant/ownership) and the **taxpayer (C3)** and **cash-basis (C4)** gates first — a fail here ends the assessment with a reasoned negative regardless of sector.
2. Ask the **property/business type** → unlock the sector module (§8).
3. Apply the sector's **dwelling-house parameterisation** to C7/C7a (off / branch / dominant).
4. For supported living specifically, run the **master determination** (supported-living vs care-home) before anything else — it may re-route to Module 01.
5. Run blocks **C–F**, firing block **D** only on a genuine second-hand property purchase (C10a).
6. Load the sector **fixture taxonomy** (§5 base + sector delta) for the survey checklist and the **yield band** for the estimate.
7. Produce one of the three outputs (§10).

---

## 10. Output framework

**Three output types:**
- **Indicative estimate** — yield band × base (price or spend), conditioned on the answers (entitlement history, grant funding, dwelling-house split), converted to a tax saving. Always labelled an estimate.
- **Reasoned negative** — "based on your answers there is little or no claim, because [non-taxpayer / dwelling / grant-funded / share sale / already claimed]." Essential for supported living; protects the client and the firm's credibility.
- **Specialist-review referral** — for any `FLAG` (connected transfers, sale-and-leaseback, PropCo/OpCo, lease drafting, contested pool allocations, ambiguous dwelling-house cases).

**The defensible figure** always comes from the survey and the s.562 apportionment (subject to the §3 caps) or the invoice analysis — never the estimate. **ASA/CAP:** present estimates as estimates, never guarantees; use current post-April-2026 rates.

---

## 11. Master open-items / sign-off register (consolidated)

**Tax specialist (CTA):**
- [ ] The **dwelling-house gate** wording and its sector parameterisation (C7/C7a) — above all the care-home/extra-care line and the supported-living master determination (the highest-stakes wording in the framework).
- [ ] The **GP NHS grant-vs-allowances** mutual-exclusivity and the capital-grant-vs-rent-reimbursement distinction.
- [ ] The **charity/non-taxpayer** gate (C3) — reliably catching charitable operators (Nuffield-type), RPs/CICs, pension/REIT/NHS landlords.
- [ ] The **PropCo/OpCo constructive-distribution** and **lease-drafting/landlord-contribution** warnings.
- [ ] The **deal-structure** branch (C10a) — share vs asset vs property.

**Chartered surveyor + CTA (valuation/allocation):**
- [ ] The **main-pool-vs-special-rate** judgements — especially private-hospital theatre ventilation, IPS, shielding; care-home through-floor lifts/underfloor heating; GP clinical ventilation/acoustic insulation; dental dedicated power.
- [ ] The **Bowerswood formula inputs** and the **yield-band calibration** for each sector against real projects.

**VAT:**
- [ ] **Partial-exemption** treatment (cosmetic / dispensing / NHS-contract mixes) before including irrecoverable VAT.

**Funding / scope:**
- [ ] Current **LRR** scope/rates against any 2025–26 reform.
- [ ] Children's-home treatment confirmation (Module 01).

**Legal / marketing:**
- [ ] Client-facing language and the **reasoned-negative** wording, given the mis-selling risk (especially supported living).

---

## Sources & references

### Citation control — the recent appellate decisions

**Standing rule: cite the instance that is still good law, and say which instance a paragraph
number comes from.** Paragraph numbering differs between tribunal and appellate judgments, so a bare
"*Urenco* at [97]" is not a citation — it is the mechanism by which an overturned decision gets
quoted back into a claim.

| Case | **Cite this** | Do **not** cite | Why it matters here |
|---|---|---|---|
| *SSE Generation Ltd v HMRC* | **[2023] UKSC 17** (Supreme Court) | The FTT, UT or Court of Appeal instances | The leading modern authority on the ss.21–22 exclusions and what escapes them. The lower instances are superseded |
| *Urenco Chemplants Ltd v HMRC* | **[2022] EWCA Civ 1587** (Court of Appeal) | The Upper Tribunal decision — **it was reversed** | Two propositions this framework relies on: the "on the provision of" widening for List C items 1–21 at [139], and the limit at [97] that fabric merely *hosting* plant is not expenditure on the plant. Both are the **Court of Appeal's**, and the UT reached a different result |
| *Cheshire Cavity Storage 1 Ltd v HMRC* | **[2022] EWCA Civ 305** (Court of Appeal) | — | Confirms the evaluative, multi-factor approach to the premises test |

> **Provenance — what has actually been read, as at 25 August 2026.**
>
> - ***Urenco Chemplants* [2022] EWCA Civ 1587 — READ IN FULL**, all 171 paragraphs, from The
>   National Archives Find Case Law (HTML plus the Akoma Ntoso XML for paragraph numbering), on
>   24 August 2026. Board item 12851629470, write-up at doc 18427871199. Every *Urenco* paragraph
>   cited in this framework — [97], [139], [144] — is taken from the judgment, not from commentary.
> - ***SSE Generation* [2023] UKSC 17 and *Cheshire Cavity* [2022] EWCA Civ 305 — NOT read in full.**
>   The propositions attributed to them come from HMRC's Capital Allowances Manual and from
>   professional commentary cross-checked across more than one firm. Treat accordingly.
>
> **Two things the full *Urenco* read settled that matter here.**
>
> **It confirms the D-1 rule from the judgment rather than from the manual.** At [126] the Court is
> express: the closing words of s.23(3) "take the reader back to the basic test in section 11(4) …
> thus making clear that inclusion in List C does not alone guarantee the availability of capital
> allowances." And at [21]: "it is only the exclusions in sections 21 and 22 which are removed."
> **List C is a shield against ss.21–22. It is not a sword under s.11.**
>
> **It also tightened the s.21 "building" test, which cuts the other way.** At [103]–[122] the Court
> held that a specialised, purpose-built structure with foundations, walls and a roof is a *building*
> even where shelter is not its dominant function — containment counts as a building function too.
> And at [97], fabric does not become "provision of plant" merely because plant is bolted to it.
> A framework that takes the widening at [144] without the narrowing at [103]–[122] and [97] will
> over-claim. See board item D-5 (12843022045).
>
> **One live caveat.** The Items 1/4 question was **remitted to the FTT, not decided** ([151]–[153]).
> Cite *Urenco* for the construction point only, and check for a post-2022 remitter decision before
> first client delivery.


**Legislation (CAA 2001 unless noted):** s.11; s.21–22; s.33A integral features; s.33B / 50% integral-features rule; s.35 dwelling-house restriction (property businesses & special leasing only — every UK property letting business alike since the FHL regime's abolition removed the last carve-out from 1 April 2025 (companies) / 6 April 2025 (income tax); there is no "ordinary vs FHL" distinction left to draw, E-15); s.62 (disposal value capped at cost); s.185 (buyer limited to seller's disposal value); s.187A and FA 2012 Sch 10 fixtures rules; s.187B(6); s.198/199 elections and s.201 content; s.532 / s.537–538 (contributions); s.562 apportionment; SBA (FA 2019); Full Expensing and 50%/40% FYAs (FA 2023 and subsequent); Land Remediation Relief (CTA 2009 Part 14). **NHS framework (Module 04):** NHS (GMS – Premises Costs) Directions 2024. **HMRC manuals:** CA11520, CA23060 (dwelling-house; CA20020 is archived — its content moved to CA23060 in the FHL-repeal tidy-up, E-14 — never cite CA20020 as live); CA22340 (integral-features repairs / 50% test); BIM35480, PIM2020 (repairs vs capital); Briefs 66/08, 45/10. **Healthcare M&E standards (Module 05):** HTM 02-01 (medical gas), HTM 03-01 (specialist ventilation). **Case law:** *SSE Generation Ltd v HMRC* **[2023] UKSC 17** (Supreme Court — not the lower instances); *Urenco Chemplants Ltd v HMRC* **[2022] EWCA Civ 1587** (Court of Appeal — the Upper Tribunal decision was reversed); *Cheshire Cavity Storage 1 Ltd v HMRC* [2022] EWCA Civ 305; *Carr v Sayer* [1992] STC 396; *Bowerswood House Retirement Home Ltd v HMRC* [2015] UKFTT 94; *Glais House Care Ltd v HMRC* [2019] UKFTT 59; *Tapsell & Lester v HMRC* [2011] UKFTT 376; *JD Wetherspoon plc v HMRC* [2012] UKUT 42; *Hora Tevfik v HMRC* [2019] TC07383; *Law Shipping Co Ltd v CIR* [1923] 12 TC 621; *Conn v Robins Brothers Ltd* [1966] 43 TC 266; *Brown v Burnley Football & Athletic Co Ltd* [1980] 53 TC 357; *Uratemp Ventures Ltd v Collins* [2001] UKHL 43. Sector benchmarks and structural treatment drawn from published professional guidance (incl. Lovell Consulting, Bonham & Brook, Six Forward, BDO, Tax Adviser, Albert Goodman/VWV, Clifford Chance, Savills). All figures indicative and subject to survey validation; this is a technical reference, not tax advice.
