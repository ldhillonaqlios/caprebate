# Caprebate — the CRM disposition table

**What this is.** Every section and every field of the full CRM requirements
specification, each given exactly one disposition against the application that
already runs in `09-app/backend`. **It is the scope of the ten CRM phases.** A
developer prices the build from this table and from the Developer Spec, never
from the two Word documents.

**Written by CRM 1 of 10 — the backbone — on 10 September 2026, before any code.**
A later CRM phase that finds a row wrong **corrects the row and says so in the
row**. CRM 10 of 10 closes it: every ADOPTED row names the file and the test that
built it, or it goes into a phase.

**Extended by CRM 2 of 10 — leads and the pipeline — on 10 September 2026.** Rows
7.11, 7.12, 8.16, 8.24 to 8.26, 9.3, 22.3, 22.4, 22.11 and 29.4, and decisions E3
and E5, each say in the row what changed. Section 9 now carries the mapping of the
document's stage names onto the procedure. Part E gained E9 to E21, Part F one
question, and Part H is the evidence for every row CRM 2 built.

**Extended by the gated-exit repair on 11 September 2026.** Decision E21 says in the row
what changed, Part E gained E22, and Part I is the evidence for what the repair built.

**Extended by CRM 3 of 10 — staff tasks, one next action per claim, the activity timeline,
automation and email templates — on 11 September 2026.** Rows 5.11, 5.12, 8.23, 10.2, 14.10
and 19.4 each say in the row what was built, and row 14.4 is corrected in the row. Part E
gained E23 to E33, and Part J is the evidence for every row CRM 3 built. It raised no question.

**Extended by CRM 4 of 10 — documents on the claim: types, versions, requests, and who may see them — on
11 September 2026.** Rows 11.1 to 11.9 each say in the row what was built. Part E gained E34 to E47, Part F
one question, and Part K is the evidence for every row CRM 4 built.

**Extended by CRM 5 of 10 — introducers and the accountant referral channel — on 11 September 2026.** Rows
12.1 to 12.15, B4.6 and B4.7 each say in the row what was built, and row 12.12's and 12.13's "last contact"
and "next contact" are corrected in the row to what the application does. Part E gained E48 to E58, Part F
two questions, and Part L is the evidence for every row CRM 5 built. **It re-derived one premise of its own
prompt and found it narrower than written**: clause 1 of the engagement letter leaves blank the fee for
Caprebate's own tax adviser, not a fee to an introducer — row E51.

**Extended by CRM 6 of 10 — the claim's capital allowances facts, the four figures, sign-offs, deliverables and
aftercare — on 11 September 2026.** Every row in Part B2 and row B4.5 are built, and Part M is the evidence for each.
Part E gained E59 to E77, and Part F one question. **It re-derived two premises of its own prompt.** The four figures
are defined differently by the prompt and by the Estimate-to-Outcome Reconciliation design, so the claim keeps the
prompt's four and the reconciliation keeps the design's schema — row E64. And the engagement letter now carries
clause 13, with three blanks, where the question it waits on still said the letter contained none of it — row E75.

**Extended by CRM 7 of 10 — finance on the claim, the fee controls and VAT monitoring — on 11 September 2026, by CRM 8
of 10 — the compliance registers — and by CRM 9 of 10 — dashboards, search, saved views, export and admin settings — on
12 September 2026.** Their decisions are E78 to E137 and their evidence Parts N, O and P.

**CLOSED BY CRM 10 OF 10 ON 12 SEPTEMBER 2026 — and closed by a check that can fail, not by a reading.**
`node 03-app/caprebate-crm-fold-check.cjs` fails when an ADOPTED row names no evidence and is carried to no live phase, a
question row cites a title CAPREBATE QUESTIONS does not have, a REJECTED row names no rule, or an evidence line names a
file, a name or a test title that does not exist. **Reading the table that way found eleven adopted rows that are not
built as they say**, each now marked in its own row and CARRIED to a phase; seven evidence cells that claimed rows by
prefix; and one question cited under a title it does not have. Part Q is the evidence and the account, and E138 to
E146 are the decisions.

**Extended by the CRM follow-on — the adopted rows the CRM fold found unbuilt — on 12 September 2026.** All eleven rows
CRM 10 of 10 carried are built, and none is carried any longer: 4.12, 8.5 and 8.6 read the introducer and the source
through the lead; 8.4 and 23.7 are the claim team, on migration 020; 22.13 is the document centre; 23.8 is the estimated
fee; 28.3 derives the prior-claim position; 29.5 is built and switched off, and names its question; and **22.16 and 29.11
are corrected in their rows — the reports screen is the dashboard over a period, and the period is now any period.** The
nine defects running the guide's exercises found are fixed too. Part R is the evidence, E147 to E155 are the decisions, and
Part F gained one question.

**Extended by Phase 129 — four things built before the person each waits on has answered, each switched off — on 12 September
2026.** Rows 11.3, E34, B3.10 and E94 each say in the row what changed. Part E gained E156 to E159, Part F one question and
two more citations, and Part S is the evidence. **It re-derived one premise of the question it drafted a recommendation for:
binding a receipt policy is not one line in one migration** — row E158.

**The sources**, copied byte for byte from the Mac Desktop by CRM 1 of 10 — the originals there stay untouched — and
**archived by CRM 10 of 10 into `_archive/superseded/`**, where `README-phase125-supersession.md` says where every
section of each went:

| File | What it is | sha256 |
|---|---|---|
| `CapRebate - CRM.docx` | **The full specification**, version 1.0, dated 2 September 2026. Twenty-nine numbered sections | `fe5ed5f7ddec95354f4e96f042cb09bdd8b28e3630339a8651dc407fc97ff6fd` |
| `CapRebate - CRM.1.docx` | **The startup cut** — "Capital Allowances CRM – Startup MVP". What to build first and what to leave | `20de21d8d22c2a291a9bc63a08393c252117af14747d95022f24cd900d15457e` |

Both use forward-slash ZIP entry paths (`word/document.xml`); neither has a table.

**WHERE A CRM DOCUMENT AND THE RUNNING APPLICATION DISAGREE, THE APPLICATION IS
RIGHT.** Both documents are generic capital allowances CRM specifications and
neither knows the application exists. Handed to a developer as written they would
be priced as a rebuild of what is running, and several of their lines would break
rules this build enforces.

## How to read a row

Exactly one mark per row:

| Mark | Means | The last column names |
|---|---|---|
| **ALREADY BUILT** | It exists and is tested | the file and the table that has it |
| **ADOPTED** | It will be built as asked | the CRM phase that builds it, by name |
| **ADOPTED WITH A RULE** | It will be built, but not as the document wrote it | the rule it is built under, and the phase |
| **REJECTED** | It is not built | the standing rule or decision it breaks |
| **QUESTION** | Nobody may decide it here | its title in CAPREBATE QUESTIONS |

**The ten phases, by name.** They run in this order because it is the dependency
order.

| Name used in this table | The phase |
|---|---|
| **CRM 1** | CRM 1 of 10 — the backbone: organisations, contacts, properties and the claim record |
| **CRM 2** | CRM 2 of 10 — leads and the claim pipeline: the operating procedure's ten stages, their gates and their exits |
| **CRM 3** | CRM 3 of 10 — staff tasks, one next action per claim, the activity timeline, automation and email templates |
| **CRM 4** | CRM 4 of 10 — documents on the claim: types, versions, requests, and who may see them |
| **CRM 5** | CRM 5 of 10 — introducers and the accountant referral channel |
| **CRM 6** | CRM 6 of 10 — the claim's capital allowances facts, the four figures, sign-offs, deliverables and aftercare |
| **CRM 7** | CRM 7 of 10 — finance on the claim, the fee controls, and VAT monitoring |
| **CRM 8** | CRM 8 of 10 — the compliance registers |
| **CRM 9** | CRM 9 of 10 — dashboards, global search, saved views, export and admin settings |
| **CRM 10** | CRM 10 of 10 — fold the CRM into the Developer Spec, close this table, archive the two Word documents |

**The rules a row cites**, so a reader does not need another document open:
**N1** nothing estimate-derived reaches a SURVEYING session; **N2** no third
party's name in the claim record, one identity store, nothing looked up about a
person; **N3** the receipt contract governs every upload; **N4** unknown and
never-asked behave identically and never become zero, a limit or a pass;
**13(a)** commercial means the client, not the building; **13(b)** free register
calls wait on a published privacy notice; **13(c)** paid calls wait on a signed
engagement and an operator's click; **the five roles** ADMIN, SALES, ACCOUNTING,
SURVEYING, CLIENT — a sixth is a question, not a build decision; **the client's
accountant and every introducer have no login**.

---

# PART A — the full specification, section by section

## Front matter

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 0.1 | Purpose: the complete lifecycle from lead generation to invoicing and aftercare | ADOPTED WITH A RULE | **The lifecycle is the ten-stage standard operating procedure, enquiry to defence pack**, with a server-side gate at every stage and a reasoned exit — not the document's seventeen generic stages. CRM 2 |

## 1 · Product objectives

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 1.1 | One source of truth for clients, contacts, properties, claims, introducers, documents, activities and financials | ADOPTED WITH A RULE | **One store per fact, and never a copy.** A third party's name lives only in the identity store (CRM 8); nothing crosses from it into the claim record (N2). Built across CRM 1 to CRM 8 |
| 1.2 | Workflow visible; everyone can see what is outstanding and who owns the next action | ADOPTED | CRM 3 |
| 1.3 | Reduce administration through task creation, reminders, status changes and standard communications | ADOPTED WITH A RULE | **No automation may open either register gate, move a claim past a gate, flip a CTA switch, fire a register call, send anywhere but the outbox, write to a DO_NOT_CONTACT organisation, or create an invoice email.** Each refused with a test. CRM 3 |
| 1.4 | One organisation has multiple contacts, properties and claims | ADOPTED | CRM 1 — `contacts.business_id` and `properties.business_id` already exist; the claim record is new |
| 1.5 | One property has multiple claims or workstreams | ADOPTED | CRM 1 — `claims.property_id`, many claims per property |
| 1.6 | Management dashboards: pipeline, conversion, claim value, fees, productivity, outstanding actions | ADOPTED WITH A RULE | **Every tile is a query authorised at the store, never a stored total; no estimate-derived tile reaches SURVEYING (N1); a tile whose inputs are unknown says so rather than counting them as zero (N4).** CRM 9 |
| 1.7 | A complete audit trail of important changes and user activity | ALREADY BUILT | `src/audit.ts`, table `audit_log` (migration 001) — append-only by trigger, hash-chained, detail screened for personal data |
| 1.8 | Designed for future integration with accounting, email, calendar, document storage and other services | ADOPTED WITH A RULE | **Behind the seams that exist** — `EmailTransport`, `SignatureProvider`, the register stub, `TextExtractor`, `ObjectStore` — **and no connector fires** (13(b), 13(c)). Accounting is an export seam, not a build. CRM 10 writes the developer's half into Developer Spec §5 |

## 2 · Core data model

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 2.1 | Organisation → Property | ALREADY BUILT | `properties.business_id` (migration 002). Extended, not rebuilt, by CRM 1 |
| 2.2 | Property → Claim / Opportunity | ADOPTED | CRM 1 — the `claims` table |
| 2.3 | Claim → Workstreams | ADOPTED WITH A RULE | **A workstream is a column on the claim, and a property with two workstreams holds two claims.** The rulebooks treat plant and machinery, structures and buildings, and land remediation as separate reliefs with separate figures, sign-offs and deadlines, so one claim carrying two would force one stage and one sign-off onto two different things. CRM 1 |
| 2.4 | Claim → Documents / Activities / Financials | ADOPTED | Documents CRM 4 · activities CRM 3 · financials CRM 7 |
| 2.5 | "Claim / Opportunity" as one record | ADOPTED WITH A RULE | **The opportunity is the claim; the lead is a separate record** that converts into one without re-keying (CRM 2) |

## 3 · Main CRM modules

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 3.1 | Organisations / Clients | ADOPTED | CRM 1 — **extends `businesses`**, never a parallel table: thirteen tables carry a foreign key into it and migration 007 records what rebuilding it costs |
| 3.2 | Contacts — clients, accountants, advisers, introducers and other parties | ADOPTED WITH A RULE | **A client's accountant is a contact, never a user.** CRM 1 extends `contacts`; introducer firms are CRM 5 |
| 3.3 | Properties | ADOPTED | CRM 1 — extends `properties` |
| 3.4 | Leads | ADOPTED WITH A RULE | **Not a second intake.** A filled assessment, a funnel-close booking, a gated exit and a referral are already leads; `leads` ties them together. CRM 2 |
| 3.5 | Opportunities / Claims | ADOPTED | CRM 1 builds the record; CRM 2 its stage |
| 3.6 | Tasks & Activities | ADOPTED WITH A RULE | **Staff tasks are a new table, distinct from `client_tasks` and never merged into it** — a question the client answers and a job a colleague does are different facts. CRM 3 |
| 3.7 | Documents | ADOPTED WITH A RULE | **Built on the upload handler that exists, and there is never a second one.** `documents`, `document_events` (migration 003), `src/web/uploads.ts` and the twelve-step receipt contract are running; CRM 4 adds types, versions, requests and property and claim links (N3) |
| 3.8 | Introducers / Partners | ADOPTED WITH A RULE | **No login, ever.** CRM 5 |
| 3.9 | Financials | ADOPTED WITH A RULE | **Recorded, not collected — there is no card processor, by decision.** `invoices` (002, 006) and `src/web/finance.ts` are running; CRM 7 moves invoices onto the claim |
| 3.10 | Reports & Dashboards | ADOPTED | CRM 9 |
| 3.11 | Users / Permissions — role-based access and administration | ALREADY BUILT | `users`, `roles` (001), `src/roles.ts`, `src/authz.ts` — **six roles** since Phase 132e added READ_ONLY (held by nobody, an explicit decision on every action), deny by default, authorised on the specific object |

## 4 · Organisations / Clients

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 4.1 | Organisation ID (system generated) | ALREADY BUILT | `businesses.id` (002), a UUID from `newId()` |
| 4.2 | Legal name | ADOPTED WITH A RULE | CRM 1, `businesses.legal_name`. **Derived from the Companies House register record's `company_name` wherever one is held, and not asked again.** Recorded by staff only where nothing derives it |
| 4.3 | Trading name | ADOPTED WITH A RULE | CRM 1. **The existing `businesses.name` BECOMES THE TRADING NAME** — it is what the client typed at the funnel close, which is what the business calls itself, not a name verified against a register. `businesses.trading_name` is a generated column that reads `name`, so there is one stored value and the two cannot drift |
| 4.4 | Companies House number (optional) | ADOPTED WITH A RULE | CRM 1, `businesses.company_number`, **nullable — not every claimant has one** (a partnership, a sole trader, an individual). Derived from the register record where one is held |
| 4.5 | Organisation type | ADOPTED WITH A RULE | CRM 1, `businesses.claimant_type`. **The list is taken from the three Tax Implication Summary variants (company, partnership, sole trader) and section 5 of the AML/KYC Position Paper (limited company, partnership, sole trader, charity, property held personally by an individual)** — with LLP from the partnership variant's own branch, and UNKNOWN as a value: `COMPANY`, `LLP`, `PARTNERSHIP`, `SOLE_TRADER`, `INDIVIDUAL`, `CHARITY`, `UNKNOWN`. **Derived at submission from the funnel's entity answer**; never-asked and UNKNOWN render identically (N4). It is not `invoices.entity_type`, which is the engine's tax-band key and turns on where an individual lives |
| 4.6 | Registered address | ADOPTED | CRM 1, `businesses.registered_address` |
| 4.7 | Trading address | ADOPTED | CRM 1, `businesses.trading_address` |
| 4.8 | Website | ADOPTED | CRM 1, `businesses.website` |
| 4.9 | Primary contact | ADOPTED WITH A RULE | CRM 1. **No column on `businesses`, which carries no personal names.** The primary contact is a `contacts` row flagged as the decision maker; the funnel-close contact is the first one |
| 4.10 | Accountant / tax adviser | ADOPTED WITH A RULE | CRM 1: **a contact of type ACCOUNTANT on the organisation, never a user.** The firm as a referral source is an introducer (CRM 5). The chartered tax adviser who signs is a record on the claim (CRM 6) |
| 4.11 | Solicitor / other adviser | ADOPTED | CRM 1: a contact of type ADVISER |
| 4.12 | Introducer | ADOPTED | CRM 5 *Found not built by CRM 10 of 10, and built by the CRM follow-on: the firms that referred the organisation are read through its leads — the join the claims list makes — onto the organisation page and its `view.json`, never a column and never typed (Part R, E147).* |
| 4.13 | Client status: Prospect / Active / Dormant / Former / Do Not Contact | ADOPTED WITH A RULE | CRM 1, `businesses.client_status`. **DO_NOT_CONTACT IS A CONTROL, NOT A LABEL: the outbox refuses to queue anything to that organisation**, in code and again at the database, with a test for each |
| 4.14 | Source | ADOPTED WITH A RULE | CRM 1, `businesses.source`, on the lead-source list CRM 2 adopts. **Derived as WEBSITE for a business that arrived through the funnel** |
| 4.15 | Owner / relationship manager | ADOPTED | CRM 1, `businesses.owner_id` → `users` |
| 4.16 | Notes | ALREADY BUILT | `internal_notes` (002), panel 5 of the business page. **Not a second notes column.** ADMIN and SALES only, escaped on output, a stored cross-site scripting test |
| 4.17 | Created date / created by / last updated | ADOPTED WITH A RULE | `created_at` ALREADY BUILT; `updated_at` CRM 1. **Who created and who last changed a record are read from the audit log**, which CRM 1 writes on every organisation, contact, property and claim write — a `created_by` column would be a second copy that can disagree with it. CRM 3's timeline shows them |

## 5 · Contacts

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 5.1 | Contact ID | ALREADY BUILT | `contacts.id` (003) |
| 5.2 | First name / last name | ALREADY BUILT | `contacts.full_name` (003) — **one field, as the funnel close captures it.** Splitting it invites a guess at which part is which |
| 5.3 | Job title | ALREADY BUILT | `contacts.job_role` and `job_role_other` (003) — thirteen values plus free text, and free text is never a validation failure |
| 5.4 | Organisation | ALREADY BUILT | `contacts.business_id`, **NOT NULL** (003). A contact never exists without its organisation. **The startup cut drops this field, and it matters** — see Part D |
| 5.5 | Contact type: Decision Maker / Finance / Accountant / Adviser / Introducer / Other | ADOPTED | CRM 1, `contacts.contact_type` |
| 5.6 | Email address(es) | ADOPTED WITH A RULE | CRM 1, `contacts.email` — **one address per contact.** The funnel-close contact's route stays where the funnel wrote it (the business's contact channel and the booking row) and is not copied onto the contact |
| 5.7 | Telephone / mobile | ADOPTED | CRM 1, `contacts.phone` |
| 5.8 | Preferred contact method | ALREADY BUILT | The booking row's `channel`, in CB_BOOKING's vocabulary (003). `businesses.preferred_contact` was retired by 004 and removed by 007 — **do not bring back a second home for it** |
| 5.9 | Decision maker flag | ADOPTED WITH A RULE | CRM 1, `contacts.is_decision_maker`, **nullable: not recorded is not "no"** (N4) |
| 5.10 | Communication preferences | ALREADY BUILT | `contacts.contact_consent` and `marketing_optin`, **per channel** (003) — kept as built. A consent history with wording versions is CRM 8 |
| 5.11 | Last contact date | ADOPTED WITH A RULE | CRM 1, `contacts.last_contact_at`, recorded by staff; **CRM 3 derives it from the timeline** once there is one. *Built by CRM 3 of 10 (E25): `lastContactFor` in `src/web/timeline.ts` — a completed call, email or meeting task naming the contact, or a message the outbox actually sent. A value recorded by hand before is kept and read as such; a trigger refuses any new one. A cancelled call, an unsent email and silence read identically* |
| 5.12 | Next follow-up date | ADOPTED WITH A RULE | CRM 1, `contacts.next_follow_up_at`; CRM 3 makes it a task. *Built by CRM 3 of 10 (E25): migration 012 carries every value into a follow-up task naming the contact and retires the column; the contact shows its earliest open follow-up* |
| 5.13 | Notes | ADOPTED WITH A RULE | CRM 1, `contacts.notes` — **internal: ADMIN and SALES only, escaped on output** |

## 6 · Properties

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 6.1 | Property ID / reference | ALREADY BUILT | `properties.id` (002) |
| 6.2 | Full address | ADOPTED WITH A RULE | CRM 1, `address_line_1`, `address_line_2`, `town`. The existing `properties.label` stays as the display label — the funnel wrote the client's own address text there |
| 6.3 | Postcode | ALREADY BUILT | `properties.postcode` (002), **resolved only through `src/web/postcode.ts`** |
| 6.4 | *(not in the document)* Jurisdiction | ADOPTED WITH A RULE | CRM 1, `properties.jurisdiction` — england, wales, scotland, northern_ireland. **Derived from the postcode wherever the resolver can, and never asked twice**: the store refuses a recorded jurisdiction on a property whose postcode already derives one. See Part B |
| 6.5 | Property type | ADOPTED WITH A RULE | CRM 1, `properties.property_type` — **a value on the property-type list since CRM 9 of 10 (migration 019); a free-text type recorded before the list is kept as written; never defaulted** |
| 6.6 | Property use | ADOPTED WITH A RULE | CRM 1, `properties.property_use` — the same rule |
| 6.7 | Freehold / leasehold | ADOPTED WITH A RULE | CRM 1, `properties.tenure` — FREEHOLD, LEASEHOLD, UNKNOWN. **Never recorded and UNKNOWN render identically** (N4) |
| 6.8 | Current owner | ADOPTED WITH A RULE | **The organisation the property belongs to is the owner, by the link; there is no column.** Where the organisation leases it, that is the tenure. A landlord who is an individual is a third party and belongs in the identity store (CRM 8), never on the property (N2) |
| 6.9 | Occupier | ADOPTED WITH A RULE | CRM 1, `properties.occupier` — **a company name or a role token, never an individual's name** (N2), refused by the store with a test |
| 6.10 | Purchase / acquisition date | ADOPTED WITH A RULE | CRM 1, `properties.acquisition_date`. **The funnel's own answer is shown beside it with its source and never parsed into a date** — it captures a month or a year and `src/web/funnel-session.ts` records why a partial date silently parsed is a wrong amendment window |
| 6.11 | Purchase / acquisition price | ADOPTED WITH A RULE | CRM 1, `properties.acquisition_price_pence`, integer pence. The funnel's spend answer is shown with its source; an unknown spend stays unknown and never becomes 0 |
| 6.12 | Completion date | ADOPTED | CRM 1, `properties.completion_date` |
| 6.13 | Disposal date, if applicable | ADOPTED WITH A RULE | CRM 1, `properties.disposal_date`. **Setting one raises a task pointing at the Disposal Note** — the election on a future sale. CRM 6 |
| 6.14 | Previous owner | ADOPTED WITH A RULE | CRM 1, `properties.previous_owner` — **a company name or a role token, NEVER an individual's name** (N2). The store accepts a role token or a name ending in a registered company designation and refuses anything else, with a test |
| 6.15 | Construction / refurbishment details | ADOPTED WITH A RULE | CRM 1, `properties.construction_notes`; the funnel's works answer is shown with its source |
| 6.16 | Existing capital allowances claimed? Yes / No / Unknown | ADOPTED WITH A RULE | CRM 1, `properties.existing_ca_claimed`. **UNKNOWN and never-asked behave identically and neither passes anything** — asserted both ways (N4). The funnel's own prior-claim answer is shown with its source |
| 6.17 | Prior claim information | ADOPTED | CRM 1, `properties.prior_claim_notes` |
| 6.18 | Survey status | ADOPTED WITH A RULE | **Belongs to the CLAIM, not the property.** One building can be surveyed for one relief and not another. Today it is `surveyor_jobs.state` (002); CRM 2 makes it the claim's SURVEY stage |
| 6.19 | Survey date | ADOPTED WITH A RULE | **On the claim.** The evidenced date is `surveyor_commitments.committed_at` (006); CRM 2 reads it. A booked site visit is REJECTED — see 9.7 |
| 6.20 | Surveyor | ADOPTED WITH A RULE | **On the claim**: CRM 1, `claims.surveyor_id`. **SURVEYING reaches a property or a claim only through an assigned survey job** (`surveyor_jobs`, `assignedSurveyor`) — naming a surveyor on a claim is a record, not an access grant |
| 6.21 | Property notes | ADOPTED WITH A RULE | Construction and prior-claim notes are property facts (CRM 1). **Anything else is an internal note**, one notes store; CRM 3 links notes to a property or a claim |

## 7 · Lead management

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 7.1 | Lead source: Website / Referral / Accountant / Adviser / Outbound / Event / Existing Client / Other | ADOPTED | CRM 2 (CRM 1 already stores it on the organisation) |
| 7.2 | Lead date | ADOPTED | CRM 2 |
| 7.3 | Prospect name and contact | ALREADY BUILT | The funnel close writes `contacts`, the business's contact channel and `bookings` (003) |
| 7.4 | Potential property | ALREADY BUILT | `properties`, written from the funnel's property screen |
| 7.5 | Initial property value | ADOPTED WITH A RULE | **Read from the funnel's spend answer, never re-keyed; unknown stays unknown.** CRM 2 |
| 7.6 | Estimated opportunity value | ADOPTED WITH A RULE | **The sealed estimate and the range the client was shown** (`estimates`, `assessments.shown_low_pence`/`shown_high_pence`) — read, never typed, **never readable by SURVEYING** (N1). CRM 2 |
| 7.7 | Lead owner | ADOPTED | CRM 2 |
| 7.8 | Lead score / priority | REJECTED | **The score** breaks N4: a score built on the estimate routes unknowns into a number that ranks leads. Priority alone is kept (CRM 2). Automated lead scoring is also the documents' own Phase 2 — see 25.10 |
| 7.9 | Next action | ADOPTED | CRM 2, and CRM 3's one-next-action rule |
| 7.10 | Lead status: New / Contacted / Qualified / Nurture / Converted / Lost | ADOPTED | CRM 2 |
| 7.11 | Lost reason | ADOPTED WITH A RULE | CRM 2, **from a configurable list — `reason_lists`, a table and not code (migration 010)**, each code naming the stop condition it comes from; a code is retired, never deleted. *Corrected by CRM 2 of 10: this row said the list was CRM 9's; CRM 2 built the list and CRM 9 adds only its settings screen* |
| 7.12 | Conversion date | ADOPTED WITH A RULE | CRM 2, `converted_at` — **converting creates or links the organisation, property and claim without re-keying anything the assessment captured**. *As built:* the organisation is the one the assessment created, or — for a referral that arrived first — one a person links at conversion; the claim takes the lead's assessment, the organisation's first property unless another of its own is named, and its workstream as migration 009 derives it. **Converting opens the claim** (E3) |

## 8 · Opportunity / Claim record

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 8.1 | Unique claim / opportunity reference | ADOPTED WITH A RULE | CRM 1, `claims.claim_ref` — **a human series such as CR-2026-0001, unique, never reused.** The series is its own table and never goes backwards; a claim cannot be deleted and its reference cannot be changed, both refused by the database |
| 8.2 | Linked organisation | ADOPTED | CRM 1, `claims.business_id` |
| 8.3 | Linked property | ADOPTED WITH A RULE | CRM 1, `claims.property_id` — **a composite foreign key, so a claim cannot point at another organisation's property.** Nullable only because a claim can exist before its property is recorded; it then says so |
| 8.4 | Linked contacts | ADOPTED WITH A RULE | **Reached through the organisation.** CRM 1 shows the organisation's contacts on the claim; the per-claim team panel with external advisers is CRM 5 *Half built when CRM 10 of 10 found it; finished by the CRM follow-on: the claim team panel, and migration 020's link table joining the organisation's own accountant and adviser to THIS claim — a contact, never a user (Part R, E148).* |
| 8.5 | Introducer | ADOPTED | CRM 5 *Found not built by CRM 10 of 10, and built by the CRM follow-on: the claim's introducer is read through the lead it came from onto the claim page and its `view.json`, for `introducer.read` (Part R, E147).* |
| 8.6 | Lead source | ADOPTED | CRM 2 — shown on the claim from its lead *Found not built by CRM 10 of 10, and built by the CRM follow-on: the lead's source on the claim, and the organisation's where a person opened the claim with no lead — the claims list's own reading (Part R, E147).* |
| 8.7 | Claim type / workstream | ADOPTED WITH A RULE | CRM 1, `claims.workstream`. **The list is taken from the rulebooks' reliefs**: `PLANT_AND_MACHINERY` (Registers A and D), `STRUCTURES_AND_BUILDINGS` (Register I §4, Register F), `LAND_REMEDIATION` (Register H), and `UNKNOWN`. The Annual Investment Allowance, full expensing and first-year allowances are allowances **within** plant and machinery, not workstreams |
| 8.8 | Acquisition date | ADOPTED WITH A RULE | **A property fact** (6.10), read on the claim and never re-keyed per claim. CRM 1 |
| 8.9 | Acquisition value | ADOPTED WITH A RULE | **A property fact** (6.11). CRM 1 |
| 8.10 | Estimated qualifying expenditure | ALREADY BUILT | `estimates.qualifying_expenditure_pence` (002), sealed and hashed. **On the claim page for ADMIN and SALES only** (CRM 1); the four figures are CRM 6 |
| 8.11 | Estimated tax benefit | ALREADY BUILT | `estimates.indicative_lifetime_saving_pence` (002). ADMIN and SALES only; **never SURVEYING** (N1) |
| 8.12 | Estimated fee | ALREADY BUILT | `invoices.fee_pence` (002) — **derived from the engine's claim value, never typed.** CRM 7 moves it onto the claim |
| 8.13 | Fee basis / pricing model | ADOPTED WITH A RULE | **Five per cent of the allowances identified — decided 3 September 2026 — read from the engine, never chosen on a screen.** The open refinement is "The rate card's fee bands were written against tax saved. Where should the breakpoints sit now?" CRM 7 |
| 8.14 | Agreed fee | REJECTED | **The fee derives from the engine's claim value.** A finance screen that could type an agreed fee would be a second place the fee is decided; a credit note is the only way a raised amount changes (CRM 7) |
| 8.15 | Probability | REJECTED | **N4.** A probability is a guess, and multiplying a pipeline by it routes unknowns into a value. The stage, its gate and its exits carry the facts; CRM 9 counts claims by stage instead |
| 8.16 | Pipeline stage | ADOPTED WITH A RULE | CRM 1, `claims.stage` — **the six keys `stages.ts` already has, backfilled from each business**; `businesses.stage` is not moved or renamed. **CRM 2 owns the vocabulary** and replaces it with the procedure's ten. *Done by CRM 2 of 10:* the procedure's ten, CLOSED, eight exits and ON_HOLD, held by the two named triggers migration 010 replaced — the table was not rebuilt — and every existing claim converted and placed no later than its records evidence (E10) |
| 8.17 | Expected completion date | ADOPTED | CRM 1, `claims.expected_completion` |
| 8.18 | Claim owner | ADOPTED | CRM 1, `claims.owner_id` |
| 8.19 | Surveyor | ADOPTED WITH A RULE | CRM 1, `claims.surveyor_id` — see 6.20 |
| 8.20 | Technical / analysis owner | QUESTION | **"Do we need a login for anyone beyond the five roles — a manager, a technical reviewer, or a read-only viewer?"** |
| 8.21 | Tax / accounting owner | ADOPTED WITH A RULE | **The chartered tax adviser has no login; their sign-off is a record** naming who, when and on what (CRM 6). The client's accountant is a contact (CRM 1) |
| 8.22 | Priority | ADOPTED WITH A RULE | CRM 1, `claims.priority` — LOW, NORMAL, HIGH, validated in code rather than by a database CHECK so CRM 9 can make it configurable without rebuilding the table. **Unset reads "not set"** |
| 8.23 | Next action | ADOPTED WITH A RULE | CRM 1, `claims.next_action` and `next_action_due`; **CRM 3 enforces exactly one, with an owner and a due date**. *Built by CRM 3 of 10 (E23, E27): the next action is the claim's flagged open staff task; both columns are carried into tasks and retired by migration 012; a stage move that would leave an open claim without one is refused* |
| 8.24 | Hold reason | ADOPTED WITH A RULE | CRM 1, `claims.hold_reason`; CRM 2 makes ON_HOLD carry the stage it returns to. *Built by CRM 2 of 10:* `claims.hold_return_stage`, and a trigger refusing ON_HOLD without a reason or a return stage; a claim resumes there and nowhere else, and its hold reason cannot be cleared while it is on hold |
| 8.25 | Lost reason | ADOPTED WITH A RULE | CRM 1, `claims.lost_reason`; CRM 2 makes the exits reasoned and the reasons a configurable list. *Built by CRM 2 of 10:* an exit carries a code from the `CLAIM_EXIT` list, refused at the database if unlisted, and its note is kept in `claim_stage_moves`. `claims.lost_reason` stays CRM 1's free-text field |
| 8.26 | Completion date | ADOPTED | CRM 2 — set when the claim reaches CLOSED. *Built:* `claims.completed_at`, and a trigger holding it to exactly the closed claims, so a reopen clears it |
| 8.27 | Notes | ALREADY BUILT | `internal_notes` (002); CRM 3 links a note to a claim |

## 9 · Default pipeline

**KNOWN CONFLICT.** Seventeen generic stages, against the ten-stage standard
operating procedure — ENQUIRY, ASSESSMENT, ENGAGEMENT, DATA_GATHERING, SURVEY,
VALUATION, TAX_ADVISER_SIGNOFF, REPORTS, INVOICE, DEFENCE_PACK, then CLOSED — with
a gate at every stage and a reasoned exit. **The document's stage names become
sub-states or tasks inside a procedure stage, not stages.** CRM 2 builds the
mapping and writes it into this section.

**The mapping, as CRM 2 of 10 built it.** A claim's stage is one of the procedure's
(`src/web/stages.ts`, its words tested against the procedure's own file). Each of the
document's names is a lead state, a stage, a gate, a sub-state or a task inside one:

| The document's stage | In the procedure it is | Built as |
|---|---|---|
| New Lead | before the enquiry | a lead at NEW |
| Initial Contact | before the enquiry | a lead at CONTACTED |
| Qualified | the ENQUIRY gate | a lead at QUALIFIED, which only four recorded YES checks reach; converting opens the claim at ASSESSMENT |
| Information Requested | a sub-state of DATA_GATHERING | client questions and document requests outstanding (`client_tasks`; document requests are CRM 4) |
| Information Received | a sub-state of DATA_GATHERING | set by what arrived (CRM 4), then the "data gathering complete" confirmation |
| Survey Required | SURVEY | the stage itself |
| Survey Booked | — | REJECTED, 9.7 |
| Survey Completed | the SURVEY gate | a `surveyor_commitments` row on a survey job on the claim |
| Technical / Tax Analysis | VALUATION, then TAX_ADVISER_SIGNOFF | two stages, each with its own gate |
| Report Preparation | REPORTS | the stage itself |
| Draft Report | a deliverable inside REPORTS | CRM 6's deliverables register |
| Client Review | a sub-state of REPORTS | the "client accepted the report" confirmation; its follow-up date is CRM 3's |
| Accountant Review | a sub-state of REPORTS | the "accountant confirmed the claim fits the return" confirmation — offline, no login |
| Claim Ready | the REPORTS gate | both confirmations, and the tax adviser's sign-off carried forward |
| Claim Completed | INVOICE | the stage, whose gate is the fee trigger |
| Invoiced | the INVOICE gate | the fee trigger reached and an invoice raised |
| Paid / Closed | DEFENCE_PACK, then CLOSED | the defence pack confirmation closes the claim; payment is CRM 7's record |
| On Hold · Cancelled · Lost | ON_HOLD · CANCELLED · LOST | a hold carrying its return stage; two exits beside the procedure's six |

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 9.1 | New Lead | ADOPTED WITH A RULE | A lead at NEW, before ENQUIRY is passed. CRM 2 |
| 9.2 | Initial Contact | ADOPTED WITH A RULE | A lead at CONTACTED. CRM 2 |
| 9.3 | Qualified | ADOPTED WITH A RULE | **The enquiry gate**: UK healthcare property, a trading client (13(a) — so supported living is in), no existing claim conflict, each YES, NO or UNKNOWN, and **UNKNOWN does not pass**. CRM 2. *Corrected by CRM 2 of 10: **four** checks, not three — SOP 1 makes "the enquirer is the owner, or acting with the owner's authority" a stop condition of its own (E13). Recorded append-only with who and when; never-asked reads exactly as UNKNOWN* |
| 9.4 | Information Requested | ADOPTED WITH A RULE | A sub-state of DATA_GATHERING — client questions and document requests outstanding. CRM 2, CRM 4 |
| 9.5 | Information Received | ADOPTED WITH A RULE | A sub-state of DATA_GATHERING — **set by what arrived, never by a click** (CRM 4) |
| 9.6 | Survey Required | ADOPTED WITH A RULE | SURVEY. CRM 2 |
| 9.7 | Survey Booked | REJECTED | **The desktop-first survey model.** There is no site appointment to book: CB_BOOKING removed video on 3 September 2026 and says it returns, if at all, as a post-engagement survey step on the surveyor's own diary, and whether a building can be valued without a visit is the surveyor's question "Can you value a building you have not stood in?" |
| 9.8 | Survey Completed | ADOPTED WITH A RULE | **SURVEY completes only when a `surveyor_commitments` row exists** — a server-side gate with a skip test. CRM 2 |
| 9.9 | Technical / Tax Analysis | ADOPTED WITH A RULE | VALUATION, then TAX_ADVISER_SIGNOFF. **No claimable figure reaches the client before the sign-off record exists** (CRM 2 builds the gate shut; CRM 6 the record) |
| 9.10 | Report Preparation | ADOPTED WITH A RULE | REPORTS. CRM 2 |
| 9.11 | Draft Report | ADOPTED WITH A RULE | A deliverable at DRAFT inside REPORTS (CRM 6). **Nothing in this build generates a report** |
| 9.12 | Client Review | ADOPTED WITH A RULE | A sub-state of REPORTS with a follow-up date. CRM 2, CRM 3 |
| 9.13 | Accountant Review | ADOPTED WITH A RULE | A sub-state of REPORTS — **offline: the client's accountant has no login** and receives the handoff pack; progress is shared only under the client's opt-in (CRM 5) |
| 9.14 | Claim Ready | ADOPTED WITH A RULE | The REPORTS-to-INVOICE boundary. CRM 2 |
| 9.15 | Claim Completed | ADOPTED WITH A RULE | INVOICE, **which waits on the fee trigger** — shipped at the most cautious reading, and decided on 16 September 2026 by Phase 132e: our report delivered for filing, read from the deliverables register. CRM 2, CRM 7 |
| 9.16 | Invoiced | ADOPTED WITH A RULE | INVOICE with an invoice raised — **recorded, not collected**. CRM 7 |
| 9.17 | Paid / Closed | ADOPTED WITH A RULE | DEFENCE_PACK, then CLOSED. Payment is recorded by a person who has seen the bank. CRM 2, CRM 7 |
| 9.18 | On Hold state | ADOPTED WITH A RULE | ON_HOLD, carrying a hold reason **and the stage it returns to**. CRM 2 |
| 9.19 | Cancelled state | ADOPTED | An exit, CANCELLED. CRM 2 |
| 9.20 | Lost state | ADOPTED WITH A RULE | An exit, LOST — beside the procedure's reasoned exits DECLINED_AT_ENQUIRY, CLIENT_DID_NOT_PROCEED, CLIENT_DECLINED_TO_SIGN, REASONED_NEGATIVE, CLIENT_WITHDREW and OUTSIDE_AMENDMENT_WINDOW. CRM 2 |
| 9.21 | "Without deleting the underlying record" | ADOPTED | **Nothing is deleted.** CRM 1 makes a claim undeletable at the database; CRM 2's exits keep the row |

## 10 · Tasks and activities

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 10.1 | Create tasks manually or automatically | ADOPTED | CRM 3 |
| 10.2 | Task fields: title, description, owner, due date, priority, status, related organisation, property and/or claim | ADOPTED WITH A RULE | CRM 3 — **at least one of organisation, property or claim**, and cancelled rather than deleted. *Built by CRM 3 of 10, with one addition (E24): a task may also be about a LEAD, because a call asked for at the reasoned negative is a lead with no organisation and its first follow-up has nowhere else to live. A task may name a contact of its own organisation or lead, and may wait with a team until a person takes it* |
| 10.3 | Statuses: Open / In Progress / Completed / Cancelled | ADOPTED | CRM 3 |
| 10.4 | Activity types: Call / Email / Meeting / Note / Task / Survey / Document Request / Review / Other | ADOPTED | CRM 3 |
| 10.5 | Show overdue tasks prominently | ADOPTED WITH A RULE | CRM 3 — **stored in UTC, shown in UK time; `src/web/localtime.ts` stays the only file naming a zone** |
| 10.6 | Recurring tasks where appropriate | ADOPTED WITH A RULE | CRM 3 — **a simple recurrence that creates the next task on completion, not a scheduler** |
| 10.7 | Timeline view against each client, property and claim | ADOPTED WITH A RULE | CRM 3 — **a READ over what is already recorded; there is never a second event log** |
| 10.8 | Internal notes separate from client-facing communications | ALREADY BUILT | `internal_notes` against `client_tasks`; `can()` refuses a note to CLIENT, SURVEYING and ACCOUNTING — `test/engaged.test.ts` proves no portal reader and no surveyor payload returns one |

## 11 · Document management

**KNOWN CONFLICT.** Documents as simple uploads, against the receipt contract and
the three stores.

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 11.1 | Upload documents against an organisation, property or claim | ADOPTED WITH A RULE | **Against the organisation, ALREADY BUILT** (`documents.business_id`, `src/web/uploads.ts`); CRM 4 adds property and claim links through a join table, because one lease can serve two claims — **BUILT by CRM 4 of 10**: `document_links` (migration 013), `linkDocument` and `unlinkDocument` in `src/web/documents.ts`; a link is ended with who and when, never deleted (E37) |
| 11.2 | Document type configurable | ADOPTED | CRM 4 — **BUILT**: `document_types`, ADMIN-edited on `/staff/document-types`; a receipt policy is bound only by a migration, never on the page (E34) |
| 11.3 | Suggested types — engagement letter to correspondence | ADOPTED WITH A RULE | CRM 4 seeds this list **plus the Stage 2 document upload list and the client-upload types the extraction specifications cover**; each type carries who may read it, its retention clock (UNSET is visible, never a default) and whether the strip applies — **BUILT**: twenty-five types — the Stage 2 list's ten, the planning specification, and fourteen from this list, its purchase contract merged into the sale contract and its invoices split into our fee invoice and a contractor's (E35). **The fourteen have no receipt policy, so none can be received yet** (E34, and the question in Part F). **Phase 129 recorded a recommended strip for each, with a reason, and bound none** (E158) |
| 11.4 | Store file name, type, upload date, uploader, version and linked records | ADOPTED WITH A RULE | File name, type, date and uploader ALREADY BUILT (`documents`, 003); version and links CRM 4 — **BUILT**, and **a new version's file name is derived, never the client's** (E41) |
| 11.5 | Support document versioning | ADOPTED | CRM 4 — **BUILT**: `logical_documents` and five columns on `documents` (migration 013); `startDocumentUpload` (E40) |
| 11.6 | Do not overwrite previous versions without retaining history | ADOPTED WITH A RULE | CRM 4 — **nothing overwrites, and each version keeps its own deletion clock** — **BUILT**: the `documents_nothing_overwrites` and `documents_version_insert` triggers; `documents.retention_ref`, the type's clock at the moment of upload (E39, E40) |
| 11.7 | Secure download / preview where technically feasible | ALREADY BUILT | `GET /portal/documents/{id}/download` in `src/web/router.ts` — authorises that document for that requester on that request and writes an access record (DB-W1-T3, DB-W1-T6). **It returns 410 by design**: under the fail-closed settings the original is deleted once the strip has run and there is nothing to serve. **CRM 4 of 10 adds the staff route `GET /staff/documents/{id}/download`, asking `document.read_original` — ADMIN and the client (E44)** |
| 11.8 | Document requests tracked as outstanding / completed | ADOPTED WITH A RULE | CRM 4 — **a client question of kind DOCUMENT, extending `client_tasks`**, and RECEIVED is set by an upload of the requested type, never by a click — **BUILT**: `client_tasks.kind`, `requested_type`, `claim_id` and `received_document_id` (013); `createDocumentRequest`, `receiveByUpload`, `withdrawDocumentRequest`; the trigger `client_tasks_received_only_by_upload` (E42, E43) |
| 11.9 | Restrict sensitive documents by role | ADOPTED WITH A RULE | CRM 4 — **enforced in `can()` against the document itself**: SURVEYING an assigned job's documents only and never the letter's fee terms; ACCOUNTING invoices and the signed letter only — **BUILT**: `document.read` and eight more actions in `src/authz.ts`, per reader class (E36, E37, E45) |

## 12 · Introducers / referral partners

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 12.1 | Partner organisation / person | ADOPTED WITH A RULE | CRM 5 — **the firm is the introducer; the people at it are contacts of type INTRODUCER; none of them ever has a login**. *Built by CRM 5 of 10: `introducers`, and `contacts.introducer_id` by rebuild (migration 014) — Part L* |
| 12.2 | Partner type | ADOPTED | CRM 5 — ACCOUNTANT_FIRM, TAX_ADVISER, AGENT, SOLICITOR, OTHER. *Built, nullable — not recorded is not "other" (N4) — and the lead's source is derived from it (E52)* |
| 12.3 | Contact details | ADOPTED WITH A RULE | CRM 5 — on the introducer's contacts, not on the firm row. *Built; one of them is named to receive progress notices (E49)* |
| 12.4 | Relationship owner | ADOPTED | CRM 5. *Built* |
| 12.5 | Date relationship started | ADOPTED | CRM 5. *Built, nullable* |
| 12.6 | Leads referred | ADOPTED WITH A RULE | CRM 5 — **derived by query, never stored**. *Built: `pipelineFigures` in `src/web/introducers.ts`; a test asserts no figure column on the firm* |
| 12.7 | Opportunities created | ADOPTED WITH A RULE | CRM 5 — derived by query. *Built: the referred leads that converted* |
| 12.8 | Won opportunities | ADOPTED WITH A RULE | CRM 5 — derived by query, **reasoned negatives counted apart**. *Built: a won claim is CLOSED; a reasoned negative is its own figure* |
| 12.9 | Estimated claim value | ADOPTED WITH A RULE | CRM 5 — **SALES and ADMIN only**; derived, never stored. *Built: the sealed estimates' qualifying expenditure over the referred claims that have not exited; a claim with no estimate counted apart and never as nought* |
| 12.10 | Agreed fee / reward structure | ADOPTED WITH A RULE | CRM 5 — **both models built and both off**: firm-level reciprocity with no cash, which the referral network paper recommends; or a fixed disclosed fee paid to the firm. **The switch refuses to turn on while clause 1 of the engagement letter is blank.** The question is "Is anything paid to the accountant?", which CRM 5 adds under Lakhbir if it is absent. *Built and off: `introducer_reward_setting`, reciprocity as tasks on the firm, `introducer_fees`; the question added. **Clause 1's blank is not a referral fee** — E51* |
| 12.11 | Revenue generated | ADOPTED WITH A RULE | CRM 5 — fees invoiced and paid from those claims, **ACCOUNTING and ADMIN only**. *Built — by organisation until CRM 7 moves invoices onto the claim (E57)* |
| 12.12 | Last contact | ADOPTED WITH A RULE | CRM 5. *Corrected by CRM 5 of 10: **derived, never typed** — the latest completed call, email, meeting or reciprocity task on the firm, as a client contact's is (E48)* |
| 12.13 | Next contact | ADOPTED WITH A RULE | CRM 5. *Corrected by CRM 5 of 10: **the earliest open task on the firm**, with an owner and a date, overdue by the UK date — not a date column (E48)* |
| 12.14 | Notes | ADOPTED WITH A RULE | CRM 5 — internal, as 5.13. *Built, ADMIN and SALES, escaped on output* |
| 12.15 | Performance analysed by introducer | ADOPTED | CRM 5 (the introducer dashboard), CRM 9 (claims by introducer). *The CRM 5 half built: `/staff/introducers` and a firm's page* |

## 13 · Financial tracking

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 13.1 | Estimated fee | ALREADY BUILT | `invoices.fee_pence` (002), derived from the engine — see 8.12 |
| 13.2 | Agreed fee | REJECTED | **The fee derives from the engine**, as 8.14 |
| 13.3 | Fee basis | ADOPTED WITH A RULE | CRM 7 — read from the decided basis, as 8.13 |
| 13.4 | Invoice number | ADOPTED WITH A RULE | CRM 7 — **a gapless series, never reused; a cancelled number is recorded as cancelled** |
| 13.5 | Invoice date | ADOPTED | CRM 7 |
| 13.6 | Due date | ADOPTED WITH A RULE | CRM 7 — **from the letter's payment terms, which are BLANK TODAY, so the due date is UNSET and shown as unset — never defaulted to thirty days** |
| 13.7 | Invoice amount | ADOPTED WITH A RULE | CRM 7 — **not writable**; VAT from the recorded VAT position, never assumed |
| 13.8 | Payment status | ALREADY BUILT | `invoices.payment_status` (002), `src/web/finance.ts`, `POST /staff/finance/{id}/status` |
| 13.9 | Payment date | ADOPTED WITH A RULE | CRM 7 — payments are rows: date, amount, method (bank transfer only), who recorded it, and whether the bank details were confirmed on a channel other than email. **Recorded, not collected** |
| 13.10 | Outstanding balance | ADOPTED WITH A RULE | CRM 7 — **derived**, as is OVERDUE |
| 13.11 | Credit note / adjustment | ADOPTED WITH A RULE | CRM 7 — its own rows against the invoice |
| 13.12 | Financial records linked to organisation and claim | ADOPTED WITH A RULE | Organisation ALREADY BUILT (`invoices.business_id`); **CRM 7 moves invoices onto the claim and keeps `business_id` beside it** |
| 13.13 | Accounting software integrated later rather than a full accounting system | ADOPTED WITH A RULE | **An export seam, not a build**; no platform is chosen and nothing waits on one. CRM 10 writes it into Developer Spec §5 |

## 14 · Automation requirements

**Every rule below is re-keyed onto the procedure's stages, and every rule is
subject to the list of what no rule may do** (1.3).

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 14.1 | Lead created → assign an owner and an initial follow-up task | ADOPTED | CRM 3 |
| 14.2 | Moves to Qualified → information-request checklist or task | ADOPTED WITH A RULE | CRM 3 — **re-keyed onto the engagement being signed, and the tasks are generated from the DERIVED missing list on the business page, never a hand list** |
| 14.3 | Required information complete → next operational task | ADOPTED | CRM 3 |
| 14.4 | Survey Booked → survey preparation tasks and the appointment details | ADOPTED WITH A RULE | CRM 3 — **re-keyed onto a survey job being assigned; no appointment is stored**, because there is no site visit to book (9.7). *Corrected by CRM 3 of 10 (E28): re-keyed onto the claim ENTERING SURVEY, not onto a job being assigned — nothing in this build assigns a survey job, so a trigger on it would never fire, while the procedure's own gate into the survey stage is data gathering confirmed complete. No appointment is stored* |
| 14.5 | Survey Completed → analysis and report tasks | ADOPTED WITH A RULE | CRM 3 — re-keyed onto the surveyor's commitment |
| 14.6 | Report enters Client Review → a follow-up date | ADOPTED | CRM 3 |
| 14.7 | Claim Completed → an invoice task or financial record | ADOPTED WITH A RULE | CRM 3 — **INVOICE reached → a finance task. Never an invoice email**, which waits on the invoice-fraud procedure (Developer Spec §5.1 item 6) |
| 14.8 | Flag overdue tasks and overdue document requests | ADOPTED | CRM 3 |
| 14.9 | Notify users when ownership or stage changes | ADOPTED WITH A RULE | CRM 3 — **the outbox only**, and never to a DO_NOT_CONTACT organisation |
| 14.10 | Administrators modify automation rules without code | ADOPTED WITH A RULE | CRM 3 builds the rule table; CRM 9 the settings screen. **What no rule may do is refused by the store, not missing from a form**. *Built by CRM 3 of 10 (E28, E29): `automation_rules`, ADMIN-edited, seeded with 14.1 to 14.9 re-keyed onto the procedure; `automation_runs` records every matching rule, RAN or NOT_RUN with its reason; the forbidden effects are named refusals in the store and outside the table's CHECK. A working ADMIN page is at `/staff/automation`; CRM 9 folds it into the settings screen* |

## 15 · Dashboard requirements

**Every tile is a query and every tile's authorisation has a test** (CRM 9). The
payload proof covers the dashboard response. **Built by CRM 9 of 10, 12 September 2026** — `src/web/dashboard.ts`,
`test/dashboard.test.ts` and the payload proof; the decisions are E119 to E123 and the evidence Part P.

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 15.1 | Total open pipeline value | ADOPTED WITH A RULE | CRM 9 — **ADMIN and SALES; never SURVEYING (N1)** |
| 15.2 | Estimated fees in pipeline | ADOPTED WITH A RULE | CRM 9 — **ADMIN and ACCOUNTING, the roles that read invoices**: the application reads the fee estimate from the finance dashboard under `invoice.read`, and where this row said Sales the application is right (E121); never SURVEYING |
| 15.3 | Won / completed claim value | ADOPTED WITH A RULE | CRM 9 — ADMIN and SALES; never SURVEYING |
| 15.4 | Fees invoiced and paid | ADOPTED WITH A RULE | CRM 7 (the finance dashboard) and CRM 9 — **ACCOUNTING and ADMIN** |
| 15.5 | Outstanding invoices | ADOPTED WITH A RULE | CRM 7 and CRM 9 — ACCOUNTING and ADMIN |
| 15.6 | Leads by source | ADOPTED | CRM 9 |
| 15.7 | Conversion rate by source | ADOPTED | CRM 9 |
| 15.8 | Pipeline by stage | ADOPTED WITH A RULE | CRM 9 — **counts by procedure stage; a value per stage only for roles that may read the estimate** |
| 15.9 | Claims by owner | ADOPTED | CRM 9 |
| 15.10 | Claims by introducer | ADOPTED | CRM 5 and CRM 9 |
| 15.11 | Average days from lead to completion | ADOPTED WITH A RULE | CRM 9 — **and per procedure stage, which is the bottleneck view** |
| 15.12 | Average claim value | ADOPTED WITH A RULE | CRM 9 — ADMIN and SALES; never SURVEYING |
| 15.13 | Overdue tasks | ADOPTED | CRM 3 and CRM 9 |
| 15.14 | Outstanding information / document requests | ADOPTED | CRM 4 and CRM 9 |
| 15.15 | Claims expected to complete this month / quarter | ADOPTED | CRM 9 |
| 15.16 | Lost opportunities and lost reasons | ADOPTED WITH A RULE | CRM 9 — **exits and reasons, with reasoned negatives counted apart** |

## 16 · Search, filtering and views

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 16.1 | Global search across organisations, contacts, properties and claim references | ADOPTED WITH A RULE | CRM 9 — **limited by `can()` inside the query, never filtered afterwards. Never indexed: the identity store, document text, note bodies for a role without `internal_note.read`, and the estimate** |
| 16.2 | Filter by owner, stage, source, introducer, property type, date, value and status | ADOPTED WITH A RULE | CRM 9 — **by value only where value is readable** |
| 16.3 | Saved views | ADOPTED WITH A RULE | CRM 9 — per user, and shared views set by ADMIN |
| 16.4 | Sort by next action, age, value, due date and priority | ADOPTED WITH A RULE | CRM 9 — **sorted by a key from a fixed table, never an ORDER BY built from a request value** (the rule `src/web/engaged-pages.ts` already follows) |
| 16.5 | Export authorised data to CSV / Excel | ADOPTED WITH A RULE | CRM 9 — CSV, audited with columns and row count, **only the columns the viewer may read; a cell beginning `=` `+` `-` or `@` is neutralised against formula injection**, with a test |
| 16.6 | Clickable relationships between organisation, contacts, properties and claims | ADOPTED | CRM 1 links organisation, property, claim and contact both ways; CRM 9 completes the lists |

**Built by CRM 9 of 10, 12 September 2026** — `src/web/search.ts`, `src/web/lists.ts`, `src/web/lists-pages.ts`, migration 018,
`test/search.test.ts`, `test/lists.test.ts` and the payload proof; the decisions are E124 to E129 and the evidence Part P.

## 17 · User roles and permissions

**KNOWN CONFLICT.** Seven roles against the five that are built.

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 17.1 | Administrator | ALREADY BUILT | ADMIN — `src/roles.ts`, `src/authz.ts` |
| 17.2 | Management: full operational visibility plus reporting | QUESTION | "Do we need a login for anyone beyond the five roles — a manager, a technical reviewer, or a read-only viewer?" |
| 17.3 | Business Development / Sales, with limited financial visibility as configured | ALREADY BUILT | SALES — reads the estimate, **refused the invoice** (`invoice.read` is ADMIN and ACCOUNTING). Not configurable: a role's boundary is not a setting (20.4) |
| 17.4 | Surveyor: assigned properties, surveys, documents **and relevant claim information** | REJECTED | **N1, the anchor quarantine.** SURVEYING reaches an assigned job's inputs and never an estimate-derived figure — not the claim value, the tax benefit, the fee or a pipeline value. CRM 1 extends the same rule to properties and claims, and the payload proof covers both |
| 17.5 | Technical / Tax Team | QUESTION | "Do we need a login for anyone beyond the five roles — a manager, a technical reviewer, or a read-only viewer?" |
| 17.6 | Finance: financial records, invoices and payment status | ALREADY BUILT | ACCOUNTING — **money only: no join to answers, register data, notes, surveyor workings or the estimate**, in the rule table and in the shape of the finance tables (`test/finance.test.ts`) |
| 17.7 | Read-only | QUESTION | "Do we need a login for anyone beyond the five roles — a manager, a technical reviewer, or a read-only viewer?" |
| 17.8 | Role-based, with record-level restrictions where necessary | ALREADY BUILT | `can(actor, action, object)` **authorises the specific object**, not a type — `src/authz.ts`, `test/authz.test.ts` |

## 18 · Audit trail, security and data protection

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 18.1 | Record who created and last modified important records | ADOPTED WITH A RULE | **The audit log is the record**; CRM 1 audits every organisation, contact, property and claim write, and CRM 3's timeline shows who. See 4.17 |
| 18.2 | Audit history for pipeline stages, ownership, financial values and claim status | ADOPTED WITH A RULE | Finance (`INVOICE_UPDATED`) and bookings (`BOOKING_MOVED`) ALREADY BUILT; **ownership on organisation and claim, CRM 1; stage moves with who, from, to and reason, CRM 2** |
| 18.3 | Secure authentication and encrypted connections | ALREADY BUILT | argon2id, server-side sessions, rotation on password change, rate limiting — `src/auth.ts`, `src/password.ts`. **TLS is Developer Spec §5.1 item 1** |
| 18.4 | Least-privilege access | ALREADY BUILT | **Deny by default is structural**: an action with no rule, or a role not on it, returns false — `src/authz.ts`, with a test that registers nothing and asserts the refusal |
| 18.5 | Mechanisms for data export and deletion under data protection law | ADOPTED WITH A RULE | CRM 8 — the rights-request register and **a due-for-deletion list, not a deleter**, while "Can the client-document folders be excluded from the nightly whole-site backup?" is open: a file alive in a backup has not been deleted. CRM 9's export never includes the identity store |
| 18.6 | Log significant user actions | ALREADY BUILT | `src/audit.ts` — sign-ins, refusals, document access, research, commitments, invoices, bookings |
| 18.7 | Backups and disaster recovery defined in the architecture | ADOPTED WITH A RULE | **Developer Spec §5.1 item 7, the hosting** — and the backup-exclusion question above decides the design. CRM 10 |
| 18.8 | Developer recommends hosting, encryption, retention and monitoring | ADOPTED WITH A RULE | **UK data residency is a requirement, not a recommendation** (Developer Spec §5.1 item 7); **retention periods come from the Retention Determinations, not from a developer** (CRM 8). CRM 10 |

## 19 · Communications

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 19.1 | Designed for integration with business email | ADOPTED WITH A RULE | **Behind `EmailTransport`** (stub 1, `src/stubs/email.ts`); deliverability before any template leaves the outbox (CRM 10). Where the mailboxes live is "Are the business mailboxes going on IONOS, where the mail already points, or on Microsoft 365, which the runbook assumes?" |
| 19.2 | Emails attachable to organisation, contact, property or claim | ADOPTED WITH A RULE | CRM 3 — **outbound, through the outbox, shown on the timeline.** CRM 1 records the organisation on each outbox row for the DO_NOT_CONTACT control. Inbound inbox synchronisation is not in the ten phases (25.2) |
| 19.3 | Reusable email templates | ADOPTED | CRM 3 |
| 19.4 | Merge fields: contact name, property address, claim reference, next action | ADOPTED WITH A RULE | CRM 3 — **merged values are escaped; a missing value renders as a visible gap, never an empty string; a template carrying bank details or an invoice is refused by the store**. *Built by CRM 3 of 10 (E30) with six fields — these four, the organisation and the next action's due date — and no others: an unknown field is refused. The gap reads "[property address not recorded]"* |
| 19.5 | Track sent communications where technically and legally appropriate | ALREADY BUILT | `outbox` (001) — **every row `sent_at` NULL, labelled not sent**, shown on the settings page. CRM 3 puts it on the timeline |
| 19.6 | Future calendar integration and appointment synchronisation | ADOPTED WITH A RULE | **Booking inside the application is ALREADY BUILT** (`src/web/schedule.ts`, the calendar, the client's own move); external synchronisation is developer work in Developer Spec §5 (CRM 10) |

## 20 · Administration / configuration

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 20.1 | Add / edit pipeline stages | REJECTED | **The stages are the operating procedure's, each with a server-side gate.** A setting that could add or reorder a stage could step round a gate; CRM 9 refuses it at the store |
| 20.2 | Add / edit dropdown values and document types | ADOPTED | CRM 9 (document types CRM 4) — sources, lost reasons, priorities, task types, document types, property types, introducer types |
| 20.3 | Configure task types and priorities | ADOPTED | CRM 9 |
| 20.4 | Manage users, roles and permissions | ADOPTED WITH A RULE | **Users and role assignment ALREADY BUILT** (`/staff/users`, ADMIN alone). **Permissions are not editable: a setting may never change the boundary of any of the five roles** — refused by the store in CRM 9 |
| 20.5 | Configure automation rules | ADOPTED WITH A RULE | CRM 3 and CRM 9, under 1.3 |
| 20.6 | Avoid hard-coding business rules where a configurable option is practical | ADOPTED WITH A RULE | **Configurable where it is a preference; fixed where it is a rule.** A gate, a CTA switch, a fee switch, a register gate and a role boundary are rules, and no setting reaches them (CRM 9) |

**Built by CRM 9 of 10, 12 September 2026** — `src/web/configuration.ts`, `src/web/vocabularies.ts`, `src/web/configuration-pages.ts`,
migration 019, `test/configuration.test.ts` and the payload proof; the decisions are E130 to E135 and the evidence Part P.

## 21 · Non-functional requirements

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 21.1 | Responsive web application for desktop and tablet | ALREADY BUILT | Server-rendered pages, one stylesheet, **no JavaScript required** — `src/web/html.ts`. CRM 1's pages use the same shell |
| 21.2 | Fast global search and record pages under typical load | ADOPTED | CRM 9 |
| 21.3 | Scalable architecture | ADOPTED WITH A RULE | **SQLite is the prototype's store; the host, and whether it runs Node, decide the production store** — "Does WordPress replace the rest of the system, or sit beside it?" (Developer Spec §5.3). CRM 10 |
| 21.4 | API-first or API-capable | ALREADY BUILT | The JSON API (`/api/*`, `GET /api/whoami` computed from `can()`); **CRM 1 adds `view.json` for the claim and the property, served from the same object the page renders** |
| 21.5 | Reliable automated backups | ADOPTED WITH A RULE | As 18.7. CRM 10 |
| 21.6 | Clear error handling and user-friendly validation | ALREADY BUILT | A sentence for the person on a validation failure; **403 with no detail on a refusal, and a missing row answers the same** — `src/server.ts`, `problem()` in `src/web/staff.ts` |
| 21.7 | Important actions recoverable; avoid destructive deletion | ADOPTED WITH A RULE | **A claim cannot be deleted** (CRM 1, at the database); tasks are cancelled and exits keep the record (CRM 2, CRM 3). Retention deletion is the one exception and is not automated (CRM 8) |
| 21.8 | Staging and production environments | ADOPTED WITH A RULE | Developer work — nothing is deployed anywhere. CRM 10 writes it into §5 |

## 22 · Suggested key screens

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 22.1 | Login / authentication | ALREADY BUILT | `C5`, `GET|POST /login` |
| 22.2 | Main dashboard | ADOPTED WITH A RULE | The back-office landing page `B0` ALREADY BUILT; **the management dashboard, CRM 9; "my work", CRM 3 and CRM 9** |
| 22.3 | Lead list | ADOPTED | CRM 2 — `GET /staff/leads`, with a form to record a lead by hand |
| 22.4 | Lead detail | ADOPTED | CRM 2 — `GET /staff/leads/{id}` and its `view.json`: the enquiry gate, the assessment's answers, conversion |
| 22.5 | Organisation list | ADOPTED | CRM 1 — `GET /staff/organisations` |
| 22.6 | Organisation detail | ADOPTED | CRM 1 — `GET /staff/organisations/{id}` |
| 22.7 | Contact detail | ADOPTED WITH A RULE | CRM 1 — **a panel on the organisation page, edited in place**, because a contact never exists without its organisation |
| 22.8 | Property list | ADOPTED | CRM 1 — `GET /staff/properties` |
| 22.9 | Property detail | ADOPTED | CRM 1 — `GET /staff/properties/{id}` |
| 22.10 | Opportunity / claim detail | ADOPTED WITH A RULE | CRM 1 builds the header and the overview panel (`GET /staff/claims/{id}`); **every other panel is its own phase** — see section 23 |
| 22.11 | Pipeline / Kanban | ADOPTED WITH A RULE | CRM 2 — **dragging is a courtesy and the write asks the gate again; no value on a card for anyone who cannot read the estimate**. *As built by CRM 2 of 10: dragging is a BUTTON on each card (E20) — the content security policy forbids script — posting the same move the claim page makes* |
| 22.12 | Tasks / activity centre | ADOPTED | CRM 3 |
| 22.13 | Document centre | ADOPTED | CRM 4 *Found not built by CRM 10 of 10, and built by the CRM follow-on: `/staff/documents`, one list over every logical document, each row asked of `document.read`, with fixed filters and sorts, no search of a document's text and no export (Part R, E149).* |
| 22.14 | Introducer dashboard | ADOPTED | CRM 5 |
| 22.15 | Financial dashboard | ADOPTED WITH A RULE | The accounting view `B9`/`B10` ALREADY BUILT; the finance dashboard CRM 7 |
| 22.16 | Reports | ADOPTED | CRM 9 **Corrected by the CRM follow-on: the reports screen IS the dashboard over a period** — this month, this quarter, a UK financial year or any from-to range of UK dates, from a fixed table — and there is no separate reports screen. *CRM 10 of 10 found no reports screen and fixed periods; the follow-on built the period (Part R, E150).* |
| 22.17 | Administration / settings | ADOPTED WITH A RULE | Users, roles and each person's own settings ALREADY BUILT (`B11`/`B12`); admin settings CRM 9, under 20.1, 20.4 and 20.6 |

## 23 · Claim detail page — recommended layout

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 23.1 | Header: reference, client, property, stage, owner, value and next action | ADOPTED WITH A RULE | CRM 1 — **value for ADMIN and SALES only; ACCOUNTING sees client, reference and money; SURVEYING reaches the page only through an assigned job and receives no value** |
| 23.2 | Overview: acquisition, property and commercial information | ADOPTED WITH A RULE | CRM 1 — the acquisition facts are read from the property; the commercial information is read under the same role rules as 23.1 |
| 23.3 | Pipeline: visual progress through stages | ADOPTED | CRM 2 |
| 23.4 | Tasks: current and overdue | ADOPTED | CRM 3 |
| 23.5 | Documents: requested, received, outstanding | ADOPTED | CRM 4 |
| 23.6 | Activity timeline | ADOPTED WITH A RULE | CRM 3 — a read, not a second log (10.7) |
| 23.7 | Team: internal owners and external advisers | ADOPTED WITH A RULE | Internal owners CRM 1 (owner, surveyor); **external advisers are contacts, never users** — the team panel is CRM 5 *Found not built by CRM 10 of 10, and built by the CRM follow-on: the team panel — the owner and the surveyor, the organisation's accountant and adviser linked to the claim, and the tax adviser as their sign-off record, never a person's name (Part R, E148).* |
| 23.8 | Financials: estimated / agreed fee, invoice and payment status | ADOPTED WITH A RULE | CRM 7 — **no agreed-fee field** (8.14) *Half built when CRM 10 of 10 found it; finished by the CRM follow-on: before any fee invoice exists, the fee the finance view expects is read onto the claim for `invoice.read` alone — never typed, UNKNOWN where the signed figure is not known (Part R, E151).* |
| 23.9 | Audit: key historical changes | ADOPTED WITH A RULE | CRM 3's timeline shows who changed what; **the raw audit log stays ADMIN-only** (`audit.read`) |

## 24 · MVP priorities

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 24.1 | Authentication and user roles | ALREADY BUILT | `src/auth.ts`, `src/authz.ts`, six roles (READ_ONLY added by Phase 132e) |
| 24.2 | Organisations and contacts | ADOPTED | CRM 1 |
| 24.3 | Properties | ADOPTED | CRM 1 |
| 24.4 | Leads | ADOPTED | CRM 2 |
| 24.5 | Opportunities / claims | ADOPTED | CRM 1 |
| 24.6 | Pipeline stages | ADOPTED WITH A RULE | CRM 2 — the procedure's ten |
| 24.7 | Tasks and activity timeline | ADOPTED | CRM 3 |
| 24.8 | Document management | ADOPTED WITH A RULE | The upload pipeline ALREADY BUILT; CRM 4 extends it (N3) |
| 24.9 | Introducers | ADOPTED | CRM 5 |
| 24.10 | Basic financial tracking | ADOPTED WITH A RULE | The accounting view ALREADY BUILT; CRM 7 extends it |
| 24.11 | Core dashboards | ADOPTED | CRM 9 |
| 24.12 | Search and filtering | ADOPTED | CRM 9 |
| 24.13 | Audit trail | ALREADY BUILT | `src/audit.ts` |
| 24.14 | Basic email / template capability | ADOPTED WITH A RULE | CRM 3 — outbox only |

## 25 · Phase 2 / future functionality

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 25.1 | Accounting software integration | ADOPTED WITH A RULE | An export seam — 13.13. CRM 10 |
| 25.2 | Email inbox synchronisation | ADOPTED WITH A RULE | **Not built in the ten phases**; outbound through the outbox only. Written into Developer Spec §5 as developer work by CRM 10, behind the mailbox question in 19.1 |
| 25.3 | Calendar integration | ADOPTED WITH A RULE | As 19.6. CRM 10 |
| 25.4 | Automated document generation | REJECTED | **Developer Spec DS-W10: no part of this build generates a report document.** Deliverables are tracked, not generated (CRM 6) |
| 25.5 | Electronic signatures | ALREADY BUILT | **As a seam**: `SignatureProvider` (stub 2, `src/stubs/signature.ts`) and the real `engagements` state machine; the provider is work item DS-W4 |
| 25.6 | Client portal | ALREADY BUILT | **KNOWN CONFLICT — listed as future and already running**: `/portal`, `src/web/portal.ts` — the range, the stage in the client's words, the letter, the call and its move control, questions, documents, settings |
| 25.7 | Accountant portal | REJECTED | **The client's accountant has no login, by decision** (Developer Spec §1). They receive the computation pack offline, and progress is shared only under the client's opt-in (CRM 5) |
| 25.8 | Surveyor mobile interface | ADOPTED WITH A RULE | **The surveyor's workspace is ALREADY BUILT, server-rendered and usable on a tablet; there is no separate mobile application while the survey is desktop-first.** Whether site capture exists at all turns on "Can you value a building you have not stood in?" |
| 25.9 | Advanced reporting and forecasting | ADOPTED WITH A RULE | CRM 9's tiles are queries over recorded facts; **a forecast built on the estimate is subject to N4 and to N1** |
| 25.10 | Automated lead scoring | REJECTED | **N4** — as 7.8 |
| 25.11 | Marketing automation | ADOPTED WITH A RULE | **Not built in the ten phases.** If ever built: only to a contact whose `marketing_optin` is set for that channel, never to a DO_NOT_CONTACT organisation, never from the identity store (CRM 8), and through the outbox |
| 25.12 | API integrations | ADOPTED WITH A RULE | **Behind the register seam, with both gates shut** (13(b), 13(c)); work item DS-W1 |
| 25.13 | AI-assisted data extraction from documents | ALREADY BUILT | **KNOWN CONFLICT — listed as future and already running**: `src/web/extract-text.ts` behind the upload handler, and the receipt strip runs over what it reads. OCR is work item DS-W2 |

## 26 · Developer deliverables

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 26.1 | Technical architecture proposal | ALREADY BUILT | `09-app/CAPREBATE-DEVELOPER-SPEC.md`, deliverable 3. CRM 10 folds the CRM into it |
| 26.2 | Database / entity relationship design | ALREADY BUILT | `09-app/backend/migrations/`, one numbered file per change. CRM 10 draws it for the CRM tables |
| 26.3 | Wireframes or UI design for core screens | ALREADY BUILT | Developer Spec §2 — every screen is a route you can open. Each CRM phase adds its own |
| 26.4 | Authentication and permissions model | ALREADY BUILT | `src/auth.ts`, `src/authz.ts`, Developer Spec §3 and §6 |
| 26.5 | Working MVP against section 24 | ADOPTED | The ten CRM phases; CRM 10 closes it against this table |
| 26.6 | Automated tests for critical workflows | ALREADY BUILT | `npm run check` in `09-app/backend`; **every CRM phase adds a refusal test for every role not granted a new action** |
| 26.7 | Staging environment for user acceptance testing | ADOPTED WITH A RULE | Developer work — CRM 10, §5 |
| 26.8 | Production deployment process | ADOPTED WITH A RULE | Developer work — CRM 10, §5 |
| 26.9 | API documentation | ALREADY BUILT | Developer Spec §3 — every route and JSON endpoint |
| 26.10 | Database / document backup and recovery plan | ADOPTED WITH A RULE | CRM 10, §5, behind the backup-exclusion question (18.5) |
| 26.11 | Administrator documentation | ADOPTED | CRM 10 |
| 26.12 | User documentation / basic training materials | ADOPTED | CRM 10 — **added to that phase's prompt by CRM 1 of 10, because no phase carried it** |
| 26.13 | Handover of source code, infrastructure configuration and deployment documentation | ADOPTED WITH A RULE | **The tree is the handover.** There is no infrastructure configuration because nothing is deployed; CRM 10 says so in §5 rather than inventing one |

## 27 · Acceptance criteria for the MVP

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 27.1 | Create an organisation, contact, property and linked claim without duplicating information | ADOPTED | CRM 1, with an end-to-end test |
| 27.2 | A claim can be moved through every default pipeline stage | ADOPTED WITH A RULE | CRM 2 — **through every procedure stage, and every gate has a test that tries to skip it** |
| 27.3 | Each claim shows owner, next action, stage, value, documents and activity history | ADOPTED WITH A RULE | Owner, next action, stage and value **for the roles that may read it**: CRM 1. Documents CRM 4; history CRM 3 |
| 27.4 | Tasks assigned, completed and generated from workflow events | ADOPTED | CRM 3 |
| 27.5 | Documents uploaded and linked to the correct record | ADOPTED | CRM 4 |
| 27.6 | Management sees pipeline and fee information without compiling spreadsheets | ADOPTED | CRM 9 |
| 27.7 | Users only see functions and data permitted by their role | ALREADY BUILT | `can()` on every read and write; **each CRM phase asserts the refusal for every role not granted a new action** |
| 27.8 | Important changes recorded in an audit trail | ALREADY BUILT | `src/audit.ts`; each CRM phase audits its writes |
| 27.9 | Data exported by authorised users | ADOPTED | CRM 9 |
| 27.10 | Usable as clients, properties and claims grow | ADOPTED WITH A RULE | Lists are capped and authorised row by row today; the production store is the host question (21.3). CRM 9, CRM 10 |

## 28 · Important product principles

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 28.1 | Property-first thinking: a client may own many properties | ADOPTED | CRM 1 |
| 28.2 | Claim-first workflow | ADOPTED | CRM 1 builds the record; CRM 2 and CRM 3 drive work from it |
| 28.3 | No duplicate data entry where relationships can be used | ADOPTED WITH A RULE | **DERIVE, DO NOT RE-KEY.** CRM 1 derives the legal name, the company number, the claimant type, the source, the jurisdiction and the prior-claim position rather than asking again *Five of the six when CRM 10 of 10 found it; the sixth built by the CRM follow-on: the prior-claim position is derived where the funnel's own answer states it, and a recorded one is then refused, as the jurisdiction is (Part R, E152).* |
| 28.4 | Every active claim has one owner and one next action | ADOPTED | CRM 3 |
| 28.5 | Outstanding information visible, not buried in notes | ALREADY BUILT | **The derived "what is still missing" panel** on the business page (`missingFacts` in `src/web/engaged.ts`); CRM 3 and CRM 4 put the rest on the claim |
| 28.6 | The CRM makes bottlenecks obvious | ADOPTED | CRM 9 — days per procedure stage |
| 28.7 | Build for integration from day one | ALREADY BUILT | The four stubs, each one module behind an interface (`STUBS` in `src/app.ts`, served at `/api/health`) |
| 28.8 | Prefer configurable workflows over hard-coded assumptions | ADOPTED WITH A RULE | As 20.6 |

## 29 · Open questions for discovery before development

| # | Specification line | Mark | Where, or the rule |
|---|---|---|---|
| 29.1 | What capital allowances services / workstreams will the business offer? | ADOPTED WITH A RULE | **The rulebooks answer it**: plant and machinery, structures and buildings, land remediation — 8.7. CRM 1 |
| 29.2 | Pricing / fee model for each service | ADOPTED WITH A RULE | **Five per cent of the allowances identified, decided 3 September 2026.** Its open refinements are "The rate card's fee bands were written against tax saved. Where should the breakpoints sit now?" and "Is the small end of the market worth serving at all?" CRM 7 |
| 29.3 | What information is mandatory before a claim moves to each stage? | ADOPTED WITH A RULE | **The procedure's gates** — and no required field forces a guess (N4). CRM 2 |
| 29.4 | Who is responsible for each stage? | ADOPTED WITH A RULE | The procedure names the owner of each stage; CRM 2 records it and CRM 3 makes it the next action's owner. *Recorded by CRM 2 of 10: each stage's `owner` in `src/web/stages.ts` is the SOP's own "Owner:" line, tested against the procedure's file, and shown on the board and the claim page* |
| 29.5 | Which documents are mandatory at each stage? | ADOPTED WITH A RULE | **The Stage 2 document upload list.** CRM 4 *Found not built by CRM 10 of 10; built and SWITCHED OFF by the CRM follow-on:* a need on the gate out of DATA_GATHERING — a received document of each type required, its conditions read from the claim's facts — shipped off, off exactly today's gate. Which documents are mandatory, and at which stage, is Lakhbir's: **"Which of the Stage 2 documents are mandatory, and at which stage?"** (Part R, E153) |
| 29.6 | Email provider and calendar system | QUESTION | "Are the business mailboxes going on IONOS, where the mail already points, or on Microsoft 365, which the runbook assumes?" |
| 29.7 | Accounting / invoicing platform | ADOPTED WITH A RULE | **An export seam; nothing waits on the choice** — 13.13. CRM 10 |
| 29.8 | Will clients / accountants need portal access? | REJECTED | **For the accountant: no login, by decision.** For the client the answer is already yes and running — see 25.6 |
| 29.9 | What data must be imported from existing spreadsheets or systems? | ADOPTED WITH A RULE | **There is no real client data anywhere, so the answer is nothing to import.** CRM 10 puts that to Lakhbir as a one-line confirmation |
| 29.10 | Retention periods and compliance requirements | ADOPTED WITH A RULE | **The Retention Determinations and the Retention and Rights-Request Operating Procedure** — UNSET shown as unset. CRM 8 |
| 29.11 | Weekly, monthly and quarterly management reporting | ADOPTED WITH A RULE | CRM 9 builds every tile as a query over any period; the cadence is a preference and needs no build *Corrected by CRM 10 of 10 — the tiles read this month and this quarter, fixed — and MADE TRUE by the CRM follow-on: every tile that counts what happened in time reads any period chosen, and a tile that counts what stands today says it is as at today (Part R, E150).* |
| 29.12 | Mobile functionality for surveyors | ADOPTED WITH A RULE | As 25.8 |

---

# PART B — WHAT BOTH DOCUMENTS OMIT

Neither document knows about any of this, and a claim cannot be run or defended
without it. **Each row names the CRM phase that builds or carries it.**

## B1 · The rules the application enforces

| # | What | Phase |
|---|---|---|
| B1.1 | **N1 — the anchor quarantine on every route a surveyor can reach.** `tools/payload-proof.ts` runs against the seed and ends in a negative control: none of the seven sealed estimate fields as SURVEYING, all seven as ADMIN | CRM 1 (claim and property routes), CRM 6 (the facts panel and the four figures), CRM 9 (dashboards and search) |
| B1.2 | **N2 — the name exclusion register and one identity store.** No third party's name in the claim record; nothing looked up about a person; the client's own contacts are not third parties | CRM 1 (previous owner and occupier guard), CRM 4 (a person named inside a document is a `person_ref`), CRM 8 (the store itself) |
| B1.3 | **N3 — the receipt contract.** Twelve steps, quarantine, the strip, `assertContractCovered()` | CRM 4 |
| B1.4 | **N4 — unknown never routes to the favourable branch**, and a suite that tests only the "unsure" string leaves never-asked uncovered, so both are asserted | CRM 1 (prior claim, claimant type, tenure), CRM 2 (every gate), CRM 6 (every derived fact) |
| B1.5 | **The two register gates stay shut** — free calls on a published privacy notice, paid calls on a signed engagement and an operator's click. No connector exists | Every phase; CRM 3 refuses any automation that would open one |
| B1.6 | **Deny by default, authorised on the specific object**, and a new action has a refusal test for every role not granted it | Every phase |
| B1.7 | **ACCOUNTING reaches money only** — in the rule table and in the shape of the tables | CRM 1 (the claim view), CRM 7 |
| B1.8 | **Every write audited**, append-only and hash-chained, with no personal data in a log line | Every phase |
| B1.9 | **13(a) — commercial means the client, not the building**, so supported living is in | CRM 2 (the enquiry gate) |
| B1.10 | **Stage gates on the server**, each with a skip test; forward or to an exit only; ADMIN reopens with a reason | CRM 2 |
| B1.11 | **DO_NOT_CONTACT as a control** — the outbox refuses, in code and at the database | CRM 1 builds it; CRM 3's automation inherits it |
| B1.12 | **Email means the outbox**, and the invoice email is not built before the invoice-fraud procedure is in the SOP | CRM 3, CRM 7 |
| B1.13 | **Stored in UTC, shown in UK time**, one file naming a zone | CRM 3 |
| B1.14 | **STRICT tables, foreign keys on, no string-built SQL** (`npm run lint:sql`) | Every phase |
| B1.15 | **Escape every staff-supplied field**, with a stored cross-site scripting test per page that renders one | Every phase that renders one; CRM 1 for its pages |

## B2 · The capital allowances facts

| # | What | Phase |
|---|---|---|
| B2.1 | **Claimant type for tax** — a company, an LLP, a partnership, a sole trader, an individual or a charity file differently and get different reliefs | CRM 1 stores it; CRM 6 reads it. *Built by CRM 6 of 10: read on the facts panel with its source, and the amendment window turns on it — E59, E61, Part M* |
| B2.2 | **Jurisdiction of the property** — Scottish and Welsh land taxes, and whether we serve the nation at all | CRM 1. *Read on the facts panel by CRM 6 of 10 — Part M* |
| B2.3 | **Scottish taxpayer status of an individual claimant**, which turns on where they live, not where the property is, and is a different fact from B2.2 | CRM 6. *Built: a captured fact, yes, no or not known — Part M* |
| B2.4 | **Accounting period, and the amendment window** derived from it and the acquisition date — UNKNOWN whenever either is | CRM 6. *Built: CB_CASH's rule, UNKNOWN whenever an input is, a need on REPORTS and INVOICE — E61, E62, Part M* |
| B2.5 | **The s.198 or s.199 election** — exists, which section, date notified, nominal value, elements covered, the prior owner chain | CRM 6. *Built, with the tribunal route of s.201(1A); resolved decides DATA_GATHERING — E63, E73, Part M* |
| B2.6 | **Grants and contributions**, traced to cost elements | CRM 6. *Built: a payer class, traced only with its elements; decides VALUATION — E72, Part M* |
| B2.7 | **Allowance headroom and taxable profit**, including the break-even reading already built, read through its switch | CRM 6. *Built: profit derived from the client's answer through the break-even switch, headroom captured — Part M* |
| B2.8 | **Main and special pool split** | CRM 6. *Built: captured, with its source — Part M* |
| B2.9 | **Structures and buildings allowance** as its own workstream and figure | CRM 1 (the workstream), CRM 6 (the figure). *Built: the qualifying expenditure captured beside the workstream — Part M* |
| B2.10 | **Acquisition costs and stamp duty**, with that CTA switch shown OFF | CRM 6. *Built: both captured, `transaction_tax_in_base` shown OFF — Part M* |
| B2.11 | **The buyer's own alterations** | CRM 6. *Built: captured, `s185_plus_own_s25` shown OFF — Part M* |
| B2.12 | **The four figures in the order they are produced** — the indicative estimate, the researched estimate (not permitted yet), the surveyor's committed figure, the figure the tax adviser signed — each sealed and hashed, then the reconciliation log | CRM 6. *Built: each read from the record that sealed it, and the reconciliation in the design's schema — E64, E65, E67, Part M* |
| B2.13 | **The tax adviser's sign-off as a record, not a signature** | CRM 6. *Built: `tax_adviser_signoffs`, the only thing that opens its gate; the retired column refused — E66, Part M* |
| B2.14 | **The surveyor's commitment** — `surveyor_commitments` (migration 006) exists | ALREADY BUILT; CRM 6 links it to the claim. *Linked: a sign-off is recorded against a commitment on a job on the claim, by trigger — Part M* |
| B2.15 | **The deliverables register** — client report, accountant computation pack, reasoned negative, defence pack, s.203 notification | CRM 6. *Built: tracked, never generated; the client release in can() — E69, E70, Part M* |
| B2.16 | **HMRC enquiry aftercare**, and the Disposal Note on a future sale | CRM 6. *Built — E74, E76, Part M* |
| B2.17 | **The prior-claim position of the property** | CRM 1 stores it; CRM 6 reads it. *Read on the claim's overview as CRM 1 built it; the prior owner chain beside the election — Part M* |

## B3 · The compliance registers

| # | What | Phase |
|---|---|---|
| B3.1 | **Customer due diligence** — built and switched off while "Is AML supervision legally required for this business?" is open; PSC data pulled for the allowance common-control test never silently stands for beneficial ownership | CRM 8 |
| B3.2 | **The rights-request register** with the Article 12A clock, per limb | CRM 8 |
| B3.3 | **The complaints log**, countable as s.164B needs, with the 30-day acknowledgement clock | CRM 8 |
| B3.4 | **The personal data breach register** and its four-facts decision record | CRM 8 |
| B3.5 | **The identity store (S2)** — never exported, never searched, never used for marketing, every read audited | CRM 8 |
| B3.6 | **One consent history per contact**, with wording versions and withdrawal | CRM 8 |
| B3.7 | **Retention clocks on every record type, and a due-for-deletion list** — not a deleter | CRM 8 |
| B3.8 | **The Article 14 transparency record** for a name retained under a documented exception — exists in `04-phase-work/phase3/caprebate-name-exclusion.ts` | ALREADY BUILT; CRM 8 references it |
| B3.9 | **A document access record on every serve** (DB-W1-T6) | ALREADY BUILT (`src/web/router.ts`); CRM 4 extends it to every new document read |
| B3.10 | **A compliance permission narrower than everything else**, granted to ADMIN today; whether a separate role is needed goes to Lakhbir | CRM 8; **Phase 129 defined a data protection officer role scoped to these registers and switched it off** (E157) |

## B4 · The commercial model

| # | What | Phase |
|---|---|---|
| B4.1 | **The fee is three per cent of the allowances identified** (five per cent until Phase 132e, 16 September 2026), derived from the engine | ALREADY BUILT (the engine and `src/web/finance.ts`); CRM 7 moves it onto the claim |
| B4.2 | **Our fee against the client's first-year benefit**, at both ends of the marginal band | ALREADY BUILT (`src/web/finance.ts`); CRM 7 adds the CAP / WARN / ADJUST switch, off |
| B4.3 | **A minimum fee or minimum job size** — built and off | CRM 7. *Phase 132e: the minimum fee is decided none and the switched-off control is retired, recorded in `MINIMUM_FEE_DECISION`; a multi-site discount is discretionary, recorded and never applied* |
| B4.4 | **The break fee and the abort fee**, read from the letter and blank on every screen while it is blank | CRM 7 |
| B4.5 | **Whether money is returned when a claim is reduced** (clause 13) — a switch, off | CRM 6. *Built by CRM 6 of 10 and off, reading the letter's three clause 13 blanks; the letter now carries the clause — E75, Part M* |
| B4.6 | **The accountant referral channel**, and progress shared only under the client's opt-in, tested both when false and when never asked | CRM 5. *Built by CRM 5 of 10: referral intake, `introducer_share_consents`, `introducer_notices` and the refusing trigger (migration 014); both ways tested, and at the database — Part L* |
| B4.7 | **The introducer reward model**, both built and both off, refusing while clause 1 is blank | CRM 5. *Built and off; the refusal tested against the letter itself; what clause 1's blank actually is, E51 — Part L. Phase 132e added model C, 10% of our fee as invoiced and reversed under clause 13, built and off the same way* |
| B4.8 | **VAT threshold monitoring** — rolling twelve months and the single-month test, against a dated threshold setting | CRM 7 |
| B4.9 | **No card processor and no PCI scope**, by decision | ALREADY BUILT as an absence; CRM 7 keeps it |
| B4.10 | **The engagement gate before any paid research** — `assertSignedEngagement` in `src/web/research.ts` | ALREADY BUILT; CRM 2 reuses it and never writes a second |
| B4.11 | **Every processor named in clause 7 of the letter and section 4 of the privacy notice** before it carries client data — so a CRM host, email provider or accounting integration is added to both first | CRM 10, and any phase that introduces a processor |

---

# PART C — THE KNOWN CONFLICTS, RECORDED RATHER THAN REDISCOVERED

These were found when the two documents were first read against the build, and
are listed under THE CRM LAYER in the action plan. **In every one the application
is right.**

| # | The documents say | The application | Rows |
|---|---|---|---|
| C1 | Seven roles | **Five roles**; a sixth is a question for Lakhbir | 17.1–17.7 |
| C2 | A client portal as future work | **Already built and running** | 25.6 |
| C3 | An accountant portal | **The client's accountant has no login, by decision** | 25.7, 29.8 |
| C4 | A surveyor who sees claim information and value | **The anchor quarantine (N1)** | 17.4 |
| C5 | Finance edits the agreed fee | **The fee derives from the engine** | 8.14, 13.2 |
| C6 | Seventeen generic stages | **The ten-stage procedure, a gate at every stage, a reasoned exit** | section 9 |
| C7 | Survey booked | **A desktop-first survey model** | 9.7, 14.4 |
| C8 | Payment tracking | **No card processor; an invoice email that waits on a fraud procedure** | 13.9, 14.7 |
| C9 | Mandatory fields and lead scoring | **Unknown never routes to the favourable branch (N4)** | 7.8, 8.15, 25.10, 29.3 |
| C10 | AI document extraction as future work | **Extraction and the receipt strip already run behind the upload handler** | 25.13 |
| C11 | Documents as simple uploads | **The receipt contract and the three stores** | section 11 |

---

# PART D — WHAT THE STARTUP CUT DROPS THAT MATTERS

The startup cut is a sensible order of work, and its golden rule — *if a feature
does not help win a lead, manage a property, progress a claim, collect
information, produce the report, invoice the client, or show what needs doing, it
probably does not belong in version 1* — is a good test. **But these are dropped
from it and still belong in scope**, each for a reason the cut could not see:

| # | Dropped | Why it still matters | Phase |
|---|---|---|---|
| D1 | **Automation** (full §14) | The cut's own "tasks / next actions" cannot keep one next action per claim without it, and **what no automation may ever do** is a control, not a feature | CRM 3 |
| D2 | **Search and export** (full §16) | It keeps "search / filtering" in its structure line and drops the section. **Export is where a role boundary leaks** — formula injection, a column the viewer may not read | CRM 9 |
| D3 | **Admin settings** (full §20) | Without it every dropdown is a code change — and without its refusals, a settings screen would be the easiest way round a gate or a role boundary | CRM 9 |
| D4 | **Acceptance criteria** (full §27) | The cut has no definition of done. Section 27 is the only place either document says what would prove the build | CRM 10 closes against it |
| D5 | **A contact's organisation** (full §5) | The cut's contact has no organisation. **Here a contact cannot exist without one** — `contacts.business_id` is NOT NULL — and an orphan contact is how a client's accountant ends up looking like a user | ALREADY BUILT; CRM 1 keeps it |
| D6 | **Organisation type, registered and trading address, website** | Claimant type decides which return a claim goes in and which reliefs exist | CRM 1 |
| D7 | **Occupier and disposal date on the property** | The disposal date triggers the election on a future sale; the occupier matters to a leasehold fit-out | CRM 1 |
| D8 | **The claim page layout** (full §23) | It is the only place either document says what a claim page must show, and it is the brief for CRM 1's header and overview | CRM 1 onwards |
| D9 | **Non-functional requirements and the developer deliverables** (full §21, §26) | Backups, staging, recoverability and documentation are where a price is made or missed | CRM 10 |
| D10 | **Conversion date on a lead** | Conversion rate by source and days from lead to completion both need it | CRM 2 |
| D11 | **Communications beyond templates** (full §19) | Tracking what was sent is already built and must not be lost | ALREADY BUILT; CRM 3 |

**One thing the startup cut adds**: "My tasks" on the dashboard. It is in scope —
CRM 3 builds "my tasks" on the landing page for every staff role and CRM 9 builds
"my work".

---

# PART E — DECISIONS CRM 1 OF 10 TOOK, SO NO LATER PHASE UNDOES ONE BY ACCIDENT

| # | Decision | Why |
|---|---|---|
| E1 | **`businesses.name` is the trading name**, and `trading_name` is a generated column over it | One stored value. A copied column can drift; a renamed column would have broken every screen that reads `name` |
| E2 | **The new vocabularies are enforced by named triggers, not by CHECK constraints on added columns** — claimant type, client status, source, contact type, workstream and the claim's stage | SQLite cannot change a CHECK without rebuilding the table, and `businesses` has thirteen foreign keys into it (migration 007). **CRM 2 replaces two triggers to change the claim's stage vocabulary instead of rebuilding a table** |
| E3 | **One claim per business at submission, on the first property**, carrying the assessment | The indicative estimate is business-wide today. A claim per property would have put the same estimate on every property and doubled it on every future dashboard. A second property's claim is opened by staff. **CRM 2 may move claim creation to lead conversion**. *Changed by CRM 2 of 10 (E9): `submit()` now opens a LEAD, and this claim — on the first property, carrying the assessment, exactly as here — opens when the lead converts* |
| E4 | **A claim cannot be deleted and its reference cannot change**, and the reference series is its own table | "Unique, never reused" is only true if nothing can take a number back |
| E5 | **SURVEYING reaches a claim only through a survey job on that claim's own assessment, and a property only through a job on its organisation** | Surveyor jobs are keyed to an assessment, not yet to a claim. **Naming a surveyor on a claim is a record, not an access grant** — a claim with no assessment is reachable by no surveyor, and says so. *Changed by CRM 2 of 10 (E14): a survey job now carries its claim, and a surveyor reaches a claim only through a job ON that claim; the property rule is unchanged* |
| E6 | **`claims.property_id` is nullable, and the property must belong to the claim's organisation** — a composite foreign key | A claim can exist before its property is recorded; it can never point at somebody else's |
| E7 | **DO_NOT_CONTACT is refused twice**: the transport returns a refusal and writes nothing, and a database trigger aborts any outbox row addressed to that organisation or to any address it holds | A control in one place is a control the next caller forgets |
| E8 | **A recorded jurisdiction is refused where the postcode already derives one** | "Never asked twice" is a store rule, not a form that happens to hide a field |

## Part E, continued — decisions CRM 2 of 10 took

| # | Decision | Why |
|---|---|---|
| E9 | **Converting a lead opens the claim; the funnel's `submit()` opens a lead** (row E3 in this table) | CRM 1 opened the claim at submission, which put every prospect into the procedure's second stage with the enquiry gate never asked — a gate skipped on every claim, by construction. The claim_ref series is unchanged; the reference is simply taken at conversion |
| E10 | **Every existing claim converted once, to the procedure stage its old key names, then placed no later than the records a gate reads can evidence**: past ENGAGEMENT only with a signed letter, past SURVEY only with a commitment on a job on the claim, past TAX_ADVISER_SIGNOFF never | A converted claim past a gate its records could never have opened is a state the application refuses to produce. The gates a person opens by recording a confirmation had no record before migration 010, so a converted claim beyond one shows it never recorded — and nothing moves forward through a gate that is shut. On the seed: Elverton and Fenmoor at SURVEY, Brackenfell at ENGAGEMENT |
| E11 | **`businesses.stage` stays the engaged-client list's sort key and the portal's source. A claim move RAISES it to the client label the organisation's most advanced open claim evidences; nothing lowers it** — not an exit, a hold, a reopen or a migration | Derived outright, it would have moved clients' portals backwards on a migration and needed a rule for which of two claims a client sees. Left alone, a real client's portal would stay at "assessment submitted" for ever, because nothing else writes it. Raising only is the one reading that never overstates and never goes backwards. The engaged-client list's tests are unchanged and pass |
| E12 | **Each procedure stage maps onto the one client-facing label its ENTRY evidences**, never a label claiming a fact the stage does not establish; RESEARCH_PART_RUN and PAID are never targets | "The portal keeps showing only what it can evidence." Where it understates, it understates: INVOICE shows "Chartered sign-off", because entering it does not evidence an invoice |
| E13 | **The enquiry gate has FOUR checks, not the three the brief named** — a UK healthcare property; a trading client (13(a)); **the enquirer is the owner, or acts with the owner's authority**; no existing claim conflict | SOP 1 makes ownership or authority a stop condition of its own — "the enquiry is declined, not parked" — and the brief cites the procedure as its authority. What the build already holds is shown beside each check as evidence and does not fill it in: none of it is the same fact as the check |
| E14 | **Survey jobs carry `claim_id`; `claimSurveyors` reads it and not the assessment** (row E5) | Two claims sharing an organisation's assessment could otherwise share a surveyor by accident. A job's claim must belong to the job's own organisation, refused by trigger |
| E15 | **The gates whose facts CRM 6 builds — DATA_GATHERING, VALUATION, REPORTS, DEFENCE_PACK — are recorded CONFIRMATIONS until then**: who, when, a note, taken at that stage, and counted only if made since the claim last entered it. **The surveyor's commitment and the tax adviser's sign-off cannot be confirmed by anybody** | Without them those stages would have no gate at all; built shut against columns CRM 6 fills, no claim could pass data gathering before CRM 6. A reopen invalidates what was confirmed before it |
| E16 | **TAX_ADVISER_SIGNOFF reads `claims.tax_adviser_signoff_at`, null on every claim and written by nothing — shut for every role.** REPORTS reads it again, and `claimableFigureReleased` is the question any client-facing reader asks | "Build this gate now against a column that is null until then, so it ships shut." CRM 6 points it at the sign-off record |
| E17 | **The fee trigger is a coded switch, not a setting, at the most cautious reading — HMRC processing the relief — with all three readings built and tested.** INVOICE also needs an invoice raised, read at the organisation until CRM 7 moves invoices onto the claim | The trigger is an open decision, and a setting would be a second place to decide it and a way round a gate (20.6). The latest reading never invoices for relief the client has not received |
| E18 | **One stage at a time; exits only where the procedure's map draws them** — CLIENT_WITHDREW at REPORTS, REASONED_NEGATIVE from DATA_GATHERING to REPORTS (SOP 8's words), OUTSIDE_AMENDMENT_WINDOW, CANCELLED and LOST from any open stage — **and ADMIN reopens, with a reason, never past the furthest stage the claim reached** | A skip would be two gates in one act, and the history would not show each. A reopen past where a claim had been would be a forward move with no gate |
| E19 | **Every move is a row in `claim_stage_moves` — who, from, to, the reason's code and its text — and an audit line carrying the code and never the text**; a refused move is audited as REFUSED | A note can hold a name and the audit log cannot be deleted. The rows are also a card's age and CRM 9's days per stage |
| E20 | **Dragging on the board is a button** | The content security policy forbids script and every page works without JavaScript. The button posts the same move, and the server asks the gate again |
| E21 | **A lead carries no person, no score and no probability.** A referral with no organisation carries only its name and sector, and converts only once linked to an organisation the assessment created | N2 and N4; and the assessment, not a form, is where an organisation comes from, so nothing it captures is keyed twice. *Qualified, not reversed, by the gated-exit repair (E22): a lead still has no column for a person, but a person's contact row may belong to a lead that has no organisation yet* |

## Part E, continued — the decision the gated-exit repair took, 11 September 2026

| # | Decision | Why |
|---|---|---|
| E22 | **A contact and a booking may BELONG TO A LEAD until the lead has an organisation, and move to it — the same rows, nothing copied — when the lead is linked and converted.** Built for the call asked for at the reasoned negative, which reaches the close with no property and no sector, so no organisation can exist (`businesses.sector` is NOT NULL and a healthcare sector). The close records a LEAD, origin GATED_EXIT, from the website, with no organisation and the business name as the prospect gave it; the person is a `contacts` row and the call a `bookings` row, each carrying `lead_id` and no organisation (migration 011, which rebuilds both tables). A row needs an organisation or a lead, never neither; once the lead has an organisation its rows cannot point at another. **The capture ships ON.** | **The other way was to hold the name and the channel on the lead, and it would have broken four things.** E21's one place a person lives — conversion would have had to copy the person, which is re-keying. CB_BOOKING's one booking vocabulary, written to `bookings` in its own words, whose `entry_point` has allowed `gated_exit` since migration 003. The clash check, which reads `bookings` — a telephone slot held on a lead would have been offered to the next prospect too. And the calendar's call queue, which reads `bookings` — the call would have been recorded and seen by nobody who has to make it. **No question for the data protection officer, because the lawful basis is already written:** Section 3 of the draft privacy notice names a prospect's contact details — name, role, email, telephone — collected to take steps at their request before entering a contract (Article 6(1)(b)). A call asked for at the reasoned negative is exactly that, with the same fields and the same per-channel consent as the funnel close, which already captures them. **What is genuinely open is how long a lead's person is kept if the lead never converts — and that is open for every lead, not only this one.** It is added in terms to CRM 8 of 10, the compliance registers, which builds retention |

## Part E, continued — decisions CRM 3 of 10 took, 11 September 2026

| # | Decision | Why |
|---|---|---|
| E23 | **A claim's next action is its flagged OPEN staff task**, and `claims.next_action` and `next_action_due` are carried into tasks and retired by migration 012 — emptied, and refused by two named triggers (migration 004's idiom). Every reader takes it from the task through `CLAIM_SELECT` | Two places for one fact disagree. The task has what the text column never had — an owner, a due date and a status — and "exactly one" can only be enforced on a row. Nothing is invented in the carry-over: a claim with no owner gets an unowned next action, and a claim with none gets none, and the breakers list shows both |
| E24 | **A task may be about a LEAD**, as well as an organisation, a property or a claim (row 10.2), and stays the lead's after conversion — the organisation's timeline reads it through the lead | A call asked for at the reasoned negative is a lead with no organisation (E22), and "lead created → a first follow-up" fires for it. Moving a task on conversion, as contacts and bookings move, would mean rewriting closed tasks, which keep their record |
| E25 | **A follow-up date is a task** (row 5.12), and **a contact's last contact is derived** (row 5.11): the latest completed call, email or meeting task naming the contact, or a message the outbox actually sent. A date recorded by hand before is kept and read as recorded by staff; a trigger refuses a new one | "Derive the first from this timeline and make the second a task." A queued, unsent message is not a contact, and neither is a cancelled call: both read exactly as silence does — no contact recorded (N4) |
| E26 | **A due date is a calendar date, not an instant.** `due_on` is YYYY-MM-DD; overdue is a date before today's UK date, asked of `localDate` in `src/web/localtime.ts`, still the only file naming a zone. **No due date is not overdue and not on time.** `client_tasks.due_on` is added so a question — and CRM 4's document requests, which are client questions — can be due | A due date is a day in the business's calendar. Stored as UTC midnight it would move a day in summer; stored as a date there is nothing to convert. A task needs no due date and no priority, so no required field forces a guess |
| E27 | **The store refuses a FORWARD, HOLD, RESUME or REOPEN that would leave an open claim without one next action with an owner and a due date**, asked after the gate so a gate's refusal stays the gate's. A move may carry the next action, written in the move's own transaction. **An exit or a close needs none.** A claim opened, or whose next action is completed or cancelled, is not refused — it is listed on `/staff/next-actions`. A task waiting with a team has no owner. **Who is waiting is `waitingOn` in `src/web/engaged.ts`**, the engaged-client list's own `clientRow`, where both waiting reads as ours | "The store refuses a stage move that would leave it without one, and a list shows the claims breaking the rule." A claim can come into being without one, and a person may complete the next action before naming the next; refusing those would push work off the system. There is no second waiting ladder, and a test reads the source to hold that |
| E28 | **The full specification's triggers are re-keyed onto what this build records**: engagement signed = a claim ENTERING DATA_GATHERING, which only the signed letter opens; survey committed = ENTERING VALUATION, which only the commitment opens; survey booked and information complete (14.3, 14.4) = ENTERING SURVEY — **correcting row 14.4**, whose "a survey job being assigned" has no write path in this build; client review = ENTERING REPORTS; claim completed = ENTERING INVOICE. A RESUME fires nothing, because a hold is a pause and not an entry. "A document is requested" is built with no source until CRM 4 of 10. **Every matching rule writes a run**, RAN or NOT_RUN with its reason, and a rule that fails writes NOT_RUN ERROR and never undoes the event it followed | A trigger on an event that nothing records never fires, and a rule that never fires is a promise in a table. A lead with no organisation is recorded as not run for a rule that needs one — never skipped silently |
| E29 | **What no rule may do is held in four places**: the table's CHECK allows four effects; the store refuses thirteen named ones with their reasons; the runner imports nothing that moves a claim, records a confirmation, runs the research, ingests a register record or reads the engine; and it builds its own `outboxTransport` from the database, never the application's transport. **A rule on a DO_NOT_CONTACT organisation does not run at all** — not a notice and not an internal task. A notice goes only to an active member of staff, and never to the person who made the change | "Write to a DO_NOT_CONTACT organisation" is read strictly: a rule does nothing about that client, and a person still can. Building the transport inside the runner means a real mailer swapped into the application later still carries nothing a rule writes. No effect addresses a client, so no rule can create an invoice email |
| E30 | **Email templates**: six merge fields and no others; every merged value escaped and a subject line's line breaks removed; a value nobody recorded is a visible gap, "[property address not recorded]"; refused by keyword and by the shape of a sort code, account number and IBAN in the store, by keyword at the table, and again at the merge; queued to one of the claim's organisation's own contacts with an address, through `outboxTransport`, with the organisation named, as kind TEMPLATE | "Dear ," is what a person sends when a gap is silent. A template is the easiest way round the invoice email's wait on the fraud procedure, so it is closed at three points. The organisation is named so DO_NOT_CONTACT refuses it twice |
| E31 | **The timeline is a read, and there is no timeline table**: organisation, property, claim and lead, each assembled from the tables that hold the events. Internal notes are a separate array, present only for `internal_note.read`. **ACCOUNTING opens a claim's timeline built from `invoice.read` alone**, so its claim view gains `timeline` — CRM 1's pinned-key test is updated in the test with this reason. SURVEYING opens only a claim's timeline, through an assigned job: stage labels without reasons or names, its own tasks, its own commitment. A lead's timeline reads `lead_id`. Record changes come from the audit log as who and which fields, never values; the raw log stays ADMIN's | "DO NOT BUILD A SECOND EVENT LOG." A test holds that migration 012 adds no event-named table. The pinned keys were a control on what ACCOUNTING reaches, and the timeline is money |
| E32 | **The payload proof's "all seven as ADMIN" is read as: the search is proven able to find them in the response that carries the new objects.** The tasks and the timeline are inside the claim's `view.json`, already 7 of 7 as ADMIN and 0 of 7 as SURVEYING. "My tasks" and the landing page build no estimate for any role, so ADMIN finds 0 of 7 there too, and the proof fails if either role finds one | A route that carries no estimate for anyone cannot show seven for ADMIN; asserting it would make the proof fail for a reason that is not a leak, and dropping the route would leave it unsearched |
| E33 | **A lead keeps its own free-text next action**, for now; the one-next-action rule is the claim's | The phase's rule is about claims, and a lead's next step is set at intake by the person recording it. Retiring it into a task, as the claim's was, is buildable and is added in terms to CRM 9 of 10, whose lists sort by next action |

## Part E, continued — decisions CRM 4 of 10 took, 11 September 2026

| # | Decision | Why |
|---|---|---|
| E34 | **There is still one upload handler, and a type with no receipt policy cannot be received.** Each type names the handler's own document type whose receipt policy strips it (`document_types.handler_type`), one type per policy by a partial unique index. The CRM list's fourteen types have none: an upload of one is refused **before a link is issued**, and a request for one is refused by the store and by the table. A policy is bound only by a migration; a type ADMIN adds has none, by CHECK | The ingestion module's own rule is that "a new document type must earn a policy entry before an upload of it can be stored", and `receiveByUpload` could never receive what the handler must refuse. Writing a policy is the data protection officer's call — the question in Part F. Build it and switch it off: the day a policy exists, one migration binds the type and nothing else changes. **Corrected by Phase 129 (E158):** binding one also needs a policy entry of its own in the ingestion module and a rebuild of the type table, and a recommended strip for each of the fourteen is now recorded, switched off |
| E35 | **The CRM list's "purchase contract" is merged into the Stage 2 list's sale contract**, which the Stage 2 list already describes with any s.198 election schedule — one document, one policy. **Its "invoices" are split**: `INVOICE`, Caprebate's own fee invoice, which carries the fee and is Finance's; and `CONTRACTOR_INVOICE`, the works' invoices, which are claim evidence. **Its "plans" are drawings**, not the planning permission, which is its own type on its own policy | Two types on one policy would make the handler's classification map back to two types. "ACCOUNTING reads invoices" means our invoice; a contractor's invoice "beats any apportionment" and is evidence a surveyor needs |
| E36 | **Who may read a type is one of four classes, and whether it can carry a value is a separate, one-way flag.** Claim evidence: Admin, Sales, a surveyor on an assigned job, the client. The claim team: Admin, Sales, the client. Finance: Admin, Accounting, the client. The engagement letter: Admin, Sales, the client, and Accounting once it is signed — never a surveyor. **A type that can carry a claim value, a tax benefit or a fee is never claim evidence, and the flag is never unset** — by the store and the table. Sales does not read the fee invoice, because `invoice.read` is not Sales's. The client reads their own documents except a value-carrying one other than their letter and their invoice. An ADMIN-added type carries a value unless somebody says it cannot | "SURVEYING … never the letter's fee terms; ACCOUNTING invoices and the signed letter only", held twice. The client is refused a capital allowances report or claim documentation before the sign-off because no figure is stated to the client as claimable before it (rule 9.9); when CRM 6 of 10 builds the sign-off it decides the release |
| E37 | **A surveyor reaches a document through a job, twice over.** Linked to claims or properties: the surveyors holding a job on those claims, or on a claim of those properties. Linked to nothing: the surveyors holding a job on its organisation — exactly what a surveyor's evidence panel always listed. **A link is ended, never deleted**, and a request raised on a claim links the document that answers it to that claim | "The documents of an assigned job only", without taking from the surveyor the organisation's documents their evidence panel already showed. That a lease was linked to a claim is part of the claim's record |
| E38 | **Accounting's claim view gains `documents`**, built from `document.read` alone — the fee invoice and the signed letter. CRM 1 of 10's pinned-key test is updated in the test with this reason, as E31 updated it for the timeline | The pinned keys are a control on what Accounting reaches, and the documents it reaches are money |
| E39 | **A deletion clock is RET-7 or UNSET, and a version keeps its own.** RET-7 is the only clock the Retention Procedure gives a client document — six years from the later of the claim period's end and the report's delivery — **derived and not approved, so it computes no date**, read from the ingestion module's `RET7` through the port. The eleven receivable types carry it; the fourteen others are UNSET, shown as UNSET. Each version records its type's clock at the moment it arrived, and keeps it when the type's changes. **A clock nobody set and a clock not on the list read identically** | No type-specific period exists for any CRM-list type in the Retention Procedure, the Determinations, the extraction specifications or the Dashboard Data Specification. An unapproved date would make the schedule look finished (Retention Determinations 7B). N4 |
| E40 | **A logical document has no title**: it is "Lease 2", its type and its number within its organisation. A version is the next number of its document, by trigger. **Nothing about a version changes after it is written, and it is never deleted**; a row from before versions existed that no policy matched is left as it was — DB-W1-T3 moves one to another organisation, and still does. **The uploads already held each became version 1 of their own document**, never merged | A title is where a person's name goes. A merge guessed by type would make one lease the other's history |
| E41 | **A new version's file name is derived — `lease-2-version-3` — and the portal no longer asks for one.** Rows written before keep theirs | The Dashboard Data Specification's S3 row: filenames are opaque, because "smith-lease-2019.pdf is a name in the filesystem" — and this phase writes no name into the claim record |
| E42 | **A document request is a client question of kind DOCUMENT; REQUESTED, RECEIVED and WITHDRAWN are READ off its `state`**, never stored beside it. It reaches ANSWERED only in `receiveByUpload`, naming the version that answered it, after the handler has recorded the strip and the discharge — and the table refuses any other way. The portal's answer route and the business page's "answer here" refuse it first, and neither lists it among questions; a request is withdrawn from the claim. **An upload made against no request receives the earliest open request of its type on the organisation**, earliest due first | "RECEIVED is set by an upload of the requested type, never by a click." A second state column is a copy that can disagree. An upload of the requested type is exactly what the request asked for, however it was started |
| E43 | **THE RUNNING APPLICATION NEVER FINISHED AN UPLOAD, AND NOW DOES.** `finishUpload` was imported by the router and called by nothing but tests: `PUT /upload/put` wrote the bytes to quarantine and stopped, so steps 3 to 7 — classification, the strip, the discharge — never ran outside a test. The job step 1 issued is now read back from the handler's own step-1 row (`issuedJob`), and the PUT runs the rest on the same request. **A link is used once**: a PUT to a row no longer at ISSUED answers 409 before a byte is written | Found by re-deriving the premise that a request can be "closed by an upload". It could not have been in the running application. The used link closes a second gap: a replayed PUT would have written a fresh unredacted copy into a discharged quarantine. Nothing of the handler's is restated — the job is the object `issueUploadUrl` builds, and every step still asserts its order |
| E44 | **`document.read_original` is ADMIN and the client's own**, and asked on the staff download as on the portal's | The Dashboard Data Specification's access table gives the surveyor and the accountant no access to the raw document store and has no Sales row. Under the fail-closed settings there is no original to serve either way |
| E45 | **A document is authorised on itself, never on its organisation.** The portal's document routes and a surveyor's evidence panel asked `business.read`, which admits Accounting to every client's name — and so admitted it to every lease through the portal's own route | "Enforced in can() against the document itself" |
| E46 | **Creating a request fires DOCUMENT_REQUESTED, after it has committed**, with a test; no rule is seeded for it. **"CRM 3's automation can raise them" is read as the automation being raised BY a request.** A rule whose EFFECT raises a document request needs `automation_rules.effect`'s CHECK widened, which is a table rebuild — added in terms to CRM 9 of 10, whose admin settings fold the rules in | The phase's own addition says what nothing raised: the trigger. A table rebuild of the rules for a fifth effect is its own piece of work, with its own read-back of every trigger and seeded row |
| E47 | **The timeline draws a request, its receipt and its withdrawal from `client_tasks` in their own words, a version with its type and number, and a link and its end** — and asks `document.read` of every document, so Sales does not learn from a timeline that a fee invoice exists. Migration 013 creates exactly three tables and none is a log | "Extend its sources, never a second event log" |

## Part E, continued — decisions CRM 5 of 10 took, 11 September 2026

| # | Decision | Why |
|---|---|---|
| E48 | **Contact with a firm is a staff task on the firm.** A call, email or meeting that happened is a completed task; the next contact is an open task with an owner and a date; model A's reciprocity is logged the same way. `staff_tasks` was **rebuilt** to take an `introducer_id` — a task on a firm is about the firm alone — with every index and trigger re-created and the three reciprocity kinds added to the activity list's named trigger pair. **The last and next contact are read from those tasks**, never typed | The prompt said "logged as activities on the introducer", and a first build made an activity table. **The application said no**: CRM 3 of 10 made a call, an email and a meeting staff tasks, and `test/tasks.test.ts` refuses any second activity table — it went red. The application is right, and the table was never shipped |
| E49 | **One person at a firm receives progress notices** — the first person recorded with an email, until somebody names another, and always one of the firm's own. With nobody named, a notice is kept as not queued, NO_ADDRESS | Everybody at a practice is a wider disclosure than the client agreed to. One named recipient is the narrowest reading of "tell the accountant" |
| E50 | **The paper's stage changes, mapped onto the procedure**: referred — a referral, or a yes on a lead with no claim yet; indicative range issued — the claim opening at ASSESSMENT where the client was shown a range; engaged — entering DATA_GATHERING; report delivered — entering INVOICE; fee settled — entering DEFENCE_PACK, **worded as "the invoice stage is complete" and never as paid**; a reasoned negative — the exit, with its listed reason and never the note. A yes tells the firm where the claim stands, once. A notice is queued once per lead. The firm is sent the client business's name and the stage — **no figure, no document, no person** | Each notice says only what the gate into its stage can support: the gate out of INVOICE is the fee trigger and a raised invoice, and nothing in the procedure records payment. The note is staff prose that can carry a name (N2) |
| E51 | **Clause 1 of the engagement letter does not leave blank a fee to an introducer.** Read from the `.docx` on 11 September 2026, its one bracketed term is the fee for **Caprebate's own chartered tax adviser**, introduced to sign the filing position for a client with no adviser. The letter says nothing about paying an introducer. **The switch reads clause 1 as the prompt asked**, and neither model leaves off while it has a blank — so the letter being finished is necessary and not sufficient, and the question under Lakhbir says so | "Re-derive the premise of your own phase prompt." Building a gate on the wrong clause silently would make a finished letter look like permission to pay an accountant |
| E52 | **A referral's source is derived from the firm's kind** — an accountancy firm ACCOUNTANT, a tax adviser ADVISER, anything else or not recorded REFERRAL — and a lead with an introducer has one of those three, by trigger. A website lead is attributed to a firm only by changing its source with it | Derive, do not re-key: the firm already says what kind of referral it is |
| E53 | **The opt-in is the client's**: on the organisation, or on the lead while there is none, and the organisation reads the rows on its own leads, so nothing moves on conversion; **per firm**, and only a firm that referred that client; **append-only**, the latest row by insertion order being the answer; **the words by version**, a CHECK listing the versions that exist. Recorded by staff today. **Never asked, no and withdrawn read identically and share nothing** — and the database refuses a queued notice whose opt-in is not the client's current yes | Paper section 5a: "the client, not the accountant, is Caprebate's data subject". A client giving or withdrawing it in their own portal is CRM 8 of 10's consent history, and went there in terms |
| E54 | **The public referral form ships off by its own gate**, `REFERRAL_FORM`, not by `CB_REGISTRY.precondition`, which governs register lookups. Shut, `/refer` does not exist and answers exactly as a path that does not exist. Open, it writes through the staff intake as **a new firm row marked PUBLIC_FORM, never matched to a firm already recorded**, and refuses anything without the practice's confirmation that its client agreed — recorded in the audit line | It collects another firm's client's details, so it waits on a notice that says so. A public form cannot be trusted to attach itself to a real practice; staff attribute the lead |
| E55 | **A fee paid to a firm is recorded, never collected**, and its action is `introducer_fee.record_settled` | `test/finance.test.ts` refuses any action named for taking money, and a first name — `introducer_fee.pay` — tripped it. The control is right; the name was wrong |
| E56 | **The one flaky test, explained.** A test server listening on every address can share its port with a program bound to 127.0.0.1, and the kernel sends a request to 127.0.0.1 to that program: it was reproduced, answering 404. Every test server and the payload proof now bind 127.0.0.1, which the kernel refuses to share; a test holds the line, and the funnel close's assertion now says who answered | A flake nobody explains is a red run waiting to be dismissed as noise |
| E57 | **The fees on a firm's page are by organisation** — every invoice of an organisation a referred claim belongs to — and say so | Invoices sit on the organisation until CRM 7 of 10 moves them onto the claim; re-pointing this reading went to that phase in terms |
| E58 | **`introducer_notices` keeps a not-queued notice with its reason**, as `automation_runs` keeps a rule that did not run | It is not a second event log: the outbox holds what was queued, and nothing else holds what was not — without it, "nothing was queued" could not be told from "nothing fell due" |

## Part E, continued — decisions CRM 6 of 10 took, 11 September 2026

| # | Decision | Why |
|---|---|---|
| E59 | **The facts panel derives first, and the store refuses a recorded fact wherever a better source derives it.** The claimant type stays the organisation's, the jurisdiction and the acquisition date the property's — none is a key the claim can record. Taxable profit is the client's own answer read through `sessionFromFunnel` and its break-even switch, which is read and never re-implemented; it is captured on the claim only where that mapping set nothing. Everything else the panel shows is captured in `claim_facts` (migration 015), append-only, the latest answer per key being the answer | "Derived first, captured only where nothing derives it." Two answers to one question come to disagree; a refused second answer cannot |
| E60 | **Every value carries its source in the source register's pattern** — the register's own source id, its publisher and provenance code, whether it was derived, and exactly where it was read (a row id, a module and function, a page). A person recording a fact names one of four sources they can speak for: the client, the client's document, the surveyor, the tax adviser. **A recorded UNKNOWN and a fact never asked read identically** — `known: false`, the same words — and a fact is never written as zero | The register's own schema: "not yet asked is the absence of a cell". The Cell type itself was not used, because its field whitelist is the register's and a claim fact is not a register field |
| E61 | **The amendment window is CB_CASH's `deriveAmendmentWindow`, read through `src/web/engine.ts`, and UNKNOWN whenever the acquisition date, the accounting period or the claimant type is** — recorded as not known or never asked — **and on a charity, which may file either way, and on an acquisition date outside the recorded period**, which means the period recorded is not the period the spend is in. The engine's own rule of thumb is shown with its assumption. **The enquiry extension (para 82, route W4) is not read**: the window a gate needs is the one before the claim goes in, and a claim under enquiry is already past the invoice stage | "Derived from acquisition date and accounting period and UNKNOWN whenever either is." The claimant type is the third input the engine's own function turns on, so it is UNKNOWN on that too. The extension is the tax adviser's to confirm — FOR THE ACCOUNTANT, ACC-C5 |
| E62 | **REPORTS needs the window OPEN. INVOICE needs the claim filed INSIDE it** — the recorded filing date on or before the window's end — or, where no filing is recorded, the window open today. UNKNOWN passes neither | Read literally, "the amendment window as a need on the INVOICE gate" would stop a fee earned under the fee trigger because the window closed after the amended return went in — the procedure's own stop condition is a claim that cannot be filed in time, "stop before the fee". A test holds both readings apart |
| E63 | **The election is resolved on a recorded NO, or on a YES with its section, its value and the fixtures it covers, notified inside s.201(1)'s two years by CB_ELECTION's own `notifiedInTime`** — or with an undetermined tribunal application lodged in time, which the engine's s.201(1A) branch disapplies the limit for, and only where both its date and that status are recorded. A late notice leaves it UNRESOLVED — the procedure's stop condition, not a pass. A nominal value is valid and is recorded as any other: whether one is a reasoned negative on the covered items is the tax adviser's | Rulebook C, X3 and E-C5. "Resolved" is the procedure's word: no unresolved election. A status not known is not a pending application and relieves nothing |
| E64 | **THE FOUR FIGURES ARE THE PHASE'S, AND THE RECONCILIATION KEEPS THE DESIGN'S SCHEMA.** The Estimate-to-Outcome Reconciliation design names A indicative, B quoted in the letter, C pre-submission at the tax adviser's sign-off, D outcome; this phase names A indicative, B researched, C the surveyor's committed figure, D the figure the adviser signed. The claim's figures panel is the phase's four. The reconciliation row keeps the design's field names: its **B quoted is the range the client was shown before the letter was signed, with `value_gbp` NULL** — the letter states no figure, and a midpoint would be a number nobody quoted; its **C pre-submission is the adviser's figure**; the surveyor's figure is kept beside it; its **D is derived** | Two documents with the same letters for different things. The design's B is a figure this build does not hold, so the quote gap is NOT KNOWN on every case — never zero — and every case goes to the adviser's variance tag before it closes, as one over the design's 15% does |
| E65 | **No figures table.** Each figure is read from the record that sealed it: A from `estimates` with `estimate_hash` (002), C from `surveyor_commitments` with `figures_hash` (006), D from the sign-off record's own hash. **B has no column anywhere**, and a test looks for one: it reads the two register gates and says which is shut — NOT_PERMITTED_YET — or, with both open, that nothing produces one | "Each sealed and hashed when set and never edited." A fourth copy of a sealed figure is a place for it to disagree with itself |
| E66 | **The tax adviser's sign-off is a record, `tax_adviser_signoffs`, and its `kind` can only say so.** Who — a firm or one of three roles, never a person's name — the credential, the date signed, the scope, a method note, **which CB_CTA switch readings they confirmed, with each switch's position at that moment**, the figure (more than nothing: a signed nil is the reasoned negative exit), against a surveyor's commitment on a job on THIS claim (a trigger), hashed. Recorded only while the claim is at the sign-off stage. **The gate reads only a record made since the claim last entered that stage**, and `claims.tax_adviser_signoff_at` is retired by two triggers that refuse any write | "A RECORD, not a signature … prove it opens only on it." The procedure logs the adviser's name and N2 forbids a third party's; the question is the data protection officer's — Part F |
| E67 | **The reconciliation opens with the first sign-off record**, in the same transaction, and a later sign-off does not rewrite it. Its snapshot is fixed; the filing, the variance tag and the outcome are each recorded once. **The outcome is derived**: a closed enquiry is agreed as submitted, reduced or increased at its own figure; with no enquiry the window lapses only twelve months after the recorded filing; withdrawn is the one outcome a person states. The variance is read, never stored | The design opens the record when the quote is captured, which here exists from the assessment and fixes nothing to reconcile against. The first moment a case has a figure to compare is the adviser's |
| E68 | **The gates CRM 2 of 10 left as confirmations, re-cut.** DATA_GATHERING reads the election fact, and keeps a confirmation for the floor area and the VOA licence block, which nothing derives. VALUATION reads every grant traced, and keeps a confirmation for every rate sourced. REPORTS reads the sign-off, **both reports issued** and the window, and keeps the client's acceptance and the accountant's confirmation, which are acts nothing records. **DEFENCE_PACK reads the register's issued defence pack, and its confirmation is RETIRED** — refused when recorded, dropped from the panel; the key stays in the table's CHECK so a historic row still reads | "Wherever the facts panel or the deliverables register now derives one, the gate reads the fact, and a confirmation stays only where nothing does." The labels no longer name what a fact decides |
| E69 | **The deliverables register is one row per version**, written at DRAFT; NOT_STARTED is the reading of no row. Forward only — draft, issued, superseded. Issuing a version supersedes the one before, **except the defence pack, whose every issued version stays exactly as issued and needs its SHA-256 to be issued**. Each kind is one document type, fixed by CHECK: the client report a capital allowances report, the accountant's pack a tax computation, the reasoned negative and the defence pack claim documentation, the s.203 notification correspondence. **None of those types has a receipt policy**, so the link to the document stays NULL and the register says it cannot be stored yet; set once it can, by a trigger that checks the type and the organisation. **The client report and the accountant's pack are neither drafted nor issued before the sign-off** | Developer Spec DS-W10: track, never generate. "No report is drafted stating a figure to the client" (SOP 8). No second upload path |
| E70 | **The client release is decided in can(), both ways.** `clientDocument` admits a capital allowances report only when it is an ISSUED client report on a claim with a sign-off record since the claim entered that stage; `clientDeliverable` admits an ISSUED reasoned negative, s.203 notification, or client report whose figure is released — never the accountant's pack or the defence pack. The portal lists them with no figure. **A reasoned negative reaches the client only through its deliverable**: the organisation's stage is not moved by the exit | "Once the sign-off record exists, decide in can() whether an ISSUED client report is released to its client, with a test both ways." Today no capital allowances report can be uploaded, so the document half is proved on a fixture |
| E71 | **A surveyor on an assigned job receives the RELEASED facts alone**, listed in `src/payload.ts` and assembled forwards from a reader that has no case for anything else: the claimant type, the jurisdiction, the acquisition date, whether an election affects the property and its section, notice and scope, the prior owner chain, whether grants met the spend and against which elements, and whether the buyer altered the building. **No amount** — an election's value, a grant's amount, the pool split, the transaction tax, the alterations' cost, the structures allowance figure — **no window, no profit position and no figure.** A new action, `claim_facts.read_released` | N1 reaches an amount agreed between buyer and seller as it reaches our own number: a surveyor anchors on either. The payload proof searches the served object for the proof's own amounts and the estimate |
| E72 | **A grant's payer is a class from Rulebook F's own list, never a name**; a grant is traced YES only with the cost elements written against it; withdrawn with a reason, never edited or deleted. The gate refuses a recorded NO while a grant is still recorded against it | Rulebook F, F3 — "trace it to cost elements; do not pro-rate" — and N2 |
| E73 | **An owner in the prior chain is a company name or a role token** — the property's own guard, `isCompanyOrRoleToken` — its position counted back from our client, withdrawn and never deleted | N2, as the property's previous owner already is |
| E74 | **An HMRC enquiry opens once and closes once**, with its outcome and, when amended, the agreed figure. Its correspondence is the Correspondence type, which has no receipt policy, and the panel says so | The same question as every other new document type; no second upload path |
| E75 | **Clause 13 is a switch, OFF, reading the letter.** Re-derived on 11 September 2026: the engagement letter **now carries clause 13** — the fee recalculated on a reduced figure and the difference credited or refunded — **with three blanks**: the trigger, settlements, and the time limit. The question in CAPREBATE QUESTIONS still said the letter contains none of it; a dated note there corrects that. Off, an enquiry that reduces a claim below the adviser's figure raises nothing and the audit says why; on with a blank, still nothing; on with the clause complete, a finance task waiting with Accounting. **Nothing computes a credit** | "Re-derive the premise of your own phase prompt." The fee is Caprebate's own finance — CRM 7 of 10 |
| E76 | **A sale that is coming is `properties.sale_in_prospect`**, yes, no or not known. A disposal date newly set, or a sale newly in prospect, raises one open task on the property, waiting with Sales, pointing at the Disposal Note. Never asked, no and not known raise nothing; a second trigger while one is open raises nothing more | A disposal date records a sale that has happened; the election on a future sale is settled before heads of terms (Disposal Note v2 §9) |
| E77 | **ACCOUNTING is on none of the nine new actions**, and its claim view is exactly as CRM 4 of 10 left it | "ACCOUNTING reaches money only." The pinned-key test is unchanged |

## Part E, continued — decisions CRM 7 of 10 took, 11 September 2026

| # | Decision | Why |
|---|---|---|
| E78 | **An invoice belongs to a claim, with `business_id` beside it, by a composite foreign key onto the claim (migration 016 rebuilds `invoices`).** Every row that already existed is copied unchanged and **stays an organisation's invoice from before** — its states typed, nothing of a claim's invoice on it — and a trigger refuses moving one onto a claim. The INVOICE gate, the timeline's financial events, the introducer dashboard's fees and the claim page's money **all read the claim's own invoices now**; an organisation's timeline also carries its old rows | Which claim an old row was for was never recorded; a guess would be a record nobody made. Until now one claim's invoice opened the INVOICE gate of every claim of the same client |
| E79 | **Our fee's figure is the tax adviser's signed-off figure** — the sign-off record made since the claim last entered the sign-off stage — **copied onto the invoice when it is raised**, with the entity type the comparison needs, as migration 006 decided for its five facts. The sign-off record is read inside the server and nothing of it but that figure is returned. Tax rate, pool split and period start are not copied: each is a tax fact Accounting is not on | "The claim value is the engine's and the fee derives from it." The copy is the only way Accounting sees the claim value without a join to the claim's record |
| E80 | **Raising our fee needs, each read on the request:** the claim at INVOICE; inside the amendment window (`invoiceWindowNeed`, CRM 6 of 10's reading); the fee trigger reached at `FEE_TRIGGER`'s own reading, through `feeTriggerReached` — the one function the gate also asks; no live fee invoice; a signed-off figure; a recorded VAT position. **OUTSIDE_AMENDMENT_WINDOW refuses every kind of invoice**; every other exit refuses our fee. The break fee is raised only on CLIENT_WITHDREW and the abort fee only on REASONED_NEGATIVE, both only with their switch on and the letter complete. Every refusal is audited with its code | SOP 9: "job stops before the fee is incurred". The trigger is read, never re-decided — the question stays Lakhbir's |
| E81 | **One gapless number series for invoices and credit notes**, `invoice_numbers`: the next number is one more than the last by trigger, never deleted, and the only change a number takes is to be recorded CANCELLED — an invoice raised in error and cancelled **before it was sent, with nothing against it**. A sent invoice is credited, never cancelled. Shown as CB-000001 | "A gapless invoice number series, never reused; a cancelled number is recorded as cancelled." One series keeps a credit note's number next to the invoice it corrects |
| E82 | **A credit note takes no typed amount.** Two bases: CREDIT_IN_FULL credits what is left, with a reason; CLAUSE_13_REDUCTION credits the fee raised less the fee on the reduced figure from the claim's closed HMRC enquiry, and is refused while CRM 6 of 10's `FEE_CLAWBACK` is off or clause 13 is blank. **"Adjustment" is a credit note**: nothing raises a raised amount. The table refuses credits above the invoice | "A credit note is the only way a raised amount changes." A typed credit would be a second place the fee is decided |
| E83 | **VAT monitoring reads GOV.UK's "last 12 months" as the twelve calendar months ending this month, to today** — the procedure's section 4.1 says "the previous 12 complete months plus the current month to date", which is thirteen — **and each fee's tax point as that section's own register states it: the invoice date, or the client report's delivery if earlier.** The thirty-day test counts the fees expected from claims at the invoice stage, all as if they could fall inside the thirty days, because nothing records when each will be invoiced. One expected fee at or over £25,000 is named (section 5, check 3). An organisation's old invoice has no date and is counted apart, never as nought | The procedure quotes GOV.UK and GOV.UK governs; the thirteen-month wording was a slip, and CRM 7 of 10 corrected it in the export with a dated note. The cautious fee trigger delivers the report months before the invoice, so reading the invoice date alone would count turnover late |
| E84 | **The VAT position, the threshold, the warning fraction, the single-fee trigger and a VAT rate are dated settings with their source**, `finance_settings`, append-only, **ADMIN's alone**. Migration 016 writes four from their documents; the threshold is dated the day GOV.UK was read, because the procedure records the figure and not its commencement. A setting not in effect is not known: no position refuses an invoice, a registered position with no rate refuses it, and no threshold reads *cannot say* | "The threshold held as a dated setting with its source." The monitoring is a director's check; Accounting does not move its own line |
| E85 | **The VAT task is a `staff_tasks` row about Caprebate itself** — `company_subject` VAT_THRESHOLD, origin VAT_MONITOR, waiting with ACCOUNTING, due the last day of the month, **at most one open**, no figure in its words — written through `insertTask`. `staff_tasks` is rebuilt to allow a task about nobody's organisation, lead or firm, following 014 to the letter | "A staff_tasks row written through insertTask … never a new table." The CHECK required an organisation, a lead or a firm, and the VAT threshold is none of them |
| E86 | **Money received is a row**: the day, the amount, bank transfer by CHECK, who recorded it, and `bank_details_confirmed` — OTHER_CHANNEL, NOT_CONFIRMED, NOT_KNOWN, or NULL for never asked. **Never asked and not known are read alike**: both are a warning, neither a confirmation. Never more than is owed, by trigger; a mistaken record is voided once, with a reason, never deleted | "Recorded, not collected." N4 — the unasked client and the unsure one are the same risk |
| E87 | **The due date comes from clause 4's payment terms, read from the .docx.** While they are blank the due date is **UNSET**, the invoice says why, and it is never overdue. A settled clause is read only as "within N days of the invoice", with every remaining bracket stripped first — the blank's own example, "within 14 days of invoice", is not a term. A question is added: "How long does a client have to pay our invoice?" | "Never defaulted to thirty days." No question asked the payment terms; the letter's blank was listed but never put to anyone |
| E88 | **The fee controls are code constants, off, like `FEE_TRIGGER` and `FEE_CLAWBACK`** — a pricing policy is not an admin setting. Off is the plain CB_FEE amount. **CAP and ADJUST_RATE act only on a determined first-year saving, which needs a recorded marginal rate — and nothing records one**, so switched on today they would refuse on every claim rather than pick a number out of a range. The minimum fee's amounts are all unset: the paper's £5,000 and £7,500 are a recommendation, not a decision. **There is no minimum job size switch** — decided no on 1 September 2026. A minimum that would lift a fee the cap lowered refuses | "Each with a test proving that off is exactly today's behaviour." A plausible number in a prototype becomes a number in a contract |
| E89 | **The invoice email stays unbuilt.** The invoice-fraud procedure was in no SOP; CRM 7 of 10 drafted it into SOP 9 as a flagged DRAFT ADDITION and entered its sign-off in the solicitor, DPO and developer register. `INVOICE_FRAUD_PROCEDURE` says not in force, and a test fails if it says otherwise while the SOP says draft. **The two existing refusals are extended, not joined by a third**: `FORBIDDEN_EFFECTS` gains a reminder and bank details; `templateRefusal` and migration 012's trigger pair — replaced by name in 016 — refuse payment details, a remittance, a bank transfer, where to pay, an amount due, a fee note and a statement of account | "Extend and test those; do not add a third place that says no." |
| E90 | **An invoice this build raises is a row, not a document**, and the finance view shows none as a document — so no `document_links` row and no second upload path. Accounting's documents panel is unchanged | CRM 4 of 10's instruction, conditional on showing one |
| E91 | **The finance view reads the task `rule-invoice-finance-task` raised** for each claim at the invoice stage and creates none; raising the invoice does not close it — a person does | "Reads that task and never creates a second." |
| E92 | **Model B's fees to firms are listed on the finance view and paid from nowhere.** The new action for money is `invoice.record_received`, so the refusal of any action named for taking money still holds | "The finance view may list them and never pays them." |
| E93 | **The payload proof's admin check on the finance view decides on field names and exact values, not raw text.** The comparison carries unrounded ratios, and the seed's qualifying percentage, 0.3, is the first three characters of one of them | Found on the first run: a substring of a longer number is not the value; the structured search is the test, and the raw count is still printed |

## Part E, continued — decisions CRM 8 of 10 took, 12 September 2026

| # | Decision | Why |
|---|---|---|
| E94 | **ADMIN holds `compliance.read`, `compliance.write`, `compliance.identity_read` and `compliance.identity_write` today, and nothing else does.** No sixth role is built. **Phase 129: a data protection officer role is now defined and switched off, and still no sixth role is enabled — E157.** **The design's two-person check — the DPO decides, the company countersigns (CAP REBATE LTD, by a director) — is ONE PERSON here** _(corrected 18 September 2026, Phase 133i: this said "the controller countersigns")_: one Admin login types both names. Every register page prints that as a known limitation, and nothing presents it as a check | "Granted to ADMIN today … record that as a known limitation, never present it as a check." The role is Lakhbir's question, "Do we need a compliance role separate from Admin?" |
| E95 | **S2 is narrower than every register.** Its own two actions, inherited from nothing; **no list view** — a person is opened by `person_ref` or found by a name search, and the search returns `person_ref`s and roles, never names; **every read audited**. The search TERM is kept in `identity_search_log`, S2-class data under S2's access, and the audit line names that row — because the audit log can never be deleted and must never hold a name | Dashboard Data Specification sections 3.2, 7 and 8.1 |
| E96 | **`AML_IN_SCOPE` is a dated, sourced, append-only setting, and ships `false`.** A setting never recorded reads exactly as the shipped false — off, which is today's behaviour. Only a recorded `true` makes `cddGateNeed` add a need at the ENGAGEMENT exit, beside the signed letter, through `gateOut` | "aml.in_scope ships false … OFF, nothing blocks a claim. ON, ENGAGEMENT cannot complete without a finished check." |
| E97 | **The claimant types are the position paper's five, plus OTHER with a note.** An LLP, a trust or a general partnership is not in the paper. **There is no risk-rating scale and no ownership threshold**, because the paper names neither: a rating is words or nothing | Premise re-derived: the prompt's "risk rating" and "beneficial owners" assume a scale and a threshold the paper does not give. A question for the solicitor, asked through Lakhbir |
| E98 | **A beneficial owner, and the person with authority to bind, is one of the client's own CONTACTS** — the one table a client-side person lives in — and no name is typed into a due diligence table. S2 holds only people printed on a document a client uploaded, and never the client's own people | N2's "one identity store and never a copy of it"; Dashboard Data Specification N10 |
| E99 | **PSC data never silently stands for beneficial ownership.** `cdd_psc_decisions` cross-references the organisation's `CH_PSC` research source row with its own dated decision and reasoning. **An owner identified from the pull needs THIS check's own decision to rely on it** — refused in code and by a trigger, which is tested on its own; another check's decision, or a decision not to rely, does not open it; and the pull on its own records nobody | Position paper, section 5: "a dated cross-reference … and not let one lookup stand for both without a documented decision" |
| E100 | **The firm-wide risk assessment is a dated record pointing at Caprebate's own document**, not a client document (a `documents` row needs an organisation). Its review is read as due twelve months on | Position paper: "reviewed at least annually" |
| E101 | **The evidence document is any document on the organisation.** No due diligence document type is added: a new type would have no receipt policy and could not be uploaded, which is the question "Which receipt strip should each new document type carry before anyone may upload one?" already open | CRM 4 of 10's instruction on types with no receipt policy |
| E102 | **The rights-request register is Table A and Table B, one row per limb, and the deadlines are READ, not stored.** The pack lists `applicable_period_end` and its siblings as fields; stored, a cell could disagree with its own inputs. `src/web/compliance-clock.ts` computes them with the arithmetic shown. **Identity and a fee sit on Table A**, being the same for every limb, and are copied into each limb's computation; **a decision is per limb** | Pack 2.3 and 2.4; "derived, never stored", as every earlier CRM phase reads outstanding and overdue |
| E103 | **The clock follows the pack, and the Retention Procedure's 5.6 is left as a recorded conflict.** 5.6 treats clarification and identity alike and one start and end per request; the pack corrects it — identity moves the start, clarification pauses the run on the Article 15 limb only, one clock per limb. The procedure was never amended | Where two documents disagree the later, worked one is built; the procedure is the DPO's to correct |
| E104 | **"Beginning with" is the pack's conservative rule**: the day before the corresponding date; the last day of a shorter month where there is none; the alternative reading returned where it differs, and the earlier worked to | Pack 2.5.3, marked [VERIFY — DPO] |
| E105 | **The complaints log is classified on receipt and never revised** (a trigger); an unclassified complaint is counted apart in the s.164B count, never as not a complaint. **RET-6 runs from `responded_at`, which the pack's log does not have: `outcome_notified_at` is read as the final response** | Pack 3.2 and 3.4; the Retention Determinations' RET-6. The DPO confirms the trigger field in the sign-off register |
| E106 | **The breach register has two kinds: a security incident, and ATTEMPTED INVOICE FRAUD** — CRM 7 of 10's SOP 9 draft — recorded with the claim and the date and **never bank details**: refused in words by trigger and in shapes (a sort code, an account number, an IBAN) in code. **Whether it is a personal data breach is the DPO's classification**, left open; until it is given the 72 hours are shown as a conditional reading, never as running or not | Added in terms by CRM 7 of 10 |
| E107 | **"The four facts" are the procedure's four Article 34 facts** — encrypted, backup restored, recipient's confirmed deletion, a route to the individual — **not a notify-or-not decision record.** Each is YES, NO or UNKNOWN; **UNKNOWN and never recorded both refuse 34(3)(a) and 34(3)(b)**, in code and by CHECK | Premise re-derived from the procedure's 5.3(2) and item 12927683763: the prompt's "four-facts decision record" names something the procedure does not |
| E108 | **"No policy in force" is a dated `INSURANCE_POSITION` setting** written from the ICO answer sheet's section 4.6 — the breach procedure itself says nothing about insurance — **and every new entry's insurer row is written NO_POLICY_IN_FORCE.** An insurer recorded as told is refused unless a policy is recorded as in force (N4: silence is not a policy) | Premise re-derived: the source is the answer sheet, not the procedure |
| E109 | **The ICO answer sheet is a rendered page**, drawn from the entry and the sheet's standing answers, never stored and never sent; every blank the sheet lists is shown NOT SET | "The regulator's pre-filled answer sheet is a template." |
| E110 | **Seven letters are drafted, DRAFT and not approved, and reach the outbox as COMPLIANCE_LETTER and nowhere else**: the complaint acknowledgement (pack 4.7) and the complaint outcome with the three onward routes (s.164A(4)(b)); the identity request (Retention Procedure 5.5), the extension notice with its reasons (12A(4)), the refusal with reasons and the three onward routes, the objection decision on the person's particular situation (Art 21(1)), and the access response's cover with both complaint rights (5.7) — the six the pack's readiness item RR-C11 names, and the identity request. None names the DPO as an operative appointment. Each is refused if it carries a word that would tip somebody off | "Response letters are templates that reach the outbox and nowhere else." |
| E111 | **S2 carries `source_record_ref`, although the Dashboard Data Specification calls its field list exhaustive**: the Retention Procedure 2.3B cannot compute RET-8 without it. **The route group, the document type and the day received are derived; `purpose` is one fixed value; `deleted_at` is refused**, because nothing deletes here | A conflict between two documents, recorded; the specification needs a new version, which is the DPO's |
| E112 | **The rights search leaves S2 to S2's own logged search** rather than raise an incident on a name found there. The Retention Procedure 5.7 and the pack treat any name outside RP-E1 and RP-E2 as a LIA-C2 failure, and S2 now holds names by design | A conflict recorded: an incident raised on every S2 hit would be false |
| E113 | **The consent history is `consent_answers` — contact and marketing — with the capture flags as the first answer**, and the contact's flags kept in step. **Sharing progress with a firm is READ from `introducer_share_consents`**, never copied. Named "answers", not "events", because migration 012's test refuses a second event log, and this is not one | "Fold it into the one consent history rather than copying it." |
| E114 | **The client's own route writes the same table under CLIENT_PORTAL** (migration 017 rebuilds `introducer_share_consents`, every row copied, the notice guard re-created verbatim). **Withdrawing is always open while the answer is yes; giving from the portal ships OFF** until the words are agreed; never asked stays no row and offers nothing; a portal answer is recorded by that organisation's own login, by trigger | "A withdrawal must stop the next notice … never asked stays no row and shares nothing." The words wait on "What must a referred client be told …?" |
| E115 | **The retention list is twenty-one record kinds, each with its clock, and none computes a date today.** The parameters are constants; RET-5, RET-6, RET-7 and RET-8 are DERIVED, NOT APPROVED and RET-1 to RET-4 NOT SET; the kinds the determinations do not cover — a lead that never converts and its person, staff tasks, a lead's follow-up tasks, automation runs, the queued outbox, introducers and their people, the opt-in rows, the notices, the consent answers, due diligence — read NOT COVERED. **Whether a table refuses a DELETE is read from `sqlite_master`, not claimed.** A live legal hold keeps a record off the list; a test passes an approved RET-5 to prove the list finds a record past its clock. **There is no deleter** | "Build the due-for-deletion list, not the deleter"; the backup question is still open |
| E116 | **No tipping off.** `templateRefusal` and migration 017's replacement of the template trigger pair refuse six words; every compliance letter is checked; nothing of due diligence is on any action a CLIENT holds | "No tipping-off wording anywhere a client or an accountant can read." |
| E117 | **A hold is a `legal_holds` row with its reason and its next review date**, lifted once with a reason, never deleted; a cross-reference is one `compliance_links` row read in both directions, never a merged record | Retention Procedure 3.3; pack 6.5 |
| E118 | **"Never in CRM 9's search"** is carried in terms to CRM 9 of 10's prompt: its global search and exports must not reach `identity_persons` or `identity_search_log` | The rule belongs to the phase that builds the search |

## Part E, continued — decisions CRM 9 of 10 took, 12 September 2026

| # | Decision | Why |
|---|---|---|
| E119 | **The management dashboard stores nothing.** Every figure is read from the records the earlier phases keep, on the request that draws it; a reading that already exists is called, never rewritten — the money is the finance dashboard's, a firm's referrals `pipelineFigures`, overdue `dueReading`, the variance `varianceOf`. A test asserts the schema holds nothing named for a dashboard, and that drawing it writes no row | "Every tile is a query" |
| E120 | **Who sees a tile is the rule table, not a role check.** Each tile names the actions its figures need and is drawn only where `can()` says yes to every one; inside a tile every row is asked again. ADMIN sees all of it, SALES the pipeline, ACCOUNTING the money, SURVEYING its own survey jobs and nothing else — so N1 is structural, and the payload proof finds none of the seven, and none of ADMIN's pound figures, in a surveyor's dashboard | "Every tile's authorisation has a test"; N1 |
| E121 | **Estimated fees in the pipeline are ADMIN's and ACCOUNTING's, the roles that read invoices** — row 15.2 said ADMIN and SALES. The running application computes the fee estimate inside the finance dashboard under `invoice.read`, which CRM 7 of 10 gave ADMIN and ACCOUNTING. **The application is right**; the tile asks the same action, and Sales keeps the claim values it already reads | Where a CRM document and the running application disagree, the application is right |
| E122 | **Unknown is counted apart, never as nought (N4).** A claim with no sealed estimate, a task with no due date, a completed claim with no sign-off record, a lead not yet decided, a reconciliation whose quote gap cannot be read — each is a sentence under its tile, never a zero in a sum or a ratio; a conversion rate with no decided lead reads "not known", never 0%. Overdue is the UK date | N4 |
| E123 | **MY WORK on the landing page** is `myWork` extended, not a second list: my claims with their next action and what each is waiting on, and every open question I asked with its due reading — a question with no due date shown as having none, never as on time. **The reconciliation, deliverables and compliance tiles** read the claim record's and the registers' own lists; the compliance tile counts and clocks and never names a person | The ADDED notes of CRM 3, 6 and 8 of 10 |
| E124 | **Global search is limited by `can()` before and inside the query.** The kinds a role may search are decided first from the rule table (all, assigned, or not searched); each kind is one fixed statement, and every row found is authorised again. **Never searched**: the identity store and its search log, the compliance registers, document text, a note's body without `internal_note.read`, and the estimate. At least two characters, twenty-five results, wildcards taken literally. A test plants one invented name in S2, the rights register, the complaints log and the breach register and finds it nowhere, and the same name on a contact and a note found by ADMIN and SALES alone | 16.1; E118 |
| E125 | **The lists' filters and sorts are fixed tables.** A parameter not on them is dropped and the page says so; a value filter or sort is applied only for a role holding `claim.read_value`, and said not applied otherwise. ACCOUNTING's claims list is its own shape — reference, organisation, opened — with no join to the working record; a claim with no sealed estimate is never inside a value range | 16.2, 16.4; N4 |
| E126 | **A saved view is its owner's, and only ADMIN shares one** — refused by the store and by a trigger; a view is retired by its owner, never deleted or edited once retired, and its name never reaches the audit log | 16.3 |
| E127 | **CSV export is ADMIN's, SALES's and ACCOUNTING's, of the reader's own columns and rows** — the same list the page draws, audited with the columns, the row count, the filters and the sort and never a value. A cell beginning `=` `+` `-` `@`, a tab or a carriage return is prefixed so a spreadsheet reads it as text. **No export route exists** for the compliance registers, S2 or the retention list | 16.5 |
| E128 | **A lead's free-text next action is retired into a task**, superseding E33. Migration 018 moved every written next action into an open staff task of origin MIGRATION with its due date where it was a date, emptied the two columns and refuses a write to them; a lead's next action is now its earliest open task by due date, and a lead created by staff is created with its follow-up task in one transaction | The CRM 3 of 10 ADDED note |
| E129 | **The property page gains its note route and a documents panel, and so does the organisation page**, each document in a panel admitted by `document.read` for the reader; a surveyor may add neither a note nor a link | The CRM 4 of 10 ADDED note |
| E130 | **The configurable lists are one table, `vocabularies`**: lead sources, priorities, task types, property types and introducer types, each value with a permanent code, retired and never deleted. **A value the application writes itself is fixed** — never retired, at the store and at the table. The database triggers that named a list of literals now read the table; a retired value is refused for anything new and kept on the record that has it. A property type became a list: free text that matched a label or a code was converted, anything else kept as written | 20.2, 20.3 |
| E131 | **The lost and exit reasons are kept on the same screen** in the `reason_lists` table CRM 2 of 10 built for it; "other" is never retired. A priority an active rule or an open recurring task gives its tasks is not retired either — the next task would be refused | 7.11, 20.2 |
| E132 | **What no setting may change is refused by the store, by name, with its reason, and recorded** as CONFIGURATION_REFUSED: every stage gate and the stage list, both register gates, every CTA switch, every fee control, the reward model and the clawback, AML_IN_SCOPE, the client's own yes to sharing progress, the quote-gap review percentage, the retention parameters, the role boundary, a document type's receipt policy and its carries-value flag, the fact keys, the capture sources, the payer classes and the reciprocity kinds. The list is printed on the screen. **The five roles are fixed at the database**: insert, update and delete refused | 20.1, 20.4, 20.6 |
| E133 | **REQUEST_DOCUMENT is an automation effect**, added by rebuilding `automation_rules`. It raises the request through `createDocumentRequest` as the person whose action fired the event — with nobody, or somebody who may not raise one, it records NOT_RUN. Only a type something can receive, at the store and by trigger; never on a document request itself, by CHECK; a do-not-contact organisation is NOT_RUN before any effect | The CRM 4 of 10 ADDED note |
| E134 | **Merging a firm** is ADMIN's alone: its leads, its people and its open tasks move to the firm it really is under one `introducer_merges` row, which is the only thing the replaced `contacts_introducer_fixed` admits. **Kept where they were**: closed tasks, every notice, and every client's answer on sharing progress — a yes to the duplicate firm is not a yes to the other. A firm with a fee recorded is refused: money is never moved by a merge. The merged firm keeps its record and says onto which; recorded as INTRODUCER_MERGED | The CRM 5 of 10 ADDED note |
| E135 | **The finance settings and the compliance settings are shown on the settings screen and written where they always were**, as dated rows with their source. FACT_KEYS, CAPTURE_SOURCES and PAYER_CLASSES are not settings; RETENTION_PARAMETERS are constants | The CRM 6, 7 and 8 of 10 ADDED notes |
| E136 | **The intermittent back-end test was named and fixed**: `test/crm.test.ts` looked for a figure as a substring of the page, and a timestamp in the page could contain it; it now matches the number on its own, with a test that the matcher refuses the substring. Two assertions in `test/staff.test.ts` read the year 2026 and would have failed on 1 January 2027. **The drift checker now fails when a suite inside its run is red**, naming the test, where before it read only the pass count | Run the check five times at the start, name the intermittent test, fix what races |
| E137 | **A JSON route reads before it writes a header.** The payload proof found the settings `view.json` sending its 200 before the store refused a surveyor — a crash, not a 403; the search `view.json` had the same order. Both now read first | Found by the payload proof |

## Part E, continued — decisions CRM 10 of 10 took, 12 September 2026

| # | Decision | Why |
|---|---|---|
| E138 | **The table is closed by a check that can fail, not by a reading.** `03-app/caprebate-crm-fold-check.cjs` reads every row, every question title the table and Developer Spec §5.3 cite, every evidence line's files, names and — in Part Q — test titles, every route the code registers against the Developer Spec, every line reference in its §4, and every CRM screen against the guide; `--self-test` breaks each on purpose and must see it go red | "Every ADOPTED row names the file and the test that built it — or it is not finished" |
| E139 | **An adopted row found not built is CARRIED, never written up as a sentence.** Its own row says what is missing and names the phase by its title; the check fails if no phase of that title is in the action plan, and fails again once the phase has run if the row still has no evidence | The standing instruction's Amendment 1 |
| E140 | **An evidence cell names exact row ids**, or "section N" only where every row of the section is proved. Seven cells that named rows by prefix — "section 9", "7.x", "9.x", "12.x", "13.x" and "B4" — were rewritten, and rows 9.1, 9.2, 9.4, 9.5, 9.11, 13.3, B4.1, B4.8 and B4.10 are now named where their evidence really is | A prefix over-claims: "9.x" read as proving 23.8's missing half, and "B4" as proving B4.11, which nothing had built |
| E141 | **Two citations of one question did not match its title.** Part F and Developer Spec §5.3 quoted "…which kinds of claimant beyond the paper's five must a check cover?"; the question in CAPREBATE QUESTIONS has no "beyond the paper's five". Both now quote the title | A question cited under a title nobody can find is a question nobody answers |
| E142 | **Row 29.9 is answered "nothing to import"** and put to Lakhbir as a one-line confirmation, "Is it right that there is no existing client data to import?", with a board item | There is no real client data anywhere; only Lakhbir can confirm there is none outside the project |
| E143 | **The administrator guide and the user guide are a companion file**, `09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md`, beside the Developer Spec and not inside it, and every exercise in it was run against the seeded demo | The spec is read by a developer pricing work and the guide by staff learning a screen; one document would serve neither |
| E144 | **The developer's half of the CRM is Developer Spec §5.5**, with work items DS-W11 to DS-W15: UK residency, deliverability and the invoice email, calendar synchronisation, the accounting export, data import, the WordPress or Node question with the CRM's size in it, and penetration testing | The seven items the phase names |
| E145 | **Five line references in Developer Spec §4 had moved** while every name they pointed at had not. Corrected, and held by the check | Found by running the check, not by reading |
| E146 | **The two Word documents are archived, not deleted**, with a dated README mapping every section of each; their hashes were checked before and after the move, and the Desktop copies were not touched | The fold's own rule |

## Part E, continued — decisions the CRM follow-on took, 12 September 2026

| # | Decision | Why |
|---|---|---|
| E147 | **The introducer and the source are read through the lead, never a column.** The join is the claims list's own — `leads.claim_id`, then the firm — so the list's filter, the claim page and the claim's `view.json` cannot disagree. A claim a person opened on a property has no lead, and reads its organisation's source, as the list does. The organisation reads every firm whose referral became one of its leads, and gained a `view.json` so it can be seen on the wire. `lead.read` builds where a claim came from and `introducer.read` adds the firm: ADMIN and SALES. ACCOUNTING keeps its own shape and SURVEYING is given neither | DERIVE, DO NOT RE-KEY; the payload proof covers every changed route |
| E148 | **The claim team is a link, not a list of people.** Migration 020's `claim_contacts` joins a contact of the claim's own organisation, typed accountant or adviser, to one claim; it copies no name and no type, ends a link with who and when, and is never deleted. The owner and the surveyor are the claim's own columns; **the tax adviser is their sign-off record** — the firm or role recorded, the credential and the date — under `claim_figures.read`, never a person. Linking is `claim_team.write`, ADMIN and SALES; reading the contacts is `contact.read`; a surveyor is drawn the owner and the surveyor it already reads | A contact is never a user; the sign-off record's name question is the data protection officer's |
| E149 | **The document centre is its own action, and every row on it is `document.read`.** `document_centre.enter` opens the list for the four staff roles and nothing inside it; CLIENT is not on it — the portal is the client's list. Filters (type, organisation, claim, state) and sorts are fixed tables, as the claims list's are. It never searches what a document says and has no export | Row 22.13, and the claims list's discipline |
| E150 | **The reports screen is the dashboard over a period — there is no second screen.** The period is a fixed table: this month, this quarter, a UK financial year of 1 April to 31 March, or any from-to range of UK dates. A tile that counts what happened in time — leads by their date, claims completed, stays finished, claims expected to complete, exits, money by calendar month — reads the period and says so; a tile that counts what stands today says it is as at today. A lost lead carries no date it was lost, so with a period chosen it is counted apart. No period is exactly the dashboard as it was. Nothing is stored | Rows 22.16 and 29.11, corrected in their rows; N4 |
| E151 | **The estimated fee is the finance view's own computation.** `expectedFeeFor` is what `expectedFees` runs for every claim at the invoice stage, now run for one claim: the fee controls on the tax adviser's latest signed figure. It is drawn for `invoice.read` alone — ADMIN and ACCOUNTING — only while no live fee invoice exists, says whether the finance view counts it yet, and is UNKNOWN, never nought, where no signed figure is recorded | Row 23.8; no agreed-fee field (8.14); N1 |
| E152 | **The prior-claim position derives YES from one answer, and never derives NO.** Q1 asks whether the client has claimed on the fixtures in this building, and excludes equipment and repairs; a "yes" states the fact, and relieves nobody. Q1a's yes and no answer whether the client knows; "not sure", "no" and a question never asked set nothing. Only a funnel of one property derives anything — Q1 is asked once — and only for the property the funnel wrote, read from the draft, never the answer rows. A derived position refuses a recorded one and clears a stored one, as the jurisdiction does, so **what a later review finds about that earlier claim goes in the prior claim information** | `src/web/funnel-session.ts`'s NOT MAPPED list; N4, asserted both ways |
| E153 | **Mandatory documents are built and switched off, and the table is a recommendation.** Four of the ten Stage 2 documents: the fire risk assessment on every claim, and the grant agreement, the sale contract and the lease where a held fact says so — `GRANTS_EXIST`, `ELECTION_EXISTS`, the property's tenure. A condition not known does not pass and does not excuse. Received means the upload handler received a version on the claim or its property; a request is not a receipt. Which documents, and at which stage, is Lakhbir's question | Build it and switch it off; the list marks items conditional and names no stage |
| E154 | **The nine defects are fixed where they were, not beside them.** The rules form carries `request_type`; the claim form carries the next action so the store refuses it; S2, the retention list and consent history carry the one-person notice; the rules page says each refusal once; the portal sends a file by a multipart POST to the same `/upload/put`, through the same handler and the same single-use key; nobody's claims breaking the one-next-action rule are on the landing page for `pipeline.read`; the words are fixed on the rendered pages; the claims export records what it did not apply; invoice search takes the start of a number. **The seed's claim at INVOICE is on Dunmarrow's branch surgery**, not Elverton's annexe: the surveyor already holds Dunmarrow's job, so no organisation's reach widens, and one test that pinned Dunmarrow's claims at `['SURVEY']` was updated to say so | Every one found on the demo, and each now held by a test over HTTP that goes red when the fix is undone |
| E155 | **Developer Spec section 1 was made true, not corrected: Admin reads the audit log.** `/staff/audit` is ADMIN's — kinds, ids and outcomes, and `detail` is not even read — verifies the chain on every read, and records the read. `npm run verify-audit` recomputes the chain from the database file, writes nothing, and exits 1 when it is broken | `audit.read` was registered and nothing asked it |

## Part E, continued — decisions Phase 129 took, 12 September 2026

| # | Decision | Why |
|---|---|---|
| E156 | **The conveyancing strip keeps a company's name and registered number, strips every individual, and ships off.** It decides what of a parties clause a person has read off the pre-contract enquiry replies or the sale contract may be written onward, and touches neither document's receipt policy, the text kept nor the quarantine. **Off, the capture is today's byte for byte: every party its role token.** On, a party keeps its name only if it is a party to the transaction, its legal form is KNOWN to be a company or an LLP, and the capture backstop's person-name patterns do not match it; a registered number is kept only in Companies House's shape. **A legal form not known and one never recorded read alike, and neither keeps a name.** A sole trader, any partnership and a public body are stripped. **Not built:** the question's wider recommendation that an individual who is the party be kept as a party to our client's transaction. No screen calls it: nothing yet captures a human read of a parties clause | Build it and switch it off; N4. "May company names stay on conveyancing uploads if we strip the individuals?" is the data protection officer's |
| E157 | **A data protection officer role is defined, scoped to the compliance registers, and switched off — no sixth role is enabled.** It would hold the four compliance actions, the disclosure log's reading, the back office's door and its own account, and nothing else: not the audit log, users and roles, settings, a claim, a document or the money. **While its switch is off the authorisation function refuses a DPO actor every action**, exactly as before; the role is not one of the five, role assignment refuses it and the roles table has no row for it, so no user can hold it. **What Lakhbir's answer still decides:** whether it is switched on at all and when — the answer's own three choices; whether its holder is the officer or a compliance assistant; whether it reads the audit log; and whether the one-person notice comes off. Switching it on is three changes: the switch, a migration adding the role row, and the role joining the five | The five-role model is a decision and "Do we need a compliance role separate from Admin?" is Lakhbir's; what can be built before the answer is built and switched off |
| E158 | **A recommended receipt strip for each of the fourteen types, recorded and binding nothing.** The module and migration 021 hold the same fourteen, each with a one-line reason: the engagement letter, our fee invoice, the survey report, the capital allowances report and claim documentation kept whole; the completion statement, a valuation, accounts, a tax computation, a contractor's invoices and plans with the individuals removed and the figures kept, each modelled on the nearest existing policy; survey photographs, correspondence and "other" not accepted as uploads. **No type is bound, so the no-receipt-policy refusal holds for all fourteen, recommended or approved.** **The question's "one line in one migration" is corrected:** binding one is a policy entry of its own in the ingestion module, because one type may carry each policy, and a migration that rebuilds the type table, because SQLite cannot alter the CHECK that lists the eleven policies | The officer approves or amends rather than filling a blank page — "Which receipt strip should each new document type carry before anyone may upload one?" |
| E159 | **The per-disclosure log records each disclosure of a client's personal data — when, to whom, which data, the lawful basis, by whom — and ships off.** Its recipients are "Who we pass client personal data on to" word for word: R1 to R4 and the processors P1 to P7, each with that document's occasion and route; **R5, the registers, is refused as a source, not a recipient.** The bases are the governance policies' section D2, and a processor carries only its Article 28 instruction, held by the store and by the table. No name is written; a wrong row is corrected by a new one naming it, never changed or deleted. Recording is ADMIN's and SALES's; reading is ADMIN's. **Off it records nothing and reads NOT KEPT, never "none"; on, an empty log says since when** | Article 19 is owed to each recipient of each client's data, and the recipients document's section 4 says a static list cannot discharge it; N4 |

---

# PART F — QUESTIONS THIS TABLE RAISED

| Title in CAPREBATE QUESTIONS | Under | Rows |
|---|---|---|
| **"Do we need a login for anyone beyond the five roles — a manager, a technical reviewer, or a read-only viewer?"** | Lakhbir | 8.20, 17.2, 17.5, 17.7 |
| **"When is our fee earned — when the client accepts the report, when their accountant files the amended return, or when HMRC processes the relief?"** — added by CRM 2 of 10 | Lakhbir | 9.15, 9.16, E17 |
| **"Which receipt strip should each new document type carry before anyone may upload one?"** — added by CRM 4 of 10 | The data protection officer | 11.2, 11.3, E34, E158 |
| **"May company names stay on conveyancing uploads if we strip the individuals?"** — cited by Phase 129 | The data protection officer | E156 |
| **"Is anything paid to the accountant?"** — added by CRM 5 of 10 | Lakhbir | 12.10, B4.7, E51 |
| **"What must a referred client be told before we share their claim's progress with the firm that referred them?"** — added by CRM 5 of 10 | The data protection officer | B4.6, E53, E54 |
| **"May the chartered tax adviser's own name be kept on the claim's sign-off record, or only their firm and credential?"** — added by CRM 6 of 10 | The data protection officer | B2.13, E66 |
| **"How long does a client have to pay our invoice?"** — added by CRM 7 of 10 | Lakhbir | 13.6, E87 |
| **"Do we need a compliance role separate from Admin?"** — added by CRM 8 of 10 | Lakhbir | B3.10, E94, E157 |
| **"If money laundering supervision applies to us, what risk-rating scale do we use for a client, and which kinds of claimant must a check cover?"** — added by CRM 8 of 10, for the solicitor; *its title corrected here by CRM 10 of 10 (E141)* | Lakhbir | B3.1, E97 |
| **"Is it right that there is no existing client data to import?"** — added by CRM 10 of 10 | Lakhbir | 29.9, E142 |
| **"Which of the Stage 2 documents are mandatory, and at which stage?"** — added by the CRM follow-on | Lakhbir | 29.5, E153 |

Every other QUESTION row cites a question that already exists under that title.

---

# PART G — THE ROWS CRM 1 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 1 of 10, after the build.** Every row above marked "CRM 1"
names what it is built under; this is where each one's evidence is. CRM 10 of 10 reads this
part when it closes the table. All paths are under `09-app/backend/`.

| Rows | Built in | Proved by |
|---|---|---|
| 1.4, 1.5, 2.2, 2.3, 3.5, 8.1–8.3, 8.7, 8.16–8.19, 8.22–8.25, 9.21, 24.5, 28.1, 28.2 | `migrations/009-crm-backbone.sql` (`claims`, `claim_ref_series`, the backfill), `src/web/crm.ts` (`insertClaim`, `nextClaimRef`, `claimView`, `openClaim`, `updateClaim`) | `test/crm.test.ts` — *the claim record* (four tests: the seed's shape, the reference series and the refusals, the composite foreign key and the stage vocabulary, the funnel's first claim) |
| 3.1, 4.2–4.8, 4.13–4.15, 4.17, 24.2, 22.5, 22.6 | `businesses` extended by 009; `organisationList`, `organisationView`, `updateOrganisation`; `GET /staff/organisations`, `GET|POST /staff/organisations/{id}` | *derive, do not re-key* (legal name, number, claimant type); *DO_NOT_CONTACT* (status list and refusals); the end-to-end test |
| 4.13 — DO_NOT_CONTACT as a control | `isDoNotContact` and the transport in `src/stubs/email.ts`; the `outbox_refuses_do_not_contact` trigger in 009 | *the outbox refuses to queue anything to that organisation* — by id, by channel in any case, by a contact's address, by a client login; at the database twice; and the negative control, which queues once the status is lifted. **Broken on purpose: red** |
| 3.2, 4.9–4.11, 5.5–5.7, 5.9, 5.11–5.13, 22.7 | `contacts` extended by 009; `contactsFor`, `addContact`, `updateContact`; the organisation page's contacts panel | the end-to-end test (a contact of type ACCOUNTANT added, and the user count unchanged); stored cross-site scripting on a contact's notes |
| 3.3, 6.2, 6.4–6.7, 6.9–6.17, 6.21, 22.8, 22.9, 24.3 | `properties` extended by 009; `propertyList`, `propertyView`, `addProperty`, `updateProperty`; `GET|POST /staff/properties/{id}`, `view.json` | *N4* (both readings identical; a zero price refused); *N2* (the guard, and the store's refusal naming `INDIVIDUAL_NOT_RECORDED`); *the jurisdiction is derived and a recorded one refused*, including the clear on a postcode change. **N4 and the derivation each broken on purpose: red** |
| 6.18–6.20 — survey fields on the claim | `claims.surveyor_id`; `claimSurveyors` and `propertySurveyors` in `src/web/crm.ts`; `throughAssignedJob` in `src/authz.ts` | *SURVEYING opens the claim and property of an assigned job, and nothing else — naming a surveyor on a claim grants nothing* |
| 8.10, 8.11, 17.4, 23.1, 23.2, B1.1 — N1 | `claim.read_value` (ADMIN, SALES); `claimValue` read only after it; `view.json` routes | *no sealed estimate field reaches SURVEYING … and ADMIN receives all seven*; `tools/payload-proof.ts` exit 0. **SURVEYING added to `claim.read_value`: two tests red and the proof exited 1** |
| B1.7 — ACCOUNTING reaches money only | `claimView`'s ACCOUNTING branch: client, reference, money | *ACCOUNTING reads a claim as client, reference and money* — its keys pinned, and refused the organisation and the property |
| B1.6 — deny by default | twelve new rows in `src/authz.ts` | *each new action admits exactly the roles granted it, and REFUSES every other role*; a disabled user refused every one; the existing *every registered action is refused for at least one role* |
| B1.8, 18.1, 18.2 — every write audited, no value in a line | seven kinds in `src/audit.ts`; `record()` in `src/web/crm.ts`; the close's `CLAIM_CREATED` in `src/web/router.ts` | the end-to-end test: the kinds present, no written value in any detail, and the chain verifies |
| B1.15 — escape every staff-supplied field | `src/web/crm-pages.ts`, all through `h`; a website shown as text | *STORED CROSS-SITE SCRIPTING* — a contact's notes, a property's construction notes, a claim's next action |
| 16.6 — clickable relationships (the CRM 1 half) | organisation ↔ property ↔ claim links, each drawn only where the reader may open the target | the end-to-end test walks organisation → property → claim |
| 21.4 — API-capable | `GET /staff/claims/{id}/view.json`, `GET /staff/properties/{id}/view.json` | the N1 test and the payload proof read them |
| 27.1 — without duplicating information | the whole of the above | *SALES does all four over HTTP* — one organisation, two properties, two claims, two contacts, no second business row |

**Rows marked "CRM 1" that are not in this part** are rules about what is NOT built — 4.9's
missing column, 6.8's missing column, 8.8 and 8.9 read from the property — and each is true by
the absence the row describes.

---

# PART H — THE ROWS CRM 2 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 2 of 10, after the build.** All paths are under `09-app/backend/`.

| Rows | Built in | Proved by |
|---|---|---|
| 3.4, 7.1–7.7, 7.9–7.12, 9.1, 9.2, 22.3, 22.4, 24.4, D10 — leads, not a second intake | `migrations/010-leads-and-pipeline.sql` (`leads`, `reason_lists`, the backfill); `src/web/leads.ts` (`leadList`, `leadView`, `createLead`, `updateLead`, `convertLead`, `openLeadForSubmission`, `linkBookingToLead`, `backfillLeadFor`); `submit()` in `src/web/assessment.ts`; the close in `src/web/router.ts`; `src/web/pipeline-pages.ts` | `test/leads.test.ts` — the seed's leads; conversion asked again at the write; a referral linked, and refused onto an assessment another lead holds; conversion final and a lead never deleted; a lost reason listed; SALES end to end over HTTP. `test/crm.test.ts` — the funnel records a lead and no claim. `test/pipeline.test.ts` — migration 010's backfill |
| 7.8, 8.15, 25.10 — no score, no probability | nothing: no such column | `test/leads.test.ts` — *NO SCORE AND NO PERSON*, reading the table's columns |
| 9.3, B1.4, B1.9 — the enquiry gate | `enquiry_checks` (010); `enquiryGate`, `recordEnquiryCheck`, `enquiryEvidence` in `src/web/pipeline.ts` | `test/leads.test.ts` — on the seeded referral a recorded UNKNOWN and a never-asked check read identically and neither qualifies; a NO refuses; an answer is required; append-only. `test/pipeline.test.ts` — the claim's ENQUIRY skip test, both readings and their two refusals word for word |
| 0.1, 8.16, 9.6, 9.8, 9.10, 9.12, 9.13, 9.14, 9.17, 24.6, 27.2, 29.3, 29.4, C6, B1.10, B4.10 — the procedure's stages and gates | `src/web/stages.ts` (`PROCEDURE_STAGES`, `EXITS`, the client mapping); `src/web/pipeline.ts` (`gateOut`, `moveClaim`, `MILESTONES`); the two replaced triggers, `claim_stage_moves`, `claim_milestones` (010) | `test/pipeline.test.ts` — every stage, gate, owner and exit found in the procedure's own file; the vocabulary, with the table not rebuilt; **one skip test per gate, ten in all, each with its negative control**; one stage at a time; the board's move button refused over HTTP |
| 9.9 — no claimable figure before the sign-off | `signOffNeed`, `claimableFigureReleased`; `claims.tax_adviser_signoff_at` (010), written by nothing | `test/pipeline.test.ts` — shut for ADMIN and SALES; no confirmation stands in; a scan of `src/` finds nothing that writes the column; the portal names no claimable figure |
| 9.15, 9.16 — the fee trigger | `FEE_TRIGGER`, `FEE_TRIGGERS` in `src/web/pipeline.ts` | `test/pipeline.test.ts` — the INVOICE gate under all three readings, and refused with no invoice raised |
| 8.24–8.26, 9.18–9.21 — exits, holds, completion | `moveClaim` EXIT, HOLD, RESUME and REOPEN; the ON_HOLD and completion triggers (010) | `test/pipeline.test.ts` — *EXITS KEEP THE RECORD*: five tests, including OUTSIDE_AMENDMENT_WINDOW from every one of the ten stages and from a hold |
| 18.2 — stage moves audited | `CLAIM_STAGE_MOVED` in `src/audit.ts`; `claim_stage_moves` | the exit test — who, from, to and the reason's code in the audit line, the note never in it, the chain intact; the refused move audited over HTTP |
| 22.11, 23.3 — the board and the claim's pipeline panel | `pipelineBoard`, `boardCard` in `src/web/crm.ts`; `pipelinePanel` in `src/web/pipeline.ts`; `src/web/pipeline-pages.ts`; `pipelineBlock` in `src/web/crm-pages.ts` | `test/pipeline.test.ts` — a column per stage and an ON_HOLD lane; a card's fields; no value and no move on a card built for SURVEYING, ACCOUNTING or CLIENT |
| 6.20, E14 — surveyor reach by the job's claim | `surveyor_jobs.claim_id` and its triggers (010); `claimSurveyors` in `src/web/crm.ts` | `test/pipeline.test.ts` — *SURVEYOR REACH*; `tools/payload-proof.ts` |
| B1.1 — N1 | `tools/payload-proof.ts`, extended to every CRM 2 route | exit 0: SURVEYING 0 of 7 on every route, refused all seven new routes, its pipeline panel exactly stage and steps; ADMIN 7 of 7 on the lead's `view.json` and a value on the board |
| B1.6 — deny by default | six rows in `src/authz.ts` | `test/pipeline.test.ts` — *WHO MAY DO WHAT*, every role on every new action, a disabled user, and the refusals over HTTP |
| B1.15 — escape every staff-supplied field | `src/web/pipeline-pages.ts`, `src/web/crm-pages.ts`, all through `h` | `test/leads.test.ts` — *STORED CROSS-SITE SCRIPTING*: a referral's name, a next action, a hold reason, on four pages |
| E11 — the organisation's stage | `raiseBusinessStage` in `src/web/pipeline.ts` | `test/pipeline.test.ts` — raised by a move, not lowered by a reopen, a PAID organisation left PAID; the engaged-client tests unchanged |

**Broken on purpose, one at a time, each file restored byte-identical and checked by hash.** The
engagement gate made to read open — one red. A recorded UNKNOWN and a never-asked check made to
pass — three red, across both new files. The sign-off gate made to read open — two red. A value put
on every board card whatever the reader — one red. The full pipeline panel built for every reader —
the payload proof printed FAIL and exited 1. A surveyor's reach put back through the assessment —
one red. Restored: every file matched its hash and both new files ran green.

---

# PART I — WHAT THE GATED-EXIT REPAIR BUILT, WITH THE FILE AND THE TEST

**Written at the close of the gated-exit repair, 11 September 2026, after the build.** It is not a
CRM phase and adopts no row of the two documents: it repairs the intake the lead model stands on,
which CRM 2 of 10 found broken. Paths are under `09-app/backend/` unless they say otherwise.

| What | Built in | Proved by |
|---|---|---|
| **The funnel's only gate stops, reading the engine's own field** | `nextScreen`, `isGatedExit` and `PAST_THE_GATE` in `src/web/assessment.ts`; the assessment routes in `src/web/router.ts`; the `Q1bGate` declaration in `09-app/engine/src/generated/shared.d.ts`, which is hand-written beside the generated slice — the engine is untouched and the extraction verifier is green | `test/gated-exit.test.ts` — *no* and *charity* stop; over HTTP *no* lands on the reasoned negative, and the figure, `Q1c`, `Q2` and `Q3` redirect there on GET and POST. **Red before the repair**: `nextScreen` returned `Q1c`, and the POST redirected to `Q1c` |
| **N4 at the gate, both readings** | the same | *not sure* and never-asked read identically, continue to a figure carrying the condition, and are never shown the reasoned negative |
| **The reasoned negative names its gate** | `gatedExitPage` in `src/web/router.ts` — the site's own screen, ported | the page carries the engine's message word for word |
| **The call from the reasoned negative is kept** — E22 | `migrations/011-gated-exit-lead-contact.sql` (`contacts` and `bookings` rebuilt with `lead_id`; `assessment_drafts.closed_lead_id`); `closeGatedExit` in `src/web/assessment.ts`; `openLeadForGatedExit` in `src/web/leads.ts`; `writeBookingAndContact` in `src/web/router.ts` | **the reproduction — red before the repair, answering 500**; a GATED_EXIT lead with no organisation, its own contact and booking, and no business, assessment or estimate; the audit line carries ids only; the replayed draft writes nothing; a close with no name, channel or consent is refused and writes nothing |
| **No range the prospect was never shown** | `gatedThankYouPage`, and the gated-exit offer on `closePage`, in `src/web/router.ts` | no range, no pound sign, no "assessment has been recorded"; the form does not carry the funnel close's words about a figure |
| **The call is where staff look, and its slot is held** | `BOOKING_SELECT` and `decorate` in `src/web/backoffice.ts`, now left joins; `contactForLead`; *Who asked* on the lead page (`src/web/leads.ts`, `src/web/pipeline-pages.ts`); the booking page's link to its lead (`src/web/staff.ts`); the booking and contact objects and `ownBusiness` in `src/authz.ts` | on the seed, over HTTP: the slot held where `isBookable` looks; the call in the week's calendar; the booking links to its lead; SALES sees who asked; SURVEYING is refused the lead |
| **Conversion moves the same rows** | `convertLead` in `src/web/leads.ts`; the four `*_lead_same_organisation` triggers in migration 011 | no row copied; the contact and the booking on the organisation, and the lead holding its booking; a lead's row refused onto another organisation |
| **Nothing lost in the rebuild** | migration 011, following migration 007's twelve steps and its guard | a row with neither an organisation nor a lead refused; every index and trigger read back by name; no foreign-key violation; **the DO_NOT_CONTACT trigger still refuses through a contact's address** |
| **N1** | nothing new that a surveyor can reach | `tools/payload-proof.ts` exit 0 |

**Broken on purpose, one at a time, each file restored and checked by sha256.** The renderer
reading `stop` again — six red. *Not sure* alone treated as gated — two red. An absent answer alone
treated as gated — two red, so each N4 reading is guarded on its own. The calendar's join put back
to an inner join — one red. The outbox's DO_NOT_CONTACT trigger left out of migration 011 — one
red. Restored: every file matched its hash, and the file ran nine of nine green.

---

# PART J — THE ROWS CRM 3 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 3 of 10, 11 September 2026, after the build.** All paths are under
`09-app/backend/`.

| Rows | Built in | Proved by |
|---|---|---|
| 3.6, 10.1–10.4, 10.6, 21.7, 22.12, 24.7, 27.4 — staff tasks, distinct from client questions | `migrations/012-staff-tasks-automation-templates.sql` (`staff_tasks`, its triggers and its two partial unique indexes); `src/web/tasks.ts` (`createTask`, `updateTask`, `setTaskStatus`, `insertTask`, `taskPage`, `openTasks`); `src/web/tasks-pages.ts` | `test/tasks.test.ts` — *STAFF TASKS*: no foreign key between the two tables and nothing written to `client_tasks`; a task about nothing, a property of another organisation and a word not on a list refused at the store and the table; cancelled with a reason and never deleted; a closed task keeps its record; a monthly recurrence creating its next once, on completion, and the next action carrying over |
| 1.2, 8.23, 23.4, 28.4 — one next action per claim (E23, E27) | `nextActionReading`, `nextActionRefusal`, `setNextAction`, `validNextAction`, `writeNextAction`, `nextActionBreakers` in `src/web/tasks.ts`; `nextActionFor` in `moveClaim`, `src/web/pipeline.ts`; `CLAIM_SELECT` in `src/web/crm.ts`; migration 012's carry-over and retirement | *ONE NEXT ACTION — THE REFUSAL*: none, unowned and undated each refused with the stage unmoved and the attempt audited, each with its negative control; a next action carried on the move; a hold refused and an exit allowed; the gate's refusal still the gate's; a second next action refused by the database. *THE BREAKERS LIST* on the seed, with who is waiting equal to the engaged-client list's row and a source check that there is no second ladder. Migration 012 on a database migrated to 011 |
| 10.5, 14.8, 15.13, B1.13 — overdue, UTC stored and UK shown (E26) | `dueReading`, `NO_DUE_DATE` in `src/web/tasks.ts`; `client_tasks.due_on` (012); the due date on the question form in `src/web/engaged-pages.ts`; `claimTaskPanel`, `myWork` | *OVERDUE*: at 00:30 BST on 11 September a task due on the 10th is overdue by the UK date where the UTC date says otherwise; no due date is neither; no new file names a zone. Over HTTP on the seed, a task and a client question flagged on the claim, on the owner's list and on the landing page |
| 22.2 (the CRM 3 half), D11's "my tasks" — my tasks for every staff role | `myWork` in `src/web/tasks.ts`; `myTasksBlock` in `src/web/tasks-pages.ts`; `homePage` in `src/web/staff.ts` | over HTTP: Accounting, Surveying and Admin each see their own seeded task and not Sales's; a client is refused the back office |
| 2.4, 10.7, 16.6, 19.5, 23.6, 23.9, 4.17, 18.1 — the timeline, a read (E31) | `src/web/timeline.ts` (`timelineFor`, `timelineIfPermitted`); `internal_notes.claim_id` and `property_id` (012); `addNote` in `src/web/engaged.ts`; the panels in `src/web/crm-pages.ts` and `src/web/pipeline-pages.ts` | *THE TIMELINE IS A READ*: migration 012 adds no event, timeline or activity table; a claim, an organisation and a property drawn from the tables that hold each event, notes apart in the data, what the client sees marked, invoices only for `invoice.read`; *ACCOUNTING financial only, SURVEYING an assigned job's claim only, CLIENT none*; *THE GATED-EXIT LEAD*'s call and person on the lead's timeline, and on the organisation's once the rows move |
| 5.11, 5.12 — last contact derived, follow-up a task (E25) | `lastContactFor`, `NO_CONTACT_RECORDED` in `src/web/timeline.ts`; `followUpsFor` in `src/web/tasks.ts`; `contactView` and `contactValues` in `src/web/crm.ts`; migration 012's carry-over and four contact triggers | *N4*: never contacted, a cancelled call and an unsent email read identically; a completed call is a contact; both old fields refused by the store and the database; migration 012 keeping a recorded last contact |
| 14.1–14.10, 20.5, D1, B1.5, B1.11, B1.12 — automation rules, and what none may do (E28, E29) | `automation_rules` and `automation_runs` (012) with nine seeded rules; `src/web/automation.ts` (`fireAutomation`, `rulesPage`, `createRule`, `updateRule`, `FORBIDDEN_EFFECTS`); the calls from `moveClaim`, `createLead`, `updateLead`, `convertLead`, `openClaim`, `updateClaim`, `updateTask`, `setTaskStatus` and the funnel's two closes in `src/web/router.ts` | `test/automation.test.ts` — the seeded rules and where each came from; a GATED_EXIT lead's follow-up and a rule needing an organisation recorded NOT_RUN; information-request tasks equal to the derived missing list, DONT_KNOW and SKIPPED alike, not asked twice; valuation, report, follow-up and finance tasks; notices to the owner and not to the person who made the change; **every forbidden effect refused by name and by the table**; the whole procedure walked with every rule active and no gate, switch, engagement, research or outbox changed; a DO_NOT_CONTACT organisation with its negative control; a non-staff owner not written to; a failing rule recorded ERROR with the move standing |
| 19.2–19.4, 24.14 — email templates (E30) | `email_templates` (012) with one seeded template; `src/web/templates.ts` (`templateRefusal`, `mergeValues`, `mergeText`, `queueTemplate`); `kind: 'TEMPLATE'` in `src/stubs/email.ts` | *EMAIL TEMPLATES*: a name escaped, a missing address a visible gap, no line break in a subject, a claim with no property and a property with no address read the same, and a recorded address merging; bank details, an invoice and an unknown field refused by the store, the table and the merge; the outbox only, DO_NOT_CONTACT refused with its negative control, Accounting and Surveying refused |
| B1.1 — N1 | `tools/payload-proof.ts`, extended to every CRM 3 route (E32) | exit 0: SURVEYING 0 of 7 on four new routes and refused seven more, its claim view's tasks its own and its timeline limited; ADMIN 7 of 7 on the claim view carrying the tasks and the timeline |
| B1.6 — deny by default | ten rows and five object types in `src/authz.ts` | *WHO MAY DO WHAT*: every role on every new action, a disabled user, the own-or-team and assigned-job predicates, a predicate failing closed; the task, rule and template pages over HTTP |
| B1.8, 18.2 — every write audited, no value in a line | eleven audit kinds in `src/audit.ts` | the cancellation's reason nowhere in the audit log and the chain intact |
| B1.15 — escape every staff-supplied field | `src/web/tasks-pages.ts`, `src/web/crm-pages.ts`, all through `h` | *STORED CROSS-SITE SCRIPTING*: a task's title and description and a note on a claim, on the claim page, the task page, the task list and the landing page |

**Broken on purpose, one at a time, each file restored and checked by sha256.** The one-next-action
refusal switched off — one red. The DO_NOT_CONTACT guard taken out of the rule runner — one red.
Accounting given the staff events on a claim timeline — one red. Merged template values left
unescaped — one red. Overdue judged on the UTC date — one red. A cancelled call counted as a contact
— one red. **A seventh attempt proved nothing and is recorded for that reason**: the first edit meant
to widen the timeline did not change who counts as staff, because of operator precedence, and the
suite stayed green; it was replaced by the edit above, which went red. Restored: every file matched
its hash, and both new files ran thirty-two of thirty-two green.

---

# PART K — THE ROWS CRM 4 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 4 of 10, 11 September 2026, after the build.** All paths are under
`09-app/backend/`.

| Rows | Built in | Proved by |
|---|---|---|
| 11.2, 11.3, E34, E35 — types, configurable, seeded | `migrations/013-documents-on-the-claim.sql` (`document_types`: twenty-five seeded, one per receipt policy by partial unique index, a policy bound only by a migration); `typeList`, `createType`, `updateType`, `receivableTypes`, `stripReading`, `retentionReading` in `src/web/documents.ts`; `/staff/document-types` in `src/web/documents-pages.ts` | `test/documents.test.ts` — *TYPES*: every handler type exactly once, with RET-7; every CRM-list type with no receipt policy and an UNSET clock; a type an administrator adds refused a link before one is issued, refused as a request, and refused a policy at the table; the value flag never unset and never on claim evidence, by the store and the table |
| 11.1, E37 — links | `document_links` (013) and its three triggers; `linkDocument`, `unlinkDocument`; a request raised on a claim linking what answers it | *LINKS*: one lease on two claims; another organisation's claim refused by the store and the table; an ended link kept, and refused deletion and a second ending; the link and its end on the timeline; no column in the three new tables that could hold a person |
| 11.4–11.6, E39–E41 — versions, nothing overwrites, a clock per version | `logical_documents`, five columns on `documents` and four triggers (013); `startDocumentUpload`, `derivedFilename`; `VersionColumns` in `src/web/uploads.ts`; the uploads already held carried as version 1 each | *VERSIONS*: version 1 byte for byte unchanged by version 2; both on the page, newest first; version 1 keeping RET-7 when version 2 arrives UNSET; a version of another type refused; a version's number, name and clock, and its deletion, refused at the table; a skipped number refused. *THE STRIP OVER EVERY TYPE*: all eleven receivable types through the one handler — steps 1 to 7 in order, the strip and the discharge recorded, the quarantine object gone, the name derived — and all fourteen others refused before a link |
| 9.4, 9.5, 11.8, E42, E43 — requests, RECEIVED by an upload | `client_tasks` extended (013), `client_tasks_received_only_by_upload` and four more triggers; `createDocumentRequest`, `receiveByUpload`, `withdrawDocumentRequest`, `requestsFor`; `finishUpload` receiving, `issuedJob`, and `PUT /upload/put` running steps 3 to 7; the refusals in `answerTask` (`src/web/portal.ts`) and `answerTaskHere` and `withdrawTask` (`src/web/engaged.ts`) | *REQUESTS*: the portal's click, "answer here" and a hand-written row all refused, and a row naming a document of another type; an upload of another type not receiving it; an upload of its type receiving it, audited without its words; a received request not withdrawn, by the store and the table; a withdrawn one not received; a type with no policy refused by the store and the table. **Over HTTP**: the client takes a link from the portal, PUTs the file, the request is received and the running application ran every step; the same link again answers 409 and nothing returns to quarantine |
| E28's document-requested trigger, E46 — the automation | the `fireAutomation` call in `createDocumentRequest` | *THE AUTOMATION*: with no rule, nothing runs; with one, a run recorded against the claim with its task |
| E26's document requests — overdue by the UK date | `dueReading` on `client_tasks.due_on` in `requestView`; `document_requests_outstanding` in `myWork` (`src/web/tasks.ts`); `myTasksBlock`; `claimDocumentsBlock` | *OVERDUE*: at 00:30 BST a request due the day before is overdue where the UTC date says it is due today, on the claim and on the owner's list; no due date neither overdue nor on time, on both; over HTTP, OVERDUE on the landing page and the claim page |
| 11.9, B1.6, E36, E38, E44, E45 — who may see what | nine actions and four reader predicates in `src/authz.ts`; `documentObj`, `versionObj`; the portal's `document()`, `documents()` and a surveyor's evidence panel asking `document.read`; the claim view's `documents` for every reader | *WHO MAY DO WHAT*: every role on every new action and a disabled user; `document.read` per role per reader class; a surveyor off the job, another organisation's client, a value-carrying document and an object without the fields refused. *ROLES ON THE WIRE*: Admin, Sales, Accounting and Surveying on a lease, the fee invoice and the letter over HTTP, the letter reaching Accounting only once signed, the refusals audited; Accounting's claim view the invoice and the letter, a surveyor's the lease and no requests; the original Admin's alone |
| 2.4, 10.7 — the timeline (E47) | `clientQuestions`, `documents` and `documentLinks` in `src/web/timeline.ts`, each document asked of `document.read` | a request, its receipt and a link on the claim's timeline; *NOT A SECOND LOG*: migration 013 creates exactly three tables, none a log, and rebuilds nothing |
| B1.1 — N1 | `tools/payload-proof.ts`, extended to every CRM 4 route | exit 0: SURVEYING 0 of 7 on a document's page and `view.json`, its documents panel the job's lease alone with no requests, and eight routes refused; ADMIN 7 of 7 on the claim view with the documents inside, and 0 of 7 on two document `view.json` routes that build no estimate for anyone |
| B1.8, 18.2 — audited, never the words | eight audit kinds in `src/audit.ts` | what a request says it is for nowhere in the audit log; refused reads recorded |
| B1.15 — escape every staff-supplied field | `src/web/documents-pages.ts` and the portal page in `src/web/router.ts`, all through `h` | a request's "why" and "what it holds up", carrying a script tag, escaped on the claim page and in the portal |

**Broken on purpose, one at a time, each file restored and checked by sha256.** A surveyor admitted to
every reader class on an assigned job — three red, and the payload proof printed FAIL. Accounting admitted to
the unsigned letter — two red. The table's refusal of a request marked received with no upload switched off —
one red. A clock nobody set and a clock not on the list made to read differently — one red. An upload of
another type made to receive the request — one red. Restored: every file matched its hash, and the new file
ran eighteen of eighteen green.

---

# PART L — THE ROWS CRM 5 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 5 of 10, 11 September 2026, after the build.** All paths are under
`09-app/backend/`.

| Rows | Built in | Proved by |
|---|---|---|
| 12.1–12.5, 12.14 — the firm and its people, never a user | `migrations/014-introducers-and-referrals.sql` (`introducers`; `contacts` rebuilt with `introducer_id`, a person on a firm alone and typed INTRODUCER); `createIntroducer`, `updateIntroducer`, `addIntroducerContact`, `updateIntroducerContact` in `src/web/introducers.ts`; `/staff/introducers` in `src/web/introducers-pages.ts` | `test/introducers.test.ts` — *NEVER A USER*: a referral makes a firm and a person and no login, and no introducer table has a column a login would need; *THE SCHEMA*: a person at a firm on anything else, or typed otherwise, refused; a person never moved between firms |
| 12.12, 12.13, E48 — last and next contact | `staff_tasks` rebuilt with `introducer_id` (014), the activity pair replaced for the three reciprocity kinds; `logContact`, `planContact`, `lastContact`, `nextContact`; a task on a firm in `src/web/tasks.ts` | *THE DASHBOARD*: a logged call is the last contact; a planned contact overdue by the UK date, on its owner's list, "about" the firm; *THE SCHEMA*: a task on a firm and an organisation refused, another firm's person refused, every staff-task trigger read back by name; `test/tasks.test.ts` still refuses a second activity table |
| 7.1, 7.12, E52 — referral intake | `intakeReferral`; `leads` gains three property basics and the trigger pair that is `introducer_id`'s foreign key, and a referral source by trigger (014); `updateLead` attributes a lead to a firm; `convertLead` clears the basics | *REFERRAL INTAKE*: origin REFERRAL, source derived, the firm set, no person on the lead, audited without a name; N4 — only the name required, the rest not given stays not given; a tax adviser refers as ADVISER and a firm of unrecorded kind as REFERRAL; conversion only once linked, the basics cleared and the firm kept; *THE SCHEMA*: a firm that does not exist refused on insert and update, a firm never deleted, a referred lead's source not changeable to WEBSITE |
| E54 — the public referral form | `REFERRAL_FORM`, `referralFormOpen`; `/refer` in `src/web/router.ts`; `ServerOptions.referralForm` | *THE PUBLIC FORM*: shut, `/refer` answers exactly as a path that does not exist and writes nothing; open, the confirmation or nothing, a new firm row never matched, a script escaped |
| B4.6, E49, E50, E53, E58 — the opt-in and the notices | `introducer_share_consents`, `introducer_notices` and `introducer_notices_queued_only_under_the_opt_in` (014); `recordShareConsent`, `shareReading`, `evaluateNotice`, `onClaimStageEntered` called from `apply` in `src/web/pipeline.ts`, `onLeadConverted` from `convertLead`; the lead page's referral block | *SHARING PROGRESS*: at the engaged stage never asked and a no queue nothing and read identically, a yes queues one notice with no person and no figure; a withdrawal shares nothing more; a notice queued once; a yes on a referral with no claim tells the firm it is referred, once; no address and DO_NOT_CONTACT keep it not queued; **the database refuses a queued notice under a no or a superseded yes**; an opt-in only for the referring firm, only with the current words, never assumed; every notice maps to its stage and back |
| B4.6 — the reasoned negative | `evaluateNotice` reading the exit's listed reason | *THE REASONED NEGATIVE*: a real exit through `moveClaim` queues nothing without the yes, and with it the listed reason and never the note; a template reaches no person at a firm |
| 12.10, B4.7, E51, E55 — the reward model | `introducer_reward_setting`, `introducer_fees` and their triggers (014); `setRewardModel`, `clauseOneBlanks` reading `loadLetter().openTerms`, `accrueFee`, `recordFeeDisclosure`, `recordFeeSettled`; `/staff/introducer-rewards` | *THE REWARD MODEL*: off as shipped; the real letter's clause 1 has a blank; A and B refused and audited `CLAUSE_1_BLANK`, and a complete clause 1 lets A on; reciprocity refused while A is off by the store and the database, and on anything but a firm even under A; under B a referred claim that closes accrues the fixed fee once, to the firm, with no column for a person; nothing payable before the disclosure, by the store and by CHECK; `test/finance.test.ts` still refuses a payment-named action |
| 12.6–12.9, 12.11, 12.15, E57 — the dashboard | `pipelineFigures`, `valueReading`, `moneyReading`, `introducerList`, `introducerView` | *THE DASHBOARD*: three referred, two opened, one won and one reasoned negative; the value not known and counted apart, never nought; Sales no money; Accounting exactly the firm's name, the money, the fees, the reward and nothing else; no figure column on the firm; a surveyor refused |
| B1.1 — N1 | `tools/payload-proof.ts`, extended | exit 0: ten introducer routes refused as SURVEYING and nothing left behind; a firm's view.json as ADMIN carries none of the seven by name |
| B1.15 — escape every supplied field | `src/web/introducers-pages.ts`, the lead page, the public form | *OVER HTTP*: a firm's name and notes carrying a script escaped on the list, the firm's page and the lead page |
| E56 — the flake | every test server and the payload proof bound to 127.0.0.1; the funnel close's assertion reports who answered | *THE FLAKE*: no test file listens on every address; three full runs, 529 of 529 each |

**Broken on purpose, one at a time, each file restored and checked by sha256.** Never asked read as a yes —
nineteen red. Clause 1 read as complete — the switch refusal red. A test server listening on every address
again — the guard red.

# PART M — THE ROWS CRM 6 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 6 of 10, 11 September 2026, after the build.** All paths are under
`09-app/backend/`. Every test named is in `test/claim-record.test.ts` unless another file is named.

| Rows | Built in | Proved by |
|---|---|---|
| B2.1, B2.2, B2.3, B2.17, E59, E60 — the claimant, the nation, the Scottish taxpayer, the prior claim; derived first, with the source | `claimantTypeReading`, `jurisdictionReading`, `acquisitionDateReading`, `captured`, `recordFact` in `src/web/claim-facts.ts`; `claim_facts` (`migrations/015-claim-facts-figures-and-aftercare.sql`); `claimantTypeForGate` and `propertyJurisdiction` in `src/web/crm.ts` | *THE FACTS PANEL*: a derived fact carries its source and a recorded one is refused; N4 — a recorded not known and never asked read identically; the store append-only, never a zero, never a value beside UNKNOWN |
| B2.4, E61, E62 — the accounting period and the amendment window | `amendmentWindowReading`, reading `amendmentWindow` in `src/web/engine.ts` (CB_CASH); `reportsWindowNeed`, `invoiceWindowNeed` in `src/web/claim-record.ts`; the REPORTS and INVOICE gates in `src/web/pipeline.ts` | *THE AMENDMENT WINDOW*: UNKNOWN on an absent and a not-known input, a charity, a claimant never recorded and a date outside the period; the engine's company and self assessment dates. *ON THE GATES*: REPORTS needs it open, INVOICE the filing inside it, UNKNOWN passing neither |
| B2.5, E63, E73 — the election and the prior owner chain | `ELECTION_*` facts; `electionResolved`, reading `electionNotifiedInTime` (CB_ELECTION, s.201(1) and (1A)); `claim_owner_chain`, `recordOwner`, `withdrawOwner`; the DATA_GATHERING gate | *DATA_GATHERING*: absent, not known, a part missing, a clock that cannot be read and a late notice refuse; a tribunal application with its status never asked or not known relieves nothing, undetermined in time does; NO and a YES in time pass. *THE OWNER CHAIN AND THE GRANTS*: a person refused, one owner per position, withdrawn and never deleted |
| B2.6, E72 — grants traced to cost elements | `claim_grants`; `recordGrant`, `withdrawGrant`, `grantsTraced`; the VALUATION gate | *VALUATION*: absent, not known, a YES with none, a grant not known to be traced and a NO with a grant still recorded refuse |
| B2.7, B2.8, B2.9, B2.10, B2.11 — headroom and profit, the pool split, the structures allowance, acquisition costs and the transaction tax, the buyer's alterations | `sufficientProfitReading` through `sessionFromFunnel` and `FUNNEL_SWITCHES`; the captured facts; `switchLine` reading `ctaSwitchReadings` | *THE FACTS PANEL*: profit derived from the client's answer and refused as a recorded one; break-even, with its switch off, derives nothing and is captured; the stamp duty and alterations switches shown off |
| B2.12, E64, E65 — the four figures | `figuresPanel`, `researchedEstimateReading`, `commitmentOnClaim` in `src/web/claim-record.ts` | *THE FOUR FIGURES*: A from the sealed estimate with its hash; B NOT_PERMITTED_YET naming each shut gate, still so with a signed letter, and carrying no figure; C and D sealed with their hashes; refused to Accounting, a surveyor and a client; no figures table and no column for a researched estimate |
| B2.13, B2.14, E66 — the sign-off record, against the surveyor's commitment | `tax_adviser_signoffs` and the two triggers retiring `claims.tax_adviser_signoff_at` (015); `recordSignOff`, `signOffSinceEntry`, `signOffRecordNeed`; `signOffNeed` and `claimableFigureReleased` in `src/web/pipeline.ts` | *THE SIGN-OFF RECORD*: refused off its stage, against another claim's commitment, with a person's name, without its parts, dated ahead or confirming a switch that does not exist; hashed, never changed; the audit line carries no adviser. *THE GATE OPENS ONLY ON THE RECORD*: not the retired column, not a confirmation, not another claim's record, not one from before a reopen. `test/pipeline.test.ts`: TAX_ADVISER_SIGNOFF → REPORTS |
| E67 — the reconciliation log | `claim_reconciliations` (015); `recordFiling`, `recordVariance`, `recordOutcome`, `varianceOf`, `reconciliationView` | *THE RECONCILIATION*: opens with the first sign-off; the snapshot fixed; the quote gap not known and never zero; the tag before the close; each step once; the outcome derived from a closed enquiry and from the window lapsing |
| 9.11, B2.15, E69, E70 — the deliverables register and the client release | `claim_deliverables` (015); `recordDeliverable`, `deliverablesPanel`, `clientDeliverables`; `clientDeliverable` and `clientDocument` in `src/authz.ts`; `releasedToClient` in `src/web/documents.ts`; the portal's list in `src/web/router.ts` | *THE DELIVERABLES REGISTER*: not started, draft, issued, superseded, forward only; no report stating a figure before the sign-off; none can be stored yet. *THE DEFENCE PACK*: its hash required, never changed. *THE CLIENT REPORT RELEASED*: both ways, on the document and on the register. *THE REASONED NEGATIVE*: told through its deliverable, the portal's stage unmoved |
| B2.16, B4.5, E74, E75, E76 — aftercare | `hmrc_enquiries` (015); `openEnquiry`, `closeEnquiry`, `FEE_CLAWBACK`, `clawbackReading`, `clauseThirteenBlanks`, `raiseDisposalTask`; `properties.sale_in_prospect` and the hook in `updateProperty` | *AFTERCARE*: an enquiry opened once and closed once; clause 13 off, refused on while the real letter's clause is blank, a finance task only on and complete; a disposal date or a sale in prospect raises one task pointing at the Disposal Note, never asked, no and not known raise nothing |
| E68 — the gates CRM 2 of 10 left as confirmations | `gateOut` and `MILESTONES` in `src/web/pipeline.ts` | `test/pipeline.test.ts`: DATA_GATHERING, VALUATION, REPORTS, INVOICE and DEFENCE_PACK, each ending in its negative control; `test/automation.test.ts`: the whole procedure walked with every rule active. *THE CONFIRMATIONS*: DEFENCE_PACK's retired, the others no longer naming what a fact decides |
| B1.1, E71 — N1 | `RELEASED_FACTS_TO_SURVEYOR` and `assembleReleasedFacts` in `src/payload.ts`; `releasedFactReader`; `tools/payload-proof.ts`, extended | *SURVEYING RECEIVES THE RELEASED INPUTS ALONE*, with SALES as the negative control; the payload proof exits 0 — the released facts only, none of the proof's amounts and none of the seven on the job's claim, seven CRM 6 routes refused and nothing left behind, and ADMIN's view carrying all of it |
| B1.6, E77 — deny by default | nine actions in `src/authz.ts` | *WHO MAY DO WHAT*: every role on every action, a disabled user refused, Accounting on none; the surveyor only through an assigned job; the client's deliverables both ways |
| B1.8 — audited | twelve audit kinds in `src/audit.ts` | the sign-off's audit line carries no adviser, and the chain verifies |
| B1.15 — escape every supplied field | `src/web/claim-record-pages.ts` | *OVER HTTP*: a script recorded as a fact drawn escaped on the claim page; a surveyor and an accountant refused every new route, writing nothing |

**Broken on purpose, one at a time, each file restored and checked by sha256.** An amendment window with an
input missing read as open — two red. A sign-off from before a reopen counted — one red. An amount leaked through a
released key — one red, and the payload proof FAIL. A grant not known to be traced read as traced — one red.

# PART N — THE ROWS CRM 7 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 7 of 10, 11 September 2026, after the build.** All paths are under
`09-app/backend/`. Every test named is in `test/finance-claim.test.ts` unless another file is named.

| Rows | Built in | Proved by |
|---|---|---|
| 13.12, E78 — an invoice belongs to a claim | `invoices` rebuilt with `claim_id` and its composite foreign key (`migrations/016-finance-on-the-claim.sql`); an organisation's old rows kept and never moved | *THE INVOICE GATE reads this claim's invoice*: an organisation's, another claim's, a cancelled one and one credited in full open nothing; `test/pipeline.test.ts` INVOICE → DEFENCE_PACK |
| 13.1, 13.2, 13.3, 13.5, 13.7, B4.1, E79, E80 — raising our fee | `raiseInvoice` in `src/web/invoices.ts`; `feeTriggerReached` and `liveFeeInvoiceCount` in `src/web/pipeline.ts`; `computeFee` in `src/web/fee-controls.ts` | *raised on a claim at INVOICE*: 5% of the signed-off figure, the next number, VAT from the recorded position, the audit line without an amount; *refused*: not at INVOICE, the trigger not reached, outside the window, no figure, a second live invoice; *A CLAIM THAT HAS EXITED*: every kind refused on OUTSIDE_AMENDMENT_WINDOW, our fee on five other exits |
| 13.7 — the amounts unwritable | `invoices_claim_invoice_amounts_fixed` and the state and delete triggers (016); `setStatuses` refusing a claim's invoice | *THE AMOUNTS STAY UNWRITABLE*: eight columns refused by the table, the old status route refused, the row never deleted; `test/finance.test.ts` still finds no route that takes an amount |
| 13.4, E81 — the number series | `invoice_numbers` and its four triggers (016); `allocateNumber`, `cancelInvoice` | *THE NUMBER SERIES*: a cancelled number recorded and not reused; a gap, a reuse, a deletion and an un-cancel refused by the table; a sent invoice not cancelled |
| 13.11, E82 — credit notes | `invoice_credit_notes` and its triggers (016); `creditInFull`, `creditClause13` | *CREDIT NOTES*: clause 13 refused switched off and blank, and exact switched on with a completed clause; in full, numbered, credited in full read, the gate closed again; over-credit, change and deletion refused |
| 13.8, 13.9, 13.10, E86 — money received, outstanding, overdue | `invoice_payments` and its triggers (016); `recordReceived`, `voidReceived`, `invoiceMoney` | *MONEY RECEIVED*: bank transfer only, not in the future, never more than owed, part and full received read, **never asked and not known read alike** with the negative control; voided once; no amount in the audit. *OVERDUE IS DERIVED*: an unset due date never overdue; with terms set, due, overdue the day after, and not once paid |
| 13.6, E87 — the due date | `letterFees` reading clause 4; `due_basis` | *raised on a claim at INVOICE*: UNSET, never thirty days; *THE BREAK FEE AND THE ABORT FEE*: the real letter's terms BLANK |
| 13.7, E84 — VAT from the recorded position | `finance_settings` (016); `vatForInvoice`, `recordSetting`, `currentSetting` in `src/web/vat.ts` | *N4 — a VAT position nobody recorded*: refused before one is in effect, refused when registered with no rate, charged when the rate is recorded; *THE THRESHOLD, THE MARGIN AND THE TRIGGER*: dated, sourced, append-only, ADMIN's alone |
| B4.2, B4.3, B4.4, E88 — the fee controls | `FEE_CONTROLS`, `computeFee`, `letterFee`, `controlsView` in `src/web/fee-controls.ts` | *every switch ships off — and off is exactly today*, on four figures with and without an entity; *THE FIRST-YEAR CONTROL*; *THE MINIMUM FEE*; *THE BREAK FEE AND THE ABORT FEE* — BLANK on the page at least three times, and no plausible number |
| B4.8, E83, E85 — VAT monitoring | `vatReading`, `expectedFees`, `ensureVatTask`, `runVatCheck`; `staff_tasks` rebuilt with `company_subject` (016); `COMPANY_SUBJECTS` in `src/web/tasks.ts` | *THE ROLLING TWELVE MONTHS AND THE THIRTY-DAY TEST*: below, inside the margin, over; an older invoice out; a credit note netted; the tax point at the report's delivery; an undated invoice apart; one large fee named; cannot say with nothing in effect. *INSIDE THE MARGIN*: one task through `insertTask`, waiting with Accounting, about Caprebate, due at month end and overdue after, never a second, no invoice changed, no VAT table |
| 22.15, 24.10, 15.4, 15.5, E91, E92 — the finance dashboard | `financeDashboard`; `src/web/finance-pages.ts` | *BY MONTH*: invoiced, received, expected, outstanding, overdue, no due date; the invoice stage's task read and not duplicated. *THE SHAPE*: no foreign key or column of any new table to the answers, register data, notes, workings or estimate |
| E89 — the invoice email | `FORBIDDEN_EFFECTS` and `INVOICE_FRAUD_PROCEDURE` in `src/web/automation.ts`; `REFUSED` in `src/web/templates.ts`; the trigger pair replaced in 016; SOP 9's draft addition | *THE INVOICE-FRAUD PROCEDURE IS NOT IN FORCE*: the SOP export read; three effects refused at the rule store; six bodies refused by the store and the table; the seeded template still merges. `test/automation.test.ts`: the trigger's missed row is now a bare shape |
| 9.16, 12.11, 2.4, 10.7, 23.6 — the gate, the timeline, introducers, the claim page | `gateOut` in `src/web/pipeline.ts`; `invoices` in `src/web/timeline.ts`; `moneyReading` in `src/web/introducers.ts`; `claimMoneyLines` in `src/web/invoices.ts`, drawn by `src/web/crm.ts` | *THE TIMELINE*: a claim's events are its own invoices, no amount, Accounting's finance only; `test/introducers.test.ts`: the referred claim's invoice and money received, an organisation invoice not counted, a claim invoice without a fee refused; `test/tasks.test.ts` and `test/crm.test.ts` unchanged and green on the seed's claim invoices |
| B1.1 — N1 | `tools/payload-proof.ts`, extended | exit 0: nine finance routes refused as SURVEYING with nothing left behind; the finance view.json as ADMIN 0 of 7 by name and by value |
| B1.6 — deny by default | four actions in `src/authz.ts` | *THE RULE*: every role on every new action; Accounting refused the assessment; Sales and Surveying refused the invoice. *WHO REACHES IT, OVER HTTP*: Sales and Surveying refused every route, writing nothing; Accounting refused the settings |
| B1.8 — audited | eight audit kinds in `src/audit.ts` | the raise, money and credit audit lines carry no amount |

**Broken on purpose, one at a time, each file restored and checked by sha256.** The INVOICE gate reading the
organisation again — one red. A due date defaulted to thirty days — three red. Never asked read as a confirmation — one
red. OUTSIDE_AMENDMENT_WINDOW not refused before a fee — one red. Every file matched its hash on restore.

---

# PART O — THE ROWS CRM 8 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 8 of 10, 12 September 2026, after the build.** All paths are under
`09-app/backend/`. Every test named is in `test/compliance.test.ts` unless another file is named.

| Rows | Built in | Proved by |
|---|---|---|
| B3.10, E94, E95 — who | five actions in `src/authz.ts`; `assertComplianceRead`/`Write` in `src/web/compliance.ts` | *each role on each action*; *the stores refuse what the table refuses* — every register, S2, consent and retention refused to Sales, Accounting, Surveying and a client, and nothing left behind |
| B3.1, E96–E101 — customer due diligence | `cdd_checks`, `cdd_beneficial_owners`, `cdd_psc_decisions`, `cdd_monitoring_notes`, `aml_officers`, `aml_firm_risk_assessments`, `compliance_settings` (`migrations/017-compliance-registers.sql`); `src/web/compliance-aml.ts`; `cddGateNeed` in `src/web/compliance.ts`, asked by `gateOut` in `src/web/pipeline.ts` | *OFF: the shipped false and a setting never recorded read identically*; *OFF a claim leaves ENGAGEMENT exactly as before; ON it cannot without a finished check*; *THE PSC SEPARATION*; *a check that records beneficial ownership cannot finish with no owner* |
| B3.2, E102–E104 — the rights-request register | `rights_requests`, `rights_request_limbs`; `src/web/compliance-rights.ts`; `src/web/compliance-clock.ts` | `test/compliance-clock.test.ts` — the pack's RR-W1 to RR-W4, the traps, N4 on every input a clock waits on, the conservative rule at month ends; here *RR-W1*, *RR-W2*, *RR-W3 and RR-W4* through the register itself, *closing*, *a response letter reaches the outbox*, *the search finds a person through a lead and at a firm* |
| B3.3, E105 — the complaints log | `complaints`, `complaint_progress_updates`; `complaintCount`, `acknowledgementClock` | *thirty calendar days beginning with receipt; a classification is never revised; the s.164B count keeps the unclassified apart*; *closing needs the outcome told and the three onward routes given* |
| B3.4, E106–E109 — the breach register | `breach_incidents`, `breach_decisions`, `breach_awareness_corrections`, `breach_notification_phases`, `breach_other_notifications`; `src/web/compliance-breach.ts` | *an entry opens with the insurer recorded as NO POLICY IN FORCE*; *N4 — 34(3)(a) refused on UNKNOWN and on no fact*; *attempted invoice fraud is recorded with the claim and the date, never bank details* |
| B3.5, E95, E111, E112 — S2 | `identity_persons`, `identity_search_log`; `src/web/compliance-identity.ts` | *a person_ref is generated and opaque … a read is audited without the name … the search log holds the term* — and the name found in no other table of the database |
| B3.6, E113, E114 — consent | `consent_answers`; `introducer_share_consents` rebuilt with CLIENT_PORTAL; `clientShareChoices`, `recordShareConsentByClient` in `src/web/introducers.ts`; `POST /portal/share-progress` in `src/web/router.ts` | *the history reads the capture flags, every answer and the share-progress answers where they live*; *a client withdraws in the portal and the next notice is not queued; giving is switched off*. `test/introducers.test.ts` unchanged and green |
| B3.7, E115, E117 — retention, holds, links | `legal_holds`, `compliance_links`; `retentionList`, `RECORD_KINDS`, `RETENTION_PARAMETERS` | *today nothing is due … a table that refuses a DELETE says so*; *with RET-5 approved, a breach entry closed more than six years ago is past its clock — unless a legal hold is on it* |
| E110, E116 — letters and tipping off | `LETTERS`, `queueLetter`; `tipsOff`, `carriesBankDetails` and six more refusals in `src/web/templates.ts`; the template trigger pair replaced in 017 | *the template store refuses the words in code and in the database, and no compliance letter carries one* |
| B1.1 — N1 | `tools/payload-proof.ts`, extended | exit 0: seventeen compliance routes refused as SURVEYING with nothing left behind; the compliance and retention view.json as ADMIN 0 of 7 by name and by value |
| B1.8 — audited | thirty-seven audit kinds in `src/audit.ts` | the search, identity and letter lines carry no name, term or address |

**Broken on purpose, one at a time, each file restored and checked by sha256.** The ON switch ignored — one red.
"Beginning with" read as ending on the corresponding date — ten red. The PSC trigger switched off, the code left
standing — one red, once the test gave the insert a decision id so that only the trigger could refuse it (the first
attempt stayed green because a column CHECK refused first; that is why the second assertion exists). A legal hold
ignored by the list — one red. Every file matched its hash on restore.

---

# PART P — THE ROWS CRM 9 OF 10 BUILT, WITH THE FILE AND THE TEST

**Written at the close of CRM 9 of 10, 12 September 2026, after the build.** All paths are under
`09-app/backend/`.

| Rows | Built in | Proved by |
|---|---|---|
| 1.6, 3.10, 15.1–15.16, 22.2, 24.11, 27.6, 28.6, E119–E123 — the dashboard and my work | `src/web/dashboard.ts`, `src/web/dashboard-pages.ts`; `myWork` and `myTasksBlock` in `src/web/tasks.ts` and `src/web/tasks-pages.ts`; `dashboard.enter` in `src/authz.ts` | `test/dashboard.test.ts` — fifteen tests: each role's tiles, every asked action registered, N1 on the seed, N4 counted apart, conversion never 0%, overdue by the UK date, no dashboard table and nothing written by reading, the reconciliation tiles; the payload proof: a surveyor drawn its own jobs alone, none of the seven and none of ADMIN's pound figures |
| 16.1, 21.2, 24.12, E118, E124 — search | `src/web/search.ts`; `GET /staff/search` in `src/web/lists-pages.ts` | `test/search.test.ts` — six tests, the planted name among them; the payload proof as SURVEYING, and the ADMIN control finding every claim |
| 16.2–16.4, 16.6, E125, E126 — lists and saved views | `src/web/lists.ts`, `src/web/lists-pages.ts`; `saved_views` (`migrations/018-lists-saved-views-and-the-lead-next-action.sql`) | `test/lists.test.ts` — who, the shapes per role, filters and injection, sorts, saved views |
| 16.5, 27.9, E127 — export | `exportList` and `csvCell` in `src/web/lists.ts`; `list.export` | `test/lists.test.ts` — the reader's columns, the audit line, `=` `+` `-` `@` neutralised; the payload proof: both exports refused to a surveyor, the ADMIN export carrying its value column |
| E33, E128 — the lead's next action | migration 018; `LEAD_SELECT` and `createLead` in `src/web/leads.ts` | `test/lists.test.ts` — the carry-over read back from a database built to migration 017, and a new lead's follow-up task |
| E129 — the property and organisation pages | `organisationDocumentsPanel`, `propertyDocumentsPanel` in `src/web/documents.ts`; the note route in `src/web/tasks-pages.ts` | `test/lists.test.ts` over HTTP; the payload proof: a surveyor refused the note and the link with nothing written, and every document in its panel admitted |
| 6.5, 7.11, 8.22, 14.10, 20.2, 20.3, 22.17, E130, E131 — the lists | `vocabularies` (`migrations/019-admin-settings-lists-merge-and-request-document.sql`); `src/web/vocabularies.ts`; `addValue`, `changeValue`, `addReason`, `changeReason` in `src/web/configuration.ts` | `test/configuration.test.ts` — a source added, taken, retired and refused for a new lead while kept on the old; fixed values never retired; a priority in use not retired; unknown codes refused at every table |
| 20.1, 20.4, 20.6, E132 — what no setting may change | `FORBIDDEN_SETTINGS` and `refuseSetting` in `src/web/configuration.ts`; the roles triggers in migration 019 | `test/configuration.test.ts` — every key refused with its reason and recorded, and not one row, switch or permission changed; the reciprocity kinds; the five roles |
| 20.5, E133 — a rule that asks for a document | `automation_rules` rebuilt in migration 019; `requestDocument` in `src/web/automation.ts` | `test/configuration.test.ts` — refused for a type nothing can receive at the store and the table, never on a document request, raised by ADMIN through `createDocumentRequest`, NOT_RUN with nobody and on a do-not-contact organisation |
| E134 — merging a firm | `introducer_merges`, `introducers` rebuilt, `contacts_introducer_fixed` replaced (migration 019); `mergeIntroducer` in `src/web/introducers.ts` | `test/configuration.test.ts` — ADMIN alone, the database refusing every move outside a merge, what moves and what stays, the audit line, a firm with a fee refused; the payload proof: refused to a surveyor |
| 20.2, E135 — the folded screens | `configurationView` and `src/web/configuration-pages.ts` | `test/configuration.test.ts` over HTTP — the finance and compliance settings on ADMIN's screen and not on SALES's; ACCOUNTING and SURVEYING refused |
| B1.1 — N1 | `tools/payload-proof.ts`, extended | exit 0: the dashboard, search, the lists and exports, the property page's new routes, the settings screen and the merge, as SURVEYING |
| E136, E137 | `test/crm.test.ts`, `test/staff.test.ts`, `03-app/caprebate-figure-drift.cjs`; `src/web/configuration-pages.ts`, `src/web/lists-pages.ts` | the matcher's own test; the drift checker's negative control exiting 1; the payload proof |

---

# PART Q — THE ROWS NO EARLIER PART NAMED, AND THE CLOSE — CRM 10 OF 10

**Written at the close of CRM 10 of 10, 12 September 2026.** The table was read row by row against the running
application by `node 03-app/caprebate-crm-fold-check.cjs`, not by eye. It found three kinds of gap, and this part is
where each went. Paths are under `09-app/backend/` unless they say otherwise.

1. **Thirty-eight adopted rows that earlier phases built, or said they built, and that none of Parts G to P named.** Each
   was checked in the code. **Twenty-eight are built as their row says**, and their evidence is the first block below —
   every name found in the file given, and every italic title copied from the `test(...)` call that carries it. **Ten are
   not built as their row says** — 4.12, 8.4, 8.5, 8.6, 22.13, 22.16, 23.7, 23.8, 28.3 and 29.5 — **and one more
   over-claimed**: Part P named 29.11, which says every tile reads any period, and the tiles read this month and this
   quarter. **All eleven are marked in their own row and CARRIED** to the phase "CRM follow-on: the adopted rows the CRM
   fold found unbuilt", written into the action plan before the sweep (E139).
2. **Seven evidence cells named rows by prefix**, and so claimed rows they do not prove. Each is now a list of exact ids
   (E140).
3. **The rows CRM 10 of 10 closes itself** — the developer's half, the guides, the confirmation, and the rows of Parts B
   and D no line named — in the second block.

**Two lines are weak, and say so in the line**: 29.1, where no test tries an off-list workstream against its triggers,
and 25.8, where nothing tests use on a tablet.

## The twenty-eight rows built by earlier phases

| Rows | Built in | Proved by |
|---|---|---|
| 1.1 — one store per fact; nothing crosses from S2 | `identity_persons`, `identity_search_log` (`migrations/017-compliance-registers.sql`); `recordPerson` in `src/web/compliance-identity.ts`; `isCompanyOrRoleToken` in `src/web/crm.ts`; `search` in `src/web/search.ts` | `test/compliance.test.ts` — *a person_ref is generated and opaque, a name-shaped ref is refused, a read is audited without the name, and the search log holds the term* (it reads every table in `sqlite_master` and finds the name in no table but S2). `test/search.test.ts` — *A PLANTED NAME: found as a client’s contact and in a note, and nowhere else — not in S2, its search log, a rights request, a complaint, a breach entry, or a person at an introducing firm*. `test/crm.test.ts` — *the store refuses a person on either field, and says what to record instead*; *SALES does all four over HTTP; each write is audited with no value in the log line; the accountant never becomes a user* |
| 1.3 — what no automation may do, refused | `FORBIDDEN_EFFECTS`, `fireAutomation`, `createRule`, `updateRule` in `src/web/automation.ts`; `automation_rules` (`migrations/012-staff-tasks-automation-templates.sql`, rebuilt by 019) | `test/automation.test.ts` — *BY NAME AT THE STORE, AND AT THE TABLE: open either gate, move a claim, flip a switch, fire a register call, send outside the outbox, write to a do-not-contact organisation, an invoice email*; *THE WHOLE PROCEDURE WITH EVERY RULE ACTIVE: neither gate opens, no switch flips, no register call fires, only a person moves the claim, and nothing leaves the outbox*; *A DO_NOT_CONTACT ORGANISATION: every rule records NOT_RUN and writes nothing — and the negative control runs once the status is lifted* |
| 2.5 — the claim is the opportunity; leads convert | `leads` (`migrations/010-leads-and-pipeline.sql`); `convertLead` in `src/web/leads.ts`; `insertClaim` in `src/web/crm.ts` | `test/leads.test.ts` — *only a qualified lead converts, and the gate is asked again at the write*; *a referral with no organisation converts only when linked to one — and takes that organisation’s assessment unless another lead holds it*. `test/crm.test.ts` — *the funnel records a LEAD and no claim; converting the qualified lead opens the first claim — first property, its assessment, ASSESSMENT — audited* |
| 3.7, 24.8 — one upload handler, extended | `documents`, `document_events` (`migrations/003-portal.sql`); `document_types`, `logical_documents`, `document_links` (`migrations/013-documents-on-the-claim.sql`); `createDocumentRequest`, `linkDocument` in `src/web/documents.ts` | `test/documents.test.ts` — *src/ names the upload handler through the port alone, and src/web/documents.ts calls no step of the contract itself*; *migration 013 creates exactly three tables, none of them a log; the timeline draws requests from client_tasks*; *every receivable type is uploaded through the one handler: steps 1 to 7 in order, the strip recorded, the original gone, the name derived* |
| 3.8 — introducers, no login ever | `introducers` (`migrations/014-introducers-and-referrals.sql`, rebuilt by 019); `intakeReferral` in `src/web/introducers.ts` | `test/introducers.test.ts` — *a referral creates a firm, a person of type INTRODUCER on it, and no login — and no role or action reaches a firm’s person* (it also reads every introducer table's columns for a login field) |
| 3.9 — money recorded, not collected, on the claim | `invoice_payments` (`migrations/016-finance-on-the-claim.sql`, `method` CHECK bank transfer only); `recordReceived`, `raiseInvoice`, `claimInvoices` in `src/web/invoices.ts`; `feeVersusBenefit` in `src/web/finance.ts` | `test/finance.test.ts` — *no action anywhere in the rule table is about taking money*; *the page says so, rather than leaving it to be discovered*. `test/finance-claim.test.ts` — *MONEY RECEIVED IS RECORDED, NOT COLLECTED: bank transfer only; never more than owed; the state READ; never asked and not known about the bank details read alike (N4)*; *THE INVOICE GATE reads this claim’s invoice: an organisation’s, another claim’s, a cancelled one and one credited in full do not open it* |
| 6.8 — current owner: absent by design | `properties` in `migrations/002-domain.sql` and the columns `migrations/009-crm-backbone.sql` adds — none is an owner; the owner is `properties.business_id`. A landlord who is an individual is refused on the fields that exist by `isCompanyOrRoleToken` in `src/web/crm.ts` | No test reads the absent column; the two migrations are the proof. The N2 half: `test/crm.test.ts` — *the store refuses a person on either field, and says what to record instead* |
| 8.8, 8.9 — acquisition read from the property: absent by design | `claims` in `migrations/009-crm-backbone.sql` has no acquisition column; `claimView` in `src/web/crm.ts` reads `acquisition_date` and `acquisition_price_pence` from the property; `acquisitionDateReading` in `src/web/claim-facts.ts` | `test/claim-record.test.ts` — *a derived fact carries its source and the store refuses a recorded one — the claimant type, and taxable profit through the funnel and its break-even switch* (it refuses `ACQUISITION_DATE` recorded on the claim). No test covers 8.9's value; the missing column is the proof |
| 8.13, 29.2 — five per cent, never set on a screen | `computeFee`, `FEE_CONTROLS` in `src/web/fee-controls.ts`; `raiseInvoice` in `src/web/invoices.ts`; `FORBIDDEN_SETTINGS`, `refuseSetting` in `src/web/configuration.ts` | `test/finance.test.ts` — *the fee IS five per cent of the allowances identified, checked as arithmetic*; *THE AMOUNTS ARE NOT WRITABLE — there is no route that changes the fee*. `test/finance-claim.test.ts` — *raised on a claim at INVOICE: the next number, 5% of the signed-off figure, VAT read from the recorded position, and the due date UNSET — never thirty days*; *every switch ships off — and off is exactly today: the plain 5% of CB_FEE, no warning, no minimum, no break or abort fee*. `test/configuration.test.ts` — *ADMIN asking for each one is refused with its reason, each refusal audited, and not one row, switch or permission changed* |
| 8.21 — the adviser a record, the accountant a contact | `tax_adviser_signoffs` (`migrations/015-claim-facts-figures-and-aftercare.sql`, `kind` CHECK `RECORD_NOT_A_SIGNATURE`); `recordSignOff` in `src/web/claim-record.ts` | `test/claim-record.test.ts` — *refused off its stage, with no commitment on this claim, with a person’s name, without its scope, method or figure, dated ahead, or confirming a switch that does not exist*. `test/crm.test.ts` — *SALES does all four over HTTP; each write is audited with no value in the log line; the accountant never becomes a user* |
| 18.5 — the rights register, a deletion list, not a deleter | `rights_requests`, `rights_request_limbs` (`migrations/017-compliance-registers.sql`); `retentionList`, `RECORD_KINDS` in `src/web/compliance-identity.ts`; `ListKey` in `src/web/lists.ts` (claims and leads only — no export of S2 or a register) | `test/compliance.test.ts` — *RR-W1 — 3 March, nothing asked in return: 2 April, and the extension notice deadline is the same day*; *today nothing is due: every kind is unset or derived-not-approved, and a table that refuses a DELETE says so*; *with RET-5 approved, a breach entry closed more than six years ago is past its clock — unless a legal hold is on it*. `test/search.test.ts` — *no statement search can run names any of them* |
| 22.10 — the claim page's header and overview | `claimView` (`header`, `overview`) in `src/web/crm.ts`; `claimPage` in `src/web/crm-pages.ts`; every other panel added by its own phase in the `ClaimView` type | `test/crm.test.ts` — *SALES sees the value; a CLIENT is refused every CRM route*; *ACCOUNTING reads a claim as client, reference and money — and is refused the organisation, the property and the value* |
| 22.14, 24.9 — the introducer dashboard and section | `introducerList`, `introducerView`, `pipelineFigures` in `src/web/introducers.ts`; `/staff/introducers` in `src/web/introducers-pages.ts` | `test/introducers.test.ts` — *leads referred, claims opened and won, reasoned negatives counted apart; the value for SALES and the money for ACCOUNTING, each and nothing else*; *SALES opens the firm and the lead: a firm’s name and notes carrying a script are escaped; SURVEYING is refused every introducer route*; *a referral creates a firm, a person of type INTRODUCER on it, and no login — and no role or action reaches a firm’s person* |
| 22.15, 24.10 — the accounting view, extended to the finance dashboard | `feeVersusBenefit` in `src/web/finance.ts`; `financeDashboard` in `src/web/invoices.ts`, drawn by `src/web/finance-pages.ts` | `test/finance.test.ts` — *the six things it may see are all on the page*. `test/finance-claim.test.ts` — *BY MONTH: invoiced, received, credit notes, outstanding and overdue, and fees expected from claims at INVOICE — with the invoice stage’s finance task read, never a second*; *WHO REACHES IT, OVER HTTP: ACCOUNTING and ADMIN; SALES and SURVEYING refused the invoice and every new route, writing nothing; ACCOUNTING still refused the assessment and the settings* |
| 23.5 — documents requested, received, outstanding | `claimDocumentsPanel`, `requestsFor` in `src/web/documents.ts`; `claimDocumentsBlock` in `src/web/documents-pages.ts` | `test/documents.test.ts` — *a request is refused every click — the portal, "answer here", a hand-written row — and received by an upload of its type only*; *OVERDUE BY THE UK DATE, on the claim and the owner’s list — and N4: a request with no due date is neither overdue nor on time*; *the landing page and the claim page flag an outstanding request OVERDUE; a request’s text is escaped on the claim page* |
| 25.8, 29.12 — no separate mobile application: absent by design. **Weak** | the surveyor's workspace, `src/web/surveyor-pages.ts`, server-rendered through `src/web/html.ts` with a `viewport` meta; nothing in the back end mentions a mobile application | `test/surveyor.test.ts` — *the JSON payload a surveyor is served contains NO estimate output at all*; *the surveyor’s HTML page contains none of the figures either*; *the job list is the rule, not a WHERE clause — an unassigned job is nobody’s*. No test asserts use on a tablet; the viewport meta is the only evidence of it |
| 25.9 — tiles are queries; no forecast breaks N1 or N4 | `src/web/dashboard.ts` (`monthAndQuarter`, the `expected_completion` tile, read from `claims.expected_completion` and never from the estimate) | `test/dashboard.test.ts` — *no table, view, index or trigger holds anything for a dashboard*; *on the seeded data: none of any sealed estimate’s seven, and none of the pound figures ADMIN is shown*; *an open claim with no sealed estimate adds nothing to the pipeline value, and is said*; *a lead source with nothing decided has no conversion rate — not 0%* |
| 25.12 — integrations behind the register seam, shut | `gateStatus`, `planResearch`, `ingestRegisterRecord` in `src/stubs/registers.ts`; `assertSignedEngagement` in `src/web/research.ts`; `STUBS` in `src/app.ts` | `test/seed.test.ts` — *the free gate reports itself shut, and reports WHY*; *nothing fires while the free gate is shut — and nothing throws either*; *a paid source stays shut without a signed engagement, and opens with one*; *exactly four stubs, each one named module behind an interface*. `test/engaged.test.ts` — *THE FREE GATE IS SHOWN SHUT, IN CB_REGISTRY’S OWN WORDS, AND NOTHING FLIPS IT*; *THE PAID GATE IS ASSERTED SERVER-SIDE — a forged form field does not open it* |
| 27.3 — the claim shows its six, per role | `claimView` in `src/web/crm.ts` (`header`: owner, next action, stage; `value` only under `claim.read_value` in `src/authz.ts`; `documents`; `timeline`); `claimDocumentsPanel` in `src/web/documents.ts`; `timelineIfPermitted` in `src/web/timeline.ts` | `test/crm.test.ts` — *SALES sees the value; a CLIENT is refused every CRM route*; *ACCOUNTING reads a claim as client, reference and money — and is refused the organisation, the property and the value*. `test/documents.test.ts` — *ROLES ON THE WIRE: claim evidence, the fee invoice and the letter — each role reaches exactly its own, the refusals audited, and the letter only once signed*. `test/tasks.test.ts` — *a claim, an organisation and a property: events from the tables that hold them; notes apart, in the data; what the client sees is marked*; *ACCOUNTING: financial events only. SURVEYING: only an assigned job’s claim — its stage, its own tasks and its commitment. CLIENT: none* |
| 27.5 — documents uploaded and linked | `document_links` (`migrations/013-documents-on-the-claim.sql`); `linkDocument`, `createDocumentRequest` in `src/web/documents.ts` | `test/documents.test.ts` — *one lease serves two claims; a claim of another organisation is refused by the store and the table; a link is ended, never deleted; no person column*; *A REQUEST CLOSED BY AN UPLOAD: the client takes a link from the portal, PUTs the file, and the request is received; the link is used once* |
| 28.8 — configurable preferences, fixed rules | `FORBIDDEN_SETTINGS`, `refuseSetting` in `src/web/configuration.ts`; `vocabularies` (`migrations/019-admin-settings-lists-merge-and-request-document.sql`) | `test/configuration.test.ts` — *the forbidden list names every rule the phase lists*; *ADMIN asking for each one is refused with its reason, each refusal audited, and not one row, switch or permission changed* |
| 29.1 — the rulebooks' reliefs as workstreams. **Weak** | `WORKSTREAMS` in `src/web/crm.ts`; `claims_workstream_insert`, `claims_workstream_update` in `migrations/009-crm-backbone.sql` | `test/crm.test.ts` — *the seed has a claim for every business, an organisation with two properties, and a property with two claims* (the two claims on one property carry two workstreams). No test tries an off-list workstream against the triggers |
| 29.10 — retention from the determinations, UNSET shown as unset | `RETENTION_PARAMETERS`, `RECORD_KINDS`, `retentionList` in `src/web/compliance-identity.ts`; the retention clock on `document_types` (`migrations/013-documents-on-the-claim.sql`) | `test/compliance.test.ts` — *today nothing is due: every kind is unset or derived-not-approved, and a table that refuses a DELETE says so*; *with RET-5 approved, a breach entry closed more than six years ago is past its clock — unless a legal hold is on it*. `test/documents.test.ts` — *N4 — ASSERT BOTH: a clock set to UNSET and a clock never set read identically, and neither computes a date* |

## The rows CRM 10 of 10 closes, and the rows of Parts B and D no line named

| Rows | Built in | Proved by |
|---|---|---|
| 1.8 — behind the seams that exist; no connector fires | `STUBS` in `src/app.ts`; `09-app/CAPREBATE-DEVELOPER-SPEC.md` §4 and the opening of §5.5 | `test/seed.test.ts` — *exactly four stubs, each one named module behind an interface*; `03-app/caprebate-crm-fold-check.cjs`, check C, holds §4's references to the code |
| 13.13, 25.1, 29.7 — accounting as an export seam, not a build | Developer Spec §5.5 item 4 and work item DS-W13; the export it copies is `exportList` and `csvCell` in `src/web/lists.ts` | `test/lists.test.ts`, for the list export the seam copies; the seam itself is a developer's |
| 18.7, 21.5, 21.8, 26.7, 26.8, 26.10, 26.13 — staging, production, backups, recovery and the handover | Developer Spec §5.5, its closing paragraph, and work item DS-W14, behind the backup-exclusion question | Nothing is deployed anywhere, so the proof is the absence; the tree is the handover |
| 18.8, B4.11 — UK residency, and every processor named before it carries client data | Developer Spec §5.5 item 1 and work item DS-W11 | The engagement letter's clause 7 and the privacy notice's section 4 already name the processors; any new one is added to both first |
| 19.1, 25.2 — email behind `EmailTransport`; deliverability first; no inbox sync | `outboxTransport`, `STUB_NOTICE`, `isDoNotContact` in `src/stubs/email.ts`; `INVOICE_FRAUD_PROCEDURE` in `src/web/automation.ts`; Developer Spec §5.5 item 2 and work item DS-W5 | `test/automation.test.ts` and `test/finance-claim.test.ts`, which refuse the invoice email while the procedure is a draft |
| 19.6, 25.3 — booking built; external calendar sync not | `isBookable` in `src/web/schedule.ts`; `bookings`, `booking_changes`; Developer Spec §5.5 item 3 and work item DS-W12 | `test/portal-booking.test.ts`, `test/localtime.test.ts` |
| 21.3, 27.10 — the production store is the host's question | Developer Spec §5.5 item 6, with the CRM's size counted | The question's title is held by the fold check's A2: "Does WordPress replace the rest of the system, or sit beside it?" |
| 25.11 — marketing automation: not built | `marketing_optin` on `contacts`; `FORBIDDEN_EFFECTS` in `src/web/automation.ts`; Developer Spec §5.5, its closing paragraph | Absent by design: no automation effect writes to a client — `test/automation.test.ts` |
| 26.5, D4 — the MVP closed against sections 24 and 27 | This table: every row of sections 24 and 27 names its evidence, or the phase it is carried to | `03-app/caprebate-crm-fold-check.cjs`, check A3 |
| 26.11, 26.12 — administrator documentation, and user documentation with training | `09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md` — the administrator guide, the user guide by role, and training for every CRM screen, each exercise run against the seeded demo | `03-app/caprebate-crm-fold-check.cjs`, check D: every CRM screen in Developer Spec §2 has its training section |
| 29.9 — nothing to import | Developer Spec §5.5 item 5; the question in Part F, and its board item | `03-app/caprebate-crm-fold-check.cjs`, check A2, holds the title |
| B1.2 — N2, and one identity store | `isCompanyOrRoleToken` in `src/web/crm.ts`; `identity_persons` in `migrations/017-compliance-registers.sql` | `test/crm.test.ts` — *the store refuses a person on either field, and says what to record instead*; `test/compliance.test.ts` — *a person_ref is generated and opaque, a name-shaped ref is refused, a read is audited without the name, and the search log holds the term* |
| B1.3 — N3, one upload handler | `src/web/upload-handler-port.ts`; `documentTextExtractor` in `src/web/uploads.ts` | `test/documents.test.ts` — *src/ names the upload handler through the port alone, and src/web/documents.ts calls no step of the contract itself*; *every receivable type is uploaded through the one handler: steps 1 to 7 in order, the strip recorded, the original gone, the name derived* |
| B1.14 — STRICT tables, foreign keys on, no string-built SQL | `foreign_keys` switched on in `src/db.ts`; `tools/lint-sql.cjs`; STRICT on every table the CRM migrations create | The back end's check runs the SQL lint before the type check and the tests |
| D2, D3 — search, export and admin settings, which the startup cut dropped | Part P's lines: `src/web/search.ts`, `src/web/lists.ts`, `src/web/configuration.ts` | `test/search.test.ts`, `test/lists.test.ts`, `test/configuration.test.ts` |
| D6, D7 — claimant type and the addresses; the occupier and the disposal date | Part G's lines: `businesses.claimant_type`, `properties.occupier`, `properties.disposal_date` | `test/crm.test.ts`; the disposal date's task, `test/claim-record.test.ts` |
| D8 — the claim page layout | Section 23's rows, each named in Parts G to Q — two of them, 23.7 and 23.8, carried | As those lines |
| D9 — non-functional requirements and developer deliverables | Sections 21 and 26, each named in Parts G to Q; Developer Spec §5.5 | As those lines |

---

# PART R — THE ROWS THE CRM FOLLOW-ON BUILT, WITH THE FILE AND THE TEST

**Written at the close of the CRM follow-on, 12 September 2026, after the build.** All paths are under `09-app/backend/`
unless they say otherwise. Every italic title is copied from the `test(...)` call that carries it, and every one of those
tests was seen to go red when the fix it holds was undone on purpose — the rules form's document field, the claim form's next
action, the consent page's notice, the mandatory-documents switch shipped on, "not sure" derived as a prior claim, and the
invoice number's prefix — before the fix was put back. No row of this table is carried to any phase.

| Rows | Built in | Proved by |
|---|---|---|
| 4.12, 8.5, 8.6 — the introducer and the source, read through the lead | `claimOrigin` and `referredBy` in `src/web/crm.ts` (the `origin` and `referred_by` of `ClaimView` and `OrganisationView`); the organisation's `view.json`, the claim page and the organisation page in `src/web/crm-pages.ts` | `test/follow-on.test.ts` — *THE INTRODUCER AND THE SOURCE are read through the lead — on the organisation page, the claim page and both view.json — never a column and never typed; SURVEYING and ACCOUNTING are given neither*; `tools/payload-proof.ts` — the organisation's `view.json` refused to SURVEYING, and carrying all seven as ADMIN |
| 8.4, 23.7 — the claim team | `claim_contacts` (`migrations/020-the-claim-team.sql`); `claimTeam`, `linkClaimContact` and `unlinkClaimContact` in `src/web/crm.ts`; `claim_team.write` in `src/authz.ts`; `teamBlock` in `src/web/crm-pages.ts` | `test/follow-on.test.ts` — *THE CLAIM TEAM links the organisation’s own accountant to this claim by migration 020 — a link, never a user; audited with no name; ended, never deleted; refused twice, for a decision maker, for another organisation’s adviser, at the table, and to SURVEYING*; *THE TEAM PANEL IS BUILT FORWARDS: ADMIN reads the tax adviser as the sign-off record and never a person; SURVEYING is drawn the owner and the surveyor and nothing else; ACCOUNTING no team at all*; *claim_team.write, document_centre.enter and audit.read: registered, deny by default, refused for every role not granted them and for a disabled user*; `tools/payload-proof.ts` — a surveyor's team of four keys, and the link and its end refused with nothing written |
| 22.13 — the document centre | `documentCentre`, `CENTRE_FILTERS`, `CENTRE_SORTS` and `CENTRE_NEVER` in `src/web/documents.ts`; `document_centre.enter` in `src/authz.ts`; `centrePage` in `src/web/documents-pages.ts` | `test/follow-on.test.ts` — *THE DOCUMENT CENTRE lists every document each reader may read and no other — each row asked of document.read — with fixed filters and sorts, anything else said, no search of what a document says and no export*; `tools/payload-proof.ts` — every row a surveyor is listed admitted by `document.read`, and the fee invoice listed to ADMIN alone |
| 22.16, 29.11 — the reports screen is the dashboard over a period | `readPeriod`, `PERIODS`, `inPeriod`, `periodQuery` and the tiles' `period` in `src/web/dashboard.ts`; `periodForm` in `src/web/dashboard-pages.ts` | `test/follow-on.test.ts` — *A PERIOD FROM THE FIXED TABLE: this month, this quarter, a UK financial year and any from-to range of UK dates — anything else dropped and said — and no period is exactly today’s dashboard*; *OVER A PERIOD, only what happened inside it is counted and what has no date is counted apart — leads by their date, completed claims by their completion, a lost lead apart — each tile says whether the period applies, and nothing is stored*; `tools/payload-proof.ts` — the dashboard over a financial year and over a range, as SURVEYING: its own jobs alone |
| 23.8 — the estimated fee on the claim | `expectedFeeFor` in `src/web/vat.ts`, which `expectedFees` now calls; `estimatedFee` and `EstimatedFee` in `src/web/crm.ts` | `test/follow-on.test.ts` — *THE ESTIMATED FEE on the claim is the fee the finance view expects — read, never typed — for invoice.read alone; UNKNOWN wherever the signed figure is not known (N4); gone once our fee is raised*; `tools/payload-proof.ts` — no `estimated_fee` and no fee as text for SURVEYING on the claim at INVOICE, and the fee found there as ADMIN |
| 28.3 — the prior-claim position, derived | `derivedPriorClaim`, `priorClaimFor`, `priorClaimRuledOutFor` and `PRIOR_CLAIM_SOURCE` in `src/web/crm.ts`, read by `updateProperty`, `propertyView`, `claimView` and `enquiryEvidence` in `src/web/pipeline.ts` | `test/follow-on.test.ts` — *THE PRIOR-CLAIM POSITION IS DERIVED where the funnel’s own answer states it — a "yes" on one property is YES and a recorded answer is refused — and "not sure", "no" and a question never asked read identically, and none of them rules a prior claim out* |
| 29.5 — mandatory documents at a stage, built and switched off | `MANDATORY_DOCUMENTS`, `MANDATORY_DOCUMENTS_QUESTION` and `mandatoryDocumentNeeds` in `src/web/mandatory-documents.ts`; the gate out of DATA_GATHERING in `gateOut`, `src/web/pipeline.ts` | `test/follow-on.test.ts` — *MANDATORY DOCUMENTS SHIP OFF: off, the gate out of DATA_GATHERING is exactly today’s, and the question it waits on is named by its title*; *MANDATORY DOCUMENTS SWITCHED ON — the skip test: a claim cannot leave DATA_GATHERING without a received document of each type required; a request is not a receipt; a condition not known and one never recorded read alike and neither passes* |
| 20.5 — (a) a rule that asks for a document, saved from the rules screen | `RULE_FIELDS` in `src/web/tasks-pages.ts` | `test/follow-on.test.ts` — *(a) THE RULES SCREEN SAVES A RULE THAT ASKS THE CLIENT FOR A DOCUMENT, OVER HTTP — the lease included — and changes one* |
| 18.6 — (b) the audit log, read by Admin, and its chain verified | `auditLogView` in `src/web/audit-log.ts`; `auditPage` in `src/web/staff.ts`; `AUDIT_LOG_READ` in `src/audit.ts`; the `verify-audit` command in `src/cli.ts` and `package.json` | `test/follow-on.test.ts` — *(b) THE AUDIT LOG PAGE is ADMIN’s alone: kinds, ids and outcomes and never a value; the chain said intact, and broken once a row is changed outside the application; the read is itself a line*; *(b) npm run verify-audit — the documented command recomputes the chain from the database file: exit 0 intact, exit 1 once a row is changed outside the application, and it writes nothing*; `tools/payload-proof.ts` — the audit log refused to SURVEYING, and opening with its chain intact as ADMIN |
| B3.5, B3.6, B3.7 — (c) the one-person notice on every register page | `TWO_PERSON_LIMITATION`, drawn by `identityPage`, `consentPage` and `retentionPage` in `src/web/compliance-views.ts` | `test/follow-on.test.ts` — *(c) THE ONE-LOGIN NOTICE IS ON EVERY REGISTER PAGE — the identity store, the retention list and a contact’s consent history among them* |
| 1.3 — (d) each refusal said once; the seed's comment | `distinctReasons` in `src/web/tasks-pages.ts`; the comment above `SEED_PASSWORD` in `src/seed.ts` | `test/follow-on.test.ts` — *(d) THE RULES PAGE SAYS EACH REFUSAL ONCE, the store still refuses each by name, and the seed’s comment names the two places that refuse the demo data* |
| (e) the claim form refuses a next action | `CLAIM_FIELDS` in `src/web/crm-pages.ts`, which now carries the next action to `updateClaim` | `test/follow-on.test.ts` — *(e) "CHANGE THE CLAIM" REFUSES A NEXT ACTION WITH ITS REASON, OVER HTTP, and writes nothing* |
| 3.7, 24.8 — (f) a client finishes an upload from a browser, through the one handler | the `/upload/put` route in `src/web/router.ts`, taking a multipart POST through `singleFile` to the same `acceptClientBytes` and `finishUpload`; `uploadTicketPage` | `test/follow-on.test.ts` — *(f) A CLIENT FINISHES AN UPLOAD FROM A BROWSER: the portal’s page is a form with no script, and its multipart POST goes through the same handler with the same single-use key — received, stripped, and refused the second time* |
| (g) nobody's claims breaking the one-next-action rule, on the landing page | `unowned_claims_breaking` in `myWork`, `src/web/tasks.ts`; `myTasksBlock` in `src/web/tasks-pages.ts` | `test/follow-on.test.ts` — *(g) AN OPEN CLAIM NOBODY OWNS THAT BREAKS THE ONE-NEXT-ACTION RULE IS ON THE LANDING PAGE FOR SALES AND ADMIN — and on nobody else’s — until it has an owner* |
| (h) the words a user reads | `range_note`, `NO_RANGE_NO_ASSESSMENT` in `src/web/leads.ts` and `src/web/lists.ts`; `factCell` in `src/web/crm-pages.ts`; `releasedValue` and `RELEASED_FACT_LABELS` in `src/web/claim-record-pages.ts`; `claim_stage` in `src/web/surveyor.ts`; the tiles' `basis` in `src/web/dashboard.ts`; `inWords` in `src/web/finance.ts` | `test/follow-on.test.ts` — *(h) WORDS A USER READS, ON THE RENDERED PAGE: a lead with no range, a fact recorded by staff, the surveyor’s facts and its job list’s stages — and no developer’s function name on the dashboard, the claim or the finance invoice* |
| 16.1, 16.5 — (i) the export says what it did not apply; an invoice by the start of its number | `not_applied` in `src/web/lists.ts` and `notAppliedWords` in `src/web/lists-pages.ts`; `INVOICES_ALL` in `src/web/search.ts` | `test/follow-on.test.ts` — *(i) ACCOUNTING’S CLAIMS EXPORT SAYS WHAT IT DID NOT APPLY, beside the link and in the audit line; invoice search takes the start of a number, still asked of can()* |
| (i) the seed's claim at INVOICE, and "Raise our fee" | `seedClaimAtInvoice` in `src/seed.ts` | `test/follow-on.test.ts` — *(i) THE SEED HAS A CLAIM AT INVOICE READY FOR OUR FEE — its sign-off record, both reports issued, the window open and the trigger reached — and ACCOUNTING raises the fee through the real route*; `test/pipeline.test.ts` — *the seed shows the procedure: the gates placed each seeded claim, and a claim opened by staff starts at the enquiry* |
| B1.1 — N1 | `tools/payload-proof.ts`, extended to the claim team, where a claim came from, the estimated fee, the document centre, the dashboard over a period, the organisation's `view.json` and the audit log | exit 0: none of the seven and no fee on any route a surveyor can reach, every other route refused, and each search seen to find what it looks for as ADMIN |

---

# PART S — WHAT PHASE 129 BUILT AND SWITCHED OFF, WITH THE FILE AND THE TEST

**Written at the close of Phase 129's back-end work, 12 September 2026, after the build.** All paths are under `09-app/backend/`
unless they say otherwise. Every italic title is copied from the `test(...)` call that carries it. Each test was seen to go red on
purpose before its code was put back — each switch shipped on, each not-known reading undone, the officer's role widened to the audit
log, a recommendation made receivable, and migration 021 made to disagree with the module. **Nothing in this Part is in force.**

| Rows | Built in | Proved by |
|---|---|---|
| E156 — the conveyancing strip, switched off | `CONVEYANCING_STRIP`, `captureParties`, `todaysCapture` and `companyNumber` in `src/web/conveyancing-strip.ts`, reading `classifyPartyReference`, `ALWAYS_NATURAL_PERSON_ROLES`, `ROLE_TOKENS` and `CAPTURE_NAME_PATTERNS` through `src/web/upload-handler-port.ts` | `test/phase129.test.ts` — *THE CONVEYANCING STRIP SHIPS OFF: the parties of a conveyancing upload are exactly today’s — every one a role token, no name and no number — byte for byte, and the question it waits on is named by its title*; *THE CONVEYANCING STRIP SWITCHED ON: a company or LLP party to the transaction keeps its name and registered number; an individual, a sole trader, a partnership, a witness and a fee earner are stripped; a legal form not known and one never recorded read identically and neither keeps a name (N4)* |
| B3.10, E157 — the data protection officer role, defined and switched off | `DPO_ROLE` in `src/roles.ts`; `DPO_ROLE_SWITCH`, `DPO_RULES`, `DPO_SCOPE` and `canAsDpo` in `src/authz.ts`, asked by `can` | `test/phase129.test.ts` — *THE DPO ROLE SHIPS OFF: not one of the five and not assignable — refused by assignRole and by the roles table — and can() refuses a DPO actor every registered action, as before it existed*; *THE DPO ROLE SWITCHED ON: it holds the compliance registers, S2, the disclosure log’s reading, the back office’s door and its own account, and is refused every other registered action — the audit log, users and roles, settings, claims, documents and money among them; a disabled DPO holds nothing* |
| 11.3, E34, E158 — the recommended receipt strips, recorded and not approved | `receipt_strip_recommendations` (`migrations/021-disclosure-log-and-receipt-recommendations.sql`); `RECEIPT_RECOMMENDATIONS`, `RECEIPT_STRIP_QUESTION` and `recommendationReading` in `src/web/receipt-recommendations.ts`, which reads `stripReading` and writes nothing | `test/phase129.test.ts` — *RECEIPT STRIP RECOMMENDATIONS: one for each of the fourteen types with no receipt policy, each with its reason, identical in the module and in migration 021 — recorded, not approved*; *NO_RECEIPT_POLICY IS UNCHANGED BOTH WAYS: recommended or approved, all fourteen still read no receipt policy, are refused an upload before a link is issued, and are refused a request* |
| E159 — the per-disclosure log, switched off | `disclosure_log` (`migrations/021-disclosure-log-and-receipt-recommendations.sql`); `DISCLOSURE_LOG`, `RECIPIENTS`, `SOURCE_NOT_RECIPIENT`, `recordDisclosure` and `disclosuresFor` in `src/web/disclosure-log.ts`; `disclosure.read` and `disclosure.record` in `src/authz.ts`; `DISCLOSURE_RECORDED` in `src/audit.ts` | `test/phase129.test.ts` — *THE DISCLOSURE LOG SHIPS OFF: recording is refused with nothing written and no audit line, and the reading says NOT KEPT — never none — whatever the table holds (N4)*; *THE DISCLOSURE LOG SWITCHED ON: a disclosure is recorded with when, to whom, which data, the lawful basis and by whom, in the recipients document’s own words; a source is refused as not a recipient; a processor carries only its Article 28 instruction; nothing is changed or deleted*; *disclosure.read and disclosure.record: registered, deny by default, refused for every role not granted them and for a disabled user — and the stores refuse what the table refuses* |
| B1.1 — N1 | `tools/payload-proof.ts`, unchanged: none of the four adds a route or a field to one | Re-run after the build: verdict PASS — the surveyor 0 of 7 on every route it can reach and refused every other |
