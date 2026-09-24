# BCIS — the source register row (Phase 151, 24 September 2026)

Lakhbir chose BCIS as the cost source instead of the Spon's price books (Word answers 6 and 8, closed 24 September 2026).
No Spon's book is bought. The three Spon's PDFs in `07-reference-and-benchmarks/price-books/` stay where they are, unused.
This file is the research behind `BCIS_COMMERCIAL` in `caprebate-source-register.ts`, written in the shape of
`caprebate-cibse-plant-lives-source-register-row.md`: what the supplier publishes, and every gap held as a refusal.

## What was read (all 24 September 2026)

| Page | What it is |
|---|---|
| bcis.co.uk/terms-conditions-of-sale/ (last updated 9 April 2026) | BCIS Ltd's terms of sale. **Annex One, "Special Conditions for BCIS Subscription"**, is the licence for every BCIS data product except Rebuild Plus (Annex Two). |
| The BCIS Online terms page as archived on 17 July 2024 (the live page returns 404) | The terms inside the BCIS Online login, dated 17 June 2024. They match Annex One on every point below. |
| bcis.co.uk/webiste-terms-conditions/ (updated 4 September 2024) | Website terms: site content may not be reproduced for commercial gain. It covers the website, not subscription data. |
| bcis.co.uk/packages-and-services/ (updated 17 July 2026), the CapX, TotX and IABP product pages | Which modules each package holds. No prices: every page says book a demonstration. |
| bcis.co.uk/insight/bcis-basics-using-location-factors-in-construction/ | Which packages include location factors. |
| bcis.co.uk/frequently-asked-questions/, /contact-us/ | Extra users are priced by the commercial products team. |
| developer.bcis.co.uk | The API portal: how to request access. No licence text. |
| Find a Tender 065201-2025 and Contracts Finder 12ce27d3-… | What two public bodies paid (not BCIS's own prices): TfL £67,500 ex VAT for a year from 20 Oct 2025; the Valuation Office Agency £57,186 for TotX and ProtX, April 2025 to March 2026. |

The licensor is **Building Cost Information Service Ltd**, not RICS itself.

## What BCIS publishes (Annex One)

| Field | What the licence says | Clause |
|---|---|---|
| Licence | non-exclusive, non-transferable, revocable, for the Subscription Term | 2.1 |
| Internal use | the Data and edited copies may be stored on the subscriber's own systems and shared there with its licensed users | 2.1(b)-(c) |
| Who may use it | each user a named employee with their own login; no more users than the order states; working from the office on the order | 2.3(a),(b),(d),(e) |
| Copies | only for back-up, security, disaster recovery and testing; no automated harvesting | 2.3(f), 2.3(j) |
| To clients | extracts may be sent to customers or clients where they relate to projects created in the service and are reasonably necessary to advise in the normal course of business | 2.1(d) |
| Anything else | no redistribution, and no use beyond the licence | 2.2, 2.3(h) |
| Credit | any display credits BCIS "wherever technically and commercially feasible"; Ordnance Survey and Royal Mail notices listed without saying where they go | 7.3, 7.4 |
| Term | 12 months unless the order says otherwise; renews unless either side gives 30 days' notice | 9.1 |
| On expiry | the Data and edited copies are deleted immediately, except Derived Data (changed so far it cannot be traced to BCIS or used in its place) | 9.2 |
| Audit | BCIS may audit use until a year after expiry | 4.1 |
| Reliance | the services are for information only and not to be used as conclusive, complete or authoritative | general terms 13.6 |

## What BCIS does not publish — each held as a refusal

| Gap | Held in the register as |
|---|---|
| Credit wording | `attribution_text` begins `NOT PUBLISHED`; nothing reaches a report until BCIS states it |
| The client's accountant | `accountant_report: false` — the grant names only customers or clients |
| HMRC | `hmrc_pack: false` — not mentioned; only disclosure the law requires (8.2(c)) |
| Whether our engine's figure in a client's report is an "extract relating to projects created in the service" | `client_report: false` until BCIS confirms it in writing |
| Whether every member of staff who can see a BCIS figure is a named licensed user | `internal: true` **only on that condition**, which the order form must show before anything is loaded |
| An API or data-feed licence | the BCIS source row keeps `endpoint: null`; nothing is fetched |
| A freshness period for a loaded edition | `cache_max_age_days: 365` is the published subscription term, not a freshness rule; expiry means deletion |
| Prices | none published; quote after a demonstration |

## What is left, and whose it is

Word question 218, for Lakhbir: "Which BCIS product did you agree to, and does its licence let our software use its rates?"
The answer is the product name and its order form (user count, office, any special terms). Until then the LEG-E4 tables in
`04-phase-work/phase9/caprebate-cost-model.cjs` stay empty and the gate stays off. Permissions and licensing:
contactbcis@bcis.co.uk; API access: api@bcis.co.uk.

The tests: `T-BC1` to `T-BC3` in `caprebate-source-register.test.ts`. The first two fail on the pre-change register
(`04-phase-work/phase151/proofs/phase3-bcis-tests-on-bak151-MUST-FAIL.log`).
