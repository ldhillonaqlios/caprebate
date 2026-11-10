# Cap Rebate — the target structure

Written 6 November 2026, after the ITRoadway audit (2 Nov 2026) and Lakhbir's question: "the ability for the
structure to allow us to make a change on one thing without breaking others". This is the structure the phases from
161h onwards build towards, all of them before go-live. Each rule below has a check that enforces it, so the structure cannot drift back.

## 1. Where we are (measured 6 November 2026)

| What | Today |
|---|---|
| Code | 289 TypeScript files, 114,559 lines in `09-app/backend/src`; 214 files (84,000 lines) in one folder, `src/web` |
| The tangle | 43 business files (CRM, claims, portal, survey, finance, assessment and more) all reach each other through imports; 25 pairs import each other |
| Crossings | 385 of 1,925 imports cross from one business area to another; CRM and the portal depend on each other both ways, and so do claims and survey |
| Database calls | One gate (`src/core/db.ts`), but SQL is written in 105 files; the `claims` table is touched from 52 files, `users` from 69 |
| Database | SQLite (Node's built-in driver locally, libsql/Turso on the website): 122 migrations, 197 tables, 441 triggers that guard the workflow rules |
| Central files | `router.ts` (2,663 lines, 79 imports), `staff.ts` (60), `authz.ts` (130 actions in one table), `assets.ts` (all the CSS, the most edited file) |
| Rules | Tax "readings" and switches are constants in code; a rulebook's version is only a filename; the engine package has never left version 0.1.0 |
| Tests | 218 files, about 137 build the whole app on a real in-memory database; 120 are named by build phase, not by feature |

What already works and stays: the claim calculator is its own package, reached through one file
(`src/shared/engine.ts`), and the website's copy is built from it and checked. `db.ts` is the only place SQL runs, and
`lint-sql` refuses SQL built from strings. `connectors/http.ts` is the only file that calls the network. `app.ts` builds
everything from what it is given, so the whole app runs in memory in a test. `authorise()` is the one permission check.

## 2. The decisions

### Hosting: Vercel (decided 6 Nov 2026)
Two projects from one repository: the **test** website (deploys every merge to `main`) and the **live** website
(released only by a deliberate promote, on the Pro plan). Every pull request gets its own preview and GitHub's
fresh-copy check before it can merge. A bad release is rolled back in one click. Phase 161h builds the live project.

### Database: stay with SQLite, on Turso, in the EU or UK
**Keep the SQLite dialect and Turso for go-live; do not move to Postgres.** Moving would mean rewriting 441 triggers,
the 122 migrations and every one of the 524 database calls (Postgres drivers answer later, so each call changes shape),
and re-proving thousands of tests. That is the single change most likely to break everything at once, which is the
opposite of what we want. The live database is a new Turso database in London if Turso offers it there, otherwise
Ireland (Phase 161h, 7 Nov 2026: Turso's servers answer London from Ireland and no London or Paris place was found; an
EU place UK law treats as adequate, for the data protection officer to confirm: Word question 291). Backups: Turso's own
restore points plus a nightly encrypted copy kept elsewhere (Phase 161h).

**When to look again:** only if Turso cannot meet the data protection officer's checks (where data is held, backups,
terms), or the business outgrows a single database. Then the step is Postgres in London (Neon or Supabase both offer
it). Because section 3 puts every table behind its own module's data file, that move would then touch the data files
only, one module at a time.

### Code: one application, split into modules with walls between them
Not microservices: one application, one database, one deploy, which is simpler to run and to test. Inside it, each
business area is a module with a front door, and a check refuses any route round the door.

## 3. The structure

```
09-app/backend/src/
  app/           the start-up wiring (Phase 161l): server, router shell, back-office pages, timers, seed, command line
                 (it may import every front door; nothing imports it)
  core/          config, database gate (db.ts), sign-in, permissions, audit log, secrets
  shared/        page templates, components, dates, PDF, ZIP, plain-words helpers  (no business logic)
  integrations/  every outside service (connectors/, the email sender)             (no business logic)
  modules/
    public-site/  assessment/  portal/  clients/  crm/  claims/  survey/  finance/  compliance/  admin/
                  (clients/ is the client record low in the order; crm/ is its screens and pipeline, near the top)
      each one:
        index.ts        THE FRONT DOOR: the only file another module may import
        routes.ts       its addresses, registered with the router shell
        pages/          its screens (HTML only: no SQL, no tax rules)
        logic/          its rules and decisions (no HTML, no SQL: plain functions, easy to test)
        data.ts         the ONLY file that reads or writes its own tables (the audit's leads.repo.ts)
        actions.ts      its permissions (the audit's leads.permissions.ts), added to authz by the module
        events.ts       what it announces ("claim signed") and what it listens for
        test/           its own tests, plus contract tests for its front door
  styles/        real CSS files
09-app/engine/   the claim calculator package, versioned (see rule 6)
```

### The seven rules, each with its check

1. **Front doors only.** A module imports another module only through its `index.ts`. *Check:* the boundary check
   (built in Phase 161h1) reads every import with the TypeScript compiler, as `lint-paths` already does.
2. **One way only.** Modules depend on each other in one direction, written in `architecture/modules.json` as the
   `order` (Phase 161l, 9 Nov 2026), from the bottom up:
   `shared` ← `core` ← `integrations` ← `clients` ← `assessment` ← `claims` ← `survey` ← `finance` ← `compliance` ←
   `admin` ← `crm` ← `portal` ← `public-site` ← `app`. An area imports only areas below it. `clients` (Phase 161l1) is
   the client record (organisations, contacts, leads, bookings, tasks, messages: the CRM's tables and their plain
   rules), placed low so the modules that read a client need not import the CRM's screens, which sit near the top. `shared` is at the bottom because it
   is plain tools (no sign-in, no SQL) that the core's own pages are drawn with; `app` (`src/app/`) is the start-up
   wiring at the top (the server, the router shell, the staff pages' dispatch, the timers, the command line, the seed),
   which may import every area and which nothing imports. When a lower module needs to tell a higher one something
   (the letter was signed, so the client's stage moves on), it **announces an event** (`src/core/events.ts`: in the
   same transaction as the change, written to the audit log, a failing listener undoing the change) and the other module
   listens; when it needs to ask one something, it owns a small **port** the higher module fills as its front door loads
   (the menu's `provideNav`, the outbox's do-not-contact check; since Phase 161l1 also who holds a survey job in the core, the automation runner in `clients`, the pipeline's gate needs and the clients list in `claims`, the fee trigger in `finance` and the surveyor's thread panel in `survey`, each filled by the CRM's or the survey's door). It never imports upwards. *Check:* the boundary check
   counts every pair of areas where one imports another above it.
3. **Each table has one owner.** Every table belongs to one module (a list kept beside the migrations), and only that
   module's `data.ts` runs SQL on it. Others ask through its front door. *Check:* the boundary check reads the SQL text
   and the table list.
4. **Screens hold no rules and no SQL; rules hold no HTML and no SQL.** *Check:* `pages/` may not import `data.ts`
   or `db.ts`; `logic/` may not import `html.ts` or `db.ts`.
5. **The database still guards itself.** The workflow triggers stay (they stop bad data whatever the code does), and
   each new trigger belongs to the module that owns its table.
6. **Rules are versioned, and a result says which version made it.** Every tax reading and switch has an id, a
   version, a date it takes effect from, and who approved it, in one register per module. The engine package's version
   goes up with every change to the calculator (a check fails a calculator change without a new version). A sealed
   estimate, a pack and a report record the engine version and the rules versions they used, so changing a rule never
   quietly changes an old result: old claims keep their figures, and a re-run says what changed. *Check:* tests for each
   rule both ways (on and off), and a test that every sealed result carries its versions.
   **Built by Phase 161m (10 Nov 2026).** Each area that holds rules has a register, `logic/rules.ts` (shared, core,
   integrations, clients, assessment, claims, survey, compliance; finance's is empty in code, because its rates are
   already dated settings in its own table): 72 rules, each with an id, a version, the date it takes effect from, who
   approves it and where that stands, its position, the file that reads it and the test that runs it. The money
   readings and the legal readings are data there (the code reads its positions from the register); every other switch
   keeps its words where its code is and the register reads its position. `architecture/rules-lock.json` pins each
   rule's value for each version (written only by `node tools/rules-record.ts`, which refuses a value changed under the
   same version), and `test/rules/rules-register.test.ts` fails a value changed without a new version. The engine's
   version: `09-app/engine/VERSIONS.json` records the calculator's fingerprint for each version and `CHANGELOG.md` says
   what changed; `tools/verify-page.cjs` (section 6) and the back end's test both fail a calculator change without a
   new version. Every sealed estimate, approved pack and invoice writes `versions_json` (the engine's version and the
   version of every rule in its writer's register and the ones below it; migration 122), and every case stamp (a
   report and each other issued deliverable) carries the same in its switch readings. An approved pack's page says
   what has changed since, and why; its figures stay as approved. Admin's Settings has a read-only Rules page.
7. **A change is tested where it lands, then everywhere.** Each module's own tests and its front-door contract tests
   run first; then the full suite, as now. *Check:* GitHub's fresh-copy check, unchanged.

### The ratchet: how we get there without a big bang
**Built by Phase 161h1 (7 Nov 2026).** `09-app/backend/architecture/` holds the map (`modules.json`: every file's area
and kind, and each area's front door), the table owners (`tables.json`) and the baseline (`baseline.json`).
`node tools/boundaries.cjs` (in `npm run check`) measured **2,162 breaks** on the day it started: rule 1, 1,030; rule 2,
92 (all twelve areas sit in one cycle); rule 3, 868; rule 4, 172. `--counts` prints them by area; `--lower` takes off
the ones a phase has removed. **Phase 161i (7 Nov 2026)** moved core, shared and integrations behind their doors: **1,612** (`--rebase`, logged in the baseline's history; rule 1 against those three from 656 to 96). **Phase 161i1 (8 Nov 2026)** gave the core and the outside services their data files (`src/core/data.ts`, `src/integrations/data.ts`) and took every SQL statement out of the three areas' page and logic files: **1,454** (rule 4 for the three at 0; rule 3 against core 96 to 49 and against integrations 94 to 26, every one left a statement that joins a business table, for Phase 161l). SQL the three areas ran on business tables waits in each area's `data-borrowed.ts`, which only gets shorter. **Phase 161j (8 Nov 2026)** moved the public site, assessment, portal, CRM and claims into `src/modules/` behind their doors, each with its `data.ts` and `data-borrowed.ts` and its own `routes.ts` (the router a shell of 663 lines): **606** (rule 4 for the five at 0; rule 1 into them at 0 but for 12 imports where a lower layer names a module's `data.ts`, because a front door would load the whole module into the lower layers; rule 3 against them 466 to 84, nearly all joins across owners, for Phase 161l). The core's, shared parts' and outside services' doors load no business module, and `test/core/load-alone.test.ts` loads every file first on its own. **Phase 161k (9 Nov 2026)** moved survey, finance, compliance and admin into `src/modules/` the same way (`src/web/` is gone), moved the statements other areas had borrowed on their tables to them, and took the last SQL out of every page and logic file: **350** (`--rebase`, logged; rule 4 at 0 everywhere; against the four, rule 1 is 9, imports that name `survey/data.ts`, `admin/data.ts` or the survey's BCIS and costing files directly, eight of them from the lower layers, and rule 3 is 31, joins across owners, for Phase 161l). The tests sit in the same folders as the code, and the specs and guides are in `09-app/docs/`.

**Phase 161l (9 Nov 2026)** wrote the order into the map (rule 2 now counts each pair of areas where one imports another above it, in place of every pair inside the one cycle: `--rebase`, logged, 350 to 293), built the events (`src/core/events.ts`) and the ports, put each module's permissions in its own `actions.ts` (the core's `authz.ts` puts them together; `authorise()` unchanged), moved the start-up wiring into `src/app/`, and took the core, the shared parts and the outside services off the modules: **148** (rule 1: 16, rule 2: 22, rule 3: 110, rule 4: 0; the core and the shared parts are out of the cycle). What is left is the modules' own upward imports and the joins across owners, for Phase 161l1.

**Phase 161l1 (10 Nov 2026)** split the joins across owners wherever the owner sits below (each into the owner's own read through its door, with a test keeping every replaced statement and its rows), and split the CRM: its 27 tables and the services every module used (the client record, the calendar and bookings, video calls, tasks, leads, messages) became a lower area, `clients` (`src/modules/clients/`), and the CRM keeps the screens, so no module imports the CRM any more. The check now decides type-only imports per statement; the one break that uncovered (the core's backup reading the outside services) went by moving the backup into the outside services. **67** (rule 1: 8, rule 2: 15, rule 3: 44, rule 4: 0), for Phase 161l2.

**Phase 161l2 (10 Nov 2026)** took the last 67 to **0** (every rule, and no cycle between areas). Every borrowed file is gone: each statement that joined two owners' tables is now each owner's read through its door, put together in code, with a pin test that keeps the old statement word for word and checks the new reads give its rows on a seeded database with awkward rows added. Files went to the module that owns what they do (the report, its sign-off and the site plan to the survey; who claims and the allowance comparison to the claims; the VAT monitoring to finance; the desk-first reading and the grant checks to the survey; the legal register, the complaint forms and the words no email may carry to compliance; the client page's layout, Home's rows and the enquiry inbox to the CRM), and small parts moved down to their only reader (the look-again helpers, one way in for a file and the filing route to the claims). Seven tables changed owner, each to the area that writes it: `document_types`, `fee_discounts`, `signatory_checks`, `client_filing_confirmations` and `client_step_notices` to the claims; `enquiry_checks` and `website_enquiries` to the client record. `claude.ts` is split into the outside services' transport and the claims' document reader, so nothing imports round the outside services' door. The router lends nothing: what a lower module must still ask one above is a named port the lower one owns, filled by the higher door as it loads, refusing by name if it is empty (the claims' `above-ports.ts`, the assessment's `signup-port.ts` and `property-writer.ts`, the client record's `claims-port.ts` and `walkthrough-port.ts`, the CRM's `accountant-port.ts` and `report-acceptance-port.ts`, the portal's `settings-port.ts`, the outside services' `test-lookup-claims.ts`); `src/app/build-app.ts` loads every door, so every port is filled before a request is served. A port is a dependency turned round, not removed: the claims still read the survey's approved versions, now through a door the survey fills. Survey and compliance have their own `routes.ts`, and survey, finance, compliance and admin their permissions files; finance's and admin's addresses are still matched from `src/app/staff.ts`, because moving them would change the order the route list is matched in. The route list is identical.

The boundary check starts by **counting** today's breaks of rules 1 to 4 and writing them to a baseline file. From then
on, any **new** break fails the build at once, and the count may only go down. Each regroup phase moves one group of
modules behind their front doors and brings their count to zero. No phase moves everything at once, and every phase
keeps all tests green, so behaviour never changes while the walls go up.

## 4. The phases

| Phase | What it does | When |
|---|---|---|
| 161h | The live website on Vercel, built and proved on a preview; the database decision above built in | Next, before go-live |
| 161h1 | The module map, the boundary check and its baseline (ratchet on); no code moves | Before go-live, after 161h |
| 161i | core, shared, integrations and styles behind their doors; their count to zero | Before go-live, after 161h1 |
| 161i1 | the data files of core and integrations, no SQL in the three areas' pages and logic, the notes out of their code, their tests by feature, the last three old folders | Before go-live, after 161i |
| 161j | public-site, assessment, portal, CRM and claims as modules; the router split; their count to zero | Before go-live, after 161i |
| 161k | survey, finance, compliance and admin as modules; tests by module; the notes out of the code | Before go-live, after 161j |
| 161l | The tangle undone, part 1: the one-way order written and checked, events, permissions per module, the start-up wiring in `src/app/`, the lower layers off the modules (done 9 Nov 2026) | Before go-live, after 161k |
| 161l1 | The tangle undone, part 2: the joins split by owner where the owner is below, the CRM split into `clients` and its screens (done 10 Nov 2026) | Before go-live, after 161l |
| 161l2 | The tangle undone, part 3: the last joins through the clients door, the pairs that still point up; zero breaks (done 10 Nov 2026) | Before go-live, after 161l1 |
| 161m | Rules as versioned data: the rules registers, the engine's version, versions on every sealed result (done 10 Nov 2026) | Before go-live, after 161l2 |
| 162 | The sweep: every check, and the go-live gate checked | After 161m, out of order |
| 161n | Go live: the gate (Vercel Pro, the ICO number, every legal page approved, the other sign-offs), then the live website switched on and proved | Once its gate is open |
| 162 | The sweep again, against the live website | Before the first client |

**Why this order (decided 6 Nov 2026).** Going live waits on people: the solicitor's and the data protection
officer's approvals, the ICO number and Vercel Pro. None of 161h to 161m (161l1 and 161l2 included) waits on a person, so the code is regrouped
while they work, with no real client on the website. Moving code before there are real clients is safer, the developer
learns the final layout once, and the sweep checks the code we actually launch. Every phase leaves the website working,
so if the gate opens early we finish the phase in progress, run the sweep and go live; the phases left run afterwards,
in the same order.

Since 161m (10 Nov 2026): a change to (say) the claims' fee rules touches the claims' register and its code only; the
boundary check proves no other module reaches inside it; the lock test refuses the change until its version is raised;
old invoices and sealed estimates keep the versions they were made with, and a re-run says what changed.
