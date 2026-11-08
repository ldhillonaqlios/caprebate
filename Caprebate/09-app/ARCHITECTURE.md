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
  core/          server, router shell, config, database gate (db.ts), sign-in, permissions, audit log, secrets
  shared/        page templates, components, dates, PDF, ZIP, plain-words helpers  (no business logic)
  integrations/  every outside service (connectors/, the email sender)             (no business logic)
  modules/
    public-site/  assessment/  portal/  crm/  claims/  survey/  finance/  compliance/  admin/
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
2. **One way only.** Modules depend on each other in one direction:
   `core` ← `shared` ← `integrations` ← `assessment` ← `claims` ← `survey` ← `finance` ← `compliance`, with
   `crm`, `portal`, `public-site` and `admin` on top, reading the others through their front doors. When a lower module
   needs to tell a higher one something (survey finished, so the claim moves on), it **announces an event** and the
   other module listens; it never imports upwards. *Check:* no import cycle between modules.
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
7. **A change is tested where it lands, then everywhere.** Each module's own tests and its front-door contract tests
   run first; then the full suite, as now. *Check:* GitHub's fresh-copy check, unchanged.

### The ratchet: how we get there without a big bang
**Built by Phase 161h1 (7 Nov 2026).** `09-app/backend/architecture/` holds the map (`modules.json`: every file's area
and kind, and each area's front door), the table owners (`tables.json`) and the baseline (`baseline.json`).
`node tools/boundaries.cjs` (in `npm run check`) measured **2,162 breaks** on the day it started: rule 1, 1,030; rule 2,
92 (all twelve areas sit in one cycle); rule 3, 868; rule 4, 172. `--counts` prints them by area; `--lower` takes off
the ones a phase has removed. **Phase 161i (7 Nov 2026)** moved core, shared and integrations behind their doors: **1,612** (`--rebase`, logged in the baseline's history; rule 1 against those three from 656 to 96). **Phase 161i1 (8 Nov 2026)** gave the core and the outside services their data files (`src/core/data.ts`, `src/integrations/data.ts`) and took every SQL statement out of the three areas' page and logic files: **1,454** (rule 4 for the three at 0; rule 3 against core 96 to 49 and against integrations 94 to 26, every one left a statement that joins a business table, for Phase 161l). SQL the three areas ran on business tables waits in each area's `data-borrowed.ts`, which only gets shorter. **Phase 161j (8 Nov 2026)** moved the public site, assessment, portal, CRM and claims into `src/modules/` behind their doors, each with its `data.ts` and `data-borrowed.ts` and its own `routes.ts` (the router a shell of 663 lines): **606** (rule 4 for the five at 0; rule 1 into them at 0 but for 12 imports where a lower layer names a module's `data.ts`, because a front door would load the whole module into the lower layers; rule 3 against them 466 to 84, nearly all joins across owners, for Phase 161l). The core's, shared parts' and outside services' doors load no business module, and `test/core/load-alone.test.ts` loads every file first on its own.

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
| 161l | The tangle undone: one-way order, events in place of the upward imports, permissions per module; no cycles | Before go-live, after 161k |
| 161m | Rules as versioned data: the rules registers, the engine's version, versions on every sealed result | Before go-live, after 161l |
| 162 | The sweep: every check, and the go-live gate checked | After 161m, out of order |
| 161n | Go live: the gate (Vercel Pro, the ICO number, every legal page approved, the other sign-offs), then the live website switched on and proved | Once its gate is open |
| 162 | The sweep again, against the live website | Before the first client |

**Why this order (decided 6 Nov 2026).** Going live waits on people: the solicitor's and the data protection
officer's approvals, the ICO number and Vercel Pro. None of 161h to 161m waits on a person, so the code is regrouped
while they work, with no real client on the website. Moving code before there are real clients is safer, the developer
learns the final layout once, and the sweep checks the code we actually launch. Every phase leaves the website working,
so if the gate opens early we finish the phase in progress, run the sweep and go live; the phases left run afterwards,
in the same order.

When 161m is done: a change to (say) the finance module's invoice rules touches the finance module only; the check
proves no other module reaches inside it; the finance tests run first; old invoices and sealed estimates keep the rules
they were made with.
