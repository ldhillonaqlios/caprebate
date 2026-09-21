# Caprebate — the Administrator Guide and the User Guide

**A companion to `09-app/CAPREBATE-DEVELOPER-SPEC.md`. Written 12 September 2026 by CRM 10 of 10**,
closing rows 26.11 and 26.12 of the CRM disposition table — administrator documentation, and user
documentation with basic training material — which no phase carried until CRM 1 of 10 added them to
the last one.

**The Developer Spec says what the system is. This says how to use it.** Where the two disagree, the
running application is right, and the disagreement is a defect in whichever document says otherwise.

---

## Read this first — it is a prototype, and everything in it is invented

**There is no real client, person, property or document anywhere in this system.** The six
businesses in it are fictional, every postcode is from the `ZZ` range reserved for fiction, and every
login shares one known password. **Nothing leaves the building**: an email is written to the outbox
and labelled *not sent*, and no outside register or supplier is ever contacted. **It must not be put
on a public address, and no real client data may go into it**, until a developer has done the work in
Developer Spec §5.

**To open it for training**, from the `09-app/backend` folder:

```bash
npm install
npm run start:demo
```

It starts on `http://localhost:8105` with a fresh in-memory copy of the invented data, and forgets
everything when it stops — so a training session can do anything without harming the next one. Sign
in as any of these, all with the password `change-this-seed-password`:

| Sign in as | Role | What that person does here |
|---|---|---|
| `admin@example.invalid` | Admin | Users, settings, the switches a screen may show, the compliance registers |
| `sales@example.invalid` | Sales | Leads, organisations, properties, claims, tasks, documents, introducers |
| `accounting@example.invalid` | Accounting | Caprebate's own invoices and money — nothing else |
| `surveying@example.invalid` | Surveying | Their assigned survey jobs, and what those jobs reach |
| `client@example.invalid` | Client | Their own business, in the portal |

**There is no demo login for the view-only role.** READ_ONLY (Phase 132e) is assigned to nobody, so the demo data
has no such user; to try it, create one on Users and roles (A2).

**The client's accountant and every introducing firm have no login, ever** — they are contacts, not
users. So is the chartered tax adviser: their sign-off is a record Sales keeps, not a session.

## Six things that are true on every screen

1. **You see what your role may see, and nothing more.** A screen you may not open is refused, not
   shown with the figures blanked. A record that does not exist and a record that is not yours are
   refused in exactly the same words, on purpose — so nobody can find out what exists by guessing.
2. **"Not known" is an answer, and it is never treated as a yes, a zero or a pass.** A question
   nobody asked and a question answered "not known" behave the same way. Nothing on any form makes you
   guess to get past it.
3. **Nothing is deleted.** A task is cancelled with a reason, a claim that ends keeps its record, a
   list value is retired, a document version is never overwritten.
4. **Dates are shown in UK time**, and *overdue* means the due date is before today's date in the UK.
   A task with no due date is neither overdue nor on time.
5. **Every change is recorded** in an audit log that cannot be edited — who, what and when, never the
   words of a note or an amount.
6. **"Switched off" means built, tested and waiting for a named person's decision.** The screen says
   so, and no setting turns it on.

## The layout — the same on every staff screen (Phase 133a, 17 September 2026)

The screens were rearranged on 17 September 2026 so that each login has an easy layout of its own. **Nothing a role
may see or do changed** — only where things sit.

- **The header**, on every page: **Cap Rebate** (back to your home page), a **Search** box (the same search as `B41`),
  **Help**, and your **name**, which opens a small menu with **Your account** and **Sign out**.
- **The tabs under it are your role's, and only the screens you work in every day (Phase 135, 21 September 2026).**
  Lakhbir asked for tabs that do not repeat each other and a **More** menu that is not a dumping ground. So each role
  has a short row of tabs; **More** holds at most four entries, and is not shown at all when there is nothing for it.
  **The Tasks tab shows how many open tasks you have** — the number turns red when one is overdue. **No permission
  changed**: a screen that is not on your tabs still opens by its address, or from a link on the page that leads to it.

  | Role | Tabs | More |
  |---|---|---|
  | Sales | Home, Leads, Clients, Pipeline, Tasks, Introducers | Calendar |
  | Accounting | Home, Claims, Finance, Tasks | Introducer fees |
  | Surveying | Home, Survey jobs, Tasks | — |
  | Read only | Home, Leads, Clients, Pipeline | — |
  | Admin | Home, Leads, Clients, Pipeline, Tasks, Finance, Settings | Calendar, Introducers, Survey jobs |

  **Where the screens that left the tabs are now:**

  | You used to open | Now |
  |---|---|
  | Engaged clients, Organisations | **Clients** — one list of every company, name first |
  | Assessments | **Leads**, then **Filled assessments** at the top of the list |
  | Next actions | **Tasks**, then **Claims with no next step** at the top of the list |
  | Dashboard | **Home**, then **See the dashboard** |
  | Properties, Claims (Sales, Admin, Read only) | a company's page on **Clients**, the **Pipeline**, or **Search** |
  | Documents | a company's page on **Clients** (Documents tab) |
  | Users, Admin settings, Document types, Automation, Email templates, Compliance, Audit log, Reward model | Admin: **Settings**, one tile each. Admin settings is now the **Switches** tile, and Reward model is **Introducer fees** |
  | Settings in the menu under your name | **Your account** — the same page |

- **Home** (`B0`) opens with cards that answer "what do I do next" for your role, then **My tasks**.
- **A record page** — a claim, an organisation, a property or a lead — has four parts: a **highlights** strip of the
  key facts at the top; on a claim, the **stage bar**, which shows the ten stages with the current one filled in (a long
  stage name wraps onto a second line rather than being cut short) and,
  under it, whether the claim is **Ready** to move on or **Not ready yet** and the first thing still needed; three **tabs** —
  **Details**, **Related** (with a count) and **Activity**; and on the right, the **Next step**, the **Next action** and **Quick actions**
  (for example **Log a call or add a task**, **Request a document**, **Move the claim**), each a link to the form further
  down. Every panel the page had before is still there, in one of the three tabs.
- **Five long screens followed on the same day (Phase 133b).** The **business page** (`B6`), the **survey job**
  (`B8`) and **Finance** (`B9`) now open with highlights, tabs and the right-hand panel like a record page — their tabs
  are named for what is in them rather than Details, Related and Activity. **Admin settings** (`B43`) and **Document
  types** (`B29`) have a **list of sections down the left** instead: pick one and only that section shows. Nothing moved
  off any of them; each section is in a tab or the list. After you save something, the page opens on the tab or
  section you saved in.
- **The pipeline** (`B21`) is a board: one column per stage, a card per claim. On a phone the columns stack.
- **Claims and Leads** (`B17`, `B19`, `B42`) show the **Filter, sort and save** panel beside the list, and a column
  heading that is underlined sorts the list by it.
- **A screen your role may not open** now shows a page headed **You cannot open this page**, with your own tabs and a
  button back to your home page. Wherever this guide says a screen answers "not authorised", that is the page you see.
  A data address (one ending `.json` or `.csv`) still answers `{"error":"not authorised"}`.
- **Everything works without JavaScript**, with the keyboard (every link and button shows a clear outline when it has
  focus), and on a phone or a tablet.

### The Cap Rebate look, and a system a new user can pick up (Phase 133c, 17 September 2026)

**Nothing a role may see or do changed.** What changed is how the screens look and how they read.

- **The name.** Every page, the header, the footer, the client's portal and the emails say **Cap Rebate**, two words, as
  the brand book does. The sign-in page, the public pages and the portal show the Cap Rebate logo at the top left; the
  back office shows the name.
- **The colours.** White and a pale mint-grey (Mist) for the page; near-black (Cap Ink) for text, buttons and lines;
  Cap Mint only for emphasis — the tab you are on, the current stage, the top edge of a highlights strip or a welcome
  card. Mint never has white text on it. Red, amber and green still mean overdue, waiting and done, always with words.
- **The type.** Headings in a slab serif (Bookman Old Style, or the nearest your computer has), everything else in
  Calibri or its nearest, at 16 px. Figures line up in columns.
- **Dates.** Every date reads the British way: **24 Sep 2026**; a time **24 Sep 2026, 12:32**, or **Today, 12:32** /
  **Yesterday, 12:32** for a recent one. A due date says how far off it is — **Due in 3 days (24 Sep 2026)**, **Due
  today (17 Sep 2026)**, **3 days overdue (14 Sep 2026)** — counted in UK days. What is stored does not change, and a date
  box still takes a date the way your browser shows it.
- **Welcome.** The first time you open **Home** (or, for a client, the portal) a card headed **Welcome to Cap Rebate**
  shows the three jobs your login does most, as buttons. **Hide this welcome** removes it for good, on any computer.
- **Help.** **Help** at the top of every page opens this guide's training section for the screen you are on (Part 3),
  inside the system. A client's Help opens the guide's section on the portal, without the trainer's exercise.
- **The next step first.** On a claim, the panel on the right starts with **Next step**: either a button **Move to …**,
  or **Not ready yet**, the first thing still needed in plain words, and one button that deals with it (for example
  **Ask the surveyor**). **See everything this stage needs** opens the full list. A lead does the same for its enquiry
  checks. A stop is information, not a failure: nothing is shown in red because a stage is not ready.
- **Short fields, and "Why?".** A field shows only when something is recorded in it; one link, **Add missing details**,
  opens the form. An answer that is **not known** and decides something — an enquiry check, a claim's facts, the
  jurisdiction, the claimant type, whether allowances were claimed before — is always shown. The longer explanation
  that used to sit under a field is behind a small **Why?**.
- **Forms.** The fields most people need come first; the rest are under **More options**. **Every** field you must fill
  in says **(required)** beside its name, on every screen (Phase 133d). If a form is refused, the page you typed on comes
  back with **what you typed still there** — you do not start again — and the reason **beside the field it is about**,
  with that field outlined. That holds on every back-office form whose check is about one field: the ten used most (a
  task, the next action, a lead, an enquiry check, moving a claim, the claim's details, the organisation, a contact, a
  property and a document request, Phase 133d) and, since Phase 133e, finance, introducers, the claim's facts, grants
  and past owners, document types, automation rules, templates, admin settings, your own account settings, Create a
  user and the survey job. A refusal that is about no one field — a stage that is not ready yet, an invoice already
  sent, say — still shows at the top of the form. A screen reader also reads each required field's name with it: every
  label is joined to its field (Phase 133e).
  After a save, **Saved.** shows at the top of the page.
- **"The data this page was built from"** is shown to Admin only.
- **The client's six step names are built and switched off**, waiting on Lakhbir (**1 Your estimate**, **2 Engagement
  letter signed**, **3 We research your property**, **4 Expert sign-off**, **5 Claim filed**, **6 Aftercare**). Until
  they are switched on, this guide uses the names you see. *The menu names proposed beside them were settled by Phase
  135: Reward model is now **Introducer fees**; Engaged clients and Next actions are no longer menu entries at all.*

## Contents

| Part | For | What is in it |
|---|---|---|
| **1 · The administrator guide** | Admin | Users and roles, the settings, the rules and templates, the switches, the registers, the audit log |
| **2 · The user guide** | Every role, and the client | A working day for each role, and the words that mean something specific here |
| **3 · Training, one screen at a time** | Anyone learning a screen | For every CRM screen: what it is for, who opens it, the common job step by step, what it refuses and why, an exercise on the demo data, and questions to check yourself |

## Part 1 · The administrator guide

This part is for whoever holds the Admin login. It explains what each administrator screen is for, what it will and will not let you do, and why. Every button, field and message quoted here was read from the running demo on 12 September 2026, or from the code where a screen could not show it (that is said each time). The screens the CRM follow-on changed were read again after it, the same day.

Screens are named by their heading. The web address follows on a small "Address:" line, in case you need to type it.

---

### A1 · Before anything

**This is a prototype, and everything in it is invented.** The six businesses (Aldergate Care Group Limited, Brackenfell Dental Partnership LLP, Corvale Supported Living Limited, Dunmarrow Medical Practice Limited, Elverton Private Hospital Limited, Fenmoor Nursing Homes Limited) do not exist. Their people, properties, postcodes and figures are made up too. Do not put a real client, a real person or a real document into it. The foot of every page says: "Prototype build. No payment is taken anywhere in this system and no signature provider is connected."

**The demo data must never be loaded into a live system.** Loading it creates one login per role, and all five share a published password (`change-this-seed-password`). For that reason, the command that loads it refuses to run unless someone sets `CAPREBATE_ALLOW_SEED=1` on purpose. Without it, the command stops with *"refusing to seed: set CAPREBATE_ALLOW_SEED=1 to confirm this is not production"*. The demo launcher stops too, with *"refusing to run: this launcher seeds invented data with a known password"*. The setting exists so that nobody can load invented data with a known password by forgetting a flag. On a live system nobody should ever set it.

**Nothing leaves the building.**
- **Email goes to the outbox and stays there.** A message queued from a template, a notice from an automation rule, or a letter from a compliance register is written to the outbox. Nothing sends it. You can read the outbox at the foot of **Your account** (the menu under your name), under "The outbox — what would have been sent". Every row reads **NOT SENT**, and the page says: "NOT SENT — outbound email is stubbed in this build. The message was written to the outbox. Calendar invitations go the same way, for the same reason."
- **Nothing calls an outside register.** No connector to Companies House, the Land Registry or any other source exists. Running the research on a client records every source as not permitted yet, with the reason. The free lookups wait on a published privacy notice, and the paid ones wait on a signed engagement letter.
- **No money moves and nothing is signed.** The finance screen says "RECORDED, NOT COLLECTED". The letter's signing records a state, and no signature provider is contacted.

---

### A2 · Users and roles

**The six roles.** Five, and since Phase 132e (16 September 2026) a view-only login. Lakhbir: *"One main log in for admin/manager/owner, and another log for view only"*. ADMIN is the main login; there is no separate manager or tax-reviewer role.

| Role | Who it is for | What it reaches |
|---|---|---|
| **ADMIN** | The super user | Everything in the back office. It alone can create, re-role and disable users, change the administrator settings, record the compliance registers, switch the reward model, merge a firm and record a finance setting |
| **SALES** | The pipeline team | Filled assessments, the calendar, engaged clients, leads, the pipeline, organisations, properties and claims (with the claim's value), introducers (not the money), and tasks. It can **read** the automation rules, email templates, document types, the reward page and the admin settings, but cannot change them. It is refused Users and roles, and the compliance registers |
| **ACCOUNTING** | Caprebate's own finance | The finance screen, a claim's client, reference and money, a firm's name and money, the reward page (read only) and the dashboard. Nothing else: on the demo it was refused Users, Automation, Templates, Document types, Admin settings and Compliance |
| **SURVEYING** | The surveyor | Their own assigned survey jobs, and a claim or property only through such a job. Refused every administrator screen |
| **CLIENT** | A client business | Their own portal only. Signing in lands them on the portal, not the back office |
| **READ_ONLY** | Somebody who should see the work and change nothing — **nobody holds it until you give it to them** | Lands in the back office. Reads organisations, contacts one at a time, properties, claims **without their value**, leads **without the range shown**, the pipeline, the calendar and bookings, tasks, the timeline, documents that carry no value, the deliverables register, the dashboard's pipeline tiles and the settings screens. **Writes nothing** except changing its own password. **Never** sees our estimate, a claim's value or figures, a claim's tax facts, the survey workspace, invoices or any money (our fee is a share of the claim value, so a fee would reveal it), internal notes, paid research, the compliance registers, the identity store, the disclosure log or the audit log, and **cannot export** a list. Every rule has an explicit yes or no for it in the code, and a test fails if a new rule is added without one |

**A seventh role is defined and switched off, and you will not find it on this page.** Phase 129 built a data protection officer role that would reach the compliance registers and nothing else: not the audit log, not users and roles, not a claim, a document or the money. While it is switched off the role list does not offer it, and a forced assignment is refused: "a role is one of ADMIN, SALES, ACCOUNTING, SURVEYING, CLIENT, READ_ONLY". Whether it is ever switched on is Lakhbir's decision: *"Do we need a compliance role separate from Admin?"*

**Two people never get a login.**
- **The client's own accountant** is a contact, not a user. They receive the accountant's pack offline. The ACCOUNTING role is Caprebate's own finance staff, and giving it to a client's accountant would hand an outsider our fee ledger.
- **Anyone at an introducing firm.** The Introducers page says the people at a firm are "its contacts, and none of them has a login".

Address: /staff/users. The page heading is **Users and roles**; you reach it from Settings, under "Administration".

**Creating a user.** Fill in "Create a user":
- "Username — an email address"
- "Display name"
- "Role"
- "Business — for a CLIENT account only" (leave it empty for staff)
- "Initial password — at least 12 characters"

Then press **Create**. No welcome email is sent. The page explains that "the password is set here and handed over out of band", so give it to the person yourself.

**Changing a role.** Under "Change somebody's role", choose the new role and press **Assign**. The page warns: "A role change is a privilege change: every session that user holds is revoked at once, and they sign in again under the new role." Your own account is not in that list.

**Disabling.** Press **Disable** on the person's row. Their live sessions end straight away, not at their next sign-in, and after that their sign-in fails with the usual "those details did not match". The page has no button to switch an account back on.

**What an administrator may NOT do.** The page says it: "An administrator cannot change somebody's name, username or photograph — that is inside their account rather than about it, and a record edited that way reads as the person themselves." Each person changes their own details on their own Settings page. Nor may you change your own role or disable your own account. You cannot disable the last administrator either, because then nobody could ever create one again.

**Sign-in is rate limited.** Too many sign-ins for one address in a short time are refused with the same vague message. On the demo, the sixth quick sign-in as admin was refused. A signed-in session lasts at most eight hours.

---

### A3 · Admin settings (`B43`)

Address: /staff/admin-settings. The heading is **Admin settings**.

The page opens: "Configurable where it is a preference, fixed where it is a rule. … A value is retired, never deleted, and its code never changes."

**The five lists:** Lead sources · Priorities · Task types · Property types · Introducer types.
**The two reason lists:** "Why a lead is lost" · "Why a claim leaves the procedure".

Each value shows its Code, Label, State and, for the five lists, "Where it came from".

- **To relabel** a value, change the text in its label box and press **Save**. The code stays the same.
- **To retire** a value, change its state from "active" to "retired" and press **Save**. It stays on the record; it is simply no longer offered for new choices. On the demo, after Outbound was retired, the Leads page no longer offered it.
- **To add** a value, type a "Code" and a "Label" under the list and press **Add to lead sources** (or **Add to priorities**, **Add to task types**, **Add to property types**, **Add to introducer types**). For a reason list, press **Add a reason**.
  - A code is "capital letters, digits and underscores, starting with a letter — 2 to 60 of them. It never changes once saved."
- **Nothing is ever deleted.** Old records name these codes, so a value is retired instead.
- **Values the application writes itself cannot be retired.** Their row shows "written by the application — never retired" and the state "active — the application writes it", with no retire choice. If you try anyway, the answer is: "The application writes this value itself, so it is never retired."
  - Examples: the Website, Referral, Accountant, Adviser and Other lead sources, and the Normal priority.
- **The stages are not a list.** Asking to add one is refused: "The stages are the operating procedure's ten, each with its gate and its exits. A stage is never added, removed or reordered by a setting."

Below the lists, the page repeats (read only) the document types, the automation rules, how many templates there are, the finance settings and the compliance settings. Each carries a link to its own page, where it is changed.

**The settings that are refused by name and recorded.** At the foot, under "What a setting may not change", the page lists the settings below. Choosing one under "Ask to change one anyway" and pressing **Ask** changes nothing: you get a page headed "Not a setting" with the reason, and the attempt is written to the audit log. Listed as the page lists them:

| On the page | The reason it gives, in short |
|---|---|
| STAGE_GATE:ENQUIRY, :ASSESSMENT, :ENGAGEMENT, :DATA_GATHERING, :SURVEY, :VALUATION, :TAX_ADVISER_SIGNOFF, :REPORTS, :INVOICE, :DEFENCE_PACK | "A setting that could change a gate could step round it." |
| STAGE_LIST | The ten stages are never added, removed or reordered by a setting |
| FREE_REGISTER_GATE | Opens when the privacy notice is published — "one line of code, and not ours to turn" |
| PAID_REGISTER_GATE | "a signed engagement asserted on the server, and an operator's click. No setting stands in for either." |
| CTA_SWITCH: s185_plus_own_s25, urenco_provision_of, specialised_supported_housing, trade_not_s35, s187a_needs_entitled_owner, grant_traced_after_dwelling, connected_contributor_no_reduction, s538_carveout, s187a_6b_statements_route, fvr_requires_past_owner_claim, transaction_tax_in_base, grant_after_ceilings | "A tax adviser's switch stays off until a chartered tax adviser answers." |
| FEE_CONTROL:above_benefit, :break_and_abort (the minimum fee is no longer a control: decided none, Phase 132e) | "A pricing policy an admin screen could flip would be decided by whoever found the screen." |
| REWARD_MODEL | Switched on its own page, and refused there while clause 1 of the letter is blank |
| FEE_CLAWBACK | Clause 13's clawback, off until its three blanks are answered |
| FEE_TRIGGER | "When our fee is earned is Lakhbir's question, and the invoice stage waits on it in code." |
| AML_IN_SCOPE | A dated, sourced compliance setting, recorded on the compliance page, "never a general setting" |
| CLIENT_SHARE_GIVE | Waits on words the data protection officer agrees |
| REFERRAL_FORM | Waits on a published privacy notice |
| INVOICE_FRAUD_PROCEDURE | Lifting it "is a piece of work, not a setting" |
| QUOTE_GAP_REVIEW_PCT | The 15% review threshold is a constant, not a setting |
| RETENTION_PARAMETERS | "A retention period is the data protection officer's signature" |
| ROLE_BOUNDARY | The six roles and what each may do are fixed in code; a seventh is a question for Lakhbir |
| DOCUMENT_TYPE_RECEIPT_POLICY | Only a migration binds a receipt policy |
| DOCUMENT_TYPE_CARRIES_VALUE_UNSET | A value-carrying type is never marked as carrying none |
| FACT_KEYS, CAPTURE_SOURCES, PAYER_CLASSES | Each is a migration, not a list value |
| RECIPROCITY_KINDS | Reward model A's three kinds are never values on the task-type list |

---

### A4 · Document types (`B29`)

Address: /staff/document-types. The heading is **Document types**.

Each row shows: Type · From · Who may read it · Can carry a value · Receipt strip · Deletion clock · Active.

**What an Admin can change on a type:**
- **The label.**
- **"Who may read it"**, one of four groups:
  - *Claim evidence* (Admin, Sales, a surveyor on an assigned job, and the client)
  - *The claim team* (Admin and Sales, and the client whose document it is)
  - *Finance* (Admin, Accounting, and the client)
  - *The engagement letter* (Admin, Sales and the client; Accounting once it is signed; never a surveyor)
- **The deletion clock**: UNSET, or RET-7.
- **Whether the type is active or retired.**

Press **Save** on the row.

To add a type, use "Add a type": "Code", "Label", "Who may read it", "Can it carry a claim value, a tax benefit or a fee?" and "Deletion clock". Then press **Add the type**.

**What cannot be changed:**
- **Nothing is deleted.** A type is retired instead.
- **A type that can carry a value can never be marked as not carrying one.** Such a row offers only "can carry a value". Forced, the answer is: "a type that can carry a claim value, a tax benefit or a fee is never marked as not carrying one (N1)."
- **A type that can carry a value can never be claim evidence**, because a surveyor reads claim evidence and must never see our figures: "a type that can carry a claim value, a tax benefit or a fee cannot be claim evidence: a surveyor would read it (N1)."
- **The receipt policy is not on the page at all.** Only a developer's migration can bind one.

**Why a type with no receipt policy cannot be received.** Every client upload is run through a "receipt strip": it takes out what must not be kept, and the original file is then deleted with evidence. That strip is different for each kind of document. For a type with no strip written, the page says: "No receipt policy — so an upload of this type cannot be received. The link is refused before it is issued, and it cannot be requested."
- Of the twenty-five seeded types, eleven have a policy and fourteen do not; the fourteen include the engagement letter, accounts and Caprebate's fee invoice.
- A type you add has none either: "A type added here has no receipt policy, so it can be recorded and configured but not received."
- **Who decides a policy: the data protection officer**, under the open question *"Which receipt strip should each new document type carry before anyone may upload one?"* Then a developer binds it with one migration.

The clock RET-7 reads "DERIVED, NOT APPROVED — the data protection officer has not signed it, so no deletion date is computed."

**A recommended strip for each of the fourteen is recorded, and it changes nothing on this page.** Phase 129 wrote one recommendation per type, each with a one-line reason, for the data protection officer to approve or amend:
- **keep whole** the five we produce: the engagement letter, our fee invoice, the survey report, the capital allowances report and claim documentation;
- **remove the individuals and keep the figures** on six: the completion statement, a valuation, accounts, a tax computation, a contractor's invoices and plans;
- **do not accept as uploads** survey photographs, correspondence and "other".

Every one of the fourteen still reads "No receipt policy" and still cannot be uploaded or asked for. That stays true when a recommendation is approved, until a developer's migration binds the policy.

---

### A5 · Automation rules (`B25`)

Address: /staff/automation. The heading is **Automation rules**.

"A trigger and an effect. Every rule that matches an event writes a run — it ran, or it did not and why."

**The five triggers:**
- A lead is created
- A claim enters a stage (one stage, or "any stage")
- A document is requested
- A task is completed (one activity, or "any activity")
- An owner changes — of a claim, a lead or a task

**The five effects:**
- A task, from the rule's template
- A follow-up date — a follow-up task, due in the days the rule gives
- A notice to the owner — written to the outbox, and not sent
- Information-request tasks — one per fact the derived missing list says nobody has asked for
- A document request to the client — of a type something can receive, saying why and what it holds up

Nine rules come seeded. Each has a **Change** link; to stop one, set "Active" to "no — retired". Rules are not deleted.

**The forbidden effects, and why.** The page lists them at the top: "What no rule may do. Each is refused by the store with its reason, not missing from a form":
- No rule may open the free register gate. It opens when the privacy notice is published, and the switch is the engine's, not a rule's.
- No rule may open the paid gate. It is a signed engagement letter asserted on the server, and an operator's click.
- No rule may record a signature.
- No rule may move a claim. A move asks the stage's gate, and a person asks for the move.
- No rule may record a confirmation a gate reads — that would move a claim past its gate by another door.
- No rule may flip a tax adviser's switch.
- No rule may fire a register call. / No rule may run the research. — "The operator picks the moment, not the calls."
- No rule may send anywhere but the outbox — "A notice is written there, and nothing leaves the building." The page says it once; an email, a text message and a web hook are each still refused by name.
- No rule may write to an organisation marked do not contact.
- No rule may create an invoice email.
- No rule may chase an invoice or a payment.
- No rule may send our bank details, or change them.

The reason behind all of them: a rule runs without a person looking. Anything that moves a claim past a check, speaks to a client or touches money must stay a human decision.

**Reading what each rule did.** At the foot, "What the rules did" lists every run: When · Rule · Event · About · Result. The result is "ran — 1 task", or the reason it did not run. On the demo it read "No rule has run yet." until a lead was recorded.

**A rule that asks a client for a document.** The effect "A document request to the client" is on the form, along with "Document asked for, for "a document request"". The code's rules for it are:
- It may ask only for a type that has a receipt policy.
- Its "Task" box holds *why we need the document*, and "Task description" holds *what it holds up*. The client reads both.
- It may not be triggered by "A document is requested", because it would then ask for ever.

**Saving it.** Choose the document under "Document asked for, for “a document request”" and press **Save the rule**. On the demo, a rule labelled *Ask for the lease when data gathering starts* — "A claim enters a stage", Data gathering, "A document request to the client", the lease — was saved, and listed as "A document request to the client — of a type something can receive, saying why and what it holds up". With no document chosen it is refused: "Choose the document the rule asks the client for." *(Until the CRM follow-on, on 12 September 2026, the screen dropped the chosen document, and every such rule was refused.)*

---

### A6 · Email templates and the outbox (`B26`)

Address: /staff/templates. The heading is **Email templates**.

**Merge fields.** The page lists them: "{{contact_name}} {{organisation}} {{property_address}} {{claim_reference}} {{next_action}} {{due_date}} and no others."
- A merged value is escaped, so nobody can slip code into an email.
- A value nobody recorded "shows as a gap in square brackets", never as a blank.

**Refused content.** "Never bank details, never an invoice. A template carrying either is refused — the invoice email waits on the invoice-fraud procedure." In practice a template is refused if its label, subject or body carries:
- the word invoice, or remittance, a fee note, a statement of account, or an amount due or outstanding;
- a sort code, an account number, an IBAN, bank details, or anything **shaped** like a sort code, account number or IBAN;
- payment details, a bank transfer, or where to pay;
- the **tipping-off words**: money laundering, suspicion, the National Crime Agency, the nominated officer, due diligence, tipping off. Nothing a client reads may suggest anyone suspects them.

The message reads "A template may not carry [what it found]. Bank details are never sent from a template, and the invoice email waits on the invoice-fraud procedure." A merge field outside the six gets: "“{{first_name}}” is not a merge field. The merge fields are …".

**Where queued messages are seen.** A template is used from a claim, under "Email a contact from a template" → **Queue to the outbox**. It then appears at the foot of **Your account**, under "The outbox — what would have been sent" (When · Kind · Subject · Sent), marked **NOT SENT**. An organisation marked do not contact is refused: "This organisation is marked do not contact. Nothing was queued — the outbox refuses it."

**Nothing is sent**, by anything, in this build.

---

### A7 · Finance settings and the fee controls (`B9`/`B10`)

Address: /staff/finance. The heading is **Finance**. Accounting and Admin can open it; only Admin may record a setting. On the demo, Accounting's attempt was refused with "not authorised".

**Dated values with a source.** Section "6 · The finance settings" shows each setting with the value In effect, From (the date) and Source:
- Caprebate's VAT position
- the VAT rate charged, while registered (**Not set**)
- the VAT registration threshold
- where the warning starts, as a share of the threshold
- a single expected fee large enough to check on its own

The form says: "A new value is a new row, with the day it takes effect and where it came from. Nothing is changed in place." Its fields are "Setting", "Value — pounds, a share such as 0.75, or REGISTERED / NOT_REGISTERED", "Takes effect" and "Source", and the button is **Record the setting**. A value with no source is refused: "Say where the value comes from — a document, a page and the day it was read."

**Our fee is a flat 3% of the allowances identified** (5% until Phase 132e, 16 September 2026), with no bands and no minimum.

**The fee controls ship off.** Section "5 · The fee controls, and what the engagement letter says" shows:
- our fee above the client's first-year saving — off;
- **a minimum fee — "none — decided"**: the switched-off control that stood here is retired, because Lakhbir decided there is no minimum fee;
- **a multi-site discount — discretionary, never applied automatically**: how large it may be and who approves it are "NOT DECIDED";
- the break fee and the abort fee — off.

Each names the question it waits on. No screen turns them on; they are switches in code (see A10). There is no minimum job size at all: "Lakhbir decided so on 1 September 2026".

**A multi-site discount is recorded, never applied.** On a claim, `POST /staff/claims/{id}/fee-discount` (Admin or Sales) records a discount as a share of our fee with the reason. The claim page's **A multi-site discount** panel lists it as **AWAITING THE DECISION** on the largest discount and who approves it. No invoice changes because of it, and nothing asks for a ceiling, because none is decided.

**Blanks in the engagement letter are shown BLANK.** The break fee (clause 5) and the abort fee (clause 4) each read "BLANK IN THE ENGAGEMENT LETTER", with the clause's own placeholder quoted. **The payment terms are no longer blank** (Phase 132e): clause 4 reads "within 14 days of the date of the invoice", so an invoice raised today is due in 14 days — "within 14 days of the invoice, as clause 4 states". If the terms were ever blank again, the due date would read **UNSET**, and an invoice with no due date is never counted as overdue. The page gives the reason: "A term in the engagement letter is BLANK, and it is shown blank on purpose. A plausible number in a prototype becomes a number in a contract."

**Nobody should type a number to fill a gap.** No field on the screen takes an invoice amount, a fee or a letter term, and that is deliberate. The answers belong to the people who own those decisions, and a guessed figure would quietly become a contract term.

---

### A8 · The reward model, and merging a firm (`B32`, and a firm's page)

Address: /staff/introducer-rewards. The heading is **The introducer reward model**.

It reads "It is Off — nothing is offered to an introducer." Three models are built and all ship off:
- **Model A:** no cash, but firm-level reciprocity (a CPD session, a co-branded one-pager, priority turnaround).
- **Model B:** a fixed, disclosed fee per successful claim, paid to the firm and never to a person. Nothing is payable until its disclosure to the client is recorded.
- **Model C** (Phase 132e): **10% of our fee as actually invoiced**, to a registered accountancy firm that referred the claim — Lakhbir's answer. It accrues when our fee invoice is raised (never on a quote or an estimate), and if the fee is reduced under clause 13 a **reversing entry** is written; nothing is edited or deleted. Whether the client must be told, and how, is on the solicitor's list.

"Which, if either, is Lakhbir's decision: “Is anything paid to the accountant?”"

**Switching.** Admin alone sees "Switch it": choose a "Model", enter "Model B's fee per successful claim, in pounds" and press **Save**. Accounting's view of the page has no switch. The switch "refuses to leave off while clause 1 of the engagement letter is blank", and the page quotes clause 1 as it still reads. On the demo, both A and B were refused with the heading "The reward model did not change".

"Fees to introducers" lists model B's fees. On the demo it said "No fee has accrued to any firm.", so the controls for recording a disclosure and a settlement could not be seen. By the rules, Admin or Sales records the disclosure, and Admin or Accounting marks a fee settled, never before the disclosure.

**Merging a firm.** Address: /staff/introducers/… (the firm's own page).

If the same firm has been recorded twice, open the copy's page. Under "Merge this firm onto the one it really is", choose "The firm it really is", fill in "Why these are the same firm" and press **Merge**. Admin only.
- **What moves:** its leads, its people and its open tasks.
- **What does not move:** a client's yes to sharing progress with the copy (it does not become a yes to the other firm), its closed tasks, its notices, and any fee.
- **A firm with a fee cannot be merged** until the fee is dealt with on the firm it accrued to.

---

### A9 · The compliance registers (`B33`–`B39`)

Address: /staff/compliance. The heading is **Compliance**.

**Admin only.** "ADMIN holds this section today only because no other role can. There is no data protection officer role … Nothing here is reachable by Sales, Accounting, Surveying or a client."

**The one-person limitation.** Every register page carries this banner — the landing page, each register, S2, a contact's consent history and the retention list: "KNOWN LIMITATION — ONE PERSON TODAY. The procedures have the data protection officer decide and the controller countersign. There is no data protection officer role in this application and one Admin login types both names, so nothing here checks that two people were involved. The names typed are a record of what was said, not a control." In other words, the two-person check the procedures require is not enforced; one login can type both names.

**Two things built beside the registers, both switched off.** A *data protection officer role* (see A2) would hold these registers and nothing else, so the officer could keep them without being able to add a salesperson or read the whole audit log. While it is off, the one-person banner stays true. A *per-disclosure log* would record each time a client's data goes to a recipient — the surveyor, the tax adviser, the client's own accountant, HMRC, or one of our processors — with when, which data, the lawful basis and who recorded it. It has no screen yet, records nothing while it is off, and never says "none" when the truth is that nothing is kept.

- **Due diligence** (Address: /staff/compliance/aml). **Switched off.** "OFF — nothing here blocks a claim. The register can still be kept. Whether it must be is with the accountant and a solicitor." You can still record the nominated officer, the firm-wide risk assessment and checks. Company ownership data pulled from Companies House "does NOT stand for beneficial ownership" without a separate, dated decision.
- **Rights requests** (/staff/compliance/rights). A person's request about their data, logged with one clock per right it engages (Art 15, 16, 17, 18, 21, 22A–22D). The deadline is **worked out each time you look, never stored**, and the arithmetic is printed. Where the law reads two ways, Caprebate works to the earlier date.
- **Complaints** (/staff/compliance/complaints). Classified on receipt, including whether it is a s.164A complaint, with an "Acknowledge by" date read from the date received.
- **Breaches** (/staff/compliance/breaches). "Categories and counts, never names." The 72 hours are counted from the recorded moment of awareness. The description is refused if it carries bank details.
- **S2 — the identity store** (/staff/compliance/identity). **There is no list.** "No list of names. A person is opened by person_ref, and every opening is audited. Every name search is logged, term and all." It is never exported and never searched by anything else.
- **Consent history** (/staff/compliance/consent/… for one contact). One history per contact: being contacted, marketing ("the box is never ticked for anyone"), and sharing progress with a referring firm ("never asked — nothing is shared").
- **Retention** (/staff/compliance/retention). "A list, not a deleter. Nothing here deletes anything." Every clock is UNSET or "DERIVED, NOT APPROVED", so no deletion date is computed, and no delete is offered anywhere.

**The settings on the landing page** are dated and sourced: "Customer due diligence is in force" (Off) and "The insurance position" (No policy in force). A new value is recorded with **Record a new dated value**, and needs a value, a "Takes effect" date and "Where it comes from".

---

### A10 · The switches no screen opens

Each of these is built, tested and **shipped off**. None has a screen that turns it on. The admin settings page refuses each by name (A3). Changing one is a change to the code, made only once the person named below has answered.

| Switch | Where it is in code | What it does while off | Who decides, in plain words |
|---|---|---|---|
| **The free register gate** | `CB_REGISTRY.precondition` (`enabled: false`) — `09-app/engine/src/generated/shared.js`, about line 2899. This file is generated from the site file, so the change is made there and re-extracted, never in `generated/` | No free register lookup is permitted | Whoever publishes the privacy notice and links it from the address question. The code's own words: "a published privacy notice reachable from the address question" |
| **The twelve tax adviser switches** | `CB_CTA` — `09-app/engine/src/generated/shared.js`, line 262. The names are listed in A3 | Each claim is worked out on today's reading. Nine of them would make claims bigger | **A chartered tax adviser**, one question at a time |
| **The engagement fee gate** (found in the engine; not on the brief's list) | `CB_GATE_CONFIG` (`enabled: true` since Phase 132e, `jobs_per_year: 120`) — in the engine | **On, but it decides nothing yet**: no costing is injected, so every case is undetermined and no figure is withheld. The back office never quotes a fee to a client, and an earned fee is never withheld from an invoice by it | Lakhbir decided "Yes" and "120"; the costing is still an estimate |
| **Break-even counted as too little profit** | `FUNNEL_SWITCHES.breakeven_is_insufficient_profit: false` — `09-app/backend/src/web/funnel-session.ts:216` | "Roughly break-even", "not sure" and never asked all read the same | The tax adviser: "Is 'roughly break-even' enough profit for the relief to bite on?" |
| **The public referral form** | `REFERRAL_FORM` (`enabled: false`) — `src/web/introducers.ts:180` | The page does not exist: it answers as an unknown address | Whoever publishes a privacy notice telling a referred client what a firm passed to us |
| **A client saying yes to sharing from the portal** | `CLIENT_SHARE_GIVE` (`enabled: false`) — `src/web/introducers.ts:1089` | Clients can withdraw a yes in the portal but not give one; staff record a yes after asking | The data protection officer, by agreeing the words: "What must a referred client be told before we share their claim's progress with the firm that referred them?" |
| **The fee controls** (two) | `FEE_CONTROLS` — `src/web/fee-controls.ts`: `above_benefit`, `break_and_abort`, each `enabled: false`. The minimum fee is no longer a switch: `MINIMUM_FEE_DECISION` records it decided none (Phase 132e) | The fee is not capped or adjusted, and no break or abort fee | A pricing decision. The code names the open questions ("Do we cap the fee, warn about it, or adjust the percentage?", "What is the break fee, and is there ever an abort fee or a fixed fee?") but not a person |
| **Clause 13 fee clawback** | `FEE_CLAWBACK` (`enabled: false`) — `src/web/claim-record.ts` | A reduced claim raises nothing, and the audit says why | Answered (a) yes, and the time limit is now in the letter ("for so long as the claim remains open to enquiry"). Still waiting on clause 13's other two blanks — the trigger and settlements |
| **The fee trigger** — decided | `FEE_TRIGGER` (`reading: 'REPORT_DELIVERED_FOR_FILING'`, `decided: true`) — `src/web/pipeline.ts` | Our fee is earned when our report is delivered for filing, to the client or their accountant: read from the deliverables register (the client report or computation pack issued, on its issue date). Nothing issued means not reached | Decided by Lakhbir (Phase 132e). Nothing here says Caprebate files the return or signs the filing position |
| **The invoice-fraud procedure** | `INVOICE_FRAUD_PROCEDURE` (`in_force: false`) — `src/web/automation.ts:124` | No invoice email and no chasing email can exist | Signed off by the solicitor, the data protection officer and the developer. Even then, the invoice email is **new work**, not a flag |
| **The data protection officer role** | `DPO_ROLE_SWITCH` (`enabled: false`) — `09-app/backend/src/authz.ts:1089` | Nobody can hold the role, and a forced assignment is refused | Lakhbir: "Do we need a compliance role separate from Admin?" |
| **Company names kept on conveyancing uploads** | `CONVEYANCING_STRIP` (`enabled: false`) — `src/web/conveyancing-strip.ts:64` | Every party read off a sale contract or the pre-contract enquiry replies is kept only as its role, such as [SELLER] — companies included | The data protection officer: "May company names stay on conveyancing uploads if we strip the individuals?" |
| **The per-disclosure log** | `DISCLOSURE_LOG` (`enabled: false`) — `src/web/disclosure-log.ts:61` | Nothing is recorded, and who has received a client's data reads NOT KEPT, never none | The data protection officer and the solicitor, by signing off the list "Who we pass client personal data on to" |
| **The recommended receipt strips** | `RECEIPT_RECOMMENDATIONS` (`approved: false`) — `src/web/receipt-recommendations.ts:65` | Nothing changes: even approved, a type is received only once a migration binds its policy | The data protection officer: "Which receipt strip should each new document type carry before anyone may upload one?" |
| **Customer due diligence in force** — the exception | *Not a code constant.* `AML_IN_SCOPE` is a dated setting read by `src/web/compliance.ts` (`amlInScope`, about line 216) | Nothing blocks a claim. **Left off by Phase 132e** after Lakhbir's "we need to do AML check on every client": on, no claim could leave Engagement without a finished check, which blocks work. Keep a check for every client on the register now, with it off | The accountant and a solicitor: "Is AML supervision legally required for this business?" **Unlike the rest, an Admin can record a new dated value on the Compliance page** (demo-tested with a future date). It must only be recorded once that written answer exists, with the answer as its source |
| **The reward model** — also an exception | Switched on its own page (B32), and refused there while clause 1 of the letter is blank — models A, B and, since Phase 132e, C (10% of our fee as invoiced) | Nothing is offered to an introducer | Lakhbir: "Is anything paid to the accountant?" |

---

### A11 · The audit log (`B45`)

**What is recorded.** A line for each thing that happened, giving the kind of event, when, who (as an id and a role), what it was about (as an id) and the outcome, ALLOWED or REFUSED. Among them:
- sign-ins, failed sign-ins and rate limiting;
- users created, roles assigned (from and to) and users disabled (with how many sessions ended);
- rule, template and setting changes, and refused settings;
- emails queued, document reads (allowed or refused), identity-store reads and searches;
- the refused reward-model switch.

**What is never recorded.** A log line never holds a name, an email address, a note's words or an amount. The log refuses such details rather than blanking them out.

**Append-only and hash-chained** (`src/audit.ts`). The database has triggers that stop any row being changed or deleted. Each row also carries a fingerprint (sha256) of itself plus the row before it, so removing or editing a row breaks the chain. That makes it tamper-evident, not tamper-proof: administrators are inside the trust boundary.

**Who reads it.** Admin alone, from **Audit log** in the menu. Every other role is refused with "not authorised". The page lists the newest 200 lines that match, newest first — # · When · Kind · Role · Who (id) · About · Outcome — and never what a line says in detail: "What a line says in detail is never shown here, and is not read to draw this page: a kind, the ids and the outcome are the record." Narrow it with **Kind** and **Outcome** and press **Show**. "Reading this page is itself a line in the log." The activity timeline on a claim, organisation, property or lead page shows part of the same record, in words, to whoever may read that page.

Address: /staff/audit

**How to check the chain.** The top of the page says it on every visit — on the demo, for example, "The hash chain: Intact: all 9 entries recomputed from the genesis, each linked to the one before it." If a row had been changed outside the application, it names the entry where the chain breaks instead. **Without the server**, a developer runs `npm run verify-audit` in `09-app/backend` against the database file. It recomputes the whole chain, writes nothing, and prints "audit log intact: … entries, every hash recomputed from the genesis and every link to the previous entry checked." — or "AUDIT LOG BROKEN at entry …", and fails. `test/audit.test.ts` and `test/follow-on.test.ts` prove both answers. *(Until the CRM follow-on there was no page and no command, and only the tests ran the check.)*

---

### A12 · When something is refused

A refusal takes one of three forms.

1. **An address you may not open.** A page headed **You cannot open this page** — "Your login does not give access to it. That is the system working as it should, not a fault." — with your own tabs and **Go to your home page**. It names nothing about what was asked for. This is what Sales sees at Users and roles, and what anyone sees at a record that is not theirs. (Until 17 September 2026 it was the bare words `{"error":"not authorised"}`; a data address ending `.json` or `.csv` still answers that way.)
2. **A form the rules will not accept.** A page with a short heading ("Not created", "Rule not added", "Template not saved", "Type not changed", "Not merged", "Not a setting"…), the reason in one sentence, and "Go back". Nothing was saved.
3. **An address that does not exist at all.** `{"error":"not found"}`.

**Why "not found" and "not yours" look the same.** A record that exists but is not yours, and a record that does not exist, both answer "not authorised". On the demo, Surveying got the same answer for a real claim not on their job and for a made-up one. If the two answers differed, someone could try addresses one after another and learn which clients and claims exist. Sign-in works the same way: an unknown address and a wrong password both get "those details did not match".

---

## Part 2 · The user guide

> **Before you start.** Caprebate is a working prototype. Every business, person, property and figure
> in it is invented, and no real client data may be put into it. Every step below was checked on
> 12 September 2026 against the demo build started with its seeded data. The demo holds its data
> in memory, so restarting it puts everything back as it was.

**Signing in.** Open the **Sign in** page, type your **Email** and **Password**, and press **Sign in**.
If something is wrong the page does not say whether it was the address or the password — that is
deliberate. Staff land on their **Home** page; a client lands on their own claim page.

Address: `/login`

**The menu.** Since 17 September 2026 each role has its own tabs along the top, and they show only the screens that
role can open — see *The layout* near the start of this guide. A screen that is not in your tabs is still refused if
you type its address: you see **You cannot open this page**. That is the system working.

**Every time on the screens is UK time**, and "today" always means today's date in the UK.

---

### U1 · Sales — a working day

**1. Start on the landing page.** After signing in you are on **Home** (Address: `/staff`). Four cards come first:
**My next actions**, **Today and overdue**, **My pipeline by stage** (each stage opens its column on the board) and
**New leads**. Below them:
- **My tasks** lists what you own and what is waiting with your team, overdue first. The line above
  it counts them, for example "1 overdue." Each task has **Start** and **Complete** buttons.
- **My claims, their next actions, and who is waiting** lists the claims you own, each with its next
  action, its due date, and who the claim is waiting on — for example "waiting on us: 16 facts are
  still missing and nobody has asked for them".
- **Documents you asked a client for that have not arrived** and **Other questions you are waiting on
  a client to answer** appear when you have something outstanding.
- **Claims nobody owns that break the one-next-action rule** (Sales and Admin) lists each open claim
  with no owner, and what is wrong with it — on the demo, "CR-2026-0002 (Brackenfell Dental
  Partnership LLP) — This claim has no next action. … — give it an owner, then its next action".
- **All my tasks** takes you to the full Tasks screen.

**2. Work your leads.** Open **Leads** (Address: `/staff/leads`). A lead is anything that might become a
claim: a filled assessment, a call asked for, or a referral. There is no lead score, and a lead
never carries a person's name — people are recorded as contacts on the organisation.

*Recording a lead by hand.* At the foot of the list, under **Record a lead by hand**, either choose
**An organisation already recorded** or type **Or the organisation's name**. Then choose **Where it came from
(required)**. Under **More options** are **Its sector**, the **Next action** (it becomes a task on the lead, yours to
own) and its **Due** date. Press **Record the lead**.

*The four enquiry checks.* Open the lead. Under **The enquiry gate** there are four checks:
1. The property is healthcare property in the UK — England and Wales at launch, Scotland second, Northern Ireland third.
2. The client is a trading business — commercial means the client, not the building, so supported living is in.
3. The enquirer is the owner, or acting with the owner's authority.
4. There is no existing claim conflict.

The table's columns are **Check · Answer · Last recorded · What we already hold**. The panel on the right says
**Next step** — **Not ready yet** and the first check still needed, with **Record the check**. For each check, choose
the **Check** and the **Answer** (**Yes**, **No** or **Not known**), add a **Note** if it helps, and press **Record the
check**. "Not known" is a proper answer, but it does not pass. A check nobody has recorded reads exactly the same:
**Not known** (its **Why?** says "not known — and a check that is not known does not pass").

*Qualifying and converting.* When all four checks are a recorded Yes, go to **Change the lead**, set
**Status** to **Qualified** and press **Save**. A box headed **Convert — this opens the claim** then
appears, with the button **Convert and open the claim** (and **Next step** on the right links to it). Converting checks the four answers again,
opens the claim at the Assessment stage, and closes the lead as the record of where the claim came
from. You cannot pick "Converted" as a status. A referral whose business has not yet taken the
assessment cannot convert until it is linked to the organisation the assessment creates.

**3. Organisations, contacts and properties.**
- **Organisations** (Address: `/staff/organisations/{organisation}`): change details under **Change these**
  and press **Save**. Some facts come from a better source, such as the Companies House record. Those
  show where they came from and have no box to type in. **Referred by** names the firms whose
  referrals became the organisation's leads — "read from the organisation’s leads, never typed here".
- Under **Contacts**, the **Add a contact** form (button **Add contact**) records a person: a
  decision maker, the finance contact, the client's accountant or an adviser. None of them ever gets
  a login.
- Setting **Client status** to **Do not contact** is a control, not a label: nothing can be queued to
  that organisation.
- **Add a property** takes a **Name of the site or building** and a **Postcode** (button **Add property**).
- On a property (Address: `/staff/properties/{property}`), use **Change the property** and **Save**. A
  previous owner or occupier is a company name or a role, never a person's name. Leave the price
  blank if it is not known — nought is refused. **Open a claim for** plus **Open claim** starts
  another claim on the same building, at the Enquiry stage.

**4. Moving a claim through the ten stages.** Open a claim (Address: `/staff/claims/{claim}`). The **stage bar** under
the highlights shows the ten stages in order — Enquiry, Assessment, Engagement, Data gathering, Survey, Valuation, Tax
adviser sign-off, Client report and accountant report, Invoice, Defence pack — then Closed, and says **Moving on from
…: Ready** or **Not ready yet** with the first thing still needed. **Next step**, at the top of the panel on the right,
is the quickest way: **Move to …** when the claim is ready, or the thing still needed and the button that deals with
it. On the **Details** tab, **Stage and moves** holds every move; **See everything this stage needs** opens the full
list, each need marked **Done** or **Still needed**. What each gate asks for, in plain words:

| To leave… | …the system needs |
|---|---|
| Enquiry | all four enquiry checks recorded as Yes, on the claim or on its lead |
| Assessment | an assessment on record for the organisation |
| Engagement | a signed engagement letter, checked by the system itself |
| Data gathering | the election question resolved in the facts panel, and a recorded confirmation |
| Survey | the surveyor's own figures committed on a survey job on this claim |
| Valuation | every grant or contribution traced to what it paid for, and a recorded confirmation |
| Tax adviser sign-off | a sign-off record made while the claim is at this stage |
| Client report and accountant report | the sign-off; both reports issued; the client's acceptance and the accountant's confirmation — **or, where the client has no accountant or tax adviser, the client's own written confirmation** (Phase 132e: they will file the amendment, the last day to amend as we state it, and that they remain responsible for the filing position; any of the three not a yes keeps it shut, and a client with an accountant on record goes the accountant's way); the amendment window open |
| Invoice | the amendment window open; the fee trigger reached — **our report delivered for filing** (Phase 132e); our fee invoice raised on this claim and not credited in full |
| Defence pack | the defence pack issued in the deliverables register — the claim then closes |

Under **Move the claim**, press the **Move to …** button. When the claim is not ready the button itself
says so, for example **Move to Assessment (not ready yet)**. The system checks the gate every
time, whatever the page showed. A refused move shows **Not moved** and the reason at the top of the form, for example:
- "A claim moves one stage at a time, through each stage's gate. From Assessment the next stage is Engagement."
- "Not ready to move on from Engagement yet. Still needed: A signed engagement letter, asserted on the server — the engagement letter is sent and not yet opened and is not signed."

A move is also refused if the claim would be left without a next action with an owner and a due
date. You can name one as you move: fill in **…and name the next action after it**. The other
moves are:
- **Close the claim here** (the record is kept): choose **Exit to** and a **Reason**. The claim is never deleted.
- **Put on hold**: give a **Hold reason**. A held claim resumes only at the stage it left.
- Only an Admin can reopen a claim, and always with a reason.

**5. One next action per claim.** Every open claim has exactly one next action, with an owner and a
due date. Set it under **Next action and tasks** → **Set the next action**: fill in **What happens
next**, **Owner** and **Due**, then press **Set as the next action**. The previous next action stays
as an ordinary task. The **Change the claim** form does not set the next action.

**6. Tasks.** Every organisation, property, claim and lead page has an **Add a task** form: **Task (required)**,
**Owner** and **Due**; under **More options**, **Description**, **Activity**, **Or the team it waits with**, **Priority**
and **Repeats on completion**; then **Add the task**. If it is refused — no title, say — the page comes back with the
reason at the top of the form and everything you typed still in it. On a claim there is also the tick box **Make this
the claim's next action — it needs an owner and a due date**. A task with no due date is allowed; it
shows as having no due date, never as on time. A task is never deleted. On its own page, **Cancel it
— a task is never deleted, so say why** takes a reason and the button **Cancel the task**.

**7. Documents, and asking a client for one.** On the claim's **Related** tab (or **Request a document** under
**Quick actions**), the **Documents** panel lists what is
linked to the claim and the **Requests**. To ask the client for a document:
1. Under **Ask the client for a document — it goes to their portal, and only a type with a receipt policy can be asked for**, choose the **Document**.
2. Fill in **Why we need it** and **What it holds up**, and a **Due** date if there is one.
3. Press **Request it**.

The request is marked received only when the client's upload of that type passes the checks. There
is no button for it. A request made in error can be taken back with **Withdraw — asked in error**
while it is still open. **Documents** in the menu lists every document you may read, across every
organisation and claim (`B44`).

**8. Introducers, referrals and sharing progress.** **Introducers** (Address: `/staff/introducers`) lists
the firms that refer clients. None of their people ever has a login.
- **Record a referral** takes the firm, the person referring, and the client business's name and basics. It creates a lead with the firm as its introducer.
- **Add a firm** adds a firm on its own.

On a referred lead, the section **The introducer, and sharing progress with it** asks: "Does the
client want progress shared with the firm?" Read the client the words shown, choose **Their answer**
(Yes, No or Withdrawn), and press **Record the answer**. Until the client says yes, nothing about the
claim goes to the firm, and "never asked" counts exactly as no. Each notice that falls due is listed
under **Notices to the firm**, as queued or not queued, with the reason.

**9. The claim's record: facts, figures, sign-off, deliverables and aftercare.**
- **The claim's capital allowances facts**: each fact shows where it came from. To add one, choose the **Fact**, choose **Answer** (**This value** or **Not known**), give the **Value** and **Source**, then press **Record the fact**. Grants are added with **Record the grant**; the payer is a class such as "The NHS", never a name. Previous owners are added with **Record the owner** — "a company or a role, never a person".
- **The four figures**: A the indicative estimate, B the researched estimate, C the surveyor's committed figure, D the figure the tax adviser signed. Nothing here is typed; each is read from the record that sealed it.
- **The sign-off** is a record, not a signature. It can only be made while the claim is at the tax adviser's sign-off stage.
- **The deliverables register** tracks the five deliverables, and **Start a draft** begins one. The system never writes a report. A client report cannot be drafted before the sign-off is on record.
- **Aftercare** holds **HMRC enquiries** (**Record an enquiry**), **Clause 13 — the fee on a reduced claim** (switched off), and **The election on a future sale**.

**10. Search, lists, saved views and export.**
- **Search**: type at least two characters and press **Search**. The page lists what it searched and what it did not.
- On **Claims** or **Leads**, open **Filter, sort and save**, choose filters, and press **Show** (or **Clear**).
- To keep a set of filters, type a name in **Save these filters as** and press **Save view**. It appears under **Saved views**, and **Retire** removes it.
- **Export these N rows as CSV** downloads the list with only the columns you may read, and the export is recorded.

**11. Emailing a contact.** On a claim, **Email a contact from a template**: choose **Template** and
**To**, then press **Queue to the outbox**. Nothing leaves the building: the message waits in the outbox,
marked NOT SENT, and you can read it at the foot of **Your account** under **The outbox — what would have
been sent**.

**12. Where the claim came from, and its team.** At the top of a claim, **Came from** and **Source**
say how it began — its lead, or "no lead — this claim was opened by staff on a property" — and
**Introducer** names the firm that referred it, if one did. **The claim team** shows the **Owner**,
the **Surveyor**, the **Tax adviser** as their sign-off record ("never as a person"), and the
organisation's own accountant and adviser on this claim. To add one, choose them under **Add to the
team** and press **Add**; **Take off the team** removes one, and the record stays. Only a contact
recorded on the organisation as its accountant or adviser can join, and nobody on the team has a login.

---

### U2 · Accounting

**What you see.**
- **Home**: three cards — **Invoices due and overdue**, **Fees waiting to be invoiced** and **The VAT position** — then tasks waiting with Accounting, such as "Record the part payment against the invoice when it arrives".
- **Dashboard**: the money tiles only.
- **Finance**.
- **Claims**: the reference and the client; the value reads "not shown to this role".
- A claim's page: its **Documents** (the fee invoice and the signed letter only), **Money** (the claim's own invoices), and an activity timeline of "Financial events only". A claim at the invoice stage also shows **Our estimated fee** — the fee the finance view expects — until our fee is raised.
- **Documents**: the documents Accounting may read, across every claim, and no others.
- **Search**: claim references and invoice numbers.
- **Introducers**: each firm's name with **Fees invoiced** and **Fees paid**.

**What you do not see, by design.** The client's answers, internal notes, our estimate, the business
page, organisations, properties, leads, the pipeline, and claim evidence such as a lease. Opening
any of those gives a refusal rather than an empty page.

**Raising our fee.** Open **Finance** (Address: `/staff/finance`). Claims ready to invoice appear under
**3 · Claims at the invoice stage with no invoice raised**, each with a **Raise our fee** button.
You never type an amount: the fee comes from the tax adviser's signed figure through the fee rules.
The VAT comes from Caprebate's recorded VAT position, and the invoice number is the next in one
unbroken series. On the demo this section lists CR-2026-0008 (Dunmarrow Medical Practice Limited)
with an expected fee of £4,935 (3% of £164,500; it was £8,225 at 5%). Its **Earned on** column gives the day our
report was delivered for filing, and the due date an invoice raised that day would carry; a claim with no report
delivered reads **NO DATE** — never today. What a refusal looks like:
- "Our fee is raised on a claim at the invoice stage, and this claim is at Survey." (seen on the demo)
- "No figure signed off by the tax adviser is on record for this claim, and our fee derives from it. Nothing is raised."
- A claim that has left the procedure is refused as well.

**Sent or cancelled.** Open an invoice from **4 · The claims' invoices** (Address: `/staff/finance/{invoice}`).
- **Record that it was sent**: give **Sent on** and press **Record as sent**. Invoices go by hand, by post or as the client asked — never as an email from this system. A date still to come is refused.
- **Cancel — raised in error, and not sent**: give **Why** and press **Cancel the invoice**. A sent invoice is refused: "A sent invoice is not cancelled — it went to the client, so it is credited, with a credit note." A cancelled number is never reused.

**Credit notes.** A credit note is the only way a raised amount changes. Under **Credit notes — the
only way a raised amount changes**, give **Why it is credited in full** and press **Credit what is
left in full**. **Apply clause 13** (a fee recalculated on a reduced claim) is switched off, and the
clause is blank in the letter.

**Recording money received.** Money is recorded, never collected: there is no card processor and no
bank feed.
1. Under **Record money received**, give **The day it arrived** and **The amount that arrived, in pounds**.
2. Answer **Did the client confirm our bank details on a channel other than email?** — or leave it at "not asked".
3. Press **Record what arrived**.

You cannot record more than is owed: "That is more than this invoice still asks for (£9,000).
Record what arrived against what is owed, and nothing more." A wrong entry is voided with a reason
(**Void**), never deleted.

**Overdue, and why a due date can be unset.** Since Phase 132e the engagement letter's payment terms
read "within 14 days of the date of the invoice", so an invoice is due 14 days after its date and is
overdue the day after that. Were the terms blank, its due date would read "UNSET — clause 4 of the
engagement letter leaves the payment terms blank, so no due date is set and none is assumed", and an
invoice with no due date is never counted as overdue, and never as on time either.

**VAT monitoring.** **2 · VAT monitoring** shows:
- the threshold (£90,000) with its date and source;
- the warning margin (75% of the threshold);
- the rolling twelve months;
- the thirty-day test;
- any single fee of £25,000 or more.

**Run the VAT check** reads these figures. When they are inside the warning margin it raises one
task for Accounting, never a second. It never changes an invoice. The finance settings themselves
are Admin's to change.

**The dashboard's money tiles.** **Estimated fees in the pipeline** and **Invoiced, paid, outstanding
and overdue**. On the demo they read: invoiced £45,000, paid £20,000, outstanding £25,000, overdue £0
on 0 invoices, with the note that 2 open invoices have no due date.

**Export.** On **Claims**, **Export these 8 rows as CSV** gives you the columns Reference, Client and
Opened. You cannot export leads. A filter on a column you cannot read, such as the stage, is not
applied to the file, and the page says so beside the link: "The file does not apply stage — not
columns you read."

---

### U3 · Surveying

**What reaches a surveyor.** Only what an assigned survey job reaches:
- **Survey jobs** — on the demo, "3 jobs you can open. 2 awaiting your figures.", each with its **Stage** in the procedure's own words (Survey, Invoice);
- the properties and claims of those jobs only (3 shown);
- your own tasks.

Organisations, leads, the pipeline, finance, introducers and export are refused. On a claim page
you see the stage and its steps, the claim's owner and surveyor, your own tasks, the facts your survey needs (never an amount, the
tax position or our figures), and a timeline limited to your job.

**Our estimate is never in your session.** It is not hidden on the screen — it is not in the data
your session receives at all. The job list says: "Our estimate is not on these pages until your
figures are in." It is released automatically the moment you commit your own figures, with nobody
to ask.

**The workspace** (Address: `/staff/survey/{job}`) opens with a highlights strip — sector, stage, when the job was
opened, rooms counted, rates recorded, whether **Your figures** are in, and whether **Our estimate** is *withheld* or
*released* (never the figure). On the right are **Quick actions** — **Commit your figures** (or, once committed,
**Amend your figures**), **Record the room counts** and **Record what the client told you** — and the **Our estimate**
panel. The job from your home page's card opens straight on **5 · Your figures**. It has six tabs, one per numbered
section:
1. **1 · The property**, and **What the client told us** — "I don't know" and skipped answers are shown as such.
2. **2 · The room schedule, and the quantities** — a count for each room type, with **Record**.
3. **3 · The rates**.
4. **4 · The evidence** — the register data held, the documents uploaded, and **What your pack is still waiting on**.
5. **5 · Your figures** — the figures, the rates (each with the tick box **I looked at this field**), and **On what basis did you reach these?**, which is required. Press **Commit my figures — this releases our estimate to me**. If a client has read our figure to you, record it under **If the client has told you our figure** with **Record it**; that costs you nothing.
6. **6 · The record** — every event, chained so that nothing can be quietly removed. Each attempt to open the estimate before commitment is kept as its own line.

**Your tasks.** **My tasks** on the landing page and on **Tasks** — on the demo, "Check the floor plans
against the room schedule", due 2026-09-18. Use **Start** and **Complete**.

**Your dashboard** has one tile, **My survey jobs**. Each job shows its stage, for example
"CR-2026-0004 · Survey · waiting for your figures". No figure of ours is on it.

---

### U4 · The client, in the portal

After signing in, the client sees their own claim page, headed with their business's name
(Address: `/portal`). Since 17 September 2026 it opens with a **stage bar** of the six steps below, and a card, **What
we are waiting for from you**, listing each question and each document we have asked for (each a link down to its
form), or "Nothing — we are working on your claim". **Since Phase 133c the order is**: **Book a call** and **Who to
contact** at the top, then **How to contact us**; the stage bar; **The range you were shown**, with its basis
underneath; **What we need from you**; **Questions we still need answered** and **Documents we have asked you for**;
**What happens at each step** (the long explanations, behind **Show each step**); then the rest. It shows:
- **The range you were shown**, marked indicative;
- **What happens at each step**, in plain words, with the current step marked (was **Where your claim is**);
- **What we have issued to you**;
- **The firm that referred you** (only for a referred client);
- **Your engagement letter**;
- **Your appointment**;
- **Questions we still need answered**;
- **Your account**;
- **Documents we have asked you for**;
- **Documents**.

**Your appointment — change it or cancel it, at any time** (Phase 132e). Under **Change or cancel this call** the
client sees, in this order: other times (a new time must be at least two hours away), **None of these work — ring me
instead** (the time is given back and we ring them), and **Cancel this call**. There is no notice period for the call
they already hold — they may move or cancel it minutes before, or after it has passed. A cancelled call stays on
record: the portal says "You cancelled this call on …", the back office's **Calendar** lists it under **Cancelled
calls** with who cancelled it and when, and **the enquiry stays open** — nothing about the lead or the claim changes.
A cancelled call cannot be moved or given a time again; arrange a new call with the client.

**Answering a question.** Each question says **Why we are asking** and **What it holds up**. Type an
answer in the box, or tick **I don't know**, then press **Send this answer**. "I don't know" is a
proper answer: it is stored as the client not knowing, and the fact goes back on the list of things
still to find. A blank answer is refused: "write an answer, or tick “I don't know”". Afterwards the
page shows "✓ do you own the freehold or hold a lease — answered “I don't know”".

**Uploading a document.** Under **Documents we have asked you for**, press **Get an upload link for
this document**. To send one we did not ask for, use **Send us a document** → **What is it?** → **Get
an upload link**. You never type a file name — "We name the file ourselves, so nothing personal is
kept in its name."

The next page, **Your upload link is ready**, has **Choose the file**: pick the file and press **Send
the file**. The link works once, and expires. Sending with nothing chosen answers **Not accepted** —
"no file was attached. Choose the file and send it again."

When the file arrives and passes the checks, the reply reads: "The file has passed the receipt strip,
the original has been deleted from quarantine, and the request it answers is marked received." The
request then shows as "✓ … received, version 1". There is no button to say you have sent something:
the upload itself is what marks the request received. The link works once only. Nothing you send
replaces an earlier version, and **what we did with it** shows each step. Asking for the original
back answers "That file no longer exists, by design".

**Documents we have issued to you.** **What we have issued to you** lists an issued reasoned negative,
an issued s.203 notification, and a client report once its figure is released — each with its
version and date, and never a figure. On the demo it reads "Nothing has been issued yet."

**Stopping progress being shared with the firm that referred you.** Under **The firm that referred
you** the page says, for example, "Yes — we tell Quarrendon Invented Tax LLP how your claim is
progressing." It shows the exact words you agreed to, and a button, **Stop telling … how my claim is
progressing**. Press it and the page reads "No — we tell … nothing about your claim." Saying yes from
the portal is switched off for now: "You cannot turn this on from your portal yet. If you would like
us to keep the firm informed, tell us and we will ask you properly."

**Your account.** **Change your password, name or username** opens **Your account**, with **Save the name**,
**Change the username** and a password form.

---

### U5 · Words that mean something specific here

- **"Not known" versus never asked.** "Not known" is an answer somebody recorded; "never asked" means
  nobody has recorded anything. The system treats them identically: both read "not known" and
  neither opens anything. Nobody is made to guess.
- **Overdue, by the UK date.** Something is overdue when its due date is before today's date in the
  UK, and the page says so in words: "16 days overdue (1 Sep 2026)" (the count moves with the date). Something with no due date is
  never overdue and never on time: "no due date — so it is not overdue, and it is not on time either".
- **A gate.** The check the system makes, every time, before a claim may leave a stage. Shut means at
  least one need is not met, and the move is refused with the reason. The button on the page is a
  courtesy, not a key.
- **An exit.** A claim leaving the procedure early — for example "Declined at enquiry", "Reasoned
  negative report" or "Lost" — always with a listed reason. The record is kept, never deleted; only
  an Admin can bring it back.
- **A hold.** A pause at one of the ten stages, always with a reason. The claim resumes at the stage it
  left, and nowhere else.
- **The outbox, "NOT SENT".** Email is not connected in this build. Anything "sent" is written to the
  outbox and marked NOT SENT. Nothing leaves the building.
- **"Switched off".** Built, but deliberately not in use until a decision is made, with a named question
  behind it. Examples: the public referral form, the introducer reward model ("Off — nothing is
  offered to an introducer"), clause 13, the fee controls, and saying yes to sharing from the portal.
  Off means today's behaviour.

---

## Part 3 · Training, one screen at a time

**Every block below has the same six parts**: what the screen is for, who can open it, the common job step by step with the real labels, what it refuses and why, one exercise on the demo data with the result that was actually seen when it was run on 12 September 2026, and questions to check yourself. **Open the demo fresh before each exercise** — `npm run start:demo` forgets everything when it stops — and remember that sign-in allows only a few quick attempts per address, so a trainer switching roles should sign out rather than retry a password.

**The screens are in order of their screen id**, the same ids the Developer Spec uses in its §2, so a trainer and a developer can point at the same screen.

### Training — `B0` the landing page

**Phase 135, 21 September 2026 — shorter tabs.** The header no longer has an "open tasks" link: the count is on the
**Tasks** tab. The dashboard is no longer a tab: **See the dashboard** is a button on Home. Each role's tabs are in the
table at the top of this guide. *Observed on a freshly started demo, 21 September 2026:* Sales' tabs read Home, Leads,
Clients, Pipeline, Tasks 9, Introducers, with **More** holding Calendar, and the 9 is red (3 overdue). Accounting's read
Home, Claims, Finance, Tasks 2, with **More** holding Introducer fees. Read only has four tabs and no **More**.

**What it is for**
The first page every staff member sees — **Home**. It answers "what do I do next" for your role: a row of cards
first, then your own work in one place — your tasks, overdue first, the claims you own and who each is waiting on,
and anything you are waiting on a client for.

**Who can open it**
Admin, Sales, Accounting, Surveying and Read only. A client who tries is refused (a client lands on the portal
instead). The cards differ by role, and each card is drawn only for a role that may open the screen it comes from:

| Role | Cards |
|---|---|
| Sales | My next actions · Today and overdue · My pipeline by stage · New leads |
| Accounting | Invoices due and overdue · Fees waiting to be invoiced · The VAT position |
| Surveying | Waiting for your review and figures · All your survey jobs |
| Admin | Users · Settings and switches · Recent audit events · Refused |
| Read only | The pipeline by stage · New leads |

Address: `/staff`

**How to do the common job**
1. Sign in. You arrive on **Home**, which says "Signed in as …" and what the page holds for your role.
2. Read the cards. A heading that is a link opens the screen behind it; a stage on **My pipeline by stage** opens its column on the board.
3. Read **My tasks**. The line above the table counts what is overdue, and overdue tasks come first. The number on the **Tasks** tab says the same, and turns red when one is overdue.
4. Press **Start** on a task you are beginning, and **Complete** when it is done.
5. Read **My claims, their next actions, and who is waiting**. Where it says "waiting on us", the next move is yours.
6. Check **Documents you asked a client for that have not arrived** and **Other questions you are waiting on a client to answer**, if they appear.
7. Sales and Admin: read **Claims nobody owns that break the one-next-action rule**, and give each claim an owner, then its next action.
8. Use **All my tasks** for the full list, and **See the dashboard** for the management figures (`B40`).

**What it will refuse, and why**
- A client signing in and opening this address is refused (**You cannot open this page**): the back office is for staff.
- Anyone not signed in is sent to the **Sign in** page.
- The landing page never widens what you may open. Each screen checks your role again, and the tabs show only what your role can open.
- Admin's **Recent audit events** card reads the audit log, so each visit to Admin's home is itself recorded as a reading of the log, exactly as opening **Audit log** is.

**Try it on the demo**
Sign in as Sales. *Observed on 17 September 2026* (the overdue count moves with the date; since Phase 135 it is the number on the **Tasks** tab): the header read "8 open tasks, 2 overdue". **Today and overdue** reads 8 open, 2 overdue, 0 due
today. **My tasks** reads "2 overdue."; the first row is "Call to talk through the range they were shown" on
CR-2026-0001, "16 days overdue (1 Sep 2026)". "Chase the documents the signed letter asks for" reads "no due date —
so it is not overdue, and it is not on time either". Further down, **Claims nobody owns that break the
one-next-action rule** starts "CR-2026-0002 (Brackenfell Dental Partnership LLP) — This claim has no next action."
Now sign in as Accounting: the tabs are Home, Finance, Claims and Tasks, the cards are about invoices, fees and VAT,
and the unowned-claims list is not on its page. Its **My tasks** shows "Record the part payment against the invoice
when it arrives", "waiting with Accounting — nobody has taken it".

**Check yourself**
- *A task shows no due date. Is it late?* — No. It is neither overdue nor on time; give it a date if it matters.
- *A task says "waiting with Accounting". Who does it?* — Anyone in that team. It stays on the team's landing page until somebody takes it.
- *As Sales, there is no Finance tab. Could you open Finance by typing its address?* — No. The tabs show only what your role can open, and the address itself is refused with **You cannot open this page**.

---

### Training — `B5`/`B6` engaged clients and the one client page

**Phase 135, 21 September 2026 — one Clients list.** "Engaged clients" and "Organisations" were two lists of the same
companies, each opening the same page. They are now one list, **Clients** (`/staff/clients`), a tab for Sales, Admin and
Read only. Each row leads with the **company's name** (its legal name and sector in small text under it), then **Waiting
on**, **Status**, **Owner** and **Claims**. **Waiting on us first** puts the companies waiting on us at the top; **A to Z**
sorts by name. The old address `/staff/organisations` brings you here.
- **Read only** can now open the list. It shows company, status, owner and claims; **Waiting on** is not shown, because it
  is built from the research and the questions, which Read only may not read.
- The columns the old list carried — engagement letter, research, questions with the client, still missing, and whether
  the accountant and surveyor packs are ready — are on the company's page: the highlights, and the **Waiting on** card on
  the right.
- *Observed on a freshly started demo, 21 September 2026, as Sales:* "6 companies. 5 waiting on us, 0 waiting on the
  client." The first row is **Aldergate Care Group Limited**, waiting on Us — "the engagement letter is drafted and has not
  been sent". As Read only: "6 companies.", four columns, and Fenmoor Nursing Homes Limited's status reads Do not contact.

**Phase 134, 18 September 2026 — one page per company.** A company used to have two pages: this one and the
organisation page. It now has one, at `/staff/clients/{company}`, and the old organisation address opens it.

**Where things are now**
- **The heading is the company's name**, with its legal name in small text underneath where it differs.
- **Claims** — one tile per claim: the property, its town, the stage, the next action, and the claim reference as a
  small grey label. Press the property's name to open the claim. The claim opens with "Company › Property" at the top,
  so you can always get back to the company.
- **Tabs**: **Timeline** (tasks, everything that has happened with the company across all its claims, and internal
  notes), **Questions to the client**, **Still missing**, **Their answers**, **Research**, **Contacts**, **Properties**,
  **Documents** and **Details**.
- **A note or a question can say which claim it is about.** Choose it under **About which claim?**, or leave
  "The company in general".

**Who can open it now:** Admin and Sales see all of it. The view-only login sees the company's record — Timeline,
Contacts, Properties, Documents and Details — and not the research or the notes. Accounting and Surveying are refused.

**Try it on the demo** (as sales@example.invalid, on a freshly started demo, 18 September 2026)
- Open **Clients** (before Phase 135, **Organisations**) and choose **Elverton Private Hospital Limited**. *Observed:* the address becomes
  `/staff/clients/…`; the highlights read Claims 3, Status Active, Owner nobody yet, Waiting on Us, Engagement letter
  signed; three tiles read **main site** (Survey, CR-2026-0005), **main site** (Enquiry, CR-2026-0007) and **outpatient
  annexe** (Enquiry, CR-2026-0008); the tabs read Still missing 16 and Research 12.
- Press **outpatient annexe**. *Observed:* "Elverton Private Hospital Limited › outpatient annexe" at the top, the
  heading is the company's name, and "Claim on outpatient annexe, Nowhere Town CR-2026-0008" under it.
- Back on the company, add a note, choose the annexe under **About which claim?** and press **Save note**. *Observed:*
  "Note saved. The client cannot see it." and the note's **About** reads "outpatient annexe CR-2026-0008".

**Check yourself**
- *Where do you find everything said to a company with three claims?* — On its one page, under **Timeline**.
- *What is the grey CR number for?* — Quoting on the phone. It is never the name of anything.

*The rest of this section was written by Phase 133b and describes the tabs before Phase 134; the four working panels
behave exactly as it says.*

*Written by Phase 133b on 17 September 2026, which found no training block for these two screens. The exercise was run
on a freshly started demo that day and the results below are what it showed.*

**What it is for**
Everybody who has come through the assessment, and, for each, the one page where the work before the survey is done:
what the client told us, which research sources have run, what is still missing and who it is waiting on, the questions
put to the client, and internal notes.

**Who can open it**
Admin and Sales work here. Since Phase 135 Read only may open the list (without **Waiting on**) and, since Phase 134, a
company's page without the research or the notes. Accounting, Surveying and the client are refused the list, every business
page and every action on it (paid research can carry the purchase price). Admin and Sales read and write internal notes.

Address: `/staff/clients` · one business: `/staff/clients/{business}`

**Where things are**
The list is one table, sorted by **Waiting on us first** (Phase 135). The business page opens with a highlights strip —
**Sector**, **Stage**, **Waiting on**, **Engagement letter**, **Research** and **Still missing** — then five tabs, one
per numbered panel: **Questions and answers**, **Sources** (with how many are outstanding), **Still missing** (with the
count), **Tasks** (the questions asked) and **Notes**. On the right: **Quick actions** — **Run the research**, **Ask for a
missing fact** and **Add a note**, each shown only when that control is on the page for you — and **Waiting on**, in a
sentence.

**How to do the common job**
1. From **Clients**, open the company.
2. Read **Waiting on** on the right. If it is **Us**, choose **Ask for a missing fact** (or the **Still missing** tab).
3. On a row, either press **Send to their portal** (with a due date if there is one), or open **Answer it here**, type
   what the client told you — or tick **They said they do not know** — and press **Record it**.
4. The page opens on the **Tasks** tab with the question listed. A question asked in error is withdrawn there with
   **Withdraw — asked in error**.
5. **Run the research** is on the **Sources** tab. It fires everything outstanding; there is no button per source, and
   only a source that failed can be retried.

**What it will refuse, and why**
- Running the research more often than the limit allows: the button is replaced by "Cannot run the research right now."
- Withdrawing an answered question: "answered — an answer is not withdrawn".
- Paid sources before a signed engagement, and free sources before the privacy notice is published: not consulted, and
  their facts stay on **Still missing** as questions. Nothing on the page can open either gate.

**Try it on the demo** (as sales@example.invalid, on a freshly started demo)
- **Engaged clients** read "6 in the pipeline. 5 waiting on us, 0 waiting on the client, 1 on neither." (17 September 2026; since Phase 135 the one **Clients** list reads "6 companies. 5 waiting on us, 0 waiting on the client.")
- Open **Corvale Supported Living Limited**. *Observed:* the highlights read Sector "supported living", Waiting on "Us",
  Engagement letter "signed", Research "not run", Still missing "16 facts"; the tabs read Sources 12, Still missing 16,
  Tasks 0, Notes 0; the quick actions are Run the research, Ask for a missing fact and Add a note.
- On **Still missing**, press **Send to their portal** on the first row ("when did you buy the property, and for how
  much"). *Observed:* the page opens on **Tasks** with "The question is in the client’s portal." and the Tasks tab
  reads 1. Still missing still reads 16 — the fact is asked, not answered.

**Check yourself**
- *The client answered on the telephone. Do you send them the question anyway?* — No. **Answer it here**; the record
  says you entered it on their behalf.
- *Where is the button to run just the Companies House lookup?* — There is none. The operator picks the moment, not
  the calls.
- *A question was sent to the wrong client. Delete it?* — No. **Withdraw — asked in error**; the fact goes back on
  Still missing and the record says who took it back.

---

### Training — `B7`/`B8` the surveyor's workspace

*Written by Phase 133b on 17 September 2026, which found no training block for these two screens. The exercise was run
on a freshly started demo that day and the results below are what it showed.*

**What it is for**
A surveyor's own jobs, and on each the six steps of a desktop survey: the property and what the client said, the room
counts, the rates, the evidence, **your own figures**, and the record. **Our estimate is withheld until you commit your
figures** — not hidden on the screen, but absent from what your session receives — and released automatically when you
do.

**Who can open it**
Surveying, Admin and Sales. A surveyor sees only jobs assigned to them and is refused anyone else's; only the assigned
surveyor commits. Accounting, Read only and the client are refused.

Address: `/staff/survey` · one job: `/staff/survey/{job}`

**Where things are**
Described in full under U3. In short: highlights (with **Our estimate** reading *withheld* or *released*); six tabs,
**1 · The property**, **2 · Rooms**, **3 · Rates**, **4 · Evidence**, **5 · Your figures**, **6 · The record**; and on the
right, **Quick actions** and the **Our estimate** panel. A job opened from your home page's card opens on **5 · Your
figures**.

**How to do the common job**
1. On **Home**, open a job under **Waiting for your review and figures**.
2. **Record the room counts** (the **2 · Rooms** tab): type a count, 0 where there are none, and press **Record**. An
   empty box means not counted.
3. On **5 · Your figures**, give the four figures, tick **I looked at this field** for each rate you actually looked at,
   say **On what basis did you reach these?**, and press **Commit my figures — this releases our estimate to me**.
4. The page opens on **5 · Your figures** with our estimate beneath your figures. **Amend your figures** is now the
   quick action; an amendment needs a reason, and your original figures are kept.

**What it will refuse, and why**
- A commitment without a method: the form requires it — a figure with no stated basis is not evidence.
- A job not assigned to you: "This job is not assigned to you, so you cannot commit figures on it."
- An amendment without a reason: refused; an unexplained change after release cannot be told apart from anchoring.

**Try it on the demo** (as surveying@example.invalid, on a freshly started demo)
- **Home** → **Dunmarrow Medical Practice Limited** under **Waiting for your review and figures**. *Observed:* it opens
  on **5 · Your figures**; the highlights read Rooms counted "0 of 8", Rates recorded "0 of 10", Your figures "not yet",
  Our estimate "withheld"; the quick actions are Commit your figures, Record the room counts and Record what the client
  told you.
- On **2 · Rooms**, record 6 on the first room type. *Observed:* "Recorded.", the page opens on Rooms, and Rooms counted
  reads "1 of 8".
- On **5 · Your figures**, commit £120,000, £400,000, £30,000 and 22 with the basis "From the floor plans and the room
  counts." *Observed:* "Your figures are recorded and our estimate has been released to you."; Our estimate reads
  "released", **Our estimate, now released** is on the tab, and the first quick action is now **Amend your figures**.

**Check yourself**
- *The highlights say "withheld". Can Admin tell you the figure?* — Admin can see it, but it is not yours until you
  commit; asking for it defeats the measurement, and an attempt to open it is recorded.
- *There are no plant rooms. Leave the box empty?* — No. Type 0. Empty means not counted.
- *You spot an error after release. What now?* — **Amend your figures**, with the reason. The original stays beside it.

---

### Training — `B9`/`B10` the accounting view

**What it is for**
Caprebate's own money, and nothing else: our fee on each claim, whether it has been raised, sent,
credited and paid, what is outstanding, and the VAT position. It is a record of what somebody saw,
never a way of taking money — "Nothing tells this system that a transfer arrived: a person who has
seen the bank records it here."

**Who can open it**
Accounting and Admin, and nobody else. Sales and Surveying are refused the page, every invoice and
every action. The finance settings form is Admin's alone.

Address: `/staff/finance` · one invoice: `/staff/finance/{invoice}`

**How to do the common job**
**Where things are (Phase 133b, 17 September 2026).** The page opens with the totals in a highlights strip and six tabs: **Money** (section 1), **VAT** (2), **Invoices** (3 and 4), **Fee controls and firms** (5 and 7), **Settings** (6) and **Earlier invoices** (8). The numbered headings are unchanged. Your home page's **Fees waiting to be invoiced**, **Invoices due and overdue** and **The VAT position** cards open the page on sections 3, 4 and 2.

1. **Raise our fee.** On the **Invoices** tab, under **3 · Claims at the invoice stage with no invoice raised**, press **Raise our fee** on the claim's row. There is no amount to type: the fee comes from the tax adviser's signed-off figure, and the invoice takes the next number in the series.
2. Open the invoice by its number under **4 · The claims' invoices**, on the same tab.
3. **Record that it was sent**: give **Sent on** and press **Record as sent**. Invoices go by hand, by post or as the client asked — never as an email from this system.
4. **A credit note**: under **Credit notes — the only way a raised amount changes**, give **Why it is credited in full** and press **Credit what is left in full**. The amount is whatever is left, never typed.
5. **Money received**: under **Record money received**, give **The day it arrived** and **The amount that arrived, in pounds**, answer the bank-details question (or leave it "not asked"), and press **Record what arrived**.
6. Read **The money — read, never typed**: invoiced, credit notes, received and outstanding are all worked out, never typed.

**What it will refuse, and why**
- A claim not at the invoice stage: "Our fee is raised on a claim at the invoice stage, and this claim is at Survey."
- No signed figure: "No figure signed off by the tax adviser is on record for this claim, and our fee derives from it. Nothing is raised."
- Sent on a future day: "An invoice is recorded as sent once it has been — not on a day still to come."
- Cancelling a sent invoice: "A sent invoice is not cancelled — it went to the client, so it is credited, with a credit note."
- A credit with no reason: "Say why the invoice is credited." Crediting a second time: "This invoice is already credited in full."
- More than is owed: "That is more than this invoice still asks for (£4,000). Record what arrived against what is owed, and nothing more." No amount: "Give the amount that arrived, in pounds."
- Clause 13: "No clause 13 credit note is issued: switched off — …"
- **No typed amounts.** Raising and crediting have no amount box, and an amount sent anyway is ignored.
- **The due date is 14 days after the invoice date** now that clause 4 states it; it would read UNSET only if the payment terms were blank again.
- Sales or Surveying opening or posting anything here: refused ("not authorised").

**Try it on the demo** (as accounting@example.invalid, on a freshly started demo)
- **Raise our fee** sent for CR-2026-0004 → **Not raised**, "… this claim is at Survey".
- Open CB-000001. **Sent on** 2026-09-30 → refused. 2026-09-11 → "State sent, on 2026-09-11", and **Due** reads 2026-09-16, 14 days after its date.
- **Credit what is left in full** with the reason "Raised on the wrong claim" → credit note **CB-000004** for £9,000 (an amount of £1 sent with it was ignored). The invoice reads "Outstanding £0 — credited in full — nothing is owed".
- Open CB-000002 (£4,000 outstanding). Record £20,000 → refused. Record £2,500 arriving 2026-09-11 → "Outstanding £1,500 — part received".
- **Finance** then reads "Invoiced £27,000; credit notes £9,000; received £16,500; outstanding £1,500".
- **On another freshly started demo**, press **Raise our fee** on CR-2026-0008 (Dunmarrow Medical Practice Limited, at the invoice stage, expected £4,935) → invoice **CB-000004**: "The invoice is raised, with the next number in the series.", "Amount £4,935 — 3.00%", "VAT £0 — Caprebate is not VAT registered; no VAT is charged on this fee", "State raised, not sent", and **Due** 14 days after the day it was raised. On the claim, **Our estimated fee** is gone: the money now carries the invoice.

*The figures in this exercise were re-derived for the 3% fee by Phase 132e from the seed's amounts (£9,000 on
£300,000; £4,935 on £164,500) and the same steps; the exercise was first observed at 5%. Run it again rather than
quote it.*

**Check yourself**
- *An invoice went out with a mistake. Cancel it?* — No. A sent invoice is credited with a credit note; only an unsent one with nothing against it is cancelled.
- *An invoice's due date is blank. Is it overdue after 30 days?* — No. A due date is blank only while the letter's payment terms are blank, and then it is neither overdue nor on time. Today the letter says 14 days, so an invoice is due 14 days after its date.
- *Can you type a different fee?* — No. It comes from the signed-off figure through the fee rules, and only a credit note changes it.

---

### Training — `B11`/`B12` users and roles

Address: /staff/users (the **Settings** tab → **Users**; or **Your account** → "Users and roles")

**What it is for.** Giving staff and clients a login, changing what a person's role lets them do, and switching an account off. In the page's own words, those three things "are the whole of what administration is".

**Who can open it.** Admin only. Everyone else gets "not authorised".

**How to do the common job**
1. Open the **Settings** tab, then the **Users** tile.
2. Under "Create a user", fill in "Username — an email address" and "Display name", and choose a "Role". For somebody who should only look, choose **READ_ONLY** (Phase 132e): they can read the work and change nothing, and they never see a value, money, a register or the audit log.
3. Leave "Business — for a CLIENT account only" empty unless the account is a client's.
4. Type an "Initial password — at least 12 characters" and press **Create**. Hand the password over yourself; nothing is emailed.
5. To change a role, find the person under "Change somebody's role", choose the role and press **Assign**. All their sessions end at once.
6. To switch someone off, press **Disable** on their row. Their sessions end at once. There is no button to switch them back on.

**What it will refuse, and why**
- "a password is at least 12 characters".
- "you cannot change your own role — ask another administrator": a demoted administrator could not put it back.
- "you cannot disable your own account", and "that is the last administrator — create another before disabling this one": without an administrator, nobody can create one.
- "a staff account cannot become a client account: a client belongs to one business and this one belongs to none".
- Editing another person's name, username or photograph: there is no control for it at all, because it "reads as the person themselves".

**Try it on the demo**
1. Create **Trainee Seller**, `trainee@example.invalid`, role SALES, password `short`. *Observed:* "Not created — a password is at least 12 characters".
2. Repeat with `training-password-1`. *Observed:* back on the users page; the row reads Trainee Seller · SALES · active.
3. In the second browser, sign in as the trainee and open **Leads**. *Observed:* the Leads page opens.
4. As admin, **Assign** ACCOUNTING to the trainee. Refresh the trainee's Leads page. *Observed:* sent to Sign in.
5. Sign the trainee in again. *Observed:* Leads now answers "not authorised"; Finance opens.
6. As admin, press **Disable**. *Observed:* the trainee's next click goes to Sign in, signing in says "those details did not match", and the row reads ACCOUNTING · disabled.

**Check yourself**
1. *A salesperson moves to Accounting. When does their Sales access stop?* The moment you press Assign; every session they hold is revoked.
2. *A client's accountant asks for a login. What do you do?* Nothing on this page. The client's accountant never gets a login; they are a contact.
3. *A colleague's display name is misspelt. Can you correct it?* No. They correct it on their own Settings page.
4. *The data protection officer asks for a login of their own. Can you give one?* Not yet. The role is built but switched off, so it is not in the role list; it waits on Lakhbir's decision. Until then the registers stay with Admin.

---

### Training — `B13`/`B14` organisations

**Phase 135, 21 September 2026.** There is no separate Organisations list any more: it is the one **Clients** list
(`B5`), and `/staff/organisations` takes you there. Everything below about a company's record still holds, on its page.

**Phase 134, 18 September 2026.** The **Organisations** list is unchanged, but each name now opens the **one client
page** (`B5`/`B6`) — the organisation's own page and the business page were two pages for one company, and are now one.
Everything below is on that page: the details under **Details**, contacts under **Contacts**, properties under
**Properties**, documents under **Documents**, and tasks, the timeline and notes under **Timeline**. The old address,
`/staff/organisations/{organisation}`, still works and takes you there.

**Where things are on the page (Phase 133a, 17 September 2026).** The list is one table. An organisation's page opens
with its highlights — client status, owner, sector, legal name, source — then three tabs: **Details** (the organisation
and **Change these**), **Related** (contacts, properties, claims and documents, with a count) and **Activity** (tasks and
follow-ups, the timeline and internal notes). **Quick actions** on the right link to **Log a call or add a follow-up**,
**Add a contact or a property**, **Add a note** and, for a role that may open it, **The business page**.

**What it is for**
One record per client organisation: its names, company number, claimant type, addresses, website,
status, source and owner, with its contacts, properties, claims, documents, tasks, timeline and
internal notes. Facts that come from a better source are shown with that source and are never
typed again.

**Who can open it**
Admin and Sales. Accounting and Surveying are refused the section.

Address: `/staff/organisations` · one organisation: `/staff/organisations/{organisation}`

**How to do the common job**
1. Open **Clients** and choose a company.
2. To change details, use **Change these**, then **Save**. A derived fact shows "from the Companies House register record" and has no box.
3. To add a person, fill in **Add a contact** — **Name**, **Job title**, **Contact type**, **Decision maker**, **Email**, **Telephone**, **Notes — internal, never shown to the client** — and press **Add contact**.
4. To add a building, use **Add a property**: **Name of the site or building** and **Postcode**, then **Add property**.
5. To stop all outgoing messages, set **Client status** to **Do not contact** and press **Save**.
6. Read **Referred by**: the firms whose referrals became this organisation's leads, each with how many. It is read from the leads and never typed.

**What it will refuse, and why**
- A derived fact posted anyway: "The legal name is already known from the Companies House register record, so it is not asked again." A question is never asked twice.
- A contact with no name: "A contact is a person, and needs a name."
- A client's accountant or adviser is a contact and never gets a login — the page says so under **Add a contact**.
- Anything queued to a **Do not contact** organisation is refused (see `B23`).

**Try it on the demo**
As Sales, open Brackenfell Dental Partnership LLP. **Legal name** reads "Brackenfell Dental Partnership
LLP — from the Companies House register record", and there is no legal-name box under **Change these**.
Then try sending a different legal name for it. The answer is the page **Not saved**: "The legal name
is already known from the Companies House register record, so it is not asked again." Then open
Dunmarrow Medical Practice Limited: **Referred by** reads "no firm — none of this organisation’s leads
came from a referral", with "read from the organisation’s leads, never typed here" beneath it.

**Check yourself**
- *Why is there no box for Brackenfell's company number?* — It comes from the Companies House record, so it is not asked again.
- *The client's accountant wants to log in. What do you do?* — Nothing: an accountant is a contact, never a user.
- *What does "Do not contact" actually do?* — It stops anything being queued to that organisation or its people.
- *A firm referred this organisation. Where do you type the firm's name?* — Nowhere on this page. **Referred by** is read from the organisation's leads; the referral is recorded on **Introducers**.

---

### Training — `B15`/`B16` properties

**Where things are on the page (Phase 133a, 17 September 2026).** A property's page opens with its highlights —
organisation, postcode, jurisdiction, tenure, number of claims — then **Details** (the property, what the assessment
captured, **Change the property**), **Related** (its claims, **Open a claim for**, its documents) and **Activity** (tasks,
the timeline, notes). **Quick actions** link to each form.

**What it is for**
One record per building a claim is about: address, postcode, jurisdiction, type, use, tenure,
occupier, acquisition and disposal, previous owner, and whether allowances were claimed on it
before. What the client said in the assessment is shown beside it, never copied in.

**Who can open it**
Admin and Sales, for every property. A surveyor sees only the properties of organisations whose
survey jobs are assigned to them (on the demo, 3 shown), with no timeline. Accounting is refused.

Address: `/staff/properties` · one property: `/staff/properties/{property}`

**How to do the common job**
1. Open **Properties** and choose one.
2. Read **The property**, and **What the client told us in the assessment** beside it.
3. Use **Change the property** and press **Save**. Leave **Occupier**, **Previous owner** and **Acquisition price, in pounds** blank unless you are changing them.
4. To start another claim on this building, choose **Open a claim for** (a workstream) and press **Open claim**. It opens at the Enquiry stage.

**What it will refuse, and why**
- A person's name as previous owner or occupier: "The previous owner is recorded as a company name — ending Limited, Ltd, LLP, plc or CIC — or as a role such as INDIVIDUAL_NOT_RECORDED. It is never a person's name: a person named here would be a third party in the claim record."
- A price of nought: "The acquisition price must be more than nothing — leave it blank if it is not known."
- A jurisdiction the postcode already answers: "The jurisdiction is already known from the postcode, so it is not asked again."
- A prior-claim answer the client's own assessment already gives: there is no box — "Whether allowances were claimed before is known from the client’s own answer in the assessment and is not asked." — and one sent anyway is refused. None of the seeded properties has such an answer, so this is quoted from the code.

**Try it on the demo**
As Sales, open Dunmarrow Medical Practice Limited — main site. Under **Change the property**, type
"Jane Smith" as the previous owner and press **Save**. **Not saved** appears with the sentence above.
Note that **Jurisdiction** reads "not known — not derived: the ONS postcode table is not configured on
this deployment". **Allowances claimed before?** reads "not known — nobody has established whether
allowances were claimed on this property before".

**Check yourself**
- *The previous owner was a retired GP. What do you record?* — A role, not the name — for example INDIVIDUAL_NOT_RECORDED.
- *You don't know the purchase price. What goes in the box?* — Nothing. Leave it blank; nought is refused.
- *Where do survey dates live?* — On the claim, not on the building.
- *The client said in the assessment that they had claimed before. Do you record it here?* — No. It is read from their answer. Anything a review finds about that earlier claim goes in **Prior claim information**.

---

### Training — `B17`/`B18` claims

**Phase 134, 18 September 2026 — the company leads.** The claims list's columns are **Company, Property, Stage, Next
action, Owner** and, last and in grey, **Reference**; it is sorted by company unless you choose otherwise. A claim's
page is headed with the **company's name**, with "Company › Property" above it and the property and grey reference
under it. Everywhere else a claim appears — the board, home, tasks, the dashboard, finance, documents, search — it is
named by its company or property, and the reference sits beside it in grey. *On the demo, as Sales:* the first row of
**Claims** reads Aldergate Care Group Limited, and **Elverton Private Hospital Limited** has three rows.

**Where things are on the page (Phase 133a, 17 September 2026).** The claims list has **Filter, sort and save** beside
it, and the underlined headings (Reference, Next action, Value) sort it. A claim's page opens with its highlights —
stage, owner, property, priority, value (for a role that may read it) and client — then the **stage bar**: the ten
stages and Closed, the current one filled in, and under it **Moving on from …: Ready** or **Not ready yet** with the first thing
still needed. Then three tabs: **Details** (the claim, the team, the estimated fee, the overview, **The pipeline — the
operating procedure's stages** with **Move the claim**, the facts, the four figures, the value and **Change the
claim**), **Related** (documents and requests, money, contacts, deliverables and aftercare, with a count) and
**Activity** (**Next action and tasks**, **Email a contact from a template**, the timeline and internal notes). On the
right: **Next action**, and **Quick actions** — **Log a call or add a task**, **Set the next action**, **Request a
document**, **Move the claim**, **Email a contact**, **Add a note** — each shown only when its form is on your page.

**What it is for**
The claim is the unit of work: one organisation can have many properties, and one property many
claims. Its page holds:
- the header and overview;
- the pipeline panel, and the next action and tasks;
- documents;
- the capital allowances facts;
- the four figures and the sign-off;
- the deliverables register and aftercare;
- contacts, email, the timeline and internal notes.

**Who can open it**
Admin and Sales see everything, including the value, where the claim came from and its team. Admin and
Sales add to the team and take people off it. Accounting sees the client, the reference, the documents
it may read, and the money — and, on a claim at the invoice stage, **Our estimated fee**. A surveyor sees
only claims on their assigned jobs, with the claim's owner and surveyor, and never a figure.

Address: `/staff/claims` · one claim: `/staff/claims/{claim}`

**How to do the common job** (recording a fact and starting a deliverable)
1. Open **Claims** and choose a reference.
2. In **The claim's capital allowances facts**, choose the **Fact**, then **Answer** (**This value** or **Not known**), the **Value** if you have one, and the **Source**.
3. Press **Record the fact**. It appears with its source, who recorded it and when.
4. Read **The four figures** — A, B, C and D — each with the reason it is not yet there.
5. In **The deliverables register**, press **Start a draft** on the deliverable you are preparing.
6. Use **Change the claim** and **Save** for owner, surveyor, priority, workstream, property, expected completion and reasons. The stage and the next action are not changed here.

**How to put the client's accountant on the claim's team**
1. On the organisation, **Add a contact** with **Contact type** Accountant (or Adviser).
2. Open the claim. Under **The claim team**, choose them in **Add to the team** and press **Add**.
3. They are listed with **On the team since** and who added them.
4. To remove them, press **Take off the team**. They stay a contact of the organisation, and the record of the link stays.

**What it will refuse, and why**
- The same contact twice: "That contact is already on this claim’s team."
- A contact of another type, such as the decision maker: "Only a contact recorded as the organisation’s accountant or adviser joins a claim’s team. Change the contact’s type first if that is what they are."
- Taking someone off twice: **Not taken off the team** — "That contact has already been taken off this claim’s team."
- A next action typed into **Change the claim**: "next action is a task now, with an owner and a due date. Set it in the claim’s next action panel."
- A fact marked **This value** with no value: "A s.198 or s.199 election affects the property: choose one of the answers offered, or record it as not known."
- A sign-off outside its stage: "A sign-off is recorded while the claim is at the tax adviser's sign-off."
- A client report too early: "The client report states a figure, and no report stating a figure is drafted before the tax adviser's sign-off is on record."
- A reference is never reused, and a claim cannot be deleted.

**Try it on the demo**
As Sales, open CR-2026-0004 and record "A s.198 or s.199 election affects the property" as **Not
known**, source "The client told us". The row now reads "not known Client · … by Sales User", and
**The election, resolved** still reads "unresolved … not known does not pass". Then press **Start a
draft** on the client report (sent directly): **Deliverable not recorded**, with the sentence above.

Then open CR-2026-0008, Dunmarrow Medical Practice Limited's branch surgery, at the invoice stage.
**Came from** reads "no lead — this claim was opened by staff on a property"; **Tax adviser** reads
"CAPREBATE_CTA, Chartered Tax Adviser the sign-off record, signed on 2026-09-01 …". Its team says
"Nobody is linked to this claim yet." On Dunmarrow Medical Practice Limited add the contact *Practice
Accountant Contact*, type Accountant. Back on CR-2026-0008 choose them under **Add to the team** and
press **Add**: they are listed "Accountant … by Sales User". Press **Add** again → "That contact is
already on this claim’s team." Sign in as Accounting and open CR-2026-0008: **Our estimated fee** reads
"£4,935 — counted in the finance view’s fees expected from claims at the invoice stage", and there is
no claim team. Signed in as the surveyor, the team shows only **Owner** and **Surveyor**.

**Check yourself**
- *You record a fact as "Not known". Does it open the Data gathering gate?* — No. Not known and never recorded read the same, and neither opens a gate.
- *Can Accounting see the claim value?* — No; Accounting sees client, reference and money.
- *Where do you change the stage?* — In the pipeline panel's **Move the claim**, never in **Change the claim**.
- *The client's accountant is on the claim's team. Can they sign in?* — No. A contact on the team stays a contact, and nobody on it has a login.
- *Can Sales see our estimated fee?* — No. It is drawn only for Admin and Accounting, who read the money.

---

### Training — `B19`/`B20` leads

**Phase 135, 21 September 2026 — filled assessments are leads.** At the top of the list, **All leads** and **Filled
assessments** switch between the two views; the **Leads** tab stays marked on both. The filled-assessments list is the one
that was **Assessments** (`/staff/assessments`, same address, same rule: Admin and Sales, and a surveyor, who is not
shown **All leads**). *Observed on a freshly started demo, 21 September 2026, as Sales:* **Filled assessments** reads
"6 submitted, newest first."

**Where things are on the page (Phase 133a, 17 September 2026).** The leads list has **Filter, sort and save** beside it,
the underlined headings (Date, Next action, Range shown) sort it, and **Record a lead by hand** at the top jumps to the
form. A lead's page opens with its highlights — status, owner, source, next action, lead date, and the claim once
converted — then **Details** (the lead, the enquiry gate, **Change the lead**, **Convert**), **Related** (the introducer
and what the assessment captured) and **Activity** (the timeline and tasks). **Quick actions** link to **Record an
enquiry check**, **Log a call or add a follow-up** and **Convert — open the claim**.

**Website enquiries (Phase 133j, 18 September 2026).** The website's **Request my estimate** form now reaches the back office.
The Leads page says how many are waiting and links **Website enquiries** (`/staff/enquiries`), open to Admin and Sales. Each
row shows who wrote, how to reach them, the property type and what they wrote. Press **Open as a lead** to record it as a
lead (source Website) with the person as a contact on it, or **Close, nothing more needed**. Either happens once. Every
person agreed to be contacted about their enquiry; that is not marketing consent. A person who finishes the assessment
may also create their own client login, confirmed by email; nobody in the office needs to do anything for that.

**What it is for**
Where every possible claim is worked before it becomes one: its source, owner, next action and
status, what the assessment captured, the four enquiry checks, and conversion. A referred lead
also carries its firm and the client's answer about sharing progress.

**Who can open it**
Admin and Sales. Accounting, Surveying and the client are refused every lead page.

Address: `/staff/leads` · one lead: `/staff/leads/{lead}`

**How to do the common job**
1. Open **Leads** and choose one, or record one with **Record a lead by hand** → **Record the lead**.
2. Under **The enquiry gate**, record each **Check** with an **Answer** and press **Record the check**.
3. When all four read Yes, the page says **Ready** "Every check is a yes." Under **Change the lead**, set **Status** to **Qualified** and **Save**.
4. Press **Convert and open the claim**.
5. On a referred lead, read the client the words under **The introducer, and sharing progress with it**, choose **Their answer**, and press **Record the answer**.

**What it will refuse, and why**
- No answer chosen: "Answer yes, no, or not known — not known is an answer, and it does not pass."
- Qualifying too early: "A lead is qualified when every enquiry check is a recorded yes: …" followed by each check that fails.
- Converting unqualified: "Only a qualified lead converts, and this one is contacted."
- A referral with no organisation: "This lead has no organisation yet. The organisation is created by the assessment — send them the assessment, then link this lead to the organisation it creates."
- Setting Converted by hand: "A lead converts by opening its claim — use Convert, which asks the enquiry gate again."
- A share answer not chosen: "Record what the client said — yes, no, or that they have withdrawn. Nothing is assumed."

**Try it on the demo**
As Sales, open the lead Gorsebrook Invented Care Homes Limited. Two checks read Yes; ownership
reads "Not known, by Sales User"; the claim-conflict check reads "never recorded" — and both of those
read "not known". Set **Status** to **Qualified** → refused. Record ownership and claim conflict as
Yes → the gate is open, and **Qualified** saves. Press **Convert and open the claim** → refused,
because the lead has no organisation yet.

**Check yourself**
- *One check is "Not known" and one was never asked. Which blocks qualifying?* — Both, equally.
- *Can you type the client's name on the lead?* — No. A lead carries no person; people are contacts on the organisation or the firm.
- *What does converting create?* — The claim, at the Assessment stage; the lead is kept as the record.

---

### Training — `B21` the pipeline board

**Where things are on the page (Phase 133a, 17 September 2026).** The board is a row of columns, one per stage, each
headed with its name and count; a stage's owner and gate are under **Owner and gate**. Each claim is a card with its
reference, client, property, owner, days since its last move, next action and the **Move to …** button. **On hold** and
the exits are a second row below. On a phone the columns stack into a list.

**What it is for**
Every claim on the procedure's ten stages, one column each, with a lane for claims on hold and the
exits below. Each column shows who owns the stage and what its gate asks. Each card shows the
reference, client, property, owner, days since the last move, the next action and — for Admin and
Sales — the range shown.

**Who can open it**
Admin and Sales. Moves are Admin and Sales; reopening is Admin alone. Accounting and Surveying are
refused the board and every move.

Address: `/staff/pipeline` · a move: posted from a card or the claim page

**How to do the common job**
1. Open **Pipeline** and find the card.
2. Read the column's **The gate:** line.
3. Press the card's **Move to …** button. It asks for exactly the next stage.
4. If the move is refused, open the claim: its pipeline panel lists each need with ✗ or ✓ and the reason.
5. To exit or hold, use the claim page: **Close the claim here** (with **Exit to** and **Reason**; the record is kept) or **Put on hold** (with **Hold reason**).

**What it will refuse, and why** (the page is headed **Not moved**)
- A skipped stage: "A claim moves one stage at a time, through each stage's gate. From Assessment the next stage is Engagement."
- A gate not ready: "Not ready to move on from Enquiry yet. Still needed: The property is healthcare property in the UK — England and Wales at launch, Scotland second, Northern Ireland third — not known — and a check that is not known does not pass; …"
- No signed letter: "Not ready to move on from Engagement yet. Still needed: A signed engagement letter, asserted on the server — the engagement letter is sent and not yet opened and is not signed."
- A hold with no reason: "A hold carries its reason — say why the claim is on hold."
- No next action: "A claim moving to … keeps exactly one next action, with an owner and a due date, and this one does not: … Set the claim's next action first."
- A claim on hold: "This claim is on hold. Resume it at the stage it was held at first."
- Sales reopening, or a surveyor moving anything: refused ("not authorised").

**Try it on the demo**
As Sales, on **Pipeline**, press **Move to Assessment** on CR-2026-0007 → **Not moved**, listing all
four enquiry checks. Press **Move to Data gathering** on CR-2026-0002 → not ready to move on from Engagement,
because the letter is sent but not signed. Press **Move to Engagement** on CR-2026-0001 → it moves:
the **Engagement** column now reads "Engagement · 2", and the claim's **Every move** shows "Moved on
Assessment Engagement Sales User".

**Check yourself**
- *The card's button is there. Does that mean the move will work?* — No. The button is a courtesy; the gate is checked on every move.
- *A claim was declined at enquiry by mistake. Who can bring it back?* — Only an Admin, with a reason.
- *Why can't a surveyor see the board?* — The board is Admin's and Sales'; a surveyor sees only their own jobs.

---

### Training — `B22` tasks

**Phase 135, 21 September 2026.** The **Tasks** tab shows your open-task count (red when one is overdue), and the page
opens with three views: **My tasks**, **Every open task** and **Claims with no next step** (the list that was **Next
actions**, `B24`). Each is shown only to a role that may open it.

**What it is for**
The jobs colleagues do, each with an owner (or a team it waits with), a due date or none, an
activity type, a priority, an optional repeat, and a status. A question put to a client is not a
task — it lives on the business page and in the portal.

**Who can open it**
Every staff role sees its own tasks and the ones waiting with its team. Admin and Sales create,
change and cancel tasks, and can see every open task. Accounting and Surveying can start and
complete their own.

Address: `/staff/tasks` · one task: `/staff/tasks/{task}`

**How to do the common job**
1. Open **Tasks**. **My tasks** lists yours, overdue first. **Every open task** and **Claims with no next step**, at the top, switch the view.
2. To add a task, use **Add a task** on the organisation, property, claim or lead page. Fill in **Task**, **Activity**, and an **Owner** or **Or the team it waits with**, plus **Due** if there is one. Press **Add the task**.
3. Press **Start**, then **Complete**. A repeating task creates the next one when completed.
4. To drop a task, open it and fill in **Cancel it — a task is never deleted, so say why**, then press **Cancel the task**.

**What it will refuse, and why**
- No owner and no team: "Say who owns this task, or which team it waits with until somebody takes it."
- No title: "Say what the task is."
- Cancelling without a reason: "A task is cancelled with its reason, because it is never deleted."
- Changing a finished task: "A completed or cancelled task keeps its record: its status does not change again."
- Changing a claim's next action out from under it: "This task is its claim's next action, which keeps an owner and a due date. Set another next action first, then change this one."

**Try it on the demo**
As Sales, on Dunmarrow Medical Practice Limited, add the task "Check the fee invoice address with
Finance". Leave **Owner** empty, set **Or the team it waits with** to Accounting, and leave **Due**
empty. Sign in as Accounting: it appears as "waiting with Accounting — nobody has taken it" and "no
due date — so it is not overdue, and it is not on time either". Back as Sales, cancel "First
follow-up on the referral" with no reason → **Not changed**. With the reason "Duplicate of the
ownership call" it reads "Cancelled — cancelled … by Sales User — Duplicate of the ownership call".

**Check yourself**
- *Can you delete a task entered by mistake?* — No. Cancel it with a reason; the record stays.
- *Does a task without a due date count as on time on the dashboard?* — No. It is counted apart.
- *The client needs to answer a question. Is that a task?* — No. It is a question to the client, sent from the business page.

---

### Training — `B23` a claim's next action, tasks, email and timeline

**What it is for**
The working half of the claim page. **Next action and tasks** keeps the claim's one next action
and its other tasks. **Email a contact from a template** queues a message. **Activity timeline** reads
what has already happened, and **Internal notes — never shown to the client** are kept apart from it.

**Who can open it**
The next action: Admin and Sales. Email: Admin and Sales. Notes: Admin and Sales. Accounting sees a
timeline of "Financial events only". A surveyor sees their own tasks and a timeline limited to
their job.

Address: `/staff/claims/{claim}` (the panels)

**How to do the common job**
1. Under **Next action and tasks**, open **Set the next action**.
2. Fill in **What happens next**, choose **Owner** and **Due**, and press **Set as the next action**.
3. To email, go to **Email a contact from a template**: choose **Template** and **To**, and press **Queue to the outbox**.
4. Read the result in **Your account** under **The outbox — what would have been sent**. It says NOT SENT.
5. To keep a private remark, type it in **Add a note** and press **Save note**.

**What it will refuse, and why**
- No owner: "A claim's next action has an owner: choose the person who will do it."
- No date: "A claim's next action has a due date."
- A closed or exited claim: "This claim has closed or left the procedure, and keeps no next action."
- A do-not-contact organisation: **Not queued** — "This organisation is marked do not contact. Nothing was queued — the outbox refuses it."
- Accounting and Surveying cannot set a next action, queue email or add a note.

**Try it on the demo**
As Sales, on CR-2026-0002, set the next action "Send the engagement letter reminder" with no owner →
**Next action not set**. Choose Sales User and 2026-09-18 → the header reads "Next action Send the
engagement letter reminder due 2026-09-18". On CR-2026-0004, queue "What happens next on your claim"
to Decision Maker Contact. **Your account** then lists "Dunmarrow Medical Practice Limited — the next step on your claim NOT SENT" (since Phase 134 a subject leads with the company).
Add a contact to Fenmoor Nursing Homes Limited and try to email them from CR-2026-0006 → **Not queued**.

**Check yourself**
- *Where do you set the next action — "Change the claim" or "Next action and tasks"?* — **Next action and tasks** (or on a move).
- *You queued an email. Has the client received it?* — No. Email is stubbed; it waits in the outbox, NOT SENT.
- *Does the client see internal notes?* — Never. They are kept apart from the timeline too.

---

### Training — `B24` the one-next-action list

**Phase 135, 21 September 2026.** This list is now a view of **Tasks**: open **Tasks**, then **Claims with no next step**.
It is headed **Tasks**, and its two parts are **No next step, or no owner or date** and **Next step overdue**. *Observed on a
freshly started demo, 21 September 2026, as Sales:* "9 open claims checked"; the first row is Brackenfell Dental
Partnership LLP, "This claim has no next action."

**What it is for**
A single check on the whole pipeline. It lists every open claim breaking the rule "exactly one next
action, with an owner and a due date", then the claims keeping the rule whose next action is
overdue. Each claim shows who it is waiting on.

**Who can open it**
Admin and Sales. Accounting and Surveying are refused.

Address: `/staff/next-actions` (**Tasks** → **Claims with no next step**)

**How to do the common job**
1. Open the list from **Tasks**.
2. Under **No next step, or no owner or date**, read **The next action** column. It says what is wrong, for example "This claim has no next action…" or "The next action … has no due date."
3. Open the claim and fix it under **Set the next action**.
4. Under **Next step overdue**, chase the owner or move the date.

**What it will refuse, and why**
- The list itself changes nothing; you fix claims on the claim page.
- A claim nobody owns is on no owner's list. It is on this list, and on the landing page of Sales and Admin under **Claims nobody owns that break the one-next-action rule**.
- "Where both sides are waiting it reads as ours" — the page counts a shared wait as ours, because that is the one we can act on.

**Try it on the demo**
As Sales, open the list. "8 open claims checked"; **Breaking the rule** shows CR-2026-0002 ("This
claim has no next action…") and CR-2026-0003 ("… has no due date."). **Keeping it, with the next action
overdue** shows CR-2026-0001, "16 days overdue (1 Sep 2026)". After the `B23` exercise
(Brackenfell's next action set), reload: only CR-2026-0003 remains under **Breaking the rule**.

**Check yourself**
- *A next action has an owner but no date. Is the claim keeping the rule?* — No; it breaks it.
- *Who is "us" in "waiting on us"?* — Caprebate. Where both sides wait, it reads as ours.
- *Can Accounting open this list?* — No.

---

### Training — `B25` automation rules

Address: /staff/automation

**What it is for.** Routine follow-ups happen without anyone having to remember them. Each rule is one trigger and one effect. Every time a rule matches, it writes a run that you can read at the foot of the page.

**Who can open it.** Admin and Sales can read it. Only Admin sees **Change** and **Add a rule**, and only Admin can save; a save sent by Sales was refused with "not authorised". Accounting, Surveying and clients are refused the page.

**How to do the common job** (add a follow-up rule)
1. At the foot of the rules, open **Add a rule** and give it a "Label".
2. Choose a "Trigger". For "A claim enters a stage", also choose "Stage, for “a claim enters a stage”"; leaving "any stage" matches every stage.
3. Choose an "Effect", such as "A follow-up date — a follow-up task, due in the days the rule gives".
4. Fill in "Task", "Task description", "Task activity", "Priority" and "Due, in days after the event". Then choose "Goes to", "Team" and "Attached to".
5. Leave "Active" at yes and press **Save the rule**.
6. To stop a rule later, open **Change “…”**, set "Active" to "no — retired" and save. Rules are never deleted.

**What it will refuse, and why**
- The forbidden effects are not in the "Effect" list. If one is sent anyway, it is refused by name, for example "No rule may move a claim. A move asks the stage’s gate, and a person asks for the move." A rule runs unattended, so it may never move a claim, open a gate, record a signature, flip a tax adviser's switch, run the research, write to a do-not-contact organisation, send anything except to the outbox, or create or chase an invoice.
- "Give the rule a label a person can read."
- "Only a “stage entered” rule listens for a stage."
- "A document request to the client" with no document chosen: "Choose the document the rule asks the client for." With one chosen, it saves (see Part 1, A5).

**Try it on the demo**
1. Open **Automation rules** and scroll to "What the rules did". *Observed:* "No rule has run yet."
2. Open **Leads**. Record a lead with "Or the organisation's name" *Greywater Clinic Limited*, "Its sector" GP, "Where it came from" Outbound, and "Next action" *Call the practice manager*. Press **Record the lead**.
3. Return to **Automation rules**. *Observed:* "What the rules did" shows *A new lead gets its first follow-up* · A lead is created · a lead · **ran — 1 task**.

**Check yourself**
1. *Can a rule tell the client their claim has moved stage?* No. A notice goes only to the claim's owner, into the outbox, and is not sent; no rule may move a claim or speak to a client.
2. *Where do you see whether a rule fired?* Under "What the rules did", which shows either "ran" or why it did not.
3. *A seeded rule is no longer wanted. How do you remove it?* Set "Active" to "no — retired". Rules are never deleted.

---

### Training — `B26` email templates

Address: /staff/templates

**What it is for.** Standard wording for an email to one contact on a claim. The contact's details are filled in automatically, and the message is queued to the outbox. In this build nothing is ever sent.

**Who can open it.** Admin and Sales can read it; only Admin saves a template. Accounting, Surveying and clients are refused.

**How to do the common job**
1. Open **Add a template** and fill in "Label", "Subject" and "Body".
2. Use only the six merge fields, spelt exactly: {{contact_name}} {{organisation}} {{property_address}} {{claim_reference}} {{next_action}} {{due_date}}.
3. Set "Active" and press **Save the template**.
4. To use a template, open the claim and find "Email a contact from a template". Choose "Template" and "To", then press **Queue to the outbox**.
5. Check it at the foot of **Your account**, under "The outbox — what would have been sent". It is marked **NOT SENT**.

**What it will refuse, and why**
- Anything about invoices, payment or bank details, including the *shape* of a sort code or account number. For example: "A template may not carry a bank transfer. Bank details are never sent from a template, and the invoice email waits on the invoice-fraud procedure." Emails carrying bank details are how invoice fraud works.
- Tipping-off words, for example "A template may not carry a reference to due diligence." Nothing a client reads may suggest they are under suspicion.
- A merge field outside the six: "“{{first_name}}” is not a merge field. The merge fields are {{contact_name}}, …".
- Queuing to an organisation marked do not contact: "Nothing was queued — the outbox refuses it."

**Try it on the demo**
1. Add a template labelled *Payment reminder*, body *Dear {{contact_name}}, please send the payment by bank transfer.* *Observed:* "Template not saved — A template may not carry a bank transfer. …"
2. Add *Welcome* with subject *Welcome, {{first_name}}*. *Observed:* "“{{first_name}}” is not a merge field. …"
3. Add *Documents we still need*, body *Dear {{contact_name}}, for {{organisation}} we still need: {{next_action}}, by {{due_date}}.* *Observed:* it is saved and listed.
4. Open claim **CR-2026-0004** (Dunmarrow Medical Practice Limited). Queue "What happens next on your claim" to "Decision Maker Contact". *Observed:* the Settings outbox shows TEMPLATE · "Dunmarrow Medical Practice Limited — the next step on your claim" · **NOT SENT** (since Phase 134 a subject leads with the company).

**Check yourself**
1. *Can a template include our bank details "just for this client"?* No. Any bank detail is refused, and details are confirmed on a channel other than email.
2. *What does the client see where nobody recorded a due date?* A visible gap in square brackets, never a blank.
3. *Where do you check what was "sent"?* The outbox at the foot of Settings. Everything there reads NOT SENT.

---

### Training — `B27` a claim's documents and requests

**What it is for**
The **Documents** panel on the claim shows the documents linked to the claim — directly or through its
property — and the requests to the client, outstanding first. From here you ask the client for a
document, upload one yourself, or link one the organisation already holds.

**Who can open it**
Admin and Sales see everything and can request, upload and link. Accounting sees only the fee
invoice and the signed letter. A surveyor sees their job's claim evidence and no requests.

Address: `/staff/claims/{claim}` (the **Documents** panel)

**How to do the common job**
1. Open the claim and scroll to **Documents**.
2. Under **Ask the client for a document — it goes to their portal, and only a type with a receipt policy can be asked for**, choose **Document**.
3. Fill in **Why we need it**, **What it holds up** and, if there is one, **Due**.
4. Press **Request it**. It shows under **Requests** as "requested — waiting on the client".
5. Wait for the client's upload; the request turns to "received, by an upload of the requested type".
6. If you asked in error, press **Withdraw — asked in error** while it is still open.

**What it will refuse, and why**
- Missing reasons: **Not requested** — "a request sent to a client has to say why the document is needed and what it holds up."
- A type nothing can receive: the list offers only the eleven types with a receipt policy.
- There is no "mark received" button anywhere: "A request is received when an upload of the requested type passes the receipt strip. There is no button for it."
- Withdrawing a received request: "that request has been received by an upload. The version that answered it stays on the record."

**Try it on the demo**
As Sales, on CR-2026-0003, press **Request it** for "Lease, and any licence for alterations" with the
two boxes empty → **Not requested**. Fill them in ("To confirm the tenure and the alterations licence",
"The survey") with Due 2026-09-10 → **Requests — 1 outstanding, 1 OVERDUE**. Your landing page now
shows **Documents you asked a client for that have not arrived**. Once the client's upload arrives
(see `C6`), the panel reads "Requests — 0 outstanding" and "received, by an upload of the requested
type, version 1".

**Check yourself**
- *The client says they posted the lease. Can you tick it received?* — No; only the upload receives it.
- *Why is "Capital allowances report" not in the request list?* — It has no receipt policy, so nothing can receive it.
- *A request's due date has passed. How is that shown?* — "3 days overdue (…)", counted in UK days.

---

### Training — `B28` a document and its versions

**What it is for**
One document's own page. It shows the type, who may read it, the receipt strip applied, the type's
deletion clock, every link to a claim or property, and every version — who uploaded it (a role,
never a name), its state, and its own deletion clock. Nothing is ever overwritten.

**Who can open it**
Decided by the document's type. Claim evidence such as a lease: Admin, Sales, a surveyor on an
assigned job, and the client. The fee invoice: Admin, Accounting and the client. The original file:
nobody can have it back, because it was deleted after the checks.

Address: `/staff/documents/{document}`

**How to do the common job**
1. From the claim's **Documents** panel, open the document.
2. Read **Type**, **Who may read it**, **The receipt strip** and **The type's deletion clock today**.
3. Under **Linked to**, see each claim or property. Press **End this link** to stop a link — it is ended, not deleted.
4. Under **Version history**, read each version's row.
5. To add a newer copy, press **Upload a new version**. It becomes version 2; version 1 stays.

**What it will refuse, and why**
- A role the type does not admit (for example Accounting, or a surveyor off the job, opening a lease) is refused, and the refusal is logged.
- Asking for the original answers "That file no longer exists, by design". The original was deleted from quarantine once the checks ran, and nothing stored a copy.
- A new version of a different type: "a new version of … must be of the same type."
- Ending a link twice: "that link has already been ended."

**Try it on the demo**
After the client's lease upload (`C6` exercise), as Sales open the lease from CR-2026-0003. **Who may read it**
reads "Claim evidence — Admin, Sales, a surveyor on an assigned job, and the client". Version 1 is
"the client", "received: stripped, and the original deleted from quarantine". Its deletion clock
reads "RET-7 … DERIVED, NOT APPROVED … so no deletion date is computed". Signed in as Accounting, or
as the surveyor, the same address is refused.

**Check yourself**
- *Why does the page name "the client" rather than a person?* — Versions record a role, never a name.
- *A newer lease arrives. What happens to the old one?* — It stays as version 1; nothing overwrites.
- *Can Admin download the original?* — No. It was deleted by design, and the download answers that it no longer exists.

---

### Training — `B29` document types

Address: /staff/document-types

**What it is for.** For each kind of document, it records who may read it, whether it can carry a claim value, a tax benefit or a fee, its deletion clock, and whether it is in use. It also shows whether an upload of that kind can be received at all.

**Who can open it.** Admin and Sales can read it; only Admin saves. Accounting, Surveying and clients are refused.

**How to do the common job**
1. **Where things are (Phase 133b, 17 September 2026).** The types are grouped by who may read them, in a list down the left: **Claim evidence**, **The claim team**, **Finance**, **The engagement letter**, then **Add a type**. Each type is one line — its name, its code, and whether it can carry a value, its deletion clock and whether it is active. Press the line to open it.
2. In the opened type, change **Label**, **Who may read it**, **Can it carry a value**, **Deletion clock** (UNSET or RET-7) or **State**, then press **Save** (the button names the type). The page opens again on the group the type now sits in.
3. To add a type, choose **Add a type** in the list and fill in "Code" and "Label". Choose "Who may read it", "Can it carry a claim value, a tax benefit or a fee?" and "Deletion clock", then press **Add the type**.
4. A new type has no receipt policy: it can be recorded but not received or requested, until the data protection officer decides a policy and a developer binds it.

**What it will refuse, and why**
- "a type that can carry a claim value, a tax benefit or a fee is never marked as not carrying one (N1)."
- "a type that can carry a claim value, a tax benefit or a fee cannot be claim evidence: a surveyor would read it (N1)." A surveyor must never see our figures before committing their own.
- Asking a client for a type with no receipt policy: "nothing could ever receive it. No receipt policy — so an upload of this type cannot be received. …"
- There is no delete and no receipt-policy control on the page.

**Try it on the demo**
1. Open **Asbestos register** under Claim evidence, change its label to *Asbestos register and survey* and press Save. *Observed:* it is saved, and a claim's "Ask the client for a document" list shows the new name.
2. Try to set **Caprebate's fee invoice** to "cannot". *Observed:* the row offers only "can carry a value"; when forced, "Type not changed — a type that can carry a claim value … is never marked as not carrying one (N1)."
3. Add a type with Code *DILAPIDATIONS_SCHEDULE*, Label *Schedule of dilapidations*, readers **Claim evidence**, carries a value **yes**. *Observed:* "Type not added — … cannot be claim evidence: a surveyor would read it (N1)."
4. Repeat with readers **The claim team**. *Observed:* it is added, showing "added by an administrator", "No receipt policy …" and "UNSET". It does not appear in a claim's request list, and a forced request was refused with "nothing could ever receive it."

**Check yourself**
1. *Why can't a client upload their engagement letter?* The type has no receipt policy. The data protection officer decides one, and only a developer's migration can bind it.
2. *Can the fee invoice be made readable by a surveyor?* No. A type that can carry a fee can never be claim evidence.
3. *A type is obsolete. Delete it?* No. Set it to retired.
4. *The data protection officer approves the recommended strip for accounts. Can a client upload accounts the next day?* No. Approval is recorded first; a developer then binds the policy with a migration, and only then does the type stop reading "No receipt policy".

---

### Training — `B30`/`B31` introducers, and one firm

**What it is for**
The firms that refer clients — accountancy practices above all — and the people at them. Nobody at
a firm ever has a login. The list shows what each firm has sent us, read fresh each time. A firm's
page holds its people, the contact logged with it as tasks, its referrals, and whether each client
wants progress shared.

**Who can open it**
Admin and Sales see everything except the money. Accounting sees each firm's name and the money
(**Fees invoiced**, **Fees paid**) and nothing else. Surveying is refused.

Address: `/staff/introducers` · one firm: `/staff/introducers/{firm}`

**How to do the common job**
1. Open **Introducers**.
2. To add a firm, use **Add a firm**: **The firm's name**, **Its kind**, **Relationship started**, **Notes**. Press **Add the firm**.
3. To record a referral, use **Record a referral**: **A firm already recorded** (or **Or the firm's name**), **The person referring**, **Their email**, **Their telephone**, **The client business's name**, **Its sector**, **The property's postcode, or its first half**, **What happened at the property**, **In which year**. Press **Record the referral**. You land on the new lead.
4. On the firm's page, add people (**Add the person**), log contact that happened (**Log it**), and plan the next contact (**Plan it**).

**What it will refuse, and why**
- A referral with no client business: **Referral not recorded** — "Name the client's business — a referral is about an organisation."
- A firm with no name: "An introducer is a firm, and needs its name."
- A planned contact with no date: "A planned contact has a date — the next contact is read from it."
- Reciprocity while the reward model is off: "Reciprocity is logged only while reward model A is switched on…"

**Try it on the demo**
As Sales, add the firm "Hollowmere Invented Accountants LLP". Its page opens with "Leads referred 0"
and "Estimated claim value: not known — no referred claim carries a sealed estimate". Record a
referral from "Quarrendon Invented Tax LLP" for "Hartwell Invented Dental Limited": the new lead shows
**Introducer** Quarrendon Invented Tax LLP, and under **Notices to the firm**, "Referred not queued —
the client's opt-in to share progress with this firm is not given". Sign in as Accounting: **Introducers**
lists both firms with only **Fees invoiced** £0 and **Fees paid** £0 filled in.

**Check yourself**
- *The referring partner wants a login to track the claim. Possible?* — No. Nobody at a firm has a login.
- *Why did the "Referred" notice not go?* — The client has not said yes; never asked counts as no.
- *An estimate is missing on a referred claim. Is it counted as £0?* — No; it is counted apart as not known.

---

### Training — `B31` the merge on a firm's page

Address: /staff/introducers/… (the duplicate firm's own page)

**What it is for.** When one introducing firm has been recorded twice, its leads, people and open tasks are moved onto the real record, so the firm's figures read as one.

**Who can open it.** The firm's page is open to Admin, Sales and Accounting, each seeing their own part. Only Admin can merge; Sales pressing **Merge** got "not authorised".

**How to do the common job**
1. Open **Introducers**, then the *duplicate* firm.
2. Under "Merge this firm onto the one it really is", choose "The firm it really is".
3. Fill in "Why these are the same firm" and press **Merge**.
4. The copy's page now says what moved and what stayed. Check the real firm's page for its leads and people.

**What it will refuse, and why**
- "Say why these are the same firm — up to 1,000 characters." A merge must be explainable later.
- "This firm has already been merged onto another."
- "A firm is not merged onto itself." (from the code)
- "That firm was itself merged away. Choose the firm it was merged onto." (from the code)
- "This firm has a fee recorded against it. Money is never moved by a merge: settle or record it on the firm it was accrued to first." (from the code)
- A client's yes to sharing progress with the copy **does not** carry over. Consent is given to a firm, not to a name.

**Try it on the demo** (the seed has no firms, so make two)
1. On **Introducers**, use **Add the firm** twice: *Hollinbrook Accountants LLP* and *Hollinbrook Accountants*, both "Accountancy firm".
2. Open *Hollinbrook Accountants* and press **Merge** with the reason left empty. *Observed:* "Not merged — Say why these are the same firm — up to 1,000 characters."
3. Enter the reason *Same practice, typed twice* and press **Merge**. *Observed:* you land on the LLP's page. The copy's page reads "Merged onto Hollinbrook Accountants LLP on 2026-09-12 11:43. Its leads, its people and its open tasks moved there; its closed tasks, any client’s answer on sharing progress and every notice stay here, as they were recorded."
4. Press **Merge** again. *Observed:* "This firm has already been merged onto another." Both names still appear in the Introducers list.

**Check yourself**
1. *A client said yes to sharing progress with the duplicate. After the merge, does the real firm get notices?* No. That yes is not moved; ask the client and record a new answer against the real firm.
2. *The duplicate has a model B fee on it. Can you merge?* No. Settle or record the fee on the firm it accrued to first.
3. *Can Sales merge two firms?* No. Merging is Admin's alone.

---

---

### Training — `B32` the reward model and fees

**Phase 135, 21 September 2026 — now called Introducer fees.** Admin opens it from the **Settings** tab (the **Introducer
fees** tile); Accounting from **More** → **Introducer fees**; Sales from the link on **Introducers**. The page and its rules
are unchanged.

Address: /staff/introducer-rewards

**What it is for.** Records whether, and how, firms that refer clients are rewarded. The choice is Off, model A (no cash, firm-level reciprocity), model B (a fixed fee per successful claim, disclosed to the client) or, since Phase 132e, model C (10% of our fee as actually invoiced, to a registered accountancy firm, reversed if the fee is reduced under clause 13). It also lists any model B fees owed to firms, and model C's ledger of accruals and reversals.

**Who can open it.** Admin, Sales and Accounting can read it. Only Admin sees "Switch it". Surveying and clients are refused.

**How to do the common job**
1. Read the state at the top ("It is Off — nothing is offered to an introducer.") and the clause 1 wording quoted beneath it.
2. Only once Lakhbir has decided and clause 1 of the letter is complete: choose a "Model" under "Switch it", enter "Model B's fee per successful claim, in pounds" if it is B, and press **Save**.
3. Under model B, a fee appears in "Fees to introducers" when a referred claim closes. Sales or Admin records its disclosure to the client; only after that may Admin or Accounting mark it settled. (No fee exists on the demo, so these controls could not be seen.)

**What it will refuse, and why**
- Any change from Off while clause 1 is blank: "The reward model stays off while clause 1 of the engagement letter is blank — it still reads …". A reward the letter does not disclose to the client cannot be offered.
- Model B with no amount: "Model B is a fixed fee: give the amount paid to the firm per successful claim, in pounds." (from the code)
- A fee marked paid before its disclosure is recorded (refused by the database).
- Sales pressing Save is refused with "not authorised".

**Try it on the demo**
1. As admin, choose "B — a fixed, disclosed fee per successful claim, paid to the firm", enter 250 and press Save. *Observed:* "The reward model did not change — The reward model stays off while clause 1 of the engagement letter is blank — it still reads [Where the Client has none engaged, …]".
2. Try "A — no cash: firm-level reciprocity …". *Observed:* the same refusal.
3. Sign in as Accounting and open the page. *Observed:* it opens, shows "It is Off", and has no "Switch it" section.

**Check yourself**
1. *Who decides whether a firm is paid?* Lakhbir ("Is anything paid to the accountant?"), and clause 1 of the letter must be complete first.
2. *Can Accounting switch the model?* No. Accounting reads the page and can mark a fee settled, but only after its disclosure.
3. *Under model B, when may a fee be paid?* Only after its disclosure to the client has been recorded.
4. *Under model C, a clause 13 credit note reduces our fee. What happens to the firm's 10%?* A reversing entry of 10% of the amount credited is written beside the accrual. The accrual is never edited or deleted.

---

### Training — `B33`–`B39` the compliance registers

Address: /staff/compliance (links along the top: Compliance · Due diligence · Rights requests · Complaints · Breaches · S2 — identity store · Retention)

**What it is for.** The data-protection and money-laundering records Caprebate must keep: rights requests, complaints, breaches, the identity store, consent history, retention, and customer due diligence (switched off). The landing page carries the two dated settings, the register counts and a person search.

**Who can open it.** Admin only. Sales was refused "not authorised". Remember the banner: one Admin login types both names, so the two-person check is **not** enforced.

**How to do the common job** (record a dated setting)
1. On the landing page, under "Settings — dated, and sourced", choose "Setting" and "Value".
2. Fill in "Takes effect" and "Where it comes from — a written answer, a policy schedule".
3. Press **Record a new dated value**. The old value stays on the record; the new one applies from its date.

**What it will refuse, and why.** A value with no date: "Setting not recorded — Say from when it takes effect." A setting that cannot be dated cannot be checked later.

**Try it on the demo.** Record "Customer due diligence is in force" = "On — ENGAGEMENT cannot complete without a finished check", taking effect 31/12/2026, with the source *Training exercise only*. *Observed:* saved; today's reading still says "Off — nothing blocks a claim". **Do this only on the demo.** On a live system, this value may only be recorded once the solicitor's written answer exists.

#### Due diligence
Address: /staff/compliance/aml. It reads "OFF — nothing here blocks a claim. The register can still be kept." To keep the records anyway, use **Record an appointment** (the nominated officer), **Record a dated assessment** (the firm-wide risk assessment) and **Open a check** (choose the "Organisation" and "Kind of claimant"). *Observed:* the page opens with "Officers — None recorded", no risk assessment and "Checks — None." Company ownership data from Companies House does not count as proof of who owns the business.

#### Rights requests
Address: /staff/compliance/rights. Use **Log a request**: give "Received" (when it arrived, not when it was read), "How it arrived", their words, and tick each right under "The rights it engages — one clock each". *Try:* received 2026-09-10 09:30, dedicated address, Art 15. *Observed:* **RR-001**, earliest deadline **2026-10-09**. Its page shows the arithmetic ("one month beginning with 10 September 2026 ends 9 October 2026") and notes "on the alternative reading 10 October 2026; Caprebate works to the earlier".

#### Complaints
Address: /staff/compliance/complaints. Use **Log a complaint**, and classify it "now, on receipt" (is it a s.164A complaint?). *Try:* received 2026-09-11 14:00 by post, "No — not a s.164A complaint". *Observed:* **CP-001**, Acknowledge by **2026-10-10**, "not acknowledged yet", OPEN.

#### Breaches
Address: /staff/compliance/breaches. Use **Open an entry**. Awareness is fixed on the day, and "What happened — never bank details". *Try:* a description containing "sort code 12-34-56". *Observed:* "Entry not opened — The breach register never records bank details, and this carries a sort code." Without it: **PDB-001**, "72 calendar hours from awareness (Friday 2026-09-11 at 16:30 BST) end Monday 2026-09-14 at 16:30 BST".

#### S2 — the identity store
Address: /staff/compliance/identity. There is no list of names. You can **Search S2 — logged**, or **Record a person printed on a document**. *Try:* search "Smith". *Observed:* the page returns with no list, and the search is logged. Opening a made-up person reference answered "not authorised", exactly as a real one you may not see would.

#### Consent history
Address: /staff/compliance/consent/… (for one contact). *Try:* the Decision Maker Contact at Dunmarrow Medical Practice Limited. *Observed:* Being contacted "not given"; Marketing "not given — the box is never ticked for anyone"; Sharing progress with a referring firm "never asked — nothing is shared". A new answer goes in with **Record an answer** (Which, Answer, and the version of the words they were asked).

#### Retention
Address: /staff/compliance/retention. This is a list, not a deleter. *Observed:* every row is UNSET or "DERIVED, NOT APPROVED" with "No date is computed". Staff tasks show 11 records and "no delete is offered", because the table refuses deletion by design.

**Check yourself**
1. *Two names must sign off a breach decision. Does the system check two people did it?* No. One Admin login types both names; the names are a record, not a control.
2. *Where is the deadline for a rights request stored?* Nowhere. It is worked out from the recorded dates each time the page is read, and the working is shown.
3. *Can you print a list of everyone in the identity store?* No. There is no list: a person is opened by reference, and every opening and search is logged.
4. *Is there a record of which firms have received a client's data?* Not yet. The per-disclosure log is built but switched off, so it records nothing and says "NOT KEPT", never "none".

---

### Training — `B40` the dashboard

**Phase 135, 21 September 2026.** The dashboard is no longer a tab: press **See the dashboard** on **Home**. Phase 136
moves its figures onto Home's tiles.

**What it is for**
A management view read fresh on every visit. It has tiles for the pipeline, estimate to outcome,
the money, the work waiting, compliance clocks, and survey jobs. Nothing on it is stored, and a
figure nobody can know yet is said in words, never shown as nought.

**Who can open it**
All four staff roles, but each tile is drawn only for a role that may read every figure in it:
- Admin sees the most, including **Compliance**.
- Sales sees **The pipeline**, **Estimate to outcome, and what is still to issue**, **Work waiting** and **My survey jobs**.
- Accounting sees **The money** only.
- A surveyor sees **My survey jobs** only.

Address: `/staff/dashboard`

**How to do the common job**
1. On **Home**, press **See the dashboard**. The first line gives the UK date the figures are "as at".
2. Read each tile's figures, then the line under them saying what is counted apart ("counted apart, and never added in as nought").
3. Read the sentence at the foot of each tile saying how it is worked out.
4. Open the page behind a tile (Pipeline, Finance, Tasks) to act.
5. **For a report over a period** — this is the reports screen, and there is no other — choose **Period**: This month, This quarter, A UK financial year — 1 April to 31 March, or From one UK date to another. Give **For a financial year, the year it starts in**, or **For a range, from** and **to**, where the choice asks. Press **Show**. **No period** puts the dashboard back as it was.
6. Read the last line of each tile: a tile the period applies to says so, and one that counts what stands today ends "As at today — a count of what stands now, which the period chosen does not change."

**What it will refuse, and why**
- A tile your role may not read in full is not built for you at all: "A tile you do not see is not hidden from this page; it was never built for you."
- A surveyor's tile never carries a figure of ours: "No figure of ours is on this tile, for anyone."
- Unknowns are never added in. For example, "2 open claims carry no sealed estimate — counted apart, and never added in as nought".
- A range that ends before it starts is not applied, and the page says why: "From and to: the range ends before it starts, so the tiles read with no period".
- A lost lead carries no date it was lost, so with a period chosen it is counted apart rather than placed in the period.

**Try it on the demo**
As Sales: **Open pipeline value** reads "8 claims", "£1,800,000 over 6 claims", with the two claims
that have no estimate counted apart. **Overdue tasks** reads "1 task". As Accounting: only **The money** —
"Invoiced … £45,000", "Paid … £20,000", "Outstanding … £25,000", "Overdue £0 on 0 invoices". As the
surveyor: only **My survey jobs** — "CR-2026-0006 · Survey · waiting for your figures",
"CR-2026-0004 · Survey · waiting for your figures" and "CR-2026-0008 · Invoice · your figures are
committed".

Now, as Sales, choose **This quarter** and press **Show**: "Read over this quarter, July to September
2026, from 2026-07-01 to 2026-09-30 by the UK date." Choose **A UK financial year** with 2026:
**Won and completed claim value** reads "Completed — closed in the UK financial year 1 April 2026 to
31 March 2027 0 claims", while **Open pipeline value** still reads "8 claims" and "As at today". Choose
**From one UK date to another**, from 2026-09-30 to 2026-09-01: the tiles read with no period, and
the page says why.

**Check yourself**
- *Why is Accounting's dashboard so short?* — It is drawn only with tiles whose every figure Accounting may read.
- *Two invoices have no due date. Are they in "Overdue"?* — No; they are counted neither overdue nor on time.
- *Is the pipeline value stored anywhere?* — No; it is read from the records every time.
- *Where is the reports screen?* — This dashboard, with a period chosen. Nothing is stored for a report.

---

### Training — `B41` search

**What it is for**
One box that finds organisations, new enquiries (leads with no organisation record yet), contacts, properties, claims,
invoices and internal notes — only within what your role may read. The page always lists what was
searched and what was not.

**Who can open it**
All four staff roles. What each searches differs:
- Accounting searches claim references and invoice numbers.
- A surveyor searches the properties and claims their own survey jobs reach.
- Sales searches everything except invoices.

Address: `/staff/search?q=…`

**How to do the common job**
1. Open **Search**.
2. Type at least two characters in **Search for** and press **Search**.
3. Read the results, grouped by kind, and open one.
4. Read **What was searched**: "searched", or "not searched: not yours to read".
5. For an invoice, type its number or the start of it, for example CB-0.

**What it will refuse, and why**
- One character: "Type at least 2 characters to search."
- Some things are never searched, for anyone: the identity store, the compliance registers, the text of any document, the estimate, and notes for a role that may not read notes.
- Nothing you may read: "Nothing you may read matches."

**Try it on the demo**
As Sales, search "Ald": it finds Aldergate Care Group Limited under **Organisations** and its main
site under **Properties**, and **What was searched** shows "Invoices — number — not searched: not
yours to read". As Accounting, search "CB-000001": "CB-000001 Dunmarrow Medical Practice Limited ·
CR-2026-0004". The start of a number, "CB-0", lists CB-000001, CB-000002 and CB-000003. As the surveyor, search "Dun":
only the Dunmarrow property, "searched, the ones your own survey jobs reach".

**Check yourself**
- *Can you find text inside an uploaded lease?* — No. Document text is never searched.
- *Why does Sales not find invoice numbers?* — Invoices are not Sales' to read.
- *Accounting types "CB-0". What comes back?* — Every invoice whose number starts that way. Sales, which may not read invoices, gets none.

---

### Training — `B42` lists, saved views and export

**Where things are on the page (Phase 133a, 17 September 2026).** On Claims and Leads, **Filter, sort and save** — with
the saved views and the export link — sits in a panel beside the list (above it on a phone). A column heading that is
underlined is a quicker way to choose the order: it keeps every filter and changes only the order, and the heading in
use says "— sorted".

**What it is for**
The **Claims** and **Leads** lists with filters and sort orders, named views you can come back to, and
a CSV export of exactly what you may read.

**Who can open it**
- **Claims** list: all four staff roles, each seeing only the rows and columns it may read.
- **Leads** list: Admin and Sales (Accounting and Surveying are refused).
- Export: Admin, Sales and Accounting (claims only for Accounting); Surveying is refused.

Address: `/staff/claims` · `/staff/leads` · export: `/staff/claims/export.csv`

**How to do the common job**
1. Open **Claims** and **Filter, sort and save**.
2. Choose filters such as **Owner**, **Stage**, **Where it stands**, **Source**, **Sector**, **Jurisdiction**, the opened dates or — Admin and Sales only — **Estimated value at least, £**. Choose an **Order**.
3. Press **Show**. The line under the form says how many of the rows you may read are shown.
4. To keep it, type a name in **Save these filters as** and press **Save view**. It appears under **Saved views**; **Retire** removes it.
5. Click **Export these N rows as CSV**. The file has only your columns, and the export is recorded.

**What it will refuse, and why**
- A filter or order the list does not offer is ignored and named: "colour: not a filter this list offers, so it was not applied", "Sort: not one of the orders offered".
- A view with no name: "Give the view a name of up to 120 characters."
- Exporting as a surveyor: refused.
- A cell beginning with =, +, - or @ is neutralised in the export, so a spreadsheet never runs it.
- A filter on a column you cannot read is not applied to the file. As Accounting, `/staff/claims?stage=SURVEY` says beside the link "The file does not apply stage — not columns you read.", and the export's record names it.

**Try it on the demo**
As Sales, show **Stage** = Survey: "3 shown". Add an unknown filter by hand (…&colour=red) and the
page names it as not applied. Save the view "Claims at survey"; **Saved views** shows "Claims at
survey — yours" with **Retire**. Export: Sales' file starts "Reference,Client,Property,Workstream,
Stage,Owner,Priority,Next action,Next action due,Expected completion,Opened,Estimated value — the
range shown". Accounting's starts "Reference,Client,Opened". The surveyor is refused.

**Check yourself**
- *Why doesn't Accounting see a Stage filter?* — It cannot read the stage; its filters are dates and order.
- *Does retiring a view delete it?* — No; it is retired, never deleted.
- *Can an export include the value for Accounting?* — No; only columns the page would show you.

---

### Training — `B43` admin settings

Address: /staff/admin-settings

**What it is for.** Keeping the pick-lists staff choose from (lead sources, priorities, task types, property types, introducer types) and the two reason lists. It also gathers the other settings into one read-only view, and it names everything no setting may ever change.

**Who can open it.** Admin and Sales can read it; only Admin changes it. Accounting, Surveying and clients are refused, and Sales asking to change a setting got "not authorised".

**How to do the common job**
**Where things are (Phase 133b, 17 September 2026).** Choose a section from the list down the left — each pick-list, each reason list, the summaries of **Document types**, **Automation rules**, **Email templates**, **Finance settings** and **Compliance settings**, and last **What a setting may not change**. Only that section shows. After a save the page opens on the list you saved in.

1. **Relabel:** change the label box on the value's row and press **Save**.
2. **Retire:** change the state to "retired" and press **Save**. The value stays on old records but is no longer offered.
3. **Add:** under the list, type a "Code" (capital letters, digits and underscores) and a "Label", then press **Add to …** (or **Add a reason**).
4. Rows marked "written by the application — never retired" can be relabelled only.

**What it will refuse, and why**
- "The application writes this value itself, so it is never retired." The system itself relies on that value.
- Adding a stage: "The stages are the operating procedure’s ten, each with its gate and its exits. A stage is never added, removed or reordered by a setting."
- Any item under "What a setting may not change" (the last section), asked for with **Ask**, gets a page headed "Not a setting" with its reason, and the attempt is recorded. Gates, tax adviser switches, fee switches and role boundaries belong to their owners, not to whoever holds the admin login.

**Try it on the demo**
1. Under Lead sources, set **OUTBOUND** to retired and press Save. *Observed:* its state reads "retired", and the Leads page no longer offers Outbound.
2. Relabel **WEBSITE** to *Our website*. *Observed:* saved, and Leads now shows "Our website". (It has no retire option; forced, it answered "The application writes this value itself, so it is never retired.")
3. Under Property types, add Code *HOSPICE*, Label *Hospice*. *Observed:* added, active.
4. Under "Ask to change one anyway", choose **FEE_TRIGGER** and press **Ask**. *Observed:* "Not a setting — When our fee is earned is Lakhbir’s question, and the invoice stage waits on it in code."

**Check yourself**
1. *Why can a value be retired but never deleted?* Old records name its code; deleting it would leave those records pointing at nothing.
2. *Can this page switch on a fee control or a tax adviser's switch?* No. It is refused by name and recorded; those are code changes for the person who decides.
3. *A lead source was retired by mistake. What do you do?* Set it back to active and save; nothing was lost.

---

### Training — `B44` the document centre

**What it is for**
One list of every document you may read, across every organisation and claim, newest version first.
Each row gives the document, its type, its organisation, the claims it is linked to, its state, its
newest version and how many versions it has.

**Who can open it**
Admin, Sales, Accounting and Surveying — but each sees only the documents it may open on their own
page: Accounting the fee invoice and the signed letter, a surveyor the claim evidence of their assigned
jobs. A client is refused; the portal is the client's list.

Address: `/staff/documents`

**How to do the common job**
1. Open **Documents** in the menu.
2. Narrow the list with **Type**, **Organisation**, **Claim** and **State** (Received, Not received yet, or Refused), and choose an **Order**.
3. Press **Show**. The line under the heading says how many are shown and what was filtered; **Clear** starts again.
4. Open a document by its name to see its versions (`B28`).

**What it will refuse, and why**
- A document you may not open is not on the list at all: "a document you may not open is not on this list."
- A choice the list does not offer is not applied, and says so — for example "Type: not one of the choices this list offers you, so it was not applied".
- It never searches what a document says, and there is no export: "Never on this page, for anyone: what a document says — this list is of documents, and never searches their text; an export of documents — there is none, for anyone."

**Try it on the demo**
On a fresh demo every role's list reads "0 of the 0 you may read" and "No document you may read
matches." — nothing has been uploaded yet. Sign in as the client and send a fire risk assessment from
the portal (`C6`). Then, as Sales, **Documents** reads "1 of the 1 you may read": "Fire risk assessment
1 · Fire risk assessment · Corvale Supported Living Limited · on no claim · Received — a version has
passed the receipt strip · version 1 … the client · 1". Choose **Type** Fire risk assessment, **State**
Received and **Order** Type, then number, and press **Show**: the line adds "filtered by type — Fire
risk assessment; state — Received …". Signed in as Accounting, or as the surveyor, the list still reads
"0 of the 0 you may read".

**Check yourself**
- *Why does Accounting not see the fire risk assessment?* — It is claim evidence, and Accounting reads only the fee invoice and the signed letter.
- *Can you find a lease by a word inside it?* — No. The centre lists documents; it never searches their text.
- *Can you download the whole list?* — No. There is no export of documents, for anyone.

---

### Training — `B45` the audit log

**What it is for**
The record of what happened in the system — what kind of thing, when, by which role and id, about what,
and whether it was allowed — with a check, on every visit, that nobody has altered it.

**Who can open it**
Admin alone. Sales, Accounting and Surveying are refused.

Address: `/staff/audit`

**How to do the common job**
1. Open **Audit log** in the menu.
2. Read **The hash chain** at the top: intact, or broken at a named entry.
3. Choose a **Kind**, for example CLAIM_TEAM_LINKED, and an **Outcome** (Allowed, Refused or Error), and press **Show**.
4. Read each line: # · When · Kind · Role · Who (id) · About · Outcome.
5. To check a database without the server, a developer runs `npm run verify-audit` (Part 1, A11).

**What it will refuse, and why**
- Any role but Admin: "not authorised".
- A line's detail is never shown, and never read to draw the page — "a kind, the ids and the outcome are the record". The log holds no name, address, note or amount in any case.
- A choice not in the lists is not applied, and says so: "Outcome: not allowed, refused or error, so it was not applied".
- There is no edit and no delete, and reading the page is itself recorded.

**Try it on the demo**
Do the claim-team exercise in `B17`/`B18` as Sales. Then sign in as Admin and open **Audit log**: "The
hash chain: Intact: all … entries recomputed from the genesis, each linked to the one before it."
Choose **Kind** CLAIM_TEAM_LINKED and press **Show**: one line — "CLAIM_TEAM_LINKED · SALES · (an id) ·
claim (an id) · Allowed" — and the accountant's name is nowhere on it. Sign in as Sales and open the
address: "not authorised".

**Check yourself**
- *The log says a contact joined a claim's team. Which contact?* — The log gives ids, never a name; the claim page says who is on the team.
- *Can Admin correct a wrong line?* — No. Nothing in the log is changed or deleted, and a change made outside the application shows as a broken chain.
- *How do you know nobody has tampered with it?* — The page recomputes the chain on every visit and says whether it is intact.

---

### Training — `B46` Settings (Admin)

*Written by Phase 135 on 21 September 2026. The exercise was run on a freshly started demo that day.*

**What it is for**
One page for everything Admin sets up, so the setup screens are not seven tabs of their own. Each tile opens one screen
and says in a line what it is for.

**Who can open it**
Admin. It is Admin's last tab, **Settings**. Nobody else is given the page. The screens behind the tiles still open by
their own addresses for whoever could open them before (Sales and Read only may still read the switches, the document
types, the automation rules and the email templates).

Address: `/staff/admin`

**How to do the common job**
1. Press the **Settings** tab.
2. Press a tile: **Users**, **Switches** (the screen headed Admin settings, `B43`), **Document types**, **Automation**,
   **Email templates**, **Compliance**, **Audit log** or **Introducer fees**.
3. The **Settings** tab stays marked while you work on that screen. Press it to come back to the tiles.

**What it will refuse, and why**
- Anyone but Admin opening `/staff/admin`: **You cannot open this page**. The tiles are Admin's setup work.
- A tile is drawn only where Admin may open the screen behind it, so no tile leads to a refusal.

**Try it on the demo**
Sign in as Admin and press **Settings**. *Observed on 21 September 2026:* eight tiles, in this order: Users ("Add a
colleague, change their role, or stop their sign-in."), Switches, Document types, Automation, Email templates,
Compliance, Audit log and Introducer fees ("What we pay firms that send us clients."). Press **Automation**: the page
opens and the **Settings** tab is still marked.

**Check yourself**
- *Where is Admin settings now?* — **Settings** → **Switches**. The screen is the same.
- *Your own password and the outbox?* — **Your account**, in the menu under your name. That was called Settings before.

---

### Training — `C6` the portal's CRM additions

**Phase 134, 18 September 2026 — "Your claims".** The portal's one tab is **Your claims**. The page is headed with the
company's name, and a **Your claims** card shows one tile per claim: the property, its town, how far it has got, and the
reference in grey. Pressing the property opens that claim's progress, with the steps drawn for that claim alone.
Questions, documents and messages for all the company's claims stay on the main page. A client can only ever open their
own company's claims; any other address answers "We cannot find that claim". *On the demo:* as
client@example.invalid, **Your claims** shows one tile, **main site**. As admin, open
`/portal?business={Elverton's id}` to see a company with three.

**Where things are on the page (Phase 133c, 17 September 2026).** The portal opens with the business's name and two
buttons, **Book a call** and **Who to contact**; the **Welcome to Cap Rebate** card until the client hides it; **How to
contact us**; the **stage bar** of the six client-facing steps; **The range you were shown**, with its basis underneath;
and **What we need from you** — each open question and each document we have asked for, linked to its form. Then the
questions, the documents asked for, **What happens at each step** (behind **Show each step**), and every other section.
**Help** at the top opens this section. (Until Phase 133c, **How to contact us** was at the foot and the card was headed
**What we are waiting for from you**.)

**What it is for**
The client's claim page gained three things: **What we have issued to you** (deliverables issued to
the client, never with a figure), **Documents we have asked you for** (each request with an upload
button), and **The firm that referred you** (whether progress is shared, with a way to stop). The
questions section takes "I don't know" as an answer.

**Who can open it**
The client, on their own organisation only. Staff record answers and share consent on their own
screens.

Address: `/portal`

**How to do the common job**
1. Sign in as the client; you land on your claim page.
2. Under **Questions we still need answered**, type an answer or tick **I don't know**, and press **Send this answer**.
3. Under **Documents we have asked you for**, press **Get an upload link for this document**. On **Your upload link is ready**, press **Choose the file**, pick it, and press **Send the file**.
4. Under **What we have issued to you**, read what has been issued, with its version and date.
5. Under **The firm that referred you**, press **Stop telling … how my claim is progressing** to stop sharing.

**What it will refuse, and why**
- A blank answer: **Not saved** — "write an answer, or tick “I don't know”".
- Stopping when nothing is shared: **Not changed** — "Nothing is being shared with that firm, so there is nothing to stop."
- Saying yes from the portal (switched off): "You cannot turn this on from your portal yet. If you would like us to keep the firm informed, tell us and we will ask you properly."
- Reusing an upload link: "That link has been used" — nothing is written twice.
- Sending with no file chosen: **Not accepted** — "no file was attached. Choose the file and send it again."

**Try it on the demo**
First, as Sales, put a question to Corvale from its business page and request the lease (`B27`).
Then record a lead by hand for Corvale with source Accountant and the firm Quarrendon, and record
the client's answer as Yes. Sign in as the client:
- Answer "do you own the freehold or hold a lease" with **I don't know** → "✓ … answered “I don't know”".
- Upload the lease → "Received", and the request reads "✓ Lease, and any licence for alterations — received, version 1".
- **The firm that referred you** reads "Yes — we tell Quarrendon Invented Tax LLP how your claim is progressing". Press the stop button → "No — we tell Quarrendon Invented Tax LLP nothing about your claim."

**Check yourself**
- *The client ticks "I don't know". Is the question closed and forgotten?* — It is answered, but the fact stays missing and must come from elsewhere.
- *Can the client mark a requested document as sent?* — No; the upload itself marks it received.
- *Will a client ever see a figure under "What we have issued to you"?* — No; issued items carry no figure.

---

### Training — `C11` the public referral form

**What it is for**
A public page where an accountancy practice could refer a client without signing in. It asks for:
the practice, the person's name, email and telephone; the client business's name, sector, and
postcode or its first half; what happened at the property and the year; and the practice's
confirmation that its client agreed. **It is switched off**, until a privacy notice is published
that tells a referred client what a firm passed to us.

**Who can open it**
Nobody while it is off. When it is switched on: anyone, without signing in.

Address: `/refer`

**How to do the common job**
1. While it is off, there is nothing to do. Staff record referrals on **Introducers** (`B30`).
2. When it is switched on, a practice fills in the form and confirms its client agreed.
3. The result would be a lead of origin Referral on a new firm record marked as coming from the form. It never attaches to a firm already recorded; an Admin can later merge a firm the form made twice.
4. Sales then works that lead as any other (`B19`/`B20`).

*The on-screen labels cannot be checked while the form is off, so none are quoted here.*

**What it will refuse, and why**
- While off: the address answers exactly as an address that does not exist.
- When on (sentences taken from the code): "Name the client's business — a referral is about an organisation."; "Give an email address, so we can reply to the referral."; "Confirm that your client has agreed to you passing their business's details to us."

**Try it on the demo**
Not signed in, open `/refer` and then a made-up address such as `/no-such-page`. Both answer the same
way (the sign-in failure message, "those details did not match"). Signed in as Sales, both answer
"not found". Sending the form while signed out gets the same answer as the made-up address. Nothing
reveals that a form exists.

**Check yourself**
- *A practice says the referral link "doesn't work". Is something broken?* — No; the form is switched off and deliberately looks like a missing page.
- *What must happen before it can be switched on?* — A published privacy notice telling referred clients what a firm passed to us.
- *If a firm uses the form twice, is it attached to the existing firm?* — No; it makes a new firm row, which an Admin can merge.

---
