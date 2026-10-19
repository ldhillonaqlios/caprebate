# Caprebate — the Administrator Guide and the User Guide

**It goes with `09-app/CAPREBATE-DEVELOPER-SPEC.md`.** It was written on 12 September 2026. It covers rows 26.11 and
26.12 of the CRM table of open items. Those rows asked for an admin guide, and a user guide with basic training.

**The Developer Spec says what the system is. This says how to use it.** Sometimes the two may not agree. Then the
running app is right. The document that says something else has a mistake in it.

---

## Read this first — it is a prototype, and everything in it is invented

**There is no real client, person, property or document anywhere in this system.** The six businesses in it are
made up. Every postcode is from the `ZZ` range, which is kept for made-up places. Every login uses the same known
password. **Nothing leaves the building.** An email is kept with the **emails waiting to send**. It is marked
*not sent yet*. No outside register or supplier is ever contacted. **Do not put it on a public address. Do not put
real client data into it.** First, a developer must do the work in Developer Spec §5.

**To open it for training**, go to the `09-app/backend` folder and run:

```bash
npm install
npm run start:demo
```

It starts on `http://localhost:8105`. It loads a fresh copy of the invented data into memory. It forgets everything
when it stops. So a training session can try anything and not spoil the next one. Sign in as any of these. They all
use the password `change-this-seed-password`:

| Sign in as | Role | What that person does here |
|---|---|---|
| `admin@example.invalid` | Admin | Users, settings, the switches a screen may show, the compliance registers |
| `sales@example.invalid` | Sales | Leads, organisations, properties, claims, tasks, documents, introducers |
| `accounting@example.invalid` | Accounting | Caprebate's own invoices and money — nothing else |
| `surveying@example.invalid` | Surveying | Their assigned survey jobs, and what those jobs reach |
| `client@example.invalid` | Client | Their own business, in the portal |

**There is no demo login for the view-only role.** The role is called READ_ONLY. Nobody has it, so the demo data has
no such user. To try it, make one on Users and roles (A2).

**The client's accountant never has a login. Nor does any introducer firm.** They are contacts, not users. The same
goes for the chartered tax adviser. Their sign-off is a record that Sales keeps. They do not sign in.

## Six things that are true on every screen

1. **You see what your role may see, and nothing more.** If you may not open a screen, it is refused. It is not
   shown with the figures blanked out. A record that does not exist gets the same words as a record that is not
   yours. This is on purpose. It stops anyone from finding out what exists by guessing.
2. **"Not known" is an answer, and it is never treated as a yes, a zero or a pass.** A question nobody asked and a
   question answered "not known" work the same way. No form makes you guess to get past it.
3. **Nothing is deleted.** A task is cancelled with a reason. A claim that ends keeps its record. A list value is
   retired. A new version of a document never writes over the old one.
4. **Dates are shown in UK time**, and *overdue* means the due date is before today's date in the UK.
   A task with no due date is neither overdue nor on time.
5. **Every change is recorded** in an audit log. Nobody can edit the log. It says who did what, and when. It never
   keeps the words of a note or an amount.
6. **"Switched off" means built, tested and waiting for a named person's decision.** The screen says
   so, and no setting turns it on.

## The layout — the same on every staff screen

Each login has an easy layout of its own. **Nothing a role may see or do changed** — only where things sit.

- **The menu** runs down the left of every page. It has the same dark colour and logo as our home page. Each screen
  has a small picture beside it. The page you are on is mint green. At the top is **Cap Rebate**, which takes you back
  to your home page.
- **The bar at the top** of the page shows where you are, such as **Cap Rebate / Clients / Dunmarrow**. Press a name
  in it to go back there. Then comes the **Search** box. This is the same search as `B41`. Then **Help**, and your
  **name**. Your name opens a small menu with **Your account** and **Sign out**.
- **The menu lists your role's screens, in groups.** It shows only the screens you work in every day. Nothing is
  hidden under **More** any more. **Tasks shows how many open tasks you have** — the number turns red when one is
  late. **No permission changed.** A screen that is not on your menu still opens by its address. It also opens from a
  link on a page that leads to it.
- **On some pages the menu opens out.** In **Settings**, each setting is listed under it, and the one you are in is
  green.
- **On a phone** the menu folds away. Tap **Menu** at the top to open it. Tap it again to close it.

  | Role | Menu |
  |---|---|
  | Sales | Home, Tasks · **Winning clients:** Leads, Pipeline, Introducers · **Clients and claims:** Clients, Calendar |
  | Accounting | Home, Tasks · **Clients and claims:** Clients, Claims · **Money:** Finance, Introducer fees |
  | Surveying | Home, Survey jobs, Tasks |
  | Read only | Home · **Winning clients:** Leads, Pipeline · **Clients and claims:** Clients |
  | Admin | Home, Tasks · **Winning clients:** Leads, Pipeline, Introducers |
  | Admin, below | **Clients and claims:** Clients, Survey jobs, Calendar · **Money:** Finance · **Admin:** Settings |

  **Where the screens that left the tabs are now:**

  | You used to open | Now |
  |---|---|
  | Engaged clients, Organisations | **Clients** — one list of every company, name first |
  | Assessments | **Leads**, then **Filled assessments** at the top of the list |
  | Next actions | **Tasks**, then **Claims with no next step** at the top of the list |
  | Dashboard | **Home**, then the **Reports** tile |
  | Properties, Claims (Sales, Admin, Read only) | a company's page on **Clients**, the **Pipeline**, or **Search** |
  | Documents | a company's page on **Clients** (the Documents box) |
  | Users, Document types, Automation, Email templates | Admin: **Settings**, one tile each |
  | Compliance, Audit log | Admin: **Settings**, one tile each |
  | Admin settings | Admin: **Settings**, then the **Switches** tile |
  | Reward model | Admin: **Settings**, then the **Introducer fees** tile |
  | Settings in the menu under your name | **Your account** — the same page |

- **Home** (`B0`) opens with cards for your role. They answer "what do I do next". Then comes **My tasks**.
- **A record page** is the page for a claim, an organisation, a property or a lead. It has four parts:
  1. A **highlights** strip at the top, with the key facts.
  2. On a claim only, the **stage bar**. It shows the ten stages, with the current one filled in. A long stage name
     goes onto a second line. It is not cut short. Under the bar, it says if the claim is **Ready** to move on or
     **Not ready yet**. It also shows the first thing still needed.
  3. Three **tabs**: **Details**, **Related** (with a count) and **Activity**.
  4. On the right, the **Next step**, the **Next action** and **Quick actions**. Quick actions are links to the form
     further down. For example: **Log a call or add a task**, **Request a document**, **Move the claim**.

  Every panel the page had before is still there, in one of the three tabs.
  **A claim's page and a company's page are different.** They have coloured boxes that open and close, not tabs. See
  the training for `B5`/`B6` and `B17`/`B18`. A property page and a lead’s page have the boxes too.
- **Five long screens were changed too.** Three of them open with highlights, tabs and the right-hand panel, like a
  record page. These are the **business page** (`B6`), the **survey job** (`B8`) and **Finance** (`B9`). Their tabs
  are named for what is in them. They are not called Details, Related and Activity. The other two have a **list of
  sections down the left** instead. These are **Admin settings** (`B43`) and **Document types** (`B29`). Pick a section
  and only that one shows. Nothing moved off any of the five. Each section is in a tab or in the list. After you save
  something, the page opens on the tab or section you saved in.
- **The pipeline** (`B21`) is one table of claims, in coloured groups of stages. **Show as a board** gives one column per stage.
- **Claims** (`B17`, `B42`) show the **Filter, sort and save** panel beside the list. Click an underlined column
  heading to sort the list by it. **Leads** (`B19`) are cards in four sections. The same panel is behind its
  **Filter** button. The table is **List view**.
- **Some screens your role may not open.** Then you see a page headed **You cannot open this page**. It has your own
  tabs and a button back to your home page. Sometimes this guide says a screen answers "not authorised". That is the
  page you see. A data address ends `.json` or `.csv`. It still answers `{"error":"not authorised"}`.
- **Everything works without JavaScript.** It works with the keyboard too. Every link and button shows a clear
  outline when it is picked. It also works on a phone or a tablet.

### The Cap Rebate look, and a system a new user can pick up

**Nothing a role may see or do changed.** What changed is how the screens look and how they read.

- **The name.** Every page says **Cap Rebate**, as two words. So do the header, the footer, the client's portal and the
  emails. This is what the brand book says. The sign-in page, the public pages and the portal show the Cap Rebate
  logo at the top left. The back office shows the name.
- **The colours.** The page is white and a pale mint-grey (Mist). Text, buttons and lines are near-black (Cap Ink).
  Cap Mint is only for things that should stand out. These are the tab you are on, the current stage, and the top edge
  of a highlights strip or a welcome card. Mint never has white text on it. Red, amber and green still mean overdue,
  waiting and done. They always come with words.
- **The type.** Headings use a slab font: Bookman Old Style, or the closest one your computer has. Everything else
  is in Calibri or the closest to it, at 16 px. Figures line up in columns.
- **Dates.** Every date reads the British way: **24 Sep 2026**; a time **24 Sep 2026, 12:32**, or **Today, 12:32** /
  **Yesterday, 12:32** for a recent one. A due date says how far off it is — **Due in 3 days (24 Sep 2026)**, **Due
  today (17 Sep 2026)**, **3 days overdue (14 Sep 2026)** — counted in UK days. What is stored does not change. A date
  box still takes a date the way your browser shows it.
- **Welcome.** **Help** opens with a card headed **Welcome to Cap Rebate**, until you hide it. For a client, the portal
  opens with it. The card shows the three jobs your login does most, as buttons. **Hide this welcome** removes it for
  good, on any computer.
- **Help.** **Help** is at the top of every page. It opens this guide's training for the screen you are on (Part 3).
  It opens inside the system. A client's Help opens the guide's part about the portal. It leaves out the trainer's
  exercise.
- **The next step first.** On a claim, the panel on the right starts with **Next step**. It shows one of two things.
  It may show a button **Move to …**. Or it shows **Not ready yet**, with the first thing still needed in plain words.
  Then there is one button that deals with it, such as **Ask the surveyor**. **See everything this stage needs** opens
  the full list. A lead does the same for its enquiry checks. A stop is information, not a failure. Nothing is red
  just because a stage is not ready.
- **Short fields, and "Why?".** A field shows only when something is recorded in it; one link, **Add missing details**,
  opens the form. Some answers decide something. An answer like that is always shown when it is **not known**. These
  are an enquiry check, a claim's facts, the jurisdiction and the claimant type. So is whether allowances were claimed
  before. The longer notes that used to sit under a field are now behind a small **Why?**.
- **Forms.** The fields most people need come first; the rest are under **More options**. **Every** field you must fill
  in says **(required)** beside its name, on every screen. A form may be refused. Then the page you typed on comes back
  with **what you typed still there**. You do not start again. The reason shows **beside the field it is about**, and
  that field is outlined. This is true on every back-office form where the problem is about one field. Here are those
  forms:
  - the ten used most. They are the forms for a task, the next action, a lead and an enquiry check. Then moving a
    claim, the claim's details and the organisation. Then a contact, a property and a document request;
  - finance, introducers, the claim's facts, grants and past owners;
  - document types, automation rules, templates, admin settings;
  - your own account settings, Add a user, and the survey job.

  Some refusals are not about one field. For example, a stage is not ready yet, or an invoice was already sent. These
  still show at the top of the form. A screen reader reads each required field's name with it. This is because every
  label is joined to its field.
  After a save, **Saved.** shows at the top of the page.
- **"The data this page was built from"** is shown to Admin only.
- **The client's six step names are switched on, from 22 September 2026.** The portal shows a client these steps, not
  the back office's stage names:
  - **1 Your estimate**
  - **2 Engagement letter signed**
  - **3 We research your property**
  - **4 Expert sign-off**
  - **5 Claim filed**
  - **6 Aftercare**

  Staff screens keep the stage names. *The menu names are settled too. Reward model is now **Introducer fees**.
  Engaged clients and Next actions are no longer in the menu at all.*
- **Plain words on every screen, from 22 September 2026.** We wrote every screen again, in the back office
  and the portal. Now a 12-year-old could read it. The old design words are gone from the screens. This guide now uses the words you see.
  See `B51` for the old words and the new ones.

## Contents

| Part | For | What is in it |
|---|---|---|
| **1 · The administrator guide** | Admin | Users, roles, settings, rules and templates. The switches, the registers and the audit log |
| **2 · The user guide** | Every role, and the client | A working day for each role, and the words that mean something special here |
| **3 · Training, one screen at a time** | Anyone learning a screen | What each CRM screen is for, who opens it, and how to do the common job. Then what it refuses and why. Last, an exercise on the demo data, and questions to check yourself |

## Part 1 · The administrator guide

This part is for whoever holds the Admin login. It goes through each Admin screen. For each one, it says what the screen
is for, what it lets you do, what it will not let you do, and why. Every button, field and message quoted here comes
from the running demo. We read it on 12 September 2026. Some screens changed later that day, so we read those again. Where a screen
could not show something, we read it from the code, and we say so each time.

Each screen is named by its heading. Its web address is on a small "Address:" line, in case you need to type it.

---

### A1 · Before anything

**This is a test system. Everything in it is made up.** The six businesses below do not exist:
- Aldergate Care Group Limited
- Brackenfell Dental Partnership LLP
- Corvale Supported Living Limited
- Dunmarrow Medical Practice Limited
- Elverton Private Hospital Limited
- Fenmoor Nursing Homes Limited

Their people, sites, postcodes and figures are made up too. Never put a real client, a real person or a real document
into it. The foot of every staff page says that no payment is taken. It says no signature provider is connected. It
starts: "This is a test system."

**Never load the demo data into a live system.** Loading it makes one login for each role. All five share a password
that anyone can read: `change-this-seed-password`. So the command that loads it will not run unless someone sets
`CAPREBATE_ALLOW_SEED=1` on purpose. Without it, the command stops. It says *"refusing to seed: set
`CAPREBATE_ALLOW_SEED=1` to confirm this is not production"*. The demo launcher stops too. It says *"refusing to run: this
launcher seeds invented data with a known password"*. The setting is there so nobody loads made-up data by mistake. It
would be too easy to forget a flag. On a live system, nobody should ever set it.

**Nothing leaves the building.**
- **Emails are saved, not sent.** These all wait in one list:
  - an email typed on a client's **Email** page;
  - an email made from a template;
  - a notice from an automation rule;
  - a letter from a compliance register.

  Nothing sends them. To see the list, open **Your account** (the menu under your name, at the top right). It is at the foot, under
  **"Emails waiting to send"**. The columns are **When**, **What it is**, **Subject** and **State**. **What it is** reads,
  for example, "From a template", "Typed by staff", "An alert" or "Calendar invite". Every row's state reads **"Saved —
  not sent yet"**. A company's own email has a link, **Open the Email page**. The page says: "Emails are not being sent
  yet. Each one is saved here until sending is switched on. Calendar invites wait here too. Each one carries a calendar file, so it can go in any calendar. A company's own emails are on
  its Email page."

  Every email says it is from **Cap Rebate <contact@caprebate.co.uk>**. Replies go to the same address. Sending is built,
  but it is switched off. It stays off until all of these are done:
  - an email service is chosen;
  - it is named in our privacy notice;
  - it is named in the engagement letter;
  - the contact@ mailbox is set up;
  - the mailbox's email safety records are in place.

  Until then, the Email page says **"Saved — emails are not being sent yet."**
- **Nothing calls an outside register.** No link to Companies House, the Land Registry or any other source is switched
  on. You can still run the research on a client. Each lookup is then noted as not allowed yet, or not switched on yet.
  The reason is noted too. The free lookups wait for a published privacy notice. The paid ones wait for a signed
  engagement letter.
- **No money moves and nothing is signed.** The finance screen says "RECORDED, NOT COLLECTED". The client can read
  the letter and fill in the Sign box. Signing is not switched on yet, so pressing Sign says so. When it is on, the
  client types their name and role, ticks a box and presses Sign. We keep a record, and they get a copy by email.

---

### A2 · Users and roles

**The six roles.** Five roles do the work. A sixth can look but not change anything. ADMIN is the main login. There is
no manager role of its own. There is no tax reviewer role either.

| Role | Who it is for | What it reaches |
|---|---|---|
| **ADMIN** | The top user | Everything in the back office. It is the only role that can add users, change their role or turn them off. It alone changes the admin settings. It alone keeps the compliance registers. It alone switches the reward model, merges a firm and records a finance setting |
| **SALES** | The sales team | Filled assessments, the calendar and engaged clients. Leads, the pipeline and organisations. Sites and claims, with the claim's value. Introducers, but not the money. Tasks. It can **read** the automation rules. It can read email templates and document types. It can also read the reward page and the admin settings. It cannot change any of them. It cannot open Users and roles. It cannot open the compliance registers |
| **ACCOUNTING** | Our own finance staff | The finance screen. A claim's client, reference and money. A firm's name and money. The reward page (read only) and the dashboard. Nothing else. On the demo, it could not open Users. It could not open Automation. It could not open Templates or Document types. It could not open Admin settings or Compliance either |
| **SURVEYING** | The surveyor | Their own survey jobs, the ones given to them. A claim or a site, but only through one of those jobs. It is refused every Admin screen |
| **CLIENT** | A client business | Their own portal only. When they sign in, they land on the portal, not the back office |
| **READ_ONLY** | Someone who should see the work and change nothing. **Nobody holds it until you give it to them** | It lands in the back office. It reads organisations, and contacts one at a time. It reads sites, and claims **without their value**. It reads leads **without the figure shown**, and the pipeline. It reads the calendar, bookings, tasks and the timeline. It reads documents that carry no value, and the list of what we have sent. It reads the dashboard's pipeline tiles and the settings screens. It **writes nothing**, except to change its own password. It **never** sees our estimate, a claim's value or figures, or a claim's tax facts. It never sees the survey workspace, invoices or any money. Our fee is a share of the claim value, so a fee would give the value away. It never sees internal notes or paid research. Nor does it see the compliance registers. It never sees People named on documents, the disclosure log or the audit log. It **cannot export** a list. In the code, every rule says yes or no for this role. A test fails if someone adds a rule without one |

**A seventh role is built but switched off. You will not find it on this page.** It is a data protection officer role.
It would reach the compliance registers and nothing else. It would not reach the audit log or Users and roles. It would
not reach a claim, a document or the money. While it is off, the role list does not offer it. If you try to force it
on someone, you are refused. The message lists the six roles you can give. Lakhbir decides if it is ever switched on.
He asks: *"Do we need a compliance role separate from Admin?"*

**Two kinds of people never get a login.**
- **The client's own accountant.** They are a contact, not a user. They get the accountant's pack outside the system.
  The ACCOUNTING role is for our own finance staff. If a client's accountant had it, an outsider would see our fee
  records.
- **Anyone at a firm that sends us clients.** The Introducers page says the people at a firm are "its contacts, and none
  of them has a login".

Address: /staff/users. The page heading is **Users and roles**. You reach it from Settings, under "Administration".

**Adding a user.** Press **Add a user** at the top. The form opens. Fill it in:
- "Username — an email address"
- "Display name"
- "Role"
- "Business — for a CLIENT account only" (leave it empty for staff)

Then press **Create**. You do not type a password. We make a **temporary password** and show it to you once. Give it to
the person yourself, in person or by telephone, not by email. It works for 7 days. When they first sign in, they choose
their own password. Staff then set up their second step.

**A new temporary password, or a lost phone.** Each row has two buttons for this. One is **New temporary password**. The
other is **Reset second step**. A new temporary password signs them out and replaces their password. Their recovery codes
still work. Resetting the second step signs them out too. It also deletes their codes. They set it up again the next
time they sign in, and get new codes. A person who lost their phone should try a recovery code first.

**Changing a role.** Find the person's row. Press **Change role**. Choose the new role from the list and press
**Assign**. The page warns you: "Changing a role signs that person out at once. They sign in again with the new role."
Your own row has no **Change role**. Nor does a login that is turned off.

**What the page shows.** Four boxes count the staff, the client logins, the logins turned off, and the staff with no
working hours. Each row shows the role as a label. It says **Active** in green or **Turned off** in red.

**Turning a login off.** Press **Disable** on the person's row. They are signed out straight away, on every device. They
do not wait until they next sign in. After that, when they try to sign in, they get the usual "those details did not
match". There is no button to turn a login back on.

**What an Admin may NOT do.** The page says: "You cannot change someone's name, username or photo. Only they can, from
their own account." Each person changes their own details on their own Settings page. You cannot change your own role.
You cannot turn off your own login. You cannot turn off the last Admin either. If you could, nobody could ever make a
new one.

**Too many tries, and you must wait.** The sign-in page says: "After too many tries you must wait a while. If sign-in
fails, we do not say why." Too many tries for one address in a short time are refused. The message is just as vague. On
the demo, the sixth quick sign-in as admin was refused. Once you sign in, you stay signed in for eight hours at most.

**A forgotten password.** On the sign-in page, press **Forgotten your password?** Type your email address. We email you a
link. It works once, for 30 minutes. The page says the same thing for any address, so nobody can use it to find out who
has a login.

**The second step.** Every staff login needs one, each time you sign in. After your password, you give a six-number code.
It comes from an authenticator app on your phone, or in an email. You choose which the first time. A client may turn it
on in their portal. See `B55`.

**Recovery codes.** When you set up your second step, we show you ten recovery codes, once. Each code works once, in
place of your six-number code. Use one if you lose your phone or cannot get your email. Save them or print them. Keep
them somewhere safe, away from your phone. A password manager is good, or a printed copy at home. We only keep a scrambled
copy, so we cannot show them to you again. When you use one, we email you to say so, and how many you have left. With 2
or fewer left, the page after you sign in tells you. To get ten new ones, open **Your second step** and press **Make new
recovery codes**. That throws away the old ones you have not used. Three more things delete them: a new second step,
**Reset second step**, and a client turning their step off.

---

### A3 · Admin settings (`B43`)

Address: /staff/admin-settings. The heading is **Admin settings**.

The page opens: "You can change preferences here. Rules are fixed. … A value is retired, never deleted, and its code
never changes."

**The five lists:** Lead sources · Priorities · Task types · Property types · Introducer types.
**The two reason lists:** "Why a lead is lost" · "Why a claim leaves the procedure".

Each value shows its Code, Label and State. For the five lists, it also shows "Where it came from".

- **To rename** a value, change the words in its label box. Then press **Save**. The code stays the same.
- **To retire** a value, change its state from "active" to "retired". Then press **Save**. It stays on the record. It is
  just not offered for new choices. On the demo, we retired Outbound. After that, the Leads page did not offer it.
- **To add** a value, type a "Code" and a "Label" under the list. Then press the add button for that list:
  - **Add to lead sources**
  - **Add to priorities**
  - **Add to task types**
  - **Add to property types**
  - **Add to introducer types**
  - for a reason list, **Add a reason**.
  - A code uses capital letters, digits and underscores. It starts with a letter. It is 2 to 60 of them long. It
    never changes once saved.
- **Nothing is ever deleted.** Old records use these codes, so a value is retired instead.
- **You cannot retire a value the system writes itself.** Its row shows a note: "written by the application — never retired".
  Its state reads "active — the application writes it". There is no retire choice. If you try anyway, you are refused.
  The reason given is that the system writes the value itself.
  - Lead sources: Website, Referral, Accountant, Adviser, Other.
  - Priorities: Normal.
- **The stages are not a list.** If you ask to add one, you are refused: "There are ten steps, each with its own check
  and ways out. No setting can add, remove or reorder a step."

Below the lists, the page shows other settings. You can read them here, but not change them:
- the document types;
- the automation rules;
- how many templates there are;
- the finance settings;
- the compliance settings.

Each has a link to its own page. You change it there.

**The settings you may not change.** At the foot, under "What a setting may not change", the page lists them. Each is a
rule, not a preference. You can pick one under "Ask to change one anyway" and press **Ask**. Nothing changes. You get a
page headed "Not a setting", with the reason. Your request is written in the audit log. Each is named in words. (The system still stores a short code for each, which you never need.) Here they are, as the page lists
them:

| On the page | The reason it gives, in short |
|---|---|
| The check at the step "Enquiry", and one for each of the other nine steps | "Each step's check is built into the system and run at every move. A setting could get round it." |
| The ten steps of a claim | "No setting can add, remove or reorder a step." |
| Turning on free lookups | "No setting can turn on free lookups. They start when our privacy notice is published." |
| Turning on paid lookups | "No setting can turn on paid lookups. They need a signed engagement letter and a person to click." |
| "Tax adviser’s switch:" and its name, one for each of these: `s185_plus_own_s25`, `urenco_provision_of`, `specialised_supported_housing`, `trade_not_s35`, `s187a_needs_entitled_owner`, `grant_traced_after_dwelling`, `connected_contributor_no_reduction`, `s538_carveout`, `s187a_6b_statements_route`, `fvr_requires_past_owner_claim`, `transaction_tax_in_base`, `grant_after_ceilings` | It is a tax adviser's switch. It stays off until a chartered tax adviser answers. "Changing it is their call and a system change, never a setting." |
| "Fee rule: when our fee is more than the tax saved". "Fee rule: a claim that is stopped part way". There is no minimum fee, so none is listed. | "A fee rule. If a setting could change our pricing, whoever found the setting would decide it." |
| The introducer reward model | "An admin changes it on its own page, and not while clause 1 of the engagement letter is blank." |
| Taking back a fee (clause 13) | "Clause 13's fee clawback stays off until its three blanks are filled in. It is a system change, not a setting." |
| When our fee is earned | "Lakhbir decided when our fee is earned: when our report is delivered for filing. This is built in, so no setting can change it." |
| Money laundering checks | "That is set on the compliance page, with a date and a source. It is checked before we take on a client." |
| Clients agreeing to share progress | "That waits on wording our data protection officer agrees." |
| The public referral form | The public referral form waits until our privacy notice is out. "It is not a setting." |
| Sending invoices by email | "Turning them on is a piece of work, not a setting." |
| The 15% level for checking quotes | "The 15% review level is fixed in how we check quotes. It is not a setting." |
| How long we keep data | How long we keep data is fixed in the system. Our data protection officer signs it off first |
| Staff roles and what each can do | "The staff roles, and what each can do, are built in and checked on every request. A new or wider role is for Lakhbir to decide." |
| Keeping a file or deleting it, for each document type | "Whether we keep a file, or read it and then delete it, is fixed for each document type. Only a system update changes it." |
| Document types that can hold a value | Some document types can hold a claim value, a tax benefit or a fee. Such a type is never marked as holding none |
| The facts we hold about a claim; The ways we take in information; The payer types in Rulebook F | Each is fixed. A new one needs a system update. It is not a list value |
| What we give back to a firm | "The three things we give back to a firm under reward model A are fixed. They are only for tasks on a firm, and are not task types." |

---

### A4 · Document types (`B29`)

Address: /staff/document-types. The heading is **Document types**.

Each type shows:
- who may read it;
- whether it can carry a value;
- **What we do with the file**;
- **When it is deleted**;
- whether it is active.

A badge reads **No deletion date set yet** or **Deletion rule chosen**.

**What an Admin can change on a type:**
- **The label.**
- **"Who may read it"**. There are four groups:
  - *Claim evidence*: Admin, Sales, a surveyor on a job they were given, and the client.
  - *The claim team*: Admin and Sales, and the client whose document it is.
  - *Finance*: Admin, Accounting, and the client.
  - *The engagement letter*: Admin, Sales and the client. Accounting once it is signed. Never a surveyor.
- **When it is deleted**: **No deletion date set yet**, or **The 6-year rule for files a client sends**.
- **Whether the type is active or retired.**

Then press **Save** on the row.

To add a type, fill in "Add a type". The fields are:
- "Code"
- "Label"
- "Who may read it"
- "Can it carry a claim value, a tax benefit or a fee?"
- "When it is deleted"

Then press **Add the type**.

**What you cannot change:**
- **Nothing is deleted.** A type is retired instead.
- **A type that can carry a value stays that way.** You can never mark it as not carrying one. Its row offers only "can
  carry a value". If you force it, you are refused, and told why.
- **A type that can carry a value can never be claim evidence.** A surveyor reads claim evidence. A surveyor must never
  see our figures. If you try, you are refused. The message ends: "A surveyor would read it."
- **The rule for reading a type's files is not on the page at all.** The page says: "Only a type with a rule for reading
  its files can be sent or asked for. That rule is added in a system update, not on this page."

**Why a type with no rule for reading its files cannot be sent.** We read every file a client sends. We take out what we
must not keep. We save what we read. Then we delete the file, and note that we did. The screen calls this **"What we did
with the file"**. It is different for each kind of document. For a type with no rule yet, the page says:

> "We have no rule yet for reading this kind of file, so we cannot accept one. You cannot send an upload link for it or
> ask for it. The data protection officer sets that rule. Until then, this type is listed but switched off."

- The demo starts with twenty-five types. Eleven have a rule, and fourteen do not. The fourteen include the engagement
  letter, accounts and our own fee invoice.
- A type you add has no rule either. The page says so:

  > "A type added here has no rule for reading its files yet, so nobody can send one."
- **The data protection officer decides the rule.** Then a developer adds it in a system update. The officer's open
  question is:

  > *"For each new document type, what do we keep when a file comes in? Nobody may upload one until this is decided."*

The 6-year rule works like this. A file is deleted 6 years after the later of two dates. One is the claim's period end.
The other is when we sent the report. We worked this out ourselves. The data protection officer has not approved it yet.
So no deletion date is set.

**We have suggested a rule for each of the fourteen. The suggestions change nothing on this page.** There is one
suggestion for each type, with a one-line reason. The data protection officer can approve or change each one:
- **Keep whole** the five we make:
  - the engagement letter;
  - our fee invoice;
  - the survey report;
  - the capital allowances report;
  - the claim documents.
- **Take out the people and keep the figures** on six:
  - the completion statement;
  - a valuation;
  - accounts;
  - a tax computation;
  - a builder's invoices;
  - plans.
- **Do not accept as uploads** these three:
  - survey photos;
  - letters and emails;
  - "other".

All fourteen still say "We have no rule yet for reading this kind of file". None can be uploaded or asked for.

A suggestion reads:
- "Suggested by us — not yet approved by the data protection officer"

Once approved, it reads:
- "Approved by the data protection officer, but not switched on yet"

It still cannot be used. A developer must first switch the rule on, in a system update.

---

### A5 · Automation rules (`B25`)

Address: /staff/automation. The heading is **Automation rules**.

"Each rule says when it acts and what it does. Each time, it notes if it ran, or why not. A notice is saved with the
emails waiting to send. It is not sent yet."

**The five things that start a rule:**
- A lead is created
- A claim enters a stage (one stage, or "any stage")
- A document is requested
- A task is completed (one activity, or "any activity")
- An owner changes — of a claim, a lead or a task

**The five things a rule can do:**
- A task, from the rule's template
- A follow-up date — a follow-up task, due in the days the rule gives
- A notice to the owner, added to the emails waiting to send
- Tasks to ask for information — one for each missing fact nobody has asked for yet
- A document request to the client. It must be a type we can receive. It says why we need it, and what it holds up

Nine rules come with the demo. Each has a **Change** link. To stop a rule, set "Active" to "no — retired". Rules are not
deleted.

**What no rule may do, and why.** Press **What no rule may do** near the top. It opens a list. Each one is refused,
with the reason:
- No rule can turn on free lookups. They start when our privacy notice is published.
- No rule can turn on paid lookups. They need a signed engagement letter and a person to click.
- No rule can record a signature. Only the client signs the engagement letter.
- No rule can move a claim. A person moves it, and each step is checked first.
- No rule can record a confirmation that a step checks. That would let a claim skip the check.
- No rule can change a tax adviser's switch.
- No rule can look up a register. / No rule can run the research. — "A person chooses when to do it."
- No rule can send a message itself. "It can only add a notice to the emails waiting to send."
  - The page says this once. But an email, a text message and a web hook are each still refused by name.
- No rule can write to an organisation marked do not contact.
- No rule can make an invoice email. That waits on our invoice-fraud procedure.
- No rule can chase an invoice or a payment.
- No rule can send or change our bank details.

The reason for all of them is the same. A rule runs with no person looking. Some things must stay a person's choice.
That means anything that moves a claim past a check. It means anything that speaks to a client. It means anything that
touches money.

**Seeing what each rule did.** At the foot, "What the rules did" lists every run. The columns are When · Rule · Event ·
About · Result. The result is "ran — 1 task", or the reason it did not run. On the demo it read "No rule has run yet."
until we recorded a lead.

**A rule that asks a client for a document.** The form offers the action "A document request to the client". It also
has a box, "Document asked for, for "a document request"". The code sets these rules for it:
- It may ask only for a type we can accept. That means a type with a rule for reading its files.
- Its "Task" box holds *why we need the document*. "Task description" holds *what it holds up*. The client reads both.
- It may not be started by "A document is requested". If it were, it would keep asking for ever.

**Saving it.** Choose the document under "Document asked for, for “a document request”". Then press **Save the rule**.
On the demo, we saved a rule called *Ask for the lease when data gathering starts*. It was set to:
- "A claim enters a stage";
- Data gathering;
- "A document request to the client";
- the lease.

It was then listed under "A document request to the client". If you choose no document, the rule is refused: "Choose the document the rule asks the client for."

---

### A6 · Email templates and the emails waiting to send (`B26`)

Address: /staff/templates. The heading is **Email templates**.

**Merge fields.** The page lists them: "`{{contact_name}}` `{{organisation}}` `{{property_address}}`
`{{claim_reference}}` `{{next_action}}` `{{due_date}}` and no others."
- "A merged value is shown as typed". So nobody can slip code into an email.
- A value nobody recorded "shows as a gap in square brackets". It is never left blank.

**What a template may not hold.** "Never bank details, never an invoice. A template with either is refused. Invoices
are not emailed until our invoice fraud checks are in place."

A template is refused if its label, subject or text has any of these:
- the word invoice or remittance;
- a fee note or a statement of account;
- an amount due or owed;
- a sort code, an account number, an IBAN or bank details;
- anything that **looks like** a sort code, an account number or an IBAN;
- payment details, a bank transfer, or where to pay;
- the **tipping-off words**:
  - money laundering;
  - suspicion;
  - the National Crime Agency;
  - the nominated officer;
  - due diligence;
  - tipping off.

  Nothing a client reads may hint that anyone suspects them.

The message reads:

> "A template may not carry [what it found]. We never send bank details from a template. The invoice email waits until
> our invoice-fraud steps are in place."

A merge field that is not one of the six gets this:

> "“`{{first_name}}`” is not a merge field. The merge fields are …"

**Where a template is used.** A template is a place to start an email. It is not a form of its own. Go to a client's
**Email** page and open **Start from a template**. Choose one and press **Use this template**. The subject and the
message fill in, merged for the contact and the claim you chose. You can change anything before you save. The same
rules apply to an email you type yourself. Older messages saved from a claim are at the foot of **Your account**. They
are under "Emails waiting to send" (When · What it is · Subject · State), marked **Saved — not sent yet**. An
organisation marked do not contact is refused. The message is: "This company is marked do not contact, so nothing was saved to send."

**Who emails come from.** On **Admin settings**, the section **Who emails come from** shows the sender. That is "Cap
Rebate <contact@caprebate.co.uk>". It also shows where replies go. Admin can change the name, the address and the reply
address, then press **Save**. The old one is kept. So you always know who an earlier email was sent from. Sales can read
it. It is one setting, and every email uses it, whatever wrote it. Whether emails are really sent is not a setting. The
same section says "Emails are not being sent yet". Under **Why?**, it says what is still missing.

**Nothing is sent**, by anything, in this build.

---

### A7 · Finance settings and the fee controls (`B9`/`B10`)

Address: /staff/finance. The heading is **Finance**. Accounting and Admin can open it. Only Admin may record a setting.
On the demo, Accounting tried and was refused with "not authorised".

**Each value has a date and a source.** Section "6 · The finance settings" shows each setting. It shows the value In
effect, From (the date) and Source. The settings are:
- our VAT position;
- the VAT rate we charge, while we are registered (**Not set**);
- the VAT registration threshold;
- where the warning starts, as a share of that threshold;
- a single expected fee large enough to check on its own.

The form says: "A new value is a new row, with the day it takes effect and where it came from. Nothing is changed in
place." Its fields are:
- "Setting"
- "Value — pounds, a share such as 0.75, or REGISTERED / NOT_REGISTERED"
- "Takes effect"
- "Source"

The button is **Record the setting**. A value with no source is refused. The message is: "Say where the value comes
from — a document, a page and the day it was read."

**Our fee is a flat 3% of the allowances we find.** There are no bands and no minimum. (It was 5% before 16 September
2026.)

**The fee controls start switched off.** Section "5 · The fee controls, and what the engagement letter says" shows:
- our fee above the client's first-year saving — off;
- **a minimum fee — "none — decided"**. Lakhbir decided there is no minimum fee, so the old switch here is retired;
- **a multi-site discount — "a choice, never taken off a fee by the system"**. How large it may be, and who approves it,
  are both "NOT DECIDED";
- the break fee and the abort fee — off.

Each one names the question it waits on. No screen turns them on. They are switches in the code (see A10). There is no
smallest job size at all: "Lakhbir decided so on 1 September 2026".

**A multi-site discount is noted, but not used.** Admin or Sales can record one on a claim, using
`POST /staff/claims/{id}/fee-discount`. It is a share of our fee, with the reason. On the claim page, it is in the
**A multi-site discount** panel. It is marked **AWAITING THE DECISION**. That decision is the largest discount allowed, and who approves
it. No invoice changes because of it. Nothing asks for a top limit, because none is decided.

**Blanks in the engagement letter are shown as blanks.** The break fee (clause 5) and the abort fee (clause 4) each read
"BLANK IN THE ENGAGEMENT LETTER". Each shows the clause's own gap, as it is in the letter. **The payment terms are no
longer blank.** Clause 4 reads "within 14 days of the date of the invoice". So an invoice raised today is due in 14
days: "within 14 days of the invoice, as clause 4 states". If the terms were ever blank again, the due date would read
**No due date set yet**. An invoice with no due date is never counted as late. The page gives the reason: "A term in the
engagement letter is BLANK. We show it blank on purpose. A made-up number here could end up in a contract."

**Nobody should type a number to fill a gap.** No field on the screen takes an invoice amount, a fee or a letter term.
That is on purpose. The answers belong to the people who own those choices. A guessed figure could quietly end up in a
contract.

---

### A8 · The reward model, and merging a firm (`B32`, and a firm's page)

Address: /staff/introducer-rewards. The heading is **The introducer reward model**.

It reads "It is Off — nothing is offered to an introducer." Three models are built. All three start switched off:
- **Model A:** "no cash". Instead, we give the firm something back. That could be a CPD session, a joint one-pager, or
  faster work.
- **Model B:** a fixed fee for each claim that succeeds. It is paid to the firm, never to a person. "Nothing is paid
  until we record that the client was told about it."
- **Model C:** **"a share of the fee we actually invoice"**. The share is 10%. It is paid to a registered accountancy
  firm that sent us the claim. This was Lakhbir's answer. It is owed once our fee invoice is raised. It is never owed on
  a quote or an estimate. If the fee is cut under clause 13, a **reversing entry** is written. Nothing is changed or
  deleted. The solicitor is still to say if the client must be told, and how.

The page says Lakhbir decides which one, if any. His question is: “Is anything paid to the accountant?”

**Switching.** Only Admin sees "Switch it". Choose a "Model" and enter "Model B's fee per successful claim, in pounds".
Then press **Save**. When Accounting opens the page, there is no switch. The page shows clause 1 as it still reads. It says
"This cannot be switched on while clause 1 of the engagement letter is blank."

On the demo, both A and B were
refused, with the heading "The reward model did not change".

"Fees to introducers" lists model B's fees. On the demo it said "No fee has accrued to any firm."

So we could not see the controls for recording that the client was told, or that a fee was paid. By the rules, Admin or Sales records that
the client was told. Admin or Accounting marks a fee as paid. That can never happen before the client is told.

**Merging a firm.** Address: /staff/introducers/… (the firm's own page).

Sometimes the same firm is recorded twice. Open the copy's page. Find "Merge this firm onto the one it really is".
Choose "The firm it really is" and fill in "Why these are the same firm". Then press **Merge**. Only Admin can do this.
- **What moves:** its leads, its people and its open tasks.
- **What does not move:**
  - A client's yes to sharing progress with the copy. It does not become a yes to the other firm.
  - Its closed tasks and its notices.
  - Any fee.
- **A firm with a fee cannot be merged.** First deal with the fee, on the firm it is owed to.

---

### A9 · The compliance registers (`B33`–`B39`)

Address: /staff/compliance. The heading is **Compliance**.

**Admin only.** Only Admin can use this section today. No other role can. The page says: "There is no data
protection officer login."

No other role can reach anything here. That means Sales, Accounting, Surveying and clients.

**Only one person today.** A banner says this on every register page. It is on:
- the first page;
- each register;
- People named on documents;
- a contact's consent history;
- the retention list.

It reads:

> "KNOWN LIMITATION — ONE PERSON TODAY. The data protection officer should decide, and the controller should sign too.
> But there is no data protection officer login here. One Admin login types both names. So nothing checks that two
> people took part. The names are a note of who said what, not a check."

Put simply, our rules need two people to agree. The system does not make sure of it. One login
can type both names.

**Two things are built beside the registers. Both are switched off.**
- A *data protection officer role* (see A2). It would hold these registers and nothing else. The officer could then
  keep them, but could not add a sales person or read the whole audit log. While it is off, the one-person banner stays
  true.
- A *log of each time we share data*. It would note each time a client's data goes to someone. That could be the
  surveyor, the tax adviser, the client's own accountant, HMRC, or a firm that works for us. It would note when, which
  data, the legal reason, and who noted it. It has no screen yet. It notes nothing while it is off. It never says "none"
  when the truth is that nothing is kept.

The registers:
- **Due diligence** (Address: /staff/compliance/aml). **Switched off.** You can still record the nominated officer.
  You can record the risk review for the whole firm. You can record checks too. The page says: "OFF — nothing here
  blocks a claim. The register can still be kept. Whether it must be is with the accountant and a solicitor."
  - Companies House lists people with significant control. That list "does NOT stand for beneficial ownership". It
    says: "To use an owner from it, record a separate, dated decision on the check."
- **Rights requests** (/staff/compliance/rights). A person's request about their data. It is logged under "The rights it
  asks for — each has its own deadline" (Art 15, 16, 17, 18, 21, 22A–22D). A **Deadlines** table has one row for each
  right. The deadline is **worked out each time you look, and never stored**. The sums are shown. Where the law can be
  read two ways, we work to the earlier date.
- **Complaints** (/staff/compliance/complaints). Each is sorted when it comes in. That includes whether it is a s.164A
  complaint. It gets an "Acknowledge by" date, worked out from the date it came in.
- **Breaches** (/staff/compliance/breaches). "Categories and counts, never names." The 72 hours are counted from the
  moment we noted we knew. The description is refused if it has bank details in it.
- **People named on documents** (/staff/compliance/identity). **There is no list.** You open each person by their
  reference. Each time you do it is logged. Every name search is logged too, with the words searched. It is never
  exported. Nothing else ever searches it. The page says: "No list of names."
- **Consent history** (/staff/compliance/consent/… for one contact). Each contact has one history. It covers being
  contacted, and marketing ("the box is never ticked for anyone"). It also covers sharing progress with the firm that
  sent them ("never asked — nothing is shared").
- **Retention** (/staff/compliance/retention). The heading is **Retention — what is due for deletion**. "This list
  deletes nothing." Each row's **When it is deleted** says the rule in words. No deletion date is set, and nothing is
  deleted from anywhere. After the rule, the row says one of these:
  - **"No deletion date set yet"**
  - "No rule for this yet"
  - "Worked out by us — not yet approved by the data protection officer"

**The settings on the first page** each have a date and a source. They are:
- "Customer due diligence is in force" (Off);
- "The insurance position" (No policy in force).

To record a new value, press **Record a new dated value**. The form opens. It needs a
value, a "Takes effect" date and "Where it comes from".

---

### A10 · The switches no screen opens

**The Connections page shows every outside service.** Go to **Settings**, then **Connections** (Address:
`/staff/connections`). Only Admin can open it. Each row is one service, such as Zoom or Companies House. It says if
its key is there, but never shows the key. It says if the service is on, what its switch is called, and when it was
last used. It also says what the service still waits on. Nothing on this page changes anything.

**Import the care regulators' lists each month.** Wales and Scotland publish their lists of care services as a file.
Get the new file from the regulator's site. Choose it under that row, then press **Import it**. The page sends
only the columns we keep. Names, phone numbers and emails in the file stay on your computer. Home shows a reminder when
a list has not been imported this month.

Each of these is built and tested, and **starts switched off**. No screen turns any of them on. The admin settings page
refuses each one by name (A3). To change one, someone must change the code. That is done only once the person named
below has answered.

| Switch | Where it is in code | What it does while off | Who decides, in plain words |
|---|---|---|---|
| **Free lookups** (the screens say "free lookups") | `CB_REGISTRY.precondition` (`enabled: false`) — `09-app/engine/src/generated/shared.js`, about line 2899. This file is built from the site file. So you make the change in the site file and build it again. Never change `generated/` itself | No free register lookup is allowed | Whoever publishes the privacy notice. It must be linked from the address question. The code asks for both |
| **The twelve tax adviser switches** | `CB_CTA` — `09-app/engine/src/generated/shared.js`, line 262. The names are listed in A3 | Each claim is worked out on today's reading. Nine of them would make claims bigger | **A chartered tax adviser**, one question at a time |
| **The engagement fee check** (found in the engine) | `CB_GATE_CONFIG` (`enabled: true`, `jobs_per_year: 120`) — in the engine | **On, but it decides nothing yet.** No costing is put in, so every case is not yet known. No figure is held back. The back office never quotes a fee to a client. This check never holds back an earned fee from an invoice | Lakhbir decided "Yes" and "120". The costing is still an estimate |
| **Break-even counted as too little profit** | `FUNNEL_SWITCHES.breakeven_is_insufficient_profit: false` — `09-app/backend/src/web/funnel-session.ts:216` | "Roughly break-even", "not sure" and never asked all read the same | The tax adviser. They are asked: is roughly break-even enough profit? Is it enough for the relief to bite on? |
| **The public referral form** | `REFERRAL_FORM` (`enabled: false`) — `src/web/introducers.ts:180` | The page does not exist. It answers as an unknown address | Whoever publishes a privacy notice for it. It must be linked from the referral form. It must tell a client what their firm sent us |
| **A client saying yes to sharing, from the portal** | `CLIENT_SHARE_GIVE` (`enabled: true` since 24 September 2026) — `src/web/introducers.ts` | Switched on. Clients give or take back a yes in their portal. Staff can still record a yes after asking | Lakhbir decided it: ask the client first, from their portal |
| **The fee controls** (two) | `FEE_CONTROLS` — `src/web/fee-controls.ts`: `above_benefit`, `break_and_abort`, each `enabled: false`. The minimum fee is no longer a switch. `MINIMUM_FEE_DECISION` records that it is decided as none | The fee is not capped or changed. There is no break fee and no abort fee | A pricing choice. The code names two open questions, but not a person. One asks: do we cap the fee, warn about it, or adjust the percentage? The other asks: what is the break fee, and is there ever an abort fee or a fixed fee? |
| **Clause 13 fee clawback** | `FEE_CLAWBACK` (`enabled: false`) — `src/web/claim-record.ts` | A smaller claim raises nothing. The audit log says why | Part (a) is answered yes. The time limit is now in the letter. It reads "for so long as the claim remains open to enquiry". It still waits on clause 13's other two blanks. They are the trigger and settlements |
| **The fee trigger** — decided | `FEE_TRIGGER` (`reading: 'REPORT_DELIVERED_FOR_FILING'`, `decided: true`) — `src/web/pipeline.ts` | Our fee is earned when our report is delivered for filing. It goes to the client or their accountant. The system reads this from the list of what we have sent. That means the client report or computation pack, on the day it was sent. If nothing was sent, the fee is not earned yet | Decided by Lakhbir. Nothing here says we file the tax return. Nothing says we sign the filing position |
| **The invoice-fraud procedure** | `INVOICE_FRAUD_PROCEDURE` (`in_force: false`) — `src/web/automation.ts:124` | No invoice email and no chasing email can exist | The solicitor signs it off. The data protection officer signs it off too. So does the developer. Even then, the invoice email is **new work**, not a flag |
| **The data protection officer role** | `DPO_ROLE_SWITCH` (`enabled: false`) — `09-app/backend/src/authz.ts:1089` | Nobody can hold the role. If you force it, you are refused | Lakhbir decides. He asks: "Do we need a compliance role separate from Admin?" |
| **Company names kept on sale-contract uploads** | `CONVEYANCING_STRIP` (`enabled: false`) — `src/web/conveyancing-strip.ts:64` | This covers each party named on a sale contract. It covers the replies to the buyer's questions too. Those are the questions asked before the contract. Each party is kept only as its role, such as [SELLER]. Companies are kept that way too | The data protection officer. The question is whether company names may stay on these uploads. We would still take out the people |
| **The log of each time we share data** | `DISCLOSURE_LOG` (`enabled: false`) — `src/web/disclosure-log.ts:61` | Nothing is noted. Where it would show who has had a client's data, it reads "NOT KEPT — this log is switched off". It never says none | The data protection officer and the solicitor. They must sign off the list "Who we pass client personal data on to" |
| **The suggested rules for reading each document type** | `RECEIPT_RECOMMENDATIONS` (`approved: false`) — `src/web/receipt-recommendations.ts:65` | Nothing changes. Even once approved, a type cannot be sent yet. First, a system update must switch its rule on | The data protection officer: "For each new document type, what do we keep when a file comes in? Nobody may upload one until this is decided." |
| **Customer due diligence in force** — not like the rest | *Not a code switch.* `AML_IN_SCOPE` is a dated setting, read by `src/web/compliance.ts` (`amlInScope`, about line 216) | Nothing blocks a claim. Lakhbir said "we need to do AML check on every client". But it was left off on purpose. If it were on, no claim could leave Engagement without a finished check. That would hold up work. So keep a check for every client on the register now, with the switch off | The accountant and a solicitor. They are asked: does the law say we must have AML supervision? **Unlike the rest, an Admin can record a new dated value on the Compliance page.** We tried it on the demo with a future date. Only record it once that written answer exists. Give the answer as its source |
| **The reward model** — also different | Switched on its own page (`B32`). It is refused there while clause 1 of the letter is blank. It covers models A, B and C (10% of our fee as invoiced) | Nothing is offered to an introducer | Lakhbir: "Is anything paid to the accountant?" |

---

### A11 · The audit log (`B45`)

**What is recorded.** One line for each thing that happened. Each line gives:
- the kind of event;
- when;
- who, as an id and a role;
- what it was about, as an id;
- the outcome, ALLOWED or REFUSED.

The kinds of event include:
- sign-ins, failed sign-ins, and sign-ins held back for too many tries;
- users added, roles given (from and to), and users turned off (with how many sessions ended);
- changes to rules, templates and settings, and settings refused;
- emails saved to send;
- document reads, allowed or refused;
- reads and searches of People named on documents;
- the refused switch of the reward model.

**What is never recorded.** A line never holds a name, an email address, the words of a note, or an amount. The log
refuses such details. It does not just blank them out.

**Nothing can be changed, and each line is tied to the one before** (`src/audit.ts`). The database stops any line being
changed or deleted. Each line also holds a check code. The code is made from the line itself and the line before it. So
if a line is removed or changed, it shows up as a problem. This means a change shows up, but it cannot be fully
stopped. Admins are trusted.

**Who reads it.** Only Admin, from **Audit log** in the menu. Every other role is refused. They see "not authorised". The page
lists the newest 200 lines that match, newest first. The columns are # · When · Kind · Role · Who (id) · About ·
Outcome. It never shows what a line says in full: "The details of each line are never shown or read here. You see the
kind, the ids and the outcome." To narrow the list, use **Kind** and **Outcome**, then press **Show**. The page also says: "Opening
this page adds a line to the log."

A claim, organisation, site or lead page also shows part of the same record. It is in the activity timeline, in words.
Whoever may read that page can see it.

Address: /staff/audit

**How to check the log.** The top of the page checks it on every visit. On the demo, for example, it said:

> **"Audit log checked — nothing changed. All 9 records were checked, each against the one before it."**

If a line had been changed outside the system, it would say:

> **"Audit log problem — a record was changed or removed. Tell the Admin now. The problem starts at record …"**

**Without the server**, a developer can check it too. They run `npm run verify-audit` in
`09-app/backend`, against the database file. It checks every line again and writes nothing. If all is well, it prints
"audit log intact", with the number of lines. If not, it prints "AUDIT LOG BROKEN at entry …", and fails.
`test/audit.test.ts` and `test/follow-on.test.ts` prove both answers.

---

### A12 · When something is refused

A refusal comes in one of three forms.

1. **An address you may not open.** You see a page headed **You cannot open this page**. It says: "Your login does not
   give access to it. That is the system working as it should, not a fault." It shows your own tabs, and **Go to your
   home page**. It says nothing about what you asked for. Sales sees this at Users and roles. Anyone sees it at a record
   that is not theirs. A data address ending `.json` or `.csv` still answers with just `{"error":"not authorised"}`.
2. **A form the rules will not accept.** You see a page with a short heading. For example: "Not created", "Rule not
   added", "Template not saved", "Type not changed", "Not merged" or "Not a setting". The reason is given in one
   sentence, with "Go back". Nothing was saved.
3. **An address that does not exist at all.** `{"error":"not found"}`.

**Why "not found" and "not yours" look the same.** Say a record exists, but it is not yours. Or say it does not exist
at all. Both answer "not authorised". On the demo, Surveying tried a real claim that was not on their job. They also
tried a made-up one. Both got the same answer. Say the two answers were not the same. Then a person could try
one address, then the next. That way, they could learn which clients and claims exist. Sign-in works the same way. An unknown address and a
wrong password both get "those details did not match".

---

## Part 2 · The user guide

> **Before you start.** Caprebate is a working prototype. Every business, person, property and figure
> in it is made up. Never put real client data into it. We checked every step below on 12 September 2026.
> We used the demo build, started with its seeded data. The demo keeps its data in memory. So when you
> restart it, everything goes back to how it was.

**Signing in.** Open the **Sign in** page. Type your **Email** and **Password**, and press **Sign in**.
If something is wrong, the page will not say which one was wrong. It could be the address or the password.
We do that on purpose. Staff land on their **Home** page. A client lands on their own claim page.

Address: `/login`

**The menu.** Each role has its own menu down the left. It shows only the screens that role can open. See
*The layout* near the start of this guide. What if you type the address of a screen that is not in your menu? It
is still refused. You see **You cannot open this page**. That is the system working.

**Every time on the screens is UK time**, and "today" always means today's date in the UK.

---

### U1 · Sales — a working day

**1. Start on the landing page.** After you sign in, you are on **Home** (Address: `/staff`). The top line says how
many jobs are late. Under it are coloured boxes with the numbers. Your work is on the left. Late items are red (see `B0`):
- **Do these first** — what is due today, or late. That means tasks, client questions and asks for documents.
- **New leads** — leads nobody has contacted yet, oldest first. Contact a red one today.
- **Existing leads — next actions** — each lead we are working on, and its next step. Its last line is **Claims with no
  next step**. It lists the claims with no owner or no next step. Give each one an owner, then its next action.
- On the right, **Pipeline** shows five coloured bars, one for each group of stages. **Reports** is under them.
- Your whole list is on the **Tasks** tab. It holds **My tasks**, your claims and who each one waits on. It also
  shows what you are waiting on from clients. Each task has **Start** and **Complete**.

**2. Work your leads.** Open **Leads** (Address: `/staff/leads`). A lead is anything that might become a claim. It
may be a filled-in assessment, a call someone asked for, or a referral. There is no lead score. A lead never holds a
person's name. We record people as contacts on the organisation.

*The page is cards in four sections.* **New — not contacted yet** is always first and is never folded. Work it first,
and start with the red cards. **In progress** is Contacted and Qualified. **Later** is Nurture. **Closed** (Converted
and Lost) is folded, so press **Show**. Each card shows:
- the company and its sector;
- where it came from and how long it has waited;
- who owns it, and the next step.

Press a card to open its details below it. You see how to reach them and what the assessment found. You see the four
answers we need before they can be a client. You also see buttons. There is **Log a call**, and
**Email** (coming soon). There is **Add next action**, and **Make them a client**. Then there is **Mark as lost**
(it asks why). A card nobody owns shows one button
instead: **Nobody owns this — take it**. A website enquiry nobody has answered is a card in New too. It has **Open as a
lead** and **Close, nothing more needed**. **Filter** opens the filters and saved views. **List view** is the old
table.

*Recording a lead by hand.* Press **Record a lead** at the top. The form opens at the foot of the list, under
**Record a lead by hand**. Choose **An organisation
already recorded**. Or fill in **Or the organisation's name**. Then choose **Where it came from (required)**. Under
**More options** you can set **Its sector** and the **Next action**. The next action becomes a task on the lead, and
you own it. You can also set its **Due** date. Press **Record the lead**.

*The four enquiry checks.* Open the lead. Under **Can we take this on? The checks** there are four checks:
1. The property is healthcare property in the UK. At launch that is England and Wales. Scotland comes second, and
   Northern Ireland third.
2. The client is a trading business. Commercial means the client, not the building. So supported living is in.
3. The one who asks is the owner, or acts for the owner with their consent.
4. There is no clash with a claim that already exists.

The table's columns are **Check · Answer · Last recorded · What we already hold**. The panel on the right says
**Next step**. It shows **Not ready yet** and the first check still needed, with **Record the check**. For each check:
- choose the **Check**;
- choose the **Answer** (**Yes**, **No** or **Not known**);
- add a **Note** if it helps;
- press **Record the check**.

"Not known" is a real answer, but it does not pass. A check that nobody has recorded reads just the same: **Not
known**. Its **Why?** says so, and says a check that is not known does not pass.

*Qualifying and converting.* First, all four checks must be a recorded Yes. Then go to **Change the lead**. Set
**Status** to **Qualified** and press **Save**. A box then shows up, headed **Convert — this opens the claim**. It
has the button **Convert and open the claim**. (**Next step** on the right links to it too.) When you convert, the
system checks the four answers again. It opens the claim at the Assessment stage. It closes the lead, which stays as
the record of where the claim came from. You cannot pick "Converted" as a status. Some referrals come from a business
that has not taken the assessment yet. That lead cannot convert until you link it to the organisation the assessment
makes.

**3. Organisations, contacts and properties.**
- **Organisations** (Address: `/staff/organisations/{organisation}`): change details under **Change these** and
  press **Save**. Some facts come from a better source, such as the Companies House record. Those show where they came
  from. They have no box to type in. **Referred by** names the firms that sent us the organisation's leads. We read
  it from the leads. Nobody types it in.
- Under **Contacts**, the **Add a contact** form records a person. Its button is **Add contact**. The person may be
  a decision maker, or the finance contact. Or they may be the client's accountant, or an adviser. None of them
  ever gets a login.
- You can set **Client status** to **Do not contact**. This does more than label them. It stops anything being saved
  to send to that organisation ("Our system blocks every email to them.").
- **Add a property** takes a **Name of the site or building** and a **Postcode** (button **Add property**).
- On a property (Address: `/staff/properties/{property}`), use **Change the property** and **Save**. A past owner or
  occupier is a company name or a role. It is never a person's name. If you do not know the price, leave it blank.
  £0 is refused. **Open a claim for** with **Open claim** starts another claim on the same building. It starts at
  the Enquiry stage.

**4. Moving a claim through the ten stages.** Open a claim (Address: `/staff/claims/{claim}`). The **stage bar** sits
under the highlights. It shows the ten stages in order:
1. Enquiry
2. Assessment
3. Engagement
4. Data gathering
5. Survey
6. Valuation
7. Tax adviser sign-off
8. Client report and accountant report
9. Invoice
10. Defence pack

After those comes Closed. The bar says **Moving on from …: Ready** or **Not ready yet**. If it is not ready, it shows
the first thing still needed. **Next step** is the quickest way. It sits at the top of the panel on the right. It
shows **Move to …** when the claim is ready. If not, it shows the thing still needed, and the button that deals with
it. On the **Details** tab, **Stage and moves** holds every move. **See everything this stage needs** opens the full
list. Each need is marked **Done** or **Still needed**. Here is what each step's check asks for, in plain words:

| To leave… | …the system needs |
|---|---|
| Enquiry | all four enquiry checks recorded as Yes, on the claim or on its lead |
| Assessment | an assessment on record for the organisation |
| Engagement | a signed engagement letter, checked by the system itself |
| Data gathering | The election question is answered in the facts panel. A confirmation is on record. |
| Survey | the surveyor's own figures, locked in on a survey job on this claim |
| Valuation | each grant or contribution matched to what it paid for, and a recorded confirmation |
| Tax adviser sign-off | a sign-off record made while the claim is at this stage |
| Client report and accountant report | The sign-off. Both reports issued. The client's acceptance and the accountant's confirmation. **Or the client's own written word, if they have no accountant or tax adviser.** The client confirms three things. They will file the change to their return. They know the last day to make it, which we gave them. What they put on their return is still up to them. If any of the three is not a yes, the claim cannot move on. A client with an accountant on record goes the accountant's way. And the time to change the return must still be open. |
| Invoice | The time to change the return is still open. The fee trigger is reached: **our report delivered for filing**. Our fee invoice is raised on this claim, and not credited in full. |
| Defence pack | The defence pack is issued. The deliverables register shows it. Then the claim closes. |

Under **Move the claim**, press the **Move to …** button. When the claim is not ready, the button says so. For
example: **Move to Assessment (not ready yet)**. The system checks the step every time, whatever the page showed. A
refused move shows **Not moved** and the reason at the top of the form. For example:
- "A claim moves one step at a time, and each step is checked. From Assessment the next step is Engagement."
- The move from Engagement is refused, with the reason. It says it is not ready yet, and it names what is still
  needed. Here that is a signed engagement letter: the letter was sent, but it has not been opened or signed.

A move is also refused if it would leave the claim with no next action. That next action needs an owner and a due
date. You can name one as you move. Fill in **…and name the next action after it**. The other moves are:
- **Close the claim here** (the record is kept): choose **Exit to** and a **Reason**. The claim is never deleted.
- **Put on hold**: give a **Hold reason**. A held claim picks up again only at the stage it left.
- Only an Admin can reopen a claim, and always with a reason.

**5. One next action per claim.** Every open claim has just one next action, with an owner and a due date. Set it
under **Next action and tasks** → **Set the next action**. Fill in **What happens next**, **Owner** and **Due**. Then
press **Set as the next action**. The old next action stays as a normal task. The **Change the claim** form does not
set the next action.

**6. Tasks.** Every organisation, property, claim and lead page has an **Add a task** form. It has **Task
(required)**, **Owner** and **Due**. Under **More options** it also has these:
- **Description**
- **Activity**
- **Or the team it waits with**
- **Priority**
- **Repeats on completion**

Then press **Add the task**. It may be refused, say if it has no title. Then the page comes back with the reason at
the top of the form. Everything you typed is still in it. On a claim there is also a tick box. It reads **Make this
the claim's next action — it needs an owner and a due date**. A task with no due date is allowed. It shows as having
no due date. It never shows as on time. A task is never deleted. To stop one, open its own page. The box there is
**Cancel it — a task is never deleted, so say why**. Give a reason, and press **Cancel the task**.

**Calls, on the Calendar.** Open **Calendar** (Address: `/staff/calendar`). It shows one day. **Show the week** shows
seven boxes, one a day. Use **Earlier**, **Today** and **Later** to move. Four boxes count the calls. One is the calls booked.
One is the calls waiting for a time. One is the people who asked another way. One is the calls cancelled. A call with nobody on it says **Nobody
yet**, in amber. A cancelled call says **Cancelled**, in red. Under **Asked for a call, no time yet**, press **Give it
a time** on a row. **Cancelled calls** is folded. Press it to see them.

**Video calls on Zoom.** We use the free Zoom plan for now. Every call runs on one Zoom account, contact@. So keep
these three things in mind:
- **A call ends after 40 minutes.** If it does, start it again with the same link. The client uses their link again too.
- **Only one call can run at a time.** If you book a video call at the same time as another, the call's page says so in
  amber. Pick another time if you can.
- **Zoom does not record the call.** On a walkthrough call, write down what you see on the job as you go. The client can
  still send photos and a video.

After a call, open it in the **Calendar** and press **Ask Zoom how long it lasted**. The page then shows how many minutes
it ran and how many people joined. If our plan does not give this, it says **Call length: not shown on our Zoom plan**.

**7. Documents, and asking a client for one.** Go to the claim's **Related** tab. Or use **Request a document**
under **Quick actions**. The **Documents** panel lists the **Requests**. It also lists what is linked to the claim. To ask the
client for a document:
1. Find the box headed **Ask the client for a document**. It goes to their portal. You can only ask for a type we can
   accept. Choose the **Document**.
2. Fill in **Why we need it** and **What it holds up**. Add a **Due** date if there is one.
3. Press **Request it**.

A request is marked received only once we have read the client's upload of that type. The screen says "Received —
the file they sent is the answer." There is no button to mark it. Did you ask in error? While the request is still
open, you can take it back with **Withdraw — asked in error**.

**7a. A company's files.** On a client's page, press **Files** at the top. It is the folder button with a number on
it. The number is how many of the company's files you may open. The files are in folders:
- **From the client**
- **From Cap Rebate**
- **Asked for — still waiting**
- one folder for each claim

Each file shows its name, who sent it, the date, and what we read from it. To add one of your own, use **Upload a
file**. Drop the file on the box, or tap the box to choose one. Say **What is it?** and **Which claim is it for?**
Tick **Let the client see this file** only if they should see it. The box starts unticked. So the client cannot
see the file unless you tick it. You can change your mind later. Use **Let the client see it** or **Hide it from the client**.
There is no **Documents** menu any more. To look across every client, open **Search**. Then press **Find a document
across every client** (`B44`). Training: `B47`.

**7b. Chat — with your team, and with the client.** On a client's page, open **Chat**. It has two tabs.
- **Team only** is for you and your team. The client never sees it. It is where the notes for staff always were, and
  every old note is in it.
- **With the client** is the talk the client sees in their portal, under **Messages**.

A number on a tab is how many messages you have not read. Type in the box. If it is about one claim, choose **About
which claim?** Then press **Send to the team** or **Send to the client**. A client may send a file with a message. We
save it in their **Files**, under **From the client**, with a link back to the message. Has a client waited more than
one working day for a reply? Then they show as a red tile on **Home**. Training: `B49`.

**8. Introducers, referrals and sharing progress.** **Introducers** (Address: `/staff/introducers`) lists the firms
that refer clients. None of their people ever has a login.
- **Record a referral** takes the firm and the person who refers. It also takes the client business's name and basic
  facts. It makes a lead, with the firm as its introducer.
- **Add a firm** adds a firm on its own.

Both are buttons at the top. Each opens its form. Boxes count the firms, the leads they sent, the claims opened and
won, and the firms whose next contact is late. Each firm is one row. A firm with no owner says **Nobody yet**, in
amber. A late next contact is red. **Sent us** says what the firm sent. Open a firm to see more. Its parts are in the
left-hand menu. Its forms are folded. Press one, such as **Add a person**, to open it.

A referred lead has the section **The introducer, and sharing progress with it**. It asks: "Does the client want
progress shared with the firm?" Read the client the words shown. Choose **Their answer** (Yes, No or Withdrawn). Then
press **Record the answer**. Until the client says yes, nothing about the claim goes to the firm. The screen puts it
like this: "Never asked counts the same as no."

Each notice that falls due is listed under **Notices to the firm**. It is marked "waiting to send — NOT SENT, email
is not switched on yet", or "not sent". A reason is given. For example: "not sent — the client has not agreed to
share progress with this firm".

**9. The claim's record.** It holds facts, figures and the sign-off. It also holds deliverables and aftercare.
- **The claim's capital allowances facts**: each fact shows where it came from. To add one, choose the **Fact**. Choose
  **Answer** (**This value** or **Not known**). Give the **Value** and **Source**, then press **Record the fact**. Add a
  past owner with **Record the owner**. It is "a company or a role, never a person".
- **Grants and contributions have their own box** — see `B50`. It asks one question first: **Did anyone else pay for
  any of this work?** Then use **Add a grant or contribution**, one question at a time. The payer is a type, such as
  "The NHS". It is never a name.
- **The four figures**: "A is the first estimate. B is the researched estimate. C is the surveyor's figure. D is the
  figure the tax adviser signed. Each is locked when it is set, and never edited." You type none of them. Each one is
  read from the record that locked it.
- **The sign-off** is a record, not a signature. You can make it only while the claim is at the tax adviser's
  sign-off stage.
- **The deliverables register** tracks the five documents. **Start a draft** begins one. Until the tax adviser signs
  off, you cannot draft a report with a figure in it. The system never writes a report. It says: "We track these
  here, but we do not write them here."
- **Aftercare** holds three things. **HMRC enquiries** (**Record an enquiry**). **Clause 13 — the fee on a reduced
  claim**, which is switched off. And **The election on a future sale**.

**10. Search, lists, saved views and export.**
- **Search**: type at least two letters and press **Search**. The page lists what it searched and what it did not.
- On **Claims** or **Leads**, open **Filter, sort and save**. Choose filters, and press **Show** (or **Clear**).
- To keep a set of filters, type a name in **Save these filters as**. Then press **Save view**. It shows up under
  **Saved views**. **Retire** removes it.
- **Export these N rows as CSV** downloads the list. It has only the columns you may read. We keep a record of the
  export.

**11. Emailing a client.** On the client's page, press **Email** (beside **Files**). Or press **Email** on a lead card
or a claim. Choose **To**, which is one of the company's contacts. If it is about one claim, choose **Which claim is it
about?** Type a **Subject** and a **Message**. (Or open **Start from a template** first.) Tick any files to attach.
Then press **Save the email**. The page says **"Saved — emails are not being sent yet."** It lists the email under
**Emails to** the company. It is on the company's timeline too. Nothing is sent until sending is switched on.

**12. Where the claim came from, and its team.** At the top of a claim, **Came from** and **Source** say how it
began. It began from its lead, or it says "no lead — this claim was opened by staff on a property". **Introducer**
names the firm that referred it, if one did. **The claim team** shows:
- the **Owner**;
- the **Surveyor**;
- the **Tax adviser**, shown as their sign-off record. It says "we record the adviser's sign-off, not the person";
- the organisation's own accountant and adviser. They sit under **The client's accountant and adviser on this
  claim**.

To add one, choose them under **Add to the team** and press **Add**. **Take off the team** removes one, and the
record stays. "Only an accountant or adviser contact can join a claim's team". Nobody on the team has a login.

---

### U2 · Accounting

**What you see.**
- **Home**: three cards. Two are **Invoices due and overdue** and **Fees waiting to be invoiced**. The third is
  **The VAT position**. Below them are tasks waiting with Accounting. One might ask you to record a part payment on
  an invoice when it arrives.
- **Dashboard**: the money tiles only.
- **Finance**.
- **Claims**: the client and the reference. The value reads "not shown to this role". Columns Accounting may not read
  are left out, and the page says so.
- **Clients**: each client with a claim to invoice or an invoice. An overdue invoice shows as a red label.
- A claim's page. It shows its **Documents** (the fee invoice and the signed letter only). It shows **Money** (the
  claim's own invoices). It has a timeline of "Financial events only". A claim at the invoice stage also shows **Our
  estimated fee**. That is the fee the finance view expects. It shows until our fee is raised.
- **Documents**: the documents Accounting may read. That is across every claim, and no others. Open them from **Search**, with
  **Find a document across every client**. There is no Documents menu.
- **Search**: claim references and invoice numbers.
- **Introducers**: each firm's name with **Fees invoiced** and **Fees paid**.

**What you do not see, on purpose.** You do not see:
- the client's answers, notes for staff, or our estimate;
- the business page, organisations, properties, leads or the pipeline;
- claim evidence, such as a lease.

If you open any of those, you get a refusal, not an empty page.

**Raising our fee.** Open **Finance** (Address: `/staff/finance`). Claims ready to invoice appear under **3 · Claims at
the invoice stage with no invoice raised**. Each has a **Raise our fee** button. You never type an amount. The fee
comes from the tax adviser's signed figure, through the fee rules. The VAT comes from the VAT position Caprebate has on
record. The invoice number is the next one in a single series with no gaps. On the demo this section lists
CR-2026-0008 (Dunmarrow Medical Practice Limited). Its expected fee is £4,935. That is 3% of £164,500. (It was £8,225
at 5%.) Its **Earned on** column gives the day our report was delivered for filing. It also gives the due date that
an invoice raised that day would carry. A claim with no report delivered reads **NO DATE**. It never reads today. Here
is what a refusal looks like:
- "Our fee is raised on a claim at the invoice stage, and this claim is at Survey." (seen on the demo)
- "The tax adviser has not signed off a figure for this claim. Our fee is worked out from it, so nothing is raised."
- A claim that has stopped is refused as well. For example, the claim ended because it was too late to change the tax
  return. The job stops before any fee is due, so no invoice is raised.

**Sent or cancelled.** Open an invoice from **4 · The claims' invoices** (Address: `/staff/finance/{invoice}`).
- **Record that it was sent**: give **Sent on** and press **Record as sent**. "Sent by hand, by post or as the client
  asked. This system does not email invoices." A date still to come is refused.
- **Cancel — raised in error, and not sent**: give **Why** and press **Cancel the invoice**. A sent invoice is
  refused. The reason given is that it went to the client, so it is credited, with a credit note. A cancelled number
  is never used again.

**Credit notes.** A credit note is the only way a raised amount changes. The section is headed **Credit notes — the
only way a raised amount changes**. Give **Why it is credited in full**. Then press **Credit what is left in full**.
**Apply clause 13** is switched off. (Clause 13 is a fee worked out again on a reduced claim.) The clause is blank in
the letter.

**Recording money received.** We record money. We never collect it. There is no card processor and no bank feed.
1. Under **Record money received**, give **The day it arrived**. Then give **The amount that arrived, in pounds**.
2. Answer **Did the client check our bank details another way than email?** Or leave it at "not asked".
3. Press **Record what arrived**.

You cannot record more than is owed. The screen says: "That is more than this invoice still asks for (£9,000).
Record what arrived against what is owed, and nothing more."

To undo a wrong entry, use **Void** and give a reason. It is never deleted.

**Overdue, and why a due date can be not set yet.** The engagement letter's payment terms read "within 14 days of the
date of the invoice". So an invoice is due 14 days after its date. It is overdue the day after that. What if the
terms were blank? Then its due date would read **No due date set yet**, with the reason. The reason is that clause 4
of the engagement letter leaves the payment terms blank, so none is assumed. An invoice with no due date is never
counted as overdue. It is never counted as on time either.

**VAT monitoring.** **2 · VAT monitoring** shows:
- the limit (£90,000), with its date and source;
- the warning margin (75% of the limit);
- the last twelve months, rolling;
- the thirty-day test;
- any single fee of £25,000 or more.

**Run the VAT check** reads these figures. When they are inside the warning margin, it makes one task for
Accounting. It never makes a second. The task reads: "VAT: we may be near or over the VAT limit. Do the VAT check in
Finance". It never changes an invoice. Only Admin can change the finance settings.

**The dashboard's money tiles.** There are two:
- **Estimated fees in the pipeline**;
- **Invoiced, paid, outstanding and overdue**.

On the demo they read:
- invoiced £45,000;
- paid £20,000;
- outstanding £25,000;
- overdue £0 on 0 invoices.

A note says that 2 open invoices have no due date.

**Export.** On **Claims**, **Export these 8 rows as CSV** gives you three columns: Reference, Client and Opened. You
cannot export leads. Some filters are on a column you cannot read, such as the stage. Those filters are not applied to
the file. The page says so beside the link: "The file does not apply stage — your role does not see those columns."

---

### U3 · Surveying

**What reaches a surveyor.** Only what a survey job given to you reaches:
- **Survey jobs**. On the demo it says "3 jobs you can open. 2 waiting for your figures." Each shows its **Stage** in
  the words the steps use (Survey, Invoice).
- the properties and claims of those jobs only (3 shown);
- your own tasks.

You are refused organisations, leads and the pipeline. You are refused finance, introducers and export too. On a claim page you see these:
- the stage and its steps;
- the claim's owner and surveyor;
- your own tasks;
- the facts your survey needs (never an amount, the tax position or our figures);
- a timeline that shows only your job.

**Our estimate is never sent to you before your figures.** It is not just hidden on screen. We do not send it to you
at all. The job list says two things:
- "Our estimate is not on these pages until your figures are in."
- "Once you commit your figures, you get it straight away. You do not need to ask anyone."

**The workspace** (Address: `/staff/survey/{job}`) opens with a strip of highlights. It shows:
- the sector and stage;
- when the job was opened;
- the rooms counted and the rates recorded;
- whether **Your figures** are in;
- whether **Our estimate** is *withheld* or *released*. It never shows the figure.

On the right are **Quick actions**:
- **Commit your figures** (or, once you have, **Amend your figures**);
- **Record the room counts**;
- **Record what the client told you**.

The **Our estimate** panel is there too. The job on your home page's card opens straight on **5 · Your figures**. There is one tab for each numbered section:
1. **1 · The property**, and **What the client told us**. "I don't know" and skipped answers "are both shown as
   answers, not as blanks".
2. **2 · The room schedule, and the quantities**. There is a count for each type of room, with **Record**.
3. **3 · The rates**.
4. **4 · The evidence**. It shows the register data we hold and the documents sent in. It also shows **What your
   pack is still waiting on**.
5. **5 · Your figures**. It shows the figures and the rates. Each rate has the tick box **I looked at this field**.
   **On what basis did you reach these?** must be filled in. Press **Commit my figures — this releases our estimate to
   me**. A client may have read our figure to you. If so, record it under **If the client has told you our figure**,
   with **Record it**. That costs you nothing.
6. **6 · The record**. It holds every event. Each one is "linked to the one before it in the audit log". So nothing can
   be taken out quietly. Each try to open the estimate before you commit is kept as its own line.
7. **Messages** (a seventh tab, since 22 September 2026). It shows what the client and our team wrote to each other on
   **With the client**. You can read it, but not reply. Ask Sales to pass on a question. You never see our team's own
   notes.

**Your tasks.** **My tasks** is on **Tasks**. A task due today or late is also a red tile on Home. It sits under **Today
and overdue**. On the demo that is "Check the floor plans against the room schedule", due 2026-09-18. Use **Start** and
**Complete**.

**Your dashboard** has one tile, **My survey jobs**. Each job shows its stage. For example:
"CR-2026-0004 · Survey · waiting for your figures". No figure of ours is on it.

---

### U4 · The client, in the portal

After they sign in, the client sees their own claim page (Address: `/portal`). It is headed with their business's
name. It opens with a **stage bar** of six steps:
1. **1 Your estimate**
2. **2 Engagement letter signed**
3. **3 We research your property**
4. **4 Expert sign-off**
5. **5 Claim filed**
6. **6 Aftercare**

There is also a card, **What we are waiting for from you**. It lists each question and each document we have asked
for. Each one is a link down to its form. If there is nothing, it says "Nothing — we are working on your claim". The
page runs in this order:
1. **Book a call** and **Who to contact** at the top, then **How to contact us**;
2. the stage bar;
3. **The range you were shown**, with its basis below it;
4. **What we need from you**;
5. **Questions we still need answered** and **Documents we have asked you for**;
6. **What happens at each step** (the long notes, behind **Show each step**);
7. then the rest.

It shows:
- **The range you were shown**, marked as a first guide only;
- **What happens at each step**, in plain words, with the current step marked (it was **Where your claim is**);
- **What we have issued to you**;
- **The firm that referred you** (only for a client someone referred);
- **Your engagement letter**;
- **Your appointment**;
- **Questions we still need answered**;
- **Your account**;
- **Documents we have asked you for**;
- **Documents**.

**Your appointment — change it or cancel it, at any time.** Under **Change or cancel this call** the client sees three
things, in this order:
1. Other times. A new time must be at least two hours away.
2. **None of these work — ring me instead**. The time is given back, and we ring them.
3. **Cancel this call**.

There is no notice needed for the call they already hold. They may move or cancel it minutes before. They may even do
it after the time has passed. A cancelled call stays on record:
- the portal says "You cancelled this call on …";
- the back office's **Calendar** lists it under **Cancelled calls**, with who cancelled it and when;
- **the enquiry stays open**. Nothing about the lead or the claim changes.

A cancelled call cannot be moved or given a time again. Set up a new call with the client.

**Answering a question.** Each question says **Why we are asking** and **What it holds up**. Type an answer in the
box, or tick **I don't know**. Then press **Send this answer**. "I don't know" is a real answer. We store it as the
client not knowing. The fact goes back on the list of things still to find. A blank answer is refused: "write an
answer, or tick “I don't know”". Then the page shows "✓ do you own the freehold or hold a lease — answered “I don't
know”".

**Uploading a document.** Under **Documents we have asked you for**, press **Get an upload link for this document**.
To send one we did not ask for, use **Send us a document** → **What is it?** → **Get an upload link**. You never type
a file name. "We name the file ourselves, so nothing personal is kept in its name."

The next page is **Your upload link is ready**. It has **Choose the file**. Pick the file and press **Send the file**.
The link works once, and then it expires. If you send with no file chosen, it answers **Not accepted**: "no file was
attached. Choose the file and send it again."

When the file arrives and we have read it, the reply says: "We read it, then deleted the file. What we asked you for
is now marked received." The request then shows as "✓ … received, version 1". There is no button to say you have sent
something. The upload itself marks the request received. The link works once only. Nothing you send replaces an
earlier version.

**What we did with it** opens the document's page. It shows:
- **Sent**;
- **Where it is** ("We have read it", "Not read yet" or "We could not use it");
- **What it is**;
- **Kind of file**;
- **We read it**;
- **We deleted the file**;
- under **What we did with it**, plain counts such as "We read 3 pages." It never shows the file's words.

We may not be able to use a file. Then it answers **Not accepted**: "We could not use this file, so we have deleted
it. Please send another." What if someone asks for the first file back? It answers "That file no longer exists, by
design". Then it says: "We read it, then deleted the file. We did not keep a copy."

**Documents we have issued to you.** **What we have issued to you** lists these, once issued:
- a reasoned negative;
- a s.203 notice;
- a client report, once its figure is released.

Each shows its version and date. It never shows a figure. On the demo it reads "Nothing has been issued yet."

**Stopping progress being shared with the firm that referred you.** Look under **The firm that referred you**. It
shows the exact words you agreed to. For example, it says:
- "Yes — we tell Quarrendon Invented Tax LLP how your claim is progressing."

It has a button, **Stop telling … how my claim is progressing**. Press it, and the page reads:
- "No — we tell … nothing about your claim."

For now you cannot say yes from the portal. The page says:
- "You cannot turn this on from your portal yet. If you would like us to keep the firm informed, tell us and we
  will ask you properly."

**Your account.** **Change your password, name or username** opens **Your account**. It has **Save the name**, **Change
the username** and a password form.

---

### U5 · Words that mean something specific here

- **"Not known" versus never asked.** "Not known" is an answer someone recorded. "Never asked" means nobody has
  recorded anything. The system treats them the same. Both read "not known", and neither opens anything. Nobody is
  made to guess.
- **Overdue, by the UK date.** A thing is overdue when its due date is before today's date in the UK. The page says
  so in words: "16 days overdue (1 Sep 2026)". The count moves with the date. A thing with no due date is never
  overdue and never on time. The screen says: "no due date — so it is not overdue, and it is not on time either".
- **A check.** This is what the system checks, every time, before a claim may leave a stage. Not ready means at least
  one need is not met. Then the move is refused, with the reason. "Each step is checked before a claim can move on —
  the button alone does not move it."
- **Stopped** (inside the system this is *an exit*). A claim that ends early. Here are some examples:
  - "Declined at enquiry";
  - "Reasoned negative report";
  - "Lost".

  It always has a reason from a set list. We keep the record and
  never delete it. Only an Admin can bring it back.
- **A hold.** A pause at one of the ten stages, always with a reason. The claim picks up again at the stage it left,
  and nowhere else.
- **Emails waiting to send, "Saved — not sent yet".** Sending email is not switched on yet. Anything "sent" is saved
  with the emails waiting to send. You find them at the foot of **Your account**. Each is marked "Saved — not sent
  yet". Nothing leaves the building.
- **"Switched off".** It is built, but on purpose not in use until a choice is made. There is a named question behind
  it. Here are some examples:
  - the public referral form;
  - the introducer reward model ("Off — nothing is offered to an introducer");
  - clause 13;
  - the fee controls;
  - saying yes to sharing from the portal.

  Off means things work as they do today.

---

## Part 3 · Training, one screen at a time

**Every block below has the same six parts.** It says what the screen is for and who can open it. It gives the common
job, step by step, with the real labels. It says what the screen refuses, and why. It has one exercise on the demo
data. It shows the result seen when it was run on 12 September 2026. It ends with questions to check yourself.

**Open the demo fresh before each exercise.** `npm run start:demo` forgets everything when it stops. Sign-in allows
only a few quick tries per address. So a trainer who switches roles should sign out, not retry a password.

**The screens are in order of their screen id.** These are the same ids the Developer Spec uses in its §2. So a trainer
and a developer can point at the same screen.

### Training — `B0` the landing page

**Home is your day at a glance.** The top line says how many jobs are late. Coloured boxes show the numbers. Each box
opens what it counts. Your work is on the left, one line each. The pipeline and your week are on the right. A red
line is late. The welcome card is on **Help**. Your full task list is on **Tasks**. The dashboard's figures are under
**Reports**.

**What it is for**
The first page every staff member sees — **Home**. It answers "what do I do next", in the order Lakhbir set.

**Who can open it**
Admin and Sales can open it. So can Accounting, Surveying and Read only. A client who tries is refused. A client lands
on the portal instead. Each role sees different rows. You see a row only if you may open the screen it comes from:

| Role | Rows, top to bottom |
|---|---|
| Sales, Read only | Left: Do these first; Today's activities; New leads; New messages; Existing leads — next actions. Right: Pipeline; Your calendar |
| Admin | the same as Sales. The **Admin** choice under **Home shows** gives Users; Switches; Audit log; Refused sign-ins |
| Accounting | Left: Do these first; Today's activities. Right: Money; Your calendar |
| Surveying | Left: Do these first; Today's activities. Right: Survey jobs; Your calendar |

Address: `/staff`

**The rows**
- **New leads** — first a number: how many leads nobody has contacted yet. Then one tile per lead. Each tile shows the
  company, where it came from, and how long it has waited. Oldest first. A lead turns **red** once it has waited more
  than one working day. A working day is Monday to Friday. Bank holidays in England and Wales do not count. The **Leads**
  page uses the same rule. So a lead that is red on Home is red there too. A website enquiry with no answer yet is a tile
  here too. Only Admin and Sales see those. That is because it sits in the Leads page's New section. The number counts both.
- **Existing leads — next actions** — one tile per lead we are working on. Each shows the company, its next step and
  when it is due. A tile is red when it is late, or when it has no next step. The last tile, **Claims with no next
  step**, opens that list in **Tasks**.
- **Do these first** — what is due today or late. That means tasks, and the questions and document
  requests you sent a client. A lead's or a claim's next step is a task. Late items come first, in red. Accounting and
  Surveying see their own tasks and their team's. Sales, Admin and Read only see every task they may read.
- **Pipeline** — five coloured bars, one for each group of stages, each with its number of claims. A bar opens the
  **Pipeline**. Under them, **Reports** opens the figures by month, quarter or year (`B40`).
- **Admin** — **Users**, **Switches**, **Audit log** and **Refused sign-ins**. The **Audit log** tile reads "Checked —
  nothing changed". Or it reads, in red, "Problem found — tell Lakhbir". **Refused sign-ins** come from the latest
  entries of the log.

A row with nothing in it says so in one line, such as "No new leads." That way you can tell empty from broken.

**How to do the common job**
1. Sign in. You arrive on **Home**.
2. Start at the top of **Do these first**: open each red line first.
3. Press a tile to open the lead, task, client or list behind it, and do the job there.
4. Press **Claims with no next step** to give each claim an owner and a next step.
5. For your whole task list, press the **Tasks** tab. Its number turns red when one of yours is late.

**What it will refuse, and why**
- A client who signs in and opens this address is refused (**You cannot open this page**). The back office is for
  staff.
- Anyone not signed in is sent to the **Sign in** page.
- Home never widens what you may open. Each tile's screen checks your role again, and a row you may not see is not drawn.
- Admin's **Audit log** and **Refused sign-ins** tiles read the audit log. So each visit to Admin's Home is recorded as
  a reading of the log. It is the same as opening **Audit log**.

**Try it on the demo**
*Observed on a freshly started demo, 21 September 2026.* Sign in as Sales. **New leads** reads "No new leads." The demo
has none until you record one. Now look at **Existing leads — next actions**. It shows a tile for Gorsebrook Invented Care Homes
Limited. The tile reads "Next: Confirm who owns the building, and that we…". A long step is cut at a whole word, so open the tile to read
it all. The tile then says "Due in 3 days (24 Sep 2026)". After it comes **Claims with no next step**. **Do these
first** starts with a red line for Aldergate Care Group Limited. It says "Call to talk through the range they were
shown". It is "20 days overdue (1 Sep 2026)". In **Pipeline**, the first bar reads 4. The third reads 3.
Press a bar, and the **Pipeline** opens. Now record a lead on **Leads**. Go back to
**Home**. The lead is under **New leads**, "Came in today", and the number reads 1. Sign in as Accounting. **Invoices
due** is red. It says "£13,000 not yet paid" and "£13,000 late (2 invoices)". **Do these first** reads "Nothing is
due today, and nothing is late."

**Check yourself**
- *A new lead came in on Friday. Is it red on Monday?* — No; it has waited one working day. On Tuesday it is.
- *A row reads "No new leads." Is something broken?* — No. A broken or refused row is not drawn at all; an empty one says so.
- *Where did My tasks go?* — To the **Tasks** tab. Home shows only what is due today or late.

---

### Training — `B5`/`B6` engaged clients and the one client page

**Check and tell the client.** A box called **Check and tell the client** sits under **Claims**. Only Admin and Sales
see it.

- **Every fact says where it came from.** Each line starts with a small label. The labels are **Companies House**,
  **EPC register** and **HM Land Registry**. Then come **Care regulator**, **You told us**, **Surveyor** and **Tax
  adviser**. **You told us** is the client's own answer in their portal. After the label comes what the fact is, its
  value, and the day it arrived.
- **Tick it once you have checked it.** Press **Checked and approved** beside the fact. Your name and the time are kept.
  To take a tick off, open **Take the tick off** and say why. A fact that is "not known" cannot be ticked. Find it out
  first.
- **Facts are grouped into the client's steps.** First comes the company's own step, **Company details checked**. Then
  each claim has its own steps. They are **Property details checked**, **Tax details checked** and **Survey booked**.
  Next come **Survey done**, **Figures checked by a tax adviser** and **Report ready**. Each step's facts are folded
  under **Check the N facts**. After a tick, the page comes back to that step, open.
- **Tell the client.** Tick every fact in a step, with nothing still missing. The step then says **Ready to tell the
  client**, and a **Tell the client** button appears. Nothing is sent until you press it. Their portal then shows the
  step as done, with the date. For example: "Cap Rebate has checked your company details". The portal never shows a
  figure or a value. It never shows a register record, a name or anything internal.
- **Taking a step back — Admin only.** Open **Take this step back**, say why, and press **Take it back**. The client's
  portal then says "being re-checked". It never shows your reason. When it is right again, press **Tell the client**
  again.
- **A client's answer to a claim fact.** You ask for it from a claim's **We need**. The answer shows here with **You
  told us**. Beside it is a box with their words in the form the tax rules need. That is a date, an amount or a choice.
  Check it, correct the box if needed, and tick. That records the fact on the claim. You no longer type it again under
  **Record a fact**.
- **The research is unchanged.** **Run the research** still runs every lookup it may, in one press. There is no tick
  beside a lookup. You check what came back, not the calls.
- *Try it on the demo* (as sales@example.invalid, on a freshly started demo, 21 September 2026). Open **Clients**, then
  **Dunmarrow Medical Practice Limited**. *Observed:* **Check and tell the client 7** reads Working on it: "Checking 7
  steps. Tick each fact once checked." **Company details checked** says "Nothing has come in for this step yet. 3 still
  missing". Under **main site**, **Property details checked** says "0 of 13 checked. 8 still missing". Open **Check the
  13 facts** to see **EPC register** and **Care regulator** lines. **Survey booked** says "0 of 1 checked." Now press
  **Checked and approved** on its one fact. The page comes back. **Survey booked** now reads **Ready to tell the
  client**. Press **Tell the client**. It reads **Client told**, "Told the client on 21 Sep 2026 by Sales User".
- *As Read only, Accounting or a surveyor:* no **Check and tell the client** box, and no tick anywhere.


**Coloured boxes that open and close.** A company's page is a column of **coloured boxes**, one per part of the work.
Each box has a coloured strip down its left edge and a small picture. It also has a word for what kind of box it is. The
words are **Company**, **Property**, **Facts and figures**, **Documents**, **Money** and **Messages**. So you never have
to rely on the colour alone. Beside the heading is a label saying where the box stands. It reads **Not started**,
**Working on it**, **Waiting for the client** or **Done**.

- **Press a box's heading to open or close it.** A box being worked on opens by itself. A box that is done starts
  closed. So the page shows you what needs doing.
- **Every box starts with the same three lines:**
  - **Working on** — what is being done in this box right now.
  - **We need** — the facts still missing. Press **Ask the client** beside one to put the question in their portal.
    Once asked, it says **Asked — waiting**.
  - **Coming from** — where the facts in this box come from. That can be Companies House, the EPC register or HM Land
    Registry. It can also be the care regulator, the client or the surveyor.
- **The boxes, top to bottom:** Claims; Check and tell the client; Questions for the client; **Chat**; Activity (tasks
  and the timeline); The company; Contacts (one card each); Properties; Lookups; What the client told us; Files. **Chat**
  has two tabs: **Team only**, for the internal notes, and **With the client** (see `B49`).
- **Make the page yours.** At the foot of each box are **keep this open for me** and **keep this closed for me**. The
  page remembers your choice on any computer. Nobody else's page changes. **Let the page decide** puts it back.
- **What went, and where:** The "Waiting on" box on the right has gone. Who we are waiting on is at the top of the page.
  The rest is in each box's **Working on** line. The long explanations are behind **Why?** Columns you rarely need are
  behind **More detail**. Some are behind **Every lookup in detail**. Nothing you may see was taken away.
- **Answering a fact from a phone call:** open **Questions for the client**. Then open **Everything still missing … and
  answer one from a call**. Use **Answer it here** on the fact.
- *Try it on the demo* (as sales@example.invalid, on a freshly started demo, 21 September 2026). Open **Clients** and
  choose **Elverton Private Hospital Limited**. *Observed:* nine boxes. **Claims 3** reads Working on it. Its Working on
  line starts "Next: Ask the surveyor". It asks when they can review the annexe drawings, for the main site. **Questions
  for the client** reads "Getting the accountant pack and the surveyor pack ready. 16 facts are still missing and nobody
  has asked for them." **Contacts 0** is closed and reads Not started. **Lookups 12** reads Not started, "12 lookups still
  to do." **What the client told us** reads Done, and is closed. Now press **keep this open for me** under Contacts.
  *Observed:* the page comes back at Contacts, open. It says "You keep this open." Press **Let the page decide** to put
  it back.
- *As Read only:* six boxes. They are Claims, Messages and activity (no notes), The company and Contacts. Then come
  Properties and Documents. There are no **Ask the client** buttons.

**One Clients list.** "Engaged clients" and "Organisations" used to be two lists of the same companies. Each opened the
same page. They are now one list, **Clients** (`/staff/clients`). It is a tab for Sales, Admin and Read only. Each row
starts with the **company's name**. Its legal name and sector are in small text under it. Then come **Waiting on**,
**Status**, **Owner** and **Claims**. The status has a colour. **Active** is green, and **Do not contact** is red.
**Claims** lists each claim by its site and number, with its stage in colour. So two claims of one company are easy to
tell apart. At the top, the boxes count who is waiting on us, who is waiting on the client, and who asked not to be
contacted. Press a box to see just those. **Find a client** searches by company, site or claim number. **Waiting on us
first** puts the companies waiting on us at the top. **A to Z** sorts by name. The old address `/staff/organisations`
brings you here.
- **Read only** can open the list. It shows company, status, owner and claims. **Waiting on** is not shown. It is built
  from the research and the questions, and Read only may not read those.
- The old list had more columns. They are now on the company's page, in the highlights and the **Waiting on** card on
  the right. They show the engagement letter, the research and the questions with the client. They show what is still
  missing. They show whether the accountant and surveyor packs are ready.
- *Observed on a freshly started demo, 21 September 2026, as Sales:* "6 companies. 5 waiting on us, 0 waiting on the
  client." The first row is **Aldergate Care Group Limited**, waiting on Us. The reason given is "the engagement letter
  is drafted and has not been sent". As Read only: "6 companies.", four columns. The status of Fenmoor Nursing Homes Limited
  reads Do not contact.

**One page per company.** A company used to have two pages: this one and the organisation page. It now has one, at
`/staff/clients/{company}`. The old organisation address opens it.

**Where things are now**
- **The heading is the company's name.** Its legal name is in small text underneath, where it differs.
- **Claims** — one tile per claim. Each shows the property, its town, the stage and the next action. The claim reference
  is a small grey label. Press the property's name to open the claim. The claim opens with "Company › Property" at the
  top. So you can always get back to the company.
- **Tabs**: **Timeline**, **Questions to the client**, **Still missing**, **Their answers** and **Research**. Then come
  **Contacts**, **Properties**, **Documents** and **Details**. **Timeline** holds tasks and internal notes. It also holds
  everything that has happened with the company, across all its claims.
- **A note or a question can say which claim it is about.** Choose it under **About which claim?**, or leave
  "The company in general".

**The top of a client's page.** First comes the client's name, with coloured labels for its status, owner and who it
waits on. The buttons are beside it. Then each claim has a box of its own. The box is headed by its stage, in colour,
such as "Claim 1 of 2 · Survey". It shows the site, the claim number and the next step, in a dark box. A late step has
a red label. **Open the claim** opens it. The menu on the left opens out too. It shows the client's name, **Overview**,
each claim by its site and stage, and the parts of the page.

**Every part, one line each.** Under the claims, each part of the page has one line. **Communication** is the first part.
**Activity** is the last. Each line says where that part
stands, what is going on, and how many things it holds. Press a line to open that part. You can also press the part in
the menu on the left. **Every part of this client** takes you back to the lines. After you save something, the page
opens on the part you saved in.

**Who can open it now:** Admin and Sales see all of it. The view-only login sees the company's record. That is Timeline,
Contacts, Properties, Documents and Details. It does not see the research or the notes. Accounting and Surveying are
refused.

**Try it on the demo** (as sales@example.invalid, on a freshly started demo, 18 September 2026)
- Open **Clients** and choose **Elverton Private Hospital Limited**. *Observed:* the address becomes
  `/staff/clients/…`. The highlights read Claims 3, Status Active and Owner nobody yet. They also read Waiting on Us and
  Engagement letter signed. Three boxes read **main site** (Survey, CR-2026-0005) and **main site** (Enquiry,
  CR-2026-0007). The third is **outpatient annexe** (Enquiry, CR-2026-0008). The tabs read Still missing 16 and
  Research 12.
- Press **outpatient annexe**. *Observed:* "Elverton Private Hospital Limited › outpatient annexe". That line is at the top. The
  heading is the company's name. Under it is "Claim on outpatient annexe, Nowhere Town CR-2026-0008".
- Back on the company, open **Chat** → **Team only** and write a message. Choose the annexe under **About which
  claim?** Press **Send to the team**. *Observed:* "Saved. Only your team can see it." The message reads "About
  outpatient annexe (CR-2026-0008)".

**Check yourself**
- *Where do you find everything said to a company with three claims?* — On its one page, under **Timeline**.
- *What is the grey CR number for?* — Quoting on the phone. It is never the name of anything.

*The rest of this section describes the tabs as they were before the one company page. The four working panels still
work exactly as it says.*

*Written on 17 September 2026. The exercise was run on a freshly started demo that day. The results below are what it
showed.*

**What it is for**
This lists everybody who has come through the assessment. Each has one page where the work before the survey is done.
That page shows what the client told us and which research sources have run. It shows what is still missing and who it
is waiting on. It holds the questions put to the client, and internal notes.

**Who can open it**
Admin and Sales work here. Read only may open the list, without **Waiting on**. Read only may also open a company's
page, without the research or the notes. Accounting, Surveying and the client are refused the list. They cannot
open any business page or use any action on it. That is because paid research can carry the purchase price. Admin
and Sales read and write internal notes.

Address: `/staff/clients` · one business: `/staff/clients/{business}`

**Where things are**
The list is one table, sorted by **Waiting on us first**. The business page opens with a highlights strip. It shows
**Sector**, **Stage**, **Waiting on**, **Engagement letter**, **Research** and **Still missing**. Then come five tabs,
one per numbered panel. First are **Questions and answers** and **Sources**, with how many are still to do. Next are
**Still missing**, with the count, and **Tasks**, the questions asked. Last is **Notes**. On the right are **Quick
actions** and **Waiting on**. The quick actions are **Run the research**, **Ask for a missing fact** and **Add a note**.
Each shows only when that control is on the page for you. **Waiting on** is one sentence.

**How to do the common job**
1. From **Clients**, open the company.
2. Read **Waiting on** on the right. If it is **Us**, choose **Ask for a missing fact** (or the **Still missing** tab).
3. On a row, you can press **Send to their portal**, with a due date if there is one. Or open **Answer it here** and
   type what the client told you. Or tick **They said they do not know**. Then press **Record it**.
4. The page opens on the **Tasks** tab with the question listed. A question asked in error is withdrawn there with
   **Withdraw — asked in error**.
5. **Run the research** is on the **Sources** tab. It makes every lookup still to do, all at once. There is no button
   per lookup. After a retry the page says **We tried that lookup again.** It also says "Only a lookup that did not work
   can be tried again."

**What it will refuse, and why**
- Running the research too often. The button is replaced by "Cannot run the research right now."
- Taking back a question that has an answer. It says "answered — an answer is not withdrawn".
- Paid lookups wait for a signed engagement letter. Free lookups wait for the privacy notice to be published. Until
  then they are not made. The page says "free lookups wait until our privacy notice is published". It also says "paid
  lookups wait until the engagement letter is signed". Their facts stay on **Still missing** as questions. Nothing on
  the page can turn either on.

**Try it on the demo** (as sales@example.invalid, on a freshly started demo)
- On 17 September 2026, **Engaged clients** read "6 in the pipeline. 5 waiting on us, 0 waiting on the client, 1 on
  neither." The one **Clients** list now says 6 companies. Its boxes say 5 wait on us. None wait on the client.
- Open **Corvale Supported Living Limited**. *Observed:* the highlights read Sector "supported living" and Waiting on
  "Us". They read Engagement letter "signed", Research "not run" and Still missing "16 facts". The tabs read Sources 12,
  Still missing 16, Tasks 0, Notes 0. The quick actions are Run the research, Ask for a missing fact and Add a note.
- On **Still missing**, press **Send to their portal** on the first row ("when did you buy the property, and for how
  much"). *Observed:* the page opens on **Tasks** with "The question is in the client’s portal." The Tasks tab reads 1.
  Still missing still reads 16. The fact is asked, not answered.

**Check yourself**
- *The client answered on the telephone. Do you send them the question anyway?* — No. **Answer it here**; the record
  says you entered it on their behalf.
- *Where is the button to run just the Companies House lookup?* — There is none. Press **Run the research**: "It runs
  them all at once." A person chooses when.
- *A question was sent to the wrong client. Delete it?* — No. **Withdraw — asked in error**; the fact goes back on
  Still missing and the record says who took it back.

---

### Training — `B7`/`B8` the surveyor's workspace

*Written on 17 September 2026. The exercise was run on a freshly started demo that day. The results below are what it
showed.*

**What it is for**
A surveyor's own jobs. Each job has the six steps of a desktop survey. They are the property and what the client said,
the room counts, the rates and the evidence. Then come **your own figures**, and the record. **Our estimate is withheld
until you commit your figures.** The screen says "It is not hidden on screen — we do not send it to you at all". You get
it straight away when you commit.

**Which job is which.** One client can have more than one job, one for each claim. So each job in the list shows the
client, then the site in bold, then the claim number in grey. The job's page says the same at the top, under the
client's name. If the client has another job, a yellow line says so, with a link to it. Under **The property**, this
job's own site comes first, marked **This job**. The menu on the left opens out to the job. It lists the job's parts,
the **Survey pack**, and the client's other job.

**The survey pack says which job it is.** A dark band at the top names the client and the site. Under it are the claim
number and the postcode. If the client has two jobs, it says which one this is. A button switches to the other pack,
at the same chapter. In the **Summary**, **Still needed** has two lines. One is for chapter 9. One is for chapter 10.
Each says how many. **Show all** lists every one. A video's length
reads like "32 s" or "2 min 12 s".

**Who can open it**
Surveying, Admin and Sales. A surveyor sees only jobs assigned to them, and is refused anyone else's. Only the assigned
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
3. On **5 · Your figures**, give the four figures. Tick **I looked at this field** for each rate you really looked at.
   Answer **On what basis did you reach these?** Then press **Commit my figures — this releases our estimate to me**.
4. The page opens on **5 · Your figures**, with our estimate beneath your figures. **Amend your figures** is now the
   quick action. A change needs a reason. Your first figures are kept.

**What it will refuse, and why**
- A commitment without a method: "Say on what basis you reached these. Without a method, your figures are not evidence."
- A job not assigned to you: "This job is not assigned to you, so you cannot commit figures on it."
- An amendment without a reason is refused. It says: "Without a reason, we cannot tell a real fix from being pulled
  toward our estimate."

**Try it on the demo** (as surveying@example.invalid, on a freshly started demo)
- On **Home**, look under **Waiting for your review and figures**. Open **Dunmarrow Medical Practice Limited**.
  *Observed:* it opens on **5 · Your figures**. The highlights read Rooms counted "0 of 8", Rates recorded "0 of 10", Your figures "not
  yet", Our estimate "withheld". The quick actions are Commit your figures, Record the room counts and Record what the
  client told you.
- On **2 · Rooms**, record 6 on the first room type. *Observed:* "Recorded.", the page opens on Rooms, and Rooms counted
  reads "1 of 8".
- On **5 · Your figures**, commit £120,000, £400,000, £30,000 and 22. Give "From the floor plans and the room counts." as
  the basis. *Observed:* Our estimate reads "released". **Our estimate, now released** is on the tab. The first quick
  action is now **Amend your figures**. The message says "Your figures are saved and our estimate is now shown to you."

**Check yourself**
- *The highlights say "withheld". Can Admin tell you the figure?* — Admin can see it, but it is not yours until you
  commit. Asking for it spoils the measurement. An attempt to open it is recorded.
- *There are no plant rooms. Leave the box empty?* — No. Type 0. Empty means not counted.
- *You spot an error after release. What now?* — **Amend your figures**, with the reason. The original stays beside it.

---

### Training — `B9`/`B10` the accounting view

**What it is for**
Caprebate's own money, and nothing else. That is our fee on each claim, and whether it has been raised, sent, credited
and paid. It is also what is still owed, and the VAT position. The page is a record of what somebody saw. It is never a
way of taking money. Nothing tells this system that a transfer arrived. A person who has seen the bank records it here.

**Who can open it**
Accounting and Admin, and nobody else. Sales and Surveying cannot open this page. Nor can they open an invoice or
use an action. The finance settings form is Admin's alone.

Address: `/staff/finance` · one invoice: `/staff/finance/{invoice}`

**How to do the common job**
**Where things are.** Four boxes count the money. They are **Invoiced**, **Received**, **Still owed** and **Late**.
The Late box is red when an invoice is late. It says how many. Under the boxes, a yellow line names each claim ready to
invoice. It has a **Raise our fee** button. The page has six parts. **Invoices** opens first and holds 3 and 4.
**Money** is section 1 and **VAT** is 2. **Fee controls and firms** holds 5 and 7. **Finance settings** is 6, and
**Earlier invoices** is 8. On a laptop the six parts are in the left-hand menu, under Finance. Invoices and Earlier
invoices show how many each holds. On a phone they are tabs. Each claim number sits under its company. A late invoice
has a red label. One with no due date has a grey one. The numbered headings stay the same. Three cards on your home page open this page. **Fees waiting to be
invoiced** opens section 3. **Invoices due and overdue** opens section 4. **The VAT position** opens section 2.

1. **Raise our fee.** On the **Invoices** tab, find **3 · Claims at the invoice stage with no invoice raised**. Press **Raise our fee** on the claim's row. There is no amount to type. The fee comes from the tax adviser's signed-off figure. The invoice takes the next number in the series.
2. Open the invoice by its number under **4 · The claims' invoices**, on the same tab.
3. **Record that it was sent**: give **Sent on** and press **Record as sent**. "Sent by hand, by post or as the client asked. This system does not email invoices."
4. **A credit note**: find **Credit notes — the only way a raised amount changes**. Give **Why it is credited in full**. Press **Credit what is left in full**. The amount is whatever is left, never typed.
5. **Money received**: find **Record money received**. Give **The day it arrived** and **The amount that arrived, in pounds**. Answer the bank-details question, or leave it "not asked". Then press **Record what arrived**.
6. Read **The money — from the records, never typed in**. Invoiced, credit notes, received and outstanding are all worked out. None of them is typed.

**What it will refuse, and why**
- A claim not at the invoice stage: "Our fee is raised on a claim at the invoice stage, and this claim is at Survey."
- No signed figure: "The tax adviser has not signed off a figure for this claim. Our fee is worked out from it, so nothing is raised."
- Sent on a future day: "An invoice is recorded as sent once it has been — not on a day still to come."
- Cancelling a sent invoice. It says: "A sent invoice is not cancelled — it went to the client, so it is credited, with a credit note."
- A credit with no reason: "Say why the invoice is credited."
- Crediting a second time: "This invoice is already credited in full."
- More than is owed: "That is more than this invoice still asks for (£4,000). Record what arrived against what is owed, and nothing more."
- No amount: "Give the amount that arrived, in pounds."
- Clause 13: "No clause 13 credit note is issued: Switched off. Nothing happens when a claim is reduced until clause 13 is complete. …"
- **No typed amounts.** Raising and crediting have no amount box. An amount sent anyway is ignored.
- **The due date is 14 days after the invoice date** now that clause 4 states it; it would read **No due date set yet** only if the payment terms were blank again.
- If Sales or Surveying try anything here, it is refused. They see "not authorised".

**Try it on the demo** (as accounting@example.invalid, on a freshly started demo)
- **Raise our fee** sent for CR-2026-0004 → **Not raised**, "… this claim is at Survey".
- Open CB-000001. **Sent on** 2026-09-30 → refused. 2026-09-11 → "State sent, on 2026-09-11", and **Due** reads 2026-09-16, 14 days after its date.
- Press **Credit what is left in full** with the reason "Raised on the wrong claim". You get credit note **CB-000004** for £9,000. An amount of £1 sent with it was ignored. The invoice reads "Outstanding £0 — credited in full — nothing is owed".
- Open CB-000002 (£4,000 outstanding). Record £20,000 → refused. Then record £2,500 that came in on 2026-09-11. It reads "Outstanding £1,500 — part received".
- **Finance** then reads "Invoiced £27,000; credit notes £9,000; received £16,500; outstanding £1,500".
- **On another freshly started demo**, press **Raise our fee** on CR-2026-0008. That is Dunmarrow Medical Practice Limited, at the invoice stage, with £4,935 expected. You get invoice **CB-000004**. It says: "The invoice is raised, with the next number in the series." It shows "Amount £4,935 — 3.00%". It shows "VAT £0 — Caprebate is not VAT registered; no VAT is charged on this fee". It shows "State raised, not sent". **Due** is 14 days after the day it was raised. On the claim, **Our estimated fee** is gone. The money now carries the invoice.

*The figures in this exercise were worked out again for the 3% fee. They use the demo's amounts: £9,000 on £300,000,
and £4,935 on £164,500. The steps are the same. The exercise was first seen at 5%. Run it again rather than quote it.*

**Check yourself**
- *An invoice went out with a mistake. Cancel it?* — No. A sent invoice is credited with a credit note; only an unsent one with nothing against it is cancelled.
- *An invoice's due date is blank. Is it overdue after 30 days?* — No. A due date is blank only while the letter's payment terms are blank. Then it is neither overdue nor on time. Today the letter says 14 days, so an invoice is due 14 days after its date.
- *Can you type a different fee?* — No. It comes from the signed-off figure through the fee rules, and only a credit note changes it.

---

### Training — `B11`/`B12` users and roles

Address: /staff/users (the **Settings** tab → **Users**; or **Your account** → "Users and roles")

**What it is for.** It gives staff and clients a login. It changes what a person's role lets them do. It switches an account off. In the page's own words: "Here you can add a user, change a role or turn an account off."

**Who can open it.** Admin only. Everyone else gets "not authorised".

**How to do the common job**
1. Open the **Settings** tab, then the **Users** tile.
2. Press **Add a user**. Fill in "Username — an email address" and "Display name". Choose a "Role". For someone who should only look, pick **READ_ONLY**. They can read the work and change nothing. They never see a value, money, a register or the audit log.
3. Leave "Business — for a CLIENT account only" empty unless the account is a client's.
4. Press **Create**. The next page shows a **temporary password**, once. Hand it over yourself; nothing is emailed. It works for 7 days.
5. To change a role, find the person's row and press **Change role**. Choose the role and press **Assign**. All their sessions end at once.
6. To switch someone off, press **Disable** on their row. Their sessions end at once. There is no button to switch them back on.

**What it will refuse, and why**
- A username that is taken, or does not look like an email address.
- Changing your own role. You must ask another admin. A demoted admin could not put it back.
- Disabling your own account. It says "you cannot disable your own account". Disabling the last admin is refused too: create another admin first. Without an admin, nobody can create one.
- Turning a staff account into a client account. A client belongs to one business, and a staff account belongs to none.
- Editing another person's name, username or photograph. There is no control for it at all. The page says: "You cannot change someone's name, username or photo. Only they can, from their own account."

**Try it on the demo**
1. Create **Trainee Seller**, `trainee@example.invalid`, role SALES. *Observed:* the next page shows a temporary password. Copy it.
2. Open **Users** again. *Observed:* the row reads Trainee Seller · SALES · active.
3. In the second browser, sign in as the trainee. Use the temporary password. Choose a password of your own. Set up the
   second step (see `B55`). Then open **Leads**. *Observed:* the Leads page opens.
4. As admin, **Assign** ACCOUNTING to the trainee. Refresh the trainee's Leads page. *Observed:* sent to Sign in.
5. Sign the trainee in again. *Observed:* Leads now answers "not authorised"; Finance opens.
6. As admin, press **Disable**. *Observed:* the trainee's next click goes to Sign in. Signing in says "those details did not match". The row reads ACCOUNTING · disabled.

**Check yourself**
1. *A salesperson moves to Accounting. When does their Sales access stop?* The moment you press Assign: "Changing a role signs that person out at once."
2. *A client's accountant asks for a login. What do you do?* Nothing on this page. The client's accountant never gets a login; they are a contact.
3. *A colleague's display name is misspelt. Can you correct it?* No. They correct it on their own Settings page.
4. *The data protection officer asks for a login of their own. Can you give one?* Not yet. The role is built but switched off, so it is not in the role list. It waits on Lakhbir's decision. Until then the registers stay with Admin.

---

### Training — `B13`/`B14` organisations

There is no separate Organisations list any more. It is the one **Clients** list (`B5`), and `/staff/organisations`
takes you there. Everything below about a company's record still holds, on its page.

A company's name opens the **one client page** (`B5`/`B6`). The organisation's own page and the business page used to
be two pages for one company. They are now one. Everything below is on that page. The tabs are **Details**, **Contacts**,
**Properties**, **Documents** and **Timeline**. Each holds what its name says. **Timeline** holds tasks, the timeline
and notes. The old address, `/staff/organisations/{organisation}`, still works and
takes you there.

**The claim page is coloured boxes too**, the same as a company's page. **Stage and next move** keeps the next move in
view. To close, hold, resume or reopen a claim, use **Other moves**. The history is under **Every move so far**. In
**The claim's facts**, the **We need** line asks the client for a missing fact about this claim. The answer comes back
under the company's **Questions for the client**. You record a fact under **Record a fact or an owner** (see `B50`).
**Grants and contributions** is a box of its own, straight after The claim's facts. The other boxes are **Figures**,
**The property**, **The team** and **Documents**. Then come **Money**, **Aftercare** and **Messages and activity**. The
fields that repeated the top of the page are gone. So is the copy of the company's contacts. The team links to the
company's contacts instead. A surveyor sees no Money, no Figures and no Ask the client. Accounting sees Documents, Money
and Messages and activity. *On the demo, as Sales:* open Elverton's **main site** claim. **The claim's facts** lists
"The claimant, for tax" and "The acquisition date", each with **Ask the client**. Then it says "and 5 more".

**Where things were on the page, before the boxes.** The list is one table. An organisation's page opened with its
highlights. They were client status, owner, sector, legal name and source. Then came three tabs. **Details** held the
organisation and **Change these**. **Related** held contacts, properties, claims and documents, with a count.
**Activity** held tasks and follow-ups. It also held the timeline and internal notes. **Quick actions** on the right linked to
three forms. They were **Log a call or add a follow-up**, **Add a contact or a property** and **Add a note**. For a role
that may open it, they also linked to **The business page**.

**What it is for**
One record per client organisation. It holds its names, company number, claimant type and addresses. It holds its
website, status, source and owner. It has its contacts, properties, claims and documents. It has its tasks, timeline and
internal notes. A fact that comes from a better source is shown with that source. It is never typed again.

**Who can open it**
Admin and Sales. Accounting and Surveying are refused the section.

Address: `/staff/organisations` · one organisation: `/staff/organisations/{organisation}`

**How to do the common job**
1. Open **Clients** and choose a company.
2. To change details, use **Change these**, then **Save**. A fact from a better source shows "from the Companies House register record" and has no box.
3. To add a person, fill in **Add a contact**. Its boxes are **Name**, **Job title**, **Contact type** and **Decision maker**. Then come **Email**, **Telephone** and **Notes — internal, never shown to the client**. Press **Add contact**.
4. To add a building, use **Add a property**: **Name of the site or building** and **Postcode**, then **Add property**.
5. To stop all outgoing messages, set **Client status** to **Do not contact** and press **Save**.
6. Read **Referred by**. It lists each firm whose referrals became leads for this client, and how many. It is read from the leads and never typed.

**What it will refuse, and why**
- A fact from a better source. A question is never asked twice. So the legal name, which is known from the Companies House register record, is not asked again. One sent anyway is refused.
- A contact with no name: "A contact is a person, and needs a name."
- Taking away the last email address or telephone number a client has. We must always be able to reach a client.
  The page says: "This is the only way we have to reach this client." Add another contact who has one first.
- A client's accountant or adviser is a contact and never gets a login. The page says so under **Add a contact**.

**We must be able to reach every client.** This is not optional. Each client needs at least one contact with an
email address or a telephone number. A client without one shows **Required** in red under **Contacts**. It stays
until you add one. The website will not save a new client without one either.
- Anything saved to send to a **Do not contact** organisation is refused (see `B23`).

**Try it on the demo**
As Sales, open Brackenfell Dental Partnership LLP. **Legal name** shows the name, and says it is "from the Companies
House register record". There is no legal-name box under **Change these**. Then try sending a different legal name for
it. The answer is the page **Not saved**. It says the legal name is already known from that record, so it is not asked
again. Then open Dunmarrow Medical Practice Limited. **Referred by** reads "no firm — none of this organisation’s leads
came from a referral". Beneath it is "read from the organisation’s leads, never typed here".

**Check yourself**
- *Why is there no box for Brackenfell's company number?* — It comes from the Companies House record, so it is not asked again.
- *The client's accountant wants to log in. What do you do?* — Nothing: an accountant is a contact, never a user.
- *What does "Do not contact" actually do?* — It stops anything being saved to send to that organisation or its people.
- *A firm referred this organisation. Where do you type the firm's name?* — Nowhere on this page. **Referred by** is read from the organisation's leads; the referral is recorded on **Introducers**.

---

### Training — `B15`/`B16` properties

**Coloured boxes, like the client page.** A property's page has no tabs now. It is four boxes. Each starts with
**Working on**, **We need** and **Coming from**. **The property** holds its details. Its **We need** lists any of
three facts that is not known yet. They are when it was bought, freehold or leasehold, and whether allowances were
claimed before. **Claims on this property** holds its claims, and **Open a claim for**. Then come **Documents** and
**Messages and activity**. **keep this open for me** and **keep this closed for me** work here too. *On the demo* (as
Sales): go to the company's **Properties** box. Open **Dunmarrow Medical Practice Limited — main site**. *Observed:*
**The property** reads Working on it. Its **We need** lists "Whether allowances were claimed on it before". It also
says "Finding the facts about the building."


**Where things were on the page, before the boxes.** A property's page opened with its highlights. They were
the organisation and the postcode. Then came the jurisdiction, the tenure and the number of claims. Then came **Details**. It held the property, what
the assessment captured, and **Change the property**. Next was **Related**, with its claims, **Open a claim for** and
its documents. Last was **Activity**, with tasks, the timeline and notes. **Quick actions** linked to each form.

**What it is for**
One record per building a claim is about. It holds the address and postcode. It holds the jurisdiction, type, use and
tenure. It holds the occupier and the previous owner. It holds when it was bought and sold (acquisition and disposal). It says whether allowances were claimed on it
before. What the client said in the assessment is shown beside it, never copied in.

**Who can open it**
Admin and Sales see all properties. A surveyor sees only some. They are the properties of organisations whose survey
jobs are assigned to that surveyor. On the demo, 3 are shown. A surveyor sees no timeline. Accounting is refused.

Address: `/staff/properties` · one property: `/staff/properties/{property}`

**How to do the common job**
1. Open **Properties** and choose one.
2. Read **The property**, and **What the client told us in the assessment** beside it.
3. Use **Change the property** and press **Save**. Leave **Occupier** and **Previous owner** blank unless you are changing them. Do the same with **Acquisition price, in pounds**.
4. To start another claim on this building, choose **Open a claim for** (a workstream) and press **Open claim**. It opens at the Enquiry stage.

**What it will refuse, and why**
- A person's name as previous owner or occupier. It says: "The previous owner must be a company name. It ends Limited, Ltd, LLP, plc or CIC. Or type a role such as INDIVIDUAL_NOT_RECORDED. Never type a person's name here."
- A price of £0: "The acquisition price must be more than nothing — leave it blank if it is not known."
- A jurisdiction the postcode already gives. It says: "The jurisdiction is already known from the postcode, so it is not asked again."
- A prior-claim answer the client's own assessment already gives. There is no box for it, and one sent anyway is refused. None of the demo properties has such an answer. So the page's words below are quoted from the code. "Whether allowances were claimed before is known from the client’s own answer in the assessment and is not asked."

**Try it on the demo**
Sign in as Sales. Open the main site of Dunmarrow Medical Practice Limited. Under **Change the property**, type
"Jane Smith" as the previous owner and press **Save**. **Not saved** appears with the sentence above.
Note that **Jurisdiction** reads "not known". Its **Why?** says "Not worked out". The postcode lookup is not
switched on yet. So we cannot tell the nation from the postcode. **Allowances claimed before?** reads "not known".
It says nobody has found out yet whether allowances were claimed on this property before.

**Where the site is, for its area**
The property box has a part called **Where the site is, for its area**. We can work out the size of the site from
the Land Registry's map of land boundaries. We look at one point on the site. The part shows that point and the
councils whose map files we read.
- **The point** is an easting and a northing, in metres. You can read them off an Ordnance Survey map. If the paid
  address lookup gave one, we use it. A point you type is used first.
- **Councils added** is for a site on the line between two councils. The site may be in either council's file.
  Choose the other council and press **Add the council**. Then both files are read.
- Only Admin and Sales can type these, and only once the letter is signed. Before that, the part says so. We keep
  who typed each one and when. You cannot change a point. To fix one, type the right point. The newest is used.
- Saving looks nothing up. The research run does that, and it is switched off for now. The research panel has one
  line for each property. It says what happened, or why nothing did.

**Check yourself**
- *The site sits on the line between two councils. What do you do?* — Add the other council under **Where the site
  is, for its area**. Both councils' files are then read.
- *The previous owner was a retired GP. What do you record?* — A role, not the name. For example, INDIVIDUAL_NOT_RECORDED.
- *You don't know the purchase price. What goes in the box?* — Nothing. Leave it blank; £0 is refused.
- *Where do survey dates live?* — On the claim, not on the building.
- *The client said in the assessment that they had claimed before. Do you record it here?* — No. It is read from their answer. Anything a review finds about that earlier claim goes in **Prior claim information**.

---

### Training — `B17`/`B18` claims

The claims list has six columns. They are **Company, Property, Stage, Next action, Owner** and, last and in grey,
**Reference**. It is sorted by company unless you choose another order. A claim's page has the **company's name** as
its heading. "Company › Property" sits above it. The property and the grey reference sit under it. Everywhere else, a
claim goes by its company or property name. The grey reference sits beside it. That is true on the board, Home,
Tasks, the dashboard, finance, documents and search. *On the demo, as Sales:* the first row of **Claims** reads
Aldergate Care Group Limited. **Elverton Private Hospital Limited** has three rows.

**Where things are on the page.** The claims list has **Filter, sort and save** beside it. Press an underlined
heading to sort by it: Reference, Next action or Value. A claim's page opens with its highlights. These are the stage, owner, property,
priority, value (for a role that may read it) and client. Next comes the **stage bar**. It shows the ten stages and
Closed, with the current one filled in. Under it you see **Moving on from …: Ready** or **Not ready yet**. It also shows
the first thing still needed. Then come the claim's boxes, one under another. The first is **Stage and next move**.
Others hold the facts, the checks, the figures and the property. More hold the team, documents and money. The last
holds messages and activity. Only **Stage and next move** opens by itself. Each other box shows one line, with its heading and how it
stands, such as **Working on it** or **Done**. Press a box to open it. A box you just changed opens. So does one you
chose to **keep this open for me**. On a laptop, the left-hand menu lists the boxes under the claim. A box that needs
work says **to do**. One waiting for the client says **waiting**. The stage shows in its colour at the top.

On the right are **Next action** and **Quick actions**. The quick actions are:
- **Log a call or add a task**
- **Set the next action**
- **Request a document**
- **Move the claim**
- **Email the client**
- **Add a note**

You see each one only when its form is on your page.

**What it is for**
The claim is the unit of work. One organisation can have many properties. One property can have many claims. Its page
holds:
- the header and overview;
- the pipeline panel, and the next action and tasks;
- documents;
- the capital allowances facts;
- the four figures and the sign-off;
- the deliverables register and aftercare;
- contacts, email, the timeline and internal notes.

**Who can open it**
Admin and Sales see everything. That includes the value, where the claim came from, and its team. Admin and Sales add
people to the team and take them off it. Accounting sees the client, the reference and the money. It also sees the
documents it may read. On a claim at the invoice stage, Accounting sees **Our estimated fee** too. A surveyor sees only
the claims on the jobs given to them. They see the claim's owner and surveyor, and never a figure.

Address: `/staff/claims` · one claim: `/staff/claims/{claim}`

**How to do the common job** (record a fact, then start a draft)
1. Open **Claims** and choose a reference.
2. Go to **The claim's capital allowances facts**. Choose the **Fact**. Then pick the **Answer**: **This value** or **Not known**. Add the **Value** if you have one, and the **Source**.
3. Press **Record the fact**. It shows with its source, who recorded it and when.
4. Read **The four figures**: A, B, C and D. Each one says why it is not there yet.
5. Go to **The deliverables register**. Find the one you are working on, and press **Start a draft**.
6. To change other things, use **Change the claim** and press **Save**. You can change the owner, surveyor, priority and workstream. You can also change the property, the expected completion and the reasons. You do not change the stage or the next action here.

**How to put the client's accountant on the claim's team**
1. On the organisation, use **Add a contact**. Set the **Contact type** to Accountant (or Adviser).
2. Open the claim. Under **The claim team**, choose them in **Add to the team**. Press **Add**.
3. They are listed with **On the team since** and who added them.
4. To remove them, press **Take off the team**. They stay a contact of the organisation. The record of the link stays too.

**What it will refuse, and why**
- The same contact twice: "That contact is already on this claim’s team."
- You try to add another type of contact, such as the decision maker. The page says "Only an accountant or adviser contact can join a claim’s team. If that is who they are, change the contact’s type first."
- You take someone off twice. You see **Not taken off the team**. The page says "That contact has already been taken off this claim’s team."
- You type a next action into **Change the claim**. The page says "next action is a task now, with an owner and a due date. Set it in the claim’s next action panel."
- You mark a fact **This value** but give no value. The page names the fact, such as "A s.198 or s.199 election affects the property". It asks you to pick one of the answers it offers. Or you can record the fact as not known.
- You record a sign-off at the wrong stage. The page says "A sign-off can only be recorded while the claim is with the tax adviser."
- You start a client report too early. The page says "The client report gives a figure. It cannot be drafted until the tax adviser's sign-off is recorded."
- A reference is never used twice. A claim cannot be deleted.

**Try it on the demo**
As Sales, open CR-2026-0004. Record "A s.198 or s.199 election affects the property" as **Not known**. Give the source
"The client told us". The row now reads "not known Client · … by Sales User". **The election, resolved** still reads
"unresolved … Not known does not pass". Then press **Start a draft** on the client report (sent directly). You see
**Deliverable not recorded**, with the client report message above.

Then open CR-2026-0008. It is a branch surgery. It belongs to Dunmarrow Medical Practice Limited, and it is at the invoice stage.
**Came from** reads "no lead — this claim was opened by staff on a property". **Tax adviser** reads "CAPREBATE_CTA,
Chartered Tax Adviser". It then shows the sign-off record, signed on 2026-09-01. The team says "Nobody is linked to this
claim yet." Now open Dunmarrow Medical Practice Limited. Add the contact *Practice Accountant Contact*, with the type
Accountant. Go back to CR-2026-0008. Choose them under **Add to the team** and press **Add**. They are listed as
"Accountant … by Sales User". Press **Add** again. You see "That contact is already on this claim’s team." Now sign in
as Accounting and open CR-2026-0008. **Our estimated fee** reads "£4,935". The box says this is counted in the finance
view, in the fees expected from claims at the invoice stage. Accounting sees no claim team. Signed in as the surveyor,
the team shows only **Owner** and **Surveyor**.

**Check yourself**
- *You record a fact as "Not known". Does it pass the Data gathering check?* — No. Not known and never recorded read the same. Neither one passes a check.
- *Can Accounting see the claim value?* — No. Accounting sees the client, the reference and the money.
- *Where do you change the stage?* — In the pipeline panel, with **Move the claim**. Never in **Change the claim**.
- *The client's accountant is on the claim's team. Can they sign in?* — No. A contact on the team stays a contact. Nobody on the team has a login.
- *Can Sales see our estimated fee?* — No. Only Admin and Accounting see it, because they read the money.

---

### Training — `B19`/`B20` leads

**A lead's own page.** When you open a lead, you see three coloured boxes, not tabs:
- **The lead**: its details, **Can we take this on? The checks**, **Change the lead** and **Convert**. Its **We need**
  lists each check that is not yet a yes.
- **Where it came from**
- **Messages and activity**

Each box starts with **Working on**, **We need** and **Coming from**. Each box remembers if you keep it open.


**The leads page.** The top line gives the count in each section. Four boxes show the same counts. Press a box to go to
its section. Under them is one row of switches. Pick **All leads** or **Filled assessments**. Pick **Cards** or
**List view**. **Website enquiries** and **Filter** are on the same row. **Record a lead** is the button at the top right. Leads are shown as
cards, in four sections, so a new one cannot get lost. Each section shows its count:

| Section | Holds | Shown |
|---|---|---|
| **New — not contacted yet** | status New, and any website enquiry not yet answered | always first, never folded |
| **In progress** | Contacted and Qualified | open |
| **Later** | Nurture | open |
| **Closed** | Converted and Lost | folded — press **Show** |

Each lead is a card. It shows the company, its sector and where it came from. It shows how long it has waited, its owner
and its next step. Cards are in waiting order, with the longest wait first. They are never in value order, and no card
shows a range. A **New** card turns **red** once it has waited more than one working day. Working days are Monday to
Friday. Bank holidays in England and Wales do not count. This is the same rule as the New leads row on Home. An **In
progress** or **Later** card is red when its next step is late, or when it has none.

Press a card to open it underneath. It shows **How to reach them**, **What the assessment captured**, **Before they
can be a client** (the four answers) and **What next**. **What next** has these buttons:
- **Log a call**
- **Email**
- **Add next action**
- **Make them a client**, only once every answer is a yes and the lead is Qualified
- **Mark as lost**, which asks why

**Open the full page** takes you to the lead's own page. A card nobody owns shows one button: **Nobody owns this — take
it**. Pressing it makes you the owner.

**Log a call** asks **Did you speak to them?** and **What was said**. It saves a completed Call task on the lead. The
task shows on the lead's timeline. Say they answered, and the lead was New. It then becomes Contacted and moves to In
progress. A call nobody answered leaves the lead where it is.

**Filter** opens the filters and saved views. On the cards, the order is always the longest wait first. **List view**
is the table, for anyone who likes it better. Its filters and headings you can sort by stay in List view. On a phone,
the table's rows become cards too.

*Observed on a freshly started demo, 21 September 2026, as Sales:*
- **New — not contacted yet 0**, with "No new leads. Nothing is waiting for a first call."
- **In progress 1**: Gorsebrook Invented Care Homes Limited. It shows "Care homes · from Referral" and "Owner: Sales User".
- **Later 0**
- **Closed 6**

**Filled assessments are leads.** At the top of the list, **All leads** and **Filled assessments** switch between the
two views. The **Leads** tab stays marked on both. The list of filled assessments used to be **Assessments**. It keeps
the same address, `/staff/assessments`, and the same rule. Admin and Sales can open it, and so can a surveyor. A
surveyor is not shown **All leads**. *Observed on a freshly started demo, 21 September 2026, as Sales.* **Filled
assessments** reads "6 submitted, newest first."

**Where things are on the page.** The leads list has **Filter, sort and save** beside it. The underlined headings
(Date, Next action, Figure shown) sort it. **Record a lead**, at the top, opens the form. A lead's page opens
with its highlights. These are the status, owner, source, next action and lead date. Once the lead is converted, the
claim is there too. Then come three parts:
- **Details**: the lead, the enquiry checks, **Change the lead** and **Convert**.
- **Related**: the introducer, and what the assessment captured.
- **Activity**: the timeline and tasks.

**Quick actions** link to:
- **Record an enquiry check**
- **Log a call or add a follow-up**
- **Convert — open the claim**

**Website enquiries.** The **Request my estimate** form on the website reaches the back office. The Leads page says how
many are waiting. It links to **Website enquiries** (`/staff/enquiries`). Admin and Sales can open it. Each row shows
who wrote, how to reach them, the property type and what they wrote. Press **Open as a lead** to make it a lead, with
the source Website. The person is added as a contact on it. Or press **Close, nothing more needed**. You can do either
one only once. Each person said yes to being contacted about what they asked. That is not a yes to marketing. A person
who finishes the assessment can also make their own client login. They confirm it by email. Nobody in the office needs
to do anything for that.

**What it is for**
This is where each possible claim is worked on before it becomes a claim. A lead holds its source, owner, next action
and status. It holds what the assessment captured and the four enquiry checks. It is also where you convert it. A
referred lead also holds its firm. It holds the client's answer about sharing progress too.

**Who can open it**
Admin and Sales can open it. So can Read only, but it sees the cards with no buttons and no website enquiries.
Accounting, Surveying and the client cannot open any lead page.

Address: `/staff/leads` (cards) · `/staff/leads?layout=list` (List view) · one lead: `/staff/leads/{lead}`

**How to do the common job**
1. Open **Leads** and choose one. Or make one with **Record a lead by hand** → **Record the lead**.
2. Go to **Can we take this on? The checks**. Record each **Check** with an **Answer**. Press **Record the check**.
3. Wait until all four read Yes. Then the page says **Ready**. It adds "Every check is a yes." Now go to **Change the lead**. Set **Status** to **Qualified** and press **Save**.
4. Press **Convert and open the claim**.
5. On a referred lead, read the client the words under **The introducer, and sharing progress with it**. Choose **Their answer**. Press **Record the answer**.

**What it will refuse, and why**
- No answer chosen: "Answer yes, no, or not known — not known is an answer, and it does not pass."
- You qualify a lead too early. The page says a lead is qualified only when each enquiry check is a recorded yes. Then it lists each check that fails.
- You convert a lead that is not qualified. The page says "Only a qualified lead converts, and this one is contacted."
- A referral with no organisation. The page says "This lead has no organisation yet. The organisation is created by the assessment — send them the assessment, then link this lead to the organisation it creates."
- You set Converted by hand. The page says "To convert a lead, use Convert. It opens the claim and checks the enquiry again."
- **Log a call**, without saying if you spoke to them: "Say whether you spoke to them."
- **Mark as lost** with no reason chosen: "A lost lead carries its reason: choose one from the list."
- No answer chosen about sharing: "Record what the client said — yes, no, or that they have withdrawn. Nothing is assumed."

**Try it on the demo**
As Sales, open the lead Gorsebrook Invented Care Homes Limited. Two checks read Yes. Ownership reads "Not known, by Sales
User". The claim-conflict check reads "never recorded". Both of those read "not known". Set **Status** to **Qualified**.
It is refused. Record ownership and claim conflict as Yes. Now every check is a yes, and **Qualified** saves. Press
**Convert and open the claim**. It is refused, because the lead has no organisation yet.

**Check yourself**
- *One check is "Not known" and one was never asked. Which blocks qualifying?* — Both, equally.
- *Can you type the client's name on the lead?* — No. A lead carries no person. People are contacts on the organisation or the firm.
- *What does converting create?* — The claim, at the Assessment stage. The lead is kept as the record.

---

### Training — `B21` the pipeline board

**Where things are on the page.** At the top are four boxes: claims in progress, next steps that are late, claims
nobody owns, and claims on hold. A red or brown box is a link to just those claims. Under them a coloured bar shows
where the claims are. Then comes one table of every claim. It has five groups. Each group has its own colour. The
first is **Winning it**. The last is **Getting paid**. Each row shows the business, then the site and
the claim number. It shows the stage, the next step and when it is due. A late step is red. It shows the owner, or
**Nobody yet**. Under the next step is the **Move to …** button. Claims on hold, and claims that have stopped, are at
the end. Use **Find a claim** to search by business, site or claim number. Use **All**, **Late**, **Mine** or
**Nobody owns it** to narrow the list. **Show as a board** opens the old board of columns. There, a stage's owner and
what it needs are under **Owner and what this step needs**. On a phone, each row is a card.

**What it is for**
It shows every claim on the ten steps, one column each. Below is a lane for claims on hold and the claims that have
stopped. Each column shows who owns the step and what it needs. Each card shows the reference, client, property and
owner. It shows the days since the last move and the next action. For Admin and Sales, it shows the figure the client was shown too. The
page says: "A claim moves one step at a time, and each move is checked when you press it."

**Who can open it**
Admin and Sales. Admin and Sales can make moves. Only Admin can reopen a claim. Accounting and Surveying cannot open the
board or make any move.

Address: `/staff/pipeline` · a move: sent from a card or the claim page

**How to do the common job**
1. Open **Pipeline** and find the claim's row. **Find a claim** helps.
2. To see what the step needs, open the claim, or use **Show as a board** and read the column's **What this step needs:** line.
3. Press the row's **Move to …** button. It asks for exactly the next stage.
4. If the move is refused, open the claim. Its pipeline panel lists each need with ✗ or ✓ and the reason.
5. To exit or hold, use the claim page. To exit, use **Close the claim here**, with **Exit to** and **Reason**. The record is kept. To hold, use **Put on hold**, with **Hold reason**.
6. After the tax adviser signs off, the figures are fixed. The claim page says so. The surveyor cannot approve a new
   version, and the legal check takes no new answer. To change the figures, an Admin presses **Reopen the valuation**
   and says why. The claim goes back to Valuation. The sign-off, the reports, the client's acceptance and any defence
   pack are set aside. Nothing is deleted. Each is done again on the new figures. The page then says who reopened it,
   when and why.

**What it will refuse, and why** (the page is headed **Not moved**)
- A skipped stage: "A claim moves one step at a time, and each step is checked. From Assessment the next step is Engagement."
- You try to move on before a step is ready. The page says "Not ready to move on from Enquiry yet." Then it lists what is still needed. One example is "The property is healthcare property in the UK". That means England and Wales at launch, Scotland second and Northern Ireland third. Here it is not known. A check that is not known does not pass.
- No signed letter: "Not ready to move on from Engagement yet. Still needed: A signed engagement letter — the engagement letter is sent and not yet opened and is not signed."
- A hold with no reason: "A hold carries its reason — say why the claim is on hold."
- No next action: "A claim moving to … needs one next step, with an owner and a due date. This one has not: … Set the claim's next step first."
- A claim on hold: "This claim is on hold. Resume it at the stage it was held at first."
- Sales tries to reopen a claim, or a surveyor tries to move one. Both are refused with "not authorised".
- The surveyor approves a pack once the claim is past the sign-off. The pack says "The signed figures are fixed." It
  says an admin reopens the valuation, with a reason.

**Try it on the demo**
As Sales, go to **Pipeline**. Press **Move to Assessment** on CR-2026-0007. You see **Not moved**, with all four enquiry
checks listed. Press **Move to Data gathering** on CR-2026-0002. It is not ready to move on from Engagement. The letter
is sent but not signed. Press **Move to Engagement** on CR-2026-0001, and it moves. The **Engagement** column now reads
"Engagement · 2". The claim's **Every move** shows "Moved on Assessment Engagement Sales User".

**Check yourself**
- *The card's button is there. Does that mean the move will work?* — No. "Each step is checked before a claim can move on — the button alone does not move it."
- *A claim was declined at enquiry by mistake. Who can bring it back?* — Only an Admin, with a reason.
- *Why can't a surveyor see the board?* — The board is for Admin and Sales. A surveyor sees only their own jobs.

---

### Training — `B22` tasks

The **Tasks** tab shows how many open tasks you have. It turns red when one is overdue. The page opens with three
views: **My tasks**, **Every open task** and **Claims with no next step**. The last one used to be the **Next actions**
list (`B24`). You see each view only if your role may open it.

At the top, four boxes count your tasks. **Late** is red. **Due today** and **No due date** come next.
**Claims with no next step** opens that list. In the table, a late task has a red label, with its date under it. Under
the table, the longer lists are folded. Each says how many it holds. Press one to open it.

**What it is for**
Tasks are the jobs colleagues do. Each task has an owner, or a team it waits with. It has a due date or none. It has an
activity type, a priority, a repeat if you want one, and a status. A question put to a client is not a task. It lives
on the business page and in the portal.

**Who can open it**
Every staff role sees its own tasks and the ones waiting with its team. Admin and Sales make, change and cancel tasks.
They can also see every open task. Accounting and Surveying can start and complete their own.

Address: `/staff/tasks` · one task: `/staff/tasks/{task}`

**How to do the common job**
1. Open **Tasks**. **My tasks** lists yours, overdue first. **Every open task** and **Claims with no next step**, at the top, switch the view.
2. To add a task, use **Add a task** on the organisation, property, claim or lead page. Fill in **Task** and **Activity**. Add an **Owner** or **Or the team it waits with**. Add **Due** if there is one. Press **Add the task**.
3. Press **Start**, then **Complete**. A task that repeats makes the next one when you complete it.
4. To drop a task, open it. Fill in **Cancel it — a task is never deleted, so say why**. Then press **Cancel the task**.

**What it will refuse, and why**
- No owner and no team: "Say who owns this task, or which team it waits with until somebody takes it."
- No title: "Say what the task is."
- You cancel with no reason. The page says "A task is cancelled with its reason, because it is never deleted."
- You change a finished task. The page says "A completed or cancelled task keeps its record: its status does not change again."
- You change a task that is its claim's next action. The page says "This task is its claim's next action, which keeps an owner and a due date. Set another next action first, then change this one."

**Try it on the demo**
Sign in as Sales. Open Dunmarrow Medical Practice Limited. Add the task "Check the fee invoice address with Finance". Leave
**Owner** empty. Set **Or the team it waits with** to Accounting. Leave **Due** empty. Now sign in as Accounting. The
task shows "waiting with Accounting — nobody has taken it". It also shows "no due date — so it is not overdue, and it is
not on time either". Go back to Sales. Cancel "First follow-up on the referral" with no reason. You see **Not
changed**. Try again with the reason "Duplicate of the ownership call". It now reads "Cancelled — cancelled … by Sales
User — Duplicate of the ownership call".

**Check yourself**
- *Can you delete a task entered by mistake?* — No. Cancel it with a reason. The record stays.
- *Does a task without a due date count as on time on the dashboard?* — No. It is counted apart.
- *The client needs to answer a question. Is that a task?* — No. It is a question to the client, sent from the business page.

---

### Training — `B23` a claim's next action, tasks, email and timeline

**What it is for**
This is the working half of the claim page. **Next action and tasks** keeps the claim's one next action and its other
tasks. **Email** opens the company's Email page with this claim chosen (see `B48`). **Activity timeline** shows what has
already happened. **Team only** holds your team's notes on this claim. The client never sees them. They are kept apart
from the timeline. Its link, **See the whole team chat about this client**, opens the company's Chat on **Team only**.
The property page has the same panel for a property's notes.

**Who can open it**
The next action, email and notes are for Admin and Sales. Accounting sees just the money parts of the timeline. The page
calls this "Financial events only". A surveyor sees their own tasks, and a timeline that shows only their job.

Address: `/staff/claims/{claim}` (the panels)

**How to do the common job**
1. Under **Next action and tasks**, open **Set the next action**.
2. Fill in **What happens next**. Choose the **Owner** and **Due**. Press **Set as the next action**.
3. To email, press **Email** under **Email**. The company's Email page opens with this claim chosen. See `B48`.
4. Once you save it, the email is on the claim's timeline: "An email to … — saved, not sent".
5. To keep a private note, type it in **Add a note** and press **Save note**.

**What it will refuse, and why**
- No owner: "A claim's next action has an owner: choose the person who will do it."
- No date: "A claim's next action has a due date."
- A claim that is closed or has left: "This claim has closed or left the procedure, and keeps no next action."
- You email a company marked do not contact. You see **Not sent**. The page says "This company is marked do not contact, so nothing was saved to send."
- Accounting and Surveying cannot set a next action, save an email or add a note.

**Try it on the demo**
As Sales, open CR-2026-0002. Set the next action "Send the engagement letter reminder" with no owner. You see **Next
action not set**. Choose Sales User and 2026-09-18. The header now reads "Next action Send the engagement letter
reminder due 2026-09-18". Next, open CR-2026-0004 and press **Email**. Start from "What happens next on your claim" for
Decision Maker Contact. Save it. You see "Saved — emails are not being sent yet." The claim's timeline shows it. Then
open the **Email** page of Fenmoor Nursing Homes Limited. You see "You cannot email this company."

**Check yourself**
- *Where do you set the next action — "Change the claim" or "Next action and tasks"?* — **Next action and tasks** (or on a move).
- *You saved an email. Has the client received it?* — No. Sending is switched off. The email is saved, and the page said so.
- *Does the client see internal notes?* — Never. They are kept apart from the timeline too.

---

### Training — `B24` the one-next-action list

This list is a view of **Tasks**. Open **Tasks**, then **Claims with no next step**. It is headed **Tasks**. Its two
parts are **No next step, or no owner or date** and **Next step overdue**. *Observed on a freshly started demo, 21
September 2026, as Sales:* "9 open claims checked". The first row is Brackenfell Dental Partnership LLP, "This claim
has no next action."

**What it is for**
One check on the whole pipeline. First the list shows each open claim with no next step, owner or date. Then it shows
the claims that keep the rule, but whose next action is overdue. Each claim shows who it is waiting on. The rule is
"Every claim still open has one next action."

**Who can open it**
Admin and Sales. Accounting and Surveying are refused.

Address: `/staff/next-actions` (**Tasks** → **Claims with no next step**)

**How to do the common job**
1. Open the list from **Tasks**.
2. Under **No next step, or no owner or date**, read **The next action** column. It says what is wrong. For example, "This claim has no next action…" or "The next action … has no due date."
3. Open the claim. Fix it under **Set the next action**.
4. Under **Next step overdue**, chase the owner or move the date.

**What it will refuse, and why**
- The list itself changes nothing. You fix claims on the claim page.
- A claim nobody owns is on no owner's list. But it is on this list. For Sales and Admin, the **Claims with no next step** tile on Home opens it.
- A shared wait counts as ours, because that is the one we can act on. The page says "If both sides are waiting, we count it as ours."

**Try it on the demo**
As Sales, open the list. It says "9 open claims checked". **No next step, or no owner or date** shows CR-2026-0002
("This claim has no next action."). It also shows CR-2026-0003 ("… has no due date."). **Next step overdue** shows
CR-2026-0001, "21 days overdue (1 Sep 2026)". That was on 22 September 2026. The number of days grows each day. Now do the `B23`
exercise, which sets Brackenfell's next action. Reload the list. Only CR-2026-0003 is left under **No next step, or no
owner or date**.

**Check yourself**
- *A next action has an owner but no date. Is the claim keeping the rule?* — No. It breaks it.
- *Who is "us" in "waiting on us"?* — Caprebate. Where both sides wait, it counts as ours.
- *Can Accounting open this list?* — No.

---

### Training — `B25` automation rules

Address: /staff/automation

**What it is for.** Rules do the usual follow-ups for you. Then nobody has to remember them. Each rule is one trigger and one effect. Each time a rule matches, it writes a run. You can read the runs at the foot of the page.

**Who can open it.** Admin and Sales can read it. Only Admin sees **Change** and **Add a rule**, and only Admin can save. When Sales sent a save, it was refused with "not authorised". Accounting, Surveying and clients cannot open the page.

**How to do the common job** (add a follow-up rule)
1. At the foot of the rules, open **Add a rule**. Give it a "Label".
2. Choose a "Trigger". For "A claim enters a stage", also choose "Stage, for “a claim enters a stage”". If you leave it at "any stage", it matches every stage.
3. Choose an "Effect". One effect is "A follow-up date". It makes a follow-up task, due in the days the rule gives.
4. Fill in "Task", "Task description" and "Task activity". Then fill in "Priority" and "Due, in days after the event". Then choose "Goes to", "Team" and "Attached to".
5. Leave "Active" at yes and press **Save the rule**.
6. To stop a rule later, open **Change “…”**. Set "Active" to "no — retired" and save. Rules are never deleted.

**What it will refuse, and why**
- Some effects are not allowed, so they are not in the "Effect" list. If one is sent anyway, it is refused by name. A rule runs with nobody watching. So a rule may never:
  - move a claim;
  - turn on lookups;
  - record a signature;
  - change a tax adviser's switch;
  - run the research;
  - write to a do-not-contact organisation;
  - send a message itself (it can only add a notice to the emails waiting to send);
  - make or chase an invoice.

  One example of the refusal is "No rule can move a claim. A person moves it, and each step is checked first."
- "Give the rule a label a person can read."
- "Only a “stage entered” rule listens for a stage."
- The effect "A document request to the client" saves once a document is chosen (see Part 1, A5). With no document chosen, you see "Choose the document the rule asks the client for."

**Try it on the demo**
1. Open **Automation rules**. Scroll down to "What the rules did". *Observed:* "No rule has run yet."
2. Open **Leads** and record a lead. Use the box "Or the organisation's name". Type *Greywater Clinic Limited* in it. Set "Its sector" to GP. Set "Where it came from" to Outbound. Set "Next action" to *Call the practice manager*. Press **Record the lead**.
3. Go back to **Automation rules**. *Observed:* "What the rules did" shows *A new lead gets its first follow-up* · A lead is created · a lead · **ran — 1 task**.

**Check yourself**
1. *Can a rule tell the client their claim has moved stage?* No. A notice goes only to the claim's owner. It is added to the emails waiting to send, and it is not sent. No rule may move a claim or speak to a client.
2. *Where do you see whether a rule ran?* Under "What the rules did". It shows "ran", or why it did not run.
3. *A rule that came with the system is no longer wanted. How do you remove it?* Set "Active" to "no — retired". Rules are never deleted.

---

### Training — `B26` email templates

Address: /staff/templates

**What it is for.** Standard wording to start an email from. Go to a client's **Email** page. There, **Start from a template** fills in the subject and the message. It uses the contact and claim you chose. You can change anything before you save. In this build nothing is ever sent.

**Who can open it.** Admin and Sales can read it. Only Admin saves a template. Accounting, Surveying and clients cannot open it.

**How to do the common job**
1. Press **Add a template**. The form opens. Fill in "Label", "Subject" and "Body".
2. Use only the six merge fields. Spell them exactly like this: `{{contact_name}}` `{{organisation}}` `{{property_address}}` `{{claim_reference}}` `{{next_action}}` `{{due_date}}`.
3. Set "Active" and press **Save the template**.
4. To use a template, open the client and press **Email**. Open **Start from a template**. Choose it and press **Use this template**.
5. Check the subject and the message, and change what you like. Press **Save the email**. The page says "Saved — emails are not being sent yet."

**What it will refuse, and why**
- Anything about invoices, payment or bank details. That includes the *shape* of a sort code or account number. Emails that carry bank details are how invoice fraud works. For example: "A template may not carry a bank transfer. We never send bank details from a template. The invoice email waits until our invoice-fraud steps are in place."
- Words that could tip a client off. Nothing a client reads may hint that we suspect them. So a template that mentions due diligence is refused.
- A merge field that is not one of the six: "“{{first_name}}” is not a merge field. The merge fields are {{contact_name}}, …".
- You try to email a company marked do not contact. You see "You cannot email this company."

**Try it on the demo**
1. Add a template called *Payment reminder*. Give it the body *Dear `{{contact_name}}`, please send the payment by bank transfer.* *Observed:* "Template not saved — A template may not carry a bank transfer. …"
2. Add *Welcome* with the subject *Welcome, `{{first_name}}`*. *Observed:* "“{{first_name}}” is not a merge field. …"
3. Add *Documents we still need*. Give it the body *Dear `{{contact_name}}`, for `{{organisation}}` we still need: `{{next_action}}`, by `{{due_date}}`.* *Observed:* it is saved and listed.
4. Open the page for **Dunmarrow Medical Practice Limited**. Then press **Email**. Start from "What happens next on your claim" for "Decision Maker Contact" and claim CR-2026-0004. *Observed:* the subject reads "Dunmarrow Medical Practice Limited — the next step on your claim". A subject starts with the company. After **Save the email**, the page says "Saved — emails are not being sent yet."

**Check yourself**
1. *Can a template include our bank details "just for this client"?* No. Any bank detail is refused. Bank details are checked in some other way, never by email.
2. *What does the client see where nobody recorded a due date?* A gap you can see, in square brackets. It is never a blank.
3. *Where do you check what was saved?* Under **Emails to** the company on its Email page, and on its timeline. Nothing is sent yet.

---

### Training — `B27` a claim's documents and requests

**What it is for**
The **Documents** panel on the claim shows the documents linked to the claim. Some are linked straight to it, and some
through its property. It also shows the requests to the client, with the open ones first. From here you can ask the
client for a document. You can also upload one yourself, or link one the organisation already holds.

**Who can open it**
Admin and Sales see everything. They can request, upload and link. Accounting sees only the fee invoice and the signed
letter. A surveyor sees the claim evidence for their job, and no requests.

Address: `/staff/claims/{claim}` (the **Documents** panel)

**How to do the common job**
1. Open the claim and scroll to **Documents**.
2. Under **Ask the client for a document — it goes to their portal. You can only ask for a type we can accept.**, choose **Document**.
3. Fill in **Why we need it**, **What it holds up** and, if there is one, **Due**.
4. Press **Request it**. It shows under **Requests** as "requested — waiting on the client".
   To add a file yourself, use **Upload a file to this claim** at the foot of the panel. Drop the file there, or tap to
   choose it. Say what it is. Tick **Let the client see this file** only if they should see it. Then press **Upload**.
   You land in the claim's folder of the company's files (`B47`).
5. Wait for the client's upload. Then the request turns to "received — they sent it".
6. If you asked by mistake, press **Withdraw — asked in error** while the request is still open.

**What it will refuse, and why**
- You leave the reasons out. You see **Not requested**. The page says "say why we need the document and what it holds up."
- A type we cannot accept. The list shows only eleven types. Each has a rule for reading its files.
- There is no "mark received" button anywhere. The page says "A request is marked received when an upload of that type passes our safety checks. There is no button for it."
- You withdraw a request that was received. The page says "that request has been received by an upload. The version that answered it stays on the record."

**Try it on the demo**
As Sales, open CR-2026-0003. Press **Request it** for "Lease, and any licence for alterations". Leave the two boxes
empty. You see **Not requested**. Now fill them in. In **Why we need it**, type "To confirm the tenure and the alterations licence". In **What it holds
up**, type "The survey". Set Due to 2026-09-10. You see **Requests — 1 outstanding, 1 OVERDUE**. Your **Tasks** page now shows
**Documents you asked a client for that have not arrived**. Home shows the late request as a red tile. Then the
client's upload arrives (see `C6`). The panel reads "Requests — 0 outstanding". The request reads "received — they sent
it, version 1".

**Check yourself**
- *The client says they posted the lease. Can you tick it received?* — No. Only the upload marks it received.
- *Why is "Capital allowances report" not in the request list?* — We have no rule yet for reading that kind of file. So we cannot accept one.
- *A request's due date has passed. How is that shown?* — "3 days overdue (…)", counted in UK days.

---

### Training — `B28` a document and its versions

**What it is for**
This is the page for one document. It shows the type and who may read it. It shows **What we did with the file** and
**When files of this type are deleted**. It lists every link to a claim or property. It lists every version too. Each
version shows who uploaded it, as a role and never a name. It also shows its state and **When this version is
deleted**. The page says: "Nothing is overwritten. Each upload is its own version."

**Who can open it**
The document's type decides. For claim evidence, such as a lease: Admin, Sales, a surveyor on an assigned job, and the
client. For the fee invoice: Admin, Accounting and the client. Nobody can have the original file back. It was deleted
after the checks.

Address: `/staff/documents/{document}`

**How to do the common job**
1. From the claim's **Documents** panel, open the document.
2. Read **Type**, **Who may read it**, **What we did with the file** and **When files of this type are deleted**.
3. Under **Linked to**, see each claim or property. To stop a link, press **End this link**. The link is ended, not deleted.
4. Under **Version history**, read the row for each version.
5. To add a newer copy, drop the file on the box. The box is under **Version history**. Or tap the box to choose the file. Then press **Upload a new version**. It becomes version 2, and version 1 stays.
6. Under **Who can see it**, the page says **The client can see this** or **Only Cap Rebate can see this**. Admin and Sales can change this on a file we sent. Press **Let the client see it** or **Hide it from the client**.

**What it will refuse, and why**
- A role the type does not let in is refused. For example, Accounting, or a surveyor not on the job, opening a lease. The refusal is logged.
- Admin may ask for the original. The answer is "We read each file and then delete it. We keep what we took from it, not the file." The page offers **See what we took from it**. Keeping originals is switched off for now. It stays off until Lakhbir and the data protection officer decide (see `B47`).
- A new version must be the same type. If not: "a new version of … must be of the same type."
- Ending a link twice: "that link has already been ended."

**Try it on the demo**
First do the client's lease upload in `C6`. Then, as Sales, open the lease from CR-2026-0003. **Who may read it**
reads "Claim evidence — Admin, Sales, a surveyor on an assigned job, and the client". Version 1 shows "the client" and
"Read — we kept what we need". Its original shows "Deleted …, once we had read it". Its **When this version is
deleted** starts "Deleted 6 years after the later of two dates". It then says "Worked out by us". The data protection
officer has not approved the rule yet. So no deletion date is set. Now sign in as Accounting, or as the surveyor. The
same address is refused.

**Check yourself**
- *Why does the page name "the client" rather than a person?* — Versions record a role, never a name.
- *A newer lease arrives. What happens to the old one?* — It stays as version 1. Nothing is overwritten.
- *Can Admin download the original?* — Not today. It was deleted on purpose once it was read. Lakhbir may switch on keeping originals. Then Admin can open one until its time is up.

---

### Training — `B29` document types

Address: /staff/document-types

**What it is for.** It lists each kind of document. For each one it records who may read it. It records whether it can carry a claim value, a tax benefit or a fee. It records when its files are deleted, and whether it is in use. It also shows whether we can accept that kind of file at all. The page says: "For each type: who may read it, when its files are deleted, and whether we can accept it. **No deletion date set yet** means just that. We never fill in a date for you."

**Who can open it.** Admin and Sales can read it. Only Admin saves. Accounting, Surveying and clients are refused.

**How to do the common job**
1. **Where things are.** The types sit in a list down the left. They are grouped by who may read them: **Claim evidence**, **The claim team**, **Finance** and **The engagement letter**. Then comes **Add a type**. Each type is one line. The line shows its name, its code and whether it can carry a value. It shows its badge: **No deletion date set yet** or **Deletion rule chosen**. It also shows whether it is active. Press the line to open it.
2. In the opened type, you can change **Label**, **Who may read it**, **Can it carry a value** or **State**. You can also change **When it is deleted**. The choices are **No deletion date set yet** and **The 6-year rule for files a client sends**. Then press **Save** (the button names the type). The page opens again on the group the type now sits in.
3. To add a type, choose **Add a type** in the list. Fill in "Code" and "Label". Choose "Who may read it" and "When it is deleted". Then answer "Can it carry a claim value, a tax benefit or a fee?". Press **Add the type**.
4. A new type has no rule for reading its files. It can be listed, but it cannot be sent or asked for. First the data protection officer must decide the rule. Then a developer adds it in a system update.

**What it will refuse, and why**
- A type that can carry a claim value, a tax benefit or a fee must keep saying so. The message ends "is never marked as not carrying one."
- Such a type cannot be claim evidence either. A surveyor must never see our figures before they commit their own. So the message says "A surveyor would read it."
- You may try to ask a client for a type with no rule for reading its files. We cannot accept that kind of file yet. So the request is refused with "nothing could ever receive it."
- A deletion rule that is not on the list is refused. The message is "choose a deletion rule from the list, or choose “No deletion date set yet”."
- There is no delete, and no control for the reading rule on the page.

**Try it on the demo**
1. Open **Asbestos register** under Claim evidence. Change its label to *Asbestos register and survey*, and press Save. *Observed:* it is saved. A claim's "Ask the client for a document" list shows the new name.
2. Try to set **Caprebate's fee invoice** to "cannot". *Observed:* the row offers only "can carry a value". When forced, it answers "Type not changed", with the message above.
3. Add a type. Give it the Code `DILAPIDATIONS_SCHEDULE`. Give it the Label *Schedule of dilapidations*. Set the readers to **Claim evidence**, and carries a value to **yes**. *Observed:* "Type not added — … cannot be claim evidence. A surveyor would read it."
4. Repeat with the readers set to **The claim team**. *Observed:* it is added. It shows "added by an administrator" and "No deletion date set yet". It also shows "We have no rule yet for reading this kind of file …". It does not appear in a claim's request list. A forced request was refused with "nothing could ever receive it."

**Check yourself**
1. *Why can't a client upload their engagement letter?* The type has no rule for reading its files. The data protection officer decides one. Then a developer must switch it on in a system update.
2. *Can the fee invoice be made readable by a surveyor?* No. A type that can carry a fee can never be claim evidence.
3. *A type is obsolete. Delete it?* No. Set it to retired.
4. *The data protection officer says yes to our rule for accounts. Can a client upload accounts the next day?* No. First the approval is recorded: "Approved by the data protection officer, but not switched on yet". Then a developer switches the rule on in a system update. Only then does the type stop reading "We have no rule yet for reading this kind of file".

---

### Training — `B30`/`B31` introducers, and one firm

**What it is for**
These are the firms that send us clients. Most are accountancy practices. It also holds the people at those firms.
Nobody at a firm ever has a login. The list shows what each firm has sent us. It is read fresh each time. A firm's page
holds its people and its referrals. It holds the contact logged with it, as tasks. It also shows whether each client
wants progress shared.

**Who can open it**
Admin and Sales see everything except the money. Accounting sees each firm's name and the money, and nothing else. The
money is **Fees invoiced** and **Fees paid**. Surveying is refused.

Address: `/staff/introducers` · one firm: `/staff/introducers/{firm}`

**How to do the common job**
1. Open **Introducers**.
2. To add a firm, use **Add a firm**. Fill in **The firm's name**, **Its kind**, **Relationship started** and **Notes**. Press **Add the firm**.
3. To record a referral, use **Record a referral**. Choose **A firm already recorded**, or fill in **Or the firm's name**. Fill in **The person referring**, **Their email** and **Their telephone**. Then give **The client business's name** and **Its sector**. Give **The property's postcode, or its first half**. Give **What happened at the property** and **In which year**. Press **Record the referral**. You land on the new lead.
4. On the firm's page you can add people with **Add the person**. You can log contact that happened with **Log it**. You can plan the next contact with **Plan it**.

**What it will refuse, and why**
- A referral with no client business is refused: **Referral not recorded**. The message is "Name the client's business — a referral is about an organisation."
- A firm with no name: "An introducer is a firm, and needs its name."
- A planned contact with no date: "A planned contact has a date — the next contact is read from it."
- You may try to log what we give a firm while the reward model is off. The message starts "You can only log what we give back to a firm while reward model A is on…"

**Try it on the demo**
As Sales, add the firm "Hollowmere Invented Accountants LLP". Its page opens with "Leads referred 0". It also says
"Estimated claim value: not known — no referred claim has a locked estimate". Now record a referral from "Quarrendon
Invented Tax LLP". The client is "Hartwell Invented Dental Limited". The new lead shows **Introducer** Quarrendon
Invented Tax LLP. Look under **Notices to the firm**. It says "Referred not sent — the client has not agreed to share
progress with this firm". Now sign in as Accounting. **Introducers** lists both firms. Only **Fees invoiced** £0 and
**Fees paid** £0 are filled in.

**Check yourself**
- *The referring partner wants a login to track the claim. Possible?* — No. Nobody at a firm has a login.
- *Why did the "Referred" notice not go?* — The client has not said yes. Never asked counts as no.
- *An estimate is missing on a referred claim. Is it counted as £0?* — No. It is counted apart, as not known.

---

### Training — `B31` the merge on a firm's page

Address: /staff/introducers/… (the duplicate firm's own page)

**What it is for.** Sometimes one firm that sends us clients is recorded twice. The merge moves its leads, people and open tasks onto the real record. Then the firm's figures read as one.

**Who can open it.** Admin, Sales and Accounting can open the firm's page. Each sees their own part. Only Admin can merge. When Sales pressed **Merge**, the answer was "not authorised".

**How to do the common job**
1. Open **Introducers**, then the *duplicate* firm.
2. Under "Merge this firm onto the one it really is", choose "The firm it really is".
3. Fill in "Why these are the same firm" and press **Merge**.
4. The copy's page now says what moved and what stayed. Check the real firm's page for its leads and people.

**What it will refuse, and why**
- "Say why these are the same firm — up to 1,000 characters." You must be able to explain a merge later.
- "This firm has already been merged onto another."
- "A firm is not merged onto itself." (from the code)
- "That firm was itself merged away. Choose the firm it was merged onto." (from the code)
- Money is never moved by a merge. First settle the fee, or record it against the firm it belongs to. Until then the merge is refused: "This firm has a fee recorded against it." (from the code)
- A client's yes to sharing progress with the copy **does not** carry over. Consent is given to a firm, not to a name.

**Try it on the demo** (the demo starts with no firms, so make two)
1. On **Introducers**, use **Add the firm** twice. Add *Hollinbrook Accountants LLP* and *Hollinbrook Accountants*, both "Accountancy firm".
2. Open *Hollinbrook Accountants*. Leave the reason empty and press **Merge**. *Observed:* "Not merged — Say why these are the same firm — up to 1,000 characters."
3. Enter the reason *Same practice, typed twice* and press **Merge**. *Observed:* you land on the LLP's page. Its leads, its people and its open tasks moved there. Its closed tasks stay on the copy. Each client's answer on sharing progress stays too. So does every notice. They stay as they were recorded. The copy's page starts "Merged onto Hollinbrook Accountants LLP on 2026-09-12 11:43."
4. Press **Merge** again. *Observed:* "This firm has already been merged onto another." Both names still appear in the Introducers list.

**Check yourself**
1. *A client said yes to sharing progress with the duplicate. After the merge, does the real firm get notices?* No. That yes is not moved. Ask the client, and record a new answer against the real firm.
2. *The duplicate has a model B fee on it. Can you merge?* No. First settle or record the fee on the firm it belongs to.
3. *Can Sales merge two firms?* No. Only Admin can merge.

---

---

### Training — `B32` the reward model and fees

**Now called Introducer fees.** Admin opens it from the **Settings** tab, with the **Introducer fees** tile. Accounting
opens it from **Introducer fees** in the menu, under **Money**. Sales uses the link on **Introducers**.

Address: /staff/introducer-rewards

**What it is for.** It records whether, and how, we reward firms that send us clients. The choice is Off, model A, model B or model C. Model A is no cash: we give the firm something back. Model B is a fixed fee for each successful claim, and the client is told. Model C is 10% of our fee as actually invoiced. It goes to a registered accountancy firm. It is reversed if the fee is reduced under clause 13. The page also lists any model B fees owed to firms. For model C it shows a ledger of each fee owed and each reversal.

**Who can open it.** Admin, Sales and Accounting can read it. Only Admin sees "Switch it". Surveying and clients are refused.

**How to do the common job**
1. Read the wording of clause 1 near the top. Above it is the state, such as "It is Off — nothing is offered to an introducer."
2. Wait until Lakhbir has decided and clause 1 of the letter is complete. Then choose a "Model" under "Switch it". If it is B, enter "Model B's fee per successful claim, in pounds". Press **Save**.
3. Under model B, a fee appears in "Fees to introducers" when a referred claim closes. Sales or Admin records that the client was told about it. Only after that may Admin or Accounting mark it settled. (No fee exists on the demo, so these controls could not be seen.)

**What it will refuse, and why**
- Any change from Off while clause 1 is blank is refused. We cannot offer a reward that the letter does not tell the client about. The message starts "Introducer fees stay off while clause 1 of the engagement letter is blank."
- Model B needs an amount. Without one it says "Model B is a fixed fee" and asks for the amount in pounds. (from the code)
- A fee cannot be marked paid before we record that the client was told. The database refuses it.
- Sales pressing Save is refused with "not authorised".

**Try it on the demo**
1. As admin, choose "B — a fixed, disclosed fee per successful claim, paid to the firm". Enter 250 and press Save. *Observed:* "The reward model did not change — Introducer fees stay off while clause 1 of the engagement letter is blank. It still reads [Where the Client has none engaged, …]".
2. Try "A — no cash. We give the firm something back …". *Observed:* the same refusal.
3. Sign in as Accounting and open the page. *Observed:* it opens, shows "It is Off", and has no "Switch it" section.

**Check yourself**
1. *Who decides whether a firm is paid?* Lakhbir ("Is anything paid to the accountant?"). Clause 1 of the letter must be complete first.
2. *Can Accounting switch the model?* No. Accounting reads the page. It can mark a fee settled, but only once the client has been told.
3. *Under model B, when may a fee be paid?* Only once we have recorded that the client was told.
4. *Under model C, a clause 13 credit note reduces our fee. What happens to the firm's 10%?* We write a new entry beside the first one. It takes back 10% of the amount credited. The first entry is never edited or deleted.

---

### Training — `B33`–`B39` the compliance registers

Address: /staff/compliance

The links along the top are:
- Compliance
- Due diligence
- Rights requests
- Complaints
- Breaches
- People named on documents
- Retention

**What it is for.** These are the records Caprebate must keep by law. They cover data protection and money laundering. The registers are rights requests, complaints and breaches. They also cover people named on documents. Then come consent history and retention. Last is customer due diligence, which is switched off. The landing page shows the two dated settings and each register's count. It also has a person search.

**Who can open it.** Admin only. Sales was refused "not authorised". Remember the banner. One Admin login types both names, so the system does **not** check that two people did it.

**How to do the common job** (record a dated setting)
1. On the landing page, under "Settings — dated, and sourced", press **Record a new dated value**. The form opens.
   Choose "Setting" and "Value".
2. Fill in "Takes effect". Then fill in "Where it comes from — a written answer, a policy schedule".
3. Press **Record a new dated value**. The old value stays on the record. The new one applies from its date.

**What it will refuse, and why.** A value with no date: "Setting not recorded — Say from when it takes effect." A setting that has no date cannot be checked later.

**Try it on the demo.** Choose the setting "Customer due diligence is in force". Choose the value "On — a claim cannot pass the engagement step without a finished check". Make it take effect on 31/12/2026. Give the source *Training exercise only*. *Observed:* it is saved. Today's reading still says "Off — nothing blocks a claim". **Do this only on the demo.** On a live system, wait for the solicitor to answer in writing. Only then may you record this value.

#### Due diligence
Address: /staff/compliance/aml. It reads "OFF — nothing here blocks a claim. The register can still be kept." You can still keep the records. **Record an appointment** records who the officer is. The law calls them the nominated officer. **Record a dated assessment** records the risk assessment for the whole firm. **Open a check** starts a check. In it, choose the "Organisation" and "Kind of claimant". *Observed:* the page opens with "Officers — None recorded", no risk assessment and "Checks — None." Companies House lists who has control of a company. Its list is called people with significant control. The page says this list "does NOT stand for beneficial ownership". So it is not proof of who owns the business.

#### Rights requests
Address: /staff/compliance/rights. Use **Log a request**. Give "Received": when it arrived, not when it was read. Give "How it arrived" and their words. Tick each right under "The rights it asks for — each has its own deadline". *Try:* received 2026-09-10 09:30, dedicated address, Art 15. *Observed:* **RR-001**, earliest deadline **2026-10-09**. The **Deadlines** table shows the sums. One month from 10 September 2026 ends on 9 October 2026. The page calls this "the cautious reading". The other reading gives 10 October 2026. The page says "Caprebate works to the earlier".

#### Complaints
Address: /staff/compliance/complaints. Use **Log a complaint**. Decide its kind "now, on receipt": is it a s.164A complaint? *Try:* received 2026-09-11 14:00 by post, "No — not a s.164A complaint". *Observed:* **CP-001**, Acknowledge by **2026-10-10**, "not acknowledged yet", OPEN.

#### Breaches
Address: /staff/compliance/breaches. Use **Open an entry**. When we became aware is fixed on the day. The description box is "What happened — never bank details". *Try:* a description containing "sort code 12-34-56". *Observed:* "Entry not opened — The breach register never records bank details, and this carries a sort code."

Without the sort code, the entry opens as **PDB-001**. The page counts "72 calendar hours from awareness". Awareness was Friday 2026-09-11 at 16:30 BST. So the time runs out on Monday 2026-09-14 at 16:30 BST.

#### People named on documents
Address: /staff/compliance/identity. There is no list of names. You can **Search names — every search is logged**, or **Record a person printed on a document**. *Try:* search "Smith". *Observed:* the page comes back with no list, and the search is logged. Try to open a made-up person reference. It answers "not authorised". A real one you may not see gives the same answer.

#### Consent history
Address: /staff/compliance/consent/… (for one contact). *Try:* choose the Decision Maker Contact. They work at Dunmarrow Medical Practice Limited. *Observed:* Being contacted "not given"; Marketing "not given — the box is never ticked for anyone"; Sharing progress with a referring firm "never asked — nothing is shared". A new answer goes in with **Record an answer** (Which, Answer, and the version of the words they were asked).

#### Retention
Address: /staff/compliance/retention. The heading is **Retention — what is due for deletion**. The page says "This list deletes nothing." Each row's **When it is deleted** gives its rule in words. For example: "Six years from our final answer to the complaint." Then it says one of three things. It may say "Worked out by us — not yet approved by the data protection officer". It may say "No rule for this yet". Or it may say "No deletion date set yet". Each row ends "No deletion date set yet". The table has seven columns. Record · When it is deleted · Records · No date yet · Held · Past their date · Deleting. Staff tasks show 11 records and "Nothing is deleted from here". The database will not let them be deleted. That is on purpose.

**Check yourself**
1. *Two names must sign off a breach decision. Does the system check two people did it?* No. One Admin login types both names; the names are a record, not a control.
2. *Where is the deadline for a rights request stored?* Nowhere. It is worked out from the recorded dates each time the page is read, and the working is shown.
3. *Can you print a list of everyone named on documents?* No. There is no list. You open a person by their reference. Every opening and every search is logged.
4. *Is there a record of which firms have received a client's data?* Not yet. The log of each time we share data is built, but switched off. So it records nothing. It says "NOT KEPT", never "none".

---

### Training — `B40` the dashboard

**Now called Reports.** Open it with the **Reports** tile on **Home**. The tile sits at the end of a row of tiles.
That is the pipeline row, the money row or the survey-jobs row. The page is headed **Reports**. Each tile's "how it is read" sentence is behind
**Why?**. The old address `/staff/dashboard` now takes you to **Home**.

**What it is for**
This is a view for managers. It is read fresh on every visit. It has tiles for the pipeline, estimate to outcome and the
money. There are also tiles for the work waiting, compliance clocks and survey jobs. Nothing on it is stored. A figure
nobody can know yet is said in words. It is never shown as £0. The page says: "A figure not known yet is said, never
shown as zero."

**Who can open it**
All four staff roles can open it. But each tile is drawn only for a role that may read every figure in it:
- Admin sees the most, including **Compliance**.
- Sales sees **The pipeline** and **Work waiting**. Sales also sees **Estimate to outcome, and what is still to issue** and **My survey jobs**.
- Accounting sees **The money** only.
- A surveyor sees **My survey jobs** only.

Address: `/staff/reports` (the figures as data: `/staff/dashboard/view.json`)

**How to do the common job**
1. On **Home**, press **Reports**. The first line gives the UK date the figures are "as at".
2. Read each tile's figures. Then read the line under them. It says what is counted apart. For example: "2 open claims have no estimate yet — not known, so not counted as £0".
3. Press **Why?** at the foot of a tile to see how it is worked out.
4. Open the page behind a tile (Pipeline, Finance, Tasks) to act.
5. **For a report over a period**, use **Pick a period** and choose a **Period**. You can choose This month or This quarter. You can choose A UK financial year — 1 April to 31 March. Or you can choose From one UK date to another. Where the choice asks, give **For a financial year, the year it starts in**. Or give **For a range, from** and **to**. Press **Show**. **No period** puts the figures back to as at today.
6. Read the last line of each tile. If the period applies to a tile, the line says so. A tile that counts what stands today ends "As at today — a count of what is there now. The period chosen does not change it."

**What it will refuse, and why**
- A tile your role may not read in full is not built for you at all. Open **Why?** under the date to see the reason. It says "Each figure is shown only to a role that may read every number in it."
- A surveyor's tile never carries a figure of ours. It says "No figure of ours is on this tile, for anyone."
- Unknowns are never added in. For example, "2 open claims have no estimate yet — not known, so not counted as £0".
- A range that ends before it starts is not used. The page says why: "From and to: the end date is before the start date. No period was used".
- A lost lead carries no date it was lost. So with a period chosen, it is counted apart. It is not placed in the period.

**Try it on the demo**
Sign in as Sales. **Open pipeline value** reads "8 claims" and "£1,800,000 over 6 claims". The two claims with no estimate are
counted apart. **Overdue tasks** reads "1 task". As Accounting, you see only **The money**. It reads "Invoiced …
£45,000" and "Paid … £20,000". It also reads "Outstanding … £25,000" and "Overdue £0 on 0 invoices". As the surveyor,
you see only **My survey jobs**. It lists "CR-2026-0006 · Survey · waiting for your figures". It lists "CR-2026-0004 ·
Survey · waiting for your figures" too. It also lists "CR-2026-0008 · Invoice · your figures are committed".

Now, as Sales, choose **This quarter** and press **Show**. The page says "Showing this quarter, July to September
2026, 1 Jul 2026 to 30 Sep 2026."

Choose **A UK financial year** with 2026. **Won and completed claim value** reads "Completed" with 0 claims. That counts
claims closed in the UK financial year. It runs from 1 April 2026 to 31 March 2027. But **Open pipeline value** still
reads "8 claims" and "As at today". Choose **From one UK date to another**, from 2026-09-30 to 2026-09-01. No period is
used, and the page says why.

**Check yourself**
- *Why is Accounting's dashboard so short?* — It only shows tiles that Accounting can read in full.
- *Two invoices have no due date. Are they in "Overdue"?* — No. They are "Not counted as overdue or on time".
- *Is the pipeline value stored anywhere?* — No. It is read from the records every time.
- *Where is the reports screen?* — This dashboard, with a period chosen. Nothing is stored for a report.

---

### Training — `B41` search

**What it is for**
One box finds things across the system. It finds organisations, contacts, properties, claims and invoices. It finds
new enquiries too: leads with no organisation record yet. It also finds internal notes. It only looks in what your role
may read. The page always lists what was searched and what was not.

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
- Some things are never searched, for anyone. These are people named on documents and the compliance registers. The text of any document and the estimate are never searched either. Nor are notes, for a role that may not read notes.
- Nothing you may read: "Nothing you may read matches."

**Try it on the demo**
Sign in as Sales and search "Ald". It finds Aldergate Care Group Limited under **Organisations**. It finds its main
site under **Properties**. **What was searched** shows "Invoices — number — not searched: not yours to read". As
Accounting, search "CB-000001". You get "CB-000001 Dunmarrow Medical Practice Limited · CR-2026-0004". The start of a
number, "CB-0", lists CB-000001, CB-000002 and CB-000003. As the surveyor, search "Dun". You get only the Dunmarrow
property, with "searched, the ones your own survey jobs reach".

**Check yourself**
- *Can you find text inside an uploaded lease?* — No. Document text is never searched.
- *Why does Sales not find invoice numbers?* — Invoices are not Sales' to read.
- *Accounting types "CB-0". What comes back?* — Every invoice whose number starts that way. Sales, which may not read invoices, gets none.

---

### Training — `B42` lists, saved views and export

**Where things are on the page.** On Claims and Leads, there is a panel called **Filter, sort and save**. It sits
beside the list, or above it on a phone. It holds the saved views and the export link. Some column headings are
underlined. Press one for a quicker way to choose the order. It keeps every filter and changes only the order. The
heading in use says "— sorted".

**What it is for**
The **Claims** and **Leads** lists. You can filter them and sort them. You can save named views to come back to. You
can export a CSV file of exactly what you may read.

**Who can open it**
- **Claims** list: all four staff roles. Each sees only the rows and columns it may read.
- **Leads** list: Admin and Sales. Accounting and Surveying are refused.
- Export: Admin, Sales and Accounting. Accounting can export claims only. Surveying is refused.

Address: `/staff/claims` · `/staff/leads` · export: `/staff/claims/export.csv`

**How to do the common job**
1. Open **Claims** and **Filter, sort and save**.
2. Choose filters. You can use **Owner**, **Stage**, **Where it stands**, **Source**, **Sector** or **Jurisdiction**. You can use the opened dates. Admin and Sales can also use **Estimated value at least, £**. Choose an **Order**.
3. Press **Show**. The line under the form says how many of the rows you may read are shown.
4. To keep it, type a name in **Save these filters as** and press **Save view**. It appears under **Saved views**; **Retire** removes it.
5. Click **Export these N rows as CSV**. The file has only your columns, and the export is recorded.

**What it will refuse, and why**
- A filter or order the list does not offer is ignored. The page names it. For a filter it says "colour: not a filter this list offers, so it was not applied". For an order it says "Sort: not one of the orders offered".
- A view with no name: "Give the view a name of up to 120 characters."
- Exporting as a surveyor: refused.
- A cell may begin with =, +, - or @. The export makes it safe, so a spreadsheet never runs it.
- A filter on a column you cannot read is not applied to the file. The export's record names it. Take Accounting on `/staff/claims?stage=SURVEY`. Beside the link it says "The file does not apply stage — your role does not see those columns."

**Try it on the demo**
As Sales, show **Stage** = Survey: "3 shown". Add an unknown filter by hand (…&colour=red). The page names it as not
applied. Save the view "Claims at survey". **Saved views** shows "Claims at survey — yours" with **Retire**. Now
export. Sales' file starts with this line:
`Reference,Client,Property,Workstream,Stage,Owner,Priority,Next action,Next action due,Expected completion,Opened,Estimated value — the figure shown`.
Accounting's starts `Reference,Client,Opened`. The surveyor is refused.

**Check yourself**
- *Why doesn't Accounting see a Stage filter?* — It cannot read the stage. Its filters are dates and order.
- *Does retiring a view delete it?* — No; it is retired, never deleted.
- *Can an export include the value for Accounting?* — No; only columns the page would show you.

---

### Training — `B43` admin settings

Address: /staff/admin-settings

**What it is for.** It keeps the pick-lists staff choose from. These are lead sources, priorities, task types, property types and introducer types. It also keeps the two reason lists. It shows the other settings in one place, to read but not change. It also names everything no setting may ever change.

**Who can open it.** Admin and Sales can read it. Only Admin changes it. Accounting, Surveying and clients are refused. When Sales asked to change a setting, the answer was "not authorised".

**How to do the common job**
**Where things are.** Choose a section from the list down the left. There is one for each pick-list and each reason list. Then come summaries of other settings:
- **Document types**
- **Automation rules**
- **Email templates**
- **Finance settings**
- **Compliance settings**

Last comes **What a setting may not change**. Only the section you choose shows. After a save, the page opens on the list you saved in.

1. **Relabel:** change the label box on the value's row and press **Save**.
2. **Retire:** change the state to "retired" and press **Save**. The value stays on old records but is no longer offered.
3. **Add:** under the list, type a "Code" and a "Label". The code uses capital letters, digits and underscores. Then press **Add to …** (or **Add a reason**).
4. Some rows are marked as written by the system. They say "never retired". You can only relabel those.

**What it will refuse, and why**
- Some values are written by the system itself. The system relies on them, so they are never retired.
- Adding a stage: "There are ten steps, each with its own check and ways out. No setting can add, remove or reorder a step."
- Any item under "What a setting may not change" is refused. That is the last section. Ask for one with **Ask**. You get a page headed "Not a setting", with the reason. The attempt is recorded. Some things belong to their owners, not to whoever holds the admin login. These are the steps' checks, tax adviser switches, fee switches and role boundaries. The page says "If you ask to change one, the system says no, gives the reason below and records that you asked."

**Try it on the demo**
1. Under Lead sources, set **OUTBOUND** to retired and press Save. *Observed:* its state reads "retired", and the Leads page no longer offers Outbound.
2. Relabel **WEBSITE** to *Our website*. *Observed:* saved, and Leads now shows "Our website". It has no retire option. When forced, it said no. The system writes this value itself, so it is never retired.
3. Under Property types, add Code *HOSPICE*, Label *Hospice*. *Observed:* added, active.
4. Under "Ask to change one anyway", choose **When our fee is earned** and press **Ask**. *Observed:* "Not a setting — Lakhbir decided when our fee is earned: when our report is delivered for filing. This is built in, so no setting can change it."

**Check yourself**
1. *Why can a value be retired but never deleted?* Old records name its code. Deleting it would leave those records pointing at nothing.
2. *Can this page switch on a fee control or a tax adviser's switch?* No. It is refused by name and recorded. Those are code changes for the person who decides.
3. *A lead source was retired by mistake. What do you do?* Set it back to active and save. Nothing was lost.

---

### Training — `B44` the document centre

**What it is for**
One list of every document you may read. It covers every organisation and claim, with the newest version first. Each
row gives the document, its type and its organisation. It gives the claims it is linked to, and its state. It also
gives its newest version and how many versions it has.

**Who can open it**
Admin, Sales, Accounting and Surveying. But each sees only the documents it may open on their own page. Accounting sees
the fee invoice and the signed letter. A surveyor sees the claim evidence of their assigned jobs. A client is refused.
The portal is the client's list.

Address: `/staff/documents`

**How to do the common job**
1. Open **Search** and press **Find a document across every client**. Documents is on no menu. A company's own files
   are on its page, under **Files** (`B47`). If you ask this list for one company alone, it takes you there.
2. Narrow the list with **Type**, **Organisation**, **Claim** and **State**. State can be Received, Not received yet, or Refused. Then choose an **Order**.
3. Press **Show**. The line under the heading starts "All the documents you may open. Showing … of …". It says how many are shown and what was filtered. **Clear** starts again.
4. Open a document by its name to see its versions (`B28`).

**What it will refuse, and why**
- A document you may not open is not on the list at all.
- A choice the list does not offer is not applied. The page says so, for example "Type: not one of the choices this list offers you, so it was not applied".
- It never searches inside files, and there is no export. Under "This page never offers", it names both. Nobody can download all the documents.

**Try it on the demo**
Start with a fresh demo. Nothing has been uploaded yet. Every role's list reads "Showing 0 of 0" and "No document you
may read matches."

Sign in as the client and send a fire risk assessment from the portal (`C6`). Then, as Sales, open **Documents**. It
reads "Showing 1 of 1". The row gives the name "Fire risk assessment 1" and the type. It gives the company, Corvale
Supported Living Limited, and "on no claim". The state is "Received — we have read at least one version". It shows
"version 1 … the client" and a count of 1.

Now choose **Type** Fire risk assessment and **State** Received. Choose **Order** Type, then number. Press **Show**. The
line adds "filtered by type — Fire risk assessment; state — Received …". Sign in as Accounting, or as the surveyor. The
list still reads "Showing 0 of 0".

**Check yourself**
- *Why does Accounting not see the fire risk assessment?* — It is claim evidence. Accounting reads only the fee invoice and the signed letter.
- *Can you find a lease by a word inside it?* — No. The centre lists documents. It never searches their text.
- *Can you download the whole list?* — No. There is no export of documents, for anyone.

---

### Training — `B45` the audit log

**What it is for**
The record of what happened in the system. Each line gives what kind of thing happened, and when. It gives the role and
id that did it, and what it was about. It says whether it was allowed. On every visit, the page checks that nobody has
changed the log.

**Who can open it**
Admin alone. Sales, Accounting and Surveying are refused.

Address: `/staff/audit`

**How to do the common job**
1. Open **Audit log** in the menu.
2. Read the line at the top. It says **Audit log checked — nothing changed**. Or it says **Audit log problem — a record was changed or removed. Tell the Admin now.** It names the record where the problem starts.
3. Choose a **Kind**, such as CLAIM_TEAM_LINKED. Choose an **Outcome**: Allowed, Refused or Error. Press **Show**.
4. Read each line: # · When · Kind · Role · Who (id) · About · Outcome.
5. A developer can check the log without the server. They run `npm run verify-audit` on the database (Part 1, A11).

**What it will refuse, and why**
- Any role but Admin: "not authorised".
- A line's detail is never shown. It is not even read to draw the page. The log holds no name, address, note or amount in any case. The page says "The details of each line are never shown or read here. You see the kind, the ids and the outcome."
- A choice not in the lists is not used. The page says so: "Outcome: not allowed, refused or error, so it was not used".
- There is no edit and no delete. The page says "Opening this page adds a line to the log."

**Try it on the demo**
Do the claim-team exercise in `B17`/`B18` as Sales. Then sign in as Admin and open **Audit log**. It says "Audit log
checked — nothing changed. All … records were checked, each against the one before it."

Choose **Kind** CLAIM_TEAM_LINKED and press **Show**. You see one line: "CLAIM_TEAM_LINKED · SALES · (an id) · claim
(an id) · Allowed". The accountant's name is nowhere on it. Sign in as Sales and open the address. You get "not
authorised".

**Check yourself**
- *The log says a contact joined a claim's team. Which contact?* — The log gives ids, never a name. The claim page says who is on the team.
- *Can Admin correct a wrong line?* — No. Nothing in the log is changed or deleted. A change made outside the system shows as "Audit log problem".
- *How do you know nobody has tampered with it?* — The page checks every record against the one before it. It does this on every visit. Then it says "Audit log checked — nothing changed" or "Audit log problem".

---

### Training — `B46` Settings (Admin)

*We tried these steps on a fresh demo on 21 September 2026.*

**What it is for**
One page for all of Admin's setup. Each tile opens one screen. Each tile says in a line what that screen does. So the
setup screens do not need seven tabs of their own.

**Who can open it**
Admin. It is Admin's last tab, **Settings**. Nobody else gets this page. The screens behind the tiles still open at
their own addresses. Whoever could open them before still can. Sales and Read only may still read four of them:
- the switches;
- the document types;
- the automation rules;
- the email templates.

Address: `/staff/admin`

**How to do the common job**
1. Press the **Settings** tab.
2. Press a tile. There are eight:
   - **Users**, **Switches**, **Document types** and **Automation**;
   - **Email templates**, **Compliance**, **Audit log** and **Introducer fees**.

   **Switches** opens the screen headed Admin settings (`B43`).
3. The **Settings** tab stays marked while you work on that screen. Press it to come back to the tiles.

**What it will refuse, and why**
- Someone who is not Admin opens `/staff/admin`. They see **You cannot open this page**. The tiles are Admin's setup
  work.
- A tile only shows if Admin may open the screen behind it. So no tile leads to a refusal.

**Try it on the demo**
Sign in as Admin and press **Settings**. *Observed on 21 September 2026:* eight tiles, in this order:
- Users. Its line says "Add a colleague, change their role, or stop their sign-in."
- Switches, Document types and Automation.
- Email templates, Compliance and Audit log.
- Introducer fees. Its line says "What we pay firms that send us clients."

Press **Automation**. The page opens, and the **Settings** tab is still marked.

**Check yourself**
- *Where is Admin settings now?* — **Settings** → **Switches**. The screen is the same.
- *Where are your own password and the emails waiting to send?* — In **Your account**, in the menu under your name. It
  used to be called Settings.

---

### Training — `B47` the client's files

**What it is for**
All the files for one company, in folders. It holds every file the company sent us. It holds every file we added. You
can see what the client sent and add your own. You choose if the client sees yours.

**Who can open it**
Admin and Sales. They see every file and can upload. Accounting sees only the files it may read. Those are the fee
invoice and the signed letter. The view-only login can look but not upload. A surveyor works from the survey job
instead. A client uses their own portal.

Address: `/staff/clients/{company}/files` — or press **Files** at the top of the client's page.

**How to do the common job**
1. Open the client and press **Files**. It is the folder button. Its number is how many files you may open.
2. Press a folder: **From the client**, **From Cap Rebate**, **Asked for — still waiting**, or a claim's own folder.
   **Show every file** puts them all back.
3. Read a file's card. It shows the name, who sent it and the date. It also says what we read from it ("We read 3
   pages…").
4. To add a file, go to **Upload a file**. Drop the file on the box, or tap the box and choose it.
   Pick **What is it?** Then pick **Which claim is it for?**, or leave "The whole company". Tick **Let the client see this file**
   only if they should see it. Press **Upload**. The file lands in **From Cap Rebate**, and we have already read it.
5. You can change who sees one of our files later. On its card, press **Let the client see it** or **Hide it from the
   client**.
6. A file over 4 MB goes in pieces first. Under the button you see "Sending your file" and how far it has got. Keep
   the page open until it is done. The client portal works the same way.

**What it will refuse, and why**
- No file: "Choose a file first."
- A kind of file we do not take: "We cannot take that kind of file. Send a PDF, a photo (JPEG or PNG), or a Word or Excel file."
- A file too big: "That file is too big. The most we take is 50 MB."
- A claim of another company: "Choose one of this company’s claims."
- Some logins may not upload. They are Accounting, a surveyor and the view-only login. We refuse them before we
  read anything.

**Why the original says "Read and then deleted"**

We read every file and keep what we need from it. Then we delete the file itself. That is our promise to keep as
little as we can. We have built a way to keep the originals, but it is switched off. Lakhbir has said to keep them for
seven years. Admin, Sales and our privacy officer may see them. The officer must agree first. The
question is:
- *"How long do we keep the files clients upload, and who may open them?"*

If they switch it on, Admin and Sales see **Open the original** on a card. That lasts until the file's time is up. Then the
file is deleted.

**Try it on the demo**
Sign in as Sales. Open Elverton Private Hospital Limited. Press **Files**. It shows 0. Upload any PDF as a **Fire
risk assessment** for the main site. Leave the box unticked. You see "Uploaded. We have read it." A card appears in
**From Cap Rebate**. It reads "Only Cap Rebate can see this". Press **Let the client see it**. You see "The client can
see that file now." Now sign in as Corvale's client and send a lease from the portal. Go back in as Sales. Corvale's
**Files** shows the lease under **From the client**.

**Check yourself**
- *You upload a report and forget the tick. Can the client see it?* — No. The default is no. Press **Let the client
  see it**.
- *Can you open the lease the client sent?* — Not the file itself. We read it and deleted it. The card says what we
  took from it.
- *Where did the Documents menu go?* — A company's files are under **Files** on its page. **Search** finds a document
  across every client.

---

### Training — `B48` emailing a client

**What it is for**
Writing your own email to a client, not just a template. It comes from **Cap Rebate <contact@caprebate.co.uk>**. It is
kept on the company's timeline.

**Who can open it**
Admin and Sales. Other people do not see the **Email** button. The page refuses them too. That means Accounting, a
surveyor, the view-only login and the client.

Address: `/staff/clients/{company}/email`. Or press **Email** beside **Files** at the top of the client's page. You
can also press it on a lead card. You can press it on a claim too, and then that claim is already chosen. From a lead:
`/staff/leads/{lead}/email`.

**How to do the common job**
1. Press **Email**. The page shows who it is **From**. If sending is not on yet it says **"Emails are not being sent
   yet."** Press **Why?** to see what is missing.
2. Choose **To**. The list shows only the company's contacts who have an email address. Anyone left out is named
   below, with the reason. You cannot type an address. Add the person as a contact first.
3. Is it about one claim? Then choose it under **Which claim is it about?** If not, leave "The whole company".
4. Type the **Subject** and the **Message**. You can start from a template. Open **Start from a template**, choose one
   and press **Use this template**. Then change what you like.
5. Tick any files under **Attach files**, up to five. You can only send a file the client can already see. But we
   delete each file once we read it. So no file can be sent yet, and the page says so.
6. Press **Save the email**. The page says **"Saved — emails are not being sent yet."** The email is listed under
   **Emails to** the company. It is on the company's timeline, marked with its claim.

**What it will refuse, and why**
- No contact chosen, or a contact from another company. An email can only go to this company's contacts with an
  email address. The page says "Choose who it is to."
- No subject or no message: "Write a subject." · "Write the email."
- Bank details, or anything that looks like a sort code or account number. Also an invoice, or tipping-off words. Bank
  details are never sent by email from here. Invoices wait for the checks against invoice fraud. The page says so. It
  starts "An email may not carry [what it found]."
- A claim of another company: "Choose one of this company’s claims."
- A company marked do not contact:
  - The page says "You cannot email this company."
  - A save is refused: "This company asked us not to contact them. Nothing was saved."
- A refusal keeps what you typed. You can fix it and save again.

**Why it is not sent yet**
The email service is chosen: IONOS. The mailbox contact@caprebate.co.uk is set up, and Sadique reads it. A test
email reached Lakhbir on 24 September 2026. One thing must still be true first, and it is for Lakhbir to do:
- Name IONOS in the privacy notice and in the engagement letter.

The sending is built. It stays switched off until then. An email saved while it is off will never go out later by
surprise.

**Try it on the demo**
Sign in as Sales. Open Dunmarrow Medical Practice Limited. Press **Email**. Choose a contact and a claim. Type "Your
survey date" and a message. Press **Save the email**. You see "Saved — emails are not being sent yet." Open the
company's **Activity**. It shows "An email to … : “Your survey date” — saved, not sent". It is marked with the claim.
Now type "our sort code is 12-34-56" in a message. You see **Not saved**, and your words are still there. Open the
**Email** page for Fenmoor Nursing Homes Limited. It says "You cannot email this company." Then sign in as Admin. Open
**Admin settings** → **Who emails come from**.

**Check yourself**
- *Can you email someone who is not a contact?* — No. Add them as the company's contact first.
- *Who does the client see the email from?* — Cap Rebate <contact@caprebate.co.uk>. A reply goes there too.
- *You saved an email today. Sending is switched on next month. Will it go out?* — No. Only emails saved while sending
  is on are sent.

---

### Training — `B49` chat with your team and with the client

**What it is for**
One place to talk about a client. You can talk to each other, and the client never sees it. You can also talk to the
client. The client reads and answers in their portal. They can send a file with a message.

**Who can open it**
Admin and Sales, on the client's page, under **Chat**. The client sees only **With the client**. In their portal it is
called **Messages**. A surveyor can read **With the client**, but never **Team only**. They read it on a **Messages**
tab of their survey job. This is only for a company where they have a job. They cannot write on it. Lakhbir decided
this on 22 September 2026. Accounting and the view-only login see neither tab.

Address: `/staff/clients/{company}#chat`. **Team only** is `?chat=team`, and **With the client** is `?chat=client`.
Email replies we could not match: `/staff/replies`.

**How to do the common job**
1. Open the client and press **Chat**. Has the client written something you have not read? Then it opens on **With the
   client**. If not, it opens on **Team only**. A number on a tab is how many messages you have not read.
2. **Team only**: read the yellow line. It says *"Only your team sees this. The client never does."* Type under
   **Write to your team**. If it is about one claim, pick it under **About which claim?** Press **Send to the team**.
   Old notes are here too, with who wrote them and when.
3. **With the client**: type under **Write to {company}**. Pick the claim if it is about one. Press **Send to the
   client**.
   - You see "Sent. The client will see it in their portal."
   - The line under the button says *"We do not email them about it yet."*
   - The email is built. It waits for emails to be switched on (see below).
4. A file the client sent shows under their message. Press it to open the file's page. It is also in **Files**, under
   **From the client**, with **See the message it came with**.
5. **Home** shows a red tile when a client has waited more than one working day for a reply. It reads *"A message
   waiting for a reply · Waiting 2 working days"*. Press it and answer. Then the tile goes.

**Email replies (switched off until the mailbox exists)**

A client may reply to an email we sent from contact@caprebate.co.uk. The reply will then show on **With the client**.
It shows as *"{contact}, by email"*. On the timeline it shows as *"A reply from {contact}"*. Did the email come with a
file? Then the message says so. Choose **What is it?** beside each file and press **Save to Files**.

Some replies we cannot match to a company. It may not answer one of our emails. Or it may come from someone who is not
one of that company's contacts. It then waits on **Email replies to sort**. That is a red tile on Home. Read it. Choose
**Which company is it from?** and press **File it**. We never guess a company from the sender's address alone. A
reply from a company marked do not contact is kept. Nothing is sent back.

**Emails about new messages (switched off until emails can be sent)**

When emails are on, each new message sends one short email to the other side.
- A message from the client emails the company's owner. If it has no owner, it emails everyone in Sales. The email
  says *"A client has sent a new message"*. It has a link to the chat.
- A message from us emails the client's portal login. It says *"You have a new message from Cap Rebate"*. The client
  signs in to read it.

**The email never carries the message itself.** Nothing is emailed to a company marked do not contact. Today nothing is
emailed, and nothing waits to be sent. The line under **Send to the client** says so.

**Old messages are cleaned up after seven years (switched on 22 September 2026)**

Lakhbir set the period: **seven years**. A company with a claim keeps its messages for seven years from the claim's own
date. That date is its accounting period end or our report, whichever is later. A company that never had a claim keeps
them for seven years after its last message. Nothing written today is due before 2033. A file sent with a message stays
in **Files**. Nothing else can delete a message.

**What it will refuse, and why**
- An empty message: "Write a message first."
- A message over 8,000 characters: "That message is too long. The most is 8,000 characters."
- A claim of another company: "Choose one of this company’s claims."
- Writing to a company marked do not contact. The page says "You cannot write to this company." Then it says "This
  company asked us not to contact them. Nothing was sent." The client can still write to us.
- In the portal, a file with no **What is the file?**: "Choose what the file is." What they typed is kept.
- A client may type the address of a message that is not on their own chat. That includes a team message. They get "We
  cannot find that message".
- Nobody can change or delete a message, in either tab. Only the clean-up job can delete an old one, and it is off.

**Try it on the demo**
Sign in as client@example.invalid. Press **Messages**, type "When will you visit?" and press **Send**. Now sign in as
Sales. Open Corvale Supported Living Limited, then **Chat**. It opens on **With the client**, with a **1** on the tab.
Reply "Next Tuesday at ten" and press **Send to the client**. Press **Team only**. Write "Check clause 4 of their
lease" and press **Send to the team**. Go back in as the client. **Messages** shows a **1**. Open it. Your reply is
there, and the team message is not.

**Check yourself**
- *Can the client ever see Team only?* — No. It is kept in a different place. The portal never reads it.
- *Where did the internal notes go?* — Nowhere. They are the Team only chat. A claim page and a property page show their
  own notes under **Team only**. There is a link to the whole chat.
- *Does the client get an email when I reply?* — Not yet. Emails are switched off. They read it in their portal.
- *A client sent a lease with a message. Where is it?* — In their **Files**, under **From the client**. It is also on
  the message.
- *A client wrote on Friday afternoon. When does it turn red on Home?* — On Tuesday. That is after more than one working
  day.

---

### Training — `B50` grants and contributions

**What it is for**
It records if anyone else paid for any of the work on the building. That could be the NHS, a council, a landlord or an
insurer. It records how much they paid and what it paid for. Money from someone else can cut the claim on the items it
paid for. So the claim cannot move on from valuation until two things are done. This question must be answered. Every
grant must be matched.

**Who can open it**
Admin and Sales, on a claim's page, in the box **Grants and contributions**. A surveyor never sees it. Nor do
Accounting or the view-only login. The client never sees this box. But when you press **Not sure**, the client is asked
the question in their portal.

Address: `/staff/clients/{company}/claims/{claim}#claim-grants`.

**How to do the common job**
1. Open the claim and find **Grants and contributions**. At the top it asks **Did anyone else pay for any of this
   work?**
2. Choose **Who told us?**, then press **Yes**, **No** or **Not sure**.
   - **No**: there is nothing else to do. The box says *"Done"*.
   - **Not sure**: this is never taken as No. The client gets a question in their portal. It asks *"Did anyone else
     pay for any of the work on your building?"* The box shows **Asked the client — waiting**. Their answer comes back
     under the company's **Questions for the client**.
   - **Yes**: press **Add a grant or contribution**.
3. **Add a grant or contribution** asks four questions, one on each page:
   **Who paid?** Also say if it was a grant or another payment.
   **How much did they pay, and how do we know?** Leave the amount blank if nobody knows. A blank is never taken as
   nothing.
   **What did it pay for?**
   **Have you matched it to the items it paid for?**
   Press **Next** after each one, or **Back**.
4. **Check it, then save** shows how the card will look. It also says in one line what it does to the claim. For
   example: *"This will reduce the claim on the items it paid for."* Press **Save it**, or **Change** any step.
5. Each grant is then a card. It shows who paid and how much. It has one plain line, such as *"The NHS paid £40,000
   towards the new treatment rooms."* It shows where the figure came from. And it shows **Matched to the items it
   paid for** or **Not matched yet**. The totals above the cards are **Grants in total**, **Matched** and **Not
   matched yet**. An amount nobody knows is counted on its own. The page says *"and 1 with the amount not known"*.
6. To take one off, press **Remove** on its card. Write **Why are you removing it?** and press **Remove it**. It moves
   to **Removed** at the bottom of the box, with your reason. Nothing is deleted.

**What it refuses, and why**
- An answer without **Who told us?** Every fact must say where it came from.
- **Matched** without saying what it paid for. The page takes you back to **What did it pay for?** A grant comes off
  the items it paid for. It is never taken as a share of everything.
- **Remove** without a reason. The record stays in the history. The reason says why it was removed.
- A private person's name. Choose **A private person**. We do not write their name.

**What the line on each card means (Rulebook F)**
- Money from a public body. That is the NHS, a council, Homes England, the GLA or another public body. The line
  reads *"This will reduce the claim on the items it paid for."*
- An insurer. The line says insurance paid out after damage usually does not cut the claim. It ends *"Our tax adviser
  checks."*
- Anyone else. That could be a landlord or a charity. Or a company in the group, or a private person. The line reads *"This may
  reduce the claim on the items it paid for. Our tax adviser checks whether it does."*
- Not known. The line reads *"This may reduce the claim on the items it paid for. We need to know who paid."*

*On the demo, as Sales:* open any claim. Answer **Yes**, with **Who told us?** set to **The client told us**. Add the
NHS paying £40,000 towards "the new treatment rooms", and mark it matched. The box shows one green card. It shows
**Matched £40,000**.

---

### Training — `B51` plain words on every screen

Lakhbir set the aim on 18 September 2026. The back office "needs to be readable at a 12-year-old level and to the
point".

**What it is for**
We rewrote every screen on 22 September 2026. That covers the back office and the portal. Now each one reads at about a 12-year-old level.
That means short sentences and everyday words. It also means no words from our own design notes. **Nothing a role may
see or do changed, and no rule changed** — only the words. This guide was brought into line the same day. So what it
quotes is what you see.

The old design words, and what the screens say now:

<!-- plain-words: quotes-old-words -->
| The old word | What the screen says now |
|---|---|
| fired (a lookup fired) | **looked up** — "3 lookups made", "looked up — we keep the answer and where it came from" |
| tier, tiered | **free or paid** — "not sure if free or paid — treated as paid" |
| provenance | **where this came from** |
| derived | **worked out** — "Worked out by us — not yet approved by the data protection officer" |
| gate | **check** — "Each step is checked before a claim can move on"; the lookups are "not allowed yet" |
| receipt strip, receipt contract | **"we read it, then deleted the file"**; on a document, **What we did with the file** |
| hash, hash chain, the chain | **audit log** — "Audit log checked — nothing changed"; an issued document's hash is its **fingerprint** |
| payload | **the data we sent you** |
| stub, stubbed | **not switched on yet** — "Signing online is not switched on yet" |
| outbox, queued | **emails waiting to send** — "Saved — not sent yet", "Not sent" |
| deletion clock | **When it is deleted** — a date, or **"No deletion date set yet"** |
| UNSET, NOT_COVERED | **"No deletion date set yet"**, **"No due date set yet"**, **"No rule for this yet"** |
| sealed | **locked** — "no open claim has an estimate", "the locked estimate" |
| nought | **£0** — "not counted as £0" |
| qualifying expenditure | **spend that counts** |
| stage not recognised | **stage not known**, **no step set** |
| exit, left the procedure | **stopped**, **ended** |
| YYYY-MM-DD | "a date like 2026-03-31" |
<!-- /plain-words -->

**Unknowns are still said, never shown as £0.** One rule is unchanged: *not known is never counted as nothing*. A
figure, a date or an answer may not be known. The screen still says so in words. For example: "not known yet", "No
deletion date set yet" or "not counted as £0". And not known still passes no check.

**The client's step names are switched on.** Clients now read the plain six in their portal:
- **1 Your estimate**
- **2 Engagement letter signed**
- **3 We research your property**
- **4 Expert sign-off**
- **5 Claim filed**
- **6 Aftercare**

The back office keeps the ten stage names.

**The client's document page is plain too.** It no longer shows a table of twelve steps. Instead it shows these:
**Sent**, **Where it is**, **What it is**, **Kind of file**, **We read it**, **We deleted the file**. It also shows
counts, such as "We read 3 pages." It never shows the file's words.

**Who can open it**
Everybody. This is how every screen reads, for every role and for the client. There is nothing to switch on or off.

**How to do the common job**
1. Use the screens as before. Where this guide quotes a screen, the words now match.
2. An older note, email or training sheet may use an old word. Find that word in the table above. The new word beside
   it is the one on screen.
3. **If you see a word on a screen you do not understand, tell Lakhbir.** That is a fault in the wording, not in you.

**What it refuses, and why**
- Nothing new is refused. Every refusal says the same thing as before, in plainer words. For example: "No rule can
  move a claim. A person moves it, and each step is checked first."
- **A check keeps the old words out.** A developer runs `node 03-app/caprebate-plain-words-check.cjs` with the other
  checks. It reads every screen file. It fails if an old design word comes back into anything a person reads. Staff
  need do nothing.

**Check yourself**
- *An old training sheet names a word from the table. Where are the emails waiting to send now?* — In **Your
  account**, at the foot, under **Emails waiting to send**. Nothing in it has been sent.
- *A retention row says "No deletion date set yet". Does that mean it is kept for ever?* — No. It means no date has
  been set. Nothing is deleted on a date, and nothing is promised kept.
- *A claim has no estimate yet. Is it counted as £0 on Reports?* — No. It is counted on its own, and the tile says so.
- *A screen uses a word you do not understand. What do you do?* — Tell Lakhbir.

---

### Training — `C6` the portal's CRM additions

**"Messages".** The portal has a second tab, **Messages**. It shows a number when we have written something new. That
is something the client has not read. At the top of the portal, the first button is now **Send us a message**. On
**Messages** the client reads what we wrote and writes back. They can choose which claim it is about. They can send
one file with it. They say **What is the file?**, and the file is saved in their documents. Nobody else can read it.
They never see our team's own chat. *On the demo:* sign in as client@example.invalid and press **Messages**. Type
"When will you visit?" and press **Send**. You see "Sent. We will reply here." Now sign in as Sales. Open Corvale, then
**Chat**, then **With the client**. The message is there.

**"What Cap Rebate has done".** Under **Your claims** the client now sees a card. It lists each step we have told them
about, with the date. For example: "✓ Cap Rebate has checked your company details — 21 Sep 2026". Admin may take a
step back. The line then reads "↻ Your company details are being re-checked — since 21 Sep 2026". So a step never just
disappears. A claim's own page shows that claim's steps. Nothing shows until a member of staff presses **Tell the
client**. *On the demo:* sign in as client@example.invalid. The card reads "Nothing yet. We will tick each step off
here as we finish it." Now, as Sales, tell the client the company step (see `B5`/`B6`). Reload the portal. The line
shows, with today's date.


**"Your claims".** The portal's one tab is **Your claims**. The page is headed with the company's name. A **Your
claims** card shows one tile for each claim. Each tile shows the property and its town. It shows how far the claim has
got. It shows the reference in grey. Press the property to open that claim's progress. The steps shown are for that
claim alone. Questions, documents and messages for all the company's claims stay on the main page. A client can only
ever open their own company's claims. Any other address answers "We cannot find that claim". *On the demo:* sign in as
client@example.invalid. **Your claims** shows one tile, **main site**. To see a company with three, sign in as admin.
Open `/portal?business={Elverton's id}`.

**Where things are on the page.** The portal opens with the business's name and three buttons. They are **Send us a
message**, **Book a call** and **Send us a document**. Then come these, in order:
- the **Welcome to Cap Rebate** card, until the client hides it;
- **Where your claim is**, the six steps from **1 Your estimate** to **6 Aftercare**;
- **What we need from you**. This lists each open question and each document we asked for, linked to its form. If
  there is nothing, it says so;
- **What we are working on**, **Your next call** and **New for you**.

Below them are the client's claims, what we have done, and the range. The questions and the documents asked for come
next, but only when there is one. Then come the other parts. **How to contact us** is near the end. On a laptop, the
left-hand menu lists the parts under **Your claims**. Press one to go to it. The menu has the same dark colour and
logo as our home page. The bar at the top of the page shows where the client is, such as **Cap Rebate / Your claims**. **Help** in that
bar opens this section, and the client's name beside it opens **Your account** and **Sign out**.

**What it is for**
The client's claim page gained three things.
- **What we have issued to you**. It lists the items we have issued to the client. It never shows a figure.
- **Documents we have asked you for**. Each request has an upload button.
- **The firm that referred you**. It says if we share progress with that firm. It has a way to stop.

The questions section takes "I don't know" as an answer.

**Who can open it**
The client, on their own organisation only. Staff record answers and share consent on their own screens.

Address: `/portal`

**How to do the common job**
1. Sign in as the client. You land on your claim page.
2. Under **Questions we still need answered**, type an answer or tick **I don't know**. Press **Send this answer**.
3. Go to **Documents we have asked you for**. Drop the file on the box, or tap the box and choose the file. Press
   **Send this file**. The page comes back with "Thank you. We have your file."
4. Under **What we have issued to you**, read what we have issued. Each item shows its version and date.
5. Under **The firm that referred you**, press **Stop telling … how my claim is progressing** to stop sharing.

**What it will refuse, and why**
- A blank answer: **Not saved** — "write an answer, or tick “I don't know”".
- Stopping when nothing is shared: **Not changed** — "Nothing is being shared with that firm, so there is nothing to stop."
- Saying yes from the portal (switched off): "You cannot turn this on from your portal yet. If you would like us to keep the firm informed, tell us and we will ask you properly."
- Using an upload link again: "That link has been used". Nothing is written twice.
- Sending with no file chosen. The browser asks for one first. If it is sent anyway: **Not sent** — "Choose a file first."
- A kind of file we do not take: **Not sent** — "We cannot take that kind of file. Send a PDF, a photo (JPEG or PNG), or a Word or Excel file."

**Try it on the demo**
First sign in as Sales. From Corvale's business page, put a question to Corvale. Then ask for the lease (`B27`).
Next, record a lead by hand for Corvale. Set the source to Accountant and the firm to Quarrendon. Record the client's
answer as Yes. Now sign in as the client:
- Answer "do you own the freehold or hold a lease" with **I don't know**. You see "✓ … answered “I don't know”".
- Upload the lease. You see "Received". The request then says the lease was received, as version 1. It reads
  "✓ Lease, and any licence for alterations — received, version 1".
- **The firm that referred you** reads "Yes — we tell Quarrendon Invented Tax LLP how your claim is progressing".
  Press the stop button. It then reads "No — we tell Quarrendon Invented Tax LLP nothing about your claim."

**Check yourself**
- *The client ticks "I don't know". Is the question closed and forgotten?* — It is answered. But the fact is still
  missing, and must come from somewhere else.
- *Can the client mark a requested document as sent?* — No. The upload itself marks it received.
- *Will a client ever see a figure under "What we have issued to you"?* — No. Issued items carry no figure.

---

### Training — `C11` the public referral form

**What it is for**
A public page. A practice of accountants could refer a client with it. They would not need to sign in. It asks for:
- the practice, and the person's name, email and telephone;
- the client business's name and sector, and its postcode or the first half of it;
- what happened at the property, and the year;
- the practice's word that its client agreed.

**It is switched off.** It stays off until we publish a privacy notice and link it from the form. The notice
"tells a referred client what their firm sent us, why we may keep it, and how to object".

**Who can open it**
Nobody while it is off. When it is on: anyone, without signing in.

Address: `/refer`

**How to do the common job**
1. While it is off, there is nothing to do. Staff record referrals on **Introducers** (`B30`).
2. When it is on, a practice fills in the form. It confirms its client agreed.
3. The form would make a lead of origin Referral. The lead sits on a new firm record. That record is marked as coming
   from the form. It never joins a firm we already have. An Admin can later merge a firm the form made twice.
4. Sales then works that lead like any other (`B19`/`B20`).

*We cannot check the labels on the screen while the form is off. So none are quoted here.*

**What it will refuse, and why**
- While it is off, the address answers just like an address that does not exist.
- When it is on, the page may say these (taken from the code):
  - "Name the client's business — a referral is about an organisation."
  - "Give an email address, so we can reply to the referral."
  - "Confirm that your client has agreed to you passing their business's details to us."

**Try it on the demo**
Do not sign in. Open `/refer`. Then open a made-up address, such as `/no-such-page`. Both answer the same way. They
show the sign-in failure message, "those details did not match". Signed in as Sales, both answer "not found". Sending
the form while signed out gets the same answer as the made-up address. Nothing shows that a form exists.

**Check yourself**
- *A practice says the referral link "doesn't work". Is something broken?* — No. The form is switched off. It is meant
  to look like a missing page.
- *What must happen before it can be switched on?* — We must publish a privacy notice and link it from the form. It
  tells referred clients what their firm sent us.
- *If a firm uses the form twice, is it joined to the firm we already have?* — No. It makes a new firm row, which an
  Admin can merge.

---

### Training — `B52` addresses we cannot email

**What it is for**
Sometimes an email comes back. The mail server says the address does not work. When that happens we stop sending to
that address. Nothing more goes to it. This page lists those addresses, and lets you start again.

**Who can open it**
Admin only. Open **Your account**. The link is under **Administration**.

**How to do the common job**
1. Open **Your account**, then **Addresses we cannot email**.
2. Look at the list. Each row shows four things. The address. The day we stopped it. The code the mail
   server gave. And the subject of the email that came back.
3. **Ring the person or ask a colleague first.** They may have a new address, or they may tell you the one we have
   is right.
4. If the address is fine, press **This address works again**.
5. The page says "Done. We can email that address again."

**What it refuses, and why**
- Nothing is deleted. The email that came back stays on record, and so does the stop. Your lift is a new line under
  them, with your name and the time. That way we can always see what happened and who said what.
- Press the button for an address that was never stopped and nothing changes. The page says "That address was
  not stopped, so nothing changed." That is not a fault. Two people may press the same button. That is fine.
- Only Admin can open this page or press the button.

**What you will see on the other page**
On **Your account**, under **Emails waiting to send**, an email that came back now says so:
- **Came back — that address does not work**, with the code. Nothing more goes to that address.
- **Came back — try again later**, with the code. That one is usually a full mailbox. We try again.

**Check yourself**
- *An email to a client came back. Can I just send it again?* — No. Ask them for the right address first. Then lift
  the old one, or add the new one to their record.
- *I lifted an address by mistake. Have I lost the record?* — No. Nothing is deleted. The stop and the lift are both
  on the list of what happened.
- *Where do I find this page?* — Open **Your account**. Look under **Administration**. The link says
  **Addresses we cannot email**.

---
### Training — `B53` the online identity check

**What it is for**
We check who our clients are. Didit does the check. We send the person a link. They take a photo of their ID and a
selfie on their phone. Didit tells us the result. We keep our own copy of the result. We never get their photos.

**Who can open it**
Admin. It sits in two places. One is the client's page, under **Identity check**. The other is a due diligence check,
under **Online identity check**. Other logins do not see it.

**It is on for testing only**
It is switched on so we can try it. But our privacy notice and our letter do not name Didit yet. So the box says
**Testing only**. Check yourself, or a colleague who agrees. Never check a client until the box has gone. If the box
says **Not ready**, it lists what is missing, such as the keys on the server. We check identity for every client. It
does not wait for the money laundering setting.

**How to do the common job**
1. Open the client's page and find **Identity check**. Or open their due diligence check.
2. Choose **Who to check**. Type their first and last name as they are on their ID.
3. Press **Send an identity check**.
4. The page shows their link. Send it to them yourself.
5. The result shows in the list when it comes back. It says **Passed**, **Failed**, **A person must look at it** or
   **The client did not finish it**.

**If the box says Nobody to check yet**
A check only goes to a contact of this client. This client has none yet. Press **Add a contact** in the box. It takes
you to the **Contacts** part of the same page. Add the person there, then come back and send the check.

**If the box says Records kept in memory**
The test website can forget things. It keeps its records in memory, and it forgets them when it restarts. More than
one copy of it can run at once, too. So a result can reach a copy that never saw the check. That copy turns it away.
If no result shows a few minutes after the person has finished, send the check again. The box goes once the website
keeps its records in a lasting database.

**What happens with a pass**
A pass on a due diligence check fills in **How it was verified**. It says Didit passed them, and the day. You still
finish the check yourself. A pass never finishes it for you.

**What it refuses, and why**
- A result we cannot prove came from Didit. Each result comes signed. A bad signature is refused and logged.
- A result more than five minutes old. It could be an old one sent again, so it is refused too.
- A result for a check we never sent. It is refused too.
- A person who is not a contact of this client. Add them as a contact first.
- A person with no email address or telephone number. We send them the link, so we must be able to reach them. The
  box names them. Add their details under **Contacts** first. Only people we can reach are listed in **Who to check**.
- A result for a check this copy of the website has forgotten. It is refused like any other. It is never matched to
  the nearest check.
- A due diligence check that is finished. Send it from the client's page instead.

**Check yourself**
- *The result says "A person must look at it". Is that a fail?* — No. Didit was not sure. Look at it and decide.
- *The list still says "No result yet", but the client says they started.* — That is right. Didit tells us when they
  start. We only show the answer at the end.
- *Do we keep a copy of their passport?* — No. We keep the result, the kind of ID and its country. Nothing else.

---
### Training — `B55` signing in: your password and your second step

**What it is for**
It keeps our clients' records safe. A password alone is not enough for a staff login. You also give a six-number code
each time. Someone who learns your password still cannot get in.

**Who can open it**
Everyone who signs in. Every staff login must use a second step. A client may choose to, in their portal.

**How to do the common job**
1. Sign in with your email address and password.
2. The first time, choose **An authenticator app on my phone** or **An email**. The app is safest.
3. For the app, scan the picture with Google Authenticator or Microsoft Authenticator. You can type the key instead.
4. Type the six numbers and press **Continue**. You are in.
5. We then show you ten **recovery codes**, once. Save them or print them now. Then press **I have saved them. Continue**.
6. Next time, type the six numbers your app shows, or the ones in the email.
7. To change it, open your name at the top right, then **Your second step**.

**Recovery codes**
A recovery code lets you sign in if you lose your phone or cannot get your email. Each code works once.
- Keep them somewhere safe, away from your phone. A password manager is good. So is a printed copy at home.
- To use one, sign in with your password. Then press **Use a recovery code instead**, and type a code.
- We email you each time one is used, with how many are left.
- With 2 or fewer left, the page after you sign in tells you. Open **Your second step** and press **Make new recovery
  codes**. You get ten new ones, and the old ones stop working.
- We cannot show your codes again. We only keep a scrambled copy.

**If you were given a temporary password**
Sign in with it. You then choose your own password. Use at least 12 characters. A temporary password works for 7 days.

**What it refuses, and why**
- A wrong code. After 5 wrong codes you must sign in again. A wrong recovery code counts too.
- A recovery code used once already.
- A code used once already. Wait for the next one.
- A temporary password more than 7 days old. Ask your administrator for a new one.
- Turning the second step off, for staff. Only a client can turn it off.

**Check yourself**
- *I lost my phone. What now?* Use a recovery code. Then make new codes, and set up your new phone. No codes left? Ask
  your administrator. They can reset it. Then you set it up again.
- *I have used 8 of my 10 codes. What now?* Press **Make new recovery codes** on **Your second step**.
- *I forgot my password. What now?* Press **Forgotten your password?** on the sign-in page. We email you a link.
- *Does the email code work on the test website?* Not yet. Emails are not sent there. Use the authenticator app.

---
### Training — `B54` roles you make

**What it is for**
We have four roles of our own: Admin, Sales, Accounting and Surveying. Some people need a mix. Here the super admin makes a new
role. You choose what it can see and do.

**Who can open it**
The super admin only. Open **Users**, then **Make or change a role**. The address is `/staff/admin/roles`.

**How to do the common job**
1. Press **Make a role**. Give it a name.
2. The things a role can do are grouped by area, like **Money** or **Claims**.
3. For each one, choose **No**, or which of our roles to copy. For example, **Like Accounting**.
4. Press **Make the role**.
5. Go back to **Users**. The new role is in the list of roles. Give it to a person.

**How the choices work**
Each choice works just as it does for the role you copy. So "See a survey job, like Surveying" means only the jobs
given to that person.

**What it refuses, and why**
- A role that can survey and also see our estimate. The surveyor never sees the estimate.
- Adding people, giving roles or making roles. Only the super admin does those.
- A name we already use.
- Retiring a role someone still has. Give them another role first.
Each refusal is one plain sentence. It is also kept in the audit log.

**Changing and retiring**
Open a role to change it. Everyone with it signs in again. **Retire this role** stops it being given again. It is
kept, so the audit log still makes sense.

**Check yourself**
- *Can I change what Sales can do here?* — No. Our own roles stay as they are. Make a new role instead.

---
### Training — `B55` Accounting's clients page

**What it is for**
Accounting raises our invoices, chases them and records payment. The **Clients** tab shows what it needs for that.

**Who can open it**
Accounting sees this page. Admin and Sales see the full client page instead.

**What you see**
The list shows each client with something to bill. It shows how many claims wait for an invoice. It shows what is
owed, how much is late, and when you last chased. Open a client to see:
- **Who to contact**, with email and phone.
- **Waiting for an invoice**, with our fee and your task.
- **Invoices**, with what is owed, when it is due, and every chase.

**How you are told to raise an invoice**
When a claim reaches the invoice step, you get a task. It says "Raise the invoice for this claim". The claim also
shows under **Waiting for an invoice**.

**How to chase an invoice**
1. Open the client. Find the invoice.
2. Chase them in the usual way, by phone or email.
3. Fill in the day and how you chased. Add a short note if it helps.
4. Press **Record the chase**.

**How to record a payment**
Open the invoice from the client page. Record the money received there, as before.

**What it refuses, and why**
- Chasing a paid invoice. Only money still owed can be chased.
- A chase dated after today.
- Nothing is sent for you. A chase is something you did. We do not email reminders yet.

**Check yourself**
- *Can Accounting read the client's notes?* — No. This page shows billing only.

---
### Training — `B56` the address question and the research panel

**What it is for**
The client types their address in the online questions. Two new things sit there. Both are switched off today.

**The postcode check**
When it is on, we check the postcode on our own server. The line under the address says where the postcode is. If
the check fails, nothing changes. The client just types their address, as now.

**Answer it myself**
When the lookups are on, the client can tick a box. It says they will answer the property questions themselves.
Then we do not look them up in public records. The research panel says so for each free lookup: "Not looked up".
Ask the client those questions instead.

**Who signed the letter**
When the lookups are on and the letter is signed, the research run checks who signed. It looks at Companies House
and the care regulator. The panel says **Yes**, **No** or **Not checked**.
- **Yes** means the register lists them as someone who can sign, such as a current director.
- **No** means the register does not list them that way. It is not a warning. You can ask the client.
We never keep the names we read. The client never sees this line.

**The site area**
The research run also finds the size of each site. It uses the Land Registry's land boundaries. The panel has a
line for each property, starting **Site area**. It says the area, or why there is none yet. It may be switched off, or
waiting for the letter or the privacy notice. It may need a point or a council. You add those on the property page.
The area is for our own checks. It does not go in a client report.

**Check yourself**
- *The panel says "Not looked up" for every free lookup. Is something broken?* — No. The client chose to answer
  the questions themselves.

---
