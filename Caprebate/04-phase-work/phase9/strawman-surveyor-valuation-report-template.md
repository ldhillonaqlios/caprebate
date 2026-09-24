# Surveyor's Valuation Report Template — Strawman (Phase 9)

**Monday item 12819676756 — "Build the surveyor's valuation report template, WITH the surveyor."**
**Status:** draft template for the surveyor conversation, not a finished report and not a document to
be issued to any client. Built without a surveyor in the room, which is exactly why every judgement
field below is left empty rather than guessed.

---

## PROPOSAL FOR THE SURVEYOR TO CORRECT AND COMPLETE

> **This document is a proposal, not a finished report.** It was drafted by Caprebate without a
> chartered surveyor's involvement, using only the data we already hold. It is a starting point for a
> working session with a RICS-registered valuer — to be corrected, added to, argued with and
> substantially rewritten before anything resembling it is issued to a client, an accountant or HMRC.
>
> **Nothing in this document is professional advice, a valuation, or a capital allowances claim.**
> No qualifying percentage, element split, pool allocation or apportionment figure in this document has
> been determined by a chartered surveyor. Every field where that judgement belongs is marked
> **`[SURVEYOR]`** and left visibly blank. Where a figure looks like it has been calculated, check the
> tag on that row before relying on it: `[AUTO]` means it comes from a named data field we already
> hold, not from anyone's professional opinion.
>
> **This is the whole point of building this WITH the surveyor rather than FOR them.** A template that
> arrives with the hard numbers already filled in invites a rubber stamp on someone else's arithmetic,
> and it puts the surveyor's signature on our guesswork, not their judgement. That is precisely the
> failure this project has already been burned by once — see `R-B10` below — and this document is
> built not to repeat it.

---

## How to read this document

Every section carries one of three tags, and the tag is the load-bearing part of the section, not
decoration:

| Tag | Meaning |
|---|---|
| **`[AUTO]`** | Auto-populates from a named field in `Build-Prep-Consolidated-Schema.md`. The field id, the provenance code and the confidence grade are stated on the face of the section, so the surveyor can see at a glance where the number came from and how far it can be trusted. Nothing here required a surveyor's opinion to produce. |
| **`[SURVEYOR]`** | Genuinely empty. This is the surveyor's professional judgement, full stop. The section states the exact question being asked and leaves the answer blank. No default, no "typical" value, no plausible-looking placeholder. |
| **`[MIXED]`** | Auto-populated *inputs* are shown for the surveyor to accept, adjust or reject. The adjustment mechanism is shown; the accept/adjust/reject decision itself is left blank. This is not a compromise tag — it is the schema's own model of how a `D`-grade field works ("AI drafts, surveyor confirms — never the reverse," `Build-Prep-Consolidated-Schema.md` §0.5). |

**Provenance and confidence, on the face of every entry.** Every `[AUTO]` and `[MIXED]` line carries
three things, always in this order: the schema `field_id`, the provenance code (`CA`/`CD`/`API`/`SV`/
`DR`/`CTA` — §0.4), and the confidence grade (`A`–`E` — §0.5). This is not decorative; it is the fix
for the exact defect recorded at **R-B10** in `Caprebate-Engine-Remediation-Register-v2.md` — a
sign-off document that asked the surveyor and the CTA to validate figures without disclosing that they
came from a competitor's report, not from independent derivation. **A number with no visible source on
this document is a defect in this document, not a shortcut.**

**Whose judgement is it.** The confidence grade table draws a hard line: grade `D` is chartered-
surveyor sign-off, grade `E` is CTA (chartered tax adviser) sign-off. This is the *surveyor's* report,
so `[SURVEYOR]` sections below are, with a few named exceptions, the `D`-grade fields. Where a field is
genuinely `E`-grade — a filing-position call for whoever signs the filing position under clause 1 of the engagement letter (the client's accountant or tax adviser, or the client if there is neither), not a valuation call — that is stated explicitly and
the field is flagged for the accountant/CTA report (`Build-Prep-Report-Pack-and-Hand-off-Specification.md`
§4.2) rather than smuggled into this document as if it were the surveyor's to decide. Blurring that line
was never asked for and would not help either professional.
_(Phase 146a, 22 Sep 2026: this said "a CTA filing-position call". Grade E goes to whoever signs the filing position under clause 1, not to a tax adviser Caprebate engages per case — the engine's routing since Phase 146. Words changed only; nothing removed.)_

**Sector scope.** The consolidated schema runs one shared core (§1.A–§1.I) plus five sector
extensions (§3.1–§3.5: Care Homes, Dental, Supported Living, GP/Primary Care, Private Hospitals). This
template carries the shared core in full and flags exactly where a sector-specific block plugs in.
Populate only the block for the sector actually in front of the surveyor.

---

## SECTION 1 — Report Identification & Subject Property `[AUTO]`

| Field on report | Value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Claimant / legal entity | *[auto-fill]* | `claimant_legal_name` | CA / API (Companies House) | A |
| Company number / UTR | *[auto-fill]* | `company_number_or_utr` | CD / API | A |
| Claimant type | *[auto-fill]* | `claimant_type` | CA / API (CH) | A |
| Property address | *[auto-fill]* | `address` | CD / API (HMLR) | A |
| Title number | *[auto-fill]* | `title_number` | CD / API (HMLR) | A |
| Nation (tax/regulatory regime) | *[auto-fill]* | `nation` | CA / DR (address) | A |
| Property sub-type | *[auto-fill]* | `property_subtype` | CA / CD (EPC) | B |
| Regulator & provider ID | *[auto-fill]* | `regulator_registration` | CA / API (CQC/CIW/HIW/HIS/RQIA/Ofsted) | A |
| Sector module in play | *[auto-fill: 01/02/03/04/05]* | — | — | — |
| Job reference | *[auto-fill]* | internal | — | — |

**Note on regulator field (Wales).** Where `nation=WALES`, `regulator_registration.regulator` must read
CIW for Care Homes/Supported Living and HIW for Dental/Private Hospitals — the two Welsh regulators are
not interchangeable (schema §1.A note). Confirm this has resolved correctly before relying on the row.

---

## SECTION 2 — Instruction, Surveyor's Particulars & Extent of Inspection `[SURVEYOR]`

**Not a schema field — this section does not exist anywhere in our data model, because it is entirely
about the surveyor, not the property.** Genuinely blank; nothing here should ever auto-populate.

| Field | Surveyor to complete |
|---|---|
| Instructing party | *[blank]* |
| Surveyor / firm name | *[blank]* |
| RICS registration number | *[blank]* |
| Professional indemnity reference (policy no., sum insured) | *[blank]* |
| Basis of inspection — full site visit, desktop review, or video-supported desktop review (RICS Red Book restricted basis) | *[blank]* |
| Date(s) of inspection | *[blank]* |
| Areas/rooms inspected vs areas not inspected, and why | *[blank]* |
| Conflicts of interest declaration | *[blank]* |

**The question this section is answering:** *who is signing this, on what evidential basis, and what
did they actually see?* No auto-population is possible or appropriate here.

---

## SECTION 3 — Purpose, Status of Report & Basis of Engagement `[MIXED]`

**Auto-populated (boilerplate, not judgement):**

- Report type: Capital Allowances Valuation Report (CAVR) per `Build-Prep-Report-Pack-and-Hand-off-
  Specification.md` §4.2, Part one.
- Status: indicative technical reference, not tax advice, until surveyed and signed
  (`caprebate-sample-report.html` footer convention; §0 of this document's front matter).
- Rates basis date: *[auto-fill — from the single consolidated rate table, Module 00 §3c / Build-Prep-
  05 §3]*. `DR`, grade A (deterministic lookup) — **but only as good as the last re-verification; state
  the date, do not assume it is current.**
- Purpose: to identify and evidence qualifying plant and machinery expenditure for a UK capital
  allowances claim on the subject healthcare property.
- Standard RICS assumptions (title is good and marketable; no undisclosed easements; no
  contamination beyond what is stated; information supplied is accurate) — listed in full in Section 21.

**`[SURVEYOR]` — left for completion:**

- Any **special assumption** departing from the standard set (RICS VPS 3 style), stated and reasoned.
- Confirmation that the standard assumptions in Section 21 are accepted as they stand, or a marked
  amendment to any of them.

---

## SECTION 4 — Executive Summary of Position `[MIXED]`

**This section deliberately contains no headline claim figure.** A qualifying-expenditure total or a
lifetime tax-saving figure cannot be produced honestly before Sections 10, 12 and 14 are complete —
doing so here would be exactly the "plausible-looking number" this template is built to avoid. What
*can* be shown pre-survey is the shape of the transaction the figure will eventually sit inside.

| Line | Value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Purchase / project trigger(s) | *[auto-fill]* | `triggers` | CA | C |
| Total consideration / base amount | *[auto-fill]* | `base_amount_per_trigger` | CA (rough) / CD (exact) | B |
| Completion / works date(s) | *[auto-fill]* | `transaction_dates` | CD (HMLR/contract) | B |
| Gross internal area | *[auto-fill, surveyor to confirm]* | `gross_internal_area_m2` | CD (EPC/plans) / SV | D |
| **Qualifying plant and machinery expenditure** | **[SURVEYOR — blank pending Sections 10 & 14]** | `sba_residual_structure_cost` inputs feed from here | DR (after P&M) | E (inherits worst input) |
| **Pool split, main / special rate** | **[SURVEYOR — blank pending Section 13]** | derived from `fixture_item[].pool_tag` | DR / SV / CTA | D (E in Module 05) |
| **Indicative lifetime tax relief** | **[not computed in this document]** | — | — | — |

**Decision mechanism (`[MIXED]`):** the top three rows above are the auto-populated inputs; accept /
adjust / reject each against the underlying document before the schedule sections are worked:
Accept ☐  Adjust ☐ (state correction) ________________  Reject ☐

---

## SECTION 5 — Property Description & Physical Particulars `[MIXED]`

| Field | Auto-populated value | Schema field | Provenance | Grade | Surveyor decision |
|---|---|---|---|---|---|
| Address | *[auto-fill]* | `address` | CD / API (HMLR) | A | Accept ☐ Adjust ☐ Reject ☐ |
| Title number | *[auto-fill]* | `title_number` | CD / API (HMLR) | A | Accept ☐ Adjust ☐ Reject ☐ |
| Gross internal area (m²), by floor if held | *[auto-fill]* | `gross_internal_area_m2` | CD (EPC/plans) / SV | D | Accept ☐ Adjust ☐ Reject ☐ |
| Construction type | *[auto-fill]* | `construction_type` | CD / SV | D | Accept ☐ Adjust ☐ Reject ☐ |
| Build or renovation year | *[auto-fill]* | `build_or_renovation_year` | CD | B | Accept ☐ Adjust ☐ Reject ☐ |
| Property sub-type | *[auto-fill]* | `property_subtype` | CA / CD (EPC) | B | Accept ☐ Adjust ☐ Reject ☐ |
| Floor plans supplied | *[list of documents held]* | `floor_plans` | CD / SV | B | Confirm sufficiency ☐ |
| Photographs / asset schedule supplied | *[list of documents held]* | `photographs_asset_schedule` | CD / SV | B | Confirm sufficiency ☐ |

**Why `gross_internal_area_m2` and `construction_type` are `D`-grade, not `A`.** Both feed the s.562
apportionment and the SBA residual directly (schema §1.C), and both are only as reliable as the
document they were extracted from until a surveyor stands behind them on inspection. This is the
single biggest gearing point in the whole apportionment — the client report's own worked example says
so ("the land value is the single biggest lever," `caprebate-sample-report.html` §02) and the same is
true in mirror for the area figure feeding the cost build-up.

---

## SECTION 6 — Room Schedule & Sector Space Data `[MIXED]`

| Field | Auto-populated value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Room counts (shared) | *[auto-fill]* | `room_counts` | CA / SV | C |
| Care Homes: bed/room count | *[auto-fill if sector = 01]* | `ch_bed_room_count` | CA / SV | C |
| Dental: surgery chair count | *[auto-fill if sector = 02]* | `dn_surgery_chair_count` | CA / SV | C |
| GP: consulting/treatment/minor-ops rooms | *[auto-fill if sector = 04]* | `gp_consulting_room_counts` | CA / SV | C |
| Private Hospitals: theatre/ICU/imaging/sterile-services counts | *[auto-fill if sector = 05]* | `ph_high_acuity_room_counts` | CA / SV | C |

**Grade `C` means client-asserted and unverified.** Schema §0.5 is explicit that a `C`-grade field may
not drive a **GATE** uncorroborated (invariant **I-17**). The room count itself does not gate anything,
but it sizes the fixture taxonomy below, so a surveyor correction here has knock-on effects on Section
12. Confirm or correct against the inspection: Accept ☐ Adjust ☐ (state correct counts) ________________

---

## SECTION 7 — Ownership, Lease & Entitlement History (context) `[AUTO]`

Shown for context only — **entitlement judgement calls within this block are the CTA's, not the
surveyor's** (see the grade column), and are addressed in the accountant/CTA report per Build-Prep-
Report-Pack §4.2, not signed off here.

| Field | Value | Schema field | Provenance | Grade | Whose call |
|---|---|---|---|---|---|
| Ownership model | *[auto-fill]* | `ownership_model` | CA / CD / API (HMLR) | B | context |
| Lease status | *[auto-fill]* | `lease_exists` | CD (lease) | B | context |
| Who incurred the fit-out | *[auto-fill]* | `who_incurred_fitout` | CA / CD | B | context |
| Landlord contribution amount | *[auto-fill — a number, not a note; see I-4]* | `landlord_contribution_amount` | CD (lease/contribution agreement) | B | context, deducted at Stage 1 |
| Deal structure | *[auto-fill]* | `deal_structure` | CA / CD (SPA) | B | context |
| Prior owner claimed allowances | *[auto-fill]* | `prior_owner_claimed` | CA / CD (CPSE) | B | context |
| Prior owner status | *[auto-fill]* | `prior_owner_status` | CA / CD / API | B | context |
| s.198 election exists | *[auto-fill]* | `s198_election_exists` | CD (election) | B | context |
| s.198 election value | *[auto-fill, if applicable]* | `s198_election_value` | CD (election) | B | context — caps the claim |
| **s.198 election validity** (fixtures only / within 2 years / s.201 content complete) | **not this document** | `s198_election_validity` | CD / DR | **E — CTA report** |
| **Connected-party transfer in chain** | **not this document** | `connected_party_transfer_in_chain` | CA / CD | **E — CTA report** |
| **Contributor-not-payer gate** | **not this document** | `is_contributor_not_payer` | CA | **E — CTA report** |

**I-7, stated once here because it applies wherever a grant reduction is applied.** Repaying or
clawing back a grant does not restore the relief it stripped — ESC/B49 was withdrawn in 2013. If
`landlord_contribution_amount` or a grant figure above reduces the qualifying base anywhere in this
report, that reduction is not reversible by later repayment.

---

## SECTION 8 — Dwelling / Residential Apportionment `[SURVEYOR]`

**The question this section is answering:** *how much of this property's cost is a dwelling (excluded
under s.35) and how much is genuinely non-residential, and by what method was that line drawn?*

| Field | Schema field | Provenance | Grade | Surveyor to determine |
|---|---|---|---|---|
| Residential split (m²) | `residential_split_m2` | SV / CD | D | *[blank]* |
| Care Homes: communal vs dwelling split (extra-care) | `ch_communal_vs_dwelling_split_m2` | SV / CD (plans) | D | *[blank — method and m²]* |
| Supported Living: dwelling configuration | `sl_dwelling_configuration` | CA / CD (EPC/plans) | E | *[blank — routes to STOP if single dwelling]* |
| Supported Living: common-parts areas | `sl_common_parts_areas` | SV / CD (plans) | D | *[blank]* |
| Supported Living: segregation possible | `sl_segregation_possible` | CA / CD / SV | D | *[blank — without this the claim fails, Hora Tevfik]* |

**Open method question carried forward, not resolved here (`G-5`).** The consolidated schema records
that `ch_communal_vs_dwelling_split_m2.method` — measured survey vs apportioned — is **undecided** for
extra-care configurations, and flags it as "the single biggest care-home claim risk" (schema §3.1 and
§4 gap G-5). This template does not resolve it; it surfaces the open question to the surveyor rather
than picking a method for them.

**No default land or dwelling fraction is offered anywhere in this section**, deliberately. A prior
version of the validation brief offered a pre-survey land band (25–35% of price) as a working
assumption for calibration purposes (`caprebate-validation-and-sign-off-brief.html` B2); this
template does not repeat that pattern for the same reason it does not offer a qualifying-percentage
default — a band framed as a working assumption still anchors the reader, and the register itself
records (`R-B9`) that the parameters behind such bands may be fitted to a single non-independent case
rather than derived. None is repeated here.

---

## SECTION 9 — Transaction & Expenditure Base `[AUTO]`

| Field | Value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Purchase price breakdown (property / goodwill / stock / assets) | *[auto-fill]* | `purchase_price_breakdown` | CD (contract/SPA) | B |
| Acquisition costs (SDLT, legal, fees) | *[auto-fill]* | `acquisition_costs` | CD (SDLT return, invoices) | B |
| Cost detail documents held | *[list]* | `cost_detail_documents` | CD | B |
| Cost information available | *[auto-fill: FULL / PARTIAL / NONE]* | `cost_information_available` | CA / CD | C |
| Prelims and fees | *[auto-fill, net of any Direction 15/39(2) reimbursement — I-10]* | `prelims_and_fees` | CD | B |

**Note (GP sector, I-10).** Where `gp_nhs_fee_reimbursement` applies, `prelims_and_fees` above is
apportioned to qualifying P&M **net of** that reimbursement, never gross. This is an arithmetic rule
the engine applies, not a surveyor judgement — shown here for transparency, not for sign-off.

---

## SECTION 10 — Reconstruction Cost & Apportionment Schedule (the s.562 build-up) `[MIXED]`

This is the residual-apportionment build-up described in `Build-Prep-Report-Pack-and-Hand-off-
Specification.md` §2 and §4.2: value the whole property element-by-element at replacement cost, value
the bare site separately, and apportion the actual purchase price in the same proportions. **No
replacement-cost figure, no multiplier and no apportioned value is pre-filled anywhere in this
section** — the register (`R-B9`) records that the residual model's own default parameters (land
fraction, prelims %, fees %) may be fitted to a single non-independent case rather than independently
derived, so this document does not present any of them as a starting draft. What auto-populates is the
*structure* of the schedule — which elements to price and against what basis — not the price itself.

| Column | State | Source |
|---|---|---|
| Element / line item | `[AUTO]` | `element_name`, `element_id` — `Caprebate-Fixture-Taxonomy-v1.csv` |
| Statutory authority | `[AUTO]` | `authority` column, same CSV — e.g. CAA 2001 s.33A(5)(a) |
| Unit / quantity basis | `[AUTO]` | `unit`, `quantity_basis` columns, same CSV |
| Quantity | `[SURVEYOR]` | measured or estimated on inspection — blank |
| Unit cost (BCIS rate, dated and versioned — BCIS is the cost source since 24 Sep 2026; Spon's is not used) | `[SURVEYOR]` | priced from the licensed cost library on inspection — blank |
| Total cost, this element | `[SURVEYOR]` | derived from the two blank cells above once entered — blank |
| Qualifying percentage | `[SURVEYOR]` | **see boxed note below — always blank** |
| Notes / basis for the % | `[SURVEYOR]` | blank |

> **Qualifying percentage — never pre-filled, including where the taxonomy already states 100%.**
> The fixture taxonomy CSV carries a `qualifying_pct` column that already reads `100` with
> `qualifying_pct_basis=STATUTORY` for most shared-core rows (e.g. `LS-SR-001` general electrical,
> `LS-MP-003` fire alarm). It would be easy to auto-fill those as "safe" because the statute is settled.
> **This template does not do that.** Whether the *specific item found on inspection* actually matches
> the taxonomy row — is it really the s.33A(5)(a) electrical installation, or a `SPLIT_REQUIRED` item
> that needs dividing (schema §1.G splitting rule), or excluded on this property's facts — is itself a
> judgement the surveyor makes on the facts in front of them, not a lookup. Rows where
> `qualifying_pct_basis=APPORTION` or `SURVEY` (e.g. `LS-CH-013` underfloor heating, all `LS-SL-00x`
> common-parts rows) are explicitly the surveyor's professional apportionment and were never going to be
> auto-filled. Both cases land in the same blank cell, for the same reason: **the percentage is the
> surveyor's call, categorically, and this document does not narrow that call with a default.**

**Reconciliation row (auto-computed once the schedule above is complete — not before):**

| | Replacement cost | Apportioned value |
|---|---|---|
| Qualifying plant and machinery (A) | *[from schedule total]* | *[= price × A/(A+B+C)]* |
| Non-qualifying building (B) | *[from schedule total]* | *[= price × B/(A+B+C)]* |
| Bare-site land (C) | *[Section 11]* | *[= price × C/(A+B+C)]* |
| **Total / purchase price** | *[sum]* | *[= base amount, Section 9]* |
| **Multiplier** | — | *[= price ÷ (A+B+C)]* |

This mirrors the structure at `caprebate-sample-report.html` §03, with every cell left for the
surveyor to complete rather than illustrated with a worked figure.

---

## SECTION 11 — Bare-Site Land Value `[SURVEYOR]`

**The question this section is answering:** *what is the value of the site as bare land, from
comparables and VOA data, at the date of acquisition?*

| Field | Surveyor to complete |
|---|---|
| Bare-site value | *[blank]* |
| Comparables relied on | *[blank]* |
| VOA basis / reference | *[blank]* |
| Date of valuation | *[blank]* |

**No default or "typical" land fraction is stated anywhere in this document.** The client-facing
sample report calls the land value "the single biggest lever" on the whole apportionment
(`caprebate-sample-report.html` §02) precisely because it is not derived from any of the data we
already hold — it comes from the surveyor's comparables work, full stop.

---

## SECTION 12 — Fixture & Fittings Inventory (per-item schedule) `[MIXED]`

This is the per-item record at schema §1.G, `fixture_item[]` — one row per item, not a flat list. The
first four columns pre-populate from the sector taxonomy; every column that follows is the surveyor's
to complete on inspection, because none of it can be known without eyes on the property.

| Column | State | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Item name | `[AUTO]` | `item_name` | DR (from `Caprebate-Fixture-Taxonomy-v1.csv`) | A |
| Taxonomy row reference | `[AUTO]` | `taxonomy_row_ref` | DR | A |
| Category | `[AUTO]` | `category` | DR | A |
| Judgement flag (contested item — needs a defence note) | `[AUTO]` | `judgement_flag` | DR | A |
| Present on inspection? | `[SURVEYOR]` | `present_flag` | SV / CA | D |
| Quantity | `[SURVEYOR]` | `quantity` | SV / CA | D |
| Cost basis (invoice / M&E line / apportioned) | `[SURVEYOR]` | `cost_basis` | DR / CD / SV | D |
| Fixture or chattel? | `[SURVEYOR]` | `fixture_vs_chattel` | SV / CTA | E |
| Already pooled by the accountant? (double-count guard) | `[SURVEYOR]` | `already_pooled` | CD (fixed-asset register) | E |
| New or second-hand? (FYA/Full Expensing eligibility) | `[SURVEYOR]` | `newness` | CD / SV | E |
| Pool tag (proposed — main / special rate / SBA) | `[SURVEYOR]` | `pool_tag` | DR / SV / CTA | D (**E in Module 05**) |
| **Qualifying percentage** | `[SURVEYOR]` | *(fixture taxonomy `qualifying_pct`)* | SV | — always blank, see Section 10 box |
| Evidence (photo / invoice / spec) | `[SURVEYOR]` | `evidence` | CD / SV | B |

**The splitting rule (schema §1.G).** Where a single taxonomy row spans both the fixture and chattel
side of the boundary — care homes' hoists, dental's chair, GP's vaccine fridge, private hospitals' MRI
and much of its high-acuity list — it must be **split into separate items at the point of capture**,
never pooled as one line. This is a structural instruction for how the surveyor completes the table,
not a judgement this template can pre-resolve; do not collapse a split row back into one line to save
space.

**Sector-specific additional per-item columns — `[SURVEYOR]`, add only for the applicable sector:**

| Sector | Additional column | Schema field | Grade |
|---|---|---|---|
| Supported Living | Within a resident dwelling? (if true, excluded) | `sl_within_dwelling` | D |
| Supported Living | Serves dwellings? (per-row test — never once on the scheme, **I-11**) | `sl_serves_dwellings` | E |
| Supported Living | Serves common parts only (% or bool) | `sl_serves_common_parts_only` | D |
| Supported Living | Grant-funded (excluded) | `sl_item_grant_funded` | — `[AUTO]` once `sl_capital_grant` is known; `DR`, grade B |
| GP | Grant-funded per element (excluded) | `gp_item_grant_funded` | — `[AUTO]` once `gp_nhs_grant_per_element` is known; `DR`, grade E |

**Loose equipment / chattels — do not attempt to price these here.** Every sector's taxonomy carries a
loose-equipment bundle (`LS-DEN-013`, `LS-GP-013`, `LS-PH-018`, `LS-SL-012` and equivalents) that is
usually already the accountant's AIA claim. The row exists in the taxonomy so the surveyor can rule
items **out** of this schedule via `already_pooled`, not so it can be priced twice.

---

## SECTION 13 — Pool Allocation Working `[MIXED]`

**Auto-populated starting point (`[AUTO]`, from the taxonomy, not a decision):**

| Column | State | Source |
|---|---|---|
| Taxonomy default pool | `[AUTO]` | `pool` column, `Caprebate-Fixture-Taxonomy-v1.csv` |
| s.21/s.22 rescue route | `[AUTO]` | `rescue_route`, `s21_status`, `s22_status` columns, same CSV |
| Contested / open-question flags | `[AUTO]` | `s21_status=contested`, `enclose_carveout=open_cta_q3` rows |

**`[SURVEYOR]` decision, per item, against the fixture schedule at Section 12:**

Accept the taxonomy default pool ☐ / Reassign to: Main pool ☐ Special rate ☐ SBA ☐ / Reason: ________

**Flag these rows for extra scrutiny before accepting the default — they are named in the master
specification as the framework's own contested judgement calls, not this template's invention:**

- Care Homes: through-floor/platform lifts, assistive flooring/handrails, underfloor heating
  (`LS-CH-013` — explicitly `CONTESTED`, "SR as heating system or MP as trade apparatus depending on
  configuration. Do not default").
- Dental: dedicated chair-position services vs the chair/unit itself (the fixture/chattel boundary,
  schema §3.2 "the central and most contestable dental call").
- GP: acoustic insulation, treatment-room/negative-pressure ventilation vs `SR` HVAC.
- Private Hospitals: theatre UCV ventilation ("the single biggest pool call"), isolation/critical-care
  pressure ventilation, isolated power supply, RF/Faraday shielding — `pool_tag` is graded **E**, not
  **D**, in this sector specifically, because it is the highest-value and most contestable call in the
  whole framework (schema §3.5 grade escalation note).
- Any row carrying `enclose_carveout=open_cta_q3` in the taxonomy (the plenum-ceiling s.33A(5)(c) vs
  s.33A(6) conflict) — this is recorded in `Module-00-Master-Engine-Specification.md` §5 as a genuinely
  unresolved CTA question, not an engine decision, and must not be resolved by this template either.

---

## SECTION 14 — Qualifying Percentage & Element-Split Determination (sign-off summary) `[SURVEYOR]`

**This section exists so the qualifying percentages do not hide inside a long schedule.** It pulls
every blank percentage from Sections 10 and 12 into one place for a single, visible professional
sign-off, per element category.

| Element category | Qualifying % | Basis for the % | Surveyor initials/date |
|---|---|---|---|
| Integral features (special rate) | *[blank]* | *[blank — survey / HMRC precedent]* | *[blank]* |
| General plant (main pool) | *[blank]* | *[blank]* | *[blank]* |
| Sector-specific clinical/care plant | *[blank]* | *[blank]* | *[blank]* |
| Structure (SBA residual) | *[blank]* | *[blank]* | *[blank]* |
| Contested / judgement-flagged items (Section 13 list) | *[blank]* | *[blank — defence note required]* | *[blank]* |

**Why this is the surveyor's call and no one else's.** `Build-Prep-Report-Pack-and-Hand-off-
Specification.md` §3.1 states it directly: *"The qualifying percentages, the element splits, the floor
area and the land value are the surveyor's calls. Nothing proceeds to the tax stage without them."*
The same section records that a reviewer pass moved a real qualifying percentage from 20.0% to 22.2%
by adjusting unit costs — evidence that the draft-to-reviewed-to-final flow is a real control on this
exact number, not a formality. This template does not shortcut that control by drafting a number for
the surveyor to nod through.

---

## SECTION 15 — Grant, Contribution & VAT Position (context) `[AUTO]`

Captured facts, shown for context so the surveyor understands what may already be excluded from the
schedule before pricing it. **The judgement calls in this block (grade `E`) are the CTA's, addressed in
the accountant/CTA report, not signed off in this document.**

| Field | Value | Schema field | Provenance | Grade | Whose call |
|---|---|---|---|---|---|
| Grant / funding answer | *[auto-fill]* | `grant_answer` | CA | C | context |
| Grant amount | *[auto-fill, if applicable]* | `grant_amount` | CD (grant agreement) | B | context |
| Irrecoverable VAT | *[auto-fill]* | `irrecoverable_vat` | CA / CD | B | context |
| GP: NHS grant per element | *[auto-fill if sector = 04]* | `gp_nhs_grant_per_element` | CA / CD | E | **CTA report** |
| GP: notional rent (income, not a grant — I-9) | *[auto-fill if sector = 04]* | `gp_notional_rent` | CA / CD | B | context — must never reduce the base |
| Supported Living: capital grant | *[auto-fill if sector = 03]* | `sl_capital_grant` | CA / CD | B | context — excluded from qualifying spend |
| **Grant quantification method (element-specific vs whole-scheme)** | not this document | `grant_quantification` | CD | **E — CTA report** |
| **Contribution payer class** | not this document | `contribution_payer_class` | CD | **E — CTA report** |
| **Partial exemption status (before VAT is included)** | not this document | `partial_exemption_status` | CA / CD | **E — CTA report** |

**I-8, stated because it changes which rows in Section 12 can even be priced.** Where a grant names
specific works, those elements are netted off **in full** (element-specific); pro-rata is correct only
where the grant is genuinely quantified against the whole scheme. Getting this wrong before the
schedule is built means pricing items that were never going to be in the claim.

---

## SECTION 16 — Sale-and-Leaseback / Disposal Position `[MIXED]`

| Field | State | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Sale-and-leaseback status (none/done/planned) | `[AUTO]` | `sale_and_leaseback` | CA / CD (S&LB agreement) | B |
| Disposal value | `[SURVEYOR]` | `ph_slb_disposal_value` | CD / SV | D |

**`[SURVEYOR]` question:** *what is the disposal value, and does it expose the seller to a balancing
charge under s.187B(6)?* Central in Module 05 (private hospitals), material in Module 01 (care homes).
Left blank; no indicative figure is offered because the schema itself notes this is "often a
deliverable in its own right, ideally at heads of terms" (§3.5) — i.e. it needs to happen before the
transaction completes, not be back-filled from a template.

---

## SECTION 17 — Structures & Buildings Allowance (SBA) Position `[MIXED]`

| Field | State | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Construction/renovation post 29 Oct 2018? | `[AUTO]` | `sba_construction_post_2018_10_29` | CD | B |
| Seller's allowance statement held (if purchase) | `[AUTO — document check]` | `sba_sellers_allowance_statement` | CD | B |
| SBA residual structure cost | `[SURVEYOR / DERIVED]` | `sba_residual_structure_cost` | DR (after P&M) | E — computable only once Sections 10 & 14 are signed off, never inherited from the P&M contribution answer (**I-6**) |
| CGT base-cost flag | `[AUTO — fixed note]` | `sba_cgt_base_cost_flag` | DR | A — "SBA reduces the CGT base cost on sale; P&M does not." Recorded, never computed. |
| Care Homes: s.270CF personal-care test | `[not this document]` | `ch_sba_s270cf_personal_care_tested` | CA / DR + CTA | **E — CTA report.** Default is to TEST, not to assume the residential bar applies — unless the configuration is self-contained flats, where the bar applies regardless and the test is not run. |
| Supported Living: SBA on dwellings | `[not this document]` | `sl_sba_on_dwellings` | DR / CD | **E — CTA report.** SBA does not rescue the dwellings. |

**I-6, stated because SBA is tested separately from P&M for contributions.** A grant or contribution
that leaves the P&M claim intact under s.536 does **not** correctly leave SBA intact — s.536(6)
switches the exception off specifically for SBA. Never carry a P&M contribution answer across into
this row.

---

## SECTION 18 — Adjacent Reliefs Flags (Land Remediation Relief) `[AUTO]`

| Field | Value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Company for LRR purposes? | *[auto-fill]* | `lrr_is_company` | CA / API (CH) | A |
| Contamination acquired from a third party? | *[auto-fill]* | `lrr_contamination_acquired_from_third_party` | CA / CD | B |
| **Polluter-pays status** | not this document | `lrr_polluter_status` | CA | **E — CTA report** |

Genuinely `[AUTO]` for the first two rows — captured facts, not judgement. The polluter-pays
determination is a filing-position call and sits with the CTA, not surveyed here.

---

## SECTION 19 — Sector-Specific Distinctive-Core Judgement Register `[SURVEYOR]`

Every sector's own specification names one judgement as the place its value and risk concentrate
(schema §3, "distinctive core"). None of these has a plausible default, and none is attempted here.

| Sector | Distinctive-core question | Schema field(s) |
|---|---|---|
| 01 Care Homes | Communal vs dwelling split method, and the PropCo/OpCo distribution risk | `ch_communal_vs_dwelling_split_m2`, `ch_propco_opco_same_group` |
| 02 Dental | Fixture-vs-chattel reconciliation on the chair; SIPP fixtures carve-out valuation | `dn_chair_classification`, `dn_sipp_connected_party_valuation` |
| 03 Supported Living | The master determination (supported living vs registered care home) | `sl_master_determination` |
| 04 GP / Primary Care | (Grant reconciliation is context-only per Section 15 — no further surveyor-only distinctive core beyond the shared fixture judgement) | — |
| 05 Private Hospitals | Main-pool vs special-rate pool allocation (see Section 13) and the SLB disposal workstream (Section 16) | `ph_judgement_item_register`, `ph_relief_lever_sequence` |

Complete only the row for the sector in front of the surveyor. Each answer is blank by design; state
the question, not a working assumption, to whoever picks this up next.

---

## SECTION 20 — Repairs vs Capital Classification (where refurbishment works apply) `[MIXED]`

| Field | State | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Works descriptions and supporting documents | `[AUTO]` | `works_descriptions` | CD (spec/M&E/invoices) | B |
| Line-by-line classification (like-for-like / improvement / reconfiguration / strip-out) | `[MIXED — AI-drafted]` | `like_for_like_vs_improvement` | CD / DR | E |

**Who confirms this one.** The schema states the mechanism explicitly: "AI drafts from the
descriptions; CTA confirms the judgement items." That makes the *confirming* professional the CTA, not
the surveyor. It is shown here as `[MIXED]` because the surveyor's own inspection findings (what
physically changed) are frequently the evidence the CTA's classification rests on — so the surveyor's
role in this section is to confirm the **physical scope of works observed**, not the revenue/capital
line itself.

**Ordering constraint that applies here regardless of sector.** Where any spend is grant-funded, the
grant strip runs **before** this classification — grant-funded spend is never classified at all
(schema §1.H ordering note, **I-16**).

**Two hard gates in this block, both `E`-grade and both CTA's, named for completeness rather than
surveyed here:** `acquired_dilapidated_repaired_before_use` (the *Law Shipping* trap) and
`integral_feature_spend_over_50pc_in_12m` (the s.33B 50% rule).

---

## SECTION 21 — Limitations, Assumptions & Restriction on Use `[MIXED]`

**Auto-populated (standard RICS-style furniture, boilerplate):**

- **Scope.** This report addresses the identification, quantification and pool allocation of qualifying
  plant and machinery for capital allowances purposes only. It is not a market valuation, a structural
  survey, a condition report, or a valuation for loan security, insurance or any purpose other than the
  stated one.
- **Basis.** The apportionment basis is CAA 2001 s.562 — a just and reasonable apportionment of the
  actual price paid, using the residual method (replacement cost of qualifying plant, non-qualifying
  building and bare-site land), consistent with the VOA/*Bowerswood* approach.
- **Standard assumptions.** Title is good and marketable; no undisclosed easements, restrictive
  covenants or third-party rights materially affect value; the property is free from contamination
  beyond anything stated; information supplied by the client and their advisers is accurate and
  complete; no allowance is made for any matter that would only be revealed by a survey outside the
  agreed scope.
- **Reliance.** This report is prepared for the stated claimant and their professional advisers only.
  It is not to be relied on by any other party, and no responsibility is accepted to any third party.
- **Currency of rates and law.** Tax rates and thresholds are stated as at the basis date in Section 3
  and are subject to change; this report is not updated for later changes unless expressly
  re-instructed.
- **Not tax advice.** Capital allowances are income or corporation tax relief on qualifying
  expenditure; they are not capital gains tax. The filing position is the CTA's, not this surveyor's.

**`[SURVEYOR]` — to complete:**

- Any special assumption departing from the standard set above, and the reason for it.
- Any limitation on the scope of inspection actually carried out (cross-refer Section 2).
- Any matter the surveyor was asked to disregard, and by whom.

---

## SECTION 22 — Professional Narrative & Findings `[SURVEYOR]`

**Genuinely empty. No draft narrative is offered, including a "neutral" or "typical" one**, because a
drafted narrative is exactly the kind of plausible-looking placeholder this template exists to avoid —
narrative framing shapes how every number above is read.

| Prompt | Surveyor to complete |
|---|---|
| General description of the property and its use | *[blank]* |
| Condition and any matters affecting value or apportionment | *[blank]* |
| Departures from the standard method, and why | *[blank]* |
| Overall professional opinion on the apportionment | *[blank]* |

---

## SECTION 23 — Declaration & Signature `[SURVEYOR]`

**Unsigned. Nothing in this block is pre-filled.**

> I confirm that I have inspected the property to the extent stated in Section 2, that the valuation
> and apportionment in this report represent my independent professional judgement, and that I have
> complied with the RICS Valuation – Global Standards (Red Book) current at the date of this report,
> including in respect of independence and objectivity.
>
> I confirm that the qualifying percentages, element splits and pool allocations in Sections 10, 12,
> 13 and 14 are my own professional determinations and were not supplied to me as a draft figure to
> confirm.
>
> Signed: _______________________________
>
> Name: _______________________________
>
> RICS registration number: _______________________________
>
> Firm: _______________________________
>
> Date: _______________________________

---

## Cross-reference — not part of this document

**The s.203 notification position** (`Build-Prep-Report-Pack-and-Hand-off-Specification.md` §4.3) is a
mandatory section in both the client report and the accountant/CTA report, triggered by an election
found in diligence or a s.200(4) reduction in the chain. It is a filing-position statement for whoever signs the filing position under clause 1 _(Phase 146a, 22 Sep 2026: this said "a CTA filing-position statement")_, not a
valuation matter, and is deliberately **not** reproduced as a section here — duplicating it in the
surveyor's document would blur exactly the professional-boundary line this template is built to keep
sharp. Cross-refer to it; do not answer it here.

---

## Coverage summary — checking the 80% claim rather than asserting it

**Section-level count, this template (23 numbered sections; front matter and the closing cross-
reference note are not counted):**

| State | Count | Sections |
|---|---|---|
| `[AUTO]` | 5 | 1, 7, 9, 15, 18 |
| `[MIXED]` | 11 | 3, 4, 5, 6, 10, 12, 13, 16, 17, 20, 21 |
| `[SURVEYOR]` | 7 | 2, 8, 11, 14, 19, 22, 23 |
| **Total** | **23** | |

**Section-level auto-populate percentage.** Scoring `[AUTO]` as full credit and `[MIXED]` as half
credit (it genuinely auto-populates *inputs*, but the section's output is not usable without a human
decision) and `[SURVEYOR]` as no credit:

`(5 × 1.0 + 11 × 0.5 + 7 × 0) ÷ 23 = 10.5 ÷ 23 ≈ 46%`

**That is not 80%, and it should be reported as such rather than rounded up.** At the section level —
which is what a surveyor actually experiences opening this document — well under half of the report's
real estate auto-populates to a usable state, because the sections carrying the most professional
weight (the fixture schedule's qualifying-percentage column, the pool allocation, the dwelling
apportionment, the sign-off summary, the declaration) are precisely the ones this task requires to stay
empty.

**Field-level count, for comparison — every field in the consolidated shared core (§1.A–§1.I),
graded by schema confidence grade, 85 fields:**

| Grade | Count | Automation position (schema §0.5) |
|---|---|---|
| A | 14 | fully automated |
| B | 41 | automated with threshold |
| C | 8 | captured, flagged (still a value, not a blank) |
| D | 7 | AI drafts, surveyor confirms |
| E | 15 | AI flags, CTA decides |

`(14 + 41 + 8) ÷ 85 ≈ 74%` of individual schema fields carry a value without needing a surveyor's or
CTA's professional judgement to produce one — close to, if a little under, the board's 80% figure.

**Reconciling the two numbers, rather than picking whichever is flattering.** The 80% claim is closer
to true measured as *data points that already have a value* — most of the schema is identity, dates,
addresses, financial base amounts and taxonomy metadata, and there is a lot of it. It is much less true
measured as *sections of the report a surveyor can sign off without exercising judgement* — because a
capital allowances valuation report's entire professional purpose is concentrated in a small number of
sections (qualifying percentage, element split, pool allocation, dwelling apportionment, declaration),
and those are exactly the sections this task requires to stay genuinely empty. Both numbers are
reported here rather than one being suppressed; neither is closer to "the truth" than the other, they
answer different questions, and a surveyor picking this template up should know both before assuming
their part of the job is 20% of the work.

---

## Fixture schedule table structure — standalone reference

For convenience, the fixture schedule column structure (Section 12) restated on its own, since it is
the table most likely to be extracted into a working spreadsheet with the surveyor:

| item_name | taxonomy_row_ref | category | pool (taxonomy default) | judgement_flag | present_flag | quantity | cost_basis | fixture_vs_chattel | already_pooled | newness | pool_tag (final) | **qualifying_pct** | evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AUTO | AUTO | AUTO | AUTO | AUTO | **empty** | **empty** | **empty** | **empty** | **empty** | **empty** | **empty** | **empty** | **empty** |

Nine of thirteen columns are the surveyor's to complete on inspection. Four pre-populate from
`Caprebate-Fixture-Taxonomy-v1.csv` and `fixture_item[]` derived (`DR`) fields. The qualifying
percentage column is empty for every row without exception, including the rows where the taxonomy's
own `qualifying_pct_basis` reads `STATUTORY` — see the boxed note at Section 10.

---

## Sources

`Build-Prep-Consolidated-Schema.md` (v1.0) — the field ids, provenance codes, confidence grades and the
sign-off rule this whole template is built around. `Build-Prep-Report-Pack-and-Hand-off-Specification.md`
— the CAVR structure and the three-hand-off model (§3.1 in particular: "nothing proceeds to the tax
stage without" the surveyor's calls). `caprebate-sample-report.html` — house structure and tone for
the apportionment table shape. `caprebate-validation-and-sign-off-brief.html` and
`Caprebate-Engine-Remediation-Register-v2.md` (**R-B9**, **R-B10**) — the specific defect this
template is built not to repeat: presenting figures to a signatory without disclosing where they came
from, and offering a working assumption that turns out to be fitted to one case rather than derived.
`Module-00-Master-Engine-Specification.md` §5–§7 — pool tags, the s.23(2)/s.23(3) rescue-route
distinction, the contested and open-question rows named in Section 13.
`Caprebate-Fixture-Taxonomy-v1.csv` — the 102-row taxonomy underlying Sections 10–13.

Indicative technical reference for the surveyor conversation only. Not tax advice, not a valuation, not
for issue to any client, accountant or HMRC in this form.
