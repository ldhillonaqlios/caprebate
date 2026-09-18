# Room-by-Room Equipment Schedule — v2, COMPLETE DRAFT FOR SURVEYOR SIGN-OFF OR AMENDMENT

**Monday item:** 12819698557
**Version:** 2.1 · 12 September 2026 · emergency lighting and dental ventilation rows added (see "What changed at v2.1"). v2.0 of 31 August 2026 superseded `strawman-room-equipment-schedule.md` (v1, Phase 9)
**Prepared by:** Claude (Phase 52), Caprebate
**What we are asking for:** sign this off, or mark it up. We are not asking you to write it.

---

## What changed at v2, and why

v1 left every quantity cell **blank** on the reasoning that a populated-looking number invites a
rubber stamp. That reasoning was half right and half wrong, and the half that was wrong made the
document harder to correct, not easier.

- **Right:** we must not assert a *count* for a property nobody has surveyed. A count is a property
  fact. It stays out.
- **Wrong:** we also left out *why we think the item is in that room at all*, and *how sure we are*.
  Those are not property facts. They are our model, and our model is exactly the thing being
  reviewed. A blank cell there does not protect anyone — it just hides the guess.

So v2 keeps quantities out and puts **our reasoning and our confidence in**. Every row now says
what the item is, why we expect it in that room type, what a count of it would be measured
*against*, and **how confident we are that the row belongs there at all**. Rows we are guessing at
say so in the confidence column. **Those are the rows to spend your time on.**

### What changed at v2.1 (12 September 2026)

Two families of row now match the two questions the surveyor is actually being asked: **"Emergency
lighting, and six other things we could not place"** and **"Ventilation — is this one question or
four?"**

- **Emergency lighting** is now a row in every sector — CH-27 and SL-4 as before, and new rows DN-32,
  GP-26 and PH-32. The question is a classification one: **is emergency lighting a separate item, or is
  it already inside general electrical and lighting (`LS-SR-001`)?** The answer moves it between the
  main pool and the special rate pool.
- **Dental ventilation** was already carried at DN-10 (a surgery where aerosol-generating procedures are
  done) and DN-14 (the decontamination room). v2.1 adds **DN-33, the case the question is really about:
  mechanical ventilation in a surgery or decontamination room whose purpose is not yet known** —
  ordinary building ventilation, or clinical equipment that happens to move air. v2.0 had nowhere to put
  that case except the comfort-ventilation line at DN-27, which would have defaulted it into the special
  rate pool.

**Every one of these rows is tagged `APPORTION`, and none of them has a default quantity or a default
pool.** "Not sure" and "not recorded" are handled identically: the row stays `APPORTION`, the quantity
stays uncounted, and neither becomes "none fitted", "one per room", or a pool. **The director's
provisional view on ventilation — clinical equipment that happens to move air — is recorded on DN-33 and
not applied.** Applying it would put the item in the main pool, which relieves faster and so makes the
claim bigger; it stays off until the surveyor answers. The counting coefficients these rows would use
(RD-15 for emergency lighting, RD-16 for dental ventilation) are blank in `s9-quantity-derivation-v2.md`.

### The confidence scale — this is the load-bearing column

| Grade | Meaning | What we want from you |
|---|---|---|
| **S1 — Sourced** | Comes from a named source we have read: a module specification, the fixture taxonomy, or a statutory/technical standard cited on the row. | Confirm it is not out of date. Low priority. |
| **S2 — Standard practice** | Not written down in anything we hold, but we believe it is how these buildings are ordinarily built. We have not verified it against a real property. | Tell us if it is wrong. Medium priority. |
| **S3 — Inferred** | Reasoned from what the room is *for*, not from any source and not from observed practice. Plausible; unverified. | Please check these. High priority. |
| **S4 — Guess** | We put it here because it seemed likely and we had nothing better. **We are flagging it rather than dressing it up.** | **These first.** If a row is wrong, it is most likely one of these. |
| **X — Existence uncertain** | We are not confident the *room type* occurs in this sector at all, or at typical scale. | Tell us: always / sometimes / never. |

**At v2.0 there were 19 S4 rows and 24 X rows; v2.1 adds three S4 rows (DN-32, GP-26, PH-32) and one S3 row (DN-33).** They are indexed at §7 so you can go
straight to them without reading the sector tables in full.

### What is still deliberately absent

- **Counts.** Nothing in this document says "3 sluice rooms" or "12 nurse-call points". A count is a
  fact about one building, and we have not seen one. The **quantity basis** column says what a
  count *would be measured against*; the count itself belongs to the survey.
- **Pool allocation on contested items.** Where a source module marks an item `APPORTION`,
  `(judgement)` or `CONTESTED`, we carry the flag through rather than resolving it. Resolving it is
  a surveyor-plus-CTA call, and a wrong one is a permanent timing error, not a rounding one.
- **Costs and rates.** Not this document. See `s9-quantity-derivation-v2.md`.

### Pool legend (Module 00 §5; taxonomy `pool` column)

| Tag | Meaning | Rate |
|---|---|---|
| `SR` | Special rate / integral feature | 6% |
| `MP` | Main pool | 14% |
| `MP_AIA` | Chattel — loose plant, main pool via AIA, **usually already the accountant's claim** | 14% (via AIA) |
| `SBA` | Structures & buildings allowance (residual structure) | 3% straight-line |
| `APPORTION` | **Open pool call — surveyor/CTA only, never defaulted** | — |
| `NONE` | Excluded (e.g. inside a resident's dwelling) | — |

### How this document was built

The five sector module specifications (`Module-01` … `Module-05-*-Specification.md`) supply which
items exist in which sector and their `(judgement)` / `(contested)` flags.
`Caprebate-Fixture-Taxonomy-v1.csv` supplies the canonical `element_id`, `pool`, `unit` and
`quantity_basis` for every row (`LS-XX-NNN`). `Build-Prep-Consolidated-Schema.md` §1.C, §1.G and §3
supply the `room_counts` sub-fields these room types feed. `Module-00` §5 supplies the pool legend.

**The room-by-room structure is our drafting choice, not a source.** We modelled it on a Fire Risk
Assessment — a space-by-space document clients usually already hold — because it is the room-level
paperwork most likely to exist. **An FRA is organised around fire risk, not fixture value, and its
groupings may not be the most useful ones here.** If you would rather this were organised around the
M&E schedule or the client's own room schedule, say so; restructuring is cheap now and expensive
later. *(Confidence on the structure itself: S3.)*

---

## 1. Care Homes (Module 01)

**Scale driver:** registered bed count → `ch_bed_room_count` (Consolidated Schema §3.1).
**Before using this table at all:** if the property is extra-care / self-contained flats, most of
these rooms sit *inside* a dwelling and are excluded under s.35 (Module 01 §2B, Q6). Re-run the
dwelling-house test first.

| # | Room type | Item (taxonomy ref) | Why we expect it in this room | Pool | Quantity measured against | Confidence |
|---|---|---|---|---|---|---|
| CH-1 | Resident bedroom (single) | Nurse-call point (`LS-CH-001`) | Regulator-driven: a call point at each bed position is the standard means of summoning staff in a registered care setting | MP | Bed count | **S2** |
| CH-2 | Resident bedroom (single) | Ceiling-track / fixed hoist (`LS-CH-002`) — fixed side only after the fixture/chattel split (Schema §1.G) | Fitted where a resident's dependency requires it; not every bedroom has one | MP | Proportion of bedrooms hoist-fitted — O&M manual or asset schedule | **S3** — we do not know the typical proportion and have not guessed it |
| CH-3 | Resident bedroom (single) | Assistive flooring / handrails (`LS-CH-012`) *(judgement)* | Falls-prevention fitting; qualifies only if it passes the function test rather than being ordinary floor covering | MP *(judgement)* | Bedroom count | **S3** |
| CH-4 | Resident bedroom (single) | Underfloor heating (`LS-CH-013`) | Present in some newer homes; **pool call is open — `APPORTION`, do not default** | `APPORTION` | Bedroom count / heated area | **X** — presence varies by build era |
| CH-5 | Resident bedroom (shared) | As CH-1 to CH-4 | — | MP / `APPORTION` | Bed count | **X** — many modern registered homes are single-occupancy only. Does this home have any shared bedrooms? |
| CH-6 | En-suite / assisted bathroom / wet room | Assisted-bathing systems, specialist baths (`LS-CH-005`) | Assisted bathing is the defining fitting of a nursing/residential bathroom as distinct from a domestic one | MP | Count of assisted bathrooms | **S1** (Module 01 taxonomy) |
| CH-7 | En-suite / assisted bathroom | Sanitaryware (`LS-MP-001`) | Present in every en-suite | MP | Room count | **S1** |
| CH-8 | Sluice room / bedpan wash | Sluice, bedpan washers, macerators (`LS-CH-006`) | Infection-control requirement wherever continence care is delivered | MP | Sluice room count | **S1** |
| CH-9 | Sluice room | Dedicated drainage and hot/cold services to the sluice | Follows the sluice equipment it serves — enabling works (`LS-CH-014`) | Follows parent | Priced BoQ | **S3** — we assume dedicated services exist; on a converted building they may be shared |
| CH-10 | Communal lounge | Communal AV / entertainment (`LS-CH-009`) | Fitted AV in a day space | MP | Room count | **S2** |
| CH-11 | Communal lounge / dining | Fitted furniture and joinery (`LS-MP-002`) | Built-in servery, storage, seating bases | MP | Room count / linear metres | **S2** |
| CH-12 | Dining room | Served by the commercial kitchen — no distinct fixture of its own beyond CH-11 | — | — | — | **S3** — we may be wrong that a dining room carries nothing separate; a servery or regeneration trolley point could sit here |
| CH-13 | Commercial kitchen | Commercial/industrial kitchen and catering installation (`LS-CH-008`) | A registered home cooking at scale needs a commercial kitchen, not a domestic one | MP | Usually one per home — confirm | **S1** |
| CH-14 | Commercial kitchen | Kitchen extract / canopy ventilation | Statutory for a commercial kitchen | MP or `SR` — **open** | Canopy count | **S4** — **the taxonomy has no row for kitchen extract at all.** We have inferred it belongs somewhere. Is it inside `LS-CH-008`, inside `LS-SR-004` (powered ventilation, SR), or a missing row? |
| CH-15 | Commercial laundry | Commercial laundry installation (`LS-CH-007`) | On-site laundry is normal at registered-home scale (infection control makes off-site impractical for soiled linen) | MP | Usually one per home — confirm | **S2** |
| CH-16 | Nurse station / staff office | Nurse-call head-end / annunciator panel (`LS-CH-001`) | The call system terminates somewhere staffed | MP | One per staffed station | **S2** |
| CH-17 | Nurse station | Fitted furniture (`LS-MP-002`) | Built-in desking and drug-storage joinery | MP | Room count | **S2** |
| CH-18 | Nurse station | Medication / controlled-drug store and its security | Regulator-driven | MP | Room count | **S4** — **no taxonomy row.** GP has one (`LS-GP-010`); care homes do not. Is that a gap or is it deliberate? |
| CH-19 | Corridors / circulation | Passenger lift (`LS-SR-005`) | Multi-storey home | **SR** | Lift count | **S1** |
| CH-20 | Corridors / circulation | Through-floor / platform lift (`LS-CH-003`) *(judgement)* | A different animal from a passenger lift and a different pool — **do not conflate** | MP *(judgement)* | Lift count | **S1** |
| CH-21 | Stairs | Stairlifts (`LS-CH-004`) | Retro-fitted in converted properties | MP | Stair flights fitted | **S2** |
| CH-22 | Corridors / circulation | Fire alarm and detection (`LS-MP-003`) | Statutory. **Counting method matters — see the detection note below** | MP | Detection points, **room-driven** (see `s9-quantity-derivation-v2.md` §6a) | **S1** |
| CH-23 | Corridors / circulation | Sprinklers (`LS-MP-004`) | Mandatory in new care homes in Wales and Scotland; common but not universal in England | MP | Head count, room-driven | **X** — depends on nation and build date. Confirm before including |
| CH-24 | Corridors / circulation | CCTV and access control (`LS-MP-006` / `LS-MP-007`) | Security and safeguarding | MP | Point count | **S2** |
| CH-25 | Corridors / circulation | Signage (`LS-MP-009`) | Statutory fire and wayfinding signage | MP | Room/route count | **S2** |
| CH-26 | Corridors / circulation | Data / comms outlets (`LS-MP-008`) | Nurse-call, care-planning terminals, Wi-Fi backhaul | MP | Outlet count — **RD-04 is open, see §6b of the quantity model** | **S2** |
| CH-27 | Corridors / circulation | Emergency lighting | Statutory | `APPORTION` | Fittings per enclosed space and escape-route segment — **RD-15, blank** | **S4** — **no taxonomy row (XS-1).** Is emergency lighting a separate item, or already inside `LS-SR-001` (general electrical and lighting, SR)? The answer moves value between a 14% pool and a 6% pool. **No default quantity and no default pool** |
| CH-28 | Dementia unit corridor | Dementia-safe door access / wander-guard (`LS-CH-010`) | Only where the home is dementia-registered | MP | Door count | **X** — only where `ch_care_model = DEMENTIA` |
| CH-29 | Sensory / activity room | — | Not itemised in Module 01 | — | — | **X** — does this room type exist, and does it carry anything not already listed? |
| CH-30 | Hairdressing / therapy room | Fitted salon units, basin and its plumbing | Common amenity in larger homes | MP | Room count | **S4** — **no taxonomy row, and we are not sure it should have one.** Is a salon basin ordinary sanitaryware (`LS-MP-001`) or a trade fitting? |
| CH-31 | Reception / entrance | Signage (`LS-MP-009`); fitted furniture (`LS-MP-002`) | Visitor-facing joinery and wayfinding | MP | Room count | **S2** |
| CH-32 | Reception / entrance | Door entry / intercom | Safeguarding — controlled entry is standard in a registered home | MP | Door count | **S3** — we assume this sits inside `LS-MP-007` (access control). Confirm |
| CH-33 | Plant / boiler room | Standby generator / UPS (`LS-CH-011`) | Life-safety and nurse-call resilience | MP | One per site | **X** — not every home has standby power |
| CH-34 | Plant / boiler room | Space and water heating (`LS-SR-003`) | Integral feature | **SR** | GIA / plant schedule | **S1** |
| CH-35 | Plant / boiler room | Cold water systems (`LS-SR-002`) | Integral feature | **SR** | GIA / plant schedule | **S1** |
| CH-36 | Plant / boiler room | Powered ventilation and air-conditioning (`LS-SR-004`) | Integral feature | **SR** | GIA / plant schedule | **S1** |
| CH-37 | Plant / boiler room | Legionella control — TMVs, dead-leg management, tank | Statutory water safety in a care setting | Follows `LS-SR-002` | Outlet count | **S3** — we assume this is inside the cold-water integral feature rather than a separate row |
| CH-38 | Whole building | General electrical and lighting (`LS-SR-001`) | Integral feature | **SR** | Apportioned across GIA, not counted per room | **S1** |
| CH-39 | Whole building | Builder's work incidental to care-home plant (`LS-CH-014`) | Follows the plant it serves | Follows parent | Priced BoQ | **S1** |
| CH-40 | Structure (residual) | `LS-SBA-001` | — | SBA | N/A | **S1** — but **s.270CF personal-care exception must be tested, not assumed either way** (Module 01 §4, E-10/E-13) |
| CH-41 | Extra-care self-contained flat | Everything inside it | Dwelling-house excluded under s.35 | `NONE` | — | **S1** — this whole table does not apply inside the flat |
| CH-42 | Children's residential home | Any distinct room type | Not addressed in Module 01's taxonomy | — | — | **X** — Module 01 §8 lists this as open. **Do not use this schedule for a children's home without a ruling** |
| CH-43 | Loose equipment (chattel) | Mobile hoists, wheelchairs, IT, portable diagnostics, freestanding furniture (`LS-CH-015`) | Not this schedule's target | `MP_AIA` | Fixed-asset register | **S1** — **usually already the accountant's AIA claim. Reconcile, do not re-claim** |

**Questions for you — Care Homes**

1. **CH-14, CH-18, CH-27, CH-30 are S4 rows with no taxonomy home.** Kitchen extract, the medication
   store, emergency lighting, and salon fittings. For each: is it a missing taxonomy row, or is it
   already inside a row we have listed? **Emergency lighting matters most** — it is the one that
   moves value between a 14% and a 6% pool.
2. Does this home have shared bedrooms at all (CH-5)?
3. What proportion of bedrooms would you typically expect to be hoist-fitted (CH-2)? We have
   deliberately not guessed. If there is no typical figure, tell us that and we will route it to
   survey rather than model it.
4. Underfloor heating (CH-4) — confirm the pool call. Do not let us default it.
5. Should the SBA personal-care exception (s.270CF) be tested for this specific home (CH-40)?
6. Is our FRA-shaped structure the right one for a care home, or would you rather work from the
   client's own room schedule?

---

## 2. Dental (Module 02)

**Scale driver:** number of surgeries (chairs) → `dn_surgery_chair_count` (Schema §3.2).
A single-surgery practice and a six-surgery practice share the same room *types*.

| # | Room type | Item (taxonomy ref) | Why we expect it in this room | Pool | Quantity measured against | Confidence |
|---|---|---|---|---|---|---|
| DN-1 | Surgery / treatment room | Compressed-air distribution terminal at the chair (`LS-DEN-001`) | Every dental unit runs on compressed air; the terminal is fixed at the chair position | MP | Surgery count | **S1** |
| DN-2 | Surgery | Suction / aspiration ring-main terminal (`LS-DEN-002`) | As DN-1 — the wet side of the same service pair | MP | Surgery count | **S1** |
| DN-3 | Surgery | Dedicated chair-position services — power, water, drainage, air, suction (`LS-DEN-003`) | Module 02 calls this "the most commonly missed value": the services buried in the floor and wall at each chair position | MP | Surgery count (1 set per chair — **RD-08 verification only**) | **S1** |
| DN-4 | Surgery | Dental chair / unit (`LS-DEN-004`) | **Fixture-vs-chattel judgement — the central contested call in this module** | **Open** | Surgery count | **S1** on presence, **contested** on treatment |
| DN-5 | Surgery | Fixed operating / examination lighting (`LS-DEN-005`) | Chair-mounted or ceiling-mounted operating light | MP | Surgery count | **S1** |
| DN-6 | Surgery | Nurse-call / surgery-call (`LS-DEN-012`) | Staff summoning between surgeries | MP | Surgery count | **S2** |
| DN-7 | Surgery | Inhalation-sedation / nitrous-oxide piping (`LS-DEN-011`) | Only where sedation is offered | MP | Surgery count where offered | **X** — confirm sedation is offered |
| DN-8 | Surgery | Amalgam separator and dedicated drainage (`LS-DEN-010`) | **Declining fixture** (Module 02 FM #9) — do not claim in an amalgam-free fit-out | MP | Separator count | **X** — confirm amalgam use is current, ceased, or never |
| DN-9 | Surgery | Clinical (anti-static / welded-seam) flooring | Infection-control specification, distinct from ordinary floor covering | MP or SBA — **open** | Floor area | **S4** — **no taxonomy row.** Is clinical flooring a trade fitting or part of the building fabric? We have inferred a trade fitting and we are not confident |
| DN-10 | Surgery — enhanced ventilation only | Clinically-driven negative-pressure extract (`LS-DEN-015`) | AGP protocols in a specific treatment room | `APPORTION` | Room count | **X** — present only in some practices. **Taxonomy defect F-8: do not default this into `LS-SR-004`** |
| DN-11 | Decontamination / LDU room | Washer-disinfectors and autoclaves (`LS-DEN-006`) — **fixed units only** | HTM 01-05 requires a separate decontamination process; fixed benching-mounted units are fixtures, freestanding ones are chattels | MP | Unit count | **S1** |
| DN-12 | LDU | RO / purified water plant and dedicated drainage (`LS-DEN-007`) | HTM 01-05 water quality for instrument reprocessing | MP | One per LDU | **S1** |
| DN-13 | LDU | Clean / dirty benching (`LS-DEN-008`) | The dirty-to-clean flow HTM 01-05 requires is physically built into the benching | MP | Linear metres | **S1** |
| DN-14 | LDU | Negative-pressure mechanical extract (`LS-DEN-015`) | IHEEM VTP/GN/001 | `APPORTION` | One per LDU | **X** — confirm fitted |
| DN-15 | X-ray / imaging room (OPG / CBCT) | Shielding and controlled-area installation (`LS-DEN-009`) *(judgement)* | IRR 2017 controlled area. **The installation is trade apparatus; the machine is a chattel** | MP *(judgement)* | Room count | **S1** |
| DN-16 | X-ray room | Warning signage, interlocks and exposure switch | IRR 2017 | Follows `LS-DEN-009` | Room count | **S3** — we assume these are inside the shielding row rather than separate |
| DN-17 | Reception / waiting | Fitted furniture and joinery (`LS-MP-002`) | Reception desk, seating bases, storage | MP | Linear metres | **S1** |
| DN-18 | Reception / waiting | Sanitaryware in patient WC (`LS-MP-001`) | — | MP | Fitting count | **S1** |
| DN-19 | Reception / waiting | Signage (`LS-MP-009`) | — | MP | Room count | **S2** |
| DN-20 | Reception | Patient check-in kiosk or calling screen | Increasingly common | MP | Unit count | **S4** — **no dental taxonomy row; GP has one (`LS-GP-005`).** Should dental share it? |
| DN-21 | Plant room / cupboard | Central compressor unit (`LS-DEN-001`) | Serves every surgery through the ring main | MP | One per practice | **S1** |
| DN-22 | Plant room / cupboard | Central suction pump (`LS-DEN-002`) | As DN-21 | MP | One per practice | **S1** |
| DN-23 | Plant room | Ring-main pipework runs to the surgeries | The distribution between plant and chair — physically the largest part of DN-1/DN-2 | MP | Linear metres — **M&E schedule** | **S2** |
| DN-24 | Staff room / office | Fitted furniture (`LS-MP-002`) | — | MP | Linear metres | **S2** |
| DN-25 | WC / washroom | Sanitaryware (`LS-MP-001`) | — | MP | Fitting count | **S1** |
| DN-26 | Whole building | Fire alarm and detection (`LS-MP-003`) | Statutory | MP | Detection points, **room-driven** | **S1** |
| DN-27 | Whole building | General electrical, cold water, heating and comfort ventilation (`LS-SR-*`) | Integral features | **SR** | GIA | **S1** — **comfort ventilation only where it is established that it is comfort-driven.** Surgery or decontamination-room ventilation whose purpose is not known goes to DN-33, not here |
| DN-28 | Whole building | Builder's work incidental to dental plant (`LS-DEN-014`) | Module 02: "the works that bury [the chair-position services] get missed with them" | Follows parent | Priced BoQ | **S1** |
| DN-29 | Structure (residual) | `LS-SBA-001` | Modest — most dental work is a fit-out inside an existing shell | SBA | N/A | **S1** |
| DN-30 | Loose equipment (chattel) | CBCT/X-ray machines, intraoral scanners, freestanding autoclaves, hand instruments, IT, **and commonly the chairs themselves** (`LS-DEN-013`) | Not this schedule's target | `MP_AIA` | Fixed-asset register | **S1** — reconcile against the accountant's claim, do not re-claim |
| DN-31 | Residential flat above the practice | — | Apportionment required | `NONE` inside the dwelling | — | **X** — very common on a high-street practice. Confirm |
| DN-32 | Whole practice — surgeries, decontamination room, corridors, escape routes | Emergency lighting | Statutory | `APPORTION` | Fittings per enclosed space and escape-route segment — **RD-15, blank** | **S4** — **no taxonomy row (XS-1)**, same question as CH-27. **No default quantity and no default pool** |
| DN-33 | Surgery / decontamination room | Mechanical supply or extract ventilation **whose purpose is not established** — not yet known whether it is driven by clinical need (aerosol-generating procedures, decontamination) or is ordinary comfort ventilation | This is the case the ventilation question asks about: ordinary building ventilation, or clinical equipment that happens to move air? | `APPORTION` | Room count — **only once presence and purpose are both confirmed; RD-16, blank** | **S3** — **must not fall by default into DN-27 (comfort, SR) or into DN-10 / DN-14 (`LS-DEN-015`).** Purpose "not sure" and purpose not recorded are treated the same: `APPORTION`, uncounted. Director's provisional view — clinical equipment — recorded, **not applied** |

**Questions for you — Dental**

1. **DN-9 (clinical flooring) and DN-20 (check-in kiosk) are S4 rows with no taxonomy home.**
   Flooring is the one that matters: a welded-seam clinical floor is a real cost and we do not know
   whether you would treat it as a trade fitting or as fabric.
2. **DN-4 — the chair fixture-vs-chattel call.** Module 02 names this the most contestable point in
   the module. Has the accountant already claimed the chairs as chattels?
3. Is amalgam use present, ceased, or was the practice built amalgam-free (DN-8)?
4. Is sedation offered (DN-7)?
5. **DN-10 / DN-14 / DN-33 — ordinary building ventilation, or clinical equipment that happens to move
   air?** What we need most is the **distinguishing factor** — the test that separates clinically
   driven from comfort driven — so that DN-33 can be settled from the client's answers rather than by
   asking you on every job. Please answer consistently with the GP (GP-9) and private-hospital
   (PH-3/PH-9) ventilation calls, and tell us if the four cases genuinely come apart.
6. Any residential element above or attached (DN-31)?
7. **DN-32 — emergency lighting.** A separate item, or already inside general electrical and lighting?
   (XS-1.)

---

## 3. Supported Living / Specialist Supported Housing (Module 03)

**Read this section differently from the other four.** Everything **inside** a resident's
tenancy is excluded under s.35 wherever the serving plant sits (Module 03 §4, E-2/E-7). The table
is split deliberately: **common parts** (the claim target, small) and **within-dwelling** (listed
so nothing is claimed from it by accident).

**Master gate:** none of this applies until Module 03 Q6 (supported living vs registered care home)
has been run. If it is a registered care home with no separate tenancies, §1 applies instead.

### 3a. Common parts — the qualifying zone, subject to segregation (*Hora Tevfik*)

| # | Room type | Item (taxonomy ref) | Why we expect it here | Pool | Quantity measured against | Confidence |
|---|---|---|---|---|---|---|
| SL-1 | Entrance lobby / circulation | Fire alarm in communal areas (`LS-SL-003`) | Statutory in the common parts | MP | Detection points in common parts, **room-driven** | **S1** |
| SL-2 | Entrance lobby / circulation | Security, CCTV, access control (`LS-SL-004`) | Controlled entry to a shared building | MP | Point count | **S1** |
| SL-3 | Circulation | Communal floor coverings, blinds, signage (`LS-SL-008`) | — | MP | Common-parts area | **S1** |
| SL-4 | Circulation | Emergency lighting in common parts | Statutory | `APPORTION` | Fittings per enclosed space and escape-route segment in the common parts — **RD-15, blank** | **S4** — same question as CH-27 (XS-1). **No default quantity and no default pool** |
| SL-5 | Lift | Lifts serving common parts (`LS-SL-002`) | — | **SR** | Lift count | **S1** |
| SL-6 | Communal plant / boiler room | Electrical and cold water serving common parts (`LS-SL-001`) | Apportioned to the common parts only | **SR** | Common-parts GIA | **S1** |
| SL-7 | Communal plant / boiler room | Heating, hot water, ventilation (`LS-SL-001b`) | **`MIXED_TEST_REQUIRED` — tested independently. Excluded in full if it serves the dwellings, wherever it is sited** | **SR**, conditional | Plant schedule | **S1** — and **the single largest item in the scheme is usually excluded here.** Do not read "it's in the plant room, so it's common parts" |
| SL-8 | Staff office | Fitted reception / office furniture (`LS-SL-007`) | — | MP | Linear metres | **S1** |
| SL-9 | Staff kitchen | Staff / communal kitchen and catering (`LS-SL-006`) | **Distinguish carefully from a shared resident kitchen, which is part of the homes (Q6a)** | MP | Room count | **S1** |
| SL-10 | Common-parts WC | Communal-area sanitaryware (`LS-SL-005`) | — | MP | Fitting count | **S1** |
| SL-11 | Common areas only | Assistive technology (`LS-SL-009`) and accessible bathing (`LS-SL-010`) | **Only where genuinely not within a resident's dwelling** | MP | Installation count | **X** — most assistive technology in this sector is inside a dwelling and therefore excluded. Confirm location before including anything here |
| SL-12 | Staff areas | Staff call / alarm system (`LS-SL-011`) | — | MP | Point count | **S1** |
| SL-13 | Sleep-in / waking-night room | Fitted furniture, call point | Staff overnight provision is standard in a supported scheme | MP | Room count | **S3** — we infer this is a common part, but it may be argued to serve the dwellings |
| SL-14 | Laundry (shared) | Commercial or semi-commercial laundry equipment | — | MP | Machine count | **X** — may be a common part or may be within the homes. **This is a Q6a question, not a fixture question** |
| SL-15 | Whole scheme | Enabling works (`LS-SL-014`) | **Follows the same `serves_dwellings` answer as its parent row** — not a blanket room-level answer | Follows parent | Priced BoQ | **S1** |
| SL-16 | Structure (residual) | `LS-SBA-001` | s.270CF generally does not reach this sector — residents hold tenancies and support is a separate service (Module 03 §4/§8, E-10) | Largely unavailable | N/A | **S1** |
| SL-17 | Loose equipment (chattel) | Office equipment, computers, freestanding furniture (`LS-SL-012`) | Not this schedule's target | `MP_AIA` | Fixed-asset register | **S1** |

### 3b. Within a resident's dwelling — EXCLUDED (listed so nothing here is claimed by mistake)

| # | Room type | What is there | Pool | Note |
|---|---|---|---|---|
| SL-18 | Resident's own kitchen | Fitted kitchen, white goods | `NONE` (`LS-SL-013`) | Excluded wherever sited if it serves the dwelling. Replacement of Domestic Items Relief may apply instead — **signpost only, not a capital allowance** |
| SL-19 | Resident's own bathroom | Sanitaryware, heating | `NONE` | As above |
| SL-20 | Resident's bedroom / living room | Flooring, electrical, furniture | `NONE` | As above |
| SL-21 | Shared kitchen/lounge **within** a home | — | `NONE` | Settled as part of the homes under CA11520 / *Hora Tevfik* — Module 03 Q6a |

**Questions for you — Supported Living**

1. **Master determination first** — tenancies and own homes, or an institutional care setting? Get
   this wrong and the whole schedule is the wrong one.
2. Dwelling configuration — single dwelling (likely `STOP`), several self-contained homes, or
   several bedrooms sharing a kitchen and lounge?
3. Heating and hot-water source — shared central plant, individual per home, or mixed? This decides
   whether SL-7, usually the biggest item on site, is excluded in full.
4. **SL-13 (sleep-in room) and SL-14 (shared laundry) — common part or part of the homes?** We have
   guessed differently on each and we are not confident on either.
5. Is there any assistive technology or accessible bathing genuinely in a common area (SL-11)?
6. **Can common-parts costs actually be segregated from dwelling costs on the documents available?**
   If not, the claim likely fails on evidence even where it exists in law (*Hora Tevfik*).

---

## 4. GP / Primary Care (Module 04)

**Scale driver:** `gp_consulting_room_counts` (`structured <consulting, treatment, minor_ops>`,
Schema §3.4). **This sector has the one room whose existence is settled by a register lookup rather
than a client assertion** — the dispensary, gated on `gp_is_dispensing_practice` (ODS, grade A).

| # | Room type | Item (taxonomy ref) | Why we expect it in this room | Pool | Quantity measured against | Confidence |
|---|---|---|---|---|---|---|
| GP-1 | Consulting room | Clinical hand-wash basin and dedicated plumbing (`LS-GP-001`) | Infection control requires a clinical basin distinct from a domestic one in every clinical room | MP | Consulting room count × **RD-10** (basins per room) | **S1** |
| GP-2 | Consulting room | Examination / treatment lighting (`LS-GP-002`) | — | MP | Room count | **S1** |
| GP-3 | Consulting room | Fitted furniture and worktops (`LS-GP-003`) | Wipe-clean clinical worktops and storage | MP | Linear metres | **S1** |
| GP-4 | Consulting room | Trade-related acoustic insulation (`LS-GP-004`) *(judgement)* | Patient confidentiality is a clinical requirement, not comfort — **but only if the evidence supports the function test** | MP *(judgement)* | Linear metres — **RD-09** | **S2** on presence, **contested** on qualification |
| GP-5 | Consulting room | Telephone / call system point (`LS-GP-006`) | — | MP | Room count | **S1** |
| GP-6 | Consulting room | Data / comms outlets (`LS-MP-008`) | Clinical system terminals | MP | Outlet count — **RD-04 open** | **S2** |
| GP-7 | Consulting room | Panic / staff attack alarm | Standard in primary care | MP | Room count | **S4** — **no taxonomy row.** Is this inside `LS-GP-006` (call system) or missing? |
| GP-8 | Treatment room | Everything in GP-1 to GP-6 | — | MP | Treatment room count | **S1** |
| GP-9 | Treatment room | Negative-pressure / enhanced ventilation (`LS-GP-008`) *(judgement / contested)* | Infection control in a treatment setting — same family as the dental and private-hospital calls | MP *(contested)* | Room count | **X** — present only in some practices |
| GP-10 | Minor-ops room | Specialist lighting, scrub facilities, fixed autoclaves, sluice (`LS-GP-007`) | A minor-ops room is a theatre in miniature | MP | Minor-ops room count | **X** — **not every practice has one** |
| GP-11 | Reception / waiting | Patient check-in, calling and queue management (`LS-GP-005`) | — | MP | Unit count | **S1** |
| GP-12 | Reception / waiting | Telephone system head-end (`LS-GP-006`) | — | MP | One per practice | **S1** |
| GP-13 | Reception / waiting | Signage and fitted furniture (`LS-MP-002`, `LS-MP-009`) | — | MP | Linear metres | **S1** |
| GP-14 | Reception | Screen / security glazing at the desk | Common in primary care | MP | Linear metres | **S4** — **no taxonomy row**, and we do not know whether you would treat security glazing as a fitting or as fabric |
| GP-15 | Dispensary | Fitted dispensing units, controlled-drug storage, dedicated security (`LS-GP-010`) | — | MP | Linear metres | **S1** — **but gated on `gp_is_dispensing_practice` (ODS). Do not include this room unless the flag is TRUE** |
| GP-16 | Clinical / cold-chain store | Dedicated power and cooling for vaccine storage (`LS-GP-011`) | Cold chain requires dedicated, alarmed supply — **the fridges themselves are chattels** | MP | Circuit count | **S1** |
| GP-17 | Phlebotomy room | As a consulting room (GP-1 to GP-6) | — | MP | Room count | **X** — may or may not be a distinct room |
| GP-18 | Circulation | Disabled-access hoists and patient lifts (`LS-GP-012`) | — | MP | Installation count | **X** — depends on storeys and layout |
| GP-19 | Circulation | Fire alarm and detection (`LS-MP-003`) | Statutory | MP | Detection points, **room-driven** | **S1** |
| GP-20 | Accessible WC | Sanitaryware, grab rails, alarm pull cord (`LS-MP-001`) | Statutory accessibility | MP | Fitting count | **S2** |
| GP-21 | Staff room / office | Fitted furniture (`LS-MP-002`) | — | MP | Linear metres | **S2** |
| GP-22 | Whole building | Integral features (`LS-SR-*`) | — | **SR** | GIA | **S1** |
| GP-23 | Whole building | Builder's work incidental to primary-care plant (`LS-GP-014`) | Follows the plant it serves — **watch the NHS grant interaction: do not claim the works while disclaiming the grant-funded plant** | Follows parent | Priced BoQ | **S1** |
| GP-24 | Structure (new build / extension) | `LS-SBA-001` | Subject to the grant interaction (Module 04 §8) | SBA | N/A | **S1** |
| GP-25 | Loose equipment (chattel) | Clinical kit, vaccine fridges, examination couches, computers, portable diagnostics (`LS-GP-013`) | Not this schedule's target | `MP_AIA` | Fixed-asset register | **S1** |
| GP-26 | Whole practice — consulting and treatment rooms, corridors, escape routes | Emergency lighting | Statutory | `APPORTION` | Fittings per enclosed space and escape-route segment — **RD-15, blank** | **S4** — **no taxonomy row (XS-1)**, same question as CH-27. **No default quantity and no default pool** |

**Questions for you — GP / Primary Care**

1. **GP-7 (panic alarm) and GP-14 (reception security glazing) are S4 rows with no taxonomy home.**
2. Does this practice have a genuine minor-ops room, or only consulting and treatment rooms (GP-10)?
3. **GP-4 — acoustic insulation.** Is there clinical/confidentiality evidence for the function test,
   or is it comfort-driven (which fails the List C item 7 "mainly" test)?
4. **GP-9 — ventilation classification.** `MP` trade apparatus or `SR` integral feature? Please
   answer consistently with DN-10 and PH-3.
5. Was any of this funded by an NHS premises improvement grant, and if so, which specific cost
   elements does the grant letter name?
6. **RD-10 — how many clinical hand-wash basins would you expect per consulting room?** One is our
   assumption. We have not modelled a number.
7. **GP-26 — emergency lighting.** A separate item, or already inside general electrical and lighting?
   (XS-1.)

---

## 5. Private Hospitals / Clinics (Module 05)

**Facility type gates room existence more than in any other sector.** Module 05 §1 sets out a
gradient — consulting-only clinic → day-surgery / treatment centre → full acute hospital.
**Most rooms below will not exist below `ACUTE` / `SPECIALIST`.** This is the full superset; strike
out what this facility does not have before using it. Scale driver:
`ph_high_acuity_room_counts` (`structured <theatre, icu, imaging, sterile_services>`, Schema §3.5).

| # | Room type | Item (taxonomy ref) | Why we expect it in this room | Pool | Quantity measured against | Confidence |
|---|---|---|---|---|---|---|
| PH-1 | Consulting room (outpatient) | Behaves like a GP or dental consulting room — see §4 | — | MP | Room count | **S1** — present at every facility type |
| PH-2 | Operating theatre | MGPS terminal outlets (`LS-PH-001`) | HTM 02-01 medical gas at each anaesthetic and surgical position | MP | Outlets per theatre — **RD-11** | **S1** |
| PH-3 | Operating theatre | **Ultra-clean / laminar-flow ventilation (UCV)** (`LS-PH-002`) | HTM 03-01. **CONTESTED — the single biggest pool call in the framework** | **Contested MP vs SR** | Canopy count | **S1** on presence, **contested** on pool |
| PH-4 | Operating theatre | Isolated power supply / IPS panel (`LS-PH-004`) *(contested)* | Medical-location electrical safety | MP *(contested)* | Panel count | **S1** on presence |
| PH-5 | Operating theatre | Pendants, surgeon's panels, scrub stations (`LS-PH-005`) | — | MP | Per theatre | **S1** |
| PH-6 | Operating theatre | Fixed operating lighting (`LS-PH-006`) | — | MP | Per theatre | **S1** |
| PH-7 | Operating theatre | Pneumatic tube terminal (`LS-PH-012`) | Specimen and blood-product transport | MP | Terminal count | **X** — acute facilities only |
| PH-8 | Anaesthetic / prep / recovery room adjoining theatre | MGPS, scavenging, monitoring points | A theatre suite is not one room | MP | Room count | **S3** — **we have modelled the theatre as a single room and it is not.** A theatre suite is typically 3–5 spaces. Tell us how you would count it |
| PH-9 | ICU / critical care room | Isolation / critical-care pressure ventilation (`LS-PH-003`) *(contested)* | HTM 03-01 | MP *(contested)* | Room count | **S1** |
| PH-10 | ICU / critical care | Nurse-call and patient-monitoring infrastructure (`LS-PH-013`) | — | MP | Points per bed — **RD-12** | **S1** |
| PH-11 | ICU / critical care | Patient hoists and bariatric lifts (`LS-PH-014`) | — | MP | Installation count | **S2** |
| PH-12 | Imaging room (X-ray / CT) | Radiation shielding, lead-lined (`LS-PH-007`) *(judgement)* | IRR 2017 controlled area. **s.23(4) risk — this is the fabric-vs-plant fault line** | MP *(judgement)* | Room count | **S1** on presence, **contested** on qualification |
| PH-13 | Imaging room (MRI) | RF / Faraday shielding (`LS-PH-007`) | Different physics, same taxonomy row | MP *(judgement)* | Room count | **S1** |
| PH-14 | Imaging room (MRI) | Quench pipe, chilled-water and heavy power to the magnet | An MRI's services are a substantial and often-missed installation | MP | Room count | **S3** — we assume these sit inside `LS-PH-007` and we are not confident they should |
| PH-15 | Sterile services / CSSD | Washer-disinfectors, fixed sterilisers, RO water, dedicated drainage (`LS-PH-008`) | HTM 01-01 | MP | Unit count | **S1** |
| PH-16 | Endoscopy room | Decontamination and RO water plant / station services (`LS-PH-009`) | — | MP | Room count | **X** — specialist facilities |
| PH-17 | Dialysis room | As endoscopy (`LS-PH-009`) — water treatment and station services | — | MP | Station count | **X** |
| PH-18 | Aseptic pharmacy / clean room | Controlled environment and filtration (`LS-PH-010`) *(judgement)* | — | MP *(judgement)* | Room count | **X** |
| PH-19 | Pathology / lab | Fume cupboards and fixed benching (`LS-PH-011`) | — | MP | Linear metres | **X** |
| PH-20 | Ward / inpatient bed area | Nurse-call and monitoring (`LS-PH-013`); hoists (`LS-PH-014`); sanitaryware (`LS-MP-001`) | — | MP | Bed count — **RD-12** | **S1** |
| PH-21 | Ward / inpatient bed area | Bed-head trunking and medical-gas points at each bed position | The bed-head unit is a fixed service run, not furniture | MP | Bed count | **S3** — we assume this is inside `LS-PH-001` (MGPS) and `LS-PH-013`. Confirm it is not falling between them |
| PH-22 | Reception / admin | Fitted furniture (`LS-MP-002`); signage (`LS-MP-009`) | — | MP | Linear metres | **S1** |
| PH-23 | Mortuary | Mortuary refrigeration (`LS-PH-017`) | — | MP | Body-store count | **X** — acute facilities only |
| PH-24 | Hydrotherapy pool | Pool and plant (`LS-PH-015`) | **List C item 16 is express statutory authority** | MP | One per site | **X** — specialist rehab only. **"A hydrotherapy pool used in delivering rehabilitation is a different case from an amenity pool" (Module 05 §4) — confirm clinical use** |
| PH-25 | Catering / laundry plant room | Commercial catering, kitchen and laundry (`LS-PH-016`) | — | MP | Installation count | **S2** |
| PH-26 | Plant room | Medical-gas manifold room (oxygen, vacuum, medical air) | The source end of `LS-PH-001` | MP | One per site | **S2** — we assume it is inside `LS-PH-001`; if the manifold room is a separate installation, say so |
| PH-27 | Plant room | Standby generator, UPS, electrical sub-mains | Life-safety resilience is mandatory at acute scale | MP or **SR** — **open** | Installation count | **S4** — **no distinct private-hospital taxonomy row.** Care homes have `LS-CH-011`. Is the private-hospital equivalent missing, or inside `LS-SR-001`? |
| PH-28 | Whole building | Integral features (`LS-SR-*`) | — | **SR** | GIA | **S1** |
| PH-29 | Whole building | Enabling works (`LS-PH-019`) | **The largest s.25 exposure in the framework.** Follows the plant it serves | Follows parent | Priced BoQ | **S1** |
| PH-30 | Structure (new build / extension) | `LS-SBA-001` | Material on large builds | SBA | N/A | **S1** |
| PH-31 | Loose equipment (chattel) | CT/MRI/X-ray units, surgical robots, monitors, beds, trolleys, IT (`LS-PH-018`) | **"The room, the shielding and the dedicated services are fixed; the machine is moveable"** | `MP_AIA` | Fixed-asset register | **S1** — do not double-count |
| PH-32 | Whole facility — theatres, wards, corridors, escape routes | Emergency lighting | Statutory | `APPORTION` | Fittings per enclosed space and escape-route segment — **RD-15, blank** | **S4** — **no taxonomy row (XS-1)**, same question as CH-27. **No default quantity and no default pool** |

**Questions for you — Private Hospitals / Clinics**

1. **PH-8 is our biggest structural doubt in this sector.** We have modelled an operating theatre as
   one room. A theatre suite is not one room. How would you count it, and does the fixture list
   differ between the theatre proper and the anaesthetic/prep/recovery spaces?
2. **PH-27 (standby power) is an S4 row with no taxonomy home.**
3. **PH-14 (MRI services) and PH-21 (bed-head trunking) — are these inside existing rows, or falling
   between them?** They are large enough that falling between two rows costs real money.
4. UCV, isolation ventilation, IPS, radiation and RF shielding (PH-3, PH-9, PH-4, PH-12, PH-13) —
   the pool-allocation defence note (`ph_judgement_item_register`) needs building for each. We have
   not attempted it.
5. Is the operator a charity or not-for-profit? This gates entitlement entirely, before any
   room-level question matters.
6. Has there been, or is there planned, a sale-and-leaseback?
7. Mortuary and hydrotherapy — confirm presence, and for hydrotherapy confirm genuine clinical use.
8. **PH-32 — emergency lighting.** A separate item, or already inside general electrical and lighting?
   (XS-1.)

---

## 6. Cross-sector items we could not place, listed once

These recur across sectors and we cannot resolve them from anything we hold. They are collected
here because answering them once fixes them everywhere.

| Ref | The item | Why it is unresolved | Rows affected |
|---|---|---|---|
| **XS-1** | **Emergency lighting** | Is it a separate item, or already inside `LS-SR-001` (general electrical and lighting, **SR, 6%**) rather than a distinct trade fitting (**MP, 14%**)? **This is a pool question worth real money and it recurs in every sector.** Tagged `APPORTION` on every row; never defaulted | CH-27, SL-4, DN-32, GP-26, PH-32 — every sector |
| **XS-2** | **Commercial kitchen extract / canopy** | Inside the catering row, inside `LS-SR-004` (powered ventilation, SR), or missing? | CH-14, PH-25 |
| **XS-3** | **Clinical / anti-static flooring** | Trade fitting or building fabric? | DN-9, and treatment rooms in GP and PH |
| **XS-4** | **Security glazing and screens at reception** | Fitting or fabric? | GP-14, and any reception |
| **XS-5** | **Medication / controlled-drug storage outside a dispensary** | GP has `LS-GP-010`; care homes and private hospitals have no equivalent | CH-18, PH wards |
| **XS-6** | **Standby power outside care homes** | Care homes have `LS-CH-011`; private hospitals, where it matters more, have nothing | PH-27 |
| **XS-7** | **The ventilation family** — dental decontamination-room and aerosol-procedure extract, GP treatment-room enhanced ventilation, private-hospital UCV and isolation ventilation | Four separate contested calls that are arguably one question asked four times: ordinary building ventilation, or clinical equipment that happens to move air? | DN-10, DN-14, DN-33, GP-9, PH-3, PH-9 |

**We would rather have one consistent answer to XS-7 applied five times than five answers.** If the
right answer genuinely differs by case, tell us what the distinguishing factor is, and we will build
that factor into the question flow rather than asking you again on every job.

---

## 7. Index of the rows we are least sure about

**S4 — guesses (19 rows at v2.0; 22 at v2.1).** These are where we had nothing better and said so.
CH-14, CH-18, CH-27, CH-30, DN-9, DN-20, DN-32, SL-4, GP-7, GP-14, GP-26, PH-27, PH-32 — plus the nine cross-sector
placements at §6 that follow from them (XS-1 through XS-6 each affect at least one further sector's
equivalent row).

**S3 — inferred, unverified (13 rows at v2.0; 14 at v2.1).** CH-2, CH-3, CH-9, CH-12, CH-32, CH-37, DN-16, DN-33, SL-13,
PH-8, PH-14, PH-21 — plus the FRA structure of this whole document, and the assumption at CH-37
that Legionella control sits inside the cold-water integral feature.

**X — room-type existence uncertain (24 rows).** CH-4, CH-5, CH-23, CH-28, CH-29, CH-33, CH-42,
DN-7, DN-8, DN-10, DN-14, DN-31, SL-11, SL-14, GP-9, GP-10, GP-17, GP-18, PH-7, PH-16, PH-17,
PH-18, PH-19, PH-23, PH-24. Most of these are property questions rather than model questions — the
client answers them, not you — **except CH-42 (children's homes), which is a taxonomy gap we need a
ruling on before we accept that work at all.**

**Everything else is S1 or S2**: 89 rows sourced to a module specification, the taxonomy CSV, or a
named technical standard, or believed to be standard practice.

---

## Sources and status

`Module-01` … `Module-05-*-Specification.md` (§4 in each — fixture taxonomies);
`Caprebate-Fixture-Taxonomy-v1.csv` (canonical `element_id`, `pool`, `unit`, `quantity_basis`);
`Build-Prep-Consolidated-Schema.md` §1.C, §1.G, §3.1–§3.5 (`room_counts` sub-fields);
`Module-00-Master-Engine-Specification.md` §5 (pool legend and the `APPORTION` / `CONTESTED`
convention). Technical standards named on the rows that rely on them: HTM 01-01, HTM 01-05,
HTM 02-01, HTM 03-01, IHEEM VTP/GN/001, IRR 2017. **These are named as the reason an item exists,
not quoted, and no clause of any of them is reproduced here.**

Indicative technical scaffolding. **Not tax advice, not a survey, and not a completed document
until a chartered surveyor has signed it off or marked it up.** Every quantity and every contested
pool call remains a surveyor's or CTA's decision.
