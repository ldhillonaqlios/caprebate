# Costing the small end — what one job costs us, and where it stops paying

**Phase 100, 8 September 2026. Board item 12955448913.**
Module `caprebate-job-economics.cjs`, tests `caprebate-job-economics.test.cjs`, both in `04-phase-work/phase9`.

**Status: the mechanism ships, the unknowable numbers stay labelled and empty.** Nothing here is wired into the shipped engine and nothing here decides anything. Two of the inputs that matter most have no value and are named rather than guessed.

---

## Read this first — there are now two "cost" files in this folder and they cost different things

| File | Whose cost | What it means |
|---|---|---|
| `caprebate-cost-model.cjs` | **The client's building** | Residual replacement cost. Sizes the client's claim. |
| `caprebate-job-economics.cjs` | **Our job** | What Caprebate spends to produce one claim, and what it earns. |

A phase that conflates them will produce nonsense that type-checks. That is why this file is not called `cost-model-2`.

---

## 1. Correcting the premise this phase was given

The Phase 100 prompt said "**there is no per-job cost model anywhere**" and "nothing computes what one job costs to produce". Re-derived on 8 September, that is not quite right, and the correction is the reason this module is shaped the way it is.

**What already existed.** `03-app/caprebate-business-plan-model.cjs` does compute a cost per job — it holds a `DIRECT[sector]` table of surveyor, CTA, internal hours and data cost, an overhead loading and a failed-enquiry drag, and it prints a section headed "2. COST PER JOB".

**What genuinely did not exist is a *route*.** That model charges a full surveyor cost on every job in every sector. It has no notion of desk-only versus a site visit, no break-even, no routing rule, and no connection to the fee guard. The word "scenario" does not appear in it.

**And one thing was worse than missing.** The published paper *Minimum fee — the research* (28 August 2026) *does* carry per-job figures for three delivery scenarios — but it says they came from re-running the business plan model "with the automation parameters changed", **and that variation was never committed**. So the paper's numbers could not be re-derived by running anything. Suite F now regenerates every published cell from code and asserts it. From here the paper is maintainable: change a route and the test names the figure that moved.

**This module therefore does not invent a second cost base.** It restates the business plan model's constants, and Suite B parses that file and fails if the two ever disagree.

---

## 2. The two routes, and why nothing here picks one

| | **SURVEYOR_VISIT** (paper's S1) | **DESK_ONLY** (paper's S2) |
|---|---|---|
| What happens | A surveyor produces the valuation, attending | We produce the pack; a surveyor reads, challenges and signs it without attending |
| Surveyor cost | £1,500–£3,500, by sector | £600 flat — see the finding in §5 |
| CTA review | Every job | One job in four |
| Internal time | Full | Half |
| Failed-enquiry drag | £360 | £180 |
| Marginal cost, dental | **£2,990** | **£1,220** |

A third route, **STRAIGHT_THROUGH** (S3), is carried because the published paper prices it, but it is flagged `priceable: false`. It cannot be priced today for four reasons that are not software problems: who signs a valuation nobody has seen; whether PI cover reaches it; a clawback exposure that does not scale down with the fee; and an engine gate that must refuse to route a case straight through when any exclusion is present.

**Which route a job needs is not ours to decide, and the model refuses to.** It depends on the question the surveyor has not been asked — *where does a desk estimate stop being defensible; is there a size, a complexity, or a category of plant above which somebody has to attend?* That is a professional judgement about the surveyor's own liability. The recorded answer of "yes — a desktop survey" is on the file as a **commercial preference** and the surveyor call agenda says in terms that it does not close the question.

So `routeDecision()` returns **both** routes' economics and sets `recommendation: null` with a reason. Refusing to choose is not refusing to compute. When the answer lands, set `PARAMS.desk_defensibility_answer` and the refusal lifts.

---

## 3. Where each route stops paying for itself

**Updated 16 September 2026 (Phase 132e): every figure in sections 3 to 5 is now on the flat 3% fee.** Lakhbir decided the fee is a flat 3% of the allowances identified, with no minimum and no bands (answer read 15 September 2026). The earlier 5% figures are shown in brackets so the change can be seen. Nothing on the cost side moved.

The fee is **3% of allowances identified** (the basis is Q55, 3 September 2026; the rate is read from the engine, never restated here). So the break-even is simply `loaded cost ÷ fee rate`.

**Break-even allowances — overhead £60,000 (a placeholder), no founder salary, at 3% (was at 5%)**

| Sector | Route | 25/yr | 50/yr | 100/yr | 120/yr | 200/yr |
|---|---|---|---|---|---|---|
| Dental | Desk-only | £120,667 (was £72,400) | £80,667 (was £48,400) | £60,667 (was £36,400) | £57,333 (was £34,400) | £50,667 (was £30,400) |
| Dental | Surveyor visit | £179,667 (was £107,800) | £139,667 (was £83,800) | £119,667 (was £71,800) | £116,333 (was £69,800) | £109,667 (was £65,800) |
| GP | Desk-only | £127,167 (was £76,300) | £87,167 (was £52,300) | £67,167 (was £40,300) | £63,833 (was £38,300) | £57,167 (was £34,300) |
| GP | Surveyor visit | £221,000 (was £132,600) | £181,000 (was £108,600) | £161,000 (was £96,600) | £157,667 (was £94,600) | £151,000 (was £90,600) |
| Care home | Desk-only | £131,667 (was £79,000) | £91,667 (was £55,000) | £71,667 (was £43,000) | £68,333 (was £41,000) | £61,667 (was £37,000) |
| Care home | Surveyor visit | £268,333 (was £161,000) | £228,333 (was £137,000) | £208,333 (was £125,000) | £205,000 (was £123,000) | £198,333 (was £119,000) |
| Private hospital | Desk-only | £133,500 (was £80,100) | £93,500 (was £56,100) | £73,500 (was £44,100) | £70,167 (was £42,100) | £63,500 (was £38,100) |
| Private hospital | Surveyor visit | £283,667 (was £170,200) | £243,667 (was £146,200) | £223,667 (was £134,200) | £220,333 (was £132,200) | £213,667 (was £128,200) |

The 120 column is the volume Lakhbir gave on 15 September 2026 for the engagement gate. The business plan's own ramp is 16 jobs in year one, and the papers use 25.

**With a £60,000 founder salary the overhead doubles, so each volume needs what half that volume needs without it** (the 50 column becomes the 25 column, and so on). Dental desk-only at 25 jobs a year needs £200,667 of allowances, not £120,667 (at 5% it was £120,400, not £72,400). That is the honest reading, and year one is the 25-jobs column.

**As a purchase price, at 100 jobs a year:** dental desk-only £269,630, dental with a visit £531,852; care home desk-only £238,889, with a visit £694,444. (At 5% these were £161,778, £319,111, £143,333 and £416,667.) At 120 jobs a year: dental with a visit £517,037, care home with a visit £683,333. The yields behind these are the Rulebook I midpoints: 22.5% dental and GP, 30% care home, 35% private hospital.

---

## 4. The published break-even purchase prices are stale

*Minimum fee — the research* reports a break-even purchase price of **£797,778** for dental on the surveyor-visit route at 100 jobs a year. That figure is correct **on the basis that paper used — 5% of lifetime relief.** The basis changed on 3 September 2026 to a percentage of **allowances identified**, which is larger by a factor of `1 ÷ tax rate`, and on 15 September 2026 the rate changed from 5% to 3%.

| Dental, surveyor visit, 100 jobs/yr | Break-even purchase price |
|---|---|
| On the decided basis, 3% of allowances identified | **£531,852** |
| On 5% of allowances identified (3 to 15 September 2026) | £319,111 |
| On the published basis, 5% of lifetime relief, unincorporated at 40% | £797,778 |
| On the published basis, 5% of lifetime relief, company at 25% | £1,276,444 |

**The smallest dental job that pays for itself with a site visit is now about £532,000 of purchase price** — higher than the £319,000 it was at 5% of allowances, and still lower than the paper's £798,000.

And there is a structural consequence worth stating separately: **on the allowances basis the client's tax rate does not enter our break-even at all.** Under the old basis a company client was a materially worse job for us than an unincorporated one on identical work. Under the decided basis they are identical to us — the difference falls entirely on the client, which is what §5 is about.

`reportsBasisChange()` computes this comparison so nobody re-publishes an old number from memory.

---

## 5. The cross-check against the fee guard — at 3% the pool split decides it

At 5% the fee guard (Phase 77) established that a company client's year-one benefit fell short of the fee whatever the pool split, and this section found a band where a job lost us money *and* left a company client out of pocket in year one. **At 3% that finding narrows, and it has to be read with the pool split.** A company's best year-one return on writing-down allowances is 18% × 26.5% = 4.77% of the allowances, or 14% × 26.5% = 3.71% from April 2026 — both above 3%. On special-rate plant it is 6% × 26.5% = 1.59%, below 3%.

Computed against the real `CB_BENEFIT.compare()` loaded out of the shipped engine, not a copy of it:

**Company client at 25%, dental, 25 jobs/yr, no founder salary, fee at 3%**

| Allowances | Our fee | Our side | Band, all main-rate plant | Band, all special-rate plant | Band, split not known |
|---|---|---|---|---|---|
| £20,000 | £600 | Decline | Decline | **MUTUAL LOSS** | Undetermined |
| £30,000 | £900 | Decline | Decline | **MUTUAL LOSS** | Undetermined |
| £50,000 | £1,500 | Thin | Us thin only | **MUTUAL LOSS** | Undetermined |
| £120,000 | £3,600 | Thin | Us thin only | **MUTUAL LOSS** | Undetermined |
| £179,667 | £5,390 | Sound | Sound | Client poor only | Undetermined |
| £300,000 | £9,000 | Sound | Sound | Client poor only | Undetermined |
| £1,200,000 | £36,000 | Sound | Sound | Client poor only | Undetermined |

The main-rate column uses a chargeable period starting 1 April 2026 (the 14% rate).

**What to take from that table.**

**Our side:** at 25 jobs a year a dental job is declined below about £40,667 of allowances (a fee below £1,220 does not cover the cheapest route's marginal cost), is thin up to about £120,667, and pays its way above that. At 100 jobs a year it pays its way from about £60,667. At 5% those points were £24,400, £72,400 and £36,400.

**The client's side now depends on the plant.** On main-rate plant a company client is ahead in year one at every size tested, so there is no mutual-loss band. On special-rate plant the client is out of pocket in year one at every size, and the mutual-loss band runs from £0 to about £120,667 of allowances at year-one volume. Where the split is not known — which is every case today, because no question captures it (Q91) — `CB_BENEFIT` returns `null`, and the band is Undetermined rather than guessed.

**So at 3% the band is proven only where the plant is special-rate, and closing Q91 is what would settle it for everybody else.**

`classifyBand()` returns both break-even rates side by side — the rate at which the fee stops exceeding the client's year-one benefit, and the rate we need for the job not to lose us money. Where the client's number is *below* ours, `no_rate_satisfies_both` is true, and that is a finding rather than a discount for sales to negotiate.

---

## 6. What Homedata costs per lookup — the one number modelled as empty

 **Added 17 September 2026 (Phase 133) — the price is now published, and the parameter still stays null.** Homedata's pricing page, read on 17 September 2026: "100 tokens = £1", pay as you go — no plans, no subscription and **no free monthly allowance**; tokens never expire; the first top-up is matched (£10 buys 2,000 tokens). An address search or postcode lookup costs 2 tokens (2p), the full address 5 (5p) and a property record 1 (1p), so a find-then-retrieve lookup is **7p**. A free playground tests the API by hand at no cost. Sold-price and energy-certificate data are England and Wales only. So at list price a lookup is 2p (search only) or 7p (search then retrieve) — "a rounding error against the existing £50 data line", the first case below. It stays null because whether Caprebate uses a paid lookup at all is not decided: that is the question "Do we need a paid address lookup at launch, or do we match the address the client types, as your last company did?" in CAPREBATE QUESTIONS. Two premises below are also out of date: since 4 September 2026 a paid call fires only after the engagement letter is signed, so it is not a pre-signature cost if Homedata is used; and on 15 September 2026 Lakhbir agreed a typed postcode and address in the funnel.


`PARAMS.homedata_cost_per_lookup` is **null** and stays null. It is not zero, and Suite D proves that a zero answer and an absent one behave differently at every point in the model.

**Why it is structurally different from every other cost here.** It is the only per-claim cost incurred **before a client signs anything**. Every other line in this file falls on the far side of the engagement letter, where we already know we have a job. And **it fires once per property, not once per enquiry** — an enquirer with eleven care homes who never signs costs us eleven lookups and returns nothing.

**What the answer would change, stated now so it cannot be quietly absorbed later:**

- **At a low price** it is a rounding error against the existing £50 data line and nothing changes.
- **At a high price** it is a real number multiplied by *both* the property count *and* the failed-enquiry ratio — three failures for every conversion — so it belongs in the failed-enquiry drag rather than in direct cost. `preSignatureCost()` already reports `cost_per_conversion` as 4× the lookup cost for exactly this reason.
- **At a high price it also becomes an argument for a property-count cap on the free tier**, which is a product decision nobody has taken.
- **And it may move the call between tiers entirely.** Free calls fire on permission, which is *before* signature; paid calls fire only after signature on an operator click. If Homedata is a paid call it does not belong in the free tier at all — which is a bigger change than a cost line. **Raised as Q93.**

---

## 7. The other finding: the desk-only route has no sector-varying cost basis

The surveyor-visit route costs £1,500 for dental and £3,500 for a private hospital — a 2.3× spread. **The desk-only route costs £600 for both.**

That is not a modelling choice made here; it is what the published paper does, and the paper is explicit that "dental is used as the reference sector throughout". The risk is that its S2 tables get read as general when they are a dental number. **If desk review scales with the building the way a visit does, every desk-only figure for GP, care home and private hospital in §3 is too low, and too optimistic for exactly the sectors where the jobs are biggest.**

Not fixed here, because fixing it means inventing a sector scaling nobody has measured. It is flagged in the module, asserted by Suite B5, and **raised as Q92** for the surveyor.

---

## 8. What this does not do

- **It is not wired into anything.** No caller in the shipped engine reaches it.
- **There is no minimum fee to set.** The published recommendation of £5,000 / £7,500 launch minimums was a *minimum fee*. Lakhbir's answer read 15 September 2026 settled it: a flat 3% with no minimum and no bands. The module keeps the old minimums only as inputs a caller may pass to reproduce the old papers (`FEE_DECISION` records the decision, and `bandedFee()` now refuses to run without bands passed explicitly).
- **It does not model the multi-site discount.** A further discount may be agreed for several sites, but how large it can be and who approves it are not decided, so no figure for it exists here.
- **It does not price STRAIGHT_THROUGH as a route.** Four open non-software preconditions.
- **Its overhead is a placeholder.** £60,000 contains no founder salary and was named a placeholder where it was first used. Every table is flagged `overhead_is_placeholder: true` until a real figure is passed.

---

*Prepared by Phase 100 (Claude), 8 September 2026. All costs are estimates, not quotes; no surveyor or CTA quote existed at this date and that remains the weakest input, as it was in the research this builds on. The fee rate is read from the shipped engine, sector yields are injected from Rulebook I, and no tax rate is restated in this module.*
