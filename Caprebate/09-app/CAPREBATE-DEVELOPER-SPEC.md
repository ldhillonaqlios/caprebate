# Caprebate — the Developer Spec

**Deliverable 3 of three. Written 9 September 2026 (Phase 108), board item 12984650346.**
**The CRM was built onto it by ten phases, 10 to 12 September 2026, and folded into it as one
system by the last of them.**
It describes the two applications in `09-app/` **as they are**, says exactly where
they stop, and folds the last of the superseded design documents into itself.

---

## WHAT THIS IS NOT — read this paragraph before you run anything

**This is a working prototype and it is not a product.** Every business, person,
property, postcode, figure and document in it is **invented**: the seed carries
six fictional businesses, no real client, no real person and no real property,
and its postcodes are from the `ZZ` range reserved for fiction. **It has not been
penetration tested.** It has no TLS, no secrets manager, no web application
firewall, no production hosting and no real API credentials; **it makes zero
external network calls of any kind**. **It must not be deployed on a public
address, and no real client data may be put into it**, until a developer has done
the work listed at §5. Everything below is written so that a developer can price
that work and check every claim in it against the code and the tests.

---

## Contents

| § | What it answers |
|---|---|
| **0** | How to run it, and the four things to read first |
| **1** | **The user cases** — every actor, every journey, with preconditions and outcomes |
| **2** | **The wireframe** — every screen in both applications: route, fields, writes, must-nevers, acceptance test |
| **3** | **What every API does** — internal routes, then external registers and suppliers |
| **4** | **What is real, what is stubbed, and exactly where** — one row per stub, naming the file and the line |
| **5** | **What the developer must still do**, mapped onto the Build Order's blocks, and the open questions — and, at §5.5, what the CRM needs that this build cannot have |
| **6** | **What is not a developer decision** — the four non-negotiables, the two gates, the security baseline |
| **7** | The evidence base this build is not allowed to touch |
| **Guide** | **The administrator guide, the user guide by role, and training for every CRM screen** — a companion file beside this one, `09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md` |

---

## 0 · Running it, and what to read first

```bash
cd 09-app/backend
npm install          # one runtime dependency: @node-rs/argon2 (prebuilt, no compiler)
npm run migrate      # creates caprebate.db from migrations/
npm run seed         # invented data + one user per role. Refuses without CAPREBATE_ALLOW_SEED=1
npm run verify-audit # recomputes the audit log's hash chain from caprebate.db; writes nothing; exit 1 if broken
npm start            # http://localhost:8103
npm run start:demo   # in-memory, seeded — for looking at the screens
npm run check        # lint:sql, typecheck, the whole test suite
```

Node 24 or later. `node:sqlite` and TypeScript type-stripping are both used
without a build step, so there is no bundler and no transpile stage to configure.

**Four documents, in this order, and then this one is the map.**

| # | Read | Why |
|---|---|---|
| 1 | This document, §6 | The four non-negotiables and the two gates. If you write code that makes one of them awkward, the code is wrong |
| 2 | `09-app/engine/EXTRACTION.md` | The engine in `09-app/engine/src/generated/` is a **byte-for-byte slice** of `Caprebate site.html`. Do not edit it; change the site and re-run the extractor |
| 3 | `02-modules-and-build-prep/Build-Prep-06-Developer-Build-Specification-v2.md` §2 | The four rules verbatim, and the 130 questions are in **v1 §3** |
| 4 | `06-commercial-and-governance/Caprebate-Decided-And-Not-Decided-v1.md` | One page: what is settled, what is a fail-closed placeholder, and the switch table |

> **THE CRM IS BUILT ONTO THIS BACK END — ALL TEN PHASES, 10 TO 12 SEPTEMBER 2026 — AND ITS SCOPE
> WAS ONE FILE: `09-app/CAPREBATE-CRM-DISPOSITION.md`.** Every section and field of the two CRM
> requirements documents is marked there as already built, adopted, adopted under a rule, rejected,
> or a question — with what both documents omit — and **CRM 10 of 10 closed it**: every adopted row
> names the file and the test that built it (Parts G to Q), or the item of §5.5 that hands it to you.
> **The eleven adopted rows CRM 10 of 10 found unbuilt were built by the CRM follow-on, with the nine
> defects its guide's exercises found (Part R).**
> The two Word documents are archived in `_archive/superseded/`, and
> `README-phase125-supersession.md` beside them says where every section went. **Price the CRM
> from that table and this document, never from the Word files**: handed over as written they
> describe a rebuild of what is running, and several of their lines break §6.
>
> **Using it** — the administrator guide, the user guide by role, and training for every CRM
> screen — is the companion beside this file, `09-app/CAPREBATE-ADMIN-AND-USER-GUIDE.md`.
> **`node 03-app/caprebate-crm-fold-check.cjs` fails** when a disposition row loses its evidence,
> a question it cites is not in the questions document under that title, a route the code
> registers is missing from §3.1, a line reference in §4 stops landing on its name, or a CRM
> screen has no training section in the guide.

**Where this document and any of those disagree, say so rather than choosing.**
Four documents disagreeing about the same number is the failure this corpus has
had most often, and it is why every figure here was re-derived by running the
thing that produces it on 9 September 2026 — and why the next person should run
them again rather than quote this page.

---

# 1 · The user cases

**Written as cases, not as screens.** Each has an actor, a precondition, a main
flow, an outcome and — where the case has one — the alternative that matters.
**A developer should be able to test against these without opening a browser**:
every outcome names a row that exists afterwards or a refusal that happened.

**Ten actors, and two of them are commonly confused.** Six of them sign in as one of the six application roles — `APP_ROLES` in `src/roles.ts`, six since Phase 132e added READ_ONLY on 16 September 2026. The rule table registers **114 actions** (`REGISTERED_ACTIONS` in `src/authz.ts`); READ_ONLY holds **32** of them and is refused **82**, every one an explicit decision in `READ_ONLY_RULES`. Derived by code, not counted by hand: `node -e "import('./src/authz.ts').then(A=>console.log(A.REGISTERED_ACTIONS.length))"` from `09-app/backend`.

| Actor | Has a login? | What they are |
|---|---|---|
| **Prospect** | No | Runs the public assessment. Not yet anybody's client |
| **Client** | Yes, role `CLIENT` | A prospect who reached the close. Sees **their own record only** |
| **Sales** | Yes, role `SALES` | The pipeline and the claim: assessments, calendar, engaged clients, research and notes; organisations, contacts, properties and claims with the claim's value (CRM 1 of 10); leads, the enquiry gate and moving a claim through the procedure's gates (CRM 2 of 10); tasks and each claim's one next action (CRM 3 of 10); documents and the requests for them (CRM 4 of 10); introducers and referrals (CRM 5 of 10); the claim's facts, the four figures, the sign-off record, deliverables and aftercare (CRM 6 of 10); the pipeline tiles, search, lists, saved views and export (CRM 9 of 10) |
| **Admin** | Yes, role `ADMIN` | Super user: creates, re-roles and disables users. Reads the audit log, on its own page since the CRM follow-on (UC-B26). **Alone may reopen a claim**, always with a reason (CRM 2 of 10). Keeps the automation rules, the templates, the document types, the reward switch and the settings (CRM 3, 4, 5 and 9 of 10), merges a firm (CRM 9 of 10), and — **only because no other role exists** — the compliance registers (CRM 8 of 10) |
| **Accounting** | Yes, role `ACCOUNTING` | **Caprebate's own finance.** The client's name, the claim value, the fee, invoice and payment state, the VAT position — and, as documents since CRM 4 of 10, the fee invoice and the engagement letter once signed; since CRM 7 of 10, the claim's invoices, credit notes and money received, the fees expected at the invoice stage, and the VAT monitoring — **and nothing else** |
| **Read-only** | Yes, role `READ_ONLY` — **assigned to nobody** (Phase 132e) | The view-only login Lakhbir asked for: *"One main log in for admin/manager/owner, and another log for view only"*. Reads organisations, contacts one at a time, properties, claims **without their value**, leads **without the range shown**, the pipeline, bookings and the calendar, tasks, the timeline, documents that carry no value, the deliverables register and the settings screens. **Writes nothing** but its own password. **Never** the sealed estimate, the claim value or figures, the claim's tax facts, the survey workspace, the fee or any money, internal notes, paid research, the compliance registers, the identity store, the disclosure log or the audit log, and **no export**. Every action is an explicit yes or no in `READ_ONLY_RULES`; a test loops over the rule table, so a new action without a decision fails. No manager or tax-reviewer role was added |
| **Surveying** | Yes, role `SURVEYING` | The review-and-sign workspace — and, through an assigned survey job only, that job's property, claim and claim evidence. **Our estimate is not in their session, and nor is any document that can carry a value** |
| **The client's accountant** | **No login, ever** | A different actor from *Accounting* above. They file the claim, and they receive a computation pack **offline** |
| **An introducer** — a firm, and the people at it | **No login, ever** | Refers a client. A person at the firm is a contact of type INTRODUCER on the firm, and the firm hears how a claim progresses **only while the client's own yes stands** (CRM 5 of 10, CRM 8 of 10) |
| **The chartered tax adviser** | **No login** | Signs off the figure. **The sign-off is a record Sales keeps** — the firm or role, the credential, the date, the scope and the figure, hashed — never a signature and never a session (CRM 6 of 10) |

> **THE TWO ACCOUNTANTS ARE NOT THE SAME PERSON AND THE DISTINCTION IS LOAD-BEARING.**
> `ACCOUNTING` is a Caprebate staff role that sees an invoice. The client's own
> accountant sees the tax work and has no account. A build that gave the client's
> accountant the `ACCOUNTING` role would hand a third party Caprebate's fee ledger.

---

## Client-facing

### UC-C1 · A prospect runs an indicative assessment
- **Actor** Prospect · **Precondition** none; no account, no cookie beyond the draft token.
- **Flow** `Q1` prior claim (them) → `Q1a` prior claim (a previous owner) → `Q1b` tax status, with the profit question rendering **only** on *yes* → `Q1c` what prompted this → `Q2` the property repeater → `Q3` works → the figure.
- **Outcome** A row in `assessment_drafts` holding the state and the screen reached, keyed on an httpOnly draft cookie. **No `assessments` row and no `businesses` row yet.** The figure is computed by the engine package from the typed answers, in process, with no network call.
- **Alt · a gate fires** `Q1b` answered *no* reaches the reasoned negative (UC-C9) — the option reads *No, or we’re a charity*, and the engine gates the value `charity` as well. **`Not sure` does not terminate, and nor does no answer at all** — both continue, identically, and the condition is carried on the face of the figure.
- **Alt · resume** The draft cookie restores the last screen with the answers intact.
- **Test** `test/web.test.ts` walks Q1→Q3 over HTTP and asserts the engine's figure and the twelve answer rows, `Q1a` recorded as `DONT_KNOW` rather than as a blank.

### UC-C2 · A prospect closes: name, role, business, a channel and a time
- **Actor** Prospect · **Precondition** a draft exists and has reached the figure.
- **Flow** The close screen takes name, role in the business, business name, a **contact channel** (`phone` · `sms_whatsapp` · `email`) and a **per-channel consent**. Choosing telephone renders a slot picker built from staff working times.
- **Outcome** **This is where the lead is persisted, and it is the highest-consequence line in the funnel.** A `businesses` row, an `assessments` row, one `assessment_answers` row **per question asked**, an `estimates` row, a `contacts` row and a `bookings` row. An assessment that only ever existed in a draft is a lead nobody can call about.
- **Must never** Take an email or a phone number at `Q2`. Render the WhatsApp option while WhatsApp is absent from the published privacy notice and the processor list. Book a slot that was not offered — *the picker is a courtesy, the refusal on write is the control*.
- **Test** `test/web.test.ts`; the write path re-asks `isBookable` at the moment of writing, and there is a test that a time never shown is refused.

### UC-C3 · A client signs the engagement letter
- **Actor** Client · **Precondition** signed in; an `engagements` row exists in `SENT` or `VIEWED`.
- **Flow** The portal renders the letter **from the .docx that is the letter**, not from a re-typed copy. Open terms are shown blank and named. Reading it records `VIEWED`. Signing records `SIGNED`.
- **Outcome** `engagements.state = 'SIGNED'`, with the time. **That row is what `assertSignedEngagement` reads**, server-side, on every paid call — never a value the browser sent.
- **STUBBED** No signature provider is contacted and nothing is legally executed. The **state machine is real**; the execution is not. The screen says so.
- **Must never** Put a form field on the signing screen. Everything the letter says is displayed **before** it is frozen; a letter completed at the moment of signing cannot have been hashed before it was signed.
- **Test** `test/web.test.ts` (`engagements` transitions), and §4 lists the stub.

### UC-C4 · A client answers an outstanding question
- **Actor** Client · **Precondition** a `client_tasks` row in `SENT`.
- **Flow** The portal lists each open question with *why we are asking* and *what it holds up*. The client types an answer **or ticks “I don’t know”**.
- **Outcome** The task moves to `ANSWERED` recording **who answered it** and in which state. **`DONT_KNOW` is a first-class answer and is stored as a state, not as a blank** — that is what makes the "what is still missing" panel computable rather than hand-maintained.
- **Must never** Force a choice between two wrong answers. A form that does that has manufactured a fact (N4).

### UC-C5 · A client uploads a document
- **Actor** Client · **Precondition** signed in, on their own business.
- **Flow** Choose what the document is — from the types that have a receipt policy — and, if it is, a new version of one already sent, or upload it against a request → the server issues a **short-lived, single-key, single-use upload URL** → the bytes are PUT → **on that same request** the handler runs the receipt contract's steps 2 to 7. **The client does not type a file name**: a version's name is derived, because a file's name can be a person's (CRM 4 of 10).
- **Outcome** Under `FAIL_CLOSED_SETTINGS` the raw file **is never promoted to durable storage**; it is classified, segmented, stripped, the extract written, and **the unredacted original deleted with evidence recorded**. `documents` and `document_events` carry the trail. **The upload is a version of a document**: nothing overwrites, and it keeps its type's deletion clock at the moment it arrived. **A request it answers is RECEIVED — by the upload, never by a click.**
- **Alt · nobody can classify it** `E_UNRECOGNISED_DOC_TYPE`: the quarantine object is deleted and nothing is promoted. **The classifier refuses; it does not guess.**
- **Alt · a type with no receipt policy** No link is issued at all. Fourteen types wait on the data protection officer for one.
- **Alt · the link is used again** **409**, and nothing is written — a second write would put an unredacted copy back into a quarantine already discharged.
- **Alt · the client asks for it back** The download endpoint returns **410, not bytes** — the original was deleted and there is nothing to serve. Inventing a copy would undo the control.
- **Alt · from a browser.** The portal's link leads to **Your upload link is ready** — a form with a file picker and no script. The browser sends the file as a multipart `POST` to the same `/upload/put` address, **through the same handler with the same single-use key**: steps 2 to 7 on that request, the request it answers RECEIVED, a send with no file refused, and a second send answered **409**. A `PUT` works as before for anything that is not a browser. *CRM 10 of 10 found this not finishable by running the guide's exercise — the page asked for a `PUT` and the content security policy allows no script — and the CRM follow-on made it finishable.*
- **Must never** Promote before the strip has run (`E_PROMOTE_BEFORE_STRIP`). Report success while an unredacted document is still held. Run any model over a `CPSE_REPLIES` or `SALE_CONTRACT`: both are `HUMAN_READ_ONLY`.
- **Test** the 39 handler tests in `04-phase-work/phase3/caprebate-upload-handler.test.ts`, plus `test/web.test.ts` end to end over HTTP, and `test/documents.test.ts` — every receivable type through the handler, and a request received by a PUT through the portal — and `test/follow-on.test.ts`, a client finishing an upload from a browser.

### UC-C6 · A client tracks the claim
- **Actor** Client · **Flow** The portal shows the range they were shown with its qualifier, the stage **in the client's own words**, the letter, the appointment, the open questions, their documents and their account settings.
- **Must never** Show internal state. Where the recorded stage is not one the portal knows, it **says so** rather than guessing.

### UC-C7 · A client manages their own account
- **Actor** Client · **Flow** Display name, username, password, profile photograph.
- **Outcome** A password change **rotates the session**, on both mountings of the settings screen, because there is one implementation.
- **Must never** Let an ADMIN edit somebody's name or photograph. **Admin power is over an account, not inside it** — `user.change_own_profile` and `user.set_photo` are `self` for every role including ADMIN.

### UC-C8 · A prospect or client signs in
- **Flow** Email and password → server-side session → **`can()` decides where they land**, back office or portal.
- **Outcome** A `sessions` row. Cookies httpOnly, secure, sameSite; rotation on privilege change; revocable — **disabling a user ends their live sessions at once, not at next login**.
- **Must never** Say *no such user*. Every failure is the same message, and an unknown address still pays for a real argon2id verification so the timing does not answer the question either.

### UC-C9 · A prospect reaches a reasoned negative — and can still ask for a call
- **Actor** Prospect · **Precondition** a draft whose Q1b answer the engine gates: `CB_FRONTDOOR.gateQ1b` returns `gated: true`, for *no* or *charity* and nothing else.
- **Flow** `Q1b` → `/assessment/no-claim`, which **names the gate that fired, in the engine's words**, and offers a call in CB_BOOKING's gated-exit words → `/assessment/close`, the same form as UC-C2 under the gated-exit offer → the thank-you.
- **Outcome** **A lead, origin `GATED_EXIT`, with no organisation** — there is no property and no sector to make one from — carrying the business name the prospect gave. The person is a `contacts` row and the call a `bookings` row, **each belonging to the lead** (`lead_id`, no organisation; migration 011; disposition row E22). A telephone slot is held in `bookings`, where the clash check reads, and the call is in the calendar's queue. The draft is closed on the lead. **No `businesses`, `assessments` or `estimates` row.** If the prospect later takes the assessment and staff link the lead to the organisation it creates, conversion moves **the same** contact and booking onto it.
- **Must never** Produce a figure, or print a range on the thank-you, or say an assessment was recorded. Let a stopped draft reach `Q1c`, `Q2`, `Q3` or the figure by typing the address. Route *not sure* or no answer here, or an unknown past here into a favourable branch. Answer 500. **Until 11 September 2026 the gate never fired** — the renderer read a field called `stop`, which the engine does not return, and the declaration beside the package named it too — **and the close answered 500**, taking the sector from a property that did not exist.
- **Test** `test/gated-exit.test.ts` — both reproductions, red before the repair and green after; *no* and *charity* stop, and *not sure* and never-asked continue and read identically; the contact, the booking and the audit line; the held slot; the calendar, the booking and the lead page as SALES, and the lead refused to SURVEYING; conversion moving the same rows; the rebuilt tables and the DO_NOT_CONTACT control.

### UC-C10 · A client reads what we have issued to them — CRM 6 of 10
- **Actor** Client, on their own claims · `deliverable.read`, admitted for a client by `clientDeliverable` in `src/authz.ts`.
- **Flow** The portal lists an issued reasoned negative, an issued s.203 notification, and an issued client report **once its figure is released** — each with its version and its date.
- **Must never** Show a figure there; list a draft, or a client report before the tax adviser's sign-off; move the portal's stage for a claim that exited as a reasoned negative — the client is told through its deliverable.
- **Test** `test/claim-record.test.ts`.

### UC-C11 · A practice refers a client through the public form — CRM 5 of 10, SHIPPED OFF
- **Actor** Anyone at an introducing practice, with no login · **Precondition** `REFERRAL_FORM.enabled` in `src/web/introducers.ts` — **false until a privacy notice is published that tells a referred client what a firm passed to us**.
- **Flow** Shut, `/refer` answers exactly as a path that does not exist, and writes nothing. Open: the practice, the person referring, their email and telephone, the client business's name, its sector, a postcode or its first half, what happened at the property and the year, and the practice's confirmation that its client agreed → a lead of origin REFERRAL on **a new firm row marked as from the form**, never matched to a firm already recorded; Admin merges a duplicate (UC-B25).
- **Must never** Write anything without the confirmation; put a person on the lead; draw a script.
- **Test** `test/introducers.test.ts` — shut and open.

### UC-C12 · A referred client stops sharing their claim's progress with the firm that referred them — CRM 8 of 10
- **Who** the CLIENT, on their own organisation. **Does** withdraws a yes from the portal; the next notice to the firm is not queued. **Giving a yes from the portal is built and ships OFF** (`CLIENT_SHARE_GIVE` in `src/web/introducers.ts`) until the words are agreed — staff still record a yes, having asked.

---

## Staff-facing

### UC-B1 · Sales triages the filled assessments
- **Actor** Sales or Admin · **Precondition** `backoffice.enter`.
- **Flow** The list of filled assessments → one assessment → the answers as asked, the derived facts, and the range.
- **Must never** Let ACCOUNTING or SURVEYING read this list. Neither appears on `assessment.read` for the list's own purposes; SURVEYING reaches the **inputs** of a job it is assigned to, through the payload assembler, and never the estimate.

### UC-B2 · Sales works an engaged client's business page
- **Actor** Sales or Admin · **Precondition** the business is engaged.
- **Flow** Five panels: **1** the questions and answers · **2** the sources, what has fired and what has not · **3** what is still missing · **4** tasks · **5** internal notes.
- **The list at panel 3 is DERIVED, and that is the requirement** — from `CB_REGISTRY.derive()`'s own `ask` and `why`, from answers in `DONT_KNOW` or `SKIPPED`, and from cash gates that are `null`. **A hand-written checklist would drift.** Anything the attribution does not recognise is reported as blocking **both** packs: over-reporting a blocker is recoverable, under-reporting one sends a pack out incomplete.
- **The list of engaged clients says who is holding each one up**, computed from four real facts rather than from a stage name — and **where both sides are waiting, it reads as ours**, because that is the queue a person can act on.
- **Must never** Render an internal note without escaping it. Staff-supplied text in a staff page is where stored cross-site scripting lives; there is a test that posts a script tag and asserts what comes back.

### UC-B3 · Sales runs the research
- **Actor** Sales or Admin · **Precondition** `research.run` on that business.
- **Flow** One button — **Run the research** — fires **everything outstanding**.
- **Outcome today** A `research_runs` row, and every source recorded `NOT_PERMITTED_YET` with the reason: free sources wait on a published privacy notice, paid sources wait on a signed engagement. **Nothing is contacted, because no connector exists.**
- **Must never** Build a per-call confirmation — *the operator picks the moment, not the calls*. Build a second gate: `CB_REGISTRY.precondition` exists, is `false`, and its own `requires` string says why. Make a shut gate throw, error a screen, render a source as *unavailable*, or substitute `0` or `null` for a fact a paid call would have supplied — **that last one is an N4 breach**.
- **Test** `test/engaged.test.ts`; and a source added to the register but not to the tier table is treated as **PAID**, with a test that asserts it.

### UC-B4 · Sales or Admin schedules and reschedules a call
- **Flow** The calendar shows bookings by day or week and the ones with no time yet; giving one a time asks `isBookable` again on write.
- **Outcome** `bookings` updated and a `booking_changes` row. **Stored times are ISO-8601 UTC; screens show UK time.** Phase 113a put the conversion at the display and input edges only (`src/web/localtime.ts`, the one file that names a zone) and left every stored value and every comparison in UTC. Working times are LOCAL minutes against a LOCAL weekday and are converted per candidate day when slots are generated — a person's hours are local hours. The offset comes from `Intl` at the instant in question, never from a constant.

### UC-B5 · Admin creates a user and assigns a role
- **Actor** Admin alone · **Flow** Create with a role, change a role, disable.
- **Outcome** A `users` row and an audit line. **Disabling ends live sessions immediately.**
- **Must never** Let an ADMIN change another user's display name, username or photograph. Creating, re-roling and disabling are admin powers; editing someone's identity from the inside is impersonation with a paper trail that reads as the person themselves.

### UC-B6 · Accounting raises an invoice on the claim, records what arrived, and watches the VAT threshold — extended by CRM 7 of 10
- **Actor** Accounting or Admin · `invoice.read`; `invoice.raise`; `invoice.write` (sent, cancelled); `invoice.credit`; `invoice.record_received`. A finance setting is `finance_setting.write` — **Admin alone**.
- **Flow** The finance view lists, by month, what was invoiced, credited and received, what is outstanding and what is overdue, and the fees expected from claims at the invoice stage — each of those claims with **the finance task the invoice stage already raised, read and never duplicated**. **Our fee is raised on the claim** once it is at the invoice stage, the fee trigger is reached at `FEE_TRIGGER`'s own reading, and the claim is inside the amendment window: the figure is the tax adviser's signed-off figure, the fee is CB_FEE's through the fee controls, the VAT is read from the recorded VAT position, and the number is the next in **one gapless series**. A raised invoice is recorded as sent, or cancelled before it is sent — its number then recorded as cancelled and never reused. **A credit note is the only way a raised amount changes**: in full, or clause 13's recalculation, which is switched off. **Money received is a row**: the day, the amount, bank transfer, who recorded it, and whether the client confirmed our bank details on a channel other than email. The outstanding balance, the payment state and **overdue are read**, never typed. The VAT reading — the rolling twelve months by tax point and the thirty-day test, against the dated threshold — warns inside the margin and raises **one** staff task waiting with Accounting.
- **Outcome** `invoices` (on the claim, `business_id` beside it), `invoice_numbers`, `invoice_credit_notes`, `invoice_payments`, `finance_settings`, and a `staff_tasks` row about Caprebate itself. Audited `INVOICE_RAISED` (a refusal with its code), `INVOICE_SENT`, `INVOICE_CANCELLED`, `CREDIT_NOTE_ISSUED`, `MONEY_RECEIVED_RECORDED`, `MONEY_RECEIVED_VOIDED`, `FINANCE_SETTING_RECORDED`, `VAT_CHECK_RUN` — never an amount.
- **RECORDED, NOT COLLECTED.** There is **no card processor anywhere in this build**, by decision. Nothing tells the system a transfer arrived — a person who has seen the bank records it.
- **N4** The letter's payment terms are blank, so **the due date is UNSET and shown as unset — never thirty days** — and an invoice with no due date is not overdue. No VAT position recorded refuses the invoice. A bank-details confirmation never asked reads exactly as one recorded as not known. A threshold not in effect reads *cannot say* and raises no task.
- **The fee controls — built, shipped off, one switch each** (`src/web/fee-controls.ts`): our fee above the first-year saving (CAP, WARN or ADJUST_RATE); a minimum fee per sector, every amount unset; the break and abort fees read from the letter — **BLANK today, and shown BLANK on every screen**. Off is exactly today's behaviour, and a test proves it.
- **Must never** Let ACCOUNTING reach the questions and answers, the register data, the internal notes, the surveyor's workings or the estimate — enforced **twice**, in the rule table and in the shape of the finance tables, which carry no join to any of them. Raise an invoice on a claim that has exited. Take a typed amount for an invoice or a credit note. Build the invoice email.
- **Test** `test/finance-claim.test.ts`, `test/finance.test.ts`.

### UC-B7 · A surveyor reviews a job and commits their figures
- **Actor** Surveying, **assigned to that job** · **Precondition** `surveyor_job.enter` and `surveyor_job.read` via `assignedSurveyor`.
- **Flow** Six panels: **1** the property · **2** the room schedule and the quantities · **3** the rates · **4** the evidence · **5** their figures · **6** the record.
- **Outcome** A `surveyor_commitments` row, hashed and timestamped, and **the anchor quarantine releases the estimate automatically on commitment** — no override, no support ticket, nobody to ask.
- **THE CONTROL THAT DEFINES THIS CASE** Our estimate is **not in the response** their session receives. Not hidden, not greyed, not rendered — **absent**. §6 carries the test.
- **Every page load writes a log line, and that is the module working.** Opening a sealed job as a surveyor writes an `ACCESS_DENIED`; six refreshes leave six. **It must not be de-duplicated** — a denied attempt is evidence in its own right, and a build that suppressed repeats would be deciding which attempts to record.
- **STUBBED** There is no signature provider. *Sign off* here means the surveyor **commits** figures with a method note, which is recorded, hashed and timestamped — and which is the thing the quarantine actually turns on. It is not an executed document and the workspace does not pretend it is.
- **The blank-field control — always on, Phase 132.** One field in ten on each job is shown **with nothing in it**: no platform proposal and not the surveyor's own library figure either, with a line saying the gap is deliberate. `isBlankControl` in `04-phase-work/phase3/caprebate-surveyor-crm.ts` picks the field from the job and field ids, so the arm can be rebuilt from the job id. The figure is still the job's rate, in `surveyor_rate_events` with `blank_control` set; **on a commitment, on a CLEAN job, with the review box ticked**, it is also one row in `surveyor_control_observations`, which is never changed. An EXPOSED job writes no control row and the commitment goes ahead. It has no switch because it cannot be added later to jobs that were already shown a pre-fill.
- **The "I looked at this field" box starts unticked — Phase 132.** Ticked by default, it recorded every field nobody touched as reviewed. A box left unticked and a posted "not sure" both read as not reviewed (N4).
- **Test** `test/surveyor.test.ts` (42 assertions) and `tools/payload-proof.ts`.

### UC-B8 · Everyone sets their own working times
- **Flow** Staff set their own hours; ADMIN and SALES read everyone's because the calendar cannot offer a slot otherwise; ACCOUNTING and SURVEYING read only their own; CLIENT reads none.
- **Nobody available is an answer, not an empty list.** Four states — *nobody set any hours*, *the window is full*, *there is nobody to set them*, *those hours have passed* — because they lead to four different actions.

### UC-B9 · Sales keeps an organisation's record — CRM 1 of 10
- **Actor** Sales or Admin · **Precondition** `organisation.read`; writes need `organisation.write` and `contact.write`.
- **Flow** The organisation list → one organisation → its legal and trading names, company number, claimant type, addresses, website, status, source and owner; its contacts; its properties; its claims. Add a contact, add a property.
- **Outcome** `businesses` updated in place (migration 009 **extends** it — nothing parallel), `contacts` rows, `properties` rows, and an `ORGANISATION_UPDATED` / `CONTACT_CREATED` / `CONTACT_UPDATED` / `PROPERTY_CREATED` audit line naming **which fields changed, never their values**.
- **DERIVE, DO NOT RE-KEY.** The legal name and company number come from a Companies House register record where one is held; the claimant type from the client's own entity answer in the assessment. **Where a fact is derived the store refuses a recorded one**, so the question is not asked twice.
- **DO_NOT_CONTACT is a control, not a label.** Setting it stops the outbox queuing anything to that organisation — by its id, its contact channel, any of its contacts' addresses, or a client login belonging to it — in `src/stubs/email.ts` and again in a trigger on `outbox`.
- **Referred by — the CRM follow-on.** The firms whose referrals became the organisation's leads are read through those leads onto the page and onto `GET /staff/organisations/{id}/view.json`, for `introducer.read` — never a column and never typed. With none, it reads *no firm — none of this organisation's leads came from a referral*.
- **Must never** Give a client's accountant or adviser a login: they are contacts. Put a person's name on `businesses`. Render a contact's notes, a website or any other staff-supplied text unescaped — a website is shown as text, never as a link.
- **Test** `test/crm.test.ts`; `test/follow-on.test.ts` for the firms read through the leads.

### UC-B10 · Sales records a property — CRM 1 of 10
- **Actor** Sales or Admin (`property.write`); SURVEYING reads a property **only through a survey job assigned to them on its organisation** (`property.read`, `throughAssignedJob`).
- **Flow** Address lines, postcode, jurisdiction, type, use, tenure, occupier, acquisition date and price, completion and disposal dates, previous owner, construction notes, whether allowances were claimed before, prior claim notes. What the client said about this property in the assessment is shown beside it **with its source and never copied in** — a month or a year is not a date.
- **The jurisdiction is derived from the postcode through `src/web/postcode.ts` wherever the resolver can, and a recorded one is then refused**; a postcode change that makes it derivable clears the recorded one.
- **N4** *Not known* and *never asked* on `existing_ca_claimed` (and on tenure) produce the same reading and the same words, and neither passes anything — `priorClaimRuledOut` is true on a recorded NO and nothing else. **Since the CRM follow-on the position is derived where the funnel's own answer states it**: a *yes* at Q1 on a draft of one property reads *Yes — the client's own answer in the assessment*, and a recorded answer is then refused and a stored one cleared, as the jurisdiction's is. *Not sure*, *no* and a question never asked derive nothing and read exactly as before — a derived NO does not exist. **N2** A previous owner or occupier is a company name ending in a registered designation, or a role token such as `INDIVIDUAL_NOT_RECORDED` — **never a person's name**, refused by the store.
- **Survey status, date and surveyor are not here**: they belong to the claim.

### UC-B11 · Anyone admitted opens a claim — CRM 1 of 10
- **Actor** `claim.read`: ADMIN, SALES, ACCOUNTING, and SURVEYING **through a survey job on that claim's own assessment**. `claims.surveyor_id` is a record, not an access grant.
- **Flow** The header (reference, client, property, stage, owner, next action) and the overview (workstream, priority, surveyor and who can reach the claim, acquisition, tenure, jurisdiction, prior-claim position, expected completion, hold and lost reasons). Staff open a second claim on a property for another relief.
- **Built forwards, role by role.** ADMIN and SALES get the **value** (`claim.read_value`): the range the client was shown and the sealed estimate. **ACCOUNTING gets client, reference and money** — the claim's own invoices, since CRM 7 of 10 — and nothing else. **SURVEYING gets no estimate-derived figure**, and the payload proof searches the claim and property routes for all seven.
- **Where it came from, the team and our estimated fee — the CRM follow-on.** `lead.read` draws **Came from** and **Source**: the lead the claim was converted from, or the organisation's source where staff opened the claim on a property. `introducer.read` adds the firm, read through the lead. **The claim team** draws the owner and the surveyor; for `contact.read`, the organisation's own accountant and adviser linked to this claim (`claim_contacts`, migration 020 — linked and taken off by `claim_team.write`, ADMIN and SALES, audited `CLAIM_TEAM_LINKED` and `CLAIM_TEAM_UNLINKED`, never deleted); and for `claim_figures.read`, the tax adviser **as their sign-off record**, never as a person. **Our estimated fee** is drawn for `invoice.read` alone — ADMIN and ACCOUNTING — while no fee invoice is live. It is the finance view's own computation (`expectedFeeFor` in `src/web/vat.ts`), and reads UNKNOWN, never nought, where no signed figure is recorded. A surveyor is drawn the owner and the surveyor and nothing else; ACCOUNTING no team and no origin.
- **Outcome** `claims` updated, `CLAIM_UPDATED` audited. **The stage is not writable here** — CRM 2 of 10 moves it through the procedure's gates — **and nor is the next action**, which the form refuses with its reason. A claim's reference (CR-2026-0001) is never reused and **a claim cannot be deleted**: both refused by the database.
- **Test** `test/crm.test.ts`, `test/follow-on.test.ts` and `tools/payload-proof.ts`.

### UC-B12 · Sales works a lead — CRM 2 of 10
- **Actor** Sales or Admin — `lead.read`, `lead.write`, `lead.convert`. **ACCOUNTING, SURVEYING and CLIENT are refused every lead route.**
- **Leads are not a second intake.** A filled assessment, a call asked for at the close, a gated exit and a referral are already leads; `leads` ties them together. **The funnel's close records a lead and opens no claim.**
- **Flow** The lead list → one lead: what made it a lead, its source, owner, priority, next action and status; what the assessment captured — the spend answers as the client gave them, and the range they were shown; **the enquiry gate's four checks** — a UK healthcare property, a trading client (rule 13(a)), the enquirer is the owner or acts with the owner's authority, no existing claim conflict — each recorded YES, NO or UNKNOWN with who and when, beside what the build already holds that bears on it; then **convert**.
- **Outcome** `leads` updated and `enquiry_checks` appended. **Converting asks the gate again at the write** and opens the claim at ASSESSMENT — on the organisation's first property unless another of its own is named, carrying the lead's assessment, its reference from the same series — with an OPENED row in `claim_stage_moves`. Audited `LEAD_CREATED`, `LEAD_UPDATED`, `ENQUIRY_CHECK_RECORDED`, `LEAD_CONVERTED`, `CLAIM_CREATED`.
- **N4** A check recorded UNKNOWN and a check never asked read identically and neither passes. Nobody is made to guess: *not known* is an answer.
- **Must never** Score a lead, or rank one on the estimate; put a person on a lead; qualify or convert without four recorded YES; set CONVERTED by hand; un-convert or delete a lead. A referral with no organisation converts only once linked to the organisation its assessment created.
- **Test** `test/leads.test.ts`; the funnel half in `test/crm.test.ts`.

### UC-B13 · Sales moves a claim through the operating procedure — CRM 2 of 10
- **Actor** `claim.move` — Sales or Admin; `claim.reopen` — **Admin alone**; the board, `pipeline.read` — Sales or Admin.
- **The stages are the procedure's**, transcribed into `src/web/stages.ts` and tested against `08-monday-doc-exports/12552682457__Item-2-Standard-Operating-Procedures-enquiry-to-defence-pack.md`: ENQUIRY, ASSESSMENT, ENGAGEMENT, DATA_GATHERING, SURVEY, VALUATION, TAX_ADVISER_SIGNOFF, REPORTS, INVOICE, DEFENCE_PACK, then CLOSED. **Exits keep the record**: DECLINED_AT_ENQUIRY, CLIENT_DID_NOT_PROCEED, CLIENT_DECLINED_TO_SIGN, REASONED_NEGATIVE, CLIENT_WITHDREW, OUTSIDE_AMENDMENT_WINDOW (from any stage), CANCELLED, LOST. ON_HOLD carries its reason and the stage it returns to.
- **Flow** The board: a column per stage, a lane for ON_HOLD, the exits below. A card carries the reference, client, property, owner, next action, days since its last move, and — only for a reader of the estimate — the range shown; its button asks to move it one stage on. The claim page's pipeline panel: the steps, the gate out of this stage with each need met or not, the confirmations, exits with listed reasons, hold and resume, reopen, and every move.
- **Every gate is on the server and is asked again at every write:**

  | Out of | Opens on |
  |---|---|
  | ENQUIRY | the four enquiry checks, each a recorded YES — on the claim or on its lead |
  | ASSESSMENT | an assessment on record for the organisation |
  | ENGAGEMENT | `assertSignedEngagement` in `src/web/research.ts` — **the only engagement gate** |
  | DATA_GATHERING | a recorded confirmation, since the claim entered the stage |
  | SURVEY | a `surveyor_commitments` row on a survey job **on this claim** |
  | VALUATION | a recorded confirmation |
  | TAX_ADVISER_SIGNOFF | `claims.tax_adviser_signoff_at` — **null on every claim and written by nothing: shut until CRM 6 of 10** |
  | REPORTS | the sign-off again, the client's acceptance and the accountant's confirmation |
  | INVOICE | the fee trigger at its most cautious reading — HMRC processing the relief — and **this claim's own** fee invoice raised and not credited in full (CRM 7 of 10; an organisation's invoice no longer opens it) |
  | DEFENCE_PACK | a recorded confirmation; the claim closes and records its completion date |

- **Mandatory documents — built and SHIPPED OFF** (`MANDATORY_DOCUMENTS` in `src/web/mandatory-documents.ts`, the CRM follow-on). Switched on, the gate out of DATA_GATHERING also asks for a received document of each type its table requires — the fire risk assessment on every claim; the grant agreement, the sale contract and the lease where a held fact says so — and a condition not known neither passes nor excuses. A request is not a receipt. Off, the gate is exactly today's. Which documents, and at which stage, waits on Lakhbir: *"Which of the Stage 2 documents are mandatory, and at which stage?"*
- **Outcome** `claims.stage` changed; a row in `claim_stage_moves` (who, from, to, the reason's code and its text); `CLAIM_STAGE_MOVED` audited with the code and **never** the text; a refused move audited as REFUSED. `businesses.stage` is **raised** to the client label the organisation's most advanced open claim evidences, and never lowered.
- **Must never** Skip a stage; move a claim backwards except by an admin's reasoned reopen, and never past where it has been; let a confirmation stand in for the surveyor's commitment or the tax adviser's sign-off; open TAX_ADVISER_SIGNOFF before CRM 6's record exists; show a claimable figure to a client before it; delete a claim on an exit; give SURVEYING more of the panel than the stage and its steps.
- **Test** `test/pipeline.test.ts` — one skip test per gate, each with its negative control — and `tools/payload-proof.ts`.

### UC-B14 · Staff keep one next action on every claim, and work their tasks — CRM 3 of 10
- **Actor** `staff_task.create` and `staff_task.write` — Sales or Admin. `staff_task.read` and `staff_task.progress` — Sales and Admin on every task; **Accounting and Surveying on their own tasks and the ones waiting with their team**, and a surveyor only on a claim an assigned job reaches. The claim's next action `claim.write`; the list of claims breaking the rule `pipeline.read`; the timeline `timeline.read`.
- **Flow** Every staff role lands on **My tasks**: what they own and what waits with their team, overdue first; the questions they put to a client that are past due; the claims they own that break the rule — and, for Sales and Admin (`pipeline.read`), **the open claims nobody owns that break it**, which no owner's list would carry (the CRM follow-on). A task is about a claim, a property, an organisation or a lead, and may name a contact; it has an activity type, a priority, a due date or none, and a recurrence that creates the next task when it is completed — not a scheduler. The claim page's **Next action and tasks** panel sets the claim's one next action, a person and a date, and says who is waiting — the engaged-client list's own answer. `/staff/next-actions` lists every open claim breaking the rule and every overdue next action. The **activity timeline** on the claim, organisation, property and lead pages is a read over what is already recorded, and **internal notes are drawn apart from it**.
- **Outcome** `staff_tasks`; `client_tasks.due_on`; `internal_notes.claim_id` and `property_id`. Audited `STAFF_TASK_CREATED`, `STAFF_TASK_UPDATED`, `STAFF_TASK_STATUS_CHANGED`, `NEXT_ACTION_SET`, `INTERNAL_NOTE_ADDED` — ids and field names, never a title, a note or a reason.
- **N4** A task with no due date is not overdue and not on time; overdue is a due date before today's UK date. A contact's last contact is derived — a cancelled call, an unsent email and silence read the same: no contact recorded.
- **Must never** Merge a staff task into `client_tasks`; delete a task — it is cancelled, with a reason; let a stage move leave an open claim without one next action with an owner and a due date; decide who is waiting a second way; build a second event log; put a note among the timeline's events; give Accounting a non-financial event, or a surveyor anything outside an assigned job.
- **Test** `test/tasks.test.ts` and `tools/payload-proof.ts`.

### UC-B15 · Admin keeps the automation rules and the email templates — CRM 3 of 10
- **Actor** `automation_rule.write` and `email_template.write` — **Admin alone**. `automation_rule.read`, `email_template.read` and `email.queue` — Admin and Sales.
- **Flow** A rule is one trigger — a lead created, a stage entered, a document requested, a task completed, an owner changed — and one effect: a task from the rule's template, a follow-up task, a notice to the owner written to the outbox, or information-request tasks generated from the business page's derived missing list. Nine rules are seeded from the full specification's section 14, re-keyed onto the procedure. **Every rule matching an event writes a run** — RAN, or NOT_RUN and why — listed on `/staff/automation`. A template merges six fields for one of the claim's organisation's contacts and is queued from the claim page. A rule that asks the client for a document is saved from the screen with the document it asks for — the form dropped it until the CRM follow-on.
- **Outcome** `automation_rules`, `automation_runs`, `staff_tasks`, `email_templates`, `outbox` — every row `sent_at` NULL. Audited `AUTOMATION_RULE_CREATED`, `AUTOMATION_RULE_UPDATED`, `AUTOMATION_RAN`, `EMAIL_TEMPLATE_CREATED`, `EMAIL_TEMPLATE_UPDATED`, `EMAIL_QUEUED`.
- **Must never — each refused, each with a test** Open either register gate; move a claim or record a confirmation; flip a tax adviser's switch; fire a register call or run the research; send anywhere but the outbox; write to a DO_NOT_CONTACT organisation; create an invoice email. And a template carrying bank details or an invoice, a merge field that is not one of the six, a merged value unescaped, or a missing value rendered as an empty string.
- **Test** `test/automation.test.ts`.

### UC-B16 · Staff keep a claim's documents, and ask the client for the ones missing — CRM 4 of 10
- **Actor** `document_request.create` and `document_request.withdraw`, `document.link`, `document.upload` — Admin and Sales. `document.read` — decided by the document's type: **claim evidence** Admin, Sales, a surveyor on an assigned job, and the client; **the claim team's papers** Admin, Sales and the client; **the fee invoice** Admin, Accounting and the client; **the engagement letter** Admin, Sales, the client, and Accounting once it is signed — never a surveyor. A type that can carry a claim value, a tax benefit or a fee is never claim evidence, and the client does not read one other than their own letter and invoice. `document.read_original` — Admin and the client.
- **Flow** The claim page's **Documents** panel lists the documents linked to the claim — directly or through its property — each with its versions and its current version's deletion clock; the requests on the claim, outstanding first, **OVERDUE** by the UK date; a form to ask the client for a document of a type with a receipt policy, saying why and what it holds up, with a due date or none; an upload through the same handler; and a form to link one of the organisation's documents. A document's page shows its type, who may read it, the receipt strip, its links and **every version**. A request reaches the client's portal beside an upload button, and **creating it fires the automation's document-requested trigger**. The requests a person raised that have not arrived are on their landing page.
- **Outcome** `logical_documents`, `documents` with its version columns, `document_links`, and `client_tasks` of kind DOCUMENT. Audited `DOCUMENT_VERSION_STARTED`, `DOCUMENT_LINKED`, `DOCUMENT_UNLINKED`, `DOCUMENT_REQUESTED`, `DOCUMENT_REQUEST_RECEIVED`, `DOCUMENT_REQUEST_WITHDRAWN`, and `DOCUMENT_ACCESSED` on every read, allowed or refused — ids, type codes and version numbers, never a file name or what a request says.
- **The document centre — the CRM follow-on.** `GET /staff/documents` lists every document the reader may read, across every organisation and claim, **each row asked of `document.read`** — `document_centre.enter` admits the four staff roles to the list and to nothing in it. Fixed filters (type, organisation, claim, state) and fixed orders; anything else is dropped and said. It never searches what a document says and has no export. CLIENT is refused: the portal is the client's list.
- **N4** A request with no due date is neither overdue nor on time. A deletion clock nobody set and one not on the list read identically: UNSET, and no date.
- **Must never** Mark a request received by a click — the portal, the business page and the table each refuse it; overwrite a version, or delete a version, a document or a link; take a file name from the client; receive a type with no receipt policy; show a surveyor a document that can carry a value, or Accounting anything but the fee invoice and the signed letter; build a second upload handler or a second event log.
- **Test** `test/documents.test.ts` and `tools/payload-proof.ts`.

### UC-B17 · Admin keeps the document types — CRM 4 of 10
- **Actor** `document_type.write` — **Admin alone**. `document_type.read` — Admin and Sales.
- **Flow** Twenty-five types are seeded: the Stage 2 upload list's ten, the planning specification, and fourteen from the CRM specification's list. Each says who may read it, whether it can carry a value, its deletion clock — **RET-7** for the eleven with a receipt policy, derived and not approved, so no date; **UNSET** for the rest, and shown as UNSET — and whether an upload of it can be received at all. Admin changes a label, the readers, the clock and whether a type is active, and adds a type.
- **Must never** Bind a type to a receipt policy from the page — only a migration does, and a type Admin adds is recorded and never received; unset a type's value flag; make a value-carrying type claim evidence; delete a type.
- **Test** `test/documents.test.ts`.

### UC-B18 · Sales keeps the introducing firms and records a referral — CRM 5 of 10
- **Actor** `introducer.enter` — Admin, Sales and Accounting. `introducer.read`, `introducer.read_value` and `introducer.write` — Admin and Sales. `introducer.read_money` — Admin and Accounting. **An introducer is a firm and never a user; nobody at it has a login.**
- **Flow** `/staff/introducers` lists every firm with its kind, owner, last contact, next contact and what it has sent — leads referred, claims opened, claims won and reasoned negatives, **read by query every time**. A referral — the firm, the person referring, the client business's name, sector and property basics — becomes a lead of origin REFERRAL whose source is **derived from the firm's kind**, with the firm as its introducer and **no person on the lead**: the person is a contact of type INTRODUCER on the firm. It converts only once linked to the organisation the client's assessment creates. Contact with a firm is **a staff task on the firm** — a call, email or meeting logged as done, or planned with an owner and a date — and the last and next contact are read from those tasks. A firm's page shows the estimated value of what it referred to Admin and Sales, and the fees invoiced and the money received from those claims — **the referred claims' own invoices**, since CRM 7 of 10 — to Admin and Accounting — **Accounting's view is the firm's name and the money, and nothing else**.
- **Outcome** `introducers`, `contacts` with `introducer_id`, `leads` with `introducer_id` and three property basics, `staff_tasks` with `introducer_id`. Audited `INTRODUCER_CREATED`, `INTRODUCER_UPDATED`, `CONTACT_CREATED`, `LEAD_CREATED` (route `referral_intake`), `STAFF_TASK_CREATED` — ids and codes, never a name or a note.
- **N4** Only the client business's name is required. A sector, postcode, event or year not given stays not given; a claim with no sealed estimate is counted as having none, never as nought; an invoice with no fee is counted apart — and since CRM 7 of 10 a claim's invoice cannot be raised without one.
- **Must never** Create a user for a firm or a person at one; put a person on a lead; attach a public form's firm to one already recorded; store a count, a value or a fee on the firm.
- **Test** `test/introducers.test.ts` and `tools/payload-proof.ts`.

### UC-B19 · Sales records whether the client wants progress shared with the firm, and Admin keeps the reward model — CRM 5 of 10
- **Actor** `share_consent.read` and `share_consent.record` — Admin and Sales. `introducer_reward.read` — Admin, Sales and Accounting; `introducer_reward.switch` — **Admin alone**. `introducer_fee.read` — Admin, Sales and Accounting; `introducer_fee.disclose` — Admin and Sales; `introducer_fee.record_settled` — Admin and Accounting.
- **Flow** The lead page reads the client the words of the current wording version and records their answer — yes, no or withdrawn — against the client and that firm. **A stage notice** — referred, indicative range issued, engaged, report delivered, fee settled, and a reasoned negative, each on entering the procedure stage it maps to — **is written to the outbox only while that answer is yes**, to the one person at the firm named to receive notices, carrying the client's name and the stage and never a figure, a document or a person; a reasoned negative carries the listed reason and never the note. A yes tells the firm where the claim stands, once. Every notice that falls due is kept — queued, or not queued with the reason. **The reward model ships off**: A, no cash and firm-level reciprocity logged as tasks on the firm; B, a fixed fee per successful claim paid to the firm. The switch **refuses to leave off while clause 1 of the engagement letter is blank**, read from the `.docx`. Under B a referred claim that closes accrues the fee; nothing is payable until its disclosure to the client is recorded.
- **Outcome** `introducer_share_consents` (append-only), `introducer_notices` (append-only), `outbox`, `introducer_reward_setting`, `introducer_fees`. Audited `SHARE_CONSENT_RECORDED`, `INTRODUCER_NOTICE` (REFUSED when not queued), `INTRODUCER_REWARD_SWITCHED` (REFUSED with `CLAUSE_1_BLANK`), `INTRODUCER_FEE_ACCRUED`, `INTRODUCER_FEE_DISCLOSED`, `INTRODUCER_FEE_PAID` (REFUSED with `NO_DISCLOSURE`).
- **N4** Never asked, no and withdrawn read identically and share nothing — asserted both ways, and at the database.
- **Must never** Queue a notice without the client's current yes — the database refuses the row; tell a firm about a claim any other way; record reciprocity while A is off or a fee while B is off — the database refuses both; mark a fee paid before its disclosure — refused by CHECK; take money — nothing here collects any.
- **Test** `test/introducers.test.ts`.

### UC-B20 · Sales keeps the claim's capital allowances facts — CRM 6 of 10
- **Actor** `claim_facts.read` and `claim_facts.record` — Admin and Sales. `claim_facts.read_released` — **a surveyor on an assigned job, and only the released inputs**. Accounting is on none of it.
- **Flow** The claim page draws every fact with **where it came from**. **Derived first**: the claimant type (the organisation's), the jurisdiction and the acquisition date (the property's), taxable profit (the client's own answer, through the funnel mapping and its break-even switch), the amendment window (the engine's own rule, from the acquisition date, the accounting period and the claimant type), whether the election was notified in time (the engine's own two-year clock, and its tribunal route). **Captured only where nothing derives it**, each naming its source: the accounting period, the allowance headroom, the pool split, the structures allowance figure, the election — whether one exists, its section, notice date, value and the fixtures it covers — the prior owner chain, grants and contributions traced to cost elements, acquisition costs and the land transaction tax (the tax adviser's switch shown OFF), the buyer's own alterations (their switch shown OFF), whether the claimant is a Scottish taxpayer, and — **since Phase 132, for a partnership or an LLP alone** — whether any partner or member is a company, `PARTNERSHIP_HAS_COMPANY_MEMBER` (migration 024). A company partner puts the partnership return on the company filing date (TMA 1970 s.12AA(5B) and s.12ABA(4)(b)): YES reads the company date where that is earlier, and where it is later the individual date until `CB_CTA.window_company_member_date`, which ships off; NO reads the individual date as before. **UNKNOWN reads exactly as no row**: the window is OPEN only if open on both dates and CLOSED only if closed on both. Otherwise it is UNKNOWN, and the REPORTS and INVOICE gates already refuse that. The claim page's facts panel shows the row.
- **Outcome** `claim_facts` (append-only, the latest answer per key), `claim_grants` and `claim_owner_chain` (withdrawn, never deleted). Audited `CLAIM_FACT_RECORDED`, `CLAIM_GRANT_RECORDED`, `CLAIM_GRANT_WITHDRAWN`, `CLAIM_OWNER_RECORDED`, `CLAIM_OWNER_WITHDRAWN` — the key, the answer and the source, never a value.
- **N4** Not known is an answer and never asked is silence, and the two read identically and open nothing. **The gates the facts decide** — the election resolved (DATA_GATHERING), every grant traced (VALUATION), the amendment window (REPORTS, INVOICE) — refuse on both, and a test asserts each.
- **Must never** Record a fact a better source derives; name a person as a funder, an owner or an adviser; write an amount as zero; give a surveyor an amount, the window, the profit position or a figure.
- **Test** `test/claim-record.test.ts` and `tools/payload-proof.ts`.

### UC-B21 · Sales records the tax adviser's sign-off, and the four figures and the reconciliation follow — CRM 6 of 10
- **Actor** `claim_figures.read`, `tax_signoff.record`, `reconciliation.record` — Admin and Sales.
- **Flow** **The four figures, in the order they are produced, each read from the record that sealed it**: A the indicative estimate (`estimates`, with its hash), B the researched estimate — **NOT_PERMITTED_YET while the register gates are shut**, and it says which — C the surveyor's committed figure (`surveyor_commitments`, with its hash), D the figure the tax adviser signed. **The sign-off is a record, not a signature**: at the tax adviser's sign-off stage, against a surveyor's commitment on this claim, Sales records the adviser (a firm or a role), their credential, the date, the scope, a method note, the switch readings they confirmed and the figure, hashed. **The TAX_ADVISER_SIGNOFF and REPORTS gates open on that record alone.** The first sign-off opens the **reconciliation**, in the design's schema: its quote is the range shown before the letter was signed, with no quoted figure; its pre-submission figure is the adviser's; the filing, the adviser's variance tag and the outcome are each recorded once, and the outcome is derived from the enquiry or the window lapsing.
- **Outcome** `tax_adviser_signoffs` (never changed, never deleted), `claim_reconciliations` (a fixed snapshot). Audited `TAX_SIGNOFF_RECORDED`, `RECONCILIATION_OPENED`, `RECONCILIATION_UPDATED`.
- **N4** The quote gap is **not known**, never zero, so every case waits for the variance tag before it closes. An outcome is refused while an enquiry is open, and before twelve months have passed since the filing.
- **Must never** Let a date on the claim, a confirmation or another claim's record open the sign-off gate — the database refuses the retired column; count a sign-off made before a reopen; show a surveyor or Accounting any figure; hold a researched estimate anywhere.
- **Test** `test/claim-record.test.ts`, `test/pipeline.test.ts`.

### UC-B22 · Sales keeps the deliverables register and the claim's aftercare — CRM 6 of 10
- **Actor** `deliverable.read` and `deliverable.record` — Admin and Sales; `deliverable.read` for **the client, on an issued reasoned negative, s.203 notification or released client report of their own**. `hmrc_enquiry.record` — Admin and Sales.
- **Flow** Five deliverables — the client report, the accountant's computation pack, the reasoned negative, the defence pack, the s.203 notification — each **tracked, never generated**: not started, a draft, issued with its date, superseded by the next version. **An issued defence pack is immutable and its hash is required.** Each is a document of one type, and none of those types can be stored yet. **A report stating a figure is not drafted before the sign-off.** The portal lists what was issued to the client, with no figure; a claim that exits as a reasoned negative is told to the client **through its deliverable**. **Aftercare**: an HMRC enquiry opened and closed with its outcome; clause 13 — the fee on a reduced claim — **a switch, OFF**, reading the letter's three blanks; and a disposal date set, or a sale in prospect, raises a task pointing at the Disposal Note.
- **The case stamp — always on, Phase 132.** Issuing any deliverable writes, in the same transaction, one `claim_version_stamps` row (migration 022). It holds the engine version (NULL reads not known, never a default), the rulebook module versions, every CTA switch and every back-end switch with its position, the free register gate, each sign-off record with its hash, the estimate's hash and the head of the anchor log. The row is hashed and never changed, and a stamp that cannot be written takes the issue back with it. Audited `CASE_STAMPED`.
- **The defence pack generator — built and switched off, Phase 132.** `defence_pack.generate` (ADMIN, SALES) has **no route**. Off, it is refused before anything is read. On, it builds a hashed manifest of the sealed records, names each missing section, writes `DEFENCE_PACK_GENERATED` and **issues nothing**. The defence pack is still a deliverable a person records here with its hash. It waits on the tax adviser signing off the Defence Pack Template. §4 has the row.
- **Outcome** `claim_deliverables`, `hmrc_enquiries`, `properties.sale_in_prospect`, a staff task, and on an issue `claim_version_stamps`. Audited `DELIVERABLE_RECORDED`, `CASE_STAMPED`, `HMRC_ENQUIRY_OPENED`, `HMRC_ENQUIRY_CLOSED`, `FEE_CLAWBACK_NOT_APPLIED` (REFUSED, with `SWITCH_OFF` or `CLAUSE_13_BLANK`), `STAFF_TASK_CREATED` (route `disposal_note`).
- **N4** A sale never recorded and a sale not known raise nothing.
- **Must never** Generate a report; change an issued defence pack; release a client report before the sign-off; invent a portal stage for an exit; compute a credit.
- **Test** `test/claim-record.test.ts`.


### UC-B23 · Admin keeps the compliance registers — CRM 8 of 10
- **Who** ADMIN, and only because no other role can: a data protection officer role is defined and switched off (Phase 129), so nobody else holds one. **Known limitation: the procedures' two-person check is one person in this build**, and every register page says so — since the CRM follow-on, the identity store, the retention list and a contact's consent history too.
- **Does** keeps customer due diligence (built and **switched off** while `AML_IN_SCOPE` is false), the rights-request register with a clock per right, the complaints log, the breach register, S2 the identity store, one consent history per contact, and reads the retention list; queues the draft letters to the outbox.
- **Never** a Sales, Accounting, Surveying or client route to any of it; a name in the audit log; a deletion.

### UC-B24 · Management reads the dashboard, and every staff member finds, lists and exports what they may read — CRM 9 of 10
- **Who** the four staff roles. Each dashboard tile is drawn only where `can()` says yes to every action it names: ADMIN all of it; Sales the pipeline, the estimate-to-outcome tiles and the work waiting, and a survey-jobs tile that stays empty unless a job is assigned to them; Accounting the money; a surveyor its own survey jobs. Search and the claims list for all four; **the leads list and its export for ADMIN and Sales alone**, because `lead.read` refuses Accounting and Surveying exactly as UC-B12 says; the claims export for ADMIN, Sales and Accounting; saved views for whoever reads the list. *Corrected by CRM 10 of 10 on 12 September 2026, after the guide's exercises were run: this line gave all four roles the leads list and its export, and gave Sales the pipeline alone. The running application does neither, and the application is right.*
- **Does** reads pipeline, money, reconciliation, work and compliance tiles, each a query with the unknown counted apart; searches organisations, prospects, contacts, properties, claims, invoices and notes within what the role may read; filters and sorts the lists from fixed tables, saves a view, and exports the list as CSV, audited. **Since the CRM follow-on the dashboard over a period is the reports screen** — there is no second one: this month, this quarter, a UK financial year of 1 April to 31 March, or any from-to range of UK dates, from a fixed table, anything else dropped and said. A tile that counts what happened in time reads the period and says so; a tile that counts what stands today says it is as at today; a lost lead, which carries no date it was lost, is counted apart; and no period is exactly the dashboard as it was. Invoice search takes the start of a number. An export that could not apply a filter, because the reader cannot read that column, says which beside the link and in its audit line.
- **Never** a stored total; an estimate-derived figure to a surveyor; a search of the identity store, the registers, document text or the estimate; a value filter for a role that cannot read the value; a formula live in an exported cell.

### UC-B25 · Admin keeps the settings, and merges a firm the referral form made twice — CRM 9 of 10
- **Who** ADMIN writes; Sales reads the lists. **Does** adds, relabels and retires values on the five lists and the two reason lists; reads the document types, automation rules, templates and the finance and compliance settings in one place; sets a rule that asks the client for a document; merges a firm onto the one it really is.
- **Never** a setting that moves a gate, a register gate, a CTA or fee switch, the reward model or a role boundary — each refused by name and recorded; a value deleted or its code changed; a fee moved by a merge.

### UC-B26 · Admin reads the audit log, and anyone holding the database file verifies its chain — the CRM follow-on
- **Who** `audit.read` — **ADMIN alone**; every other role is refused the page.
- **Does** `/staff/audit` lists the newest two hundred lines matching a kind and an outcome, each from a fixed table — the line's number, when, the role and the id, what it was about, and the outcome — **and never a line's detail, which is not even read to draw the page**. It says whether the chain is intact, recomputed from the genesis on every read, and records the read itself as `AUDIT_LOG_READ`. `npm run verify-audit` recomputes the chain from the database file, writes nothing, and exits 1 when it is broken.
- **Never** a detail, a name or an amount on the page; an edit or a delete; a filter built from a request value.
- **Test** `test/follow-on.test.ts`, beside `test/audit.test.ts`'s own.

---

# 2 · The wireframe — every screen in both applications

**This absorbs `Caprebate — Wireframe & Build Spec.html` v5 and keeps its
discipline**: route, fields, what it writes, what it calls, **what it must never
do**, and **an acceptance test each**. The old page covered S0–S13 and X1–X4 for
screens that did not exist. These exist, so a route here is a route you can open,
and an acceptance test is one you can run.

**Three rules apply to every handler and are not repeated per screen:**

1. **Authorise on the object, on every request.** Handlers do not branch on a role — they fetch the row and hand it to `authorise`, which is why an id swapped in a URL returns a refusal rather than a page.
2. **No static file route.** Nothing maps a request path onto the filesystem; the only asset is a string constant, and `assertNoStaticFileRoute` reads the router's own source to keep that true. That is the first half of requirement **DB-W1**.
3. **Escape on output.** Every response is built with the `h` tagged template, which escapes anything not already `Safe`. There is no string concatenation of markup anywhere.

**The layout every screen below sits in — Phase 133a, 17 September 2026.** Lakhbir asked for a CRM that "looks and works
like Salesforce — easy to use, intuitive, an easy layout for each one of the logins". What was taken is the layout
pattern, never a brand: no other product's name, logo, icons, fonts or stylesheet appear. The specification the build
followed is `04-phase-work/phase133a/layout-spec.md`, and the before-and-after audit is `04-phase-work/phase133a/ui-audit.md`.

- **The shell** (`page()` in `src/web/html.ts`) draws a header — the name, the global search (`B41`), a count of my open
  tasks from `myWork`, and a user menu — and then **the tabs of the signed-in login**. It is still the only place a page
  is assembled, and the Content-Security-Policy string is unchanged.
- **The menu shows only what a login can open** (`src/web/navigation.ts`). This REVERSES the earlier decision in
  `src/web/staff.ts` to draw every section for every role, on Lakhbir's instruction. It asks no rule of its own: each
  section names its **gate** — the function its route's store calls first, exported beside the store as
  `searchGate`, `pipelineBoardGate`, `claimListGate`, `documentCentreGate`, `documentTypesGate`, `rewardModelGate`,
  `automationGate`, `templatesGate`, `auditLogGate`, `usersGate` and `nextActionsGate`, or the module's existing
  `assert…Section`. `test/phase133a.test.ts` opens every header link for every login (200) and every section not in it
  (403). **A screen a login may not open is still refused, not hidden**: the address answers 403.
- **The header needs the database, the clock and the address**, which `nav(actor)` was never given. The router runs
  every `/staff` and `/portal` request inside `navContext` (an `AsyncLocalStorage`) rather than threading three more
  arguments through sixty page functions.
- **The Cap Rebate brand, and a CRM a new user can pick up cold — Phase 133c, the same day.** From the brand book v1.0
  (Lakhbir's file; its text and logos are in `04-phase-work/phase133c/brand-assets/`):
  - **Colour tokens** in `src/web/assets.ts` (`BRAND_TOKENS`): Cap Mint `#ABEDD8`, Cap Ink `#111111`, white, Mist
    `#F2F8F6`, Body Grey `#333333`, Muted `#6B7280` (captions on white only). **`--accent` is one token, set to Cap Ink**
    until the design team supplies the accent — a one-line change. **White text on mint is refused when the module
    loads** (`assertNoWhiteOnMint`), and `TEXT_PAIRINGS` lists every text/ground pairing, each checked at 4.5:1.
  - **Type**: headings `"Bookman Old Style","Roboto Slab",Georgia,"Times New Roman",serif`, no italics; body
    `Calibri,"Segoe UI",Inter,Arial,Helvetica,sans-serif` at 16 px/1.6; the slide-36 scale (H1 44, H2 32, H3 24 for card
    titles, H4 20, H5 18 for form labels, H6 16 for table headings, caption 12); `tabular-nums` on the body. System
    fonts only — the CSP is unchanged.
  - **The name a person reads is "Cap Rebate"** — page titles, the header, the footer, the portal, emails. Code
    identifiers, file names, the database and the project's documents keep "Caprebate". Words quoted verbatim from the
    operating procedure (`src/web/stages.ts`) keep it too, and are shown through `brandName()`.
  - **The logo** is the supplied PNG (`GET /assets/cap-rebate-logo.png`), at 120 px on the sign-in page, the public pages
    and the portal. The back office shows the name in the heading font: no horizontal lockup or icon-only mark exists.
  - **UK dates, one helper** (`src/web/localtime.ts`): `ukDate` "24 Sep 2026", `localStamp` "24 Sep 2026, 12:32" (with a
    clock, "Today, 12:32" / "Yesterday, 12:32"), `localWhen`, `dueReading`/`dueWords` "Due in 3 days (24 Sep 2026)" / "3
    days overdue (21 Sep 2026)". **`page()` passes the body's text through `ukDatesInMarkup`**: text between tags only,
    never an attribute, an input's value, `<code>`, `<pre>` or `<textarea>`. Stored values stay ISO.
  - **The next step first** (`src/web/next-step.ts`): a claim's right-hand panel opens with "Move to <stage>" as a button,
    or "Not ready yet", the first need in plain words (one table, `plainNeed`) and the action that fixes it. The gate is
    still read on the server; the ten stages are drawn once, in the stage bar; the gate table is behind "See everything
    this stage needs" (`#stage-needs`). A lead's panel does the same for the enquiry checks.
  - **Empty rows hidden** (`fields()` in `src/web/components.ts`): a field shows only with a value, with one "Add missing
    details" link; a "not known" answer that decides something (the enquiry checks, the claim's facts, jurisdiction,
    claimant type, prior claims) is kept. An explanation sits behind "Why?" (`why()`, a `<details>`).
  - **A refused form keeps what was typed** (`src/web/refill.ts`): `problem()` redraws the page the form was on under the
    same login (a captured GET), puts the posted values back into the form that posts to that address, puts the refusal
    at the top of the form (beside the field since Phase 133d, below), and opens its `<details>` and tab. Still 400. A form it cannot find gets the plain refusal
    with the typed values listed. Passwords are never written back.
  - **First visit** (`src/web/welcome.ts`): a welcome card on Home and the portal with the login's three most frequent
    jobs, until dismissed. **Help** in every header opens that screen's training section.
  - **Built, switched off, and asked**: `NAME_SWITCHES` in `src/web/navigation.ts` — `menu` (the `MENU_NAMES` table:
    Engaged clients → Client files, Next actions → Claims needing an owner, Reward model → Introducer fees) and
    `portalSteps` (`src/web/portal-steps.ts`: 1 Your estimate … 6 Aftercare). Both ship **off**; `ServerOptions.names`
    sets either for a test.
  - **"The data this page was built from"** is drawn for Admin only (`dataLink()`); the JSON addresses answer as before.
  - `test/phase133c.test.ts` crawls every page each login reaches and fails on an exclamation mark, an avoid-list word,
    "Caprebate", an ISO date, a field reading "not recorded"/"not on hold"/"not lost", or a `<details>` in a `<p>`.
- **What Phase 133c left, and the estate outside the app — Phase 133d, the same day.** The record is
  `04-phase-work/phase133d/proof-record.md`.
  - **"(required)" in words on every required field** (`src/web/required.ts`): `page()` passes the body through
    `requiredWordsInMarkup` after `ukDatesInMarkup`. A control's label is found by `for`/`id`, then by the `<label>` it
    sits in, then by a `<label>` with no `for` ending right before it; the words go inside that label once.
    `test/phase133d.test.ts` crawls every page each login reaches and fails on a required control whose label does not
    say "(required)" (`requiredWithoutWords`).
  - **A refusal beside its field** (`src/web/refill.ts`, `besideField`). A refusal may carry `field`, the posted name it
    is about. `take()` in `src/web/tasks.ts`, `src/web/crm.ts` and `src/web/leads.ts` sets it from its own key, and the
    other checks of the ten most-used forms set it by name: a task, the next action, a lead, an enquiry check, a claim
    move (`refuse(…, field)` in `src/web/pipeline.ts`; the move form's next-action fields are `next_action_title`,
    `next_action_owner` and `next_action_due`), the claim, the organisation, a contact, a property and a document
    request (`createDocumentRequest`). `problem()` takes it as a sixth argument. The message (`p.fielderr`,
    `role="alert"`) is drawn straight after the field, or after the `<label>` holding it; the field gains
    `aria-invalid="true"` and `aria-describedby`. A refusal with no field, or one naming a field the form does not hold,
    stays at the top (`div.formerr`). The refusal's first letter is shown as a capital.
    **Phase 133e** carried `field` to every other back-office store that refuses about one posted field: finance
    (`src/web/invoices.ts`, `src/web/finance.ts`), introducers (`take()` in `src/web/introducers.ts`), the claim's facts,
    grants and past owners (`src/web/claim-facts.ts`, through `finish()` in `src/web/claim-record-pages.ts`), document
    types (`readTypeFields`, `createType` in `src/web/documents.ts`), automation rules (`ruleValues` in
    `src/web/automation.ts`), templates (`src/web/templates.ts`), admin settings (`src/web/configuration.ts`), the survey
    job (`src/web/surveyor.ts`), and account settings and Create a user (`SettingsError` in `src/web/settings.ts` now
    carries `field`, passed at the call sites in `src/web/staff.ts`). Every `*-pages.ts` module's `problem` signature
    takes the sixth argument. A refusal about the record's own state carries no field and stays at the top.
  - **Every required control is JOINED to its label** (Phase 133e). `requiredLabelledByPositionOnly` in
    `src/web/required.ts` reports a required control labelled only by a `<label>` that sits before it; `test/phase133d.test.ts`
    D5 crawls every page each login reaches and fails on one. The account settings, Create a user, the assessment's
    close form and the upload page now give each field an `id` and its label the matching `for`.
  - **The stage bar wraps**: a step's `min-width` is `max(5.2rem, min-content)`, so no step is narrower than its longest
    word and the arrow never cuts a label; the bar scrolls sideways only if the ten cannot fit.
  - **The avoid list is one module** (`src/web/voice.ts`, `AVOID` and `avoidHits`), read by `test/phase133c.test.ts`
    and by `03-app/caprebate-brand-check.cjs`. "capital gains" is allowed only where the text distinguishes it ("not
    capital gains tax"); "guaranteed-use" (a grant's term) is allowed; "tax scheme", "workaround" and "tax avoidance"
    are listed.
  - **The engagement letter names the adviser "Cap Rebate"**, twelve times, and nothing else in it changed (Lakhbir,
    17 September 2026: no "Ltd" and no company number until the legal entity is settled; settled 18 September 2026, and Phase 133g put CAP REBATE LTD and 17307313 into its parties and signature blocks). `test/phase133c.test.ts` no
    longer exempts the letter's clauses.
  - **Outside the application**: `Caprebate site.html`, `03-app/caprebate-notices-page.html` and
    `03-app/caprebate-complaint-form.html` use the same tokens and font stacks (read from `src/web/assets.ts`), no web
    font, and the name "Cap Rebate". The site shows the supplied logo top-left at 120 px as a `data:` URI (the page
    has no CSP of its own; the host checklist mentions no font), and converts ISO dates to UK dates in the assessment
    frame's drawn text (`CB_UKDATES`, a separate script the harness and the extractor never read).
    `node 03-app/caprebate-brand-check.cjs` checks all three, and `--self-test` plants thirteen faults.
- **The five long screens followed — Phase 133b, the same day.** The business page (`B6`), the survey job (`B8`) and
  finance (`B9`) draw `highlights`, `recordTabs` and `sidePanel` from `src/web/components.ts` with tab ids of their own;
  admin settings (`B43`) and document types (`B29`) draw `sectionList`, the same anchor-and-`:target` mechanism as a
  list down the left. A tab's id is any id unique on its page, so the stylesheet marks the current tab **by position**
  (`CURRENT_BY_POSITION` in `src/web/assets.ts`, up to `MAX_TABS`, which both components refuse to exceed). Every
  panel each screen drew is still drawn, from the same view, in a tab or a section; after a save the redirect names the
  tab or section as its fragment. `test/phase133b.test.ts` proves each screen's tabs for a login that opens it, that
  every tab lands on a panel on the page, and that no id is used twice. The record is `04-phase-work/phase133b/`.
- **A refused screen is a page.** `sendRefusalPage` in `src/web/router.ts`, called from `src/server.ts`, answers 403 with
  the login's own header and "You cannot open this page", naming no object. A data address (`.json`, `.csv`) and
  `/api/` keep `{"error":"not authorised"}`.
- **One set of components** (`src/web/components.ts`): badge, card, empty state, highlights panel, the claim's stage
  bar (it draws `pipeline.stage` and `pipeline.steps` from the claim view and decides nothing), the client's stage bar
  (the six client-facing steps only), record tabs, the right-hand panel and the record layout.
- **Record pages** (claim, organisation, property, lead) are highlights, the stage bar on a claim, three tabs —
  Details, Related, Activity — and a right-hand panel of the next action and quick actions. **Every panel the page drew
  before is still drawn**, in one of the tabs, from the same view.
- **Tabs, menus and the board need no script.** A tab is a link to its panel's anchor and the stylesheet shows the
  targeted panel (`:target`, `:has()`); without CSS, or without `:has()`, every panel shows in turn. The More menu and
  the user menu are `<details>`. The pipeline is an `<ol>` of stage columns, a plain list without CSS.
- **The home page per login** (`homeCards` in `src/web/staff.ts`) reads each card through the store its screen reads,
  and only for a login whose gate admits it: Sales — next actions, today and overdue, the pipeline by stage, new leads;
  Accounting — invoices, fees waiting to be invoiced, the VAT position; Surveying — jobs waiting for figures; Admin —
  users, settings, recent audit events and refusals (which reads the audit log, so the reading is itself recorded);
  Read only — the pipeline by stage and new leads.
- **The stylesheet** (`SITE_CSS` in `src/web/assets.ts`) is still the one asset, still a string constant, with no
  `url()`, `@import` or `@font-face`. Every class a screen used before is still defined. Text colours meet WCAG 2.2 AA
  and the test computes the ratios from the stylesheet's own tokens.

## 2.0 · How the old screen ids map onto the built ones

| Old wireframe | Now | Note |
|---|---|---|
| S0 | `/` | Unchanged in role |
| S1–S6 | `/assessment/Q1 … Q3` | **The seven-screen front door is superseded.** The live one is six screens: `Q1 · Q1a · Q1b · Q1c · Q2 · Q3` |
| S7 | `/assessment/figure` | A single "up to" ceiling with a per-property breakdown |
| X2 | `/assessment/no-claim` | The reasoned negative, reachable from the gate |
| S8a + S8a-1 | `/assessment/close` | The close **and** the slot picker, one screen |
| S8c | `/assessment/close` (POST response) | The thank-you is the close's own response, not a separate route |
| **JS-S8** | **NOT BUILT** | Self-serve account creation does not exist. **A client account is created by an ADMIN.** See §5 |
| JS-S8b | `/staff/clients/{id}` | Preparing the letter is back-office work on the business page |
| JS-S9 | `/portal/letter` + `/portal/letter/sign` | **In-session, not on a tokenised link.** See §5 |
| S10–S12 | `/staff/clients/{id}` panels 2 and 3 | Research and what is still missing |
| S13 | `/portal/documents` | The upload |
| X1 | portal task list + panel 3 | An unknown routed to capture |
| X3, X4 | engine output | Out-of-time terminals and the assumptions list travel with the figure |

---

## 2.1 · The client application

### `C0` — the public front page
- **Route** `GET /` · public, no session, no cookie beyond strictly necessary.
- **Writes** nothing. **Calls** nothing.
- **Must never** Fire an analytics event carrying an address or a typed value. Set a marketing cookie before consent is answered.
- **Accept** No request to any register or enrichment endpoint is made from this page. (Trivially true today: **the whole application makes zero external calls** — `grep 'fetch(' src/` returns nothing outbound.)

### `C1` — the assessment, six screens
- **Route** `GET /assessment` (start or resume) · `GET|POST /assessment/{Q1|Q1a|Q1b|Q1c|Q2|Q3}` · public.
- **Fields** `Q1` prior claim by them · `Q1a` prior claim by a previous owner · `Q1b` UK tax status, and **on *yes* only** the profit question · `Q1c` what prompted this · `Q2` **a per-property repeater** — address, sector, entity type, and the spend pair that property's trigger selects · `Q3` works, **one row per property**.
- **Writes** `assessment_drafts` only — the state and the screen reached, keyed on an httpOnly draft cookie. **No business row, no assessment row.**
- **Calls** the engine package, in process. `src/web/engine.ts` is **the only file that imports it** — one line to grep — and every gate, band, channel, figure and assumption comes from there. **Nothing in the web half decides a tax question.**
- **Must never** Render a trigger control or an entity control on **property 1**: it inherits both silently, and rendering them turns a six-screen funnel into an eight-screen one for the client who was never the drop-off risk. Ship `Q3`'s heading unconditionally — where that property's trigger was a refurbishment or a fit-out the heading must read *any **further** work since*, or the client enters the same money twice and the figure inflates. Terminate on *Not sure* at `Q1b`.
- **Accept** `SCREEN_IDS` equals `CB_FUNNEL.SCREENS` exactly, asserted by a test, so the order cannot drift. Every string in `SCREENS`, `OPTIONS` and `COSMETIC_NOTE` is transcribed from the site's own renderer — **ported, not improved**.

### `C2` — the figure
- **Route** `GET /assessment/figure` · public, draft required.
- **Shows** a single **"up to"** ceiling, its qualifier, and the per-property breakdown.
- **Must never** Store the ceiling as the value — **the engine computes and stores both bounds**, and a stored ceiling cannot be replayed after a switch moves. Sum ceilings across properties and present the total as one number without the breakdown: adding upper bounds gives the sum of maxima, which gets *less* achievable with every property added. Render the figure without the assumptions list — with the range gone, that list is the only guard left on the number.
- **Accept** The stored run reproduces the same **range** when replayed against the same engine version, and the displayed ceiling equals its upper bound.

### `C3` — the reasoned negative
- **Route** `GET /assessment/no-claim` · public, draft required — **and only a draft the engine has stopped**. Any other draft is sent back to the screen it was on.
- **Shows** the site's own reasoned-negative screen, ported: its heading, **the gate's reason in the engine's words** (`gateQ1b(state).message`), the note that later spend is a separate claim, then CB_BOOKING's gated-exit offer and *Talk to someone →* to the close.
- **Must never** Produce a figure, or route an unknown here or past here to keep a lead alive. **While a draft is stopped, `Q1c`, `Q2`, `Q3` and the figure redirect here**, on GET and POST alike; `Q1`, `Q1a` and `Q1b` stay open so the prospect can correct an answer.
- **Accept** The screen names the gate that fired, in words. *No* at Q1b lands here; *not sure* and no answer never do.

### `C4` — the close, and the thank-you
- **Route** `GET /assessment/close` (the form, with live slots) · `POST /assessment/close` (writes, then renders the thank-you) · public.
- **Fields** `full_name` (**required**) · `business_name` · `job_role` (thirteen values plus free text, and **free text is never a validation failure**) · `channel` (**required**, one of three) · `contact_value` · `sms_variant` where the channel is text · `contact_consent` (**required, and it is not marketing consent**) · `marketing_optin` (**unticked, separate, per channel**) · `slot` (**telephone only**).
- **Writes** `businesses`, `assessments`, one `assessment_answers` row per question, `estimates`, `contacts`, `bookings`. **The lead is written here.** **At a reasoned negative (UC-C9) it writes instead** a `leads` row with no organisation, and a `contacts` and a `bookings` row belonging to that lead — no `businesses`, `assessments` or `estimates` — under the gated-exit offer rather than the close's, and the thank-you prints no range and does not say an assessment was recorded.
- **Must never** Refuse a slot posted alongside email or text — it is **dropped**, because the client has simply left a radio button selected from before they changed channel. Render a cached availability grid: read live, hold on selection, release on abandonment. Ship the placeholder telephone number that is still in the thank-you copy (§5).
- **Accept** The screen cannot be passed without a name, a channel and a per-channel consent; the assessment persists here; a time never offered is refused **at the write**.

### `C5` — sign in
- **Route** `GET|POST /login`, `POST /logout` · public.
- **Writes** `sessions`; `rate_limit_hits` on failure.
- **Must never** Distinguish *no such user* from *wrong password*, in the message **or in the timing**.
- **Accept** A failed sign-in returns the generic failure and a real argon2id verification was performed; where a sign-in lands is decided by `can()`, not by a role string.

### `C6` — the portal
- **Route** `GET /portal` · `CLIENT` on their own business (`ownBusiness`), or staff.
- **Order since Phase 133c**: Book a call and who to contact at the top; the welcome card until dismissed; the stage
  bar; the range with its basis underneath (`CLIENT_RANGE_BASIS`); what we need from you, the questions and the documents
  asked for; then the rest; the long step explanations behind "What happens at each step".
- **Shows** the range with its qualifier · the stage **in the client's words** · the engagement letter's state · the appointment **and a control to move it** (`C6a`) · open questions · account settings · documents.
- **Must never** Show internal state, or guess a stage it does not recognise — where the recorded stage is unknown it **says so**.
- **Accept** Signed in as another client, every one of these returns a refusal, not an empty page.
- **Phase 134 — one company, many claims.** The heading is the **company's name**; the tab is **Your claims**; a
  **Your claims** card holds one tile per claim — the property, its town, how far it has got in the client's six steps,
  and the reference as a small grey label — each opening `C6b`. Questions, documents and messages stay here, at company
  level. The company-wide stage bar is drawn only where the company holds no claim yet. Each claim is asked of
  `claim.progress_read` (ADMIN, SALES, and CLIENT `ownBusiness`; the view-only login NO).

### `C6b` — one claim's progress — Phase 134
- **Route** `GET /portal/claims/{claim}` · `CLIENT` on their own company's claim, or ADMIN and SALES.
- **Shows** "Company > Property" · the company's name as the heading · the claim's property and grey reference · its
  step in the client's six words, as a stage bar · the step's own words · a link to what we need from you, on `/portal`.
- **Must never** Show the ten staff stages, a hold reason, an exit note, a value, a next action or a person. A hold shows
  the step the claim returns to; an exit says only that the claim is closed.
- **Accept** `test/phase134.test.ts` — a client of a company with three claims sees exactly three; another company's
  claim and a claim that does not exist answer the same 404.

### `C6a` — the client moves their own call
- **Route** `POST /portal/bookings/{id}` — one route, three verbs: a chosen `starts_at`, `release=on`, or `cancel=on` (Phase 132e).
- **Who** `booking.move_own`, **a rule of its own, CLIENT only, `ownBusiness`** — added by Phase 113a and deliberately NOT `CLIENT` added to `booking.write`. That action means *own and arrange a client call*: it builds the diary through `bookableUserIds` and gates the whole back-office calendar section, so a client on it would appear in the answer to "who could take this call" and would pass a section gate.
- **Shows** moments from `publicSlots` — **the same function the funnel-close picker uses, with the people taken out.** A client never learns whose diary it is.
- **Writes** `bookings` (the same row — nothing here creates a second one) and a `booking_changes` row with `changed_by` naming the client. The staff booking page's existing change history renders it unchanged.
- **How late — AT ANY TIME, since Phase 132e (16 September 2026).** Lakhbir: *"Give the client full control to cancel at any time, and rebook at a time that suits them"*. A call the client already holds may be moved, released or cancelled however close or past it is. `CLIENT_MOVE_NOTICE_MINUTES` = **120** now applies to one end only: a NEW time the client picks must be at least two hours away (`tooSoonForNewTime`), and the picker draws no time inside it. The staff path is not subject to it. **The funnel-close booking has no two-hour rule and never had one**: it offers and accepts any free slot from now.
- **Cancel — `cancelOwnBooking`, at any time, and the times still come first.** The panel draws new times, then *"None of these work — ring me instead"* (release), then **Cancel this call**. A cancellation keeps the row, its time, channel and entry point; sets `cancelled_at` and `cancelled_by`; frees the slot (`bookedSpans` and `isBookable` read `cancelled_at IS NULL`); writes a `booking_changes` row with `cancelled = 1`, an outbox line (not sent) and a `BOOKING_CANCELLED` audit line; and **moves nothing about the enquiry** — no lead, claim or organisation status. It is final on its row (migration 025's triggers): no un-cancel, move or reassignment, by the store or by SQL. The back office's calendar lists **Cancelled calls** with who cancelled and when, marks the day row, and the booking page says so and draws no scheduling form.
- **Accept** `isBookable` is asked again at the moment of writing, with `ignoreBooking` set to this booking. A posted time no picker drew is refused. Another client's booking id and an id that does not exist return the same answer.
- **Test** `test/portal-booking.test.ts` — 27 tests since Phase 132e, including a negative control: adding `CLIENT` to `booking.write` fails it; every cancellation case (days away, twenty minutes away, already passed, waiting for a time) and the refusals after one; and the two-hour rule for a new time. Run under the clock grid: 350 instants, 350 green.

### `C7` — the engagement letter
- **Route** `GET /portal/letter` · `POST /portal/letter/sign`.
- **Renders** the actual `.docx`, parsed at request time. **The open terms are derived from the document** by `unresolvedTerms()`, so a term that gets filled in disappears without anybody editing code — and a new blank appears without anybody remembering to add it. **Eight are open today** (§5).
- **The specimen values are substituted or marked, never silent.** The template names a specimen client, gives it a specimen company number, and quotes an illustrative range; rendering it unchanged would show a real client somebody else's name in their own contract. **The specimen number is not fictional:** 09183422 is on the Companies House register as a dissolved company that has nothing to do with Caprebate (checked 12 September 2026, Phase 129). Since Phase 129 the number is replaced whenever the organisation's record holds one, and flagged as a specimen when the record's number is absent or blank. The name with its suffix is replaced before the bare name, so a record called "Test Care Ltd" no longer renders as "Test Care Ltd Ltd".
- **STUBBED** No provider is contacted. The state machine `NOT_SENT → SENT → VIEWED → SIGNED` is real and lives in `engagements`.
- **Accept** The screen says signing is stubbed, and the signed row is what `assertSignedEngagement` reads server-side.

### `JS-C8` — answering a question
- **Route** `POST /portal/tasks/{id}`.
- **Writes** `client_tasks` → `ANSWERED`, with the answer state and **who gave it**.
- **Must never** Store *I don't know* as a blank. It is a state, and the "what is still missing" panel is computed from it.

### `C9` — documents, and the documents we asked for
- **Route** `POST /portal/documents` (a link — by `type_code`, by `request`, or for a new version of `document`) · `PUT /upload/put`, or from a browser a multipart `POST` to the same address, since the CRM follow-on (the bytes, **and steps 2 to 7 on the same request**, through the one handler) · `GET /portal/documents/{id}` (what we did with it) · `GET /portal/documents/{id}/download`.
- **Writes** `logical_documents`, `documents`, `document_events`; a `document_links` row where the request was on a claim; `client_tasks` when an upload receives a request; the object store, outside the web root.
- **Shows** the documents we asked for, each with why, what it holds up and its due reading, and an upload button; the received ones ticked; the documents sent, each with its version. CRM 4 of 10.
- **Must never** Trust the extension — the type is sniffed **server-side**. Give the storage directory an execute bit. Promote before the strip. Ask the client for a file name. Offer a button that marks a request received. Accept a second write through a used link.
- **Accept** The 39 handler tests are green against the adapter; a promotion attempted before a recorded strip throws `E_PROMOTE_BEFORE_STRIP`; **the download returns 410 rather than bytes**, because the original was deleted and there is nothing to serve; `test/documents.test.ts` takes a link from the portal, PUTs a file, sees the request received and the replayed PUT refused; `test/follow-on.test.ts` sends the file from the portal's own form, which carries no script.

### `C10` — the client's own settings
- **Route** `/portal/settings` and its sub-routes — **the same implementation as `/staff/settings`**, so a password change cannot rotate the session on one and forget on the other. What differs is the shell and which sections are drawn; **a client posting to the working-times route is refused by the rule, not by the absence of a form.**

---

## 2.2 · The back office

### `B0` — the landing page
- **Route** `GET /staff` · gated once by `backoffice.enter` for the whole `/staff` prefix.
- **My tasks — CRM 3 of 10.** For every staff role: what they own and what waits with their team, **OVERDUE** first; the questions they put to a client that are past due; the claims they own that break the one-next-action rule. Built by `myWork` in `src/web/tasks.ts`, every task through `staff_task.read`.
- **Documents you asked a client for — CRM 4 of 10.** The document requests the reader raised that have not arrived, each with its due reading and **OVERDUE** by the UK date, each through `document_request.read`.
- **Claims nobody owns that break the one-next-action rule — the CRM follow-on.** For `pipeline.read`, Sales and Admin: each open claim with no owner that breaks the rule, with what is wrong. No owner's list would carry it.
- **Home cards — Phase 133a.** A row of cards per login above My tasks (see *The layout* at the head of this section), each drawn only where its section's gate admits the login.
- **Must never** Be the only gate. Every section behind it authorises its own objects. Since Phase 133a the menu shows only the sections a login can open, and a section it may not open still answers 403 — as the refusal page — when its address is typed.

### `JS-B1`/`JS-B2` — filled assessments
- **Route** `GET /staff/assessments` · `GET /staff/assessments/{id}`.
- **Who** ADMIN, SALES (`assessment.read`). **ACCOUNTING is absent by design.**
- **Accept** ACCOUNTING signing in and requesting an assessment id gets a refusal, not a redacted page.

### `B3`/`B4` — the calendar
- **Route** `GET /staff/calendar` (`?view=day|week&date=`) · `GET /staff/calendar/{id}` · `POST /staff/calendar/{id}/schedule`.
- **Who** `booking.read` / `booking.write` — ADMIN and SALES.
- **Writes** `bookings`, `booking_changes`.
- **Must never** Store, compare or transmit a local time. Every stored moment is UTC and every wire value is a `Z`-terminated ISO-8601 string; only the LABEL is local. **Never reintroduce an offset constant** — `+1` is wrong for four months of the year, `0` for eight, and both are wrong on the two mornings that matter. `test/localtime.test.ts` fails on either.
- **Accept** A slot that `isBookable` refuses is refused at the write even if it appeared on a screen.

### `B5`/`B6` — engaged clients and the business page
- **Route** `GET /staff/clients` · `GET /staff/clients/{id}` · `POST /staff/clients/{id}/research` · `.../research/retry` · `.../tasks/send` · `.../tasks/answer` · `.../tasks/withdraw` · `.../notes`.
- **Who** ADMIN, SALES.
- **Writes** `research_runs`, `research_sources`, `client_tasks`, `internal_notes`.
- **Must never** Maintain panel 3 by hand. Render a note unescaped. Fire anything: **no connector exists**, and every source is reported against its gate. Withdraw an ANSWERED question — that would delete a fact the client gave, and the refusal is read off the row rather than achieved by not drawing a button.
- **How panel 3 gets its cash gates** `src/web/funnel-session.ts` reads `assessment_drafts.state_json` — the CB_FUNNEL state the six screens saved — and maps it onto an engine Session. Every mapping in it is justified from the engine's own code; its NOT MAPPED block says what is deliberately left absent and why. A DONT_KNOW or a SKIPPED answer sets **nothing**, in one place (`known()`), which is what makes a `null` gate a report rather than an artefact.
- **Layout — Phase 134: THE ONE CLIENT PAGE.** One page per company at `/staff/clients/{id}` (`src/web/client-page.ts`), folding in what `B13`/`B14` drew. The heading is the **trading name**, the legal name under it in small text. A **Claims** card holds one tile per claim — property and town, stage, next action, and the reference as a small grey label — each opening the claim **inside** the company at `/staff/clients/{id}/claims/{claim}`, under a "Company > Property" breadcrumb. Tabs: `#activity` (tasks, **one timeline for the company**, and the internal notes, each note optionally tagged with the claim it is about), then — for `research.read` — `#tasks` (questions to the client), `#missing`, `#answers`, `#sources`, drawn by the unchanged `panel4`, `panel3`, `panel1`, `panel2`; then `#contacts`, `#properties`, `#documents`, `#details`. A question sent from `#missing` may also name a claim of the company (migration 032 lets a question carry one; the same-organisation trigger still refuses another company's). The right-hand panel holds the quick actions and **Waiting on**. The view-only login reads the organisation's tabs and no research or notes.
- **Layout — Phase 133b, superseded by Phase 134** Five tabs, one per numbered panel, `#answers`, `#sources`, `#missing`, `#tasks`, `#notes`.
- **Accept** An untiered source is treated as **PAID** and the screen says the tier is unsettled; an unrecognised missing fact is reported as blocking **both** packs.

### `B7`/`B8` — the surveyor's workspace
- **Route** `GET /staff/survey` · `GET /staff/survey/{job}` · `GET /staff/survey/{job}/payload.json` · `POST .../rooms` · `POST .../commit` · `POST .../amend` · `POST .../disclosure`.
- **Who** `surveyor_job.enter` (ADMIN, SALES, SURVEYING), then `surveyor_job.read` — and for SURVEYING that is `assignedSurveyor`, a test on **the specific job**.
- **Writes** `surveyor_room_counts`, `surveyor_rate_events`, `surveyor_commitments`, `anchor_log` — and, since Phase 132, `surveyor_control_observations` (migration 023), with `surveyor_rate_events.blank_control` marking a field served blank.
- **Must never** Assemble the surveyor's object by reading everything and deleting the estimate. **It is built forwards from what the quarantine released**, so a new field is absent by default; a build-then-strip assembler is one forgotten key away from leaking, and a developer who sees an estimate arrive and get hidden will build exactly that. Add a *reveal the client-facing estimate* control — **the old survey-pack wireframe had one and it was deliberately not copied**: the estimate is not in the surveyor's response to be revealed, and commitment releases it with no separate action and nobody to ask. De-duplicate the denial log lines.
- **Layout — Phase 133b** Highlights (sector, stage, opened, rooms counted, rates recorded, your figures, and **our estimate: withheld or released — never a figure**); six tabs, `#property`, `#rooms`, `#rates`, `#evidence`, `#figures`, `#record`, one per numbered section; the right-hand panel holds the quick actions (**Commit your figures**, or **Amend** once released, is first) and the quarantine panel. The workspace and its payload are built before the layout draws a line; the Surveying home card links to `#figures`. **Must never** put a figure in the highlights or the side panel.
- **Accept** `cd 09-app/backend && CAPREBATE_ALLOW_SEED=1 node tools/payload-proof.ts` — see §6, N1.

### `B9`/`B10` — the accounting view — extended by CRM 7 of 10
- **Route** `GET /staff/finance` · `GET /staff/finance/view.json` · `GET /staff/finance/{id}` · `POST /staff/finance/claims/{claim}/raise` · `POST /staff/finance/{id}/sent` · `/cancel` · `/credit-in-full` · `/credit-clause-13` · `/received` · `POST /staff/finance/received/{payment}/void` · `POST /staff/finance/vat-check` · `POST /staff/finance/settings` · `POST /staff/finance/{id}/status` (an organisation's invoice from before CRM 7 of 10 only).
- **Who** ACCOUNTING, ADMIN — **and nobody else**; the settings form is ADMIN's alone.
- **Fields shown** by month: invoiced · credit notes · received · fees expected from claims at the invoice stage; outstanding and overdue; the VAT reading and its warning; the claims waiting at the invoice stage, each with its finance task; each claim invoice's number, date, amount, VAT, state, money read, outstanding and due — **UNSET** where the letter sets none; the fee controls and **what the letter says, BLANK where it is blank**; the finance settings with their date and source; model B's fees to firms, listed and never paid; an organisation's invoices from before, with **whether the fee exceeds the client's first-year saving** and the fee rate that would not.
- **Layout — Phase 133b** Highlights of the totals; six tabs — `#money` (section 1), `#vat` (2), `#invoices` (3 and 4), `#fees` (5 and 7), `#settings` (6), `#earlier` (8); each numbered heading carries an id — `money-by-month`, `vat-monitoring`, `to-invoice`, `claim-invoices`, `fee-controls`, `finance-settings`, `introducer-fees`, `earlier-invoices` — and Accounting's home cards link to `to-invoice`, `claim-invoices` and `vat-monitoring`.
- **Must never** Offer a field for an invoice's amount; join to the answers, the register data, the notes, the surveyor's workings or the estimate; show a plausible number where the letter is blank; send an invoice email.
- **Accept** `test/finance-claim.test.ts` and `test/finance.test.ts`: SALES and SURVEYING are refused the invoice and every route, writing nothing; ACCOUNTING is refused the assessment; the payload proof refuses the surveyor every CRM 7 route.

### `B11`/`B12` — settings, users and roles
- **Route** `GET /staff/settings` and `POST` `/profile` `/username` `/password` `/working-times` `/photo` `/photo/remove`; `GET /staff/users` · `POST /staff/users/create` · `/staff/users/{id}/role` · `/staff/users/{id}/disable`.
- **Roles** six since Phase 132e: the five, and `READ_ONLY`, which an administrator may assign and nobody holds. Migration 026 adds its row, dropping and recreating the `roles_fixed_insert` trigger around it; a seventh is refused at the database.
- **Must never** Let a role edit another user's identity. **Photograph handling stores nothing the user sent** — the bytes are decoded to pixels and a new file is written from those pixels, so a payload in a `tEXt` chunk or appended after `IEND` is gone **by construction** rather than by being stripped; decompression bombs are refused from `IHDR` before any inflate; PNG only, 2 MB.
- **Accept** `test/settings.test.ts`, `test/images.test.ts`.

### `B13`/`B14` — organisations — CRM 1 of 10
- **Route** `GET /staff/organisations` · `GET /staff/organisations/{id}` · `GET /staff/organisations/{id}/view.json` (the page's own object, since the CRM follow-on) · `POST /staff/organisations/{id}` · `POST /staff/organisations/{id}/contacts` · `POST /staff/contacts/{id}` · `POST /staff/organisations/{id}/properties`.
- **Phase 134** `GET /staff/organisations/{id}` asks `organisation.read` exactly as before and then answers **303 to `/staff/clients/{id}`**, the one client page (`B5`/`B6`), carrying its query. Its sections are drawn there by `organisationSections` in `src/web/crm-pages.ts`; the four POST routes redirect back to the tab they act on. The list links every name to the client page.
- **Who** `organisation.read` / `organisation.write` — ADMIN, SALES. Contacts panel `contact.read` / `contact.write` — ADMIN, SALES. **ACCOUNTING, SURVEYING and CLIENT are refused the section.**
- **Fields** trading name (the funnel's `name`, read-only here) · legal name · company number · claimant type · registered and trading address · website · client status · source · **referred by** — the firms whose referrals became its leads, read through those leads for `introducer.read` (the CRM follow-on) · owner. Each derived fact shows its source and **no input is drawn for it**.
- **Writes** `businesses`, `contacts`, `properties`. **Must never** Take a derived fact from a form; queue anything to a DO_NOT_CONTACT organisation; render the website as a link.
- **Accept** `test/crm.test.ts` — the refusal for every role not granted each action; the DO_NOT_CONTACT refusal through the transport and at the database, with its negative control; the stored cross-site scripting test on a contact's notes.

### `B15`/`B16` — properties — CRM 1 of 10
- **Route** `GET /staff/properties` · `GET /staff/properties/{id}` · `GET /staff/properties/{id}/view.json` · `POST /staff/properties/{id}` · `POST /staff/properties/{id}/claims`.
- **Who** `property.enter`, then `property.read` — ADMIN, SALES, and SURVEYING `throughAssignedJob`. Writes and opening a claim: ADMIN, SALES.
- **`view.json` serves the object the page is drawn from**, as `payload.json` does for the survey, so N1 is verified on the wire.
- **Must never** Ask a jurisdiction the postcode already answers, or a prior-claim position the funnel's own answer already states (the CRM follow-on); store a person's name as a previous owner or occupier; store an acquisition price of zero.
- **Accept** `test/crm.test.ts` — jurisdiction derived and a recorded one refused; the N2 guard; N4 on the seed's UNKNOWN and never-asked properties, on the page and on the wire.

### `B17`/`B18` — claims — CRM 1 of 10
- **Route** `GET /staff/claims` · `GET /staff/claims/{id}` · `GET /staff/claims/{id}/view.json` · `POST /staff/claims/{id}` · `POST /staff/claims/{id}/team` · `POST /staff/claim-team/{id}/end` (the team, since the CRM follow-on).
- **Who** `claim.enter`, then `claim.read` — ADMIN, SALES, ACCOUNTING, and SURVEYING `throughAssignedJob`. Value: `claim.read_value`, ADMIN and SALES. Money: `invoice.read`. Writes: `claim.write`, ADMIN and SALES. The team's links: `claim_team.write`, ADMIN and SALES.
- **Writes** `claims` — owner, surveyor, priority, workstream, property, expected completion, hold and lost reasons. **Not the stage** — that moves in the claim page's pipeline panel, through `POST /staff/claims/{id}/stage` (B21) — **and not the next action**, which this form refuses with its reason (B23). `claim_contacts` (migration 020) — the organisation's own accountant and adviser linked to this claim, ended and never deleted.
- **Fields — the CRM follow-on** Came from · Source · Introducer (`lead.read`; the firm `introducer.read`) · **The claim team**: owner · surveyor, and who can reach the claim · tax adviser, as the sign-off record (`claim_figures.read`) · the organisation's accountant and adviser on this claim (`contact.read`), with **Add to the team** and **Take off the team** · **Our estimated fee** (`invoice.read`), until a fee invoice is live.
- **Must never** Put the value, the tax benefit or any sealed estimate field in a SURVEYING or ACCOUNTING response; let a claim point at another organisation's property (a composite foreign key refuses it); delete a claim or change its reference; store a firm, a source or a fee on the claim; link a contact of another organisation, or one not typed accountant or adviser; draw a surveyor anything on the team it could not already read.
- **Accept** `cd 09-app/backend && CAPREBATE_ALLOW_SEED=1 node tools/payload-proof.ts` exits 0 — see §6, N1 — and `test/crm.test.ts` and `test/follow-on.test.ts`.
- **Phase 134 — the company leads.** The claim page's heading and browser tab lead with the **company's name**; the property and the reference sit under it, the reference as a small grey label; a breadcrumb "Company > Property" frames it. The same page is drawn at `/staff/claims/{id}` and inside its company at `/staff/clients/{company}/claims/{id}`. The claims list's columns are **Company, Property, Stage, Next action, Owner, Reference** — the reference last and grey — and it sorts by company by default (`company`, "Company, A to Z"); the export's columns lead with the company and end with the reference. **No staff screen uses a claim reference as a heading, as link text or as a row's first cell**: `test/phase134.test.ts` crawls every screen every staff login reaches and reads the rendered HTML for it. Every claim link elsewhere — the board's cards, home, tasks, the dashboard, finance, the document centre, introducers and search — names the company or the property and puts the reference beside it in grey (`claimRef`, `claimLink` in `src/web/components.ts`).

### `B19`/`B20` — leads — CRM 2 of 10
- **Route** `GET /staff/leads` · `POST /staff/leads` · `GET /staff/leads/{id}` · `GET /staff/leads/{id}/view.json` · `POST /staff/leads/{id}` · `POST /staff/leads/{id}/checks` · `POST /staff/leads/{id}/convert`.
- **Who** `lead.read`, `lead.write`, `lead.convert` — ADMIN, SALES. The range shown asks `estimate.read`. **ACCOUNTING, SURVEYING and CLIENT are refused the section.**
- **Fields** organisation (or, for a referral, its name and sector) · what made it a lead · source · introducer (a column CRM 5 of 10 gives its foreign key) · lead date · owner · priority · next action and due · status · lost reason from the list · conversion. **No score, no probability, no person.**
- **Must never** Qualify on anything but four recorded YES; convert without asking the gate again; re-key what the assessment captured.
- **Accept** `test/leads.test.ts`.

### `B21` — the pipeline board, and a claim's moves — CRM 2 of 10
- **Route** `GET /staff/pipeline` · `GET /staff/pipeline/view.json` · `POST /staff/claims/{id}/stage` · `POST /staff/claims/{id}/milestones` · `POST /staff/claims/{id}/checks`.
- **Who** `pipeline.read` — ADMIN, SALES. Moves and confirmations `claim.move` — ADMIN, SALES; a reopen `claim.reopen` — ADMIN alone. A card's value asks `claim.read_value`, card by card.
- **Dragging is a button.** The content security policy forbids script and every page works without JavaScript, so a card carries a form asking to move it one stage on; it posts the same move the claim page makes and **the server asks the gate again**.
- **Must never** Put a value on a card for anyone who cannot read the estimate; let the button stand for the gate.
- **Accept** `test/pipeline.test.ts` and the payload proof.

### `B22` — tasks and my tasks — CRM 3 of 10
- **Route** `GET /staff/tasks` (`?view=all` for Admin and Sales) · `GET /staff/tasks/view.json` · `POST /staff/tasks` · `GET /staff/tasks/{id}` · `POST /staff/tasks/{id}` · `POST /staff/tasks/{id}/status`.
- **Who** read and progress: whoever `staff_task.read` admits to the task; create, change and cancel: Admin, Sales.
- **Fields** task · description · activity type · what it is about, each linked only where the reader may open it · owner, or the team it waits with · due date, with **OVERDUE** in words · priority · recurrence · status, with who completed or cancelled it, and why.
- **Must never** Delete a task; change a closed one; count a task with no due date as overdue or as on time.
- **Accept** `test/tasks.test.ts`.

### `B23` — a claim's next action, tasks, email and timeline — CRM 3 of 10
- **Route** panels on `GET /staff/claims/{id}` · `POST /staff/claims/{id}/next-action` · `POST /staff/claims/{id}/notes` · `POST /staff/claims/{id}/email`. A move to `POST /staff/claims/{id}/stage` may carry `next_action_title`, `next_action_owner` and `next_action_due`, written with the move.
- **Who** next action `claim.write`; note `internal_note.write`; email `email.queue`. `view.json` carries the panels as `tasks` and `timeline`, built forwards.
- **The organisation (B14), property (B16) and lead (B20) pages** draw the same timeline for their subject, and a task form. A surveyor on a property page is drawn no timeline.
- **Must never** Let the claim's own edit form write a next action — it is refused, with the reason; give Accounting more than its financial timeline; give a surveyor more than their own tasks and a timeline of stage labels.
- **Accept** `test/tasks.test.ts`, `test/crm.test.ts` and the payload proof.
- **Phase 134 — one timeline per company.** The company's timeline is on its one client page (`B5`/`B6`); a claim page draws that claim's part of it, headed so, with a link to the whole. A claim in a timeline is named by its property and ends " · CR-2026-0007", the reference drawn as the grey label; a note's "About" reads the same, or "the company in general". Everything that talks to the client — notes, questions, document requests — is stored on the company with an optional claim, so one timeline holds it all.

### `B24` — the one-next-action list — CRM 3 of 10
- **Route** `GET /staff/next-actions` · **Who** `pipeline.read` — Admin, Sales. Every open claim breaking the rule, then every claim keeping it with the next action overdue, each with who is waiting.

### `B25` — automation rules — CRM 3 of 10
- **Route** `GET /staff/automation` · `POST /staff/automation` · `POST /staff/automation/{id}` · **Who** read Admin, Sales; write Admin. The forbidden effects are listed on the page with their reasons and refused by the store. What each rule did is below them. Since CRM 9 of 10 it is also listed on the admin settings screen, `B43`, and a rule may ask the client for a document of a type something can receive. Since the CRM follow-on the page says each forbidden refusal once, and a rule that asks for a document is saved with the document it names.

### `B26` — email templates — CRM 3 of 10
- **Route** `GET /staff/templates` · `POST /staff/templates` · `POST /staff/templates/{id}` · **Who** read Admin, Sales; write Admin. A template carrying bank details or an invoice is refused.
- **Phase 134 — an email's subject leads with the company.** `companyFirst` in `src/web/templates.ts` puts the company's name in front of any merged subject that does not already start with it; migration 032 rewrites the seeded subject to "{{organisation}} — the next step on your claim" while it still holds the seeded words. A **staff notice** from an automation rule is BUILT BOTH WAYS AND SWITCHED OFF: `NOTICE_SUBJECT_LEADS_WITH_COMPANY` in `src/web/automation.ts` is `false`, so the notice says what happened and ends with the reference — "A claim is now at Survey (CR-2026-0004)" — and names no company, until Lakhbir answers "Should an email to our own staff name the client company in its subject line?" in CAPREBATE QUESTIONS.

### `B27` — a claim's documents and requests — CRM 4 of 10
- **Route** the Documents panel on `GET /staff/claims/{id}` · `POST /staff/claims/{id}/document-requests` · `POST /staff/claims/{id}/documents` (a link, through the same handler) · `POST /staff/claims/{id}/documents/link` · `POST /staff/document-requests/{id}/withdraw`. `view.json` carries the panel as `documents`, built forwards for the reader.
- **Who** as UC-B16. Accounting's panel holds the fee invoice and the signed letter; a surveyor's the job's claim evidence, and no requests.
- **Must never** Offer a "received" button; offer a type with no receipt policy as one that can be asked for.
- **Accept** `test/documents.test.ts` and the payload proof.

### `B28` — a document and its versions — CRM 4 of 10
- **Route** `GET /staff/documents/{id}` · `GET /staff/documents/{id}/view.json` · `GET /staff/documents/{id}/download` · `POST /staff/documents/{id}/links` · `POST /staff/document-links/{id}/end` · `POST /staff/documents/{id}/versions`.
- **Who** `document.read` on the document, audited allowed or refused; the original `document.read_original` — Admin, answered 410 because there is none; links `document.link`; a new version `document.upload`.
- **Fields** type · who may read it · the receipt strip · the type's clock today · links, each ended with when · **every version**: its number, when, by whom — a role, never a name — its state, the strip, the original's deletion, and **its own deletion clock**.
- **Must never** Leave a refused version out of the history; read a version's clock off its type.

### `B29` — document types — CRM 4 of 10
- **Route** `GET /staff/document-types` · `POST /staff/document-types` · `POST /staff/document-types/{code}` · **Who** read Admin, Sales; write Admin. A receipt policy is not on the page. Since CRM 9 of 10 the types are also listed on the admin settings screen, `B43`. **Layout — Phase 133b** a left-hand section list by reader group, in `READERS` order (a reader value outside it gets its own section, never dropped), then **Add a type**; each type is one `<details>` line — name, code, and badges for value, deletion clock and state — opening to its facts and its labelled form.

### `B30`/`B31` — introducers, and one firm — CRM 5 of 10
- **Route** `GET /staff/introducers` · `POST /staff/introducers` · `POST /staff/referrals` · `GET /staff/introducers/{id}` · `GET /staff/introducers/{id}/view.json` · `POST /staff/introducers/{id}` · `POST /staff/introducers/{id}/contacts` · `POST /staff/introducers/{id}/contacts/{contact}` · `POST /staff/introducers/{id}/contact-log` · `POST /staff/introducers/{id}/next-contact` · `POST /staff/introducers/{id}/referrals`.
- **Who** as UC-B18. Sales sees everything but the money; Accounting the firm's name and the money; a surveyor nothing.
- **Fields** kind · owner · relationship started · last contact (derived) · next contact (a task, overdue flagged) · notes · leads referred, claims opened, won, reasoned negatives · estimated claim value · fees invoiced and paid · the people at the firm and who receives notices · contact with the firm as tasks, logged and planned · referrals with their stage and whether progress is shared · model B fees.
- **Must never** Offer a login for anyone at the firm; show Accounting the pipeline or the value; show Sales the money; offer a reciprocity kind while model A is off.
- **Accept** `test/introducers.test.ts` and the payload proof.

### `B32` — the reward model and the fees — CRM 5 of 10
- **Route** `GET /staff/introducer-rewards` · `GET /staff/introducer-rewards/view.json` · `POST /staff/introducer-rewards` · `POST /staff/introducer-fees/{id}/disclosure` · `POST /staff/introducer-fees/{id}/settled`.
- **Who** as UC-B19. The switch is Admin's; the page shows clause 1's blanks read from the letter and the question they wait on.
- **Must never** Leave off while clause 1 is blank; mark a fee paid before its disclosure.

### On `B20`, a lead — CRM 5 of 10
- **Route** `POST /staff/leads/{id}/share-progress` · **Who** `share_consent.record`. The lead page draws the firm that referred it, the property basics a referral brought, the words of the current wording version with a form to record the client's answer — *choose, nothing is assumed* — and every notice that fell due, queued or not and why.

### `C11` — the public referral form — CRM 5 of 10, **SHIPPED OFF**
- **Route** `GET /refer` · `POST /refer` · **Who** anyone, **once its gate is open**: `REFERRAL_FORM.enabled` in `src/web/introducers.ts`, false until a privacy notice is published that tells a referred client what a firm passed to us. Shut, the route does not exist — it answers exactly as a path that does not exist.
- **Fields** practice · name · email · telephone · the client business's name · sector · postcode or its first half · what happened at the property · the year · the firm's confirmation that its client agreed.
- **Must never** Attach itself to a firm already recorded — it makes a new firm row, marked as from the form; write anything without the confirmation; draw a script.
- **Accept** `test/introducers.test.ts` — shut and open.

### On `B17`/`B18`, a claim — the facts, the four figures, the deliverables and aftercare — CRM 6 of 10
- **Route** `POST /staff/claims/{id}/facts` · `/grants` · `/grants/{grant}/withdraw` · `/owners` · `/owners/{owner}/withdraw` · `/signoff` · `/deliverables` · `/reconciliation/filing` · `/reconciliation/variance` · `/reconciliation/outcome` · `/enquiries` · `/enquiries/{enquiry}/close`. The four panels are drawn on the claim page from the claim's own `view.json` — `facts`, `figures`, `deliverables`, `aftercare` — so the payload proof inspects the wire.
- **Who** as UC-B20, UC-B21 and UC-B22. A surveyor on an assigned job sees **the released facts alone**; Accounting none of the four.
- **Fields** every fact with its source — publisher, provenance, derived or recorded, where it was read, when and by whom; the amendment window with the engine's assumption; the break-even, stamp duty and alterations switches shown OFF; the prior owner chain; grants with their traced elements; A, B, C and D with their hashes and B's shut gate named; the sign-off record, shown as a record and not a signature; the reconciliation with its variance and review reason; each deliverable's state, version, issue date, document type and why it cannot be stored yet; enquiries; clause 13's reading; the disposal task.
- **Must never** Offer to record a fact a better source derives; show a surveyor an amount, the window, the profit position or a figure; offer to draft a client report or the accountant's pack before the sign-off; offer anything that changes an issued defence pack.
- **Accept** `test/claim-record.test.ts` and the payload proof.

### On `C6`, the portal — what we have issued to you — CRM 6 of 10
- **Who** the client, on their own claims, through `deliverable.read`. **Lists** an issued reasoned negative, an issued s.203 notification, and an issued client report once its figure is released — each with its version and date, **and no figure**. A claim that exits as a reasoned negative is told here, and the portal's stage does not move.

### `B33`–`B39` — the compliance registers — CRM 8 of 10
- **Route** everything under `/staff/compliance`: the landing page and its `view.json`; `/aml` and `/aml/checks/{id}`; `/rights` and `/rights/{id}` (with `view.json`); `/complaints` and `/complaints/{id}`; `/breaches`, `/breaches/{id}` and `/breaches/{id}/ico-sheet`; `/identity` and `/identity/{person_ref}`; `/consent/{contact}`; `/retention` and its `view.json`.
- **Who** `compliance.read` and `compliance.write` — ADMIN today. S2 asks `compliance.identity_read` or `compliance.identity_write`, which nothing inherits. **Since Phase 129 a `DPO` role is defined to hold these four and `disclosure.read` and nothing else, and it is switched off** — `DPO_ROLE_SWITCH` in `src/authz.ts`; no user can hold it.
- **Every register page carries the one-person notice** — the landing page, each register, S2, a contact's consent history and the retention list; the CRM follow-on added it to the last three.
- **Fields** the settings, dated with their source; each register's fields as its document defines them — the AML/KYC Position Paper section 5, the rights-request pack's Tables A and B and its complaints log, the breach procedure's Tables A and B with the four Article 34 facts; the Article 12A working per right and the thirty days shown as arithmetic; holds with a reason and a review date; cross-references in both directions; the retention clock of every record kind, UNSET shown as unset. **Since Phase 132, RET-1 to RET-4 read as the Retention Determinations draft them** (sections 12.2–12.6): each is `DERIVED_NOT_APPROVED`, with its period, trigger and owner, and the open question named where the determinations leave one. **None is approved**, which is the data protection officer's act. The deletion log is a record kind on the list, with no screen of its own.
- **Must never** Show S2 as a list, or a name in a search result; store a deadline; record bank details; let an insurer be recorded as told on silence; let PSC data stand for beneficial ownership without this check's dated decision; offer a delete; say to a client or an accountant that a check exists.
- **Accept** `test/compliance.test.ts`, `test/compliance-clock.test.ts` and the payload proof.

### On `C6`, the portal — the firm that referred you — CRM 8 of 10
- **Route** `POST /portal/share-progress` · **Who** `share_consent.client_record`, the client on their own organisation. Shows, per firm that referred the client, whether progress is shared and the words; a button to stop while the answer is yes; a button to say yes only once its switch is on.

### `B40` — the management dashboard, and my work on `B0` — CRM 9 of 10
- **Route** `GET /staff/dashboard` · `GET /staff/dashboard/view.json`, each taking `period` — MONTH, QUARTER, FINANCIAL_YEAR with `fy`, or RANGE with `from` and `to` — since the CRM follow-on; my work on `GET /staff`. **Who** `dashboard.enter` — the four staff roles — and then each tile's own actions.
- **The period — this is the reports screen** (the CRM follow-on). There is no second reports screen. The period comes from a fixed table, anything else is dropped and said, and no period is exactly the dashboard as it was. A tile that counts what happened in time — leads by their date, claims completed, days to completion, expected completion, exits and lost reasons, money by calendar month — reads the period and says so; a tile that counts what stands today says it is as at today; a lost lead, which carries no date it was lost, is counted apart.
- **Fields** per tile: its lines, what is counted apart, and one sentence saying how it is read. Pipeline: open value, average and won value, by stage, owner and introducer, leads and conversion by source, days to completion and the slowest stage, expected completion, exits and lost reasons. Money: estimated fees; invoiced, paid, outstanding, overdue. Reconciliation: the cases, the gaps, deliverables not issued. Work: overdue tasks, outstanding client questions and document requests. Compliance: the clocks running. A surveyor: my survey jobs. My work adds my claims with their next action and what each waits on, and every open question I asked.
- **Must never** Store a figure; show a surveyor anything estimate-derived; add an unknown in as nought; place an undated row inside a period.
- **Accept** `test/dashboard.test.ts`, `test/follow-on.test.ts` and the payload proof.

### `B41` — global search — CRM 9 of 10
- **Route** `GET /staff/search?q=` · `GET /staff/search/view.json?q=`. **Who** every staff role, each kind searched only where the rule table lets that role read it; the page says which kinds were not searched.
- **Must never** Search the identity store or its log, a compliance register, document text, a note body without `internal_note.read`, or the estimate; filter after the query instead of inside it; take a wildcard. An invoice is found by the start of its number — `CB-0` — since the CRM follow-on.
- **Accept** `test/search.test.ts` and the payload proof.
- **Phase 134** A claim is found by its reference **and by its company's name**, and is named "Company — Property", its reference in the detail. The hits are ordered **company-name matches first** — the company itself, then anything whose company's name matches, then the rest — which changes the order only. An invoice hit reads "Company — invoice CB-000001".

### `B42` — the claims and leads lists, saved views and export — CRM 9 of 10
- **Route** `GET /staff/claims` · `GET /staff/leads` with filter and sort parameters; `POST /staff/views` · `POST /staff/views/{id}/retire`; `GET /staff/claims/export.csv` · `GET /staff/leads/export.csv`. **Who** the claims list and its views, the four staff roles; **the leads list and its views, ADMIN and Sales** (`lead.read`); sharing a view, ADMIN; export, `list.export` — the claims for ADMIN, Sales and Accounting, the leads for ADMIN and Sales.
- **Fields** filters: owner, stage, source, introducer, sector, property type, jurisdiction, dates, status, and value where the role reads it; sorts: next action, age, value, due date, priority. A parameter the list does not take is named as ignored. A filter on a column the reader cannot read is not applied to the export, and since the CRM follow-on the page says so beside the link and the export's audit line names it.
- **Must never** Build an ORDER BY from a request value; export a column the page would not show the reader; leave a cell beginning `=` `+` `-` or `@` live.
- **Accept** `test/lists.test.ts` and the payload proof.

### `B43` — admin settings — CRM 9 of 10
- **Route** `GET /staff/admin-settings` · `GET /staff/admin-settings/view.json` · `POST /staff/admin-settings/values` · `/values/{list}/{code}` · `/reasons` · `/reasons/{list}/{code}` · `/setting`; and on a firm's page `POST /staff/introducers/{id}/merge`. **Who** `configuration.read` — ADMIN, Sales; `configuration.write` and `introducer.merge` — ADMIN.
- **Fields** the five lists and the two reason lists, each value with its code, label, state and where it came from; the document types, the automation rules and the templates, each linked to its own page; the finance settings and the compliance settings as dated rows with their source; what no setting may change, each with its reason.
- **Must never** Delete a value or change its code; retire a value the application writes; move a gate, a switch, the reward model or a role boundary — the request is refused by name and recorded; move a fee, a notice or a client's answer in a merge.
- **Layout — Phase 133b** a left-hand section list: one section per list (`#list-{code}`), per reason list (`#reasons-{code}`), per summary (`#summary-…`) and last `#may-not-change`. A save redirects to its list's section.
- **Accept** `test/configuration.test.ts` and the payload proof.

### `B44` — the document centre — the CRM follow-on
- **Route** `GET /staff/documents` · `GET /staff/documents/view.json`. **Who** `document_centre.enter` — the four staff roles — and then `document.read` on **each row**, so each role's list holds exactly the documents its own pages would open. CLIENT is refused: the portal is the client's list.
- **Fields** document · type · organisation · the claims it is linked to, or *on no claim* · state — received, not received yet, or refused · newest version, when and by whom (a role) · how many versions. Filters: type, organisation, claim, state; orders: newest version first, type then number, organisation then type. A parameter the list does not take is named as not applied.
- **Must never** List a document the reader cannot open; search what a document says; offer an export; build an ORDER BY from a request value.
- **Accept** `test/follow-on.test.ts` and the payload proof.

### `B45` — the audit log — the CRM follow-on
- **Route** `GET /staff/audit`, with `kind` and `outcome`. **Who** `audit.read` — ADMIN alone.
- **Fields** the chain's reading — intact, recomputed from the genesis, or broken at a named entry · for each of the newest two hundred lines that match: number · when · kind · role · who (an id) · what it was about (a type and an id) · outcome.
- **Must never** Read or draw a line's detail; offer an edit or a delete; leave its own read out of the log.
- **Accept** `test/follow-on.test.ts` and the payload proof; `npm run verify-audit` beside it, from the database file.

---

# 3 · What every API does

**Two kinds, and they are not blurred.** *Internal* is every route the two
applications call. *External* is every register and supplier. **Nothing in the
external table fires today** — see §4.

## 3.1 · Internal — the routes

**How a refusal looks, everywhere.** `authorise` throws `NotAuthorised`, which is
not caught by any handler and reaches the server's own error handler: **HTTP 403,
body `{"error":"not authorised"}`**, with no detail about what exists. A missing
row on a collection a role may not use throws `NotFoundAsRefusal` (`E_NOT_AUTHORISED`)
and produces **the same 403** — *not found* and *not yours* are deliberately
indistinguishable, so an id cannot be probed. An unauthenticated request to
`/staff` or `/portal` **redirects to `/login`**; to `/api/*` it is **401** with
the generic failure. A body over the cap is **413**. **Signed out, an address that does
not exist also answers 401 with the generic failure; signed in, it is 404** — so a public route
that is switched off, such as `/refer`, reads exactly as a missing page either way.

### Public — no session

| Method | Path | Takes | Returns | Refuses |
|---|---|---|---|---|
| GET | `/` | — | **the website** — `Caprebate site.html`, read from its fixed path (`SITE_PATH` in `src/web/public-site.ts`) and served without its in-page assessment, with its style and script as the two assets below, under the back end's policy plus `script-src 'self'`; its assessment links go to `/assessment`, its form to `/enquiry`, its **Log in** button to `/login` (Phase 133j). With no site file beside the build, the back end's own front page | the edition is refused if anything inline is left |
| GET | `/assets/site-page.css` · `/assets/site-page.js` | — | the website's one `<style>` block and one `<script>`, cut from the same file; never a path mapped onto the disk (Phase 133j) | — |
| POST | `/enquiry` | name, practice, email, telephone, property type, message, consent | keeps the website enquiry in `website_enquiries` (migration 031) and thanks the person | **400** without a name, a real address, a listed property type or consent; rate limited per address |
| GET | `/assets/site.css` | — | the one stylesheet, as a string constant | — |
| GET | `/assets/cap-rebate-logo.png` | — | the supplied mono-ink Cap Rebate lockup, byte for byte, from a base64 constant in `src/web/brand-logo.ts` — never read from disk (Phase 133c) | — |
| GET | `/assessment` | draft cookie (optional) | starts or resumes | — |
| GET·POST | `/assessment/{Q1\|Q1a\|Q1b\|Q1c\|Q2\|Q3}` | the screen's fields | the next screen; **`no` at Q1b → `/assessment/no-claim`** | an unknown screen id falls through to 404; **a draft the gate stopped → `Q1c`, `Q2`, `Q3` redirect to `/assessment/no-claim`** |
| GET | `/assessment/figure` | draft cookie | the ceiling, its qualifier, the breakdown | no draft → redirect to `/assessment`; **a draft the gate stopped → redirect to `/assessment/no-claim`** |
| GET | `/assessment/no-claim` | draft cookie | the reasoned negative, naming the gate in the engine's words | no draft → redirect; **a draft the gate did not stop → redirect to its own screen** |
| GET | `/assessment/close` | draft cookie | the close form **with live slots** | no draft → redirect |
| POST | `/assessment/close` | name, role, business, channel, consent, marketing, slot | writes the lead, renders the thank-you — **at a reasoned negative, a lead with no organisation and its own contact and booking, and a thank-you with no range** | **400** with the form and a sentence: no name, no channel, or no contact consent |
| GET·POST | `/refer` | practice, name, email, telephone, the client business, sector, postcode, event, year, the practice's confirmation | **SHIPPED OFF** — `REFERRAL_FORM.enabled` is false, and the route answers exactly as a path that does not exist. Open: a lead of origin REFERRAL on a new firm row marked PUBLIC_FORM. CRM 5 of 10 | **400** with the form and a sentence: no client name, no email, no confirmation |
| GET·POST | `/login` | email, password | session cookie; `can()` decides the landing page; **a GET from somebody signed in goes to their home** (Phase 133j) | **401** and the generic failure |
| POST | `/account/create` | the offer from the thank-you page, email, name, password | a single-use link written to the outbox (`ACCOUNT_VERIFY`), built from `CAPREBATE_PUBLIC_ORIGIN`, never the Host header; the same screen whether or not the address already has a login (Phase 133j, `src/web/signup.ts`) | **400** for an unknown or expired offer, or a password under 12 characters; rate limited per offer |
| GET·POST | `/account/verify` | the link's token | GET draws a confirm button and writes nothing; the POST creates the CLIENT login for the organisation the assessment recorded | **400** for a used, expired or unknown link, or an address that already has a login |
| POST | `/logout` | session | clears the cookie, ends the session server-side | — |

### Client portal — `CLIENT` on their own business, or staff

| Method | Path | Who | Returns / writes |
|---|---|---|---|
| GET | `/portal` | `business.read` + `ownBusiness`; each claim `claim.progress_read` | the company's name as the heading · **Your claims**, one tile per claim (Phase 134) · range · letter state · appointment and its move control · open questions · the documents we asked for · documents |
| GET | `/portal/claims/{claim}` | `business.read`, then `claim.progress_read` + `ownBusiness` on the claim | one claim's property and progress in the client's six steps (Phase 134). **Looked for only among the company's own claims**: another company's claim and a missing one both answer the same **404** |
| GET | `/portal/letter` | `engagement.read` | the letter parsed from the `.docx`, its open terms and its specimens marked. Records `VIEWED` |
| POST | `/portal/letter/sign` | `engagement.read` | `engagements.state = SIGNED`. **Stubbed provider; real state machine** |
| POST | `/portal/bookings/{id}` | `booking.move_own` + `ownBusiness` | move it to a chosen `starts_at`, `release=on` to give the time back and keep the enquiry, or `cancel=on` to cancel it outright (Phase 132e). Re-asks `isBookable` **at the write**, with `ignoreBooking` set to this booking. At any time for the call held; a NEW time must be two hours away |
| POST | `/portal/tasks/{id}` | own business | `client_tasks` → `ANSWERED`, with the answer state and who gave it. **A document request is refused here: it is answered by an upload** |
| POST | `/portal/documents` | `document.upload` on own business | a short-lived, single-key, single-use upload URL for **a version of a document** of a type with a receipt policy — by `type_code`, by `request`, or as a new version of `document`. **No file name is taken.** CRM 4 of 10 |
| PUT · POST | `/upload/put` | signed in, that key, `document.read` on the row | the bytes — by `PUT`, or from a browser by the portal form's multipart `POST` through the same handler and the same key (the CRM follow-on). Server-side allow-list, size cap, **content sniffing** — **then steps 2 to 7 on this request, and the request it answers RECEIVED**. A used link answers **409** |
| GET | `/portal/documents/{id}` | `document.read` on its document | what was done with it — the `document_events` trail |
| GET | `/portal/documents/{id}/download` | `document.read` on its document | **410 under fail-closed settings**: the original was deleted and there is nothing to serve |
| any | `/portal/settings/*` | `self` | the same implementation as `/staff/settings` |
| POST | `/portal/share-progress` | `share_consent.client_record` | the client withdraws a yes; giving ships OFF. CRM 8 of 10 |
| GET | `/portal/help` | signed in | the user guide's `C6` training section, without the trainer's exercise and self-check, from `src/web/help-content.ts` (Phase 133c) |
| POST | `/portal/welcome/dismiss` | the user themselves | hides the welcome card for good: `users.welcome_dismissed_at` (migration 030), audited `WELCOME_DISMISSED` once (Phase 133c) |

### Back office — behind `backoffice.enter`

| Method | Path | Action authorised | Notes |
|---|---|---|---|
| GET | `/staff` | `backoffice.enter` | ADMIN · SALES · ACCOUNTING · SURVEYING — with **My tasks**, each task through `staff_task.read` |
| GET | `/staff/assessments` | `assessment.read` | ADMIN · SALES |
| GET | `/staff/assessments/{id}` | `assessment.read` then `answer.read` **per row** | |
| GET | `/staff/calendar` | `booking.read` | `?view=day\|week&date=` |
| GET | `/staff/calendar/{id}` | `booking.read` | |
| POST | `/staff/calendar/{id}/schedule` | `booking.write` | re-asks `isBookable` **at the write** |
| GET | `/staff/clients` | `business.read` | who is waiting on whom |
| GET | `/staff/clients/{id}` | **the one client page** (Phase 134): the organisation's record by `organisation.read`, the four working panels by the section's `research.read`, notes by `internal_note.read` | `src/web/client-page.ts`. A login on neither is refused by `organisation.read` |
| GET | `/staff/clients/{id}/claims/{claim}` | `claim.enter`, then `claim.read` | the claim page inside its company (Phase 134). A claim addressed under a company that is not its own is refused as one that does not exist |
| POST | `/staff/clients/{id}/research` | `research.run` | fires **everything outstanding**. Today: nothing is contacted |
| POST | `/staff/clients/{id}/research/retry` | `research.run` | |
| POST | `/staff/clients/{id}/tasks/send` | `internal_note.write` scope | puts a question **to the client** |
| POST | `/staff/clients/{id}/tasks/answer` | as above | records an answer taken by staff |
| POST | `/staff/clients/{id}/tasks/withdraw` | as above | takes back a question asked in error. **OPEN only**, refused against the row, and the withdrawal records who and when |
| POST | `/staff/clients/{id}/notes` | `internal_note.write` | escaped on output; there is a test that posts a script tag |
| GET | `/staff/survey` | `surveyor_job.enter` | |
| GET | `/staff/survey/{job}` | `surveyor_job.read` (`assignedSurveyor` for SURVEYING) | the six panels |
| GET | `/staff/survey/{job}/payload.json` | the same rule as the page | **the screen's own object, served** — not a demonstration beside it |
| POST | `/staff/survey/{job}/rooms` | `surveyor_job.read` | room counts, with *none* distinguished from *not counted* |
| POST | `/staff/survey/{job}/commit` | `surveyor_job.commit` — **SURVEYING only, assigned** | commits figures; **releases the estimate automatically** |
| POST | `/staff/survey/{job}/amend` | as above | after release |
| POST | `/staff/survey/{job}/disclosure` | as above | |
| GET | `/staff/finance` · `/staff/finance/view.json` | `invoice.read` | ACCOUNTING · ADMIN. By month, the VAT reading, the claims at INVOICE, the claim invoices, the fee controls, the settings. CRM 7 of 10 |
| GET | `/staff/finance/{id}` | `invoice.read` | a claim's invoice — number, money read, credit notes, money received; or an organisation's invoice from before, with benefit against fee |
| POST | `/staff/finance/claims/{claim}/raise` | `invoice.raise` | our fee at INVOICE; a break or abort fee only with its switch on and the letter complete. **Refused on a claim that has exited**, and every kind on OUTSIDE_AMENDMENT_WINDOW |
| POST | `/staff/finance/{id}/sent` · `/staff/finance/{id}/cancel` | `invoice.write` | cancelled only while unsent, with nothing against it; the number recorded as cancelled |
| POST | `/staff/finance/{id}/credit-in-full` · `/staff/finance/{id}/credit-clause-13` | `invoice.credit` | no typed amount; clause 13 refused while switched off or blank |
| POST | `/staff/finance/{id}/received` · `/staff/finance/received/{payment}/void` | `invoice.record_received` | bank transfer only; never more than owed; voided once, never deleted |
| POST | `/staff/finance/vat-check` | `invoice.write` | one task inside the margin, never a second; changes no invoice |
| POST | `/staff/finance/settings` | `finance_setting.write` — ADMIN | a dated value with its source, as a new row |
| POST | `/staff/finance/{id}/status` | `invoice.write` | an organisation's invoice from before CRM 7 of 10 only — a claim's invoice is refused; records **who**, audited |
| GET | `/staff/organisations` | `organisation.read` | ADMIN · SALES. CRM 1 of 10 |
| GET | `/staff/organisations/{id}` | `organisation.read` | **303 to `/staff/clients/{id}`** with its query (Phase 134); still refuses whoever it refused |
| GET | `/staff/organisations/{id}/view.json` | as the page | **the page's own object**, with the firms that referred it for `introducer.read` — refused to SURVEYING in the payload proof. The CRM follow-on |
| POST | `/staff/organisations/{id}` | `organisation.write` | a derived fact posted anyway is **refused with the reason**; `client_status` is named in the audit line when it moves |
| POST | `/staff/organisations/{id}/contacts` · `/staff/contacts/{id}` | `contact.write` | a contact is never a user; no consent is invented — both consent columns recorded as not given |
| POST | `/staff/organisations/{id}/properties` | `property.write` | |
| GET | `/staff/properties` · `/staff/properties/{id}` | `property.enter`, then `property.read` | SURVEYING **through an assigned job** |
| GET | `/staff/properties/{id}/view.json` | as the page | **the page's own object** — in the payload proof |
| POST | `/staff/properties/{id}` | `property.write` | jurisdiction never asked twice; N2 guard on previous owner and occupier |
| POST | `/staff/properties/{id}/claims` | `claim.create` | opens a claim with **no assessment**, at ENQUIRY — the estimate belongs to the claim the organisation's converted lead opened |
| GET | `/staff/claims` · `/staff/claims/{id}` | `claim.enter`, then `claim.read` | value `claim.read_value` (ADMIN · SALES); money `invoice.read`; ACCOUNTING's view is client, reference and money. The page is the same page `/staff/clients/{id}/claims/{claim}` draws |
| GET | `/staff/claims/{id}/view.json` | as the page | **the page's own object** — in the payload proof |
| POST | `/staff/claims/{id}` | `claim.write` | the stage is not writable here, and a next action is refused with its reason |
| POST | `/staff/claims/{id}/team` | `claim_team.write` (ADMIN · SALES) | links one of the claim's organisation's own contacts, typed accountant or adviser — refused twice, for another type and for another organisation, at the table as well. Audited with no name. The CRM follow-on |
| POST | `/staff/claim-team/{id}/end` | `claim_team.write` | takes the contact off the team, with who and when; ended once, never deleted |
| GET | `/staff/leads` · `/staff/leads/{id}` | `lead.read` | ADMIN · SALES. CRM 2 of 10. The range shown asks `estimate.read` |
| GET | `/staff/leads/{id}/view.json` | as the page | **the page's own object** — refused to SURVEYING in the payload proof |
| POST | `/staff/leads` · `/staff/leads/{id}` | `lead.write` | a lead carries no person; QUALIFIED asks the enquiry gate; LOST needs a listed reason; CONVERTED cannot be set here |
| POST | `/staff/leads/{id}/checks` | `lead.write` | YES, NO or UNKNOWN, append-only, with who recorded it |
| POST | `/staff/leads/{id}/convert` | `lead.convert`, then `claim.create` | asks the gate again; opens the claim at ASSESSMENT; the lead is final |
| GET | `/staff/enquiries` | `lead.write` | ADMIN · SALES. The website's enquiry form, waiting: name, practice, email, telephone, property type, what they wrote. The Leads page links it with the number waiting (Phase 133j) |
| POST | `/staff/enquiries/{id}/lead` · `/staff/enquiries/{id}/close` | `lead.write` | opens the enquiry as a lead through `createLead` (source Website) with a contact on the lead holding the person, or closes it; either once — a second is refused |
| GET | `/staff/pipeline` · `/staff/pipeline/view.json` | `pipeline.read` | ADMIN · SALES; each card's value asks `claim.read_value` |
| POST | `/staff/claims/{id}/stage` | `claim.move`; a REOPEN `claim.reopen` (ADMIN) | `kind` FORWARD one stage through its gate · EXIT with a listed reason · HOLD with a reason · RESUME · REOPEN with a reason. **400 with the gate's reason when it is shut**, audited REFUSED |
| POST | `/staff/claims/{id}/milestones` | `claim.move` | a confirmation, at its own stage; never the surveyor's commitment or the tax adviser's sign-off |
| POST | `/staff/claims/{id}/checks` | `claim.move` | the enquiry checks on a claim a person opened, while it is at ENQUIRY |
| GET | `/staff/tasks` · `/staff/tasks/view.json` | `backoffice.enter`, then `staff_task.read` per task | my tasks; `?view=all` asks `staff_task.create`. CRM 3 of 10 |
| POST | `/staff/tasks` | `staff_task.create`, and a read of what the task is about | at least one of a claim, a property, an organisation or a lead; `as_next_action` also asks `claim.write` |
| GET · POST | `/staff/tasks/{id}` | `staff_task.read` · `staff_task.write` | a completed or cancelled task keeps its record |
| POST | `/staff/tasks/{id}/status` | `staff_task.progress`; CANCELLED asks `staff_task.write` | cancelled with a reason and never deleted; completing a recurring task creates the next, once |
| POST | `/staff/claims/{id}/next-action` | `claim.write` | an owner and a due date, or refused; the next action before it stays a task |
| POST | `/staff/claims/{id}/notes` | `internal_note.write` | a note linked to the claim, audited without its words |
| POST | `/staff/claims/{id}/email` | `claim.read`, `email.queue`, `contact.read` | merged and escaped, gaps visible, to the outbox and NOT SENT; DO_NOT_CONTACT refused |
| GET | `/staff/next-actions` | `pipeline.read` | every open claim breaking the rule, and every overdue next action |
| GET · POST | `/staff/automation` · `/staff/automation/{id}` | `automation_rule.read` · `automation_rule.write` (ADMIN) | the forbidden effects refused by name |
| GET · POST | `/staff/templates` · `/staff/templates/{id}` | `email_template.read` · `email_template.write` (ADMIN) | bank details or an invoice refused |
| GET · POST | `/staff/document-types` · `/staff/document-types/{code}` | `document_type.read` · `document_type.write` (ADMIN) | a receipt policy is never bound here. CRM 4 of 10 |
| GET | `/staff/documents` · `/staff/documents/view.json` | `document_centre.enter` (the four staff roles), then `document.read` **per row** | the document centre: every document the reader may read, with fixed filters and orders; no search of a document's text and no export; CLIENT refused. The CRM follow-on |
| GET | `/staff/documents/{id}` · `/staff/documents/{id}/view.json` | `document.read` on the document, audited allowed or refused | every version, newest first, each with its own deletion clock |
| GET | `/staff/documents/{id}/download` | `document.read_original` (ADMIN) | **410** — there is no original to serve |
| POST | `/staff/documents/{id}/links` · `/staff/claims/{id}/documents/link` · `/staff/document-links/{id}/end` | `document.link` | a claim or a property of the document's own organisation; a link is ended, never deleted |
| POST | `/staff/documents/{id}/versions` · `/staff/claims/{id}/documents` | `document.upload` | a link through the same handler; the name derived; a type with no receipt policy refused before a link |
| POST | `/staff/claims/{id}/document-requests` | `document_request.create` | a type with a receipt policy; why and what it holds up; a due date or none. **Fires DOCUMENT_REQUESTED** |
| POST | `/staff/document-requests/{id}/withdraw` | `document_request.withdraw` | OPEN only; a received request stays received |
| GET · POST | `/staff/introducers` · `/staff/introducers/{id}` | `introducer.enter`, then `introducer.read` or `introducer.read_money` · `introducer.write` | ADMIN · SALES; ACCOUNTING the firm's name and the money, and nothing else. CRM 5 of 10 |
| GET | `/staff/introducers/{id}/view.json` | as the page | **the page's own object** — refused to SURVEYING in the payload proof |
| POST | `/staff/referrals` · `/staff/introducers/{id}/referrals` | `lead.write` and `introducer.write` | a lead of origin REFERRAL, its source derived from the firm, **no person on the lead** |
| POST | `/staff/introducers/{id}/contacts` · `/staff/introducers/{id}/contacts/{contact}` | `introducer.write`, `contact.write` | a person of type INTRODUCER on the firm; never a user |
| POST | `/staff/introducers/{id}/contact-log` · `/staff/introducers/{id}/next-contact` | `introducer.write`, `staff_task.create` | a staff task on the firm, done or planned with an owner and a date; reciprocity refused unless model A |
| POST | `/staff/leads/{id}/share-progress` | `share_consent.record` | the client's answer with its wording version; a yes queues where the claim stands, once |
| GET · POST | `/staff/introducer-rewards` · `/staff/introducer-rewards/view.json` | `introducer_reward.read` · `introducer_reward.switch` (ADMIN) | **refused while clause 1 of the letter is blank**, audited REFUSED |
| POST | `/staff/introducer-fees/{id}/disclosure` · `/staff/introducer-fees/{id}/settled` | `introducer_fee.disclose` · `introducer_fee.record_settled` | nothing payable before the disclosure; recorded, never collected |
| POST | `/staff/claims/{id}/facts` | `claim_facts.record` | a value, or not known, with its source; a fact a better source derives refused with the source named. CRM 6 of 10 |
| POST | `/staff/claims/{id}/grants` · `/grants/{grant}/withdraw` · `/owners` · `/owners/{owner}/withdraw` | `claim_facts.record` | a payer class, never a name; traced only with its elements; an owner a company or a role; withdrawn with who and when, never deleted |
| POST | `/staff/claims/{id}/signoff` | `tax_signoff.record` | at the sign-off stage, against a commitment on this claim; **a record, not a signature**, hashed; the first one opens the reconciliation |
| POST | `/staff/claims/{id}/reconciliation/filing` · `/variance` · `/outcome` | `reconciliation.record` | each once; the variance tag before the case closes; the outcome derived from the enquiry or the lapsed window |
| POST | `/staff/claims/{id}/deliverables` | `deliverable.record` | `action` DRAFT or ISSUE; a report stating a figure waits for the sign-off; **an issued defence pack needs its hash and never changes** |
| POST | `/staff/claims/{id}/enquiries` · `/enquiries/{enquiry}/close` | `hmrc_enquiry.record` | one open at a time, closed once; a reduction asks clause 13's switch, which ships OFF |
| POST | `/staff/claims/{id}/client-filing-confirmation` | `client_filing.record` (ADMIN, SALES) | Phase 132e. The client's own written confirmation, where they have no accountant or tax adviser: no accountant (yes / no / not sure), will file the amendment, the last day to amend as we state it (with the date), remains responsible for the filing position, and where the written confirmation is. Append-only, party always CLIENT; the REPORTS gate reads it (`src/web/client-filing.ts`) |
| POST | `/staff/claims/{id}/fee-discount` | `fee_discount.record` (ADMIN, SALES) | Phase 132e. A multi-site discount proposed on this claim's fee, as a share of the fee, with the reason. **Recorded, audited, never applied**; shown on the claim as awaiting the decision on the largest discount and who approves it (`src/web/fee-discounts.ts`) |
| GET | `/staff/compliance` · `/staff/compliance/view.json` · `/aml` · `/rights` · `/complaints` · `/breaches` · `/retention` · `/retention/view.json` | `compliance.read` (ADMIN) | the registers; **refused to SURVEYING in the payload proof, and to every other role but ADMIN**. CRM 8 of 10 |
| POST | `/staff/compliance/settings` | `compliance.write` | a dated value with its source; `AML_IN_SCOPE` ships false |
| GET · POST | `/staff/compliance/aml/checks` · `/aml/checks/{id}` · `/owners` · `/psc-decisions` · `/complete` · `/withdraw` · `/aml/officers` · `/aml/risk-assessments` · `/aml/notes` | `compliance.write` | an owner from the PSC pull refused without this check's dated decision; a finished check never edited |
| GET · POST | `/staff/compliance/rights` · `/rights/{id}` · `/limbs` · `/close` · `/letters` | `compliance.read` · `compliance.write` | the clock read per right, never stored; closing checks the response; a letter to the outbox only |
| GET · POST | `/staff/compliance/complaints` · `/complaints/{id}` · `/classify` · `/progress` · `/close` · `/letters` | `compliance.read` · `compliance.write` | classified once; the thirty days read |
| GET · POST | `/staff/compliance/breaches` · `/breaches/{id}` · `/awareness` · `/decision` · `/phases` · `/told` · `/close` · `/ico-sheet` | `compliance.read` · `compliance.write` | awareness fixed, corrected beside it; the four facts; no bank details; the answer sheet rendered, never stored |
| POST | `/staff/compliance/holds` · `/holds/{id}/lift` · `/links` · `/search` | `compliance.write` · `compliance.read` | a hold with a reason and a review date; the search never reaches S2 |
| GET · POST | `/staff/compliance/identity` · `/identity/search` · `/identity/{person_ref}` | `compliance.identity_read` · `compliance.identity_write` | **every read audited; every search logged in `identity_search_log`; no list** |
| GET · POST | `/staff/compliance/consent/{contact}` | `compliance.read` · `compliance.write` | the one history, the share answers read where they live |
| GET | `/staff/dashboard` · `/staff/dashboard/view.json` | `dashboard.enter`, then each tile's actions | the tiles the reader may see; **a surveyor its own jobs alone, in the payload proof**. CRM 9 of 10. `period` from a fixed table — the dashboard over a period is the reports screen (the CRM follow-on) |
| GET | `/staff/search` · `/staff/search/view.json` | per kind, from the rule table | at least two characters, twenty-five results; an invoice by the start of its number; never the identity store, the registers, document text or the estimate |
| GET | `/staff/claims` · `/staff/leads` | `claim.read` · `lead.read` per row | the claims list for the four staff roles, the leads list for ADMIN and SALES; filters and sorts from fixed tables; value only with `claim.read_value` |
| POST | `/staff/views` · `/staff/views/{id}/retire` | `saved_view.write` (own) · `saved_view.share` (ADMIN) | retired, never deleted |
| GET | `/staff/claims/export.csv` · `/staff/leads/export.csv` | `list.export` — ADMIN, SALES, ACCOUNTING; the leads export also needs `lead.read`, so ADMIN and SALES | the reader's own columns; audited with columns, row count and any filter not applied; formula cells neutralised |
| POST | `/staff/properties/{id}/notes` · `/staff/properties/{id}/documents/link` | `internal_note.write` · `document.link` | the property page's note and link; refused to a surveyor |
| GET · POST | `/staff/admin-settings` · `/view.json` · `/values` · `/values/{list}/{code}` · `/reasons` · `/reasons/{list}/{code}` | `configuration.read` (ADMIN, SALES) · `configuration.write` (ADMIN) | a value retired, never deleted; a fixed value never retired |
| POST | `/staff/admin-settings/setting` | `configuration.write` | **always refused**, by name, with the reason, recorded CONFIGURATION_REFUSED |
| POST | `/staff/introducers/{id}/merge` | `introducer.merge` (ADMIN) | leads, people and open tasks moved under one merge row; a firm with a fee refused |
| GET | `/staff/audit` | `audit.read` — **ADMIN alone** | kinds, ids and outcomes, filtered from fixed tables; never a line's detail; the chain verified on every read, and the read recorded as `AUDIT_LOG_READ`. The CRM follow-on |
| GET | `/staff/settings` | `user.read_self` and friends | one implementation, two mountings |
| GET | `/staff/help` | `backoffice.enter` | `?screen=B17` — the user guide's Part 3 training section for that screen, generated into `src/web/help-content.ts` by `tools/build-help.cjs` (`--check` fails when stale); an unknown screen shows `B0` and the list of every section (Phase 133c) |
| POST | `/staff/welcome/dismiss` | `backoffice.enter`, the user themselves | hides the welcome card for good: `users.welcome_dismissed_at` (migration 030), audited `WELCOME_DISMISSED` once (Phase 133c) |
| POST | `/staff/settings/{profile\|username\|password\|working-times\|photo\|photo/remove}` | `self`, except working times | password change **rotates the session** |
| GET | `/staff/users` | `user.list` | **ADMIN alone** |
| POST | `/staff/users/create` · `/{id}/role` · `/{id}/disable` | `user.create` · `user.assign_role` · `user.disable` | disabling **ends live sessions at once** |

### The JSON API

| Method | Path | Who | Returns |
|---|---|---|---|
| GET | `/api/health` | anyone | `{ ok, stubs }` — **the stub list, machine-readable**, and it is the same array §4 is written from |
| POST | `/api/login` | anyone | the user, never a hash. `SameSite=Strict` here |
| POST | `/api/logout` | signed in | |
| GET | `/api/whoami` | signed in | the user **and the actions this actor may perform**, computed from `can()` rather than hard-coded per role |
| GET | `/api/invoices/{id}` | `invoice.read` on that invoice | the invoice. 404 if absent, **403 if not theirs** |
| GET | `/api/surveyor-jobs/{id}` | `surveyor_job.read` on that job | **the surveyor payload, from the same assembler the screen uses.** Corrected on 9 September 2026 — it returned 501 and said the workspace was a future phase |

> **`GET /api/whoami` is worth copying rather than reinventing.** It answers *what
> may this actor do* by asking `can()` for every registered action, so a client that
> needs to know whether to draw a button asks the same function the server enforces
> with. There is no second list of permissions to keep in step.

## 3.2 · External — every register and supplier

**NOTHING BELOW FIRES. NOT ONE CALL.** The engine makes zero network calls;
`derive()` consumes a `bundle` of what connectors already returned, **and the
connectors do not exist**. This table is a specification for a developer, not a
description of running code.

**The tiers are read out of the source register, not restated here**:
`04-phase-work/phase3/caprebate-source-register.ts` is the register of what we
consult and holds each source's publisher, dataset, licence, permitted fields,
excluded fields and name exceptions. `09-app/backend/src/web/research.ts` maps
those ids onto tiers.

### Tier 1 — free. Fires once the client has been **informed**

| Source | What it answers | Licence | Limits |
|---|---|---|---|
| **EPC** (MHCLG, non-domestic + display) | floor area m², property type, construction age band, tenure, lodgement date, RRN | EPC Open Data (E&W). Registration via GOV.UK One Login | **England & Wales only.** Supported living may sit on the *domestic* register instead. No EPC → route to capture |
| **Companies House** — company profile | entity type, number, status, **year end**, incorporation date, registered-office postcode, group links | OGL v3, self-serve key, 600 req / 5 min | **No Companies House match routes to *ask*, never to "sole trader"** — a name that does not match is far more often a trading name, a misspelling or a group subsidiary. That is an N4 fix, not a preference |
| **Companies House** — PSC | `psc_name` (**name exception 1**), kind, natures of control | OGL v3 | For the common-control test only. **After a signed engagement only, although free** — see the note under this table |
| **Companies House** — filing history + Document API | turnover, operating profit, profit after tax, net assets, headcount **where filed** | OGL v3 | **Two holes, and they are the majority case.** Only ~60–75% of filings are electronic iXBRL; and small companies file **filleted** accounts with no profit and loss account at all. Partnerships and sole traders file nothing. **Handle both as ordinary outcomes, not as errors** |
| **CQC** syndication | registration, service type, regulated activities, **bed count**, provider, location postcode | CQC syndication terms, free subscription key. **FLAG: a currency obligation — the cache window needs the solicitor/DPO** | **England only.** CIW for Wales, Care Inspectorate for Scotland. **Every call carries the key in the header `Ocp-Apim-Subscription-Key`; no keyless or `partnerCode` calls. Base `https://api.service.cqc.org.uk/public/v1`** |
| **CIW** | service id, status, categories, capacity, postcode | OGL v3 | No endpoint recorded |
| **HMLR Price Paid Data** | price and date for **residential** sales, E&W, since 1995 | HMLR PPD licence. **Attribution wording is prescribed and must appear verbatim** | **Excludes commercial property entirely.** Four of the five sectors get nothing. **Restrict the derivation to residential** — otherwise the engine asks it about a care home, gets nothing, and logs a permanent register outage that is not one, which nobody investigates for six months |
| **VOA** open data | total area m², summary valuation, SCAT code, BA reference | VOA published rating list data | **Bulk downloads, not a REST API**, and it carries its own `licence_gate` — a *third* blocker that is neither of the two gates. Publishing the privacy notice would not make this source fire |
| **ONS** postcode lookup | postcode → billing authority | OGL v3 — free, verified against the publisher 7 Sep 2026 | **Excludes Northern Ireland (BT) for commercial use** — that needs Land and Property Services. **Scotland is included** |
| **Planning** (`planning.data.gov.uk`) | reference, decision, dates, description, UPRN | OGL v3 | Grade **B**, not A |
| **PlanIt** — the planning applications aggregator, the `PLANNING` source's endpoint in the source register | the same six planning fields, and no applicant, agent, objector, neighbour, consultee or comment field | OGL v3, as the `PLANNING` source | **`https://www.planit.org.uk/api` only.** The bare domain, `planit.org.uk`, fails its certificate check. `04-phase-work/phase3/caprebate-source-register.test.ts` fails if the register names the bare domain, or `partnerCode` anywhere |

**Two fields in `CB_REGISTRY.SOURCES` are post-signature only, although their sources sit in this free tier.**
_Added 15 September 2026._ `psc_name` on the `companies_house` source (name
exception 1) and `proprietor_name` on the `hmlr` source (name exception 2) are
the only two entries in any source's `permitted` list. Neither may be retrieved
before a signed engagement, checked on the server. Condition CA2 in section 15 of
the legitimate interests assessment says so in terms: before a signed engagement
only the free sources and endpoints it lists are called, and the list of persons
with significant control, the officers endpoint and officer search, the title
register and the paid address lookup are never called. So at the address question
`companies_house` means the company search and the company profile only, and
`hmlr` means Price Paid only, for supported living. **The site's source table does
not carry that distinction today**: both sources have `gate:null`, and
`psc_name` and `proprietor_name` sit in the same `fields` lists as the free
facts. `CB_REGISTRY.precondition` gates the free tier as a whole, so opening it
must not open these two names. Keep them behind the signed-engagement check that
gates Tier 2.

**Built 15 September 2026 (Phase 132c): the site's source table now carries that
distinction.** The paragraph above, which says it does not, is kept as the record of
that morning. Both sources keep `gate:null`, for two reasons: the rest of each source
is free, and `research.ts` (`licenceGateFor`) reports any `gate` string as a
*licence* blocker. Instead, every source carries a field-level `postSignature` list:
`["proprietor_name"]` on `hmlr`, `["psc_name"]` on `companies_house`, and an empty
list on the others. `CB_REGISTRY.classifyField(source, field, engagement)` takes the
record `assertSignedEngagement` returns on the server. The two names return
`NOT_PERMITTED_YET`, marked `postSignature: true`, unless that record says
`signed === true`. So no record, `signed:false`, "unsure" and a bare "yes" all keep
them shut. That is a state, never a throw: the field is simply not consulted. With a
signed record the two names are permitted as before. Tenure, price paid, completion
date, entity type and year end need no engagement. `CB_REGISTRY.precondition` still
gates the free tier as a whole, and opening it does not open the two names. The site
harness asserts all of this both ways in suite AA (AA1 to AA3). The back end was the
one gap left that day: `TIER_BY_SOURCE` in `src/web/research.ts` tiered `CH_PSC` as
`FREE`, so the sources panel would have shown the list of persons with significant
control as waiting only on the privacy notice.

**Closed 16 September 2026 (Phase 132f): the back end reads the same distinction off
the engine.** `CH_PSC` stays tiered `FREE`, because the tier is about cost and the
list is free of charge. Each catalogue entry now carries `post_signature_fields`.
`postSignatureFieldsFor` in `src/web/research.ts` derives it from the engine's own
`CB_REGISTRY.SOURCES[].postSignature` and the source register's
`personal_name_exceptions`. It is not a second hard-coded list. There is one
vocabulary join, `REGISTRY_FIELD_OF`, because the register spells the title
register's personal proprietor `proprietor_name_personal`. That gives `["psc_name"]`
on `CH_PSC`, `["proprietor_name_personal"]` on `HMLR_TITLE` (already `PAID`), and an
empty list on every other source, including `CH_COMPANY` and `HMLR_PPD`, whose free
facts are untouched. `stateUnderGates` asks `postSignatureOpen`, which calls
`CB_REGISTRY.classifyField(source, field, engagement)` with the record
`assertSignedEngagement` returns. Before signature the source is `NOT_PERMITTED_YET`,
with the reason (CA2, not consulted). With the notice unpublished as well, the row
names both. It is a state, never a throw. The same change fixed an N4 slip in the
paid branch: `!engagement.signed` read a "not sure" as truthy and threw on an absent
record. Both now read as unsigned, because only `signed === true` opens. The proof,
both ways, is `test/phase132f.test.ts`, line 5 (signed opens; unsigned, "not sure",
null and an absent record stay shut; taking `psc_name` off the engine's list removes
it from the panel).

### Tier 2 — paid. Fires only after a signed engagement, on one operator click

| Source | What it answers | Cost | Limits |
|---|---|---|---|
| **Homedata** address lookup | **UPRN**, full address, postcode — keys every call above | **Rate card not on file.** It is an open question | **Covers Scotland; nothing else here does.** **In the source register since Phase 129** as `HOMEDATA_ADDRESS`, under the supplier's published Terms of Service. The supplier publishes no licence name, no attribution wording, no cache window and no permission to reproduce its data outward. The register holds each gap as a refusal: a cache window of 0 days, where null would mean no limit; every outward channel closed; and legal review required. Its own coverage pages also disagree about Scotland. See §5 |
| **HMLR title register** (official copy) | price paid or value stated for transfers registered since April 2000 — **commercial included** — tenure, proprietor (**name exception 2**), prior-owner chain | **£7 per title**, per property; was £3 until 9 Dec 2024 | Business Gateway account, network-access agreement, **lead time**. **Onward supply to a third party is restricted — FLAG: the redistribution position for the accountant's pack needs solicitor confirmation.** A prior-owner chain may need a second title |
| **BCIS** elemental cost rates | £/m² elemental rates | RICS subscription | **Rates may be USED to compute; the underlying table may not be reproduced. FLAG: whether a derived £/m² printed in a report counts as reproduction is a licence question for the solicitor, not an engineering judgement** |

### Explicitly out of scope, so nobody spends a week on it

- **GMC** has no public API — a licensed daily download at roughly **£815/yr + VAT**. **GDC is web search only.** Clinician verification is out of scope. **Do not write a scraper.**
- **HMRC "Check a UK VAT number"** — v1 withdrawn 17 February 2025; v2 is authenticated with a ~2-week registration lead. It returns the **business** name and address and **no people at all**: an entity-existence check, never a role check.
- **LinkedIn** — a human check on a specific enquiry, recording only the conclusion, is defensible. **A scraper or a bulk enrichment tool is not**, and would need its own entry in the record of processing. Keep it manual, keep it rare, keep the result and not the source.
- **Practice managers, financial controllers, bookkeepers and external accountants appear on no public register anywhere, free or paid.** That is most of the signer dropdown, and it is the fact that determines the whole design of role corroboration: a check that treated a non-match as suspicious would insult the majority of genuine enquirers.

### When a source is down — and this is a rule, not a preference

**Record the gap. Never substitute a mean.** A source that cannot be consulted
reports `NOT_PERMITTED_YET` or `FAILED` and **the facts it would have supplied
stay `asked`**. Nothing refuses and nothing throws. **If your build produces a
failed estimate, an error on a client screen, a source rendered as *unavailable*,
or a `0` or `null` standing in for a fact a paid call would have supplied, it is
built wrong** — and the last of those is an N4 breach, because it routes an
unknown to the favourable branch.

### The correction this document makes to the Provenance Map

**The API & Data Provenance Map told a developer to fire the title register
"without thinking about it". That instruction is withdrawn and is not carried
here.** It was written before the two-tier rule of 4 September 2026, which makes
consideration the whole point: **a paid call fires only after a signed engagement
and only on an operator's click.** What survives of the old sentence is its actual
point — that **no per-call budget approval is wanted** — and that is now expressed
as the rule expresses it: *the operator picks the moment, not the calls.*

### The one measurement nobody has taken, and it decides a threshold

The address lookup is paid and its UPRN is what the free registers are keyed on,
so tier 1 looks as though it depends on tier 2. **It does not, quite:** EPC, the
care regulators, Companies House and Price Paid can all be searched on a typed
postcode or name. **The paid UPRN buys match certainty, not access.** So free
calls run early on a fuzzy match against a confidence threshold and the paid
lookup upgrades it after signature. **The matching specification says to measure
the real failure rate over 200 properties, and nobody has.** Do not assert the
fuzzy match is good enough, and do not assert it is not — **price the measurement
as work and set the threshold from its result.**

---

# 4 · What is real, what is stubbed, and exactly where

**IF IT IS STUBBED, IT IS IN THIS TABLE. Everything else is real and the tests
prove it.** A convincing stub that is not listed here is the failure mode this
document exists to prevent — and it is not hypothetical: **writing this table
found one.** The text extractor opened with the words *"and it is a STUB,
declared as one"*, declared itself in its own file, and appeared in no list a
reader would look at. It is row 4 now, it is in `STUBS`, and there is a test that
a module calling itself a stub in prose is in that array.

**AND ROW 4 GOT SMALLER ON 9 SEPTEMBER 2026 WITHOUT GOING AWAY, which is the
harder half of keeping a table like this honest.** Phase 113c built a real
`.docx` and PDF reader behind that port. OCR and scanned PDFs remain unread, so
the row **changes wording and stays**: deleting a row to make a list shorter is
exactly the failure this table exists to prevent, and a reader who found three
rows where there had been four would conclude that the fourth thing now works.

**The machine-readable copy of this table is `STUBS` in `src/app.ts:79`**, served
at `GET /api/health`.

**FIVE LINE REFERENCES IN THIS TABLE HAD MOVED, AND CRM 10 OF 10 FOUND THEM BY RUNNING A CHECK
RATHER THAN BY READING.** Every name they pointed at was unchanged; the lines were not —
`outboxTransport` had gone from line 39 to 103 and its label from 57 to 124, `STUBS` from 72 to
79, the surveyor's signature notice from 997 to 1062, `declaredTypeClassifier` from 98 to 111. A
reference that lands on the wrong line sends a developer to the wrong code while looking exact.
**`node 03-app/caprebate-crm-fold-check.cjs` now reads every `file:line` in this section and fails
when the name beside it is not on that line.** It failed on the signature notice again after the CRM
follow-on added six lines above it, and the reference now reads 1068. **It failed on four on
15 September 2026, after Phase 132**: the signature notice had moved from 1068 to 1150, and the data
protection officer role's three names eleven lines down — the switch from 885 to 896, its rules from 890
to 901, the decision from 910 to 921. Each name was unchanged, and each reference now reads its line. **It failed on seven on
16 September 2026, after Phase 132e** added the view-only role's rule table above the officer's, and lines above the
case stamp, its audit kind and the partnership row: the switch from 896 to 1089, its rules from 901 to 1094, the decision
from 921 to 1114, `DPO_ROLE` from 70 to 80, `writeCaseStamp` from 229 to 230, `CASE_STAMPED` from 217 to 227, and the
partnership row from 187 to 203.

| # | What is not real | File and line | What IS real around it | How to replace it |
|---|---|---|---|---|
| **1** | **Outbound email — delivery.** No message leaves the building. Every message is written to the `outbox` table with `sent_at` **NULL**, and the screen shows the outbox so that *not sent* is something a person can look at rather than a claim in a footer. **Calendar invitations go down the same path and are not a second stub** — an invitation is an email with an attachment; what is additionally not real is that **no iCalendar object is generated**. | `src/stubs/email.ts:104` (`outboxTransport`); the label, `STUB_NOTICE`, at `:125` | The token mechanics. The reset token is single-use, expiring, stored only as a hash, and consuming one revokes every session the user held. **And the DO_NOT_CONTACT refusal (CRM 1 of 10)**: `isDoNotContact` refuses before any row is written, returning `refused`, and a trigger on `outbox` refuses the row as well — **a real transport must keep calling it** | Implement `EmailTransport` and pass it to `buildApp`. **Nothing else in the codebase mentions email delivery** |
| **2** | **Document signature — the provider.** Nothing is contacted and nothing is legally executed. In the surveyor's workspace, *sign off* means the surveyor **commits** figures with a method note. | `src/stubs/signature.ts:22` (`stubSignatureProvider`); the label, `STUB_NOTICE`, at `:31`; the workspace's own notice, `SIGNATURE_STUB`, at `src/web/surveyor.ts:1155` | The **state machine** `NOT_SENT → SENT → VIEWED → SIGNED` in `engagements`, and the commitment record — hashed, timestamped, and the thing the anchor quarantine actually turns on | Implement `SignatureProvider`. **`assertSignedEngagement` must go on reading the `engagements` table server-side — never a value a provider returned to a browser** |
| **3** | **The register connectors.** Nothing is called. No external source is contacted, ever, by any code path. | `src/stubs/registers.ts` — `gateStatus` at `:52`, `ingestRegisterRecord` at `:70`, `planResearch` at `:92`, the label, `STUB_NOTICE`, at `:119` | **Both gates are real and are reported honestly**, and **N2 is wired in, not restated**: every record passes `assertNoUnauthorisedName` at the **ingestion** boundary, which is where the module says the check belongs — a filter at report time would leave the name sitting in storage in between | Write connectors behind the same seam. A shut gate must go on reporting `NOT_PERMITTED_YET`; a source added to the register and not to the tier table is treated as **PAID**, and there is a test |
| **4** | **Text extraction from the documents this build still cannot read.** **NARROWED on 9 September 2026 (Phase 113c) and deliberately not deleted.** `.docx` files, and PDFs whose text sits in **uncompressed or FlateDecode** content streams, are now **read and stripped for real** — proved end to end by a name planted in each, found by the extractor and removed by the receipt policy, with the removal in `document_events`. **What still yields one marker line:** a **scanned** PDF (page images, no text operators — that is OCR), an **encrypted** PDF, LZW/ASCII85/JBIG2/CCITT-filtered content, `.doc`, `.xlsx`, `.pptx`. On those the strip runs over a marker rather than over the document. | `src/web/uploads.ts` (`documentTextExtractor`) → `src/web/extract-text.ts`; the shared zip reader is `src/web/zip.ts` | **Nothing pretends to have read a document, and nothing returns an empty page either.** Every unreadable path returns the marker: an empty reading would say downstream *we looked and there was nothing to redact*, which is the favourable branch **N4** forbids an unknown from taking. There is a test for each refusal and one asserting the marker is never an empty page | Add OCR behind the same `TextExtractor` port — it is one named module, so this is a swap and not a search. **Priced in §5 as DS-W2, and DS-W2 is now smaller than it was** |

## Not a stub, but a limitation a reader will meet and should be told about

| What | Where | Why it is not in the table above |
|---|---|---|
| **The document classifier trusts the declared type**, checked against the handled set | `src/web/uploads.ts:111` (`declaredTypeClassifier`) | **It refuses; it does not guess.** An unclassifiable upload is `E_UNRECOGNISED_DOC_TYPE`, the quarantine object is deleted and nothing is promoted. A real classifier would use more inputs; this one does not *pretend* to have used them. **Since CRM 4 of 10 the declared type is not the client's word**: it is the receipt policy of the document type they chose |
| **Fourteen of the twenty-five document types cannot be received** — the CRM specification's list, from the engagement letter to *other* | `document_types.handler_type` NULL (migration 013); `NO_RECEIPT_POLICY` in `src/web/documents.ts` | **Switched off, not stubbed.** The ingestion module refuses to store a type with no receipt policy, and writing one is the data protection officer's decision — *"Which receipt strip should each new document type carry before anyone may upload one?"* When one is written, one migration binds the type and nothing else changes. **A recommended strip for each, with its reason, is recorded and not approved** — `src/web/receipt-recommendations.ts:65` (`RECEIPT_RECOMMENDATIONS`) — and binding one also needs a policy entry of its own in the ingestion module and a rebuild of the type table |
| **Company names kept and individuals stripped on the two conveyancing uploads** — built and switched off | `src/web/conveyancing-strip.ts:64` (`CONVEYANCING_STRIP`); the capture at `:148` (`captureParties`) | **Switched off, not stubbed.** Off, the parties read off a sale contract or the pre-contract enquiry replies are captured exactly as today: every one a role token. On, a company or LLP party to the transaction keeps its name and registered number, and every individual is stripped. No screen calls it yet. It waits on *"May company names stay on conveyancing uploads if we strip the individuals?"* |
| **The per-disclosure log** — built and switched off | `src/web/disclosure-log.ts:61` (`DISCLOSURE_LOG`); recording at `:153` (`recordDisclosure`), reading at `:262` (`disclosuresFor`); the table is migration 021 | **Switched off, not stubbed.** Off, nothing is recorded and a client's reading says NOT KEPT, never none. Its recipients are those of "Who we pass client personal data on to", word for word. It has no screen; it is switched on once that list is signed off and a first real disclosure is near |
| **A data protection officer role** — defined, scoped to the compliance registers, and switched off | `src/authz.ts:1097` (`DPO_ROLE_SWITCH`); its rules at `:1102` (`DPO_RULES`), decided at `:1122` (`canAsDpo`); `src/roles.ts:80` (`DPO_ROLE`) | **Switched off, not stubbed.** It is not one of the six roles, cannot be assigned, and the database has no row for it. Whether it is switched on is Lakhbir's: *"Do we need a compliance role separate from Admin?"* Switching it on is the switch, a migration adding the role row, and the role joining the six |
| **The defence pack generator** — built and switched off, Phase 132 | `src/web/defence-pack.ts:43` (`DEFENCE_PACK_GENERATOR`); built at `:115` (`generateDefencePack`); the action `defence_pack.generate` (ADMIN, SALES) in `src/authz.ts`, with no route | **Switched off, not stubbed.** Off, a request is refused before anything is read or written. On, it gathers the case stamp, the surveyor's commitment, the sources of the facts the gates read, the reconciliation, the tax adviser's sign-off, the s.203 position, the anchor log and the issued deliverables' hashes into **one manifest hashed with SHA-256**. Any missing section is named and makes the manifest INCOMPLETE. It writes one `DEFENCE_PACK_GENERATED` audit line and **issues nothing**. A fact recorded as not known and one never recorded give the same missing section (N4). It waits on the chartered tax adviser signing off the Defence Pack Template |
| **The with-and-without comparison for the allowance and profit answers** — built, run empty and switched off, Phase 132 | `src/web/allowance-profit-comparison.ts:82` (`ALLOWANCE_PROFIT_COMPARISON`) | **Switched off, not stubbed.** It runs each claim's estimate as it stands and again without `sufficient_profit` and the allowance headroom answers. It compares the **benefit** readings and the **cash** readings: the route, a gate known to be shut, and the near-term range. **It reports counts and no verdict.** A null on either side is NOT_COMPARABLE, never a zero, and "I don't know" is counted apart from never asked, read from the raw rows. **No route imports it**, and a test scans `src/` for that. On no real clients it says it is empty. It waits on real clients answering those questions |
| **A person reviewing every value from a document type** — built and switched off, Phase 132 | `04-phase-work/phase3/caprebate-document-pipeline.ts:334` (`PERSON_REVIEW_BY_DOC_TYPE`) | **Switched off, not stubbed.** Every type ships `false`. Switched on for a type, a person must review every value extracted from a document of that type. **A type missing from the table handed in reads as review required**: only an explicit `false` switches review off. Which types warrant it is for whoever owns the extraction's error rate |
| **Treating two Companies House records as the same individual** — built and switched off, Phase 132 | `04-phase-work/phase3/caprebate-companies-house-connector.ts:122` (`SAME_INDIVIDUAL`); the check, `sameIndividual`, at line 155 | **Switched off, not stubbed.** Off, nothing corroborates and every call goes to a person. The result names which of four findings it is rather than returning a bare `false`. **No live path references it**, and a test scans for that. Switching it on decides that a name plus a birth month and year is enough, and that is a data protection and tax adviser decision |
| **The backup cycle** — a named blank, not a switch, Phase 132 | `04-phase-work/phase3/caprebate-client-doc-ingestion.ts:1770` (`BACKUP_CYCLE`); `ret3DueAt` at line 1809, `recordDeletion` at 2046, `assertRestoreApproved` at 2113; the tables are migration 022 | **NOT SET**, and setting it is **the data protection officer's with the developer**. `recordDeletion` writes the cycle onto each deletion's evidence, and no caller supplies it. While the cycle is not known, backups read as still pending with no cycle and no expiry, and `ret3DueAt` is null rather than computed as though the copies had expired. A restoration is refused without the data protection officer's approval. It waits on *"Can the client-document folders be excluded from the nightly whole-site backup?"* |
| **The analytics wrapper** — built and switched off, Phase 132 | `CB_TRACK`, in the page shell of `Caprebate site.html`; its build-time check is `03-app/caprebate-analytics-allowlist-check.cjs` | **Switched off, not stubbed.** It has no measurement id, no sink and **no call site anywhere**. The check fails on any `gtag`, `dataLayer` or tag manager outside the wrapper, and on any call whose event, parameter or value the Measurement Plan's section 5 does not allow. It also fails on a post-engagement portal view that names it. It waits on the website going live |
| **One display zone, `Europe/London`, as a constant rather than a per-user setting** | `src/web/localtime.ts` (`DISPLAY_ZONE`) | The staff are in Britain and the clients own British property. It is not a stub — the conversion is real and uses the full IANA database through `Intl` — but a business with staff abroad would replace that one constant with a lookup, and no other file names a zone |
| **There is no self-serve account creation** | absent from `src/web/router.ts` | A client account is created by an ADMIN. The old wireframe's optional `JS-S8` was never built, and nothing downstream depends on it — but a real funnel needs it, and it is priced in §5 |
| **DB-W1-T4 is not run** | `test/web.test.ts` declares it | It is a demonstration against a live WordPress site — the Media Library, the REST API and the sitemap — and there is no WordPress in this build. **Declared in the test file and deliberately NOT counted as a pass** |

## Built by Phase 132 and always on — no switch, and why

| What | Where | Why it has no switch |
|---|---|---|
| **The case stamp** — what decided a sealed case, written when a deliverable is issued | `src/web/case-stamp.ts:230` (`writeCaseStamp`), called from `src/web/claim-record.ts:784` (`recordDeliverable`) in the transaction that issues; audited at `src/audit.ts:227` (`CASE_STAMPED`); the table is migration 022 | It is record-keeping and relieves nothing. A stamp that could be switched off would be a record that could go missing for no reason anybody wrote down |
| **The engine package path moved with it** | `src/web/case-stamp.ts:66` (`ENGINE_PACKAGE_PATH`); re-exported at `src/web/claim-record.ts:304` (`ENGINE_PACKAGE_PATH`) | Nothing that imported it from the claim record changes |
| **RET-7's two dates, derived and not stored** | `src/web/documents.ts:161` (`ret7Limbs`) | The claim period end is the claim's `ACCOUNTING_PERIOD_END` fact. The delivery is the earliest issue of its client report, a named assumption that can only bring a deletion forward. It reads null, with a reason, where either date is not known or the document links to no claim or to more than one. **It computes no deletion date**, because RET-7 is not approved |
| **The blank-field control, and the review box that starts unticked**, in the survey workspace | `src/web/surveyor.ts:570` (`rateLibrary`); recorded at `:787` (`recordRates`); served blank at `src/web/surveyor-pages.ts:428` (`blank_control`), and the box read at `:194` (`reviewed`); the table is migration 023 | It changes no client's figure. It must also run from the first job, because a control arm cannot be added to jobs already shown a pre-fill. §1 UC-B7 has the rules |
| **Whether a partner or LLP member is a company** | `src/web/claim-facts.ts:137` (`PARTNERSHIP_HAS_COMPANY_MEMBER`); its facts-panel row at `src/web/claim-record-pages.ts:204` (`partnership_company_member`); `src/web/engine.ts:338` (`amendmentWindow`) now takes the claimant `'partnership'` and `companyMember`; the key is migration 024 | It is a fact the window already needed. UNKNOWN reads as absent, and an ambiguous window reads UNKNOWN, which the existing REPORTS and INVOICE gates refuse. Where the company date is later, it waits on `CB_CTA.window_company_member_date`, which is off |
| **A month-end date stays in its month** | `src/web/claim-record.ts:613` (`addMonths`), now exported | 29 February 2024 plus twelve months had read 1 March 2025, holding the enquiry window open a day too long. It now clamps to the target month's last day, and a day the month has reads as before |
| **A fixed clock for tests** | `src/server.ts:75` (`ServerOptions`); its optional `now` at `:95`, passed to `buildApp` | Tests pin it so a fixed-date seed reads the same on any day. **Unset, which is production, it behaves exactly as before** |
| **The retention rows RET-1 to RET-4 match the Retention Determinations** | `src/web/compliance-identity.ts:325` (`DERIVED_NOT_APPROVED`); RET-1 to RET-4 in `RETENTION_PARAMETERS`, RET-1 at `:346` (`DERIVED_NOT_APPROVED`) to RET-4 at `:349` (`DERIVED_NOT_APPROVED`) | They are drafted, not switched. **Nothing is approved**: each row reads `DERIVED_NOT_APPROVED` until the data protection officer approves it |
| **`CB_S33B` in the engine** | a new shared module of `Caprebate site.html`, exported by the package in `09-app/engine/src/generated/shared.js` | It works out s.33B aggregation. Whether it moves any money is `CB_CTA.s33b_aggregation`, one of the twenty-four switches in §6, and that is off |

## Built by Phase 132e — acting on answers Lakhbir typed, 16 September 2026

| What | Where | On, off, or decided — and what it waits on |
|---|---|---|
| **The view-only login** — a sixth role, assigned to nobody | `src/authz.ts:946` (`READ_ONLY_RULES`); decided at `:1068` (`canAsReadOnly`); `src/roles.ts:30` (`APP_ROLES`); the role row is migration 026 | **Built, and held by nobody.** An explicit yes or no, with its reason, on every one of the 114 actions: 32 yes, 82 no. It writes nothing but its own password and reads no value, money, register or log, and exports nothing. The payload proof signs in as one and finds none of the seven sealed fields and not our fee on every route it reads. The calendar's assign list is asked of `booking.write` by `src/web/backoffice.ts:577` (`assignableStaffIfPermitted`), so a view-only reader opens the calendar and is drawn no scheduling form |
| **A client cancels or rebooks their own call at any time** | `src/web/portal.ts:587` (`cancelOwnBooking`); the new-time rule at `:455` (`tooSoonForNewTime`); `src/web/schedule.ts:174` (`CLIENT_MOVE_NOTICE_MINUTES`); the columns and triggers are migration 025 | **Always on — it is the decision.** A new time still needs two hours' notice. §2.1 `C6a` has the rules |
| **The client's own filing confirmation where there is no accountant** | `src/web/client-filing.ts:76` (`filingRoute`); the need at `:94` (`clientConfirmationNeed`); recorded at `:128` (`recordClientFilingConfirmation`); the words at `:42` (`CLIENT_FILING_WORDS`); the table is migration 027 | **Always on.** The REPORTS gate takes the client route only on a recorded yes that there is no accountant and with no ACCOUNTANT or ADVISER contact on the organisation; any of the three confirmations no, not sure or absent, or a last day that is not the window's deadline, keeps it shut. **The last-day sentence awaits the tax adviser's wording** |
| **Reward model C — 10% of our fee as invoiced** | `src/web/introducers.ts:124` (`REFERRAL_PERCENTAGE`); accrued at `:1590` (`onFeeInvoiced`), reversed at `:1612` (`onClause13Credit`); the ledger and the widened setting are migration 028 | **Switched off, not stubbed.** Refused while clause 1 of the letter is blank, exactly as A and B are. On, it accrues 10% of our fee invoice's amount (net of VAT) for a registered accountancy firm that referred the claim, and a clause 13 credit note writes a reversing entry — never an edit or a delete. Whether the client must be told is the solicitor's |
| **The flat 3% fee** — no minimum, no bands, a discretionary multi-site discount | the rate is the engine's (`src/web/engine.ts:415` (`multiSiteDiscount`), beside `feeRate`); the retired minimum at `src/web/fee-controls.ts:67` (`MINIMUM_FEE_DECISION`); the discount's reading at `:239` (`discountReading`); a discount recorded at `src/web/fee-discounts.ts:52` (`recordFeeDiscount`), migration 029 | **Decided.** The minimum-fee control is retired as decided none, and recorded as such. A discount a person enters is recorded, audited and never applied; the largest discount and who approves it are named nulls in the engine, asked |
| **Our fee is earned when our report is delivered for filing** | `src/web/pipeline.ts:120` (`FEE_TRIGGER`); read from the deliverables register at `:134` (`reportDeliveredOn`) | **Decided.** The INVOICE gate and raising our fee read the claim's client report or computation pack ISSUED, on its issue date; nothing issued is not reached (N4). The finance view's fee expected date is that delivery date, with the due date 14 days on; no delivery, no date — never today |
| **Clause 13 — refund decided yes, the time limit completed** | `src/web/claim-record.ts:907` (`FEE_CLAWBACK`) | **Switched off.** The decision is recorded on the switch; the trigger and settlement terms are still blank in the letter, so a reduction raises nothing even with the switch on |
| **Customer due diligence for every client — left off** | `src/web/compliance.ts:216` (`amlInScope`) | **Off, deliberately.** On, a claim could not leave ENGAGEMENT without a finished check. Finishing one needs no risk rating, but that is still a block on work, so it stays off; a check can be kept for every client today. Nothing here decides whether supervision applies |

## Built by Phase 132f — reading what the engine already decides, 16 September 2026

The back end had not read five engine outputs that Phase 132c and Phase 132e built. Each row below says where the
engine or the phase9 module decides the thing, and where the back end reads it. A back-end reference (`src/…`) is
checked by `03-app/caprebate-crm-fold-check.cjs` check C. **When Phase 132f wrote this table, check C read only back-end `src/` references.** The
site file, the engine package and the phase9 modules sat outside it, so their references below were checked by the
line-landing script recorded in the Phase 132f report instead. Every reference was read against the files as they
stood after the site workstream re-extracted the package (manifest `sourceSha256` 9ed2066f…). **Since Phase 132g, on 16 September 2026, they are verified by check C itself: it reads every `file:line` in this section — the back end, `Caprebate site.html`, the engine package, phase9 and phase3, including phase3's "`name` at line" form — by the same rule, and fails when the file is missing, the line is past its end, or the line does not carry the name.**

| What | Where | On, off, or decided — and what it waits on |
|---|---|---|
| **`CB_FEE.MULTI_SITE_DISCOUNT`** — discretionary, no fixed tiers, never applied automatically | the site: `Caprebate site.html:6198` (`MULTI_SITE_DISCOUNT`), exported at `:6420` (`MULTI_SITE_DISCOUNT`); the package: `09-app/engine/src/generated/shared.js:4945` (`MULTI_SITE_DISCOUNT`), exported at `:5167` (`MULTI_SITE_DISCOUNT`); read by the back end at `src/web/engine.ts:415` (`multiSiteDiscount`) | **Decided discretionary.** The largest discount and who approves it are named nulls, and they are asked. A discount a person enters is recorded and never applied (the Phase 132e row above) |
| **`CB_FEE.NO_CLAIM_THRESHOLD`** — £1,000 of five-year relief after our fee | the site: `Caprebate site.html:6362` (`NO_CLAIM_THRESHOLD`); the package: `09-app/engine/src/generated/shared.js:5109` (`NO_CLAIM_THRESHOLD`); read by the back end at `src/web/engine.ts:278` (`noClaimThreshold`) | **Decided** by Lakhbir (read 15 September 2026). **The reading of "relief after our fee" as the five-year cumulative benefit awaits the tax adviser's review**, and the object says so (`awaiting_tax_adviser_review`) |
| **`CB_FEE.recommendationThreshold`** — the outcome `CB_FEE.display` returns on every call | the site: `Caprebate site.html:6371` (`recommendationThreshold`), exported at `:6422` (`recommendationThreshold`); the package: `09-app/engine/src/generated/shared.js:5118` (`recommendationThreshold`), exported at `:5169` (`recommendationThreshold`); its type in the back end at `src/web/engine.ts:138` (`RecommendationThreshold`); combined across the rate readings at `src/web/finance.ts:205` (`noClaim`); on every fee-against-benefit comparison at `src/web/finance.ts:175` (`recommendation_threshold`); drawn at `src/web/finance-pages.ts:371` (`noClaimBlock`) | **Always on, and it refuses nothing.** It is shown wherever the fee is shown against the benefit (an organisation's invoice and a claim's fee invoice), marked for the tax adviser and printing the figures. It is BELOW only where every reading is determined and fires. An unknown relief (a rate, pool split or entity that is "not sure" or absent) is UNDETERMINED and never fires |
| **The region module's Inner London exports** — the surveyor's switch, shipped off | `04-phase-work/phase9/caprebate-region.ts:238` (`SURVEYOR_INNER_LONDON_ONS_FOURTEEN`); `:240` (`RegionSwitches`); `:252` (`REGION_SWITCHES`); `:256` (`INNER_LONDON_ONS_FOURTEEN`); `:274` (`OUTER_LONDON_ONS_NINETEEN`); `:300` (`INNER_LONDON_LIST_STATUS`); re-exported by the back end at `src/web/postcode-port.ts:89` (`REGION_SWITCHES`) and passed explicitly at `src/web/postcode.ts:206` (`REGION_SWITCHES`) | **Off.** Only the boolean `true` turns it on, and that is the surveyor's answer. With it off, London refuses with the same code, message and detail as before, and `resolveProperty` now passes the argument rather than omitting it |
| **`checkBoundaryUse`** — land boundaries for internal calculation only; fetching stays off | `04-phase-work/phase9/caprebate-boundary-import.ts:540` (`checkBoundaryUse`); the permission it reads at `:472` (`CURRENT_LICENCE_PERMISSION`); the fetching statement at `:817` (`BOUNDARY_FETCHING_SWITCHED_ON`) | **Not called by the back end, because nothing in the back end uses a site area** (re-derived 16 September 2026: no site area, parcel, footprint or boundary is read anywhere in `src/`). The first back-end code to use one must go through it with `INTERNAL_CALCULATION` |
| **The engagement gate, handed its costs** | the costing injected, for one call and put back, at `src/web/engine.ts:260` (`feeGate`) and `src/web/engine.ts:269` (`feeQuote`); the one vocabulary join at `src/web/engine.ts:208` (`ECONOMICS_SECTOR_OF`); the caveat on every answer at `src/web/engine.ts:232` (`GATE_PLACEHOLDER_CAVEAT`); read on the expected fee at `src/web/vat.ts:245` (`gate`) and on the claim's estimated fee at `src/web/crm.ts:2019` (`estimatedFee`) | **On in the engine (Phase 132e), and now it has costs.** Below the line it routes to the engine's own "we will come back to you with a price". The back end quotes no fee to a client: every fee it reads is earned on a signed-off figure. So the gate is a reading there. It never withholds an invoice or moves the VAT forward look. An unknown fee, an unknown volume ("not sure" or absent), an unknown sector and supported living (no cost row in phase9) are UNDETERMINED |
| **CA2 in the sources panel** | `src/web/research.ts:202` (`postSignatureFieldsFor`); `src/web/research.ts:217` (`postSignatureOpen`); applied at `src/web/research.ts:414` (`stateUnderGates`) | **Always on.** See §3, Tier 1. The list of persons with significant control is not consulted before a signed engagement. The free facts are untouched |
| **The regulator's name, both ways** | `src/web/compliance-rights.ts:117` (`ONWARD_ROUTE_TEXT`) | **A draft for the data protection officer.** The wording is copied from `03-app/caprebate-notices-page.html` (Block A's dated wording, Block F's route). It is right on both sides of 30 September 2026 |

## Built by Phase 132i — unknowns that relieved on routing, and answers read before they are given, 16 September 2026

Always on; no switch. No figure moves: the cash route proof run with `--moves-from "Caprebate site.html.bak-phase132i"`
lists no moved state, and every one of the 442 questions gives the same single-answer session as before.

- **N4** The heating question in supported living. A session that reaches the engine with the heating question never
  answered, or its answer cleared, is read exactly as "not sure": the central plant line and the "heating arrangement
  unconfirmed" flag go on the result, so the outcome is a referral, not an estimate. The engine writes nothing onto the
  session. No engine reads the fact, so no figure moves.
- **N4** The polluter question in private hospitals. The result's `lrr` (the land remediation panel the client sees) is
  true only on a known "yes" to derelict or contaminated land AND a known "no" to the polluter question. "Not sure", a
  cleared answer and no answer leave the panel off. The session's `lrr` still decides whether the polluter question is
  asked. No figure reads `lrr`.
- **A question never reads an answer given after it.** `CB_CTAQ.place(Q, prefix)` runs once per flow: the seller
  question (x51barred) now sits straight before the earlier-owner question (x12b), which asks the chain question
  itself, so the second asking (x51eeo, five questions) is retired; and the grant-share question (x51gtr) follows the
  grant amount. The tribunal question (x14t) is shown on the window as it stood before any tribunal application. Two
  handlers read a later answer (the fixed-value window reads the intervening owner; the event date reads the acquisition
  date): the answer wrapper records what each handler read, and when a later answer or take-back changes one of those
  facts it applies the earlier question's current answer again. One pass forward through a flow now equals two (suite AF3).
- **Back.** The renderer's Back steps over a question a later answer has hidden and is disabled when none is left
  behind. A question hidden only by its own answer (the intervening-owner question on "No") is still asked on every
  pass forward, and Back still returns to it.

## Built by Phase 132j — the polluter question in four more flows, 16 September 2026

- **The polluter question.** Care homes, dental, supported living and GP asked about derelict or contaminated land
  (x10c) and turned `lrr` on for "yes", but never asked who caused it, so the land remediation panel always showed on an
  answer that was never given. Each now asks x23 straight after x10c, built as the private hospital flow's H23: "yes"
  takes the line away and says why, "Not sure" is flagged, and `lrrFromAnswers` in each flow works out `lrr`, the
  polluter marker and the line from both current answers in any order.
- **The result's `lrr` needs a known "no"** to x23 in all five flows (N4). No figure reads `lrr`; the cash route proof
  run `--moves-from` the pre-change site lists no moved state. Suite AG asserts both N4 forms, the order grid, the
  take-back and the flow itself through the renderer.

## Built by Phase 134 and switched off — the company's name in a staff notice's subject, 18 September 2026

- **`NOTICE_SUBJECT_LEADS_WITH_COMPANY` in `src/web/automation.ts` is `false`.** Lakhbir asked that every email subject
  lead with the company's name; a notice to our own staff was built by CRM 3 of 10 to carry no organisation's name. Both
  readings are built (`noticeSubject`), and `test/phase134.test.ts` proves each and that the switch is off. The question
  is "Should an email to our own staff name the client company in its subject line?" in CAPREBATE QUESTIONS. An email to
  a **client** leads with the company today (`companyFirst` in `src/web/templates.ts`, migration 032) — that was never
  in question, because the client's own name is no news to the client.

## What is real — and the figures, every one re-derived on 16 September 2026 by running it

```text
node 03-app/caprebate-regression.cjs                1246 pass / 0 fail / 4 xfail
node 03-app/caprebate-regression.cjs --package      1246 pass / 0 fail / 4 xfail
cd 04-phase-work/phase3 && node --test              412 pass / 0 fail   (11 files)
cd 04-phase-work/phase9 && node --test              397 pass / 0 fail   (9 files)
cd 09-app/backend && npm run check                  930 pass / 0 fail   (49 files)
node 09-app/engine/tools/verify-extraction.cjs      21 checks, 0 failures — 24 CTA switches counted
node 09-app/engine/tools/extract.cjs --check        exit 0 — the package matches the site
node 03-app/caprebate-figure-drift.cjs              RED at the close of Phase 133e — see the note under this block
node 03-app/caprebate-figure-drift.cjs --self-test  15 classifier and guard cases, every one holds
node 03-app/caprebate-notices-acceptance.cjs        24 structural checks
node 03-app/caprebate-analytics-allowlist-check.cjs 19 checks, 0 failures
node 03-app/caprebate-clock-grid.mjs --self-test    7 checks, every one ok
node 03-app/caprebate-clock-grid.mjs --suite backend
                                                    runs the suite across a grid of clocks and names every
                                                    clock-bound test; exit 1 if any. Run it, do not quote it
```

**2,985 passing assertions** — 1,246 + 412 + 397 + 930, the four suites re-run on 18 September 2026 by Phase 134. **Run them; do not quote
them.** (It was 2,966, with the back end at 911 across 48 files, until Phase 134, which added nineteen back-end tests in a new file, `test/phase134.test.ts` — the one client page, its three claim tiles and one timeline, the portal's claims and its 404, search ranking, the email subjects, and a crawl of every staff screen for a claim reference used as a heading or link text — and changed expectations in eight others for the one client page and the company-first lists. Before that it was 2,954, with the back end at 899 across 47 files, until Phase 133j, later on 18 September 2026, which added twelve back-end tests in a new file, `test/phase133j.test.ts` — the website served at `/` from `Caprebate site.html` with its Log in button and every assessment link going to the back end, nothing inline, the enquiry form kept and worked by Sales, and a client creating their own login confirmed by email — and changed one test in `test/phase133a.test.ts`, which now allows `/` its one script from its own origin and pins that page's policy; phase3, phase9 and the site harness did not move.) (It was 2,953, with the back end at 898 across 46 files, until Phase 133i, on 18 September 2026, which added one back-end test in a new file, `test/phase133i.test.ts` — the client's engagement-letter page says the open terms are CAP REBATE LTD's to settle and never names Lakhbir Dhillon — and one assertion to an existing test in `test/compliance.test.ts`, for the data protection officer as the ICO answer sheet's named contact; phase3 and phase9 gained assertions inside existing tests, so neither suite's count moved, and the site harness did not move.) (It was 2,937, with the back end at 882 across the same 46 files, until Phase 133e, later on 17 September 2026, which added sixteen back-end tests to `test/phase133d.test.ts` — seven for D5, that every required control on every page is joined to its label by `for`/`id` or by an enclosing label and never by position alone, and nine for D6, one refused post per remaining back-office form whose store refuses about one field; no existing test changed, and the site harness, phase3 and phase9 did not move.) (It was 2,919, with the back end at 864 across 45 files, until Phase 133d, later on 17 September 2026, which added eighteen back-end tests in a new file, `test/phase133d.test.ts` — "(required)" on every required field, the stage bar, and a refusal beside its field on the ten most-used forms; two existing tests changed for wording the phase changed on purpose; the site harness's count did not move, one of its checks re-worded.) (It was 2,897, with the back end at 842 across 44 files, until Phase 133c, later on 17 September 2026, which added twenty-two back-end tests in a new file, `test/phase133c.test.ts` — the brand's tokens, type, logo and the white-on-mint rule; no exclamation mark, avoid-list word, "Caprebate", ISO date or empty row on any page any login reaches; a refused form keeping what was typed; the welcome card; the next step; Help; and both positions of the two name switches; fifteen assertions in nine existing files changed for UK dates and plain words, and the site harness, phase3 and phase9 did not move.) (It was 2,892, with the back end at 837 across 43 files, until Phase 133b, later on 17 September 2026, which added five back-end tests in a new file, `test/phase133b.test.ts` — the business page, the survey job, finance, admin settings and document types each on the new layout for a login that opens it, every tab landing on a panel on the page and no id used twice; one assertion in `test/configuration.test.ts` changed, because each admin settings section is now headed by an `<h2>` where it was headed by a `div`; and the site harness, phase3 and phase9 did not move.) (It was 2,864, with the back end at 809 across 42 files, until Phase 133a, later on 17 September 2026, which added twenty-eight back-end tests in a new file, `test/phase133a.test.ts` — the menu opened for every login in both directions, no link to a refused screen, no inline script or style on any page reached, the Content-Security-Policy pinned, the stage bar on the stored stage, JavaScript off, the refusal page and the palette's contrast; no existing test changed, and the site harness, phase3 and phase9 did not move.) (It was 2,849, with phase9 at 382 across eight files, until Phase 133, on 17 September 2026, which added fifteen phase9 tests in a new file, `caprebate-boundary-import-inspire.test.ts` — HM Land Registry's published INSPIRE shape translated into the boundary connector's geometry, and a point-in-polygon join, both built and switched off, on invented fixtures; the site harness, phase3 and the back end did not move.) (It was 2,842, with the site harness at 1,239, after Phase 132i, until Phase 132j, later on 16 September 2026, which added suite AG — the polluter question asked in care homes, dental, supported living and GP, and the land remediation panel there needing a known "no" to it, seven assertions, in both engine modes; phase3, phase9 and the back end did not move.) (It was 2,829, with the site harness at 1,226, after Phase 132h, until Phase 132i, later on 16 September 2026, which added suite AF — an unanswered heating question in supported living is a referral exactly as "not sure", the land remediation panel needs a known "no" to the polluter question, one pass forward through every flow equals two, and Back steps over a hidden question, thirteen assertions, in both engine modes; phase3, phase9 and the back end did not move.) (It was 2,810, with the site harness at 1,207, after Phase 132g, until Phase 132h, later on 16 September 2026, which added suite AE — flags, answers a later change hides, and derelict land with the polluter question, nineteen assertions, in both engine modes; phase3, phase9 and the back end did not move. It was 2,797, with the site harness at 1,194, after Phase 132f, until Phase 132g, later on 16 September 2026. The site harness gained suite AD, thirteen assertions, in both engine modes: a changed, cleared, "not sure" or absent answer takes back what the old answer set, across 36 handlers in the five flows. The same phase repointed the harness at `02-modules-and-build-prep/`. phase3, phase9 and the back end did not move.) (It was 2,763 until Phase 132f, later on 16 September 2026. The back end gained twenty-three tests in a new file, `test/phase132f.test.ts`, for CA2 in the sources panel, the regulator named both ways, the engagement gate handed its costs, the no-claim threshold beside the fee and the region switches passed; one fixture in `test/engaged.test.ts` gained the new catalogue field. The site harness moved from 1,183 with the same phase's site work, which that work's own record accounts for. phase3 and phase9 did not move.) (It was 2,669 until Phase 132e, on 16 September 2026. The back end gained forty-nine tests: a new file, `test/phase132e.test.ts`, for the view-only login over HTTP, the client's filing confirmation, reward model C, the letter's commercial terms and the discount record; exhaustive view-only tests in `test/authz.test.ts`; the cancellation tests in `test/portal-booking.test.ts`; and one in `test/compliance.test.ts`. Existing back-end tests were changed for the 3% fee, the retired minimum, the fee trigger, the payment terms and the role count. The site harness and phase9 moved with the same phase's engine work.) (It was 2,645 until Phase 132c, on 15 September 2026. The site harness gained suite AA, twenty-four assertions, in both engine modes: the two register names after a signed engagement only, the buyer's own alteration spend asked behind its switch, and the landlord seller answer in four more flows. No other suite's figure moved.) (It was 2,338 until Phase 132, on 14 and 15 September 2026. The site harness gained suites X, Y and Z, in both engine modes; phase3 gained an eleventh file; and the back end gained five test files: `test/phase132-records.test.ts`, `test/phase132-window.test.ts`, `test/phase132-retention.test.ts`, `test/phase132-dates.test.ts` and `test/allowance-profit-comparison.test.ts`. Existing back-end test files were changed in the same phase.) (It was 2,280 until Phase 129b, on 13 September 2026, stored "not sure" about the tax return as unanswered and worked the amendment window out for the year the money was spent in, with the nineteenth CTA switch shipped off — fifty-eight assertions in suite W; both engine modes moved together and no other suite's figure moved.) (It was 2,252 until Phase 129a, on 13 September 2026, built the eighteenth CTA switch — item 9 of the disposal table is not a lease premium, shipped off — with twenty-eight assertions in suite H23; both engine modes moved together and no other suite's figure moved.) (It was 2,239 earlier on 12 September 2026, until the same phase's crosswalk completeness gate added thirteen phase9 tests, J1 to J13.) (It was 2,172 until Phase 129, on 12 September 2026. The back end gained ten tests: nine in a new file, `test/phase129.test.ts`, for four things built and switched off, and one in `test/web.test.ts`, for the engagement letter's specimen company number, beside two assertions added to the letter test already there. phase3 gained two, in `caprebate-source-register.test.ts`, for the address lookup's register entry. The site harness and phase9 moved with the same phase's engine and phase9 work, which that work's own records account for.) (It was 2,150 until the CRM follow-on, on 12 September 2026, built the eleven adopted rows CRM 10 of 10 found unbuilt and fixed the nine defects its guide's exercises found — twenty-two tests in a new file, `test/follow-on.test.ts`; one assertion in `test/pipeline.test.ts` changed, because the seed's new claim at the invoice stage is on Dunmarrow's branch surgery; and no other suite's figure moved.) (It was 2,100 until CRM 9 of 10, on 12 September 2026, built the management dashboard, global search, the lists with saved views and export, and admin settings — forty-nine tests in four new files, `test/dashboard.test.ts`, `test/lists.test.ts`, `test/search.test.ts` and `test/configuration.test.ts`, and one in `test/crm.test.ts` that guards the fix to the intermittent test; two assertions in `test/staff.test.ts` changed so they do not expire with the year; and no other suite's figure moved.) (It was 2,065 until CRM 8 of 10, on 12 September 2026, built the compliance registers — thirty-five tests in two new
files, `test/compliance.test.ts` and `test/compliance-clock.test.ts`; no existing test changed; and no other suite's figure moved.) (It was 2,042 until CRM 7 of 10, on 11 September 2026, built finance on the claim, the fee controls and VAT
monitoring — twenty-three tests in a new twenty-seventh file, `test/finance-claim.test.ts`; two tests in
`test/pipeline.test.ts`, two in `test/automation.test.ts` and one in `test/introducers.test.ts` changed to read the claim's
own invoice and the widened template trigger; and no other suite's figure moved.) (It was 2,017 until CRM 6 of 10, on 11 September 2026, built the claim's facts, the four figures, the sign-off
record, the deliverables register and aftercare — twenty-five tests in a new twenty-sixth file, `test/claim-record.test.ts`;
seven tests in `test/pipeline.test.ts` and two in `test/automation.test.ts` changed for the gates the claim's facts now
decide; and no other suite's figure moved.) (It was 1,988 until CRM 5 of 10, on 11 September 2026, built introducers and the accountant referral
channel — twenty-nine tests in a new twenty-fifth file, `test/introducers.test.ts`; one assertion in
`test/gated-exit.test.ts` extended for the rebuilt contacts table; and no other suite's figure moved.) (It was 1,970 until CRM 4 of 10, on 11 September 2026, built documents on the claim — eighteen tests in
a new twenty-fourth file, `test/documents.test.ts`; one test in `test/crm.test.ts` changed for the claim view's
`documents` key; and no other suite's figure moved.) (It was 1,938 until CRM 3 of 10, on 11 September 2026, built staff tasks, one next action per
claim, the timeline, automation rules and email templates — thirty-two tests in two new files,
`test/tasks.test.ts` and `test/automation.test.ts`; two tests in `test/crm.test.ts` and one in
`test/gated-exit.test.ts` changed for the retired fields; and no other suite's figure moved.) (It was 1,929 until the gated-exit repair, on 11 September 2026, made the funnel's only gate stop
and kept the call its reasoned negative offers — nine tests in a new twenty-first file,
`test/gated-exit.test.ts`, and no other suite's figure moved.) (It was 1,892 until CRM 2 of 10, on 10 and 11 September 2026, built leads and the claim
pipeline — thirty-seven tests in two new files, `test/pipeline.test.ts` and `test/leads.test.ts`,
four tests in `test/crm.test.ts` rewritten for the lead that now opens the claim, and no other
suite's figure moved.) (It was 1,869 until CRM 1 of 10, on 10 September 2026, built the organisation,
property and claim record onto the back end — twenty-three tests in a new eighteenth file,
`test/crm.test.ts`, and nothing else in the suite moved.) (It was 1,824 until Phase 113j, on 10 September 2026, built the twelfth CTA
switch — the grant taken off after the ceilings, shipped off — with forty-two assertions in Suites
H and V, and no shipped figure moved.) (It was 1,813 until Phase 113i, on 10 September 2026, declared `grant` in
the engine's result type and made Suite V pin the one shared grant sentence and
panel — eleven assertions, and no figure moved.) (It was 1,806 until Phase 113h added Suite V to the site harness on
9 September 2026 — seven assertions, and nothing else moved.) (It was 1,763 until Phase 113f added Suite U to the site harness, forty-three
assertions and nothing else moved — and this line said 1,763, with the site at 676,
for several hours after that stopped being true, while the fenced block above it was
correct. Phase 113g corrected it and recorded WHY the drift checker did not catch it:
its matcher cannot see a total written with a thousands separator, nor a bare sum of
components, so the one line in this document that carries both was invisible to the
one control built to protect it. It was 1,717 before that, when Phase 113d built the
engagement gate: thirty-six assertions in the site harness's new suite T and ten
in phase9's new suite H, with the back end and phase3 untouched. It was 1,700
before Phase 113c added seventeen back-end tests with the real text extractor,
in a sixteenth file.) This project has had a stale pass-count in four documents at once, and
the last time somebody quoted rather than ran, the Developer Brief said 862 in
four places when the truth was over a thousand.

**TWO OF THOSE LINES WERE ALREADY WRONG WHEN PHASE 113a RE-RAN THEM ON THE SAME
DAY THEY WERE WRITTEN**, and that is worth a sentence rather than a silent
correction. `phase9` said 245 and was 314; the back end said 293 and was 310
before this phase touched it and 343 after. Both were true when the tools that
produced them last ran and neither had been re-run since. **The paragraph above
already told you to run them rather than quote them — this is what happens when
somebody does.** Phase 113a added 32: fifteen in `test/localtime.test.ts` and
seventeen in `test/portal-booking.test.ts`.

**Two things about reading that output.**
The node test runner prints its totals behind a multi-byte information glyph, not
a `#`: grep `pass [0-9]` **unanchored**, because `^# pass` and `^. pass` both
return nothing and look like a broken suite. The site harness **prints only
failures and xfails** — a section heading with nothing under it means those
checks passed.

**The two harness modes must report the same totals.** `--package` tests the
extracted engine and the default tests the site file; **the two totals matching
is the acceptance test for the extraction**, and there is deliberately no
cut-over, because a harness that only tested the package could not tell you the
package still matches the file.

**The four expected failures are correct and should stay.** One is a known
s.187A pooling defect; three are the engine consuming the residual cost model,
blocked on the VOA and cost-book licences. **If a fifth appears, you broke
something.**

### What the tests actually prove, by area

| Area | Where | Assertions |
|---|---|---|
| The estimate engine, all five sectors, plus the handover invariants and the engagement gate | `03-app/caprebate-regression.cjs`, suites A–Z and AA–AG, both modes | 1,246 (16 Sep 2026, after Phase 132j's suite AG; 1,239 after Phase 132i's suite AF; 1,226 after Phase 132h's suite AE; 1,207 after Phase 132g's suite AD; this row said 1,130, the figure after Phase 132, until then) |
| The data layer — name exclusion, ingestion, the upload handler, reconciliation, the source register, document/property matching, the surveyor CRM, the anchor quarantine | `04-phase-work/phase3/` | 412 |
| Behind-blocker work — VOA and boundary import, the cost model, job economics, the engagement gate's cost input, the postcode resolver | `04-phase-work/phase9/` | 382 |
| Authentication, authorisation, the audit log, the payload, the web half, settings, images, multipart, the seed, engaged clients, the surveyor, finance, the CRM backbone — organisations, contacts, properties, claims, DO_NOT_CONTACT — and leads and the claim pipeline: the enquiry gate, a skip test for every stage gate, the exits; and the funnel's gate and the call from its reasoned negative; and staff tasks, the one-next-action refusal, overdue by the UK date, the timeline and who sees it, automation rules with every forbidden effect refused, and email templates; and documents on the claim — types, versions that never overwrite, links, requests received only by an upload, and who reads which; and introducers — a firm never a user, a referral with no person on the lead, progress shared only under the client's opt-in (never asked counting as no, at the database too), the reward model off and refusing while clause 1 of the letter is blank, the dashboard derived for each role, and every test server bound to 127.0.0.1; and the claim's facts — derived first with their source, the gates they decide asserted on the recorded not known and the absent, the sign-off record the only thing that opens its gate, the four figures, the reconciliation, the deliverables register with the client release both ways, and aftercare; and finance on the claim — a gapless number series, the amounts unwritable, credit notes and money received as rows, overdue read by the UK date with an unset due date never overdue, the fee controls off exactly as today, VAT monitoring by tax point with one task and no invoice changed, and the invoice email refused; and the management dashboard built forwards for each role, global search limited by `can()` inside the query, the lists with fixed filters and sorts, saved views and an audited CSV export with formula cells neutralised, and admin settings — the configurable lists, every forbidden setting refused and recorded, a rule that asks for a document, and merging a firm; and the introducer and the source read through the lead, the claim team by a link table, the document centre asked row by row, the dashboard over a period, the estimated fee, the prior-claim position derived with both unknowns asserted, mandatory documents off and on, the audit log page and `verify-audit`, and nine defects each held over HTTP; and Phase 129's four things built and switched off — the conveyancing strip, the per-disclosure log, a data protection officer role and the recommended receipt strips — each asserted both ways, and the engagement letter's specimen company number replaced or flagged; and Phase 132's records a defence rests on — the case stamp on every issue, the defence pack generator both ways, and the deletion log with the backup cycle a named blank — plus the partnership amendment window, the retention rows read against the Retention Determinations, the month-end clamp, and the with-and-without comparison run empty and imported by no route; and Phase 132e's — the client cancelling a call at any time, the view-only login with a decision on every action, the client's own filing confirmation, reward model C, the flat 3% fee with the minimum retired and the discount recorded not applied, the fee earned on report delivery, and the letter's completed terms each read both ways; and Phase 132f's — CA2 in the sources panel, the regulator named both ways, the engagement gate handed its costs, the no-claim threshold beside the fee, and the region switches passed, each asserted both ways; and Phase 133a's layout — the menu per login opened both ways, no link to a refused screen, no inline script or style, the CSP pinned, the stage bar on the stored stage, JavaScript off, the refusal page and the palette's contrast; and Phase 133b's five long screens — the business page, the survey job, finance, admin settings and document types each on the layout for a login that opens it, every tab on a panel on the page, no id used twice; and Phase 133c's brand and plain words — the tokens and the white-on-mint rule, the logo, no exclamation mark, avoid-list word, "Caprebate", ISO date or empty row on any page, a refused form keeping what was typed, the welcome card, the next step, Help and both name switches | `09-app/backend/test/` | 864 |

---

# 5 · What the developer must still do

**Mapped onto the Build Order's own blocks**, so a price can be quoted against a
structure that has been read. The blocks are A to G. **They are not the same
thing as the seven build phases** — two overlapping schemes, and mapping one onto
the other is how the last three documents went wrong.

| Block | What it is | State |
|---|---|---|
| **A** | The engine as a package | **BUILT.** `09-app/engine`, byte-for-byte, 21 verification checks |
| **B** | The funnel, `Q1`–`Q3` and the figure | **BUILT.** Six screens, the engine's figure, no external call |
| **C** | The close, the letter, the signing | **BUILT except signing itself and self-serve account creation** |
| **D** | Post-gate research, reconciliation, capture | **BUILT as a surface with no connectors behind it.** Both gates real; nothing is contacted |
| **E** | Client documents | **BUILT against the port — and, since CRM 4 of 10, run to the end on the upload route itself, with types, versions, links and requests on top.** The storage adapter for the real host is not written, and fourteen document types wait on a receipt policy — each with a recommended strip recorded, not approved |
| **F** | Staff, surveyor and operations surfaces | **BUILT.** All six roles have a surface (READ_ONLY, added by Phase 132e, reads the back office and is held by nobody) |
| **G** | The public notices page at `/notices/` | **DRAFTED, NOT HOSTED.** `03-app/caprebate-notices-page.html`, the printable complaint form beside it, and a **fourteen-line host checklist that is the actual work package**. Two statutory duties are unperformable until it is live |

## 5.1 · The eight things this build honestly does not have

Each of these is outside what could be built here, and each is on the critical
path to a public deployment. **The CRM adds seven more of the same kind, at §5.5.**

1. **TLS and certificates.** The application sets `Secure` on every cookie and
   assumes it is behind HTTPS. It terminates nothing itself. Certificate issue,
   renewal and HSTS are yours.

2. **Production secrets management.** There are **no secrets in this build at
   all** — no API keys, no credentials, nothing in the repository and nothing in
   this document, because nothing calls anything. The moment a connector exists
   that changes, and a vault (or the host's equivalent) is needed **before** the
   first key is issued, not after.

3. **A web application firewall**, and rate limiting at the edge. There is
   application-level rate limiting on authentication and reset; there is nothing
   in front of the process.

4. **Penetration testing.** Not performed. The controls here are unit-tested and
   inspected on the wire, which is not the same thing and is not offered as the
   same thing.

5. **Real API credentials and their licences.** Every source in §3.2 needs its
   own account, and three carry **lead times** worth knowing about early: the
   **HMLR Business Gateway** account and network-access agreement; **EPC**
   registration through GOV.UK One Login; and **HMRC Agent Services** with the
   64-8 flow if it is ever wanted. Three carry **licence flags** that are a
   solicitor's question and not an engineering judgement: HMLR title
   redistribution to the client's accountant, the CQC syndication currency
   obligation, and whether a derived £/m² printed in a report counts as
   reproducing the BCIS table.

6. **Email deliverability.** Stub 1 is a swap; deliverability is not. SPF, DKIM,
   DMARC, a sending domain and its reputation, and bounce handling.
   **Invoice fraud is the specific risk here**: bank details on an emailed
   invoice are the standard vector and the sums are percentages of tax refunds.
   Details are confirmed on a channel other than the invoice email and **never
   changed because an email asked**. That is procedural and belongs in the SOP —
   **do not build the invoice email flow before it is written down.** **CRM 3 of 10 holds
   this in code:** a template carrying an invoice or bank details is refused by its store, by
   its table and again at the merge, and no automation rule has an effect that writes to a
   client at all. **CRM 7 of 10 wrote the procedure down — into SOP 9, as a flagged DRAFT
   ADDITION, not in force** until the solicitor, the data protection officer and the developer
   sign it off. `INVOICE_FRAUD_PROCEDURE` in `src/web/automation.ts` says so, a test fails if
   the code says in force while the SOP says draft, and the same two refusals now also cover a
   reminder, bank details sent by a rule, payment details, where to pay, a bank transfer, an
   amount due, a fee note and a statement of account.

7. **The hosting itself.** UK data residency is a requirement. Nothing here has
   been deployed anywhere.

8. **The WordPress integration — and this is the decision that changes the
   price.** Everything built is TypeScript. **If the host can run a Node process,
   this ships behind WordPress and the integration is a reverse proxy and a
   shared session story. If it cannot, this becomes the executable specification
   a PHP rebuild is tested against** — the tests define *done* either way, so no
   work is thrown away, but the two are different quotes. See 5.3.

## 5.2 · The work items, priced against the blocks

| # | Work | Block | Note |
|---|---|---|---|
| DS-W1 | **The register connectors** — ten free sources and three paid ones, behind the existing seam | D | The layer that would consult the outside world is described in four documents and **implemented nowhere**. Quote it as new build. Include the **200-property fuzzy-match measurement** that sets the confidence threshold |
| DS-W2 | **OCR, and the PDF cases this build does not decode**, behind the existing `TextExtractor` port | E | Stub 4, and **smaller since Phase 113c**: `.docx` and uncompressed/FlateDecode PDFs are read and stripped for real. What is left is scanned PDFs (OCR — a library and a decision), encrypted PDFs, and LZW/ASCII85/JBIG2/CCITT filters. Until then the strip on *those* runs over a marker line |
| DS-W3 | **The `ObjectStore` adapter for the real host**, outside the web root | E | **Do not write a second upload handler.** It exists, it is 39 tests, and `assertContractCovered()` fails if the contract grows a step it does not cover |
| DS-W4 | **A signature provider** behind `SignatureProvider` | C | And the **tokenised signing link**, if the letter is to leave the session — see 5.4 |
| DS-W5 | **Email transport and deliverability** | C, F | Stub 1 — and §5.5 item 2: **no template leaves the outbox before deliverability is in place, and the invoice email is not built until the invoice-fraud procedure is in force** |
| DS-W6 | **Self-serve account creation** | C | Not built. Today an ADMIN creates a client account |
| DS-W7 | ~~**Timezone handling**~~ | F | **DONE — Phase 113a, 9 September 2026.** Display and input convert to UK time through `Intl`; storage and comparison stay UTC; working times are local hours converted per candidate day. What remains is a *choice*, not work: whether a per-user zone is ever wanted, which is one constant in `src/web/localtime.ts` |
| DS-W8 | **The `/notices/` page hosted** | G | The page exists; the **host checklist** is the work package. A day, not a sprint, and easy to get subtly wrong — *the failure mode is not "it doesn't work", it is a page that renders perfectly and nobody can find* |
| DS-W9 | **Role corroboration** — Companies House officers and PSC, plus the CQC nominated individual | D2 | **Blocked on a narrow DPO permission**, and the shape of the ask matters more than the answer: **read, compare in memory, discard — no write exception at all** |
| DS-W10 | **The accountant's computation pack as a document** | — | The client's accountant has no login and receives it offline. **No part of this build produces a report document.** The authoritative template is `04-phase-work/phase9/surveyor-valuation-report-template-v2.md`, 23 sections, awaiting a chartered surveyor's sign-off |
| DS-W11 | **UK data residency and the processor list**, for every store — the database, the document store, backups, logs, the email provider and anything a connector adds | all | §5.5 item 1. A processor is named in clause 7 of the letter and section 4 of the privacy notice **before** it carries client data (disposition row B4.11) |
| DS-W12 | **Calendar synchronisation** — bookings published to staff calendars; an external change never writes a booking the application has not checked | F | §5.5 item 3. Booking inside the application is built; no iCalendar object is generated (stub 1) |
| DS-W13 | **The accounting export** — invoices, credit notes and money received in the package's own import format, read-only and audited | F | §5.5 item 4. **A seam, not an integration**: nothing is pushed, and nothing tells the system a transfer arrived |
| DS-W14 | **Staging, production, backups and a tested restore** | all | §5.5 items 1 and 6; disposition rows 18.7, 21.5, 21.8, 26.7, 26.8, 26.10 and 26.13. **Waits on the backup-exclusion question** — a document alive in a backup has not been deleted |
| DS-W15 | **Penetration testing of every route**, the CRM's included | all | §5.5 item 7, and §5.1 item 4 |

## 5.3 · The open questions — so nobody quotes a moving target

Quote these **by title**; the questions document does not number them.

| Question | Why it is on this page |
|---|---|
| **“Does WordPress replace the rest of the system, or sit beside it?”** | **It decides wrap versus rebuild, and therefore the price.** It was answered on 1 September with the larger reading — WordPress is the whole back end and front end — but **whether the host can run a Node process has never been answered**, and if it can, most of the rebuild disappears. **Get it confirmed in one sentence before pricing.** **Since CRM 10 of 10 the price carries the CRM's size — §5.5 item 6.** |
| **“Did you send the two hosting questions, or were ‘yes and yes’ the host's answers?”** | The same two questions — *can the client-document folders be excluded from the backup*, and *can the host run Node* — were sent to the host on 3 September and the reply reads equally as *I will send them* and as *the host said yes to both*. **A data-protection control that rests on a remembered conversation is not a control.** |
| **“Can the client-document folders be excluded from the nightly whole-site backup?”** | **The only question on this list that can stop a build.** A file unlinked from disk and alive in a 30-day host backup **has not been deleted, and the deletion record would say it had.** If the answer is no, the client-document upload page cannot ship as designed. **Since Phase 132 the cycle is a named blank rather than a guess**: `BACKUP_CYCLE` in `04-phase-work/phase3/caprebate-client-doc-ingestion.ts` is NOT SET, owned by the data protection officer with the developer. `recordDeletion` writes it onto every deletion's evidence as backups still pending, with no cycle and no expiry. `ret3DueAt` stays null rather than treating the copies as expired, and `assertRestoreApproved` refuses a restoration without the data protection officer's approval |
| **“Which receipt strip should each new document type carry before anyone may upload one?”** | Fourteen document types — the engagement letter, accounts, the fee invoice, the survey and capital allowances reports and the rest — **are recorded, configurable and switched off**: nothing of them can be received until each has a receipt policy. The decision is the data protection officer's. **Since Phase 129 a recommended strip for each is recorded and switched off, with a one-line reason to approve or amend** — and binding one is a policy entry of its own in the ingestion module plus a migration that rebuilds the type table, not one line |
| **“May company names stay on conveyancing uploads if we strip the individuals?”** | The parties clause of a sale contract and the pre-contract enquiry replies is the fact entitlement turns on, and today none of it is captured. **The strip that keeps company names and numbers and removes every individual is built and switched off (Phase 129)**; the answer switches it on, or says those two document types cannot be processed at all |
| **“Who exactly can administer the website — and does that include the host's own staff?”** | The audit log is **tamper-evident, not tamper-proof**: administrators sit inside the trust boundary and are trusted. That determination carries three conditions and **one — that the administrator set is enumerated and known — is not met today** |
| **The engagement letter's blanks — eight of them** | Derived from the document at request time, not listed by hand. **Clause 1** the introduced-adviser fee · **clause 4** the fee basis, the payment terms and the abort fee · **clause 5** the break fee · **clause 13** the trigger, whether it reaches HMRC settlements, and the time limit. They sit under three question titles: *“What is the break fee, and is there ever an abort fee or a fixed fee?”*, *“If a claim is reduced after we have been paid, do we give the money back?”* and *“Do we cap the fee, warn about it, or adjust the percentage?”* **The prototype shows them blank, loudly. A plausible number in a prototype becomes a number in a contract.** |
| **“What replaces the paid address autocomplete in the funnel?”** and **“What does Homedata actually cost per lookup?”** | A purchasing decision. **It does not block Block B** — a typed postcode and address field is a working fallback and is what the block should be priced against. **Decided 15 September 2026 (Phase 132c):** Lakhbir agreed a typed postcode and address; an autocomplete is bought only if the 200-property measurement shows typed addresses losing good enquiries |
| **“Will the data protection officer permit a transient read of two register name fields?”** | Blocks DS-W9 and nothing else |
| **“What does ‘24 working hours’ mean?”** and **“What is the contact telephone number?”** | Both appear on the thank-you screen. The first is the only service promise the product makes and it reads three ways; the second **is still a placeholder in the copy** and would otherwise ship to people who have already converted. **Decided 15 September 2026 (Phase 132c):** contact is promised within one working day, and the thank-you screen carries no telephone line, only the email address. Both thank-you screens in the site file now say so; the email address itself is still a placeholder until the mailbox questions are answered |
| **“At account creation, does ‘skip’ mean skip the portal, or a genuinely manual product?”** | Decides whether DS-W6 is a screen or a manual process. **Decided 15 September 2026 (Phase 132c):** skip means skip the password and the portal, never the email address, and the engagement letter is then sent rather than shown on screen. DS-W6 is a screen; a manual path with no email address is not a website route |
| **“Do we need a compliance role separate from Admin?”** | The compliance registers are ADMIN's today only because no other role exists. A super user is not a data protection officer, and the procedures' two-person check is one login in this build. **Phase 129 defined the role, scoped to the registers, and switched it off**: the answer decides whether it is switched on and whether it reads the audit log. **Decided 15 September 2026 (Phase 132c):** not yet. Compliance stays with Admin, the role stays switched off, and it is revisited when the data protection officer is appointed and has a login |
| **“If money laundering supervision applies to us, what risk-rating scale do we use for a client, and which kinds of claimant must a check cover?”** | Customer due diligence is built and switched off; the position paper names no scale, no threshold and five claimant types, so none is invented |
| **“Is it right that there is no existing client data to import?”** | **The data-import line of the price is nothing**, because there is no real client data anywhere — the seed is invented, and no phase has ever held a real client. A one-line confirmation from Lakhbir. If the answer is no, an import is priced under N2 and the consent history, never as a spreadsheet load |

## 5.4 · Two consequences of decisions already taken, which a developer inherits

- **Anyone holding the signing link can sign.** Moving the letter out of the funnel means the signer is no longer the person in the session who answered every question; the link can be forwarded to a colleague or a bookkeeper. **The authority tick and the typed name are the only controls left**, which is why the typed name must be recorded verbatim and compared against the named party. It is a weaker control than a session, it is a consequence of the decision rather than a defect in it, and **the token must be single-purpose, expiring, revocable, scoped to one engagement, never a login, and never reused after a letter is superseded** — a letter edited behind a live link no longer matches its own hash.
- **There is no card processor and there is no PCI scope.** Invoice plus bank transfer, **a gapless invoice number series**, raised, sent and cancelled recorded — and, since CRM 7 of 10, **paid, outstanding and overdue read from the invoice, its credit notes and the money recorded against it** — and **manual reconciliation with an audit trail**. Nothing tells the system a transfer arrived.

## 5.5 · What the CRM needs and this build cannot have — CRM 10 of 10

**The ten CRM phases more than doubled what a developer inherits**, and every item below is either
the CRM's half of something §5.1 already names, or a thing only the CRM needs. Counted on
12 September 2026 by reading the tree and migrating a fresh database. **The middle column was counted
again on 16 September 2026**, after the CRM follow-on, Phase 129, Phase 132 and Phase 132e had added migrations 020 to
029; the other two columns are the CRM's own and did not move. The `src/` and `test/` counts leave out the
`.bak-phase` copies. **Count them again rather than quote them**:

| | Migrations 001–008, before the CRM | Migrations 001–029, today | What the CRM added |
|---|---|---|---|
| Tables | 32 | 97 | 55 |
| Triggers | 6 | 274 | 236 — **most of the refusals live here, at the database** |
| Indexes | 17 | 104 | 76 |
| Migration files | 8 | 29, 7,166 lines | 11, 5,238 lines |
| Source under `src/` | — | 95 files, 43,606 lines | 37 modules, 21,829 lines |
| Routes the code registers | — | 166 | 91 in the ten page modules the CRM added, and the finance routes CRM 7 of 10 widened |
| The back end's `test/` folder | — | 44 files, 21,930 lines | 16 files, 9,643 lines |

**What Phase 132 added to the schema, extended and never rebuilt.** **022** creates `claim_version_stamps` (the case
stamp), `deletion_log` (Retention Procedure 4.3: one entry per deletion, naming a record by kind and id, never by
person; verified once, never deleted) and `deletion_restorations` (a restoration only against a logged deletion).
**023** creates `surveyor_control_observations` (the blank-field control, never changed or deleted) and adds
`surveyor_rate_events.blank_control`. **024** drops and recreates the `claim_facts_key_insert` trigger with migration
015's key list plus `PARTNERSHIP_HAS_COMPANY_MEMBER`; no table, row or other trigger changes.

**What Phase 132e added, on 16 September 2026.** **025** adds `bookings.cancelled_at` and `cancelled_by`, and
`booking_changes.cancelled`, with three triggers: a booking is written uncancelled, a cancellation names both who and
when, and a cancelled call is final. **026** adds the `READ_ONLY` role row, dropping `roles_fixed_insert` for that one
row and recreating it. **027** creates `client_filing_confirmations` (the client's own filing confirmation, party always
CLIENT, append-only). **028** rebuilds `introducer_reward_setting` to allow model C and hold its percentage — the four
triggers naming it dropped first and recreated word for word — and creates `introducer_percentage_entries`, a ledger of
accruals and reversing entries that is never changed or deleted. **029** creates `fee_discounts`, a proposed
multi-site discount recorded and never applied.

**Nothing of the CRM fires anything, and nothing of it is hosted.** Every seam it uses already
existed — `EmailTransport`, `SignatureProvider`, the register stub, `TextExtractor`, `ObjectStore`
— and **both register gates stay shut** (disposition row 1.8).

1. **UK data residency for every new store.** The CRM's fifty-five tables hold client, staff and
   introducer data, the identity store and the compliance registers among them, in the same
   SQLite file as everything else; its documents go through the same `ObjectStore` port; its
   letters and notices queue in the same outbox. **In production every one of those — the
   database, the document store, their backups, the logs and the email provider's message store —
   is hosted in the United Kingdom.** Retention periods are not a developer's recommendation: they
   come from the Retention Determinations, and the retention list shows UNSET as unset (rows 18.8,
   29.10). **Any host, email provider, calendar service or accounting package is a processor, named
   in clause 7 of the engagement letter and section 4 of the privacy notice before it carries client
   data** (row B4.11). Work item DS-W11.

2. **Email deliverability before any template leaves the outbox, and the invoice email only after
   the fraud procedure is in force.** The CRM queues more than the first build did — templates from
   the claim page, the automation's notices to an owner, the stage notices to an introducing firm,
   the compliance registers' draft letters — and **every row is written with `sent_at` NULL and
   labelled not sent**. Implementing `EmailTransport` is a swap; deliverability is not: SPF, DKIM
   and DMARC on the sending domain, bounce and complaint handling, and a suppression list — and a
   real transport **must keep calling `isDoNotContact`**, and keep the template store's refusals of
   bank details, invoices and tipping-off words. Where the mailboxes live is *“Are the business
   mailboxes going on IONOS, where the mail already points, or on Microsoft 365, which the runbook
   assumes?”* **The invoice email is not built.** `INVOICE_FRAUD_PROCEDURE` in
   `src/web/automation.ts` says the procedure is a draft addition to SOP 9, not in force, and a test
   fails if the code says otherwise; build it only once the solicitor, the data protection officer
   and the developer have signed that procedure off. **Inbox synchronisation is not in the ten
   phases** (row 25.2): the CRM is outbound, through the outbox. Work item DS-W5.

3. **Calendar synchronisation. Booking inside the application is built; external sync is not.**
   Built: `src/web/schedule.ts`, `bookings` and `booking_changes`, each person's working times in UK
   time, staff scheduling from the calendar, and the client moving their own call — with `isBookable`
   asked again **at the write** every time. Not built: no iCalendar object is generated (stub 1), and
   nothing reaches Outlook or Google. **The application stays the source of truth for a client's
   call**: publish its bookings to staff calendars first, and if a two-way link is ever wanted, an
   external change must go through `isBookable` like any other — never write a booking the
   application did not check (rows 19.6, 25.3). Work item DS-W12.

4. **Accounting-software integration as an export seam, not a build.** Built: invoices on the claim
   with one gapless number series, the amounts unwritable, credit notes and money received as rows,
   overdue read rather than typed, and an audited CSV export of the lists (`list.export`). **The
   seam is one more export of the same kind** — invoices, credit notes and money received, in the
   chosen package's own import format, read-only, for Accounting and Admin, audited with its columns
   and row count like the list export. **Nothing is pushed into the package, and nothing tells the
   system a transfer arrived**; a person who has seen the bank records it. Which package is chosen
   changes the file's columns and nothing else, so **nothing waits on the choice** (rows 13.13, 25.1,
   29.7). Work item DS-W13.

5. **Data import: there is no real client data anywhere, so the answer is nothing to import.** The
   seed is invented, every postcode in it is from the fictional ZZ range, and no phase has ever held a
   real client, lead, introducer or document. **The line in the price for importing data is
   nothing.** That is put to Lakhbir as a one-line confirmation — *“Is it right that there is no
   existing client data to import?”* — because if a spreadsheet or an inbox of real enquiries does
   exist, importing it is not a load: every person in it is a contact or an identity-store record
   under N2, with a consent history and a lawful basis, and nothing in it may become a guess under N4
   (row 29.9).

6. **The WordPress or Node question, now with the CRM's size in the price.** *“Does WordPress
   replace the rest of the system, or sit beside it?”* is still unconfirmed, and **the CRM makes the
   two answers further apart, not closer.** If the host can run a Node process, the CRM costs almost
   nothing extra to ship: it is the same process behind the same reverse proxy, and the work is the
   production store — SQLite is the prototype's, and the lists are capped and authorised row by row
   (rows 21.3, 27.10). **If it cannot, a PHP rebuild now has to re-home the table above** — and the
   expensive part is not the screens. It is the 236 triggers through which the database itself
   refuses a skipped gate, a queued notice without the client's yes, a second live invoice, a
   received request nobody uploaded, a deleted record — each with a test that must be ported and
   seen to fail. Quote both routes, and get the one-sentence confirmation first.

7. **Penetration testing of every new route.** Not performed — for the first build or for the CRM
   (§5.1 item 4). The payload proof and the refusal tests are not a penetration test and are not
   offered as one. **Test every route in §3.1 against a seeded copy, never real data**, and give
   these the most time: every `{id}` swapped for another organisation's (the refusal and *not found*
   must be indistinguishable); every `view.json` and both CSV exports, as each role; global search
   and the identity store's own search; the compliance registers and the merge; the upload `PUT`;
   the settings screen's refused keys; and, **before it is ever switched on**, the public referral
   form at `/refer`, which will be the first unauthenticated write the CRM exposes. Work item DS-W15.

**Not on this list, on purpose.** **Marketing automation** (row 25.11) is not built in the ten
phases; if it ever is, it writes only to a contact whose `marketing_optin` is set for that channel,
never to a DO_NOT_CONTACT organisation, never from the identity store, and through the outbox.
**Infrastructure configuration and a deployment process** (rows 21.8, 26.7, 26.8, 26.13): nothing is
deployed anywhere, so there is none to hand over and none is invented — **the tree is the
handover**, and staging, production, backups and recovery are work item DS-W14, behind the
backup-exclusion question (rows 18.7, 21.5, 26.10).

---

# 6 · What is not a developer decision

**If you find yourself writing code that makes one of these awkward, the code is
wrong.** Each carries the test that proves it, and each test is one you can run.

## N1 · The anchor quarantine

**The surveyor must not see our estimate before committing their own figures —
structurally unreadable, not merely hidden in a UI.** A `display:none`, a
permission flag, or a field the page does not render **do not satisfy this**. The
estimate outputs must not be in the payload sent to the surveyor's session **at
all**; a surveyor with devtools open must find nothing. **Release is automatic on
commitment** — no override, no support ticket, nobody to ask.

> It does a second job, and this is the half that gets forgotten: freezing the
> surveyor's pre-release figures is what **measures** anchoring, and that
> measurement is the only evidence we will ever have about whether our pre-fills
> are right. **A build that releases the estimate early does not weaken a
> control — it destroys the evidence.**

**Owner** `04-phase-work/phase3/caprebate-anchor-quarantine.ts` (27 assertions).
**Assembler** `09-app/backend/src/payload.ts` — it builds the surveyor's object
**forwards from what the quarantine released**, never by reading everything and
deleting.

**The test, and it runs on the wire rather than on the code:**

```bash
cd 09-app/backend && CAPREBATE_ALLOW_SEED=1 node tools/payload-proof.ts
```

It signs in as a real surveying user, does a real GET, and searches the bytes
that came back **three ways — by field name, by value at any depth under any
name, and in the raw text**. When this was captured on 9 September 2026 the JSON
was **2,540 bytes**, `'estimate' in body` was **false**, and all three searches
returned **0**. **The same searches as ADMIN, where the estimate IS released,
returned 7, 7 and 7** — and that negative control is what makes the zeros mean
anything. `test/surveyor.test.ts` does the same over HTTP for both the JSON and
the HTML, and now for `/api/surveyor-jobs/{id}` as well.

**EVERY ROUTE A SURVEYOR CAN REACH IS IN THE PROOF, AND CRM 1 of 10 ADDED FOUR.** The claim
page and `GET /staff/claims/{id}/view.json`, and the property page and
`GET /staff/properties/{id}/view.json`, are searched the same three ways as SURVEYING and must
return nothing; the two JSON routes are searched again as ADMIN and must return all seven. A
claim on no job of the surveyor's must answer 403. **The proof now ends with a verdict line and
exits 1 on any failure** — it used to print and exit 0 whatever it found. It was proved able to
fail: with SURVEYING added to `claim.read_value` it printed FAIL for both JSON routes and exited 1.
**A later CRM phase that adds a route a surveyor can reach adds it here**, and a dashboard or a
search response is such a route.

**CRM 2 of 10 ADDED SEVEN ROUTES A SURVEYOR MUST NOT REACH, AND THE PROOF ASSERTS EACH REFUSES
THEM**: the lead list, a lead's page and its `view.json`, the board and its `view.json`, a stage
move and a confirmation — and that the refused move left the claim's stage where it was. The claim
the proof searches is now the survey job's own, by the `claim_id` the job carries. **A surveyor's
pipeline panel on the claim must be exactly the stage and its steps**; as ADMIN, a lead's
`view.json` must carry all seven and the board a value on the job's card. It was proved able to
fail: with the full panel built for every reader it printed FAIL and exited 1.

**CRM 3 of 10 ADDED FOUR ROUTES A SURVEYOR CAN REACH AND SEVEN IT MUST NOT.** The landing page with
*My tasks*, the task list and its `view.json`, and the surveyor's own task page are searched as
SURVEYING and must return nothing. The breakers list, the automation rules, the templates, adding a
task, setting a next action, queuing an email and a note on the claim must refuse, and the property
page must draw a surveyor no timeline. The claim's `view.json` now carries `tasks` and `timeline`: a
surveyor's must hold only their own tasks and a timeline limited to stage, task and survey events,
and ADMIN's must still carry all seven **with the tasks and the timeline inside it** — which is how
the search is proven able to find the estimate in the response the new objects live in. *My tasks*
builds no estimate for any role, so ADMIN is searched there too and must find none (disposition
row E32).

**CRM 4 of 10 ADDED TWO ROUTES A SURVEYOR CAN REACH AND EIGHT IT MUST NOT.** A document's page and its
`view.json` — for a lease linked to the job's claim — are searched as SURVEYING and must return nothing. The
fee invoice's page and `view.json`, the lease's original, the document types, a request, an upload, a link
and a withdrawal must refuse. The claim's `view.json` now carries `documents`: a surveyor's must hold the
job's claim evidence alone and no requests, and ADMIN's must still carry all seven **with the documents
inside it**. A document's `view.json` builds no estimate for anyone, so ADMIN is searched there too and must
find none.

## N2 · The name exclusion register

**No personal names are pulled or stored from any register, with exactly two
exceptions** — the Companies House PSC name (the common-control test) and the
HMLR proprietor name where the proprietor is a natural person. The pattern is
**retrieve → assert → write, and if the assertion throws the write never happens.**

- **Classify by field NAME, never by value.** Do not write a name detector and think you have implemented this.
- An unrecognised source or an uncatalogued field is `E_UNCLASSIFIED_FIELD` and is **refused**, not waved through. **That is fail-closed by design and it is the barrier that catches drift.**

**Owner** `04-phase-work/phase3/caprebate-name-exclusion.ts` — **39 assertions**
(this figure has been quoted as 22 in several documents since; it was re-derived
by running the file on 9 September 2026). The check runs at the **ingestion**
boundary, in `src/stubs/registers.ts:77`, because a filter applied at report time
would leave the name sitting in storage in between.

**Accept:** with role corroboration enabled in a harness, **no persisted row
anywhere in the system contains an officer or nominated-individual name.**

## N3 · RECEIPT_CONTRACT

**The twelve-step call order for a client-document upload. The order IS the
control.** Two guarantees are load-bearing and each is asserted three separate
ways, because the failure is silent:

1. **Nothing is promoted to durable storage before the strip has run.**
2. **The quarantine object is deleted AND the deletion recorded** — on the failure path as well as the success path.

> `applyReceiptPolicy` filters **the extracted text, not the file.** The file
> sits complete and unredacted in quarantine while the strip runs; what bounds it
> is the TTL, not the strip. **Nothing anywhere produces a redacted copy.** That
> sentence was wrong in the codebase for two phases.

**Owner** `04-phase-work/phase3/caprebate-client-doc-ingestion.ts` (90 assertions).
**Consumer** `caprebate-upload-handler.ts` (39 assertions), called on the request
path and not only at start-up.

**Accept:** `assertContractCovered()` is green; the handler claims exactly as many
steps as `RECEIPT_CONTRACT` states; the contract is still twelve steps; a
promotion attempted before a recorded strip throws `E_PROMOTE_BEFORE_STRIP`.
Harness suite **M5** asserts all four, and it asserts that the handler **calls**
the module's assertions rather than merely importing them — because the contract
existed for six days with no caller and every control on client documents was
dormant. **That must never be true again without something failing.**

## N4 · Unknown never routes to the favourable branch

1. **A null routes to capture, never to a guess.** Never defaulted, never interpolated, never carried forward as a mean.
2. Where an unknown must resolve to something, **it resolves to the lower figure.**
3. **“I don't know” is a first-class answer** and must be offered on every capture field. A form that forces a client to pick between two wrong answers has manufactured a fact.

> The one place you will be tempted to break this: **the estimate looks better
> with a number in it than with a gap.** It does. **Put the gap in.**

**And when you assert this, assert both cases.** *Not sure* and **absent** must
behave identically. A suite that tests only the `"unsure"` string leaves the
undefined case — the state of every client who was never asked — completely
uncovered, and everything else goes on passing. That exact hole was found on the
allowance gate, and the tests that closed it were proved able to fail by breaking
it on purpose first.

**Where it is enforced:** the engine's own gates and terminals (harness suites
G, L, S); `09-app/engine/typetests/n4.types.ts`; `newSession` sets **no facts at
all**, because absent is what *nobody asked* has to look like; the tier table in
`research.ts` applies N4 **to itself** — a source nobody has tiered is treated as
**PAID**, the more restrictive branch, with a test that adds one and asserts it.

---

## The two gates — real, and not yours to open

**FREE register calls are gated on a published privacy notice.**
`CB_REGISTRY.precondition` is `enabled: false` and its own `requires` string says
why: *“a published privacy notice reachable from the address question, because
the legitimate-interests basis for these lookups depends on it”*. **Publish the
page, link it, flip one boolean. DO NOT BUILD A SECOND GATE.**

**The lawful basis is legitimate interests and the client is INFORMED, not
consenting.** A consent tick at the address question would **misdescribe** the
basis and is the weaker position — consent is withdrawable where an assessment is
not, and anyone who declined could not be given a figure at all.

**PAID calls are gated on a signed engagement asserted SERVER-SIDE, plus one
operator click** that then fires everything outstanding. **The operator picks the
moment, not the calls — do not build a per-call confirmation.**

**`assertSignedEngagement` returns a record rather than throwing, and the name is
not a mistake.** It is named in four documents, so renaming it would make all of
them wrong; and all four also say that **nothing refuses and nothing throws**.
The two are reconciled by reading *assert* as *establish the fact from the
record* — it reads the `engagements` table on the server, on this request, and
returns what it found. **The gate is then applied by NOT CONSULTING a source,
which is a decision and not an error.** A version that threw would be a build in
which a shut gate produces a screen error, and every document names that as the
failure mode to avoid.

**Do not open either gate to make a screen flow.** The connectors are stubbed;
the gates are real.

## The security baseline — requirements, not aspirations

- **Authorise on the server, for that requester and that specific object, on every request.** Never a client-side check, a hidden field or an unguessable URL. This is requirement **DB-W1** and it carries six acceptance tests; **five pass and DB-W1-T4 is declared not run** because it needs a live WordPress.
- **Client documents are written OUTSIDE the web root** and served only through an endpoint that authorises each request. A file in a public uploads folder is readable by anyone who holds or guesses the URL.
- **Uploads:** allow-list **on the server**, size cap, **content sniffing rather than trusting the extension**, and **no execute permission on the storage directory**. Today: files `0600`, directory `0700`, a PHP payload named `.pdf` refused on sniffing, and write capabilities scoped to a single key.
- **Passwords** argon2id at the OWASP baseline, never logged, never returned. **Sessions** httpOnly, secure, sameSite, rotated on privilege change, **revocable server-side**.
- **Escape on output, never build HTML by concatenation.** No `innerHTML` with anything a user supplied. A Content-Security-Policy with no `unsafe-inline`.
- **Validate every input server-side.** Client-side validation is a courtesy to the user and is not a control.
- **Parameterised queries only** — and it is checked rather than promised: `npm run lint:sql` fails the build on a template literal or a concatenated variable inside a statement, and it was proved able to fail before it was kept.
- **No secrets in client code, in the repository, or in this document.**
- **No personal data in URLs, logs or error messages.** The audit log **refuses rather than redacts** — a redacting logger teaches callers that it is safe to pass anything. Rate-limit authentication and anything that can fire a paid call.
- **The audit log is append-only and tamper-evident** — a DPO determination, not a design choice. Enforced **twice**: `BEFORE UPDATE` and `BEFORE DELETE` triggers abort at the database, **and** the rows are hash-chained, so somebody who drops the triggers still cannot rewrite history undetected. There is a test that does exactly that and asserts `verify()` catches it.
- **Tamper-evident is not tamper-proof.** Administrators sit inside the trust boundary and are trusted; the log is evidence of what happened, not proof against an administrator who alters it. **That is the recorded position, and one of its three conditions is not met today** — see §5.3.

## And the rule that sits above all of it

**No claim-increasing reading is switched on without a chartered tax adviser.**

There are **twenty-four** CTA switches (`CB_CTA` / `CB_CTAQ`), every one built, both
readings coded and tested, and **every one defaulting to current behaviour**.
**Which way each moves money is written on its own "ON =>" line in `CB_CTA`**, and
those lines are the count. Most make a claim bigger, and that is exactly why none
may default to on. **`grant_after_ceilings`, `self_contained_flats_stop` and
`sl_landlord_contribution` can only make a claim smaller**, and they are off for the
same reason as the rest: off is today's behaviour. **`scottish_rate_from_main_home`,
`lease_premium_not_item9`, `ct_rate_from_associated_companies` and
`income_tax_taper_band` move money either way.** (This paragraph said nineteen until Phase 132, on 14 September 2026,
added `s33b_aggregation` — read by the engine's new `CB_S33B` module, which works out s.33B aggregation and
takes it into special rate only while that switch is on — `ct_rate_from_associated_companies`, `income_tax_taper_band`,
`window_company_member_date` and `sl_landlord_contribution`. It said eighteen until Phase 129b added `window_from_later_spend_period`,
which can only make a claim bigger, later on 13 September 2026. It said twelve and
nine until Phase 129a corrected it on 13 September 2026, after Phase 129 had added
five switches without it; it said eleven and eight until Phase 113j corrected it on
10 September 2026, and "eight" had been one out since 7 September.)

**Flipping one fails its branch-B assertion in harness Suite H. That failure is
the harness telling you a tax position has been taken. Answer it by updating the
harness deliberately — never by muting it.**

The count is **counted at runtime** by `09-app/engine/tools/verify-extraction.cjs`
and never quoted: it was ten until 7 September 2026 and several documents said
ten afterwards, eleven until 10 September 2026, twelve until 12 September 2026, seventeen until 13 September 2026, and nineteen until 14 September 2026.

---

# 7 · The evidence base — do not touch it, and know why it is there

**Consolidating deliverables is housekeeping. Deleting the evidence base would
destroy the thing that makes the build defensible.** These are not superseded by
this document and are not folded into it:

| What | Where | Who signs it off |
|---|---|---|
| **The twelve rulebooks** — the statutory rules registers A–I with their addenda, and the CTA switch table | `01-rulebooks/` | A chartered tax adviser |
| **The twenty code and test files** of the data layer and the behind-blocker work | `04-phase-work/phase3/`, `04-phase-work/phase9/` | The harness reads them; the tests are the evidence |
| **The policy documents** — the Governance Policies (Parts A to D, with the flagged draft additions at Part E) and the client-facing privacy notice, both as exports, and the client engagement letter. The seven DRAFT TEMPLATE `.docx` that sat beside the letter were archived by Phase 115 on 10 September 2026 once their content was carried into the pack | `08-monday-doc-exports/`; the letter in `06-commercial-and-governance/` | A solicitor and the data protection officer |
| **The six module specifications** | `02-modules-and-build-prep/Module-00` … `Module-05` | A chartered tax adviser |
| **The 219 governance exports** | `08-monday-doc-exports/` | The record of every decision, with its date |

**`Caprebate — Blockers & What Unblocks Them.html` in `00-START-HERE/` is not for
a developer** and is not part of this document's fold. It is the client-side
action list.

---

## What was folded into this document, and where each thing went

**Fifteen files, and the count was re-derived against the archive rather than
against any earlier list.** **Fourteen were archived by the fold itself** —
Phase 104 four, Phase 107 three, Phase 108 the seven below. **The fifteenth is
the retired Client Journey (FINAL)**, which was superseded on 3 September 2026,
was found to exist on disk nowhere at all, and was recovered from an attachment
on the developer handover pack by Phase 100 on 8 September. It is in the same
folder under a name that says it is retired. **So "fifteen" is right and "the
fold archived fourteen" is also right**, and anyone re-counting will find both.
Full detail: `_archive/superseded/README-phase108-supersession.md`.

| Archived here | What of it lives on, and where |
|---|---|
| `Caprebate — Wireframe & Build Spec.html` | **§2 of this document**, extended to the staff screens it never covered |
| `Caprebate — API & Data Provenance Map.html` | **§3.2**, with its instruction to fire the title register *“without thinking about it”* corrected |
| `caprebate-full-specification-v8.html` | The engine itself, and `02-modules-and-build-prep/Module-00` … `Module-05` |
| `data-sourcing-automation-blueprint.html` | **§3.2**. Its four-route vocabulary — *derived · confirm · ask · provide* — survives in the provenance thinking; its June 2026 costs are superseded |
| `Caprebate — Developer Build Order.md` | **§5**, block by block |
| `Caprebate-Developer-Brief.md` | **§1** (the actors and the use cases) and **§6** (DB-W1, the audit-log determination, the three-store boundary) |
| `Build-Prep-Report-Pack-and-Hand-off-Specification.md` | **§5.2 DS-W10.** The authoritative report template is `04-phase-work/phase9/surveyor-valuation-report-template-v2.md` |

**And two more, archived by CRM 10 of 10 on 12 September 2026, which are not part of the fifteen**:
they were the sources of a later layer, not design documents of the first build, so they are counted
apart.

| Archived here | What of it lives on, and where |
|---|---|
| `CapRebate - CRM.docx` — the full CRM requirements specification, version 1.0 | **The disposition table**, `09-app/CAPREBATE-CRM-DISPOSITION.md`, section by section and field by field; what was built is §1 UC-B9 to UC-B25 and UC-C10 to UC-C12, §2 `B13` to `B43` and `C11`, §3.1, and §5.5 |
| `CapRebate - CRM.1.docx` — the startup cut | **Part D of the disposition table**, for what it drops that still matters; its own sections map onto Part A. Full detail: `_archive/superseded/README-phase125-supersession.md` |

**Nothing was deleted. Everything is in `_archive/superseded/`, and where an
archived file disagrees with the running application, the application is right.**

---

*Compiled 9 September 2026 by Phase 108, board item 12984650346, from the running
code in `09-app/` and from the seven documents it archives. Every test figure was
re-derived by running the suite that produces it on that date, and every route in
§3.1 was read out of the router rather than carried forward from a specification.*

*The CRM folded in by CRM 10 of 10 on 12 September 2026: every route the code registers
checked against §3.1 by `03-app/caprebate-crm-fold-check.cjs`, every line reference in §4
checked against its name, and every figure in §4 re-derived by running it.*

*Brought up to date with Phase 132 on 15 September 2026. The signoff snapshot was refreshed from monday first,
by reads alone. Four §4 line references that had moved were corrected. What Phase 132 built was added: the switches
in §4, the always-on records and the migrations in §4 and §5.5, the case stamp and the defence pack action in §1,
the care regulator's header and PlanIt in §3.2, and the CTA switch count in §6. Every figure in §4 was re-derived
by running it.*
