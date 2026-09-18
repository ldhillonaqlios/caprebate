# Price-book sanity check — outcomes only

**Version:** 1.0 · 31 August 2026 · Claude (Phase 52)
**Books consulted:** Spon's Mechanical & Electrical Services Price Book 2021 and 2022; Spon's
Architects' and Builders' Price Book 2024 (AECOM). All held on the Caprebate Desktop.

---

## The rule this document obeys

**These books were used as an internal sanity check on our own reasoning and for nothing else.**

**No rate, table, band, percentage or figure from any of them has been transcribed** into this
document, the repository, the fixture taxonomy, the source register, or any engine table. Three
reasons, and each is sufficient on its own:

1. **Their provenance in this business is unestablished.** We hold PDFs. We have not established a
   licence position for using their content in a commercial deliverable.
2. **Item 12830181420 requires publisher, licence and retrieval timestamp on every field written.**
   We can supply publisher. We cannot supply licence. So the field cannot be written.
3. **A rate we cannot licence-evidence cannot go in a defence pack.** A figure whose source we
   cannot disclose is worse than no figure, because it looks sourced.

**And a fourth reason that governs how any gap is read.** The editions are two to five years old —
the 2022 M&E book states its prices as second-quarter 2021 tender levels, which is five years before
today. **A gap between our figure and a book figure therefore cannot be attributed.** It may be our
error, or it may be four years of construction cost inflation, and nothing we hold can tell the two
apart. Any outcome below that reads as a numeric comparison would be unsound for that reason alone,
which is part of why none of them is.

**What is recorded below is outcomes**: what the check found, expressed as a finding about our own
model, never as the underlying data.

---

## Outcome 1 — A price book cannot check a quantity, and this confirms the QD-S9 gap is real

**Checked:** whether a published price book could validate the detection-point count that
`s9-quantity-derivation-v2.md` §5 rebuilt (15–19 points on a 268 m² dental fit-out, against 2.4–4.8
on the area-density reading).

**Outcome:** **it cannot, structurally.** The M&E book prices fire detection and alarm work **per
point** — per detector, per call point, per sounder. It takes the point count as an *input*. It
contains no statement anywhere of how many points a building of a given size or type has.

**What this means for us, and it is not a null result.** The quantity side of "quantity × rate" is
genuinely unsourced, and buying a price book would not close it. **QD-S9 is not a gap we have failed to
research; it is a gap the commercial literature does not fill**, which is why it routes to a
surveyor's project experience rather than to a purchase. The one purchase that *would* close a
quantity question is the structured-cabling standard behind RD-04 (§6b of that document), and that
is a different kind of document from a price book.

---

## Outcome 2 — Our LEG-E2 position is independently corroborated at the level of principle

**Checked:** LEG-E2 asserts that the residual model's 18% preliminaries uplift is a double count,
because on-costs are already inside an estimated replacement cost. That assertion currently rests on
VOA guidance alone.

**Outcome:** **corroborated in principle by a second, independent published source.** The M&E book's
own front matter states that its measured rates are built up from gang rates within which the
percentage allowances for overhead, profit and preliminaries **are already defined and included**.
That is the same structural point LEG-E2 makes: a rate that already contains on-costs must not then
be multiplied by an on-cost uplift.

**What was deliberately not done.** The book also quotes preliminaries percentage ranges elsewhere.
Those are not comparable to our 18% and have not been compared to it: they attach to a *trade
contract* base, and our 18% attaches to an *estimated replacement cost* base. Comparing figures
across two different bases would produce a number that looked like evidence and was not. **No
numeric comparison was made and none should be read into this.**

**Status of LEG-E2 is unchanged.** The gate stays false. What this adds is a second reason to think
the finding is right, not a reason to ship it — the fix still belongs to whoever clears the VOA
question on the board.

---

## Outcome 3 — Our *JD Wetherspoon* treatment of preliminaries is corroborated

**Checked:** the invoice path applies a pro-rata apportionment of preliminaries and overheads,
citing *JD Wetherspoon*. That citation is load-bearing — it is the authority the invoice path rests
on, and it survives the LEG-E2 fix rather than being a casualty of it.

**Outcome:** **corroborated.** The M&E book carries its own capital allowances chapter, which
independently states the *JD Wetherspoon* holding that overheads and preliminaries may be allocated
on a pro-rata basis, alongside the s.25 incidental-expenditure treatment our taxonomy's
`LS-XX-014`/`019` enabling-works rows already follow.

**What this is worth.** Not much on its own — it is a published summary of a case we have read
directly, not new authority. It is recorded because a *disagreement* here would have been worth a
great deal, and there was none.

---

## Outcome 4 — Two of our five sectors have no published comparator at all, including the pilot sector

**Checked:** whether the book's feasibility rates (£/m² all-in engineering services by building
type) cover our five sectors, so that a future reconstruction-cost figure could be sanity-checked
against a published one.

**Outcome:**

| Our sector | Covered in the M&E 2022 feasibility rates? |
|---|---|
| Private hospitals / clinics | **Yes** — and District General Hospitals separately |
| GP / primary care | **Yes** |
| Supported living | **Partly** — an apartments category exists, which is adjacent but is not a supported-living scheme with common parts |
| **Dental practices** | **No. No entry of any kind.** |
| **Care homes** | **No. No entry of any kind.** |

**What this means commercially, and it is the most useful thing this check produced.** Phase 10's
commercial finding was that Caprebate should lead its pilot with **invoiced dental
fit-outs**. That is the sector for which **no published £/m² engineering-services comparator exists
in the book we hold**, so a dental reconstruction-cost figure cannot be sanity-checked against
anything published — it can only be checked by a surveyor who has priced dental work.

That does not change the pilot decision. It does change what the pilot needs from a surveyor:
**for dental and care homes, the surveyor is not a second opinion on our figure, they are the only
opinion available.** Worth knowing before the engagement rather than after.

---

## Outcome 5 — Nothing we hold today was checkable, because nothing we hold is a number

**Checked:** whether any figure currently in the engine could be compared against a book rate.

**Outcome:** **no.** Every rate table in `phase9/caprebate-cost-model.cjs` ships `loaded: false`
with an empty body — the VOA fee scale, the location factors, the contract size adjustment, both
obsolescence scales, the CIBSE plant lives. The shipped engine values a claim from sector yield
bands, not from unit rates. **There is currently no unit rate anywhere in this repository for a
price book to check.**

The two figures that *do* exist and could in principle be checked are the specification's
preliminaries and professional-fee defaults — and both are already under internal challenge as
LEG-E2 and LEG-E3, both are gated, and neither is comparable to a book figure on the same base (see
Outcome 2).

**This is the honest headline of the whole exercise: there was very little to check.** That is a
statement about the maturity of the cost model, not about the books.

---

## What was done with the extracted text

The books were converted to searchable text in a session scratch directory outside the repository,
searched, and **the extracted text was deleted at the end of the session.** No extract, quotation,
table or rate was written into the repository at any point. This document contains no book content.

---

## Recommendation

**Do not buy a current edition on the strength of this exercise.** The two things we most need — a
detection-point count method and a data-outlet density — are not in a price book at all (Outcome 1),
and the sectors we intend to lead with are the ones it does not cover (Outcome 4). A current edition
would help once we have unit rates to check, which is a later problem than it looks.

**Do put Outcome 4 in front of the surveyor.** "There is no published comparator for dental or care
homes and you are the only check we will have" is a materially different engagement from "confirm
our figure", and it should be priced and scoped as such.

**The cost-library purchase (board item 12804374406, approx. £330) is a separate question** and is
not answered here. That purchase is for LEG-E4's location factors and contract-size adjustment,
which *are* in these books and which we cannot use from these copies for the licence reason above.
Whether to buy a licensed copy for that purpose stands on its own merits.
