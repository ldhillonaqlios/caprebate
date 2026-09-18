# STRAW MAN — Room-by-Room Equipment Schedule (five sectors)

> ## ⚠ THIS IS A PROPOSAL FOR THE SURVEYOR TO CORRECT — NOT A FINISHED DOCUMENT
>
> **This document was drafted without a chartered surveyor being appointed.** It exists so that
> when a surveyor *is* appointed, they are correcting a first draft rather than starting from a
> blank page. **Nothing in it is professional advice, a settled position, or a substitute for a
> site survey.** Every quantity is left blank on purpose — see the note under each sector.
>
> - Where a room, an item, or a pool allocation is shown here, it is either **(a) derived from a
>   named repo source** (a module specification, the fixture taxonomy, or the consolidated
>   schema — cited inline), or **(b) my own suggested starting point**, marked as such, for the
>   surveyor to accept, amend, or strike out.
> - **Quantities are never guessed.** Where the correct number of a fitting per room, or the
>   number of rooms of a given type, is genuinely a matter of survey judgement, the cell is left
>   **blank** with a note that it is the surveyor's call. A populated-looking number in this
>   document would be worse than no document at all — it invites rubber-stamping of a figure no
>   one has actually measured.
> - Existence of a room type itself is sometimes uncertain (it may not occur in every property of
>   that sector, or at all in modern registered practice). Those rows are marked **"surveyor to
>   confirm this room type exists here"** rather than asserted.

**Monday item:** 12819698557 — "Build a room-by-room list of what equipment sits in each type of
room." **Owner (intended):** chartered surveyor, not yet appointed. **Drafted by:** Claude, Phase
9, as a straw man only.

**Companion document.** `strawman-s9-quantity-derivation.md` (Monday item 12819686328) consumes
this document's room list as its Stage 2 input — see that document §2.

---

## 0. How this document was built, and what it is not

**Sources used, and how.**

- The **five sector module specifications** (`Module-01` to `Module-05-*-Specification.md`) supply
  the fixture taxonomy content — which items exist in which sector, and the *(judgement)* /
  *(contested)* flags on pool allocation.
- `Caprebate-Fixture-Taxonomy-v1.csv` supplies the canonical `element_id`, `pool` tag, `unit`,
  and `quantity_basis` for every fixture row — cited here as `LS-XX-NNN`.
- `Build-Prep-Consolidated-Schema.md` §1.C and §3 supply the `room_counts` sub-fields already
  defined per sector (`ch_bed_room_count`, `dn_surgery_chair_count`, `gp_consulting_room_counts`,
  `ph_high_acuity_room_counts`) — these are the "buckets" this schedule's room types are designed
  to feed.
- `Module-00-Master-Engine-Specification.md` §5 supplies the pool-allocation legend (`SR` / `MP` /
  `SBA`) and the shared-vs-sector split.

**The fire-risk-assessment framing is my own structural choice, not a repo source.** The user's
brief for this document asks that the schedule mirror the structure of a Fire Risk Assessment
(FRA) — a room-by-room or space-by-space document that is often the only room-level paperwork a
client actually holds. That is a sound structural idea and I have followed it (room type → what's
in it), but it is **not itself derived from anything in the repo** — it is a drafting decision, and
the surveyor should say whether it is the right one for this purpose (an FRA is organised around
fire risk, not fixture value, so some of its room groupings may not be the most useful ones for a
capital-allowances survey; a surveyor may prefer to reorganise around the M&E schedule or the room
schedule the client actually holds).

**"Typical regulator bed counts / registered capacity."** The brief asks this to inform which room
types exist at typical scale (e.g., a home with more beds is likelier to have a distinct sluice
room and commercial laundry; a single-surgery dental practice won't have a CSSD). I have used this
only as **background reasoning about which room types are plausible**, not as a quantity anywhere
in this document. **No specific bed-count or capacity figures are asserted** — the repo does not
contain regulator capacity statistics, and I have not invented any. Where a room's existence
depends on scale, the table says so and leaves it to the surveyor/client to confirm.

**What this document does not do.** It does not state quantities. It does not decide pool
allocation on any item marked *(judgement)*, *(contested)*, or `APPORTION` in the source
specs — those are carried through as open calls, not resolved. It does not replace `room_counts`,
`ch_bed_room_count`, `dn_surgery_chair_count`, `gp_consulting_room_counts`, or
`ph_high_acuity_room_counts` as the schema's system of record — it is scaffolding to help populate
them.

**Pool legend** (Module 00 §5; taxonomy `pool` column):

| Tag | Meaning | Rate |
|---|---|---|
| `SR` | Special rate / integral feature | 6% |
| `MP` | Main pool | 14% |
| `MP_AIA` | Chattel — loose plant, main pool via AIA, **usually already the accountant's claim** | 14% (via AIA) |
| `SBA` | Structures & buildings allowance (residual structure) | 3% straight-line |
| `APPORTION` | **Open pool call — surveyor/CTA only, never defaulted** | — |
| `NONE` | Excluded (e.g. inside a resident's dwelling) | — |

---

## 1. Care Homes (Module 01)

**Regulator context (background only, not a quantity):** CQC (England) / CIW (Wales) / Care
Inspectorate (Scotland) / RQIA (NI). Registration records a maximum number of residents the home
may accommodate. This document does **not** state a typical figure — it only uses the *existence*
of a bed-count concept to justify why "resident bedroom" is a room type and why per-bed items
(nurse-call points, hoists) scale with bed count rather than with floor area alone. The schema
field this ultimately feeds is `ch_bed_room_count` (`Build-Prep-Consolidated-Schema.md` §3.1).

**Note on institutional vs extra-care.** This table assumes the **institutional** care-home model
(Module 01 Q6: "rooms in a care setting"). Where the property is **extra-care / self-contained
flats**, most of these rooms sit *inside* a dwelling and are excluded under s.35 (Module 01 §2B,
Q6) — the surveyor must re-run the dwelling-house test before using this table at all in that case.

| Room type | Typical equipment (source) | Pool | Typical quantity | Notes |
|---|---|---|---|---|
| Resident bedroom (single) | Nurse-call point (`LS-CH-001`, MP); ceiling-track/fixed hoist where fitted — **split fixture vs mobile**, Consolidated Schema §1.G splitting rule (`LS-CH-002`, MP); assistive flooring/handrails *(judgement)* (`LS-CH-012`, MP); underfloor heating where fitted — **`APPORTION`, do not default** (`LS-CH-013`) | MP / APPORTION | **Blank — surveyor's call** (per-bedroom count of each item; not every bedroom has a hoist) | — |
| Resident bedroom (shared) | As above | MP / APPORTION | **Blank** | **Surveyor to confirm this room type exists here** — many modern CQC-registered homes are single-occupancy only |
| En-suite / assisted bathroom / wet room | Assisted-bathing systems, specialist baths (`LS-CH-005`, MP); sanitaryware (`LS-MP-001`, MP) | MP | **Blank** | — |
| Sluice room / bedpan wash | Sluice, bedpan washers, macerators (`LS-CH-006`, MP) | MP | **Blank** (number of sluice rooms) | — |
| Communal lounge | Communal AV/entertainment (`LS-CH-009`, MP); fitted furniture (`LS-MP-002`, MP) | MP | **Blank** | — |
| Dining room | Fitted furniture (`LS-MP-002`, MP); served by commercial kitchen below | MP | **Blank** | — |
| Commercial kitchen | Commercial/industrial kitchen & catering (`LS-CH-008`, MP) | MP | **Blank** (usually one per home) | — |
| Commercial laundry | Commercial laundry installation (`LS-CH-007`, MP) | MP | **Blank** (usually one per home) | — |
| Nurse station / staff office | Nurse-call head-end (`LS-CH-001`, MP); fitted furniture (`LS-MP-002`, MP) | MP | **Blank** | — |
| Corridors / circulation | Passenger lift (`LS-SR-005`, SR) **or** through-floor/platform lift *(judgement)* (`LS-CH-003`, MP); stairlifts (`LS-CH-004`, MP); fire alarm/detection (`LS-MP-003`, MP); sprinklers (`LS-MP-004`, MP); CCTV/access control (`LS-MP-006`/`007`, MP); signage (`LS-MP-009`, MP); data/comms (`LS-MP-008`, MP) | SR / MP | **Blank** | Distinguish a passenger lift (`SR`) from a through-floor/platform lift (`MP`, judgement) — do not conflate |
| Dementia unit corridor | Dementia-safe door access / wander-guard (`LS-CH-010`, MP) | MP | **Blank** | **Surveyor to confirm** — only where `ch_care_model = DEMENTIA` |
| Sensory / activity room | Not separately itemised in Module 01's taxonomy | — | — | **Surveyor to confirm this room type exists here** and whether it introduces any item not already covered above |
| Reception / entrance | Signage (`LS-MP-009`, MP); fitted furniture (`LS-MP-002`, MP) | MP | **Blank** | — |
| Plant / boiler room | Standby generator/UPS (`LS-CH-011`, MP); space/water heating (`LS-SR-003`, SR); cold water (`LS-SR-002`, SR); powered ventilation (`LS-SR-004`, SR) | SR / MP | **Blank** | — |
| Whole-building services (not room-specific) | General electrical & lighting (`LS-SR-001`, SR); builder's work incidental to care-home plant (`LS-CH-014`, follows the plant it serves) | SR | N/A — apportioned across GIA, not counted per room | — |
| Structure (residual) | `LS-SBA-001` | SBA | N/A | **s.270CF personal-care exception must be tested, not assumed either way** — Module 01 §4, E-10/E-13 |
| Extra-care self-contained flat (own kitchen/bathroom) | — | — | — | **Only where `ch_care_model = EXTRA_CARE`.** Everything inside the flat is dwelling-house excluded (s.35) — this whole table does not apply inside it. Re-run Module 01 §2B Q6 first |
| Children's residential home — any distinct room type | — | — | — | **Not addressed in Module 01's taxonomy.** Module 01 §8 lists "confirm treatment of children's residential homes" as an open item. **Surveyor/CTA to confirm before this schedule is used for a children's home** |
| Loose equipment (chattel — **not this schedule's fixtures target**) | Mobile/non-fixed hoists, wheelchairs, computers, IT, portable diagnostic and monitoring equipment, freestanding furniture (`LS-CH-015`) | `MP_AIA` | — | **Usually already the accountant's AIA claim — reconcile against the fixed-asset register, do not re-claim.** Distinguish from the fixed side of the fixture-vs-chattel split, which sits in `LS-CH-002` |

**Finding resolved (was flagged separately, taxonomy defect B3):** unlike Dental, Supported Living,
GP and Private Hospitals, the Care Homes taxonomy (`LS-CH-*` in the CSV) had **no explicit chattel /
loose-equipment row**, while the other four sectors each carried one (`LS-DEN-013`, `LS-SL-012`,
`LS-GP-013`, `LS-PH-018`). Added as `LS-CH-015`, matching the same pattern (`chattel` /
`MP_AIA` / `COMMON_LAW` / `SETTLED`) as the other four sectors' rows.

**Questions for the surveyor — Care Homes:**
1. Single-occupancy vs shared bedrooms — does this property have any shared bedrooms at all?
2. Is there a distinct children's-home room set, and does the standard taxonomy need extending for it?
3. Extra-care / self-contained flats present anywhere in the scheme, even partially?
4. Dementia-specific fittings (secure access, wander-guard) — present, and in which zones?
5. Underfloor heating (`LS-CH-013`) — confirm the pool call; do not default.
6. Should the SBA personal-care exception (s.270CF) be tested for this specific home?
7. ~~Is the missing chattel row (above) intentional, or should the taxonomy add one?~~ **Resolved — `LS-CH-015` added.**

---

## 2. Dental (Module 02)

**Regulator context (background only):** CQC (England, primary dental care) / HIW (Wales) / HIS
(Scotland) / RQIA (NI). Scale driver is the **number of surgeries (chairs)**, feeding
`dn_surgery_chair_count` (Consolidated Schema §3.2) — not beds. A single-surgery practice and a
multi-surgery practice share the same room *types* but differ in how many surgery rooms exist.

| Room type | Typical equipment (source) | Pool | Typical quantity | Notes |
|---|---|---|---|---|
| Surgery / treatment room (per chair) | Compressor distribution terminal (`LS-DEN-001`, MP); suction/aspiration ring-main terminal (`LS-DEN-002`, MP); dedicated chair-position services — power/water/drainage/air-suction (`LS-DEN-003`, MP, "the most commonly missed value"); dental chair/unit — **fixture-vs-chattel judgement**, split rule applies (`LS-DEN-004`); fixed operating/examination lighting (`LS-DEN-005`, MP); nurse-/surgery-call (`LS-DEN-012`, MP); inhalation-sedation/nitrous-oxide piping where offered (`LS-DEN-011`, MP); amalgam separator + dedicated drainage **where actually installed** (`LS-DEN-010`, MP — declining fixture, Module 02 FM #9) | MP | **Blank — one row per surgery; number of surgeries = `dn_surgery_chair_count`, itself a surveyor/client input, not assumed here** | Do not claim amalgam items in an amalgam-free fit-out |
| Decontamination / LDU room | Washer-disinfectors, autoclaves (`LS-DEN-006`, MP — fixed units only, freestanding ones are chattels); RO/purified water + dedicated drainage (`LS-DEN-007`, MP); clean/dirty benching (`LS-DEN-008`, MP); clinically-driven negative-pressure mechanical extract where fitted — **`APPORTION`, do not default into `LS-SR-004`** (`LS-DEN-015`, taxonomy defect F-8) | MP / APPORTION | **Blank** (usually one per practice; multi-site practices may have more) | HTM 01-05; IHEEM VTP/GN/001 for the ventilation row |
| Surgery / treatment room — enhanced ventilation only | Where a specific surgery/treatment room (not just the LDU) has clinically-driven negative-pressure extract, e.g. for AGP protocols | APPORTION | **Blank** | Same `LS-DEN-015` row as the LDU case; do not conflate with general comfort ventilation (`LS-SR-004`) |
| X-ray / imaging room (OPG / CBCT) | Shielding & controlled-area installation (`LS-DEN-009`, MP, judgement — installation is trade apparatus, the machine itself is a chattel) | MP | **Blank** | IRR 2017 |
| Reception / waiting room | Fitted furniture/joinery (`LS-MP-002`, MP); sanitaryware (`LS-MP-001`, MP); signage (`LS-MP-009`, MP) | MP | **Blank** | — |
| Plant room (compressor / suction) | Central compressor unit (`LS-DEN-001`); central suction pump (`LS-DEN-002`) | MP | **Blank** (usually one per practice) | — |
| Staff room / office | Fitted furniture (`LS-MP-002`, MP) | MP | **Blank** | — |
| WC / washroom | Sanitaryware (`LS-MP-001`, MP) | MP | **Blank** | — |
| Whole-building services | General electrical, cold water, heating/comfort ventilation (integral features, `LS-SR-*`, SR); builder's work incidental to dental plant (`LS-DEN-014`, follows the plant it serves — "the works that bury [the chair-position services] get missed with them") | SR | N/A | — |
| Structure (residual, squat new build only) | `LS-SBA-001` | SBA | N/A | Modest — most dental projects are fit-outs within an existing shell |
| Loose equipment (chattel — **not this schedule's fixtures target**) | X-ray/CBCT machines, intraoral scanners, freestanding autoclaves, hand instruments, IT, and commonly the chairs/units themselves (`LS-DEN-013`) | `MP_AIA` | — | **Usually already the accountant's AIA claim — reconcile, do not re-claim** (Module 02 §4, Q21) |

**Questions for the surveyor — Dental:**
1. How many surgeries (chairs) does this practice actually have, and are all currently fitted-out and in clinical use?
2. Is amalgam use present, ceased, or was the practice built amalgam-free?
3. Is sedation (inhalation/nitrous-oxide) offered?
4. **The chair/unit fixture-vs-chattel call** — has this already been claimed as a chattel by the accountant? (Module 02 names this the central and most contestable point in the module.)
5. Any residential element above or attached to the practice requiring apportionment?
6. Is there a clinically-driven (HTM/IHEEM) negative-pressure extract in the LDU or any treatment room, and is it MP trade apparatus or SR integral feature? (`LS-DEN-015`, taxonomy defect F-8 — decide consistently with the equivalent GP and private-hospital ventilation calls, `LS-GP-008` and `LS-PH-002`/`LS-PH-003`)

---

## 3. Supported Living / Specialist Supported Housing (Module 03)

**This sector inverts the usual logic — read this section differently from the other four.**
Everything **inside** a resident's tenancy/dwelling is excluded under s.35, wherever the serving
plant sits (Module 03 §4, E-2/E-7). The room-by-room schedule below is therefore split into two
halves on purpose: **common parts** (the actual claim target, small) and **within-dwelling** (listed
for completeness, so nothing is accidentally claimed from it).

**"Registered capacity" does not transfer cleanly to this sector.** Unlike Care Homes, Supported
Living does not have a single per-bed regulator capacity figure that drives room existence in the
same way — a scheme is measured in **number of homes/tenancies**, not beds, and the Registered
Provider registers with the Regulator of Social Housing rather than (usually) CQC for the
accommodation itself. **Flagged for the surveyor** rather than asserted.

### 3a. Common parts (the qualifying zone, subject to segregation — Hora Tevfik)

| Room type | Typical equipment (source) | Pool | Typical quantity | Notes |
|---|---|---|---|---|
| Entrance lobby / circulation (corridors, stairs) | Fire alarm in communal areas (`LS-SL-003`, MP); security/CCTV/access control (`LS-SL-004`, MP); communal floor coverings/blinds/signage (`LS-SL-008`, MP) | MP | **Blank** | Must be genuinely common-parts, not read off as "corridor = safe" — see LS-SL-014 note on works following the parent element |
| Lift (if present) | Lifts serving common parts (`LS-SL-002`, SR) | SR | **Blank** | — |
| Communal plant / boiler room | Electrical/cold-water serving common parts (`LS-SL-001`, SR, apportioned); heating/hot-water/ventilation (`LS-SL-001b`, SR, **`MIXED_TEST_REQUIRED` — tested independently; excluded in full if it serves the dwellings, wherever sited**) | SR | **Blank** | The single largest item in the scheme is usually excluded here — do not assume a shared plant room is automatically common-parts just because of its location |
| Staff office | Fitted reception/office furniture (`LS-SL-007`, MP) | MP | **Blank** | — |
| Staff kitchen (**not** a shared resident kitchen) | Staff/communal kitchen and catering (`LS-SL-006`, MP) | MP | **Blank** | Distinguish carefully from a shared resident kitchen/lounge, which is part of the homes (Q6a) |
| Common-parts WC | Communal-area sanitaryware (`LS-SL-005`, MP) | MP | **Blank** | — |
| Assistive technology / accessible bathing **in common areas only** | `LS-SL-009`, `LS-SL-010`, MP | MP | **Blank** | **Only where genuinely not within a resident's dwelling** — surveyor to confirm location before including |
| Staff call / alarm system | `LS-SL-011`, MP | MP | **Blank** | — |
| Whole-scheme enabling works | `LS-SL-014` — follows the same `serves_dwellings` answer as its parent row, not a blanket room-level answer | SR/MP (follows parent) | N/A | — |
| Loose equipment (chattel — not this schedule's fixtures target) | Office equipment, computers, freestanding furniture (`LS-SL-012`) | `MP_AIA` | — | Reconcile against the fixed-asset register |
| Structure (residual) | `LS-SBA-001` | Largely unavailable | N/A | s.270CF generally does not reach this sector — residents hold tenancies, support is a separate service (Module 03 §4/§8, E-10) |

### 3b. Within a resident's dwelling — EXCLUDED (listed so nothing here is claimed by mistake)

| Room type | What's there | Pool | Notes |
|---|---|---|---|
| Resident's own kitchen | Fitted kitchen, white goods | `NONE` (`LS-SL-013`) | Excluded wherever sited if it serves the dwelling. Replacement of Domestic Items Relief may apply instead — signpost only, not a capital allowance |
| Resident's own bathroom | Sanitaryware, heating | `NONE` | As above |
| Resident's bedroom / living room | Flooring, electrical, furniture | `NONE` | As above |
| Shared kitchen/lounge **within** a home (not a common part) | — | `NONE` | Settled as part of the homes under CA11520/*Hora Tevfik* — Module 03 Q6a |

**Master-gate reminder.** None of the above applies until Module 03's master determination (Q6:
supported living vs registered care home) has been run. If the property is genuinely a registered
care home with no separate tenancies, this whole document's Care Homes table (§1) applies instead,
not this one.

**Questions for the surveyor — Supported Living:**
1. **Master determination** — tenancies and own homes, or an institutional care setting? (Routes everything; get this wrong and the whole schedule is the wrong one.)
2. Dwelling configuration — single dwelling (likely `STOP`), several self-contained homes, or several bedrooms sharing a kitchen/lounge?
3. Heating/hot-water source — shared central plant, individual per home, or mixed? (Decides whether `LS-SL-001b` is excluded in full.)
4. Is there any assistive technology or accessible bathing genuinely located in common areas, or is it all within dwellings?
5. Is any part of the scheme vacant, and if so, an ordinary void or mid-conversion from a different prior use?
6. Can common-parts costs actually be segregated from dwelling costs on the documents available? (If not, the claim likely fails on evidence even where it exists in law — Hora Tevfik.)

---

## 4. GP / Primary Care (Module 04)

**Regulator/registration context (background only):** CQC (England) / HIW / HIS / RQIA. The ODS
code and its **dispensing flag** are genuinely API-derivable (`gp_is_dispensing_practice`,
Consolidated Schema §3.4, provenance `CA / API` (ODS), grade A) — this is the one place in this
whole document where a room's existence (the dispensary) can be gated by a register lookup rather
than a client assertion or a survey. Scale driver is `gp_consulting_room_counts` (`structured
<consulting, treatment, minor_ops>` — Consolidated Schema §3.4).

| Room type | Typical equipment (source) | Pool | Typical quantity | Notes |
|---|---|---|---|---|
| Consulting room | Clinical hand-wash basin + dedicated plumbing (`LS-GP-001`, MP); examination/treatment lighting (`LS-GP-002`, MP); fitted furniture/worktops (`LS-GP-003`, MP); trade-related acoustic insulation *(judgement)* (`LS-GP-004`, MP); telephone/call system point (`LS-GP-006`, MP) | MP | **Blank — count feeds `gp_consulting_room_counts.consulting`** | — |
| Treatment room | As consulting room, plus negative-pressure/enhanced ventilation where infection control requires it *(judgement/contested, same family as private-hospital theatre ventilation)* (`LS-GP-008`, MP) | MP | **Blank — feeds `gp_consulting_room_counts.treatment`** | — |
| Minor-ops room | Specialist lighting, scrub facilities, fixed autoclaves, sluice (`LS-GP-007`, MP) | MP | **Blank — feeds `gp_consulting_room_counts.minor_ops`** | **Surveyor to confirm this room type exists here** — not every practice has one |
| Reception / waiting room | Patient check-in/calling/queue-management (`LS-GP-005`, MP); telephone system head-end (`LS-GP-006`, MP); signage/furniture (generic `LS-MP-*`, MP) | MP | **Blank** | — |
| Dispensary | Fitted dispensing units, controlled-drugs storage, dedicated security (`LS-GP-010`, MP) | MP | **Blank** | **Gated on `gp_is_dispensing_practice` (API/ODS) — do not include this room unless that flag is TRUE** |
| Clinical / cold-chain store | Dedicated power/cooling for vaccine storage (`LS-GP-011`, MP — the fridges themselves are chattels) | MP | **Blank** | — |
| Circulation | Disabled-access hoists, patient lifts (`LS-GP-012`, MP) | MP | **Blank** | — |
| Staff room / office | Fitted furniture (generic `LS-MP-002`, MP) | MP | **Blank** | — |
| Whole-building services | Integral features (`LS-SR-*`, SR); builder's work incidental to primary-care plant (`LS-GP-014`, follows the plant it serves — **watch the NHS grant interaction, do not claim the works while disclaiming the grant-funded plant**) | SR | N/A | — |
| Structure (new build / extension only) | `LS-SBA-001` | SBA | N/A | Subject to the grant interaction — Module 04 §8 |
| Loose equipment (chattel — not this schedule's fixtures target) | Clinical kit, vaccine/drug fridges, examination couches, computers, portable diagnostics (`LS-GP-013`) | `MP_AIA` | — | Accountant's AIA territory — do not re-claim |

**Questions for the surveyor — GP / Primary Care:**
1. Confirm the dispensing status against the ODS register before including the dispensary row.
2. Does this practice have a genuine minor-ops room, or only consulting/treatment rooms?
3. Acoustic insulation (`LS-GP-004`) — is there clinical/confidentiality evidence for the function test, or is it comfort-driven (which fails the List C item 7 "mainly" test)?
4. Ventilation classification in treatment rooms — `MP` trade apparatus or `SR` integral feature? (Decide consistently with the equivalent private-hospital call.)
5. Was any of this funded by an NHS premises improvement grant, and if so, which specific cost elements does the grant letter name?

---

## 5. Private Hospitals / Clinics (Module 05)

**Facility type gates room existence more than in any other sector.** Module 05 §1 sets out a
gradient — consulting-only clinic, day-surgery/treatment centre, full acute hospital — and **most
of the rooms below will not exist at a consulting-only or day-surgery facility.** This table lists
the full high-acuity superset; the surveyor must strike out whatever this specific facility does
not have before using it. Scale driver is `ph_high_acuity_room_counts` (`structured<theatre, icu,
imaging, sterile_services>` — Consolidated Schema §3.5).

| Room type | Typical equipment (source) | Pool | Typical quantity | Notes |
|---|---|---|---|---|
| Consulting room (outpatient) | Behaves like a GP/dental consulting room — see §4 | MP | **Blank** | Present at every facility type |
| Operating theatre | MGPS terminal outlets (`LS-PH-001`, MP); **ultra-clean/laminar-flow ventilation (UCV)** — `LS-PH-002`, **CONTESTED, the single biggest pool call in the framework**; isolated power supply (IPS) (`LS-PH-004`, MP, contested); theatre pendants/surgeon's panels/scrub stations (`LS-PH-005`, MP); fixed operating lighting (`LS-PH-006`, MP); pneumatic tube terminal (`LS-PH-012`, MP) | MP (several contested vs SR) | **Blank — feeds `ph_high_acuity_room_counts.theatre`** | UCV, IPS and shielding pool calls are **surveyor + CTA sign-off, never defaulted** |
| ICU / critical care room | Isolation/critical-care pressure ventilation (`LS-PH-003`, MP, contested); MGPS; nurse-call/patient-monitoring infrastructure (`LS-PH-013`, MP); patient hoists/bariatric lifts (`LS-PH-014`, MP) | MP (contested) | **Blank — feeds `ph_high_acuity_room_counts.icu`** | — |
| Imaging room (X-ray / CT / MRI) | Radiation shielding (lead-lined) / RF-Faraday shielding for MRI (`LS-PH-007`, MP, judgement — s.23(4) risk) | MP (judgement) | **Blank — feeds `ph_high_acuity_room_counts.imaging`** | The imaging machine itself is a chattel (`LS-PH-018`) — the room/shielding is the fixture |
| Sterile services / CSSD | Washer-disinfectors, fixed sterilisers, RO water, dedicated drainage (`LS-PH-008`, MP) | MP | **Blank — feeds `ph_high_acuity_room_counts.sterile_services`** | — |
| Endoscopy room | Decontamination + RO water plant/station services (`LS-PH-009`, MP) | MP | **Blank** | — |
| Dialysis room | As endoscopy (`LS-PH-009`, MP) | MP | **Blank** | — |
| Aseptic pharmacy / clean-room | Controlled environment, filtration (`LS-PH-010`, MP, judgement) | MP (judgement) | **Blank** | — |
| Pathology / lab | Fume cupboards, fixed benching (`LS-PH-011`, MP) | MP | **Blank** | — |
| Ward / inpatient bed area | Nurse-call/patient-monitoring infrastructure (`LS-PH-013`, MP); patient hoists (`LS-PH-014`, MP); sanitaryware (`LS-MP-001`, MP) | MP | **Blank** | — |
| Reception / admin | Fitted furniture (`LS-MP-002`, MP); signage (`LS-MP-009`, MP) | MP | **Blank** | — |
| Mortuary | Mortuary refrigeration (`LS-PH-017`, MP) | MP | **Blank** | **Surveyor to confirm this room type exists here** — acute facilities only |
| Hydrotherapy pool | Pool and plant (`LS-PH-015`, MP — item 16 is express statutory authority) | MP | **Blank** | **Surveyor to confirm this room type exists here** — specialist rehab facilities only. Note: "a hydrotherapy pool used in delivering rehabilitation is a different case from an amenity pool" (Module 05 §4) — confirm clinical use |
| Catering / laundry plant room | Commercial catering, kitchen, laundry (`LS-PH-016`, MP) | MP | **Blank** | — |
| Whole-building services | Integral features (`LS-SR-*`, SR); largest s.25 enabling-works exposure in the framework (`LS-PH-019`, follows the plant it serves) | SR | N/A | — |
| Structure (new build / extension) | `LS-SBA-001` | SBA | N/A | Material on large builds |
| Loose equipment (chattel — not this schedule's fixtures target) | CT/MRI/X-ray units, surgical robots, monitors, beds, trolleys, IT (`LS-PH-018`) | `MP_AIA` | — | "The room, the shielding and the dedicated services are fixed; the machine is moveable" — do not double-count |

**Questions for the surveyor — Private Hospitals / Clinics:**
1. Confirm facility type (`CONSULTING` / `DAY_SURGERY` / `ACUTE` / `SPECIALIST`) before using any row beyond "consulting room" — most of this table does not apply below `ACUTE`/`SPECIALIST`.
2. UCV, isolation ventilation, IPS, radiation/RF shielding — **the pool-allocation defence note** (`ph_judgement_item_register`) needs to be built for each, not assumed.
3. Is the operator a charity/not-for-profit (e.g., Nuffield-type)? This gates entitlement entirely before any room-level question matters.
4. Has there been, or is there planned, a sale-and-leaseback? (Affects the whole disposal-side workstream, not just this schedule.)
5. Mortuary and hydrotherapy — confirm presence and, for hydrotherapy, genuine clinical/rehabilitation use.

---

## Sources & references

`Module-01-Care-Homes-Specification.md`, `Module-02-Dental-Specification.md`,
`Module-03-Supported-Living-Specification.md`, `Module-04-GP-Primary-Care-Specification.md`,
`Module-05-Private-Hospitals-Clinics-Specification.md` (fixture taxonomies, §4 in each);
`Caprebate-Fixture-Taxonomy-v1.csv` (canonical `element_id`, `pool`, `unit`, `quantity_basis`
per row); `Build-Prep-Consolidated-Schema.md` §1.C, §1.G, §3.1–§3.5 (`room_counts` and its sector
sub-fields); `Module-00-Master-Engine-Specification.md` §5 (pool legend, taxonomy conventions).

Indicative technical scaffolding only, **not tax advice and not a completed survey document.**
Every quantity and every disputed pool call is a chartered surveyor's / CTA's decision, not this
document's.
