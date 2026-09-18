# Straw-man — Desktop-First Policy: When a Site Visit Can Be Replaced by a Video Walkthrough (v0.2)

**Monday item 12819697866** — "Agree when a site visit can be replaced by a video walkthrough."

**v0.2, 12 September 2026 (Phase 129):** §2.2, §6 and §7 corrected so that only the evidential basis a case is instructed on travels to the surveyor — never the value band, the complexity score or the estimate behind them. Nothing else changed.

> **THIS IS A DRAFT FOR A CHARTERED SURVEYOR TO CORRECT. IT IS NOT PROFESSIONAL ADVICE, AND IT
> IS NOT A SETTLED POLICY.** No RICS-registered surveyor has been appointed to this project at the
> time of writing (27 Aug 2026). Everything below was drafted by a non-surveyor working from the
> existing build-prep documents, to give the surveyor a structure to correct rather than a blank
> page. **Every threshold VALUE in this document — the job-value bands, the complexity cut-points,
> the grid mapping, the escalation trigger levels — is deliberately left blank or marked
> `[SURVEYOR'S CALL]`.** Do not fill them in from general knowledge, comparable schemes, or
> guesswork; they are exactly the numbers this document exists to surface as open, not to invent.
> The companion document, `phase9/surveyor-call-agenda.md`, is built to close these blanks in a
> 45-minute call. Nothing in this document should be relied on, cited to a client, or used to
> decide an actual job until a surveyor has reviewed and amended it.

---

## 1. The question, stated precisely

For a given capital-allowances job, captured through the desktop pack and (where used) the guided
video walkthrough (`Build-Prep-Video-Capture-Protocol.md`), **at what point is the desktop-plus-video
evidence sufficient for the chartered surveyor to sign the CAVR without attending the property in
person — and at what point must a physical inspection happen regardless of how good the video is?**

This is not one threshold. The Video Capture Protocol's own open-items list already flags it as
undecided: *"Define the coverage-score thresholds and the re-shoot loop UX (pass mark, how many
retries, when it escalates to a physical visit)"* (§7). This document proposes the **structure** in
which that decision sits — the axes, the tiers, the evidence required at each tier, and the
safety-valve triggers — so the surveyor is correcting a shape rather than inventing one from
nothing.

**Framing borrowed from the schema (see `Build-Prep-Consolidated-Schema.md` §0.5), because it is the
sharpest available lens:** every field in the engine carries a confidence grade A–E, and grade **D**
is explicitly *"surveyor judgement — chartered-surveyor sign-off; AI may draft, never finalise"* and
**blocks sign-off** until resolved. A number of the fields that carry a `D` grade also carry `SV`
("our survey, chartered surveyor, on site") as part of their provenance. **The desktop-first question
is really the question of which of those `D`-graded, `SV`-provenanced fields can be re-graded on
video-plus-document evidence alone, and which cannot** — see §4.

---

## 2. The axes and the tiers

### 2.1 Why two axes, not one

A single "job size" cut-off does not capture the actual risk. A £40,000 dental fit-out with full
invoices and a straightforward lease is a very different desktop proposition from a £40,000
supported-living conversion where the communal/dwelling split is contested and no s.198 election
exists. The policy needs **job value** and **complexity** as separate axes, combined into a tier —
mirroring the shape the CAVR sign-off gate at `caprebate-desktop-survey-pack-wireframe-v6.html`
§12 already uses (a three-way declaration — *adopt and sign* / *adopt subject to targeted capture* /
*physical inspection required* — driven by named, visible criteria, not a single number).

### 2.2 Axis 1 — Job value

Measured at the **Stage 1 desktop estimate** of qualifying expenditure (pre-CAVR, i.e. before the
figure this whole exercise exists to firm up) — because that is the only value available at the
point the visit-or-video decision has to be made.

> **Corrected 12 September 2026 (Phase 129) — this axis reads a figure the surveyor may not see.**
> The Stage 1 desktop estimate of qualifying expenditure is one of the estimate outputs withheld from
> the surveyor until they have committed their own figures (the anchor quarantine), and a value band is
> that estimate in band form. So, on this axis as drafted: **we assign the V-band, the C-band and the
> tier internally, and the only thing that travels to the surveyor is the evidential basis the case is
> instructed on** — desktop only, desktop with video, desktop with video and targeted capture, or a site
> visit. The V-band, the C-band, the complexity score and the estimate do not travel. The surveyor may
> always escalate the basis, on the complexity factors they can see and the §5 triggers.
>
> **What this does not fix.** The basis itself can tell a surveyor which side of a value threshold the
> estimate sits, and a surveyor cannot apply the grid in §2.4 themselves without the value band. Whether
> to accept that, or to measure this axis instead on a figure the surveyor sees anyway — the price paid
> or the invoice total, both released to them — is a decision rather than a drafting point. It is put
> to the surveyor as question 9 in §7 and is not decided here.

| Band | Estimated qualifying expenditure | Set by |
|---|---|---|
| V1 — small | below **£[SURVEYOR'S CALL]** | — |
| V2 — medium | **£[SURVEYOR'S CALL]** to **£[SURVEYOR'S CALL]** | — |
| V3 — large | **£[SURVEYOR'S CALL]** to **£[SURVEYOR'S CALL]** | — |
| V4 — major | above **£[SURVEYOR'S CALL]** | — |

A structural note, not a number: bands probably should not be symmetric with HMRC materiality —
a small job with weak evidence can still be indefensible in an enquiry, and a large job with an
exceptionally clean paper trail (e.g. a recent, fully-invoiced fit-out) may need less physical
verification than its value alone suggests. That interaction is exactly what Axis 2 is for.

### 2.3 Axis 2 — Complexity (a scored composite, not one field)

Complexity should not be a single yes/no. Proposed factors — **each is a candidate; the surveyor
should confirm, drop, add, and weight these**:

| Factor | Why it raises (or lowers) complexity | Source |
|---|---|---|
| **Trigger type** | `PURCHASE` (s.562 apportionment) leans on `gross_internal_area_m2`, `construction_type` and bare-site land value — all `D`-grade, `SV`-provenanced fields (§4). `FIT_OUT` / `REFURB` / `EXTENSION` built from invoices lean on `CD`-grade cost documents, which are far more desktop-tractable. `NEW_BUILD` sits in between (SBA + apportionment elements). | `Build-Prep-Consolidated-Schema.md` §1.D `triggers`; Module-00 §3 |
| **Sector / acuity** | Private Hospitals (theatres, imaging, medical-gas manifolds, IPS panels) and Dental (CBCT/imaging, compressed-air/suction rings) carry hidden, high-value, safety-critical plant that is hard to verify from footage alone. Care Homes and GP sit in the middle. Supported Living's headline risk is the communal/dwelling split, not plant density. | `Build-Prep-Video-Capture-Protocol.md` §3 (sector shot lists) |
| **Property age / construction era** | Pre-April-2008 construction affects the integral-features uplift judgement (`seller_acquired_pre_april_2008`) and older fabric is harder to characterise (construction type, condition, hidden services) without eyes on it. | `Build-Prep-Consolidated-Schema.md` §1.E |
| **Documentary evidence available** | Presence and quality of an O&M manual, a fire risk assessment/fire plan, M&E drawings, and a recent floor plan set change how much of the "hidden services" problem the Video Capture Protocol itself defers to documents. Their absence raises complexity; their presence should lower it. | `Build-Prep-Video-Capture-Protocol.md` §1, §6; `Caprebate-Fixture-Taxonomy-v1.csv` `quantity_basis` column (several rows keyed to `fire plan`, `M&E schedule`, `drawings`) |
| **Deal / entitlement structure** | Connected-party transfer, sale-and-leaseback, PropCo/OpCo, a licence rather than a lease, or a landlord contribution all sit on the "specialist referral" side of the schema's gates and independently argue for eyes-on scrutiny of what was actually built and by whom. | `Build-Prep-Consolidated-Schema.md` §1.B; wireframe §T0 "no specialist-referral flags raised" |
| **s.198 election status** | Where a valid election already fixes the value, the marginal benefit of a full physical valuation may be lower (the number is fixed by the document, not by measurement) — but an election of *uncertain* validity (fixtures-only test, 2-year window, s.201 content) raises complexity because getting it wrong is a hard failure, not a soft one. | `Build-Prep-Consolidated-Schema.md` §1.E `s198_election_validity` (grade E) |
| **HMRC enquiry risk** | Prior-owner-claimed caps (s.185/s.62), a contested dwelling-house determination, first claim by an unusual claimant type, or a grant/subsidy with element-specific quantification each raise the evidential bar the eventual CAVR has to clear. | `Build-Prep-Consolidated-Schema.md` §1.B, §1.E, §1.F; Module-00 §7 |
| **Scale / fixture density** | Larger properties (more beds, more surgeries, more consulting rooms) multiply the number of `room_counts`-derived quantities (see §7 of the companion call agenda) that a video can miss or a client can misreport. | `Build-Prep-Consolidated-Schema.md` §1.C `room_counts`; taxonomy `quantity_basis` values `room schedule`, `surgery (chair) count`, `bed count`, `theatre count` |

**How the factors combine into a complexity band is itself a judgement call:**

| Band | Meaning | Cut-off |
|---|---|---|
| C1 — low | Most factors favourable; invoice-based or simple fit-out | score ≤ **[SURVEYOR'S CALL]** |
| C2 — medium | A mix | **[SURVEYOR'S CALL]** |
| C3 — high | Purchase apportionment, high-acuity sector, or weak documents | **[SURVEYOR'S CALL]** |
| C4 — very high | Two or more high-risk factors together (e.g. purchase apportionment *and* a contested dwelling point) | score ≥ **[SURVEYOR'S CALL]** |

*Structural note for the surveyor: whether the factors above should be a simple additive score, a
weighted score, or a "any one severe factor overrides everything else" rule is exactly the kind of
call this policy needs from you — see the call agenda, item 2.*

### 2.4 The grid — value × complexity → policy tier

The two axes should combine into one of four evidence tiers. **The mapping shown below is a
structural hypothesis only — a monotonic "diagonal" pattern proposed so the call has something
concrete to react to and reshape. It is not a proposed set of thresholds, and no cell should be
treated as agreed.**

| | C1 low | C2 medium | C3 high | C4 very high |
|---|---|---|---|---|
| **V1 small** | DT-T1 | DT-T1 | DT-T2 | DT-T3 |
| **V2 medium** | DT-T1 | DT-T2 | DT-T3 | DT-T3 |
| **V3 large** | DT-T2 | DT-T3 | DT-T3 | DT-T4 |
| **V4 major** | DT-T2 | DT-T3 | DT-T4 | DT-T4 |

Where:

- **DT-T1 — Desktop-only.** No video walkthrough beyond what the client volunteers; document pack and
  register data carry the fixture inventory and the apportionment inputs.
- **DT-T2 — Desktop + standard video walkthrough.** The full Video Capture Protocol shot list (§2–§3)
  is required and scored against the coverage rubric (§5 of that protocol).
- **DT-T3 — Desktop + video + targeted capture.** As DT-T2, plus a named, surveyor-specified supplementary
  shot list or measurement (mirrors the CAVR wireframe's "adopt subject to targeted capture" route,
  §12) — e.g. a LiDAR scan of a specific area, closer footage of a specific plant item, or a named
  missing document.
- **DT-T4 — Physical inspection required.** No video-and-document substitute is accepted; a chartered
  surveyor attends site.

**The surveyor should treat this grid as wrong until proven otherwise** — in particular, whether the
axes should combine additively (as drawn) or whether certain complexity factors (a contested
dwelling point; a connected-party transfer) should force DT-T4 outright irrespective of value. That
override case is handled separately, as an escalation trigger (§5), precisely so it does not have to
be re-litigated inside every grid cell.

---

## 3. What each tier requires, what the surveyor does, and the residual risk

| Tier | Evidence required | What the surveyor does | Residual risk carried |
|---|---|---|---|
| **DT-T1 — Desktop-only** | Land Registry title, price/consideration and date, EPC/plans-derived GIA, cost-detail documents (invoices/M&E for a fit-out), photographs supplied by the client, register checks (CQC/CIW/HIW etc. as applicable) | Reviews the desktop pack, rules on any register conflicts, signs the CAVR on the papers | No independent verification that the fabric matches the documents; relies entirely on client-supplied photographs for presence/condition of fixtures; construction-type and GIA judgements rest on EPC/plan data rather than measurement |
| **DT-T2 — Desktop + video** | As DT-T1, plus a scored video walkthrough against the full protocol shot list (building-services shots + sector shot list + per-room narration) | As DT-T1, plus reviews the video against the coverage rubric before ruling on presence/condition-dependent fields | Video cannot see behind panels, in voids beyond one lifted tile, or below ground; narration and framing quality vary by who is filming; a passing coverage score measures *capture-compliance*, not *accuracy* (Video Capture Protocol §5) |
| **DT-T3 — Desktop + video + targeted capture** | As DT-T2, plus a named supplementary capture (LiDAR/3D scan, closer footage of a named plant item, an additional document) specified by the surveyor before filming | As DT-T2, plus specifies the targeted-capture list up front, and re-checks it on return before ruling | Narrows but does not eliminate the DT-T2 risks; introduces a round-trip delay while the client re-films; still no direct measurement of embedded/void services |
| **DT-T4 — Physical inspection required** | All of the above, plus a site visit | Attends, measures, inspects voids/plant directly, forms the qualifying-percentage and bare-site judgements in person | The surveyor's normal residual risk on any physical survey (access restrictions, works in progress, concealed defects) — but not a desktop-evidence risk |

---

## 4. Which schema fields can — and cannot — reach sign-off grade without an on-site `SV`

This is the concrete version of the framing in §1. Pulling directly from
`Build-Prep-Consolidated-Schema.md` §0.4–§0.5 and §1:

### 4.1 Fields that carry `SV` in their provenance and a `D` (or worse) grade — cannot reach sign-off without either an on-site survey or an explicit surveyor decision to rely on video/documents instead

| Field | Type | Provenance | Grade | Why it matters here |
|---|---|---|---|---|
| `gross_internal_area_m2` | `area_m2` | `CD` (EPC/plans) `/ SV` | **D** | The master input to the s.562 apportionment and the BCIS element build-up (`Build-Prep-Report-Pack-and-Hand-off-Specification.md` §2: *"the gross internal area is the master input; the survey must capture it reliably"*) |
| `construction_type` | `enum` | `CD / SV` | **D** | Drives the replacement-cost (*Bowerswood*) valuation basis |
| `residential_split_m2` | `area_m2` | `SV / CD` | **D** | The dwelling-house apportionment (s.35, M00-C8) — directly load-bearing for Supported Living |
| `room_counts` | `structured` | `CA / SV` | C (but feeds `D`-grade quantity derivations) | Sizes the taxonomy via `quantity_basis` coefficients (room schedule, surgery/bed/theatre counts) — see §7 of the call agenda |
| `pool_tag` (per fixture item) | `enum<MP\|SR\|SBA>` | `DR / SV / CTA` | **D** (E in Private Hospitals) | The statutory-function test per item; the highest-value, most contestable call in the whole framework in sector 05 |
| `present_flag` (per fixture item) | `bool` | `SV / CA` | **D** | Confirms a fixture actually exists — the video's central job, but the schema still grades it D when it isn't `SV` |
| `quantity` (per fixture item) | `int` | `SV / CA` | **D** | How many of an item — the room-schedule coefficient question |
| `cost_basis` (per fixture item) | `currency_gbp` | `DR / CD / SV` | **D** | The apportioned or invoiced value attached to each item |
| `fixture_vs_chattel` (per fixture item) | `enum` | `SV / CTA` | **E** | Decides which schedule (and which claim mechanism) an item sits in at all |

### 4.2 Fields that can reach an acceptable grade on documents/registers alone, without `SV`

| Field | Provenance | Grade | Note |
|---|---|---|---|
| `claimant_legal_name`, `company_number_or_utr`, `regulator_registration` | `CA / API` | A | Register lookups |
| `address`, `title_number` | `CD / API` (HMLR) | A | Register lookups |
| `accounting_period_end`, `profit_band` | `CD` (accounts) | B | Document-extracted |
| `build_or_renovation_year` | `CD` | B | Document-extracted |
| `floor_plans`, `photographs_asset_schedule`, `evidence` (per item) | `CD / SV` | B | Grade B **while the document/photo is of adequate quality** — this is exactly where a good video walkthrough can substitute for `SV` and still clear the threshold |
| Most of §1.D (transaction & expenditure) and §1.E (entitlement history & caps) | `CD` | B | Invoice- and contract-based, not survey-dependent — this is the structural reason **fit-out and refurb claims are inherently more desktop-tractable than purchase-apportionment claims** (see the Axis 2 trigger-type factor, §2.3) |

**The honest reading of §4.1 and §4.2 together:** the desktop-first question is not "can we avoid a
visit" in general — most of the schema already doesn't need one. It is specifically **whether video
plus documents can push the nine `D`/`E`-graded, physically-observed fields in §4.1 up to a grade the
surveyor is willing to sign against**, which is a fundamentally different and narrower question than
it first appears, and is exactly why the tiers in §2.4 target those fields rather than the job as a
whole.

---

## 5. Escalation triggers — force a visit regardless of tier

These should act as a safety valve that overrides the grid outright — a job that grids to DT-T1 or DT-T2
but trips one of these should be escalated to DT-T4 (or at minimum to a mandatory surveyor review before
proceeding), the same way the CAVR wireframe's "Physical inspection required" route sits alongside,
not inside, the express-review scoring. **This list is a starting proposal; the surveyor should treat
it as the single most important thing to correct or extend in this document.**

| Trigger | Why it overrides the grid | Source |
|---|---|---|
| Any **GATE** field resolves to `UNKNOWN` and drives a value/entitlement outcome | The schema's own rule: `UNKNOWN` routes to specialist review, never to a default (§0.3) | `Build-Prep-Consolidated-Schema.md` §0.3 |
| `connected_party_transfer_in_chain = TRUE` | Can silently destroy entitlement; needs the market-value rule tested properly | §1.B |
| `sale_and_leaseback` in (`DONE`, `PLANNED`) | Disposal value, s.198 election and balancing-charge exposure | §1.B |
| `is_contributor_not_payer = TRUE` | Different claim mechanism entirely (ss.537–538); this engine does not model it | §1.A |
| Contested or unresolved dwelling-house determination (Supported Living communal/dwelling split unclear from the video) | s.35 is the single biggest value swing in that sector | Video Capture Protocol §3.3; Report-Pack §2 |
| `prior_owner_claimed = YES` with an unresolved s.185/s.62 cap calculation | The cap depends on facts about a party who isn't the current client | §1.E |
| `s198_election_exists = TRUE` with `s198_election_validity` unresolved | An asserted election is not an election (Module 00 §3b) — this is a document question, but one severe enough to justify treating it as a hard stop pending CTA/surveyor review | §1.E |
| `grant_quantification = ELEMENT_SPECIFIC` with `grant_funded_elements` incomplete | Named structural gap in the schema (§4 note) | §1.F |
| Video **coverage score** falls below the pass mark after the maximum permitted re-shoot attempts | The Video Capture Protocol's own open item — thresholds and retry count are also `[SURVEYOR'S CALL]`, see the call agenda item 5 | Video Capture Protocol §5, §7 |
| A **register conflict** is found and cannot be resolved from documents (e.g. client-declared bed count vs CQC-registered bed count, as in the wireframe's §8.2 example) | The wireframe already treats an unresolved register conflict as blocking express review; the same logic applies upstream | Wireframe §11 "Registered beds … Conflict — §8.2" |
| Consent/data-protection constraints mean the client cannot lawfully film the areas that matter (occupied rooms, patients/residents/staff unavoidably present) | The Video Capture Protocol's own data-protection constraint (empty rooms, out of hours) may simply not be achievable in some settings | Video Capture Protocol, opening note |
| Job value or complexity places the case in the top band on **either** axis (V4 or C4) | A conservative default until the grid is validated by real cases — the surveyor may relax this once experience accumulates | Proposed, not evidenced |

---

## 6. The audit trail — making "we didn't visit" defensible to HMRC later

The buyer/claimant carries the burden of proof (*Tapsell & Lester*; *Glais House*, Module-00 §3). A
decision **not** to send a surveyor needs to be as visibly reasoned and as durably recorded as a
decision to adopt a pre-filled valuation figure already is in the wireframe (§9d "adoption record",
§12 "recorded with a hash of this document"). Proposed record, per job:

| Record item | Content | Precedent for the mechanism |
|---|---|---|
| Tier assigned and date | V-band, C-band, resulting T-tier, and the date/version of this policy used — **an internal record: the V-band and C-band are not released to the surveyor before they commit their figures (§2.2 note)** | — |
| Complexity score breakdown | Each factor in §2.3 and its individual rating for this job, not just the total | Mirrors wireframe §T0's "every criterion is shown, not just the verdict" |
| Escalation-trigger check | Explicit pass/fail against every item in §5, not a summary "no triggers" | Mirrors wireframe §T0 layout |
| Video coverage score and re-shoot history | The percentage, the per-item checklist, and how many re-shoot loops it took | Video Capture Protocol §5 |
| Documents relied on in place of physical inspection | Named files (O&M manual, fire plan, M&E drawings) with version/date | Schema `file_ref[]` convention |
| The surveyor's tier decision and reasoning | Free-text reason, **required** even where the decision matches the grid (not only when it departs from it) | Mirrors CAVR wireframe §12 "Physical inspection required. Reason:" |
| Signature and credential | MRICS/FRICS number, name, signature, date | Wireframe §12 |
| Hash/version of the desktop pack the decision was made against | So the version relied on is provably the version on file | Wireframe §12 "a hash of this document" |

**Design principle:** the record should show the *reasoning*, not just the *outcome* — a bare "video
walkthrough, no visit" note is not defensible; a record showing which fields were graded, on what
evidence, against which named policy version, is.

---

## 7. Questions for the surveyor

In addition to every `[SURVEYOR'S CALL]` blank above, in priority order (this list is deliberately
short — the full, timed version is `phase9/surveyor-call-agenda.md`):

1. Do you accept **job value × complexity** as the right two axes, or would you structure this
   differently (e.g. complexity alone, with value only as a secondary check)?
2. What are the actual **£ thresholds** for the job-value bands (§2.2)?
3. What are the **complexity factors, weights and cut-points** (§2.3) — and should any single
   severe factor override the score outright, rather than being averaged in?
4. Is the **grid mapping** in §2.4 broadly the right shape (monotonic, diagonal), or does complexity
   deserve to dominate value more than this draft assumes?
5. Of the nine fields in §4.1, are there any you would **not** insist on an on-site `SV` for, given
   good video and documents — and conversely, are there fields *not* on that list that you would
   still want to see in person?
6. Is the escalation-trigger list in §5 complete? Is there anything on it you'd actually relax (i.e.
   treat as gridable, not an automatic hard stop)?
7. What video **coverage-score pass mark**, and how many re-shoot attempts, before it escalates to
   a visit (§5, and Video Capture Protocol §7)?
8. Would you be willing to put your name to a DT-T2 or DT-T3 sign-off at all, or does your professional
   position require DT-T4 as the floor for certain sectors (e.g. Private Hospitals) regardless of the
   grid?
9. **The value axis reads our own estimate, which you may not see before you commit your figures**
   (§2.2 note). Would you rather it were measured on the price paid or the invoice total, which you see
   anyway — and does a site-visit decision genuinely need the value at stake, or is complexity enough?

---

*Straw-man reference, drafted without a chartered surveyor, for Phase 9 of the Caprebate build.
Derived from `Build-Prep-Video-Capture-Protocol.md`, `caprebate-desktop-survey-pack-wireframe-v6.html`,
`Build-Prep-Report-Pack-and-Hand-off-Specification.md`, `Build-Prep-Consolidated-Schema.md`,
`Module-00-Master-Engine-Specification.md`, `Caprebate-Engine-Remediation-Register-v2.md` and
`Caprebate-Fixture-Taxonomy-v1.csv`. Not tax advice, not professional advice, not a settled
position. Companion document: `phase9/surveyor-call-agenda.md`.*
