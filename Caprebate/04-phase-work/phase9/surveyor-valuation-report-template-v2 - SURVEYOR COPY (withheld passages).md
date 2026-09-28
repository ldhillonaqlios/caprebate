# Capital Allowances Valuation Report — Template v2

> **Surveyor copy.** Passages marked [Withheld until after the first session] are held back on purpose. The full version follows the first session.

**Monday item:** 12819676756
**Version:** 2.3 · 14 September 2026 · Phase 132 · [Withheld until after the first session]. v2.2 of 12 September 2026 removed two figures that could anchor a surveyor from §8 and §14 (see the change log). v2.1, the same day, added three features from a competitor's complete report (see "What changed at v2.1"). v2.0 of 31 August 2026 superseded `strawman-surveyor-valuation-report-template.md` (v1)
**Prepared by:** Claude (Phase 52), Caprebate
**Status:** a complete draft for a chartered surveyor to sign off or amend. **Not a finished report
and not a document to be issued to any client.**

---

## What changed at v2

v1 was built on the principle that a judgement field should be left **visibly blank** rather than
pre-filled, so the surveyor's signature never lands on our arithmetic. **That principle is kept in
full at v2 and nothing has been pre-filled that was blank before.**

What changed is what sits *beside* the blank. v1 left 36 cells reading `*[blank]*` with no
indication of what was being asked. **A blank reads as an oversight. A question reads as a decision
point.** At v2 every blank carries the question it is standing in for, numbered `Q-RT-nn`, and the
questions are collected at §24 so a surveyor can work through them without reading the whole
document.

| | v1 | v2 |
|---|---|---|
| Sections | 23 | 23 (unchanged — the structure was right) |
| Sections at a real draft | [Withheld until after the first session] | **23 of 23** |
| Judgement cells reading only `*[blank]*` | 36 | **0** |
| Numbered surveyor questions on the face of the document | 0 | **34** |
| Pre-filled judgement figures | 0 | **0 — unchanged, and this is the point** |

[Withheld until after the first session]

---

## What changed at v2.1 — three features from a competitor's report (12 September 2026)

We now hold one complete Capital Allowances Valuation Report that a competitor issued to a real client
in December 2024, and we have taken it apart line by line (`Eureka-CAVR-Report-Benchmark-v1.md`, §9).
**It is seven parts to our twenty-three, and the lesson is not that ours is too long.** The analysis
names four things that make that report defensible and says three of the four are cheap to copy.
**Those three are the ones added here, and none of them was in v2.0:**

| | Feature | Where it now sits | Why it is worth having |
|---|---|---|---|
| (a) | **The statutory basis of entitlement, cited by section, in its own short block** | §3.1 | It is the first thing an inspector looks for, and it costs four lines. v2.0 cited sections only inside individual schedule rows, so nowhere on the report said in one place why a claim exists at all. |
| (b) | **An express finding on each restriction** — "applies", "does not apply" or "not established", with the reason, for s.185, s.187A and any election | §7.1 | A report that is silent on s.185 and s.187A leaves the reader to work out whether they were even considered. Our engine already reaches these conclusions; v2.0 had nowhere to state them on the face of the report. |
| (c) | **Every figure says where it came from and where it goes** | "How to read this document"; From / To references at §4 and in the §10 reconciliation | It turns the report into one arithmetic chain that can be walked in either direction. The competitor's report re-derived from its own published inputs to within £1. A report that cannot be re-derived from what it publishes is a weaker document, whoever signs it. |

**Not taken, and why.** The fourth feature, reliance conditions, is already at Section 21. Splitting the
tax consequence into a current-years and a future-years summary is a decision about which documents a
client receives, not about this template. The desktop survey pack wireframe (v6) is unchanged: these are
conventions of the signed report, not of the screens that assemble its inputs.

**Unchanged:** no judgement figure has been pre-filled and no section has changed tag. Three questions
are added, Q-RT-35 to Q-RT-37, one per feature. **We copied conventions, not the competitor's method or
figures.**

---

## What changed at v2.3 (14 September 2026, Phase 132)

[Withheld until after the first session]

---

## How to read this document

Every section carries one of three tags, and the tag is load-bearing, not decoration.

| Tag | Meaning |
|---|---|
| **`[AUTO]`** | Auto-populates from a named field in `Build-Prep-Consolidated-Schema.md`. The field id, provenance code and confidence grade are stated on the face of the section. Nothing here needed a surveyor's opinion to produce. |
| **`[SURVEYOR]`** | Genuinely empty. This is professional judgement, full stop. **At v2 the section states the exact question rather than showing an empty cell.** No default, no "typical" value, no plausible placeholder. |
| **`[MIXED]`** | Auto-populated *inputs* shown for the surveyor to accept, adjust or reject. The adjustment mechanism is shown; the decision is not made. This is the schema's own model of a `D`-grade field: "AI drafts, surveyor confirms — never the reverse" (§0.5). |

[Withheld until after the first session]

**Provenance and confidence on the face of every entry.** Every `[AUTO]` and `[MIXED]` line carries
the schema `field_id`, the provenance code (`CA`/`CD`/`API`/`SV`/`DR`/`CTA`, §0.4) and the confidence
grade (`A`–`E`, §0.5), always in that order. This is the fix for defect **R-B10** in
`Caprebate-Engine-Remediation-Register-v2.md` — a sign-off document that asked a surveyor and a CTA
to validate figures without disclosing that they came from a competitor's report rather than from
independent derivation. **A number with no visible source on this document is a defect in this
document, not a shortcut.**

**Every figure says where it came from and where it goes** *(added at v2.1)*. Each figure carries a
**From** reference — the section, schedule row, document or appendix it was taken from — and a **To**
reference — where it is used next. The report is then one chain that can be walked in either direction,
and anyone holding it can re-derive every number from what it publishes. **A figure with no From is a
defect. A figure with no To is either a dead end to delete or a missing link to find.** The references
are generated with the figure; Q-RT-37 asks how you want them written.

**Whose judgement is it.** Grade `D` is chartered-surveyor sign-off. Grade `E` is sign-off by whoever signs the filing position under clause 1 _(Phase 146a, 22 Sep 2026: this said "Grade `E` is CTA sign-off")_. This
is the *surveyor's* report, so `[SURVEYOR]` sections are, with named exceptions, the `D`-grade fields.
Where a field is genuinely `E` — a filing-position call for whoever signs the filing position under clause 1 of the engagement letter (the client's accountant or tax adviser, or the client if there is neither), not a valuation call — that is stated and
the field is routed to the accountant/CTA report
(`Build-Prep-Report-Pack-and-Hand-off-Specification.md` §4.2) rather than smuggled in here.
_(Phase 146a, 22 Sep 2026: this said "a CTA filing-position call". Grade E goes to whoever signs the filing position under clause 1, not to a tax adviser Caprebate engages per case — the engine's routing since Phase 146. Words changed only; nothing removed.)_

**Sector scope.** Shared core (§1.A–§1.I) plus five sector extensions (§3.1–§3.5). This template
carries the shared core in full and flags where a sector block plugs in. Populate only the block for
the sector actually in front of you.

---

# SECTION 1 — Report Identification & Subject Property `[AUTO]`

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

**Wales.** Where `nation = WALES`, `regulator_registration.regulator` must read **CIW** for care homes
and supported living and **HIW** for dental and private hospitals. The two Welsh regulators are not
interchangeable (schema §1.A). Confirm this resolved correctly before relying on the row.

**Q-RT-01.** Is there anything on the face of a report you would expect to see in this identification
block that is not here — a client reference, an instruction date, a report version and status marker,
a distribution list? We have built this from our data model rather than from a report you have
actually issued, so it is likely to be missing report-craft conventions we do not know about.

---

# SECTION 2 — Instruction, Surveyor's Particulars & Extent of Inspection `[SURVEYOR]`

**Not a schema field. This section does not exist in our data model at all, because it is entirely
about you, not about the property.** Nothing here should ever auto-populate.

| Field | The question it is asking |
|---|---|
| Instructing party | Who instructed this, and on what date? |
| Surveyor / firm name | — |
| RICS registration number | — |
| Professional indemnity | Policy number, sum insured, and does it cover capital allowances valuation work specifically? |
| **Basis of inspection** | Full site visit / desktop review / **video-supported desktop review**. See Q-RT-02. |
| Date(s) of inspection | — |
| Areas inspected, and areas **not** inspected with the reason | — |
| Conflicts of interest declaration | — |

**The question this section answers:** *who is signing this, on what evidential basis, and what did
they actually see?*

**Q-RT-02 — is "video-supported desktop review" a basis you would put your name to, and what is it
called?** We have invented that phrase. RICS Red Book has a restricted-basis concept; we do not know
whether a video walkthrough falls inside it, needs a special assumption, or is simply not a basis on
which this kind of report can be issued. **If the answer is "not at all", tell us now** — it changes
what we sell, not just what this section says. (See the capture script,
`video-walkthrough-capture-script-v1.md`, and the tier grid in `strawman-desktop-first-policy.md`.)

**Q-RT-03 — what do you need recorded about areas *not* inspected?** We have a row for it. We do not
know whether "first floor not inspected, occupied" is sufficient or whether a report needs the
consequence stated as well ("and no allowance has been made for plant that may be present there").

---

# SECTION 3 — Purpose, Status of Report & Basis of Engagement `[MIXED]`

**Auto-populated — boilerplate, not judgement:**

- **Report type:** Capital Allowances Valuation Report (CAVR), per
  `Build-Prep-Report-Pack-and-Hand-off-Specification.md` §4.2, Part one.
- **Status:** indicative technical reference, not tax advice, until surveyed and signed.
- **Rates basis date:** *[auto-fill from the consolidated rate table, Module 00 §3c / Build-Prep-05
  §3]*. `DR`, grade A (deterministic lookup) — **but only as good as the last re-verification. State
  the date; do not assume it is current.**
- **Purpose:** to identify and evidence qualifying plant and machinery expenditure for a UK capital
  allowances claim on the subject healthcare property.
- **Standard RICS assumptions:** set out in full at Section 21.

**`[SURVEYOR]` — for completion:**

- Any **special assumption** departing from the standard set (RICS VPS 3 style), stated and reasoned.
- Confirmation that Section 21's standard assumptions are accepted as they stand, or a marked
  amendment to any of them.

**Q-RT-04 — is the cost basis date enough, or does the report need a separate valuation date?** Our
model carries one date (when the rate table was last verified). A valuation ordinarily has a valuation
date, which may be the acquisition date, the works completion date, or the inspection date, and they
can all differ. **Which date governs, and does the report need to state more than one?**

### 3.1 Statutory basis of entitlement `[AUTO]` — wording confirmed by the tax adviser before first issue

**What the reader sees:** three or four short sentences, before any figure, saying under which
provisions the claim exists. Only the lines for the trigger actually in play are printed.

| Line on the report | Printed when | Provision (section, and its heading in the Act) |
|---|---|---|
| Entitlement to plant and machinery allowances | Always | CAA 2001 s.11 (general conditions as to availability of plant and machinery allowances) and s.15 (qualifying activities) |
| Why the claimant is treated as owning the fixtures | Own expenditure on a fixture — fit-out, refurbishment, construction | s.176 (person with interest in relevant land having fixture for purposes of qualifying activity) |
| | Purchase of an interest in land for a price that includes fixtures | s.181 (purchaser of land giving consideration for fixture) |
| | Incoming lessee where the lessor was entitled to allowances | s.183 (incoming lessee where lessor entitled to allowances) |
| Special rate expenditure | Where integral features are part of the claim | s.33A (expenditure on provision or replacement of integral features) and s.104A (special rate expenditure) |
| How the price is divided | Purchase apportionment | s.562, as stated in full at Section 21 |

Section headings were read from the Act's contents on legislation.gov.uk on 12 September 2026. **Which
fixture provision applies is not a lookup — it follows the trigger type and the ownership chain, and it
is the tax adviser's call (grade `E`).** This block prints the conclusion reached in the CTA report; it
does not reach it. **From:** the trigger type (§4) and the CTA report. **To:** §7.1, whose findings only
make sense against the route stated here.

**Where the trigger or the ownership route is not known.** An answer of "not sure" and no answer at all
are treated identically: the fixture line reads *"Route by which the claimant is treated as owning the
fixtures: not established — see the tax adviser's report."* It never falls back to s.176 or s.181
because one of them is the more common case.

**Q-RT-35 — does this block belong in your report, or only in the tax adviser's?** The competitor puts
it on the first page of the valuation report. It is a statement of law rather than of value, and your
declaration at Section 23 does not cover law. **Would you sign a report carrying it, and if so should it
say whose conclusion it is?**

---

# SECTION 4 — Executive Summary of Position `[MIXED]`

**This section deliberately contains no headline claim figure.** A qualifying-expenditure total or a
lifetime tax-saving figure cannot be produced honestly before Sections 10, 12 and 14 are complete.
What can be shown pre-survey is the *shape* of the transaction the figure will sit inside.

| Line | Value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Purchase / project trigger(s) | *[auto-fill]* | `triggers` | CA | C |
| Total consideration / base amount | *[auto-fill]* | `base_amount_per_trigger` | CA (rough) / CD (exact) | B |
| Completion / works date(s) | *[auto-fill]* | `transaction_dates` | CD (HMLR/contract) | B |
| Gross internal area | *[auto-fill, surveyor to confirm]* | `gross_internal_area_m2` | CD (EPC/plans) / SV | D |
| **Qualifying plant and machinery expenditure** | **pending Sections 10 & 14** | feeds `sba_residual_structure_cost` | DR (after P&M) | E |
| **Pool split, main / special rate** | **pending Section 13** | from `fixture_item[].pool_tag` | DR / SV / CTA | D (**E in Module 05**) |
| **Indicative lifetime tax relief** | **not computed in this document** | — | — | — |

**Decision mechanism `[MIXED]`:** accept / adjust / reject each of the first four rows against the
underlying document before the schedule sections are worked.
Accept ☐  Adjust ☐ (state correction) ____________  Reject ☐

**From / To** *(v2.1)*: triggers — From the client's answers, To §3.1 · base amount — From §9, To the
§10 reconciliation · completion or works dates — From §9, To §3 and §7.1 · gross internal area — From
§5, To the §10 quantities · qualifying plant and machinery — From §14, To the CTA report · pool split —
From §13, To the CTA report.

**Q-RT-05 — should an executive summary carry a range before the schedule is worked?** We have said
no, on the grounds that a range in an executive summary is what a reader remembers. **But a report
with no number at the front may simply not be usable by the client's accountant.** If a range is
needed, what would you put there and how would you caveat it?

**Q-RT-06 — the EPC floor-area caveat.** `gross_internal_area_m2` is very often taken from an EPC.
An EPC's floor area is not a chartered surveyor's GIA: it is GIA filtered through the NCM's
"activity area" concept (unheated enclosed space is excluded), it was measured under whatever RICS
basis was current on its assessment date, and the RICS basis is itself in an unresolved interim
state pending the Code of Measuring Practice 7th edition. **Should this report state on its face
that the area is EPC-derived and expected to differ from your own measurement, or does that
undermine the document?**

---

# SECTION 5 — Property Description & Physical Particulars `[MIXED]`

| Field | Auto-populated value | Schema field | Provenance | Grade | Decision |
|---|---|---|---|---|---|
| Address | *[auto-fill]* | `address` | CD / API (HMLR) | A | Accept ☐ Adjust ☐ Reject ☐ |
| Title number | *[auto-fill]* | `title_number` | CD / API (HMLR) | A | Accept ☐ Adjust ☐ Reject ☐ |
| Gross internal area (m²), by floor if held | *[auto-fill]* | `gross_internal_area_m2` | CD (EPC/plans) / SV | D | Accept ☐ Adjust ☐ Reject ☐ |
| Construction type | *[auto-fill]* | `construction_type` | CD / SV | D | Accept ☐ Adjust ☐ Reject ☐ |
| Build or renovation year | *[auto-fill]* | `build_or_renovation_year` | CD | B | Accept ☐ Adjust ☐ Reject ☐ |
| Property sub-type | *[auto-fill]* | `property_subtype` | CA / CD (EPC) | B | Accept ☐ Adjust ☐ Reject ☐ |
| Floor plans supplied | *[list of documents held]* | `floor_plans` | CD / SV | B | Confirm sufficiency ☐ |
| Photographs / asset schedule supplied | *[list of documents held]* | `photographs_asset_schedule` | CD / SV | B | Confirm sufficiency ☐ |

**Why `gross_internal_area_m2` and `construction_type` are `D`, not `A`.** Both feed the s.562
apportionment and the SBA residual directly (schema §1.C), and both are only as reliable as the
document they came from until a surveyor stands behind them. This is the single biggest gearing point
in the apportionment: the client-facing report already says "the land value is the single biggest
lever" (`caprebate-sample-report.html` §02), and the same is true in mirror for the area figure
feeding the cost build-up.

**Q-RT-07 — what else physically describes a healthcare property for this purpose?** We capture area,
construction type, age and sub-type. We do not capture storeys, site area, tenure extent, whether the
building is listed or in a conservation area, or whether there has been an extension of a materially
different age from the original. **Which of those would you expect on the face of the report?**

---

# SECTION 6 — Room Schedule & Sector Space Data `[MIXED]`

| Field | Auto-populated value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Room counts (shared) | *[auto-fill]* | `room_counts` | CA / SV | C |
| Care Homes: bed/room count | *[if sector 01]* | `ch_bed_room_count` | CA / SV | C |
| Dental: surgery chair count | *[if sector 02]* | `dn_surgery_chair_count` | CA / SV | C |
| GP: consulting / treatment / minor-ops rooms | *[if sector 04]* | `gp_consulting_room_counts` | CA / SV | C |
| Private Hospitals: theatre / ICU / imaging / sterile-services counts | *[if sector 05]* | `ph_high_acuity_room_counts` | CA / SV | C |

**Grade `C` means client-asserted and unverified.** Schema §0.5 / invariant I-17: a `C`-grade field
may not drive a **GATE** uncorroborated. The room count gates nothing, but it *sizes* the fixture
schedule at Section 12, so a correction here has knock-on effects there.
Accept ☐  Adjust ☐ (state correct counts) ____________

**The room-by-room equipment expectation behind this section** is set out in
`room-equipment-schedule-v2.md`, which carries a confidence grade on every row and flags 19 rows as
outright guesses. **That document, not this section, is where to spend review time on room content.**

**Q-RT-08 — how should a theatre suite be counted?** `ph_high_acuity_room_counts.theatre` does not say
whether it means theatres or theatre *spaces*. A suite is typically three to five enclosed spaces
(theatre, anaesthetic, prep, scrub, recovery). For a fixture count driven by enclosed spaces that is a
factor of three to five on the highest-value rooms we handle. **Which is it?**

**Q-RT-09 — does a room schedule belong in the report at all, or only in the working papers?** We have
put a summary here. It may be that a report should carry only the counts that drive the schedule, with
the full room list as an appendix.

---

# SECTION 7 — Ownership, Lease & Entitlement History (context) `[AUTO]`

Shown for context. **Entitlement judgement calls in this block are the CTA's, not the surveyor's** —
see the "whose call" column — and are addressed in the accountant/CTA report, not signed off here.

| Field | Value | Schema field | Provenance | Grade | Whose call |
|---|---|---|---|---|---|
| Ownership model | *[auto-fill]* | `ownership_model` | CA / CD / API (HMLR) | B | context |
| Lease status | *[auto-fill]* | `lease_exists` | CD (lease) | B | context |
| Who incurred the fit-out | *[auto-fill]* | `who_incurred_fitout` | CA / CD | B | context |
| Landlord contribution amount | *[auto-fill — a number, not a note; I-4]* | `landlord_contribution_amount` | CD (lease / contribution agreement) | B | context, deducted at Stage 1 |
| Deal structure | *[auto-fill]* | `deal_structure` | CA / CD (SPA) | B | context |
| Prior owner claimed allowances | *[auto-fill]* | `prior_owner_claimed` | CA / CD (CPSE) | B | context |
| Prior owner status | *[auto-fill]* | `prior_owner_status` | CA / CD / API | B | context |
| s.198 election exists | *[auto-fill]* | `s198_election_exists` | CD (election) | B | context |
| s.198 election value | *[auto-fill]* | `s198_election_value` | CD (election) | B | context — **caps the claim** |
| **s.198 election validity** | not this document | `s198_election_validity` | CD / DR | **E — CTA report** |
| **Connected-party transfer in chain** | not this document | `connected_party_transfer_in_chain` | CA / CD | **E — CTA report** |
| **Contributor-not-payer gate** | not this document | `is_contributor_not_payer` | CA | **E — CTA report** |

**I-7, stated once because it applies wherever a grant reduction appears in this report.** Repaying or
clawing back a grant does not restore the relief it stripped — ESC/B49 was withdrawn in 2013. Any
reduction to the qualifying base from `landlord_contribution_amount` or a grant figure is **not
reversible by later repayment.**

**Q-RT-10 — does an existing s.198 election change what you inspect?** An election caps the claim at a
stated figure for the items it names. If one exists at, say, £1 on the integral features, is there any
purpose in you pricing those items at all, or should the schedule mark them out of scope before you
attend? **This is a scoping question that would save your time and our money and we do not know the
answer.**

### 7.1 Findings on each restriction — stated on the face of the report `[AUTO]` from the CTA report · grade `E`

**v2.0 carried the facts above and no conclusion.** From v2.1 the report states a finding against each
restriction, in one of the permitted forms only, with the reason on the same line:

| Restriction | The permitted forms | Reached from |
|---|---|---|
| **s.185** — an earlier owner claimed, so the claim cannot exceed the disposal value they brought into account | *Applies — the claim is limited to £[figure] (From §7, To §10).* / *Does not apply — [the reason, and the evidence].* / *Not established — [what is missing].* | `prior_owner_claimed`, `prior_owner_status`, the conveyancing replies |
| **s.187A — the pooling requirement** | *Satisfied — [evidence].* / *Does not apply — [reason].* / *Not established — [what is missing].* | the s.187A module's outcome |
| **s.187A — the fixed value requirement, or the disposal value statement requirement** | *Applies and is satisfied by [an election / a tribunal determination / the two written statements].* / *Applies and is not satisfied — the expenditure is nil.* / *Does not apply — [reason].* / *Not established — [what is missing].* | the s.187A module's outcome |
| **An election under s.198 or s.199** | *An election fixes the value of the fixtures at £[figure] (From the election, To §10).* / *No election found in [the document examined].* / *Not established — [what is missing].* | `s198_election_exists`, `s198_election_value` |
| **s.35 — dwelling-house** | *See Section 8.* | Section 8 |

**Unknown is not a finding.** Where the answer is "not sure", and where there is no answer on file, the
line reads **"Not established"** — the same words in both cases. Neither ever prints "does not apply",
because that is the form that lets a claim through. **This is the same rule the engine applies:** a gate
that would relieve the client fires only on a fact that is actually known.

**Why this is `[AUTO]` in a surveyor's report.** Every finding here is a conclusion of law and belongs to
the tax adviser. It is printed so that the reader of the valuation can see the restrictions were
considered — the competitor's report does exactly this — and each line points to the CTA report it came
from.

**Q-RT-36 — is a one-line finding per restriction something you would put your name under?** The
finding is the tax adviser's, not yours. **Should each line say so in terms ("per the tax adviser's
report of [date]"), or should the block move to the tax adviser's report and this section simply
cross-refer?**

---

# SECTION 8 — Dwelling / Residential Apportionment `[SURVEYOR]`

**The question this section answers:** *how much of this property's cost is a dwelling (excluded under
s.35) and how much is genuinely non-residential, and by what method was that line drawn?*

| Field | Schema field | Provenance | Grade | The question |
|---|---|---|---|---|
| Residential split (m²) | `residential_split_m2` | SV / CD | D | What area is dwelling, and how was it measured? |
| Care Homes: communal vs dwelling split (extra-care) | `ch_communal_vs_dwelling_split_m2` | SV / CD (plans) | D | **See Q-RT-11 — the method is undecided in our schema, not just the number** |
| Supported Living: dwelling configuration | `sl_dwelling_configuration` | CA / CD (EPC/plans) | E | Single dwelling → the claim STOPs. Which configuration is this? |
| Supported Living: common-parts areas | `sl_common_parts_areas` | SV / CD (plans) | D | What is genuinely common parts, measured how? |
| Supported Living: segregation possible | `sl_segregation_possible` | CA / CD / SV | D | **Can common-parts cost be separated from dwelling cost on the documents that exist?** Without this the claim fails on evidence even where it exists in law (*Hora Tevfik*) |

**Q-RT-11 — measured survey or apportionment, for the extra-care communal/dwelling split?** Our schema
records this method as **undecided** (gap G-5) and calls it "the single biggest care-home claim risk".
A measured split is defensible and expensive; an area apportionment is quick and attackable. **We are
not choosing between them. Which would you use, and does it depend on the size of the scheme?**

**Q-RT-12 — where exactly is the dwelling boundary in an extra-care scheme?** A resident's flat is a
dwelling. A shared lounge is arguably not. A corridor serving only flats is arguably part of the
dwellings. **Where do you draw it, and is there a settled convention we should be building to?**

**No default land or dwelling fraction is offered anywhere in this section, deliberately.** An earlier
validation brief offered a pre-survey land band, expressed as a percentage of price, as a "working assumption"
(`caprebate-validation-and-sign-off-brief.html` B2). A band framed as a working assumption still
anchors the reader, and the remediation register records at **R-B9** that the parameters behind such
bands may have been fitted to a single non-independent case rather than independently derived. **It is
not repeated here.** *(Removed at v2.2, 12 September 2026: this sentence used to quote the band's two
figures while rejecting it. A band quoted in order to reject it still puts a range in the reader's head,
so the figures are gone and only the point remains.)*

---

# SECTION 9 — Transaction & Expenditure Base `[AUTO]`

| Field | Value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Purchase price breakdown (property / goodwill / stock / assets) | *[auto-fill]* | `purchase_price_breakdown` | CD (contract / SPA) | B |
| Acquisition costs (SDLT, legal, fees) | *[auto-fill]* | `acquisition_costs` | CD (SDLT return, invoices) | B |
| Cost detail documents held | *[list]* | `cost_detail_documents` | CD | B |
| Cost information available | *[FULL / PARTIAL / NONE]* | `cost_information_available` | CA / CD | C |
| Prelims and fees | *[auto-fill, net of any Direction 15/39(2) reimbursement — I-10]* | `prelims_and_fees` | CD | B |

**GP sector, I-10.** Where `gp_nhs_fee_reimbursement` applies, `prelims_and_fees` is apportioned to
qualifying P&M **net of** that reimbursement, never gross. An arithmetic rule the engine applies —
shown for transparency, not for sign-off.

**Q-RT-13 — what does `cost_information_available = NONE` mean for your scope?** On a bare purchase
with no cost breakdown at all, the whole of Section 10 becomes a reconstruction-cost exercise rather
than a document-reading exercise. **Is that a different instruction and a different fee, and should
this report distinguish the two on its face?**

---

# SECTION 10 — Reconstruction Cost & Apportionment Schedule (the s.562 build-up) `[MIXED]`

The residual apportionment described in `Build-Prep-Report-Pack-and-Hand-off-Specification.md` §2 and
§4.2: value the whole property element by element at replacement cost, value the bare site separately,
and apportion the actual price paid in the same proportions.

**No replacement-cost figure, multiplier or apportioned value is pre-filled.** Defect **R-B9** records
that the residual model's own default parameters (land fraction, prelims %, fees %) may have been
fitted to a single non-independent case rather than independently derived. What auto-populates is the
*structure* of the schedule — which elements to price, against what basis — not the price.

| Column | State | Source |
|---|---|---|
| Element / line item | `[AUTO]` | `element_name`, `element_id` — `Caprebate-Fixture-Taxonomy-v1.csv` |
| Statutory authority | `[AUTO]` | `authority` column — e.g. CAA 2001 s.33A(5)(a) |
| Unit / quantity basis | `[AUTO]` | `unit`, `quantity_basis` columns |
| Quantity | `[SURVEYOR]` | **Q-RT-14** |
| Unit cost (dated, versioned, from a licensed cost library) | `[SURVEYOR]` | **Q-RT-15** |
| Total cost, this element | *derived from the two above* | — |
| Qualifying percentage | `[SURVEYOR]` | **always blank — see the boxed note** |
| Notes / basis for the % | `[SURVEYOR]` | — |

> **Qualifying percentage — never pre-filled, including where the taxonomy already reads 100%.**
> The taxonomy CSV carries `qualifying_pct = 100` with `qualifying_pct_basis = STATUTORY` on most
> shared-core rows (`LS-SR-001` general electrical, `LS-MP-003` fire alarm). It would be easy to
> auto-fill those as "safe". **This template does not.** Whether the *specific item found on
> inspection* actually matches the taxonomy row — is it really the s.33A(5)(a) electrical
> installation, or a `SPLIT_REQUIRED` item needing division under the schema §1.G splitting rule, or
> excluded on this property's facts — is a judgement made on the facts in front of you, not a lookup.
> Rows reading `APPORTION` or `SURVEY` were never going to be auto-filled. Both land in the same blank
> cell for the same reason: **the percentage is categorically the surveyor's call.**

**Reconciliation (auto-computed once the schedule is complete — not before):**

| | Replacement cost | Apportioned value | From | To |
|---|---|---|---|---|
| Qualifying plant and machinery (A) | *[schedule total]* | *[= price × A/(A+B+C)]* | §10 schedule, qualifying rows, at the percentages signed at §14 | §4 qualifying expenditure line; §13 pool working |
| Non-qualifying building (B) | *[schedule total]* | *[= price × B/(A+B+C)]* | §10 schedule, non-qualifying rows | §17 SBA residual |
| Bare-site land (C) | *[Section 11]* | *[= price × C/(A+B+C)]* | §11 | this table only |
| **Total / purchase price** | *[sum]* | *[= base amount, Section 9]* | §9 base amount | ties back to §9, and must equal it |
| **Multiplier** | — | *[= price ÷ (A+B+C)]* | §9 and the three rows above | the three apportioned values in this table |

The three parts must reconstitute the price paid. **That tie-back is the s.562 "just and reasonable"
apportionment**, and it is asserted on every run rather than trusted.

**Q-RT-37 — how should the From / To references be written?** As bare section numbers ("From 3.2",
"To 1.1"), which is what the competitor does, or as named rows ("From the §10 schedule total")? **And is
there any figure in a report like this that genuinely has no source to cite — one you would enter from
professional judgement alone?** If so, its From should say exactly that rather than be left blank.

**Q-RT-14 — where do quantities come from when no fire plan, M&E schedule or O&M manual exists?** This
is the whole subject of `s9-quantity-derivation-v2.md`. Short version: we have rebuilt the method to
count enclosed rooms rather than scale floor area, because on a 268 m² dental fit-out the area method
gave 2.4–4.8 detection points and a room count gave 15–19. **Is the room-driven method right, and is
15–19 the right order of magnitude?**

**Q-RT-15 — which cost library, at what edition, and how is it evidenced?** We hold price books that
are two to five years old and whose licensing position for this use is unestablished, so **we cannot
put any figure from them into a claim**. What do you price from, and does the report need to name the
source and edition on the face of each rate?

**Q-RT-16 — the prelims and professional-fee uplifts.** Our residual model applies a prelims uplift and
a professional-fee uplift to the reconstruction cost. Both defaults are under challenge internally:
one may be a double count (it is applied to a base that already includes it), and the other is a flat
percentage where a banded scale would be more defensible. **What would you apply, and to what base?**

**Q-RT-17 — indexation.** Reconstruction cost is a cost *today*; the expenditure was incurred at the
transaction date. **Do you index the reconstruction cost back to the transaction date, or value at
today's cost and let the apportionment ratio absorb it?** The two give different answers and we do not
know which is conventional.

---

# SECTION 11 — Bare-Site Land Value `[SURVEYOR]`

**The question this section answers:** *what is the value of the site as bare land, at the date of
acquisition, and on what evidence?*

| Field | The question |
|---|---|
| Bare-site value | What is it? |
| Comparables relied on | Which transactions, and why are they comparable to a healthcare site? |
| VOA basis / reference | Is there a VOA figure, and does it help or is it the wrong basis? |
| Date of valuation | Acquisition date, or another date — see Q-RT-04 |
| Planning assumption | **Q-RT-19** |

**No default or "typical" land fraction is stated anywhere in this document.** The client-facing sample
report calls the land value "the single biggest lever" on the whole apportionment precisely because it
is not derived from anything we hold — it comes from your comparables work.

**Q-RT-18 — how do you find comparables for a bare site under an operating care home or dental
practice?** There is rarely a recent bare-land transaction for a small healthcare site. **What do you
actually do, and how much of a job's cost is this one number?** If it is expensive, that changes our
pricing model, not just this section.

**Q-RT-19 — on what planning assumption is the bare site valued?** As existing use? As if consented for
the healthcare use that is actually there? As if consented for the highest alternative value? These
give materially different land values, and **because a higher land value gives a lower qualifying
figure, the assumption chosen moves the claim in a direction that is not neutral.** We would rather
this were an explicit stated assumption on the face of every report than an implicit choice.

---

# SECTION 12 — Fixture & Fittings Inventory (per-item schedule) `[MIXED]`

The per-item record at schema §1.G, `fixture_item[]` — one row per item, not a flat list. [Withheld until after the first session]

**The splitting rule (schema §1.G).** Where one taxonomy row spans both sides of the fixture/chattel
boundary — care-home hoists, the dental chair, the GP vaccine fridge, most of the private-hospital
high-acuity list — it is **split into separate items at the point of capture**, never pooled as one
line. Do not collapse a split row back to save space.

**Sector-specific additional columns `[SURVEYOR]` — add only for the applicable sector:**

| Sector | Column | Schema field | Grade |
|---|---|---|---|
| Supported Living | Within a resident dwelling? (if true, excluded) | `sl_within_dwelling` | D |
| Supported Living | Serves dwellings? (**per row, never once on the scheme — I-11**) | `sl_serves_dwellings` | E |
| Supported Living | Serves common parts only (% or bool) | `sl_serves_common_parts_only` | D |
| Supported Living | Grant-funded (excluded) | `sl_item_grant_funded` | `[AUTO]` once `sl_capital_grant` known; DR, B |
| GP | Grant-funded per element (excluded) | `gp_item_grant_funded` | `[AUTO]` once `gp_nhs_grant_per_element` known; DR, E |

**Loose equipment / chattels — do not price these here.** Every sector's taxonomy carries a
loose-equipment bundle (`LS-CH-015`, `LS-DEN-013`, `LS-SL-012`, `LS-GP-013`, `LS-PH-018`) that is
usually already the accountant's AIA claim. **The row exists so you can rule items *out* via
`already_pooled`, not so they can be priced twice.**

**Q-RT-20 — is `already_pooled` answerable at all without the fixed-asset register in front of you?**
We have graded it E and put it in your column. It may be that it simply cannot be answered on
inspection and must come back from the accountant before your schedule can be finalised — which would
make it a sequencing constraint on the whole job, not a column.

**Q-RT-21 — what physical test do you apply for fixture versus chattel?** Degree and purpose of
annexation is the legal test. **What do you actually look at?** We ask our clients on video to say
whether benching is built in or freestanding (see the capture script §B.8) — is that the right
question to be asking a layperson, or is it useless without your eyes?

**Q-RT-22 — the taxonomy has gaps we have found and cannot close.** `room-equipment-schedule-v2.md` §6
lists seven items with no taxonomy row: emergency lighting, commercial kitchen extract, clinical
flooring, reception security glazing, controlled-drug storage outside a dispensary, standby power
outside care homes, and the ventilation family. **Emergency lighting is the one that matters most** —
if it is an integral feature it is 6%, if it is trade apparatus it is 14%, and it is in every building
we will ever survey.

---

# SECTION 13 — Pool Allocation Working `[MIXED]`

**Auto-populated starting point (from the taxonomy — not a decision):**

| Column | State | Source |
|---|---|---|
| Taxonomy default pool | `[AUTO]` | `pool` column, taxonomy CSV |
| s.21 / s.22 rescue route | `[AUTO]` | `rescue_route`, `s21_status`, `s22_status` columns |
| Contested / open-question flags | `[AUTO]` | `s21_status=contested`, `enclose_carveout=open_cta_q3` rows |

**`[SURVEYOR]` decision, per item, against Section 12:**
Accept the taxonomy default ☐ / Reassign to: Main pool ☐ Special rate ☐ SBA ☐ / Reason: __________

**Flag these for extra scrutiny before accepting a default. They are named as contested in the master
specification, not invented by this template:**

- **Care Homes** — through-floor / platform lifts; assistive flooring and handrails; underfloor
  heating (`LS-CH-013`, explicitly `CONTESTED`: "SR as heating system or MP as trade apparatus
  depending on configuration. Do not default").
- **Dental** — dedicated chair-position services versus the chair/unit itself (schema §3.2: "the
  central and most contestable dental call").
- **GP** — acoustic insulation; treatment-room negative-pressure ventilation versus `SR` HVAC.
- **Private Hospitals** — theatre UCV ("the single biggest pool call"); isolation and critical-care
  pressure ventilation; isolated power supply; RF/Faraday and radiation shielding. **`pool_tag` is
  graded E, not D, in this sector specifically** (schema §3.5 grade escalation).
- **Any row carrying `enclose_carveout = open_cta_q3`** — the plenum-ceiling s.33A(5)(c) versus
  s.33A(6) conflict, recorded in Module 00 §5 as genuinely unresolved. Not resolved by this template
  either.

**Q-RT-23 — the ventilation family, asked once.** Dental LDU and AGP extract; GP enhanced treatment-room
ventilation; private-hospital UCV and isolation ventilation. Four contested calls that may be one
question asked four times. **Is there a single distinguishing principle — clinically driven versus
comfort driven, perhaps — that resolves all four?** If the answer genuinely differs case by case,
tell us what the distinguishing factor is and we will build it into the question flow rather than
asking you again on every job.

**Q-RT-24 — what does a defence note need to contain?** Contested rows need one. We do not know
whether that means a paragraph, a cited case, a photograph, or a specification extract. **Show us one
you would write and we will build the template around it.**

---

# SECTION 14 — Qualifying Percentage & Element-Split Determination (sign-off summary) `[SURVEYOR]`

**This section exists so the qualifying percentages do not hide inside a long schedule.** It pulls
every percentage from Sections 10 and 12 into one place for a single, visible sign-off.

| Element category | Qualifying % | Basis for the % | Initials / date |
|---|---|---|---|
| Integral features (special rate) | | survey / HMRC precedent / other | |
| General plant (main pool) | | | |
| Sector-specific clinical or care plant | | | |
| Structure (SBA residual) | | | |
| Contested / judgement-flagged items (Section 13 list) | | **defence note required** | |

**Why this is the surveyor's call and no one else's.**
`Build-Prep-Report-Pack-and-Hand-off-Specification.md` §3.1: *"The qualifying percentages, the element
splits, the floor area and the land value are the surveyor's calls. Nothing proceeds to the tax stage
without them."* The same section records that a reviewer pass moved a real qualifying percentage by adjusting unit
costs *(the before and after figures were removed at v2.2, 12 September 2026 — a qualifying percentage
from another case is exactly the kind of number this template must not show you)* — **evidence that the draft → reviewed → final flow is a real
control on this exact number, not a formality.** This template does not shortcut that control by
drafting a figure for you to nod through.

**Q-RT-25 — is a per-category percentage the right shape, or should it be per item only?** We have
built both: Section 12 is per item and this section aggregates. If a category percentage is
meaningless to you, we will delete this section rather than have it sit there being ignored.

---

# SECTION 15 — Grant, Contribution & VAT Position (context) `[AUTO]`

Captured facts, shown so you understand what may already be excluded before you price it. **The
judgement calls here (grade `E`) are the CTA's**, addressed in the accountant/CTA report.

| Field | Value | Schema field | Provenance | Grade | Whose call |
|---|---|---|---|---|---|
| Grant / funding answer | *[auto-fill]* | `grant_answer` | CA | C | context |
| Grant amount | *[auto-fill]* | `grant_amount` | CD (grant agreement) | B | context |
| Irrecoverable VAT | *[auto-fill]* | `irrecoverable_vat` | CA / CD | B | context |
| GP: NHS grant per element | *[if sector 04]* | `gp_nhs_grant_per_element` | CA / CD | E | **CTA report** |
| GP: notional rent (income, not a grant — I-9) | *[if sector 04]* | `gp_notional_rent` | CA / CD | B | context — **must never reduce the base** |
| Supported Living: capital grant | *[if sector 03]* | `sl_capital_grant` | CA / CD | B | context — excluded from qualifying spend |
| **Grant quantification method** (element-specific vs whole-scheme) | not this document | `grant_quantification` | CD | **E — CTA report** |
| **Contribution payer class** | not this document | `contribution_payer_class` | CD | **E — CTA report** |
| **Partial exemption status** | not this document | `partial_exemption_status` | CA / CD | **E — CTA report** |

**I-8, stated because it changes which rows in Section 12 can even be priced.** Where a grant names
specific works, those elements are netted off **in full**; pro-rata is correct only where the grant is
genuinely quantified against the whole scheme. Getting this wrong before the schedule is built means
pricing items that were never going to be in the claim.

**Q-RT-26 — should grant-excluded items appear in your schedule at nil, or not appear at all?** Showing
them at nil documents that they were considered. Omitting them keeps the schedule short. **Which reads
better to HMRC?**

---

# SECTION 16 — Sale-and-Leaseback / Disposal Position `[MIXED]`

| Field | State | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Sale-and-leaseback status (none / done / planned) | `[AUTO]` | `sale_and_leaseback` | CA / CD (S&LB agreement) | B |
| Disposal value | `[SURVEYOR]` | `ph_slb_disposal_value` | CD / SV | D |

**The question:** *what is the disposal value, and does it expose the seller to a balancing charge
under s.187B(6)?* Central in Module 05 (private hospitals), material in Module 01 (care homes).

No indicative figure is offered, because the schema itself notes this is "often a deliverable in its
own right, ideally at heads of terms" (§3.5) — it needs to happen *before* the transaction completes,
not be back-filled from a template.

**Q-RT-27 — is a disposal valuation a different instruction?** It has a different purpose, a different
counterparty and arguably a different duty of care from an apportionment. **Should it be a separate
report with its own engagement, rather than a section of this one?**

---

# SECTION 17 — Structures & Buildings Allowance (SBA) Position `[MIXED]`

| Field | State | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Construction / renovation post 29 Oct 2018? | `[AUTO]` | `sba_construction_post_2018_10_29` | CD | B |
| Seller's allowance statement held (if purchase) | `[AUTO — document check]` | `sba_sellers_allowance_statement` | CD | B |
| SBA residual structure cost | `[DERIVED]` | `sba_residual_structure_cost` | DR (after P&M) | E — computable only once Sections 10 and 14 are signed off, **never inherited from the P&M contribution answer (I-6)** |
| CGT base-cost flag | `[AUTO — fixed note]` | `sba_cgt_base_cost_flag` | DR | A — "SBA reduces the CGT base cost on sale; P&M does not." Recorded, never computed |
| Care Homes: s.270CF personal-care test | not this document | `ch_sba_s270cf_personal_care_tested` | CA / DR + CTA | **E — CTA report.** Default is to **TEST**, not to assume the residential bar applies — unless the configuration is self-contained flats, where the bar applies regardless |
| Supported Living: SBA on dwellings | not this document | `sl_sba_on_dwellings` | DR / CD | **E — CTA report.** SBA does not rescue the dwellings |

**I-6, stated because SBA is tested separately from P&M for contributions.** A grant or contribution
that leaves the P&M claim intact under s.536 does **not** correctly leave SBA intact — s.536(6)
switches the exception off specifically for SBA. **Never carry a P&M contribution answer across into
this row.**

**Q-RT-28 — does the SBA residual need its own valuation input from you, or is it purely arithmetic?**
We treat it as what is left after P&M and land. If SBA has its own qualifying-cost rules that make the
residual wrong, we need to know before we build the arithmetic that way.

---

# SECTION 18 — Adjacent Reliefs Flags (Land Remediation Relief) `[AUTO]`

| Field | Value | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Company for LRR purposes? | *[auto-fill]* | `lrr_is_company` | CA / API (CH) | A |
| Contamination acquired from a third party? | *[auto-fill]* | `lrr_contamination_acquired_from_third_party` | CA / CD | B |
| **Polluter-pays status** | not this document | `lrr_polluter_status` | CA | **E — CTA report** |

Genuinely `[AUTO]` for the first two — captured facts, not judgement. The polluter-pays determination
is a filing-position call and sits with the CTA.

**Q-RT-29 — would you expect to spot LRR-relevant contamination on a capital allowances inspection, or
is that outside your instruction entirely?** We flag it because the reliefs sit adjacent. If noticing
it is not part of this job, we will move the flag out of the surveyor's report and into the CTA's.

---

# SECTION 19 — Sector-Specific Distinctive-Core Judgement Register `[SURVEYOR]`

Every sector's specification names one judgement where its value and risk concentrate (schema §3,
"distinctive core"). **None has a plausible default and none is attempted here.** Complete only the
row for the sector in front of you.

| Sector | The distinctive-core question | Schema field(s) |
|---|---|---|
| 01 Care Homes | The communal versus dwelling split method, and the PropCo/OpCo distribution risk | `ch_communal_vs_dwelling_split_m2`, `ch_propco_opco_same_group` |
| 02 Dental | Fixture-versus-chattel reconciliation on the chair; SIPP fixtures carve-out valuation | `dn_chair_classification`, `dn_sipp_connected_party_valuation` |
| 03 Supported Living | The master determination — supported living or registered care home | `sl_master_determination` |
| 04 GP / Primary Care | Grant reconciliation is context-only (Section 15); **no further surveyor-only distinctive core beyond the shared fixture judgement — see Q-RT-30** | — |
| 05 Private Hospitals | Main-pool versus special-rate allocation (Section 13) and the SLB disposal workstream (Section 16) | `ph_judgement_item_register`, `ph_relief_lever_sequence` |

**Q-RT-30 — is it right that GP has no distinctive surveyor judgement of its own?** Every other sector
has one. GP's row is empty in our schema, which either means primary care genuinely is the simplest
sector for a surveyor, or means we have missed something. **We suspect the latter and cannot see it.**

---

# SECTION 20 — Repairs versus Capital Classification (refurbishment works only) `[MIXED]`

| Field | State | Schema field | Provenance | Grade |
|---|---|---|---|---|
| Works descriptions and supporting documents | `[AUTO]` | `works_descriptions` | CD (spec / M&E / invoices) | B |
| Line-by-line classification (like-for-like / improvement / reconfiguration / strip-out) | `[MIXED — AI-drafted]` | `like_for_like_vs_improvement` | CD / DR | E |

**Who confirms this one.** The schema states it: "AI drafts from the descriptions; CTA confirms the
judgement items." **The confirming professional is the CTA, not the surveyor.** It is shown as
`[MIXED]` because your inspection findings — *what physically changed* — are frequently the evidence
the CTA's classification rests on. **Your role here is to confirm the physical scope of works
observed, not the revenue/capital line.**

**Ordering constraint, all sectors.** Where any spend is grant-funded, the grant strip runs **before**
this classification — grant-funded spend is never classified at all (schema §1.H, **I-16**).

**Two hard gates in this block, both `E` and both the CTA's**, named for completeness rather than
surveyed here: `acquired_dilapidated_repaired_before_use` (the *Law Shipping* trap) and
`integral_feature_spend_over_50pc_in_12m` (the s.33B 50% rule).

**Q-RT-31 — can you tell on inspection what was replaced like-for-like versus improved?** A new boiler
in an old plant room looks like a new boiler. If the answer is "only from the specification, not from
looking", then this section's evidence comes from documents and your role in it is smaller than we
have drawn it.

---

# SECTION 21 — Limitations, Assumptions & Restriction on Use `[MIXED]`

**Auto-populated — standard furniture, boilerplate:**

- **Scope.** This report addresses the identification, quantification and pool allocation of qualifying
  plant and machinery for capital allowances purposes only. It is **not** a market valuation, a
  structural survey, a condition report, or a valuation for loan security, insurance or any purpose
  other than the one stated.
- **Basis.** The apportionment basis is CAA 2001 s.562 — a just and reasonable apportionment of the
  actual price paid, using the residual method (replacement cost of qualifying plant, non-qualifying
  building, and bare-site land), consistent with the VOA / *Bowerswood* approach.
- **Standard assumptions.** Title is good and marketable; no undisclosed easements, restrictive
  covenants or third-party rights materially affect value; the property is free from contamination
  beyond anything stated; information supplied by the client and their advisers is accurate and
  complete; no allowance is made for any matter that would only be revealed by a survey outside the
  agreed scope.
- **Reliance.** Prepared for the stated claimant and their professional advisers only. Not to be relied
  on by any other party; no responsibility is accepted to any third party.
- **Currency of rates and law.** Tax rates and thresholds are stated as at the basis date in Section 3
  and are subject to change. This report is not updated for later changes unless expressly
  re-instructed.
- **Not tax advice.** Capital allowances are income or corporation tax relief on qualifying
  expenditure; they are not capital gains tax. The filing position is the CTA's, not the surveyor's.

**`[SURVEYOR]` — to complete:**

- Any **special assumption** departing from the standard set above, and the reason.
- Any **limitation on the scope of inspection** actually carried out (cross-refer Section 2).
- Any matter you were asked to **disregard**, and by whom.

**Q-RT-32 — is this limitations set adequate for a video-supported basis?** If a report rests partly on
client-supplied footage, the standard assumption "information supplied by the client is accurate and
complete" is carrying much more weight than usual. **Does it need its own express assumption, and what
would it say?**

---

# SECTION 22 — Professional Narrative & Findings `[SURVEYOR]`

**Genuinely empty. No draft narrative is offered, including a "neutral" or "typical" one**, because a
drafted narrative is exactly the plausible-looking placeholder this template exists to avoid —
framing shapes how every number above is read.

**What we can offer instead of a draft is the question each prompt is asking:**

| Prompt | The question it is asking |
|---|---|
| General description of the property and its use | What is this building, what happens in it, and what about that drives the fixture content? |
| Condition and matters affecting value or apportionment | What did you see that changes the numbers — obsolescence, mid-refurbishment, a part not in use, a defect? |
| Departures from the standard method, and why | Where did you not follow the residual method, and what did you do instead? |
| Overall professional opinion on the apportionment | Is the result reasonable, and where is it most vulnerable to challenge? |

**Q-RT-33 — what is the shortest narrative you would sign?** We are trying to understand how much
writing a report like this actually requires, because it is the part we cannot automate at all and it
therefore sets the floor on what a job costs.

---

# SECTION 23 — Declaration & Signature `[SURVEYOR]`

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

**Q-RT-34 — is the second paragraph of that declaration acceptable to you, and is it true of this
process?** We wrote it as a control on ourselves: it is a statement that we did not hand you a number
to rubber-stamp. **But it is also a statement you are being asked to sign about our conduct, which is
an unusual thing to ask.** If it is the wrong instrument, tell us — we want the control, not
necessarily this wording.

---

# Cross-reference — deliberately not a section here

**The s.203 notification position** (`Build-Prep-Report-Pack-and-Hand-off-Specification.md` §4.3) is a
mandatory section in both the client report and the accountant/CTA report, triggered by an election
found in diligence or a s.200(4) reduction in the chain. **It is a filing-position statement for whoever signs the filing position under clause 1, not a
valuation matter** _(Phase 146a, 22 Sep 2026: this said "a CTA filing-position statement")_, and is deliberately not reproduced here — duplicating it in the surveyor's document
would blur the professional-boundary line this template exists to keep sharp. Cross-refer; do not
answer it here.

---

# Coverage — measured, not asserted

[Withheld until after the first session]

---

# Fixture schedule table structure — standalone reference

[Withheld until after the first session]

---

# §24 — The 37 questions, collected

Work through these without reading the sections if you prefer. Section references in brackets.

**Report craft and basis**
1. Q-RT-01 — what is missing from the identification block? *(§1)*
2. Q-RT-02 — is "video-supported desktop review" a basis you would sign? *(§2)*
3. Q-RT-03 — what must be recorded about areas not inspected? *(§2)*
4. Q-RT-04 — one date or several: cost basis date versus valuation date? *(§3)*
5. Q-RT-05 — should the executive summary carry a range at all? *(§4)*
6. Q-RT-06 — should the EPC floor-area caveat appear on the face of the report? *(§4)*
7. Q-RT-07 — what else physically describes the property for this purpose? *(§5)*

**Rooms and quantities**
8. Q-RT-08 — how is a theatre suite counted: theatres or theatre spaces? *(§6)*
9. Q-RT-09 — does the room schedule belong in the report or the working papers? *(§6)*
10. Q-RT-14 — where do quantities come from with no fire plan or M&E schedule? *(§10)*

**Entitlement scoping**
11. Q-RT-10 — does an existing s.198 election change what you inspect? *(§7)*
12. Q-RT-13 — is a no-cost-information job a different instruction and fee? *(§9)*

**The dwelling line**
13. Q-RT-11 — measured survey or apportionment for the extra-care split? *(§8)*
14. Q-RT-12 — where exactly is the dwelling boundary in an extra-care scheme? *(§8)*

**Cost and land — the numbers that move everything**
15. Q-RT-15 — which cost library, what edition, evidenced how? *(§10)*
16. Q-RT-16 — prelims and professional fees: what, and on what base? *(§10)*
17. Q-RT-17 — index reconstruction cost back to the transaction date, or not? *(§10)*
18. Q-RT-18 — how do you find bare-site comparables, and what does it cost? *(§11)*
19. Q-RT-19 — **on what planning assumption is the bare site valued?** *(§11)*

**Fixtures, pools and the taxonomy**
20. Q-RT-20 — is `already_pooled` answerable on inspection at all? *(§12)*
21. Q-RT-21 — what physical test do you apply for fixture versus chattel? *(§12)*
22. Q-RT-22 — **seven items have no taxonomy row; emergency lighting matters most.** *(§12)*
23. Q-RT-23 — **the ventilation family: one question or four?** *(§13)*
24. Q-RT-24 — what does a defence note need to contain? *(§13)*
25. Q-RT-25 — per-category percentages, or per item only? *(§14)*

**The other reliefs and the boundaries**
26. Q-RT-26 — grant-excluded items at nil, or omitted? *(§15)*
27. Q-RT-27 — is a disposal valuation a separate instruction? *(§16)*
28. Q-RT-28 — does the SBA residual need its own input from you? *(§17)*
29. Q-RT-29 — is spotting contamination inside your instruction? *(§18)*
30. Q-RT-30 — **why does GP have no distinctive surveyor judgement? We think we missed one.** *(§19)*
31. Q-RT-31 — can you tell like-for-like from improvement on inspection? *(§20)*

**The report itself**
32. Q-RT-32 — do the limitations work for a video-supported basis? *(§21)*
33. Q-RT-33 — what is the shortest narrative you would sign? *(§22)*
34. Q-RT-34 — is the declaration's second paragraph an acceptable instrument? *(§23)*

**Added at v2.1 — three features from a competitor's report**
35. Q-RT-35 — does the statutory basis of entitlement belong in your report or the tax adviser's? *(§3.1)*
36. Q-RT-36 — would you sign a one-line finding on each restriction, given it is the tax adviser's? *(§7.1)*
37. Q-RT-37 — how should the From / To references be written, and does any figure have no source? *(§10)*

**If you only answer five:** Q-RT-02 (can this be done from a desk at all), Q-RT-15 (what do you price
from), Q-RT-19 (the land assumption), Q-RT-22 (the taxonomy gaps), Q-RT-23 (the ventilation family).
Those five change what we build. The rest change how it reads.

---

# Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 29 Aug 2026 | Initial strawman. 23 sections, three-tag model, provenance and grade on every auto-populated line. 36 judgement cells left as `*[blank]*`. |
| **2.0** | **31 Aug 2026** | **Every `*[blank]*` replaced by the question it stood in for. 34 numbered questions added and collected at §24 with a five-question priority set. No pre-filled judgement figure added anywhere — the v1 discipline is unchanged. [Withheld until after the first session]** |
| **2.1** | **12 Sep 2026** | **Three features from a competitor's complete valuation report added (benchmark §9): a statutory basis of entitlement block (§3.1); an express finding on each restriction, reading "not established" for both a not-sure and a missing answer (§7.1); From / To references on every figure (How to read; §4; §10 reconciliation). Q-RT-35 to Q-RT-37 added. No judgement figure pre-filled; no section tag changed.** |
| **2.2** | **12 Sep 2026** | **Two figures that could anchor a surveyor removed, with a dated note left in place of each: the two ends of a rejected pre-survey land band in §8, and the before and after qualifying percentages of an earlier case in §14. No other change.** |
| **2.3** | **14 Sep 2026** | [Withheld until after the first session] |

---

# Sources

`Build-Prep-Consolidated-Schema.md` (v1.0) — field ids, provenance codes, confidence grades, and the
sign-off rule this template is built around. `Build-Prep-Report-Pack-and-Hand-off-Specification.md` —
CAVR structure and the three-handoff model (§3.1 in particular). `caprebate-sample-report.html` —
house structure and tone for the apportionment table. `caprebate-validation-and-sign-off-brief.html`
and `Caprebate-Engine-Remediation-Register-v2.md` (**R-B9**, **R-B10**) — the specific defects this
template is built not to repeat. `room-equipment-schedule-v2.md` and `s9-quantity-derivation-v2.md` —
the room content and quantity method Sections 6, 10 and 12 depend on.
`video-walkthrough-capture-script-v1.md` — the evidential basis Q-RT-02 and Q-RT-32 turn on.
`Eureka-CAVR-Report-Benchmark-v1.md` §9 — the three features added at v2.1. CAA 2001 section headings at
§3.1 read from the Act's contents on legislation.gov.uk, 12 September 2026.

**A template, not a report. Not tax advice, not a valuation, and not a capital allowances claim.** No
qualifying percentage, element split, pool allocation or apportionment figure in this document has
been determined by a chartered surveyor.
